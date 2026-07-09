/**
 * hi.lr.js — generated-content pack (LR engine, हिन्दी) for QRGenI18n (ADR-111 Phase F-M6).
 *
 * A FIRST-CLASS Hindi LR pack (not a transliteration of English): exam-book register (Arihant / R.S. Aggarwal
 * तर्कशक्ति परीक्षण), आप-form for the student, तत्सम technical nouns with everyday verbs. lr-engine.js owns ALL RNG +
 * math; this pack owns every user-visible STRING. For a fixed RNG seed the answer, options (by relation-id / pool
 * index), subtype and difficulty are IDENTICAL to EN — only the wording differs (proven by gen-i18n.check §11).
 *
 * GRAMMAR ENGINEERING (blueprint §5.4.4):
 *  • Gender-safe possessive frames: the possessive marker agrees with the POSSESSED noun, never the (unknown-gender)
 *    actor — "<actor> की चाल" (चाल f → की) / "<actor> का मुख" (मुख m → का) read correctly for any actor.
 *  • Kinship: `relGeneric` stays the ENGLISH relation-ID list (the _mcq keys the engine matches against _compose2);
 *    `relTerm(id, spec)` maps id→Hindi, using the lineage SPECIFIER (pat/mat/sons/daughters/bro/sis) to render the
 *    SPECIFIC native word for the answer (मामा/चाचा/नाना) and the CANONICAL word for distractors — so EN option sets
 *    stay dedup-clean while Hindi reads native. Canonical + specific terms are pairwise distinct → options never collide.
 *  • Syllogism: quantifier forms per R.S. Aggarwal Hindi edition (सभी X, Y हैं / कोई X, Y नहीं है / कुछ X, Y (नहीं) हैं).
 *    (Noun number-agreement under a single plural noun form is an accepted, logic-neutral approximation — see
 *    I18N_KNOWN_LIMITS.) The verdict pair (निष्कर्ष निकलता है / निष्कर्ष नहीं निकलता) is answered by INDEX.
 *
 * Cipher substrates (CAT, DOG…), variable letters (A,B,P,Q), coded symbols (@#&%$, >≥<≤=), Roman numerals (I, II) and
 * digits stay Latin/symbolic in every language. Digits are 0-9 (never Devanagari numerals). Function-valued → validated
 * by gen-i18n.check, not the catalog string scanner.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* ── pools ── */
  var NAMES = ['राहुल', 'प्रिया', 'अमित', 'स्नेहा', 'विक्रम', 'नेहा', 'अर्जुन', 'काव्या', 'रोहन', 'पूजा', 'करण', 'दिव्या',
    'आदित्य', 'मीरा', 'फ़रहान', 'अनन्या', 'ईशान', 'रिया', 'कबीर', 'तारा', 'निखिल', 'सारा', 'विवेक', 'गौरी',
    'मनीष', 'ऋतु', 'आर्यन', 'दीया', 'रोहित', 'अंजलि', 'सौरभ', 'किरण'];
  /* actors are always used in a possessive frame ("<actor> की चाल" / "<actor> का मुख"), so actor gender never affects
     agreement — the marker agrees with चाल/मुख. */
  var ACTORS = ['एक व्यक्ति', 'एक पुरुष', 'एक महिला', 'एक धावक', 'एक पदयात्री', 'एक पर्यटक', 'एक सैरकर्ता', 'रवि', 'प्रिया', 'अर्जुन', 'मीरा', 'कबीर'];
  var ROW_OPENS = ['लोगों की एक पंक्ति में', 'एक सीधी पंक्ति में', 'बच्चों की एक पंक्ति में', 'एक ही पंक्ति में खड़े लोगों में', 'सभा की पंक्ति में', 'पंक्ति में खड़े मित्रों में'];
  var Q_OPENS = ['एक कतार में', 'टिकट काउंटर की कतार में', 'कतार में प्रतीक्षा करते हुए', 'बस स्टॉप की कतार में', 'कतार में खड़े लोगों में'];
  var DIR8 = ['उत्तर', 'दक्षिण', 'पूर्व', 'पश्चिम', 'उत्तर-पूर्व', 'उत्तर-पश्चिम', 'दक्षिण-पूर्व', 'दक्षिण-पश्चिम'];
  var DIR4 = ['उत्तर', 'पूर्व', 'दक्षिण', 'पश्चिम'];
  var WEEKDAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
  var MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  var NOUNS = ['बिल्लियाँ', 'कुत्ते', 'पक्षी', 'कलमें', 'किताबें', 'कारें', 'पेड़', 'फूल', 'मेज़ें', 'कुर्सियाँ', 'सेब', 'आम', 'डॉक्टर', 'शिक्षक', 'गायक', 'खिलाड़ी',
    'वकील', 'इंजीनियर', 'नर्सें', 'किसान', 'चित्रकार', 'नर्तक', 'सैनिक', 'पायलट', 'बोतलें', 'फ़ोन', 'लैपटॉप', 'दर्पण',
    'गुलाब', 'लिली', 'संतरे', 'नींबू', 'शेर', 'बाघ', 'नदियाँ', 'पहाड़', 'शहर', 'गाँव', 'द्वीप', 'पुल'];
  var WORD_GROUPS = [
    { in: ['गुलाब', 'लिली', 'चमेली', 'कमल', 'ट्यूलिप'], out: ['आम', 'सेब', 'आलू', 'गाजर', 'प्याज'] },
    { in: ['सेब', 'आम', 'केला', 'अमरूद', 'संतरा'], out: ['आलू', 'गाजर', 'मूली', 'गुलाब', 'प्याज'] },
    { in: ['शेर', 'बाघ', 'तेंदुआ', 'चीता', 'पैंथर'], out: ['गाय', 'बकरी', 'भेड़', 'घोड़ा', 'ऊँट'] },
    { in: ['तांबा', 'लोहा', 'सोना', 'चाँदी', 'ज़िंक'], out: ['ऑक्सीजन', 'प्लास्टिक', 'लकड़ी', 'काँच', 'रबर'] },
    { in: ['गौरैया', 'चील', 'तोता', 'कौआ', 'कबूतर'], out: ['शार्क', 'व्हेल', 'कोबरा', 'मेंढक', 'चूहा'] },
    { in: ['त्रिभुज', 'वर्ग', 'षट्भुज', 'पंचभुज', 'अष्टभुज'], out: ['वृत्त', 'गोला', 'घन', 'रेखा', 'बिंदु'] },
    { in: ['भारत', 'नेपाल', 'जापान', 'ब्राज़ील', 'केन्या'], out: ['एशिया', 'यूरोप', 'दिल्ली', 'पेरिस', 'नील'] },
    { in: ['गाजर', 'आलू', 'प्याज', 'मूली', 'चुकंदर'], out: ['सेब', 'आम', 'गुलाब', 'गेहूँ', 'कमल'] },
    { in: ['बुध', 'शुक्र', 'मंगल', 'बृहस्पति', 'शनि'], out: ['चंद्रमा', 'सूर्य', 'धूमकेतु', 'क्षुद्रग्रह', 'तारा'] },
    { in: ['बांसुरी', 'तुरही', 'सैक्सोफोन', 'शहनाई', 'हारमोनिका'], out: ['गिटार', 'ढोल', 'पियानो', 'वायलिन', 'तबला'] },
    { in: ['हथौड़ा', 'आरी', 'ड्रिल', 'पेचकस', 'रिंच'], out: ['कील', 'पेच', 'तख्ता', 'गोंद', 'रंग'] },
    { in: ['डॉक्टर', 'इंजीनियर', 'वकील', 'शिक्षक', 'वास्तुकार'], out: ['अस्पताल', 'पुल', 'अदालत', 'विद्यालय', 'इमारत'] }
  ];
  var VERBAL_ANALOGY = [
    { a: 'हाथ', b: 'दस्ताना', c: 'पैर', ans: 'मोजा', pool: ['मोजा', 'जूता', 'अंगुली', 'टाँग', 'एड़ी'] },
    { a: 'पक्षी', b: 'घोंसला', c: 'मधुमक्खी', ans: 'छत्ता', pool: ['छत्ता', 'जाला', 'माँद', 'बिल', 'गुफा'] },
    { a: 'कलम', b: 'लिखना', c: 'चाकू', ans: 'काटना', pool: ['काटना', 'तेज़', 'धार', 'रसोई', 'इस्पात'] },
    { a: 'डॉक्टर', b: 'मरीज़', c: 'शिक्षक', ans: 'विद्यार्थी', pool: ['विद्यार्थी', 'विद्यालय', 'पाठ', 'कक्षा', 'किताब'] },
    { a: 'दिन', b: 'रात', c: 'गर्मी', ans: 'सर्दी', pool: ['सर्दी', 'ऋतु', 'वर्षा', 'गरम', 'सूरज'] },
    { a: 'कार', b: 'गैराज', c: 'हवाई जहाज़', ans: 'हैंगर', pool: ['हैंगर', 'हवाई अड्डा', 'रनवे', 'आकाश', 'पायलट'] },
    { a: 'लेखक', b: 'किताब', c: 'संगीतकार', ans: 'संगीत', pool: ['संगीत', 'पियानो', 'गीत', 'स्वर', 'बैंड'] },
    { a: 'गाय', b: 'बछड़ा', c: 'कुत्ता', ans: 'पिल्ला', pool: ['पिल्ला', 'बिल्ली का बच्चा', 'शावक', 'बछेड़ा', 'मेमना'] },
    { a: 'पहिया', b: 'कार', c: 'पंखुड़ी', ans: 'फूल', pool: ['फूल', 'बगीचा', 'तना', 'पत्ती', 'बीज'] },
    { a: 'भूख', b: 'भोजन', c: 'प्यास', ans: 'पानी', pool: ['पानी', 'पेय', 'गिलास', 'रस', 'वर्षा'] },
    { a: 'कप्तान', b: 'टीम', c: 'प्राचार्य', ans: 'विद्यालय', pool: ['विद्यालय', 'कक्षा', 'शिक्षक', 'विद्यार्थी', 'कार्यालय'] },
    { a: 'चित्रकार', b: 'कूँची', c: 'लेखक', ans: 'कलम', pool: ['कलम', 'कागज़', 'किताब', 'स्याही', 'शब्द'] },
    { a: 'थर्मामीटर', b: 'तापमान', c: 'घड़ी', ans: 'समय', pool: ['समय', 'घंटा', 'मिनट', 'कलाई घड़ी', 'अलार्म'] },
    { a: 'पुस्तकालय', b: 'किताबें', c: 'शस्त्रागार', ans: 'हथियार', pool: ['हथियार', 'सैनिक', 'युद्ध', 'पहरेदार', 'किला'] },
    { a: 'इल्ली', b: 'तितली', c: 'टैडपोल', ans: 'मेंढक', pool: ['मेंढक', 'मछली', 'साँप', 'छिपकली', 'टोड'] },
    { a: 'फुहार', b: 'मूसलाधार', c: 'मंद पवन', ans: 'आँधी', pool: ['आँधी', 'तूफ़ान', 'हवा', 'चक्रवात', 'वायु'] }
  ];
  var INEQ_VERDICTS = ['केवल I सत्य है', 'केवल II सत्य है', 'I और II दोनों सत्य हैं', 'या तो I या II सत्य है', 'न तो I और न ही II सत्य है'];

  /* ── kinship ── relGeneric stays the ENGLISH relation-ID list (the _mcq keys); relTerm maps id (+specifier) → Hindi. */
  var PRIM_WORD = { father: 'पिता', mother: 'माता', son: 'पुत्र', daughter: 'पुत्री', brother: 'भाई', sister: 'बहन' };
  /* possessive marker agreeing with the RELATION noun (masc→का, fem→की) — used inside the blood stems. */
  var MK = { 'पिता': 'का', 'माता': 'की', 'पुत्र': 'का', 'पुत्री': 'की', 'भाई': 'का', 'बहन': 'की' };
  function mk(relWord) { return MK[relWord] || 'का'; }
  var REL_GENERIC = ['Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Nephew', 'Niece', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Cousin'];
  /* CANONICAL Hindi term per generic id (for distractors) — pairwise distinct so options never collide. */
  var CANON = {
    Grandfather: 'दादा', Grandmother: 'दादी', Uncle: 'चाचा', Aunt: 'बुआ', Grandson: 'पोता', Granddaughter: 'पोती',
    Nephew: 'भतीजा', Niece: 'भतीजी', Father: 'पिता', Mother: 'माता', Brother: 'भाई', Sister: 'बहन',
    Son: 'पुत्र', Daughter: 'पुत्री', Cousin: 'चचेरा भाई'
  };
  /* SPECIFIC term for the ANSWER, by lineage specifier — Hindi distinguishes where English collapses. */
  var SPEC = {
    'Grandfather:pat': 'दादा', 'Grandfather:mat': 'नाना',
    'Grandmother:pat': 'दादी', 'Grandmother:mat': 'नानी',
    'Uncle:pat': 'चाचा', 'Uncle:mat': 'मामा',
    'Aunt:pat': 'बुआ', 'Aunt:mat': 'मौसी',
    'Grandson:sons': 'पोता', 'Grandson:daughters': 'नाती',
    'Granddaughter:sons': 'पोती', 'Granddaughter:daughters': 'नातिन',
    'Nephew:bro': 'भतीजा', 'Nephew:sis': 'भांजा',
    'Niece:bro': 'भतीजी', 'Niece:sis': 'भांजी'
  };
  function relTerm(generic, spec) { if (spec) { var k = generic + ':' + spec; if (SPEC[k]) return SPEC[k]; } return CANON[generic] || generic; }

  var CODE_OP_WORD = { '+': 'पिता', '-': 'माता', '*': 'पुत्र', '/': 'पुत्री', '>': 'भाई', '<': 'बहन' };

  /* ── stem phrasers ── */
  var LR = {
    names: NAMES, actors: ACTORS, rowOpens: ROW_OPENS, qOpens: Q_OPENS, dir8: DIR8, dir4: DIR4,
    weekdays: WEEKDAYS, months: MONTHS, nouns: NOUNS, wordGroups: WORD_GROUPS, verbalAnalogy: VERBAL_ANALOGY,
    ineqVerdicts: INEQ_VERDICTS, relGeneric: REL_GENERIC, relTerm: relTerm, primWord: PRIM_WORD, codeOpWord: CODE_OP_WORD,

    /* 1. coding-decoding (cipher substrate stays Latin) */
    coding: {
      sum: function (w) { return 'यदि प्रत्येक अक्षर को उसके स्थान का मान दिया जाए (A=1, B=2, …, Z=26), तो शब्द "' + w + '" का कुल योग कितना है?'; },
      numcode: function (w) { return 'प्रत्येक अक्षर को उसकी स्थान-संख्या के रूप में लिखा जाता है (A=1, B=2, …, Z=26)। "' + w + '" के लिए सही कोड कौन-सा है?'; },
      revsum: function (w) { return 'एक कोड में अक्षरों का मान उलटे क्रम में है (A=26, B=25, …, Z=1)। "' + w + '" का कुल मान कितना है?'; },
      cipher: function (ex, exCode, target) { return 'किसी कोड में "' + ex + '" को "' + exCode + '" लिखा जाता है। उसी नियम से "' + target + '" को कैसे लिखा जाएगा?'; },
      posshift: function (ex, exCode, target) { return 'किसी कोड में "' + ex + '" को "' + exCode + '" लिखा जाता है। इसी नियम का पालन करते हुए "' + target + '" को कैसे लिखा जाएगा?'; },
      revshift: function (ex, exCode, target) { return 'किसी कोड में "' + ex + '" को "' + exCode + '" लिखा जाता है (शब्द को उलटा जाता है, फिर प्रत्येक अक्षर को समान संख्या से खिसकाया जाता है)। "' + target + '" को कैसे लिखा जाएगा?'; }
    },

    /* 2. blood relations (gender-safe possessive via mk()) */
    blood: {
      chainStem: function (A, B, C, r1w, r2w) { return A + ', ' + B + ' ' + mk(r1w) + ' ' + r1w + ' है। ' + B + ', ' + C + ' ' + mk(r2w) + ' ' + r2w + ' है। ' + A + ' का ' + C + ' से क्या संबंध है?'; },
      codedStem: function (legend, r1w, op1, expr, P, R) { return 'यदि दो व्यक्तियों के बीच, ' + legend + ' (बाएँ-से-दाएँ पढ़ें; जैसे "X ' + op1 + ' Y" का अर्थ है कि X, Y ' + mk(r1w) + ' ' + r1w + ' है), तो व्यंजक "' + expr + '" में ' + P + ' का ' + R + ' से क्या संबंध है?'; },
      legendItem: function (sym, relWord) { return "'" + sym + "' = " + relWord; }
    },

    /* 3. direction sense (nominalised "चाल"/"मुख" frames — no actor-gendered finite verb) */
    direction: {
      dist2: function (actor, a, nWord, b, eWord) { return actor + ' की चाल: ' + a + ' km ' + nWord + ', फिर ' + b + ' km ' + eWord + '। अब प्रारंभिक बिंदु से दूरी (km में) कितनी है?'; },
      dist3: function (actor, p1, nWord, extra, opp, b, eWord) { return actor + ' की चाल: ' + p1 + ' km ' + nWord + ', फिर ' + extra + ' km ' + opp + ', फिर ' + b + ' km ' + eWord + '। प्रारंभिक बिंदु से दूरी (km में) कितनी है?'; },
      turns: function (who, start, seq, subject) { return who + ' का मुख आरंभ में ' + start + ' की ओर है। घुमावों का क्रम: ' + seq + '। अब उसका मुख किस दिशा में होगा?'; },
      /* EN carries digits only in the about-turn ("180°"); left/right stay digit-free so the digit multiset matches EN. */
      turnPhrase: function (tn) { return tn === 'about' ? '180° (विपरीत दिशा)' : (tn === 'left' ? 'बाएँ ओर' : 'दाएँ ओर'); },
      turnJoin: ', फिर ',
      turnSubjectPerson: 'वह व्यक्ति',
      diagonal: function (actor, north, south, east, west) { return actor + ' की चाल: ' + north + ' km उत्तर, ' + south + ' km दक्षिण, ' + east + ' km पूर्व और ' + west + ' km पश्चिम। अब प्रारंभिक बिंदु से किस दिशा में है?'; }
    },

    /* 4. ranking & ordering */
    ranking: {
      total: function (rowOpen, nm, ordL, ordR, tail) { return rowOpen + ', ' + nm + ' बाएँ से ' + ordL + ' और दाएँ से ' + ordR + ' स्थान पर है। ' + tail; },
      totalTails: ['पंक्ति में कुल कितने लोग हैं?', 'पंक्ति में लोगों की कुल संख्या कितनी है?', 'पंक्ति में कुल कितने व्यक्ति खड़े हैं?'],
      otherend: function (N, nm, ordK) { return N + ' विद्यार्थियों की एक कक्षा में, ' + nm + ' का स्थान ऊपर से ' + ordK + ' है। नीचे से ' + nm + ' का स्थान क्या है?'; },
      between: function (qOpen, nm, ordA, nm2, ordB) { return qOpen + ', ' + nm + ' आगे से ' + ordA + ' और ' + nm2 + ' आगे से ' + ordB + ' स्थान पर है। उनके बीच कितने लोग खड़े हैं?'; },
      multistep: function (nm, ordL, ordR, ordP) { return 'एक पंक्ति में ' + nm + ' बाएँ से ' + ordL + ' और दाएँ से ' + ordR + ' स्थान पर है। बाएँ से ' + ordP + ' स्थान पर खड़े व्यक्ति के दाईं ओर कितने लोग हैं?'; },
      interchange: function (A, ordAL, B, ordBR, newAL) { return 'एक पंक्ति में ' + A + ' बाएँ से ' + ordAL + ' और ' + B + ' दाएँ से ' + ordBR + ' स्थान पर है। आपस में स्थान बदलने के बाद, ' + A + ' अब बाएँ छोर से ' + newAL + 'वें स्थान पर है। पंक्ति में कुल कितने लोग हैं?'; }
    },

    /* 5. odd one out */
    odd: {
      numeric: function (list) { return 'इनमें से कौन-सा अन्य से मेल नहीं खाता: ' + list + '?'; },
      letter: function (list) { return 'इनमें से तीन अक्षर-युग्म एक ही नियम का पालन करते हैं। कौन-सा युग्म विषम (भिन्न) है: ' + list + '?'; },
      word: function (list) { return 'इनमें से कौन-सा अन्य से मेल नहीं खाता: ' + list + '?'; }
    },

    /* 6. analogies */
    analogy: {
      numeric: function (a, fa, c) { return a + ' : ' + fa + ' :: ' + c + ' : ?'; },
      verbal: function (a, b, c) { return a + ' : ' + b + ' :: ' + c + ' : ?'; },
      letter: function (p1, p1code, p3) { return p1 + ' : ' + p1code + ' :: ' + p3 + ' : ?'; }
    },

    /* 7. syllogisms */
    syllo: {
      stmt: function (quant, x, y, neg) {
        if (quant === 'All') return 'सभी ' + x + ', ' + y + ' हैं';
        if (quant === 'No') return 'कोई ' + x + ', ' + y + ' नहीं है';
        return 'कुछ ' + x + ', ' + y + (neg ? ' नहीं हैं' : ' हैं');
      },
      verdict: { 'Follows': 'निष्कर्ष निकलता है', 'Does not follow': 'निष्कर्ष नहीं निकलता' },
      period: '।',
      wrap: function (premises, conclusion) { return 'कथन: ' + premises + ' निष्कर्ष: ' + conclusion + ' क्या निष्कर्ष तार्किक रूप से अनुसरण करता है?'; }
    },

    /* 8. series */
    series: { next: function (seq) { return 'श्रृंखला में अगला पद ज्ञात कीजिए:  ' + seq + ', ?'; } },

    /* 9. coded inequalities */
    inequality: {
      legendItem: function (sym, rel) { return "'" + sym + "' का अर्थ है '" + rel + "'"; },
      stem: function (legend, stmt, vi, rI, vj, rII) { return 'किसी कोड में, ' + legend + '।\nकथन: ' + stmt + '।\nनिष्कर्ष:  I. ' + vi + ' ' + rI + ' ' + vj + '   II. ' + vi + ' ' + rII + ' ' + vj + '।\nकौन-सा निष्कर्ष निश्चित रूप से सत्य है?'; }
    },

    /* 10. calendars */
    calendar: {
      dayafter: function (startWd, off) { return 'यदि आज ' + startWd + ' है, तो ' + off + ' दिनों के बाद सप्ताह का कौन-सा दिन होगा?'; },
      datediff: function (y, date1, wd1, date2) { return 'वर्ष ' + y + ' में, ' + date1 + ' को ' + wd1 + ' है। उसी वर्ष ' + date2 + ' को सप्ताह का कौन-सा दिन होगा?'; },
      dow: function (date, yy) { return date + ', ' + yy + ' को सप्ताह का कौन-सा दिन था?'; },
      fmtDate: function (d, monthName) { return d + ' ' + monthName; }
    },

    /* 11. clocks */
    clock: {
      angle0: function (h) { return h + ':00 बजे घड़ी की घंटे और मिनट की सुइयों के बीच का कोण (डिग्री में) कितना है?'; },
      angle30: function (h) { return h + ':30 बजे घड़ी की घंटे और मिनट की सुइयों के बीच का कोण (डिग्री में) कितना है?'; },
      minmove: function (mn) { return 'घड़ी की मिनट की सुई ' + mn + ' मिनट में कितने डिग्री घूमती है?'; },
      hourmin: function (em) { return 'घड़ी की घंटे की सुई ' + em + ' मिनट में कितने डिग्री घूमती है?'; },
      hourmove: function (hr) { return 'घड़ी की घंटे की सुई ' + hr + ' घंटे में कितने डिग्री घूमती है?'; },
      angle: function (clk) { return clk + ' बजे घंटे और मिनट की सुइयों के बीच का छोटा कोण (डिग्री में) कितना है?'; },
      mirror: function (clk) { return 'एक घड़ी ' + clk + ' दर्शाती है। उसका दर्पण-प्रतिबिंब कौन-सा समय दर्शाएगा?'; }
    },

    /* 12. input-output */
    io: { stem: function (nums, ordP, S) { return 'एक छँटाई मशीन एक बार में एक चरण चलती है: प्रत्येक चरण में शेष (अव्यवस्थित) भाग की सबसे छोटी संख्या को उस भाग के आगे ले जाया जाता है। इनपुट पंक्ति: ' + nums + '। चरण ' + S + ' के बाद बाएँ से ' + ordP + ' स्थान पर कौन-सी संख्या है?'; } },

    /* ordinal — Hindi oblique suffix (always followed by स्थान in the stems) */
    ord: function (n) { return n + 'वें'; }
  };

  if (GI) GI.registerLR('hi', LR);
  if (typeof module !== 'undefined' && module.exports) module.exports = LR;
})();
