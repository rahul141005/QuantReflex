/**
 * locales/en.js — English UI catalog (ADR-111).
 *
 * English is the REFERENCE locale: keys land here first (values extracted
 * verbatim from the surface they replace), then hi.js / mr.js mirror the key
 * set 1:1 — scripts/i18n.check.js enforces parity, placeholder-token parity
 * and the do-not-translate glossary.
 *
 * Static index.html text stays inline as the English source of truth; keys
 * here back the data-i18n overwrite for hi/mr and the JS-rendered surfaces'
 * t() calls. Study-content translations (questions, Learn, tips) are NOT in
 * this catalog — they ship as parallel data files on the tc() channel.
 */
(function () {
  'use strict';
  if (typeof QRI18n === 'undefined') return;

  QRI18n.register('en', {

    nav: {
      home: 'Home',
      practice: 'Practice',
      learn: 'Learn',
      stats: 'Stats',
      settings: 'Settings'
    },

    settings: {
      appearanceTitle: 'Appearance',
      appearanceDesc: 'Follow your device, or set light or dark',
      appearanceSystem: 'System',
      appearanceLight: 'Light',
      appearanceDark: 'Dark',
      languageSectionNote: 'Language',
      appLanguageTitle: 'App language',
      appLanguageDesc: 'Menus, buttons and screens',
      studyLanguageTitle: 'Study language',
      studyLanguageDesc: 'Questions, solutions and Learn chapters',
      langEnglish: 'English',
      langHindi: 'हिन्दी',
      langMarathi: 'मराठी',
      languageUpdated: 'Language updated'
    }

  });
})();
