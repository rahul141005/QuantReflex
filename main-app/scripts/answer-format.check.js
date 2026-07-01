/**
 * answer-format.check.js — proves the generator ⇄ keyboard ⇄ grader contract (ADR-086). Wired into `npm test`.
 *
 * For a large sample of every free-entry generator (Quant · DI · LR core), it asserts that `answerFormat(q)` either
 * (a) classes the question as MCQ (options present), or (b) exposes EXACTLY the keys needed to type its answer:
 *   - every character of the normalised answer is in `descriptor.keys`, AND
 *   - typing the answer left-to-right passes `validateKeystroke` at every step (so a valid answer is always enterable
 *     and never blocked by the invalid-sequence guard).
 * If any generator can emit an answer the keyboard cannot produce, this test fails — making an un-typeable question
 * impossible to ship.
 */
'use strict';
var path = require('path');
var p = function (f) { return path.join(__dirname, '..', f); };
var AF = require(p('js/answer-format.js'));
var Q = require(p('js/questions.js'));
var DI = require(p('js/di-engine.js'));
var LR = require(p('js/lr-engine.js'));
var QUANT_CATS = Object.keys(require(p('services/quantTopics.js')).CATEGORY_LABELS);

var pass = 0, fail = 0, shown = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; if (shown++ < 25) console.error('  ✗ ' + name); } }

var DIFFS = ['easy', 'medium', 'hard'];
var N = 120;                       /* per category × difficulty → ~ (36+5+12) × 3 × 120 ≈ 19k questions */
var numericChecked = 0, mcqChecked = 0;

/* Sweep one engine. getQ(cat,diff) returns the raw question; we force `category` onto it (LR omits it). */
function sweep(label, cats, getQ) {
  cats.forEach(function (cat) {
    DIFFS.forEach(function (diff) {
      for (var i = 0; i < N; i++) {
        var q;
        try { q = getQ(cat, diff); } catch (e) { ok(label + ' ' + cat + '/' + diff + ' generates without throwing', false); break; }
        if (!q) continue;                                   /* some tiers legitimately return null → retried by engine */
        q.category = q.category || cat;
        var d = AF.answerFormat(q);
        var isMcq = !!(q.options && q.options.length);
        ok(label + ' ' + cat + ' kind matches options presence', (d.kind === 'mcq') === isMcq);
        if (isMcq) { mcqChecked++; continue; }
        numericChecked++;
        var ans = AF.normalize(q.answer);
        /* every character of the answer must be an exposed key */
        for (var c = 0; c < ans.length; c++) {
          var ch = ans.charAt(c);
          if (d.keys.indexOf(ch) === -1) { ok(label + ' ' + cat + '/' + diff + ' answer char "' + ch + '" is on the keypad  (answer="' + q.answer + '", keys=' + d.keys.join('') + ')', false); break; }
        }
        /* typing the answer left-to-right must never be blocked by the invalid-sequence guard */
        var buf = '';
        for (var k = 0; k < ans.length; k++) {
          var key = ans.charAt(k);
          if (!d.validateKeystroke(buf, key)) { ok(label + ' ' + cat + '/' + diff + ' answer "' + q.answer + '" is enterable keystroke-by-keystroke (blocked at "' + key + '" after "' + buf + '")', false); break; }
          buf += key;
        }
        ok(label + ' ' + cat + '/' + diff + ' round-trips (typed == normalized answer)', buf === ans);
      }
    });
  });
}

console.log('answer-format.check — generator ⇄ keyboard ⇄ grader contract (ADR-086)');

/* descriptor shape sanity */
(function () {
  var d = AF.answerFormat({ category: 'squares', subtype: 'easy:direct' });
  ok('0 numeric descriptor has digit keys', d.kind === 'numeric' && d.keys.indexOf('0') !== -1 && d.keys.indexOf('9') !== -1);
  ok('0 mcq descriptor has no keys', AF.answerFormat({ category: 'quantity-comparison', options: ['a', 'b'], subtype: 'x' }).kind === 'mcq');
  ok('0 fraction exposes /', AF.answerFormat({ category: 'fractions', subtype: 'medium:pctToFrac' }).keys.indexOf('/') !== -1);
  ok('0 ratio exposes :', AF.answerFormat({ category: 'ratios', subtype: 'easy:pctRatio' }).keys.indexOf(':') !== -1);
  ok('0 slope exposes -', AF.answerFormat({ category: 'coordinate-geometry-basics', subtype: 'hard:slope' }).keys.indexOf('-') !== -1);
  ok('0 integer keypad has no symbols', AF.answerFormat({ category: 'squares', subtype: 'easy:direct' }).keys.length === 10);
  /* invalid-sequence guard */
  ok('0 blocks 2nd decimal', AF.validateKeystroke('1.5', '.') === false);
  ok('0 blocks non-leading minus', AF.validateKeystroke('12', '-') === false);
  ok('0 allows leading minus', AF.validateKeystroke('', '-') === true);
  ok('0 blocks leading ratio colon', AF.validateKeystroke('', ':') === false);
  ok('0 blocks double separator', AF.validateKeystroke('3:', ':') === false);
})();

sweep('Q', QUANT_CATS, function (c, d) { return Q.generateQuestion(c, d); });
sweep('DI', DI.categories(), function (c, d) { return DI.generate(c, d); });
sweep('LR', LR.categories(), function (c, d) { return LR.generate(c, d); });

console.log('answer-format.check: ' + pass + ' passed, ' + fail + ' failed');
console.log('  (numeric answers proven typeable: ' + numericChecked + '; MCQ questions: ' + mcqChecked + ')');
if (fail) process.exit(1);
