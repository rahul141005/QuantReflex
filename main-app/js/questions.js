/**
 * questions.js — Random question generator with difficulty scaling
 *
 * Categories:
 *   squares, cubes, fractions-to-percent, percentage-calculations,
 *   mental-multiplication, ratios, averages, area, volume, profit-loss, time-speed-distance,
 *   time-and-work, simplification, number-series
 *
 * Each generator returns { question: string, answer: number|string, category: string }
 *
 * Difficulty levels: easy, medium, hard
 * Difficulty is read from settings at generation time.
 */

/* ---- helpers ---- */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

var PI = 3.14;

/* Server-safe difficulty override. When set (by generateQuestions/generateMultiTopic) _getDifficulty returns it
   directly — no DOM/AppState/AdaptiveState reads — so api/duel.js can require this module and generate at a chosen
   difficulty server-side. Stays null on the client except while an explicit-difficulty call is in flight. */
var _difficultyOverride = null;

/** Get current difficulty from settings (or adaptive override if set) */
function _getDifficulty() {
  if (_difficultyOverride) return _difficultyOverride;
  var adaptiveOverride = (typeof AdaptiveState !== 'undefined')
    ? AdaptiveState.getDifficulty()
    : (typeof window !== 'undefined' ? window._adaptiveOverrideDifficulty : null);
  if (adaptiveOverride) return adaptiveOverride;
  try {
    var s = (typeof AppState !== 'undefined')
      ? AppState.getSettings()
      : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
    var selectedDifficulty = s.difficulty || 'medium';
    if (selectedDifficulty === 'hard' && typeof canAccessFeature === 'function' && !canAccessFeature('hard_mode')) {
      return 'medium';
    }
    return selectedDifficulty;
  } catch (_) { return 'medium'; }
}

/**
 * Get adaptive hint from pre-fetched AI session pattern.
 * Returns an object {type, logic} or null if not available.
 * type: 'direct' | 'inverse' | 'multi-step' | 'application' | 'estimation'
 * logic: array of sub-type descriptors to bias generation toward
 */
function _getAdaptiveHint() {
  try {
    var pattern = (typeof AdaptiveState !== 'undefined')
      ? AdaptiveState.getPattern()
      : window._sessionAdaptivePattern;
    if (!pattern || typeof pattern !== 'object') return null;
    return { type: pattern.type || 'direct', logic: Array.isArray(pattern.logic) ? pattern.logic : [] };
  } catch (_) { return null; }
}

/* ============================================================================
 * ADR-083 — archetype framework (brings Quant to the DI/LR "earned difficulty" bar).
 * A topic supplies ARCH = { easy:[a], medium:[a], hard:[a] } where each archetype
 *   a = { k:'key', skill:'cognitiveSkill', build:function(diff){ return {q,a,k?,explain,options?} | null } }
 * (build returns null when it couldn't make CLEAN numbers this attempt) and PRIMARY = { easy,medium,hard } —
 * guaranteed-clean builders used as an in-tier fallback so a hard question is NEVER silently downgraded to an easy one.
 * _genArch picks an in-tier archetype, retries within the tier, then falls back to PRIMARY, and wraps the result into
 * the { question, answer, category, subtype:'diff:key', explanation } shape the drill engine already consumes.
 * ============================================================================ */
var QRGen = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
  ? require('./utils/generative-helpers.js')
  : (typeof window !== 'undefined' && window.QRGen ? window.QRGen
    : (typeof globalThis !== 'undefined' && globalThis.QRGen ? globalThis.QRGen : null));

function _round1(x) { return Math.round(x * 10) / 10; }
function _round2(x) { return Math.round(x * 100) / 100; }

function _genArch(category, arch, primary) {
  var diff = _getDifficulty();
  var pool = arch[diff] || arch.medium;
  var hint = _getAdaptiveHint();
  if (hint && hint.type) {                       /* light adaptive bias toward the AI-flagged reasoning type */
    var pref = pool.filter(function (a) { return a.k === hint.type || a.skill === hint.type; });
    if (pref.length) pool = pref;
  }
  for (var i = 0; i < 50; i++) {
    var a = pool[randInt(0, pool.length - 1)];
    var qa = a.build(diff);
    if (qa && qa.a !== undefined && qa.a !== null && qa.a !== '') { qa.k = qa.k || a.k; return _wrapArch(category, diff, qa); }
  }
  var qp = primary[diff]();
  return _wrapArch(category, diff, qp);
}

function _wrapArch(category, diff, qa) {
  return {
    question: qa.q,
    answer: qa.a,
    category: category,
    subtype: diff + ':' + (qa.k || 'q'),
    explanation: qa.explain || undefined,
    options: qa.options || undefined
  };
}

/* ---- category generators ---- */

/** Squares & roots (ADR-083 archetypes: direct · inverse · difference-of-squares). */
function _sqIdentity(n) {
  var r = Math.round(n / 10) * 10; if (r === 0) r = 10; var d = n - r, sgn = d < 0 ? '−' : '+';
  return n + '² = (' + r + sgn + Math.abs(d) + ')² = ' + r + '² ' + sgn + ' 2·' + r + '·' + Math.abs(d) + ' + ' + Math.abs(d) + '² = ' + (r * r) + ' ' + sgn + ' ' + (2 * r * Math.abs(d)) + ' + ' + (d * d) + ' = ' + (n * n) + '.';
}
var _SQUARES_ARCH = {
  easy: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(2, 12); return { q: pick([n + '² = ?', 'Square of ' + n + ' = ?', n + ' squared = ?']), a: n * n, explain: n + '² = ' + n + ' × ' + n + ' = ' + (n * n) + '.' }; } }
  ],
  medium: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(13, 30); return { q: pick([n + '² = ?', 'Square of ' + n + ' = ?']), a: n * n, explain: _sqIdentity(n) }; } },
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(4, 25), sq = n * n; return { q: pick(['√' + sq + ' = ?', 'Square root of ' + sq + ' = ?', 'If x² = ' + sq + ', x = ?']), a: n, explain: 'Find x with x² = ' + sq + '. Since ' + n + '² = ' + sq + ', √' + sq + ' = ' + n + '.' }; } }
  ],
  hard: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(31, 60); return { q: pick([n + '² = ?', 'Square of ' + n + ' = ?']), a: n * n, explain: _sqIdentity(n) }; } },
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(20, 45), sq = n * n; return { q: pick(['√' + sq + ' = ?', 'If x² = ' + sq + ', x = ?']), a: n, explain: n + '² = ' + sq + ', so √' + sq + ' = ' + n + '. It sits just above ' + (Math.floor(n / 10) * 10) + '² = ' + (Math.floor(n / 10) * 10) * (Math.floor(n / 10) * 10) + '.' }; } },
    { k: 'diffSquares', skill: 'multi-step', build: function () { var a = randInt(12, 40), b = randInt(2, a - 1); return { q: a + '² − ' + b + '² = ?', a: a * a - b * b, explain: 'a² − b² = (a+b)(a−b) = (' + (a + b) + ')(' + (a - b) + ') = ' + (a * a - b * b) + '. Factor instead of squaring both — far faster.' }; } }
  ]
};
var _SQUARES_PRIMARY = {
  easy: function () { var n = randInt(2, 12); return { q: n + '² = ?', a: n * n, k: 'direct', explain: n + '² = ' + (n * n) + '.' }; },
  medium: function () { var n = randInt(13, 30); return { q: n + '² = ?', a: n * n, k: 'direct', explain: _sqIdentity(n) }; },
  hard: function () { var n = randInt(31, 60); return { q: n + '² = ?', a: n * n, k: 'direct', explain: _sqIdentity(n) }; }
};
function genSquare() { return _genArch('squares', _SQUARES_ARCH, _SQUARES_PRIMARY); }

