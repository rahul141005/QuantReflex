/**
 * lr-visual-engine.js — the generative VISUAL reasoning engine (ADR-079 · rebuilt ADR-093).
 *
 * Ten non-verbal categories that can be generated AND auto-validated deterministically — mirror images, water
 * images, dice (incl. nets + two-position deduction), painted cubes/cuboids, figure series, figure analogy,
 * odd figure out, paper folding, matrix (pattern) completion and embedded figures — each rendered by
 * js/ui/lr-figures.js. Like the other LR engines it self-registers into questions.js's `categoryGenerators`.
 *
 * A visual MCQ carries `figure` (the prompt, rendered above the stem) and, when the choices are pictures,
 * `optionFigures` (parallel to `options`; the drill engine renders each inside its option button). The token in
 * `options`/`answer` is what the grader compares — so grading stays identical to text MCQ.
 *
 * Correctness discipline (what the check harness recomputes):
 *  - every option list is SPEC-DISTINCT (canonical JSON keys differ);
 *  - reflections/rotations are exact spec transforms (anchor-cycle maps, 0..3 lattice maps) — never approximations;
 *  - chirality is verified where reflection questions demand it (a mirrored figure must not equal any rotation);
 *  - paper-fold answers are the exact reflected hole sets; net/dice answers come from the constructed pairing;
 *  - distractors encode the documented exam traps (unflipped, wrong axis, rotation-instead-of-reflection,
 *    one-step-further, half-applied rules) — never random noise.
 * PURE + dual-exported.
 */
