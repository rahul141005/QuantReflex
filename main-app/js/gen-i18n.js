/**
 * gen-i18n.js — QRGenI18n: the render registry for procedurally-generated study content (ADR-111 Phase F).
 *
 * The four generators (quant `js/questions.js`, `js/di-engine.js`, `js/lr-engine.js`, `js/lr-visual-engine.js`)
 * separate MATH from SURFACE: each archetype's build() returns a language-neutral result — named `slots`, the
 * answer, options, and ONE variant seed `v` (drawn once as randInt(0,999) at build time). This registry renders
 * the surface: `render(engine, archKey, v, slots)` resolves the ACTIVE study-language pack's template list for
 * `archKey` and picks `templates[v % templates.length]`. Because `v` is fixed at build time, render performs ZERO
 * random draws — so for one RNG seed the slots/answer/options are IDENTICAL in every language by construction, and
 * only the surface prose differs. (scripts/gen-i18n.check.js stubs Math.random to THROW during render to enforce
 * this purity.)
 *
 * Packs register via `register(lang, engine, pack)` where
 *   pack = { pools: { poolName: [...] }, tpl: { archKey: { s: [fn(slots)→stem…], e: [fn(slots)→explain…] } } }
 * EN packs are eager (regular <script> tags — the engines' extracted templates live there); hi/mr packs are lazy
 * (QRPacks.ensure) but SW-precached for offline. Resolution falls back per-archetype to EN with a one-time warn;
 * if EN is also absent, render() returns null and the caller keeps its own fallback (so a missing pack never
 * throws or blanks a question). Pure, dual-exported (browser <script> + Node require for the check harness).
 */
var QRGenI18n = (function () {
  'use strict';

  /* _store[engine][lang] = { pools:{…}, tpl:{…} }. */
  var _store = {};
  var _warned = {};

  function _valid(lang) { return (lang === 'hi' || lang === 'mr') ? lang : 'en'; }

  /* Active STUDY language (generated content is study content). Guarded — Node checks and the pre-QRI18n boot
     window resolve to 'en'. Never reads localStorage directly. */
  function _lang() {
    try { if (typeof QRI18n !== 'undefined' && QRI18n.studyLang) return _valid(QRI18n.studyLang()); } catch (_) { /* ignore */ }
    return 'en';
  }

  /** Packs call this once per file: QRGenI18n.register('hi', 'quant', { pools:{…}, tpl:{…} }). */
  function register(lang, engine, pack) {
    lang = _valid(lang);
    if (!engine || !pack) return;
    if (!_store[engine]) _store[engine] = {};
    var slot = _store[engine][lang] || (_store[engine][lang] = { pools: {}, tpl: {} });
    var src;
    if (pack.pools) { for (var p in pack.pools) if (Object.prototype.hasOwnProperty.call(pack.pools, p)) slot.pools[p] = pack.pools[p]; }
    if (pack.tpl) { src = pack.tpl; for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) slot.tpl[k] = src[k]; }
  }

  function _packFor(engine, lang) { return (_store[engine] && _store[engine][lang]) || null; }

  /**
   * Render one archetype's surface in the active study language. `v` selects the variant with `v % length` (no
   * random). Returns { q, explain } (either may be ''), or null when neither the active language nor EN has a
   * template for `archKey` — the engine then keeps its own inline fallback. Never draws randomness.
   */
  function render(engine, key, v, slots) {
    var lang = _lang();
    var pack = _packFor(engine, lang);
    var arch = pack && pack.tpl[key];
    if (!arch && lang !== 'en') {
      if (!_warned['t:' + engine + ':' + key + ':' + lang]) {
        _warned['t:' + engine + ':' + key + ':' + lang] = 1;
        try { console.warn('[QRGenI18n] no ' + lang + ' template for ' + engine + '.' + key + ' (fell back to en)'); } catch (_) {}
      }
      pack = _packFor(engine, 'en'); arch = pack && pack.tpl[key];
    }
    if (!arch) {
      if (!_warned['m:' + engine + ':' + key]) {
        _warned['m:' + engine + ':' + key] = 1;
        try { console.warn('[QRGenI18n] missing template ' + engine + '.' + key); } catch (_) {}
      }
      return null;
    }
    var n = (typeof v === 'number' && v >= 0) ? v : 0;
    var sList = arch.s || [], eList = arch.e || [];
    return {
      q: sList.length ? sList[n % sList.length](slots) : '',
      explain: eList.length ? eList[n % eList.length](slots) : ''
    };
  }

  /** Pool accessor for engines that need pool sizes (index-aligned across languages by construction). */
  function pools(engine, lang) { var p = _packFor(engine, lang || _lang()); return p ? p.pools : {}; }

  /** True when a template for engine.key exists in the given (or active) language. */
  function has(engine, key, lang) { var p = _packFor(engine, lang || _lang()); return !!(p && p.tpl[key]); }

  var API = { register: register, render: render, pools: pools, has: has, _store: _store };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRGenI18n = API;
  return API;
})();
