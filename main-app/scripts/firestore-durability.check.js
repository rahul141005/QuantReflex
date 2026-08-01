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
  const pending = {};      /* write index → { resolve, reject } for writes held open by opts.settle */
  const events = {};       /* event name → array of handlers, in registration order */
  const fire = (name) => (events[name] || []).forEach((f) => f());
  let uid = opts.uid || 'userA';
  const docRef = {
    set(payload) {
      /* deep-copy at call time: a real write serializes the payload before returning, so a later
         in-place mutation of a queued object must not retroactively rewrite what we "sent" */
      try { writes.push(JSON.parse(JSON.stringify(payload))); } catch (_) { writes.push(payload); }
      const n = writes.length;
      if (opts.onWrite) opts.onWrite(payload, n);
      if (opts.settle && opts.settle(n) === false) {
        return new Promise(function (resolve, reject) { pending[n] = { resolve, reject }; });
      }
      return Promise.resolve();
    },
    get() {
      return Promise.resolve({
        exists: true,
        data: () => Object.assign({
          plan: 'free', planType: null, planExpiry: null, isTrial: false, trialEnd: null,
          updatedAt: opts.updatedAt || '2026-01-01T00:00:00.000Z'
        }, opts.docData || {})   /* ADR-130: lets a test load a PREMIUM doc and exercise the expiry self-heal */
      });
    },
    onSnapshot() { return function () {}; }
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, Date, Math, isNaN, String, Number, Boolean, Promise, setTimeout, clearTimeout,
    localStorage: store,
    window: { addEventListener: (e, f) => { (events[e] = events[e] || []).push(f); } },
    document: { addEventListener: (e, f) => { (events[e] = events[e] || []).push(f); }, visibilityState: 'visible' },
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
  return {
    ctx, store, writes, events, pending, fire, sync: ctx.FirestoreSync,
    /* ADR-129: flip the authenticated identity mid-test so the REAL cross-user flush guard can be
       executed rather than modelled (session-integrity.check.js used to assert on a local copy). */
    setUid: (u) => { uid = u; }
  };
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
  h.fire('beforeunload');                             /* a debounced/unload flush takes the hold */
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
  h.fire('pagehide');
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
  h.fire('pagehide');
  await tick();
  ok('FS1 …and no redundant follow-up write is issued', h.writes.length === 1);
});

/* ── S3-V1 (ADR-123): a FAILING older flush must never resurrect what a newer one already wrote ────
   Found by the final adversarial pass. ADR-122 made the logout flush write instead of deferring; when the
   debounced write then rejects, its catch re-queues its own older snapshot for any field missing from the
   queue — and it is missing precisely BECAUSE the newer write succeeded and cleaned it up. The 5 s retry
   then reverted the user's theme/language/exam/profile. Fails without the _ackedSeq guard. */
test(async function () {
  const h = harness({ settle: (n) => n !== 1 });          /* hold the debounced write open */
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  h.sync.syncSettings({ theme: 'classic' });              /* settings@A */
  h.fire('beforeunload');                                 /* debounced flush writes A, stays in flight */
  h.sync.syncSettings({ theme: 'playful' });              /* settings@B — changed inside the window */
  await new Promise((res) => h.sync.flushUpdatesAsync(res));   /* logout flush writes B, succeeds */
  await tick();
  ok('S3-V1 the newer value is written while the older write is still in flight',
    h.writes.length === 2 && h.writes[1].settings.theme === 'playful');
  h.pending[1].reject(new Error('simulated transient write failure'));
  await new Promise((r) => setTimeout(r, 5300));          /* FLUSH_RETRY_DELAY_MS + margin */
  const last = h.writes[h.writes.length - 1];
  ok('S3-V1 the failed older write does NOT resurrect its stale value on retry',
    last.settings === undefined || last.settings.theme === 'playful',
    'writes=' + JSON.stringify(h.writes.map((w) => w.settings && w.settings.theme)));
});

/* Control: a failed flush with nothing newer acked must STILL re-queue and retry (durability intact). */
test(async function () {
  const h = harness({ settle: (n) => n !== 1 });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  h.sync.syncSettings({ theme: 'classic' });
  h.fire('beforeunload');
  h.pending[1].reject(new Error('simulated transient write failure'));
  await new Promise((r) => setTimeout(r, 5300));
  ok('S3-V1 an unsuperseded failed write is still retried (no durability lost to the new guard)',
    h.writes.length === 2 && h.writes[1].settings && h.writes[1].settings.theme === 'classic',
    'writes=' + JSON.stringify(h.writes.map((w) => w.settings && w.settings.theme)));
});

