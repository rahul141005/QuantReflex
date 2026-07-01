/**
 * learn-content.check.js — validates the Learn Knowledge Engine + all knowledge objects (ADR-069).
 *
 * Loads the REAL registry, schema, search and data modules under node (they're dual-exported) and asserts the whole
 * graph is well-formed: schema-valid topics, registered categories, resolvable related/drill references, a working
 * search index, and correct registry helpers. Wired into `npm test` so content can never ship broken or drift from
 * the schema.  node scripts/learn-content.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }

var KB = require(p('js/knowledge/registry'));
var Schema = require(p('js/knowledge/schema'));
var Search = require(p('js/learn/learn-search'));
var quantTopics = require(p('services/quantTopics'));
var DIEngine = require(p('js/di-engine'));
var LREngine = require(p('js/lr-engine'));
var SUB = require(p('data/subjects'));
var syllabus = require(p('data/syllabus'));
var SYLLABUS_IDS = Object.keys((syllabus && syllabus.TOPICS) || {});  // TOPICS is keyed by topic id

KB._reset();
require(p('data/knowledge/categories'));
require(p('data/knowledge/numbers'));
require(p('data/knowledge/arithmetic'));
require(p('data/knowledge/commercial'));
require(p('data/knowledge/algebra'));   // ADR-083 Phase 3D: Algebra Learn content
require(p('data/knowledge/modern'));
require(p('data/knowledge/mensuration'));
require(p('data/knowledge/di'));   // ADR-074: Data Interpretation Learn content
require(p('data/knowledge/lr'));   // ADR-075: Logical Reasoning Learn content

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }
function eq(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.error('  ✗ ' + label + '\n      got:  ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want)); }
}

console.log('learn-content.check — Learn Knowledge Engine (ADR-069)');

/* ── 1. graph integrity: every topic schema-valid + every related/category reference resolves ── */
(function () {
  var errs = KB.validateAll();
  if (errs.length) errs.forEach(function (e) { console.error('  ✗ integrity: ' + e); });
  ok('1 registry.validateAll() returns no errors', errs.length === 0);
  ok('1 fifty-one topics registered (25 Quant + 6 DI + 20 LR)', KB.count() === 51);
})();

/* ── 2. drillCategory + syllabusTopicId references are valid (cross-file) ── */
(function () {
  var drillKeys = quantTopics.CATEGORY_LABELS;            // Quant drill categories
  var diKeys = {}; DIEngine.categories().forEach(function (c) { diKeys[c] = 1; });  // ADR-074: DI drill categories
  /* ADR-079: LR drill categories come from ALL LR-providing engines — core + sets + authored + visual. */
  var lrKeys = {}; require(p('data/subjects')).subjectToCategories('lr').forEach(function (c) { lrKeys[c] = 1; });
  KB.all().forEach(function (t) {
    if (t.drillCategory != null) ok('2 ' + t.id + ' drillCategory "' + t.drillCategory + '" is a known drill category', !!drillKeys[t.drillCategory] || !!diKeys[t.drillCategory] || !!lrKeys[t.drillCategory]);
    if (t.syllabusTopicId != null) ok('2 ' + t.id + ' syllabusTopicId "' + t.syllabusTopicId + '" exists in data/syllabus', SYLLABUS_IDS.indexOf(t.syllabusTopicId) !== -1);
  });
})();

