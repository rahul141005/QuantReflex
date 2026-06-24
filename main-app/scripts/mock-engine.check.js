/**
 * mock-engine.check.js — integrity tests for the sectional-timer mock engine (Phase D).
 *
 * Pure: builds mock specs from the canonical syllabus + verified exam patterns and asserts the blueprint is
 * weightage-true and exact, the clock matches the exam, and scoring honours each exam's marking scheme
 * (including no-negative exams). No DOM, no timers, no IO.
 *   node scripts/mock-engine.check.js
 */
'use strict';
var path = require('path');
var MOCK = require(path.join(__dirname, '..', 'js', 'mock-engine.js'));
var SYL = require(path.join(__dirname, '..', 'data', 'syllabus.js'));
var QT = require(path.join(__dirname, '..', 'services', 'quantTopics.js'));

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('QuantReflex mock engine integrity\n');

/* ---- a mock builds for every selectable exam, blueprint is exact + valid ---- */
SYL.EXAMS.filter(function (e) { return !e.hidden; }).forEach(function (e) {
  var m = MOCK.buildMock(e.id);
  ok(m, e.id + ': builds a mock');
  if (!m) return;
  var sum = m.blueprint.reduce(function (a, b) { return a + b.count; }, 0);
  ok(sum === m.totalQuestions, e.id + ': blueprint counts sum to totalQuestions (' + sum + '/' + m.totalQuestions + ')');
  ok(m.durationSec === m.durationMin * 60 && m.durationSec > 0, e.id + ': has a positive section clock');
  ok(m.blueprint.every(function (b) { return QT.CATEGORY_LABELS[b.cat]; }), e.id + ': every blueprint item maps to a real drill category');
  ok(m.totalQuestions > 0 && m.secondsPerQuestion > 0, e.id + ': per-question pace derived');
});

/* ---- the clock + marking come from the exam pattern ---- */
var clerk = MOCK.buildMock('ibpsclerk');
ok(clerk.totalQuestions === 35 && clerk.durationMin === 20, 'IBPS Clerk mock = 35 Q / 20 min (from pattern)');
ok(clerk.negPerWrong === 0.25 && clerk.calculator === 'none' && clerk.sectional === true, 'IBPS Clerk mock carries −0.25 / no-calc / sectional');

var cet = MOCK.buildMock('mbacet');
ok(cet.negPerWrong === 0, 'MBA CET mock is no-negative (from pattern)');

/* ---- weightage-true: a very-high topic gets at least as many questions as a low one ---- */
(function () {
  var m = MOCK.buildMock('ibpsclerk');
  var simp = m.blueprint.filter(function (b) { return b.topicId === 'simplification'; })[0];
  var anyLow = m.blueprint.filter(function (b) { return b.weightage === 'low'; })[0];
  ok(simp && simp.count >= 1, 'IBPS Clerk mock includes Simplification (very-high)');
  if (simp && anyLow) ok(simp.count >= anyLow.count, 'a very-high topic gets ≥ questions than a low one (weightage-true)');
})();

/* ---- scoring honours negative marking ---- */
var sc = MOCK.score(clerk, { correct: 30, wrong: 4 }, { elapsedSec: 1200 });
ok(sc.attempted === 34 && sc.skipped === 1, 'score: attempted/skipped derived (34 attempted, 1 skipped)');
ok(sc.score === 30 - 4 * 0.25, 'score: −0.25 applied (30 − 1.0 = 29)');
ok(Math.abs(sc.accuracy - 30 / 34) < 1e-3, 'score: accuracy = correct/attempted (rounded to 3dp)');
ok(sc.secPerQ === Math.round((1200 / 34) * 10) / 10, 'score: pace = elapsed/attempted');

/* ---- no-negative exam: wrong answers never subtract ---- */
var scCet = MOCK.score(cet, { correct: 40, wrong: 10 });
ok(scCet.score === 40, 'no-negative exam: wrong answers do not reduce the score');

/* ---- array-form responses score identically ---- */
var arr = [];
for (var i = 0; i < 35; i++) arr.push({ answered: i < 34, correct: i < 30 });
var scArr = MOCK.score(clerk, arr);
ok(scArr.correct === 30 && scArr.wrong === 4 && scArr.skipped === 1, 'array-form responses score the same as the summary form');

/* ---- buildMockDeck produces an exact, category-tagged, shuffled deck ---- */
(function () {
  var calls = [];
  var stubGen = function (cat, n) { calls.push(cat); var arr = []; for (var z = 0; z < (n || 1); z++) arr.push({ question: cat + ' q' + z, answer: 1, category: cat }); return arr; };
  var seed = 42, rng = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  var built = MOCK.buildMockDeck('ibpsclerk', stubGen, { rng: rng });
  ok(built && built.deck.length === built.mock.totalQuestions, 'buildMockDeck: deck length === totalQuestions (' + built.deck.length + ')');
  ok(built.deck.every(function (q) { return q.category && q.mockTopicId; }), 'buildMockDeck: every card is category + topic tagged');
  var cats = {}; built.deck.forEach(function (q) { cats[q.category] = (cats[q.category] || 0) + 1; });
  var bp = {}; built.mock.blueprint.forEach(function (b) { bp[b.cat] = (bp[b.cat] || 0) + b.count; });
  ok(Object.keys(bp).every(function (c) { return cats[c] === bp[c]; }), 'buildMockDeck: per-category counts match the blueprint exactly');
})();

/* ---- planner hand-off shape (what examStrategy._mockTrend consumes) ---- */
var pf = MOCK.resultForPlanner(clerk, sc);
ok(pf.kind === 'mock' && pf.result && typeof pf.result.accuracy === 'number', 'resultForPlanner emits a {kind:"mock", result:{accuracy}} task');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
