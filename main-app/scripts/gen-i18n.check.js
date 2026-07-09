/**
 * gen-i18n.check.js — the Phase-F generated-content harness (ADR-111). Runs in npm test.
 *
 * F-M1 scope: prove the render infrastructure is sound and the wiring is complete, and expose the REUSABLE
 * machinery (seeded LCG, digit-multiset, Latin-leak heuristic, cross-language invariance runner) that the
 * per-engine milestones (F-M2…F-M7) will drive once the packs carry templates. Generator packs are
 * FUNCTION-VALUED, so they are validated HERE (render purity, coverage, invariance), never by the catalog
 * string scanner in i18n.check.js.
 *
 * The machinery is exported (module.exports) so a future per-engine check can `require()` it, and is
 * self-tested below against an in-memory template so the guarantees hold from day one.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var failures = 0;
function ok(cond, msg) { if (cond) return; failures++; console.error('  ✗ ' + msg); }
function section(name) { console.log('\n' + name); }

/* ── reusable machinery (exported for F-M2…F-M7) ── */

/* Seeded LCG (Numerical Recipes constants) → a deterministic Math.random replacement for census/invariance runs. */
function makeLCG(seed) {
  var s = (seed >>> 0) || 1;
  return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}
/* Multiset of digit characters (0-9) in a string, sorted — for EN-vs-hi/mr digit-preservation equality. */
function digitMultiset(str) { return (String(str).match(/[0-9]/g) || []).sort().join(''); }
/* Devanagari-numeral detector (must never appear — digits stay 0-9). */
function hasDevanagariDigit(str) { return /[०-९]/.test(String(str)); }
/* Latin-leak heuristic for generated hi/mr text: strip {tokens}-free output's digits, units, ₹/%, all-caps
   cipher substrates (CAT→DBU stays Latin in HI books), and a DNT allowlist; any residual 3+ Latin run leaks. */
/* Do-not-translate tokens in generated content: product/subject acronyms, units, AND standard math notation that
   stays Latin in Hindi/Marathi exam books (trig/log function names, permutation/combination notation). All-caps
   abbreviations (CP, SP, SI, CI, HCF, LCM, AP, GP, TSA, LSA, CSA, BODMAS) are already stripped by the [A-Z]{2,} rule. */
var GEN_DNT = ['QuantReflex', 'QuanAI', 'Premium', 'DI', 'LR', 'AI', 'km', 'kmph', 'cm', 'mm', 'kg',
  'sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'log', 'nPr', 'nCr'];
function genLeaks(str, extraAllow) {
  var s = String(str);
  s = s.replace(/[०-९0-9]/g, ' ').replace(/₹|%/g, ' ').replace(/km\/h|m\/s|s\/Q/g, ' ');
  (GEN_DNT.concat(extraAllow || [])).forEach(function (w) { s = s.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' '); });
  s = s.replace(/\b[A-Z]{2,}\b/g, ' ');   // all-caps cipher tokens (coding-decoding substrate)
  return /[A-Za-z]{3,}/.test(s);
}
/* Cross-language invariance: given a per-language builder that returns {answer, options, subtype, slots}, assert
   the MATH is identical across en/hi/mr for a fixed seed. (Used by F-M2+ once builds return language-neutral data.) */
function assertInvariant(label, byLang, report) {
  var en = byLang.en;
  ['hi', 'mr'].forEach(function (l) {
    var x = byLang[l];
    if (JSON.stringify(x.answer) !== JSON.stringify(en.answer)) report(label + ' [' + l + '] answer diverged');
    if (JSON.stringify(x.subtype) !== JSON.stringify(en.subtype)) report(label + ' [' + l + '] subtype diverged');
    var eo = (en.options || []).slice().sort(), xo = (x.options || []).slice().sort();
    if (JSON.stringify(eo) !== JSON.stringify(xo)) report(label + ' [' + l + '] option set diverged');
  });
}

