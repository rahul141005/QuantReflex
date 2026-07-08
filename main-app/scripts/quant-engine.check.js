/**
 * quant-engine.check.js — validates the Quant generator (ADR-083 Master Overhaul).
 *
 * The guarantees Quant needs match DI/LR: CORRECTNESS (a wrong answer silently teaches the wrong thing), CLEAN answers
 * (the numpad grades with a tight tolerance), and EARNED DIFFICULTY (a tier must use a tier archetype, never a silent
 * downgrade). This harness samples every category × difficulty and, for each ARCHETYPE-refactored category, independently
 * RE-COMPUTES the answer from the question stem (no shared code with the generator) and asserts it matches — plus
 * structural invariants for all 36 categories and per-tier archetype-coverage/diversity. Wired into `npm test`.
 *   node scripts/quant-engine.check.js
 */
'use strict';
var path = require('path');
function p(rel) { return path.join(__dirname, '..', rel); }
var Q = require(p('js/questions.js'));

var pass = 0, fail = 0, shownFail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; if (++shownFail <= 20) console.error('  ✗ ' + label); } }

/* ADR-111 Phase F: node-context generation is PINNED to English (QRI18n absent → QRGenI18n resolves 'en'),
   so this check's digit-order recompute keeps validating the EN math exactly. If a future refactor let a
   non-EN pack drive generation in the node harness, the recompute below would parse Devanagari-framed stems
   and this pin would catch it first. */
(function () {
  var GI = require(p('js/gen-i18n.js'));
  GI.register('en', '_enpin', { tpl: { p: { s: [function () { return 'EN'; }] } } });
  GI.register('hi', '_enpin', { tpl: { p: { s: [function () { return 'HI'; }] } } });
  var r = GI.render('_enpin', 'p', 0, {});
  ok('node-context generation pins to EN (QRI18n stubbed off)', !!r && r.q === 'EN');
})();

var DIFFS = ['easy', 'medium', 'hard'];
var ALL_CATS = ['squares', 'cubes', 'area', 'volume', 'fractions', 'percentages', 'multiplication', 'ratios',
  'averages', 'profit-loss', 'time-speed-distance', 'time-and-work', 'simplification', 'number-series',
  'simple-interest', 'compound-interest', 'partnership', 'ages', 'mixtures', 'pipes-cisterns', 'number-properties',
  'linear-equations', 'quadratic-equations', 'surds-indices',
  'logarithms', 'progressions', 'inequalities-modulus',
  'geometry-basics', 'coordinate-geometry-basics', 'trigonometry', 'surface-area',
  'permutation-combination', 'probability', 'set-theory', 'statistics-basics', 'quantity-comparison'];

