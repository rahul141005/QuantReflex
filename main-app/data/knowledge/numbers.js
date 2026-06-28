/**
 * data/knowledge/numbers.js — "Numbers" category knowledge objects (ADR-069, Phase 3 gold-standard content).
 * Original exam-grade explanations; organisation inspired by the standard speed-maths cheat sheets. No filler.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'number-system', title: 'Number System', icon: '🔢', category: 'numbers',
      difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: null, syllabusTopicId: null, revisionIntervalDays: 3,
      related: ['simplification', 'ratio-proportion', 'percentages'],
      searchTerms: ['hcf', 'lcm', 'gcd', 'prime', 'factors', 'divisibility', 'remainder', 'cyclicity', 'unit digit', 'composite', 'co-prime', 'integers'],
      sections: [
        { type: 'overview', text: 'The number system is the grammar of quantitative aptitude. Master the families of numbers, factors & multiples (HCF/LCM), divisibility rules, remainders and last-digit cyclicity, and a huge share of arithmetic, DI and simplification becomes mental.' },
        { type: 'concept', title: 'Families of numbers', body: 'Natural (1,2,3…) ⊂ Whole (0,1,2…) ⊂ Integers (…−2,−1,0,1,2…) ⊂ Rational (any a/b, b≠0) ⊂ Real. Irrationals (√2, π) are real but not rational. Prime = exactly two factors (1 and itself); composite = more than two; 1 is neither.' },
        { type: 'concept', title: 'Factors, multiples, HCF & LCM', body: 'Write a number as primes: n = p^a · q^b · r^c. HCF (greatest common divisor) takes the LOWEST power of each shared prime; LCM (least common multiple) takes the HIGHEST power of every prime. For exactly two numbers, HCF × LCM = product of the numbers.' },
        { type: 'formula', items: [
          { name: 'Number of factors', expr: 'If n = pᵃ · qᵇ · rᶜ, total factors = (a+1)(b+1)(c+1)', when: 'Counting divisors — e.g. 72 = 2³·3² → (3+1)(2+1) = 12 factors.' },
          { name: 'HCF × LCM (two numbers)', expr: 'HCF × LCM = first × second', when: 'Three of the four are known. Valid for exactly two numbers only.', trap: 'It does NOT hold for three or more numbers.' },
          { name: 'Remainder (modular) form', expr: 'Dividend = Divisor × Quotient + Remainder  (0 ≤ Remainder < Divisor)', when: 'Any division/remainder problem; reduce the base mod the divisor first.' },
          { name: 'Sum of first n naturals', expr: '1 + 2 + … + n = n(n+1)/2', when: 'Series and counting shortcuts.' }
        ] },
        { type: 'trick', title: 'Divisibility rules (no long division)', items: [
          '2 → last digit even.  4 → last TWO digits divisible by 4.  8 → last THREE digits by 8.',
          '3 → digit sum divisible by 3.  9 → digit sum divisible by 9.',
          '5 → ends in 0 or 5.  6 → divisible by 2 AND 3.',
          '11 → (sum of digits in odd places − sum in even places) is 0 or a multiple of 11.'
        ] },
        { type: 'trick', title: 'Last digit by cyclicity', items: [
          'Unit digits repeat in a cycle of at most 4: 2→(2,4,8,6), 3→(3,9,7,1), 7→(7,9,3,1), 8→(8,4,2,6).',
          '0,1,5,6 always end in themselves; 4→(4,6) and 9→(9,1) cycle every 2.',
          'To get the last digit of a^n, divide n by the cycle length and use the remainder (a remainder of 0 means the LAST digit of the cycle).'
        ] },
        { type: 'example', problem: 'Find the last digit of 7¹⁰¹.', steps: [
          '7 cycles every 4: 7, 9, 3, 1.',
          '101 ÷ 4 leaves remainder 1.',
          'Remainder 1 → the 1st digit of the cycle.'
        ], answer: '7' },
        { type: 'example', problem: 'Two numbers have HCF 6 and LCM 36. One number is 12. Find the other.', steps: [
          'HCF × LCM = product → 6 × 36 = 216.',
          'Other = 216 ÷ 12 = 18.',
          'Check: 12 = 6·2, 18 = 6·3, HCF = 6, LCM = 36. ✓'
        ], answer: '18' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Treating 1 as prime — it is neither prime nor composite.',
          'Using HCF × LCM = product for THREE numbers (only valid for two).',
          'Forgetting to reduce the base modulo the divisor before finding a remainder.',
          'Mixing the divisibility rules for 4 (last two digits) and 8 (last three digits).'
        ] },
        { type: 'memory', text: 'Smallest prime = 2 (also the only even prime); smallest composite = 4; smallest whole number = 0; smallest natural = 1.' },
        { type: 'revision', points: [
          'Factors of pᵃqᵇ = (a+1)(b+1); HCF takes lowest powers, LCM the highest.',
          'HCF × LCM = product (two numbers only).',
          'Divisibility: 3/9 by digit sum, 4 by last 2 digits, 8 by last 3, 11 by alternating sum.',
          'Last digit → cyclicity of 4; reduce the exponent mod the cycle length.'
        ] }
      ]
    },
    {
      id: 'simplification', title: 'Simplification', icon: '🧩', category: 'numbers',
      difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: 'simplification', syllabusTopicId: null, revisionIntervalDays: 3,
      related: ['number-system', 'percentages', 'averages'],
      searchTerms: ['bodmas', 'vbodmas', 'order of operations', 'identities', 'approximation', 'fraction percent', 'a2-b2'],
      sections: [
        { type: 'overview', text: 'Simplification is pure speed: evaluate an expression in the right order, replace ugly fractions with their percentage equivalents, and use algebraic identities so you never multiply the long way. In banking and SSC this is free marks — if you are fast and clean.' },
        { type: 'concept', title: 'The order: VBODMAS', body: 'Resolve in order — Vinculum (bar/brackets within), Brackets ( ) { } [ ], Of, Division, Multiplication, Addition, Subtraction. "Of" means multiply but is done before ÷ and ×. Division and multiplication rank equally — work left to right; likewise addition and subtraction.' },
        { type: 'concept', title: 'Think in percentages, not fractions', body: 'Memorising the fraction↔percent table turns "37.5% of 256" into "3/8 of 256 = 96" instantly. Convert the messy decimal to its clean fraction (or vice-versa) before you compute.' },
        { type: 'formula', items: [
          { name: 'Square of a sum/difference', expr: '(a ± b)² = a² ± 2ab + b²', when: 'Squaring numbers near a round base, e.g. 103² = 100² + 2·100·3 + 3² = 10609.' },
          { name: 'Difference of squares', expr: 'a² − b² = (a + b)(a − b)', when: 'e.g. 53² − 47² = (100)(6) = 600 — no squaring needed.' },
          { name: 'Sum/difference of cubes', expr: 'a³ ± b³ = (a ± b)(a² ∓ ab + b²)', when: 'Factorising cube expressions.' },
          { name: 'Cube of a sum', expr: '(a + b)³ = a³ + b³ + 3ab(a + b)', when: 'Expanding cubes quickly.' }
        ] },
        { type: 'trick', title: 'Multiplication shortcuts', items: [
          '× 5 → ×10 then ÷2.  × 25 → ×100 then ÷4.  × 125 → ×1000 then ÷8.',
          '× 11 (2-digit n) → write the digits with their sum between them: 35×11 = 3_(3+5)_5 = 385.',
          'Squares ending in 5: n5² = n(n+1) followed by 25, e.g. 65² = 6·7 | 25 = 4225.'
        ] },
        { type: 'example', problem: 'Simplify 12 + 6 × (5 − 3)² ÷ 4.', steps: [
          'Brackets: 5 − 3 = 2.',
          'Power: 2² = 4.',
          'Division & multiplication (left→right): 6 × 4 = 24, then 24 ÷ 4 = 6.',
          'Addition: 12 + 6 = 18.'
        ], answer: '18' },
        { type: 'example', problem: 'Evaluate 88² − 12² fast.', steps: [
          'a² − b² = (a+b)(a−b).',
          '(88 + 12)(88 − 12) = 100 × 76.'
        ], answer: '7600' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Doing addition before division/multiplication — VBODMAS, always.',
          'Treating "of" as ordinary multiplication done at the × stage (it comes first).',
          'Sign slips when removing a bracket preceded by a minus: a − (b − c) = a − b + c.',
          'Approximating too early and losing the answer\'s closest option.'
        ] },
        { type: 'memory', text: 'V-BODMAS: Vinculum, Brackets, Of, Division, Multiplication, Addition, Subtraction — top to bottom.' },
        { type: 'revision', points: [
          'Evaluate strictly in VBODMAS order; ×/÷ and +/− each go left-to-right.',
          'a² − b² = (a+b)(a−b); (a±b)² = a² ± 2ab + b².',
          '×5 = ×10÷2, ×25 = ×100÷4, ×125 = ×1000÷8.',
          'Swap ugly decimals for clean fractions (37.5% = 3/8) before computing.'
        ] }
      ]
    },
    {
      id: 'number-series', title: 'Number Series', icon: '➿', category: 'numbers',
      difficulty: 'core', examFrequency: 'high', status: 'scaffold',
      drillCategory: 'number-series', syllabusTopicId: null, revisionIntervalDays: 5,
      related: ['number-system'], searchTerms: ['series', 'sequence', 'missing number', 'wrong term'],
      sections: []
    }
  ];

  KB.registerAll('numbers', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