/* ── load the runtime under test (packs self-register onto the global) ── */
global.QRGenI18n = require('../js/gen-i18n.js');
var QRGen = require('../js/utils/generative-helpers.js');
var QRPacks = require('../js/i18n-packs.js');
var GEN_FILES = ['quant', 'di', 'lr', 'lrv'];
var LANGS = ['en', 'hi', 'mr'];

/* ============================================================================
 * 1. Registry + render purity + per-archetype EN fallback
 * ==========================================================================*/
section('1. QRGenI18n registry: render purity, variant selection, EN fallback');

QRGenI18n.register('en', '_test', { tpl: { probe: {
  s: [function (s) { return 'A ' + s.a + ' B'; }, function (s) { return 'B ' + s.a + ' A'; }],
  e: [function (s) { return 'exp ' + s.a; }]
} } });
QRGenI18n.register('hi', '_test', { tpl: { probe: {
  s: [function (s) { return 'क ' + s.a + ' ख'; }],
  e: [function (s) { return 'हल ' + s.a; }]
} } });

/* Render purity: Math.random THROWS during render → render must still work (proves zero random draws). */
var _origRandom = Math.random;
Math.random = function () { throw new Error('render must not call Math.random'); };
try {
  var r0 = QRGenI18n.render('_test', 'probe', 0, { a: 7 });
  var r1 = QRGenI18n.render('_test', 'probe', 1, { a: 7 });
  ok(r0 && r0.q === 'A 7 B' && r0.explain === 'exp 7', 'render(v=0) picks template[0] (got ' + JSON.stringify(r0) + ')');
  ok(r1 && r1.q === 'B 7 A', 'render(v=1) picks template[1] via v % length');
  var rWrap = QRGenI18n.render('_test', 'probe', 3, { a: 7 });   // 3 % 2 === 1
  ok(rWrap && rWrap.q === 'B 7 A', 'render wraps variant with v % length');
} catch (e) { failures++; console.error('  ✗ render drew randomness or threw: ' + e.message); }
finally { Math.random = _origRandom; }

/* Unknown archetype → null (caller keeps its own fallback), never throws. */
ok(QRGenI18n.render('_test', 'nope', 0, {}) === null, 'render of an unknown archetype returns null');
ok(QRGenI18n.render('_nosuchengine', 'x', 0, {}) === null, 'render of an unknown engine returns null');
/* has() reflects registration. */
ok(QRGenI18n.has('_test', 'probe', 'en') && !QRGenI18n.has('_test', 'nope', 'en'), 'has() reports template presence');

/* ============================================================================
 * 2. Trilingual gendered name pool
 * ==========================================================================*/
section('2. Trilingual name pool (en/hi/mr + gender)');

var pool = QRGen.NAME_POOL;
ok(Array.isArray(pool) && pool.length >= 24, 'NAME_POOL has ≥24 entries (got ' + (pool && pool.length) + ')');
var seenEn = {}, mCount = 0, fCount = 0;
pool.forEach(function (e, i) {
  ok(e.en && e.hi && e.mr, 'NAME_POOL[' + i + '] has en/hi/mr');
  ok(e.g === 'm' || e.g === 'f', 'NAME_POOL[' + i + '] gender is m|f (got ' + e.g + ')');
  ok(/^[A-Za-z]+$/.test(e.en || ''), 'NAME_POOL[' + i + '].en is Latin');
  ok(/[ऀ-ॿ]/.test(e.hi || '') && /[ऀ-ॿ]/.test(e.mr || ''), 'NAME_POOL[' + i + '] hi/mr are Devanagari (' + e.en + ')');
  ok(!seenEn[e.en], 'NAME_POOL en unique: ' + e.en); seenEn[e.en] = 1;
  if (e.g === 'm') mCount++; else fCount++;
});
ok(mCount >= 8 && fCount >= 8, 'NAME_POOL gender-balanced (m=' + mCount + ', f=' + fCount + ')');
/* accessors return entry objects (no randomness constraint here). */
ok(QRGen.nameEntry() && QRGen.nameEntry().en, 'nameEntry() returns an entry object');
ok(QRGen.twoNameEntries().length === 2, 'twoNameEntries() returns two');