/* Every archetype-refactored category (all 14 after ADR-083 Phase 2) — full recompute + earned-tier + diversity checks. */
var TIER_KEYS = {
  squares: { easy: ['direct'], medium: ['direct', 'inverse'], hard: ['inverse', 'diffSquares'] },
  cubes: { easy: ['direct'], medium: ['direct', 'inverse'], hard: ['inverse', 'cubeRoot5', 'diffCubes'] },
  area: { easy: ['square', 'rectangle'], medium: ['rectangle', 'triangle', 'parallelogram', 'circle'], hard: ['triangle', 'circle', 'trapezium', 'border'] },
  volume: { easy: ['cube', 'cuboid'], medium: ['cuboid', 'cylinder'], hard: ['cylinder', 'sphere', 'cone'] },
  percentages: { easy: ['directOf'], medium: ['directOf', 'reverse', 'whatPct'], hard: ['pctChange', 'successive', 'netTrap'] },
  multiplication: { easy: ['multiply'], medium: ['multiply', 'divide', 'threeFactor', 'mentalSquare'], hard: ['multiply', 'divide', 'threeFactor'] },
  ratios: { easy: ['divide', 'pctRatio'], medium: ['divide', 'findTerm', 'pctRatio'], hard: ['findTerm', 'combine', 'pctRatio'] },
  averages: { easy: ['mean'], medium: ['mean', 'missing'], hard: ['weighted', 'newMember'] },
  'profit-loss': { easy: ['spProfit', 'spLoss'], medium: ['spProfit', 'spLoss', 'profitPct'], hard: ['profitPct', 'findCP', 'successive'] },
  'time-speed-distance': { easy: ['distance', 'time', 'speed'], medium: ['distance', 'time', 'speed', 'unitConvert'], hard: ['avgSpeed', 'relativeSpeed', 'trainCrossing'] },
  'time-and-work': { easy: ['together', 'workDone'], medium: ['together', 'workDone', 'workersScale'], hard: ['inverseTogether', 'workersScale'] },
  simplification: { easy: ['multiplyAdd'], medium: ['divideAdd', 'multiplyAdd'], hard: ['fullBodmas'] },
  'number-series': { easy: ['arithmetic', 'geometric'], medium: ['arithmetic', 'geometric', 'growingGap'], hard: ['growingGap', 'squaresSeries', 'alternating'] },
  fractions: { easy: ['fracToPct'], medium: ['fracToPct', 'pctToFrac'], hard: ['fracOfFrac', 'addFrac', 'pctToFrac'] },
  'simple-interest': { easy: ['si', 'amount'], medium: ['si', 'amount', 'findRate'], hard: ['findRate', 'findPrincipal'] },
  'compound-interest': { easy: ['amount'], medium: ['amount', 'ci'], hard: ['ci', 'ciSiDiff'] },
  partnership: { easy: ['shareRatio', 'share2'], medium: ['share2', 'shareTime'], hard: ['shareTime', 'share2'] },
  ages: { easy: ['ratioSum', 'presentAge'], medium: ['ratioSum', 'ageDiff'], hard: ['ageDiff', 'fatherSon'] },
  mixtures: { easy: ['alligationRatio'], medium: ['alligationRatio', 'meanPrice'], hard: ['meanPrice', 'alligationQty'] },
  'pipes-cisterns': { easy: ['together'], medium: ['together', 'netFill'], hard: ['netFill', 'inverseFill', 'leakEmpty'] },
  'number-properties': { easy: ['hcf', 'lcm'], medium: ['hcf', 'lcm', 'unitDigit'], hard: ['unitDigit', 'numFactors'] },
  'linear-equations': { easy: ['solveOne', 'solveOneSub'], medium: ['solveOne', 'bracket', 'sumDiff'], hard: ['bracket', 'sumDiff', 'system2'] },
  'quadratic-equations': { easy: ['largerRoot', 'sumRoots'], medium: ['largerRoot', 'smallerRoot', 'productRoots', 'sumRoots'], hard: ['discriminant', 'productRoots', 'rootRelation'] },
  'surds-indices': { easy: ['powerEval', 'solveExp'], medium: ['powerEval', 'fracExponent', 'indexLaw'], hard: ['fracExponent', 'indexLaw', 'solveExp'] },
  logarithms: { easy: ['evalLog', 'solveLog'], medium: ['evalLog', 'logSum', 'logPower'], hard: ['logPower', 'solveLog', 'logSum'] },
  progressions: { easy: ['apNth', 'apSum'], medium: ['apNth', 'gpNth', 'apSum'], hard: ['gpNth', 'gpSum'] },
  'inequalities-modulus': { easy: ['linIneqMin', 'countRange'], medium: ['linIneqMin', 'modLarger', 'countRange'], hard: ['modIneqCount', 'modIneqCountLe', 'modLarger'] },
  'geometry-basics': { easy: ['complement', 'supplement', 'triangleThird'], medium: ['triangleThird', 'pythHyp', 'isosceles'], hard: ['pythLeg', 'polygonSum', 'polygonEach'] },
  'coordinate-geometry-basics': { easy: ['distance', 'midpointX'], medium: ['distance', 'slope', 'midpointX'], hard: ['slope', 'distance', 'sectionX'] },
  trigonometry: { easy: ['standardEval', 'complementary'], medium: ['standardEval', 'complementary', 'identity'], hard: ['identity', 'heightElev'] },
  'surface-area': { easy: ['cubeTSA', 'cuboidTSA'], medium: ['cuboidTSA', 'cylCSA', 'cubeLSA'], hard: ['cylTSA', 'sphereSA'] },
  'permutation-combination': { easy: ['factorial', 'arrange'], medium: ['nCr', 'nPr', 'arrange'], hard: ['committee', 'handshakes', 'circular', 'atLeastOne'] },
  probability: { easy: ['bagSingle', 'allHeads'], medium: ['bagSingle', 'complement', 'multipleProb'], hard: ['complement', 'multipleProb'] },
  'set-theory': { easy: ['union', 'onlyA'], medium: ['neither', 'both', 'union'], hard: ['threeUnion', 'neither', 'both'] },
  'statistics-basics': { easy: ['median', 'range'], medium: ['median', 'mode', 'range'], hard: ['mode', 'median', 'mean'] },
  'quantity-comparison': { easy: ['pct', 'product'], medium: ['solve', 'average', 'pct'], hard: ['solve', 'square', 'average'] }
};
var REFACTORED = Object.keys(TIER_KEYS);

