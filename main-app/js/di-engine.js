/**
 * di-engine.js — the Data Interpretation generator (ADR-074; difficulty/diversity overhaul ADR-078; i18n F-M5).
 *
 * QuantReflex's moat is a GENERATIVE speed engine. DI fits it: synthesize a small dataset, render it as a chart/table,
 * and ask a calculation about it. This module is the DI analogue of questions.js's numeric generators — it produces
 * questions in the EXACT shape the drill engine already consumes, plus the chart field:
 *
 *   { question, answer (NUMERIC), category ('di-bar'|'di-line'|'di-pie'|'di-table'|'di-caselet'),
 *     chart (a spec di-charts.js renders, or null for caselets), subtype ('<difficulty>:<archetypeKey>') }
 *
 * DIFFICULTY IS EARNED, NOT ASSIGNED (ADR-078). Every archetype declares a tier whose label reflects its real
 * reasoning cost (steps · cross-series · %/ratio reasoning). The engine picks an archetype IN the requested tier and
 * builds a dataset for which the answer is clean (integer or one decimal). If a random build can't be made clean it
 * retries WITHIN THE SAME TIER; a tier's "primary" archetype constructs clean data by design, so a hard question is
 * NEVER silently downgraded to an easy read (the old fallback bug). Answers stay clean so the numpad grades fairly.
 *
 * i18n (ADR-111 F-M5): the engine owns ALL RNG + math (dataset numbers, answers, chart NUMBERS); every user-visible
 * STRING (theme vocabulary, ~35 stem phrasers, chart titles/axes, lead-ins, caselet contexts) lives in the per-language
 * pack locales/gen/<lang>.di.js. `_pack()` returns the ACTIVE study-language pack (guarded default 'en') so a question
 * generates directly in the study language; for a fixed RNG seed the dataset/answer/chart-numbers are IDENTICAL in
 * every language and only wording differs (proven by scripts/di-census.js EN byte-identity + gen-i18n.check invariance).
 *
 * MULTI-SERIES (ADR-078): hard bar/line/table questions may use cross-series data (grouped/stacked bars, multi-line,
 * multi-column tables) rendered by di-charts.js's series model.
 *
 * Self-registers into questions.js's global `categoryGenerators`. PURE + dual-exported so di-engine.check validates it.
 */
