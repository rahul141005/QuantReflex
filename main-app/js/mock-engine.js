/**
 * mock-engine.js — sectional-timer mock spec + scoring for the QuanAI Planner (Phase D).
 *
 * A mock simulates an exam's QUANT SECTION under its real clock and marking scheme (unlike the open-ended
 * practice drills). It is pure data + math — no DOM, no timers here — so the same logic powers the browser
 * mock UI AND Node unit tests. The UI layer owns the countdown, question rendering and auto-submit; this
 * module decides WHAT to ask (a weightage-true blueprint over the exam's drillable topics) and HOW to score
 * it (the exam's own negative-marking scheme).
 *
 * Dual-mode export (same pattern as syllabus.js / questions.js): window.QR_MOCK in the browser, module.exports
 * under Node. Depends on QR_SYLLABUS for exam pattern + per-exam topic weightage.
 *
 *   buildMock(examId, opts) → { examId, examName, totalQuestions, durationSec, durationMin, negPerWrong,
 *                               calculator, sectional, secondsPerQuestion, blueprint:[{topicId,label,cat,count,weightage}] }
 *   score(mock, responses[, opts]) → { attempted, correct, wrong, skipped, score, maxScore, accuracy, secPerQ, perCat }
 *   resultForPlanner(mock, result) → { kind:'mock', label, result:{ accuracy, score, maxScore, attempted, total } }
 */
(function (root) {
  'use strict';

  var SYL = (typeof require !== 'undefined') ? require('../data/syllabus.js') : root.QR_SYLLABUS;

  function _round(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }

  /** Largest-remainder allocation of `total` questions across weighted candidates (keeps the sum exact). */
  function _allocate(cands, total) {
    var wsum = cands.reduce(function (a, c) { return a + c.w; }, 0) || 1;
    var rows = cands.map(function (c) { var exact = total * c.w / wsum; return { c: c, n: Math.floor(exact), rem: exact - Math.floor(exact) }; });
    var used = rows.reduce(function (a, r) { return a + r.n; }, 0);
    var left = total - used;
    rows.sort(function (a, b) { return b.rem - a.rem; });
    for (var i = 0; i < left; i++) rows[i % rows.length].n += 1;
    return rows;
  }

  /**
   * Build a mock spec for an exam. Draws only from the exam's DRILLABLE topics (the speed portion the app can
   * generate), weighted by their researched importance, so the question mix is true to the exam. Question count
   * and the single section clock come from the exam's verified `pattern` (overridable via opts for short mocks).
   */
  function buildMock(examId, opts) {
    opts = opts || {};
    var syl = SYL.resolveSyllabus(examId);
    if (!syl) return null;
    var p = syl.pattern || {};
    var totalQ = Math.max(1, opts.questions || p.quantQ || 20);
    var durationMin = opts.minutes || p.quantMin || 20;

    var cands = syl.topics.filter(function (t) { return t.drillable; })
      .map(function (t) { return { topicId: t.id, label: t.label, cat: t.drillable, w: t.importance || 0.4, weightage: t.weightage }; });
    if (!cands.length) return null;   // nothing drillable → no mock for this exam

    var alloc = _allocate(cands, totalQ);
    var blueprint = alloc.filter(function (r) { return r.n > 0; })
      .map(function (r) { return { topicId: r.c.topicId, label: r.c.label, cat: r.c.cat, count: r.n, weightage: r.c.weightage }; });

    return {
      examId: syl.examId, examName: (syl.name || examId).replace(/ Quant$/, ''),
      totalQuestions: totalQ, durationMin: durationMin, durationSec: durationMin * 60,
      secondsPerQuestion: _round(durationMin * 60 / totalQ, 1),
      negPerWrong: p.neg != null ? p.neg : 0, calculator: p.calc || 'none', sectional: !!p.sectional,
      book: syl.book || null, blueprint: blueprint
    };
  }

  /** Normalise responses (array of {answered,correct} OR a summary {correct,wrong,skipped}) into counts. */
  function _counts(mock, responses) {
    if (Array.isArray(responses)) {
      var correct = 0, attempted = 0;
      responses.forEach(function (r) { if (r && r.answered) { attempted++; if (r.correct) correct++; } });
      return { attempted: attempted, correct: correct, wrong: attempted - correct, skipped: mock.totalQuestions - attempted };
    }
    var r = responses || {};
    var c = r.correct || 0, w = r.wrong != null ? r.wrong : ((r.attempted || 0) - c);
    return { attempted: c + w, correct: c, wrong: w, skipped: mock.totalQuestions - (c + w) };
  }

  /**
   * Score a mock with the exam's OWN marking scheme: +1 per correct, −negPerWrong per wrong, 0 for skipped.
   * @param {object} opts {elapsedSec, perCat:{cat:{correct,attempted}}}
   */
  function score(mock, responses, opts) {
    opts = opts || {};
    var c = _counts(mock, responses);
    var raw = c.correct - c.wrong * (mock.negPerWrong || 0);
    return {
      attempted: c.attempted, correct: c.correct, wrong: c.wrong, skipped: c.skipped,
      score: _round(Math.max(0, raw), 2), rawScore: _round(raw, 2), maxScore: mock.totalQuestions,
      accuracy: c.attempted ? _round(c.correct / c.attempted, 3) : 0,
      attemptRate: _round(c.attempted / mock.totalQuestions, 3),
      secPerQ: (opts.elapsedSec && c.attempted) ? _round(opts.elapsedSec / c.attempted, 1) : null,
      perCat: opts.perCat || null
    };
  }

  /**
   * Build the full shuffled question deck for a mock: `genFn(cat)` returns one question for a drill category.
   * Returns { mock, deck } where deck.length === mock.totalQuestions. Pure given a pure genFn (Node-testable
   * with a stub; the browser passes a real generator). Optional opts.rng for deterministic shuffles.
   */
  function buildMockDeck(examId, genFn, opts) {
    var mock = buildMock(examId, opts);
    if (!mock) return null;
    var deck = [];
    mock.blueprint.forEach(function (b) {
      // genFn(cat, count) returns an ARRAY of `count` questions — batch generation keeps the deck exactly the
      // blueprint size even when per-question dedup would otherwise leave holes. Tolerates a single-question genFn.
      var qs = genFn(b.cat, b.count) || [];
      if (!Array.isArray(qs)) qs = [qs];
      qs.slice(0, b.count).forEach(function (q) { if (q) { q.mockTopicId = b.topicId; deck.push(q); } });
    });
    var rng = (opts && opts.rng) || Math.random;
    for (var j = deck.length - 1; j > 0; j--) { var k = Math.floor(rng() * (j + 1)); var t = deck[j]; deck[j] = deck[k]; deck[k] = t; }
    return { mock: mock, deck: deck };
  }

  /** Shape a result as a planner block 'mock' task (what examStrategy._mockTrend / planner consume). */
  function resultForPlanner(mock, result) {
    return { kind: 'mock', label: mock.examName + ' timed mock',
      result: { accuracy: result.accuracy, score: result.score, maxScore: result.maxScore, attempted: result.attempted, total: mock.totalQuestions } };
  }

  var API = { buildMock: buildMock, buildMockDeck: buildMockDeck, score: score, resultForPlanner: resultForPlanner };
  root.QR_MOCK = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
