/**
 * Refund review API (ADR-143) — Super-Admin Refunds section. withAdminAuth.
 *
 *   GET  ?action=list      → refund requests, newest first (server filter: status)
 *   GET  ?action=details   → one request + its payment row + the user + full audit history
 *   GET  ?action=analytics → queue counts by status, oldest pending, needs-manual-review count
 *   POST ?action=decide    → approve | reject
 *
 * THE WORKFLOW (manual by design — the app NEVER issues a refund automatically):
 *   User request → Super Admin review → Provider refund → Provider confirmation → Canonical revocation
 *
 * WHAT APPROVE DOES, AND DELIBERATELY DOES NOT DO
 * Approving marks the request `approved` and nothing else. It changes NO entitlement. It is an
 * instruction to a human: "go and issue this refund in the Razorpay dashboard / Play Console." The
 * entitlement is revoked exactly once, later, when the provider's webhook confirms the money actually
 * moved — through `aiService.revokePayment`, the same canonical path a Google-initiated refund takes.
 *
 * Revoking on approval would look tidier and be wrong: if the refund then FAILED at the gateway, the
 * customer would be left with neither their money nor their Premium, and we would have no signal that
 * it happened. `main-app/scripts/refund-workflow.check.js` T4 asserts this and is mutation-proofed.
 *
 * Every decision appends an auditLogs row (category:'refund') and notifies the user through the ONE
 * pipeline (ADR-066), exactly as admin/entitlements.js does for grants and revokes.
 */
const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const { sendNotification } = require('../_lib/notifyClient');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

/* Enums — inline copy. The super-admin Vercel bundle cannot require across deploy roots, so these are
   LOCKSTEP with main-app/api/_lib/refund-schema.js (asserted by main-app/scripts/refund-workflow.check.js). */
var STATUSES = ['pending', 'approved', 'rejected', 'refunded', 'failed', 'cancelled'];
var OPEN_STATUSES = ['pending', 'approved'];
var NOTE_MAX = 1000;
var PAGE_MAX = 100;
var COLLECTION = 'refundRequests';

function _db() { return admin.firestore(); }
function _clean(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.trim().replace(/\s+/g, ' ');
  var cap = max || NOTE_MAX;
  return s.length > cap ? s.slice(0, cap) : s;
}

/** Recompute time-remaining at READ time so the queue shows a live countdown, while
    `eligibilityAtRequest` (frozen at submit) remains the record of what was true when the user asked. */
function _row(id, d, nowMs) {
  var el = d.eligibilityAtRequest || {};
  var remaining = 0;
  if (typeof el.windowEndsAtMs === 'number' && el.windowEndsAtMs > nowMs) remaining = el.windowEndsAtMs - nowMs;
  return {
    id: id,
    uid: d.uid || null,
    status: d.status || 'pending',
    provider: d.provider || null,
    paymentId: d.paymentId || null,
    orderId: d.orderId || null,
    plan: d.plan || null,
    amountPaise: (typeof d.amountPaise === 'number') ? d.amountPaise : null,
    currency: d.currency || 'INR',
    capturedAtMs: (typeof d.capturedAtMs === 'number') ? d.capturedAtMs : null,
    capturedAtSource: d.capturedAtSource || 'unknown',
    /* What was true when they pressed the button — the only fair basis for a decision. */
    submittedWithinWindow: el.state === 'eligible',
    eligibilityStateAtRequest: el.state || 'unknown_capture_time',
    windowEndsAtMs: (typeof el.windowEndsAtMs === 'number') ? el.windowEndsAtMs : null,
    msRemainingNow: remaining,
    /* The badge: we could not establish a capture time, so the policy refused to decide (ADR-143). */
    needsManualEligibilityReview: d.needsManualEligibilityReview === true,
    reason: d.reason || '',
    createdAtMs: d.createdAtMs || null,
    reviewedBy: d.reviewedBy || null,
    reviewedByEmail: d.reviewedByEmail || null,
    reviewedAtMs: d.reviewedAtMs || null,
    decisionNote: d.decisionNote || null,
    providerRefundId: d.providerRefundId || null,
    providerConfirmedAtMs: d.providerConfirmedAtMs || null,
    outOfBand: d.outOfBand === true
  };
}

async function _count(query) {
  try { const s = await query.count().get(); return s.data().count; }
  catch (_) { const s = await query.get(); return s.size; }
}

