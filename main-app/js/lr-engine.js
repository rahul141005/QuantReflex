/**
 * lr-engine.js — the generative Logical Reasoning engine (ADR-075; deepened ADR-079; i18n ADR-111 F-M6).
 *
 * "Speed LR", not generic LR: every topic is PROCEDURALLY GENERATED, produces many variations, rewards fast reasoning,
 * and rides the SAME pipeline as Quant/DI. Self-registers into questions.js's `categoryGenerators`, stays OUT of the
 * random Quant pool and OUT of duels.
 *
 * EARNED DIFFICULTY (ADR-079): per-tier archetype pools; difficulty comes from REASONING DEPTH, never wording length.
 *
 * i18n (F-M6): the engine owns ALL RNG + math (dataset construction, answers, MCQ distractor selection via _mcq, the
 * syllogism model logic, kinship composition); every user-visible STRING lives in the per-language pack
 * locales/gen/<lang>.lr.js. `_P()` returns the ACTIVE study-language pack (guarded default 'en'), so a question
 * generates directly in the study language; for a fixed RNG seed the answer, options (by relation-id / pool index),
 * subtype and difficulty are IDENTICAL in every language and only wording differs. EN byte-identity is proven by
 * scripts/lr-census.js (exact djb2 hash); cross-language invariance by gen-i18n.check §11. RNG draw ORDER is preserved
 * exactly through the refactor (pool picks pass the localized array of the SAME length; kinship uses a generic→specific
 * render split so EN option sets stay dedup-clean).
 *
 * PURE + dual-exported. Reads `_getDifficulty()` (questions.js global).
 */
