/**
 * practice-session-integrity.check.js — ADR-151.
 *
 * Two defects were found together on the pre-session ("Begin Challenge") screen:
 *
 *   BUG A — the app navigated itself back to the Practice mode list ~2s after the screen appeared, and did
 *   the same to the results/review card. Cause: FirestoreSync's own debounced write echoed back through the
 *   live user-doc listener as if it were a REMOTE change (because `updatedAt` counted as a change), and the
 *   resulting "repaint the current view" call ran Router.onShow('practice'), which tears the drill container
 *   down. Both existing stand-down guards (`_drillActive`, the `drill-session-active` body class) are only
 *   raised between begin() and finish(), so neither covered the start screen or the results card.
 *
 *   BUG B — a free user's one DI/Reasoning set per day was spent when the start screen was RENDERED, because
 *   the launcher called recordSetStarted() before createDrillEngine().start(), and start() shows the start
 *   screen rather than starting. Opening a set to look at it and backing out burned the day's allowance.
 *
 * Both are invisible to any test that only reads a pure function, so this suite pins the *wiring* by source
 * inspection, and unit-tests the one piece of real logic that came with the fix (the deck clamp).
 *
 *   node scripts/practice-session-integrity.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SYNC = fs.readFileSync(path.join(ROOT, 'js/firestore-sync.js'), 'utf8');
var ENGINE = fs.readFileSync(path.join(ROOT, 'js/drill-engine.js'), 'utf8');
var PRACTICE_SRC = fs.readFileSync(path.join(ROOT, 'js/controllers/practice-modes.js'), 'utf8');
var HOME = fs.readFileSync(path.join(ROOT, 'js/views/home-view.js'), 'utf8');
var PAYWALL = fs.readFileSync(path.join(ROOT, 'js/paywall.js'), 'utf8');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

/* Blank out comment CONTENT while preserving every newline, so line numbers stay honest and a code pattern
   quoted in a comment (these files explain themselves at length) can't be mistaken for a real call site. */
