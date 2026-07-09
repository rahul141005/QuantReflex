/**
 * lr-kinship.check.js — the kinship truth-table test (ADR-111 Phase F-M6). Runs in npm test.
 *
 * Blood-relation composition is the single highest-correctness-risk area of LR i18n: Hindi/Marathi kinship is finer
 * than English (Uncle → चाचा/मामा by lineage), so a rendering that is grammatically fine can still be the WRONG relative.
 * This test enumerates EVERY ordered primitive pair (r1,r2) over {father,mother,son,daughter,brother,sister} — all 36 —
 * and, using the engine's exposed composition (_kinship.compose2 / .specifier), asserts:
 *   1. the GENERIC relation and lineage SPECIFIER the engine derives match a HAND-WRITTEN expected table
 *      (scripts/fixtures/lr-kinship.json — the correctness gold standard, independently reasoned, not code-generated);
 *   2. for EVERY registered language pack, relTerm(generic, spec) renders EXACTLY the expected native term
 *      (EN collapses to the generic; hi/mr render the specific word — मामा vs चाचा vs नाना);
 *   3. per language, the rendered ANSWER term for a pair never collides with the CANONICAL term of any OTHER generic
 *      (so a blood-relation MCQ's option set can never be silently de-duplicated into an ambiguous answer).
 *
 * up-down pairs (father-of-a-son, …) are logically ambiguous ⇒ generic null ⇒ the engine skips them; asserted too.
 * Deterministic, no RNG. mr validates once locales/gen/mr.lr.js is authored and the fixture gains its column (F-M6.3).
 */
'use strict';

var path = require('path');
var fs = require('fs');

var failures = 0;
function ok(cond, msg) { if (cond) return; failures++; console.error('  ✗ ' + msg); }
function section(name) { console.log('\n' + name); }

var LR = require(path.join(__dirname, '..', 'js', 'lr-engine.js'));
var K = LR._kinship;
var PRIM = K.PRIM;
var PRIMS = ['father', 'mother', 'son', 'daughter', 'brother', 'sister'];
var FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lr-kinship.json'), 'utf8'));
var TABLE = FIXTURE.pairs;

/* Registered language packs (each self-registers via GI.registerLR at require time and returns its LR pack object). */
var PACKS = { en: require(path.join(__dirname, '..', 'locales', 'gen', 'en.lr.js')) };
try { PACKS.hi = require(path.join(__dirname, '..', 'locales', 'gen', 'hi.lr.js')); } catch (_) {}
try { PACKS.mr = require(path.join(__dirname, '..', 'locales', 'gen', 'mr.lr.js')); } catch (_) {}
/* only languages that have BOTH a pack AND a fixture column are validated; others are reported as pending. */
var LANGS = Object.keys(PACKS).filter(function (l) {
  return Object.keys(TABLE).some(function (k) { return Object.prototype.hasOwnProperty.call(TABLE[k], l); });
});

console.log('lr-kinship.check — blood-relation composition truth table (ADR-111 F-M6)');
console.log('  (36 ordered primitive pairs; languages validated: ' + LANGS.join(', ') + ')');

/* ── 1 + 2. every pair: engine composition + per-language rendering match the hand table ── */
section('1. Composition + specifier + per-language rendering vs the hand-written table');
var checked = 0, nullPairs = 0;
PRIMS.forEach(function (r1) {
  PRIMS.forEach(function (r2) {
    var key = r1 + '|' + r2;
    var exp = TABLE[key];
    ok(!!exp, 'fixture missing pair ' + key);
    if (!exp) return;
    checked++;
    var combo = PRIM[r1].t + '-' + PRIM[r2].t;
    var generic = K.compose2(r1, r2);
    var spec = generic ? K.specifier(combo, r2) : null;
    ok(combo === exp.combo, key + ': combo ' + combo + ' ≠ expected ' + exp.combo);
    ok((generic || null) === exp.generic, key + ': generic ' + JSON.stringify(generic) + ' ≠ expected ' + JSON.stringify(exp.generic));
    ok((spec || null) === (exp.spec || null), key + ': specifier ' + JSON.stringify(spec) + ' ≠ expected ' + JSON.stringify(exp.spec));
    if (generic === null) { nullPairs++; return; }   // ambiguous up-down pair — engine skips, no rendering
    LANGS.forEach(function (l) {
      var got = PACKS[l].relTerm(generic, spec);
      ok(got === exp[l], key + ' [' + l + ']: relTerm → "' + got + '" ≠ expected "' + exp[l] + '"');
    });
  });
});
ok(checked === 36, 'enumerated all 36 primitive pairs (got ' + checked + ')');
console.log('  ' + checked + ' pairs checked (' + nullPairs + ' ambiguous/null); ' + LANGS.length + ' language(s) rendered per pair.');

/* ── 3. per-language: an answer's specific term never collides with another generic's canonical distractor term ──
   In a blood MCQ the answer generic renders with its specifier while the 3 distractors (other generics) render
   canonically (spec=null). If a specific answer term equalled a different generic's canonical, the option set could
   silently lose the answer to a duplicate. Assert every specific answer term is absent from the OTHER generics' canon. */
section('2. Option-safety: specific answer terms never collide with other generics\' canonical terms');
var GENERICS = ['Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Nephew', 'Niece', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Cousin'];
LANGS.forEach(function (l) {
  var pack = PACKS[l];
  var canon = {}; GENERICS.forEach(function (g) { canon[g] = pack.relTerm(g, null); });
  /* canonical terms must themselves be pairwise distinct (else plain distractor sets could collapse). */
  var seen = {};
  GENERICS.forEach(function (g) { ok(!seen[canon[g]], l + ': canonical term "' + canon[g] + '" is not unique (also ' + seen[canon[g]] + ')'); seen[canon[g]] = g; });
  /* each pair's specific answer term must not equal any OTHER generic's canonical. */
  Object.keys(TABLE).forEach(function (key) {
    var exp = TABLE[key];
    if (!exp.generic || !exp.spec) return;
    var term = pack.relTerm(exp.generic, exp.spec);
    GENERICS.forEach(function (g) {
      if (g === exp.generic) return;
      ok(term !== canon[g], l + ': ' + key + ' answer "' + term + '" collides with canonical(' + g + ')="' + canon[g] + '"');
    });
  });
});

/* pending languages (pack exists but no fixture column, or vice-versa) — reported, not failed. */
['hi', 'mr'].forEach(function (l) {
  if (LANGS.indexOf(l) === -1) console.log('  (' + l + ' kinship pending: ' + (PACKS[l] ? 'fixture column' : 'pack') + ' not yet present)');
});

if (failures) { console.error('\n✗ lr-kinship.check FAILED with ' + failures + ' failure(s).'); process.exit(1); }
console.log('\n✓ lr-kinship.check passed — kinship composition and native rendering are correct across ' + LANGS.length + ' language(s).');
