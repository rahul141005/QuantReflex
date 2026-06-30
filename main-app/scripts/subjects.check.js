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
var statMath = require(p('data/statMath'));

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
  /* ADR-079: LR is served by several engines — generative core (12) + puzzle sets (2) + authored content (5). The
     subject's category set is their union, resolved by data/subjects.js. */
  var LRSet = require(p('js/lr-set-engine')), LRAuth = require(p('js/lr-authored-engine')), LRVis = require(p('js/lr-visual-engine'));
  var lrCats = SUB.subjectToCategories('lr'), diCats = DIEngine.categories(), qCats = SUB.subjectToCategories('quant');
  ok('7 LR core has 12 generative categories', LREngine.categories().length === 12);
  ok('7 LR union = core + sets + authored + visual (25)', lrCats.length === LREngine.categories().length + LRSet.categories().length + LRAuth.categories().length + LRVis.categories().length);
  LREngine.categories().concat(LRSet.categories()).concat(LRAuth.categories()).concat(LRVis.categories()).forEach(function (c) { ok('7 ' + c + ' in lr union', lrCats.indexOf(c) !== -1); });
  lrCats.forEach(function (c) { ok('7 ' + c + ' → lr', SUB.categoryToSubject(c) === 'lr'); });
  ok('7 lr disjoint from quant', lrCats.filter(function (c) { return qCats.indexOf(c) !== -1; }).length === 0);
  ok('7 lr disjoint from di', lrCats.filter(function (c) { return diCats.indexOf(c) !== -1; }).length === 0);
})();

/* ── 8. statMath subject rollup (ADR-076, Phase 4): derived per-subject mastery + weakest subject ── */
(function () {
  var subjectCats = {}; SUB.subjects().forEach(function (s) { subjectCats[s.id] = SUB.subjectToCategories(s.id); });
  var stats = { categoryStats: {
    percentages: { attempted: 10, correct: 9 },   // quant → 90%
    'di-bar': { attempted: 8, correct: 3 },        // di → 37.5%
    'lr-syllogism': { attempted: 6, correct: 5 }   // lr → 83%
  } };
  var roll = statMath.subjectRollup(stats, subjectCats);
  ok('8 quant rollup acc', roll.quant && roll.quant.acc === 0.9 && roll.quant.tier === 'strong' && roll.quant.n === 10);
  ok('8 di rollup acc', roll.di && roll.di.acc === 0.38 && roll.di.tier === 'weak' && roll.di.attempted === 8);
  ok('8 lr rollup acc', roll.lr && roll.lr.tier === 'strong');
  ok('8 weakestSubject = di', statMath.weakestSubject(stats, subjectCats) === 'di');
  // thin data (<MIN_ATTEMPTS) → tier null, never a fabricated tier; weakestSubject ignores it
  var thin = { categoryStats: { 'di-pie': { attempted: 2, correct: 0 } } };
  ok('8 thin-data tier is null', statMath.subjectRollup(thin, subjectCats).di.tier === null);
  ok('8 weakestSubject null when no subject has enough data', statMath.weakestSubject(thin, subjectCats) === null);
  // multi-category rollup sums across a subject's categories
  var multi = { categoryStats: { percentages: { attempted: 4, correct: 2 }, ratios: { attempted: 6, correct: 6 } } };
  ok('8 quant sums categories (8/10)', statMath.subjectRollup(multi, subjectCats).quant.attempted === 10 && statMath.subjectRollup(multi, subjectCats).quant.correct === 8);
})();

console.log('\nsubjects.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
