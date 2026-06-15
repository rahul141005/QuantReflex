/**
 * statMath.js — the ONE derivation layer for student signals (ADR-053).
 *
 * Every "what does this number mean" calculation lives here exactly once: per-category mastery/tier,
 * weakest/strongest topic, overall accuracy, the 7d/30d accuracy windows, speed (recent vs baseline),
 * today's live signal, and streak/consistency health. It is PURE: every function takes a `stats` object
 * — `{ totalAttempted, totalCorrect, categoryStats{cat:{attempted,correct}}, dailyHistory{toDateStringKey:
 * {attempted,correct,sumTimes,count}}, mistakes[] }` — and returns derived numbers. No Firestore, no DOM,
 * no LLM, no side effects.
 *
 * It is consumed by BOTH sides so Analytics and QuanAI can never disagree (the root cause of "Analytics
 * knows me but Coach doesn't"): the server reads it from `services/studentProfile.js`; the client reads it
 * from `js/progress.js` + `js/views/stats-view.js`. It is therefore BUNDLED + dual-exported the same way
 * `syllabus.js` is — loaded as a <script> on the client (window.QR_STATMATH), require()'d on the server.
 * Self-contained (no requires) so it works identically in both runtimes.
 *
 * `stats.dailyHistory` keys are `new Date().toDateString()` on BOTH client and server (the practice path
 * writes them, the floor preserves them), so the window math is identical everywhere — no migration.
 */