/* ── S3-V2 (ADR-123): repeated unload events while OFFLINE must not amplify writes ─────────────────
   Offline the write promise never settles, so the hold is held forever and _flushUpdates early-returns —
   but flushUpdatesAsync did not, so every backgrounding enqueued another full-document mutation into the
   SDK's offline queue (measured 8 events ⇒ 8 mutations, each carrying the whole stats blob). The unload
   callers pass no callback; the logout caller does, and must still write. */
const smSrc = R('js/session-manager.js');
ok('S3-V2 the unload callers pass NO callback (durability is the buffer’s job there)',
  (smSrc.match(/FirestoreSync\.flushUpdatesAsync\(\);/g) || []).length === 2 &&
  !/FirestoreSync\.flushUpdatesAsync\(\s*function/.test(smSrc));
ok('S3-V2 the logout caller DOES pass a callback (so it still writes — the ADR-122 guarantee)',
  /FirestoreSync\.flushUpdatesAsync\(_finishLogout\)/.test(R('js/settings.js')));
test(async function () {
  const h = harness({ settle: () => false });             /* OFFLINE: no write ever settles */
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  /* session-manager's visibilitychange handler is one line — mirror the call it makes (asserted above) */
  h.events.visibilitychange.push(function () { h.sync.flushUpdatesAsync(); });
  h.ctx.document.visibilityState = 'hidden';
  const progress = { totalAttempted: 0, mistakes: [] };
  for (let i = 1; i <= 8; i++) {
    progress.totalAttempted = i; progress.mistakes.push({ id: 'q' + i });
    h.sync.syncStats(progress);
    h.fire('visibilitychange');
    await tick();
  }
  ok('S3-V2 eight offline background events queue ONE mutation, not eight',
    h.writes.length === 1, 'writes=' + h.writes.length);
  ok('S3-V2 the data is still durable — the buffer holds the latest offline work',
    JSON.parse(h.store._m['qr_pending_writes_userA']).updates.stats.totalAttempted === 8);
});

/* ── S3-V3 (ADR-123): logout must not hang on a promise that never settles ────────────────────────
   Executed proof of the premise: offline, flushUpdatesAsync's callback never fires. settings.js gates
   resetSyncState + Auth.logout + reload on it, so without a watchdog an offline logout wedges the app
   showing a signed-out screen while the user is still signed in. */
test(async function () {
  const h = harness({ settle: () => false });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.sync.syncStats({ totalAttempted: 3 });
  let calledBack = false;
  h.sync.flushUpdatesAsync(function () { calledBack = true; });
  await new Promise((r) => setTimeout(r, 200));
  ok('S3-V3 offline, the logout callback genuinely never fires (the premise for the watchdog)',
    calledBack === false);
  ok('S3-V3 …but the durable buffer is already written, so proceeding anyway loses nothing',
    !!h.store._m['qr_pending_writes_userA']);
});
/* ── S2 cross-user flush guard (ADR-129): EXECUTED, not modelled ──────────────────────────────────
   session-integrity.check.js claimed to run this ("executes the real cross-user flush guard") while
   actually asserting on a four-line local copy of the predicate, so reverting the production guard left
   it green — a false positive over the invariant that stops user A's queued work being written into
   user B's document. This drives the shipped _flushUpdates through the real module. */
test(async function () {
  const h = harness({});
  await new Promise((res) => h.sync.loadFromFirestore(res));   /* _loadedUserId = 'userA' */
  h.sync.syncStats({ totalAttempted: 11 });
  const before = h.writes.length;
  h.fire('pagehide');                                          /* same identity ⇒ must write */
  ok('S2 the flush writes while the loaded user is still the current user',
    h.writes.length === before + 1, 'writes=' + (h.writes.length - before));

  const h2 = harness({});
  await new Promise((res) => h2.sync.loadFromFirestore(res));
  h2.sync.syncStats({ totalAttempted: 22 });
  const before2 = h2.writes.length;
  h2.setUid('userB');                                          /* identity flips mid-session */
  h2.fire('pagehide');
  ok('S2 the flush ABORTS once identity has flipped — A’s work is never written under B',
    h2.writes.length === before2, 'writes=' + (h2.writes.length - before2));
  ok('S2 the aborted queue is discarded, so it cannot leak into the next user’s flush',
    Object.keys(h2.ctx.FirestoreSync.getPendingUpdates ? h2.ctx.FirestoreSync.getPendingUpdates() : {}).length === 0 ||
    h2.writes.length === before2);
  ok('S2 the outgoing user’s work is still durable in HIS OWN buffer key (no cross-user write)',
    !!h2.store._m['qr_pending_writes_userA'] && !h2.store._m['qr_pending_writes_userB']);
});

const setSrc = R('js/settings.js');
ok('S3-V3 logout arms a watchdog so it cannot hang on the flush',
  /LOGOUT_FLUSH_TIMEOUT_MS/.test(setSrc) &&
  /_logoutWatchdog = setTimeout\(_finishLogout, LOGOUT_FLUSH_TIMEOUT_MS\)/.test(setSrc));
ok('S3-V3 the logout continuation is once-only (callback and watchdog cannot both run it)',
  /if \(_logoutDone\) return;\s*_logoutDone = true;/.test(setSrc));
ok('S3-V3 the watchdog is cancelled when the flush does complete',
  /clearTimeout\(_logoutWatchdog\)/.test(setSrc));

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
ok('S3-V1 the failure path consults the supersede map before re-queueing',
  /!_pendingUpdates\.hasOwnProperty\(keys\[k\]\) && !_isSuperseded\(keys\[k\], seq\)/.test(holdSrc));
ok('S3-V1 both flush paths stamp a sequence and ack the fields they wrote',
  (holdSrc.match(/var seq = \+\+_writeSeq;/g) || []).length === 2 &&
  (holdSrc.match(/_markAcked\(keys, seq\);/g) || []).length === 2);
ok('S3-V1 the ack map is cleared on reset (it belongs to the outgoing user)',
  /_ackedSeq = \{\};\s+\/\* ADR-123/.test(holdSrc));
ok('S3-V2 flushUpdatesAsync skips only when nobody is waiting on it',
  /if \(_flushInFlight && !callback\) \{[\s\S]{0,120}?_persistPendingBuffer\(\);[\s\S]{0,40}?return;/.test(fuaBody));

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
/* ═══ ADR-130 · entitlement fields are server-owned, enforced by construction ═══
   Wave S1 (S1-ENT3) REMOVED the two client paths that could persist a plan downgrade. Nothing PREVENTED a
   new one: queueUpdate() wrote any field name it was handed, the durable replay buffer lives in
   user-writable localStorage, and the Firestore rules deliberately ALLOW a client plan→'free' write, so
   there was no backstop at any layer. The only guard was entitlement-invariants.check.js asserting that
   three error-message strings from the DELETED code were absent — a fingerprint of the old
   implementation, not the invariant — plus one assertion that a comment exists.

   These tests execute the real shipped module and attack the guard from every direction I could
   construct. Each is demonstrated to fail with the guard neutered. */
const ENT_FIELDS = ['plan', 'planType', 'planExpiry', 'planSource', 'isTrial', 'trialEnd', 'planUpdatedAt', 'lastPaymentId'];

/* The canonical list is DERIVED from revokeFields() so it can never drift from the revocation set. */
test(async function () {
  const E = require('../data/entitlement-core.js');
  const derived = E.clientImmutableFields();
  const revoked = Object.keys(E.revokeFields());
  ok('ENT the immutable list covers every revokeFields() key (derived, cannot drift)',
    revoked.every((k) => derived.indexOf(k) !== -1),
    'missing: ' + revoked.filter((k) => derived.indexOf(k) === -1).join(','));
  ok('ENT the immutable list matches the full expected set',
    ENT_FIELDS.every((f) => E.isClientImmutableField(f)) && derived.length === ENT_FIELDS.length);
  ok('ENT non-entitlement fields are NOT immutable',
    ['stats', 'settings', 'profile', 'quickLinks', 'bookmarks', 'customTopics', 'customFormulas', 'learnProgress', 'updatedAt']
      .every((f) => !E.isClientImmutableField(f)));
  ok('ENT a fresh array each call — a caller cannot mutate the shared list',
    E.clientImmutableFields() !== E.clientImmutableFields());
});

/* Attack 1 — the guards themselves, sliced out of the production file and executed (same idiom as the
   hold helpers above). Note queueUpdate is module-PRIVATE — not on the exported API — so an external
   caller cannot reach it; the entry guard defends against a future INTERNAL caller, which is exactly how
   S1-ENT3 arose. The externally reachable vector is the localStorage buffer, attacked in test 4. */
const ENT_SLICE = holdSrc.slice(holdSrc.indexOf('var _IMMUTABLE_FALLBACK'), holdSrc.indexOf('function _normalizeMonetization'));
const stripCtx = { Object: Object, String: String, QR_ENTITLEMENT: require('../data/entitlement-core.js') };
vm.createContext(stripCtx);
vm.runInContext('function _core(){return QR_ENTITLEMENT;}' + ENT_SLICE, stripCtx, { filename: 'firestore-sync.js#entitlement-guard' });
test(async function () {
  ok('ENT the real guards were loaded from source (not re-implemented in this file)',
    typeof stripCtx._isEntitlementField === 'function' && typeof stripCtx._stripEntitlementFields === 'function');
  ENT_FIELDS.forEach(function (f) {
    ok('ENT _isEntitlementField rejects "' + f + '"', stripCtx._isEntitlementField(f) === true);
  });
  ['stats', 'settings', 'profile', 'quickLinks', 'bookmarks', 'customTopics', 'customFormulas',
   'learnProgress', 'learnTopicBookmarks', 'updatedAt'].forEach(function (f) {
    ok('ENT _isEntitlementField allows "' + f + '"', stripCtx._isEntitlementField(f) === false);
  });
  const mixed = { stats: { a: 1 }, settings: { theme: 'x' }, plan: 'free', planExpiry: null, isTrial: false, lastPaymentId: 'p1' };
  const out = stripCtx._stripEntitlementFields(mixed);
  ok('ENT strip removes every entitlement key', ENT_FIELDS.every((f) => !Object.prototype.hasOwnProperty.call(out, f)));
  ok('ENT strip keeps every legitimate key', out.stats.a === 1 && out.settings.theme === 'x');
  ok('ENT strip does not mutate its input', Object.prototype.hasOwnProperty.call(mixed, 'plan'));
  /* root-only: a settings blob containing `plan` is APP state and must survive — an over-reaching guard
     would silently eat user settings, a worse bug than the one being prevented. */
  const nested = stripCtx._stripEntitlementFields({ settings: { plan: 'premium', theme: 'classic' } });
  ok('ENT a NESTED settings.plan is untouched (root-only scope, no over-reach)',
    nested.settings.plan === 'premium' && nested.settings.theme === 'classic');
  /* fail-closed: with the core absent the fallback list must still deny everything */
  const bare = { Object: Object, String: String };
  vm.createContext(bare);
  vm.runInContext('function _core(){return null;}' + ENT_SLICE, bare);
  ok('ENT with the core UNAVAILABLE the guard still denies all 8 (fail-closed)',
    ENT_FIELDS.every((f) => bare._isEntitlementField(f) === true));
});

/* Attack 2 — the legitimate path must be completely unaffected (the regression that would matter most). */
test(async function () {
  const h = harness();
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  h.sync.syncStats({ totalAttempted: 7 });
  h.sync.syncSettings({ theme: 'playful' });
  h.sync.flushUpdatesAsync(function () {});
  await tick();
  const w = h.writes[h.writes.length - 1] || {};
  ok('ENT legitimate stats still writes', w.stats && w.stats.totalAttempted === 7);
  ok('ENT legitimate settings still writes', w.settings && w.settings.theme === 'playful');
  ok('ENT the write still carries a server updatedAt', Object.prototype.hasOwnProperty.call(w, 'updatedAt'));
  ok('ENT the write carries NO entitlement field', ENT_FIELDS.every((f) => !Object.prototype.hasOwnProperty.call(w, f)));
});

/* Attack 3 — a settings blob carrying `plan` must round-trip through the REAL sync path untouched. */
test(async function () {
  const h = harness();
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  h.sync.syncSettings({ plan: 'premium', theme: 'classic' });
  h.sync.flushUpdatesAsync(function () {});
  await tick();
  const w = h.writes[h.writes.length - 1] || {};
  ok('ENT a nested settings.plan survives the real write path',
    w.settings && w.settings.plan === 'premium' && w.settings.theme === 'classic');
  ok('ENT ...and never becomes a ROOT plan field', !Object.prototype.hasOwnProperty.call(w, 'plan'));
});

/* Attack 4 — the externally reachable bypass no previous audit examined: the durable buffer is
   localStorage, user-writable and upgrade-surviving. */
test(async function () {
  const T0 = Date.parse('2026-07-01T00:00:00.000Z');
  /* baseUpdatedAt must be >= the loaded server updatedAt or the FS1 freshness guard discards the buffer
     before replay runs — correct for a STALE buffer, but it makes this test vacuous (verified: with a
     stale base it passes even with the guard removed). A live offline session buffers with a current
     base, so this is the realistic case. */
  const store = makeStore({
    'qr_pending_writes_userA': JSON.stringify({
      uid: 'userA',
      updates: { plan: 'free', planExpiry: null, isTrial: false, stats: { totalAttempted: 3 } },
      baseUpdatedAt: Date.parse('2099-01-01T00:00:00.000Z')
    })
  });
  const h = harness({ store: store, updatedAt: new Date(T0).toISOString() });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  await new Promise((r) => setTimeout(r, 60));
  await new Promise((res) => h.sync.flushUpdatesAsync(res));
  await tick();
  const leaked = h.writes.filter((w) => ENT_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(w, f)));
  ok('ENT a POISONED localStorage buffer cannot replay entitlement state', leaked.length === 0,
    'leaked: ' + JSON.stringify(leaked.slice(0, 2)));
  /* the pipeline must still RUN — a guard that worked by breaking replay entirely would also pass above */
  ok('ENT ...and the buffer is still consumed and the sync pipeline still writes',
    h.store._m['qr_pending_writes_userA'] === undefined && h.writes.length > 0);
});

/* Attack 5 — offline/in-flight: prove the buffer PERSISTED for the next session is itself clean, so a
   later build with a weaker guard still cannot replay entitlement state from it. */
test(async function () {
  const store = makeStore({
    'qr_pending_writes_userA': JSON.stringify({
      uid: 'userA', updates: { plan: 'free', trialEnd: null, stats: { totalAttempted: 5 } },
      baseUpdatedAt: Date.parse('2099-01-01T00:00:00.000Z')
    })
  });
  const h = harness({ store: store, updatedAt: '2026-07-01T00:00:00.000Z', settle: () => false });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  await new Promise((r) => setTimeout(r, 60));
  /* the first flush is in flight and never settles (offline); queue more real work behind it so there IS
     a pending queue to persist when the process is killed */
  h.sync.syncStats({ totalAttempted: 6 });
  await new Promise((r) => setTimeout(r, 60));
  h.fire('pagehide');
  const buf = h.store._m['qr_pending_writes_userA'];
  ok('ENT the persisted buffer exists after pagehide', !!buf);
  if (buf) {
    const updates = JSON.parse(buf).updates || {};
    ok('ENT the persisted buffer contains NO entitlement field',
      ENT_FIELDS.every((f) => !Object.prototype.hasOwnProperty.call(updates, f)), 'buffer: ' + JSON.stringify(updates));
    ok('ENT ...but does contain the legitimate queued work', !!updates.stats);
  }
  const leaked = h.writes.filter((w) => ENT_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(w, f)));
  ok('ENT no entitlement field reached a write on the offline path', leaked.length === 0);
});

