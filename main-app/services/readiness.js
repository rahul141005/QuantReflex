/**
 * readiness.js — Readiness scoring + Completion Forecast for the QuanAI Planner (ADR-046).
 *
 * Pure deterministic math over: a syllabus (data/syllabus.js), the studentContext ctx, and per-topic
 * `topicState` (coverage/mastery accumulated across blocks). No Firestore, no LLM.
 *
 *  - readinessForTopic : blends demonstrated skill (real practice or inferred signals) with coverage.
 *  - examReadinessScore: a 0..100 multi-signal composite (coverage, accuracy, speed, consistency, recent
 *                        improvement, revision adherence, study adherence) — never "no data".
 *  - completionForecast: on-track?, buffer days, pace projection, "+15 min/day" effect, sessions left.
 */
'use strict';

var signals = require('./signals');
var aiMath = require('./aiMath');   // shared round/clamp/todayIso (ADR-047)
var clamp = signals.clamp;

/* ---- date helpers (operate on 'YYYY-MM-DD'; UTC-stable; _ms intentionally local — ISO-key parser) ---- */
var DAY = 86400000;
function _ms(iso) { var t = new Date(iso + 'T00:00:00Z').getTime(); return isNaN(t) ? Date.now() : t; }
var _todayIso = aiMath.todayIso;
var _round = aiMath.round;

/** The demonstrated-or-inferred skill estimate (0..1) for a topic, BEFORE folding in coverage. */
function skillBase(topic, ctx) {
  if (topic.drillable && signals.hasDirectData(topic.drillable, ctx)) {
    var m = signals.masteryMap(ctx)[topic.drillable];
    return clamp(0.7 * m.acc + 0.3 * signals.speedScore(ctx), 0.05, 0.99);
  }
  return signals.signalReadiness(topic, ctx);
}

/** Per-topic readiness 0..1 = blend of demonstrated skill (0.55) and how much has been covered (0.45). */
function readinessForTopic(topic, ctx, topicState) {
  var ts = (topicState && topicState[topic.id]) || {};
  var coverage = Number(ts.coveragePct) || 0;
  var base = skillBase(topic, ctx);
  return clamp(0.55 * base + 0.45 * coverage, 0, 1);
}

/** {topicId: readiness} for an entire syllabus. */
function readinessMap(syllabus, ctx, topicState) {
  var out = {};
  syllabus.topics.forEach(function (t) { out[t.id] = readinessForTopic(t, ctx, topicState); });
  return out;
}

/**
 * Exam Readiness Score, 0..100. Importance-weighted over all topics; every sub-score has a signal-based
 * or neutral fallback so the result is ALWAYS a real number (requirement: never expose "no data").
 * @param {object} blockStats optional {revisionsDue, revisionsOnTime, scheduledTasks, completedTasks}
 */
// Default (balanced) factor weights — sum to 1.0 so the composite tops out at 100.
var W = { coverage: 0.28, accuracy: 0.22, speed: 0.12, consistency: 0.14, improvement: 0.10, revision: 0.08, adherence: 0.06 };
// Speed-critical exams (no calculator + very tight per-question time: Banking, SSC Tier-1, MAH CET, SNAP):
// fast mental calculation genuinely decides rank, so speed is weighted far above the flat default.
var W_SPEED = { coverage: 0.24, accuracy: 0.20, speed: 0.22, consistency: 0.14, improvement: 0.08, revision: 0.06, adherence: 0.06 };
// Concept-leaning exams (on-screen calculator or generous pace: CAT, CMAT, XAT): coverage/accuracy matter more;
// raw mental-calc speed is a minor signal.
var W_CONCEPT = { coverage: 0.30, accuracy: 0.24, speed: 0.08, consistency: 0.14, improvement: 0.10, revision: 0.08, adherence: 0.06 };

/** Pick the readiness weight profile from an exam's verified mechanics (ADR rebuild): speed weight is no longer a
 *  flat 12% — it scales with how much fast, no-calculator calculation actually drives the exam. Falls back to the
 *  balanced default when an exam has no pattern metadata (e.g. Foundation). */
function weightsFor(syllabus) {
  var p = syllabus && syllabus.pattern;
  if (p && p.quantQ && p.quantMin) {
    var secPerQ = (p.quantMin * 60) / p.quantQ;
    if (p.calc !== 'onscreen' && secPerQ <= 65) return W_SPEED;       // Banking / SSC-T1 / MAH CET / SNAP
    if (p.calc === 'onscreen' || secPerQ >= 100) return W_CONCEPT;     // CAT / CMAT (calculator or slow pace)
  }
  return W;                                                            // balanced default
}

