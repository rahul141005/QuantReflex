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

KB._reset();
require(p('data/knowledge/categories'));
require(p('data/knowledge/arithmetic'));
require(p('data/knowledge/mensuration'));

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
  ok('1 at least 8 topics registered', KB.count() >= 8);
})();

/* ── 2. drillCategory + syllabusTopicId references are valid (cross-file) ── */
(function () {
  var drillKeys = quantTopics.CATEGORY_LABELS;
  KB.all().forEach(function (t) {
    if (t.drillCategory != null) ok('2 ' + t.id + ' drillCategory "' + t.drillCategory + '" exists in quantTopics', !!drillKeys[t.drillCategory]);
    if (t.syllabusTopicId != null) ok('2 ' + t.id + ' syllabusTopicId is a string', typeof t.syllabusTopicId === 'string');
  });
})();

/* ── 3. categories(): arithmetic + mensuration with correct live counts ── */
(function () {
  var cats = KB.categories();
  var byId = {}; cats.forEach(function (c) { byId[c.id] = c; });
  ok('3 arithmetic registered', !!byId.arithmetic);
  ok('3 mensuration registered', !!byId.mensuration);
  eq('3 arithmetic topicCount', byId.arithmetic && byId.arithmetic.topicCount, 6);
  eq('3 mensuration topicCount', byId.mensuration && byId.mensuration.topicCount, 2);
  ok('3 arithmetic ordered before mensuration', cats.map(function (c) { return c.id; }).indexOf('arithmetic') < cats.map(function (c) { return c.id; }).indexOf('mensuration'));
})();

/* ── 4. byCategory / related / siblings helpers ── */
(function () {
  ok('4 byCategory(arithmetic) has percentages', KB.byCategory('arithmetic').some(function (t) { return t.id === 'percentages'; }));
  var rel = KB.related('percentages').map(function (t) { return t.id; });
  ok('4 related(percentages) includes profit-loss', rel.indexOf('profit-loss') !== -1);
  ok('4 related excludes self + dupes', rel.indexOf('percentages') === -1);
  var sib = KB.siblings('percentages');
  ok('4 siblings(percentages).next exists', sib.next && sib.next.id === 'profit-loss');
  ok('4 siblings(first).prev is null', KB.siblings(KB.byCategory('arithmetic')[0].id).prev === null);
})();

/* ── 5. search: finds topics by word, symbol, and synonym; ranks the right topic first ── */
(function () {
  Search.build();
  function top(q) { var r = Search.query(q); return r.length ? r[0].id : null; }
  eq('5 "percent" → percentages', top('percent'), 'percentages');
  eq('5 symbol "%" → percentages', top('%'), 'percentages');
  eq('5 "discount" (synonym) → profit-loss', top('discount'), 'profit-loss');
  eq('5 "relative speed" → time-speed-distance', top('relative speed'), 'time-speed-distance');
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

/* ── 7. registry surfaces duplicate topic ids instead of silently overwriting (run last — resets the registry) ── */
(function () {
  KB._reset();
  KB.registerCategory({ id: 'tmp', title: 'Tmp' });
  KB.registerAll('tmp', [
    { id: 'dup', title: 'A', category: 'tmp', difficulty: 'core', examFrequency: 'high', status: 'scaffold', sections: [] },
    { id: 'dup', title: 'B', category: 'tmp', difficulty: 'core', examFrequency: 'high', status: 'scaffold', sections: [] }
  ]);
  ok('7 duplicate id is reported by validateAll', KB.validateAll().some(function (e) { return e.indexOf('duplicate topic id "dup"') !== -1; }));
})();

console.log('\nlearn-content.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
