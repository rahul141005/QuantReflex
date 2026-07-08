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
    if (selectedDifficulty === 'hard' && (typeof canAccessFeature !== 'function' || !canAccessFeature('hard_mode'))) {
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

/* ADR-111 Phase F: the render registry + eager EN generator pack. In the browser both are loaded as <script>
   tags BEFORE questions.js (index.html), so window.QRGenI18n already carries the EN quant templates. In Node
   (checks / duel path) we require the registry and the EN pack so a refactored (slots-based) build() can render.
   _wrapArch resolves via the registry at render time, so an unrefactored category is completely unaffected. */
var QRGenI18n = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
  ? require('./gen-i18n.js')
  : (typeof window !== 'undefined' ? window.QRGenI18n : (typeof globalThis !== 'undefined' ? globalThis.QRGenI18n : null));
if (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined') {
  try { require('../locales/gen/en.quant.js'); } catch (_) { /* pack optional until F-M2 populates it */ }
}

function _round2(x) { return Math.round(x * 100) / 100; }
/* Ordinal suffix (1st, 2nd, 3rd, 4th … 11th, 12th, 13th). Keeps the number's digits intact for the recompute harness. */
function _ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
/* Named-character helpers (ADR-084): draw people/items from the shared pools so word problems stop feeling templated.
   Names/items contain NO digits, so nums()-based recompute in the harness is byte-identical — only the wording varies. */
function _two() { try { var n = QRGen && QRGen.twoNames ? QRGen.twoNames() : null; if (n && n.length === 2) return n; } catch (e) {} return ['Ravi', 'Priya']; }
function _one() { try { return (QRGen && QRGen.name) ? QRGen.name() : 'Ravi'; } catch (e) {} return 'Ravi'; }
/* ADR-111 Phase F: entry-returning twins of _two/_one for the slots refactor. They draw trilingual ENTRY objects
   ({en,hi,mr,g}) from QRGen.NAME_POOL so a slots-based build() can stash the entry and each language pack emits
   the right script (.en/.hi/.mr) + gender (.g). Answers/digits are unaffected — names carry none. */
function _twoE() { try { var n = QRGen && QRGen.twoNameEntries ? QRGen.twoNameEntries() : null; if (n && n.length === 2) return n; } catch (e) {} return [{ en: 'Ravi', hi: 'रवि', mr: 'रवी', g: 'm' }, { en: 'Priya', hi: 'प्रिया', mr: 'प्रिया', g: 'f' }]; }
function _oneE() { try { var n = QRGen && QRGen.nameEntry ? QRGen.nameEntry() : null; if (n) return n; } catch (e) {} return { en: 'Ravi', hi: 'रवि', mr: 'रवी', g: 'm' }; }

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
  var q = qa.q, explain = qa.explain;
  /* ADR-111 Phase F: a refactored build() returns language-neutral `slots` + a fixed variant `v` instead of
     composed strings — the surface is rendered here in the active study language (EN byte-identical). An
     unrefactored build() still returns q/explain and takes the legacy path untouched. */
  if (qa.slots !== undefined && QRGenI18n && QRGenI18n.render) {
    var rendered = QRGenI18n.render('quant', category + ':' + diff + ':' + (qa.k || 'q'), qa.v, qa.slots);
    if (rendered) { q = rendered.q; explain = rendered.explain || undefined; }
  }
  return {
    question: q,
    answer: qa.a,
    category: category,
    subtype: diff + ':' + (qa.k || 'q'),
    explanation: explain || undefined,
    options: qa.options || undefined
  };
}

/* ---- category generators ---- */

/** Squares & roots (ADR-083 archetypes: direct · inverse · difference-of-squares). */
function _sqIdentity(n) {
  var r = Math.round(n / 10) * 10; if (r === 0) r = 10; var d = n - r, sgn = d < 0 ? '−' : '+';
  return n + '² = (' + r + sgn + Math.abs(d) + ')² = ' + r + '² ' + sgn + ' 2·' + r + '·' + Math.abs(d) + ' + ' + Math.abs(d) + '² = ' + (r * r) + ' ' + sgn + ' ' + (2 * r * Math.abs(d)) + ' + ' + (d * d) + ' = ' + (n * n) + '.';
}
/* ADR-111 Phase F: builds return language-neutral slots + a fixed variant seed `v`; the surface (stem +
   explanation) is rendered from locales/gen/*.quant.js by QRGenI18n. Math is untouched — the masked-shape
   census proves EN byte-identity. Pure-math explanations (e.g. _sqIdentity) are precomputed into a slot. */
var _SQUARES_ARCH = {
  easy: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(2, 12); return { slots: { n: n }, a: n * n, v: randInt(0, 999) }; } }
  ],
  medium: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(13, 30); return { slots: { n: n, id: _sqIdentity(n) }, a: n * n, v: randInt(0, 999) }; } },
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(4, 25), sq = n * n; return { slots: { n: n, sq: sq }, a: n, v: randInt(0, 999) }; } }
  ],
  /* ADR-095: mirror cubes — big-number "compute n²" is calculator work, not reasoning, so hard drops 'direct'. Hard is
     the inverse (√) and the a²−b² factoring identity. */
  hard: [
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(20, 45), sq = n * n, b = Math.floor(n / 10) * 10; return { slots: { n: n, sq: sq, b: b, bsq: b * b }, a: n, v: randInt(0, 999) }; } },
    { k: 'diffSquares', skill: 'multi-step', build: function () { var a = randInt(12, 40), b = randInt(2, a - 1); return { slots: { a: a, b: b, sum: a + b, diff: a - b, ans: a * a - b * b }, a: a * a - b * b, v: randInt(0, 999) }; } }
  ]
};
var _SQUARES_PRIMARY = {
  easy: function () { var n = randInt(2, 12); return { q: n + '² = ?', a: n * n, k: 'direct', explain: n + '² = ' + (n * n) + '.' }; },
  medium: function () { var n = randInt(13, 30); return { q: n + '² = ?', a: n * n, k: 'direct', explain: _sqIdentity(n) }; },
  /* hard PRIMARY must emit a HARD key (not the dropped 'direct'): a clean √ (ADR-095 lockstep). */
  hard: function () { var n = randInt(20, 45), sq = n * n; return { q: '√' + sq + ' = ?', a: n, k: 'inverse', explain: n + '² = ' + sq + ', so √' + sq + ' = ' + n + '.' }; }
};
function genSquare() { return _genArch('squares', _SQUARES_ARCH, _SQUARES_PRIMARY); }

/** Cubes & cube-roots (ADR-083 archetypes: direct · inverse). */
var _CUBES_ARCH = {
  easy: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(1, 6); return { slots: { n: n }, a: n * n * n, v: randInt(0, 999) }; } }
  ],
  medium: [
    { k: 'direct', skill: 'direct', build: function () { var n = randInt(7, 13); return { slots: { n: n }, a: n * n * n, v: randInt(0, 999) }; } },
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(2, 10); return { slots: { n: n }, a: n, v: randInt(0, 999) }; } }
  ],
  hard: [
    /* ADR-093: hard is EARNED — big-number "compute n³" is calculator work, not reasoning. Hard now tests the two
       genuine exam skills: 5-digit cube roots via the unit-digit technique, and a³ − b³ via the identity. */
    { k: 'inverse', skill: 'inverse', build: function () { var n = randInt(12, 20); return { slots: { n: n }, a: n, v: randInt(0, 999) }; } },
    { k: 'cubeRoot5', skill: 'multi-step', build: function () { var n = randInt(21, 46); return { slots: { n: n }, a: n, v: randInt(0, 999) }; } },
    { k: 'diffCubes', skill: 'multi-step', build: function () { var a = randInt(6, 15), b = randInt(2, a - 1); return { slots: { a: a, b: b }, a: a * a * a - b * b * b, v: randInt(0, 999) }; } }
  ]
};
var _CUBES_PRIMARY = {
  easy: function () { var n = randInt(1, 6); return { q: n + '³ = ?', a: n * n * n, k: 'direct', explain: n + '³ = ' + (n * n * n) + '.' }; },
  medium: function () { var n = randInt(7, 13); return { q: n + '³ = ?', a: n * n * n, k: 'direct', explain: n + '³ = ' + (n * n * n) + '.' }; },
  hard: function () { var n = randInt(21, 46), c = n * n * n; return { q: '∛' + c + ' = ?', a: n, k: 'cubeRoot5', explain: 'Unit digit + thousands grouping give ∛' + c + ' = ' + n + '.' }; }
};
function genCube() { return _genArch('cubes', _CUBES_ARCH, _CUBES_PRIMARY); }

/** Area (ADR-083 archetypes by tier: square/rectangle → triangle/parallelogram/circle → trapezium/border). π = 3.14. */
function _areaSquare(diff) { var s = diff === 'easy' ? randInt(3, 12) : (diff === 'hard' ? randInt(21, 45) : randInt(12, 25)); return { slots: { s: s }, a: s * s, k: 'square', v: randInt(0, 999) }; }
function _areaRect(diff) { var l = diff === 'easy' ? randInt(4, 12) : (diff === 'hard' ? randInt(22, 48) : randInt(12, 25)); var b = diff === 'easy' ? randInt(3, 9) : (diff === 'hard' ? randInt(15, 30) : randInt(8, 16)); return { slots: { l: l, b: b }, a: l * b, k: 'rectangle', v: randInt(0, 999) }; }
function _areaTri(diff) { var base = 2 * (diff === 'easy' ? randInt(2, 6) : (diff === 'hard' ? randInt(11, 24) : randInt(6, 12))); var h = diff === 'easy' ? randInt(3, 9) : (diff === 'hard' ? randInt(15, 30) : randInt(8, 16)); return { slots: { base: base, h: h }, a: base * h / 2, k: 'triangle', v: randInt(0, 999) }; }
function _areaPara(diff) { var b = diff === 'easy' ? randInt(4, 10) : (diff === 'hard' ? randInt(21, 40) : randInt(11, 20)); var h = diff === 'easy' ? randInt(3, 8) : (diff === 'hard' ? randInt(15, 28) : randInt(9, 16)); return { slots: { b: b, h: h }, a: b * h, k: 'parallelogram', v: randInt(0, 999) }; }
function _areaCircle(diff) { var r = diff === 'hard' ? randInt(12, 20) : randInt(6, 12); var a = _round2(3.14 * r * r); return { slots: { r: r, ans: a }, a: a, k: 'circle', v: randInt(0, 999) }; }
function _areaTrap(diff) { var a1, b1; do { a1 = diff === 'hard' ? randInt(12, 28) : randInt(6, 16); b1 = diff === 'hard' ? randInt(10, 24) : randInt(5, 14); } while ((a1 + b1) % 2 !== 0); var h = diff === 'hard' ? randInt(8, 20) : randInt(6, 12); return { slots: { a1: a1, b1: b1, h: h }, a: (a1 + b1) * h / 2, k: 'trapezium', v: randInt(0, 999) }; }
function _areaBorder() { var L = randInt(18, 40), B = randInt(12, 30), w = pick([1, 2, 3]); var inner = (L - 2 * w) * (B - 2 * w); return { slots: { L: L, B: B, w: w }, a: L * B - inner, k: 'border', v: randInt(0, 999) }; }
var _AREA_ARCH = {
  easy: [{ k: 'square', skill: 'direct', build: function () { return _areaSquare('easy'); } }, { k: 'rectangle', skill: 'direct', build: function () { return _areaRect('easy'); } }],
  medium: [{ k: 'rectangle', skill: 'direct', build: function () { return _areaRect('medium'); } }, { k: 'triangle', skill: 'formula', build: function () { return _areaTri('medium'); } }, { k: 'parallelogram', skill: 'formula', build: function () { return _areaPara('medium'); } }, { k: 'circle', skill: 'formula', build: function () { return _areaCircle('medium'); } }],
  hard: [{ k: 'triangle', skill: 'formula', build: function () { return _areaTri('hard'); } }, { k: 'circle', skill: 'formula', build: function () { return _areaCircle('hard'); } }, { k: 'trapezium', skill: 'multi-step', build: function () { return _areaTrap('hard'); } }, { k: 'border', skill: 'multi-step', build: function () { return _areaBorder(); } }]
};
var _AREA_PRIMARY = { easy: function () { return _areaSquare('easy'); }, medium: function () { return _areaRect('medium'); }, hard: function () { return _areaTrap('hard'); } };
function genArea() { return _genArch('area', _AREA_ARCH, _AREA_PRIMARY); }

/** Volume (ADR-083 archetypes by tier: cube/cuboid → cuboid/cylinder → cylinder/sphere/cone). π = 3.14. */
function _volCube(diff) { var s = diff === 'easy' ? randInt(2, 8) : (diff === 'hard' ? randInt(15, 25) : randInt(8, 15)); return { slots: { s: s }, a: s * s * s, k: 'cube', v: randInt(0, 999) }; }
function _volCuboid(diff) { var l = diff === 'easy' ? randInt(3, 9) : (diff === 'hard' ? randInt(15, 28) : randInt(9, 16)); var b = diff === 'easy' ? randInt(2, 7) : (diff === 'hard' ? randInt(10, 20) : randInt(6, 12)); var h = diff === 'easy' ? randInt(2, 6) : (diff === 'hard' ? randInt(8, 16) : randInt(5, 10)); return { slots: { l: l, b: b, h: h }, a: l * b * h, k: 'cuboid', v: randInt(0, 999) }; }
function _volCyl(diff) { var r = diff === 'hard' ? randInt(7, 14) : randInt(4, 10); var h = diff === 'hard' ? randInt(10, 20) : randInt(6, 14); var a = _round2(3.14 * r * r * h); return { slots: { r: r, h: h, ans: a }, a: a, k: 'cylinder', v: randInt(0, 999) }; }
function _volSphere(diff) { var r = diff === 'hard' ? randInt(6, 12) : randInt(3, 7); var a = _round2((4 / 3) * 3.14 * r * r * r); return { slots: { r: r, ans: a }, a: a, k: 'sphere', v: randInt(0, 999) }; }
function _volCone(diff) { var r = diff === 'hard' ? randInt(6, 12) : randInt(3, 8); var h = diff === 'hard' ? randInt(9, 18) : randInt(6, 12); var a = _round2((1 / 3) * 3.14 * r * r * h); return { slots: { r: r, h: h, ans: a }, a: a, k: 'cone', v: randInt(0, 999) }; }
var _VOLUME_ARCH = {
  easy: [{ k: 'cube', skill: 'direct', build: function () { return _volCube('easy'); } }, { k: 'cuboid', skill: 'direct', build: function () { return _volCuboid('easy'); } }],
  medium: [{ k: 'cuboid', skill: 'direct', build: function () { return _volCuboid('medium'); } }, { k: 'cylinder', skill: 'formula', build: function () { return _volCyl('medium'); } }],
  hard: [{ k: 'cylinder', skill: 'formula', build: function () { return _volCyl('hard'); } }, { k: 'sphere', skill: 'formula', build: function () { return _volSphere('hard'); } }, { k: 'cone', skill: 'formula', build: function () { return _volCone('hard'); } }]
};
var _VOLUME_PRIMARY = { easy: function () { return _volCube('easy'); }, medium: function () { return _volCuboid('medium'); }, hard: function () { return _volCyl('hard'); } };
function genVolume() { return _genArch('volume', _VOLUME_ARCH, _VOLUME_PRIMARY); }

/** Fraction ↔ percentage conversions (ADR-083 archetypes: fraction→% · %→fraction). String answers. */
var _FRAC_TABLE = [
  { frac: '1/2', pct: '50' }, { frac: '1/3', pct: '33.33' }, { frac: '2/3', pct: '66.66' }, { frac: '1/4', pct: '25' },
  { frac: '3/4', pct: '75' }, { frac: '1/5', pct: '20' }, { frac: '2/5', pct: '40' }, { frac: '3/5', pct: '60' },
  { frac: '4/5', pct: '80' }, { frac: '1/6', pct: '16.66' }, { frac: '5/6', pct: '83.33' }, { frac: '1/8', pct: '12.5' },
  { frac: '3/8', pct: '37.5' }, { frac: '5/8', pct: '62.5' }, { frac: '7/8', pct: '87.5' }, { frac: '1/9', pct: '11.11' },
  { frac: '2/9', pct: '22.22' }, { frac: '4/9', pct: '44.44' }, { frac: '5/9', pct: '55.55' }, { frac: '7/9', pct: '77.77' },
  { frac: '8/9', pct: '88.88' }, { frac: '1/10', pct: '10' }, { frac: '1/11', pct: '9.09' }, { frac: '2/11', pct: '18.18' },
  { frac: '3/11', pct: '27.27' }, { frac: '5/11', pct: '45.45' }, { frac: '9/11', pct: '81.81' }, { frac: '1/12', pct: '8.33' },
  { frac: '1/15', pct: '6.66' }, { frac: '1/20', pct: '5' }, { frac: '1/25', pct: '4' }, { frac: '1/40', pct: '2.5' },
  { frac: '1/50', pct: '2' }, { frac: '3/10', pct: '30' }, { frac: '7/10', pct: '70' }, { frac: '9/10', pct: '90' }
];
/* ADR-111 Phase F: frac/pct strings are language-neutral math tokens → carried in slots; the surface renders
   from locales/gen/*.quant.js. `_gcd` reductions and derived numerators are precomputed into slots. */
function _fracToPct(diff) { var it = pick(diff === 'easy' ? _FRAC_TABLE.slice(0, 15) : _FRAC_TABLE); return { slots: { frac: it.frac, pct: it.pct }, a: it.pct, k: 'fracToPct', v: randInt(0, 999) }; }
function _pctToFrac(diff) { var pool = (diff === 'easy' ? _FRAC_TABLE.slice(0, 15) : _FRAC_TABLE).filter(function (e) { return e.pct.indexOf('.') === -1 || ['12.5', '37.5', '62.5', '87.5', '2.5'].indexOf(e.pct) !== -1; }); if (!pool.length) return null; var it = pick(pool); return { slots: { frac: it.frac, pct: it.pct }, a: it.frac, k: 'pctToFrac', v: randInt(0, 999) }; }
/* ADR-093: hard is EARNED — conversions repeat medium, so hard adds real multi-step fraction work. */
function _fracOfFrac() {
  for (var i = 0; i < 40; i++) {
    var b1 = pick([2, 3, 4, 5, 8]), a1 = randInt(1, b1 - 1);
    var b2 = pick([2, 3, 4, 5, 8]), a2 = randInt(1, b2 - 1);
    if (_gcd(a1, b1) !== 1 || _gcd(a2, b2) !== 1) continue;   // exam fractions are written in lowest terms
    var N = b1 * b2 * pick([5, 10, 12, 15, 20]);
    var r = N * a1 * a2 / (b1 * b2);
    if (r === Math.floor(r) && r > 0) return { slots: { a1: a1, b1: b1, a2: a2, b2: b2, N: N, r: r }, a: r, k: 'fracOfFrac', v: randInt(0, 999) };
  }
  return null;
}
function _fracAdd() {
  for (var i = 0; i < 40; i++) {
    var b1 = pick([2, 3, 4, 5, 6, 8, 12]), b2 = pick([2, 3, 4, 5, 6, 8, 12]);
    if (b1 === b2) continue;
    var a1 = randInt(1, b1 - 1), a2 = randInt(1, b2 - 1);
    if (_gcd(a1, b1) !== 1 || _gcd(a2, b2) !== 1) continue;   // exam fractions are written in lowest terms
    var num = a1 * b2 + a2 * b1, den = b1 * b2, g = _gcd(num, den);
    var cd = b1 * b2, l = a1 * b2, r2 = a2 * b1, snum0 = a1 * b2 + a2 * b1;   // pre-reduction working (language-neutral)
    num /= g; den /= g;
    if (den === 1) continue;   // keep it a genuine fraction answer
    return { slots: { a1: a1, b1: b1, a2: a2, b2: b2, num: num, den: den, g: g, cd: cd, l: l, r2: r2, snum0: snum0 }, a: num + '/' + den, k: 'addFrac', v: randInt(0, 999) };
  }
  return null;
}
var _FRAC_ARCH = {
  easy: [{ k: 'fracToPct', skill: 'direct', build: function (d) { return _fracToPct(d); } }],
  medium: [{ k: 'fracToPct', skill: 'direct', build: function (d) { return _fracToPct(d); } }, { k: 'pctToFrac', skill: 'inverse', build: function (d) { return _pctToFrac(d); } }],
  hard: [{ k: 'fracOfFrac', skill: 'multi-step', build: function () { return _fracOfFrac(); } }, { k: 'addFrac', skill: 'multi-step', build: function () { return _fracAdd(); } }, { k: 'pctToFrac', skill: 'inverse', build: function (d) { return _pctToFrac(d); } }]
};
var _FRAC_PRIMARY = { easy: function () { return _fracToPct('easy'); }, medium: function () { return _fracToPct('medium'); }, hard: function () { return { q: '2/3 of 3/4 of 120 = ?', a: 60, k: 'fracOfFrac', explain: '2/3 × 3/4 = 1/2; half of 120 is 60.' }; } };
function genFraction() { return _genArch('fractions', _FRAC_ARCH, _FRAC_PRIMARY); }

