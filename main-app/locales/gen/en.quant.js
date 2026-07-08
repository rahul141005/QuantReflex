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
    'fractions:easy:fracToPct': {
      s: [function (s) { return s.frac + ' expressed as a percentage = ? %'; }, function (s) { return 'Convert ' + s.frac + ' to a percentage.'; }, function (s) { return s.frac + ' = ? %'; }, function (s) { return 'What is ' + s.frac + ' as a percentage?'; }],
      e: [function (s) { return s.frac + ' = ' + s.pct + '% (divide and ×100; memorising the common ones saves seconds).'; }]
    },
    'fractions:medium:fracToPct': {
      s: [function (s) { return s.frac + ' expressed as a percentage = ? %'; }, function (s) { return 'Convert ' + s.frac + ' to a percentage.'; }, function (s) { return s.frac + ' = ? %'; }, function (s) { return 'What is ' + s.frac + ' as a percentage?'; }],
      e: [function (s) { return s.frac + ' = ' + s.pct + '% (divide and ×100; memorising the common ones saves seconds).'; }]
    },
    'fractions:medium:pctToFrac': {
      s: [function (s) { return s.pct + '% as a fraction = ?'; }, function (s) { return 'Express ' + s.pct + '% as a fraction.'; }, function (s) { return s.pct + '% = ? (in lowest terms)'; }],
      e: [function (s) { return s.pct + '% = ' + s.pct + '/100 = ' + s.frac + ' in lowest terms.'; }]
    },
    'fractions:hard:pctToFrac': {
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
    'multiplication:easy:multiply': { s: [function (s) { return s.x + ' × ' + s.y + ' = ?'; }], e: [function (s) { return s.x + ' × ' + s.y + ' = ' + (s.x * s.y) + '. Split the second number: ' + s.x + ' × ' + s.tens + ' + ' + s.x + ' × ' + s.un + ' = ' + (s.x * s.tens) + ' + ' + (s.x * s.un) + '.'; }] },
    'multiplication:medium:multiply': { s: [function (s) { return s.x + ' × ' + s.y + ' = ?'; }], e: [function (s) { return s.x + ' × ' + s.y + ' = ' + (s.x * s.y) + '. Split the second number: ' + s.x + ' × ' + s.tens + ' + ' + s.x + ' × ' + s.un + ' = ' + (s.x * s.tens) + ' + ' + (s.x * s.un) + '.'; }] },
    'multiplication:hard:multiply': { s: [function (s) { return s.x + ' × ' + s.y + ' = ?'; }], e: [function (s) { return s.x + ' × ' + s.y + ' = ' + (s.x * s.y) + '. Split the second number: ' + s.x + ' × ' + s.tens + ' + ' + s.x + ' × ' + s.un + ' = ' + (s.x * s.tens) + ' + ' + (s.x * s.un) + '.'; }] },
    'multiplication:medium:divide': { s: [function (s) { return s.p + ' ÷ ' + s.x + ' = ?'; }], e: [function (s) { return s.p + ' ÷ ' + s.x + ' = ' + s.y + ', since ' + s.x + ' × ' + s.y + ' = ' + s.p + '. Division undoes the product.'; }] },
    'multiplication:hard:divide': { s: [function (s) { return s.p + ' ÷ ' + s.x + ' = ?'; }], e: [function (s) { return s.p + ' ÷ ' + s.x + ' = ' + s.y + ', since ' + s.x + ' × ' + s.y + ' = ' + s.p + '. Division undoes the product.'; }] },
    'multiplication:medium:threeFactor': { s: [function (s) { return s.a + ' × ' + s.b + ' × ' + s.c + ' = ?'; }], e: [function (s) { return 'Left to right: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', then × ' + s.c + ' = ' + (s.a * s.b * s.c) + '. Regroup to make a round number when possible.'; }] },
    'multiplication:hard:threeFactor': { s: [function (s) { return s.a + ' × ' + s.b + ' × ' + s.c + ' = ?'; }], e: [function (s) { return 'Left to right: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', then × ' + s.c + ' = ' + (s.a * s.b * s.c) + '. Regroup to make a round number when possible.'; }] },
    'multiplication:medium:mentalSquare': { s: [function (s) { return s.n + ' × ' + s.n + ' = ?'; }], e: [function (s) { return s.n + '² = (' + s.r + (s.d < 0 ? '' : '+') + s.d + ')² = ' + (s.n * s.n) + ' — a fast mental square.'; }] },

    /* ── Simplification / BODMAS ── (pure arithmetic expressions; explanation frames the operator order) */
    'simplification:easy:multiplyAdd': { s: [function (s) { return s.a + ' × ' + s.b + ' + ' + s.c + ' = ?'; }], e: [function (s) { return 'BODMAS — multiply first: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', then + ' + s.c + ' = ' + (s.a * s.b + s.c) + '.'; }] },
    'simplification:medium:multiplyAdd': { s: [function (s) { return s.a + ' × ' + s.b + ' + ' + s.c + ' = ?'; }], e: [function (s) { return 'BODMAS — multiply first: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', then + ' + s.c + ' = ' + (s.a * s.b + s.c) + '.'; }] },
    'simplification:medium:divideAdd': { s: [function (s) { return s.num + ' ÷ ' + s.dv + ' + ' + s.add + ' = ?'; }], e: [function (s) { return 'Divide first: ' + s.num + ' ÷ ' + s.dv + ' = ' + (s.num / s.dv) + ', then + ' + s.add + ' = ' + (s.num / s.dv + s.add) + '.'; }] },
    'simplification:hard:fullBodmas': { s: [function (s) { return '(' + s.p + ' × ' + s.q + ') ÷ ' + s.r + ' + ' + s.ss + ' × ' + s.t + ' = ?'; }], e: [function (s) { return 'Brackets → (' + s.p + ' × ' + s.q + ') = ' + (s.p * s.q) + '; ÷ ' + s.r + ' = ' + ((s.p * s.q) / s.r) + '; and ' + s.ss + ' × ' + s.t + ' = ' + (s.ss * s.t) + '; sum = ' + ((s.p * s.q) / s.r + s.ss * s.t) + '.'; }] },

    /* ── Area ── (cm/m units live in the wording; numbers are slots; formulae recompute from slots, language-neutral) */
    'area:easy:square': {
      s: [function (s) { return 'The area of a square of side ' + s.s + ' cm = ? cm².'; }, function (s) { return 'A square tile has a side of ' + s.s + ' cm. Find its area (in cm²).'; }, function (s) { return 'Each side of a square field measures ' + s.s + ' m. Its area = ? m².'; }],
      e: [function (s) { return 'Area of a square = side² = ' + s.s + '² = ' + (s.s * s.s) + '.'; }]
    },
    'area:easy:rectangle': {
      s: [function (s) { return 'A rectangle is ' + s.l + ' cm long and ' + s.b + ' cm wide. Its area = ? cm².'; }, function (s) { return 'A rectangular plot measures ' + s.l + ' m by ' + s.b + ' m. Find its area (in m²).'; }, function (s) { return 'A hall is ' + s.l + ' m long and ' + s.b + ' m broad. The area of its floor = ? m².'; }],
      e: [function (s) { return 'Area = length × breadth = ' + s.l + ' × ' + s.b + ' = ' + (s.l * s.b) + '.'; }]
    },
    'area:medium:rectangle': {
      s: [function (s) { return 'A rectangle is ' + s.l + ' cm long and ' + s.b + ' cm wide. Its area = ? cm².'; }, function (s) { return 'A rectangular plot measures ' + s.l + ' m by ' + s.b + ' m. Find its area (in m²).'; }, function (s) { return 'A hall is ' + s.l + ' m long and ' + s.b + ' m broad. The area of its floor = ? m².'; }],
      e: [function (s) { return 'Area = length × breadth = ' + s.l + ' × ' + s.b + ' = ' + (s.l * s.b) + '.'; }]
    },
    'area:medium:triangle': {
      s: [function (s) { return 'A triangle has base ' + s.base + ' cm and height ' + s.h + ' cm. Its area = ? cm².'; }, function (s) { return 'Find the area of a triangle whose base is ' + s.base + ' cm and height is ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'Area = ½ × base × height = ½ × ' + s.base + ' × ' + s.h + ' = ' + (s.base * s.h / 2) + ' cm². Halve the even side first to avoid fractions.'; }]
    },
    'area:hard:triangle': {
      s: [function (s) { return 'A triangle has base ' + s.base + ' cm and height ' + s.h + ' cm. Its area = ? cm².'; }, function (s) { return 'Find the area of a triangle whose base is ' + s.base + ' cm and height is ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'Area = ½ × base × height = ½ × ' + s.base + ' × ' + s.h + ' = ' + (s.base * s.h / 2) + ' cm². Halve the even side first to avoid fractions.'; }]
    },
    'area:medium:parallelogram': {
      s: [function (s) { return 'A parallelogram has base ' + s.b + ' cm and height ' + s.h + ' cm. Its area = ? cm².'; }, function (s) { return 'Find the area of a parallelogram with base ' + s.b + ' cm and perpendicular height ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'Area = base × height = ' + s.b + ' × ' + s.h + ' = ' + (s.b * s.h) + ' cm². Use the perpendicular height, not the slant side.'; }]
    },
    'area:medium:circle': {
      s: [function (s) { return 'The area of a circle of radius ' + s.r + ' cm = ? cm². (use π = 3.14)'; }, function (s) { return 'A circular garden has a radius of ' + s.r + ' m. Find its area in m² (take π = 3.14).'; }],
      e: [function (s) { return 'Area = πr² = 3.14 × ' + s.r + '² = 3.14 × ' + (s.r * s.r) + ' = ' + s.ans + '.'; }]
    },
    'area:hard:circle': {
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
    'volume:easy:cuboid': {
      s: [function (s) { return 'A cuboid measures ' + s.l + ' cm × ' + s.b + ' cm × ' + s.h + ' cm. Its volume = ? cm³.'; }, function (s) { return 'A carton is ' + s.l + ' cm long, ' + s.b + ' cm wide and ' + s.h + ' cm high. Find its volume (in cm³).'; }, function (s) { return 'A water tank measures ' + s.l + ' m by ' + s.b + ' m by ' + s.h + ' m. Its capacity = ? m³.'; }],
      e: [function (s) { return 'Volume = l × b × h = ' + s.l + ' × ' + s.b + ' × ' + s.h + ' = ' + (s.l * s.b * s.h) + '.'; }]
    },
    'volume:medium:cuboid': {
      s: [function (s) { return 'A cuboid measures ' + s.l + ' cm × ' + s.b + ' cm × ' + s.h + ' cm. Its volume = ? cm³.'; }, function (s) { return 'A carton is ' + s.l + ' cm long, ' + s.b + ' cm wide and ' + s.h + ' cm high. Find its volume (in cm³).'; }, function (s) { return 'A water tank measures ' + s.l + ' m by ' + s.b + ' m by ' + s.h + ' m. Its capacity = ? m³.'; }],
      e: [function (s) { return 'Volume = l × b × h = ' + s.l + ' × ' + s.b + ' × ' + s.h + ' = ' + (s.l * s.b * s.h) + '.'; }]
    },
    'volume:medium:cylinder': {
      s: [function (s) { return 'A cylinder has radius ' + s.r + ' cm and height ' + s.h + ' cm. Its volume = ? cm³. (use π = 3.14)'; }, function (s) { return 'A cylindrical drum has a base radius of ' + s.r + ' cm and stands ' + s.h + ' cm tall. Find its volume in cm³ (take π = 3.14).'; }],
      e: [function (s) { return 'Volume = πr²h = 3.14 × ' + s.r + '² × ' + s.h + ' = 3.14 × ' + (s.r * s.r * s.h) + ' = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:cylinder': {
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
    'surface-area:easy:cuboidTSA': {
      s: [function (s) { return 'Find the total surface area of a cuboid ' + s.l + ' × ' + s.b + ' × ' + s.h + ' cm (in cm²).'; }],
      e: [function (s) { return 'TSA = 2(lb + bh + hl) = 2(' + (s.l * s.b) + ' + ' + (s.b * s.h) + ' + ' + (s.l * s.h) + ') = ' + (2 * (s.l * s.b + s.b * s.h + s.l * s.h)) + ' cm².'; }]
    },
    'surface-area:medium:cuboidTSA': {
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
    'percentages:easy:directOf': {
      s: [function (s) { return s.p + '% of ' + s.b + ' = ?'; }, function (s) { return 'Find ' + s.p + '% of ' + s.b + '.'; }, function (s) { return s.p + '% of ' + s.b + ' is what number?'; }],
      e: [function (s) { return s.p + '% of ' + s.b + ' = ' + s.p + ' × ' + s.b + ' ÷ 100 = ' + s.r + '. Tip: ' + s.p + '% of ' + s.b + ' = ' + s.b + '% of ' + s.p + ' — swap when one side is rounder.'; }]
    },
    'percentages:medium:directOf': {
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
    'averages:easy:mean': {
      s: [function (s) { return 'The average of ' + s.nums.join(', ') + ' = ?'; }, function (s) { return 'Find the mean of ' + s.nums.join(', ') + '.'; }, function (s) { return 'What is the average of ' + s.nums.join(', ') + '?'; }],
      e: [function (s) { return 'Average = sum ÷ count = ' + s.nums.reduce(function (x, y) { return x + y; }, 0) + ' ÷ ' + s.count + ' = ' + s.avg + '.'; }]
    },
    'averages:medium:mean': {
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
    'profit-loss:easy:spProfit': {
      s: [function (s) { return 'The cost price is ₹' + s.cp + ' and the profit is ' + s.pr + '%. The selling price = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 + profit%) = ' + s.cp + ' × ' + (1 + s.pr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:medium:spProfit': {
      s: [function (s) { return 'The cost price is ₹' + s.cp + ' and the profit is ' + s.pr + '%. The selling price = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 + profit%) = ' + s.cp + ' × ' + (1 + s.pr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:easy:spLoss': {
      s: [function (s) { return 'The cost price is ₹' + s.cp + ' and the loss is ' + s.lr + '%. The selling price = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 − loss%) = ' + s.cp + ' × ' + (1 - s.lr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:medium:spLoss': {
      s: [function (s) { return 'The cost price is ₹' + s.cp + ' and the loss is ' + s.lr + '%. The selling price = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 − loss%) = ' + s.cp + ' × ' + (1 - s.lr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:medium:profitPct': {
      s: [function (s) { return 'An article bought for ₹' + s.cp + ' is sold for ₹' + s.sp + '. The profit percent = ?'; }],
      e: [function (s) { return 'Profit% = (SP − CP)/CP × 100 = (' + s.sp + ' − ' + s.cp + ')/' + s.cp + ' × 100 = ' + s.pr + '%. The base is always the cost price.'; }]
    },
    'profit-loss:hard:profitPct': {
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
    'simple-interest:easy:si': {
      s: [function (s) { return 'Find the simple interest on ₹' + s.P + ' at ' + s.R + '% per annum for ' + s.T + ' years.'; }, function (s) { return s.nm.en + ' deposits ₹' + s.P + ' in a scheme paying ' + s.R + '% simple interest per annum. The interest earned in ' + s.T + ' years = ₹?'; }, function (s) { return 'What simple interest does ₹' + s.P + ' earn at ' + s.R + '% per annum over ' + s.T + ' years?'; }],
      e: [function (s) { return 'SI = P × R × T ÷ 100 = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '.'; }]
    },
    'simple-interest:medium:si': {
      s: [function (s) { return 'Find the simple interest on ₹' + s.P + ' at ' + s.R + '% per annum for ' + s.T + ' years.'; }, function (s) { return s.nm.en + ' deposits ₹' + s.P + ' in a scheme paying ' + s.R + '% simple interest per annum. The interest earned in ' + s.T + ' years = ₹?'; }, function (s) { return 'What simple interest does ₹' + s.P + ' earn at ' + s.R + '% per annum over ' + s.T + ' years?'; }],
      e: [function (s) { return 'SI = P × R × T ÷ 100 = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '.'; }]
    },
    'simple-interest:easy:amount': {
      s: [function (s) { return 'A sum of ₹' + s.P + ' is lent at ' + s.R + '% simple interest per annum. The amount after ' + s.T + ' years = ₹?'; }, function (s) { return s.nm.en + ' borrows ₹' + s.P + ' at ' + s.R + '% per annum simple interest. How much must be repaid after ' + s.T + ' years (in ₹)?'; }],
      e: [function (s) { return 'SI = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '; Amount = P + SI = ' + s.P + ' + ' + s.si + ' = ₹' + (s.P + s.si) + '.'; }]
    },
    'simple-interest:medium:amount': {
      s: [function (s) { return 'A sum of ₹' + s.P + ' is lent at ' + s.R + '% simple interest per annum. The amount after ' + s.T + ' years = ₹?'; }, function (s) { return s.nm.en + ' borrows ₹' + s.P + ' at ' + s.R + '% per annum simple interest. How much must be repaid after ' + s.T + ' years (in ₹)?'; }],
      e: [function (s) { return 'SI = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '; Amount = P + SI = ' + s.P + ' + ' + s.si + ' = ₹' + (s.P + s.si) + '.'; }]
    },
    'simple-interest:medium:findRate': {
      s: [function (s) { return 'At what rate percent per annum does ₹' + s.P + ' yield ₹' + s.si + ' as simple interest in ' + s.T + ' years?'; }, function (s) { return 'A sum of ₹' + s.P + ' earns ₹' + s.si + ' as simple interest in ' + s.T + ' years. The annual rate = ? %'; }],
      e: [function (s) { return 'R = SI × 100 ÷ (P × T) = ' + s.si + ' × 100 ÷ (' + s.P + ' × ' + s.T + ') = ' + s.R + '%.'; }]
    },
    'simple-interest:hard:findRate': {
      s: [function (s) { return 'At what rate percent per annum does ₹' + s.P + ' yield ₹' + s.si + ' as simple interest in ' + s.T + ' years?'; }, function (s) { return 'A sum of ₹' + s.P + ' earns ₹' + s.si + ' as simple interest in ' + s.T + ' years. The annual rate = ? %'; }],
      e: [function (s) { return 'R = SI × 100 ÷ (P × T) = ' + s.si + ' × 100 ÷ (' + s.P + ' × ' + s.T + ') = ' + s.R + '%.'; }]
    },
    'simple-interest:hard:findPrincipal': {
      s: [function (s) { return 'A sum earns ₹' + s.si + ' as simple interest at ' + s.R + '% per annum in ' + s.T + ' years. Find the sum.'; }, function (s) { return 'What principal yields ₹' + s.si + ' as simple interest at ' + s.R + '% per annum in ' + s.T + ' years?'; }],
      e: [function (s) { return 'P = SI × 100 ÷ (R × T) = ' + s.si + ' × 100 ÷ (' + s.R + ' × ' + s.T + ') = ₹' + s.P + '.'; }]
    },

    /* ── Compound interest ── (superscript exponent picks ² or ³ from T; ₹/% verbatim) */
    'compound-interest:easy:amount': {
      s: [function (s) { return 'Find the amount on ₹' + s.P + ' at ' + s.R + '% per annum compounded annually for ' + s.T + ' years.'; }, function (s) { return s.nm.en + ' invests ₹' + s.P + ' at ' + s.R + '% per annum, compounded annually. The amount after ' + s.T + ' years = ₹?'; }],
      e: [function (s) { return 'A = P(1 + R/100)ᵀ = ' + s.P + ' × ' + (1 + s.R / 100) + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '.'; }]
    },
    'compound-interest:medium:amount': {
      s: [function (s) { return 'Find the amount on ₹' + s.P + ' at ' + s.R + '% per annum compounded annually for ' + s.T + ' years.'; }, function (s) { return s.nm.en + ' invests ₹' + s.P + ' at ' + s.R + '% per annum, compounded annually. The amount after ' + s.T + ' years = ₹?'; }],
      e: [function (s) { return 'A = P(1 + R/100)ᵀ = ' + s.P + ' × ' + (1 + s.R / 100) + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '.'; }]
    },
    'compound-interest:medium:ci': {
      s: [function (s) { return 'Find the compound interest on ₹' + s.P + ' at ' + s.R + '% per annum for ' + s.T + ' years, compounded annually.'; }, function (s) { return 'A loan of ₹' + s.P + ' is taken at ' + s.R + '% per annum, compounded annually. The compound interest payable after ' + s.T + ' years = ₹?'; }],
      e: [function (s) { return 'A = ' + s.P + '(1 + ' + s.R + '/100)' + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '; CI = A − P = ' + s.A + ' − ' + s.P + ' = ₹' + (s.A - s.P) + '.'; }]
    },
    'compound-interest:hard:ci': {
      s: [function (s) { return 'Find the compound interest on ₹' + s.P + ' at ' + s.R + '% per annum for ' + s.T + ' years, compounded annually.'; }, function (s) { return 'A loan of ₹' + s.P + ' is taken at ' + s.R + '% per annum, compounded annually. The compound interest payable after ' + s.T + ' years = ₹?'; }],
      e: [function (s) { return 'A = ' + s.P + '(1 + ' + s.R + '/100)' + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '; CI = A − P = ' + s.A + ' − ' + s.P + ' = ₹' + (s.A - s.P) + '.'; }]
    },
    'compound-interest:hard:ciSiDiff': {
      s: [function (s) { return 'The difference between the compound interest and the simple interest on ₹' + s.P + ' at ' + s.R + '% per annum for 2 years = ₹?'; }],
      e: [function (s) { return 'For 2 years, CI − SI = P(R/100)² = ' + s.P + ' × (' + s.R + '/100)² = ₹' + s.d + '.'; }]
    },

    /* ── Time, speed & distance ── (km/h, m/s, km, hours verbatim; unitConvert & trainCrossing carry a form encoded
       in the variant seed — see the builders — so each stem lines up with its own explanation) */
    'time-speed-distance:easy:distance': {
      s: [function (s) { return 'A car travels at ' + s.sp + ' km/h for ' + s.t + ' hours. The distance covered = ? km'; }, function (s) { return 'Moving at ' + s.sp + ' km/h for ' + s.t + ' hours, a train covers ? km'; }, function (s) { return 'At a steady ' + s.sp + ' km/h for ' + s.t + ' hours, the distance = ? km'; }],
      e: [function (s) { return 'Distance = speed × time = ' + s.sp + ' × ' + s.t + ' = ' + (s.sp * s.t) + ' km.'; }]
    },
    'time-speed-distance:medium:distance': {
      s: [function (s) { return 'A car travels at ' + s.sp + ' km/h for ' + s.t + ' hours. The distance covered = ? km'; }, function (s) { return 'Moving at ' + s.sp + ' km/h for ' + s.t + ' hours, a train covers ? km'; }, function (s) { return 'At a steady ' + s.sp + ' km/h for ' + s.t + ' hours, the distance = ? km'; }],
      e: [function (s) { return 'Distance = speed × time = ' + s.sp + ' × ' + s.t + ' = ' + (s.sp * s.t) + ' km.'; }]
    },
    'time-speed-distance:easy:time': {
      s: [function (s) { return 'A car covers ' + s.d + ' km at ' + s.sp + ' km/h. The time taken = ? hours'; }, function (s) { return 'At ' + s.sp + ' km/h, the time to cover ' + s.d + ' km = ? hours'; }, function (s) { return 'Travelling ' + s.d + ' km at ' + s.sp + ' km/h takes ? hours'; }],
      e: [function (s) { return 'Time = distance ÷ speed = ' + s.d + ' ÷ ' + s.sp + ' = ' + s.t + ' hours.'; }]
    },
    'time-speed-distance:medium:time': {
      s: [function (s) { return 'A car covers ' + s.d + ' km at ' + s.sp + ' km/h. The time taken = ? hours'; }, function (s) { return 'At ' + s.sp + ' km/h, the time to cover ' + s.d + ' km = ? hours'; }, function (s) { return 'Travelling ' + s.d + ' km at ' + s.sp + ' km/h takes ? hours'; }],
      e: [function (s) { return 'Time = distance ÷ speed = ' + s.d + ' ÷ ' + s.sp + ' = ' + s.t + ' hours.'; }]
    },
    'time-speed-distance:easy:speed': {
      s: [function (s) { return 'A train covers ' + s.d + ' km in ' + s.t + ' hours. Its speed = ? km/h'; }, function (s) { return 'Covering ' + s.d + ' km in ' + s.t + ' hours, the speed = ? km/h'; }, function (s) { return 'A bus runs ' + s.d + ' km in ' + s.t + ' hours. Average speed = ? km/h'; }],
      e: [function (s) { return 'Speed = distance ÷ time = ' + s.d + ' ÷ ' + s.t + ' = ' + s.sp + ' km/h.'; }]
    },
    'time-speed-distance:medium:speed': {
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
    'time-and-work:easy:together': {
      s: [function (s) { return 'A can do a piece of work in ' + s.a + ' days and B in ' + s.b + ' days. Working together, they finish it in ? days'; }],
      e: [function (s) { return 'Together time = (a × b)/(a + b) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + (s.a * s.b) + '/' + (s.a + s.b) + ' = ' + ((s.a * s.b) / (s.a + s.b)) + ' days. Add the RATES (1/a + 1/b), never the days.'; }]
    },
    'time-and-work:medium:together': {
      s: [function (s) { return 'A can do a piece of work in ' + s.a + ' days and B in ' + s.b + ' days. Working together, they finish it in ? days'; }],
      e: [function (s) { return 'Together time = (a × b)/(a + b) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + (s.a * s.b) + '/' + (s.a + s.b) + ' = ' + ((s.a * s.b) / (s.a + s.b)) + ' days. Add the RATES (1/a + 1/b), never the days.'; }]
    },
    'time-and-work:easy:workDone': {
      s: [function (s) { return 'A can finish a job in ' + s.days + ' days. In ' + s.wd + ' days he completes ? % of the work.'; }],
      e: [function (s) { return 'Fraction done = ' + s.wd + '/' + s.days + ', so ' + s.wd + '/' + s.days + ' × 100 = ' + (s.wd * 100 / s.days) + '%.'; }]
    },
    'time-and-work:medium:workDone': {
      s: [function (s) { return 'A can finish a job in ' + s.days + ' days. In ' + s.wd + ' days he completes ? % of the work.'; }],
      e: [function (s) { return 'Fraction done = ' + s.wd + '/' + s.days + ', so ' + s.wd + '/' + s.days + ' × 100 = ' + (s.wd * 100 / s.days) + '%.'; }]
    },
    'time-and-work:medium:workersScale': {
      s: [function (s) { return 'If ' + s.w1 + ' workers finish a task in ' + s.dp + ' days, then ' + s.w2 + ' workers finish the same task in ? days'; }],
      e: [function (s) { return 'Total work = ' + s.w1 + ' × ' + s.dp + ' = ' + s.tot + ' worker-days. Time for ' + s.w2 + ' workers = ' + s.tot + ' ÷ ' + s.w2 + ' = ' + (s.tot / s.w2) + ' days (workers and days are inversely proportional).'; }]
    },
    'time-and-work:hard:workersScale': {
      s: [function (s) { return 'If ' + s.w1 + ' workers finish a task in ' + s.dp + ' days, then ' + s.w2 + ' workers finish the same task in ? days'; }],
      e: [function (s) { return 'Total work = ' + s.w1 + ' × ' + s.dp + ' = ' + s.tot + ' worker-days. Time for ' + s.w2 + ' workers = ' + s.tot + ' ÷ ' + s.w2 + ' = ' + (s.tot / s.w2) + ' days (workers and days are inversely proportional).'; }]
    },
    'time-and-work:hard:inverseTogether': {
      s: [function (s) { return s.nm[0].en + ' and ' + s.nm[1].en + ' together can finish a piece of work in ' + s.T + ' days. ' + s.nm[0].en + ' alone can do it in ' + s.a + ' days. In how many days can ' + s.nm[1].en + ' alone finish it?'; }],
      e: [function (s) { return 'Work with RATES: 1/' + s.nm[1].en + ' = 1/' + s.T + ' − 1/' + s.a + ' = (' + s.a + ' − ' + s.T + ')/(' + s.a + '×' + s.T + ') = ' + (s.a - s.T) + '/' + (s.a * s.T) + '. So ' + s.nm[1].en + ' alone = ' + (s.a * s.T) + '/' + (s.a - s.T) + ' = ' + s.b + ' days.'; }]
    },

    /* ── Number series ── (term lists ride slots as arrays; the pattern description is language-neutral math) */
    'number-series:easy:arithmetic': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'A constant difference of ' + s.step + ' (arithmetic progression): ' + s.terms[s.terms.length - 1] + ' + ' + s.step + ' = ' + s.ans + '.'; }]
    },
    'number-series:medium:arithmetic': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'A constant difference of ' + s.step + ' (arithmetic progression): ' + s.terms[s.terms.length - 1] + ' + ' + s.step + ' = ' + s.ans + '.'; }]
    },
    'number-series:easy:geometric': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'Each term is × ' + s.r + ' (geometric progression): ' + s.terms[s.terms.length - 1] + ' × ' + s.r + ' = ' + s.ans + '.'; }]
    },
    'number-series:medium:geometric': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'Each term is × ' + s.r + ' (geometric progression): ' + s.terms[s.terms.length - 1] + ' × ' + s.r + ' = ' + s.ans + '.'; }]
    },
    'number-series:medium:growingGap': {
      s: [function (s) { return 'Find the next number: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'The gaps grow by ' + s.base + ' each step (constant second difference): the next gap is ' + s.gap + ', so ' + s.terms[s.terms.length - 1] + ' + ' + s.gap + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:growingGap': {
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
    'pipes-cisterns:easy:together': {
      s: [function (s) { return 'Pipe A fills a tank in ' + s.a + ' hours and pipe B fills it in ' + s.b + ' hours. If both are opened together, the tank fills in ? hours'; }],
      e: [function (s) { return 'Combined time = (A × B)/(A + B) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + ((s.a * s.b) / (s.a + s.b)) + ' hours — add the rates 1/' + s.a + ' + 1/' + s.b + '.'; }]
    },
    'pipes-cisterns:medium:together': {
      s: [function (s) { return 'Pipe A fills a tank in ' + s.a + ' hours and pipe B fills it in ' + s.b + ' hours. If both are opened together, the tank fills in ? hours'; }],
      e: [function (s) { return 'Combined time = (A × B)/(A + B) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + ((s.a * s.b) / (s.a + s.b)) + ' hours — add the rates 1/' + s.a + ' + 1/' + s.b + '.'; }]
    },
    'pipes-cisterns:medium:netFill': {
      s: [function (s) { return 'An inlet pipe fills a tank in ' + s.a + ' hours while an outlet pipe empties it in ' + s.b + ' hours. If both are opened together, the tank fills in ? hours'; }],
      e: [function (s) { return 'Net rate = 1/' + s.a + ' − 1/' + s.b + '; time = (A × B)/(B − A) = (' + s.a + ' × ' + s.b + ')/(' + s.b + ' − ' + s.a + ') = ' + ((s.a * s.b) / (s.b - s.a)) + ' hours.'; }]
    },
    'pipes-cisterns:hard:netFill': {
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
    }
  } };

  if (GI) GI.register('en', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
