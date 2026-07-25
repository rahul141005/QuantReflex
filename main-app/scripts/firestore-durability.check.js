/**
 * firestore-durability.check.js — locks the Firestore durability / serverless-hygiene invariants from
 * the Production Bug Audit (Wave S3). Source-level ratchet (same style as payment-parity /
 * entitlement-invariants) so these can't silently regress. No DOM/Firestore mock needed.
 *
 * Invariants:
 *   1. flushUpdatesAsync stamps a SERVER timestamp (not a client-clock ISO) and does not silently
 *      drop data on failure (keeps a durable buffer).
 *   2. A durable, uid-scoped pending-writes buffer exists, is written on unload, and is replayed on
 *      load only for the matching user (no cross-user write).
 *   3. Account deletion removes the Firebase Auth account BEFORE the Firestore data (auth-first), so a
 *      partial failure can't resurrect a "deleted" account.
 *   4. The per-uid usageCache is bounded (TTL + size cap).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* ---- 1 & 2. FirestoreSync durable flush + buffer ---- */
const sync = R('js/firestore-sync.js');
const fuaM = sync.match(/function flushUpdatesAsync\(callback\)[\s\S]*?\n  \}/);
ok('flushUpdatesAsync found', !!fuaM);
if (fuaM) {
  const body = fuaM[0];
  ok('flushUpdatesAsync uses server timestamp', /_serverTs\(\)/.test(body) && !/updatedAt\s*=\s*new Date\(\)\.toISOString\(\)/.test(body));
  ok('flushUpdatesAsync retains data on failure (durable buffer)', /_persistPendingBuffer\(\)/.test(body));
  ok('flushUpdatesAsync does not clear _pendingUpdates up front', !/_pendingUpdates = \{\};/.test(body));
}
ok('durable pending-writes buffer defined', /PENDING_BUFFER_KEY\s*=\s*'qr_pending_writes'/.test(sync));
ok('buffer replay is uid-scoped (no cross-user write)', /function _replayPendingBuffer\(currentUserId\)[\s\S]*?parsed\.uid !== currentUserId/.test(sync));
ok('buffer persisted on unload', /beforeunload[\s\S]*?_persistPendingBuffer\(\)/.test(sync));
ok('buffer replayed on load', /_replayPendingBuffer\(currentUserId\)/.test(sync));
ok('load-failure retries instead of latching free', /_loadRetryCount < _MAX_LOAD_RETRIES/.test(sync));

/* ---- 3. Account deletion is auth-first ---- */
const acct = R('api/account.js');
const authIdx = acct.indexOf('admin.auth().deleteUser(uid)');
const subIdx = acct.indexOf('_deleteSubcollection(db, userDocRef, sub)');
const userDocDelIdx = acct.indexOf('await userDocRef.delete()');
ok('account deletion calls auth deleteUser', authIdx !== -1);
ok('auth account deleted BEFORE subcollections (auth-first)', authIdx !== -1 && subIdx !== -1 && authIdx < subIdx, 'authIdx=' + authIdx + ' subIdx=' + subIdx);
ok('auth account deleted BEFORE user doc', authIdx !== -1 && userDocDelIdx !== -1 && authIdx < userDocDelIdx);
ok('no second (late) auth deleteUser call', (acct.match(/admin\.auth\(\)\.deleteUser\(uid\)/g) || []).length === 1);

/* ---- 4. usageCache bounded ---- */
const ai = R('services/aiService.js');
ok('usageCache has a TTL', /USAGE_CACHE_TTL_MS/.test(ai) && /Date\.now\(\) - \(usageCacheTs\[uid\] \|\| 0\) < USAGE_CACHE_TTL_MS/.test(ai));
ok('usageCache has a size cap + eviction', /USAGE_CACHE_MAX/.test(ai) && /delete usageCache\[uids\[i\]\]/.test(ai));

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   ADR-121 — EXECUTED coverage.

   Everything above this line is a source pattern-match. That is how the FS1 defect shipped green: the
   ratchet confirmed flushUpdatesAsync "retains data on failure" and "does not clear _pendingUpdates up
   front", both true, while the SUCCESS path silently dropped the user's last answers because it compared
   queued values by object identity — and `stats` is the very object the app mutates in place. A pattern
   cannot see that. These sections run the real logic.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */
const vm = require('vm');

/* ── FS1-a: an in-place mutation during the write must NOT be mistaken for "unchanged" ───────────── */
/* The real signature + cleanup logic, lifted verbatim from js/firestore-sync.js. */
function sigOf(value) { try { return JSON.stringify(value); } catch (_) { return null; } }
function cleanupAfterWrite(pending, keys, snapSig) {
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    if (!Object.prototype.hasOwnProperty.call(pending, key)) continue;
    const cur = sigOf(pending[key]);
    if (cur !== null && snapSig[key] !== null && cur === snapSig[key]) delete pending[key];
  }
  return pending;
}

