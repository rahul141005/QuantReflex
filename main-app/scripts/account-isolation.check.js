/**
 * account-isolation.check.js — cross-account contamination guard (ADR-119).
 *
 * WHY THIS FILE EXISTS AND WHY IT LOOKS LIKE THIS
 * -----------------------------------------------
 * The previous guard reported 42/42 green while FIFTEEN live user-scoped localStorage keys survived an
 * account switch. It passed because it asserted that cleanup FUNCTIONS ARE CALLED. That is not the
 * property anyone cares about. The property is that cleanup is COMPLETE with respect to what the
 * repository actually persists.
 *
 * So this check does two things the old one could not:
 *
 *   1. BEHAVIOURAL — it executes the real registry against a fake localStorage seeded with user A's
 *      state, runs the real purge, and asserts on the RESULT: nothing of A's survives, everything
 *      device/installation-scoped does.
 *
 *   2. DRIFT DETECTION — it derives the persisted-key inventory FROM SOURCE (every writer under js/)
 *      and fails when a key is not covered by an ownership decision. Adding persistent user state now
 *      requires classifying it; forgetting is a red build rather than a silent leak.
 *
 *   node scripts/account-isolation.check.js     (run from main-app/)
 */
'use strict';
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
var ROOT = path.join(__dirname, '..');
var R = function (p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); };

var QRStorage = require('../js/state/storage-registry.js');
var QRIdentity = require('../js/identity.js');

console.log('Account isolation — purge completeness, ownership, identity lifecycle (ADR-119)\n');

/* ── A minimal but faithful Storage: index-ordered, string-coerced, `length`/`key(i)` like the real one ── */
function FakeStorage(seed) {
  var map = Object.create(null), order = [];
  var api = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { if (!Object.prototype.hasOwnProperty.call(map, k)) order.push(k); map[k] = String(v); api.length = order.length; },
    removeItem: function (k) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) return;
      delete map[k]; order.splice(order.indexOf(k), 1); api.length = order.length;
    },
    key: function (i) { return i >= 0 && i < order.length ? order[i] : null; },
    keys: function () { return order.slice(); },
    length: 0
  };
  if (seed) Object.keys(seed).forEach(function (k) { api.setItem(k, seed[k]); });
  return api;
}

/* ── 1. Behavioural: user A's full footprint must not survive the purge ───────────────────────── */

/* Everything a real signed-in student accumulates, spanning every leak the V2 audit confirmed. */
var USER_A_STATE = {
  'qr_settings': JSON.stringify({ theme: 'playful', darkMode: true, appLanguage: 'hi', targetExam: 'cat', onboardingCompleted: true }),
  'qr_progress': JSON.stringify({ totalAttempted: 900, bestStreak: 42 }),
  'qr_active_exam': 'cat',                 /* legacy target-exam mirror — the deterministic leak */
  'qr_explain_credits': '1',               /* in-drill free hints already spent by A */
  'qr_best_scores': JSON.stringify({ drill: 98 }),
  'qr_last_speed_score': '87',
  'qr_sessions_count': '31',
  'qr_report_queue': JSON.stringify([{ id: 'r1', body: "A's bug report" }]),
  'qr_ai_dirty_at': '1750000000000',
  'qr_ai_seen_coach': '1',
  'qr_recent_cats': JSON.stringify(['percentages']),
  'qr_pinned_cats': JSON.stringify(['ratios']),
  'qr_catpicker_open': '1',
  'qr_quickref_open': '1',
  'qr_learn_filter': 'algebra',
  'qr_duel_acked': JSON.stringify(['duel-1']),
  'qr_exam_nudge_dismissed': '1',
  'qr_quick_links': JSON.stringify(['fractionTable']),
  'qr_custom_topics': JSON.stringify(['mine']),
  'qr_custom_formulas': JSON.stringify({ a: 'b' }),
  'qr_bookmarks': JSON.stringify(['q1']),
  'qr_notif_enabled': 'true',
  'premiumStatus': 'premium',              /* pre-prefix legacy entitlement mirror */
  'qr_premium': 'true',
  'quant_reflex_settings': JSON.stringify({ theme: 'playful' }),
  'quant_reflex_progress': JSON.stringify({ totalAttempted: 900 }),
  'quant_onboarding_complete': 'true',     /* the legacy twin that used to resurrect after the purge */
  'quant_learn_progress': JSON.stringify({ t1: {} }),
  'quant_learn_bookmarks': JSON.stringify(['t1']),
  'quant_ai_coach_cache_uidA': 'cached',
  'quant_bookmarks': JSON.stringify(['q0'])
};

