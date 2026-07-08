/**
 * aiStrings.js — QuanAI deterministic server-string table (ADR-111 Phase E, E-M3).
 *
 * The QuanAI brain (aiBrain.js) composes each response envelope from TWO sources: LLM prose (localized at
 * generation time by the sys() response-language directive, E-M1) and DETERMINISTIC scaffolding the server
 * writes itself — block titles, metric labels, pattern cards, mission frames, chips and fallbacks. Those
 * deterministic strings are interleaved with the LLM prose server-side, so the client cannot tell them
 * apart to localize them; they must be localized HERE, where they are written.
 *
 * AIStrings.s(lang, key, params) resolves a flat 'ns.key' against the study-language map, falls back
 * hi/mr → en → key, and interpolates {token} params (plural objects {one, other} select on params.count
 * via Intl.PluralRules, mirroring QRI18n). English values are the pre-i18n literals VERBATIM, so
 * s('en', key, p) reproduces the exact bytes aiBrain emitted before this phase — the EN envelope stays
 * byte-identical (asserted in ai-lang.check).
 *
 * INVARIANTS (enforced by ai-lang.check §7):
 *   - Digits stay 0-9; ₹, %, units (s/Q, km/h) and the DNT glossary terms are never translated.
 *   - {token} placeholder sets match across en/hi/mr for every key.
 *   - Chip VALUE codes never live here — only chip labels; the machine codes stay in aiBrain.
 * Node-only module (required by aiBrain server-side, like aiPrompts); dual-exported for the check harness.
 */
'use strict';

