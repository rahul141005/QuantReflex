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
  // ADR-057: behavioural signals canonicalized on the Profile (the Strategy never talks to Coach/Insights —
  // it reads the one evolving picture of the student): { burnout, retentionRisk, recentRegressionTopics[], mockTrend }.
  var signals = input.signals || {};

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

  // ── milestones-first (the strategy thinks in objectives, then the projector lays them on days) ──
  // Behavioural signals shape it: burnout → lighter near-term workload; recentRegressionTopics → a recovery
  // objective BEFORE new work; retentionRisk → revision earlier; mockTrend → (narrated). All deterministic.
  var workload = signals.burnout ? 'light' : 'normal';
  var mb = _milestones(rows, byId, daysToExam, signals);     // internal phase ordering → { roadmap, recovery }

  // ── student-facing slices ──
  var learn = rows.filter(function (r) { return r.action === 'learn'; }).sort(function (a, b) { return b.priority - a.priority; });
  var revise = rows.filter(function (r) { return r.action === 'revise'; });
  var skip = rows.filter(function (r) { return r.action === 'skip'; }).sort(function (a, b) { return b.expectedGain - a.expectedGain; });

  return {
    examName: examName, daysToExam: daysToExam, targetScore: targetScore,
    readinessScore: curScore, projectedScore: projectedScore, achievable: achievable, marksAtRisk: marksAtRisk,
    totalHours: totalHours, plannedHours: includedHours, workload: workload,
    verdict: _verdict(curScore, projectedScore, targetScore, achievable, daysToExam, skip.length),
    sections: _sections(rows),        // ADR-059: the PATH = real syllabus sections + progress (no fake phases)
    roadmap: mb.roadmap,              // ordered, calendar-agnostic task stream the SCHEDULE is projected from
    recovery: mb.recovery,            // a recommended recovery session when recent analytics regressed
    focus: learn.slice(0, 5).map(_publicTopic),
    revise: revise.slice(0, 6).map(_publicTopic),
    skip: skip.slice(0, 6).map(_publicTopic),
    topics: rows.map(_publicTopic)    // the full canonical list (every feature can consume this)
  };
}

function _weightedReadiness(rows) {
  var s = 0, w = 0; rows.forEach(function (r) { s += r.marksWeight * r.cur; w += r.marksWeight; });
  return w > 0 ? s / w : 0;
}

/** Session type the student does on a topic (ADR-059) — derived from how well they already know it.
 *  first-learning = weak/unseen, practice = building, revision = already strong (keeping it warm). */
function _sessionType(r) {
  if (r.action === 'revise') return 'revision';
  if (r.action === 'recovery') return 'practice';
  return r.cur < 0.4 ? 'first-learning' : 'practice';
}

function _publicTopic(r) {
  return { topicId: r.id, label: r.label, section: r.section, action: r.action, sessionType: _sessionType(r),
    drillable: r.t.drillable || null, formulaSheet: r.t.formulaSheet || null, difficulty: r.t.difficulty,
    weightage: r.t.weightage || null, roi: r.t.roi != null ? r.t.roi : null, pyqFreq: r.t.pyqFreq != null ? r.t.pyqFreq : null,
    readiness: _round(r.cur, 2), marksWeight: _round(r.marksWeight, 2),
    expectedGain: r.expectedGain, marksPerHour: r.marksPerHour, hoursNeeded: r.hoursNeeded, durationMin: Math.round(r.hoursNeeded * 60),
    unlocks: r.rationale.unlocks, why: r.rationale.why, whyNow: r.rationale.whyNow,
    scoreImpact: r.rationale.scoreImpact, skipConsequence: r.rationale.skipConsequence };
}

/** The PATH = real syllabus SECTIONS (Arithmetic, Number System, …) with progress — never fabricated phase
 *  names (ADR-059). Ordered by marks/ROI; status from how much of the section is already covered. */
var _WB_RANK = { 'very-high': 4, 'high': 3, 'medium': 2, 'low': 1 };
function _sections(rows) {
  var bySec = {};
  rows.forEach(function (r) { if (r.action === 'skip') return; (bySec[r.section] = bySec[r.section] || []).push(r); });
  var out = Object.keys(bySec).map(function (name) {
    var rs = bySec[name].slice().sort(function (a, b) { return (b.t.roi || 0) - (a.t.roi || 0); });
    var marks = rs.reduce(function (a, r) { return a + r.marksWeight; }, 0);
    var prog = Math.round(rs.reduce(function (a, r) { return a + r.cur; }, 0) / rs.length * 100);
    var band = rs.reduce(function (b, r) { return (_WB_RANK[r.t.weightage] || 0) > (_WB_RANK[b] || 0) ? r.t.weightage : b; }, 'low');
    return { name: name, weightage: band, topicCount: rs.length, progressPct: prog, marks: _round(marks, 2),
      topics: rs.map(_publicTopic) };
  }).sort(function (a, b) { return b.marks - a.marks; });
  // the first not-yet-mastered section is the active one; fully-strong sections before it are done.
  var activeMarked = false;
  out.forEach(function (s) {
    if (s.progressPct >= 85) { s.status = activeMarked ? 'upcoming' : 'done'; }
    else if (!activeMarked) { s.status = 'active'; activeMarked = true; }
    else s.status = 'upcoming';
  });
  return out;
}

