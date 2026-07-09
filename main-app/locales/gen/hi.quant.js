/**
 * hi.quant.js — generated-content pack (quant engine, Hindi) for QRGenI18n (ADR-111 Phase F-M3).
 *
 * Exam-book Hindi (Arihant / R.S. Aggarwal / Disha / Testbook register), authored against
 * docs/BIBLE/GLOSSARY_I18N.md. Keys + slot names mirror en.quant.js EXACTLY; only the framing prose is Hindi.
 * Every digit/operator/variable/formula is byte-identical to EN (enforced by gen-i18n.check §8 digit-multiset +
 * invariance); math notation (sin/cos/log/√/²/³/×/÷/−/₹/%/nPr) stays Latin/symbolic. Function-valued.
 *
 * Coverage is authored in reviewable batches; each batch is verified (invariance + digit + leak + parity) before
 * the next. `complete: true` is set only when all EN archetypes are covered (flips the coverage hard-gate).
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* Hindi ordinal for "Nth term" — numeral + वाँ ("5वाँ पद"), the universal exam-book form. Preserves the digit
     (digit-multiset parity with EN's ord()). */
  function ordhi(n) { return n + 'वाँ'; }

  /* Index-aligned pools (Hindi) — same length + inner arity as en.quant.js (enforced by gen-i18n.check §7).
     Only the descriptor word translates ('more'→अधिक, 'less'→कम); the % numbers and the ratio answer are neutral. */
  var RAT_PCT_POOL = [['25% अधिक', '5:4'], ['20% कम', '4:5'], ['50% अधिक', '3:2'], ['20% अधिक', '6:5'], ['25% कम', '3:4'], ['10% कम', '9:10'], ['12.5% अधिक', '9:8'], ['16.66% कम', '5:6'], ['37.5% अधिक', '11:8'], ['11.11% कम', '8:9'], ['66.66% अधिक', '5:3'], ['150% अधिक', '5:2'], ['40% अधिक', '7:5'], ['75% अधिक', '7:4']];

  /* Trigonometry structure nouns (index-aligned with EN TRIG_STRUCT) — height-and-distance objects, standard
     exam-book Hindi (मीनार = tower, ध्वजदंड = flagpole). Latin loan लाइटहाउस kept (recognized term). */
  var TRIG_STRUCT = ['मीनार', 'खंभा', 'इमारत', 'पेड़', 'ध्वजदंड', 'लाइटहाउस', 'चिमनी'];
  /* Trigonometric identities (index-aligned with EN TRIG_IDENT; arity 2). [0] is the expression to evaluate
     (byte-identical Latin/symbol math); [1] is the descriptive phrase (सर्वसमिका = identity). */
  var TRIG_IDENT = [['sin²θ + cos²θ', 'पाइथागोरस सर्वसमिका sin²θ + cos²θ = 1'], ['sec²θ − tan²θ', 'सर्वसमिका sec²θ − tan²θ = 1'], ['cosec²θ − cot²θ', 'सर्वसमिका cosec²θ − cot²θ = 1']];

  /* Probability colour pools (index-aligned; balls गेंदें are feminine → feminine colour forms नीली/हरी/पीली/काली). */
  var PROB_COL = [['लाल', 'नीली'], ['हरी', 'पीली'], ['काली', 'सफ़ेद'], ['लाल', 'हरी']];
  var PROB_COLC = [['लाल', 'नीली'], ['हरी', 'पीली'], ['काली', 'सफ़ेद']];
  /* Set-theory context pairs (index-aligned) — the two liked-things per Venn problem. Subject/sport/food nouns in
     exam-book Hindi; अंग्रेज़ी (school subject) is Devanagari, not the DNT brand "English". */
  var SET_CTX = [['चाय', 'कॉफ़ी'], ['फुटबॉल', 'क्रिकेट'], ['गणित', 'विज्ञान'], ['हिन्दी', 'अंग्रेज़ी'], ['सेब', 'संतरे'], ['शतरंज', 'कैरम'], ['भौतिकी', 'रसायन'], ['बैडमिंटन', 'टेनिस'], ['इतिहास', 'भूगोल'], ['चित्रकला', 'संगीत'], ['गिटार', 'पियानो'], ['कुत्ते', 'बिल्लियाँ'], ['क्रिकेट', 'हॉकी'], ['पिज़्ज़ा', 'बर्गर']];
  /* Mixture item pool (index-aligned; plain strings like EN). Templates are worded gender-invariantly (नमूने/मात्रा/
     दर carry agreement, not the commodity) so grammar holds for every item regardless of its gender. */
  var MIX_ITEMS = ['चावल', 'गेहूँ', 'चीनी', 'चाय', 'कॉफ़ी', 'दाल', 'आटा', 'नमक'];
  /* Quantity-comparison relation pool (index 0=>, 1=<, 2==). Quantity → राशि; I/II Roman numerals and >,<,= neutral.
     qcOhi/qcAnshi render options/answer from THIS pool by the indices build stored in slots (grading self-consistent). */
  var QC_REL = ['राशि I > राशि II', 'राशि I < राशि II', 'राशि I = राशि II'];
  function qcOhi(s) { return s.ord.map(function (i) { return QC_REL[i]; }); }
  function qcAnshi(s) { return QC_REL[s.relIdx]; }

  var pack = { complete: true, pools: { RAT_PCT_POOL: RAT_PCT_POOL, TRIG_STRUCT: TRIG_STRUCT, TRIG_IDENT: TRIG_IDENT, PROB_COL: PROB_COL, PROB_COLC: PROB_COLC, SET_CTX: SET_CTX, MIX_ITEMS: MIX_ITEMS, QC_REL: QC_REL }, tpl: {
    /* ── Batch 1: वर्ग, घन, भिन्न, गुणा, सरलीकरण (pure-arithmetic core; no names, no pools) ── */

    /* वर्ग और वर्गमूल */
    'squares:easy:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return s.n + ' का वर्ग = ?'; }, function (s) { return s.n + ' का वर्ग ज्ञात कीजिए।'; }],
      e: [function (s) { return s.n + '² = ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n) + '.'; }]
    },
    'squares:medium:direct': {
      s: [function (s) { return s.n + '² = ?'; }, function (s) { return s.n + ' का वर्ग = ?'; }],
      e: [function (s) { return s.id; }]
    },
    'squares:medium:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return s.sq + ' का वर्गमूल = ?'; }, function (s) { return 'यदि x² = ' + s.sq + ', तो x = ?'; }],
      e: [function (s) { return 'ऐसा x ज्ञात कीजिए जिसके लिए x² = ' + s.sq + '. चूँकि ' + s.n + '² = ' + s.sq + ', इसलिए √' + s.sq + ' = ' + s.n + '.'; }]
    },
    'squares:hard:inverse': {
      s: [function (s) { return '√' + s.sq + ' = ?'; }, function (s) { return 'यदि x² = ' + s.sq + ', तो x = ?'; }],
      e: [function (s) { return s.n + '² = ' + s.sq + ', इसलिए √' + s.sq + ' = ' + s.n + '. यह ' + s.b + '² = ' + s.bsq + ' से ठीक ऊपर है।'; }]
    },
    'squares:hard:diffSquares': {
      s: [function (s) { return s.a + '² − ' + s.b + '² = ?'; }],
      e: [function (s) { return 'a² − b² = (a+b)(a−b) = (' + s.sum + ')(' + s.diff + ') = ' + s.ans + '. दोनों का वर्ग निकालने के बजाय गुणनखंड कीजिए — कहीं तेज़।'; }]
    },

    /* घन और घनमूल */
    'cubes:easy:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return s.n + ' का घन = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + ' × ' + s.n + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:direct': {
      s: [function (s) { return s.n + '³ = ?'; }, function (s) { return s.n + ' का घन = ?'; }],
      e: [function (s) { return s.n + '³ = ' + s.n + '² × ' + s.n + ' = ' + (s.n * s.n) + ' × ' + s.n + ' = ' + (s.n * s.n * s.n) + '.'; }]
    },
    'cubes:medium:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return (s.n * s.n * s.n) + ' का घनमूल = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return s.n + '³ = ' + c + ', इसलिए ∛' + c + ' = ' + s.n + '. संकेत: घन का इकाई अंक ' + (c % 10) + ' मूल का इकाई अंक तय कर देता है।'; }]
    },
    'cubes:hard:inverse': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return (s.n * s.n * s.n) + ' का घनमूल = ?'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return '∛' + c + ' = ' + s.n + '. इकाई अंक ' + (c % 10) + ' → मूल का अंत ' + (s.n % 10) + ' पर होता है; अग्र भाग इसे ' + s.n + ' के निकट रखता है।'; }]
    },
    'cubes:hard:cubeRoot5': {
      s: [function (s) { return '∛' + (s.n * s.n * s.n) + ' = ?'; }, function (s) { return (s.n * s.n * s.n) + ' का घनमूल ज्ञात कीजिए।'; }],
      e: [function (s) { var c = s.n * s.n * s.n; return c + ' को विभाजित कीजिए: अंतिम अंक ' + (c % 10) + ' मूल का इकाई अंक ' + (s.n % 10) + ' तय करता है; हज़ार वाला भाग ' + Math.floor(c / 1000) + ', ' + Math.floor(s.n / 10) + '³ और ' + (Math.floor(s.n / 10) + 1) + '³ के बीच है, अतः दहाई अंक ' + Math.floor(s.n / 10) + ' है। मूल = ' + s.n + '.'; }]
    },
    'cubes:hard:diffCubes': {
      s: [function (s) { return s.a + '³ − ' + s.b + '³ = ?'; }],
      e: [function (s) { return s.a + '³ = ' + (s.a * s.a * s.a) + ' और ' + s.b + '³ = ' + (s.b * s.b * s.b) + ', अतः अंतर = ' + (s.a * s.a * s.a - s.b * s.b * s.b) + '. (सर्वसमिका: a³ − b³ = (a − b)(a² + ab + b²)।)'; }]
    },

    /* भिन्न */
    'fractions:*:fracToPct': {
      s: [function (s) { return s.frac + ' को प्रतिशत में व्यक्त करने पर = ? %'; }, function (s) { return s.frac + ' को प्रतिशत में बदलिए।'; }, function (s) { return s.frac + ' = ? %'; }, function (s) { return s.frac + ' प्रतिशत के रूप में कितना होगा?'; }],
      e: [function (s) { return s.frac + ' = ' + s.pct + '% (भाग देकर ×100 कीजिए; सामान्य मान याद रखने से समय बचता है)।'; }]
    },
    'fractions:*:pctToFrac': {
      s: [function (s) { return s.pct + '% को भिन्न के रूप में = ?'; }, function (s) { return s.pct + '% को भिन्न के रूप में व्यक्त कीजिए।'; }, function (s) { return s.pct + '% = ? (निम्नतम पदों में)'; }],
      e: [function (s) { return s.pct + '% = ' + s.pct + '/100 = ' + s.frac + ' निम्नतम पदों में।'; }]
    },
    'fractions:hard:fracOfFrac': {
      s: [function (s) { return s.N + ' का ' + s.a2 + '/' + s.b2 + ', उसका ' + s.a1 + '/' + s.b1 + ' = ?'; }, function (s) { return s.N + ' के ' + s.a2 + '/' + s.b2 + ' का ' + s.a1 + '/' + s.b1 + ' ज्ञात कीजिए।'; }],
      e: [function (s) { return '"का" का अर्थ है गुणा: ' + s.a1 + '/' + s.b1 + ' × ' + s.a2 + '/' + s.b2 + ' × ' + s.N + '. गुणा से पहले काट-छाँट कीजिए: उत्तर ' + s.r + ' है।'; }]
    },
    'fractions:hard:addFrac': {
      s: [function (s) { return s.a1 + '/' + s.b1 + ' + ' + s.a2 + '/' + s.b2 + ' = ? (निम्नतम पदों में)'; }, function (s) { return s.a1 + '/' + s.b1 + ' और ' + s.a2 + '/' + s.b2 + ' को जोड़िए। उत्तर निम्नतम पदों में दीजिए।'; }],
      e: [function (s) { return 'समान हर ' + s.cd + ': ' + s.l + '/' + s.cd + ' + ' + s.r2 + '/' + s.cd + ' = ' + s.snum0 + '/' + s.cd + ' = ' + s.num + '/' + s.den + ', ' + s.g + ' से सरल करने पर।'; }]
    },

    /* मानसिक गुणा */
    'multiplication:*:multiply': { s: [function (s) { return s.x + ' × ' + s.y + ' = ?'; }], e: [function (s) { return s.x + ' × ' + s.y + ' = ' + (s.x * s.y) + '. दूसरी संख्या को तोड़िए: ' + s.x + ' × ' + s.tens + ' + ' + s.x + ' × ' + s.un + ' = ' + (s.x * s.tens) + ' + ' + (s.x * s.un) + '.'; }] },
    'multiplication:*:divide': { s: [function (s) { return s.p + ' ÷ ' + s.x + ' = ?'; }], e: [function (s) { return s.p + ' ÷ ' + s.x + ' = ' + s.y + ', क्योंकि ' + s.x + ' × ' + s.y + ' = ' + s.p + '. भाग, गुणनफल को पलट देता है।'; }] },
    'multiplication:*:threeFactor': { s: [function (s) { return s.a + ' × ' + s.b + ' × ' + s.c + ' = ?'; }], e: [function (s) { return 'बाएँ से दाएँ: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', फिर × ' + s.c + ' = ' + (s.a * s.b * s.c) + '. संभव हो तो पुनः समूहित करके गोल संख्या बनाइए।'; }] },
    'multiplication:medium:mentalSquare': { s: [function (s) { return s.n + ' × ' + s.n + ' = ?'; }], e: [function (s) { return s.n + '² = (' + s.r + (s.d < 0 ? '' : '+') + s.d + ')² = ' + (s.n * s.n) + ' — एक तेज़ मानसिक वर्ग।'; }] },

    /* सरलीकरण / BODMAS */
    'simplification:*:multiplyAdd': { s: [function (s) { return s.a + ' × ' + s.b + ' + ' + s.c + ' = ?'; }], e: [function (s) { return 'BODMAS — पहले गुणा: ' + s.a + ' × ' + s.b + ' = ' + (s.a * s.b) + ', फिर + ' + s.c + ' = ' + (s.a * s.b + s.c) + '.'; }] },
    'simplification:medium:divideAdd': { s: [function (s) { return s.num + ' ÷ ' + s.dv + ' + ' + s.add + ' = ?'; }], e: [function (s) { return 'पहले भाग: ' + s.num + ' ÷ ' + s.dv + ' = ' + (s.num / s.dv) + ', फिर + ' + s.add + ' = ' + (s.num / s.dv + s.add) + '.'; }] },
    'simplification:hard:fullBodmas': { s: [function (s) { return '(' + s.p + ' × ' + s.q + ') ÷ ' + s.r + ' + ' + s.ss + ' × ' + s.t + ' = ?'; }], e: [function (s) { return 'कोष्ठक → (' + s.p + ' × ' + s.q + ') = ' + (s.p * s.q) + '; ÷ ' + s.r + ' = ' + ((s.p * s.q) / s.r) + '; और ' + s.ss + ' × ' + s.t + ' = ' + (s.ss * s.t) + '; योग = ' + ((s.p * s.q) / s.r + s.ss * s.t) + '.'; }] },

    /* ── Batch 2: क्षेत्रफल, आयतन, पृष्ठीय क्षेत्रफल (units cm/m + π = 3.14 stay; nouns/verbs Hindi) ── */

    /* क्षेत्रफल */
    'area:easy:square': {
      s: [function (s) { return 'भुजा ' + s.s + ' cm वाले वर्ग का क्षेत्रफल = ? cm².'; }, function (s) { return 'एक वर्गाकार टाइल की भुजा ' + s.s + ' cm है। इसका क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }, function (s) { return 'एक वर्गाकार खेत की प्रत्येक भुजा ' + s.s + ' m है। इसका क्षेत्रफल = ? m².'; }],
      e: [function (s) { return 'वर्ग का क्षेत्रफल = भुजा² = ' + s.s + '² = ' + (s.s * s.s) + '.'; }]
    },
    'area:*:rectangle': {
      s: [function (s) { return 'एक आयत ' + s.l + ' cm लंबा और ' + s.b + ' cm चौड़ा है। इसका क्षेत्रफल = ? cm².'; }, function (s) { return 'एक आयताकार भूखंड की माप ' + s.l + ' m × ' + s.b + ' m है। इसका क्षेत्रफल ज्ञात कीजिए (m² में)।'; }, function (s) { return 'एक हॉल ' + s.l + ' m लंबा और ' + s.b + ' m चौड़ा है। इसके फ़र्श का क्षेत्रफल = ? m².'; }],
      e: [function (s) { return 'क्षेत्रफल = लंबाई × चौड़ाई = ' + s.l + ' × ' + s.b + ' = ' + (s.l * s.b) + '.'; }]
    },
    'area:*:triangle': {
      s: [function (s) { return 'एक त्रिभुज का आधार ' + s.base + ' cm और ऊँचाई ' + s.h + ' cm है। इसका क्षेत्रफल = ? cm².'; }, function (s) { return 'उस त्रिभुज का क्षेत्रफल ज्ञात कीजिए जिसका आधार ' + s.base + ' cm और ऊँचाई ' + s.h + ' cm है (cm² में)।'; }],
      e: [function (s) { return 'क्षेत्रफल = ½ × आधार × ऊँचाई = ½ × ' + s.base + ' × ' + s.h + ' = ' + (s.base * s.h / 2) + ' cm². भिन्न से बचने के लिए पहले सम भुजा को आधा कीजिए।'; }]
    },
    'area:medium:parallelogram': {
      s: [function (s) { return 'एक समांतर चतुर्भुज का आधार ' + s.b + ' cm और ऊँचाई ' + s.h + ' cm है। इसका क्षेत्रफल = ? cm².'; }, function (s) { return 'आधार ' + s.b + ' cm और लंब ऊँचाई ' + s.h + ' cm वाले समांतर चतुर्भुज का क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }],
      e: [function (s) { return 'क्षेत्रफल = आधार × ऊँचाई = ' + s.b + ' × ' + s.h + ' = ' + (s.b * s.h) + ' cm². तिरछी भुजा नहीं, लंब ऊँचाई लीजिए।'; }]
    },
    'area:*:circle': {
      s: [function (s) { return s.r + ' cm त्रिज्या वाले वृत्त का क्षेत्रफल = ? cm². (π = 3.14 लीजिए)'; }, function (s) { return 'एक वृत्ताकार बगीचे की त्रिज्या ' + s.r + ' m है। इसका क्षेत्रफल m² में ज्ञात कीजिए (π = 3.14 लीजिए)।'; }],
      e: [function (s) { return 'क्षेत्रफल = πr² = 3.14 × ' + s.r + '² = 3.14 × ' + (s.r * s.r) + ' = ' + s.ans + '.'; }]
    },
    'area:hard:trapezium': {
      s: [function (s) { return 'एक समलंब चतुर्भुज की समांतर भुजाएँ ' + s.a1 + ' cm और ' + s.b1 + ' cm हैं तथा ऊँचाई ' + s.h + ' cm है। इसका क्षेत्रफल = ? cm².'; }, function (s) { return 'एक समलंब की समांतर भुजाओं की माप ' + s.a1 + ' cm और ' + s.b1 + ' cm है, और उनके बीच की दूरी ' + s.h + ' cm है। इसका क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }],
      e: [function (s) { return 'क्षेत्रफल = ½ × (समांतर भुजाओं का योग) × ऊँचाई = ½ × ' + (s.a1 + s.b1) + ' × ' + s.h + ' = ' + ((s.a1 + s.b1) * s.h / 2) + ' cm².'; }]
    },
    'area:hard:border': {
      s: [function (s) { return 'एक ' + s.L + ' cm × ' + s.B + ' cm की शीट पर ' + s.w + ' cm चौड़ाई की एकसमान सीमा है। सीमा का क्षेत्रफल = ? cm².'; }, function (s) { return 'एक ' + s.L + ' cm × ' + s.B + ' cm के फ़ोटो फ़्रेम के किनारे पर ' + s.w + ' cm चौड़ी एकसमान सीमा है। सीमा का क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }],
      e: [function (s) { return 'सीमा = बाहरी − भीतरी = ' + s.L + '×' + s.B + ' − ' + (s.L - 2 * s.w) + '×' + (s.B - 2 * s.w) + ' = ' + (s.L * s.B) + ' − ' + ((s.L - 2 * s.w) * (s.B - 2 * s.w)) + ' = ' + (s.L * s.B - (s.L - 2 * s.w) * (s.B - 2 * s.w)) + ' cm².'; }]
    },

    /* आयतन */
    'volume:easy:cube': {
      s: [function (s) { return s.s + ' cm भुजा वाले घन का आयतन = ? cm³.'; }, function (s) { return 'एक घनाकार डिब्बे की कोर ' + s.s + ' cm है। इसका आयतन ज्ञात कीजिए (cm³ में)।'; }, function (s) { return 'एक घन की प्रत्येक कोर ' + s.s + ' cm मापती है। इसका आयतन = ? cm³.'; }],
      e: [function (s) { return 'घन का आयतन = भुजा³ = ' + s.s + '³ = ' + (s.s * s.s * s.s) + ' cm³.'; }]
    },
    'volume:*:cuboid': {
      s: [function (s) { return 'एक घनाभ की माप ' + s.l + ' cm × ' + s.b + ' cm × ' + s.h + ' cm है। इसका आयतन = ? cm³.'; }, function (s) { return 'एक कार्टन ' + s.l + ' cm लंबा, ' + s.b + ' cm चौड़ा और ' + s.h + ' cm ऊँचा है। इसका आयतन ज्ञात कीजिए (cm³ में)।'; }, function (s) { return 'एक पानी की टंकी की माप ' + s.l + ' m × ' + s.b + ' m × ' + s.h + ' m है। इसकी धारिता = ? m³.'; }],
      e: [function (s) { return 'आयतन = लंबाई × चौड़ाई × ऊँचाई = ' + s.l + ' × ' + s.b + ' × ' + s.h + ' = ' + (s.l * s.b * s.h) + '.'; }]
    },
    'volume:*:cylinder': {
      s: [function (s) { return 'एक बेलन की त्रिज्या ' + s.r + ' cm और ऊँचाई ' + s.h + ' cm है। इसका आयतन = ? cm³. (π = 3.14 लीजिए)'; }, function (s) { return 'एक बेलनाकार ड्रम की आधार त्रिज्या ' + s.r + ' cm है और यह ' + s.h + ' cm ऊँचा है। इसका आयतन cm³ में ज्ञात कीजिए (π = 3.14 लीजिए)।'; }],
      e: [function (s) { return 'आयतन = πr²h = 3.14 × ' + s.r + '² × ' + s.h + ' = 3.14 × ' + (s.r * s.r * s.h) + ' = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:sphere': {
      s: [function (s) { return 'एक गोले की त्रिज्या ' + s.r + ' cm है। इसका आयतन = ? cm³. (π = 3.14 लीजिए)'; }, function (s) { return 'एक ठोस गोले की त्रिज्या ' + s.r + ' cm है; π = 3.14 लेकर इसका आयतन ज्ञात कीजिए (cm³ में)।'; }],
      e: [function (s) { return 'आयतन = (4/3)πr³ = (4/3) × 3.14 × ' + s.r + '³ = ' + s.ans + ' cm³.'; }]
    },
    'volume:hard:cone': {
      s: [function (s) { return 'एक शंकु की त्रिज्या ' + s.r + ' cm और ऊँचाई ' + s.h + ' cm है। इसका आयतन = ? cm³. (π = 3.14 लीजिए)'; }, function (s) { return 'एक आइसक्रीम शंकु की आधार त्रिज्या ' + s.r + ' cm और ऊँचाई ' + s.h + ' cm है। इसका आयतन cm³ में ज्ञात कीजिए (π = 3.14)।'; }],
      e: [function (s) { return 'आयतन = (1/3)πr²h = (1/3) × 3.14 × ' + (s.r * s.r) + ' × ' + s.h + ' = ' + s.ans + ' cm³.'; }]
    },

    /* पृष्ठीय क्षेत्रफल */
    'surface-area:easy:cubeTSA': {
      s: [function (s) { return s.a + ' cm भुजा वाले घन का संपूर्ण पृष्ठीय क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }, function (s) { return 'एक घनाकार डिब्बे की कोर ' + s.a + ' cm है। इसके सभी फलकों को ढकने के लिए रँगा जाने वाला कुल क्षेत्रफल = ? cm²'; }],
      e: [function (s) { return 'घन का संपूर्ण पृष्ठीय क्षेत्रफल = 6a² = 6 × ' + s.a + '² = 6 × ' + (s.a * s.a) + ' = ' + (6 * s.a * s.a) + ' cm².'; }]
    },
    'surface-area:medium:cubeLSA': {
      s: [function (s) { return s.a + ' cm भुजा वाले घन का पार्श्व (साइड) पृष्ठीय क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }],
      e: [function (s) { return 'घन का पार्श्व पृष्ठीय क्षेत्रफल = 4a² (चार पार्श्व फलक) = 4 × ' + (s.a * s.a) + ' = ' + (4 * s.a * s.a) + ' cm².'; }]
    },
    'surface-area:*:cuboidTSA': {
      s: [function (s) { return 'एक घनाभ ' + s.l + ' × ' + s.b + ' × ' + s.h + ' cm का संपूर्ण पृष्ठीय क्षेत्रफल ज्ञात कीजिए (cm² में)।'; }],
      e: [function (s) { return 'संपूर्ण पृष्ठीय क्षेत्रफल = 2(lb + bh + hl) = 2(' + (s.l * s.b) + ' + ' + (s.b * s.h) + ' + ' + (s.l * s.h) + ') = ' + (2 * (s.l * s.b + s.b * s.h + s.l * s.h)) + ' cm².'; }]
    },
    'surface-area:medium:cylCSA': {
      s: [function (s) { return s.r + ' cm त्रिज्या और ' + s.h + ' cm ऊँचाई वाले बेलन का वक्र पृष्ठीय क्षेत्रफल ज्ञात कीजिए (π = 3.14 लीजिए)।'; }],
      e: [function (s) { return 'वक्र पृष्ठीय क्षेत्रफल = 2πrh = 2 × 3.14 × ' + s.r + ' × ' + s.h + ' = ' + s.ans + ' cm².'; }]
    },
    'surface-area:hard:cylTSA': {
      s: [function (s) { return s.r + ' cm त्रिज्या और ' + s.h + ' cm ऊँचाई वाले बेलन का संपूर्ण पृष्ठीय क्षेत्रफल ज्ञात कीजिए (π = 3.14 लीजिए)।'; }],
      e: [function (s) { return 'संपूर्ण पृष्ठीय क्षेत्रफल = 2πr(r + h) = 2 × 3.14 × ' + s.r + ' × (' + s.r + ' + ' + s.h + ') = ' + s.ans + ' cm².'; }]
    },
    'surface-area:hard:sphereSA': {
      s: [function (s) { return s.r + ' cm त्रिज्या वाले गोले का पृष्ठीय क्षेत्रफल ज्ञात कीजिए (π = 3.14 लीजिए)।'; }, function (s) { return 'एक गोलाकार गेंद की त्रिज्या ' + s.r + ' cm है। π = 3.14 लेकर इसका पृष्ठीय क्षेत्रफल = ? cm²'; }],
      e: [function (s) { return 'पृष्ठीय क्षेत्रफल = 4πr² = 4 × 3.14 × ' + s.r + '² = ' + s.ans + ' cm².'; }]
    },

    /* ── Batch 3: प्रतिशत, औसत, लाभ-हानि (commercial arithmetic; ₹/% verbatim; formula lines keep CP/SP/N Latin) ── */

    /* प्रतिशत ("x% of y" → "y का x%") */
    'percentages:*:directOf': {
      s: [function (s) { return s.b + ' का ' + s.p + '% = ?'; }, function (s) { return s.b + ' का ' + s.p + '% ज्ञात कीजिए।'; }, function (s) { return s.b + ' का ' + s.p + '% कौन-सी संख्या है?'; }],
      e: [function (s) { return s.b + ' का ' + s.p + '% = ' + s.p + ' × ' + s.b + ' ÷ 100 = ' + s.r + '. संकेत: ' + s.b + ' का ' + s.p + '% = ' + s.p + ' का ' + s.b + '% — जब एक पक्ष अधिक गोल हो तो अदल-बदल कर लीजिए।'; }]
    },
    'percentages:medium:reverse': {
      s: [function (s) { return 'किस संख्या का ' + s.p + '%, ' + s.r + ' है?'; }],
      e: [function (s) { return 'यदि किसी संख्या N का ' + s.p + '% = ' + s.r + ', तो N = ' + s.r + ' × 100 ÷ ' + s.p + ' = ' + s.b + '.'; }]
    },
    'percentages:medium:whatPct': {
      s: [function (s) { return s.b + ' का कितना प्रतिशत ' + s.y + ' है?'; }],
      e: [function (s) { return s.b + ' में से ' + s.y + ' = (' + s.y + ' ÷ ' + s.b + ') × 100 = ' + s.p + '%.'; }]
    },
    'percentages:hard:pctChange': {
      s: [function (s) { return 'एक मान ' + s.old + ' से बढ़कर ' + s.nw + ' हो जाता है। प्रतिशत वृद्धि = ? %'; }],
      e: [function (s) { return 'प्रतिशत वृद्धि = (नया − पुराना)/पुराना × 100 = (' + s.nw + ' − ' + s.old + ')/' + s.old + ' × 100 = ' + ((s.nw - s.old) * 100 / s.old) + '%. सदैव मूल मान से भाग दीजिए।'; }]
    },
    'percentages:hard:successive': {
      s: [function (s) { return '₹' + s.base + ' की एक वस्तु पर ' + s.d1 + '% और ' + s.d2 + '% के क्रमिक बट्टे दिए जाते हैं। अंतिम मूल्य = ₹?'; }],
      e: [function (s) { return 'क्रम से लगाइए: ' + s.base + ' × ' + (1 - s.d1 / 100) + ' × ' + (1 - s.d2 / 100) + ' = ' + s.f + '. एकल तुल्य = ' + s.d1 + '+' + s.d2 + '−(' + s.d1 + '×' + s.d2 + ')/100 = ' + (s.d1 + s.d2 - s.d1 * s.d2 / 100) + '%.'; }]
    },
    'percentages:hard:netTrap': {
      s: [function (s) { return 'किसी वेतन को ' + s.x + '% बढ़ाया जाता है और फिर ' + s.x + '% घटाया जाता है। कुल मिलाकर यह ? % गिर जाता है।'; }],
      e: [function (s) { return 'समान +' + s.x + '% फिर −' + s.x + '% कभी रद्द नहीं होते — कुल गिरावट = x²/100 = ' + s.x + '²/100 = ' + (s.x * s.x / 100) + '%. यह चक्रवृद्धि होती है, केवल जोड़ नहीं।'; }]
    },

    /* औसत */
    'averages:*:mean': {
      s: [function (s) { return s.nums.join(', ') + ' का औसत = ?'; }, function (s) { return s.nums.join(', ') + ' का माध्य ज्ञात कीजिए।'; }, function (s) { return s.nums.join(', ') + ' का औसत क्या है?'; }],
      e: [function (s) { return 'औसत = योग ÷ संख्या = ' + s.nums.reduce(function (x, y) { return x + y; }, 0) + ' ÷ ' + s.count + ' = ' + s.avg + '.'; }]
    },
    'averages:medium:missing': {
      s: [function (s) { return s.known.join(', ') + ' और x का औसत ' + s.avg + ' है। x = ?'; }],
      e: [function (s) { return 'आवश्यक कुल = औसत × संख्या = ' + s.avg + ' × ' + s.count + ' = ' + (s.avg * s.count) + '. x = ' + (s.avg * s.count) + ' − ' + s.sum + ' = ' + s.x + '.'; }]
    },
    'averages:hard:weighted': {
      s: [function (s) { return s.m + ' लड़कों का औसत भार ' + s.a + ' kg है और ' + s.n + ' लड़कियों का ' + s.b + ' kg। पूरे समूह का औसत भार = ? kg'; }],
      e: [function (s) { return 'भारित माध्य = (दोनों समूहों का कुल) ÷ (कुल संख्या) = (' + s.m + '×' + s.a + ' + ' + s.n + '×' + s.b + ') ÷ (' + s.m + '+' + s.n + ') = ' + (s.m * s.a + s.n * s.b) + ' ÷ ' + (s.m + s.n) + ' = ' + s.ov + '.'; }]
    },
    'averages:hard:newMember': {
      s: [function (s) { return s.n + ' संख्याओं का औसत ' + s.A + ' है। एक और संख्या जोड़ने पर औसत ' + s.B + ' हो जाता है। नई संख्या = ?'; }],
      e: [function (s) { return 'नई संख्या = नया कुल − पुराना कुल = ' + s.B + '×' + (s.n + 1) + ' − ' + s.A + '×' + s.n + ' = ' + (s.B * (s.n + 1)) + ' − ' + (s.A * s.n) + ' = ' + s.x + '.'; }]
    },

    /* लाभ और हानि (stems Hindi; formula lines keep SP/CP Latin per glossary) */
    'profit-loss:*:spProfit': {
      s: [function (s) { return 'क्रय मूल्य ₹' + s.cp + ' है और लाभ ' + s.pr + '% है। विक्रय मूल्य = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 + लाभ%) = ' + s.cp + ' × ' + (1 + s.pr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:*:spLoss': {
      s: [function (s) { return 'क्रय मूल्य ₹' + s.cp + ' है और हानि ' + s.lr + '% है। विक्रय मूल्य = ₹?'; }],
      e: [function (s) { return 'SP = CP × (1 − हानि%) = ' + s.cp + ' × ' + (1 - s.lr / 100) + ' = ₹' + s.sp + '.'; }]
    },
    'profit-loss:*:profitPct': {
      s: [function (s) { return '₹' + s.cp + ' में खरीदी गई एक वस्तु ₹' + s.sp + ' में बेची जाती है। लाभ प्रतिशत = ?'; }],
      e: [function (s) { return 'लाभ% = (SP − CP)/CP × 100 = (' + s.sp + ' − ' + s.cp + ')/' + s.cp + ' × 100 = ' + s.pr + '%. आधार सदैव क्रय मूल्य होता है।'; }]
    },
    'profit-loss:hard:findCP': {
      s: [function (s) { return 'एक वस्तु को ₹' + s.sp + ' में बेचकर एक दुकानदार ' + s.pr + '% लाभ कमाता है। क्रय मूल्य = ₹?'; }],
      e: [function (s) { return 'CP = SP ÷ (1 + लाभ%) = ' + s.sp + ' ÷ ' + (1 + s.pr / 100) + ' = ₹' + s.cp + '.'; }]
    },
    'profit-loss:hard:successive': {
      s: [function (s) { return '₹' + s.cp + ' लागत वाली एक वस्तु ' + s.p0 + '% लाभ पर बेची जाती है, और फिर उस मूल्य को ' + s.p1 + '% और बढ़ा दिया जाता है। अंतिम विक्रय मूल्य = ₹?'; }],
      e: [function (s) { return 'गुणकों को श्रृंखलाबद्ध कीजिए: ' + s.cp + ' × ' + (1 + s.p0 / 100) + ' × ' + (1 + s.p1 / 100) + ' = ₹' + s.sp + '.'; }]
    },

    /* ── Batch 4: अनुपात (+RAT_PCT pool), साधारण ब्याज, चक्रवृद्धि ब्याज (names via .hi; SI/CI/P/R/T Latin in formulas) ── */

    /* अनुपात और समानुपात */
    'ratios:*:divide': {
      s: [function (s) { return '₹' + s.total + ' को ' + s.nm[0].hi + ' और ' + s.nm[1].hi + ' के बीच ' + s.p0 + ' : ' + s.p1 + ' के अनुपात में बाँटा जाता है। ' + s.nm[0].hi + ' को ₹? मिलते हैं।'; }],
      e: [function (s) { return 'कुल भाग = ' + s.p0 + ' + ' + s.p1 + ' = ' + s.parts + '. एक भाग = ' + s.total + ' ÷ ' + s.parts + ' = ' + (s.total / s.parts) + '. ' + s.nm[0].hi + ' = ' + s.p0 + ' × ' + (s.total / s.parts) + ' = ' + (s.total * s.p0 / s.parts) + '.'; }]
    },
    'ratios:*:findTerm': {
      s: [function (s) { return 'A : B = ' + s.p0 + ' : ' + s.p1 + ' और A = ' + s.aVal + '. B = ?'; }],
      e: [function (s) { return 'एक भाग = A ÷ ' + s.p0 + ' = ' + s.aVal + ' ÷ ' + s.p0 + ' = ' + s.one + '. B = ' + s.p1 + ' × ' + s.one + ' = ' + s.bVal + '.'; }]
    },
    'ratios:hard:combine': {
      s: [function (s) { return 'A : B = ' + s.ab0 + ' : ' + s.ab1 + ' और B : C = ' + s.bc0 + ' : ' + s.bc1 + '. A : C = ?'; }],
      e: [function (s) { return 'B उभयनिष्ठ है (' + s.ab1 + '=' + s.bc0 + '), इसलिए A : C = ' + s.ab0 + ' : ' + s.bc1 + ' = ' + (s.ab0 / s.g) + ' : ' + (s.bc1 / s.g) + ', ' + s.g + ' से भाग देने पर।'; }]
    },
    'ratios:*:pctRatio': {
      s: [function (s) { return 'A, B से ' + RAT_PCT_POOL[s.idx][0] + ' है। A : B = ?'; }],
      e: [function (s) { return 'A को B के भिन्न के रूप में लिखिए: "' + RAT_PCT_POOL[s.idx][0] + '" → A/B = ' + s.ratio.replace(':', '/') + ', इसलिए A : B = ' + s.ratio + ' निम्नतम पदों में।'; }]
    },

    /* साधारण ब्याज (person names via .hi; SI/P/R/T Latin in formula) */
    'simple-interest:*:si': {
      s: [function (s) { return '₹' + s.P + ' पर ' + s.R + '% प्रति वर्ष की दर से ' + s.T + ' वर्षों का साधारण ब्याज ज्ञात कीजिए।'; }, function (s) { return s.nm.hi + ' किसी योजना में ₹' + s.P + ' जमा करते हैं जो ' + s.R + '% प्रति वर्ष साधारण ब्याज देती है। ' + s.T + ' वर्षों में अर्जित ब्याज = ₹?'; }, function (s) { return '₹' + s.P + ' पर ' + s.R + '% प्रति वर्ष की दर से ' + s.T + ' वर्षों में कितना साधारण ब्याज मिलेगा?'; }],
      e: [function (s) { return 'SI = P × R × T ÷ 100 = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '.'; }]
    },
    'simple-interest:*:amount': {
      s: [function (s) { return '₹' + s.P + ' की राशि ' + s.R + '% प्रति वर्ष साधारण ब्याज पर उधार दी जाती है। ' + s.T + ' वर्षों बाद मिश्रधन = ₹?'; }, function (s) { return s.nm.hi + ' ' + s.R + '% प्रति वर्ष साधारण ब्याज पर ₹' + s.P + ' उधार लेते हैं। ' + s.T + ' वर्षों बाद कितना लौटाना होगा (₹ में)?'; }],
      e: [function (s) { return 'SI = ' + s.P + ' × ' + s.R + ' × ' + s.T + ' ÷ 100 = ₹' + s.si + '; मिश्रधन = P + SI = ' + s.P + ' + ' + s.si + ' = ₹' + (s.P + s.si) + '.'; }]
    },
    'simple-interest:*:findRate': {
      s: [function (s) { return 'किस वार्षिक दर प्रतिशत पर ₹' + s.P + ', ' + s.T + ' वर्षों में ₹' + s.si + ' साधारण ब्याज देता है?'; }, function (s) { return '₹' + s.P + ' की राशि ' + s.T + ' वर्षों में ₹' + s.si + ' साधारण ब्याज अर्जित करती है। वार्षिक दर = ? %'; }],
      e: [function (s) { return 'R = SI × 100 ÷ (P × T) = ' + s.si + ' × 100 ÷ (' + s.P + ' × ' + s.T + ') = ' + s.R + '%.'; }]
    },
    'simple-interest:hard:findPrincipal': {
      s: [function (s) { return 'कोई राशि ' + s.R + '% प्रति वर्ष की दर से ' + s.T + ' वर्षों में ₹' + s.si + ' साधारण ब्याज अर्जित करती है। राशि ज्ञात कीजिए।'; }, function (s) { return 'कौन-सा मूलधन ' + s.R + '% प्रति वर्ष की दर से ' + s.T + ' वर्षों में ₹' + s.si + ' साधारण ब्याज देता है?'; }],
      e: [function (s) { return 'P = SI × 100 ÷ (R × T) = ' + s.si + ' × 100 ÷ (' + s.R + ' × ' + s.T + ') = ₹' + s.P + '.'; }]
    },

    /* चक्रवृद्धि ब्याज */
    'compound-interest:*:amount': {
      s: [function (s) { return '₹' + s.P + ' पर ' + s.R + '% प्रति वर्ष की दर से ' + s.T + ' वर्षों के लिए वार्षिक चक्रवृद्धि पर मिश्रधन ज्ञात कीजिए।'; }, function (s) { return s.nm.hi + ' ₹' + s.P + ' को ' + s.R + '% प्रति वर्ष की दर पर, वार्षिक चक्रवृद्धि के साथ निवेश करते हैं। ' + s.T + ' वर्षों बाद मिश्रधन = ₹?'; }],
      e: [function (s) { return 'A = P(1 + R/100)ᵀ = ' + s.P + ' × ' + (1 + s.R / 100) + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '.'; }]
    },
    'compound-interest:*:ci': {
      s: [function (s) { return '₹' + s.P + ' पर ' + s.R + '% प्रति वर्ष की दर से ' + s.T + ' वर्षों का चक्रवृद्धि ब्याज ज्ञात कीजिए, जो वार्षिक रूप से चक्रवृद्धि होता है।'; }, function (s) { return '₹' + s.P + ' का ऋण ' + s.R + '% प्रति वर्ष की दर पर, वार्षिक चक्रवृद्धि के साथ लिया जाता है। ' + s.T + ' वर्षों बाद देय चक्रवृद्धि ब्याज = ₹?'; }],
      e: [function (s) { return 'A = ' + s.P + '(1 + ' + s.R + '/100)' + (s.T === 2 ? '²' : '³') + ' = ₹' + s.A + '; CI = A − P = ' + s.A + ' − ' + s.P + ' = ₹' + (s.A - s.P) + '.'; }]
    },
    'compound-interest:hard:ciSiDiff': {
      s: [function (s) { return '₹' + s.P + ' पर ' + s.R + '% प्रति वर्ष की दर से 2 वर्षों के लिए चक्रवृद्धि ब्याज और साधारण ब्याज का अंतर = ₹?'; }],
      e: [function (s) { return '2 वर्षों के लिए, CI − SI = P(R/100)² = ' + s.P + ' × (' + s.R + '/100)² = ₹' + s.d + '.'; }]
    },

    /* ── Batch 5: समय-चाल-दूरी, समय-कार्य, संख्या श्रेढ़ी, नल-टंकी, आयु, साझेदारी (names via .hi; units km/h·m/s stay) ── */

    /* समय, चाल और दूरी */
    'time-speed-distance:*:distance': {
      s: [function (s) { return 'एक कार ' + s.sp + ' km/h की चाल से ' + s.t + ' घंटे चलती है। तय की गई दूरी = ? km'; }, function (s) { return s.sp + ' km/h की चाल से ' + s.t + ' घंटे चलते हुए एक रेलगाड़ी ? km तय करती है'; }, function (s) { return 'लगातार ' + s.sp + ' km/h की चाल से ' + s.t + ' घंटे में दूरी = ? km'; }],
      e: [function (s) { return 'दूरी = चाल × समय = ' + s.sp + ' × ' + s.t + ' = ' + (s.sp * s.t) + ' km.'; }]
    },
    'time-speed-distance:*:time': {
      s: [function (s) { return 'एक कार ' + s.d + ' km की दूरी ' + s.sp + ' km/h की चाल से तय करती है। लगा समय = ? घंटे'; }, function (s) { return s.sp + ' km/h की चाल से ' + s.d + ' km तय करने में लगा समय = ? घंटे'; }, function (s) { return s.d + ' km को ' + s.sp + ' km/h की चाल से तय करने में ? घंटे लगते हैं'; }],
      e: [function (s) { return 'समय = दूरी ÷ चाल = ' + s.d + ' ÷ ' + s.sp + ' = ' + s.t + ' घंटे।'; }]
    },
    'time-speed-distance:*:speed': {
      s: [function (s) { return 'एक रेलगाड़ी ' + s.d + ' km, ' + s.t + ' घंटे में तय करती है। इसकी चाल = ? km/h'; }, function (s) { return s.d + ' km को ' + s.t + ' घंटे में तय करते हुए, चाल = ? km/h'; }, function (s) { return 'एक बस ' + s.d + ' km, ' + s.t + ' घंटे में चलती है। औसत चाल = ? km/h'; }],
      e: [function (s) { return 'चाल = दूरी ÷ समय = ' + s.d + ' ÷ ' + s.t + ' = ' + s.sp + ' km/h.'; }]
    },
    'time-speed-distance:medium:unitConvert': {
      s: [function (s) { return s.x + ' km/h को मीटर प्रति सेकंड में व्यक्त कीजिए।'; }, function (s) { return 'एक रेलगाड़ी ' + s.x + ' km/h से चलती है। इसकी चाल m/s में = ?'; }, function (s) { return s.x + ' m/s को km/h में व्यक्त कीजिए।'; }, function (s) { return 'एक धावक ' + s.x + ' m/s से दौड़ता है। वह चाल km/h में = ?'; }],
      e: [function (s) { return 'km/h → m/s: 5/18 से गुणा कीजिए। ' + s.x + ' × 5/18 = ' + s.ans + ' m/s.'; }, function (s) { return 'km/h → m/s: 5/18 से गुणा कीजिए। ' + s.x + ' × 5/18 = ' + s.ans + ' m/s.'; }, function (s) { return 'm/s → km/h: 18/5 से गुणा कीजिए। ' + s.x + ' × 18/5 = ' + s.ans + ' km/h.'; }, function (s) { return 'm/s → km/h: 18/5 से गुणा कीजिए। ' + s.x + ' × 18/5 = ' + s.ans + ' km/h.'; }]
    },
    'time-speed-distance:hard:avgSpeed': {
      s: [function (s) { return 'एक व्यक्ति समान दूरियाँ ' + s.s1 + ' km/h और ' + s.s2 + ' km/h की चाल से तय करता है। पूरी यात्रा की औसत चाल = ? km/h'; }],
      e: [function (s) { return 'समान दूरियों के लिए, औसत चाल = 2·s₁·s₂/(s₁+s₂) = 2×' + s.s1 + '×' + s.s2 + '/(' + s.s1 + '+' + s.s2 + ') = ' + s.ans + ' km/h — हरात्मक माध्य, कभी सरल औसत नहीं।'; }]
    },
    'time-speed-distance:hard:relativeSpeed': {
      s: [function (s) { return 'दो रेलगाड़ियाँ ' + s.d + ' km की दूरी पर एक-दूसरे की ओर ' + s.s1 + ' km/h और ' + s.s2 + ' km/h की चाल से चलती हैं। कितने घंटों बाद वे मिलती हैं?'; }, function (s) { return 'दो कारें ' + s.d + ' km की दूरी पर एक-दूसरे की ओर ' + s.s1 + ' km/h और ' + s.s2 + ' km/h से चलती हैं। वे ? घंटों बाद मिलती हैं'; }],
      e: [function (s) { return 'एक-दूसरे की ओर चलते हुए चालें जुड़ती हैं: सापेक्ष चाल = ' + s.s1 + ' + ' + s.s2 + ' = ' + (s.s1 + s.s2) + ' km/h. समय = ' + s.d + ' ÷ ' + (s.s1 + s.s2) + ' = ' + s.t + ' घंटे।'; }]
    },
    'time-speed-distance:hard:trainCrossing': {
      s: [function (s) { return 'एक ' + s.len + ' m लंबी रेलगाड़ी ' + s.spd + ' km/h से चल रही है। एक खंभे को पार करने में कितने सेकंड लगते हैं?'; }, function (s) { return 'एक ' + s.len2 + ' m लंबी रेलगाड़ी ' + s.spd + ' km/h से चलते हुए ' + s.plat + ' m लंबे प्लेटफ़ॉर्म को ? सेकंड में पार करती है'; }],
      e: [function (s) { return 'चाल बदलिए: ' + s.spd + ' km/h = ' + s.ms + ' m/s. खंभा पार करने का अर्थ है अपनी ही लंबाई तय करना: ' + s.len + ' ÷ ' + s.ms + ' = ' + s.t + ' s.'; }, function (s) { return 'चाल = ' + s.spd + ' km/h = ' + s.ms + ' m/s. प्लेटफ़ॉर्म पार करने के लिए रेलगाड़ी, गाड़ी + प्लेटफ़ॉर्म = ' + s.len2 + ' + ' + s.plat + ' = ' + (s.len2 + s.plat) + ' m तय करती है। समय = ' + (s.len2 + s.plat) + ' ÷ ' + s.ms + ' = ' + s.t + ' s.'; }]
    },

    /* समय और कार्य */
    'time-and-work:*:together': {
      s: [function (s) { return 'A किसी कार्य को ' + s.a + ' दिनों में और B, ' + s.b + ' दिनों में कर सकता है। मिलकर काम करते हुए वे इसे ? दिनों में पूरा करते हैं'; }],
      e: [function (s) { return 'मिलकर लगने वाला समय = (a × b)/(a + b) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + (s.a * s.b) + '/' + (s.a + s.b) + ' = ' + ((s.a * s.b) / (s.a + s.b)) + ' दिन। दरें जोड़िए (1/a + 1/b), दिन कभी नहीं।'; }]
    },
    'time-and-work:*:workDone': {
      s: [function (s) { return 'A किसी काम को ' + s.days + ' दिनों में पूरा कर सकता है। ' + s.wd + ' दिनों में वह काम का ? % पूरा करता है।'; }],
      e: [function (s) { return 'किया गया अंश = ' + s.wd + '/' + s.days + ', अतः ' + s.wd + '/' + s.days + ' × 100 = ' + (s.wd * 100 / s.days) + '%.'; }]
    },
    'time-and-work:*:workersScale': {
      s: [function (s) { return 'यदि ' + s.w1 + ' श्रमिक किसी कार्य को ' + s.dp + ' दिनों में पूरा करते हैं, तो ' + s.w2 + ' श्रमिक उसी कार्य को ? दिनों में पूरा करेंगे'; }],
      e: [function (s) { return 'कुल कार्य = ' + s.w1 + ' × ' + s.dp + ' = ' + s.tot + ' श्रमिक-दिन। ' + s.w2 + ' श्रमिकों के लिए समय = ' + s.tot + ' ÷ ' + s.w2 + ' = ' + (s.tot / s.w2) + ' दिन (श्रमिक और दिन व्युत्क्रमानुपाती होते हैं)।'; }]
    },
    'time-and-work:hard:inverseTogether': {
      s: [function (s) { return s.nm[0].hi + ' और ' + s.nm[1].hi + ' मिलकर किसी कार्य को ' + s.T + ' दिनों में पूरा कर सकते हैं। ' + s.nm[0].hi + ' अकेला इसे ' + s.a + ' दिनों में कर सकता है। ' + s.nm[1].hi + ' अकेला इसे कितने दिनों में पूरा करेगा?'; }],
      e: [function (s) { return 'दरों से हल कीजिए: 1/' + s.nm[1].hi + ' = 1/' + s.T + ' − 1/' + s.a + ' = (' + s.a + ' − ' + s.T + ')/(' + s.a + '×' + s.T + ') = ' + (s.a - s.T) + '/' + (s.a * s.T) + '. अतः ' + s.nm[1].hi + ' अकेला = ' + (s.a * s.T) + '/' + (s.a - s.T) + ' = ' + s.b + ' दिन।'; }]
    },

    /* संख्या श्रेढ़ी */
    'number-series:*:arithmetic': {
      s: [function (s) { return 'अगली संख्या ज्ञात कीजिए: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return s.step + ' का अचर अंतर (समांतर श्रेढ़ी): ' + s.terms[s.terms.length - 1] + ' + ' + s.step + ' = ' + s.ans + '.'; }]
    },
    'number-series:*:geometric': {
      s: [function (s) { return 'अगली संख्या ज्ञात कीजिए: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'प्रत्येक पद × ' + s.r + ' (गुणोत्तर श्रेढ़ी): ' + s.terms[s.terms.length - 1] + ' × ' + s.r + ' = ' + s.ans + '.'; }]
    },
    'number-series:*:growingGap': {
      s: [function (s) { return 'अगली संख्या ज्ञात कीजिए: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'प्रत्येक चरण में अंतर ' + s.base + ' से बढ़ता है (अचर द्वितीय अंतर): अगला अंतर ' + s.gap + ' है, अतः ' + s.terms[s.terms.length - 1] + ' + ' + s.gap + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:squaresSeries': {
      s: [function (s) { return 'अगली संख्या ज्ञात कीजिए: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'प्रत्येक पद एक पूर्ण वर्ग ' + (s.k >= 0 ? 'जमा ' + s.k : 'घटा ' + Math.abs(s.k)) + ': ' + s.terms.map(function (v, i) { return (s.s + i) + '²' + (s.k >= 0 ? '+' + s.k : '−' + Math.abs(s.k)); }).join(', ') + '. अगला = ' + (s.s + 4) + '²' + (s.k >= 0 ? '+' + s.k : '−' + Math.abs(s.k)) + ' = ' + s.ans + '.'; }]
    },
    'number-series:hard:alternating': {
      s: [function (s) { return 'अगली संख्या ज्ञात कीजिए: ' + s.terms.join(', ') + ', ?'; }],
      e: [function (s) { return 'दो श्रेढ़ियाँ अंतर्निहित हैं: विषम स्थानों पर ' + s.a0 + ', ' + (s.a0 + s.d1) + ', ' + (s.a0 + 2 * s.d1) + ', … (+' + s.d1 + ') और सम स्थान अपनी अलग श्रृंखला बनाते हैं। अगला पद पहली श्रृंखला को जारी रखता है: ' + (s.a0 + 2 * s.d1) + ' + ' + s.d1 + ' = ' + s.ans + '.'; }]
    },

    /* नल और टंकी */
    'pipes-cisterns:*:together': {
      s: [function (s) { return 'नल A किसी टंकी को ' + s.a + ' घंटे में और नल B इसे ' + s.b + ' घंटे में भरता है। यदि दोनों एक साथ खोले जाएँ, तो टंकी ? घंटे में भर जाती है'; }],
      e: [function (s) { return 'संयुक्त समय = (A × B)/(A + B) = (' + s.a + ' × ' + s.b + ')/(' + s.a + ' + ' + s.b + ') = ' + ((s.a * s.b) / (s.a + s.b)) + ' घंटे — दरें जोड़िए 1/' + s.a + ' + 1/' + s.b + '.'; }]
    },
    'pipes-cisterns:*:netFill': {
      s: [function (s) { return 'एक प्रवेश नल किसी टंकी को ' + s.a + ' घंटे में भरता है जबकि एक निकास नल इसे ' + s.b + ' घंटे में खाली करता है। यदि दोनों एक साथ खोले जाएँ, तो टंकी ? घंटे में भरती है'; }],
      e: [function (s) { return 'शुद्ध दर = 1/' + s.a + ' − 1/' + s.b + '; समय = (A × B)/(B − A) = (' + s.a + ' × ' + s.b + ')/(' + s.b + ' − ' + s.a + ') = ' + ((s.a * s.b) / (s.b - s.a)) + ' घंटे।'; }]
    },
    'pipes-cisterns:hard:inverseFill': {
      s: [function (s) { return 'दो नल मिलकर किसी टंकी को ' + s.tog + ' घंटे में भरते हैं। यदि पहला नल अकेला इसे ' + s.a + ' घंटे में भरता है, तो दूसरा नल अकेला इसे ? घंटे में भरेगा'; }],
      e: [function (s) { return 'दरें घटाइए: 1/दूसरा = 1/' + s.tog + ' − 1/' + s.a + ' = ' + (s.a - s.tog) + '/' + (s.a * s.tog) + ', अतः दूसरा नल अकेला ' + s.b + ' घंटे लेता है।'; }]
    },
    'pipes-cisterns:hard:leakEmpty': {
      s: [function (s) { return 'नल A और B किसी टंकी को क्रमशः ' + s.a + ' और ' + s.b + ' घंटे में भरते हैं, जबकि नल C इसे ' + s.c + ' घंटे में खाली करता है। तीनों खुले होने पर टंकी ? घंटे में भरती है'; }],
      e: [function (s) { return 'शुद्ध दर = 1/' + s.a + ' + 1/' + s.b + ' − 1/' + s.c + '. एक LCM-आकार की टंकी पर यह ' + s.den + ' इकाई/घंटा है, ' + s.num + ' इकाइयों के लिए, अतः समय = ' + (s.num / s.den) + ' घंटे।'; }]
    },

    /* आयु संबंधी प्रश्न */
    'ages:*:ratioSum': {
      s: [function (s) { return s.nm[0].hi + ' और ' + s.nm[1].hi + ' की वर्तमान आयु ' + s.p0 + ' : ' + s.p1 + ' के अनुपात में है। यदि उनकी आयु का योग ' + s.S + ' वर्ष है, तो ' + s.nm[0].hi + ' की वर्तमान आयु = ? वर्ष'; }],
      e: [function (s) { return 'मान लीजिए आयु ' + s.p0 + 'x और ' + s.p1 + 'x हैं। तब (' + s.p0 + ' + ' + s.p1 + ')x = ' + s.S + ' → x = ' + s.k + '. ' + s.nm[0].hi + ' = ' + s.p0 + 'x = ' + (s.p0 * s.k) + ' वर्ष।'; }]
    },
    'ages:easy:presentAge': {
      s: [function (s) { return s.t + ' वर्ष पहले, ' + s.nm.hi + ' ' + s.a + ' वर्ष के थे। ' + s.nm.hi + ' की वर्तमान आयु = ? वर्ष'; }],
      e: [function (s) { return 'वर्तमान आयु = तब की आयु + बीता समय = ' + s.a + ' + ' + s.t + ' = ' + (s.a + s.t) + ' वर्ष। (समय में आगे बढ़ने पर जोड़ते हैं; "पहले" का अर्थ है वापस जोड़ना।)'; }]
    },
    'ages:*:ageDiff': {
      s: [function (s) { return s.nm[0].hi + ', ' + s.nm[1].hi + ' से ' + s.x + ' वर्ष बड़े हैं। ' + s.t + ' वर्षों में, ' + s.nm[0].hi + ', ' + s.nm[1].hi + ' से ' + s.mult + ' गुना उम्र के हो जाएँगे। ' + s.nm[1].hi + ' की वर्तमान आयु = ? वर्ष'; }],
      e: [function (s) { return s.nm[0].hi + ' = ' + s.nm[1].hi + ' + ' + s.x + '. ' + s.t + ' वर्षों में: (' + s.nm[1].hi + ' + ' + s.x + ' + ' + s.t + ') = ' + s.mult + '(' + s.nm[1].hi + ' + ' + s.t + ') → ' + s.nm[1].hi + ' = ' + s.B + ' वर्ष।'; }]
    },
    'ages:hard:fatherSon': {
      s: [function (s) { return 'एक पिता इस समय अपने पुत्र से ' + s.n + ' गुना उम्र का है। ' + s.t + ' वर्षों में वह अपने पुत्र से ' + s.m + ' गुना उम्र का हो जाएगा। पुत्र की वर्तमान आयु = ? वर्ष'; }],
      e: [function (s) { return 'मान लीजिए पुत्र = s, पिता = ' + s.n + 's. ' + s.t + ' वर्षों में: ' + s.n + 's + ' + s.t + ' = ' + s.m + '(s + ' + s.t + ') → s = ' + s.t + '(' + s.m + '−1)/(' + s.n + '−' + s.m + ') = ' + s.sn + ' वर्ष।'; }]
    },

    /* साझेदारी */
    'partnership:easy:shareRatio': {
      s: [function (s) { return s.nm[0].hi + ' और ' + s.nm[1].hi + ' किसी व्यवसाय में क्रमशः ₹' + s.x + ' और ₹' + s.y + ' निवेश करते हैं। वार्षिक लाभ को उनके बीच किस अनुपात में बाँटा जाना चाहिए?'; }],
      e: [function (s) { return 'लाभ सदैव निवेशित पूँजियों के अनुपात में बाँटा जाता है। ' + s.x + ' : ' + s.y + ', दोनों को उनके म.स.प. ' + s.g + ' से भाग देने पर, ' + (s.x / s.g) + ' : ' + (s.y / s.g) + ' प्राप्त होता है।'; }]
    },
    'partnership:*:share2': {
      s: [function (s) { return s.nm[0].hi + ' और ' + s.nm[1].hi + ' क्रमशः ₹' + s.x + ' और ₹' + s.y + ' निवेश करके एक व्यवसाय शुरू करते हैं। ₹' + s.profit + ' के कुल लाभ में से ' + s.nm[0].hi + ' का हिस्सा = ₹?'; }],
      e: [function (s) { return 'लाभ निवेशों के अनुपात ' + s.x + ' : ' + s.y + ' में बाँटा जाता है। ' + s.nm[0].hi + ' का हिस्सा = ' + s.x + '/(' + s.x + '+' + s.y + ') × ' + s.profit + ' = ₹' + s.share + '.'; }]
    },
    'partnership:*:shareTime': {
      s: [function (s) { return s.nm[0].hi + ' ₹' + s.x + ' को ' + s.m + ' महीनों के लिए और ' + s.nm[1].hi + ' ₹' + s.y + ' को ' + s.n + ' महीनों के लिए निवेश करते हैं। ₹' + s.profit + ' के लाभ में से ' + s.nm[0].hi + ' का हिस्सा = ₹?'; }],
      e: [function (s) { return 'प्रत्येक साझेदार को पूँजी × समय से भारित कीजिए: ' + s.nm[0].hi + ' = ' + s.x + '×' + s.m + ' = ' + s.cx + ', ' + s.nm[1].hi + ' = ' + s.y + '×' + s.n + ' = ' + s.cy + '. ' + s.nm[0].hi + ' का हिस्सा = ' + s.cx + '/(' + s.cx + '+' + s.cy + ') × ' + s.profit + ' = ₹' + s.share + '.'; }]
    },

    /* ── Batch 6: संख्या पद्धति, रैखिक/द्विघात समीकरण, करणी-घातांक, लघुगणक, श्रेढ़ी, असमिका (formula-heavy; math Latin) ── */

    /* संख्या पद्धति */
    'number-properties:*:hcf': {
      s: [function (s) { return s.a + ' और ' + s.b + ' का म.स.प. (महत्तम समापवर्तक) ज्ञात कीजिए।'; }],
      e: [function (s) { return 'म.स.प.(' + s.a + ', ' + s.b + ') = ' + s.g + ' — वह सबसे बड़ी संख्या जो दोनों को विभाजित करती है (यूक्लिड विधि या उभयनिष्ठ अभाज्य गुणनखंड)।'; }]
    },
    'number-properties:*:lcm': {
      s: [function (s) { return s.a + ' और ' + s.b + ' का ल.स.प. (लघुत्तम समापवर्त्य) ज्ञात कीजिए।'; }],
      e: [function (s) { return 'ल.स.प. = (a × b) ÷ म.स.प. = (' + s.a + ' × ' + s.b + ') ÷ ' + s.g + ' = ' + s.l + '.'; }]
    },
    'number-properties:*:unitDigit': {
      s: [function (s) { return s.base + '^' + s.e + ' का इकाई (अंतिम) अंक क्या है?'; }],
      e: [function (s) { return s.base + ' की घातों का इकाई अंक [' + s.cyc.join(', ') + '] के रूप में दोहराता है (चक्र लंबाई ' + s.cyc.length + ')। ' + s.e + ' को ' + s.cyc.length + ' से भाग देने पर शेषफल, ' + s.ud + ' अंक देता है।'; }]
    },
    'number-properties:hard:numFactors': {
      s: [function (s) { return s.N + ' के कितने गुणनखंड (भाजक) हैं?'; }],
      e: [function (s) { return '' + s.N + ' = ' + s.parts.join(' × ') + '. गुणनखंडों की संख्या = प्रत्येक (घातांक + 1) का गुणनफल = ' + s.ex.map(function (e) { return '(' + e + '+1)'; }).join(' × ') + ' = ' + s.nf + '.'; }]
    },

    /* रैखिक समीकरण */
    'linear-equations:*:solveOne': {
      s: [function (s) { return s.a + 'x + ' + s.b + ' = ' + s.c + '.  x ज्ञात कीजिए।'; }, function (s) { return 'x के लिए हल कीजिए:  ' + s.a + 'x + ' + s.b + ' = ' + s.c; }, function (s) { return 'यदि ' + s.a + 'x + ' + s.b + ' = ' + s.c + ', तो x = ?'; }],
      e: [function (s) { return 'अचर पद को दूसरी ओर ले जाइए: ' + s.a + 'x = ' + s.c + ' − ' + s.b + ' = ' + (s.c - s.b) + '. फिर x = ' + (s.c - s.b) + ' ÷ ' + s.a + ' = ' + s.x + '.'; }]
    },
    'linear-equations:easy:solveOneSub': {
      s: [function (s) { return s.a + 'x − ' + s.b + ' = ' + s.c + '.  x ज्ञात कीजिए।'; }, function (s) { return 'x के लिए हल कीजिए:  ' + s.a + 'x − ' + s.b + ' = ' + s.c; }],
      e: [function (s) { return s.a + 'x = ' + s.c + ' + ' + s.b + ' = ' + (s.c + s.b) + ', अतः x = ' + (s.c + s.b) + ' ÷ ' + s.a + ' = ' + s.x + '.'; }]
    },
    'linear-equations:*:bracket': {
      s: [function (s) { return s.a + '(x + ' + s.b + ') = ' + s.c + '.  x ज्ञात कीजिए।'; }, function (s) { return 'हल कीजिए:  ' + s.a + '(x + ' + s.b + ') = ' + s.c; }],
      e: [function (s) { return 'पहले दोनों पक्षों को ' + s.a + ' से भाग दीजिए: x + ' + s.b + ' = ' + (s.c / s.a) + '. अतः x = ' + (s.c / s.a) + ' − ' + s.b + ' = ' + s.x + '.'; }]
    },
    'linear-equations:*:sumDiff': {
      s: [function (s) { return 'यदि x + y = ' + s.S + ' और x − y = ' + s.D + ', तो x ज्ञात कीजिए।'; }],
      e: [function (s) { return 'समीकरणों को जोड़िए: 2x = ' + s.S + ' + ' + s.D + ' = ' + (s.S + s.D) + ', अतः x = ' + s.x + ' (और y = ' + s.y + ')।'; }]
    },
    'linear-equations:hard:system2': {
      s: [function (s) { return 'निकाय हल कीजिए:  ' + s.a1 + 'x + ' + s.b1 + 'y = ' + s.c1 + '  और  ' + s.a2 + 'x + ' + s.b2 + 'y = ' + s.c2 + '.  x ज्ञात कीजिए।'; }],
      e: [function (s) { return 'y का विलोपन (या प्रतिस्थापन) करके x = ' + s.x + ', y = ' + s.y + '. जाँच: ' + s.a1 + '·' + s.x + ' + ' + s.b1 + '·' + s.y + ' = ' + s.c1 + '. ✓'; }]
    },

    /* द्विघात समीकरण */
    'quadratic-equations:*:largerRoot': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  बड़ा मूल ज्ञात कीजिए।'; }],
      e: [function (s) { return '(x − ' + s.lo + ')(x − ' + s.hi + ') = 0 में गुणनखंडित कीजिए → मूल ' + s.lo + ' और ' + s.hi + '. बड़ा = ' + s.hi + '.'; }]
    },
    'quadratic-equations:medium:smallerRoot': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  छोटा मूल ज्ञात कीजिए।'; }],
      e: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = (x − ' + s.lo + ')(x − ' + s.hi + '). मूल ' + s.lo + ' और ' + s.hi + '; छोटा = ' + s.lo + '.'; }]
    },
    'quadratic-equations:*:sumRoots': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  इसके मूलों का योग ज्ञात कीजिए।'; }],
      e: [function (s) { return 'x² − Bx + C = 0 के लिए, मूलों का योग = B = ' + s.B + ' (वीटा: योग = −b/a = ' + s.B + ')।'; }]
    },
    'quadratic-equations:*:productRoots': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  इसके मूलों का गुणनफल ज्ञात कीजिए।'; }],
      e: [function (s) { return 'वीटा के सूत्रों से, x² − (योग)x + (गुणनफल) = 0 के लिए मूलों का गुणनफल अचर पद के बराबर होता है। यहाँ वह अचर ' + s.C + ' है, अतः गुणनफल = ' + s.C + ' — समीकरण को वास्तव में हल करने की आवश्यकता नहीं। (जाल: मूलों का योग −(x-गुणांक) होता है, एक अलग मान।)'; }]
    },
    'quadratic-equations:hard:discriminant': {
      s: [function (s) { return 'x² − ' + s.B + 'x + ' + s.C + ' = 0.  विविक्तकर (b² − 4ac) ज्ञात कीजिए।'; }],
      e: [function (s) { return 'Δ = b² − 4ac = ' + s.B + '² − 4·1·' + s.C + ' = ' + (s.B * s.B) + ' − ' + (4 * s.C) + ' = ' + (s.B * s.B - 4 * s.C) + '.'; }]
    },
    'quadratic-equations:hard:rootRelation': {
      s: [function (s) { return 'x² − ' + s.B + 'x + c = 0 के मूलों में ' + s.gap + ' का अंतर है। c ज्ञात कीजिए।'; }],
      e: [function (s) { return 'योग = ' + s.B + ' और अंतर = ' + s.gap + ' से मूल (' + s.B + '±' + s.gap + ')/2 = ' + s.hi + ' और ' + s.lo + '. वीटा से, c = गुणनफल = ' + s.hi + ' × ' + s.lo + ' = ' + (s.lo * s.hi) + '.'; }]
    },

    /* करणी और घातांक */
    'surds-indices:*:powerEval': {
      s: [function (s) { return s.a + '^' + s.n + ' = ?'; }, function (s) { return s.a + '^' + s.n + ' का मान ज्ञात कीजिए।'; }],
      e: [function (s) { return s.a + '^' + s.n + ' = ' + s.a + ' को स्वयं से ' + s.n + ' बार गुणा करने पर = ' + s.val + '.'; }]
    },
    'surds-indices:*:solveExp': {
      s: [function (s) { return 'यदि ' + s.a + '^x = ' + s.N + ', तो x ज्ञात कीजिए।'; }],
      e: [function (s) { return '' + s.N + ' = ' + s.a + '^' + s.x + ' (क्योंकि ' + s.a + ' की घात ' + s.x + ', ' + s.N + ' है), अतः x = ' + s.x + '.'; }]
    },
    'surds-indices:*:fracExponent': {
      s: [function (s) { return s.b + '^(' + s.p + '/' + s.root + ') = ?'; }],
      e: [function (s) { return s.b + '^(' + s.p + '/' + s.root + ') = (' + s.b + '^(1/' + s.root + '))^' + s.p + ' = ' + s.rt + '^' + s.p + ' = ' + s.val + '.'; }]
    },
    'surds-indices:*:indexLaw': {
      s: [function (s) { return '(' + s.a + '^' + s.m + ') ÷ (' + s.a + '^' + s.n + ') = ' + s.a + '^? — घातांक बताइए।'; }],
      e: [function (s) { return 'घातांक का भागफल नियम: समान आधार की घातों को भाग देने पर घातांक घटते हैं, aᵐ ÷ aⁿ = aᵐ⁻ⁿ. अतः घातांक ' + s.m + ' − ' + s.n + ' = ' + (s.m - s.n) + ' है। (जाल: आधार ' + s.a + ' वही रहता है — आधारों को कभी भाग नहीं देते।)'; }]
    },

    /* लघुगणक */
    'logarithms:*:evalLog': {
      s: [function (s) { return s.b + ' आधार पर ' + s.N + ' का लघुगणक = ?'; }, function (s) { return s.b + ' आधार पर ' + s.N + ' का लघुगणक ज्ञात कीजिए।'; }],
      e: [function (s) { return 'logₐN पूछता है "' + s.b + ' को किस घात तक बढ़ाने पर ' + s.N + ' मिलता है?" ' + s.N + ' को ' + s.b + ' की घात के रूप में लिखिए: ' + s.b + '^' + s.k + ' = ' + s.N + ', अतः ' + s.b + ' आधार पर ' + s.N + ' का लघुगणक = ' + s.k + '.' + (s.b === 10 ? ' (आधार 10 के लिए — सामान्य लघुगणक — बस गिनिए कि 10 से कितनी बार गुणा करते हैं।)' : ''); }]
    },
    'logarithms:*:solveLog': {
      s: [function (s) { return 'यदि ' + s.b + ' आधार पर x का लघुगणक ' + s.k + ' है, तो x ज्ञात कीजिए।'; }],
      e: [function (s) { return 'logₐx = k, x = aᵏ के समान कथन है (लघुगणक को चरघातांकी रूप में लिखिए)। अतः x = ' + s.b + '^' + s.k + ' = ' + s.x + '.'; }]
    },
    'logarithms:*:logSum': {
      s: [function (s) { return '(' + s.b + ' आधार पर ' + s.x + ' का लघुगणक) + (' + s.b + ' आधार पर ' + s.y + ' का लघुगणक) = ?'; }],
      e: [function (s) { return 'गुणनफल नियम: logₐx + logₐy = logₐ(xy). चूँकि ' + s.b + '^' + s.i + ' = ' + s.x + ' और ' + s.b + '^' + s.j + ' = ' + s.y + ', दोनों लघुगणक ' + s.i + ' और ' + s.j + ' हैं, अतः योग = ' + s.i + ' + ' + s.j + ' = ' + (s.i + s.j) + '. (शॉर्टकट: समान-आधार लघुगणकों को जोड़ने पर घातांक जुड़ जाते हैं।)'; }]
    },
    'logarithms:*:logPower': {
      s: [function (s) { return s.b + ' आधार पर ' + s.x + '^' + s.k + ' का लघुगणक = ?'; }],
      e: [function (s) { return 'घात नियम: logₐ(xᵏ) = k·logₐx. यहाँ ' + s.b + ' आधार पर ' + s.x + ' का लघुगणक = ' + s.i + ' (क्योंकि ' + s.b + '^' + s.i + ' = ' + s.x + '), अतः उत्तर = ' + s.k + ' × ' + s.i + ' = ' + (s.i * s.k) + '. (जाल: घातांक लघुगणक को गुणा करता है — यह नया आधार नहीं बनता।)'; }]
    },

    /* श्रेढ़ी */
    'progressions:*:apNth': {
      s: [function (s) { return 'एक समांतर श्रेढ़ी का प्रथम पद ' + s.a + ' और सार्व अंतर ' + s.d + ' है। इसका ' + ordhi(s.n) + ' पद ज्ञात कीजिए।'; }, function (s) { return 'एक समांतर श्रेढ़ी ' + s.a + ' से शुरू होती है और प्रत्येक पद में ' + s.d + ' बढ़ती है। इसका ' + ordhi(s.n) + ' पद क्या है?'; }],
      e: [function (s) { return 'aₙ = a + (n − 1)d = ' + s.a + ' + (' + s.n + ' − 1)·' + s.d + ' = ' + s.a + ' + ' + ((s.n - 1) * s.d) + ' = ' + (s.a + (s.n - 1) * s.d) + '.'; }]
    },
    'progressions:*:apSum': {
      s: [function (s) { return 'एक समांतर श्रेढ़ी का प्रथम पद ' + s.a + ' और सार्व अंतर ' + s.d + ' है। इसके प्रथम ' + s.n + ' पदों का योग ज्ञात कीजिए।'; }],
      e: [function (s) { return 'Sₙ = n/2 · [2a + (n − 1)d] = ' + s.n + '/2 · [' + (2 * s.a) + ' + ' + ((s.n - 1) * s.d) + '] = ' + (s.n / 2 * (2 * s.a + (s.n - 1) * s.d)) + '.'; }]
    },
    'progressions:*:gpNth': {
      s: [function (s) { return 'एक गुणोत्तर श्रेढ़ी का प्रथम पद ' + s.a + ' और सार्व अनुपात ' + s.r + ' है। इसका ' + ordhi(s.n) + ' पद ज्ञात कीजिए।'; }],
      e: [function (s) { return 'aₙ = a·rⁿ⁻¹ = ' + s.a + '·' + s.r + '^' + (s.n - 1) + ' = ' + s.a + '·' + Math.pow(s.r, s.n - 1) + ' = ' + (s.a * Math.pow(s.r, s.n - 1)) + '.'; }]
    },
    'progressions:hard:gpSum': {
      s: [function (s) { return 'एक गुणोत्तर श्रेढ़ी का प्रथम पद ' + s.a + ' और सार्व अनुपात ' + s.r + ' है। इसके प्रथम ' + s.n + ' पदों का योग ज्ञात कीजिए।'; }],
      e: [function (s) { return 'r > 1 वाली गुणोत्तर श्रेढ़ी के लिए Sₙ = a(rⁿ − 1)/(r − 1) प्रयोग कीजिए। a = ' + s.a + ', r = ' + s.r + ', n = ' + s.n + ' रखिए: = ' + s.a + '(' + s.r + '^' + s.n + ' − 1)/(' + s.r + ' − 1) = ' + s.a + '·' + (Math.pow(s.r, s.n) - 1) + '/' + (s.r - 1) + ' = ' + (s.a * (Math.pow(s.r, s.n) - 1) / (s.r - 1)) + '. (जाल: पदों को एक-एक करके मत जोड़िए — सूत्र पूरी श्रेढ़ी को समेट लेता है; r < 1 के लिए इसे a(1 − rⁿ)/(1 − r) में पलट दीजिए।)'; }]
    },

    /* असमिका और निरपेक्ष मान */
    'inequalities-modulus:*:linIneqMin': {
      s: [function (s) { return 'सबसे छोटा पूर्णांक x ज्ञात कीजिए जिसके लिए ' + s.a + 'x + ' + s.b + ' > ' + s.c + '.'; }],
      e: [function (s) { return s.a + 'x > ' + s.c + ' − ' + s.b + ' = ' + (s.c - s.b) + ', अतः x > ' + ((s.c - s.b) / s.a).toFixed(2).replace(/\.00$/, '') + '. इससे बड़ा सबसे छोटा पूर्णांक ' + (Math.floor((s.c - s.b) / s.a) + 1) + ' है।'; }]
    },
    'inequalities-modulus:*:countRange': {
      s: [function (s) { return 'कितने पूर्णांक x, ' + s.a + ' ≤ x ≤ ' + s.b + ' को संतुष्ट करते हैं?'; }],
      e: [function (s) { return 'बंद परिसर में पूर्णांक गिनना दोनों सिरों सहित होता है: संख्या = (ऊपरी − निचला) + 1 = (' + s.b + ' − ' + s.a + ') + 1 = ' + (s.b - s.a + 1) + '. ("+1" प्रसिद्ध बाड़-खंभा चरण है — केवल घटाने पर एक सिरा छूट जाता है और गिनती 1 से कम हो जाती है।)'; }]
    },
    'inequalities-modulus:*:modLarger': {
      s: [function (s) { return 'यदि |x − ' + s.a + '| = ' + s.b + ', तो x का बड़ा मान ज्ञात कीजिए।'; }],
      e: [function (s) { return '|x − ' + s.a + '| = ' + s.b + ' से x = ' + s.a + ' + ' + s.b + ' = ' + (s.a + s.b) + ' या x = ' + s.a + ' − ' + s.b + ' = ' + (s.a - s.b) + '. बड़ा मान ' + (s.a + s.b) + ' है।'; }]
    },
    'inequalities-modulus:hard:modIneqCount': {
      s: [function (s) { return 'x के कितने पूर्णांक मान |x − ' + s.a + '| < ' + s.b + ' को संतुष्ट करते हैं?'; }],
      e: [function (s) { return '|x − ' + s.a + '| < ' + s.b + ' का अर्थ है ' + (s.a - s.b) + ' < x < ' + (s.a + s.b) + '. इनके ठीक बीच के पूर्णांक 2·' + s.b + ' − 1 = ' + (2 * s.b - 1) + ' मान हैं।'; }]
    },
    'inequalities-modulus:hard:modIneqCountLe': {
      s: [function (s) { return 'x के कितने पूर्णांक मान |x − ' + s.a + '| ≤ ' + s.b + ' को संतुष्ट करते हैं?'; }],
      e: [function (s) { return '|x − ' + s.a + '| ≤ ' + s.b + ' का अर्थ है ' + (s.a - s.b) + ' ≤ x ≤ ' + (s.a + s.b) + ', सम्मिलित = 2·' + s.b + ' + 1 = ' + (2 * s.b + 1) + ' पूर्णांक।'; }]
    },

    /* ── Batch 7: ज्यामिति, निर्देशांक ज्यामिति, त्रिकोणमिति (angles, Pythagoras, coordinate formulae, trig) ──
       Angles in degrees (° kept), formula symbols (√, ², x₁/y₂, Δx, tan) DNT; TRIG_STRUCT/TRIG_IDENT ride pools. */

    /* ज्यामिति — कोण, त्रिभुज, बहुभुज */
    'geometry-basics:easy:complement': {
      s: [function (s) { return s.a + '° के कोण का पूरक कोण क्या है?'; }, function (s) { return 'दो कोण पूरक हैं और उनमें से एक ' + s.a + '° का है। दूसरा कोण ज्ञात कीजिए (डिग्री में)।'; }],
      e: [function (s) { return 'पूरक कोणों का योग 90° होता है, इसलिए पूरक = 90° − ' + s.a + '° = ' + (90 - s.a) + '°.'; }]
    },
    'geometry-basics:easy:supplement': {
      s: [function (s) { return s.a + '° के कोण का संपूरक कोण क्या है?'; }, function (s) { return 'दो कोण एक सरल रेखा पर स्थित हैं और एक ' + s.a + '° का है। दूसरा कोण ज्ञात कीजिए (डिग्री में)।'; }],
      e: [function (s) { return 'संपूरक कोणों का योग 180° होता है, इसलिए संपूरक = 180° − ' + s.a + '° = ' + (180 - s.a) + '°.'; }]
    },
    'geometry-basics:*:triangleThird': {
      s: [function (s) { return 'एक त्रिभुज के दो कोण ' + s.a + '° और ' + s.b + '° हैं। तीसरा कोण ज्ञात कीजिए।'; }, function (s) { return 'एक त्रिभुज में दो कोण ' + s.a + '° और ' + s.b + '° हैं। तीसरा कोण = ?°'; }],
      e: [function (s) { return 'त्रिभुज के कोणों का योग 180° होता है, इसलिए तीसरा = 180° − ' + s.a + '° − ' + s.b + '° = ' + (180 - s.a - s.b) + '°.'; }]
    },
    'geometry-basics:medium:pythHyp': {
      s: [function (s) { return 'एक समकोण त्रिभुज की भुजाएँ ' + s.t0 + ' और ' + s.t1 + ' हैं। कर्ण ज्ञात कीजिए।'; }, function (s) { return 'एक सीढ़ी का निचला सिरा दीवार से ' + s.t0 + ' मीटर दूर है और वह दीवार पर ' + s.t1 + ' मीटर ऊपर तक पहुँचती है। सीढ़ी की लंबाई कितनी है (मीटर में)?'; }],
      e: [function (s) { return 'कर्ण = √(' + s.t0 + '² + ' + s.t1 + '²) = √(' + (s.t0 * s.t0) + ' + ' + (s.t1 * s.t1) + ') = √' + (s.t2 * s.t2) + ' = ' + s.t2 + '.'; }]
    },
    'geometry-basics:medium:isosceles': {
      s: [function (s) { return 'एक समद्विबाहु त्रिभुज का शीर्ष कोण ' + s.v + '° है। प्रत्येक आधार कोण ज्ञात कीजिए।'; }],
      e: [function (s) { return 'दोनों आधार कोण बराबर होते हैं और तीनों का योग 180° होता है: प्रत्येक = (180° − ' + s.v + '°)/2 = ' + ((180 - s.v) / 2) + '°.'; }]
    },
    'geometry-basics:hard:pythLeg': {
      s: [function (s) { return 'एक समकोण त्रिभुज का कर्ण ' + s.t2 + ' और एक भुजा ' + s.t1 + ' है। दूसरी भुजा ज्ञात कीजिए।'; }],
      e: [function (s) { return 'दूसरी भुजा = √(' + s.t2 + '² − ' + s.t1 + '²) = √(' + (s.t2 * s.t2) + ' − ' + (s.t1 * s.t1) + ') = √' + (s.t0 * s.t0) + ' = ' + s.t0 + '.'; }]
    },
    'geometry-basics:hard:polygonSum': {
      s: [function (s) { return s.n + ' भुजाओं वाले बहुभुज के अंतःकोणों का योग ज्ञात कीजिए।'; }, function (s) { return s.n + ' भुजाओं वाले बहुभुज के अंतःकोणों का योग = ?°'; }],
      e: [function (s) { return 'अंतःकोणों का योग = (n − 2) × 180° = (' + s.n + ' − 2) × 180° = ' + ((s.n - 2) * 180) + '°.'; }]
    },
    'geometry-basics:hard:polygonEach': {
      s: [function (s) { return s.n + ' भुजाओं वाले सम बहुभुज का प्रत्येक अंतःकोण ज्ञात कीजिए।'; }],
      e: [function (s) { return 'प्रत्येक अंतःकोण = (n − 2) × 180° / n = ' + ((s.n - 2) * 180) + '° / ' + s.n + ' = ' + ((s.n - 2) * 180 / s.n) + '°.'; }]
    },

    /* निर्देशांक ज्यामिति — दूरी, मध्यबिंदु, ढाल, विभाजन */
    'coordinate-geometry-basics:*:distance': {
      s: [function (s) { return 'बिंदुओं (' + s.x1 + ', ' + s.y1 + ') और (' + s.x2 + ', ' + s.y2 + ') के बीच की दूरी ज्ञात कीजिए।'; }],
      e: [function (s) { return 'दूरी = √[(Δx)² + (Δy)²] = √[' + s.t0 + '² + ' + s.t1 + '²] = √' + (s.t2 * s.t2) + ' = ' + s.t2 + '.'; }]
    },
    'coordinate-geometry-basics:*:midpointX': {
      s: [function (s) { return '(' + s.x1 + ', ' + s.y1 + ') और (' + s.x2 + ', ' + s.y2 + ') के मध्यबिंदु का x-निर्देशांक ज्ञात कीजिए।'; }],
      e: [function (s) { return 'मध्यबिंदु x = (x₁ + x₂)/2 = (' + s.x1 + ' + ' + s.x2 + ')/2 = ' + ((s.x1 + s.x2) / 2) + '.'; }]
    },
    'coordinate-geometry-basics:*:slope': {
      s: [function (s) { return '(' + s.x1 + ', ' + s.y1 + ') और (' + s.x2 + ', ' + s.y2 + ') को मिलाने वाली रेखा की ढाल ज्ञात कीजिए।'; }],
      e: [function (s) { return 'ढाल = (y₂ − y₁)/(x₂ − x₁) = (' + (s.y2 - s.y1) + ')/(' + (s.x2 - s.x1) + ') = ' + ((s.y2 - s.y1) / (s.x2 - s.x1)) + '.'; }]
    },
    'coordinate-geometry-basics:hard:sectionX': {
      s: [function (s) { return 'बिंदु P, (' + s.x1 + ', ' + s.y1 + ') और (' + s.x2 + ', ' + s.y2 + ') को मिलाने वाली रेखा को ' + s.m + ':' + s.n + ' के अनुपात में आंतरिक रूप से विभाजित करता है। P का x-निर्देशांक ज्ञात कीजिए।'; }],
      e: [function (s) { return 'विभाजन सूत्र: x = (m·x₂ + n·x₁)/(m + n) = (' + s.m + '·' + s.x2 + ' + ' + s.n + '·' + s.x1 + ')/(' + s.m + ' + ' + s.n + ') = ' + s.x + '.'; }]
    },

    /* त्रिकोणमिति — मानक कोण, पूरक-कोण सर्वसमिका, सर्वसमिका, ऊँचाई-दूरी */
    'trigonometry:*:standardEval': {
      s: [function (s) { return s.fn + ' ' + s.ang + '° = ?'; }],
      e: [function (s) { return 'मानक कोण सारणी से, ' + s.fn + ' ' + s.ang + '° = ' + s.val + '.'; }]
    },
    'trigonometry:*:complementary': {
      s: [function (s) { return 'यदि ' + s.p0 + ' θ = ' + s.p1 + ' ' + s.x + '°, तो न्यून कोण θ ज्ञात कीजिए (डिग्री में)।'; }],
      e: [function (s) { return s.p0 + ' θ = ' + s.p1 + '(90° − θ), इसलिए θ = 90° − ' + s.x + '° = ' + (90 - s.x) + '°.'; }]
    },
    'trigonometry:*:identity': {
      s: [function (s) { return TRIG_IDENT[s.idx][0] + ' का मान ज्ञात कीजिए।'; }],
      e: [function (s) { return 'यह ' + TRIG_IDENT[s.idx][1] + ' है — तीन पाइथागोरस सर्वसमिकाओं में से एक, जो सभी sin²θ + cos²θ = 1 से व्युत्पन्न हैं (अन्य दो के लिए cos²θ या sin²θ से भाग दीजिए)। प्रत्येक कोण θ के लिए इसका मान 1 नियत रहता है, इसलिए किसी विशिष्ट कोण की आवश्यकता नहीं। (सावधानी: वर्ग फलनों पर होता है, जैसे sin²θ का अर्थ (sinθ)² है, sin(θ²) नहीं।)'; }]
    },
    'trigonometry:hard:heightElev': {
      s: [function (s) { return 'एक ' + TRIG_STRUCT[s.stIdx] + ' के शिखर का उन्नयन कोण, उसके आधार से ' + s.base + ' मीटर दूर एक बिंदु से 45° है। ' + TRIG_STRUCT[s.stIdx] + ' की ऊँचाई ज्ञात कीजिए (मीटर में)।'; }],
      e: [function (s) { return 'tan(45°) = ऊँचाई / आधार = 1, इसलिए ऊँचाई = आधार = ' + s.base + ' मीटर।'; }]
    },

    /* ── Batch 8: क्रमचय-संचय, प्रायिकता, समुच्चय सिद्धांत, सांख्यिकी, मिश्रण, राशि-तुलना ──
       nPr/nCr/factorial and set/probability symbols (∪, ∩, P, |A|) DNT; colour/context/commodity nouns ride the
       PROB_COL / PROB_COLC / SET_CTX / MIX_ITEMS pools; QC options/answer render from QC_REL by index. */

    /* क्रमचय एवं संचय */
    'permutation-combination:easy:factorial': {
      s: [function (s) { return s.n + '! = ?'; }],
      e: [function (s) { return s.n + '! = ' + s.n + ' × ' + (s.n - 1) + ' × … × 1 = ' + s.val + '.'; }]
    },
    'permutation-combination:*:arrange': {
      s: [function (s) { return s.n + ' विभिन्न पुस्तकों को एक पंक्ति में कितने प्रकार से व्यवस्थित किया जा सकता है?'; }],
      e: [function (s) { return 'सभी ' + s.n + ' को व्यवस्थित करना = ' + s.n + '! = ' + s.val + '.'; }]
    },
    'permutation-combination:medium:nPr': {
      s: [function (s) { return s.n + 'P' + s.r + ' का मान ज्ञात कीजिए (' + s.n + ' में से ' + s.r + ' का क्रमचय)।'; }],
      e: [function (s) { return 'nPr = n!/(n−r)! = ' + s.n + '!/' + (s.n - s.r) + '! = ' + s.val + '.'; }]
    },
    'permutation-combination:medium:nCr': {
      s: [function (s) { return s.n + 'C' + s.r + ' का मान ज्ञात कीजिए (' + s.n + ' में से ' + s.r + ' का संचय)।'; }],
      e: [function (s) { return 'nCr = n!/[r!(n−r)!] = ' + s.n + '!/[' + s.r + '!·' + (s.n - s.r) + '!] = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:committee': {
      s: [function (s) { return s.n + ' व्यक्तियों में से ' + s.r + ' सदस्यों की कितनी भिन्न समितियाँ बनाई जा सकती हैं?'; }],
      e: [function (s) { return 'क्रम महत्वपूर्ण नहीं → संचय: ' + s.n + 'C' + s.r + ' = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:handshakes': {
      s: [function (s) { return 'एक पार्टी में ' + s.n + ' व्यक्ति हैं, प्रत्येक व्यक्ति हर दूसरे व्यक्ति से एक बार हाथ मिलाता है। कुल कितने हस्तमिलाप होते हैं?'; }],
      e: [function (s) { return 'प्रत्येक हस्तमिलाप एक युग्म है → ' + s.n + 'C2 = ' + s.n + '×' + (s.n - 1) + '/2 = ' + s.val + '.'; }]
    },
    'permutation-combination:hard:circular': {
      s: [function (s) { return s.n + ' व्यक्तियों को एक वृत्ताकार मेज़ के चारों ओर कितने प्रकार से बैठाया जा सकता है?'; }],
      e: [function (s) { return 'वृत्त में समान घूर्णनों को हटाने के लिए एक स्थान नियत किया जाता है, शेष (n − 1)! = ' + (s.n - 1) + '! = ' + s.val + ' व्यवस्थाएँ।'; }]
    },
    'permutation-combination:hard:atLeastOne': {
      s: [function (s) { return s.w + ' महिलाओं और ' + s.m + ' पुरुषों में से ' + s.r + ' सदस्यों की एक समिति चुनी जाती है। कितनी समितियों में कम-से-कम एक महिला होगी?'; }],
      e: [function (s) { return 'पूरक गिनिए: कुल समितियाँ ' + (s.w + s.m) + 'C' + s.r + ' = ' + s.total + ', में से केवल-पुरुष समितियाँ ' + s.m + 'C' + s.r + ' = ' + s.allMen + ' घटाने पर ' + s.ans + '। “कम-से-कम एक” का अर्थ लगभग हमेशा शून्य-स्थिति को घटाना होता है।'; }]
    },

    /* प्रायिकता */
    'probability:*:bagSingle': {
      s: [function (s) { return 'एक थैले में ' + s.r + ' ' + PROB_COL[s.colIdx][0] + ' और ' + s.b + ' ' + PROB_COL[s.colIdx][1] + ' गेंदें हैं। एक गेंद यादृच्छिक रूप से निकाली जाती है। इसके ' + PROB_COL[s.colIdx][0] + ' होने की प्रायिकता क्या है? (दशमलव में)'; }],
      e: [function (s) { return 'P = अनुकूल/कुल = ' + s.r + '/' + s.T + ' = ' + s.ans + '.'; }]
    },
    'probability:easy:allHeads': {
      s: [function (s) { return s.n + ' न्यायसंगत ' + (s.n === 1 ? 'सिक्का उछाला जाता है' : 'सिक्के उछाले जाते हैं') + '। ' + (s.n === 1 ? 'चित आने' : 'सभी चित आने') + ' की प्रायिकता क्या है? (दशमलव में)'; }],
      e: [function (s) { return 'P(सभी चित) = (1/2)^' + s.n + ' = ' + s.ans + '.'; }]
    },
    'probability:*:complement': {
      s: [function (s) { return 'एक थैले में ' + s.r + ' ' + PROB_COLC[s.colIdx][0] + ' और ' + s.b + ' ' + PROB_COLC[s.colIdx][1] + ' गेंदें हैं। एक गेंद यादृच्छिक रूप से निकाली जाती है। इसके ' + PROB_COLC[s.colIdx][0] + ' न होने की प्रायिकता क्या है? (दशमलव में)'; }],
      e: [function (s) { return 'P(' + PROB_COLC[s.colIdx][0] + ' नहीं) = 1 − ' + s.r + '/' + s.T + ' = ' + s.ans + '.'; }]
    },
    'probability:*:multipleProb': {
      s: [function (s) { return '1 से ' + s.T + ' तक एक संख्या यादृच्छिक रूप से चुनी जाती है। इसके ' + s.d + ' के गुणज होने की प्रायिकता क्या है? (दशमलव में)'; }],
      e: [function (s) { return s.T + ' तक ' + s.d + ' के गुणज: ' + s.fav + '. P = ' + s.fav + '/' + s.T + ' = ' + s.ans + '.'; }]
    },

    /* समुच्चय सिद्धांत — समावेशन-अपवर्जन */
    'set-theory:*:union': {
      s: [function (s) { return 'एक समूह में ' + s.a + ' व्यक्ति ' + SET_CTX[s.ci][0] + ' पसंद करते हैं, ' + s.b + ' व्यक्ति ' + SET_CTX[s.ci][1] + ' पसंद करते हैं, और ' + s.both + ' दोनों पसंद करते हैं। कितने व्यक्ति दोनों में से कम-से-कम एक पसंद करते हैं?'; }],
      e: [function (s) { return '|A∪B| = |A| + |B| − |A∩B| = ' + s.a + ' + ' + s.b + ' − ' + s.both + ' = ' + (s.a + s.b - s.both) + '.'; }]
    },
    'set-theory:easy:onlyA': {
      s: [function (s) { return 'एक समूह में ' + s.a + ' व्यक्ति ' + SET_CTX[s.ci][0] + ' पसंद करते हैं और उनमें से ' + s.both + ' व्यक्ति ' + SET_CTX[s.ci][1] + ' भी पसंद करते हैं। कितने व्यक्ति केवल ' + SET_CTX[s.ci][0] + ' पसंद करते हैं?'; }],
      e: [function (s) { return 'केवल ' + SET_CTX[s.ci][0] + ' = |A| − |A∩B| = ' + s.a + ' − ' + s.both + ' = ' + (s.a - s.both) + '.'; }]
    },
    'set-theory:*:neither': {
      s: [function (s) { return s.total + ' विद्यार्थियों की एक कक्षा में ' + s.a + ' ' + SET_CTX[s.ci][0] + ' पसंद करते हैं, ' + s.b + ' ' + SET_CTX[s.ci][1] + ' पसंद करते हैं और ' + s.both + ' दोनों पसंद करते हैं। कितने किसी को भी पसंद नहीं करते?'; }],
      e: [function (s) { return 'कम-से-कम एक पसंद = ' + s.a + ' + ' + s.b + ' − ' + s.both + ' = ' + s.union + '. कोई नहीं = ' + s.total + ' − ' + s.union + ' = ' + s.neither + '.'; }]
    },
    'set-theory:*:both': {
      s: [function (s) { return s.total + ' विद्यार्थियों की एक कक्षा में ' + s.a + ' ' + SET_CTX[s.ci][0] + ' पसंद करते हैं, ' + s.b + ' ' + SET_CTX[s.ci][1] + ' पसंद करते हैं और ' + s.neither + ' किसी को भी पसंद नहीं करते। कितने दोनों पसंद करते हैं?'; }],
      e: [function (s) { return 'कम-से-कम एक पसंद = ' + s.total + ' − ' + s.neither + ' = ' + s.union + '. दोनों = |A| + |B| − संघ = ' + s.a + ' + ' + s.b + ' − ' + s.union + ' = ' + s.both + '.'; }]
    },
    'set-theory:hard:threeUnion': {
      s: [function (s) { return 'एक सर्वेक्षण में ' + s.a + ' व्यक्ति A पढ़ते हैं, ' + s.b + ' व्यक्ति B पढ़ते हैं, ' + s.cc + ' व्यक्ति C पढ़ते हैं; ' + s.ab + ' A और B पढ़ते हैं, ' + s.bc + ' B और C पढ़ते हैं, ' + s.ca + ' A और C पढ़ते हैं, और ' + s.abc + ' तीनों पढ़ते हैं। कितने कम-से-कम एक पढ़ते हैं?'; }],
      e: [function (s) { return '|A∪B∪C| = (' + s.a + '+' + s.b + '+' + s.cc + ') − (' + s.ab + '+' + s.bc + '+' + s.ca + ') + ' + s.abc + ' = ' + s.union + '.'; }]
    },

    /* सांख्यिकी */
    'statistics-basics:*:median': {
      s: [function (s) { return s.a.join(', ') + ' की माध्यिका ज्ञात कीजिए।'; }],
      e: [function (s) { return 'क्रम में लगाइए: ' + s.sorted.join(', ') + '. ' + s.k + ' मानों के साथ माध्यिका मध्य मान है = ' + s.med + '.'; }]
    },
    'statistics-basics:*:range': {
      s: [function (s) { return s.a.join(', ') + ' का परिसर ज्ञात कीजिए।'; }],
      e: [function (s) { return 'परिसर = सबसे बड़ा − सबसे छोटा = ' + s.mx + ' − ' + s.mn + ' = ' + (s.mx - s.mn) + '.'; }]
    },
    'statistics-basics:*:mode': {
      s: [function (s) { return s.a.join(', ') + ' का बहुलक ज्ञात कीजिए।'; }],
      e: [function (s) { return 'बहुलक सबसे अधिक बार आने वाला मान है। ' + s.m + ' 3 बार आता है — किसी अन्य से अधिक — इसलिए बहुलक ' + s.m + ' है।'; }]
    },
    'statistics-basics:hard:mean': {
      s: [function (s) { return s.a.join(', ') + ' का माध्य (औसत) ज्ञात कीजिए।'; }],
      e: [function (s) { return 'माध्य = योग ÷ संख्या = ' + s.sum + ' ÷ ' + s.k + ' = ' + s.M + '.'; }]
    },

    /* मिश्रण एवं मिश्रण नियम — commodity via MIX_ITEMS; wording gender-invariant (नमूने/मात्रा/दर carry agreement) */
    'mixtures:*:alligationRatio': {
      s: [function (s) { return MIX_ITEMS[s.itIdx] + ' के दो नमूने, ₹' + s.a + ' प्रति kg तथा ₹' + s.b + ' प्रति kg की दर पर, किस अनुपात में मिलाए जाएँ ताकि मिश्रण ₹' + s.m + ' प्रति kg का हो?'; }],
      e: [function (s) { return 'मिश्रण नियम से, सस्ता : महँगा = (महँगा − माध्य) : (माध्य − सस्ता) = (' + s.b + '−' + s.m + ') : (' + s.m + '−' + s.a + ') = ' + s.lo + ' : ' + s.hi + ' = ' + (s.lo / s.g) + ' : ' + (s.hi / s.g) + '.'; }]
    },
    'mixtures:*:meanPrice': {
      s: [function (s) { return s.x + ' kg ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.a + ' प्रति kg) को ' + s.y + ' kg ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.b + ' प्रति kg) के साथ मिलाया जाता है। मिश्रण का औसत मूल्य = ₹? प्रति kg'; }],
      e: [function (s) { return 'औसत = कुल लागत ÷ कुल भार = (' + s.x + '×' + s.a + ' + ' + s.y + '×' + s.b + ') ÷ (' + s.x + '+' + s.y + ') = ' + (s.a * s.x + s.b * s.y) + ' ÷ ' + (s.x + s.y) + ' = ₹' + s.mean + '.'; }]
    },
    'mixtures:hard:alligationQty': {
      s: [function (s) { return 'कितनी मात्रा (kg में) ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.a + ' प्रति kg) को ' + s.y + ' kg ' + MIX_ITEMS[s.itIdx] + ' (₹' + s.b + ' प्रति kg) के साथ मिलाई जाए ताकि मिश्रण ₹' + s.m + ' प्रति kg का हो?'; }],
      e: [function (s) { return 'मिश्रण नियम से, सस्ता : महँगा = (' + s.b + '−' + s.m + ') : (' + s.m + '−' + s.a + ') = ' + s.lo + ' : ' + s.hi + '. सस्ती मात्रा = ' + s.y + ' × ' + s.lo + '/' + s.hi + ' = ' + s.x + ' kg.'; }]
    },

    /* राशि-तुलना — एकमात्र text-MCQ quant प्रारूप; options/answer QC_REL से index द्वारा (qcOhi/qcAnshi) */
    'quantity-comparison:*:pct': {
      s: [function (s) { return 'दोनों राशियों की तुलना कीजिए।  राशि I: ' + s.b + ' का ' + s.a + '%।  राशि II: ' + s.q2 + '।'; }],
      e: [function (s) { return s.b + ' का ' + s.a + '% = ' + s.q1 + '. अतः राशि I = ' + s.q1 + ' और राशि II = ' + s.q2 + ', जिससे “' + QC_REL[s.relIdx] + '”।'; }],
      o: qcOhi, ans: qcAnshi
    },
    'quantity-comparison:*:product': {
      s: [function (s) { return 'दोनों राशियों की तुलना कीजिए।  राशि I: ' + s.a + ' × ' + s.b + '।  राशि II: ' + s.c + ' × ' + s.d + '।'; }],
      e: [function (s) { return s.a + ' × ' + s.b + ' = ' + s.q1 + '; ' + s.c + ' × ' + s.d + ' = ' + s.q2 + '. अतः राशि I = ' + s.q1 + ' और राशि II = ' + s.q2 + ', जिससे “' + QC_REL[s.relIdx] + '”।'; }],
      o: qcOhi, ans: qcAnshi
    },
    'quantity-comparison:*:solve': {
      s: [function (s) { return 'दोनों राशियों की तुलना कीजिए।  राशि I: x का मान, जहाँ ' + s.m + 'x + ' + s.n + ' = ' + s.c + '।  राशि II: ' + s.q2 + '।'; }],
      e: [function (s) { return s.m + 'x + ' + s.n + ' = ' + s.c + ' → x = ' + s.x + '. अतः राशि I = ' + s.q1 + ' और राशि II = ' + s.q2 + ', जिससे “' + QC_REL[s.relIdx] + '”।'; }],
      o: qcOhi, ans: qcAnshi
    },
    'quantity-comparison:*:average': {
      s: [function (s) { return 'दोनों राशियों की तुलना कीजिए।  राशि I: ' + s.list.join(', ') + ' का औसत।  राशि II: ' + s.q2 + '।'; }],
      e: [function (s) { return 'औसत = (' + s.list.join(' + ') + ')/3 = ' + s.q1 + '. अतः राशि I = ' + s.q1 + ' और राशि II = ' + s.q2 + ', जिससे “' + QC_REL[s.relIdx] + '”।'; }],
      o: qcOhi, ans: qcAnshi
    },
    'quantity-comparison:*:square': {
      s: [function (s) { return 'दोनों राशियों की तुलना कीजिए।  राशि I: ' + s.a + '²।  राशि II: ' + s.q2 + '।'; }],
      e: [function (s) { return s.a + '² = ' + s.q1 + '. अतः राशि I = ' + s.q1 + ' और राशि II = ' + s.q2 + ', जिससे “' + QC_REL[s.relIdx] + '”।'; }],
      o: qcOhi, ans: qcAnshi
    }
  } };

  if (GI) GI.register('hi', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
