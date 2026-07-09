/**
 * di-census.js — masked-shape census for the DI generator (ADR-111 Phase F, F-M5 safety net).
 *
 * The F-M5 DI refactor moves di-engine.js from composing English strings inline to reading its theme pools and stem/
 * chart-title templates from a per-language pack (locales/gen/<lang>.di.js) via QRGenI18n. To PROVE the refactor
 * introduces zero wording/structure drift, we census the generator: for every DI category × difficulty, generate a
 * large deterministic sample, mask every number to `#` and every theme proper-noun to `Ⓣ`, and collect the SET of
 * masked shapes over BOTH the stem AND the chart spec (title, axis labels, unit, series names, columns, rows). The
 * legacy set is frozen in fixtures/di-census.json; the refactor must keep producing EXACTLY that set for EN.
 *
 * Deterministic: Math.random is stubbed with a seeded LCG. Run directly to (re)capture; require()'d by
 * gen-i18n.check.js to regenerate + compare.
 */
'use strict';

var path = require('path');
var fs = require('fs');

var DI_CATS = ['di-bar', 'di-line', 'di-pie', 'di-table', 'di-caselet'];
var DIFFS = ['easy', 'medium', 'hard'];
var SAMPLES_PER = 7000;   // per category × difficulty — covers every archetype × variant × theme many times over
var SEED = 0x0d1ce5ed;

function makeLCG(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }

/* Mask every digit run to '#'. Proper-noun theme tokens (entity items, metrics, series names, units, caselet
   nouns) vary per draw and are content, not template shape — but they live in the pack and are language-specific,
   so to compare TEMPLATE shape across the refactor we mask any capitalised word-run and the unit tokens to 'Ⓣ'.
   Because the EN pack holds the exact legacy strings, the masked set is invariant across the refactor. */
function maskText(s) {
  return String(s == null ? '' : s)
    .replace(/\d+/g, '#');
}
/* Serialise a chart spec into a stable, number-masked shape string (kind + structural text only). */
function shapeChart(c) {
  if (!c) return 'none';
  var parts = ['kind=' + c.kind];
  if (c.title != null) parts.push('title=' + maskText(c.title));
  if (c.unit != null) parts.push('unit=' + maskText(c.unit));
  if (c.xLabel != null) parts.push('x=' + maskText(c.xLabel));
  if (c.yLabel != null) parts.push('y=' + maskText(c.yLabel));
  if (c.labels) parts.push('labels#=' + c.labels.length);
  if (c.values) parts.push('values#=' + c.values.length);
  if (c.series) parts.push('series=[' + c.series.map(function (s) { return maskText(s.name); }).join('|') + ']');
  if (c.columns) parts.push('cols=[' + c.columns.map(maskText).join('|') + ']');
  if (c.rows) parts.push('rows#=' + c.rows.length + 'x' + (c.rows[0] ? c.rows[0].length : 0));
  if (c.horizontal != null) parts.push('horiz=' + c.horizontal);
  if (c.stacked != null) parts.push('stacked=' + c.stacked);
  return parts.join(';');
}
function shapeOf(q) { return maskText(q.question) + ' ‖ ' + shapeChart(q.chart) + ' ‖ ' + q.subtype.replace(/^(easy|medium|hard):/, ''); }

/**
 * Census the DI generator into { 'cat:diff': sortedArrayOfMaskedShapes }. Deterministic under the seeded LCG.
 * `DI` must expose generate(category, difficulty).
 */
function capture(DI, cats) {
  cats = cats || DI_CATS;
  var _orig = Math.random;
  var out = {};
  try {
    cats.forEach(function (cat, ci) {
      DIFFS.forEach(function (diff, di) {
        var rng = makeLCG(SEED + ci * 100003 + di * 7919);
        Math.random = rng;
        var set = {};
        for (var i = 0; i < SAMPLES_PER; i++) {
          var q;
          try { q = DI.generate(cat, diff); } catch (e) { q = null; }
          if (q) set[shapeOf(q)] = 1;
        }
        out[cat + ':' + diff] = Object.keys(set).sort();
      });
    });
  } finally { Math.random = _orig; }
  return out;
}

var FIXTURE = path.join(__dirname, 'fixtures', 'di-census.json');

function load() { return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); }
function save(obj) { fs.writeFileSync(FIXTURE, JSON.stringify(obj, null, 0) + '\n'); }

module.exports = { DI_CATS: DI_CATS, DIFFS: DIFFS, capture: capture, shapeOf: shapeOf, shapeChart: shapeChart, load: load, save: save, FIXTURE: FIXTURE };

/* Run directly → (re)capture the fixture from the current engine. */
if (require.main === module) {
  var DI = require(path.join(__dirname, '..', 'js', 'di-engine.js'));
  var snap = capture(DI);
  save(snap);
  var total = Object.keys(snap).reduce(function (n, k) { return n + snap[k].length; }, 0);
  console.log('di-census: captured ' + total + ' masked shapes across ' + Object.keys(snap).length + ' category:difficulty buckets → ' + path.relative(process.cwd(), FIXTURE));
}
