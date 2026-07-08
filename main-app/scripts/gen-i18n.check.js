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
var GEN_DNT = ['QuantReflex', 'QuanAI', 'Premium', 'DI', 'LR', 'AI', 'km', 'kmph', 'cm', 'mm', 'kg'];
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

/* ============================================================================ */
module.exports = { makeLCG: makeLCG, digitMultiset: digitMultiset, hasDevanagariDigit: hasDevanagariDigit, genLeaks: genLeaks, assertInvariant: assertInvariant };

if (require.main === module || true) {
  if (failures) { console.error('\n✗ gen-i18n.check FAILED with ' + failures + ' assertion failure(s).'); process.exit(1); }
  console.log('\n✓ gen-i18n.check passed — Phase-F infrastructure sound, machinery self-tested.');
}