/** Percentages (ADR-083 archetypes: direct-of · reverse-base · what-percent · percent-change · successive-discount ·
 *  equal-±x trap). Every build guarantees a clean answer or returns null so the tier retries. */
var _PCT_P = { easy: [5, 10, 20, 25, 50], medium: [5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75], hard: [5, 8, 12, 15, 16, 18, 20, 24, 25, 30, 36, 40, 45, 50, 60, 75] };
var _PCT_B = { easy: [80, 120, 160, 200, 240, 400, 500, 600, 800], medium: [60, 80, 120, 150, 160, 200, 240, 250, 300, 360, 400, 450, 500, 600, 720], hard: [120, 150, 160, 200, 240, 300, 360, 400, 480, 500, 600, 720, 840, 960, 1200] };
function _pctDirect(diff) { for (var i = 0; i < 40; i++) { var p = pick(_PCT_P[diff]), b = pick(_PCT_B[diff]), r = p * b / 100; if (r === Math.floor(r)) return { slots: { p: p, b: b, r: r }, a: r, k: 'directOf', v: randInt(0, 999) }; } return null; }
function _pctReverse(diff) { for (var i = 0; i < 40; i++) { var p = pick(_PCT_P[diff]), b = pick(_PCT_B[diff]), r = p * b / 100; if (r === Math.floor(r)) return { slots: { p: p, b: b, r: r }, a: b, k: 'reverse', v: randInt(0, 999) }; } return null; }
function _pctWhat(diff) { for (var i = 0; i < 40; i++) { var p = pick(_PCT_P[diff]), b = pick(_PCT_B[diff]), y = p * b / 100; if (y === Math.floor(y)) return { slots: { p: p, b: b, y: y }, a: p, k: 'whatPct', v: randInt(0, 999) }; } return null; }
function _pctChange() { for (var i = 0; i < 40; i++) { var old = pick([80, 100, 120, 150, 160, 200, 250, 400]); var pc = pick([10, 20, 25, 40, 50, 60, 75]); var nw = Math.round(old * (1 + pc / 100)); if ((nw - old) * 100 % old === 0) return { slots: { old: old, nw: nw }, a: (nw - old) * 100 / old, k: 'pctChange', v: randInt(0, 999) }; } return null; }
function _pctSuccessive() { for (var i = 0; i < 40; i++) { var d1 = pick([10, 15, 20, 25]), d2 = pick([10, 20, 25]); var base = pick([200, 250, 300, 400, 500, 600, 800, 1000]); var f = base * (1 - d1 / 100) * (1 - d2 / 100); if (f === Math.floor(f)) return { slots: { d1: d1, d2: d2, base: base, f: f }, a: f, k: 'successive', v: randInt(0, 999) }; } return null; }
function _pctNetTrap() { var x = pick([10, 20, 30, 40, 50]); return { slots: { x: x }, a: x * x / 100, k: 'netTrap', v: randInt(0, 999) }; }
var _PCT_ARCH = {
  easy: [{ k: 'directOf', skill: 'direct', build: function (d) { return _pctDirect(d); } }],
  medium: [{ k: 'directOf', skill: 'direct', build: function (d) { return _pctDirect(d); } }, { k: 'reverse', skill: 'inverse', build: function (d) { return _pctReverse(d); } }, { k: 'whatPct', skill: 'inverse', build: function (d) { return _pctWhat(d); } }],
  /* ADR-094 (hard-tier de-dilution): hard drops direct/reverse/whatPct — those ARE the medium archetypes, differing
     only by number pool — so a "hard" percentage question always demands genuine multi-step reasoning (change on the
     original base, successive discounts, or the compound +x%/−x% trap). */
  hard: [{ k: 'pctChange', skill: 'multi-step', build: function () { return _pctChange(); } }, { k: 'successive', skill: 'multi-step', build: function () { return _pctSuccessive(); } }, { k: 'netTrap', skill: 'multi-step', build: function () { return _pctNetTrap(); } }]
};
function _pctSafe(diff) { var b = pick([100, 200, 400, 500, 800, 1000]); var p = pick(_PCT_P[diff]); return { q: p + '% of ' + b + ' = ?', a: p * b / 100, k: 'directOf', explain: p + '% of ' + b + ' = ' + (p * b / 100) + '.' }; }
/* hard PRIMARY must stay a HARD archetype (netTrap always succeeds and never returns null), so the guaranteed-clean
   fallback can never inject the easy 'directOf' key into a hard question (ADR-094 lockstep with TIER_KEYS). */
var _PCT_PRIMARY = { easy: function () { return _pctSafe('easy'); }, medium: function () { return _pctSafe('medium'); }, hard: function () { return _pctNetTrap(); } };
function genPercentage() { return _genArch('percentages', _PCT_ARCH, _PCT_PRIMARY); }

/** Mental multiplication: varied sub-types including 3-factor and squaring */
/** Mental multiplication (ADR-083 archetypes: multiply · divide-inverse · 3-factor · mental-square). */
/* ADR-111 Phase F: slots + variant seed; surface rendered from locales/gen/*.quant.js. */
function _mulTwo(diff) { var x, y; if (diff === 'easy') { x = randInt(2, 20); y = randInt(2, 12); } else if (diff === 'hard') { x = randInt(12, 50); y = randInt(6, 25); } else { x = randInt(6, 30); y = randInt(4, 20); } var tens = 10 * Math.floor(y / 10), un = y % 10; return { slots: { x: x, y: y, tens: tens, un: un }, a: x * y, k: 'multiply', v: randInt(0, 999) }; }
function _mulDiv(diff) { var x, y; if (diff === 'hard') { x = randInt(6, 25); y = randInt(4, 20); } else { x = randInt(3, 15); y = randInt(3, 15); } var p = x * y; return { slots: { x: x, y: y, p: p }, a: y, k: 'divide', v: randInt(0, 999) }; }
function _mul3(diff) { var a, b, c; if (diff === 'hard') { a = randInt(4, 12); b = randInt(3, 8); c = randInt(2, 6); } else { a = randInt(2, 8); b = randInt(2, 6); c = randInt(2, 5); } if (a * b * c > 1200) c = Math.max(2, Math.floor(1000 / (a * b))); return { slots: { a: a, b: b, c: c }, a: a * b * c, k: 'threeFactor', v: randInt(0, 999) }; }
function _mulSquare() { var n = pick([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25]); var r = Math.round(n / 10) * 10, d = n - r; return { slots: { n: n, r: r, d: d }, a: n * n, k: 'mentalSquare', v: randInt(0, 999) }; }
var _MUL_ARCH = {
  easy: [{ k: 'multiply', skill: 'direct', build: function (d) { return _mulTwo(d); } }],
  /* ADR-094: mentalSquare (fixed 11–25², which ignored difficulty) sat in HARD where it was easier than a medium
     two-digit product — it now lives in medium (its true level). Hard is multiply/divide/threeFactor at their hard
     number ranges, where magnitude is the honest difficulty axis for mental arithmetic. */
  medium: [{ k: 'multiply', skill: 'direct', build: function (d) { return _mulTwo(d); } }, { k: 'divide', skill: 'inverse', build: function (d) { return _mulDiv(d); } }, { k: 'threeFactor', skill: 'multi-step', build: function (d) { return _mul3(d); } }, { k: 'mentalSquare', skill: 'multi-step', build: function () { return _mulSquare(); } }],
  hard: [{ k: 'multiply', skill: 'direct', build: function (d) { return _mulTwo(d); } }, { k: 'divide', skill: 'inverse', build: function (d) { return _mulDiv(d); } }, { k: 'threeFactor', skill: 'multi-step', build: function (d) { return _mul3(d); } }]
};
var _MUL_PRIMARY = { easy: function () { return _mulTwo('easy'); }, medium: function () { return _mulTwo('medium'); }, hard: function () { return _mulTwo('hard'); } };
function genMultiplication() { return _genArch('multiplication', _MUL_ARCH, _MUL_PRIMARY); }

/** Ratio & proportion (ADR-083 archetypes: divide-in-ratio · find-term · combine A:B:C · percent↔ratio). */
function _ratDivide(diff) { var pr = pick(diff === 'hard' ? [[2, 3], [3, 4], [3, 5], [4, 7], [5, 8], [2, 7], [3, 8], [5, 9]] : [[2, 3], [3, 4], [3, 5], [4, 5], [1, 2]]); var parts = pr[0] + pr[1]; var total = parts * pick([20, 25, 30, 40, 50, 60, 80, 100]); var a = total * pr[0] / parts, nm = _two(); return { q: '₹' + total + ' is divided between ' + nm[0] + ' and ' + nm[1] + ' in the ratio ' + pr[0] + ' : ' + pr[1] + '. ' + nm[0] + ' gets ₹?', a: a, k: 'divide', explain: 'Total parts = ' + pr[0] + ' + ' + pr[1] + ' = ' + parts + '. One part = ' + total + ' ÷ ' + parts + ' = ' + (total / parts) + '. ' + nm[0] + ' = ' + pr[0] + ' × ' + (total / parts) + ' = ' + a + '.' }; }
function _ratTerm(diff) { var pr = pick(diff === 'hard' ? [[2, 3], [3, 4], [3, 5], [4, 7], [5, 8]] : [[2, 3], [3, 4], [3, 5], [4, 5]]); var one = pick([20, 25, 30, 40, 50, 60]); var aVal = pr[0] * one, bVal = pr[1] * one; return { q: 'A : B = ' + pr[0] + ' : ' + pr[1] + ' and A = ' + aVal + '. B = ?', a: bVal, k: 'findTerm', explain: 'One part = A ÷ ' + pr[0] + ' = ' + aVal + ' ÷ ' + pr[0] + ' = ' + one + '. B = ' + pr[1] + ' × ' + one + ' = ' + bVal + '.' }; }
function _ratCombine() { var abList = [[2, 3], [3, 4], [3, 5], [4, 5], [2, 5], [5, 6], [3, 7]]; var ab = pick(abList); var bcList = [[3, 4], [4, 5], [5, 6], [5, 3], [7, 3], [6, 5], [7, 4]].filter(function (x) { return x[0] === ab[1]; }); if (!bcList.length) return null; var bc = pick(bcList); var g = _gcd(ab[0], bc[1]); return { q: 'A : B = ' + ab[0] + ' : ' + ab[1] + ' and B : C = ' + bc[0] + ' : ' + bc[1] + '. A : C = ?', a: (ab[0] / g) + ':' + (bc[1] / g), k: 'combine', explain: 'B is common (' + ab[1] + '=' + bc[0] + '), so A : C = ' + ab[0] + ' : ' + bc[1] + ' = ' + (ab[0] / g) + ' : ' + (bc[1] / g) + ' after dividing by ' + g + '.' }; }
var _RAT_PCT = { easy: [['25% more', '5:4'], ['20% less', '4:5'], ['50% more', '3:2'], ['20% more', '6:5'], ['25% less', '3:4'], ['10% less', '9:10']], hard: [['12.5% more', '9:8'], ['16.66% less', '5:6'], ['37.5% more', '11:8'], ['11.11% less', '8:9'], ['66.66% more', '5:3'], ['150% more', '5:2'], ['40% more', '7:5'], ['75% more', '7:4']] };
function _ratPct(diff) { var s = pick(diff === 'hard' ? _RAT_PCT.hard.concat(_RAT_PCT.easy) : _RAT_PCT.easy); return { q: 'A is ' + s[0] + ' than B. A : B = ?', a: s[1], k: 'pctRatio', explain: 'Write A as a fraction of B: "' + s[0] + '" → A/B = ' + s[1].replace(':', '/') + ', so A : B = ' + s[1] + ' in lowest terms.' }; }
var _RATIO_ARCH = {
  easy: [{ k: 'divide', skill: 'direct', build: function (d) { return _ratDivide(d); } }, { k: 'pctRatio', skill: 'direct', build: function (d) { return _ratPct(d); } }],
  medium: [{ k: 'divide', skill: 'direct', build: function (d) { return _ratDivide(d); } }, { k: 'findTerm', skill: 'inverse', build: function (d) { return _ratTerm(d); } }, { k: 'pctRatio', skill: 'formula', build: function (d) { return _ratPct(d); } }],
  /* ADR-094: hard drops the direct 'divide' archetype (that is the EASY tier) — a hard ratio question is now always
     inverse (findTerm), multi-step (combine A:B:C) or the harder pct→ratio conversions. */
  hard: [{ k: 'findTerm', skill: 'inverse', build: function (d) { return _ratTerm(d); } }, { k: 'combine', skill: 'multi-step', build: function () { return _ratCombine(); } }, { k: 'pctRatio', skill: 'formula', build: function (d) { return _ratPct(d); } }]
};
var _RATIO_PRIMARY = { easy: function () { return _ratDivide('easy'); }, medium: function () { return _ratDivide('medium'); }, hard: function () { return _ratTerm('hard'); } };
function genRatio() { return _genArch('ratios', _RATIO_ARCH, _RATIO_PRIMARY); }

/** Averages (ADR-083 archetypes: mean · missing-term · weighted-two-group · new-member). */
function _avgList(count, avg, spread) { var nums = [], s = 0; for (var i = 0; i < count - 1; i++) { var v = Math.max(1, avg + randInt(-spread, spread)); nums.push(v); s += v; } var last = avg * count - s; if (last < 1) return null; nums.push(last); return nums; }
function _avgMean(diff) { var count = diff === 'easy' ? randInt(3, 4) : (diff === 'hard' ? randInt(4, 6) : randInt(3, 5)); var avg = diff === 'easy' ? randInt(15, 45) : (diff === 'hard' ? randInt(30, 90) : randInt(20, 70)); var nums = _avgList(count, avg, diff === 'easy' ? 8 : (diff === 'hard' ? 25 : 15)); if (!nums) return null; return { slots: { nums: nums, count: count, avg: avg }, a: avg, k: 'mean', v: randInt(0, 999) }; }
function _avgMissing(diff) { var count = diff === 'hard' ? randInt(4, 6) : randInt(3, 5); var avg = randInt(20, 80); var known = [], s = 0; for (var i = 0; i < count - 1; i++) { var v = Math.max(1, avg + randInt(-25, 25)); known.push(v); s += v; } var x = avg * count - s; if (x < 1 || x > 250) return null; return { slots: { known: known, avg: avg, count: count, sum: s, x: x }, a: x, k: 'missing', v: randInt(0, 999) }; }
function _avgWeighted() { for (var i = 0; i < 40; i++) { var m = pick([2, 3, 4, 5, 6, 8, 10]), n = pick([2, 3, 4, 5, 6, 8, 10]); var a = pick([20, 30, 40, 50, 60]), b = pick([20, 30, 40, 50, 60, 70, 80]); var ov = (m * a + n * b) / (m + n); if (ov === Math.floor(ov) && a !== b) return { slots: { m: m, n: n, a: a, b: b, ov: ov }, a: ov, k: 'weighted', v: randInt(0, 999) }; } return null; }
function _avgNewMember() { for (var i = 0; i < 40; i++) { var n = pick([4, 5, 6, 8, 10]); var A = pick([20, 30, 40, 50, 60]); var B = A + pick([1, 2, 3, 4, 5]); var x = B * (n + 1) - A * n; if (x > 0 && x < 300) return { slots: { n: n, A: A, B: B, x: x }, a: x, k: 'newMember', v: randInt(0, 999) }; } return null; }
var _AVG_ARCH = {
  easy: [{ k: 'mean', skill: 'direct', build: function (d) { return _avgMean(d); } }],
  medium: [{ k: 'mean', skill: 'direct', build: function (d) { return _avgMean(d); } }, { k: 'missing', skill: 'inverse', build: function (d) { return _avgMissing(d); } }],
  /* ADR-094: hard drops plain 'mean' (easy) and 'missing' (medium) — a hard averages question is now always
     weighted two-group or the new-member/replacement reasoning. PRIMARY.hard already yields 'weighted'. */
  hard: [{ k: 'weighted', skill: 'multi-step', build: function () { return _avgWeighted(); } }, { k: 'newMember', skill: 'multi-step', build: function () { return _avgNewMember(); } }]
};
var _AVG_PRIMARY = {
  easy: function () { var a = randInt(15, 45); return { q: 'The average of ' + [a - 2, a, a + 2].join(', ') + ' = ?', a: a, k: 'mean', explain: 'The three numbers are evenly spaced around ' + a + ', so the average is the middle value ' + a + '.' }; },
  medium: function () { var a = randInt(20, 60); return { q: 'The average of ' + [a - 3, a - 1, a + 1, a + 3].join(', ') + ' = ?', a: a, k: 'mean', explain: 'The values pair up around ' + a + ' (sum = ' + (4 * a) + '), so the average is ' + a + '.' }; },
  /* ADR-093: the hard fallback must EARN its tier — a weighted two-group average, never five equal numbers */
  hard: function () { var m = pick([2, 3, 4]), n = pick([4, 6, 8]), a = pick([30, 40, 50]), b = a + pick([10, 20]); var ov = (m * a + n * b) / (m + n); if (ov !== Math.floor(ov)) { m = 2; n = 4; a = 40; b = 52; ov = (2 * 40 + 4 * 52) / 6; } return { q: 'The average weight of ' + m + ' boys is ' + a + ' kg and of ' + n + ' girls is ' + b + ' kg. The average weight of the whole group = ? kg', a: ov, k: 'weighted', explain: 'Weighted mean = (' + m + '×' + a + ' + ' + n + '×' + b + ') ÷ ' + (m + n) + ' = ' + ov + ' kg.' }; }
};
function genAverage() { return _genArch('averages', _AVG_ARCH, _AVG_PRIMARY); }

/** Profit & Loss (ADR-083 archetypes: SP-from-profit · SP-from-loss · profit% · find-CP (reverse) · successive). CP is
 *  always the base for profit/loss %. */
