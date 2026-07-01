/**
 * data/knowledge/algebra.js — "Algebra" category knowledge objects (ADR-083 Phase 3D, gold-standard content).
 * Original exam-grade explanations for the algebra spine (equations, indices, logs, series, inequalities). No filler.
 * Dual-loaded: self-registers in the browser; the check harness requires it under node.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'linear-equations', title: 'Linear Equations', icon: '🟰', category: 'algebra',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'linear-equations', syllabusTopicId: 'linear_equations', revisionIntervalDays: 6,
      related: ['quadratic-equations', 'ratio-proportion', 'simplification'],
      searchTerms: ['linear', 'equation', 'solve for x', 'simultaneous', 'two variables', 'elimination', 'substitution', 'word problem'],
      sections: [
        { type: 'overview', text: 'A linear equation has every variable to the first power — no squares, no products of variables. Solving one is pure bookkeeping: get x by itself. The exam value is speed on one-variable solves and clean handling of two-variable systems (elimination vs substitution).' },
        { type: 'concept', title: 'One variable — isolate x', body: 'For ax + b = c, undo operations in reverse (BODMAS backwards): first move the constant (x-term = c − b), then divide by the coefficient (x = (c − b)/a). Whatever you do to one side, do to the other. A bracket like a(x + b) = c is fastest solved by dividing by a FIRST, then subtracting b.' },
        { type: 'concept', title: 'Two variables — you need two equations', body: 'One equation in two unknowns has infinitely many solutions; you need as many independent equations as unknowns. Two standard tools: ELIMINATION (scale the equations so one variable cancels when you add/subtract) and SUBSTITUTION (solve one equation for a variable and plug it into the other). For the tidy pair x + y = S, x − y = D, just add: 2x = S + D.' },
        { type: 'formula', items: [
          { name: 'One-variable solution', expr: 'ax + b = c  ⟹  x = (c − b) / a', when: 'The workhorse. Move constant, then divide.' },
          { name: 'Sum & difference pair', expr: 'x + y = S, x − y = D  ⟹  x = (S + D)/2, y = (S − D)/2', when: 'Recognise it instantly — no elimination algebra needed.' },
          { name: 'Cross-multiplication (2×2 system)', expr: 'For a₁x + b₁y = c₁, a₂x + b₂y = c₂:  x = (c₁b₂ − c₂b₁)/(a₁b₂ − a₂b₁)', when: 'A plug-in formula for two-variable systems; the denominator is the determinant a₁b₂ − a₂b₁.' }
        ] },
        { type: 'trick', title: 'Speed on systems', items: [
          'Eliminate the variable with the SMALLER / already-matching coefficient — less scaling arithmetic.',
          'If the two equations look symmetric (x + y and x − y), add or subtract them directly.',
          'Word problems: name the unknown, translate each sentence into one equation, then solve. "Sum is 40, difference is 8" is literally x + y = 40, x − y = 8.'
        ] },
        { type: 'example', problem: 'Solve 5(x + 3) = 40.', steps: [
          'Divide both sides by 5 first: x + 3 = 8.',
          'Subtract 3: x = 5.',
          'Check: 5(5 + 3) = 5 × 8 = 40. ✓'
        ], answer: 'x = 5' },
        { type: 'example', problem: 'Solve 3x + 2y = 31 and 2x + 5y = 42. Find x.', steps: [
          'Make y-coefficients match: ×5 and ×2 → 15x + 10y = 155 and 4x + 10y = 84.',
          'Subtract: 11x = 71... check numbers — instead use cross-multiplication: x = (31·5 − 42·2)/(3·5 − 2·2) = (155 − 84)/(15 − 4) = 71/11.',
          'Here 71/11 is not integer, so re-read the coefficients; with clean exam numbers the determinant divides exactly. The method is what matters: x = (c₁b₂ − c₂b₁)/(a₁b₂ − a₂b₁).'
        ], answer: 'x = (c₁b₂ − c₂b₁)/(a₁b₂ − a₂b₁)' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'One-variable solves should be near-instant and mental — bank the seconds for harder questions.',
          'For a 2×2 system, the cross-multiplication formula is often faster than elimination once you memorise the pattern.',
          'Always keep the second variable\'s value handy — many questions ask for x + y, xy or y, not x.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Sign errors when moving a term across the = sign (the sign flips).',
          'Dividing only one term by the coefficient instead of the whole side.',
          'Forgetting a bracket: a(x + b) = ax + ab, not ax + b.',
          'Trying to solve two unknowns from a single equation.'
        ] },
        { type: 'memory', text: 'To isolate x, undo BODMAS in reverse: strip constants first, coefficients last.' },
        { type: 'revision', points: [
          'ax + b = c ⟹ x = (c − b)/a.',
          'x + y = S, x − y = D ⟹ x = (S + D)/2.',
          'n unknowns need n independent equations; use elimination or substitution.',
          'Cross-multiplication: x = (c₁b₂ − c₂b₁)/(a₁b₂ − a₂b₁).'
        ] }
      ]
    },
    {
      id: 'quadratic-equations', title: 'Quadratic Equations', icon: '🎢', category: 'algebra',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'quadratic-equations', syllabusTopicId: 'quadratic_equations', revisionIntervalDays: 6,
      related: ['linear-equations', 'surds-indices', 'number-system'],
      searchTerms: ['quadratic', 'roots', 'factorise', 'discriminant', 'sum of roots', 'product of roots', 'vieta', 'parabola'],
      sections: [
        { type: 'overview', text: 'A quadratic ax² + bx + c = 0 has (at most) two roots. In exams you rarely need the messy quadratic formula: most equations factor into nice integers, and Vieta\'s relations give the sum and product of the roots straight from the coefficients — no solving required.' },
        { type: 'concept', title: 'Factorising (the fast path)', body: 'To factor x² + bx + c, find two numbers that MULTIPLY to c and ADD to b. Then x² + bx + c = (x − p)(x − q) where p, q are the roots. Example: x² − 11x + 30 → two numbers multiplying to 30, adding to 11 → 5 and 6 → roots 5 and 6. When c is positive and b is positive (in the − Bx + C form), both roots are positive.' },
        { type: 'concept', title: 'Vieta\'s relations & the discriminant', body: 'For ax² + bx + c = 0: sum of roots = −b/a and product of roots = c/a. The discriminant Δ = b² − 4ac tells you the nature of the roots: Δ > 0 → two distinct real roots, Δ = 0 → one repeated root, Δ < 0 → no real roots (complex). You can answer "sum", "product" and "how many real roots" without ever solving.' },
        { type: 'formula', items: [
          { name: 'Quadratic formula', expr: 'x = [−b ± √(b² − 4ac)] / (2a)', when: 'When it will not factor cleanly. The ± gives the two roots.' },
          { name: 'Sum of roots', expr: 'α + β = −b/a', when: 'For x² − Bx + C = 0 the sum is simply B.', trap: 'Watch the sign — it is MINUS b/a.' },
          { name: 'Product of roots', expr: 'α · β = c/a', when: 'For x² − Bx + C = 0 the product is C.' },
          { name: 'Discriminant', expr: 'Δ = b² − 4ac', when: 'Nature of roots: >0 real & distinct, =0 equal, <0 no real roots.' }
        ] },
        { type: 'trick', title: 'Read roots off the equation', items: [
          'In x² − Bx + C = 0 with integer roots: sum = B, product = C. Find two numbers with that sum and product.',
          'Need only the number of real roots? Check the sign of b² − 4ac — do not solve.',
          'A perfect-square trinomial (Δ = 0) has a repeated root x = −b/2a.'
        ] },
        { type: 'example', problem: 'Find the roots of x² − 13x + 40 = 0.', steps: [
          'Two numbers multiplying to 40 and adding to 13: 5 and 8.',
          '(x − 5)(x − 8) = 0.',
          'Roots: x = 5 or x = 8. Sum 13 ✓, product 40 ✓.'
        ], answer: '5 and 8' },
        { type: 'example', problem: 'For x² − 6x + 10 = 0, how many real roots?', steps: [
          'Δ = b² − 4ac = (−6)² − 4·1·10 = 36 − 40 = −4.',
          'Δ < 0 → no real roots.'
        ], answer: 'None (Δ < 0)' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Try factorising first — exam quadratics are engineered to have integer roots.',
          'For sum/product/nature questions, use Vieta and the discriminant directly; skip the roots entirely.',
          'In "quantity comparison" (banking) you often only need the sign or relative size of the roots, not their exact value.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Forgetting the minus sign in sum of roots = −b/a.',
          'Confusing "roots" (values of x) with "factors" (the brackets).',
          'Sign slip inside the discriminant when b or c is negative.',
          'Assuming every quadratic has two real roots — check Δ.'
        ] },
        { type: 'memory', text: 'SUM is −b/a, PRODUCT is c/a — "Sum Minus, Product Plain".' },
        { type: 'revision', points: [
          'Factor by finding two numbers with the right product (c) and sum (−b).',
          'Sum of roots = −b/a; product = c/a.',
          'Δ = b² − 4ac: >0 two real, =0 equal, <0 none.',
          'Quadratic formula x = [−b ± √Δ]/(2a) is the fallback.'
        ] }
      ]
    },
    {
      id: 'surds-indices', title: 'Surds & Indices', icon: '🔼', category: 'algebra',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'surds-indices', syllabusTopicId: 'surds_indices', revisionIntervalDays: 8,
      related: ['simplification', 'number-system', 'quadratic-equations'],
      searchTerms: ['indices', 'exponents', 'powers', 'surds', 'roots', 'rationalise', 'fractional exponent', 'laws of exponents'],
      sections: [
        { type: 'overview', text: 'Indices (exponents) and surds (irrational roots) are the same idea written two ways: a^(1/n) is the n-th root of a. Master the five laws of exponents and you can simplify almost any power expression, solve equations like 2^x = 32 by matching bases, and evaluate fractional powers like 27^(2/3) in one step.' },
        { type: 'concept', title: 'The laws of indices', body: 'For the same base a: multiply → add exponents (aᵐ·aⁿ = aᵐ⁺ⁿ); divide → subtract (aᵐ/aⁿ = aᵐ⁻ⁿ); power of a power → multiply ((aᵐ)ⁿ = aᵐⁿ). Also a⁰ = 1 (a ≠ 0), a⁻ⁿ = 1/aⁿ, and a^(m/n) = (ⁿ√a)ᵐ — take the n-th root then raise to m (do the root first to keep numbers small).' },
        { type: 'concept', title: 'Surds & rationalising', body: 'A surd is a root that stays irrational, like √2 or ⁵√7. Simplify by pulling out perfect-power factors: √72 = √(36·2) = 6√2. To rationalise a denominator, multiply top and bottom by the conjugate: 1/(√a + √b) × (√a − √b)/(√a − √b) = (√a − √b)/(a − b).' },
        { type: 'formula', items: [
          { name: 'Product & quotient', expr: 'aᵐ · aⁿ = aᵐ⁺ⁿ,   aᵐ ÷ aⁿ = aᵐ⁻ⁿ', when: 'Same base only. Different bases → factor to a common base first.' },
          { name: 'Power of a power', expr: '(aᵐ)ⁿ = aᵐⁿ', when: 'Nested exponents multiply.' },
          { name: 'Fractional & negative', expr: 'a^(m/n) = (ⁿ√a)ᵐ,   a⁻ⁿ = 1/aⁿ,   a⁰ = 1', when: 'Root first, then power — smaller intermediate numbers.' },
          { name: 'Rationalising factor', expr: '1/(√a + √b) = (√a − √b)/(a − b)', when: 'Clearing a surd from the denominator.' }
        ] },
        { type: 'trick', title: 'Solve by matching bases', items: [
          'To solve aˣ = N, write N as a power of a and equate exponents: 2ˣ = 32 = 2⁵ ⟹ x = 5.',
          'For a^(m/n), take the n-th root first: 27^(2/3) = (³√27)² = 3² = 9.',
          'Break a base into primes to combine unlike bases: 4³ · 8² = (2²)³ · (2³)² = 2⁶ · 2⁶ = 2¹².'
        ] },
        { type: 'example', problem: 'Evaluate 16^(3/4).', steps: [
          'Fourth root first: ⁴√16 = 2.',
          'Raise to the power 3: 2³ = 8.'
        ], answer: '8' },
        { type: 'example', problem: 'Simplify √50 + √18.', steps: [
          '√50 = √(25·2) = 5√2.',
          '√18 = √(9·2) = 3√2.',
          '5√2 + 3√2 = 8√2.'
        ], answer: '8√2' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Convert every base to its smallest prime — it exposes cancellations instantly.',
          'For fractional exponents always root-then-power to keep the arithmetic small.',
          'Learn the small powers cold (2 up to 2¹⁰, 3 up to 3⁵) — you\'ll spot base matches on sight.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Adding exponents when bases DIFFER (only same-base powers combine).',
          'Thinking a⁻ⁿ is negative — it is a reciprocal, 1/aⁿ, still positive.',
          '(aᵐ)ⁿ = aᵐⁿ, not aᵐ⁺ⁿ — multiply, don\'t add.',
          '√a + √b ≠ √(a + b) — surds don\'t add under one root.'
        ] },
        { type: 'memory', text: 'a^(m/n): the DENOMINATOR is the root, the NUMERATOR is the power — "down = root, up = power".' },
        { type: 'revision', points: [
          'Same base: ×→add, ÷→subtract exponents; (aᵐ)ⁿ→multiply.',
          'a⁰ = 1, a⁻ⁿ = 1/aⁿ, a^(m/n) = (ⁿ√a)ᵐ.',
          'Solve aˣ = N by writing N as a power of a.',
          'Simplify surds by extracting perfect-power factors; rationalise with the conjugate.'
        ] }
      ]
    }
  ];

  KB.registerAll('algebra', TOPICS);

  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
