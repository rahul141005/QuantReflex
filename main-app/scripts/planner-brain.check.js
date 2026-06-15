/**
 * planner-brain.check.js — wiring smoke test for the QuanAI Planner orchestration (ADR-046).
 *
 * Stubs firebase-admin (in-memory store), llmProvider, and aiService BEFORE requiring aiBrain, so the
 * setup → toggle → regen flow runs without network/Firestore. Asserts the aiPlanner doc shape, the
 * clientStats accuracy-floor fix, coverage crediting, and block regeneration.
 *
 * Run:  node scripts/planner-brain.check.js   (exits non-zero on failure).
 */
'use strict';
var path = require('path');
function appPath(p) { return path.join(__dirname, '..', p); }

/* ---- in-memory firestore stub ---- */
var store = {};
function emptyQuery() { return { orderBy: function () { return this; }, limit: function () { return this; }, select: function () { return this; }, get: function () { return Promise.resolve({ forEach: function () {} }); } }; }
function docRef(col, id) {
  return {
    get: function () { return Promise.resolve({ exists: !!(store[col] && store[col][id] !== undefined), data: function () { return store[col] && store[col][id]; } }); },
    set: function (d, opts) { store[col] = store[col] || {}; store[col][id] = (opts && opts.merge) ? Object.assign({}, store[col][id], d) : d; return Promise.resolve(); },
    select: function () { return this; },
    collection: function () { return emptyQuery(); }
  };
}
var adminStub = {
  apps: [{}], initializeApp: function () {}, credential: { cert: function () {} },
  firestore: function () { return { collection: function (c) { return { doc: function (id) { return docRef(c, id); } }; } }; }
};
adminStub.firestore.FieldValue = { serverTimestamp: function () { return 'TS'; } };

var llmStub = {
  wrapData: function (s) { return String(s); },
  // Superset of every prose field the prompts ask for, so each feature picks what it needs (ADR-050).
  complete: function () { return Promise.resolve({ data: {
    rationale: 'LLM rationale.', encouragement: 'LLM encouragement.',
    greeting: 'Welcome back, Sam.', biggestWin: 'You aced Percentages.', oneWorry: 'Speed is slipping on Geometry.',
    todayRecommendation: 'Drill Geometry for 8 minutes.', motivation: 'You\'re closer than you think.', missionWhy: 'Highest-impact topic.', celebrate: 'Nice streak!',
    patternsIntro: 'I found a few things worth your attention.', headline: 'Geometry is your biggest lever.',
    weaknessInsight: 'Geometry accuracy is dragging your score.', nextStepLabel: 'What first?'
  }, usage: { total_tokens: 10 } }); }
};
var aiServiceStub = { updateMemory: function () {}, trackGptCost: function () {}, trackGlobalAIUsage: function () { return Promise.resolve(); } };

// Intercept module loading (firebase-admin isn't installed in this repo; the deps live under main-app).
var Module = require('module');
var origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-admin') return adminStub;
  if (request === './llmProvider') return llmStub;
  if (request === './aiService') return aiServiceStub;
  return origLoad.apply(this, arguments);
};

var aiBrain = require(appPath('services/aiBrain'));

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var UID = 'u1';
var todayKey = new Date().toISOString().slice(0, 10);
// A live local session the server doc doesn't know about yet — the accuracy-bug scenario (26 Q @ ~77%).
var clientStats = {
  totalAttempted: 26, totalCorrect: 20, todayAttempted: 26, todayCorrect: 20, dailyStreak: 3,
  categoryStats: { percentages: { attempted: 12, correct: 10 }, multiplication: { attempted: 14, correct: 13 } },
  dailyHistory: {}
};
clientStats.dailyHistory[todayKey] = { attempted: 26, correct: 20, sumTimes: 26 * 7000, count: 26 };

