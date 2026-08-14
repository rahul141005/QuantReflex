/**
 * practice-browser.check.js — ADR-151. The BEHAVIOURAL half of practice-session-integrity.check.js.
 *
 * Runs the real js/progress.js, js/paywall.js, js/drill-engine.js and js/controllers/practice-modes.js in a
 * simulated browser context (same technique as learn-browser.check.js) and drives the actual DI/LR set launch
 * the way a user does, to prove two things the source ratchet can only infer:
 *
 *   1. Opening a set — i.e. landing on the "Begin Challenge" pre-session screen — costs the free user NOTHING.
 *      Only pressing Begin spends the day's set. (BUG B)
 *   2. On that pre-session screen BOTH of the old repaint stand-down signals are down (`_drillActive` is false
 *      and the `drill-session-active` body class is absent) while `_activeDrillEngine` IS set. That is exactly
 *      why a background repaint used to throw the user back to the mode list, and exactly why the new guard
 *      keys on `_activeDrillEngine`. (BUG A — the precondition, executed rather than argued.)
 *
 *   node scripts/practice-browser.check.js
 */
'use strict';
var vm = require('vm');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

/* ---- DOM stub: enough for the pre-session screen (innerHTML + querySelector + click wiring) ---- */
function makeNode(id) {
  var handlers = {};
  var node = {
    id: id || '', textContent: '', style: {}, _handlers: handlers,
    classList: {
      _s: {},
      add: function (c) { this._s[c] = true; }, remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on === undefined) { if (this._s[c]) delete this._s[c]; else this._s[c] = true; } else if (on) this._s[c] = true; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    addEventListener: function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
    removeEventListener: function () {},
    appendChild: function (c) { return c; },
    removeChild: function () {},
    setAttribute: function () {}, getAttribute: function () { return null; },
    focus: function () {},
    click: function () { (handlers.click || []).forEach(function (f) { f({ preventDefault: function () {} }); }); },
    querySelector: function (sel) { return this._q(sel); },
    querySelectorAll: function () { return []; },
    _children: {},
    /* Selectors used by the code under test are all '#id' — hand back a stable node per id so a click
       registered at render time is the same node the test clicks. */
    _q: function (sel) {
      var key = String(sel);
      if (!this._children[key]) this._children[key] = makeNode(key.replace('#', ''));
      return this._children[key];
    }
  };
  /* Writing innerHTML replaces the subtree in a real DOM, so every previously handed-out child node (and the
     listeners bound to it) becomes detached. Model that — otherwise a re-render would leave the OLD render's
     click handlers alive on the "same" button and one click would run two engines. */
  var _html = '';
  Object.defineProperty(node, 'innerHTML', {
    get: function () { return _html; },
    set: function (v) { _html = String(v); node._children = {}; }
  });
  /* The engine escapes strings with the classic `d.textContent = s; return d.innerHTML;` trick, so a node MUST
     reflect textContent into innerHTML — otherwise _escHtml silently returns '' and every escaped label (MCQ
     option values, stat labels) vanishes from the rendered HTML, which looks like a product bug but is not. */
  var _text = '';
  Object.defineProperty(node, 'textContent', {
    get: function () { return _text; },
    set: function (v) {
      _text = String(v == null ? '' : v);
      _html = _text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  });
  return node;
}

var byId = {};
function getEl(id) { if (!byId[id]) byId[id] = makeNode(id); return byId[id]; }

var localStore = {};
var win = {};
var body = makeNode('body');
var sandbox = {
  window: win,
  navigator: { userAgent: 'node', language: 'en' },
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null; },
    setItem: function (k, v) { localStore[k] = String(v); },
    removeItem: function (k) { delete localStore[k]; },
    key: function (i) { return Object.keys(localStore)[i] || null; },
    get length() { return Object.keys(localStore).length; }
  },
  document: {
    body: body, documentElement: makeNode('html'),
    getElementById: getEl,
    createElement: function () { return makeNode(); },
    querySelector: function (s) { return getEl(String(s).replace(/^#/, '')); },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}, removeEventListener: function () {}
  },
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: setInterval, clearInterval: clearInterval,
  performance: { now: function () { return 0; } },
  requestAnimationFrame: function (f) { return setTimeout(f, 0); }
};
sandbox.self = win;
sandbox.global = sandbox;
vm.createContext(sandbox);

/* ---- collaborators the launcher/engine reach for, stubbed to the shape they actually use ---- */
var stubs = {
  QRI18n: { t: function (k, v) { return k + (v && v.count !== undefined ? ':' + v.count : ''); } },
  SoundEngine: { play: function () {} },
  triggerHaptic: function () {},
  showToast: function () {},
  hideCustomNumpad: function () {},
  Router: { showView: function (v) { sandbox.__lastShowView = v; }, getCurrentView: function () { return 'practice'; }, onShow: function () {}, onInit: function () {} },
  AdaptiveState: { setPattern: function () {} },
  DICharts: { render: function () { return ''; } },
  DIEngine: { label: function () { return 'Bar'; } },
  /* A deterministic 5-question DI set — no generator randomness in the assertions. */
  DISetEngine: {
    generateSet: function (cat) {
      var qs = [];
      for (var i = 0; i < 5; i++) qs.push({ question: 'q' + i, answer: i, subtype: 'x' });
      return { category: cat, chart: { kind: 'bar' }, context: null, questions: qs };
    }
  },
  _enterDrillSession: function () { sandbox.__drillSessionActive = true; body.classList.add('drill-session-active'); },
  _exitDrillSession: function () { sandbox.__drillSessionActive = false; body.classList.remove('drill-session-active'); },
  _resetPracticeUiToModes: function () { sandbox.__resetToModes = (sandbox.__resetToModes || 0) + 1; },
  _drillSessionActive: false,
  _activeDrillEngine: null,   /* declared in js/app.js in the browser; the launcher assigns through it */
  resetRecentQuestions: function () {},
  /* FirestoreSync: only the drill-batch flag matters here — it is one of the two old repaint guards. */
  FirestoreSync: {
    _drillActive: false, writes: 0,
    beginDrillBatch: function () { this._drillActive = true; },
    endDrillBatch: function () { this._drillActive = false; },
    queueUpdate: function () { this.writes++; },
    /* progress.js calls this on every saveProgress; outside a drill batch it is what schedules the 2s
       debounced flush whose echo used to repaint the view out from under the user. */
    syncStats: function () { this.writes++; },
    isDrillActive: function () { return this._drillActive; }
  },
  /* Same contract js/state/store.js exposes to progress.js, backed by the localStorage stub above. */
  AppState: {
    getSettings: function () { return { difficulty: 'medium' }; },
    getProgress: function () { try { return JSON.parse(localStore['quant_reflex_progress'] || 'null'); } catch (_) { return null; } },
    setProgress: function (d) { localStore['quant_reflex_progress'] = JSON.stringify(d); }
  },
  FirebaseApp: { isReady: function () { return false; }, getUserId: function () { return null; } }
};
Object.keys(stubs).forEach(function (k) { sandbox[k] = stubs[k]; });

/* ---- load the real modules, in index.html order ---- */
['js/progress.js', 'js/quota-policy.js', 'js/services/scoring-service.js', 'js/paywall.js',
 'js/drill-engine.js', 'js/controllers/practice-modes.js']
  .forEach(function (rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  });

/* paywall.js exports onto its `global` argument (window); mirror those onto the sandbox so the launcher's
   bare-global lookups resolve exactly as they do in the browser (where window IS the global object). */
Object.keys(win).forEach(function (k) { if (sandbox[k] === undefined) sandbox[k] = win[k]; });
/* Free user: no entitlement in the access state. */
sandbox.hasPremiumAccess = function () { return false; };
sandbox.canAccessFeature = function () { return false; };
sandbox.showPaywall = function (r) { sandbox.__paywall = r; };

console.log('Practice set lifecycle, in a browser context (ADR-151)\n');

var progress = sandbox.loadProgress();
ok(progress.diSetsToday === 0, 'baseline: no DI set started today');
ok(progress.todayAttempted === 0, 'baseline: no questions attempted today');

/* ── open the set: this renders the "Begin Challenge" pre-session screen ── */
sandbox.FirestoreSync.writes = 0;
sandbox.startDiSet('di-bar');

ok(sandbox.__paywall === undefined, 'a free user with a fresh day is not paywalled when opening a DI set');
ok(!!sandbox._activeDrillEngine, 'an engine is mounted');
var drillContainer = getEl('drillContainer');
ok(/startBtn/.test(drillContainer.innerHTML), 'the PRE-SESSION screen is showing (Begin Challenge), not question 1');
ok(/drill\.beginChallenge/.test(drillContainer.innerHTML), 'the Begin Challenge CTA is rendered');

/* BUG B — the day's set must NOT be spent yet. */
ok(sandbox.getSetsStartedToday('di') === 0,
  'BUG B: opening the set does NOT consume the free daily set (got ' + sandbox.getSetsStartedToday('di') + ')');
ok(sandbox.loadProgress().todayAttempted === 0,
  'opening the set consumes no QUESTIONS either');

/* BUG A precondition — both old guards are down here, which is why a repaint used to nuke this screen. */
ok(sandbox.FirestoreSync.isDrillActive() === false,
  'BUG A: `_drillActive` is FALSE on the pre-session screen (old guard #1 does not cover it)');
ok(body.classList.contains('drill-session-active') === false,
  'BUG A: the `drill-session-active` body class is ABSENT here (old guard #2 does not cover it)');
ok(!!sandbox._activeDrillEngine,
  'BUG A: `_activeDrillEngine` IS set here — the signal the new guard keys on');
/* And the trigger itself is gone: with nothing charged at launch there is no queued write, so no 2s
   debounced flush, so no snapshot echo to repaint on. Belt and braces with the guard above. */
ok(sandbox.FirestoreSync.writes === 0,
  'BUG A: opening the set queues NO Firestore write, so nothing schedules the 2s flush (got ' +
  sandbox.FirestoreSync.writes + ')');

/* ── back out without starting: the set must still be available ── */
sandbox.startDiSet('di-bar');
ok(sandbox.getSetsStartedToday('di') === 0, 're-opening the set still costs nothing');

/* ── now actually begin ── */
var startBtn = drillContainer._q('#startBtn');
try { startBtn.click(); } catch (_e) { /* full question rendering needs a real DOM; irrelevant to the assertion */ }
ok(sandbox.getSetsStartedToday('di') === 1,
  'pressing Begin Challenge spends exactly one DI set (got ' + sandbox.getSetsStartedToday('di') + ')');

/* ── the second set of the day is refused ── */
sandbox.__paywall = undefined;
sandbox.startDiSet('di-bar');
ok(sandbox.__paywall === 'diset_limit', 'a second DI set the same day hits the diset_limit paywall');
ok(sandbox.getSetsStartedToday('di') === 1, 'the refused launch did not increment the counter');

/* ── the clamp is live end-to-end: 18 of 20 questions used → the set offers 2 ── */
var p = sandbox.loadProgress();
p.todayAttempted = 18; p.diSetsToday = 0;
sandbox.saveProgress(p);
getEl('drillContainer').innerHTML = '';
sandbox.startDiSet('di-bar');
ok(sandbox._activeDrillEngine !== null, 'a set still launches with 2 questions of allowance left');
ok(/2/.test(getEl('drillContainer').innerHTML),
  'the pre-session screen advertises the CLAMPED count, not the generator\'s 5');

/* ── the Practice-tab allowance card ── */
localStore['quant_reflex_progress'] = JSON.stringify({ todayAttempted: 0, diSetsToday: 0, lrSetsToday: 0, lastActiveDate: new Date().toDateString() });
sandbox.invalidateProgressCache();
var card = getEl('dailyQuotaIndicator');
sandbox._renderDailyQuota(sandbox.loadProgress());
ok(card.style.display === '', 'the allowance card is VISIBLE for a free user who has answered nothing today');
ok(/0 \/ 20/.test(card.innerHTML), 'it reads 0 / 20 at the start of the day (ADR-151 supersedes ADR-091)');
ok(/practice\.quotaDiSet 0\/1/.test(card.innerHTML), 'it shows the DI set allowance');
ok(/practice\.quotaLrSet 0\/1/.test(card.innerHTML), 'it shows the Reasoning set allowance');

sandbox._renderDailyQuota({ todayAttempted: 20, diSetsToday: 1, lrSetsToday: 0 });
ok(/quota-full/.test(card.innerHTML), 'the bar renders full at the cap');
ok(/quota-set-spent/.test(card.innerHTML), 'a spent set allowance is marked');
ok(/quotaUpgradeLink/.test(card.innerHTML), 'the upgrade link appears once the questions run out');

sandbox.hasPremiumAccess = function () { return true; };
sandbox.getDailyQuestionLimit = function () { return Infinity; };
sandbox._renderDailyQuota({ todayAttempted: 5, diSetsToday: 1, lrSetsToday: 1 });
ok(card.style.display === 'none' && card.innerHTML === '', 'premium users never see the allowance card');

/* ── ADR-152: a Reasoning Set must actually be ANSWERABLE ──
   LR sets are MCQ with NAME answers. Before the fix the engine's set mapping dropped `options`, so isMCQ went
   false and the question rendered as a readonly digit-only numeric box — impossible to answer, impossible to
   finish. This drives the real launcher and asserts the rendered question is a real MCQ. */
localStore['quant_reflex_progress'] = JSON.stringify({ todayAttempted: 0, diSetsToday: 0, lrSetsToday: 0, lastActiveDate: new Date().toDateString() });
sandbox.invalidateProgressCache();
sandbox.hasPremiumAccess = function () { return false; };
sandbox.getDailyQuestionLimit = function () { return 20; };
sandbox.LRSetEngine = {
  generateSet: function (cat) {
    return {
      category: cat, chart: null, context: 'Five friends sit in a row.',
      questions: [
        { question: 'Who sits at the far left?', answer: 'Rohan', options: ['Rohan', 'Priya', 'Amit', 'Neha'], subtype: 'easy:set_seat' },
        { question: 'Who sits in the middle?', answer: 'Amit', options: ['Rohan', 'Priya', 'Amit', 'Neha'], subtype: 'medium:set_seat' },
        { question: 'Who sits at the far right?', answer: 'Neha', options: ['Rohan', 'Priya', 'Amit', 'Neha'], subtype: 'hard:set_seat' }
      ]
    };
  }
};
getEl('drillContainer').innerHTML = '';
sandbox.__paywall = undefined;
sandbox.startLrSet('lr-seating');
ok(!!sandbox._activeDrillEngine, 'an LR set launches');
ok(sandbox.getSetsStartedToday('lr') === 0, 'opening the LR set costs nothing until Begin');
var lrContainer = getEl('drillContainer');
try { lrContainer._q('#startBtn').click(); } catch (_e) { /* full render needs a real DOM; assertions below cover what matters */ }
ok(sandbox.getSetsStartedToday('lr') === 1, 'pressing Begin spends exactly one Reasoning set');
/* The set shell renders once into the container; each question is swapped into the #diSetQHost child. */
var lrHtml = lrContainer._q('#diSetQHost').innerHTML;
ok(/mcqOptions/.test(lrHtml),
  'ADR-152: the LR-set question renders as an MCQ (options survived the engine mapping)');
ok(/data-opt="Rohan"/.test(lrHtml),
  'ADR-152: the real option VALUES are rendered as tappable answers');
ok(!/readonly/.test(lrHtml),
  'ADR-152: no readonly digit-only input is rendered for a name answer — the set is answerable');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