var _M = {
  en: {
    /* ── readiness band labels (_band) ── */
    'band.examReady': 'Exam ready',
    'band.onTrack': 'On track',
    'band.building': 'Building',
    'band.early': 'Early days',

    /* ── shared labels ── */
    'label.examReadiness': 'Exam readiness',
    'label.streak': 'Streak',
    'label.daysToExam': '{days} days to {exam}',

    /* ── coach dashboard ── */
    'coach.greeting': 'Welcome back.',
    'coach.greetingNamed': 'Welcome back, {name}.',
    'coach.yourCoach': 'Your coach',
    'coach.oneWorry': "One thing I'm watching",
    'coach.thisWeeksPlan': "This week's plan",
    'coach.onTrackKeep': 'On track — keep it up',
    'coach.closeGap': "Let's close the gap",
    'coach.dtePlain': '{days} days to {exam}.',
    'coach.dteOnTrack': '{days} days to {exam} — on track, {buffer}d buffer',
    'coach.dteBehind': '{days} days to {exam} — {behind}d behind, plan rebalanced',
    'coach.missionWhyDefault': 'Your highest-impact topic right now.',
    'coach.fromStudyPlan': 'From your study plan.',
    'coach.updatedFromPractice': 'Updated from your latest practice.',
    'coach.chipStartSet': "Start today's set",
    'coach.chipSpeedAccuracy': 'Speed or accuracy?',
    'coach.chipOpenPlanner': 'Open my planner',
    'coach.chipSetGoal': 'Set an exam goal',

    /* ── coach low-data ── */
    'coachLow.heyName': 'Hey {name} 👋 ',
    'coachLow.heyThere': 'Hey there 👋 ',
    'coachLow.analysed': { one: "I've analysed your first {n} question — here's the early read. The more you practise, the sharper my coaching gets.", other: "I've analysed your first {n} questions — here's the early read. The more you practise, the sharper my coaching gets." },
    'coachLow.noData': "I don't know much about you yet, but that's the fun part — every set you do makes my coaching sharper. Here's where we'll start.",
    'coachLow.sharpenWhy': 'Early signal says this is your highest-impact topic to nudge first.',
    'coachLow.mixedWhy': 'A short, varied set lets me read your pace, accuracy, and first weak spots.',
    'coachLow.buildTogether': "Every question teaches me something about how you think — let's build the picture together.",
    'coachLow.chipStartSet': 'Start a set',

    /* ── coach fallback ── */
    'coachFallback.accLine': "You're {pct}% accurate over {total} questions. ",
    'coachFallback.tighten': "Tighten up {label} next — that's your biggest lever right now.",
    'coachFallback.keepStreak': 'Keep your streak alive with a focused set.',
    'coachFallback.drillWhy': 'Targeted practice on your weakest topic.',
    'coachFallback.chipStart': 'Start that set',
    'coachFallback.chipNotToday': 'Not today',

    /* ── mission frames (topic {label} is server data — kept in its canonical form) ── */
    'mission.revise': 'Revise: {label}',
    'mission.today': 'Today: {label}',
    'mission.todayDrill': 'Today: drill {label}',
    'mission.mock': 'Mock: {label}',
    'mission.study': 'Study: {label}',
    'mission.fix': 'Fix {label}',
    'mission.sharpen': 'Sharpen {label}',
    'mission.drill': 'Drill {label}',
    'mission.practise': 'Practise {label}',
    'mission.drillNow': 'Drill {label} now',
    'mission.quick5': 'Quick 5 to keep it sharp',
    'mission.addToday': "Add {label} to today's practice",
    'mission.startMixed': 'Start a mixed set',
    'mission.runMixed': 'Run a mixed set',

    /* ── next task (recovery) ── */
    'nextTask.recoveryReason': 'Recent accuracy slipped here — a short recovery before new work.',

    /* ── metric cluster ── */
    'metric.accuracy7d': 'Accuracy (7d)',
    'metric.accuracyToday': 'Accuracy today',
    'metric.accuracy': 'Accuracy',
    'metric.speed': 'Speed',
    'metric.speedToday': 'Speed today',
    'metric.consistency': 'Consistency',
    'metric.consistencyValue': '{n}/14 days',
    'metric.today': 'Today',
    'metric.soFar': 'So far',
    'metric.accuracySoFar': 'Accuracy so far',
    'metric.doneValue': '{pct}% ({n} done)',

    /* ── pattern cards (_detectPatterns) ── */
    'pattern.careless.title': 'Careless slips',
    'pattern.careless.body': "You're missing questions in topics you've already mastered — slow down on the ones you know.",
    'pattern.speed.title': "You're slowing down",
    'pattern.speed.body': "Your pace drifted to {recent}s/Q from {baseline}s/Q — let's do speed reps.",
    'pattern.plateau.title': "You've plateaued",
    'pattern.plateau.body': 'Your accuracy has held flat for a month — time to raise the difficulty and break through.',
    'pattern.inconsistent.title': 'Practice is sporadic',
    'pattern.inconsistent.body': 'Only {active}/14 active days — you improve fastest with a steady streak.',
    'pattern.burnout.title': 'Rebuild your momentum',
    'pattern.burnout.body': 'A break plus a dip in accuracy — ease back in on a topic you already know well.',
    'pattern.warmup.title': 'You warm up well',
    'pattern.warmup.body': 'You get ~{pct}% faster within a session — longer sets really pay off for you.',

    /* ── insights dashboard ── */
    'insights.patternsIntro': "Here's what your data is really saying.",
    'insights.bigDiscovery': 'The big discovery',
    'insights.worthKnowing': 'Worth knowing',
    'insights.biggestWeakness': 'Your biggest weakness',
    'insights.weaknessDefault': "Tighten up {label} — it's your highest-impact fix.",
    'insights.adherenceLow': "You've done {pct}% of your planned work lately — the plan only helps if you run it.",
    'insights.planVsData': 'Plan vs. your data',
    'insights.recoveryBody': 'Your plan moves on, but recent accuracy slipped on {topics} — do a short recovery set first.',
    'insights.readyEarly': "At this pace you'll be exam-ready {buffer} days early.",
    'insights.behind': "You're {behind} days behind{claw}",
    'insights.clawback': ' — +15 min/day claws back {saved}.',
    'insights.behindEnd': '.',
    'insights.plusMinutes': '+15 min/day → finish {saved} days sooner.',
    'insights.forecast': 'Forecast: on the optimal path you reach ~{projected}/100 (target {target}) — {verdict}. Confidence: {conf}.',
    'insights.forecastAchievable': 'achievable',
    'insights.forecastShort': 'short for now',
    'insights.opportunityCost': 'Opportunity cost',
    'insights.opportunityBody': 'Parking {topics} leaves about +{marks} readiness points unclaimed. If you free up time, {top} is the highest-value add-back.',
    'insights.bottleneck': 'Dependency bottleneck',
    'insights.bottleneckBody': '{label} is weak but unlocks {unlocks} — clearing it lifts several downstream topics at once.',
    'insights.revisionDebt': 'Revision debt',
    'insights.revisionDebtBody': '{n} topics are past their revision date — retention decays fastest right after you learn, so this is quietly costing you earned marks.',
    'insights.goingStale': 'Going stale',
    'insights.goingStaleBody': "You haven't touched {label} in {days} days — a 15-minute brush-up now beats relearning it later.",
    'insights.fixWhy': '{pct}% accuracy — high-impact to improve.',
    'insights.sharpenWhy': 'Your highest-impact topic to push next.',
    'insights.chipWhatFirst': 'What first?',
    'insights.chipOpenPlanner': 'Open my planner',
    'insights.chipPractice': 'Practice {label}',

    /* ── insights low-data ── */
    'insightsLow.analysed': { one: "Early read from your first {n} question: the picture sharpens with every set — here's what I can already see.", other: "Early read from your first {n} questions: the picture sharpens with every set — here's what I can already see." },
    'insightsLow.noData': "I haven't seen you solve yet, so here's how this works: every question feeds your accuracy, speed, and topic patterns — and I'll surface them the moment they appear.",
    'insightsLow.firstPattern': 'First pattern',
    'insightsLow.firstPatternBody': 'Your early numbers point to {label} as the topic to tighten first.',
    'insightsLow.fixWhy': 'Your highest-impact topic on the data so far.',
    'insightsLow.mixedWhy': 'A short, varied set is all I need to surface your first real patterns.',

    /* ── insights fallback ── */
    'insightsFallback.stand': "Here's where you stand. Your highest-impact move is tightening up {label}.",
    'insightsFallback.fixWhy': 'Your weakest topic by accuracy.',

    /* ── explain envelope ── */
    'explain.couldntGenerate': "I couldn't generate a full explanation just now.",
    'explain.correctAnswer': 'The correct answer is {answer}. Tap retry to try again.',
    'explain.stepByStep': 'Step-by-step solution',
    'explain.commonMistakes': 'Common mistakes',
    'explain.slippedLead': "You've slipped here before — watch these:\n",
    'explain.fasterMethod': 'Faster method',
    'explain.inExam': 'In {exam}',
    'explain.yourAccuracy': 'Your {label} accuracy',
    'explain.nextWeak': "This is one of your focus areas — let's turn it around.",
    'explain.nextBase': "Let's build a base here.",
    'explain.nextStrongSlip': "You're strong here — that looks like a slip, not a gap.",
    'explain.nextStrong': "You've got this topic down.",
    'explain.nextDeveloping': "You're developing this well — keep the momentum.",
    'explain.whyWeak': 'A focused set is the fastest way to fix this.',
    'explain.whyStrong': 'A short set locks in a topic you already own.',
    'explain.whyDeveloping': 'A bit more reps moves this into a strength.',
    'explain.chipGotIt': 'Got it ✓',
    'explain.chipSimpler': 'Simpler',
    'explain.chipDeeper': 'Go deeper',
    'explain.chipAnother': 'Another like this',
    'explain.chipDrillThis': 'Drill this',
    'explain.chipRetry': 'Retry',
    'explain.chipDrillTopic': 'Drill this topic',

    /* ── exam insight (_examInsight) ── */
    'examInsight.text': '{label} is {freq}-frequency in {exam} and {diff}. Aim for about {target} a question.',
    'examInsight.freqHigh': 'high',
    'examInsight.freqMedium': 'medium',
    'examInsight.freqLow': 'low',
    'examInsight.diffTough': 'a tougher area',
    'examInsight.diffModerate': 'moderate',
    'examInsight.diffFriendly': 'one of the friendlier topics',

    /* ── chat acks ── */
    'chat.ackYes': 'Great — keep that momentum.',
    'chat.ackNo': "Got it, I'll go more thorough next time.",
    'chat.drillLabel': 'Drill {label}',
    'chat.couldntExpand': "I couldn't expand on that just now — try again in a moment.",
    'chat.couldntAnswer': "I couldn't answer that just now — try again in a moment.",
    'chat.chipAnother': 'Another',

    /* ── planner narration fallback ── */
    'planner.narrateRationale': 'This block focuses on {topics} — your highest-impact topics right now, ordered so each builds on the last.',
    'planner.narrateBehind': "You're a little behind — I've added a recovery day so the plan still lands before your exam.",
    'planner.narrateOnTrack': "Stay consistent and you're on track. Readiness {score}/100 and climbing.",

    /* ── planner envelope ── */
    'planner.rationaleDefault': 'Your study planner adapts every two weeks from your real progress.',
    'planner.restDay': 'Rest day — recovery is part of the plan. Back at it tomorrow.',
    'planner.noTasks': "No tasks scheduled today. Open the calendar to see what's ahead.",
    'planner.dteOnTrack': '{days} days to {exam} — on track with {buffer} days of buffer.',
    'planner.dteBehind': '{days} days to {exam} — {behind} days behind; I rebalanced your plan.',
    'planner.dtePlain': '{days} days to {exam}.',
    'planner.yourExam': 'your exam',
    'planner.chipStartDrill': "Start today's drill",
    'planner.chipOpenCalendar': 'Open calendar',
    'planner.chipAdjust': 'Adjust plan',

    /* ── helpful chips (shared) ── */
    'chip.helpful': '👍 Helpful',
    'chip.notReally': '👎 Not really'
  }
};