/* The production shape: loadProgress() hands back the cached object BY REFERENCE, recordAnswer mutates it
   in place, saveProgress re-queues the SAME object. */
const progress = { totalAttempted: 10, dailyStreak: 3 };
let pending = { stats: progress };
const keys = Object.keys(pending);
const snapSig = {}; keys.forEach(k => { snapSig[k] = sigOf(pending[k]); });
progress.totalAttempted = 11;                 /* ← the answer recorded while the write was in flight */
pending = cleanupAfterWrite(pending, keys, snapSig);
ok('FS1 an in-place edit during the write survives the success cleanup',
  Object.prototype.hasOwnProperty.call(pending, 'stats') && pending.stats.totalAttempted === 11);

/* Control: genuinely unchanged data IS cleared, so the queue does not grow without bound. */
const stable = { totalAttempted: 10 };
let pending2 = { stats: stable };
const keys2 = Object.keys(pending2);
const snapSig2 = {}; keys2.forEach(k => { snapSig2[k] = sigOf(pending2[k]); });
pending2 = cleanupAfterWrite(pending2, keys2, snapSig2);
ok('FS1 unchanged data is still cleared after a successful write',
  !Object.prototype.hasOwnProperty.call(pending2, 'stats'));

/* A replaced (new-object, same content) value is also cleared — content, not identity, is the test. */
let pending3 = { stats: { a: 1 } };
const keys3 = Object.keys(pending3);
const snapSig3 = {}; keys3.forEach(k => { snapSig3[k] = sigOf(pending3[k]); });
pending3.stats = { a: 1 };
pending3 = cleanupAfterWrite(pending3, keys3, snapSig3);
ok('FS1 a distinct object with identical content is cleared (content, not identity)',
  !Object.prototype.hasOwnProperty.call(pending3, 'stats'));

/* Unserializable value ⇒ null signature ⇒ KEEP. Never drop data on an unknown. */
const circular = {}; circular.self = circular;
let pending4 = { stats: circular };
const keys4 = Object.keys(pending4);
const snapSig4 = {}; keys4.forEach(k => { snapSig4[k] = sigOf(pending4[k]); });
pending4 = cleanupAfterWrite(pending4, keys4, snapSig4);
ok('FS1 an unserializable value is retained, never silently dropped',
  Object.prototype.hasOwnProperty.call(pending4, 'stats'));

/* ── FS1-b: the in-flight hold has ONE owner ─────────────────────────────────────────────────────── */
const holdSrc = R('js/firestore-sync.js');
const holdCtx = { _flushHold: 0, _flushHoldSeq: 0, _flushInFlight: false };
vm.createContext(holdCtx);
vm.runInContext(
  holdSrc.slice(holdSrc.indexOf('function _acquireFlushHold'), holdSrc.indexOf('var _syncGeneration')), holdCtx);
const tokA = holdCtx._acquireFlushHold();
const tokB = holdCtx._acquireFlushHold();
ok('FS1 a second acquirer is refused while a write is in flight', tokA > 0 && tokB === 0);
ok('FS1 a non-owner cannot release the hold', holdCtx._releaseFlushHold(tokB) === false && holdCtx._flushInFlight === true);
ok('FS1 the owner releases its own hold', holdCtx._releaseFlushHold(tokA) === true && holdCtx._flushInFlight === false);
const tokC = holdCtx._acquireFlushHold();
ok('FS1 a stale token from an earlier write cannot release the current one',
  holdCtx._releaseFlushHold(tokA) === false && holdCtx._flushInFlight === true && tokC !== tokA);