/** Cubes & cube-roots (ADR-083 archetypes: direct · inverse). */
var _CUBES_ARCH = {
  easy: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(1, 6); return { q: pick([n + '³ = ?', 'Cube of ' + n + ' = ?']), a: n * n * n, explain: n + '³ = ' + n + ' × ' + n + ' × ' + n + ' = ' + (n * n * n) + '.' }; } }
  ],
  medium: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(7, 13); return { q: pick([n + '³ = ?', 'Cube of ' + n + ' = ?']), a: n * n * n, explain: n + '³ = ' + n + '² × ' + n + ' = ' + (n * n) + ' × ' + n + ' = ' + (n * n * n) + '.' }; } },
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(2, 10), c = n * n * n; return { q: pick(['∛' + c + ' = ?', 'Cube root of ' + c + ' = ?']), a: n, explain: n + '³ = ' + c + ', so ∛' + c + ' = ' + n + '. Tip: the unit digit ' + (c % 10) + ' of the cube fixes the unit digit of the root.' }; } }
  ],
  hard: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(14, 20); return { q: pick([n + '³ = ?', 'Cube of ' + n + ' = ?']), a: n * n * n, explain: n + '³ = ' + (n * n) + ' × ' + n + ' = ' + (n * n * n) + '.' }; } },
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(6, 20), c = n * n * n; return { q: pick(['∛' + c + ' = ?', 'Cube root of ' + c + ' = ?']), a: n, explain: '∛' + c + ' = ' + n + '. Unit digit ' + (c % 10) + ' → the root ends in ' + (n % 10) + '; the leading part places it near ' + n + '.' }; } }
  ]
};
var _CUBES_PRIMARY = {
  easy: function () { var n = randInt(1, 6); return { q: n + '³ = ?', a: n * n * n, k: 'direct', explain: n + '³ = ' + (n * n * n) + '.' }; },
  medium: function () { var n = randInt(7, 13); return { q: n + '³ = ?', a: n * n * n, k: 'direct', explain: n + '³ = ' + (n * n * n) + '.' }; },
  hard: function () { var n = randInt(14, 20); return { q: n + '³ = ?', a: n * n * n, k: 'direct', explain: n + '³ = ' + (n * n * n) + '.' }; }
};
function genCube() { return _genArch('cubes', _CUBES_ARCH, _CUBES_PRIMARY); }

/** Area (ADR-083 archetypes by tier: square/rectangle → triangle/parallelogram/circle → trapezium/border). π = 3.14. */
function _areaSquare(diff) { var s = diff === 'easy' ? randInt(3, 12) : (diff === 'hard' ? randInt(21, 45) : randInt(12, 25)); return { q: 'The area of a square of side ' + s + ' cm = ? cm².', a: s * s, k: 'square', explain: 'Area of a square = side² = ' + s + '² = ' + (s * s) + ' cm².' }; }
function _areaRect(diff) { var l = diff === 'easy' ? randInt(4, 12) : (diff === 'hard' ? randInt(22, 48) : randInt(12, 25)); var b = diff === 'easy' ? randInt(3, 9) : (diff === 'hard' ? randInt(15, 30) : randInt(8, 16)); return { q: 'A rectangle is ' + l + ' cm long and ' + b + ' cm wide. Its area = ? cm².', a: l * b, k: 'rectangle', explain: 'Area = length × breadth = ' + l + ' × ' + b + ' = ' + (l * b) + ' cm².' }; }
function _areaTri(diff) { var base = 2 * (diff === 'easy' ? randInt(2, 6) : (diff === 'hard' ? randInt(11, 24) : randInt(6, 12))); var h = diff === 'easy' ? randInt(3, 9) : (diff === 'hard' ? randInt(15, 30) : randInt(8, 16)); return { q: 'A triangle has base ' + base + ' cm and height ' + h + ' cm. Its area = ? cm².', a: base * h / 2, k: 'triangle', explain: 'Area = ½ × base × height = ½ × ' + base + ' × ' + h + ' = ' + (base * h / 2) + ' cm². Halve the even side first to avoid fractions.' }; }
function _areaPara(diff) { var b = diff === 'easy' ? randInt(4, 10) : (diff === 'hard' ? randInt(21, 40) : randInt(11, 20)); var h = diff === 'easy' ? randInt(3, 8) : (diff === 'hard' ? randInt(15, 28) : randInt(9, 16)); return { q: 'A parallelogram has base ' + b + ' cm and height ' + h + ' cm. Its area = ? cm².', a: b * h, k: 'parallelogram', explain: 'Area = base × height = ' + b + ' × ' + h + ' = ' + (b * h) + ' cm². Use the perpendicular height, not the slant side.' }; }
function _areaCircle(diff) { var r = diff === 'hard' ? randInt(12, 20) : randInt(6, 12); var a = _round2(3.14 * r * r); return { q: 'The area of a circle of radius ' + r + ' cm = ? cm². (use π = 3.14)', a: a, k: 'circle', explain: 'Area = πr² = 3.14 × ' + r + '² = 3.14 × ' + (r * r) + ' = ' + a + ' cm².' }; }
function _areaTrap(diff) { var a1, b1; do { a1 = diff === 'hard' ? randInt(12, 28) : randInt(6, 16); b1 = diff === 'hard' ? randInt(10, 24) : randInt(5, 14); } while ((a1 + b1) % 2 !== 0); var h = diff === 'hard' ? randInt(8, 20) : randInt(6, 12); return { q: 'A trapezium has parallel sides ' + a1 + ' cm and ' + b1 + ' cm, and height ' + h + ' cm. Its area = ? cm².', a: (a1 + b1) * h / 2, k: 'trapezium', explain: 'Area = ½ × (sum of parallel sides) × height = ½ × ' + (a1 + b1) + ' × ' + h + ' = ' + ((a1 + b1) * h / 2) + ' cm².' }; }
function _areaBorder() { var L = randInt(18, 40), B = randInt(12, 30), w = pick([1, 2, 3]); var inner = (L - 2 * w) * (B - 2 * w); return { q: 'A ' + L + ' cm × ' + B + ' cm sheet has a uniform border of width ' + w + ' cm. The area of the border = ? cm².', a: L * B - inner, k: 'border', explain: 'Border = outer − inner = ' + L + '×' + B + ' − ' + (L - 2 * w) + '×' + (B - 2 * w) + ' = ' + (L * B) + ' − ' + inner + ' = ' + (L * B - inner) + ' cm².' }; }
var _AREA_ARCH = {
  easy: [{ k: 'square', skill: 'direct', build: function () { return _areaSquare('easy'); } }, { k: 'rectangle', skill: 'direct', build: function () { return _areaRect('easy'); } }],
  medium: [{ k: 'rectangle', skill: 'direct', build: function () { return _areaRect('medium'); } }, { k: 'triangle', skill: 'formula', build: function () { return _areaTri('medium'); } }, { k: 'parallelogram', skill: 'formula', build: function () { return _areaPara('medium'); } }, { k: 'circle', skill: 'formula', build: function () { return _areaCircle('medium'); } }],
  hard: [{ k: 'triangle', skill: 'formula', build: function () { return _areaTri('hard'); } }, { k: 'circle', skill: 'formula', build: function () { return _areaCircle('hard'); } }, { k: 'trapezium', skill: 'multi-step', build: function () { return _areaTrap('hard'); } }, { k: 'border', skill: 'multi-step', build: function () { return _areaBorder(); } }]
};
var _AREA_PRIMARY = { easy: function () { return _areaSquare('easy'); }, medium: function () { return _areaRect('medium'); }, hard: function () { return _areaTrap('hard'); } };
function genArea() { return _genArch('area', _AREA_ARCH, _AREA_PRIMARY); }

