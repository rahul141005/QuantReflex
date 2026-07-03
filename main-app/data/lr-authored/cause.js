/**
 * data/lr-authored/cause.js — authored Cause & Effect bank (ADR-079). Banking/SSC/NMAT-style.
 * Each item gives two statements; the task is to identify their causal relationship. Validated by schema.js.
 */
(function (root) {
  'use strict';
  var V = 1, A = 'approved', M = { addedVersion: 'ADR-079' };
  var OPTS = [
    'Statement I is the cause and Statement II is its effect',
    'Statement II is the cause and Statement I is its effect',
    'Both statements are independent effects of a common cause',
    'Both statements are effects of independent causes',
    'Both statements are unrelated'
  ];
  function it(id, difficulty, exams, s1, s2, ans, explanation, tags) {
    return { id: id, topic: 'lr-cause', subtype: 'cause-effect', difficulty: difficulty, exams: exams, stem: 'Statement I: ' + s1 + ' Statement II: ' + s2 + ' Identify the relationship between the two statements.', options: OPTS.slice(), answer: ans, explanation: explanation, explanationVersion: V, tags: tags || ['cause-effect'], reviewStatus: A, meta: M };
  }
  var ITEMS = [
    it('ce-001', 'medium', ['IBPS PO', 'SSC CGL'],
      'The government sharply increased the tax on petrol last month.',
      'The price of petrol at fuel stations rose this month.',
      'Statement I is the cause and Statement II is its effect',
      'A tax increase raises the cost of fuel, which is passed on to pump prices the following month. The timing (last month → this month) and the direct mechanism make Statement I the cause and Statement II its effect.'),
    it('ce-002', 'medium', ['IBPS PO', 'NMAT'],
      'Many farmers in the region switched from cotton to a more profitable vegetable crop this season.',
      'The market price of cotton has been falling steadily for two years.',
      'Statement II is the cause and Statement I is its effect',
      'Farmers respond to incentives: a sustained fall in cotton prices (II) is the cause that led them to switch crops (I). The two-year price decline precedes and motivates the switch, so II is the cause and I the effect.'),
    it('ce-003', 'hard', ['SBI PO', 'CAT'],
      'The number of umbrellas sold in the city rose sharply this week.',
      'The number of raincoats sold in the city rose sharply this week.',
      'Both statements are independent effects of a common cause',
      'Umbrella sales do not cause raincoat sales or vice versa; both rise together because of a common cause — heavy rain this week. So they are independent effects of a single common cause.'),
    it('ce-004', 'medium', ['SSC CGL', 'RRB'],
      'The school declared a holiday on Friday due to a local festival.',
      'Attendance at the city museum was unusually high on Friday.',
      'Both statements are independent effects of a common cause',
      'The festival is the common cause: it led the school to close (I) and drew more visitors to the museum (II). Neither statement causes the other; both stem from the same festival.'),
    it('ce-005', 'hard', ['SBI PO', 'RBI'],
      'The central bank raised interest rates this quarter.',
      'Home-loan applications declined this quarter.',
      'Statement I is the cause and Statement II is its effect',
      'Higher interest rates make borrowing costlier, which discourages new home loans. The rate hike (I) precedes and drives the fall in loan applications (II), so I is the cause and II the effect.'),
    it('ce-006', 'medium', ['IBPS Clerk', 'SSC CHSL'],
      'A famous chef opened a new restaurant in the neighbourhood.',
      'A nearby unrelated bookstore changed its closing time.',
      'Both statements are unrelated',
      'There is no plausible causal link between a chef opening a restaurant and an unrelated bookstore adjusting its hours, and no obvious common cause connects them. The statements are unrelated.'),
    it('ce-007', 'medium', ['NMAT', 'SNAP'],
      'A new metro line connecting the suburb to downtown opened this year.',
      'Property prices in that suburb rose noticeably this year.',
      'Statement I is the cause and Statement II is its effect',
      'Improved connectivity raises the desirability of a suburb, lifting property values. The metro line (I) is the cause and the price rise (II) the effect, consistent with the timing.'),
    it('ce-008', 'hard', ['CAT', 'XAT'],
      'Sales of ice cream in the city peaked in May.',
      'Cases of sunburn reported by clinics peaked in May.',
      'Both statements are independent effects of a common cause',
      'Ice-cream sales do not cause sunburn; both peak in May because of a common cause — hot, sunny summer weather. They are independent effects of the same underlying cause, a classic spurious-correlation trap.'),
    it('ce-009', 'medium', ['IBPS PO', 'SSC CGL'],
      'A severe cyclone struck the coastal district last week.',
      'Several fishing villages in that district were evacuated last week.',
      'Statement I is the cause and Statement II is its effect',
      'The cyclone (I) is the cause that prompted authorities to evacuate the coastal villages (II). The threat precedes and directly drives the evacuation.'),
    it('ce-010', 'medium', ['SSC CGL', 'RRB'],
      'One factory in the area cut its workforce due to falling orders.',
      'A different factory in another industry expanded its workforce due to rising orders.',
      'Both statements are effects of independent causes',
      'One factory shrinks because ITS orders fell; the other grows because ITS (different) orders rose. The two changes arise from separate, independent causes in different industries — not from each other or a single common cause.'),
    it('ce-011', 'easy', ['SSC CHSL', 'RRB', 'IBPS Clerk'],
      'A heavy storm hit the town overnight.',
      'Several trees were found uprooted along the main road the next morning.',
      'Statement I is the cause and Statement II is its effect',
      'The overnight storm (I) came first and plausibly produced the uprooted trees (II) seen the next morning. Cause precedes and explains effect, so I is the cause and II its effect.'),
    it('ce-012', 'easy', ['SSC CGL', 'IBPS Clerk'],
      'The shopkeeper raised the price of notebooks this week.',
      'The wholesale cost of paper rose sharply last week.',
      'Statement II is the cause and Statement I is its effect',
      'The wholesale paper-cost rise (II) happened first and forces the retailer to charge more, so the notebook price went up (I). II is the cause and I its effect.'),
    it('ce-013', 'easy', ['SSC CHSL', 'RRB', 'IBPS Clerk'],
      'It rained heavily throughout the night.',
      'The morning cricket match on the open ground was postponed.',
      'Statement I is the cause and Statement II is its effect',
      'Heavy overnight rain (I) leaves the open ground wet and unplayable, which is why the morning match was postponed (II). The rain comes first and directly explains the postponement, so I is the cause and II its effect.'),
    it('ce-014', 'easy', ['SSC CGL', 'IBPS Clerk'],
      'The bakery offered a large discount on all cakes over the weekend.',
      'The bakery sold far more cakes than usual over the weekend.',
      'Statement I is the cause and Statement II is its effect',
      'A weekend discount (I) attracts more buyers, which raises the number of cakes sold (II). The offer drives the surge in sales, so Statement I is the cause and Statement II its effect.'),
    it('ce-015', 'hard', ['CAT', 'XAT'],
      'Sales of winter jackets in the town rose sharply in December.',
      'Electricity used for room heating in the town rose sharply in December.',
      'Both statements are independent effects of a common cause',
      'Buying jackets does not cause heater use, nor the reverse; both rise together because of a common cause — the onset of severe cold in December. They are independent effects of the same underlying cause, a classic spurious-correlation trap.'),
    it('ce-016', 'hard', ['SBI PO', 'CAT'],
      'Sales of raincoats in a coastal city rose in June.',
      'Sales of air conditioners in a northern inland city rose in June.',
      'Both statements are effects of independent causes',
      'The two cities face different June weather: monsoon rain on the coast drives raincoat sales, while inland heat drives air-conditioner sales. The two rises merely share the month; they arise from separate, independent causes in different places rather than one common cause.')
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ITEMS;
  var W = (typeof window !== 'undefined') ? window : root;
  (W.LRAuthoredBanks = W.LRAuthoredBanks || {}).cause = ITEMS;
})(this);
