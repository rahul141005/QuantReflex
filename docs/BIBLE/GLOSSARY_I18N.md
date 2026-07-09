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
| factors (divisors) / unit digit / power | गुणनखंड / इकाई अंक / घात | — | |
| solve / equation / system | हल कीजिए / समीकरण / निकाय | — | |
| quadratic / roots / discriminant | द्विघात / मूल / विविक्तकर | — | larger/smaller root बड़ा/छोटा मूल; sum/product योग/गुणनफल |
| indices / surds / value | घातांक / करणी / मान | — | |
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
| Maths/Science/Hindi/English/Physics/Chemistry/History/Geography | गणित / विज्ञान / हिंदी / अंग्रेज़ी / भौतिकी / रसायन / इतिहास / भूगोल | — | SET_CTX school subjects (school subject, not the language picker) |
| apples/oranges, pizza/burgers, painting/music, guitar/piano, dogs/cats | सेब/संतरे, पिज़्ज़ा/बर्गर, चित्रकला/संगीत, गिटार/पियानो, कुत्ते/बिल्लियाँ | — | SET_CTX pool |
| rice/wheat/sugar/tea/coffee/pulses/flour/salt | चावल / गेहूँ / चीनी / चाय / कॉफ़ी / दाल / आटा / नमक | — | MIX_ITEMS pool |
| Quantity I / Quantity II / compare | राशि I / राशि II / तुलना कीजिए | — | QC_REL: "राशि I > राशि II" etc. (I/II Roman, > < = symbols) |
| more / less (than) | अधिक / कम | — | RAT_PCT descriptor: "B से 25% अधिक" |

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