(function (root) {
  'use strict';

  // ── single-sourced thresholds (the only place these live) ──
  var MIN_ATTEMPTS = 3;          // enough data to tier a category weak/strong (matches signals.hasDirectData)
  var WEAK = 0.6, STRONG = 0.8;  // accuracy tier cut points
  var DAY = 86400000;
  var ACC_DELTA = 0.02;          // 7d-vs-30d accuracy move that counts as a real direction
  var SPD_DELTA_MS = 300;        // ms/Q move that counts as faster/slower
  var GAP_BROKEN = 3, ACTIVE_STRONG = 8; // streak-health day thresholds

  function _round(n, d) { var f = Math.pow(10, d || 0); return Math.round((Number(n) || 0) * f) / f; }
  function _ms(dateKey) { if (!dateKey) return 0; var t = new Date(dateKey).getTime(); return isNaN(t) ? 0 : t; }
  function _tierOf(acc) { return acc < WEAK ? 'weak' : (acc >= STRONG ? 'strong' : 'developing'); }
  function _todayKey() { return new Date().toDateString(); }

  /** Mastery for ONE category, or null below the data floor. The single weak/strong resolver. */
  function masteryForCat(stats, cat) {
    var d = ((stats && stats.categoryStats) || {})[cat] || {};
    var att = Number(d.attempted) || 0, cor = Number(d.correct) || 0;
    if (att < MIN_ATTEMPTS) return null;
    var acc = cor / att;
    return { cat: cat, acc: _round(acc, 2), n: att, tier: _tierOf(acc) };
  }

  /** Every category with enough data as a {cat:{acc,n,tier}} map — for arbitrary-category lookups. */
  function masteryMap(stats) {
    var cs = (stats && stats.categoryStats) || {}, out = {};
    Object.keys(cs).forEach(function (cat) { var m = masteryForCat(stats, cat); if (m) out[cat] = m; });
    return out;
  }

  /** Every category with enough data, weakest-first then by sample size (top 8). */
  function deriveMastery(stats) {
    var cs = (stats && stats.categoryStats) || {}, out = [];
    Object.keys(cs).forEach(function (cat) {
      var m = masteryForCat(stats, cat);
      if (m) out.push(m);
    });
    out.sort(function (a, b) { return a.acc - b.acc || b.n - a.n; });
    return out.slice(0, 8);
  }

  /** Weakest / strongest category key (or null) — the relative ends of the mastery list (≥ MIN_ATTEMPTS). */
  function weakest(stats) {
    var m = deriveMastery(stats);
    return m.length ? m[0].cat : null;   // already weakest-first
  }
  function strongest(stats) {
    var m = deriveMastery(stats);
    if (!m.length) return null;
    var best = m[0];
    for (var i = 1; i < m.length; i++) { if (m[i].acc > best.acc || (m[i].acc === best.acc && m[i].n > best.n)) best = m[i]; }
    return best.cat;   // the student's relative best (matches the Analytics "strongest area" display)
  }

  /** Lifetime accuracy 0..1 (null when no attempts — never a misleading 0). */
  function overallAccuracy(stats) {
    var att = Number(stats && stats.totalAttempted) || 0, cor = Number(stats && stats.totalCorrect) || 0;
    return att > 0 ? cor / att : null;
  }

  /** 7d vs 30d accuracy windows + direction, from dailyHistory. */
  function accuracyWindows(stats) {
    var hist = (stats && stats.dailyHistory) || {}, now = Date.now();
    var w7 = { att: 0, cor: 0 }, w30 = { att: 0, cor: 0 };
    Object.keys(hist).forEach(function (k) {
      var t = _ms(k); if (!t) return; var e = hist[k] || {};
      var att = Number(e.attempted) || 0, cor = Number(e.correct) || 0, age = (now - t) / DAY;
      if (age <= 7) { w7.att += att; w7.cor += cor; }
      if (age <= 30) { w30.att += att; w30.cor += cor; }
    });
    var d7 = w7.att > 0 ? w7.cor / w7.att : null;
    var d30 = w30.att > 0 ? w30.cor / w30.att : null;
    var delta = (d7 != null && d30 != null) ? d7 - d30 : 0;
    return { d7: _round(d7, 3), d30: _round(d30, 3), delta: _round(delta, 3),
      direction: delta > ACC_DELTA ? 'improving' : (delta < -ACC_DELTA ? 'declining' : 'flat') };
  }

  /** Speed: recent (7d) vs baseline (8–30d) ms/Q + an overall ms/Q, from dailyHistory. */
  function speed(stats) {
    var hist = (stats && stats.dailyHistory) || {}, now = Date.now();
    var recent = { sum: 0, cnt: 0 }, prior = { sum: 0, cnt: 0 }, all = { sum: 0, cnt: 0 };
    Object.keys(hist).forEach(function (k) {
      var t = _ms(k); if (!t) return; var e = hist[k] || {};
      var sum = Number(e.sumTimes) || 0, cnt = Number(e.count) || 0, age = (now - t) / DAY;
      all.sum += sum; all.cnt += cnt;
      if (age <= 7) { recent.sum += sum; recent.cnt += cnt; }
      else if (age <= 30) { prior.sum += sum; prior.cnt += cnt; }
    });
    var r = recent.cnt > 0 ? recent.sum / recent.cnt : null;
    var b = prior.cnt > 0 ? prior.sum / prior.cnt : null;
    var o = all.cnt > 0 ? all.sum / all.cnt : null;
    var delta = (r != null && b != null) ? r - b : 0;
    return { recentMsPerQ: r != null ? Math.round(r) : null, baselineMsPerQ: b != null ? Math.round(b) : null,
      overallMsPerQ: o != null ? Math.round(o) : null, deltaMs: Math.round(delta),
      direction: delta < -SPD_DELTA_MS ? 'faster' : (delta > SPD_DELTA_MS ? 'slower' : 'flat') };
  }

  /** Consistency: active days in the last 14, gap since last active, streak health. */
  function consistency(stats) {
    var hist = (stats && stats.dailyHistory) || {}, now = Date.now();
    var activeDays14 = 0, lastActiveMs = 0;
    Object.keys(hist).forEach(function (k) {
      var t = _ms(k); if (!t) return; var e = hist[k] || {};
      var att = Number(e.attempted) || 0, age = (now - t) / DAY;
      if (t > lastActiveMs) lastActiveMs = t;
      if (age <= 14 && att > 0) activeDays14++;
    });
    var gapDays = lastActiveMs ? Math.floor((now - lastActiveMs) / DAY) : 99;
    return { activeDaysLast14: activeDays14, gapDays: gapDays,
      streakHealth: gapDays >= GAP_BROKEN ? 'broken' : (activeDays14 >= ACTIVE_STRONG ? 'strong' : 'fragile') };
  }

  /** Live "today" signal — date-keyed so it never bleeds across days, with a counter fallback. */
  function today(stats) {
    stats = stats || {};
    var e = ((stats.dailyHistory) || {})[_todayKey()] || {};
    var att = Number(e.attempted) || 0, cor = Number(e.correct) || 0;
    if (!att) { att = Number(stats.todayAttempted) || 0; cor = Number(stats.todayCorrect) || 0; }
    var avgMs = (e.count > 0 && e.sumTimes) ? Math.round(Number(e.sumTimes) / Number(e.count)) : null;
    return { attempted: att, correct: cor, accuracy: att > 0 ? _round(cor / att, 2) : null, avgMsPerQ: avgMs };
  }

  var API = {
    MIN_ATTEMPTS: MIN_ATTEMPTS,
    masteryForCat: masteryForCat, masteryMap: masteryMap, deriveMastery: deriveMastery,
    weakest: weakest, strongest: strongest,
    overallAccuracy: overallAccuracy, accuracyWindows: accuracyWindows,
    speed: speed, consistency: consistency, today: today
  };

  // Dual-mode export (same pattern as syllabus.js): <script> on the client exposes window.QR_STATMATH;
  // Node require()'d on the server gets the same object.
  root.QR_STATMATH = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
