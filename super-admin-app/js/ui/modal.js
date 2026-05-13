/**
 * modal.js — Bottom-sheet modal system (mobile-first)
 */
var Modal = (function () {
  'use strict';

  function show(config) {
    var container = document.getElementById('modalContainer');
    if (!container) return;
    close(); // remove any existing

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'activeModal';

    var content = document.createElement('div');
    content.className = 'modal-content';

    // Header
    var header = document.createElement('div');
    header.className = 'modal-header';
    var title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = config.title || '';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
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
  }

  function close() {
    var existing = document.getElementById('activeModal');
    if (existing) existing.remove();
  }

  return { show: show, close: close };
})();
