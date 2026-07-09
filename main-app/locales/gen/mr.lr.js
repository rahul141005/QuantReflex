/**
 * mr.lr.js — generated-content pack (LR engine, मराठी) for QRGenI18n (ADR-111 Phase F-M6).
 *
 * A FIRST-CLASS Marathi LR pack — authored for MPSC / Talathi / ZP / पोलीस भरती aspirants in Maharashtra State Board /
 * Target-Publications register, तुम्ही-form, NOT a transliteration of the Hindi pack. lr-engine.js owns ALL RNG + math;
 * this pack owns every user-visible STRING. For a fixed RNG seed the answer, options (by relation-id / pool index),
 * subtype and difficulty are IDENTICAL to EN — only the wording differs (proven by gen-i18n.check §11).
 *
 * MARATHI-SPECIFIC ENGINEERING (blueprint §5.4.4):
 *  • किती is gender-invariant → "किती आहे?" needs no gender agreement. Directions use Sanskrit intercardinals
 *    (ईशान्य / आग्नेय / नैऋत्य / वायव्य) as Maharashtra textbooks do, NOT Hindi's उत्तर-पूर्व compounds.
 *  • Gender-safe possessive: the marker agrees with the possessed noun — "<actor> ची वाटचाल" (वाटचाल f → ची) /
 *    "<actor> चे तोंड" (तोंड n → चे) — so any name/actor reads correctly. Blood stems carry a pack-local marker+verb
 *    map (POSS) so "B चे वडील आहेत / B ची आई आहे / B चा मुलगा आहे" agree in both marker AND copula.
 *  • Kinship is genuinely Marathi, NOT Hindi: Marathi COLLAPSES the grandparent/grandchild lineage split (आजोबा/आजी,
 *    नातू/नात cover both sides) but DISTINGUISHES nephew/niece by lineage (पुतण्या=brother's son vs भाचा=sister's son;
 *    पुतणी vs भाची) and uncle/aunt (काका/मामा, आत्या/मावशी). relGeneric stays the ENGLISH relation-ID list; relTerm(id,
 *    spec) renders the SPECIFIC Marathi word for the answer and the CANONICAL word for distractors.
 *  • Sentence terminator is "." and किती/शेकडेवारी-style vocabulary matches mr.quant.js / mr.di.js (units stay Latin: km).
 *
 * Cipher substrates (CAT, DOG…), variable letters (A,B,P,Q), coded symbols (@#&%$, >≥<≤=), Roman numerals (I, II) and
 * digits stay Latin/symbolic. Digits are 0-9 (never Devanagari numerals). Function-valued → validated by gen-i18n.check.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  /* ── pools ── */
  var NAMES = ['राहुल', 'प्रिया', 'अमित', 'स्नेहा', 'विक्रम', 'नेहा', 'अर्जुन', 'काव्या', 'रोहन', 'पूजा', 'करण', 'दिव्या',
    'आदित्य', 'मीरा', 'फरहान', 'अनन्या', 'ईशान', 'रिया', 'कबीर', 'तारा', 'निखिल', 'सारा', 'विवेक', 'गौरी',
    'मनीष', 'ऋतू', 'आर्यन', 'दीया', 'रोहित', 'अंजली', 'सौरभ', 'किरण'];
  /* actors are always used in a possessive frame ("<actor> ची वाटचाल" / "<actor> चे तोंड"), so actor gender never
     affects agreement — the marker agrees with वाटचाल/तोंड. */
  var ACTORS = ['एक व्यक्ती', 'एक पुरुष', 'एक स्त्री', 'एक धावपटू', 'एक गिर्यारोहक', 'एक पर्यटक', 'एक पादचारी', 'रवी', 'प्रिया', 'अर्जुन', 'मीरा', 'कबीर'];
  var ROW_OPENS = ['लोकांच्या एका रांगेत', 'एका सरळ रांगेत', 'मुलांच्या एका रांगेत', 'एकाच रांगेत उभ्या असलेल्या लोकांमध्ये', 'सभेच्या रांगेत', 'रांगेत उभ्या असलेल्या मित्रांमध्ये'];
  var Q_OPENS = ['एका रांगेत', 'तिकीट खिडकीच्या रांगेत', 'रांगेत वाट पाहत असताना', 'बस थांब्याच्या रांगेत', 'रांगेत उभ्या असलेल्या लोकांमध्ये'];
  var DIR8 = ['उत्तर', 'दक्षिण', 'पूर्व', 'पश्चिम', 'ईशान्य', 'वायव्य', 'आग्नेय', 'नैऋत्य'];
  var DIR4 = ['उत्तर', 'पूर्व', 'दक्षिण', 'पश्चिम'];
  var WEEKDAYS = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
  var MONTHS = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'];
  var NOUNS = ['मांजरी', 'कुत्रे', 'पक्षी', 'पेन', 'पुस्तके', 'गाड्या', 'झाडे', 'फुले', 'टेबले', 'खुर्च्या', 'सफरचंद', 'आंबे', 'डॉक्टर', 'शिक्षक', 'गायक', 'खेळाडू',
    'वकील', 'इंजिनियर', 'परिचारिका', 'शेतकरी', 'चित्रकार', 'नर्तक', 'सैनिक', 'वैमानिक', 'बाटल्या', 'फोन', 'लॅपटॉप', 'आरसे',
    'गुलाब', 'लिली', 'संत्री', 'लिंबे', 'सिंह', 'वाघ', 'नद्या', 'पर्वत', 'शहरे', 'गावे', 'बेटे', 'पूल'];
  var WORD_GROUPS = [
    { in: ['गुलाब', 'लिली', 'चमेली', 'कमळ', 'ट्यूलिप'], out: ['आंबा', 'सफरचंद', 'बटाटा', 'गाजर', 'कांदा'] },
    { in: ['सफरचंद', 'आंबा', 'केळे', 'पेरू', 'संत्रे'], out: ['बटाटा', 'गाजर', 'मुळा', 'गुलाब', 'कांदा'] },
    { in: ['सिंह', 'वाघ', 'बिबट्या', 'चित्ता', 'पँथर'], out: ['गाय', 'बकरी', 'मेंढी', 'घोडा', 'उंट'] },
    { in: ['तांबे', 'लोखंड', 'सोने', 'चांदी', 'जस्त'], out: ['ऑक्सिजन', 'प्लास्टिक', 'लाकूड', 'काच', 'रबर'] },
    { in: ['चिमणी', 'गरुड', 'पोपट', 'कावळा', 'कबूतर'], out: ['शार्क', 'देवमासा', 'नाग', 'बेडूक', 'उंदीर'] },
    { in: ['त्रिकोण', 'चौरस', 'षटकोन', 'पंचकोन', 'अष्टकोन'], out: ['वर्तुळ', 'गोल', 'घन', 'रेषा', 'बिंदू'] },
    { in: ['भारत', 'नेपाळ', 'जपान', 'ब्राझील', 'केनिया'], out: ['आशिया', 'युरोप', 'दिल्ली', 'पॅरिस', 'नाईल'] },
    { in: ['गाजर', 'बटाटा', 'कांदा', 'मुळा', 'बीट'], out: ['सफरचंद', 'आंबा', 'गुलाब', 'गहू', 'कमळ'] },
    { in: ['बुध', 'शुक्र', 'मंगळ', 'गुरू', 'शनि'], out: ['चंद्र', 'सूर्य', 'धूमकेतू', 'लघुग्रह', 'तारा'] },
    { in: ['बासरी', 'तुतारी', 'सॅक्सोफोन', 'सनई', 'हार्मोनिका'], out: ['गिटार', 'ढोल', 'पियानो', 'व्हायोलिन', 'तबला'] },
    { in: ['हातोडा', 'करवत', 'ड्रिल', 'स्क्रूड्रायव्हर', 'पाना'], out: ['खिळा', 'स्क्रू', 'फळी', 'डिंक', 'रंग'] },
    { in: ['डॉक्टर', 'इंजिनियर', 'वकील', 'शिक्षक', 'वास्तुविशारद'], out: ['रुग्णालय', 'पूल', 'न्यायालय', 'शाळा', 'इमारत'] }
  ];
  var VERBAL_ANALOGY = [
    { a: 'हात', b: 'हातमोजा', c: 'पाऊल', ans: 'मोजा', pool: ['मोजा', 'बूट', 'बोट', 'पाय', 'टाच'] },
    { a: 'पक्षी', b: 'घरटे', c: 'मधमाशी', ans: 'पोळे', pool: ['पोळे', 'जाळे', 'मांद', 'बीळ', 'गुहा'] },
    { a: 'पेन', b: 'लिहिणे', c: 'सुरी', ans: 'कापणे', pool: ['कापणे', 'धारदार', 'पाते', 'स्वयंपाकघर', 'पोलाद'] },
    { a: 'डॉक्टर', b: 'रुग्ण', c: 'शिक्षक', ans: 'विद्यार्थी', pool: ['विद्यार्थी', 'शाळा', 'धडा', 'वर्ग', 'पुस्तक'] },
    { a: 'दिवस', b: 'रात्र', c: 'उन्हाळा', ans: 'हिवाळा', pool: ['हिवाळा', 'ऋतू', 'पाऊस', 'उष्ण', 'सूर्य'] },
    { a: 'कार', b: 'गॅरेज', c: 'विमान', ans: 'हँगर', pool: ['हँगर', 'विमानतळ', 'धावपट्टी', 'आकाश', 'वैमानिक'] },
    { a: 'लेखक', b: 'पुस्तक', c: 'संगीतकार', ans: 'संगीत', pool: ['संगीत', 'पियानो', 'गाणे', 'स्वर', 'बँड'] },
    { a: 'गाय', b: 'वासरू', c: 'कुत्रा', ans: 'पिल्लू', pool: ['पिल्लू', 'मांजरीचे पिल्लू', 'छावा', 'शिंगरू', 'कोकरू'] },
    { a: 'चाक', b: 'कार', c: 'पाकळी', ans: 'फूल', pool: ['फूल', 'बाग', 'देठ', 'पान', 'बी'] },
    { a: 'भूक', b: 'अन्न', c: 'तहान', ans: 'पाणी', pool: ['पाणी', 'पेय', 'ग्लास', 'रस', 'पाऊस'] },
    { a: 'कर्णधार', b: 'संघ', c: 'मुख्याध्यापक', ans: 'शाळा', pool: ['शाळा', 'वर्ग', 'शिक्षक', 'विद्यार्थी', 'कार्यालय'] },
    { a: 'चित्रकार', b: 'कुंचला', c: 'लेखक', ans: 'पेन', pool: ['पेन', 'कागद', 'पुस्तक', 'शाई', 'शब्द'] },
    { a: 'थर्मामीटर', b: 'तापमान', c: 'घड्याळ', ans: 'वेळ', pool: ['वेळ', 'तास', 'मिनिट', 'मनगटी घड्याळ', 'गजर'] },
    { a: 'ग्रंथालय', b: 'पुस्तके', c: 'शस्त्रागार', ans: 'शस्त्रे', pool: ['शस्त्रे', 'सैनिक', 'युद्ध', 'रक्षक', 'किल्ला'] },
    { a: 'अळी', b: 'फुलपाखरू', c: 'बेडकाचे पिल्लू', ans: 'बेडूक', pool: ['बेडूक', 'मासा', 'साप', 'सरडा', 'टोड'] },
    { a: 'रिमझिम', b: 'मुसळधार', c: 'झुळूक', ans: 'वादळी वारा', pool: ['वादळी वारा', 'वादळ', 'वारा', 'चक्रीवादळ', 'हवा'] }
  ];
  var INEQ_VERDICTS = ['फक्त I सत्य आहे', 'फक्त II सत्य आहे', 'I आणि II दोन्ही सत्य आहेत', 'एकतर I किंवा II सत्य आहे', 'I किंवा II पैकी एकही सत्य नाही'];

  /* ── kinship ── relGeneric stays the ENGLISH relation-ID list; relTerm maps id (+specifier) → Marathi.
     Marathi collapses grandparent/grandchild lineage (आजोबा/आजी, नातू/नात) but distinguishes uncle/aunt and nephew/niece. */
  var PRIM_WORD = { father: 'वडील', mother: 'आई', son: 'मुलगा', daughter: 'मुलगी', brother: 'भाऊ', sister: 'बहीण' };
  /* possessive marker + copula agreeing with the RELATION noun (वडील is honorific plural → चे … आहेत). */
  var POSS = {
    'वडील': { mk: 'चे', v: 'आहेत' }, 'आई': { mk: 'ची', v: 'आहे' }, 'मुलगा': { mk: 'चा', v: 'आहे' },
    'मुलगी': { mk: 'ची', v: 'आहे' }, 'भाऊ': { mk: 'चा', v: 'आहे' }, 'बहीण': { mk: 'ची', v: 'आहे' }
  };
  function poss(relWord) { return POSS[relWord] || { mk: 'चा', v: 'आहे' }; }
  var REL_GENERIC = ['Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Grandson', 'Granddaughter', 'Nephew', 'Niece', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Cousin'];
  /* CANONICAL Marathi term per generic id (for distractors) — pairwise distinct so options never collide. */
  var CANON = {
    Grandfather: 'आजोबा', Grandmother: 'आजी', Uncle: 'काका', Aunt: 'आत्या', Grandson: 'नातू', Granddaughter: 'नात',
    Nephew: 'पुतण्या', Niece: 'पुतणी', Father: 'वडील', Mother: 'आई', Brother: 'भाऊ', Sister: 'बहीण',
    Son: 'मुलगा', Daughter: 'मुलगी', Cousin: 'चुलत भाऊ'
  };
  /* SPECIFIC term for the ANSWER. Marathi collapses grandparent(आजोबा/आजी)/grandchild(नातू/नात) lineage — both pat/mat
     and sons/daughters render the SAME word — but distinguishes uncle/aunt (काका/मामा, आत्या/मावशी) and nephew/niece
     (पुतण्या/भाचा, पुतणी/भाची). */
  var SPEC = {
    'Grandfather:pat': 'आजोबा', 'Grandfather:mat': 'आजोबा',
    'Grandmother:pat': 'आजी', 'Grandmother:mat': 'आजी',
    'Uncle:pat': 'काका', 'Uncle:mat': 'मामा',
    'Aunt:pat': 'आत्या', 'Aunt:mat': 'मावशी',
    'Grandson:sons': 'नातू', 'Grandson:daughters': 'नातू',
    'Granddaughter:sons': 'नात', 'Granddaughter:daughters': 'नात',
    'Nephew:bro': 'पुतण्या', 'Nephew:sis': 'भाचा',
    'Niece:bro': 'पुतणी', 'Niece:sis': 'भाची'
  };
  function relTerm(generic, spec) { if (spec) { var k = generic + ':' + spec; if (SPEC[k]) return SPEC[k]; } return CANON[generic] || generic; }

  var CODE_OP_WORD = { '+': 'वडील', '-': 'आई', '*': 'मुलगा', '/': 'मुलगी', '>': 'भाऊ', '<': 'बहीण' };

  /* ── stem phrasers ── */
  var LR = {
    names: NAMES, actors: ACTORS, rowOpens: ROW_OPENS, qOpens: Q_OPENS, dir8: DIR8, dir4: DIR4,
    weekdays: WEEKDAYS, months: MONTHS, nouns: NOUNS, wordGroups: WORD_GROUPS, verbalAnalogy: VERBAL_ANALOGY,
    ineqVerdicts: INEQ_VERDICTS, relGeneric: REL_GENERIC, relTerm: relTerm, primWord: PRIM_WORD, codeOpWord: CODE_OP_WORD,

    /* 1. coding-decoding (cipher substrate stays Latin) */
    coding: {
      sum: function (w) { return 'जर प्रत्येक अक्षराला त्याच्या स्थानाचे मूल्य दिले (A=1, B=2, …, Z=26), तर "' + w + '" या शब्दाची एकूण बेरीज किती आहे?'; },
      numcode: function (w) { return 'प्रत्येक अक्षर त्याच्या स्थान-क्रमांकाच्या रूपात लिहिले जाते (A=1, B=2, …, Z=26). "' + w + '" साठी योग्य कोड कोणता आहे?'; },
      revsum: function (w) { return 'एका कोडमध्ये अक्षरांचे मूल्य उलट्या क्रमाने आहे (A=26, B=25, …, Z=1). "' + w + '" चे एकूण मूल्य किती आहे?'; },
      cipher: function (ex, exCode, target) { return 'एका कोडमध्ये "' + ex + '" हे "' + exCode + '" असे लिहिले जाते. त्याच नियमाने "' + target + '" कसे लिहिले जाईल?'; },
      posshift: function (ex, exCode, target) { return 'एका कोडमध्ये "' + ex + '" हे "' + exCode + '" असे लिहिले जाते. याच नियमाचे पालन करून "' + target + '" कसे लिहिले जाईल?'; },
      revshift: function (ex, exCode, target) { return 'एका कोडमध्ये "' + ex + '" हे "' + exCode + '" असे लिहिले जाते (शब्द उलटा केला जातो, नंतर प्रत्येक अक्षर तेवढ्याच संख्येने सरकवले जाते). "' + target + '" कसे लिहिले जाईल?'; }
    },

    /* 2. blood relations (gender-safe possessive+copula via POSS) */
    blood: {
      /* Marathi genitive markers (चा/ची/चे/शी) SUFFIX the name without a space — मीराची, not मीरा ची. */
      chainStem: function (A, B, C, r1w, r2w) { var p1 = poss(r1w), p2 = poss(r2w); return A + ', ' + B + p1.mk + ' ' + r1w + ' ' + p1.v + '. ' + B + ', ' + C + p2.mk + ' ' + r2w + ' ' + p2.v + '. ' + A + 'चा ' + C + 'शी काय संबंध आहे?'; },
      codedStem: function (legend, r1w, op1, expr, P, R) { var p1 = poss(r1w); return 'जर दोन व्यक्तींमध्ये, ' + legend + ' (डावीकडून-उजवीकडे वाचा; उदा. "X ' + op1 + ' Y" म्हणजे X, Y ' + p1.mk + ' ' + r1w + ' ' + p1.v + '), तर "' + expr + '" या पदावलीत ' + P + ' चा ' + R + ' शी काय संबंध आहे?'; },
      legendItem: function (sym, relWord) { return "'" + sym + "' = " + relWord; }
    },

    /* 3. direction sense (nominalised "वाटचाल"/"तोंड" frames — no actor-gendered finite verb) */
    direction: {
      /* Appositive dash frame — the actor stays in NOMINATIVE (no oblique/genitive), so masculine common-noun actors
         (गिर्यारोहक → गिर्यारोहकाची) never mis-inflect, and it is gender-safe for any actor. */
      dist2: function (actor, a, nWord, b, eWord) { return actor + ' — वाटचाल: ' + a + ' km ' + nWord + ', मग ' + b + ' km ' + eWord + '. आता प्रारंभबिंदूपासून अंतर (km मध्ये) किती आहे?'; },
      dist3: function (actor, p1, nWord, extra, opp, b, eWord) { return actor + ' — वाटचाल: ' + p1 + ' km ' + nWord + ', मग ' + extra + ' km ' + opp + ', मग ' + b + ' km ' + eWord + '. प्रारंभबिंदूपासून अंतर (km मध्ये) किती आहे?'; },
      turns: function (who, start, seq, subject) { return who + ' — सुरुवातीचे तोंड ' + start + ' दिशेला. वळणांचा क्रम: ' + seq + '. अंतिम तोंड कोणत्या दिशेला असेल?'; },
      /* EN carries digits only in the about-turn ("180°"); left/right stay digit-free so the digit multiset matches EN. */
      turnPhrase: function (tn) { return tn === 'about' ? '180° (विरुद्ध दिशा)' : (tn === 'left' ? 'डावीकडे' : 'उजवीकडे'); },
      turnJoin: ', मग ',
      turnSubjectPerson: 'ती व्यक्ती',
      diagonal: function (actor, north, south, east, west) { return actor + ' — वाटचाल: ' + north + ' km उत्तर, ' + south + ' km दक्षिण, ' + east + ' km पूर्व आणि ' + west + ' km पश्चिम. आता प्रारंभबिंदूपासून कोणत्या दिशेला आहे?'; }
    },

    /* 4. ranking & ordering */
    ranking: {
      total: function (rowOpen, nm, ordL, ordR, tail) { return rowOpen + ', ' + nm + ' डावीकडून ' + ordL + ' आणि उजवीकडून ' + ordR + ' स्थानावर आहे. ' + tail; },
      totalTails: ['रांगेत एकूण किती लोक आहेत?', 'रांगेतील लोकांची एकूण संख्या किती आहे?', 'रांगेत एकूण किती व्यक्ती उभ्या आहेत?'],
      otherend: function (N, nm, ordK) { return N + ' विद्यार्थ्यांच्या एका वर्गात, ' + nm + 'चे स्थान वरून ' + ordK + ' आहे. खालून ' + nm + 'चे स्थान कोणते आहे?'; },
      between: function (qOpen, nm, ordA, nm2, ordB) { return qOpen + ', ' + nm + ' पुढून ' + ordA + ' आणि ' + nm2 + ' पुढून ' + ordB + ' स्थानावर आहे. त्यांच्यामध्ये किती लोक उभे आहेत?'; },
      multistep: function (nm, ordL, ordR, ordP) { return 'एका रांगेत ' + nm + ' डावीकडून ' + ordL + ' आणि उजवीकडून ' + ordR + ' स्थानावर आहे. डावीकडून ' + ordP + ' स्थानावर उभ्या असलेल्या व्यक्तीच्या उजवीकडे किती लोक आहेत?'; },
      interchange: function (A, ordAL, B, ordBR, newAL) { return 'एका रांगेत ' + A + ' डावीकडून ' + ordAL + ' आणि ' + B + ' उजवीकडून ' + ordBR + ' स्थानावर आहे. एकमेकांच्या जागा बदलल्यानंतर, ' + A + ' आता डाव्या टोकापासून ' + newAL + 'व्या स्थानावर आहे. रांगेत एकूण किती लोक आहेत?'; }
    },

    /* 5. odd one out */
    odd: {
      numeric: function (list) { return 'यांपैकी कोणते इतरांशी जुळत नाही: ' + list + '?'; },
      letter: function (list) { return 'यांपैकी तीन अक्षर-जोड्या एकाच नियमाचे पालन करतात. कोणती जोडी विषम (वेगळी) आहे: ' + list + '?'; },
      word: function (list) { return 'यांपैकी कोणते इतरांशी जुळत नाही: ' + list + '?'; }
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
        if (quant === 'All') return 'सर्व ' + x + ', ' + y + ' आहेत';
        if (quant === 'No') return 'एकही ' + x + ', ' + y + ' नाही';
        return 'काही ' + x + ', ' + y + (neg ? ' नाहीत' : ' आहेत');
      },
      verdict: { 'Follows': 'निष्कर्ष निघतो', 'Does not follow': 'निष्कर्ष निघत नाही' },
      period: '.',
      wrap: function (premises, conclusion) { return 'विधाने: ' + premises + ' निष्कर्ष: ' + conclusion + ' निष्कर्ष तार्किकदृष्ट्या निघतो का?'; }
    },

    /* 8. series */
    series: { next: function (seq) { return 'मालिकेतील पुढील पद शोधा:  ' + seq + ', ?'; } },

    /* 9. coded inequalities */
    inequality: {
      legendItem: function (sym, rel) { return "'" + sym + "' म्हणजे '" + rel + "'"; },
      stem: function (legend, stmt, vi, rI, vj, rII) { return 'एका कोडमध्ये, ' + legend + '.\nविधान: ' + stmt + '.\nनिष्कर्ष:  I. ' + vi + ' ' + rI + ' ' + vj + '   II. ' + vi + ' ' + rII + ' ' + vj + '.\nकोणता निष्कर्ष निश्चितपणे सत्य आहे?'; }
    },

    /* 10. calendars */
    calendar: {
      dayafter: function (startWd, off) { return 'जर आज ' + startWd + ' असेल, तर ' + off + ' दिवसांनंतर आठवड्याचा कोणता वार असेल?'; },
      datediff: function (y, date1, wd1, date2) { return y + ' या वर्षी, ' + date1 + ' रोजी ' + wd1 + ' आहे. त्याच वर्षी ' + date2 + ' रोजी आठवड्याचा कोणता वार असेल?'; },
      dow: function (date, yy) { return date + ', ' + yy + ' रोजी आठवड्याचा कोणता वार होता?'; },
      fmtDate: function (d, monthName) { return d + ' ' + monthName; }
    },

    /* 11. clocks */
    clock: {
      angle0: function (h) { return h + ':00 वाजता घड्याळाच्या तास व मिनिट काट्यांमधील कोन (अंशांत) किती आहे?'; },
      angle30: function (h) { return h + ':30 वाजता घड्याळाच्या तास व मिनिट काट्यांमधील कोन (अंशांत) किती आहे?'; },
      minmove: function (mn) { return 'घड्याळाचा मिनिट काटा ' + mn + ' मिनिटांत किती अंश फिरतो?'; },
      hourmin: function (em) { return 'घड्याळाचा तास काटा ' + em + ' मिनिटांत किती अंश फिरतो?'; },
      hourmove: function (hr) { return 'घड्याळाचा तास काटा ' + hr + ' तासांत किती अंश फिरतो?'; },
      angle: function (clk) { return clk + ' वाजता तास व मिनिट काट्यांमधील लहान कोन (अंशांत) किती आहे?'; },
      mirror: function (clk) { return 'एक घड्याळ ' + clk + ' दर्शवते. त्याचे आरशातील प्रतिबिंब कोणती वेळ दर्शवेल?'; }
    },

    /* 12. input-output */
    io: { stem: function (nums, ordP, S) { return 'एक क्रमवारी यंत्र एका वेळी एक टप्पा चालते: प्रत्येक टप्प्यात उर्वरित (क्रम न लावलेल्या) भागातील सर्वात लहान संख्या त्या भागाच्या पुढे नेली जाते. इनपुट ओळ: ' + nums + '. टप्पा ' + S + ' नंतर डावीकडून ' + ordP + ' स्थानावर कोणती संख्या आहे?'; } },

    /* ordinal — Marathi oblique suffix (always followed by स्थान in the stems) */
    ord: function (n) { return n + 'व्या'; }
  };

  if (GI) GI.registerLR('mr', LR);
  if (typeof module !== 'undefined' && module.exports) module.exports = LR;
})();
