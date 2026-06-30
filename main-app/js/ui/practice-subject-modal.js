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

  var SUBJECTS = [
    { id: 'quant', icon: '🔢', title: 'Quantitative Aptitude', desc: 'Arithmetic, numbers & speed math', kinds: 'Percentages · Ratios · Time-Speed · Profit-Loss' },
    { id: 'di',    icon: '📊', title: 'Data Interpretation',   desc: 'Read charts, tables & caselets',    kinds: 'Bar · Line · Pie · Tables · Caselets' },
    { id: 'lr',    icon: '🧩', title: 'Logical Reasoning',     desc: 'Puzzles, arrangements & deduction', kinds: 'Coding · Syllogisms · Seating · Series' },
    { id: 'mixed', icon: '🎯', title: 'Mixed Aptitude',        desc: 'A balanced cross-subject sprint',   kinds: 'Quant + DI + Reasoning together' }
  ];
  var VALID = { quant: 1, di: 1, lr: 1, mixed: 1 };

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

  function _close(overlay) {
    if (!overlay) overlay = document.getElementById('psmOverlay');
    if (!overlay) return;
    overlay.classList.add('closing');
    document.body.classList.remove('modal-open');
    setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
  }

  function open(onPick) {
    if (_isOpen()) return;
    var last = lastSubject();
    var cards = SUBJECTS.map(function (s) {
      return '<button class="psm-card' + (s.id === last ? ' is-last' : '') + '" type="button" data-subject="' + s.id + '">' +
        '<span class="psm-ico" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="psm-text">' +
          '<span class="psm-title">' + s.title + (s.id === last ? ' <span class="psm-last-tag">Last</span>' : '') + '</span>' +
          '<span class="psm-desc">' + s.desc + '</span>' +
          '<span class="psm-kinds">' + s.kinds + '</span>' +
        '</span>' +
      '</button>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.className = 'ba-modal-overlay';
    overlay.id = 'psmOverlay';
    overlay.innerHTML =
      '<div class="ba-modal-card psm-card-wrap" role="dialog" aria-modal="true" aria-labelledby="psmTitle">' +
        '<div class="ba-modal-head">' +
          '<h2 class="ba-modal-title" id="psmTitle" tabindex="-1">What would you like to practice?</h2>' +
          '<button class="ba-modal-close" id="psmClose" type="button" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="ba-modal-body">' +
          '<div class="psm-grid">' + cards + '</div>' +
          '<label class="psm-dontask"><input type="checkbox" id="psmDontAsk"> <span>Don\'t ask again — start with my last choice</span></label>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    function pick(subjectId) {
      if (!VALID[subjectId]) return;
      var dontAsk = !!(document.getElementById('psmDontAsk') && document.getElementById('psmDontAsk').checked);
      _saveSubjectPrefs(dontAsk ? false : true, subjectId);
      _close(overlay);
      if (typeof SoundEngine !== 'undefined') { try { SoundEngine.play('settingsToggle'); } catch (_) {} }
      if (typeof triggerHaptic === 'function') { try { triggerHaptic(12); } catch (_) {} }
      if (typeof onPick === 'function') onPick(subjectId);
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { _close(overlay); return; }
      var card = e.target.closest ? e.target.closest('.psm-card') : null;
      if (card) pick(card.getAttribute('data-subject'));
    });
    var closeBtn = document.getElementById('psmClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { _close(overlay); });

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); _close(overlay); document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);

    var title = document.getElementById('psmTitle');
    if (title && title.focus) { try { title.focus({ preventScroll: true }); } catch (_) { title.focus(); } }
  }

  return { shouldAsk: shouldAsk, lastSubject: lastSubject, open: open };
})();

if (typeof window !== 'undefined') window.PracticeSubjectModal = PracticeSubjectModal;
