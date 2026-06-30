/**
 * di-engine.check.js — validates the Data Interpretation generator (ADR-074, QuantReflex V2 Phase 2).
 *
 * The strong guarantee DI needs is CORRECTNESS (a wrong key silently teaches the wrong thing) and CLEAN NUMERIC
 * answers (the numpad has no letters; the grader uses a tight tolerance). This harness generates a large sample of
 * every category × difficulty and, for EACH question, independently RE-COMPUTES the answer from the chart data /
 * caselet text and asserts it equals what the engine returned — plus structural invariants (clean ≤1-dp numeric,
 * subtype matches difficulty, chart well-formed). Wired into `npm test`.   node scripts/di-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var DI = require(p('js/di-engine'));

var pass = 0, fail = 0, shownFail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shownFail <= 12) console.error('  ✗ ' + label); } }

function isClean(x) { return typeof x === 'number' && isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
function r1(x) { return Math.round(x * 10) / 10; }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }

/* chart → {labels, values, total} (table stores rows of [label, valueStr]). */
function dataOf(q) {
  var c = q.chart;
  if (!c) return null;
  if (c.kind === 'table') { var labels = c.rows.map(function (r) { return r[0]; }); var values = c.rows.map(function (r) { return Number(r[1]); }); return { labels: labels, values: values, total: sum(values) }; }
  return { labels: c.labels.slice(), values: c.values.slice(), total: sum(c.values) };
}
/* indices of labels that appear in the question text, ordered by first appearance. */
function refIdx(labels, text) {
  var found = [];
  labels.forEach(function (l, i) { var pos = text.indexOf(l); if (pos >= 0) found.push({ i: i, pos: pos }); });
  found.sort(function (a, b) { return a.pos - b.pos; });
  return found.map(function (f) { return f.i; });
}

/* Independently recompute the expected answer. Returns a number, or null if this key isn't recomputed here. */
function recompute(q) {
  var key = q.subtype.split(':')[1];
  var text = q.question;
  if (q.category === 'di-caselet') {
    var m1 = text.match(/Out of (\d+) .*?, (\d+) are/);
    var m2 = text.match(/(\d+)% of the .*? and (\d+)% of/);
    if (!m1 || !m2) return null;
    var T = +m1[1], g1 = +m1[2], g2 = T - g1, p1 = +m2[1], p2 = +m2[2];
    var a1 = g1 * p1 / 100, a2 = g2 * p2 / 100;
    if (key === 'caseRead') return a1;
    if (key === 'caseTotal') return a1 + a2;
    if (key === 'caseShare') return r1(a1 / (a1 + a2) * 100);
    return null;
  }
  var d = dataOf(q); if (!d) return null;
  var L = d.labels, V = d.values, total = d.total, ix = refIdx(L, text);
  switch (key) {
    case 'read': return ix.length === 1 ? V[ix[0]] : null;
    case 'max': case 'peak': return Math.max.apply(null, V);
    case 'min': return Math.min.apply(null, V);
    case 'total': return total;
    case 'avg': return r1(total / V.length);
    case 'diff': return ix.length === 2 ? Math.abs(V[ix[0]] - V[ix[1]]) : null;
    case 'share': return ix.length === 1 ? r1(V[ix[0]] / total * 100) : null;
    case 'combinedShare': return ix.length === 2 ? r1((V[ix[0]] + V[ix[1]]) / total * 100) : null;
    case 'deviation': { if (ix.length !== 1) return null; var avg = total / V.length; return r1(Math.abs((V[ix[0]] - avg) / avg * 100)); }
    case 'project': { var pm = text.match(/rises by (\d+)%/); if (ix.length !== 1 || !pm) return null; return r1(V[ix[0]] * (1 + (+pm[1]) / 100)); }
    case 'pctMore': return ix.length === 2 ? r1(Math.abs((V[ix[0]] - V[ix[1]]) / V[ix[1]] * 100)) : null;
    case 'yoy': { var ym = text.match(/from (\d{4}) to (\d{4})/); if (!ym) return null; var i1 = L.indexOf(ym[1]), i2 = L.indexOf(ym[2]); if (i1 < 0 || i2 < 0) return null; return r1(Math.abs((V[i2] - V[i1]) / V[i1] * 100)); }
    case 'biggestJump': { var best = 0; for (var z = 1; z < V.length; z++) best = Math.max(best, Math.abs(V[z] - V[z - 1])); return best; }
    case 'cumulativeShare': { var half = Math.floor(L.length / 2); return r1(sum(V.slice(0, half)) / total * 100); }
    default: return null;
  }
}

