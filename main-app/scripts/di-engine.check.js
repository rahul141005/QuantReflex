/**
 * di-engine.check.js — validates the Data Interpretation generator (ADR-074; overhaul ADR-078).
 *
 * The guarantees DI needs: CORRECTNESS (a wrong key silently teaches the wrong thing), CLEAN NUMERIC answers (the
 * numpad has no letters; the grader uses a tight tolerance), and EARNED DIFFICULTY (a tier label must reflect a tier
 * archetype — the old fallback could emit `hard:read`). This harness generates a large sample of every category ×
 * difficulty and, for EACH question, independently RE-COMPUTES the answer from the chart data / caselet text (single-
 * series, multi-series, multi-column tables, caselets) and asserts it equals the engine's — plus structural
 * invariants. Wired into `npm test`.   node scripts/di-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var DI = require(p('js/di-engine'));

var pass = 0, fail = 0, shownFail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shownFail <= 14) console.error('  ✗ ' + label); } }

function isClean(x) { return typeof x === 'number' && isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
function r1(x) { return Math.round(x * 10) / 10; }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

/* chart → normalized data. Single-series: {labels,values,total}. Multi: {multi:true,labels,series:[{name,values}]}. */
function dataOf(q) {
  var c = q.chart; if (!c) return null;
  if (c.kind === 'table') {
    var labels = c.rows.map(function (r) { return r[0]; });
    if (c.columns.length > 2) { var series = []; for (var k = 1; k < c.columns.length; k++) series.push({ name: c.columns[k], values: c.rows.map(function (r) { return Number(r[k]); }) }); return { multi: true, labels: labels, series: series }; }
    var values = c.rows.map(function (r) { return Number(r[1]); }); return { labels: labels, values: values, total: sum(values) };
  }
  if (c.series) return { multi: true, labels: c.labels.slice(), series: c.series.map(function (s) { return { name: s.name, values: s.values.slice() }; }) };
  return { labels: c.labels.slice(), values: c.values.slice(), total: sum(c.values) };
}
/* indices of labels that appear in the question text, ordered by first appearance. */
function refIdx(labels, text) {
  var found = [];
  labels.forEach(function (l, i) { var pos = text.indexOf(l); if (pos >= 0) found.push({ i: i, pos: pos }); });
  found.sort(function (a, b) { return a.pos - b.pos; });
  return found.map(function (f) { return f.i; });
}

