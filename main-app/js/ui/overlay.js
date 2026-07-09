/**
 * overlay.js — the ONE shared overlay controller (UI Phase 1 / M3).
 *
 * Before this, ~15 modals/sheets/drawers each re-implemented the same cross-cutting concerns —
 * body scroll-lock, Escape-to-close, focus-trap, focus-restore-to-opener, backdrop-tap dismiss,
 * and a reduced-motion-aware close animation — with subtle differences (only report-modal trapped
 * focus; several never restored focus). QROverlay centralizes all of it so every overlay behaves
 * identically and accessibly, and adds a standard confirm() dialog that replaces the bespoke ones.
 *
 * Public:
 *   QROverlay.open(overlayEl, opts) -> { close, el, dialog }
 *   QROverlay.confirm(opts) -> { close }
 *   QROverlay.lock() / unlock()      — ref-counted body.modal-open (for overlays that manage their own DOM)
 *   QROverlay.reducedMotion()        — bool
 *
 * Behaviour is preserved exactly: callers pass their existing close guards (dirty-form), sounds,
 * close-animation class and duration, and DOM-remove-vs-hide choice as options.
 */
(function (root) {
  'use strict';

  /* Ref-counted scroll-lock so stacked overlays (e.g. paywall over settings) don't unlock early. */
  var _lockCount = 0;
  /* Always (idempotently) ensure the class is present while any overlay is open, and only drop it at
     count 0. Ensuring on every lock keeps scroll-lock correct even if some overlay is torn down
     externally (e.g. a route change hides it) without going through doClose. */
  function _lock() { _lockCount++; document.body.classList.add('modal-open'); }
  function _unlock() { _lockCount = Math.max(0, _lockCount - 1); if (_lockCount === 0) document.body.classList.remove('modal-open'); }

  function _reduced() {
    try {
      return document.body.classList.contains('reduced-motion') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) { return false; }
  }

  function _focusables(scope) {
    if (!scope) return [];
    return Array.prototype.slice.call(scope.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  /**
   * Wire the shared lifecycle onto an already-in-DOM overlay element.
   * opts:
   *   dialogEl        — the focusable card (trap scope + initial focus); default: first [role=dialog]/.qr-*-card/firstChild
   *   onClose         — run AFTER teardown (focus restored, lock released)
   *   closeOnBackdrop — default true; a click whose target IS the overlay root closes it
   *   closeOnEsc      — default true
   *   closeGuard      — () => bool; return true to BLOCK a backdrop/Esc close (e.g. dirty form)
   *   initialFocus    — element | selector | undefined (default: [data-autofocus] > first focusable > dialog)
   *   animate         — default true; false = instant close
   *   removeOnClose   — default false (hide via style.display='none'); true = remove from DOM
   *   closingClass    — default 'closing'; the class that drives the CSS out-animation (null to skip)
   *   closeMs         — default 200; the out-animation duration (forced to 0 under reduced motion)
   *   sound           — SoundEngine key to play on open
   * Returns { close, el, dialog }.
   */
  function open(overlayEl, opts) {
    opts = opts || {};
    var dialog = opts.dialogEl ||
      overlayEl.querySelector('[role="dialog"], .qr-dialog-card, .qr-sheet-card, .modal-content, .info-modal-content') ||
      overlayEl.firstElementChild || overlayEl;
    var lastFocus = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
    var closed = false;

    _lock();

    function doClose() {
      if (closed) return;
      if (opts.closeGuard && opts.closeGuard()) return;
      closed = true;
      document.removeEventListener('keydown', keyHandler, true);
      overlayEl.removeEventListener('click', backdropHandler);
      var ms = (opts.animate === false || _reduced()) ? 0 : (opts.closeMs != null ? opts.closeMs : 200);
      var closingClass = (opts.closingClass === null) ? null : (opts.closingClass || 'closing');
      if (ms > 0 && closingClass) overlayEl.classList.add(closingClass);
      setTimeout(function () {
        if (opts.removeOnClose) { if (overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl); }
        else { overlayEl.style.display = 'none'; if (closingClass) overlayEl.classList.remove(closingClass); }
        _unlock();
        try { if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); } catch (_) {}
        if (opts.onClose) { try { opts.onClose(); } catch (_) {} }
      }, ms);
    }

    var keyHandler = function (e) {
      if (e.key === 'Escape' && opts.closeOnEsc !== false) { e.preventDefault(); doClose(); return; }
      if (e.key === 'Tab') {
        var f = _focusables(dialog);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    var backdropHandler = function (e) {
      if (opts.closeOnBackdrop === false) return;
      if (e.target === overlayEl) doClose();
    };
    overlayEl.addEventListener('click', backdropHandler);

    /* Initial focus — SR/keyboard users land inside the dialog, not on the now-hidden trigger. */
    var init = opts.initialFocus;
    if (typeof init === 'string') init = dialog.querySelector(init);
    if (!init) init = dialog.querySelector('[data-autofocus]') ||
      (dialog.matches && dialog.matches('[tabindex]') ? dialog : null) ||
      _focusables(dialog)[0] || dialog;
    setTimeout(function () { try { if (init && init.focus) init.focus({ preventScroll: true }); } catch (_) {} }, 30);

    if (opts.sound && root.SoundEngine && SoundEngine.play) { try { SoundEngine.play(opts.sound); } catch (_) {} }

    return { close: doClose, el: overlayEl, dialog: dialog };
  }

  /**
   * Standard confirm dialog (replaces the bespoke exit/clear/delete confirms).
   * opts: title, body(html string), confirmText, cancelText, danger(bool), icon(data-ico name),
   *       onConfirm, onCancel, sound. Callers pass already-localized strings.
   */
  function confirm(opts) {
    opts = opts || {};
    var resolved = false;
    var ov = document.createElement('div');
    ov.className = 'qr-dialog-overlay';
    ov.innerHTML =
      '<div class="qr-dialog-card' + (opts.danger ? ' is-danger' : '') + '" role="dialog" aria-modal="true" aria-labelledby="qrcTitle">' +
        (opts.icon ? '<span class="qr-dialog-icon qr-ico" data-ico="' + opts.icon + '" aria-hidden="true"></span>' : '') +
        '<h3 class="qr-dialog-title" id="qrcTitle" tabindex="-1">' + (opts.title || '') + '</h3>' +
        (opts.body ? '<div class="qr-dialog-body">' + opts.body + '</div>' : '') +
        '<div class="qr-dialog-actions">' +
          '<button class="qr-btn qr-btn-secondary" data-act="cancel" type="button">' + (opts.cancelText || 'Cancel') + '</button>' +
          '<button class="qr-btn ' + (opts.danger ? 'qr-btn-danger' : 'qr-btn-primary') + '" data-act="confirm" type="button">' + (opts.confirmText || 'OK') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var handle = open(ov, {
      removeOnClose: true,
      initialFocus: '[data-act="confirm"]',
      sound: opts.sound,
      onClose: function () { if (!resolved && opts.onCancel) { try { opts.onCancel(); } catch (_) {} } }   // Esc / backdrop = cancel
    });
    ov.querySelector('[data-act="cancel"]').addEventListener('click', function () { resolved = true; handle.close(); if (opts.onCancel) { try { opts.onCancel(); } catch (_) {} } });
    ov.querySelector('[data-act="confirm"]').addEventListener('click', function () { resolved = true; handle.close(); if (opts.onConfirm) { try { opts.onConfirm(); } catch (_) {} } });
    return handle;
  }

  var QROverlay = { open: open, confirm: confirm, lock: _lock, unlock: _unlock, reducedMotion: _reduced, focusables: _focusables };
  if (typeof module !== 'undefined' && module.exports) module.exports = QROverlay;
  if (root) root.QROverlay = QROverlay;
})(typeof window !== 'undefined' ? window : this);
