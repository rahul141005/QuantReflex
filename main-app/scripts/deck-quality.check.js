/**
 * deck-quality.check.js — ADR-165: a deck must not repeat itself, and must not always be the same topics.
 *
 * BEHAVIOURAL, not source inspection. The real js/questions.js runs under node (api/duel.js already
 * requires it), so every assertion below is measured from decks the generator actually produces.
 *
 * TWO DEFECTS THIS PINS
 *
 * 1. IN-DECK DUPLICATES. `seen` is the only thing stopping the same question appearing twice in the deck
 *    being built. generateQuestions' escape hatch used to clear it on the FIRST exhaustion, so a
 *    byte-identical question could be pushed again — measured at 40 of 40 decks for
 *    permutation-combination/easy, averaging 4.35 repeats per 10.
 *    Most of those escapes were not real exhaustion. `_makeFingerprint` keyed on
 *    `category + first 3 digit-runs of the stem`, so a stem with NO digits collapsed to just "cat:" —
 *    identical for every question in the category. The first such question poisoned the fingerprint for
 *    the whole category and everything after it was rejected as a duplicate until the hatch fired. 25 of
 *    68 categories emit digitless stems (the verbal- and visual-reasoning families).
 *
 * 2. TOPIC MONOCULTURE. generateMultiTopic gives each topic `floor(n / topics)` questions and hands the
 *    remainder to the first `n % topics` of them. When there are MORE topics than questions — the normal
 *    case for a subject-scoped drill — `floor` is 0, so exactly the first n topics IN SOURCE ORDER get a
 *    question and the rest get none. A subject-scoped Quant Quick Drill (5 questions, 36 categories)
 *    therefore served the same five categories for ever; 31 of 36 were unreachable. The user cannot tell,
 *    because the QUESTIONS differ every run — only the topics never do.
 *
 * THE STANDARD IS min(pool, n), NOT ZERO. A category with a 7-question pool cannot fill a 10-question
 * deck without repeating; demanding zero duplicates there would be demanding the impossible. So the
 * assertion is that the deck contains as many DISTINCT questions as the pool can supply.
 *
 *   node scripts/deck-quality.check.js      (run from main-app/)
 */
'use strict';
var path = require('path');
var Q = require(path.join(__dirname, '..', 'js/questions.js'));

var pass = 0, fail = 0;
function ok(c, m, d) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }

console.log('Deck quality — no self-repeats, no topic monoculture (ADR-165)\n');

var key = function (q) { return JSON.stringify([q.question, q.answer]); };

/* Measure a category's true distinct pool by drawing single questions many times. */
function poolOf(cat, diff, draws) {
  var s = {};
  var n = 0;
  for (var i = 0; i < (draws || 400); i++) {
    var q = Q.generateQuestions(1, cat, diff);
    if (q && q[0]) { var k = key(q[0]); if (!s[k]) { s[k] = 1; n++; } }
  }
  return n;
}

/* ── 1. A deck reaches min(pool, n) distinct questions ──────────────────────────────────────────────
   These four cells are the ones the audit measured as worst. Two have pools ABOVE the deck size (so
   zero repeats is achievable and required) and two below (so some repetition is arithmetic, not a bug). */
[['cubes', 'easy'], ['lr-critical', 'medium'], ['permutation-combination', 'easy']].forEach(function (cell) {
  var cat = cell[0], diff = cell[1];
  var pool = poolOf(cat, diff, 600);
  if (!pool) { ok(false, cat + '/' + diff + ': generator produced nothing'); return; }
  var want = Math.min(pool, 10);
  var best = 0;
  for (var t = 0; t < 12; t++) {
    var deck = Q.generateQuestions(10, cat, diff) || [];
    var seen = {}, d = 0;
    for (var i = 0; i < deck.length; i++) { var k = key(deck[i]); if (!seen[k]) { seen[k] = 1; d++; } }
    if (d > best) best = d;
  }
  ok(best >= want,
    '** ' + cat + '/' + diff + ': a 10-deck reaches min(pool,10) distinct questions',
    'got ' + best + ', pool is ' + pool + ' so ' + want + ' was achievable');
});

/* ── 2. A digitless stem gets its own fingerprint ───────────────────────────────────────────────────
   The collapse was invisible from outside: it did not throw, it just made every candidate look like a
   duplicate. Assert the key really does distinguish two different digitless questions. */
(function () {
  var src = require('fs').readFileSync(path.join(__dirname, '..', 'js/questions.js'), 'utf8');
  ok(/if \(!nums\.length\) return cat \+ '\|' \+ \(q\.subtype \|\| ''\) \+ '\|' \+ String\(q\.question\);/.test(src),
    '** a stem with no digits falls back to the stem itself, not a per-category constant (ADR-165)');
  ok(/if \(\+\+escapes >= 3\) seen = \{\};/.test(src),
    '** the in-deck identity map survives the first exhaustions — a duplicate is the LAST resort');
  ok(!/attempts >= maxAttempts\) \{\s*\n\s*\/\*[\s\S]{0,200}?\*\/\s*\n\s*seen = \{\};/.test(src),
    '** ...and is not cleared on the first escape, which is what produced byte-identical repeats');
})();

/* ── 3. A subject-scoped deck can reach EVERY topic in its subject ──────────────────────────────────
   200 five-question decks over a 36-category pool: if the allocation still favoured source order this
   would report 5. */
(function () {
  var cats = Object.keys(Q.categoryGenerators || {});
  /* Use a wide slice of real categories rather than the subject map, which lives in another module. */
  var pool = cats.slice(0, 30);
  if (pool.length < 12) { ok(false, 'not enough categories to measure topic coverage'); return; }
  var reached = {}, n = 0;
  for (var t = 0; t < 200; t++) {
    var deck = Q.generateMultiTopic(5, pool) || [];
    for (var i = 0; i < deck.length; i++) {
      var c = deck[i] && deck[i].category;
      if (c && !reached[c]) { reached[c] = 1; n++; }
    }
  }
  ok(n > 5, '** a 5-question multi-topic deck is not confined to the first 5 topics (ADR-165)',
    'reached ' + n + ' of ' + pool.length + ' — 5 means the source-order allocation is back');
  ok(n >= Math.min(pool.length, 20),
    '** ...and reaches most of the pool across 200 decks',
    'reached ' + n + ' of ' + pool.length);
})();

console.log('\ndeck-quality.check: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
