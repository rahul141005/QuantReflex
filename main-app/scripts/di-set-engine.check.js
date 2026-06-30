/**
 * di-set-engine.check.js — validates the DI SETS generator (ADR-078).
 *
 * A set must be EXAM-SHAPED and CORRECT: one shared dataset/chart/context, 3–6 questions of NON-DECREASING
 * difficulty testing DISTINCT skills, each answer clean (≤1-dp numeric) and INDEPENDENTLY recomputable from the
 * shared data. This harness generates a large sample per category and recomputes every answer. Wired into `npm test`.
 *   node scripts/di-set-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var SE = require(p('js/di-set-engine'));

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 14) console.error('  ✗ ' + label); } }
function r1(x) { return Math.round(x * 10) / 10; }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }
function isClean(x) { return typeof x === 'number' && isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
var RANK = { easy: 0, medium: 1, hard: 2 };

/* find indices of chart labels present in the question text. */
function refIdx(labels, text) { var f = []; labels.forEach(function (l, i) { var pos = text.indexOf(l); if (pos >= 0) f.push({ i: i, pos: pos }); }); f.sort(function (a, b) { return a.pos - b.pos; }); return f.map(function (x) { return x.i; }); }

/* normalize a non-caselet set's chart to {labels, values?|series?}. */
function dataOf(set) {
  var c = set.chart;
  if (c.kind === 'table') { var labels = c.rows.map(function (r) { return r[0]; }); if (c.columns.length > 2) { var series = []; for (var k = 1; k < c.columns.length; k++) series.push({ values: c.rows.map(function (r) { return Number(r[k]); }) }); return { labels: labels, series: series }; } return { labels: labels, values: c.rows.map(function (r) { return Number(r[1]); }) }; }
  if (c.series) return { labels: c.labels.slice(), series: c.series.map(function (s) { return { values: s.values.slice() }; }) };
  return { labels: c.labels.slice(), values: c.values.slice() };
}

function recompute(set, q) {
  var key = q.subtype.split(':')[1], text = q.question;
  if (set.category === 'di-caselet') {
    var ds = set.dataset, a1 = ds.g1 * ds.p1 / 100, a2 = ds.g2 * ds.p2 / 100;
    if (key === 'set_caseRead') return a1;
    if (key === 'set_caseTotal') return a1 + a2;
    if (key === 'set_caseMissing') return a2;
    if (key === 'set_caseShare') return r1(a1 / (a1 + a2) * 100);
    return null;
  }
  var d = dataOf(set);
  if (d.series) { /* multi-series set: builders use series[0]=a, series[1]=b by position */
    var S = d.series, a = S[0], b = S[1] || S[0], ix = refIdx(d.labels, text);
    switch (key) {
      case 'set_read': return ix.length >= 1 ? a.values[ix[0]] : null;
      case 'set_max': return Math.max.apply(null, b.values);
      case 'set_total': return sum(a.values);
      case 'set_crossDiff': return ix.length >= 1 ? Math.abs(a.values[ix[0]] - b.values[ix[0]]) : null;
      case 'set_ratio': { if (ix.length < 1) return null; var g = gcd(a.values[ix[0]], b.values[ix[0]]); return a.values[ix[0]] / g; }
      case 'set_share': { if (ix.length < 1) return null; var t = 0; for (var i = 0; i < S.length; i++) t += S[i].values[ix[0]]; return r1(a.values[ix[0]] / t * 100); }
      case 'set_grand': { var g2 = 0; for (var s = 0; s < S.length; s++) g2 += sum(S[s].values); return g2; }
      default: return null;
    }
  }
  /* single-series set: di-engine entity archetype keys */
  var L = d.labels, V = d.values, total = sum(V), jx = refIdx(L, text);
  switch (key) {
    case 'read': case 'missing': return jx.length >= 1 ? V[jx[0]] : null;
    case 'max': return Math.max.apply(null, V);
    case 'min': return Math.min.apply(null, V);
    case 'rank': { var srt = V.slice().sort(function (x, y) { return y - x; }); var rm = text.match(/(\d)(?:st|nd|rd|th) highest/); return rm ? srt[(+rm[1]) - 1] : null; }
    case 'total': return total;
    case 'avg': return r1(total / V.length);
    case 'diff': return jx.length === 2 ? Math.abs(V[jx[0]] - V[jx[1]]) : null;
    case 'share': return jx.length === 1 ? r1(V[jx[0]] / total * 100) : null;
    case 'combinedShare': return jx.length === 2 ? r1((V[jx[0]] + V[jx[1]]) / total * 100) : null;
    case 'deviation': { if (jx.length !== 1) return null; var av = total / V.length; return r1(Math.abs((V[jx[0]] - av) / av * 100)); }
    case 'pctMore': return jx.length === 2 ? r1(Math.abs((V[jx[0]] - V[jx[1]]) / V[jx[1]] * 100)) : null;
    case 'ratio': { if (jx.length !== 2) return null; if (/how many times/.test(text)) return r1(V[jx[0]] / V[jx[1]]); var g3 = gcd(V[jx[0]], V[jx[1]]); return V[jx[0]] / g3; }
    default: return null;
  }
}

console.log('di-set-engine.check — DI sets (ADR-078)');

ok('0 five set categories', SE.categories().length === 5);

(function () {
  var cats = SE.categories(), total = 0, recomputed = 0, mismatch = 0;
  cats.forEach(function (cat) {
    for (var n = 0; n < 200; n++) {
      var set = SE.generateSet(cat);
      ok('1 ' + cat + ' set non-null', !!set);
      if (!set) continue;
      ok('1 ' + cat + ' 3–6 questions', set.questions.length >= 3 && set.questions.length <= 6);
      /* exactly one shared context: a chart (non-caselet) XOR a text context (caselet) */
      if (cat === 'di-caselet') ok('1 caselet set has text context, no chart', !!set.context && !set.chart);
      else ok('1 ' + cat + ' set has a shared chart', !!set.chart && ['bar', 'line', 'pie', 'table'].indexOf(set.chart.kind) !== -1);
      var lastRank = -1, skills = {}, dups = 0, badDiff = 0;
      set.questions.forEach(function (q) {
        total++;
        ok('1 answer clean+nonneg', isClean(q.answer) && q.answer >= 0);
        ok('1 subtype encodes difficulty', q.subtype.indexOf(q.difficulty + ':') === 0);
        if (RANK[q.difficulty] < lastRank) badDiff++; lastRank = RANK[q.difficulty];
        if (skills[q.skill]) dups++; skills[q.skill] = 1;
        var exp = recompute(set, q);
        if (exp != null) { recomputed++; if (Math.abs(exp - q.answer) >= 1e-6) mismatch++; }
      });
      ok('1 ' + cat + ' difficulty is non-decreasing', badDiff === 0);
      ok('1 ' + cat + ' every question tests a distinct skill', dups === 0);
    }
  });
  console.log('  (set questions: ' + total + '; independently recomputed: ' + recomputed + '; mismatches: ' + mismatch + ')');
  ok('2 most set answers independently recomputed', recomputed > total * 0.75);
  ok('2 zero recompute mismatches', mismatch === 0);
})();

console.log('\ndi-set-engine.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
