/**
 * purge-gap.check.js — ADR-152 / ADR-160: a purge must never reach the NEXT user's server document.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Signing out of A and into B purges localStorage. AppState.getProgress() never returns null — it hands
 * back a zeroed DEFAULT_PROGRESS clone (js/state/store.js) — so between the purge and the moment B's real
 * document arrives, ANY surface that reads progress gets zeros, persists them, and queues a `stats` write.
 * That write lands on B. The user loses their entire history, server-side, silently, days before they
 * would ever notice.
 *
 * ADR-152 added `_purgedAwaitingHydration` to drop those writes. ADR-160 found it wired to only ONE of the
 * two purge paths, and actively CLEARED on the failure path:
 *
 *   · WARM switch  — resetSyncState() raises the flag. Covered from the start.
 *   · COLD switch  — the app was closed while A was signed in and reopened as B, so resetSyncState() never
 *                    runs. loadFromFirestore purges on a uid change and did NOT raise the flag. The gap is
 *                    LARGER here: that purge is synchronous and runs BEFORE docRef.get() is even issued, so
 *                    it spans the whole network round-trip — and forever if the read ultimately fails.
 *   · READ FAILS   — the retries-exhausted branch set the flag false alongside `_dataLoaded`, reasoning that
 *                    hydration was "done". It had FAILED. _flushUpdates' cross-user guard cannot catch it
 *                    either: that guard reads `(_loadedUserId && currentUserId !== _loadedUserId)` and
 *                    _loadedUserId is still null there, so the && short-circuits and it does not abort.
 *
 * These are BEHAVIOURAL tests, not source greps. The real js/firestore-sync.js, js/progress.js,
 * js/state/store.js, js/state/storage-registry.js and js/mistake-archive.js run in a vm against a fake
 * Firestore, and the assertion is on the resulting WRITE LOG and the final server document. Reverting
 * either fix turns both red — verified: B's totalAttempted goes 777 -> 0.
 *
 *   node scripts/purge-gap.check.js      (run from main-app/)
 */
