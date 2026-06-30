/**
 * di-charts.check.js — validates the DI chart renderer (ADR-074, QuantReflex V2 Phase 2).
 *
 * The renderer is pure (spec → HTML string), so it's fully unit-testable under node. Asserts each chart kind emits
 * well-formed, accessible, XSS-safe markup that actually contains the data the student must read. Wired into
 * `npm test`.   node scripts/di-charts.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var DC = require(p('js/ui/di-charts'));

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }
function count(hay, needle) { return hay.split(needle).length - 1; }

console.log('di-charts.check — DI chart renderer (ADR-074)');

/* ── 1. bar: one <rect> + one value label per data point; accessible; data in aria ── */
(function () {
  var spec = { kind: 'bar', title: 'Sales by Company', unit: '₹ crore', labels: ['Company A', 'Company B', 'Company C', 'Company D'], values: [120, 80, 150, 90] };
  var h = DC.render(spec);
  ok('1 role=img present', h.indexOf('role="img"') !== -1);
  ok('1 title rendered', h.indexOf('Sales by Company') !== -1);
  ok('1 one rect per bar', count(h, '<rect') === 4);
  ok('1 every value label shown', ['120', '80', '150', '90'].every(function (v) { return h.indexOf('>' + v + '<') !== -1; }));
  ok('1 every axis label shown', spec.labels.every(function (l) { return h.indexOf(l) !== -1; }));
  ok('1 aria-label carries the data', /aria-label="[^"]*120[^"]*150/.test(h));
  ok('1 no undefined/NaN', h.indexOf('undefined') === -1 && h.indexOf('NaN') === -1);
})();

/* ── 2. line: polyline + one marker per point ── */
(function () {
  var spec = { kind: 'line', title: 'Revenue over years', labels: ['2019', '2020', '2021', '2022', '2023'], values: [100, 140, 120, 180, 200] };
  var h = DC.render(spec);
  ok('2 has a polyline', h.indexOf('<polyline') !== -1);
  ok('2 one circle per point', count(h, '<circle') === 5);
  ok('2 years on axis', ['2019', '2023'].every(function (y) { return h.indexOf(y) !== -1; }));
  ok('2 no NaN', h.indexOf('NaN') === -1);
})();

/* ── 3. pie: a slice path per category + % labels + legend ── */
(function () {
  var spec = { kind: 'pie', title: 'Share', labels: ['North', 'South', 'East', 'West'], values: [25, 25, 25, 25] };
  var h = DC.render(spec);
  ok('3 one path per slice', count(h, '<path') === 4);
  ok('3 percent labels present', count(h, '%<') >= 1);
  ok('3 legend shows label + value', h.indexOf('North — 25') !== -1);
  /* single-slice pie degrades to a full circle (no zero-area path) */
  var solo = DC.render({ kind: 'pie', title: 'One', labels: ['All'], values: [10] });
  ok('3 single-category pie is a circle', solo.indexOf('<circle') !== -1 && solo.indexOf('<path') === -1);
})();

/* ── 4. table: header + one row per datum, numeric cells right-aligned class ── */
(function () {
  var spec = { kind: 'table', title: 'Loans', columns: ['Branch', 'Loans (₹ lakh)'], rows: [['Delhi', '120'], ['Mumbai', '240'], ['Pune', '90']] };
  var h = DC.render(spec);
  ok('4 three data rows', count(h, '<tr>') === 4); /* 1 head + 3 body */
  ok('4 numeric cells right-aligned', h.indexOf('class="num"') !== -1);
  ok('4 values present', ['120', '240', '90'].every(function (v) { return h.indexOf(v) !== -1; }));
})();

/* ── 5. XSS-safety: a hostile label is escaped, never injected ── */
(function () {
  var h = DC.render({ kind: 'bar', title: '<script>x</script>', labels: ['<b>A</b>', 'B', 'C', 'D'], values: [1, 2, 3, 4] });
  ok('5 script tag escaped', h.indexOf('<script>') === -1 && h.indexOf('&lt;script&gt;') !== -1);
  ok('5 label html escaped', h.indexOf('<b>A</b>') === -1 && h.indexOf('&lt;b&gt;A') !== -1);
})();

/* ── 6. guards: no/unknown kind → empty string ── */
(function () {
  ok('6 null spec → empty', DC.render(null) === '');
  ok('6 unknown kind → empty', DC.render({ kind: 'radar', labels: [], values: [] }) === '');
})();

/* ── 7. describe(): a text summary carrying the data (used to ground AI Explain) ── */
(function () {
  var d = DC.describe({ kind: 'bar', title: 'Sales', unit: '₹ crore', labels: ['A', 'B', 'C', 'D'], values: [120, 80, 150, 90] });
  ok('7 describe carries every value', ['120', '80', '150', '90'].every(function (v) { return d.indexOf(v) !== -1; }));
  ok('7 describe carries labels', d.indexOf('A = 120') !== -1);
  var dt = DC.describe({ kind: 'table', title: 'Loans', columns: ['Branch', 'Loans'], rows: [['Delhi', '120'], ['Pune', '90']] });
  ok('7 describe table lists rows', dt.indexOf('Delhi = 120') !== -1 && dt.indexOf('Pune = 90') !== -1);
  ok('7 describe null → empty', DC.describe(null) === '');
})();

console.log('\ndi-charts.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
