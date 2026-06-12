const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
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

/** Safely convert any timestamp to ISO string */
function _safeTS(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') { try { return val.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof val === 'string') { var d = new Date(val); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if (val instanceof Date) { return isNaN(val.getTime()) ? null : val.toISOString(); }
  if (typeof val === 'number' && isFinite(val)) { return new Date(val < 1e12 ? val * 1000 : val).toISOString(); }
  if (typeof val === 'object' && val._seconds != null) { try { return new Date(val._seconds * 1000).toISOString(); } catch (_) { return null; } }
  return null;
}

function generateCoachingId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function handler(req, res) {
  const action = req.query.action || 'list';
  const db = admin.firestore();

  try {
    if (action === 'list' && req.method === 'GET') {
      const snapshot = await db.collection('coachings').orderBy('createdAt', 'desc').get();
      const coachings = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        coachings.push({
          id: doc.id,
          coachingId: doc.id,
          ...data,
          createdAt: _safeTS(data.createdAt),
          updatedAt: _safeTS(data.updatedAt)
        });
      });
      return res.status(200).json(coachings);
    }

    if (action === 'create' && req.method === 'POST') {
      const body = parseBody(req);
      const { name, capacity, expiryDate } = body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Name is required.' } });
      }

      let isUnique = false;
      let coachingId;
      let registrationToken = 'REG' + generateCoachingId(8);
      while (!isUnique) {
        coachingId = 'QR' + generateCoachingId(); 
        const doc = await db.collection('coachings').doc(coachingId).get();
        if (!doc.exists) isUnique = true;
      }

      const payload = {
        name: name.trim(),
        isActive: true,
        status: 'active',
        capacity: capacity ? parseInt(capacity, 10) : null,
        ownerEmail: body.ownerEmail ? body.ownerEmail.trim() : null,
        entitlementPlan: body.entitlementPlan || 'standard',
        studentCount: 0,
        activePremiumUsers: 0,
        activePremiumPlusUsers: 0,
        registrationToken: registrationToken,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        createdBy: req.userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('coachings').doc(coachingId).set(payload);
      await writeAuditLog(db, {
        actorUid: req.userId,
        actorEmail: req.adminEmail,
        action: 'create_coaching',
        category: 'coaching',
        targetType: 'coaching',
        targetId: coachingId,
        summary: 'created coaching "' + payload.name + '" (' + coachingId + ')',
        after: { name: payload.name, ownerEmail: payload.ownerEmail, registrationToken: registrationToken }
      });
      return res.status(200).json({ success: true, coachingId: coachingId, data: payload });
    }

    if (action === 'mutate' && req.method === 'POST') {
      const body = parseBody(req);
      const { coachingId, action: mutateAction } = body;

      if (!coachingId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Coaching ID is required.' } });
      if (!['suspend', 'activate', 'delete'].includes(mutateAction)) {
        return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'Action must be suspend, activate, or delete.' } });
      }
      /* Destructive-action guard (§10B / ADR-022): suspend + delete cascade-revoke premium from EVERY
         enrolled student, so the server requires an explicit confirm token — mirrors users.js purge.
         activate is non-destructive and needs none. */
      if ((mutateAction === 'suspend' || mutateAction === 'delete') && body.confirm !== 'DELETE') {
        return res.status(400).json({ error: { code: 'CONFIRM_REQUIRED', message: 'Pass confirm:"DELETE" to ' + mutateAction + ' this coaching (cascade-revokes premium from all students).' } });
      }

      let beforeStatus = null;
      let newStatusFinal = 'active';
      await db.runTransaction(async (transaction) => {
        const coachingRef = db.collection('coachings').doc(coachingId);
        const doc = await transaction.get(coachingRef);
        if (!doc.exists) throw new Error('Coaching not found');
        beforeStatus = (doc.data() || {}).status || null;

        let newStatus = 'active';
        let isActive = true;
        if (mutateAction === 'suspend') { newStatus = 'suspended'; isActive = false; }
        else if (mutateAction === 'delete') { newStatus = 'deleted'; isActive = false; }
        newStatusFinal = newStatus;

        transaction.update(coachingRef, {
          status: newStatus,
          isActive: isActive,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      if (mutateAction === 'suspend' || mutateAction === 'delete') {
        const usersSnapshot = await db.collection('users').where('coachingId', '==', coachingId).get();
        if (!usersSnapshot.empty) {
          const batches = [];
          let currentBatch = db.batch();
          let count = 0;
          usersSnapshot.forEach((userDoc) => {
            if (count === 500) { batches.push(currentBatch); currentBatch = db.batch(); count = 0; }
            currentBatch.update(userDoc.ref, {
              plan: 'free',
              planType: null,
              planExpiry: null,
              planSource: null,
              isTrial: false,
              trialEnd: null,
              planUpdatedAt: new Date().toISOString(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
          });
          if (count > 0) batches.push(currentBatch);
          await Promise.all(batches.map(b => b.commit()));
        }
      }
      await writeAuditLog(db, {
        actorUid: req.userId,
        actorEmail: req.adminEmail,
        action: mutateAction + '_coaching',
        category: 'coaching',
        targetType: 'coaching',
        targetId: coachingId,
        summary: 'coaching ' + coachingId + ' ' + mutateAction + ((mutateAction === 'suspend' || mutateAction === 'delete') ? ' (students cascade-revoked)' : ''),
        before: { status: beforeStatus },
        after: { status: newStatusFinal }
      });
      return res.status(200).json({ success: true, coachingId, newStatus: mutateAction });
    }

    /* ── details (Coaching-360, ADR-022) — overview + live counts ── */
    if (action === 'details' && req.method === 'GET') {
      const coachingId = req.query.coachingId;
      if (!coachingId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'coachingId is required.' } });
      const doc = await db.collection('coachings').doc(coachingId).get();
      if (!doc.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Coaching not found.' } });
      const d = doc.data();
      let studentCount = (d.studentCount != null ? d.studentCount : null), premiumCount = null;
      try { studentCount = (await db.collection('users').where('coachingId', '==', coachingId).count().get()).data().count; } catch (_) { /* keep denormalized */ }
      try { premiumCount = (await db.collection('users').where('coachingId', '==', coachingId).where('plan', '==', 'premium').count().get()).data().count; } catch (_) { /* needs composite index — best-effort */ }
      return res.status(200).json({
        id: doc.id, coachingId: doc.id, name: d.name || '', status: d.status || (d.isActive === false ? 'suspended' : 'active'),
        ownerEmail: d.ownerEmail || null, capacity: d.capacity != null ? d.capacity : null, entitlementPlan: d.entitlementPlan || null,
        registrationToken: d.registrationToken || null, studentCount: studentCount, premiumCount: premiumCount,
        createdAt: _safeTS(d.createdAt), createdBy: d.createdBy || null, updatedAt: _safeTS(d.updatedAt)
      });
    }

    /* ── students (Coaching-360, ADR-022) — server-side roster (no client fetch-all) ── */
    if (action === 'students' && req.method === 'GET') {
      const coachingId = req.query.coachingId;
      if (!coachingId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'coachingId is required.' } });
      const limit = Math.min(300, Math.max(1, parseInt(req.query.limit || '200', 10)));
      const snap = await db.collection('users').where('coachingId', '==', coachingId).limit(limit).get();
      const students = [];
      snap.forEach(function (doc) {
        const u = doc.data();
        students.push({ uid: doc.id, name: (u.profile && u.profile.name) || u.email || 'Unknown', email: u.email || '', plan: u.plan === 'premium' ? 'premium' : 'free', planExpiry: u.planExpiry || null, accountStatus: u.accountStatus || 'active', lastActive: (u.stats && u.stats.lastActiveDate) || null });
      });
      return res.status(200).json({ coachingId: coachingId, count: students.length, students: students, truncated: students.length >= limit });
    }

    /* ── activity (Coaching-360, ADR-022) — coaching-scoped immutable audit trail ── */
    if (action === 'activity' && req.method === 'GET') {
      const coachingId = req.query.coachingId;
      if (!coachingId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'coachingId is required.' } });
      let logs = [];
      try {
        const snap = await db.collection('auditLogs').where('targetId', '==', coachingId).orderBy('ts', 'desc').limit(30).get();
        snap.forEach(function (doc) { const d = doc.data(); logs.push({ id: doc.id, action: d.action || 'unknown', actor: d.actorEmail || d.actorUid || 'System', summary: d.summary || null, category: d.category || null, timestamp: _safeTS(d.ts) }); });
      } catch (_) { logs = []; }
      return res.status(200).json({ coachingId: coachingId, actions: logs });
    }

    /* ── reset-token (Coaching-360, ADR-022) — rotate the registration token (audited) ── */
    if (action === 'reset-token' && req.method === 'POST') {
      const body = parseBody(req);
      const coachingId = body.coachingId;
      if (!coachingId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'coachingId is required.' } });
      const ref = db.collection('coachings').doc(coachingId);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Coaching not found.' } });
      const newToken = 'REG' + generateCoachingId(8);
      await ref.update({ registrationToken: newToken, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'reset_coaching_token', category: 'coaching', targetType: 'coaching', targetId: coachingId, summary: 'rotated registration token for ' + coachingId });
      return res.status(200).json({ success: true, coachingId: coachingId, registrationToken: newToken });
    }

    return res.status(404).json({ error: 'Coaching action not found' });
  } catch (err) {
    console.error('Error in coaching routes:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
