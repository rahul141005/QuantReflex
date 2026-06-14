/**
 * planLogic.js — deterministic Study-Planner logic (ADR-045). PURE: no firebase-admin, no I/O.
 *
 * Two jobs the model must NOT do (deterministic math can't hallucinate — AI_INTERACTION_SYSTEM §0):
 *   1. normalizePlan(): turn the model's free-text plan into a feasible, internally-consistent,
 *      drillable plan — phase durations that actually sum to the time remaining, and weekly-focus
 *      topics resolved to REAL categories (so the "this week" card and the launched drill agree).
 *   2. missionProgress(): make the plan feel ALIVE from real practice data — which phase you're in,
 *      which focus topics you've touched this week, whether you've already drilled today, and whether
 *      the week's plan has gone stale — all computed, never guessed by the LLM.
 */
var topics = require('./quantTopics');

function _int(n, def) { n = Math.round(Number(n)); return isNaN(n) ? def : n; }
function _str(s, def) { s = (s == null ? '' : String(s)).trim(); return s || def; }

/* Resolve one weekFocus entry's free-text label to a canonical category, preferring an exact weak-topic. */
function _resolveCat(entryLabel, weakCats) {
  var direct = topics.nearestCategory(entryLabel);
  if (direct) return direct;
  // fall back to matching against the student's known weak categories by label text
  var n = String(entryLabel || '').toLowerCase();
  for (var i = 0; i < (weakCats || []).length; i++) {
    var w = weakCats[i];
    if (w && (n.indexOf(String(w.label || '').toLowerCase()) >= 0 || n.indexOf(String(w.cat || '').toLowerCase()) >= 0)) return w.cat;
  }
  return null;
}

/** Scale positive integer phase durations so they sum to exactly `total` (distribute the remainder). */
function _scaleDurations(durations, total) {
  var sum = durations.reduce(function (a, b) { return a + b; }, 0);
  if (sum <= 0) {
    var base = Math.max(1, Math.floor(total / durations.length));
    durations = durations.map(function () { return base; });
    sum = base * durations.length;
  }
  var scaled = durations.map(function (d) { return Math.max(1, Math.round(d / sum * total)); });
  // fix rounding drift against `total`
  var diff = total - scaled.reduce(function (a, b) { return a + b; }, 0);
  var i = 0;
  while (diff !== 0 && scaled.length) {
    var idx = i % scaled.length;
    if (diff > 0) { scaled[idx] += 1; diff -= 1; }
    else if (scaled[idx] > 1) { scaled[idx] -= 1; diff += 1; }
    i += 1;
    if (i > total + scaled.length + 10) break; // safety
  }
  return scaled;
}

/**
 * Normalize a raw model plan into a feasible, grounded one.
 * @param {{rationale?,weekFocus?,phases?}} plan
 * @param {{daysRemaining:number, weakCats?:Array<{cat,label}>}} opts
 * @returns {{rationale, weekFocus:Array<{topicLabel,goal,cat}>, phases:Array<{name,durationDays}>}}
 */
function normalizePlan(plan, opts) {
  plan = plan || {};
  opts = opts || {};
  var days = Math.max(1, _int(opts.daysRemaining, 60));
  var weakCats = Array.isArray(opts.weakCats) ? opts.weakCats : [];

  // ---- weekFocus: 1-5 entries, each resolved to a real drillable category ----
  var rawFocus = Array.isArray(plan.weekFocus) ? plan.weekFocus.slice(0, 8) : [];
  var seen = {}, focus = [];
  rawFocus.forEach(function (f) {
    if (!f || focus.length >= 5) return;
    var labelText = _str(f.topicLabel, '');
    if (!labelText) return;
    var cat = _resolveCat(labelText, weakCats);
    if (!cat || seen[cat]) return;        // drop hallucinated / duplicate topics
    seen[cat] = true;
    focus.push({ topicLabel: topics.label(cat), goal: _str(f.goal, 'Build accuracy and speed.'), cat: cat });
  });
  // backfill from the student's weak topics if the model gave us nothing usable
  if (!focus.length) {
    (weakCats.length ? weakCats : [{ cat: 'percentages', label: topics.label('percentages') }])
      .slice(0, 3).forEach(function (w) {
        if (seen[w.cat]) return; seen[w.cat] = true;
        focus.push({ topicLabel: topics.label(w.cat), goal: 'Lift accuracy above 70%.', cat: w.cat });
      });
  }

  // ---- phases: 1-4, integer durations that sum to daysRemaining ----
  var rawPhases = Array.isArray(plan.phases) ? plan.phases.filter(Boolean).slice(0, 4) : [];
  if (!rawPhases.length) rawPhases = [{ name: 'Build accuracy' }, { name: 'Build speed' }];
  var durations = _scaleDurations(rawPhases.map(function (p) { return Math.max(1, _int(p.durationDays, 1)); }), days);
  var phases = rawPhases.map(function (p, i) { return { name: _str(p.name, 'Phase ' + (i + 1)), durationDays: durations[i] }; });

  return {
    rationale: _str(plan.rationale, 'A focused plan built around your weakest topics, adapting weekly from your real progress.'),
    weekFocus: focus,
    phases: phases
  };
}

/**
 * Derive live progress for a stored plan from real practice signals (no LLM).
 * @param {{weekFocus?,phases?,examDate?,examName?,dailyMinutes?,weekStartedAt?}} plan
 * @param {{mastery?:Array, weekCats?:Array<string>, todayCats?:Array<string>, weekStartedAt?:string, now?:number}} o
 */
function missionProgress(plan, o) {
  plan = plan || {}; o = o || {};
  var now = o.now || Date.now();
  var DAY = 86400000;
  var weekStart = o.weekStartedAt || plan.weekStartedAt;
  var startMs = weekStart ? new Date(weekStart).getTime() : now;
  if (isNaN(startMs)) startMs = now;
  var daysIntoWeek = Math.max(0, Math.floor((now - startMs) / DAY));

  var accByCat = {};
  (o.mastery || []).forEach(function (m) { if (m && m.cat) accByCat[m.cat] = m.acc; });
  var weekCats = o.weekCats || [];
  var todayCats = o.todayCats || [];

  // phases: done / current from elapsed days vs cumulative durations
  var cum = 0;
  var phases = (plan.phases || []).map(function (ph) {
    var dur = Math.max(1, _int(ph.durationDays, 1));
    var start = cum, end = cum + dur; cum = end;
    return { name: ph.name, durationDays: dur,
      done: end <= daysIntoWeek,
      current: start <= daysIntoWeek && daysIntoWeek < end };
  });

  // weekly focus: real accuracy + whether touched this week / goal met
  var focus = (plan.weekFocus || []).map(function (f) {
    var cat = f.cat || topics.nearestCategory(f.topicLabel);
    var acc = (cat && accByCat[cat] != null) ? accByCat[cat] : null;
    return { cat: cat, label: f.topicLabel || topics.label(cat), goal: f.goal || '',
      acc: acc,
      practicedThisWeek: cat ? weekCats.indexOf(cat) >= 0 : false,
      met: acc != null && acc >= 0.7 };
  });

  var dailyCat = (focus[0] && focus[0].cat) || null;
  return {
    phases: phases,
    focus: focus,
    daysIntoWeek: daysIntoWeek,
    todayDoneCat: (dailyCat && todayCats.indexOf(dailyCat) >= 0) ? dailyCat : null,
    weekStale: daysIntoWeek > 7
  };
}

module.exports = { normalizePlan: normalizePlan, missionProgress: missionProgress };
