/**
 * quick-ref-i18n.js — QRQuickRefI18n: study-language overlay resolver for the Quick-Reference library (ADR-111 G-M9).
 *
 * The Quick-Reference cards are a PERMANENT learning resource, not static translations. Each card keeps ONE immutable
 * identity — its `id`, `section`, `learn`/`drill` cross-links and `block.kind` are machine fields shared across every
 * language — so bookmarks, AI recommendations, search indexing and future spaced-revision all key on `card.id` and
 * need NO schema change to gain a language. A hi/mr overlay carries ONLY display fields (title, block caption/headers/
 * rows) keyed by the same id; `resolve(card)` returns a MERGED view for the active study language (EN base, per-field
 * overlay wins, arrays merged by index, `searchTerms` BILINGUAL). A no-op when the study language is 'en' or no overlay
 * exists — so EN rendering is byte-identical. Adding a card = append to CARDS (+ optionally an overlay); no code change.
 *
 * Dual-exported (browser global + Node) so the overlay files register into it and scripts/learn-i18n.check.js validates.
 */
(function (root) {
  'use strict';

  var _overlays = {};   // lang -> { id -> overlayCard }
  var _complete = {};   // lang -> true once a pack declares 100% coverage
  var _cache = {};      // lang -> { id -> mergedCard }  (cleared on language switch / overlay change)
  /* machine fields that must NEVER come from an overlay — identity, taxonomy, cross-links, block kind stay base. */
  var _FORBIDDEN = { id: 1, section: 1, icon: 1, learn: 1, drill: 1, kind: 1 };

  function _activeLang() {
    try { if (typeof QRI18n !== 'undefined' && QRI18n.studyLang) { var l = QRI18n.studyLang(); return (l === 'hi' || l === 'mr') ? l : 'en'; } } catch (_) {}
    return 'en';
  }
  function _deep(base, ov) {
    if (ov === undefined || ov === null) return base;
    if (Array.isArray(base) && Array.isArray(ov)) return base.map(function (b, i) { return i < ov.length ? _deep(b, ov[i]) : b; });
    if (base && typeof base === 'object' && !Array.isArray(base) && ov && typeof ov === 'object' && !Array.isArray(ov)) {
      var out = {}; for (var bk in base) out[bk] = base[bk];
      for (var k in ov) { if (_FORBIDDEN[k]) continue; out[k] = _deep(base[k], ov[k]); }
      return out;
    }
    return ov;   // scalar (string) — overlay wins
  }
  function _merge(base, ov) {
    var m = _deep(base, ov);
    m.searchTerms = (base.searchTerms || []).concat(ov.searchTerms || []);   // search works in either script
    return m;
  }

  /** Register a language's card overlays (js/quick-reference/i18n/<lang>.js calls this). */
  function register(lang, cards) {
    lang = (lang === 'hi' || lang === 'mr') ? lang : null;
    if (!lang || !cards) return;
    var store = _overlays[lang] || (_overlays[lang] = {});
    for (var i = 0; i < cards.length; i++) { var c = cards[i]; if (c && c.id) store[c.id] = c; }
    _cache[lang] = {};
  }
  /** A pack declares 100% coverage → the learn-i18n.check flips from report-mode to a hard gate. */
  function markComplete(lang) { if (lang === 'hi' || lang === 'mr') _complete[lang] = true; }
  /** Resolve a card to the active-study-language MERGED view (the EN card itself when lang is en / no overlay). */
  function resolve(card) {
    if (!card) return card;
    var lang = _activeLang();
    if (lang === 'en') return card;
    var ov = _overlays[lang] && _overlays[lang][card.id];
    if (!ov) return card;
    var c = _cache[lang] || (_cache[lang] = {});
    return c[card.id] || (c[card.id] = _merge(card, ov));
  }

  /* Introspection for the harness. */
  function _coverage(lang, allIds) {
    var ov = _overlays[lang] || {};
    var have = (allIds || []).filter(function (id) { return ov[id]; }).length;
    return { have: have, total: (allIds || []).length, complete: !!_complete[lang] };
  }
  function _overlayOf(lang, id) { return (_overlays[lang] && _overlays[lang][id]) || null; }
  function _reset() { _overlays = {}; _complete = {}; _cache = {}; }

  /* Clear the merge cache on a language switch (the renderer drops its _built latch on the same signal, so the
     next visit to #learn/quick-ref rebuilds from freshly-merged cards). */
  try { if (typeof QRI18n !== 'undefined' && QRI18n.onChange) QRI18n.onChange(function () { _cache = {}; }); } catch (_) {}

  var API = {
    register: register, markComplete: markComplete, resolve: resolve,
    _coverage: _coverage, _overlayOf: _overlayOf, _reset: _reset, _activeLang: _activeLang
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRQuickRefI18n = API;
  if (typeof root !== 'undefined' && root) root.QRQuickRefI18n = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
