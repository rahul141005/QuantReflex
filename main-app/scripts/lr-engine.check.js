/**
 * lr-engine.check.js — validates the Logical Reasoning engine (ADR-075; deepened in ADR-079).
 *
 * Correctness is the whole game for LR (a wrong key teaches wrong reasoning). This harness generates a large sample
 * of every category × difficulty and INDEPENDENTLY re-derives each answer (no shared code with the engine):
 *   - numeric topics (coding sum/revsum, direction distance, ranking incl. interchange, numeric analogy) → recomputed;
 *   - coding ciphers (shift / position-shift / reverse-shift) → re-derive the rule from the example, re-encode target;
 *   - blood relations → re-compose the kinship from the two stated links via an independently-authored algebra;
 *   - coded blood → evaluate the symbol expression via the same independent algebra;
 *   - direction sense (MCQ) → re-compute net displacement → compass direction; turns → simulate the rotations;
 *   - odd-one-out → numeric: confirm EXACTLY ONE element breaks a real rule; letter: confirm exactly one gap differs;
 *   - letter analogy → re-derive the constant shift and re-apply;
 *   - syllogisms → an independent set-logic MODEL CHECKER over 3–4 terms (2^(2^k) region-subset enumeration).
 * Wired into `npm test`.   node scripts/lr-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var LR = require(p('js/lr-engine'));

var pass = 0, fail = 0, shown = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shown <= 16) console.error('  ✗ ' + label); } }

/* ── independent re-implementations ── */
function pos(ch) { return ch.charCodeAt(0) - 64; }
function lett(n) { return String.fromCharCode(64 + n); }
function sumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += pos(w[i]); return s; }
function revSumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += (27 - pos(w[i])); return s; }
function shiftWord(w, k) { var o = ''; for (var i = 0; i < w.length; i++) o += String.fromCharCode(65 + ((pos(w[i]) - 1 + (k % 26) + 26) % 26)); return o; }
function posShiftWord(w) { var o = ''; for (var i = 0; i < w.length; i++) o += String.fromCharCode(65 + ((pos(w[i]) - 1 + (i + 1)) % 26)); return o; }
function numCode(w) { var a = []; for (var i = 0; i < w.length; i++) a.push(pos(w[i])); return a.join('-'); }
function rev(w) { return w.split('').reverse().join(''); }
function isSquare(n) { var r = Math.round(Math.sqrt(n)); return r * r === n; }
function isCube(n) { var r = Math.round(Math.cbrt(n)); return r * r * r === n; }
function isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/* kinship algebra — independently authored (must agree with the engine's _compose2) */
var KPRIM = { father: 'up M', mother: 'up F', son: 'down M', daughter: 'down F', brother: 'sib M', sister: 'sib F' };
function compose2(r1, r2) {
  var a = KPRIM[r1], b = KPRIM[r2]; if (!a || !b) return null;
  var at = a.split(' ')[0], ag = a.split(' ')[1], bt = b.split(' ')[0], m = ag === 'M';
  var map = { 'up-up': ['Grandfather', 'Grandmother'], 'up-sib': ['Father', 'Mother'], 'sib-up': ['Uncle', 'Aunt'], 'sib-down': ['Son', 'Daughter'], 'down-down': ['Grandson', 'Granddaughter'], 'down-sib': ['Nephew', 'Niece'], 'sib-sib': ['Brother', 'Sister'], 'down-up': ['Brother', 'Sister'] };
  var c = at + '-' + bt; return map[c] ? (m ? map[c][0] : map[c][1]) : null;
}
var CODE_MAP = { '+': 'father', '-': 'mother', '*': 'son', '/': 'daughter', '>': 'brother', '<': 'sister' };

/* turns: simulate cardinal rotations */
var CARD = ['North', 'East', 'South', 'West'];
function simulateTurns(start, acts) { var i = CARD.indexOf(start); acts.forEach(function (a) { i = (i + (a === 'right' ? 1 : a === 'left' ? 3 : 2)) % 4; }); return CARD[i]; }

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

