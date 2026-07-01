/**
 * quant-engine.check.js — validates the Quant generator (ADR-083 Master Overhaul).
 *
 * The guarantees Quant needs match DI/LR: CORRECTNESS (a wrong answer silently teaches the wrong thing), CLEAN answers
 * (the numpad grades with a tight tolerance), and EARNED DIFFICULTY (a tier must use a tier archetype, never a silent
 * downgrade). This harness samples every category × difficulty and, for each ARCHETYPE-refactored category, independently
 * RE-COMPUTES the answer from the question stem (no shared code with the generator) and asserts it matches — plus
 * structural invariants for all 14 categories and per-tier archetype-coverage/diversity. Wired into `npm test`.
 *   node scripts/quant-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var Q = require(p('js/questions.js'));

var pass = 0, fail = 0, shownFail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shownFail <= 20) console.error('  ✗ ' + label); } }

var DIFFS = ['easy', 'medium', 'hard'];
var ALL_CATS = ['squares', 'cubes', 'area', 'volume', 'fractions', 'percentages', 'multiplication', 'ratios',
  'averages', 'profit-loss', 'time-speed-distance', 'time-and-work', 'simplification', 'number-series'];

/* categories brought to the archetype/earned-difficulty bar in ADR-083 Phase 1 — these get full recompute + tier checks. */
var TIER_KEYS = {
  squares: { easy: ['direct'], medium: ['direct', 'inverse'], hard: ['direct', 'inverse', 'diffSquares'] },
  cubes: { easy: ['direct'], medium: ['direct', 'inverse'], hard: ['direct', 'inverse'] },
  area: { easy: ['square', 'rectangle'], medium: ['rectangle', 'triangle', 'parallelogram', 'circle'], hard: ['triangle', 'circle', 'trapezium', 'border'] },
  volume: { easy: ['cube', 'cuboid'], medium: ['cuboid', 'cylinder'], hard: ['cylinder', 'sphere', 'cone'] },
  percentages: { easy: ['directOf'], medium: ['directOf', 'reverse', 'whatPct'], hard: ['directOf', 'reverse', 'whatPct', 'pctChange', 'successive', 'netTrap'] }
};
var REFACTORED = Object.keys(TIER_KEYS);

function nums(s) { return (String(s).match(/\d+/g) || []).map(Number); }
function approxEq(a, b) { return Math.abs(a - b) < 0.02; }
function r2(x) { return Math.round(x * 100) / 100; }

/* Independently recompute the expected answer from the stem for the refactored categories. Returns a number or null. */
function recompute(cat, key, text) {
  var n = nums(text);
  if (cat === 'squares') {
    if (key === 'direct') return n[0] * n[0];
    if (key === 'inverse') return Math.sqrt(n[0]);
    if (key === 'diffSquares') return n[0] * n[0] - n[1] * n[1];
  }
  if (cat === 'cubes') {
    if (key === 'direct') return n[0] * n[0] * n[0];
    if (key === 'inverse') return Math.round(Math.cbrt(n[0]));
  }
  if (cat === 'area') {
    if (key === 'square') return n[0] * n[0];
    if (key === 'rectangle') return n[0] * n[1];
    if (key === 'triangle') return n[0] * n[1] / 2;
    if (key === 'parallelogram') return n[0] * n[1];
    if (key === 'circle') return r2(3.14 * n[0] * n[0]);
    if (key === 'trapezium') return (n[0] + n[1]) * n[2] / 2;
    if (key === 'border') { var L = n[0], B = n[1], w = n[2]; return L * B - (L - 2 * w) * (B - 2 * w); }
  }
  if (cat === 'volume') {
    if (key === 'cube') return n[0] * n[0] * n[0];
    if (key === 'cuboid') return n[0] * n[1] * n[2];
    if (key === 'cylinder') return r2(3.14 * n[0] * n[0] * n[1]);
    if (key === 'sphere') return r2((4 / 3) * 3.14 * n[0] * n[0] * n[0]);
    if (key === 'cone') return r2((1 / 3) * 3.14 * n[0] * n[0] * n[1]);
  }
  if (cat === 'percentages') {
    if (key === 'directOf') return n[0] * n[1] / 100;
    if (key === 'reverse') return n[1] * 100 / n[0];          /* "p% of what number is r?" → r*100/p */
    if (key === 'whatPct') return n[1] * 100 / n[0];          /* "What percent of b is y?" → y*100/b */
    if (key === 'pctChange') return (n[1] - n[0]) * 100 / n[0];
    if (key === 'successive') return n[0] * (1 - n[1] / 100) * (1 - n[2] / 100);
    if (key === 'netTrap') return n[0] * n[0] / 100;
  }
  return null;
}

