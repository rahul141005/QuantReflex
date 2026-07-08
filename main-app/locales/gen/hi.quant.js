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

  var pack = { pools: {}, tpl: {
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
    }
  } };

  if (GI) GI.register('hi', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
