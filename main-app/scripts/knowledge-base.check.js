/**
 * knowledge-base.check.js — integrity tests for the canonical Quant Knowledge Base (ADR-059).
 *
 * Guarantees the syllabus data is sound BEFORE any AI feature reasons over it: every exam resolves, every
 * referenced topic exists, dependencies are acyclic and resolvable, drillable maps to a real practice category,
 * weightage/confidence enums are valid, and `unlocks` is the exact reverse of `prereqs`. No Firestore, no LLM.
 *   node scripts/knowledge-base.check.js
 */
'use strict';
var path = require('path');
var SYL = require(path.join(__dirname, '..', 'data', 'syllabus.js'));

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var DRILL_CATS = ['squares', 'cubes', 'area', 'volume', 'fractions', 'percentages', 'multiplication', 'ratios', 'averages', 'profit-loss', 'time-speed-distance', 'time-and-work'];
var BANDS = ['very-high', 'high', 'medium', 'low'];
var CONF = ['high', 'med', 'low'];

console.log('QuantReflex Knowledge Base integrity\n');

var TOPICS = SYL.TOPICS;
ok(Object.keys(TOPICS).length >= 40, 'canonical library has a real topic count (' + Object.keys(TOPICS).length + ')');

/* ---- canonical library integrity ---- */
Object.keys(TOPICS).forEach(function (id) {
  var t = TOPICS[id];
  ok(t.label && t.section && t.difficulty != null && t.avgMinutes > 0, 'topic ' + id + ' has label/section/difficulty/avgMinutes');
  ok(!t.drillable || DRILL_CATS.indexOf(t.drillable) >= 0, 'topic ' + id + ' drillable maps to a real practice category (' + t.drillable + ')');
  (t.prereqs || []).forEach(function (p) { ok(!!TOPICS[p], 'topic ' + id + ' prereq "' + p + '" exists in the library'); });
  (t.signals || []).forEach(function (s) { ok(DRILL_CATS.indexOf(s.cat) >= 0, 'topic ' + id + ' signal cat "' + s.cat + '" is a real practice category'); });
});

/* ---- unlocks is the EXACT reverse of prereqs ---- */
var expectedUnlocks = {}; Object.keys(TOPICS).forEach(function (id) { expectedUnlocks[id] = []; });
Object.keys(TOPICS).forEach(function (id) { (TOPICS[id].prereqs || []).forEach(function (p) { if (expectedUnlocks[p]) expectedUnlocks[p].push(id); }); });
Object.keys(TOPICS).forEach(function (id) {
  var got = (TOPICS[id].unlocks || []).slice().sort().join(','), exp = expectedUnlocks[id].slice().sort().join(',');
  ok(got === exp, 'topic ' + id + ' unlocks == reverse of prereqs');
});

/* ---- no dependency cycles in the library ---- */
var WHITE = 0, GRAY = 1, BLACK = 2, color = {}, cyclic = false;
function dfs(id) {
  color[id] = GRAY;
  (TOPICS[id].prereqs || []).forEach(function (p) {
    if (!TOPICS[p]) return;
    if (color[p] === GRAY) cyclic = true; else if (color[p] !== BLACK) dfs(p);
  });
  color[id] = BLACK;
}
Object.keys(TOPICS).forEach(function (id) { if (color[id] !== BLACK) dfs(id); });
ok(!cyclic, 'the canonical dependency graph is acyclic');

/* ---- every exam resolves to a sound per-exam syllabus ---- */
ok(SYL.EXAMS.length >= 20, 'the catalog covers the full exam roster (' + SYL.EXAMS.length + ')');
SYL.EXAMS.forEach(function (e) {
  var s = SYL.resolveSyllabus(e.id);
  ok(s && s.topics && s.topics.length >= 8, e.id + ' resolves to a non-trivial syllabus (' + (s && s.topics ? s.topics.length : 0) + ' topics)');
  ok(s.id === e.id && s.family === e.family, e.id + ' resolved syllabus carries its exam id + family');
  var ids = {};
  s.topics.forEach(function (t) {
    ok(BANDS.indexOf(t.weightage) >= 0, e.id + '/' + t.id + ' weightage band is valid (' + t.weightage + ')');
    ok(CONF.indexOf(t.confidence) >= 0, e.id + '/' + t.id + ' confidence is valid (' + t.confidence + ')');
    ok(t.importance > 0 && t.importance <= 1 && ['high', 'medium', 'low'].indexOf(t.frequency) >= 0, e.id + '/' + t.id + ' importance+frequency derived');
    ok(typeof t.roi === 'number' && t.roi >= 0 && t.roi <= 10, e.id + '/' + t.id + ' ROI is a 0..10 score (' + t.roi + ')');
    ids[t.id] = 1;
  });
  // prereqs/unlocks pruned to the exam's own selection (engine dependency logic stays clean)
  s.topics.forEach(function (t) {
    (t.prereqs || []).forEach(function (p) { ok(ids[p], e.id + '/' + t.id + ' prereq "' + p + '" is present in this exam'); });
    (t.unlocks || []).forEach(function (u) { ok(ids[u], e.id + '/' + t.id + ' unlock "' + u + '" is present in this exam'); });
  });
});

/* ---- per-exam differentiation is real (not one shared profile) ---- */
ok(SYL.resolveSyllabus('gmat').topics.some(function (t) { return t.id === 'data_sufficiency' && t.weightage === 'very-high'; }), 'GMAT elevates Data Sufficiency (per-exam research applied)');
ok(!SYL.resolveSyllabus('gmat').topics.some(function (t) { return t.id === 'trigonometry'; }), 'GMAT drops Trigonometry');
ok(SYL.resolveSyllabus('nda').topics.some(function (t) { return t.id === 'trigonometry' && t.weightage === 'very-high'; }), 'NDA elevates Trigonometry');
ok(SYL.resolveSyllabus('jee').topics.some(function (t) { return t.id === 'coordinate_geometry' && t.weightage === 'very-high'; }), 'JEE elevates Coordinate Geometry');
ok(SYL.resolveSyllabus('clat').topics.length < SYL.resolveSyllabus('cat').topics.length, 'CLAT is a lighter syllabus than CAT');
ok(SYL.resolveSyllabus('ibpspo').topics.some(function (t) { return t.id === 'simplification' && t.weightage === 'very-high'; }), 'IBPS PO elevates Simplification');

/* ---- legacy resolution still works (old docs stored family keys) ---- */
ok(SYL.getSyllabus('cat_quant') && SYL.getSyllabus('cat_quant').topics.length > 0, 'legacy family key cat_quant still resolves');
ok(SYL.getTopic('cat', 'percentages') && SYL.getTopic('cat', 'percentages').label === 'Percentages', 'getTopic resolves a real topic by exam id');
ok(SYL.getCanonicalTopic('remainders') && SYL.getCanonicalTopic('remainders').commonMistakes.length > 0, 'canonical topics carry rich metadata (common mistakes)');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
