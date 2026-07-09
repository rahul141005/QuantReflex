/**
 * mr.quant.js — generated-content pack (quant engine, Marathi) for QRGenI18n (ADR-111 Phase F-M4).
 *
 * First-class Maharashtra Marathi (Maharashtra State Board / MPSC / Target Publications / K'Sagar register,
 * तुम्ही-form) — authored fresh for MPSC / Talathi / ZP / Police Bharti / Forest / Revenue aspirants, NOT translated
 * from the Hindi pack. Keys + slot names mirror en.quant.js EXACTLY; only the framing prose is Marathi. Every digit/
 * operator/variable/formula is byte-identical to EN (enforced by gen-i18n.check §8 digit-multiset + invariance);
 * math notation (sin/cos/log/√/²/³/×/÷/−/₹/%/nPr) stays Latin/symbolic. Board abbreviations म.सा.वि./ल.सा.वि. Function-valued.
 *
 * `complete: true` is set only when all EN archetypes are covered (flips the coverage hard-gate).
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* Marathi ordinal for "Nth term" — numeral + वे ("5वे पद"), the standard board form. Preserves the digit. */
  function ordmr(n) { return n + 'वे'; }

  /* Index-aligned pools (Marathi) — same length + inner arity as en.quant.js (enforced by gen-i18n.check §7). */
  var RAT_PCT_POOL = [['25% जास्त', '5:4'], ['20% कमी', '4:5'], ['50% जास्त', '3:2'], ['20% जास्त', '6:5'], ['25% कमी', '3:4'], ['10% कमी', '9:10'], ['12.5% जास्त', '9:8'], ['16.66% कमी', '5:6'], ['37.5% जास्त', '11:8'], ['11.11% कमी', '8:9'], ['66.66% जास्त', '5:3'], ['150% जास्त', '5:2'], ['40% जास्त', '7:5'], ['75% जास्त', '7:4']];
  /* Height-and-distance structure nouns (index-aligned with EN TRIG_STRUCT); ध्वजस्तंभ = flagpole, दीपगृह = lighthouse. */
  var TRIG_STRUCT = ['मनोरा', 'खांब', 'इमारत', 'झाड', 'ध्वजस्तंभ', 'दीपगृह', 'चिमणी'];
  /* Trigonometric identities (index-aligned; arity 2). [0] = expression (byte-identical math); [1] = नित्यसमीकरण phrase. */
  var TRIG_IDENT = [['sin²θ + cos²θ', 'पायथागोरस नित्यसमीकरण sin²θ + cos²θ = 1'], ['sec²θ − tan²θ', 'sec²θ − tan²θ = 1 हे नित्यसमीकरण'], ['cosec²θ − cot²θ', 'cosec²θ − cot²θ = 1 हे नित्यसमीकरण']];
  /* Probability colour pools (index-aligned; चेंडू is masculine → masculine-plural colour forms निळे/हिरवे/काळे). */
  var PROB_COL = [['लाल', 'निळे'], ['हिरवे', 'पिवळे'], ['काळे', 'पांढरे'], ['लाल', 'हिरवे']];
  var PROB_COLC = [['लाल', 'निळे'], ['हिरवे', 'पिवळे'], ['काळे', 'पांढरे']];
  /* Set-theory context pairs (index-aligned) — बुद्धिबळ = chess, इंग्रजी = English (school subject). */
  var SET_CTX = [['चहा', 'कॉफी'], ['फुटबॉल', 'क्रिकेट'], ['गणित', 'विज्ञान'], ['हिंदी', 'इंग्रजी'], ['सफरचंद', 'संत्री'], ['बुद्धिबळ', 'कॅरम'], ['भौतिकशास्त्र', 'रसायनशास्त्र'], ['बॅडमिंटन', 'टेनिस'], ['इतिहास', 'भूगोल'], ['चित्रकला', 'संगीत'], ['गिटार', 'पियानो'], ['कुत्रे', 'मांजरी'], ['क्रिकेट', 'हॉकी'], ['पिझ्झा', 'बर्गर']];
  /* Mixture commodity pool (index-aligned; plain strings). Templates worded gender-invariantly (नमुने/प्रमाण/दर carry agreement). */
  var MIX_ITEMS = ['तांदूळ', 'गहू', 'साखर', 'चहा', 'कॉफी', 'डाळ', 'पीठ', 'मीठ'];
  /* Quantity-comparison relation pool (index 0=>, 1=<, 2==). Quantity → राशी; I/II Roman, >,<,= neutral. */
  var QC_REL = ['राशी I > राशी II', 'राशी I < राशी II', 'राशी I = राशी II'];
  function qcOmr(s) { return s.ord.map(function (i) { return QC_REL[i]; }); }
  function qcAnsmr(s) { return QC_REL[s.relIdx]; }

  var pack = { complete: true, pools: { RAT_PCT_POOL: RAT_PCT_POOL, TRIG_STRUCT: TRIG_STRUCT, TRIG_IDENT: TRIG_IDENT, PROB_COL: PROB_COL, PROB_COLC: PROB_COLC, SET_CTX: SET_CTX, MIX_ITEMS: MIX_ITEMS, QC_REL: QC_REL }, tpl: {
    /* ── वर्ग व वर्गमूळ ── */
    'squares:easy:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return s.n + ' चा वर्ग = ?'; }, function (s) { return s.n + ' चा वर्ग किती?'; }],
      e: [function (s) { return s.n + '² = ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n) + '.'; }]
    },
    'squares:medium:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return s.n + ' चा वर्ग = ?'; }],
      e: [function (s) { return s.id; }]
    },
    'squares:medium:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return s.sq + ' चे वर्गमूळ = ?'; }, function (s) { return 'जर x² = ' + s.sq + ', तर x = ?'; }],
      e: [function (s) { return 'x² = ' + s.sq + ' असणारे x शोधा. ' + s.n + '² = ' + s.sq + ' असल्याने, √' + s.sq + ' = ' + s.n + '.'; }]
    },
    'squares:hard:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return 'जर x² = ' + s.sq + ', तर x = ?'; }],
      e: [function (s) { return s.n + '² = ' + s.sq + ', म्हणून √' + s.sq + ' = ' + s.n + '. हे ' + s.b + '² = ' + s.bsq + ' च्या लगेच वर येते.'; }]
    },
    'squares:hard:diffSquares': {
      s: [function (s) { return s.a + '² − ' + s.b + '² = ?'; }],
      e: [function (s) { return 'a² − b² = (a+b)(a−b) = (' + s.sum + ')(' + s.diff + ') = ' + s.ans + '. दोन्ही वर्ग करण्याऐवजी अवयव पाडा — खूप जलद.'; }]
    },

    /* ── घन व घनमूळ ── */
    'cubes:easy:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return s.n + ' चा घन = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + ' × ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return s.n + ' चा घन = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + '² × ' + s.n + ' = ' + (s.n * s.n) + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return (s.n * s.n * s.n) + ' चे घनमूळ = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return s.n + '³ = ' + c + ', म्हणून ∛' + c + ' = ' + s.n + '. टीप: घनाचा एकक अंक ' + (c % 10) + ' मुळाचा एकक अंक निश्चित करतो.'; }]
    },
    'cubes:hard:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return (s.n * s.n * s.n) + ' चे घनमूळ = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return '∛' + c + ' = ' + s.n + '. एकक अंक ' + (c % 10) + ' → मूळ ' + (s.n % 10) + ' ने संपते; सुरुवातीचा भाग ते ' + s.n + ' जवळ ठेवतो.'; }]
    },
    'cubes:hard:cubeRoot5': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return (s.n * s.n * s.n) + ' चे घनमूळ काढा.'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return c + ' विभागा: शेवटचा अंक ' + (c % 10) + ' मुळाचा एकक अंक ' + (s.n % 10) + ' निश्चित करतो; हजारांचा भाग ' + Math.floor(c / 1000) + ' हा ' + Math.floor(s.n / 10) + '³ व ' + (Math.floor(s.n / 10) + 1) + '³ यांच्यामध्ये येतो, म्हणून दशक अंक ' + Math.floor(s.n / 10) + '. मूळ = ' + s.n + '.'; }]
    },
    'cubes:hard:diffCubes': {
      s: [function (s) { return s.a + '³ − ' + s.b + '³ = ?'; }],
      e: [function (s) { return s.a + '³ = ' + (s.a * s.a * s.a) + ' आणि ' + s.b + '³ = ' + (s.b * s.b * s.b) + ', म्हणून फरक = ' + (s.a * s.a * s.a - s.b * s.b * s.b) + '. (नित्यसमीकरण: a³ − b³ = (a − b)(a² + ab + b²).)'; }]
    },

    /* ── अपूर्णांक ── */
    'fractions:*:fracToPct': {
      s: [function (s) { return s.frac + ' टक्केवारीत = ? %'; }, function (s) { return s.frac + ' ला टक्केवारीत रूपांतरित करा.'; }, function (s) { return s.frac + ' = ? %'; }, function (s) { return s.frac + ' टक्केवारीत किती?'; }],
      e: [function (s) { return s.frac + ' = ' + s.pct + '% (भागा व ×100; नेहमीचे लक्षात ठेवल्यास सेकंद वाचतात).'; }]
    },
    'fractions:*:pctToFrac': {
      s: [function (s) { return s.pct + '% अपूर्णांकात = ?'; }, function (s) { return s.pct + '% अपूर्णांकात दाखवा.'; }, function (s) { return s.pct + '% = ? (लघुतम रूपात)'; }],
      e: [function (s) { return s.pct + '% = ' + s.pct + '/100 = ' + s.frac + ' (लघुतम रूपात).'; }]
    },
    'fractions:hard:fracOfFrac': {
      s: [function (s) { return s.N + ' च्या ' + s.a2 + '/' + s.b2 + ' च्या ' + s.a1 + '/' + s.b1 + ' = ?'; }, function (s) { return s.N + ' च्या ' + s.a2 + '/' + s.b2 + ' च्या ' + s.a1 + '/' + s.b1 + ' काढा.'; }],
      e: [function (s) { return '“चा” म्हणजे गुणाकार: ' + s.a1 + '/' + s.b1 + ' × ' + s.a2 + '/' + s.b2 + ' × ' + s.N + '. गुणण्यापूर्वी काटछाट करा: उत्तर ' + s.r + '.'; }]
    },
    'fractions:hard:addFrac': {
      s: [function (s) { return s.a1 + '/' + s.b1 + ' + ' + s.a2 + '/' + s.b2 + ' = ? (लघुतम रूपात)'; }, function (s) { return s.a1 + '/' + s.b1 + ' व ' + s.a2 + '/' + s.b2 + ' ची बेरीज करा. उत्तर लघुतम रूपात द्या.'; }],
      e: [function (s) { return 'सामाईक छेद ' + s.cd + ': ' + s.l + '/' + s.cd + ' + ' + s.r2 + '/' + s.cd + ' = ' + s.snum0 + '/' + s.cd + ' = ' + s.num + '/' + s.den + ' (' + s.g + ' ने लघुत्तम केल्यावर).'; }]
    },

    /* ── मानसिक गुणाकार ── */
    'multiplication:*:multiply': { s: [function (s) { return s.x + ' × ' + s.y + ' = ?'; }], e: [function (s) { return s.x + ' × ' + s.y + ' = ' + (s.x * s.y) + '. दुसरी संख्या विभागा: ' + s.x + ' × ' + s.tens + ' + ' + s.x + ' × ' + s.un + ' = ' + (s.x * s.tens) + ' + ' + (s.x * s.un) + '.'; }] },
    'multiplication:*:divide': { s: [function (s) { return s.p + ' ÷ ' + s.x + ' = ?'; }], e: [function (s) { return s.p + ' ÷ ' + s.x + ' = ' + s.y + ', कारण ' + s.x + ' × ' + s.y + ' = ' + s.p + '. भागाकार गुणाकाराला उलटवतो.'; }] },
    'multiplication:*:threeFactor': { s: [function (s) { return s.a + ' × ' + s.b + ' × ' + s.c + ' = ?'; }], e: [function (s) { return 'डावीकडून उजवीकडे: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', मग × ' + s.c + ' = ' + (s.a * s.b * s.c) + '. शक्य असल्यास गोल संख्या करण्यासाठी पुनर्गट करा.'; }] },
    'multiplication:medium:mentalSquare': { s: [function (s) { return s.n + ' × ' + s.n + ' = ?'; }], e: [function (s) { return s.n + '² = (' + s.r + (s.d < 0 ? '' : '+') + s.d + ')² = ' + (s.n * s.n) + ' — जलद मानसिक वर्ग.'; }] },

    /* ── सरलीकरण / BODMAS ── */
    'simplification:*:multiplyAdd': { s: [function (s) { return s.a + ' × ' + s.b + ' + ' + s.c + ' = ?'; }], e: [function (s) { return 'BODMAS — आधी गुणाकार: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', मग + ' + s.c + ' = ' + (s.a * s.b + s.c) + '.'; }] },
    'simplification:medium:divideAdd': { s: [function (s) { return s.num + ' ÷ ' + s.dv + ' + ' + s.add + ' = ?'; }], e: [function (s) { return 'आधी भागाकार: ' + s.num + ' ÷ ' + s.dv + ' = ' + (s.num / s.dv) + ', मग + ' + s.add + ' = ' + (s.num / s.dv + s.add) + '.'; }] },
    'simplification:hard:fullBodmas': { s: [function (s) { return '(' + s.p + ' × ' + s.q + ') ÷ ' + s.r + ' + ' + s.ss + ' × ' + s.t + ' = ?'; }], e: [function (s) { return 'कंस → (' + s.p + ' × ' + s.q + ') = ' + (s.p * s.q) + '; ÷ ' + s.r + ' = ' + ((s.p * s.q) / s.r) + '; आणि ' + s.ss + ' × ' + s.t + ' = ' + (s.ss * s.t) + '; बेरीज = ' + ((s.p * s.q) / s.r + s.ss * s.t) + '.'; }] },

    /* ── क्षेत्रफळ ── */
    'area:easy:square': {
      s: [function (s) { return s.s + ' cm बाजू असलेल्या चौरसाचे क्षेत्रफळ = ? cm².'; }, function (s) { return s.s + ' cm बाजू असलेली चौरस फरशी आहे. तिचे क्षेत्रफळ काढा (cm² मध्ये).'; }, function (s) { return 'चौरस शेताची प्रत्येक बाजू ' + s.s + ' m आहे. त्याचे क्षेत्रफळ = ? m².'; }],
      e: [function (s) { return 'चौरसाचे क्षेत्रफळ = बाजू² = ' + s.s + '² = ' + (s.s * s.s) + '.'; }]
    },
    'area:*:rectangle': {
      s: [function (s) { return s.l + ' cm लांब व ' + s.b + ' cm रुंद आयत आहे. त्याचे क्षेत्रफळ = ? cm².'; }, function (s) { return s.l + ' m बाय ' + s.b + ' m आयताकृती भूखंड आहे. त्याचे क्षेत्रफळ काढा (m² मध्ये).'; }, function (s) { return 'एक सभागृह ' + s.l + ' m लांब व ' + s.b + ' m रुंद आहे. त्याच्या जमिनीचे क्षेत्रफळ = ? m².'; }],
      e: [function (s) { return 'क्षेत्रफळ = लांबी × रुंदी = ' + s.l + ' × ' + s.b + ' = ' + (s.l * s.b) + '.'; }]
    },
    'area:*:triangle': {
      s: [function (s) { return s.base + ' cm पाया व ' + s.h + ' cm उंची असलेला त्रिकोण आहे. त्याचे क्षेत्रफळ = ? cm².'; }, function (s) { return 'ज्याचा पाया ' + s.base + ' cm व उंची ' + s.h + ' cm आहे अशा त्रिकोणाचे क्षेत्रफळ काढा (cm² मध्ये).'; }],
      e: [function (s) { return 'क्षेत्रफळ = ½ × पाया × उंची = ½ × ' + s.base + ' × ' + s.h + ' = ' + (s.base * s.h / 2) + ' cm². अपूर्णांक टाळण्यासाठी सम बाजू आधी अर्धी करा.'; }]
    },
    'area:medium:parallelogram': {
      s: [function (s) { return s.b + ' cm पाया व ' + s.h + ' cm उंची असलेला समांतरभुज चौकोन आहे. त्याचे क्षेत्रफळ = ? cm².'; }, function (s) { return s.b + ' cm पाया व ' + s.h + ' cm लंब-उंची असलेल्या समांतरभुज चौकोनाचे क्षेत्रफळ काढा (cm² मध्ये).'; }],
      e: [function (s) { return 'क्षेत्रफळ = पाया × उंची = ' + s.b + ' × ' + s.h + ' = ' + (s.b * s.h) + ' cm². तिरकी बाजू नव्हे, लंब-उंची वापरा.'; }]
    },
    'area:*:circle': {
      s: [function (s) { return s.r + ' cm त्रिज्या असलेल्या वर्तुळाचे क्षेत्रफळ = ? cm². (π = 3.14 घ्या)'; }, function (s) { return s.r + ' m त्रिज्या असलेली वर्तुळाकार बाग आहे. तिचे क्षेत्रफळ m² मध्ये काढा (π = 3.14 घ्या).'; }],
      e: [function (s) { return 'क्षेत्रफळ = πr² = 3.14 × ' + s.r + '² = 3.14 × ' + (s.r * s.r) + ' = ' + s.ans + '.'; }]
    },
    'area:hard:trapezium': {
      s: [function (s) { return s.a1 + ' cm व ' + s.b1 + ' cm समांतर बाजू आणि ' + s.h + ' cm उंची असलेला समलंब चौकोन आहे. त्याचे क्षेत्रफळ = ? cm².'; }, function (s) { return 'समलंब चौकोनाच्या समांतर बाजू ' + s.a1 + ' cm व ' + s.b1 + ' cm आहेत आणि त्यांच्यातील अंतर ' + s.h + ' cm आहे. त्याचे क्षेत्रफळ काढा (cm² मध्ये).'; }],
      e: [function (s) { return 'क्षेत्रफळ = ½ × (समांतर बाजूंची बेरीज) × उंची = ½ × ' + (s.a1 + s.b1) + ' × ' + s.h + ' = ' + ((s.a1 + s.b1) * s.h / 2) + ' cm².'; }]
    },
    'area:hard:border': {
      s: [function (s) { return s.L + ' cm × ' + s.B + ' cm पत्र्याला ' + s.w + ' cm रुंदीची एकसमान किनार आहे. किनारीचे क्षेत्रफळ = ? cm².'; }, function (s) { return s.L + ' cm बाय ' + s.B + ' cm फोटो फ्रेमच्या कडेला ' + s.w + ' cm रुंद एकसमान किनार आहे. किनारीचे क्षेत्रफळ काढा (cm² मध्ये).'; }],
      e: [function (s) { return 'किनार = बाह्य − आतील = ' + s.L + '×' + s.B + ' − ' + (s.L - 2 * s.w) + '×' + (s.B - 2 * s.w) + ' = ' + (s.L * s.B) + ' − ' + ((s.L - 2 * s.w) * (s.B - 2 * s.w)) + ' = ' + (s.L * s.B - (s.L - 2 * s.w) * (s.B - 2 * s.w)) + ' cm².'; }]
    },

    /* ── घनफळ ── */
    'volume:easy:cube': {
      s: [function (s) { return s.s + ' cm बाजू असलेल्या घनाचे घनफळ = ? cm³.'; }, function (s) { return s.s + ' cm कडा असलेली घनाकृती पेटी आहे. तिचे घनफळ काढा (cm³ मध्ये).'; }, function (s) { return 'घनाची प्रत्येक कडा ' + s.s + ' cm आहे. त्याचे घनफळ = ? cm³.'; }],
      e: [function (s) { return 'घनाचे घनफळ = बाजू³ = ' + s.s + '³ = ' + (s.s * s.s * s.s) + ' cm³.'; }]
    },
    'volume:*:cuboid': {
      s: [function (s) { return s.l + ' cm × ' + s.b + ' cm × ' + s.h + ' cm इष्टिकाचिती आहे. तिचे घनफळ = ? cm³.'; }, function (s) { return s.l + ' cm लांब, ' + s.b + ' cm रुंद व ' + s.h + ' cm उंच खोका आहे. त्याचे घनफळ काढा (cm³ मध्ये).'; }, function (s) { return 'पाण्याची टाकी ' + s.l + ' m बाय ' + s.b + ' m बाय ' + s.h + ' m आहे. तिची क्षमता = ? m³.'; }],
      e: [function (s) { return 'घनफळ = l × b × h = ' + s.l + ' × ' + s.b + ' × ' + s.h + ' = ' + (s.l * s.b * s.h) + '.'; }]
    },
    'volume:*:cylinder': {
      s: [function (s) { return s.r + ' cm त्रिज्या व ' + s.h + ' cm उंची असलेला दंडगोल आहे. त्याचे घनफळ = ? cm³. (π = 3.14 घ्या)'; }, function (s) { return s.r + ' cm पायाची त्रिज्या व ' + s.h + ' cm उंची असलेला दंडगोलाकार पिंप आहे. त्याचे घनफळ cm³ मध्ये काढा (π = 3.14 घ्या).'; }],
      e: [function (s) { return 'घनफळ = πr²h = 3.14 × ' + s.r + '² × ' + s.h + ' = 3.14 × ' + (s.r * s.r * s.h) + ' = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:sphere': {
      s: [function (s) { return s.r + ' cm त्रिज्या असलेला गोल आहे. त्याचे घनफळ = ? cm³. (π = 3.14 घ्या)'; }, function (s) { return s.r + ' cm त्रिज्या असलेल्या भरीव गोलाचे घनफळ काढा, π = 3.14 घेऊन (cm³ मध्ये).'; }],
      e: [function (s) { return 'घनफळ = (4/3)πr³ = (4/3) × 3.14 × ' + s.r + '³ = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:cone': {
      s: [function (s) { return s.r + ' cm त्रिज्या व ' + s.h + ' cm उंची असलेला शंकू आहे. त्याचे घनफळ = ? cm³. (π = 3.14 घ्या)'; }, function (s) { return s.r + ' cm पायाची त्रिज्या व ' + s.h + ' cm उंची असलेला आइस्क्रीम शंकू आहे. त्याचे घनफळ cm³ मध्ये काढा (π = 3.14).'; }],
      e: [function (s) { return 'घनफळ = (1/3)πr²h = (1/3) × 3.14 × ' + (s.r * s.r) + ' × ' + s.h + ' = ' + s.ans + ' cm³.'; }]
    },

    /* ── पृष्ठफळ ── */
    'surface-area:easy:cubeTSA': {
      s: [function (s) { return s.a + ' cm बाजू असलेल्या घनाचे एकूण पृष्ठफळ काढा (cm² मध्ये).'; }, function (s) { return s.a + ' cm कडा असलेली घनाकृती पेटी आहे. तिच्या सर्व पृष्ठभागांना रंग देण्यासाठी एकूण क्षेत्रफळ = ? cm²'; }],
      e: [function (s) { return 'घनाचे एकूण पृष्ठफळ = 6a² = 6 × ' + s.a + '² = 6 × ' + (s.a * s.a) + ' = ' + (6 * s.a * s.a) + ' cm².'; }]
    },
    'surface-area:medium:cubeLSA': {
      s: [function (s) { return s.a + ' cm बाजू असलेल्या घनाचे पार्श्व पृष्ठफळ काढा (cm² मध्ये).'; }],
      e: [function (s) { return 'घनाचे पार्श्व पृष्ठफळ = 4a² (चार बाजूचे पृष्ठभाग) = 4 × ' + (s.a * s.a) + ' = ' + (4 * s.a * s.a) + ' cm².'; }]
    },
    'surface-area:*:cuboidTSA': {
      s: [function (s) { return s.l + ' × ' + s.b + ' × ' + s.h + ' cm इष्टिकाचितीचे एकूण पृष्ठफळ काढा (cm² मध्ये).'; }],
      e: [function (s) { return 'एकूण पृष्ठफळ = 2(lb + bh + hl) = 2(' + (s.l * s.b) + ' + ' + (s.b * s.h) + ' + ' + (s.l * s.h) + ') = ' + (2 * (s.l * s.b + s.b * s.h + s.l * s.h)) + ' cm².'; }]
    },
    'surface-area:medium:cylCSA': {
      s: [function (s) { return s.r + ' cm त्रिज्या व ' + s.h + ' cm उंची असलेल्या दंडगोलाचे वक्र पृष्ठफळ काढा (π = 3.14 घ्या).'; }],
      e: [function (s) { return 'वक्र पृष्ठफळ = 2πrh = 2 × 3.14 × ' + s.r + ' × ' + s.h + ' = ' + s.ans + ' cm².'; }]
    },
    'surface-area:hard:cylTSA': {
      s: [function (s) { return s.r + ' cm त्रिज्या व ' + s.h + ' cm उंची असलेल्या दंडगोलाचे एकूण पृष्ठफळ काढा (π = 3.14 घ्या).'; }],
      e: [function (s) { return 'एकूण पृष्ठफळ = 2πr(r + h) = 2 × 3.14 × ' + s.r + ' × (' + s.r + ' + ' + s.h + ') = ' + s.ans + ' cm².'; }]
    },
    'surface-area:hard:sphereSA': {
      s: [function (s) { return s.r + ' cm त्रिज्या असलेल्या गोलाचे पृष्ठफळ काढा (π = 3.14 घ्या).'; }, function (s) { return s.r + ' cm त्रिज्या असलेला गोलाकार चेंडू आहे. π = 3.14 घेऊन त्याचे पृष्ठफळ = ? cm²'; }],
      e: [function (s) { return 'पृष्ठफळ = 4πr² = 4 × 3.14 × ' + s.r + '² = ' + s.ans + ' cm².'; }]
    },

    /* ── टक्केवारी ── */
    'percentages:*:directOf': {
      s: [function (s) { return s.b + ' चे ' + s.p + '% = ?'; }, function (s) { return s.b + ' चे ' + s.p + '% काढा.'; }, function (s) { return s.b + ' चे ' + s.p + '% म्हणजे कोणती संख्या?'; }],
      e: [function (s) { return s.b + ' चे ' + s.p + '% = ' + s.p + ' × ' + s.b + ' ÷ 100 = ' + s.r + '. टीप: ' + s.b + ' चे ' + s.p + '% = ' + s.p + ' चे ' + s.b + '% — एक बाजू गोल असेल तेव्हा अदलाबदल करा.'; }]
    },
    'percentages:medium:reverse': {
      s: [function (s) { return 'कोणत्या संख्येचे ' + s.p + '% = ' + s.r + '?'; }],
      e: [function (s) { return 'जर N चे ' + s.p + '% = ' + s.r + ', तर N = ' + s.r + ' × 100 ÷ ' + s.p + ' = ' + s.b + '.'; }]
    },
    'percentages:medium:whatPct': {
      s: [function (s) { return s.b + ' चे किती टक्के ' + s.y + ' आहे?'; }],
      e: [function (s) { return s.b + ' पैकी ' + s.y + ' = (' + s.y + ' ÷ ' + s.b + ') × 100 = ' + s.p + '%.'; }]
    },
    'percentages:hard:pctChange': {
      s: [function (s) { return 'एक मूल्य ' + s.old + ' वरून ' + s.nw + ' पर्यंत वाढते. टक्के वाढ = ? %'; }],
      e: [function (s) { return 'टक्के वाढ = (नवीन − जुने)/जुने × 100 = (' + s.nw + ' − ' + s.old + ')/' + s.old + ' × 100 = ' + ((s.nw - s.old) * 100 / s.old) + '%. नेहमी मूळ मूल्याने भागा.'; }]
    },
    'percentages:hard:successive': {
      s: [function (s) { return '₹' + s.base + ' च्या वस्तूवर ' + s.d1 + '% व ' + s.d2 + '% क्रमवार सूट दिली जाते. अंतिम किंमत = ₹?'; }],
      e: [function (s) { return 'क्रमाने लावा: ' + s.base + ' × ' + (1 - s.d1 / 100) + ' × ' + (1 - s.d2 / 100) + ' = ' + s.f + '. एकल तुल्य = ' + s.d1 + '+' + s.d2 + '−(' + s.d1 + '×' + s.d2 + ')/100 = ' + (s.d1 + s.d2 - s.d1 * s.d2 / 100) + '%.'; }]
    },
    'percentages:hard:netTrap': {
      s: [function (s) { return 'एक पगार ' + s.x + '% ने वाढवला जातो व नंतर ' + s.x + '% ने कमी केला जातो. एकूण तो ? % ने घटतो.'; }],
      e: [function (s) { return 'समान +' + s.x + '% मग −' + s.x + '% कधीच रद्द होत नाही — निव्वळ घट = x²/100 = ' + s.x + '²/100 = ' + (s.x * s.x / 100) + '%. ते चक्रवाढ होते, बेरीज होत नाही.'; }]
    },

    /* ── सरासरी ── */
    'averages:*:mean': {
      s: [function (s) { return s.nums.join(', ') + ' यांची सरासरी = ?'; }, function (s) { return s.nums.join(', ') + ' यांचा मध्य काढा.'; }, function (s) { return s.nums.join(', ') + ' यांची सरासरी किती?'; }],
      e: [function (s) { return 'सरासरी = बेरीज ÷ संख्या = ' + s.nums.reduce(function (x, y) { return x + y; }, 0) + ' ÷ ' + s.count + ' = ' + s.avg + '.'; }]
    },
    'averages:medium:missing': {
      s: [function (s) { return s.known.join(', ') + ' व x यांची सरासरी ' + s.avg + ' आहे. x = ?'; }],
      e: [function (s) { return 'आवश्यक बेरीज = सरासरी × संख्या = ' + s.avg + ' × ' + s.count + ' = ' + (s.avg * s.count) + '. x = ' + (s.avg * s.count) + ' − ' + s.sum + ' = ' + s.x + '.'; }]
    },
    'averages:hard:weighted': {
      s: [function (s) { return s.m + ' मुलांचे सरासरी वजन ' + s.a + ' kg व ' + s.n + ' मुलींचे सरासरी वजन ' + s.b + ' kg आहे. संपूर्ण गटाचे सरासरी वजन = ? kg'; }],
      e: [function (s) { return 'भारित मध्य = (दोन्ही गटांची बेरीज) ÷ (एकूण संख्या) = (' + s.m + '×' + s.a + ' + ' + s.n + '×' + s.b + ') ÷ (' + s.m + '+' + s.n + ') = ' + (s.m * s.a + s.n * s.b) + ' ÷ ' + (s.m + s.n) + ' = ' + s.ov + '.'; }]
    },
    'averages:hard:newMember': {
      s: [function (s) { return s.n + ' संख्यांची सरासरी ' + s.A + ' आहे. आणखी एक संख्या जोडल्यावर सरासरी ' + s.B + ' होते. नवीन संख्या = ?'; }],
      e: [function (s) { return 'नवीन संख्या = नवीन बेरीज − जुनी बेरीज = ' + s.B + '×' + (s.n + 1) + ' − ' + s.A + '×' + s.n + ' = ' + (s.B * (s.n + 1)) + ' − ' + (s.A * s.n) + ' = ' + s.x + '.'; }]
    },

    /* ── नफा-तोटा ── */
    'profit-loss:*:spProfit': {
      s: [function (s) { return 'खरेदी किंमत ₹' + s.cp + ' आहे व नफा ' + s.pr + '% आहे. विक्री किंमत = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 + नफा%) = ' + s.cp + ' × ' + (1 + s.pr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:*:spLoss': {
      s: [function (s) { return 'खरेदी किंमत ₹' + s.cp + ' आहे व तोटा ' + s.lr + '% आहे. विक्री किंमत = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 − तोटा%) = ' + s.cp + ' × ' + (1 - s.lr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:*:profitPct': {
      s: [function (s) { return '₹' + s.cp + ' ला खरेदी केलेली वस्तू ₹' + s.sp + ' ला विकली जाते. नफा टक्के = ?'; }],
      e: [function (s) { return 'नफा% = (SP − CP)/CP × 100 = (' + s.sp + ' − ' + s.cp + ')/' + s.cp + ' × 100 = ' + s.pr + '%. आधार नेहमी खरेदी किंमत असतो.'; }]
    },
    'profit-loss:hard:findCP': {
      s: [function (s) { return '₹' + s.sp + ' ला वस्तू विकून दुकानदाराला ' + s.pr + '% नफा होतो. खरेदी किंमत = ₹?'; }],
      e: [function (s) { return 'CP = SP ÷ (1 + नफा%) = ' + s.sp + ' ÷ ' + (1 + s.pr / 100) + ' = ₹' + s.cp + '.'; }]
    },
    'profit-loss:hard:successive': {
      s: [function (s) { return '₹' + s.cp + ' किमतीची वस्तू ' + s.p0 + '% नफ्याने विकली जाते, व ती किंमत नंतर आणखी ' + s.p1 + '% ने वाढवली जाते. अंतिम विक्री किंमत = ₹?'; }],
      e: [function (s) { return 'गुणक साखळीत जोडा: ' + s.cp + ' × ' + (1 + s.p0 / 100) + ' × ' + (1 + s.p1 / 100) + ' = ₹' + s.sp + '.'; }]
    },

    /* ── सरळव्याज ── */
    'simple-interest:*:si': {
      s: [function (s) { return '₹' + s.P + ' वर ' + s.R + '% वार्षिक दराने ' + s.T + ' वर्षांचे सरळव्याज काढा.'; }, function (s) { return s.nm.mr + ' एका योजनेत ₹' + s.P + ' ठेवतो जी ' + s.R + '% वार्षिक सरळव्याज देते. ' + s.T + ' वर्षांत मिळणारे व्याज = ₹?'; }, function (s) { return '₹' + s.P + ' ला ' + s.R + '% वार्षिक दराने ' + s.T + ' वर्षांत किती सरळव्याज मिळते?'; }],
      e: [function (s) { return 'SI = P × R × T ÷ 100 = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '.'; }]
    },
    'simple-interest:*:amount': {
      s: [function (s) { return '₹' + s.P + ' रक्कम ' + s.R + '% वार्षिक सरळव्याजाने दिली जाते. ' + s.T + ' वर्षांनंतर रास = ₹?'; }, function (s) { return s.nm.mr + ' ₹' + s.P + ' ' + s.R + '% वार्षिक सरळव्याजाने कर्ज घेतो. ' + s.T + ' वर्षांनंतर किती परतफेड करावी लागेल (₹ मध्ये)?'; }],
      e: [function (s) { return 'SI = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '; रास = P + SI = ' + s.P + ' + ' + s.si + ' = ₹' + (s.P + s.si) + '.'; }]
    },
    'simple-interest:*:findRate': {
      s: [function (s) { return '₹' + s.P + ' ला ' + s.T + ' वर्षांत ₹' + s.si + ' सरळव्याज मिळण्यासाठी वार्षिक दर किती टक्के असावा?'; }, function (s) { return '₹' + s.P + ' रकमेला ' + s.T + ' वर्षांत ₹' + s.si + ' सरळव्याज मिळते. वार्षिक दर = ? %'; }],
      e: [function (s) { return 'R = SI × 100 ÷ (P × T) = ' + s.si + ' × 100 ÷ (' + s.P + ' × ' + s.T + ') = ' + s.R + '%.'; }]
    },
    'simple-interest:hard:findPrincipal': {
      s: [function (s) { return 'एका रकमेला ' + s.R + '% वार्षिक दराने ' + s.T + ' वर्षांत ₹' + s.si + ' सरळव्याज मिळते. ती रक्कम काढा.'; }, function (s) { return '₹' + s.si + ' सरळव्याज ' + s.R + '% वार्षिक दराने ' + s.T + ' वर्षांत मिळण्यासाठी मुद्दल किती?'; }],
      e: [function (s) { return 'P = SI × 100 ÷ (R × T) = ' + s.si + ' × 100 ÷ (' + s.R + ' × ' + s.T + ') = ₹' + s.P + '.'; }]
    },

    /* ── चक्रवाढ व्याज ── */
    'compound-interest:*:amount': {
      s: [function (s) { return '₹' + s.P + ' वर ' + s.R + '% वार्षिक दराने वार्षिक चक्रवाढीने ' + s.T + ' वर्षांची रास काढा.'; }, function (s) { return s.nm.mr + ' ₹' + s.P + ' ' + s.R + '% वार्षिक दराने, वार्षिक चक्रवाढीने गुंतवतो. ' + s.T + ' वर्षांनंतर रास = ₹?'; }],
      e: [function (s) { return 'A = P(1 + R/100)ᵀ = ' + s.P + ' × ' + (1 + s.R / 100) + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '.'; }]
    },
    'compound-interest:*:ci': {
      s: [function (s) { return '₹' + s.P + ' वर ' + s.R + '% वार्षिक दराने ' + s.T + ' वर्षांचे, वार्षिक चक्रवाढीने चक्रवाढ व्याज काढा.'; }, function (s) { return '₹' + s.P + ' कर्ज ' + s.R + '% वार्षिक दराने, वार्षिक चक्रवाढीने घेतले जाते. ' + s.T + ' वर्षांनंतर देय चक्रवाढ व्याज = ₹?'; }],
      e: [function (s) { return 'A = ' + s.P + '(1 + ' + s.R + '/100)' + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '; CI = A − P = ' + s.A + ' − ' + s.P + ' = ₹' + (s.A - s.P) + '.'; }]
    },
    'compound-interest:hard:ciSiDiff': {
      s: [function (s) { return '₹' + s.P + ' वर ' + s.R + '% वार्षिक दराने 2 वर्षांच्या चक्रवाढ व्याज व सरळव्याजातील फरक = ₹?'; }],
      e: [function (s) { return '2 वर्षांसाठी, CI − SI = P(R/100)² = ' + s.P + ' × (' + s.R + '/100)² = ₹' + s.d + '.'; }]
    },

    /* ── काळ, वेग व अंतर ── */
    'time-speed-distance:*:distance': {
      s: [function (s) { return 'एक कार ' + s.sp + ' km/h वेगाने ' + s.t + ' तास प्रवास करते. कापलेले अंतर = ? km'; }, function (s) { return s.sp + ' km/h वेगाने ' + s.t + ' तास जाणारी रेल्वे ? km कापते'; }, function (s) { return 'सतत ' + s.sp + ' km/h वेगाने ' + s.t + ' तास, अंतर = ? km'; }],
      e: [function (s) { return 'अंतर = वेग × वेळ = ' + s.sp + ' × ' + s.t + ' = ' + (s.sp * s.t) + ' km.'; }]
    },
    'time-speed-distance:*:time': {
      s: [function (s) { return 'एक कार ' + s.d + ' km अंतर ' + s.sp + ' km/h वेगाने कापते. लागणारा वेळ = ? तास'; }, function (s) { return s.sp + ' km/h वेगाने ' + s.d + ' km कापण्यास लागणारा वेळ = ? तास'; }, function (s) { return s.d + ' km अंतर ' + s.sp + ' km/h वेगाने कापण्यास ? तास लागतात'; }],
      e: [function (s) { return 'वेळ = अंतर ÷ वेग = ' + s.d + ' ÷ ' + s.sp + ' = ' + s.t + ' तास.'; }]
    },
    'time-speed-distance:*:speed': {
      s: [function (s) { return 'एक रेल्वे ' + s.d + ' km अंतर ' + s.t + ' तासांत कापते. तिचा वेग = ? km/h'; }, function (s) { return s.t + ' तासांत ' + s.d + ' km कापताना वेग = ? km/h'; }, function (s) { return 'एक बस ' + s.d + ' km ' + s.t + ' तासांत धावते. सरासरी वेग = ? km/h'; }],
      e: [function (s) { return 'वेग = अंतर ÷ वेळ = ' + s.d + ' ÷ ' + s.t + ' = ' + s.sp + ' km/h.'; }]
    },
    'time-speed-distance:medium:unitConvert': {
      s: [function (s) { return s.x + ' km/h ला मीटर प्रति सेकंदात दाखवा.'; }, function (s) { return 'एक रेल्वे ' + s.x + ' km/h वेगाने जाते. तिचा वेग m/s मध्ये = ?'; }, function (s) { return s.x + ' m/s ला km/h मध्ये दाखवा.'; }, function (s) { return 'एक धावपटू ' + s.x + ' m/s वेगाने धावतो. तो वेग km/h मध्ये = ?'; }],
      e: [function (s) { return 'km/h → m/s: 5/18 ने गुणा. ' + s.x + ' × 5/18 = ' + s.ans + ' m/s.'; }, function (s) { return 'km/h → m/s: 5/18 ने गुणा. ' + s.x + ' × 5/18 = ' + s.ans + ' m/s.'; }, function (s) { return 'm/s → km/h: 18/5 ने गुणा. ' + s.x + ' × 18/5 = ' + s.ans + ' km/h.'; }, function (s) { return 'm/s → km/h: 18/5 ने गुणा. ' + s.x + ' × 18/5 = ' + s.ans + ' km/h.'; }]
    },
    'time-speed-distance:hard:avgSpeed': {
      s: [function (s) { return 'एक व्यक्ती समान अंतरे ' + s.s1 + ' km/h व ' + s.s2 + ' km/h वेगाने कापते. संपूर्ण प्रवासाचा सरासरी वेग = ? km/h'; }],
      e: [function (s) { return 'समान अंतरांसाठी, सरासरी वेग = 2·s₁·s₂/(s₁+s₂) = 2×' + s.s1 + '×' + s.s2 + '/(' + s.s1 + '+' + s.s2 + ') = ' + s.ans + ' km/h — हरात्मक मध्य, कधीही साधी सरासरी नव्हे.'; }]
    },
    'time-speed-distance:hard:relativeSpeed': {
      s: [function (s) { return 'दोन रेल्वे ' + s.d + ' km अंतरावरून एकमेकांकडे ' + s.s1 + ' km/h व ' + s.s2 + ' km/h वेगाने निघतात. किती तासांनी त्या भेटतात?'; }, function (s) { return s.d + ' km अंतरावरील दोन कार एकमेकांकडे ' + s.s1 + ' km/h व ' + s.s2 + ' km/h वेगाने जातात. त्या ? तासांनी भेटतात'; }],
      e: [function (s) { return 'एकमेकांकडे जाताना वेग बेरीज होतात: सन्निकट वेग = ' + s.s1 + ' + ' + s.s2 + ' = ' + (s.s1 + s.s2) + ' km/h. वेळ = ' + s.d + ' ÷ ' + (s.s1 + s.s2) + ' = ' + s.t + ' तास.'; }]
    },
    'time-speed-distance:hard:trainCrossing': {
      s: [function (s) { return 'एक ' + s.len + ' m लांब रेल्वे ' + s.spd + ' km/h वेगाने धावत आहे. एक खांब ओलांडण्यास किती सेकंद लागतात?'; }, function (s) { return s.len2 + ' m लांब रेल्वे, ' + s.spd + ' km/h वेगाने धावत, ' + s.plat + ' m लांब फलाट ? सेकंदांत ओलांडते'; }],
      e: [function (s) { return 'वेग रूपांतरित करा: ' + s.spd + ' km/h = ' + s.ms + ' m/s. खांब ओलांडणे म्हणजे स्वतःची लांबी कापणे: ' + s.len + ' ÷ ' + s.ms + ' = ' + s.t + ' s.'; }, function (s) { return 'वेग = ' + s.spd + ' km/h = ' + s.ms + ' m/s. फलाट ओलांडण्यास रेल्वे रेल्वे + फलाट = ' + s.len2 + ' + ' + s.plat + ' = ' + (s.len2 + s.plat) + ' m कापते. वेळ = ' + (s.len2 + s.plat) + ' ÷ ' + s.ms + ' = ' + s.t + ' s.'; }]
    },

    /* ── काम व वेळ ── */
    'time-and-work:*:together': {
      s: [function (s) { return 'A एक काम ' + s.a + ' दिवसांत व B ' + s.b + ' दिवसांत करू शकतो. एकत्र काम करून ते ? दिवसांत पूर्ण करतात'; }],
      e: [function (s) { return 'एकत्र वेळ = (a × b)/(a + b) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + (s.a * s.b) + '/' + (s.a + s.b) + ' = ' + ((s.a * s.b) / (s.a + s.b)) + ' दिवस. दर जोडा (1/a + 1/b), दिवस कधीही नाही.'; }]
    },
    'time-and-work:*:workDone': {
      s: [function (s) { return 'A एक काम ' + s.days + ' दिवसांत पूर्ण करू शकतो. ' + s.wd + ' दिवसांत तो कामाचे ? % पूर्ण करतो.'; }],
      e: [function (s) { return 'झालेला भाग = ' + s.wd + '/' + s.days + ', म्हणून ' + s.wd + '/' + s.days + ' × 100 = ' + (s.wd * 100 / s.days) + '%.'; }]
    },
    'time-and-work:*:workersScale': {
      s: [function (s) { return 'जर ' + s.w1 + ' कामगार एक काम ' + s.dp + ' दिवसांत पूर्ण करतात, तर ' + s.w2 + ' कामगार तेच काम ? दिवसांत पूर्ण करतात'; }],
      e: [function (s) { return 'एकूण काम = ' + s.w1 + ' × ' + s.dp + ' = ' + s.tot + ' कामगार-दिवस. ' + s.w2 + ' कामगारांसाठी वेळ = ' + s.tot + ' ÷ ' + s.w2 + ' = ' + (s.tot / s.w2) + ' दिवस (कामगार व दिवस व्यस्त प्रमाणात असतात).'; }]
    },
    'time-and-work:hard:inverseTogether': {
      s: [function (s) { return s.nm[0].mr + ' व ' + s.nm[1].mr + ' एकत्र एक काम ' + s.T + ' दिवसांत पूर्ण करू शकतात. ' + s.nm[0].mr + ' एकटा ते ' + s.a + ' दिवसांत करू शकतो. ' + s.nm[1].mr + ' एकटा ते किती दिवसांत पूर्ण करेल?'; }],
      e: [function (s) { return 'दरांसह काम करा: 1/' + s.nm[1].mr + ' = 1/' + s.T + ' − 1/' + s.a + ' = (' + s.a + ' − ' + s.T + ')/(' + s.a + '×' + s.T + ') = ' + (s.a - s.T) + '/' + (s.a * s.T) + '. म्हणून ' + s.nm[1].mr + ' एकटा = ' + (s.a * s.T) + '/' + (s.a - s.T) + ' = ' + s.b + ' दिवस.'; }]
    },

    /* ── संख्या श्रेढी ── */
    'number-series:*:arithmetic': {
      s: [function (s) { return 'पुढील संख्या शोधा: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'सामाईक फरक ' + s.step + ' (अंकगणिती श्रेढी): ' + s.terms[s.terms.length - 1] + ' + ' + s.step + ' = ' + s.ans + '.'; }]
    },
    'number-series:*:geometric': {
      s: [function (s) { return 'पुढील संख्या शोधा: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'प्रत्येक पद × ' + s.r + ' (भौमितिक श्रेढी): ' + s.terms[s.terms.length - 1] + ' × ' + s.r + ' = ' + s.ans + '.'; }]
    },
    'number-series:*:growingGap': {
      s: [function (s) { return 'पुढील संख्या शोधा: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'प्रत्येक पावलाला फरक ' + s.base + ' ने वाढतो (सतत द्वितीय फरक): पुढील फरक ' + s.gap + ', म्हणून ' + s.terms[s.terms.length - 1] + ' + ' + s.gap + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:squaresSeries': {
      s: [function (s) { return 'पुढील संख्या शोधा: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'प्रत्येक पद एक पूर्ण वर्ग ' + (s.k >= 0 ? 'अधिक ' + s.k : 'वजा ' + Math.abs(s.k)) + ': ' + s.terms.map(function (v, i) { return (s.s + i) + '²' + (s.k >= 0 ? '+' + s.k : '−' + Math.abs(s.k)); }).join(', ') + '. पुढील = ' + (s.s + 4) + '²' + (s.k >= 0 ? '+' + s.k : '−' + Math.abs(s.k)) + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:alternating': {
      s: [function (s) { return 'पुढील संख्या शोधा: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'दोन श्रेढी एकात एक गुंफल्या आहेत: विषम स्थानांवर ' + s.a0 + ', ' + (s.a0 + s.d1) + ', ' + (s.a0 + 2 * s.d1) + ', … (+' + s.d1 + ') आणि सम स्थाने स्वतःची साखळी बनवतात. पुढील पद पहिली साखळी पुढे नेते: ' + (s.a0 + 2 * s.d1) + ' + ' + s.d1 + ' = ' + s.ans + '.'; }]
    },

    /* ── नळ व टाकी ── */
    'pipes-cisterns:*:together': {
      s: [function (s) { return 'नळ A एक टाकी ' + s.a + ' तासांत भरतो व नळ B ती ' + s.b + ' तासांत भरतो. दोन्ही एकत्र उघडल्यास, टाकी ? तासांत भरते'; }],
      e: [function (s) { return 'एकत्रित वेळ = (A × B)/(A + B) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + ((s.a * s.b) / (s.a + s.b)) + ' तास — दर जोडा 1/' + s.a + ' + 1/' + s.b + '.'; }]
    },
    'pipes-cisterns:*:netFill': {
      s: [function (s) { return 'एक आवक नळ टाकी ' + s.a + ' तासांत भरतो तर एक जावक नळ ती ' + s.b + ' तासांत रिकामी करतो. दोन्ही एकत्र उघडल्यास, टाकी ? तासांत भरते'; }],
      e: [function (s) { return 'निव्वळ दर = 1/' + s.a + ' − 1/' + s.b + '; वेळ = (A × B)/(B − A) = (' + s.a + ' × ' + s.b + ')/(' + s.b + ' − ' + s.a + ') = ' + ((s.a * s.b) / (s.b - s.a)) + ' तास.'; }]
    },
    'pipes-cisterns:hard:inverseFill': {
      s: [function (s) { return 'दोन नळ एकत्र टाकी ' + s.tog + ' तासांत भरतात. जर पहिला नळ एकटा ती ' + s.a + ' तासांत भरतो, तर दुसरा नळ एकटा ती ? तासांत भरतो'; }],
      e: [function (s) { return 'दर वजा होतात: 1/दुसरा = 1/' + s.tog + ' − 1/' + s.a + ' = ' + (s.a - s.tog) + '/' + (s.a * s.tog) + ', म्हणून दुसरा नळ एकटा ' + s.b + ' तास घेतो.'; }]
    },
    'pipes-cisterns:hard:leakEmpty': {
      s: [function (s) { return 'नळ A व B अनुक्रमे टाकी ' + s.a + ' व ' + s.b + ' तासांत भरतात, तर नळ C ती ' + s.c + ' तासांत रिकामी करतो. तिन्ही उघडे असताना, टाकी ? तासांत भरते'; }],
      e: [function (s) { return 'निव्वळ दर = 1/' + s.a + ' + 1/' + s.b + ' − 1/' + s.c + '. ल.सा.वि.-आकाराच्या टाकीत ते ' + s.num + ' एककांसाठी ' + s.den + ' एकके/तास आहे, म्हणून वेळ = ' + (s.num / s.den) + ' तास.'; }]
    },

    /* ── वयवारी ── */
    'ages:*:ratioSum': {
      s: [function (s) { return s.nm[0].mr + ' व ' + s.nm[1].mr + ' यांची सध्याची वये ' + s.p0 + ' : ' + s.p1 + ' या गुणोत्तरात आहेत. जर त्यांच्या वयांची बेरीज ' + s.S + ' वर्षे असेल, तर ' + s.nm[0].mr + ' चे सध्याचे वय = ? वर्षे'; }],
      e: [function (s) { return 'वये ' + s.p0 + 'x व ' + s.p1 + 'x माना. मग (' + s.p0 + ' + ' + s.p1 + ')x = ' + s.S + ' → x = ' + s.k + '. ' + s.nm[0].mr + ' = ' + s.p0 + 'x = ' + (s.p0 * s.k) + ' वर्षे.'; }]
    },
    'ages:easy:presentAge': {
      s: [function (s) { return s.t + ' वर्षांपूर्वी, ' + s.nm.mr + ' ' + s.a + ' वर्षांचा होता. ' + s.nm.mr + ' चे सध्याचे वय = ? वर्षे'; }],
      e: [function (s) { return 'सध्याचे वय = तेव्हाचे वय + गेलेली वर्षे = ' + s.a + ' + ' + s.t + ' = ' + (s.a + s.t) + ' वर्षे. (काळात पुढे गेल्यास बेरीज; “पूर्वी” म्हणजे परत जोडणे.)'; }]
    },
    'ages:*:ageDiff': {
      s: [function (s) { return s.nm[0].mr + ' हा ' + s.nm[1].mr + ' पेक्षा ' + s.x + ' वर्षांनी मोठा आहे. ' + s.t + ' वर्षांनी, ' + s.nm[0].mr + ' हा ' + s.nm[1].mr + ' च्या ' + s.mult + ' पट वयाचा होईल. ' + s.nm[1].mr + ' चे सध्याचे वय = ? वर्षे'; }],
      e: [function (s) { return s.nm[0].mr + ' = ' + s.nm[1].mr + ' + ' + s.x + '. ' + s.t + ' वर्षांनी: (' + s.nm[1].mr + ' + ' + s.x + ' + ' + s.t + ') = ' + s.mult + '(' + s.nm[1].mr + ' + ' + s.t + ') → ' + s.nm[1].mr + ' = ' + s.B + ' वर्षे.'; }]
    },
    'ages:hard:fatherSon': {
      s: [function (s) { return 'एक वडील सध्या मुलाच्या ' + s.n + ' पट वयाचे आहेत. ' + s.t + ' वर्षांनी ते मुलाच्या ' + s.m + ' पट वयाचे होतील. मुलाचे सध्याचे वय = ? वर्षे'; }],
      e: [function (s) { return 'मुलगा = s, वडील = ' + s.n + 's माना. ' + s.t + ' वर्षांनी: ' + s.n + 's + ' + s.t + ' = ' + s.m + '(s + ' + s.t + ') → s = ' + s.t + '(' + s.m + '−1)/(' + s.n + '−' + s.m + ') = ' + s.sn + ' वर्षे.'; }]
    },

    /* ── भागीदारी ── */
    'partnership:easy:shareRatio': {
      s: [function (s) { return s.nm[0].mr + ' व ' + s.nm[1].mr + ' एका व्यवसायात अनुक्रमे ₹' + s.x + ' व ₹' + s.y + ' गुंतवतात. वार्षिक नफा त्यांच्यात कोणत्या गुणोत्तरात वाटावा?'; }],
      e: [function (s) { return 'नफा नेहमी गुंतवलेल्या भांडवलांच्या गुणोत्तरात वाटला जातो. ' + s.x + ' : ' + s.y + ', दोन्ही त्यांच्या म.सा.वि. ' + s.g + ' ने भागल्यास, ' + (s.x / s.g) + ' : ' + (s.y / s.g) + ' मिळते.'; }]
    },
    'partnership:*:share2': {
      s: [function (s) { return s.nm[0].mr + ' व ' + s.nm[1].mr + ' अनुक्रमे ₹' + s.x + ' व ₹' + s.y + ' गुंतवून व्यवसाय सुरू करतात. ₹' + s.profit + ' एकूण नफ्यातून, ' + s.nm[0].mr + ' चा वाटा = ₹?'; }],
      e: [function (s) { return 'नफा गुंतवणुकीच्या गुणोत्तरात ' + s.x + ' : ' + s.y + ' वाटला जातो. ' + s.nm[0].mr + ' चा वाटा = ' + s.x + '/(' + s.x + '+' + s.y + ') × ' + s.profit + ' = ₹' + s.share + '.'; }]
    },
    'partnership:*:shareTime': {
      s: [function (s) { return s.nm[0].mr + ' ₹' + s.x + ' ' + s.m + ' महिन्यांसाठी गुंतवतो व ' + s.nm[1].mr + ' ₹' + s.y + ' ' + s.n + ' महिन्यांसाठी गुंतवतो. ₹' + s.profit + ' नफ्यातून, ' + s.nm[0].mr + ' चा वाटा = ₹?'; }],
      e: [function (s) { return 'प्रत्येक भागीदाराला भांडवल × काळ ने भारित करा: ' + s.nm[0].mr + ' = ' + s.x + '×' + s.m + ' = ' + s.cx + ', ' + s.nm[1].mr + ' = ' + s.y + '×' + s.n + ' = ' + s.cy + '. ' + s.nm[0].mr + ' चा वाटा = ' + s.cx + '/(' + s.cx + '+' + s.cy + ') × ' + s.profit + ' = ₹' + s.share + '.'; }]
    },

    /* ── गुणोत्तर व प्रमाण ── */
    'ratios:*:divide': {
      s: [function (s) { return '₹' + s.total + ' ही रक्कम ' + s.nm[0].mr + ' व ' + s.nm[1].mr + ' मध्ये ' + s.p0 + ' : ' + s.p1 + ' गुणोत्तरात वाटली जाते. ' + s.nm[0].mr + ' ला ₹?'; }],
      e: [function (s) { return 'एकूण भाग = ' + s.p0 + ' + ' + s.p1 + ' = ' + s.parts + '. एक भाग = ' + s.total + ' ÷ ' + s.parts + ' = ' + (s.total / s.parts) + '. ' + s.nm[0].mr + ' = ' + s.p0 + ' × ' + (s.total / s.parts) + ' = ' + (s.total * s.p0 / s.parts) + '.'; }]
    },
    'ratios:*:findTerm': {
      s: [function (s) { return 'A : B = ' + s.p0 + ' : ' + s.p1 + ' आणि A = ' + s.aVal + '. B = ?'; }],
      e: [function (s) { return 'एक भाग = A ÷ ' + s.p0 + ' = ' + s.aVal + ' ÷ ' + s.p0 + ' = ' + s.one + '. B = ' + s.p1 + ' × ' + s.one + ' = ' + s.bVal + '.'; }]
    },
    'ratios:hard:combine': {
      s: [function (s) { return 'A : B = ' + s.ab0 + ' : ' + s.ab1 + ' आणि B : C = ' + s.bc0 + ' : ' + s.bc1 + '. A : C = ?'; }],
      e: [function (s) { return 'B समान आहे (' + s.ab1 + '=' + s.bc0 + '), म्हणून A : C = ' + s.ab0 + ' : ' + s.bc1 + ' = ' + (s.ab0 / s.g) + ' : ' + (s.bc1 / s.g) + ' (' + s.g + ' ने भागल्यावर).'; }]
    },
    'ratios:*:pctRatio': {
      s: [function (s) { return 'A हा B पेक्षा ' + RAT_PCT_POOL[s.idx][0] + ' आहे. A : B = ?'; }],
      e: [function (s) { return 'A ला B चा अपूर्णांक म्हणून लिहा: “' + RAT_PCT_POOL[s.idx][0] + '” → A/B = ' + s.ratio.replace(':', '/') + ', म्हणून A : B = ' + s.ratio + ' (लघुतम रूपात).'; }]
    },

    /* ── संख्या गुणधर्म ── (म.सा.वि./ल.सा.वि. board abbreviations; "mod" rephrased to उरलेली बाकी) */
    'number-properties:*:hcf': {
      s: [function (s) { return s.a + ' व ' + s.b + ' यांचा म.सा.वि. (महत्तम साधारण विभाजक) काढा.'; }],
      e: [function (s) { return 'म.सा.वि.(' + s.a + ', ' + s.b + ') = ' + s.g + ' — दोन्हींना भागणारी सर्वात मोठी संख्या (युक्लिड पद्धत किंवा सामाईक अवयव).'; }]
    },
    'number-properties:*:lcm': {
      s: [function (s) { return s.a + ' व ' + s.b + ' यांचा ल.सा.वि. (लघुत्तम साधारण विभाज्य) काढा.'; }],
      e: [function (s) { return 'ल.सा.वि. = (a × b) ÷ म.सा.वि. = (' + s.a + ' × ' + s.b + ') ÷ ' + s.g + ' = ' + s.l + '.'; }]
    },
    'number-properties:*:unitDigit': {
      s: [function (s) { return s.base + '^' + s.e + ' चा एकक (शेवटचा) अंक कोणता?'; }],
      e: [function (s) { return s.base + ' च्या घातांचा एकक अंक [' + s.cyc.join(', ') + '] असा पुनरावृत्त होतो (चक्र लांबी ' + s.cyc.length + '). ' + s.e + ' ला ' + s.cyc.length + ' ने भागल्यावर उरलेली बाकी ' + s.ud + ' अंक देते.'; }]
    },
    'number-properties:hard:numFactors': {
      s: [function (s) { return s.N + ' ला किती अवयव (विभाजक) आहेत?'; }],
      e: [function (s) { return s.N + ' = ' + s.parts.join(' × ') + '. अवयवांची संख्या = (प्रत्येक घातांक + 1) चा गुणाकार = ' + s.ex.map(function (e) { return '(' + e + '+1)'; }).join(' × ') + ' = ' + s.nf + '.'; }]
    },

    /* ── रेषीय समीकरणे ── */
    'linear-equations:*:solveOne': {
      s: [function (s) { return s.a + 'x + ' + s.b + ' = ' + s.c + '.  x काढा.'; }, function (s) { return 'x साठी सोडवा:  ' + s.a + 'x + ' + s.b + ' = ' + s.c; }, function (s) { return 'जर ' + s.a + 'x + ' + s.b + ' = ' + s.c + ', तर x = ?'; }],
      e: [function (s) { return 'स्थिरांक दुसरीकडे न्या: ' + s.a + 'x = ' + s.c + ' − ' + s.b + ' = ' + (s.c - s.b) + '. मग x = ' + (s.c - s.b) + ' ÷ ' + s.a + ' = ' + s.x + '.'; }]
    },
    'linear-equations:easy:solveOneSub': {
      s: [function (s) { return s.a + 'x − ' + s.b + ' = ' + s.c + '.  x काढा.'; }, function (s) { return 'x साठी सोडवा:  ' + s.a + 'x − ' + s.b + ' = ' + s.c; }],
      e: [function (s) { return s.a + 'x = ' + s.c + ' + ' + s.b + ' = ' + (s.c + s.b) + ', म्हणून x = ' + (s.c + s.b) + ' ÷ ' + s.a + ' = ' + s.x + '.'; }]
    },
    'linear-equations:*:bracket': {
      s: [function (s) { return s.a + '(x + ' + s.b + ') = ' + s.c + '.  x काढा.'; }, function (s) { return 'सोडवा:  ' + s.a + '(x + ' + s.b + ') = ' + s.c; }],
      e: [function (s) { return 'आधी दोन्ही बाजू ' + s.a + ' ने भागा: x + ' + s.b + ' = ' + (s.c / s.a) + '. म्हणून x = ' + (s.c / s.a) + ' − ' + s.b + ' = ' + s.x + '.'; }]
    },
    'linear-equations:*:sumDiff': {
      s: [function (s) { return 'जर x + y = ' + s.S + ' व x − y = ' + s.D + ', तर x काढा.'; }],
      e: [function (s) { return 'समीकरणे जोडा: 2x = ' + s.S + ' + ' + s.D + ' = ' + (s.S + s.D) + ', म्हणून x = ' + s.x + ' (व y = ' + s.y + ').'; }]
    },
    'linear-equations:hard:system2': {
      s: [function (s) { return 'ही समीकरणे सोडवा:  ' + s.a1 + 'x + ' + s.b1 + 'y = ' + s.c1 + '  आणि  ' + s.a2 + 'x + ' + s.b2 + 'y = ' + s.c2 + '.  x काढा.'; }],
      e: [function (s) { return 'y विलोपन करा (किंवा प्रतिस्थापन) आणि x = ' + s.x + ', y = ' + s.y + ' मिळवा. पडताळणी: ' + s.a1 + '·' + s.x + ' + ' + s.b1 + '·' + s.y + ' = ' + s.c1 + '. ✓'; }]
    },

    /* ── वर्गसमीकरणे ── (विएटा = Vieta; विवेचक = discriminant) */
    'quadratic-equations:*:largerRoot': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  मोठे मूळ काढा.'; }],
      e: [function (s) { return 'अवयव पाडा (x − ' + s.lo + ')(x − ' + s.hi + ') = 0 → मुळे ' + s.lo + ' व ' + s.hi + '. मोठे = ' + s.hi + '.'; }]
    },
    'quadratic-equations:medium:smallerRoot': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  लहान मूळ काढा.'; }],
      e: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = (x − ' + s.lo + ')(x − ' + s.hi + '). मुळे ' + s.lo + ' व ' + s.hi + '; लहान = ' + s.lo + '.'; }]
    },
    'quadratic-equations:*:sumRoots': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  त्याच्या मुळांची बेरीज काढा.'; }],
      e: [function (s) { return 'x² − Bx + C = 0 साठी, मुळांची बेरीज = B = ' + s.B + ' (विएटा: बेरीज = −b/a = ' + s.B + ').'; }]
    },
    'quadratic-equations:*:productRoots': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  त्याच्या मुळांचा गुणाकार काढा.'; }],
      e: [function (s) { return 'विएटा सूत्रांनुसार, x² − (बेरीज)x + (गुणाकार) = 0 साठी मुळांचा गुणाकार स्थिरपदाइतका असतो. येथे तो स्थिरांक ' + s.C + ' आहे, म्हणून गुणाकार = ' + s.C + ' — समीकरण प्रत्यक्ष सोडवण्याची गरज नाही. (सापळा: मुळांची बेरीज ही −(x-सहगुणक), एक वेगळे मूल्य.)'; }]
    },
    'quadratic-equations:hard:discriminant': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  विवेचक (b² − 4ac) काढा.'; }],
      e: [function (s) { return 'Δ = b² − 4ac = ' + s.B + '² − 4·1·' + s.C + ' = ' + (s.B * s.B) + ' − ' + (4 * s.C) + ' = ' + (s.B * s.B - 4 * s.C) + '.'; }]
    },
    'quadratic-equations:hard:rootRelation': {
      s: [function (s) { return 'x² − ' + s.B + 'x + c = 0 च्या मुळांमध्ये ' + s.gap + ' चा फरक आहे. c काढा.'; }],
      e: [function (s) { return 'बेरीज = ' + s.B + ' व फरक = ' + s.gap + ' यातून मुळे (' + s.B + '±' + s.gap + ')/2 = ' + s.hi + ' व ' + s.lo + ' मिळतात. विएटानुसार, c = गुणाकार = ' + s.hi + ' × ' + s.lo + ' = ' + (s.lo * s.hi) + '.'; }]
    },

    /* ── करणी व घातांक ── */
    'surds-indices:*:powerEval': {
      s: [function (s) { return s.a + '^' + s.n + ' = ?'; }, function (s) { return s.a + '^' + s.n + ' चे मूल्य काढा.'; }],
      e: [function (s) { return s.a + '^' + s.n + ' = ' + s.a + ' ला स्वतःने ' + s.n + ' वेळा गुणले = ' + s.val + '.'; }]
    },
    'surds-indices:*:solveExp': {
      s: [function (s) { return 'जर ' + s.a + '^x = ' + s.N + ', तर x काढा.'; }],
      e: [function (s) { return s.N + ' = ' + s.a + '^' + s.x + ' (' + s.a + ' च्या ' + s.x + ' घातास ' + s.N + ' असल्याने), म्हणून x = ' + s.x + '.'; }]
    },
    'surds-indices:*:fracExponent': {
      s: [function (s) { return s.b + '^(' + s.p + '/' + s.root + ') = ?'; }],
      e: [function (s) { return s.b + '^(' + s.p + '/' + s.root + ') = (' + s.b + '^(1/' + s.root + '))^' + s.p + ' = ' + s.rt + '^' + s.p + ' = ' + s.val + '.'; }]
    },
    'surds-indices:*:indexLaw': {
      s: [function (s) { return '(' + s.a + '^' + s.m + ') ÷ (' + s.a + '^' + s.n + ') = ' + s.a + '^? — घातांक द्या.'; }],
      e: [function (s) { return 'घातांकांचा भागाकार नियम: समान-पाया घातांचा भागाकार घातांक वजा करतो, aᵐ ÷ aⁿ = aᵐ⁻ⁿ. म्हणून घातांक ' + s.m + ' − ' + s.n + ' = ' + (s.m - s.n) + '. (सापळा: पाया ' + s.a + ' तोच राहतो — पाया कधीही भागत नाही.)'; }]
    },

    /* ── लॉगरिथम ── */
    'logarithms:*:evalLog': {
      s: [function (s) { return s.b + ' आधारी ' + s.N + ' चा लॉगरिथम = ?'; }, function (s) { return s.b + ' आधारी ' + s.N + ' चा लॉगरिथम काढा.'; }],
      e: [function (s) { return 'logₐN विचारतो “' + s.b + ' ला कोणत्या घातास ' + s.N + ' मिळते?” ' + s.N + ' ला ' + s.b + ' चा घात म्हणून लिहा: ' + s.b + '^' + s.k + ' = ' + s.N + ', म्हणून ' + s.b + ' आधारी ' + s.N + ' चा लॉगरिथम = ' + s.k + '.' + (s.b === 10 ? ' (आधार 10 साठी — सामान्य लॉग — 10 ने किती वेळा गुणतो ते मोजा.)' : ''); }]
    },
    'logarithms:*:solveLog': {
      s: [function (s) { return 'जर ' + s.b + ' आधारी x चा लॉगरिथम = ' + s.k + ', तर x काढा.'; }],
      e: [function (s) { return 'logₐx = k हे x = aᵏ याच विधानासारखे आहे (लॉग घातांकी रूपात लिहा). म्हणून x = ' + s.b + '^' + s.k + ' = ' + s.x + '.'; }]
    },
    'logarithms:*:logSum': {
      s: [function (s) { return '(' + s.b + ' आधारी ' + s.x + ' चा लॉगरिथम) + (' + s.b + ' आधारी ' + s.y + ' चा लॉगरिथम) = ?'; }],
      e: [function (s) { return 'गुणाकार नियम: logₐx + logₐy = logₐ(xy). ' + s.b + '^' + s.i + ' = ' + s.x + ' आणि ' + s.b + '^' + s.j + ' = ' + s.y + ' असल्याने, दोन लॉग ' + s.i + ' व ' + s.j + ' आहेत, म्हणून बेरीज = ' + s.i + ' + ' + s.j + ' = ' + (s.i + s.j) + '. (शॉर्टकट: समान-पाया लॉग जोडणे म्हणजे घातांक जोडणे.)'; }]
    },
    'logarithms:*:logPower': {
      s: [function (s) { return s.b + ' आधारी ' + s.x + '^' + s.k + ' चा लॉगरिथम = ?'; }],
      e: [function (s) { return 'घात नियम: logₐ(xᵏ) = k·logₐx. येथे ' + s.b + ' आधारी ' + s.x + ' चा लॉगरिथम = ' + s.i + ' (' + s.b + '^' + s.i + ' = ' + s.x + ' असल्याने), म्हणून उत्तर = ' + s.k + ' × ' + s.i + ' = ' + (s.i * s.k) + '. (सापळा: घातांक लॉगला गुणतो — तो नवा पाया होत नाही.)'; }]
    },

    /* ── श्रेढी ── */
    'progressions:*:apNth': {
      s: [function (s) { return 'एका अंकगणिती श्रेढीचे पहिले पद ' + s.a + ' व सामाईक फरक ' + s.d + ' आहे. तिचे ' + ordmr(s.n) + ' पद काढा.'; }, function (s) { return 'एक अंकगणिती श्रेढी ' + s.a + ' पासून सुरू होते व प्रत्येक पदाला ' + s.d + ' ने वाढते. तिचे ' + ordmr(s.n) + ' पद कोणते?'; }],
      e: [function (s) { return 'aₙ = a + (n − 1)d = ' + s.a + ' + (' + s.n + ' − 1)·' + s.d + ' = ' + s.a + ' + ' + ((s.n - 1) * s.d) + ' = ' + (s.a + (s.n - 1) * s.d) + '.'; }]
    },
    'progressions:*:apSum': {
      s: [function (s) { return 'एका अंकगणिती श्रेढीचे पहिले पद ' + s.a + ' व सामाईक फरक ' + s.d + ' आहे. तिच्या पहिल्या ' + s.n + ' पदांची बेरीज काढा.'; }],
      e: [function (s) { return 'Sₙ = n/2 · [2a + (n − 1)d] = ' + s.n + '/2 · [' + (2 * s.a) + ' + ' + ((s.n - 1) * s.d) + '] = ' + (s.n / 2 * (2 * s.a + (s.n - 1) * s.d)) + '.'; }]
    },
    'progressions:*:gpNth': {
      s: [function (s) { return 'एका भौमितिक श्रेढीचे पहिले पद ' + s.a + ' व सामाईक गुणोत्तर ' + s.r + ' आहे. तिचे ' + ordmr(s.n) + ' पद काढा.'; }],
      e: [function (s) { return 'aₙ = a·rⁿ⁻¹ = ' + s.a + '·' + s.r + '^' + (s.n - 1) + ' = ' + s.a + '·' + Math.pow(s.r, s.n - 1) + ' = ' + (s.a * Math.pow(s.r, s.n - 1)) + '.'; }]
    },
    'progressions:hard:gpSum': {
      s: [function (s) { return 'एका भौमितिक श्रेढीचे पहिले पद ' + s.a + ' व सामाईक गुणोत्तर ' + s.r + ' आहे. तिच्या पहिल्या ' + s.n + ' पदांची बेरीज काढा.'; }],
      e: [function (s) { return 'गुणोत्तर r > 1 असलेल्या भौमितिक श्रेढीसाठी Sₙ = a(rⁿ − 1)/(r − 1) वापरा. a = ' + s.a + ', r = ' + s.r + ', n = ' + s.n + ' ठेवा: = ' + s.a + '(' + s.r + '^' + s.n + ' − 1)/(' + s.r + ' − 1) = ' + s.a + '·' + (Math.pow(s.r, s.n) - 1) + '/' + (s.r - 1) + ' = ' + (s.a * (Math.pow(s.r, s.n) - 1) / (s.r - 1)) + '. (सापळा: एक-एक पद जोडू नका — सूत्र संपूर्ण श्रेढी संकलित करते; r < 1 साठी ते a(1 − rⁿ)/(1 − r) असे उलटवा.)'; }]
    },

    /* ── असमानता व निरपेक्ष मूल्य ── */
    'inequalities-modulus:*:linIneqMin': {
      s: [function (s) { return '' + s.a + 'x + ' + s.b + ' > ' + s.c + ' असा सर्वात लहान पूर्णांक x काढा.'; }],
      e: [function (s) { return s.a + 'x > ' + s.c + ' − ' + s.b + ' = ' + (s.c - s.b) + ', म्हणून x > ' + ((s.c - s.b) / s.a).toFixed(2).replace(/\.00$/, '') + '. त्यापेक्षा मोठा सर्वात लहान पूर्णांक ' + (Math.floor((s.c - s.b) / s.a) + 1) + ' आहे.'; }]
    },
    'inequalities-modulus:*:countRange': {
      s: [function (s) { return '' + s.a + ' ≤ x ≤ ' + s.b + ' समाधान करणारे किती पूर्णांक x आहेत?'; }],
      e: [function (s) { return 'बंद पल्ल्यातील पूर्णांक मोजणे दोन्ही टोकांसह असते: संख्या = (वरचे − खालचे) + 1 = (' + s.b + ' − ' + s.a + ') + 1 = ' + (s.b - s.a + 1) + '. (हा “+1” म्हणजे क्लासिक कुंपण-खांब पायरी — नुसती वजाबाकी एक टोक वगळते व 1 ने कमी मोजते.)'; }]
    },
    'inequalities-modulus:*:modLarger': {
      s: [function (s) { return 'जर |x − ' + s.a + '| = ' + s.b + ', तर x चे मोठे मूल्य काढा.'; }],
      e: [function (s) { return '|x − ' + s.a + '| = ' + s.b + ' मुळे x = ' + s.a + ' + ' + s.b + ' = ' + (s.a + s.b) + ' किंवा x = ' + s.a + ' − ' + s.b + ' = ' + (s.a - s.b) + '. मोठे = ' + (s.a + s.b) + '.'; }]
    },
    'inequalities-modulus:hard:modIneqCount': {
      s: [function (s) { return '|x − ' + s.a + '| < ' + s.b + ' समाधान करणारी x ची किती पूर्णांक मूल्ये आहेत?'; }],
      e: [function (s) { return '|x − ' + s.a + '| < ' + s.b + ' म्हणजे ' + (s.a - s.b) + ' < x < ' + (s.a + s.b) + '. काटेकोरपणे मधले पूर्णांक 2·' + s.b + ' − 1 = ' + (2 * s.b - 1) + ' मूल्ये व्यापतात.'; }]
    },
    'inequalities-modulus:hard:modIneqCountLe': {
      s: [function (s) { return '|x − ' + s.a + '| ≤ ' + s.b + ' समाधान करणारी x ची किती पूर्णांक मूल्ये आहेत?'; }],
      e: [function (s) { return '|x − ' + s.a + '| ≤ ' + s.b + ' म्हणजे ' + (s.a - s.b) + ' ≤ x ≤ ' + (s.a + s.b) + ', समावेशक = 2·' + s.b + ' + 1 = ' + (2 * s.b + 1) + ' पूर्णांक.'; }]
    },

    /* ── भूमिती — कोन, त्रिकोण, बहुभुज ── */
    'geometry-basics:easy:complement': {
      s: [function (s) { return s.a + '° कोनाचा पूरक कोन किती?'; }, function (s) { return 'दोन कोन पूरक आहेत व त्यातील एक ' + s.a + '° आहे. दुसरा काढा (अंशांत).'; }],
      e: [function (s) { return 'पूरक कोनांची बेरीज 90° असते, म्हणून पूरक = 90° − ' + s.a + '° = ' + (90 - s.a) + '°.'; }]
    },
    'geometry-basics:easy:supplement': {
      s: [function (s) { return s.a + '° कोनाचा संपूरक कोन किती?'; }, function (s) { return 'दोन कोन एका सरळ रेषेवर आहेत व एक ' + s.a + '° आहे. दुसरा काढा (अंशांत).'; }],
      e: [function (s) { return 'संपूरक कोनांची बेरीज 180° असते, म्हणून संपूरक = 180° − ' + s.a + '° = ' + (180 - s.a) + '°.'; }]
    },
    'geometry-basics:*:triangleThird': {
      s: [function (s) { return 'एका त्रिकोणाचे दोन कोन ' + s.a + '° व ' + s.b + '° आहेत. तिसरा कोन काढा.'; }, function (s) { return 'एका त्रिकोणात दोन कोन ' + s.a + '° व ' + s.b + '° आहेत. तिसरा कोन = ?°'; }],
      e: [function (s) { return 'त्रिकोणाच्या कोनांची बेरीज 180° असते, म्हणून तिसरा = 180° − ' + s.a + '° − ' + s.b + '° = ' + (180 - s.a - s.b) + '°.'; }]
    },
    'geometry-basics:medium:pythHyp': {
      s: [function (s) { return 'एका काटकोन त्रिकोणाच्या बाजू ' + s.t0 + ' व ' + s.t1 + ' आहेत. कर्ण काढा.'; }, function (s) { return 'एका शिडीचा पाय भिंतीपासून ' + s.t0 + ' m दूर आहे व ती भिंतीवर ' + s.t1 + ' m वर पोहोचते. शिडीची लांबी किती (m मध्ये)?'; }],
      e: [function (s) { return 'कर्ण = √(' + s.t0 + '² + ' + s.t1 + '²) = √(' + (s.t0 * s.t0) + ' + ' + (s.t1 * s.t1) + ') = √' + (s.t2 * s.t2) + ' = ' + s.t2 + '.'; }]
    },
    'geometry-basics:medium:isosceles': {
      s: [function (s) { return 'एका समद्विभुज त्रिकोणाचा शिरोकोन ' + s.v + '° आहे. प्रत्येक पायाचा कोन काढा.'; }],
      e: [function (s) { return 'दोन्ही पायाचे कोन समान असतात व तिघांची बेरीज 180° असते: प्रत्येक = (180° − ' + s.v + '°)/2 = ' + ((180 - s.v) / 2) + '°.'; }]
    },
    'geometry-basics:hard:pythLeg': {
      s: [function (s) { return 'एका काटकोन त्रिकोणाचा कर्ण ' + s.t2 + ' व एक बाजू ' + s.t1 + ' आहे. दुसरी बाजू काढा.'; }],
      e: [function (s) { return 'दुसरी बाजू = √(' + s.t2 + '² − ' + s.t1 + '²) = √(' + (s.t2 * s.t2) + ' − ' + (s.t1 * s.t1) + ') = √' + (s.t0 * s.t0) + ' = ' + s.t0 + '.'; }]
    },
    'geometry-basics:hard:polygonSum': {
      s: [function (s) { return s.n + ' बाजू असलेल्या बहुभुजाच्या अंतःकोनांची बेरीज काढा.'; }, function (s) { return s.n + ' बाजू असलेल्या बहुभुजाचे अंतःकोन एकत्र ?° होतात'; }],
      e: [function (s) { return 'अंतःकोनांची बेरीज = (n − 2) × 180° = (' + s.n + ' − 2) × 180° = ' + ((s.n - 2) * 180) + '°.'; }]
    },
    'geometry-basics:hard:polygonEach': {
      s: [function (s) { return s.n + ' बाजू असलेल्या नियमित बहुभुजाचा प्रत्येक अंतःकोन काढा.'; }],
      e: [function (s) { return 'प्रत्येक अंतःकोन = (n − 2) × 180° / n = ' + ((s.n - 2) * 180) + '° / ' + s.n + ' = ' + ((s.n - 2) * 180 / s.n) + '°.'; }]
    },

    /* ── निर्देशक भूमिती ── */
    'coordinate-geometry-basics:*:distance': {
      s: [function (s) { return '(' + s.x1 + ', ' + s.y1 + ') व (' + s.x2 + ', ' + s.y2 + ') या बिंदूंमधील अंतर काढा.'; }],
      e: [function (s) { return 'अंतर = √[(Δx)² + (Δy)²] = √[' + s.t0 + '² + ' + s.t1 + '²] = √' + (s.t2 * s.t2) + ' = ' + s.t2 + '.'; }]
    },
    'coordinate-geometry-basics:*:midpointX': {
      s: [function (s) { return '(' + s.x1 + ', ' + s.y1 + ') व (' + s.x2 + ', ' + s.y2 + ') च्या मध्यबिंदूचा x-निर्देशक काढा.'; }],
      e: [function (s) { return 'मध्यबिंदू x = (x₁ + x₂)/2 = (' + s.x1 + ' + ' + s.x2 + ')/2 = ' + ((s.x1 + s.x2) / 2) + '.'; }]
    },
    'coordinate-geometry-basics:*:slope': {
      s: [function (s) { return '(' + s.x1 + ', ' + s.y1 + ') व (' + s.x2 + ', ' + s.y2 + ') यांना जोडणाऱ्या रेषेचा उतार काढा.'; }],
      e: [function (s) { return 'उतार = (y₂ − y₁)/(x₂ − x₁) = (' + (s.y2 - s.y1) + ')/(' + (s.x2 - s.x1) + ') = ' + ((s.y2 - s.y1) / (s.x2 - s.x1)) + '.'; }]
    },
    'coordinate-geometry-basics:hard:sectionX': {
      s: [function (s) { return 'बिंदू P हा (' + s.x1 + ', ' + s.y1 + ') व (' + s.x2 + ', ' + s.y2 + ') यांना जोडणाऱ्या रेषेला ' + s.m + ':' + s.n + ' गुणोत्तरात अंतर्गत विभाजित करतो. P चा x-निर्देशक काढा.'; }],
      e: [function (s) { return 'विभाजन सूत्र: x = (m·x₂ + n·x₁)/(m + n) = (' + s.m + '·' + s.x2 + ' + ' + s.n + '·' + s.x1 + ')/(' + s.m + ' + ' + s.n + ') = ' + s.x + '.'; }]
    },

    /* ── त्रिकोणमिती ── */
    'trigonometry:*:standardEval': {
      s: [function (s) { return s.fn + ' ' + s.ang + '° = ?'; }],
      e: [function (s) { return 'प्रमाण कोन सारणीवरून, ' + s.fn + ' ' + s.ang + '° = ' + s.val + '.'; }]
    },
    'trigonometry:*:complementary': {
      s: [function (s) { return 'जर ' + s.p0 + ' θ = ' + s.p1 + ' ' + s.x + '°, तर न्यून कोन θ काढा (अंशांत).'; }],
      e: [function (s) { return s.p0 + ' θ = ' + s.p1 + '(90° − θ), म्हणून θ = 90° − ' + s.x + '° = ' + (90 - s.x) + '°.'; }]
    },
    'trigonometry:*:identity': {
      s: [function (s) { return TRIG_IDENT[s.idx][0] + ' चे मूल्य काढा.'; }],
      e: [function (s) { return 'हे ' + TRIG_IDENT[s.idx][1] + ' आहे — तीन पायथागोरस नित्यसमीकरणांपैकी एक, ही सर्व sin²θ + cos²θ = 1 पासून व्युत्पन्न (इतर दोनसाठी cos²θ किंवा sin²θ ने भागा). प्रत्येक कोन θ साठी त्याचे मूल्य 1 निश्चित असते, म्हणून विशिष्ट कोनाची गरज नाही. (सापळा: वर्ग फलनांवर असतो, उदा. sin²θ म्हणजे (sinθ)², sin(θ²) नव्हे.)'; }]
    },
    'trigonometry:hard:heightElev': {
      s: [function (s) { return 'एका ' + TRIG_STRUCT[s.stIdx] + ' च्या शिखराचा उन्नतकोन, त्याच्या पायथ्यापासून ' + s.base + ' m दूर एका बिंदूवरून 45° आहे. ' + TRIG_STRUCT[s.stIdx] + ' ची उंची काढा (मीटरमध्ये).'; }],
      e: [function (s) { return 'tan(45°) = उंची / पाया = 1, म्हणून उंची = पाया = ' + s.base + ' m.'; }]
    },

    /* ── क्रमचय व संचय ── */
    'permutation-combination:easy:factorial': {
      s: [function (s) { return s.n + '! = ?'; }],
      e: [function (s) { return s.n + '! = ' + s.n + ' × ' + (s.n - 1) + ' × … × 1 = ' + s.val + '.'; }]
    },
    'permutation-combination:*:arrange': {
      s: [function (s) { return s.n + ' वेगवेगळी पुस्तके एका रांगेत किती प्रकारे मांडता येतील?'; }],
      e: [function (s) { return 'सर्व ' + s.n + ' मांडणे = ' + s.n + '! = ' + s.val + '.'; }]
    },
    'permutation-combination:medium:nPr': {
      s: [function (s) { return s.n + 'P' + s.r + ' चे मूल्य काढा (' + s.n + ' पैकी ' + s.r + ' चा क्रमचय).'; }],
      e: [function (s) { return 'nPr = n!/(n−r)! = ' + s.n + '!/' + (s.n - s.r) + '! = ' + s.val + '.'; }]
    },
    'permutation-combination:medium:nCr': {
      s: [function (s) { return s.n + 'C' + s.r + ' चे मूल्य काढा (' + s.n + ' पैकी ' + s.r + ' चा संचय).'; }],
      e: [function (s) { return 'nCr = n!/[r!(n−r)!] = ' + s.n + '!/[' + s.r + '!·' + (s.n - s.r) + '!] = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:committee': {
      s: [function (s) { return s.n + ' व्यक्तींमधून ' + s.r + ' सदस्यांच्या किती वेगवेगळ्या समित्या तयार करता येतील?'; }],
      e: [function (s) { return 'क्रम महत्त्वाचा नाही → संचय: ' + s.n + 'C' + s.r + ' = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:handshakes': {
      s: [function (s) { return s.n + ' व्यक्तींच्या पार्टीत, प्रत्येक जण इतर प्रत्येकाशी एकदा हस्तांदोलन करतो. एकूण किती हस्तांदोलने होतात?'; }],
      e: [function (s) { return 'प्रत्येक हस्तांदोलन एक जोडी → ' + s.n + 'C2 = ' + s.n + '×' + (s.n - 1) + '/2 = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:circular': {
      s: [function (s) { return s.n + ' व्यक्तींना एका वर्तुळाकार मेजाभोवती किती प्रकारे बसवता येईल?'; }],
      e: [function (s) { return 'वर्तुळात समान फिरवण्या काढून टाकण्यासाठी एक जागा निश्चित केली जाते, उरते (n − 1)! = ' + (s.n - 1) + '! = ' + s.val + ' मांडण्या.'; }]
    },
    'permutation-combination:hard:atLeastOne': {
      s: [function (s) { return s.w + ' स्त्रिया व ' + s.m + ' पुरुषांमधून ' + s.r + ' सदस्यांची समिती निवडली जाते. किती समित्यांमध्ये किमान एक स्त्री असेल?'; }],
      e: [function (s) { return 'पूरक मोजा: एकूण समित्या ' + (s.w + s.m) + 'C' + s.r + ' = ' + s.total + ', त्यातून फक्त-पुरुष समित्या ' + s.m + 'C' + s.r + ' = ' + s.allMen + ' वजा केल्यास ' + s.ans + ' मिळते. “किमान एक” म्हणजे जवळजवळ नेहमी शून्य-स्थिती वजा करणे.'; }]
    },

    /* ── संभाव्यता ── */
    'probability:*:bagSingle': {
      s: [function (s) { return 'एका पिशवीत ' + s.r + ' ' + PROB_COL[s.colIdx][0] + ' व ' + s.b + ' ' + PROB_COL[s.colIdx][1] + ' चेंडू आहेत. एक चेंडू यादृच्छिकपणे काढला जातो. तो ' + PROB_COL[s.colIdx][0] + ' असण्याची संभाव्यता किती? (दशांशात)'; }],
      e: [function (s) { return 'P = अनुकूल/एकूण = ' + s.r + '/' + s.T + ' = ' + s.ans + '.'; }]
    },
    'probability:easy:allHeads': {
      s: [function (s) { return s.n + ' न्याय्य ' + (s.n === 1 ? 'नाणे उडवले जाते' : 'नाणी उडवली जातात') + '. ' + (s.n === 1 ? 'छापा येण्याची' : 'सर्व छापे येण्याची') + ' संभाव्यता किती? (दशांशात)'; }],
      e: [function (s) { return 'P(सर्व छापे) = (1/2)^' + s.n + ' = ' + s.ans + '.'; }]
    },
    'probability:*:complement': {
      s: [function (s) { return 'एका पिशवीत ' + s.r + ' ' + PROB_COLC[s.colIdx][0] + ' व ' + s.b + ' ' + PROB_COLC[s.colIdx][1] + ' चेंडू आहेत. एक चेंडू यादृच्छिकपणे काढला जातो. तो ' + PROB_COLC[s.colIdx][0] + ' नसण्याची संभाव्यता किती? (दशांशात)'; }],
      e: [function (s) { return 'P(' + PROB_COLC[s.colIdx][0] + ' नाही) = 1 − ' + s.r + '/' + s.T + ' = ' + s.ans + '.'; }]
    },
    'probability:*:multipleProb': {
      s: [function (s) { return '1 ते ' + s.T + ' मधून एक संख्या यादृच्छिकपणे निवडली जाते. ती ' + s.d + ' चा गुणक असण्याची संभाव्यता किती? (दशांशात)'; }],
      e: [function (s) { return s.T + ' पर्यंत ' + s.d + ' चे गुणक: ' + s.fav + '. P = ' + s.fav + '/' + s.T + ' = ' + s.ans + '.'; }]
    },

    /* ── समुच्चय सिद्धांत ── */
    'set-theory:*:union': {
      s: [function (s) { return 'एका गटात ' + s.a + ' जणांना ' + SET_CTX[s.ci][0] + ' आवडते, ' + s.b + ' जणांना ' + SET_CTX[s.ci][1] + ' आवडते, व ' + s.both + ' जणांना दोन्ही आवडते. दोहोंपैकी किमान एक किती जणांना आवडते?'; }],
      e: [function (s) { return '|A∪B| = |A| + |B| − |A∩B| = ' + s.a + ' + ' + s.b + ' − ' + s.both + ' = ' + (s.a + s.b - s.both) + '.'; }]
    },
    'set-theory:easy:onlyA': {
      s: [function (s) { return 'एका गटात ' + s.a + ' जणांना ' + SET_CTX[s.ci][0] + ' आवडते व त्यांपैकी ' + s.both + ' जणांना ' + SET_CTX[s.ci][1] + ' सुद्धा आवडते. फक्त ' + SET_CTX[s.ci][0] + ' किती जणांना आवडते?'; }],
      e: [function (s) { return 'फक्त ' + SET_CTX[s.ci][0] + ' = |A| − |A∩B| = ' + s.a + ' − ' + s.both + ' = ' + (s.a - s.both) + '.'; }]
    },
    'set-theory:*:neither': {
      s: [function (s) { return s.total + ' विद्यार्थ्यांच्या वर्गात, ' + s.a + ' जणांना ' + SET_CTX[s.ci][0] + ' आवडते, ' + s.b + ' जणांना ' + SET_CTX[s.ci][1] + ' आवडते व ' + s.both + ' जणांना दोन्ही आवडते. एकही किती जणांना आवडत नाही?'; }],
      e: [function (s) { return 'किमान एक आवडणारे = ' + s.a + ' + ' + s.b + ' − ' + s.both + ' = ' + s.union + '. एकही नाही = ' + s.total + ' − ' + s.union + ' = ' + s.neither + '.'; }]
    },
    'set-theory:*:both': {
      s: [function (s) { return s.total + ' विद्यार्थ्यांच्या वर्गात, ' + s.a + ' जणांना ' + SET_CTX[s.ci][0] + ' आवडते, ' + s.b + ' जणांना ' + SET_CTX[s.ci][1] + ' आवडते व ' + s.neither + ' जणांना एकही आवडत नाही. दोन्ही किती जणांना आवडते?'; }],
      e: [function (s) { return 'किमान एक आवडणारे = ' + s.total + ' − ' + s.neither + ' = ' + s.union + '. दोन्ही = |A| + |B| − संघ = ' + s.a + ' + ' + s.b + ' − ' + s.union + ' = ' + s.both + '.'; }]
    },
    'set-theory:hard:threeUnion': {
      s: [function (s) { return 'एका सर्वेक्षणात ' + s.a + ' जण A वाचतात, ' + s.b + ' जण B वाचतात, ' + s.cc + ' जण C वाचतात; ' + s.ab + ' जण A व B वाचतात, ' + s.bc + ' जण B व C वाचतात, ' + s.ca + ' जण A व C वाचतात, व ' + s.abc + ' जण तिन्ही वाचतात. किमान एक किती जण वाचतात?'; }],
      e: [function (s) { return '|A∪B∪C| = (' + s.a + '+' + s.b + '+' + s.cc + ') − (' + s.ab + '+' + s.bc + '+' + s.ca + ') + ' + s.abc + ' = ' + s.union + '.'; }]
    },

    /* ── सांख्यिकी ── */
    'statistics-basics:*:median': {
      s: [function (s) { return s.a.join(', ') + ' यांची मध्यगा काढा.'; }],
      e: [function (s) { return 'क्रमाने लावा: ' + s.sorted.join(', ') + '. ' + s.k + ' मूल्यांसह मध्यगा ही मधले मूल्य = ' + s.med + '.'; }]
    },
    'statistics-basics:*:range': {
      s: [function (s) { return s.a.join(', ') + ' यांचा पल्ला काढा.'; }],
      e: [function (s) { return 'पल्ला = सर्वात मोठे − सर्वात लहान = ' + s.mx + ' − ' + s.mn + ' = ' + (s.mx - s.mn) + '.'; }]
    },
    'statistics-basics:*:mode': {
      s: [function (s) { return s.a.join(', ') + ' यांचा बहुलक काढा.'; }],
      e: [function (s) { return 'बहुलक हे सर्वात जास्त वेळा येणारे मूल्य. ' + s.m + ' 3 वेळा येते — इतर कोणत्याहीपेक्षा जास्त — म्हणून बहुलक ' + s.m + '.'; }]
    },
    'statistics-basics:hard:mean': {
      s: [function (s) { return s.a.join(', ') + ' यांचा मध्य (सरासरी) काढा.'; }],
      e: [function (s) { return 'मध्य = बेरीज ÷ संख्या = ' + s.sum + ' ÷ ' + s.k + ' = ' + s.M + '.'; }]
    },

    /* ── मिश्रण व मिश्रण नियम ── (commodity via MIX_ITEMS; wording gender-invariant via नमुने/प्रमाण/दर) */
    'mixtures:*:alligationRatio': {
      s: [function (s) { return MIX_ITEMS[s.itIdx] + ' चे दोन नमुने, ₹' + s.a + ' प्रति kg व ₹' + s.b + ' प्रति kg दराने, कोणत्या गुणोत्तरात मिसळावेत म्हणजे मिश्रण ₹' + s.m + ' प्रति kg होईल?'; }],
      e: [function (s) { return 'मिश्रण नियमाने, स्वस्त : महाग = (महाग − मध्य) : (मध्य − स्वस्त) = (' + s.b + '−' + s.m + ') : (' + s.m + '−' + s.a + ') = ' + s.lo + ' : ' + s.hi + ' = ' + (s.lo / s.g) + ' : ' + (s.hi / s.g) + '.'; }]
    },
    'mixtures:*:meanPrice': {
      s: [function (s) { return s.x + ' kg ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.a + ' प्रति kg) व ' + s.y + ' kg ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.b + ' प्रति kg) एकत्र मिसळले जातात. मिश्रणाची सरासरी किंमत = ₹? प्रति kg'; }],
      e: [function (s) { return 'सरासरी = एकूण किंमत ÷ एकूण वजन = (' + s.x + '×' + s.a + ' + ' + s.y + '×' + s.b + ') ÷ (' + s.x + '+' + s.y + ') = ' + (s.a * s.x + s.b * s.y) + ' ÷ ' + (s.x + s.y) + ' = ₹' + s.mean + '.'; }]
    },
    'mixtures:hard:alligationQty': {
      s: [function (s) { return 'किती प्रमाणात (kg मध्ये) ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.a + ' प्रति kg) ' + s.y + ' kg ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.b + ' प्रति kg) मध्ये मिसळावे म्हणजे मिश्रण ₹' + s.m + ' प्रति kg होईल?'; }],
      e: [function (s) { return 'मिश्रण नियमाने, स्वस्त : महाग = (' + s.b + '−' + s.m + ') : (' + s.m + '−' + s.a + ') = ' + s.lo + ' : ' + s.hi + '. स्वस्त प्रमाण = ' + s.y + ' × ' + s.lo + '/' + s.hi + ' = ' + s.x + ' kg.'; }]
    },

    /* ── राशी-तुलना ── (text-MCQ; options/answer QC_REL वरून index द्वारे qcOmr/qcAnsmr) */
    'quantity-comparison:*:pct': {
      s: [function (s) { return 'दोन राशींची तुलना करा.  राशी I: ' + s.b + ' चे ' + s.a + '%.  राशी II: ' + s.q2 + '.'; }],
      e: [function (s) { return s.b + ' चे ' + s.a + '% = ' + s.q1 + '. म्हणून राशी I = ' + s.q1 + ' व राशी II = ' + s.q2 + ', यातून “' + QC_REL[s.relIdx] + '”.'; }],
      o: qcOmr, ans: qcAnsmr
    },
    'quantity-comparison:*:product': {
      s: [function (s) { return 'दोन राशींची तुलना करा.  राशी I: ' + s.a + ' × ' + s.b + '.  राशी II: ' + s.c + ' × ' + s.d + '.'; }],
      e: [function (s) { return s.a + ' × ' + s.b + ' = ' + s.q1 + '; ' + s.c + ' × ' + s.d + ' = ' + s.q2 + '. म्हणून राशी I = ' + s.q1 + ' व राशी II = ' + s.q2 + ', यातून “' + QC_REL[s.relIdx] + '”.'; }],
      o: qcOmr, ans: qcAnsmr
    },
    'quantity-comparison:*:solve': {
      s: [function (s) { return 'दोन राशींची तुलना करा.  राशी I: x चे मूल्य, जेथे ' + s.m + 'x + ' + s.n + ' = ' + s.c + '.  राशी II: ' + s.q2 + '.'; }],
      e: [function (s) { return s.m + 'x + ' + s.n + ' = ' + s.c + ' → x = ' + s.x + '. म्हणून राशी I = ' + s.q1 + ' व राशी II = ' + s.q2 + ', यातून “' + QC_REL[s.relIdx] + '”.'; }],
      o: qcOmr, ans: qcAnsmr
    },
    'quantity-comparison:*:average': {
      s: [function (s) { return 'दोन राशींची तुलना करा.  राशी I: ' + s.list.join(', ') + ' यांची सरासरी.  राशी II: ' + s.q2 + '.'; }],
      e: [function (s) { return 'सरासरी = (' + s.list.join(' + ') + ')/3 = ' + s.q1 + '. म्हणून राशी I = ' + s.q1 + ' व राशी II = ' + s.q2 + ', यातून “' + QC_REL[s.relIdx] + '”.'; }],
      o: qcOmr, ans: qcAnsmr
    },
    'quantity-comparison:*:square': {
      s: [function (s) { return 'दोन राशींची तुलना करा.  राशी I: ' + s.a + '².  राशी II: ' + s.q2 + '.'; }],
      e: [function (s) { return s.a + '² = ' + s.q1 + '. म्हणून राशी I = ' + s.q1 + ' व राशी II = ' + s.q2 + ', यातून “' + QC_REL[s.relIdx] + '”.'; }],
      o: qcOmr, ans: qcAnsmr
    }
  } };

  if (GI) GI.register('mr', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
