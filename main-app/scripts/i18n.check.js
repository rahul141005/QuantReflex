/**
 * i18n.check.js — validates the localization layer (ADR-111).
 *
 * Guards the invariants the i18n architecture depends on:
 *   1. CATALOG PARITY — en/hi/mr expose the identical key set; no empty values; plural objects
 *      carry the same categories everywhere.
 *   2. PLACEHOLDER PARITY — every {token} in an English value appears in the hi/mr values too
 *      (a missing token silently drops data for one language).
 *   3. NO RAW-ENGLISH LEAKAGE — hi/mr values may contain Latin script only for glossary-allowlisted
 *      brand terms (QuantReflex, Premium, DI…), never untranslated English prose.
 *   4. DOM KEYS RESOLVE — every data-i18n / data-i18n-attr key in index.html exists in the catalogs.
 *   5. FLAG LOCKSTEP — the inline pre-paint I18N_ON (index.html) matches QRI18n.ENABLED (js/i18n.js),
 *      and the SW precaches the i18n core, all three catalogs and the Devanagari font.
 *   6. CHANNEL SEPARATION — study-content namespaces are read only via tc(), UI namespaces only via
 *      t() (the two-language model would silently cross-wire otherwise).
 *   7. RUNTIME BEHAVIOR — flag-off hard-forces English; preview mode enables switching; fallback
 *      chain hi/mr→en→key; {param} interpolation; Intl plural selection (hi treats 0 as "one").
 *   node scripts/i18n.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }

console.log('i18n.check — localization layer (ADR-111)');

var LANGS = ['en', 'hi', 'mr'];
/* Namespaces reserved for the STUDY channel (tc); everything else is UI (t). Grows in later phases. */
var CONTENT_NS = ['gen', 'learnContent', 'tips', 'study'];
/* Latin-script tokens legitimately present inside hi/mr values (do-not-translate glossary). */
var LATIN_ALLOWLIST = [
  'QuantReflex', 'QuanAI', 'Premium', 'English', 'Focus', 'DI', 'LR', 'AI',
  'CAT', 'MBA', 'CET', 'MAH', 'Bank', 'PO', 'SSC', 'CGL', 'IBPS', 'RRB', 'UPSC', 'MPSC', 'NDA', 'CDS',
  'km', 'kmph', 'cm', 'mm', 'kg', 'XP',
  'Google', 'QRABCD1234', 'AP', 'GP', 'Speed Aptitude', 'Speed Score', 'Math Duel', 'Quant', 'Playful Professional', 'Classic Blue', 'XAT', 'SNAP', 'NMAT', 'CMAT', 'SBI', 'Foundation',
  /* share text carries the product URL verbatim (longest form first — stripping is literal) */
  'https://www.quantreflex.app', 'www.quantreflex.app', 'quantreflex.app',
  /* developer + payment-processor proper nouns (About modal, DNT) */
  'Razorpay', 'KrisVeltrix', 'KVt'
];

/* ── capture raw catalogs by requiring the locale IIFEs against a recording stub ── */
var catalogs = { en: {}, hi: {}, mr: {} };
global.QRI18n = {
  register: function (lang, cat) {
    var target = catalogs[lang];
    for (var ns in cat) {
      if (!target[ns]) target[ns] = {};
      for (var k in cat[ns]) target[ns][k] = cat[ns][k];
    }
  }
};
LANGS.forEach(function (l) { require(p('locales/' + l)); });
delete global.QRI18n;

function flatKeys(cat) {
  var keys = [];
  for (var ns in cat) for (var k in cat[ns]) keys.push(ns + '.' + k);
  return keys.sort();
}
function get(cat, key) {
  var dot = key.indexOf('.');
  var ns = cat[key.slice(0, dot)];
  return ns ? ns[key.slice(dot + 1)] : undefined;
}
function tokensOf(v) {
  var s = typeof v === 'object' ? Object.keys(v).map(function (c) { return v[c]; }).join(' ') : String(v);
  return (s.match(/\{\w+\}/g) || []).sort().join(',');
}

