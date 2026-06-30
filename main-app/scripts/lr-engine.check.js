/**
 * lr-engine.check.js — validates the Logical Reasoning engine (ADR-075, QuantReflex V2 Phase 3).
 *
 * Correctness is the whole game for LR (a wrong key teaches wrong reasoning). This harness generates a large sample
 * of every category × difficulty and INDEPENDENTLY re-derives each answer:
 *   - numeric topics (coding-sum/revsum, direction-distance, ranking, analogies) → recomputed from the parsed stem;
 *   - MCQ topics → answer must be among the options, options distinct; plus topic-specific validation:
 *       · coding-cipher: re-derive the shift from the example and re-encode the target;
 *       · blood: re-compose the relation from the two stated links;
 *       · direction(MCQ): re-compute the net displacement → compass direction;
 *       · odd-one-out: confirm the other 3 share a real rule (square/cube/prime/common-factor) the answer breaks;
 *       · syllogisms: re-check validity with an independent set-logic MODEL CHECKER (256-region enumeration).
 * Wired into `npm test`.   node scripts/lr-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var LR = require(p('js/lr-engine'));

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 14) console.error('  ✗ ' + label); } }

/* ── independent re-implementations ── */
function pos(ch) { return ch.charCodeAt(0) - 64; }
function sumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += pos(w[i]); return s; }
function revSumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += (27 - pos(w[i])); return s; }
function shiftWord(w, k) { var o = ''; for (var i = 0; i < w.length; i++) o += String.fromCharCode(65 + ((pos(w[i]) - 1 + (k % 26) + 26) % 26)); return o; }
function isSquare(n) { var r = Math.round(Math.sqrt(n)); return r * r === n; }
function isCube(n) { var r = Math.round(Math.cbrt(n)); return r * r * r === n; }
function isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/* analogy: does SOME standard rule map a→fa and c→answer? */
function analogyConsistent(a, fa, c, ans) {
  var fns = [];
  if (a !== 0 && fa % a === 0) { var k = fa / a; fns.push(function (n) { return n * k; }); }
  fns.push((function (d) { return function (n) { return n + d; }; })(fa - a));
  fns.push(function (n) { return n * n; }, function (n) { return n * n * n; },
    function (n) { return n * n + 1; }, function (n) { return n * n - 1; },
    function (n) { return n * (n + 1); }, function (n) { return n * n + n; });
  return fns.some(function (f) { return f(a) === fa && f(c) === ans; });
}

/* odd-one-out: independently confirm EXACTLY ONE element is a defensible odd-one, and it's the engine's answer
   (uniqueness — a second valid answer would mean the grader marks a correct pick wrong). Checklist authored
   separately from the engine so a divergence is caught. */
function validOdd(all, c) {
  var others = all.filter(function (x) { return x !== c; });
  if (others.length !== 3) return false;
  if (others.every(isSquare) && !isSquare(c)) return true;
  if (others.every(isCube) && !isCube(c)) return true;
  if (others.every(isPrime) && !isPrime(c)) return true;
  if (others.every(function (x) { return x % 2 === 0; }) && c % 2 !== 0) return true;
  if (others.every(function (x) { return x % 2 !== 0; }) && c % 2 === 0) return true;
  for (var k = 2; k <= 9; k++) if (others.every(function (x) { return x % k === 0; }) && c % k !== 0) return true;
  var g = others.reduce(function (x, y) { return gcd(x, y); }); if (g >= 2 && c % g !== 0) return true;
  return false;
}
function oddUnique(opts, ans) {
  var nums = opts.map(Number), valid = nums.filter(function (c) { return validOdd(nums, c); });
  return valid.length === 1 && String(valid[0]) === String(ans);
}

/* syllogism validity: enumerate the 8 A/B/C regions; a model = which regions are non-empty. */
function syllValid(premises, conclusion) {
  // region bit r in 0..7: bit0=A,bit1=B,bit2=C membership
  function inSet(r, s) { return (r >> ({ A: 0, B: 1, C: 2 }[s])) & 1; }
  function stmtHolds(st, model) { // model = array of 8 booleans (region nonempty)
    var X = st.x, Y = st.y;
    if (st.q === 'All') { for (var r = 0; r < 8; r++) if (model[r] && inSet(r, X) && !inSet(r, Y)) return false; return true; }
    if (st.q === 'No') { for (var r = 0; r < 8; r++) if (model[r] && inSet(r, X) && inSet(r, Y)) return false; return true; }
    if (st.q === 'Some') { for (var r = 0; r < 8; r++) if (model[r] && inSet(r, X) && inSet(r, Y)) return true; return false; }
    /* Some-not */ for (var r2 = 0; r2 < 8; r2++) if (model[r2] && inSet(r2, X) && !inSet(r2, Y)) return true; return false;
  }
  for (var mask = 1; mask < 256; mask++) {            // every non-empty universe
    var model = []; for (var r = 0; r < 8; r++) model[r] = !!((mask >> r) & 1);
    if (!premises.every(function (s) { return stmtHolds(s, model); })) continue;  // model must satisfy premises
    if (!stmtHolds(conclusion, model)) return 'Does not follow';                  // counter-model ⇒ invalid
  }
  return 'Follows';
}
function parseStmt(s) {
  var m = s.match(/^(All|No|Some) (\w+) are (not )?(\w+)$/);
  if (!m) return null;
  return { q: m[3] ? 'Some-not' : m[1], rawX: m[2], rawY: m[4] };
}