var _CP = { easy: [100, 120, 150, 200, 250, 300, 400, 500], medium: [120, 125, 144, 150, 160, 175, 200, 225, 240, 250, 288, 300, 360, 400, 450, 480, 500], hard: [125, 144, 160, 175, 200, 225, 240, 250, 280, 288, 300, 320, 360, 375, 400, 432, 450, 480, 500, 560, 600] };
function _plSPprofit(diff) { for (var i = 0; i < 40; i++) { var pr = pick(diff === 'easy' ? [10, 20, 25, 50] : (diff === 'hard' ? [5, 8, 10, 12, 15, 20, 25, 30, 40, 50] : [5, 10, 15, 20, 25, 30, 40, 50])); var cp = pick(_CP[diff]); var sp = cp * (1 + pr / 100); if (sp === Math.floor(sp)) return { slots: { cp: cp, pr: pr, sp: sp }, a: sp, k: 'spProfit', v: randInt(0, 999) }; } return null; }
function _plSPloss(diff) { for (var i = 0; i < 40; i++) { var lr = pick(diff === 'easy' ? [10, 20, 25] : [5, 10, 15, 20, 25]); var cp = pick(_CP[diff]); var sp = cp * (1 - lr / 100); if (sp === Math.floor(sp)) return { slots: { cp: cp, lr: lr, sp: sp }, a: sp, k: 'spLoss', v: randInt(0, 999) }; } return null; }
function _plProfitPct(diff) { for (var i = 0; i < 40; i++) { var pr = pick([10, 15, 20, 25, 30, 50]); var cp = pick(_CP[diff]); var sp = cp * (1 + pr / 100); if (sp === Math.floor(sp)) return { slots: { cp: cp, pr: pr, sp: sp }, a: pr, k: 'profitPct', v: randInt(0, 999) }; } return null; }
function _plFindCP(diff) { for (var i = 0; i < 40; i++) { var pr = pick([10, 20, 25, 50]); var cp = pick(_CP[diff]); var sp = cp * (1 + pr / 100); if (sp === Math.floor(sp)) return { slots: { cp: cp, pr: pr, sp: sp }, a: cp, k: 'findCP', v: randInt(0, 999) }; } return null; }
function _plSuccessive() { for (var i = 0; i < 40; i++) { var pl = pick([[10, 10], [20, 10], [10, 20], [25, 20], [15, 10]]); var cp = pick([100, 200, 250, 400, 500, 800]); var sp = cp * (1 + pl[0] / 100) * (1 + pl[1] / 100); if (sp === Math.floor(sp)) return { slots: { cp: cp, p0: pl[0], p1: pl[1], sp: sp }, a: sp, k: 'successive', v: randInt(0, 999) }; } return null; }
var _PL_ARCH = {
  easy: [{ k: 'spProfit', skill: 'direct', build: function (d) { return _plSPprofit(d); } }, { k: 'spLoss', skill: 'direct', build: function (d) { return _plSPloss(d); } }],
  medium: [{ k: 'spProfit', skill: 'direct', build: function (d) { return _plSPprofit(d); } }, { k: 'spLoss', skill: 'direct', build: function (d) { return _plSPloss(d); } }, { k: 'profitPct', skill: 'inverse', build: function (d) { return _plProfitPct(d); } }],
  /* ADR-095 (hard = earned): drop the direct 'spLoss' (an easy archetype) — hard is profit% (inverse), find-CP
     (reverse) and successive (multi-step). */
  hard: [{ k: 'profitPct', skill: 'inverse', build: function (d) { return _plProfitPct(d); } }, { k: 'findCP', skill: 'inverse', build: function (d) { return _plFindCP(d); } }, { k: 'successive', skill: 'multi-step', build: function () { return _plSuccessive(); } }]
};
var _PL_PRIMARY = {
  easy: function () { return { q: 'The cost price is ₹200 and the profit is 25%. The selling price = ₹?', a: 250, k: 'spProfit', explain: 'SP = 200 × 1.25 = ₹250.' }; },
  medium: function () { return { q: 'An article bought for ₹200 is sold for ₹250. The profit percent = ?', a: 25, k: 'profitPct', explain: 'Profit% = (250 − 200)/200 × 100 = 25%.' }; },
  hard: function () { return { q: 'By selling an article for ₹250, a shopkeeper gains 25%. The cost price = ₹?', a: 200, k: 'findCP', explain: 'CP = 250 ÷ 1.25 = ₹200.' }; }
};
function genProfitLoss() { return _genArch('profit-loss', _PL_ARCH, _PL_PRIMARY); }

/** Time, Speed, Distance — 4 sub-types with wording variety */
/** Time, Speed & Distance (ADR-083 archetypes: distance · time · speed · average-speed). Stems keep speed × time in
 *  order for distance, and use magnitudes that recompute unambiguously (distance ≥ 2× speed). */
var _SPD = { easy: [30, 40, 45, 50, 60, 75, 80, 90, 100], medium: [25, 30, 35, 36, 40, 45, 48, 50, 54, 56, 60, 70, 72, 75, 80, 90, 96], hard: [36, 40, 45, 48, 50, 54, 56, 60, 64, 72, 75, 80, 90, 96, 100, 108, 112, 120] };
function _tsdDist(diff) { var s = pick(_SPD[diff]); var t = randInt(2, diff === 'easy' ? 5 : (diff === 'hard' ? 10 : 8)); return { q: pick(['A car travels at ' + s + ' km/h for ' + t + ' hours. The distance covered = ? km', 'Moving at ' + s + ' km/h for ' + t + ' hours, a train covers ? km', 'At a steady ' + s + ' km/h for ' + t + ' hours, the distance = ? km']), a: s * t, k: 'distance', explain: 'Distance = speed × time = ' + s + ' × ' + t + ' = ' + (s * t) + ' km.' }; }
function _tsdTime(diff) { var s = pick(_SPD[diff]); var t = randInt(2, 6); var d = s * t; return { q: pick(['A car covers ' + d + ' km at ' + s + ' km/h. The time taken = ? hours', 'At ' + s + ' km/h, the time to cover ' + d + ' km = ? hours', 'Travelling ' + d + ' km at ' + s + ' km/h takes ? hours']), a: t, k: 'time', explain: 'Time = distance ÷ speed = ' + d + ' ÷ ' + s + ' = ' + t + ' hours.' }; }
function _tsdSpeed(diff) { var s = pick(_SPD[diff]); var t = randInt(2, 6); var d = s * t; return { q: pick(['A train covers ' + d + ' km in ' + t + ' hours. Its speed = ? km/h', 'Covering ' + d + ' km in ' + t + ' hours, the speed = ? km/h', 'A bus runs ' + d + ' km in ' + t + ' hours. Average speed = ? km/h']), a: s, k: 'speed', explain: 'Speed = distance ÷ time = ' + d + ' ÷ ' + t + ' = ' + s + ' km/h.' }; }
function _tsdAvg(diff) { for (var i = 0; i < 30; i++) { var pr = pick(diff === 'hard' ? [[60, 80], [40, 60], [50, 70], [72, 48], [90, 60], [45, 55]] : [[30, 60], [40, 80], [50, 100], [60, 90]]); var ans = (2 * pr[0] * pr[1]) / (pr[0] + pr[1]); if (ans === Math.floor(ans)) return { q: 'A person covers equal distances at ' + pr[0] + ' km/h and ' + pr[1] + ' km/h. The average speed for the whole journey = ? km/h', a: ans, k: 'avgSpeed', explain: 'For equal distances, average speed = 2·s₁·s₂/(s₁+s₂) = 2×' + pr[0] + '×' + pr[1] + '/(' + pr[0] + '+' + pr[1] + ') = ' + ans + ' km/h — the harmonic mean, never the simple average.' }; } return null; }
/* ADR-093: medium/hard are EARNED — medium adds km/h ↔ m/s conversion; hard is relative speed, train crossing and
   average-speed (harmonic mean), never a plain read at a bigger number. */
function _tsdConvert() {
  if (Math.random() < 0.5) { var k = 18 * pick([1, 2, 3, 4, 5, 6]); return { q: pick(['Express ' + k + ' km/h in metres per second.', 'A train moves at ' + k + ' km/h. Its speed in m/s = ?']), a: k * 5 / 18, k: 'unitConvert', explain: 'km/h → m/s: multiply by 5/18. ' + k + ' × 5/18 = ' + (k * 5 / 18) + ' m/s.' }; }
  var m = 5 * pick([2, 3, 4, 5, 6, 8, 10]);
  return { q: pick(['Express ' + m + ' m/s in km/h.', 'A sprinter runs at ' + m + ' m/s. That speed in km/h = ?']), a: m * 18 / 5, k: 'unitConvert', explain: 'm/s → km/h: multiply by 18/5. ' + m + ' × 18/5 = ' + (m * 18 / 5) + ' km/h.' };
}
function _tsdRelative() {
  for (var i = 0; i < 40; i++) {
    var s1 = pick([40, 50, 60, 70, 80]), s2 = pick([30, 40, 50, 60]);
    var t = randInt(2, 5), d = (s1 + s2) * t;
    return { q: pick(['Two trains start ' + d + ' km apart and travel towards each other at ' + s1 + ' km/h and ' + s2 + ' km/h. After how many hours do they meet?', 'Two cars ' + d + ' km apart drive towards each other at ' + s1 + ' km/h and ' + s2 + ' km/h. They meet after ? hours']), a: t, k: 'relativeSpeed', explain: 'Moving towards each other, speeds ADD: closing speed = ' + s1 + ' + ' + s2 + ' = ' + (s1 + s2) + ' km/h. Time = ' + d + ' ÷ ' + (s1 + s2) + ' = ' + t + ' hours.' };
  }
  return null;
}
function _tsdTrain() {
  for (var i = 0; i < 40; i++) {
    var v = 18 * pick([2, 3, 4, 5]);   // km/h whose m/s is integer
    var ms = v * 5 / 18, t = pick([6, 8, 10, 12, 15, 20]);
    if (Math.random() < 0.5) {
      var len = ms * t;
      if (len < 60 || len > 500) continue;
      return { q: 'A train ' + len + ' m long is running at ' + v + ' km/h. How many seconds does it take to pass a pole?', a: t, k: 'trainCrossing', explain: 'Convert the speed: ' + v + ' km/h = ' + ms + ' m/s. Passing a pole means covering its OWN length: ' + len + ' ÷ ' + ms + ' = ' + t + ' s.' };
    }
    var len2 = pick([100, 120, 150, 180, 200]), plat = ms * t - len2;
    if (plat < 50 || plat > 500) continue;
    return { q: 'A train ' + len2 + ' m long, running at ' + v + ' km/h, crosses a platform ' + plat + ' m long in ? seconds', a: t, k: 'trainCrossing', explain: 'Speed = ' + v + ' km/h = ' + ms + ' m/s. To clear a platform the train covers train + platform = ' + len2 + ' + ' + plat + ' = ' + (len2 + plat) + ' m. Time = ' + (len2 + plat) + ' ÷ ' + ms + ' = ' + t + ' s.' };
  }
  return null;
}
var _TSD_ARCH = {
  easy: [{ k: 'distance', skill: 'direct', build: function (d) { return _tsdDist(d); } }, { k: 'time', skill: 'inverse', build: function (d) { return _tsdTime(d); } }, { k: 'speed', skill: 'inverse', build: function (d) { return _tsdSpeed(d); } }],
  medium: [{ k: 'distance', skill: 'direct', build: function (d) { return _tsdDist(d); } }, { k: 'time', skill: 'inverse', build: function (d) { return _tsdTime(d); } }, { k: 'speed', skill: 'inverse', build: function (d) { return _tsdSpeed(d); } }, { k: 'unitConvert', skill: 'formula', build: function () { return _tsdConvert(); } }],
  hard: [{ k: 'avgSpeed', skill: 'multi-step', build: function (d) { return _tsdAvg(d); } }, { k: 'relativeSpeed', skill: 'multi-step', build: function () { return _tsdRelative(); } }, { k: 'trainCrossing', skill: 'multi-step', build: function () { return _tsdTrain(); } }]
};
var _TSD_PRIMARY = { easy: function () { return _tsdDist('easy'); }, medium: function () { return _tsdDist('medium'); }, hard: function () { return { q: 'Two trains start 300 km apart and travel towards each other at 60 km/h and 40 km/h. After how many hours do they meet?', a: 3, k: 'relativeSpeed', explain: 'Closing speed = 100 km/h; 300 ÷ 100 = 3 hours.' }; } };
function genTSD() { return _genArch('time-speed-distance', _TSD_ARCH, _TSD_PRIMARY); }

/** Time & Work (ADR-083 archetypes: together · work-done-% · workers↔days scaling). LCM/units thinking. */
function _twTogether(diff) { for (var i = 0; i < 40; i++) { var a = pick(diff === 'easy' ? [2, 3, 4, 6] : (diff === 'hard' ? [5, 6, 8, 10, 12, 15] : [3, 4, 5, 6, 10])); var b = pick(diff === 'easy' ? [3, 4, 6] : (diff === 'hard' ? [6, 8, 10, 12, 15, 20] : [4, 5, 6, 10, 12])); if (a === b) continue; if ((a * b) % (a + b) === 0) return { q: 'A can do a piece of work in ' + a + ' days and B in ' + b + ' days. Working together, they finish it in ? days', a: (a * b) / (a + b), k: 'together', explain: 'Together time = (a × b)/(a + b) = (' + a + ' × ' + b + ')/(' + a + ' + ' + b + ') = ' + (a * b) + '/' + (a + b) + ' = ' + ((a * b) / (a + b)) + ' days. Add the RATES (1/a + 1/b), never the days.' }; } return null; }
function _twWorkDone(diff) { var days = pick(diff === 'easy' ? [2, 4, 5, 10] : (diff === 'hard' ? [5, 8, 10, 20, 25] : [4, 5, 8, 10])); var wd = 0; for (var i = 0; i < 20; i++) { wd = randInt(1, days - 1); if ((wd * 100) % days === 0) break; } if ((wd * 100) % days !== 0) return null; return { q: 'A can finish a job in ' + days + ' days. In ' + wd + ' days he completes ? % of the work.', a: wd * 100 / days, k: 'workDone', explain: 'Fraction done = ' + wd + '/' + days + ', so ' + wd + '/' + days + ' × 100 = ' + (wd * 100 / days) + '%.' }; }
function _twScale(diff) { for (var i = 0; i < 40; i++) { var w1 = pick(diff === 'easy' ? [2, 3, 4, 5] : (diff === 'hard' ? [4, 5, 6, 8, 10] : [3, 4, 5, 6])); var dp = pick(diff === 'easy' ? [4, 6, 8, 10, 12] : (diff === 'hard' ? [6, 8, 10, 12, 15, 20] : [6, 8, 10, 12])); var tot = w1 * dp, opts = []; for (var w = 2; w <= 20; w++) { if (w !== w1 && tot % w === 0) opts.push(w); } if (!opts.length) continue; var w2 = pick(opts); return { q: 'If ' + w1 + ' workers finish a task in ' + dp + ' days, then ' + w2 + ' workers finish the same task in ? days', a: tot / w2, k: 'workersScale', explain: 'Total work = ' + w1 + ' × ' + dp + ' = ' + tot + ' worker-days. Time for ' + w2 + ' workers = ' + tot + ' ÷ ' + w2 + ' = ' + (tot / w2) + ' days (workers and days are inversely proportional).' }; } return null; }
/* ADR-095: a GENUINE hard archetype — the inverse of "together". Given the combined time and one worker's solo time,
   find the other's solo time: 1/b = 1/T − 1/a → b = aT/(a−T). Token order in the stem is [T, a] (combined first, then
   the known solo), matching the recompute branch. */
function _twInverse() { for (var i = 0; i < 60; i++) { var T = pick([2, 3, 4, 5, 6, 8]); var a = pick([6, 8, 9, 10, 12, 15, 18, 20, 24]); if (a <= T) continue; if ((a * T) % (a - T) !== 0) continue; var b = (a * T) / (a - T); if (b <= T || b > 90) continue; var nm = _two(); return { q: nm[0] + ' and ' + nm[1] + ' together can finish a piece of work in ' + T + ' days. ' + nm[0] + ' alone can do it in ' + a + ' days. In how many days can ' + nm[1] + ' alone finish it?', a: b, k: 'inverseTogether', explain: 'Work with RATES: 1/' + nm[1] + ' = 1/' + T + ' − 1/' + a + ' = (' + a + ' − ' + T + ')/(' + a + '×' + T + ') = ' + (a - T) + '/' + (a * T) + '. So ' + nm[1] + ' alone = ' + (a * T) + '/' + (a - T) + ' = ' + b + ' days.' }; } return null; }
var _TW_ARCH = {
  easy: [{ k: 'together', skill: 'formula', build: function (d) { return _twTogether(d); } }, { k: 'workDone', skill: 'direct', build: function (d) { return _twWorkDone(d); } }],
  medium: [{ k: 'together', skill: 'formula', build: function (d) { return _twTogether(d); } }, { k: 'workDone', skill: 'direct', build: function (d) { return _twWorkDone(d); } }, { k: 'workersScale', skill: 'inverse', build: function (d) { return _twScale(d); } }],
  /* ADR-095: hard previously re-used the easy 'together'/'workDone' with bigger numbers — no unique hard archetype.
     Now hard is the inverse-together deduction and the workers↔days inverse-proportion scaling. */
  hard: [{ k: 'inverseTogether', skill: 'multi-step', build: function () { return _twInverse(); } }, { k: 'workersScale', skill: 'inverse', build: function (d) { return _twScale(d); } }]
};
var _TW_PRIMARY = {
  easy: function () { return { q: 'A can do a piece of work in 6 days and B in 3 days. Working together, they finish it in ? days', a: 2, k: 'together', explain: '(6 × 3)/(6 + 3) = 18/9 = 2 days.' }; },
  medium: function () { return { q: 'If 4 workers finish a task in 6 days, then 8 workers finish the same task in ? days', a: 3, k: 'workersScale', explain: '24 worker-days ÷ 8 = 3 days.' }; },
  /* hard PRIMARY is the inverse-together deduction (clean fixed instance, never null): together 6, A 10 → B 15. */
  hard: function () { return { q: 'A and B together can finish a piece of work in 6 days. A alone can do it in 10 days. In how many days can B alone finish it?', a: 15, k: 'inverseTogether', explain: '1/B = 1/6 − 1/10 = (10 − 6)/60 = 4/60 = 1/15, so B alone = 15 days.' }; }
};
function genTimeWork() { return _genArch('time-and-work', _TW_ARCH, _TW_PRIMARY); }

/** Simplification / BODMAS (ADR-083 archetypes: multiply-add · divide-add · full-BODMAS). Clean integers; the stem is a
 *  pure arithmetic expression so the harness re-evaluates it independently. */
function _simEasy() { var a = randInt(2, 12), b = randInt(2, 12), c = randInt(2, 30); return { slots: { a: a, b: b, c: c }, a: a * b + c, k: 'multiplyAdd', v: randInt(0, 999) }; }
function _simMed() { var dv = pick([2, 3, 4, 5, 6]), num = dv * randInt(4, 15), add = randInt(5, 40); return { slots: { num: num, dv: dv, add: add }, a: num / dv + add, k: 'divideAdd', v: randInt(0, 999) }; }
function _simHard() { var r = pick([2, 3, 4, 5, 6]), q = r * randInt(3, 12), p = randInt(3, 12), s = randInt(3, 15), t = randInt(2, 9); return { slots: { p: p, q: q, r: r, ss: s, t: t }, a: (p * q) / r + s * t, k: 'fullBodmas', v: randInt(0, 999) }; }
/* ADR-095: hard drops the fixed-range medium 'divideAdd' — a "hard" simplification is the full multi-operator BODMAS
   expression, not a two-step divide-add at bigger numbers. (Single rich archetype; the diversity check skips len-1 tiers.) */
