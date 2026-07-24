const { withAdminAuth, methodGuard, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const { sendNotification } = require('../_lib/notifyClient');   // ADR-066: the ONE pipeline (main-app /api/notify)
const admin = require('firebase-admin');
/* ADR-117: byte-identical mirror of main-app/data/entitlement-core.js (super-admin deploys from its
   own root and cannot require across it). Regenerate with scripts/sync-entitlement-core.js. */
const entitlement = require('../_lib/entitlement-core');

/* Admin trials are a courtesy, not a tier: bound the duration so a "finite" grant can never become
   de-facto permanent (36500 days would satisfy "has an expiry" while defeating the no-permanent-tier
   rule AND permanently blocking purchase via ALREADY_PREMIUM). */
function _clampTrialDays(v) {
  var n = parseInt(v, 10);
  if (!isFinite(n) || n < 1) n = 1;
  return Math.min(entitlement.MAX_TRIAL_DAYS, n);
}

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

async function handler(req, res) {
  if (methodGuard(req, res, 'POST')) return;

  const body = parseBody(req);
  const { type, action, targetId, trialDays } = body;

  if (!type || !action || !targetId) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'type, action, and targetId are required.' } });
  }

  const VALID_ACTIONS = ['premium_6m', 'premium_12m', 'trial', 'revoke'];
  if (VALID_ACTIONS.indexOf(action) === -1) {
    return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'action must be one of: ' + VALID_ACTIONS.join(', ') + '.' } });
  }
  if (action === 'trial') {
    const _td = parseInt(trialDays, 10);
    if (!trialDays || !isFinite(_td) || _td < 1) {
      return res.status(400).json({ error: { code: 'INVALID_TRIAL', message: 'trialDays (positive integer) is required for a trial grant.' } });
    }
    if (_td > entitlement.MAX_TRIAL_DAYS) {
      return res.status(400).json({ error: { code: 'INVALID_TRIAL', message: 'trialDays must be ' + entitlement.MAX_TRIAL_DAYS + ' or fewer — longer courtesy access should be granted as a 6- or 12-month plan.' } });
    }
  }

  try {
    const db = admin.firestore();
    let querySnapshot;
    const usersToUpdate = [];

    // Target resolution based on type ('bulk' vs 'individual')
    if (type === 'bulk') {
      querySnapshot = await db.collection('users').where('coachingId', '==', targetId).get();
    } else {
      // Single user ID
      const doc = await db.collection('users').doc(targetId).get();
      if (doc.exists) {
        usersToUpdate.push(doc);
      }
    }

    if (querySnapshot) {
      querySnapshot.forEach(doc => usersToUpdate.push(doc));
    }

    if (usersToUpdate.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No users found matching target.' } });
    }

    /* audit C2: each user produces 2 writes (entitlement update + audit log).
       Firestore caps a batch at 500 ops, so a single batch fails for any
       coaching with >250 students. Chunk into ≤200-user batches (≤400 ops)
       and commit sequentially. */
    const CHUNK_SIZE = 200;
    let updatedCount = 0;

    /* v2 grant actions. Trial supports a custom duration (trialDays).
       ADR-117: expiry arithmetic comes from the canonical entitlement core (never-shorten), and the
       user's CURRENT state is now read — previously buildUpdates() took no arguments and wrote
       `now + N days` unconditionally, so a bulk 7-day trial applied to a coaching silently truncated
       every student who had months of PAID premium. */
    const buildUpdates = (userData) => {
      const ud = userData || {};
      const nowIso = new Date().toISOString();
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), planUpdatedAt: nowIso };
      const hasActive = entitlement.isActivePremium(ud);
      const currentExpiry = hasActive ? ud.planExpiry : null;   /* lapsed/absent ⇒ restart from now */

      if (action === 'premium_6m' || action === 'premium_12m') {
        updates.plan = 'premium';
        updates.planType = action === 'premium_12m' ? 'premium_12m' : 'premium_6m';
        updates.planExpiry = entitlement.stackExpiry(currentExpiry, action === 'premium_12m' ? 365 : 182);
        updates.planSource = 'admin';
        updates.isTrial = false;
        updates.trialEnd = null;
      } else if (action === 'trial') {
        const exp = entitlement.stackExpiry(currentExpiry, _clampTrialDays(trialDays));
        updates.plan = 'premium';
        updates.planExpiry = exp;
        if (hasActive && ud.isTrial !== true) {
          /* Extending someone who already holds a PAID/admin entitlement: add the days but never
             relabel them as a trial (that would misreport a paying customer and flip planSource). */
          updates.planType = ud.planType || null;
          updates.planSource = ud.planSource || 'admin';
          updates.isTrial = false;
          updates.trialEnd = null;
        } else {
          updates.planType = null;
          updates.planSource = 'trial';
          updates.isTrial = true;
          updates.trialEnd = exp;
        }
      } else if (action === 'revoke') {
        Object.assign(updates, entitlement.revokeFields());
      }

      return updates;
    };

    for (let i = 0; i < usersToUpdate.length; i += CHUNK_SIZE) {
      const chunk = usersToUpdate.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();

      chunk.forEach(userDoc => {
        const userRef = userDoc.ref;
        /* Per-user: the grant is computed FROM the user's current entitlement so it can only ever
           extend it (the snapshots were already fetched above — no extra read). */
        const updates = buildUpdates(typeof userDoc.data === 'function' ? userDoc.data() : null);

        batch.update(userRef, updates);

        // Log the entitlement change
        const logRef = userRef.collection('entitlementLogs').doc();
        batch.set(logRef, {
          type: type,
          action: action,
          adminId: req.userId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: updates
        });

        updatedCount++;
      });

      await batch.commit();
    }

    // ADR-066: stop the SILENT grant/revoke — tell the affected users through the ONE pipeline (Inbox + push).
    try {
      const affectedUids = usersToUpdate.map(function (d) { return d.id; });
      if (affectedUids.length) {
        const billing = (action === 'revoke')
          ? { title: 'Your Premium was removed', body: 'Your account is now on the Free plan. Reach out if this is unexpected.' }
          : (action === 'trial')
            ? { title: 'Your free trial has started 🎉', body: 'Enjoy full access to AI Coach, Planner, Insights and Math Duels.' }
            : { title: 'Premium activated 🎉', body: 'Your QuantReflex Premium is now active — enjoy the full experience.' };
        await sendNotification({
          recipients: { uids: affectedUids },
          notification: { title: billing.title, body: billing.body, type: action === 'revoke' ? 'premium' : 'premium', category: 'billing', priority: 'high', deepLink: '#settings', sender: { kind: 'admin', id: req.userId, name: 'QuantReflex' } },
          adminUid: req.userId, logSegment: 'entitlement'
        });
      }
    } catch (notifyErr) { console.warn('[entitlements] notification failed (entitlement still applied):', notifyErr.message); }

    await writeAuditLog(db, {
      actorUid: req.userId,
      actorEmail: req.adminEmail,
      action: 'entitlement_' + action,
      category: 'entitlement',
      targetType: type,
      targetId: targetId,
      summary: action + ' applied to ' + updatedCount + ' user(s) (' + type + ': ' + targetId + ')',
      after: { action: action, count: updatedCount }
    });

    return res.status(200).json({ success: true, count: updatedCount, updatedCount: updatedCount });
  } catch (err) {
    console.error('Error mutating entitlements:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
