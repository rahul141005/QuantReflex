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
   ADR-121 / ADR-122 — EXECUTED coverage.

   Everything above this line is a source pattern-match. That is how the FS1 defect shipped green: the
   ratchet confirmed flushUpdatesAsync "retains data on failure" and "does not clear _pendingUpdates up
   front", both true, while the SUCCESS path silently dropped the user's last answers because it compared
   queued values by object identity — and `stats` is the very object the app mutates in place. A pattern
   cannot see that.

   ADR-122: the FIRST version of this section was itself part of the problem. It declared local copies of
   the cleanup and the deletion-counter logic and exercised THOSE, so reverting the production cleanup to
   `===` would have left the suite green — "executed", but executing the wrong code. Everything below now
   runs the shipped functions: the whole of js/firestore-sync.js is loaded into a vm with stubbed browser
   + Firebase globals and driven end to end, and the pure decision helpers are vm-sliced out of their real
   files. A guard at the bottom asserts this file re-implements nothing.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */
const vm = require('vm');
const holdSrc = R('js/firestore-sync.js');
const acctSrc = R('api/account.js');

/* ── The harness: the REAL js/firestore-sync.js, executed. ────────────────────────────────────────
   Only the environment is faked (localStorage, window/document listeners, the Firebase doc handle);
   every line of sync logic under test is the shipped line. `opts.onWrite(payload, n)` fires
   synchronously inside docRef.set — i.e. genuinely DURING the write — and returning `false` from
   `opts.settle(n)` leaves that write pending forever (the offline / in-flight case). */
function makeStore(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    _m: m
  };
}
function harness(opts) {
  opts = opts || {};
  const store = opts.store || makeStore();
  const writes = [];
  const events = {};
  let uid = opts.uid || 'userA';
  const docRef = {
    set(payload) {
      /* deep-copy at call time: a real write serializes the payload before returning, so a later
         in-place mutation of a queued object must not retroactively rewrite what we "sent" */
      try { writes.push(JSON.parse(JSON.stringify(payload))); } catch (_) { writes.push(payload); }
      if (opts.onWrite) opts.onWrite(payload, writes.length);
      if (opts.settle && opts.settle(writes.length) === false) return new Promise(function () {});
      return Promise.resolve();
    },
    get() {
      return Promise.resolve({
        exists: true,
        data: () => ({
          plan: 'free', planType: null, planExpiry: null, isTrial: false, trialEnd: null,
          updatedAt: opts.updatedAt || '2026-01-01T00:00:00.000Z'
        })
      });
    },
    onSnapshot() { return function () {}; }
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, Date, Math, isNaN, String, Number, Boolean, Promise, setTimeout, clearTimeout,
    localStorage: store,
    window: { addEventListener: (e, f) => { events[e] = f; } },
    document: { addEventListener: (e, f) => { events[e] = f; }, visibilityState: 'visible' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => '__serverTs__' } } },
    FirebaseApp: {
      isReady: () => true,
      getUserId: () => uid,
      getDb: () => ({ collection: () => ({ doc: () => docRef }) })
    }
  };
  ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* the real entitlement core supplies _toMillis — without it baseUpdatedAt would always be 0 and the
     buffer freshness guard below could never be exercised */
  vm.runInContext(R('data/entitlement-core.js'), ctx, { filename: 'entitlement-core.js' });
  vm.runInContext(holdSrc, ctx, { filename: 'firestore-sync.js' });
  return { ctx, store, writes, events, sync: ctx.FirestoreSync };
}
const tick = () => new Promise((r) => setTimeout(r, 15));

const tests = [];
function test(fn) { tests.push(fn); }

/* ── FS1-a (ADR-122): the logout flush must still WRITE while another flush is in flight ──────────
   The regression this replaces: ADR-121's first cut returned early here and relied on the durable
   buffer replaying. It cannot — see the freshness proof in the next test. This fails on that code. */
test(async function () {
  const h = harness({ settle: (n) => n !== 1 });     /* the first (unload) write never resolves */
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  h.sync.syncStats({ totalAttempted: 10 });
  h.events.beforeunload();                            /* a debounced/unload flush takes the hold */
  ok('FS1 the in-flight flush issued its write and still holds it', h.writes.length === 1);
  h.sync.syncStats({ totalAttempted: 11 });           /* the answer recorded inside the write window */
  let calledBack = false;
  h.sync.flushUpdatesAsync(function () { calledBack = true; });
  await tick();
  ok('FS1 the logout flush WRITES rather than deferring to the in-flight one (ADR-122 regression)',
    h.writes.length === 2, 'writes=' + h.writes.length);
  ok('FS1 that write carries the edit made after the in-flight snapshot',
    h.writes.length === 2 && h.writes[1].stats && h.writes[1].stats.totalAttempted === 11);
  ok('FS1 logout is not blocked — the callback still fires', calledBack === true);
});

/* ── FS1-a2: why deferring to the buffer could never work — the real replay guard, executed ───────
   _persistPendingBuffer stamps baseUpdatedAt from the last KNOWN server updatedAt; the in-flight write
   carries serverTimestamp() and moves the server past it; _replayPendingBuffer then drops the buffer. */
