/**
 * lr-engine.js — the generative Logical Reasoning engine (ADR-075, QuantReflex V2 Phase 3).
 *
 * "Speed LR", not generic LR: every topic is PROCEDURALLY GENERATED, produces many variations, rewards fast
 * reasoning, and rides the SAME pipeline as Quant/DI. Like di-engine, it self-registers its generators into
 * questions.js's `categoryGenerators` (so Practice/dedup/difficulty/focus/custom/timed/adaptive all reuse), stays
 * OUT of the random Quant pool (`generators[]`) and OUT of duels (the server never require()s it).
 *
 * Two answer shapes, both graded by the EXISTING drill engine:
 *   - NUMERIC (numpad): coding-sum, direction-distance, ranking, analogies → { question, answer:Number, category, subtype }
 *   - MULTIPLE-CHOICE: blood relations, odd-one-out, syllogisms, coding-cipher, direction-sense → adds
 *     { options:[String], answer:String } (the drill engine renders option buttons when `options` is present, ADR-075).
 *
 * Correctness is by construction and re-verified independently in scripts/lr-engine.check.js. MCQ stems that would
 * otherwise be constant (odd-one-out) embed their data in the QUESTION text so the engine's text-dedup still varies.
 *
 * PURE + dual-exported (window.LREngine / module.exports). Reads `_getDifficulty()` (questions.js global) like the
 * Quant/DI generators.
 */
