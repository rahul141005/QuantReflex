/**
 * practice-subject-modal.js — "What would you like to practice?" subject picker (ADR-080).
 *
 * Shown when a Quick-Start session style (Quick Drill / Reflex Drill / Timed Test) is tapped, so the user chooses a
 * subject (Quant / Data Interpretation / Logical Reasoning / Mixed) before a multi-subject session starts. Reuses the
 * Battle-Archives modal shell (.ba-modal-overlay / .ba-modal-card + paywall fade/scale animations) so it looks and
 * behaves exactly like the rest of the app's premium modals: centered, blurred backdrop, spring scale-in, ESC +
 * backdrop close, focus management.
 *
 * Preference: the last choice is remembered and pre-highlighted; a "Don't ask again" checkbox flips
 * settings.practiceAskSubject to false so future Quick-Start launches go straight to the remembered subject. The
 * toggle can be turned back on in Settings → Practice Preferences.
 *
 * Public API:
 *   PracticeSubjectModal.shouldAsk() -> bool      (false once the user opts out)
 *   PracticeSubjectModal.lastSubject() -> 'quant'|'di'|'lr'|'mixed'
 *   PracticeSubjectModal.open(onPick)             (onPick(subjectId) fires on a chosen subject)
 */
var PracticeSubjectModal = (function () {
  'use strict';

  /* Localized at render time (QRI18n may not be ready at module load). `k` is the locale-key stem. */
  var SUBJECTS = [
    { id: 'quant', icon: '🔢', k: 'Quant' },
    { id: 'di',    icon: '📊', k: 'Di' },
    { id: 'lr',    icon: '🧩', k: 'Lr' },
    { id: 'mixed', icon: '🎯', k: 'Mixed' }
  ];
  var VALID = { quant: 1, di: 1, lr: 1, mixed: 1 };

  /* i18n helper — QRI18n.t returns the en value (ultimate fallback) if a locale is missing a key. */
  function _t(key) { return (typeof QRI18n !== 'undefined' && QRI18n.t) ? QRI18n.t(key) : key; }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function _settings() {
    try { if (typeof loadSettings === 'function') return loadSettings(); } catch (_) {}
    return {};
  }
  function _saveSubjectPrefs(askAgain, lastSubject) {
    try {
      if (typeof loadSettings !== 'function' || typeof saveSettings !== 'function') return;
      var s = loadSettings();
      if (typeof askAgain === 'boolean') s.practiceAskSubject = askAgain;
      if (lastSubject) s.practiceLastSubject = lastSubject;
      saveSettings(s);
    } catch (_) {}
  }

  function shouldAsk() { var s = _settings(); return s.practiceAskSubject !== false; }
  function lastSubject() { var s = _settings(); return VALID[s.practiceLastSubject] ? s.practiceLastSubject : 'quant'; }

  function _isOpen() { return !!document.getElementById('psmOverlay'); }

  /* FW-W1: the overlay lifecycle lives in QROverlay now; _close routes through the active handle
     (kept as a function so external callers keep working). */
  var _handle = null;
  function _close() { if (_handle) { _handle.close(); _handle = null; } }

  function open(onPick) {
    if (_isOpen()) return;
    var last = lastSubject();
    var lastTag = _esc(_t('practice.subjectLast'));
    var cards = SUBJECTS.map(function (s) {
      var title = _esc(_t('practice.subject' + s.k + 'Title'));
      var desc = _esc(_t('practice.subject' + s.k + 'Desc'));
      var kinds = _esc(_t('practice.subject' + s.k + 'Kinds'));
      return '<button class="psm-card' + (s.id === last ? ' is-last' : '') + '" type="button" data-subject="' + s.id + '">' +
        '<span class="psm-ico" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="psm-text">' +
          '<span class="psm-title">' + title + (s.id === last ? ' <span class="psm-last-tag">' + lastTag + '</span>' : '') + '</span>' +
          '<span class="psm-desc">' + desc + '</span>' +
          '<span class="psm-kinds">' + kinds + '</span>' +
        '</span>' +
      '</button>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.className = 'ba-modal-overlay';
    overlay.id = 'psmOverlay';
    overlay.innerHTML =
      '<div class="ba-modal-card psm-card-wrap" role="dialog" aria-modal="true" aria-labelledby="psmTitle">' +
        '<div class="ba-modal-head">' +
          '<h2 class="ba-modal-title" id="psmTitle" tabindex="-1">' + _esc(_t('practice.subjectHeading')) + '</h2>' +
          '<button class="ba-modal-close" id="psmClose" type="button" aria-label="' + _esc(_t('practice.subjectClose')) + '">✕</button>' +
        '</div>' +
        '<div class="ba-modal-body">' +
          '<div class="psm-grid">' + cards + '</div>' +
          '<label class="psm-dontask"><input type="checkbox" id="psmDontAsk"> <span>' + _esc(_t('practice.subjectDontAsk')) + '</span></label>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    /* FW-W1: shared lifecycle — adds the focus-trap and focus-restore this modal never had. */
    _handle = QROverlay.open(overlay, {
      dialogEl: overlay.querySelector('.ba-modal-card'),
      removeOnClose: true, closingClass: 'closing', closeMs: 200,
      initialFocus: '#psmTitle',
      onClose: function () { _handle = null; }
    });

    function pick(subjectId) {
      if (!VALID[subjectId]) return;
      var dontAsk = !!(document.getElementById('psmDontAsk') && document.getElementById('psmDontAsk').checked);
      _saveSubjectPrefs(dontAsk ? false : true, subjectId);
      _close();
      if (typeof SoundEngine !== 'undefined') { try { SoundEngine.play('settingsToggle'); } catch (_) {} }
      if (typeof triggerHaptic === 'function') { try { triggerHaptic(12); } catch (_) {} }
      if (typeof onPick === 'function') onPick(subjectId);
    }

    overlay.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.psm-card') : null;
      if (card) pick(card.getAttribute('data-subject'));
    });
    var closeBtn = document.getElementById('psmClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { _close(); });
  }

  return { shouldAsk: shouldAsk, lastSubject: lastSubject, open: open };
})();

if (typeof window !== 'undefined') window.PracticeSubjectModal = PracticeSubjectModal;
