/**
 * di-engine.js — the Data Interpretation generator (ADR-074; difficulty/diversity overhaul ADR-078).
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
 * MULTI-SERIES (ADR-078): hard bar/line/table questions may use cross-series data (grouped/stacked bars, multi-line,
 * multi-column tables) rendered by di-charts.js's series model — the authentic "compare A vs B across years" exam DI.
 *
 * Self-registers into questions.js's global `categoryGenerators` (same pipeline as Quant); deliberately NOT in the
 * random `generators` pool and never require()'d server-side (DI stays out of duels). PURE + dual-exported so
 * scripts/di-engine.check.js validates it under node.
 */
(function (root) {
  'use strict';

  /* ── tiny pure helpers ── */
  function _ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _pickN(a, n) { return _shuffle(a).slice(0, n); }
  function _sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function _max(a) { return Math.max.apply(null, a); }
  function _min(a) { return Math.min.apply(null, a); }
  function _round1(x) { return Math.round(x * 10) / 10; }
  /* "clean" = integer or terminates at one decimal place — the student's natural answer is exact. */
  function _isClean(x) { return isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
  function _gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

  /* Current difficulty: reuse the Quant engine's resolver so DI honors the user's setting + adaptive bias. */
  function _difficulty(explicit) {
    if (explicit) return explicit;
    try { if (typeof _getDifficulty === 'function') return _getDifficulty(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window._getDifficulty === 'function') return window._getDifficulty(); } catch (_) {}
    return 'medium';
  }

  /* ── realistic, exam-flavoured themes (CAT / Banking / SSC DI vocabulary) ── */
  var ENTITY_THEMES = [
    { entity: 'Company', items: ['A', 'B', 'C', 'D', 'E', 'F'], pre: 'Company ', metric: 'Sales', unit: '₹ crore', series: ['2022', '2023', '2024'] },
    { entity: 'Branch', items: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur'], pre: '', metric: 'Loans Disbursed', unit: '₹ lakh', series: ['2023', '2024'] },
    { entity: 'Product', items: ['P', 'Q', 'R', 'S', 'T', 'U'], pre: 'Product ', metric: 'Units Sold', unit: "'000 units", series: ['Online', 'Retail'] },
    { entity: 'School', items: ['Rosewood', 'Hilltop', 'Greenfield', 'Lakeside', 'Oakridge', 'Sunrise'], pre: '', metric: 'Students Enrolled', unit: '', series: ['Boys', 'Girls'] },
    { entity: 'Department', items: ['HR', 'Sales', 'IT', 'Finance', 'Ops', 'Legal'], pre: '', metric: 'Employees', unit: '', series: ['2023', '2024'] },
    { entity: 'City', items: ['Indore', 'Surat', 'Nagpur', 'Kochi', 'Patna', 'Bhopal'], pre: '', metric: 'Tickets Booked', unit: '', series: ['Q1', 'Q2'] },
    { entity: 'Store', items: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot'], pre: '', metric: 'Revenue', unit: '₹ lakh', series: ['2023', '2024'] }
  ];
  var TIME_THEMES = [
    { metric: 'Revenue', unit: '₹ crore', series: ['Plant X', 'Plant Y'] },
    { metric: 'Production', unit: "'000 units", series: ['Unit A', 'Unit B'] },
    { metric: 'Profit', unit: '₹ lakh', series: ['Division 1', 'Division 2'] },
    { metric: 'Website Visitors', unit: "'000", series: ['Mobile', 'Desktop'] },
    { metric: 'Exports', unit: '₹ crore', series: ['Region East', 'Region West'] }
  ];

  /* Varied (NOT all-multiples-of-10) integers — realistic data. step lets a builder bias toward clean derived values. */
  function _values(n, min, max, step) { step = step || 1; var lo = Math.ceil(min / step), hi = Math.floor(max / step), out = []; for (var i = 0; i < n; i++) out.push(_ri(lo, hi) * step); return out; }
  function _metricUnit(d) { return d.metric + (d.unit ? ' (in ' + d.unit + ')' : ''); }

  /* ── datasets ── */
  function _entityDataset() {
    var th = _pick(ENTITY_THEMES), n = _ri(4, 5);
    var items = _pickN(th.items, n).map(function (x) { return th.pre + x; });
    return { theme: th, labels: items, values: _values(n, 35, 240, _pick([1, 1, 5])), unit: th.unit, metric: th.metric, entity: th.entity };
  }
  /* a time series with bounded year-on-year continuity → looks like a real trend, not a random walk. */
  function _timeDataset() {
    var tm = _pick(TIME_THEMES), start = _pick([2017, 2018, 2019, 2020]), n = _ri(5, 6);
    var labels = []; for (var i = 0; i < n; i++) labels.push(String(start + i));
    var v = [_ri(60, 160)]; for (var j = 1; j < n; j++) { var step = _ri(-30, 45); v.push(Math.max(20, v[j - 1] + step)); }
    var subject = _pick(['Company XYZ', 'the firm', 'the plant', 'the portal', 'the brand']);
    return { theme: tm, labels: labels, values: v, unit: tm.unit, metric: tm.metric, subject: subject };
  }
  /* multi-series entity dataset (grouped/stacked bar, multi-column table). */
  function _entityMultiDataset(nSeries) {
    var th = _pick(ENTITY_THEMES), n = _ri(3, 4), names = th.series.slice(0, nSeries || 2);
    var items = _pickN(th.items, n).map(function (x) { return th.pre + x; });
    var series = names.map(function (nm) { return { name: nm, values: _values(n, 40, 200, _pick([1, 5])) }; });
    return { theme: th, labels: items, series: series, unit: th.unit, metric: th.metric, entity: th.entity };
  }
  function _timeMultiDataset(nSeries) {
    var tm = _pick(TIME_THEMES), start = _pick([2019, 2020, 2021]), n = _ri(4, 5), names = tm.series.slice(0, nSeries || 2);
    var labels = []; for (var i = 0; i < n; i++) labels.push(String(start + i));
    var series = names.map(function (nm) { var v = [_ri(50, 140)]; for (var j = 1; j < n; j++) v.push(Math.max(20, v[j - 1] + _ri(-25, 40))); return { name: nm, values: v }; });
    return { theme: tm, labels: labels, series: series, unit: tm.unit, metric: tm.metric };
  }

  /* construct a clean percent-change pair (old, new) where the % change is EXACTLY the integer p. `old` is a multiple
     of 20 and `p` a multiple of 5, so old·p/100 is an integer → new is exact and (new−old)/old·100 == p with no
     rounding drift (the chart values must reproduce the asked answer precisely). */
  function _cleanPctPair() { var old = _pick([200, 240, 280, 300, 320, 360, 400, 440, 500]); var p = _pick([5, 10, 15, 20, 25, 30, 40, 50]); return { old: old, nw: old + old * p / 100, p: p }; }

  /* ════════════════════════ SINGLE-SERIES archetypes (entity: bar/pie/table) ════════════════════════
     Each archetype: { tier, skill, build(d) -> {q,a,k} | null }. `_primaryEntity[tier]` additionally guarantees a
     clean in-tier question by construction, so a tier is NEVER downgraded. */
  var ENTITY_ARCH = {
    easy: [
      { k: 'read', skill: 'observation', build: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'What is the ' + d.metric + ' of ' + d.labels[i] + '?', a: d.values[i], k: 'read' }; } },
      { k: 'max', skill: 'observation', build: function (d) { return { q: 'Which ' + d.entity + ' has the highest ' + d.metric + '? Enter that value.', a: _max(d.values), k: 'max' }; } },
      { k: 'min', skill: 'observation', build: function (d) { return { q: 'Which ' + d.entity + ' has the lowest ' + d.metric + '? Enter that value.', a: _min(d.values), k: 'min' }; } },
      { k: 'rank', skill: 'comparison', build: function (d) { if (d.values.length < 3) return null; var srt = d.values.slice().sort(function (a, b) { return b - a; }); var r = _pick([2, 3]); return { q: 'What is the ' + (r === 2 ? '2nd' : '3rd') + ' highest ' + d.metric + ' among the ' + d.entity.toLowerCase() + 's?', a: srt[r - 1], k: 'rank' }; } }
    ],
    medium: [
      { k: 'total', skill: 'aggregation', build: function (d) { return { q: 'What is the total ' + d.metric + ' of all ' + d.labels.length + ' ' + d.entity.toLowerCase() + 's shown?', a: _sum(d.values), k: 'total' }; } },
      { k: 'diff', skill: 'comparison', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1 + _ri(0, d.labels.length - 2)) % d.labels.length; var dv = Math.abs(d.values[i] - d.values[j]); if (!dv) return null; return { q: 'By how much does the ' + d.metric + ' of ' + d.labels[i] + ' exceed or trail that of ' + d.labels[j] + '? (enter the difference)', a: dv, k: 'diff' }; } },
      { k: 'avg', skill: 'average', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; return { q: 'What is the average ' + d.metric + ' across all ' + d.labels.length + ' ' + d.entity.toLowerCase() + 's?', a: _round1(av), k: 'avg' }; } },
      { k: 'share', skill: 'percentage', build: function (d) { var i = _ri(0, d.labels.length - 1), sh = d.values[i] / _sum(d.values) * 100; if (!_isClean(sh)) return null; return { q: d.labels[i] + ' accounts for what percent of the total ' + d.metric + '? (1 decimal)', a: _round1(sh), k: 'share' }; } },
      { k: 'missing', skill: 'inference', build: function (d) { var i = _ri(0, d.labels.length - 1), known = _sum(d.values) - d.values[i]; return { q: 'The total ' + d.metric + ' of all ' + d.labels.length + ' ' + d.entity.toLowerCase() + 's is ' + _sum(d.values) + '. If every value except ' + d.labels[i] + ' is as shown, what is ' + d.labels[i] + "'s " + d.metric + '?', a: d.values[i], k: 'missing' }; } }
    ],
    hard: [
      { k: 'pctMore', skill: 'percentage', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; if (!d.values[j]) return null; var pm = (d.values[i] - d.values[j]) / d.values[j] * 100; if (!_isClean(pm) || !pm) return null; return { q: d.labels[i] + "'s " + d.metric + ' is what percent more or less than that of ' + d.labels[j] + '? (1 decimal, ignore sign)', a: _round1(Math.abs(pm)), k: 'pctMore' }; } },
      { k: 'deviation', skill: 'percentage', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; var i = _ri(0, d.labels.length - 1), dev = (d.values[i] - av) / av * 100; if (!_isClean(dev) || !dev) return null; return { q: "By what percent does " + d.labels[i] + "'s " + d.metric + ' differ from the average of all ' + d.labels.length + '? (1 decimal, ignore sign)', a: _round1(Math.abs(dev)), k: 'deviation' }; } },
      { k: 'combinedShare', skill: 'contribution', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length, cs = (d.values[i] + d.values[j]) / _sum(d.values) * 100; if (!_isClean(cs)) return null; return { q: 'Together, ' + d.labels[i] + ' and ' + d.labels[j] + ' contribute what percent of the total ' + d.metric + '? (1 decimal)', a: _round1(cs), k: 'combinedShare' }; } },
      { k: 'ratio', skill: 'ratio', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; if (!d.values[j]) return null; var g = _gcd(d.values[i], d.values[j]); var r = d.values[i] / d.values[j]; if (!_isClean(r)) { if ((d.values[i] / g) > 30 || (d.values[j] / g) > 30) return null; return { q: 'What is the ratio of ' + d.labels[i] + "'s " + d.metric + ' to that of ' + d.labels[j] + '? Enter as the first number when written in simplest form a:b.', a: d.values[i] / g, k: 'ratio' }; } return { q: d.labels[i] + "'s " + d.metric + ' is how many times that of ' + d.labels[j] + '? (1 decimal)', a: _round1(r), k: 'ratio' }; } }
    ]
  };
  /* per-tier guaranteed-clean constructor (mutates d so chart ↔ question stay consistent). */
  var ENTITY_PRIMARY = {
    easy: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'What is the ' + d.metric + ' of ' + d.labels[i] + '?', a: d.values[i], k: 'read' }; },
    medium: function (d) { return { q: 'What is the total ' + d.metric + ' of all ' + d.labels.length + ' ' + d.entity.toLowerCase() + 's shown?', a: _sum(d.values), k: 'total' }; },
    hard: function (d) { var pr = _cleanPctPair(), i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; d.values[i] = pr.nw; d.values[j] = pr.old; return { q: d.labels[i] + "'s " + d.metric + ' is what percent more than ' + d.labels[j] + "'s? (1 decimal, ignore sign)", a: _round1(pr.p), k: 'pctMore' }; }
  };

  /* ════════════════════════ TIME archetypes (line) ════════════════════════ */
  var TIME_ARCH = {
    easy: [
      { k: 'read', skill: 'observation', build: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'What was the ' + d.metric + ' in ' + d.labels[i] + '?', a: d.values[i], k: 'read' }; } },
      { k: 'peak', skill: 'observation', build: function (d) { return { q: 'What was the highest ' + d.metric + ' recorded in any single year? Enter that value.', a: _max(d.values), k: 'peak' }; } },
      { k: 'trough', skill: 'observation', build: function (d) { return { q: 'What was the lowest ' + d.metric + ' recorded in any single year? Enter that value.', a: _min(d.values), k: 'trough' }; } }
    ],
    medium: [
      { k: 'total', skill: 'aggregation', build: function (d) { return { q: 'What is the total ' + d.metric + ' over all ' + d.labels.length + ' years?', a: _sum(d.values), k: 'total' }; } },
      { k: 'diff', skill: 'comparison', build: function (d) { var i = _ri(1, d.labels.length - 1); return { q: 'By how much did the ' + d.metric + ' change from ' + d.labels[i - 1] + ' to ' + d.labels[i] + '? (enter the difference)', a: Math.abs(d.values[i] - d.values[i - 1]), k: 'diff' }; } },
      { k: 'avg', skill: 'average', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; return { q: 'What is the average annual ' + d.metric + ' over the ' + d.labels.length + ' years?', a: _round1(av), k: 'avg' }; } },
      { k: 'biggestJump', skill: 'comparison', build: function (d) { var best = 0; for (var z = 1; z < d.values.length; z++) best = Math.max(best, Math.abs(d.values[z] - d.values[z - 1])); return { q: 'What is the largest change in ' + d.metric + ' between any two consecutive years?', a: best, k: 'biggestJump' }; } }
    ],
    hard: [
      { k: 'yoy', skill: 'percentage', build: function (d) { var y = _ri(1, d.labels.length - 1); if (!d.values[y - 1]) return null; var ch = (d.values[y] - d.values[y - 1]) / d.values[y - 1] * 100; if (!_isClean(ch)) return null; return { q: 'What was the percent change in ' + d.metric + ' from ' + d.labels[y - 1] + ' to ' + d.labels[y] + '? (1 decimal, ignore sign)', a: _round1(Math.abs(ch)), k: 'yoy' }; } },
      { k: 'cumulativeShare', skill: 'contribution', build: function (d) { var half = Math.floor(d.labels.length / 2), cs = _sum(d.values.slice(0, half)) / _sum(d.values) * 100; if (!_isClean(cs)) return null; return { q: 'The first ' + half + ' years contributed what percent of the total ' + d.metric + '? (1 decimal)', a: _round1(cs), k: 'cumulativeShare' }; } },
      { k: 'overallGrowth', skill: 'percentage', build: function (d) { if (!d.values[0]) return null; var g = (d.values[d.values.length - 1] - d.values[0]) / d.values[0] * 100; if (!_isClean(g)) return null; return { q: 'By what percent did the ' + d.metric + ' change over the whole period (' + d.labels[0] + ' to ' + d.labels[d.labels.length - 1] + ')? (1 decimal, ignore sign)', a: _round1(Math.abs(g)), k: 'overallGrowth' }; } }
    ]
  };
  var TIME_PRIMARY = {
    easy: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'What was the ' + d.metric + ' in ' + d.labels[i] + '?', a: d.values[i], k: 'read' }; },
    medium: function (d) { return { q: 'What is the total ' + d.metric + ' over all ' + d.labels.length + ' years?', a: _sum(d.values), k: 'total' }; },
    hard: function (d) { var pr = _cleanPctPair(), y = _ri(1, d.labels.length - 1); d.values[y - 1] = pr.old; d.values[y] = pr.nw; return { q: 'What was the percent change in ' + d.metric + ' from ' + d.labels[y - 1] + ' to ' + d.labels[y] + '? (1 decimal, ignore sign)', a: _round1(pr.p), k: 'yoy' }; }
  };

  /* ════════════════════════ MULTI-SERIES archetypes (grouped bar / multi-line / multi-col table) ════════════════════════
     Authentic cross-series exam DI. Only used at HARD (genuine cross-series reasoning). Always clean (read+integer ops),
     so they double as the guaranteed-clean hard path for multi-series categories. */
  function _multiQuestion(d) {
    var L = d.labels, S = d.series, n = L.length;
    var t = _pick(['combined', 'crossDiff', 'ratioYear', 'trendCompare', 'seriesShare']);
    var a = S[0], b = S[1] || S[0];
    if (t === 'combined') { var yi = _ri(0, n - 1); return { q: 'In ' + L[yi] + ', what is the combined ' + d.metric + ' of ' + a.name + ' and ' + b.name + '?', a: a.values[yi] + b.values[yi], k: 'm_combined', skill: 'aggregation' }; }
    if (t === 'crossDiff') { var yj = _ri(0, n - 1), dv = Math.abs(a.values[yj] - b.values[yj]); if (!dv) return null; return { q: 'In ' + L[yj] + ', by how much does ' + a.name + "'s " + d.metric + ' differ from ' + b.name + "'s? (enter the difference)", a: dv, k: 'm_crossDiff', skill: 'comparison' }; }
    if (t === 'ratioYear') { var yk = _ri(0, n - 1); if (!b.values[yk]) return null; var g = _gcd(a.values[yk], b.values[yk]); if ((a.values[yk] / g) > 30) return null; return { q: 'In ' + L[yk] + ', what is the ratio of ' + a.name + "'s " + d.metric + ' to ' + b.name + "'s, in simplest form a:b? Enter a.", a: a.values[yk] / g, k: 'm_ratioYear', skill: 'ratio' }; }
    if (t === 'trendCompare') { var d1 = a.values[n - 1] - a.values[0], d2 = b.values[n - 1] - b.values[0]; return { q: 'Over the whole period, which had the larger absolute change in ' + d.metric + ' — and by how many units more? (enter the gap between the two changes)', a: Math.abs(Math.abs(d1) - Math.abs(d2)), k: 'm_trendCompare', skill: 'trend' }; }
    var yl = _ri(0, n - 1), tot = 0; for (var i = 0; i < S.length; i++) tot += S[i].values[yl]; if (!tot) return null; var sh = a.values[yl] / tot * 100; if (!_isClean(sh)) return null; return { q: 'In ' + L[yl] + ', ' + a.name + ' accounts for what percent of the combined ' + d.metric + ' of all series? (1 decimal)', a: _round1(sh), k: 'm_seriesShare', skill: 'contribution' };
  }

  /* ── chart spec builders (consumed by di-charts.js) ── */
  function _barChart(d) { return d.series ? { kind: 'bar', title: _metricUnit(d) + ' by ' + d.entity, unit: d.unit, yLabel: d.metric, labels: d.labels.slice(), series: d.series.map(function (s) { return { name: s.name, values: s.values.slice() }; }), stacked: !!d._stacked } : { kind: 'bar', title: _metricUnit(d) + ' by ' + d.entity, unit: d.unit, yLabel: d.metric, labels: d.labels.slice(), values: d.values.slice() }; }
  function _pieChart(d) { return { kind: 'pie', title: 'Share of ' + _metricUnit(d), unit: d.unit, labels: d.labels.slice(), values: d.values.slice() }; }
  function _lineChart(d) { return d.series ? { kind: 'line', title: _metricUnit(d) + ' over the years', unit: d.unit, xLabel: 'Year', yLabel: d.metric, labels: d.labels.slice(), series: d.series.map(function (s) { return { name: s.name, values: s.values.slice() }; }) } : { kind: 'line', title: _metricUnit(d) + ' of ' + d.subject + ' over the years', unit: d.unit, xLabel: 'Year', yLabel: d.metric, labels: d.labels.slice(), values: d.values.slice() }; }
  function _tableChart(d) {
    if (d.series) { var cols = [d.entity].concat(d.series.map(function (s) { return s.name + (d.unit ? ' (' + d.unit + ')' : ''); })); var rows = d.labels.map(function (l, i) { return [l].concat(d.series.map(function (s) { return String(s.values[i]); })); }); return { kind: 'table', title: _metricUnit(d) + ' by ' + d.entity, columns: cols, rows: rows }; }
    return { kind: 'table', title: _metricUnit(d) + ' by ' + d.entity, columns: [d.entity, d.metric + (d.unit ? ' (' + d.unit + ')' : '')], rows: d.labels.map(function (l, i) { return [l, String(d.values[i])]; }) };
  }

  /* ── CASELET: worded datasets (Banking favourite) — single & two-step, plus a missing-data variant ── */
  function _caselet(diff) {
    var ctx = _pick([
      { whole: 'people surveyed', g1: 'men', g2: 'women', act: 'preferred online shopping' },
      { whole: 'students in a class', g1: 'boys', g2: 'girls', act: 'passed the exam' },
      { whole: 'employees in a firm', g1: 'managers', g2: 'staff', act: 'opted for the new policy' },
      { whole: 'visitors to a fair', g1: 'adults', g2: 'children', act: 'bought a ticket online' },
      { whole: 'commuters polled', g1: 'car users', g2: 'bus users', act: 'support the new metro line' },
      { whole: 'subscribers', g1: 'annual members', g2: 'monthly members', act: 'renewed this year' }
    ]);
    var totalPeople = _ri(4, 12) * 100;
    var g1 = Math.round(totalPeople * _pick([0.4, 0.45, 0.5, 0.55, 0.6])), g2 = totalPeople - g1;
    var p1 = _pick([20, 25, 40, 50, 60, 75]), p2 = _pick([20, 25, 40, 50, 60, 75]);
    var a1 = g1 * p1 / 100, a2 = g2 * p2 / 100;
    if (!_isClean(a1) || !_isClean(a2)) return null;
    var stem = 'Out of ' + totalPeople + ' ' + ctx.whole + ', ' + g1 + ' are ' + ctx.g1 + ' and the rest are ' + ctx.g2 + '. ' + p1 + '% of the ' + ctx.g1 + ' and ' + p2 + '% of the ' + ctx.g2 + ' ' + ctx.act + '. ';
    if (diff === 'easy') return { q: stem + 'How many ' + ctx.g1 + ' ' + ctx.act + '?', a: a1, k: 'caseRead', skill: 'observation' };
    if (diff === 'medium') { var t = _pick(['total', 'missing']); if (t === 'total') return { q: stem + 'In total, how many people ' + ctx.act + '?', a: a1 + a2, k: 'caseTotal', skill: 'aggregation' }; return { q: stem + 'If ' + (a1 + a2) + ' people in all ' + ctx.act + ', and ' + a1 + ' of them are ' + ctx.g1 + ', how many ' + ctx.g2 + ' ' + ctx.act + '?', a: a2, k: 'caseMissing', skill: 'inference' }; }
    var tot = a1 + a2; if (!tot) return null; var sh = a1 / tot * 100; if (!_isClean(sh)) return null; return { q: stem + 'Of all the people who ' + ctx.act + ', what percent are ' + ctx.g1 + '? (1 decimal)', a: _round1(sh), k: 'caseShare', skill: 'contribution' };
  }

  /* ── the per-category generators: pick an in-tier archetype, build a clean question, attach chart ── */
  function _genFromArch(category, chartFn, diff, ds, arch, primary) {
    var noun = category === 'di-table' ? 'table' : 'chart';
    for (var attempt = 0; attempt < 60; attempt++) {
      var d = ds();
      var a = arch[diff][_ri(0, arch[diff].length - 1)];
      var qa = a.build(d);
      if (qa) return { question: 'Study the ' + noun + ' and answer: ' + qa.q, answer: qa.a, category: category, chart: chartFn(d), subtype: diff + ':' + qa.k };
    }
    var d2 = ds(), qa2 = primary[diff](d2);   /* guaranteed clean, in-tier — never a downgrade */
    return { question: 'Study the ' + noun + ' and answer: ' + qa2.q, answer: qa2.a, category: category, chart: chartFn(d2), subtype: diff + ':' + qa2.k };
  }

  function _genEntity(category, chartFn, diff) {
    /* HARD bar/table sometimes use authentic cross-series (grouped bar / multi-column table). */
    if (diff === 'hard' && (category === 'di-bar' || category === 'di-table') && Math.random() < 0.5) {
      for (var attempt = 0; attempt < 40; attempt++) {
        var dm = _entityMultiDataset(_pick([2, 2, 3]));
        if (category === 'di-bar' && Math.random() < 0.4) dm._stacked = true;
        var qa = _multiQuestion(dm);
        if (qa) return { question: 'Study the ' + (category === 'di-table' ? 'table' : 'chart') + ' and answer: ' + qa.q, answer: qa.a, category: category, chart: chartFn(dm), subtype: 'hard:' + qa.k };
      }
    }
    return _genFromArch(category, chartFn, diff, _entityDataset, ENTITY_ARCH, ENTITY_PRIMARY);
  }
  function _genLine(diff) {
    if (diff === 'hard' && Math.random() < 0.5) {
      for (var attempt = 0; attempt < 40; attempt++) {
        var dm = _timeMultiDataset(2);
        var qa = _multiQuestion(dm);
        if (qa) return { question: 'Study the graph and answer: ' + qa.q, answer: qa.a, category: 'di-line', chart: _lineChart(dm), subtype: 'hard:' + qa.k };
      }
    }
    return _genFromArch('di-line', _lineChart, diff, _timeDataset, TIME_ARCH, TIME_PRIMARY);
  }
  function _genCaselet(diff) {
    for (var attempt = 0; attempt < 60; attempt++) { var qa = _caselet(diff); if (qa) return { question: qa.q, answer: qa.a, category: 'di-caselet', subtype: diff + ':' + qa.k }; }
    var qa2 = _caselet('easy') || { q: 'Out of 400 people surveyed, 240 are men. How many are men?', a: 240, k: 'caseRead' };
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
