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
