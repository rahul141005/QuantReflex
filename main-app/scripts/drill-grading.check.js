/**
 * drill-grading.check.js — the RUNTIME GRADER and score aggregation (P0 validation pass).
 *
 * WHY THIS FILE EXISTS
 * The engine suites (quant/di/lr/answer-format) independently re-derive every generated answer, so the
 * ANSWER KEYS are proven correct. Nothing, however, executed the code that decides whether the USER's
 * submission matches that key. That is the most damaging place in the product for a bug — a visually
 * perfect question UI that grades wrongly teaches the wrong thing and reports a score the user cannot
 * trust — and `js/drill-engine.js` had no executable coverage at all.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED HERE
 * Not the answer keys (owned by the engine suites) and not the rendering. Only the grading contract:
 * submitted value → correct/incorrect, plus the guards that stop one submission counting twice.
 *
 * HONEST LIMITATION, AND HOW IT IS CONTAINED
 * `checkAnswer` is an inner function of the `createDrillEngine` closure, and the engine exposes only
 * {start, cleanup} — reaching it would mean rendering the whole question UI into a real DOM. So the
 * grading assertions run against a MIRROR of the engine's rule, which alone would be the
 * "re-implementation" anti-pattern this repo rejects elsewhere. It is contained the same way the
 * entitlement-core mirrors are: the LOCKSTEP section extracts the decisive expressions from the
 * shipped drill-engine.js and fails if the mirror and the engine ever disagree. The mirror therefore
 * cannot drift silently, and every GUARD below is asserted against the real source, not the mirror.
 *
 * The DOM stub is intentionally minimal — anything richer would be testing the stub.
 *
 *   node scripts/drill-grading.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
function ok(m, c, d) { if (c) pass++; else { fail++; console.log('  x ' + m + (d ? ' - ' + d : '')); } }

console.log('Drill grader + score aggregation (runtime)\n');

/* ---------- minimal DOM ---------- */
function makeNode(tag) {
  var node = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], _attrs: {}, _cls: {}, style: {}, disabled: false, value: '',
    innerHTML: '', textContent: '',
    classList: {
      add: function () { for (var i = 0; i < arguments.length; i++) node._cls[arguments[i]] = true; },
      remove: function () { for (var i = 0; i < arguments.length; i++) delete node._cls[arguments[i]]; },
      contains: function (c) { return !!node._cls[c]; },
      toggle: function (c, on) { if (on === undefined) on = !node._cls[c]; if (on) node._cls[c] = true; else delete node._cls[c]; }
    },
    setAttribute: function (k, v) { node._attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(node._attrs, k) ? node._attrs[k] : null; },
    removeAttribute: function (k) { delete node._attrs[k]; },
    appendChild: function (c) { node.children.push(c); return c; },
    removeChild: function () {},
    addEventListener: function () {}, removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {}, blur: function () {}, click: function () {}, remove: function () {},
    insertAdjacentHTML: function () {}, scrollIntoView: function () {},
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  return node;
}

/* ---------- load the REAL engine and its REAL collaborators ---------- */
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'drill-engine.js'), 'utf8');
var answerFormatSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'answer-format.js'), 'utf8');
/* Real, not stubbed: the engine delegates its arithmetic to ScoringService, so faking it would hide
   exactly the class of bug this file exists to catch. */
var scoringSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'scoring-service.js'), 'utf8');

function loadEngine() {
  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    setInterval: function () { return 1; },
    clearInterval: function () {},
    performance: { now: function () { return 1000; } },
    Date: Date, Math: Math, JSON: JSON, parseFloat: parseFloat, parseInt: parseInt,
    isNaN: isNaN, String: String, Number: Number, Object: Object, Array: Array, RegExp: RegExp,
    requestAnimationFrame: function () { return 0; },
    navigator: { onLine: true, vibrate: function () {} },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    createElement: makeNode,
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    body: makeNode('body'),
    addEventListener: function () {}, removeEventListener: function () {}
  };
  vm.createContext(sandbox);
  vm.runInContext(answerFormatSrc, sandbox, { filename: 'answer-format.js' });
  vm.runInContext(scoringSrc, sandbox, { filename: 'scoring-service.js' });
  vm.runInContext(src, sandbox, { filename: 'drill-engine.js' });
  return sandbox;
}

var sb = loadEngine();
ok('the real drill-engine loads and exposes createDrillEngine', typeof sb.createDrillEngine === 'function');
ok('the shared answer-format registry loaded alongside it (the grader consumes it)',
  typeof sb.QRAnswerFormat === 'object' && typeof sb.QRAnswerFormat.normalize === 'function');
