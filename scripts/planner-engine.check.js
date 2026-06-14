/**
 * planner-engine.check.js — deterministic logic tests for the QuanAI Planner engine (ADR-046).
 *
 * No Firestore, no LLM, no test framework — just Node + asserts (mirrors the project's deterministic-math
 * doctrine). Run:  node scripts/planner-engine.check.js   (exits non-zero on any failure).
 */
'use strict';

var path = require('path');
var R = function (p) { return require(path.join(__dirname, '..', 'main-app', p)); };
var SYL = R('data/syllabus.js');
var engine = R('services/plannerEngine.js');
var readiness = R('services/readiness.js');
var signals = R('services/signals.js');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function section(name) { console.log('\n' + name); }

var TODAY = new Date().toISOString().slice(0, 10);
function addDays(n) { return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); }

/* ---- mock student contexts ---- */
var coldCtx = { coldStart: true, accuracy: null, totalAttempted: 0, mastery: [], trends: null };
var warmCtx = {
  coldStart: false, accuracy: 0.78, totalAttempted: 26,
  mastery: [
    { cat: 'percentages', acc: 0.82, n: 12, tier: 'strong' },
    { cat: 'multiplication', acc: 0.90, n: 20, tier: 'strong' },
    { cat: 'ratios', acc: 0.55, n: 8, tier: 'weak' },
    { cat: 'area', acc: 0.60, n: 6, tier: 'developing' }
  ],
  trends: {
    accuracy: { d7: 0.80, d30: 0.74, delta: 0.06, direction: 'improving' },
    speed: { recentMsPerQ: 7000, direction: 'faster' },
    consistency: { activeDaysLast14: 9, gapDays: 1, streakHealth: 'strong' }
  }
};

var cat = SYL.getSyllabus('cat_quant');

/* ════════ 1. signals: never "no data" ════════ */
section('1. Signal inference never yields zero / no-data');
cat.topics.forEach(function (t) {
  var r = signals.signalReadiness(t, coldCtx);
  ok(r >= 0.2 && r <= 0.95, 'cold signalReadiness in [0.2,0.95] for ' + t.id + ' got ' + r);
});
ok(signals.globalFallback(coldCtx) === 0.5, 'cold global fallback is neutral 0.5 (never 0)');
ok(signals.globalFallback(warmCtx) > 0.5, 'warm global fallback reflects real accuracy');

/* ════════ 2. readiness in range + exam score always real ════════ */
section('2. Readiness ∈ [0,1] and Exam Readiness is always a real number');
var rmCold = readiness.readinessMap(cat, coldCtx, {});
Object.keys(rmCold).forEach(function (id) { ok(rmCold[id] >= 0 && rmCold[id] <= 1, 'readiness in [0,1] for ' + id); });
var erCold = readiness.examReadinessScore(cat, coldCtx, {}, {});
ok(typeof erCold.score === 'number' && !isNaN(erCold.score) && erCold.score >= 0 && erCold.score <= 100, 'cold exam readiness is a real 0..100 number, got ' + erCold.score);
var erWarm = readiness.examReadinessScore(cat, warmCtx, {}, {});
ok(erWarm.score >= erCold.score, 'warm student scores >= cold student (' + erWarm.score + ' >= ' + erCold.score + ')');

/* ════════ 3. block generation invariants (cold start, 60 min/day, 6 d/wk) ════════ */
section('3. Block invariants — cold start, 60 min/day');
var block = engine.generateBlock({
  syllabus: cat, ctx: coldCtx, topicState: {}, prepLevel: 'scratch',
  dailyMinutes: 60, daysPerWeek: 6, startDate: TODAY, blockIndex: 0,
  examName: 'CAT', examDate: addDays(120), daysRemaining: 120
});
ok(block.days.length === 14, 'block has exactly 14 days, got ' + block.days.length);
var studyDays = block.days.filter(function (d) { return d.kind === 'study'; });
ok(studyDays.length > 0, 'cold start still produces study days (never an empty wall)');

// daily minutes respected
block.days.forEach(function (d) {
  var load = d.tasks.reduce(function (s, t) { return s + t.estMin; }, 0);
  if (d.kind === 'study') ok(load <= 60, 'study day ' + d.date + ' load ' + load + ' <= 60');
});

// prereqs never scheduled before a prereq's first appearance
var firstDayOf = {};
block.days.forEach(function (d, di) { d.tasks.forEach(function (t) { if (firstDayOf[t.topicId] === undefined) firstDayOf[t.topicId] = di; }); });
block.days.forEach(function (d, di) {
  d.tasks.forEach(function (t) {
    var topic = SYL.getTopic('cat_quant', t.topicId);
    if (!topic) return;
    (topic.prereqs || []).forEach(function (p) {
      // prereq must be pre-covered (none here, cold) or have appeared on an EARLIER day
      var preDay = firstDayOf[p];
      ok(preDay !== undefined && preDay < di, t.topicId + ' on day ' + di + ' has prereq ' + p + ' scheduled earlier (preDay=' + preDay + ')');
    });
  });
});

// difficulty + drillable fields well-formed
block.days.forEach(function (d) {
  d.tasks.forEach(function (t) {
    ok(['easy', 'medium', 'hard'].indexOf(t.difficulty) >= 0, 'task difficulty valid for ' + t.topicId);
    ok(t.priority >= 0 && t.priority <= 1, 'task priority in [0,1] for ' + t.topicId);
    ok(typeof t.reason === 'string' && t.reason.length > 0, 'task has explainability reason for ' + t.topicId);
  });
});
ok(block.examReadiness && typeof block.examReadiness.score === 'number', 'block carries an exam readiness snapshot');
ok(block.forecast && typeof block.forecast.sessionsRemaining === 'number', 'block carries a forecast');

