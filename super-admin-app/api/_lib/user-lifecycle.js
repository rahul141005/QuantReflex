/**
 * Shared user-lifecycle operations for the Super Admin Control Center (ADR-014).
 * Used by api/admin/users.js (purge/reset actions) and api/cron/cleanup-sweep.js.
 *
 * Mirrors the deletion logic of main-app/api/account/delete.js (inline-copied per ADR-001).
 */
const admin = require('firebase-admin');

const HOLD_DAYS = 30;            // archive → permanent-delete hold window
const INACTIVE_FLAG_DAYS = 180; // 6 months inactive → flagged for admin review

async function _deleteSubcollection(db, userDocRef, name) {
  const collRef = userDocRef.collection(name);
  let deleted = 0;
  /* Batches of 100 to stay well under the 500-op Firestore batch limit. */
  while (true) {
    const snap = await collRef.limit(100).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(function (d) { batch.delete(d.ref); });
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function _deleteByField(db, collectionName, fieldName, uid) {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(collectionName).where(fieldName, '==', uid).limit(100).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(function (d) { batch.delete(d.ref); });
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

/** HARD-purge a user: subcollections + related top-level docs + user doc + Auth account. Never throws. */
async function purgeUser(db, uid) {
  const userDocRef = db.collection('users').doc(uid);
  const subs = ['performance', 'practice', 'ai', 'usage', 'profile', 'practiceSessions', 'notifications', 'entitlementLogs'];
  const report = { uid: uid, subcollections: {}, payments: 0, aiInsights: 0, aiStudyPlans: 0, userDoc: false, authAccount: false };
  /* Capture the user's coaching BEFORE deletion so studentCount stays correct (ADR-032 — the trigger that used
     to maintain it does not run on Spark). Best-effort; never blocks the purge. */
  let coachingIdForCount = null;
  try { const uSnap = await userDocRef.get(); if (uSnap.exists) coachingIdForCount = uSnap.data().coachingId || null; } catch (e) { /* ignore */ }
  await Promise.all(subs.map(function (s) {
    return _deleteSubcollection(db, userDocRef, s)
      .then(function (c) { report.subcollections[s] = c; })
      .catch(function () { report.subcollections[s] = 'error'; });
  }));
  const related = await Promise.all([
    _deleteByField(db, 'payments', 'uid', uid).catch(function () { return 0; }),
    _deleteByField(db, 'aiInsights', 'userId', uid).catch(function () { return 0; }),
    _deleteByField(db, 'aiStudyPlans', 'userId', uid).catch(function () { return 0; })
  ]);
  report.payments = related[0]; report.aiInsights = related[1]; report.aiStudyPlans = related[2];
  try { await userDocRef.delete(); report.userDoc = true; } catch (e) { /* ignore */ }
  /* studentCount maintenance (ADR-032) — decrement the coaching this user belonged to, best-effort. */
  if (coachingIdForCount) {
    try { await db.collection('coachings').doc(coachingIdForCount).update({ studentCount: admin.firestore.FieldValue.increment(-1) }); } catch (e) { /* coaching may be gone */ }
  }
  try { await admin.auth().deleteUser(uid); report.authAccount = true; } catch (e) { /* Auth user may not exist (Firestore-only) */ }
  return report;
}

/** Reset a user's LEARNING progress (keep the account): clear stats + practice/usage subcollections. */
async function resetProgress(db, uid) {
  const userDocRef = db.collection('users').doc(uid);
  const report = { uid: uid, cleared: {} };
  for (const sub of ['practiceSessions', 'usage', 'performance', 'practice']) {
    report.cleared[sub] = await _deleteSubcollection(db, userDocRef, sub).catch(function () { return 'error'; });
  }
  const nowIso = new Date().toISOString();
  await userDocRef.set({
    stats: admin.firestore.FieldValue.delete(),
    statusUpdatedAt: nowIso,
    updatedAt: nowIso
  }, { merge: true }).catch(function () {});
  return report;
}

module.exports = { purgeUser, resetProgress, HOLD_DAYS, INACTIVE_FLAG_DAYS };