/* ── 1+2. key parity, non-empty values, plural-category + placeholder parity ── */
(function () {
  var enKeys = flatKeys(catalogs.en);
  ok('1 en catalog is non-empty', enKeys.length > 0);
  ['hi', 'mr'].forEach(function (l) {
    ok('1 ' + l + ' key set identical to en', flatKeys(catalogs[l]).join('|') === enKeys.join('|'));
  });
  LANGS.forEach(function (l) {
    flatKeys(catalogs[l]).forEach(function (key) {
      var v = get(catalogs[l], key);
      if (typeof v === 'string') {
        if (!v.trim()) { fail++; console.error('  ✗ 1 empty value: ' + l + ':' + key); } else pass++;
      } else if (typeof v === 'object' && v !== null) {
        var cats = Object.keys(v).sort().join(',');
        var enV = get(catalogs.en, key);
        ok('1 plural categories match en for ' + l + ':' + key,
          typeof enV === 'object' && Object.keys(enV).sort().join(',') === cats);
      } else { fail++; console.error('  ✗ 1 bad value type: ' + l + ':' + key); }
    });
  });
  enKeys.forEach(function (key) {
    var want = tokensOf(get(catalogs.en, key));
    ['hi', 'mr'].forEach(function (l) {
      var got = tokensOf(get(catalogs[l], key) || '');
      ok('2 placeholder parity ' + l + ':' + key, got === want);
    });
  });
})();

/* ── 3. no raw-English leakage in hi/mr (allowlist-stripped Latin runs) ── */
(function () {
  ['hi', 'mr'].forEach(function (l) {
    flatKeys(catalogs[l]).forEach(function (key) {
      var v = get(catalogs[l], key);
      var s = typeof v === 'object' ? Object.keys(v).map(function (c) { return v[c]; }).join(' ') : String(v);
      s = s.replace(/\{\w+\}/g, ' ').replace(/<[^>]+>/g, ' '); /* placeholders + inline HTML markup are language-neutral */
      LATIN_ALLOWLIST.forEach(function (t) { s = s.split(t).join(' '); });
      ok('3 no untranslated English in ' + l + ':' + key, !/[A-Za-z]{3,}/.test(s));
    });
  });
})();

/* ── 4. every data-i18n / data-i18n-html / data-i18n-attr key in index.html resolves,
      and every data-i18n-html catalog value carries only whitelisted markup ── */
var indexHtml = fs.readFileSync(p('index.html'), 'utf8');
(function () {
  var used = {};
  var htmlKeys = {};
  var m, re = /data-i18n="([^"]+)"/g;
  while ((m = re.exec(indexHtml))) used[m[1]] = 1;
  re = /data-i18n-html="([^"]+)"/g;
  while ((m = re.exec(indexHtml))) { used[m[1]] = 1; htmlKeys[m[1]] = 1; }
  re = /data-i18n-attr="([^"]+)"/g;
  while ((m = re.exec(indexHtml))) {
    m[1].split(';').forEach(function (pair) {
      var i = pair.indexOf(':');
      if (i !== -1) used[pair.slice(i + 1)] = 1;
    });
  }
  var keys = Object.keys(used);
  ok('4 index.html uses data-i18n keys', keys.length > 0);
  keys.forEach(function (key) {
    ok('4 key resolves in all catalogs: ' + key, LANGS.every(function (l) { return get(catalogs[l], key) !== undefined; }));
  });
  /* data-i18n-html values are assigned as innerHTML (sanitized at runtime); the sanitizer is
     defense-in-depth, so guarantee at build time that every catalog value carries only bare
     <strong>/<em>/<br> and balanced strong/em tags — a disallowed tag or attribute is a bug. */
  var BAD_TAG = /<(?!\/?(?:strong|em|br)\b)[a-zA-Z]/; /* any tag whose name isn't strong/em/br */
  var HAS_ATTR = /<(?:strong|em|br)\b[^>]*[^\/>]>/i;   /* a whitelisted tag carrying attributes */
  function count(s, re2) { return (s.match(re2) || []).length; }
  Object.keys(htmlKeys).forEach(function (key) {
    LANGS.forEach(function (l) {
      var v = get(catalogs[l], key);
      if (v === undefined) return; /* resolution failure already reported above */
      var s = typeof v === 'object' ? Object.keys(v).map(function (c) { return v[c]; }).join(' ') : String(v);
      ok('4 html value only whitelisted tags: ' + l + ':' + key, !BAD_TAG.test(s));
      ok('4 html value no tag attributes: ' + l + ':' + key, !HAS_ATTR.test(s));
      ok('4 html value balanced <strong>: ' + l + ':' + key, count(s, /<strong>/gi) === count(s, /<\/strong>/gi));
      ok('4 html value balanced <em>: ' + l + ':' + key, count(s, /<em>/gi) === count(s, /<\/em>/gi));
    });
  });
})();