function nums(s) { return (String(s).match(/\d+/g) || []).map(Number); }
function approxEq(a, b) { return Math.abs(a - b) < 0.02; }
function r2(x) { return Math.round(x * 100) / 100; }
/* Numeric VALUE of an answer, so string answers (ratios "p:q", fractions "p/q") can be verified by relationship:
   a wrong table entry or broken conversion shifts the value and is caught, without reconstructing the canonical
   string. Plain numbers/decimals pass straight through, so existing numeric recomputes are unaffected (ADR-095 P3). */
function answerValue(a) {
  if (typeof a === 'number') return a;
  var s = String(a).trim();
  var mR = s.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/); if (mR) return Number(mR[1]) / Number(mR[2]);
  var mF = s.match(/^(-?\d+)\s*\/\s*(-?\d+)$/); if (mF) return Number(mF[1]) / Number(mF[2]);
  return parseFloat(s);
}
/* Independent gcd (Euclid) — a different code path from the generator's helper. */
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }
/* Independent modular exponentiation — for recomputing unit digits without the generator's cyclicity table. */
function modpow(b, e, m) { var r = 1; b %= m; while (e > 0) { if (e & 1) r = r * b % m; e = Math.floor(e / 2); b = b * b % m; } return r; }
/* Independent trial-division divisor count. */
function divisorCount(N) { N = Math.abs(N); var c = 0; for (var d = 1; d * d <= N; d++) { if (N % d === 0) c += (d === N / d ? 1 : 2); } return c; }
/* Independent factorial / permutations / combinations (iterative — a different path from the generator's helpers). */
function fact(n) { var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
function nPr(n, r) { return fact(n) / fact(n - r); }
function nCr(n, r) { return fact(n) / (fact(r) * fact(n - r)); }
/* Independent re-evaluation of a pure arithmetic stem (multiplication / simplification) via a different code path. */
function evalExpr(text) { var lhs = String(text).split('=')[0].replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/[^0-9+\-*/(). ]/g, ''); try { return Function('"use strict";return (' + lhs + ')')(); } catch (e) { return null; } }
/* Independent next-term detector for number series (arithmetic / geometric / constant 2nd difference). */
function seriesNext(n) { if (n.length < 4) return null; var d = [n[1] - n[0], n[2] - n[1], n[3] - n[2]]; if (d[0] === d[1] && d[1] === d[2]) return n[3] + d[0]; if (n[0] && n[1] / n[0] === n[2] / n[1] && n[2] / n[1] === n[3] / n[2]) return n[3] * (n[1] / n[0]); if (d[1] - d[0] === d[2] - d[1]) return n[3] + d[2] + (d[1] - d[0]); return null; }