var _SIM_ARCH = { easy: [{ k: 'multiplyAdd', skill: 'direct', build: function () { return _simEasy(); } }], medium: [{ k: 'divideAdd', skill: 'direct', build: function () { return _simMed(); } }, { k: 'multiplyAdd', skill: 'direct', build: function () { return _simEasy(); } }], hard: [{ k: 'fullBodmas', skill: 'multi-step', build: function () { return _simHard(); } }] };
var _SIM_PRIMARY = { easy: function () { return _simEasy(); }, medium: function () { return _simMed(); }, hard: function () { return _simHard(); } };
function genSimplification() { return _genArch('simplification', _SIM_ARCH, _SIM_PRIMARY); }

/** Number Series — next term (ADR-083 archetypes: arithmetic · geometric · growing-gap). Integer answers. */
function _nsArith(diff) { var start = randInt(2, 12), step = diff === 'easy' ? pick([2, 3, 5]) : pick([4, 6, 7, 9, 11]); var t = []; for (var i = 0; i < 5; i++) t.push(start + i * step); var ans = t.pop(); return { q: 'Find the next number: ' + t.join(', ') + ', ?', a: ans, k: 'arithmetic', explain: 'A constant difference of ' + step + ' (arithmetic progression): ' + t[t.length - 1] + ' + ' + step + ' = ' + ans + '.' }; }
function _nsGeo(diff) { var s0 = randInt(2, 5), r = pick([2, 3]); var t = []; for (var i = 0; i < 5; i++) t.push(s0 * Math.pow(r, i)); var ans = t.pop(); return { q: 'Find the next number: ' + t.join(', ') + ', ?', a: ans, k: 'geometric', explain: 'Each term is × ' + r + ' (geometric progression): ' + t[t.length - 1] + ' × ' + r + ' = ' + ans + '.' }; }
function _nsInc(diff) { var cur = randInt(1, 4), base = pick([2, 3, 4]), d = base; var t = []; for (var i = 0; i < 5; i++) { t.push(cur); cur += d; d += base; } var ans = t.pop(); var gap = t[t.length - 1] - t[t.length - 2] + base; return { q: 'Find the next number: ' + t.join(', ') + ', ?', a: ans, k: 'growingGap', explain: 'The gaps grow by ' + base + ' each step (constant second difference): the next gap is ' + gap + ', so ' + t[t.length - 1] + ' + ' + gap + ' = ' + ans + '.' }; }
/* ADR-093: hard patterns worth the name — n²±k series, and two interleaved APs (the classic banking series). */
function _nsSquares() {
  var k = pick([-2, -1, 1, 2, 3]), s = randInt(1, 4);
  var t = []; for (var i = 0; i < 5; i++) { var n = s + i; t.push(n * n + k); }
  var ans = t.pop();
  return { q: 'Find the next number: ' + t.join(', ') + ', ?', a: ans, k: 'squaresSeries', explain: 'Each term is a perfect square ' + (k >= 0 ? 'plus ' + k : 'minus ' + Math.abs(k)) + ': ' + t.map(function (v, i) { return (s + i) + '²' + (k >= 0 ? '+' + k : '−' + Math.abs(k)); }).join(', ') + '. Next = ' + (s + 4) + '²' + (k >= 0 ? '+' + k : '−' + Math.abs(k)) + ' = ' + ans + '.' };
}
function _nsAlt() {
  var a0 = randInt(2, 9), d1 = pick([3, 4, 5, 7]), b0 = randInt(20, 40), d2 = pick([-3, -2, 2, 3]);
  var t = []; for (var i = 0; i < 6; i++) t.push(i % 2 === 0 ? a0 + (i / 2) * d1 : b0 + ((i - 1) / 2) * d2);
  var ans = a0 + 3 * d1;   // 7th term belongs to the first chain
  return { q: 'Find the next number: ' + t.join(', ') + ', ?', a: ans, k: 'alternating', explain: 'Two series are interleaved: the odd positions go ' + a0 + ', ' + (a0 + d1) + ', ' + (a0 + 2 * d1) + ', … (+' + d1 + ') and the even positions form their own chain. The next term continues the FIRST chain: ' + (a0 + 2 * d1) + ' + ' + d1 + ' = ' + ans + '.' };
}
var _NS_ARCH = {
  easy: [{ k: 'arithmetic', skill: 'pattern', build: function (d) { return _nsArith(d); } }, { k: 'geometric', skill: 'pattern', build: function (d) { return _nsGeo(d); } }],
  medium: [{ k: 'arithmetic', skill: 'pattern', build: function (d) { return _nsArith(d); } }, { k: 'geometric', skill: 'pattern', build: function (d) { return _nsGeo(d); } }, { k: 'growingGap', skill: 'multi-step', build: function (d) { return _nsInc(d); } }],
  /* ADR-095: drop plain 'geometric' (an easy pattern) — hard is growing-gap, n²±k squares series and interleaved APs. */
  hard: [{ k: 'growingGap', skill: 'multi-step', build: function (d) { return _nsInc(d); } }, { k: 'squaresSeries', skill: 'pattern', build: function () { return _nsSquares(); } }, { k: 'alternating', skill: 'multi-step', build: function () { return _nsAlt(); } }]
};
var _NS_PRIMARY = { easy: function () { return _nsArith('easy'); }, medium: function () { return _nsArith('medium'); }, hard: function () { return _nsSquares(); } };
function genNumberSeries() { return _genArch('number-series', _NS_ARCH, _NS_PRIMARY); }

/* ═══════════════════════════ ADR-083 Phase 3 — new topic generators ═══════════════════════════ */

/** Simple Interest (archetypes: find-SI · amount · find-rate · find-principal). P is a multiple of 100 → SI is clean. */
var _SI_P = [1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000];
function _siFind(diff) { var P = pick(_SI_P), R = pick(diff === 'easy' ? [5, 10] : (diff === 'hard' ? [4, 6, 8, 12, 15, 18] : [5, 8, 10, 12])), T = randInt(2, diff === 'hard' ? 6 : 4), si = P * R * T / 100, nm = _oneE(); return { slots: { P: P, R: R, T: T, si: si, nm: nm }, a: si, k: 'si', v: randInt(0, 999) }; }
function _siAmount(diff) { var P = pick(_SI_P), R = pick(diff === 'hard' ? [4, 6, 8, 12, 15] : [5, 8, 10, 12]), T = randInt(2, 4), si = P * R * T / 100, nm = _oneE(); return { slots: { P: P, R: R, T: T, si: si, nm: nm }, a: P + si, k: 'amount', v: randInt(0, 999) }; }
function _siRate(diff) { var P = pick(_SI_P), R = pick([5, 8, 10, 12, 15]), T = randInt(2, 5), si = P * R * T / 100; return { slots: { P: P, R: R, T: T, si: si }, a: R, k: 'findRate', v: randInt(0, 999) }; }
function _siPrincipal(diff) { var P = pick(_SI_P), R = pick([5, 8, 10, 12]), T = randInt(2, 5), si = P * R * T / 100; return { slots: { P: P, R: R, T: T, si: si }, a: P, k: 'findPrincipal', v: randInt(0, 999) }; }
var _SI_ARCH = {
  easy: [{ k: 'si', skill: 'direct', build: function (d) { return _siFind(d); } }, { k: 'amount', skill: 'direct', build: function (d) { return _siAmount(d); } }],
  medium: [{ k: 'si', skill: 'direct', build: function (d) { return _siFind(d); } }, { k: 'amount', skill: 'direct', build: function (d) { return _siAmount(d); } }, { k: 'findRate', skill: 'inverse', build: function (d) { return _siRate(d); } }],
  /* ADR-095: drop the direct 'si' and 'amount' (the easy archetypes) — hard is the inverse problems: find-rate and
     find-principal from a given interest. */
  hard: [{ k: 'findRate', skill: 'inverse', build: function (d) { return _siRate(d); } }, { k: 'findPrincipal', skill: 'inverse', build: function (d) { return _siPrincipal(d); } }]
};
/* hard PRIMARY repointed off 'si' (easy) to the inverse find-rate build — _siRate never returns null (ADR-095). */
var _SI_PRIMARY = { easy: function () { return _siFind('easy'); }, medium: function () { return _siFind('medium'); }, hard: function () { return _siRate('hard'); } };
function genSimpleInterest() { return _genArch('simple-interest', _SI_ARCH, _SI_PRIMARY); }

/** Compound Interest (archetypes: amount · CI · CI−SI difference). Retry-until-clean guarantees integer amounts. */
var _CI_P = [1000, 1200, 1500, 1600, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 16000, 20000];
function _ciAmount(diff) { for (var i = 0; i < 50; i++) { var R = pick(diff === 'easy' ? [10, 20] : [5, 10, 15, 20, 25]), T = pick(diff === 'hard' ? [2, 3] : [2]), P = pick(_CI_P), A = P * Math.pow(1 + R / 100, T); if (A === Math.floor(A)) { var nm = _oneE(); return { slots: { P: P, R: R, T: T, A: A, nm: nm }, a: A, k: 'amount', v: randInt(0, 999) }; } } return null; }
function _ciInterest(diff) { for (var i = 0; i < 50; i++) { var R = pick(diff === 'easy' ? [10, 20] : [5, 10, 15, 20, 25]), T = pick(diff === 'hard' ? [2, 3] : [2]), P = pick(_CI_P), A = P * Math.pow(1 + R / 100, T); if (A === Math.floor(A)) return { slots: { P: P, R: R, T: T, A: A }, a: A - P, k: 'ci', v: randInt(0, 999) }; } return null; }
function _ciDiff() { for (var i = 0; i < 50; i++) { var R = pick([5, 10, 15, 20, 25]), P = pick([1000, 1600, 2000, 2500, 4000, 5000, 8000, 10000, 16000, 20000]), d = P * R * R / 10000; if (d === Math.floor(d)) return { slots: { P: P, R: R, d: d }, a: d, k: 'ciSiDiff', v: randInt(0, 999) }; } return null; }
var _CI_ARCH = {
  easy: [{ k: 'amount', skill: 'direct', build: function (d) { return _ciAmount(d); } }],
  medium: [{ k: 'amount', skill: 'direct', build: function (d) { return _ciAmount(d); } }, { k: 'ci', skill: 'direct', build: function (d) { return _ciInterest(d); } }],
  /* ADR-095: drop the direct 'amount' (an easy archetype) — hard is CI (compute) and the CI−SI difference trap. */
  hard: [{ k: 'ci', skill: 'direct', build: function (d) { return _ciInterest(d); } }, { k: 'ciSiDiff', skill: 'multi-step', build: function () { return _ciDiff(); } }]
};
var _CI_PRIMARY = {
  easy: function () { return { q: 'Find the amount on ₹1000 at 10% per annum compounded annually for 2 years.', a: 1210, k: 'amount', explain: 'A = 1000 × 1.1² = ₹1210.' }; },
  medium: function () { return { q: 'Find the compound interest on ₹1000 at 10% per annum for 2 years, compounded annually.', a: 210, k: 'ci', explain: 'A = 1000 × 1.1² = ₹1210; CI = 1210 − 1000 = ₹210.' }; },
  hard: function () { return { q: 'The difference between the compound interest and the simple interest on ₹10000 at 10% per annum for 2 years = ₹?', a: 100, k: 'ciSiDiff', explain: 'CI − SI = P(R/100)² = 10000 × (10/100)² = ₹100.' }; }
};
function genCompoundInterest() { return _genArch('compound-interest', _CI_ARCH, _CI_PRIMARY); }

/** Partnership (archetypes: profit-share by capital · profit-share by capital×time). Profit splits in investment ratio. */
function _pRatio() { for (var i = 0; i < 40; i++) { var x = pick([2000, 3000, 4000, 5000, 6000, 8000, 9000, 10000, 12000]), y = pick([2000, 3000, 4000, 5000, 6000, 8000, 9000, 12000]); if (x === y) continue; var g = _gcd(x, y), nm = _two(); return { q: nm[0] + ' and ' + nm[1] + ' invest ₹' + x + ' and ₹' + y + ' respectively in a business. In what ratio should the annual profit be divided between them?', a: (x / g) + ':' + (y / g), k: 'shareRatio', explain: 'Profit is always divided in the ratio of the capitals invested. ' + x + ' : ' + y + ', dividing both by their HCF ' + g + ', gives ' + (x / g) + ' : ' + (y / g) + '.' }; } return null; }
function _pShare() { for (var i = 0; i < 40; i++) { var x = pick([2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000]), y = pick([2000, 3000, 4000, 5000, 6000, 8000, 9000, 12000]); if (x === y) continue; var g = _gcd(x, y), profit = (x + y) / g * pick([200, 300, 400, 500, 600, 700, 800, 1000]), share = profit * x / (x + y); if (share === Math.floor(share)) { var nm = _two(); return { q: nm[0] + ' and ' + nm[1] + ' start a business investing ₹' + x + ' and ₹' + y + ' respectively. Out of a total profit of ₹' + profit + ', ' + nm[0] + '’s share = ₹?', a: share, k: 'share2', explain: 'Profit is shared in the ratio of investments ' + x + ' : ' + y + '. ' + nm[0] + '’s share = ' + x + '/(' + x + '+' + y + ') × ' + profit + ' = ₹' + share + '.' }; } } return null; }
function _pShareTime() { for (var i = 0; i < 40; i++) { var x = pick([2, 3, 4, 5, 6]) * 1000, y = pick([2, 3, 4, 5, 6]) * 1000, m = pick([4, 6, 8, 12]), n = pick([4, 6, 8, 12]); var cx = x * m, cy = y * n; if (cx === cy) continue; var g = _gcd(cx, cy), profit = (cx + cy) / g * pick([100, 150, 200, 250, 300, 400, 500]), share = profit * cx / (cx + cy); if (share === Math.floor(share)) { var nm = _two(); return { q: nm[0] + ' invests ₹' + x + ' for ' + m + ' months and ' + nm[1] + ' invests ₹' + y + ' for ' + n + ' months. Out of a profit of ₹' + profit + ', ' + nm[0] + '’s share = ₹?', a: share, k: 'shareTime', explain: 'Weight each partner by capital × time: ' + nm[0] + ' = ' + x + '×' + m + ' = ' + cx + ', ' + nm[1] + ' = ' + y + '×' + n + ' = ' + cy + '. ' + nm[0] + '’s share = ' + cx + '/(' + cx + '+' + cy + ') × ' + profit + ' = ₹' + share + '.' }; } } return null; }
var _PART_ARCH = {
  easy: [{ k: 'shareRatio', skill: 'formula', build: function () { return _pRatio(); } }, { k: 'share2', skill: 'direct', build: function () { return _pShare(); } }],
  medium: [{ k: 'share2', skill: 'direct', build: function () { return _pShare(); } }, { k: 'shareTime', skill: 'multi-step', build: function () { return _pShareTime(); } }],
  hard: [{ k: 'shareTime', skill: 'multi-step', build: function () { return _pShareTime(); } }, { k: 'share2', skill: 'direct', build: function () { return _pShare(); } }]
};
var _PART_PRIMARY = {
  easy: function () { return { q: 'A and B start a business investing ₹4000 and ₹6000 respectively. Out of a total profit of ₹5000, A’s share = ₹?', a: 2000, k: 'share2', explain: 'Ratio 4000 : 6000 = 2 : 3. A’s share = 2/5 × 5000 = ₹2000.' }; },
  medium: function () { return { q: 'A and B start a business investing ₹4000 and ₹6000 respectively. Out of a total profit of ₹5000, A’s share = ₹?', a: 2000, k: 'share2', explain: 'Ratio 2 : 3 → A = 2/5 × 5000 = ₹2000.' }; },
  hard: function () { return { q: 'A invests ₹5000 for 6 months and B invests ₹5000 for 4 months. Out of a profit of ₹5000, A’s share = ₹?', a: 3000, k: 'shareTime', explain: 'A = 5000×6 = 30000, B = 5000×4 = 20000 → 3 : 2. A = 3/5 × 5000 = ₹3000.' }; }
};
function genPartnership() { return _genArch('partnership', _PART_ARCH, _PART_PRIMARY); }

/** Problems on Ages (archetypes: ratio-sum · age-difference-multiple · father-son-multiple). */
function _ageRatioSum(diff) { var pr = pick([[2, 3], [3, 4], [3, 5], [4, 5], [5, 7], [4, 7], [5, 6], [2, 5]]), k = randInt(diff === 'easy' ? 3 : 5, diff === 'hard' ? 14 : 10), S = (pr[0] + pr[1]) * k, nm = _two(); return { q: 'The present ages of ' + nm[0] + ' and ' + nm[1] + ' are in the ratio ' + pr[0] + ' : ' + pr[1] + '. If the sum of their ages is ' + S + ' years, the present age of ' + nm[0] + ' = ? years', a: pr[0] * k, k: 'ratioSum', explain: 'Let the ages be ' + pr[0] + 'x and ' + pr[1] + 'x. Then (' + pr[0] + ' + ' + pr[1] + ')x = ' + S + ' → x = ' + k + '. ' + nm[0] + ' = ' + pr[0] + 'x = ' + (pr[0] * k) + ' years.' }; }
function _agePresent(diff) { var t = pick([3, 4, 5, 6, 8, 10]), a = randInt(diff === 'easy' ? 6 : 10, diff === 'hard' ? 55 : 40), nm = _one(); return { q: '' + t + ' years ago, ' + nm + ' was ' + a + ' years old. ' + nm + '’s present age = ? years', a: a + t, k: 'presentAge', explain: 'Present age = age then + years elapsed = ' + a + ' + ' + t + ' = ' + (a + t) + ' years. (Going forward in time adds; “ago” means we add back.)' }; }
function _ageDiff() { for (var i = 0; i < 40; i++) { var mult = pick([2, 3]), t = pick([2, 4, 5, 6]), x = pick([4, 6, 8, 10, 12, 15, 18, 20]); var B = (x - (mult - 1) * t) / (mult - 1); if (B === Math.floor(B) && B >= 2 && B <= 60) { var nm = _two(); return { q: nm[0] + ' is ' + x + ' years older than ' + nm[1] + '. In ' + t + ' years, ' + nm[0] + ' will be ' + mult + ' times as old as ' + nm[1] + '. ' + nm[1] + '’s present age = ? years', a: B, k: 'ageDiff', explain: nm[0] + ' = ' + nm[1] + ' + ' + x + '. In ' + t + ' years: (' + nm[1] + ' + ' + x + ' + ' + t + ') = ' + mult + '(' + nm[1] + ' + ' + t + ') → ' + nm[1] + ' = ' + B + ' years.' }; } } return null; }
function _ageFatherSon() { for (var i = 0; i < 40; i++) { var n = pick([3, 4, 5, 6]), m = pick([2, 3]), t = pick([4, 5, 6, 8, 10]); if (n <= m) continue; var num = t * (m - 1), den = n - m; if (num % den !== 0) continue; var s = num / den; if (s < 2 || s > 55) continue; return { q: 'A father is now ' + n + ' times as old as his son. In ' + t + ' years he will be ' + m + ' times as old as his son. The son’s present age = ? years', a: s, k: 'fatherSon', explain: 'Let son = s, father = ' + n + 's. In ' + t + ' years: ' + n + 's + ' + t + ' = ' + m + '(s + ' + t + ') → s = ' + t + '(' + m + '−1)/(' + n + '−' + m + ') = ' + s + ' years.' }; } return null; }
var _AGE_ARCH = {
  easy: [{ k: 'ratioSum', skill: 'direct', build: function (d) { return _ageRatioSum(d); } }, { k: 'presentAge', skill: 'direct', build: function (d) { return _agePresent(d); } }],
  medium: [{ k: 'ratioSum', skill: 'direct', build: function (d) { return _ageRatioSum(d); } }, { k: 'ageDiff', skill: 'multi-step', build: function () { return _ageDiff(); } }],
  /* ADR-095: drop the direct 'ratioSum' (an easy archetype) — hard is the age-difference and father-son multiples,
     both multi-step equation problems. */
  hard: [{ k: 'ageDiff', skill: 'multi-step', build: function () { return _ageDiff(); } }, { k: 'fatherSon', skill: 'multi-step', build: function () { return _ageFatherSon(); } }]
};
/* hard PRIMARY repointed off 'ratioSum' (easy) to a guaranteed-clean father-son (ageDiff/fatherSon builds can retry-fail;
   this fixed instance never returns null): son=4 → father 16; in 8 yrs 24 = 2×12 (ADR-095). */
