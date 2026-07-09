/**
 * learn-i18n.check.js — the Phase-G Learn-content translation harness (ADR-111). Runs in npm test.
 *
 * The Learn KB is translated by STRUCTURAL OVERLAYS: each hi/mr overlay topic mirrors the EN base's shape (same section
 * count, same block count + type order, same array lengths inside blocks) but carries ONLY display fields, keyed by the
 * same stable id. `KnowledgeBase` returns a MERGED view (EN base, per-field overlay wins). This harness proves, per
 * language: (1) structural CONGRUENCE with the EN base (exact counts), (2) forbidden fields absent (expr / related /
 * ids / category / difficulty / status / examFrequency), (3) no Latin leak in translated strings (with a formula-symbol
 * allowlist), (4) digits/₹/% preserved per string vs the EN twin, (5) `Schema.validateTopic` passes on the MERGED view,
 * and (6) coverage (report-mode until a pack declares complete → hard gate). Machinery is exported for the authoring
 * batches (G-M3…G-M11). Runs clean with zero overlays (report-mode); activates as overlays are authored.
 */
'use strict';

var path = require('path');
var fs = require('fs');
function p(rel) { return path.join(__dirname, '..', rel); }

var KB = require(p('js/knowledge/registry'));
var Schema = require(p('js/knowledge/schema'));

var failures = 0;
function ok(cond, msg) { if (cond) return; failures++; console.error('  ✗ ' + msg); }
function section(name) { console.log('\n' + name); }

/* ── load the EN base (the certified reference) ── */
KB._reset();
require(p('data/knowledge/categories'));
['numbers', 'arithmetic', 'commercial', 'algebra', 'modern', 'geometry', 'mensuration', 'di', 'lr'].forEach(function (m) { require(p('data/knowledge/' + m)); });
var BASE = KB._rawTopics();

/* ── load any translation overlays that exist (data/knowledge/i18n/<lang>/*.js self-register via registerTranslations) ── */
var I18N_DIR = p('data/knowledge/i18n');
['hi', 'mr'].forEach(function (lang) {
  var dir = path.join(I18N_DIR, lang);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { require(path.join(dir, f)); });
});

console.log('learn-i18n.check — Learn KB translation overlays (ADR-111 Phase G)');
console.log('  (' + BASE.length + ' EN base topics loaded)');

/* ── reusable machinery (exported for the authoring batches) ── */
var _FORBIDDEN = ['expr', 'related', 'ids', 'category', 'difficulty', 'status', 'examFrequency'];
/* Latin-leak: after stripping digits, ₹/%, single formula variables, function names + math abbreviations, any 3+ Latin
   run is a leak. Numbers/symbols stay; hi/mr books keep म.स./ल.स.-style but Latin abbrevs (LCM/HCF/CAGR/BODMAS) too. */
var _MATH_ALLOW = ['sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'log', 'ln', 'LCM', 'HCF', 'GCD', 'CAGR', 'BODMAS', 'SI', 'CI', 'CP', 'SP', 'AP', 'GP', 'TSA', 'LSA', 'CSA', 'nPr', 'nCr', 'QuantReflex', 'DI', 'LR', 'AI', 'km', 'kmph', 'cm', 'mm', 'kg', 'CAT', 'SSC', 'IBPS', 'MPSC', 'RRB', 'UPSC'];
function leaks(str) {
  var s = String(str);
  s = s.replace(/<[^>]+>/g, ' ');                 // strip HTML tags
  s = s.replace(/[०-९0-9]/g, ' ').replace(/₹|%/g, ' ');
  _MATH_ALLOW.forEach(function (w) { s = s.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' '); });
  s = s.replace(/\bn[CP][a-z0-9]\b/gi, ' ');       // n-choose / n-permute forms (nCr, nCn, nC0, nPr, nP0)
  s = s.replace(/\b[A-Za-z]\b/g, ' ');            // single variable letters (a, b, x, r, h, l)
  s = s.replace(/\b[A-Z]{1,5}\b/g, ' ');          // short all-caps abbreviations
  return /[A-Za-z]{3,}/.test(s);
}
function digitMultiset(str) { return (String(str).match(/[0-9]/g) || []).sort().join(''); }
function hasDevanagariDigit(str) { return /[०-९]/.test(String(str)); }

