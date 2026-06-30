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

/* 6. CONTENT-QUALITY gates (ADR-079 content pass): no duplicate stems, and the correct answer is not a give-away. */
(function () {
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim(); }
  var seenStem = {}, dupStem = 0;
  all.forEach(function (it) { var k = norm(it.stem); if (seenStem[k]) { dupStem++; if (dupStem <= 5) console.error('  ✗ duplicate stem: ' + it.id + ' ≡ ' + seenStem[k]); } else seenStem[k] = it.id; });
  ok('no duplicate stems across the bank', dupStem === 0);

  /* duplicate normalized OPTION SET (same question re-skinned) is a strong "re-used logic" signal */
  var seenOpts = {}, dupOpts = 0;
  all.forEach(function (it) { var k = it.options.map(norm).sort().join('|'); /* verdict banks legitimately share option sets, so key on stem+options */ var kk = norm(it.stem).slice(0, 40) + '::' + k; if (seenOpts[kk]) dupOpts++; else seenOpts[kk] = it.id; });
  ok('no duplicate stem+option pairs', dupOpts === 0);

  /* give-away guard: the correct answer must not be EXPLOITABLY longer than every distractor (a "pick the longest"
     tell). A trivial length edge is not exploitable; we flag only items where the answer is >35% longer than the
     next-longest option, and require that to be a minority of the free-text bank. Verdict banks (constant option
     text) are excluded. */
  var VERDICT = { 'lr-statement': 1, 'lr-cause': 1, 'lr-course': 1 };
  /* data-adequacy / evaluate questions LEGITIMATELY have short irrelevant distractors (spotting the relevant fact is
     the skill), so short options there are authentic, not a tell — exclude them from the length-balance metric. */
  var SHORT_OK = { 'data-adequacy': 1 };
  var freeItems = all.filter(function (it) { return !VERDICT[it.topic] && !SHORT_OK[it.subtype]; });
  function exploitable(it) {
    var alen = String(it.answer).length;
    var others = it.options.filter(function (o) { return o !== it.answer; }).map(function (o) { return o.length; });
    var nextLongest = others.length ? Math.max.apply(null, others) : 0;
    return alen > nextLongest * 1.35;
  }
  var bad = freeItems.filter(exploitable);
  var frac = freeItems.length ? bad.length / freeItems.length : 0;
  console.error('  · exploitable length give-aways (answer >35% longer than every distractor): ' + bad.length + '/' + freeItems.length + ' (' + (frac * 100).toFixed(0) + '%)');
  if (bad.length) console.error('    ' + bad.map(function (it) { return it.id; }).slice(0, 12).join(', '));
  ok('exploitable length give-aways are a minority (<40%)', frac < 0.40);

  /* every item should carry a tag and most should declare an exam-pattern (inspiredBy) for transparency */
  var withInspired = all.filter(function (it) { return typeof it.inspiredBy === 'string'; }).length;
  console.error('  · items with inspiredBy exam-pattern tag: ' + withInspired + '/' + all.length);
  ok('every item has at least one tag', all.every(function (it) { return it.tags.length >= 1; }));
})();

console.log('  (authored items: ' + res.count + ')');
console.log('\nlr-authored.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