test(async function () {
  const T0 = Date.parse('2026-07-01T00:00:00.000Z');
  const T1 = Date.parse('2026-07-02T00:00:00.000Z');   /* the server advanced (e.g. that in-flight write) */
  const store = makeStore({
    'qr_pending_writes_userA': JSON.stringify({
      uid: 'userA', updates: { stats: { totalAttempted: 11 } }, baseUpdatedAt: T0
    })
  });
  const h = harness({ store: store, updatedAt: new Date(T1).toISOString() });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  await tick();
  ok('FS1 a buffer whose base predates the server updatedAt is DISCARDED on replay',
    store._m['qr_pending_writes_userA'] === undefined);
  const replayed = h.writes.some((w) => w.stats && w.stats.totalAttempted === 11);
  ok('FS1 its contents never reach the server — so "let the buffer replay" loses the data', !replayed);
});

/* ── FS1-a3: an in-place mutation during the write is NOT mistaken for "unchanged" (end to end) ─── */
test(async function () {
  const progress = { totalAttempted: 10, dailyStreak: 3 };
  let armed = false;
  const h = harness({
    /* the answer recorded while the logout write is in flight — the app mutates the very object it
       queued (loadProgress returns _progressCache by reference; recordAnswer mutates it in place).
       Armed only after hydration, so the defaults-fill write during load doesn't trigger it. */
    onWrite: () => { if (armed) progress.totalAttempted = 11; }
  });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  armed = true;
  h.writes.length = 0;
  h.sync.syncStats(progress);
  await new Promise((res) => h.sync.flushUpdatesAsync(res));
  await tick();
  ok('FS1 the flush wrote the value it snapshotted', h.writes.length === 1 && h.writes[0].stats.totalAttempted === 10);
  /* the mutated field must still be queued — the next flush is what proves it wasn't dropped */
  armed = false;
  h.events.pagehide();
  await tick();
  ok('FS1 an in-place edit during the write is retained and reaches the server on the next flush',
    h.writes.length === 2 && h.writes[1].stats && h.writes[1].stats.totalAttempted === 11,
    'writes=' + JSON.stringify(h.writes.map((w) => w.stats && w.stats.totalAttempted)));
});

/* Control: genuinely unchanged data clears the queue AND the buffer, so neither grows without bound. */
test(async function () {
  const h = harness();
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  h.sync.syncStats({ totalAttempted: 10 });
  await new Promise((res) => h.sync.flushUpdatesAsync(res));
  await tick();
  ok('FS1 unchanged data is cleared after a successful write (durable buffer removed)',
    h.store._m['qr_pending_writes_userA'] === undefined);
  h.events.pagehide();
  await tick();
  ok('FS1 …and no redundant follow-up write is issued', h.writes.length === 1);
});

/* ── FS1-b: the hold helpers + the success cleanup, sliced straight out of the production file ──── */
const holdCtx = { _flushHold: 0, _flushHoldSeq: 0, _flushInFlight: false, Object: Object, JSON: JSON };
vm.createContext(holdCtx);
vm.runInContext(
  holdSrc.slice(holdSrc.indexOf('function _acquireFlushHold'), holdSrc.indexOf('var _syncGeneration')), holdCtx);
ok('the real _applySuccessCleanup / hold helpers were loaded (not re-implemented here)',
  typeof holdCtx._applySuccessCleanup === 'function' && typeof holdCtx._acquireFlushHold === 'function');
const tokA = holdCtx._acquireFlushHold();
const tokB = holdCtx._acquireFlushHold();
ok('FS1 a second acquirer is refused while a write is in flight', tokA > 0 && tokB === 0);
ok('FS1 a non-owner cannot release the hold', holdCtx._releaseFlushHold(tokB) === false && holdCtx._flushInFlight === true);
ok('FS1 the owner releases its own hold', holdCtx._releaseFlushHold(tokA) === true && holdCtx._flushInFlight === false);
const tokC = holdCtx._acquireFlushHold();
ok('FS1 a stale token from an earlier write cannot release the current one',
  holdCtx._releaseFlushHold(tokA) === false && holdCtx._flushInFlight === true && tokC !== tokA);
holdCtx._releaseFlushHold(tokC);

/* the cleanup's edge cases, against the REAL function */
function cleanupCase(before, mutate) {
  const pending = { stats: before };
  const keys = Object.keys(pending);
  const snapSig = {}; keys.forEach((k) => { snapSig[k] = holdCtx._sigOf(pending[k]); });
  if (mutate) mutate(pending);
  return holdCtx._applySuccessCleanup(pending, keys, snapSig);
}
ok('FS1 a distinct object with identical content is cleared (content, not identity)',
  !Object.prototype.hasOwnProperty.call(cleanupCase({ a: 1 }, (p) => { p.stats = { a: 1 }; }), 'stats'));
ok('FS1 a changed value is retained',
  Object.prototype.hasOwnProperty.call(cleanupCase({ a: 1 }, (p) => { p.stats = { a: 2 }; }), 'stats'));
