/**
 * plannerEngine.js — the DETERMINISTIC scheduler of the QuanAI Planner (ADR-046).
 *
 * Doctrine (same as studentContext.js): move the analysis out of the model — deterministic math can't
 * hallucinate. This module decides WHICH topics, on WHICH days, for HOW long, at WHAT difficulty, with
 * revision interleaving and adaptive buffer/mock days. The LLM only narrates the `rationaleSeed` it emits.
 *
 * Pure functions over: a syllabus (data/syllabus.js), the studentContext ctx, and prior `topicState`.
 * No Firestore, no LLM, no Date.now() surprises (dates are explicit ISO 'YYYY-MM-DD').
 *
 * Public:
 *   generateBlock(input) -> { days[], rationaleSeed, topicStatePatch, readiness, forecast, examReadiness }
 *   applyCompletion(topicState, syllabus, event) -> { patch }  (used by the server on task toggle)
 *   rebalanceMissed(days, todayIso, dailyMinutes) -> days       (Smart Catch-up)
 */
'use strict';

var readiness = require('./readiness');
var signalsLib = require('./signals');
var aiMath = require('./aiMath');   // shared round/todayIso (ADR-047)
var clamp = signalsLib.clamp;

var WINDOW_DAYS = 14;
var MIN_TASK_MIN = 15;
var REVISE_TASK_MIN = 20;
var FULLY_COVERED = 0.95;

/* ---- date helpers (UTC-stable, operate on 'YYYY-MM-DD') ---- */
var DAY = 86400000;
function _ms(iso) { var t = new Date(iso + 'T00:00:00Z').getTime(); return isNaN(t) ? Date.now() : t; }
function addDays(iso, n) { return new Date(_ms(iso) + n * DAY).toISOString().slice(0, 10); }
function dowOf(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }   // 0=Sun..6=Sat
var _todayIso = aiMath.todayIso;
var _round = aiMath.round;

/** Evenly-spread day offsets (0..6) to study, given days/week. dpw=5 → [0,1,3,4,6]; dpw=3 → [0,2,5]. */
function weekStudyOffsets(daysPerWeek) {
  var dpw = clamp(Math.round(daysPerWeek) || 6, 1, 7);
  var set = {};
  for (var k = 0; k < dpw; k++) { set[clamp(Math.round(k * 7 / dpw), 0, 6)] = true; }
  return set;
}

/** Lay out the 14-day window as study/rest days (window-relative spacing — preferredTime is time-of-day). */
function pickDayKinds(startDate, daysPerWeek) {
  var off = weekStudyOffsets(daysPerWeek);
  var out = [];
  for (var i = 0; i < WINDOW_DAYS; i++) {
    var date = addDays(startDate, i);
    out.push({ date: date, dow: dowOf(date), isStudy: !!off[i % 7] });
  }
  return out;
}

/** Prep-level bias 0..1 — scratch favours easy foundations; ready favours advanced/revision. */
function prepWeight(prepLevel, topic) {
  var imp = topic.importance, diff = topic.difficulty;
  switch (prepLevel) {
    case 'scratch':   return clamp((1 - diff) * 0.6 + imp * 0.4, 0, 1);
    case 'revision':  return clamp(imp * 0.6 + (1 - diff) * 0.4, 0, 1);
    case 'confident': return clamp(diff * 0.5 + imp * 0.5, 0, 1);
    case 'ready':     return clamp(diff * 0.6 + imp * 0.4, 0, 1);
    default:          return clamp(imp, 0, 1);   // 'average'
  }
}

/** Prereq coverage threshold — soft-locked for confident/ready students so they aren't fully blocked. */
function prereqThreshold(prepLevel) {
  return prepLevel === 'ready' ? 0.2 : prepLevel === 'confident' ? 0.4 : 0.6;
}
function prereqsMet(topic, coverageOf, threshold) {
  return (topic.prereqs || []).every(function (p) { return (coverageOf[p] || 0) >= threshold; });
}

/** Spaced revision due? Either an explicit due date has arrived, or a covered topic has gone stale. */
function isRevisionDue(topic, ts, todayIso) {
  ts = ts || {};
  if (ts.nextRevisionDue && ts.nextRevisionDue <= todayIso) return true;
  if ((ts.coveragePct || 0) >= 0.6 && ts.lastStudiedAt) {
    var staleDays = Math.floor((_ms(todayIso) - _ms(ts.lastStudiedAt)) / DAY);
    return staleDays >= topic.revisionIntervalDays;
  }
  return false;
}