/* ── 3. categories(): all seven with correct live counts + order (5 Quant + DI + LR) ── */
(function () {
  var cats = KB.categories();
  var byId = {}; cats.forEach(function (c) { byId[c.id] = c; });
  ['numbers', 'arithmetic', 'commercial-math', 'modern-math', 'mensuration', 'di-charts', 'lr-reasoning'].forEach(function (id) { ok('3 ' + id + ' registered', !!byId[id]); });
  eq('3 numbers topicCount', byId.numbers && byId.numbers.topicCount, 3);
  eq('3 arithmetic topicCount', byId.arithmetic && byId.arithmetic.topicCount, 8);
  eq('3 commercial-math topicCount', byId['commercial-math'] && byId['commercial-math'].topicCount, 4);
  eq('3 modern-math topicCount', byId['modern-math'] && byId['modern-math'].topicCount, 2);
  eq('3 mensuration topicCount', byId.mensuration && byId.mensuration.topicCount, 2);
  eq('3 di-charts topicCount', byId['di-charts'] && byId['di-charts'].topicCount, 6);
  eq('3 lr-reasoning topicCount', byId['lr-reasoning'] && byId['lr-reasoning'].topicCount, 20);
  eq('3 published gold-standard count = 51', KB.all().filter(function (t) { return t.status === 'published'; }).length, 51);
  var order = cats.map(function (c) { return c.id; });
  ok('3 category order quant…<di-charts<lr-reasoning',
    order.indexOf('mensuration') < order.indexOf('di-charts') && order.indexOf('di-charts') < order.indexOf('lr-reasoning'));
})();

/* ── 3b. every Learn category declares a known subject; subject helpers roll up correctly (ADR-073/074/075) ── */
(function () {
  var known = {}; SUB.subjects().forEach(function (s) { known[s.id] = 1; });
  KB.categories().forEach(function (c) { ok('3b ' + c.id + ' declares a known subject', !!c.subject && !!known[c.subject]); });
  eq('3b categoriesBySubject(quant) = the six Quant categories in order', KB.categoriesBySubject('quant'),
    ['numbers', 'arithmetic', 'commercial-math', 'algebra', 'modern-math', 'mensuration']);
  eq('3b bySubject(quant) covers all 25 Quant topics', KB.bySubject('quant').length, 25);
  eq('3b categoriesBySubject(di) = [di-charts]', KB.categoriesBySubject('di'), ['di-charts']);
  eq('3b bySubject(di) covers all 6 DI topics', KB.bySubject('di').length, 6);
  eq('3b categoriesBySubject(lr) = [lr-reasoning]', KB.categoriesBySubject('lr'), ['lr-reasoning']);
  eq('3b bySubject(lr) covers all 20 LR topics', KB.bySubject('lr').length, 20);
})();

/* ── 4. byCategory / related / siblings helpers ── */
(function () {
  ok('4 byCategory(arithmetic) has percentages', KB.byCategory('arithmetic').some(function (t) { return t.id === 'percentages'; }));
  var rel = KB.related('percentages').map(function (t) { return t.id; });
  ok('4 related(percentages) includes profit-loss (cross-category)', rel.indexOf('profit-loss') !== -1);
  ok('4 related excludes self + dupes', rel.indexOf('percentages') === -1);
  var sib = KB.siblings('percentages');
  ok('4 siblings(percentages).next = ratio-proportion', sib.next && sib.next.id === 'ratio-proportion');
  ok('4 siblings(first).prev is null', KB.siblings(KB.byCategory('arithmetic')[0].id).prev === null);
  ok('4 commercial-math siblings chain (profit-loss → simple-interest)', KB.siblings('profit-loss').next && KB.siblings('profit-loss').next.id === 'simple-interest');
})();

/* ── 5. search: finds topics by word, symbol, and synonym; ranks the right topic first ── */
(function () {
  Search.build();
  function top(q) { var r = Search.query(q); return r.length ? r[0].id : null; }
  eq('5 "percent" → percentages', top('percent'), 'percentages');
  eq('5 symbol "%" → percentages', top('%'), 'percentages');
  eq('5 "discount" (synonym) → profit-loss', top('discount'), 'profit-loss');
  eq('5 "relative speed" → time-speed-distance', top('relative speed'), 'time-speed-distance');
  /* ADR-082: common exam abbreviations / aliases resolve to the right chapter */
  eq('5 abbr "p&c" → permutation-combination', top('p&c'), 'permutation-combination');
  eq('5 abbr "tsd" → time-speed-distance', top('tsd'), 'time-speed-distance');
  ok('5 "family tree" finds lr-blood-relations', Search.query('family tree').some(function (r) { return r.id === 'lr-blood-relations'; }));
  ok('5 "progression" finds number-series', Search.query('progression').some(function (r) { return r.id === 'number-series'; }));
  ok('5 "cone" finds volume', Search.query('cone').some(function (r) { return r.id === 'volume'; }));
  eq('5 empty query → no results', Search.query('   ').length, 0);
  eq('5 nonsense → no results', Search.query('zzxqq').length, 0);
})();

