/**
 * planningEngine.js — the canonical QuanAI planning brain (ADR-056 / "Planner v3").
 *
 * THE central intelligence of QuantReflex. Pure + deterministic (no Firestore, no LLM, no DOM): given the exam,
 * time left, the syllabus graph, per-topic readiness and a target score, it produces ONE marks-maximizing
 * STRATEGY that every feature (Planner UI, Coach, Insights, reminders, revision, mocks, adaptive practice,
 * future web) consumes — nobody invents their own plan. The schedule is an OUTPUT of the strategy, not the point.
 *
 * Objective (the ONE thing it optimizes): **maximize expected marks before the exam**, not topic completion.
 * For every topic it answers: why this, why now, what score impact, what it unlocks, what skipping costs.
 *
 * Inputs (`buildStrategy(input)`):
 *   { syllabus,            // data/syllabus.js resolved syllabus: { topics:[{id,label,section,importance,
 *                          //   frequency,difficulty,estMinutes,revisionIntervalDays,prereqs,drillable}], ... }
 *     examName, daysToExam, dailyMinutes, daysPerWeek,
 *     targetScore,         // 0..100 desired exam readiness/marks (optional → sensible default)
 *     readiness,           // { topicId: 0..1 } from readiness.readinessMap (per-topic readiness)
 *     readinessScore }     // 0..100 overall, from readiness.examReadinessScore (optional)
 *
 * Output: a `strategy` object — see buildStrategy's return. Self-explaining; the UI just renders it.
 */
'use strict';
var aiMath = require('./aiMath');
var _round = aiMath.round, _clamp = aiMath.clamp;

var FREQ_FACTOR = { high: 1, medium: 0.65, low: 0.4 };
var TARGET_DEFAULT = 75;            // if the student set no target, aim for a solid exam-ready band
var REVISE_HOURS_FACTOR = 0.25;     // revising a strong topic costs ~1/4 of first-pass hours
var UNLOCK_WEIGHT = 0.6;            // how much a topic's downstream value boosts its priority

function _freqFactor(t) { return FREQ_FACTOR[t.frequency] || (t.importance >= 0.75 ? 1 : t.importance >= 0.5 ? 0.65 : 0.4); }
/** A topic's share of exam marks (0..~1): how often it appears × how much it's worth. */
function _marksWeight(t) { return _clamp((Number(t.importance) || 0) * _freqFactor(t), 0, 1); }
/** Desired per-topic readiness, scaled by the target score. */
function _targetReadiness(targetScore) { return _clamp(0.55 + (targetScore / 100) * 0.4, 0.6, 0.95); }

/**
 * Build the marks-maximizing strategy. Deterministic; same output regardless of how it's displayed.
 */