/* Independently recompute the expected answer. Returns a number, or null if not recomputed here. */
function recompute(q) {
  var key = q.subtype.split(':')[1], text = q.question;
  if (q.category === 'di-caselet') {
    var m1 = text.match(/Out of (\d+) .*?, (\d+) are/), m2 = text.match(/(\d+)% of the .*? and (\d+)% of/);
    if (!m1 || !m2) return null;
    var T = +m1[1], g1 = +m1[2], g2 = T - g1, p1 = +m2[1], p2 = +m2[2], a1 = g1 * p1 / 100, a2 = g2 * p2 / 100;
    if (key === 'caseRead') return a1;
    if (key === 'caseTotal') return a1 + a2;
    if (key === 'caseMissing') return a2;
    if (key === 'caseShare') return r1(a1 / (a1 + a2) * 100);
    return null;
  }
  var d = dataOf(q); if (!d) return null;
  if (d.multi) {
    var S = d.series, yi = refIdx(d.labels, text);
    switch (key) {
      case 'm_pctDiff': return yi.length >= 1 && S[1].values[yi[0]] ? r1(Math.abs((S[0].values[yi[0]] - S[1].values[yi[0]]) / S[1].values[yi[0]] * 100)) : null;
      case 'm_seriesShare': { if (yi.length < 1) return null; var t = 0; for (var i = 0; i < S.length; i++) t += S[i].values[yi[0]]; return r1(S[0].values[yi[0]] / t * 100); }
      case 'm_ratioYear': { if (yi.length < 1) return null; var g = gcd(S[0].values[yi[0]], S[1].values[yi[0]]); return S[0].values[yi[0]] / g; }
      case 'm_combinedShare': { if (yi.length < 1) return null; var grand = 0; for (var s2 = 0; s2 < S.length; s2++) for (var e = 0; e < d.labels.length; e++) grand += S[s2].values[e]; return r1((S[0].values[yi[0]] + S[1].values[yi[0]]) / grand * 100); }
      case 'm_trendCompare': { var d1 = S[0].values[S[0].values.length - 1] - S[0].values[0], d2 = S[1].values[S[1].values.length - 1] - S[1].values[0]; return Math.abs(Math.abs(d1) - Math.abs(d2)); }
      default: return null;
    }
  }
  var L = d.labels, V = d.values, total = d.total, ix = refIdx(L, text);
  switch (key) {
    case 'read': case 'missing': return ix.length >= 1 ? V[ix[0]] : null;
    case 'max': case 'peak': return Math.max.apply(null, V);
    case 'min': case 'trough': return Math.min.apply(null, V);
    case 'rank': { var srt = V.slice().sort(function (a, b) { return b - a; }); var rm = text.match(/(\d)(?:st|nd|rd|th) highest/); return rm ? srt[(+rm[1]) - 1] : null; }
    case 'total': return total;
    case 'avg': return r1(total / V.length);
    case 'diff': return ix.length === 2 ? Math.abs(V[ix[0]] - V[ix[1]]) : null;
    case 'biggestJump': { var best = 0; for (var z = 1; z < V.length; z++) best = Math.max(best, Math.abs(V[z] - V[z - 1])); return best; }
    case 'share': return ix.length === 1 ? r1(V[ix[0]] / total * 100) : null;
    case 'combinedShare': return ix.length === 2 ? r1((V[ix[0]] + V[ix[1]]) / total * 100) : null;
    case 'deviation': { if (ix.length !== 1) return null; var avg = total / V.length; return r1(Math.abs((V[ix[0]] - avg) / avg * 100)); }
    case 'pctMore': return ix.length === 2 ? r1(Math.abs((V[ix[0]] - V[ix[1]]) / V[ix[1]] * 100)) : null;
    case 'ratio': { if (ix.length !== 2) return null; if (/how many times/.test(text)) return r1(V[ix[0]] / V[ix[1]]); var g = gcd(V[ix[0]], V[ix[1]]); return V[ix[0]] / g; }
    case 'yoy': { var ym = text.match(/from (\d{4}) to (\d{4})/); if (!ym) return null; var i1 = L.indexOf(ym[1]), i2 = L.indexOf(ym[2]); if (i1 < 0 || i2 < 0 || !V[i1]) return null; return r1(Math.abs((V[i2] - V[i1]) / V[i1] * 100)); }
    case 'overallGrowth': return V[0] ? r1(Math.abs((V[V.length - 1] - V[0]) / V[0] * 100)) : null;
    case 'cumulativeShare': { var half = Math.floor(L.length / 2); return r1(sum(V.slice(0, half)) / total * 100); }
    default: return null;
  }
}

var EASY = { read: 1, max: 1, min: 1, rank: 1, peak: 1, trough: 1, caseRead: 1 };
var MED = { total: 1, diff: 1, avg: 1, share: 1, missing: 1, biggestJump: 1, caseTotal: 1, caseMissing: 1 };
var HARD = { pctMore: 1, deviation: 1, combinedShare: 1, ratio: 1, yoy: 1, cumulativeShare: 1, overallGrowth: 1, caseShare: 1,
  m_pctDiff: 1, m_ratioYear: 1, m_combinedShare: 1, m_trendCompare: 1, m_seriesShare: 1 };

console.log('di-engine.check — Data Interpretation generator (ADR-078)');

/* ── 1. categories ── */
ok('1 five DI categories', DI.categories().length === 5 && DI.categories().indexOf('di-bar') !== -1 && DI.categories().indexOf('di-caselet') !== -1);

