const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
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
      return res.status(200).json({ success: true, coachingId: coachingId, data: payload });
    }

    if (action === 'mutate' && req.method === 'POST') {
      const body = parseBody(req);
      const { coachingId, action: mutateAction } = body;

      if (!coachingId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Coaching ID is required.' } });
      if (!['suspend', 'activate', 'delete'].includes(mutateAction)) {
        return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'Action must be suspend, activate, or delete.' } });
      }

      await db.runTransaction(async (transaction) => {
        const coachingRef = db.collection('coachings').doc(coachingId);
        const doc = await transaction.get(coachingRef);
        if (!doc.exists) throw new Error('Coaching not found');

        let newStatus = 'active';
        let isActive = true;
        if (mutateAction === 'suspend') { newStatus = 'suspended'; isActive = false; } 
        else if (mutateAction === 'delete') { newStatus = 'deleted'; isActive = false; }

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
      return res.status(200).json({ success: true, coachingId, newStatus: mutateAction });
    }

    return res.status(404).json({ error: 'Coaching action not found' });
  } catch (err) {
    console.error('Error in coaching routes:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
