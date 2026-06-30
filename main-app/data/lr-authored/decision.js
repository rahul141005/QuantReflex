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
        'Resign from the company in protest.'
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
        'Blame the team publicly for the delay.'
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
        'Toss a coin to decide between them.'
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
        'Immediately transfer one of them to another team.',
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
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ITEMS;
  var W = (typeof window !== 'undefined') ? window : root;
  (W.LRAuthoredBanks = W.LRAuthoredBanks || {}).decision = ITEMS;
})(this);