'use strict';
var vm = require('vm'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

function build(opts) {
  opts = opts || {};
  var localStore = {};
  var win = {};
  var listeners = {};
  var body = { classList: { _s:{}, add:function(c){this._s[c]=true;}, remove:function(c){delete this._s[c];}, contains:function(c){return !!this._s[c];} } };

  /* --- fake firestore --- */
  var server = {};            // uid -> doc data (plain object)
  var writeLog = [];          // {uid, payload, kind}
  var subWriteLog = [];
  var failNextSet = 0;
  var pendingSets = [];       // deferred promises when opts.offline
  var snapshotCbs = [];

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function mergeInto(dst, src) {
    Object.keys(src).forEach(function(k){ dst[k] = src[k]; });
    return dst;
  }
  function makeDocRef(uid, coll, docId) {
    var isRoot = !coll;
    return {
      id: uid,
      firestore: dbApi,
      collection: function(c){ return { doc: function(d){ return makeDocRef(uid, c, d); }, add: function(payload){ subWriteLog.push({uid:uid, coll:c, add:payload}); return Promise.resolve({id:'x'}); }, orderBy:function(){return this;}, limit:function(){return this;}, onSnapshot:function(){ return function(){}; } }; },
      get: function () {
        if (opts.loadFails) return Promise.reject(new Error('unavailable'));
        var d = server[uid];
        var res = { exists: !!d, data: function(){ return server[uid] ? clone(server[uid]) : undefined; } };
        if (opts.slowGetMs) return new Promise(function(r){ setTimeout(function(){ r(res); }, opts.slowGetMs); });
        return Promise.resolve(res);
      },
      set: function (payload, o) {
        var rec = { uid: uid, coll: coll || null, docId: docId || null, payload: JSON.parse(JSON.stringify(payload, function(k,v){ return v; })) };
        if (isRoot) writeLog.push(rec); else subWriteLog.push(rec);
        if (failNextSet > 0) { failNextSet--; return Promise.reject(new Error('write failed')); }
        if (isRoot) { server[uid] = server[uid] || {}; mergeInto(server[uid], JSON.parse(JSON.stringify(payload))); }
        if (opts.offline) { return new Promise(function(){}); }
        return Promise.resolve();
      },
      update: function (payload) { writeLog.push({uid:uid, update:payload}); return Promise.resolve(); },
      onSnapshot: function (cb, errCb) { snapshotCbs.push({uid:uid, cb:cb}); return function(){}; }
    };
  }
  var dbApi = { collection: function (c) { return { doc: function (uid) { return makeDocRef(uid); } }; } };

  var currentUid = opts.uid || null;
  var sandbox = {
    window: win,
    navigator: { userAgent: 'node' },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore,k) ? localStore[k] : null; },
      setItem: function (k,v) { localStore[k] = String(v); },
      removeItem: function (k) { delete localStore[k]; },
      key: function (i) { return Object.keys(localStore)[i] || null; },
      get length() { return Object.keys(localStore).length; }
    },
    sessionStorage: { getItem:function(){return null;}, setItem:function(){}, removeItem:function(){}, key:function(){return null;}, length:0 },
    document: { body: body, addEventListener: function(e,f){ (listeners[e]=listeners[e]||[]).push(f); }, getElementById: function(){ return null; }, querySelector: function(){ return null; } },
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    Date: Date, JSON: JSON, Math: Math, Promise: Promise, Object: Object, Array: Array, String: String, Number: Number, parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite,
    fetch: function () { return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); } }); },
    firebase: { firestore: { FieldValue: { serverTimestamp: function () { return { __srv: true, at: Date.now() }; } } } },
    FirebaseApp: {
      isReady: function () { return true; },
      getUserId: function () { return currentUid; },
      getDb: function () { return dbApi; }
    },
    Auth: { getCurrentUser: function () { return { email: 'x@y.z', getIdToken: function(){ return Promise.resolve('t'); } }; }, getIdToken: function(){ return Promise.resolve('t'); } },
    Session: { id: function(){ return 'sid1'; }, header: function(){ return {}; } },
    showToast: function () {},
  };
  sandbox.self = win; sandbox.global = sandbox;
  win.addEventListener = function (e, f) { (listeners[e]=listeners[e]||[]).push(f); };
  win.Session = sandbox.Session;
  vm.createContext(sandbox);

  // real modules
  ['js/state/storage-registry.js','js/state/store.js','js/mistake-archive.js','data/entitlement-core.js','js/progress.js']
    .forEach(function(rel){
      var p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) { console.log('MISSING ' + rel); return; }
      vm.runInContext(fs.readFileSync(p,'utf8'), sandbox, { filename: rel });
    });
  Object.keys(win).forEach(function (k) { if (sandbox[k] === undefined) sandbox[k] = win[k]; });
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/firestore-sync.js'),'utf8'), sandbox, { filename: 'js/firestore-sync.js' });

  return {
    sandbox: sandbox, localStore: localStore, server: server, writeLog: writeLog, subWriteLog: subWriteLog,
    setUid: function (u) { currentUid = u; },
    getUid: function () { return currentUid; },
    failNext: function (n) { failNextSet = n; },
    fire: function (evt) { (listeners[evt]||[]).forEach(function(f){ f(); }); },
    snapshotCbs: snapshotCbs
  };
}


/* ═══════════════════════════════════════════════════════════════════════════════════════════════════
   THE SCENARIOS
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */

var pass = 0, fail = 0;
function ok(c, m, d) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }

console.log('Purge gap — a purge must never reach the next user\'s server doc (ADR-152 / ADR-160)\n');

function stats(n) {
  return { totalAttempted: n, totalCorrect: n, bestStreak: n, currentStreak: 0, drillSessions: 1,
    timedTestSessions: 0, dailyStreak: 3, bestDailyStreak: 5, lastActiveDate: 'Mon Jan 01 2024',
    lastPracticeDate: 'Mon Jan 01 2024', todayAttempted: n, todayCorrect: n,
    categoryStats: { algebra: { attempted: n, correct: n } },
    mistakes: [{ id: 'm1', ts: 1, v: 3, qkey: 'q1', ext: {} }], responseTimes: [1, 2], dailyHistory: {} };
}
function doc(n) {
  return { plan: 'free', planType: null, planExpiry: null, planSource: null, isTrial: false, trialEnd: null,
    createdAt: '2024-01-01', updatedAt: '2024-01-01', settings: {}, stats: stats(n), quickLinks: ['a'],
    customTopics: [], customFormulas: {}, bookmarks: [] };
}
/* A zeroed write is the fingerprint of DEFAULT_PROGRESS reaching the wire. */
function zeroed(w) {
  var s = w && w.payload && w.payload.stats;
  return !!(s && s.totalAttempted === 0 && s.totalCorrect === 0);
}

/* ── 1. WARM switch, then the hydration READ FAILS ─────────────────────────────────────────────────
   resetSyncState() raised the flag; the retries-exhausted branch used to lower it without hydrating. */
