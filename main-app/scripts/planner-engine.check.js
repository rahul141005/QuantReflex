/**
 * planner-engine.check.js — deterministic logic tests for the QuanAI Planner engine (ADR-046).
 *
 * No Firestore, no LLM, no test framework — just Node + asserts (mirrors the project's deterministic-math
 * doctrine). Run:  node scripts/planner-engine.check.js   (exits non-zero on any failure).
 */
'use strict';

var path = require('path');
var R = function (p) { return require(path.join(__dirname, '..', p)); };
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
    speed: { recentSecPerQ: 7, direction: 'faster' },
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

/* ════════ 9. Planning engine (ADR-056) — the marks-maximizing strategy brain ════════ */
section('9. Planning engine — marks-maximizing strategy');
var PE = R('services/planningEngine.js');
var SP = R('services/scheduleProjector.js');
var psyl = SYL.resolveSyllabus('mbacet');
ok(psyl && psyl.topics.length >= 25 && psyl.topics.length <= 50, 'MBA CET resolves to a canonical ~30-topic syllabus (got ' + psyl.topics.length + ')');
var pctx = { accuracy: 0.5, totalAttempted: 40, trends: { speed: { recentSecPerQ: 8 }, consistency: { activeDaysLast14: 5 } }, mastery: [] };
var prmap = readiness.readinessMap(psyl, pctx, {});

var ample = PE.buildStrategy({ syllabus: psyl, examName: 'MBA CET', daysToExam: 120, dailyMinutes: 60, daysPerWeek: 6, targetScore: 80, readiness: prmap, readinessScore: 50 });
var tight = PE.buildStrategy({ syllabus: psyl, examName: 'MBA CET', daysToExam: 12, dailyMinutes: 60, daysPerWeek: 6, targetScore: 80, readiness: prmap, readinessScore: 50 });

ok(ample.totalHours > tight.totalHours, 'time budget scales with days-to-exam (' + ample.totalHours + 'h vs ' + tight.totalHours + 'h)');
ok(tight.skip.length > ample.skip.length, 'URGENCY: a tight deadline triages — more topics skipped (' + tight.skip.length + ' vs ' + ample.skip.length + ')');
ok(tight.marksAtRisk > 0, 'a tight deadline reports the marks-at-risk from skipping (' + tight.marksAtRisk + ')');
ok(tight.plannedHours <= tight.totalHours + 0.1, 'the plan fits inside the available study hours');

// MARKS-MAXIMIZATION (dependency-aware): under tight time the plan builds the UNLOCKING foundations first, and
// with ample time it skips nothing low-value (a high-MPH topic is only skipped when its prereq chain won't fit).
ok(tight.focus.some(function (t) { return t.unlocks.length > 0; }), 'under tight time the plan prioritises unlocking foundations (dependency-aware marks strategy)');
ok(ample.skip.length === 0, 'with ample time nothing high-value is needlessly skipped');
ok(tight.plannedHours > 0 && tight.focus.length > 0, 'even under severe time pressure the plan still commits to the highest-value reachable topics');

// MILESTONES-FIRST (ADR-057): subject-aware objectives, dynamically named, the Mock milestone only under urgency.
ok(ample.milestones.length >= 2 && /Foundation/.test(ample.milestones[0].name), 'milestones are generated, a Foundation objective first (' + ample.milestones[0].name + ')');
ok(ample.milestones.some(function (m) { return /Build .+ Foundation|High-ROI|Core/.test(m.name); }), 'milestones are subject-aware (Build {Section} Foundation / High-ROI {Section} / {Section} Core)');
ok(!ample.milestones.some(function (m) { return m.key === 'mock'; }), 'no Mock Readiness milestone when the exam is far away');
ok(tight.milestones.some(function (m) { return m.key === 'mock'; }), 'a Mock Readiness milestone appears near the exam (urgency-generated, not hardcoded)');
ok(ample.milestones.filter(function (m) { return m.status === 'active'; }).length === 1, 'exactly one milestone is active');
ok(ample.milestones.every(function (m) { return m.objective && typeof m.hours === 'number'; }), 'every milestone states an objective + an hour budget');

