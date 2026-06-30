/**
 * lr-engine.js — the generative Logical Reasoning engine (ADR-075; deepened in ADR-079).
 *
 * "Speed LR", not generic LR: every topic here is PROCEDURALLY GENERATED, produces many variations, rewards fast
 * reasoning, and rides the SAME pipeline as Quant/DI. Like di-engine, it self-registers its generators into
 * questions.js's `categoryGenerators` (so Practice/dedup/difficulty/focus/custom/timed/adaptive all reuse), stays
 * OUT of the random Quant pool (`generators[]`) and OUT of duels (the server never require()s it).
 *
 * EARNED DIFFICULTY (ADR-079): each topic exposes per-tier ARCHETYPE POOLS — a tier picks among archetypes that are
 * genuinely of that tier, so difficulty comes from REASONING DEPTH (more links, collateral relations, coded forms),
 * never from longer reading or trickier wording. This mirrors DI's earned-difficulty model.
 *
 * Two answer shapes, both graded by the EXISTING drill engine:
 *   - NUMERIC (numpad): coding-sum, direction-distance, ranking, numeric analogies → { question, answer:Number, … }
 *   - MULTIPLE-CHOICE: blood, odd-one-out, syllogisms, ciphers, direction-sense, letter/verbal analogy, turns →
 *     adds { options:[String], answer:String } (the drill engine renders option buttons when `options` is present).
 *
 * Correctness is by construction and re-verified INDEPENDENTLY in scripts/lr-engine.check.js (numeric recompute,
 * kinship re-composition, turn simulation, odd-one-out uniqueness, a 256-region syllogism model-checker). MCQ stems
 * that would otherwise be constant embed their data in the QUESTION text so the engine's text-dedup still varies.
 *
 * PURE + dual-exported (window.LREngine / module.exports). Reads `_getDifficulty()` (questions.js global).
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
  /* pick one builder from a tier's pool (earned difficulty) */
  function _tier(diff, pools) { var pool = pools[diff] || pools.medium; return _pick(pool)(); }
  function _isSquare(n) { var r = Math.round(Math.sqrt(n)); return r * r === n; }
  function _isCube(n) { var r = Math.round(Math.cbrt(n)); return r * r * r === n; }
  function _isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  function _special(n) { return _isSquare(n) || _isCube(n) || _isPrime(n); }
  function _gcd(a, b) { return b ? _gcd(b, a % b) : a; }

  /* Is `c` a DEFENSIBLE "odd one" within `all` — do the OTHER three share a common rule that c breaks?
     (square / cube / prime / parity / multiple-of-k / common-factor). Guarantees EXACTLY ONE valid answer. */
  function _validOddOne(all, c) {
    var others = all.filter(function (x) { return x !== c; });
    if (others.length !== 3) return false;
    if (others.every(_isSquare) && !_isSquare(c)) return true;
    if (others.every(_isCube) && !_isCube(c)) return true;
    if (others.every(_isPrime) && !_isPrime(c)) return true;
    if (others.every(function (x) { return x % 2 === 0; }) && c % 2 !== 0) return true;   // all even, c odd
    if (others.every(function (x) { return x % 2 !== 0; }) && c % 2 === 0) return true;   // all odd, c even
    for (var k = 2; k <= 9; k++) { if (others.every(function (x) { return x % k === 0; }) && c % k !== 0) return true; }
    var g = others.reduce(function (a, b) { return _gcd(a, b); }); if (g >= 2 && c % g !== 0) return true;
    return false;
  }
  function _oddUnambiguous(all, answer) {
    var valid = all.filter(function (c) { return _validOddOne(all, c); });
    return valid.length === 1 && String(valid[0]) === String(answer);
  }

  /* ordinal suffix: 1→1st, 2→2nd, 3→3rd, 11/12/13→th, else th — so stems read like faculty wrote them */
  function _ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function _wrap(label, qa) { qa.category = label; return qa; }

  /* ───────────────────────── 1. CODING-DECODING ───────────────────────── */
  var WORDS3 = ['CAT', 'DOG', 'SUN', 'BAT', 'CAR', 'PEN', 'BOX', 'CUP', 'FAN', 'JAR', 'KEY', 'MAP', 'RAT', 'BUS', 'EGG', 'ICE', 'OWL', 'TOY', 'BAG', 'HAT'];
  function _pos(ch) { return ch.charCodeAt(0) - 64; }                 // A=1
  function _let(n) { return String.fromCharCode(64 + n); }            // 1=A
  function _sumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += _pos(w[i]); return s; }
  function _revSumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += (27 - _pos(w[i])); return s; }
  function _shiftWord(w, k) { var o = ''; for (var i = 0; i < w.length; i++) { var p = (_pos(w[i]) - 1 + k % 26 + 26) % 26; o += String.fromCharCode(65 + p); } return o; }
  function _posShiftWord(w) { var o = ''; for (var i = 0; i < w.length; i++) { var p = (_pos(w[i]) - 1 + (i + 1)) % 26; o += String.fromCharCode(65 + p); } return o; }
  function _numCode(w) { var a = []; for (var i = 0; i < w.length; i++) a.push(_pos(w[i])); return a.join('-'); }
  function _genCoding(diff) {
    return _tier(diff, {
      easy: [
        function () { var w = _pick(WORDS3); return { question: 'If each letter scores its position (A=1, B=2, …, Z=26), what is the total score of the word "' + w + '"?', answer: _sumWord(w), subtype: 'easy:sum' }; },
        function () { var w = _pick(WORDS3); var correct = _numCode(w); var d = [_numCode(_shiftWord(w, 1)), _shiftWord(w, 2).split('').map(_pos).reverse().join('-'), w.split('').map(function (c) { return _pos(c) + 1; }).join('-'), w.split('').map(_pos).reverse().join('-')]; var m = _mcq(correct, d, 4); return { question: 'Each letter is written as its position number (A=1, B=2, …, Z=26). Which is the correct code for "' + w + '"?', answer: m.answer, options: m.options, subtype: 'easy:numcode' }; }
      ],
      medium: [
        function () { var w = _pick(WORDS3); return { question: 'In a code, letters are valued in REVERSE (A=26, B=25, …, Z=1). What is the total value of "' + w + '"?', answer: _revSumWord(w), subtype: 'medium:revsum' }; },
        function () { var k = _ri(1, 6), pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1]; var correct = _shiftWord(target, k); var distract = [_shiftWord(target, k + 1), _shiftWord(target, (k + 25) % 26 || 25), _shiftWord(target, k + 2), _shiftWord(target.split('').reverse().join(''), k)]; var m = _mcq(correct, distract, 4); return { question: 'In a certain code, "' + ex + '" is written as "' + _shiftWord(ex, k) + '". How is "' + target + '" written in that code?', answer: m.answer, options: m.options, subtype: 'medium:cipher' }; }
      ],
      hard: [
        /* position-shift cipher: the i-th letter moves forward by i (1st +1, 2nd +2, …) — inferred from one example */
        function () { var pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1]; var correct = _posShiftWord(target); var distract = [_shiftWord(target, 1), _shiftWord(target, 2), _posShiftWord(target.split('').reverse().join('')), _shiftWord(target, 3)]; var m = _mcq(correct, distract, 4); return { question: 'In a certain code, "' + ex + '" is written as "' + _posShiftWord(ex) + '". Following the same rule, how is "' + target + '" written?', answer: m.answer, options: m.options, subtype: 'hard:posshift' }; },
        /* reverse-then-shift: reverse the word, then shift every letter by k */
        function () { var k = _ri(1, 5), pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1]; function rs(w) { return _shiftWord(w.split('').reverse().join(''), k); } var correct = rs(target); var distract = [_shiftWord(target, k), rs(target).split('').reverse().join(''), _shiftWord(target.split('').reverse().join(''), k + 1), _posShiftWord(target)]; var m = _mcq(correct, distract, 4); return { question: 'In a certain code, "' + ex + '" is written as "' + rs(ex) + '" (the word is reversed, then each letter shifted by the same number). How is "' + target + '" written?', answer: m.answer, options: m.options, subtype: 'hard:revshift' }; }
      ]
    });
  }

  /* ───────────────────────── 2. BLOOD RELATIONS (MCQ) — generative kinship via verified composition ───────────── */
  var NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Neha', 'Arjun', 'Kavya', 'Rohan', 'Pooja', 'Karan', 'Divya'];
  var REL_POOL = ['Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Nephew', 'Niece', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Cousin'];
  /* atomic relation primitives: t = lineage step (up=parent, down=child, sib=sibling), g = gender of the SUBJECT */
  var PRIM = {
    father: { t: 'up', g: 'M' }, mother: { t: 'up', g: 'F' },
    son: { t: 'down', g: 'M' }, daughter: { t: 'down', g: 'F' },
    brother: { t: 'sib', g: 'M' }, sister: { t: 'sib', g: 'F' }
  };
  /* "A is r1 of B; B is r2 of C" ⇒ A is _compose2(r1,r2) of C. Returns null for the spouse-producing combo
     (up-down), which is never generated — keeping every answer unambiguous and blood-only. */
  function _compose2(r1, r2) {
    var a = PRIM[r1], b = PRIM[r2]; if (!a || !b) return null;
    var combo = a.t + '-' + b.t, m = a.g === 'M';
    switch (combo) {
      case 'up-up': return m ? 'Grandfather' : 'Grandmother';
      case 'up-sib': return m ? 'Father' : 'Mother';
      case 'sib-up': return m ? 'Uncle' : 'Aunt';
      case 'sib-down': return m ? 'Son' : 'Daughter';
      case 'down-down': return m ? 'Grandson' : 'Granddaughter';
      case 'down-sib': return m ? 'Nephew' : 'Niece';
      case 'sib-sib': return m ? 'Brother' : 'Sister';
      case 'down-up': return m ? 'Brother' : 'Sister';
      default: return null; // up-down (spouse) — excluded
    }
  }
  var BLOOD_COMBOS = {
    easy: ['up-up', 'sib-sib', 'down-down'],
    medium: ['up-sib', 'down-up', 'sib-down'],
    hard: ['sib-up', 'down-sib']
  };
  var BY_TYPE = { up: ['father', 'mother'], down: ['son', 'daughter'], sib: ['brother', 'sister'] };
  function _chainBlood(diff) {
    var combo = _pick(BLOOD_COMBOS[diff] || BLOOD_COMBOS.medium), parts = combo.split('-');
    var r1 = _pick(BY_TYPE[parts[0]]), r2 = _pick(BY_TYPE[parts[1]]);
    var ans = _compose2(r1, r2);
    var nm = _pickN(NAMES, 3), A = nm[0], B = nm[1], C = nm[2];
    var q = A + ' is the ' + r1 + ' of ' + B + '. ' + B + ' is the ' + r2 + ' of ' + C + '. How is ' + A + ' related to ' + C + '?';
    var m = _mcq(ans, REL_POOL, 4);
    return { question: q, answer: m.answer, options: m.options, subtype: diff + ':blood' };
  }
  /* coded blood relations (Banking-VH): a fixed symbol legend; evaluate a 2-operator expression P op Q op R. */
  var CODE_OPS = [
    { s: '+', r: 'father' }, { s: '-', r: 'mother' }, { s: '*', r: 'son' },
    { s: '/', r: 'daughter' }, { s: '>', r: 'brother' }, { s: '<', r: 'sister' }
  ];
  function _opByRel(r) { for (var i = 0; i < CODE_OPS.length; i++) if (CODE_OPS[i].r === r) return CODE_OPS[i].s; return '+'; }
  function _codedBlood(diff) {
    var combo = _pick(['up-sib', 'sib-up', 'down-sib', 'sib-down', 'up-up', 'down-down', 'down-up', 'sib-sib']);
    var parts = combo.split('-'), r1 = _pick(BY_TYPE[parts[0]]), r2 = _pick(BY_TYPE[parts[1]]);
    var ans = _compose2(r1, r2);
    var nm = _pickN(['P', 'Q', 'R', 'M', 'N', 'T'], 3), P = nm[0], Q = nm[1], R = nm[2];
    var legend = CODE_OPS.map(function (o) { return "'" + o.s + "' = " + o.r; }).join(', ');
    var expr = P + ' ' + _opByRel(r1) + ' ' + Q + ' ' + _opByRel(r2) + ' ' + R;
    var q = 'If, between two people, ' + legend + ' (read left-to-right, e.g. "X ' + _opByRel(r1) + ' Y" means X is the ' + r1 + ' of Y), then in the expression "' + expr + '", how is ' + P + ' related to ' + R + '?';
    var m = _mcq(ans, REL_POOL, 4);
    return { question: q, answer: m.answer, options: m.options, subtype: 'hard:coded' };
  }
  function _genBlood(diff) {
    if (diff === 'hard') return Math.random() < 0.5 ? _codedBlood(diff) : _chainBlood(diff);
    return _chainBlood(diff);
  }

  /* ───────────────────────── 3. DIRECTION SENSE ───────────────────────── */
  var TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20], [7, 24, 25], [20, 21, 29], [10, 24, 26]];
  var DIR8 = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
  var DIR4 = ['North', 'East', 'South', 'West']; // clockwise
  function _genDirection(diff) {
    return _tier(diff, {
      easy: [
        function () { var t = _pick(TRIPLES), a = t[0], b = t[1], h = t[2]; var nWord = _pick(['North', 'South']), eWord = _pick(['East', 'West']); return { question: 'A person walks ' + a + ' km ' + nWord + ', then turns and walks ' + b + ' km ' + eWord + '. How far (in km) is the person from the starting point?', answer: h, subtype: 'easy:distance' }; }
      ],
      medium: [
        function () { var t = _pick(TRIPLES), a = t[0], b = t[1], h = t[2]; var nWord = _pick(['North', 'South']), eWord = _pick(['East', 'West']); var extra = _ri(1, 4), p1 = a + extra, opp = nWord === 'North' ? 'South' : 'North'; return { question: 'A person walks ' + p1 + ' km ' + nWord + ', then ' + extra + ' km ' + opp + ', then ' + b + ' km ' + eWord + '. How far (in km) is the person from the start?', answer: h, subtype: 'medium:distance' }; },
        /* turn simulation → final facing (MCQ over the 4 cardinals) */
        function () { var start = _pick(DIR4), turns = []; var n = _ri(2, 4); for (var i = 0; i < n; i++) turns.push(_pick(['left', 'right', 'right', 'left', 'about'])); var idx = DIR4.indexOf(start); turns.forEach(function (tn) { idx = (idx + (tn === 'right' ? 1 : tn === 'left' ? 3 : 2)) % 4; }); var face = DIR4[idx]; var seq = turns.map(function (tn) { return tn === 'about' ? 'turns around (180°)' : 'turns ' + tn; }).join(', then '); var m = _mcq(face, DIR4, 4); return { question: 'A person is facing ' + start + '. The person ' + seq + '. Which direction is the person facing now?', answer: m.answer, options: m.options, subtype: 'medium:turns' }; }
      ],
      hard: [
        /* net displacement → which diagonal direction (MCQ) */
        function () { var dyPos = _pick([true, false]), dxPos = _pick([true, false]); var qv = _ri(1, 4), pv = qv + _pick([2, 3, 4, 5]); var north = dyPos ? pv : qv, south = dyPos ? qv : pv; var qh = _ri(1, 4), ph = qh + _pick([2, 3, 4, 5]); var east = dxPos ? ph : qh, west = dxPos ? qh : ph; var dir = (dyPos ? 'North' : 'South') + '-' + (dxPos ? 'East' : 'West'); var q = 'A person walks ' + north + ' km North, ' + south + ' km South, ' + east + ' km East and ' + west + ' km West. In which direction is the person now from the starting point?'; var m = _mcq(dir, DIR8, 4); return { question: q, answer: m.answer, options: m.options, subtype: 'hard:direction' }; }
      ]
    });
  }

  /* ───────────────────────── 4. RANKING & ORDERING (numeric) ───────────────────────── */
  function _genRanking(diff) {
    return _tier(diff, {
      easy: [
        function () { var nm = _pick(NAMES); var L = _ri(3, 12), R = _ri(3, 12); return { question: 'In a row of people, ' + nm + ' is ' + _ord(L) + ' from the left and ' + _ord(R) + ' from the right. How many people are there in the row?', answer: L + R - 1, subtype: 'easy:total' }; }
      ],
      medium: [
        function () { var nm = _pick(NAMES); var N = _ri(15, 35), k = _ri(3, 12); return { question: 'In a class of ' + N + ' students, ' + nm + ' ranks ' + _ord(k) + ' from the top. What is ' + nm + "'s rank from the bottom?", answer: N - k + 1, subtype: 'medium:otherend' }; },
        function () { var nm = _pick(NAMES); var nm2 = _pick(NAMES.filter(function (x) { return x !== nm; })), a = _ri(3, 8), b = _ri(a + 2, 16); return { question: 'In a queue, ' + nm + ' is ' + _ord(a) + ' from the front and ' + nm2 + ' is ' + _ord(b) + ' from the front. How many people stand between them?', answer: b - a - 1, subtype: 'medium:between' }; }
      ],
      hard: [
        function () { var nm = _pick(NAMES); var Lh = _ri(4, 10), Rh = _ri(4, 10), Nh = Lh + Rh - 1, p = _ri(2, Lh); return { question: nm + ' is ' + _ord(Lh) + ' from the left and ' + _ord(Rh) + ' from the right in a row. How many people are to the RIGHT of the person standing ' + _ord(p) + ' from the left?', answer: Nh - p, subtype: 'hard:multistep' }; },
        /* two people interchange seats: A takes B's place, so A's new-from-left = B's old-from-left = N - bR + 1.
           Given bR and A's new position, find N. aL (A's original) is consistency context, not needed for N. */
        function () { var nm = _pickN(NAMES, 2), A = nm[0], B = nm[1]; var N = _ri(13, 24), bR = _ri(2, 9), newAL = N - bR + 1, aL; do { aL = _ri(2, N - 1); } while (aL === newAL); return { question: 'In a row, ' + A + ' is ' + _ord(aL) + ' from the left and ' + B + ' is ' + _ord(bR) + ' from the right. After they interchange seats, ' + A + ' now stands at position ' + newAL + ' counting from the left end. How many people are in the row?', answer: N, subtype: 'hard:interchange' }; }
      ]
    });
  }

  /* ───────────────────────── 5. ODD ONE OUT (MCQ) ───────────────────────── */
  function _oddSet(diff) {
    var conformers = [], odd;
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
  function _oddNumeric(diff) {
    for (var attempt = 0; attempt < 80; attempt++) {
      var s = _oddSet(diff), all = _shuffle(s.conformers.concat([s.odd]));
      if (_oddUnambiguous(all, s.odd)) return { question: 'Which one does NOT belong with the others: ' + all.join(', ') + '?', answer: String(s.odd), options: all.map(String), subtype: diff + ':oddout' };
    }
    var primes = _pickN([3, 5, 7, 11, 13, 17, 19, 23, 29, 31], 3), evenComp = _pick([10, 14, 22, 26, 34, 38, 46, 58, 62, 74, 82, 86]);
    var fall = _shuffle(primes.concat([evenComp]));
    return { question: 'Which one does NOT belong with the others: ' + fall.join(', ') + '?', answer: String(evenComp), options: fall.map(String), subtype: diff + ':oddout' };
  }
  /* letter-pair odd-one-out: three pairs share a constant gap; one breaks it (uniqueness guaranteed by construction) */
  function _oddLetter(diff) {
    var gap = _pick([1, 2, 3, 4, 5]);
    function pairAt(start, g) { return _let(start) + _let(start + g); }
    var conf = [], used = {};
    while (conf.length < 3) { var s = _ri(1, 26 - gap); if (used[s]) continue; used[s] = 1; conf.push(pairAt(s, gap)); }
    var og; do { og = _pick([1, 2, 3, 4, 5].filter(function (x) { return x !== gap; })); } while (false);
    var os = _ri(1, 26 - og), oddPair = pairAt(os, og);
    var all = _shuffle(conf.concat([oddPair]));
    return { question: 'Three of these letter-pairs follow the same rule. Which one is the ODD one out: ' + all.join(', ') + '?', answer: oddPair, options: all, subtype: diff + ':oddletter', _gap: gap };
  }
  /* curated word-category odd-one-out (semantic; correctness by curation, exactly one misfit per set) */
  var WORD_GROUPS = [
    { in: ['Rose', 'Lily', 'Jasmine', 'Lotus', 'Tulip'], out: ['Mango', 'Apple', 'Potato', 'Carrot', 'Onion'], theme: 'flower' },
    { in: ['Apple', 'Mango', 'Banana', 'Guava', 'Orange'], out: ['Potato', 'Carrot', 'Radish', 'Rose', 'Onion'], theme: 'fruit' },
    { in: ['Lion', 'Tiger', 'Leopard', 'Cheetah', 'Panther'], out: ['Cow', 'Goat', 'Sheep', 'Horse', 'Camel'], theme: 'wild cat' },
    { in: ['Copper', 'Iron', 'Gold', 'Silver', 'Zinc'], out: ['Oxygen', 'Plastic', 'Wood', 'Glass', 'Rubber'], theme: 'metal' },
    { in: ['Sparrow', 'Eagle', 'Parrot', 'Crow', 'Pigeon'], out: ['Shark', 'Whale', 'Cobra', 'Frog', 'Rat'], theme: 'bird' },
    { in: ['Triangle', 'Square', 'Hexagon', 'Pentagon', 'Octagon'], out: ['Circle', 'Sphere', 'Cube', 'Line', 'Point'], theme: 'polygon' },
    { in: ['India', 'Nepal', 'Japan', 'Brazil', 'Kenya'], out: ['Asia', 'Europe', 'Delhi', 'Paris', 'Nile'], theme: 'country' }
  ];
  function _oddWord(diff) {
    var g = _pick(WORD_GROUPS), conf = _pickN(g.in, 3), odd = _pick(g.out);
    var all = _shuffle(conf.concat([odd]));
    return { question: 'Which one does NOT belong with the others: ' + all.join(', ') + '?', answer: odd, options: all, subtype: diff + ':oddword' };
  }
  function _genOdd(diff) {
    if (diff === 'easy') return _pick([_oddNumeric, _oddNumeric, _oddLetter, _oddWord])(diff);
    if (diff === 'medium') return _pick([_oddNumeric, _oddLetter])(diff);
    return _oddNumeric(diff); // hard: cube-based numeric (sharpest)
  }

  /* ───────────────────────── 6. ANALOGIES ───────────────────────── */
  /* curated verbal analogies (function/use/part-whole relations; one best answer) */
  var VERBAL_ANALOGY = [
    { a: 'Hand', b: 'Glove', c: 'Foot', ans: 'Sock', pool: ['Sock', 'Shoe', 'Toe', 'Leg', 'Heel'] },
    { a: 'Bird', b: 'Nest', c: 'Bee', ans: 'Hive', pool: ['Hive', 'Web', 'Den', 'Burrow', 'Cave'] },
    { a: 'Pen', b: 'Write', c: 'Knife', ans: 'Cut', pool: ['Cut', 'Sharp', 'Blade', 'Kitchen', 'Steel'] },
    { a: 'Doctor', b: 'Patient', c: 'Teacher', ans: 'Student', pool: ['Student', 'School', 'Lesson', 'Class', 'Book'] },
    { a: 'Day', b: 'Night', c: 'Summer', ans: 'Winter', pool: ['Winter', 'Season', 'Rain', 'Hot', 'Sun'] },
    { a: 'Car', b: 'Garage', c: 'Aeroplane', ans: 'Hangar', pool: ['Hangar', 'Airport', 'Runway', 'Sky', 'Pilot'] },
    { a: 'Author', b: 'Book', c: 'Composer', ans: 'Music', pool: ['Music', 'Piano', 'Song', 'Note', 'Band'] },
    { a: 'Cow', b: 'Calf', c: 'Dog', ans: 'Puppy', pool: ['Puppy', 'Kitten', 'Cub', 'Foal', 'Kid'] }
  ];
  function _genAnalogy(diff) {
    return _tier(diff, {
      easy: [
        function () { var f, a, c; if (Math.random() < 0.5) { var k = _ri(2, 5); f = function (n) { return n * k; }; } else { var add = _ri(3, 20); f = function (n) { return n + add; }; } a = _ri(2, 12); c = _ri(2, 12); if (a === c) c = c + 1; return { question: a + ' : ' + f(a) + ' :: ' + c + ' : ?', answer: f(c), subtype: 'easy:analogy' }; },
        function () { var v = _pick(VERBAL_ANALOGY); var m = _mcq(v.ans, v.pool, 4); return { question: v.a + ' : ' + v.b + ' :: ' + v.c + ' : ?', answer: m.answer, options: m.options, subtype: 'easy:verbal' }; }
      ],
      medium: [
        function () { var f, a, c; if (Math.random() < 0.5) { f = function (n) { return n * n; }; a = _ri(3, 15); c = _ri(3, 15); } else { f = function (n) { return n * n * n; }; a = _ri(2, 7); c = _ri(2, 7); } if (a === c) c = c + 1; return { question: a + ' : ' + f(a) + ' :: ' + c + ' : ?', answer: f(c), subtype: 'medium:analogy' }; },
        /* letter analogy: each letter of the pair shifts by a constant; apply same shift to the third pair (MCQ) */
        function () { var sh = _pick([1, 2, 3, 4, 5]); function ap(p) { return _let(((_pos(p[0]) - 1 + sh) % 26) + 1) + _let(((_pos(p[1]) - 1 + sh) % 26) + 1); } var p1 = _let(_ri(1, 21)) + _let(_ri(1, 21)), p3 = _let(_ri(1, 21)) + _let(_ri(1, 21)); var correct = ap(p3); var d = [ap(p1), _let(((_pos(p3[0]) - 1 + sh + 1) % 26) + 1) + _let(((_pos(p3[1]) - 1 + sh) % 26) + 1), p3.split('').reverse().join(''), _let(((_pos(p3[0]) - 1 + sh) % 26) + 1) + _let(((_pos(p3[1]) - 1 + sh + 1) % 26) + 1)]; var m = _mcq(correct, d, 4); return { question: p1 + ' : ' + ap(p1) + ' :: ' + p3 + ' : ?', answer: m.answer, options: m.options, subtype: 'medium:letter' }; }
      ],
      hard: [
        function () { var variants = [function (n) { return n * n + 1; }, function (n) { return n * n - 1; }, function (n) { return n * (n + 1); }, function (n) { return n * n + n; }]; var f = _pick(variants), a = _ri(3, 12), c = _ri(3, 12); if (a === c) c = c + 1; return { question: a + ' : ' + f(a) + ' :: ' + c + ' : ?', answer: f(c), subtype: 'hard:analogy' }; }
      ]
    });
  }

  /* ───────────────────────── 7. SYLLOGISMS (MCQ) ───────────────────────── */
  var NOUNS = ['cats', 'dogs', 'birds', 'pens', 'books', 'cars', 'trees', 'flowers', 'tables', 'chairs', 'apples', 'mangoes', 'doctors', 'teachers', 'singers', 'players'];
  /* Curated, convention-independent (Boolean-logic) syllogisms — every case re-checked by the harness model-checker. */
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
      { p: ['Some A are B'], c: 'All A are B', f: 'Does not follow' },
      { p: ['All A are B', 'Some C are A'], c: 'Some C are B', f: 'Follows' },
      { p: ['No A are B', 'Some B are C'], c: 'Some C are not A', f: 'Follows' }
    ],
    hard: [
      { p: ['All A are B', 'All C are B'], c: 'All A are C', f: 'Does not follow' },
      { p: ['No A are B', 'No B are C'], c: 'No A are C', f: 'Does not follow' },
      { p: ['Some A are not B'], c: 'Some B are not A', f: 'Does not follow' },
      { p: ['All A are B', 'No B are C', 'All C are D'], c: 'No A are D', f: 'Does not follow' },
      { p: ['All A are B', 'All B are C', 'Some D are C'], c: 'All A are C', f: 'Follows' }
    ]
  };
  function _fill(s, A, B, C, D) { return s.replace(/\bA\b/g, A).replace(/\bB\b/g, B).replace(/\bC\b/g, C).replace(/\bD\b/g, D); }
  function _genSyllogism(diff) {
    var spec = _pick(SYLLO[diff] || SYLLO.medium), n = _pickN(NOUNS, 4);
    var prem = spec.p.map(function (s) { return _fill(s, n[0], n[1], n[2], n[3]) + '.'; }).join(' ');
    var concl = _fill(spec.c, n[0], n[1], n[2], n[3]) + '.';
    return { question: 'Statements: ' + prem + ' Conclusion: ' + concl + ' Does the conclusion logically follow?', answer: spec.f, options: _shuffle(['Follows', 'Does not follow']), subtype: diff + ':syllogism' };
  }

  /* ───────────────────────── 8. SERIES (letter / alphanumeric / interleaved) — MCQ ───────────────────────── */
  function _letW(n) { return String.fromCharCode(65 + ((n - 1) % 26 + 26) % 26); } // wrap into A..Z (for distractors)
  function _genSeries(diff) {
    return _tier(diff, {
      easy: [
        function () { var step = _ri(1, 5), s = _ri(1, 26 - 4 * step); var seq = [0, 1, 2, 3].map(function (i) { return _let(s + i * step); }); var ans = _let(s + 4 * step); var d = [_letW(s + 5 * step), _letW(s + 4 * step + 1), _letW(s + 4 * step - 1), _letW(s + 3 * step)]; var m = _mcq(ans, d, 4); return { question: 'Find the next term in the series:  ' + seq.join(', ') + ', ?', answer: m.answer, options: m.options, subtype: 'easy:letterstep' }; }
      ],
      medium: [
        function () { var a = _ri(1, 4), b = _ri(1, 5), s = _ri(1, 26 - 4 * a), n0 = _ri(1, 9); var seq = [0, 1, 2, 3].map(function (i) { return _let(s + i * a) + (n0 + i * b); }); var ans = _let(s + 4 * a) + (n0 + 4 * b); var d = [_let(s + 4 * a) + (n0 + 3 * b), _letW(s + 3 * a) + (n0 + 4 * b), _letW(s + 4 * a + 1) + (n0 + 4 * b), _let(s + 4 * a) + (n0 + 4 * b + 1)]; var m = _mcq(ans, d, 4); return { question: 'Find the next term in the series:  ' + seq.join(', ') + ', ?', answer: m.answer, options: m.options, subtype: 'medium:alphanum' }; }
      ],
      hard: [
        /* two interleaved letter series: positions 0,2,4 advance by +a from p; positions 1,3,5 advance by -c from q */
        function () { var a = _ri(1, 3), c = _ri(1, 3), p = _ri(1, 26 - 2 * a), q = _ri(1 + 2 * c, 26); var seq = [_let(p), _let(q), _let(p + a), _let(q - c), _let(p + 2 * a)]; var ans = _let(q - 2 * c); var d = [_letW(p + 3 * a), _letW(q - 3 * c), _let(q - c), _let(p + 2 * a)]; var m = _mcq(ans, d, 4); return { question: 'Find the next term in the series:  ' + seq.join(', ') + ', ?', answer: m.answer, options: m.options, subtype: 'hard:interleave' }; }
      ]
    });
  }

  /* ───────────────────────── 9. CODED INEQUALITIES (MCQ) — transitive-closure verdict ───────────────────── */
  var INEQ_LEGEND = [{ s: '@', r: '>' }, { s: '#', r: '≥' }, { s: '&', r: '<' }, { s: '%', r: '≤' }, { s: '$', r: '=' }];
  function _ineqSym(r) { for (var i = 0; i < INEQ_LEGEND.length; i++) if (INEQ_LEGEND[i].r === r) return INEQ_LEGEND[i].s; return '$'; }
  /* combine consecutive relations along a path → the guaranteed relation, or '?' if direction is mixed */
  function _ineqDerive(ops) {
    var hasGt = false, hasLt = false, strictGt = false, strictLt = false, allEq = true;
    ops.forEach(function (o) { if (o !== '=') allEq = false; if (o === '>') { hasGt = true; strictGt = true; } else if (o === '≥') hasGt = true; else if (o === '<') { hasLt = true; strictLt = true; } else if (o === '≤') hasLt = true; });
    if (hasGt && hasLt) return '?';
    if (allEq) return '=';
    if (hasGt) return strictGt ? '>' : '≥';
    if (hasLt) return strictLt ? '<' : '≤';
    return '=';
  }
  function _ineqHolds(concl, basic) { // does conclusion relation hold under a concrete basic relation (>,=,<)
    switch (concl) { case '>': return basic === '>'; case '≥': return basic === '>' || basic === '='; case '=': return basic === '='; case '≤': return basic === '<' || basic === '='; case '<': return basic === '<'; } return false;
  }
  function _ineqPermits(D) { if (D === '>') return ['>']; if (D === '≥') return ['>', '=']; if (D === '=') return ['=']; if (D === '≤') return ['<', '=']; if (D === '<') return ['<']; return ['>', '=', '<']; }
  function _ineqDefinite(concl, D) { return _ineqPermits(D).every(function (b) { return _ineqHolds(concl, b); }); }
  function _ineqVerdict(rI, rII, D) {
    var iDef = _ineqDefinite(rI, D), iiDef = _ineqDefinite(rII, D);
    if (iDef && iiDef) return 'Both I and II are true';
    if (iDef) return 'Only I is true';
    if (iiDef) return 'Only II is true';
    if (_ineqPermits(D).every(function (b) { return _ineqHolds(rI, b) || _ineqHolds(rII, b); })) return 'Either I or II is true';
    return 'Neither I nor II is true';
  }
  var INEQ_VERDICTS = ['Only I is true', 'Only II is true', 'Both I and II are true', 'Either I or II is true', 'Neither I nor II is true'];
  function _genInequality(diff) {
    var SAME_UP = ['>', '≥', '='], SAME_DN = ['<', '≤', '='], ALL = ['>', '≥', '<', '≤', '='];
    var vars = _pickN(['A', 'B', 'C', 'D', 'E', 'P', 'Q', 'R'], diff === 'easy' ? 3 : 4);
    var ops = [], pool;
    if (diff === 'easy') { pool = Math.random() < 0.5 ? SAME_UP : SAME_DN; }
    else if (diff === 'medium') { pool = Math.random() < 0.5 ? SAME_UP : SAME_DN; }
    for (var k = 0; k < vars.length - 1; k++) { ops.push(diff === 'hard' ? _pick(ALL) : _pick(pool)); }
    /* choose a pair i<j and derive */
    var i = 0, j = vars.length - 1; if (diff === 'hard' && Math.random() < 0.5) { i = _ri(0, vars.length - 2); j = _ri(i + 1, vars.length - 1); }
    var D = _ineqDerive(ops.slice(i, j));
    var rI = _pick(ALL), rII = _pick(ALL.filter(function (x) { return x !== rI; }));
    var ans = _ineqVerdict(rI, rII, D);
    var stmt = vars[0]; for (var s = 1; s < vars.length; s++) stmt += ' ' + _ineqSym(ops[s - 1]) + ' ' + vars[s];
    var legend = INEQ_LEGEND.map(function (l) { return "'" + l.s + "' means '" + l.r + "'"; }).join(', ');
    var q = 'In a certain code, ' + legend + '.\nStatements: ' + stmt + '.\nConclusions:  I. ' + vars[i] + ' ' + rI + ' ' + vars[j] + '   II. ' + vars[i] + ' ' + rII + ' ' + vars[j] + '.\nWhich conclusion is definitely true?';
    var m = _mcq(ans, INEQ_VERDICTS, 5);
    return { question: q, answer: m.answer, options: m.options, subtype: diff + ':ineq' };
  }

  /* ───────────────────────── 10. CALENDARS (MCQ) ───────────────────────── */
  var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function _leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function _dim(m, y) { return [31, _leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function _randDate(y) { var m = _ri(1, 12); return { m: m, d: _ri(1, _dim(m, y)) }; }
  function _fmtDate(dt) { return dt.d + ' ' + MONTHS[dt.m - 1]; }
  /* Zeller's congruence → 0=Sunday … 6=Saturday (independent of JS Date; the harness cross-checks via Date) */
  function _dow(y, m, d) { if (m < 3) { m += 12; y -= 1; } var K = y % 100, J = Math.floor(y / 100); var h = (d + Math.floor(13 * (m + 1) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7; return [6, 0, 1, 2, 3, 4, 5][h]; }
  function _genCalendar(diff) {
    if (diff === 'easy') { var start = _ri(0, 6), off = _ri(2, 75); var ans = WD[(start + off) % 7]; var m = _mcq(ans, WD, 4); return { question: 'If today is ' + WD[start] + ', what day of the week will it be after ' + off + ' days?', answer: m.answer, options: m.options, subtype: 'easy:dayafter' }; }
    if (diff === 'medium') { var y = _ri(2016, 2027), d1 = _randDate(y), d2 = _randDate(y); var wd1 = _dow(y, d1.m, d1.d), wd2 = _dow(y, d2.m, d2.d); var mm = _mcq(WD[wd2], WD, 4); return { question: 'In the year ' + y + ', ' + _fmtDate(d1) + ' falls on a ' + WD[wd1] + '. What day of the week is ' + _fmtDate(d2) + ' in the same year?', answer: mm.answer, options: mm.options, subtype: 'medium:datediff' }; }
    var yy = _ri(1950, 2050), dd = _randDate(yy); var a2 = _mcq(WD[_dow(yy, dd.m, dd.d)], WD, 4); return { question: 'What day of the week was ' + _fmtDate(dd) + ', ' + yy + '?', answer: a2.answer, options: a2.options, subtype: 'hard:dow' };
  }

  /* ───────────────────────── 11. CLOCKS ───────────────────────── */
  function _clk(h, m) { return h + ':' + (m < 10 ? '0' + m : m); }
  function _genClock(diff) {
    if (diff === 'easy') { var h = _ri(1, 11); var ang = Math.min(30 * h, 360 - 30 * h); return { question: 'What is the angle (in degrees) between the hour and minute hands of a clock at ' + h + ":00?", answer: ang, subtype: 'easy:angle0' }; }
    if (diff === 'medium') { var h2 = _ri(1, 12), mm = 2 * _ri(0, 29); var raw = Math.abs(30 * h2 - 5.5 * mm); var ang2 = Math.min(raw, 360 - raw); return { question: 'What is the smaller angle (in degrees) between the hour and minute hands at ' + _clk(h2 === 12 ? 12 : h2, mm) + '?', answer: ang2, subtype: 'medium:angle' }; }
    /* hard: mirror-image time (as seen in a mirror) */
    var h3 = _ri(1, 11), m3 = _ri(1, 59), tot = 60 * h3 + m3, mir = 720 - tot; var mh = Math.floor(mir / 60), ml = mir % 60; if (mh === 0) mh = 12; var ans = _clk(mh, ml);
    var d = [_clk(((h3 % 12) + 1), m3), _clk(mh, (ml + 5) % 60), _clk((12 - h3) || 12, (60 - m3) % 60)]; var mm2 = _mcq(ans, d, 4);
    return { question: 'A clock shows ' + _clk(h3, m3) + '. What time does its mirror image show?', answer: mm2.answer, options: mm2.options, subtype: 'hard:mirror' };
  }

  /* ───────────────────────── 12. INPUT-OUTPUT (machine, numeric) ───────────────────────── */
  var IO_NUMS = [12, 17, 23, 31, 45, 58, 64, 72, 89, 93, 15, 28, 36, 49, 53, 67, 74, 81, 19, 42];
  function _ioStep(arr, s) { var a = arr.slice(); for (var i = 0; i < s; i++) { var mi = i; for (var j = i + 1; j < a.length; j++) if (a[j] < a[mi]) mi = j; var t = a[i]; a[i] = a[mi]; a[mi] = t; } return a; }
  function _genIO(diff) {
    var len = diff === 'easy' ? 5 : 6, S = diff === 'easy' ? 1 : diff === 'medium' ? 2 : 3;
    var nums = _pickN(IO_NUMS, len), P = _ri(1, diff === 'easy' ? 3 : diff === 'medium' ? 5 : 6);
    var after = _ioStep(nums, S);
    return { question: 'A number-arranging machine rearranges a line step by step: in each step it moves the smallest of the not-yet-arranged numbers to the left end of the unarranged part. Input line: ' + nums.join(', ') + '. Which number is in the ' + _ord(P) + ' position from the left after Step ' + S + '?', answer: after[P - 1], subtype: diff + ':io' };
  }

  /* ── dispatch ── */
  var CATEGORY_LABELS = {
    'lr-coding': 'Coding-Decoding', 'lr-blood': 'Blood Relations', 'lr-direction': 'Direction Sense',
    'lr-ranking': 'Ranking & Ordering', 'lr-odd': 'Odd One Out', 'lr-analogy': 'Analogies', 'lr-syllogism': 'Syllogisms',
    'lr-series': 'Letter & Number Series', 'lr-inequality': 'Coded Inequalities', 'lr-calendar': 'Calendars',
    'lr-clock': 'Clocks', 'lr-io': 'Input-Output'
  };
  var GEN = {
    'lr-coding': _genCoding, 'lr-blood': _genBlood, 'lr-direction': _genDirection,
    'lr-ranking': _genRanking, 'lr-odd': _genOdd, 'lr-analogy': _genAnalogy, 'lr-syllogism': _genSyllogism,
    'lr-series': _genSeries, 'lr-inequality': _genInequality, 'lr-calendar': _genCalendar,
    'lr-clock': _genClock, 'lr-io': _genIO
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
    generate: generate, generators: generators, registerInto: registerInto,
    /* exposed for the independent check harness (kinship algebra) */
    _compose2: _compose2, _codeOps: CODE_OPS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LREngine;
  if (typeof window !== 'undefined') window.LREngine = LREngine;
  else root.LREngine = LREngine;
})(this);