/* odd-one-out (numeric): independently confirm EXACTLY ONE element is a defensible odd-one, and it's the answer. */
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

/* syllogism validity — general over k distinct terms (k = 3 or 4): enumerate every region-subset model. */
function syllValid(premises, conclusion) {
  var labels = [];
  function idx(l) { var i = labels.indexOf(l); if (i < 0) { i = labels.length; labels.push(l); } return i; }
  premises.forEach(function (s) { s.xi = idx(s.x); s.yi = idx(s.y); });
  conclusion.xi = idx(conclusion.x); conclusion.yi = idx(conclusion.y);
  var k = labels.length, R = 1 << k;
  function inSet(r, ti) { return (r >> ti) & 1; }
  function holds(st, model) {
    var X = st.xi, Y = st.yi, r;
    if (st.q === 'All') { for (r = 0; r < R; r++) if (model[r] && inSet(r, X) && !inSet(r, Y)) return false; return true; }
    if (st.q === 'No') { for (r = 0; r < R; r++) if (model[r] && inSet(r, X) && inSet(r, Y)) return false; return true; }
    if (st.q === 'Some') { for (r = 0; r < R; r++) if (model[r] && inSet(r, X) && inSet(r, Y)) return true; return false; }
    for (r = 0; r < R; r++) if (model[r] && inSet(r, X) && !inSet(r, Y)) return true; return false; // Some-not
  }
  var total = 1 << R;
  for (var mask = 1; mask < total; mask++) {
    var model = []; for (var r = 0; r < R; r++) model[r] = !!((mask >> r) & 1);
    var sat = true; for (var pi = 0; pi < premises.length; pi++) { if (!holds(premises[pi], model)) { sat = false; break; } }
    if (!sat) continue;
    if (!holds(conclusion, model)) return 'Does not follow';
  }
  return 'Follows';
}
function parseStmt(s) {
  var m = s.match(/^(All|No|Some) (\w+) are (not )?(\w+)$/);
  if (!m) return null;
  return { q: m[3] ? 'Some-not' : m[1], x: m[2], y: m[4] };
}

/* ── independent re-derivations for the ADR-079 generatable topics ── */
var WDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dowDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); } // independent of Zeller
var IL = { '@': '>', '#': '≥', '&': '<', '%': '≤', '$': '=' };
function ineqDerive(ops) { var hasGt = false, hasLt = false, sGt = false, sLt = false, allEq = true; ops.forEach(function (o) { if (o !== '=') allEq = false; if (o === '>') { hasGt = true; sGt = true; } else if (o === '≥') hasGt = true; else if (o === '<') { hasLt = true; sLt = true; } else if (o === '≤') hasLt = true; }); if (hasGt && hasLt) return '?'; if (allEq) return '='; if (hasGt) return sGt ? '>' : '≥'; if (hasLt) return sLt ? '<' : '≤'; return '='; }
function ineqHolds(c, b) { switch (c) { case '>': return b === '>'; case '≥': return b === '>' || b === '='; case '=': return b === '='; case '≤': return b === '<' || b === '='; case '<': return b === '<'; } return false; }
function ineqPermits(D) { if (D === '>') return ['>']; if (D === '≥') return ['>', '=']; if (D === '=') return ['=']; if (D === '≤') return ['<', '=']; if (D === '<') return ['<']; return ['>', '=', '<']; }
function ineqDef(c, D) { return ineqPermits(D).every(function (b) { return ineqHolds(c, b); }); }
function ineqVerdict(r1, r2, D) { var a = ineqDef(r1, D), b = ineqDef(r2, D); if (a && b) return 'Both I and II are true'; if (a) return 'Only I is true'; if (b) return 'Only II is true'; if (ineqPermits(D).every(function (x) { return ineqHolds(r1, x) || ineqHolds(r2, x); })) return 'Either I or II is true'; return 'Neither I nor II is true'; }
function ioStep(arr, s) { var a = arr.slice(); for (var i = 0; i < s; i++) { var mi = i; for (var j = i + 1; j < a.length; j++) if (a[j] < a[mi]) mi = j; var t = a[i]; a[i] = a[mi]; a[mi] = t; } return a; }