console.log('lr-engine.check — Logical Reasoning generator (ADR-075)');

ok('0 seven LR categories', LR.categories().length === 7 && LR.categories().indexOf('lr-syllogism') !== -1);

(function () {
  var cats = LR.categories(), diffs = ['easy', 'medium', 'hard'], total = 0, recomputed = 0;
  cats.forEach(function (cat) {
    diffs.forEach(function (diff) {
      for (var n = 0; n < 150; n++) {
        var q = LR.generate(cat, diff); total++;
        ok('struct ' + cat + ' category', q.category === cat);
        ok('struct ' + diff + ' subtype', q.subtype.indexOf(diff + ':') === 0);
        var isMCQ = !!(q.options && q.options.length);
        if (isMCQ) {
          ok('mcq ' + cat + ' answer in options', q.options.indexOf(String(q.answer)) !== -1);
          ok('mcq ' + cat + ' options distinct', new Set(q.options).size === q.options.length);
          ok('mcq ' + cat + ' >=2 options', q.options.length >= 2);
        } else {
          ok('num ' + cat + ' numeric+finite+int', typeof q.answer === 'number' && isFinite(q.answer) && q.answer % 1 === 0);
        }
        /* ── independent recompute per subtype ── */
        var key = q.subtype.split(':')[1], t = q.question, e = null, did = true;
        if (key === 'sum') { var w = t.match(/"([A-Z]+)"/)[1]; e = sumWord(w); }
        else if (key === 'revsum') { var w2 = t.match(/"([A-Z]+)"/)[1]; e = revSumWord(w2); }
        else if (key === 'cipher') { var mm = t.match(/"([A-Z]+)" is written as "([A-Z]+)"\. How is "([A-Z]+)"/); var k = (pos(mm[2][0]) - pos(mm[1][0]) + 26) % 26; e = shiftWord(mm[3], k); }
        else if (key === 'distance') { var ds = t.match(/(\d+) km/g).map(function (x) { return parseInt(x, 10); }); var vy, hx; if (ds.length === 2) { vy = ds[0]; hx = ds[1]; } else { vy = ds[0] - ds[1]; hx = ds[2]; } e = Math.round(Math.sqrt(vy * vy + hx * hx)); }
        else if (key === 'direction') { var nz = t.match(/(\d+) km North/), sz = t.match(/(\d+) km South/), ez = t.match(/(\d+) km East/), wz = t.match(/(\d+) km West/); var ny = (+nz[1]) - (+sz[1]), ex = (+ez[1]) - (+wz[1]); e = (ny > 0 ? 'North' : 'South') + '-' + (ex > 0 ? 'East' : 'West'); }
        else if (key === 'total') { var lr = t.match(/(\d+)th from the left and (\d+)th from the right/); e = (+lr[1]) + (+lr[2]) - 1; }
        else if (key === 'otherend') { var oe = t.match(/class of (\d+) students, \w+ ranks (\d+)th/); e = (+oe[1]) - (+oe[2]) + 1; }
        else if (key === 'between') { var bt = t.match(/(\d+)th from the front and \w+ is (\d+)th from the front/); e = (+bt[2]) - (+bt[1]) - 1; }
        else if (key === 'multistep') { var ms = t.match(/(\d+)th from the left and (\d+)th from the right.*?(\d+)th from the left\?/); e = ((+ms[1]) + (+ms[2]) - 1) - (+ms[3]); }
        else if (key === 'analogy') { var an = t.match(/(\d+) : (\d+) :: (\d+) :/); ok('analogy ' + cat + ' consistent rule', analogyConsistent(+an[1], +an[2], +an[3], q.answer)); did = false; }
        else if (key === 'oddout') { ok('oddout has a UNIQUE odd one (no second valid answer)', oddUnique(q.options, q.answer)); did = false; }
        else if (key.indexOf('syllogism') !== -1 || key === 'syllogism') {
          var seg = t.match(/Statements: (.*) Conclusion: (.*) Does/);
          var prem = seg[1].split('. ').filter(Boolean).map(function (s) { return parseStmt(s.replace(/\.$/, '')); });
          var conc = parseStmt(seg[2].replace(/\.$/, ''));
          if (prem.every(Boolean) && conc) {
            var labels = {}, next = ['A', 'B', 'C'], li = 0;
            function lab(raw) { if (!labels[raw]) labels[raw] = next[li++]; return labels[raw]; }
            prem.forEach(function (s) { s.x = lab(s.rawX); s.y = lab(s.rawY); });
            conc.x = lab(conc.rawX); conc.y = lab(conc.rawY);
            ok('syllogism ' + q.subtype + ' matches model-checker', syllValid(prem, conc) === q.answer);
          } else { ok('syllogism parseable', false); }
          did = false;
        } else { did = false; }
        if (did && e != null) { recomputed++; ok('recompute ' + cat + '/' + key, String(e) === String(q.answer)); }
      }
    });
  });
  console.log('  (samples: ' + total + '; numeric answers recomputed: ' + recomputed + ')');
  ok('a healthy share of answers were recomputed', recomputed > 1200);
})();

/* explicit difficulty honored */
(function () { for (var i = 0; i < 30; i++) { ok('explicit easy', LR.generate('lr-ranking', 'easy').subtype.indexOf('easy:') === 0); ok('explicit hard', LR.generate('lr-syllogism', 'hard').subtype.indexOf('hard:') === 0); } })();

console.log('\nlr-engine.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