/* ════════ 4. forecast monotonic with study time ════════ */
section('4. Forecast — more study time finishes sooner');
var fLow = readiness.completionForecast(cat, {}, { dailyMinutes: 30, daysPerWeek: 6, examDate: addDays(120) });
var fHigh = readiness.completionForecast(cat, {}, { dailyMinutes: 90, daysPerWeek: 6, examDate: addDays(120) });
ok(fHigh.sessionsRemaining <= fLow.sessionsRemaining, 'more minutes/day → fewer or equal sessions remaining');
ok(_ms(fHigh.projectedFinish) <= _ms(fLow.projectedFinish), 'more minutes/day → earlier projected finish');
ok(fHigh.bufferDays >= fLow.bufferDays, 'more minutes/day → larger buffer');
ok(fLow.ifPlusMinutes && fLow.ifPlusMinutes.daysSaved >= 0, 'ifPlusMinutes reports days saved');
function _ms(iso) { return new Date(iso + 'T00:00:00Z').getTime(); }

/* ════════ 5. adaptive days — buffer when behind, mock when ahead ════════ */
section('5. Adaptive buffer / mock days');
var behind = engine.generateBlock({
  syllabus: cat, ctx: coldCtx, topicState: {}, prepLevel: 'scratch',
  dailyMinutes: 20, daysPerWeek: 4, startDate: TODAY, examName: 'CAT', examDate: addDays(15), daysRemaining: 15
});
ok(behind.days.some(function (d) { return d.kind === 'buffer'; }), 'behind schedule inserts a recovery buffer day');

// fully-covered warm + ready student → mock day
var fullCover = {};
cat.topics.forEach(function (t) { fullCover[t.id] = { coveragePct: 0.9, lastStudiedAt: TODAY, nextRevisionDue: addDays(20) }; });
var ahead = engine.generateBlock({
  syllabus: cat, ctx: warmCtx, topicState: fullCover, prepLevel: 'ready',
  dailyMinutes: 90, daysPerWeek: 6, startDate: TODAY, examName: 'CAT', examDate: addDays(120), daysRemaining: 120
});
ok(ahead.days.some(function (d) { return d.kind === 'mock'; }), 'ahead/ready student gets a mock review day');

/* ════════ 6. revision interleaving when topics are due ════════ */
section('6. Revision interleaving');
var dueState = {};
['percentages', 'ratio_proportion', 'averages'].forEach(function (id) {
  dueState[id] = { coveragePct: 0.7, lastStudiedAt: addDays(-30), nextRevisionDue: addDays(-2) };
});
var revBlock = engine.generateBlock({
  syllabus: cat, ctx: warmCtx, topicState: dueState, prepLevel: 'average',
  dailyMinutes: 60, daysPerWeek: 6, startDate: TODAY, examName: 'CAT', examDate: addDays(90), daysRemaining: 90
});
var hasRevise = revBlock.days.some(function (d) { return d.tasks.some(function (t) { return t.kind === 'revise'; }); });
ok(hasRevise, 'due topics produce at least one revision task');

/* ════════ 7. applyCompletion credits coverage + schedules next revision ════════ */
section('7. applyCompletion');
var compRes = engine.applyCompletion({}, cat, { topicId: 'percentages', estMin: 60, kind: 'learn', dateIso: TODAY, result: { accuracy: 0.8 } });
var pState = compRes.patch.percentages;
ok(pState && pState.coveragePct > 0 && pState.coveragePct <= 1, 'completion increments coverage, got ' + (pState && pState.coveragePct));
ok(pState.nextRevisionDue > TODAY, 'completion sets a future revision due date');
ok(typeof pState.masteryEst === 'number', 'drill result folds into mastery estimate');

/* ════════ 8. rebalanceMissed (Smart Catch-up) ════════ */
section('8. Smart Catch-up rebalances missed days');
var simDays = [
  { date: addDays(-1), dow: 1, kind: 'study', tasks: [{ topicId: 'percentages', estMin: 40, done: false }] },
  { date: addDays(0), dow: 2, kind: 'study', tasks: [{ topicId: 'ratio_proportion', estMin: 30, done: false }] },
  { date: addDays(1), dow: 3, kind: 'study', tasks: [{ topicId: 'averages', estMin: 30, done: false }] }
];
var rebalanced = engine.rebalanceMissed(simDays, TODAY, 60);
var missedDay = rebalanced.find(function (d) { return d.date === addDays(-1); });
ok(missedDay.kind === 'missed' && missedDay.tasks.length === 0, 'past all-undone day marked missed and emptied');
var totalTasksAfter = rebalanced.reduce(function (s, d) { return s + d.tasks.length; }, 0);
ok(totalTasksAfter === 3, 'no work lost — all 3 tasks preserved after rebalance, got ' + totalTasksAfter);
var carriedIntoFuture = rebalanced.some(function (d) { return d.date >= TODAY && d.tasks.some(function (t) { return t.topicId === 'percentages'; }); });
ok(carriedIntoFuture, 'the missed percentages task was relocated into a future day');

/* ---- summary ---- */
console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
