/**
 * Account domain API (ADR-017) — consolidates account/delete + notifications + claim-coaching
 * into ONE serverless function. withAuth, self-scoped on req.userId (a caller can only act on
 * their OWN account; no uid is ever accepted from the body/query).
 *   POST ?action=delete                 → delete all user data + the Firebase Auth account
 *   GET  ?action=notifications-list     → 50 most-recent notifications + unreadCount
 *   POST ?action=notifications-markRead → mark one (or 'all') notification(s) read ({ id })
 *   POST ?action=claim-coaching         → claim a coaching code ({ coachingId })
 *
 * Firestore rules deny client-side user deletion (allow delete: if false); deletion is only
 * possible here via the Admin SDK.
 */

const { withAuth, parseBody, formatError, isCoachingActive } = require('./_lib/middleware');
const admin = require('firebase-admin');
/* Requiring aiService initializes the Firebase Admin singleton (matches the former account/delete.js). */
const aiService = require('../services/aiService');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
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

/* Delete all documents in a subcollection (batched — Firestore batch limit is 500). */
async function _deleteSubcollection(db, userDocRef, subcollectionName) {
  const collRef = userDocRef.collection(subcollectionName);
  let deleted = 0;
  while (true) {
    const snapshot = await collRef.limit(100).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach(function (doc) { batch.delete(doc.ref); });
    await batch.commit();
    deleted += snapshot.size;
  }
  return deleted;
}

/* Delete all documents in a top-level collection matching a field == uid. */
async function _deleteByField(db, collectionName, fieldName, uid) {
  let deleted = 0;
  while (true) {
    const snapshot = await db.collection(collectionName).where(fieldName, '==', uid).limit(100).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach(function (doc) { batch.delete(doc.ref); });
    await batch.commit();
    deleted += snapshot.size;
  }
  return deleted;
}

/* ── ?action=delete (POST) ── */
async function _delete(req, res, db) {
  const uid = req.userId;
  console.log('[account:delete] Starting account deletion for uid:', uid);

  const report = { subcollections: {}, payments: 0, aiInsights: 0, aiStudyPlans: 0, userDoc: false, authAccount: false };

  try {
    const userDocRef = db.collection('users').doc(uid);

    /* Capture the user's coaching BEFORE deletion so we can keep its studentCount correct (ADR-032 — the
       trigger that used to do this doesn't run on Spark). Best-effort; never blocks deletion. */
    let coachingIdForCount = null;
    try { const uSnap = await userDocRef.get(); if (uSnap.exists) coachingIdForCount = uSnap.data().coachingId || null; } catch (_) { /* ignore */ }

    /* Delete all subcollections in parallel. */
    const subcollections = ['performance', 'practice', 'ai', 'usage', 'profile', 'practiceSessions', 'notifications'];
    await Promise.all(subcollections.map(function (sub) {
      return _deleteSubcollection(db, userDocRef, sub)
        .then(function (count) { report.subcollections[sub] = count; return null; })
        .catch(function (err) {
          console.warn('[account:delete] Failed to delete subcollection ' + sub + ':', err.message);
          report.subcollections[sub] = 'error: ' + err.message;
          return null;
        });
    }));

    /* Delete related top-level documents in parallel. */
    const results = await Promise.all([
      _deleteByField(db, 'payments', 'uid', uid).catch(function (err) { console.warn('[account:delete] payments cleanup error:', err.message); return 0; }),
      _deleteByField(db, 'aiInsights', 'userId', uid).catch(function (err) { console.warn('[account:delete] aiInsights cleanup error:', err.message); return 0; }),
      _deleteByField(db, 'aiStudyPlans', 'userId', uid).catch(function (err) { console.warn('[account:delete] aiStudyPlans cleanup error:', err.message); return 0; })
    ]);
    report.payments = results[0];
    report.aiInsights = results[1];
    report.aiStudyPlans = results[2];

    /* Delete the user document itself. */
    await userDocRef.delete();
    report.userDoc = true;
    console.log('[account:delete] User document deleted for uid:', uid);

    /* studentCount maintenance (ADR-032) — decrement the coaching this user belonged to, best-effort. */
    if (coachingIdForCount) {
      try { await db.collection('coachings').doc(coachingIdForCount).update({ studentCount: admin.firestore.FieldValue.increment(-1) }); } catch (_) { /* coaching may be gone */ }
    }

    /* Delete the Firebase Auth account. */
    await admin.auth().deleteUser(uid);
    report.authAccount = true;
    console.log('[account:delete] Auth account deleted for uid:', uid);

    console.log('[account:delete] Complete deletion report:', JSON.stringify(report));
    return res.status(200).json({ success: true, report: report });
  } catch (err) {
    console.error('[account:delete] Critical error during deletion for uid:', uid, err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'DELETION_FAILED', message: 'Account deletion partially failed. Please try again or contact support.', partial: report }
    });
  }
}

