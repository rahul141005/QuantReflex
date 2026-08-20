/**
 * lr-set-engine.check.js — validates LR puzzle SETS (ADR-079).
 *
 * The whole promise of a puzzle set is "the clues admit EXACTLY ONE arrangement, and every question's answer is read
 * off it." This harness verifies that from the HUMAN-FACING text alone (fully independent of the engine's solver):
 *   1. parse the clue sentences from `context`, turn each into a predicate, and brute-force-solve over ALL N!
 *      arrangements of the people → assert exactly ONE solution, and it equals the engine's `_solution`;
 *   2. parse every question and recompute its answer directly from that solution → assert it matches;
 *   3. structural: answer ∈ options, options distinct, difficulties non-decreasing.
 * Wired into `npm test`.   node scripts/lr-set-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var SE = require(p('js/lr-set-engine'));

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 16) console.error('  ✗ ' + label); } }

/* independent permutation generator */
function permute(a) { if (a.length <= 1) return [a.slice()]; var r = []; for (var i = 0; i < a.length; i++) { var rest = a.slice(0, i).concat(a.slice(i + 1)); permute(rest).forEach(function (q) { r.push([a[i]].concat(q)); }); } return r; }

/* clue-text → predicate over an arrangement `arr` (index 0 = left / bottom) */
function idx(arr, n) { return arr.indexOf(n); }
function parseClue(s) {
  var m;
  if ((m = s.match(/^(\w+) sits at the extreme left end/)) || (m = s.match(/^(\w+) lives on the lowest floor/))) { var p0 = m[1]; return function (a) { return a[0] === p0; }; }
  if ((m = s.match(/^(\w+) sits at the extreme right end/)) || (m = s.match(/^(\w+) lives on the topmost floor/))) { var pN = m[1]; return function (a) { return a[a.length - 1] === pN; }; }
  if ((m = s.match(/^(\w+) sits immediately to the left of (\w+)/)) || (m = s.match(/^(\w+) lives immediately below (\w+)/))) { var ia = m[1], ib = m[2]; return function (a) { return idx(a, ia) + 1 === idx(a, ib); }; }
  if ((m = s.match(/^(\w+) sits exactly between (\w+) and (\w+)/)) || (m = s.match(/^(\w+) lives on a floor exactly between (\w+) and (\w+)/))) { var bp = m[1], ba = m[2], bb = m[3]; return function (a) { var ip = idx(a, bp), x = idx(a, ba), y = idx(a, bb); return (x === ip - 1 && y === ip + 1) || (y === ip - 1 && x === ip + 1); }; }
  if ((m = s.match(/^Exactly (\d+) (?:person sits|persons sit) between (\w+) and (\w+)/)) || (m = s.match(/^Exactly (\d+) (?:floor lies|floors lie) between the floors of (\w+) and (\w+)/))) { var gk = +m[1], gp = m[2], gq = m[3]; return function (a) { return Math.abs(idx(a, gp) - idx(a, gq)) - 1 === gk; }; }
  if ((m = s.match(/^(\w+) sits somewhere to the left of (\w+)/)) || (m = s.match(/^(\w+) lives on some floor below (\w+)/))) { var lp = m[1], lq = m[2]; return function (a) { return idx(a, lp) < idx(a, lq); }; }
  return null;
}
/* question text → expected answer from the solution (array index 0 = left/bottom) */
function expectedFor(t, sol) {
  var N = sol.length, m;
  if ((m = t.match(/(\d+)\w\w position from the left/)) || (m = t.match(/lives on floor number (\d+)/))) return sol[(+m[1]) - 1];
  if (/extreme left end of the row\?$/.test(t) || /lowest floor\?$/.test(t)) return sol[0];
  if ((m = t.match(/immediately to the right of (\w+)/)) || (m = t.match(/immediately above (\w+)/))) return sol[sol.indexOf(m[1]) + 1];
  if (m = t.match(/How many .* between (?:the floors of )?(\w+) and (\w+)/)) return String(Math.abs(sol.indexOf(m[1]) - sol.indexOf(m[2])) - 1);
  if ((m = t.match(/(\d+)\w\w from the right end/)) || (m = t.match(/(\d+)\w\w floor from the top/))) return sol[N - (+m[1])];
  if ((m = t.match(/immediate neighbour of (\w+)/)) || (m = t.match(/immediately adjacent to (\w+)/))) { var i = sol.indexOf(m[1]); return [sol[i - 1], sol[i + 1]].filter(Boolean); }
  return undefined;
}