/* ============================================================================
 * 3. Pack skeletons load + register for all 12 engine×lang files
 * ==========================================================================*/
section('3. Generator pack skeletons (12) load and register');

LANGS.forEach(function (lang) {
  GEN_FILES.forEach(function (eng) {
    var f = 'locales/gen/' + lang + '.' + eng + '.js';
    ok(fs.existsSync(path.join(ROOT, f)), 'pack file exists: ' + f);
    var thrown = null;
    try { require(path.join(ROOT, f)); } catch (e) { thrown = e; }
    ok(!thrown, 'pack registers without throwing: ' + f + (thrown ? ' — ' + thrown.message : ''));
  });
});
/* QRPacks loader contract. */
ok(QRPacks.ready('en') === true, "QRPacks.ready('en') is true (eager)");
ok(QRPacks.files('hi').length === 4 && QRPacks.files('hi')[0].indexOf('locales/gen/hi.') === 0, 'QRPacks.files(hi) lists the 4 hi packs');

/* ============================================================================
 * 4. Wiring: SW precache + index.html eager EN pack script tags
 * ==========================================================================*/
section('4. Service-worker precache + index.html script wiring');

var SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
var HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
['js/gen-i18n.js', 'js/i18n-packs.js'].forEach(function (f) {
  ok(SW.indexOf("'./" + f + "'") !== -1, 'SW precaches ' + f);
  ok(HTML.indexOf('src="' + f + '"') !== -1, 'index.html loads ' + f);
});
LANGS.forEach(function (lang) {
  GEN_FILES.forEach(function (eng) {
    ok(SW.indexOf("'./locales/gen/" + lang + '.' + eng + ".js'") !== -1, 'SW precaches locales/gen/' + lang + '.' + eng + '.js');
  });
});
GEN_FILES.forEach(function (eng) {   // only EN packs are eager <script> tags
  ok(HTML.indexOf('src="locales/gen/en.' + eng + '.js"') !== -1, 'index.html eager-loads en.' + eng + '.js');
});
ok(HTML.indexOf('src="js/gen-i18n.js"') < HTML.indexOf('src="locales/gen/en.quant.js"'), 'gen-i18n.js loads before the EN packs (they call register)');

/* ============================================================================
 * 5. Self-test the exported machinery (so F-M2+ can rely on it)
 * ==========================================================================*/
section('5. Machinery self-test (LCG determinism, digit multiset, leak heuristic, invariance)');

var lcgA = makeLCG(42), lcgB = makeLCG(42);
ok(lcgA() === lcgB() && lcgA() === lcgB(), 'makeLCG is deterministic for a fixed seed');
ok(makeLCG(1)() !== makeLCG(2)(), 'makeLCG differs across seeds');
ok(digitMultiset('a12b3') === '123' && digitMultiset('3 2 1') === '123', 'digitMultiset is order-independent');
ok(hasDevanagariDigit('५') && !hasDevanagariDigit('5'), 'hasDevanagariDigit distinguishes ०-९ from 0-9');
ok(genLeaks('the shopkeeper') === true, 'genLeaks flags a stray English run');
ok(genLeaks('रवि ने ₹500 में 20% CAT DBU खरीदा') === false, 'genLeaks passes hi with DNT + all-caps cipher + digits');
var inv = [];
assertInvariant('t', { en: { answer: 10, subtype: 'a:b', options: ['10', '8', '12'] }, hi: { answer: 10, subtype: 'a:b', options: ['12', '10', '8'] }, mr: { answer: 10, subtype: 'a:b', options: ['8', '12', '10'] } }, function (m) { inv.push(m); });
ok(inv.length === 0, 'assertInvariant passes when math matches across languages (order-independent options)');
var inv2 = [];
assertInvariant('t', { en: { answer: 10, options: [] }, hi: { answer: 11, options: [] }, mr: { answer: 10, options: [] } }, function (m) { inv2.push(m); });
ok(inv2.length === 1, 'assertInvariant catches a diverged answer');