/* ── 2. bulk structural + correctness sweep ── */
(function () {
  var cats = DI.categories(), diffs = ['easy', 'medium', 'hard'];
  var recomputed = 0, structural = 0, mismatches = 0, multiSeen = 0;
  cats.forEach(function (cat) {
    diffs.forEach(function (diff) {
      for (var n = 0; n < 160; n++) {
        var q = DI.generate(cat, diff);
        structural++;
        ok('2 ' + cat + '/' + diff + ' numeric+clean+nonneg', isClean(q.answer) && q.answer >= 0);
        ok('2 ' + cat + ' category tag', q.category === cat);
        ok('2 ' + diff + ' subtype prefix', q.subtype.indexOf(diff + ':') === 0);
        var key = q.subtype.split(':')[1];
        var bucket = diff === 'easy' ? EASY : (diff === 'medium' ? MED : HARD);
        ok('2 ' + diff + ' uses an EARNED ' + diff + '-tier archetype (' + key + ')', !!bucket[key]);
        if (cat === 'di-caselet') { ok('2 caselet has no chart', !q.chart); ok('2 caselet stem has numbers', /\d/.test(q.question)); }
        else {
          ok('2 ' + cat + ' chart kind', q.chart && ['bar', 'line', 'pie', 'table'].indexOf(q.chart.kind) !== -1);
          if (q.chart && q.chart.series) multiSeen++;
        }
        var exp = recompute(q);
        if (exp != null) { recomputed++; var good = Math.abs(exp - q.answer) < 1e-6; if (!good) mismatches++; ok('2 ' + cat + '/' + key + ' answer == independent recompute', good); }
      }
    });
  });
  console.log('  (structural samples: ' + structural + '; answers independently recomputed: ' + recomputed + '; multi-series charts seen: ' + multiSeen + ')');
  ok('2 the vast majority of answers were independently recomputed', recomputed > structural * 0.7);
  ok('2 zero recompute mismatches', mismatches === 0);
  ok('2 multi-series cross-series questions are generated at hard', multiSeen > 50);
})();

/* ── 3. explicit difficulty is honored (not the ambient default) ── */
(function () {
  for (var n = 0; n < 40; n++) {
    ok('3 explicit easy', DI.generate('di-bar', 'easy').subtype.indexOf('easy:') === 0);
    ok('3 explicit hard', DI.generate('di-line', 'hard').subtype.indexOf('hard:') === 0);
  }
})();

/* ── 4. NO unearned labels: a hard question never carries an easy-tier archetype key ── */
(function () {
  var bad = 0;
  ['di-bar', 'di-line', 'di-table', 'di-pie', 'di-caselet'].forEach(function (cat) {
    for (var n = 0; n < 120; n++) { var key = DI.generate(cat, 'hard').subtype.split(':')[1]; if (EASY[key]) bad++; }
  });
  ok('4 no hard question downgraded to an easy-tier archetype (the old hard:read bug)', bad === 0);
})();

/* ── 5. chart well-formedness: single-series aligned & positive; multi-series series aligned ── */
(function () {
  ['di-bar', 'di-line', 'di-pie'].forEach(function (cat) {
    for (var n = 0; n < 40; n++) {
      var c = DI.generate(cat, 'medium').chart;
      ok('5 ' + cat + ' labels/values aligned', c.labels.length === c.values.length && c.labels.length >= 4);
      ok('5 ' + cat + ' values positive ints', c.values.every(function (v) { return v > 0 && v % 1 === 0; }));
    }
  });
  var checkedMulti = 0;
  for (var t = 0; t < 400 && checkedMulti < 20; t++) {
    var c2 = DI.generate(_pick(['di-bar', 'di-line', 'di-table']), 'hard').chart;
    if (c2 && c2.series) {
      checkedMulti++;
      ok('5 multi-series each series aligned to labels', c2.series.every(function (s) { return s.values.length === c2.labels.length; }));
      ok('5 multi-series values positive ints', c2.series.every(function (s) { return s.values.every(function (v) { return v > 0 && v % 1 === 0; }); }));
    }
  }
  ok('5 multi-series charts were exercised', checkedMulti >= 20);
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
})();

/* ── 6. EN byte-identity census (ADR-111 F-M5) — the DI i18n refactor moved every string into locales/gen/<lang>.di.js.
   To prove EN output is unchanged, regenerate the masked-shape census and assert SET equality with the frozen legacy
   baseline (fixtures/di-census.json). A changed/new/dropped stem or chart-title shape fails here. Regenerate the
   baseline only via `node scripts/di-census.js`, and only when an intentional EN wording change is being made. ── */
(function () {
  var census;
  try { census = require(path.join(__dirname, 'di-census.js')); } catch (e) { ok('6 di-census module present', false); return; }
  var base;
  try { base = census.load(); } catch (e) { ok('6 di-census baseline fixture present', false); return; }
  var now = census.capture(DI);
  Object.keys(base).forEach(function (bucket) {
    var a = base[bucket].join('\n'), b = (now[bucket] || []).join('\n');
    ok('6 census EN byte-identity: ' + bucket, a === b);
  });
  ok('6 census bucket count matches', Object.keys(now).length === Object.keys(base).length);
})();

console.log('\ndi-engine.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
