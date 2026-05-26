/**
 * notices.js — Coaching Notice Broadcasting API
 *
 * POST ?action=send  — Send notice to coaching students via FCM
 * GET  ?action=history — Fetch past notices for this coaching
 *
 * Reuses the existing FCM infrastructure.
 * Scoped to students with matching coachingId.
 */

const { withCoachingAuth, formatError, safeTimestamp } = require('../_lib/middleware');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) { console.error('Firebase admin init failed:', err); }
}

async function handler(req, res) {
  const action = req.query.action || 'send';

  try {
    const db = admin.firestore();
    const coachingId = req.coachingId;

    if (action === 'send' && req.method === 'POST') {
      return _handleSend(db, coachingId, req, res);
    }

    if (action === 'history' && req.method === 'GET') {
      return _handleHistory(db, coachingId, req, res);
    }

    return res.status(404).json({ error: 'Unknown notices action' });
  } catch (err) {
    console.error('[Coaching Notices] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

async function _handleSend(db, coachingId, req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { title, body: messageBody } = body;

  if (!title || !messageBody) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  if (title.length > 100) {
    return res.status(400).json({ error: 'Title must be 100 characters or less' });
  }
  if (messageBody.length > 500) {
    return res.status(400).json({ error: 'Message must be 500 characters or less' });
  }

  // Fetch students with FCM tokens for this coaching
  const studentsSnap = await db.collection('users')
    .where('coachingId', '==', coachingId)
    .get();

  const tokens = [];
  const uidMap = {};
  studentsSnap.forEach(doc => {
    const u = doc.data();
    if (u.fcmToken) {
      tokens.push(u.fcmToken);
      uidMap[u.fcmToken] = doc.id;
    }
  });

  if (tokens.length === 0) {
    // Still log the notice even if no tokens
    await _logNotice(db, coachingId, req.userId, title, messageBody, 0, 0, 0);
    return res.status(200).json({
      success: true,
      sent: 0,
      failed: 0,
      cleaned: 0,
      message: 'Notice saved. No students have push notifications enabled.'
    });
  }

  const messaging = admin.messaging();
  const messagePayload = {
    notification: { title, body: messageBody },
    data: { url: './index.html', source: 'coaching', coachingId }
  };

  // Chunk tokens (FCM limit: 500 per call)
  let successCount = 0;
  let failureCount = 0;
  const tokensToRemove = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
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
          if (errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered') {
            const uid = uidMap[chunk[idx]];
            if (uid) tokensToRemove.push(uid);
          }
        }
      });
    }
  }

  // Clean stale tokens
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

  // Log the notice
  await _logNotice(db, coachingId, req.userId, title, messageBody, successCount, failureCount, tokensToRemove.length);

  return res.status(200).json({
    success: true,
    sent: successCount,
    failed: failureCount,
    cleaned: tokensToRemove.length
  });
}

async function _logNotice(db, coachingId, adminUid, title, body, sent, failed, cleaned) {
  await db.collection('notificationLogs').add({
    title,
    body,
    segment: 'coaching',
    coachingId,
    successCount: sent,
    failureCount: failed,
    staleTokensCleaned: cleaned,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    adminUid: adminUid || 'unknown'
  });
}

async function _handleHistory(db, coachingId, req, res) {
  const historySnap = await db.collection('notificationLogs')
    .where('coachingId', '==', coachingId)
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();

  const notices = [];
  historySnap.forEach(doc => {
    const d = doc.data();
    notices.push({
      id: doc.id,
      title: d.title || '',
      body: d.body || '',
      sent: d.successCount || 0,
      failed: d.failureCount || 0,
      timestamp: safeTimestamp(d.timestamp)
    });
  });

  return res.status(200).json({ notices });
}

module.exports = withCoachingAuth(handler);
