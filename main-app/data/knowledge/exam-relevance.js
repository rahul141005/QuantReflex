/**
 * data/knowledge/exam-relevance.js — per-topic exam-relevance metadata (ADR-080).
 *
 * The single source of truth for "how much does this topic matter, and for which exam". Keyed by Learn topic id.
 * Deliberately NOT surfaced as a wall of badges — it powers personalization UNDER the hood:
 *   - Exam Readiness (Stats): coverage + importance weighting per exam track.
 *   - QuanAI recommendations + "study next" ordering (recommendedOrder).
 *   - Learn contextual indicators (⭐ High Priority, 🔥 Most Asked, "Recommended for <your exam>").
 *   - Future exam-specific filters and the study planner.
 *
 * Authored from the same syllabus research used for the question banks (CAT/XAT · SNAP/NMAT/CMAT/MAT/CET · IBPS/SBI/
 * RBI/RRB · SSC CGL/CHSL). Importance is honest, not inflated: 'very-high' means the topic is a staple of that exam.
 *
 * Schema per topic id:
 *   { priority: 'high'|'medium'|'low',   // overall study priority (drives ⭐ + ordering weight)
 *     order: <int>,                       // recommended study sequence WITHIN its subject (1 = start here)
 *     mostAsked: <bool>,                  // 🔥 a perennial high-frequency topic
 *     exams: { CAT, SNAP_NMAT, Banking, SSC: 'very-high'|'high'|'medium' } }  // omit a track = not a focus there
 *
 * Readiness TRACKS (coarser than individual exams, matching how aspirants think): CAT · SNAP/NMAT (incl. CMAT/MAT/CET/
 * XAT-lite) · Banking (IBPS/SBI/RBI/RRB) · SSC (CGL/CHSL/MTS, government). A syllabus examId maps to a track below.
 */