/* Independently recompute the expected answer from the stem. Returns a number, or null (string answers / not recomputed here). */
function recompute(cat, key, text) {
  var n = nums(text);
  if (cat === 'squares') { if (key === 'direct') return n[0] * n[0]; if (key === 'inverse') return Math.sqrt(n[0]); if (key === 'diffSquares') return n[0] * n[0] - n[1] * n[1]; }
  if (cat === 'cubes') { if (key === 'direct') return n[0] * n[0] * n[0]; if (key === 'inverse' || key === 'cubeRoot5') return Math.round(Math.cbrt(n[0])); if (key === 'diffCubes') return n[0] * n[0] * n[0] - n[1] * n[1] * n[1]; }
  if (cat === 'fractions' && key === 'fracOfFrac') return n[4] * n[0] * n[2] / (n[1] * n[3]);   /* a/b of c/d of N */
  /* ADR-095 P3 — string-answer fractions verified by VALUE (catches a bad frac↔pct table entry or broken add): */
  if (cat === 'fractions' && key === 'fracToPct') return n[0] / n[1] * 100;                     /* "a/b as %" → a/b×100 */
  if (cat === 'fractions' && key === 'addFrac') return n[0] / n[1] + n[2] / n[3];               /* "a1/b1 + a2/b2" → sum value */
  if (cat === 'fractions' && key === 'pctToFrac') { var mp = String(text).match(/([\d.]+)\s*%/); return mp ? parseFloat(mp[1]) / 100 : null; }   /* "X% as a fraction" → X/100 */
  if (cat === 'area') {
    if (key === 'square') return n[0] * n[0]; if (key === 'rectangle' || key === 'parallelogram') return n[0] * n[1];
    if (key === 'triangle') return n[0] * n[1] / 2; if (key === 'circle') return r2(3.14 * n[0] * n[0]);
    if (key === 'trapezium') return (n[0] + n[1]) * n[2] / 2; if (key === 'border') return n[0] * n[1] - (n[0] - 2 * n[2]) * (n[1] - 2 * n[2]);
  }
  if (cat === 'volume') {
    if (key === 'cube') return n[0] * n[0] * n[0]; if (key === 'cuboid') return n[0] * n[1] * n[2];
    if (key === 'cylinder') return r2(3.14 * n[0] * n[0] * n[1]); if (key === 'sphere') return r2((4 / 3) * 3.14 * n[0] * n[0] * n[0]); if (key === 'cone') return r2((1 / 3) * 3.14 * n[0] * n[0] * n[1]);
  }
  if (cat === 'percentages') {
    if (key === 'directOf') return n[0] * n[1] / 100; if (key === 'reverse') return n[1] * 100 / n[0]; if (key === 'whatPct') return n[1] * 100 / n[0];
    if (key === 'pctChange') return (n[1] - n[0]) * 100 / n[0]; if (key === 'successive') return n[0] * (1 - n[1] / 100) * (1 - n[2] / 100); if (key === 'netTrap') return n[0] * n[0] / 100;
  }
  if (cat === 'multiplication' || cat === 'simplification') return evalExpr(text);
  if (cat === 'ratios') {
    if (key === 'divide') return n[0] * n[1] / (n[1] + n[2]); if (key === 'findTerm') return n[2] * n[1] / n[0];
    /* ADR-095 P3 — string-answer ratios verified by VALUE: */
    if (key === 'combine') return n[0] / n[3];                                                  /* A:B=a:b, B:C=b:c (b common) → A:C value = a/c */
    if (key === 'pctRatio') { var mr = String(text).match(/([\d.]+)\s*%\s*(more|less)/); if (!mr) return null; var x = parseFloat(mr[1]); return (mr[2] === 'more' ? (100 + x) : (100 - x)) / 100; }   /* "A is X% more/less than B" → A/B value */
    return null;
  }
  if (cat === 'averages') {
    if (key === 'mean') return n.reduce(function (s, v) { return s + v; }, 0) / n.length;
    if (key === 'missing') { var k = n.slice(0, -1), avg = n[n.length - 1]; return avg * (k.length + 1) - k.reduce(function (s, v) { return s + v; }, 0); }
    if (key === 'weighted') return (n[0] * n[1] + n[2] * n[3]) / (n[0] + n[2]);
    if (key === 'newMember') return n[2] * (n[0] + 1) - n[1] * n[0];
  }
  if (cat === 'profit-loss') {
    if (key === 'spProfit') return n[0] * (1 + n[1] / 100); if (key === 'spLoss') return n[0] * (1 - n[1] / 100);
    if (key === 'profitPct') return (n[1] - n[0]) * 100 / n[0]; if (key === 'findCP') return n[0] / (1 + n[1] / 100);
    if (key === 'successive') return n[0] * (1 + n[1] / 100) * (1 + n[2] / 100);
  }
  if (cat === 'time-speed-distance') {
    if (key === 'distance') return n[0] * n[1]; if (key === 'time' || key === 'speed') return Math.max.apply(null, n) / Math.min.apply(null, n);
    if (key === 'avgSpeed') return 2 * n[0] * n[1] / (n[0] + n[1]);
    if (key === 'unitConvert') {
      var iKm = text.indexOf('km/h'), iMs = Math.max(text.indexOf('m/s'), text.indexOf('metres per second'));
      return (iKm !== -1 && (iMs === -1 || iKm < iMs)) ? n[0] * 5 / 18 : n[0] * 18 / 5;   /* source unit appears first */
    }
    if (key === 'relativeSpeed') return n[0] / (n[1] + n[2]);                              /* D apart at s1 and s2 */
    if (key === 'trainCrossing') { var ms = n[1] * 5 / 18; return /platform/.test(text) ? (n[0] + n[2]) / ms : n[0] / ms; }
  }
  if (cat === 'time-and-work') {
    if (key === 'together') return n[0] * n[1] / (n[0] + n[1]); if (key === 'workDone') return n[1] * 100 / n[0]; if (key === 'workersScale') return n[0] * n[1] / n[2];
    if (key === 'inverseTogether') return n[0] * n[1] / (n[1] - n[0]);                   /* together T, one solo a → other = a·T/(a−T); tokens [T, a] */
  }
  if (cat === 'number-series') {
    if (key === 'alternating') return n[4] + (n[2] - n[0]);   /* two interleaved APs: the 7th term continues chain 1 */
    return seriesNext(n.slice(0, 4));                          /* arithmetic / geometric / constant 2nd diff (incl. n²±k) */
  }
  if (cat === 'simple-interest') {
    if (key === 'si') return n[0] * n[1] * n[2] / 100; if (key === 'amount') return n[0] + n[0] * n[1] * n[2] / 100;
    if (key === 'findRate') return n[1] * 100 / (n[0] * n[2]); if (key === 'findPrincipal') return n[0] * 100 / (n[1] * n[2]);
  }
  if (cat === 'compound-interest') {
    if (key === 'amount') return n[0] * Math.pow(1 + n[1] / 100, n[2]); if (key === 'ci') return n[0] * Math.pow(1 + n[1] / 100, n[2]) - n[0];
    if (key === 'ciSiDiff') return n[0] * n[1] * n[1] / 10000;
  }
  if (cat === 'partnership') {
    if (key === 'share2') return n[2] * n[0] / (n[0] + n[1]);
    if (key === 'shareTime') return n[4] * (n[0] * n[1]) / (n[0] * n[1] + n[2] * n[3]);
  }
  if (cat === 'ages') {
    if (key === 'presentAge') return n[0] + n[1];                              /* "t years ago age was a" → a + t */
    if (key === 'ratioSum') return n[0] / (n[0] + n[1]) * n[2];                 /* ratio a:b, sum S → a/(a+b)·S */
    if (key === 'ageDiff') return (n[0] - (n[2] - 1) * n[1]) / (n[2] - 1);      /* "A is x older; in t yrs A = m×B" */
    if (key === 'fatherSon') return n[1] * (n[2] - 1) / (n[0] - n[2]);          /* "father N×; in t yrs M×" → t(M−1)/(N−M) */
  }
  if (cat === 'mixtures') {
    if (key === 'meanPrice') return (n[0] * n[1] + n[2] * n[3]) / (n[0] + n[2]);
    if (key === 'alligationQty') return n[1] * (n[2] - n[3]) / (n[3] - n[0]);   /* "at ₹a, y kg at ₹b, mixture ₹m" */
    if (key === 'alligationRatio') return (n[1] - n[2]) / (n[2] - n[0]);        /* ADR-095 P3: "at ₹a, ₹b, mixture ₹m" → cheaper:dearer value = (b−m)/(m−a) */
  }
  if (cat === 'pipes-cisterns') {
    if (key === 'together') return n[0] * n[1] / (n[0] + n[1]);
    if (key === 'netFill') return n[0] * n[1] / (n[1] - n[0]);
    if (key === 'inverseFill') return n[0] * n[1] / (n[1] - n[0]);                       /* together t, alone a → a·t/(a−t) */
    if (key === 'leakEmpty') return n[0] * n[1] * n[2] / (n[1] * n[2] + n[0] * n[2] - n[0] * n[1]);
  }
  if (cat === 'number-properties') {
    if (key === 'hcf') return gcd(n[0], n[1]);
    if (key === 'lcm') return Math.abs(n[0] * n[1]) / gcd(n[0], n[1]);
    if (key === 'unitDigit') return modpow(n[0] % 10, n[1], 10);        /* independent: modular exponentiation */
    if (key === 'numFactors') return divisorCount(n[0]);               /* independent: trial-division divisor count */
  }
  if (cat === 'linear-equations') {
    if (key === 'solveOne') return (n[2] - n[1]) / n[0];               /* ax + b = c → (c−b)/a */
    if (key === 'solveOneSub') return (n[2] + n[1]) / n[0];            /* ax − b = c → (c+b)/a */
    if (key === 'bracket') return n[2] / n[0] - n[1];                  /* a(x + b) = c → c/a − b */
    if (key === 'sumDiff') return (n[0] + n[1]) / 2;                   /* x+y=S, x−y=D → (S+D)/2 */
    if (key === 'system2') return (n[2] * n[4] - n[5] * n[1]) / (n[0] * n[4] - n[3] * n[1]);  /* Cramer's rule for x */
  }
  if (cat === 'quadratic-equations') {                                 /* stem: x² − Bx + C = 0 → n[0]=B, n[1]=C */
    if (key === 'sumRoots') return n[0];
    if (key === 'productRoots') return n[1];
    if (key === 'discriminant') return n[0] * n[0] - 4 * n[1];
    if (key === 'largerRoot') return (n[0] + Math.sqrt(n[0] * n[0] - 4 * n[1])) / 2;
    if (key === 'smallerRoot') return (n[0] - Math.sqrt(n[0] * n[0] - 4 * n[1])) / 2;
    if (key === 'rootRelation') return (n[0] * n[0] - n[2] * n[2]) / 4;   /* sum B, "= 0", gap g → product (B²−g²)/4 */
  }
  if (cat === 'surds-indices') {
    if (key === 'powerEval') return Math.pow(n[0], n[1]);              /* a^n */
    if (key === 'fracExponent') return Math.round(Math.pow(n[0], n[1] / n[2]));  /* b^(p/root) */
    if (key === 'indexLaw') return n[1] - n[3];                        /* (a^m)÷(a^n) exponent = m−n */
    if (key === 'solveExp') return Math.round(Math.log(n[1]) / Math.log(n[0]));  /* a^x = N → x */
  }
  if (cat === 'logarithms') {
    var lg = function (base, v) { return Math.round(Math.log(v) / Math.log(base)); };
    if (key === 'evalLog') return lg(n[0], n[1]);                      /* log_b(N) */
    if (key === 'logSum') return lg(n[0], n[1]) + lg(n[2], n[3]);      /* log_b(x)+log_b(y) */
    if (key === 'logPower') return n[2] * lg(n[0], n[1]);              /* log_b(x^k) = k·log_b(x) */
    if (key === 'solveLog') return Math.pow(n[0], n[1]);              /* log_b(x)=k → x = b^k */
  }
  if (cat === 'progressions') {
    if (key === 'apNth') return n[0] + (n[2] - 1) * n[1];              /* a + (n−1)d */
    if (key === 'apSum') return n[2] / 2 * (2 * n[0] + (n[2] - 1) * n[1]);  /* n/2·[2a+(n−1)d] */
    if (key === 'gpNth') return n[0] * Math.pow(n[1], n[2] - 1);       /* a·r^(n−1) */
    if (key === 'gpSum') return n[0] * (Math.pow(n[1], n[2]) - 1) / (n[1] - 1);  /* a(rⁿ−1)/(r−1) */
  }
  if (cat === 'inequalities-modulus') {
    if (key === 'linIneqMin') return Math.floor((n[2] - n[1]) / n[0]) + 1;  /* smallest int with ax+b>c */
    if (key === 'modLarger') return n[0] + n[1];                      /* |x−a|=b → larger = a+b */
    if (key === 'countRange') return n[1] - n[0] + 1;                 /* integers in [a,b] inclusive */
    if (key === 'modIneqCount') return 2 * n[1] - 1;                  /* |x−a|<b → 2b−1 integers */
    if (key === 'modIneqCountLe') return 2 * n[1] + 1;               /* |x−a|≤b → 2b+1 integers */
  }
  if (cat === 'geometry-basics') {
    if (key === 'complement') return 90 - n[0];
    if (key === 'supplement') return 180 - n[0];
    if (key === 'triangleThird') return 180 - n[0] - n[1];
    if (key === 'isosceles') return (180 - n[0]) / 2;
    if (key === 'pythHyp') return Math.sqrt(n[0] * n[0] + n[1] * n[1]);          /* legs → hypotenuse */
    if (key === 'pythLeg') return Math.sqrt(n[0] * n[0] - n[1] * n[1]);          /* hyp,leg → other leg */
    if (key === 'polygonSum') return (n[0] - 2) * 180;
    if (key === 'polygonEach') return (n[0] - 2) * 180 / n[0];
  }
  if (cat === 'coordinate-geometry-basics') {                                     /* coords non-negative → sign-safe */
    if (key === 'distance') return Math.sqrt((n[2] - n[0]) * (n[2] - n[0]) + (n[3] - n[1]) * (n[3] - n[1]));
    if (key === 'midpointX') return (n[0] + n[2]) / 2;
    if (key === 'slope') return (n[3] - n[1]) / (n[2] - n[0]);
    if (key === 'sectionX') return (n[4] * n[2] + n[5] * n[0]) / (n[4] + n[5]);   /* nums: x1,y1,x2,y2,m,n */
  }
  if (cat === 'trigonometry') {
    if (key === 'standardEval') { var fn = /sin/.test(text) ? Math.sin : (/cos/.test(text) ? Math.cos : Math.tan); return r2(fn(n[0] * Math.PI / 180)); }
    if (key === 'complementary') return 90 - n[0];                    /* sin θ = cos(90−θ) etc. */
    if (key === 'identity') return 1;                                 /* sin²+cos², sec²−tan², cosec²−cot² all = 1 */
    if (key === 'heightElev') return Math.round(n[0] * Math.tan(n[1] * Math.PI / 180));  /* height = base·tan(45°) */
  }
  if (cat === 'surface-area') {
    if (key === 'cubeTSA') return 6 * n[0] * n[0];
    if (key === 'cubeLSA') return 4 * n[0] * n[0];
    if (key === 'cuboidTSA') return 2 * (n[0] * n[1] + n[1] * n[2] + n[0] * n[2]);
    if (key === 'cylCSA') return r2(2 * 3.14 * n[0] * n[1]);
    if (key === 'cylTSA') return r2(2 * 3.14 * n[0] * (n[0] + n[1]));
    if (key === 'sphereSA') return r2(4 * 3.14 * n[0] * n[0]);
  }
  if (cat === 'permutation-combination') {
    if (key === 'factorial' || key === 'arrange') return fact(n[0]);
    if (key === 'nPr') return nPr(n[0], n[1]);                        /* "7P3" → nums 7,3 */
    if (key === 'nCr' || key === 'committee') return nCr(n[0], n[1]);
    if (key === 'handshakes') return nCr(n[0], 2);
    if (key === 'circular') return fact(n[0] - 1);
    if (key === 'atLeastOne') return nCr(n[1] + n[2], n[0]) - (n[2] >= n[0] ? nCr(n[2], n[0]) : 0);  /* nums r,w,m */
  }
  if (cat === 'probability') {
    if (key === 'bagSingle') return r2(n[0] / (n[0] + n[1]));
    if (key === 'complement') return r2(1 - n[0] / (n[0] + n[1]));
    if (key === 'allHeads') return r2(Math.pow(0.5, n[0]));
    if (key === 'multipleProb') return r2(Math.floor(n[1] / n[2]) / n[1]);   /* nums: 1, T, d */
  }
  if (cat === 'set-theory') {
    if (key === 'union') return n[0] + n[1] - n[2];                  /* |A∪B| = a+b−both */
    if (key === 'onlyA') return n[0] - n[1];                         /* a − both */
    if (key === 'neither') return n[0] - (n[1] + n[2] - n[3]);       /* total − (a+b−both) */
    if (key === 'both') return (n[1] + n[2]) - (n[0] - n[3]);        /* a+b − (total−neither) */
    if (key === 'threeUnion') return n[0] + n[1] + n[2] - n[3] - n[4] - n[5] + n[6];  /* inclusion–exclusion */
  }
  if (cat === 'statistics-basics') {
    var sorted = n.slice().sort(function (p, q) { return p - q; });
    if (key === 'median') return sorted[(n.length - 1) / 2];         /* odd-length list */
    if (key === 'range') return sorted[n.length - 1] - sorted[0];
    if (key === 'mean') return n.reduce(function (s, v) { return s + v; }, 0) / n.length;
    if (key === 'mode') { var c = {}, best = null, bc = 0; n.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (c[v] > bc) { bc = c[v]; best = v; } }); return best; }
  }
  return null;   /* fractions (string), ratios pctRatio/combine (string), mixtures alligationRatio (string) */
}

