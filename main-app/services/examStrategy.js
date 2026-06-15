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
  // ADR-059: resolve by examId (the per-exam researched syllabus); getSyllabus handles legacy/family ids.
  var syl = (planDoc.examId && SYL.resolveSyllabus(planDoc.examId)) || SYL.getSyllabus(planDoc.syllabusId);
  if (!syl || !syl.topics || !syl.topics.length) return null;

  var todayIso = _todayIso(opts.clientDate);
  var topicState = planDoc.topicState || {};
  var dailyMinutes = Number(planDoc.dailyMinutes) || 45;
  var daysPerWeek = Number(planDoc.daysPerWeek) || 6;
  var daysToExam = planDoc.examDate ? Math.max(0, _daysBetween(todayIso, planDoc.examDate)) : null;
  var targetScore = Number(planDoc.targetScore) || PREP_TARGET[planDoc.prepLevel] || 75;

  var rmap = readiness.readinessMap(syl, profile, topicState);
  var readinessFull = readiness.examReadinessScore(syl, profile, topicState, _blockStats(planDoc)) || {};
  var readinessScore = readinessFull.score || 0;

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
  var activeSection = (strategy.sections || []).filter(function (s) { return s.status === 'active'; })[0] || null;
  strategy.progress = {
    adherencePct: _adherencePct(planDoc),
    completedTopics: _completedTopics(planDoc),
    revisionDue: revisionDue,
    mockTrend: signals.mockTrend,
    nextObjective: activeSection ? activeSection.name : null,
    onTrack: forecast ? forecast.onTrack : null,
    bufferDays: forecast ? forecast.bufferDays : null,
    forecast: forecast
  };
  strategy.signals = signals;
  strategy.behaviour = _behaviour(planDoc, strategy, todayIso);   // ADR-061: avoidance/postponement/stale signals
  strategy.readinessBreakdown = _readinessBreakdown(readinessFull);  // ADR-062: make the score transparent (why 34?)
  strategy.examDate = planDoc.examDate || null;
  return strategy;
}

/** ADR-062: turn the opaque Exam Readiness number into a plain-language breakdown a student instantly gets —
 *  the single limiting driver (biggest weighted deficit = fastest way up) + the top contributing factors. */
var _READINESS_LABELS = {
  coverage: 'Syllabus covered', accuracy: 'Answer accuracy', consistency: 'Practice consistency',
  speed: 'Solving speed', improvement: 'Recent improvement', revision: 'Revision kept up', adherence: 'Plan adherence'
};
function _readinessBreakdown(full) {
  if (!full || !full.parts) return null;
  var W = readiness.WEIGHTS || {};
  var rows = Object.keys(full.parts).map(function (k) {
    var v = Number(full.parts[k]) || 0;
    return { key: k, label: _READINESS_LABELS[k] || k, pct: Math.round(v * 100), deficit: (W[k] || 0) * (1 - v) };
  });
  var bySize = rows.slice().sort(function (a, b) { return b.deficit - a.deficit; });
  var limit = bySize[0] || null;
  var drivers = rows.slice().sort(function (a, b) { return b.pct - a.pct; });   // show what's actually built up
  return {
    score: full.score,
    summary: limit ? 'Most limited by ' + limit.label.toLowerCase() + ' (' + (rows.filter(function (r) { return r.key === limit.key; })[0].pct) + '%). Lift that to move the number up fastest.' : '',
    limitedBy: limit ? limit.label : null,
    factors: drivers.map(function (r) { return { label: r.label, pct: r.pct }; })
  };
}

/** ADR-061: behaviour signals a mentor would notice — postponed topics (scheduled-but-skipped on past days),
 *  neglected sections, and strong topics gone stale. Derived from the doc (no extra persistence). */