/* ══════════════════════════════════ हिन्दी (Hindi) ══════════════════════════════════
   Exam-coaching register, आप-form. Digits 0-9, ₹/%/units and DNT glossary terms preserved. */
_M.hi = {
  'band.examReady': 'परीक्षा के लिए तैयार',
  'band.onTrack': 'सही राह पर',
  'band.building': 'तैयारी बन रही है',
  'band.early': 'शुरुआती दौर',

  'label.examReadiness': 'परीक्षा तैयारी',
  'label.streak': 'स्ट्रीक',
  'label.daysToExam': '{exam} में {days} दिन',

  'coach.greeting': 'वापसी पर स्वागत है।',
  'coach.greetingNamed': 'वापसी पर स्वागत है, {name}।',
  'coach.yourCoach': 'आपके कोच',
  'coach.oneWorry': 'एक बात जिस पर मेरी नज़र है',
  'coach.thisWeeksPlan': 'इस हफ़्ते की योजना',
  'coach.onTrackKeep': 'सही राह पर — ऐसे ही बनाए रखें',
  'coach.closeGap': 'आइए यह अंतर पाटें',
  'coach.dtePlain': '{exam} में {days} दिन बाकी।',
  'coach.dteOnTrack': '{exam} में {days} दिन बाकी — सही राह पर, {buffer} दिन का बफ़र',
  'coach.dteBehind': '{exam} में {days} दिन बाकी — {behind} दिन पीछे, योजना फिर से संतुलित',
  'coach.missionWhyDefault': 'अभी आपका सबसे असरदार विषय।',
  'coach.fromStudyPlan': 'आपकी अध्ययन योजना से।',
  'coach.updatedFromPractice': 'आपके ताज़ा अभ्यास से अपडेट किया गया।',
  'coach.chipStartSet': 'आज का सेट शुरू करें',
  'coach.chipSpeedAccuracy': 'गति या सटीकता?',
  'coach.chipOpenPlanner': 'मेरा प्लानर खोलें',
  'coach.chipSetGoal': 'परीक्षा लक्ष्य तय करें',

  'coachLow.heyName': 'नमस्ते {name} 👋 ',
  'coachLow.heyThere': 'नमस्ते 👋 ',
  'coachLow.analysed': { one: 'मैंने आपके पहले {n} प्रश्न का विश्लेषण किया — यह शुरुआती आकलन है। आप जितना अभ्यास करेंगे, मेरी कोचिंग उतनी ही पैनी होगी।', other: 'मैंने आपके पहले {n} प्रश्नों का विश्लेषण किया — यह शुरुआती आकलन है। आप जितना अभ्यास करेंगे, मेरी कोचिंग उतनी ही पैनी होगी।' },
  'coachLow.noData': 'मैं अभी आपके बारे में ज़्यादा नहीं जानता, पर मज़ा यहीं है — हर सेट के साथ मेरी कोचिंग पैनी होती जाएगी। यहाँ से शुरू करते हैं।',
  'coachLow.sharpenWhy': 'शुरुआती संकेत कहता है कि पहले नुकसान भरने लायक यही आपका सबसे असरदार विषय है।',
  'coachLow.mixedWhy': 'एक छोटा, मिला-जुला सेट मुझे आपकी रफ़्तार, सटीकता और पहली कमज़ोरियाँ पढ़ने देता है।',
  'coachLow.buildTogether': 'हर प्रश्न मुझे यह सिखाता है कि आप कैसे सोचते हैं — आइए मिलकर तस्वीर बनाएँ।',
  'coachLow.chipStartSet': 'एक सेट शुरू करें',

  'coachFallback.accLine': 'आप {total} प्रश्नों में {pct}% सटीक हैं। ',
  'coachFallback.tighten': 'अब {label} कसें — अभी यही आपका सबसे बड़ा लीवर है।',
  'coachFallback.keepStreak': 'एक केंद्रित सेट से अपनी स्ट्रीक बनाए रखें।',
  'coachFallback.drillWhy': 'आपके सबसे कमज़ोर विषय पर लक्षित अभ्यास।',
  'coachFallback.chipStart': 'वह सेट शुरू करें',
  'coachFallback.chipNotToday': 'आज नहीं',

  'mission.revise': 'रिवीजन: {label}',
  'mission.today': 'आज: {label}',
  'mission.todayDrill': 'आज: {label} का अभ्यास',
  'mission.mock': 'मॉक: {label}',
  'mission.study': 'पढ़ाई: {label}',
  'mission.fix': '{label} सुधारें',
  'mission.sharpen': '{label} पैना करें',
  'mission.drill': '{label} का अभ्यास',
  'mission.practise': '{label} का अभ्यास करें',
  'mission.drillNow': 'अभी {label} का अभ्यास करें',
  'mission.quick5': 'पैना बनाए रखने के लिए झटपट 5',
  'mission.addToday': '{label} को आज के अभ्यास में जोड़ें',
  'mission.startMixed': 'एक मिला-जुला सेट शुरू करें',
  'mission.runMixed': 'एक मिला-जुला सेट करें',

  'nextTask.recoveryReason': 'हाल ही में यहाँ सटीकता फिसली — नए काम से पहले एक छोटा सुधार।',

  'metric.accuracy7d': 'सटीकता (7 दिन)',
  'metric.accuracyToday': 'आज की सटीकता',
  'metric.accuracy': 'सटीकता',
  'metric.speed': 'गति',
  'metric.speedToday': 'आज की गति',
  'metric.consistency': 'निरंतरता',
  'metric.consistencyValue': '{n}/14 दिन',
  'metric.today': 'आज',
  'metric.soFar': 'अब तक',
  'metric.accuracySoFar': 'अब तक की सटीकता',
  'metric.doneValue': '{pct}% ({n} हल)',

  'pattern.careless.title': 'लापरवाही की चूक',
  'pattern.careless.body': 'जिन विषयों में आप पहले ही महारत रखते हैं, उनमें प्रश्न चूक रहे हैं — जिन्हें जानते हैं उन पर थोड़ा धीमे चलें।',
  'pattern.speed.title': 'आपकी रफ़्तार घट रही है',
  'pattern.speed.body': 'आपकी गति {baseline}s/Q से बढ़कर {recent}s/Q हो गई — आइए स्पीड रेप्स करें।',
  'pattern.plateau.title': 'आप ठहराव पर हैं',
  'pattern.plateau.body': 'आपकी सटीकता एक महीने से एक जैसी है — अब कठिनाई बढ़ाकर आगे बढ़ने का समय है।',
  'pattern.inconsistent.title': 'अभ्यास अनियमित है',
  'pattern.inconsistent.body': 'केवल {active}/14 सक्रिय दिन — स्थिर स्ट्रीक से आप सबसे तेज़ी से सुधरते हैं।',
  'pattern.burnout.title': 'अपनी गति फिर से बनाएँ',
  'pattern.burnout.body': 'एक विराम और उस पर सटीकता में गिरावट — किसी ऐसे विषय से लौटें जिसे आप पहले से अच्छी तरह जानते हैं।',
  'pattern.warmup.title': 'आप अच्छी तरह वार्म-अप करते हैं',
  'pattern.warmup.body': 'आप एक सेशन के भीतर ~{pct}% तेज़ हो जाते हैं — लंबे सेट आपके लिए वाकई फ़ायदेमंद हैं।',

  'insights.patternsIntro': 'आपका डेटा असल में यह कह रहा है।',
  'insights.bigDiscovery': 'बड़ी खोज',
  'insights.worthKnowing': 'जानने लायक',
  'insights.biggestWeakness': 'आपकी सबसे बड़ी कमज़ोरी',
  'insights.weaknessDefault': '{label} कसें — यही आपका सबसे असरदार सुधार है।',
  'insights.adherenceLow': 'हाल में आपने अपने नियोजित काम का {pct}% ही किया — योजना तभी काम करती है जब आप उसे चलाएँ।',
  'insights.planVsData': 'योजना बनाम आपका डेटा',
  'insights.recoveryBody': 'आपकी योजना आगे बढ़ती है, पर {topics} पर हाल में सटीकता फिसली — पहले एक छोटा सुधार सेट करें।',
  'insights.readyEarly': 'इसी गति से आप {buffer} दिन पहले परीक्षा के लिए तैयार होंगे।',
  'insights.behind': 'आप {behind} दिन पीछे हैं{claw}',
  'insights.clawback': ' — रोज़ +15 मिनट {saved} वापस दिला देते हैं।',
  'insights.behindEnd': '।',
  'insights.plusMinutes': 'रोज़ +15 मिनट → {saved} दिन जल्दी पूरा।',
  'insights.forecast': 'पूर्वानुमान: सर्वोत्तम राह पर आप ~{projected}/100 तक पहुँचते हैं (लक्ष्य {target}) — {verdict}. विश्वास: {conf}.',
  'insights.forecastAchievable': 'हासिल करने योग्य',
  'insights.forecastShort': 'फ़िलहाल कम',
  'insights.opportunityCost': 'अवसर लागत',
  'insights.opportunityBody': '{topics} को टालने से लगभग +{marks} तैयारी अंक अनछुए रह जाते हैं। समय मिले तो {top} जोड़ना सबसे मूल्यवान है।',
  'insights.bottleneck': 'निर्भरता की अड़चन',
  'insights.bottleneckBody': '{label} कमज़ोर है पर {unlocks} खोलता है — इसे सुलझाने से कई आगे के विषय एक साथ ऊपर उठते हैं।',
  'insights.revisionDebt': 'रिवीजन का बकाया',
  'insights.revisionDebtBody': '{n} विषय अपनी रिवीजन तारीख़ पार कर चुके हैं — सीखने के तुरंत बाद याददाश्त सबसे तेज़ी से घटती है, इसलिए यह चुपचाप आपके कमाए अंक ले जा रहा है।',
  'insights.goingStale': 'धार कुंद हो रही है',
  'insights.goingStaleBody': 'आपने {days} दिन से {label} को नहीं छुआ — अभी 15 मिनट की झलक बाद में उसे दोबारा सीखने से बेहतर है।',
  'insights.fixWhy': '{pct}% सटीकता — सुधारने पर बड़ा असर।',
  'insights.sharpenWhy': 'आगे बढ़ाने लायक आपका सबसे असरदार विषय।',
  'insights.chipWhatFirst': 'पहले क्या?',
  'insights.chipOpenPlanner': 'मेरा प्लानर खोलें',
  'insights.chipPractice': '{label} का अभ्यास करें',

  'insightsLow.analysed': { one: 'आपके पहले {n} प्रश्न से शुरुआती आकलन: हर सेट के साथ तस्वीर साफ़ होती है — यहाँ जो मैं अभी देख सकता हूँ।', other: 'आपके पहले {n} प्रश्नों से शुरुआती आकलन: हर सेट के साथ तस्वीर साफ़ होती है — यहाँ जो मैं अभी देख सकता हूँ।' },
  'insightsLow.noData': 'मैंने आपको हल करते अभी नहीं देखा, तो यह ऐसे काम करता है: हर प्रश्न आपकी सटीकता, गति और विषय-पैटर्न को भरता है — और जैसे ही वे दिखें मैं उन्हें सामने लाऊँगा।',
  'insightsLow.firstPattern': 'पहला पैटर्न',
  'insightsLow.firstPatternBody': 'आपके शुरुआती आँकड़े {label} को पहले कसने लायक विषय बताते हैं।',
  'insightsLow.fixWhy': 'अब तक के डेटा पर आपका सबसे असरदार विषय।',
  'insightsLow.mixedWhy': 'आपके पहले असली पैटर्न सामने लाने के लिए एक छोटा, मिला-जुला सेट ही काफ़ी है।',

  'insightsFallback.stand': 'आप यहाँ खड़े हैं। आपका सबसे असरदार कदम है {label} कसना।',
  'insightsFallback.fixWhy': 'सटीकता के हिसाब से आपका सबसे कमज़ोर विषय।',

  'explain.couldntGenerate': 'मैं अभी पूरी व्याख्या नहीं बना सका।',
  'explain.correctAnswer': 'सही उत्तर {answer} है। दोबारा कोशिश के लिए रिट्राई दबाएँ।',
  'explain.stepByStep': 'चरण-दर-चरण हल',
  'explain.commonMistakes': 'आम गलतियाँ',
  'explain.slippedLead': 'आप यहाँ पहले फिसल चुके हैं — इन पर ध्यान दें:\n',
  'explain.fasterMethod': 'तेज़ तरीका',
  'explain.inExam': '{exam} में',
  'explain.yourAccuracy': 'आपकी {label} सटीकता',
  'explain.nextWeak': 'यह आपके फ़ोकस क्षेत्रों में से एक है — आइए इसे पलट दें।',
  'explain.nextBase': 'आइए यहाँ एक बुनियाद बनाएँ।',
  'explain.nextStrongSlip': 'आप यहाँ मज़बूत हैं — यह एक चूक लगती है, कमी नहीं।',
  'explain.nextStrong': 'यह विषय आपको बख़ूबी आता है।',
  'explain.nextDeveloping': 'आप इसे अच्छे से विकसित कर रहे हैं — गति बनाए रखें।',
  'explain.whyWeak': 'इसे ठीक करने का सबसे तेज़ रास्ता एक केंद्रित सेट है।',
  'explain.whyStrong': 'एक छोटा सेट उस विषय को पक्का कर देता है जिस पर आपकी पकड़ है।',
  'explain.whyDeveloping': 'थोड़े और अभ्यास इसे मज़बूती में बदल देते हैं।',
  'explain.chipGotIt': 'समझ गया ✓',
  'explain.chipSimpler': 'आसान',
  'explain.chipDeeper': 'और गहराई से',
  'explain.chipAnother': 'ऐसा ही एक और',
  'explain.chipDrillThis': 'इसका अभ्यास',
  'explain.chipRetry': 'रिट्राई',
  'explain.chipDrillTopic': 'इस विषय का अभ्यास',

  'examInsight.text': '{exam} में {label} {freq}-आवृत्ति का है और {diff}। प्रति प्रश्न लगभग {target} का लक्ष्य रखें।',
  'examInsight.freqHigh': 'उच्च',
  'examInsight.freqMedium': 'मध्यम',
  'examInsight.freqLow': 'कम',
  'examInsight.diffTough': 'एक कठिन क्षेत्र है',
  'examInsight.diffModerate': 'मध्यम है',
  'examInsight.diffFriendly': 'आसान विषयों में से एक है',

  'chat.ackYes': 'बढ़िया — यह गति बनाए रखें।',
  'chat.ackNo': 'ठीक है, अगली बार और विस्तार से समझाऊँगा।',
  'chat.drillLabel': '{label} का अभ्यास',
  'chat.couldntExpand': 'मैं अभी इस पर और नहीं बढ़ा सका — कुछ देर में फिर कोशिश करें।',
  'chat.couldntAnswer': 'मैं अभी इसका उत्तर नहीं दे सका — कुछ देर में फिर कोशिश करें।',
  'chat.chipAnother': 'एक और',

  'planner.narrateRationale': 'यह ब्लॉक {topics} पर केंद्रित है — अभी आपके सबसे असरदार विषय, ऐसे क्रम में कि हर अगला पिछले पर टिके।',
  'planner.narrateBehind': 'आप थोड़ा पीछे हैं — मैंने एक रिकवरी दिन जोड़ा है ताकि योजना परीक्षा से पहले पूरी हो जाए।',
  'planner.narrateOnTrack': 'निरंतर बने रहें, आप सही राह पर हैं। तैयारी {score}/100 और बढ़ रही है।',

  'planner.rationaleDefault': 'आपका अध्ययन प्लानर हर दो हफ़्ते में आपकी असली प्रगति से ढल जाता है।',
  'planner.restDay': 'विश्राम दिवस — रिकवरी भी योजना का हिस्सा है। कल फिर जुट जाएँ।',
  'planner.noTasks': 'आज कोई कार्य निर्धारित नहीं। आगे क्या है देखने के लिए कैलेंडर खोलें।',
  'planner.dteOnTrack': '{exam} में {days} दिन बाकी — सही राह पर, {buffer} दिन के बफ़र के साथ।',
  'planner.dteBehind': '{exam} में {days} दिन बाकी — {behind} दिन पीछे; मैंने आपकी योजना फिर से संतुलित कर दी।',
  'planner.dtePlain': '{exam} में {days} दिन बाकी।',
  'planner.yourExam': 'आपकी परीक्षा',
  'planner.chipStartDrill': 'आज का अभ्यास शुरू करें',
  'planner.chipOpenCalendar': 'कैलेंडर खोलें',
  'planner.chipAdjust': 'योजना समायोजित करें',

  'chip.helpful': '👍 मददगार',
  'chip.notReally': '👎 खास नहीं'
};