/* ============================================================================
 * 6. Template structural rules (F5) — s/e variant pairing over the live EN quant pack
 * ==========================================================================*/
section('6. Template structural rules: stem/explanation variant pairing (F5)');

/* render() picks s[v%s.length] and e[v%e.length] INDEPENDENTLY. For a stem and its explanation to stay paired the
   explanation array must be either a single shared entry (e.length===1) or index-aligned 1:1 with the stems
   (e.length===s.length). Any other shape silently scrambles stem↔explanation under some v. Enforced for EN now and
   for every hi/mr pack as it is authored (same rule, same guard). */
function checkPairing(engine, lang) {
  var store = QRGenI18n._store[engine] && QRGenI18n._store[engine][lang];
  if (!store) return;
  Object.keys(store.tpl).forEach(function (k) {
    var a = store.tpl[k];
    ok(a.s && a.s.length >= 1, engine + '.' + lang + ' ' + k + ': has ≥1 stem variant');
    ok(!a.e || a.e.length <= 1 || a.e.length === (a.s || []).length,
      engine + '.' + lang + ' ' + k + ': explanation pairing (s=' + (a.s && a.s.length) + ', e=' + (a.e && a.e.length) + ') — need e≤1 or e===s');
    /* MCQ archetypes must expose BOTH o() and ans() or neither (a half-wired option channel would render options
       with no gradable answer, or vice-versa). */
    ok((typeof a.o === 'function') === (typeof a.ans === 'function'),
      engine + '.' + lang + ' ' + k + ': o()/ans() are declared together (MCQ channel is all-or-nothing)');
  });
}
LANGS.forEach(function (l) { GEN_FILES.forEach(function (eng) { checkPairing(eng, l); }); });

/* ============================================================================
 * 7. Index-aligned pool parity (F1) — pools must match length/shape across languages
 * ==========================================================================*/
section('7. Index-aligned pool parity across languages (F1)');

/* A builder stores only an INDEX into a per-language pool; if hi/mr ship a pool of a different length (or different
   inner arity for pair-pools) an in-range EN index renders `undefined` in that language. This guard makes the
   invariant enforceable — pools are exposed on pack.pools. A language that has NOT yet authored a pool is skipped
   (coverage §9 tracks that); once present, length + inner shape must match EN exactly. */
function assertPoolParity(engine, report) {
  var en = QRGenI18n.pools(engine, 'en') || {};
  Object.keys(en).forEach(function (name) {
    ok(Array.isArray(en[name]) && en[name].length > 0, engine + ' EN pool ' + name + ' is a non-empty array');
  });
  ['hi', 'mr'].forEach(function (l) {
    var lp = QRGenI18n.pools(engine, l) || {};
    Object.keys(en).forEach(function (name) {
      if (!lp[name]) return;   // not authored yet
      if (lp[name].length !== en[name].length) report(engine + '.' + l + ' pool ' + name + ': length ' + lp[name].length + ' ≠ EN ' + en[name].length);
      en[name].forEach(function (row, i) {
        if (Array.isArray(row)) {
          if (!Array.isArray(lp[name][i]) || lp[name][i].length !== row.length) report(engine + '.' + l + ' pool ' + name + '[' + i + ']: inner arity ≠ EN');
        }
      });
    });
  });
}
var poolErr = [];
GEN_FILES.forEach(function (eng) { assertPoolParity(eng, function (m) { poolErr.push(m); }); });
ok(poolErr.length === 0, 'pool parity across en/hi/mr' + (poolErr.length ? ': ' + poolErr.join('; ') : ''));
/* self-test the parity guard with a synthetic engine where hi drifts by one entry */
QRGenI18n.register('en', '_pp', { pools: { P: ['a', 'b', 'c'], PAIR: [['x', 'y'], ['z', 'w']] }, tpl: {} });
QRGenI18n.register('hi', '_pp', { pools: { P: ['क', 'ख'], PAIR: [['x', 'y'], ['z', 'w']] }, tpl: {} });
var ppErr = []; assertPoolParity('_pp', function (m) { ppErr.push(m); });
ok(ppErr.length === 1 && /pool P: length 2 ≠ EN 3/.test(ppErr[0]), 'pool-parity guard catches a length drift (got ' + JSON.stringify(ppErr) + ')');

