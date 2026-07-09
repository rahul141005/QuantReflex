# QuantReflex Localization Glossary (EN ↔ हिन्दी ↔ मराठी)

**The single source of truth for every Hindi/Marathi term in the product (ADR-111).**
All translations — UI catalogs (`main-app/locales/`), study-content packs, generator templates,
Learn chapters, AI prompt instructions — MUST use these terms. New strings never invent competing
vocabulary; extend this file first. `scripts/i18n.check.js` enforces the do-not-translate list and
subject-term consistency.

**Provenance.** Terms were researched against real coaching-material usage, not machine-translated:
Arihant Hindi-medium chapter lists ("No Trick अंकगणित", "संख्यात्मक अभियोग्यता"), R.S. Aggarwal
"तर्कशक्ति परीक्षण" (S. Chand), EduDose Hindi reasoning chapters, MPSC arithmetic syllabus components
(mahasarav / mpscexams practice-paper chapter names), and MPSC बुद्धिमत्ता चाचणी materials. These are
the exact chapter names students see in Hindi/Marathi aptitude books.

---

## Register rules

- **Hindi** — exam-book register: तत्सम technical nouns with everyday verbs; **आप-form** throughout;
  transliterate where Indian apps universally transliterate (सेटिंग्स, डार्क, मॉक टेस्ट); never
  bureaucratese ("जारी रखें", not "अग्रसारित करें").
- **Marathi** — Target-Publications register: native chapter words (शेकडेवारी, उजळणी, सराव);
  **तुम्ही-form**; prefer native terms over Hindi-influenced calques; transliterate app-chrome
  loanwords the Marathi way (सेटिंग्ज, सिस्टीम, ॲप).
- **Numerals stay 0-9** in every language (modern HI/MR book convention). `QRI18n.localeTag()` pins
  `-u-nu-latn` so Intl never emits Devanagari digits. Never call `toLocaleString(locale)` on counts.
- Dates may localize month names via `Intl.DateTimeFormat(QRI18n.localeTag())`; internal
  `toDateString()` day-keys are NOT display strings and must never be localized.

## Do-NOT-translate list

| Term | Rule |
|---|---|
| QuantReflex, QuanAI | Never translated or transliterated. |
| Premium | Latin "Premium" in chips/badges; "प्रीमियम" transliteration allowed mid-sentence in prose. |
| DI, LR, AI | Untranslated everywhere. |
| Exam acronyms | CAT, MBA CET, MAH-CET, Bank PO, SSC CGL, IBPS, RRB, UPSC, MPSC, NDA, CDS. |
| Math & units | Digits 0-9, equations, variables, coordinates, km/h, %, ₹ — surrounding words translate, these never do. |
| Language names | Endonyms in selectors: English / हिन्दी / मराठी (never "अंग्रेज़ी/हिंदी/Marathi" in the picker). |

---

## Quant subjects

| English (app) | Hindi | Marathi | Note |
|---|---|---|---|
| Percentages | प्रतिशत | शेकडेवारी | MR: शेकडेवारी is the MPSC chapter word; टक्के for "percent" inline |
| Ratio & Proportion | अनुपात और समानुपात | गुणोत्तर व प्रमाण | |
| Profit & Loss | लाभ और हानि | नफा-तोटा | |
| Simple Interest | साधारण ब्याज | सरळव्याज | |
| Compound Interest | चक्रवृद्धि ब्याज | चक्रवाढ व्याज | |
| Averages | औसत | सरासरी | |
| Time & Work | समय और कार्य | काळ आणि काम | MPSC groups काळ-काम-वेग; split kept to mirror app taxonomy |
| Time, Speed & Distance | समय, चाल और दूरी | वेळ, वेग आणि अंतर | HI books use चाल for speed in this chapter title |
| Number System | संख्या पद्धति | संख्याज्ञान | |
| Simplification | सरलीकरण | पदावली सोडवणे | MR: पदावली is the MPSC BODMAS chapter term |
| Algebra | बीजगणित | बीजगणित | |
| Geometry | ज्यामिति | भूमिती | |
| Mensuration | क्षेत्रमिति | क्षेत्रफळ व घनफळ | MR native framing is area/volume, not "मेन्सुरेशन" |
| Ages | आयु संबंधी प्रश्न | वयवारी | वयवारी is the exact MPSC chapter word |
| Partnership | साझेदारी | भागीदारी | |
| Mixtures & Alligation | मिश्रण और पल्लीकरण | मिश्रण | Arihant: मिश्रण एवं पल्लीकरण |
| Pipes & Cisterns | नल और टंकी | नळ व टाकी | exact MPSC term |
| Trains | रेलगाड़ी संबंधी प्रश्न | रेल्वे | MPSC papers literally title the chapter रेल्वे |
| Boats & Streams | नाव और धारा | नाव व प्रवाह | |
| Data Interpretation | आंकड़ा निर्वचन (डेटा इंटरप्रिटेशन) | आकडेवारी विश्लेषण | acronym "DI" untranslated everywhere |
| Probability | प्रायिकता | संभाव्यता | |
| Permutation & Combination | क्रमचय और संचय | क्रमचय व संचय | verify vs Target Publications during implementation |
| Squares & Roots | वर्ग और वर्गमूल | वर्ग व वर्गमूळ | |