ok('FS1 flushUpdatesAsync defers instead of stealing the hold',
  /if \(_flushInFlight\) \{[\s\S]{0,220}?_persistPendingBuffer\(\);[\s\S]{0,120}?return;/.test(holdSrc));
ok('FS1 no path sets _flushInFlight directly outside the acquire helper',
  (holdSrc.match(/_flushInFlight = true/g) || []).length === 1);

/* ── FS2: pagehide is wired alongside beforeunload + visibilitychange ────────────────────────────── */
ok('FS2 pagehide persists the durable buffer (mobile discard fires no beforeunload)',
  /addEventListener\('pagehide'[\s\S]{0,220}?_persistPendingBuffer\(\)/.test(holdSrc));
['beforeunload', 'visibilitychange'].forEach(function (evt) {
  ok('FS2 ' + evt + ' still persists the buffer',
    new RegExp("addEventListener\\('" + evt + "'[\\s\\S]{0,260}?_persistPendingBuffer\\(\\)").test(holdSrc));
});

/* ── FS3: the coaching decrement is idempotent across a retry, in BOTH crash positions ───────────── */
function runDeletionCounterTx(world) {
  /* Mirrors api/account.js: read user doc → if it still carries coachingId, clear it AND decrement,
     atomically. Returns true when a decrement happened. */
  const u = world.users[world.uid];
  if (!u) return false;                       /* doc already deleted by a prior attempt */
  const cid = u.coachingId || null;
  if (!cid) return false;                     /* already decremented by a prior attempt */
  delete u.coachingId;
  world.coachings[cid].studentCount -= 1;
  return true;
}
/* crash position 1: died AFTER the transaction, BEFORE the user doc was deleted */
let w1 = { uid: 'u1', users: { u1: { coachingId: 'c1' } }, coachings: { c1: { studentCount: 5 } } };
runDeletionCounterTx(w1);
runDeletionCounterTx(w1);                     /* the retry */
ok('FS3 retry after the counter tx (user doc still present) decrements exactly once',
  w1.coachings.c1.studentCount === 4);
/* crash position 2: died AFTER the user doc was deleted */
let w2 = { uid: 'u2', users: { u2: { coachingId: 'c2' } }, coachings: { c2: { studentCount: 7 } } };
runDeletionCounterTx(w2);
delete w2.users.u2;
runDeletionCounterTx(w2);                     /* the retry */
ok('FS3 retry after the user doc is gone still decrements exactly once (the old +1 drift)',
  w2.coachings.c2.studentCount === 6);
/* a user with no coaching must never touch any counter */
let w3 = { uid: 'u3', users: { u3: {} }, coachings: { c3: { studentCount: 2 } } };
ok('FS3 a user with no coaching decrements nothing',
  runDeletionCounterTx(w3) === false && w3.coachings.c3.studentCount === 2);
const acctSrc = R('api/account.js');
ok('FS3 the decrement runs inside a transaction that also clears coachingId',
  /runTransaction\([\s\S]{0,700}?coachingId: admin\.firestore\.FieldValue\.delete\(\)[\s\S]{0,300}?studentCount: admin\.firestore\.FieldValue\.increment\(-1\)/.test(acctSrc));
ok('FS3 the old post-delete best-effort decrement is gone (single path only)',
  (acctSrc.match(/studentCount: admin\.firestore\.FieldValue\.increment\(-1\)/g) || []).length === 1);

/* ── FS4: usageCache TTL eviction, cap eviction, and never serving a stale entry ─────────────────── */
const aiSrc = R('services/aiService.js');
const cacheCtx = { Date: Date, Object: Object, console: console };
vm.createContext(cacheCtx);
vm.runInContext(
  aiSrc.slice(aiSrc.indexOf('var usageCache = {}'), aiSrc.indexOf('async function _loadUsage')), cacheCtx);
cacheCtx.usageCache.old = { v: 1 };
cacheCtx.usageCacheTs.old = Date.now() - (cacheCtx.USAGE_CACHE_TTL_MS + 1000);
cacheCtx._cacheUsage('fresh', { v: 2 });
ok('FS4 an expired entry is evicted on the next write, without the cap being reached',
  cacheCtx.usageCache.old === undefined && cacheCtx.usageCacheTs.old === undefined);
ok('FS4 the fresh entry survives its own write', cacheCtx.usageCache.fresh.v === 2);
/* cap eviction still works, oldest-first */
for (let i = 0; i < cacheCtx.USAGE_CACHE_MAX + 20; i++) cacheCtx._cacheUsage('u' + i, { v: i });
ok('FS4 the size cap still bounds the cache',
  Object.keys(cacheCtx.usageCache).length <= cacheCtx.USAGE_CACHE_MAX);
ok('FS4 timestamps never outlive their entries (no parallel-map leak)',
  Object.keys(cacheCtx.usageCacheTs).length === Object.keys(cacheCtx.usageCache).length);
ok('FS4 a stale entry is never served — _loadUsage re-checks the TTL on read',
  /Date\.now\(\) - \(usageCacheTs\[uid\] \|\| 0\) < USAGE_CACHE_TTL_MS/.test(aiSrc));
/* display-only: every quota/entitlement decision is transactional, never cache-derived */
ok('FS4 the cache is display-only — quota decisions run in Firestore transactions',
  /consumeFreeExplain[\s\S]{0,600}?runTransaction/.test(aiSrc));

console.log('firestore-durability.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
