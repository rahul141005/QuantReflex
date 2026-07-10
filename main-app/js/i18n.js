/**
 * i18n.js — QRI18n: two-channel localization core (ADR-111)
 *
 * QuantReflex localizes on TWO independent axes (user decision, ADR-111):
 *   - appLanguage   → UI chrome (menus, buttons, screens, toasts, dialogs). Read via t().
 *   - studyLanguage → study content (question stems, options, solutions, Learn
 *                     chapters, auto-tips, AI responses). Read via tc().
 * Changing App language defaults Study language to match unless the user has
 * explicitly diverged them (settings.js owns that rule).
 *
 * FEATURE FLAG: ENABLED shipped true once every surface was localized and the full
 * three-language QA pass was done (ADR-111 Phase H certification). The flag (and the
 * qr_i18n_preview localStorage override, read once at boot) remain as the emergency
 * kill-switch: flipping ENABLED back to false hard-forces both channels to 'en',
 * hides the Settings language rows, and no-ops applyDom() — byte-identical English.
 *
 * Catalogs are same-origin IIFE files (locales/en.js|hi.js|mr.js) that call
 * QRI18n.register(lang, catalog) — the report-taxonomy.js pattern; never
 * ../shared at runtime (ADR-099).
 *
 * Numerals stay Western Arabic 0-9 in every language (modern HI/MR book
 * convention). localeTag() therefore pins -u-nu-latn: CLDR's mr-IN (and some
 * hi-IN data) would otherwise render Devanagari digits via Intl.
 */