## Quant generated-content vocabulary (F-M3 / F-M4)

The term authority for `locales/gen/{hi,mr}.quant.js`. Every generated stem/explanation MUST use these exact
Hindi/Marathi words; any new term is added here BEFORE it appears in a pack. Register: exam-book Hindi (Arihant /
R.S. Aggarwal / Disha / Testbook / Adda247), आप-form when addressing the student, non-honorific 3rd person for named
actors. Math notation (sin, cos, tan, log, nPr, nCr, √, ², ³, ×, ÷, −, ₹, %, digits) stays Latin/symbolic in every
language. Marathi column filled in F-M4.

### Marathi canonical terms (F-M4) — Maharashtra register (State Board / MPSC / Target Publications / K'Sagar)

The single authority for `locales/gen/mr.quant.js`. Authored FRESH for MPSC / Talathi / ZP / Police Bharti / Forest /
Revenue aspirants (तुम्ही-form, imperatives काढा/शोधा/सोडवा), NOT translated from the Hindi pack. One concept → one
Marathi rendering, app-wide. Board abbreviations म.सा.वि. (HCF) / ल.सा.वि. (LCM) are used inline (never Latin HCF/LCM).

| English | Marathi | Note |
|---|---|---|
| square / square root / cube / cube root | वर्ग / वर्गमूळ / घन / घनमूळ | |
| fraction / percentage / percent | अपूर्णांक / टक्केवारी / टक्के | lowest terms लघुतम रूप |
| multiply / divide / add / subtract | गुणाकार / भागाकार / बेरीज / वजाबाकी | remainder उरलेली बाकी (avoids "mod") |
| area / volume / surface area | क्षेत्रफळ / घनफळ / पृष्ठफळ | TSA एकूण पृष्ठफळ, LSA/CSA पार्श्व/वक्र पृष्ठफळ |
| side / length / breadth / height / radius / base | बाजू / लांबी / रुंदी / उंची / त्रिज्या / पाया | |
| rectangle / square / triangle / circle | आयत / चौरस / त्रिकोण / वर्तुळ | |
| parallelogram / trapezium / cube / cuboid / cylinder / sphere / cone | समांतरभुज चौकोन / समलंब चौकोन / घन / इष्टिकाचिती / दंडगोल / गोल / शंकू | |
| profit / loss / cost price / selling price | नफा / तोटा / खरेदी किंमत / विक्री किंमत | CP/SP kept Latin in formula lines |
| simple interest / compound interest / principal / rate / amount / per annum | सरळव्याज / चक्रवाढ व्याज / मुद्दल / दर / रास / वार्षिक | रास = P + व्याज |
| ratio / average / mean | गुणोत्तर / सरासरी / मध्य | weighted mean भारित मध्य |
| speed / distance / time | वेग / अंतर / वेळ | harmonic mean हरात्मक मध्य |
| work / days / together / workers | काम / दिवस / एकत्र / कामगार | worker-days कामगार-दिवस |
| pipe / tank / fill / empty / inlet / outlet | नळ / टाकी / भरणे / रिकामे करणे / आवक नळ / जावक नळ | |
| age / present age / years ago | वय / सध्याचे वय / वर्षांपूर्वी | |
| partnership / invest / capital / share | भागीदारी / गुंतवणूक / भांडवल / वाटा | |
| HCF / LCM / Euclid | म.सा.वि. / ल.सा.वि. / युक्लिड | full: महत्तम साधारण विभाजक / लघुत्तम साधारण विभाज्य |
| factors (divisors) / unit digit / power | अवयव (विभाजक) / एकक अंक / घात | |
| equation / solve / system / elimination / substitution | समीकरण / सोडवा / निकाय / विलोपन / प्रतिस्थापन | |
| quadratic / roots / discriminant / Vieta | वर्गसमीकरण / मुळे / विवेचक / विएटा | larger/smaller root मोठे/लहान मूळ |
| indices / surds / value / quotient law | घातांक / करणी / मूल्य / भागाकार नियम | |
| logarithm / base | लॉगरिथम / आधार | "b आधारी N चा लॉगरिथम" |
| AP / GP / term / first term / common difference / common ratio | अंकगणिती श्रेढी / भौमितिक श्रेढी / पद / पहिले पद / सामाईक फरक / सामाईक गुणोत्तर | nth term "n वे पद" (ordmr) |
| inequality / modulus / integer / smallest | असमानता / निरपेक्ष मूल्य / पूर्णांक / सर्वात लहान | |
| angle / complement / supplement | कोन / पूरक कोन / संपूरक कोन | degree अंश (°) |
| isosceles / hypotenuse / right-angled / vertex angle / base angle | समद्विभुज / कर्ण / काटकोन / शिरोकोन / पायाचा कोन | |
| polygon / interior angle / regular | बहुभुज / अंतःकोन / नियमित | |
| coordinate / point / midpoint / slope / section formula | निर्देशक / बिंदू / मध्यबिंदू / उतार / विभाजन सूत्र | |
| trigonometry / angle of elevation / identity / standard-angle table | त्रिकोणमिती / उन्नतकोन / नित्यसमीकरण / प्रमाण कोन सारणी | |
| tower/pole/building/tree/flagpole/lighthouse/chimney | मनोरा / खांब / इमारत / झाड / ध्वजस्तंभ / दीपगृह / चिमणी | TRIG_STRUCT pool |
| permutation / combination / factorial | क्रमचय / संचय / क्रमगुणित | arrange मांडणे, committee समिती, handshake हस्तांदोलन, circular वर्तुळाकार |
| probability / bag / ball / toss / coin / head / decimal / multiple / at random | संभाव्यता / पिशवी / चेंडू / उडवणे / नाणे / छापा / दशांश / गुणक / यादृच्छिकपणे | tails काटा |
| red/blue/green/yellow/black/white | लाल / निळे / हिरवे / पिवळे / काळे / पांढरे | PROB_COL (चेंडू masc → masc-pl forms) |
| set / union / intersection / only / both / neither | समुच्चय / संघ / छेद / फक्त / दोन्ही / एकही नाही | group गट, class वर्ग, students विद्यार्थी, like आवडणे, survey सर्वेक्षण |
| SET_CTX subjects/games | गणित/विज्ञान, हिंदी/इंग्रजी, बुद्धिबळ/कॅरम, भौतिकशास्त्र/रसायनशास्त्र, इतिहास/भूगोल | बुद्धिबळ = chess; इंग्रजी = English subject |
| median / range / mode / mean | मध्यगा / पल्ला / बहुलक / सरासरी | |
| rice/wheat/sugar/tea/coffee/pulses/flour/salt | तांदूळ / गहू / साखर / चहा / कॉफी / डाळ / पीठ / मीठ | MIX_ITEMS pool |
| alligation / cheaper / dearer / mean / sample | मिश्रण नियम / स्वस्त / महाग / मध्य / नमुना | wording gender-invariant (नमुने/प्रमाण/दर carry agreement) |
| Quantity I / Quantity II / compare | राशी I / राशी II / तुलना करा | QC_REL "राशी I > राशी II"; "दोन राशींची तुलना करा" |
| more / less (than) | जास्त / कमी | RAT_PCT descriptor "B पेक्षा 25% जास्त" |