/* ── 6. schema negative tests (a malformed topic is rejected) ── */
(function () {
  ok('6 missing id rejected', Schema.validateTopic({ title: 'X', category: 'arithmetic', difficulty: 'core', examFrequency: 'high', status: 'published', sections: [{ type: 'overview', text: 'hi' }] }).length > 0);
  ok('6 bad difficulty rejected', Schema.validateTopic({ id: 'x', title: 'X', category: 'arithmetic', difficulty: 'impossible', examFrequency: 'high', status: 'published', sections: [{ type: 'overview', text: 'hi' }] }).length > 0);
  ok('6 unknown block type rejected', Schema.validateBlock({ type: 'video', src: 'x' }, 'w').length > 0);
  ok('6 formula item without expr rejected', Schema.validateBlock({ type: 'formula', items: [{ name: 'a' }] }, 'w').length > 0);
  ok('6 published topic with no sections rejected', Schema.validateTopic({ id: 'x', title: 'X', category: 'arithmetic', difficulty: 'core', examFrequency: 'high', status: 'published', sections: [] }).length > 0);
  ok('6 scaffold topic with no sections allowed', Schema.validateTopic({ id: 'x', title: 'X', category: 'arithmetic', difficulty: 'core', examFrequency: 'high', status: 'scaffold', sections: [] }).length === 0);
  ok('6 valid block accepted', Schema.validateBlock({ type: 'table', headers: ['a'], rows: [['1']] }, 'w').length === 0);
})();

/* ── 7. gold-standard depth: every PUBLISHED topic is rich, not a thin stub (enforces "no filler") ── */
(function () {
  KB.all().filter(function (t) { return t.status === 'published'; }).forEach(function (t) {
    var types = (t.sections || []).map(function (s) { return s.type; });
    ok('7 ' + t.id + ' has ≥6 sections', (t.sections || []).length >= 6);
    ok('7 ' + t.id + ' has an overview', types.indexOf('overview') !== -1);
    ok('7 ' + t.id + ' has a formula block', types.indexOf('formula') !== -1);
    ok('7 ' + t.id + ' has a worked example', types.indexOf('example') !== -1);
    ok('7 ' + t.id + ' has a revision block', types.indexOf('revision') !== -1);
    ok('7 ' + t.id + ' has traps and/or tricks', types.indexOf('trap') !== -1 || types.indexOf('trick') !== -1);
    ok('7 ' + t.id + ' has searchTerms', (t.searchTerms || []).length >= 3);
  });
})();

/* ── 8. registry surfaces duplicate topic ids instead of silently overwriting (run last — resets the registry) ── */
(function () {
  KB._reset();
  KB.registerCategory({ id: 'tmp', title: 'Tmp' });
  KB.registerAll('tmp', [
    { id: 'dup', title: 'A', category: 'tmp', difficulty: 'core', examFrequency: 'high', status: 'scaffold', sections: [] },
    { id: 'dup', title: 'B', category: 'tmp', difficulty: 'core', examFrequency: 'high', status: 'scaffold', sections: [] }
  ]);
  ok('8 duplicate id is reported by validateAll', KB.validateAll().some(function (e) { return e.indexOf('duplicate topic id "dup"') !== -1; }));
})();

console.log('\nlearn-content.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
