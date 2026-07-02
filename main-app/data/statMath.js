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
  var SPD_DELTA_SEC = 0.3;       // s/Q move that counts as faster/slower (ADR-055: seconds, not ms)
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
    // ADR-055: a trend needs >= 2 distinct active days. With one day d7===d30 — there is NO history to compare,
    // so `direction` is null (not a fabricated "flat") and `multiDay` tells consumers to label it honestly.
    var ad = activeDays(stats);
    var multiDay = ad >= 2;
    var delta = (multiDay && d7 != null && d30 != null) ? d7 - d30 : 0;
    return { d7: _round(d7, 3), d30: _round(d30, 3), delta: _round(delta, 3), activeDays: ad, multiDay: multiDay,
      direction: !multiDay ? null : (delta > ACC_DELTA ? 'improving' : (delta < -ACC_DELTA ? 'declining' : 'flat')) };
  }

  /** Speed in SECONDS/Q (ADR-055 — sumTimes is seconds): recent (7d) vs baseline (8–30d) + overall, from dailyHistory. */
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
    var r = recent.cnt > 0 ? recent.sum / recent.cnt : null;   // already SECONDS/Q
    var b = prior.cnt > 0 ? prior.sum / prior.cnt : null;
    var o = all.cnt > 0 ? all.sum / all.cnt : null;
    var multiDay = activeDays(stats) >= 2;
    var delta = (multiDay && r != null && b != null) ? r - b : 0;
    return { recentSecPerQ: r != null ? _round(r, 1) : null, baselineSecPerQ: b != null ? _round(b, 1) : null,
      overallSecPerQ: o != null ? _round(o, 1) : null, deltaSec: _round(delta, 1),
      direction: (!multiDay || b == null) ? null : (delta < -SPD_DELTA_SEC ? 'faster' : (delta > SPD_DELTA_SEC ? 'slower' : 'flat')) };
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

  /** Live "today" signal — date-keyed so it never bleeds across days, with a counter fallback. avgSecPerQ in SECONDS. */
  function today(stats) {
    stats = stats || {};
    var e = ((stats.dailyHistory) || {})[_todayKey()] || {};
    var att = Number(e.attempted) || 0, cor = Number(e.correct) || 0;
    if (!att) { att = Number(stats.todayAttempted) || 0; cor = Number(stats.todayCorrect) || 0; }
    var avgSec = (e.count > 0 && e.sumTimes) ? _round(Number(e.sumTimes) / Number(e.count), 1) : null;
    return { attempted: att, correct: cor, accuracy: att > 0 ? _round(cor / att, 2) : null, avgSecPerQ: avgSec };
  }

  /** Distinct days with any attempts — the real span of history (ADR-055: the anti-fabrication signal). */
  function activeDays(stats) {
    var hist = (stats && stats.dailyHistory) || {}, n = 0;
    Object.keys(hist).forEach(function (k) { if (_ms(k) && (Number(hist[k] && hist[k].attempted) || 0) > 0) n++; });
    return n;
  }

  /**
   * Per-SUBJECT rollup (ADR-076, V2 Phase 4) — the ONE derived view of "how am I doing per subject", so Analytics
   * and QuanAI agree. DERIVED on read from categoryStats; nothing stored (no migration). To keep statMath
   * dependency-free, the caller PASSES the subject→categories map in (client/server both source it from subjects.js):
   *   subjectCats = { quant:[...14], di:[...5], lr:[...7] }
   * Returns { subjectId: {subject, attempted, correct, acc(0..1), n, tier|null} } for subjects with any attempts.
   * tier is null below MIN_ATTEMPTS (honest — never tier on thin data).
   */
  function subjectRollup(stats, subjectCats) {
    var cs = (stats && stats.categoryStats) || {}, out = {};
    Object.keys(subjectCats || {}).forEach(function (sid) {
      var cats = subjectCats[sid] || [], att = 0, cor = 0;
      cats.forEach(function (cat) { var d = cs[cat] || {}; att += Number(d.attempted) || 0; cor += Number(d.correct) || 0; });
      if (att > 0) {
        var acc = cor / att;
        out[sid] = { subject: sid, attempted: att, correct: cor, acc: _round(acc, 2), n: att, tier: att >= MIN_ATTEMPTS ? _tierOf(acc) : null };
      }
    });
    return out;
  }

  /** The weakest subject with enough data (or null) — the basis for a cross-subject "focus here next" nudge. */
  function weakestSubject(stats, subjectCats) {
    var roll = subjectRollup(stats, subjectCats), best = null;
    Object.keys(roll).forEach(function (sid) {
      var r = roll[sid]; if (r.tier == null) return;
      if (!best || r.acc < best.acc || (r.acc === best.acc && r.n > best.n)) best = r;
    });
    return best ? best.subject : null;
  }

  /** Evidence/confidence the AI is allowed to claim — bounds every statement so nothing is fabricated. */
  function evidence(stats) {
    var n = Number(stats && stats.totalAttempted) || 0, ad = activeDays(stats);
    var conf = ad <= 1 ? 'first-session' : ad <= 4 ? 'early' : (ad <= 13 && n < 500) ? 'established' : 'rich';
    return { totalAttempted: n, activeDays: ad, hasMultiDayHistory: ad >= 2, confidence: conf };
  }

  // ── ADR-080 derivations: time invested · per-subject mastery detail · weakest topics · the single next
  //    recommendation. All PURE; thin-data is damped, never fabricated. ──

  /** Total solving time (seconds) over today / 7d / 30d / all from dailyHistory, plus a lifetime per-subject split
   *  from per-category `sumTime` (caller passes subjectCats). Time windows are global; bySubject is lifetime. */
  function timeInvested(stats, subjectCats) {
    var hist = (stats && stats.dailyHistory) || {}, now = Date.now(), tkey = _todayKey();
    var today = 0, week = 0, month = 0, total = 0;
    Object.keys(hist).forEach(function (k) {
      var t = _ms(k); if (!t) return; var s = Number(hist[k] && hist[k].sumTimes) || 0;
      total += s; var age = (now - t) / DAY;
      if (age <= 7) week += s; if (age <= 30) month += s; if (k === tkey) today += s;
    });
    var bySubject = {};
    if (subjectCats) {
      var cs = (stats && stats.categoryStats) || {};
      Object.keys(subjectCats).forEach(function (sid) {
        var sec = 0; (subjectCats[sid] || []).forEach(function (cat) { sec += Number(cs[cat] && cs[cat].sumTime) || 0; });
        if (sec > 0) bySubject[sid] = _round(sec, 0);
      });
    }
    return { todaySec: _round(today, 0), weekSec: _round(week, 0), monthSec: _round(month, 0), totalSec: _round(total, 0), bySubject: bySubject };
  }

  /** Per-subject mastery detail for the Stats "Subject Mastery" block: { sid: {pct, acc, n, lastTs, confidence,
   *  tier, weakAreas[]} }. weakAreas = up to 3 weakest categories (acc < WEAK) in that subject. */
  function masteryDetail(stats, subjectCats) {
    var cs = (stats && stats.categoryStats) || {}, out = {};
    Object.keys(subjectCats || {}).forEach(function (sid) {
      var cats = subjectCats[sid] || [], att = 0, cor = 0, lastTs = 0, catAccs = [];
      cats.forEach(function (cat) {
        var d = cs[cat] || {}, a = Number(d.attempted) || 0, c = Number(d.correct) || 0;
        att += a; cor += c;
        if (d.lastTs && d.lastTs > lastTs) lastTs = d.lastTs;
        if (a >= MIN_ATTEMPTS) catAccs.push({ cat: cat, acc: c / a, n: a });
      });
      if (att <= 0) return;
      var acc = cor / att;
      catAccs.sort(function (x, y) { return x.acc - y.acc; });
      out[sid] = {
        subject: sid, pct: _round(acc * 100, 0), acc: _round(acc, 2), n: att, lastTs: lastTs || null,
        confidence: att >= 30 ? 'high' : att >= 10 ? 'medium' : 'low',
        tier: att >= MIN_ATTEMPTS ? _tierOf(acc) : null,
        weakAreas: catAccs.filter(function (x) { return x.acc < WEAK; }).slice(0, 3).map(function (x) { return x.cat; })
      };
    });
    return out;
  }

  /** Ranked weakest categories (≥ MIN_ATTEMPTS), weakest-first — the "study next" list. */
  function weakestTopics(stats, limit) {
    return deriveMastery(stats).filter(function (m) { return m.tier === 'weak' || m.acc < STRONG; }).slice(0, limit || 5);
  }

  /** The single best "revise X next" pick: among exam-relevant categories the user is weak/under-practised on,
   *  rank by importance(for the active track, else overall priority) × gap. Optional `thenCat` = a higher-order
   *  relevant category in the same flow the user is already practising. Returns null when there's nothing to suggest. */
  function nextRecommendation(stats, weightedCats, track) {
    weightedCats = weightedCats || [];
    var cs = (stats && stats.categoryStats) || {};
    var best = null;
    weightedCats.forEach(function (row) {
      var d = cs[row.cat] || {}, a = Number(d.attempted) || 0, c = Number(d.correct) || 0;
      var acc = a > 0 ? c / a : 0;
      var imp = track && row.weights ? (row.weights[track] || 0) : 0;
      var prio = imp || ({ high: 3, medium: 2, low: 1 }[row.priority] || 1);
      if (prio <= 0) return;
      // gap: unpractised high-value topics and weak practised ones both deserve attention
      var gap = a < MIN_ATTEMPTS ? 0.8 : (1 - acc);
      if (gap <= 0.15) return;                 // already strong → skip
      var score = prio * gap;
      if (!best || score > best.score) best = { cat: row.cat, order: row.order, score: score, acc: a > 0 ? _round(acc, 2) : null, practised: a >= MIN_ATTEMPTS };
    });
    if (!best) return null;
    // thenCat: a higher-order relevant category the user is already practising (so "revise X before continuing Y")
    var then = null;
    weightedCats.forEach(function (row) {
      if (row.cat === best.cat || row.order == null || best.order == null || row.order <= best.order) return;
      var d = cs[row.cat] || {}; if ((Number(d.attempted) || 0) < MIN_ATTEMPTS) return;
      if (!then || row.order < then.order) then = { cat: row.cat, order: row.order };
    });
    return { reviseCat: best.cat, acc: best.acc, practised: best.practised, thenCat: then ? then.cat : null };
  }

  var API = {
    MIN_ATTEMPTS: MIN_ATTEMPTS,
    masteryForCat: masteryForCat, masteryMap: masteryMap, deriveMastery: deriveMastery,
    weakest: weakest, strongest: strongest,
    subjectRollup: subjectRollup, weakestSubject: weakestSubject,
    overallAccuracy: overallAccuracy, accuracyWindows: accuracyWindows,
    speed: speed, consistency: consistency, today: today,
    activeDays: activeDays, evidence: evidence,
    timeInvested: timeInvested, masteryDetail: masteryDetail,
    weakestTopics: weakestTopics, nextRecommendation: nextRecommendation
  };

  // Dual-mode export (same pattern as syllabus.js): <script> on the client exposes window.QR_STATMATH;
  // Node require()'d on the server gets the same object.
  root.QR_STATMATH = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