/* Deep structural congruence between an EN base node and an overlay node: same array lengths, same object shape for the
   fields the overlay provides. Returns error strings. Overlay may omit fields (EN fallback) but must not add STRUCTURE. */
function congruent(base, ov, pathStr, errs) {
  if (ov === undefined || ov === null) return;
  if (Array.isArray(base) && Array.isArray(ov)) {
    if (ov.length !== base.length) errs.push(pathStr + ': array length ' + ov.length + ' ≠ base ' + base.length);
    for (var i = 0; i < Math.min(base.length, ov.length); i++) congruent(base[i], ov[i], pathStr + '[' + i + ']', errs);
    return;
  }
  if (base && typeof base === 'object' && !Array.isArray(base)) {
    if (typeof ov !== 'object' || Array.isArray(ov)) { errs.push(pathStr + ': expected object'); return; }
    for (var k in ov) {
      if (_FORBIDDEN.indexOf(k) !== -1) { errs.push(pathStr + ': forbidden field "' + k + '" present in overlay'); continue; }
      if (k === 'searchTerms') continue;  // bilingual UNION in the registry (base + translated) — not positionally congruent; leak-checked separately
      if (!(k in base)) continue;   // overlay may add a display-only sibling? disallow unknown structural keys
      congruent(base[k], ov[k], pathStr + '.' + k, errs);
    }
  }
}
/* Digit preservation: every leaf string the overlay provides must carry the SAME digit multiset as its EN twin. */
function digitCongruent(base, ov, pathStr, errs) {
  if (ov === undefined || ov === null) return;
  if (Array.isArray(base) && Array.isArray(ov)) { for (var i = 0; i < Math.min(base.length, ov.length); i++) digitCongruent(base[i], ov[i], pathStr + '[' + i + ']', errs); return; }
  if (base && typeof base === 'object') { for (var k in ov) { if (k === 'searchTerms') continue; if (k in base) digitCongruent(base[k], ov[k], pathStr + '.' + k, errs); } return; }
  if (typeof base === 'string' && typeof ov === 'string') {
    if (digitMultiset(base) !== digitMultiset(ov)) errs.push(pathStr + ': digit multiset "' + digitMultiset(ov) + '" ≠ EN "' + digitMultiset(base) + '"');
    if (hasDevanagariDigit(ov)) errs.push(pathStr + ': contains a Devanagari numeral');
  }
}
/* Collect every leaf string in an overlay (for the leak heuristic). */
function leafStrings(node, out) {
  if (typeof node === 'string') { out.push(node); return; }
  if (Array.isArray(node)) { node.forEach(function (n) { leafStrings(n, out); }); return; }
  if (node && typeof node === 'object') { for (var k in node) leafStrings(node[k], out); }
}

module.exports = { congruent: congruent, digitCongruent: digitCongruent, leaks: leaks, leafStrings: leafStrings, digitMultiset: digitMultiset };

/* ── validate each authored overlay against its EN base ── */
section('1. Structural congruence + forbidden-field + leak + digit + merged-schema validation');
var baseById = {}; BASE.forEach(function (t) { baseById[t.id] = t; });
var totalChecked = 0;
['hi', 'mr'].forEach(function (lang) {
  var cov = KB._translationCoverage(lang);
  var congErr = 0, leakErr = 0, digErr = 0, schemaErr = 0;
  BASE.forEach(function (base) {
    var ov = KB._overlayOf(lang, base.id);
    if (!ov) return;
    totalChecked++;
    var errs = [];
    congruent(base, ov, base.id, errs);
    if (errs.length) { congErr += errs.length; errs.slice(0, 2).forEach(function (e) { console.error('  ✗ [' + lang + '] congruence ' + e); }); }
    var dErrs = []; digitCongruent(base, ov, base.id, dErrs);
    if (dErrs.length) { digErr += dErrs.length; dErrs.slice(0, 2).forEach(function (e) { console.error('  ✗ [' + lang + '] digits ' + e); }); }
    /* leak-scan display strings only — `id` is the machine merge key (a hyphenated Latin slug), never rendered. */
    var ovDisplay = {}; for (var ok in ov) { if (ok !== 'id') ovDisplay[ok] = ov[ok]; }
    var strs = []; leafStrings(ovDisplay, strs);
    strs.forEach(function (s) { if (leaks(s)) { leakErr++; if (leakErr <= 2) console.error('  ✗ [' + lang + '] Latin leak: ' + String(s).slice(0, 70)); } });
    /* merged view must still be a valid topic */
    global.QRI18n = { studyLang: function () { return lang; } };
    var merged = KB.get(base.id);
    delete global.QRI18n;
    var se = Schema.validateTopic(merged);
    if (se.length) { schemaErr += se.length; se.slice(0, 2).forEach(function (e) { console.error('  ✗ [' + lang + '] merged-schema ' + e); }); }
  });
  ok(congErr === 0, lang + ': all overlays structurally congruent with the EN base');
  ok(leakErr === 0, lang + ': no Latin leak in translated Learn strings');
  ok(digErr === 0, lang + ': digits/₹/% preserved (no Devanagari numerals)');
  ok(schemaErr === 0, lang + ': merged view passes Schema.validateTopic');
  /* coverage — report until the pack declares complete, then a hard gate */
  console.log('  ' + lang + ': ' + cov.have + '/' + cov.total + ' topics overlaid' + (cov.complete ? ' [complete]' : ''));
  if (cov.complete) ok(cov.have === cov.total, lang + ' declares complete but is missing ' + (cov.total - cov.have) + ' topic overlays');
});
console.log('  (' + totalChecked + ' overlay(s) validated; activates as G-M3…G-M8 author them)');

