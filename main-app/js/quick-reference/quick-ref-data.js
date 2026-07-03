/**
 * quick-ref-data.js — the curated Quick-Reference revision library (ADR-084 Batch 3).
 *
 * A premium, exam-day revision differentiator: the formulas, tables and standard values students re-read right before
 * a mock. Pure DATA — no DOM, no logic. quick-ref-renderer.js turns each card into DOM (reusing BlockRenderers.table,
 * .math-grid and the .kx-* design language). Content is FREE (a differentiator, like the existing hub grids).
 *
 * A card = { id, section, title, icon, searchTerms[], learn?, drill?, block }.
 *   learn  — a KnowledgeBase topic id → "Learn" deep-link (#learn/<id>); must exist in the registry.
 *   drill  — a Quant generator/drill category → "Practice" launch; must exist in categoryGenerators.
 *   block  — { kind:'table', caption?, headers[], rows[][] }  OR  { kind:'grid', cols?, items:[{e,v}] }.
 *
 * Only topics that genuinely aid rapid revision get a card; everything else stays inside its Learn chapter.
 * Dual-exported (browser global QR_QUICKREF + Node module.exports) so a check script can validate it.
 */
(function (root) {
  'use strict';

  var SECTIONS = [
    { id: 'number', title: 'Number Sense', icon: '🔢' },
    { id: 'arithmetic', title: 'Arithmetic & Commercial', icon: '📊' },
    { id: 'algebra', title: 'Algebra', icon: '🧮' },
    { id: 'geometry', title: 'Geometry & Mensuration', icon: '📐' },
    { id: 'modern', title: 'Modern Math', icon: '🎲' }
  ];

  function _grid(prefix, from, to, fn) {
    var items = [];
    for (var n = from; n <= to; n++) items.push({ e: n + prefix, v: String(fn(n)) });
    return { kind: 'grid', cols: 3, items: items };
  }

  var CARDS = [
    /* ── Number Sense ── */
    {
      id: 'divisibility', section: 'number', title: 'Divisibility Rules', icon: '➗',
      learn: 'number-system', drill: 'number-properties',
      searchTerms: ['divisibility', 'divisible', 'divisor', 'rules', 'factor test'],
      block: { kind: 'table', headers: ['Divisor', 'Test'], rows: [
        ['2', 'Last digit is even (0,2,4,6,8)'],
        ['3', 'Sum of digits divisible by 3'],
        ['4', 'Last two digits divisible by 4'],
        ['5', 'Ends in 0 or 5'],
        ['6', 'Divisible by both 2 and 3'],
        ['8', 'Last three digits divisible by 8'],
        ['9', 'Sum of digits divisible by 9'],
        ['10', 'Ends in 0'],
        ['11', 'Alternating digit sum divisible by 11']
      ] }
    },
    {
      id: 'hcf-lcm', section: 'number', title: 'HCF & LCM', icon: '🔗',
      learn: 'number-system', drill: 'number-properties',
      searchTerms: ['hcf', 'lcm', 'gcd', 'highest common factor', 'least common multiple', 'co-prime'],
      block: { kind: 'table', headers: ['Fact', 'Rule'], rows: [
        ['HCF', 'Largest number dividing all of them'],
        ['LCM', 'Smallest number they all divide'],
        ['Product rule', 'HCF × LCM = a × b (two numbers)'],
        ['Find LCM', 'LCM = (a × b) ÷ HCF'],
        ['Co-prime', 'HCF = 1, so LCM = a × b'],
        ['Fractions', 'HCF of numerators ÷ LCM of denominators']
      ] }
    },
    {
      id: 'squares', section: 'number', title: 'Squares (1–50)', icon: '🔲',
      learn: 'squares', drill: 'squares',
      searchTerms: ['squares', 'square table', 'perfect square'],
      block: _grid('²', 1, 50, function (n) { return n * n; })
    },
    {
      id: 'cubes', section: 'number', title: 'Cubes (1–30)', icon: '🔳',
      learn: 'cubes', drill: 'cubes',
      searchTerms: ['cubes', 'cube table', 'perfect cube'],
      block: _grid('³', 1, 30, function (n) { return n * n * n; })
    },

    /* ── Arithmetic & Commercial ── */
    {
      id: 'frac-pct', section: 'arithmetic', title: 'Fraction ⇄ Decimal ⇄ Percent', icon: '🍕',
      learn: 'fractions', drill: 'fractions',
      searchTerms: ['fraction', 'decimal', 'percentage', 'percent', 'conversion'],
      /* The complete classic memorisation table (ADR-092: absorbed the Learn-hub static table — single source). */
      block: { kind: 'table', headers: ['Fraction', 'Decimal', 'Percent'], rows: [
        ['1/2', '0.5', '50%'], ['1/3', '0.333', '33.33%'], ['2/3', '0.667', '66.66%'],
        ['1/4', '0.25', '25%'], ['3/4', '0.75', '75%'],
        ['1/5', '0.2', '20%'], ['2/5', '0.4', '40%'], ['3/5', '0.6', '60%'], ['4/5', '0.8', '80%'],
        ['1/6', '0.1667', '16.67%'], ['5/6', '0.8333', '83.33%'],
        ['1/8', '0.125', '12.5%'], ['3/8', '0.375', '37.5%'], ['5/8', '0.625', '62.5%'], ['7/8', '0.875', '87.5%'],
        ['1/9', '0.111', '11.11%'], ['2/9', '0.222', '22.22%'], ['4/9', '0.444', '44.44%'],
        ['5/9', '0.555', '55.55%'], ['7/9', '0.777', '77.77%'], ['8/9', '0.888', '88.88%'],
        ['1/10', '0.1', '10%'],
        ['1/11', '0.0909', '9.09%'], ['2/11', '0.1818', '18.18%'], ['3/11', '0.2727', '27.27%'],
        ['5/11', '0.4545', '45.45%'], ['9/11', '0.8181', '81.81%'],
        ['1/12', '0.0833', '8.33%'], ['1/15', '0.0667', '6.66%'], ['1/20', '0.05', '5%'],
        ['1/25', '0.04', '4%'], ['1/40', '0.025', '2.5%'], ['1/50', '0.02', '2%']
      ] }
    },
    {
      id: 'mult-tricks', section: 'arithmetic', title: 'Multiplication Shortcuts', icon: '✖️',
      learn: 'multiplication', drill: 'multiplication',
      searchTerms: ['multiplication', 'shortcuts', 'tricks', 'speed maths', 'mental math'],
      block: { kind: 'table', headers: ['Multiply by', 'Shortcut'], rows: [
        ['× 5', '(n × 10) ÷ 2'],
        ['× 25', '(n × 100) ÷ 4'],
        ['× 50', '(n × 100) ÷ 2'],
        ['× 75', '(n × 300) ÷ 4'],
        ['× 125', '(n × 1000) ÷ 8'],
        ['× 9', '(n × 10) − n'],
        ['× 11', 'Add each adjacent digit pair inward'],
        ['× 15', '(n × 10) + (n × 5)']
      ] }
    },
    {
      id: 'speed-conv', section: 'arithmetic', title: 'Speed, Time & Distance', icon: '🚄',
      learn: 'time-speed-distance', drill: 'time-speed-distance',
      searchTerms: ['speed', 'time', 'distance', 'km/h', 'm/s', 'conversion', 'average speed'],
      block: { kind: 'table', headers: ['Need', 'Formula'], rows: [
        ['km/h → m/s', 'multiply by 5/18'],
        ['m/s → km/h', 'multiply by 18/5'],
        ['Speed', 'Distance ÷ Time'],
        ['Avg speed (equal distances)', '2ab ÷ (a + b)'],
        ['Relative (opposite)', 'add the speeds'],
        ['Relative (same direction)', 'subtract the speeds']
      ] }
    },
    {
      id: 'interest', section: 'arithmetic', title: 'Simple & Compound Interest', icon: '🏦',
      learn: 'compound-interest', drill: 'compound-interest',
      searchTerms: ['simple interest', 'compound interest', 'si', 'ci', 'amount', 'principal'],
      block: { kind: 'table', headers: ['Quantity', 'Formula'], rows: [
        ['Simple Interest', 'SI = P × R × T ÷ 100'],
        ['Amount (SI)', 'A = P + SI'],
        ['Compound Amount', 'A = P(1 + R/100)ᵀ'],
        ['Compound Interest', 'CI = A − P'],
        ['CI − SI (2 years)', 'P × (R/100)²'],
        ['Half-yearly', 'rate R/2, time 2T']
      ] }
    },
    {
      id: 'profit-pct', section: 'arithmetic', title: 'Profit, Loss & Percentage', icon: '💰',
      learn: 'percentages', drill: 'percentages',
      searchTerms: ['profit', 'loss', 'percentage', 'discount', 'markup', 'cost price', 'selling price'],
      block: { kind: 'table', headers: ['Quantity', 'Formula'], rows: [
        ['Profit %', '(SP − CP) ÷ CP × 100'],
        ['Loss %', '(CP − SP) ÷ CP × 100'],
        ['SP from CP', 'CP × (1 + Profit%/100)'],
        ['Discount %', '(MP − SP) ÷ MP × 100'],
        ['+x% then −x%', 'net change = −x²/100 %'],
        ['Successive % a, b', 'a + b + ab/100']
      ] }
    },

    /* ── Algebra ── */
    {
      id: 'algebra-identities', section: 'algebra', title: 'Algebraic Identities', icon: '🧮',
      learn: 'quadratic-equations', drill: 'quadratic-equations',
      searchTerms: ['algebra', 'identities', 'expansion', 'factorise', 'formula'],
      block: { kind: 'table', headers: ['Identity'], rows: [
        ['(a + b)² = a² + 2ab + b²'],
        ['(a − b)² = a² − 2ab + b²'],
        ['a² − b² = (a + b)(a − b)'],
        ['(a + b)³ = a³ + 3a²b + 3ab² + b³'],
        ['a³ + b³ = (a + b)(a² − ab + b²)'],
        ['a³ − b³ = (a − b)(a² + ab + b²)'],
        ['(a + b + c)² = a² + b² + c² + 2(ab + bc + ca)']
      ] }
    },
    {
      id: 'ap-gp', section: 'algebra', title: 'Progressions (AP & GP)', icon: '📶',
      learn: 'progressions', drill: 'progressions',
      searchTerms: ['ap', 'gp', 'progression', 'sequence', 'series', 'nth term', 'sum'],
      block: { kind: 'table', headers: ['', 'AP', 'GP'], rows: [
        ['Built by', 'add d', 'multiply by r'],
        ['nth term', 'a + (n−1)d', 'a·rⁿ⁻¹'],
        ['Sum of n', 'n/2 · (first + last)', 'a(rⁿ−1)/(r−1)'],
        ['Infinite sum', '—', 'a/(1−r), if |r| < 1']
      ] }
    },
    {
      id: 'log-rules', section: 'algebra', title: 'Logarithm Rules', icon: '📈',
      learn: 'logarithms', drill: 'logarithms',
      searchTerms: ['log', 'logarithm', 'rules', 'product rule', 'change of base'],
      block: { kind: 'table', headers: ['Rule', 'Identity'], rows: [
        ['Product', 'logₐ(xy) = logₐx + logₐy'],
        ['Quotient', 'logₐ(x/y) = logₐx − logₐy'],
        ['Power', 'logₐ(xᵏ) = k · logₐx'],
        ['Special', 'logₐa = 1,  logₐ1 = 0'],
        ['Change of base', 'logₐb = log b ÷ log a'],
        ['Inverse', 'a^(logₐx) = x']
      ] }
    },
    {
      id: 'surds-indices', section: 'algebra', title: 'Surds & Indices', icon: '√',
      learn: 'surds-indices', drill: 'surds-indices',
      searchTerms: ['surds', 'indices', 'exponents', 'powers', 'roots', 'index laws'],
      block: { kind: 'table', headers: ['Law', 'Rule'], rows: [
        ['Product', 'aᵐ · aⁿ = aᵐ⁺ⁿ'],
        ['Quotient', 'aᵐ ÷ aⁿ = aᵐ⁻ⁿ'],
        ['Power of power', '(aᵐ)ⁿ = aᵐⁿ'],
        ['Zero / negative', 'a⁰ = 1,  a⁻ⁿ = 1/aⁿ'],
        ['Fractional', 'a^(1/n) = ⁿ√a'],
        ['Surd product', '√a · √b = √(ab)']
      ] }
    },

    /* ── Geometry & Mensuration ── */
    {
      id: 'area-formulas', section: 'geometry', title: 'Area Formulas (2D)', icon: '⬜',
      learn: 'area', drill: 'area',
      searchTerms: ['area', 'mensuration', '2d', 'triangle', 'circle', 'rectangle', 'trapezium'],
      block: { kind: 'table', headers: ['Shape', 'Area'], rows: [
        ['Square', 'side²'],
        ['Rectangle', 'length × breadth'],
        ['Triangle', '½ × base × height'],
        ['Equilateral triangle', '(√3 / 4) × side²'],
        ['Circle', 'π r²'],
        ['Parallelogram', 'base × height'],
        ['Trapezium', '½ × (sum of parallel sides) × height'],
        ['Rhombus', '½ × d₁ × d₂']
      ] }
    },
    {
      id: 'volume-formulas', section: 'geometry', title: 'Volume & Surface (3D)', icon: '🧊',
      learn: 'volume', drill: 'volume',
      searchTerms: ['volume', 'surface area', '3d', 'cube', 'cylinder', 'sphere', 'cone', 'tsa'],
      block: { kind: 'table', headers: ['Solid', 'Volume', 'Surface'], rows: [
        ['Cube', 'a³', '6a²'],
        ['Cuboid', 'l·b·h', '2(lb + bh + hl)'],
        ['Cylinder', 'π r² h', '2π r(r + h)'],
        ['Sphere', '(4/3) π r³', '4π r²'],
        ['Cone', '(1/3) π r² h', 'π r(l + r)']
      ] }
    },
    {
      id: 'trig-values', section: 'geometry', title: 'Trig Standard Values', icon: '📐',
      learn: 'trigonometry', drill: 'trigonometry',
      searchTerms: ['trigonometry', 'trig', 'sin', 'cos', 'tan', 'standard angles', 'values'],
      block: { kind: 'table', headers: ['θ', 'sin', 'cos', 'tan'], rows: [
        ['0°', '0', '1', '0'],
        ['30°', '1/2', '√3/2', '1/√3'],
        ['45°', '1/√2', '1/√2', '1'],
        ['60°', '√3/2', '1/2', '√3'],
        ['90°', '1', '0', '∞']
      ] }
    },
    {
      id: 'trig-identities', section: 'geometry', title: 'Trig Identities', icon: '🌀',
      learn: 'trigonometry', drill: 'trigonometry',
      searchTerms: ['trigonometry', 'identities', 'pythagorean', 'sin cos tan', 'complementary'],
      block: { kind: 'table', headers: ['Identity'], rows: [
        ['sin²θ + cos²θ = 1'],
        ['1 + tan²θ = sec²θ'],
        ['1 + cot²θ = cosec²θ'],
        ['tanθ = sinθ ÷ cosθ'],
        ['sin(90° − θ) = cosθ'],
        ['cos(90° − θ) = sinθ']
      ] }
    },
    {
      id: 'coord-geo', section: 'geometry', title: 'Coordinate Geometry', icon: '📍',
      learn: 'coordinate-geometry-basics', drill: 'coordinate-geometry-basics',
      searchTerms: ['coordinate', 'geometry', 'distance', 'midpoint', 'slope', 'line'],
      block: { kind: 'table', headers: ['Find', 'Formula'], rows: [
        ['Distance', '√[(x₂−x₁)² + (y₂−y₁)²]'],
        ['Midpoint', '((x₁+x₂)/2, (y₁+y₂)/2)'],
        ['Slope', '(y₂−y₁) ÷ (x₂−x₁)'],
        ['Line', 'y = mx + c'],
        ['Parallel lines', 'equal slopes'],
        ['Perpendicular', 'm₁ · m₂ = −1']
      ] }
    },
    {
      id: 'geo-properties', section: 'geometry', title: 'Geometry Properties', icon: '📏',
      learn: 'geometry-basics', drill: 'geometry-basics',
      searchTerms: ['geometry', 'angles', 'triangle', 'polygon', 'pythagoras', 'properties'],
      block: { kind: 'table', headers: ['Property', 'Rule'], rows: [
        ['Triangle angles', 'sum = 180°'],
        ['Exterior angle', '= sum of two opposite interiors'],
        ['Pythagoras', 'a² + b² = c² (right triangle)'],
        ['Straight line / full turn', '180° / 360°'],
        ['Interior angles of n-gon', '(n − 2) × 180°'],
        ['Each exterior of regular n-gon', '360° ÷ n']
      ] }
    },

    /* ── Modern Math ── */
    {
      id: 'npr-ncr', section: 'modern', title: 'Permutation & Combination', icon: '🔀',
      learn: 'permutation-combination', drill: 'permutation-combination',
      searchTerms: ['permutation', 'combination', 'npr', 'ncr', 'factorial', 'arrangement', 'selection'],
      block: { kind: 'table', headers: ['Quantity', 'Formula'], rows: [
        ['Permutation (order matters)', 'nPr = n! ÷ (n − r)!'],
        ['Combination (order ignored)', 'nCr = n! ÷ [r!(n − r)!]'],
        ['Symmetry', 'nCr = nC(n − r)'],
        ['Bridge', 'nPr = nCr × r!'],
        ['Edge cases', 'nC0 = nCn = 1'],
        ['Circular arrangement', '(n − 1)!']
      ] }
    },
    {
      id: 'probability', section: 'modern', title: 'Probability Basics', icon: '🎲',
      learn: 'probability', drill: 'probability',
      searchTerms: ['probability', 'chance', 'dice', 'cards', 'complement', 'independent'],
      block: { kind: 'table', headers: ['Rule', 'Formula'], rows: [
        ['Probability', 'favourable ÷ total outcomes'],
        ['Range', '0 ≤ P(E) ≤ 1'],
        ['Complement', 'P(not E) = 1 − P(E)'],
        ['Either (A or B)', 'P(A) + P(B) − P(A ∩ B)'],
        ['Independent (A and B)', 'P(A) × P(B)'],
        ['Counts', 'die → 6, two dice → 36, deck → 52']
      ] }
    }
  ];

  var API = { SECTIONS: SECTIONS, CARDS: CARDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QR_QUICKREF = API;
  if (typeof root !== 'undefined' && root) root.QR_QUICKREF = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