/* ── 1. structural sweep over all 14 categories × 3 difficulties ── */
var structural = 0, recomputed = 0, mismatches = 0;
var seenKeys = {};   /* cat/diff → {key:true} for diversity */
ALL_CATS.forEach(function (cat) {
  DIFFS.forEach(function (diff) {
    var tag = cat + '/' + diff;
    for (var i = 0; i < 150; i++) {
      var q = Q.generateQuestion(cat, diff);
      structural++;
      ok('1 ' + tag + ' has question text', typeof q.question === 'string' && q.question.length > 0);
      ok('1 ' + tag + ' category tag', q.category === cat);
      var isNum = typeof q.answer === 'number';
      if (isNum) ok('1 ' + tag + ' finite non-negative numeric answer', isFinite(q.answer) && q.answer >= 0);
      else ok('1 ' + tag + ' non-empty string answer', typeof q.answer === 'string' && q.answer.length > 0);
      if (q.options) { ok('1 ' + tag + ' options include answer', q.options.indexOf(String(q.answer)) !== -1); ok('1 ' + tag + ' options distinct', q.options.length === q.options.filter(function (o, k) { return q.options.indexOf(o) === k; }).length); }

      if (REFACTORED.indexOf(cat) !== -1) {
        ok('2 ' + tag + ' subtype is diff:key', typeof q.subtype === 'string' && q.subtype.indexOf(diff + ':') === 0);
        var key = String(q.subtype).split(':')[1];
        ok('2 ' + tag + ' earned-tier archetype (' + key + ')', TIER_KEYS[cat][diff].indexOf(key) !== -1);
        ok('2 ' + tag + ' has explanation', typeof q.explanation === 'string' && q.explanation.length >= 10);
        (seenKeys[tag] = seenKeys[tag] || {})[key] = true;
        var exp = recompute(cat, key, q.question);
        if (exp != null) { recomputed++; var good = approxEq(exp, q.answer); if (!good) { mismatches++; if (shownFail < 20) console.error('    recompute ' + tag + '/' + key + ': got ' + q.answer + ' expected ' + exp + ' — ' + q.question); } ok('2 ' + tag + '/' + key + ' answer == independent recompute', good); }
      }
    }
  });
});

/* ── 3. diversity: every multi-archetype tier actually surfaces ≥2 distinct archetypes over 150 samples ── */
REFACTORED.forEach(function (cat) {
  DIFFS.forEach(function (diff) {
    var want = TIER_KEYS[cat][diff].length;
    var got = Object.keys(seenKeys[cat + '/' + diff] || {}).length;
    if (want >= 2) ok('3 ' + cat + '/' + diff + ' surfaces ≥2 archetypes (' + got + '/' + want + ')', got >= 2);
  });
});

/* ── 4. no earned-tier downgrade: a hard refactored question never carries an easy-only archetype key ── */
REFACTORED.forEach(function (cat) {
  var easyOnly = TIER_KEYS[cat].easy.filter(function (k) { return TIER_KEYS[cat].hard.indexOf(k) === -1; });
  var bad = 0;
  for (var i = 0; i < 120; i++) { var k = String(Q.generateQuestion(cat, 'hard').subtype).split(':')[1]; if (easyOnly.indexOf(k) !== -1) bad++; }
  ok('4 ' + cat + ' hard never downgrades to an easy-only archetype', bad === 0);
});

console.log('quant-engine.check: ' + pass + ' passed, ' + fail + ' failed');
console.log('  (structural samples: ' + structural + '; answers independently recomputed: ' + recomputed + '; recompute mismatches: ' + mismatches + ')');
if (fail) process.exit(1);