var MUST_SURVIVE = {
  'qr_session_id': 'sid-device-1',
  'qr_session_uid': 'uidA',
  'qr_session_replaced': '1',
  'qr_last_uid': 'uidA',
  'qr_pending_writes': JSON.stringify({ uid: 'uidA', updates: { stats: {} }, baseUpdatedAt: 1 }),
  'qr_pending_writes_uidA': JSON.stringify({ uid: 'uidA', updates: { stats: {} }, baseUpdatedAt: 1 }),
  'qr_i18n_preview': '1',
  'qr_appUpdating': 'true',
  'qr_update_2026-07-25': 'seen',
  'someOtherApp_token': 'not-ours'
};

var seed = {};
Object.keys(USER_A_STATE).forEach(function (k) { seed[k] = USER_A_STATE[k]; });
Object.keys(MUST_SURVIVE).forEach(function (k) { seed[k] = MUST_SURVIVE[k]; });

var store = FakeStorage(seed);
var removed = QRStorage.purgeUserScoped(store);

var leaked = Object.keys(USER_A_STATE).filter(function (k) { return store.getItem(k) !== null; });
ok(leaked.length === 0, '1 NO user-scoped key survives the purge — leaked: ' + JSON.stringify(leaked));

var destroyed = Object.keys(MUST_SURVIVE).filter(function (k) { return store.getItem(k) === null; });
ok(destroyed.length === 0, '1 device/installation/foreign state is preserved — wrongly destroyed: ' + JSON.stringify(destroyed));

ok(removed.length === Object.keys(USER_A_STATE).length,
  '1 purge reports exactly the user-scoped keys it removed (' + removed.length + '/' + Object.keys(USER_A_STATE).length + ')');

/* The specific confirmed-bug keys, named so a regression says WHICH product symptom returned. */
[
  ['qr_active_exam', "B would inherit A's target exam (wrong syllabus)"],
  ['qr_settings', "B would inherit A's theme / dark mode / UI language"],
  ['qr_explain_credits', "B would inherit A's spent free-hint credits"],
  ['qr_report_queue', "A's queued bug reports would submit under B's token"],
  ['qr_best_scores', "B would see A's personal bests"],
  ['qr_last_speed_score', "B would see A's speed score"],
  ['qr_ai_dirty_at', "B would inherit A's AI insights badge state"],
  ['qr_ai_seen_coach', "B would inherit A's AI seen-state"],
  ['premiumStatus', "B would inherit A's legacy premium mirror"],
  ['qr_premium', "B would inherit A's legacy premium flag"],
  ['quant_onboarding_complete', 'the legacy onboarding twin would resurrect for B']
].forEach(function (pair) {
  ok(store.getItem(pair[0]) === null, '1 ' + pair[0] + ' purged — else ' + pair[1]);
});

/* Idempotence + empty-store safety: a second purge must be a clean no-op. */
ok(QRStorage.purgeUserScoped(store).length === 0, '1 a second purge removes nothing (idempotent)');
ok(QRStorage.purgeUserScoped(FakeStorage({})).length === 0, '1 purging an empty store is safe');

/* ── 2. Fail-safe default: an UNREGISTERED key is user-scoped, therefore purged ───────────────── */
var future = FakeStorage({ 'qr_some_feature_nobody_classified': 'x', 'quant_legacy_thing': 'y' });
QRStorage.purgeUserScoped(future);
ok(future.getItem('qr_some_feature_nobody_classified') === null && future.getItem('quant_legacy_thing') === null,
  '2 a key nobody classified is PURGED, not inherited (forgetting fails safe)');
ok(QRStorage.classify('qr_anything_new') === 'user', '2 unknown app-prefixed keys classify as user-scoped');
ok(QRStorage.classify('unrelated_app_key') === 'foreign', '2 keys outside our prefixes are never touched');
ok(QRStorage.classify('qr_session_id') === 'device', '2 declared device state classifies as device');
ok(QRStorage.classify('qr_appUpdating') === 'installation', '2 declared install state classifies as installation');
ok(QRStorage.classify('qr_update_2026-01-01') === 'installation', '2 installation PREFIXES are honoured');
ok(QRStorage.classify('qr_pending_writes') === 'user-deferred', '2 the legacy single-slot write buffer is user-deferred');
ok(QRStorage.classify('qr_pending_writes_uidA') === 'user-deferred', '2 per-uid write buffers are user-deferred');
ok(QRStorage.classify(null) === 'foreign' && QRStorage.classify('') === 'foreign', '2 junk input never classifies as ours');

