/**
 * lr-authored-i18n.js — LRAuthoredI18n: study-language overlay resolver for the authored Logical-Reasoning bank (ADR-111 G-M10).
 *
 * The authored LR items (Critical Reasoning, Statement & Argument, Cause & Effect, Course of Action, Decision Making)
 * are human-authored natural-language arguments. A hi/mr overlay carries ONLY the display fields — `stem`, `options`
 * (index-aligned with the EN options, SAME length/order) and `explanation` — keyed by the item's immutable `id`. Every
 * machine/metadata field (id, topic, subtype, difficulty, exams, tags, meta, reviewStatus, explanationVersion,
 * inspiredBy) stays on the EN base for every language.
 *
 * THE CORRECTNESS GUARANTEE: the translated `answer` is NEVER authored separately — it is DERIVED as the translated
 * option at the index of the EN answer within the EN options. So the correct choice stays the correct choice in every
 * language by construction; the engine's option-shuffle and the drill's string-grading keep working unchanged, and an
 * overlay can never accidentally point the answer at the wrong translated option.
 *
 * `resolve(item)` returns a MERGED view for the active STUDY language (EN base, overlay display fields win). A no-op
 * when the study language is 'en' or no overlay exists → EN byte-identical. Adding an item = author it in the EN bank
 * (+ optionally an overlay); no code/schema change. Dual-exported (browser global + Node).
 */
(function (root) {
  'use strict';

  var _overlays = {};   // lang -> { id -> { stem, options[], explanation } }
  var _complete = {};   // lang -> true once a pack declares 100% coverage
  var _cache = {};      // lang -> { id -> mergedItem }  (cleared on language switch / overlay change)

  function _activeLang() {
    try { if (typeof QRI18n !== 'undefined' && QRI18n.studyLang) { var l = QRI18n.studyLang(); return (l === 'hi' || l === 'mr') ? l : 'en'; } } catch (_) {}
    return 'en';
  }

  /** Register a language's item overlays (data/lr-authored/i18n/<lang>/<family>.js calls this). */
  function register(lang, items) {
    lang = (lang === 'hi' || lang === 'mr') ? lang : null;
    if (!lang || !items) return;
    var store = _overlays[lang] || (_overlays[lang] = {});
    for (var i = 0; i < items.length; i++) { var it = items[i]; if (it && it.id) store[it.id] = it; }
    _cache[lang] = {};
  }
  /** A pack declares 100% coverage → the learn-i18n.check flips from report-mode to a hard gate. */
  function markComplete(lang) { if (lang === 'hi' || lang === 'mr') _complete[lang] = true; }

  /* Merge EN base + overlay display fields; DERIVE the answer by index so the correct choice can never drift. */
  function _merge(base, ov) {
    var enIdx = base.options.indexOf(base.answer);
    var sameLen = ov.options && ov.options.length === base.options.length;
    var opts = sameLen ? ov.options.slice() : base.options.slice();
    var answer = (sameLen && enIdx >= 0 && enIdx < opts.length) ? opts[enIdx] : base.answer;
    var m = {}; for (var k in base) m[k] = base[k];      // keep every machine/metadata field
    m.stem = ov.stem || base.stem;
    m.options = opts;
    m.answer = answer;
    m.explanation = ov.explanation || base.explanation;
    return m;
  }

  /** Resolve an authored item to the active-study-language MERGED view (the EN item when lang is en / no overlay). */
  function resolve(item) {
    if (!item) return item;
    var lang = _activeLang();
    if (lang === 'en') return item;
    var ov = _overlays[lang] && _overlays[lang][item.id];
    if (!ov) return item;
    var c = _cache[lang] || (_cache[lang] = {});
    return c[item.id] || (c[item.id] = _merge(item, ov));
  }

  /* Introspection for the harness. */
  function _coverage(lang, allIds) {
    var ov = _overlays[lang] || {};
    var have = (allIds || []).filter(function (id) { return ov[id]; }).length;
    return { have: have, total: (allIds || []).length, complete: !!_complete[lang] };
  }
  function _overlayOf(lang, id) { return (_overlays[lang] && _overlays[lang][id]) || null; }
  function _reset() { _overlays = {}; _complete = {}; _cache = {}; }

  /* Clear the merge cache on a language switch. */
  try { if (typeof QRI18n !== 'undefined' && QRI18n.onChange) QRI18n.onChange(function () { _cache = {}; }); } catch (_) {}

  var API = {
    register: register, markComplete: markComplete, resolve: resolve,
    _coverage: _coverage, _overlayOf: _overlayOf, _reset: _reset, _activeLang: _activeLang
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.LRAuthoredI18n = API;
  if (typeof root !== 'undefined' && root) root.LRAuthoredI18n = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
