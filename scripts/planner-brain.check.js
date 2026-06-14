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
function appPath(p) { return path.join(__dirname, '..', 'main-app', p); }

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
  complete: function () { return Promise.resolve({ data: { rationale: 'LLM rationale.', encouragement: 'LLM encouragement.' }, usage: { total_tokens: 10 } }); }
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

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('HARNESS ERROR:', e); process.exit(1); });
