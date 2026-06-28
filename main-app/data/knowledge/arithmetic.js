/**
 * data/knowledge/arithmetic.js — Arithmetic knowledge objects (ADR-069).
 *
 * Phase 1 faithfully migrates the legacy js/formulas.js content into the knowledge-object schema (each old
 * {title, formula, tip} becomes a formula item {name, expr, when}); concise factual overviews are added. Phase 3
 * enriches these to the gold standard (concepts, tricks, traps, examples, revision). No filler.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'percentages', title: 'Percentages', icon: '📊', category: 'arithmetic',
      difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: 'percentages', syllabusTopicId: null, revisionIntervalDays: 3,
      related: ['profit-loss', 'ratio-proportion', 'averages'],
      searchTerms: ['%', 'percent', 'per cent', 'cent', 'increase', 'decrease', 'change'],
      sections: [
        { type: 'overview', text: 'A percentage expresses a quantity as parts per hundred. It is the backbone of profit & loss, interest, data interpretation and most arithmetic word problems.' },
        { type: 'formula', items: [
          { name: 'Percentage of a number', expr: 'x% of y = (x × y) / 100', when: 'Both the percentage and the base value are given.' },
          { name: 'Percentage change', expr: '% change = ((New − Old) / Old) × 100', when: 'Positive means increase, negative means decrease.' },
          { name: 'Successive percentage change', expr: 'Net change = a + b + (a × b) / 100', when: 'Combine two successive changes in one step instead of applying them one after another.' },
          { name: 'Percentage to ratio (more)', expr: 'If A is p% more than B, then A : B = (100 + p) : 100', when: 'Convert a "% more" statement into a clean ratio.' },
          { name: 'Percentage to ratio (less)', expr: 'If A is p% less than B, then A : B = (100 − p) : 100', when: 'Comparison-based DI and arithmetic sets.' }
        ] }
      ]
    },
    {
      id: 'profit-loss', title: 'Profit & Loss', icon: '💰', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'very-high', status: 'published',
      drillCategory: 'profit-loss', syllabusTopicId: null, revisionIntervalDays: 4,
      related: ['percentages', 'ratio-proportion'],
      searchTerms: ['cp', 'sp', 'cost price', 'selling price', 'discount', 'marked price', 'margin'],
      sections: [
        { type: 'overview', text: 'Profit & loss applies percentage thinking to buying and selling. Cost price (CP) is almost always the base for profit% and loss%.' },
        { type: 'formula', items: [
          { name: 'Selling price with profit', expr: 'SP = CP × (1 + Profit% / 100)', when: 'Convert the percentage to a multiplier first.' },
          { name: 'Selling price with loss', expr: 'SP = CP × (1 − Loss% / 100)', when: 'A loss reduces CP by a fraction.' },
          { name: 'Profit percentage', expr: 'Profit% = ((SP − CP) / CP) × 100', when: 'CP is always the denominator.' },
          { name: 'Loss percentage', expr: 'Loss% = ((CP − SP) / CP) × 100', when: 'SP is lower than CP.' },
          { name: 'Successive discount', expr: 'Equivalent discount = d₁ + d₂ − (d₁ × d₂) / 100', when: 'Two discounts in a row — avoid applying them one by one under time pressure.' }
        ] }
      ]
    },
    {
      id: 'ratio-proportion', title: 'Ratio & Proportion', icon: '⚖️', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'ratios', syllabusTopicId: null, revisionIntervalDays: 4,
      related: ['percentages', 'averages'],
      searchTerms: ['ratio', 'proportion', 'alligation', 'mixture', 'a:b', 'parts'],
      sections: [
        { type: 'overview', text: 'A ratio compares quantities of the same kind; a proportion equates two ratios. Alligation turns weighted-average and mixture problems into a quick ratio.' },
        { type: 'formula', items: [
          { name: 'Part from a ratio', expr: 'If A : B = x : y, then A = (x / (x + y)) × Total', when: 'Split a total in a given ratio (works for more than two parts too).' },
          { name: 'Proportion check', expr: 'a : b = c : d  ⇔  a × d = b × c', when: 'Validate a proportion fast by cross-multiplication.' },
          { name: 'Alligation', expr: 'Required ratio = (Higher − Mean) : (Mean − Lower)', when: 'Mixture and weighted-average questions.' }
        ] }
      ]
    },
    {
      id: 'averages', title: 'Averages', icon: '📈', category: 'arithmetic',
      difficulty: 'foundation', examFrequency: 'high', status: 'published',
      drillCategory: 'averages', syllabusTopicId: null, revisionIntervalDays: 4,
      related: ['ratio-proportion', 'percentages'],
      searchTerms: ['average', 'mean', 'weighted', 'replacement'],
      sections: [
        { type: 'overview', text: 'The average (arithmetic mean) is the single value that could replace every item without changing the total. Weighted averages handle groups of different sizes.' },
        { type: 'formula', items: [
          { name: 'Basic average', expr: 'Average = Sum of values / Number of values', when: 'Rearrange to get the sum quickly: Sum = Average × Count.' },
          { name: 'Weighted average', expr: 'Average = (n₁a₁ + n₂a₂ + …) / (n₁ + n₂ + …)', when: 'Combining groups of different sizes.' },
          { name: 'Replacement average', expr: 'New average = Old average + (New value − Old value) / n', when: 'One item in the dataset changes.' }
        ] }
      ]
    },
    {
      id: 'time-and-work', title: 'Time & Work', icon: '🔧', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'time-and-work', syllabusTopicId: null, revisionIntervalDays: 5,
      related: ['time-speed-distance', 'ratio-proportion'],
      searchTerms: ['work', 'efficiency', 'man days', 'rate', 'together'],
      sections: [
        { type: 'overview', text: 'Time & work treats a job as a fixed amount of work done at a rate (efficiency). Adding workers adds rates; the LCM-of-days "units" method makes most problems one line.' },
        { type: 'formula', items: [
          { name: 'Work relation', expr: 'Work done = Efficiency × Time', when: 'If work is fixed, efficiency is inversely proportional to time.' },
          { name: 'Combined work', expr: 'A in x days, B in y days → together T = xy / (x + y)', when: 'Derived from 1/x + 1/y = 1/T.' },
          { name: 'Man-days concept', expr: 'Men × Days = Constant work', when: 'Worker-variation problems.' }
        ] }
      ]
    },
    {
      id: 'time-speed-distance', title: 'Time, Speed & Distance', icon: '🚀', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'time-speed-distance', syllabusTopicId: null, revisionIntervalDays: 5,
      related: ['time-and-work'],
      searchTerms: ['speed', 'distance', 'time', 'relative speed', 'trains', 'km/h', 'm/s'],
      sections: [
        { type: 'overview', text: 'One core relation (Speed = Distance / Time) drives trains, boats, and races. Relative speed and the correct average-speed formula are where most marks are won or lost.' },
        { type: 'formula', items: [
          { name: 'Core relation', expr: 'Speed = Distance / Time', when: 'Also Distance = Speed × Time and Time = Distance / Speed.' },
          { name: 'Relative speed', expr: 'Same direction: |S₁ − S₂|,  Opposite: S₁ + S₂', when: 'Trains and chase problems.' },
          { name: 'Average speed (equal distances)', expr: 'Average speed = 2xy / (x + y)', when: 'Equal distances at two speeds — never use the simple mean.' },
          { name: 'Unit conversion', expr: 'km/h → m/s = × 5/18,  m/s → km/h = × 18/5', when: 'Convert before substituting.' }
        ] }
      ]
    }
  ];

  KB.registerAll('arithmetic', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
