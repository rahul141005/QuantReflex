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
    const subcollections = ['performance', 'practice', 'ai', 'usage', 'profile', 'practiceSessions', 'notifications', 'aiEvents', 'duelHistory', 'duelStats'];
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
      _deleteByField(db, 'aiStudyPlans', 'userId', uid).catch(function (err) { console.warn('[account:delete] aiStudyPlans cleanup error:', err.message); return 0; }),
      // ADR-062: the per-user AI docs keyed by uid — previously orphaned on deletion (GDPR completeness).
      db.collection('aiPlanner').doc(uid).delete().then(function () { return 1; }).catch(function (err) { console.warn('[account:delete] aiPlanner cleanup error:', err.message); return 0; }),
      db.collection('aiContext').doc(uid).delete().then(function () { return 1; }).catch(function (err) { console.warn('[account:delete] aiContext cleanup error:', err.message); return 0; }),
      _deleteByField(db, 'aiDaily', 'uid', uid).catch(function (err) { console.warn('[account:delete] aiDaily cleanup error:', err.message); return 0; })
    ]);
    report.payments = results[0];
    report.aiInsights = results[1];
    report.aiStudyPlans = results[2];
    report.aiPlanner = results[3];
    report.aiContext = results[4];
    report.aiDaily = results[5];

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
    if (d.archived) return;                       // archived notifications are hidden from the inbox list
    if (!d.isRead) unreadCount++;
    notifications.push({
      id: doc.id,
      title: d.title || '',
      body: d.body || '',
      type: d.type || 'announcement',
      category: d.category || 'system',           // ADR-066: enriched fields the premium Inbox renders
      priority: d.priority || 'normal',
      icon: d.icon || null,
      deepLink: d.deepLink || null,
      metadata: d.metadata || null,               // seam: future routing (e.g. duel metadata.code)
      sender: d.sender || null,
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
  const TS = admin.firestore.FieldValue.serverTimestamp();
  if (notificationId === 'all') {
    const unreadSnap = await notifRef.where('isRead', '==', false).limit(500).get();
    if (!unreadSnap.empty) {
      const batch = db.batch();
      unreadSnap.forEach(function (doc) { batch.update(doc.ref, { isRead: true }); });
      await batch.commit();
    }
  } else {
    // ADR-066: opening a notification marks it read + stamps delivery.openedAt; `archive:true` hides it.
    const upd = body.archive === true ? { isRead: true, archived: true, 'delivery.openedAt': TS } : { isRead: true, 'delivery.openedAt': TS };
    await notifRef.doc(notificationId).update(upd);
  }
  return res.status(200).json({ success: true });
}

/* ── ?action=ensure-profile (POST) ──
   Idempotent server-side provisioning for the authenticated caller's users/{uid} doc. Needed for
   provider sign-ins (Google): firestore.rules deny client creates (allow create: if false), and
   Session.claim's merge-set can leave a SKELETON doc holding only activeSessionId/activeSessionAt —
   no email/emailLower/plan/createdAt — which breaks coaching rosters and admin search. Seeds the
   exact same shape as /api/auth/register (kept in sync — see register.js), filling ONLY missing
   fields so it can run on every login safely. No-ops when the doc already carries `plan`. */
async function _ensureProfile(req, res, db) {
  const uid = req.userId;

  let authUser;
  try {
    authUser = await admin.auth().getUser(uid);
  } catch (err) {
    return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Auth user not found.' } });
  }
  const email = authUser.email || '';
  const displayName = authUser.displayName || (email ? email.split('@')[0] : 'User');

  const userRef = db.collection('users').doc(uid);
  let existed = false;

  await db.runTransaction(async function (transaction) {
    const snap = await transaction.get(userRef);
    const data = snap.exists ? snap.data() : {};
    if (snap.exists && data.plan !== undefined) { existed = true; return; }   // fully provisioned — no-op

    const TS = admin.firestore.FieldValue.serverTimestamp();
    const patch = {
      uid: uid,
      email: email,
      emailLower: email.toLowerCase(),
      updatedAt: TS,
      // Entitlement defaults (v2 — safe free tier); server-authoritative, identical to register.js
      plan: 'free',
      planType: null,
      planExpiry: null,
      planSource: null,
      isTrial: false,
      trialEnd: null,
      planUpdatedAt: TS,
      lastPaymentId: null
    };
    if (data.createdAt === undefined) patch.createdAt = TS;
    if (data.coachingId === undefined) patch.coachingId = null;               // never clobber an existing binding
    if (data.stats === undefined) {
      // Roster key seed (ADR-032) — orderBy('stats.lastActiveMs') must never drop this user
      patch.stats = { lastActiveMs: Date.now(), lastActiveDate: new Date().toDateString() };
    }
    if (!data.profile || !data.profile.name) {
      patch.profile = Object.assign({}, data.profile || {}, { name: displayName });
    }
    transaction.set(userRef, patch, { merge: true });                          // merge preserves any session skeleton
  });

  if (!existed) {
    /* AI usage seed — .create() so a concurrent/earlier seed is never reset (quota safety). */
    try {
      await userRef.collection('usage').doc('ai').create({
        wordProblemsUsedLifetime: 0,
        wordProblemsUsedToday: 0,
        explanationsUsed: 0
      });
    } catch (err) {
      if (!(err && (err.code === 6 || String(err.message || '').indexOf('ALREADY_EXISTS') !== -1))) {
        console.warn('[account:ensure-profile] usage/ai seed failed:', err.message);
      }
    }
  }

  return res.status(200).json({ success: true, existed: existed });
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
      const existingCoachingId = userDoc.exists ? (userDoc.data().coachingId || null) : null;
      if (existingCoachingId === cleanCoachingId) return;   // already in it — idempotent no-op

      /* BIND-ONCE: a student's coaching is permanent once set. It may be bound exactly once (at signup, or a single
         later join when they have none) and can NEVER be switched here. To move to a different coaching the student
         must delete their account and sign up again. (Super-admin reassign remains as an admin-only override.) */
      if (existingCoachingId) throw new Error('LOCKED: Coaching cannot be changed.');

      /* studentCount maintenance in the request path (ADR-032) — the syncCoachingStudentCount trigger does NOT run
         on Spark, so the counter is incremented here, transactionally. No old-coaching decrement: the only allowed
         path is null → a coaching, so there is never a previous coaching to leave. */
      transaction.set(userRef, {
        coachingId: cleanCoachingId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.update(newCoachingRef, { studentCount: admin.firestore.FieldValue.increment(1) });
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
    if (err.message && err.message.startsWith('LOCKED:')) {
      return res.status(409).json({ error: { code: 'COACHING_LOCKED', message: 'Your coaching can\'t be changed. To join a different coaching, delete your account and sign up again.' } });
    }
    return res.status(500).json({ error: formatError(err) });
  }
}

async function handler(req, res) {
  const db = admin.firestore();
  const action = req.query.action || '';
  try {
    if (action === 'delete' && req.method === 'POST') return await _delete(req, res, db);
    if (action === 'ensure-profile' && req.method === 'POST') return await _ensureProfile(req, res, db);
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