/** Volume (ADR-083 archetypes by tier: cube/cuboid → cuboid/cylinder → cylinder/sphere/cone). π = 3.14. */
function _volCube(diff) { var s = diff === 'easy' ? randInt(2, 8) : (diff === 'hard' ? randInt(15, 25) : randInt(8, 15)); return { q: 'The volume of a cube of side ' + s + ' cm = ? cm³.', a: s * s * s, k: 'cube', explain: 'Volume of a cube = side³ = ' + s + '³ = ' + (s * s * s) + ' cm³.' }; }
function _volCuboid(diff) { var l = diff === 'easy' ? randInt(3, 9) : (diff === 'hard' ? randInt(15, 28) : randInt(9, 16)); var b = diff === 'easy' ? randInt(2, 7) : (diff === 'hard' ? randInt(10, 20) : randInt(6, 12)); var h = diff === 'easy' ? randInt(2, 6) : (diff === 'hard' ? randInt(8, 16) : randInt(5, 10)); return { q: 'A cuboid measures ' + l + ' cm × ' + b + ' cm × ' + h + ' cm. Its volume = ? cm³.', a: l * b * h, k: 'cuboid', explain: 'Volume = l × b × h = ' + l + ' × ' + b + ' × ' + h + ' = ' + (l * b * h) + ' cm³.' }; }
function _volCyl(diff) { var r = diff === 'hard' ? randInt(7, 14) : randInt(4, 10); var h = diff === 'hard' ? randInt(10, 20) : randInt(6, 14); var a = _round2(3.14 * r * r * h); return { q: 'A cylinder has radius ' + r + ' cm and height ' + h + ' cm. Its volume = ? cm³. (use π = 3.14)', a: a, k: 'cylinder', explain: 'Volume = πr²h = 3.14 × ' + r + '² × ' + h + ' = 3.14 × ' + (r * r * h) + ' = ' + a + ' cm³.' }; }
function _volSphere(diff) { var r = diff === 'hard' ? randInt(6, 12) : randInt(3, 7); var a = _round2((4 / 3) * 3.14 * r * r * r); return { q: 'A sphere has radius ' + r + ' cm. Its volume = ? cm³. (use π = 3.14)', a: a, k: 'sphere', explain: 'Volume = (4/3)πr³ = (4/3) × 3.14 × ' + r + '³ = ' + a + ' cm³.' }; }
function _volCone(diff) { var r = diff === 'hard' ? randInt(6, 12) : randInt(3, 8); var h = diff === 'hard' ? randInt(9, 18) : randInt(6, 12); var a = _round2((1 / 3) * 3.14 * r * r * h); return { q: 'A cone has radius ' + r + ' cm and height ' + h + ' cm. Its volume = ? cm³. (use π = 3.14)', a: a, k: 'cone', explain: 'Volume = (1/3)πr²h = (1/3) × 3.14 × ' + (r * r) + ' × ' + h + ' = ' + a + ' cm³.' }; }
var _VOLUME_ARCH = {
  easy: [{ k: 'cube', skill: 'direct', build: function () { return _volCube('easy'); } }, { k: 'cuboid', skill: 'direct', build: function () { return _volCuboid('easy'); } }],
  medium: [{ k: 'cuboid', skill: 'direct', build: function () { return _volCuboid('medium'); } }, { k: 'cylinder', skill: 'formula', build: function () { return _volCyl('medium'); } }],
  hard: [{ k: 'cylinder', skill: 'formula', build: function () { return _volCyl('hard'); } }, { k: 'sphere', skill: 'formula', build: function () { return _volSphere('hard'); } }, { k: 'cone', skill: 'formula', build: function () { return _volCone('hard'); } }]
};
var _VOLUME_PRIMARY = { easy: function () { return _volCube('easy'); }, medium: function () { return _volCuboid('medium'); }, hard: function () { return _volCyl('hard'); } };
function genVolume() { return _genArch('volume', _VOLUME_ARCH, _VOLUME_PRIMARY); }

/** Fractions → percentage with wording variety + reverse direction */
function genFraction() {
  var table = [
    { frac: '1/2', pct: '50' },
    { frac: '1/3', pct: '33.33' },
    { frac: '2/3', pct: '66.66' },
    { frac: '1/4', pct: '25' },
    { frac: '3/4', pct: '75' },
    { frac: '1/5', pct: '20' },
    { frac: '2/5', pct: '40' },
    { frac: '3/5', pct: '60' },
    { frac: '4/5', pct: '80' },
    { frac: '1/6', pct: '16.66' },
    { frac: '5/6', pct: '83.33' },
    { frac: '1/8', pct: '12.5' },
    { frac: '3/8', pct: '37.5' },
    { frac: '5/8', pct: '62.5' },
    { frac: '7/8', pct: '87.5' },
    { frac: '1/9', pct: '11.11' },
    { frac: '2/9', pct: '22.22' },
    { frac: '4/9', pct: '44.44' },
    { frac: '5/9', pct: '55.55' },
    { frac: '7/9', pct: '77.77' },
    { frac: '8/9', pct: '88.88' },
    { frac: '1/10', pct: '10' },
    { frac: '1/11', pct: '9.09' },
    { frac: '2/11', pct: '18.18' },
    { frac: '3/11', pct: '27.27' },
    { frac: '5/11', pct: '45.45' },
    { frac: '9/11', pct: '81.81' },
    { frac: '1/12', pct: '8.33' },
    { frac: '1/15', pct: '6.66' },
    { frac: '1/20', pct: '5' },
    { frac: '1/25', pct: '4' },
    { frac: '1/40', pct: '2.5' },
    { frac: '1/50', pct: '2' },
    { frac: '3/10', pct: '30' },
    { frac: '7/10', pct: '70' },
    { frac: '9/10', pct: '90' }
  ];
  var diff = _getDifficulty();
  var subset = diff === 'easy' ? table.slice(0, 15) : table;
  var item = pick(subset);

  /* Reverse direction: percentage → fraction (medium/hard, 30% chance) */
  if (diff !== 'easy' && randInt(0, 2) === 0) {
    /* Only use clean percentage values for reverse questions */
    var reversePool = subset.filter(function (e) {
      return e.pct.indexOf('.') === -1 || e.pct === '12.5' || e.pct === '37.5' || e.pct === '62.5' || e.pct === '87.5' || e.pct === '2.5';
    });
    if (reversePool.length > 0) {
      var rItem = pick(reversePool);
      var revPhrasings = [
        rItem.pct + '% as a fraction = ?',
        'Express ' + rItem.pct + '% as a fraction = ?',
        rItem.pct + '% = ? (fraction)'
      ];
      return { question: pick(revPhrasings), answer: rItem.frac, category: 'fractions', subtype: 'reverse' };
    }
  }

  /* Vary question phrasing so the session doesn't feel templated */
  var phrasings = [
    item.frac + ' expressed as a percentage = ?',
    'Convert ' + item.frac + ' to % = ?',
    item.frac + ' = ?%',
    'What is ' + item.frac + ' as a percentage?'
  ];
  return { question: pick(phrasings), answer: item.pct, category: 'fractions' };
}