(function (root) {
  'use strict';

  /* ── helpers ── */
  function _ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _pickN(a, n) { return _shuffle(a).slice(0, n); }
  function _difficulty(explicit) {
    if (explicit) return explicit;
    try { if (typeof _getDifficulty === 'function') return _getDifficulty(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window._getDifficulty === 'function') return window._getDifficulty(); } catch (_) {}
    return 'medium';
  }
  /* Build an MCQ: correct answer + up to n-1 distinct distractors from a pool (all stringified, shuffled). */
  function _mcq(correct, pool, n) {
    n = n || 4;
    var ans = String(correct), opts = [ans];
    var p = _shuffle(pool.map(String));
    for (var i = 0; i < p.length && opts.length < n; i++) { if (opts.indexOf(p[i]) === -1) opts.push(p[i]); }
    return { answer: ans, options: _shuffle(opts) };
  }
  function _isSquare(n) { var r = Math.round(Math.sqrt(n)); return r * r === n; }
  function _isCube(n) { var r = Math.round(Math.cbrt(n)); return r * r * r === n; }
  function _isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  function _special(n) { return _isSquare(n) || _isCube(n) || _isPrime(n); }

  function _wrap(label, qa) { qa.category = label; return qa; }

  /* ───────────────────────── 1. CODING-DECODING ───────────────────────── */
  var WORDS3 = ['CAT', 'DOG', 'SUN', 'BAT', 'CAR', 'PEN', 'BOX', 'CUP', 'FAN', 'JAR', 'KEY', 'MAP', 'RAT', 'BUS', 'EGG', 'ICE', 'OWL', 'TOY', 'BAG', 'HAT'];
  function _pos(ch) { return ch.charCodeAt(0) - 64; }                 // A=1
  function _sumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += _pos(w[i]); return s; }
  function _revSumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += (27 - _pos(w[i])); return s; }
  function _shiftWord(w, k) { var o = ''; for (var i = 0; i < w.length; i++) { var p = (_pos(w[i]) - 1 + k % 26 + 26) % 26; o += String.fromCharCode(65 + p); } return o; }
  function _genCoding(diff) {
    if (diff === 'easy') {
      var w = _pick(WORDS3);
      return { question: 'If each letter scores its position (A=1, B=2, …, Z=26), what is the total score of the word "' + w + '"?', answer: _sumWord(w), subtype: 'easy:sum' };
    }
    if (diff === 'medium') {
      var w2 = _pick(WORDS3);
      return { question: 'In a code, letters are valued in REVERSE (A=26, B=25, …, Z=1). What is the total value of "' + w2 + '"?', answer: _revSumWord(w2), subtype: 'medium:revsum' };
    }
    /* hard: shift cipher (MCQ) */
    var k = _ri(1, 6), pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1];
    var correct = _shiftWord(target, k);
    var distract = [_shiftWord(target, k + 1), _shiftWord(target, (k + 25) % 26 || 25), _shiftWord(target, k + 2), _shiftWord(target.split('').reverse().join(''), k)];
    var m = _mcq(correct, distract, 4);
    return { question: 'In a certain code, "' + ex + '" is written as "' + _shiftWord(ex, k) + '". How is "' + target + '" written in that code?', answer: m.answer, options: m.options, subtype: 'hard:cipher' };
  }

  /* ───────────────────────── 2. BLOOD RELATIONS (MCQ) ───────────────────────── */
  var NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Neha', 'Arjun', 'Kavya', 'Rohan', 'Pooja', 'Karan', 'Divya'];
  var REL_POOL = ['Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Nephew', 'Niece', 'Father', 'Mother', 'Brother', 'Sister'];
  /* r1 of (r2 of C) → answer (r2 only fixes which side, not the answer). Curated, unambiguous compositions. */
  var BLOOD = {
    easy:   [{ r1: 'father', r2up: true, ans: 'Grandfather' }, { r1: 'mother', r2up: true, ans: 'Grandmother' }],
    medium: [{ r1: 'brother', r2up: true, ans: 'Uncle' }, { r1: 'sister', r2up: true, ans: 'Aunt' },
             { r1: 'son', r2down: true, ans: 'Grandson' }, { r1: 'daughter', r2down: true, ans: 'Granddaughter' }],
    hard:   [{ r1: 'son', r2sib: true, ans: 'Nephew' }, { r1: 'daughter', r2sib: true, ans: 'Niece' }]
  };
  function _genBlood(diff) {
    var spec = _pick(BLOOD[diff] || BLOOD.medium);
    var nm = _pickN(NAMES, 3), A = nm[0], B = nm[1], C = nm[2];
    var r2 = spec.r2up ? _pick(['father', 'mother']) : spec.r2down ? _pick(['son', 'daughter']) : _pick(['brother', 'sister']);
    /* A is the r1 of B; B is the r2 of C ⇒ A is the <ans> of C */
    var q = A + ' is the ' + spec.r1 + ' of ' + B + '. ' + B + ' is the ' + r2 + ' of ' + C + '. How is ' + A + ' related to ' + C + '?';
    var m = _mcq(spec.ans, REL_POOL, 4);
    return { question: q, answer: m.answer, options: m.options, subtype: diff + ':' + spec.ans.toLowerCase() };
  }

  /* ───────────────────────── 3. DIRECTION SENSE ───────────────────────── */
  var TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20], [7, 24, 25], [20, 21, 29], [10, 24, 26]];
  var DIR8 = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
  function _genDirection(diff) {
    if (diff === 'hard') {
      /* net displacement → which direction (MCQ). All four legs are non-zero; net is a clean diagonal. */
      var dyPos = _pick([true, false]), dxPos = _pick([true, false]);
      var qv = _ri(1, 4), pv = qv + _pick([2, 3, 4, 5]);          // pv - qv = vertical net magnitude
      var north = dyPos ? pv : qv, south = dyPos ? qv : pv;
      var qh = _ri(1, 4), ph = qh + _pick([2, 3, 4, 5]);
      var east = dxPos ? ph : qh, west = dxPos ? qh : ph;
      var dir = (dyPos ? 'North' : 'South') + '-' + (dxPos ? 'East' : 'West');
      var q = 'A person walks ' + north + ' km North, ' + south + ' km South, ' + east + ' km East and ' + west + ' km West. In which direction is the person now from the starting point?';
      var m = _mcq(dir, DIR8, 4);
      return { question: q, answer: m.answer, options: m.options, subtype: 'hard:direction' };
    }
    var t = _pick(TRIPLES), a = t[0], b = t[1], h = t[2];
    var nWord = _pick(['North', 'South']), eWord = _pick(['East', 'West']);
    if (diff === 'easy') {
      return { question: 'A person walks ' + a + ' km ' + nWord + ', then turns and walks ' + b + ' km ' + eWord + '. How far (in km) is the person from the starting point?', answer: h, subtype: 'easy:distance' };
    }
    /* medium: split the vertical leg into two moves netting `a` */
    var extra = _ri(1, 4), p1 = a + extra, opp = nWord === 'North' ? 'South' : 'North';
    return { question: 'A person walks ' + p1 + ' km ' + nWord + ', then ' + extra + ' km ' + opp + ', then ' + b + ' km ' + eWord + '. How far (in km) is the person from the start?', answer: h, subtype: 'medium:distance' };
  }

  /* ───────────────────────── 4. RANKING & ORDERING (numeric) ───────────────────────── */
  function _genRanking(diff) {
    var nm = _pick(NAMES);
    if (diff === 'easy') {
      var L = _ri(3, 12), R = _ri(3, 12);
      return { question: 'In a row of people, ' + nm + ' is ' + L + 'th from the left and ' + R + 'th from the right. How many people are there in the row?', answer: L + R - 1, subtype: 'easy:total' };
    }
    if (diff === 'medium') {
      if (Math.random() < 0.5) {
        var N = _ri(15, 35), k = _ri(3, 12);
        return { question: 'In a class of ' + N + ' students, ' + nm + ' ranks ' + k + 'th from the top. What is ' + nm + "'s rank from the bottom?", answer: N - k + 1, subtype: 'medium:otherend' };
      }
      var nm2 = _pick(NAMES.filter(function (x) { return x !== nm; })), a = _ri(3, 8), b = _ri(a + 2, 16);
      return { question: 'In a queue, ' + nm + ' is ' + a + 'th from the front and ' + nm2 + ' is ' + b + 'th from the front. How many people stand between them?', answer: b - a - 1, subtype: 'medium:between' };
    }
    /* hard: find N from both ends, then count to one side of another position */
    var Lh = _ri(4, 10), Rh = _ri(4, 10), Nh = Lh + Rh - 1, p = _ri(2, Lh);
    return { question: nm + ' is ' + Lh + 'th from the left and ' + Rh + 'th from the right in a row. How many people are to the RIGHT of the person standing ' + p + 'th from the left?', answer: Nh - p, subtype: 'hard:multistep' };
  }

  /* ───────────────────────── 5. ODD ONE OUT (MCQ) ───────────────────────── */
  function _oddSet(diff) {
    var conformers = [], odd, tries = 0;
    function uniqPush(arr, v) { if (arr.indexOf(v) === -1) arr.push(v); }
    if (diff === 'easy') {                                   // perfect squares
      var sq = _shuffle([4, 9, 16, 25, 36, 49, 64, 81, 100]).slice(0, 3); conformers = sq;
      do { odd = _ri(5, 99); } while (_special(odd) || conformers.indexOf(odd) !== -1);
    } else if (diff === 'medium') {                          // multiples of k OR primes
      if (Math.random() < 0.5) {
        var k = _pick([3, 4, 6, 7, 9]); conformers = [];
        while (conformers.length < 3) { uniqPush(conformers, k * _ri(2, 11)); }
        do { odd = _ri(10, 90); } while (odd % k === 0 || _special(odd) || conformers.indexOf(odd) !== -1);
      } else {
        var primes = _shuffle([7, 11, 13, 17, 19, 23, 29, 31, 37]).slice(0, 3); conformers = primes;
        do { odd = _ri(8, 40); } while (_isPrime(odd) || _isSquare(odd) || _isCube(odd) || conformers.indexOf(odd) !== -1);
      }
    } else {                                                 // cubes
      var cb = _shuffle([8, 27, 64, 125, 216]).slice(0, 3); conformers = cb;
      do { odd = _ri(10, 215); } while (_special(odd) || conformers.indexOf(odd) !== -1);
    }
    return { conformers: conformers, odd: odd };
  }
  function _genOdd(diff) {
    var s = _oddSet(diff), all = _shuffle(s.conformers.concat([s.odd]));
    return { question: 'Which one does NOT belong with the others: ' + all.join(', ') + '?', answer: String(s.odd), options: all.map(String), subtype: diff + ':oddout' };
  }

  /* ───────────────────────── 6. ANALOGIES (numeric) ───────────────────────── */
  function _genAnalogy(diff) {
    var f, name, a, c;
    if (diff === 'easy') {
      if (Math.random() < 0.5) { var k = _ri(2, 5); f = function (n) { return n * k; }; }
      else { var add = _ri(3, 20); f = function (n) { return n + add; }; }
      a = _ri(2, 12); c = _ri(2, 12);
    } else if (diff === 'medium') {
      if (Math.random() < 0.5) { f = function (n) { return n * n; }; a = _ri(3, 15); c = _ri(3, 15); }
      else { f = function (n) { return n * n * n; }; a = _ri(2, 7); c = _ri(2, 7); }
    } else {
      var variants = [function (n) { return n * n + 1; }, function (n) { return n * n - 1; }, function (n) { return n * (n + 1); }, function (n) { return n * n + n; }];
      f = _pick(variants); a = _ri(3, 12); c = _ri(3, 12);
    }
    if (a === c) c = c + 1;
    return { question: a + ' : ' + f(a) + ' :: ' + c + ' : ?', answer: f(c), subtype: diff + ':analogy' };
  }

  /* ───────────────────────── 7. SYLLOGISMS (MCQ) ───────────────────────── */
  var NOUNS = ['cats', 'dogs', 'birds', 'pens', 'books', 'cars', 'trees', 'flowers', 'tables', 'chairs', 'apples', 'mangoes', 'doctors', 'teachers', 'singers', 'players'];
  /* Curated, convention-independent (Boolean-logic) syllogisms. p uses [A,B,C]; conclusion + follows? */
  var SYLLO = {
    easy: [
      { p: ['All A are B', 'All B are C'], c: 'All A are C', f: 'Follows' },
      { p: ['All A are B', 'No B are C'], c: 'No A are C', f: 'Follows' },
      { p: ['No A are B'], c: 'No B are A', f: 'Follows' },
      { p: ['Some A are B'], c: 'Some B are A', f: 'Follows' },
      { p: ['All A are B', 'No C are B'], c: 'No A are C', f: 'Follows' }
    ],
    medium: [
      { p: ['Some A are B', 'Some B are C'], c: 'Some A are C', f: 'Does not follow' },
      { p: ['All A are B', 'Some B are C'], c: 'Some A are C', f: 'Does not follow' },
      { p: ['Some A are B'], c: 'All A are B', f: 'Does not follow' }
    ],
    hard: [
      { p: ['All A are B', 'All C are B'], c: 'All A are C', f: 'Does not follow' },
      { p: ['No A are B', 'No B are C'], c: 'No A are C', f: 'Does not follow' },
      { p: ['Some A are not B'], c: 'Some B are not A', f: 'Does not follow' }
    ]
  };
  function _fill(s, A, B, C) { return s.replace(/\bA\b/g, A).replace(/\bB\b/g, B).replace(/\bC\b/g, C); }
  function _genSyllogism(diff) {
    var spec = _pick(SYLLO[diff] || SYLLO.medium), n = _pickN(NOUNS, 3);
    var prem = spec.p.map(function (s) { return _fill(s, n[0], n[1], n[2]) + '.'; }).join(' ');
    var concl = _fill(spec.c, n[0], n[1], n[2]) + '.';
    return { question: 'Statements: ' + prem + ' Conclusion: ' + concl + ' Does the conclusion logically follow?', answer: spec.f, options: _shuffle(['Follows', 'Does not follow']), subtype: diff + ':syllogism' };
  }

  /* ── dispatch ── */
  var CATEGORY_LABELS = {
    'lr-coding': 'Coding-Decoding', 'lr-blood': 'Blood Relations', 'lr-direction': 'Direction Sense',
    'lr-ranking': 'Ranking & Ordering', 'lr-odd': 'Odd One Out', 'lr-analogy': 'Analogies', 'lr-syllogism': 'Syllogisms'
  };
  var GEN = {
    'lr-coding': _genCoding, 'lr-blood': _genBlood, 'lr-direction': _genDirection,
    'lr-ranking': _genRanking, 'lr-odd': _genOdd, 'lr-analogy': _genAnalogy, 'lr-syllogism': _genSyllogism
  };

  function generate(category, difficulty) {
    var diff = _difficulty(difficulty);
    if (diff !== 'easy' && diff !== 'medium' && diff !== 'hard') diff = 'medium';
    var fn = GEN[category] || _genAnalogy;
    return _wrap(category, fn(diff));
  }

  var generators = {};
  Object.keys(CATEGORY_LABELS).forEach(function (cat) { generators[cat] = function () { return generate(cat); }; });

  /* Register LR into questions.js's dispatch map (browser global). NOT added to the random `generators[]` pool. */
  function registerInto(map) { if (!map) return; Object.keys(generators).forEach(function (k) { map[k] = generators[k]; }); }
  try { if (typeof categoryGenerators !== 'undefined' && categoryGenerators) registerInto(categoryGenerators); } catch (_) {}

  var LREngine = {
    CATEGORY_LABELS: CATEGORY_LABELS,
    categories: function () { return Object.keys(CATEGORY_LABELS); },
    label: function (c) { return CATEGORY_LABELS[c] || c; },
    generate: generate, generators: generators, registerInto: registerInto
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LREngine;
  if (typeof window !== 'undefined') window.LREngine = LREngine;
  else root.LREngine = LREngine;
})(this);
