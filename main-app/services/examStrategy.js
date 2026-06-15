/**
 * examStrategy.js — Layer 2 of the decision model (ADR-057): the OPTIONAL exam-strategy layer.
 *
 * Exists only when the student has created an exam. Built FROM the canonical Student Intelligence Profile
 * (Layer 1) + the `aiPlanner/{uid}` doc, it is the SOLE planner: it runs the marks-maximizing strategy engine
 * (planningEngine.buildStrategy — milestones → roadmap) and projects the schedule (scheduleProjector). Coach,
 * Insights and Planner all consume this one object; none invents its own plan. No exam → `build` returns null
 * and the features reason from the Profile alone (they must never feel "dumber").
 *
 *   assemble(profile, planDoc, opts) → strategy | null   (PURE — no IO; unit-testable)
 *   build(uid, profile, opts)        → Promise<strategy|null>   (reads aiPlanner/{uid}, then assemble)
 *   serialize(strategy)              → string for the LLM prompts
 */
'use strict';
var SYL = require('../data/syllabus');
var readiness = require('./readiness');
var planningEngine = require('./planningEngine');
var projector = require('./scheduleProjector');
var aiMath = require('./aiMath');

var DAY = 86400000;
// default target score by prep confidence when the student hasn't set one explicitly
var PREP_TARGET = { scratch: 65, basics: 70, half: 75, revision: 82, confident: 88 };

function _todayIso(clientDate) {
  var d = clientDate ? new Date(clientDate) : new Date(); if (isNaN(d.getTime())) d = new Date();
  return d.getFullYear() + '-' + _p(d.getMonth() + 1) + '-' + _p(d.getDate());
}
function _p(n) { return (n < 10 ? '0' : '') + n; }
function _daysBetween(fromIso, toIso) {
  var a = new Date(fromIso + 'T00:00:00').getTime(), b = new Date(toIso + 'T00:00:00').getTime();
  if (isNaN(a) || isNaN(b)) return null; return Math.round((b - a) / DAY);
}

/* ── exam-progress signals read off the planner doc (Layer-2 state) ── */
function _adherencePct(doc) {
  var sched = 0, done = 0;
  ((doc.block && doc.block.days) || []).forEach(function (d) {
    (d.tasks || []).forEach(function (t) { sched++; if (t.done) done++; });
  });
  (doc.blockHistory || []).forEach(function (h) { sched += (h.scheduledTasks || 0); done += (h.completedTasks || 0); });
  return sched > 0 ? Math.round((done / sched) * 100) : null;
}
function _completedTopics(doc) {
  var ts = doc.topicState || {}, out = [];
  Object.keys(ts).forEach(function (id) { if ((Number(ts[id].coveragePct) || 0) >= 0.85) out.push(id); });
  return out;
}
function _revisionDue(doc, todayIso) {
  var ts = doc.topicState || {}, out = [];
  Object.keys(ts).forEach(function (id) {
    var due = ts[id].nextRevisionDue;
    if (due && (Number(ts[id].coveragePct) || 0) > 0 && _daysBetween(due, todayIso) >= 0) out.push(id);
  });
  return out;
}
function _mockTrend(doc) {
  var accs = [];
  ((doc.block && doc.block.days) || []).forEach(function (d) {
    (d.tasks || []).forEach(function (t) { if (t.kind === 'mock' && t.result && t.result.accuracy != null) accs.push(t.result.accuracy); });
  });
  if (accs.length < 2) return null;
  var d = accs[accs.length - 1] - accs[0];
  return d > 0.05 ? 'improving' : d < -0.05 ? 'declining' : 'flat';
}