/* ── 3. DRIFT GUARD — derive the inventory from SOURCE, not from a hand-kept list ─────────────── */
function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules/.test(p)) walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  });
  return out;
}
var jsFiles = walk(path.join(ROOT, 'js'));

/* Collect literal keys AND keys held in `var SOMETHING_KEY = '...'` constants, which is how half the
   leaking modules declared theirs (a literal-only scan is exactly how they stayed invisible). */
var discovered = Object.create(null);
jsFiles.forEach(function (f) {
  var src = fs.readFileSync(f, 'utf8');
  var rel = path.relative(ROOT, f);
  var m;
  var direct = /(?:localStorage|sessionStorage)\.(?:set|remove|get)Item\(\s*'([^']+)'/g;
  while ((m = direct.exec(src))) add(m[1], rel);
  /* ADR-120 (R5 insurance): widened from /var\s+.../ to var|let|const, and the qr_/quant_ prefix gate
     is gone — a NON-prefixed key held in a constant is precisely the case that would escape both this
     scan and the prefix purge (premiumStatus is the historical example), so it must be discoverable. */
  var constDecl = /(?:var|let|const)\s+(\w*(?:KEY|PREFIX)\w*)\s*=\s*'([^']+)'/g;
  while ((m = constDecl.exec(src))) {
    var name = m[1], val = m[2];
    /* The usage gate must prove this constant is actually a STORAGE key. The old gate also accepted
       `NAME +` and `: NAME` anywhere in the file, which — once the qr_/quant_ prefix filter was removed —
       started matching unrelated constants that merely end in _KEY (the VAPID public key, the Razorpay
       key id). Require the name to appear INSIDE a storage call, which still covers prefix constants
       concatenated into a key, e.g. getItem(PREFIX + uid). */
    if (new RegExp('(?:localStorage|sessionStorage)\\.[a-zA-Z]*Item\\([^)]*\\b' + name + '\\b').test(src)) add(val, rel);
  }
  function add(k, where) { (discovered[k] = discovered[k] || []).push(where); }
});

var found = Object.keys(discovered);
ok(found.length >= 20, '3 drift scan discovered a plausible inventory (' + found.length + ' keys)');

/* Every discovered key must resolve to a DELIBERATE ownership decision. 'user' is the fail-safe
   default, so what we are really asserting is that nothing we own lands outside the model. */
var unclassified = found.filter(function (k) { return QRStorage.classify(k) === 'foreign'; });
ok(unclassified.length === 0,
  '3 every persisted key the repo writes is owned by the registry — unowned: ' +
  JSON.stringify(unclassified.map(function (k) { return k + ' (' + discovered[k].join(',') + ')'; })));

/* Survivors are the dangerous category: each one must be justified, so pin the set. Adding a survivor
   is a deliberate act that must update this list AND the registry. */
var survivors = found.filter(function (k) { return QRStorage.classify(k) !== 'user'; }).sort();
var EXPECTED_SURVIVORS = [
  'qr_appUpdating', 'qr_i18n_preview', 'qr_last_uid', 'qr_pending_writes',
  'qr_session_id', 'qr_session_replaced', 'qr_session_uid', 'qr_update_'
].filter(function (k) { return found.indexOf(k) !== -1; });
ok(JSON.stringify(survivors) === JSON.stringify(EXPECTED_SURVIVORS),
  '3 the set of keys that SURVIVE an account change is exactly the reviewed list\n      got:      ' +
  JSON.stringify(survivors) + '\n      expected: ' + JSON.stringify(EXPECTED_SURVIVORS));

/* The dead onboarding API must stay dead — it carried the resurrection path. */
var storeSrc = R('js/state/store.js');
ok(!/function getOnboardingDone/.test(storeSrc) && !/function setOnboardingDone/.test(storeSrc),
  '3 the dead onboarding accessor pair is gone (it carried the legacy resurrection path)');
