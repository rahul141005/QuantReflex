/**
 * lrv-census.js — exact byte-identity census for the LR-VISUAL generator (ADR-111 Phase F-M7 safety net).
 *
 * The F-M7 refactor moves lr-visual-engine's stems + explanations (and the shape-name / paint-type words embedded in
 * them) into a per-language pack (locales/gen/<lang>.lrv.js) read via QRGenI18n. To PROVE EN output is unchanged we do
 * an EXACT-sequence census: under a seeded LCG, generate a long fixed sequence per category × difficulty, serialise the
 * FULL output — stem + explanation + answer + options + subtype AND the machine figure specs (figure + optionFigures) —
 * and hash it (djb2). The legacy hashes are frozen in fixtures/lrv-census.json; the refactor must reproduce them exactly
 * for EN (any wording/RNG-order/figure-spec drift changes a hash). Serialising the figure specs also guarantees the
 * refactor never perturbs a diagram — figures must be byte-identical across languages by construction.
 *
 * Deterministic: Math.random stubbed with a seeded LCG. Run directly to (re)capture; require()'d by lr-visual checks.
 */
'use strict';

var path = require('path');
var fs = require('fs');

var LRV_CATS = ['lr-mirror', 'lr-water', 'lr-dice', 'lr-cube', 'lr-fseries', 'lr-fanalogy', 'lr-odd-fig',
  'lr-paper', 'lr-pattern', 'lr-embedded'];
var DIFFS = ['easy', 'medium', 'hard'];
var SAMPLES_PER = 3000;   // per category × difficulty — long deterministic sequence
var SEED = 0x1eaf5eed;

function makeLCG(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
function djb2(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h; }

/* Full deterministic serialisation of one visual question — text AND machine figure specs (byte-identity is the point). */
function serialize(q) {
  if (!q) return 'null';
  return q.subtype + '§' + q.question + '§' + String(q.explanation) + '§' + String(q.answer) + '§' +
    ((q.options || []).join('|')) + '§' + JSON.stringify(q.figure || null) + '§' + JSON.stringify(q.optionFigures || null);
}

/** Census the LR-visual generator into { 'cat:diff': djb2hash }. Deterministic under the seeded LCG. */
function capture(LRV, cats) {
  cats = cats || LRV_CATS;
  var _orig = Math.random;
  var out = {};
  try {
    cats.forEach(function (cat, ci) {
      DIFFS.forEach(function (diff, di) {
        var rng = makeLCG(SEED + ci * 100003 + di * 7919);
        Math.random = rng;
        var acc = '';
        for (var i = 0; i < SAMPLES_PER; i++) {
          var q; try { q = LRV.generate(cat, diff); } catch (e) { q = null; }
          acc += serialize(q) + '\n';
        }
        out[cat + ':' + diff] = djb2(acc);
      });
    });
  } finally { Math.random = _orig; }
  return out;
}

var FIXTURE = path.join(__dirname, 'fixtures', 'lrv-census.json');
function load() { return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); }
function save(obj) { fs.writeFileSync(FIXTURE, JSON.stringify(obj, null, 0) + '\n'); }

module.exports = { LRV_CATS: LRV_CATS, DIFFS: DIFFS, capture: capture, serialize: serialize, load: load, save: save, FIXTURE: FIXTURE };

if (require.main === module) {
  var LRV = require(path.join(__dirname, '..', 'js', 'lr-visual-engine.js'));
  var snap = capture(LRV);
  save(snap);
  console.log('lrv-census: captured ' + Object.keys(snap).length + ' category:difficulty hashes → ' + path.relative(process.cwd(), FIXTURE));
}