function examReadinessScore(syllabus, ctx, topicState, blockStats) {
  var W = weightsFor(syllabus);   // tier/mechanics-aware weights (shadows the module default intentionally)
  blockStats = blockStats || {};
  var impSum = 0, covAcc = 0, accAcc = 0;
  syllabus.topics.forEach(function (t) {
    var ts = (topicState && topicState[t.id]) || {};
    var cov = Number(ts.coveragePct) || 0;
    impSum += t.importance;
    covAcc += t.importance * cov;
    accAcc += t.importance * skillBase(t, ctx);
  });
  var coverageScore = impSum > 0 ? covAcc / impSum : 0;
  var accuracyScore = impSum > 0 ? accAcc / impSum : signals.globalFallback(ctx);
  var speedScore = signals.speedScore(ctx);

  var con = (ctx.trends && ctx.trends.consistency) || {};
  var consistencyScore = clamp((con.activeDaysLast14 != null ? con.activeDaysLast14 : 7) / 14, 0, 1);

  var accT = (ctx.trends && ctx.trends.accuracy) || {};
  var improvementScore = clamp(0.5 + (accT.delta || 0) * 5, 0, 1);

  var revisionScore = blockStats.revisionsDue > 0
    ? clamp((blockStats.revisionsOnTime || 0) / blockStats.revisionsDue, 0, 1) : 0.5;       // neutral if none due
  var adherenceScore = blockStats.scheduledTasks > 0
    ? clamp((blockStats.completedTasks || 0) / blockStats.scheduledTasks, 0, 1) : 0.5;       // neutral if no block yet

  var score = 100 * (
    W.coverage * coverageScore + W.accuracy * accuracyScore + W.speed * speedScore +
    W.consistency * consistencyScore + W.improvement * improvementScore +
    W.revision * revisionScore + W.adherence * adherenceScore);

  return {
    score: Math.round(clamp(score, 0, 100)),
    band: score >= 75 ? 'exam-ready' : score >= 55 ? 'on-track' : score >= 35 ? 'building' : 'early',
    weights: W,   // the actual profile used (so the readiness breakdown stays honest about what mattered)
    parts: {
      coverage: _round(coverageScore, 3), accuracy: _round(accuracyScore, 3), speed: _round(speedScore, 3),
      consistency: _round(consistencyScore, 3), improvement: _round(improvementScore, 3),
      revision: _round(revisionScore, 3), adherence: _round(adherenceScore, 3)
    }
  };
}

/** Minutes of study still required across the whole syllabus, weighted by how much remains uncovered. */
function remainingMinutes(syllabus, topicState) {
  var total = 0;
  syllabus.topics.forEach(function (t) {
    var ts = (topicState && topicState[t.id]) || {};
    var cov = clamp(Number(ts.coveragePct) || 0, 0, 1);
    total += t.estMinutes * (1 - cov);
  });
  return Math.round(total);
}

/**
 * Completion Forecast — motivational + honest. Projects a finish date from the planned pace and (if
 * available) the student's REAL recent pace, computes the buffer vs the exam date, the remaining
 * sessions, and the effect of studying 15 more minutes a day.
 * @param {object} opts {dailyMinutes, daysPerWeek, examDate, recentDailyMinutes}
 */
function completionForecast(syllabus, topicState, opts) {
  opts = opts || {};
  var rem = remainingMinutes(syllabus, topicState);
  var dailyMinutes = Math.max(5, Number(opts.dailyMinutes) || 45);
  var daysPerWeek = clamp(Number(opts.daysPerWeek) || 6, 1, 7);
  var perDayAvg = dailyMinutes * daysPerWeek / 7;            // amortized minutes/calendar-day
  var todayMs = _ms(_todayIso());

  function projDays(perDay) { return perDay > 0 ? Math.ceil(rem / perDay) : Infinity; }
  function isoPlus(days) { return new Date(todayMs + days * DAY).toISOString().slice(0, 10); }

  var daysNeeded = projDays(perDayAvg);
  var projectedFinish = isFinite(daysNeeded) ? isoPlus(daysNeeded) : null;

  var examMs = opts.examDate ? _ms(opts.examDate) : null;
  var bufferDays = examMs != null && projectedFinish ? Math.round((examMs - _ms(projectedFinish)) / DAY) : null;
  var daysToExam = examMs != null ? Math.max(0, Math.round((examMs - todayMs) / DAY)) : null;

  // Pace projection from the student's actual recent behaviour (if we know it).
  var realPace = Number(opts.recentDailyMinutes) || 0;
  var projectedAtPace = realPace > 0 && isFinite(projDays(realPace)) ? isoPlus(projDays(realPace)) : null;
  var paceBufferDays = (examMs != null && projectedAtPace) ? Math.round((examMs - _ms(projectedAtPace)) / DAY) : null;

  // "What if +15 min/day?"
  var morePerDay = (dailyMinutes + 15) * daysPerWeek / 7;
  var moreDays = projDays(morePerDay);
  var moreFinish = isFinite(moreDays) ? isoPlus(moreDays) : null;
  var moreBuffer = (examMs != null && moreFinish) ? Math.round((examMs - _ms(moreFinish)) / DAY) : null;

  return {
    remainingMinutes: rem,
    remainingHours: _round(rem / 60, 1),
    dailyMinutes: dailyMinutes,
    daysPerWeek: daysPerWeek,
    projectedFinish: projectedFinish,
    daysToExam: daysToExam,
    bufferDays: bufferDays,
    onTrack: bufferDays == null ? true : bufferDays >= 0,
    projectedAtPace: projectedAtPace,
    paceBufferDays: paceBufferDays,
    sessionsRemaining: Math.ceil(rem / dailyMinutes),
    ifPlusMinutes: { minutes: dailyMinutes + 15, projectedFinish: moreFinish, bufferDays: moreBuffer,
      daysSaved: (projectedFinish && moreFinish) ? Math.max(0, Math.round((_ms(projectedFinish) - _ms(moreFinish)) / DAY)) : null }
  };
}

module.exports = {
  skillBase: skillBase,
  readinessForTopic: readinessForTopic,
  readinessMap: readinessMap,
  examReadinessScore: examReadinessScore,
  weightsFor: weightsFor,
  remainingMinutes: remainingMinutes,
  completionForecast: completionForecast,
  WEIGHTS: W
};