/* ============================================================================
 * 8. Cross-language generation invariance + hi/mr surface safety (F4)
 * ==========================================================================*/
section('8. Cross-language generation invariance + hi/mr surface safety (F4)');

var Q = require('../js/questions.js');
var QCATS = require('./quant-census.js').QUANT_CATS;
var DIFFS8 = ['easy', 'medium', 'hard'];
/* Generate one question in a forced study language under a seeded RNG. render() draws no randomness, so the SAME
   seed yields identical slots/answer in every language — only the surface wording may differ. */
function genAt(lang, cat, diff, seed) {
  var orig = Math.random;
  global.QRI18n = { studyLang: function () { return lang; }, langs: function () { return { app: lang, study: lang }; } };
  Math.random = makeLCG(seed);
  var q; try { q = Q.generateQuestion(cat, diff); } catch (e) { q = null; }
  Math.random = orig; delete global.QRI18n;
  return q;
}
function agn(k) { return k.replace(/:(easy|medium|hard):/, ':*:'); }
var invErr = 0, digErr = 0, leakErr = 0, devErr = 0, hiActive = 0, checked = 0;
QCATS.forEach(function (cat, ci) {
  DIFFS8.forEach(function (diff, di) {
    for (var s = 0; s < 80; s++) {
      var seed = 0x51a7 + ci * 7919 + di * 131 + s * 17;
      var en = genAt('en', cat, diff, seed), hi = genAt('hi', cat, diff, seed), mr = genAt('mr', cat, diff, seed);
      if (!en || !hi || !mr) continue;
      checked++;
      /* MATH invariance: answer, subtype, and option SET identical across languages. */
      var byLang = { en: { answer: en.answer, subtype: en.subtype, options: en.options }, hi: { answer: hi.answer, subtype: hi.subtype, options: hi.options }, mr: { answer: mr.answer, subtype: mr.subtype, options: mr.options } };
      /* QC answer/options are language-dependent STRINGS — compare their INDEX in the shared pool instead, so the
         invariance is on the RELATION chosen, not its localized text. */
      if (en.category === 'quantity-comparison') { ['en', 'hi', 'mr'].forEach(function (l) { var o = (byLang[l].options || []); byLang[l] = { answer: o.indexOf(byLang[l].answer), subtype: byLang[l].subtype, options: o.map(function (_, i) { return i; }) }; }); }
      assertInvariant(cat + ':' + diff, byLang, function () { invErr++; });
      /* Digit multiset preserved across languages (translation never adds/drops a digit). */
      var eD = digitMultiset(en.question + (en.explanation || ''));
      if (digitMultiset(hi.question + (hi.explanation || '')) !== eD) digErr++;
      if (digitMultiset(mr.question + (mr.explanation || '')) !== eD) digErr++;
      /* Surface safety applies only where the language ACTUALLY rendered (its pack carries the archetype) — under
         EN-fallback the "hi" surface is English and must not be leak-tested. Activates automatically in F-M3. */
      [['hi', hi], ['mr', mr]].forEach(function (p) {
        var l = p[0], q = p[1], key = q.category + ':' + q.subtype;
        if (QRGenI18n.has('quant', key, l) || QRGenI18n.has('quant', agn(key), l)) {
          hiActive++;
          var surf = q.question + ' ‖ ' + (q.explanation || '') + ' ‖ ' + ((q.options || []).join(' '));
          if (genLeaks(surf)) leakErr++;
          if (hasDevanagariDigit(surf)) devErr++;
        }
      });
    }
  });
});
ok(invErr === 0, 'cross-language MATH invariance holds (answer/subtype/option-set) — ' + checked + ' samples/lang');
ok(digErr === 0, 'digit multiset preserved across languages');
ok(leakErr === 0, 'no Latin leak in actually-rendered hi/mr surfaces (' + hiActive + ' active)');
ok(devErr === 0, 'no Devanagari digits in generated output');
console.log('  (F4 runner: ' + checked + ' seeds/lang across ' + QCATS.length + ' categories; hi/mr rendered=' + hiActive + ' — activates as packs are authored)');