/** PURE — assemble the full strategy from the Profile + planner doc. Returns null when there is no exam. */
function assemble(profile, planDoc, opts) {
  opts = opts || {};
  if (!planDoc || !(planDoc.examId || planDoc.examName) || !planDoc.syllabusId) return null;
  var syl = SYL.resolveSyllabus(planDoc.syllabusId) || SYL.resolveSyllabus(planDoc.examId);
  if (!syl || !syl.topics || !syl.topics.length) return null;

  var todayIso = _todayIso(opts.clientDate);
  var topicState = planDoc.topicState || {};
  var dailyMinutes = Number(planDoc.dailyMinutes) || 45;
  var daysPerWeek = Number(planDoc.daysPerWeek) || 6;
  var daysToExam = planDoc.examDate ? Math.max(0, _daysBetween(todayIso, planDoc.examDate)) : null;
  var targetScore = Number(planDoc.targetScore) || PREP_TARGET[planDoc.prepLevel] || 75;

  var rmap = readiness.readinessMap(syl, profile, topicState);
  var readinessScore = (readiness.examReadinessScore(syl, profile, topicState, _blockStats(planDoc)) || {}).score || 0;

  // Behavioural signals come from the canonical Profile (the Strategy reads the one evolving picture — it never
  // receives messages from Coach/Insights). Exam-progress signals come from the doc.
  var flags = (profile && profile.flags) || {};
  var revisionDue = _revisionDue(planDoc, todayIso);
  var signals = {
    burnout: !!flags.burnout,
    retentionRisk: revisionDue.length >= 2 || !!flags.plateau,
    recentRegressionTopics: (profile && profile.recentRegressionTopics) || [],
    mockTrend: _mockTrend(planDoc)
  };

  var strategy = planningEngine.buildStrategy({
    syllabus: syl, examName: planDoc.examName || planDoc.examLabel || 'your exam',
    daysToExam: daysToExam, dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, targetScore: targetScore,
    readiness: rmap, readinessScore: readinessScore, signals: signals
  });

  // The schedule is a pure PROJECTION of the strategy's roadmap (no planning logic of its own). The planner
  // endpoints persist this projection as the block (carrying completion state); the live strategy re-derives the
  // reasoning (milestones/readiness/recovery) on every read, and _nextTask applies recovery overrides on top.
  strategy.schedule = projector.project(strategy.roadmap, {
    startDate: todayIso, horizonDays: 14, dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, workload: strategy.workload
  });

  // Exam-progress the roles reason WITH.
  var forecast = readiness.completionForecast(syl, topicState, { dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, examDate: planDoc.examDate, todayIso: todayIso });
  var activeMilestone = (strategy.milestones || []).filter(function (m) { return m.status === 'active'; })[0] || null;
  strategy.progress = {
    adherencePct: _adherencePct(planDoc),
    completedTopics: _completedTopics(planDoc),
    revisionDue: revisionDue,
    mockTrend: signals.mockTrend,
    nextObjective: activeMilestone ? activeMilestone.name : null,
    onTrack: forecast ? forecast.onTrack : null,
    bufferDays: forecast ? forecast.bufferDays : null,
    forecast: forecast
  };
  strategy.signals = signals;
  strategy.examDate = planDoc.examDate || null;
  return strategy;
}

function _blockStats(doc) {
  var sched = 0, done = 0, revDue = 0, revOk = 0;
  ((doc.block && doc.block.days) || []).forEach(function (d) {
    (d.tasks || []).forEach(function (t) { sched++; if (t.done) done++; if (t.kind === 'revise') { revDue++; if (t.done) revOk++; } });
  });
  return { scheduledTasks: sched, completedTasks: done, revisionsDue: revDue, revisionsOnTime: revOk };
}

/** Read aiPlanner/{uid} then assemble. Returns null when there is no exam. */
async function build(uid, profile, opts) {
  opts = opts || {};
  var admin;
  try { admin = require('firebase-admin'); } catch (_) { return null; }
  try {
    var snap = await admin.firestore().collection('aiPlanner').doc(uid).get();
    if (!snap.exists) return null;
    return assemble(profile, snap.data() || null, opts);
  } catch (e) { console.warn('[examStrategy] read failed:', e && e.message); return null; }
}

/** AI-facing strategy summary for the prompts — the roles reason WITH this, not just read it. */
function serialize(strategy) {
  if (!strategy) return '';
  var L = [];
  L.push('EXAM STRATEGY (' + strategy.examName + (strategy.daysToExam != null ? ', ' + strategy.daysToExam + ' days out' : '') +
    '): readiness ' + strategy.readinessScore + '/100, projected ' + strategy.projectedScore + '/100, target ' + strategy.targetScore +
    ' → ' + (strategy.achievable ? 'on track' : 'not yet on track') + '.');
  L.push('VERDICT: ' + strategy.verdict);
  var active = (strategy.milestones || []).filter(function (m) { return m.status === 'active'; })[0];
  if (active) L.push('CURRENT OBJECTIVE: ' + active.name + ' — ' + active.objective);
  L.push('PLAN ORDER (next): ' + (strategy.focus || []).slice(0, 3).map(function (t) { return t.label; }).join(' → ') + '.');
  var pr = strategy.progress || {};
  if (pr.adherencePct != null) L.push('You\'ve completed ' + pr.adherencePct + '% of planned work.' +
    (pr.onTrack === false ? ' You are BEHIND the plan — reinforce catching up.' : pr.bufferDays > 3 ? ' You are AHEAD — revision could start early.' : ''));
  if (pr.revisionDue && pr.revisionDue.length) L.push(pr.revisionDue.length + ' topic(s) are due for revision — a milestone you should not skip.');
  if (strategy.recovery) L.push('RECOVERY: recent analytics dropped on ' + strategy.recovery.topics.map(function (t) { return t.label; }).join(', ') +
    ' — recommend a short recovery session BEFORE the next planned topic, even though the plan order says otherwise.');
  if (strategy.skip && strategy.skip.length) L.push('Triaged out (too little time for the marks): ' + strategy.skip.slice(0, 3).map(function (t) { return t.label; }).join(', ') + '.');
  L.push('Reason WITH this plan: if recent analytics conflict with the plan order, recommend the recovery/adjustment and say why.');
  return L.join(' ');
}

module.exports = { assemble: assemble, build: build, serialize: serialize };
