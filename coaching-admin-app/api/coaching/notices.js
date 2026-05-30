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

    if (action === 'scheduled' && req.method === 'GET') {
      return _handleScheduledList(db, coachingId, req, res);
    }

    if (action === 'cancel-scheduled' && req.method === 'POST') {
      return _handleCancelScheduled(db, coachingId, req, res);
    }

    return res.status(404).json({ error: 'Unknown notices action' });
  } catch (err) {
    console.error('[Coaching Notices] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

async function _handleSend(db, coachingId, req, res) {
  const reqBody = req.body && typeof req.body === 'object' ? req.body : {};
  const { title, body: messageBody, scheduledFor } = reqBody;

  if (!title || !messageBody) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  if (title.length > 100) {
    return res.status(400).json({ error: 'Title must be 100 characters or less' });
  }
  if (messageBody.length > 500) {
    return res.status(400).json({ error: 'Message must be 500 characters or less' });
  }

  /* ── Scheduled Notice Flow ── */
  if (scheduledFor) {
    const scheduledDate = new Date(scheduledFor);
    if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'scheduledFor must be a valid future date/time' });
    }

    await db.collection('scheduledNotices').add({
      coachingId,
      createdBy: req.userId,
      title,
      body: messageBody,
      scheduledFor: admin.firestore.Timestamp.fromDate(scheduledDate),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      scheduled: true,
      scheduledFor: scheduledDate.toISOString(),
      message: 'Notice scheduled for ' + scheduledDate.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    });
  }

  // Fetch ALL students for this coaching (not just those with tokens)
  const studentsSnap = await db.collection('users')
    .where('coachingId', '==', coachingId)
    .get();

  const totalStudents = studentsSnap.size;
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
      totalStudents,
      withTokens: 0,
      sent: 0,
      failed: 0,
      cleaned: 0,
      message: totalStudents > 0
        ? 'Notice saved. ' + totalStudents + ' student(s) found but none have push notifications enabled.'
        : 'No students are linked to your coaching yet.'
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
    totalStudents,
    withTokens: tokens.length,
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

async function _handleScheduledList(db, coachingId, req, res) {
  const snap = await db.collection('scheduledNotices')
    .where('coachingId', '==', coachingId)
    .where('status', '==', 'pending')
    .orderBy('scheduledFor', 'asc')
    .limit(20)
    .get();

  const scheduled = [];
  snap.forEach(doc => {
    const d = doc.data();
    scheduled.push({
      id: doc.id,
      title: d.title || '',
      body: d.body || '',
      scheduledFor: safeTimestamp(d.scheduledFor),
      createdAt: safeTimestamp(d.createdAt)
    });
  });

  return res.status(200).json({ scheduled });
}

async function _handleCancelScheduled(db, coachingId, req, res) {
  const { noticeId } = req.body && typeof req.body === 'object' ? req.body : {};
  if (!noticeId) {
    return res.status(400).json({ error: 'noticeId is required' });
  }

  const docRef = db.collection('scheduledNotices').doc(noticeId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return res.status(404).json({ error: 'Scheduled notice not found' });
  }

  const data = doc.data();
  if (data.coachingId !== coachingId) {
    return res.status(403).json({ error: 'Not authorized to cancel this notice' });
  }

  if (data.status !== 'pending') {
    return res.status(400).json({ error: 'Notice is no longer pending' });
  }

  await docRef.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
  return res.status(200).json({ success: true, message: 'Scheduled notice cancelled' });
}

module.exports = withCoachingAuth(handler);
