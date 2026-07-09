/**
 * lr-census.js — exact byte-identity census for the LR generator (ADR-111 Phase F-M6 safety net).
 *
 * The F-M6 LR refactor moves di-engine-style string production into a per-language pack (locales/gen/<lang>.lr.js)
 * read via QRGenI18n, and refactors the kinship composition to relation-IDs. To PROVE EN output is unchanged we do an
 * EXACT-sequence census: under a seeded LCG, generate a long fixed sequence per category × difficulty, concatenate the
 * full output (question + options + answer + subtype) and hash it (djb2). The legacy hashes are frozen in
 * fixtures/lr-census.json; the refactor must reproduce them exactly for EN (any wording/RNG-order drift changes a hash).
 *
 * Deterministic: Math.random stubbed with a seeded LCG. Run directly to (re)capture; require()'d by lr-engine.check.js.
 */
'use strict';

var path = require('path');
var fs = require('fs');

var LR_CATS = ['lr-coding', 'lr-blood', 'lr-direction', 'lr-ranking', 'lr-odd', 'lr-analogy', 'lr-syllogism',
  'lr-series', 'lr-inequality', 'lr-calendar', 'lr-clock', 'lr-io'];
var DIFFS = ['easy', 'medium', 'hard'];
var SAMPLES_PER = 4000;   // per category × difficulty — long deterministic sequence
var SEED = 0x1a7e5eed;

function makeLCG(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
function djb2(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h; }

/* Full deterministic serialisation of one question (exact — no masking; byte-identity is the point). */
function serialize(q) {
  if (!q) return 'null';
  return q.subtype + '§' + q.question + '§' + String(q.answer) + '§' + ((q.options || []).join('|'));
}

/** Census the LR generator into { 'cat:diff': djb2hash }. Deterministic under the seeded LCG. */
function capture(LR, cats) {
  cats = cats || LR_CATS;
  var _orig = Math.random;
  var out = {};
  try {
    cats.forEach(function (cat, ci) {
      DIFFS.forEach(function (diff, di) {
        var rng = makeLCG(SEED + ci * 100003 + di * 7919);
        Math.random = rng;
        var acc = '';
        for (var i = 0; i < SAMPLES_PER; i++) {
          var q; try { q = LR.generate(cat, diff); } catch (e) { q = null; }
          acc += serialize(q) + '\n';
        }
        out[cat + ':' + diff] = djb2(acc);
      });
    });
  } finally { Math.random = _orig; }
  return out;
}

var FIXTURE = path.join(__dirname, 'fixtures', 'lr-census.json');
function load() { return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); }
function save(obj) { fs.writeFileSync(FIXTURE, JSON.stringify(obj, null, 0) + '\n'); }

module.exports = { LR_CATS: LR_CATS, DIFFS: DIFFS, capture: capture, serialize: serialize, load: load, save: save, FIXTURE: FIXTURE };

if (require.main === module) {
  var LR = require(path.join(__dirname, '..', 'js', 'lr-engine.js'));
  var snap = capture(LR);
  save(snap);
  console.log('lr-census: captured ' + Object.keys(snap).length + ' category:difficulty hashes → ' + path.relative(process.cwd(), FIXTURE));
}