/* ══════════════════════════════════ मराठी (Marathi) ══════════════════════════════════
   Target-Publications register, तुम्ही-form. Digits 0-9, ₹/%/units and DNT glossary terms preserved. */
_M.mr = {
  'band.examReady': 'परीक्षेसाठी तयार',
  'band.onTrack': 'योग्य मार्गावर',
  'band.building': 'तयारी सुरू आहे',
  'band.early': 'सुरुवातीचा टप्पा',

  'label.examReadiness': 'परीक्षा सज्जता',
  'label.streak': 'स्ट्रीक',
  'label.daysToExam': '{exam}ला {days} दिवस',

  'coach.greeting': 'पुन्हा स्वागत आहे.',
  'coach.greetingNamed': 'पुन्हा स्वागत आहे, {name}.',
  'coach.yourCoach': 'तुमचे कोच',
  'coach.oneWorry': 'एक गोष्ट जिच्यावर माझं लक्ष आहे',
  'coach.thisWeeksPlan': 'या आठवड्याची योजना',
  'coach.onTrackKeep': 'योग्य मार्गावर — असंच सुरू ठेवा',
  'coach.closeGap': 'चला ही तफावत भरून काढू',
  'coach.dtePlain': '{exam}ला {days} दिवस बाकी.',
  'coach.dteOnTrack': '{exam}ला {days} दिवस बाकी — योग्य मार्गावर, {buffer} दिवसांचा बफर',
  'coach.dteBehind': '{exam}ला {days} दिवस बाकी — {behind} दिवस मागे, योजना पुन्हा संतुलित',
  'coach.missionWhyDefault': 'सध्या तुमचा सर्वाधिक परिणामकारक विषय.',
  'coach.fromStudyPlan': 'तुमच्या अभ्यास योजनेतून.',
  'coach.updatedFromPractice': 'तुमच्या ताज्या सरावातून अपडेट केलं.',
  'coach.chipStartSet': 'आजचा संच सुरू करा',
  'coach.chipSpeedAccuracy': 'वेग की अचूकता?',
  'coach.chipOpenPlanner': 'माझा प्लॅनर उघडा',
  'coach.chipSetGoal': 'परीक्षेचं ध्येय ठरवा',

  'coachLow.heyName': 'नमस्कार {name} 👋 ',
  'coachLow.heyThere': 'नमस्कार 👋 ',
  'coachLow.analysed': { one: 'मी तुमच्या पहिल्या {n} प्रश्नाचं विश्लेषण केलं — हे सुरुवातीचं आकलन आहे. तुम्ही जितका सराव कराल, तितकं माझं मार्गदर्शन अधिक धारदार होईल.', other: 'मी तुमच्या पहिल्या {n} प्रश्नांचं विश्लेषण केलं — हे सुरुवातीचं आकलन आहे. तुम्ही जितका सराव कराल, तितकं माझं मार्गदर्शन अधिक धारदार होईल.' },
  'coachLow.noData': 'मला अजून तुमच्याबद्दल फारसं माहीत नाही, पण गंमत तिथेच आहे — प्रत्येक संचाने माझं मार्गदर्शन अधिक धारदार होतं. इथून सुरुवात करू.',
  'coachLow.sharpenWhy': 'सुरुवातीचा संकेत सांगतो की आधी भरून काढण्यासाठी हाच तुमचा सर्वाधिक परिणामकारक विषय आहे.',
  'coachLow.mixedWhy': 'एक छोटा, संमिश्र संच मला तुमचा वेग, अचूकता आणि पहिल्या कमकुवत जागा वाचू देतो.',
  'coachLow.buildTogether': 'प्रत्येक प्रश्न मला शिकवतो की तुम्ही कसे विचार करता — चला मिळून चित्र उभं करू.',
  'coachLow.chipStartSet': 'एक संच सुरू करा',

  'coachFallback.accLine': 'तुम्ही {total} प्रश्नांत {pct}% अचूक आहात. ',
  'coachFallback.tighten': 'आता {label} पक्कं करा — सध्या हाच तुमचा सर्वात मोठा फायदा आहे.',
  'coachFallback.keepStreak': 'एका केंद्रित संचाने तुमची स्ट्रीक टिकवा.',
  'coachFallback.drillWhy': 'तुमच्या सर्वात कमकुवत विषयावर लक्ष्यित सराव.',
  'coachFallback.chipStart': 'तो संच सुरू करा',
  'coachFallback.chipNotToday': 'आज नको',

  'mission.revise': 'उजळणी: {label}',
  'mission.today': 'आज: {label}',
  'mission.todayDrill': 'आज: {label} सराव',
  'mission.mock': 'सराव परीक्षा: {label}',
  'mission.study': 'अभ्यास: {label}',
  'mission.fix': '{label} सुधारा',
  'mission.sharpen': '{label} धारदार करा',
  'mission.drill': '{label} सराव',
  'mission.practise': '{label} सराव करा',
  'mission.drillNow': 'आता {label} सराव करा',
  'mission.quick5': 'धार टिकवण्यासाठी झटपट 5',
  'mission.addToday': '{label} आजच्या सरावात जोडा',
  'mission.startMixed': 'एक संमिश्र संच सुरू करा',
  'mission.runMixed': 'एक संमिश्र संच करा',

  'nextTask.recoveryReason': 'नुकतीच इथे अचूकता घसरली — नव्या कामाआधी एक छोटी उजळणी.',

  'metric.accuracy7d': 'अचूकता (7 दिवस)',
  'metric.accuracyToday': 'आजची अचूकता',
  'metric.accuracy': 'अचूकता',
  'metric.speed': 'वेग',
  'metric.speedToday': 'आजचा वेग',
  'metric.consistency': 'सातत्य',
  'metric.consistencyValue': '{n}/14 दिवस',
  'metric.today': 'आज',
  'metric.soFar': 'आतापर्यंत',
  'metric.accuracySoFar': 'आतापर्यंतची अचूकता',
  'metric.doneValue': '{pct}% ({n} सोडवले)',

  'pattern.careless.title': 'निष्काळजी चुका',
  'pattern.careless.body': 'ज्या विषयांत तुम्ही आधीच प्रभुत्व मिळवलं आहे, त्यांत प्रश्न चुकत आहात — जे येतात त्यांवर थोडं सावकाश जा.',
  'pattern.speed.title': 'तुमचा वेग मंदावतो आहे',
  'pattern.speed.body': 'तुमचा वेग {baseline}s/Q वरून {recent}s/Q झाला — चला स्पीड रेप्स करू.',
  'pattern.plateau.title': 'तुम्ही एका जागी थांबला आहात',
  'pattern.plateau.body': 'तुमची अचूकता महिनाभर स्थिर आहे — आता कठीणता वाढवून पुढे जाण्याची वेळ.',
  'pattern.inconsistent.title': 'सराव अनियमित आहे',
  'pattern.inconsistent.body': 'फक्त {active}/14 सक्रिय दिवस — स्थिर स्ट्रीकने तुम्ही सर्वात वेगाने सुधारता.',
  'pattern.burnout.title': 'तुमची गती पुन्हा उभारा',
  'pattern.burnout.body': 'एक खंड आणि त्यावर अचूकतेत घट — तुम्हाला आधीच नीट येणाऱ्या विषयाने परत सुरुवात करा.',
  'pattern.warmup.title': 'तुम्ही छान वॉर्म-अप करता',
  'pattern.warmup.body': 'तुम्ही एका सत्रात ~{pct}% वेगवान होता — मोठे संच तुमच्यासाठी खरोखर फायद्याचे आहेत.',

  'insights.patternsIntro': 'तुमचा डेटा खरं तर हे सांगतो आहे.',
  'insights.bigDiscovery': 'मोठा शोध',
  'insights.worthKnowing': 'जाणून घेण्यासारखं',
  'insights.biggestWeakness': 'तुमची सर्वात मोठी कमकुवत जागा',
  'insights.weaknessDefault': '{label} पक्कं करा — हाच तुमचा सर्वाधिक परिणामकारक सुधार आहे.',
  'insights.adherenceLow': 'अलीकडे तुम्ही नियोजित कामाच्या {pct}% च केलं — योजना तुम्ही राबवली तरच उपयोगी.',
  'insights.planVsData': 'योजना विरुद्ध तुमचा डेटा',
  'insights.recoveryBody': 'तुमची योजना पुढे जाते, पण {topics} वर अलीकडे अचूकता घसरली — आधी एक छोटा उजळणी संच करा.',
  'insights.readyEarly': 'याच वेगाने तुम्ही {buffer} दिवस आधी परीक्षेसाठी तयार व्हाल.',
  'insights.behind': 'तुम्ही {behind} दिवस मागे आहात{claw}',
  'insights.clawback': ' — रोज +15 मिनिटं {saved} भरून काढतात.',
  'insights.behindEnd': '.',
  'insights.plusMinutes': 'रोज +15 मिनिटं → {saved} दिवस लवकर पूर्ण.',
  'insights.forecast': 'अंदाज: सर्वोत्तम मार्गावर तुम्ही ~{projected}/100 पर्यंत पोहोचता (ध्येय {target}) — {verdict}. विश्वास: {conf}.',
  'insights.forecastAchievable': 'साध्य',
  'insights.forecastShort': 'सध्या कमी',
  'insights.opportunityCost': 'संधी-खर्च',
  'insights.opportunityBody': '{topics} बाजूला ठेवल्याने सुमारे +{marks} सज्जता गुण न मिळवलेले राहतात. वेळ मिळाल्यास {top} जोडणं सर्वात मौल्यवान.',
  'insights.bottleneck': 'अवलंबित्वाची अडचण',
  'insights.bottleneckBody': '{label} कमकुवत आहे पण {unlocks} उघडतो — तो सोडवल्याने पुढचे अनेक विषय एकाच वेळी उंचावतात.',
  'insights.revisionDebt': 'उजळणीची थकबाकी',
  'insights.revisionDebtBody': '{n} विषय त्यांची उजळणी तारीख ओलांडून गेले — शिकल्यानंतर लगेच स्मरणशक्ती सर्वात वेगाने घटते, त्यामुळे हे गुपचूप तुमचे कमावलेले गुण नेत आहे.',
  'insights.goingStale': 'धार बोथट होते आहे',
  'insights.goingStaleBody': 'तुम्ही {days} दिवस {label} ला हात लावला नाही — आता 15 मिनिटांची उजळणी नंतर पुन्हा शिकण्यापेक्षा चांगली.',
  'insights.fixWhy': '{pct}% अचूकता — सुधारल्यास मोठा परिणाम.',
  'insights.sharpenWhy': 'पुढे रेटण्यासारखा तुमचा सर्वाधिक परिणामकारक विषय.',
  'insights.chipWhatFirst': 'आधी काय?',
  'insights.chipOpenPlanner': 'माझा प्लॅनर उघडा',
  'insights.chipPractice': '{label} सराव करा',

  'insightsLow.analysed': { one: 'तुमच्या पहिल्या {n} प्रश्नावरून सुरुवातीचं आकलन: प्रत्येक संचाने चित्र स्पष्ट होतं — इथे जे मला आत्ताच दिसतं.', other: 'तुमच्या पहिल्या {n} प्रश्नांवरून सुरुवातीचं आकलन: प्रत्येक संचाने चित्र स्पष्ट होतं — इथे जे मला आत्ताच दिसतं.' },
  'insightsLow.noData': 'मी तुम्हाला अजून सोडवताना पाहिलं नाही, म्हणून हे असं चालतं: प्रत्येक प्रश्न तुमची अचूकता, वेग आणि विषय-नमुने भरतो — आणि ते दिसताच मी ते समोर आणीन.',
  'insightsLow.firstPattern': 'पहिला नमुना',
  'insightsLow.firstPatternBody': 'तुमचे सुरुवातीचे आकडे {label} ला आधी पक्कं करण्यासारखा विषय सांगतात.',
  'insightsLow.fixWhy': 'आतापर्यंतच्या डेटावर तुमचा सर्वाधिक परिणामकारक विषय.',
  'insightsLow.mixedWhy': 'तुमचे पहिले खरे नमुने समोर आणण्यासाठी एक छोटा, संमिश्र संच पुरेसा आहे.',

  'insightsFallback.stand': 'तुम्ही इथे आहात. तुमची सर्वाधिक परिणामकारक हालचाल म्हणजे {label} पक्कं करणं.',
  'insightsFallback.fixWhy': 'अचूकतेनुसार तुमचा सर्वात कमकुवत विषय.',

  'explain.couldntGenerate': 'मी आत्ता पूर्ण स्पष्टीकरण तयार करू शकलो नाही.',
  'explain.correctAnswer': 'बरोबर उत्तर {answer} आहे. पुन्हा प्रयत्नासाठी रिट्राय दाबा.',
  'explain.stepByStep': 'टप्प्याटप्प्याने उकल',
  'explain.commonMistakes': 'सामान्य चुका',
  'explain.slippedLead': 'तुम्ही इथे आधी घसरला आहात — यांकडे लक्ष द्या:\n',
  'explain.fasterMethod': 'जलद पद्धत',
  'explain.inExam': '{exam} मध्ये',
  'explain.yourAccuracy': 'तुमची {label} अचूकता',
  'explain.nextWeak': 'हा तुमच्या फोकस क्षेत्रांपैकी एक आहे — चला हे पालटू.',
  'explain.nextBase': 'चला इथे एक पाया रचू.',
  'explain.nextStrongSlip': 'तुम्ही इथे भक्कम आहात — ही चूक वाटते, कमतरता नव्हे.',
  'explain.nextStrong': 'हा विषय तुम्हाला उत्तम येतो.',
  'explain.nextDeveloping': 'तुम्ही हे छान विकसित करत आहात — गती टिकवा.',
  'explain.whyWeak': 'हे सुधारण्याचा सर्वात जलद मार्ग म्हणजे एक केंद्रित संच.',
  'explain.whyStrong': 'एक छोटा संच तुमची पकड असलेला विषय पक्का करतो.',
  'explain.whyDeveloping': 'थोडा अधिक सराव हे बळकटीत बदलतो.',
  'explain.chipGotIt': 'समजलं ✓',
  'explain.chipSimpler': 'सोपं',
  'explain.chipDeeper': 'अधिक खोलात',
  'explain.chipAnother': 'असाच आणखी एक',
  'explain.chipDrillThis': 'याचा सराव',
  'explain.chipRetry': 'रिट्राय',
  'explain.chipDrillTopic': 'या विषयाचा सराव',

  'examInsight.text': '{exam} मध्ये {label} {freq}-वारंवारतेचा आहे आणि {diff}. प्रति प्रश्न सुमारे {target} चं ध्येय ठेवा.',
  'examInsight.freqHigh': 'उच्च',
  'examInsight.freqMedium': 'मध्यम',
  'examInsight.freqLow': 'कमी',
  'examInsight.diffTough': 'एक कठीण भाग आहे',
  'examInsight.diffModerate': 'मध्यम आहे',
  'examInsight.diffFriendly': 'सोप्या विषयांपैकी एक आहे',

  'chat.ackYes': 'छान — हीच गती टिकवा.',
  'chat.ackNo': 'ठीक आहे, पुढच्या वेळी अधिक सविस्तर सांगेन.',
  'chat.drillLabel': '{label} सराव',
  'chat.couldntExpand': 'मी आत्ता यावर अधिक सांगू शकलो नाही — थोड्या वेळाने पुन्हा प्रयत्न करा.',
  'chat.couldntAnswer': 'मी आत्ता याचं उत्तर देऊ शकलो नाही — थोड्या वेळाने पुन्हा प्रयत्न करा.',
  'chat.chipAnother': 'आणखी एक',

  'planner.narrateRationale': 'हा ब्लॉक {topics} वर केंद्रित आहे — सध्या तुमचे सर्वाधिक परिणामकारक विषय, अशा क्रमाने की प्रत्येक पुढचा मागच्यावर उभा राहतो.',
  'planner.narrateBehind': 'तुम्ही थोडे मागे आहात — मी एक रिकव्हरी दिवस जोडला आहे जेणेकरून योजना परीक्षेआधी पूर्ण होईल.',
  'planner.narrateOnTrack': 'सातत्य ठेवा, तुम्ही योग्य मार्गावर आहात. सज्जता {score}/100 आणि वाढते आहे.',

  'planner.rationaleDefault': 'तुमचा अभ्यास प्लॅनर दर दोन आठवड्यांनी तुमच्या खऱ्या प्रगतीनुसार जुळवून घेतो.',
  'planner.restDay': 'विश्रांती दिवस — रिकव्हरी हाही योजनेचा भाग आहे. उद्या पुन्हा जोमाने.',
  'planner.noTasks': 'आज कोणतंही काम नियोजित नाही. पुढे काय आहे पाहण्यासाठी कॅलेंडर उघडा.',
  'planner.dteOnTrack': '{exam}ला {days} दिवस बाकी — योग्य मार्गावर, {buffer} दिवसांच्या बफरसह.',
  'planner.dteBehind': '{exam}ला {days} दिवस बाकी — {behind} दिवस मागे; मी तुमची योजना पुन्हा संतुलित केली.',
  'planner.dtePlain': '{exam}ला {days} दिवस बाकी.',
  'planner.yourExam': 'तुमची परीक्षा',
  'planner.chipStartDrill': 'आजचा सराव सुरू करा',
  'planner.chipOpenCalendar': 'कॅलेंडर उघडा',
  'planner.chipAdjust': 'योजना समायोजित करा',

  'chip.helpful': '👍 उपयोगी',
  'chip.notReally': '👎 फारसं नाही'
};