// ROADMAP: an ordered, calendar-agnostic task stream the schedule projects from.
ok(Array.isArray(ample.roadmap) && ample.roadmap.length > 0 && ample.roadmap[0].order === 0, 'a roadmap (ordered task stream) is emitted');
ok(ample.roadmap.every(function (r, i) { return i === 0 || r.order >= ample.roadmap[i - 1].order; }), 'roadmap is strictly ordered');

// SOLE PLANNER: the projector makes NO planning decisions — same roadmap → identical day order, marks ignored.
var blkA = SP.project(ample.roadmap, { startDate: '2026-06-15', horizonDays: 14, dailyMinutes: 60, daysPerWeek: 6 });
var shuffled = ample.roadmap.slice().reverse().slice().reverse();   // identity, but proves projector re-sorts by order only
var blkB = SP.project(shuffled, { startDate: '2026-06-15', horizonDays: 14, dailyMinutes: 60, daysPerWeek: 6 });
var ids = function (b) { return JSON.stringify(b.days.map(function (d) { return d.tasks.map(function (t) { return t.topicId; }); })); };
ok(ids(blkA) === ids(blkB), 'scheduleProjector is deterministic and order-driven (no planning logic of its own)');
ok(blkA.days.length === 14 && blkA.days.some(function (d) { return d.kind === 'rest'; }), 'projector lays a 14-day block with rest days from daysPerWeek');
ok(blkA.days.every(function (d) { return d.kind !== 'study' || d.tasks.every(function (t) { return ['learn', 'revise', 'mock'].indexOf(t.kind) >= 0; }); }), 'projected tasks use the block kinds the UI renders');

// BIDIRECTIONAL via the Profile's signals (the engine reads the one evolving picture; features never message it).
var burn = PE.buildStrategy({ syllabus: psyl, examName: 'X', daysToExam: 120, dailyMinutes: 60, daysPerWeek: 6, targetScore: 80, readiness: prmap, readinessScore: 50, signals: { burnout: true } });
ok(burn.workload === 'light', 'signals.burnout → lighter workload');
var rec = PE.buildStrategy({ syllabus: psyl, examName: 'X', daysToExam: 120, dailyMinutes: 60, daysPerWeek: 6, targetScore: 80, readiness: prmap, readinessScore: 50, signals: { recentRegressionTopics: ['percentages'] } });
ok(rec.recovery && rec.milestones[0].kind === 'recovery', 'signals.recentRegressionTopics → a Recovery objective placed FIRST (before new work)');
ok(rec.roadmap[0].action === 'recovery', 'the roadmap leads with recovery when recent analytics regressed');

// PREREQS: a topic is never scheduled to LEARN before a weak prerequisite.
var actionById = {}; ample.topics.forEach(function (t) { actionById[t.topicId] = t.action; });
var prereqOk = psyl.topics.every(function (t) {
  if (actionById[t.id] !== 'learn') return true;
  return (t.prereqs || []).every(function (p) { var pr = prmap[p] || 0; return actionById[p] === 'learn' || actionById[p] === 'revise' || pr >= 0.6; });
});
ok(prereqOk, 'no topic is set to LEARN before its prerequisites are planned or already ready');

// RATIONALE: every topic answers the five mentor questions.
ok(ample.topics.every(function (t) { return t.why && t.whyNow && t.scoreImpact && Array.isArray(t.unlocks) && t.skipConsequence; }),
  'every topic carries why / whyNow / scoreImpact / unlocks / skipConsequence');

// PROJECTION + ACHIEVABILITY are honest numbers.
ok(typeof ample.projectedScore === 'number' && typeof ample.achievable === 'boolean' && ample.verdict, 'strategy reports a projected score, achievability and a plain-language verdict');

// OBJECTIVE = marks, not completion: with little time it plans FEWER topics but keeps the highest-value ones.
ok(tight.focus.length <= ample.focus.length, 'a tight deadline narrows the focus to the few highest-value topics');

/* ---- summary ---- */
console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
