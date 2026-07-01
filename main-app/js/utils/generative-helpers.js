/**
 * generative-helpers.js — shared pure utilities for the procedural generators (ADR-083).
 *
 * The DI (di-engine.js) and LR (lr-engine.js) engines each re-implemented the same tiny RNG/number helpers. The Quant
 * Master Overhaul consolidates them here so every generator (and its check harness) draws from ONE tested toolbox:
 * random ints, picking/shuffling, sums, gcd/lcm, clean-number checks, factorisation, English pluralisation, exam-native
 * name pools, and MCQ / near-miss distractor builders.
 *
 * PURE — no DOM, no I/O, deterministic given Math.random. Dual-exported: the browser loads it as a <script> (it hangs
 * a `QRGen` global off window) and Node `require()`s it (api/duel.js path + scripts/*.check.js). Nothing here reads
 * settings — difficulty resolution stays in questions.js's _getDifficulty so the server override keeps working.
 */
(function (root) {
  'use strict';

  /* ── RNG + collection helpers ── */
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function pickN(a, n) { return shuffle(a).slice(0, n); }
  function sample(a, n) { return pickN(a, n); }

  /* ── arithmetic helpers ── */
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function maxOf(a) { return Math.max.apply(null, a); }
  function minOf(a) { return Math.min.apply(null, a); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round2(x) { return Math.round(x * 100) / 100; }
  /* "clean" = integer or terminates at one decimal place — the student's natural numpad answer is exact. */
  function isClean(x) { return isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
  function isInt(x) { return isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }
  function lcm(a, b) { if (!a || !b) return 0; return Math.abs(a * b) / gcd(a, b); }
  function gcdArr(a) { return a.reduce(function (g, x) { return gcd(g, x); }, 0); }
  function lcmArr(a) { return a.reduce(function (l, x) { return l ? lcm(l, x) : x; }, 0); }

  /* Prime factorisation → { prime: exponent }. Small numbers only (aptitude scale). */
  function factorize(n) { n = Math.abs(n); var f = {}; for (var d = 2; d * d <= n; d++) { while (n % d === 0) { f[d] = (f[d] || 0) + 1; n /= d; } } if (n > 1) f[n] = (f[n] || 0) + 1; return f; }
  function numFactors(n) { var f = factorize(n), c = 1; for (var p in f) if (f.hasOwnProperty(p)) c *= (f[p] + 1); return c; }
  function isPrime(n) { if (n < 2) return false; for (var d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; }

  /* ── formatting ── */
  function pluralize(w) { if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies'; if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es'; return w + 's'; }
  /* format a fraction in lowest terms as "a/b" (or the integer when it reduces). */
  function frac(num, den) { var g = gcd(num, den) || 1; num /= g; den /= g; if (den < 0) { num = -num; den = -den; } return den === 1 ? String(num) : (num + '/' + den); }
  /* group Indian-style? aptitude answers are plain — keep simple comma grouping for stems only. */
  function commaGroup(x) { var s = String(x), neg = s[0] === '-'; if (neg) s = s.slice(1); var out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return neg ? '-' + out : out; }

  /* ── exam-native vocabulary pools (Indian aptitude context) ── */
  var NAMES = ['Ravi', 'Priya', 'Arjun', 'Meera', 'Kabir', 'Anita', 'Rohan', 'Sneha', 'Vikram', 'Pooja', 'Amit', 'Neha',
    'Raj', 'Divya', 'Karan', 'Isha', 'Manish', 'Rina', 'Sunil', 'Kavya', 'Deepak', 'Nisha', 'Arun', 'Sara'];
  function name() { return pick(NAMES); }
  function twoNames() { return pickN(NAMES, 2); }
  var ITEMS = ['pens', 'books', 'apples', 'chairs', 'bags', 'toys', 'bottles', 'cards', 'boxes', 'tickets', 'mangoes', 'candles'];
  function item() { return pick(ITEMS); }

  /* ── MCQ builder: correct + distinct distractors drawn from a pool, shuffled (mirrors lr-engine._mcq). ── */
  function mcq(correct, pool, n) {
    n = n || 4;
    var ans = String(correct), opts = [ans], p = shuffle(pool.map(String));
    for (var i = 0; i < p.length && opts.length < n; i++) { if (opts.indexOf(p[i]) === -1) opts.push(p[i]); }
    return { answer: ans, options: shuffle(opts) };
  }

  /* Near-miss numeric distractors that mimic REAL mistakes (off-by-operation, sign, factor) rather than random noise,
     so the wrong options are tempting. kind hints the common trap; falls back to ± spread. Returns clean numbers. */
  function nearMissDistractors(ans, extras) {
    var out = [];
    (extras || []).forEach(function (e) { if (isClean(e) && e !== ans && out.indexOf(e) === -1) out.push(e); });
    var spread = [ans + 1, ans - 1, ans + 2, ans - 2, Math.round(ans * 1.1), Math.round(ans * 0.9), ans + 10, ans - 10];
    for (var i = 0; i < spread.length && out.length < 6; i++) { var v = spread[i]; if (isClean(v) && v >= 0 && v !== ans && out.indexOf(v) === -1) out.push(v); }
    return out;
  }

  var API = {
    randInt: randInt, pick: pick, shuffle: shuffle, pickN: pickN, sample: sample,
    sum: sum, max: maxOf, min: minOf, round1: round1, round2: round2,
    isClean: isClean, isInt: isInt, gcd: gcd, lcm: lcm, gcdArr: gcdArr, lcmArr: lcmArr,
    factorize: factorize, numFactors: numFactors, isPrime: isPrime,
    pluralize: pluralize, frac: frac, commaGroup: commaGroup,
    NAMES: NAMES, name: name, twoNames: twoNames, ITEMS: ITEMS, item: item,
    mcq: mcq, nearMissDistractors: nearMissDistractors
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRGen = API;
  if (typeof root !== 'undefined' && root) root.QRGen = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
