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
    },
    {
      id: 'logarithms', title: 'Logarithms', icon: '🪜', category: 'algebra',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'logarithms', syllabusTopicId: 'logarithms', revisionIntervalDays: 8,
      related: ['surds-indices', 'simplification', 'number-system'],
      searchTerms: ['logarithm', 'log', 'base', 'ln', 'log rules', 'change of base', 'exponent', 'antilog'],
      sections: [
        { type: 'overview', text: 'A logarithm just asks "what power?" — logₐN is the exponent you raise a to, to get N. It is the exact inverse of indices, so every index law has a matching log law. Exam logs are almost always designed to come out as whole numbers.' },
        { type: 'concept', title: 'The definition (read it backwards)', body: 'logₐN = x  ⟺  aˣ = N. So log₂8 = 3 because 2³ = 8; log₁₀1000 = 3 because 10³ = 1000. The base a must be positive and ≠ 1, and N must be positive (you can\'t log zero or a negative). "log" with no base written means base 10; "ln" means base e.' },
        { type: 'concept', title: 'The three working rules', body: 'They mirror the index laws: PRODUCT logₐ(xy) = logₐx + logₐy; QUOTIENT logₐ(x/y) = logₐx − logₐy; POWER logₐ(xᵏ) = k·logₐx. Two anchors: logₐ1 = 0 (anything⁰ = 1) and logₐa = 1. To switch bases, use change of base: logₐN = logN / loga.' },
        { type: 'formula', items: [
          { name: 'Definition', expr: 'logₐN = x ⟺ aˣ = N', when: 'Convert between log and index form — the key first move.' },
          { name: 'Product & quotient', expr: 'logₐ(xy) = logₐx + logₐy;  logₐ(x/y) = logₐx − logₐy', when: 'Break a big log into a sum/difference of small ones.' },
          { name: 'Power rule', expr: 'logₐ(xᵏ) = k · logₐx', when: 'Pull an exponent out in front.' },
          { name: 'Change of base', expr: 'logₐN = log_c N / log_c a', when: 'Compute or compare logs with different bases.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'To evaluate logₐN, ask "a to what power is N?" — write N as a power of a.',
          'Adding two same-base logs? Multiply the insides: log₂4 + log₂8 = log₂32 = 5.',
          'A coefficient in front of a log is a hidden power: 2·log₃3 = log₃(3²) = log₃9 = 2.'
        ] },
        { type: 'example', problem: 'Evaluate log₅125 + log₅25.', steps: [
          'log₅125 = 3 (5³ = 125); log₅25 = 2 (5² = 25).',
          'Sum = 3 + 2 = 5.',
          'Check via product rule: log₅(125·25) = log₅3125 = log₅5⁵ = 5. ✓'
        ], answer: '5' },
        { type: 'example', problem: 'If log₃x = 4, find x.', steps: [
          'Convert to index form: x = 3⁴.',
          'x = 81.'
        ], answer: '81' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Always convert logₐN = x to aˣ = N immediately — most log questions dissolve once written as indices.',
          'Combine logs with the product/quotient rules BEFORE evaluating; it keeps the numbers tiny.',
          'Memorise powers of 2, 3, 5 and 10 so you can read a log off by sight.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'logₐ(x + y) is NOT logₐx + logₐy — the sum rule is for products, not sums.',
          'log of a negative number or zero is undefined.',
          '(logₐx)ᵏ ≠ k·logₐx — the power rule needs the exponent INSIDE the log.',
          'Forgetting that a plain "log" means base 10.'
        ] },
        { type: 'memory', text: '"Log is the power." logₐN literally answers: a to what power gives N?' },
        { type: 'revision', points: [
          'logₐN = x ⟺ aˣ = N; logₐ1 = 0, logₐa = 1.',
          'Product → add logs; quotient → subtract; power → coefficient out front.',
          'Change of base: logₐN = logN / loga.',
          'log(sum) ≠ sum of logs — the rule is for products.'
        ] }
      ]
    },
    {
      id: 'progressions', title: 'Progressions (AP & GP)', icon: '📶', category: 'algebra',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'progressions', syllabusTopicId: 'progressions', revisionIntervalDays: 7,
      related: ['number-series', 'averages', 'linear-equations'],
      searchTerms: ['progression', 'sequence', 'series', 'ap', 'gp', 'arithmetic progression', 'geometric progression', 'nth term', 'sum of terms', 'common difference', 'common ratio'],
      sections: [
        { type: 'overview', text: 'A progression is a sequence built by a fixed rule. In an AP you ADD a constant (the common difference d); in a GP you MULTIPLY by a constant (the common ratio r). Learn the nth-term and sum formulas for both and you can answer almost any series question in one line.' },
        { type: 'concept', title: 'Arithmetic Progression (AP)', body: 'Each term = previous + d. Terms: a, a+d, a+2d, … The nth term is aₙ = a + (n − 1)d. The sum of the first n terms is Sₙ = n/2·[2a + (n − 1)d], which is also n × (average of first and last term) = n/2·(first + last). The middle term of an odd-length AP equals the average of the whole AP.' },
        { type: 'concept', title: 'Geometric Progression (GP)', body: 'Each term = previous × r. Terms: a, ar, ar², … The nth term is aₙ = a·rⁿ⁻¹. The sum of the first n terms is Sₙ = a(rⁿ − 1)/(r − 1) for r ≠ 1. If |r| < 1, the infinite sum converges to S∞ = a/(1 − r).' },
        { type: 'formula', items: [
          { name: 'AP nth term', expr: 'aₙ = a + (n − 1)d', when: 'Any "find the kth term" AP question.' },
          { name: 'AP sum', expr: 'Sₙ = n/2·[2a + (n − 1)d] = n/2·(first + last)', when: 'Summing a run of AP terms.' },
          { name: 'GP nth term', expr: 'aₙ = a·rⁿ⁻¹', when: 'Doubling/tripling patterns; the exponent is n − 1, not n.' },
          { name: 'GP sum (finite / infinite)', expr: 'Sₙ = a(rⁿ − 1)/(r − 1);  S∞ = a/(1 − r) for |r| < 1', when: 'Finite sum, or an infinite GP that shrinks.' }
        ] },
        { type: 'table', caption: 'AP vs GP at a glance', headers: ['', 'AP', 'GP'], rows: [
          ['Built by', 'adding d', 'multiplying by r'],
          ['nth term', 'a + (n−1)d', 'a·rⁿ⁻¹'],
          ['Sum of n', 'n/2·(first + last)', 'a(rⁿ−1)/(r−1)'],
          ['Infinite sum', '—', 'a/(1−r), if |r| < 1']
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'AP sum = number of terms × average term. For 1..100: 100 × 50.5 = 5050.',
          'The exponent in a GP term is (n − 1) — the first term uses r⁰ = 1. Off-by-one here is the #1 slip.',
          'Three terms in AP? Call them a−d, a, a+d so they sum to 3a. In GP, use a/r, a, ar.'
        ] },
        { type: 'example', problem: 'Find the sum of the first 20 terms of an AP with first term 3 and common difference 4.', steps: [
          'Sₙ = n/2·[2a + (n − 1)d] = 20/2·[2·3 + 19·4].',
          '= 10·[6 + 76] = 10·82.',
          '= 820.'
        ], answer: '820' },
        { type: 'example', problem: 'Find the 6th term of a GP with first term 2 and common ratio 3.', steps: [
          'aₙ = a·rⁿ⁻¹ = 2·3⁶⁻¹ = 2·3⁵.',
          '= 2·243 = 486.'
        ], answer: '486' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Decide AP or GP first — difference constant → AP, ratio constant → GP.',
          'For AP sums, "n × average" is faster and less error-prone than the bracket formula.',
          'Watch the GP exponent (n − 1) and, for infinite GPs, confirm |r| < 1 before using a/(1 − r).'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Using rⁿ instead of rⁿ⁻¹ for the nth GP term.',
          'Applying S∞ = a/(1 − r) when |r| ≥ 1 (it diverges).',
          'Forgetting the ÷2 in the AP sum formula.',
          'Confusing common difference (AP, added) with common ratio (GP, multiplied).'
        ] },
        { type: 'memory', text: 'AP ADDS d, GP multiplies by r. Sum of an AP = "how many × the average".' },
        { type: 'revision', points: [
          'AP: aₙ = a + (n−1)d; Sₙ = n/2·(first + last).',
          'GP: aₙ = a·rⁿ⁻¹; Sₙ = a(rⁿ−1)/(r−1).',
          'Infinite GP: S∞ = a/(1−r), only when |r| < 1.',
          'The GP term exponent is n − 1 — mind the off-by-one.'
        ] }
      ]
    },
    {
      id: 'inequalities-modulus', title: 'Inequalities & Modulus', icon: '🎚️', category: 'algebra',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'inequalities-modulus', syllabusTopicId: 'inequalities_modulus', revisionIntervalDays: 8,
      related: ['linear-equations', 'quadratic-equations', 'number-system'],
      searchTerms: ['inequality', 'inequalities', 'modulus', 'absolute value', 'greater than', 'less than', 'number line', 'range', 'integer solutions'],
      sections: [
        { type: 'overview', text: 'Inequalities are solved almost exactly like equations — with ONE rule that changes everything: multiplying or dividing by a negative flips the sign. Modulus (absolute value) |x| measures distance from zero, so a modulus statement always splits into two cases or a range on the number line.' },
        { type: 'concept', title: 'Solving linear inequalities', body: 'Add, subtract, multiply and divide just like an equation to isolate x — EXCEPT when you multiply or divide both sides by a negative number, reverse the inequality sign (> becomes <). "Smallest integer x with 3x + 7 > 25" → 3x > 18 → x > 6 → smallest integer is 7. Note x > 6 excludes 6 itself (strict), so the smallest integer is 7, not 6.' },
        { type: 'concept', title: 'Modulus — distance from zero', body: '|x| is how far x is from 0, always ≥ 0. So |x − a| is the distance between x and a. |x − a| = b means x is exactly b away: x = a + b or x = a − b (two solutions). |x − a| < b means x is within b of a: a − b < x < a + b (a range). |x − a| > b means x is outside that band.' },
        { type: 'formula', items: [
          { name: 'Sign-flip rule', expr: 'Multiply/divide an inequality by a negative ⟹ flip < to > (and vice-versa)', when: 'The single most-tested idea. Never forget it.' },
          { name: 'Modulus equation', expr: '|x − a| = b ⟹ x = a + b or x = a − b', when: 'Two discrete solutions.' },
          { name: 'Modulus inequality (bounded)', expr: '|x − a| < b ⟹ a − b < x < a + b', when: 'A single interval; ≤ makes the ends inclusive.' },
          { name: 'Integer count in a range', expr: 'Integers in [a, b] = b − a + 1', when: 'Counting solutions; |x − a| < b (strict) gives 2b − 1 integers, ≤ gives 2b + 1.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'Sketch a number line for any modulus question — the two cases or the band become obvious.',
          'Integers strictly inside |x − a| < b span 2b − 1 values; inclusive (≤) span 2b + 1.',
          'For "smallest/largest integer" answers, solve the inequality first, then step to the nearest integer ON the allowed side.'
        ] },
        { type: 'example', problem: 'How many integers satisfy |x − 10| < 4?', steps: [
          'Rewrite as a band: 10 − 4 < x < 10 + 4, i.e. 6 < x < 14.',
          'Integers strictly between 6 and 14: 7, 8, 9, 10, 11, 12, 13.',
          'That is 7 values (= 2·4 − 1).'
        ], answer: '7' },
        { type: 'example', problem: 'Solve −2x + 5 < 11.', steps: [
          'Subtract 5: −2x < 6.',
          'Divide by −2 and FLIP the sign: x > −3.'
        ], answer: 'x > −3' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'The instant you divide by a negative, flip the sign — the classic trap tests exactly this.',
          'Translate modulus to a range or two cases before doing anything else.',
          'Count integer solutions with b − a + 1 (inclusive) rather than listing them out.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Forgetting to flip the sign when multiplying/dividing by a negative.',
          'Treating |x − a| = b as a single solution instead of two.',
          'Off-by-one when counting integers (strict < vs inclusive ≤).',
          'Assuming |x| can be negative — it never is.'
        ] },
        { type: 'memory', text: 'Modulus = distance from zero. Divide by a negative ⟹ the inequality flips.' },
        { type: 'revision', points: [
          'Solve inequalities like equations; flip the sign on ×/÷ by a negative.',
          '|x − a| = b ⟹ x = a ± b; |x − a| < b ⟹ a − b < x < a + b.',
          'Integers in [a, b] = b − a + 1; strict |x−a|<b ⟹ 2b − 1.',
          '|x| ≥ 0 always.'
        ] }
      ]
    }
  ];

  KB.registerAll('algebra', TOPICS);

  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
