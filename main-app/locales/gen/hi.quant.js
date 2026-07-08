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
    'simplification:hard:fullBodmas': { s: [function (s) { return '(' + s.p + ' × ' + s.q + ') ÷ ' + s.r + ' + ' + s.ss + ' × ' + s.t + ' = ?'; }], e: [function (s) { return 'कोष्ठक → (' + s.p + ' × ' + s.q + ') = ' + (s.p * s.q) + '; ÷ ' + s.r + ' = ' + ((s.p * s.q) / s.r) + '; और ' + s.ss + ' × ' + s.t + ' = ' + (s.ss * s.t) + '; योग = ' + ((s.p * s.q) / s.r + s.ss * s.t) + '.'; }] }
  } };

  if (GI) GI.register('hi', 'quant', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