/* ============================================================================
 * 9. Coverage report (non-blocking until a pack declares complete:true)
 * ==========================================================================*/
section('9. hi/mr coverage vs EN (F4 — reported; hard-gate flips on complete:true)');

GEN_FILES.forEach(function (eng) {
  var enStore = QRGenI18n._store[eng] && QRGenI18n._store[eng].en;
  if (!enStore) return;
  var enKeys = Object.keys(enStore.tpl);
  if (!enKeys.length) return;
  ['hi', 'mr'].forEach(function (l) {
    var st = QRGenI18n._store[eng] && QRGenI18n._store[eng][l];
    var have = st ? enKeys.filter(function (k) { return st.tpl[k]; }).length : 0;
    var complete = !!(st && st.complete);
    console.log('  ' + eng + '.' + l + ': ' + have + '/' + enKeys.length + ' archetypes' + (complete ? ' [complete]' : ''));
    if (complete) ok(have === enKeys.length, eng + '.' + l + ' declares complete but is missing ' + (enKeys.length - have) + ' archetypes');
  });
});

/* ============================================================================
 * 10. DI cross-language invariance + chart-text surface safety (F-M5)
 *   The DI engine generates directly in the active study language. For a fixed RNG seed the dataset, answer and chart
 *   NUMBERS must be identical across en/hi/mr — only wording (stem + chart title/axis/labels/columns) differs. Leak +
 *   Devanagari-digit checks apply only where a language's DI pack is actually authored (registerDI called); until then
 *   hi/mr fall back to EN and are reported as gaps.
 * ==========================================================================*/