var _AGE_PRIMARY = { easy: function () { return _ageRatioSum('easy'); }, medium: function () { return _ageRatioSum('medium'); }, hard: function () { return { q: 'A father is now 4 times as old as his son. In 8 years he will be 2 times as old as his son. The son’s present age = ? years', a: 4, k: 'fatherSon', explain: 'Let son = s, father = 4s. In 8 years: 4s + 8 = 2(s + 8) → 2s = 8 → s = 4 years.' }; } };
function genAges() { return _genArch('ages', _AGE_ARCH, _AGE_PRIMARY); }

/** Mixtures & Alligations (archetypes: alligation-ratio [string] · mean-price · alligation-quantity). */
var _MIX_ITEMS = ['rice', 'wheat', 'sugar', 'tea', 'coffee', 'pulses', 'flour', 'salt'];
function _mixRatio() { for (var i = 0; i < 40; i++) { var a = pick([20, 24, 25, 30, 36, 40]), b = pick([40, 45, 48, 50, 54, 60]); if (b <= a + 3) continue; var m = randInt(a + 2, b - 2), lo = b - m, hi = m - a; if (lo <= 0 || hi <= 0) continue; var g = _gcd(lo, hi), it = pick(_MIX_ITEMS); return { q: 'In what ratio must ' + it + ' at ₹' + a + ' per kg be mixed with ' + it + ' at ₹' + b + ' per kg so that the mixture is worth ₹' + m + ' per kg?', a: (lo / g) + ':' + (hi / g), k: 'alligationRatio', explain: 'By alligation, cheaper : dearer = (dearer − mean) : (mean − cheaper) = (' + b + '−' + m + ') : (' + m + '−' + a + ') = ' + lo + ' : ' + hi + ' = ' + (lo / g) + ' : ' + (hi / g) + '.' }; } return null; }
function _mixMean() { for (var i = 0; i < 30; i++) { var x = pick([2, 3, 4, 5, 6, 8, 10]), y = pick([2, 3, 4, 5, 6, 8, 10]), a = pick([20, 25, 30, 40, 50]), b = pick([30, 40, 50, 60, 70, 80]); if (a === b) continue; var mean = (a * x + b * y) / (x + y); if (mean === Math.floor(mean)) { var it = pick(_MIX_ITEMS); return { q: '' + x + ' kg of ' + it + ' at ₹' + a + ' per kg is mixed with ' + y + ' kg of ' + it + ' at ₹' + b + ' per kg. The average price of the mixture = ₹? per kg', a: mean, k: 'meanPrice', explain: 'Average = total cost ÷ total weight = (' + x + '×' + a + ' + ' + y + '×' + b + ') ÷ (' + x + '+' + y + ') = ' + (a * x + b * y) + ' ÷ ' + (x + y) + ' = ₹' + mean + '.' }; } } return null; }
function _mixQty() { for (var i = 0; i < 40; i++) { var a = pick([20, 24, 25, 30]), b = pick([40, 45, 48, 50, 60]); if (b <= a + 3) continue; var m = randInt(a + 2, b - 2), y = pick([4, 5, 6, 8, 10, 12]), lo = b - m, hi = m - a, x = y * lo / hi; if (x === Math.floor(x) && x >= 1 && x <= 60) { var it = pick(_MIX_ITEMS); return { q: 'In what quantity (in kg) must ' + it + ' at ₹' + a + ' per kg be mixed with ' + y + ' kg of ' + it + ' at ₹' + b + ' per kg so that the mixture is worth ₹' + m + ' per kg?', a: x, k: 'alligationQty', explain: 'By alligation, cheaper : dearer = (' + b + '−' + m + ') : (' + m + '−' + a + ') = ' + lo + ' : ' + hi + '. Cheaper quantity = ' + y + ' × ' + lo + '/' + hi + ' = ' + x + ' kg.' }; } } return null; }
var _MIX_ARCH = {
  easy: [{ k: 'alligationRatio', skill: 'formula', build: function () { return _mixRatio(); } }],
  medium: [{ k: 'alligationRatio', skill: 'formula', build: function () { return _mixRatio(); } }, { k: 'meanPrice', skill: 'direct', build: function () { return _mixMean(); } }],
  /* ADR-095: drop 'alligationRatio' (the easy ratio archetype) — hard is mean-price and the reverse alligation
     quantity problem. */
  hard: [{ k: 'meanPrice', skill: 'direct', build: function () { return _mixMean(); } }, { k: 'alligationQty', skill: 'multi-step', build: function () { return _mixQty(); } }]
};
var _MIX_PRIMARY = {
  easy: function () { return { q: 'In what ratio must rice at ₹20 per kg be mixed with rice at ₹30 per kg so that the mixture is worth ₹24 per kg?', a: '3:2', k: 'alligationRatio', explain: '(30−24) : (24−20) = 6 : 4 = 3 : 2.' }; },
  medium: function () { return { q: 'In what ratio must rice at ₹20 per kg be mixed with rice at ₹30 per kg so that the mixture is worth ₹24 per kg?', a: '3:2', k: 'alligationRatio', explain: '(30−24) : (24−20) = 3 : 2.' }; },
  hard: function () { return { q: '4 kg of rice at ₹20 per kg is mixed with 6 kg of rice at ₹30 per kg. The average price of the mixture = ₹? per kg', a: 26, k: 'meanPrice', explain: '(4×20 + 6×30)/(4+6) = 260/10 = ₹26.' }; }
};
function genMixtures() { return _genArch('mixtures', _MIX_ARCH, _MIX_PRIMARY); }

/** Pipes & Cisterns (archetypes: two-inlets-together · inlet+outlet net fill). Rate thinking, like Time & Work. */
function _pipeTogether(diff) { var ap = diff === 'easy' ? [3, 4, 5, 6, 10, 12, 15, 20, 24, 30] : [4, 5, 6, 8, 10, 12, 15], bp = diff === 'easy' ? [3, 4, 5, 6, 10, 12, 15, 20, 24, 30] : [6, 8, 10, 12, 15, 20, 24]; for (var i = 0; i < 40; i++) { var a = pick(ap), b = pick(bp); if (a === b) continue; if ((a * b) % (a + b) === 0) return { q: 'Pipe A fills a tank in ' + a + ' hours and pipe B fills it in ' + b + ' hours. If both are opened together, the tank fills in ? hours', a: (a * b) / (a + b), k: 'together', explain: 'Combined time = (A × B)/(A + B) = (' + a + ' × ' + b + ')/(' + a + ' + ' + b + ') = ' + ((a * b) / (a + b)) + ' hours — add the rates 1/' + a + ' + 1/' + b + '.' }; } return null; }
function _pipeNet() { for (var i = 0; i < 40; i++) { var a = pick([4, 5, 6, 8, 10, 12]), b = pick([12, 15, 20, 24, 30, 40]); if (b <= a) continue; if ((a * b) % (b - a) === 0) return { q: 'An inlet pipe fills a tank in ' + a + ' hours while an outlet pipe empties it in ' + b + ' hours. If both are opened together, the tank fills in ? hours', a: (a * b) / (b - a), k: 'netFill', explain: 'Net rate = 1/' + a + ' − 1/' + b + '; time = (A × B)/(B − A) = (' + a + ' × ' + b + ')/(' + b + ' − ' + a + ') = ' + ((a * b) / (b - a)) + ' hours.' }; } return null; }
/* ADR-093: hard is EARNED — the inverse problem ("together time known, find the slower pipe") and a three-pipe
   net-rate problem join netFill; hard is never a reshuffle of medium. */
function _pipeInverse() {
  for (var i = 0; i < 40; i++) {
    var a = pick([4, 5, 6, 8, 10, 12]), b = pick([6, 8, 10, 12, 15, 20, 24]);
    if (a === b || (a * b) % (a + b) !== 0) continue;
    var tog = (a * b) / (a + b);
    return { q: 'Two pipes together fill a tank in ' + tog + ' hours. If the first pipe alone fills it in ' + a + ' hours, the second pipe alone fills it in ? hours', a: b, k: 'inverseFill', explain: 'Rates subtract: 1/second = 1/' + tog + ' − 1/' + a + ' = ' + (a - tog) + '/' + (a * tog) + ', so the second pipe alone takes ' + b + ' hours.' };
  }
  return null;
}
function _pipeThree() {
  for (var i = 0; i < 60; i++) {
    var a = pick([4, 5, 6, 8, 10]), b = pick([6, 8, 10, 12, 15]), c = pick([12, 15, 20, 24, 30, 40]);
    if (a === b) continue;
    var num = a * b * c, den = b * c + a * c - a * b;
    if (den <= 0 || num % den !== 0) continue;
    return { q: 'Pipes A and B fill a tank in ' + a + ' and ' + b + ' hours respectively, while pipe C empties it in ' + c + ' hours. With all three open, the tank fills in ? hours', a: num / den, k: 'leakEmpty', explain: 'Net rate = 1/' + a + ' + 1/' + b + ' − 1/' + c + '. Over an LCM-sized tank that is ' + den + ' units/hour for ' + num + ' units, so the time = ' + (num / den) + ' hours.' };
  }
  return null;
}
var _PIPE_ARCH = {
  easy: [{ k: 'together', skill: 'formula', build: function (d) { return _pipeTogether(d); } }],
  medium: [{ k: 'together', skill: 'formula', build: function (d) { return _pipeTogether(d); } }, { k: 'netFill', skill: 'multi-step', build: function () { return _pipeNet(); } }],
  hard: [{ k: 'netFill', skill: 'multi-step', build: function () { return _pipeNet(); } }, { k: 'inverseFill', skill: 'inverse', build: function () { return _pipeInverse(); } }, { k: 'leakEmpty', skill: 'multi-step', build: function () { return _pipeThree(); } }]
};
var _PIPE_PRIMARY = {
  easy: function () { return { q: 'Pipe A fills a tank in 6 hours and pipe B fills it in 3 hours. If both are opened together, the tank fills in ? hours', a: 2, k: 'together', explain: '(6×3)/(6+3) = 18/9 = 2 hours.' }; },
  medium: function () { return { q: 'An inlet pipe fills a tank in 6 hours while an outlet pipe empties it in 12 hours. If both are opened together, the tank fills in ? hours', a: 12, k: 'netFill', explain: 'Time = (6×12)/(12−6) = 72/6 = 12 hours.' }; },
  hard: function () { return { q: 'Two pipes together fill a tank in 4 hours. If the first pipe alone fills it in 6 hours, the second pipe alone fills it in ? hours', a: 12, k: 'inverseFill', explain: '1/second = 1/4 − 1/6 = 1/12 → 12 hours.' }; }
};
function genPipes() { return _genArch('pipes-cisterns', _PIPE_ARCH, _PIPE_PRIMARY); }

/** Number Properties (archetypes: HCF · LCM · unit-digit via cyclicity · number-of-factors). Uses QRGen number helpers. */
var _CYCLE = { 0: [0], 1: [1], 2: [2, 4, 8, 6], 3: [3, 9, 7, 1], 4: [4, 6], 5: [5], 6: [6], 7: [7, 9, 3, 1], 8: [8, 4, 2, 6], 9: [9, 1] };
function _npHCF() { var k = pick([2, 3, 4, 6, 7, 8, 9, 12]), a = k * pick([2, 3, 4, 5, 7]), b = k * pick([3, 5, 7, 8, 9, 11]); return { q: 'Find the HCF (highest common factor) of ' + a + ' and ' + b + '.', a: QRGen.gcd(a, b), k: 'hcf', explain: 'HCF(' + a + ', ' + b + ') = ' + QRGen.gcd(a, b) + ' — the largest number that divides both (Euclidean method or common prime factors).' }; }
function _npLCM() { var a, b; for (var t = 0; t < 20; t++) { a = pick([4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20]); b = pick([6, 8, 9, 10, 12, 15, 16, 18, 20, 24]); if (a !== b) break; } return { q: 'Find the LCM (least common multiple) of ' + a + ' and ' + b + '.', a: QRGen.lcm(a, b), k: 'lcm', explain: 'LCM = (a × b) ÷ HCF = (' + a + ' × ' + b + ') ÷ ' + QRGen.gcd(a, b) + ' = ' + QRGen.lcm(a, b) + '.' }; }
function _npUnit(diff) { var base = pick([2, 3, 4, 7, 8, 9, 12, 13, 14, 17, 23]), e = randInt(diff === 'hard' ? 15 : 4, diff === 'hard' ? 60 : 20), u = base % 10, cyc = _CYCLE[u], ud = cyc[(e - 1) % cyc.length]; return { q: 'What is the unit (last) digit of ' + base + '^' + e + '?', a: ud, k: 'unitDigit', explain: 'The unit digit of powers of ' + base + ' repeats as [' + cyc.join(', ') + '] (cycle length ' + cyc.length + '). ' + e + ' mod ' + cyc.length + ' lands on ' + ud + '.' }; }
function _npFactors(diff) { for (var t = 0; t < 20; t++) { var ps = pick([[2, 3], [2, 5], [2, 3, 5], [2, 7], [3, 5], [2, 3, 7]]), ex = ps.map(function () { return randInt(1, diff === 'hard' ? 4 : 3); }), N = 1, parts = [], nf = 1; for (var i = 0; i < ps.length; i++) { N *= Math.pow(ps[i], ex[i]); parts.push(ps[i] + (ex[i] > 1 ? '^' + ex[i] : '')); nf *= (ex[i] + 1); } if (N > 2 && N <= 100000) return { q: 'How many factors (divisors) does ' + N + ' have?', a: nf, k: 'numFactors', explain: '' + N + ' = ' + parts.join(' × ') + '. Number of factors = product of (each exponent + 1) = ' + ex.map(function (e) { return '(' + e + '+1)'; }).join(' × ') + ' = ' + nf + '.' }; } return null; }
var _NP_ARCH = {
  easy: [{ k: 'hcf', skill: 'direct', build: function () { return _npHCF(); } }, { k: 'lcm', skill: 'direct', build: function () { return _npLCM(); } }],
  medium: [{ k: 'hcf', skill: 'direct', build: function () { return _npHCF(); } }, { k: 'lcm', skill: 'direct', build: function () { return _npLCM(); } }, { k: 'unitDigit', skill: 'multi-step', build: function (d) { return _npUnit(d); } }],
  /* ADR-095: drop the direct 'lcm' (easy) — hard is unit-digit cyclicity and factor-counting. */
  hard: [{ k: 'unitDigit', skill: 'multi-step', build: function (d) { return _npUnit(d); } }, { k: 'numFactors', skill: 'multi-step', build: function (d) { return _npFactors(d); } }]
};
var _NP_PRIMARY = { easy: function () { return _npHCF(); }, medium: function () { return _npLCM(); }, hard: function () { return _npUnit('hard'); } };
function genNumberProperties() { return _genArch('number-properties', _NP_ARCH, _NP_PRIMARY); }

/* ═══════════════════════════ ADR-083 Phase 3D — Algebra generators ═══════════════════════════ */

/** Linear Equations (archetypes: one-variable solve · bracket-expand · two-variable system). Answer = a variable value. */
function _linOne(diff) { var a = randInt(diff === 'easy' ? 2 : 3, diff === 'hard' ? 12 : 9), x = randInt(2, diff === 'hard' ? 20 : 12), b = randInt(1, 30), c = a * x + b; return { q: pick([a + 'x + ' + b + ' = ' + c + '.  Find x.', 'Solve for x:  ' + a + 'x + ' + b + ' = ' + c, 'If ' + a + 'x + ' + b + ' = ' + c + ', then x = ?']), a: x, k: 'solveOne', explain: 'Move the constant across: ' + a + 'x = ' + c + ' − ' + b + ' = ' + (c - b) + '. Then x = ' + (c - b) + ' ÷ ' + a + ' = ' + x + '.' }; }
function _linSub(diff) { var a = randInt(2, diff === 'hard' ? 12 : 9), x = randInt(2, diff === 'hard' ? 20 : 12), b = randInt(1, a * x - 1), c = a * x - b; return { q: pick([a + 'x − ' + b + ' = ' + c + '.  Find x.', 'Solve for x:  ' + a + 'x − ' + b + ' = ' + c]), a: x, k: 'solveOneSub', explain: a + 'x = ' + c + ' + ' + b + ' = ' + (c + b) + ', so x = ' + (c + b) + ' ÷ ' + a + ' = ' + x + '.' }; }
function _linBracket() { var a = randInt(2, 8), x = randInt(2, 14), b = randInt(1, 12), c = a * (x + b); return { q: pick([a + '(x + ' + b + ') = ' + c + '.  Find x.', 'Solve:  ' + a + '(x + ' + b + ') = ' + c]), a: x, k: 'bracket', explain: 'Divide both sides by ' + a + ' first: x + ' + b + ' = ' + (c / a) + '. So x = ' + (c / a) + ' − ' + b + ' = ' + x + '.' }; }
function _linSumDiff() { var x = randInt(6, 30), y = randInt(2, x - 1), S = x + y, D = x - y; return { q: 'If x + y = ' + S + ' and x − y = ' + D + ', find x.', a: x, k: 'sumDiff', explain: 'Add the equations: 2x = ' + S + ' + ' + D + ' = ' + (S + D) + ', so x = ' + x + ' (and y = ' + y + ').' }; }
function _linSystem() { for (var t = 0; t < 40; t++) { var x = randInt(2, 12), y = randInt(2, 12), a1 = randInt(2, 5), b1 = randInt(2, 5), a2 = randInt(2, 5), b2 = randInt(2, 5), det = a1 * b2 - a2 * b1; if (det === 0) continue; var c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y; return { q: 'Solve the system:  ' + a1 + 'x + ' + b1 + 'y = ' + c1 + '  and  ' + a2 + 'x + ' + b2 + 'y = ' + c2 + '.  Find x.', a: x, k: 'system2', explain: 'Eliminate y (or substitute) to get x = ' + x + ', y = ' + y + '. Check: ' + a1 + '·' + x + ' + ' + b1 + '·' + y + ' = ' + c1 + '. ✓' }; } return null; }
var _LIN_ARCH = {
  easy: [{ k: 'solveOne', skill: 'direct', build: function (d) { return _linOne(d); } }, { k: 'solveOneSub', skill: 'direct', build: function (d) { return _linSub(d); } }],
  medium: [{ k: 'solveOne', skill: 'direct', build: function (d) { return _linOne(d); } }, { k: 'bracket', skill: 'multi-step', build: function () { return _linBracket(); } }, { k: 'sumDiff', skill: 'multi-step', build: function () { return _linSumDiff(); } }],
  hard: [{ k: 'bracket', skill: 'multi-step', build: function () { return _linBracket(); } }, { k: 'sumDiff', skill: 'multi-step', build: function () { return _linSumDiff(); } }, { k: 'system2', skill: 'multi-step', build: function () { return _linSystem(); } }]
};
var _LIN_PRIMARY = { easy: function () { return _linOne('easy'); }, medium: function () { return _linSumDiff(); }, hard: function () { return _linSystem() || _linSumDiff(); } };
function genLinearEquations() { return _genArch('linear-equations', _LIN_ARCH, _LIN_PRIMARY); }

