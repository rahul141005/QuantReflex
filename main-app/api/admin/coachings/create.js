const { withAdminAuth, methodGuard, parseBody, formatError } = require('../../_lib/middleware');
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

function generateCoachingId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function handler(req, res) {
  if (methodGuard(req, res, 'POST')) return;

  const body = parseBody(req);
  const { name, capacity, expiryDate } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Name is required.' } });
  }

  try {
    const db = admin.firestore();
    
    // Generate a unique ID
    let isUnique = false;
    let coachingId;
    while (!isUnique) {
      coachingId = 'QR' + generateCoachingId(); // Example: QRCX9Z2L
      const doc = await db.collection('coachings').doc(coachingId).get();
      if (!doc.exists) isUnique = true;
    }

    const payload = {
      name: name.trim(),
      isActive: true, // Legacy compatibility
      status: 'active',
      capacity: capacity ? parseInt(capacity, 10) : null,
      ownerEmail: body.ownerEmail ? body.ownerEmail.trim() : null,
      entitlementPlan: body.entitlementPlan || 'standard',
      studentCount: 0,
      activePremiumUsers: 0,
      activePremiumPlusUsers: 0,
      expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
      createdBy: req.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('coachings').doc(coachingId).set(payload);

    return res.status(200).json({ success: true, coachingId: coachingId, data: payload });
  } catch (err) {
    console.error('Error creating coaching:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
