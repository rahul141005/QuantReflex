/**
 * subjects.check.js — validates the derived SUBJECT layer (ADR-073, QuantReflex V2).
 *
 * The subject lens sits one notch above the 14 drill categories and is DERIVED, never stored. This check asserts
 * the map is total and consistent: every drill category resolves to exactly one known subject, Quant's category set
 * is the quantTopics key set (no duplicated list), and the helpers are pure/total (unknown inputs → null/[], returned
 * collections are defensive copies). Wired into `npm test` so the foundation can never silently drift.
 *   node scripts/subjects.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }

var SUB = require(p('data/subjects'));
var quantTopics = require(p('services/quantTopics'));
var DIEngine = require(p('js/di-engine'));
var LREngine = require(p('js/lr-engine'));

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }
function eq(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.error('  ✗ ' + label + '\n      got:  ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want)); }
}

console.log('subjects.check — Subject layer (ADR-073)');

/* ── 1. registry: the subjects that have content today (Quant + DI + LR), ordered, with labels ── */
(function () {
  eq('1 subjects registered in order', SUB.subjects().map(function (s) { return s.id; }), ['quant', 'di', 'lr']);
  ok('1 quant has order 1', SUB.subject('quant').order === 1);
  ok('1 di has order 2', SUB.subject('di').order === 2);
  ok('1 lr has order 3', SUB.subject('lr').order === 3);
  ok('1 quant label', SUB.label('quant') === 'Quantitative Aptitude');
  ok('1 di label', SUB.label('di') === 'Data Interpretation');
  ok('1 lr label', SUB.label('lr') === 'Logical Reasoning');
  ok('1 unknown subject label falls back to id', SUB.label('zzz') === 'zzz');
})();

/* ── 2. every one of the 14 drill categories maps to exactly one known subject (none orphaned) ── */
(function () {
  var cats = Object.keys(quantTopics.CATEGORY_LABELS);
  eq('2 fourteen drill categories', cats.length, 14);
  cats.forEach(function (c) { ok('2 ' + c + ' → quant', SUB.categoryToSubject(c) === 'quant'); });
})();

/* ── 3. Quant's category set is DERIVED from quantTopics (single source of truth — no re-typed list) ── */
(function () {
  eq('3 subjectToCategories(quant) = quantTopics keys', SUB.subjectToCategories('quant'), Object.keys(quantTopics.CATEGORY_LABELS));
})();

/* ── 4. helpers are total/pure: unknown inputs return null / [] ── */
(function () {
  ok('4 categoryToSubject(unknown) = null', SUB.categoryToSubject('does-not-exist') === null);
  eq('4 subjectToCategories(unknown) = []', SUB.subjectToCategories('zzz'), []);
  ok('4 subject(unknown) = null', SUB.subject('zzz') === null);
  ok('4 subject(quant) shape', !!SUB.subject('quant') && SUB.subject('quant').id === 'quant');
})();

/* ── 5. returned collections are defensive copies (mutating a result must not corrupt the registry) ── */
(function () {
  var a = SUB.subjectToCategories('quant'); a.push('HACK');
  ok('5 subjectToCategories returns a copy', SUB.subjectToCategories('quant').indexOf('HACK') === -1);
  var s = SUB.subjects(); s[0].id = 'HACK';
  ok('5 subjects() returns copies', SUB.subjects()[0].id === 'quant');
})();

/* ── 6. DI subject (ADR-074): its categories come from di-engine (single source), every DI cat → 'di' ── */
(function () {
  var diCats = DIEngine.categories();
  ok('6 DI has 5 categories', diCats.length === 5);
  eq('6 subjectToCategories(di) = di-engine categories', SUB.subjectToCategories('di'), diCats);
  diCats.forEach(function (c) { ok('6 ' + c + ' → di', SUB.categoryToSubject(c) === 'di'); });
  ok('6 quant and di category sets are disjoint',
    SUB.subjectToCategories('quant').filter(function (c) { return diCats.indexOf(c) !== -1; }).length === 0);
})();

/* ── 7. LR subject (ADR-075): categories from lr-engine, every LR cat → 'lr', disjoint from quant + di ── */
(function () {
  var lrCats = LREngine.categories(), diCats = DIEngine.categories(), qCats = SUB.subjectToCategories('quant');
  ok('7 LR has 7 categories', lrCats.length === 7);
  eq('7 subjectToCategories(lr) = lr-engine categories', SUB.subjectToCategories('lr'), lrCats);
  lrCats.forEach(function (c) { ok('7 ' + c + ' → lr', SUB.categoryToSubject(c) === 'lr'); });
  ok('7 lr disjoint from quant', lrCats.filter(function (c) { return qCats.indexOf(c) !== -1; }).length === 0);
  ok('7 lr disjoint from di', lrCats.filter(function (c) { return diCats.indexOf(c) !== -1; }).length === 0);
})();

console.log('\nsubjects.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
