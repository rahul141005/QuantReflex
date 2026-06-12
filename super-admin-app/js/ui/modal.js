/**
 * modal.js — Modal system. Bottom-sheet on small screens, centered >=768px (admin-style.css).
 * Super Admin V2 (ADR-019, §10B): adds a focus-trap, Escape-to-close, and focus restoration.
 */
var Modal = (function () {
  'use strict';

  var _prevFocus = null;
  var _keyHandler = null;

  function _focusable(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function show(config) {
    var container = document.getElementById('modalContainer');
    if (!container) return;
    close(); // remove any existing
    _prevFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'activeModal';

    var content = document.createElement('div');
    content.className = 'modal-content';
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    content.setAttribute('tabindex', '-1');
    if (config.title) content.setAttribute('aria-labelledby', 'modalTitle'); /* accessible name (ADR-026) */
    else content.setAttribute('aria-label', 'Dialog');

    // Header
    var header = document.createElement('div');
    header.className = 'modal-header';
    var title = document.createElement('h3');
    title.className = 'modal-title';
    title.id = 'modalTitle';                 /* target of content's aria-labelledby (ADR-026) */
    title.textContent = config.title || '';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    closeBtn.onclick = close;
    header.appendChild(title);
    header.appendChild(closeBtn);
    content.appendChild(header);

    // Body
    if (typeof config.body === 'string') {
      var bodyDiv = document.createElement('div');
      bodyDiv.innerHTML = config.body;
      content.appendChild(bodyDiv);
    } else if (config.body) {
      content.appendChild(config.body);
    }

    // Actions
    if (config.actions && config.actions.length > 0) {
      var actions = document.createElement('div');
      actions.className = 'modal-actions';
      config.actions.forEach(function (action) {
        var btn = document.createElement('button');
        btn.className = 'btn' + (action.accent ? ' accent' : '') + (action.danger ? ' btn-danger' : ' btn-outline');
        btn.textContent = action.label;
        btn.onclick = function () {
          if (action.onClick) action.onClick(btn);
          if (action.autoClose !== false) close();
        };
        actions.appendChild(btn);
      });
      content.appendChild(actions);
    }

    overlay.appendChild(content);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    container.appendChild(overlay);

    // Focus management: focus the first input (or first focusable / the dialog itself).
    var firstInput = content.querySelector('input, select, textarea');
    var firstFocusable = _focusable(content)[0];
    var target = firstInput || firstFocusable || content;
    if (target && target.focus) { try { target.focus(); } catch (_) { /* ignore */ } }

    // Focus-trap + Escape.
    _keyHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var f = _focusable(content);
        if (!f.length) return;
        var firstE = f[0], lastE = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstE) { e.preventDefault(); lastE.focus(); }
        else if (!e.shiftKey && document.activeElement === lastE) { e.preventDefault(); firstE.focus(); }
      }
    };
    document.addEventListener('keydown', _keyHandler, true);
  }

  function close() {
    var existing = document.getElementById('activeModal');
    if (existing) existing.remove();
    if (_keyHandler) { document.removeEventListener('keydown', _keyHandler, true); _keyHandler = null; }
    if (_prevFocus && _prevFocus.focus) { try { _prevFocus.focus(); } catch (_) { /* ignore */ } }
    _prevFocus = null;
  }

  return { show: show, close: close };
})();