function buildStrategy(input) {
  input = input || {};
  var syl = input.syllabus || { topics: [] };
  var topics = (syl.topics || []).slice();
  var readiness = input.readiness || {};
  var examName = input.examName || 'your exam';
  var daysToExam = input.daysToExam != null ? Math.max(0, input.daysToExam) : null;
  var dailyMinutes = Number(input.dailyMinutes) || 45;
  var daysPerWeek = _clamp(Number(input.daysPerWeek) || 5, 1, 7);
  var targetScore = _clamp(Number(input.targetScore) || TARGET_DEFAULT, 1, 100);
  var targetR = _targetReadiness(targetScore);

  // Available study HOURS before the exam (the budget the whole strategy must fit inside).
  var totalHours = daysToExam != null
    ? _round((daysToExam * (daysPerWeek / 7) * dailyMinutes) / 60, 1)
    : _round((28 * (daysPerWeek / 7) * dailyMinutes) / 60, 1);   // no date → plan a 4-week horizon

  var byId = {}; topics.forEach(function (t) { byId[t.id] = t; });
  // downstream value: for each topic, the marks of the topics that DEPEND on it (so foundations earn priority).
  var unlocks = {}; topics.forEach(function (t) { unlocks[t.id] = []; });
  topics.forEach(function (t) { (t.prereqs || []).forEach(function (p) { if (unlocks[p]) unlocks[p].push(t.id); }); });

  // ── score every topic ──
  var rows = topics.map(function (t) {
    var cur = _clamp(Number(readiness[t.id]) || 0, 0, 1);
    var gap = Math.max(0, targetR - cur);
    var mw = _marksWeight(t);
    var expectedGain = _round(mw * gap, 4);                                  // marks recoverable by reaching target
    var estHours = (Number(t.estMinutes) || 60) / 60;
    var hoursNeeded = _round(Math.max(0.1, estHours * gap), 1);             // proportional to the gap
    var unlockIds = unlocks[t.id] || [];
    var unlockValue = unlockIds.reduce(function (s, id) { return s + (byId[id] ? _marksWeight(byId[id]) : 0); }, 0);
    var marksPerHour = expectedGain / Math.max(0.1, hoursNeeded);
    var priority = marksPerHour + UNLOCK_WEIGHT * unlockValue;
    return { t: t, id: t.id, label: t.label, section: t.section, cur: cur, gap: gap, marksWeight: mw,
      expectedGain: expectedGain, estHours: estHours, hoursNeeded: hoursNeeded, unlockIds: unlockIds,
      unlockValue: _round(unlockValue, 3), marksPerHour: _round(marksPerHour, 4), priority: priority,
      atTarget: cur >= targetR };
  });

  var rowById = {}; rows.forEach(function (r) { rowById[r.id] = r; });

  // ── select the path that maximizes expected marks within the time budget (prereqs first) ──
  rows.sort(function (a, b) { return b.priority - a.priority; });
  var budget = totalHours, includedHours = 0, plannedMarks = 0;
  var status = {};   // id → 'learn' | 'revise' | 'skip'
  function include(r, action) {
    if (status[r.id]) return true;
    if (action === 'learn') {
      // pull in prerequisite chain first (a topic you can't yet stand on isn't really learnable)
      var prereqs = (r.t.prereqs || []);
      for (var i = 0; i < prereqs.length; i++) {
        var pr = rowById[prereqs[i]];
        if (pr && !pr.atTarget && status[pr.id] !== 'learn') { if (!include(pr, 'learn')) return false; }
      }
      if (includedHours + r.hoursNeeded > budget) return false;   // doesn't fit → caller marks skip
      includedHours = _round(includedHours + r.hoursNeeded, 1);
      plannedMarks = _round(plannedMarks + r.expectedGain, 4);
    }
    status[r.id] = action;
    return true;
  }
  rows.forEach(function (r) {
    if (status[r.id]) return;
    if (r.atTarget) { status[r.id] = 'revise'; return; }        // already strong → keep warm, cheap
    if (r.gap <= 0 || r.marksWeight <= 0) { status[r.id] = 'skip'; return; }
    if (!include(r, 'learn')) status[r.id] = 'skip';            // wouldn't fit the budget → triage out
  });

  // ── projection & achievability ──
  var curScore = input.readinessScore != null ? _round(input.readinessScore, 0) : _round(_weightedReadiness(rows) * 100, 0);
  // marks space: total achievable marks = Σ marksWeight; planned gain lifts the score proportionally.
  var totalMarks = rows.reduce(function (s, r) { return s + r.marksWeight; }, 0) || 1;
  var projectedScore = _round(_clamp(curScore + (plannedMarks / totalMarks) * 100, 0, 100), 0);
  var achievable = projectedScore >= targetScore;
  var marksAtRisk = _round(rows.filter(function (r) { return status[r.id] === 'skip'; })
    .reduce(function (s, r) { return s + r.expectedGain; }, 0) / totalMarks * 100, 0);

  // ── per-topic rationale (the five questions the mentor must answer) ──
  function rationale(r) {
    var act = status[r.id];
    var freq = r.t.frequency || (r.marksWeight >= 0.6 ? 'high' : r.marksWeight >= 0.35 ? 'medium' : 'low');
    var unlockLabels = r.unlockIds.map(function (id) { return byId[id] ? byId[id].label : id; });
    var impactPts = Math.round(r.expectedGain / totalMarks * 100);
    return {
      why: r.label + ' is ' + freq + '-frequency in ' + examName + ' (mark weight ' + Math.round(r.marksWeight * 100) + '%).',
      whyNow: act === 'revise' ? 'You\'re already strong here — a quick revision keeps it sharp.'
        : r.unlockIds.length ? 'It unlocks ' + unlockLabels.slice(0, 2).join(' & ') + ', so doing it now compounds.'
        : r.cur < 0.4 ? 'A foundation you\'re weak on — earlier is better.' : 'High marks-per-hour right now.',
      scoreImpact: act === 'skip' ? 'Skipping costs about +' + impactPts + ' readiness points.'
        : 'Worth about +' + Math.max(1, impactPts) + ' readiness points.',
      unlocks: unlockLabels,
      skipConsequence: r.unlockIds.length ? 'Skipping also blocks ' + unlockLabels.slice(0, 2).join(' & ') + '.'
        : 'Low downstream cost if skipped.'
    };
  }
  rows.forEach(function (r) { r.action = status[r.id]; r.rationale = rationale(r); });

  // ── dynamic phases (generated from dependency depth + readiness + time, NOT hardcoded membership) ──
  var phases = _phases(rows, byId, daysToExam);

  // ── student-facing slices ──
  var learn = rows.filter(function (r) { return r.action === 'learn'; }).sort(function (a, b) { return b.priority - a.priority; });
  var revise = rows.filter(function (r) { return r.action === 'revise'; });
  var skip = rows.filter(function (r) { return r.action === 'skip'; }).sort(function (a, b) { return b.expectedGain - a.expectedGain; });

  return {
    examName: examName, daysToExam: daysToExam, targetScore: targetScore,
    readinessScore: curScore, projectedScore: projectedScore, achievable: achievable, marksAtRisk: marksAtRisk,
    totalHours: totalHours, plannedHours: includedHours,
    verdict: _verdict(curScore, projectedScore, targetScore, achievable, daysToExam, skip.length),
    phases: phases,
    focus: learn.slice(0, 5).map(_publicTopic),
    revise: revise.slice(0, 6).map(_publicTopic),
    skip: skip.slice(0, 6).map(_publicTopic),
    topics: rows.map(_publicTopic)   // the full canonical list (every feature can consume this)
  };
}