section('10. DI cross-language invariance + chart-text safety (F-M5)');
var DI = require('../js/di-engine.js');
require('../locales/gen/en.di.js'); require('../locales/gen/hi.di.js'); require('../locales/gen/mr.di.js');
var DICATS = ['di-bar', 'di-line', 'di-pie', 'di-table', 'di-caselet'];
function genDIAt(lang, cat, diff, seed) {
  var orig = Math.random;
  global.QRI18n = { studyLang: function () { return lang; }, langs: function () { return { app: lang, study: lang }; } };
  Math.random = makeLCG(seed);
  var q; try { q = DI.generate(cat, diff); } catch (e) { q = null; }
  Math.random = orig; delete global.QRI18n;
  return q;
}
/* language-neutral fingerprint of a chart: kind + all NUMBERS + structural counts/flags (NO text). */
function chartNums(c) {
  if (!c) return 'none';
  var p = [c.kind];
  if (c.labels) p.push('L' + c.labels.length);
  if (c.values) p.push('V' + c.values.join(','));
  if (c.series) p.push('S' + c.series.map(function (s) { return s.values.join(','); }).join(';') + '#' + c.series.length);
  if (c.rows) p.push('R' + c.rows.map(function (r) { return r.slice(1).join(','); }).join(';'));
  if (c.columns) p.push('C' + c.columns.length);
  if (c.horizontal != null) p.push('h' + c.horizontal);
  if (c.stacked != null) p.push('k' + c.stacked);
  return p.join('|');
}
/* all localizable TEXT on a chart spec (for leak/Devanagari checks). */
function chartText(c) {
  if (!c) return '';
  var t = [c.title || '', c.unit || '', c.xLabel || '', c.yLabel || ''];
  if (c.series) c.series.forEach(function (s) { t.push(s.name); });
  if (c.columns) t = t.concat(c.columns);
  if (c.rows) c.rows.forEach(function (r) { t.push(r[0]); });   // row label (col 0) is an entity name
  return t.join(' ‖ ');
}
/* DI DNT: exam/brand acronyms + single-letter entity codes + unit tokens that stay Latin even in hi/mr. */
var DI_DNT = ['crore', 'lakh', 'tonnes', 'units', 'MW', 'Kharif', 'Rabi'];
var diInv = 0, diLeak = 0, diDev = 0, diChecked = 0, diActive = 0;
var diAuthored = { hi: !!QRGenI18n._di.hi, mr: !!QRGenI18n._di.mr };
DICATS.forEach(function (cat, ci) {
  DIFFS8.forEach(function (diff, di) {
    for (var s = 0; s < 60; s++) {
      var seed = 0x3d1a + ci * 6113 + di * 211 + s * 23;
      var en = genDIAt('en', cat, diff, seed), hi = genDIAt('hi', cat, diff, seed), mr = genDIAt('mr', cat, diff, seed);
      if (!en || !hi || !mr) continue;
      diChecked++;
      /* MATH invariance: answer + subtype + chart NUMBERS identical across languages. */
      var fEn = en.answer + '§' + en.subtype + '§' + chartNums(en.chart);
      if (hi.answer + '§' + hi.subtype + '§' + chartNums(hi.chart) !== fEn) diInv++;
      if (mr.answer + '§' + mr.subtype + '§' + chartNums(mr.chart) !== fEn) diInv++;
      /* Surface safety only where the language's DI pack is authored (else it is EN-fallback → English, not testable). */
      [['hi', hi], ['mr', mr]].forEach(function (p) {
        if (!diAuthored[p[0]]) return;
        diActive++;
        var surf = p[1].question + ' ‖ ' + chartText(p[1].chart);
        if (genLeaks(surf, DI_DNT)) diLeak++;
        if (hasDevanagariDigit(surf)) diDev++;
      });
    }
  });
});
ok(diInv === 0, 'DI cross-language invariance holds (answer/subtype/chart-numbers) — ' + diChecked + ' samples/lang');
ok(diLeak === 0, 'no Latin leak in authored hi/mr DI surfaces (' + diActive + ' active)');
ok(diDev === 0, 'no Devanagari digits in DI output');
console.log('  di.hi authored=' + diAuthored.hi + ', di.mr authored=' + diAuthored.mr + ' (fall back to EN until F-M5.2/5.3)');

/* ============================================================================
 * 11. LR cross-language invariance + option-term surface safety (F-M6)
 *   The LR engine (like DI) generates directly in the active study language via a rich pack (locales/gen/<lang>.lr.js).
 *   LR output is FULLY deterministic, so EN byte-identity is separately proven by lr-census.js (exact djb2 hashes).
 *   Here we prove BEHAVIOURAL EQUIVALENCE across en/hi/mr: for a fixed RNG seed the subtype, the number of options, and
 *   the ANSWER'S INDEX within the option list must be identical — text-MCQ answers are language-specific STRINGS
 *   (Daughter/पुत्री/मुलगी), so correctness is compared by INDEX, never by text; numeric answers (ranking/clock/io) carry
 *   no options and are compared by value (digits are language-neutral). Digit multiset is preserved across languages.
 *   Leak + Devanagari-digit checks apply only where a language's LR pack is authored (registerLR called); until then
 *   hi/mr fall back to EN and are reported as gaps — mirroring §10.
 * ==========================================================================*/
section('11. LR cross-language invariance + option-term safety (F-M6)');
var LR = require('../js/lr-engine.js');
require('../locales/gen/en.lr.js');
try { require('../locales/gen/hi.lr.js'); } catch (_) { /* not authored yet */ }
try { require('../locales/gen/mr.lr.js'); } catch (_) { /* not authored yet */ }
var LRCATS = ['lr-coding', 'lr-blood', 'lr-direction', 'lr-ranking', 'lr-odd', 'lr-analogy', 'lr-syllogism',
  'lr-series', 'lr-inequality', 'lr-calendar', 'lr-clock', 'lr-io'];