(function (root) {
  'use strict';

  function _ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _pickN(a, n) { return _shuffle(a).slice(0, n); }
  function _mcq(correct, pool, n) { n = n || 4; var ans = String(correct), opts = [ans]; var p = _shuffle(pool.map(String)); for (var i = 0; i < p.length && opts.length < n; i++) if (opts.indexOf(p[i]) === -1) opts.push(p[i]); return { answer: ans, options: _shuffle(opts) }; }
  function _difficulty(explicit) {
    if (explicit) return explicit;
    try { if (typeof _getDifficulty === 'function') return _getDifficulty(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window._getDifficulty === 'function') return window._getDifficulty(); } catch (_) {}
    return 'medium';
  }

  /* Anti-repetition ring (pattern from lr-authored-engine): avoid re-serving the most recent picks per pool. */
  var _rings = {};
  function _ringPick(poolId, arr) {
    var ring = _rings[poolId] || (_rings[poolId] = []);
    var avoid = ring.slice(-Math.max(1, Math.floor(arr.length / 2)));
    var fresh = arr.filter(function (x) { return avoid.indexOf(JSON.stringify(x)) === -1; });
    var chosen = _pick(fresh.length ? fresh : arr);
    ring.push(JSON.stringify(chosen));
    if (ring.length > 24) ring.splice(0, ring.length - 24);
    return chosen;
  }

  /* picture-option MCQ: figs[0] is the correct figure; returns {options(tokens), optionFigures, answer} shuffled. */
  function _figOptions(figs) {
    var order = _shuffle(figs.map(function (_, i) { return i; }));
    var optionFigures = order.map(function (i) { return figs[i]; });
    var options = optionFigures.map(function (_, i) { return String(i + 1); });
    return { options: options, optionFigures: optionFigures, answer: options[order.indexOf(0)] };
  }
  function _key(spec) { return JSON.stringify(spec); }
  function _distinct(figs) {
    var seen = {};
    for (var i = 0; i < figs.length; i++) { var k = _key(figs[i]); if (seen[k]) return false; seen[k] = 1; }
    return true;
  }

  /* ─────────────────────────── transformation core ─────────────────────────── */

  /* 8-anchor clockwise cycle for compo inner positions (45° steps) + reflection maps. */
  var ORDER8 = ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'];
  function _rotAt(at, k) { var i = ORDER8.indexOf(at); return i === -1 ? at : ORDER8[(i + k + 800) % 8]; }
  var MIR_AT = { t: 't', tr: 'tl', r: 'l', br: 'bl', b: 'b', bl: 'br', l: 'r', tl: 'tr', c: 'c' };
  var WAT_AT = { t: 'b', tr: 'br', r: 'r', br: 'tr', b: 't', bl: 'tl', l: 'l', tl: 'bl', c: 'c' };

  /* 0..3 lattice segment figures: exact transforms + canonical keys. */
  function _segNorm(segs) {
    return segs.map(function (s) {
      return (s[0] < s[2] || (s[0] === s[2] && s[1] <= s[3])) ? s.slice() : [s[2], s[3], s[0], s[1]];
    }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]; });
  }
  function _segKey(segs) { return JSON.stringify(_segNorm(segs)); }
  function _segMap(segs, fx, fy) { return segs.map(function (s) { return [fx(s[0], s[1]), fy(s[0], s[1]), fx(s[2], s[3]), fy(s[2], s[3])]; }); }
  function _segMirror(segs) { return _segMap(segs, function (x) { return 3 - x; }, function (x, y) { return y; }); }
  function _segWater(segs) { return _segMap(segs, function (x) { return x; }, function (x, y) { return 3 - y; }); }
  function _segRot90(segs) { return _segMap(segs, function (x, y) { return 3 - y; }, function (x) { return x; }); }
  function _segRot(segs, times) { var out = segs; for (var i = 0; i < times; i++) out = _segRot90(out); return out; }
  function _segFig(segs) { return { kind: 'seg', segs: _segNorm(segs) }; }
  /* chiral = its mirror is not equal to ANY rotation of itself (so reflection questions are unambiguous) */
  function _segChiral(segs) {
    var m = _segKey(_segMirror(segs));
    for (var r = 0; r < 4; r++) if (_segKey(_segRot(segs, r)) === m) return false;
    return true;
  }
  /* random connected lattice path of n segments (unit steps incl. diagonals), no duplicate segments */
  function _segPath(n) {
    for (var attempt = 0; attempt < 40; attempt++) {
      var x = _ri(0, 3), y = _ri(0, 3), segs = [], used = {};
      var guard = 0;
      while (segs.length < n && guard++ < 60) {
        var dirs = _shuffle([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
        var moved = false;
        for (var d = 0; d < dirs.length; d++) {
          var nx = x + dirs[d][0], ny = y + dirs[d][1];
          if (nx < 0 || nx > 3 || ny < 0 || ny > 3) continue;
          var k = _segKey([[x, y, nx, ny]]);
          if (used[k]) continue;
          used[k] = 1; segs.push([x, y, nx, ny]); x = nx; y = ny; moved = true; break;
        }
        if (!moved) break;
      }
      if (segs.length === n) return segs;
    }
    return [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 2, 1]];   // deterministic fallback (chiral L-run)
  }
  function _chiralPath(n) {
    for (var i = 0; i < 60; i++) { var s = _segPath(n); if (_segChiral(s)) return s; }
    return [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 2, 2]];   // L + diagonal — chiral
  }
  function _segSubset(motif, host) {
    var hk = {}; _segNorm(host).forEach(function (s) { hk[JSON.stringify(s)] = 1; });
    return _segNorm(motif).every(function (s) { return hk[JSON.stringify(s)]; });
  }

  /* compo builders */
  var OUTERS = ['circle', 'square', 'triangle', 'pentagon', 'hexagon', 'diamond'];
  var INNERS = ['dot', 'triangle', 'square', 'circle', 'diamond', 'star'];
  function _compoDot(outer, at, extra) {
    var inner = [{ form: 'dot', at: at }];
    if (extra) inner.push(extra);
    return { kind: 'compo', outer: { form: outer, fill: 'none' }, inner: inner };
  }
  /* count layouts: where k dots sit inside the outer shape (fixed, legible arrangements) */
  var COUNT_AT = { 1: ['c'], 2: ['l', 'r'], 3: ['tl', 'c', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'], 6: ['tl', 'tr', 'l', 'r', 'bl', 'br'] };
  function _compoCount(outer, k, fill) {
    return { kind: 'compo', outer: { form: outer, fill: fill || 'none' }, inner: (COUNT_AT[k] || ['c']).map(function (a) { return { form: 'dot', at: a }; }) };
  }

  /* ─────────────────────────── mirror / water ─────────────────────────── */

  /* Characters with no reflective or point symmetry — every transform is visually distinct. */
  var CHARS = ['F', 'G', 'J', 'L', 'P', 'Q', 'R', '2', '4', '5', '7'];
  function _glyphSpec(c, t) { return t === 'h' ? { kind: 'glyph', text: c, flip: 'h' } : t === 'v' ? { kind: 'glyph', text: c, flip: 'v' } : t === 'r' ? { kind: 'glyph', text: c, rot: 180 } : { kind: 'glyph', text: c, flip: 'none' }; }

  function _axisWord(axis) {
    return axis === 'h'
      ? _pick(['mirror image (the mirror stands upright beside it)', 'mirror image', 'image in a vertical mirror'])
      : _pick(['water image (its reflection in still water below)', 'water image', 'reflection in water']);
  }

  function _mirrorLike(diff, axis, keyBase) {
    var isM = axis === 'h';
    if (diff === 'easy') {
      if (Math.random() < 0.45) {   // single character (orientation reading)
        var g = _ringPick('mw-char', CHARS);
        var figs1 = [_glyphSpec(g, axis), _glyphSpec(g, 'none'), _glyphSpec(g, axis === 'h' ? 'v' : 'h'), _glyphSpec(g, 'r')];
        var o1 = _figOptions(figs1);
        return { question: 'Select the correct ' + _axisWord(axis) + ' of the character shown at the top.', figure: _glyphSpec(g, 'none'), options: o1.options, optionFigures: o1.optionFigures, answer: o1.answer, subtype: 'easy:' + keyBase, explanation: (isM ? 'A mirror reverses left and right — the character appears flipped sideways.' : 'Water reflects top and bottom — the character appears flipped upside-down, not sideways.') };
      }
      var base = _compoDot(_ringPick('mw-outer', OUTERS), _pick(['tl', 'tr', 'bl', 'br']));
      var correct = Object.assign({}, base, { flip: axis });
      var figsE = [correct, base, Object.assign({}, base, { flip: axis === 'h' ? 'v' : 'h' }), Object.assign({}, base, { rot: 180 })];
      var oE = _figOptions(figsE);
      return { question: 'Which option shows the correct ' + _axisWord(axis) + ' of the figure?', figure: base, options: oE.options, optionFigures: oE.optionFigures, answer: oE.answer, subtype: 'easy:fig' + keyBase, explanation: (isM ? 'In a mirror the dot swaps to the opposite side (left ↔ right); top and bottom stay put.' : 'In water the figure flips vertically — the dot moves from top to bottom on the SAME side.') };
    }
    if (diff === 'medium' && Math.random() < 0.5) {   // the classic character-cluster archetype (SSC staple)
      var n = 4, gs = _pickN(CHARS, n);
      var plain = gs.map(function (c) { return _glyphSpec(c, 'none'); });
      var correct2, dA, dB;
      if (isM) {
        correct2 = gs.slice().reverse().map(function (c) { return _glyphSpec(c, 'h'); });
        dA = gs.map(function (c) { return _glyphSpec(c, 'h'); });                        // flipped but NOT reversed
        dB = gs.slice().reverse().map(function (c) { return _glyphSpec(c, 'none'); });   // reversed but not flipped
      } else {
        correct2 = gs.map(function (c) { return _glyphSpec(c, 'v'); });
        dA = gs.slice().reverse().map(function (c) { return _glyphSpec(c, 'v'); });      // flipped AND wrongly reversed
        dB = gs.map(function (c) { return _glyphSpec(c, 'h'); });                        // wrong axis
      }
      var figs = [{ kind: 'row', items: correct2 }, { kind: 'row', items: dA }, { kind: 'row', items: dB }, { kind: 'row', items: plain.slice() }];
      var o = _figOptions(figs);
      return { question: _pick(['Choose the option that shows the ' + _axisWord(axis) + ' of the given group of characters.', 'The group of characters at the top is held up to a ' + (isM ? 'mirror' : 'water surface') + '. Which option shows what you would see?']), figure: { kind: 'row', items: plain }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: 'medium:cluster', explanation: (isM ? 'A mirror reverses the ORDER of the characters and flips each one left-to-right.' : 'Water keeps the order but turns each character upside-down.') };
    }
    if (diff === 'medium') {   // composite figure with two markers
      var outer = _ringPick('mw-outer2', OUTERS);
      var corner = _pick(['tl', 'tr', 'bl', 'br']);
      var side = _pick(['t', 'b', 'l', 'r']);
      var baseM = { kind: 'compo', outer: { form: outer, fill: 'none' }, inner: [{ form: 'dot', at: corner }, { form: _pick(['triangle', 'square', 'star']), at: side }] };
      var okM = Object.assign({}, baseM, { flip: axis });
      var figsM = [okM, baseM, Object.assign({}, baseM, { flip: axis === 'h' ? 'v' : 'h' }), Object.assign({}, baseM, { rot: 180 })];
      var oM = _figOptions(figsM);
      return { question: 'Which option shows the correct ' + _axisWord(axis) + ' of the figure?', figure: baseM, options: oM.options, optionFigures: oM.optionFigures, answer: oM.answer, subtype: 'medium:fig' + keyBase, explanation: (isM ? 'Reflect every element left ↔ right: each marker jumps to the opposite side of the vertical axis.' : 'Reflect every element top ↔ bottom: each marker jumps across the horizontal axis.') };
    }
    /* hard: chiral line figure — the rotation-vs-reflection discrimination */
    var segs = _chiralPath(_ri(4, 5));
    var correctH = _segFig(isM ? _segMirror(segs) : _segWater(segs));
    var dH1 = _segFig(_segRot(segs, isM ? 1 : 2));
    var dH2 = _segFig(isM ? _segWater(segs) : _segMirror(segs));
    var dH3 = _segFig(_segRot(segs, 3));
    var figsH = [correctH, dH1, dH2, dH3];
    if (!_distinct(figsH)) return _mirrorLike(diff, axis, keyBase);   // rare collision → regenerate
    var oH = _figOptions(figsH);
    return { question: 'Select the option that shows the exact ' + _axisWord(axis) + ' of the figure at the top.', figure: _segFig(segs), options: oH.options, optionFigures: oH.optionFigures, answer: oH.answer, subtype: 'hard:seg' + keyBase, explanation: (isM ? 'Trace each line: a mirror swaps left and right only. A rotated copy LOOKS similar but the slants run the wrong way — that is the trap.' : 'Water flips the figure vertically. Compare the top of the original with the bottom of each option; rotations are the trap.') };
  }

  function _genMirror(diff) { return _mirrorLike(diff, 'h', 'mirror'); }
  function _genWater(diff) { return _mirrorLike(diff, 'v', 'water'); }

  /* ─────────────────────────── dice ─────────────────────────── */

  function _genDice(diff) {
    if (diff === 'easy') {
      if (Math.random() < 0.5) {
        var top = _ri(1, 6);
        var m = _mcq(7 - top, ['1', '2', '3', '4', '5', '6'], 4);
        return { question: _pick(['A standard die is shown (opposite faces always add up to 7). Which number is on the face opposite the ' + top + '?', 'The die shown is a standard die, so opposite faces total 7. What lies on the face opposite the one showing ' + top + '?']), figure: { kind: 'die', value: top }, options: m.options, answer: m.answer, subtype: 'easy:opp', explanation: 'On a standard die opposite faces sum to 7, so the face opposite ' + top + ' is 7 − ' + top + ' = ' + (7 - top) + '.' };
      }
      var t2 = _ri(1, 6);
      var m2 = _mcq(21 - t2, ['15', '16', '17', '18', '19', '20'], 4);
      return { question: 'A die shows ' + t2 + ' on its top face. The six faces carry the numbers 1 to 6. What do the OTHER five faces add up to?', figure: { kind: 'die', value: t2 }, options: m2.options, answer: m2.answer, subtype: 'easy:hiddenSum', explanation: 'All six faces total 1+2+3+4+5+6 = 21, so the hidden five faces total 21 − ' + t2 + ' = ' + (21 - t2) + '.' };
    }
    if (diff === 'medium') {
      if (Math.random() < 0.55) {   // net → opposite face (pairs fixed by the cross layout)
        var faces = _shuffle(['1', '2', '3', '4', '5', '6']);
        /* cross layout: faces[0]=top [1]=left [2]=front [3]=right [4]=back [5]=bottom → pairs (0,5) (1,3) (2,4) */
        var PAIR = { 0: 5, 5: 0, 1: 3, 3: 1, 2: 4, 4: 2 };
        var i = _ri(0, 5), ans = faces[PAIR[i]];
        var m3 = _mcq(ans, faces.filter(function (f) { return f !== ans && f !== faces[i]; }), 4);
        return { question: 'The net shown is folded to form a cube. Which number will be on the face opposite ' + faces[i] + '?', figure: { kind: 'net', faces: faces }, options: m3.options, answer: m3.answer, subtype: 'medium:net', explanation: 'In a cross-shaped net, faces separated by one square fold to opposite sides. Here ' + faces[i] + ' folds opposite ' + ans + '; the four squares in between wrap around as its neighbours.' };
      }
      var a = _ri(1, 6), b = _ri(1, 6), pool = []; for (var x = 2; x <= 12; x++) pool.push(String(x));
      var m4 = _mcq((7 - a) + (7 - b), pool, 4);
      return { question: 'Two standard dice show ' + a + ' and ' + b + ' on top. What is the total of the numbers on their two bottom faces?', figure: { kind: 'row', items: [{ kind: 'die', value: a }, { kind: 'die', value: b }] }, options: m4.options, answer: m4.answer, subtype: 'medium:twoDiceSum', explanation: 'Each bottom face is 7 minus its top face: (7 − ' + a + ') + (7 − ' + b + ') = ' + ((7 - a) + (7 - b)) + '.' };
    }
    /* hard: two positions of the SAME (non-standard) die → deduce the opposite face. */
    var vals = _shuffle([1, 2, 3, 4, 5, 6]);
    var pairs = [[vals[0], vals[1]], [vals[2], vals[3]], [vals[4], vals[5]]];   // the die's opposite pairs
    function opp(v) { for (var i = 0; i < 3; i++) { if (pairs[i][0] === v) return pairs[i][1]; if (pairs[i][1] === v) return pairs[i][0]; } return null; }
    var X = _pick(vals);
    var nbr = vals.filter(function (v) { return v !== X && v !== opp(X); });   // X's four neighbours
    nbr = _shuffle(nbr);
    function view(showX, n1, n2) { var arr = _shuffle([showX, n1, n2]); return { kind: 'die3', top: arr[0], front: arr[1], right: arr[2] }; }
    var v1 = view(X, nbr[0], nbr[1]), v2 = view(X, nbr[2], nbr[3]);
    var mH = _mcq(opp(X), nbr, 4);
    return { question: 'The same die is shown in two different positions. Which number lies on the face opposite ' + X + '?', figure: { kind: 'row', items: [v1, v2] }, options: mH.options, answer: mH.answer, subtype: 'hard:twoPos', explanation: 'Across the two positions, the numbers ' + nbr.join(', ') + ' all appear on faces touching ' + X + ' — so they are its neighbours. The only number never seen next to ' + X + ' is ' + opp(X) + ', which must be opposite it.' };
  }

  /* ─────────────────────────── painted cube / cuboid ─────────────────────────── */

  function _paintTypes(n) {
    return [
      { k: 'exactly two faces painted', f: 12 * (n - 2) },
      { k: 'exactly one face painted', f: 6 * (n - 2) * (n - 2) },
      { k: 'no face painted', f: (n - 2) * (n - 2) * (n - 2) },
      { k: 'exactly three faces painted', f: 8 }
    ];
  }
  function _cubePaint(diff, n, key) {
    var types = _paintTypes(n);
    if (diff !== 'easy' && Math.random() < 0.3) types.push({ k: 'at least one face painted', f: n * n * n - (n - 2) * (n - 2) * (n - 2) });
    var t = _pick(types), ans = t.f;
    var pool = [ans, 8, 12 * (n - 2), 6 * (n - 2) * (n - 2), (n - 2) * (n - 2) * (n - 2), n * n * n - (n - 2) * (n - 2) * (n - 2), n * n * n, 6 * n].filter(function (v, i, a) { return v >= 0 && a.indexOf(v) === i; });
    var m = _mcq(ans, pool.map(String), 4);
    var stem = _pick([
      'A cube is painted on all its faces and cut into ' + n + '×' + n + '×' + n + ' = ' + (n * n * n) + ' identical small cubes. How many small cubes have ' + t.k + '?',
      'A solid cube is painted red on every face, then sliced into ' + (n * n * n) + ' equal small cubes (' + n + ' along each edge). How many of them have ' + t.k + '?'
    ]);
    return { question: stem, figure: { kind: 'cube', n: n }, options: m.options, answer: m.answer, subtype: diff + ':' + key, explanation: 'Corners (3 painted faces) = 8; edge cubes (2 faces) = 12×(n−2); face-centre cubes (1 face) = 6×(n−2)²; hidden inner cubes = (n−2)³, with n = ' + n + '.' };
  }
  function _genCube(diff) {
    if (diff === 'easy') return _cubePaint('easy', 3, 'paint3');
    if (diff === 'medium') return _cubePaint('medium', _pick([4, 6]), 'paint');
    if (Math.random() < 0.5) return _cubePaint('hard', _pick([5, 7]), 'paint5');
    /* cuboid painting — three distinct dimensions, the real discriminator */
    var dims = _pickN([3, 4, 5, 6], 3).sort(function (x, y) { return x - y; });
    var a = dims[0], b = dims[1], c = dims[2];
    var types = [
      { k: 'exactly three faces painted', f: 8 },
      { k: 'exactly two faces painted', f: 4 * ((a - 2) + (b - 2) + (c - 2)) },
      { k: 'exactly one face painted', f: 2 * ((a - 2) * (b - 2) + (b - 2) * (c - 2) + (a - 2) * (c - 2)) },
      { k: 'no face painted', f: (a - 2) * (b - 2) * (c - 2) }
    ];
    var t = _pick(types);
    var pool = types.map(function (x) { return x.f; })
      .concat([a * b * c, 8, 12, t.f + 2, t.f + 4, Math.max(0, t.f - 2), 4 * (a + b + c) - 24])
      .filter(function (v, i, arr) { return v >= 0 && arr.indexOf(v) === i; });
    var m = _mcq(t.f, pool.map(String), 4);
    return { question: 'A cuboid measuring ' + a + ' × ' + b + ' × ' + c + ' units is painted on all faces and cut into unit cubes. How many unit cubes have ' + t.k + '?', figure: { kind: 'cube', n: 3 }, options: m.options, answer: m.answer, subtype: 'hard:cuboid', explanation: 'For an a×b×c cuboid: corners = 8; edges (2 faces) = 4[(a−2)+(b−2)+(c−2)]; faces (1 face) = 2[(a−2)(b−2)+(b−2)(c−2)+(a−2)(c−2)]; inner = (a−2)(b−2)(c−2).' };
  }

  /* ─────────────────────────── figure series ─────────────────────────── */

  /* state = { at, count, fill } rendered as a compo. Rules move `at` around ORDER8, change count, cycle fill. */
  function _stateFig(outer, st) {
    var fig = _compoCount(outer, st.count, st.fill);
    fig.inner = (COUNT_AT[st.count] || ['c']).map(function (_, i) {
      /* single-dot states track position; multi-dot states use the fixed count layout */
      return st.count === 1 ? { form: 'dot', at: st.at } : { form: 'dot', at: COUNT_AT[st.count][i] };
    });
    return fig;
  }
  function _seriesQ(outer, states, nextState, distractStates, subtype, expl, stem) {
    var seq = states.map(function (s) { return _stateFig(outer, s); });
    var figs = [_stateFig(outer, nextState)].concat(distractStates.map(function (s) { return _stateFig(outer, s); }));
    if (!_distinct(figs)) return null;
    var o = _figOptions(figs);
    return { question: stem, figure: { kind: 'row', items: seq.concat([{ kind: 'qmark' }]) }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: subtype, explanation: expl };
  }
  function _genFSeries(diff) {
    var outer = _ringPick('fs-outer', OUTERS);
    var stem = _pick(['Which figure should come next in the series, in place of the question mark?', 'Study the series and pick the figure that continues it.', 'Select the figure that will replace the question mark in the series.', 'The figures follow a pattern. Which option comes next?']);
    if (diff === 'easy') {
      if (Math.random() < 0.55) {   // constant position step
        var k = _pick([1, 2]), start = _ri(0, 7);
        var sts = [0, 1, 2, 3].map(function (i) { return { at: ORDER8[(start + i * k) % 8], count: 1, fill: 'none' }; });
        var nxt = { at: ORDER8[(start + 4 * k) % 8], count: 1, fill: 'none' };
        var q = _seriesQ(outer, sts, nxt, [
          { at: ORDER8[(start + 5 * k) % 8], count: 1, fill: 'none' },
          { at: ORDER8[(start + 3 * k) % 8], count: 1, fill: 'none' },
          { at: ORDER8[(start + 4 * k + 4) % 8], count: 1, fill: 'none' }
        ], 'easy:pos', 'The dot moves ' + (k === 1 ? 'one step' : 'two steps') + ' clockwise around the ' + outer + ' each time, so it continues to the next position.', stem);
        if (q) return q;
      }
      var up = Math.random() < 0.6, c0 = up ? 1 : 5;
      var stsC = [0, 1, 2, 3].map(function (i) { return { at: 'c', count: c0 + (up ? i : -i), fill: 'none' }; });
      var nxtC = { at: 'c', count: c0 + (up ? 4 : -4), fill: 'none' };
      /* distractors stay in the renderable 1..6 range: stale count, overshoot, and a shaded twin as backstop */
      var dC = [
        { at: 'c', count: stsC[3].count, fill: 'none' },
        { at: 'c', count: up ? nxtC.count + 1 : nxtC.count + 2, fill: 'none' },
        { at: 'c', count: nxtC.count, fill: 'solid' }
      ];
      var qC = _seriesQ(outer, stsC, nxtC, dC, 'easy:count', 'The number of dots ' + (up ? 'increases' : 'decreases') + ' by one in every figure of the series.', stem);
      if (qC) return qC;
      return _genFSeries(diff);
    }
    if (diff === 'medium') {
      if (Math.random() < 0.5) {   // position step + alternating shading
        var k2 = _pick([1, 2, 3]), s2 = _ri(0, 7);
        var stsS = [0, 1, 2, 3].map(function (i) { return { at: ORDER8[(s2 + i * k2) % 8], count: 1, fill: i % 2 ? 'solid' : 'none' }; });
        var nxtS = { at: ORDER8[(s2 + 4 * k2) % 8], count: 1, fill: 'none' };
        var qS = _seriesQ(outer, stsS, nxtS, [
          { at: nxtS.at, count: 1, fill: 'solid' },                                 // right position, wrong shading
          { at: ORDER8[(s2 + 5 * k2) % 8], count: 1, fill: 'none' },                // one step too far
          { at: ORDER8[(s2 + 3 * k2) % 8], count: 1, fill: 'solid' }                // previous position
        ], 'medium:posShade', 'Two things change together: the dot advances ' + k2 + ' step(s) clockwise every time, while the shading alternates. The next figure must satisfy BOTH rules.', stem);
        if (qS) return qS;
      }
      var k3 = 3, s3 = _ri(0, 7);   // larger rotation step (135°)
      var sts3 = [0, 1, 2, 3].map(function (i) { return { at: ORDER8[(s3 + i * k3) % 8], count: 1, fill: 'none' }; });
      var nxt3 = { at: ORDER8[(s3 + 4 * k3) % 8], count: 1, fill: 'none' };
      var q3 = _seriesQ(outer, sts3, nxt3, [
        { at: ORDER8[(s3 + 4 * k3 + 1) % 8], count: 1, fill: 'none' },
        { at: ORDER8[(s3 + 4 * k3 - 1 + 8) % 8], count: 1, fill: 'none' },
        { at: ORDER8[(s3 + 3 * k3) % 8], count: 1, fill: 'none' }
      ], 'medium:pos3', 'The dot jumps three positions (135°) clockwise each time — a longer step than it first appears. Track it around the shape.', stem);
      if (q3) return q3;
      return _genFSeries(diff);
    }
    /* hard: two simultaneous rules — position step AND count change */
    var k4 = _pick([1, 2]), s4 = _ri(0, 7), up4 = Math.random() < 0.5, c4 = up4 ? 1 : 5;
    /* multi-dot states lose the position marker, so track position via fill on a single dot + count via extra ring:
       keep it honest — use count states whose FIRST dot anchor also cycles. Simpler valid rule set: count changes
       AND shading cycles (none → solid → none…). */
    var sts4 = [0, 1, 2, 3].map(function (i) { return { at: 'c', count: c4 + (up4 ? i : -i), fill: i % 2 ? 'solid' : 'none' }; });
    var nxt4 = { at: 'c', count: c4 + (up4 ? 4 : -4), fill: 'none' };
    var q4 = _seriesQ(outer, sts4, nxt4, [
      { at: 'c', count: nxt4.count, fill: 'solid' },                                  // right count, wrong shading
      { at: 'c', count: sts4[3].count, fill: 'none' },                                // stale count
      { at: 'c', count: Math.min(6, Math.max(1, nxt4.count + (up4 ? 1 : -1))), fill: 'none' }
    ], 'hard:countShade', 'Two rules run at once: the dot count ' + (up4 ? 'rises' : 'falls') + ' by one every step AND the shading alternates. Options that satisfy only one rule are traps.', stem);
    if (q4) return q4;
    /* alternating position steps */
    var a1 = _pick([1, 2]), a2 = _pick([2, 3].filter(function (v) { return v !== a1; })), s5 = _ri(0, 7);
    var offs = [0, a1, a1 + a2, 2 * a1 + a2];
    var sts5 = offs.map(function (o) { return { at: ORDER8[(s5 + o) % 8], count: 1, fill: 'none' }; });
    var nxt5 = { at: ORDER8[(s5 + 2 * a1 + 2 * a2) % 8], count: 1, fill: 'none' };
    var q5 = _seriesQ(outer, sts5, nxt5, [
      { at: ORDER8[(s5 + 2 * a1 + 2 * a2 + a1) % 8], count: 1, fill: 'none' },
      { at: ORDER8[(s5 + 2 * a1 + a2 + a1) % 8], count: 1, fill: 'none' },
      { at: ORDER8[(s5 + 2 * a1 + 2 * a2 + 4) % 8], count: 1, fill: 'none' }
    ], 'hard:altPos', 'The dot advances by ALTERNATING steps (' + a1 + ', then ' + a2 + ', then ' + a1 + '…). The next move is a ' + a2 + '-step jump.', stem);
    return q5 || _genFSeries('medium');
  }

  /* ─────────────────────────── figure analogy ─────────────────────────── */

  function _genFAnalogy(diff) {
    var outer = _ringPick('fa-outer', OUTERS);
    var stem = _pick(['The first figure is related to the second in a certain way. Which option relates to the third figure in the SAME way?', 'Select the figure that completes the analogy (first is to second as third is to ?).', 'The second figure follows from the first by a rule. Apply the same rule to the third figure and pick the result.']);
    if (diff === 'easy') {   // rotation of the marker position
      var k = _pick([2, 4, 6]), aAt = _ri(0, 7), cAt = _ri(0, 7);
      var A = _compoDot(outer, ORDER8[aAt]), B = _compoDot(outer, ORDER8[(aAt + k) % 8]);
      var outer2 = _pick(OUTERS.filter(function (f) { return f !== outer; }));
      var C = _compoDot(outer2, ORDER8[cAt]), ok = _compoDot(outer2, ORDER8[(cAt + k) % 8]);
      var figs = [ok, _compoDot(outer2, ORDER8[(cAt + k + 2) % 8]), _compoDot(outer2, ORDER8[cAt]), _compoDot(outer2, ORDER8[(cAt - k + 8) % 8])];
      if (!_distinct(figs)) return _genFAnalogy(diff);
      var o = _figOptions(figs);
      return { question: stem, figure: { kind: 'row', items: [A, B, C, { kind: 'qmark' }] }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: 'easy:rot', explanation: 'From the first to the second figure the dot turns ' + (k * 45) + '° clockwise. Apply the same turn to the third figure.' };
    }
    if (diff === 'medium') {
      var mode = _pick(['reflect', 'count', 'shade']);
      if (mode === 'reflect') {
        var at1 = _pick(['tl', 'tr', 'bl', 'br']), atC = _pick(['tl', 'tr', 'bl', 'br']);
        var A2 = _compoDot(outer, at1), B2 = _compoDot(outer, MIR_AT[at1]);
        var o2f = _pick(OUTERS.filter(function (f) { return f !== outer; }));
        var C2 = _compoDot(o2f, atC), ok2 = _compoDot(o2f, MIR_AT[atC]);
        /* distractors: water reflection, unchanged, and the OPPOSITE corner (rot 180°) — for corner anchors a 90°
           rotation coincides with one of the reflections, which silently killed this archetype before ADR-093's audit */
        var figs2 = [ok2, _compoDot(o2f, WAT_AT[atC]), _compoDot(o2f, atC), _compoDot(o2f, _rotAt(atC, 4))];
        if (!_distinct(figs2)) return _genFAnalogy(diff);
        var o2 = _figOptions(figs2);
        return { question: stem, figure: { kind: 'row', items: [A2, B2, C2, { kind: 'qmark' }] }, options: o2.options, optionFigures: o2.optionFigures, answer: o2.answer, subtype: 'medium:reflect', explanation: 'The second figure is the MIRROR image of the first (left ↔ right) — not a rotation. Mirror the third figure the same way.' };
      }
      if (mode === 'count') {
        var c1 = _ri(1, 3), dlt = _pick([1, 2]), cC = _ri(1, 3);
        var A3 = _compoCount(outer, c1), B3 = _compoCount(outer, c1 + dlt);
        var o3f = _pick(OUTERS.filter(function (f) { return f !== outer; }));
        var C3 = _compoCount(o3f, cC), ok3 = _compoCount(o3f, cC + dlt);
        var figs3 = [ok3, _compoCount(o3f, cC), _compoCount(o3f, Math.min(6, cC + dlt + 1)), _compoCount(o3f, Math.max(1, cC - dlt + (cC - dlt === cC + dlt ? 1 : 0)))];
        if (!_distinct(figs3)) return _genFAnalogy(diff);
        var o3 = _figOptions(figs3);
        return { question: stem, figure: { kind: 'row', items: [A3, B3, C3, { kind: 'qmark' }] }, options: o3.options, optionFigures: o3.optionFigures, answer: o3.answer, subtype: 'medium:count', explanation: 'The rule adds ' + dlt + ' dot(s) from the first figure to the second. Add the same number to the third figure.' };
      }
      var at4 = _pick(['tl', 'tr', 'bl', 'br']), at4c = _pick(['tl', 'tr', 'bl', 'br']);
      var A4 = { kind: 'compo', outer: { form: outer, fill: 'none' }, inner: [{ form: 'dot', at: at4 }] };
      var B4 = { kind: 'compo', outer: { form: outer, fill: 'solid' }, inner: [{ form: 'dot', at: at4 }] };
      var o4f = _pick(OUTERS.filter(function (f) { return f !== outer; }));
      var C4 = { kind: 'compo', outer: { form: o4f, fill: 'none' }, inner: [{ form: 'dot', at: at4c }] };
      var ok4 = { kind: 'compo', outer: { form: o4f, fill: 'solid' }, inner: [{ form: 'dot', at: at4c }] };
      var figs4 = [ok4, C4, { kind: 'compo', outer: { form: o4f, fill: 'solid' }, inner: [{ form: 'dot', at: _rotAt(at4c, 2) }] }, { kind: 'compo', outer: { form: o4f, fill: 'half' }, inner: [{ form: 'dot', at: at4c }] }];
      if (!_distinct(figs4)) return _genFAnalogy(diff);
      var o4 = _figOptions(figs4);
      return { question: stem, figure: { kind: 'row', items: [A4, B4, C4, { kind: 'qmark' }] }, options: o4.options, optionFigures: o4.optionFigures, answer: o4.answer, subtype: 'medium:shade', explanation: 'The outline becomes fully shaded while everything else stays put. Shade the third figure the same way.' };
    }
    /* hard: combined rule (rotate marker + toggle shading) or inner/outer swap */
    if (Math.random() < 0.55) {
      var k5 = _pick([2, 3, 6]), a5 = _ri(0, 7), c5 = _ri(0, 7);
      var A5 = { kind: 'compo', outer: { form: outer, fill: 'none' }, inner: [{ form: 'dot', at: ORDER8[a5] }] };
      var B5 = { kind: 'compo', outer: { form: outer, fill: 'solid' }, inner: [{ form: 'dot', at: ORDER8[(a5 + k5) % 8] }] };
      var o5f = _pick(OUTERS.filter(function (f) { return f !== outer; }));
      var C5 = { kind: 'compo', outer: { form: o5f, fill: 'none' }, inner: [{ form: 'dot', at: ORDER8[c5] }] };
      var ok5 = { kind: 'compo', outer: { form: o5f, fill: 'solid' }, inner: [{ form: 'dot', at: ORDER8[(c5 + k5) % 8] }] };
      var figs5 = [ok5,
        { kind: 'compo', outer: { form: o5f, fill: 'none' }, inner: [{ form: 'dot', at: ORDER8[(c5 + k5) % 8] }] },   // rotated but not shaded
        { kind: 'compo', outer: { form: o5f, fill: 'solid' }, inner: [{ form: 'dot', at: ORDER8[c5] }] },             // shaded but not rotated
        { kind: 'compo', outer: { form: o5f, fill: 'solid' }, inner: [{ form: 'dot', at: ORDER8[(c5 - k5 + 8) % 8] }] }];
      if (!_distinct(figs5)) return _genFAnalogy(diff);
      var o5 = _figOptions(figs5);
      return { question: stem, figure: { kind: 'row', items: [A5, B5, C5, { kind: 'qmark' }] }, options: o5.options, optionFigures: o5.optionFigures, answer: o5.answer, subtype: 'hard:rotShade', explanation: 'TWO changes happen together: the dot turns ' + (k5 * 45) + '° clockwise AND the outline becomes shaded. Options applying only one change are traps.' };
    }
    var fo = _pick(OUTERS), fi = _pick(['triangle', 'square', 'circle', 'diamond'].filter(function (f) { return f !== fo; }));
    var A6 = { kind: 'compo', outer: { form: fo, fill: 'none' }, inner: [{ form: fi, at: 'c' }] };
    var B6 = { kind: 'compo', outer: { form: fi, fill: 'none' }, inner: [{ form: fo, at: 'c' }] };
    var go = _pick(OUTERS.filter(function (f) { return f !== fo && f !== fi; }));
    var gi = _pick(['triangle', 'square', 'circle', 'diamond', 'star'].filter(function (f) { return f !== go && f !== fo; }));
    var C6 = { kind: 'compo', outer: { form: go, fill: 'none' }, inner: [{ form: gi, at: 'c' }] };
    var ok6 = { kind: 'compo', outer: { form: gi, fill: 'none' }, inner: [{ form: go, at: 'c' }] };
    var figs6 = [ok6, C6, { kind: 'compo', outer: { form: gi, fill: 'solid' }, inner: [{ form: go, at: 'c' }] }, { kind: 'compo', outer: { form: go, fill: 'none' }, inner: [{ form: gi, at: 'tl' }] }];
    if (!_distinct(figs6)) return _genFAnalogy(diff);
    var o6 = _figOptions(figs6);
    return { question: stem, figure: { kind: 'row', items: [A6, B6, C6, { kind: 'qmark' }] }, options: o6.options, optionFigures: o6.optionFigures, answer: o6.answer, subtype: 'hard:swap', explanation: 'The inner and outer shapes trade places — the small shape grows into the outline and the outline shrinks inside it.' };
  }

  /* ─────────────────────────── odd figure out ─────────────────────────── */

  function _genOdd(diff) {
    var stem = _pick(['Three of the four figures are alike in a certain way. Select the one that is DIFFERENT.', 'Find the odd figure out.', 'Three figures share a common property. Choose the one that does not belong.']);
    if (diff === 'easy') {   // three share a dot count, one differs
      var outer = _ringPick('odd-outer', OUTERS);
      var c = _ri(2, 4), oddC = c + _pick([-1, 1]);
      var same = [_compoCount(outer, c), _compoCount(_pick(OUTERS.filter(function (f) { return f !== outer; })), c), _compoCount(_pick(OUTERS), c)];
      var figs = [_compoCount(_pick(OUTERS), oddC)].concat(same);
      if (!_distinct(figs)) return _genOdd(diff);
      var o = _figOptions(figs);
      return { question: stem, figure: null, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: 'easy:count', explanation: 'Count the dots: three figures contain ' + c + ' dots each; the odd one contains ' + oddC + '. The outer shapes are a distraction.' };
    }
    if (diff === 'medium') {   // three rotations of one composition, one with a different inner form
      var outerM = _ringPick('odd-outerM', OUTERS);
      var innerM = _pick(['triangle', 'square', 'star']);
      var start = _ri(0, 7), stepM = _pick([2, 3]);
      var mk = function (at, form) { return { kind: 'compo', outer: { form: outerM, fill: 'none' }, inner: [{ form: form, at: at }] }; };
      var sameM = [0, 1, 2].map(function (i) { return mk(ORDER8[(start + i * stepM) % 8], innerM); });
      var oddM = mk(ORDER8[(start + 3 * stepM) % 8], _pick(['circle', 'diamond'].filter(function (f) { return f !== innerM; })));
      var figsM = [oddM].concat(sameM);
      if (!_distinct(figsM)) return _genOdd(diff);
      var oM = _figOptions(figsM);
      return { question: stem, figure: null, options: oM.options, optionFigures: oM.optionFigures, answer: oM.answer, subtype: 'medium:form', explanation: 'Three figures carry the same inner shape (a ' + innerM + ') merely moved to different positions — rotations of one another. The odd figure hides a different shape inside.' };
    }
    /* hard: three rotations of a chiral line figure + one REFLECTION (the classic discrimination) */
    var segs = _chiralPath(_ri(4, 5));
    var rots = _pickN([0, 1, 2, 3], 3).map(function (r) { return _segFig(_segRot(segs, r)); });
    var oddH = _segFig(_segMirror(_segRot(segs, _ri(0, 3))));
    var figsH = [oddH].concat(rots);
    if (!_distinct(figsH)) return _genOdd(diff);
    var oH = _figOptions(figsH);
    return { question: stem, figure: null, options: oH.options, optionFigures: oH.optionFigures, answer: oH.answer, subtype: 'hard:reflect', explanation: 'Three options are the SAME figure merely rotated. The odd one is a mirror image — no amount of rotation can turn the original into it.' };
  }

  /* ─────────────────────────── paper folding ─────────────────────────── */

  var HOLE_POS = [0.2, 0.32, 0.68, 0.8];   // stay clear of fold lines (0.5) and the diagonal
  function _holeKey(holes) {
    return JSON.stringify(holes.map(function (h) { return [Math.round(h[0] * 100), Math.round(h[1] * 100)]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }));
  }
  function _unfoldV(h) { return [[h[0], h[1]], [1 - h[0], h[1]]]; }
  function _unfoldH(h) { return [[h[0], h[1]], [h[0], 1 - h[1]]]; }
  function _unfoldD(h) { return [[h[0], h[1]], [h[1], h[0]]]; }
  function _dedupeHoles(list) {
    var seen = {}, out = [];
    list.forEach(function (h) { var k = Math.round(h[0] * 100) + ',' + Math.round(h[1] * 100); if (!seen[k]) { seen[k] = 1; out.push(h); } });
    return out;
  }
  function _genPaper(diff) {
    var stem = 'A square sheet is folded as shown and holes are punched. How will it look when unfolded?';
    var fold, holes, correctHoles, wrongAxis, alsoWrong;
    if (diff === 'hard') {
      /* two folds: right half onto left, then bottom onto top → hole in the top-left quadrant unfolds to 4 holes */
      var hx = _pick([0.18, 0.3, 0.42]), hy = _pick([0.18, 0.3, 0.42]);
      holes = [[hx, hy]];
      correctHoles = [[hx, hy], [1 - hx, hy], [hx, 1 - hy], [1 - hx, 1 - hy]];
      wrongAxis = [[hx, hy], [1 - hx, hy]];                                   // forgot the second fold
      alsoWrong = [[hx, hy], [1 - hx, 1 - hy]];                               // diagonal-only ghost
      var figsH = [
        { kind: 'paper', holes: correctHoles },
        { kind: 'paper', holes: wrongAxis },
        { kind: 'paper', holes: alsoWrong },
        { kind: 'paper', holes: [[hx, hy], [hx, 1 - hy]] }
      ];
      if (!_distinct(figsH)) return _genPaper(diff);
      var oH = _figOptions(figsH);
      return {
        question: 'A square sheet is folded in half twice — right onto left, then bottom onto top — and one hole is punched. How does it look unfolded?',
        figure: { kind: 'row', items: [{ kind: 'paper', fold: 'v', folded: true, holes: [] }, { kind: 'paper', fold: ['v', 'h'], folded: true, holes: holes }] },
        options: oH.options, optionFigures: oH.optionFigures, answer: oH.answer, subtype: 'hard:fold2',
        explanation: 'Each fold doubles the punch when opened: one hole becomes two across the vertical crease, then those two become four across the horizontal crease — one in each quadrant, all mirror-placed.'
      };
    }
    if (diff === 'medium' && Math.random() < 0.45) {
      /* diagonal fold */
      var pairs = _pickN([[0.68, 0.2], [0.8, 0.32], [0.68, 0.32], [0.8, 0.2]], 1);
      holes = pairs;
      correctHoles = _dedupeHoles(holes.reduce(function (acc, h) { return acc.concat(_unfoldD(h)); }, []));
      var figsD = [
        { kind: 'paper', holes: correctHoles },
        { kind: 'paper', holes: _dedupeHoles(holes.reduce(function (acc, h) { return acc.concat(_unfoldV(h)); }, [])) },
        { kind: 'paper', holes: _dedupeHoles(holes.reduce(function (acc, h) { return acc.concat(_unfoldH(h)); }, [])) },
        { kind: 'paper', holes: holes.slice() }
      ];
      var keysD = figsD.map(function (f) { return _holeKey(f.holes); });
      if (keysD.some(function (k, i) { return keysD.indexOf(k) !== i; })) return _genPaper(diff);
      var oD = _figOptions(figsD);
      return {
        question: 'The sheet is folded along its diagonal and a hole is punched, as shown. Which option shows the unfolded sheet?',
        figure: { kind: 'paper', fold: 'd', folded: true, holes: holes },
        options: oD.options, optionFigures: oD.optionFigures, answer: oD.answer, subtype: 'medium:foldD',
        explanation: 'A diagonal fold reflects the punch ACROSS the diagonal: the hole at (x, y) gains a twin at (y, x). Left–right or top–bottom twins are the traps.'
      };
    }
    /* single straight fold; easy = 1 hole, medium = 2 holes */
    fold = _pick(['v', 'h']);
    var nHoles = diff === 'easy' ? 1 : 2;
    var used = {};
    holes = [];
    while (holes.length < nHoles) {
      var region = fold === 'v' ? [[_pick([0.18, 0.3, 0.42]), _pick(HOLE_POS)]] : [[_pick(HOLE_POS), _pick([0.18, 0.3, 0.42])]];
      var h = region[0], k = h.join(',');
      if (!used[k]) { used[k] = 1; holes.push(h); }
    }
    var unf = fold === 'v' ? _unfoldV : _unfoldH;
    correctHoles = _dedupeHoles(holes.reduce(function (acc, h) { return acc.concat(unf(h)); }, []));
    var wrongUnf = fold === 'v' ? _unfoldH : _unfoldV;
    var figs1 = [
      { kind: 'paper', holes: correctHoles },
      { kind: 'paper', holes: _dedupeHoles(holes.reduce(function (acc, h) { return acc.concat(wrongUnf(h)); }, [])) },   // wrong axis
      { kind: 'paper', holes: holes.slice() },                                                                            // forgot the reflection
      { kind: 'paper', holes: _dedupeHoles(holes.reduce(function (acc, h) { return acc.concat(_unfoldD(h)); }, [])) }     // diagonal ghost
    ];
    var keys1 = figs1.map(function (f) { return _holeKey(f.holes); });
    if (keys1.some(function (k, i) { return keys1.indexOf(k) !== i; })) return _genPaper(diff);
    var o1 = _figOptions(figs1);
    return {
      question: stem,
      figure: { kind: 'paper', fold: fold, folded: true, holes: holes },
      options: o1.options, optionFigures: o1.optionFigures, answer: o1.answer, subtype: (diff === 'easy' ? 'easy:fold1' : 'medium:fold1b'),
      explanation: 'Unfolding reflects every hole across the crease' + (fold === 'v' ? ' (left ↔ right)' : ' (top ↔ bottom)') + ': each punch appears twice, mirror-placed. Watch the reflection axis — it is the usual trap.'
    };
  }

  /* ─────────────────────────── matrix (pattern) completion ─────────────────────────── */

  function _genPattern(diff) {
    var stem = _pick(['Study the 3×3 matrix. Which figure completes it, in place of the question mark?', 'Each row of the matrix follows a rule. Select the figure that belongs in the empty cell.', 'Which option completes the figure matrix?']);
    var forms = _pickN(OUTERS, 3);
    var markers = _pickN(['dot', 'triangle', 'square'], 3);
    var start = _ri(0, 7), step = _pick([1, 2, 3]);
    /* every cell keeps ONE positioned marker so the across-row rotation is always visible; the row property is
       the outer form (easy), the marker's form (medium) or the outer shading (hard). */
    function cellFig(r, c, mode) {
      var at = ORDER8[(start + c * step) % 8];
      var outerForm = mode === 'medium' ? forms[0] : forms[r];
      var markerForm = mode === 'medium' ? markers[r] : 'dot';
      var outerFill = mode === 'hard' ? ['none', 'half', 'solid'][r] : 'none';
      return { kind: 'compo', outer: { form: outerForm, fill: outerFill }, inner: [{ form: markerForm, at: at }] };
    }
    var subtype, expl;
    if (diff === 'easy') { subtype = 'easy:rowRot'; expl = 'In every row the marker advances ' + step + ' position(s) clockwise from cell to cell; each row uses its own outer shape. Apply the same shift to the last row.'; }
    else if (diff === 'medium') { subtype = 'medium:rotForm'; expl = 'Two rules stack: across each row the marker advances ' + step + ' position(s) clockwise, and each ROW carries its own marker shape. The missing cell must obey both rules.'; }
    else { subtype = 'hard:rotShade'; expl = 'Across each row the marker advances ' + step + ' position(s); down the rows the shading of the outline deepens (plain → half → solid). The answer must satisfy the row rule AND the column rule.'; }
    var cells = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) cells.push(cellFig(r, c, diff));
    var correct = cells[8];
    cells[8] = null;
    /* distractors: wrong column position / a neighbouring row's property / both wrong */
    var dPos = cellFig(2, 1, diff);
    var dRow = cellFig(1, 2, diff);
    var dMix = cellFig(diff === 'easy' ? 0 : 1, diff === 'easy' ? 0 : 1, diff);
    var figs = [correct, dPos, dRow, dMix];
    if (!_distinct(figs)) return _genPattern(diff);
    var o = _figOptions(figs);
    return { question: stem, figure: { kind: 'grid3', cells: cells }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: subtype, explanation: expl };
  }

  /* ─────────────────────────── embedded figures ─────────────────────────── */

  function _extendHost(motif, extras, forbid) {
    var host = motif.slice(), used = {};
    host.forEach(function (s) { used[_segKey([s])] = 1; });
    (forbid || []).forEach(function (s) { used[_segKey([s])] = 1; });   // never re-absorb a forbidden segment
    var guard = 0;
    while (host.length < motif.length + extras && guard++ < 120) {
      var s = _pick(host);
      var px = _pick([s[0], s[2]]), py = px === s[0] ? s[1] : s[3];
      var dirs = _shuffle([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
      for (var d = 0; d < dirs.length; d++) {
        var nx = px + dirs[d][0], ny = py + dirs[d][1];
        if (nx < 0 || nx > 3 || ny < 0 || ny > 3) continue;
        var k = _segKey([[px, py, nx, ny]]);
        if (used[k]) continue;
        used[k] = 1; host.push([px, py, nx, ny]); break;
      }
    }
    return host;
  }
  /* the motif segments a perturbed copy no longer carries — a distractor host must never re-acquire them */
  function _missingSegs(motif, perturbed) {
    var pk = {}; _segNorm(perturbed).forEach(function (s) { pk[JSON.stringify(s)] = 1; });
    return _segNorm(motif).filter(function (s) { return !pk[JSON.stringify(s)]; });
  }
  function _perturbMotif(motif) {
    for (var t = 0; t < 40; t++) {
      var out = motif.map(function (s) { return s.slice(); });
      var i = _ri(0, out.length - 1), end = _pick([0, 2]);
      var dx = _pick([-1, 0, 1]), dy = _pick([-1, 0, 1]);
      if (!dx && !dy) continue;
      var nx = out[i][end] + dx, ny = out[i][end + 1] + dy;
      if (nx < 0 || nx > 3 || ny < 0 || ny > 3) continue;
      out[i][end] = nx; out[i][end + 1] = ny;
      if (out[i][0] === out[i][2] && out[i][1] === out[i][3]) continue;   // degenerate
      if (_segKey(out) !== _segKey(motif)) return out;
    }
    return null;
  }
  function _genEmbedded(diff) {
    for (var attempt = 0; attempt < 30; attempt++) {
      var motifLen = diff === 'easy' ? 3 : 4;
      var extras = diff === 'easy' ? 3 : diff === 'medium' ? 4 : 5;
      var motif = _segPath(motifLen);
      var correctHost = _extendHost(motif, extras);
      var hosts = [correctHost];
      var okAll = true;
      for (var i = 0; i < 3; i++) {
        var pm = _perturbMotif(motif);
        if (!pm) { okAll = false; break; }
        var host = _extendHost(pm, extras, _missingSegs(motif, pm));
        if (_segSubset(motif, host)) { okAll = false; break; }   // belt-and-braces (the forbid list already prevents this)
        hosts.push(host);
      }
      if (!okAll) continue;
      var figs = hosts.map(function (h) { return _segFig(h); });
      if (!_distinct(figs)) continue;
      var o = _figOptions(figs);
      return {
        question: _pick(['The simple figure at the top is hidden inside exactly one of the four options. Which option contains it?', 'Select the option in which the given figure is embedded (same size, same orientation).']),
        figure: _segFig(motif), options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':embed',
        explanation: 'Look for the exact lines of the small figure — same lengths, same slants, same corners — buried inside one option. The other options alter one of its lines slightly, so the match fails.'
      };
    }
    /* graceful degradation — never strand the drill */
    return _genOdd(diff);
  }

  /* ─────────────────────────── registry ─────────────────────────── */

  var CATEGORY_LABELS = {
    'lr-mirror': 'Mirror Images', 'lr-water': 'Water Images', 'lr-dice': 'Dice',
    'lr-cube': 'Painted Cube', 'lr-fseries': 'Figure Series', 'lr-fanalogy': 'Figure Analogy',
    'lr-odd-fig': 'Odd Figure Out', 'lr-paper': 'Paper Folding', 'lr-pattern': 'Pattern Completion',
    'lr-embedded': 'Embedded Figures'
  };
  var GEN = {
    'lr-mirror': _genMirror, 'lr-water': _genWater, 'lr-dice': _genDice, 'lr-cube': _genCube,
    'lr-fseries': _genFSeries, 'lr-fanalogy': _genFAnalogy, 'lr-odd-fig': _genOdd,
    'lr-paper': _genPaper, 'lr-pattern': _genPattern, 'lr-embedded': _genEmbedded
  };

  function generate(category, difficulty) {
    var diff = _difficulty(difficulty);
    if (diff !== 'easy' && diff !== 'medium' && diff !== 'hard') diff = 'medium';
    var fn = GEN[category] || _genMirror;
    var q = fn(diff); q.category = category; return q;
  }

  var generators = {};
  Object.keys(CATEGORY_LABELS).forEach(function (cat) { generators[cat] = function () { return generate(cat); }; });
  function registerInto(map) { if (!map) return; Object.keys(generators).forEach(function (k) { map[k] = generators[k]; }); }
  try { if (typeof categoryGenerators !== 'undefined' && categoryGenerators) registerInto(categoryGenerators); } catch (_) {}

  var LRVisualEngine = {
    CATEGORY_LABELS: CATEGORY_LABELS,
    categories: function () { return Object.keys(CATEGORY_LABELS); },
    label: function (c) { return CATEGORY_LABELS[c] || c; },
    generate: generate, generators: generators, registerInto: registerInto,
    /* pure internals exposed for the check harness (spec-level recompute) */
    _t: { segMirror: _segMirror, segWater: _segWater, segRot: _segRot, segKey: _segKey, segChiral: _segChiral, segSubset: _segSubset, rotAt: _rotAt, MIR_AT: MIR_AT, WAT_AT: WAT_AT, ORDER8: ORDER8 }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LRVisualEngine;
  if (typeof window !== 'undefined') window.LRVisualEngine = LRVisualEngine;
  else root.LRVisualEngine = LRVisualEngine;
})(this);
