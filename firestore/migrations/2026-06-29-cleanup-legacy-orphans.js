/**
 * Maintenance: one-time cleanup of legacy orphaned Firestore data (ADR-071 — ecosystem Firestore audit)
 * Date: 2026-06-29
 *
 * WHY:
 *   An ecosystem-wide Firestore audit verified a fixed, known set of collections/docs that NO runtime path in any of
 *   the three apps reads or writes anymore — leftovers from documented schema migrations. They are harmless (rules
 *   deny client access) but they are dead weight in the live database. This script removes them in one safe pass so
 *   the schema matches reality. There is intentionally NO permanent admin "delete collections" UI (the set is fixed
 *   and a powerful always-on delete surface is disproportionate risk at this scale — see ADR-071).
 *
 * WHAT (all verified orphaned — zero readers/writers in code):
 *   - Top-level legacy collections (wipe entirely):
 *       aiMissions       — superseded by aiPlanner/{uid} (ADR-047)
 *       aiCoachV2        — consolidated into aiDaily/{uid}_{feature}_{date} (ADR-048)
 *       aiInsightsV2     — consolidated into aiDaily (ADR-048)
 *       duelInvitations  — removed with Duel V2 room-code model (ADR-031)
 *   - Stale aiDaily cache docs: any doc missing `expiresAt` or already expired (the per-day Coach/Insights cache is
 *       only ever read by its same-day key; going forward _putDaily stamps expiresAt and the cron prunes — ADR-071).
 *   - Per-user legacy mirror docs (via collectionGroup):
 *       users/{uid}/profile/data      — removed; nothing read it (consumers read the root users.profile map)
 *   NOTE: `users/{uid}/usage/wordProblems` is intentionally NOT targeted — it still has a live reader
 *   (`aiService._loadUsage` lazily migrates it into the canonical `usage/ai` on next AI use), so deleting it could
 *   zero a legacy user's quota counters before that migration fires. It is tiny/harmless and self-resolves; leave it.
 *
 * SAFETY:
 *   - Dry-run by DEFAULT. Prints counts + sample doc paths per target. Pass `--apply` to actually delete.
 *   - Idempotent + re-runnable. Batched (<=400 deletes/commit), paginated (500/page). Non-destructive to anything in
 *     use: the only same-day aiDaily docs (still readable) carry a future expiresAt and are skipped; the canonical
 *     `usage/ai` and the self-migrating `usage/wordProblems` are never touched.
 *
 * USAGE:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-29-cleanup-legacy-orphans.js          # dry run (default)
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node 2026-06-29-cleanup-legacy-orphans.js --apply  # execute deletions
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
const PAGE = 500;
const MAX_BATCH = 400;

/**
 * Page a query (collection or collectionGroup), keep docs that pass `predicate(doc)`, and delete them (when --apply).
 * Returns { scanned, matched }. Cursor-based pagination works for both collection and collectionGroup queries.
 */
async function wipe(label, baseQuery, predicate) {
  let lastDoc = null;
  let scanned = 0, matched = 0;
  let batch = db.batch(), inBatch = 0;
  const sample = [];

  /* eslint-disable no-constant-condition */
  while (true) {
    let q = baseQuery.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      let keep;
      try { keep = predicate ? predicate(doc) : true; } catch (_) { keep = false; }
      if (!keep) continue;
      matched++;
      if (sample.length < 10) sample.push(doc.ref.path);
      if (APPLY) {
        batch.delete(doc.ref);
        if (++inBatch >= MAX_BATCH) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(`[cleanup] ${label}: scanned=${scanned} toDelete=${matched} ${APPLY ? '(deleted)' : '(dry run)'}`);
  sample.forEach((p) => console.log('    ' + p));
  if (matched > sample.length) console.log(`    …and ${matched - sample.length} more`);
  return { scanned, matched };
}

(async function run() {
  const now = Date.now();
  let totalToDelete = 0;

  // 1) Top-level legacy collections — wipe entirely (every doc).
  for (const name of ['aiMissions', 'aiCoachV2', 'aiInsightsV2', 'duelInvitations']) {
    const r = await wipe(name, db.collection(name), null);
    totalToDelete += r.matched;
  }

  // 2) Stale aiDaily cache docs: missing expiresAt (legacy) OR already expired. Same-day docs carry a FUTURE
  //    expiresAt and are skipped, so an in-use cache is never deleted.
  {
    const r = await wipe('aiDaily (stale)', db.collection('aiDaily'), (doc) => {
      const exp = (doc.data() || {}).expiresAt;
      return typeof exp !== 'number' || exp < now;
    });
    totalToDelete += r.matched;
  }

  // 3) Per-user legacy mirror docs via collectionGroup. STRICT id match. (usage/wordProblems is intentionally NOT
  //    swept — it has a live lazy-migration reader in aiService._loadUsage; see the header note.)
  {
    const r = await wipe('profile/data (legacy mirror)', db.collectionGroup('profile'), (doc) => doc.id === 'data');
    totalToDelete += r.matched;
  }

  console.log(`\n[cleanup] TOTAL ${APPLY ? 'deleted' : 'to delete'}: ${totalToDelete}` +
    (APPLY ? '' : '  — re-run with --apply to execute.'));
})().catch((e) => { console.error('Cleanup failed:', e); process.exit(1); });