/** Percentages (ADR-083 archetypes: direct-of · reverse-base · what-percent · percent-change · successive-discount ·
 *  equal-±x trap). Every build guarantees a clean answer or returns null so the tier retries. */
var _PCT_P = { easy: [5, 10, 20, 25, 50], medium: [5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75], hard: [5, 8, 12, 15, 16, 18, 20, 24, 25, 30, 36, 40, 45, 50, 60, 75] };
var _PCT_B = { easy: [80, 120, 160, 200, 240, 400, 500, 600, 800], medium: [60, 80, 120, 150, 160, 200, 240, 250, 300, 360, 400, 450, 500, 600, 720], hard: [120, 150, 160, 200, 240, 300, 360, 400, 480, 500, 600, 720, 840, 960, 1200] };
function _pctDirect(diff) { for (var i = 0; i < 40; i++) { var p = pick(_PCT_P[diff]), b = pick(_PCT_B[diff]), r = p * b / 100; if (r === Math.floor(r)) return { q: pick([p + '% of ' + b + ' = ?', 'Find ' + p + '% of ' + b + '.', p + '% of ' + b + ' is what number?']), a: r, k: 'directOf', explain: p + '% of ' + b + ' = ' + p + ' × ' + b + ' ÷ 100 = ' + r + '. Tip: ' + p + '% of ' + b + ' = ' + b + '% of ' + p + ' — swap when one side is rounder.' }; } return null; }
function _pctReverse(diff) { for (var i = 0; i < 40; i++) { var p = pick(_PCT_P[diff]), b = pick(_PCT_B[diff]), r = p * b / 100; if (r === Math.floor(r)) return { q: p + '% of what number is ' + r + '?', a: b, k: 'reverse', explain: 'If ' + p + '% of N = ' + r + ', then N = ' + r + ' × 100 ÷ ' + p + ' = ' + b + '.' }; } return null; }
function _pctWhat(diff) { for (var i = 0; i < 40; i++) { var p = pick(_PCT_P[diff]), b = pick(_PCT_B[diff]), y = p * b / 100; if (y === Math.floor(y)) return { q: 'What percent of ' + b + ' is ' + y + '?', a: p, k: 'whatPct', explain: y + ' out of ' + b + ' = (' + y + ' ÷ ' + b + ') × 100 = ' + p + '%.' }; } return null; }
function _pctChange() { for (var i = 0; i < 40; i++) { var old = pick([80, 100, 120, 150, 160, 200, 250, 400]); var pc = pick([10, 20, 25, 40, 50, 60, 75]); var nw = Math.round(old * (1 + pc / 100)); if ((nw - old) * 100 % old === 0) return { q: 'A value rises from ' + old + ' to ' + nw + '. The percent increase = ? %', a: (nw - old) * 100 / old, k: 'pctChange', explain: '% increase = (new − old)/OLD × 100 = (' + nw + ' − ' + old + ')/' + old + ' × 100 = ' + ((nw - old) * 100 / old) + '%. Always divide by the ORIGINAL value.' }; } return null; }
function _pctSuccessive() { for (var i = 0; i < 40; i++) { var d1 = pick([10, 15, 20, 25]), d2 = pick([10, 20, 25]); var base = pick([200, 250, 300, 400, 500, 600, 800, 1000]); var f = base * (1 - d1 / 100) * (1 - d2 / 100); if (f === Math.floor(f)) return { q: 'A ₹' + base + ' item is given successive discounts of ' + d1 + '% and ' + d2 + '%. Final price = ₹?', a: f, k: 'successive', explain: 'Apply in sequence: ' + base + ' × ' + (1 - d1 / 100) + ' × ' + (1 - d2 / 100) + ' = ' + f + '. Single equivalent = ' + d1 + '+' + d2 + '−(' + d1 + '×' + d2 + ')/100 = ' + (d1 + d2 - d1 * d2 / 100) + '%.' }; } return null; }
function _pctNetTrap() { var x = pick([10, 20, 30, 40, 50]); return { q: 'A salary is increased by ' + x + '% and then decreased by ' + x + '%. It falls by ? % overall.', a: x * x / 100, k: 'netTrap', explain: 'Equal +' + x + '% then −' + x + '% never cancels — the net fall = x²/100 = ' + x + '²/100 = ' + (x * x / 100) + '%. It compounds, it does not add.' }; }
var _PCT_ARCH = {
  easy: [{ k: 'directOf', skill: 'direct', build: function (d) { return _pctDirect(d); } }],
  medium: [{ k: 'directOf', skill: 'direct', build: function (d) { return _pctDirect(d); } }, { k: 'reverse', skill: 'inverse', build: function (d) { return _pctReverse(d); } }, { k: 'whatPct', skill: 'inverse', build: function (d) { return _pctWhat(d); } }],
  hard: [{ k: 'directOf', skill: 'direct', build: function (d) { return _pctDirect(d); } }, { k: 'reverse', skill: 'inverse', build: function (d) { return _pctReverse(d); } }, { k: 'whatPct', skill: 'inverse', build: function (d) { return _pctWhat(d); } }, { k: 'pctChange', skill: 'multi-step', build: function () { return _pctChange(); } }, { k: 'successive', skill: 'multi-step', build: function () { return _pctSuccessive(); } }, { k: 'netTrap', skill: 'multi-step', build: function () { return _pctNetTrap(); } }]
};
function _pctSafe(diff) { var b = pick([100, 200, 400, 500, 800, 1000]); var p = pick(_PCT_P[diff]); return { q: p + '% of ' + b + ' = ?', a: p * b / 100, k: 'directOf', explain: p + '% of ' + b + ' = ' + (p * b / 100) + '.' }; }
var _PCT_PRIMARY = { easy: function () { return _pctSafe('easy'); }, medium: function () { return _pctSafe('medium'); }, hard: function () { return _pctSafe('hard'); } };
function genPercentage() { return _genArch('percentages', _PCT_ARCH, _PCT_PRIMARY); }

/** Mental multiplication: varied sub-types including 3-factor and squaring */
function genMultiplication() {
  var diff = _getDifficulty();
  var hint = _getAdaptiveHint();
  var subtype = diff === 'easy' ? 0 : randInt(0, 4);

  /* 3-factor multiplication (medium/hard) — dynamically generated */
  if (subtype === 3 && diff !== 'easy') {
    var _3a, _3b, _3c;
    if (diff === 'hard') {
      _3a = randInt(4, 12); _3b = randInt(3, 8); _3c = randInt(2, 6);
    } else {
      _3a = randInt(2, 8); _3b = randInt(2, 6); _3c = randInt(2, 5);
    }
    /* Ensure the product is reasonable (≤ 1000 for mental math) */
    if (_3a * _3b * _3c > 1000) _3c = Math.max(2, Math.floor(1000 / (_3a * _3b)));
    return { question: _3a + ' × ' + _3b + ' × ' + _3c + ' = ?', answer: _3a*_3b*_3c, category: 'multiplication', subtype: '3-factor' };
  }
  /* Squaring-by-formula: (a+b)² or (a-b)² hint */
  if (subtype === 4 && diff === 'hard') {
    var sq = pick([11,12,13,14,15,16,17,18,19,21,22,23,24,25]);
    return { question: sq + '² = ?', answer: sq * sq, category: 'multiplication', subtype: 'square-mental' };
  }

  var x, y;
  if (diff === 'easy') { x = randInt(2, 20); y = randInt(2, 12); }
  else if (diff === 'hard') { x = randInt(11, 50); y = randInt(2, 25); }
  else { x = randInt(2, 30); y = randInt(2, 20); }

  var hintLogic = hint ? hint.logic : [];
  var biasInverse = hint && (hint.type === 'inverse' || hintLogic.indexOf('division') !== -1);
  if (biasInverse || (diff !== 'easy' && randInt(0, 3) === 0)) {
    var product = x * y;
    return { question: product + ' ÷ ' + x + ' = ?', answer: y, category: 'multiplication', subtype: 'division' };
  }
  return { question: x + ' × ' + y + ' = ?', answer: x * y, category: 'multiplication', subtype: 'multiplication' };
}

