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

  /* Index-aligned pools (Hindi) — same length + inner arity as en.quant.js (enforced by gen-i18n.check §7).
     Only the descriptor word translates ('more'→अधिक, 'less'→कम); the % numbers and the ratio answer are neutral. */
  var RAT_PCT_POOL = [['25% अधिक', '5:4'], ['20% कम', '4:5'], ['50% अधिक', '3:2'], ['20% अधिक', '6:5'], ['25% कम', '3:4'], ['10% कम', '9:10'], ['12.5% अधिक', '9:8'], ['16.66% कम', '5:6'], ['37.5% अधिक', '11:8'], ['11.11% कम', '8:9'], ['66.66% अधिक', '5:3'], ['150% अधिक', '5:2'], ['40% अधिक', '7:5'], ['75% अधिक', '7:4']];

  var pack = { pools: { RAT_PCT_POOL: RAT_PCT_POOL }, tpl: {
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
    }
  } };

  if (GI) GI.register('hi', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
