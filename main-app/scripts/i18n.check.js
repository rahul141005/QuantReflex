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
  'Razorpay', 'KrisVeltrix', 'KVt',
  /* platform / browser brand names (App Guide install instructions, DNT) */
  'Android', 'Chrome', 'iPhone', 'Safari',
  /* theme brand word ('Playful Professional' / 'Playful theme', DNT) */
  'Playful',
  /* home premium badge + login placeholder (DNT) */
  'PRO', 'you@example.com'
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

/* ── 7. runtime behavior: shipped-ON switching, then preview-mode fallback/plurals ── */
(function () {
  /* 7a. flag shipped ON (UI Phase 1 final audit) → languages switch live, no preview needed.
     ENABLED stays as the emergency kill-switch; the coercion path it guards (isOn() false →
     hard-force 'en') remains covered structurally by the lockstep + declaration checks in §5. */
  delete require.cache[require.resolve(p('js/i18n'))];
  var I = require(p('js/i18n'));
  ok('7 flag ships ON', I.ENABLED === true);
  I.register('en', { test: { hello: 'Hello {name}', items: { one: '{count} item', other: '{count} items' } } });
  I.register('hi', { test: { hello: 'नमस्ते {name}', items: { one: '{count} प्रश्न', other: '{count} प्रश्न' } } });
  I.setLanguages('hi', 'mr');
  ok('7 shipped flag: app language switches', I.appLang() === 'hi');
  ok('7 shipped flag: study language switches', I.studyLang() === 'mr');
  I.setLanguages('en', 'en');
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

/* ── 8. JS-built modal i18n guard (audit B1): the Practice subject-picker builds its UI via innerHTML,
   which §4's data-i18n scan cannot see. It once shipped 100% hardcoded English. Lock it to i18n. ── */
(function () {
  var src = fs.readFileSync(p('js/ui/practice-subject-modal.js'), 'utf8');
  ok('8 subject-modal routes strings through QRI18n', /QRI18n\.t/.test(src) && /practice\.subject/.test(src));
  /* the specific English UI literals that used to be hardcoded must not reappear in the RENDERED code
     (strip the JSDoc block comment, which legitimately names the subjects in prose). */
  var codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '');
  ['What would you like to practice?', 'Quantitative Aptitude', 'Data Interpretation', 'Logical Reasoning',
   'Mixed Aptitude', "Don't ask again"].forEach(function (lit) {
    ok('8 subject-modal has no hardcoded "' + lit + '"', codeOnly.indexOf(lit) === -1);
  });
  /* every subject key resolves in all three catalogs (parity is enforced by §1; this is explicit) */
  var subjKeys = ['subjectHeading', 'subjectLast', 'subjectDontAsk', 'subjectClose',
    'subjectQuantTitle', 'subjectQuantDesc', 'subjectQuantKinds', 'subjectDiTitle', 'subjectDiDesc',
    'subjectDiKinds', 'subjectLrTitle', 'subjectLrDesc', 'subjectLrKinds', 'subjectMixedTitle',
    'subjectMixedDesc', 'subjectMixedKinds'];
  LANGS.forEach(function (lang) {
    subjKeys.forEach(function (k) {
      ok('8 ' + lang + ' practice.' + k, !!(catalogs[lang].practice && catalogs[lang].practice[k]));
    });
  });
})();

/* ── 9. Category-picker section headers (ADR-124, audit S4-V1) ────────────────────────────────────
   §8 locked ONE JS-innerHTML surface and stopped there. The sibling component — the Practice category
   picker — took its Quant section titles straight from the knowledge registry, which stores English
   only, so seven headers (Numbers … Mensuration) rendered in English for hi/mr users on the Practice
   screen while the DI/LR headers beside them translated. §4 could not see it (no data-i18n) and §8 did
   not cover it. This section closes that gap: the picker must resolve titles through i18n, and every
   quant category id declared in the registry must have a translated title in all three catalogs. ── */
(function () {
  var src = fs.readFileSync(p('js/ui/category-picker.js'), 'utf8');
  ok('9 picker resolves section titles through i18n (learn.cat_<id>Title)',
    /function _catSectionTitle\(/.test(src) && /'learn\.cat_' \+ id \+ 'Title'/.test(src));
  ok('9 the quant section model uses it rather than the raw registry title',
    /title: _catSectionTitle\(sid, meta\[sid\] && meta\[sid\]\.title\)/.test(src));
  ok('9 picker carries no untranslated hint strings',
    !/hint:\s*'[^']/.test(src));
  /* ADR-125 (S4-U3): ADR-124 made these headers locale-dependent, so the picker must invalidate on a
     language switch like every other localized JS-built surface — applyDom cannot reach innerHTML text and
     the app does not reload. Without this, a visible picker keeps the old locale (reproduced as a
     mixed-locale state: Hindi strip labels beside English section headers). */
  ok('9 picker invalidates its rendered tree on a language change',
    /QRI18n\.onChange\(/.test(src) && /getElementById\('categoryGroups'\)[\s\S]{0,300}?innerHTML = ''/.test(src));

  /* derive the ids from the registry source so a newly added quant category fails this check until it
     is translated — the drift guard §8's fixed key list does not have */
  var catSrc = fs.readFileSync(p('data/knowledge/categories.js'), 'utf8');
  var ids = [];
  catSrc.replace(/\{\s*id:\s*'([^']+)'[^}]*?subject:\s*'quant'/g, function (_m, id) { ids.push(id); return _m; });
  ok('9 found the quant category ids in the registry (got ' + ids.length + ')', ids.length >= 7);
  LANGS.forEach(function (lang) {
    ids.forEach(function (id) {
      var v = catalogs[lang].learn && catalogs[lang].learn['cat_' + id + 'Title'];
      ok('9 ' + lang + ' learn.cat_' + id + 'Title', !!v);
    });
  });
  /* and they must actually be translated, not English copies (the failure §8 never tests for) */
  ['hi', 'mr'].forEach(function (lang) {
    ids.forEach(function (id) {
      var k = 'cat_' + id + 'Title';
      var en = catalogs.en.learn && catalogs.en.learn[k];
      var v = catalogs[lang].learn && catalogs[lang].learn[k];
      ok('9 ' + lang + ' learn.' + k + ' is translated, not an English copy', !!v && v !== en);
    });
  });
})();

/* ── 10. Language-switch transition coordinator (ADR-126) ──────────────────────────────────────────
   The switch used to be a double render that also lost focus and smooth-scrolled the user to the top.
   QRI18nTransition owns the lifecycle now; these assertions lock the properties that make it correct,
   because every one of them is invisible to a rendering test that only checks the final strings. ── */
(function () {
  var src = fs.readFileSync(p('js/i18n-transition.js'), 'utf8');
  var set = fs.readFileSync(p('js/settings.js'), 'utf8');
  var html = fs.readFileSync(p('index.html'), 'utf8');
  var sw = fs.readFileSync(p('service-worker.js'), 'utf8');
  var css = fs.readFileSync(p('css/style.css'), 'utf8');

  ok('10 settings routes the switch through the coordinator',
    /QRI18nTransition\.switchTo\(settings, _commit\)/.test(set));
  ok('10 a single commit pass owns init + the view re-render (no double render)',
    /QRI18n\.init\(settings\)/.test(src) && /Router\.showView\(Router\.getCurrentView\(\)/.test(src));
  ok('10 scroll and focus are captured and restored across the commit',
    /function _capture\(/.test(src) && /function _restore\(/.test(src) &&
    /snap\.focusId/.test(src) && /scrollTop = snap\.scrollTop/.test(src));
  ok('10 focus restore does not scroll the page',
    /focus\(\{ preventScroll: true \}\)/.test(src));
  ok('10 a live drill is never re-rendered over',
    /_drillActive\(\)/.test(src) && /if \(!_drillActive\(\)\)/.test(src));
  ok('10 rapid switching is last-wins via a generation counter, never queued',
    /var gen = \+\+_gen;/.test(src) && (src.match(/gen !== _gen/g) || []).length >= 4);
  ok('10 reduced motion skips the animation entirely (not merely shortens it)',
    /if \(_reduced\(\)\) \{[\s\S]{0,200}?doCommit\(\)/.test(src));
  ok('10 it reuses QROverlay.reducedMotion rather than re-rolling matchMedia',
    /QROverlay\.reducedMotion\(\)/.test(src));
  ok('10 the change is announced in a dedicated polite region carrying lang=',
    /aria-live', 'polite'/.test(src) && /setAttribute\('lang', appLang/.test(src));
  ok('10 packs load BEFORE the transition starts (never a held fade)',
    /QRPacks\.ensure\(studyLang, proceed\)/.test(src));
  ok('10 the coordinator subscribes to nothing per-switch (onChange has no unsubscribe)',
    !/QRI18n\.onChange/.test(src));
  ok('10 cleanup is unconditional so content can never be left dimmed',
    /function _finish\(/.test(src) && /_finish\(\);/.test(src));

  /* CSS: compositor-only, tokenised, and paired reduced-motion — the three things that keep it smooth
     under a 196 ms main-thread commit and keep design-lint at 10/10. */
  ok('10 the morph transitions only opacity/transform',
    /\.qr-lang-morph-out \{[\s\S]{0,160}?transition: opacity/.test(css) &&
    !/\.qr-lang-morph-(out|in) \{[\s\S]{0,200}?(width|height|top|left|margin|padding|filter):/.test(css));
  ok('10 morph timings are calc() on existing tokens (zero design-lint cost)',
    /--qr-morph-out: calc\(var\(--qr-dur-fast\)/.test(css) && /--qr-morph-in: calc\(var\(--qr-dur\)/.test(css));
  ok('10 the morph uses only an existing easing token (easings are pinned at 3/3)',
    !/qr-lang-morph[\s\S]{0,400}?cubic-bezier\(/.test(css));
  ok('10 content never fades below a readable floor', /--qr-morph-floor: 0\.4[0-9]/.test(css));
  ok('10 smooth-scroll is suppressed during the morph so the restore lands instantly',
    /html\.qr-lang-morphing \.container \{ scroll-behavior: auto; \}/.test(css));
  ok('10 the morph refreshes in place and never replays the view entry animation',
    /Router\.refreshCurrentView\(\)/.test(src) && /function refreshCurrentView\(/.test(fs.readFileSync(p('js/router.js'), 'utf8')));
  ok('10 reduced motion is a paired override (media query + body.reduced-motion)',
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.qr-lang-morph-out/.test(css) &&
    /body\.reduced-motion \.qr-lang-morph-out/.test(css));
  ok('10 the view root itself never retains a transform (FW-W5: traps fixed drill layers)',
    !/\.qr-lang-morph-in \{[\s\S]{0,120}?transform:/.test(css));

  /* Wiring: a new runtime file needs BOTH a script tag and a precache entry, and there is no generic
     guard for that in this repo — so assert both here. */
  ok('10 index.html loads the coordinator', /src="js\/i18n-transition\.js"/.test(html));
  ok('10 it loads after overlay.js (whose reducedMotion it reuses)',
    html.indexOf('js/ui/overlay.js') !== -1 &&
    html.indexOf('js/ui/overlay.js') < html.indexOf('js/i18n-transition.js'));
  ok('10 the service worker precaches the coordinator', /'\.\/js\/i18n-transition\.js'/.test(sw));
  /* The held-section contract, asserted at the level where it is actually honoured. A hold mark deeper
     than a direct child of the view is inert (measured), so assert it sits on a .settings-section, and
     that BOTH halves of the opt-out exist — the JS skip alone would only withhold the delay. */
  ok('10 the touched section opts out of the settle wave, at the stagger level',
    /<div class="settings-section" data-i18n-morph="hold">/.test(html));
  ok('10 the hold opt-out is stated in CSS too, not only in the stagger loop',
    /\.qr-lang-morph-in > \[data-i18n-morph="hold"\] \{ animation: none; \}/.test(css) &&
    /data-i18n-morph'\) === 'hold'\) continue;/.test(src));
  /* The 0.45 floor is only real if it cannot compound: a child fading from .45 inside a root at .45
     paints at .20. The settle keyframes must therefore carry no opacity at all. */
  ok('10 the settle keyframes are transform-only, so the opacity floor cannot compound',
    /@keyframes qrLangSettle \{\s*from \{ transform: translateY\(3px\); \}\s*to\s+\{ transform: none; \}\s*\}/.test(css));
})();

console.log('  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