/** Ratio: % change, computation, and combination sub-types */
function genRatio() {
  var diff = _getDifficulty();
  var subtype = diff === 'easy' ? 0 : randInt(0, 2);

  /* Computation: A:B = p:q and A = n, find B */
  if (subtype === 1 && diff !== 'easy') {
    var pairs = diff === 'hard'
      ? [[2,3],[3,4],[3,5],[4,7],[5,8],[2,7],[3,8]]
      : [[2,3],[3,4],[3,5],[4,5],[1,2]];
    var pr = pick(pairs);
    var multiples = [50,60,80,100,120,150,160,180,200];
    var aVal = pr[0] * pick(multiples.filter(function(m){ return m > 10; }));
    var bVal = Math.round(aVal * pr[1] / pr[0]);
    if (Number.isInteger(bVal))
      return { question: 'A:B = ' + pr[0] + ':' + pr[1] + ' and A = ' + aVal + '. B = ?', answer: bVal, category: 'ratios', subtype: 'computation' };
  }
  /* Combination: A:B and B:C, find A:C — dynamically generated */
  if (subtype === 2 && diff === 'hard') {
    /* Generate pairs where B cancels out cleanly */
    var _abPairs = [[2,3],[3,4],[3,5],[4,5],[2,5],[4,7],[5,6],[3,7],[5,8],[2,7]];
    var _bcPairs = [[3,4],[4,5],[5,3],[5,6],[3,2],[7,3],[6,5],[7,4],[8,3],[7,5]];
    var _pIdx = randInt(0, _abPairs.length - 1);
    var _ab = _abPairs[_pIdx];
    /* Pick a B:C pair where B matches _ab[1] to allow clean cancellation */
    var _matchingBc = [];
    for (var _bi = 0; _bi < _bcPairs.length; _bi++) {
      if (_bcPairs[_bi][0] === _ab[1]) _matchingBc.push(_bcPairs[_bi]);
    }
    if (_matchingBc.length > 0) {
      var _bc = pick(_matchingBc);
      /* A:C = _ab[0] : _bc[1] — simplify by GCD */
      var _gcdVal = _gcd(_ab[0], _bc[1]);
      var _ansA = _ab[0] / _gcdVal, _ansC = _bc[1] / _gcdVal;
      return { question: 'A:B = ' + _ab[0] + ':' + _ab[1] + ', B:C = ' + _bc[0] + ':' + _bc[1] + '. A:C = ?', answer: _ansA + ':' + _ansC, category: 'ratios', subtype: 'combination' };
    }
    /* Fallback to a known-good combo */
    return { question: 'A:B = 2:3, B:C = 3:4. A:C = ?', answer: '1:2', category: 'ratios', subtype: 'combination' };
  }

  var scenarios = [
    { q: 'A is 25% more than B. A:B = ?', a: '5:4' },
    { q: 'A is 20% less than B. A:B = ?', a: '4:5' },
    { q: 'A is 50% more than B. A:B = ?', a: '3:2' },
    { q: 'A is 33.33% more than B. A:B = ?', a: '4:3' },
    { q: 'A is 20% more than B. A:B = ?', a: '6:5' },
    { q: 'A is 25% less than B. A:B = ?', a: '3:4' },
    { q: 'A is 40% more than B. A:B = ?', a: '7:5' },
    { q: 'A is 10% less than B. A:B = ?', a: '9:10' },
    { q: 'A is 60% more than B. A:B = ?', a: '8:5' },
    { q: 'A is 75% more than B. A:B = ?', a: '7:4' }
  ];
  if (diff === 'hard') {
    scenarios = scenarios.concat([
      { q: 'A is 12.5% more than B. A:B = ?', a: '9:8' },
      { q: 'A is 16.66% less than B. A:B = ?', a: '5:6' },
      { q: 'A is 37.5% more than B. A:B = ?', a: '11:8' },
      { q: 'A is 11.11% less than B. A:B = ?', a: '8:9' },
      { q: 'A is 66.66% more than B. A:B = ?', a: '5:3' },
      { q: 'A is 150% more than B. A:B = ?', a: '5:2' }
    ]);
  } else if (diff === 'easy') { scenarios = scenarios.slice(0, 6); }
  var s = pick(scenarios);
  return { question: s.q, answer: s.a, category: 'ratios' };
}

/** Average calculations */
function genAverage() {
  var diff = _getDifficulty();
  var count, minVal, maxVal;

  if (diff === 'easy') {
    count = randInt(3, 4);
    minVal = 10; maxVal = 50;
  } else if (diff === 'hard') {
    /* Include missing number problems */
    if (randInt(0, 1) === 0) {
      return genAverageMissing();
    }
    count = randInt(4, 5);
    minVal = 10; maxVal = 100;
  } else {
    count = randInt(3, 5);
    minVal = 10; maxVal = 80;
  }

  var nums = [];
  for (var i = 0; i < count; i++) nums.push(randInt(minVal, maxVal));
  var sum = nums.reduce(function (a, b) { return a + b; }, 0);
  var avg = sum / count;
  /* Use whole-number averages only */
  if (avg !== Math.floor(avg)) {
    var adjustment = (Math.ceil(avg) * count) - sum;
    nums[0] += adjustment;
    /* Ensure no negative numbers after adjustment */
    if (nums[0] <= 0) {
      nums[0] = minVal;
      sum = nums.reduce(function (a, b) { return a + b; }, 0);
      avg = Math.round(sum / count);
      /* Force the sum to be divisible by count */
      nums[0] += (avg * count) - sum;
    }
    sum = nums.reduce(function (a, b) { return a + b; }, 0);
    avg = sum / count;
  }
  /* Final safety: ensure all numbers are positive and average is integer */
  var allPositive = true;
  for (var j = 0; j < nums.length; j++) {
    if (nums[j] <= 0) { allPositive = false; break; }
  }
  if (!allPositive || avg !== Math.floor(avg)) {
    avg = randInt(15, 60);
    nums = [];
    for (var s = 0; s < count; s++) nums.push(avg);
    sum = avg * count;
  }
  var avgPhrasings = [
    'Average of ' + nums.join(', ') + ' = ?',
    'Mean of ' + nums.join(', ') + ' = ?',
    'Find the average: ' + nums.join(', ') + ' = ?'
  ];
  return {
    question: pick(avgPhrasings),
    answer: avg,
    category: 'averages',
    subtype: 'average'
  };
}