/** Quadratic Equations — canonical form x² − Bx + C = 0 with positive integer roots (sign-clean & recompute-safe). */
function _quad(diff, ask) {
  var r1 = randInt(1, diff === 'hard' ? 15 : 9), r2 = randInt(1, diff === 'hard' ? 15 : 9), B = r1 + r2, C = r1 * r2, lo = Math.min(r1, r2), hi = Math.max(r1, r2), eq = 'x² − ' + B + 'x + ' + C + ' = 0';
  if (ask === 'sum') return { q: eq + '.  Find the sum of its roots.', a: B, k: 'sumRoots', explain: 'For x² − Bx + C = 0, sum of roots = B = ' + B + ' (Vieta: sum = −b/a = ' + B + ').' };
  if (ask === 'product') return { q: eq + '.  Find the product of its roots.', a: C, k: 'productRoots', explain: 'By Vieta’s formulas, for x² − (sum)x + (product) = 0 the product of the roots equals the constant term. Here that constant is ' + C + ', so the product = ' + C + ' — no need to actually solve the equation. (Trap: the sum of the roots is the −(x-coefficient), a separate value.)' };
  if (ask === 'disc') return { q: eq + '.  Find the discriminant (b² − 4ac).', a: B * B - 4 * C, k: 'discriminant', explain: 'Δ = b² − 4ac = ' + B + '² − 4·1·' + C + ' = ' + (B * B) + ' − ' + (4 * C) + ' = ' + (B * B - 4 * C) + '.' };
  if (ask === 'smaller') return { q: eq + '.  Find the smaller root.', a: lo, k: 'smallerRoot', explain: 'x² − ' + B + 'x + ' + C + ' = (x − ' + lo + ')(x − ' + hi + '). Roots ' + lo + ' and ' + hi + '; smaller = ' + lo + '.' };
  return { q: eq + '.  Find the larger root.', a: hi, k: 'largerRoot', explain: 'Factor into (x − ' + lo + ')(x − ' + hi + ') = 0 → roots ' + lo + ' and ' + hi + '. Larger = ' + hi + '.' };
}
var _QUAD_ARCH = {
  easy: [{ k: 'largerRoot', skill: 'multi-step', build: function (d) { return _quad(d, 'larger'); } }, { k: 'sumRoots', skill: 'formula', build: function (d) { return _quad(d, 'sum'); } }],
  medium: [{ k: 'largerRoot', skill: 'multi-step', build: function (d) { return _quad(d, 'larger'); } }, { k: 'smallerRoot', skill: 'multi-step', build: function (d) { return _quad(d, 'smaller'); } }, { k: 'productRoots', skill: 'formula', build: function (d) { return _quad(d, 'product'); } }, { k: 'sumRoots', skill: 'formula', build: function (d) { return _quad(d, 'sum'); } }],
  /* ADR-095: drop 'largerRoot' (the easy solve-and-pick archetype) — hard is discriminant, product-of-roots and the
     root-relation (Vieta reconstruction) reasoning. */
  hard: [{ k: 'discriminant', skill: 'formula', build: function (d) { return _quad(d, 'disc'); } }, { k: 'productRoots', skill: 'formula', build: function (d) { return _quad(d, 'product'); } }, { k: 'rootRelation', skill: 'multi-step', build: function () { return _quadRelation(); } }]
};
/* ADR-093: a genuinely hard Vieta problem — reconstruct the constant term from the sum and the gap of the roots. */
function _quadRelation() {
  for (var i = 0; i < 40; i++) {
    var lo = randInt(2, 12), gap = pick([2, 4, 6, 8]), hi = lo + gap, B = lo + hi;
    return { q: 'The roots of x² − ' + B + 'x + c = 0 differ by ' + gap + '. Find c.', a: lo * hi, k: 'rootRelation', explain: 'Sum = ' + B + ' and difference = ' + gap + ' give the roots (' + B + '±' + gap + ')/2 = ' + hi + ' and ' + lo + '. By Vieta, c = product = ' + hi + ' × ' + lo + ' = ' + (lo * hi) + '.' };
  }
  return null;
}
var _QUAD_PRIMARY = { easy: function () { return _quad('easy', 'larger'); }, medium: function () { return _quad('medium', 'sum'); }, hard: function () { return _quad('hard', 'disc'); } };
function genQuadraticEquations() { return _genArch('quadratic-equations', _QUAD_ARCH, _QUAD_PRIMARY); }

/** Surds & Indices (archetypes: power evaluation · fractional exponent · index law · solve-the-exponent). Integer answers. */
function _siPow(diff) { var a = randInt(2, diff === 'hard' ? 7 : 5), n = randInt(2, diff === 'hard' ? 6 : 4); return { q: pick([a + '^' + n + ' = ?', 'Evaluate ' + a + '^' + n + '.']), a: Math.pow(a, n), k: 'powerEval', explain: a + '^' + n + ' = ' + a + ' multiplied by itself ' + n + ' times = ' + Math.pow(a, n) + '.' }; }
function _siFrac() { var t = pick([[8, 3], [27, 3], [16, 2], [16, 4], [32, 5], [64, 3], [64, 6], [81, 4], [125, 3], [9, 2], [25, 2], [36, 2], [100, 2], [1000, 3]]), b = t[0], root = t[1], p = randInt(1, root - 1 < 1 ? 1 : root - 1), rt = Math.round(Math.pow(b, 1 / root)), val = Math.round(Math.pow(rt, p)); return { q: b + '^(' + p + '/' + root + ') = ?', a: val, k: 'fracExponent', explain: b + '^(' + p + '/' + root + ') = (' + b + '^(1/' + root + '))^' + p + ' = ' + rt + '^' + p + ' = ' + val + '.' }; }
function _siLaws(diff) { var a = randInt(2, 5), m = randInt(3, diff === 'hard' ? 9 : 6), n = randInt(1, m - 1); return { q: '(' + a + '^' + m + ') ÷ (' + a + '^' + n + ') = ' + a + '^? — give the exponent.', a: m - n, k: 'indexLaw', explain: 'Quotient law of indices: dividing same-base powers subtracts the exponents, aᵐ ÷ aⁿ = aᵐ⁻ⁿ. So the exponent is ' + m + ' − ' + n + ' = ' + (m - n) + '. (Trap: the base ' + a + ' stays the same — you never divide the bases.)' }; }
function _siSolve(diff) { var a = pick([2, 3, 5]), x = randInt(2, diff === 'hard' ? 7 : 5), N = Math.pow(a, x); return { q: 'If ' + a + '^x = ' + N + ', find x.', a: x, k: 'solveExp', explain: '' + N + ' = ' + a + '^' + x + ' (since ' + a + ' to the power ' + x + ' is ' + N + '), so x = ' + x + '.' }; }
var _SURD_ARCH = {
  easy: [{ k: 'powerEval', skill: 'direct', build: function (d) { return _siPow(d); } }, { k: 'solveExp', skill: 'direct', build: function (d) { return _siSolve(d); } }],
  medium: [{ k: 'powerEval', skill: 'direct', build: function (d) { return _siPow(d); } }, { k: 'fracExponent', skill: 'multi-step', build: function () { return _siFrac(); } }, { k: 'indexLaw', skill: 'formula', build: function (d) { return _siLaws(d); } }],
  hard: [{ k: 'fracExponent', skill: 'multi-step', build: function () { return _siFrac(); } }, { k: 'indexLaw', skill: 'formula', build: function (d) { return _siLaws(d); } }, { k: 'solveExp', skill: 'direct', build: function (d) { return _siSolve(d); } }]
};
var _SURD_PRIMARY = { easy: function () { return _siPow('easy'); }, medium: function () { return _siFrac(); }, hard: function () { return _siLaws('hard'); } };
function genSurdsIndices() { return _genArch('surds-indices', _SURD_ARCH, _SURD_PRIMARY); }

/** Logarithms (archetypes: evaluate · product-rule sum · power-rule · solve-for-x). Integer answers, ASCII bases. */
function _logEval(diff) { var b = pick(diff === 'hard' ? [2, 3, 5, 7] : [2, 3, 5, 10]), k = randInt(2, b >= 7 ? 3 : (b === 10 ? 4 : (b >= 5 ? 4 : 5))), N = Math.pow(b, k); return { q: pick(['log to base ' + b + ' of ' + N + ' = ?', 'Evaluate log base ' + b + ' of ' + N + '.']), a: k, k: 'evalLog', explain: 'logₐN asks “' + b + ' raised to what power gives ' + N + '?” Rewrite ' + N + ' as a power of ' + b + ': ' + b + '^' + k + ' = ' + N + ', so log base ' + b + ' of ' + N + ' = ' + k + '.' + (b === 10 ? ' (For base 10 — the common log — just count how many times you multiply by 10.)' : '') }; }
function _logSum() { var b = pick([2, 3, 5, 10]), i = randInt(1, 3), j = randInt(1, 3), x = Math.pow(b, i), y = Math.pow(b, j); return { q: '(log to base ' + b + ' of ' + x + ') + (log to base ' + b + ' of ' + y + ') = ?', a: i + j, k: 'logSum', explain: 'Product rule: logₐx + logₐy = logₐ(xy). Since ' + b + '^' + i + ' = ' + x + ' and ' + b + '^' + j + ' = ' + y + ', the two logs are ' + i + ' and ' + j + ', so the sum = ' + i + ' + ' + j + ' = ' + (i + j) + '. (Shortcut: adding same-base logs just adds the exponents.)' }; }
function _logPower() { var b = pick([2, 3, 5, 10]), i = randInt(1, 3), x = Math.pow(b, i), k = randInt(2, 3); return { q: 'log to base ' + b + ' of ' + x + '^' + k + ' = ?', a: i * k, k: 'logPower', explain: 'Power rule: logₐ(xᵏ) = k·logₐx. Here log base ' + b + ' of ' + x + ' = ' + i + ' (because ' + b + '^' + i + ' = ' + x + '), so the answer = ' + k + ' × ' + i + ' = ' + (i * k) + '. (Trap: the exponent multiplies the log — it does not become a new base.)' }; }
function _logSolve(diff) { var b = pick([2, 3, 5, 10]), k = randInt(2, diff === 'hard' ? 5 : 4), x = Math.pow(b, k); return { q: 'If log to base ' + b + ' of x = ' + k + ', find x.', a: x, k: 'solveLog', explain: 'logₐx = k is the same statement as x = aᵏ (rewrite the log in exponential form). So x = ' + b + '^' + k + ' = ' + x + '.' }; }
var _LOG_ARCH = {
  easy: [{ k: 'evalLog', skill: 'direct', build: function (d) { return _logEval(d); } }, { k: 'solveLog', skill: 'multi-step', build: function (d) { return _logSolve(d); } }],
  medium: [{ k: 'evalLog', skill: 'direct', build: function (d) { return _logEval(d); } }, { k: 'logSum', skill: 'formula', build: function () { return _logSum(); } }, { k: 'logPower', skill: 'formula', build: function () { return _logPower(); } }],
  hard: [{ k: 'logPower', skill: 'formula', build: function () { return _logPower(); } }, { k: 'solveLog', skill: 'multi-step', build: function (d) { return _logSolve(d); } }, { k: 'logSum', skill: 'formula', build: function () { return _logSum(); } }]
};
var _LOG_PRIMARY = { easy: function () { return _logEval('easy'); }, medium: function () { return _logSum(); }, hard: function () { return _logSolve('hard'); } };
function genLogarithms() { return _genArch('logarithms', _LOG_ARCH, _LOG_PRIMARY); }

/** Progressions (archetypes: AP nth-term · AP sum · GP nth-term · GP sum). Rate/series thinking; integer answers. */
function _apNth(diff) { var a = randInt(1, 20), d = randInt(1, diff === 'hard' ? 12 : 8), n = randInt(5, diff === 'hard' ? 20 : 12); return { q: pick(['An AP has first term ' + a + ' and common difference ' + d + '. Find its ' + _ord(n) + ' term.', 'An arithmetic progression starts at ' + a + ' and increases by ' + d + ' each term. What is its ' + _ord(n) + ' term?']), a: a + (n - 1) * d, k: 'apNth', explain: 'aₙ = a + (n − 1)d = ' + a + ' + (' + n + ' − 1)·' + d + ' = ' + a + ' + ' + ((n - 1) * d) + ' = ' + (a + (n - 1) * d) + '.' }; }
function _apSum(diff) { var a = randInt(1, 15), d = randInt(1, diff === 'hard' ? 8 : 5), n = randInt(5, diff === 'hard' ? 15 : 10); return { q: 'An AP has first term ' + a + ' and common difference ' + d + '. Find the sum of its first ' + n + ' terms.', a: n / 2 * (2 * a + (n - 1) * d), k: 'apSum', explain: 'Sₙ = n/2 · [2a + (n − 1)d] = ' + n + '/2 · [' + (2 * a) + ' + ' + ((n - 1) * d) + '] = ' + (n / 2 * (2 * a + (n - 1) * d)) + '.' }; }
function _gpNth(diff) { var a = randInt(1, 6), r = pick([2, 3]), n = randInt(3, diff === 'hard' ? 7 : 5); return { q: 'A GP has first term ' + a + ' and common ratio ' + r + '. Find its ' + _ord(n) + ' term.', a: a * Math.pow(r, n - 1), k: 'gpNth', explain: 'aₙ = a·rⁿ⁻¹ = ' + a + '·' + r + '^' + (n - 1) + ' = ' + a + '·' + Math.pow(r, n - 1) + ' = ' + (a * Math.pow(r, n - 1)) + '.' }; }
function _gpSum(diff) { var a = randInt(1, 5), r = pick([2, 3]), n = randInt(3, diff === 'hard' ? 6 : 4); return { q: 'A GP has first term ' + a + ' and common ratio ' + r + '. Find the sum of its first ' + n + ' terms.', a: a * (Math.pow(r, n) - 1) / (r - 1), k: 'gpSum', explain: 'For a GP with ratio r > 1 use Sₙ = a(rⁿ − 1)/(r − 1). Substitute a = ' + a + ', r = ' + r + ', n = ' + n + ': = ' + a + '(' + r + '^' + n + ' − 1)/(' + r + ' − 1) = ' + a + '·' + (Math.pow(r, n) - 1) + '/' + (r - 1) + ' = ' + (a * (Math.pow(r, n) - 1) / (r - 1)) + '. (Trap: don’t add terms one by one — the formula collapses the whole series; for r < 1 flip it to a(1 − rⁿ)/(1 − r).)' }; }
var _PROG_ARCH = {
  easy: [{ k: 'apNth', skill: 'formula', build: function (d) { return _apNth(d); } }, { k: 'apSum', skill: 'formula', build: function (d) { return _apSum(d); } }],
  medium: [{ k: 'apNth', skill: 'formula', build: function (d) { return _apNth(d); } }, { k: 'gpNth', skill: 'multi-step', build: function (d) { return _gpNth(d); } }, { k: 'apSum', skill: 'formula', build: function (d) { return _apSum(d); } }],
  /* ADR-095: drop 'apSum' (the easy AP-sum archetype) — hard is the geometric-progression nth-term and sum. */
  hard: [{ k: 'gpNth', skill: 'multi-step', build: function (d) { return _gpNth(d); } }, { k: 'gpSum', skill: 'multi-step', build: function (d) { return _gpSum(d); } }]
};
var _PROG_PRIMARY = { easy: function () { return _apNth('easy'); }, medium: function () { return _gpNth('medium'); }, hard: function () { return _gpSum('hard'); } };
function genProgressions() { return _genArch('progressions', _PROG_ARCH, _PROG_PRIMARY); }

/** Inequalities & Modulus (archetypes: smallest-integer solution · |x−a|=b larger value · integer-count in a range). */
function _ineqMin(diff) { var a = randInt(2, diff === 'hard' ? 8 : 6), b = randInt(1, 15), c = b + randInt(a + 1, a * (diff === 'hard' ? 14 : 9)); return { q: 'Find the smallest integer x such that ' + a + 'x + ' + b + ' > ' + c + '.', a: Math.floor((c - b) / a) + 1, k: 'linIneqMin', explain: a + 'x > ' + c + ' − ' + b + ' = ' + (c - b) + ', so x > ' + ((c - b) / a).toFixed(2).replace(/\.00$/, '') + '. The smallest integer greater than that is ' + (Math.floor((c - b) / a) + 1) + '.' }; }
function _modLarger() { var a = randInt(4, 15), b = randInt(2, 6); return { q: 'If |x − ' + a + '| = ' + b + ', find the larger value of x.', a: a + b, k: 'modLarger', explain: '|x − ' + a + '| = ' + b + ' gives x = ' + a + ' + ' + b + ' = ' + (a + b) + ' or x = ' + a + ' − ' + b + ' = ' + (a - b) + '. The larger is ' + (a + b) + '.' }; }
function _countRange() { var a = randInt(2, 20), b = a + randInt(3, 20); return { q: 'How many integers x satisfy ' + a + ' ≤ x ≤ ' + b + '?', a: b - a + 1, k: 'countRange', explain: 'Counting integers in a closed range is inclusive of both ends: count = (upper − lower) + 1 = (' + b + ' − ' + a + ') + 1 = ' + (b - a + 1) + '. (The “+1” is the classic fencepost step — subtracting alone drops one endpoint and undercounts by 1.)' }; }
function _modIneqCount() { var a = randInt(5, 20), b = randInt(2, 7); return { q: 'How many integer values of x satisfy |x − ' + a + '| < ' + b + '?', a: 2 * b - 1, k: 'modIneqCount', explain: '|x − ' + a + '| < ' + b + ' means ' + (a - b) + ' < x < ' + (a + b) + '. The integers strictly between span 2·' + b + ' − 1 = ' + (2 * b - 1) + ' values.' }; }
function _modIneqCountLe() { var a = randInt(5, 20), b = randInt(2, 7); return { q: 'How many integer values of x satisfy |x − ' + a + '| ≤ ' + b + '?', a: 2 * b + 1, k: 'modIneqCountLe', explain: '|x − ' + a + '| ≤ ' + b + ' means ' + (a - b) + ' ≤ x ≤ ' + (a + b) + ', inclusive = 2·' + b + ' + 1 = ' + (2 * b + 1) + ' integers.' }; }
var _INEQ_ARCH = {
  easy: [{ k: 'linIneqMin', skill: 'multi-step', build: function (d) { return _ineqMin(d); } }, { k: 'countRange', skill: 'direct', build: function () { return _countRange(); } }],
  medium: [{ k: 'linIneqMin', skill: 'multi-step', build: function (d) { return _ineqMin(d); } }, { k: 'modLarger', skill: 'formula', build: function () { return _modLarger(); } }, { k: 'countRange', skill: 'direct', build: function () { return _countRange(); } }],
  hard: [{ k: 'modIneqCount', skill: 'multi-step', build: function () { return _modIneqCount(); } }, { k: 'modIneqCountLe', skill: 'multi-step', build: function () { return _modIneqCountLe(); } }, { k: 'modLarger', skill: 'formula', build: function () { return _modLarger(); } }]
};
var _INEQ_PRIMARY = { easy: function () { return _countRange(); }, medium: function () { return _modLarger(); }, hard: function () { return _modIneqCount(); } };
function genInequalities() { return _genArch('inequalities-modulus', _INEQ_ARCH, _INEQ_PRIMARY); }

