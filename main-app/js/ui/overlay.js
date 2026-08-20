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
  /* Per-class ref-counts (FW-W2): most overlays lock via body.modal-open, but the paywall keeps its
     historical body.paywall-open (its CSS + router teardown key on it). Always (idempotently) ensure
     the class is present while any overlay holding it is open, and only drop it at count 0 — so
     stacked overlays and external teardown (route change) can't unlock early or leak. */
  var _locks = {};
  function _lock(cls) { cls = cls || 'modal-open'; _locks[cls] = (_locks[cls] || 0) + 1; document.body.classList.add(cls); }
  function _unlock(cls) { cls = cls || 'modal-open'; _locks[cls] = Math.max(0, (_locks[cls] || 0) - 1); if (_locks[cls] === 0) document.body.classList.remove(cls); }

  function _reduced() {
    try {
      return document.body.classList.contains('reduced-motion') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) { return false; }
  }

  /* Open-overlay stack (FW-W2): each open() pushes a token; Escape and the Tab focus-trap only act
     on the TOP-MOST overlay, so a stacked pair (confirm over paywall, paywall over settings) closes
     one layer per Esc instead of collapsing together, and two live traps can't fight. */
  var _stack = [];

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
    var token = {};
    _stack.push(token);
    /* ADR-163: the token carries its own close so releaseAll() can drain the stack THROUGH the real
       lifecycle (ref-count, listeners, focus restore) instead of anyone reaching past it. */
    token.close = function () { doClose(); };

    _lock(opts.lockClass);

    function doClose() {
      if (closed) return;
      if (opts.closeGuard && opts.closeGuard()) return;
      closed = true;
      var si = _stack.indexOf(token); if (si !== -1) _stack.splice(si, 1);
      document.removeEventListener('keydown', keyHandler, true);
      overlayEl.removeEventListener('click', backdropHandler);
      var ms = (opts.animate === false || _reduced()) ? 0 : (opts.closeMs != null ? opts.closeMs : 200);
      var closingClass = (opts.closingClass === null) ? null : (opts.closingClass || 'closing');
      var finish = function () {
        if (opts.removeOnClose) { if (overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl); }
        else { overlayEl.style.display = 'none'; if (closingClass) overlayEl.classList.remove(closingClass); }
        _unlock(opts.lockClass);
        try { if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); } catch (_) {}
        if (opts.onClose) { try { opts.onClose(); } catch (_) {} }
      };
      /* An instant close (ms 0) tears down SYNCHRONOUSLY so close-then-reopen sequences (e.g. duel
         arena-full → "Create my own") can't race a deferred hide that would blank the new overlay. */
      if (ms > 0 && closingClass) overlayEl.classList.add(closingClass);
      if (ms > 0) setTimeout(finish, ms); else finish();
    }

    var keyHandler = function (e) {
      if (_stack[_stack.length - 1] !== token) return;   // only the top-most overlay handles keys
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
      initialFocus: opts.initialFocus || '[data-act="confirm"]',   // pass '[data-act="cancel"]' for destructive flows
      sound: opts.sound,
      onClose: function () { if (!resolved && opts.onCancel) { try { opts.onCancel(); } catch (_) {} } }   // Esc / backdrop = cancel
    });
    var cancelBtn = ov.querySelector('[data-act="cancel"]');
    var confirmBtn = ov.querySelector('[data-act="confirm"]');
    cancelBtn.addEventListener('click', function () { resolved = true; handle.close(); if (opts.onCancel) { try { opts.onCancel(); } catch (_) {} } });
    confirmBtn.addEventListener('click', function () {
      resolved = true;
      var r;
      if (opts.onConfirm) { try { r = opts.onConfirm(); } catch (_) {} }
      /* FW-W2: async onConfirm — a thenable keeps the dialog up in a loading state and closes on
         resolve; on reject the buttons re-enable so the user can retry or cancel. */
      if (r && typeof r.then === 'function') {
        confirmBtn.disabled = true; cancelBtn.disabled = true; confirmBtn.classList.add('is-loading');
        r.then(function () { handle.close(); }, function () {
          resolved = false;
          confirmBtn.disabled = false; cancelBtn.disabled = false; confirmBtn.classList.remove('is-loading');
        });
      } else { handle.close(); }
    });
    return handle;
  }

  /**
   * ADR-163 — THE SUPPORTED WAY TO TEAR EVERY OVERLAY DOWN ON A ROUTE CHANGE.
   *
   * Callers used to do this by hand: hide every `.modal-overlay` with `style.display='none'` and strip
   * `body.modal-open` with a raw classList.remove. That leaves this module's per-class ref-count
   * untouched, so `_locks['modal-open']` stays at 1 forever. The class LOOKS gone, and then the next
   * overlay to open takes the count to 2 and its close only brings it back to 1 — from that moment the
   * class can never be removed again.
   *
   * That is not a cosmetic scroll bug. `body.modal-open` is half of the drill engine's
   * `_blockedByOverlay()` predicate, which (since ADR-158) gates the numpad pointer handler, the
   * physical-keyboard handler, both MCQ handlers and both Submit paths. A leaked class means NO
   * question in any drill or duel can be answered until the app is restarted.
   *
   * Drains newest-first so stacked overlays unwind in the order they were opened. Each doClose() is
   * idempotent, so an overlay already closed is a no-op. Anything that survives — an overlay whose
   * element was ripped out of the DOM by someone else, leaving its token orphaned — is reported and
   * the counts are force-cleared, because a stuck lock is worse than a lost teardown.
   */
  function releaseAll() {
    for (var i = _stack.length - 1; i >= 0; i--) {
      var t = _stack[i];
      try { if (t && typeof t.close === 'function') t.close(); } catch (_) { /* keep draining */ }
    }
    _stack.length = 0;
    var stuck = [];
    for (var cls in _locks) {
      if (Object.prototype.hasOwnProperty.call(_locks, cls) && _locks[cls] > 0) stuck.push(cls + '=' + _locks[cls]);
      _locks[cls] = 0;
      try { document.body.classList.remove(cls); } catch (_) {}
    }
    if (stuck.length) {
      try { console.warn('[QROverlay] releaseAll force-cleared a stuck lock: ' + stuck.join(', ')); } catch (_) {}
    }
  }

  var QROverlay = { open: open, confirm: confirm, lock: _lock, unlock: _unlock, releaseAll: releaseAll, reducedMotion: _reduced, focusables: _focusables };
  if (typeof module !== 'undefined' && module.exports) module.exports = QROverlay;
  if (root) root.QROverlay = QROverlay;
})(typeof window !== 'undefined' ? window : this);
