/**
 * signals.js — the Signal-Inference layer of the QuanAI Planner (ADR-046).
 *
 * Treats the app's 12 drillable micro-topics as SIGNALS, not limits. Given a syllabus topic's weighted
 * `signals:[{cat,w}]` map, it infers an estimated readiness (0..1) from in-app practice — even for topics
 * the app cannot drill. The guiding rule is "never say no data": when no mapped cat has enough practice,
 * we fall back to overall accuracy, and ultimately to a neutral 0.5 — never zero.
 *
 * Pure functions over the `studentContext` ctx object (no Firestore, no LLM) — deterministic and testable.
 * Consumes: ctx.mastery [{cat,acc,n,tier}], ctx.accuracy, ctx.trends{speed,consistency,accuracy}.
 */
'use strict';

var clamp = require('./aiMath').clamp;   // shared impl (ADR-047); re-exported below for readiness/plannerEngine

/** Index ctx.mastery by cat for O(1) lookup. */
function masteryMap(ctx) {
  var m = {};
  ((ctx && ctx.mastery) || []).forEach(function (x) { if (x && x.cat) m[x.cat] = x; });
  return m;
}

/**
 * Global speed score 0..1 from recent ms/question (the per-cat split isn't tracked in ctx, so we use the
 * session-wide trend as an honest proxy). Fast ≈ confident: <=4s/Q → 1.0, >=16s/Q → 0.2, linear between.
 * No speed data → neutral 0.6.
 */
function speedScore(ctx) {
  var sec = ctx && ctx.trends && ctx.trends.speed ? ctx.trends.speed.recentSecPerQ : null;   // ADR-055: seconds/Q
  if (sec == null) return 0.6;
  return clamp(1 - ((sec - 4) / 12) * 0.8, 0.2, 1);
}

/** Consistency multiplier: steady practice → full confidence in the estimate; sporadic → discounted. */
function consistencyFactor(ctx) {
  var c = ctx && ctx.trends && ctx.trends.consistency ? ctx.trends.consistency : null;
  var active = c && c.activeDaysLast14 != null ? c.activeDaysLast14 : 7; // assume middling if unknown
  return clamp(0.85 + 0.15 * (active / 14), 0.85, 1);
}

/** The "never say no data" floor: lifetime accuracy if we have any, else a neutral 0.5. NEVER returns 0. */
function globalFallback(ctx) {
  var acc = ctx && typeof ctx.accuracy === 'number' ? ctx.accuracy : 0;
  return acc > 0 ? clamp(acc, 0.2, 0.95) : 0.5;
}

/** Per-cat skill estimate from real practice: 0.7·accuracy + 0.3·speed. Returns null when the cat is unproven. */
function catSkill(cat, mMap, ctx) {
  var m = mMap[cat];
  if (!m || (m.n || 0) < 3) return null;
  return 0.7 * m.acc + 0.3 * speedScore(ctx);
}

/**
 * Estimated readiness (0..1) for a topic from its weighted in-app signals. Topics with a direct drillable
 * cat carry signals:[{cat:thatCat,w:1}], so this also serves drillable topics that have practice data.
 */
function signalReadiness(topic, ctx) {
  var mMap = masteryMap(ctx);
  var num = 0, den = 0;
  (topic.signals || []).forEach(function (s) {
    var sk = catSkill(s.cat, mMap, ctx);
    if (sk != null) { num += s.w * sk; den += s.w; }
  });
  if (den === 0) return globalFallback(ctx);            // no mapped cat has data → never "no data"
  var base = num / den;
  return clamp(base * consistencyFactor(ctx), 0.2, 0.95);
}

/** True once a cat has enough in-app attempts to use its real accuracy directly. */
function hasDirectData(cat, ctx) {
  var m = masteryMap(ctx)[cat];
  return !!(m && (m.n || 0) >= 3);
}

module.exports = {
  clamp: clamp,
  masteryMap: masteryMap,
  speedScore: speedScore,
  consistencyFactor: consistencyFactor,
  globalFallback: globalFallback,
  catSkill: catSkill,
  signalReadiness: signalReadiness,
  hasDirectData: hasDirectData
};