/* ── 1. structural sweep over all 36 categories × 3 difficulties ── */
var structural = 0, recomputed = 0, mismatches = 0;
var seenKeys = {};   /* cat/diff → {key:true} for diversity */
ALL_CATS.forEach(function (cat) {
  DIFFS.forEach(function (diff) {
    var tag = cat + '/' + diff;
    for (var i = 0; i < 150; i++) {
      var q = Q.generateQuestion(cat, diff);
      structural++;
      ok('1 ' + tag + ' has question text', typeof q.question === 'string' && q.question.length > 0);
      ok('1 ' + tag + ' category tag', q.category === cat);
      var isNum = typeof q.answer === 'number';
      /* Slopes are the one legitimately-negative answer (a downward line); everything else stays non-negative. */
      var negOk = cat === 'coordinate-geometry-basics' && String(q.subtype).split(':')[1] === 'slope';
      if (isNum) ok('1 ' + tag + ' finite ' + (negOk ? '' : 'non-negative ') + 'numeric answer', isFinite(q.answer) && (negOk || q.answer >= 0));
      else ok('1 ' + tag + ' non-empty string answer', typeof q.answer === 'string' && q.answer.length > 0);
      if (q.options) { ok('1 ' + tag + ' options include answer', q.options.indexOf(String(q.answer)) !== -1); ok('1 ' + tag + ' options distinct', q.options.length === q.options.filter(function (o, k) { return q.options.indexOf(o) === k; }).length); }

      if (REFACTORED.indexOf(cat) !== -1) {
        ok('2 ' + tag + ' subtype is diff:key', typeof q.subtype === 'string' && q.subtype.indexOf(diff + ':') === 0);
        var key = String(q.subtype).split(':')[1];
        ok('2 ' + tag + ' earned-tier archetype (' + key + ')', TIER_KEYS[cat][diff].indexOf(key) !== -1);
        ok('2 ' + tag + ' has explanation', typeof q.explanation === 'string' && q.explanation.length >= 10);
        (seenKeys[tag] = seenKeys[tag] || {})[key] = true;
        var exp = recompute(cat, key, q.question);
        if (exp != null) { recomputed++; var good = approxEq(exp, answerValue(q.answer)); if (!good) { mismatches++; if (shownFail < 20) console.error('    recompute ' + tag + '/' + key + ': got ' + q.answer + ' expected ' + exp + ' — ' + q.question); } ok('2 ' + tag + '/' + key + ' answer == independent recompute', good); }
      }
    }
  });
});

