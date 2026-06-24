/**
 * duel-sim.js — offline correctness simulation of the Duel server scoring + state-machine logic.
 *
 * Exercises the REAL functions exported from api/duel.js (_internals) and the unified generator in js/questions.js,
 * across every duel scenario the audit cared about (honest speed, no fake winner, no-contest, forged-index,
 * string answers, clamped clientMs, accuracy-dominates-speed). No Firestore / network needed.
 *
 * Run:  node scripts/duel-sim.js   (exit 0 = all green)
 */
'use strict';
const path = require('path');
// Stub heavy optional deps that aren't installed locally (the sim only needs the PURE scoring fns from duel.js;
// the middleware → aiService → openai chain loads at require-time but is never exercised here).
const Module = require('module');
const _origLoad = Module._load;
Module._load = function (request) {
  if (request === 'openai') { const F = function () { return {}; }; F.OpenAI = F; return F; }
  return _origLoad.apply(this, arguments);
};
const duel = require(path.join(__dirname, '..', 'api', 'duel.js'));
const Q = require(path.join(__dirname, '..', 'js', 'questions.js'));
const QT = require(path.join(__dirname, '..', 'services', 'quantTopics.js'));
const I = duel._internals;
if (!I) { console.error('FAIL: api/duel.js _internals not exported'); process.exit(1); }
const _grade = I._grade, _decideWinner = I._decideWinner, _budgets = I._budgets, _isCorrect = I._isCorrect, _validConfig = I._validConfig;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  FAIL: ' + name); } }
function eq(name, got, want) { ok(name + '  =>  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want)); }
function key(arr) { return arr.map(function (a, i) { return { index: i, answer: a }; }); }
function ans(map) { return { answers: map }; }

// ───────── 1. _budgets (OFF / per-Q / total) ─────────
console.log('1. _budgets');
eq('off n=10 deadline', _budgets({}, 10).deadlineMs, 10 * 90000 + 15000);
eq('total 120 n=10 deadline', _budgets({ timerTotal: 120 }, 10).deadlineMs, 120 * 1000 + 15000);
eq('perQ 20 n=10 deadline', _budgets({ timerPerQuestion: 20 }, 10).deadlineMs, 20 * 1000 * 10 + 15000);
eq('parMs n=10', _budgets({}, 10).parMs, 10 * 15000);

// ───────── 2. _isCorrect (numeric tolerance + string answers) ─────────
console.log('2. _isCorrect');
ok('numeric exact', _isCorrect('42', '42'));
ok('numeric .0', _isCorrect('42.0', '42'));
ok('string ratio 5:4', _isCorrect('5:4', '5:4'));
ok('string fraction 1/2', _isCorrect('1/2', '1/2'));
ok('decimal tolerance 33.33~33.333', _isCorrect('33.33', '33.333'));
ok('whitespace trimmed', _isCorrect(' 42 ', '42'));
ok('wrong rejected', !_isCorrect('43', '42'));
ok('empty rejected', !_isCorrect('', '42'));
ok('null rejected', !_isCorrect(null, '42'));

// ───────── 3. _grade (honest speed, forged index, clamp, zero) ─────────
console.log('3. _grade');
var k = key([42, '5:4', 7]);
var bud = _budgets({}, 3).deadlineMs;
var g = _grade(ans({ 0: { value: '42', clientMs: 3000 }, 1: { value: '5:4', clientMs: 4000 }, 2: { value: '7', clientMs: 2000 } }), k, 0, 9000, bud);
eq('all correct', g.correctCount, 3);
eq('all answered', g.answeredCount, 3);
eq('honest totalSolveMs = sum clientMs', g.totalSolveMs, 9000);
ok('speed bonus > 0', g.speedBonus > 0);
ok('duelScore = correct*1000 + bonus', g.duelScore === 3000 + g.speedBonus);

g = _grade(ans({ 0: { value: '42', clientMs: 3000 }, 99: { value: '999', clientMs: 1 } }), k, 0, 3000, bud);
eq('forged index ignored (answered)', g.answeredCount, 1);
eq('forged index ignored (correct)', g.correctCount, 1);

g = _grade(ans({ 0: { value: '42', clientMs: 1 } }), k, 0, 1, bud);
eq('clientMs clamped to floor 200', g.totalSolveMs, 200);

g = _grade(ans({}), k, 0, 0, bud);
eq('0 answered: answeredCount', g.answeredCount, 0);
eq('0 answered: totalSolveMs', g.totalSolveMs, 0);
eq('0 answered: speedBonus', g.speedBonus, 0);
eq('0 answered: duelScore', g.duelScore, 0);

g = _grade(ans({ 0: { value: '43', clientMs: 3000 } }), k, 0, 3000, bud);
eq('wrong answer (correct=0)', g.correctCount, 0);
eq('wrong answer (answered=1)', g.answeredCount, 1);

// ───────── 4. _decideWinner ─────────
console.log('4. _decideWinner');
function R(correct, answered, score) { return { correctCount: correct, answeredCount: answered, duelScore: score, totalSolveMs: 1 }; }
eq('accuracy wins (result)', _decideWinner('A', R(3, 3, 3000), 'B', R(2, 3, 2200)).result, 'win');
eq('accuracy wins (winner)', _decideWinner('A', R(3, 3, 3000), 'B', R(2, 3, 2200)).winnerUid, 'A');
eq('speed tiebreak winner', _decideWinner('A', R(2, 3, 2250), 'B', R(2, 3, 2100)).winnerUid, 'A');
eq('both zero => no_contest', _decideWinner('A', R(0, 0, 0), 'B', R(0, 0, 0)).result, 'no_contest');
eq('no_contest => no winner', _decideWinner('A', R(0, 0, 0), 'B', R(0, 0, 0)).winnerUid, null);
eq('exact tie => draw', _decideWinner('A', R(2, 3, 2200), 'B', R(2, 3, 2200)).result, 'draw');
eq('1 correct beats max-speed-0-correct', _decideWinner('A', R(1, 1, 1000), 'B', R(0, 3, 300)).winnerUid, 'A');

// ───────── 5. end-to-end outcomes ─────────
console.log('5. end-to-end outcomes');
function outcome(ansA, ansB, keyArr) {
  var b = _budgets({}, keyArr.length).deadlineMs;
  var ka = key(keyArr);
  return _decideWinner('A', _grade(ansA, ka, 0, 1000, b), 'B', _grade(ansB, ka, 0, 1000, b));
}
var KK = [42, '5:4', 7];
eq('both play, A better => A win', outcome(ans({ 0: { value: '42', clientMs: 2000 }, 1: { value: '5:4', clientMs: 2000 }, 2: { value: '7', clientMs: 2000 } }), ans({ 0: { value: '42', clientMs: 2000 }, 1: { value: 'x', clientMs: 2000 } }), KK).winnerUid, 'A');
eq('asymmetric: A plays, B absent => A win', outcome(ans({ 0: { value: '42', clientMs: 2000 } }), ans({}), KK).winnerUid, 'A');
eq('asymmetric is NOT no_contest', outcome(ans({ 0: { value: '42', clientMs: 2000 } }), ans({}), KK).result, 'win');
eq('neither plays => no_contest', outcome(ans({}), ans({}), KK).result, 'no_contest');
eq('identical play => draw', outcome(ans({ 0: { value: '42', clientMs: 2000 } }), ans({ 0: { value: '42', clientMs: 2000 } }), KK).result, 'draw');

// ───────── 6. _validConfig ─────────
console.log('6. _validConfig');
var c = _validConfig({ questionCount: 999, difficulty: 'hard', topics: ['ratios', 'fractions'], timerTotal: 99999 });
ok('questionCount clamped <= 30', c.questionCount <= 30);
eq('difficulty preserved', c.difficulty, 'hard');
ok('topics preserved', c.topics.length === 2);
eq('bad difficulty => medium', _validConfig({ difficulty: 'banana' }).difficulty, 'medium');

// ───────── 7. generator parity (all cats incl. string-answer) ─────────
console.log('7. generator parity');
var allCats = Object.keys(Q.categoryGenerators);
ok('at least the 12 base categories', allCats.length >= 12);
// every generator must have a human label in the canonical map — guards against silent desync when cats are added
eq('every generator has a CATEGORY_LABELS entry', allCats.filter(function (c) { return !QT.CATEGORY_LABELS[c]; }).length, 0);
var gm = Q.generateMultiTopic(allCats.length, allCats, 'hard');
eq('generateMultiTopic covers every category', gm.length, allCats.length);
ok('every question well-formed', gm.every(function (q) { return typeof q.question === 'string' && q.answer != null && q.category; }));
ok('string-answer cats produce answers', Q.generateMultiTopic(6, ['ratios', 'fractions'], 'hard').every(function (q) { return q.answer != null; }));

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
