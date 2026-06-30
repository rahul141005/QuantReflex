/**
 * data/knowledge/commercial.js — "Commercial Math" knowledge objects (ADR-069, Phase 3 gold-standard content).
 * Original exam-grade explanations; organisation inspired by the standard speed-maths cheat sheets. No filler.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'profit-loss', title: 'Profit & Loss', icon: '💰', category: 'commercial-math',
      difficulty: 'core', examFrequency: 'very-high', status: 'published',
      drillCategory: 'profit-loss', syllabusTopicId: 'profit_loss', revisionIntervalDays: 4,
      related: ['percentages', 'simple-interest'],
      searchTerms: ['cp', 'sp', 'mp', 'cost price', 'selling price', 'marked price', 'discount', 'margin', 'false weight'],
      sections: [
        { type: 'overview', text: 'Profit & Loss is percentages applied to buying and selling. The cost price (CP) is almost always the base for profit% and loss%, while discount% is measured on the marked price (MP). Nail which base each percentage uses and the topic is straightforward.' },
        { type: 'concept', title: 'CP, SP, MP and the two bases', body: 'Profit/Loss is reckoned on CP: Profit% = (SP − CP)/CP × 100. Discount is reckoned on MP: Discount% = (MP − SP)/MP × 100. The shopkeeper marks up the MP above CP, then gives a discount to reach the SP.' },
        { type: 'concept', title: 'Work with multipliers', body: 'SP = CP × (1 + Profit%/100) for a gain, and CP × (1 − Loss%/100) for a loss. Likewise SP = MP × (1 − Discount%/100). Converting percentages to multipliers lets you chain markup and discount in one move.' },
        { type: 'formula', items: [
          { name: 'Profit / Loss %', expr: 'Profit% = (SP − CP)/CP × 100;  Loss% = (CP − SP)/CP × 100', when: 'CP is always the denominator.', trap: 'Dividing by SP instead of CP.' },
          { name: 'SP from CP', expr: 'SP = CP × (1 ± P/100)   (+ for profit, − for loss)', when: 'Find SP given CP and the profit/loss %.' },
          { name: 'Discount', expr: 'Discount% = (MP − SP)/MP × 100;  SP = MP × (1 − d/100)', when: 'Discount is on the MARKED price, not CP.' },
          { name: 'Successive discounts', expr: 'Equivalent = d₁ + d₂ − (d₁·d₂)/100', when: 'Two discounts one after another.' }
        ] },
        { type: 'trick', title: 'Two classic results', items: [
          'Same SP, +x% on one article and −x% on another → always an overall LOSS of x²/100 %.',
          'False weight: selling at "cost price" but giving W grams for 1000 → Gain% = (1000 − W)/W × 100.'
        ] },
        { type: 'example', problem: 'An article sold for ₹600 gives a 20% profit. Find the cost price.', steps: [
          'SP = CP × (1 + 20/100) = CP × 1.2.',
          '600 = 1.2 × CP → CP = 600 / 1.2.'
        ], answer: '₹500' },
        { type: 'example', problem: 'Two articles are sold at ₹x each; one at 20% gain, the other at 20% loss. Net result?', steps: [
          'Same SP with +20% and −20% → net loss = x²/100 with x = 20.',
          '= 20² / 100 = 400 / 100.'
        ], answer: '4% loss' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Computing profit% on SP or on MP instead of CP.',
          'Assuming gain x% and loss x% cancel (they leave a x²/100 loss at equal SP).',
          'Adding successive discounts directly (drop the d₁d₂/100 term).',
          'Confusing markup (CP→MP) with profit (CP→SP).'
        ] },
        { type: 'memory', text: 'Profit/Loss → base is CP. Discount → base is MP. Never mix the two bases.' },
        { type: 'revision', points: [
          'Profit% = (SP−CP)/CP×100; SP = CP(1 ± P/100).',
          'Discount on MP: SP = MP(1 − d/100); successive = d₁+d₂−d₁d₂/100.',
          'Same SP ±x% ⇒ x²/100 loss.',
          'False weight gain% = (1000−W)/W × 100.'
        ] }
      ]
    },
    {
      id: 'simple-interest', title: 'Simple Interest', icon: '🏦', category: 'commercial-math',
      difficulty: 'foundation', examFrequency: 'high', status: 'published',
      drillCategory: null, syllabusTopicId: 'interest', revisionIntervalDays: 5,
      related: ['compound-interest', 'percentages'],
      searchTerms: ['si', 'simple interest', 'principal', 'rate', 'amount', 'double', 'p r t'],
      sections: [
        { type: 'overview', text: 'Simple interest is interest on the ORIGINAL principal only — the same amount is earned every year. Because it grows linearly, most questions reduce to one of the four quantities P, R, T or the interest itself.' },
        { type: 'concept', title: 'Linear growth', body: 'Each year you earn the same SI = P·R/100. Over T years that is just T times the one-year interest, so SI = PRT/100 and the amount A = P + SI. Doubling, tripling, "becomes n times" all follow from this straight-line growth.' },
        { type: 'formula', items: [
          { name: 'Simple interest', expr: 'SI = (P × R × T) / 100', when: 'P = principal, R = rate %/yr, T = time in years.' },
          { name: 'Amount', expr: 'A = P + SI = P(1 + RT/100)', when: 'Total payable/receivable.' },
          { name: 'Time to become n times', expr: 'T = (n − 1) × 100 / R', when: 'Money doubles (n=2) ⇒ T = 100/R; triples (n=3) ⇒ 200/R.' },
          { name: 'Find the rate', expr: 'R = (SI × 100) / (P × T)', when: 'Rearranged when SI, P, T are known.' }
        ] },
        { type: 'trick', title: 'Money-multiple shortcut', items: [
          'A sum doubles in 100/R years, triples in 200/R years, becomes n times in (n−1)·100/R years.',
          'If a sum becomes k times in t years, it becomes m times in t·(m−1)/(k−1) years.'
        ] },
        { type: 'example', problem: 'Find the SI on ₹1000 at 10% per annum for 2 years, and the amount.', steps: [
          'SI = PRT/100 = 1000 × 10 × 2 / 100 = 200.',
          'A = P + SI = 1000 + 200.'
        ], answer: 'SI = ₹200, Amount = ₹1200' },
        { type: 'example', problem: 'In how many years will a sum double itself at 8% simple interest?', steps: [
          'To double, SI must equal P.',
          'T = (n − 1)·100/R = (2 − 1)·100/8 = 100/8.'
        ], answer: '12.5 years' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Charging interest on the growing amount (that is compound, not simple).',
          'Leaving the rate in months while T is in years (keep units consistent).',
          'Forgetting that "doubles" means SI = P (n − 1 = 1), not SI = 2P.',
          'Mixing SI and CI formulas in the same problem.'
        ] },
        { type: 'memory', text: 'SI is flat: the same P·R/100 every year. Doubling time = 100/R.' },
        { type: 'revision', points: [
          'SI = PRT/100; A = P(1 + RT/100).',
          'Becomes n times in (n−1)·100/R years; doubles in 100/R.',
          'R = SI·100/(PT).',
          'Keep rate and time in the same time unit.'
        ] }
      ]
    },
    {
      id: 'compound-interest', title: 'Compound Interest', icon: '💹', category: 'commercial-math',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: null, syllabusTopicId: 'interest', revisionIntervalDays: 5,
      related: ['simple-interest', 'percentages'],
      searchTerms: ['ci', 'compound interest', 'half yearly', 'quarterly', 'compounding', 'amount', 'ci-si'],
      sections: [
        { type: 'overview', text: 'Compound interest is interest on interest: each period the new interest is added to the principal, so growth is exponential. Over two years it always slightly exceeds simple interest — by a clean, memorable amount.' },
        { type: 'concept', title: 'Interest on a growing base', body: 'After each compounding period the whole amount becomes the new principal. So A = P(1 + R/100)^T and CI = A − P. For non-annual compounding, scale the rate down and the number of periods up.' },
        { type: 'concept', title: 'CI vs SI', body: 'Year 1 they are equal. From year 2 onward CI pulls ahead because it also earns interest on the first year\'s interest. For exactly two years the gap is P(R/100)² — a favourite shortcut.' },
        { type: 'formula', items: [
          { name: 'Compound amount', expr: 'A = P(1 + R/100)^T;  CI = A − P', when: 'Annual compounding over T years.' },
          { name: 'Non-annual compounding', expr: 'Half-yearly: rate R/2, periods 2T.  Quarterly: rate R/4, periods 4T', when: 'Compounded more than once a year.' },
          { name: 'CI − SI for 2 years', expr: 'CI − SI = P(R/100)²', when: 'Quick gap between CI and SI over exactly two years.' },
          { name: 'Doubling time (approx)', expr: 'Rule of 72: years ≈ 72 / R', when: 'Estimating how long money takes to double under compounding.' }
        ] },
        { type: 'trick', title: 'Two-year expansion', items: [
          'For 2 years, CI% on the principal = 2R + R²/100 (e.g. 10% → 21%).',
          'So A after 2 years at 10% = 1.21 × P; at 20% = 1.44 × P.'
        ] },
        { type: 'example', problem: 'Find the compound interest on ₹1000 at 10% per annum for 2 years.', steps: [
          'A = P(1 + R/100)^T = 1000 × (1.1)² = 1000 × 1.21 = 1210.',
          'CI = A − P = 1210 − 1000.'
        ], answer: '₹210' },
        { type: 'example', problem: 'The difference between CI and SI on a sum for 2 years at 10% is ₹25. Find the sum.', steps: [
          'CI − SI = P(R/100)² → 25 = P × (10/100)².',
          '25 = P × 0.01 → P = 25 / 0.01.'
        ], answer: '₹2500' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Using SI = PRT/100 when the problem says "compounded".',
          'Forgetting to halve the rate AND double the periods for half-yearly compounding.',
          'Applying CI − SI = P(R/100)² for any period other than exactly 2 years.',
          'Rounding the (1 + R/100)^T factor too early.'
        ] },
        { type: 'memory', text: 'CI is "interest on interest": A = P(1 + R/100)^T. Two-year CI−SI gap = P(R/100)².' },
        { type: 'revision', points: [
          'A = P(1 + R/100)^T; CI = A − P.',
          'Half-yearly → R/2, 2T; quarterly → R/4, 4T.',
          'CI − SI (2 yr) = P(R/100)².',
          'CI ≥ SI always (equal only in year 1).'
        ] }
      ]
    },
    {
      id: 'partnership', title: 'Partnership', icon: '🤝', category: 'commercial-math',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: null, syllabusTopicId: 'partnership', revisionIntervalDays: 6,
      related: ['ratio-proportion', 'profit-loss'],
      searchTerms: ['partnership', 'investment', 'profit share', 'capital', 'sleeping partner', 'working partner', 'capital months', 'ratio'],
      sections: [
        { type: 'overview', text: 'When people invest in a business together, profit is split in proportion to how much money each put in AND for how long. One product per partner — capital × time — and the profit ratio is just those products. Everything else (one invests later, someone withdraws) is handled by adjusting the months.' },
        { type: 'concept', title: 'Capital × time is the only quantity that matters', body: 'A partner\'s claim on profit = (amount invested) × (number of months it stayed in). ₹100 for 12 months and ₹200 for 6 months both give 1200 "capital-months" → equal shares, even though the amounts differ.' },
        { type: 'concept', title: 'Simple vs compound partnership', body: 'Simple: everyone invests for the SAME duration → profit ratio = ratio of capitals. Compound: durations differ → profit ratio = ratio of (capital × time). Always compound when months are unequal.' },
        { type: 'concept', title: 'Working vs sleeping partner', body: 'A working (active) partner who manages the business may first take a salary or a fixed % of profit for the effort; the REMAINING profit is then divided by capital-months. Read whether a cut comes "off the top" before the ratio split.' },
        { type: 'formula', items: [
          { name: 'Profit share ratio', expr: 'P₁ : P₂ : P₃ = C₁T₁ : C₂T₂ : C₃T₃', when: 'General rule — capital × time for each partner.' },
          { name: 'Simple partnership', expr: 'profit ratio = C₁ : C₂ (equal time)', when: 'All capitals stay for the same period.' },
          { name: 'A partner\'s profit', expr: "partner's profit = total profit × (his C·T)/(sum of all C·T)", when: 'Finding one share from the total.' }
        ] },
        { type: 'trick', title: 'Speed technique', items: [
          'Convert each partner to "capital-months" (amount × months); the profit ratio is read off directly — no need to find individual capitals.',
          'If a partner joins late or leaves early, just use the months they were actually invested.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Splitting by capital alone when the durations differ — you must multiply by time.',
          'Using years for one partner and months for another — keep the time unit identical.',
          'Forgetting to remove a working partner\'s salary/commission before dividing the rest.',
          'Counting the full period for someone who withdrew their money partway.'
        ] },
        { type: 'example', problem: 'A invests ₹8000 for 12 months and B invests ₹12000 for 6 months. They earn ₹4000 profit. Find each share.', steps: [
          'Capital-months: A = 8000 × 12 = 96000; B = 12000 × 6 = 72000.',
          'Ratio A : B = 96000 : 72000 = 4 : 3.',
          'Total 7 parts = ₹4000 → 1 part = ₹571.43... so A = 4/7 × 4000, B = 3/7 × 4000.'
        ], answer: 'A = ₹2285.71, B = ₹1714.29 (4 : 3)' },
        { type: 'example', problem: 'A starts a business with ₹20000. After 4 months B joins with ₹30000. At year end the profit is ₹10000. Find B\'s share.', steps: [
          'A is in for 12 months: 20000 × 12 = 240000. B joins after 4 months, so in for 8 months: 30000 × 8 = 240000.',
          'Ratio A : B = 240000 : 240000 = 1 : 1.',
          'B\'s share = 1/2 × 10000.'
        ], answer: '₹5000' },
        { type: 'memory', text: 'Money × months for everyone — that ratio IS the profit ratio.' },
        { type: 'revision', points: [
          'Profit ∝ capital × time (capital-months).',
          'Equal time → split by capital; unequal time → split by capital × time.',
          'Use only the months each partner was actually invested.',
          'Remove a working partner\'s salary/commission before the ratio split.'
        ] }
      ]
    }
  ];

  KB.registerAll('commercial-math', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
