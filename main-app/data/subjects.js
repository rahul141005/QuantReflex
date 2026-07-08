/**
 * data/subjects.js — the canonical SUBJECT registry + derived subject↔category layer (ADR-073, QuantReflex V2).
 *
 * QuantReflex is evolving from "Quant-first" to "Speed Aptitude-first": the generative-speed spine is
 * Quant → Data Interpretation → generatable Logical Reasoning. A "subject" is the lens one notch above the
 * categories. This module is the source of truth for the SUBJECT registry (ids/labels/order) and for the
 * **drill-category → subject** map (the 36 quant drill categories, the DI categories, …) used by Practice/Stats/
 * analytics — `stats.categoryStats` is keyed by these drill categories, so subject roll-ups derive from here.
 *
 * NOTE — two category namespaces, one subject vocabulary: the **Learn** hub has its OWN category ids (numbers,
 * arithmetic, di-charts, …) that are a different set from the drill categories; each Learn category carries its
 * `subject` tag in data/knowledge/*, referencing the SAME subject ids defined here (validated by
 * learn-content.check). So `categoryToSubject()` here answers for *drill* categories; the Learn registry's
 * `categoriesBySubject()` answers for *Learn* categories — both keyed by the subject ids this file owns.
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

  /* DI categories live in js/di-engine.js, which (in the browser) loads AFTER this file — so resolve it LAZILY
     (on first lookup), never at load. In node the check harness require()s it directly. This keeps "no duplicated
     category list": each subject's categories come from that subject's own authoritative source. */
  var _DI = null;
  function _di() {
    if (_DI) return _DI;
    try { _DI = (typeof require !== 'undefined') ? require('../js/di-engine')
      : (typeof window !== 'undefined' ? window.DIEngine : root.DIEngine); } catch (_) {}
    return _DI;
  }
  /* LR is now served by SEVERAL engines (ADR-079): the generative core, the puzzle-SET engine, the authored-content
     engine and the visual engine. The subject's category set is the union of every LR-providing engine's categories —
     so every LR category (generated, set, authored, visual) rolls up under subject 'lr' with no per-category wiring. */
  var _LRENG = {};
  function _lrEngine(globalName, modPath) {
    if (_LRENG[globalName] !== undefined) return _LRENG[globalName];
    var e = null;
    try { e = (typeof require !== 'undefined') ? require(modPath) : (typeof window !== 'undefined' ? window[globalName] : root[globalName]); } catch (_) {}
    _LRENG[globalName] = e; return e;
  }
  function _quantCats() { return Object.keys((QuantTopics && QuantTopics.CATEGORY_LABELS) || {}); }
  function _diCats() { var d = _di(); return (d && typeof d.categories === 'function') ? d.categories() : []; }
  function _lrCats() {
    var out = [], srcs = [['LREngine', '../js/lr-engine'], ['LRSetEngine', '../js/lr-set-engine'], ['LRAuthoredEngine', '../js/lr-authored-engine'], ['LRVisualEngine', '../js/lr-visual-engine']];
    srcs.forEach(function (s) { var e = _lrEngine(s[0], s[1]); if (e && typeof e.categories === 'function') e.categories().forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); }); });
    return out;
  }

  /* The subject registry — the Speed-Aptitude spine. Each subject ships WITH its generators: Quant (ADR-045),
     Data Interpretation (ADR-074, Phase 2), Logical Reasoning (ADR-075, Phase 3). `cats` is a lazy resolver so
     each subject's categories come from that subject's own authoritative engine (no duplicated list). */
  var SUBJECTS = [
    { id: 'quant', label: 'Quantitative Aptitude', short: 'Quant', order: 1, cats: _quantCats },
    { id: 'di', label: 'Data Interpretation', short: 'DI', order: 2, cats: _diCats },
    { id: 'lr', label: 'Logical Reasoning', short: 'LR', order: 3, cats: _lrCats }
  ];

  var _byId = {};
  SUBJECTS.forEach(function (s) { _byId[s.id] = s; });

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

  /** Human label for a subject id (falls back to the id). ADR-111: localized display name first —
      catalog key `subjects.<id>` in the App-language catalog; the canonical English registry above
      stays the lockstep-checked source of truth and the fallback. */
  function label(id) {
    var s = _byId[id];
    if (!s) return id;
    try {
      var I = (typeof window !== 'undefined' && window.QRI18n) ? window.QRI18n : null;
      if (I && I.appLang() !== 'en') {
        var loc = I.t('subjects.' + id);
        if (loc !== 'subjects.' + id) return loc;
      }
    } catch (_) { /* fall through to English */ }
    return s.label;
  }

  /** The subject a drill category belongs to (or null if unknown). Resolved across all subjects' category sets. */
  function categoryToSubject(cat) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (SUBJECTS[i].cats().indexOf(cat) !== -1) return SUBJECTS[i].id;
    }
    return null;
  }

  /** The drill categories that make up a subject (empty array for unknown ids). */
  function subjectToCategories(id) {
    var s = _byId[id];
    return s ? s.cats().slice() : [];
  }

  var QR_SUBJECTS = {
    subjects: subjects, subject: subject, label: label,
    categoryToSubject: categoryToSubject, subjectToCategories: subjectToCategories
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = QR_SUBJECTS;
  if (typeof window !== 'undefined') window.QR_SUBJECTS = QR_SUBJECTS;
  else root.QR_SUBJECTS = QR_SUBJECTS;
})(this);