/* ── 2. Quick-Reference card overlays (G-M9) — same machinery over QR_QUICKREF ── */
section('2. Quick-Reference card overlays (congruence / forbidden / leak / digit / coverage)');
var QR = require(p('js/quick-reference/quick-ref-data.js'));
var QRI = require(p('js/quick-reference/quick-ref-i18n.js'));
QRI._reset();
['hi', 'mr'].forEach(function (lang) {
  var f = path.join(__dirname, '..', 'js/quick-reference/i18n/' + lang + '.js');
  if (fs.existsSync(f)) require(f);
});
var qrById = {}; QR.CARDS.forEach(function (c) { qrById[c.id] = c; });
var qrIds = QR.CARDS.map(function (c) { return c.id; });
var QR_FORBIDDEN = { section: 1, icon: 1, learn: 1, drill: 1, kind: 1 };   // machine fields never overlaid
['hi', 'mr'].forEach(function (lang) {
  var cov = QRI._coverage(lang, qrIds);
  var cErr = 0, lErr = 0, dErr = 0, fErr = 0, n = 0;
  qrIds.forEach(function (id) {
    var ov = QRI._overlayOf(lang, id); if (!ov) return; n++;
    var base = qrById[id];
    for (var k in ov) { if (QR_FORBIDDEN[k]) { fErr++; console.error('  ✗ [' + lang + '] ' + id + ': forbidden field "' + k + '" in card overlay'); } }
    var e = []; congruent(base, ov, id, e); if (e.length) { cErr += e.length; e.slice(0, 2).forEach(function (x) { console.error('  ✗ [' + lang + '] congruence ' + x); }); }
    var de = []; digitCongruent(base, ov, id, de); if (de.length) { dErr += de.length; de.slice(0, 2).forEach(function (x) { console.error('  ✗ [' + lang + '] digits ' + x); }); }
    var od = {}; for (var ok2 in ov) { if (ok2 !== 'id') od[ok2] = ov[ok2]; }
    var ss = []; leafStrings(od, ss); ss.forEach(function (s) { if (leaks(s)) { lErr++; if (lErr <= 2) console.error('  ✗ [' + lang + '] Latin leak: ' + String(s).slice(0, 70)); } });
  });
  ok(fErr === 0, lang + ' quick-ref: no forbidden machine fields overlaid');
  ok(cErr === 0, lang + ' quick-ref: all card overlays congruent with the EN base');
  ok(lErr === 0, lang + ' quick-ref: no Latin leak in translated card strings');
  ok(dErr === 0, lang + ' quick-ref: digits preserved (no Devanagari numerals)');
  console.log('  ' + lang + ': ' + cov.have + '/' + cov.total + ' cards overlaid' + (cov.complete ? ' [complete]' : ''));
  if (cov.complete) ok(cov.have === cov.total, lang + ' quick-ref declares complete but is missing ' + (cov.total - cov.have) + ' card overlays');
});