module.exports = withAdminAuth(async function (req, res) {
  const action = req.query.action || '';
  const db = _db();
  const nowMs = Date.now();

  try {
    /* ── list ── */
    if (action === 'list') {
      const status = STATUSES.indexOf(req.query.status) !== -1 ? req.query.status : null;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, PAGE_MAX);
      let q = db.collection(COLLECTION);
      if (status) q = q.where('status', '==', status);
      const snap = await q.orderBy('createdAtMs', 'desc').limit(limit).get();
      const rows = [];
      snap.forEach(function (d) { rows.push(_row(d.id, d.data() || {}, nowMs)); });
      return res.status(200).json({ requests: rows, count: rows.length, statuses: STATUSES });
    }

    /* ── details ── */
    if (action === 'details') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Request id is required.' } });
      const doc = await db.collection(COLLECTION).doc(String(id)).get();
      if (!doc.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Refund request not found.' } });
      const d = doc.data() || {};

      /* The payment row and the user, so the reviewer never has to cross-reference by hand. */
      const [payDoc, userDoc] = await Promise.all([
        d.paymentId ? db.collection('payments').doc(String(d.paymentId)).get() : Promise.resolve({ exists: false }),
        d.uid ? db.collection('users').doc(String(d.uid)).get() : Promise.resolve({ exists: false })
      ]);
      const p = payDoc.exists ? payDoc.data() : null;
      const u = userDoc.exists ? userDoc.data() : null;

      return res.status(200).json({
        request: _row(doc.id, d, nowMs),
        history: Array.isArray(d.history) ? d.history : [],
        payment: p ? {
          paymentId: d.paymentId, status: p.status || null, amount: p.amount || null,
          amountSource: p.amountSource || null, currency: p.currency || null, days: p.days || null,
          claimedAt: p.claimedAt || null, capturedAtMs: p.capturedAtMs || null,
          expiry: p.expiry || null, refundedAt: p.refundedAt || null,
          refundWithinPolicy: (typeof p.refundWithinPolicy === 'boolean') ? p.refundWithinPolicy : null
        } : null,
        user: u ? {
          uid: d.uid, email: u.email || null, name: (u.profile && u.profile.name) || null,
          plan: u.plan || 'free', planType: u.planType || null, planExpiry: u.planExpiry || null,
          planSource: u.planSource || null
        } : null
      });
    }

    /* ── analytics ── */
    if (action === 'analytics') {
      const byStatus = {};
      for (let i = 0; i < STATUSES.length; i++) {
        byStatus[STATUSES[i]] = await _count(db.collection(COLLECTION).where('status', '==', STATUSES[i]));
      }
      const needsReview = await _count(db.collection(COLLECTION).where('needsManualEligibilityReview', '==', true));
      /* Oldest still-pending request — the queue's SLA signal. */
      let oldestPendingMs = null;
      try {
        const oldest = await db.collection(COLLECTION).where('status', '==', 'pending')
          .orderBy('createdAtMs', 'asc').limit(1).get();
        oldest.forEach(function (d) { oldestPendingMs = (d.data() || {}).createdAtMs || null; });
      } catch (_) { /* index still building — the tile just shows nothing */ }

      let open = 0;
      OPEN_STATUSES.forEach(function (s) { open += (byStatus[s] || 0); });
      return res.status(200).json({ byStatus: byStatus, open: open, needsManualReview: needsReview, oldestPendingMs: oldestPendingMs });
    }

    /* ── decide (approve | reject) ── */
    if (action === 'decide') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } });
      }
      /* OWNER-ONLY. In this codebase that is exactly what `withAdminAuth` enforces: the super-admin
         app has a single privilege level — the `admin:true` custom claim — and no finer role model
         exists (`_lib/middleware.js` sets only userId/adminUid/adminEmail). So the wrapper above IS
         the owner gate, and the same one already guards the entitlement grant/revoke tools this
         workflow sits beside. Adding a second, invented role check here would reject every real
         caller. If a role model is introduced later, this is the line that narrows. */

      const body = parseBody(req);
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const decision = body.decision;
      const note = _clean(body.note, NOTE_MAX);
      if (!id) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Request id is required.' } });
      if (decision !== 'approve' && decision !== 'reject') {
        return res.status(400).json({ error: { code: 'INVALID_DECISION', message: "decision must be 'approve' or 'reject'." } });
      }
      /* A rejection tells a paying customer no — it must carry a reason for the audit trail and for
         the message they receive. */
      if (decision === 'reject' && !note) {
        return res.status(400).json({ error: { code: 'NOTE_REQUIRED', message: 'A reason is required when rejecting a refund request.' } });
      }

      const ref = db.collection(COLLECTION).doc(id);
      const target = (decision === 'approve') ? 'approved' : 'rejected';
      let before = null;

      /* Transactional so two admins deciding at the same instant cannot both win: the first commit
         takes effect, the second sees a non-pending status and is refused. */
      await db.runTransaction(async function (tx) {
        before = null;
        const snap = await tx.get(ref);
        if (!snap.exists) { const e = new Error('Refund request not found.'); e.code = 'NOT_FOUND'; throw e; }
        const cur = snap.data() || {};
        if (cur.status !== 'pending') {
          const e = new Error('This request is already ' + cur.status + '.');
          e.code = 'ALREADY_DECIDED'; e.currentStatus = cur.status; throw e;
        }
        before = cur;
        tx.set(ref, {
          status: target,
          updatedAtMs: nowMs,
          reviewedBy: req.userId || null,
          reviewedByEmail: req.adminEmail || null,
          reviewedAtMs: nowMs,
          decisionNote: note || null,
          history: admin.firestore.FieldValue.arrayUnion({
            from: 'pending', to: target, actor: 'admin',
            actorId: req.userId ? String(req.userId).slice(0, 128) : null,
            note: note || null, atMs: nowMs, at: new Date(nowMs).toISOString()
          })
        }, { merge: true });
        /* NOTHING ELSE IS WRITTEN. No user document, no payment row, no entitlement. See the header. */
      });

      /* writeAuditLog takes (db, entry) and persists only these keys: category, action, actorUid,
         actorEmail, targetType, targetId, summary, before, after. An invented `details` key would be
         silently dropped, so the decision context goes in `after`. */
      await writeAuditLog(db, {
        category: 'refund',
        action: 'refund_' + decision,
        actorUid: req.userId, actorEmail: req.adminEmail,
        targetType: 'refundRequest',
        targetId: id,
        summary: decision + ' refund for uid ' + before.uid + ' (payment ' + before.paymentId + ')',
        after: {
          uid: before.uid, paymentId: before.paymentId, provider: before.provider,
          amountPaise: before.amountPaise || null,
          submittedWithinWindow: (before.eligibilityAtRequest || {}).state === 'eligible',
          needsManualEligibilityReview: before.needsManualEligibilityReview === true,
          decision: decision, note: note || null,
          /* Stated in the record itself so an auditor never has to infer it. */
          entitlementChanged: false
        }
      });

      /* Tell the user. ADR-066: one pipeline (Inbox + push), never a silent decision. */
      try {
        const copy = (decision === 'approve')
          ? { title: 'Refund approved', body: 'We are processing your refund. Premium stays active until the refund completes.' }
          : { title: 'Refund request declined', body: note ? ('Reason: ' + note) : 'Your refund request was not approved.' };
        await sendNotification({
          recipients: { uids: [before.uid] },
          notification: {
            title: copy.title, body: copy.body, type: 'premium', category: 'billing',
            priority: 'high', deepLink: '#settings', sender: { kind: 'admin', id: req.userId, name: 'QuantReflex' }
          },
          adminUid: req.userId, logSegment: 'refund'
        });
      } catch (notifyErr) {
        console.warn('[refunds] user notification failed (non-fatal):', notifyErr.message);
      }

      console.info('[PaymentFlow] REFUND_' + decision.toUpperCase() + ' | id: ' + id +
        ' | uid: ' + before.uid + ' | paymentId: ' + before.paymentId + ' | by: ' + (req.adminEmail || req.userId));

      return res.status(200).json({
        success: true, id: id, status: target,
        /* Made explicit in the response so the UI can say it out loud rather than implying the refund
           is done: approval authorises, the provider executes, the webhook revokes. */
        entitlementChanged: false,
        nextStep: decision === 'approve'
          ? 'Issue the refund in the provider dashboard. Premium is revoked automatically when the provider confirms.'
          : 'No further action — the entitlement is unchanged.'
      });
    }

    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown refunds action: ' + action } });

  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
    if (err.code === 'ALREADY_DECIDED') {
      return res.status(409).json({ error: { code: 'ALREADY_DECIDED', message: err.message, currentStatus: err.currentStatus } });
    }
    console.error('[refunds] error:', err && err.message);
    return res.status(500).json(formatError(err));
  }
});