### Shared Hindi table (F-M3; Marathi column deprecated in favour of the canonical Marathi table above)

| English | Hindi | Marathi | Note |
|---|---|---|---|
| square (n²) | वर्ग | — | |
| square root (√) | वर्गमूल | — | |
| cube (n³) | घन | — | |
| cube root | घनमूल | — | |
| area | क्षेत्रफल | — | |
| volume | आयतन | — | |
| surface area | पृष्ठीय क्षेत्रफल | — | TSA संपूर्ण पृष्ठीय क्षेत्रफल; CSA वक्र पृष्ठीय क्षेत्रफल; LSA पार्श्व पृष्ठीय क्षेत्रफल |
| side / edge | भुजा / कोर | — | edge (of cube) = कोर/किनारा |
| length / breadth / height | लंबाई / चौड़ाई / ऊँचाई | — | |
| base / radius / diameter | आधार / त्रिज्या / व्यास | — | |
| rectangle / triangle / circle | आयत / त्रिभुज / वृत्त | — | |
| parallelogram / trapezium | समांतर चतुर्भुज / समलंब चतुर्भुज | — | |
| cube / cuboid / cylinder / sphere / cone | घन / घनाभ / बेलन / गोला / शंकु | — | |
| perpendicular height | लंब ऊँचाई | — | |
| percent / of | प्रतिशत / का | — | "x% of y" → "y का x%" |
| increase / decrease | वृद्धि / कमी | — | |
| discount (successive) | बट्टा (क्रमिक) | — | |
| fraction | भिन्न | — | |
| multiply / product | गुणा / गुणनफल | — | |
| ratio / proportion | अनुपात / समानुपात | — | |
| common (to both) / lend | उभयनिष्ठ / उधार देना | — | per annum प्रति वर्ष; compounded annually वार्षिक चक्रवृद्धि |
| part / share (in ratio) | भाग / हिस्सा | — | |
| divide (a sum) | बाँटना / विभाजित करना | — | |
| average / mean | औसत / माध्य | — | |
| weighted mean | भारित माध्य | — | boys/girls लड़के/लड़कियाँ, weight भार, whole group पूरा समूह |
| salary | वेतन | — | |
| successive discount / single equivalent | क्रमिक बट्टा / एकल तुल्य | — | |
| original value / net fall | मूल मान / कुल गिरावट | — | |
| cost price (CP) / selling price (SP) | क्रय मूल्य / विक्रय मूल्य | — | keep CP/SP Latin in formula lines |
| profit / loss | लाभ / हानि | — | |
| article / shopkeeper | वस्तु / दुकानदार | — | |
| speed / distance / time | चाल / दूरी / समय | — | TSD chapter uses चाल for speed |
| car / train / bus | कार / रेलगाड़ी / बस | — | |
| average speed / relative speed | औसत चाल / सापेक्ष चाल | — | |
| harmonic mean / worker-days / inversely proportional | हरात्मक माध्य / श्रमिक-दिन / व्युत्क्रमानुपाती | — | net rate शुद्ध दर, combined time संयुक्त समय |
| constant difference / interleaved series | अचर अंतर / अंतर्निहित श्रेढ़ी | — | AP समांतर श्रेढ़ी, GP गुणोत्तर श्रेढ़ी |
| platform / pole / metre / second | प्लेटफ़ॉर्म / खंभा / मीटर / सेकंड | — | |
| work / days / workers | कार्य / दिन / श्रमिक | — | |
| together / finish | मिलकर / पूरा करना | — | |
| principal / rate / amount | मूलधन / दर / मिश्रधन | — | |
| simple / compound interest | साधारण ब्याज / चक्रवृद्धि ब्याज | — | per annum = प्रति वर्ष |
| deposit / borrow / invest / loan | जमा करना / उधार लेना / निवेश करना / ऋण | — | |
| partnership / capital / business | साझेदारी / पूँजी / व्यवसाय | — | months = महीने |
| age / years / present age | आयु / वर्ष / वर्तमान आयु | — | son पुत्र, father पिता |
| mixture / alligation | मिश्रण / पल्लीकरण | — | cheaper सस्ता, dearer महँगा, mean price माध्य मूल्य, per kg प्रति किग्रा |
| pipe / tank / fill / empty | नल / टंकी / भरना / खाली करना | — | inlet प्रवेश नल, outlet निकास नल |
| next number / series | अगली संख्या / श्रेढ़ी | — | |
| HCF / LCM | म.स.प. / ल.स.प. | — | full: महत्तम समापवर्तक / लघुत्तम समापवर्त्य; keep म.स.प./ल.स.प. inline |
| Euclid('s algorithm) | यूक्लिड (एल्गोरिथ्म) | — | proper noun, transliterated; used in म.स.प. framing |
| remainder (on dividing) | (भाग देने पर) शेषफल | — | preferred over "mod"; e.g. "N को k से भाग देने पर शेषफल" |
| factors (divisors) / unit digit / power | गुणनखंड / इकाई अंक / घात | — | |
| solve / equation / system | हल कीजिए / समीकरण / निकाय | — | |
| elimination / substitution (method) | विलोपन / प्रतिस्थापन (विधि) | — | linear-system solving methods |
| quadratic / roots / discriminant | द्विघात / मूल / विविक्तकर | — | larger/smaller root बड़ा/छोटा मूल; sum/product योग/गुणनफल |
| Vieta('s formulas) | वीटा (सूत्र) | — | proper noun, transliterated; sum/product of roots relation |
| indices / surds / value | घातांक / करणी / मान | — | |
| quotient law (of indices) | भागफल नियम | — | product/quotient/power laws गुणनफल/भागफल/घात नियम |
| logarithm / base | लघुगणक / आधार | — | keep "log to base b of N" pattern as "b आधार पर N का लघुगणक" |
| AP / GP / term / first term | समांतर श्रेढ़ी / गुणोत्तर श्रेढ़ी / पद / प्रथम पद | — | common difference सार्व अंतर, common ratio सार्व अनुपात |
| inequality / modulus / integer / smallest | असमिका / निरपेक्ष मान / पूर्णांक / सबसे छोटा | — | |
| angle / complement / supplement | कोण / पूरक कोण / संपूरक कोण | — | degree डिग्री (°) |
| isosceles / hypotenuse / right-angled | समद्विबाहु / कर्ण / समकोण | — | vertex(apex) angle शीर्ष कोण, base angle आधार कोण |
| polygon / interior angle / regular | बहुभुज / अंतःकोण / सम | — | |
| ladder / wall | सीढ़ी / दीवार | — | |
| coordinate / point / midpoint / slope | निर्देशांक / बिंदु / मध्यबिंदु / ढाल | — | section formula विभाजन सूत्र; internally आंतरिक रूप से |
| trigonometry / angle of elevation | त्रिकोणमिति / उन्नयन कोण | — | standard-angle table मानक कोण सारणी; identity सर्वसमिका |
| tower/pole/building/tree/flagpole/lighthouse/chimney | मीनार / खंभा / इमारत / पेड़ / ध्वजदंड / लाइटहाउस / चिमनी | — | TRIG_STRUCT pool (index-aligned) |
| permutation / combination / factorial | क्रमचय / संचय / क्रमगुणित | — | |
| arrange / books / committee / people | व्यवस्थित करना / पुस्तकें / समिति / व्यक्ति | — | handshake हस्तमिलन, circular वृत्ताकार, women/men महिलाएँ/पुरुष |
| probability / bag / ball / toss | प्रायिकता / थैला / गेंद / उछालना | — | coin सिक्का, head चित, decimal दशमलव, multiple गुणज, at random यादृच्छिक रूप से |
| red/blue/green/yellow/black/white | लाल / नीला / हरा / पीला / काला / सफ़ेद | — | PROB_COL pool |
| set / union / only / both / neither | समुच्चय / सम्मिलन / केवल / दोनों / कोई नहीं | — | group समूह, class कक्षा, students विद्यार्थी, like पसंद करना, survey सर्वेक्षण |
| tea/coffee, football/cricket, hockey, chess, carrom, tennis, badminton | चाय/कॉफ़ी, फुटबॉल/क्रिकेट, हॉकी, शतरंज, कैरम, टेनिस, बैडमिंटन | — | SET_CTX pool (games/drinks transliterate; subjects translate) |
| Maths/Science/Hindi/English/Physics/Chemistry/History/Geography | गणित / विज्ञान / हिन्दी / अंग्रेज़ी / भौतिकी / रसायन / इतिहास / भूगोल | — | SET_CTX school subjects (school subject, not the language picker) |
| apples/oranges, pizza/burgers, painting/music, guitar/piano, dogs/cats | सेब/संतरे, पिज़्ज़ा/बर्गर, चित्रकला/संगीत, गिटार/पियानो, कुत्ते/बिल्लियाँ | — | SET_CTX pool |
| median / range / mode / mean | माध्यिका / परिसर / बहुलक / माध्य | — | sort क्रम में लगाना, most frequent सबसे अधिक बार आने वाला, average औसत |
| rice/wheat/sugar/tea/coffee/pulses/flour/salt | चावल / गेहूँ / चीनी / चाय / कॉफ़ी / दाल / आटा / नमक | — | MIX_ITEMS pool |
| alligation / cheaper / dearer / mean / sample | मिश्रण नियम / सस्ता / महँगा / माध्य / नमूना | — | mixture worded gender-invariantly (नमूने/मात्रा/दर carry agreement, not the commodity) |
| Quantity I / Quantity II / compare | राशि I / राशि II / तुलना कीजिए | — | QC_REL: "राशि I > राशि II" etc. (I/II Roman, > < = symbols); "दोनों राशियों की तुलना कीजिए" |
| more / less (than) | अधिक / कम | — | RAT_PCT descriptor: "B से 25% अधिक" |

## DI (Data Interpretation) generated-content vocabulary (F-M5)

The authority for `locales/gen/{hi,mr}.di.js`. The DI engine owns all numbers; only the theme/stem/chart WORDING
localizes. Entity brand/city/scheme names transliterate to Devanagari; metric/unit/series/caselet words translate.
Latin stays for: single-letter entity codes (A–F, P–U, X, Y), quarter labels (Q1, Q2), all-caps acronyms (LIC, HDFC,
SBI, ICICI, BSNL, MTNL, ACT, KIMS, ELSS, UPI, GDP, AC, ICU, EV, MW), and unit symbols (₹, %, mm, `'000`). One concept
→ one rendering; extend before use. Marathi column filled in F-M5.3.

| English | Hindi | Marathi | Note |
|---|---|---|---|
| chart / table / graph | चार्ट / तालिका / ग्राफ़ | — | lead-ins: "चार्ट के आधार पर", "तालिका देखें" |
| Year / over the years / Share of / by | वर्ष / वर्षों में / … का हिस्सा / … के अनुसार | — | chart title/axis connectors |
| (in `<unit>`) | (`<unit>` में) | — | metricUnit: "बिक्री (₹ करोड़ में)" |
| Sales / Revenue / Profit / Exports / Imports | बिक्री / राजस्व / लाभ / निर्यात / आयात | — | metrics |
| Production / Output / Units Sold | उत्पादन / उत्पादन / बेची गई इकाई | — | |
| Population / Employees / Students Enrolled / Subscribers | जनसंख्या / कर्मचारी / नामांकित विद्यार्थी / ग्राहक | — | |
| Loans Disbursed / Premiums Collected / Assets Managed | वितरित ऋण / एकत्रित प्रीमियम / प्रबंधित परिसंपत्ति | — | Banking DI |
| Rainfall / Wheat Production / Electricity Generated / Footfall | वर्षा / गेहूँ उत्पादन / उत्पादित बिजली / आगंतुक संख्या | — | |
| Tourist Arrivals / Passengers Carried / Flights Handled / Orders | पर्यटक आगमन / ढोए गए यात्री / संचालित उड़ानें / ऑर्डर | — | |
| crore / lakh / tonnes / units / million | करोड़ / लाख / टन / इकाई / मिलियन | — | translate; ₹/%/mm/MW/`'000` stay |
| Company/Bank Branch/Product/School/Department | कंपनी / बैंक शाखा / उत्पाद / विद्यालय / विभाग | — | entity names |
| City/Store/State/Country/Hospital/Platform/Operator | शहर / स्टोर / राज्य / देश / अस्पताल / प्लेटफ़ॉर्म / ऑपरेटर | — | |
| Power Plant/Destination/Railway Zone/Airport/Insurer/Fund/District/Factory/Team/Mall | विद्युत संयंत्र / गंतव्य / रेलवे ज़ोन / हवाई अड्डा / बीमाकर्ता / फ़ंड / ज़िला / कारख़ाना / टीम / मॉल | — | |
| Online/Retail, Boys/Girls, Urban/Rural, Domestic/Foreign | ऑनलाइन/खुदरा, लड़के/लड़कियाँ, शहरी/ग्रामीण, घरेलू/विदेशी | — | series |
| Prepaid/Postpaid, Thermal/Solar/Renewable, Equity/Debt, Kharif/Rabi | प्रीपेड/पोस्टपेड, तापीय/सौर/नवीकरणीय, इक्विटी/ऋण, खरीफ़/रबी | — | series |
| highest/lowest/total/combined/average/mean | सबसे अधिक / सबसे कम / कुल / संयुक्त / औसत / औसत | — | stems |
| percent / ratio / times / difference / contribute | प्रतिशत / अनुपात / गुना / अंतर / योगदान | — | "1 दशमलव स्थान तक", "निरपेक्ष मान", "सरलतम रूप a:b" |
| caselet: surveyed / men / women / passed / approved | सर्वेक्षित / पुरुष / महिलाएँ / पास की / स्वीकृति पाई | — | acts are perfective (survey = completed measurement; see known-limits) |

### Marathi DI canonical terms (F-M5.3) — Maharashtra register

Gender-safe by construction: किती is invariant, and stems use the locative मध्ये / मधील / पैकी (never the gender-agreeing
genitive चा/ची/चे); caselet counts use the जणांनी (people-ergative) frame with transitive-perfective acts.

| English | Marathi | Note |
|---|---|---|
| chart / table / graph | चार्ट / तक्ता / आलेख | lead: "वरील चार्ट पाहा", "दिलेला तक्ता पाहून उत्तर द्या" |
| Year / over the years / share of / entity-wise | वर्ष / वर्षांनुसार / … चा वाटा / …निहाय | title: "विक्री (₹ कोटी मध्ये), कंपनीनिहाय" |
| (in `<unit>`) | (`<unit>` मध्ये) | metricUnit |
| Sales / Revenue / Profit / Exports / Imports | विक्री / महसूल / नफा / निर्यात / आयात | |
| Production / Output / Units Sold | उत्पादन / उत्पादन / विकलेले नग | |
| Population / Employees / Students Enrolled / Subscribers | लोकसंख्या / कर्मचारी / प्रवेशित विद्यार्थी / ग्राहक | |
| Loans Disbursed / Premiums Collected / Assets Managed | वितरित कर्ज / जमा प्रीमियम / व्यवस्थापित मालमत्ता | |
| Rainfall / Wheat Production / Electricity Generated / Footfall | पर्जन्य / गहू उत्पादन / निर्मित वीज / आगंतुक संख्या | |
| Tourist Arrivals / Passengers Carried / Flights Handled / Orders | पर्यटक आगमन / वाहून नेलेले प्रवासी / हाताळलेली विमाने / ऑर्डर | |
| crore / lakh / tonnes / units / million | कोटी / लाख / टन / नग / दशलक्ष | ₹/%/mm/MW/`'000` stay |
| Company/Bank Branch/State/Country/Hospital/Fund/District/Factory/Team/Mall | कंपनी / बँक शाखा / राज्य / देश / रुग्णालय / फंड / जिल्हा / कारखाना / संघ / मॉल | entities |
| highest/lowest/total/average/difference/ratio/times | सर्वाधिक / सर्वात कमी / एकूण / सरासरी / फरक / गुणोत्तर / पट | "1 दशांश स्थळापर्यंत", "निरपेक्ष मूल्य", "सोप्या रूपात a:b" |
| caselet: surveyed / passed / approved / discharged / booked | सर्वेक्षण केलेले / उत्तीर्ण केली / मंजुरी मिळवली / सुट्टी मिळवली / आरक्षण केले | जणांनी-ergative + transitive perfective |

## Reasoning subjects

| English (app) | Hindi | Marathi | Note |
|---|---|---|---|
| Logical Reasoning | तार्किक तर्कशक्ति | बुद्धिमत्ता चाचणी | MR section umbrella is बुद्धिमत्ता चाचणी (MPSC standard) |
| Syllogisms | न्याय निगमन | तर्क व अनुमान | HI: न्याय निगमन is the Arihant/R.S. Aggarwal chapter name |
| Blood Relations | रक्त संबंध | नातेसंबंध | |
| Coding–Decoding | कोडिंग-डिकोडिंग | सांकेतिक भाषा | HI keeps the transliteration; MR native term dominant |
| Direction Sense | दिशा ज्ञान | दिशा | HI: दिशा ज्ञान परीक्षण |
| Seating Arrangement | बैठक व्यवस्था | बैठक व्यवस्था | |
| Number/Letter Series | संख्या/अक्षर श्रृंखला | अंकमालिका / अक्षरमालिका | exact MPSC words |
| Analogy | सादृश्यता | साधर्म्य | |
| Classification | वर्गीकरण | वर्गीकरण | "odd one out" → MR गटात न बसणारा |
| Puzzles | तार्किक पहेलियाँ | कोडी | |
| Clocks & Calendars | घड़ी और कैलेंडर | घड्याळ व दिनदर्शिका | |
| Statement & Conclusion | कथन और निष्कर्ष | विधान व निष्कर्ष | |

## LR (Logical Reasoning) generated-content vocabulary (F-M6)

The LR engine generates directly in the study language via `locales/gen/{hi,mr}.lr.js`. These are the canonical terms
those packs use; one concept = one rendering per language. Cipher substrates (CAT→DBU), variable letters (A–F, P–U, X, Y),
coded symbols (@#&%$, >≥<≤=) and Roman numerals (I, II) stay Latin in every language (exam-book convention).

### Kinship — the correctness-critical map (relTerm)

`_compose2` yields a generic ENGLISH relation-id; `relTerm(id, specifier)` renders the SPECIFIC native word for the
answer and the CANONICAL word for distractors. **Hindi distinguishes grandparent lineage (दादा vs नाना); Marathi does
NOT (आजोबा covers both) — Marathi is authored from its own kinship system, not calqued from Hindi.**

| Composition (A is r1 of B, B is r2 of C ⇒ A is … of C) | English (generic) | Hindi (specific) | Marathi (specific) |
|---|---|---|---|
| father→father (paternal grandfather) | Grandfather | दादा | आजोबा |
| father→mother / via mother (maternal grandfather) | Grandfather | नाना | आजोबा |
| mother→father (paternal grandmother) | Grandmother | दादी | आजी |
| via mother (maternal grandmother) | Grandmother | नानी | आजी |
| brother→father (father's brother) | Uncle | चाचा | काका |
| brother→mother (mother's brother) | Uncle | मामा | मामा |
| sister→father (father's sister) | Aunt | बुआ | आत्या |
| sister→mother (mother's sister) | Aunt | मौसी | मावशी |
| son→son (grandson via son) | Grandson | पोता | नातू |
| son→daughter (grandson via daughter) | Grandson | नाती | नातू |
| daughter→son / daughter (granddaughter) | Granddaughter | पोती / नातिन | नात |
| son→brother (brother's son) | Nephew | भतीजा | पुतण्या |
| son→sister (sister's son) | Nephew | भांजा | भाचा |
| daughter→brother / sister (niece) | Niece | भतीजी / भांजी | पुतणी / भाची |
| Father / Mother / Brother / Sister / Son / Daughter | (same) | पिता / माता / भाई / बहन / पुत्र / पुत्री | वडील / आई / भाऊ / बहीण / मुलगा / मुलगी |
| Cousin (distractor only) | Cousin | चचेरा भाई | चुलत भाऊ |

The full 36-pair truth table is committed as `scripts/fixtures/lr-kinship.json` and asserted by `lr-kinship.check.js`.

### Directions, syllogism verdicts, inequality verdicts

| English | Hindi | Marathi | Note |
|---|---|---|---|
| North / South / East / West | उत्तर / दक्षिण / पूर्व / पश्चिम | उत्तर / दक्षिण / पूर्व / पश्चिम | |
| North-East / North-West / South-East / South-West | उत्तर-पूर्व / उत्तर-पश्चिम / दक्षिण-पूर्व / दक्षिण-पश्चिम | ईशान्य / वायव्य / आग्नेय / नैऋत्य | **MR uses the Sanskrit intercardinals** (Maharashtra textbook standard) |
| Conclusion follows / does not follow | निष्कर्ष निकलता है / निष्कर्ष नहीं निकलता | निष्कर्ष निघतो / निष्कर्ष निघत नाही | syllogism verdict pair (answered by index) |
| All X are Y / No X are Y / Some X are Y | सभी X, Y हैं / कोई X, Y नहीं है / कुछ X, Y हैं | सर्व X, Y आहेत / एकही X, Y नाही / काही X, Y आहेत | R.S. Aggarwal (HI) / MPSC (MR) quantifier forms |
| Only I / Only II / Both / Either / Neither | केवल I / केवल II / I और II दोनों / या तो I या II / न तो I और न ही II | फक्त I / फक्त II / I आणि II दोन्ही / एकतर I किंवा II / एकही नाही | coded-inequality verdicts (…सत्य है/आहे) |
| Odd one out | विषम (भिन्न) | विषम (वेगळे) | classification stem |
| Sorting-machine step (input-output) | चरण / इनपुट पंक्ति | टप्पा / इनपुट ओळ | |
| Clock hands / angle (degrees) | घंटे व मिनट की सुई / कोण (डिग्री) | तास व मिनिट काटा / कोन (अंश) | |
| Mirror image (of a clock) | दर्पण-प्रतिबिंब | आरशातील प्रतिबिंब | |

**Grammar-engineering notes (recorded once):** HI uses a gender-safe possessive frame where the marker agrees with the
possessed noun (चाल f → की, मुख m → का), and a relation-word marker map (पिता→का, माता→की) for blood stems. MR suffixes
the genitive without a space (मीराची), carries a marker+copula map for honorific वडील (…चे…आहेत), and uses an appositive
dash frame for direction so masculine common-noun actors never mis-inflect. Distances keep the Latin unit `km`
(consistent with the quant/DI packs). Ordinals: HI `n+वें`, MR `n+व्या`, always followed by स्थान.

## UI / product vocabulary

| English | Hindi | Marathi | Rationale |
|---|---|---|---|
| Practice | अभ्यास | सराव | सराव is THE Marathi exam-prep word (सराव प्रश्नसंच) |
| Learn (tab) | सीखें | शिका | |
| Stats (tab) | आँकड़े | आकडेवारी | |
| Settings (tab) | सेटिंग्स | सेटिंग्ज | Indian-app transliteration norm |
| Question / Answer | प्रश्न / उत्तर | प्रश्न / उत्तर | |
| Correct / Wrong | सही / गलत | बरोबर / चूक | |
| Mock Test | मॉक टेस्ट | सराव परीक्षा | HI transliteration is universal in coaching |
| Score | स्कोर | गुण | गुण native-natural in MR |
| Accuracy | सटीकता | अचूकता | |
| Speed | गति | वेग | |
| Streak | स्ट्रीक | स्ट्रीक | brand-feature transliterated (Duolingo pattern), glossed once in onboarding |
| Daily goal | दैनिक लक्ष्य | दैनिक उद्दिष्ट | |
| Revision | रिवीजन | उजळणी | उजळणी is the everyday Marathi study word |
| Trick / Shortcut | ट्रिक | ट्रिक / क्लृप्ती | |
| Solution / Explanation | हल / व्याख्या | उकल / स्पष्टीकरण | HI books: विस्तृत हल |
| Easy / Medium / Hard | आसान / मध्यम / कठिन | सोपे / मध्यम / कठीण | |
| Sign in / Log out | साइन इन / लॉग आउट | साइन इन / लॉग आउट | GPay/PhonePe-pattern transliteration |
| Leaderboard | लीडरबोर्ड | लीडरबोर्ड | no natural equivalent in exam apps |
| Appearance (setting) | दिखावट | स्वरूप | Chrome hi/mr UI terms |
| App language / Study language | ऐप की भाषा / पढ़ाई की भाषा | ॲपची भाषा / अभ्यासाची भाषा | the two ADR-111 channels |

**Decide-once, recorded:** *Math Duel* and *Speed Score* stay English (brand features); QuanAI
feature names (Coach / Insights / Planner / Explain) translate their descriptor while "QuanAI"
stays; *Focus* mode name stays English with a translated descriptor.
