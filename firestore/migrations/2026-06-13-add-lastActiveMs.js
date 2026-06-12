/**
 * Maintenance: backfill `users.stats.lastActiveMs` (ADR-029 — sortable last-active)
 * Date: 2026-06-13
 *
 * WHY:
 *   `stats.lastActiveDate` is written as `new Date().toDateString()` (e.g. "Sat Jun 13 2026"), which
 *   Firestore sorts LEXICALLY by weekday — not chronologically. That silently broke (a) the coaching
 *   roster order + keyset pagination and (b) the super-admin inactive-flag sweep / inactive list+export,
 *   whose `where(lastActiveDate < ISO)` range never matched (weekday letters sort above '2…'). The fix
 *   adds a sortable epoch-ms field `stats.lastActiveMs`, written going forward by main-app/js/progress.js;
 *   all order/range queries now use it. This backfills every existing user doc.
 *
 * WHAT:
 *   - Pages every users/{uid} doc.
 *   - Sets stats.lastActiveMs = Date.parse(stats.lastActiveDate) (fallback: updatedAt) where missing/stale.
 *   - Skips docs already correct and docs with no parseable last-active signal.
 *
 * SAFETY:
 *   - Dry-run by default. Pass `--apply` to write. Idempotent (safe to re-run).
 *   - Batched (<=400 updates/commit), paginated (1000/page). Additive — no reader breaks (old readers
 *     ignore the field; in-memory readers already normalize lastActiveDate). Deploy the updated
 *     `users(coachingId, stats.lastActiveMs DESC)` index before/with this.
 *
 * USAGE:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-13-add-lastActiveMs.js          # dry run
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-13-add-lastActiveMs.js --apply  # execute
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

/* Normalize any stored last-active value to epoch ms (toDateString | ISO | Timestamp | number). */
function toMs(v) {
  if (v == null) return 0;
  if (typeof v === 'number' && isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') { const p = Date.parse(v); return isNaN(p) ? 0 : p; }
  if (typeof v.toDate === 'function') { try { return v.toDate().getTime(); } catch (_) { return 0; } }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && v._seconds != null) return v._seconds * 1000;
  return 0;
}

(async function run() {
  let lastDoc = null;
  let scanned = 0, updated = 0, alreadyOk = 0, noSignal = 0;
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
      const d = doc.data() || {};
      const stats = d.stats || {};
      if (typeof stats.lastActiveMs === 'number' && stats.lastActiveMs > 0) { alreadyOk++; continue; }
      const ms = toMs(stats.lastActiveDate) || toMs(d.updatedAt);
      if (!ms) { noSignal++; continue; }   // never practiced / no parseable timestamp — leave absent
      updated++;
      if (sample.length < 20) sample.push(`${doc.id}: stats.lastActiveMs → ${ms}`);
      if (APPLY) {
        batch.update(doc.ref, { 'stats.lastActiveMs': ms });
        if (++inBatch >= MAX_BATCH) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(`[add-lastActiveMs] scanned=${scanned} updated=${updated} alreadyOk=${alreadyOk} noSignal=${noSignal} ` +
    (APPLY ? '(applied)' : '(dry run — re-run with --apply to write)'));
  sample.forEach((l) => console.log('  ' + l));
  if (updated > sample.length) console.log(`  …and ${updated - sample.length} more`);
})().catch((e) => { console.error('Backfill failed:', e); process.exit(1); });