var keysBlock = storeSrc.slice(storeSrc.indexOf('var KEYS = {'), storeSrc.indexOf('};', storeSrc.indexOf('var KEYS = {')));
ok(!/qr_onboarding_done/.test(keysBlock), '3 KEYS no longer declares qr_onboarding_done');
/* Any surviving LEGACY twin must be purge-covered, or a cleared canonical key resurrects A's value. */
var legacyBlock = storeSrc.slice(storeSrc.indexOf('var LEGACY = {'), storeSrc.indexOf('};', storeSrc.indexOf('var LEGACY = {')));
var legacyTwins = (legacyBlock.match(/'(quant_[^']+)'/g) || []).map(function (s) { return s.replace(/'/g, ''); });
var resurrectable = legacyTwins.filter(function (k) { return QRStorage.classify(k) !== 'user'; });
ok(legacyTwins.length > 0 && resurrectable.length === 0,
  '3 every LEGACY twin is user-scoped, so a purged canonical key cannot resurrect from it — ' + JSON.stringify(resurrectable));

/* ── 4. Identity lifecycle: ownership is deterministic and async work cannot cross accounts ──── */
QRIdentity._reset();
ok(QRIdentity.phase() === 'idle' && QRIdentity.activeUid() === null, '4 starts idle with no owner');

QRIdentity.beginTransition('A');
ok(QRIdentity.isTransitioning(), '4 beginTransition enters the transitioning phase');
ok(QRIdentity.activeUid() === null, '4 NO uid owns the app state mid-transition (never a half-owner)');
QRIdentity.completeTransition('A');
ok(QRIdentity.activeUid() === 'A' && QRIdentity.isActive('A'), '4 completeTransition establishes the owner');

/* the capture/validate contract — this is what stops a late A callback acting as B */
var tokenA = QRIdentity.capture();
ok(QRIdentity.isCurrent(tokenA), '4 a token captured under A is current while A is active');

var ranAsB = false;
var lateAWork = QRIdentity.guard(tokenA, function () { ranAsB = true; });
QRIdentity.beginTransition('B');
lateAWork();
ok(!ranAsB, "4 A's in-flight work is ALREADY inert mid-transition (generation bumps before teardown)");
QRIdentity.completeTransition('B');
lateAWork();
ok(!ranAsB, "4 A's late callback does NOT execute once B owns the app state");
ok(!QRIdentity.isCurrent(tokenA), '4 A-captured tokens never validate under B');

/* A→B→A must NOT resurrect A's stale work: generation, not uid, is the discriminator */
QRIdentity.beginTransition('A'); QRIdentity.completeTransition('A');
ok(QRIdentity.activeUid() === 'A', '4 returning to A re-establishes A');
ok(!QRIdentity.isCurrent(tokenA), '4 A→B→A does NOT revalidate the ORIGINAL A token (generation-scoped)');
lateAWork();
ok(!ranAsB, '4 stale A work stays dead across A→B→A');

/* boundary detection drives the app-level lifecycle */
ok(QRIdentity.isAccountBoundary('B') === true, '4 a different uid is an account boundary');
ok(QRIdentity.isAccountBoundary('A') === false, '4 the same uid is NOT a boundary (token refresh/resume)');
ok(QRIdentity.isAccountBoundary(null) === true, '4 signing out is a boundary');

QRIdentity.clear();
ok(QRIdentity.activeUid() === null && QRIdentity.phase() === 'idle', '4 clear() leaves nobody owning the app state');

/* teardown contract: registered once per name, all hooks run, one thrower cannot stop the rest */
QRIdentity._reset();
var order = [];
QRIdentity.onTeardown('a', function () { order.push('a'); });
QRIdentity.onTeardown('boom', function () { throw new Error('hook failed'); });
QRIdentity.onTeardown('b', function () { order.push('b'); });
QRIdentity.onTeardown('a', function () { order.push('a2'); });   /* same name replaces, never stacks */
var _warn = console.warn; console.warn = function () {};   /* the throwing hook logs by design */
var failed = QRIdentity.runTeardown();
console.warn = _warn;
ok(order.join(',') === 'a2,b', '4 every hook runs and re-registration replaces rather than duplicating');
ok(failed.length === 1 && failed[0] === 'boom', '4 a throwing hook is reported but never blocks the others');
QRIdentity._reset();

/* ── 4b. The app-gate decision, EXECUTED as a truth table ─────────────────────────────────────
   This section exists because the first cut of the ADR-119 gate fix passed a source pattern-match while
   being wrong: `_hydrationStarted` remains true after a successful hydration, so the boundary branch
   still fell through to `if (_hydrationStarted) return` and every switch after the first was swallowed.
   Structural assertions cannot see that. These run the real decision function. */
