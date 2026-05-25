const { withAdminAuth, methodGuard, parseBody, formatError } = require('../_lib/middleware');
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

    const batch = db.batch();
    let updatedCount = 0;

    usersToUpdate.forEach(userDoc => {
      const userRef = userDoc.ref;
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

      if (action === 'premium') {
        updates.isPremium = true;
        updates.hasPaid = true;
        updates.isTrial = false;
        updates.trialEnd = null;
      } else if (action === 'revoke') {
        updates.isPremium = false;
        updates.hasPaid = false;
        updates.isPremiumPlus = false;
        updates.premiumPlusStatus = 'expired';
        updates.isTrial = false;
      } else if (action === 'trial') {
        const days = trialDays || 14;
        const end = new Date();
        end.setDate(end.getDate() + days);
        updates.isPremium = true;
        updates.isTrial = true;
        updates.trialEnd = end.toISOString();
      } else if (action === 'premium_plus_6m' || action === 'premium_plus_1y') {
        const months = action === 'premium_plus_1y' ? 12 : 6;
        const end = new Date();
        end.setMonth(end.getMonth() + months);
        updates.isPremiumPlus = true;
        updates.isPremium = true; // PremiumPlus includes Premium
        updates.hasPaid = true;
        updates.premiumPlusStatus = 'active';
        updates.premiumPlusExpiry = end.toISOString();
        updates.premiumPlusPlan = action === 'premium_plus_1y' ? 'yearly' : '6_months';
      }

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

    return res.status(200).json({ success: true, count: updatedCount, updatedCount: updatedCount });
  } catch (err) {
    console.error('Error mutating entitlements:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