/** Average - find missing number (hard mode) */
function genAverageMissing() {
  var count = randInt(4, 6);
  var avg = randInt(20, 80);
  var totalSum = avg * count;
  var nums = [];
  var partialSum = 0;
  /* Generate numbers close to the average to keep the missing value reasonable */
  for (var i = 0; i < count - 1; i++) {
    var n = randInt(Math.max(1, avg - 30), avg + 30);
    nums.push(n);
    partialSum += n;
  }
  var missing = totalSum - partialSum;
  /* Regenerate if missing value is negative or unreasonably large */
  if (missing <= 0 || missing > 200) {
    /* Fallback: adjust last known number to make missing value reasonable */
    var target = randInt(Math.max(1, avg - 20), avg + 20);
    var newLast = totalSum - (partialSum - nums[nums.length - 1]) - target;
    /* Ensure the adjusted number stays positive */
    if (newLast <= 0) return genAverage();
    nums[nums.length - 1] = newLast;
    partialSum = nums.reduce(function (a, b) { return a + b; }, 0);
    missing = totalSum - partialSum;
    /* Final fallback */
    if (missing <= 0 || missing > 200) {
      return genAverage();
    }
  }
  /* Safety: ensure all displayed numbers are positive */
  for (var c = 0; c < nums.length; c++) {
    if (nums[c] <= 0) return genAverage();
  }
  return {
    question: 'Average of ' + nums.join(', ') + ', x is ' + avg + '. x = ?',
    answer: missing,
    category: 'averages',
    subtype: 'average-missing'
  };
}

/** Profit and Loss calculations — 4 sub-types */
function genProfitLoss() {
  var diff = _getDifficulty();
  var type = diff === 'hard' ? randInt(0, 3) : randInt(0, 2);

  /* Varied CP pools — avoid all-round-100 figures */
  var cpEasy   = [100, 120, 150, 200, 250, 300, 400, 500];
  var cpMedium = [120, 125, 144, 150, 160, 175, 200, 225, 240, 250, 288, 300, 360, 400, 450, 480, 500];
  var cpHard   = [125, 144, 160, 175, 200, 225, 240, 250, 280, 288, 300, 320, 360, 375, 400, 432, 450, 480, 500, 560, 600];
  var cpPool   = diff === 'easy' ? cpEasy : (diff === 'hard' ? cpHard : cpMedium);

  if (type === 0) {
    /* Find SP given CP and profit% — ensure whole-number result */
    var profitOpts = diff === 'easy' ? [10, 20, 25, 50] : (diff === 'hard' ? [5, 8, 10, 12, 15, 20, 25, 30, 40, 50] : [5, 10, 15, 20, 25, 30, 40, 50]);
    var profitPct = pick(profitOpts);
    var cp, sp;
    var plAttempts = 0;
    do {
      cp = pick(cpPool);
      sp = cp * (1 + profitPct / 100);
      plAttempts++;
    } while (sp !== Math.floor(sp) && plAttempts < 40);
    if (sp !== Math.floor(sp)) { cp = 200; profitPct = 25; sp = 250; }
    return { question: 'CP = ' + cp + ', Profit = ' + profitPct + '%. SP = ?', answer: sp, category: 'profit-loss' };
  } else if (type === 1) {
    /* Find SP given CP and loss% — ensure whole-number result */
    var lossOpts = diff === 'easy' ? [10, 20, 25] : [5, 10, 15, 20, 25];
    var lossPct = pick(lossOpts);
    var cp2, sp2;
    var plAttempts2 = 0;
    do {
      cp2 = pick(cpPool);
      sp2 = cp2 * (1 - lossPct / 100);
      plAttempts2++;
    } while (sp2 !== Math.floor(sp2) && plAttempts2 < 40);
    if (sp2 !== Math.floor(sp2)) { cp2 = 200; lossPct = 20; sp2 = 160; }
    return { question: 'CP = ' + cp2 + ', Loss = ' + lossPct + '%. SP = ?', answer: sp2, category: 'profit-loss' };
  } else if (type === 2) {
    /* Find profit% given CP and SP */
    var profitPct2 = pick([10, 15, 20, 25, 30, 50]);
    var cp3 = pick(cpPool);
    var sp3;
    var p3Attempts = 0;
    do {
      sp3 = cp3 * (1 + profitPct2 / 100);
      if (sp3 === Math.floor(sp3)) break;
      cp3 = pick(cpPool);
      p3Attempts++;
    } while (p3Attempts < 20);
    if (!sp3 || sp3 !== Math.floor(sp3)) { cp3 = 200; profitPct2 = 25; sp3 = 250; }
    return { question: 'CP = ' + cp3 + ', SP = ' + sp3 + '. Profit% = ?', answer: profitPct2, category: 'profit-loss' };
  } else if (type === 3) {
    /* Successive profit/loss */
    var plSucc = [[10,10],[20,10],[10,20],[25,20],[15,10]];
    var plS = pick(plSucc);
    var cpS = pick([100, 200, 250, 400, 500]);
    var spS = Math.round(cpS * (1 + plS[0]/100) * (1 + plS[1]/100));
    return { question: 'CP = ' + cpS + ', sold at ' + plS[0] + '% profit then ' + plS[1] + '% profit. Final SP = ?', answer: spS, category: 'profit-loss', subtype: 'successive' };
  }
  /* Defensive fallback — should be unreachable but prevents undefined return */
  return { question: 'CP = 200, Profit = 25%. SP = ?', answer: 250, category: 'profit-loss' };
}

/** Time, Speed, Distance — 4 sub-types with wording variety */
function genTSD() {
  var diff = _getDifficulty();
  var type = diff === 'easy' ? randInt(0, 2) : randInt(0, 3);

  var speedEasy   = [30, 40, 45, 50, 60, 75, 80, 90, 100];
  var speedMedium = [25, 30, 35, 36, 40, 45, 48, 50, 54, 56, 60, 70, 72, 75, 80, 90, 96];
  var speedHard   = [36, 40, 45, 48, 50, 54, 56, 60, 64, 72, 75, 80, 90, 96, 100, 108, 112, 120];
  var speedPool   = diff === 'easy' ? speedEasy : (diff === 'hard' ? speedHard : speedMedium);
  var tMax = diff === 'easy' ? 5 : (diff === 'hard' ? 10 : 8);

  if (type === 0) {
    var speed = pick(speedPool);
    var time = randInt(2, tMax);
    var distPhrasings = [
      'Speed = ' + speed + ' km/h, Time = ' + time + ' hrs. Distance = ?',
      'A car travels at ' + speed + ' km/h for ' + time + ' hrs. Distance covered = ?',
      'At ' + speed + ' km/h for ' + time + ' hours, distance = ?'
    ];
    return { question: pick(distPhrasings), answer: speed * time, category: 'time-speed-distance' };
  } else if (type === 1) {
    var speed2 = pick(speedPool);
    var time2 = randInt(2, 6);
    var dist = speed2 * time2;
    var timePhrasings = [
      'Speed = ' + speed2 + ' km/h, Distance = ' + dist + ' km. Time = ?',
      'At ' + speed2 + ' km/h, time to cover ' + dist + ' km = ?',
      dist + ' km at ' + speed2 + ' km/h. Time taken = ?'
    ];
    return { question: pick(timePhrasings), answer: time2, category: 'time-speed-distance' };
  } else if (type === 2) {
    var speed3 = pick(speedPool);
    var time3 = randInt(2, 6);
    var dist2 = speed3 * time3;
    var speedPhrasings = [
      'Distance = ' + dist2 + ' km, Time = ' + time3 + ' hrs. Speed = ?',
      dist2 + ' km in ' + time3 + ' hrs. Speed = ?',
      'Covers ' + dist2 + ' km in ' + time3 + ' hours. Speed = ?'
    ];
    return { question: pick(speedPhrasings), answer: speed3, category: 'time-speed-distance' };
  } else {
    /* Average speed: two equal-distance legs */
    var avgSpeeds = diff === 'hard'
      ? [[60,80],[40,60],[50,70],[72,48],[90,60]]
      : [[30,60],[40,80],[50,100],[60,90]];
    var avgS = pick(avgSpeeds);
    var avgAns = (2 * avgS[0] * avgS[1]) / (avgS[0] + avgS[1]);
    if (avgAns === Math.floor(avgAns))
      return { question: 'Equal distance at ' + avgS[0] + ' km/h then ' + avgS[1] + ' km/h. Avg speed = ?', answer: avgAns, category: 'time-speed-distance', subtype: 'avg-speed' };
    var spFb = pick([[30,60],[40,80],[50,100]]);
    return { question: 'Equal distance at ' + spFb[0] + ' km/h then ' + spFb[1] + ' km/h. Avg speed = ?', answer: (2*spFb[0]*spFb[1])/(spFb[0]+spFb[1]), category: 'time-speed-distance', subtype: 'avg-speed' };
  }
}