(async function () {
  console.log('QuanAI Planner brain wiring\n');

  /* setup */
  var setup = await aiBrain.plannerSetup(UID, {
    examId: 'cat', examDate: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10),
    dailyMinutes: 60, daysPerWeek: 6, prepLevel: 'average', preferredTime: 'evening', goal: '99 percentile'
  }, { clientStats: clientStats });

  ok(setup.plan && setup.plan.v === 2, 'setup returns a v2 plan doc');
  ok(setup.plan.syllabusId === 'cat_quant', 'setup resolves CAT → cat_quant syllabus');
  ok(setup.plan.block && setup.plan.block.days.length === 14, 'setup builds a 14-day block');
  ok(setup.plan.readiness && typeof setup.plan.readiness.score === 'number', 'setup carries a readiness score');
  ok(setup.plan.forecast && setup.plan.forecast.sessionsRemaining > 0, 'setup carries a forecast');
  ok(setup.envelope && setup.envelope.feature === 'planner', 'setup returns a planner envelope');
  // accuracy-bug fix: client floor lifted us out of cold-start, so the readiness reflects real data (not 0)
  ok(setup.plan.readiness.score > 0, 'accuracy floor applied — readiness is non-zero from the live session');
  ok(store.aiPlanner && store.aiPlanner[UID], 'plan persisted to aiPlanner/{uid}');

  /* find a drillable study task today (or any day) to toggle */
  var targetDay = null, targetTask = null;
  setup.plan.block.days.forEach(function (d) {
    (d.tasks || []).forEach(function (t) { if (!targetTask && t.kind === 'learn') { targetDay = d.date; targetTask = t; } });
  });
  ok(targetTask, 'block contains a learn task to complete');

  var beforeCov = (setup.plan.topicState[targetTask.topicId] || {}).coveragePct || 0;
  var tog = await aiBrain.plannerToggle(UID, { date: targetDay, topicId: targetTask.topicId, done: true, result: { accuracy: 0.8 } }, { clientStats: clientStats });
  ok(tog.plan, 'toggle returns the updated plan');
  var afterCov = (tog.plan.topicState[targetTask.topicId] || {}).coveragePct || 0;
  ok(afterCov > beforeCov, 'completing a task credits coverage (' + beforeCov.toFixed(3) + ' → ' + afterCov.toFixed(3) + ')');
  var togTask = tog.plan.block.days.find(function (d) { return d.date === targetDay; }).tasks.find(function (t) { return t.topicId === targetTask.topicId; });
  ok(togTask.done === true && togTask.completedAt, 'toggled task marked done with a timestamp');
  ok(tog.plan.readiness && typeof tog.plan.readiness.score === 'number', 'toggle recomputes readiness');

  /* regen — archive current block, build the next */
  var oldIndex = tog.plan.block.index;
  var regen = await aiBrain.plannerRegenBlock(UID, { clientStats: clientStats });
  ok(regen.plan && regen.plan.block.index === oldIndex + 1, 'regen increments the block index');
  ok(regen.plan.blockHistory && regen.plan.blockHistory.length === 1, 'regen archives the prior block to history');
  ok(regen.plan.block.days.length === 14, 'regen builds a fresh 14-day block');

  /* get */
  var got = await aiBrain.plannerGet(UID);
  ok(got.plan && got.plan.block.index === oldIndex + 1, 'get returns the latest persisted plan');

  /* auto Smart Catch-up on load: inject a fully-missed past day, then plannerGet should rebalance it */
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  store.aiPlanner[UID].block.days.unshift({ date: yesterday, dow: 1, kind: 'study', tasks: [{ topicId: 'percentages', label: 'Percentages', estMin: 30, done: false, kind: 'learn', drillable: 'percentages' }] });
  var afterLoad = await aiBrain.plannerGet(UID);
  var pastDay = afterLoad.plan.block.days.find(function (d) { return d.date === yesterday; });
  ok(pastDay && pastDay.kind === 'missed' && pastDay.tasks.length === 0, 'plannerGet auto-marks a fully-missed past day');
  var carried = afterLoad.plan.block.days.some(function (d) { return d.date >= todayKey && d.tasks.some(function (t) { return t.topicId === 'percentages'; }); });
  ok(carried, 'plannerGet auto-carries the missed task into an upcoming day');

  /* ADR-047 R1: the live 'today' count-signal + coach-don't-gate two-gate (regression the merge dropped) */
  var ctxEngine = require(appPath('services/studentContext'));
  var freshGrind = { totalAttempted: 5, totalCorrect: 4, todayAttempted: 26, todayCorrect: 20, dailyStreak: 1, categoryStats: {}, dailyHistory: {} };
  freshGrind.dailyHistory[new Date().toDateString()] = { attempted: 26, correct: 20, sumTimes: 26 * 7000, count: 26 };
  var freshCtx = await ctxEngine.buildContext('u-fresh', { force: true, clientStats: freshGrind });
  ok(freshCtx.today && freshCtx.today.attempted === 26, 'ctx.today.attempted reflects the live 26-question session (was undefined after the merge)');
  ok(freshCtx.today && freshCtx.today.accuracy != null, 'ctx.today.accuracy is populated from the live session');
  ok(freshCtx.coldStart === false, 'a fresh grind (5 lifetime, 26 today) is coached, not gated — two-gate cold-start');

  /* ADR-048: Coach honors the clientStats floor end-to-end (no longer planner-only) */
  var coachEnv = await aiBrain.coachToday('u-fresh2', { force: true, clientStats: freshGrind });
  ok(coachEnv && coachEnv.meta && coachEnv.meta.coldStart !== true, 'coachToday honors the clientStats floor — a fresh grind is coached, not cold-gated');

  /* ADR-049: clientDate anchors the block to the student's LOCAL today (not UTC) */
  var setupTz = await aiBrain.plannerSetup('u-tz', {
    examId: 'cat', examDate: '2099-06-30', dailyMinutes: 60, daysPerWeek: 6, prepLevel: 'average'
  }, { clientStats: clientStats, clientDate: '2099-01-15' });
  ok(setupTz.plan && setupTz.plan.block.days[0].date === '2099-01-15', 'plannerSetup anchors day-0 to the passed clientDate (local today), not UTC');

  /* ADR-049: Coach bypasses a stale cold aiDaily envelope when clientStats proves activity */
  var coldEnv = { feature: 'coach', blocks: [], chips: [], meta: { coldStart: true } };
  store.aiDaily = store.aiDaily || {};
  store.aiDaily['u-fresh2_coach_' + (function () { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })()] = { envelope: coldEnv };
  var coachEnv2 = await aiBrain.coachToday('u-fresh2', { clientStats: freshGrind });
  ok(!(coachEnv2.meta && coachEnv2.meta.coldStart === true), 'coachToday bypasses a stale cold aiDaily envelope when clientStats is present');

  /* ════════ ADR-050: Coach + Insights as living dashboards ════════ */
  function envText(env) {
    var parts = [];
    (env.blocks || []).forEach(function (b) { parts.push(b.text || '', b.title || '', b.body || '', b.why || ''); });
    (env.chips || []).forEach(function (c) { parts.push(c.label || ''); });
    return parts.join(' ');
  }
  var BANNED = /practice to unlock|go practice|run a quick set|warm up|unlock insights/i;

  /* (1) a warm Coach with planner readiness is a multi-section dashboard incl. a ring block.
     u1 has a persisted plan (with readiness) from the setup above; the clientStats floor keeps it warm. */
  var coachWarm = await aiBrain.coachToday(UID, { force: true, clientStats: clientStats });
  ok(coachWarm.blocks && coachWarm.blocks.length >= 6, 'warm Coach renders a multi-section dashboard (>=6 blocks, got ' + (coachWarm.blocks || []).length + ')');
  ok((coachWarm.blocks || []).some(function (b) { return b.type === 'ring'; }), 'warm Coach includes a readiness ring when the planner has a readiness score');
  ok(!BANNED.test(envText(coachWarm)), 'warm Coach never says "go practice / warm up / unlock"');

  /* (2) cold-start = curious onboarding, never "go practice / unlock" (Coach + Insights) */
  var coldStats = { totalAttempted: 0, totalCorrect: 0, todayAttempted: 0, todayCorrect: 0, dailyStreak: 0, categoryStats: {}, dailyHistory: {} };
  var coachCold = await aiBrain.coachToday('u-cold050', { force: true, clientStats: coldStats });
  ok(coachCold.meta && coachCold.meta.coldStart === true, 'a no-data account gets the Coach onboarding (cold-start)');
  ok(!BANNED.test(envText(coachCold)), 'cold Coach onboarding contains no "go practice / unlock" phrasing');
  var insCold = await aiBrain.insights('u-cold050b', { force: true, clientStats: coldStats });
  ok(insCold.meta && insCold.meta.coldStart === true, 'a no-data account gets the Insights onboarding (cold-start)');
  ok(!BANNED.test(envText(insCold)), 'cold Insights onboarding contains no "Practice to unlock insights" phrasing');

  /* (3) behavioural flags become pattern cards (the dead signals Insights now surfaces) */
  ok(aiBrain._detectPatterns({ flags: { careless: true } }).some(function (c) { return /careless|slip/i.test(c.title); }), 'a careless flag produces a "careless slips" pattern card');
  ok(aiBrain._detectPatterns({ flags: { plateau: true } }).some(function (c) { return /plateau/i.test(c.title); }), 'a plateau flag produces a "plateaued" pattern card');
  ok(aiBrain._detectPatterns({ flags: {} }).length === 0, 'no flags → no fabricated patterns');

  /* (4) the Explain→Coach loop: recentTopicsExplained reaches serialize() */
  ok(aiBrain._tier({ totalAttempted: 600 }) === 4 && aiBrain._tier({ totalAttempted: 0 }) === 0, '_tier maps lifetime volume to an experience tier (0..4)');
  store.users = store.users || {};
  store.users['u-mem050'] = { aiMemory: { recentTopicsExplained: ['percentages', 'geometry'], examName: 'CAT' }, stats: freshGrind, plan: 'free' };
  var memCtx = await ctxEngine.buildContext('u-mem050', { force: true, clientStats: freshGrind });
  ok(/Recently asked to explain/.test(ctxEngine.serialize(memCtx)), 'recentTopicsExplained reaches serialize() (Explain→Coach loop closed)');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('HARNESS ERROR:', e); process.exit(1); });