/* ── 3. Authored-LR bank overlays (G-M10) — display-only overlay + answer-by-index correctness ── */
section('3. Authored-LR bank overlays (forbidden / options-parity / digit / leak / merged-schema / coverage)');
var LRE = require(p('js/lr-authored-engine.js'));
var LRSchema = require(p('data/lr-authored/schema.js'));
var LRI = require(p('js/lr-authored-i18n.js'));
var lrItems = LRE.all();                                   // approved, schema-valid EN items (the set overlays must cover)
var lrById = {}; lrItems.forEach(function (it) { lrById[it.id] = it; });
var lrIds = lrItems.map(function (it) { return it.id; });
var LR_ALLOWED = { id: 1, stem: 1, options: 1, explanation: 1 };   // ONLY display fields may be overlaid (id is the key)
console.log('  (' + lrItems.length + ' EN authored items loaded)');
['hi', 'mr'].forEach(function (lang) {
  var fErr = 0, oErr = 0, dErr = 0, lErr = 0, sErr = 0;
  /* Stub the study language so LRI.resolve() returns the MERGED view (with the index-derived answer) for validation.
     Reset + re-require ONLY this language's overlays so coverage/resolve reflect exactly this pack. */
  var prevQR = global.QRI18n;
  global.QRI18n = { studyLang: function () { return lang; } };
  LRI._reset();
  ['critical', 'statement', 'cause', 'course', 'decision'].forEach(function (fam) {
    var f = path.join(__dirname, '..', 'data/lr-authored/i18n/' + lang + '/' + fam + '.js');
    if (fs.existsSync(f)) { delete require.cache[require.resolve(f)]; require(f); }
  });
  var cov = LRI._coverage(lang, lrIds);
  lrIds.forEach(function (id) {
    var ov = LRI._overlayOf(lang, id); if (!ov) return;
    var base = lrById[id];
    for (var k in ov) { if (!LR_ALLOWED[k]) { fErr++; console.error('  ✗ [' + lang + '] ' + id + ': forbidden field "' + k + '" in item overlay'); } }
    /* options count parity — the answer-by-index derivation REQUIRES identical length/order */
    if (ov.options && ov.options.length !== base.options.length) { oErr++; console.error('  ✗ [' + lang + '] ' + id + ': options count ' + ov.options.length + ' != EN ' + base.options.length); }
    /* digit multiset per display field (no dropped/added digits, no Devanagari numerals) */
    var de = []; digitCongruent({ stem: base.stem, options: base.options, explanation: base.explanation }, { stem: ov.stem, options: ov.options, explanation: ov.explanation }, id, de);
    if (de.length) { dErr += de.length; de.slice(0, 2).forEach(function (x) { console.error('  ✗ [' + lang + '] digits ' + x); }); }
    /* Latin-leak over the translated display strings */
    var ss = []; leafStrings({ stem: ov.stem, options: ov.options, explanation: ov.explanation }, ss);
    ss.forEach(function (s) { if (leaks(s)) { lErr++; if (lErr <= 2) console.error('  ✗ [' + lang + '] Latin leak: ' + String(s).slice(0, 70)); } });
    /* MERGED-view schema validity: the index-derived answer ∈ translated options, lengths, no placeholders */
    var merged = LRI.resolve(base);
    var se = LRSchema.validateItem(merged);
    if (se.length) { sErr += se.length; se.slice(0, 2).forEach(function (x) { console.error('  ✗ [' + lang + '] merged-schema ' + x); }); }
  });
  global.QRI18n = prevQR;
  ok(fErr === 0, lang + ' authored-LR: no forbidden fields overlaid (display-only)');
  ok(oErr === 0, lang + ' authored-LR: translated options index-aligned with the EN base (count parity)');
  ok(dErr === 0, lang + ' authored-LR: digits preserved (no Devanagari numerals)');
  ok(lErr === 0, lang + ' authored-LR: no Latin leak in translated item strings');
  ok(sErr === 0, lang + ' authored-LR: merged view passes the item schema (answer ∈ options, lengths, no placeholders)');
  console.log('  ' + lang + ': ' + cov.have + '/' + cov.total + ' items overlaid' + (cov.complete ? ' [complete]' : ''));
  if (cov.complete) ok(cov.have === cov.total, lang + ' authored-LR declares complete but is missing ' + (cov.total - cov.have) + ' item overlays');
});

if (failures) { console.error('\n✗ learn-i18n.check FAILED with ' + failures + ' failure(s).'); process.exit(1); }
console.log('\n✓ learn-i18n.check passed — Learn translation-overlay machinery sound (congruence / forbidden / leak / digit / merged-schema / coverage).');
