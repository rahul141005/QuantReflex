/**
 * tabs.js — Tabs segmented control (Super Admin V2, ADR-019 / ADR-026, TECHNICAL_BIBLE §10B).
 *
 * Tabs.mount(container, opts) — opts:
 *   tabs: [{ id, label, render(panelEl) }]   one render fn per tab (lazy: called on select)
 *   active   (optional)                       initial tab id (defaults to first)
 *   onChange (optional)                       (id) => void, fired after each select
 * Returns { select(id) }. Full WAI-ARIA tab pattern (ADR-026): unique per-mount ids, role
 * tablist/tab/tabpanel, aria-selected/aria-controls/aria-labelledby, roving tabindex, and
 * Arrow/Home/End keyboard navigation. 48px touch targets (styled in admin-style.css).
 */
var Tabs = (function () {
  'use strict';

  var _seq = 0;
  function _esc(s) { return (typeof AdminUtils !== 'undefined' && AdminUtils.escapeHtml) ? AdminUtils.escapeHtml(s) : String(s == null ? '' : s); }
  function _err(e) { return (typeof AdminUtils !== 'undefined' && AdminUtils.getReadableError) ? AdminUtils.getReadableError(e) : (e && e.message ? e.message : 'failed'); }

  function mount(container, opts) {
    opts = opts || {};
    var tabs = opts.tabs || [];
    var active = opts.active || (tabs[0] && tabs[0].id);
    var uid = 'tabs' + (++_seq);              /* unique per mount → no duplicate ids when nested */
    var panelId = uid + '-panel';

    container.innerHTML =
      '<div class="tabs"><div class="tabs-bar" role="tablist">' +
        tabs.map(function (t) {
          return '<button class="tab-btn" role="tab" type="button" id="' + uid + '-t-' + _esc(t.id) + '" aria-controls="' + panelId + '" tabindex="-1" data-tab="' + _esc(t.id) + '">' + _esc(t.label || t.id) + '</button>';
        }).join('') +
      '</div><div class="tabs-panel" id="' + panelId + '" role="tabpanel" tabindex="0"></div></div>';

    var bar = container.querySelector('.tabs-bar');
    var panel = container.querySelector('#' + panelId);

    function select(id, focusTab) {
      var t = tabs.filter(function (x) { return x.id === id; })[0] || tabs[0];
      if (!t) return;
      active = t.id;
      var activeBtn = null;
      bar.querySelectorAll('.tab-btn').forEach(function (b) {
        var on = b.getAttribute('data-tab') === t.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');   /* roving tabindex */
        if (on) activeBtn = b;
      });
      if (activeBtn) panel.setAttribute('aria-labelledby', activeBtn.id);
      if (focusTab && activeBtn) { try { activeBtn.focus(); } catch (_) {} }
      panel.innerHTML = '';
      try { t.render(panel); }
      catch (e) { panel.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">' + _esc(_err(e)) + '</div></div>'; }
      if (typeof opts.onChange === 'function') opts.onChange(t.id);
    }

    bar.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.tab-btn') : null;
      if (b) select(b.getAttribute('data-tab'));
    });
    /* APG keyboard: Left/Right move + activate, Home/End jump (ADR-026). */
    bar.addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].indexOf(e.key) === -1) return;
      e.preventDefault();
      var ids = tabs.map(function (x) { return x.id; });
      var i = ids.indexOf(active);
      if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
      else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = ids.length - 1;
      select(ids[i], true);
    });

    select(active);
    return { select: select };
  }

  return { mount: mount };
})();
