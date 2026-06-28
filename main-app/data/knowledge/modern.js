/**
 * data/knowledge/modern.js — "Modern Math" knowledge objects (ADR-069, Phase 3 gold-standard content).
 * Original exam-grade explanations; organisation inspired by the standard speed-maths cheat sheets. No filler.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'probability', title: 'Probability', icon: '🎲', category: 'modern-math',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: null, syllabusTopicId: 'probability', revisionIntervalDays: 5,
      related: ['permutation-combination'],
      searchTerms: ['probability', 'chance', 'dice', 'cards', 'coins', 'sample space', 'at least one', 'complement', 'independent'],
      sections: [
        { type: 'overview', text: 'Probability measures how likely an event is, on a scale from 0 (impossible) to 1 (certain). For equally-likely outcomes it is just a counting exercise: favourable outcomes over total outcomes. The art is counting the sample space correctly.' },
        { type: 'concept', title: 'Sample space & equally likely outcomes', body: 'The sample space S is the set of all possible outcomes. When every outcome is equally likely, P(E) = (favourable outcomes) / (total outcomes). Always pin down the size of S first — a coin has 2, a die 6, two dice 36, a deck 52.' },
        { type: 'concept', title: 'Combining events', body: 'Complement: P(not E) = 1 − P(E). Addition: P(A or B) = P(A) + P(B) − P(A and B); if A and B are mutually exclusive the overlap is 0. Independence: P(A and B) = P(A) × P(B) when one event does not affect the other.' },
        { type: 'formula', items: [
          { name: 'Basic probability', expr: 'P(E) = favourable outcomes / total outcomes', when: 'All outcomes equally likely. Always 0 ≤ P(E) ≤ 1.' },
          { name: 'Complement', expr: "P(E') = 1 − P(E)", when: 'Easier to count the OPPOSITE — especially "at least one".' },
          { name: 'Addition theorem', expr: 'P(A ∪ B) = P(A) + P(B) − P(A ∩ B)', when: 'Either event; subtract the overlap (0 if mutually exclusive).' },
          { name: 'Independent events', expr: 'P(A ∩ B) = P(A) × P(B)', when: 'Outcomes that do not influence each other (e.g. two coin tosses).' }
        ] },
        { type: 'trick', title: 'Counting the deck, dice and coins', items: [
          'Cards: 52 total, 4 suits of 13; face cards = 12, kings/queens/aces = 4 each. P(king) = 4/52 = 1/13.',
          'Dice: 1 die → 6 outcomes, 2 dice → 36. n coins → 2ⁿ outcomes.',
          '"At least one" → use the complement: P(at least one) = 1 − P(none).'
        ] },
        { type: 'example', problem: 'Two fair dice are rolled. Find the probability that the sum is 7.', steps: [
          'Total outcomes = 6 × 6 = 36.',
          'Sum 7: (1,6)(2,5)(3,4)(4,3)(5,2)(6,1) → 6 favourable.',
          'P = 6/36.'
        ], answer: '1/6' },
        { type: 'example', problem: 'A coin is tossed twice. Find the probability of getting at least one head.', steps: [
          'Total outcomes = 2² = 4 (HH, HT, TH, TT).',
          'P(no head) = P(TT) = 1/4.',
          'P(at least one head) = 1 − 1/4.'
        ], answer: '3/4' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Miscounting the sample space (e.g. 2 dice are 36 outcomes, not 12).',
          'Forgetting to subtract the overlap P(A ∩ B) in the addition theorem.',
          'Multiplying probabilities for events that are NOT independent.',
          'Computing "at least one" directly instead of via 1 − P(none).'
        ] },
        { type: 'memory', text: 'P = favourable / total, always between 0 and 1. For "at least one", do 1 − P(none).' },
        { type: 'revision', points: [
          'P(E) = favourable / total; 0 ≤ P ≤ 1.',
          "Complement P(E') = 1 − P(E); use it for 'at least one'.",
          'Addition: P(A∪B) = P(A) + P(B) − P(A∩B).',
          'Independent ⇒ P(A∩B) = P(A)·P(B). Deck = 52, two dice = 36, n coins = 2ⁿ.'
        ] }
      ]
    },
    {
      id: 'permutation-combination', title: 'Permutation & Combination', icon: '🔀', category: 'modern-math',
      difficulty: 'advanced', examFrequency: 'medium', status: 'scaffold',
      drillCategory: null, syllabusTopicId: 'permutations_combinations', revisionIntervalDays: 6,
      related: ['probability'], searchTerms: ['permutation', 'combination', 'npr', 'ncr', 'arrangement', 'selection', 'factorial'],
      sections: []
    }
  ];

  KB.registerAll('modern-math', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
