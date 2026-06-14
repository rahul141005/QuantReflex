/**
 * aiMath.js — shared, pure numeric/date micro-helpers for the AI + planner modules (ADR-047).
 *
 * Single source of truth for three helpers that were byte-identical across studentContext, aiBrain,
 * plannerEngine, readiness and signals. No I/O, no side effects.
 *
 * Helpers with DIFFERENT behaviour are deliberately NOT here (keep one implementation PER RESPONSIBILITY,
 * not per name): studentContext `_ms` parses toDateString keys while the planner `_ms` parses ISO
 * 'YYYY-MM-DD' keys; plannerEngine `addDays`/`dowOf` are ISO-date-specific. Those stay local by design.
 */
'use strict';

/** Round n to d decimal places; coerces non-numbers to 0. */
function round(n, d) { var f = Math.pow(10, d || 0); return Math.round((Number(n) || 0) * f) / f; }

/** Clamp x into [lo, hi]. */
function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

/** Today as an ISO date string 'YYYY-MM-DD' (UTC). */
function todayIso() { return new Date().toISOString().slice(0, 10); }

module.exports = { round: round, clamp: clamp, todayIso: todayIso };
