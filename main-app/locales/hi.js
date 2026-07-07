/**
 * locales/hi.js — हिन्दी UI catalog (ADR-111).
 *
 * Register: exam-book Hindi — तत्सम technical nouns with everyday verbs, आप-form,
 * transliteration where Indian apps universally transliterate (सेटिंग्स, डार्क).
 * Terms follow docs/BIBLE/GLOSSARY_I18N.md (Arihant / R.S. Aggarwal chapter
 * vocabulary). Do-not-translate: QuantReflex, QuanAI, Premium, DI, LR, AI,
 * exam acronyms, digits 0-9, units, ₹, %.
 */
(function () {
  'use strict';
  if (typeof QRI18n === 'undefined') return;

  QRI18n.register('hi', {

    nav: {
      home: 'होम',
      practice: 'अभ्यास',
      learn: 'सीखें',
      stats: 'आँकड़े',
      settings: 'सेटिंग्स'
    },

    settings: {
      appearanceTitle: 'दिखावट',
      appearanceDesc: 'डिवाइस के अनुसार, या लाइट/डार्क चुनें',
      appearanceSystem: 'सिस्टम',
      appearanceLight: 'लाइट',
      appearanceDark: 'डार्क',
      languageSectionNote: 'भाषा',
      appLanguageTitle: 'ऐप की भाषा',
      appLanguageDesc: 'मेनू, बटन और स्क्रीन',
      studyLanguageTitle: 'पढ़ाई की भाषा',
      studyLanguageDesc: 'प्रश्न, हल और सीखने के अध्याय',
      langEnglish: 'English',
      langHindi: 'हिन्दी',
      langMarathi: 'मराठी',
      languageUpdated: 'भाषा बदल दी गई'
    }

  });
})();