var EASY = { read: 1, max: 1, min: 1, peak: 1, caseRead: 1 };
var MED = { total: 1, diff: 1, avg: 1, share: 1, caseTotal: 1 };
var HARD = { deviation: 1, combinedShare: 1, project: 1, pctMore: 1, yoy: 1, biggestJump: 1, cumulativeShare: 1, caseShare: 1 };

console.log('di-engine.check — Data Interpretation generator (ADR-074)');

/* ── 1. categories ── */
ok('1 five DI categories', DI.categories().length === 5 && DI.categories().indexOf('di-bar') !== -1 && DI.categories().indexOf('di-caselet') !== -1);

/* ── 2. bulk structural + correctness sweep ── */
(function () {
  var cats = DI.categories(), diffs = ['easy', 'medium', 'hard'];
  var recomputed = 0, structural = 0;
  cats.forEach(function (cat) {
    diffs.forEach(function (diff) {
      for (var n = 0; n < 120; n++) {
        var q = DI.generate(cat, diff);
        structural++;
        ok('2 ' + cat + '/' + diff + ' numeric+clean+nonneg', isClean(q.answer) && q.answer >= 0);
        ok('2 ' + cat + ' category tag', q.category === cat);
        ok('2 ' + diff + ' subtype prefix', q.subtype.indexOf(diff + ':') === 0);
        var key = q.subtype.split(':')[1];
        var bucket = diff === 'easy' ? EASY : (diff === 'medium' ? MED : HARD);
        ok('2 ' + diff + ' uses a ' + diff + '-tier template (' + key + ')', !!bucket[key]);
        if (cat === 'di-caselet') { ok('2 caselet has no chart', !q.chart); ok('2 caselet stem has numbers', /\d/.test(q.question)); }
        else { ok('2 ' + cat + ' chart kind', q.chart && ['bar', 'line', 'pie', 'table'].indexOf(q.chart.kind) !== -1); }
        var exp = recompute(q);
        if (exp != null) { recomputed++; ok('2 ' + cat + '/' + key + ' answer matches independent recompute', Math.abs(exp - q.answer) < 1e-6); }
      }
    });
  });
  console.log('  (structural samples: ' + structural + '; answers independently recomputed: ' + recomputed + ')');
  ok('2 the vast majority of answers were recomputed (not just structurally checked)', recomputed > structural * 0.7);
})();

/* ── 3. explicit difficulty is honored (not the ambient default) ── */
(function () {
  for (var n = 0; n < 40; n++) {
    ok('3 explicit easy', DI.generate('di-bar', 'easy').subtype.indexOf('easy:') === 0);
    ok('3 explicit hard', DI.generate('di-line', 'hard').subtype.indexOf('hard:') === 0);
  }
})();

/* ── 4. chart well-formedness: labels/values aligned, values positive integers ── */
(function () {
  ['di-bar', 'di-line', 'di-pie'].forEach(function (cat) {
    for (var n = 0; n < 40; n++) {
      var c = DI.generate(cat, 'medium').chart;
      ok('4 ' + cat + ' labels/values aligned', c.labels.length === c.values.length && c.labels.length >= 4);
      ok('4 ' + cat + ' values positive ints', c.values.every(function (v) { return v > 0 && v % 1 === 0; }));
    }
  });
  for (var t = 0; t < 40; t++) {
    var tc = DI.generate('di-table', 'medium').chart;
    ok('4 table rows match columns', tc.rows.every(function (r) { return r.length === tc.columns.length; }));
  }
})();

console.log('\ndi-engine.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