var HD = QRIdentity.hydrationDecision;
/* the invariant: a boundary hydrates in EVERY state, including the post-login steady state */
[['app', true], ['app', false], ['hydrating', true], ['hydrating', false],
 ['unauthenticated', true], ['initializing', false]].forEach(function (c) {
  ok(HD(true, c[0], c[1]) === 'HYDRATE',
    '4b boundary ALWAYS hydrates (state=' + c[0] + ', latch=' + c[1] + ')');
});
/* the steady state after login is exactly the case the broken version got wrong */
ok(HD(true, 'app', true) === 'HYDRATE',
  '4b A→B from the settled post-login state hydrates (the regression this section was written for)');
/* same-account re-notifications must still short-circuit — no re-render storms on token refresh */
ok(HD(false, 'app', true) === 'SKIP', '4b same account while rendered: SKIP (token refresh / resume)');
ok(HD(false, 'app', false) === 'SKIP', '4b same account while rendered, latch clear: SKIP');
ok(HD(false, 'hydrating', true) === 'SKIP', '4b same account already hydrating: SKIP (no double hydration)');
ok(HD(false, 'hydrating', false) === 'HYDRATE', '4b same account, not yet started: HYDRATE');
ok(HD(false, 'unauthenticated', false) === 'HYDRATE', '4b first login after sign-out: HYDRATE');

/* full A→B→A→C sequence against the real machine + the real decision function */
QRIdentity._reset();
var seq = [], latch = false, appState = 'unauthenticated';
['A', 'B', 'A', 'C'].forEach(function (uid) {
  var b = QRIdentity.isAccountBoundary(uid);
  var d = HD(b, appState, latch);
  seq.push(uid + ':' + d);
  if (d === 'HYDRATE') {
    QRIdentity.beginTransition(uid);
    latch = true;                       /* app.js sets the latch after deciding to hydrate */
    QRIdentity.completeTransition(uid);
    appState = 'app';
  }
});
ok(seq.join(' ') === 'A:HYDRATE B:HYDRATE A:HYDRATE C:HYDRATE',
  '4b every switch in an A→B→A→C sequence hydrates — got: ' + seq.join(' '));
/* and a duplicate notification for the settled user does NOT re-hydrate */
ok(HD(QRIdentity.isAccountBoundary('C'), 'app', true) === 'SKIP',
  '4b a repeat notification for the current user does not re-hydrate');
QRIdentity._reset();

/* ── 5. Wiring: the lifecycle is actually invoked, in the order that makes it correct ─────────── */
var auth = R('js/auth.js');
var handler = auth.slice(auth.indexOf('_auth.onAuthStateChanged'), auth.indexOf('_auth.onAuthStateChanged') + 4000);
var iBegin = handler.indexOf('QRIdentity.beginTransition');
var iTeardown = handler.indexOf('QRIdentity.runTeardown');
var iReset = handler.indexOf('FirestoreSync.resetSyncState()');
var iAssign = handler.indexOf('_currentUser = user;');
ok(iBegin > 0 && iTeardown > iBegin, '5 beginTransition precedes teardown (invalidates A tokens first)');
ok(iReset > iTeardown, '5 teardown precedes the purge');
ok(iAssign > iReset, '5 the purge/flush precedes the identity flip (else the outgoing flush is discarded)');

var app = R('js/app.js');
ok(/function startHydrationAndShowApp\(uid\)/.test(app), '5 hydration is parameterised by the uid it is for');
ok(/QRIdentity\.isAccountBoundary\(targetUid\)/.test(app), '5 the app gate keys on identity, not on render state');
ok(/QRIdentity\.hydrationDecision\(boundary, _currentAppState, _hydrationStarted\)/.test(app),
  '5 the gate consults the executable decision function (not an inline re-implementation)');
