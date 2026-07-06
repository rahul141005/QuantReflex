/**
 * Report domain API (ADR-096) — user-submitted reports (bugs, wrong questions/answers/explanations,
 * feedback, …). withAuth, self-scoped on req.userId. ONE action:
 *   POST ?action=create → validate, rate-limit + dedupe, assemble the doc SERVER-SIDE, write
 *                         reports/{id} + increment questionReports/{signature} (batch), return { shortId, id }.
 *
 * The report is LIVE in Firestore / the Super-Admin Reports dashboard the instant this write commits —
 * there is NO email, NO external notification, NO screenshot/attachment path (ADR-096). The dashboard is
 * the source of truth. Firestore rules deny all client access to `reports`/`questionReports`
 * (allow read,write: if false) — creation is only possible here, via the Admin SDK.
 *
 * All classification input is UNTRUSTED and validated/size-capped in _lib/report-schema.js (pure, tested by
 * scripts/report.check.js). Reporter identity (uid/email/name/plan/coachingId) and priority/status/shortId
 * are assembled server-side — never trusted from the body.
 */

const crypto = require('crypto');
const { withAuth, parseBody, formatError, methodGuard } = require('./_lib/middleware');
const schema = require('./_lib/report-schema');
const admin = require('firebase-admin');
/* Requiring aiService initializes the Firebase Admin singleton (matches account.js). */
const aiService = require('../services/aiService');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

/* Recent-reports lookback for rate-limit + dedupe (covers the daily window; a single indexed query). */
var LOOKBACK_MS = 24 * 60 * 60 * 1000;
var LOOKBACK_LIMIT = 80;   /* > maxPerDay(60) so the day-count is exact; bounded so the read stays cheap */