(function (root) {
  'use strict';

  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('./gen-i18n.js') : null);
  var _EN = null;
  try { if (typeof require !== 'undefined') _EN = require('../locales/gen/en.lr.js'); } catch (_) {}
  /* Active study-language LR pack (pools + stem phrasers). Resolved live so language switches take effect and the check
     can force a language via QRI18n before generate(). */
  function _P() { var p = (GI && GI.lrPack) ? GI.lrPack() : null; return p || _EN; }

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
  function _mcq(correct, pool, n) {
    n = n || 4;
    var ans = String(correct), opts = [ans];
    var p = _shuffle(pool.map(String));
    for (var i = 0; i < p.length && opts.length < n; i++) { if (opts.indexOf(p[i]) === -1) opts.push(p[i]); }
    return { answer: ans, options: _shuffle(opts) };
  }
  function _tier(diff, pools) { var pool = pools[diff] || pools.medium; return _pick(pool)(); }
  function _isSquare(n) { var r = Math.round(Math.sqrt(n)); return r * r === n; }
  function _isCube(n) { var r = Math.round(Math.cbrt(n)); return r * r * r === n; }
  function _isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  function _special(n) { return _isSquare(n) || _isCube(n) || _isPrime(n); }
  function _gcd(a, b) { return b ? _gcd(b, a % b) : a; }

  function _validOddOne(all, c) {
    var others = all.filter(function (x) { return x !== c; });
    if (others.length !== 3) return false;
    if (others.every(_isSquare) && !_isSquare(c)) return true;
    if (others.every(_isCube) && !_isCube(c)) return true;
    if (others.every(_isPrime) && !_isPrime(c)) return true;
    if (others.every(function (x) { return x % 2 === 0; }) && c % 2 !== 0) return true;
    if (others.every(function (x) { return x % 2 !== 0; }) && c % 2 === 0) return true;
    for (var k = 2; k <= 9; k++) { if (others.every(function (x) { return x % k === 0; }) && c % k !== 0) return true; }
    var g = others.reduce(function (a, b) { return _gcd(a, b); }); if (g >= 2 && c % g !== 0) return true;
    return false;
  }
  function _oddUnambiguous(all, answer) {
    var valid = all.filter(function (c) { return _validOddOne(all, c); });
    return valid.length === 1 && String(valid[0]) === String(answer);
  }

  /* display helpers now pull from the active pack (EN pack reproduces the original strings verbatim). */
  function _ord(n) { return _P().ord(n); }
  function _actor() { return _pick(_P().actors); }
  function _rowOpen() { return _pick(_P().rowOpens); }
  function _qOpen() { return _pick(_P().qOpens); }

  function _wrap(label, qa) { qa.category = label; return qa; }

  /* ───────────────────────── 1. CODING-DECODING ───────────────────────── */
  var WORDS3 = ['CAT', 'DOG', 'SUN', 'BAT', 'CAR', 'PEN', 'BOX', 'CUP', 'FAN', 'JAR', 'KEY', 'MAP', 'RAT', 'BUS', 'EGG', 'ICE', 'OWL', 'TOY', 'BAG', 'HAT',
    'LAMP', 'BOAT', 'STAR', 'MOON', 'TREE', 'FISH', 'BIRD', 'RING', 'DESK', 'COIN', 'WIND', 'GOLD', 'KING', 'LION', 'ROSE',
    'APPLE', 'MANGO', 'TRAIN', 'CLOCK', 'RIVER', 'CHAIR', 'GLASS', 'BREAD', 'CLOUD', 'STONE', 'PLANE', 'HORSE',
    'PLANET', 'GARDEN', 'BRIDGE', 'CANDLE', 'ORANGE', 'PENCIL', 'ROCKET', 'SILVER', 'WINDOW', 'FLOWER', 'JUNGLE', 'CASTLE'];
  function _pos(ch) { return ch.charCodeAt(0) - 64; }
  function _let(n) { return String.fromCharCode(64 + n); }
  function _sumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += _pos(w[i]); return s; }
  function _revSumWord(w) { var s = 0; for (var i = 0; i < w.length; i++) s += (27 - _pos(w[i])); return s; }
  function _shiftWord(w, k) { var o = ''; for (var i = 0; i < w.length; i++) { var p = (_pos(w[i]) - 1 + k % 26 + 26) % 26; o += String.fromCharCode(65 + p); } return o; }
  function _posShiftWord(w) { var o = ''; for (var i = 0; i < w.length; i++) { var p = (_pos(w[i]) - 1 + (i + 1)) % 26; o += String.fromCharCode(65 + p); } return o; }
  function _numCode(w) { var a = []; for (var i = 0; i < w.length; i++) a.push(_pos(w[i])); return a.join('-'); }
  function _genCoding(diff) {
    return _tier(diff, {
      easy: [
        function () { var w = _pick(WORDS3); return { question: _P().coding.sum(w), answer: _sumWord(w), subtype: 'easy:sum' }; },
        function () { var w = _pick(WORDS3); var correct = _numCode(w); var d = [_numCode(_shiftWord(w, 1)), _shiftWord(w, 2).split('').map(_pos).reverse().join('-'), w.split('').map(function (c) { return _pos(c) + 1; }).join('-'), w.split('').map(_pos).reverse().join('-')]; var m = _mcq(correct, d, 4); return { question: _P().coding.numcode(w), answer: m.answer, options: m.options, subtype: 'easy:numcode' }; }
      ],
      medium: [
        function () { var w = _pick(WORDS3); return { question: _P().coding.revsum(w), answer: _revSumWord(w), subtype: 'medium:revsum' }; },
        function () { var k = _ri(1, 6), pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1]; var correct = _shiftWord(target, k); var distract = [_shiftWord(target, k + 1), _shiftWord(target, (k + 25) % 26 || 25), _shiftWord(target, k + 2), _shiftWord(target.split('').reverse().join(''), k)]; var m = _mcq(correct, distract, 4); return { question: _P().coding.cipher(ex, _shiftWord(ex, k), target), answer: m.answer, options: m.options, subtype: 'medium:cipher' }; }
      ],
      hard: [
        function () { var pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1]; var correct = _posShiftWord(target); var distract = [_shiftWord(target, 1), _shiftWord(target, 2), _posShiftWord(target.split('').reverse().join('')), _shiftWord(target, 3)]; var m = _mcq(correct, distract, 4); return { question: _P().coding.posshift(ex, _posShiftWord(ex), target), answer: m.answer, options: m.options, subtype: 'hard:posshift' }; },
        function () { var k = _ri(1, 5), pair = _pickN(WORDS3, 2), ex = pair[0], target = pair[1]; function rs(w) { return _shiftWord(w.split('').reverse().join(''), k); } var correct = rs(target); var distract = [_shiftWord(target, k), rs(target).split('').reverse().join(''), _shiftWord(target.split('').reverse().join(''), k + 1), _posShiftWord(target)]; var m = _mcq(correct, distract, 4); return { question: _P().coding.revshift(ex, rs(ex), target), answer: m.answer, options: m.options, subtype: 'hard:revshift' }; }
      ]
    });
  }

  /* ───────────────────────── 2. BLOOD RELATIONS ───────────────────────── */
  var PRIM = { father: { t: 'up', g: 'M' }, mother: { t: 'up', g: 'F' }, son: { t: 'down', g: 'M' }, daughter: { t: 'down', g: 'F' }, brother: { t: 'sib', g: 'M' }, sister: { t: 'sib', g: 'F' } };
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
      default: return null;
    }
  }
  /* Lineage SPECIFIER for the answer: hi/mr distinguish where English collapses. Derived from the CONNECTING relation r2
     (paternal/maternal, son's/daughter's, brother's/sister's). null where English is already specific enough. */
  function _specifier(combo, r2) {
    switch (combo) {
      case 'up-up': return r2 === 'father' ? 'pat' : 'mat';        // grandparent side
      case 'sib-up': return r2 === 'father' ? 'pat' : 'mat';        // uncle/aunt side
      case 'down-down': return r2 === 'son' ? 'sons' : 'daughters'; // grandchild via son/daughter
      case 'down-sib': return r2 === 'brother' ? 'bro' : 'sis';     // nephew/niece via brother/sister
      default: return null;
    }
  }
  var BLOOD_COMBOS = { easy: ['up-up', 'sib-sib', 'down-down'], medium: ['up-sib', 'down-up', 'sib-down'], hard: ['sib-up', 'down-sib'] };
  var BY_TYPE = { up: ['father', 'mother'], down: ['son', 'daughter'], sib: ['brother', 'sister'] };
  function _chainBlood(diff) {
    var combo = _pick(BLOOD_COMBOS[diff] || BLOOD_COMBOS.medium), parts = combo.split('-');
    var r1 = _pick(BY_TYPE[parts[0]]), r2 = _pick(BY_TYPE[parts[1]]);
    var ans = _compose2(r1, r2);
    var P = _P();
    var nm = _pickN(P.names, 3), A = nm[0], B = nm[1], C = nm[2];
    var q = P.blood.chainStem(A, B, C, P.primWord[r1], P.primWord[r2]);
    var m = _mcq(ans, P.relGeneric, 4);
    var spec = _specifier(combo, r2);
    var opts = m.options.map(function (o) { return P.relTerm(o, o === m.answer ? spec : null); });
    return { question: q, answer: P.relTerm(m.answer, spec), options: opts, subtype: diff + ':blood' };
  }
  var CODE_OPS = [{ s: '+', r: 'father' }, { s: '-', r: 'mother' }, { s: '*', r: 'son' }, { s: '/', r: 'daughter' }, { s: '>', r: 'brother' }, { s: '<', r: 'sister' }];
  function _opByRel(r) { for (var i = 0; i < CODE_OPS.length; i++) if (CODE_OPS[i].r === r) return CODE_OPS[i].s; return '+'; }
  function _codedBlood(diff) {
    var combo = _pick(['up-sib', 'sib-up', 'down-sib', 'sib-down', 'up-up', 'down-down', 'down-up', 'sib-sib']);
    var parts = combo.split('-'), r1 = _pick(BY_TYPE[parts[0]]), r2 = _pick(BY_TYPE[parts[1]]);
    var ans = _compose2(r1, r2);
    var P = _P();
    var nm = _pickN(['P', 'Q', 'R', 'M', 'N', 'T'], 3), Pp = nm[0], Qq = nm[1], Rr = nm[2];
    var legend = CODE_OPS.map(function (o) { return P.blood.legendItem(o.s, P.primWord[o.r]); }).join(', ');
    var expr = Pp + ' ' + _opByRel(r1) + ' ' + Qq + ' ' + _opByRel(r2) + ' ' + Rr;
    var q = P.blood.codedStem(legend, P.primWord[r1], _opByRel(r1), expr, Pp, Rr);
    var m = _mcq(ans, P.relGeneric, 4);
    var spec = _specifier(combo, r2);
    var opts = m.options.map(function (o) { return P.relTerm(o, o === m.answer ? spec : null); });
    return { question: q, answer: P.relTerm(m.answer, spec), options: opts, subtype: 'hard:coded' };
  }
  function _genBlood(diff) {
    if (diff === 'hard') return Math.random() < 0.5 ? _codedBlood(diff) : _chainBlood(diff);
    return _chainBlood(diff);
  }

  /* ───────────────────────── 3. DIRECTION SENSE ───────────────────────── */
  var TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20], [7, 24, 25], [20, 21, 29], [10, 24, 26]];
  function _genDirection(diff) {
    return _tier(diff, {
      easy: [
        function () { var t = _pick(TRIPLES), a = t[0], b = t[1], h = t[2]; var P = _P(); var nWord = P.dir4[_pick([0, 2])], eWord = P.dir4[_pick([1, 3])]; return { question: P.direction.dist2(_pick(P.actors), a, nWord, b, eWord), answer: h, subtype: 'easy:distance' }; }
      ],
      medium: [
        function () { var t = _pick(TRIPLES), a = t[0], b = t[1], h = t[2]; var P = _P(); var nWi = _pick([0, 2]), eWord = P.dir4[_pick([1, 3])]; var nWord = P.dir4[nWi], extra = _ri(1, 4), p1 = a + extra, oppWord = P.dir4[nWi === 0 ? 2 : 0]; return { question: P.direction.dist3(_pick(P.actors), p1, nWord, extra, oppWord, b, eWord), answer: h, subtype: 'medium:distance' }; },
        function () { var P = _P(); var startI = _pick([0, 1, 2, 3]), turns = []; var n = _ri(2, 4); for (var i = 0; i < n; i++) turns.push(_pick(['left', 'right', 'right', 'left', 'about'])); var idx = startI; turns.forEach(function (tn) { idx = (idx + (tn === 'right' ? 1 : tn === 'left' ? 3 : 2)) % 4; }); var m = _mcq(P.dir4[idx], P.dir4, 4); var who = _pick(P.actors); var seq = turns.map(function (tn) { return P.direction.turnPhrase(tn); }).join(P.direction.turnJoin); var subject = who.indexOf('A ') === 0 ? P.direction.turnSubjectPerson : who; return { question: P.direction.turns(who, P.dir4[startI], seq, subject), answer: m.answer, options: m.options, subtype: 'medium:turns' }; }
      ],
      hard: [
        function () { var P = _P(); var dyPos = _pick([true, false]), dxPos = _pick([true, false]); var qv = _ri(1, 4), pv = qv + _pick([2, 3, 4, 5]); var north = dyPos ? pv : qv, south = dyPos ? qv : pv; var qh = _ri(1, 4), ph = qh + _pick([2, 3, 4, 5]); var east = dxPos ? ph : qh, west = dxPos ? qh : ph; var dirI = dyPos ? (dxPos ? 4 : 5) : (dxPos ? 6 : 7); var q = P.direction.diagonal(_pick(P.actors), north, south, east, west); var m = _mcq(P.dir8[dirI], P.dir8, 4); return { question: q, answer: m.answer, options: m.options, subtype: 'hard:direction' }; }
      ]
    });
  }

  /* ───────────────────────── 4. RANKING & ORDERING ───────────────────────── */
  function _genRanking(diff) {
    return _tier(diff, {
      easy: [
        function () { var P = _P(); var nm = _pick(P.names); var L = _ri(3, 12), R = _ri(3, 12); var tail = _pick(P.ranking.totalTails); return { question: P.ranking.total(_pick(P.rowOpens), nm, _ord(L), _ord(R), tail), answer: L + R - 1, subtype: 'easy:total' }; }
      ],
      medium: [
        function () { var P = _P(); var nm = _pick(P.names); var N = _ri(15, 35), k = _ri(3, 12); return { question: P.ranking.otherend(N, nm, _ord(k)), answer: N - k + 1, subtype: 'medium:otherend' }; },
        function () { var P = _P(); var nm = _pick(P.names); var nm2 = _pick(P.names.filter(function (x) { return x !== nm; })), a = _ri(3, 8), b = _ri(a + 2, 16); return { question: P.ranking.between(_pick(P.qOpens), nm, _ord(a), nm2, _ord(b)), answer: b - a - 1, subtype: 'medium:between' }; }
      ],
      hard: [
        function () { var P = _P(); var nm = _pick(P.names); var Lh = _ri(4, 10), Rh = _ri(4, 10), Nh = Lh + Rh - 1, p = _ri(2, Lh); return { question: P.ranking.multistep(nm, _ord(Lh), _ord(Rh), _ord(p)), answer: Nh - p, subtype: 'hard:multistep' }; },
        function () { var P = _P(); var nm = _pickN(P.names, 2), A = nm[0], B = nm[1]; var N = _ri(13, 24), bR = _ri(2, 9), newAL = N - bR + 1, aL; do { aL = _ri(2, N - 1); } while (aL === newAL); return { question: P.ranking.interchange(A, _ord(aL), B, _ord(bR), newAL), answer: N, subtype: 'hard:interchange' }; }
      ]
    });
  }

  /* ───────────────────────── 5. ODD ONE OUT ───────────────────────── */
  function _oddSet(diff) {
    var conformers = [], odd;
    function uniqPush(arr, v) { if (arr.indexOf(v) === -1) arr.push(v); }
    if (diff === 'easy') {
      var sq = _shuffle([4, 9, 16, 25, 36, 49, 64, 81, 100]).slice(0, 3); conformers = sq;
      do { odd = _ri(5, 99); } while (_special(odd) || conformers.indexOf(odd) !== -1);
    } else if (diff === 'medium') {
      if (Math.random() < 0.5) {
        var k = _pick([3, 4, 6, 7, 9]); conformers = [];
        while (conformers.length < 3) { uniqPush(conformers, k * _ri(2, 11)); }
        do { odd = _ri(10, 90); } while (odd % k === 0 || _special(odd) || conformers.indexOf(odd) !== -1);
      } else {
        var primes = _shuffle([7, 11, 13, 17, 19, 23, 29, 31, 37]).slice(0, 3); conformers = primes;
        do { odd = _ri(8, 40); } while (_isPrime(odd) || _isSquare(odd) || _isCube(odd) || conformers.indexOf(odd) !== -1);
      }
    } else {
      var cb = _shuffle([8, 27, 64, 125, 216]).slice(0, 3); conformers = cb;
      do { odd = _ri(10, 215); } while (_special(odd) || conformers.indexOf(odd) !== -1);
    }
    return { conformers: conformers, odd: odd };
  }
  function _oddNumeric(diff) {
    for (var attempt = 0; attempt < 80; attempt++) {
      var s = _oddSet(diff), all = _shuffle(s.conformers.concat([s.odd]));
      if (_oddUnambiguous(all, s.odd)) return { question: _P().odd.numeric(all.join(', ')), answer: String(s.odd), options: all.map(String), subtype: diff + ':oddout' };
    }
    var primes = _pickN([3, 5, 7, 11, 13, 17, 19, 23, 29, 31], 3), evenComp = _pick([10, 14, 22, 26, 34, 38, 46, 58, 62, 74, 82, 86]);
    var fall = _shuffle(primes.concat([evenComp]));
    return { question: _P().odd.numeric(fall.join(', ')), answer: String(evenComp), options: fall.map(String), subtype: diff + ':oddout' };
  }
  function _oddLetter(diff) {
    var gap = _pick([1, 2, 3, 4, 5]);
    function pairAt(start, g) { return _let(start) + _let(start + g); }
    var conf = [], used = {};
    while (conf.length < 3) { var s = _ri(1, 26 - gap); if (used[s]) continue; used[s] = 1; conf.push(pairAt(s, gap)); }
    var og; do { og = _pick([1, 2, 3, 4, 5].filter(function (x) { return x !== gap; })); } while (false);
    var os = _ri(1, 26 - og), oddPair = pairAt(os, og);
    var all = _shuffle(conf.concat([oddPair]));
    return { question: _P().odd.letter(all.join(', ')), answer: oddPair, options: all, subtype: diff + ':oddletter', _gap: gap };
  }
  function _oddWord(diff) {
    var g = _pick(_P().wordGroups), conf = _pickN(g.in, 3), odd = _pick(g.out);
    var all = _shuffle(conf.concat([odd]));
    return { question: _P().odd.word(all.join(', ')), answer: odd, options: all, subtype: diff + ':oddword' };
  }
  function _genOdd(diff) {
    if (diff === 'easy') return _pick([_oddNumeric, _oddNumeric, _oddLetter, _oddWord])(diff);
    if (diff === 'medium') return _pick([_oddNumeric, _oddLetter])(diff);
    return _oddNumeric(diff);
  }

  /* ───────────────────────── 6. ANALOGIES ───────────────────────── */
  function _genAnalogy(diff) {
    return _tier(diff, {
      easy: [
        function () { var f, a, c; if (Math.random() < 0.5) { var k = _ri(2, 5); f = function (n) { return n * k; }; } else { var add = _ri(3, 20); f = function (n) { return n + add; }; } a = _ri(2, 12); c = _ri(2, 12); if (a === c) c = c + 1; return { question: _P().analogy.numeric(a, f(a), c), answer: f(c), subtype: 'easy:analogy' }; },
        function () { var v = _pick(_P().verbalAnalogy); var m = _mcq(v.ans, v.pool, 4); return { question: _P().analogy.verbal(v.a, v.b, v.c), answer: m.answer, options: m.options, subtype: 'easy:verbal' }; }
      ],
      medium: [
        function () { var f, a, c; if (Math.random() < 0.5) { f = function (n) { return n * n; }; a = _ri(3, 15); c = _ri(3, 15); } else { f = function (n) { return n * n * n; }; a = _ri(2, 7); c = _ri(2, 7); } if (a === c) c = c + 1; return { question: _P().analogy.numeric(a, f(a), c), answer: f(c), subtype: 'medium:analogy' }; },
        function () { var sh = _pick([1, 2, 3, 4, 5]); function ap(p) { return _let(((_pos(p[0]) - 1 + sh) % 26) + 1) + _let(((_pos(p[1]) - 1 + sh) % 26) + 1); } var p1 = _let(_ri(1, 21)) + _let(_ri(1, 21)), p3 = _let(_ri(1, 21)) + _let(_ri(1, 21)); var correct = ap(p3); var d = [ap(p1), _let(((_pos(p3[0]) - 1 + sh + 1) % 26) + 1) + _let(((_pos(p3[1]) - 1 + sh) % 26) + 1), p3.split('').reverse().join(''), _let(((_pos(p3[0]) - 1 + sh) % 26) + 1) + _let(((_pos(p3[1]) - 1 + sh + 1) % 26) + 1)]; var m = _mcq(correct, d, 4); return { question: _P().analogy.letter(p1, ap(p1), p3), answer: m.answer, options: m.options, subtype: 'medium:letter' }; }
      ],
      hard: [
        function () { var variants = [function (n) { return n * n + 1; }, function (n) { return n * n - 1; }, function (n) { return n * (n + 1); }, function (n) { return n * n + n; }]; var f = _pick(variants), a = _ri(3, 12), c = _ri(3, 12); if (a === c) c = c + 1; return { question: _P().analogy.numeric(a, f(a), c), answer: f(c), subtype: 'hard:analogy' }; }
      ]
    });
  }

  /* ───────────────────────── 7. SYLLOGISMS ───────────────────────── */
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
  function _renderSyllo(s, vm) { var mm = s.match(/^(All|No|Some) ([A-D]) are (not )?([A-D])$/); return _P().syllo.stmt(mm[1], vm[mm[2]], vm[mm[4]], !!mm[3]); }
  function _genSyllogism(diff) {
    var P = _P();
    var spec = _pick(SYLLO[diff] || SYLLO.medium), n = _pickN(P.nouns, 4);
    var vm = { A: n[0], B: n[1], C: n[2], D: n[3] };
    var period = (P.syllo && P.syllo.period) || '.';   // EN '.', hi/mr '।' — sentence terminator lives in the pack.
    var prem = spec.p.map(function (s) { return _renderSyllo(s, vm) + period; }).join(' ');
    var concl = _renderSyllo(spec.c, vm) + period;
    return { question: P.syllo.wrap(prem, concl), answer: P.syllo.verdict[spec.f], options: _shuffle([P.syllo.verdict['Follows'], P.syllo.verdict['Does not follow']]), subtype: diff + ':syllogism' };
  }

  /* ───────────────────────── 8. SERIES ───────────────────────── */
  function _letW(n) { return String.fromCharCode(65 + ((n - 1) % 26 + 26) % 26); }
  function _genSeries(diff) {
    return _tier(diff, {
      easy: [
        function () { var step = _ri(1, 5), s = _ri(1, 26 - 4 * step); var seq = [0, 1, 2, 3].map(function (i) { return _let(s + i * step); }); var ans = _let(s + 4 * step); var d = [_letW(s + 5 * step), _letW(s + 4 * step + 1), _letW(s + 4 * step - 1), _letW(s + 3 * step)]; var m = _mcq(ans, d, 4); return { question: _P().series.next(seq.join(', ')), answer: m.answer, options: m.options, subtype: 'easy:letterstep' }; }
      ],
      medium: [
        function () { var a = _ri(1, 4), b = _ri(1, 5), s = _ri(1, 26 - 4 * a), n0 = _ri(1, 9); var seq = [0, 1, 2, 3].map(function (i) { return _let(s + i * a) + (n0 + i * b); }); var ans = _let(s + 4 * a) + (n0 + 4 * b); var d = [_let(s + 4 * a) + (n0 + 3 * b), _letW(s + 3 * a) + (n0 + 4 * b), _letW(s + 4 * a + 1) + (n0 + 4 * b), _let(s + 4 * a) + (n0 + 4 * b + 1)]; var m = _mcq(ans, d, 4); return { question: _P().series.next(seq.join(', ')), answer: m.answer, options: m.options, subtype: 'medium:alphanum' }; }
      ],
      hard: [
        function () { var a = _ri(1, 3), c = _ri(1, 3), p = _ri(1, 26 - 2 * a), q = _ri(1 + 2 * c, 26); var seq = [_let(p), _let(q), _let(p + a), _let(q - c), _let(p + 2 * a)]; var ans = _let(q - 2 * c); var d = [_letW(p + 3 * a), _letW(q - 3 * c), _let(q - c), _let(p + 2 * a)]; var m = _mcq(ans, d, 4); return { question: _P().series.next(seq.join(', ')), answer: m.answer, options: m.options, subtype: 'hard:interleave' }; }
      ]
    });
  }

  /* ───────────────────────── 9. CODED INEQUALITIES ───────────────────────── */
  var INEQ_LEGEND = [{ s: '@', r: '>' }, { s: '#', r: '≥' }, { s: '&', r: '<' }, { s: '%', r: '≤' }, { s: '$', r: '=' }];
  function _ineqSym(r) { for (var i = 0; i < INEQ_LEGEND.length; i++) if (INEQ_LEGEND[i].r === r) return INEQ_LEGEND[i].s; return '$'; }
  function _ineqDerive(ops) {
    var hasGt = false, hasLt = false, strictGt = false, strictLt = false, allEq = true;
    ops.forEach(function (o) { if (o !== '=') allEq = false; if (o === '>') { hasGt = true; strictGt = true; } else if (o === '≥') hasGt = true; else if (o === '<') { hasLt = true; strictLt = true; } else if (o === '≤') hasLt = true; });
    if (hasGt && hasLt) return '?';
    if (allEq) return '=';
    if (hasGt) return strictGt ? '>' : '≥';
    if (hasLt) return strictLt ? '<' : '≤';
    return '=';
  }
  function _ineqHolds(concl, basic) { switch (concl) { case '>': return basic === '>'; case '≥': return basic === '>' || basic === '='; case '=': return basic === '='; case '≤': return basic === '<' || basic === '='; case '<': return basic === '<'; } return false; }
  function _ineqPermits(D) { if (D === '>') return ['>']; if (D === '≥') return ['>', '=']; if (D === '=') return ['=']; if (D === '≤') return ['<', '=']; if (D === '<') return ['<']; return ['>', '=', '<']; }
  function _ineqDefinite(concl, D) { return _ineqPermits(D).every(function (b) { return _ineqHolds(concl, b); }); }
  var INEQ_VERDICTS = ['Only I is true', 'Only II is true', 'Both I and II are true', 'Either I or II is true', 'Neither I nor II is true'];
  function _ineqVerdict(rI, rII, D) {
    var iDef = _ineqDefinite(rI, D), iiDef = _ineqDefinite(rII, D);
    if (iDef && iiDef) return 2;   // Both
    if (iDef) return 0;            // Only I
    if (iiDef) return 1;           // Only II
    if (_ineqPermits(D).every(function (b) { return _ineqHolds(rI, b) || _ineqHolds(rII, b); })) return 3;  // Either
    return 4;                      // Neither
  }
  function _genInequality(diff) {
    var P = _P();
    var SAME_UP = ['>', '≥', '='], SAME_DN = ['<', '≤', '='], ALL = ['>', '≥', '<', '≤', '='];
    var vars = _pickN(['A', 'B', 'C', 'D', 'E', 'P', 'Q', 'R'], diff === 'easy' ? 3 : 4);
    var ops = [], pool;
    if (diff === 'easy') { pool = Math.random() < 0.5 ? SAME_UP : SAME_DN; }
    else if (diff === 'medium') { pool = Math.random() < 0.5 ? SAME_UP : SAME_DN; }
    for (var k = 0; k < vars.length - 1; k++) { ops.push(diff === 'hard' ? _pick(ALL) : _pick(pool)); }
    var i = 0, j = vars.length - 1; if (diff === 'hard' && Math.random() < 0.5) { i = _ri(0, vars.length - 2); j = _ri(i + 1, vars.length - 1); }
    var D = _ineqDerive(ops.slice(i, j));
    var rI = _pick(ALL), rII = _pick(ALL.filter(function (x) { return x !== rI; }));
    var ansIdx = _ineqVerdict(rI, rII, D);
    var stmt = vars[0]; for (var s = 1; s < vars.length; s++) stmt += ' ' + _ineqSym(ops[s - 1]) + ' ' + vars[s];
    var legend = INEQ_LEGEND.map(function (l) { return P.inequality.legendItem(l.s, l.r); }).join(', ');
    var q = P.inequality.stem(legend, stmt, vars[i], rI, vars[j], rII);
    var m = _mcq(P.ineqVerdicts[ansIdx], P.ineqVerdicts, 5);
    return { question: q, answer: m.answer, options: m.options, subtype: diff + ':ineq' };
  }

  /* ───────────────────────── 10. CALENDARS ───────────────────────── */
  function _leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function _dim(m, y) { return [31, _leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function _randDate(y) { var m = _ri(1, 12); return { m: m, d: _ri(1, _dim(m, y)) }; }
  function _fmtDate(dt) { var P = _P(); return P.calendar.fmtDate(dt.d, P.months[dt.m - 1]); }
  function _dow(y, m, d) { if (m < 3) { m += 12; y -= 1; } var K = y % 100, J = Math.floor(y / 100); var h = (d + Math.floor(13 * (m + 1) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7; return [6, 0, 1, 2, 3, 4, 5][h]; }
  function _genCalendar(diff) {
    var P = _P();
    if (diff === 'easy') { var start = _ri(0, 6), off = _ri(2, 75); var ansI = (start + off) % 7; var m = _mcq(P.weekdays[ansI], P.weekdays, 4); return { question: P.calendar.dayafter(P.weekdays[start], off), answer: m.answer, options: m.options, subtype: 'easy:dayafter' }; }
    if (diff === 'medium') { var y = _ri(2016, 2027), d1 = _randDate(y), d2 = _randDate(y); var wd1 = _dow(y, d1.m, d1.d), wd2 = _dow(y, d2.m, d2.d); var mm = _mcq(P.weekdays[wd2], P.weekdays, 4); return { question: P.calendar.datediff(y, _fmtDate(d1), P.weekdays[wd1], _fmtDate(d2)), answer: mm.answer, options: mm.options, subtype: 'medium:datediff' }; }
    var yy = _ri(1950, 2050), dd = _randDate(yy); var a2 = _mcq(P.weekdays[_dow(yy, dd.m, dd.d)], P.weekdays, 4); return { question: P.calendar.dow(_fmtDate(dd), yy), answer: a2.answer, options: a2.options, subtype: 'hard:dow' };
  }

  /* ───────────────────────── 11. CLOCKS ───────────────────────── */
  function _clk(h, m) { return h + ':' + (m < 10 ? '0' + m : m); }
  function _genClock(diff) {
    var P = _P();
    if (diff === 'easy') {
      var form = _ri(0, 4);
      if (form === 0) { var h = _ri(1, 11); var ang = Math.min(30 * h, 360 - 30 * h); return { question: P.clock.angle0(h), answer: ang, subtype: 'easy:angle0' }; }
      if (form === 1) { var he = _ri(1, 12); var raw0 = Math.abs(30 * he - 165); var ange = Math.min(raw0, 360 - raw0); return { question: P.clock.angle30(he), answer: ange, subtype: 'easy:angle30' }; }
      if (form === 2) { var mn = _ri(2, 58); return { question: P.clock.minmove(mn), answer: 6 * mn, subtype: 'easy:minmove' }; }
      if (form === 3) { var em = 2 * _ri(1, 29); return { question: P.clock.hourmin(em), answer: em / 2, subtype: 'easy:hourmin' }; }
      var hr = _ri(1, 11); return { question: P.clock.hourmove(hr), answer: 30 * hr, subtype: 'easy:hourmove' };
    }
    if (diff === 'medium') { var h2 = _ri(1, 12), mm = 2 * _ri(0, 29); var raw = Math.abs(30 * h2 - 5.5 * mm); var ang2 = Math.min(raw, 360 - raw); return { question: P.clock.angle(_clk(h2 === 12 ? 12 : h2, mm)), answer: ang2, subtype: 'medium:angle' }; }
    var h3 = _ri(1, 11), m3 = _ri(1, 59), tot = 60 * h3 + m3, mir = 720 - tot; var mh = Math.floor(mir / 60), ml = mir % 60; if (mh === 0) mh = 12; var ans = _clk(mh, ml);
    var d = [_clk(((h3 % 12) + 1), m3), _clk(mh, (ml + 5) % 60), _clk((12 - h3) || 12, (60 - m3) % 60)]; var mm2 = _mcq(ans, d, 4);
    return { question: P.clock.mirror(_clk(h3, m3)), answer: mm2.answer, options: mm2.options, subtype: 'hard:mirror' };
  }

  /* ───────────────────────── 12. INPUT-OUTPUT ───────────────────────── */
  var IO_NUMS = [12, 17, 23, 31, 45, 58, 64, 72, 89, 93, 15, 28, 36, 49, 53, 67, 74, 81, 19, 42];
  function _ioStep(arr, s) { var a = arr.slice(); for (var i = 0; i < s; i++) { var mi = i; for (var j = i + 1; j < a.length; j++) if (a[j] < a[mi]) mi = j; var t = a[i]; a[i] = a[mi]; a[mi] = t; } return a; }
  function _genIO(diff) {
    var len = diff === 'easy' ? 5 : 6, S = diff === 'easy' ? 1 : diff === 'medium' ? 2 : 3;
    var nums = _pickN(IO_NUMS, len), P = diff === 'easy' ? _ri(2, 3) : _ri(1, diff === 'medium' ? 5 : 6);
    var after = _ioStep(nums, S);
    return { question: _P().io.stem(nums.join(', '), _ord(P), S), answer: after[P - 1], subtype: diff + ':io' };
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
  function registerInto(map) { if (!map) return; Object.keys(generators).forEach(function (k) { map[k] = generators[k]; }); }
  try { if (typeof categoryGenerators !== 'undefined' && categoryGenerators) registerInto(categoryGenerators); } catch (_) {}

  var LREngine = {
    CATEGORY_LABELS: CATEGORY_LABELS,
    categories: function () { return Object.keys(CATEGORY_LABELS); },
    label: function (c) { return CATEGORY_LABELS[c] || c; },
    generate: generate, generators: generators, registerInto: registerInto,
    /* exposed for tests: kinship composition + specifier (F-M6 kinship truth-table). */
    _kinship: { compose2: _compose2, specifier: _specifier, PRIM: PRIM, BY_TYPE: BY_TYPE }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LREngine;
  if (typeof window !== 'undefined') window.LREngine = LREngine;
  else root.LREngine = LREngine;
})(this);
