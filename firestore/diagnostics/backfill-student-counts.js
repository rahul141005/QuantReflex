/**
 * backfill-student-counts.js — ONE-TIME reconcile of `coachings/{id}.studentCount` to the LIVE count of
 * `users where coachingId == id` (ADR-032).
 *
 * WHY: the `syncCoachingStudentCount` Cloud Function (the counter's sole writer) never ran on Firebase Spark,
 * so every coaching's `studentCount` is frozen at its creation value (0). Going forward the counter is
 * maintained in the request path (register / claim-coaching / reassign / purge / self-delete); this script
 * corrects the EXISTING drift once. Idempotent — safe to re-run.
 *
 * SAFE BY DEFAULT: dry-run (reports the diff, writes NOTHING) unless you pass --apply.
 *
 *   Dry-run:  FIREBASE_SERVICE_ACCOUNT="$(cat /d/krishna/claude/service-account.json)" node firestore/diagnostics/backfill-student-counts.js
 *   Apply:    FIREBASE_SERVICE_ACCOUNT="$(cat /d/krishna/claude/service-account.json)" node firestore/diagnostics/backfill-student-counts.js --apply
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const APPLY = process.argv.indexOf('--apply') !== -1;

(async function () {
  const cSnap = await db.collection('coachings').get();
  const rows = [];
  let updated = 0;
  for (const doc of cSnap.docs) {
    const id = doc.id;
    const denorm = (doc.data().studentCount != null ? doc.data().studentCount : null);
    const live = (await db.collection('users').where('coachingId', '==', id).count().get()).data().count;
    const mismatch = denorm !== live;
    rows.push({ id: id, name: doc.data().name || '', denorm: denorm, live: live, mismatch: mismatch });
    if (mismatch && APPLY) { await doc.ref.update({ studentCount: live }); updated++; }
  }
  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    coachings: rows.length,
    mismatches: rows.filter(function (r) { return r.mismatch; }).length,
    updated: updated,
    rows: rows
  }, null, 2));
  process.exit(0);
})().catch(function (e) { console.error('BACKFILL ERROR:', e); process.exit(1); });