const circular = {}; circular.self = circular;
ok('FS1 an unserializable value is retained, never silently dropped',
  Object.prototype.hasOwnProperty.call(cleanupCase(circular, null), 'stats'));

const fuaBody = (holdSrc.match(/function flushUpdatesAsync\(callback\)[\s\S]*?\n  \}/) || [''])[0];
ok('FS1 flushUpdatesAsync no longer short-circuits on _flushInFlight (ADR-122)',
  !/if \(_flushInFlight\)/.test(fuaBody));
ok('FS1 it uses the shared cleanup rather than an inline copy',
  /_applySuccessCleanup\(_pendingUpdates, keys, snapSig\)/.test(fuaBody));
ok('FS1 no path sets _flushInFlight directly outside the acquire helper',
  (holdSrc.match(/_flushInFlight = true/g) || []).length === 1);
ok('FS1 the debounced flush no longer computes a signature it never reads',
  !/snapSig/.test((holdSrc.match(/function _flushUpdates\(\)[\s\S]*?\n  \}/) || [''])[0]));

/* ── FS2: pagehide is wired alongside beforeunload + visibilitychange ────────────────────────────── */
ok('FS2 pagehide persists the durable buffer (mobile discard fires no beforeunload)',
  /addEventListener\('pagehide'[\s\S]{0,220}?_persistPendingBuffer\(\)/.test(holdSrc));
['beforeunload', 'visibilitychange'].forEach(function (evt) {
  ok('FS2 ' + evt + ' still persists the buffer',
    new RegExp("addEventListener\\('" + evt + "'[\\s\\S]{0,260}?_persistPendingBuffer\\(\\)").test(holdSrc));
});

/* ── FS3: the coaching decrement is idempotent across a retry, in BOTH crash positions ───────────── */
/* The DECISION is production code, vm-sliced out of api/account.js; only the Firestore mechanics
   (apply the update, decrement the counter) live in the harness. */
const acctCtx = {};
vm.createContext(acctCtx);
vm.runInContext(
  acctSrc.slice(acctSrc.indexOf('function _coachingDecrementPlan'), acctSrc.indexOf('/* ── ?action=delete (POST) ── */')),
  acctCtx);
ok('the real _coachingDecrementPlan was loaded (not re-implemented here)',
  typeof acctCtx._coachingDecrementPlan === 'function');
function runDeletionCounterTx(world) {
  const u = world.users[world.uid] || null;
  const cid = acctCtx._coachingDecrementPlan(u);          /* ← production decision */
  if (!cid) return false;
  if (!world.coachings[cid]) return false;               /* ADR-122: missing coaching doc ⇒ skip, don't abort */
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
/* ADR-122: a deleted coaching must not take the transaction (and the coachingId clear) down with it */
let w4 = { uid: 'u4', users: { u4: { coachingId: 'gone' } }, coachings: {} };
ok('FS3 a missing coaching doc is skipped, not treated as a decrement',
  runDeletionCounterTx(w4) === false);
ok('FS3 the decrement runs inside a transaction that also clears coachingId',
  /runTransaction\([\s\S]{0,1200}?coachingId: admin\.firestore\.FieldValue\.delete\(\)[\s\S]{0,300}?studentCount: admin\.firestore\.FieldValue\.increment\(-1\)/.test(acctSrc));
ok('FS3 the transaction reads the coaching doc before updating it (tx.update throws on a missing doc)',
  /tx\.get\(db\.collection\('coachings'\)\.doc\(cid\)\)[\s\S]{0,200}?if \(!cSnap\.exists\) return;/.test(acctSrc));
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

/* ── GUARD (ADR-122): this file must not carry a private copy of any logic it claims to verify ──── */
const selfSrc = fs.readFileSync(__filename, 'utf8');
ok('GUARD no local re-implementation of the flush cleanup or its signature helper',
  !/function\s+(sigOf|cleanupAfterWrite|applySuccessCleanup)\s*\(/.test(selfSrc));
ok('GUARD the cleanup + hold + deletion decisions all come from production sources',
  typeof holdCtx._applySuccessCleanup === 'function' &&
  typeof holdCtx._sigOf === 'function' &&
  typeof acctCtx._coachingDecrementPlan === 'function');
ok('GUARD the flush behaviour is driven through the real module, not a model of it',
  /vm\.runInContext\(holdSrc, ctx/.test(selfSrc) && /h\.sync\.flushUpdatesAsync\(/.test(selfSrc));

/* the executed end-to-end tests are async; run them in order, then report */
(async function () {
  for (const t of tests) {
    try { await t(); } catch (err) { fail++; console.log('  FAIL executed test threw — ' + (err && err.message)); }
  }
  console.log('firestore-durability.check: ' + pass + ' passed, ' + fail + ' failed');
  /* explicit: the executed harnesses leave the module's own debounce timers armed inside the vm, which
     would otherwise keep the event loop alive after the report */
  process.exit(fail > 0 ? 1 : 0);
})();
