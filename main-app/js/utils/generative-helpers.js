/**
 * generative-helpers.js — shared pure utilities for the procedural generators (ADR-083).
 *
 * The DI (di-engine.js) and LR (lr-engine.js) engines each re-implemented the same tiny RNG/number helpers. The Quant
 * Master Overhaul consolidates them here so every generator (and its check harness) draws from ONE tested toolbox:
 * random ints, picking/shuffling, sums, gcd/lcm, clean-number checks, divisor counting, and exam-native name/item pools.
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

  /* Prime factorisation → { prime: exponent }. Small numbers only (aptitude scale). Internal to numFactors. */
  function factorize(n) { n = Math.abs(n); var f = {}; for (var d = 2; d * d <= n; d++) { while (n % d === 0) { f[d] = (f[d] || 0) + 1; n /= d; } } if (n > 1) f[n] = (f[n] || 0) + 1; return f; }
  function numFactors(n) { var f = factorize(n), c = 1; for (var p in f) if (f.hasOwnProperty(p)) c *= (f[p] + 1); return c; }
  function isPrime(n) { if (n < 2) return false; for (var d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; }

  /* ── exam-native vocabulary pools (Indian aptitude context) ── */
  var NAMES = ['Ravi', 'Priya', 'Arjun', 'Meera', 'Kabir', 'Anita', 'Rohan', 'Sneha', 'Vikram', 'Pooja', 'Amit', 'Neha',
    'Raj', 'Divya', 'Karan', 'Isha', 'Manish', 'Rina', 'Sunil', 'Kavya', 'Deepak', 'Nisha', 'Arun', 'Sara'];
  function name() { return pick(NAMES); }
  function twoNames() { return pickN(NAMES, 2); }
  var ITEMS = ['pens', 'books', 'apples', 'chairs', 'bags', 'toys', 'bottles', 'cards', 'boxes', 'tickets', 'mangoes', 'candles'];
  function item() { return pick(ITEMS); }

  var API = {
    randInt: randInt, pick: pick, shuffle: shuffle, pickN: pickN, sample: sample,
    sum: sum, max: maxOf, min: minOf, round1: round1, round2: round2,
    isClean: isClean, isInt: isInt, gcd: gcd, lcm: lcm,
    numFactors: numFactors, isPrime: isPrime,
    NAMES: NAMES, name: name, twoNames: twoNames, ITEMS: ITEMS, item: item
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRGen = API;
  if (typeof root !== 'undefined' && root) root.QRGen = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