/* ── 3. diversity: every multi-archetype tier actually surfaces ≥2 distinct archetypes over 150 samples ── */
REFACTORED.forEach(function (cat) {
  DIFFS.forEach(function (diff) {
    var want = TIER_KEYS[cat][diff].length;
    var got = Object.keys(seenKeys[cat + '/' + diff] || {}).length;
    if (want >= 2) ok('3 ' + cat + '/' + diff + ' surfaces ≥2 archetypes (' + got + '/' + want + ')', got >= 2);
  });
});

/* ── 4. no earned-tier downgrade: a hard refactored question never carries an easy-only archetype key ── */
REFACTORED.forEach(function (cat) {
  var easyOnly = TIER_KEYS[cat].easy.filter(function (k) { return TIER_KEYS[cat].hard.indexOf(k) === -1; });
  var bad = 0;
  for (var i = 0; i < 120; i++) { var k = String(Q.generateQuestion(cat, 'hard').subtype).split(':')[1]; if (easyOnly.indexOf(k) !== -1) bad++; }
  ok('4 ' + cat + ' hard never downgrades to an easy-only archetype', bad === 0);
});

console.log('quant-engine.check: ' + pass + ' passed, ' + fail + ' failed');
console.log('  (structural samples: ' + structural + '; answers independently recomputed: ' + recomputed + '; recompute mismatches: ' + mismatches + ')');
if (fail) process.exit(1);
