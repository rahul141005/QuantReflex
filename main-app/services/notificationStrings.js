/**
 * notificationStrings.js — localized notification templates (ADR-111 Phase E, E-M4).
 *
 * Notifications are APP chrome, so they render in the recipient's appLanguage (users/{uid}.settings
 * .appLanguage || 'en'; a user who never synced settings gets English — the correct default). The
 * reminder cron buckets recipients per (template, language) and emits one notify() call per bucket with
 * a pre-localized title/body; the duel-finished notice resolves the recipient's language before
 * composing. notificationService.notify()'s single-title/body contract is untouched (it is upstream of
 * this table), so scripts/notifications.check.js stays green.
 *
 * EN values are the pre-i18n literals VERBATIM (English delivery is byte-identical). hi/mr are authored
 * in app-chrome register per GLOSSARY_I18N; digits, ₹, %, and DNT terms (QuantReflex, Premium, AI,
 * Math Duel) are preserved. Server-only module; dual-exported for the check harness.
 */
'use strict';

var _M = {
  en: {
    'streak.title': 'Keep your streak alive 🔥',
    'streak.body': "You haven't practiced today — a quick 5-question drill keeps your streak going.",
    'daily.title': 'Time to sharpen your reflexes',
    'daily.body': 'A 5-minute mental-math session today compounds into real exam speed.',
    'premiumExpiry.title': 'Your Premium is expiring soon',
    'premiumExpiry.body': 'Renew to keep your AI Coach, Planner, Insights and Math Duels without interruption.',
    'trialExpiry.title': 'Your trial ends soon',
    'trialExpiry.body': 'Upgrade now to keep your full QuantReflex experience.',
    'duel.title': 'Duel finished',
    'duel.body': 'Your duel against {name} is ready — see the result.',
    'duel.defaultOpponent': 'your opponent'
  },
  hi: {
    'streak.title': 'अपनी स्ट्रीक बनाए रखें 🔥',
    'streak.body': 'आपने आज अभ्यास नहीं किया — 5 प्रश्नों का झटपट अभ्यास आपकी स्ट्रीक बनाए रखता है।',
    'daily.title': 'अपने रिफ़्लेक्स पैने करने का समय',
    'daily.body': 'आज का 5 मिनट का मानसिक-गणित सत्र असली परीक्षा गति में बदल जाता है।',
    'premiumExpiry.title': 'आपका Premium जल्द ही समाप्त हो रहा है',
    'premiumExpiry.body': 'बिना रुकावट अपने AI कोच, प्लानर, इनसाइट्स और Math Duel जारी रखने के लिए नवीनीकरण करें।',
    'trialExpiry.title': 'आपका ट्रायल जल्द समाप्त हो रहा है',
    'trialExpiry.body': 'अपना पूरा QuantReflex अनुभव बनाए रखने के लिए अभी अपग्रेड करें।',
    'duel.title': 'डुएल समाप्त',
    'duel.body': '{name} के साथ आपका डुएल तैयार है — नतीजा देखें।',
    'duel.defaultOpponent': 'आपके प्रतिद्वंद्वी'
  },
  mr: {
    'streak.title': 'तुमची स्ट्रीक टिकवा 🔥',
    'streak.body': 'तुम्ही आज सराव केला नाही — 5 प्रश्नांचा झटपट सराव तुमची स्ट्रीक टिकवतो.',
    'daily.title': 'तुमचे रिफ्लेक्स धारदार करण्याची वेळ',
    'daily.body': 'आजचं 5 मिनिटांचं मानसिक-गणित सत्र खऱ्या परीक्षा वेगात रूपांतरित होतं.',
    'premiumExpiry.title': 'तुमचं Premium लवकरच संपत आहे',
    'premiumExpiry.body': 'खंड न पडता तुमचे AI कोच, प्लॅनर, इनसाइट्स आणि Math Duel सुरू ठेवण्यासाठी नूतनीकरण करा.',
    'trialExpiry.title': 'तुमची ट्रायल लवकरच संपते',
    'trialExpiry.body': 'तुमचा संपूर्ण QuantReflex अनुभव टिकवण्यासाठी आताच अपग्रेड करा.',
    'duel.title': 'डुएल संपला',
    'duel.body': '{name} विरुद्धचा तुमचा डुएल तयार आहे — निकाल पाहा.',
    'duel.defaultOpponent': 'तुमचे प्रतिस्पर्धी'
  }
};

function _format(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, function (m, name) {
    return params[name] !== undefined ? String(params[name]) : m;
  });
}
function _valid(lang) { return (lang === 'hi' || lang === 'mr') ? lang : 'en'; }

/** Resolve a notification template string. lang ∈ {en, hi, mr}; anything else → en. Missing hi/mr → en. */
function s(lang, key, params) {
  lang = _valid(lang);
  var value = _M[lang][key];
  if (value === undefined && lang !== 'en') value = _M.en[key];
  if (value === undefined) return key;
  return _format(value, params);
}

var NotificationStrings = { s: s, _MAP: _M };
if (typeof module !== 'undefined' && module.exports) module.exports = NotificationStrings;
if (typeof window !== 'undefined') window.NotificationStrings = NotificationStrings;