function _weightedReadiness(rows) {
  var s = 0, w = 0; rows.forEach(function (r) { s += r.marksWeight * r.cur; w += r.marksWeight; });
  return w > 0 ? s / w : 0;
}

function _publicTopic(r) {
  return { topicId: r.id, label: r.label, section: r.section, action: r.action,
    drillable: r.t.drillable || null, readiness: _round(r.cur, 2), marksWeight: _round(r.marksWeight, 2),
    expectedGain: r.expectedGain, marksPerHour: r.marksPerHour, hoursNeeded: r.hoursNeeded,
    unlocks: r.rationale.unlocks, why: r.rationale.why, whyNow: r.rationale.whyNow,
    scoreImpact: r.rationale.scoreImpact, skipConsequence: r.rationale.skipConsequence };
}

/** Dynamic phases: Foundations (weak roots) → Core (high-marks mid) → Advanced (hard/deep) → Revision → Mock.
 *  Membership is data-driven (readiness, dependency depth, difficulty); the Mock phase only appears near the exam. */
function _phases(rows, byId, daysToExam) {
  function depth(id, seen) { seen = seen || {}; var t = byId[id]; if (!t || seen[id]) return 0; seen[id] = 1;
    var ps = (t.prereqs || []); if (!ps.length) return 0; return 1 + Math.max.apply(null, ps.map(function (p) { return depth(p, seen); })); }
  var defs = [
    { key: 'foundations', name: 'Foundations', test: function (r) { return r.action === 'learn' && r.cur < 0.45 && depth(r.id) <= 1; } },
    { key: 'core', name: 'Core', test: function (r) { return r.action === 'learn' && r.marksWeight >= 0.5 && (r.t.difficulty || 0.5) < 0.65; } },
    { key: 'advanced', name: 'Advanced', test: function (r) { return r.action === 'learn'; } }, // remaining learn
    { key: 'revision', name: 'Revision', test: function (r) { return r.action === 'revise'; } }
  ];
  var assigned = {}, out = [];
  defs.forEach(function (d) {
    var mem = rows.filter(function (r) { return !assigned[r.id] && d.test(r); });
    mem.forEach(function (r) { assigned[r.id] = 1; });
    if (mem.length) out.push({ key: d.key, name: d.name, topics: mem.map(_publicTopic),
      hours: _round(mem.reduce(function (s, r) { return s + (r.action === 'revise' ? r.estHours * REVISE_HOURS_FACTOR : r.hoursNeeded); }, 0), 1) });
  });
  // Mock phase only when the exam is near (a final-stretch milestone, generated by urgency, not hardcoded always-on).
  if (daysToExam != null && daysToExam <= 21) out.push({ key: 'mock', name: 'Mock & timed practice', topics: [], hours: 0 });
  // status: the first non-empty learn-bearing phase is active; earlier all-strong phases are done.
  var activeMarked = false;
  out.forEach(function (ph) {
    var hasWork = ph.topics.some(function (t) { return t.action === 'learn'; }) || ph.key === 'mock';
    if (!activeMarked && hasWork) { ph.status = 'active'; activeMarked = true; }
    else ph.status = activeMarked ? 'upcoming' : 'done';
  });
  return out;
}

function _verdict(cur, projected, target, achievable, daysToExam, skipCount) {
  var d = daysToExam != null ? daysToExam + ' days to your exam. ' : '';
  if (achievable) return d + 'On the optimal path you reach ~' + projected + '/100, clearing your ' + target + ' target.';
  if (daysToExam != null && daysToExam <= 21) return d + 'Tight — I\'ve cut to the highest-scoring path and parked ' + skipCount + ' low-value topic(s) so the marks that matter land first.';
  return d + 'At this pace you reach ~' + projected + '/100 (target ' + target + '). Add study time or focus the high-marks topics to close it.';
}

module.exports = { buildStrategy: buildStrategy, _marksWeight: _marksWeight };
