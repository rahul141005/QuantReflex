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
      id: 'lr-coding-decoding', title: 'Coding-Decoding', icon: '🔡', category: 'lr-reasoning', difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
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
      id: 'lr-blood-relations', title: 'Blood Relations', icon: '👪', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'very-high', status: 'published',
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
      id: 'lr-direction-sense', title: 'Direction Sense', icon: '🧭', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
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
      id: 'lr-ranking', title: 'Ranking & Ordering', icon: '🏅', category: 'lr-reasoning', difficulty: 'foundation', examFrequency: 'high', status: 'published',
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
      id: 'lr-odd-one-out', title: 'Odd One Out', icon: '🔎', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
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
      id: 'lr-analogies', title: 'Analogies', icon: '🔗', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
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
      id: 'lr-syllogisms', title: 'Syllogisms', icon: '⭕', category: 'lr-reasoning', difficulty: 'advanced', examFrequency: 'very-high', status: 'published',
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
        { type: 'table', caption: 'Which conclusion is guaranteed', headers: ['Premise 1', 'Premise 2', 'Follows'], rows: [['All A are B', 'All B are C', 'All A are C'], ['All A are B', 'No B are C', 'No A are C'], ['Some A are B', 'All B are C', 'Some A are C'], ['Some A are B', 'No B are C', 'Some A are not C'], ['Some A are B', 'Some B are C', 'Nothing certain']] },
        { type: 'exam', items: ['Banking & CAT love "possibility" cases — practise drawing the least-overlap diagram.', 'If options include "Either I or II", check for the complementary ≥ / ≤ pair first.'] },
        { type: 'example', problem: 'All cats are dogs. No dogs are birds. Does "No cats are birds" follow?', steps: ['All cats sit inside dogs', 'Dogs and birds are completely separate', 'So cats (inside dogs) are separate from birds → it follows'], answer: 'Follows' },
        { type: 'revision', points: ['All = inside, No = apart, Some = overlap exists.', 'A conclusion follows only if true in EVERY diagram.', 'Some + Some ⇒ nothing certain.', 'Look for a single counter-example to reject it.'] }
      ]
    },
    {
      id: 'lr-series', title: 'Letter & Number Series', icon: '🔠', category: 'lr-reasoning', difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-series', searchTerms: ['series', 'letter series', 'alphanumeric', 'next term', 'pattern'], related: ['lr-analogies', 'lr-coding-decoding'],
      sections: [
        { type: 'overview', text: 'A series is a sequence built on a hidden rule; you find the rule and extend it. The rule may act on numbers, on letter POSITIONS, or on both at once (alphanumeric). Speed comes from checking differences first.' },
        { type: 'concept', title: 'Differences and steps', body: 'Write the gaps between consecutive terms. A constant gap is an arithmetic step; a growing gap may be ×k, squares, or added increments. For letters, convert to positions (A=1…Z=26) and treat them like numbers.' },
        { type: 'concept', title: 'Interleaved (alternate) series', body: 'Some series hide TWO patterns on alternate positions — one rising, one falling. Split the odd-position terms from the even-position terms and solve each separately.' },
        { type: 'formula', items: [
          { name: 'Constant letter step', expr: 'next = letter at (position of last + k)' },
          { name: 'Alphanumeric term', expr: 'advance the letter by a, the number by b, each step' },
          { name: 'Interleaved', expr: 'positions 1,3,5… form one series; 2,4,6… another' }
        ] },
        { type: 'trick', title: 'Check gaps first', items: ['Always compute first differences before guessing — most series are arithmetic or a simple ×/+.', 'For letters, EJOTY (E5, J10, O15, T20, Y25) places any letter fast.'] },
        { type: 'trap', items: ['Guessing an elaborate rule before checking the simple first differences.', 'Forgetting to wrap a letter past Z back to A.', 'Solving an interleaved series as one sequence instead of splitting alternate terms.'] },
        { type: 'example', problem: 'Find the next term: C, F, I, L, ?', steps: ['Positions: 3, 6, 9, 12 — a constant +3', 'Next position = 12 + 3 = 15', '15 → O'], answer: 'O' },
        { type: 'revision', points: ['First differences reveal arithmetic steps.', 'Convert letters to positions (A=1…Z=26).', 'Split alternate terms for interleaved series.', 'Wrap letters past Z back to A.'] }
      ]
    },
    {
      id: 'lr-coded-inequalities', title: 'Coded Inequalities', icon: '🔣', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-inequality', searchTerms: ['inequalities', 'coded inequality', 'definitely true', 'either or', 'banking reasoning'], related: ['lr-syllogisms'],
      sections: [
        { type: 'overview', text: 'Coded inequalities replace the signs >, ≥, <, ≤, = with symbols, then ask which conclusion is definitely true. Decode the chain, then combine the signs between the two terms in the conclusion.' },
        { type: 'concept', title: 'Combining a chain', body: 'Along a path, signs combine only if they point the SAME way. A > B ≥ C gives A > C (any strict > makes the result strict). If the path mixes a > and a <, the relation between the ends is undecided.' },
        { type: 'concept', title: 'The "Either–Or" case', body: 'When the derived relation is ≥ (or ≤) and the two conclusions are the complementary pair "X > Y" and "X = Y", neither is individually certain, but one MUST hold — so the answer is "Either I or II is true".' },
        { type: 'formula', items: [
          { name: 'Same-direction chain', expr: '> with ≥/= ⇒ > ; only ≥/= ⇒ ≥ ; only = ⇒ =' },
          { name: 'Mixed direction', expr: '> combined with < between the ends ⇒ cannot be determined' },
          { name: 'Either–Or test', expr: 'derived ≥ , conclusions (X>Y, X=Y) ⇒ Either I or II' }
        ] },
        { type: 'trap', items: ['≥ does NOT prove > (it allows equality) — and does not prove = either.', 'A single < anywhere among > signs breaks the chain to "undetermined".', 'Read the conclusion\'s direction carefully; the pair X>Y and X≤Y are complementary, X>Y and X<Y are not.'] },
        { type: 'trick', title: 'Read the path, not the middle', items: ['Only the signs on the path BETWEEN the two conclusion variables matter — ignore the rest.', 'Any single strict > or < on a same-direction path makes the whole result strict.'] },
        { type: 'example', problem: "Statements: A > B ≥ C. Conclusions: I. A > C  II. A = C.", steps: ['A > B and B ≥ C ⇒ A > C (the > dominates)', 'So I is definitely true', 'A = C is impossible since A > C ⇒ II is false'], answer: 'Only I is true' },
        { type: 'revision', points: ['Decode symbols to >, ≥, <, ≤, =.', 'Combine only the signs between the two terms.', 'Any strict > (or <) makes the result strict.', 'Mixed > and < ⇒ undetermined; ≥ with the complementary pair ⇒ Either–Or.'] }
      ]
    },
    {
      id: 'lr-calendars', title: 'Calendars', icon: '📅', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'lr-calendar', searchTerms: ['calendar', 'day of week', 'odd days', 'leap year'], related: ['lr-clocks'],
      sections: [
        { type: 'overview', text: 'Calendar questions ask the day of the week for a date, or the day after a gap. Everything reduces to counting "odd days" — the remainder of a day-count divided by 7.' },
        { type: 'concept', title: 'Odd days', body: 'Days of the week repeat every 7. So only the remainder when the number of days is divided by 7 matters. Add that remainder to the known weekday and wrap around.' },
        { type: 'concept', title: 'Leap years', body: 'A year is a leap year if divisible by 4, except centuries which must be divisible by 400. A leap year has 366 days (Feb = 29); it contributes 2 odd days, an ordinary year 1.' },
        { type: 'formula', items: [
          { name: 'Day after a gap', expr: 'new weekday = (start weekday + gap) mod 7' },
          { name: 'Odd days in a year', expr: 'ordinary year = 1, leap year = 2' },
          { name: 'Leap-year test', expr: 'div by 4 (and by 400 if a century)' }
        ] },
        { type: 'trick', title: 'Count month lengths', items: ['Within a year, add the days from a known date to the target date, then take mod 7.', 'Remember 30-day months (Apr, Jun, Sep, Nov); the rest are 31, except February.'] },
        { type: 'trap', items: ['Treating a century as a leap year without the ÷400 test (1900 was NOT, 2000 was).', 'Counting the start date itself when measuring a gap.', 'Forgetting a leap year adds 2 odd days, not 1.'] },
        { type: 'example', problem: 'If 1 March is a Monday, what day is 20 March (same year)?', steps: ['Gap = 20 − 1 = 19 days', '19 mod 7 = 5 odd days', 'Monday + 5 = Saturday'], answer: 'Saturday' },
        { type: 'revision', points: ['Only odd days (mod 7) matter.', 'Ordinary year = 1 odd day, leap = 2.', 'Leap: ÷4 (and ÷400 for centuries).', 'Add the gap to the known weekday and wrap.'] }
      ]
    },
    {
      id: 'lr-clocks', title: 'Clocks', icon: '🕐', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'lr-clock', searchTerms: ['clock', 'angle between hands', 'mirror time', 'hour hand'], related: ['lr-calendars'],
      sections: [
        { type: 'overview', text: 'Clock problems are about the angles of the hour and minute hands. The hour hand moves 0.5° per minute, the minute hand 6° per minute — every angle follows from that.' },
        { type: 'concept', title: 'Hand speeds', body: 'In 60 minutes the minute hand sweeps 360° (6°/min) and the hour hand 30° (0.5°/min). At H hours M minutes the hour hand is at 30H + 0.5M degrees and the minute hand at 6M degrees.' },
        { type: 'concept', title: 'Mirror image of a time', body: 'The mirror (left–right) image of a clock time T equals 11:60 − T. Subtract the time from 11 hours 60 minutes to read the reflected time.' },
        { type: 'formula', items: [
          { name: 'Angle between hands', expr: '|30H − 5.5M| , then take the smaller of that and 360 − it' },
          { name: 'Hour-hand position', expr: '30H + 0.5M degrees from 12' },
          { name: 'Mirror time', expr: '(11:60) − given time' }
        ] },
        { type: 'trick', title: 'Anchor on the hours', items: ['Each hour mark is 30° apart, so 3:00 = 90°, 6:00 = 180°.', 'The hands coincide 11 times in 12 hours, not 12.'] },
        { type: 'trap', items: ['Forgetting the hour hand drifts with the minutes — it is not parked on the hour.', 'Giving the reflex angle when the smaller angle was asked.', 'Assuming the hands meet exactly on the hour mark.'] },
        { type: 'example', problem: 'What is the angle between the hands at 3:00?', steps: ['H = 3, M = 0', '|30×3 − 5.5×0| = 90°', 'Smaller of 90 and 270 = 90°'], answer: '90°' },
        { type: 'revision', points: ['Minute hand 6°/min, hour hand 0.5°/min.', 'Angle = |30H − 5.5M|, then the smaller side.', 'Mirror time = 11:60 − time.', 'Hands overlap 11 times in 12 hours.'] }
      ]
    },
    {
      id: 'lr-critical-reasoning', title: 'Critical Reasoning', icon: '🧠', category: 'lr-reasoning', difficulty: 'advanced', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-critical', searchTerms: ['critical reasoning', 'assumption', 'strengthen', 'weaken', 'inference', 'cat verbal'], related: ['lr-statement-argument'],
      sections: [
        { type: 'overview', text: 'Critical Reasoning tests how an argument is built — its evidence, its conclusion, and the gap between them. You will be asked to find an assumption, or to strengthen, weaken or draw a valid inference. It rewards careful reading, not vocabulary.' },
        { type: 'concept', title: 'Argument anatomy', body: 'Separate the CONCLUSION (the claim) from the EVIDENCE (the support). The unstated link between them is the assumption — the soft target most questions attack or defend.' },
        { type: 'concept', title: 'Causal traps', body: 'Many arguments leap from a correlation to a cause. To weaken, supply an ALTERNATIVE cause; to strengthen, rule one out. Watch for self-selection and confounding variables.' },
        { type: 'formula', items: [
          { name: 'Assumption', expr: 'Negation test: negate it → the argument collapses ⇒ it was required' },
          { name: 'Weaken', expr: 'introduce an alternative cause or a counter-example' },
          { name: 'Strengthen', expr: 'confirm the cause→effect link or eliminate an alternative' },
          { name: 'Inference', expr: 'must be true from the stated facts — never goes beyond them' }
        ] },
        { type: 'trap', items: ['Picking an option that is true but OUT OF SCOPE — it must affect THIS argument.', 'Confusing a strengthener with a restatement of the conclusion.', 'Treating an inference as "likely" — it must be necessarily true.'] },
        { type: 'trick', title: 'Negate to test it', items: ['Negate a candidate assumption; if the argument collapses, it was required.', 'To weaken or strengthen, attack or defend the cause→effect link — not the conclusion itself.'] },
        { type: 'example', problem: 'Claim: raising parking fees will cut downtown traffic. Find the assumption.', steps: ['Conclusion: higher fees → less traffic', 'It assumes people currently drive in BECAUSE parking is affordable', 'Negate it (fees don\'t affect the choice) and the plan fails ⇒ required assumption'], answer: 'People drive in partly because parking is affordable.' },
        { type: 'revision', points: ['Split conclusion from evidence; the gap is the assumption.', 'Negation test confirms a required assumption.', 'Weaken = alternative cause; Strengthen = rule one out.', 'An inference must be necessarily true and within scope.'] }
      ]
    },
    {
      id: 'lr-statement-argument', title: 'Statement & Argument', icon: '💬', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-statement', searchTerms: ['statement assumption', 'statement conclusion', 'strong argument', 'implicit'], related: ['lr-critical-reasoning'],
      sections: [
        { type: 'overview', text: 'This family gives a statement and asks what is implicit (assumption), what follows (conclusion), or which argument is strong. The verdict-style options (Only I, Only II, Both, Neither, Either) demand precise reasoning.' },
        { type: 'concept', title: 'Assumption vs conclusion', body: 'An assumption is taken for granted BEHIND the statement; a conclusion is drawn FROM it. An assumption must be necessary, not merely plausible; a conclusion must follow with certainty.' },
        { type: 'concept', title: 'Strong vs weak arguments', body: 'A strong argument is both RELEVANT to the question and SUBSTANTIAL (addresses a real consequence). Vague fears, mere opinions and tiny side-effects are weak.' },
        { type: 'formula', items: [
          { name: 'Implicit assumption', expr: 'something the statement must take for granted to make sense' },
          { name: 'Valid conclusion', expr: 'must follow necessarily from the statement' },
          { name: 'Strong argument', expr: 'relevant + substantial (not an opinion or a remote effect)' }
        ] },
        { type: 'trap', items: ['Marking an over-strong assumption ("meets EVERY qualification") as implicit.', 'Accepting a conclusion that is only "possible", not certain.', 'Rating an emotional or trivial argument as strong.'] },
        { type: 'trick', title: 'Necessary, not merely nice', items: ['Keep an assumption only if the statement cannot stand without it.', 'A strong argument is both relevant AND substantial — drop opinions and remote effects.'] },
        { type: 'example', problem: 'Statement: "Send your résumé for the analyst role." Is "the sender is applying for the role" implicit?', steps: ['Sending a résumé "for the role" presupposes applying', 'It does NOT presuppose meeting every qualification', 'So only that first assumption is implicit'], answer: 'Yes — only that assumption is implicit.' },
        { type: 'revision', points: ['Assumption = taken for granted, and necessary.', 'Conclusion = follows with certainty.', 'Strong argument = relevant AND substantial.', 'Reject over-strong or merely possible options.'] }
      ]
    },
    {
      id: 'lr-decision-making', title: 'Decision Making', icon: '🤔', category: 'lr-reasoning', difficulty: 'advanced', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-decision', searchTerms: ['decision making', 'xat', 'ethical', 'managerial', 'best course'], related: ['lr-critical-reasoning'],
      sections: [
        { type: 'overview', text: 'Decision Making (the hallmark of XAT) places you in a managerial or ethical situation and asks for the best action. The winning choice is balanced, ethical and practical — not extreme, not self-serving.' },
        { type: 'concept', title: 'Weigh all stakeholders', body: 'Identify everyone affected — customers, employees, the organisation, the public — and look for the option that protects the most important interests (safety, integrity) while remaining workable.' },
        { type: 'concept', title: 'Priorities and ethics', body: 'Safety and integrity outrank deadlines and short-term profit. When facts are missing, the most useful information is whatever is decisive for the outcome (e.g. ability to repay for a loan).' },
        { type: 'formula', items: [
          { name: 'Best option', expr: 'balanced + ethical + practical' },
          { name: 'Priority order', expr: 'safety / integrity > deadlines > convenience > profit' },
          { name: 'Avoid', expr: 'extreme over-reactions and self-interested or dishonest choices' }
        ] },
        { type: 'trap', items: ['Choosing a drastic action (shut it down, fire everyone) when a measured fix exists.', 'Prioritising the deadline or profit over safety or honesty.', 'Picking an option that solves nothing (ignore it / hope it resolves).'] },
        { type: 'trick', title: 'Eliminate the extremes', items: ['Strike out the do-nothing and the drastic options first — the answer is usually the measured one.', 'Prefer the choice that protects safety and integrity and still works in practice.'] },
        { type: 'example', problem: 'A junior auditor finds a small but clear error overstating profit; the manager says ignore it. What should she do?', steps: ['Accuracy and integrity of the accounts come first, regardless of size', 'Raise it through the proper channel', 'Ignoring, hiding or resigning are all worse'], answer: 'Document and raise it through the proper channel.' },
        { type: 'revision', points: ['Pick the balanced, ethical, practical option.', 'Safety and integrity beat deadlines and profit.', 'Reject extremes and self-serving choices.', 'When data is missing, find the decisive fact.'] }
      ]
    },
    {
      id: 'lr-seating-puzzles', title: 'Seating Arrangement & Puzzles', icon: '🪑', category: 'lr-reasoning', difficulty: 'advanced', examFrequency: 'very-high', status: 'published',
      drillCategory: 'lr-seating', searchTerms: ['seating arrangement', 'puzzle', 'linear', 'floor puzzle', 'banking puzzle'], related: ['lr-ranking'],
      sections: [
        { type: 'overview', text: 'A puzzle gives one scenario (a row, a circle, or floors) and a set of clues that together pin down a single arrangement. Several questions then read off that arrangement. The skill is building the diagram efficiently.' },
        { type: 'concept', title: 'Start from fixed clues', body: 'Begin with the most restrictive, definite clues — who is at an end, an exact position, or "exactly between". Pencil those in first; they anchor everything else.' },
        { type: 'concept', title: 'Use elimination', body: 'Apply the remaining clues to narrow the open spots. A clue like "exactly 2 between A and B" or "immediately to the left of C" usually leaves only one consistent placement.' },
        { type: 'formula', items: [
          { name: 'Persons between', expr: '|position difference| − 1' },
          { name: 'Total from both ends', expr: 'left rank + right rank − 1' },
          { name: 'Order of work', expr: 'fixed/end clues → adjacency clues → leftover gaps' }
        ] },
        { type: 'trick', title: 'Draw it', items: ['Always draw the slots and fill in pencil; never solve a puzzle in your head.', 'For circles, fix one person and note whether they face the centre.'] },
        { type: 'trap', items: ['Starting from a vague clue instead of a fixed or end clue — you end up with many cases.', 'In a circle, ignoring whether people face the centre (it flips left and right).', 'Reading "between A and B" as immediately between unless it says "exactly".'] },
        { type: 'exam', items: ['Skim every clue first, then start with the most restrictive one — a wrong start wastes the whole set.', 'One fully-fixed diagram answers all 4–5 linked questions, so invest the time to pin it down.'] },
        { type: 'example', problem: 'Five sit in a row. C is at the right end. A is exactly between B and D. E is at the left end. Who can be 2nd from left?', steps: ['Fix E (left end) and C (right end): E _ _ _ C', 'A between B and D means B A D consecutive in the middle three', 'So E B A D C ⇒ 2nd from left is B'], answer: 'B' },
        { type: 'revision', points: ['Anchor on fixed/end clues first.', 'Persons between = |difference| − 1.', 'Apply adjacency clues to fill gaps.', 'Always draw the arrangement.'] }
      ]
    },
    {
      id: 'lr-nonverbal-images', title: 'Mirror, Water, Dice & Cubes', icon: '🪞', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-mirror', searchTerms: ['mirror image', 'water image', 'dice', 'cube', 'non-verbal', 'ssc reasoning'], related: ['lr-figure-series'],
      sections: [
        { type: 'overview', text: 'Non-verbal questions test spatial sense: how a figure looks reflected (mirror/water), or how a 3-D die or painted cube behaves. A few fixed rules cover most of them.' },
        { type: 'concept', title: 'Mirror vs water', body: 'A mirror image flips LEFT ↔ RIGHT (top and bottom stay put). A water image flips TOP ↔ BOTTOM (left and right stay put). Symmetric shapes look unchanged along their axis of symmetry.' },
        { type: 'concept', title: 'Dice and painted cubes', body: 'On a standard die, opposite faces sum to 7. When a cube is painted and cut into n×n×n pieces, the position (corner/edge/face/interior) decides how many faces are painted.' },
        { type: 'formula', items: [
          { name: 'Mirror image', expr: 'left ↔ right (vertical mirror)' },
          { name: 'Water image', expr: 'top ↔ bottom (horizontal reflection)' },
          { name: 'Opposite die face', expr: '7 − the shown face' },
          { name: 'Painted cube (n³)', expr: '3 faces = 8 ; 2 = 12(n−2) ; 1 = 6(n−2)² ; 0 = (n−2)³' }
        ] },
        { type: 'trap', items: ['Swapping mirror and water (left-right vs top-bottom).', 'Assuming two faces touching in a view are opposite — touching faces are ADJACENT.', 'Forgetting corner cubes always have exactly 3 painted faces.'] },
        { type: 'trick', title: 'Anchor the rules', items: ['Say it aloud: mirror = left↔right, water = top↔bottom.', 'Opposite die faces sum to 7; a painted cube\'s corners always have 3 faces.'] },
        { type: 'table', caption: 'Mirror vs Water vs Dice', headers: ['Transformation', 'Rule'], rows: [['Mirror image', 'left ↔ right (top & bottom unchanged)'], ['Water image', 'top ↔ bottom (left & right unchanged)'], ['Opposite die faces', 'always sum to 7'], ['Painted-cube corners', 'always 3 faces painted']] },
        { type: 'example', problem: 'A cube is painted and cut into 3×3×3 = 27 cubes. How many have exactly two faces painted?', steps: ['Two-faces = edge cubes = 12(n−2)', 'n = 3 ⇒ 12 × 1 = 12'], answer: '12' },
        { type: 'revision', points: ['Mirror = left↔right; water = top↔bottom.', 'Opposite die face = 7 − shown.', 'Painted cube: 8 / 12(n−2) / 6(n−2)² / (n−2)³.', 'Touching faces are adjacent, not opposite.'] }
      ]
    },
    {
      id: 'lr-figure-series', title: 'Figure Series & Analogy', icon: '🔷', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'lr-fseries', searchTerms: ['figure series', 'figure analogy', 'rotation', 'pattern', 'non-verbal'], related: ['lr-nonverbal-images', 'lr-analogies'],
      sections: [
        { type: 'overview', text: 'Figure series and analogy test how a picture TRANSFORMS — usually a rotation, a reflection, or a change of shading/elements. Spot the single consistent change and apply it.' },
        { type: 'concept', title: 'Name the transformation', body: 'Compare consecutive figures (series) or the first pair (analogy) and describe the change in words: "rotates 90° clockwise", "reflects", "one element added". One clean rule explains the whole set.' },
        { type: 'concept', title: 'Track each element', body: 'When a figure has several parts, follow each part separately — a marker may rotate while the outer shape stays, or shading may move one step each frame.' },
        { type: 'formula', items: [
          { name: 'Series', expr: 'apply the constant change once more for the next figure' },
          { name: 'Analogy', expr: 'A→B reveals the rule; apply the SAME rule to C' },
          { name: 'Rotation', expr: 'a fixed angle each step (e.g. +90°)' }
        ] },
        { type: 'trick', title: 'Check the simplest rule first', items: ['Most figure series are a fixed rotation — test that before anything elaborate.', 'A reflection reverses orientation; a rotation preserves it.'] },
        { type: 'trap', items: ['Confusing a rotation (orientation kept) with a reflection (orientation reversed).', 'Tracking only the outer shape and missing an inner element that also moves.', 'Forcing a complex rule when a constant rotation already fits every figure.'] },
        { type: 'example', problem: 'An arrow points up, then right, then down. What comes next?', steps: ['Each step is a 90° clockwise turn', 'After down, a 90° clockwise turn points left'], answer: 'An arrow pointing left.' },
        { type: 'revision', points: ['Describe the transformation in words.', 'Series: apply the change once more.', 'Analogy: apply A→B\'s rule to C.', 'Test a fixed rotation first; reflections reverse orientation.'] }
      ]
    },
    {
      id: 'lr-input-output', title: 'Input-Output (Machine)', icon: '⚙️', category: 'lr-reasoning', difficulty: 'advanced', examFrequency: 'medium', status: 'published',
      drillCategory: 'lr-io', searchTerms: ['input output', 'machine input', 'word arrangement', 'shifting', 'banking reasoning'], related: ['lr-series'],
      sections: [
        { type: 'overview', text: 'An input-output "machine" rearranges a line of words or numbers by a FIXED rule, one step at a time, until it is fully arranged. Your job is to apply the rule mechanically and report the line (or a position) after a given step.' },
        { type: 'concept', title: 'Find the rule, then march', body: 'Compare the input to step 1 to see what moved — usually the smallest (or alphabetically first) item shifts to one end. The same operation repeats every step. Do not jump ahead; rewrite the WHOLE line each step.' },
        { type: 'concept', title: 'Track only what you need', body: 'If the question asks for the item at a particular position after step N, you only need to simulate up to step N. Each step fixes one more item at the arranged end.' },
        { type: 'formula', items: [
          { name: 'Per step', expr: 'move the next-in-order item to the arranged end' },
          { name: 'Steps to finish', expr: 'an n-item line is fully arranged in n−1 steps' },
          { name: 'Position after step N', expr: 'simulate N steps, then read the asked slot' }
        ] },
        { type: 'trick', title: 'Rewrite, don\'t imagine', items: ['Physically rewrite the line each step — mental tracking is where errors creep in.', 'After step k, the first k positions (or last k) are already in final order; ignore them.'] },
        { type: 'trap', items: ['Jumping ahead instead of rewriting the whole line each step.', 'Assuming the machine arranges both ends when it fixes only one.', 'Re-moving an item that is already locked in the arranged part.'] },
        { type: 'example', problem: 'Rule: each step moves the smallest remaining number to the left end. Input: 23, 12, 45, 31. What is the 2nd number from the left after Step 2?', steps: ['Step 1 → 12, 23, 45, 31 (smallest 12 to front)', 'Step 2 → 12, 23, 45, 31 (next smallest 23 already in place)', '2nd from left = 23'], answer: '23' },
        { type: 'revision', points: ['Find the rule from input → step 1.', 'Apply it one step at a time; rewrite the whole line.', 'n items finish in n−1 steps.', 'Simulate only up to the asked step.'] }
      ]
    },
    {
      id: 'lr-cause-effect', title: 'Cause & Effect', icon: '⛓️', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'lr-cause', searchTerms: ['cause and effect', 'causal', 'common cause', 'reason', 'banking reasoning'], related: ['lr-critical-reasoning'],
      sections: [
        { type: 'overview', text: 'Cause-and-effect questions give two statements and ask how they are related: does one cause the other, are both effects of a single common cause, or are they unrelated? The trap is mistaking things that merely happen together for cause and effect.' },
        { type: 'concept', title: 'Order and mechanism', body: 'A cause comes BEFORE its effect and plausibly produces it. Ask: which event happened first, and does it explain the other? If yes, you have a cause→effect pair.' },
        { type: 'concept', title: 'The common-cause trap', body: 'Two events that rise together need not cause each other — both may be effects of a third, common cause (e.g. umbrella sales and raincoat sales both rise because of rain). Always check for a hidden shared cause.' },
        { type: 'formula', items: [
          { name: 'I causes II', expr: 'I happens first and explains II' },
          { name: 'Common cause', expr: 'neither causes the other; a third factor causes both' },
          { name: 'Unrelated', expr: 'no plausible link and no shared cause' }
        ] },
        { type: 'trap', items: ['Treating correlation (they occur together) as causation.', 'Ignoring a third factor that drives both statements.', 'Reversing the direction — checking which event truly came first.'] },
        { type: 'trick', title: 'Ask "what came first?"', items: ['Order the two events in time — a cause must come before its effect.', 'If both rise together, hunt for a third common cause before claiming one causes the other.'] },
        { type: 'example', problem: 'I: Ice-cream sales peaked in May. II: Cases of sunburn peaked in May. Relationship?', steps: ['Ice-cream does not cause sunburn, nor the reverse', 'Both peak because of hot, sunny weather', 'They are independent effects of a common cause'], answer: 'Common cause (summer weather)' },
        { type: 'revision', points: ['Cause precedes and explains the effect.', 'Co-occurrence ≠ causation.', 'Check for a hidden common cause.', 'If no link and no shared cause → unrelated.'] }
      ]
    },
    {
      id: 'lr-course-of-action', title: 'Course of Action', icon: '✅', category: 'lr-reasoning', difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: 'lr-course', searchTerms: ['course of action', 'follows', 'problem solving', 'decision', 'banking reasoning'], related: ['lr-statement-argument'],
      sections: [
        { type: 'overview', text: 'A course-of-action question states a problem and proposes one or more actions; you decide which actions logically "follow". An action follows only if it directly addresses the problem AND is practical and proportionate.' },
        { type: 'concept', title: 'Two tests for "follows"', body: 'A valid course of action must (1) be RELEVANT — it tackles the actual cause of the problem, and (2) be REASONABLE — practical, proportionate, and not an over-reaction. An action failing either test does not follow.' },
        { type: 'concept', title: 'Reject the extremes', body: 'Drastic actions (ban everything, shut it down permanently, fire everyone) almost never follow — they are disproportionate. Vague or do-nothing actions also fail. Favour the measured, cause-addressing step.' },
        { type: 'formula', items: [
          { name: 'Follows', expr: 'relevant to the cause AND practical/proportionate' },
          { name: 'Does not follow', expr: 'irrelevant, extreme, vague, or impractical' },
          { name: 'Both / Either', expr: 'apply the two tests to each action independently' }
        ] },
        { type: 'trap', items: ['Accepting an extreme action (permanent ban/shutdown) as a valid course.', 'Accepting an action that does not address the actual cause.', 'Rejecting a sensible action because it is not a complete cure.'] },
        { type: 'trick', title: 'Two quick filters', items: ['Drop any action that is extreme or vague — it fails the "reasonable" test.', 'Keep an action only if it tackles the actual CAUSE of the problem.'] },
        { type: 'example', problem: 'Problem: students fell ill after eating at the canteen. Action I: inspect the canteen\'s food and hygiene. Action II: shut the canteen permanently. Which follows?', steps: ['I investigates the actual cause — relevant and practical → follows', 'II is disproportionate before the cause is even known → does not follow'], answer: 'Only I follows' },
        { type: 'revision', points: ['An action follows only if relevant AND reasonable.', 'Reject extreme or disproportionate steps.', 'Reject vague or do-nothing actions.', 'Test each action independently.'] }
      ]
    }
  ];

  KB.registerAll('lr-reasoning', TOPICS);

  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
