/**
 * quant-census.js — masked-shape census for the quant generator (ADR-111 Phase F, F-M2 safety net).
 *
 * The Phase-F quant refactor moves each archetype's build() from composing English strings to returning
 * language-neutral `slots` that a template renders. To PROVE the refactor introduces zero wording drift (and
 * therefore zero math drift for the digit-order recompute in quant-engine.check), we census the generator: for
 * every category × difficulty, generate a large deterministic sample, mask every number to `#`, and collect the
 * SET of masked stem+explanation shapes. The legacy set is frozen in `fixtures/quant-census.json`; the refactor
 * must keep producing EXACTLY that set (§5.4.6). Because English templates are extracted VERBATIM from the
 * current pick() branches, the masked set is invariant across the refactor.
 *
 * Deterministic: Math.random is stubbed with a seeded LCG so the census is reproducible run-to-run (no CI
 * flakiness) while a large N guarantees every few-variant archetype shape is covered. Run directly to (re)capture
 * the fixtures; `require()`d by gen-i18n.check.js to regenerate and compare.
 */
'use strict';

var path = require('path');
var fs = require('fs');

/* The 36 quant categories (mirrors quant-engine.check ALL_CATS). */
var QUANT_CATS = ['squares', 'cubes', 'area', 'volume', 'fractions', 'percentages', 'multiplication', 'ratios',
  'averages', 'profit-loss', 'time-speed-distance', 'time-and-work', 'simplification', 'number-series',
  'simple-interest', 'compound-interest', 'partnership', 'ages', 'mixtures', 'pipes-cisterns', 'number-properties',
  'linear-equations', 'quadratic-equations', 'surds-indices', 'logarithms', 'progressions', 'inequalities-modulus',
  'geometry-basics', 'coordinate-geometry-basics', 'trigonometry', 'surface-area', 'permutation-combination',
  'probability', 'set-theory', 'statistics-basics', 'quantity-comparison'];
var DIFFS = ['easy', 'medium', 'hard'];
var SAMPLES_PER = 6000;   // per category × difficulty — covers few-variant archetypes many times over
var SEED = 0x5eed1234;

function makeLCG(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }

/* Pool names (both the trilingual NAME_POOL and the legacy string pool) vary per draw and are proper nouns, not
   wording — mask them to a single token so the census measures TEMPLATE shape, not which name happened to be
   picked. Longest-first so substrings don't partially match. */
var QRGen = require(path.join(__dirname, '..', 'js', 'utils', 'generative-helpers.js'));
var NAME_TOKENS = (function () {
  var set = {};
  (QRGen.NAME_POOL || []).forEach(function (e) { set[e.en] = 1; });
  ['Ravi', 'Priya', 'Arjun', 'Meera', 'Kabir', 'Anita', 'Rohan', 'Sneha', 'Vikram', 'Pooja', 'Amit', 'Neha',
    'Raj', 'Divya', 'Karan', 'Isha', 'Manish', 'Rina', 'Sunil', 'Kavya', 'Deepak', 'Nisha', 'Arun', 'Sara'].forEach(function (n) { set[n] = 1; });
  return Object.keys(set).sort(function (a, b) { return b.length - a.length; });
})();
var NAME_RE = new RegExp('\\b(' + NAME_TOKENS.join('|') + ')\\b', 'g');

/* Mask every digit run to '#' and every pool name to 'ℕ', so shape is compared independent of numbers and names. */
function mask(s) { return String(s == null ? '' : s).replace(NAME_RE, 'ℕ').replace(/\d+/g, '#'); }
function shapeOf(qObj) { return mask(qObj.question) + ' ‖ ' + mask(qObj.explanation || ''); }

/**
 * Census the generator into { category: sortedArrayOfMaskedShapes }. Deterministic under the seeded LCG.
 * `Q` is the required questions.js module (must expose generateQuestion(cat, diff)).
 */
function capture(Q, cats) {
  cats = cats || QUANT_CATS;
  var _orig = Math.random;
  var out = {};
  try {
    cats.forEach(function (cat, idx) {
      /* Reset the RNG PER CATEGORY so refactoring one category's random consumption cannot perturb another's
         census stream — each category's shape set is measured in isolation (§5.4.6 stream-independence). */
      Math.random = makeLCG(SEED + idx * 7919);
      var set = {};
      DIFFS.forEach(function (diff) {
        for (var i = 0; i < SAMPLES_PER; i++) {
          var q = Q.generateQuestion(cat, diff);
          if (q && q.question != null) set[shapeOf(q)] = 1;
        }
      });
      out[cat] = Object.keys(set).sort();
    });
  } finally { Math.random = _orig; }
  return out;
}

module.exports = { capture: capture, QUANT_CATS: QUANT_CATS, SAMPLES_PER: SAMPLES_PER, SEED: SEED, shapeOf: shapeOf, mask: mask };

/* Run directly → (re)capture the fixtures from the CURRENT generator. */
if (require.main === module) {
  var Q = require(path.join(__dirname, '..', 'js', 'questions.js'));
  var data = capture(Q);
  var dir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  var file = path.join(dir, 'quant-census.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 0) + '\n');
  var total = Object.keys(data).reduce(function (a, c) { return a + data[c].length; }, 0);
  console.log('quant-census: captured ' + Object.keys(data).length + ' categories, ' + total + ' masked shapes → ' + path.relative(process.cwd(), file));
}