console.log('lr-engine.check — Logical Reasoning generator (ADR-075 / ADR-079)');

ok('0 twelve LR categories', LR.categories().length === 12 && LR.categories().indexOf('lr-syllogism') !== -1 && LR.categories().indexOf('lr-inequality') !== -1);

(function () {
  var cats = LR.categories(), diffs = ['easy', 'medium', 'hard'], total = 0, recomputed = 0;
  cats.forEach(function (cat) {
    diffs.forEach(function (diff) {
      for (var n = 0; n < 150; n++) {
        var q = LR.generate(cat, diff); total++;
        ok('struct ' + cat + ' category', q.category === cat);
        ok('struct ' + cat + ' subtype tier', q.subtype.indexOf(diff + ':') === 0 || (cat === 'lr-blood' && diff === 'hard' && q.subtype === 'hard:coded'));
        var isMCQ = !!(q.options && q.options.length);
        if (isMCQ) {
          ok('mcq ' + cat + ' answer in options', q.options.indexOf(String(q.answer)) !== -1);
          ok('mcq ' + cat + ' options distinct', new Set(q.options).size === q.options.length);
          ok('mcq ' + cat + ' >=2 options', q.options.length >= 2);
        } else {
          ok('num ' + cat + ' numeric+finite+int', typeof q.answer === 'number' && isFinite(q.answer) && q.answer % 1 === 0);
        }
        /* ── independent recompute per subtype ── */
        var key = q.subtype.split(':')[1], t = q.question, e = null, did = true, mm;
        if (key === 'sum') { e = sumWord(t.match(/"([A-Z]+)"/)[1]); }
        else if (key === 'numcode') { e = numCode(t.match(/"([A-Z]+)"/)[1]); }
        else if (key === 'revsum') { e = revSumWord(t.match(/"([A-Z]+)"/)[1]); }
        else if (key === 'cipher') { mm = t.match(/"([A-Z]+)" is written as "([A-Z]+)"\. How is "([A-Z]+)"/); var k1 = (pos(mm[2][0]) - pos(mm[1][0]) + 26) % 26; e = shiftWord(mm[3], k1); }
        else if (key === 'posshift') { mm = t.match(/Following the same rule, how is "([A-Z]+)"/); e = posShiftWord(mm[1]); }
        else if (key === 'revshift') { mm = t.match(/"([A-Z]+)" is written as "([A-Z]+)" \(the word is reversed[\s\S]*?How is "([A-Z]+)"/); var ex = mm[1], enc = mm[2], tgt = mm[3]; var k2 = (pos(enc[0]) - pos(ex[ex.length - 1]) + 26) % 26; e = shiftWord(rev(tgt), k2); }
        else if (key === 'distance') { var ds = t.match(/(\d+) km/g).map(function (x) { return parseInt(x, 10); }); var vy, hx; if (ds.length === 2) { vy = ds[0]; hx = ds[1]; } else { vy = ds[0] - ds[1]; hx = ds[2]; } e = Math.round(Math.sqrt(vy * vy + hx * hx)); }
        else if (key === 'direction') { var nz = t.match(/(\d+) km North/), sz = t.match(/(\d+) km South/), ez = t.match(/(\d+) km East/), wz = t.match(/(\d+) km West/); var ny = (+nz[1]) - (+sz[1]), ex2 = (+ez[1]) - (+wz[1]); e = (ny > 0 ? 'North' : 'South') + '-' + (ex2 > 0 ? 'East' : 'West'); }
        else if (key === 'turns') { var st = t.match(/is facing (North|East|South|West)/)[1]; var acts = [], re = /turns (left|right|around)/g, am; while ((am = re.exec(t))) acts.push(am[1] === 'around' ? 'about' : am[1]); e = simulateTurns(st, acts); }
        else if (key === 'total') { var lr = t.match(/(\d+)\w\w from the left and (\d+)\w\w from the right/); e = (+lr[1]) + (+lr[2]) - 1; }
        else if (key === 'otherend') { var oe = t.match(/class of (\d+) students, \w+ ranks (\d+)\w\w/); e = (+oe[1]) - (+oe[2]) + 1; }
        else if (key === 'between') { var bt = t.match(/(\d+)\w\w from the front and \w+ is (\d+)\w\w from the front/); e = (+bt[2]) - (+bt[1]) - 1; }
        else if (key === 'multistep') { var ms = t.match(/(\d+)\w\w from the left and (\d+)\w\w from the right.*?(\d+)\w\w from the left\?/); e = ((+ms[1]) + (+ms[2]) - 1) - (+ms[3]); }
        else if (key === 'interchange') { var bR = t.match(/(\d+)\w\w from the right/)[1], nAL = t.match(/position (\d+) counting from the left/)[1]; e = (+nAL) + (+bR) - 1; }
        else if (key === 'analogy') { var an = t.match(/(\d+) : (\d+) :: (\d+) :/); ok('analogy ' + cat + ' consistent rule', analogyConsistent(+an[1], +an[2], +an[3], q.answer)); did = false; }
        else if (key === 'letter') { var ln = t.match(/([A-Z]{2}) : ([A-Z]{2}) :: ([A-Z]{2}) :/); var sh = (pos(ln[2][0]) - pos(ln[1][0]) + 26) % 26; e = lett(((pos(ln[3][0]) - 1 + sh) % 26) + 1) + lett(((pos(ln[3][1]) - 1 + sh) % 26) + 1); }
        else if (key === 'verbal') { ok('verbal analogy structural', q.options.indexOf(String(q.answer)) !== -1 && q.options.length === 4); did = false; }
        else if (key === 'blood') { var br = t.match(/is the (\w+) of \w+\. \w+ is the (\w+) of/); e = compose2(br[1], br[2]); }
        else if (key === 'coded') { var ce = t.match(/in the expression "([A-Z]) (\S+) ([A-Z]) (\S+) ([A-Z])"/); e = compose2(CODE_MAP[ce[2]], CODE_MAP[ce[4]]); }
        else if (key === 'oddout') { ok('oddout has a UNIQUE odd one (no second valid answer)', oddUnique(q.options, q.answer)); did = false; }
        else if (key === 'oddletter') {
          var listM = t.match(/ODD one out: (.*)\?/), pairs = listM[1].split(', ');
          var gaps = pairs.map(function (pp) { return pos(pp[1]) - pos(pp[0]); }), cnt = {};
          gaps.forEach(function (g) { cnt[g] = (cnt[g] || 0) + 1; });
          var oddCnt = 0, oddPair = null; pairs.forEach(function (pp, i) { if (cnt[gaps[i]] === 1) { oddCnt++; oddPair = pp; } });
          ok('oddletter unique odd pair', oddCnt === 1 && oddPair === String(q.answer)); did = false;
        }
        else if (key === 'oddword') { ok('oddword structural', q.options.indexOf(String(q.answer)) !== -1 && q.options.length === 4); did = false; }
        else if (key === 'letterstep') { var L = t.match(/series:\s+(.*), \?/)[1].split(', '); e = lett(pos(L[L.length - 1]) + (pos(L[1]) - pos(L[0]))); }
        else if (key === 'alphanum') { var L2 = t.match(/series:\s+(.*), \?/)[1].split(', '); function _pt(x) { var z = x.match(/^([A-Z])(\d+)$/); return { l: pos(z[1]), n: +z[2] }; } var p0 = _pt(L2[0]), p1 = _pt(L2[1]), pl = _pt(L2[L2.length - 1]); e = lett(pl.l + (p1.l - p0.l)) + (pl.n + (p1.n - p0.n)); }
        else if (key === 'interleave') { var L3 = t.match(/series:\s+(.*), \?/)[1].split(', '); var cc = pos(L3[1]) - pos(L3[3]); e = lett(pos(L3[1]) - 2 * cc); }
        else if (key === 'ineq') { var sm = t.match(/Statements: (.+?)\.\nConclusions/); var toks = sm[1].split(' '), vrs = [], ops = []; for (var ti = 0; ti < toks.length; ti++) { if (ti % 2 === 0) vrs.push(toks[ti]); else ops.push(IL[toks[ti]]); } var cm = t.match(/I\. (\w) (\S+) (\w)\s+II\. (\w) (\S+) (\w)/); var D = ineqDerive(ops.slice(vrs.indexOf(cm[1]), vrs.indexOf(cm[3]))); e = ineqVerdict(cm[2], cm[5], D); }
        else if (key === 'dayafter') { var sd = t.match(/today is (\w+), what day .* after (\d+) days/); e = WDAYS[(WDAYS.indexOf(sd[1]) + (+sd[2])) % 7]; }
        else if (key === 'datediff') { var yy = +t.match(/In the year (\d+)/)[1], dm = t.match(/What day of the week is (\d+) (\w+) in the same year/); e = WDAYS[dowDate(yy, MON.indexOf(dm[2]) + 1, +dm[1])]; }
        else if (key === 'dow') { var hd = t.match(/was (\d+) (\w+), (\d+)\?/); e = WDAYS[dowDate(+hd[3], MON.indexOf(hd[2]) + 1, +hd[1])]; }
        else if (key === 'angle0') { e = (function () { var h = +t.match(/at (\d+):00/)[1]; return Math.min(30 * h, 360 - 30 * h); })(); }
        else if (key === 'angle') { var hm = t.match(/at (\d+):(\d+)\?/), raw = Math.abs(30 * (+hm[1]) - 5.5 * (+hm[2])); e = Math.min(raw, 360 - raw); }
        else if (key === 'mirror') { var c2 = t.match(/clock shows (\d+):(\d+)\./), mir = 720 - (60 * (+c2[1]) + (+c2[2])), mh = Math.floor(mir / 60), ml = mir % 60; if (mh === 0) mh = 12; e = mh + ':' + (ml < 10 ? '0' + ml : ml); }
        else if (key === 'io') { var im = t.match(/Input line: (.+?)\. Which number is in the (\d+)\w\w position from the left after Step (\d+)/); e = ioStep(im[1].split(', ').map(Number), +im[3])[(+im[2]) - 1]; }
        else if (key === 'syllogism') {
          var seg = t.match(/Statements: (.*) Conclusion: (.*) Does/);
          var prem = seg[1].split('. ').filter(Boolean).map(function (s) { return parseStmt(s.replace(/\.$/, '')); });
          var conc = parseStmt(seg[2].replace(/\.$/, ''));
          if (prem.every(Boolean) && conc) {
            ok('syllogism ' + q.subtype + ' matches model-checker', syllValid(prem, conc) === q.answer);
          } else { ok('syllogism parseable', false); }
          did = false;
        } else { did = false; }
        if (did && e != null) { recomputed++; ok('recompute ' + cat + '/' + key, String(e) === String(q.answer)); }
      }
    });
  });
  console.log('  (samples: ' + total + '; answers independently recomputed: ' + recomputed + ')');
  ok('a healthy share of answers were recomputed', recomputed > 1200);
})();

/* explicit difficulty honored */
(function () { for (var i = 0; i < 30; i++) { ok('explicit easy', LR.generate('lr-ranking', 'easy').subtype.indexOf('easy:') === 0); ok('explicit hard', LR.generate('lr-syllogism', 'hard').subtype.indexOf('hard:') === 0); } })();

console.log('\nlr-engine.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
