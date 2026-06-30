/**
 * data/knowledge/arithmetic.js — "Arithmetic" category knowledge objects (ADR-069, Phase 3 gold-standard content).
 * Original exam-grade explanations; organisation inspired by the standard speed-maths cheat sheets. No filler.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  var TOPICS = [
    {
      id: 'percentages', title: 'Percentages', icon: '💯', category: 'arithmetic',
      difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: 'percentages', syllabusTopicId: 'percentages', revisionIntervalDays: 3,
      related: ['profit-loss', 'ratio-proportion', 'averages'],
      searchTerms: ['%', 'percent', 'per cent', 'increase', 'decrease', 'change', 'successive', 'discount'],
      sections: [
        { type: 'overview', text: 'A percentage is just a fraction out of 100. It is the single most reused idea in arithmetic — profit & loss, interest, data interpretation and mixtures are all percentages in disguise. Speed here comes from thinking in fractions, not decimals.' },
        { type: 'concept', title: 'Percent ↔ fraction ↔ ratio', body: 'x% means x/100. "A is 25% more than B" makes A : B = 125 : 100 = 5 : 4. Converting a percentage to a clean ratio is usually faster than working with the decimal.' },
        { type: 'concept', title: 'The multiplier trick', body: 'Increasing by p% multiplies by (1 + p/100); decreasing by p% multiplies by (1 − p/100). Chain changes by multiplying the factors: +20% then −10% → ×1.2 ×0.9 = ×1.08, i.e. a net +8%.' },
        { type: 'formula', items: [
          { name: 'Percentage of a number', expr: 'x% of y = (x × y) / 100', when: 'Both the percentage and the base are given.' },
          { name: 'Percentage change', expr: '% change = (New − Old) / Old × 100', when: 'Positive = increase, negative = decrease. Always divide by the OLD value.', trap: 'Dividing by the new value instead of the old.' },
          { name: 'Successive change', expr: 'Net % = a + b + (a·b)/100', when: 'Two changes in a row (use a negative sign for a decrease).' },
          { name: 'Percent more / less → ratio', expr: 'A is p% more than B ⇒ A : B = (100 + p) : 100;  p% less ⇒ (100 − p) : 100', when: 'Comparison and DI questions.' }
        ] },
        { type: 'trick', title: 'Fraction equivalents (memorise these)', items: [
          '1/2 = 50%, 1/3 = 33⅓%, 1/4 = 25%, 1/5 = 20%, 1/6 = 16⅔%, 1/8 = 12.5%.',
          '3/8 = 37.5%, 5/8 = 62.5%, 1/9 = 11.1%, 1/11 = 9.09%.',
          'Seeing 37.5% of 256 as 3/8 of 256 gives 96 instantly — no long multiplication.'
        ] },
        { type: 'trick', title: 'The +x% then −x% trap', items: [
          'Raising then lowering by the SAME percent never returns to the start.',
          'Net change = −x²/100 (always a small LOSS). +20% then −20% → −400/100 = −4%.'
        ] },
        { type: 'exam', items: ['Convert every percentage to a fraction (25% = 1/4, 12.5% = 1/8) to kill the decimal arithmetic.', 'In DI, reason with the percentage CHANGE and the base, not the raw numbers.'] },
        { type: 'example', problem: 'A salary is increased by 20% and then decreased by 20%. What is the net change?', steps: [
          'Net % = a + b + ab/100 with a = +20, b = −20.',
          '= 20 − 20 + (20·−20)/100 = 0 − 4.'
        ], answer: '4% decrease' },
        { type: 'example', problem: 'In an election the winner got 60% of the votes and won by 1600 votes. Find the total votes (two candidates).', steps: [
          'Winner 60%, loser 40% → margin = 20% of total.',
          '20% of total = 1600 → total = 1600 × 100/20.'
        ], answer: '8000 votes' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Adding successive percentages directly (forgetting the ab/100 term).',
          'Using the new value as the base for % change instead of the old.',
          'Confusing "x% more" (÷ by 100) with "x percentage points more".',
          'Assuming +x% and −x% cancel out.'
        ] },
        { type: 'memory', text: 'Percentage change is "difference over ORIGINAL, times 100". The original is always the denominator.' },
        { type: 'revision', points: [
          'x% of y = xy/100; increase ⇒ ×(1+p/100), decrease ⇒ ×(1−p/100).',
          'Successive: a + b + ab/100.  Same +x then −x ⇒ −x²/100.',
          '% change divides by the OLD value.',
          'Know the fraction table (1/8 = 12.5%, 3/8 = 37.5%, 1/6 = 16⅔%…).'
        ] }
      ]
    },
    {
      id: 'ratio-proportion', title: 'Ratio & Proportion', icon: '⚖️', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'ratios', syllabusTopicId: 'ratio_proportion', revisionIntervalDays: 4,
      related: ['percentages', 'averages', 'mixtures-alligations'],
      searchTerms: ['ratio', 'proportion', 'a:b', 'parts', 'alligation', 'mixture', 'compound ratio', 'variation'],
      sections: [
        { type: 'overview', text: 'A ratio compares two quantities of the same kind; a proportion says two ratios are equal. The whole topic reduces to one habit: convert the ratio into "parts", find the value of one part, then scale.' },
        { type: 'concept', title: 'Ratio as parts', body: 'If A : B = x : y, then A and B are x parts and y parts of a total of (x + y) parts. So A = x/(x+y) × Total. This single idea solves "divide ₹300 in 2 : 3" and most word problems.' },
        { type: 'concept', title: 'Proportion & alligation', body: 'a : b = c : d means the cross-products match: a·d = b·c. Alligation applies this to mixing — it gives the ratio in which two ingredients must be combined to hit a target average.' },
        { type: 'formula', items: [
          { name: 'Part from a ratio', expr: 'If A : B = x : y, A = x/(x+y) × Total', when: 'Splitting a total in a given ratio (works for 3+ parts too).' },
          { name: 'Proportion (cross-multiply)', expr: 'a : b = c : d ⇔ a·d = b·c', when: 'Checking or completing a proportion.' },
          { name: 'Compound ratio', expr: '(a : b) × (c : d) = ac : bd', when: 'Combining ratios (e.g. speed × time effects).' },
          { name: 'Alligation rule', expr: 'Cheaper : Dearer = (Dearer − Mean) : (Mean − Cheaper)', when: 'Mixtures and weighted-average problems.' }
        ] },
        { type: 'trick', title: 'When a difference is given', items: [
          'If A : B = 3 : 5 and B − A = 20, the difference is (5 − 3) = 2 parts.',
          '2 parts = 20 → 1 part = 10 → A = 30, B = 50. Read the question for "sum", "difference", or "one quantity" and equate the right number of parts.'
        ] },
        { type: 'example', problem: 'Divide ₹3500 between A and B in the ratio 3 : 4.', steps: [
          'Total parts = 3 + 4 = 7.',
          '1 part = 3500 ÷ 7 = 500.',
          'A = 3 × 500 = 1500, B = 4 × 500 = 2000.'
        ], answer: 'A = ₹1500, B = ₹2000' },
        { type: 'example', problem: 'In what ratio must rice at ₹30/kg be mixed with rice at ₹40/kg to get a mixture worth ₹36/kg?', steps: [
          'Alligation: Cheaper : Dearer = (40 − 36) : (36 − 30).',
          '= 4 : 6 = 2 : 3.'
        ], answer: '2 : 3' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Adding/subtracting a number to a ratio directly (a ratio has no units — convert to parts first).',
          'Forgetting to simplify a compound or continued ratio.',
          'Swapping the alligation arms (the result is the ratio of QUANTITIES, cheaper to dearer).',
          'Comparing ratios of different things (units must match).'
        ] },
        { type: 'memory', text: 'Alligation arms cross: each ingredient pairs with the |distance| of the OTHER ingredient from the mean.' },
        { type: 'revision', points: [
          'A : B = x : y ⇒ A = x/(x+y) × Total.',
          'Proportion ⇒ cross-products equal: a·d = b·c.',
          'Alligation: ratio = (Dearer − Mean) : (Mean − Cheaper).',
          'Map the given (sum / difference / one part) to the right number of parts.'
        ] }
      ]
    },
    {
      id: 'averages', title: 'Averages', icon: '📈', category: 'arithmetic',
      difficulty: 'foundation', examFrequency: 'high', status: 'published',
      drillCategory: 'averages', syllabusTopicId: 'averages', revisionIntervalDays: 4,
      related: ['ratio-proportion', 'percentages'],
      searchTerms: ['average', 'mean', 'weighted', 'replacement', 'consecutive'],
      sections: [
        { type: 'overview', text: 'The average is the value every item would have if the total were shared equally. Most exam questions are really about the TOTAL — find Sum = Average × Count, change the total, then re-average.' },
        { type: 'concept', title: 'Sum is the real unknown', body: 'Average = Sum / Count, so Sum = Average × Count. When an item is added, removed or replaced, adjust the Sum and divide again. This beats re-adding the whole list.' },
        { type: 'concept', title: 'Averages of standard series', body: 'For consecutive numbers the average is simply the middle value (or the average of the first and last). This collapses long "average of 1..n" sums to one step.' },
        { type: 'formula', items: [
          { name: 'Basic average', expr: 'Average = Sum / Count   ⇒   Sum = Average × Count', when: 'The workhorse — rearrange to get the total.' },
          { name: 'Weighted average', expr: 'Avg = (n₁a₁ + n₂a₂ + …) / (n₁ + n₂ + …)', when: 'Combining groups of different sizes.' },
          { name: 'Replacement', expr: 'New average = Old average + (New value − Old value) / n', when: 'One of n items is swapped out.' },
          { name: 'First n naturals / odd / even', expr: 'Avg(1..n) = (n+1)/2;  Avg(first n odd) = n;  Avg(first n even) = n+1', when: 'Consecutive-series shortcuts.' }
        ] },
        { type: 'trick', title: 'Deviation method', items: [
          'Pick a convenient base near the numbers; average the deviations; add back the base.',
          'Average of 48, 52, 49, 51 → base 50, deviations −2,+2,−1,+1 → average deviation 0 → answer 50.'
        ] },
        { type: 'example', problem: 'The average of 10 numbers is 50. A number 25 is replaced by 75. Find the new average.', steps: [
          'New average = old + (new − old)/n = 50 + (75 − 25)/10.',
          '= 50 + 50/10 = 50 + 5.'
        ], answer: '55' },
        { type: 'example', problem: 'A batsman averages 40 in 10 innings. What must he score in the 11th innings to raise his average to 42?', steps: [
          'Old total = 40 × 10 = 400.',
          'Required new total = 42 × 11 = 462.',
          'Needed runs = 462 − 400.'
        ], answer: '62' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Averaging two averages directly when the groups differ in size (use the weighted average).',
          'Forgetting the new count when an item is added or removed.',
          'Mixing "average increases by 2" with "11th score is 2 more than the average".',
          'Using simple mean of speeds for equal distances (that needs the harmonic 2xy/(x+y)).'
        ] },
        { type: 'memory', text: 'Average questions are TOTAL questions: Sum = Average × Count. Change the sum, re-divide.' },
        { type: 'revision', points: [
          'Sum = Average × Count; adjust the sum, then re-average.',
          'Weighted average for unequal group sizes.',
          'Replacement: new avg = old avg + (new − old)/n.',
          'Avg of consecutive numbers = middle term = (first + last)/2.'
        ] }
      ]
    },
    {
      id: 'time-and-work', title: 'Time & Work', icon: '🔧', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'time-and-work', syllabusTopicId: 'time_work', revisionIntervalDays: 5,
      related: ['pipes-and-cisterns', 'time-speed-distance'],
      searchTerms: ['work', 'efficiency', 'man days', 'rate', 'together', 'lcm method', 'mdh'],
      sections: [
        { type: 'overview', text: 'Treat the job as a fixed pile of "units" of work. The LCM method turns almost every Time-&-Work question into one line: make the total work the LCM of the given days, read each worker\'s units/day, then add or subtract rates.' },
        { type: 'concept', title: 'The LCM (units) method', body: 'If A finishes in 10 days and B in 20, let total work = LCM(10,20) = 20 units. Then A does 20/10 = 2 units/day and B does 20/20 = 1 unit/day. Together = 3 units/day, so time = 20/3 days. No fractions of work needed.' },
        { type: 'concept', title: 'Efficiency is inverse of time', body: 'For a fixed job, more efficient = fewer days. If A is 60% more efficient than B, their efficiency ratio is 160 : 100 = 8 : 5, so their TIME ratio is the inverse, 5 : 8.' },
        { type: 'formula', items: [
          { name: 'Work = Rate × Time', expr: 'Work done = Efficiency × Time', when: 'The basic relation; with fixed work, efficiency ∝ 1/time.' },
          { name: 'Two together', expr: 'A in x days, B in y days ⇒ together = xy/(x+y) days', when: 'Two workers combining (from 1/x + 1/y = 1/T).' },
          { name: 'Man–Day–Hour', expr: 'M₁·D₁·H₁ = M₂·D₂·H₂  (same work)', when: 'Changing the number of men, days or hours/day.' },
          { name: 'Efficiency ↔ time', expr: 'Efficiency ratio = inverse of time ratio', when: '"x% more efficient" problems.' }
        ] },
        { type: 'trick', title: 'Wages split by efficiency', items: [
          'Pay is shared in the ratio of WORK done = ratio of (units/day × days worked).',
          'If A and B share a job and finish together, wages split in the ratio of their daily rates.'
        ] },
        { type: 'example', problem: 'A can do a job in 10 days, B in 15 days. Working together, how long do they take?', steps: [
          'Total work = LCM(10,15) = 30 units.',
          'A = 30/10 = 3/day, B = 30/15 = 2/day → together 5/day.',
          'Time = 30 / 5.'
        ], answer: '6 days' },
        { type: 'example', problem: '25 men build a wall in 12 days. How many days for 30 men (same wall)?', steps: [
          'M₁D₁ = M₂D₂ → 25 × 12 = 30 × D.',
          'D = 300 / 30.'
        ], answer: '10 days' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Adding DAYS instead of RATES (you add units/day, never the days).',
          'Confusing efficiency ratio with time ratio — they are inverses.',
          'Forgetting the hours/day factor in man-day-hour problems.',
          'Splitting wages by time taken rather than by work done.'
        ] },
        { type: 'exam', title: 'How toppers attack it', items: [
          'Default to the LCM-units method — it kills fractions and the answer usually falls out in one line.',
          'When workers join or leave midway, track units completed so far, then divide the remaining units by the new combined rate.',
          'Read "x% more efficient" as an efficiency ratio and invert it for time — don\'t apply the % to the days.'
        ] },
        { type: 'memory', text: 'Make the work the LCM of the days → everyone gets whole units/day → just add or subtract rates.' },
        { type: 'revision', points: [
          'LCM method: total work = LCM(days); rate = total/days.',
          'Together (two): xy/(x+y).',
          'M₁D₁H₁ = M₂D₂H₂.',
          'Efficiency ratio = inverse of time ratio; wages ∝ work done.'
        ] }
      ]
    },
    {
      id: 'pipes-and-cisterns', title: 'Pipes & Cisterns', icon: '🚰', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      // No dedicated Pipes & Cisterns drill exists yet, and reusing the 'time-and-work' bank would launch the WRONG
      // questions — so Practice is intentionally pending (drillComingSoon) rather than misleading. Restore a real
      // drillCategory once a dedicated pipes bank ships.
      drillCategory: null, drillComingSoon: true, syllabusTopicId: 'pipes_cisterns', revisionIntervalDays: 6,
      related: ['time-and-work'],
      searchTerms: ['pipe', 'cistern', 'tank', 'inlet', 'outlet', 'leak', 'fill', 'empty', 'drain'],
      sections: [
        { type: 'overview', text: 'Pipes & Cisterns is Time-&-Work wearing a different hat: the tank is the "work" and pipes are "workers". A filling pipe adds units, an emptying pipe (or leak) subtracts them. Use the same LCM method.' },
        { type: 'concept', title: 'Positive fills, negative empties', body: 'Make the tank = LCM of the pipe times. A filling pipe contributes +(tank/its time) units per hour; an emptying pipe contributes −(tank/its time). Add the signed rates to get the net rate.' },
        { type: 'concept', title: 'Reading the question', body: 'If the net rate is positive the tank fills (time = tank ÷ net); if negative it drains. A "leak" is just an emptying pipe you must subtract. Half-full / partial problems scale the remaining units only.' },
        { type: 'formula', items: [
          { name: 'Net rate', expr: 'Net = Σ(fill rates) − Σ(empty rates)', when: 'Several pipes open together.' },
          { name: 'Time to fill', expr: 'Time = Tank units / Net rate', when: 'Net rate is positive (filling).' },
          { name: 'Fill + drain (one each)', expr: 'A fills in x, B empties in y ⇒ time = xy/(y − x), for y > x', when: 'One inlet and one outlet open together.' }
        ] },
        { type: 'trick', title: 'Leak problems', items: [
          'If a full tank empties via a leak in L hours, the leak rate is −(tank/L).',
          'When a pipe fills in x but takes longer (x′) due to a leak, the leak alone empties the tank in (x·x′)/(x′ − x) hours.'
        ] },
        { type: 'example', problem: 'A fills a tank in 10 h, B in 15 h, and C (outlet) empties it in 30 h. All open together — how long to fill?', steps: [
          'Tank = LCM(10,15,30) = 30 units.',
          'A = +3, B = +2, C = −1 → net = 3 + 2 − 1 = 4 units/h.',
          'Time = 30 / 4.'
        ], answer: '7.5 hours' },
        { type: 'example', problem: 'Pipe A fills a tank in 6 h; pipe B empties it in 8 h. If both open on an empty tank, when is it full?', steps: [
          'Tank = LCM(6,8) = 24 units.',
          'A = +4, B = −3 → net = +1 unit/h.',
          'Time = 24 / 1.'
        ], answer: '24 hours' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Forgetting the negative sign on an emptying pipe or leak.',
          'Adding times instead of rates.',
          'Assuming the tank fills when the net rate is actually negative (it drains).',
          'Ignoring that a partially-filled tank has fewer units left to fill.'
        ] },
        { type: 'memory', text: 'Inlet = +, outlet/leak = −. Same LCM-units method as Time & Work — just mind the signs.' },
        { type: 'revision', points: [
          'Tank = LCM(times); fill = +rate, empty = −rate.',
          'Net rate = fills − empties; time = tank / net.',
          'One in + one out: xy/(y − x).',
          'Leak that delays a fill from x to x′: empties alone in xx′/(x′−x).'
        ] }
      ]
    },
    {
      id: 'time-speed-distance', title: 'Time, Speed & Distance', icon: '🚀', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'time-speed-distance', syllabusTopicId: 'tsd', revisionIntervalDays: 5,
      related: ['time-and-work'],
      searchTerms: ['speed', 'distance', 'time', 'relative speed', 'trains', 'average speed', 'km/h', 'm/s', 'tsd'],
      sections: [
        { type: 'overview', text: 'One relation — Speed = Distance ÷ Time — drives trains, boats and races. The marks are won on two sub-skills: relative speed (objects moving together/apart) and the correct average-speed formula for equal distances.' },
        { type: 'concept', title: 'Proportionality shortcuts', body: 'For a fixed distance, time is inversely proportional to speed (speed ↑ ⇒ time ↓). For a fixed time, distance ∝ speed. Spotting which quantity is constant turns most problems into a one-step ratio.' },
        { type: 'concept', title: 'Relative speed', body: 'Two bodies moving in the SAME direction close/separate at the difference of speeds |S₁ − S₂|; in OPPOSITE directions, at the sum S₁ + S₂. A train crossing a pole travels its own length; crossing a platform travels (length + platform).' },
        { type: 'formula', items: [
          { name: 'Core relation', expr: 'Speed = Distance / Time', when: 'Also Distance = Speed × Time and Time = Distance / Speed.' },
          { name: 'Unit conversion', expr: 'km/h → m/s: × 5/18;   m/s → km/h: × 18/5', when: 'Always convert before substituting.' },
          { name: 'Average speed (equal distances)', expr: 'Avg speed = 2xy / (x + y)', when: 'Same distance covered at two speeds x and y.', trap: 'Never average the two speeds directly here.' },
          { name: 'Relative speed', expr: 'Same direction: |S₁ − S₂|;  Opposite: S₁ + S₂', when: 'Trains, chases and crossings.' }
        ] },
        { type: 'trick', title: 'Train crossing distances', items: [
          'Crossing a pole/man → distance = train length.',
          'Crossing a platform/bridge → distance = train length + platform length.',
          'Two trains crossing → distance = sum of both lengths, at the relative speed.'
        ] },
        { type: 'example', problem: 'A 180 m long train runs at 54 km/h. How long to cross a pole?', steps: [
          '54 km/h × 5/18 = 15 m/s.',
          'Distance = train length = 180 m.',
          'Time = 180 / 15.'
        ], answer: '12 seconds' },
        { type: 'example', problem: 'A car covers a distance at 60 km/h and returns at 40 km/h. Find the average speed.', steps: [
          'Equal distances ⇒ avg = 2xy/(x+y).',
          '= 2·60·40 / (60 + 40) = 4800 / 100.'
        ], answer: '48 km/h' },
        { type: 'trap', title: 'Common mistakes', items: [
          'Averaging the two speeds directly for equal distances (use 2xy/(x+y)).',
          'Forgetting to convert km/h ↔ m/s before computing.',
          'Using sum instead of difference (or vice-versa) for relative speed.',
          'Forgetting the platform length when a train crosses a platform.'
        ] },
        { type: 'memory', text: 'Equal distances → harmonic average 2xy/(x+y). Same way → subtract speeds; opposite → add.' },
        { type: 'revision', points: [
          'Speed = Distance / Time; convert km/h ↔ m/s with 5/18.',
          'Equal-distance average = 2xy/(x+y), never the simple mean.',
          'Relative speed: same dir = difference, opposite = sum.',
          'Pole → length; platform → length + platform.'
        ] }
      ]
    },
    {
      id: 'ages', title: 'Problems on Ages', icon: '🎂', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: null, syllabusTopicId: 'ages', revisionIntervalDays: 6,
      related: ['ratio-proportion', 'averages'],
      searchTerms: ['age', 'ages', 'years', 'present age', 'years ago', 'years hence', 'elder', 'younger'],
      sections: [
        { type: 'overview', text: 'Age problems are just linear equations dressed in words. Name ONE present age as a variable, write everyone else in terms of it, and apply the time shifts carefully. The one fact that breaks most questions open: the DIFFERENCE between two people\'s ages never changes.' },
        { type: 'concept', title: 'Set the present age as the variable', body: 'Let the present age you know least about be x. Express the rest from the wording ("A is 4 years older than B" → A = B + 4). "n years ago" means subtract n from EVERY age; "n years hence/later" means add n to every age — including both people in the comparison.' },
        { type: 'concept', title: 'The age difference is constant', body: 'If A is 6 years older than B today, A was 6 years older 10 years ago and will be 6 years older 20 years hence. Ratios change with time, but the difference is fixed — use it to pin one equation instantly.' },
        { type: 'formula', items: [
          { name: 'Time shift', expr: 'Age n years ago = present − n ; n years hence = present + n', when: 'Apply to BOTH people in any comparison.' },
          { name: 'Ratio at a time point', expr: 'If ages are in ratio a : b, write them as ak and bk', when: 'A ratio is given — introduce one multiplier k, then use a second condition to find k.' },
          { name: 'Constant difference', expr: '(elder age) − (younger age) = same at every time', when: 'Two people compared across different times.' }
        ] },
        { type: 'trick', title: 'Speed technique', items: [
          'When a ratio is given at one time and another ratio at a different time, write both as multiples and use the constant difference to solve in one step.',
          'Translate the sentence left to right into algebra immediately — don\'t hold the words in your head.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Shifting only ONE person\'s age for "n years ago/hence" — shift everyone in that comparison.',
          'Applying a present-day ratio to a past or future age (the ratio holds only at the stated time).',
          'Mixing "older/younger" direction — older means a LARGER number.',
          'Forgetting to convert the final multiplier k back into an actual age.'
        ] },
        { type: 'example', problem: 'The ratio of A\'s to B\'s present age is 4 : 3. After 6 years it becomes 6 : 5. Find A\'s present age.', steps: [
          'Let A = 4k, B = 3k.',
          'After 6 years: (4k + 6)/(3k + 6) = 6/5.',
          'Cross-multiply: 5(4k + 6) = 6(3k + 6) → 20k + 30 = 18k + 36 → 2k = 6 → k = 3.',
          'A = 4k = 4 × 3.'
        ], answer: '12 years' },
        { type: 'example', problem: 'A father is 30 years older than his son. In 12 years he will be twice as old as the son. Find the son\'s present age.', steps: [
          'Let son = x, father = x + 30 (constant difference 30).',
          'In 12 years: (x + 30) + 12 = 2(x + 12) → x + 42 = 2x + 24.',
          'So x = 18.'
        ], answer: '18 years' },
        { type: 'memory', text: 'One variable, shift everyone together, and lean on the difference that never moves.' },
        { type: 'revision', points: [
          'Pick one present age = x; write the rest from the words.',
          '"Years ago" subtract from all; "years hence" add to all.',
          'Age difference is constant — a free equation.',
          'A given ratio holds only at its stated time point.'
        ] }
      ]
    },
    {
      id: 'mixtures-alligations', title: 'Mixtures & Alligations', icon: '🧪', category: 'arithmetic',
      difficulty: 'core', examFrequency: 'medium', status: 'published',
      drillCategory: null, syllabusTopicId: 'mixtures', revisionIntervalDays: 6,
      related: ['ratio-proportion', 'averages'],
      searchTerms: ['mixture', 'alligation', 'replacement', 'milk water', 'dilution', 'cheaper dearer', 'blend', 'ratio'],
      sections: [
        { type: 'overview', text: 'Alligation is the fast way to mix two things to hit a target average — price, concentration, speed, anything. The rule gives you the RATIO in which to combine them. The second half of the topic is repeated replacement: drawing off and topping up a vessel, where the pure part decays by a fixed factor each round.' },
        { type: 'concept', title: 'The alligation cross', body: 'To reach a mean value M by mixing a cheaper item (cost C) and a dearer item (cost D): the ratio of quantities (cheaper : dearer) = (D − M) : (M − C). Each part takes the DISTANCE from the OTHER item to the mean. Same idea works for concentration or any weighted average.' },
        { type: 'concept', title: 'It is just a weighted average, rearranged', body: 'M sits between C and D, closer to whichever ingredient you use more of. So the quantity of each is proportional to how far the mean is from the OTHER ingredient — that\'s why the cross swaps the differences.' },
        { type: 'concept', title: 'Repeated replacement', body: 'If a vessel holds V of pure liquid and you remove x and refill with water, then repeat n times, the pure liquid left is V·(1 − x/V)ⁿ. Each operation keeps the same FRACTION (1 − x/V) of whatever pure liquid remained.' },
        { type: 'formula', items: [
          { name: 'Alligation ratio', expr: 'cheaper : dearer = (D − M) : (M − C)', when: 'Mixing two grades/prices/strengths to a mean M.' },
          { name: 'Repeated replacement', expr: 'pure left = V·(1 − x/V)ⁿ', when: 'Draw off x and top up with water, n times.' },
          { name: 'Mean (check)', expr: 'M = (C·q₁ + D·q₂)/(q₁ + q₂)', when: 'Verifying a blend\'s average from known quantities.' }
        ] },
        { type: 'trick', title: 'Speed technique', items: [
          'Put the mean in the middle, the two ingredients on the left; subtract diagonally; read the ratio across — quantity of each is the difference from the OTHER one.',
          'For replacement, you only need the FRACTION (1 − x/V); raise it to the power n and multiply by V.'
        ] },
        { type: 'trap', title: 'Common mistakes', items: [
          'Reversing the cross — the cheaper quantity pairs with (D − M), the distance from the DEARER side.',
          'Using (removed/total) wrong in replacement: the surviving fraction is (1 − x/V), not x/V.',
          'Forgetting that after the first replacement the volume is back to V (you topped it up).',
          'Mixing percentages and absolute amounts in the same cross — keep units consistent.'
        ] },
        { type: 'example', problem: 'In what ratio must rice at ₹30/kg be mixed with rice at ₹45/kg to get a mixture worth ₹40/kg?', steps: [
          'C = 30, D = 45, M = 40.',
          'cheaper : dearer = (D − M) : (M − C) = (45 − 40) : (40 − 30) = 5 : 10.',
          'Simplify 5 : 10.'
        ], answer: '1 : 2' },
        { type: 'example', problem: 'A 40-litre vessel is full of milk. 8 litres are drawn off and replaced with water; this is done twice. How much milk remains?', steps: [
          'Surviving fraction each time = 1 − 8/40 = 1 − 1/5 = 4/5.',
          'After 2 operations: 40 × (4/5)² = 40 × 16/25.',
          'Compute: 640/25 = 25.6.'
        ], answer: '25.6 litres' },
        { type: 'memory', text: 'Cross the differences, read across; for replacement, keep (1 − x/V) and raise to the power n.' },
        { type: 'revision', points: [
          'cheaper : dearer = (D − M) : (M − C) — each takes the distance from the OTHER.',
          'Mean lies nearer the ingredient used in greater quantity.',
          'Repeated replacement: pure left = V·(1 − x/V)ⁿ.',
          'Volume resets to V after each top-up.'
        ] }
      ]
    }
  ];

  KB.registerAll('arithmetic', TOPICS);
  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
