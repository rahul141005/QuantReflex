/**
 * backfill-stats-lastactive.js — ONE-TIME: initialize `users/{uid}.stats.lastActiveMs` (+ human `lastActiveDate`)
 * for any user doc missing it (ADR-032).
 *
 * WHY: the coaching roster query orders by `stats.lastActiveMs`, and Firestore silently EXCLUDES documents that
 * lack the orderBy field — so a never-practiced joiner was invisible in the coaching roster. `register` now seeds
 * `stats` at creation; this script backfills the existing stat-less users. Seeds from `createdAt` when available,
 * else now. Idempotent — only touches docs still missing the field.
 *
 * SAFE BY DEFAULT: dry-run (reports counts + a sample, writes NOTHING) unless you pass --apply.
 *
 *   Dry-run:  FIREBASE_SERVICE_ACCOUNT="$(cat /d/krishna/claude/service-account.json)" node firestore/diagnostics/backfill-stats-lastactive.js
 *   Apply:    FIREBASE_SERVICE_ACCOUNT="$(cat /d/krishna/claude/service-account.json)" node firestore/diagnostics/backfill-stats-lastactive.js --apply
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const APPLY = process.argv.indexOf('--apply') !== -1;

function msOf(createdAt) {
  if (createdAt && typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (typeof createdAt === 'number' && isFinite(createdAt)) return createdAt < 1e12 ? createdAt * 1000 : createdAt;
  if (typeof createdAt === 'string') { const d = new Date(createdAt); if (!isNaN(d.getTime())) return d.getTime(); }
  return Date.now();
}

(async function () {
  const snap = await db.collection('users').select('coachingId', 'createdAt', 'stats.lastActiveMs').get();
  let missing = 0, updated = 0, inBatch = 0;
  let batch = db.batch();
  const sample = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const hasMs = d.stats && d.stats.lastActiveMs != null;
    if (hasMs) continue;
    missing++;
    const ms = msOf(d.createdAt);
    if (sample.length < 10) sample.push({ uid: doc.id, coachingId: d.coachingId || null, seededMs: ms });
    if (APPLY) {
      batch.set(doc.ref, { stats: { lastActiveMs: ms, lastActiveDate: new Date(ms).toDateString() } }, { merge: true });
      inBatch++; updated++;
      if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
  }
  if (APPLY && inBatch > 0) await batch.commit();
  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    scanned: snap.size,
    missingLastActiveMs: missing,
    updated: updated,
    sample: sample
  }, null, 2));
  process.exit(0);
})().catch(function (e) { console.error('BACKFILL ERROR:', e); process.exit(1); });
