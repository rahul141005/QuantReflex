/**
 * Maintenance: backfill `users.emailLower` (ADR-020 — case-insensitive Global Search)
 * Date: 2026-06-12
 *
 * WHY:
 *   Global Search matches email by prefix, but Firestore string ordering is case-sensitive and
 *   `users.email` preserves the casing the user typed at signup. A normalized lowercase `emailLower`
 *   field makes email search case-insensitive. New accounts get it at register (`api/auth/register.js`);
 *   this backfills every existing user doc.
 *
 * WHAT:
 *   - Pages every users/{uid} doc.
 *   - Sets emailLower = (email||'').toLowerCase() where it is missing or stale.
 *   - Skips docs with no email and docs whose emailLower is already correct.
 *
 * SAFETY:
 *   - Dry-run by default. Pass `--apply` to write. Idempotent (safe to re-run).
 *   - Batched (<=400 updates/commit), paginated (1000/page). No rules/index change required
 *     (single-field auto-index covers the emailLower prefix query).
 *
 * USAGE:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-12-add-emailLower.js          # dry run
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-12-add-emailLower.js --apply  # execute
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
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
  let lastDoc = null;
  let scanned = 0, updated = 0, alreadyOk = 0, noEmail = 0;
  let batch = db.batch(), inBatch = 0;
  const sample = [];

  /* eslint-disable no-constant-condition */
  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const d = doc.data();
      const email = d.email;
      if (!email || typeof email !== 'string') { noEmail++; continue; }
      const want = email.toLowerCase();
      if (d.emailLower === want) { alreadyOk++; continue; }
      updated++;
      if (sample.length < 20) sample.push(`${doc.id}: emailLower → ${want}`);
      if (APPLY) {
        batch.update(doc.ref, { emailLower: want });
        if (++inBatch >= MAX_BATCH) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(`[add-emailLower] scanned=${scanned} updated=${updated} alreadyOk=${alreadyOk} noEmail=${noEmail} ` +
    (APPLY ? '(applied)' : '(dry run — re-run with --apply to write)'));
  sample.forEach((l) => console.log('  ' + l));
  if (updated > sample.length) console.log(`  …and ${updated - sample.length} more`);
})().catch((e) => { console.error('Backfill failed:', e); process.exit(1); });