/* ── interpolator (mirrors QRI18n: {token} + plural objects on params.count) ── */
var _pluralRules = {};
var _LOCALE = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
function _selectPlural(lang, value, count) {
  var cat = 'other';
  try {
    if (!_pluralRules[lang]) _pluralRules[lang] = new Intl.PluralRules(_LOCALE[lang] || 'en-IN');
    cat = _pluralRules[lang].select(count);
  } catch (_) { cat = count === 1 ? 'one' : 'other'; }
  if (value[cat] !== undefined) return value[cat];
  return value.other !== undefined ? value.other : value.one;
}
function _format(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, function (m, name) {
    return params[name] !== undefined ? String(params[name]) : m;
  });
}
function _valid(lang) { return (lang === 'hi' || lang === 'mr') ? lang : 'en'; }

/**
 * Resolve a deterministic QuanAI string. lang ∈ {en, hi, mr} (anything else → en). Missing hi/mr key
 * falls back to the en value, then to the key itself. Plural values ({one, other}) select on
 * params.count. {token} params interpolate; a missing param renders as the literal token (visible in QA).
 */
function s(lang, key, params) {
  lang = _valid(lang);
  var value = _M[lang][key];
  if (value === undefined && lang !== 'en') value = _M.en[key];
  if (value === undefined) return key;
  if (typeof value === 'object' && value !== null) {
    value = _selectPlural(lang, value, params && typeof params.count === 'number' ? params.count : 1);
  }
  return _format(value, params);
}

var AIStrings = { s: s, _MAP: _M };
if (typeof module !== 'undefined' && module.exports) module.exports = AIStrings;
if (typeof window !== 'undefined') window.AIStrings = AIStrings;