/* ═══════════════════════════ ADR-083 Phase 3E — Geometry generators ═══════════════════════════ */

var _PYTH = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [20, 21, 29], [10, 24, 26], [9, 40, 41], [12, 16, 20]];

/** Geometry Basics (archetypes: angle relations · triangle angle-sum & isosceles · Pythagoras · polygon angles). */
function _geoComplement() { var a = randInt(10, 80); return { q: pick(['What is the complement of an angle of ' + a + '°?', 'Two angles are complementary and one of them measures ' + a + '°. Find the other (in degrees).']), a: 90 - a, k: 'complement', explain: 'Complementary angles sum to 90°, so the complement = 90° − ' + a + '° = ' + (90 - a) + '°.' }; }
function _geoSupplement() { var a = randInt(20, 160); return { q: pick(['What is the supplement of an angle of ' + a + '°?', 'Two angles lie on a straight line and one measures ' + a + '°. Find the other (in degrees).']), a: 180 - a, k: 'supplement', explain: 'Supplementary angles sum to 180°, so the supplement = 180° − ' + a + '° = ' + (180 - a) + '°.' }; }
function _geoThird() { var a = randInt(30, 90), b = randInt(30, 150 - a); return { q: pick(['Two angles of a triangle are ' + a + '° and ' + b + '°. Find the third angle.', 'In a triangle, two of the angles measure ' + a + '° and ' + b + '°. The third angle = ?°']), a: 180 - a - b, k: 'triangleThird', explain: 'Angles of a triangle sum to 180°, so the third = 180° − ' + a + '° − ' + b + '° = ' + (180 - a - b) + '°.' }; }
function _geoIsosceles() { var v = pick([20, 30, 40, 50, 70, 80, 100]); return { q: 'An isosceles triangle has a vertex (apex) angle of ' + v + '°. Find each base angle.', a: (180 - v) / 2, k: 'isosceles', explain: 'The two base angles are equal and the three sum to 180°: each = (180° − ' + v + '°)/2 = ' + ((180 - v) / 2) + '°.' }; }
function _geoPythHyp() { var t = pick(_PYTH); return { q: pick(['A right-angled triangle has legs ' + t[0] + ' and ' + t[1] + '. Find the hypotenuse.', 'A ladder foot stands ' + t[0] + ' m from a wall and reaches ' + t[1] + ' m up it. How long is the ladder (in m)?']), a: t[2], k: 'pythHyp', explain: 'Hypotenuse = √(' + t[0] + '² + ' + t[1] + '²) = √(' + (t[0] * t[0]) + ' + ' + (t[1] * t[1]) + ') = √' + (t[2] * t[2]) + ' = ' + t[2] + '.' }; }
function _geoPythLeg() { var t = pick(_PYTH); return { q: 'A right-angled triangle has hypotenuse ' + t[2] + ' and one leg ' + t[1] + '. Find the other leg.', a: t[0], k: 'pythLeg', explain: 'Other leg = √(' + t[2] + '² − ' + t[1] + '²) = √(' + (t[2] * t[2]) + ' − ' + (t[1] * t[1]) + ') = √' + (t[0] * t[0]) + ' = ' + t[0] + '.' }; }
function _geoPolygonSum() { var n = pick([5, 6, 7, 8, 9, 10, 12]); return { q: pick(['Find the sum of the interior angles of a polygon with ' + n + ' sides.', 'The interior angles of a ' + n + '-sided polygon add up to ?°']), a: (n - 2) * 180, k: 'polygonSum', explain: 'Sum of interior angles = (n − 2) × 180° = (' + n + ' − 2) × 180° = ' + ((n - 2) * 180) + '°.' }; }
function _geoPolygonEach() { var n = pick([3, 4, 5, 6, 8, 9, 10, 12]); return { q: 'Find each interior angle of a regular polygon with ' + n + ' sides.', a: (n - 2) * 180 / n, k: 'polygonEach', explain: 'Each interior angle = (n − 2) × 180° / n = ' + ((n - 2) * 180) + '° / ' + n + ' = ' + ((n - 2) * 180 / n) + '°.' }; }
var _GEO_ARCH = {
  easy: [{ k: 'complement', skill: 'formula', build: function () { return _geoComplement(); } }, { k: 'supplement', skill: 'formula', build: function () { return _geoSupplement(); } }, { k: 'triangleThird', skill: 'formula', build: function () { return _geoThird(); } }],
  medium: [{ k: 'triangleThird', skill: 'formula', build: function () { return _geoThird(); } }, { k: 'pythHyp', skill: 'multi-step', build: function () { return _geoPythHyp(); } }, { k: 'isosceles', skill: 'multi-step', build: function () { return _geoIsosceles(); } }],
  hard: [{ k: 'pythLeg', skill: 'multi-step', build: function () { return _geoPythLeg(); } }, { k: 'polygonSum', skill: 'formula', build: function () { return _geoPolygonSum(); } }, { k: 'polygonEach', skill: 'multi-step', build: function () { return _geoPolygonEach(); } }]
};
var _GEO_PRIMARY = { easy: function () { return _geoThird(); }, medium: function () { return _geoPythHyp(); }, hard: function () { return _geoPolygonSum(); } };
function genGeometryBasics() { return _genArch('geometry-basics', _GEO_ARCH, _GEO_PRIMARY); }

/** Coordinate Geometry Basics (archetypes: distance · midpoint x-coord · slope · section-formula x-coord). */
/* Coordinates kept NON-NEGATIVE so the recompute harness (which strips signs) reads them correctly; slope answers may still be negative. */
function _cgDistance() { var t = pick(_PYTH), x1 = randInt(0, 6), y1 = randInt(0, 6), x2 = x1 + t[0], y2 = y1 + t[1]; return { q: 'Find the distance between the points (' + x1 + ', ' + y1 + ') and (' + x2 + ', ' + y2 + ').', a: t[2], k: 'distance', explain: 'Distance = √[(Δx)² + (Δy)²] = √[' + t[0] + '² + ' + t[1] + '²] = √' + (t[2] * t[2]) + ' = ' + t[2] + '.' }; }
function _cgMidpoint() { var x1 = randInt(0, 12), x2 = x1 + 2 * randInt(1, 8), y1 = randInt(0, 12), y2 = y1 + 2 * randInt(1, 8); return { q: 'Find the x-coordinate of the midpoint of (' + x1 + ', ' + y1 + ') and (' + x2 + ', ' + y2 + ').', a: (x1 + x2) / 2, k: 'midpointX', explain: 'Midpoint x = (x₁ + x₂)/2 = (' + x1 + ' + ' + x2 + ')/2 = ' + ((x1 + x2) / 2) + '.' }; }
function _cgSlope() { for (var t = 0; t < 30; t++) { var x1 = randInt(0, 6), dx = randInt(1, 6), x2 = x1 + dx, m = randInt(1, 5) * pick([1, -1]), y1 = randInt(0, 12), y2 = y1 + m * dx; if (y2 < 0) continue; return { q: 'Find the slope of the line joining (' + x1 + ', ' + y1 + ') and (' + x2 + ', ' + y2 + ').', a: (y2 - y1) / (x2 - x1), k: 'slope', explain: 'Slope = (y₂ − y₁)/(x₂ − x₁) = (' + (y2 - y1) + ')/(' + (x2 - x1) + ') = ' + ((y2 - y1) / (x2 - x1)) + '.' }; } return null; }
function _cgSection() { for (var t = 0; t < 30; t++) { var x1 = randInt(0, 8), x2 = randInt(2, 14), m = randInt(1, 4), n = randInt(1, 4), y1 = randInt(0, 8), y2 = randInt(2, 14), x = (m * x2 + n * x1) / (m + n); if (m !== n && x === Math.floor(x)) return { q: 'Point P divides the line joining (' + x1 + ', ' + y1 + ') and (' + x2 + ', ' + y2 + ') internally in the ratio ' + m + ':' + n + '. Find the x-coordinate of P.', a: x, k: 'sectionX', explain: 'Section formula: x = (m·x₂ + n·x₁)/(m + n) = (' + m + '·' + x2 + ' + ' + n + '·' + x1 + ')/(' + m + ' + ' + n + ') = ' + x + '.' }; } return null; }
var _CG_ARCH = {
  easy: [{ k: 'distance', skill: 'formula', build: function () { return _cgDistance(); } }, { k: 'midpointX', skill: 'direct', build: function () { return _cgMidpoint(); } }],
  medium: [{ k: 'distance', skill: 'formula', build: function () { return _cgDistance(); } }, { k: 'slope', skill: 'formula', build: function () { return _cgSlope(); } }, { k: 'midpointX', skill: 'direct', build: function () { return _cgMidpoint(); } }],
  hard: [{ k: 'slope', skill: 'formula', build: function () { return _cgSlope(); } }, { k: 'distance', skill: 'formula', build: function () { return _cgDistance(); } }, { k: 'sectionX', skill: 'multi-step', build: function () { return _cgSection(); } }]
};
var _CG_PRIMARY = { easy: function () { return _cgMidpoint(); }, medium: function () { return _cgDistance(); }, hard: function () { return _cgSlope(); } };
function genCoordinateGeometry() { return _genArch('coordinate-geometry-basics', _CG_ARCH, _CG_PRIMARY); }

/** Trigonometry (archetypes: standard-angle ratio · complementary angle · Pythagorean identity · 45° height-and-distance).
 *  Answers restricted to the clean values {0, 0.5, 1}, integer angles, or integer heights so numeric entry stays exact. */
var _DEG = Math.PI / 180;
var _TRIG_STD = [['sin', 0, 0], ['sin', 30, 0.5], ['sin', 90, 1], ['cos', 0, 1], ['cos', 60, 0.5], ['cos', 90, 0], ['tan', 0, 0], ['tan', 45, 1]];
function _trigStd() { var t = pick(_TRIG_STD); return { q: t[0] + ' ' + t[1] + '° = ?', a: t[2], k: 'standardEval', explain: 'From the standard-angle table, ' + t[0] + ' ' + t[1] + '° = ' + t[2] + '.' }; }
function _trigComp() { var x = randInt(10, 80), pair = pick([['sin', 'cos'], ['tan', 'cot'], ['cos', 'sin'], ['sec', 'cosec']]); return { q: 'If ' + pair[0] + ' θ = ' + pair[1] + ' ' + x + '°, find the acute angle θ (in degrees).', a: 90 - x, k: 'complementary', explain: pair[0] + ' θ = ' + pair[1] + '(90° − θ), so θ = 90° − ' + x + '° = ' + (90 - x) + '°.' }; }
function _trigIdentity() { var t = pick([['sin²θ + cos²θ', 'the Pythagorean identity sin²θ + cos²θ = 1'], ['sec²θ − tan²θ', 'the identity sec²θ − tan²θ = 1'], ['cosec²θ − cot²θ', 'the identity cosec²θ − cot²θ = 1']]); return { q: 'Evaluate ' + t[0] + '.', a: 1, k: 'identity', explain: 'This is ' + t[1] + ' — one of the three Pythagorean identities, all derived from sin²θ + cos²θ = 1 (divide through by cos²θ or sin²θ for the other two). Its value is fixed at 1 for every angle θ, so no specific angle is needed. (Trap: the squares are on the functions, e.g. sin²θ means (sinθ)², not sin(θ²).)' }; }
function _trigHeight(diff) { var base = randInt(5, diff === 'hard' ? 80 : 40), st = pick(['tower', 'pole', 'building', 'tree', 'flagpole', 'lighthouse', 'chimney']); return { q: 'The angle of elevation of the top of a ' + st + ' from a point ' + base + ' m from its base is 45°. Find the height of the ' + st + ' (in metres).', a: base, k: 'heightElev', explain: 'tan(45°) = height / base = 1, so height = base = ' + base + ' m.' }; }
var _TRIG_ARCH = {
  easy: [{ k: 'standardEval', skill: 'direct', build: function () { return _trigStd(); } }, { k: 'complementary', skill: 'formula', build: function () { return _trigComp(); } }],
  medium: [{ k: 'standardEval', skill: 'direct', build: function () { return _trigStd(); } }, { k: 'complementary', skill: 'formula', build: function () { return _trigComp(); } }, { k: 'identity', skill: 'formula', build: function () { return _trigIdentity(); } }],
  /* ADR-095: drop 'complementary' (the easy complementary-angle archetype) — hard is identity simplification and the
     height-and-distance (angle of elevation) multi-step problem. */
  hard: [{ k: 'identity', skill: 'formula', build: function () { return _trigIdentity(); } }, { k: 'heightElev', skill: 'multi-step', build: function (d) { return _trigHeight(d); } }]
};
var _TRIG_PRIMARY = { easy: function () { return _trigStd(); }, medium: function () { return _trigComp(); }, hard: function () { return _trigIdentity(); } };
function genTrigonometry() { return _genArch('trigonometry', _TRIG_ARCH, _TRIG_PRIMARY); }

/** Surface Area (archetypes: cube TSA/LSA · cuboid TSA · cylinder CSA/TSA · sphere SA). Uses π = 3.14 like area/volume. */
function _saCubeTSA() { var a = randInt(2, 20); return { slots: { a: a }, a: 6 * a * a, k: 'cubeTSA', v: randInt(0, 999) }; }
function _saCubeLSA() { var a = randInt(2, 20); return { slots: { a: a }, a: 4 * a * a, k: 'cubeLSA', v: randInt(0, 999) }; }
function _saCuboidTSA() { var l = randInt(2, 15), b = randInt(2, 15), h = randInt(2, 15); return { slots: { l: l, b: b, h: h }, a: 2 * (l * b + b * h + l * h), k: 'cuboidTSA', v: randInt(0, 999) }; }
function _saCylCSA() { var r = randInt(2, 14), h = randInt(3, 20); return { slots: { r: r, h: h, ans: _round2(2 * 3.14 * r * h) }, a: _round2(2 * 3.14 * r * h), k: 'cylCSA', v: randInt(0, 999) }; }
function _saCylTSA() { var r = randInt(2, 12), h = randInt(3, 18); return { slots: { r: r, h: h, ans: _round2(2 * 3.14 * r * (r + h)) }, a: _round2(2 * 3.14 * r * (r + h)), k: 'cylTSA', v: randInt(0, 999) }; }
function _saSphere() { var r = randInt(2, 14); return { slots: { r: r, ans: _round2(4 * 3.14 * r * r) }, a: _round2(4 * 3.14 * r * r), k: 'sphereSA', v: randInt(0, 999) }; }
var _SA_ARCH = {
  easy: [{ k: 'cubeTSA', skill: 'formula', build: function () { return _saCubeTSA(); } }, { k: 'cuboidTSA', skill: 'formula', build: function () { return _saCuboidTSA(); } }],
  medium: [{ k: 'cuboidTSA', skill: 'formula', build: function () { return _saCuboidTSA(); } }, { k: 'cylCSA', skill: 'multi-step', build: function () { return _saCylCSA(); } }, { k: 'cubeLSA', skill: 'formula', build: function () { return _saCubeLSA(); } }],
  /* ADR-095: drop 'cuboidTSA' (the easy cuboid-surface archetype) — hard is cylinder TSA and sphere surface area. */
  hard: [{ k: 'cylTSA', skill: 'multi-step', build: function () { return _saCylTSA(); } }, { k: 'sphereSA', skill: 'multi-step', build: function () { return _saSphere(); } }]
};
var _SA_PRIMARY = { easy: function () { return _saCubeTSA(); }, medium: function () { return _saCuboidTSA(); }, hard: function () { return _saSphere(); } };
function genSurfaceArea() { return _genArch('surface-area', _SA_ARCH, _SA_PRIMARY); }

/* ═══════════════════════════ ADR-083 Phase 3F — Modern Math generators ═══════════════════════════ */

