const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const { sendNotification } = require('../_lib/notifyClient');   // ADR-066: the ONE pipeline (main-app /api/notify)
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
  const action = req.query.action || 'broadcast';

  /* ── history (Operations → Campaigns, ADR-022) — recent broadcast campaign log ── */
  if (action === 'history' && req.method === 'GET') {
    try {
      const db = admin.firestore();
      const snap = await db.collection('notificationLogs').orderBy('timestamp', 'desc').limit(30).get();
      const campaigns = [];
      snap.forEach(function (doc) {
        const d = doc.data();
        let ts = null;
        if (d.timestamp && typeof d.timestamp.toDate === 'function') { try { ts = d.timestamp.toDate().toISOString(); } catch (_) {} }
        campaigns.push({ id: doc.id, title: d.title || '', segment: d.segment || 'unknown', successCount: d.successCount || 0, failureCount: d.failureCount || 0, staleTokensCleaned: d.staleTokensCleaned || 0, adminUid: d.adminUid || 'System', timestamp: ts });
      });
      return res.status(200).json({ campaigns: campaigns });
    } catch (err) {
      console.error('Error reading notification history:', err);
      return res.status(500).json({ error: formatError(err) });
    }
  }

  if (methodGuard(req, res, 'POST')) return;

  try {
    const { title, body, segment, coachingId, targetUids } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const db = admin.firestore();

    // ADR-066: pure client of the ONE pipeline. Previously this was PUSH-ONLY and bypassed the Inbox — now the
    // broadcast lands in every recipient's Inbox first, then pushes. Describe WHO + WHAT; the Inbox write, push,
    // stale-token cleanup and notificationLogs all happen in main-app's notification service.
    let recipients;
    if (segment === 'premium') recipients = { segment: 'premium' };
    else if (segment === 'coaching' && coachingId) recipients = { coachingId };
    else if (segment === 'custom' && Array.isArray(targetUids)) {
      if (targetUids.length === 0) return res.status(400).json({ error: 'targetUids cannot be empty' });
      recipients = { uids: targetUids };
    } else recipients = { all: true };

    const result = await sendNotification({
      recipients,
      notification: { title, body, type: 'announcement', category: 'system', deepLink: '#home', sender: { kind: 'admin', id: req.userId, name: 'QuantReflex' } },
      adminUid: req.userId,
      logSegment: segment || 'all'
    });

    await writeAuditLog(db, {
      actorUid: req.userId,
      actorEmail: req.adminEmail,
      action: 'broadcast_notification',
      category: 'system',
      targetType: 'segment',
      targetId: segment || 'all',
      summary: 'broadcast "' + title + '" to ' + (segment || 'all') + ' (' + (result.reached || 0) + ' inbox, ' + (result.pushed || 0) + ' pushed)'
    });

    return res.status(200).json({
      success: true,
      reached: result.reached || 0,
      sent: result.pushed || 0,
      failed: result.failed || 0,
      cleaned: result.cleaned || 0
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
