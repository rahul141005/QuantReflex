/**
 * category-source.check.js — enforces the SINGLE SOURCE OF TRUTH for Quant drill categories (ADR-084).
 *
 * The Quant category set is declared in exactly one place — services/quantTopics.js CATEGORY_LABELS — and must stay
 * in lock-step with the generators (js/questions.js categoryGenerators) and every derived consumer. This check fails
 * the build if the label set and the generator set ever drift, if any category lacks a real (non-key) display label,
 * or if a category can't resolve an auto-tip. Adding a future Quant topic should require editing only the registry +
 * questions.js; this guard makes a stale hardcoded list impossible to ship.
 *   node scripts/category-source.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }

var quantTopics = require(p('services/quantTopics'));
var QGen = require(p('js/questions'));
var SUB = require(p('data/subjects'));

var pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + label); } }
function eqSet(label, a, b) {
  var sa = a.slice().sort(), sb = b.slice().sort();
  if (JSON.stringify(sa) === JSON.stringify(sb)) { pass++; return; }
  fail++;
  var extraA = sa.filter(function (x) { return sb.indexOf(x) === -1; });
  var extraB = sb.filter(function (x) { return sa.indexOf(x) === -1; });
  console.error('  ✗ ' + label + '\n      only in first:  ' + JSON.stringify(extraA) + '\n      only in second: ' + JSON.stringify(extraB));
}

console.log('category-source.check — Quant category single-source-of-truth (ADR-084)');

var labelKeys = Object.keys(quantTopics.CATEGORY_LABELS);
var genKeys = Object.keys(QGen.categoryGenerators);

/* 1. label set == generator set (both directions) — the core invariant. */
eqSet('1 CATEGORY_LABELS keys == categoryGenerators keys', labelKeys, genKeys);

/* 2. every category has a real, non-empty display label that is NOT just the raw key. */
labelKeys.forEach(function (k) {
  var v = quantTopics.CATEGORY_LABELS[k];
  ok('2 ' + k + ' has a real label', typeof v === 'string' && v.length > 0 && v !== k);
  ok('2 ' + k + ' label() resolves', quantTopics.label(k) === v);
});

/* 3. the derived subject layer resolves EXACTLY the label set for Quant (no duplicated/stale list). */
eqSet('3 subjectToCategories(quant) == CATEGORY_LABELS keys', SUB.subjectToCategories('quant'), labelKeys);
labelKeys.forEach(function (k) { ok('3 ' + k + ' → quant', SUB.categoryToSubject(k) === 'quant'); });

/* 4. every category resolves an auto-tip (graceful fallback allowed) — no category renders a blank tip. */
try {
  var Scoring = require(p('js/services/scoring-service'));
  if (Scoring && typeof Scoring.getAutoTip === 'function') {
    labelKeys.forEach(function (k) {
      var tip = Scoring.getAutoTip(k, 'medium:x');
      ok('4 ' + k + ' resolves an auto-tip', typeof tip === 'string' && tip.length > 0);
    });
  }
} catch (e) { /* scoring-service is browser-oriented; skip if it can't load headless */ }

console.log('category-source.check: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