function _fact(n) { var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
function _nPr(n, r) { return _fact(n) / _fact(n - r); }
function _nCr(n, r) { return _fact(n) / (_fact(r) * _fact(n - r)); }

/** Permutation & Combination (archetypes: factorial · arrangement · nPr · nCr · committee · handshakes). ASCII notation. */
function _pcFactorial(diff) { var n = randInt(3, diff === 'hard' ? 8 : 6); return { q: n + '! = ?', a: _fact(n), k: 'factorial', explain: n + '! = ' + n + ' × ' + (n - 1) + ' × … × 1 = ' + _fact(n) + '.' }; }
function _pcArrange(diff) { var n = randInt(3, diff === 'hard' ? 7 : 5); return { q: 'In how many ways can ' + n + ' distinct books be arranged in a row?', a: _fact(n), k: 'arrange', explain: 'All ' + n + ' arranged = ' + n + '! = ' + _fact(n) + '.' }; }
function _pcNPr(diff) { var n = randInt(4, diff === 'hard' ? 9 : 7), r = randInt(2, Math.min(4, n - 1)); return { q: 'Find the value of ' + n + 'P' + r + ' (permutations of ' + r + ' from ' + n + ').', a: _nPr(n, r), k: 'nPr', explain: 'nPr = n!/(n−r)! = ' + n + '!/' + (n - r) + '! = ' + _nPr(n, r) + '.' }; }
function _pcNCr(diff) { var n = randInt(4, diff === 'hard' ? 10 : 8), r = randInt(2, Math.min(4, n - 1)); return { q: 'Find the value of ' + n + 'C' + r + ' (combinations of ' + r + ' from ' + n + ').', a: _nCr(n, r), k: 'nCr', explain: 'nCr = n!/[r!(n−r)!] = ' + n + '!/[' + r + '!·' + (n - r) + '!] = ' + _nCr(n, r) + '.' }; }
function _pcCommittee(diff) { var n = randInt(5, diff === 'hard' ? 10 : 8), r = randInt(2, Math.min(4, n - 1)); return { q: 'From ' + n + ' people, how many different committees of ' + r + ' can be formed?', a: _nCr(n, r), k: 'committee', explain: 'Order does not matter → combinations: ' + n + 'C' + r + ' = ' + _nCr(n, r) + '.' }; }
function _pcHandshakes(diff) { var n = randInt(4, diff === 'hard' ? 15 : 10); return { q: 'In a party of ' + n + ' people, everyone shakes hands with everyone else once. How many handshakes take place?', a: _nCr(n, 2), k: 'handshakes', explain: 'Each handshake is a pair → ' + n + 'C2 = ' + n + '×' + (n - 1) + '/2 = ' + _nCr(n, 2) + '.' }; }
var _PC_ARCH = {
  easy: [{ k: 'factorial', skill: 'direct', build: function (d) { return _pcFactorial(d); } }, { k: 'arrange', skill: 'direct', build: function (d) { return _pcArrange(d); } }],
  medium: [{ k: 'nCr', skill: 'formula', build: function (d) { return _pcNCr(d); } }, { k: 'nPr', skill: 'formula', build: function (d) { return _pcNPr(d); } }, { k: 'arrange', skill: 'direct', build: function (d) { return _pcArrange(d); } }],
  hard: [{ k: 'committee', skill: 'multi-step', build: function (d) { return _pcCommittee(d); } }, { k: 'handshakes', skill: 'multi-step', build: function (d) { return _pcHandshakes(d); } }, { k: 'circular', skill: 'formula', build: function () { return _pcCircular(); } }, { k: 'atLeastOne', skill: 'multi-step', build: function () { return _pcAtLeastOne(); } }]
};
/* ADR-093: two genuinely-hard PnC archetypes — circular arrangements and at-least-one via the complement. */
function _pcCircular() { var n = randInt(4, 8); return { q: 'In how many ways can ' + n + ' people be seated around a circular table?', a: _fact(n - 1), k: 'circular', explain: 'Around a circle one seat is fixed to remove identical rotations, leaving (n − 1)! = ' + (n - 1) + '! = ' + _fact(n - 1) + ' arrangements.' }; }
function _pcAtLeastOne() {
  for (var i = 0; i < 40; i++) {
    var w = randInt(2, 4), m = randInt(3, 5), r = randInt(2, 3);
    var total = _nCr(w + m, r), allMen = m >= r ? _nCr(m, r) : 0, ans = total - allMen;
    if (ans <= 0) continue;
    return { q: 'A committee of ' + r + ' is chosen from ' + w + ' women and ' + m + ' men. How many committees include at least one woman?', a: ans, k: 'atLeastOne', explain: 'Count the complement: total committees ' + (w + m) + 'C' + r + ' = ' + total + ', minus all-men committees ' + m + 'C' + r + ' = ' + allMen + ', gives ' + ans + '. “At least one” almost always means subtract the none-case.' };
  }
  return null;
}
var _PC_PRIMARY = { easy: function () { return _pcFactorial('easy'); }, medium: function () { return _pcNCr('medium'); }, hard: function () { return _pcHandshakes('hard'); } };
function genPermutationCombination() { return _genArch('permutation-combination', _PC_ARCH, _PC_PRIMARY); }

/** Probability (archetypes: single draw · complement · all-heads coins · multiples in a range). Decimal answers (clean). */
var _PROB_TOTALS = [4, 5, 10, 20, 25];
function _probBag() { var T = pick(_PROB_TOTALS), r = randInt(1, T - 1), b = T - r, colours = pick([['red', 'blue'], ['green', 'yellow'], ['black', 'white'], ['red', 'green']]); return { q: 'A bag has ' + r + ' ' + colours[0] + ' and ' + b + ' ' + colours[1] + ' balls. One ball is drawn at random. What is the probability it is ' + colours[0] + '? (as a decimal)', a: _round2(r / T), k: 'bagSingle', explain: 'P = favourable/total = ' + r + '/' + T + ' = ' + _round2(r / T) + '.' }; }
function _probComplement() { var T = pick(_PROB_TOTALS), r = randInt(1, T - 1), b = T - r, colours = pick([['red', 'blue'], ['green', 'yellow'], ['black', 'white']]); return { q: 'A bag has ' + r + ' ' + colours[0] + ' and ' + b + ' ' + colours[1] + ' balls. One ball is drawn at random. What is the probability it is NOT ' + colours[0] + '? (as a decimal)', a: _round2(1 - r / T), k: 'complement', explain: 'P(not ' + colours[0] + ') = 1 − ' + r + '/' + T + ' = ' + _round2(1 - r / T) + '.' }; }
function _probCoins(diff) { var n = randInt(1, diff === 'hard' ? 4 : 3); return { q: n + ' fair coin' + (n > 1 ? 's are' : ' is') + ' tossed. What is the probability of getting ' + (n === 1 ? 'a head' : 'all heads') + '? (as a decimal)', a: _round2(Math.pow(0.5, n)), k: 'allHeads', explain: 'P(all heads) = (1/2)^' + n + ' = ' + _round2(Math.pow(0.5, n)) + '.' }; }
function _probMultiple() { for (var t = 0; t < 30; t++) { var T = pick([10, 20, 25, 50]), d = pick([2, 4, 5, 10]); if (T % d !== 0) continue; var fav = T / d, p = fav / T; return { q: 'A number is chosen at random from 1 to ' + T + '. What is the probability it is a multiple of ' + d + '? (as a decimal)', a: _round2(p), k: 'multipleProb', explain: 'Multiples of ' + d + ' up to ' + T + ': ' + fav + '. P = ' + fav + '/' + T + ' = ' + _round2(p) + '.' }; } return null; }
var _PROB_ARCH = {
  easy: [{ k: 'bagSingle', skill: 'formula', build: function () { return _probBag(); } }, { k: 'allHeads', skill: 'formula', build: function (d) { return _probCoins(d); } }],
  medium: [{ k: 'bagSingle', skill: 'formula', build: function () { return _probBag(); } }, { k: 'complement', skill: 'multi-step', build: function () { return _probComplement(); } }, { k: 'multipleProb', skill: 'multi-step', build: function () { return _probMultiple(); } }],
  /* ADR-095: drop 'allHeads' (the easy all-coins archetype) — hard is complement ("at least one") and multi-event
     probability reasoning. */
  hard: [{ k: 'complement', skill: 'multi-step', build: function () { return _probComplement(); } }, { k: 'multipleProb', skill: 'multi-step', build: function () { return _probMultiple(); } }]
};
var _PROB_PRIMARY = { easy: function () { return _probBag(); }, medium: function () { return _probComplement(); }, hard: function () { return _probMultiple() || _probComplement(); } };
function genProbability() { return _genArch('probability', _PROB_ARCH, _PROB_PRIMARY); }

/** Set Theory (archetypes: union · only-A · neither · both · three-set union — all via inclusion–exclusion). Integers. */
var _SET_CTX = [['tea', 'coffee'], ['football', 'cricket'], ['Maths', 'Science'], ['Hindi', 'English'], ['apples', 'oranges'],
  ['chess', 'carrom'], ['Physics', 'Chemistry'], ['badminton', 'tennis'], ['History', 'Geography'], ['painting', 'music'],
  ['guitar', 'piano'], ['dogs', 'cats'], ['cricket', 'hockey'], ['pizza', 'burgers']];
function _setUnion() { var c = pick(_SET_CTX), both = randInt(4, 12), a = both + randInt(4, 20), b = both + randInt(4, 20); return { q: 'In a group, ' + a + ' like ' + c[0] + ', ' + b + ' like ' + c[1] + ', and ' + both + ' like both. How many like at least one of the two?', a: a + b - both, k: 'union', explain: '|A∪B| = |A| + |B| − |A∩B| = ' + a + ' + ' + b + ' − ' + both + ' = ' + (a + b - both) + '.' }; }
function _setOnly() { var c = pick(_SET_CTX), both = randInt(4, 12), a = both + randInt(5, 20); return { q: 'In a group, ' + a + ' people like ' + c[0] + ' and ' + both + ' of them also like ' + c[1] + '. How many like ONLY ' + c[0] + '?', a: a - both, k: 'onlyA', explain: 'Only ' + c[0] + ' = |A| − |A∩B| = ' + a + ' − ' + both + ' = ' + (a - both) + '.' }; }
function _setNeither() { var c = pick(_SET_CTX), both = randInt(4, 12), a = both + randInt(4, 18), b = both + randInt(4, 18), union = a + b - both, neither = randInt(2, 12), total = union + neither; return { q: 'In a class of ' + total + ' students, ' + a + ' like ' + c[0] + ', ' + b + ' like ' + c[1] + ' and ' + both + ' like both. How many like neither?', a: neither, k: 'neither', explain: 'Like at least one = ' + a + ' + ' + b + ' − ' + both + ' = ' + union + '. Neither = ' + total + ' − ' + union + ' = ' + neither + '.' }; }
function _setBoth() { var c = pick(_SET_CTX), both = randInt(4, 14), a = both + randInt(4, 16), b = both + randInt(4, 16), union = a + b - both, neither = randInt(2, 10), total = union + neither; return { q: 'In a class of ' + total + ' students, ' + a + ' like ' + c[0] + ', ' + b + ' like ' + c[1] + ' and ' + neither + ' like neither. How many like both?', a: both, k: 'both', explain: 'Like at least one = ' + total + ' − ' + neither + ' = ' + union + '. Both = |A| + |B| − union = ' + a + ' + ' + b + ' − ' + union + ' = ' + both + '.' }; }
function _setThree() { var x = []; for (var i = 0; i < 7; i++) x.push(randInt(1, 9)); var a = x[0] + x[3] + x[5] + x[6], b = x[1] + x[3] + x[4] + x[6], cc = x[2] + x[4] + x[5] + x[6], ab = x[3] + x[6], bc = x[4] + x[6], ca = x[5] + x[6], abc = x[6], union = x[0] + x[1] + x[2] + x[3] + x[4] + x[5] + x[6]; return { q: 'In a survey, ' + a + ' read A, ' + b + ' read B, ' + cc + ' read C; ' + ab + ' read A and B, ' + bc + ' read B and C, ' + ca + ' read A and C, and ' + abc + ' read all three. How many read at least one?', a: union, k: 'threeUnion', explain: '|A∪B∪C| = (' + a + '+' + b + '+' + cc + ') − (' + ab + '+' + bc + '+' + ca + ') + ' + abc + ' = ' + union + '.' }; }
var _SET_ARCH = {
  easy: [{ k: 'union', skill: 'formula', build: function () { return _setUnion(); } }, { k: 'onlyA', skill: 'direct', build: function () { return _setOnly(); } }],
  medium: [{ k: 'neither', skill: 'multi-step', build: function () { return _setNeither(); } }, { k: 'both', skill: 'multi-step', build: function () { return _setBoth(); } }, { k: 'union', skill: 'formula', build: function () { return _setUnion(); } }],
  hard: [{ k: 'threeUnion', skill: 'multi-step', build: function () { return _setThree(); } }, { k: 'neither', skill: 'multi-step', build: function () { return _setNeither(); } }, { k: 'both', skill: 'multi-step', build: function () { return _setBoth(); } }]
};
var _SET_PRIMARY = { easy: function () { return _setUnion(); }, medium: function () { return _setNeither(); }, hard: function () { return _setThree(); } };
function genSetTheory() { return _genArch('set-theory', _SET_ARCH, _SET_PRIMARY); }

/** Statistics Basics (archetypes: median · mode · range · mean of a small data set). Answers integer or ≤1-dp. */
function _statList(k, lo, hi) { var a = []; for (var i = 0; i < k; i++) a.push(randInt(lo, hi)); return a; }
function _stMedian(diff) { var k = diff === 'hard' ? 7 : 5, a = _statList(k, 2, 60), s = a.slice().sort(function (p, q) { return p - q; }); return { q: 'Find the median of ' + a.join(', ') + '.', a: s[(k - 1) / 2], k: 'median', explain: 'Sort: ' + s.join(', ') + '. With ' + k + ' values the median is the middle one = ' + s[(k - 1) / 2] + '.' }; }
function _stMode() { for (var t = 0; t < 30; t++) { var m = randInt(2, 20), a = [m, m, m], extra = _statList(randInt(2, 3), 21, 50); a = a.concat(extra); var ok = true; var cnt = {}; a.forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; }); for (var kk in cnt) { if (kk != m && cnt[kk] >= 3) ok = false; } if (ok) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(0, i), tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return { q: 'Find the mode of ' + a.join(', ') + '.', a: m, k: 'mode', explain: 'The mode is the most frequent value. ' + m + ' appears 3 times — more than any other — so the mode is ' + m + '.' }; } } return null; }
function _stRange(diff) { var k = diff === 'hard' ? 6 : 5, a = _statList(k, 3, 90), mx = Math.max.apply(null, a), mn = Math.min.apply(null, a); return { q: 'Find the range of ' + a.join(', ') + '.', a: mx - mn, k: 'range', explain: 'Range = largest − smallest = ' + mx + ' − ' + mn + ' = ' + (mx - mn) + '.' }; }
function _stMean() { for (var t = 0; t < 30; t++) { var k = 5, M = randInt(6, 30), a = _statList(k - 1, 2, 50), s = a.reduce(function (p, q) { return p + q; }, 0), last = k * M - s; if (last >= 1 && last <= 60) { a.push(last); return { q: 'Find the mean (average) of ' + a.join(', ') + '.', a: M, k: 'mean', explain: 'Mean = sum ÷ count = ' + (s + last) + ' ÷ ' + k + ' = ' + M + '.' }; } } return null; }
var _STAT_ARCH = {
  easy: [{ k: 'median', skill: 'multi-step', build: function (d) { return _stMedian(d); } }, { k: 'range', skill: 'direct', build: function (d) { return _stRange(d); } }],
  medium: [{ k: 'median', skill: 'multi-step', build: function (d) { return _stMedian(d); } }, { k: 'mode', skill: 'direct', build: function () { return _stMode(); } }, { k: 'range', skill: 'direct', build: function (d) { return _stRange(d); } }],
  hard: [{ k: 'mode', skill: 'direct', build: function () { return _stMode(); } }, { k: 'median', skill: 'multi-step', build: function (d) { return _stMedian(d); } }, { k: 'mean', skill: 'multi-step', build: function () { return _stMean(); } }]
};
var _STAT_PRIMARY = { easy: function () { return _stRange('easy'); }, medium: function () { return _stMedian('medium'); }, hard: function () { return _stMode() || _stRange('hard'); } };
function genStatistics() { return _genArch('statistics-basics', _STAT_ARCH, _STAT_PRIMARY); }

/** Quantity Comparison (Banking/CET) — the one genuinely-MCQ Quant format. Computes two quantities and picks the
 *  correct relation. Reuses the drill engine's q.options MCQ path (no UI work). Answers are the relation strings. */
var _QC_GT = 'Quantity I > Quantity II', _QC_LT = 'Quantity I < Quantity II', _QC_EQ = 'Quantity I = Quantity II';
var _QC_OPTS = [_QC_GT, _QC_LT, _QC_EQ];
function _qcWrap(q1, q2, desc1, desc2, work, k) {
  var rel = q1 > q2 ? _QC_GT : (q1 < q2 ? _QC_LT : _QC_EQ);
  return { q: 'Compare the two quantities.  Quantity I: ' + desc1 + '.  Quantity II: ' + desc2 + '.', a: rel, options: QRGen.shuffle(_QC_OPTS.slice()), k: k, explain: work + ' So Quantity I = ' + q1 + ' and Quantity II = ' + q2 + ', giving “' + rel + '”.' };
}
function _qcPct() { var b = pick([200, 250, 300, 400, 500, 600, 800]), a = pick([10, 15, 20, 25, 30, 40]), q1 = a * b / 100, d = pick([10, 20, 30]), q2 = pick([q1 - d, q1 + d, q1]); if (q2 < 0) q2 = q1 + d; return _qcWrap(q1, q2, a + '% of ' + b, '' + q2, a + '% of ' + b + ' = ' + q1 + '.', 'pct'); }
function _qcProduct() { var a = randInt(6, 18), b = randInt(6, 18), c = randInt(6, 18), d = randInt(6, 18), q1 = a * b, q2 = c * d; return _qcWrap(q1, q2, a + ' × ' + b, c + ' × ' + d, a + ' × ' + b + ' = ' + q1 + '; ' + c + ' × ' + d + ' = ' + q2 + '.', 'product'); }
function _qcSolve() { var m = randInt(2, 9), x = randInt(3, 20), n = randInt(1, 30), c = m * x + n, q2 = pick([x - 2, x - 1, x, x + 1, x + 2]); return _qcWrap(x, q2, 'the value of x, where ' + m + 'x + ' + n + ' = ' + c, '' + q2, m + 'x + ' + n + ' = ' + c + ' → x = ' + x + '.', 'solve'); }
function _qcAverage() { var list = [randInt(10, 40), randInt(10, 40), randInt(10, 40)], s = list[0] + list[1] + list[2]; if (s % 3 !== 0) { list[2] += (3 - s % 3); s = list[0] + list[1] + list[2]; } var q1 = s / 3, q2 = pick([q1 - pick([2, 5, 8]), q1 + pick([2, 5, 8]), q1]); return _qcWrap(q1, q2, 'the average of ' + list.join(', '), '' + q2, 'Average = (' + list.join(' + ') + ')/3 = ' + q1 + '.', 'average'); }
function _qcSquare() { var a = randInt(6, 20), q1 = a * a, q2 = pick([a * a - pick([1, 5, 11]), a * a + pick([1, 5, 11]), a * a]); return _qcWrap(q1, q2, a + '²', '' + q2, a + '² = ' + q1 + '.', 'square'); }
var _QC_ARCH = {
  easy: [{ k: 'pct', skill: 'compare', build: function () { return _qcPct(); } }, { k: 'product', skill: 'compare', build: function () { return _qcProduct(); } }],
  medium: [{ k: 'solve', skill: 'compare', build: function () { return _qcSolve(); } }, { k: 'average', skill: 'compare', build: function () { return _qcAverage(); } }, { k: 'pct', skill: 'compare', build: function () { return _qcPct(); } }],
  hard: [{ k: 'solve', skill: 'compare', build: function () { return _qcSolve(); } }, { k: 'square', skill: 'compare', build: function () { return _qcSquare(); } }, { k: 'average', skill: 'compare', build: function () { return _qcAverage(); } }]
};
var _QC_PRIMARY = { easy: function () { return _qcProduct(); }, medium: function () { return _qcSolve(); }, hard: function () { return _qcSquare(); } };
function genQuantityComparison() { return _genArch('quantity-comparison', _QC_ARCH, _QC_PRIMARY); }

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
  'time-and-work': genTimeWork,
  'simple-interest': genSimpleInterest,
  'compound-interest': genCompoundInterest,
  partnership: genPartnership,
  ages: genAges,
  mixtures: genMixtures,
  'pipes-cisterns': genPipes,
  'number-properties': genNumberProperties,
  'linear-equations': genLinearEquations,
  'quadratic-equations': genQuadraticEquations,
  'surds-indices': genSurdsIndices,
  logarithms: genLogarithms,
  progressions: genProgressions,
  'inequalities-modulus': genInequalities,
  'geometry-basics': genGeometryBasics,
  'coordinate-geometry-basics': genCoordinateGeometry,
  trigonometry: genTrigonometry,
  'surface-area': genSurfaceArea,
  'permutation-combination': genPermutationCombination,
  probability: genProbability,
  'set-theory': genSetTheory,
  'statistics-basics': genStatistics,
  'quantity-comparison': genQuantityComparison
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
  genSimplification, genNumberSeries, genSimpleInterest, genCompoundInterest, genPartnership,
  genAges, genMixtures, genPipes, genNumberProperties,
  genLinearEquations, genQuadraticEquations, genSurdsIndices,
  genLogarithms, genProgressions, genInequalities,
  genGeometryBasics, genCoordinateGeometry, genTrigonometry, genSurfaceArea,
  genPermutationCombination, genProbability, genSetTheory, genStatistics,
  genQuantityComparison];

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
  var NEEDS_CONTEXT = { 'lr-seating': 1, 'lr-puzzle': 1, 'lr-mirror': 1, 'lr-water': 1, 'lr-dice': 1, 'lr-cube': 1, 'lr-fseries': 1, 'lr-fanalogy': 1, 'lr-odd-fig': 1, 'lr-paper': 1, 'lr-pattern': 1, 'lr-embedded': 1 };
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
