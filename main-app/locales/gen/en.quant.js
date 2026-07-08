/**
 * en.quant.js — English generated-content pack (quant engine) for QRGenI18n (ADR-111 Phase F).
 *
 * Templates are extracted VERBATIM from the archetype build()s in js/questions.js — each legacy `pick([…])`
 * branch is one entry in the `s` (stem) array, and the explanation is the `e` array. render() picks
 * templates[v % length] with the build-time variant seed, so the masked-shape SET is byte-identical to the
 * pre-refactor engine (proven by scripts/quant-census.js). Pure math notation in explanations is precomputed
 * into slots (language-neutral) and emitted as-is; natural-language framing is composed from number slots so
 * hi/mr packs can translate the words while every digit stays identical.
 *
 * Archetype key = `category:difficulty:k`. English is EAGER (loaded before questions.js). Function-valued —
 * validated by scripts/gen-i18n.check.js and the quant census, never by the catalog string scanner.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* English ordinal (1st, 2nd, 3rd, 4th …) — recomputed from a number slot at render time (pure, no random).
     Mirrors _ord() in questions.js; hi/mr packs will supply their own ordinal forms. */
  function ord(n) { var e = ['th', 'st', 'nd', 'rd'], vv = n % 100; return n + (e[(vv - 20) % 10] || e[vv] || e[0]); }

  /* Index-aligned word pools for trigonometry — the builder stores only an INDEX (slots.stIdx / slots.idx) so
     hi/mr packs can translate the noun / identity description while EN keeps these exact strings (math symbols in
     the identity pairs are DNT and stay Latin in every language). */
  var TRIG_STRUCT = ['tower', 'pole', 'building', 'tree', 'flagpole', 'lighthouse', 'chimney'];
  var TRIG_IDENT = [['sin²θ + cos²θ', 'the Pythagorean identity sin²θ + cos²θ = 1'], ['sec²θ − tan²θ', 'the identity sec²θ − tan²θ = 1'], ['cosec²θ − cot²θ', 'the identity cosec²θ − cot²θ = 1']];
  /* Probability colour pools (index-aligned across languages) — bag draw has 4 pairs, complement has 3. */
  var PROB_COL = [['red', 'blue'], ['green', 'yellow'], ['black', 'white'], ['red', 'green']];
  var PROB_COLC = [['red', 'blue'], ['green', 'yellow'], ['black', 'white']];
  /* Set-theory context pairs (index-aligned) — the two liked-things per Venn problem; hi/mr translate the nouns. */
  var SET_CTX = [['tea', 'coffee'], ['football', 'cricket'], ['Maths', 'Science'], ['Hindi', 'English'], ['apples', 'oranges'], ['chess', 'carrom'], ['Physics', 'Chemistry'], ['badminton', 'tennis'], ['History', 'Geography'], ['painting', 'music'], ['guitar', 'piano'], ['dogs', 'cats'], ['cricket', 'hockey'], ['pizza', 'burgers']];
  /* Ratio percent-descriptor pool — flat (easy 0..5, then hard 6..13), index-aligned with _RAT_PCT_FLAT in
     questions.js. Only the descriptor ('25% more') translates; the ratio answer is neutral and rides a slot. */
  var RAT_PCT_POOL = [['25% more', '5:4'], ['20% less', '4:5'], ['50% more', '3:2'], ['20% more', '6:5'], ['25% less', '3:4'], ['10% less', '9:10'], ['12.5% more', '9:8'], ['16.66% less', '5:6'], ['37.5% more', '11:8'], ['11.11% less', '8:9'], ['66.66% more', '5:3'], ['150% more', '5:2'], ['40% more', '7:5'], ['75% more', '7:4']];
  /* Mixture item pool (index-aligned) — the commodity being mixed; ₹/kg and the ratio/price answers stay neutral. */
  var MIX_ITEMS = ['rice', 'wheat', 'sugar', 'tea', 'coffee', 'pulses', 'flour', 'salt'];

  var pack = { pools: {}, tpl: {
    /* ── Squares & roots ── */
    'squares:easy:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return 'Square of ' + s.n + ' = ?'; }, function (s) { return s.n + ' squared = ?'; }],
      e: [function (s) { return s.n + '² = ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n) + '.'; }]
    },
    'squares:medium:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return 'Square of ' + s.n + ' = ?'; }],
      e: [function (s) { return s.id; }]   // _sqIdentity(n): pure math notation, language-neutral (precomputed slot)
    },
    'squares:medium:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return 'Square root of ' + s.sq + ' = ?'; }, function (s) { return 'If x² = ' + s.sq + ', x = ?'; }],
      e: [function (s) { return 'Find x with x² = ' + s.sq + '. Since ' + s.n + '² = ' + s.sq + ', √' + s.sq + ' = ' + s.n + '.'; }]
    },
    'squares:hard:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return 'If x² = ' + s.sq + ', x = ?'; }],
      e: [function (s) { return s.n + '² = ' + s.sq + ', so √' + s.sq + ' = ' + s.n + '. It sits just above ' + s.b + '² = ' + s.bsq + '.'; }]
    },
    'squares:hard:diffSquares': {
      s: [function (s) { return s.a + '² − ' + s.b + '² = ?'; }],
      e: [function (s) { return 'a² − b² = (a+b)(a−b) = (' + s.sum + ')(' + s.diff + ') = ' + s.ans + '. Factor instead of squaring both — far faster.'; }]
    },

    /* ── Cubes & cube-roots ── (slots carry base numbers; templates recompute derived math, all language-neutral) */
    'cubes:easy:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return 'Cube of ' + s.n + ' = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + ' × ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return 'Cube of ' + s.n + ' = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + '² × ' + s.n + ' = ' + (s.n * s.n) + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return 'Cube root of ' + (s.n * s.n * s.n) + ' = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return s.n + '³ = ' + c + ', so ∛' + c + ' = ' + s.n + '. Tip: the unit digit ' + (c % 10) + ' of the cube fixes the unit digit of the root.'; }]
    },
    'cubes:hard:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return 'Cube root of ' + (s.n * s.n * s.n) + ' = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return '∛' + c + ' = ' + s.n + '. Unit digit ' + (c % 10) + ' → the root ends in ' + (s.n % 10) + '; the leading part places it near ' + s.n + '.'; }]
    },
    'cubes:hard:cubeRoot5': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return 'Find the cube root of ' + (s.n * s.n * s.n) + '.'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return 'Split ' + c + ': the last digit ' + (c % 10) + ' fixes the root’s unit digit as ' + (s.n % 10) + '; the thousands part ' + Math.floor(c / 1000) + ' sits between ' + Math.floor(s.n / 10) + '³ and ' + (Math.floor(s.n / 10) + 1) + '³, so the tens digit is ' + Math.floor(s.n / 10) + '. Root = ' + s.n + '.'; }]
    },
    'cubes:hard:diffCubes': {
      s: [function (s) { return s.a + '³ − ' + s.b + '³ = ?'; }],
      e: [function (s) { return s.a + '³ = ' + (s.a * s.a * s.a) + ' and ' + s.b + '³ = ' + (s.b * s.b * s.b) + ', so the difference = ' + (s.a * s.a * s.a - s.b * s.b * s.b) + '. (Identity: a³ − b³ = (a − b)(a² + ab + b²).)'; }]
    },

    /* ── Fractions ── (frac/pct strings are language-neutral math tokens carried in slots) */
    'fractions:*:fracToPct': {
      s: [function (s) { return s.frac + ' expressed as a percentage = ? %'; }, function (s) { return 'Convert ' + s.frac + ' to a percentage.'; }, function (s) { return s.frac + ' = ? %'; }, function (s) { return 'What is ' + s.frac + ' as a percentage?'; }],
      e: [function (s) { return s.frac + ' = ' + s.pct + '% (divide and ×100; memorising the common ones saves seconds).'; }]
    },
    'fractions:*:pctToFrac': {
      s: [function (s) { return s.pct + '% as a fraction = ?'; }, function (s) { return 'Express ' + s.pct + '% as a fraction.'; }, function (s) { return s.pct + '% = ? (in lowest terms)'; }],
      e: [function (s) { return s.pct + '% = ' + s.pct + '/100 = ' + s.frac + ' in lowest terms.'; }]
    },
    'fractions:hard:fracOfFrac': {
      s: [function (s) { return s.a1 + '/' + s.b1 + ' of ' + s.a2 + '/' + s.b2 + ' of ' + s.N + ' = ?'; }, function (s) { return 'Find ' + s.a1 + '/' + s.b1 + ' of ' + s.a2 + '/' + s.b2 + ' of ' + s.N + '.'; }],
      e: [function (s) { return '“Of” means multiply: ' + s.a1 + '/' + s.b1 + ' × ' + s.a2 + '/' + s.b2 + ' × ' + s.N + '. Cancel before multiplying: the answer is ' + s.r + '.'; }]
    },
    'fractions:hard:addFrac': {
      s: [function (s) { return s.a1 + '/' + s.b1 + ' + ' + s.a2 + '/' + s.b2 + ' = ? (in lowest terms)'; }, function (s) { return 'Add ' + s.a1 + '/' + s.b1 + ' and ' + s.a2 + '/' + s.b2 + '. Give the answer in lowest terms.'; }],
      e: [function (s) { return 'Common denominator ' + s.cd + ': ' + s.l + '/' + s.cd + ' + ' + s.r2 + '/' + s.cd + ' = ' + s.snum0 + '/' + s.cd + ' = ' + s.num + '/' + s.den + ' after reducing by ' + s.g + '.'; }]
    },

    /* ── Mental multiplication ── (single stem per archetype; explanation derives products from slot numbers) */
    'multiplication:*:multiply': { s: [function (s) { return s.x + ' × ' + s.y + ' = ?'; }], e: [function (s) { return s.x + ' × ' + s.y + ' = ' + (s.x * s.y) + '. Split the second number: ' + s.x + ' × ' + s.tens + ' + ' + s.x + ' × ' + s.un + ' = ' + (s.x * s.tens) + ' + ' + (s.x * s.un) + '.'; }] },
    'multiplication:*:divide': { s: [function (s) { return s.p + ' ÷ ' + s.x + ' = ?'; }], e: [function (s) { return s.p + ' ÷ ' + s.x + ' = ' + s.y + ', since ' + s.x + ' × ' + s.y + ' = ' + s.p + '. Division undoes the product.'; }] },
    'multiplication:*:threeFactor': { s: [function (s) { return s.a + ' × ' + s.b + ' × ' + s.c + ' = ?'; }], e: [function (s) { return 'Left to right: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', then × ' + s.c + ' = ' + (s.a * s.b * s.c) + '. Regroup to make a round number when possible.'; }] },
    'multiplication:medium:mentalSquare': { s: [function (s) { return s.n + ' × ' + s.n + ' = ?'; }], e: [function (s) { return s.n + '² = (' + s.r + (s.d < 0 ? '' : '+') + s.d + ')² = ' + (s.n * s.n) + ' — a fast mental square.'; }] },

    /* ── Simplification / BODMAS ── (pure arithmetic expressions; explanation frames the operator order) */
    'simplification:*:multiplyAdd': { s: [function (s) { return s.a + ' × ' + s.b + ' + ' + s.c + ' = ?'; }], e: [function (s) { return 'BODMAS — multiply first: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', then + ' + s.c + ' = ' + (s.a * s.b + s.c) + '.'; }] },
    'simplification:medium:divideAdd': { s: [function (s) { return s.num + ' ÷ ' + s.dv + ' + ' + s.add + ' = ?'; }], e: [function (s) { return 'Divide first: ' + s.num + ' ÷ ' + s.dv + ' = ' + (s.num / s.dv) + ', then + ' + s.add + ' = ' + (s.num / s.dv + s.add) + '.'; }] },
    'simplification:hard:fullBodmas': { s: [function (s) { return '(' + s.p + ' × ' + s.q + ') ÷ ' + s.r + ' + ' + s.ss + ' × ' + s.t + ' = ?'; }], e: [function (s) { return 'Brackets → (' + s.p + ' × ' + s.q + ') = ' + (s.p * s.q) + '; ÷ ' + s.r + ' = ' + ((s.p * s.q) / s.r) + '; and ' + s.ss + ' × ' + s.t + ' = ' + (s.ss * s.t) + '; sum = ' + ((s.p * s.q) / s.r + s.ss * s.t) + '.'; }] },

    /* ── Area ── (cm/m units live in the wording; numbers are slots; formulae recompute from slots, language-neutral) */
    'area:easy:square': {
      s: [function (s) { return 'The area of a square of side ' + s.s + ' cm = ? cm².'; }, function (s) { return 'A square tile has a side of ' + s.s + ' cm. Find its area (in cm²).'; }, function (s) { return 'Each side of a square field measures ' + s.s + ' m. Its area = ? m².'; }],
      e: [function (s) { return 'Area of a square = side² = ' + s.s + '² = ' + (s.s * s.s) + '.'; }]
    },
    'area:*:rectangle': {
      s: [function (s) { return 'A rectangle is ' + s.l + ' cm long and ' + s.b + ' cm wide. Its area = ? cm².'; }, function (s) { return 'A rectangular plot measures ' + s.l + ' m by ' + s.b + ' m. Find its area (in m²).'; }, function (s) { return 'A hall is ' + s.l + ' m long and ' + s.b + ' m broad. The area of its floor = ? m².'; }],
      e: [function (s) { return 'Area = length × breadth = ' + s.l + ' × ' + s.b + ' = ' + (s.l * s.b) + '.'; }]
    },
    'area:*:triangle': {
      s: [function (s) { return 'A triangle has base ' + s.base + ' cm and height ' + s.h + ' cm. Its area = ? cm².'; }, function (s) { return 'Find the area of a triangle whose base is ' + s.base + ' cm and height is ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'Area = ½ × base × height = ½ × ' + s.base + ' × ' + s.h + ' = ' + (s.base * s.h / 2) + ' cm². Halve the even side first to avoid fractions.'; }]
    },
    'area:medium:parallelogram': {
      s: [function (s) { return 'A parallelogram has base ' + s.b + ' cm and height ' + s.h + ' cm. Its area = ? cm².'; }, function (s) { return 'Find the area of a parallelogram with base ' + s.b + ' cm and perpendicular height ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'Area = base × height = ' + s.b + ' × ' + s.h + ' = ' + (s.b * s.h) + ' cm². Use the perpendicular height, not the slant side.'; }]
    },
    'area:*:circle': {
      s: [function (s) { return 'The area of a circle of radius ' + s.r + ' cm = ? cm². (use π = 3.14)'; }, function (s) { return 'A circular garden has a radius of ' + s.r + ' m. Find its area in m² (take π = 3.14).'; }],
      e: [function (s) { return 'Area = πr² = 3.14 × ' + s.r + '² = 3.14 × ' + (s.r * s.r) + ' = ' + s.ans + '.'; }]
    },
    'area:hard:trapezium': {
      s: [function (s) { return 'A trapezium has parallel sides ' + s.a1 + ' cm and ' + s.b1 + ' cm, and height ' + s.h + ' cm. Its area = ? cm².'; }, function (s) { return 'The parallel sides of a trapezium measure ' + s.a1 + ' cm and ' + s.b1 + ' cm, and the distance between them is ' + s.h + ' cm. Find its area (in cm²).'; }],
      e: [function (s) { return 'Area = ½ × (sum of parallel sides) × height = ½ × ' + (s.a1 + s.b1) + ' × ' + s.h + ' = ' + ((s.a1 + s.b1) * s.h / 2) + ' cm².'; }]
    },
    'area:hard:border': {
      s: [function (s) { return 'A ' + s.L + ' cm × ' + s.B + ' cm sheet has a uniform border of width ' + s.w + ' cm. The area of the border = ? cm².'; }, function (s) { return 'A photo frame ' + s.L + ' cm by ' + s.B + ' cm has a uniform border ' + s.w + ' cm wide along its edge. Find the area of the border (in cm²).'; }],
      e: [function (s) { return 'Border = outer − inner = ' + s.L + '×' + s.B + ' − ' + (s.L - 2 * s.w) + '×' + (s.B - 2 * s.w) + ' = ' + (s.L * s.B) + ' − ' + ((s.L - 2 * s.w) * (s.B - 2 * s.w)) + ' = ' + (s.L * s.B - (s.L - 2 * s.w) * (s.B - 2 * s.w)) + ' cm².'; }]
    },

    /* ── Volume ── (π = 3.14; the rounded answer is precomputed into slot `ans` so render stays pure) */
    'volume:easy:cube': {
      s: [function (s) { return 'The volume of a cube of side ' + s.s + ' cm = ? cm³.'; }, function (s) { return 'A cubical box has an edge of ' + s.s + ' cm. Find its volume (in cm³).'; }, function (s) { return 'Each edge of a cube measures ' + s.s + ' cm. Its volume = ? cm³.'; }],
      e: [function (s) { return 'Volume of a cube = side³ = ' + s.s + '³ = ' + (s.s * s.s * s.s) + ' cm³.'; }]
    },
    'volume:*:cuboid': {
      s: [function (s) { return 'A cuboid measures ' + s.l + ' cm × ' + s.b + ' cm × ' + s.h + ' cm. Its volume = ? cm³.'; }, function (s) { return 'A carton is ' + s.l + ' cm long, ' + s.b + ' cm wide and ' + s.h + ' cm high. Find its volume (in cm³).'; }, function (s) { return 'A water tank measures ' + s.l + ' m by ' + s.b + ' m by ' + s.h + ' m. Its capacity = ? m³.'; }],
      e: [function (s) { return 'Volume = l × b × h = ' + s.l + ' × ' + s.b + ' × ' + s.h + ' = ' + (s.l * s.b * s.h) + '.'; }]
    },
    'volume:*:cylinder': {
      s: [function (s) { return 'A cylinder has radius ' + s.r + ' cm and height ' + s.h + ' cm. Its volume = ? cm³. (use π = 3.14)'; }, function (s) { return 'A cylindrical drum has a base radius of ' + s.r + ' cm and stands ' + s.h + ' cm tall. Find its volume in cm³ (take π = 3.14).'; }],
      e: [function (s) { return 'Volume = πr²h = 3.14 × ' + s.r + '² × ' + s.h + ' = 3.14 × ' + (s.r * s.r * s.h) + ' = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:sphere': {
      s: [function (s) { return 'A sphere has radius ' + s.r + ' cm. Its volume = ? cm³. (use π = 3.14)'; }, function (s) { return 'Find the volume of a solid sphere of radius ' + s.r + ' cm, taking π = 3.14 (in cm³).'; }],
      e: [function (s) { return 'Volume = (4/3)πr³ = (4/3) × 3.14 × ' + s.r + '³ = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:cone': {
      s: [function (s) { return 'A cone has radius ' + s.r + ' cm and height ' + s.h + ' cm. Its volume = ? cm³. (use π = 3.14)'; }, function (s) { return 'An ice-cream cone has a base radius of ' + s.r + ' cm and a height of ' + s.h + ' cm. Find its volume in cm³ (π = 3.14).'; }],
      e: [function (s) { return 'Volume = (1/3)πr²h = (1/3) × 3.14 × ' + (s.r * s.r) + ' × ' + s.h + ' = ' + s.ans + ' cm³.'; }]
    },

    /* ── Surface area ── (π = 3.14; rounded answers precomputed into slot `ans`) */
    'surface-area:easy:cubeTSA': {
      s: [function (s) { return 'Find the total surface area of a cube of side ' + s.a + ' cm (in cm²).'; }, function (s) { return 'A cubical box has an edge of ' + s.a + ' cm. The total area to be painted, covering all its faces, = ? cm²'; }],
      e: [function (s) { return 'TSA of a cube = 6a² = 6 × ' + s.a + '² = 6 × ' + (s.a * s.a) + ' = ' + (6 * s.a * s.a) + ' cm².'; }]
    },
    'surface-area:medium:cubeLSA': {
      s: [function (s) { return 'Find the lateral (side) surface area of a cube of side ' + s.a + ' cm (in cm²).'; }],
      e: [function (s) { return 'LSA of a cube = 4a² (the four side faces) = 4 × ' + (s.a * s.a) + ' = ' + (4 * s.a * s.a) + ' cm².'; }]
    },
    'surface-area:*:cuboidTSA': {
      s: [function (s) { return 'Find the total surface area of a cuboid ' + s.l + ' × ' + s.b + ' × ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'TSA = 2(lb + bh + hl) = 2(' + (s.l * s.b) + ' + ' + (s.b * s.h) + ' + ' + (s.l * s.h) + ') = ' + (2 * (s.l * s.b + s.b * s.h + s.l * s.h)) + ' cm².'; }]
    },
    'surface-area:medium:cylCSA': {
      s: [function (s) { return 'Find the curved surface area of a cylinder of radius ' + s.r + ' cm and height ' + s.h + ' cm (use π = 3.14).'; }],
      e: [function (s) { return 'CSA = 2πrh = 2 × 3.14 × ' + s.r + ' × ' + s.h + ' = ' + s.ans + ' cm².'; }]
    },
    'surface-area:hard:cylTSA': {
      s: [function (s) { return 'Find the total surface area of a cylinder of radius ' + s.r + ' cm and height ' + s.h + ' cm (use π = 3.14).'; }],
      e: [function (s) { return 'TSA = 2πr(r + h) = 2 × 3.14 × ' + s.r + ' × (' + s.r + ' + ' + s.h + ') = ' + s.ans + ' cm².'; }]
    },
    'surface-area:hard:sphereSA': {
      s: [function (s) { return 'Find the surface area of a sphere of radius ' + s.r + ' cm (use π = 3.14).'; }, function (s) { return 'A spherical ball has a radius of ' + s.r + ' cm. Its surface area, taking π = 3.14, = ? cm²'; }],
      e: [function (s) { return 'Surface area = 4πr² = 4 × 3.14 × ' + s.r + '² = ' + s.ans + ' cm².'; }]
    },

    /* ── Percentages ── (% and the arithmetic stay verbatim; number slots let hi/mr translate the framing words) */
    'percentages:*:directOf': {
      s: [function (s) { return s.p + '% of ' + s.b + ' = ?'; }, function (s) { return 'Find ' + s.p + '% of ' + s.b + '.'; }, function (s) { return s.p + '% of ' + s.b + ' is what number?'; }],
      e: [function (s) { return s.p + '% of ' + s.b + ' = ' + s.p + ' × ' + s.b + ' ÷ 100 = ' + s.r + '. Tip: ' + s.p + '% of ' + s.b + ' = ' + s.b + '% of ' + s.p + ' — swap when one side is rounder.'; }]
    },
    'percentages:medium:reverse': {
      s: [function (s) { return s.p + '% of what number is ' + s.r + '?'; }],
      e: [function (s) { return 'If ' + s.p + '% of N = ' + s.r + ', then N = ' + s.r + ' × 100 ÷ ' + s.p + ' = ' + s.b + '.'; }]
    },
    'percentages:medium:whatPct': {
      s: [function (s) { return 'What percent of ' + s.b + ' is ' + s.y + '?'; }],
      e: [function (s) { return s.y + ' out of ' + s.b + ' = (' + s.y + ' ÷ ' + s.b + ') × 100 = ' + s.p + '%.'; }]
    },
    'percentages:hard:pctChange': {
      s: [function (s) { return 'A value rises from ' + s.old + ' to ' + s.nw + '. The percent increase = ? %'; }],
      e: [function (s) { return '% increase = (new − old)/OLD × 100 = (' + s.nw + ' − ' + s.old + ')/' + s.old + ' × 100 = ' + ((s.nw - s.old) * 100 / s.old) + '%. Always divide by the ORIGINAL value.'; }]
    },
    'percentages:hard:successive': {
      s: [function (s) { return 'A ₹' + s.base + ' item is given successive discounts of ' + s.d1 + '% and ' + s.d2 + '%. Final price = ₹?'; }],
      e: [function (s) { return 'Apply in sequence: ' + s.base + ' × ' + (1 - s.d1 / 100) + ' × ' + (1 - s.d2 / 100) + ' = ' + s.f + '. Single equivalent = ' + s.d1 + '+' + s.d2 + '−(' + s.d1 + '×' + s.d2 + ')/100 = ' + (s.d1 + s.d2 - s.d1 * s.d2 / 100) + '%.'; }]
    },
    'percentages:hard:netTrap': {
      s: [function (s) { return 'A salary is increased by ' + s.x + '% and then decreased by ' + s.x + '%. It falls by ? % overall.'; }],
      e: [function (s) { return 'Equal +' + s.x + '% then −' + s.x + '% never cancels — the net fall = x²/100 = ' + s.x + '²/100 = ' + (s.x * s.x / 100) + '%. It compounds, it does not add.'; }]
    },

    /* ── Averages ── (number lists live in slots as arrays; sums recompute from the array, language-neutral) */
    'averages:*:mean': {
      s: [function (s) { return 'The average of ' + s.nums.join(', ') + ' = ?'; }, function (s) { return 'Find the mean of ' + s.nums.join(', ') + '.'; }, function (s) { return 'What is the average of ' + s.nums.join(', ') + '?'; }],
      e: [function (s) { return 'Average = sum ÷ count = ' + s.nums.reduce(function (x, y) { return x + y; }, 0) + ' ÷ ' + s.count + ' = ' + s.avg + '.'; }]
    },
    'averages:medium:missing': {
      s: [function (s) { return 'The average of ' + s.known.join(', ') + ' and x is ' + s.avg + '. x = ?'; }],
      e: [function (s) { return 'Total needed = average × count = ' + s.avg + ' × ' + s.count + ' = ' + (s.avg * s.count) + '. x = ' + (s.avg * s.count) + ' − ' + s.sum + ' = ' + s.x + '.'; }]
    },
    'averages:hard:weighted': {
      s: [function (s) { return 'The average weight of ' + s.m + ' boys is ' + s.a + ' kg and of ' + s.n + ' girls is ' + s.b + ' kg. The average weight of the whole group = ? kg'; }],
      e: [function (s) { return 'Weighted mean = (total of both groups) ÷ (total count) = (' + s.m + '×' + s.a + ' + ' + s.n + '×' + s.b + ') ÷ (' + s.m + '+' + s.n + ') = ' + (s.m * s.a + s.n * s.b) + ' ÷ ' + (s.m + s.n) + ' = ' + s.ov + '.'; }]
    },
    'averages:hard:newMember': {
      s: [function (s) { return 'The average of ' + s.n + ' numbers is ' + s.A + '. When one more number is added the average becomes ' + s.B + '. The new number = ?'; }],
      e: [function (s) { return 'New number = new total − old total = ' + s.B + '×' + (s.n + 1) + ' − ' + s.A + '×' + s.n + ' = ' + (s.B * (s.n + 1)) + ' − ' + (s.A * s.n) + ' = ' + s.x + '.'; }]
    },

    /* ── Profit & loss ── (₹ verbatim; CP/SP/percent arithmetic recomputes from slots) */
    'profit-loss:*:spProfit': {
      s: [function (s) { return 'The cost price is ₹' + s.cp + ' and the profit is ' + s.pr + '%. The selling price = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 + profit%) = ' + s.cp + ' × ' + (1 + s.pr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:*:spLoss': {
      s: [function (s) { return 'The cost price is ₹' + s.cp + ' and the loss is ' + s.lr + '%. The selling price = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 − loss%) = ' + s.cp + ' × ' + (1 - s.lr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:*:profitPct': {
      s: [function (s) { return 'An article bought for ₹' + s.cp + ' is sold for ₹' + s.sp + '. The profit percent = ?'; }],
      e: [function (s) { return 'Profit% = (SP − CP)/CP × 100 = (' + s.sp + ' − ' + s.cp + ')/' + s.cp + ' × 100 = ' + s.pr + '%. The base is always the cost price.'; }]
    },
    'profit-loss:hard:findCP': {
      s: [function (s) { return 'By selling an article for ₹' + s.sp + ', a shopkeeper gains ' + s.pr + '%. The cost price = ₹?'; }],
      e: [function (s) { return 'CP = SP ÷ (1 + profit%) = ' + s.sp + ' ÷ ' + (1 + s.pr / 100) + ' = ₹' + s.cp + '.'; }]
    },
    'profit-loss:hard:successive': {
      s: [function (s) { return 'An article costing ₹' + s.cp + ' is sold at a ' + s.p0 + '% profit, and that price is then raised by a further ' + s.p1 + '%. The final selling price = ₹?'; }],
      e: [function (s) { return 'Chain the multipliers: ' + s.cp + ' × ' + (1 + s.p0 / 100) + ' × ' + (1 + s.p1 / 100) + ' = ₹' + s.sp + '.'; }]
    },

    /* ── Simple interest ── (₹/% verbatim; person names ride slot `nm` as trilingual entries → .en/.hi/.mr) */
    'simple-interest:*:si': {
      s: [function (s) { return 'Find the simple interest on ₹' + s.P + ' at ' + s.R + '% per annum for ' + s.T + ' years.'; }, function (s) { return s.nm.en + ' deposits ₹' + s.P + ' in a scheme paying ' + s.R + '% simple interest per annum. The interest earned in ' + s.T + ' years = ₹?'; }, function (s) { return 'What simple interest does ₹' + s.P + ' earn at ' + s.R + '% per annum over ' + s.T + ' years?'; }],
      e: [function (s) { return 'SI = P × R × T ÷ 100 = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '.'; }]
    },
    'simple-interest:*:amount': {
      s: [function (s) { return 'A sum of ₹' + s.P + ' is lent at ' + s.R + '% simple interest per annum. The amount after ' + s.T + ' years = ₹?'; }, function (s) { return s.nm.en + ' borrows ₹' + s.P + ' at ' + s.R + '% per annum simple interest. How much must be repaid after ' + s.T + ' years (in ₹)?'; }],
      e: [function (s) { return 'SI = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '; Amount = P + SI = ' + s.P + ' + ' + s.si + ' = ₹' + (s.P + s.si) + '.'; }]
    },
    'simple-interest:*:findRate': {
      s: [function (s) { return 'At what rate percent per annum does ₹' + s.P + ' yield ₹' + s.si + ' as simple interest in ' + s.T + ' years?'; }, function (s) { return 'A sum of ₹' + s.P + ' earns ₹' + s.si + ' as simple interest in ' + s.T + ' years. The annual rate = ? %'; }],
      e: [function (s) { return 'R = SI × 100 ÷ (P × T) = ' + s.si + ' × 100 ÷ (' + s.P + ' × ' + s.T + ') = ' + s.R + '%.'; }]
    },
    'simple-interest:hard:findPrincipal': {
      s: [function (s) { return 'A sum earns ₹' + s.si + ' as simple interest at ' + s.R + '% per annum in ' + s.T + ' years. Find the sum.'; }, function (s) { return 'What principal yields ₹' + s.si + ' as simple interest at ' + s.R + '% per annum in ' + s.T + ' years?'; }],
      e: [function (s) { return 'P = SI × 100 ÷ (R × T) = ' + s.si + ' × 100 ÷ (' + s.R + ' × ' + s.T + ') = ₹' + s.P + '.'; }]
    },

    /* ── Compound interest ── (superscript exponent picks ² or ³ from T; ₹/% verbatim) */
    'compound-interest:*:amount': {
      s: [function (s) { return 'Find the amount on ₹' + s.P + ' at ' + s.R + '% per annum compounded annually for ' + s.T + ' years.'; }, function (s) { return s.nm.en + ' invests ₹' + s.P + ' at ' + s.R + '% per annum, compounded annually. The amount after ' + s.T + ' years = ₹?'; }],
      e: [function (s) { return 'A = P(1 + R/100)ᵀ = ' + s.P + ' × ' + (1 + s.R / 100) + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '.'; }]
    },
    'compound-interest:*:ci': {
      s: [function (s) { return 'Find the compound interest on ₹' + s.P + ' at ' + s.R + '% per annum for ' + s.T + ' years, compounded annually.'; }, function (s) { return 'A loan of ₹' + s.P + ' is taken at ' + s.R + '% per annum, compounded annually. The compound interest payable after ' + s.T + ' years = ₹?'; }],
      e: [function (s) { return 'A = ' + s.P + '(1 + ' + s.R + '/100)' + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '; CI = A − P = ' + s.A + ' − ' + s.P + ' = ₹' + (s.A - s.P) + '.'; }]
    },
    'compound-interest:hard:ciSiDiff': {
      s: [function (s) { return 'The difference between the compound interest and the simple interest on ₹' + s.P + ' at ' + s.R + '% per annum for 2 years = ₹?'; }],
      e: [function (s) { return 'For 2 years, CI − SI = P(R/100)² = ' + s.P + ' × (' + s.R + '/100)² = ₹' + s.d + '.'; }]
    },

    /* ── Time, speed & distance ── (km/h, m/s, km, hours verbatim; unitConvert & trainCrossing carry a form encoded
       in the variant seed — see the builders — so each stem lines up with its own explanation) */
    'time-speed-distance:*:distance': {
      s: [function (s) { return 'A car travels at ' + s.sp + ' km/h for ' + s.t + ' hours. The distance covered = ? km'; }, function (s) { return 'Moving at ' + s.sp + ' km/h for ' + s.t + ' hours, a train covers ? km'; }, function (s) { return 'At a steady ' + s.sp + ' km/h for ' + s.t + ' hours, the distance = ? km'; }],
      e: [function (s) { return 'Distance = speed × time = ' + s.sp + ' × ' + s.t + ' = ' + (s.sp * s.t) + ' km.'; }]
    },
    'time-speed-distance:*:time': {
      s: [function (s) { return 'A car covers ' + s.d + ' km at ' + s.sp + ' km/h. The time taken = ? hours'; }, function (s) { return 'At ' + s.sp + ' km/h, the time to cover ' + s.d + ' km = ? hours'; }, function (s) { return 'Travelling ' + s.d + ' km at ' + s.sp + ' km/h takes ? hours'; }],
      e: [function (s) { return 'Time = distance ÷ speed = ' + s.d + ' ÷ ' + s.sp + ' = ' + s.t + ' hours.'; }]
    },
    'time-speed-distance:*:speed': {
      s: [function (s) { return 'A train covers ' + s.d + ' km in ' + s.t + ' hours. Its speed = ? km/h'; }, function (s) { return 'Covering ' + s.d + ' km in ' + s.t + ' hours, the speed = ? km/h'; }, function (s) { return 'A bus runs ' + s.d + ' km in ' + s.t + ' hours. Average speed = ? km/h'; }],
      e: [function (s) { return 'Speed = distance ÷ time = ' + s.d + ' ÷ ' + s.t + ' = ' + s.sp + ' km/h.'; }]
    },
    'time-speed-distance:medium:unitConvert': {
      s: [function (s) { return 'Express ' + s.x + ' km/h in metres per second.'; }, function (s) { return 'A train moves at ' + s.x + ' km/h. Its speed in m/s = ?'; }, function (s) { return 'Express ' + s.x + ' m/s in km/h.'; }, function (s) { return 'A sprinter runs at ' + s.x + ' m/s. That speed in km/h = ?'; }],
      e: [function (s) { return 'km/h → m/s: multiply by 5/18. ' + s.x + ' × 5/18 = ' + s.ans + ' m/s.'; }, function (s) { return 'km/h → m/s: multiply by 5/18. ' + s.x + ' × 5/18 = ' + s.ans + ' m/s.'; }, function (s) { return 'm/s → km/h: multiply by 18/5. ' + s.x + ' × 18/5 = ' + s.ans + ' km/h.'; }, function (s) { return 'm/s → km/h: multiply by 18/5. ' + s.x + ' × 18/5 = ' + s.ans + ' km/h.'; }]
    },
    'time-speed-distance:hard:avgSpeed': {
      s: [function (s) { return 'A person covers equal distances at ' + s.s1 + ' km/h and ' + s.s2 + ' km/h. The average speed for the whole journey = ? km/h'; }],
      e: [function (s) { return 'For equal distances, average speed = 2·s₁·s₂/(s₁+s₂) = 2×' + s.s1 + '×' + s.s2 + '/(' + s.s1 + '+' + s.s2 + ') = ' + s.ans + ' km/h — the harmonic mean, never the simple average.'; }]
    },
    'time-speed-distance:hard:relativeSpeed': {
      s: [function (s) { return 'Two trains start ' + s.d + ' km apart and travel towards each other at ' + s.s1 + ' km/h and ' + s.s2 + ' km/h. After how many hours do they meet?'; }, function (s) { return 'Two cars ' + s.d + ' km apart drive towards each other at ' + s.s1 + ' km/h and ' + s.s2 + ' km/h. They meet after ? hours'; }],
      e: [function (s) { return 'Moving towards each other, speeds ADD: closing speed = ' + s.s1 + ' + ' + s.s2 + ' = ' + (s.s1 + s.s2) + ' km/h. Time = ' + s.d + ' ÷ ' + (s.s1 + s.s2) + ' = ' + s.t + ' hours.'; }]
    },
    'time-speed-distance:hard:trainCrossing': {
      s: [function (s) { return 'A train ' + s.len + ' m long is running at ' + s.spd + ' km/h. How many seconds does it take to pass a pole?'; }, function (s) { return 'A train ' + s.len2 + ' m long, running at ' + s.spd + ' km/h, crosses a platform ' + s.plat + ' m long in ? seconds'; }],
      e: [function (s) { return 'Convert the speed: ' + s.spd + ' km/h = ' + s.ms + ' m/s. Passing a pole means covering its OWN length: ' + s.len + ' ÷ ' + s.ms + ' = ' + s.t + ' s.'; }, function (s) { return 'Speed = ' + s.spd + ' km/h = ' + s.ms + ' m/s. To clear a platform the train covers train + platform = ' + s.len2 + ' + ' + s.plat + ' = ' + (s.len2 + s.plat) + ' m. Time = ' + (s.len2 + s.plat) + ' ÷ ' + s.ms + ' = ' + s.t + ' s.'; }]
    },

    /* ── Time & work ── (days verbatim; the RATES idea is in the wording, numbers in slots) */
    'time-and-work:*:together': {
      s: [function (s) { return 'A can do a piece of work in ' + s.a + ' days and B in ' + s.b + ' days. Working together, they finish it in ? days'; }],
      e: [function (s) { return 'Together time = (a × b)/(a + b) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + (s.a * s.b) + '/' + (s.a + s.b) + ' = ' + ((s.a * s.b) / (s.a + s.b)) + ' days. Add the RATES (1/a + 1/b), never the days.'; }]
    },
    'time-and-work:*:workDone': {
      s: [function (s) { return 'A can finish a job in ' + s.days + ' days. In ' + s.wd + ' days he completes ? % of the work.'; }],
      e: [function (s) { return 'Fraction done = ' + s.wd + '/' + s.days + ', so ' + s.wd + '/' + s.days + ' × 100 = ' + (s.wd * 100 / s.days) + '%.'; }]
    },
    'time-and-work:*:workersScale': {
      s: [function (s) { return 'If ' + s.w1 + ' workers finish a task in ' + s.dp + ' days, then ' + s.w2 + ' workers finish the same task in ? days'; }],
      e: [function (s) { return 'Total work = ' + s.w1 + ' × ' + s.dp + ' = ' + s.tot + ' worker-days. Time for ' + s.w2 + ' workers = ' + s.tot + ' ÷ ' + s.w2 + ' = ' + (s.tot / s.w2) + ' days (workers and days are inversely proportional).'; }]
    },
    'time-and-work:hard:inverseTogether': {
      s: [function (s) { return s.nm[0].en + ' and ' + s.nm[1].en + ' together can finish a piece of work in ' + s.T + ' days. ' + s.nm[0].en + ' alone can do it in ' + s.a + ' days. In how many days can ' + s.nm[1].en + ' alone finish it?'; }],
      e: [function (s) { return 'Work with RATES: 1/' + s.nm[1].en + ' = 1/' + s.T + ' − 1/' + s.a + ' = (' + s.a + ' − ' + s.T + ')/(' + s.a + '×' + s.T + ') = ' + (s.a - s.T) + '/' + (s.a * s.T) + '. So ' + s.nm[1].en + ' alone = ' + (s.a * s.T) + '/' + (s.a - s.T) + ' = ' + s.b + ' days.'; }]
    },

    /* ── Number series ── (term lists ride slots as arrays; the pattern description is language-neutral math) */
    'number-series:*:arithmetic': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'A constant difference of ' + s.step + ' (arithmetic progression): ' + s.terms[s.terms.length - 1] + ' + ' + s.step + ' = ' + s.ans + '.'; }]
    },
    'number-series:*:geometric': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'Each term is × ' + s.r + ' (geometric progression): ' + s.terms[s.terms.length - 1] + ' × ' + s.r + ' = ' + s.ans + '.'; }]
    },
    'number-series:*:growingGap': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'The gaps grow by ' + s.base + ' each step (constant second difference): the next gap is ' + s.gap + ', so ' + s.terms[s.terms.length - 1] + ' + ' + s.gap + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:squaresSeries': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'Each term is a perfect square ' + (s.k >= 0 ? 'plus ' + s.k : 'minus ' + Math.abs(s.k)) + ': ' + s.terms.map(function (v, i) { return (s.s + i) + '²' + (s.k >= 0 ? '+' + s.k : '−' + Math.abs(s.k)); }).join(', ') + '. Next = ' + (s.s + 4) + '²' + (s.k >= 0 ? '+' + s.k : '−' + Math.abs(s.k)) + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:alternating': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'Two series are interleaved: the odd positions go ' + s.a0 + ', ' + (s.a0 + s.d1) + ', ' + (s.a0 + 2 * s.d1) + ', … (+' + s.d1 + ') and the even positions form their own chain. The next term continues the FIRST chain: ' + (s.a0 + 2 * s.d1) + ' + ' + s.d1 + ' = ' + s.ans + '.'; }]
    },

    /* ── Pipes & cisterns ── (hours verbatim; combined/net-rate arithmetic recomputes from slots) */
    'pipes-cisterns:*:together': {
      s: [function (s) { return 'Pipe A fills a tank in ' + s.a + ' hours and pipe B fills it in ' + s.b + ' hours. If both are opened together, the tank fills in ? hours'; }],
      e: [function (s) { return 'Combined time = (A × B)/(A + B) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + ((s.a * s.b) / (s.a + s.b)) + ' hours — add the rates 1/' + s.a + ' + 1/' + s.b + '.'; }]
    },
    'pipes-cisterns:*:netFill': {
      s: [function (s) { return 'An inlet pipe fills a tank in ' + s.a + ' hours while an outlet pipe empties it in ' + s.b + ' hours. If both are opened together, the tank fills in ? hours'; }],
      e: [function (s) { return 'Net rate = 1/' + s.a + ' − 1/' + s.b + '; time = (A × B)/(B − A) = (' + s.a + ' × ' + s.b + ')/(' + s.b + ' − ' + s.a + ') = ' + ((s.a * s.b) / (s.b - s.a)) + ' hours.'; }]
    },
    'pipes-cisterns:hard:inverseFill': {
      s: [function (s) { return 'Two pipes together fill a tank in ' + s.tog + ' hours. If the first pipe alone fills it in ' + s.a + ' hours, the second pipe alone fills it in ? hours'; }],
      e: [function (s) { return 'Rates subtract: 1/second = 1/' + s.tog + ' − 1/' + s.a + ' = ' + (s.a - s.tog) + '/' + (s.a * s.tog) + ', so the second pipe alone takes ' + s.b + ' hours.'; }]
    },
    'pipes-cisterns:hard:leakEmpty': {
      s: [function (s) { return 'Pipes A and B fill a tank in ' + s.a + ' and ' + s.b + ' hours respectively, while pipe C empties it in ' + s.c + ' hours. With all three open, the tank fills in ? hours'; }],
      e: [function (s) { return 'Net rate = 1/' + s.a + ' + 1/' + s.b + ' − 1/' + s.c + '. Over an LCM-sized tank that is ' + s.den + ' units/hour for ' + s.num + ' units, so the time = ' + (s.num / s.den) + ' hours.'; }]
    },

    /* ── Problems on ages ── (person names ride slot `nm` as trilingual entries; years verbatim) */
    'ages:*:ratioSum': {
      s: [function (s) { return 'The present ages of ' + s.nm[0].en + ' and ' + s.nm[1].en + ' are in the ratio ' + s.p0 + ' : ' + s.p1 + '. If the sum of their ages is ' + s.S + ' years, the present age of ' + s.nm[0].en + ' = ? years'; }],
      e: [function (s) { return 'Let the ages be ' + s.p0 + 'x and ' + s.p1 + 'x. Then (' + s.p0 + ' + ' + s.p1 + ')x = ' + s.S + ' → x = ' + s.k + '. ' + s.nm[0].en + ' = ' + s.p0 + 'x = ' + (s.p0 * s.k) + ' years.'; }]
    },
    'ages:easy:presentAge': {
      s: [function (s) { return '' + s.t + ' years ago, ' + s.nm.en + ' was ' + s.a + ' years old. ' + s.nm.en + '’s present age = ? years'; }],
      e: [function (s) { return 'Present age = age then + years elapsed = ' + s.a + ' + ' + s.t + ' = ' + (s.a + s.t) + ' years. (Going forward in time adds; “ago” means we add back.)'; }]
    },
    'ages:*:ageDiff': {
      s: [function (s) { return s.nm[0].en + ' is ' + s.x + ' years older than ' + s.nm[1].en + '. In ' + s.t + ' years, ' + s.nm[0].en + ' will be ' + s.mult + ' times as old as ' + s.nm[1].en + '. ' + s.nm[1].en + '’s present age = ? years'; }],
      e: [function (s) { return s.nm[0].en + ' = ' + s.nm[1].en + ' + ' + s.x + '. In ' + s.t + ' years: (' + s.nm[1].en + ' + ' + s.x + ' + ' + s.t + ') = ' + s.mult + '(' + s.nm[1].en + ' + ' + s.t + ') → ' + s.nm[1].en + ' = ' + s.B + ' years.'; }]
    },
    'ages:hard:fatherSon': {
      s: [function (s) { return 'A father is now ' + s.n + ' times as old as his son. In ' + s.t + ' years he will be ' + s.m + ' times as old as his son. The son’s present age = ? years'; }],
      e: [function (s) { return 'Let son = s, father = ' + s.n + 's. In ' + s.t + ' years: ' + s.n + 's + ' + s.t + ' = ' + s.m + '(s + ' + s.t + ') → s = ' + s.t + '(' + s.m + '−1)/(' + s.n + '−' + s.m + ') = ' + s.sn + ' years.'; }]
    },

    /* ── Partnership ── (person names ride slot `nm`; ₹ and the ratio answer are language-neutral) */
    'partnership:easy:shareRatio': {
      s: [function (s) { return s.nm[0].en + ' and ' + s.nm[1].en + ' invest ₹' + s.x + ' and ₹' + s.y + ' respectively in a business. In what ratio should the annual profit be divided between them?'; }],
      e: [function (s) { return 'Profit is always divided in the ratio of the capitals invested. ' + s.x + ' : ' + s.y + ', dividing both by their HCF ' + s.g + ', gives ' + (s.x / s.g) + ' : ' + (s.y / s.g) + '.'; }]
    },
    'partnership:*:share2': {
      s: [function (s) { return s.nm[0].en + ' and ' + s.nm[1].en + ' start a business investing ₹' + s.x + ' and ₹' + s.y + ' respectively. Out of a total profit of ₹' + s.profit + ', ' + s.nm[0].en + '’s share = ₹?'; }],
      e: [function (s) { return 'Profit is shared in the ratio of investments ' + s.x + ' : ' + s.y + '. ' + s.nm[0].en + '’s share = ' + s.x + '/(' + s.x + '+' + s.y + ') × ' + s.profit + ' = ₹' + s.share + '.'; }]
    },
    'partnership:*:shareTime': {
      s: [function (s) { return s.nm[0].en + ' invests ₹' + s.x + ' for ' + s.m + ' months and ' + s.nm[1].en + ' invests ₹' + s.y + ' for ' + s.n + ' months. Out of a profit of ₹' + s.profit + ', ' + s.nm[0].en + '’s share = ₹?'; }],
      e: [function (s) { return 'Weight each partner by capital × time: ' + s.nm[0].en + ' = ' + s.x + '×' + s.m + ' = ' + s.cx + ', ' + s.nm[1].en + ' = ' + s.y + '×' + s.n + ' = ' + s.cy + '. ' + s.nm[0].en + '’s share = ' + s.cx + '/(' + s.cx + '+' + s.cy + ') × ' + s.profit + ' = ₹' + s.share + '.'; }]
    },

    /* ── Number properties ── (HCF/LCM/unit-digit/factor-count; cycle & factor arrays ride slots, language-neutral) */
    'number-properties:*:hcf': {
      s: [function (s) { return 'Find the HCF (highest common factor) of ' + s.a + ' and ' + s.b + '.'; }],
      e: [function (s) { return 'HCF(' + s.a + ', ' + s.b + ') = ' + s.g + ' — the largest number that divides both (Euclidean method or common prime factors).'; }]
    },
    'number-properties:*:lcm': {
      s: [function (s) { return 'Find the LCM (least common multiple) of ' + s.a + ' and ' + s.b + '.'; }],
      e: [function (s) { return 'LCM = (a × b) ÷ HCF = (' + s.a + ' × ' + s.b + ') ÷ ' + s.g + ' = ' + s.l + '.'; }]
    },
    'number-properties:*:unitDigit': {
      s: [function (s) { return 'What is the unit (last) digit of ' + s.base + '^' + s.e + '?'; }],
      e: [function (s) { return 'The unit digit of powers of ' + s.base + ' repeats as [' + s.cyc.join(', ') + '] (cycle length ' + s.cyc.length + '). ' + s.e + ' mod ' + s.cyc.length + ' lands on ' + s.ud + '.'; }]
    },
    'number-properties:hard:numFactors': {
      s: [function (s) { return 'How many factors (divisors) does ' + s.N + ' have?'; }],
      e: [function (s) { return '' + s.N + ' = ' + s.parts.join(' × ') + '. Number of factors = product of (each exponent + 1) = ' + s.ex.map(function (e) { return '(' + e + '+1)'; }).join(' × ') + ' = ' + s.nf + '.'; }]
    },

    /* ── Linear equations ── (answer = a variable value; the algebra recomputes from slots) */
    'linear-equations:*:solveOne': {
      s: [function (s) { return s.a + 'x + ' + s.b + ' = ' + s.c + '.  Find x.'; }, function (s) { return 'Solve for x:  ' + s.a + 'x + ' + s.b + ' = ' + s.c; }, function (s) { return 'If ' + s.a + 'x + ' + s.b + ' = ' + s.c + ', then x = ?'; }],
      e: [function (s) { return 'Move the constant across: ' + s.a + 'x = ' + s.c + ' − ' + s.b + ' = ' + (s.c - s.b) + '. Then x = ' + (s.c - s.b) + ' ÷ ' + s.a + ' = ' + s.x + '.'; }]
    },
    'linear-equations:easy:solveOneSub': {
      s: [function (s) { return s.a + 'x − ' + s.b + ' = ' + s.c + '.  Find x.'; }, function (s) { return 'Solve for x:  ' + s.a + 'x − ' + s.b + ' = ' + s.c; }],
      e: [function (s) { return s.a + 'x = ' + s.c + ' + ' + s.b + ' = ' + (s.c + s.b) + ', so x = ' + (s.c + s.b) + ' ÷ ' + s.a + ' = ' + s.x + '.'; }]
    },
    'linear-equations:*:bracket': {
      s: [function (s) { return s.a + '(x + ' + s.b + ') = ' + s.c + '.  Find x.'; }, function (s) { return 'Solve:  ' + s.a + '(x + ' + s.b + ') = ' + s.c; }],
      e: [function (s) { return 'Divide both sides by ' + s.a + ' first: x + ' + s.b + ' = ' + (s.c / s.a) + '. So x = ' + (s.c / s.a) + ' − ' + s.b + ' = ' + s.x + '.'; }]
    },
    'linear-equations:*:sumDiff': {
      s: [function (s) { return 'If x + y = ' + s.S + ' and x − y = ' + s.D + ', find x.'; }],
      e: [function (s) { return 'Add the equations: 2x = ' + s.S + ' + ' + s.D + ' = ' + (s.S + s.D) + ', so x = ' + s.x + ' (and y = ' + s.y + ').'; }]
    },
    'linear-equations:hard:system2': {
      s: [function (s) { return 'Solve the system:  ' + s.a1 + 'x + ' + s.b1 + 'y = ' + s.c1 + '  and  ' + s.a2 + 'x + ' + s.b2 + 'y = ' + s.c2 + '.  Find x.'; }],
      e: [function (s) { return 'Eliminate y (or substitute) to get x = ' + s.x + ', y = ' + s.y + '. Check: ' + s.a1 + '·' + s.x + ' + ' + s.b1 + '·' + s.y + ' = ' + s.c1 + '. ✓'; }]
    },

    /* ── Quadratic equations ── (canonical x² − Bx + C = 0; Vieta relations recompute from slots) */
    'quadratic-equations:*:largerRoot': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  Find the larger root.'; }],
      e: [function (s) { return 'Factor into (x − ' + s.lo + ')(x − ' + s.hi + ') = 0 → roots ' + s.lo + ' and ' + s.hi + '. Larger = ' + s.hi + '.'; }]
    },
    'quadratic-equations:medium:smallerRoot': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  Find the smaller root.'; }],
      e: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = (x − ' + s.lo + ')(x − ' + s.hi + '). Roots ' + s.lo + ' and ' + s.hi + '; smaller = ' + s.lo + '.'; }]
    },
    'quadratic-equations:*:sumRoots': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  Find the sum of its roots.'; }],
      e: [function (s) { return 'For x² − Bx + C = 0, sum of roots = B = ' + s.B + ' (Vieta: sum = −b/a = ' + s.B + ').'; }]
    },
    'quadratic-equations:*:productRoots': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  Find the product of its roots.'; }],
      e: [function (s) { return 'By Vieta’s formulas, for x² − (sum)x + (product) = 0 the product of the roots equals the constant term. Here that constant is ' + s.C + ', so the product = ' + s.C + ' — no need to actually solve the equation. (Trap: the sum of the roots is the −(x-coefficient), a separate value.)'; }]
    },
    'quadratic-equations:hard:discriminant': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  Find the discriminant (b² − 4ac).'; }],
      e: [function (s) { return 'Δ = b² − 4ac = ' + s.B + '² − 4·1·' + s.C + ' = ' + (s.B * s.B) + ' − ' + (4 * s.C) + ' = ' + (s.B * s.B - 4 * s.C) + '.'; }]
    },
    'quadratic-equations:hard:rootRelation': {
      s: [function (s) { return 'The roots of x² − ' + s.B + 'x + c = 0 differ by ' + s.gap + '. Find c.'; }],
      e: [function (s) { return 'Sum = ' + s.B + ' and difference = ' + s.gap + ' give the roots (' + s.B + '±' + s.gap + ')/2 = ' + s.hi + ' and ' + s.lo + '. By Vieta, c = product = ' + s.hi + ' × ' + s.lo + ' = ' + (s.lo * s.hi) + '.'; }]
    },

    /* ── Surds & indices ── (^ notation and integer answers recompute from slots) */
    'surds-indices:*:powerEval': {
      s: [function (s) { return s.a + '^' + s.n + ' = ?'; }, function (s) { return 'Evaluate ' + s.a + '^' + s.n + '.'; }],
      e: [function (s) { return s.a + '^' + s.n + ' = ' + s.a + ' multiplied by itself ' + s.n + ' times = ' + s.val + '.'; }]
    },
    'surds-indices:*:solveExp': {
      s: [function (s) { return 'If ' + s.a + '^x = ' + s.N + ', find x.'; }],
      e: [function (s) { return '' + s.N + ' = ' + s.a + '^' + s.x + ' (since ' + s.a + ' to the power ' + s.x + ' is ' + s.N + '), so x = ' + s.x + '.'; }]
    },
    'surds-indices:*:fracExponent': {
      s: [function (s) { return s.b + '^(' + s.p + '/' + s.root + ') = ?'; }],
      e: [function (s) { return s.b + '^(' + s.p + '/' + s.root + ') = (' + s.b + '^(1/' + s.root + '))^' + s.p + ' = ' + s.rt + '^' + s.p + ' = ' + s.val + '.'; }]
    },
    'surds-indices:*:indexLaw': {
      s: [function (s) { return '(' + s.a + '^' + s.m + ') ÷ (' + s.a + '^' + s.n + ') = ' + s.a + '^? — give the exponent.'; }],
      e: [function (s) { return 'Quotient law of indices: dividing same-base powers subtracts the exponents, aᵐ ÷ aⁿ = aᵐ⁻ⁿ. So the exponent is ' + s.m + ' − ' + s.n + ' = ' + (s.m - s.n) + '. (Trap: the base ' + s.a + ' stays the same — you never divide the bases.)'; }]
    },

    /* ── Logarithms ── (ASCII "log to base b of N" wording; integer answers) */
    'logarithms:*:evalLog': {
      s: [function (s) { return 'log to base ' + s.b + ' of ' + s.N + ' = ?'; }, function (s) { return 'Evaluate log base ' + s.b + ' of ' + s.N + '.'; }],
      e: [function (s) { return 'logₐN asks “' + s.b + ' raised to what power gives ' + s.N + '?” Rewrite ' + s.N + ' as a power of ' + s.b + ': ' + s.b + '^' + s.k + ' = ' + s.N + ', so log base ' + s.b + ' of ' + s.N + ' = ' + s.k + '.' + (s.b === 10 ? ' (For base 10 — the common log — just count how many times you multiply by 10.)' : ''); }]
    },
    'logarithms:*:solveLog': {
      s: [function (s) { return 'If log to base ' + s.b + ' of x = ' + s.k + ', find x.'; }],
      e: [function (s) { return 'logₐx = k is the same statement as x = aᵏ (rewrite the log in exponential form). So x = ' + s.b + '^' + s.k + ' = ' + s.x + '.'; }]
    },
    'logarithms:*:logSum': {
      s: [function (s) { return '(log to base ' + s.b + ' of ' + s.x + ') + (log to base ' + s.b + ' of ' + s.y + ') = ?'; }],
      e: [function (s) { return 'Product rule: logₐx + logₐy = logₐ(xy). Since ' + s.b + '^' + s.i + ' = ' + s.x + ' and ' + s.b + '^' + s.j + ' = ' + s.y + ', the two logs are ' + s.i + ' and ' + s.j + ', so the sum = ' + s.i + ' + ' + s.j + ' = ' + (s.i + s.j) + '. (Shortcut: adding same-base logs just adds the exponents.)'; }]
    },
    'logarithms:*:logPower': {
      s: [function (s) { return 'log to base ' + s.b + ' of ' + s.x + '^' + s.k + ' = ?'; }],
      e: [function (s) { return 'Power rule: logₐ(xᵏ) = k·logₐx. Here log base ' + s.b + ' of ' + s.x + ' = ' + s.i + ' (because ' + s.b + '^' + s.i + ' = ' + s.x + '), so the answer = ' + s.k + ' × ' + s.i + ' = ' + (s.i * s.k) + '. (Trap: the exponent multiplies the log — it does not become a new base.)'; }]
    },

    /* ── Progressions ── (ordinal from a number slot via ord(); AP/GP formulae recompute from slots) */
    'progressions:*:apNth': {
      s: [function (s) { return 'An AP has first term ' + s.a + ' and common difference ' + s.d + '. Find its ' + ord(s.n) + ' term.'; }, function (s) { return 'An arithmetic progression starts at ' + s.a + ' and increases by ' + s.d + ' each term. What is its ' + ord(s.n) + ' term?'; }],
      e: [function (s) { return 'aₙ = a + (n − 1)d = ' + s.a + ' + (' + s.n + ' − 1)·' + s.d + ' = ' + s.a + ' + ' + ((s.n - 1) * s.d) + ' = ' + (s.a + (s.n - 1) * s.d) + '.'; }]
    },
    'progressions:*:apSum': {
      s: [function (s) { return 'An AP has first term ' + s.a + ' and common difference ' + s.d + '. Find the sum of its first ' + s.n + ' terms.'; }],
      e: [function (s) { return 'Sₙ = n/2 · [2a + (n − 1)d] = ' + s.n + '/2 · [' + (2 * s.a) + ' + ' + ((s.n - 1) * s.d) + '] = ' + (s.n / 2 * (2 * s.a + (s.n - 1) * s.d)) + '.'; }]
    },
    'progressions:*:gpNth': {
      s: [function (s) { return 'A GP has first term ' + s.a + ' and common ratio ' + s.r + '. Find its ' + ord(s.n) + ' term.'; }],
      e: [function (s) { return 'aₙ = a·rⁿ⁻¹ = ' + s.a + '·' + s.r + '^' + (s.n - 1) + ' = ' + s.a + '·' + Math.pow(s.r, s.n - 1) + ' = ' + (s.a * Math.pow(s.r, s.n - 1)) + '.'; }]
    },
    'progressions:hard:gpSum': {
      s: [function (s) { return 'A GP has first term ' + s.a + ' and common ratio ' + s.r + '. Find the sum of its first ' + s.n + ' terms.'; }],
      e: [function (s) { return 'For a GP with ratio r > 1 use Sₙ = a(rⁿ − 1)/(r − 1). Substitute a = ' + s.a + ', r = ' + s.r + ', n = ' + s.n + ': = ' + s.a + '(' + s.r + '^' + s.n + ' − 1)/(' + s.r + ' − 1) = ' + s.a + '·' + (Math.pow(s.r, s.n) - 1) + '/' + (s.r - 1) + ' = ' + (s.a * (Math.pow(s.r, s.n) - 1) / (s.r - 1)) + '. (Trap: don’t add terms one by one — the formula collapses the whole series; for r < 1 flip it to a(1 − rⁿ)/(1 − r).)'; }]
    },

    /* ── Inequalities & modulus ── (≤ ≥ < > verbatim; counts recompute from slots) */
    'inequalities-modulus:*:linIneqMin': {
      s: [function (s) { return 'Find the smallest integer x such that ' + s.a + 'x + ' + s.b + ' > ' + s.c + '.'; }],
      e: [function (s) { return s.a + 'x > ' + s.c + ' − ' + s.b + ' = ' + (s.c - s.b) + ', so x > ' + ((s.c - s.b) / s.a).toFixed(2).replace(/\.00$/, '') + '. The smallest integer greater than that is ' + (Math.floor((s.c - s.b) / s.a) + 1) + '.'; }]
    },
    'inequalities-modulus:*:countRange': {
      s: [function (s) { return 'How many integers x satisfy ' + s.a + ' ≤ x ≤ ' + s.b + '?'; }],
      e: [function (s) { return 'Counting integers in a closed range is inclusive of both ends: count = (upper − lower) + 1 = (' + s.b + ' − ' + s.a + ') + 1 = ' + (s.b - s.a + 1) + '. (The “+1” is the classic fencepost step — subtracting alone drops one endpoint and undercounts by 1.)'; }]
    },
    'inequalities-modulus:*:modLarger': {
      s: [function (s) { return 'If |x − ' + s.a + '| = ' + s.b + ', find the larger value of x.'; }],
      e: [function (s) { return '|x − ' + s.a + '| = ' + s.b + ' gives x = ' + s.a + ' + ' + s.b + ' = ' + (s.a + s.b) + ' or x = ' + s.a + ' − ' + s.b + ' = ' + (s.a - s.b) + '. The larger is ' + (s.a + s.b) + '.'; }]
    },
    'inequalities-modulus:hard:modIneqCount': {
      s: [function (s) { return 'How many integer values of x satisfy |x − ' + s.a + '| < ' + s.b + '?'; }],
      e: [function (s) { return '|x − ' + s.a + '| < ' + s.b + ' means ' + (s.a - s.b) + ' < x < ' + (s.a + s.b) + '. The integers strictly between span 2·' + s.b + ' − 1 = ' + (2 * s.b - 1) + ' values.'; }]
    },
    'inequalities-modulus:hard:modIneqCountLe': {
      s: [function (s) { return 'How many integer values of x satisfy |x − ' + s.a + '| ≤ ' + s.b + '?'; }],
      e: [function (s) { return '|x − ' + s.a + '| ≤ ' + s.b + ' means ' + (s.a - s.b) + ' ≤ x ≤ ' + (s.a + s.b) + ', inclusive = 2·' + s.b + ' + 1 = ' + (2 * s.b + 1) + ' integers.'; }]
    },

    /* ── Geometry basics ── (° verbatim; angle/Pythagoras/polygon formulae recompute from slots) */
    'geometry-basics:easy:complement': {
      s: [function (s) { return 'What is the complement of an angle of ' + s.a + '°?'; }, function (s) { return 'Two angles are complementary and one of them measures ' + s.a + '°. Find the other (in degrees).'; }],
      e: [function (s) { return 'Complementary angles sum to 90°, so the complement = 90° − ' + s.a + '° = ' + (90 - s.a) + '°.'; }]
    },
    'geometry-basics:easy:supplement': {
      s: [function (s) { return 'What is the supplement of an angle of ' + s.a + '°?'; }, function (s) { return 'Two angles lie on a straight line and one measures ' + s.a + '°. Find the other (in degrees).'; }],
      e: [function (s) { return 'Supplementary angles sum to 180°, so the supplement = 180° − ' + s.a + '° = ' + (180 - s.a) + '°.'; }]
    },
    'geometry-basics:*:triangleThird': {
      s: [function (s) { return 'Two angles of a triangle are ' + s.a + '° and ' + s.b + '°. Find the third angle.'; }, function (s) { return 'In a triangle, two of the angles measure ' + s.a + '° and ' + s.b + '°. The third angle = ?°'; }],
      e: [function (s) { return 'Angles of a triangle sum to 180°, so the third = 180° − ' + s.a + '° − ' + s.b + '° = ' + (180 - s.a - s.b) + '°.'; }]
    },
    'geometry-basics:medium:pythHyp': {
      s: [function (s) { return 'A right-angled triangle has legs ' + s.t0 + ' and ' + s.t1 + '. Find the hypotenuse.'; }, function (s) { return 'A ladder foot stands ' + s.t0 + ' m from a wall and reaches ' + s.t1 + ' m up it. How long is the ladder (in m)?'; }],
      e: [function (s) { return 'Hypotenuse = √(' + s.t0 + '² + ' + s.t1 + '²) = √(' + (s.t0 * s.t0) + ' + ' + (s.t1 * s.t1) + ') = √' + (s.t2 * s.t2) + ' = ' + s.t2 + '.'; }]
    },
    'geometry-basics:medium:isosceles': {
      s: [function (s) { return 'An isosceles triangle has a vertex (apex) angle of ' + s.v + '°. Find each base angle.'; }],
      e: [function (s) { return 'The two base angles are equal and the three sum to 180°: each = (180° − ' + s.v + '°)/2 = ' + ((180 - s.v) / 2) + '°.'; }]
    },
    'geometry-basics:hard:pythLeg': {
      s: [function (s) { return 'A right-angled triangle has hypotenuse ' + s.t2 + ' and one leg ' + s.t1 + '. Find the other leg.'; }],
      e: [function (s) { return 'Other leg = √(' + s.t2 + '² − ' + s.t1 + '²) = √(' + (s.t2 * s.t2) + ' − ' + (s.t1 * s.t1) + ') = √' + (s.t0 * s.t0) + ' = ' + s.t0 + '.'; }]
    },
    'geometry-basics:hard:polygonSum': {
      s: [function (s) { return 'Find the sum of the interior angles of a polygon with ' + s.n + ' sides.'; }, function (s) { return 'The interior angles of a ' + s.n + '-sided polygon add up to ?°'; }],
      e: [function (s) { return 'Sum of interior angles = (n − 2) × 180° = (' + s.n + ' − 2) × 180° = ' + ((s.n - 2) * 180) + '°.'; }]
    },
    'geometry-basics:hard:polygonEach': {
      s: [function (s) { return 'Find each interior angle of a regular polygon with ' + s.n + ' sides.'; }],
      e: [function (s) { return 'Each interior angle = (n − 2) × 180° / n = ' + ((s.n - 2) * 180) + '° / ' + s.n + ' = ' + ((s.n - 2) * 180 / s.n) + '°.'; }]
    },

    /* ── Coordinate geometry basics ── (coordinate pairs & formulae recompute from slots) */
    'coordinate-geometry-basics:*:distance': {
      s: [function (s) { return 'Find the distance between the points (' + s.x1 + ', ' + s.y1 + ') and (' + s.x2 + ', ' + s.y2 + ').'; }],
      e: [function (s) { return 'Distance = √[(Δx)² + (Δy)²] = √[' + s.t0 + '² + ' + s.t1 + '²] = √' + (s.t2 * s.t2) + ' = ' + s.t2 + '.'; }]
    },
    'coordinate-geometry-basics:*:midpointX': {
      s: [function (s) { return 'Find the x-coordinate of the midpoint of (' + s.x1 + ', ' + s.y1 + ') and (' + s.x2 + ', ' + s.y2 + ').'; }],
      e: [function (s) { return 'Midpoint x = (x₁ + x₂)/2 = (' + s.x1 + ' + ' + s.x2 + ')/2 = ' + ((s.x1 + s.x2) / 2) + '.'; }]
    },
    'coordinate-geometry-basics:*:slope': {
      s: [function (s) { return 'Find the slope of the line joining (' + s.x1 + ', ' + s.y1 + ') and (' + s.x2 + ', ' + s.y2 + ').'; }],
      e: [function (s) { return 'Slope = (y₂ − y₁)/(x₂ − x₁) = (' + (s.y2 - s.y1) + ')/(' + (s.x2 - s.x1) + ') = ' + ((s.y2 - s.y1) / (s.x2 - s.x1)) + '.'; }]
    },
    'coordinate-geometry-basics:hard:sectionX': {
      s: [function (s) { return 'Point P divides the line joining (' + s.x1 + ', ' + s.y1 + ') and (' + s.x2 + ', ' + s.y2 + ') internally in the ratio ' + s.m + ':' + s.n + '. Find the x-coordinate of P.'; }],
      e: [function (s) { return 'Section formula: x = (m·x₂ + n·x₁)/(m + n) = (' + s.m + '·' + s.x2 + ' + ' + s.n + '·' + s.x1 + ')/(' + s.m + ' + ' + s.n + ') = ' + s.x + '.'; }]
    },

    /* ── Trigonometry ── (sin/cos/tan and identity symbols are DNT math; structure noun & identity description ride
       index pools TRIG_STRUCT / TRIG_IDENT for hi/mr translation) */
    'trigonometry:*:standardEval': {
      s: [function (s) { return s.fn + ' ' + s.ang + '° = ?'; }],
      e: [function (s) { return 'From the standard-angle table, ' + s.fn + ' ' + s.ang + '° = ' + s.val + '.'; }]
    },
    'trigonometry:*:complementary': {
      s: [function (s) { return 'If ' + s.p0 + ' θ = ' + s.p1 + ' ' + s.x + '°, find the acute angle θ (in degrees).'; }],
      e: [function (s) { return s.p0 + ' θ = ' + s.p1 + '(90° − θ), so θ = 90° − ' + s.x + '° = ' + (90 - s.x) + '°.'; }]
    },
    'trigonometry:*:identity': {
      s: [function (s) { return 'Evaluate ' + TRIG_IDENT[s.idx][0] + '.'; }],
      e: [function (s) { return 'This is ' + TRIG_IDENT[s.idx][1] + ' — one of the three Pythagorean identities, all derived from sin²θ + cos²θ = 1 (divide through by cos²θ or sin²θ for the other two). Its value is fixed at 1 for every angle θ, so no specific angle is needed. (Trap: the squares are on the functions, e.g. sin²θ means (sinθ)², not sin(θ²).)'; }]
    },
    'trigonometry:hard:heightElev': {
      s: [function (s) { return 'The angle of elevation of the top of a ' + TRIG_STRUCT[s.stIdx] + ' from a point ' + s.base + ' m from its base is 45°. Find the height of the ' + TRIG_STRUCT[s.stIdx] + ' (in metres).'; }],
      e: [function (s) { return 'tan(45°) = height / base = 1, so height = base = ' + s.base + ' m.'; }]
    },

    /* ── Permutation & combination ── (ASCII nPr/nCr; factorial/combination values precomputed into slots) */
    'permutation-combination:easy:factorial': {
      s: [function (s) { return s.n + '! = ?'; }],
      e: [function (s) { return s.n + '! = ' + s.n + ' × ' + (s.n - 1) + ' × … × 1 = ' + s.val + '.'; }]
    },
    'permutation-combination:*:arrange': {
      s: [function (s) { return 'In how many ways can ' + s.n + ' distinct books be arranged in a row?'; }],
      e: [function (s) { return 'All ' + s.n + ' arranged = ' + s.n + '! = ' + s.val + '.'; }]
    },
    'permutation-combination:medium:nPr': {
      s: [function (s) { return 'Find the value of ' + s.n + 'P' + s.r + ' (permutations of ' + s.r + ' from ' + s.n + ').'; }],
      e: [function (s) { return 'nPr = n!/(n−r)! = ' + s.n + '!/' + (s.n - s.r) + '! = ' + s.val + '.'; }]
    },
    'permutation-combination:medium:nCr': {
      s: [function (s) { return 'Find the value of ' + s.n + 'C' + s.r + ' (combinations of ' + s.r + ' from ' + s.n + ').'; }],
      e: [function (s) { return 'nCr = n!/[r!(n−r)!] = ' + s.n + '!/[' + s.r + '!·' + (s.n - s.r) + '!] = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:committee': {
      s: [function (s) { return 'From ' + s.n + ' people, how many different committees of ' + s.r + ' can be formed?'; }],
      e: [function (s) { return 'Order does not matter → combinations: ' + s.n + 'C' + s.r + ' = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:handshakes': {
      s: [function (s) { return 'In a party of ' + s.n + ' people, everyone shakes hands with everyone else once. How many handshakes take place?'; }],
      e: [function (s) { return 'Each handshake is a pair → ' + s.n + 'C2 = ' + s.n + '×' + (s.n - 1) + '/2 = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:circular': {
      s: [function (s) { return 'In how many ways can ' + s.n + ' people be seated around a circular table?'; }],
      e: [function (s) { return 'Around a circle one seat is fixed to remove identical rotations, leaving (n − 1)! = ' + (s.n - 1) + '! = ' + s.val + ' arrangements.'; }]
    },
    'permutation-combination:hard:atLeastOne': {
      s: [function (s) { return 'A committee of ' + s.r + ' is chosen from ' + s.w + ' women and ' + s.m + ' men. How many committees include at least one woman?'; }],
      e: [function (s) { return 'Count the complement: total committees ' + (s.w + s.m) + 'C' + s.r + ' = ' + s.total + ', minus all-men committees ' + s.m + 'C' + s.r + ' = ' + s.allMen + ', gives ' + s.ans + '. “At least one” almost always means subtract the none-case.'; }]
    },

    /* ── Probability ── (decimal answers precomputed; colour nouns ride the PROB_COL / PROB_COLC index pools) */
    'probability:*:bagSingle': {
      s: [function (s) { return 'A bag has ' + s.r + ' ' + PROB_COL[s.colIdx][0] + ' and ' + s.b + ' ' + PROB_COL[s.colIdx][1] + ' balls. One ball is drawn at random. What is the probability it is ' + PROB_COL[s.colIdx][0] + '? (as a decimal)'; }],
      e: [function (s) { return 'P = favourable/total = ' + s.r + '/' + s.T + ' = ' + s.ans + '.'; }]
    },
    'probability:easy:allHeads': {
      s: [function (s) { return s.n + ' fair coin' + (s.n > 1 ? 's are' : ' is') + ' tossed. What is the probability of getting ' + (s.n === 1 ? 'a head' : 'all heads') + '? (as a decimal)'; }],
      e: [function (s) { return 'P(all heads) = (1/2)^' + s.n + ' = ' + s.ans + '.'; }]
    },
    'probability:*:complement': {
      s: [function (s) { return 'A bag has ' + s.r + ' ' + PROB_COLC[s.colIdx][0] + ' and ' + s.b + ' ' + PROB_COLC[s.colIdx][1] + ' balls. One ball is drawn at random. What is the probability it is NOT ' + PROB_COLC[s.colIdx][0] + '? (as a decimal)'; }],
      e: [function (s) { return 'P(not ' + PROB_COLC[s.colIdx][0] + ') = 1 − ' + s.r + '/' + s.T + ' = ' + s.ans + '.'; }]
    },
    'probability:*:multipleProb': {
      s: [function (s) { return 'A number is chosen at random from 1 to ' + s.T + '. What is the probability it is a multiple of ' + s.d + '? (as a decimal)'; }],
      e: [function (s) { return 'Multiples of ' + s.d + ' up to ' + s.T + ': ' + s.fav + '. P = ' + s.fav + '/' + s.T + ' = ' + s.ans + '.'; }]
    },

    /* ── Set theory ── (inclusion–exclusion; the two liked-things ride the SET_CTX index pool, A/B/C are labels) */
    'set-theory:*:union': {
      s: [function (s) { return 'In a group, ' + s.a + ' like ' + SET_CTX[s.ci][0] + ', ' + s.b + ' like ' + SET_CTX[s.ci][1] + ', and ' + s.both + ' like both. How many like at least one of the two?'; }],
      e: [function (s) { return '|A∪B| = |A| + |B| − |A∩B| = ' + s.a + ' + ' + s.b + ' − ' + s.both + ' = ' + (s.a + s.b - s.both) + '.'; }]
    },
    'set-theory:easy:onlyA': {
      s: [function (s) { return 'In a group, ' + s.a + ' people like ' + SET_CTX[s.ci][0] + ' and ' + s.both + ' of them also like ' + SET_CTX[s.ci][1] + '. How many like ONLY ' + SET_CTX[s.ci][0] + '?'; }],
      e: [function (s) { return 'Only ' + SET_CTX[s.ci][0] + ' = |A| − |A∩B| = ' + s.a + ' − ' + s.both + ' = ' + (s.a - s.both) + '.'; }]
    },
    'set-theory:*:neither': {
      s: [function (s) { return 'In a class of ' + s.total + ' students, ' + s.a + ' like ' + SET_CTX[s.ci][0] + ', ' + s.b + ' like ' + SET_CTX[s.ci][1] + ' and ' + s.both + ' like both. How many like neither?'; }],
      e: [function (s) { return 'Like at least one = ' + s.a + ' + ' + s.b + ' − ' + s.both + ' = ' + s.union + '. Neither = ' + s.total + ' − ' + s.union + ' = ' + s.neither + '.'; }]
    },
    'set-theory:*:both': {
      s: [function (s) { return 'In a class of ' + s.total + ' students, ' + s.a + ' like ' + SET_CTX[s.ci][0] + ', ' + s.b + ' like ' + SET_CTX[s.ci][1] + ' and ' + s.neither + ' like neither. How many like both?'; }],
      e: [function (s) { return 'Like at least one = ' + s.total + ' − ' + s.neither + ' = ' + s.union + '. Both = |A| + |B| − union = ' + s.a + ' + ' + s.b + ' − ' + s.union + ' = ' + s.both + '.'; }]
    },
    'set-theory:hard:threeUnion': {
      s: [function (s) { return 'In a survey, ' + s.a + ' read A, ' + s.b + ' read B, ' + s.cc + ' read C; ' + s.ab + ' read A and B, ' + s.bc + ' read B and C, ' + s.ca + ' read A and C, and ' + s.abc + ' read all three. How many read at least one?'; }],
      e: [function (s) { return '|A∪B∪C| = (' + s.a + '+' + s.b + '+' + s.cc + ') − (' + s.ab + '+' + s.bc + '+' + s.ca + ') + ' + s.abc + ' = ' + s.union + '.'; }]
    },

    /* ── Statistics basics ── (data lists ride slots as arrays; median/mode/range/mean recompute from slots) */
    'statistics-basics:*:median': {
      s: [function (s) { return 'Find the median of ' + s.a.join(', ') + '.'; }],
      e: [function (s) { return 'Sort: ' + s.sorted.join(', ') + '. With ' + s.k + ' values the median is the middle one = ' + s.med + '.'; }]
    },
    'statistics-basics:*:range': {
      s: [function (s) { return 'Find the range of ' + s.a.join(', ') + '.'; }],
      e: [function (s) { return 'Range = largest − smallest = ' + s.mx + ' − ' + s.mn + ' = ' + (s.mx - s.mn) + '.'; }]
    },
    'statistics-basics:*:mode': {
      s: [function (s) { return 'Find the mode of ' + s.a.join(', ') + '.'; }],
      e: [function (s) { return 'The mode is the most frequent value. ' + s.m + ' appears 3 times — more than any other — so the mode is ' + s.m + '.'; }]
    },
    'statistics-basics:hard:mean': {
      s: [function (s) { return 'Find the mean (average) of ' + s.a.join(', ') + '.'; }],
      e: [function (s) { return 'Mean = sum ÷ count = ' + s.sum + ' ÷ ' + s.k + ' = ' + s.M + '.'; }]
    },

    /* ── Ratios ── (person names ride slot `nm`; ratio answers & the pct-descriptor ride the RAT_PCT_POOL index) */
    'ratios:*:divide': {
      s: [function (s) { return '₹' + s.total + ' is divided between ' + s.nm[0].en + ' and ' + s.nm[1].en + ' in the ratio ' + s.p0 + ' : ' + s.p1 + '. ' + s.nm[0].en + ' gets ₹?'; }],
      e: [function (s) { return 'Total parts = ' + s.p0 + ' + ' + s.p1 + ' = ' + s.parts + '. One part = ' + s.total + ' ÷ ' + s.parts + ' = ' + (s.total / s.parts) + '. ' + s.nm[0].en + ' = ' + s.p0 + ' × ' + (s.total / s.parts) + ' = ' + (s.total * s.p0 / s.parts) + '.'; }]
    },
    'ratios:*:findTerm': {
      s: [function (s) { return 'A : B = ' + s.p0 + ' : ' + s.p1 + ' and A = ' + s.aVal + '. B = ?'; }],
      e: [function (s) { return 'One part = A ÷ ' + s.p0 + ' = ' + s.aVal + ' ÷ ' + s.p0 + ' = ' + s.one + '. B = ' + s.p1 + ' × ' + s.one + ' = ' + s.bVal + '.'; }]
    },
    'ratios:hard:combine': {
      s: [function (s) { return 'A : B = ' + s.ab0 + ' : ' + s.ab1 + ' and B : C = ' + s.bc0 + ' : ' + s.bc1 + '. A : C = ?'; }],
      e: [function (s) { return 'B is common (' + s.ab1 + '=' + s.bc0 + '), so A : C = ' + s.ab0 + ' : ' + s.bc1 + ' = ' + (s.ab0 / s.g) + ' : ' + (s.bc1 / s.g) + ' after dividing by ' + s.g + '.'; }]
    },
    'ratios:*:pctRatio': {
      s: [function (s) { return 'A is ' + RAT_PCT_POOL[s.idx][0] + ' than B. A : B = ?'; }],
      e: [function (s) { return 'Write A as a fraction of B: "' + RAT_PCT_POOL[s.idx][0] + '" → A/B = ' + s.ratio.replace(':', '/') + ', so A : B = ' + s.ratio + ' in lowest terms.'; }]
    },

    /* ── Mixtures & alligations ── (commodity rides the MIX_ITEMS index pool; ₹/kg + ratio/price answers neutral) */
    'mixtures:*:alligationRatio': {
      s: [function (s) { return 'In what ratio must ' + MIX_ITEMS[s.itIdx] + ' at ₹' + s.a + ' per kg be mixed with ' + MIX_ITEMS[s.itIdx] + ' at ₹' + s.b + ' per kg so that the mixture is worth ₹' + s.m + ' per kg?'; }],
      e: [function (s) { return 'By alligation, cheaper : dearer = (dearer − mean) : (mean − cheaper) = (' + s.b + '−' + s.m + ') : (' + s.m + '−' + s.a + ') = ' + s.lo + ' : ' + s.hi + ' = ' + (s.lo / s.g) + ' : ' + (s.hi / s.g) + '.'; }]
    },
    'mixtures:*:meanPrice': {
      s: [function (s) { return '' + s.x + ' kg of ' + MIX_ITEMS[s.itIdx] + ' at ₹' + s.a + ' per kg is mixed with ' + s.y + ' kg of ' + MIX_ITEMS[s.itIdx] + ' at ₹' + s.b + ' per kg. The average price of the mixture = ₹? per kg'; }],
      e: [function (s) { return 'Average = total cost ÷ total weight = (' + s.x + '×' + s.a + ' + ' + s.y + '×' + s.b + ') ÷ (' + s.x + '+' + s.y + ') = ' + (s.a * s.x + s.b * s.y) + ' ÷ ' + (s.x + s.y) + ' = ₹' + s.mean + '.'; }]
    },
    'mixtures:hard:alligationQty': {
      s: [function (s) { return 'In what quantity (in kg) must ' + MIX_ITEMS[s.itIdx] + ' at ₹' + s.a + ' per kg be mixed with ' + s.y + ' kg of ' + MIX_ITEMS[s.itIdx] + ' at ₹' + s.b + ' per kg so that the mixture is worth ₹' + s.m + ' per kg?'; }],
      e: [function (s) { return 'By alligation, cheaper : dearer = (' + s.b + '−' + s.m + ') : (' + s.m + '−' + s.a + ') = ' + s.lo + ' : ' + s.hi + '. Cheaper quantity = ' + s.y + ' × ' + s.lo + '/' + s.hi + ' = ' + s.x + ' kg.'; }]
    }
  } };

  if (GI) GI.register('en', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
