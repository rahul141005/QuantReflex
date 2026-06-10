/**
 * Migration: normalize legacy `premiumPlusPlan` values (audit M3)
 * Date: 2026-06-11
 *
 * WHY:
 *   The canonical plan keys are 'plus_6month' and 'plus_yearly'. Some legacy
 *   admin tooling stored 'yearly' / '6_months'. All current WRITE paths emit
 *   canonical values, so this is a one-time backfill of pre-existing docs.
 *   Until run, the main-app compensates at read time (firestore-sync.js
 *   getAccessState); after a successful run that compensation is redundant.
 *
 * MAPPING:
 *   'yearly'   → 'plus_yearly'
 *   '6_months' → 'plus_6month'
 *
 * SAFETY:
 *   - Idempotent: only touches docs whose premiumPlusPlan is a legacy value.
 *   - Dry-run by default. Pass `--apply` to write.
 *   - Batched (≤400 updates/commit) to respect Firestore's 500-op limit.
 *
 * USAGE:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-11-normalize-premiumPlusPlan.js          # dry run
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-11-normalize-premiumPlusPlan.js --apply  # execute
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
const LEGACY = { yearly: 'plus_yearly', '6_months': 'plus_6month' };
const PAGE = 500;
const MAX_BATCH = 400;

(async function run() {
  let lastDoc = null;
  let scanned = 0, toFix = 0, committed = 0;
  let batch = db.batch();
  let inBatch = 0;

  /* eslint-disable no-constant-condition */
  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const plan = doc.data().premiumPlusPlan;
      if (typeof plan === 'string' && LEGACY[plan]) {
        toFix++;
        if (APPLY) {
          batch.update(doc.ref, {
            premiumPlusPlan: LEGACY[plan],
            updatedAt: new Date().toISOString()
          });
          if (++inBatch >= MAX_BATCH) {
            await batch.commit(); committed += inBatch; batch = db.batch(); inBatch = 0;
          }
        }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  if (APPLY && inBatch > 0) { await batch.commit(); committed += inBatch; }

  console.log(`[normalize-premiumPlusPlan] scanned=${scanned} legacy=${toFix} ` +
    (APPLY ? `committed=${committed}` : '(dry run — re-run with --apply to write)'));
})().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