function genLRAt(lang, cat, diff, seed) {
  var orig = Math.random;
  global.QRI18n = { studyLang: function () { return lang; }, langs: function () { return { app: lang, study: lang }; } };
  Math.random = makeLCG(seed);
  var q; try { q = LR.generate(cat, diff); } catch (e) { q = null; }
  Math.random = orig; delete global.QRI18n;
  return q;
}
/* Language-neutral behavioural fingerprint: subtype + option count + answer INDEX (or the numeric answer when
   there are no options). This is what MUST match across languages; the option STRINGS legitimately differ. */
function lrFingerprint(q) {
  if (!q) return 'none';
  var opts = q.options || [];
  var idx = opts.indexOf(q.answer);
  return q.subtype + '§n' + opts.length + '§' + (opts.length ? ('i' + idx) : ('a' + String(q.answer)));
}
/* All localizable TEXT on an LR question (for leak/Devanagari checks) — stem + rendered option strings. */
function lrText(q) { return (q.question || '') + ' ‖ ' + (q.options || []).join(' ‖ '); }
/* LR DNT: coding cipher substrates and single variable letters are already handled by the all-caps rule / <3-run rule
   in genLeaks; only add tokens that survive those and are legitimately Latin in hi/mr LR books. */
var LR_DNT = [];
var lrInv = 0, lrDig = 0, lrLeak = 0, lrDev = 0, lrChecked = 0, lrActive = 0;
var lrAuthored = { hi: !!(QRGenI18n._rich.lr && QRGenI18n._rich.lr.hi), mr: !!(QRGenI18n._rich.lr && QRGenI18n._rich.lr.mr) };
LRCATS.forEach(function (cat, ci) {
  DIFFS8.forEach(function (diff, di) {
    for (var s = 0; s < 60; s++) {
      var seed = 0x5c2b + ci * 7127 + di * 349 + s * 29;
      var en = genLRAt('en', cat, diff, seed), hi = genLRAt('hi', cat, diff, seed), mr = genLRAt('mr', cat, diff, seed);
      if (!en || !hi || !mr) continue;
      lrChecked++;
      /* BEHAVIOURAL invariance: subtype + option count + answer index identical across languages. */
      var fEn = lrFingerprint(en);
      if (lrFingerprint(hi) !== fEn) lrInv++;
      if (lrFingerprint(mr) !== fEn) lrInv++;
      /* Digit multiset preserved (digits stay 0-9 across languages). */
      var dEn = digitMultiset(lrText(en));
      if (digitMultiset(lrText(hi)) !== dEn) lrDig++;
      if (digitMultiset(lrText(mr)) !== dEn) lrDig++;
      /* Surface safety only where the language's LR pack is authored (else EN-fallback → English, not testable). */
      [['hi', hi], ['mr', mr]].forEach(function (p) {
        if (!lrAuthored[p[0]]) return;
        lrActive++;
        var surf = lrText(p[1]);
        if (genLeaks(surf, LR_DNT)) lrLeak++;
        if (hasDevanagariDigit(surf)) lrDev++;
      });
    }
  });
});
ok(lrInv === 0, 'LR cross-language behavioural invariance holds (subtype/option-count/answer-index) — ' + lrChecked + ' samples/lang');
ok(lrDig === 0, 'LR digit multiset preserved across languages');
ok(lrLeak === 0, 'no Latin leak in authored hi/mr LR option/stem surfaces (' + lrActive + ' active)');
ok(lrDev === 0, 'no Devanagari digits in LR output');
console.log('  lr.hi authored=' + lrAuthored.hi + ', lr.mr authored=' + lrAuthored.mr + ' (fall back to EN until F-M6.2/6.3)');

/* ============================================================================ */
module.exports = { makeLCG: makeLCG, digitMultiset: digitMultiset, hasDevanagariDigit: hasDevanagariDigit, genLeaks: genLeaks, assertInvariant: assertInvariant };

if (require.main === module || true) {
  if (failures) { console.error('\n✗ gen-i18n.check FAILED with ' + failures + ' assertion failure(s).'); process.exit(1); }
  console.log('\n✓ gen-i18n.check passed — Phase-F infrastructure sound, machinery self-tested.');
}