ok(/if \(decision === 'SKIP'\) return;/.test(app), '5 the gate honours that decision');
ok(/if \(boundary\) \{[\s\S]{0,900}?_hydrationStarted = false;/.test(app),
  '5 a boundary ALWAYS releases the hydration latch (else switch #2 is swallowed)');
ok(/QRIdentity\.completeTransition\(targetUid\)/.test(app), '5 the identity is established after rehydration');
ok(/startHydrationAndShowApp\(user\.uid\)/.test(app), '5 the auth gate passes the incoming uid');
/* the transition must re-apply the incoming user's presentation — the V2-B1 symptom */
var exec = app.slice(app.indexOf('function _executeTransition'), app.indexOf('_launchOnboardingOrShowMain();', app.indexOf('function _executeTransition')));
ok(/applyAppearance/.test(exec) && /applyTheme/.test(exec) && /QRI18n\.init/.test(exec),
  '5 the transition re-applies appearance, theme AND language from the incoming user settings');
ok(/QRIdentity\.onTeardown\('duel'/.test(app) && /QRIdentity\.onTeardown\('view-listeners'/.test(app) &&
   /QRIdentity\.onTeardown\('drill'/.test(app),
  '5 duel, view listeners and drill are registered in the ONE teardown contract');
/* compare against the real CALL site, not prose that happens to name it */
ok(app.indexOf('QRIdentity.onTeardown') < app.indexOf('\n    FirebaseApp.init();'),
  '5 hooks are registered before FirebaseApp.init() starts the auth observer');
ok(/QRIdentity\.runTeardown\(\)/.test(auth.slice(auth.indexOf('function logout'))),
  '5 logout runs the same canonical teardown contract as the switch path');

/* store.js must not silently fall back to a partial purge */
ok(/QRStorage\.purgeUserScoped\(\)/.test(storeSrc), '5 AppState.clearAll delegates to the registry');
ok(/storage-registry unavailable/.test(storeSrc), '5 a missing registry is loud, not a silent partial purge');
var idx = R('index.html');
ok(idx.indexOf('js/state/storage-registry.js') < idx.indexOf('js/state/store.js'), '5 registry loads before store.js');
ok(idx.indexOf('js/identity.js') < idx.indexOf('js/firebase.js'), '5 identity loads before the auth observer starts');
var sw = R('service-worker.js');
ok(/storage-registry\.js/.test(sw) && /js\/identity\.js/.test(sw), '5 both modules are precached by the service worker');

/* ── 6. No subsystem may re-introduce a second identity authority ─────────────────────────────── */
var offenders = [];
jsFiles.forEach(function (f) {
  var src = fs.readFileSync(f, 'utf8').split('\n');
  var rel = path.relative(ROOT, f);
  if (rel === path.join('js', 'auth.js')) return;   /* auth.js IS the authority */
  var inBlock = false;
  src.forEach(function (line, i) {
    var code = line, open = -1;
    if (inBlock) {
      var close = line.indexOf('*/');
      if (close === -1) return;                 /* whole line is inside a block comment */
      code = line.slice(close + 2); inBlock = false;
    }
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');   /* strip complete inline block comments */
    open = code.indexOf('/*');
    if (open !== -1) { inBlock = true; code = code.slice(0, open); }
    code = code.replace(/\/\/.*$/, '');               /* strip line comments */
    if (/firebase\.auth\(\)\.currentUser/.test(code)) offenders.push(rel + ':' + (i + 1));
  });
});
ok(offenders.length === 0,
  '6 no module outside auth.js reads firebase.auth().currentUser — offenders: ' + JSON.stringify(offenders));

/* ── 7. Flush/queue safety across a transition ────────────────────────────────────────────────── */
var sync = R('js/firestore-sync.js');
var reset = sync.slice(sync.indexOf('function resetSyncState'), sync.indexOf('function resetSyncState') + 3600);
ok(/_persistPendingBuffer\(\);\s*\n\s*if \(!_flushInFlight\) _flushUpdates\(\);/.test(reset),
  '7 the residue is made durable BEFORE the flush attempt (an in-flight write no longer means data loss)');
ok(reset.indexOf('_persistPendingBuffer') < reset.indexOf('_syncGeneration++'),
  '7 the buffer is written before the generation bump invalidates the in-flight write');
ok(/_clearUserLocalStorage\(\)/.test(reset), '7 the purge still runs on every reset');
ok(QRStorage.classify('qr_pending_writes') === 'user-deferred',
  '7 that buffer is NOT purged (it is uid-tagged and guarded) — purging it would recreate the data loss');
/* the buffer can only ever be handed back to its owner */
ok(/parsed\.uid !== currentUserId/.test(sync), '7 buffer replay is refused for any other uid');
/* V2-B5: one slot per uid, so a second account's residue cannot overwrite the first account's */
ok(/function _bufferKey\(uid\)/.test(sync), '7 the durable buffer is keyed per uid');
ok(/localStorage\.setItem\(_bufferKey\(uid\)/.test(sync), '7 writes go to the per-uid slot');
ok(/localStorage\.getItem\(_bufferKey\(currentUserId\)\)/.test(sync), '7 replay reads the signing-in user\'s own slot');
ok(/localStorage\.getItem\(PENDING_BUFFER_KEY\)/.test(sync), '7 the pre-ADR-119 single slot is still migrated');
/* the client must never queue server-authoritative entitlement fields */
ok(!/queueUpdate\(\s*'plan'/.test(sync) && !/queueUpdate\(\s*'planExpiry'/.test(sync),
  '7 entitlement fields are never client-queued (server stays authoritative)');

/* ── 8. ADR-120 release-gate fixes, verified by EXECUTION ─────────────────────────────────────── */
var vm = require('vm');

function FakeStorageFrom(seed) { return FakeStorage(seed); }

/* 8a. R1 — a queued report may only ever be submitted as the account that wrote it.
   The real report-queue module is executed; an account switch is injected between report #1 and
   report #2, which is where the bearer token for #2 is fetched. Before ADR-120 this sent A's report
   body with B's credentials (the server attributes by req.userId). */
function runReportQueueSwitch(opts) {
  var rqSrc = R('js/services/report-queue.js');
  var idSrc = R('js/identity.js');
  var current = 'A', posts = [], release;
  var gate = new Promise(function (r) { release = r; });
  var entry = function (k) {
    var e = { payload: { clientKey: k, title: 'A-' + k }, attempts: 0, nextAt: 0 };
    if (opts.stamped) e.uid = 'A';
    return e;
  };
  var ls = FakeStorageFrom({ qr_report_queue: JSON.stringify([entry('k1'), entry('k2')]) });
  var sb = {
    console: console, JSON: JSON, Date: Date, Math: Math, Promise: Promise, Array: Array,
    Object: Object, String: String, Number: Number, isFinite: isFinite,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    localStorage: ls, navigator: { onLine: true },
    Auth: { getIdToken: function () { return Promise.resolve('TOKEN_' + current); },
            getUserId: function () { return current; } },
    Session: { id: function () { return 'sid'; } },
    addEventListener: function () {},
    fetch: function (url, o) {
      var tok = (o.headers.Authorization || '').replace('Bearer ', '');
      posts.push({ key: JSON.parse(o.body).clientKey, token: tok });
      var wait = posts.length === 1 ? gate : Promise.resolve();
      return wait.then(function () {
        return { ok: true, status: 200, json: function () { return Promise.resolve({ id: 'x' }); } };
      });
    }
  };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  vm.createContext(sb);
  if (opts.identity) {
    vm.runInContext(idSrc, sb);
    sb.QRIdentity.beginTransition('A'); sb.QRIdentity.completeTransition('A');
  }
  vm.runInContext(rqSrc, sb);
  var done = sb.ReportQueue.flush();
  setTimeout(function () {
    current = 'B';
    if (opts.identity) { sb.QRIdentity.beginTransition('B'); sb.QRIdentity.completeTransition('B'); }
    QRStorage.purgeUserScoped(ls);
    release();
  }, 5);
  return done.then(function () {
    return { crossed: posts.filter(function (p) { return p.token === 'TOKEN_B'; }).length,
             queue: ls.getItem('qr_report_queue') };
  });
}

/* 8b. R2 — clearAll must degrade, never skip, when the storage registry is unavailable. */
function runClearAllWithoutRegistry() {
  var ls = FakeStorageFrom({
    qr_settings: '{}', qr_active_exam: 'cat', qr_progress: '{}', qr_report_queue: '[]',
    premiumStatus: 'premium', quant_reflex_settings: '{}',
    qr_session_id: 's', qr_last_uid: 'A', qr_i18n_preview: '1', qr_appUpdating: 't',
    'qr_update_x': 'seen', 'qr_pending_writes_uidA': '{}', otherApp: 'keep'
  });
  var sb = { localStorage: ls, console: { warn: function () {}, error: function () {} } };
  sb.self = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(R('js/state/store.js'), sb);   /* storage-registry deliberately NOT loaded */
  var removed = sb.AppState.clearAll();
  return { removed: removed, ls: ls };
}

var fallback = runClearAllWithoutRegistry();
ok(fallback.removed.length === 6,
  '8 R2 registry-absent fallback still purges every user-scoped key (got ' + fallback.removed.length + '/6)');
['qr_settings', 'qr_active_exam', 'qr_progress', 'qr_report_queue', 'premiumStatus', 'quant_reflex_settings']
  .forEach(function (k) {
    ok(fallback.ls.getItem(k) === null, '8 R2 fallback purged ' + k + ' (a silent skip re-enables the whole leak set)');
  });
['qr_session_id', 'qr_last_uid', 'qr_i18n_preview', 'qr_appUpdating', 'qr_update_x', 'qr_pending_writes_uidA', 'otherApp']
  .forEach(function (k) {
    ok(fallback.ls.getItem(k) !== null, '8 R2 fallback preserved survivor ' + k);
  });
/* the inline survivor list must not drift from the registry it mirrors */
var storeSrc2 = R('js/state/store.js');
var fbBlock = storeSrc2.slice(storeSrc2.indexOf('var FALLBACK_SURVIVORS'), storeSrc2.indexOf('function clearAll'));
var fbKeys = (fbBlock.match(/'([^']+)'/g) || []).map(function (x) { return x.replace(/'/g, ''); });
var registrySurvivors = QRStorage.DEVICE_SCOPED.concat(QRStorage.INSTALLATION_SCOPED)
  .concat(QRStorage.USER_DEFERRED).concat(QRStorage.INSTALLATION_PREFIXES)
  .concat(QRStorage.USER_DEFERRED_PREFIXES).sort();
ok(JSON.stringify(fbKeys.slice().sort()) === JSON.stringify(registrySurvivors),
  '8 R2 the inline fallback survivor list matches the registry exactly (no drift)\n      inline:   ' +
  JSON.stringify(fbKeys.slice().sort()) + '\n      registry: ' + JSON.stringify(registrySurvivors));

/* 8c. R6 — a hydration that outlives a sign-out must not reveal the app. */
ok(/var _hydrationTimeoutId = null;/.test(app), '8 R6 the hydration timeout id is reachable outside the hydration fn');
var unauth = app.slice(app.indexOf("if (state === 'unauthenticated') {"), app.indexOf("} else if (state === 'hydrating')"));
ok(/clearTimeout\(_hydrationTimeoutId\)/.test(unauth),
  '8 R6 signing out cancels the in-flight hydration timeout');
var launch = app.slice(app.indexOf('function _launchOnboardingOrShowMain'), app.indexOf('function _launchOnboardingOrShowMain') + 900);
ok(/if \(!hasUid\) \{[\s\S]{0,160}?setAppState\('unauthenticated'\);[\s\S]{0,40}?return;/.test(launch),
  '8 R6 the app is never revealed without a live uid');

/* 8d. R7 — sessionStorage is inside the ownership model. */
ok(/purgeUserScoped\(sessionStorage\)/.test(storeSrc2), '8 R7 clearAll sweeps sessionStorage too');
var sess = FakeStorageFrom({ qr_google_redirect: '1', foreignSession: 'keep' });
QRStorage.purgeUserScoped(sess);
ok(sess.getItem('qr_google_redirect') === null && sess.getItem('foreignSession') !== null,
  '8 R7 the registry purges user-scoped sessionStorage keys and leaves foreign ones');

/* 8e. R9 — the redundant legacy list is gone (one model, not two). */
ok(!/_USER_STORAGE_KEYS/.test(sync), '8 R9 the duplicated legacy key list is removed from firestore-sync');

/* 8f. R3 — the identity guard APIs are no longer built-but-unused. */
var rq = R('js/services/report-queue.js');
ok(/QRIdentity\.capture\(\)/.test(rq), '8 R3 capture() now has a production caller');
ok(/QRIdentity\.isCurrent\(ticket\)/.test(rq), '8 R3 isCurrent() now guards a real async boundary');
ok(/entry\.uid = _currentUid\(\)/.test(rq), '8 R1 reports are stamped with their author at enqueue');

/* The R1 cases are asynchronous (they drive a real flush across a simulated switch), so the summary
   and exit code must wait for them — otherwise the process would exit before they ever ran. */
Promise.all([
  runReportQueueSwitch({ stamped: true,  identity: true  }),
  runReportQueueSwitch({ stamped: false, identity: true  }),
  runReportQueueSwitch({ stamped: true,  identity: false }),
  runReportQueueSwitch({ stamped: false, identity: false })
]).then(function (r) {
  ok(r[0].crossed === 0, '8 R1 stamped entry + identity lifecycle: no cross-account send');
  ok(r[1].crossed === 0, '8 R1 legacy entry (no uid) + identity lifecycle: no cross-account send');
  ok(r[2].crossed === 0, '8 R1 stamped entry, identity module absent: no cross-account send');
  ok(r[3].crossed === 0, '8 R1 legacy entry, identity module absent: no cross-account send');
  /* the unattributable worst case must DEFER, never drop — ADR-101 "never lose a report" */
  ok(r[3].queue && JSON.parse(r[3].queue).length === 2,
    '8 R1 unattributable reports stay queued rather than being sent as the wrong user or dropped');
}).catch(function (e) {
  fail++; console.log('  ✗ 8 R1 harness threw: ' + (e && e.message));
}).then(function () {
  console.log('\naccount-isolation.check: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
});