/** Map readiness 0..1 → difficulty, nudged up one tier when the student is trending upward. */
function adaptiveDifficulty(ready, ctx) {
  var tier = ready < 0.45 ? 'easy' : ready < 0.72 ? 'medium' : 'hard';
  var improving = ctx && ctx.trends && ctx.trends.accuracy && ctx.trends.accuracy.direction === 'improving';
  if (improving) tier = tier === 'easy' ? 'medium' : 'hard';
  return tier;
}

/** Build the explainability string for a task (deterministic fallback; the LLM may polish it later). */
function buildReason(topic, ready, revDue, examName, dependentsLabels) {
  if (revDue) return 'Due for spaced revision — keeping ' + topic.label + ' sharp before it fades.';
  var bits = [];
  bits.push((topic.frequency === 'high' ? 'High-frequency' : topic.frequency === 'medium' ? 'Regularly tested' : 'Worth covering') + ' in ' + examName);
  bits.push('your estimated readiness is ' + Math.round(ready * 100) + '%');
  if (dependentsLabels && dependentsLabels.length) bits.push('it unlocks ' + dependentsLabels.slice(0, 2).join(' & '));
  return bits.join('; ') + '.';
}

function makeTask(topic, kind, estMin, difficulty, priority, reason) {
  return {
    topicId: topic.id, label: topic.label, section: topic.section,
    estMin: Math.round(estMin), priority: _round(priority, 2), difficulty: difficulty,
    drillable: topic.drillable || null, kind: kind, reason: reason,
    done: false, completedAt: null, result: null
  };
}

/**
 * Generate the next 14-day block.
 * @param {object} input {syllabus, topicState, ctx, daysRemaining, dailyMinutes, daysPerWeek, prepLevel,
 *                        preferredTime, blockIndex, startDate, examName, recentDailyMinutes}
 */
function generateBlock(input) {
  var syllabus = input.syllabus;
  var ctx = input.ctx || {};
  var topicState = input.topicState || {};
  var prepLevel = input.prepLevel || 'average';
  var dailyMinutes = Math.max(MIN_TASK_MIN, Math.min(480, Number(input.dailyMinutes) || 45));
  var daysPerWeek = clamp(Number(input.daysPerWeek) || 6, 1, 7);
  var startDate = input.startDate || _todayIso();
  var examName = input.examName || 'your exam';
  var perTopicCap = clamp(dailyMinutes * 0.6, 25, 60);
  var threshold = prereqThreshold(prepLevel);

  // dependents map (for explainability) + readiness map
  var dependents = {};
  syllabus.topics.forEach(function (t) {
    (t.prereqs || []).forEach(function (p) { (dependents[p] = dependents[p] || []).push(t.label); });
  });
  var readyMap = readiness.readinessMap(syllabus, ctx, topicState);

  // per-topic scoring meta
  var meta = syllabus.topics.map(function (t) {
    var ts = topicState[t.id] || {};
    var cov = clamp(Number(ts.coveragePct) || 0, 0, 1);
    var ready = readyMap[t.id];
    var revDue = isRevisionDue(t, ts, startDate);
    var score = t.importance * 0.40 + (1 - ready) * 0.35 + prepWeight(prepLevel, t) * 0.15 + (revDue ? 0.10 : 0);
    return { topic: t, cov: cov, ready: ready, revDue: revDue, score: score };
  });
  var byScore = meta.slice().sort(function (a, b) { return b.score - a.score; });

  // projected coverage mutates as we schedule, so prereqs cascade-unlock within the block
  var projCov = {};
  syllabus.topics.forEach(function (t) { projCov[t.id] = clamp(Number((topicState[t.id] || {}).coveragePct) || 0, 0, 1); });

  // revision queue: due first, then partially-covered weak topics — highest score first
  var revisionQueue = byScore
    .filter(function (m) { return m.revDue || (m.cov > 0 && m.cov < 0.6); })
    .map(function (m) { return m.topic.id; });

  var dayPlan = pickDayKinds(startDate, daysPerWeek);
  var scheduledCount = {};
  var days = [], studyDayCounter = 0;

  dayPlan.forEach(function (dp) {
    if (!dp.isStudy) { days.push({ date: dp.date, dow: dp.dow, kind: 'rest', tasks: [] }); return; }
    studyDayCounter++;
    var budget = dailyMinutes, tasks = [], used = {};

    // interleave one revision task every other study day (consistency without crowding out new learning)
    if (revisionQueue.length && studyDayCounter % 2 === 1) {
      var rid = revisionQueue.shift();
      var rm = meta.find(function (m) { return m.topic.id === rid; });
      if (rm) {
        var rEst = Math.min(REVISE_TASK_MIN, budget);
        tasks.push(makeTask(rm.topic, 'revise', rEst, adaptiveDifficulty(rm.ready, ctx), rm.score,
          buildReason(rm.topic, rm.ready, true, examName, dependents[rid])));
        budget -= rEst; used[rid] = true;
        scheduledCount[rid] = (scheduledCount[rid] || 0) + 1;
      }
    }

    // fill with highest-score, prereq-unlocked, not-yet-covered topics
    for (var i = 0; i < byScore.length && budget >= MIN_TASK_MIN; i++) {
      var m = byScore[i], id = m.topic.id;
      if (used[id]) continue;
      if (projCov[id] >= FULLY_COVERED) continue;
      if (!prereqsMet(m.topic, projCov, threshold)) continue;
      var remEst = m.topic.estMinutes * (1 - projCov[id]);
      var chunk = Math.min(remEst, perTopicCap, budget);
      if (chunk < MIN_TASK_MIN) continue;
      tasks.push(makeTask(m.topic, 'learn', chunk, adaptiveDifficulty(m.ready, ctx), m.score,
        buildReason(m.topic, m.ready, false, examName, dependents[id])));
      budget -= chunk;
      projCov[id] = clamp(projCov[id] + chunk / m.topic.estMinutes, 0, 1);
      used[id] = true;
      scheduledCount[id] = (scheduledCount[id] || 0) + 1;
    }

    days.push({ date: dp.date, dow: dp.dow, kind: 'study', tasks: tasks });
  });

  // forecast (pre-block coverage) drives the adaptive buffer/mock decision
  var forecast = readiness.completionForecast(syllabus, topicState, {
    dailyMinutes: dailyMinutes, daysPerWeek: daysPerWeek, examDate: input.examDate,
    recentDailyMinutes: input.recentDailyMinutes
  });
  days = applyAdaptiveDays(days, { forecast: forecast, prepLevel: prepLevel, byScore: byScore, projCov: projCov,
    ctx: ctx, examName: examName, dailyMinutes: dailyMinutes, threshold: threshold, dependents: dependents });

  // exam readiness snapshot
  var examReadiness = readiness.examReadinessScore(syllabus, ctx, topicState, {});

  // topicStatePatch: bump timesScheduled (coverage is credited on completion, not generation)
  var topicStatePatch = {};
  Object.keys(scheduledCount).forEach(function (id) {
    var prev = topicState[id] || {};
    topicStatePatch[id] = { timesScheduled: (Number(prev.timesScheduled) || 0) + scheduledCount[id] };
  });

  var rationaleSeed = buildRationaleSeed(byScore, revisionQueue, examReadiness, forecast, examName, input.blockIndex, input.daysRemaining);

  return {
    days: days,
    rationaleSeed: rationaleSeed,
    topicStatePatch: topicStatePatch,
    readiness: readyMap,
    examReadiness: examReadiness,
    forecast: forecast
  };
}

