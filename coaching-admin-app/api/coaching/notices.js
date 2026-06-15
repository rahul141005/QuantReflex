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
const { sendNotification } = require('../_lib/notifyClient');   // ADR-066: the ONE pipeline (main-app /api/notify)
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

  // ADR-066: this app is a PURE CLIENT of the one pipeline. It no longer queries students, writes the Inbox,
  // sends FCM, or logs — it just describes WHO + WHAT. Targeting maps to the pipeline's recipients spec, ALWAYS
  // scoped to this coachingId so an admin can only reach their own roster (the pipeline enforces the scope + the
  // behavioural filters; the Inbox write + push + log all happen in exactly one place).
  const recipients = { coachingId };
  if (targetUid) recipients.uid = targetUid;
  else if (targetTopic) { recipients.audience = 'weakTopic'; recipients.topic = targetTopic; }
  else if (segment === 'inactive' || segment === 'lowstreak') recipients.audience = segment;
  else if (segment === 'premium' || segment === 'free') recipients.segment = segment;

  const type = targetUid ? 'direct_message' : (targetTopic ? 'topic_nudge' : 'announcement');

  try {
    const result = await sendNotification({
      recipients,
      notification: {
        title, body: messageBody, type, category: 'coaching', coachingId,
        deepLink: '#home', sender: { kind: 'coaching', id: req.userId, name: 'Your Coaching' }
      },
      adminUid: req.userId,
      logSegment: 'coaching'
    });
    return res.status(200).json({
      success: true,
      reached: result.reached || 0,
      withTokens: result.recipients || 0,
      sent: result.pushed || 0,
      failed: result.failed || 0,
      cleaned: result.cleaned || 0,
      message: (result.reached || 0) === 0 ? 'No students matched the target criteria.' : undefined
    });
  } catch (err) {
    console.error('[Coaching Notices] pipeline send failed:', err.message);
    return res.status(502).json({ error: 'Could not reach the notification service. Please try again.' });
  }
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
