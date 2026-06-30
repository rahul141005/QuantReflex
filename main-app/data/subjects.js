/**
 * data/subjects.js — the canonical SUBJECT registry + derived subject↔category layer (ADR-073, QuantReflex V2).
 *
 * QuantReflex is evolving from "Quant-first" to "Speed Aptitude-first": the generative-speed spine is
 * Quant → Data Interpretation → generatable Logical Reasoning. A "subject" is the lens one notch above the
 * 14 drillable categories. This module is the ONE place that knows which categories belong to which subject.
 *
 * DESIGN (why this stays cheap and reversible):
 *   - Subject is DERIVED, never stored. There is no `subjectStats` in Firestore — analytics roll subjects up on
 *     READ from `stats.categoryStats` via subjectToCategories(). No migration, no dual-write (see FIRESTORE_BLUEPRINT).
 *   - No duplicated category list: Quant's category set is resolved from quantTopics.CATEGORY_LABELS (the single
 *     source of truth), not re-typed here. New subjects (DI, LR) extend the map when their generators register
 *     categories — they are added with their content, not stubbed ahead of time.
 *   - PURE data + lookups (no DOM, no I/O) → dual-exported (window.QR_SUBJECTS / module.exports) the same way
 *     statMath.js and quantTopics.js are, so the node checks and the browser share one definition.
 */
(function (root) {
  'use strict';

  var QuantTopics = (typeof require !== 'undefined') ? require('../services/quantTopics')
    : (typeof window !== 'undefined' ? window.QuantTopics : root.QuantTopics);

  var _quantCats = Object.keys((QuantTopics && QuantTopics.CATEGORY_LABELS) || {});

  /* The subject registry. Today QuantReflex ships exactly ONE subject with content — Quant. Data Interpretation
     and generatable Logical Reasoning join here in V2.0 / V2.5 alongside their generators (the Quant→DI→LR spine
     is documented in ROADMAP/DECISION_LOG, not stubbed as empty objects). `order` drives display sequencing. */
  var SUBJECTS = [
    { id: 'quant', label: 'Quantitative Aptitude', short: 'Quant', order: 1, categories: _quantCats }
  ];

  var _byId = {};
  var _catToSubject = {};
  SUBJECTS.forEach(function (s) {
    _byId[s.id] = s;
    (s.categories || []).forEach(function (cat) { _catToSubject[cat] = s.id; });
  });

  /** All subjects, ordered (defensive copy of the meta — callers must not mutate the registry). */
  function subjects() {
    return SUBJECTS.slice().sort(function (a, b) { return a.order - b.order; })
      .map(function (s) { return { id: s.id, label: s.label, short: s.short, order: s.order }; });
  }

  /** Subject meta for an id (or null). */
  function subject(id) {
    var s = _byId[id];
    return s ? { id: s.id, label: s.label, short: s.short, order: s.order } : null;
  }

  /** Human label for a subject id (falls back to the id). */
  function label(id) { var s = _byId[id]; return s ? s.label : id; }

  /** The subject a drill category belongs to (or null if unknown). */
  function categoryToSubject(cat) { return _catToSubject[cat] || null; }

  /** The drill categories that make up a subject (empty array for unknown ids). */
  function subjectToCategories(id) {
    var s = _byId[id];
    return s && s.categories ? s.categories.slice() : [];
  }

  var QR_SUBJECTS = {
    subjects: subjects, subject: subject, label: label,
    categoryToSubject: categoryToSubject, subjectToCategories: subjectToCategories
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = QR_SUBJECTS;
  if (typeof window !== 'undefined') window.QR_SUBJECTS = QR_SUBJECTS;
  else root.QR_SUBJECTS = QR_SUBJECTS;
})(this);