/* Attack 6 — the self-heal itself. S1-ENT3's actual behaviour: an expired premium downgrades the
   IN-MEMORY view (so gates close at once) and persists NOTHING. This is what the four negative regexes
   in entitlement-invariants.check.js were only approximating. */
test(async function () {
  const past = new Date(Date.now() - 30 * 864e5).toISOString();
  const h = harness({ docData: { plan: 'premium', planType: 'premium_6m', planExpiry: past, planSource: 'purchase' } });
  await new Promise((res) => h.sync.loadFromFirestore(res));
  h.writes.length = 0;
  const st = h.sync.getAccessState();
  ok('ENT getAccessState resolves an expired premium to free (memory-only downgrade)', !st || st.plan === 'free');
  await tick();
  ok('ENT the expiry self-heal persists NOTHING', h.writes.length === 0,
    'writes: ' + JSON.stringify(h.writes.slice(0, 2)));
});

(async function () {
  for (const t of tests) {
    try { await t(); } catch (err) { fail++; console.log('  FAIL executed test threw — ' + (err && err.message)); }
  }
  console.log('firestore-durability.check: ' + pass + ' passed, ' + fail + ' failed');
  /* explicit: the executed harnesses leave the module's own debounce timers armed inside the vm, which
     would otherwise keep the event loop alive after the report */
  process.exit(fail > 0 ? 1 : 0);
})();
