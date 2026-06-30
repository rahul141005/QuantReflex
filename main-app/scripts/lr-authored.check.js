/**
 * lr-authored.check.js — validates the AUTHORED LR content subsystem (ADR-079).
 *
 * Authored items are human-written, so the gate is QUALITY + WELL-FORMEDNESS, enforced here so a malformed or
 * mis-keyed item can never reach a student: every item passes the schema validator (answer ∈ options, distinct
 * options, valid topic/subtype/exam/difficulty, no placeholders, length sanity, unique ids); each category has a
 * healthy spread of subtypes and difficulties; and the engine maps every item to a valid drill question and its
 * search surface works. Wired into `npm test`.   node scripts/lr-authored.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var Schema = require(p('data/lr-authored/schema'));
var Engine = require(p('js/lr-authored-engine'));
var BANKS = ['critical', 'statement', 'cause', 'course', 'decision'].map(function (f) { return require(p('data/lr-authored/' + f)); });

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 20) console.error('  ✗ ' + label); } }

console.log('lr-authored.check — authored LR content subsystem (ADR-079)');

/* 1. whole bank passes the schema validator (unique ids across all families) */
var all = [];
BANKS.forEach(function (b) { all = all.concat(b); });
var res = Schema.validateBank(all);
if (!res.ok) res.errors.slice(0, 20).forEach(function (e) { console.error('  ✗ schema: ' + e); });
ok('every authored item is schema-valid (' + res.count + ' items)', res.ok);
ok('a meaningful initial bank exists', res.count >= 50);

/* 2. per-category coverage: a healthy count, ≥2 subtypes (where the family has them), ≥2 difficulties */
Object.keys(Schema.CATEGORIES).forEach(function (cat) {
  var items = all.filter(function (it) { return it.topic === cat; });
  ok(cat + ' has ≥8 items', items.length >= 8);
  var subs = {}, diffs = {};
  items.forEach(function (it) { subs[it.subtype] = 1; diffs[it.difficulty] = 1; });
  var subtypeUniverse = Schema.CATEGORIES[cat].subtypes.length;
  ok(cat + ' covers ≥2 subtypes (or all available)', Object.keys(subs).length >= Math.min(2, subtypeUniverse));
  ok(cat + ' spans ≥2 difficulties', Object.keys(diffs).length >= 2);
});

/* 3. the engine maps every category to valid drill questions, honouring difficulty when available */
Engine.categories().forEach(function (cat) {
  for (var n = 0; n < 120; n++) {
    var q = Engine.generate(cat);
    ok(cat + ' question category', q.category === cat);
    ok(cat + ' options 3–5 distinct', q.options && q.options.length >= 3 && q.options.length <= 5 && new Set(q.options).size === q.options.length);
    ok(cat + ' answer in options', q.options.indexOf(String(q.answer)) !== -1);
    ok(cat + ' subtype has tier', /^(easy|medium|hard):/.test(q.subtype));
    ok(cat + ' carries explanation', typeof q.explanation === 'string' && q.explanation.length >= 30);
    ok(cat + ' carries authored id', typeof q._authoredId === 'string' && q._authoredId.length > 0);
  }
  ['easy', 'medium', 'hard'].forEach(function (d) {
    var pool = Engine.find({ topic: cat, difficulty: d });
    if (pool.length) { var q = Engine.generate(cat, d); ok(cat + '/' + d + ' honoured when available', q.subtype.indexOf(d + ':') === 0); }
  });
});

/* 4. search surface */
ok('find by topic filters correctly', Engine.find({ topic: 'lr-critical' }).every(function (it) { return it.topic === 'lr-critical'; }));
ok('find by exam filters correctly', Engine.find({ exam: 'CAT' }).every(function (it) { return it.exams.indexOf('CAT') !== -1; }) && Engine.find({ exam: 'CAT' }).length > 0);
ok('find by difficulty filters correctly', Engine.find({ difficulty: 'hard' }).every(function (it) { return it.difficulty === 'hard'; }));
ok('engine count matches bank', Engine.count() === res.count);

/* 5. a malformed item is rejected by the validator (negative control) */
var badErrs = Schema.validateItem({ id: 'BAD ID', topic: 'lr-critical', subtype: 'nope', difficulty: 'tough', exams: [], stem: 'short', options: ['a', 'a'], answer: 'z', explanation: 'x', explanationVersion: 0, tags: 'no', reviewStatus: 'meh', meta: 1 });
ok('validator catches a malformed item', badErrs.length >= 6);

console.log('  (authored items: ' + res.count + ')');
console.log('\nlr-authored.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