/* ── ?action=notifications-list (GET) ── */
async function _notificationsList(req, res, db) {
  const userId = req.userId;
  const snapshot = await db.collection('users').doc(userId).collection('notifications')
    .orderBy('timestamp', 'desc').limit(50).get();

  const notifications = [];
  let unreadCount = 0;
  snapshot.forEach(function (doc) {
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
  return res.status(200).json({ notifications: notifications, unreadCount: unreadCount });
}

/* ── ?action=notifications-markRead (POST) ── */
async function _notificationsMarkRead(req, res, db) {
  const userId = req.userId;
  const body = parseBody(req);
  const notificationId = body.id;
  if (!notificationId) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Notification ID is required.' } });
  }

  const notifRef = db.collection('users').doc(userId).collection('notifications');
  if (notificationId === 'all') {
    const unreadSnap = await notifRef.where('isRead', '==', false).limit(500).get();
    if (!unreadSnap.empty) {
      const batch = db.batch();
      unreadSnap.forEach(function (doc) { batch.update(doc.ref, { isRead: true }); });
      await batch.commit();
    }
  } else {
    await notifRef.doc(notificationId).update({ isRead: true });
  }
  return res.status(200).json({ success: true });
}

/* ── ?action=claim-coaching (POST) ── */
async function _claimCoaching(req, res, db) {
  const body = parseBody(req);
  const coachingId = body.coachingId;
  if (!coachingId || typeof coachingId !== 'string' || coachingId.trim().length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Missing coaching ID.' } });
  }
  const cleanCoachingId = coachingId.trim();

  try {
    const userRef = db.collection('users').doc(req.userId);
    const newCoachingRef = db.collection('coachings').doc(cleanCoachingId);

    await db.runTransaction(async function (transaction) {
      const newCoachingDoc = await transaction.get(newCoachingRef);
      if (!newCoachingDoc.exists) {
        throw new Error('NOT_FOUND: Coaching ID does not exist.');
      }
      const coachingData = newCoachingDoc.data();
      if (!isCoachingActive(coachingData)) {
        throw new Error('INACTIVE: Coaching ID is inactive or expired.');
      }

      const userDoc = await transaction.get(userRef);
      const oldCoachingId = userDoc.exists ? (userDoc.data().coachingId || null) : null;
      if (oldCoachingId === cleanCoachingId) return;

      /* studentCount maintenance in the request path (ADR-032) — the syncCoachingStudentCount trigger does NOT
         run on Spark, so the counter is moved here, transactionally. Read the old coaching BEFORE any write
         (Firestore txn ordering: all reads precede all writes) and decrement it only if it still exists. */
      let oldExists = false;
      if (oldCoachingId) {
        const oldDoc = await transaction.get(db.collection('coachings').doc(oldCoachingId));
        oldExists = oldDoc.exists;
      }
      const inc = admin.firestore.FieldValue.increment;
      transaction.set(userRef, {
        coachingId: cleanCoachingId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.update(newCoachingRef, { studentCount: inc(1) });
      if (oldExists) transaction.update(db.collection('coachings').doc(oldCoachingId), { studentCount: inc(-1) });
    });

    return res.status(200).json({ success: true, message: 'Coaching claimed successfully.' });
  } catch (err) {
    console.error('Error claiming coaching:', err);
    if (err.message && err.message.startsWith('NOT_FOUND:')) {
      return res.status(400).json({ error: { code: 'NOT_FOUND', message: 'Coaching ID does not exist.' } });
    }
    if (err.message && err.message.startsWith('INACTIVE:')) {
      return res.status(400).json({ error: { code: 'INACTIVE', message: 'Coaching ID is inactive or expired.' } });
    }
    return res.status(500).json({ error: formatError(err) });
  }
}

async function handler(req, res) {
  const db = admin.firestore();
  const action = req.query.action || '';
  try {
    if (action === 'delete' && req.method === 'POST') return await _delete(req, res, db);
    if (action === 'notifications-list' && req.method === 'GET') return await _notificationsList(req, res, db);
    if (action === 'notifications-markRead' && req.method === 'POST') return await _notificationsMarkRead(req, res, db);
    if (action === 'claim-coaching' && req.method === 'POST') return await _claimCoaching(req, res, db);
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown account action: ' + action } });
  } catch (err) {
    console.error('[Account API] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAuth(handler);
