/**
 * data/knowledge/lr.js — Logical Reasoning Learn content (ADR-075, QuantReflex V2 Phase 3).
 *
 * The LR category for the Learn hub — same Knowledge Engine, same typed-block schema, same gold-standard depth as
 * Quant/DI (ADR-069). Tagged `subject:'lr'` so the hub groups it under "Logical Reasoning". Each topic deep-links to
 * its LR drill category so "Read → Practise" works. Pure data — no engine changes.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  KB.registerCategory({ id: 'lr-reasoning', title: 'Logical Reasoning', icon: '🧩', order: 70, subject: 'lr',
    blurb: 'Train reasoning reflexes — coding, relations, directions, ordering, analogies and syllogisms — the fast, rule-based logic that timed sections reward.' });

  var TOPICS = [
    {
      id: 'lr-coding-decoding', title: 'Coding-Decoding', category: 'lr-reasoning', difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-coding', searchTerms: ['coding', 'decoding', 'cipher', 'letter shift', 'code'], related: ['lr-analogies'],
      sections: [
        { type: 'overview', text: 'Coding-Decoding hides a word or number behind a simple, consistent RULE — a letter shift, a position value, or an arithmetic pattern. Crack the rule from the example, then apply it. It is pure pattern speed, no vocabulary needed.' },
        { type: 'concept', title: 'Letters have positions', body: 'Every letter has a fixed position: A=1, B=2, …, Z=26 (and reversed: A=26 … Z=1). Most codes are built on these positions — a sum, a shift, or a swap. Knowing positions instantly is half the battle.' },
        { type: 'concept', title: 'Find the rule from the example', body: 'You are always given one worked pair (e.g. CAT → ECV). Compare letter by letter to see the transformation (here +2), then apply the SAME transformation to the asked word.' },
        { type: 'formula', items: [
          { name: 'Letter position', expr: 'A=1, B=2, … , Z=26' },
          { name: 'Reverse position', expr: 'value = 27 − position  (A=26 … Z=1)' },
          { name: 'Shift cipher', expr: 'new letter = (position − 1 + k) mod 26 + 1', when: 'each letter moves by a fixed k (wraps Z→A)' }
        ] },
        { type: 'trick', title: 'EJOTY anchors', items: ['Memorise E=5, J=10, O=15, T=20, Y=25 — then count up/down a step or two to place any letter instantly.', 'For a shift, find the gap on ONE letter, then trust it for the rest.'] },
        { type: 'trap', items: ['Forgetting the wrap-around: Z shifted by +1 is A, not "[".', 'Miscounting a letter position under time pressure — use the EJOTY anchors.', 'Mixing forward and reverse positions in the same code.'] },
        { type: 'example', problem: 'If "CAT" is coded as "ECV", how is "DOG" coded?', steps: ['C→E, A→C, T→V: each letter moves +2', 'Apply +2 to DOG: D→F, O→Q, G→I', 'Code = FQI'], answer: 'FQI' },
        { type: 'revision', points: ['A=1…Z=26; reverse = 27−position.', 'Read the example to find the shift/rule, then apply it.', 'Shifts wrap around (Z→A).', 'EJOTY for instant positions.'] }
      ]
    },
    {
      id: 'lr-blood-relations', title: 'Blood Relations', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-blood', searchTerms: ['blood relations', 'family', 'relationship', 'generations'], related: ['lr-direction-sense'],
      sections: [
        { type: 'overview', text: 'Blood-relation questions give a chain of family links and ask how two people are related. The reliable method is to turn the words into a small family TREE and read the answer off it.' },
        { type: 'concept', title: 'Think in generations', body: 'Place people on levels: grandparents on top, parents in the middle, children below. Most answers are just "one or two levels up/down, same or sideways".' },
        { type: 'concept', title: 'Compose the links', body: 'Work the chain inward: "A is the father of B; B is the mother of C" → A is the father of C\'s mother → A is C\'s (maternal) grandfather.' },
        { type: 'formula', items: [
          { name: "Parent's parent", expr: 'Grandfather / Grandmother' },
          { name: "Parent's brother / sister", expr: 'Uncle / Aunt' },
          { name: "Sibling's son / daughter", expr: 'Nephew / Niece' },
          { name: "Child's son / daughter", expr: 'Grandson / Granddaughter' }
        ] },
        { type: 'trick', title: 'Draw, don\'t hold', items: ['Sketch a quick tree; mark male (△) and female (○) and draw a line per stated link.', 'Replace long phrases ("the only daughter of my mother") with the simplest equivalent ("myself / my sister") first.'] },
        { type: 'trap', items: ['Reading the "of" backwards — "A is the father of B" means A is above B, not below.', 'Assuming gender from a name; rely only on the stated relations.', 'Confusing maternal vs paternal — for the basic relation (grandfather) it usually doesn\'t change the answer.'] },
        { type: 'example', problem: 'Pooja is the daughter of Sneha. Sneha is the sister of Kavya. How is Pooja related to Kavya?', steps: ['Pooja is Sneha\'s daughter; Sneha is Kavya\'s sister', 'So Pooja is the daughter of Kavya\'s sister', "A sister's daughter is a niece"], answer: 'Niece' },
        { type: 'revision', points: ['Build a generation tree.', 'Parent\'s parent = grandparent; parent\'s sibling = uncle/aunt.', 'Sibling\'s child = nephew/niece; child\'s child = grandchild.', 'Mind the direction of "of".'] }
      ]
    },
    {
      id: 'lr-direction-sense', title: 'Direction Sense', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-direction', searchTerms: ['direction', 'distance', 'compass', 'displacement', 'turns'], related: ['lr-blood-relations'],
      sections: [
        { type: 'overview', text: 'Direction questions track someone walking and turning, then ask the final distance or direction from the start. Track position as coordinates and the rest is Pythagoras.' },
        { type: 'concept', title: 'Use a coordinate grid', body: 'Let North be +y, East be +x. Add each move to a running (x, y). North/South change y; East/West change x. Opposite moves cancel.' },
        { type: 'concept', title: 'Net displacement', body: 'Only the NET north-south and net east-west distances matter for the final answer — the path in between is a distraction.' },
        { type: 'formula', items: [
          { name: 'Shortest distance', expr: 'd = √( (net N−S)² + (net E−W)² )' },
          { name: 'Right / left turn', expr: 'Right = clockwise 90°, Left = anticlockwise 90°' },
          { name: 'Final direction', expr: 'combine sign of net y (N/S) and net x (E/W) → e.g. North-East' }
        ] },
        { type: 'trick', title: 'Pythagorean triples', items: ['Watch for 3-4-5, 5-12-13, 8-15-17 — exam distances are almost always a clean triple.', 'Cancel opposite legs first (5 N then 2 S = 3 N) before doing any maths.'] },
        { type: 'trap', items: ['Left/right depends on the direction you currently FACE — re-orient before turning.', 'Forgetting to cancel back-and-forth moves.', 'Confusing distance (a length) with direction (a compass word).'] },
        { type: 'example', problem: 'A man walks 3 km North, then 4 km East. How far is he from the start?', steps: ['Net North = 3, net East = 4', 'd = √(3² + 4²) = √25', '= 5 km'], answer: '5 km' },
        { type: 'revision', points: ['North +y, East +x; add each move.', 'Cancel opposite moves to get the net.', 'Distance = √(net²+net²) — look for triples.', 'Direction = combine the net N/S and E/W signs.'] }
      ]
    },
    {
      id: 'lr-ranking', title: 'Ranking & Ordering', category: 'lr-reasoning', difficulty: 'foundation', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-ranking', searchTerms: ['ranking', 'ordering', 'position', 'row', 'rank from left'], related: ['lr-direction-sense'],
      sections: [
        { type: 'overview', text: 'Ranking questions place people in a row or order and ask a total or a position. Almost all of them come down to one identity about the overlap when you count from both ends.' },
        { type: 'concept', title: 'The overlap of +1', body: 'If a person is L-th from the left and R-th from the right, they are counted TWICE — once from each end — so the total is L + R − 1, not L + R.' },
        { type: 'concept', title: 'Flip an end', body: 'A rank from one end converts to the other end using the total: rank from bottom = Total − (rank from top) + 1.' },
        { type: 'formula', items: [
          { name: 'Total in a row', expr: 'Total = (rank from left) + (rank from right) − 1' },
          { name: 'Rank from the other end', expr: 'other = Total − rank + 1' },
          { name: 'People between two', expr: 'between = | position₁ − position₂ | − 1' }
        ] },
        { type: 'trick', title: 'Always subtract one', items: ['Whenever you ADD two same-person ranks, subtract 1 for the double-count.', 'Find the total first; most follow-up questions need it.'] },
        { type: 'trap', items: ['Forgetting the −1 and overcounting by one.', 'Counting the two endpoints when asked for people strictly BETWEEN.', 'Mixing "from the left" with "from the right" without converting.'] },
        { type: 'example', problem: 'In a row, Ravi is 7th from the left and 11th from the right. How many people are in the row?', steps: ['Total = left + right − 1', '= 7 + 11 − 1', '= 17'], answer: '17' },
        { type: 'revision', points: ['Total = L + R − 1 (the person is double-counted).', 'Other-end rank = Total − rank + 1.', 'Between two = |difference| − 1.', 'Get the total first.'] }
      ]
    },
    {
      id: 'lr-odd-one-out', title: 'Odd One Out', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-odd', searchTerms: ['odd one out', 'classification', 'pattern', 'does not belong'], related: ['lr-analogies'],
      sections: [
        { type: 'overview', text: 'You are given a few items that share a hidden property and one that breaks it. Spot the shared rule, then the misfit is obvious. Speed comes from a quick mental checklist of common rules.' },
        { type: 'concept', title: 'Find the rule, not the odd one', body: 'Don\'t hunt for the odd item directly — identify what the MAJORITY share (all squares? all primes? all multiples of 6?). The one that fails that rule is the answer.' },
        { type: 'formula', items: [
          { name: 'Common number rules', expr: 'perfect squares · perfect cubes · primes · multiples of k · same digit-sum' },
          { name: 'Test order (fast→slow)', expr: 'even/odd → multiples → squares → cubes → primes' }
        ] },
        { type: 'trick', title: 'Run the checklist', items: ['Scan for the easy rules first (even/odd, multiples) before squares/cubes/primes.', 'If two rules seem to fit, the intended one usually leaves exactly ONE misfit.'] },
        { type: 'trap', items: ['Forcing a pattern that splits the set 2-and-2 — a valid rule leaves exactly one odd item.', 'Overlooking that a number can be special in more than one way (36 is both a square and a multiple of 6).', 'Picking by "feel" instead of testing a concrete rule.'] },
        { type: 'example', problem: 'Which does NOT belong: 64, 27, 183, 216?', steps: ['64 = 4³, 27 = 3³, 216 = 6³ — all perfect cubes', '183 is not a perfect cube', 'So 183 is the odd one out'], answer: '183' },
        { type: 'revision', points: ['Identify the shared rule first.', 'Common rules: squares, cubes, primes, multiples.', 'A correct rule leaves exactly one misfit.', 'Test fast rules before slow ones.'] }
      ]
    },
    {
      id: 'lr-analogies', title: 'Analogies', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-analogy', searchTerms: ['analogy', 'relationship', 'ratio', 'is to'], related: ['lr-coding-decoding', 'lr-odd-one-out'],
      sections: [
        { type: 'overview', text: 'An analogy gives a related pair A : B and asks you to complete C : ? with the SAME relationship. Find the exact operation that turns A into B, then apply it to C.' },
        { type: 'concept', title: 'Nail the exact relation', body: 'Is B a multiple of A? A power? A plus a constant? Pin down the precise rule on the given pair before touching C — small numbers can fit several rules, so verify.' },
        { type: 'formula', items: [
          { name: 'Power relations', expr: 'n → n²   or   n → n³', when: 'B is much larger than A' },
          { name: 'Linear relations', expr: 'n → k·n   or   n → n + c' },
          { name: 'Mixed relations', expr: 'n → n²±1,  n(n+1),  n²+n' }
        ] },
        { type: 'trick', title: 'Check in order', items: ['Test ratio (B÷A) first, then a power (square/cube), then ±constant.', 'Confirm the rule reproduces B from A exactly before applying it to C.'] },
        { type: 'trap', items: ['A rule that fits A:B by coincidence but not the intended pattern — verify with the numbers.', 'Stopping at "roughly" — analogies need the exact value.', 'Ignoring a small offset (n²+1 vs n²).'] },
        { type: 'example', problem: '6 : 42 :: 9 : ?', steps: ['6 → 42: that is 6×7 = 6² + 6 = n² + n', 'Apply to 9: 9² + 9 = 81 + 9', '= 90'], answer: '90' },
        { type: 'revision', points: ['Find the EXACT operation on A:B.', 'Try ratio, then power, then ±constant.', 'Verify the rule reproduces B before using it.', 'Apply the same rule to C.'] }
      ]
    },
    {
      id: 'lr-syllogisms', title: 'Syllogisms', category: 'lr-reasoning', difficulty: 'advanced', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-syllogism', searchTerms: ['syllogism', 'all some no', 'conclusion', 'venn', 'logic'], related: ['lr-coding-decoding'],
      sections: [
        { type: 'overview', text: 'Syllogisms give two statements (using All / No / Some) and ask whether a conclusion necessarily follows. A conclusion follows only if it is true in EVERY possible picture of the statements.' },
        { type: 'concept', title: 'What each word guarantees', body: '"All A are B" puts A entirely inside B. "No A are B" keeps them apart. "Some A are B" guarantees an overlap exists — but says nothing about the rest, and never implies "some are NOT".' },
        { type: 'concept', title: 'Follows = true in every diagram', body: 'Draw the statements as Venn circles. If you can draw even ONE valid diagram where the conclusion is false, it does not follow. If it holds in all of them, it follows.' },
        { type: 'formula', items: [
          { name: 'All + All', expr: 'All A are B + All B are C ⇒ All A are C  (follows)' },
          { name: 'All + No', expr: 'All A are B + No B are C ⇒ No A are C  (follows)' },
          { name: 'Some + Some', expr: 'Some A are B + Some B are C ⇒ nothing certain about A and C' }
        ] },
        { type: 'trick', title: 'Hunt the counter-example', items: ['Try to DISPROVE the conclusion by drawing one diagram where it fails — if you can, it does not follow.', 'Two "Some" statements almost never yield a definite conclusion.'] },
        { type: 'trap', items: ['Reading "Some A are B" as "Some A are not B" — it does not.', 'Converting "All A are B" into "All B are A".', 'Assuming existence from "All" alone.'] },
        { type: 'example', problem: 'All cats are dogs. No dogs are birds. Does "No cats are birds" follow?', steps: ['All cats sit inside dogs', 'Dogs and birds are completely separate', 'So cats (inside dogs) are separate from birds → it follows'], answer: 'Follows' },
        { type: 'revision', points: ['All = inside, No = apart, Some = overlap exists.', 'A conclusion follows only if true in EVERY diagram.', 'Some + Some ⇒ nothing certain.', 'Look for a single counter-example to reject it.'] }
      ]
    }
  ];

  KB.registerAll('lr-reasoning', TOPICS);

  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
