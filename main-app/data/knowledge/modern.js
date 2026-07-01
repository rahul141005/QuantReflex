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
      drillCategory: 'probability', syllabusTopicId: 'probability', revisionIntervalDays: 5,
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
      difficulty: 'advanced', examFrequency: 'medium', status: 'published',
      drillCategory: 'permutation-combination', syllabusTopicId: 'permutations_combinations', revisionIntervalDays: 6,
      related: ['probability'],
      searchTerms: ['permutation', 'combination', 'npr', 'ncr', 'arrangement', 'selection', 'factorial', 'counting', 'circular', 'p&c', 'pnc'],
      sections: [
        { type: 'overview', text: 'Counting without listing. Ask ONE question first: does ORDER matter? If yes it\'s a permutation (arrangement); if no it\'s a combination (selection). Most of the topic is recognising which one a problem wants, then plugging into nPr or nCr.' },
        { type: 'concept', title: 'The fundamental counting principle', body: 'If a first task can be done in m ways and a second in n ways, together they can be done in m × n ways. Choices in sequence MULTIPLY. This single idea underlies every permutation and combination formula.' },
        { type: 'concept', title: 'Order matters? Permutation. Order doesn\'t? Combination', body: 'Arranging 3 books on a shelf (ABC ≠ BCA) → permutation. Picking a 3-member committee (the group {A,B,C} is one committee regardless of order) → combination. "Arrange / rank / seat / form a number / password" → order matters. "Select / choose / committee / team / handshake" → order doesn\'t.' },
        { type: 'concept', title: 'The bridge between them', body: 'A combination ignores the internal order that a permutation counts. Since r chosen items can be arranged in r! ways, nPr = nCr × r! — so nCr = nPr / r!. Selecting then arranging = choosing the set, then ordering it.' },
        { type: 'formula', items: [
          { name: 'Permutation (arrange r of n)', expr: 'nPr = n! / (n − r)!', when: 'Order matters: arrangements, rankings, forming numbers.' },
          { name: 'Combination (choose r of n)', expr: 'nCr = n! / (r!·(n − r)!)', when: 'Order doesn\'t matter: committees, teams, handshakes.' },
          { name: 'Arrangements with repeats', expr: 'word with letters = n! / (p!·q!·…)', when: 'Some items are identical (p alike of one kind, q of another).' },
          { name: 'Circular arrangement', expr: '(n − 1)! around a round table', when: 'Seating in a circle (rotations are the same).' }
        ] },
        { type: 'trick', title: 'Speed technique', items: [
          'nCr = nC(n−r): choosing 8 of 10 = leaving out 2 = 10C2 = 45. Always pick the smaller r to compute.',
          'Expand nCr as a short product: nCr = (n·(n−1)·…·r terms) / r!. e.g. 10C3 = (10·9·8)/(3·2·1) = 120.',
          'A handshake / line-joining between n people = nC2 = n(n−1)/2 (each pair once).'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Using a permutation when order is irrelevant (counting {A,B} and {B,A} as two committees) — overcounts by r!.',
          'Forgetting to divide by the factorials of identical items in word-arrangement problems.',
          'Using n! instead of (n − 1)! for circular seating.',
          'Adding when you should multiply: independent sequential choices multiply.'
        ] },
        { type: 'table', caption: 'Permutation vs Combination', headers: ['', 'Permutation', 'Combination'], rows: [['Order', 'matters', 'does not matter'], ['Cue words', 'arrange, rank, sequence', 'select, choose, group'], ['Formula', 'n! / (n−r)!', 'n! / [r!(n−r)!]'], ['Picks 3 of 5', '60', '10']] },
        { type: 'example', problem: 'How many ways can the letters of the word "LEVEL" be arranged?', steps: [
          'LEVEL has 5 letters with L repeated twice and E repeated twice.',
          'Arrangements = 5! / (2!·2!) = 120 / 4.'
        ], answer: '30' },
        { type: 'example', problem: 'From 8 people, how many ways can a committee of 3 be selected?', steps: [
          'Order does not matter → combination 8C3.',
          '8C3 = (8·7·6)/(3·2·1) = 336/6.'
        ], answer: '56' },
        { type: 'memory', text: 'Order matters → nPr; order doesn\'t → nCr. nCr = nPr ÷ r!. Sequential choices multiply.' },
        { type: 'revision', points: [
          'Fundamental principle: choices in sequence multiply.',
          'nPr = n!/(n−r)! (arrange); nCr = n!/(r!(n−r)!) (select).',
          'nCr = nC(n−r); compute with the smaller r.',
          'Identical items → divide by their factorials; circular → (n−1)!.'
        ] }
      ]
    },
    {
      id: 'set-theory', title: 'Set Theory & Venn Diagrams', icon: '🔵', category: 'modern-math',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'set-theory', syllabusTopicId: 'set_theory', revisionIntervalDays: 8,
      related: ['permutation-combination', 'probability', 'percentages'],
      searchTerms: ['set theory', 'sets', 'venn diagram', 'union', 'intersection', 'inclusion exclusion', 'neither', 'only', 'at least one'],
      sections: [
        { type: 'overview', text: 'Set-theory word problems are really counting problems solved with one formula — inclusion–exclusion — or a Venn diagram. The whole topic is knowing how the "both", "only", "neither" and "at least one" regions relate.' },
        { type: 'concept', title: 'Two sets — inclusion–exclusion', body: 'For two overlapping groups A and B: |A ∪ B| = |A| + |B| − |A ∩ B| (subtract the overlap, which was counted twice). "Only A" = |A| − |A ∩ B|. "Neither" = Total − |A ∪ B|. If some belong to neither, Total = (only A) + (only B) + (both) + (neither).' },
        { type: 'concept', title: 'Three sets', body: 'The pattern extends: |A ∪ B ∪ C| = |A| + |B| + |C| − |A∩B| − |B∩C| − |C∩A| + |A∩B∩C|. Add the singles, subtract the pairs, add back the triple. Draw three overlapping circles and fill the innermost (all three) region first, then work outward.' },
        { type: 'formula', items: [
          { name: 'Two-set union', expr: '|A ∪ B| = |A| + |B| − |A ∩ B|', when: 'At-least-one counts; rearrange to find any one unknown.' },
          { name: 'Neither', expr: 'Neither = Total − |A ∪ B|', when: 'When a total and a "neither/both" count are given.' },
          { name: 'Only A', expr: 'Only A = |A| − |A ∩ B|', when: 'Exclusive region of one set.' },
          { name: 'Three-set union', expr: '|A∪B∪C| = Σsingles − Σpairs + triple', when: 'Three overlapping groups.', trap: '"Exactly two" ≠ "at least two" — subtract 3× the triple for exactly-two.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'Draw the Venn diagram and fill the CENTRE (all-three) region first, then the pairwise, then the singles.',
          'For two sets, memorise Total = onlyA + onlyB + both + neither and solve for the unknown.',
          'Watch the wording: "at least one" = union; "only/exactly" excludes the overlaps.'
        ] },
        { type: 'example', problem: 'In a class of 40, 25 like tea, 20 like coffee, 10 like both. How many like neither?', steps: [
          'At least one = 25 + 20 − 10 = 35.',
          'Neither = 40 − 35 = 5.'
        ], answer: '5' },
        { type: 'example', problem: '30 read A, 25 read B, 20 read C; 10 read A&B, 8 read B&C, 6 read A&C, 4 read all three. How many read at least one?', steps: [
          'Singles: 30 + 25 + 20 = 75.',
          'Subtract pairs: 75 − (10 + 8 + 6) = 51. Add triple: 51 + 4 = 55.'
        ], answer: '55' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Translate the words to the four regions (only-A, only-B, both, neither) before touching numbers.',
          'For three sets, always add the triple back — the classic sign slip.',
          'Distinguish "exactly two" from "at least two"; the exam loves that trap.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Forgetting to subtract the overlap (double-counting the "both").',
          'Dropping the +triple term in the three-set formula.',
          'Confusing "only A" (excludes the overlap) with |A| (includes it).',
          'Reading "at least one" as "exactly one".'
        ] },
        { type: 'memory', text: 'Two sets: add, subtract the overlap. Three sets: singles − pairs + triple.' },
        { type: 'revision', points: [
          '|A ∪ B| = |A| + |B| − |A ∩ B|.',
          'Neither = Total − |A ∪ B|; only A = |A| − both.',
          '|A∪B∪C| = singles − pairs + triple.',
          'Fill the Venn centre first; mind "exactly" vs "at least".'
        ] }
      ]
    },
    {
      id: 'statistics-basics', title: 'Statistics Basics', icon: '📇', category: 'modern-math',
      difficulty: 'foundation', examFrequency: 'medium', status: 'published',
      drillCategory: 'statistics-basics', syllabusTopicId: 'statistics', revisionIntervalDays: 8,
      related: ['averages', 'probability', 'number-series'],
      searchTerms: ['statistics', 'mean', 'median', 'mode', 'range', 'average', 'central tendency', 'data set'],
      sections: [
        { type: 'overview', text: 'Descriptive statistics summarise a data set with a single number. The exam staples are the three "averages" (mean, median, mode) and the range. Each answers a slightly different question about the middle or spread of the data.' },
        { type: 'concept', title: 'Mean, median, mode', body: 'MEAN = sum ÷ count (the balancing point). MEDIAN = the middle value once the data is SORTED (for an even count, the average of the two middle values). MODE = the value that occurs most often (a data set can have no mode or several). Sorting first is essential for the median.' },
        { type: 'concept', title: 'Range & when to use which', body: 'RANGE = largest − smallest — a quick measure of spread. The MEAN is sensitive to outliers (one huge value drags it up); the MEDIAN is robust to them, which is why "typical" incomes use the median. The MODE is the only average that works for non-numeric categories.' },
        { type: 'formula', items: [
          { name: 'Mean', expr: 'Mean = (sum of values) ÷ (number of values)', when: 'Overall average; affected by outliers.' },
          { name: 'Median', expr: 'Middle of the SORTED list (avg of two middles if even count)', when: 'Typical value; ignores outliers.' },
          { name: 'Mode', expr: 'The most frequently occurring value', when: 'Most common item; works for categories.' },
          { name: 'Range', expr: 'Range = maximum − minimum', when: 'Spread of the data.' }
        ] },
        { type: 'trick', title: 'Speed tactics', items: [
          'ALWAYS sort the data before reading off the median — the #1 cause of wrong answers.',
          'For an odd count of n values, the median sits at position (n + 1)/2.',
          'Spot the mode by scanning for the repeated value — no arithmetic needed.'
        ] },
        { type: 'example', problem: 'Find the median of 7, 3, 9, 4, 8.', steps: [
          'Sort: 3, 4, 7, 8, 9.',
          'Middle of 5 values is the 3rd: 7.'
        ], answer: '7' },
        { type: 'example', problem: 'Find the range of 12, 5, 20, 8, 3.', steps: [
          'Largest = 20, smallest = 3.',
          'Range = 20 − 3 = 17.'
        ], answer: '17' },
        { type: 'exam', title: 'How toppers handle these', items: [
          'Sort once, then read median, range and (by eye) the mode in a single pass.',
          'Remember the mean uses every value — recompute it fully rather than guessing.',
          'For even-length lists, average the two middle numbers for the median.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Taking the median without sorting first.',
          'Confusing mean (arithmetic average) with median (positional middle).',
          'Assuming every data set has exactly one mode.',
          'Off-by-one when locating the middle position.'
        ] },
        { type: 'memory', text: 'Mean = add-and-divide; Median = middle after sorting; Mode = most; Range = max − min.' },
        { type: 'revision', points: [
          'Mean = sum ÷ count; sensitive to outliers.',
          'Median = middle of the sorted list; robust to outliers.',
          'Mode = most frequent value.',
          'Range = max − min.'
        ] }
      ]
    }
  ];

  KB.registerAll('modern-math', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