/**
 * Adaptive buffer/mock: convert one trailing rest day. Behind schedule → a recovery 'buffer' day of the
 * highest-gap unlocked topics; comfortably ahead (or 'ready') → a 'mock' review day. Dynamic, not hardcoded.
 */
function applyAdaptiveDays(days, o) {
  var lastRestIdx = -1;
  for (var i = days.length - 1; i >= 0; i--) { if (days[i].kind === 'rest') { lastRestIdx = i; break; } }
  if (lastRestIdx < 0) return days;

  var behind = o.forecast && o.forecast.onTrack === false;
  var ahead = (o.forecast && o.forecast.bufferDays != null && o.forecast.bufferDays > 10) || o.prepLevel === 'ready';

  if (behind) {
    var picks = o.byScore.filter(function (m) {
      return o.projCov[m.topic.id] < 0.95 && prereqsMet(m.topic, o.projCov, o.threshold);
    }).slice(0, 2);
    var tasks = picks.map(function (m) {
      return makeTask(m.topic, 'learn', Math.min(o.dailyMinutes / Math.max(1, picks.length), 45),
        adaptiveDifficulty(m.ready, o.ctx), m.score,
        'Recovery day — catching up ' + m.topic.label + ' to stay on pace for ' + o.examName + '.');
    });
    days[lastRestIdx] = { date: days[lastRestIdx].date, dow: days[lastRestIdx].dow, kind: 'buffer', tasks: tasks };
  } else if (ahead) {
    days[lastRestIdx] = {
      date: days[lastRestIdx].date, dow: days[lastRestIdx].dow, kind: 'mock',
      tasks: [{
        topicId: 'mock', label: 'Mixed Mock Review', section: 'Mock',
        estMin: Math.min(o.dailyMinutes, 45), priority: 0.6, difficulty: 'hard', drillable: null,
        kind: 'mock', reason: "You're ahead — a timed mixed review locks in speed and exposes gaps.",
        done: false, completedAt: null, result: null
      }]
    };
  }
  return days;
}

