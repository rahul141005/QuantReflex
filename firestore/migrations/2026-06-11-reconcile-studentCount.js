/**
 * Maintenance: reconcile `coachings.studentCount` (audit M8)
 * Date: 2026-06-11
 *
 * WHY:
 *   studentCount is a denormalized counter maintained by the
 *   `syncCoachingStudentCount` Cloud Function. If that function ever errors
 *   (its failures are logged, not retried), the counter can drift. There was
 *   also historical drift from a divergent `studentsCount` field that
 *   claim-coaching used to write (now removed). This script recomputes the
 *   true count per coaching from the users collection and writes it back.
 *
 * WHAT:
 *   - Counts users grouped by `coachingId`.
 *   - Sets `coachings/{id}.studentCount` to the true value.
 *   - Clears the legacy `studentsCount` field (set to FieldValue.delete()).
 *
 * SAFETY:
 *   - Dry-run by default. Pass `--apply` to write.
 *   - Batched (≤400 updates/commit).
 *
 * USAGE:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-11-reconcile-studentCount.js          # dry run
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-11-reconcile-studentCount.js --apply  # execute
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    /* Application Default Credentials — point GOOGLE_APPLICATION_CREDENTIALS
       at a downloaded service-account key file. */
    admin.initializeApp({ projectId: 'quant-reflex-trainer' });
  } else {
    console.error('No credentials. Set FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS (path to a service-account key file).');
    process.exit(1);
  }
}

const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const PAGE = 1000;
const MAX_BATCH = 400;

(async function run() {
  /* 1. Tally users per coachingId */
  const counts = {};
  let lastDoc = null;
  let scannedUsers = 0;
  /* eslint-disable no-constant-condition */
  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach((doc) => {
      scannedUsers++;
      const cid = doc.data().coachingId;
      if (cid && typeof cid === 'string') counts[cid] = (counts[cid] || 0) + 1;
    });
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  /* 2. Walk coachings, compare, write corrections */
  const coachingSnap = await db.collection('coachings').get();
  let batch = db.batch();
  let inBatch = 0, corrected = 0;
  const report = [];

  for (const doc of coachingSnap.docs) {
    const trueCount = counts[doc.id] || 0;
    const data = doc.data();
    const current = data.studentCount;
    const hasLegacy = data.studentsCount !== undefined;
    if (current !== trueCount || hasLegacy) {
      corrected++;
      report.push(`${doc.id}: studentCount ${current == null ? '(unset)' : current} → ${trueCount}` + (hasLegacy ? ' [+drop studentsCount]' : ''));
      if (APPLY) {
        const update = { studentCount: trueCount, updatedAt: new Date().toISOString() };
        if (hasLegacy) update.studentsCount = admin.firestore.FieldValue.delete();
        batch.update(doc.ref, update);
        if (++inBatch >= MAX_BATCH) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(`[reconcile-studentCount] users=${scannedUsers} coachings=${coachingSnap.size} corrected=${corrected} ` +
    (APPLY ? '(applied)' : '(dry run — re-run with --apply to write)'));
  report.slice(0, 50).forEach((l) => console.log('  ' + l));
  if (report.length > 50) console.log(`  …and ${report.length - 50} more`);
})().catch((e) => { console.error('Reconciliation failed:', e); process.exit(1); });
