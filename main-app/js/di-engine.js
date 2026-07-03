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

  /* ── realistic, exam-flavoured themes (CAT / Banking / SSC / Government DI vocabulary). Optional per-theme
        `range:[min,max,step]` makes the numbers domain-realistic (rainfall in the hundreds, subscribers in the tens,
        production in the hundreds…) without changing any math — the archetypes still construct clean answers. ── */
  var ENTITY_THEMES = [
    { entity: 'Company', items: ['A', 'B', 'C', 'D', 'E', 'F'], pre: 'Company ', metric: 'Sales', unit: '₹ crore', series: ['2022', '2023', '2024'] },
    { entity: 'Bank Branch', items: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur'], pre: '', metric: 'Loans Disbursed', unit: '₹ lakh', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'Product', items: ['P', 'Q', 'R', 'S', 'T', 'U'], pre: 'Product ', metric: 'Units Sold', unit: "'000 units", series: ['Online', 'Retail'] },
    { entity: 'School', items: ['Rosewood', 'Hilltop', 'Greenfield', 'Lakeside', 'Oakridge', 'Sunrise'], pre: '', metric: 'Students Enrolled', unit: '', series: ['Boys', 'Girls'], range: [240, 1200, 4] },
    { entity: 'Department', items: ['HR', 'Sales', 'IT', 'Finance', 'Operations', 'Legal'], pre: '', metric: 'Employees', unit: '', series: ['2023', '2024'] },
    { entity: 'City', items: ['Indore', 'Surat', 'Nagpur', 'Kochi', 'Patna', 'Bhopal'], pre: '', metric: 'Tickets Booked', unit: '', series: ['Q1', 'Q2'], range: [200, 900, 5] },
    { entity: 'Store', items: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot'], pre: '', metric: 'Revenue', unit: '₹ lakh', series: ['2023', '2024'] },
    { entity: 'State', items: ['Punjab', 'Haryana', 'Gujarat', 'Kerala', 'Assam', 'Odisha'], pre: '', metric: 'Wheat Production', unit: "'000 tonnes", series: ['Kharif', 'Rabi'], range: [150, 900, 5] },
    { entity: 'State', items: ['Maharashtra', 'Bihar', 'Rajasthan', 'Karnataka', 'Telangana', 'Goa'], pre: '', metric: 'Population', unit: 'lakh', series: ['Urban', 'Rural'], range: [40, 360, 2] },
    { entity: 'Country', items: ['India', 'China', 'Brazil', 'Germany', 'Kenya', 'Vietnam'], pre: '', metric: 'Exports', unit: '₹ crore', series: ['2023', '2024'], range: [200, 1200, 5] },
    { entity: 'Hospital', items: ['Civil', 'Apollo', 'Fortis', 'Manipal', 'Medanta', 'KIMS'], pre: '', metric: 'Patients Admitted', unit: '', series: ['General', 'ICU'], range: [120, 720, 4] },
    { entity: 'Platform', items: ['Flipkart', 'Amazon', 'Meesho', 'Nykaa', 'Ajio', 'Tata Neu'], pre: '', metric: 'Orders', unit: "'000", series: ['Fashion', 'Electronics'], range: [60, 480, 3] },
    { entity: 'Operator', items: ['Jio', 'Airtel', 'Vodafone', 'BSNL', 'MTNL', 'ACT'], pre: '', metric: 'Subscribers', unit: 'lakh', series: ['Prepaid', 'Postpaid'], range: [40, 360, 2] },
    { entity: 'Power Plant', items: ['Korba', 'Singrauli', 'Vindhya', 'Talcher', 'Ramagundam', 'Sipat'], pre: '', metric: 'Electricity Generated', unit: 'MW', series: ['Thermal', 'Solar'], range: [150, 900, 5] },
    { entity: 'Destination', items: ['Agra', 'Jaipur', 'Goa', 'Munnar', 'Shimla', 'Hampi'], pre: '', metric: 'Tourist Arrivals', unit: "'000", series: ['Domestic', 'Foreign'], range: [60, 540, 3] },
    { entity: 'Railway Zone', items: ['Northern', 'Western', 'Central', 'Southern', 'Eastern', 'North-East'], pre: '', metric: 'Passengers Carried', unit: 'lakh', series: ['AC', 'Non-AC'], range: [80, 600, 4] },
    { entity: 'Airport', items: ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Kolkata', 'Kochi'], pre: '', metric: 'Flights Handled', unit: "'00", series: ['Domestic', 'International'], range: [40, 320, 2] },
    { entity: 'Insurer', items: ['LIC', 'HDFC', 'SBI', 'ICICI', 'Max', 'Bajaj'], pre: '', metric: 'Premiums Collected', unit: '₹ crore', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'Fund', items: ['Bluechip', 'Midcap', 'Smallcap', 'Flexicap', 'Index', 'ELSS'], pre: '', metric: 'Assets Managed', unit: '₹ crore', series: ['Equity', 'Debt'], range: [150, 900, 5] },
    { entity: 'District', items: ['Cherrapunji', 'Mawsynram', 'Pasighat', 'Agumbe', 'Amboli', 'Gangtok'], pre: '', metric: 'Rainfall', unit: 'mm', series: ['2023', '2024'], range: [400, 1600, 5] },
    { entity: 'Factory', items: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6'], pre: '', metric: 'Output', unit: "'000 units", series: ['Shift A', 'Shift B'], range: [80, 480, 4] },
    { entity: 'Team', items: ['Falcons', 'Tigers', 'Strikers', 'Warriors', 'Royals', 'Titans'], pre: '', metric: 'Goals Scored', unit: '', series: ['Home', 'Away'], range: [12, 90, 1] },
    { entity: 'Mall', items: ['Phoenix', 'Orion', 'Forum', 'Select', 'Lulu', 'Inorbit'], pre: '', metric: 'Footfall', unit: "'000", series: ['Weekday', 'Weekend'], range: [60, 480, 3] }
  ];
  var TIME_THEMES = [
    { metric: 'Revenue', unit: '₹ crore', series: ['Plant X', 'Plant Y'] },
    { metric: 'Production', unit: "'000 units", series: ['Unit A', 'Unit B'] },
    { metric: 'Profit', unit: '₹ lakh', series: ['Division 1', 'Division 2'] },
    { metric: 'Website Visitors', unit: "'000", series: ['Mobile', 'Desktop'] },
    { metric: 'Exports', unit: '₹ crore', series: ['Region East', 'Region West'] },
    { metric: 'Imports', unit: '₹ crore', series: ['Crude', 'Machinery'] },
    { metric: 'GDP', unit: "₹ '000 crore", series: ['Services', 'Industry'] },
    { metric: 'Rainfall', unit: 'mm', series: ['Coastal', 'Inland'], range: [60, 320] },
    { metric: 'Tourist Arrivals', unit: "'000", series: ['Domestic', 'Foreign'] },
    { metric: 'Car Sales', unit: "'000 units", series: ['Petrol', 'EV'] },
    { metric: 'Mobile Subscribers', unit: 'lakh', series: ['Prepaid', 'Postpaid'] },
    { metric: 'Power Generation', unit: 'million units', series: ['Thermal', 'Renewable'] },
    { metric: 'Digital Payments', unit: '₹ crore', series: ['UPI', 'Cards'] },
    { metric: 'Sugar Output', unit: "'000 tonnes", series: ['Mill A', 'Mill B'] }
  ];

  /* Varied (NOT all-multiples-of-10) integers — realistic data. step lets a builder bias toward clean derived values. */
  function _values(n, min, max, step) { step = step || 1; var lo = Math.ceil(min / step), hi = Math.floor(max / step), out = []; for (var i = 0; i < n; i++) out.push(_ri(lo, hi) * step); return out; }
  function _metricUnit(d) { return d.metric + (d.unit ? ' (in ' + d.unit + ')' : ''); }
  /* grammatical plural so stems read naturally: City→Cities, Company→Companies, Bank Branch→Bank Branches. */
  function _plural(w) { if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies'; if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es'; return w + 's'; }

  /* ── datasets ── (each honours an optional theme `range:[min,max,step]`; defaults keep the original realistic band) */
  function _entityDataset() {
    var th = _pick(ENTITY_THEMES), n = _ri(4, 5), r = th.range || [35, 240, 0];
    var items = _pickN(th.items, n).map(function (x) { return th.pre + x; });
    return { theme: th, labels: items, values: _values(n, r[0], r[1], r[2] || _pick([1, 1, 5])), unit: th.unit, metric: th.metric, entity: th.entity };
  }
  /* a time series with bounded year-on-year continuity → looks like a real trend, not a random walk. */
  function _timeDataset() {
    var tm = _pick(TIME_THEMES), start = _pick([2017, 2018, 2019, 2020]), n = _ri(5, 6);
    var labels = []; for (var i = 0; i < n; i++) labels.push(String(start + i));
    var r = tm.range, lo = r ? r[0] : 60, hi = r ? r[1] : 160, sp = hi - lo;
    var v = [_ri(lo, hi)]; for (var j = 1; j < n; j++) { var step = _ri(-Math.round(sp * 0.28), Math.round(sp * 0.4)); v.push(Math.max(10, v[j - 1] + step)); }
    var subject = _pick(['Company XYZ', 'the firm', 'the plant', 'the portal', 'the brand', 'the network', 'the chain']);
    return { theme: tm, labels: labels, values: v, unit: tm.unit, metric: tm.metric, subject: subject };
  }
  /* multi-series entity dataset (grouped/stacked bar, multi-column table). */
  function _entityMultiDataset(nSeries) {
    var th = _pick(ENTITY_THEMES), n = _ri(3, 4), names = th.series.slice(0, nSeries || 2), r = th.range || [40, 200, 0];
    var items = _pickN(th.items, n).map(function (x) { return th.pre + x; });
    var series = names.map(function (nm) { return { name: nm, values: _values(n, r[0], r[1], r[2] || _pick([1, 5])) }; });
    return { theme: th, labels: items, series: series, unit: th.unit, metric: th.metric, entity: th.entity };
  }
  function _timeMultiDataset(nSeries) {
    var tm = _pick(TIME_THEMES), start = _pick([2019, 2020, 2021]), n = _ri(4, 5), names = tm.series.slice(0, nSeries || 2);
    var labels = []; for (var i = 0; i < n; i++) labels.push(String(start + i));
    var r = tm.range, lo = r ? r[0] : 50, hi = r ? r[1] : 140, sp = hi - lo;
    var series = names.map(function (nm) { var v = [_ri(lo, hi)]; for (var j = 1; j < n; j++) v.push(Math.max(10, v[j - 1] + _ri(-Math.round(sp * 0.25), Math.round(sp * 0.36)))); return { name: nm, values: v }; });
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
      { k: 'rank', skill: 'comparison', build: function (d) { if (d.values.length < 3) return null; var srt = d.values.slice().sort(function (a, b) { return b - a; }); var r = _pick([2, 3]); return { q: 'What is the ' + (r === 2 ? '2nd' : '3rd') + ' highest ' + d.metric + ' among the ' + _plural(d.entity).toLowerCase() + '?', a: srt[r - 1], k: 'rank' }; } }
    ],
    medium: [
      { k: 'total', skill: 'aggregation', build: function (d) { var ents = d.labels.length + ' ' + _plural(d.entity).toLowerCase(); return { q: _pick(['What is the total ' + d.metric + ' of all ' + ents + ' shown?', 'What is the combined ' + d.metric + ' of the ' + ents + '?', 'Taken together, what is the total ' + d.metric + ' of all ' + ents + '?']), a: _sum(d.values), k: 'total' }; } },
      { k: 'diff', skill: 'comparison', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1 + _ri(0, d.labels.length - 2)) % d.labels.length; var dv = Math.abs(d.values[i] - d.values[j]); if (!dv) return null; return { q: 'By how much does the ' + d.metric + ' of ' + d.labels[i] + ' differ from that of ' + d.labels[j] + '? (enter the difference)', a: dv, k: 'diff' }; } },
      { k: 'avg', skill: 'average', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; var ents = d.labels.length + ' ' + _plural(d.entity).toLowerCase(); return { q: _pick(['What is the average ' + d.metric + ' across all ' + ents + '?', 'What is the mean ' + d.metric + ' per ' + d.entity.toLowerCase() + ', across the ' + ents + '?', 'On average, what is the ' + d.metric + ' of one ' + d.entity.toLowerCase() + ' among the ' + ents + '?']), a: _round1(av), k: 'avg' }; } },
      { k: 'share', skill: 'percentage', build: function (d) { var i = _ri(0, d.labels.length - 1), sh = d.values[i] / _sum(d.values) * 100; if (!_isClean(sh)) return null; return { q: d.labels[i] + ' accounts for what percent of the total ' + d.metric + '? (to 1 decimal place)', a: _round1(sh), k: 'share' }; } },
      { k: 'missing', skill: 'inference', build: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'The total ' + d.metric + ' of all ' + d.labels.length + ' ' + _plural(d.entity).toLowerCase() + ' is ' + _sum(d.values) + '. If every value except ' + d.labels[i] + ' is as shown, what is ' + d.labels[i] + "'s " + d.metric + '?', a: d.values[i], k: 'missing' }; } }
    ],
    hard: [
      { k: 'pctMore', skill: 'percentage', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; if (!d.values[j]) return null; var pm = (d.values[i] - d.values[j]) / d.values[j] * 100; if (!_isClean(pm) || !pm) return null; return { q: d.labels[i] + "'s " + d.metric + ' differs from that of ' + d.labels[j] + ' by what percent? (to 1 decimal place, absolute value)', a: _round1(Math.abs(pm)), k: 'pctMore' }; } },
      { k: 'deviation', skill: 'percentage', build: function (d) { var av = _sum(d.values) / d.labels.length; if (!_isClean(av)) return null; var i = _ri(0, d.labels.length - 1), dev = (d.values[i] - av) / av * 100; if (!_isClean(dev) || !dev) return null; return { q: "By what percent does " + d.labels[i] + "'s " + d.metric + ' differ from the average of all ' + d.labels.length + '? (to 1 decimal place, absolute value)', a: _round1(Math.abs(dev)), k: 'deviation' }; } },
      { k: 'combinedShare', skill: 'contribution', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length, cs = (d.values[i] + d.values[j]) / _sum(d.values) * 100; if (!_isClean(cs)) return null; return { q: 'Together, ' + d.labels[i] + ' and ' + d.labels[j] + ' contribute what percent of the total ' + d.metric + '? (to 1 decimal place)', a: _round1(cs), k: 'combinedShare' }; } },
      { k: 'ratio', skill: 'ratio', build: function (d) { var i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; if (!d.values[j]) return null; var g = _gcd(d.values[i], d.values[j]); var r = d.values[i] / d.values[j]; if (!_isClean(r)) { if ((d.values[i] / g) > 30 || (d.values[j] / g) > 30) return null; return { q: 'What is the ratio of ' + d.labels[i] + "'s " + d.metric + ' to that of ' + d.labels[j] + '? Express it in simplest form a:b and enter a.', a: d.values[i] / g, k: 'ratio' }; } return { q: d.labels[i] + "'s " + d.metric + ' is how many times that of ' + d.labels[j] + '? (to 1 decimal place)', a: _round1(r), k: 'ratio' }; } }
    ]
  };
  /* per-tier guaranteed-clean constructor (mutates d so chart ↔ question stay consistent). */
  var ENTITY_PRIMARY = {
    easy: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'What is the ' + d.metric + ' of ' + d.labels[i] + '?', a: d.values[i], k: 'read' }; },
    medium: function (d) { return { q: 'What is the total ' + d.metric + ' of all ' + d.labels.length + ' ' + _plural(d.entity).toLowerCase() + ' shown?', a: _sum(d.values), k: 'total' }; },
    hard: function (d) { var pr = _cleanPctPair(), i = _ri(0, d.labels.length - 1), j = (i + 1) % d.labels.length; d.values[i] = pr.nw; d.values[j] = pr.old; return { q: d.labels[i] + "'s " + d.metric + ' is what percent more than ' + d.labels[j] + "'s? (to 1 decimal place, absolute value)", a: _round1(pr.p), k: 'pctMore' }; }
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
      { k: 'yoy', skill: 'percentage', build: function (d) { var y = _ri(1, d.labels.length - 1); if (!d.values[y - 1]) return null; var ch = (d.values[y] - d.values[y - 1]) / d.values[y - 1] * 100; if (!_isClean(ch)) return null; return { q: 'What was the percent change in ' + d.metric + ' from ' + d.labels[y - 1] + ' to ' + d.labels[y] + '? (to 1 decimal place, absolute value)', a: _round1(Math.abs(ch)), k: 'yoy' }; } },
      { k: 'cumulativeShare', skill: 'contribution', build: function (d) { var half = Math.floor(d.labels.length / 2), cs = _sum(d.values.slice(0, half)) / _sum(d.values) * 100; if (!_isClean(cs)) return null; return { q: 'The first ' + half + ' years contributed what percent of the total ' + d.metric + '? (to 1 decimal place)', a: _round1(cs), k: 'cumulativeShare' }; } },
      { k: 'overallGrowth', skill: 'percentage', build: function (d) { if (!d.values[0]) return null; var g = (d.values[d.values.length - 1] - d.values[0]) / d.values[0] * 100; if (!_isClean(g)) return null; return { q: 'By what percent did the ' + d.metric + ' change over the whole period (' + d.labels[0] + ' to ' + d.labels[d.labels.length - 1] + ')? (to 1 decimal place, absolute value)', a: _round1(Math.abs(g)), k: 'overallGrowth' }; } }
    ]
  };
  var TIME_PRIMARY = {
    easy: function (d) { var i = _ri(0, d.labels.length - 1); return { q: 'What was the ' + d.metric + ' in ' + d.labels[i] + '?', a: d.values[i], k: 'read' }; },
    medium: function (d) { return { q: 'What is the total ' + d.metric + ' over all ' + d.labels.length + ' years?', a: _sum(d.values), k: 'total' }; },
    hard: function (d) { var pr = _cleanPctPair(), y = _ri(1, d.labels.length - 1); d.values[y - 1] = pr.old; d.values[y] = pr.nw; return { q: 'What was the percent change in ' + d.metric + ' from ' + d.labels[y - 1] + ' to ' + d.labels[y] + '? (to 1 decimal place, absolute value)', a: _round1(pr.p), k: 'yoy' }; }
  };

  /* ════════════════════════ MULTI-SERIES archetypes (grouped bar / multi-line / multi-col table) ════════════════════════
     Authentic cross-series exam DI, used at HARD only — and EARNED: every archetype here is genuine cross-series
     reasoning (percent difference, ratio, series contribution, grand-total share, trend comparison). Bare cross-series
     add/subtract were removed (they are medium-level — the Sets engine uses them at their correct tiers). If none is
     clean, the caller falls back to the single-series hard primary, so the tier is never downgraded. */
  function _multiQuestion(d) {
    var L = d.labels, S = d.series, n = L.length, a = S[0], b = S[1] || S[0];
    var t = _pick(['pctDiff', 'ratioYear', 'seriesShare', 'combinedShare', 'trendCompare']);
    if (t === 'pctDiff') { var yi = _ri(0, n - 1); if (!b.values[yi] || a.values[yi] === b.values[yi]) return null; var pd = (a.values[yi] - b.values[yi]) / b.values[yi] * 100; if (!_isClean(pd)) return null; return { q: 'In ' + L[yi] + ', the ' + d.metric + ' of ' + a.name + ' differs from that of ' + b.name + ' by what percent? (to 1 decimal place, absolute value)', a: _round1(Math.abs(pd)), k: 'm_pctDiff', skill: 'percentage' }; }
    if (t === 'ratioYear') { var yk = _ri(0, n - 1); if (!b.values[yk]) return null; var g = _gcd(a.values[yk], b.values[yk]); if ((a.values[yk] / g) > 30 || (b.values[yk] / g) > 30) return null; return { q: 'In ' + L[yk] + ', what is the ratio of ' + a.name + ' to ' + b.name + ' (' + d.metric + ')? Express in simplest form a:b and enter a.', a: a.values[yk] / g, k: 'm_ratioYear', skill: 'ratio' }; }
    if (t === 'seriesShare') { var yl = _ri(0, n - 1), tot = 0; for (var i = 0; i < S.length; i++) tot += S[i].values[yl]; if (!tot) return null; var sh = a.values[yl] / tot * 100; if (!_isClean(sh)) return null; return { q: 'In ' + L[yl] + ', ' + a.name + " accounts for what percent of that entry's combined " + d.metric + ' across all series? (to 1 decimal place)', a: _round1(sh), k: 'm_seriesShare', skill: 'contribution' }; }
    if (t === 'combinedShare') { var ym = _ri(0, n - 1), grand = 0; for (var s = 0; s < S.length; s++) for (var e = 0; e < n; e++) grand += S[s].values[e]; if (!grand) return null; var pair = a.values[ym] + b.values[ym], cs = pair / grand * 100; if (!_isClean(cs)) return null; return { q: 'Across every series and entry shown, ' + a.name + ' and ' + b.name + ' in ' + L[ym] + ' together make up what percent of the grand total ' + d.metric + '? (to 1 decimal place)', a: _round1(cs), k: 'm_combinedShare', skill: 'contribution' }; }
    var d1 = a.values[n - 1] - a.values[0], d2 = b.values[n - 1] - b.values[0];
    return { q: 'From ' + L[0] + ' to ' + L[n - 1] + ', by how many units did the larger change in ' + d.metric + ' exceed the smaller? (comparing ' + a.name + ' and ' + b.name + ')', a: Math.abs(Math.abs(d1) - Math.abs(d2)), k: 'm_trendCompare', skill: 'trend' };
  }

  /* ── chart spec builders (consumed by di-charts.js) ── */
  function _barChart(d) { return d.series ? { kind: 'bar', title: _metricUnit(d) + ' by ' + d.entity, unit: d.unit, yLabel: d.metric, labels: d.labels.slice(), series: d.series.map(function (s) { return { name: s.name, values: s.values.slice() }; }), stacked: !!d._stacked } : { kind: 'bar', title: _metricUnit(d) + ' by ' + d.entity, unit: d.unit, yLabel: d.metric, labels: d.labels.slice(), values: d.values.slice(), horizontal: Math.random() < 0.4 }; }
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
      { whole: 'subscribers', g1: 'annual members', g2: 'monthly members', act: 'renewed this year' },
      { whole: 'loan applicants', g1: 'salaried applicants', g2: 'self-employed applicants', act: 'were approved' },
      { whole: 'account holders', g1: 'savings-account holders', g2: 'current-account holders', act: 'use mobile banking' },
      { whole: 'candidates who appeared', g1: 'male candidates', g2: 'female candidates', act: 'cleared the cut-off' },
      { whole: 'registered voters', g1: 'first-time voters', g2: 'repeat voters', act: 'cast their vote' },
      { whole: 'policyholders', g1: 'term-plan holders', g2: 'endowment-plan holders', act: 'renewed their policy' },
      { whole: 'households surveyed', g1: 'urban households', g2: 'rural households', act: 'own a smartphone' },
      { whole: 'farmers in a district', g1: 'small farmers', g2: 'large farmers', act: 'adopted the new seed' },
      { whole: 'patients admitted', g1: 'insured patients', g2: 'uninsured patients', act: 'were discharged within a week' },
      { whole: 'travellers polled', g1: 'business travellers', g2: 'leisure travellers', act: 'booked through the app' },
      { whole: 'employees in a company', g1: 'on-site staff', g2: 'remote staff', act: 'enrolled in the training' }
    ]);
    var totalPeople = _ri(4, 12) * 100;
    var g1 = Math.round(totalPeople * _pick([0.4, 0.45, 0.5, 0.55, 0.6])), g2 = totalPeople - g1;
    var p1 = _pick([20, 25, 40, 50, 60, 75]), p2 = _pick([20, 25, 40, 50, 60, 75]);
    var a1 = g1 * p1 / 100, a2 = g2 * p2 / 100;
    if (!_isClean(a1) || !_isClean(a2)) return null;
    var stem = 'Out of ' + totalPeople + ' ' + ctx.whole + ', ' + g1 + ' are ' + ctx.g1 + ' and ' + g2 + ' are ' + ctx.g2 + '. ' + p1 + '% of the ' + ctx.g1 + ' and ' + p2 + '% of the ' + ctx.g2 + ' ' + ctx.act + '. ';
    if (diff === 'easy') return { q: stem + 'How many ' + ctx.g1 + ' ' + ctx.act + '?', a: a1, k: 'caseRead', skill: 'observation' };
    if (diff === 'medium') { var t = _pick(['total', 'missing']); if (t === 'total') return { q: stem + 'In total, how many people ' + ctx.act + '?', a: a1 + a2, k: 'caseTotal', skill: 'aggregation' }; return { q: stem + 'If ' + (a1 + a2) + ' people in all ' + ctx.act + ', and ' + a1 + ' of them are ' + ctx.g1 + ', how many ' + ctx.g2 + ' ' + ctx.act + '?', a: a2, k: 'caseMissing', skill: 'inference' }; }
    var tot = a1 + a2; if (!tot) return null; var sh = a1 / tot * 100; if (!_isClean(sh)) return null; return { q: stem + 'Of all the people who ' + ctx.act + ', what percent are ' + ctx.g1 + '? (to 1 decimal place)', a: _round1(sh), k: 'caseShare', skill: 'contribution' };
  }

  /* ADR-093: the chart sits directly above the stem, so a fixed "Study the chart and answer:" prefix is noise.
     Rotate natural exam lead-ins (including none). Label matching in the check harness is unaffected — lead-ins
     never contain entity names or digits. */
  function _lead(noun, q) {
    var r = Math.random();
    if (r < 0.4) return q;                                                              // the chart speaks for itself
    if (r < 0.65) return 'Based on the ' + noun + ', ' + q.charAt(0).toLowerCase() + q.slice(1);
    if (r < 0.85) return 'From the ' + noun + ' shown: ' + q;
    return 'Refer to the ' + noun + '. ' + q;
  }

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
    /* HARD bar/table sometimes use authentic cross-series (grouped bar / multi-column table). */
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
