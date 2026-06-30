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

  function _mirrorLike(diff, axis, key) {
    var g = _pick(GLYPHS[diff] || GLYPHS.medium);
    var figs = [
      { kind: 'glyph', text: g, flip: axis },                 // [0] correct
      { kind: 'glyph', text: g, flip: 'none' },
      { kind: 'glyph', text: g, flip: axis === 'h' ? 'v' : 'h' },
      { kind: 'glyph', text: g, rot: 180 }
    ];
    var o = _figOptions(figs);
    var what = axis === 'h' ? 'mirror image (as seen in a vertical mirror, left ↔ right)' : 'water image (as seen reflected in water, top ↔ bottom)';
    return { question: 'The figure at the top shows a character. Choose its correct ' + what + '.', figure: { kind: 'glyph', text: g, flip: 'none' }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':' + key };
  }

  function _genMirror(diff) { return _mirrorLike(diff, 'h', 'mirror'); }
  function _genWater(diff) { return _mirrorLike(diff, 'v', 'water'); }

  function _genDice(diff) {
    var top = _ri(1, 6), bottom = 7 - top;
    var m = _mcq(bottom, ['1', '2', '3', '4', '5', '6'], 4);
    return { question: 'A standard die is shown (the numbers on opposite faces always add up to 7). Which number lies on the face OPPOSITE to the one shown on top?', figure: { kind: 'die', value: top }, options: m.options, answer: m.answer, subtype: diff + ':dice' };
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

  function _genFSeries(diff) {
    var step = _pick(diff === 'easy' ? [90] : diff === 'medium' ? [45, 90] : [45, 135]);
    var base = _ri(0, 7) * 45;
    var seq = [0, 1, 2, 3].map(function (i) { return { kind: 'arrow', rot: (base + i * step) % 360 }; });
    var nextRot = (base + 4 * step) % 360;
    var o = _arrowFigOptions(nextRot);
    return { question: 'Each figure in the series turns by the same angle. Find the figure that comes next in place of the question mark.', figure: { kind: 'row', items: seq.concat([{ kind: 'qmark' }]) }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':fseries' };
  }

  function _genFAnalogy(diff) {
    var k = _pick(diff === 'easy' ? [90, 180] : [45, 90, 135, 270]);
    var a = _ri(0, 7) * 45, c = _ri(0, 7) * 45;
    var A = { kind: 'arrow', rot: a }, B = { kind: 'arrow', rot: (a + k) % 360 }, C = { kind: 'arrow', rot: c };
    var ansRot = (c + k) % 360;
    var o = _arrowFigOptions(ansRot);
    return { question: 'In the first pair, the figure is turned by a fixed angle to get the second. Apply the SAME change to the third figure and choose the result (A : B :: C : ?).', figure: { kind: 'row', items: [A, B, C, { kind: 'qmark' }] }, options: o.options, optionFigures: o.optionFigures, answer: o.answer, subtype: diff + ':fanalogy' };
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
