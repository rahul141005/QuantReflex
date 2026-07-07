/**
 * locales/mr.js — मराठी UI catalog (ADR-111).
 *
 * Register: Target-Publications Marathi — native chapter words (शेकडेवारी,
 * उजळणी, सराव), तुम्ही-form, transliteration where Marathi apps universally
 * transliterate (सेटिंग्ज, डार्क). Terms follow docs/BIBLE/GLOSSARY_I18N.md
 * (MPSC syllabus vocabulary). Do-not-translate: QuantReflex, QuanAI, Premium,
 * DI, LR, AI, exam acronyms, digits 0-9, units, ₹, %.
 */
(function () {
  'use strict';
  if (typeof QRI18n === 'undefined') return;

  QRI18n.register('mr', {

    nav: {
      home: 'होम',
      practice: 'सराव',
      learn: 'शिका',
      stats: 'आकडेवारी',
      settings: 'सेटिंग्ज'
    },

    settings: {
      appearanceTitle: 'स्वरूप',
      appearanceDesc: 'डिव्हाइसप्रमाणे, किंवा लाइट/डार्क निवडा',
      appearanceSystem: 'सिस्टीम',
      appearanceLight: 'लाइट',
      appearanceDark: 'डार्क',
      languageSectionNote: 'भाषा',
      appLanguageTitle: 'ॲपची भाषा',
      appLanguageDesc: 'मेनू, बटणे आणि स्क्रीन',
      studyLanguageTitle: 'अभ्यासाची भाषा',
      studyLanguageDesc: 'प्रश्न, उकल आणि शिकण्याचे धडे',
      langEnglish: 'English',
      langHindi: 'हिन्दी',
      langMarathi: 'मराठी',
      languageUpdated: 'भाषा बदलली'
    }

  });
})();
