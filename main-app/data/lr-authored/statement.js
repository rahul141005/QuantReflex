/**
 * data/lr-authored/statement.js — authored Statement-based reasoning (ADR-079). Banking/SSC/CAT-style.
 * Subtypes: assumption (Statement–Assumption) · conclusion (Statement–Conclusion) · argument (strong/weak) ·
 * inference. Verdict-style options follow the standard exam convention. Validated by schema.js.
 */
(function (root) {
  'use strict';
  var V = 1, A = 'approved', M = { addedVersion: 'ADR-079' };
  var ITEMS = [
    {
      id: 'st-assum-001', topic: 'lr-statement', subtype: 'assumption', difficulty: 'medium', exams: ['IBPS PO', 'SBI PO', 'SSC CGL'],
      stem: 'Statement: "Please find enclosed my résumé in response to your advertisement for a data analyst." Assumptions: I. The sender has applied for the data-analyst position. II. The sender meets every qualification listed in the advertisement.',
      options: ['Only I is implicit', 'Only II is implicit', 'Both I and II are implicit', 'Neither is implicit', 'Either I or II is implicit'],
      answer: 'Only I is implicit',
      explanation: 'An assumption is what the speaker takes for granted. Sending a résumé "in response to" the ad implies the sender is applying — I is implicit. The sender hopes to be considered but does not assume they meet EVERY listed qualification (that is why employers screen), so II is not implicit. Hence only I.',
      explanationVersion: V, tags: ['statement-assumption'], reviewStatus: A, meta: M
    },
    {
      id: 'st-assum-002', topic: 'lr-statement', subtype: 'assumption', difficulty: 'medium', exams: ['IBPS PO', 'RBI'],
      stem: 'Statement: "Use Brand X cement to build a house that will last for generations." Assumptions: I. People want their houses to last a long time. II. No other cement can build a durable house.',
      options: ['Only I is implicit', 'Only II is implicit', 'Both I and II are implicit', 'Neither is implicit', 'Either I or II is implicit'],
      answer: 'Only I is implicit',
      explanation: 'The advertisement appeals to a desire for durability, so it assumes people want long-lasting houses — I is implicit. It does not assume rival cements cannot build durable houses; advertising its own benefit does not require denying all competitors, so II is not implicit. Only I.',
      explanationVersion: V, tags: ['statement-assumption', 'advertising'], reviewStatus: A, meta: M
    },
    {
      id: 'st-assum-003', topic: 'lr-statement', subtype: 'assumption', difficulty: 'hard', exams: ['SBI PO', 'RBI'],
      stem: 'Statement: "The notice in the office read: \'Employees should reach the office by 9 a.m.\'" Assumptions: I. Employees are capable of reaching the office by 9 a.m. II. If not instructed, some employees may arrive late.',
      options: ['Only I is implicit', 'Only II is implicit', 'Both I and II are implicit', 'Neither is implicit', 'Either I or II is implicit'],
      answer: 'Both I and II are implicit',
      explanation: 'An instruction is issued only if it can be followed, so it assumes employees CAN reach by 9 a.m. — I is implicit. A rule about timing is issued because, without it, punctuality is not guaranteed — II is implicit. Both assumptions underlie the notice.',
      explanationVersion: V, tags: ['statement-assumption', 'instruction'], reviewStatus: A, meta: M
    },
    {
      id: 'st-con-001', topic: 'lr-statement', subtype: 'conclusion', difficulty: 'medium', exams: ['IBPS PO', 'SSC CGL'],
      stem: 'Statement: "Despite heavy monsoon rains this year, the reservoir is only 40% full, while last year it was 80% full after similar rainfall." Conclusions: I. Rainfall alone does not determine the reservoir\'s level. II. The reservoir\'s capacity was increased since last year.',
      options: ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows', 'Either I or II follows'],
      answer: 'Only I follows',
      explanation: 'Same rainfall produced very different levels, so the level cannot depend on rainfall alone — I follows. Conclusion II is one possible explanation, but the statement gives no evidence that capacity changed; many causes (more usage, leakage) are possible, so II does not follow. Only I.',
      explanationVersion: V, tags: ['statement-conclusion'], reviewStatus: A, meta: M
    },
    {
      id: 'st-con-002', topic: 'lr-statement', subtype: 'conclusion', difficulty: 'easy', exams: ['SSC CHSL', 'RRB', 'IBPS Clerk'],
      stem: 'Statement: "All the students who scored above 90% in the test were awarded a scholarship. Meera scored 94% in the test." Conclusions: I. Meera was awarded a scholarship. II. Meera was the highest scorer in the test.',
      options: ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows', 'Either I or II follows'],
      answer: 'Only I follows',
      explanation: 'Scoring above 90% guarantees the scholarship, and Meera scored 94%, so I follows necessarily. Nothing says 94% was the top score — others could have scored higher — so II does not follow. Only I.',
      explanationVersion: V, tags: ['statement-conclusion', 'deduction'], reviewStatus: A, meta: M
    },
    {
      id: 'st-con-003', topic: 'lr-statement', subtype: 'conclusion', difficulty: 'hard', exams: ['SBI PO', 'CAT'],
      stem: 'Statement: "Ever since the toll on the highway was introduced, the number of accidents on it has fallen sharply, though traffic volume is unchanged." Conclusions: I. The toll caused drivers to slow down. II. Fewer accidents occurred after the toll was introduced.',
      options: ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows', 'Either I or II follows'],
      answer: 'Only II follows',
      explanation: 'Conclusion II merely restates the reported fact (accidents fell after the toll) — it follows. Conclusion I asserts a specific mechanism (the toll made drivers slow down); the statement shows a correlation, not that slowing was the cause, so I does not follow. Only II.',
      explanationVersion: V, tags: ['statement-conclusion', 'causation'], reviewStatus: A, meta: M
    },
    {
      id: 'st-arg-001', topic: 'lr-statement', subtype: 'argument', difficulty: 'medium', exams: ['IBPS PO', 'SBI PO'],
      stem: 'Statement: "Should public examinations be conducted online instead of on paper?" Arguments: I. Yes, online exams give results faster and reduce paper use. II. No, because some candidates in remote areas lack reliable internet access.',
      options: ['Only argument I is strong', 'Only argument II is strong', 'Both are strong', 'Neither is strong', 'Either I or II is strong'],
      answer: 'Both are strong',
      explanation: 'A strong argument is relevant and addresses a real consequence. I cites genuine benefits (faster results, less paper); II cites a genuine equity problem (unreliable internet excludes some candidates). Both bear directly and substantially on the decision, so both are strong.',
      explanationVersion: V, tags: ['statement-argument'], reviewStatus: A, meta: M
    },
    {
      id: 'st-arg-002', topic: 'lr-statement', subtype: 'argument', difficulty: 'hard', exams: ['SBI PO', 'RBI'],
      stem: 'Statement: "Should companies be required to offer a four-day work week?" Arguments: I. No, because workers would simply become lazy. II. No, because some industries such as hospitals need staff present seven days a week and cannot reduce coverage.',
      options: ['Only argument I is strong', 'Only argument II is strong', 'Both are strong', 'Neither is strong', 'Either I or II is strong'],
      answer: 'Only argument II is strong',
      explanation: 'Argument I is a sweeping, unsupported assumption ("workers would become lazy") — weak. Argument II raises a concrete, relevant operational constraint (continuous-coverage industries), which is a substantial objection — strong. Hence only II is strong.',
      explanationVersion: V, tags: ['statement-argument', 'strong-weak'], reviewStatus: A, meta: M
    },
    {
      id: 'st-arg-003', topic: 'lr-statement', subtype: 'argument', difficulty: 'medium', exams: ['IBPS PO', 'SSC CGL'],
      stem: 'Statement: "Should single-use plastic bags be banned in the city?" Arguments: I. Yes, they choke drains and harm the environment for decades. II. No, because shopkeepers like using them.',
      options: ['Only argument I is strong', 'Only argument II is strong', 'Both are strong', 'Neither is strong', 'Either I or II is strong'],
      answer: 'Only argument I is strong',
      explanation: 'I points to a serious, well-established harm (blocked drains, long-term pollution) directly relevant to the ban — strong. II appeals to mere convenience/preference of shopkeepers, which does not weigh against a public-harm policy — weak. So only I is strong.',
      explanationVersion: V, tags: ['statement-argument'], reviewStatus: A, meta: M
    },
    {
      id: 'st-inf-001', topic: 'lr-statement', subtype: 'inference', difficulty: 'medium', exams: ['SSC CGL', 'IBPS PO'],
      stem: 'Statement: "The bank will be closed on the second and fourth Saturdays of every month and on all Sundays." Which inference is definitely true?',
      options: ['The bank is open on the first Saturday of a month.', 'The bank is closed every Saturday.', 'The bank is open on Sundays.', 'The bank is closed on all public holidays.'],
      answer: 'The bank is open on the first Saturday of a month.',
      explanation: 'Only the second and fourth Saturdays are stated as closed, so the first Saturday is not among the closed days — the bank is open then. "Closed every Saturday" contradicts the statement; Sundays are explicitly closed; nothing is said about public holidays.',
      explanationVersion: V, tags: ['statement-inference'], reviewStatus: A, meta: M
    },
    {
      id: 'st-assum-004', topic: 'lr-statement', subtype: 'assumption', difficulty: 'medium', exams: ['IBPS Clerk', 'SSC CHSL'],
      stem: 'Statement: "Bank to customers: \'Deposit cheques before 2 p.m. to have them cleared the same day.\'" Assumptions: I. Cheques deposited after 2 p.m. may not be cleared the same day. II. Customers want their cheques cleared quickly.',
      options: ['Only I is implicit', 'Only II is implicit', 'Both I and II are implicit', 'Neither is implicit', 'Either I or II is implicit'],
      answer: 'Both I and II are implicit',
      explanation: 'Setting a 2 p.m. cut-off for same-day clearing implies cheques after that time may not clear the same day — I is implicit. The notice is useful only because customers value quick clearing — II is implicit. Both underlie the message.',
      explanationVersion: V, tags: ['statement-assumption', 'banking'], reviewStatus: A, meta: M
    },
    {
      id: 'st-con-004', topic: 'lr-statement', subtype: 'conclusion', difficulty: 'easy', exams: ['SSC CHSL', 'RRB', 'IBPS Clerk'],
      stem: 'Statement: "All the trains on this route were delayed today because of dense fog in the morning." Conclusions: I. Fog can disrupt train timings. II. Trains on this route are never on time.',
      options: ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows', 'Either I or II follows'],
      answer: 'Only I follows',
      explanation: 'The statement directly shows fog delaying the trains, so "fog can disrupt train timings" follows. "Never on time" is an extreme generalisation from a single foggy day and does not follow. Only I.',
      explanationVersion: V, tags: ['statement-conclusion'], reviewStatus: A, meta: M
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ITEMS;
  var W = (typeof window !== 'undefined') ? window : root;
  (W.LRAuthoredBanks = W.LRAuthoredBanks || {}).statement = ITEMS;
})(this);
