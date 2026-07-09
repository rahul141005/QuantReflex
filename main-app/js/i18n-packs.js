/**
 * i18n-packs.js — QRPacks: lazy loader for study-language content packs (ADR-111 Phase F).
 *
 * English generator packs are EAGER (regular <script> tags in index.html) because the engines' extracted templates
 * live there and must be present the moment a question is generated. The हिन्दी / मराठी packs are large and only
 * needed when the study language is actually hi/mr, so they are LAZY: `QRPacks.ensure(lang, cb)` idempotently
 * injects their <script> tags (once) and calls back when they've registered. Every pack is ALSO listed in the
 * service-worker precache, so offline works in any language once installed.
 *
 * Called at boot for the active study language, and inside the Settings language-change path BEFORE the views
 * re-render. Guarded for non-DOM contexts (Node checks require the pack files directly and never call ensure()).
 * Extended in Phase G to also carry the Learn content packs.
 */
var QRPacks = (function () {
  'use strict';

  /* Per-language generator pack basenames (relative to the app root). */
  var GEN = ['quant', 'di', 'lr', 'lrv'];
  /* Phase G Learn/authored/quick-ref content packs — path templates carrying a {lang} placeholder. EMPTY in G-M1
     (infrastructure only); each authoring batch (G-M3…G-M11) appends its file(s) here AND to the SW precache in the
     SAME commit, so a study language lazy-loads exactly the content that exists. Registered via the same ensure()
     channel + SW precache as the gen packs, so offline works in any language once installed. */
  var CONTENT = [];
  function _files(lang) {
    var out = GEN.map(function (g) { return 'locales/gen/' + lang + '.' + g + '.js'; });
    for (var i = 0; i < CONTENT.length; i++) out.push(CONTENT[i].replace(/\{lang\}/g, lang));
    return out;
  }
  /** Register a content-pack path template (with a {lang} placeholder) so ensure(lang) lazy-loads it. Idempotent. */
  function registerContent(tpl) { if (tpl && CONTENT.indexOf(tpl) === -1) CONTENT.push(tpl); }

  var _state = {};   // lang → true (loaded) | 'loading'
  var _queue = {};   // lang → [cb…] waiting on an in-flight load

  function _valid(lang) { return (lang === 'hi' || lang === 'mr') ? lang : 'en'; }

  /**
   * Ensure the generator packs for `lang` are loaded, then call `cb`. English is a no-op (eager script tags).
   * Idempotent: concurrent calls during an in-flight load are queued and all fire on completion. In a non-DOM
   * context (Node), calls back synchronously (the checks require the packs directly).
   */
  function ensure(lang, cb) {
    lang = _valid(lang);
    cb = (typeof cb === 'function') ? cb : function () {};
    if (lang === 'en' || _state[lang] === true) return cb();
    if (typeof document === 'undefined' || !document.head) return cb();
    if (_state[lang] === 'loading') { (_queue[lang] || (_queue[lang] = [])).push(cb); return; }

    _state[lang] = 'loading';
    (_queue[lang] || (_queue[lang] = [])).push(cb);
    var files = _files(lang), remaining = files.length, anyFail = false;
    function done() {
      _state[lang] = anyFail ? false : true;   // allow a retry if a file failed
      var q = _queue[lang] || []; _queue[lang] = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (_) {} }
    }
    files.forEach(function (f) {
      var s = document.createElement('script');
      s.src = f; s.async = false;              // preserve order; packs are independent but keep it deterministic
      s.onload = function () { if (--remaining === 0) done(); };
      s.onerror = function () { anyFail = true; if (--remaining === 0) done(); };
      document.head.appendChild(s);
    });
  }

  /** True once the language's packs are loaded (or for English, always). */
  function ready(lang) { lang = _valid(lang); return lang === 'en' || _state[lang] === true; }

  var API = { ensure: ensure, ready: ready, files: _files, registerContent: registerContent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRPacks = API;
  return API;
})();
