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

  /* Difficulty-agnostic sibling of an archetype key: `cat:diff:k` → `cat:*:k`. An archetype whose wording does not
     vary by difficulty is authored ONCE under `cat:*:k` (in every language) instead of duplicated per tier; a
     tier-specific `cat:diff:k` entry, when present, wins. Returns null when the key carries no difficulty segment
     (keeps the resolver generic for engines/subjects that don't use the diff:key convention). */
  function _agnostic(key) { var m = /^(.*):(?:easy|medium|hard):(.*)$/.exec(key); return m ? (m[1] + ':*:' + m[2]) : null; }
  /* Look up an archetype in one language, preferring the exact key over its difficulty-agnostic sibling. */
  function _lookup(engine, lang, key, agn) { var p = _packFor(engine, lang); if (!p) return null; return p.tpl[key] || (agn && p.tpl[agn]) || null; }

  /**
   * Render one archetype's surface in the active study language. `v` selects the variant with `v % length` (no
   * random). Returns { q, explain } and, when the archetype defines them, { options, answer } for text-MCQ formats
   * (§5.4.5 — options/answer render from the SAME per-language pool by index, so grading stays self-consistent).
   * Resolution order: active-lang exact → active-lang `:*:` → EN exact → EN `:*:`. Returns null when nothing matches
   * (the engine then keeps its own inline fallback). Never draws randomness.
   */
  function render(engine, key, v, slots) {
    var lang = _lang();
    var agn = _agnostic(key);
    var arch = _lookup(engine, lang, key, agn);
    if (!arch && lang !== 'en') {
      if (!_warned['t:' + engine + ':' + key + ':' + lang]) {
        _warned['t:' + engine + ':' + key + ':' + lang] = 1;
        try { console.warn('[QRGenI18n] no ' + lang + ' template for ' + engine + '.' + key + ' (fell back to en)'); } catch (_) {}
      }
      arch = _lookup(engine, 'en', key, agn);
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
    var out = {
      q: sList.length ? sList[n % sList.length](slots) : '',
      explain: eList.length ? eList[n % eList.length](slots) : ''
    };
    /* Text-MCQ channel (opt-in per archetype): `o(slots)` → localized option strings, `ans(slots)` → the localized
       correct answer. Both are pure functions of slots (the shuffle/answer index were drawn in build), so options
       and answer render in ONE language and grade by string-equality within it. */
    if (typeof arch.o === 'function') out.options = arch.o(slots);
    if (typeof arch.ans === 'function') out.answer = arch.ans(slots);
    return out;
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