function buildRationaleSeed(byScore, revisionQueue, examReadiness, forecast, examName, blockIndex, daysRemaining) {
  var focus = [], seen = {};
  for (var i = 0; i < byScore.length && focus.length < 4; i++) {
    var m = byScore[i];
    if (m.cov < 0.95 && !seen[m.topic.id]) { focus.push({ label: m.topic.label, readinessPct: Math.round(m.ready * 100), reason: m.revDue ? 'revision-due' : 'high-priority' }); seen[m.topic.id] = true; }
  }
  return {
    examName: examName, blockIndex: blockIndex || 0,
    daysRemaining: daysRemaining || null, daysToExam: forecast.daysToExam != null ? forecast.daysToExam : (daysRemaining || null),
    focusTopics: focus,
    revisionCount: revisionQueue.length,
    readinessScore: examReadiness.score, readinessBand: examReadiness.band,
    onTrack: forecast.onTrack, bufferDays: forecast.bufferDays, sessionsRemaining: forecast.sessionsRemaining
  };
}

/**
 * Credit a completed task to topicState (server applies this on toggle). Returns a {patch:{topicId:{...}}}.
 * @param {object} event {topicId, estMin, kind, result, dateIso}
 */
function applyCompletion(topicState, syllabus, event) {
  var ts = Object.assign({}, (topicState && topicState[event.topicId]) || {});
  var topic = null;
  for (var i = 0; i < syllabus.topics.length; i++) { if (syllabus.topics[i].id === event.topicId) { topic = syllabus.topics[i]; break; } }
  if (!topic) return { patch: {} };

  var dateIso = event.dateIso || _todayIso();
  var credit = (Number(event.estMin) || 0) / topic.estMinutes;
  ts.coveragePct = clamp((Number(ts.coveragePct) || 0) + credit, 0, 1);
  ts.lastStudiedAt = dateIso;
  if (!ts.firstStudiedAt) ts.firstStudiedAt = dateIso;
  if (event.kind === 'revise') ts.lastRevisedAt = dateIso;
  ts.nextRevisionDue = addDays(dateIso, topic.revisionIntervalDays);

  // if the drill returned a result, fold its accuracy into a running mastery estimate
  if (event.result && typeof event.result.accuracy === 'number') {
    var prev = typeof ts.masteryEst === 'number' ? ts.masteryEst : event.result.accuracy;
    ts.masteryEst = _round(0.6 * prev + 0.4 * event.result.accuracy, 3);
  }
  var patch = {}; patch[event.topicId] = ts;
  return { patch: patch };
}

/**
 * Smart Catch-up: past study days whose tasks are all incomplete get their undone tasks rebalanced into
 * the remaining study days of the block (cap dailyMinutes*1.4), then the empty past days marked 'missed'.
 */
function rebalanceMissed(days, todayIso, dailyMinutes) {
  var cap = dailyMinutes * 1.4;
  var carried = [];
  days.forEach(function (d) {
    if (d.date < todayIso && (d.kind === 'study' || d.kind === 'buffer')) {
      var undone = d.tasks.filter(function (t) { return !t.done; });
      if (undone.length && undone.length === d.tasks.length) {
        carried = carried.concat(undone);
        d.tasks = [];
        d.kind = 'missed';
      }
    }
  });
  if (!carried.length) return days;

  var futureStudy = days.filter(function (d) { return d.date >= todayIso && (d.kind === 'study' || d.kind === 'buffer'); });
  var di = 0;
  carried.forEach(function (task) {
    var placed = false;
    for (var tries = 0; tries < futureStudy.length && !placed; tries++) {
      var d = futureStudy[(di + tries) % futureStudy.length];
      var load = d.tasks.reduce(function (s, t) { return s + t.estMin; }, 0);
      if (load + task.estMin <= cap) { d.tasks.push(task); placed = true; di++; }
    }
    if (!placed && futureStudy.length) futureStudy[di % futureStudy.length].tasks.push(task); // overflow: least-bad
  });
  return days;
}

module.exports = {
  generateBlock: generateBlock,
  applyCompletion: applyCompletion,
  rebalanceMissed: rebalanceMissed,
  // exposed for tests
  weekStudyOffsets: weekStudyOffsets,
  pickDayKinds: pickDayKinds,
  prepWeight: prepWeight,
  isRevisionDue: isRevisionDue,
  adaptiveDifficulty: adaptiveDifficulty,
  addDays: addDays
};