function warmSwitchReadFails(next) {
  var h = build({ loadFails: true });
  var S = h.sandbox, FS = S.FirestoreSync;
  h.server['B'] = doc(777);
  h.setUid('B');
  FS.resetSyncState();
  FS.loadFromFirestore(function () {
    S.invalidateProgressCache();
    S.loadProgress();                                  /* a surface reads progress inside the gap */
    if (FS.flushUpdatesAsync) FS.flushUpdatesAsync();
    setTimeout(function () {
      var bad = h.writeLog.filter(function (w) { return w.uid === 'B' && zeroed(w); });
      ok(bad.length === 0,
        '** a purge followed by a FAILED hydration writes no zeroed stats to the incoming user',
        bad.length + ' zeroed write(s) reached B');
      ok((h.server['B'].stats || {}).totalAttempted === 777,
        '** ...and B\'s server history is intact',
        'totalAttempted = ' + (h.server['B'].stats || {}).totalAttempted + ', expected 777');
      next();
    }, 60);
  });
}

/* ── 2. COLD switch: app reopened as a different user, slow read ───────────────────────────────────
   resetSyncState() never runs. The purge inside loadFromFirestore must raise the flag itself. */
function coldSwitchSlowRead(next) {
  var h = build({ slowGetMs: 120 });
  var S = h.sandbox, FS = S.FirestoreSync;
  h.server['B'] = doc(777);
  h.localStore['qr_last_uid'] = 'A';                   /* closed while A was signed in */
  h.localStore['qr_progress'] = JSON.stringify(stats(100));
  h.setUid('B');                                      /* reopened as B */
  FS.loadFromFirestore(function () {});
  setTimeout(function () {                            /* inside the network round-trip */
    S.invalidateProgressCache();
    S.loadProgress();
    if (FS.flushUpdatesAsync) FS.flushUpdatesAsync();
  }, 30);
  setTimeout(function () {
    var bad = h.writeLog.filter(function (w) { return w.uid === 'B' && zeroed(w); });
    ok(bad.length === 0,
      '** a COLD account switch writes no zeroed stats during its (larger) purge gap',
      bad.length + ' zeroed write(s) reached B');
    ok((h.server['B'].stats || {}).totalAttempted === 777,
      '** ...and B\'s server history is intact',
      'totalAttempted = ' + (h.server['B'].stats || {}).totalAttempted + ', expected 777');
    next();
  }, 400);
}

/* ── 3. The guard must NOT break the legitimate first-session write (ADR-054) ──────────────────────
   A genuine new user, no purge anywhere, must still be able to persist stats. A guard that blocks
   everything would pass tests 1 and 2 while silently breaking every real save. */
function noPurgeStillWrites(next) {
  var h = build({});
  var S = h.sandbox, FS = S.FirestoreSync;
  h.server['C'] = doc(5);
  h.setUid('C');
  FS.loadFromFirestore(function () {
    FS.syncStats(stats(42));
    if (FS.flushUpdatesAsync) FS.flushUpdatesAsync();
    setTimeout(function () {
      var wrote = h.writeLog.some(function (w) {
        return w.uid === 'C' && w.payload && w.payload.stats && w.payload.stats.totalAttempted === 42;
      });
      ok(wrote, '** a normal session with no purge still persists stats (the guard is not a blanket block)');
      next();
    }, 60);
  });
}

/* ── 4. Source pins — the two places the flag must be raised, and the one it must not be lowered ─── */
function sourcePins() {
  var src = fs.readFileSync(path.join(ROOT, 'js/firestore-sync.js'), 'utf8');
  ok(/_clearUserLocalStorage\(\);\s*[\s\S]{0,1400}?_purgedAwaitingHydration = true;/.test(src),
    '** the COLD-boot purge inside loadFromFirestore raises the guard (ADR-160)');
  ok(/function resetSyncState[\s\S]{0,2600}?_purgedAwaitingHydration = true;/.test(src),
    '** resetSyncState still raises it for the warm path (ADR-152)');
  ok(!/_dataLoaded = true; _purgedAwaitingHydration = false;\s*\/\* retries exhausted/.test(src),
    '** the retries-exhausted branch does NOT lower the guard — that hydration failed, it did not finish');
  ok(/adoption IS a hydration[\s\S]{0,400}?_purgedAwaitingHydration = false;/.test(src),
    '** the ADR-157 snapshot adoption DOES lower it — that one really is a hydration');
  ok(/if \(_purgedAwaitingHydration && field === 'stats'\)/.test(src),
    'the guard itself is still the one queueUpdate consults');
}

warmSwitchReadFails(function () {
  coldSwitchSlowRead(function () {
    noPurgeStillWrites(function () {
      sourcePins();
      console.log('\npurge-gap.check: ' + pass + ' passed, ' + fail + ' failed');
      process.exit(fail === 0 ? 0 : 1);
    });
  });
});
