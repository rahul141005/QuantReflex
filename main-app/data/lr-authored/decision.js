/**
 * data/lr-authored/decision.js — authored Decision Making bank (ADR-079). XAT-style.
 * A realistic managerial/ethical situation + a question asking for the best course of action. Subtypes:
 * ethical · managerial · data-adequacy · priority. The keyed answer is the most balanced, defensible choice that
 * fits the facts. Validated by schema.js.
 */
(function (root) {
  'use strict';
  var V = 1, A = 'approved', M = { addedVersion: 'ADR-079' };
  var ITEMS = [
    {
      id: 'dm-eth-001', topic: 'lr-decision', subtype: 'ethical', difficulty: 'hard', exams: ['XAT'],
      stem: 'Riya, a junior auditor, discovers a small but clear accounting error that overstates her company\'s profit. Her manager, who made the error, asks her to ignore it because the amount is "immaterial" and fixing it would delay the report. What should Riya do?',
      options: [
        'Document the error and raise it through the proper channel, even though it is small, because accuracy and integrity of the accounts come first.',
        'Ignore it, since her manager has more experience and the amount is small.',
        'Quietly correct it herself without telling anyone, to avoid conflict.',
        'Report the error directly to senior management above her manager, bypassing her manager entirely so that she cannot be blamed for it.'
      ],
      answer: 'Document the error and raise it through the proper channel, even though it is small, because accuracy and integrity of the accounts come first.',
      explanation: 'A clear error that misstates profit must be addressed regardless of size — integrity of financial reporting is non-negotiable. Raising it through the proper channel is both ethical and procedurally correct. Ignoring it abdicates responsibility; correcting it silently bypasses controls and could look like tampering; resigning is a disproportionate over-reaction that solves nothing.',
      explanationVersion: V, tags: ['ethics', 'integrity'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-mgr-001', topic: 'lr-decision', subtype: 'managerial', difficulty: 'medium', exams: ['XAT', 'NMAT'],
      stem: 'A project is behind schedule. The team is already working long hours and morale is low. The client wants the original deadline kept. As the manager, what is the most sensible first step?',
      options: [
        'Talk to the client honestly about realistic options — a short extension or a reduced initial scope — while protecting the team from burnout.',
        'Force the team to work even longer hours to meet the deadline at any cost.',
        'Quietly miss the deadline and hope the client does not notice.',
        'Quietly absorb the slippage by asking the team to put in extra unpaid hours over the next few weekends so the original deadline can still be met.'
      ],
      answer: 'Talk to the client honestly about realistic options — a short extension or a reduced initial scope — while protecting the team from burnout.',
      explanation: 'Good management balances client needs with team sustainability and uses honest communication. Renegotiating scope or timeline transparently addresses the real constraint. Pushing an exhausted team risks quality and attrition; hiding a likely miss destroys trust; blaming the team is both unfair and counter-productive.',
      explanationVersion: V, tags: ['management', 'stakeholders'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-mgr-002', topic: 'lr-decision', subtype: 'managerial', difficulty: 'hard', exams: ['XAT'],
      stem: 'A manager must choose between two equally skilled candidates for a single promotion. One has been with the company longer; the other recently delivered an outstanding project. Company policy says promotions should be based primarily on demonstrated performance. What should the manager do?',
      options: [
        'Promote the candidate with the outstanding recent performance, in line with the company\'s stated performance-based policy, and explain the basis to both.',
        'Promote the longer-serving candidate purely because of seniority.',
        'Promote neither and leave the role vacant to avoid a difficult choice.',
        'Promote the longer-serving candidate this time and privately promise the other that they will be first in line at the next promotion.'
      ],
      answer: 'Promote the candidate with the outstanding recent performance, in line with the company\'s stated performance-based policy, and explain the basis to both.',
      explanation: 'When a clear policy exists (performance-based promotion), the fair and consistent decision applies it, and transparency with both candidates preserves morale. Defaulting to seniority contradicts the policy; leaving the role vacant avoids the manager\'s duty; a coin toss abandons judgment entirely.',
      explanationVersion: V, tags: ['policy', 'fairness'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-da-001', topic: 'lr-decision', subtype: 'data-adequacy', difficulty: 'medium', exams: ['XAT', 'NMAT'],
      stem: 'A retailer is deciding whether to open a new store in a town. To make a sound decision, which single piece of information would be MOST useful?',
      options: [
        'An estimate of local demand and competition for the retailer\'s products in that town.',
        'The colour scheme the new store will use.',
        'The name of the town\'s mayor.',
        'The brand of furniture the store will install.'
      ],
      answer: 'An estimate of local demand and competition for the retailer\'s products in that town.',
      explanation: 'The decision hinges on whether the store can be profitable, which depends most on local demand and competition. That information is decisive. The store\'s colour scheme, the mayor\'s name, and furniture brand are irrelevant to whether opening the store is a sound business decision.',
      explanationVersion: V, tags: ['relevance', 'data-adequacy'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-pri-001', topic: 'lr-decision', subtype: 'priority', difficulty: 'medium', exams: ['XAT', 'SNAP'],
      stem: 'A factory manager is told that a machine is leaking a chemical that could harm workers\' health. At the same time, an important shipment is due. What should the manager prioritise?',
      options: [
        'Stop the leak and ensure worker safety first, then manage the shipment timeline.',
        'Complete the shipment first, then deal with the leak.',
        'Ignore the leak as long as no worker has complained yet.',
        'Ask workers to continue and promise a bonus for finishing the shipment.'
      ],
      answer: 'Stop the leak and ensure worker safety first, then manage the shipment timeline.',
      explanation: 'Worker safety is the overriding priority and takes precedence over a shipment deadline. Addressing the hazard first is both ethically and legally correct; the shipment can be rescheduled or communicated. Prioritising the shipment, ignoring the leak, or bribing workers to stay in a hazardous area all place output above human safety, which is unacceptable.',
      explanationVersion: V, tags: ['safety', 'priority'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-eth-002', topic: 'lr-decision', subtype: 'ethical', difficulty: 'hard', exams: ['XAT'],
      stem: 'A salesperson realises that a product he has already sold to a long-standing customer has a defect that is not yet publicly known but could fail after some months. Disclosing it may cost the sale and his commission. What should he do?',
      options: [
        'Inform the customer about the defect and offer a replacement or refund, preserving honesty and long-term trust.',
        'Say nothing, since the defect is not yet public and the sale is already done.',
        'Wait to see whether the product actually fails before deciding.',
        'Blame the manufacturer to the customer while keeping the commission.'
      ],
      answer: 'Inform the customer about the defect and offer a replacement or refund, preserving honesty and long-term trust.',
      explanation: 'Knowingly letting a customer keep a defective product is dishonest and damages long-term trust, which outweighs a single commission. Proactive disclosure with a remedy is the ethical choice. Staying silent, waiting for failure, or shifting blame all prioritise short-term gain over honesty and the customer\'s welfare.',
      explanationVersion: V, tags: ['ethics', 'trust'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-mgr-003', topic: 'lr-decision', subtype: 'managerial', difficulty: 'medium', exams: ['NMAT', 'SNAP'],
      stem: 'Two strong team members are in a personal conflict that is starting to affect the team\'s work. As their manager, what is the best approach?',
      options: [
        'Speak to both privately to understand the issue, then facilitate a fair resolution focused on professional conduct.',
        'Ignore the conflict and hope it resolves itself over time.',
        'Call a full team meeting and have the two of them settle their differences openly in front of everyone, so the matter is dealt with in one sitting.',
        'Take the side of whichever member you personally like more.'
      ],
      answer: 'Speak to both privately to understand the issue, then facilitate a fair resolution focused on professional conduct.',
      explanation: 'Effective managers address conflicts early, impartially, and with both sides\' perspectives before acting. Understanding the issue and mediating fairly protects the team\'s work. Ignoring it lets the problem grow; transferring someone immediately is premature; taking a personal side is biased and unjust.',
      explanationVersion: V, tags: ['conflict', 'fairness'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-da-002', topic: 'lr-decision', subtype: 'data-adequacy', difficulty: 'hard', exams: ['XAT'],
      stem: 'A bank is deciding whether to approve a large business loan. Which single piece of information is MOST critical to the decision?',
      options: [
        'The borrower\'s ability to repay, shown by cash flow, existing debts, and credit history.',
        'The borrower\'s favourite restaurant.',
        'The colour of the borrower\'s office.',
        'How many social-media followers the borrower has.'
      ],
      answer: 'The borrower\'s ability to repay, shown by cash flow, existing debts, and credit history.',
      explanation: 'A lending decision turns on repayment capacity — cash flow, existing obligations, and credit history directly predict default risk and are decisive. The borrower\'s restaurant preference, office colour, and follower count carry no reliable information about whether the loan will be repaid.',
      explanationVersion: V, tags: ['relevance', 'credit'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-pri-002', topic: 'lr-decision', subtype: 'priority', difficulty: 'medium', exams: ['XAT', 'NMAT'],
      stem: 'During a product launch, the team discovers a serious bug that could expose customer data. Fixing it will delay the launch by two days. What should the company prioritise?',
      options: [
        'Delay the launch and fix the data-security bug before releasing the product.',
        'Launch on time and fix the bug quietly afterward.',
        'Launch on time and hope no data is exposed.',
        'Cancel the product entirely.'
      ],
      answer: 'Delay the launch and fix the data-security bug before releasing the product.',
      explanation: 'Protecting customer data outweighs a two-day delay; releasing a product with a known serious security flaw risks real harm and legal liability. A short, responsible delay to fix it is the right priority. Launching anyway (in either form) gambles with customers\' data; cancelling the whole product is a needless over-reaction to a fixable bug.',
      explanationVersion: V, tags: ['security', 'priority'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-eth-003', topic: 'lr-decision', subtype: 'ethical', difficulty: 'medium', exams: ['XAT', 'SNAP'],
      stem: 'An employee is offered an expensive gift by a supplier just before deciding which supplier to award a contract to. What is the most appropriate action?',
      options: [
        'Politely decline the gift and disclose the offer, then evaluate suppliers purely on merit.',
        'Accept the gift but try to stay objective when deciding.',
        'Accept the gift and award the contract to that supplier.',
        'Accept the gift quietly and tell no one.'
      ],
      answer: 'Politely decline the gift and disclose the offer, then evaluate suppliers purely on merit.',
      explanation: 'Accepting a valuable gift during a decision creates a conflict of interest, even if one intends to stay objective. Declining and disclosing keeps the process fair and transparent, and the decision must rest on merit. The other options accept the conflict to varying degrees, compromising integrity.',
      explanationVersion: V, tags: ['ethics', 'conflict-of-interest'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-mgr-004', topic: 'lr-decision', subtype: 'managerial', difficulty: 'medium', exams: ['XAT', 'NMAT'],
      stem: 'A hospital administrator finds that one highly skilled surgeon is consistently rude to nursing staff, and two experienced nurses have quietly asked to be moved off his team. His clinical results, however, are excellent. What is the best first step?',
      options: [
        'Speak to the surgeon directly about the specific behaviour and its effect on the team, making clear that clinical skill does not excuse how colleagues are treated.',
        'Take no action while his clinical results stay strong, since patient outcomes are what matter most.',
        'Quietly move the two nurses off his team as they requested and say nothing to the surgeon, to keep the peace.',
        'Issue a formal written warning to the surgeon immediately and place it on his permanent record before speaking to him.'
      ],
      answer: 'Speak to the surgeon directly about the specific behaviour and its effect on the team, making clear that clinical skill does not excuse how colleagues are treated.',
      explanation: 'A first response to a conduct problem should be a direct, specific conversation that names the behaviour and its impact — this respects the individual while protecting the team. Tolerating it because results are good signals that talent buys a pass on conduct; silently reshuffling nurses hides the problem and lets it recur; jumping straight to a permanent formal warning skips the proportionate first step of an honest conversation.',
      explanationVersion: V, tags: ['management', 'conduct'], reviewStatus: A, meta: M, inspiredBy: 'XAT decision-making (people-management dilemma)'
    },
    {
      id: 'dm-pri-003', topic: 'lr-decision', subtype: 'priority', difficulty: 'medium', exams: ['XAT', 'SNAP'],
      stem: 'A city\'s disaster-relief team has a limited budget and must respond to a flood. They can fund clean drinking water, temporary shelter, or a publicity campaign thanking donors. People in the relief camps are already falling ill from contaminated water. What should the team fund first?',
      options: [
        'Clean drinking water, because preventing a worsening health crisis among people already falling ill is the most urgent need.',
        'Temporary shelter, since a roof over people\'s heads is the most visible sign that relief has arrived.',
        'The publicity campaign, because thanking donors now will bring in more money to fund everything else later.',
        'Split the budget equally across all three so that no group of stakeholders feels their priority was ignored.'
      ],
      answer: 'Clean drinking water, because preventing a worsening health crisis among people already falling ill is the most urgent need.',
      explanation: 'With people already falling ill from contaminated water, safe water directly prevents an escalating, possibly fatal, health crisis and is the clear priority. Shelter matters but is less immediately life-threatening; donor publicity serves the organisation, not the victims; splitting a limited budget equally ignores that the needs are not equally urgent and dilutes the most critical response.',
      explanationVersion: V, tags: ['priority', 'public-welfare'], reviewStatus: A, meta: M, inspiredBy: 'XAT/SNAP situational-priority decision'
    },
    {
      id: 'dm-eth-004', topic: 'lr-decision', subtype: 'ethical', difficulty: 'medium', exams: ['XAT', 'NMAT'],
      stem: 'A hiring manager notices that the strongest candidate for a role is a close friend\'s younger sibling. The candidate genuinely scored highest in every stage of a blind assessment that other panel members also marked. What is the most appropriate thing to do?',
      options: [
        'Disclose the personal connection to the panel and let the others confirm the decision on the documented merits, so the outcome is both fair and seen to be fair.',
        'Recuse herself entirely and ask that the candidate be rejected, to remove any possible appearance of favouritism.',
        'Say nothing about the connection, since the assessment was blind and the scores speak for themselves.',
        'Proceed to hire the candidate herself without comment but keep detailed notes in case anyone later questions the decision.'
      ],
      answer: 'Disclose the personal connection to the panel and let the others confirm the decision on the documented merits, so the outcome is both fair and seen to be fair.',
      explanation: 'Transparency resolves the conflict of interest: disclosing the relationship and letting an independent panel confirm a merit-based result keeps the process fair and defensible. Rejecting the best candidate to look impartial is itself unfair to the candidate; staying silent hides a real conflict even if the scores are honest; quietly hiring while keeping private notes manages personal risk rather than the integrity of the process.',
      explanationVersion: V, tags: ['ethics', 'conflict-of-interest'], reviewStatus: A, meta: M, inspiredBy: 'XAT ethics (conflict-of-interest disclosure)'
    },
    {
      id: 'dm-mgr-005', topic: 'lr-decision', subtype: 'managerial', difficulty: 'medium', exams: ['NMAT', 'SNAP'],
      stem: 'A retail chain\'s regional head learns that one store is hitting its sales targets by aggressively pushing customers into add-ons they do not need, generating complaints but strong numbers. The store manager argues the results justify the method. How should the regional head respond?',
      options: [
        'Make clear that targets must be met through practices that keep customer trust, and work with the manager to fix the selling approach even if short-term numbers dip.',
        'Leave the approach in place while the numbers are strong, and revisit it only if complaints start to hurt the regional total.',
        'Replace the store manager at once and install someone new, since the complaints show the manager cannot be trusted to run the store.',
        'Raise the store\'s sales target further, on the reasoning that a manager who can push this hard should be able to deliver even more.'
      ],
      answer: 'Make clear that targets must be met through practices that keep customer trust, and work with the manager to fix the selling approach even if short-term numbers dip.',
      explanation: 'Short-term numbers built on misleading customers erode the trust the business depends on, so the right response sets the standard and coaches the manager toward sustainable selling. Letting it ride trades long-term reputation for this quarter\'s figures; firing the manager outright skips the chance to correct behaviour; pushing the target even higher rewards and entrenches exactly the practice causing the complaints.',
      explanationVersion: V, tags: ['management', 'ethics'], reviewStatus: A, meta: M, inspiredBy: 'NMAT/SNAP managerial-judgement case'
    },
    {
      id: 'dm-da-003', topic: 'lr-decision', subtype: 'data-adequacy', difficulty: 'easy', exams: ['NMAT', 'SNAP'],
      stem: 'A student is deciding which elective subject to take for higher studies. Which single piece of information is MOST useful for the decision?',
      options: [
        'The student\'s own interest and aptitude in the subject and how it fits their career goal.',
        'The colour of the textbook cover.',
        'Which classroom the elective is taught in.',
        'The day of the week the class is scheduled.'
      ],
      answer: 'The student\'s own interest and aptitude in the subject and how it fits their career goal.',
      explanation: 'A sound subject choice depends on the student\'s interest, aptitude and career fit — that information is decisive. The textbook cover, classroom, and class day carry no real bearing on whether the elective is the right choice.',
      explanationVersion: V, tags: ['relevance', 'data-adequacy'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-mgr-006', topic: 'lr-decision', subtype: 'managerial', difficulty: 'easy', exams: ['NMAT', 'SNAP'],
      stem: 'A newly joined employee is confused about how to use the company\'s leave-application system and asks his manager for help. What is the best response?',
      options: [
        'Take a few minutes to show him how the system works, or point him to a colleague who can, so he learns to apply correctly.',
        'Tell him to figure it out on his own, since everyone else in the team managed to learn it without help.',
        'Ignore the request for now because you are busy with your own deadlines and he can ask again later.',
        'Apply the leave on his behalf every time he needs it, so that he never actually has to learn the system himself.'
      ],
      answer: 'Take a few minutes to show him how the system works, or point him to a colleague who can, so he learns to apply correctly.',
      explanation: 'Helping a new joiner learn a routine system is basic, constructive management and makes him self-sufficient. Telling him to struggle alone is needlessly unsupportive; ignoring the request neglects a manager\'s duty; doing it for him forever creates dependence instead of capability.',
      explanationVersion: V, tags: ['management', 'support'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-pri-004', topic: 'lr-decision', subtype: 'priority', difficulty: 'easy', exams: ['XAT', 'SNAP'],
      stem: 'A shopkeeper notices a small fire starting near the electrical wiring at the back of the shop while a customer is still paying at the counter. What should he do first?',
      options: [
        'Get everyone out of the shop safely and raise the alarm or tackle the fire before doing anything else.',
        'Finish collecting the customer\'s payment and hand over the change first, then turn to deal with the fire.',
        'Ignore the fire for now, since it is still small and may die down on its own without any action.',
        'Look for the day\'s cash box and account books to move them to safety before attending to the fire.'
      ],
      answer: 'Get everyone out of the shop safely and raise the alarm or tackle the fire before doing anything else.',
      explanation: 'Human safety comes before money or property: the first priority is to get people out and address the fire while it is still small. Finishing the payment, waiting for it to die down, or saving the cash box first all place transactions or property above the immediate risk to life.',
      explanationVersion: V, tags: ['safety', 'priority'], reviewStatus: A, meta: M
    },
    {
      id: 'dm-eth-006', topic: 'lr-decision', subtype: 'ethical', difficulty: 'easy', exams: ['XAT', 'NMAT'],
      stem: 'A cashier realises she has accidentally given a customer ₹500 too little in change, and the customer is still in the shop. What is the right thing to do?',
      options: [
        'Call the customer back at once and return the ₹500 that is rightfully theirs, apologising for the mistake.',
        'Say nothing about it, since the customer did not notice the shortfall and has not complained.',
        'Keep the extra ₹500 and quietly add it to the day\'s takings so the till still balances.',
        'Wait to see whether the customer comes back on their own to complain before deciding to return the money.'
      ],
      answer: 'Call the customer back at once and return the ₹500 that is rightfully theirs, apologising for the mistake.',
      explanation: 'The money belongs to the customer, so the honest act is to return it immediately. Staying silent, pocketing the amount, or waiting to be caught all knowingly keep money that is not hers — each is a form of dishonesty regardless of whether the customer noticed.',
      explanationVersion: V, tags: ['ethics', 'honesty'], reviewStatus: A, meta: M
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ITEMS;
  var W = (typeof window !== 'undefined') ? window : root;
  (W.LRAuthoredBanks = W.LRAuthoredBanks || {}).decision = ITEMS;
})(this);