/** Hours a milestone of this kind costs for a topic row. */
function _kindHours(r, kind) {
  if (kind === 'recovery') return _round(r.estHours * 0.3, 1);
  if (kind === 'firstRevision' || kind === 'finalRevision') return _round(r.estHours * REVISE_HOURS_FACTOR, 1);
  return r.hoursNeeded;
}
/** A milestone's task view of a topic (its action follows the milestone's role, not the topic's base status). */
function _milestoneTopic(r, kind) {
  var t = _publicTopic(r);
  t.action = kind === 'recovery' ? 'recovery' : (kind === 'firstRevision' || kind === 'finalRevision') ? 'revise' : 'learn';
  t.sessionType = kind === 'recovery' ? 'practice' : (kind === 'firstRevision' || kind === 'finalRevision') ? 'revision' : (r.cur < 0.4 ? 'first-learning' : 'practice');
  t.milestoneHours = _kindHours(r, kind);
  return t;
}

/**
 * Milestones-first generation: the strategy thinks in named, subject-aware OBJECTIVES (ordered by dependency,
 * marks and readiness), then flattens them into an ordered, calendar-agnostic ROADMAP that the schedule projects
 * from. Membership is data-driven — never hardcoded phases. Behavioural signals reshape it (recovery first,
 * revision earlier under retention risk, mock near the exam).
 */