/* ── ?action=create (POST) ── */
async function _create(req, res, db) {
  const uid = req.userId;
  const body = parseBody(req);

  /* 1) Validate + normalize the untrusted body (pure). */
  const v = schema.validateCreatePayload(body);
  if (!v.ok) {
    return res.status(400).json({ error: { code: v.code, message: v.message, retryable: false } });
  }
  const clean = v.clean;
  const now = Date.now();

  /* Trust the X-Session-Id HEADER over anything in the body (the middleware already validated it against the
     active session). Overrides the body's context.sessionId so it can't be spoofed. */
  const hdrSession = req.headers['x-session-id'];
  if (clean.context) clean.context.sessionId = (typeof hdrSession === 'string' && hdrSession) ? hdrSession.slice(0, 80) : (clean.context.sessionId || null);

  /* 2) Resolve reporter identity SERVER-SIDE (never trust the body). Entitlement via the canonical resolver;
        email/name/coaching from the users doc (best-effort — a missing profile still lets the report through). */
  let plan = 'free';
  try { plan = (await aiService.resolveUserAuth(uid)).plan; } catch (_) { /* default free */ }
  let email = null, name = null, coachingId = null;
  try {
    const uSnap = await db.collection('users').doc(uid).get();
    if (uSnap.exists) {
      const ud = uSnap.data();
      email = ud.email || null;
      name = (ud.profile && ud.profile.name) || null;
      coachingId = ud.coachingId || null;
    }
  } catch (_) { /* non-fatal */ }

  /* 3) Rate-limit + dedupe from ONE indexed query (reporter.uid == uid, createdAtMs >= dayAgo). */
  let candidates = [];
  try {
    const snap = await db.collection('reports')
      .where('reporter.uid', '==', uid)
      .where('createdAtMs', '>=', now - LOOKBACK_MS)
      .orderBy('createdAtMs', 'desc')
      .limit(LOOKBACK_LIMIT)
      .get();
    snap.forEach(function (d) {
      const r = d.data() || {};
      candidates.push({
        id: d.id,
        type: (r.classification && r.classification.type) || null,
        signature: r.questionSignature || null,
        clientKey: r.clientKey || null,
        createdAtMs: typeof r.createdAtMs === 'number' ? r.createdAtMs : 0
      });
    });
  } catch (qErr) {
    /* If the index is still building or the query fails, fail OPEN on rate-limit (don't lose the report),
       but log — the write below still succeeds. */
    console.warn('[report:create] recent-reports query failed (rate-limit skipped):', qErr.message);
  }

  /* Dedupe FIRST (before the rate-limit): an identical (type+signature) within the window, or a repeated
     clientKey (offline retry), collapses into the existing row — we return its ref instead of filing a new
     report. Running this before the rate-limit means an idempotent retry of an already-filed report is
     recognized immediately and never spuriously 429'd once the per-hour cap is reached. */
  const dupId = schema.findDuplicate(candidates, { type: clean.type, signature: clean.signature, clientKey: clean.clientKey }, now, schema.RATE_LIMIT);
  if (dupId) {
    let shortId = null;
    try { const dSnap = await db.collection('reports').doc(dupId).get(); if (dSnap.exists) shortId = dSnap.data().shortId || null; } catch (_) {}
    return res.status(200).json({ success: true, id: dupId, shortId: shortId, duplicate: true });
  }

  /* Rate-limit genuinely-new reports only (dedupe already returned for retries above). */
  const rl = schema.rateLimitDecision(candidates.map(function (c) { return c.createdAtMs; }), now, schema.RATE_LIMIT);
  if (!rl.allowed) {
    return res.status(429).json({ error: { code: rl.code, message: rl.message, retryable: rl.retryable } });
  }

  /* 4) Assemble the doc SERVER-SIDE. With a client idempotency key, use a DETERMINISTIC doc id (uid+clientKey)
        so a CONCURRENT double-submit collapses into ONE row via the transaction's existence check below. The
        pre-query dedupe above only catches SEQUENTIAL retries (a prior attempt already committed + visible to the
        query); the deterministic id + transaction also closes the concurrent race AND the query-fail-open gap. */
  const deterministicId = clean.clientKey ? _safeDocId('ck-' + uid + '-' + clean.clientKey) : null;
  const reportRef = deterministicId ? db.collection('reports').doc(deterministicId) : db.collection('reports').doc();
  const id = reportRef.id;
  const shortId = schema.makeShortId(crypto.randomBytes(6), 4);
  const nowIso = new Date(now).toISOString();

  const doc = {
    id: id,
    shortId: shortId,
    createdAt: nowIso,
    createdAtMs: now,
    updatedAt: nowIso,
    updatedAtMs: now,
    clientKey: clean.clientKey || null,
    questionSignature: clean.signature || null,
    reporter: {
      uid: uid,
      email: email,
      name: name,
      plan: plan === 'premium' ? 'premium' : 'free',
      coachingId: coachingId
    },
    classification: {
      type: clean.type,
      subReason: clean.subReason,
      title: clean.title,
      description: clean.description,
      priority: clean.priority,
      fields: clean.fields
    },
    lifecycle: {
      status: 'open',
      assignedTo: null,
      assignedToEmail: null,
      resolvedAt: null,
      resolvedBy: null,
      duplicateOf: null,
      labels: [],
      internalNotes: []
    },
    context: clean.context,
    question: clean.question,  /* null unless source is 'drill' or 'ai_explain' */
    ai: clean.ai,              /* ADR-097: AI explanation metadata (explanation text + promptId), else null */
    learn: clean.learn         /* ADR-100: Learn topic metadata (topicId/title/category/subject/…), else null */
  };

  /* 5) Write reports/{id} (+ bump questionReports/{signature}) in ONE transaction. Spark has no Firestore
        triggers, so the aggregate is maintained here in the request path. The transaction:
        (a) when the id is deterministic, re-checks existence FIRST so a concurrent same-clientKey submit
            collapses into one row (and can't double-count the aggregate) — atomic, unlike the pre-query dedupe;
        (b) reads the aggregate so first-seen fields (firstAtMs, sampleReportId) are written EXACTLY once. */
  try {
    const aggRef = clean.signature ? db.collection('questionReports').doc(_safeDocId(clean.signature)) : null;
    if (deterministicId || aggRef) {
      const txOut = await db.runTransaction(async function (tx) {
        /* reads first (Firestore requires all reads before writes) */
        if (deterministicId) {
          const existing = await tx.get(reportRef);
          if (existing.exists) { const ed = existing.data() || {}; return { existed: true, shortId: ed.shortId || null }; }
        }
        let agg = null;
        if (aggRef) {
          const aggSnap = await tx.get(aggRef);
          const prev = aggSnap.exists ? (aggSnap.data() || {}) : {};
          const prevReasons = prev.topReasons || {};
          agg = {
            signature: clean.signature,
            count: (typeof prev.count === 'number' ? prev.count : 0) + 1,
            openCount: (typeof prev.openCount === 'number' ? prev.openCount : 0) + 1, // created 'open'; admin resolve decrements
            firstAtMs: typeof prev.firstAtMs === 'number' ? prev.firstAtMs : now,      // set once, never overwritten
            lastAtMs: now,
            sampleReportId: prev.sampleReportId || id,                                  // set once
            lastReportId: id,
            category: (clean.question && clean.question.category) || prev.category || null,
            subtype: (clean.question && clean.question.subtype) || prev.subtype || null,
            topReasons: Object.assign({}, prevReasons, (function () { var o = {}; o[clean.type] = (typeof prevReasons[clean.type] === 'number' ? prevReasons[clean.type] : 0) + 1; return o; })()),
            updatedAt: nowIso
          };
        }
        tx.set(reportRef, doc);
        if (aggRef) tx.set(aggRef, agg, { merge: true });
        return { existed: false };
      });
      if (txOut && txOut.existed) {
        console.log('[report:create] idempotent clientKey hit for', uid);
        return res.status(200).json({ success: true, id: id, shortId: txOut.shortId, duplicate: true });
      }
    } else {
      await reportRef.set(doc);
    }
  } catch (wErr) {
    console.error('[report:create] write failed for uid', uid, ':', wErr.message);
    return res.status(500).json({ error: { code: 'REPORT_WRITE_FAILED', message: 'Could not save your report. Please try again.', retryable: true } });
  }

  /* FUTURE SEAM (ADR-096): this is the single, documented insertion point where a future email / push /
     notify hook could fire (e.g. alert admins of a critical report). Intentionally NOT implemented in v1 —
     the report is already live in the Super-Admin dashboard, which is the source of truth. */

  console.log('[report:create] filed', shortId, '(' + clean.type + ') by', uid);
  return res.status(200).json({ success: true, id: id, shortId: shortId });
}

/* Firestore doc IDs can't contain '/' and must stay well under the 1500-byte cap; a signature is
   category|subtype|hash or a raw question id. Replace '/' and cap length so questionReports/{signature}
   never throws. (The full signature is also stored as a field, so this id is only the key.) */
function _safeDocId(sig) {
  return String(sig).replace(/\//g, '_').slice(0, 300);
}

async function handler(req, res) {
  const db = admin.firestore();
  const action = req.query.action || '';
  try {
    if (action === 'create') {
      if (methodGuard(req, res, 'POST')) return;
      return await _create(req, res, db);
    }
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown report action: ' + action } });
  } catch (err) {
    console.error('[Report API] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

/* Own rate-limit bucket (ADR-099) so report bursts and the user's AI calls never 429 each other; the real
   throttle is the domain limiter in _create (15/hr, 60/day). */
module.exports = withAuth(handler, { rateLimitClass: 'report' });