console.log('lr-set-engine.check — LR puzzle sets (ADR-079)');

ok('categories are lr-seating + lr-puzzle', SE.categories().join(',') === 'lr-seating,lr-puzzle');

var RANK = { easy: 0, medium: 1, hard: 2 };
[['lr-seating', 120], ['lr-puzzle', 120]].forEach(function (job) {
  var cat = job[0], iters = job[1];
  for (var n = 0; n < iters; n++) {
    var set = SE.generateSet(cat);
    ok(cat + ' set built', !!set && !!set.questions && set.questions.length >= 3);
    if (!set) continue;
    ok(cat + ' category', set.category === cat);
    ok(cat + ' no chart', set.chart === null && typeof set.context === 'string' && set.context.length > 40);
    var sol = set._solution, N = sol.length;
    ok(cat + ' solution size', N >= 5 && N <= 6 && new Set(sol).size === N);

    /* 1. uniqueness from the clue TEXT */
    var sentences = set.context.split('. ').map(function (s) { return s.replace(/\.\s*$/, '').trim(); }).filter(Boolean);
    var clueTexts = sentences.slice(1);            // drop the intro sentence
    var preds = clueTexts.map(parseClue);
    ok(cat + ' every clue parses', preds.every(Boolean) && preds.length >= 3);
    if (preds.every(Boolean)) {
      var solutions = permute(sol).filter(function (arr) { return preds.every(function (pr) { return pr(arr); }); });
      ok(cat + ' clues admit EXACTLY ONE arrangement', solutions.length === 1);
      ok(cat + ' that arrangement is the engine solution', solutions.length === 1 && solutions[0].join('|') === sol.join('|'));
    }

    /* 2. every question answer recomputed from the solution */
    set.questions.forEach(function (q) {
      ok(cat + ' answer in options', q.options.indexOf(String(q.answer)) !== -1);
      ok(cat + ' options distinct', new Set(q.options).size === q.options.length);
      var exp = expectedFor(q.question, sol);
      if (Array.isArray(exp)) {
        ok(cat + ' neighbour answer valid', exp.indexOf(String(q.answer)) !== -1);
        /* ADR-164 — AND IT MUST BE THE ONLY VALID ANSWER ON OFFER.
           `exp` is an ARRAY here precisely because "an immediate neighbour of X" has TWO correct
           answers whenever X is not at an end — and the generator only ever asks about interior
           positions. The assertion above checks the KEY is a neighbour, which it always was; it never
           checked whether the OTHER neighbour was also sitting in the option list. It was: measured at
           291 of 445 questions (65.4%) before the fix. A student who named the un-keyed neighbour was
           told they were wrong, which for an exam-prep app is the worst possible failure — it teaches
           that a correct method is incorrect.
           An MCQ must have exactly one correct option. This asserts that property directly, so it
           holds however the generator later changes. */
        var alsoCorrect = (q.options || []).map(String).filter(function (o) {
          return exp.indexOf(o) !== -1 && o !== String(q.answer);
        });
        ok(cat + ' ** neighbour question offers exactly ONE correct answer (ADR-164)',
          alsoCorrect.length === 0,
          alsoCorrect.length ? ('also correct but graded wrong: ' + alsoCorrect.join(', ') +
            ' | q=' + q.question + ' | options=' + (q.options || []).join('/')) : '');
      }
      else if (exp !== undefined) ok(cat + ' answer matches solution', String(exp) === String(q.answer));
      else ok(cat + ' question recognized: ' + q.question, false);
    });

    /* 3. progressive (non-decreasing) difficulty */
    var prev = -1, prog = true;
    set.questions.forEach(function (q) { if (RANK[q.difficulty] < prev) prog = false; prev = RANK[q.difficulty]; });
    ok(cat + ' difficulties non-decreasing', prog);
  }
});

console.log('\nlr-set-engine.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
