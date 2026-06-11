/**
 * tabs.js — Tabs segmented control (Super Admin V2, ADR-019, TECHNICAL_BIBLE §10B).
 *
 * Tabs.mount(container, opts) — opts:
 *   tabs: [{ id, label, render(panelEl) }]   one render fn per tab (lazy: called on select)
 *   active   (optional)                       initial tab id (defaults to first)
 *   onChange (optional)                       (id) => void, fired after each select
 * Returns { select(id) }. ARIA tablist; 44px touch targets (styled in admin-style.css).
 */
var Tabs = (function () {
  'use strict';

  function _esc(s) { return (typeof AdminUtils !== 'undefined' && AdminUtils.escapeHtml) ? AdminUtils.escapeHtml(s) : String(s == null ? '' : s); }

  function mount(container, opts) {
    opts = opts || {};
    var tabs = opts.tabs || [];
    var active = opts.active || (tabs[0] && tabs[0].id);

    container.innerHTML =
      '<div class="tabs"><div class="tabs-bar" role="tablist">' +
        tabs.map(function (t) {
          return '<button class="tab-btn" role="tab" type="button" data-tab="' + _esc(t.id) + '">' + _esc(t.label || t.id) + '</button>';
        }).join('') +
      '</div><div class="tabs-panel" id="tabsPanel" role="tabpanel"></div></div>';

    var bar = container.querySelector('.tabs-bar');
    var panel = container.querySelector('#tabsPanel');

    function select(id) {
      var t = tabs.filter(function (x) { return x.id === id; })[0] || tabs[0];
      if (!t) return;
      active = t.id;
      bar.querySelectorAll('.tab-btn').forEach(function (b) {
        var on = b.getAttribute('data-tab') === t.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panel.innerHTML = '';
      try { t.render(panel); }
      catch (e) { panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">Error: ' + _esc(e && e.message ? e.message : 'failed') + '</div></div>'; }
      if (typeof opts.onChange === 'function') opts.onChange(t.id);
    }

    bar.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.tab-btn') : null;
      if (b) select(b.getAttribute('data-tab'));
    });

    select(active);
    return { select: select };
  }

  return { mount: mount };
})();