/** Time and Work calculations with simple, clean problems */
function genTimeWork() {
  var diff = _getDifficulty();
  var type = randInt(0, 2);

  if (type === 0) {
    /* A can do a job in X days, B in Y days. Together in how many days?
       Pick values that produce clean combined rates. */
    var a = diff === 'easy' ? pick([2, 3, 4, 6]) : (diff === 'hard' ? pick([5, 6, 8, 10, 12, 15]) : pick([3, 4, 5, 6, 10]));
    var b = diff === 'easy' ? pick([3, 4, 6]) : (diff === 'hard' ? pick([6, 8, 10, 12, 15, 20]) : pick([4, 5, 6, 10, 12]));
    if (a === b) b = a + pick([1, 2, 3]);
    /* Combined rate = 1/a + 1/b = (a+b)/(a*b) → together = (a*b)/(a+b) */
    var product = a * b;
    var sum = a + b;
    /* Only use questions with clean integer answers */
    if (product % sum !== 0) {
      /* Fall back to a known-good pair: 6 and 3 → (6×3)/(6+3) = 18/9 = 2 days */
      a = 6; b = 3;
      product = 18; sum = 9;
    }
    var together = product / sum;
    return { question: 'A does a job in ' + a + ' days, B in ' + b + ' days. Together = ? days', answer: together, category: 'time-and-work' };
  } else if (type === 1) {
    /* A can do a job in X days. How much work in Y days? (fraction as percentage) */
    var days = diff === 'easy' ? pick([2, 4, 5, 10]) : (diff === 'hard' ? pick([5, 8, 10, 20, 25]) : pick([4, 5, 8, 10]));
    var workDays = randInt(1, Math.min(days - 1, 4));
    var pct = Math.round((workDays / days) * 100);
    return { question: 'A does a job in ' + days + ' days. Work done in ' + workDays + ' days = ?%', answer: pct, category: 'time-and-work' };
  } else {
    /* If 5 workers do a job in X days, how many days for Y workers? */
    var workers1 = diff === 'easy' ? pick([2, 3, 4, 5]) : (diff === 'hard' ? pick([4, 5, 6, 8, 10]) : pick([3, 4, 5, 6]));
    var daysPer = diff === 'easy' ? pick([4, 6, 8, 10, 12]) : (diff === 'hard' ? pick([6, 8, 10, 12, 15, 20]) : pick([6, 8, 10, 12]));
    /* Total work units = workers1 × daysPer; pick workers2 that divides evenly */
    var totalWork = workers1 * daysPer;
    var possibleWorkers = [];
    for (var w = 2; w <= 20; w++) {
      if (totalWork % w === 0 && w !== workers1) possibleWorkers.push(w);
    }
    if (possibleWorkers.length === 0) possibleWorkers.push(workers1 * 2);
    var workers2 = pick(possibleWorkers);
    var answer = totalWork / workers2;
    return { question: workers1 + ' workers finish in ' + daysPer + ' days. ' + workers2 + ' workers finish in ? days', answer: answer, category: 'time-and-work' };
  }
}

/* Simplification (BODMAS) — the banking/SSC backbone; always resolves to a clean integer. */
function genSimplification() {
  var diff = _getDifficulty();
  if (diff === 'easy') {
    var a = randInt(2, 9), b = randInt(2, 9), c = randInt(2, 20);
    return { question: a + ' × ' + b + ' + ' + c + ' = ?', answer: a * b + c, category: 'simplification' };
  }
  if (diff === 'hard') {
    /* (p × q) ÷ r + s × t — q is a multiple of r so the division is exact */
    var r = pick([2, 3, 4, 5, 6]), q = r * randInt(3, 12), p = randInt(3, 12), s = randInt(3, 15), t = randInt(2, 9);
    return { question: '(' + p + ' × ' + q + ') ÷ ' + r + ' + ' + s + ' × ' + t + ' = ?', answer: (p * q) / r + s * t, category: 'simplification' };
  }
  /* medium: num ÷ dv + add, num a multiple of dv */
  var dv = pick([2, 3, 4, 5, 6]), num = dv * randInt(4, 15), add = randInt(5, 40);
  return { question: num + ' ÷ ' + dv + ' + ' + add + ' = ?', answer: num / dv + add, category: 'simplification' };
}

/* Number Series — find the next term (arithmetic / geometric / increasing-difference). Integer answers. */
function genNumberSeries() {
  var diff = _getDifficulty(), i, terms = [];
  var type = randInt(0, diff === 'easy' ? 1 : 2);
  if (type === 0) {                                   // arithmetic
    var start = randInt(2, 12), step = diff === 'easy' ? pick([2, 3, 5]) : pick([4, 6, 7, 9, 11]);
    for (i = 0; i < 5; i++) terms.push(start + i * step);
  } else if (type === 1) {                            // geometric
    var s0 = randInt(2, 5), ratio = pick([2, 3]);
    for (i = 0; i < 5; i++) terms.push(s0 * Math.pow(ratio, i));
  } else {                                            // increasing differences (square-like)
    var cur = randInt(1, 4), base = pick([2, 3, 4]), d = base;
    for (i = 0; i < 5; i++) { terms.push(cur); cur += d; d += base; }
  }
  var answer = terms.pop();
  return { question: 'Next number: ' + terms.join(', ') + ', ?', answer: answer, category: 'number-series' };
}

/* ---- category map for focus training ---- */
var categoryGenerators = {
  squares: genSquare,
  simplification: genSimplification,
  'number-series': genNumberSeries,
  cubes: genCube,
  area: genArea,
  volume: genVolume,
  fractions: genFraction,
  percentages: genPercentage,
  multiplication: genMultiplication,
  ratios: genRatio,
  averages: genAverage,
  'profit-loss': genProfitLoss,
  'time-speed-distance': genTSD,
  'time-and-work': genTimeWork
};

/* ---- recent-question tracker (anti-repetition across calls) ---- */
var _recentQuestions = [];
var _MAX_RECENT = 60; /* raised to 60 — covers a full long session */

/* ---- session-level value fingerprint deduplication ----
   Tracks compact keys like "pct:20:400" so same numbers aren't
   reused even with different question phrasing within one session. */
var _sessionFingerprints = {};

function _makeFingerprint(q) {
  /* Extract category + first two numeric tokens as a session-unique key */
  try {
    var cat = q.category || 'x';
    var nums = String(q.question).match(/\d+/g) || [];
    return cat + ':' + nums.slice(0, 3).join(':');
  } catch (_) { return ''; }
}