ok('the real ScoringService loaded (the engine refuses to construct without it)',
  typeof sb.ScoringService !== 'undefined');

/* The engine really constructs against the shipped collaborators. This is what caught the missing
   ScoringService dependency when this file was first written. */
ok('* an engine instance constructs against the shipped collaborators', (function () {
  try {
    var container = makeNode('div');
    container.querySelector = function () { return makeNode('div'); };
    container.querySelectorAll = function () { return []; };
    return !!sb.createDrillEngine(container, { count: 1, category: 'test', mode: 'quick' });
  } catch (err) { return false; }
})());

/* ---------- the grading rule (mirror - kept honest by LOCKSTEP below) ---------- */
var normalize = sb.QRAnswerFormat.normalize;
function grade(raw, expected) {
  var nr = normalize(raw), ne = normalize(String(expected));
  if (nr === ne) return true;
  if (nr !== '' && !isNaN(nr) && !isNaN(ne)) {
    var a = parseFloat(nr), b = parseFloat(ne);
    if (a === b) return true;
    var tol = Math.abs(b) > 0 ? Math.max(0.01, Math.abs(b) * 0.001) : 0.01;
    return Math.abs(a - b) <= tol;
  }
  return false;
}

ok('** an exactly correct answer grades CORRECT', grade('42', '42') === true);
ok('** a wrong answer grades INCORRECT', grade('41', '42') === false);
ok('** an EMPTY submission (timer expiry) is never correct', grade('', '42') === false);
ok('* whitespace does not change the verdict', grade(' 42 ', '42') === true);
ok('* "57.0" equals "57" (numeric equivalence, not string equality)', grade('57.0', '57') === true);
ok('* a 2-dp rounding of a long decimal is accepted', grade('3.33', '3.3333333') === true);
ok('** tolerance does NOT swallow a genuinely different number', grade('3.5', '3.3333333') === false);
ok('** off-by-one grades wrong (the classic indexing bug would surface here)', grade('43', '42') === false);
ok('a negative answer grades correctly', grade('-8', '-8') === true && grade('8', '-8') === false);
ok('zero is handled (tolerance floor, no divide-by-zero)', grade('0', '0') === true && grade('0.5', '0') === false);
ok('a non-numeric answer compares exactly', grade('North', 'North') === true && grade('South', 'North') === false);

/* ---------- the GUARDS, asserted against the shipped source ----------
   The properties that stop one submission counting twice, or a timer grading a finished drill. */
ok('** checkAnswer refuses to run twice for one question (double-submit / rapid tap)',
  /function checkAnswer\([\s\S]{0,200}?if \(answered \|\| _isFinished\) return;/.test(src));
ok('** ...and sets `answered` immediately, before any async work',
  /if \(answered \|\| _isFinished\) return;\s*\n\s*answered = true;/.test(src));
ok('** the per-question timer is cleared on submission (it cannot grade after the fact)',
  /if \(perQTimer\) \{ clearInterval\(perQTimer\); perQTimer = null; \}/.test(src));
ok('** the MCQ option handler refuses a second tap while answered',
  /addEventListener\('click', function \(\) \{ if \(answered \|\| _blockedByOverlay\(\)\) return;/.test(src));
ok('** MCQ grading compares the option VALUE, never its index (shuffling cannot break it)',
  /checkAnswer\(this\.getAttribute\('data-opt'\)\)/.test(src) && /var expected = String\(q\.answer\);/.test(src));
ok('* an empty free-entry submission is ignored rather than graded wrong',
  /if \(!input\.value\.trim\(\)\) return;/.test(src));

/* ---------- LOCKSTEP: the mirror must match the shipped rule ----------
   Without this, a change to the engine's tolerance or equality chain would leave every grading
   assertion above passing while the product graded differently. */
ok('** the engine still normalises through the shared registry (not a private copy)',
  /QRAnswerFormat\.normalize/.test(src));
ok('** the mirror tolerance is byte-for-byte the engine\'s',
  /Math\.max\(0\.01, Math\.abs\(expNum\) \* 0\.001\)/.test(src),
  'engine tolerance changed - update the mirror in this file');
ok('** the engine equality chain is still exact -> numeric -> tolerance',
  /if \(normalizedRaw === normalizedExpected\)[\s\S]{0,400}?rawNum === expNum[\s\S]{0,600}?Math\.abs\(rawNum - expNum\) <= tolerance/.test(src));
ok('* the engine still treats an empty submission as not-numeric (never graded correct)',
  /normalizedRaw !== '' && !isNaN\(normalizedRaw\)/.test(src));

console.log('\n------------------------------');
console.log((fail === 0 ? 'ALL PASSED' : 'FAILURES') + ' - ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
