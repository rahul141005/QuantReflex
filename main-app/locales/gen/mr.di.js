/**
 * mr.di.js — generated-content pack (DI engine, Marathi) for QRGenI18n (ADR-111 Phase F-M5.3).
 *
 * First-class Maharashtra Marathi (State Board / MPSC / Target Publications register, तुम्ही-form) — authored FRESH,
 * not translated from the Hindi pack. Structure mirrors en.di.js EXACTLY; the engine feeds computed indices/values so
 * the dataset/answer/chart-NUMBERS are byte-identical to EN and only the wording changes (gen-i18n.check §10). Entity
 * brand/city/scheme names transliterate to Devanagari; metric/unit/series/caselet words translate. Grammar-safe by
 * construction: किती is gender-invariant, and stems use the locative मध्ये / मधील / पैकी (invariant) instead of the
 * gender-agreeing genitive चा/ची/चे; caselet counts use the जणांनी (people-ergative) frame with transitive-perfective
 * acts. Latin stays for single-letter codes (A–F, P–U, X, Y), Q1/Q2, acronyms (LIC, SBI, BSNL, UPI, GDP, ELSS…), and
 * unit symbols (₹, %, mm, MW, `'000`). Numeric theme config (`range`) identical to EN. Function-valued.
 */
(function () {
  'use strict';
  var GI = (typeof QRGenI18n !== 'undefined') ? QRGenI18n
    : (typeof require !== 'undefined' ? require('../../js/gen-i18n.js') : null);

  var ENTITY_THEMES = [
    { entity: 'कंपनी', items: ['A', 'B', 'C', 'D', 'E', 'F'], pre: 'कंपनी ', metric: 'विक्री', unit: '₹ कोटी', series: ['2022', '2023', '2024'] },
    { entity: 'बँक शाखा', items: ['दिल्ली', 'मुंबई', 'चेन्नई', 'कोलकाता', 'पुणे', 'जयपूर'], pre: '', metric: 'वितरित कर्ज', unit: '₹ लाख', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'उत्पादन', items: ['P', 'Q', 'R', 'S', 'T', 'U'], pre: 'उत्पादन ', metric: 'विकलेले नग', unit: "'000 नग", series: ['ऑनलाइन', 'किरकोळ'] },
    { entity: 'शाळा', items: ['रोझवूड', 'हिलटॉप', 'ग्रीनफील्ड', 'लेकसाइड', 'ओकरिज', 'सनराइज'], pre: '', metric: 'प्रवेशित विद्यार्थी', unit: '', series: ['मुले', 'मुली'], range: [240, 1200, 4] },
    { entity: 'विभाग', items: ['एचआर', 'विक्री', 'आयटी', 'वित्त', 'परिचालन', 'कायदा'], pre: '', metric: 'कर्मचारी', unit: '', series: ['2023', '2024'] },
    { entity: 'शहर', items: ['इंदूर', 'सूरत', 'नागपूर', 'कोची', 'पाटणा', 'भोपाळ'], pre: '', metric: 'आरक्षित तिकिटे', unit: '', series: ['Q1', 'Q2'], range: [200, 900, 5] },
    { entity: 'स्टोअर', items: ['अल्फा', 'बीटा', 'गामा', 'डेल्टा', 'एको', 'फॉक्सट्रॉट'], pre: '', metric: 'महसूल', unit: '₹ लाख', series: ['2023', '2024'] },
    { entity: 'राज्य', items: ['पंजाब', 'हरियाणा', 'गुजरात', 'केरळ', 'आसाम', 'ओडिशा'], pre: '', metric: 'गहू उत्पादन', unit: "'000 टन", series: ['खरीप', 'रब्बी'], range: [150, 900, 5] },
    { entity: 'राज्य', items: ['महाराष्ट्र', 'बिहार', 'राजस्थान', 'कर्नाटक', 'तेलंगणा', 'गोवा'], pre: '', metric: 'लोकसंख्या', unit: 'लाख', series: ['शहरी', 'ग्रामीण'], range: [40, 360, 2] },
    { entity: 'देश', items: ['भारत', 'चीन', 'ब्राझील', 'जर्मनी', 'केनिया', 'व्हिएतनाम'], pre: '', metric: 'निर्यात', unit: '₹ कोटी', series: ['2023', '2024'], range: [200, 1200, 5] },
    { entity: 'रुग्णालय', items: ['सिव्हिल', 'अपोलो', 'फोर्टिस', 'मणिपाल', 'मेदांता', 'KIMS'], pre: '', metric: 'दाखल रुग्ण', unit: '', series: ['सामान्य', 'ICU'], range: [120, 720, 4] },
    { entity: 'प्लॅटफॉर्म', items: ['फ्लिपकार्ट', 'अमेझॉन', 'मीशो', 'नायका', 'अजिओ', 'टाटा न्यू'], pre: '', metric: 'ऑर्डर', unit: "'000", series: ['फॅशन', 'इलेक्ट्रॉनिक्स'], range: [60, 480, 3] },
    { entity: 'ऑपरेटर', items: ['जिओ', 'एअरटेल', 'व्होडाफोन', 'BSNL', 'MTNL', 'ACT'], pre: '', metric: 'ग्राहक', unit: 'लाख', series: ['प्रीपेड', 'पोस्टपेड'], range: [40, 360, 2] },
    { entity: 'वीज केंद्र', items: ['कोरबा', 'सिंगरौली', 'विंध्य', 'तालचेर', 'रामागुंडम', 'सिपत'], pre: '', metric: 'निर्मित वीज', unit: 'MW', series: ['औष्णिक', 'सौर'], range: [150, 900, 5] },
    { entity: 'ठिकाण', items: ['आग्रा', 'जयपूर', 'गोवा', 'मुन्नार', 'शिमला', 'हंपी'], pre: '', metric: 'पर्यटक आगमन', unit: "'000", series: ['देशांतर्गत', 'विदेशी'], range: [60, 540, 3] },
    { entity: 'रेल्वे विभाग', items: ['उत्तर', 'पश्चिम', 'मध्य', 'दक्षिण', 'पूर्व', 'ईशान्य'], pre: '', metric: 'वाहून नेलेले प्रवासी', unit: 'लाख', series: ['AC', 'नॉन-AC'], range: [80, 600, 4] },
    { entity: 'विमानतळ', items: ['दिल्ली', 'मुंबई', 'बेंगळुरू', 'हैदराबाद', 'कोलकाता', 'कोची'], pre: '', metric: 'हाताळलेली विमाने', unit: "'00", series: ['देशांतर्गत', 'आंतरराष्ट्रीय'], range: [40, 320, 2] },
    { entity: 'विमा कंपनी', items: ['LIC', 'HDFC', 'SBI', 'ICICI', 'मॅक्स', 'बजाज'], pre: '', metric: 'जमा प्रीमियम', unit: '₹ कोटी', series: ['2023', '2024'], range: [120, 720, 5] },
    { entity: 'फंड', items: ['ब्लूचिप', 'मिडकॅप', 'स्मॉलकॅप', 'फ्लेक्सीकॅप', 'इंडेक्स', 'ELSS'], pre: '', metric: 'व्यवस्थापित मालमत्ता', unit: '₹ कोटी', series: ['इक्विटी', 'कर्ज'], range: [150, 900, 5] },
    { entity: 'जिल्हा', items: ['चेरापुंजी', 'मॉसिनराम', 'पासीघाट', 'अगुंबे', 'आंबोली', 'गंगटोक'], pre: '', metric: 'पर्जन्य', unit: 'mm', series: ['2023', '2024'], range: [400, 1600, 5] },
    { entity: 'कारखाना', items: ['युनिट 1', 'युनिट 2', 'युनिट 3', 'युनिट 4', 'युनिट 5', 'युनिट 6'], pre: '', metric: 'उत्पादन', unit: "'000 नग", series: ['शिफ्ट A', 'शिफ्ट B'], range: [80, 480, 4] },
    { entity: 'संघ', items: ['फाल्कन्स', 'टायगर्स', 'स्ट्रायकर्स', 'वॉरियर्स', 'रॉयल्स', 'टायटन्स'], pre: '', metric: 'केलेले गोल', unit: '', series: ['घरचे', 'बाहेरचे'], range: [12, 90, 1] },
    { entity: 'मॉल', items: ['फिनिक्स', 'ओरायन', 'फोरम', 'सिलेक्ट', 'लुलु', 'इनऑर्बिट'], pre: '', metric: 'आगंतुक संख्या', unit: "'000", series: ['आठवड्याचा दिवस', 'शनिवार-रविवार'], range: [60, 480, 3] }
  ];
  var TIME_THEMES = [
    { metric: 'महसूल', unit: '₹ कोटी', series: ['प्लांट X', 'प्लांट Y'] },
    { metric: 'उत्पादन', unit: "'000 नग", series: ['युनिट A', 'युनिट B'] },
    { metric: 'नफा', unit: '₹ लाख', series: ['विभाग 1', 'विभाग 2'] },
    { metric: 'वेबसाइट आगंतुक', unit: "'000", series: ['मोबाइल', 'डेस्कटॉप'] },
    { metric: 'निर्यात', unit: '₹ कोटी', series: ['पूर्व विभाग', 'पश्चिम विभाग'] },
    { metric: 'आयात', unit: '₹ कोटी', series: ['कच्चे तेल', 'यंत्रसामग्री'] },
    { metric: 'जीडीपी', unit: "₹ '000 कोटी", series: ['सेवा', 'उद्योग'] },
    { metric: 'पर्जन्य', unit: 'mm', series: ['किनारी', 'अंतर्देशीय'], range: [60, 320] },
    { metric: 'पर्यटक आगमन', unit: "'000", series: ['देशांतर्गत', 'विदेशी'] },
    { metric: 'कार विक्री', unit: "'000 नग", series: ['पेट्रोल', 'EV'] },
    { metric: 'मोबाइल ग्राहक', unit: 'लाख', series: ['प्रीपेड', 'पोस्टपेड'] },
    { metric: 'वीज निर्मिती', unit: 'दशलक्ष नग', series: ['औष्णिक', 'नवीकरणीय'] },
    { metric: 'डिजिटल देयके', unit: '₹ कोटी', series: ['UPI', 'कार्ड'] },
    { metric: 'साखर उत्पादन', unit: "'000 टन", series: ['मिल A', 'मिल B'] }
  ];
  var CASELET_CTX = [
    { whole: 'सर्वेक्षण केलेल्या लोकां', g1: 'पुरुष', g2: 'महिला', act: 'ऑनलाइन खरेदीला पसंती दिली' },
    { whole: 'वर्गातील विद्यार्थ्यां', g1: 'मुले', g2: 'मुली', act: 'परीक्षा उत्तीर्ण केली' },
    { whole: 'कंपनीतील कर्मचाऱ्यां', g1: 'व्यवस्थापक', g2: 'कर्मचारी', act: 'नवीन धोरण निवडले' },
    { whole: 'जत्रेतील अभ्यागतां', g1: 'प्रौढ', g2: 'मुले', act: 'ऑनलाइन तिकीट खरेदी केले' },
    { whole: 'सर्वेक्षण केलेल्या प्रवाशां', g1: 'कार वापरणारे', g2: 'बस वापरणारे', act: 'नवीन मेट्रो मार्गाला पाठिंबा दिला' },
    { whole: 'ग्राहकां', g1: 'वार्षिक सदस्य', g2: 'मासिक सदस्य', act: 'यावर्षी नूतनीकरण केले' },
    { whole: 'कर्ज अर्जदारां', g1: 'पगारदार अर्जदार', g2: 'स्वयंरोजगार अर्जदार', act: 'मंजुरी मिळवली' },
    { whole: 'खातेधारकां', g1: 'बचत-खातेधारक', g2: 'चालू-खातेधारक', act: 'मोबाइल बँकिंग वापरले' },
    { whole: 'उपस्थित उमेदवारां', g1: 'पुरुष उमेदवार', g2: 'महिला उमेदवार', act: 'कट-ऑफ पार केला' },
    { whole: 'नोंदणीकृत मतदारां', g1: 'पहिल्यांदा मतदान करणारे', g2: 'पुन्हा मतदान करणारे', act: 'मतदान केले' },
    { whole: 'पॉलिसीधारकां', g1: 'टर्म-प्लॅन धारक', g2: 'एंडोमेंट-प्लॅन धारक', act: 'त्यांची पॉलिसी नूतनीकरण केली' },
    { whole: 'सर्वेक्षण केलेल्या कुटुंबां', g1: 'शहरी कुटुंबे', g2: 'ग्रामीण कुटुंबे', act: 'स्मार्टफोन खरेदी केला' },
    { whole: 'जिल्ह्यातील शेतकऱ्यां', g1: 'लहान शेतकरी', g2: 'मोठे शेतकरी', act: 'नवीन बियाणे स्वीकारले' },
    { whole: 'दाखल रुग्णां', g1: 'विमाधारक रुग्ण', g2: 'विमा नसलेले रुग्ण', act: 'एका आठवड्यात सुट्टी मिळवली' },
    { whole: 'सर्वेक्षण केलेल्या प्रवाशां', g1: 'व्यावसायिक प्रवासी', g2: 'विरंगुळा प्रवासी', act: 'अ‍ॅपवरून आरक्षण केले' },
    { whole: 'कंपनीतील कर्मचाऱ्यां', g1: 'ऑन-साइट कर्मचारी', g2: 'रिमोट कर्मचारी', act: 'प्रशिक्षणात नावनोंदणी केली' }
  ];
  var SUBJECTS = ['कंपनी XYZ', 'फर्म', 'संयंत्र', 'पोर्टल', 'ब्रँड', 'नेटवर्क', 'साखळी'];

  var NOUN = { chart: 'चार्ट', table: 'तक्ता', graph: 'आलेख' };
  var AXIS_YEAR = 'वर्ष';

  function plural(w) { return w; }
  function metricUnit(d) { return d.metric + (d.unit ? ' (' + d.unit + ' मध्ये)' : ''); }
  function ents(d) { return d.labels.length + ' ' + d.entity; }

  var STEM_VARIETY = { total: 3, avg: 3 };

  /* Gender-safe by construction: किती is invariant, so stems use locative मध्ये / मधील / पैकी (never the gender-
     agreeing genitive चा/ची/चे), and differences use "यांच्यात किती फरक/टक्के फरक" (फरक masc, invariant). */
  var ENTITY_STEM = {
    read: function (d, c) { return d.labels[c.i] + ' मध्ये ' + d.metric + ' किती आहे?'; },
    max: function (d) { return 'कोणत्या ' + d.entity + ' मध्ये ' + d.metric + ' सर्वाधिक आहे? ते मूल्य नोंदवा.'; },
    min: function (d) { return 'कोणत्या ' + d.entity + ' मध्ये ' + d.metric + ' सर्वात कमी आहे? ते मूल्य नोंदवा.'; },
    rank: function (d, c) { return 'या ' + d.entity + ' मध्ये ' + d.metric + ' चे ' + (c.r === 2 ? 'दुसरे' : 'तिसरे') + ' सर्वाधिक मूल्य किती आहे?'; },
    total: function (d, c) { return [
      'दाखवलेल्या सर्व ' + ents(d) + ' मध्ये एकूण ' + d.metric + ' किती आहे?',
      'या ' + ents(d) + ' मध्ये एकत्रित ' + d.metric + ' किती आहे?',
      'सर्व मिळून, या ' + ents(d) + ' मध्ये एकूण ' + d.metric + ' किती आहे?'][c.vi]; },
    diff: function (d, c) { return d.labels[c.i] + ' मधील ' + d.metric + ' आणि ' + d.labels[c.j] + ' मधील ' + d.metric + ' यांच्यात किती फरक आहे? (फरक नोंदवा)'; },
    avg: function (d, c) { return [
      'सर्व ' + ents(d) + ' मध्ये सरासरी ' + d.metric + ' किती आहे?',
      'या ' + ents(d) + ' मध्ये प्रति ' + d.entity + ' सरासरी ' + d.metric + ' किती आहे?',
      'सरासरीने, या ' + ents(d) + ' मध्ये एका ' + d.entity + ' मध्ये ' + d.metric + ' किती आहे?'][c.vi]; },
    share: function (d, c) { return 'एकूण ' + d.metric + ' पैकी ' + d.labels[c.i] + ' किती टक्के आहे? (1 दशांश स्थळापर्यंत)'; },
    missing: function (d, c) { return 'सर्व ' + d.labels.length + ' ' + d.entity + ' मध्ये एकूण ' + d.metric + ' ' + c.total + ' आहे. जर ' + d.labels[c.i] + ' वगळता प्रत्येक मूल्य दाखवल्याप्रमाणे असेल, तर ' + d.labels[c.i] + ' मध्ये ' + d.metric + ' किती आहे?'; },
    pctMore: function (d, c) { return d.labels[c.i] + ' मधील ' + d.metric + ' आणि ' + d.labels[c.j] + ' मधील ' + d.metric + ' यांच्यात किती टक्के फरक आहे? (1 दशांश स्थळापर्यंत, निरपेक्ष मूल्य)'; },
    deviation: function (d, c) { return d.labels[c.i] + ' मधील ' + d.metric + ' आणि सर्व ' + d.labels.length + ' ची सरासरी यांच्यात किती टक्के फरक आहे? (1 दशांश स्थळापर्यंत, निरपेक्ष मूल्य)'; },
    combinedShare: function (d, c) { return 'एकूण ' + d.metric + ' पैकी ' + d.labels[c.i] + ' आणि ' + d.labels[c.j] + ' मिळून किती टक्के आहेत? (1 दशांश स्थळापर्यंत)'; },
    ratioSimplest: function (d, c) { return d.labels[c.i] + ' मधील ' + d.metric + ' आणि ' + d.labels[c.j] + ' मधील ' + d.metric + ' यांचे गुणोत्तर काय आहे? सोप्या रूपात a:b मध्ये व्यक्त करा आणि a नोंदवा.'; },
    ratioTimes: function (d, c) { return d.labels[c.i] + ' मधील ' + d.metric + ', ' + d.labels[c.j] + ' मधील ' + d.metric + ' च्या तुलनेत किती पट आहे? (1 दशांश स्थळापर्यंत)'; },
    pctMorePrimary: function (d, c) { return d.labels[c.i] + ' मधील ' + d.metric + ', ' + d.labels[c.j] + ' मधील ' + d.metric + ' पेक्षा किती टक्के जास्त आहे? (1 दशांश स्थळापर्यंत, निरपेक्ष मूल्य)'; }
  };

  var TIME_STEM = {
    read: function (d, c) { return d.labels[c.i] + ' मध्ये ' + d.metric + ' चे मूल्य किती होते?'; },
    peak: function (d) { return 'कोणत्याही एका वर्षात ' + d.metric + ' चे सर्वाधिक मूल्य किती होते? ते मूल्य नोंदवा.'; },
    trough: function (d) { return 'कोणत्याही एका वर्षात ' + d.metric + ' चे सर्वात कमी मूल्य किती होते? ते मूल्य नोंदवा.'; },
    total: function (d) { return 'सर्व ' + d.labels.length + ' वर्षांत एकूण ' + d.metric + ' किती आहे?'; },
    diff: function (d, c) { return d.labels[c.i - 1] + ' ते ' + d.labels[c.i] + ' या काळात ' + d.metric + ' मध्ये किती बदल झाला? (फरक नोंदवा)'; },
    avg: function (d) { return 'या ' + d.labels.length + ' वर्षांत सरासरी वार्षिक ' + d.metric + ' किती आहे?'; },
    biggestJump: function (d) { return 'कोणत्याही सलग दोन वर्षांमध्ये ' + d.metric + ' मध्ये सर्वात मोठा बदल किती आहे?'; },
    yoy: function (d, c) { return d.labels[c.y - 1] + ' ते ' + d.labels[c.y] + ' या काळात ' + d.metric + ' मध्ये किती टक्के बदल झाला? (1 दशांश स्थळापर्यंत, निरपेक्ष मूल्य)'; },
    cumulativeShare: function (d, c) { return 'पहिल्या ' + c.half + ' वर्षांनी एकूण ' + d.metric + ' मध्ये किती टक्के योगदान दिले? (1 दशांश स्थळापर्यंत)'; },
    overallGrowth: function (d) { return 'संपूर्ण कालावधीत (' + d.labels[0] + ' ते ' + d.labels[d.labels.length - 1] + ') ' + d.metric + ' मध्ये किती टक्के बदल झाला? (1 दशांश स्थळापर्यंत, निरपेक्ष मूल्य)'; }
  };

  var MULTI_STEM = {
    m_pctDiff: function (d, c) { return d.labels[c.yi] + ' मध्ये, ' + c.aName + ' मधील ' + d.metric + ' आणि ' + c.bName + ' मधील ' + d.metric + ' यांच्यात किती टक्के फरक आहे? (1 दशांश स्थळापर्यंत, निरपेक्ष मूल्य)'; },
    m_ratioYear: function (d, c) { return d.labels[c.yi] + ' मध्ये, ' + c.aName + ' आणि ' + c.bName + ' यांचे (' + d.metric + ') गुणोत्तर काय आहे? सोप्या रूपात a:b मध्ये व्यक्त करा आणि a नोंदवा.'; },
    m_seriesShare: function (d, c) { return d.labels[c.yi] + ' मध्ये, त्या नोंदीच्या सर्व शृंखलांच्या एकत्रित ' + d.metric + ' पैकी ' + c.aName + ' किती टक्के आहे? (1 दशांश स्थळापर्यंत)'; },
    m_combinedShare: function (d, c) { return 'दाखवलेल्या सर्व शृंखला व नोंदींच्या एकूण ' + d.metric + ' पैकी, ' + d.labels[c.yi] + ' मध्ये ' + c.aName + ' आणि ' + c.bName + ' मिळून किती टक्के आहेत? (1 दशांश स्थळापर्यंत)'; },
    m_trendCompare: function (d, c) { return d.labels[0] + ' ते ' + d.labels[d.labels.length - 1] + ' या काळात, ' + d.metric + ' मधील मोठा बदल लहान बदलापेक्षा किती एककांनी जास्त होता? (' + c.aName + ' आणि ' + c.bName + ' ची तुलना)'; }
  };

  var CASE_STEM = {
    stem: function (ctx, c) { return c.total + ' ' + ctx.whole + ' पैकी ' + c.g1 + ' ' + ctx.g1 + ' आणि ' + c.g2 + ' ' + ctx.g2 + ' आहेत. ' + ctx.g1 + ' पैकी ' + c.p1 + '% आणि ' + ctx.g2 + ' पैकी ' + c.p2 + '% जणांनी ' + ctx.act + '. '; },
    caseRead: function (ctx) { return ctx.g1 + ' पैकी किती जणांनी ' + ctx.act + '?'; },
    caseTotal: function (ctx) { return 'एकूण किती जणांनी ' + ctx.act + '?'; },
    caseMissing: function (ctx, c) { return 'जर एकूण ' + c.sum + ' जणांनी ' + ctx.act + ', आणि त्यांपैकी ' + c.a1 + ' ' + ctx.g1 + ' असतील, तर ' + ctx.g2 + ' पैकी किती जणांनी ' + ctx.act + '?'; },
    caseShare: function (ctx) { return 'ज्या सर्व जणांनी ' + ctx.act + ', त्यांपैकी किती टक्के ' + ctx.g1 + ' आहेत? (1 दशांश स्थळापर्यंत)'; },
    fallbackQ: '400 सर्वेक्षण केलेल्या लोकांपैकी 240 पुरुष आहेत. किती पुरुष आहेत?'
  };

  function lead(noun, q, r) {
    var n = NOUN[noun] || noun;
    if (r < 0.4) return q;
    if (r < 0.65) return 'वरील ' + n + ' पाहा. ' + q;
    if (r < 0.85) return 'दिलेला ' + n + ' पाहून उत्तर द्या. ' + q;
    return n + ' नीट पाहा. ' + q;
  }

  var CHART = {
    barTitle: function (d) { return metricUnit(d) + ', ' + d.entity + 'निहाय'; },
    pieTitle: function (d) { return metricUnit(d) + ' चा वाटा'; },
    lineTitle: function (d) { return 'वर्षांनुसार ' + metricUnit(d); },
    lineTitleSubject: function (d) { return 'वर्षांनुसार ' + d.subject + ' मधील ' + metricUnit(d); },
    tableTitle: function (d) { return metricUnit(d) + ', ' + d.entity + 'निहाय'; },
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

  if (GI) GI.registerDI('mr', pack);
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
})();
