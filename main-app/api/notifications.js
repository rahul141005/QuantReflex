const { withAuth, parseBody, formatError } = require('./_lib/middleware');
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

function _safeTS(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') { try { return val.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof val === 'string') { var d = new Date(val); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if (val instanceof Date) { return isNaN(val.getTime()) ? null : val.toISOString(); }
  if (typeof val === 'number' && isFinite(val)) { return new Date(val < 1e12 ? val * 1000 : val).toISOString(); }
  if (typeof val === 'object' && val._seconds != null) { try { return new Date(val._seconds * 1000).toISOString(); } catch (_) { return null; } }
  return null;
}

async function handler(req, res) {
  const action = req.query.action || 'list';
  const db = admin.firestore();
  const userId = req.userId;

  try {
    if (action === 'list' && req.method === 'GET') {
      const snapshot = await db.collection('users')
        .doc(userId)
        .collection('notifications')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

      const notifications = [];
      let unreadCount = 0;

      snapshot.forEach(doc => {
        const d = doc.data();
        if (!d.isRead) unreadCount++;
        notifications.push({
          id: doc.id,
          title: d.title || '',
          body: d.body || '',
          type: d.type || 'announcement',
          coachingId: d.coachingId || null,
          isRead: !!d.isRead,
          timestamp: _safeTS(d.timestamp)
        });
      });

      return res.status(200).json({ notifications, unreadCount });
    }

    if (action === 'markRead' && req.method === 'POST') {
      const body = parseBody(req);
      const notificationId = body.id;

      if (!notificationId) {
        return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Notification ID is required.' } });
      }

      const notifRef = db.collection('users').doc(userId).collection('notifications');

      if (notificationId === 'all') {
        // Mark all as read
        const unreadSnap = await notifRef.where('isRead', '==', false).limit(500).get();
        if (!unreadSnap.empty) {
          const batch = db.batch();
          unreadSnap.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
          });
          await batch.commit();
        }
      } else {
        // Mark single as read
        await notifRef.doc(notificationId).update({ isRead: true });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown notification action.' } });

  } catch (err) {
    console.error('[Notifications API] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAuth(handler);