(function (root) {
  'use strict';

  var WEIGHT = { 'very-high': 3, high: 2, medium: 1 };
  var TRACKS = ['CAT', 'SNAP_NMAT', 'Banking', 'SSC'];
  var TRACK_LABEL = { CAT: 'CAT', SNAP_NMAT: 'SNAP/NMAT', Banking: 'Banking', SSC: 'SSC' };
  /* syllabus exam id (qr_active_exam) → readiness track */
  var EXAM_TRACK = {
    cat: 'CAT', xat: 'CAT',
    snap: 'SNAP_NMAT', nmat: 'SNAP_NMAT', cmat: 'SNAP_NMAT', mbacet: 'SNAP_NMAT', mat: 'SNAP_NMAT', atma: 'SNAP_NMAT',
    ibpspo: 'Banking', ibpsclerk: 'Banking', sbipo: 'Banking', rbiassistant: 'Banking', rrbntpc: 'Banking',
    ssccgl: 'SSC', sscchsl: 'SSC', sscmts: 'SSC'
  };

  /* ---- the metadata. order is within-subject (Quant 1–19, DI 1–6, LR 1–20). ---- */
  var META = {
    /* ── Quantitative Aptitude ── */
    'number-system':           { priority: 'high',   order: 1,  mostAsked: true,  exams: { CAT: 'medium', Banking: 'high', SSC: 'very-high' } },
    'simplification':          { priority: 'high',   order: 2,  mostAsked: true,  exams: { Banking: 'very-high', SSC: 'high' } },
    'percentages':             { priority: 'high',   order: 3,  mostAsked: true,  exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'very-high' } },
    'ratio-proportion':        { priority: 'high',   order: 4,  mostAsked: true,  exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'high', SSC: 'very-high' } },
    'averages':                { priority: 'medium', order: 5,  mostAsked: false, exams: { CAT: 'medium', Banking: 'high', SSC: 'high' } },
    'profit-loss':             { priority: 'high',   order: 6,  mostAsked: true,  exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'high', SSC: 'very-high' } },
    'simple-interest':         { priority: 'medium', order: 7,  mostAsked: false, exams: { Banking: 'high', SSC: 'high' } },
    'compound-interest':       { priority: 'medium', order: 8,  mostAsked: false, exams: { CAT: 'medium', Banking: 'high', SSC: 'high' } },
    'time-and-work':           { priority: 'high',   order: 9,  mostAsked: true,  exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'high', SSC: 'high' } },
    'pipes-and-cisterns':      { priority: 'medium', order: 10, mostAsked: false, exams: { Banking: 'high', SSC: 'medium' } },
    'time-speed-distance':     { priority: 'high',   order: 11, mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high', Banking: 'high', SSC: 'high' } },
    'ages':                    { priority: 'low',    order: 12, mostAsked: false, exams: { Banking: 'medium', SSC: 'medium' } },
    'mixtures-alligations':    { priority: 'medium', order: 13, mostAsked: false, exams: { CAT: 'high', Banking: 'medium', SSC: 'medium' } },
    'partnership':             { priority: 'low',    order: 14, mostAsked: false, exams: { Banking: 'medium', SSC: 'medium' } },
    'number-series':           { priority: 'high',   order: 15, mostAsked: true,  exams: { Banking: 'very-high', SSC: 'medium' } },
    'probability':             { priority: 'medium', order: 16, mostAsked: false, exams: { CAT: 'high', SNAP_NMAT: 'high' } },
    'permutation-combination': { priority: 'medium', order: 17, mostAsked: false, exams: { CAT: 'high', SNAP_NMAT: 'high' } },
    'area':                    { priority: 'medium', order: 18, mostAsked: false, exams: { CAT: 'medium', Banking: 'medium', SSC: 'very-high' } },
    'volume':                  { priority: 'medium', order: 19, mostAsked: false, exams: { CAT: 'medium', SSC: 'high' } },

    /* ── Data Interpretation ── */
    'di-foundations':          { priority: 'high',   order: 1,  mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'high' } },
    'di-bar-line':             { priority: 'high',   order: 2,  mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'high' } },
    'di-pie-charts':           { priority: 'high',   order: 3,  mostAsked: false, exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'high' } },
    'di-tables-caselets':      { priority: 'high',   order: 4,  mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high', Banking: 'high' } },
    'di-speed-math':           { priority: 'high',   order: 5,  mostAsked: false, exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'high' } },
    'di-sets':                 { priority: 'high',   order: 6,  mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high', Banking: 'medium' } },

    /* ── Logical Reasoning ── */
    'lr-series':               { priority: 'high',   order: 1,  mostAsked: true,  exams: { Banking: 'very-high', SSC: 'very-high' } },
    'lr-coding-decoding':      { priority: 'high',   order: 2,  mostAsked: true,  exams: { SNAP_NMAT: 'medium', Banking: 'very-high', SSC: 'very-high' } },
    'lr-analogies':            { priority: 'medium', order: 3,  mostAsked: false, exams: { CAT: 'medium', SSC: 'very-high' } },
    'lr-odd-one-out':          { priority: 'medium', order: 4,  mostAsked: false, exams: { Banking: 'medium', SSC: 'very-high' } },
    'lr-ranking':              { priority: 'medium', order: 5,  mostAsked: false, exams: { Banking: 'high', SSC: 'high' } },
    'lr-direction-sense':      { priority: 'medium', order: 6,  mostAsked: false, exams: { CAT: 'medium', Banking: 'high', SSC: 'high' } },
    'lr-blood-relations':      { priority: 'high',   order: 7,  mostAsked: true,  exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'high' } },
    'lr-coded-inequalities':   { priority: 'high',   order: 8,  mostAsked: true,  exams: { Banking: 'very-high', SNAP_NMAT: 'medium' } },
    'lr-syllogisms':           { priority: 'high',   order: 9,  mostAsked: true,  exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'very-high', SSC: 'high' } },
    'lr-seating-puzzles':      { priority: 'high',   order: 10, mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high', Banking: 'very-high' } },
    'lr-calendars':            { priority: 'low',    order: 11, mostAsked: false, exams: { Banking: 'medium', SSC: 'high' } },
    'lr-clocks':               { priority: 'low',    order: 12, mostAsked: false, exams: { Banking: 'medium', SSC: 'high' } },
    'lr-input-output':         { priority: 'medium', order: 13, mostAsked: true,  exams: { Banking: 'very-high' } },
    'lr-critical-reasoning':   { priority: 'high',   order: 14, mostAsked: true,  exams: { CAT: 'very-high', SNAP_NMAT: 'high' } },
    'lr-statement-argument':   { priority: 'medium', order: 15, mostAsked: false, exams: { CAT: 'high', SNAP_NMAT: 'high', Banking: 'medium' } },
    'lr-decision-making':      { priority: 'medium', order: 16, mostAsked: false, exams: { CAT: 'high', SNAP_NMAT: 'high' } },
    'lr-cause-effect':         { priority: 'low',    order: 17, mostAsked: false, exams: { CAT: 'medium', SNAP_NMAT: 'medium', Banking: 'medium' } },
    'lr-course-of-action':     { priority: 'low',    order: 18, mostAsked: false, exams: { SNAP_NMAT: 'medium', Banking: 'medium' } },
    'lr-nonverbal-images':     { priority: 'medium', order: 19, mostAsked: true,  exams: { SSC: 'very-high' } },
    'lr-figure-series':        { priority: 'medium', order: 20, mostAsked: false, exams: { SSC: 'very-high' } }
  };

  var PRIORITY_RANK = { high: 3, medium: 2, low: 1 };

  function get(id) { return META[id] || null; }
  function weight(id, track) { var m = META[id]; if (!m || !m.exams) return 0; return WEIGHT[m.exams[track]] || 0; }
  function priority(id) { var m = META[id]; return m ? m.priority : null; }
  function priorityRank(id) { var m = META[id]; return m ? (PRIORITY_RANK[m.priority] || 0) : 0; }
  function isHighPriority(id) { var m = META[id]; return !!m && m.priority === 'high'; }
  function isMostAsked(id) { var m = META[id]; return !!m && !!m.mostAsked; }
  function order(id) { var m = META[id]; return m ? m.order : 999; }
  function trackForExam(examId) { return EXAM_TRACK[String(examId || '').toLowerCase()] || null; }
  function trackLabel(track) { return TRACK_LABEL[track] || track; }
  function tracks() { return TRACKS.slice(); }

  /* Is this topic a focus area (importance ≥ high) for the given syllabus exam? Drives the "Recommended for <exam>"
     contextual badge in Learn. */
  function recommendedForExam(id, examId) {
    var t = trackForExam(examId); if (!t) return false; return weight(id, t) >= 2;
  }

  /* Build the weighted-category list the readiness derivation consumes — decoupled from the KB: pass an array of
     topic objects (each with id + drillCategory + difficulty). Returns one row per practisable topic:
     { cat, topicId, title, difficulty, weights:{CAT,SNAP_NMAT,Banking,SSC} }. statMath stays pure; it just receives
     this list + the user's stats. */
  function weightedCategories(topics) {
    var out = [];
    (topics || []).forEach(function (t) {
      if (!t || !t.id) return;
      var m = META[t.id]; if (!m) return;
      var cat = t.drillCategory; if (!cat) return;
      var w = {}; TRACKS.forEach(function (tr) { w[tr] = WEIGHT[m.exams[tr]] || 0; });
      out.push({ cat: cat, topicId: t.id, title: t.title || t.id, difficulty: t.difficulty || null, weights: w, order: m.order, priority: m.priority });
    });
    return out;
  }

  var API = {
    get: get, weight: weight, priority: priority, priorityRank: priorityRank, isHighPriority: isHighPriority,
    isMostAsked: isMostAsked, order: order, trackForExam: trackForExam, trackLabel: trackLabel, tracks: tracks,
    recommendedForExam: recommendedForExam, weightedCategories: weightedCategories, _meta: META
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  var W = (typeof window !== 'undefined') ? window : root;
  W.QR_EXAMREL = API;
})(this);
