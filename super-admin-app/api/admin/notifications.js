const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
const admin = require('firebase-admin');

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

  try {
    const { title, body, segment, coachingId, targetUids } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const db = admin.firestore();
    const messaging = admin.messaging();

    let query = db.collection('users').where('fcmToken', '!=', null);
    
    if (segment === 'premium') {
      // Note: requires composite index on [fcmToken, isPremium]
      // Or we filter in memory if the dataset isn't too huge. Let's do memory filter for now to avoid breaking indexes.
      // Actually, a better query is to just fetch tokens and filter manually in batches for this God-tier pass.
    } else if (segment === 'coaching' && coachingId) {
      query = db.collection('users').where('coachingId', '==', coachingId).where('fcmToken', '!=', null);
    } else if (segment === 'custom' && Array.isArray(targetUids)) {
      if (targetUids.length === 0) return res.status(400).json({ error: 'targetUids cannot be empty' });
      query = db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', targetUids);
    }

    const snapshot = await query.get();
    
    const tokens = [];
    const uidMap = {}; // mapping token -> uid for cleanup
    
    snapshot.forEach(doc => {
      const u = doc.data();
      if (!u.fcmToken) return;

      // In-memory filter for premium (avoids needing a complex index right now)
      if (segment === 'premium' && !u.isPremium && !u.isPremiumPlus) return;
      
      tokens.push(u.fcmToken);
      uidMap[u.fcmToken] = doc.id;
    });

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No valid FCM tokens found for this segment.' });
    }

    // FCM sendMulticast supports up to 500 tokens per call.
    // For God-tier architecture, we chunk them.
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    let successCount = 0;
    let failureCount = 0;
    const tokensToRemove = [];

    const messagePayload = {
      notification: { title, body },
      data: { url: './index.html' }
    };

    for (const chunk of chunks) {
      const response = await messaging.sendEachForMulticast({
        ...messagePayload,
        tokens: chunk
      });
      
      successCount += response.successCount;
      failureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            // Detect stale tokens
            if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
              const badToken = chunk[idx];
              const uid = uidMap[badToken];
              if (uid) tokensToRemove.push(uid);
            }
          }
        });
      }
    }

    // Token Cleanup: Remove stale tokens from Firestore
    if (tokensToRemove.length > 0) {
      const batch = db.batch();
      tokensToRemove.forEach(uid => {
        batch.update(db.collection('users').doc(uid), {
          fcmToken: admin.firestore.FieldValue.delete(),
          fcmTokenUpdatedAt: admin.firestore.FieldValue.delete()
        });
      });
      await batch.commit();
    }

    // Log the broadcast in notificationLogs
    await db.collection('notificationLogs').add({
      title,
      body,
      segment: segment || 'unknown',
      successCount,
      failureCount,
      staleTokensCleaned: tokensToRemove.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      adminUid: req.userId || 'unknown'
    });

    return res.status(200).json({
      success: true,
      sent: successCount,
      failed: failureCount,
      cleaned: tokensToRemove.length
    });

  } catch (err) {
    console.error('Error broadcasting notification:', err);
    const errMsg = err.message || 'Unknown notification error';
    // Provide descriptive error messages for common FCM failures
    let userMessage = errMsg;
    if (errMsg.includes('not-initialized') || errMsg.includes('no-app')) {
      userMessage = 'Firebase Admin SDK not initialized. Check FIREBASE_SERVICE_ACCOUNT env variable.';
    } else if (errMsg.includes('invalid-argument')) {
      userMessage = 'Invalid notification payload. Check title and body formatting.';
    } else if (errMsg.includes('permission') || errMsg.includes('PERMISSION_DENIED')) {
      userMessage = 'Permission denied. Check Firebase service account permissions.';
    } else if (errMsg.includes('sender-id-mismatch')) {
      userMessage = 'Sender ID mismatch. FCM tokens belong to a different Firebase project.';
    }
    return res.status(500).json({ error: { code: 'NOTIFICATION_ERROR', message: userMessage } });
  }
}

module.exports = withAdminAuth(handler);