function _milestones(rows, byId, daysToExam, signals) {
  signals = signals || {};
  var rowById = {}; rows.forEach(function (r) { rowById[r.id] = r; });
  function depth(id, seen) { seen = seen || {}; var t = byId[id]; if (!t || seen[id]) return 0; seen[id] = 1;
    var ps = (t.prereqs || []); if (!ps.length) return 0; return 1 + Math.max.apply(null, ps.map(function (p) { return depth(p, seen); })); }
  function sectionName(r) { return r.section || 'General'; }
  // sections ordered by the marks they carry (highest-value subjects first)
  function orderedSections(members) {
    var bySec = {}; members.forEach(function (r) { (bySec[sectionName(r)] = bySec[sectionName(r)] || []).push(r); });
    return Object.keys(bySec).map(function (s) { return { section: s, rows: bySec[s],
      marks: bySec[s].reduce(function (a, r) { return a + r.marksWeight; }, 0) }; })
      .sort(function (a, b) { return b.marks - a.marks; });
  }

  var assigned = {}, milestones = [], seq = 0;
  function add(key, name, kind, members, section, objective, why) {
    members = members.filter(function (r) { return !assigned[r.id]; });
    if (!members.length) return;
    members.forEach(function (r) { assigned[r.id] = 1; });
    milestones.push({ id: 'm' + (seq++), key: key, name: name, kind: kind, section: section || null,
      objective: objective || '', why: why || '',
      hours: _round(members.reduce(function (s, r) { return s + _kindHours(r, kind); }, 0), 1),
      topics: members.map(function (r) { return _milestoneTopic(r, kind); }) });
  }

  var learnRows = rows.filter(function (r) { return r.action === 'learn'; });
  var reviseRows = rows.filter(function (r) { return r.action === 'revise'; });

  // 0 — RECOVERY first: strong/covered topics whose recent analytics regressed (the Profile's signal).
  var regression = {};
  (signals.recentRegressionTopics || []).forEach(function (k) { regression[k] = 1; });
  var recoveryRows = rows.filter(function (r) { return regression[r.id] || (r.t.drillable && regression[r.t.drillable]); });
  if (recoveryRows.length) add('recovery', 'Intensive Weak-Topic Recovery', 'recovery', recoveryRows, null,
    'Rebuild the topics your recent accuracy slipped on before adding new work.',
    'Recent practice shows a dip here — recover before moving on.');
  var recovery = recoveryRows.length ? { topics: recoveryRows.map(function (r) { return _milestoneTopic(r, 'recovery'); }) } : null;

  // 1 — FOUNDATIONS per section: weak, shallow-dependency learn topics that everything else stands on.
  orderedSections(learnRows.filter(function (r) { return r.cur < 0.45 && depth(r.id) <= 1; })).forEach(function (g) {
    add('foundation_' + g.section, 'Build ' + g.section + ' Foundation', 'foundation', g.rows, g.section,
      'Reach a dependable base across ' + g.section + ' fundamentals.', 'High-leverage groundwork others build on.');
  });

  // First Revision — earlier when retention is at risk, otherwise after foundations.
  function firstRevision() {
    add('first_revision', 'First Revision', 'firstRevision', reviseRows, null,
      'Lock in what you already know with a spaced pass.', 'Spaced revision protects retention.');
  }
  if (signals.retentionRisk) firstRevision();

  // 2 — CORE / HIGH-ROI per section: the remaining learn topics, highest-marks subjects first.
  orderedSections(learnRows.filter(function (r) { return !assigned[r.id]; })).forEach(function (g) {
    var avgMarks = g.marks / g.rows.length;
    var name = avgMarks >= 0.5 ? 'Complete High-ROI ' + g.section : 'Finish ' + g.section + ' Core';
    add('core_' + g.section, name, 'core', g.rows, g.section,
      'Convert ' + g.section + ' into reliable marks.', 'Where the most marks are still on the table.');
  });

  if (!signals.retentionRisk) firstRevision();

  // 3 — MOCK READINESS near the exam (urgency-generated, not always-on).
  if (daysToExam != null && daysToExam <= 21) milestones.push({ id: 'm' + (seq++), key: 'mock',
    name: 'Mock Readiness', kind: 'mock', section: null, hours: 0, topics: [],
    objective: 'Rehearse full timed sets so the score holds under exam pressure.', why: 'Timing and stamina decide the final marks.' });

  // 4 — FINAL REVISION: a light last pass over the highest-marks covered topics (re-touch, not new learning).
  if (daysToExam != null) {
    var covered = rows.filter(function (r) { return r.action !== 'skip'; }).sort(function (a, b) { return b.marksWeight - a.marksWeight; }).slice(0, 5);
    if (covered.length) milestones.push({ id: 'm' + (seq++), key: 'final_revision', name: 'Final Revision',
      kind: 'finalRevision', section: null, objective: 'A final high-marks sweep right before the exam.', why: 'Peak recall on exam day.',
      hours: _round(covered.reduce(function (s, r) { return s + _kindHours(r, 'finalRevision'); }, 0), 1),
      topics: covered.map(function (r) { return _milestoneTopic(r, 'finalRevision'); }) });
  }

  // status: the first milestone that still has learnable/active work is active; all-strong ones before it are done.
  var activeMarked = false;
  milestones.forEach(function (m) {
    var hasWork = m.kind === 'mock' || m.topics.length;
    if (!activeMarked && hasWork) { m.status = 'active'; activeMarked = true; }
    else m.status = activeMarked ? 'upcoming' : 'done';
  });

  // ROADMAP: flatten the internal phase ordering into the calendar-agnostic study-block stream the projector
  // consumes. Each block names a real topic + session type (ADR-059), never a fabricated phase, and carries the
  // metadata the planner UI shows (duration, why, unlocks, formula sheet, drill SUGGESTION — not a button).
  var roadmap = [], order = 0;
  milestones.forEach(function (m) {
    m.topics.forEach(function (t) {
      var bt = byId[t.topicId] || {};
      roadmap.push({ topicId: t.topicId, label: t.label, section: t.section, action: t.action,
        sessionType: t.sessionType, hours: t.milestoneHours, durationMin: Math.round(t.milestoneHours * 60),
        drillable: t.drillable, formulaSheet: t.formulaSheet || null, difficulty: bt.difficulty || 0.5,
        weightage: bt.weightage || null, unlocks: t.unlocks || [], order: order++, reason: t.whyNow });
    });
  });

  return { roadmap: roadmap, recovery: recovery };
}

function _verdict(cur, projected, target, achievable, daysToExam, skipCount) {
  var d = daysToExam != null ? daysToExam + ' days to your exam. ' : '';
  if (achievable) return d + 'On the optimal path you reach ~' + projected + '/100, clearing your ' + target + ' target.';
  if (daysToExam != null && daysToExam <= 21) return d + 'Tight — I\'ve cut to the highest-scoring path and parked ' + skipCount + ' low-value topic(s) so the marks that matter land first.';
  return d + 'At this pace you reach ~' + projected + '/100 (target ' + target + '). Add study time or focus the high-marks topics to close it.';
}

module.exports = { buildStrategy: buildStrategy, _marksWeight: _marksWeight };