/* ── 5. flag lockstep + SW/script/font wiring ── */
(function () {
  var i18nSrc = fs.readFileSync(p('js/i18n.js'), 'utf8');
  var coreFlag = /var ENABLED = (true|false);/.exec(i18nSrc);
  var htmlFlag = /var I18N_ON = (true|false);/.exec(indexHtml);
  ok('5 QRI18n.ENABLED declared', !!coreFlag);
  ok('5 inline I18N_ON declared', !!htmlFlag);
  ok('5 flag lockstep (index.html I18N_ON === js/i18n.js ENABLED)', !!coreFlag && !!htmlFlag && coreFlag[1] === htmlFlag[1]);

  var sw = fs.readFileSync(p('service-worker.js'), 'utf8');
  ['./js/i18n.js', './locales/en.js', './locales/hi.js', './locales/mr.js', './fonts/noto-sans-devanagari.woff2']
    .forEach(function (a) { ok('5 SW precaches ' + a, sw.indexOf("'" + a + "'") !== -1); });

  ['js/i18n.js', 'locales/en.js', 'locales/hi.js', 'locales/mr.js'].forEach(function (src) {
    ok('5 index.html loads ' + src, indexHtml.indexOf('src="' + src + '"') !== -1);
  });
  ok('5 i18n.js loads before locales', indexHtml.indexOf('src="js/i18n.js"') < indexHtml.indexOf('src="locales/en.js"'));
  ok('5 Devanagari font file exists', fs.existsSync(p('fonts/noto-sans-devanagari.woff2')));
  ok('5 @font-face for Devanagari in style.css', fs.readFileSync(p('css/style.css'), 'utf8').indexOf('noto-sans-devanagari.woff2') !== -1);
  ok('5 language rows present in Settings', indexHtml.indexOf('id="languageSettingsBlock"') !== -1 &&
    indexHtml.indexOf('id="appLanguageSelect"') !== -1 && indexHtml.indexOf('id="studyLanguageSelect"') !== -1);
  ok('5 settings.js wires the language selects', fs.readFileSync(p('js/settings.js'), 'utf8').indexOf('appLanguageSelect') !== -1);
})();

