/**
 * data/lr-authored/critical.js — authored Critical Reasoning bank (ADR-079). CAT/XAT/NMAT/SNAP-style.
 * Subtypes: assumption · strengthen · weaken · inference · conclusion · flaw · paradox. Every answer is the single
 * best choice; the explanation teaches the method (negation test, scope, causal alternatives). Validated by
 * data/lr-authored/schema.js in scripts/lr-authored.check.js. PURE data, dual-exported under LRAuthoredBanks.critical.
 */
(function (root) {
  'use strict';
  var V = 1, A = 'approved', M = { addedVersion: 'ADR-079' };
  var ITEMS = [
    {
      id: 'cr-assum-001', topic: 'lr-critical', subtype: 'assumption', difficulty: 'medium', exams: ['CAT', 'NMAT', 'SNAP'],
      stem: 'A city plans to cut downtown traffic congestion by sharply raising parking fees in the central business district. Which of the following is an assumption on which this plan depends?',
      options: [
        'A significant number of people currently drive downtown partly because parking there is affordable.',
        'Public transport into downtown is faster than driving.',
        'The extra revenue the city collects from the higher parking fees will be enough to cover the cost of running the new pricing system.',
        'The city owns the majority of downtown parking lots.'
      ],
      answer: 'A significant number of people currently drive downtown partly because parking there is affordable.',
      explanation: 'A necessary assumption is something the plan needs in order to work. Apply the negation test: if affordable parking were NOT a reason people drive in, raising fees would not reduce the number of cars, and the plan collapses. The other options are not required — the plan can work whether or not transport is faster, shops approve, or the city owns the lots.',
      explanationVersion: V, tags: ['negation-test', 'policy'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-assum-002', topic: 'lr-critical', subtype: 'assumption', difficulty: 'hard', exams: ['CAT', 'XAT'],
      stem: 'A company concludes that its new training program improved productivity, citing that employees who completed it produced 15% more than those who did not. Which assumption is required for this conclusion?',
      options: [
        'Employees who chose to complete the program were not already more productive than those who did not.',
        'The training program was inexpensive to run.',
        'Productivity is the most important measure of performance.',
        'All employees were eligible for the program.'
      ],
      answer: 'Employees who chose to complete the program were not already more productive than those who did not.',
      explanation: 'The argument treats a correlation (completers out-produce non-completers) as proof the training caused the gain. That inference requires ruling out self-selection — that the keener, already-more-productive workers simply chose to complete it. Negate the answer (they WERE already more productive) and the gain is explained without the training, breaking the conclusion. Cost, importance of productivity, and eligibility are irrelevant to causation.',
      explanationVersion: V, tags: ['causation', 'self-selection'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-str-001', topic: 'lr-critical', subtype: 'strengthen', difficulty: 'medium', exams: ['CAT', 'NMAT'],
      stem: 'Researchers claim a coastal town\'s declining fish catch is caused by a new factory dumping waste upstream. Which finding, if true, most strengthens this claim?',
      options: [
        'Fish populations recovered in a neighbouring river after a similar factory there was shut down.',
        'The factory employs many residents of the town.',
        'Fishing boats in the town are older than those elsewhere.',
        'The factory began operating ten years ago.'
      ],
      answer: 'Fish populations recovered in a neighbouring river after a similar factory there was shut down.',
      explanation: 'To strengthen a causal claim, support the cause→effect link or rule out alternatives. A parallel case where removing the same cause reversed the effect is strong causal evidence. Employment and boat age point to other explanations (and do not help the claim); the factory\'s start date alone shows timing, not that waste — rather than some coincident factor — is responsible.',
      explanationVersion: V, tags: ['causation', 'parallel-case'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-str-002', topic: 'lr-critical', subtype: 'strengthen', difficulty: 'hard', exams: ['XAT', 'CAT'],
      stem: 'An economist argues that raising the minimum wage in a region will not increase unemployment there. Which of the following, if true, most strengthens the argument?',
      options: [
        'In comparable regions that raised the minimum wage, employment levels stayed the same or rose afterward.',
        'Most workers in the region earn well above the minimum wage.',
        'Business owners in the region oppose the increase.',
        'The cost of living in the region has been rising.'
      ],
      answer: 'In comparable regions that raised the minimum wage, employment levels stayed the same or rose afterward.',
      explanation: 'The claim is a prediction about an effect (no rise in unemployment). Direct empirical evidence from comparable regions where the same change did not raise unemployment most strengthens it. That most workers already earn above the minimum weakens the relevance of the policy; owners\' opposition and cost of living do not bear on whether unemployment rises.',
      explanationVersion: V, tags: ['prediction', 'evidence'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-wkn-001', topic: 'lr-critical', subtype: 'weaken', difficulty: 'medium', exams: ['CAT', 'SNAP', 'NMAT'],
      stem: 'A health columnist argues that drinking coffee improves longevity, noting that a study found regular coffee drinkers live longer on average than non-drinkers. Which of the following, if true, most weakens the argument?',
      options: [
        'Regular coffee drinkers in the study also exercised more and smoked less than non-drinkers.',
        'Coffee contains antioxidants linked to heart health.',
        'The study followed participants for over twenty years.',
        'Some non-drinkers in the study disliked the taste of coffee.'
      ],
      answer: 'Regular coffee drinkers in the study also exercised more and smoked less than non-drinkers.',
      explanation: 'The argument infers causation (coffee → longevity) from a correlation. The best weakener supplies an alternative cause: if coffee drinkers also exercised more and smoked less, those habits — not coffee — could explain the longer lives. Antioxidants would strengthen; study length and taste preferences do not address the confound.',
      explanationVersion: V, tags: ['confounding', 'alternative-cause'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-wkn-002', topic: 'lr-critical', subtype: 'weaken', difficulty: 'hard', exams: ['XAT', 'CAT'],
      stem: 'A manager argues that switching to remote work hurt the team because output dropped 10% in the quarter after the switch. Which of the following, if true, most weakens this argument?',
      options: [
        'The quarter after the switch coincided with the loss of the team\'s two largest clients for unrelated reasons.',
        'After the switch to remote work, the team continued to use exactly the same software and project-tracking tools that it had used in the office.',
        'Remote work reduced the company\'s office rental costs.',
        'Output is measured the same way before and after the switch.'
      ],
      answer: 'The quarter after the switch coincided with the loss of the team\'s two largest clients for unrelated reasons.',
      explanation: 'The argument blames remote work for the drop. An unrelated cause that fully explains the drop (losing the two largest clients) severs the link between remote work and the decline. Preferences and rental costs are beside the point; consistent measurement would, if anything, support the comparison rather than weaken it.',
      explanationVersion: V, tags: ['alternative-cause', 'coincidence'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-inf-001', topic: 'lr-critical', subtype: 'inference', difficulty: 'medium', exams: ['CAT', 'NMAT'],
      stem: 'All of the company\'s senior engineers have at least ten years of experience. No engineer with fewer than five years of experience has been promoted to senior. Rohit is a senior engineer. Which conclusion can be drawn with certainty?',
      options: [
        'Rohit has at least ten years of experience.',
        'Rohit has exactly ten years of experience.',
        'Every engineer with ten years of experience is senior.',
        'Rohit was promoted recently.'
      ],
      answer: 'Rohit has at least ten years of experience.',
      explanation: 'An inference must follow necessarily. Since all senior engineers have at least ten years\' experience and Rohit is senior, he must have at least ten years — certain. "Exactly ten" overstates (it could be more); "every engineer with ten years is senior" reverses the statement; nothing is said about when he was promoted.',
      explanationVersion: V, tags: ['deduction', 'scope'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-inf-002', topic: 'lr-critical', subtype: 'inference', difficulty: 'easy', exams: ['SNAP', 'NMAT', 'RRB'],
      stem: 'Every book in the school library has a barcode. Some books in the library are reference books. Which of the following must be true?',
      options: [
        'Some reference books in the library have a barcode.',
        'All books with barcodes are reference books.',
        'No reference book has a barcode.',
        'Most books in the library are reference books.'
      ],
      answer: 'Some reference books in the library have a barcode.',
      explanation: 'Reference books are books in the library, and every such book has a barcode, so at least those reference books have barcodes — "some reference books have a barcode" must be true. The other options either reverse the relation, contradict the premises, or claim a quantity ("most") that is not supported.',
      explanationVersion: V, tags: ['deduction'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-con-001', topic: 'lr-critical', subtype: 'conclusion', difficulty: 'medium', exams: ['CAT', 'SNAP'],
      stem: 'A new bridge cut the average commute between two suburbs from 50 minutes to 20 minutes. Property prices in the farther suburb, previously cheaper due to its distance, have since risen to match those nearer the city. Which conclusion is best supported?',
      options: [
        'Improved travel time can raise the value of property that was discounted for being remote.',
        'The bridge was the only factor affecting property prices.',
        'Property in the farther suburb is now overpriced.',
        'Commute time is the most important factor in all property prices.'
      ],
      answer: 'Improved travel time can raise the value of property that was discounted for being remote.',
      explanation: 'A well-supported conclusion stays within the evidence. The passage shows prices rose after travel time fell, supporting the measured claim that better travel time can lift values that were discounted for remoteness. The other choices overreach: "only factor", "overpriced", and "most important in all prices" all assert far more than the single case shows.',
      explanationVersion: V, tags: ['scope', 'overreach'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-flaw-001', topic: 'lr-critical', subtype: 'flaw', difficulty: 'hard', exams: ['XAT', 'CAT'],
      stem: 'Argument: "Our best-selling phone has the most five-star reviews of any phone we sell, so it must be our most reliable model." The reasoning is most vulnerable to which criticism?',
      options: [
        'It ignores that the best-selling phone is bought by far more people, so it would naturally collect more reviews of every kind.',
        'It assumes that reliability matters to customers.',
        'It fails to define what counts as a five-star review.',
        'It assumes that every customer who is happy with a phone will take the trouble to leave a five-star review for it.'
      ],
      answer: 'It ignores that the best-selling phone is bought by far more people, so it would naturally collect more reviews of every kind.',
      explanation: 'The flaw is comparing raw counts instead of rates. A phone sold to far more people will accumulate more five-star reviews simply due to volume, not superior reliability — the proportion of five-star (or one-star) reviews is what matters. The other options raise side issues that do not expose the count-vs-rate error.',
      explanationVersion: V, tags: ['rate-vs-count', 'flaw'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-flaw-002', topic: 'lr-critical', subtype: 'flaw', difficulty: 'medium', exams: ['CAT', 'NMAT'],
      stem: 'Argument: "Every successful entrepreneur I have read about wakes up before 5 a.m. Therefore, waking up before 5 a.m. is what makes entrepreneurs successful." Which best describes the flaw?',
      options: [
        'It treats a trait shared by successful people as the cause of their success, ignoring that many unsuccessful people may share it too.',
        'It assumes all entrepreneurs read about themselves.',
        'It relies on too small a sample of biographies.',
        'It overlooks that the early-rising entrepreneurs it cites may have had wealth or family support that allowed them both to wake early and to succeed.'
      ],
      answer: 'It treats a trait shared by successful people as the cause of their success, ignoring that many unsuccessful people may share it too.',
      explanation: 'This is the classic "survivorship/common-trait" causal flaw: observing that successful people share a habit does not show the habit causes success, especially when countless unsuccessful people may also wake early. Sample size is a weaker objection and definition is a side issue; the core error is mistaking a shared trait for a cause.',
      explanationVersion: V, tags: ['causation', 'survivorship'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-par-001', topic: 'lr-critical', subtype: 'paradox', difficulty: 'hard', exams: ['XAT', 'CAT'],
      stem: 'A bookstore raised the price of its most popular novel, yet that novel\'s monthly sales increased afterward. Which of the following, if true, best resolves this apparent paradox?',
      options: [
        'The price rise coincided with the release of a hit film based on the novel, sharply increasing demand.',
        'The bookstore reduced the prices of several other novels.',
        'The novel had been the store\'s best-seller for a year.',
        'The bookstore had kept the novel on display in its front window for several weeks before it decided to raise the price.'
      ],
      answer: 'The price rise coincided with the release of a hit film based on the novel, sharply increasing demand.',
      explanation: 'To resolve a paradox, find a fact that lets both surprising facts be true together. A film adaptation raising demand explains why sales rose despite the higher price — demand shifted up enough to outweigh the price effect. The other options do not connect the price rise to higher sales of THIS novel.',
      explanationVersion: V, tags: ['resolve-paradox', 'demand'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-par-002', topic: 'lr-critical', subtype: 'paradox', difficulty: 'medium', exams: ['CAT', 'NMAT', 'SNAP'],
      stem: 'A hospital introduced a strict hand-washing policy, yet the recorded rate of infections rose in the following months. Which of the following, if true, best explains this surprising result?',
      options: [
        'Along with the policy, the hospital began testing far more patients for infections, detecting cases that previously went unrecorded.',
        'The hospital also asked all visitors, not only the medical staff, to wash their hands at the entrance during the same period.',
        'Hand-washing is widely known to reduce infections.',
        'The hospital admitted fewer patients overall that period.',
      ],
      answer: 'Along with the policy, the hospital began testing far more patients for infections, detecting cases that previously went unrecorded.',
      explanation: 'The paradox dissolves once we see the RECORDED rate can rise even as true infections fall: more testing surfaces cases that were always there but uncounted. The other options either restate the policy, support the expected effect, or (fewer admissions) would not by itself raise the rate.',
      explanationVersion: V, tags: ['measurement', 'detection'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-assum-003', topic: 'lr-critical', subtype: 'assumption', difficulty: 'easy', exams: ['SNAP', 'NMAT', 'RRB'],
      stem: 'Advertisement: "Switch to SolarHome panels and your electricity bill will drop to zero." Which assumption does this claim rely on?',
      options: [
        'The panels will generate at least as much electricity as the household uses.',
        'SolarHome panels are cheaper than rival brands.',
        'The household will buy a battery as well.',
        'Electricity prices will rise in the future.'
      ],
      answer: 'The panels will generate at least as much electricity as the household uses.',
      explanation: 'For the bill to fall to zero, the panels must cover the home\'s entire electricity use; otherwise the household still buys some power and the bill is not zero. That is the necessary assumption. Relative price, batteries, and future rates are not required for the specific "bill to zero" claim.',
      explanationVersion: V, tags: ['necessary-condition'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-wkn-003', topic: 'lr-critical', subtype: 'weaken', difficulty: 'medium', exams: ['CAT', 'SNAP'],
      stem: 'A school principal argues that longer school days will improve exam results, pointing to a top-ranked school that has the longest school day in the district. Which of the following, if true, most weakens this argument?',
      options: [
        'The top-ranked school also admits only students who score highly on a competitive entrance test.',
        'The top-ranked school has a well-equipped library.',
        'Some parents at the school prefer shorter days.',
        'The top-ranked school has recently renovated its classrooms and installed air-conditioning in every room.'
      ],
      answer: 'The top-ranked school also admits only students who score highly on a competitive entrance test.',
      explanation: 'The argument attributes the school\'s results to its long day. Selective admission supplies a powerful alternative cause: the school\'s results may reflect the high-scoring students it admits, not the length of its day. The library is too vague to weaken, parents\' preferences are irrelevant to results, and the number of schools does not address causation.',
      explanationVersion: V, tags: ['selection-bias', 'alternative-cause'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-inf-003', topic: 'lr-critical', subtype: 'inference', difficulty: 'hard', exams: ['XAT', 'CAT'],
      stem: 'In a region, every household that owns a car also owns a refrigerator. Some households that own a refrigerator do not own a television. Which of the following must be true?',
      options: [
        'It is possible that some car-owning households do not own a television.',
        'Every refrigerator-owning household owns a car.',
        'No car-owning household owns a television.',
        'Every household owns a refrigerator.'
      ],
      answer: 'It is possible that some car-owning households do not own a television.',
      explanation: 'Car owners are a subset of refrigerator owners, and some refrigerator owners lack a television — those TV-less households could include car owners, so it is POSSIBLE that some car owners lack a television (the answer is a possibility claim, which holds). The other options reverse the subset relation, assert an impossibility, or overgeneralise — none is forced by the premises.',
      explanationVersion: V, tags: ['deduction', 'possibility'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-wkn-easy-001', topic: 'lr-critical', subtype: 'weaken', difficulty: 'easy', exams: ['SNAP', 'NMAT', 'RRB'],
      stem: 'A shopkeeper claims that placing a product on the top shelf increases its sales, because the product on his top shelf sells the most. Which of the following, if true, most weakens his claim?',
      options: [
        'The product on his top shelf is also the cheapest and most popular brand in the shop.',
        'The top shelf is painted a bright colour.',
        'The shop has five shelves in total.',
        'The shopkeeper restocks the top shelf every morning.'
      ],
      answer: 'The product on his top shelf is also the cheapest and most popular brand in the shop.',
      explanation: 'The claim assumes the shelf position drives the sales. If the top-shelf product is independently the cheapest and most popular brand, its sales are explained by price/popularity, not the shelf — which weakens the claim. The other options do not offer an alternative cause for the high sales.',
      explanationVersion: V, tags: ['alternative-cause'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-eval-001', topic: 'lr-critical', subtype: 'evaluate', difficulty: 'medium', exams: ['CAT', 'NMAT'], inspiredBy: 'CAT-style evaluate-the-argument',
      stem: 'A logistics firm replaced half its diesel vans with electric ones and reports that its monthly fuel bill fell by 30%. It concludes that electrifying the rest of the fleet will cut the remaining fuel bill by a further 30%. Answering which of the following would be MOST useful in evaluating this conclusion?',
      options: [
        'Whether the diesel vans that were replaced were the ones that had been driven the most kilometres each month',
        'Whether the firm received a government subsidy when it purchased its first batch of electric vans',
        'Whether the drivers preferred operating the electric vans over the older diesel vans',
        'Whether the electric vans were manufactured within the same country as the diesel vans'
      ],
      answer: 'Whether the diesel vans that were replaced were the ones that had been driven the most kilometres each month',
      explanation: 'The forecast assumes the remaining vans are like the ones already replaced. If the firm first swapped its highest-mileage vans, the easy savings are already taken and the rest will save far less than 30% — so this question is decisive for the conclusion. Subsidies, driver preference and country of manufacture do not bear on how much fuel the remaining vans will save.',
      explanationVersion: V, tags: ['evaluate', 'representativeness'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-eval-002', topic: 'lr-critical', subtype: 'evaluate', difficulty: 'hard', exams: ['XAT', 'CAT'], inspiredBy: 'XAT-style evaluate',
      stem: 'A hospital introduced a wellness programme and found that employees who enrolled took 20% fewer sick days than those who did not. It plans to make the programme compulsory for everyone, expecting the same drop across the whole workforce. Which question is MOST useful to evaluate this plan?',
      options: [
        'Were the employees who chose to enrol already healthier or more health-conscious than those who did not enrol?',
        'Did the wellness programme cost the hospital more to run than it had originally budgeted for?',
        'Were the sick days counted in calendar days or only in scheduled working days?',
        'Did the employees who enrolled also tend to work in the same departments?'
      ],
      answer: 'Were the employees who chose to enrol already healthier or more health-conscious than those who did not enrol?',
      explanation: 'The plan generalises from volunteers to everyone. If enrollees were already healthier, their fewer sick days reflect self-selection, not the programme, and compulsion would not reproduce the drop — so this is the decisive question. Cost, how days are counted, and departments do not test whether the programme itself caused the improvement.',
      explanationVersion: V, tags: ['evaluate', 'self-selection'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-comp-001', topic: 'lr-critical', subtype: 'complete', difficulty: 'medium', exams: ['CAT', 'SNAP'], inspiredBy: 'CAT-style complete-the-argument',
      stem: 'A bookstore noticed that the months in which it hosted author events were also its highest-revenue months, and it almost decided to host an event every week. It held back, however, because it realised that ____',
      options: [
        'the author events had so far been scheduled mainly in the festive season, when book-buying is high anyway',
        'the authors who visited the store were generally popular with the store\'s regular customers',
        'hosting an author event requires the store to rearrange its shelves for the evening',
        'some customers who attended the events did not buy any book on the day'
      ],
      answer: 'the author events had so far been scheduled mainly in the festive season, when book-buying is high anyway',
      explanation: 'The argument treats the events as the cause of high revenue. The completion must give a reason to doubt that — and a confound (events were held in the already-high-revenue festive season) does exactly that, justifying the hesitation. The other choices are true-but-irrelevant details that do not undercut the events→revenue inference.',
      explanationVersion: V, tags: ['complete', 'confound'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-comp-002', topic: 'lr-critical', subtype: 'complete', difficulty: 'hard', exams: ['XAT', 'CAT'], inspiredBy: 'XAT-style complete',
      stem: 'A city argued that its new cycle lanes had improved road safety, pointing out that accidents on those roads fell in the year after the lanes opened. This reasoning would be most seriously undermined if it were shown that ____',
      options: [
        'in the same year, the city also lowered the speed limit on exactly those roads and added speed cameras',
        'the cycle lanes were used by fewer cyclists than the planners had initially hoped for',
        'building the cycle lanes cost more than the amount the city had set aside for them',
        'a few drivers complained that the cycle lanes had made the roads narrower'
      ],
      answer: 'in the same year, the city also lowered the speed limit on exactly those roads and added speed cameras',
      explanation: 'The claim credits the cycle lanes for the fall in accidents. A simultaneous, road-specific change (lower speed limit + cameras) is an alternative cause that could fully explain the drop, undermining the inference. Low usage, cost and driver complaints do not provide a competing cause for the fewer accidents.',
      explanationVersion: V, tags: ['complete', 'alternative-cause'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-meth-001', topic: 'lr-critical', subtype: 'method', difficulty: 'hard', exams: ['XAT', 'CAT'], inspiredBy: 'CAT-style method-of-reasoning',
      stem: 'Critic: "The minister claims the new tax helped the poor because poverty fell after it was introduced. But poverty had been falling steadily for a decade before the tax, at the very same rate. So the tax deserves no special credit." How does the critic counter the minister\'s argument?',
      options: [
        'By showing that the effect the minister attributes to the tax was already occurring for other reasons',
        'By arguing that the minister has misunderstood what the official poverty figures actually measure',
        'By presenting expert testimony that directly contradicts the minister\'s central claim',
        'By pointing out that the minister has a personal interest in defending the tax'
      ],
      answer: 'By showing that the effect the minister attributes to the tax was already occurring for other reasons',
      explanation: 'The critic does not dispute the figures or attack the minister; he shows the trend predated the tax and continued at the same rate, so the tax adds nothing — undermining the causal claim by revealing a pre-existing trend. The other options describe tactics (redefining the measure, expert testimony, ad hominem) the critic does not use.',
      explanationVersion: V, tags: ['method', 'pre-existing-trend'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-parallel-001', topic: 'lr-critical', subtype: 'parallel', difficulty: 'hard', exams: ['CAT', 'XAT'], inspiredBy: 'CAT-style parallel-reasoning',
      stem: 'Argument: "Every employee who was promoted last year had completed the leadership course. Meera completed the leadership course. So Meera will be promoted." Which of the following arguments is most similar in its reasoning to the one above?',
      options: [
        'All the students who won the scholarship had scored above 90%. Rohan scored above 90%. So Rohan will win the scholarship.',
        'All the cats in the shelter are vaccinated. This animal is vaccinated. So it must be a cat from the shelter.',
        'No player on the team is under 18. Sara is 20. So Sara could be on the team.',
        'Most people who exercise daily are healthy. Tarun is healthy. So Tarun probably exercises daily.'
      ],
      answer: 'All the students who won the scholarship had scored above 90%. Rohan scored above 90%. So Rohan will win the scholarship.',
      explanation: 'The original commits the flaw of treating a necessary condition (the course) as sufficient for promotion. The scholarship argument has the identical structure — a necessary condition (scoring above 90%) wrongly treated as guaranteeing the result. The others differ: the cat argument reverses the conditional, and the remaining two use "no"/"most" rather than the all→therefore-certain pattern.',
      explanationVersion: V, tags: ['parallel', 'necessary-vs-sufficient'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-str-rich-001', topic: 'lr-critical', subtype: 'strengthen', difficulty: 'medium', exams: ['CAT', 'NMAT', 'SNAP'], inspiredBy: 'CAT-style strengthen',
      stem: 'A school principal believes that serving a free breakfast improved her students\' test scores, since scores rose the year the breakfast began. Which of the following, if true, most strengthens her belief?',
      options: [
        'In a neighbouring school that introduced the same breakfast a year later, test scores rose only after the breakfast began and not before',
        'The students at the principal\'s school generally said they enjoyed the taste of the free breakfast',
        'The free breakfast was funded by a grant that the school had applied for two years earlier',
        'Parents of the students were pleased that the school had taken an interest in nutrition'
      ],
      answer: 'In a neighbouring school that introduced the same breakfast a year later, test scores rose only after the breakfast began and not before',
      explanation: 'A parallel case where the same cause was introduced at a different time, and the effect followed only then, is strong evidence that the breakfast — not some coincident factor — drove the rise. Enjoyment, grant timing and parental approval say nothing about whether the breakfast caused the score increase.',
      explanationVersion: V, tags: ['strengthen', 'parallel-case'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-assum-rich-001', topic: 'lr-critical', subtype: 'assumption', difficulty: 'hard', exams: ['XAT', 'CAT'], inspiredBy: 'XAT-style assumption',
      stem: 'A streaming service plans to reduce customer cancellations by adding more regional-language films, reasoning that subscribers who cancel do so because they run out of things to watch. Which of the following is an assumption the plan depends on?',
      options: [
        'At least a meaningful share of the subscribers who cancel would stay if more regional-language films were available to them',
        'Regional-language films are cheaper for the streaming service to license than films in other languages',
        'The subscribers who cancel watch more hours of content each week than those who renew',
        'Competing streaming services do not already offer a larger regional-language catalogue'
      ],
      answer: 'At least a meaningful share of the subscribers who cancel would stay if more regional-language films were available to them',
      explanation: 'The plan works only if "running out of things to watch" is actually why people cancel and more films would retain them. Negate the answer — almost no cancellers would stay for more regional films — and the plan collapses, so it is a required assumption. Licensing cost, viewing hours, and competitors\' catalogues are not needed for the plan to succeed.',
      explanationVersion: V, tags: ['assumption', 'negation-test'], reviewStatus: A, meta: M
    },
    {
      id: 'cr-flaw-rich-001', topic: 'lr-critical', subtype: 'flaw', difficulty: 'medium', exams: ['CAT', 'SNAP'], inspiredBy: 'CAT-style flaw',
      stem: 'A columnist writes: "The new airport is clearly a success. In its first month it handled more passengers than the old airport handled in its final month, so the city was obviously right to build it." The reasoning is most vulnerable to the criticism that it ____',
      options: [
        'judges the project a success on passenger numbers alone, ignoring whether the benefit was worth the cost of building it',
        'assumes without evidence that the old airport was incapable of handling any more passengers',
        'fails to specify exactly how many passengers each of the two airports handled',
        'does not consider the opinions of the passengers who used the new airport'
      ],
      answer: 'judges the project a success on passenger numbers alone, ignoring whether the benefit was worth the cost of building it',
      explanation: 'Higher passenger numbers show the airport is used, not that building it was the right decision — that requires weighing the benefit against the cost, which the argument never does. The flaw is equating "more passengers" with "success". The other options raise side issues that do not capture this leap.',
      explanationVersion: V, tags: ['flaw', 'cost-benefit'], reviewStatus: A, meta: M
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ITEMS;
  var W = (typeof window !== 'undefined') ? window : root;
  (W.LRAuthoredBanks = W.LRAuthoredBanks || {}).critical = ITEMS;
})(this);