(function (root) {
  'use strict';

  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('./gen-i18n.js') : null);
  /* EN pack is a hard dependency so EN generation always works (node tests + pre-load browser); hi/mr load lazily. */
  var _EN = null;
  try { if (typeof require !== 'undefined') _EN = require('../locales/gen/en.di.js'); } catch (_) {}
  /* Active study-language DI pack (theme pools + stem/chart phrasers). Resolved live so language switches take effect
     and the check can force a language via QRI18n before generate(). */
  function _pack() { var p = (GI && GI.diPack) ? GI.diPack() : null; return p || _EN || (GI && GI.diPack && GI.diPack('en')) || null; }

  /* ── tiny pure helpers ── */
  function _ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _vidx(n) { return Math.floor(Math.random() * n); }   // same draw as _pick over an n-length array
  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _pickN(a, n) { return _shuffle(a).slice(0, n); }
  function _sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function _max(a) { return Math.max.apply(null, a); }
  function _min(a) { return Math.min.apply(null, a); }
  function _round1(x) { return Math.round(x * 10) / 10; }
  function _isClean(x) { return isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
  function _gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

  /* Current difficulty: reuse the Quant engine's resolver so DI honors the user's setting + adaptive bias. */
  function _difficulty(explicit) {
    if (explicit) return explicit;
    try { if (typeof _getDifficulty === 'function') return _getDifficulty(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window._getDifficulty === 'function') return window._getDifficulty(); } catch (_) {}
    return 'medium';
  }

  /* Varied (NOT all-multiples-of-10) integers — realistic data. step lets a builder bias toward clean derived values. */
  function _values(n, min, max, step) { step = step || 1; var lo = Math.ceil(min / step), hi = Math.floor(max / step), out = []; for (var i = 0; i < n; i++) out.push(_ri(lo, hi) * step); return out; }

  /* ── datasets ── (theme picked by INDEX into the active pack; numeric `range`/counts identical across languages) */
  function _entityDataset() {
    var TH = _pack().entityThemes, th = TH[_vidx(TH.length)], n = _ri(4, 5), r = th.range || [35, 240, 0];
    var items = _pickN(th.items, n).map(function (x) { return th.pre + x; });
    return { theme: th, labels: items, values: _values(n, r[0], r[1], r[2] || _pick([1, 1, 5])), unit: th.unit, metric: th.metric, entity: th.entity };
  }
  function _timeDataset() {
    var TM = _pack().timeThemes, tm = TM[_vidx(TM.length)], start = _pick([2017, 2018, 2019, 2020]), n = _ri(5, 6);
    var labels = []; for (var i = 0; i < n; i++) labels.push(String(start + i));
    var r = tm.range, lo = r ? r[0] : 60, hi = r ? r[1] : 160, sp = hi - lo;
    var v = [_ri(lo, hi)]; for (var j = 1; j < n; j++) { var step = _ri(-Math.round(sp * 0.28), Math.round(sp * 0.4)); v.push(Math.max(10, v[j - 1] + step)); }
    var SUB = _pack().subjects, subject = SUB[_vidx(SUB.length)];
    return { theme: tm, labels: labels, values: v, unit: tm.unit, metric: tm.metric, subject: subject };
  }
  function _entityMultiDataset(nSeries) {
    var TH = _pack().entityThemes, th = TH[_vidx(TH.length)], n = _ri(3, 4), names = th.series.slice(0, nSeries || 2), r = th.range || [40, 200, 0];
    var items = _pickN(th.items, n).map(function (x) { return th.pre + x; });
    var series = names.map(function (nm) { return { name: nm, values: _values(n, r[0], r[1], r[2] || _pick([1, 5])) }; });
    return { theme: th, labels: items, series: series, unit: th.unit, metric: th.metric, entity: th.entity };
  }
  function _timeMultiDataset(nSeries) {
    var TM = _pack().timeThemes, tm = TM[_vidx(TM.length)], start = _pick([2019, 2020, 2021]), n = _ri(4, 5), names = tm.series.slice(0, nSeries || 2);
    var labels = []; for (var i = 0; i < n; i++) labels.push(String(start + i));
    var r = tm.range, lo = r ? r[0] : 50, hi = r ? r[1] : 140, sp = hi - lo;
    var series = names.map(function (nm) { var v = [_ri(lo, hi)]; for (var j = 1; j < n; j++) v.push(Math.max(10, v[j - 1] + _ri(-Math.round(sp * 0.25), Math.round(sp * 0.36)))); return { name: nm, values: v }; });
    return { theme: tm, labels: labels, series: series, unit: tm.unit, metric: tm.metric };
  }

  function _cleanPctPair() { var old = _pick([200, 240, 280, 300, 320, 360, 400, 440, 500]); var p = _pick([5, 10, 15, 20, 25, 30, 40, 50]); return { old: old, nw: old + old * p / 100, p: p }; }

  /* ════════════════════════ SINGLE-SERIES archetypes (entity: bar/pie/table) ════════════════════════
     Each build computes the math (indices, answer) and delegates the stem to the active pack's ENTITY phraser. */
  var ENTITY_ARCH = {
    easy: [
      { k: 'read', skill: 'observation', build: function (d) { var i = _ri(0, d.labels.length - 1); return { q: _pack().entityStem.read(d, { i: i }), a: d.values[i], k: 'read' }; } },
      { k: 'max', skill: 'observation', build: function (d) { return { q: _pack().entityStem.max(d), a: _max(d.values), k: 'max' }; } },
      { k: 'min', skill: 'observation', build: function (d) { return { q: _pack().entityStem.min(d), a: _min(d.values), k: 'min' }; } },
      { k: 'rank', skill: 'comparison', build: function (d) { if (d.values.length < 3) return null; var srt = d.values.slice().sort(function (a, b) { return b - a; }); var r = _pick([2, 3]); return { q: _pack().entityStem.rank(d, { r: r }), a: srt[r - 1], k: 'rank' }; } }
    ],
    medium: [
      { k: 'total', skill: 'aggregation', build: function (d) { var vi = _vidx(_pack().stemVariety.total); return { q: _pack().entityStem.total(d, { vi: vi }), a: _sum(d.values), k: 'total' }; } },
      { k: 'diff', skill: 'comparison', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1 + _ri(0, d.labels.length - 2)) % d.labels.length; var dv = Math.abs(d.values[i] - d.values[j]); if (!dv) return null; return { q: _pack().entityStem.diff(d, { i: i, j: j }), a: dv, k: 'diff' }; } },
      { k: 'avg', skill: 'average', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; var vi = _vidx(_pack().stemVariety.avg); return { q: _pack().entityStem.avg(d, { vi: vi }), a: _round1(av), k: 'avg' }; } },
      { k: 'share', skill: 'percentage', build: function (d) { var i = _ri(0, d.labels.length - 1), sh = d.values[i] / _sum(d.values) * 100; if (!_isClean(sh)) return null; return { q: _pack().entityStem.share(d, { i: i }), a: _round1(sh), k: 'share' }; } },
      { k: 'missing', skill: 'inference', build: function (d) { var i = _ri(0, d.labels.length - 1); return { q: _pack().entityStem.missing(d, { i: i, total: _sum(d.values) }), a: d.values[i], k: 'missing' }; } }
    ],
    hard: [
      { k: 'pctMore', skill: 'percentage', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; if (!d.values[j]) return null; var pm = (d.values[i] - d.values[j]) / d.values[j] * 100; if (!_isClean(pm) || !pm) return null; return { q: _pack().entityStem.pctMore(d, { i: i, j: j }), a: _round1(Math.abs(pm)), k: 'pctMore' }; } },
      { k: 'deviation', skill: 'percentage', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; var i = _ri(0, d.labels.length - 1), dev = (d.values[i] - av) / av * 100; if (!_isClean(dev) || !dev) return null; return { q: _pack().entityStem.deviation(d, { i: i }), a: _round1(Math.abs(dev)), k: 'deviation' }; } },
      { k: 'combinedShare', skill: 'contribution', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length, cs = (d.values[i] + d.values[j]) / _sum(d.values) * 100; if (!_isClean(cs)) return null; return { q: _pack().entityStem.combinedShare(d, { i: i, j: j }), a: _round1(cs), k: 'combinedShare' }; } },
      { k: 'ratio', skill: 'ratio', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; if (!d.values[j]) return null; var g = _gcd(d.values[i], d.values[j]); var r = d.values[i] / d.values[j]; if (!_isClean(r)) { if ((d.values[i] / g) > 30 || (d.values[j] / g) > 30) return null; return { q: _pack().entityStem.ratioSimplest(d, { i: i, j: j }), a: d.values[i] / g, k: 'ratio' }; } return { q: _pack().entityStem.ratioTimes(d, { i: i, j: j }), a: _round1(r), k: 'ratio' }; } }
    ]
  };
  var ENTITY_PRIMARY = {
    easy: function (d) { var i = _ri(0, d.labels.length - 1); return { q: _pack().entityStem.read(d, { i: i }), a: d.values[i], k: 'read' }; },
    medium: function (d) { var vi = _vidx(_pack().stemVariety.total); return { q: _pack().entityStem.total(d, { vi: vi }), a: _sum(d.values), k: 'total' }; },
    hard: function (d) { var pr = _cleanPctPair(), i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; d.values[i] = pr.nw; d.values[j] = pr.old; return { q: _pack().entityStem.pctMorePrimary(d, { i: i, j: j }), a: _round1(pr.p), k: 'pctMore' }; }
  };

  /* ════════════════════════ TIME archetypes (line) ════════════════════════ */
  var TIME_ARCH = {
    easy: [
      { k: 'read', skill: 'observation', build: function (d) { var i = _ri(0, d.labels.length - 1); return { q: _pack().timeStem.read(d, { i: i }), a: d.values[i], k: 'read' }; } },
      { k: 'peak', skill: 'observation', build: function (d) { return { q: _pack().timeStem.peak(d), a: _max(d.values), k: 'peak' }; } },
      { k: 'trough', skill: 'observation', build: function (d) { return { q: _pack().timeStem.trough(d), a: _min(d.values), k: 'trough' }; } }
    ],
    medium: [
      { k: 'total', skill: 'aggregation', build: function (d) { return { q: _pack().timeStem.total(d), a: _sum(d.values), k: 'total' }; } },
      { k: 'diff', skill: 'comparison', build: function (d) { var i = _ri(1, d.labels.length - 1); return { q: _pack().timeStem.diff(d, { i: i }), a: Math.abs(d.values[i] - d.values[i - 1]), k: 'diff' }; } },
      { k: 'avg', skill: 'average', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; return { q: _pack().timeStem.avg(d), a: _round1(av), k: 'avg' }; } },
      { k: 'biggestJump', skill: 'comparison', build: function (d) { var best = 0; for (var z = 1; z < d.values.length; z++) best = Math.max(best, Math.abs(d.values[z] - d.values[z - 1])); return { q: _pack().timeStem.biggestJump(d), a: best, k: 'biggestJump' }; } }
    ],
    hard: [
      { k: 'yoy', skill: 'percentage', build: function (d) { var y = _ri(1, d.labels.length - 1); if (!d.values[y - 1]) return null; var ch = (d.values[y] - d.values[y - 1]) / d.values[y - 1] * 100; if (!_isClean(ch)) return null; return { q: _pack().timeStem.yoy(d, { y: y }), a: _round1(Math.abs(ch)), k: 'yoy' }; } },
      { k: 'cumulativeShare', skill: 'contribution', build: function (d) { var half = Math.floor(d.labels.length / 2), cs = _sum(d.values.slice(0, half)) / _sum(d.values) * 100; if (!_isClean(cs)) return null; return { q: _pack().timeStem.cumulativeShare(d, { half: half }), a: _round1(cs), k: 'cumulativeShare' }; } },
      { k: 'overallGrowth', skill: 'percentage', build: function (d) { if (!d.values[0]) return null; var g = (d.values[d.values.length - 1] - d.values[0]) / d.values[0] * 100; if (!_isClean(g)) return null; return { q: _pack().timeStem.overallGrowth(d), a: _round1(Math.abs(g)), k: 'overallGrowth' }; } }
    ]
  };
  var TIME_PRIMARY = {
    easy: function (d) { var i = _ri(0, d.labels.length - 1); return { q: _pack().timeStem.read(d, { i: i }), a: d.values[i], k: 'read' }; },
    medium: function (d) { return { q: _pack().timeStem.total(d), a: _sum(d.values), k: 'total' }; },
    hard: function (d) { var pr = _cleanPctPair(), y = _ri(1, d.labels.length - 1); d.values[y - 1] = pr.old; d.values[y] = pr.nw; return { q: _pack().timeStem.yoy(d, { y: y }), a: _round1(pr.p), k: 'yoy' }; }
  };

  /* ════════════════════════ MULTI-SERIES archetypes ════════════════════════ */
  function _multiQuestion(d) {
    var L = d.labels, S = d.series, n = L.length, a = S[0], b = S[1] || S[0], P = _pack();
    var t = _pick(['pctDiff', 'ratioYear', 'seriesShare', 'combinedShare', 'trendCompare']);
    if (t === 'pctDiff') { var yi = _ri(0, n - 1); if (!b.values[yi] || a.values[yi] === b.values[yi]) return null; var pd = (a.values[yi] - b.values[yi]) / b.values[yi] * 100; if (!_isClean(pd)) return null; return { q: P.multiStem.m_pctDiff(d, { yi: yi, aName: a.name, bName: b.name }), a: _round1(Math.abs(pd)), k: 'm_pctDiff', skill: 'percentage' }; }
    if (t === 'ratioYear') { var yk = _ri(0, n - 1); if (!b.values[yk]) return null; var g = _gcd(a.values[yk], b.values[yk]); if ((a.values[yk] / g) > 30 || (b.values[yk] / g) > 30) return null; return { q: P.multiStem.m_ratioYear(d, { yi: yk, aName: a.name, bName: b.name }), a: a.values[yk] / g, k: 'm_ratioYear', skill: 'ratio' }; }
    if (t === 'seriesShare') { var yl = _ri(0, n - 1), tot = 0; for (var i = 0; i < S.length; i++) tot += S[i].values[yl]; if (!tot) return null; var sh = a.values[yl] / tot * 100; if (!_isClean(sh)) return null; return { q: P.multiStem.m_seriesShare(d, { yi: yl, aName: a.name }), a: _round1(sh), k: 'm_seriesShare', skill: 'contribution' }; }
    if (t === 'combinedShare') { var ym = _ri(0, n - 1), grand = 0; for (var s = 0; s < S.length; s++) for (var e = 0; e < n; e++) grand += S[s].values[e]; if (!grand) return null; var pair = a.values[ym] + b.values[ym], cs = pair / grand * 100; if (!_isClean(cs)) return null; return { q: P.multiStem.m_combinedShare(d, { yi: ym, aName: a.name, bName: b.name }), a: _round1(cs), k: 'm_combinedShare', skill: 'contribution' }; }
    var d1 = a.values[n - 1] - a.values[0], d2 = b.values[n - 1] - b.values[0];
    return { q: P.multiStem.m_trendCompare(d, { aName: a.name, bName: b.name }), a: Math.abs(Math.abs(d1) - Math.abs(d2)), k: 'm_trendCompare', skill: 'trend' };
  }

  /* ── chart spec builders (consumed by di-charts.js); NUMBERS from the dataset, TEXT from the active pack ── */
  function _barChart(d) { var C = _pack().chart; return d.series ? { kind: 'bar', title: C.barTitle(d), unit: d.unit, yLabel: C.yLabel(d), labels: d.labels.slice(), series: d.series.map(function (s) { return { name: s.name, values: s.values.slice() }; }), stacked: !!d._stacked } : { kind: 'bar', title: C.barTitle(d), unit: d.unit, yLabel: C.yLabel(d), labels: d.labels.slice(), values: d.values.slice(), horizontal: Math.random() < 0.4 }; }
  function _pieChart(d) { var C = _pack().chart; return { kind: 'pie', title: C.pieTitle(d), unit: d.unit, labels: d.labels.slice(), values: d.values.slice() }; }
  function _lineChart(d) { var C = _pack().chart; return d.series ? { kind: 'line', title: C.lineTitle(d), unit: d.unit, xLabel: C.xYear(), yLabel: C.yLabel(d), labels: d.labels.slice(), series: d.series.map(function (s) { return { name: s.name, values: s.values.slice() }; }) } : { kind: 'line', title: C.lineTitleSubject(d), unit: d.unit, xLabel: C.xYear(), yLabel: C.yLabel(d), labels: d.labels.slice(), values: d.values.slice() }; }
  function _tableChart(d) {
    var C = _pack().chart;
    if (d.series) { var cols = [d.entity].concat(d.series.map(function (s) { return C.seriesCol(d, s.name); })); var rows = d.labels.map(function (l, i) { return [l].concat(d.series.map(function (s) { return String(s.values[i]); })); }); return { kind: 'table', title: C.tableTitle(d), columns: cols, rows: rows }; }
    return { kind: 'table', title: C.tableTitle(d), columns: [d.entity, C.metricCol(d)], rows: d.labels.map(function (l, i) { return [l, String(d.values[i])]; }) };
  }

  /* ── CASELET: worded datasets (Banking favourite) — single & two-step, plus a missing-data variant ── */
  function _caselet(diff) {
    var CTX = _pack().caseletCtx, ctx = CTX[_vidx(CTX.length)], CS = _pack().caseStem;
    var totalPeople = _ri(4, 12) * 100;
    var g1 = Math.round(totalPeople * _pick([0.4, 0.45, 0.5, 0.55, 0.6])), g2 = totalPeople - g1;
    var p1 = _pick([20, 25, 40, 50, 60, 75]), p2 = _pick([20, 25, 40, 50, 60, 75]);
    var a1 = g1 * p1 / 100, a2 = g2 * p2 / 100;
    if (!_isClean(a1) || !_isClean(a2)) return null;
    var stem = CS.stem(ctx, { total: totalPeople, g1: g1, g2: g2, p1: p1, p2: p2 });
    if (diff === 'easy') return { q: stem + CS.caseRead(ctx), a: a1, k: 'caseRead', skill: 'observation' };
    if (diff === 'medium') { var t = _pick(['total', 'missing']); if (t === 'total') return { q: stem + CS.caseTotal(ctx), a: a1 + a2, k: 'caseTotal', skill: 'aggregation' }; return { q: stem + CS.caseMissing(ctx, { sum: a1 + a2, a1: a1 }), a: a2, k: 'caseMissing', skill: 'inference' }; }
    var tot = a1 + a2; if (!tot) return null; var sh = a1 / tot * 100; if (!_isClean(sh)) return null; return { q: stem + CS.caseShare(ctx), a: _round1(sh), k: 'caseShare', skill: 'contribution' };
  }

  function _lead(noun, q) { return _pack().lead(noun, q, Math.random()); }

  /* ── the per-category generators: pick an in-tier archetype, build a clean question, attach chart ── */
  function _genFromArch(category, chartFn, diff, ds, arch, primary) {
    var noun = category === 'di-table' ? 'table' : 'chart';
    for (var attempt = 0; attempt < 60; attempt++) {
      var d = ds();
      var a = arch[diff][_ri(0, arch[diff].length - 1)];
      var qa = a.build(d);
      if (qa) return { question: _lead(noun, qa.q), answer: qa.a, category: category, chart: chartFn(d), subtype: diff + ':' + qa.k };
    }
    var d2 = ds(), qa2 = primary[diff](d2);   /* guaranteed clean, in-tier — never a downgrade */
    return { question: _lead(noun, qa2.q), answer: qa2.a, category: category, chart: chartFn(d2), subtype: diff + ':' + qa2.k };
  }

  function _genEntity(category, chartFn, diff) {
    if (diff === 'hard' && (category === 'di-bar' || category === 'di-table') && Math.random() < 0.5) {
      for (var attempt = 0; attempt < 40; attempt++) {
        var dm = _entityMultiDataset(_pick([2, 2, 3]));
        if (category === 'di-bar' && Math.random() < 0.4) dm._stacked = true;
        var qa = _multiQuestion(dm);
        if (qa) return { question: _lead(category === 'di-table' ? 'table' : 'chart', qa.q), answer: qa.a, category: category, chart: chartFn(dm), subtype: 'hard:' + qa.k };
      }
    }
    return _genFromArch(category, chartFn, diff, _entityDataset, ENTITY_ARCH, ENTITY_PRIMARY);
  }
  function _genLine(diff) {
    if (diff === 'hard' && Math.random() < 0.5) {
      for (var attempt = 0; attempt < 40; attempt++) {
        var dm = _timeMultiDataset(2);
        var qa = _multiQuestion(dm);
        if (qa) return { question: _lead('graph', qa.q), answer: qa.a, category: 'di-line', chart: _lineChart(dm), subtype: 'hard:' + qa.k };
      }
    }
    return _genFromArch('di-line', _lineChart, diff, _timeDataset, TIME_ARCH, TIME_PRIMARY);
  }
  function _genCaselet(diff) {
    for (var attempt = 0; attempt < 60; attempt++) { var qa = _caselet(diff); if (qa) return { question: qa.q, answer: qa.a, category: 'di-caselet', subtype: diff + ':' + qa.k }; }
    var qa2 = _caselet('easy') || (function () { var fq = _pack().caseStem.fallbackQ; return { q: fq, a: 240, k: 'caseRead' }; })();
    return { question: qa2.q, answer: qa2.a, category: 'di-caselet', subtype: diff + ':' + qa2.k };
  }

  /* Public: generate ONE DI question for a category (difficulty optional → reads the user's setting). */
  function generate(category, difficulty) {
    var diff = _difficulty(difficulty);
    if (diff !== 'easy' && diff !== 'medium' && diff !== 'hard') diff = 'medium';
    switch (category) {
      case 'di-bar': return _genEntity('di-bar', _barChart, diff);
      case 'di-pie': return _genEntity('di-pie', _pieChart, diff);
      case 'di-table': return _genEntity('di-table', _tableChart, diff);
      case 'di-line': return _genLine(diff);
      case 'di-caselet': return _genCaselet(diff);
      default: return _genEntity('di-bar', _barChart, diff);
    }
  }

  var CATEGORY_LABELS = { 'di-table': 'Data Tables', 'di-bar': 'Bar Graphs', 'di-line': 'Line Graphs', 'di-pie': 'Pie Charts', 'di-caselet': 'Caselets' };

  var generators = {};
  Object.keys(CATEGORY_LABELS).forEach(function (cat) { generators[cat] = function () { return generate(cat); }; });

  function registerInto(map) { if (!map) return; Object.keys(generators).forEach(function (k) { map[k] = generators[k]; }); }
  try { if (typeof categoryGenerators !== 'undefined' && categoryGenerators) registerInto(categoryGenerators); } catch (_) {}

  var DIEngine = {
    CATEGORY_LABELS: CATEGORY_LABELS,
    categories: function () { return Object.keys(CATEGORY_LABELS); },
    label: function (c) { return CATEGORY_LABELS[c] || c; },
    generate: generate,
    generators: generators,
    registerInto: registerInto,
    /* exposed for the sets engine + tests (ADR-078) */
    _datasets: { entity: _entityDataset, time: _timeDataset, entityMulti: _entityMultiDataset, timeMulti: _timeMultiDataset },
    _charts: { bar: _barChart, pie: _pieChart, line: _lineChart, table: _tableChart },
    _arch: { entity: ENTITY_ARCH, time: TIME_ARCH, entityPrimary: ENTITY_PRIMARY, timePrimary: TIME_PRIMARY, multi: _multiQuestion, caselet: _caselet }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DIEngine;
  if (typeof window !== 'undefined') window.DIEngine = DIEngine;
  else root.DIEngine = DIEngine;
})(this);