/* ── 6. channel separation: content namespaces only via tc(), UI namespaces only via t() ── */
(function () {
  function walk(dir, out) {
    fs.readdirSync(dir).forEach(function (f) {
      var full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else if (/\.js$/.test(f)) out.push(full);
    });
    return out;
  }
  var offenders = [];
  walk(p('js'), []).forEach(function (file) {
    var src = fs.readFileSync(file, 'utf8');
    var m, re = /QRI18n\.(t|tc)\(\s*['"]([\w-]+)\./g;
    while ((m = re.exec(src))) {
      var isContentNs = CONTENT_NS.indexOf(m[2]) !== -1;
      if (m[1] === 't' && isContentNs) offenders.push(file + ': t() on content ns ' + m[2]);
      if (m[1] === 'tc' && !isContentNs) offenders.push(file + ': tc() on UI ns ' + m[2]);
    }
  });
  ok('6 no t()/tc() channel cross-wiring' + (offenders.length ? ' — ' + offenders.join('; ') : ''), offenders.length === 0);
})();

/* ── 7. runtime behavior: flag-off coercion, then preview-mode switching/fallback/plurals ── */
(function () {
  /* 7a. flag off, no preview → languages hard-forced to English */
  delete require.cache[require.resolve(p('js/i18n'))];
  var I = require(p('js/i18n'));
  ok('7 flag ships OFF', I.ENABLED === false);
  I.register('en', { test: { hello: 'Hello {name}', items: { one: '{count} item', other: '{count} items' } } });
  I.register('hi', { test: { hello: 'नमस्ते {name}', items: { one: '{count} प्रश्न', other: '{count} प्रश्न' } } });
  I.setLanguages('hi', 'mr');
  ok('7 flag-off forces app=en', I.appLang() === 'en');
  ok('7 flag-off forces study=en', I.studyLang() === 'en');
  ok('7 t() interpolates params', I.t('test.hello', { name: 'Asha' }) === 'Hello Asha');
  ok('7 unknown key returns the key', I.t('test.nope') === 'test.nope');
  ok('7 plural en count=1', I.t('test.items', { count: 1 }) === '1 item');
  ok('7 plural en count=5', I.t('test.items', { count: 5 }) === '5 items');

  /* 7b. preview mode (qr_i18n_preview) → switching + fallback + hi plural rules live */
  delete require.cache[require.resolve(p('js/i18n'))];
  global.localStorage = { getItem: function (k) { return k === 'qr_i18n_preview' ? '1' : null; } };
  var P = require(p('js/i18n'));
  P.register('en', { test: { hello: 'Hello {name}', onlyEn: 'English only', items: { one: '{count} item', other: '{count} items' } } });
  P.register('hi', { test: { hello: 'नमस्ते {name}', items: { one: '{count} प्रश्न', other: '{count} प्रश्न' } } });
  ok('7 preview turns i18n on', P.isOn() === true);
  P.setLanguages('hi', 'mr');
  ok('7 preview: app language switches', P.appLang() === 'hi');
  ok('7 preview: study language switches', P.studyLang() === 'mr');
  ok('7 hi value served', P.t('test.hello', { name: 'आशा' }) === 'नमस्ते आशा');
  ok('7 missing hi key falls back to en', P.t('test.onlyEn') === 'English only');
  ok('7 missing mr catalog falls back to en on tc()', P.tc('test.onlyEn') === 'English only');
  ok('7 hi plural: 0 selects "one" (CLDR)', P.t('test.items', { count: 0 }) === '0 प्रश्न');
  ok('7 invalid language coerces to en', (P.setLanguages('xx', 'hi'), P.appLang() === 'en'));
  P.setLanguages('en', 'mr');
  ok('7 localeTag study=mr forces -u-nu-latn', P.localeTag('study') === 'mr-IN-u-nu-latn');
  ok('7 localeTag app=en is en-IN', P.localeTag() === 'en-IN');

  /* 7c. data-i18n-html: whitelist sanitize + orig-stash + EN restore, driven through
     the real applyDom via a minimal fake element. The hi value deliberately carries a
     hostile <img onerror> to prove the sanitizer neutralizes it. The real browser-DOM
     path (innerHTML rendering, Devanagari shaping) is covered by the Phase-D Playwright
     harness. */
  P.register('en', { about: { rich: 'Train <strong>daily</strong>.' } });
  P.register('hi', { about: { rich: 'रोज़ <strong>अभ्यास</strong> करें।<img src=x onerror="alert(1)">' } });
  var htmlEl = {
    _a: { 'data-i18n-html': 'about.rich' },
    innerHTML: 'Train <strong>daily</strong>.',
    getAttribute: function (n) { return this._a[n] !== undefined ? this._a[n] : null; },
    setAttribute: function (n, v) { this._a[n] = String(v); }
  };
  var fakeRoot = { querySelectorAll: function (sel) { return sel === '[data-i18n-html]' ? [htmlEl] : []; } };
  P.setLanguages('hi', 'mr');
  P.applyDom(fakeRoot);
  ok('7 html mode translates + keeps <strong>', htmlEl.innerHTML.indexOf('<strong>अभ्यास</strong>') !== -1);
  ok('7 html mode drops hostile <img>/onerror', htmlEl.innerHTML.indexOf('img') === -1 && htmlEl.innerHTML.toLowerCase().indexOf('onerror') === -1);
  ok('7 html mode stashes English original', htmlEl.getAttribute('data-i18n-orig-html') === 'Train <strong>daily</strong>.');
  P.setLanguages('en', 'en');
  P.applyDom(fakeRoot);
  ok('7 html mode restores English innerHTML', htmlEl.innerHTML === 'Train <strong>daily</strong>.');
  /* attributes on a whitelisted tag are stripped */
  P.register('en', { about: { attr: '<strong>x</strong>' } });
  P.register('hi', { about: { attr: '<strong class="x" onclick="e()">क</strong>' } });
  var attrEl = {
    _a: { 'data-i18n-html': 'about.attr' }, innerHTML: '<strong>x</strong>',
    getAttribute: function (n) { return this._a[n] !== undefined ? this._a[n] : null; },
    setAttribute: function (n, v) { this._a[n] = String(v); }
  };
  var attrRoot = { querySelectorAll: function (sel) { return sel === '[data-i18n-html]' ? [attrEl] : []; } };
  P.setLanguages('hi', 'mr');
  P.applyDom(attrRoot);
  ok('7 html mode strips tag attributes', attrEl.innerHTML === '<strong>क</strong>');
  delete global.localStorage;
})();

console.log('  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
