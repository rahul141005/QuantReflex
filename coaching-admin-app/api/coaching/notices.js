/**
 * notices.js — Coaching Notice Broadcasting API
 *
 * POST ?action=send  — Send notice to coaching students via FCM
 * GET  ?action=history — Fetch past notices for this coaching
 *
 * Reuses the existing FCM infrastructure.
 * Scoped to students with matching coachingId.
 */

const { withCoachingAuth, formatError, safeTimestamp, toMillis } = require('../_lib/middleware');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) { 
    console.error('Firebase admin init failed:', err);
    throw new Error('FATAL: Firebase Admin could not be initialized.');
  }
}

async function handler(req, res) {
  const action = req.query.action || 'send';

  try {
    const db = admin.firestore();
    const coachingId = req.coachingId;

    if (action === 'send' && req.method === 'POST') {
      return await _handleSend(db, coachingId, req, res);
    }

    if (action === 'history' && req.method === 'GET') {
      return await _handleHistory(db, coachingId, req, res);
    }

    return res.status(404).json({ error: 'Unknown notices action' });
  } catch (err) {
    console.error('[Coaching Notices] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

async function _handleSend(db, coachingId, req, res) {
  const reqBody = req.body && typeof req.body === 'object' ? req.body : {};
  const { title, body: messageBody, targetUid, targetTopic, segment } = reqBody;

  if (!title || !messageBody) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  if (title.length > 100) {
    return res.status(400).json({ error: 'Title must be 100 characters or less' });
  }
  if (messageBody.length > 500) {
    return res.status(400).json({ error: 'Message must be 500 characters or less' });
  }

  // Fetch students for this coaching — BOUNDED (ADR-029) so an enormous roster can't OOM/timeout the
  // 15s function. (A coaching beyond 5000 students reaches the first 5000; FCM is already chunked at 500.)
  const studentsSnap = await db.collection('users')
    .where('coachingId', '==', coachingId)
    .limit(5000)
    .get();

  const totalStudents = studentsSnap.size;
  const tokens = [];
  const targetUids = [];
  const uidMap = {};
  studentsSnap.forEach(doc => {
    const u = doc.data();

    // Filter by targetUid (single-student nudge)
    if (targetUid && doc.id !== targetUid) return;

    // Filter by audience segment (Engagement Center broadcast: all | premium | free)
    if (segment === 'premium' && u.plan !== 'premium') return;
    if (segment === 'free' && u.plan === 'premium') return;

    // Behavior-based Smart-Nudge segments (ADR-029) — so "Re-engage inactive" / "Streak reminder"
    // actually reach their stated audience instead of broadcasting to everyone.
    if (segment === 'inactive' || segment === 'lowstreak') {
      const st = u.stats || {};
      if (segment === 'inactive') {
        const lastMs = (typeof st.lastActiveMs === 'number' ? st.lastActiveMs : 0) || toMillis(st.lastActiveDate || u.updatedAt);
        if (!lastMs || lastMs >= (Date.now() - 3 * 24 * 60 * 60 * 1000)) return; // active in last 3d → skip
      } else { // lowstreak: at-risk streak — has practiced but streak is short
        if ((st.totalAttempted || 0) === 0) return;        // never practiced → not a "streak at risk"
        if ((st.dailyStreak || 0) >= 3) return;            // healthy streak → skip
      }
    }

    // Filter by targetTopic (< 50% accuracy)
    if (targetTopic) {
      const stats = u.stats || {};
      const catStats = stats.categoryStats || {};
      const c = catStats[targetTopic];
      if (!c || !c.attempted || c.attempted < 5) return; // Ignore if barely attempted
      const acc = c.correct / c.attempted;
      if (acc >= 0.5) return; // Skip if accuracy is 50% or higher
    }

    targetUids.push(doc.id);

    if (u.fcmToken) {
      tokens.push(u.fcmToken);
      uidMap[u.fcmToken] = doc.id;
    }
  });

  if (targetUids.length === 0) {
    // Still log the notice even if no matching students found
    await _logNotice(db, coachingId, req.userId, title, messageBody, 0, 0, 0, 0);
    return res.status(200).json({
      success: true,
      totalStudents,
      reached: 0,
      withTokens: 0,
      sent: 0,
      failed: 0,
      cleaned: 0,
      message: 'No students matched the target criteria.'
    });
  }

  // 1. Write persistent notification to Student Inbox in batches of 500
  let inboxWrites = 0;
  for (let i = 0; i < targetUids.length; i += 500) {
    const chunk = targetUids.slice(i, i + 500);
    const batch = db.batch();
    const noticePayload = {
      title,
      body: messageBody,
      type: targetUid ? 'direct_message' : (targetTopic ? 'topic_nudge' : 'announcement'),
      coachingId,
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    chunk.forEach(uid => {
      const ref = db.collection('users').doc(uid).collection('notifications').doc();
      batch.set(ref, noticePayload);
      inboxWrites++;
    });
    await batch.commit();
  }

  // 2. Send push notifications via FCM
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

  // Log the notice. `reached` = students who got the in-app inbox notice (targetUids.length) — the true
  // delivery number; `successCount` is only the FCM push subset (ADR-029: don't report "0 delivered" when
  // every student got the inbox notice but none had a push token).
  await _logNotice(db, coachingId, req.userId, title, messageBody, targetUids.length, successCount, failureCount, tokensToRemove.length);

  return res.status(200).json({
    success: true,
    totalStudents,
    reached: targetUids.length,
    withTokens: tokens.length,
    sent: successCount,
    failed: failureCount,
    cleaned: tokensToRemove.length
  });
}

async function _logNotice(db, coachingId, adminUid, title, body, reached, pushed, failed, cleaned) {
  await db.collection('notificationLogs').add({
    title,
    body,
    segment: 'coaching',
    coachingId,
    reached: reached,            // in-app inbox deliveries (true reach)
    successCount: pushed,        // FCM push successes (subset)
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
      sent: (d.reached != null ? d.reached : (d.successCount || 0)),  // true reach (fallback for old logs)
      pushSent: d.successCount || 0,
      failed: d.failureCount || 0,
      timestamp: safeTimestamp(d.timestamp)
    });
  });

  return res.status(200).json({ notices });
}

module.exports = withCoachingAuth(handler);