function stripComments(src) {
  var out = '', inBlock = false, inLine = false, inStr = null;
  for (var i = 0; i < src.length; i++) {
    var c = src[i], n = src[i + 1];
    if (inBlock) { out += (c === '\n') ? '\n' : ' '; if (c === '*' && n === '/') { out += ' '; i++; inBlock = false; } continue; }
    if (inLine) { if (c === '\n') { out += '\n'; inLine = false; } else out += ' '; continue; }
    if (inStr) { out += c; if (c === '\\') { out += (n === undefined ? '' : n); i++; } else if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '*') { out += '  '; i++; inBlock = true; continue; }
    if (c === '/' && n === '/') { out += '  '; i++; inLine = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
    out += c;
  }
  return out;
}

/* Body of a top-level `function name(...) { ... }`, matched by brace balance so nested braces are safe. */
function fnBody(src, name) {
  var head = src.indexOf('function ' + name + '(');
  if (head === -1) return null;
  var i = src.indexOf('{', head);
  if (i === -1) return null;
  var depth = 0;
  for (var j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

console.log('Practice session integrity (ADR-151)\n');

/* ─────────────── BUG A · the repaint must not be self-triggered ─────────────── */

ok(/REFRESH_STAMPS_NO_REPAINT\s*=\s*\{[^}]*updatedAt\s*:\s*true/.test(SYNC),
  'firestore-sync: updatedAt is listed as a non-repainting stamp');
ok(/if\s*\(!REFRESH_STAMPS_NO_REPAINT\[sk\]\)\s*changed\s*=\s*true;/.test(SYNC),
  'firestore-sync: the stamp loop consults REFRESH_STAMPS_NO_REPAINT before setting `changed`');
/* It must still be MIRRORED — the durable pending-write buffer compares against the last known server value. */
ok(/_memoryCache\[sk\]\s*=\s*d\[sk\];/.test(SYNC),
  'firestore-sync: stamps are still mirrored into _memoryCache (pending-buffer base must stay fresh)');
ok(/REFRESH_STAMPS\s*=\s*\[[^\]]*'updatedAt'/.test(SYNC),
  'firestore-sync: updatedAt is still in REFRESH_STAMPS (mirrored, just not repaint-worthy)');

/* ─────────────── BUG A · both repaint sites must stand down for engine UI ─────────────── */

var guard = fnBody(SYNC, '_holdsTransientUi');
ok(guard !== null, 'firestore-sync: _holdsTransientUi() exists');
if (guard) {
  ok(/_drillActive/.test(guard), '_holdsTransientUi covers _drillActive (live session)');
  ok(/drill-session-active/.test(guard), '_holdsTransientUi covers the drill-session-active body class');
  ok(/_activeDrillEngine/.test(guard),
    '_holdsTransientUi covers _activeDrillEngine — THE start screen + results card case (ADR-151)');
}

/* Every Router.showView(...) in firestore-sync is a background repaint; each must be gated on the guard. */
var SYNC_CODE = stripComments(SYNC).split('\n');
var repaints = SYNC_CODE.map(function (line, i) { return { line: line, n: i + 1 }; })
  .filter(function (r) { return /Router\.showView\(/.test(r.line); });
ok(repaints.length === 2, 'firestore-sync has exactly the 2 known background repaint sites (found ' + repaints.length + ')');
repaints.forEach(function (r) {
  /* The guard is either an early return a few statements above, or inline in the same condition. */
  var above = SYNC_CODE.slice(Math.max(0, r.n - 9), r.n).join('\n');
  ok(/_holdsTransientUi\(\)/.test(above),
    'firestore-sync:' + r.n + ' repaint is gated on _holdsTransientUi()');
});
/* The old, too-narrow inline guard must be gone from both sites — otherwise a future edit could "fix" a
   regression by restoring it and silently lose the start-screen/results coverage. */
ok(SYNC.indexOf("classList.contains('drill-session-active')") === SYNC.lastIndexOf("classList.contains('drill-session-active')"),
  'firestore-sync: the drill-session-active check lives ONLY inside _holdsTransientUi');

/* ─────────────── BUG B · the allowance is spent in begin(), not at launch ─────────────── */

ok(/var onStart = opts\.onStart \|\| null;/.test(ENGINE), 'drill-engine: accepts an onStart host hook');
var begin = fnBody(ENGINE, 'begin');
ok(begin !== null && /onStart\(\)/.test(begin), 'drill-engine: onStart is invoked from begin()');
ok(begin !== null && /_onStartFired/.test(begin), 'drill-engine: onStart is latched one-shot (Retry cannot double-charge)');
ok(!/_onStartFired\s*=\s*false;/.test(ENGINE.replace(/var _onStartFired = false;/, '')),
  'drill-engine: the onStart latch is never reset');
/* renderStart() paints the pre-session screen; it must not be able to fire the hook. */
var renderStart = fnBody(ENGINE, 'renderStart');
ok(renderStart !== null && !/onStart/.test(renderStart),
  'drill-engine: renderStart() (the "Begin Challenge" screen) never touches onStart');

['startDiSet', 'startLrSet'].forEach(function (name) {
  var body = fnBody(PRACTICE_SRC, name);
  ok(body !== null, name + ' found');
  if (!body) return;
  var calls = body.match(/recordSetStarted\(/g) || [];
  ok(calls.length === 1, name + ': records the set exactly once (found ' + calls.length + ')');
  var hook = /onStart:\s*function\s*\(\)\s*\{[^}]*recordSetStarted\(/.test(body);
  ok(hook, name + ': the recordSetStarted call lives inside the onStart hook, not at launch time');
  /* The launcher must not charge before handing the engine over. */
  var tail = body.slice(body.indexOf('_startPracticeEngine('));
  ok(!/recordSetStarted\(/.test(tail), name + ': nothing is charged after _startPracticeEngine either');
  ok(/_clampSetToDailyAllowance\(/.test(body), name + ': clamps the deck to the remaining daily allowance');
});

/* ─────────────── the quota card belongs to Practice ─────────────── */

ok(!/function _renderDailyQuota/.test(HOME), 'home-view no longer defines _renderDailyQuota');
ok(/function _renderDailyQuota/.test(PRACTICE_SRC), 'practice-modes defines _renderDailyQuota');
var quota = fnBody(PRACTICE_SRC, '_renderDailyQuota');
ok(quota !== null && !/used === 0/.test(quota),
  'the quota card no longer hides itself at 0 used (ADR-151 supersedes the ADR-091 cold-start rule)');
ok(quota !== null && /diSetsToday/.test(quota) && /lrSetsToday/.test(quota),
  'the quota card reports the DI and Reasoning set allowances too');
ok(/FREE_DAILY_SETS_PER_KIND = 1;/.test(PAYWALL), 'paywall defines FREE_DAILY_SETS_PER_KIND');
ok(/getDailySetLimit:\s*getDailySetLimit/.test(PAYWALL), 'paywall exports getDailySetLimit');
ok(!/getSetsStartedToday\('(di|lr)'\)\s*>=\s*\d/.test(PRACTICE_SRC),
  'the per-day set gates read the shared limit, not a hardcoded number');

/* ─────────────── unit: the deck clamp ─────────────── */

/* practice-modes.js is pure function declarations (no top-level side effects), so it can be evaluated in a
   sandbox and its helpers called directly. Stubs stand in for the browser globals it reads. */
function clampWith(limit, todayAttempted) {
  var sandbox = {
    getDailyQuestionLimit: function () { return limit; },
    loadProgress: function () { return { todayAttempted: todayAttempted }; },
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(PRACTICE_SRC, sandbox, { filename: 'practice-modes.js' });
  return sandbox._clampSetToDailyAllowance;
}

var SET5 = { category: 'di-bar', chart: { kind: 'bar' }, context: 'ctx', questions: [1, 2, 3, 4, 5] };

var clampFree = clampWith(20, 18);
var r1 = clampFree(SET5, false);
ok(r1.questions.length === 2, 'free user with 2 questions left gets a 2-question deck (got ' + r1.questions.length + ')');
ok(r1.chart === SET5.chart && r1.category === SET5.category && r1.context === SET5.context,
  'the clamp preserves the shared chart/category/context');
ok(SET5.questions.length === 5, 'the clamp does not mutate the generator\'s set');

var r2 = clampWith(20, 0)(SET5, false);
ok(r2 === SET5, 'a deck that fits is returned untouched (same object, no copy)');

var r3 = clampWith(20, 19)(SET5, false);
ok(r3.questions.length === 1, 'one question left → a 1-question deck');

var r4 = clampWith(20, 20)(SET5, false);
ok(r4.questions.length === 1, 'already at the cap → never an EMPTY deck (the engine would call that a generation failure)');

var r5 = clampWith(Infinity, 999)(SET5, true);
ok(r5 === SET5, 'premium is never clamped');
var r6 = clampWith(Infinity, 999)(SET5, false);
ok(r6 === SET5, 'an infinite limit is never clamped even if the premium flag is not passed');

/* ─────────────── ADR-152 · release blockers ─────────────── */

var ROUTER = fs.readFileSync(path.join(ROOT, 'js/router.js'), 'utf8');

/* B1 — the set mapping must carry `options`, or every LR set is unanswerable (readonly digit box for a name). */
var beginBuild = fnBody(ENGINE, '_beginBuild');
ok(beginBuild !== null && /options:\s*sq\.options/.test(beginBuild),
  'drill-engine: the diSet mapping carries `options` through to the engine (ADR-152 — LR sets)');
ok(/isMCQ = !!\(q\.options && q\.options\.length\)/.test(ENGINE),
  'drill-engine: isMCQ is still derived from q.options (the field the mapping must supply)');

/* B2 — the set numpad must reuse the guarded submit closure, never call checkAnswer bare. */
var setQ = fnBody(ENGINE, '_renderSetQuestion');
ok(setQ !== null && /showCustomNumpad\(ui\.answerInputEl, function \(\) \{ submit\(\); \}/.test(setQ),
  'drill-engine: the set-path numpad routes through the guarded submit() closure');
ok(setQ !== null && !/showCustomNumpad\([^)]*checkAnswer\(/.test(setQ),
  'drill-engine: the set-path numpad never calls checkAnswer directly (empty ↵ cannot grade a blank answer)');
ok(setQ !== null && /if \(!input\.value\.trim\(\)\) return;/.test(setQ),
  'drill-engine: the set-path submit closure still carries the empty-value guard');

/* B3 — the duel Back handler must be consulted BEFORE the practice drill-session branch. */
var popstate = stripComments(ROUTER);
var duelIdx = popstate.indexOf('DuelManager.handleBackNav()');
var practiceIdx = popstate.indexOf('showExitSessionDialog');
ok(duelIdx !== -1 && practiceIdx !== -1 && duelIdx < practiceIdx,
  'router: DuelManager.handleBackNav() is tested BEFORE the practice exit dialog (ADR-152 — duel Back)');
ok((popstate.match(/DuelManager\.handleBackNav\(\)/g) || []).length === 1,
  'router: the duel Back branch exists exactly once (no duplicate left behind by the reorder)');

/* B4 — the account-switch purge gap must not be able to write stats. */
ok(/var _purgedAwaitingHydration = false;/.test(SYNC),
  'firestore-sync: _purgedAwaitingHydration is declared');
ok(/_purgedAwaitingHydration && field === 'stats'/.test(SYNC),
  'firestore-sync: queueUpdate refuses a stats write during the purge gap (ADR-152 — account-switch data loss)');
ok(/_dataLoaded = false;\s*\n\s*_purgedAwaitingHydration = true;/.test(SYNC),
  'firestore-sync: the flag is RAISED when sync state is reset');
var clears = (SYNC.match(/_purgedAwaitingHydration = false;/g) || []).length;
var loaded = (SYNC.match(/_dataLoaded = true;/g) || []).length;
ok(clears === loaded + 1,
  'firestore-sync: the flag is cleared at every hydration-complete site (' + (clears - 1) + ' clears vs ' + loaded + ' sites)');
/* The guard must be narrow: it must not swallow a genuine first-session write (ADR-054). */
ok(/field === 'stats'/.test(SYNC) && !/_purgedAwaitingHydration\)\s*return;/.test(SYNC),
  'firestore-sync: the purge-gap guard is scoped to `stats`, not a blanket drop (ADR-054 stays intact)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