var QRI18n = (function () {
  'use strict';

  /* SHIPPED (UI Phase 1 final audit): every surface is localized, the three-language QA pass and
     the ADR-111 Phase-H certification are done — the Settings language rows are live in production. */
  var ENABLED = true;

  var SUPPORTED = ['en', 'hi', 'mr'];

  /* -u-nu-latn keeps digits 0-9 (mr-IN defaults to Devanagari numerals in CLDR). */
  var LOCALE_TAGS = { en: 'en-IN', hi: 'hi-IN-u-nu-latn', mr: 'mr-IN-u-nu-latn' };

  var _catalogs = { en: {}, hi: {}, mr: {} };
  var _appLang = 'en';
  var _studyLang = 'en';
  var _warned = {};
  var _listeners = [];
  var _previewChecked = false;
  var _previewOn = false;

  function _preview() {
    if (!_previewChecked) {
      _previewChecked = true;
      try { _previewOn = localStorage.getItem('qr_i18n_preview') === '1'; } catch (_) { /* ignore */ }
    }
    return _previewOn;
  }

  /** True when localization is active (shipped flag or internal QA preview). */
  function isOn() { return ENABLED || _preview(); }

  function _valid(lang) { return SUPPORTED.indexOf(lang) !== -1 ? lang : 'en'; }

  /** Locale catalogs call this once per file: QRI18n.register('hi', {settings:{...}, ...}). */
  function register(lang, catalog) {
    lang = _valid(lang);
    var target = _catalogs[lang];
    for (var ns in catalog) {
      if (!Object.prototype.hasOwnProperty.call(catalog, ns)) continue;
      if (!target[ns]) target[ns] = {};
      var block = catalog[ns];
      for (var k in block) {
        if (Object.prototype.hasOwnProperty.call(block, k)) target[ns][k] = block[k];
      }
    }
  }

  /** 'ns.key' lookup in one language's catalog; undefined when absent. */
  function _lookup(lang, key) {
    var dot = key.indexOf('.');
    if (dot === -1) return undefined;
    var ns = _catalogs[lang][key.slice(0, dot)];
    return ns ? ns[key.slice(dot + 1)] : undefined;
  }

  /* Plural values are objects keyed by CLDR category ({one:'…', other:'…'}).
     Selection uses Intl.PluralRules on the channel language; 'other' is the net. */
  var _pluralRules = {};
  function _selectPlural(lang, value, count) {
    var cat = 'other';
    try {
      if (!_pluralRules[lang]) _pluralRules[lang] = new Intl.PluralRules(LOCALE_TAGS[lang]);
      cat = _pluralRules[lang].select(count);
    } catch (_) { cat = count === 1 ? 'one' : 'other'; }
    if (value[cat] !== undefined) return value[cat];
    return value.other !== undefined ? value.other : value.one;
  }

  /** {token} interpolation. Missing params render as the literal token (visible in QA). */
  function _format(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (m, name) {
      return params[name] !== undefined ? String(params[name]) : m;
    });
  }

  function _resolve(lang, key, params) {
    var value = _lookup(lang, key);
    if (value === undefined && lang !== 'en') {
      if (isOn() && !_warned['m:' + lang + ':' + key]) {
        _warned['m:' + lang + ':' + key] = 1;
        try { console.warn('[QRI18n] missing ' + lang + ' key: ' + key + ' (fell back to en)'); } catch (_) {}
      }
      value = _lookup('en', key);
    }
    if (value === undefined) {
      if (!_warned['k:' + key]) {
        _warned['k:' + key] = 1;
        try { console.warn('[QRI18n] unknown key: ' + key); } catch (_) {}
      }
      return key;
    }
    if (typeof value === 'object' && value !== null) {
      value = _selectPlural(lang, value, (function (c) { var n = (typeof c === 'number') ? c : Number(c); return isFinite(n) ? n : 1; })(params && params.count));
    }
    return _format(value, params);
  }

  /** UI-chrome string (appLanguage channel). */
  function t(key, params) { return _resolve(_appLang, key, params); }

  /** Study-content string (studyLanguage channel) — engines/KB/tips only. */
  function tc(key, params) { return _resolve(_studyLang, key, params); }

  function appLang() { return _appLang; }
  function studyLang() { return _studyLang; }
  /** Active languages as a plain object (server-seam callers read .study for the AI response language). */
  function langs() { return { app: _appLang, study: _studyLang }; }

  /** BCP-47 tag for Intl.* on either channel ('app' default | 'study'). */
  function localeTag(channel) {
    return LOCALE_TAGS[channel === 'study' ? _studyLang : _appLang];
  }

  /* Reflect the active languages onto the document so CSS ([data-app-locale])
     and screen readers (<html lang>) follow. Study-content containers carry
     their own lang= attributes where the two channels can diverge. */
  function _applyDocument() {
    try {
      document.documentElement.lang = _appLang;
      document.documentElement.dir = 'ltr'; /* en/hi/mr are all LTR; wired for future RTL locales */
      /* Mirrored on <html> because the pre-paint head script (index.html) can only reach
         documentElement — CSS locale hooks match either ancestor. */
      document.documentElement.setAttribute('data-app-locale', _appLang);
      if (document.body) {
        document.body.setAttribute('data-app-locale', _appLang);
        document.body.setAttribute('data-study-locale', _studyLang);
      }
    } catch (_) { /* ignore (non-DOM context) */ }
  }

  /**
   * Set active languages. Coerced to 'en' while the feature is off, so no code
   * path can leak a non-English string before the flag flips.
   */
  function setLanguages(app, study) {
    var on = isOn();
    _appLang = on ? _valid(app) : 'en';
    _studyLang = on ? _valid(study) : 'en';
    _applyDocument();
    applyDom(typeof document !== 'undefined' ? document : null);
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](_appLang, _studyLang); } catch (_) { /* listener errors never break the switch */ }
    }
  }

  /** Read languages from a settings object (boot + settings changes both funnel here). */
  function init(settings) {
    settings = settings || {};
    setLanguages(settings.appLanguage || 'en', settings.studyLanguage || settings.appLanguage || 'en');
  }

  /** Subscribe to language changes (views re-render themselves). */
  function onChange(cb) { if (typeof cb === 'function') _listeners.push(cb); }

  /* Whitelist sanitizer for data-i18n-html values (ADR-111 Phase D). Values come
     exclusively from our own catalogs, which i18n.check §4 statically proves carry
     no tag outside {strong, em, br} and no attributes — this runtime pass is
     defense-in-depth. Every allowed tag is normalized to its bare form (attributes
     stripped); every other tag is unwrapped (dropped), keeping only its text, so a
     hostile <img onerror>/<script> can leave no executable residue. Pure string
     transform: identical in the browser and in the Node check harness. */
  var _HTML_OK = { strong: 1, em: 1, br: 1 };
  function _sanitizeHtml(str) {
    return String(str).replace(/<[^>]*>/g, function (tag) {
      var m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tag);
      if (!m || !_HTML_OK[m[2].toLowerCase()]) return '';
      return '<' + (m[1] ? '/' : '') + m[2].toLowerCase() + '>';
    });
  }

  /**
   * Translate static HTML in place. Elements opt in via:
   *   data-i18n="ns.key"                      → textContent (text-only elements)
   *   data-i18n-html="ns.key"                 → innerHTML, sanitized to <strong>/<em>/<br>
   *                                             (for sentences with inline emphasis markup)
   *   data-i18n-attr="aria-label:ns.key"      → attribute(s), ';'-separated pairs
   * The English original is captured into data-i18n-orig / data-i18n-orig-html on
   * first touch so switching back to English restores the exact inline source. A
   * data-i18n element must contain ONLY text; use data-i18n-html when it embeds
   * <strong>/<em>/<br>. A missing translation leaves the element's English markup
   * untouched (never prints the raw key into the DOM).
   */
  function applyDom(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    var toEnglish = _appLang === 'en';
    var nodes = root.querySelectorAll('[data-i18n]');
    var i, el, key;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      key = el.getAttribute('data-i18n');
      if (!key) continue;
      if (el.getAttribute('data-i18n-orig') === null) {
        if (toEnglish) continue; /* untouched English node — nothing to do */
        el.setAttribute('data-i18n-orig', el.textContent);
      }
      el.textContent = toEnglish ? el.getAttribute('data-i18n-orig') : _resolve(_appLang, key, null);
    }
    nodes = root.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      key = el.getAttribute('data-i18n-html');
      if (!key) continue;
      if (el.getAttribute('data-i18n-orig-html') === null) {
        if (toEnglish) continue; /* untouched English node — nothing to do */
        el.setAttribute('data-i18n-orig-html', el.innerHTML);
      }
      if (toEnglish) {
        el.innerHTML = el.getAttribute('data-i18n-orig-html');
      } else {
        var v = _resolve(_appLang, key, null);
        /* Unknown key → _resolve echoes the key; keep the English markup instead of
           writing a stray "ns.key" string into the page. */
        el.innerHTML = (v === key) ? el.getAttribute('data-i18n-orig-html') : _sanitizeHtml(v);
      }
    }
    nodes = root.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      var pairs = (el.getAttribute('data-i18n-attr') || '').split(';');
      for (var p = 0; p < pairs.length; p++) {
        var sep = pairs[p].indexOf(':');
        if (sep === -1) continue;
        var attr = pairs[p].slice(0, sep);
        key = pairs[p].slice(sep + 1);
        var origAttr = 'data-i18n-orig-' + attr;
        if (el.getAttribute(origAttr) === null) {
          if (toEnglish) continue;
          el.setAttribute(origAttr, el.getAttribute(attr) || '');
        }
        el.setAttribute(attr, toEnglish ? el.getAttribute(origAttr) : _resolve(_appLang, key, null));
      }
    }
  }

  return {
    ENABLED: ENABLED,
    SUPPORTED: SUPPORTED.slice(),
    isOn: isOn,
    register: register,
    t: t,
    tc: tc,
    appLang: appLang,
    studyLang: studyLang,
    langs: langs,
    localeTag: localeTag,
    setLanguages: setLanguages,
    init: init,
    onChange: onChange,
    applyDom: applyDom
  };
})();

/* Global export (window + module) — same dual pattern as every other module. */
if (typeof window !== 'undefined') window.QRI18n = QRI18n;
if (typeof module !== 'undefined' && module.exports) module.exports = QRI18n;