function _hasFingerprintDup(q) {
  var fp = _makeFingerprint(q);
  if (!fp) return false;
  return !!_sessionFingerprints[fp];
}

function _recordFingerprint(q) {
  var fp = _makeFingerprint(q);
  if (fp) _sessionFingerprints[fp] = true;
}

function _recordRecentQuestion(questionText) {
  _recentQuestions.push(questionText);
  if (_recentQuestions.length > _MAX_RECENT) _recentQuestions.shift();
}

function _wasRecentlyAsked(questionText) {
  return _recentQuestions.indexOf(questionText) !== -1;
}

/** Reset all trackers — call at the start of each new drill session */
function resetRecentQuestions() {
  _recentQuestions = [];
  _sessionFingerprints = {};
}

/* ---- GCD helper for ratio simplification ---- */
function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }

/* ---- public API ---- */

var generators = [genSquare, genCube, genArea, genVolume, genFraction, genPercentage,
  genMultiplication, genRatio, genAverage, genProfitLoss, genTSD, genTimeWork,
  genSimplification, genNumberSeries];

/**
 * Generate a single random question.
 * @param {string} [category] - optional category filter (e.g. 'squares', 'fractions')
 * @param {string} [difficulty] - optional difficulty override ('easy', 'medium', 'hard')
 * @returns {{ question: string, answer: number|string, category: string }}
 */
function generateQuestion(category, difficulty) {
  /* Apply a temporary difficulty override if provided (duel / explicit calls). Uses the server-safe
     _difficultyOverride; also mirrors AdaptiveState on the client so adaptive biasing stays consistent. */
  var _prevModule = _difficultyOverride;
  var _prevAdaptive = null;
  var _needsRestore = false;
  if (difficulty) {
    _difficultyOverride = difficulty;
    if (typeof AdaptiveState !== 'undefined') {
      _prevAdaptive = AdaptiveState.getDifficulty();
      AdaptiveState.setDifficulty(difficulty);
    }
    _needsRestore = true;
  }

  var gen = category && categoryGenerators[category] ? categoryGenerators[category] : null;
  var q = gen ? gen() : pick(generators)();

  /* Restore previous difficulty state */
  if (_needsRestore) {
    _difficultyOverride = _prevModule;
    if (typeof AdaptiveState !== 'undefined') AdaptiveState.setDifficulty(_prevAdaptive);
  }
  return q;
}

/**
 * Generate an array of n random questions with deduplication.
 * Tracks recently asked questions within the session to avoid repeats.
 * @param {number} n
 * @param {string} [category] - optional category filter
 * @returns {Array<{ question: string, answer: number|string, category: string }>}
 */
function generateQuestions(n, category, difficulty) {
  /* Optional difficulty override (server / duel): set for the whole batch, restored after. The client omits it and
     keeps reading the user's settings difficulty via _getDifficulty. */
  var _prevDiff = _difficultyOverride;
  if (difficulty) _difficultyOverride = difficulty;
  try {
    var gen = category && categoryGenerators[category] ? categoryGenerators[category] : null;
    var qs = [];
    var seen = {}; /* exact question-string dedup within this batch */
    var maxAttempts = n * 12; /* headroom for fingerprint dedup */
    var attempts = 0;

    while (qs.length < n) {
      if (attempts >= maxAttempts) {
        /* Unique pool exhausted! Reset trackers gracefully instead of dumping
           blind duplicates, ensuring repeats are still spaced out. */
        seen = {};
        resetRecentQuestions();
        attempts = 0;
      }

      var q = gen ? gen() : generateQuestion();
      attempts++;
      /* Skip exact duplicates, recently-asked questions, and same-value fingerprints */
      if (seen[q.question] || _wasRecentlyAsked(q.question) || _hasFingerprintDup(q)) continue;

      seen[q.question] = true;
      _recordRecentQuestion(q.question);
      _recordFingerprint(q);
      qs.push(q);
    }

    return qs;
  } finally {
    if (difficulty) _difficultyOverride = _prevDiff;
  }
}

/**
 * Generate `n` questions spread across multiple topics (Custom Training / Duel). Splits the count across the valid
 * topics, generates per-topic (deduped), shuffles, caps to n. THE single multi-topic generator — both the client
 * (drill-engine custom mode) and the server (api/duel.js) call this, so a Duel topic produces the same questions as
 * Practice. Empty / all-invalid topics → a mixed batch.
 * @param {number} n
 * @param {Array<string>} topicKeys
 * @param {string} [difficulty] - optional override; client omits it (uses settings)
 * @returns {Array<{ question: string, answer: number|string, category: string }>}
 */
function generateMultiTopic(n, topicKeys, difficulty) {
  var validTopics = [];
  var seen = {};
  (topicKeys || []).forEach(function (k) {
    if (categoryGenerators[k] && !seen[k]) { validTopics.push(k); seen[k] = true; }
  });
  if (!validTopics.length) return generateQuestions(n, null, difficulty);

  var eachCount = Math.floor(n / validTopics.length);
  var remainder = n % validTopics.length;
  var assembled = [];
  for (var v = 0; v < validTopics.length; v++) {
    var perTopic = eachCount + (v < remainder ? 1 : 0);
    if (perTopic <= 0) continue;
    var topicQs = generateQuestions(perTopic, validTopics[v], difficulty);
    for (var q = 0; q < topicQs.length; q++) assembled.push(topicQs[q]);
  }
  /* Fisher-Yates shuffle so topics interleave instead of clustering */
  for (var i = assembled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = assembled[i]; assembled[i] = assembled[j]; assembled[j] = tmp;
  }
  return assembled.slice(0, n);
}

/**
 * Generate questions from mistake history for review mode.
 * @param {number} n - max number of questions
 * @returns {Array<{ question: string, answer: number|string, category: string }>}
 */
function generateMistakeReviewQuestions(n) {
  var mistakes = getMistakes();
  /* What can be re-served (ADR-079): Quant numeric, and any self-contained text-MCQ LR item whose options were
     stored (generated LR + authored CR). Still EXCLUDED — DI (needs the chart dataset), LR puzzle SETS (need the
     shared scenario) and LR visual items (need the figure): a stored mistake can't reconstruct that context. */
  var NEEDS_CONTEXT = { 'lr-seating': 1, 'lr-puzzle': 1, 'lr-mirror': 1, 'lr-water': 1, 'lr-dice': 1, 'lr-cube': 1, 'lr-fseries': 1, 'lr-fanalogy': 1 };
  mistakes = mistakes.filter(function (m) {
    var c = String(m && m.category);
    if (c.indexOf('di-') === 0) return false;
    if (NEEDS_CONTEXT[c]) return false;
    if (c.indexOf('lr-') === 0) return !!(m.options && m.options.length);   // re-serve only if options were stored
    return true;
  });
  if (mistakes.length === 0) return [];

  /* Shuffle and take up to n */
  var shuffled = mistakes.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled.slice(0, n).map(function (m) {
    return { question: m.question, answer: m.answer, category: m.category, options: m.options || undefined, explanation: m.explanation || undefined, subtype: m.subtype || undefined };
  });
}

/* Dual-mode export: on the client this file loads as a <script> (no `module`); under Node (api/duel.js
   `require('../js/questions.js')`) it exports the generators so the Duel uses the SAME engine as Practice. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateQuestion: generateQuestion,
    generateQuestions: generateQuestions,
    generateMultiTopic: generateMultiTopic,
    categoryGenerators: categoryGenerators,
    resetRecentQuestions: resetRecentQuestions
  };
}
