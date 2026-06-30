/**
 * di-set-engine.js — authentic Data Interpretation SETS (ADR-078).
 *
 * Real exam DI is a SET: ONE shared chart/table/caselet with 3–6 linked questions of progressive difficulty, each
 * testing a DIFFERENT cognitive skill (observation → comparison → ratio → %-change → contribution → inference). This
 * is the single biggest gap between a drill app and an exam-grade platform. This module is the "second engine": it
 * GENERATES sets; presentation reuses the proven drill engine (it consumes a set's shared chart + question list).
 *
 *   set = { category, chart (spec di-charts renders) | null, context (text, for caselets) | null,
 *           dataset (cached so nothing regenerates mid-set), questions:[{question,answer,subtype,skill,difficulty}],
 *           meta:{count, kind} }
 *
 * Reuses di-engine's datasets/chart-builders/archetypes (DIEngine._datasets / _charts / _arch) — no parallel data
 * model. Every answer is clean (integer or 1-dp) and independently recomputable (scripts/di-set-engine.check.js
 * recomputes all of them from the shared dataset). PURE + dual-exported for node tests.
 */
(function (root) {
  'use strict';

  var DI = (typeof require === 'function') ? require('./di-engine') : (typeof window !== 'undefined' ? window.DIEngine : root.DIEngine);

  function _ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function _round1(x) { return Math.round(x * 10) / 10; }
  function _isClean(x) { return isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
  function _gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

  /* progressive, non-decreasing difficulty for a set of `count` (≤2 of any tier so a pool always has a distinct skill). */
  function _progDiffs(count) {
    if (count <= 3) return ['easy', 'medium', 'hard'];
    if (count === 4) return ['easy', 'medium', 'medium', 'hard'];
    if (count === 5) return ['easy', 'medium', 'medium', 'hard', 'hard'];
    return ['easy', 'easy', 'medium', 'medium', 'hard', 'hard'];
  }

  /* ════════════════ MULTI-SERIES sets (grouped bar / multi-line) — the authentic cross-series set ════════════════
     Each archetype reads a FIXED shared dataset d ({labels, series:[{name,values}], metric, entity?}); returns
     {q,a,k,skill} or null. Always-clean ones (read/max/total/diff/ratio/grand) guarantee a fillable set. */
  function _setReadS0(d) { var i = _ri(0, d.labels.length - 1), S = d.series[0]; return { q: 'What is the ' + S.name + ' ' + d.metric + ' for ' + d.labels[i] + '?', a: S.values[i], k: 'set_read', skill: 'observation' }; }
  function _setMaxS1(d) { var S = d.series[1] || d.series[0]; return { q: 'Across all entries, what is the highest ' + S.name + ' ' + d.metric + '? Enter that value.', a: Math.max.apply(null, S.values), k: 'set_max', skill: 'ranking' }; }
  function _setTotalS0(d) { var S = d.series[0]; return { q: 'What is the total ' + S.name + ' ' + d.metric + ' across all entries?', a: _sum(S.values), k: 'set_total', skill: 'aggregation' }; }
  function _setCrossDiff(d) { var i = _ri(0, d.labels.length - 1), a = d.series[0], b = d.series[1] || d.series[0], dv = Math.abs(a.values[i] - b.values[i]); if (!dv) return null; return { q: 'For ' + d.labels[i] + ', by how much does ' + a.name + ' differ from ' + b.name + '? (enter the difference)', a: dv, k: 'set_crossDiff', skill: 'comparison' }; }
  function _setCrossRatio(d) { var a = d.series[0], b = d.series[1] || d.series[0], order = _shuffle(d.labels.map(function (_, i) { return i; })); for (var t = 0; t < order.length; t++) { var i = order[t]; if (!b.values[i]) continue; var g = _gcd(a.values[i], b.values[i]); if (a.values[i] / g <= 20 && b.values[i] / g <= 20) return { q: 'For ' + d.labels[i] + ', the ratio of ' + a.name + ' to ' + b.name + ' in simplest form is a:b. Enter a.', a: a.values[i] / g, k: 'set_ratio', skill: 'ratio' }; } return null; }
  function _setSeriesShare(d) { var a = d.series[0], order = _shuffle(d.labels.map(function (_, i) { return i; })); for (var t = 0; t < order.length; t++) { var i = order[t], tot = 0; for (var s = 0; s < d.series.length; s++) tot += d.series[s].values[i]; if (!tot) continue; var sh = a.values[i] / tot * 100; if (_isClean(sh)) return { q: 'For ' + d.labels[i] + ', ' + a.name + ' is what percent of the combined total of all series there? (1 decimal)', a: _round1(sh), k: 'set_share', skill: 'contribution' }; } return null; }
  function _setGrand(d) { var g = 0; for (var s = 0; s < d.series.length; s++) g += _sum(d.series[s].values); return { q: 'What is the grand total of ' + d.metric + ' across every series and every entry shown?', a: g, k: 'set_grand', skill: 'inference' }; }

  var MULTI_POOL = { easy: [_setReadS0, _setMaxS1], medium: [_setTotalS0, _setCrossDiff], hard: [_setCrossRatio, _setSeriesShare, _setGrand] };

  function _multiSet(category, count) {
    var dsFn = category === 'di-line' ? DI._datasets.timeMulti : DI._datasets.entityMulti;
    var chartFn = category === 'di-line' ? DI._charts.line : DI._charts.bar;
    for (var attempt = 0; attempt < 30; attempt++) {
      var d = dsFn(_pick([2, 2, 3]));
      var diffs = _progDiffs(count), qs = [], usedSkill = {}, ok = true;
      for (var s = 0; s < count; s++) {
        var pool = _shuffle(MULTI_POOL[diffs[s]]), made = null;
        for (var pi = 0; pi < pool.length; pi++) { var c = pool[pi](d); if (c && !usedSkill[c.skill]) { made = c; break; } }
        if (!made) { ok = false; break; }
        usedSkill[made.skill] = 1;
        qs.push({ question: made.q, answer: made.a, subtype: diffs[s] + ':' + made.k, skill: made.skill, difficulty: diffs[s] });
      }
      if (ok && qs.length === count) {
        if (category === 'di-bar' && Math.random() < 0.35) d._stacked = true;
        return { category: category, chart: chartFn(d), context: null, dataset: d, questions: qs, meta: { count: count, kind: category === 'di-line' ? 'multi-line' : (d._stacked ? 'stacked-bar' : 'grouped-bar') } };
      }
    }
    return null;
  }

  /* ════════════════ SINGLE-SERIES sets (pie / table) — reuse di-engine's read-only archetypes on a fixed dataset ════════════════ */
  function _singleSet(category, chartFn, count) {
    var ARCH = DI._arch.entity;   /* {easy:[{k,skill,build}], medium:[...], hard:[...]} — build() is non-mutating */
    for (var attempt = 0; attempt < 30; attempt++) {
      var d = DI._datasets.entity();
      var diffs = _progDiffs(count), qs = [], usedSkill = {}, ok = true;
      for (var s = 0; s < count; s++) {
        var pool = _shuffle(ARCH[diffs[s]]), made = null;
        for (var pi = 0; pi < pool.length; pi++) { if (usedSkill[pool[pi].skill]) continue; var built = pool[pi].build(d); if (built) { made = { built: built, skill: pool[pi].skill }; break; } }
        if (!made) { ok = false; break; }
        usedSkill[made.skill] = 1;
        qs.push({ question: made.built.q, answer: made.built.a, subtype: diffs[s] + ':' + made.built.k, skill: made.skill, difficulty: diffs[s] });
      }
      if (ok && qs.length === count) return { category: category, chart: chartFn(d), context: null, dataset: d, questions: qs, meta: { count: count, kind: category === 'di-pie' ? 'pie' : 'table' } };
    }
    return null;
  }

  /* ════════════════ CASELET sets (shared worded context, progressive sub-questions) ════════════════ */
  function _caseletSet(count) {
    for (var attempt = 0; attempt < 40; attempt++) {
      var ctx = _pick([
        { whole: 'people surveyed', g1: 'men', g2: 'women', act: 'preferred online shopping' },
        { whole: 'students in a class', g1: 'boys', g2: 'girls', act: 'passed the exam' },
        { whole: 'employees in a firm', g1: 'managers', g2: 'staff', act: 'opted for the new policy' },
        { whole: 'commuters polled', g1: 'car users', g2: 'bus users', act: 'support the new metro line' },
        { whole: 'loan applicants', g1: 'salaried applicants', g2: 'self-employed applicants', act: 'were approved' },
        { whole: 'account holders', g1: 'savings-account holders', g2: 'current-account holders', act: 'use mobile banking' },
        { whole: 'candidates who appeared', g1: 'male candidates', g2: 'female candidates', act: 'cleared the cut-off' },
        { whole: 'registered voters', g1: 'first-time voters', g2: 'repeat voters', act: 'cast their vote' },
        { whole: 'policyholders', g1: 'term-plan holders', g2: 'endowment-plan holders', act: 'renewed their policy' },
        { whole: 'households surveyed', g1: 'urban households', g2: 'rural households', act: 'own a smartphone' }
      ]);
      var total = _ri(4, 12) * 100, g1 = Math.round(total * _pick([0.4, 0.45, 0.5, 0.55, 0.6])), g2 = total - g1;
      var p1 = _pick([20, 25, 40, 50, 60, 75]), p2 = _pick([20, 25, 40, 50, 60, 75]);
      var a1 = g1 * p1 / 100, a2 = g2 * p2 / 100, done = a1 + a2;
      var sh = done ? a1 / done * 100 : 0;
      if (!_isClean(a1) || !_isClean(a2) || !_isClean(sh)) continue;
      var context = 'Out of ' + total + ' ' + ctx.whole + ', ' + g1 + ' are ' + ctx.g1 + ' and ' + g2 + ' are ' + ctx.g2
        + '. ' + p1 + '% of the ' + ctx.g1 + ' and ' + p2 + '% of the ' + ctx.g2 + ' ' + ctx.act + '.';
      var bank = [
        { difficulty: 'easy', skill: 'observation', k: 'set_caseRead', q: 'How many ' + ctx.g1 + ' ' + ctx.act + '?', a: a1 },
        { difficulty: 'medium', skill: 'aggregation', k: 'set_caseTotal', q: 'In total, how many people ' + ctx.act + '?', a: done },
        { difficulty: 'medium', skill: 'inference', k: 'set_caseMissing', q: 'Given that ' + done + ' people in all ' + ctx.act + ', how many of them are ' + ctx.g2 + '?', a: a2 },
        { difficulty: 'hard', skill: 'contribution', k: 'set_caseShare', q: 'Of all the people who ' + ctx.act + ', what percent are ' + ctx.g1 + '? (to 1 decimal place)', a: _round1(sh) }
      ];
      var qs = bank.slice(0, Math.min(count, bank.length)).map(function (b) { return { question: b.q, answer: b.a, subtype: b.difficulty + ':' + b.k, skill: b.skill, difficulty: b.difficulty }; });
      return { category: 'di-caselet', chart: null, context: context, dataset: { total: total, g1: g1, g2: g2, p1: p1, p2: p2 }, questions: qs, meta: { count: qs.length, kind: 'caselet' } };
    }
    return null;
  }

  /* Public: generate ONE DI set for a category. count defaults to 4–5; clamped to 3–6. */
  function generateSet(category, opts) {
    opts = opts || {};
    var count = opts.count || _ri(4, 5); if (count < 3) count = 3; if (count > 6) count = 6;
    var set = null;
    if (category === 'di-bar' || category === 'di-line') set = _multiSet(category, count);
    else if (category === 'di-pie') set = _singleSet('di-pie', DI._charts.pie, count);
    else if (category === 'di-table') set = _singleSet('di-table', DI._charts.table, count);
    else if (category === 'di-caselet') set = _caseletSet(count);
    else set = _multiSet('di-bar', count);
    /* guaranteed non-null: fall back to a smaller single-series table set, then a trivial 3-Q set. */
    if (!set) set = _singleSet('di-table', DI._charts.table, 3) || _caseletSet(3);
    return set;
  }

  var DISetEngine = { generateSet: generateSet, categories: function () { return ['di-bar', 'di-line', 'di-pie', 'di-table', 'di-caselet']; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = DISetEngine;
  if (typeof window !== 'undefined') window.DISetEngine = DISetEngine;
  else root.DISetEngine = DISetEngine;
})(this);
