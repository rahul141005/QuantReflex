/**
 * lr-visual-engine.js — the generative VISUAL reasoning engine (ADR-079, partial/deterministic scope).
 *
 * Builds non-verbal LR questions that can be generated AND auto-validated deterministically — mirror images, water
 * images, dice, painted cubes, figure series and figure analogy — each rendered by js/ui/lr-figures.js. Like the other
 * LR engines it self-registers into questions.js's `categoryGenerators`, so Practice/Stats/QuanAI reuse the pipeline.
 *
 * A visual MCQ carries `figure` (the prompt, rendered above the stem) and, when the choices are pictures,
 * `optionFigures` (parallel to `options`; the drill engine renders each inside its option button). The token in
 * `options`/`answer` is what the grader compares — so grading stays identical to text MCQ.
 *
 * The deferred authored-art topics (paper folding/cutting, embedded figures) plug into the SAME `lr-figures` renderer
 * later with no redesign. PURE + dual-exported.
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

  /* picture-option MCQ: figs[0] is the correct figure; returns {options(tokens), optionFigures, answer} shuffled. */
  function _figOptions(figs) {
    var order = _shuffle(figs.map(function (_, i) { return i; }));
    var optionFigures = order.map(function (i) { return figs[i]; });
    var options = optionFigures.map(function (_, i) { return String(i + 1); });
    return { options: options, optionFigures: optionFigures, answer: options[order.indexOf(0)] };
  }

  /* asymmetric glyphs only — so none / mirror / water / 180° are four VISUALLY DISTINCT figures (no symmetry trap) */
  var GLYPHS = { easy: ['F', 'G', 'P', 'R'], medium: ['J', 'L', 'Q'], hard: ['4', '7'] };
  var GLYPH_POOL = ['F', 'G', 'P', 'R', 'J', 'L', 'Q', '4', '7'];
  function _glyph(c, t) { return t === 'h' ? { kind: 'glyph', text: c, flip: 'h' } : t === 'v' ? { kind: 'glyph', text: c, flip: 'v' } : t === 'r' ? { kind: 'glyph', text: c, rot: 180 } : { kind: 'glyph', text: c, flip: 'none' }; }

  /* Difficulty is EARNED by reasoning, not by a trickier glyph: easy is a single character (orientation only); medium
     (2) and hard (3) are STRINGS — a real mirror reverses glyph ORDER and flips each glyph; a water image flips each
     glyph but keeps the order. The order-reversal step is the added reasoning, and it is the classic exam trap. */
  function _mirrorLike(diff, axis, key) {
    var what = axis === 'h' ? 'mirror image (as seen in a vertical mirror, left ↔ right)' : 'water image (as seen reflected in water, top ↔ bottom)';
    if (diff === 'easy') {
      var g = _pick(GLYPHS.easy);
      var figs1 = [_glyph(g, axis), _glyph(g, 'none'), _glyph(g, axis === 'h' ? 'v' : 'h'), _glyph(g, 'r')];
      var o1 = _figOptions(figs1);
      return { question: 'The figure at the top shows a character. Choose its correct ' + what + '.', figure: _glyph(g, 'none'), options: o1.options, optionFigures: o1.optionFigures, answer: o1.answer, subtype: 'easy:' + key };
    }
    var n = diff === 'medium' ? 2 : 3, gs = _pickN(GLYPH_POOL, n);
    var plain = gs.map(function (c) { return _glyph(c, 'none'); });
    var correct, dA, dB;
    if (axis === 'h') {                                            // mirror: reverse order + flip each
      correct = gs.slice().reverse().map(function (c) { return _glyph(c, 'h'); });
      dA = gs.map(function (c) { return _glyph(c, 'h'); });        // flipped but NOT reversed (the trap)
      dB = gs.slice().reverse().map(function (c) { return _glyph(c, 'none'); }); // reversed but not flipped
    } else {                                                       // water: flip each, keep order
      correct = gs.map(function (c) { return _glyph(c, 'v'); });
      dA = gs.slice().reverse().map(function (c) { return _glyph(c, 'v'); });   // flipped AND wrongly reversed
      dB = gs.map(function (c) { return _glyph(c, 'h'); });        // wrong axis
    }
    var figs = [{ kind: 'row', items: correct }, { kind: 'row', items: dA }, { kind: 'row', items: dB }, { kind: 'row', items: plain.slice() }];
    var o = _figOptions(figs);
    return { question: 'The figures at the top spell a short string. Choose its correct ' + what + '.', figure: { kind: 'row', items: plain }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':' + key };
  }

  function _genMirror(diff) { return _mirrorLike(diff, 'h', 'mirror'); }
  function _genWater(diff) { return _mirrorLike(diff, 'v', 'water'); }

  /* Difficulty is EARNED by the reasoning step, not the figure: easy = opposite face (one complement); medium = sum of
     the five hidden faces (uses "1..6 total 21"); hard = two dice, sum of both bottom faces (two complements). */
  function _genDice(diff) {
    if (diff === 'easy') {
      var top = _ri(1, 6);
      var m = _mcq(7 - top, ['1', '2', '3', '4', '5', '6'], 4);
      return { question: 'A standard die is shown (numbers on opposite faces always add up to 7). Which number lies on the face OPPOSITE the one shown on top?', figure: { kind: 'die', value: top }, options: m.options, answer: m.answer, subtype: 'easy:dice' };
    }
    if (diff === 'medium') {
      var t2 = _ri(1, 6);
      var m2 = _mcq(21 - t2, ['15', '16', '17', '18', '19', '20'], 4);
      return { question: 'A standard die shows ' + t2 + ' on top (its six faces are numbered 1 to 6). What is the SUM of the numbers on the other five faces?', figure: { kind: 'die', value: t2 }, options: m2.options, answer: m2.answer, subtype: 'medium:dice' };
    }
    var a = _ri(1, 6), b = _ri(1, 6), pool = []; for (var x = 2; x <= 12; x++) pool.push(String(x));
    var m3 = _mcq((7 - a) + (7 - b), pool, 4);
    return { question: 'Two standard dice are shown. They show ' + a + ' and ' + b + ' on their top faces. What is the SUM of the numbers on their two BOTTOM faces?', figure: { kind: 'row', items: [{ kind: 'die', value: a }, { kind: 'die', value: b }] }, options: m3.options, answer: m3.answer, subtype: 'hard:dice' };
  }

  function _genCube(diff) {
    var n = diff === 'easy' ? 3 : diff === 'medium' ? 4 : 5;
    var types = [
      { k: 'exactly TWO faces painted', f: 12 * (n - 2) },
      { k: 'exactly ONE face painted', f: 6 * (n - 2) * (n - 2) },
      { k: 'NO face painted', f: (n - 2) * (n - 2) * (n - 2) },
      { k: 'exactly THREE faces painted', f: 8 }
    ];
    var t = _pick(types), ans = t.f;
    var pool = [ans, 8, 12 * (n - 2), 6 * (n - 2) * (n - 2), (n - 2) * (n - 2) * (n - 2), n * n * n, 6 * n, 12 * n].filter(function (v, i, a) { return v >= 0 && a.indexOf(v) === i; });
    var m = _mcq(ans, pool.map(String), 4);
    return { question: 'A cube is painted on all six faces and then cut into ' + n + '×' + n + '×' + n + ' = ' + (n * n * n) + ' identical small cubes. How many of the small cubes have ' + t.k + '?', figure: { kind: 'cube', n: n }, options: m.options, answer: m.answer, subtype: diff + ':cube' };
  }

  var ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
  function _arrowFigOptions(correctRot) {
    var figs = [{ kind: 'arrow', rot: correctRot }];
    var distract = _pickN(ANGLES.filter(function (a) { return a !== correctRot; }), 3);
    distract.forEach(function (a) { figs.push({ kind: 'arrow', rot: a }); });
    return _figOptions(figs);
  }

  /* easy/medium = a CONSTANT turn; hard = an ALTERNATING two-step turn (a genuinely harder pattern to spot — not just
     a wider angle). Both stay deterministic and single-answer. */
  function _genFSeries(diff) {
    var base = _ri(0, 7) * 45;
    if (diff === 'hard') {
      var s1 = _pick([45, 90, 135]), s2 = _pick([45, 90, 135].filter(function (v) { return v !== s1; }));
      var rots = [base, base + s1, base + s1 + s2, base + 2 * s1 + s2];   // steps between: s1, s2, s1 → next step s2
      var next = base + 2 * s1 + 2 * s2;
      var seqH = rots.map(function (r) { return { kind: 'arrow', rot: ((r % 360) + 360) % 360 }; });
      var oH = _arrowFigOptions(((next % 360) + 360) % 360);
      return { question: 'The figures turn by ALTERNATING angles. Find the figure that comes next in place of the question mark.', figure: { kind: 'row', items: seqH.concat([{ kind: 'qmark' }]) }, options: oH.options, optionFigures: oH.optionFigures, answer: oH.answer, subtype: 'hard:fseries' };
    }
    var step = _pick(diff === 'easy' ? [90] : [45, 90, 135]);
    var seq = [0, 1, 2, 3].map(function (i) { return { kind: 'arrow', rot: (base + i * step) % 360 }; });
    var o = _arrowFigOptions((base + 4 * step) % 360);
    return { question: 'Each figure in the series turns by the same angle. Find the figure that comes next in place of the question mark.', figure: { kind: 'row', items: seq.concat([{ kind: 'qmark' }]) }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':fseries' };
  }

  /* easy/medium = a rotation analogy (single, unambiguous turn). hard = a REFLECTION analogy on an asymmetric glyph,
     where the transformation TYPE (mirror vs rotation) must be read — and the answer map is unique (a single example
     pins the result even though the verbal description could vary). Deliberately NOT a rotation-vs-reflection arrow
     analogy, which would be ambiguous from one example. */
  function _genFAnalogy(diff) {
    if (diff === 'hard') {
      var g1 = _pick(GLYPH_POOL), g2 = _pick(GLYPH_POOL.filter(function (x) { return x !== g1; })), axis = _pick(['h', 'v']);
      var figsG = [_glyph(g2, axis), _glyph(g2, axis === 'h' ? 'v' : 'h'), _glyph(g2, 'r'), _glyph(g2, 'none')];
      var oG = _figOptions(figsG);
      return { question: 'In the first pair the figure is transformed to get the second. Apply the SAME transformation to the third figure (A : B :: C : ?).', figure: { kind: 'row', items: [_glyph(g1, 'none'), _glyph(g1, axis), _glyph(g2, 'none'), { kind: 'qmark' }] }, options: oG.options, optionFigures: oG.optionFigures, answer: oG.answer, subtype: 'hard:fanalogy' };
    }
    var k = _pick(diff === 'easy' ? [90, 180] : [45, 90, 135, 270]);
    var a = _ri(0, 7) * 45, c = _ri(0, 7) * 45;
    var A = { kind: 'arrow', rot: a }, B = { kind: 'arrow', rot: (a + k) % 360 }, C = { kind: 'arrow', rot: c };
    var o = _arrowFigOptions((c + k) % 360);
    return { question: 'In the first pair, the figure is turned by a fixed angle to get the second. Apply the SAME change to the third figure (A : B :: C : ?).', figure: { kind: 'row', items: [A, B, C, { kind: 'qmark' }] }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':fanalogy' };
  }

  var CATEGORY_LABELS = {
    'lr-mirror': 'Mirror Images', 'lr-water': 'Water Images', 'lr-dice': 'Dice',
    'lr-cube': 'Cubes', 'lr-fseries': 'Figure Series', 'lr-fanalogy': 'Figure Analogy'
  };
  var GEN = { 'lr-mirror': _genMirror, 'lr-water': _genWater, 'lr-dice': _genDice, 'lr-cube': _genCube, 'lr-fseries': _genFSeries, 'lr-fanalogy': _genFAnalogy };

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
    generate: generate, generators: generators, registerInto: registerInto
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LRVisualEngine;
  if (typeof window !== 'undefined') window.LRVisualEngine = LRVisualEngine;
  else root.LRVisualEngine = LRVisualEngine;
})(this);