function _behaviour(doc, strategy, todayIso) {
  var ts = doc.topicState || {}, days = (doc.block && doc.block.days) || [];
  var labelOf = {}; (strategy.topics || []).forEach(function (t) { labelOf[t.topicId] = t.label; });
  var sectionOf = {}; (strategy.topics || []).forEach(function (t) { sectionOf[t.topicId] = t.section; });
  var postCount = {};
  days.forEach(function (d) {
    if (d.date >= todayIso || d.kind !== 'study') return;
    (d.tasks || []).forEach(function (t) { if (!t.done) postCount[t.topicId] = (postCount[t.topicId] || 0) + 1; });
  });
  var postponed = Object.keys(postCount).map(function (id) { return { topicId: id, label: labelOf[id] || id, section: sectionOf[id] || '', count: postCount[id] }; })
    .sort(function (a, b) { return b.count - a.count; });
  // neglected sections: a section the student keeps skipping (postponed topics) while it's still pending.
  var secSkip = {};
  postponed.forEach(function (p) { if (p.section) secSkip[p.section] = (secSkip[p.section] || 0) + p.count; });
  var neglectedSections = (strategy.sections || []).filter(function (s) { return s.status !== 'done' && (secSkip[s.name] || 0) >= 2; })
    .map(function (s) { return { name: s.name, skips: secSkip[s.name], marks: s.marks }; }).sort(function (a, b) { return b.skips - a.skips; });
  // stale strong: a covered topic not studied in 14+ days (retention risk on something they earned).
  var stale = [];
  Object.keys(ts).forEach(function (id) {
    var s = ts[id]; if ((Number(s.coveragePct) || 0) >= 0.5 && s.lastStudiedAt) {
      var gap = _daysBetween(s.lastStudiedAt, todayIso);
      if (gap != null && gap >= 14) stale.push({ topicId: id, label: labelOf[id] || id, days: gap });
    }
  });
  stale.sort(function (a, b) { return b.days - a.days; });
  return { postponed: postponed.slice(0, 4), neglectedSections: neglectedSections.slice(0, 2), stale: stale.slice(0, 3) };
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
  var active = (strategy.sections || []).filter(function (s) { return s.status === 'active'; })[0];
  if (active) L.push('CURRENT FOCUS SECTION: ' + active.name + ' (' + active.progressPct + '% there, ' + active.topicCount + ' topics, ' + active.weightage + ' weightage).');
  L.push('PLAN ORDER (next): ' + (strategy.focus || []).slice(0, 3).map(function (t) { return t.label; }).join(' → ') + '.');
  var pr = strategy.progress || {};
  if (pr.adherencePct != null) L.push('You\'ve completed ' + pr.adherencePct + '% of planned work.' +
    (pr.onTrack === false ? ' You are BEHIND the plan — reinforce catching up.' : pr.bufferDays > 3 ? ' You are AHEAD — revision could start early.' : ''));
  if (pr.revisionDue && pr.revisionDue.length) L.push(pr.revisionDue.length + ' topic(s) are due for revision — a milestone you should not skip.');
  // ADR-061: behaviour a mentor would call out — avoidance, neglected sections, stale-strong topics.
  var bh = strategy.behaviour || {};
  if (bh.postponed && bh.postponed.length) {
    var top = bh.postponed[0];
    L.push('BEHAVIOUR: the student has postponed ' + top.label + ' ' + top.count + ' time(s) on scheduled days' +
      (bh.neglectedSections && bh.neglectedSections.length ? ' — they keep avoiding the ' + bh.neglectedSections[0].name + ' section, which carries real exam marks' : '') +
      '. Name the pattern honestly and prescribe a small, low-pressure step to break it (momentum, not mastery).');
  }
  if (bh.stale && bh.stale.length) L.push('STALE STRONG: ' + bh.stale[0].label + ' was studied ' + bh.stale[0].days + ' days ago — a quick brush-up protects marks they already earned.');
  if (strategy.recovery) L.push('RECOVERY: recent analytics dropped on ' + strategy.recovery.topics.map(function (t) { return t.label; }).join(', ') +
    ' — recommend a short recovery session BEFORE the next planned topic, even though the plan order says otherwise.');
  if (strategy.skip && strategy.skip.length) L.push('Triaged out (too little time for the marks): ' + strategy.skip.slice(0, 3).map(function (t) { return t.label; }).join(', ') + '.');
  L.push('Reason WITH this plan: if recent analytics conflict with the plan order, recommend the recovery/adjustment and say why.');
  return L.join(' ');
}

module.exports = { assemble: assemble, build: build, serialize: serialize };
