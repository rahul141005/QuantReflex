/**
 * hi.di.js — generated-content pack (DI engine, Hindi) for QRGenI18n (ADR-111 Phase F-M5).
 *
 * First-class exam-book Hindi (CAT / Bank PO / SSC / Railway DI register, आप-form). Structure mirrors en.di.js EXACTLY
 * (same theme count/order, same stem/chart phraser keys); the engine reads this pack for the active study language and
 * feeds it the indices/values it computed, so the dataset/answer/chart-NUMBERS are byte-identical to EN and only the
 * wording changes (enforced by gen-i18n.check §10 invariance + digit + leak + Devanagari-digit). Entity brand/city/
 * scheme names transliterate to Devanagari; metric/unit/series/context words translate; ₹/%/digits/single-letter codes
 * (A–F, P–U, X, Y) and all-caps acronyms (LIC, SBI, BSNL, UPI, GDP, ELSS…) stay Latin. Numeric theme config (`range`)
 * is identical to EN by construction. Function-valued → validated by gen-i18n.check.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  var ENTITY_THEMES = [
    { entity: 'कंपनी', items: ['A', 'B', 'C', 'D', 'E', 'F'], pre: 'कंपनी ', metric: 'बिक्री', unit: '₹ करोड़', series: ['2022', '2023', '2024'] },
    { entity: 'बैंक शाखा', items: ['दिल्ली', 'मुंबई', 'चेन्नई', 'कोलकाता', 'पुणे', 'जयपुर'], pre: '', metric: 'वितरित ऋण', unit: '₹ लाख', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'उत्पाद', items: ['P', 'Q', 'R', 'S', 'T', 'U'], pre: 'उत्पाद ', metric: 'बेची गई इकाई', unit: "'000 इकाई", series: ['ऑनलाइन', 'खुदरा'] },
    { entity: 'विद्यालय', items: ['रोज़वुड', 'हिलटॉप', 'ग्रीनफ़ील्ड', 'लेकसाइड', 'ओकरिज', 'सनराइज'], pre: '', metric: 'नामांकित विद्यार्थी', unit: '', series: ['लड़के', 'लड़कियाँ'], range: [240, 1200, 4] },
    { entity: 'विभाग', items: ['एचआर', 'बिक्री', 'आईटी', 'वित्त', 'परिचालन', 'विधि'], pre: '', metric: 'कर्मचारी', unit: '', series: ['2023', '2024'] },
    { entity: 'शहर', items: ['इंदौर', 'सूरत', 'नागपुर', 'कोच्चि', 'पटना', 'भोपाल'], pre: '', metric: 'बुक टिकट', unit: '', series: ['Q1', 'Q2'], range: [200, 900, 5] },
    { entity: 'स्टोर', items: ['अल्फ़ा', 'बीटा', 'गामा', 'डेल्टा', 'एको', 'फ़ॉक्सट्रॉट'], pre: '', metric: 'राजस्व', unit: '₹ लाख', series: ['2023', '2024'] },
    { entity: 'राज्य', items: ['पंजाब', 'हरियाणा', 'गुजरात', 'केरल', 'असम', 'ओडिशा'], pre: '', metric: 'गेहूँ उत्पादन', unit: "'000 टन", series: ['खरीफ़', 'रबी'], range: [150, 900, 5] },
    { entity: 'राज्य', items: ['महाराष्ट्र', 'बिहार', 'राजस्थान', 'कर्नाटक', 'तेलंगाना', 'गोवा'], pre: '', metric: 'जनसंख्या', unit: 'लाख', series: ['शहरी', 'ग्रामीण'], range: [40, 360, 2] },
    { entity: 'देश', items: ['भारत', 'चीन', 'ब्राज़ील', 'जर्मनी', 'केन्या', 'वियतनाम'], pre: '', metric: 'निर्यात', unit: '₹ करोड़', series: ['2023', '2024'], range: [200, 1200, 5] },
    { entity: 'अस्पताल', items: ['सिविल', 'अपोलो', 'फ़ोर्टिस', 'मणिपाल', 'मेदांता', 'KIMS'], pre: '', metric: 'भर्ती मरीज़', unit: '', series: ['सामान्य', 'ICU'], range: [120, 720, 4] },
    { entity: 'प्लेटफ़ॉर्म', items: ['फ्लिपकार्ट', 'अमेज़न', 'मीशो', 'नायका', 'अजियो', 'टाटा न्यू'], pre: '', metric: 'ऑर्डर', unit: "'000", series: ['फ़ैशन', 'इलेक्ट्रॉनिक्स'], range: [60, 480, 3] },
    { entity: 'ऑपरेटर', items: ['जियो', 'एयरटेल', 'वोडाफ़ोन', 'BSNL', 'MTNL', 'ACT'], pre: '', metric: 'ग्राहक', unit: 'लाख', series: ['प्रीपेड', 'पोस्टपेड'], range: [40, 360, 2] },
    { entity: 'विद्युत संयंत्र', items: ['कोरबा', 'सिंगरौली', 'विंध्य', 'तालचेर', 'रामागुंडम', 'सिपत'], pre: '', metric: 'उत्पादित बिजली', unit: 'MW', series: ['तापीय', 'सौर'], range: [150, 900, 5] },
    { entity: 'गंतव्य', items: ['आगरा', 'जयपुर', 'गोवा', 'मुन्नार', 'शिमला', 'हम्पी'], pre: '', metric: 'पर्यटक आगमन', unit: "'000", series: ['घरेलू', 'विदेशी'], range: [60, 540, 3] },
    { entity: 'रेलवे ज़ोन', items: ['उत्तर', 'पश्चिम', 'मध्य', 'दक्षिण', 'पूर्व', 'पूर्वोत्तर'], pre: '', metric: 'ढोए गए यात्री', unit: 'लाख', series: ['AC', 'नॉन-AC'], range: [80, 600, 4] },
    { entity: 'हवाई अड्डा', items: ['दिल्ली', 'मुंबई', 'बेंगलुरु', 'हैदराबाद', 'कोलकाता', 'कोच्चि'], pre: '', metric: 'संचालित उड़ानें', unit: "'00", series: ['घरेलू', 'अंतर्राष्ट्रीय'], range: [40, 320, 2] },
    { entity: 'बीमाकर्ता', items: ['LIC', 'HDFC', 'SBI', 'ICICI', 'मैक्स', 'बजाज'], pre: '', metric: 'एकत्रित प्रीमियम', unit: '₹ करोड़', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'फ़ंड', items: ['ब्लूचिप', 'मिडकैप', 'स्मॉलकैप', 'फ्लेक्सीकैप', 'इंडेक्स', 'ELSS'], pre: '', metric: 'प्रबंधित परिसंपत्ति', unit: '₹ करोड़', series: ['इक्विटी', 'ऋण'], range: [150, 900, 5] },
    { entity: 'ज़िला', items: ['चेरापूंजी', 'मौसिनराम', 'पासीघाट', 'अगुंबे', 'अंबोली', 'गंगटोक'], pre: '', metric: 'वर्षा', unit: 'mm', series: ['2023', '2024'], range: [400, 1600, 5] },
    { entity: 'कारख़ाना', items: ['यूनिट 1', 'यूनिट 2', 'यूनिट 3', 'यूनिट 4', 'यूनिट 5', 'यूनिट 6'], pre: '', metric: 'उत्पादन', unit: "'000 इकाई", series: ['शिफ़्ट A', 'शिफ़्ट B'], range: [80, 480, 4] },
    { entity: 'टीम', items: ['फ़ाल्कन्स', 'टाइगर्स', 'स्ट्राइकर्स', 'वॉरियर्स', 'रॉयल्स', 'टाइटन्स'], pre: '', metric: 'किए गए गोल', unit: '', series: ['घरेलू', 'बाहरी'], range: [12, 90, 1] },
    { entity: 'मॉल', items: ['फ़ीनिक्स', 'ओरायन', 'फ़ोरम', 'सेलेक्ट', 'लुलु', 'इनऑर्बिट'], pre: '', metric: 'आगंतुक संख्या', unit: "'000", series: ['कार्यदिवस', 'सप्ताहांत'], range: [60, 480, 3] }
  ];
  var TIME_THEMES = [
    { metric: 'राजस्व', unit: '₹ करोड़', series: ['प्लांट X', 'प्लांट Y'] },
    { metric: 'उत्पादन', unit: "'000 इकाई", series: ['यूनिट A', 'यूनिट B'] },
    { metric: 'लाभ', unit: '₹ लाख', series: ['डिवीज़न 1', 'डिवीज़न 2'] },
    { metric: 'वेबसाइट आगंतुक', unit: "'000", series: ['मोबाइल', 'डेस्कटॉप'] },
    { metric: 'निर्यात', unit: '₹ करोड़', series: ['पूर्वी क्षेत्र', 'पश्चिमी क्षेत्र'] },
    { metric: 'आयात', unit: '₹ करोड़', series: ['कच्चा तेल', 'मशीनरी'] },
    { metric: 'जीडीपी', unit: "₹ '000 करोड़", series: ['सेवाएँ', 'उद्योग'] },
    { metric: 'वर्षा', unit: 'mm', series: ['तटीय', 'अंतर्देशीय'], range: [60, 320] },
    { metric: 'पर्यटक आगमन', unit: "'000", series: ['घरेलू', 'विदेशी'] },
    { metric: 'कार बिक्री', unit: "'000 इकाई", series: ['पेट्रोल', 'EV'] },
    { metric: 'मोबाइल ग्राहक', unit: 'लाख', series: ['प्रीपेड', 'पोस्टपेड'] },
    { metric: 'विद्युत उत्पादन', unit: 'मिलियन इकाई', series: ['तापीय', 'नवीकरणीय'] },
    { metric: 'डिजिटल भुगतान', unit: '₹ करोड़', series: ['UPI', 'कार्ड'] },
    { metric: 'चीनी उत्पादन', unit: "'000 टन", series: ['मिल A', 'मिल B'] }
  ];
  var CASELET_CTX = [
    { whole: 'सर्वेक्षित लोगों', g1: 'पुरुष', g2: 'महिलाएँ', act: 'ऑनलाइन शॉपिंग पसंद की' },
    { whole: 'कक्षा के विद्यार्थियों', g1: 'लड़के', g2: 'लड़कियाँ', act: 'परीक्षा पास की' },
    { whole: 'फ़र्म के कर्मचारियों', g1: 'प्रबंधक', g2: 'स्टाफ़', act: 'नई नीति चुनी' },
    { whole: 'मेले के आगंतुकों', g1: 'वयस्क', g2: 'बच्चे', act: 'ऑनलाइन टिकट ख़रीदा' },
    { whole: 'सर्वेक्षित यात्रियों', g1: 'कार उपयोगकर्ता', g2: 'बस उपयोगकर्ता', act: 'नई मेट्रो लाइन का समर्थन किया' },
    { whole: 'ग्राहकों', g1: 'वार्षिक सदस्य', g2: 'मासिक सदस्य', act: 'इस वर्ष नवीनीकरण किया' },
    { whole: 'ऋण आवेदकों', g1: 'वेतनभोगी आवेदक', g2: 'स्व-रोज़गार आवेदक', act: 'स्वीकृति पाई' },
    { whole: 'खाताधारकों', g1: 'बचत-खाताधारक', g2: 'चालू-खाताधारक', act: 'मोबाइल बैंकिंग का उपयोग किया' },
    { whole: 'उपस्थित अभ्यर्थियों', g1: 'पुरुष अभ्यर्थी', g2: 'महिला अभ्यर्थी', act: 'कट-ऑफ़ पार की' },
    { whole: 'पंजीकृत मतदाताओं', g1: 'पहली-बार मतदाता', g2: 'पुनः मतदाता', act: 'मतदान किया' },
    { whole: 'पॉलिसीधारकों', g1: 'टर्म-प्लान धारक', g2: 'एंडोमेंट-प्लान धारक', act: 'अपनी पॉलिसी नवीनीकृत की' },
    { whole: 'सर्वेक्षित परिवारों', g1: 'शहरी परिवार', g2: 'ग्रामीण परिवार', act: 'स्मार्टफ़ोन ख़रीदा' },
    { whole: 'ज़िले के किसानों', g1: 'छोटे किसान', g2: 'बड़े किसान', act: 'नया बीज अपनाया' },
    { whole: 'भर्ती मरीज़ों', g1: 'बीमाकृत मरीज़', g2: 'बिना-बीमा मरीज़', act: 'एक सप्ताह में छुट्टी पाई' },
    { whole: 'सर्वेक्षित यात्रियों', g1: 'व्यावसायिक यात्री', g2: 'अवकाश यात्री', act: 'ऐप से बुकिंग की' },
    { whole: 'कंपनी के कर्मचारियों', g1: 'ऑन-साइट स्टाफ़', g2: 'रिमोट स्टाफ़', act: 'प्रशिक्षण में नामांकित हुए' }
  ];
  var SUBJECTS = ['कंपनी XYZ', 'फ़र्म', 'संयंत्र', 'पोर्टल', 'ब्रांड', 'नेटवर्क', 'शृंखला'];

  var NOUN = { chart: 'चार्ट', table: 'तालिका', graph: 'ग्राफ़' };
  var AXIS_YEAR = 'वर्ष';

  function plural(w) { return w; }   // Hindi: numeral + singular noun reads naturally in DI stems
  function metricUnit(d) { return d.metric + (d.unit ? ' (' + d.unit + ' में)' : ''); }
  function ents(d) { return d.labels.length + ' ' + d.entity; }

  var STEM_VARIETY = { total: 3, avg: 3 };

  var ENTITY_STEM = {
    read: function (d, c) { return d.labels[c.i] + ' का ' + d.metric + ' कितना है?'; },
    max: function (d) { return 'किस ' + d.entity + ' का ' + d.metric + ' सबसे अधिक है? वह मान दर्ज कीजिए।'; },
    min: function (d) { return 'किस ' + d.entity + ' का ' + d.metric + ' सबसे कम है? वह मान दर्ज कीजिए।'; },
    rank: function (d, c) { return 'इन ' + d.entity + ' में ' + (c.r === 2 ? 'दूसरा' : 'तीसरा') + ' सबसे अधिक ' + d.metric + ' कितना है?'; },
    total: function (d, c) { return [
      'दिखाए गए सभी ' + ents(d) + ' का कुल ' + d.metric + ' कितना है?',
      'इन ' + ents(d) + ' का संयुक्त ' + d.metric + ' कितना है?',
      'सभी मिलाकर, इन ' + ents(d) + ' का कुल ' + d.metric + ' कितना है?'][c.vi]; },
    diff: function (d, c) { return d.labels[c.i] + ' का ' + d.metric + ', ' + d.labels[c.j] + ' के ' + d.metric + ' से कितना भिन्न है? (अंतर दर्ज कीजिए)'; },
    avg: function (d, c) { return [
      'सभी ' + ents(d) + ' में औसत ' + d.metric + ' कितना है?',
      'इन ' + ents(d) + ' में प्रति ' + d.entity + ' औसत ' + d.metric + ' कितना है?',
      'औसतन, इन ' + ents(d) + ' में एक ' + d.entity + ' का ' + d.metric + ' कितना है?'][c.vi]; },
    share: function (d, c) { return d.labels[c.i] + ', कुल ' + d.metric + ' का कितने प्रतिशत है? (1 दशमलव स्थान तक)'; },
    missing: function (d, c) { return 'सभी ' + d.labels.length + ' ' + d.entity + ' का कुल ' + d.metric + ' ' + c.total + ' है। यदि ' + d.labels[c.i] + ' को छोड़कर हर मान दिखाए अनुसार है, तो ' + d.labels[c.i] + ' का ' + d.metric + ' क्या है?'; },
    pctMore: function (d, c) { return d.labels[c.i] + ' का ' + d.metric + ', ' + d.labels[c.j] + ' के ' + d.metric + ' से कितने प्रतिशत भिन्न है? (1 दशमलव स्थान तक, निरपेक्ष मान)'; },
    deviation: function (d, c) { return d.labels[c.i] + ' का ' + d.metric + ', सभी ' + d.labels.length + ' के औसत से कितने प्रतिशत भिन्न है? (1 दशमलव स्थान तक, निरपेक्ष मान)'; },
    combinedShare: function (d, c) { return d.labels[c.i] + ' और ' + d.labels[c.j] + ' मिलकर कुल ' + d.metric + ' का कितने प्रतिशत योगदान करते हैं? (1 दशमलव स्थान तक)'; },
    ratioSimplest: function (d, c) { return d.labels[c.i] + ' के ' + d.metric + ' का ' + d.labels[c.j] + ' के ' + d.metric + ' से अनुपात क्या है? इसे सरलतम रूप a:b में व्यक्त कीजिए और a दर्ज कीजिए।'; },
    ratioTimes: function (d, c) { return d.labels[c.i] + ' का ' + d.metric + ', ' + d.labels[c.j] + ' के ' + d.metric + ' का कितने गुना है? (1 दशमलव स्थान तक)'; },
    pctMorePrimary: function (d, c) { return d.labels[c.i] + ' का ' + d.metric + ', ' + d.labels[c.j] + ' के ' + d.metric + ' से कितने प्रतिशत अधिक है? (1 दशमलव स्थान तक, निरपेक्ष मान)'; }
  };

  var TIME_STEM = {
    read: function (d, c) { return d.labels[c.i] + ' में ' + d.metric + ' कितना था?'; },
    peak: function (d) { return 'किसी एक वर्ष में दर्ज सबसे अधिक ' + d.metric + ' कितना था? वह मान दर्ज कीजिए।'; },
    trough: function (d) { return 'किसी एक वर्ष में दर्ज सबसे कम ' + d.metric + ' कितना था? वह मान दर्ज कीजिए।'; },
    total: function (d) { return 'सभी ' + d.labels.length + ' वर्षों में कुल ' + d.metric + ' कितना है?'; },
    diff: function (d, c) { return d.labels[c.i - 1] + ' से ' + d.labels[c.i] + ' तक ' + d.metric + ' में कितना परिवर्तन हुआ? (अंतर दर्ज कीजिए)'; },
    avg: function (d) { return 'इन ' + d.labels.length + ' वर्षों में औसत वार्षिक ' + d.metric + ' कितना है?'; },
    biggestJump: function (d) { return 'किन्हीं दो लगातार वर्षों के बीच ' + d.metric + ' में सबसे बड़ा परिवर्तन क्या है?'; },
    yoy: function (d, c) { return d.labels[c.y - 1] + ' से ' + d.labels[c.y] + ' तक ' + d.metric + ' में कितने प्रतिशत परिवर्तन हुआ? (1 दशमलव स्थान तक, निरपेक्ष मान)'; },
    cumulativeShare: function (d, c) { return 'पहले ' + c.half + ' वर्षों ने कुल ' + d.metric + ' का कितने प्रतिशत योगदान दिया? (1 दशमलव स्थान तक)'; },
    overallGrowth: function (d) { return 'पूरी अवधि (' + d.labels[0] + ' से ' + d.labels[d.labels.length - 1] + ') में ' + d.metric + ' कितने प्रतिशत बदला? (1 दशमलव स्थान तक, निरपेक्ष मान)'; }
  };

  var MULTI_STEM = {
    m_pctDiff: function (d, c) { return d.labels[c.yi] + ' में, ' + c.aName + ' का ' + d.metric + ', ' + c.bName + ' के ' + d.metric + ' से कितने प्रतिशत भिन्न है? (1 दशमलव स्थान तक, निरपेक्ष मान)'; },
    m_ratioYear: function (d, c) { return d.labels[c.yi] + ' में, ' + c.aName + ' का ' + c.bName + ' से अनुपात (' + d.metric + ') क्या है? सरलतम रूप a:b में व्यक्त कीजिए और a दर्ज कीजिए।'; },
    m_seriesShare: function (d, c) { return d.labels[c.yi] + ' में, ' + c.aName + ', उस प्रविष्टि के सभी शृंखलाओं के संयुक्त ' + d.metric + ' का कितने प्रतिशत है? (1 दशमलव स्थान तक)'; },
    m_combinedShare: function (d, c) { return 'दिखाई गई सभी शृंखलाओं और प्रविष्टियों में, ' + d.labels[c.yi] + ' में ' + c.aName + ' और ' + c.bName + ' मिलकर कुल ' + d.metric + ' का कितने प्रतिशत बनाते हैं? (1 दशमलव स्थान तक)'; },
    m_trendCompare: function (d, c) { return d.labels[0] + ' से ' + d.labels[d.labels.length - 1] + ' तक, ' + d.metric + ' में बड़ा परिवर्तन छोटे से कितनी इकाई अधिक रहा? (' + c.aName + ' और ' + c.bName + ' की तुलना)'; }
  };

  var CASE_STEM = {
    stem: function (ctx, c) { return c.total + ' ' + ctx.whole + ' में से ' + c.g1 + ' ' + ctx.g1 + ' और ' + c.g2 + ' ' + ctx.g2 + ' हैं। ' + ctx.g1 + ' में से ' + c.p1 + '% और ' + ctx.g2 + ' में से ' + c.p2 + '% ने ' + ctx.act + '। '; },
    caseRead: function (ctx) { return 'कितने ' + ctx.g1 + ' ने ' + ctx.act + '?'; },
    caseTotal: function (ctx) { return 'कुल मिलाकर, कितने लोगों ने ' + ctx.act + '?'; },
    caseMissing: function (ctx, c) { return 'यदि कुल ' + c.sum + ' लोगों ने ' + ctx.act + ', और उनमें से ' + c.a1 + ' ' + ctx.g1 + ' हैं, तो कितने ' + ctx.g2 + ' ने ' + ctx.act + '?'; },
    caseShare: function (ctx) { return 'जिन सभी लोगों ने ' + ctx.act + ', उनमें से कितने प्रतिशत ' + ctx.g1 + ' हैं? (1 दशमलव स्थान तक)'; },
    fallbackQ: '400 सर्वेक्षित लोगों में से 240 पुरुष हैं। कितने पुरुष हैं?'
  };

  function lead(noun, q, r) {
    var n = NOUN[noun] || noun;
    if (r < 0.4) return q;
    if (r < 0.65) return n + ' के आधार पर, ' + q;
    if (r < 0.85) return 'दिखाए गए ' + n + ' से: ' + q;
    return n + ' देखें। ' + q;
  }

  var CHART = {
    barTitle: function (d) { return metricUnit(d) + ', ' + d.entity + ' के अनुसार'; },
    pieTitle: function (d) { return metricUnit(d) + ' का हिस्सा'; },
    lineTitle: function (d) { return 'वर्षों में ' + metricUnit(d); },
    lineTitleSubject: function (d) { return d.subject + ' का ' + metricUnit(d) + ', वर्षों में'; },
    tableTitle: function (d) { return metricUnit(d) + ', ' + d.entity + ' के अनुसार'; },
    seriesCol: function (d, name) { return name + (d.unit ? ' (' + d.unit + ')' : ''); },
    metricCol: function (d) { return d.metric + (d.unit ? ' (' + d.unit + ')' : ''); },
    yLabel: function (d) { return d.metric; },
    xYear: function () { return AXIS_YEAR; }
  };

  var pack = {
    entityThemes: ENTITY_THEMES, timeThemes: TIME_THEMES, caseletCtx: CASELET_CTX, subjects: SUBJECTS,
    stemVariety: STEM_VARIETY,
    entityStem: ENTITY_STEM, timeStem: TIME_STEM, multiStem: MULTI_STEM, caseStem: CASE_STEM,
    lead: lead, chart: CHART, plural: plural, metricUnit: metricUnit
  };

  if (GI) GI.registerDI('hi', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
