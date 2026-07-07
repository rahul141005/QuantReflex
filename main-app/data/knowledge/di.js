/**
 * data/knowledge/di.js — Data Interpretation Learn content (ADR-074, QuantReflex V2 Phase 2).
 *
 * The DI category for the Learn hub — same Knowledge Engine, same typed-block schema, same gold-standard depth as the
 * Quant topics (ADR-069). Tagged `subject:'di'` so the hub groups it under "Data Interpretation". Each topic deep-links
 * to its DI drill category (`drillCategory`) so "Read → Practise" works end-to-end. No engine changes — pure data.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  KB.registerCategory({ id: 'di-charts', title: 'Data Interpretation', icon: '📊', order: 60, subject: 'di',
    blurb: 'Read bar, line and pie charts, tables and caselets — then calculate fast. The speed skill every aptitude section rewards.' });

  var TOPICS = [
    {
      id: 'di-foundations', title: 'DI Foundations', icon: '🧱', category: 'di-charts',
      difficulty: 'foundation', examFrequency: 'very-high', status: 'published',
      drillCategory: 'di-bar',
      revisionIntervalDays: 4,   // LRN-2: difficulty-mapped spaced-revision cadence (foundation 4 / core 6 / advanced 8)
      searchTerms: ['data interpretation', 'di', 'charts', 'graphs', 'reading data', 'caselet'],
      related: ['di-speed-math', 'di-bar-line'],
      sections: [
        { type: 'overview', text: 'Data Interpretation (DI) gives you a chart, table or short passage of numbers and asks questions you answer by READING the data and doing quick arithmetic. It is not new maths — it is your percentage, ratio and average skills applied to a picture. DI rewards calm reading and fast calculation, which is exactly the QuantReflex skill.' },
        { type: 'concept', title: 'The four data forms you must read', body: 'Almost every DI set is one of: a bar graph (compare quantities), a line graph (a trend over time), a pie chart (parts of a whole as a circle), or a table/caselet (raw numbers in rows or in words). Learn to read all four and you can attempt any DI set.' },
        { type: 'concept', title: 'Read the frame BEFORE the numbers', body: 'First read the TITLE, the UNITS and the AXIS labels. Half of all DI mistakes come from missing the unit (₹ lakh vs ₹ crore) or the axis scale. Spend three seconds on the frame; it saves you the whole question.' },
        { type: 'trick', title: 'The 3-step DI method', items: ['1) Frame — title, unit, what each axis/slice means.', '2) Locate — find ONLY the values the question needs (ignore the rest).', '3) Compute — total / difference / average / percentage, then sanity-check the size of your answer.'] },
        { type: 'formula', items: [
          { name: 'Percentage change', expr: '(New − Old) / Old × 100', when: 'growth/decline between two values' },
          { name: 'Share of total', expr: 'Part / Total × 100', when: 'what % one item is of the whole' },
          { name: 'Average', expr: 'Sum of values / Number of values' }
        ] },
        { type: 'trap', items: ['Mixing units (one bar in lakh, another in crore).', 'Reading "% increase" as the new value instead of the change.', 'Using the wrong total — read only the items the question asks about.', 'Forgetting to ignore a sign when the question says "ignore sign".'] },
        { type: 'example', problem: 'A bar graph shows sales (₹ crore) of four firms: A=120, B=80, C=150, D=90. What percent of the total sales does C account for?', steps: ['Total = 120 + 80 + 150 + 90 = 440', 'C’s share = 150 / 440 × 100', '= 34.09% ≈ 34.1%'], answer: '34.1%' },
        { type: 'revision', points: ['Read TITLE + UNIT + AXIS first.', 'Locate only what you need.', '% change = change/old × 100; share = part/total × 100.', 'Sanity-check the magnitude of every answer.'] }
      ]
    },
    {
      id: 'di-bar-line', title: 'Bar & Line Graphs', icon: '📉', category: 'di-charts',
      difficulty: 'core', examFrequency: 'very-high', status: 'published',
      drillCategory: 'di-line',
      revisionIntervalDays: 6,   // LRN-2: difficulty-mapped spaced-revision cadence (foundation 4 / core 6 / advanced 8)
      searchTerms: ['bar graph', 'line graph', 'trend', 'year on year', 'growth', 'di'],
      related: ['di-foundations', 'di-speed-math'],
      sections: [
        { type: 'overview', text: 'Bar graphs compare separate quantities; line graphs show how ONE quantity moves over time. Both are read the same way — pick the bars/points the question names, read their heights off the axis, then calculate.' },
        { type: 'concept', title: 'Bars compare, lines trend', body: 'A bar graph answers "which is bigger, by how much, what is the total". A line graph adds CHANGE — and its steepest segment is the biggest year-on-year jump.' },
        { type: 'concept', title: 'Find the biggest jump by eye', body: 'On a line graph you usually do not need to compute every change. The visually steepest segment is almost always the largest change — verify just that one with arithmetic.' },
        { type: 'trick', title: 'Speed reading', items: ['For "highest/lowest", scan — do not calculate.', 'For a total over years, add in pairs that make round numbers.', 'For year-on-year %, change/old — keep the OLD year on the bottom.'] },
        { type: 'formula', items: [
          { name: 'Year-on-year change', expr: '(Value₂ − Value₁) / Value₁ × 100', when: 'consecutive periods' },
          { name: 'Total over a period', expr: 'Sum of all the points in that period' }
        ] },
        { type: 'trap', items: ['Reading between gridlines carelessly — note the scale step.', 'Confusing the steepest line with the highest point.', 'Computing change on the new value instead of the old.'] },
        { type: 'table', caption: 'Which chart answers what', headers: ['Chart', 'Best for', 'You read'], rows: [['Bar', 'comparing quantities', 'bar height'], ['Line', 'change / trend over time', 'point height & slope'], ['Pie', 'share of one whole', 'slice angle or %'], ['Table', 'exact multi-variable values', 'the cell directly']] },
        { type: 'example', problem: 'A line graph of revenue (₹ crore): 2020 = 120, 2021 = 60. What is the percent change from 2020 to 2021?', steps: ['Change = 60 − 120 = −60', '% = −60 / 120 × 100 = −50%', 'Magnitude (ignore sign) = 50%'], answer: '50%' },
        { type: 'revision', points: ['Bars compare; lines trend.', 'Steepest segment = biggest change.', '% change keeps the OLD value on the bottom.', 'Mind the axis scale step.'] }
      ]
    },
    {
      id: 'di-pie-charts', title: 'Pie Charts', icon: '🥧', category: 'di-charts',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'di-pie',
      revisionIntervalDays: 6,   // LRN-2: difficulty-mapped spaced-revision cadence (foundation 4 / core 6 / advanced 8)
      searchTerms: ['pie chart', 'central angle', 'degrees', 'share', 'percentage', 'di'],
      related: ['di-foundations', 'di-speed-math'],
      sections: [
        { type: 'overview', text: 'A pie chart shows parts of ONE whole. Each slice is a share of 100% — and of 360°. The whole skill is converting between the slice (%), its angle (degrees) and its actual value.' },
        { type: 'concept', title: 'Three ways to read a slice', body: 'A slice can be given as a percentage, as a central angle in degrees, or you can be told the total value. They are interchangeable: 100% = 360° = the whole total.' },
        { type: 'formula', items: [
          { name: 'Angle from share', expr: 'Central angle = Share% / 100 × 360°' },
          { name: 'Share from angle', expr: 'Share% = Central angle / 360 × 100' },
          { name: 'Value of a slice', expr: 'Slice value = Share% / 100 × Total' }
        ] },
        { type: 'trick', title: 'Useful pie anchors', items: ['10% = 36°, 25% = 90°, 50% = 180°.', '1% = 3.6°, so divide an angle by 3.6 to get the percent.', 'If two pies share a total, compare slices directly by percent.'] },
        { type: 'trap', items: ['Adding two different pies’ percentages when their totals differ.', 'Forgetting 1% = 3.6°, not 3°.', 'Treating a slice value as a percentage of the wrong total.'] },
        { type: 'example', problem: 'In a pie of a household budget, the "Food" slice is 90°. The total monthly budget is ₹40,000. How much is spent on Food?', steps: ['Share = 90 / 360 × 100 = 25%', 'Food = 25% of 40,000', '= 0.25 × 40,000 = ₹10,000'], answer: '₹10,000' },
        { type: 'revision', points: ['100% = 360° = whole total.', 'Angle = share/100 × 360; share = angle/360 × 100.', '1% = 3.6°.', 'Only compare two pies by PERCENT unless totals are equal.'] }
      ]
    },
    {
      id: 'di-tables-caselets', title: 'Tables & Caselets', icon: '📋', category: 'di-charts',
      difficulty: 'core', examFrequency: 'high', status: 'published',
      drillCategory: 'di-table',
      revisionIntervalDays: 6,   // LRN-2: difficulty-mapped spaced-revision cadence (foundation 4 / core 6 / advanced 8)
      searchTerms: ['table', 'caselet', 'data table', 'rows', 'columns', 'di'],
      related: ['di-foundations', 'di-speed-math'],
      sections: [
        { type: 'overview', text: 'Tables give you the exact numbers in rows and columns — the most precise DI form. Caselets give the same data in WORDS, so the first job is to turn the sentences into a small table in your head or on paper.' },
        { type: 'concept', title: 'Tables reward column/row totals', body: 'Most table questions are a row total, a column total, a difference between two cells, or a ratio of two cells. Identify which one before you start adding.' },
        { type: 'concept', title: 'Turn a caselet into a table', body: 'A caselet hides a table in prose: "Of 800 people, 400 are men..." is just two rows. Extract the groups and their counts/percentages first; the question then becomes a normal table read.' },
        { type: 'trick', title: 'Caselet shortcut', items: ['Write the total, then each group, then each group’s "doers" (count = group × percent).', 'Keep percentages as fractions: 25% = ×1/4, 75% = ×3/4 — faster than long multiplication.'] },
        { type: 'formula', items: [
          { name: 'Count from a percentage', expr: 'Count = Group size × Percent / 100' },
          { name: 'Ratio of two cells', expr: 'Cell A : Cell B (divide by their HCF to simplify)' }
        ] },
        { type: 'trap', items: ['Adding a row when the question wanted a column.', 'Missing "the rest are..." which defines the second group.', 'Percent of the wrong base (group vs grand total).'] },
        { type: 'example', problem: 'Out of 800 people, 400 are men and the rest women. 25% of men and 75% of women bought a ticket online. How many people bought online in total?', steps: ['Men online = 25% of 400 = 100', 'Women = 800 − 400 = 400; women online = 75% of 400 = 300', 'Total online = 100 + 300 = 400'], answer: '400' },
        { type: 'revision', points: ['Decide row-total / column-total / difference / ratio first.', 'Caselet → extract groups and counts into a mini table.', 'Count = group × percent; use fraction equivalents.', 'Watch the base of every percentage.'] }
      ]
    },
    {
      id: 'di-speed-math', title: 'DI Calculation Shortcuts', icon: '⚡', category: 'di-charts',
      difficulty: 'advanced', examFrequency: 'very-high', status: 'published',
      drillCategory: 'di-caselet',
      revisionIntervalDays: 8,   // LRN-2: difficulty-mapped spaced-revision cadence (foundation 4 / core 6 / advanced 8)
      searchTerms: ['approximation', 'shortcuts', 'percentage to fraction', 'speed', 'estimation', 'di'],
      related: ['di-foundations', 'di-pie-charts'],
      sections: [
        { type: 'overview', text: 'DI is won on calculation SPEED, not on harder maths. Two habits do most of the work: replacing percentages with fractions, and approximating when the options (or the question) allow it.' },
        { type: 'concept', title: 'Percentages as fractions', body: 'Multiplying by a fraction is far faster than long multiplication. 25% of 248 is just 248/4 = 62. Memorise the common percent–fraction pairs and most DI arithmetic becomes mental.' },
        { type: 'formula', items: [
          { name: 'Percent change ↔ multiplier', expr: '+20% means × 1.2 ; −20% means × 0.8' },
          { name: 'Combined effect', expr: 'a% then b% = ×(1+a/100)(1+b/100)', when: 'successive changes' }
        ] },
        { type: 'table', caption: 'Percent ↔ fraction (memorise)', headers: ['Percent', 'Fraction'], rows: [['12.5%', '1/8'], ['16.67%', '1/6'], ['20%', '1/5'], ['25%', '1/4'], ['33.33%', '1/3'], ['50%', '1/2']] },
        { type: 'trick', title: 'Approximate with intent', items: ['Round to a friendly number, compute, then nudge back (199 → 200, subtract later).', 'For "roughly what percent", compare to 10% and 50% anchors first.', 'Estimate the answer’s size BEFORE computing — it kills silly errors.'] },
        { type: 'trap', items: ['Approximating when the question demands an exact figure.', 'Chaining two percentage changes by ADDING them instead of multiplying.', 'Losing a factor of 10 — always re-check the unit and magnitude.'] },
        { type: 'example', problem: 'A value rises by 10% one year and by 20% the next. By what percent has it risen overall?', steps: ['Overall multiplier = 1.10 × 1.20 = 1.32', 'That is a rise of 0.32 = 32%', '(Not 30% — successive percents multiply, they do not add.)'], answer: '32%' },
        { type: 'revision', points: ['Swap percents for fractions (25% = 1/4).', '+x% = ×(1+x/100); successive changes MULTIPLY.', 'Estimate magnitude before computing.', 'Approximate only when allowed.'] }
      ]
    },
    {
      id: 'di-sets', title: 'DI Sets & Multi-Series Charts', icon: '🗂️', category: 'di-charts',
      difficulty: 'advanced', examFrequency: 'high', status: 'published',
      drillCategory: 'di-bar',
      revisionIntervalDays: 8,   // LRN-2: difficulty-mapped spaced-revision cadence (foundation 4 / core 6 / advanced 8)
      searchTerms: ['di set', 'caselet set', 'grouped bar', 'stacked bar', 'multiple line', 'multi series', 'missing data', 'set selection', 'di'],
      related: ['di-foundations', 'di-bar-line'],
      sections: [
        { type: 'overview', text: 'Real exam DI almost never asks one question on a chart — it gives you a SET: one chart/table/caselet with 3–6 linked questions of rising difficulty. And the charts often carry MULTIPLE series (two or more bars per group, several lines). This topic is how you read both efficiently, because the marks are won by reading once and reusing.' },
        { type: 'concept', title: 'Grouped vs stacked bars', body: 'A grouped bar puts each series side-by-side within a category — use it to COMPARE series (A vs B in each year). A stacked bar puts the series on top of one another — each segment is a COMPONENT, and the full bar height is the TOTAL of all segments. Read a stacked segment as its own value, not the total.' },
        { type: 'concept', title: 'Multi-line graphs', body: 'Each line is one series over time. The questions that matter: where do two lines CROSS (the year they became equal), the GAP between them at a point (a subtraction), and which line GREW more over the period (compare first-to-last change). Trace one line at a time.' },
        { type: 'concept', title: 'Read the set once, then attack', body: 'In a set the early questions are simple reads and the later ones combine values you already located. So invest 10–15 seconds reading the whole chart first — title, units, every series, the obvious totals — then the late, "hard" questions are mostly lookups you have already done.' },
        { type: 'concept', title: 'Missing data', body: 'When a cell or bar is blank, you are meant to deduce it: missing value = given total − sum of the others, or use a stated ratio/percentage to back it out. Never skip a set just because one number is hidden — that hidden number is usually one subtraction away.' },
        { type: 'formula', items: [
          { name: 'Stacked bar total', expr: 'Total = sum of all the segment values' },
          { name: 'Missing value', expr: 'Missing = Given total − sum of the others' },
          { name: 'Ratio of two series', expr: 'A : B (divide both by their HCF)' },
          { name: 'Series share', expr: 'Series ÷ combined total of all series × 100' }
        ] },
        { type: 'trick', title: 'Set strategy & time budget', items: ['Bank the easy reads first, then the multi-step ones — partial marks beat a perfect-but-unfinished set.', 'Rough budget: easy read ~25s, two-step ~60s, cross-series/percent ~90s.', 'In a real paper, SCAN every set before solving and start with the friendliest data (clean totals, fewer series).'] },
        { type: 'trap', items: ['Percentage POINT vs percent: a rate moving 24% → 26% is +2 percentage points, NOT a 2% rise.', 'Reading a stacked SEGMENT as if it were the whole bar.', 'Comparing the wrong pair of grouped bars (mind which category you are in).', 'Re-reading the chart for every question instead of reusing values you already found.'] },
        { type: 'exam', items: ['Read the caption, axes and units once — carefully — before touching any question.', 'Do the quick retrieval questions first; leave heavy multi-series calculations for last.'] },
        { type: 'example', problem: 'A grouped bar shows units sold by Store A and Store B across 2023 and 2024. In 2024, A = 240 and B = 160. What is the ratio of A to B, and A as a percent of their combined total?', steps: ['Ratio A:B = 240:160 = 3:2 (divide both by HCF 80)', 'Combined = 240 + 160 = 400', 'A’s share = 240 / 400 × 100 = 60%'], answer: '3:2 and 60%' },
        { type: 'revision', points: ['DI is a SET — read the whole chart once, reuse values.', 'Grouped = compare series; stacked segment = component, full bar = total.', 'Missing value = total − sum of others.', 'Percentage points ≠ percent. Bank easy marks first.'] }
      ]
    }
  ];

  KB.registerAll('di-charts', TOPICS);

  if (typeof module !== 'undefined' && module.exports) module.exports = TOPICS;
})(this);
