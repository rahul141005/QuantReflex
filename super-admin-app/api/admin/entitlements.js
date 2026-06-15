const { withAdminAuth, methodGuard, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const { sendNotification } = require('../_lib/notifyClient');   // ADR-066: the ONE pipeline (main-app /api/notify)
const admin = require('firebase-admin');

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
  if (action === 'trial' && (!trialDays || parseInt(trialDays, 10) < 1)) {
    return res.status(400).json({ error: { code: 'INVALID_TRIAL', message: 'trialDays (positive integer) is required for a trial grant.' } });
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

    /* v2 grant actions. Trial supports a custom duration (trialDays). */
    const _expiryAfterDays = (days) => {
      const end = new Date();
      end.setDate(end.getDate() + days);
      return end.toISOString();
    };

    const buildUpdates = () => {
      const nowIso = new Date().toISOString();
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), planUpdatedAt: nowIso };

      if (action === 'premium_6m' || action === 'premium_12m') {
        updates.plan = 'premium';
        updates.planType = action === 'premium_12m' ? 'premium_12m' : 'premium_6m';
        updates.planExpiry = _expiryAfterDays(action === 'premium_12m' ? 365 : 182);
        updates.planSource = 'admin';
        updates.isTrial = false;
        updates.trialEnd = null;
      } else if (action === 'trial') {
        const days = Math.max(1, parseInt(trialDays, 10) || 0);
        const exp = _expiryAfterDays(days);
        updates.plan = 'premium';
        updates.planType = null;
        updates.planExpiry = exp;
        updates.planSource = 'trial';
        updates.isTrial = true;
        updates.trialEnd = exp;
      } else if (action === 'revoke') {
        updates.plan = 'free';
        updates.planType = null;
        updates.planExpiry = null;
        updates.planSource = null;
        updates.isTrial = false;
        updates.trialEnd = null;
      }

      return updates;
    };

    for (let i = 0; i < usersToUpdate.length; i += CHUNK_SIZE) {
      const chunk = usersToUpdate.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();

      chunk.forEach(userDoc => {
        const userRef = userDoc.ref;
        const updates = buildUpdates();

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
