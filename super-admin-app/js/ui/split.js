/**
 * split.js — SplitView master/detail primitive (Super Admin V2, ADR-019, TECHNICAL_BIBLE §10B).
 *
 * In-flow two-column layout (master list + detail pane) at >=768px; below that the list is
 * full-width and selecting an item pushes a full-screen detail with a Back affordance.
 * This is the canonical "360" pattern — it REPLACES the old overlay drawer.
 *
 * SplitView.mount(container, opts) — opts:
 *   renderList(listEl)            render the master list into listEl (rows may carry data-sv-id)
 *   renderDetail(detailEl, id)    render the detail for `id` into detailEl
 *   emptyDetail()  (optional)     HTML/string for the no-selection state
 * Returns { select(id), clear(), listEl, detailEl }.
 */
var SplitView = (function () {
  'use strict';

  function mount(container, opts) {
    opts = opts || {};
    container.innerHTML =
      '<div class="splitview">' +
        '<div class="splitview-list" id="svList"></div>' +
        '<div class="splitview-detail" id="svDetail"></div>' +
      '</div>';
    var root = container.querySelector('.splitview');
    var listEl = container.querySelector('#svList');
    var detailEl = container.querySelector('#svDetail');

    function _empty() {
      detailEl.innerHTML = (typeof opts.emptyDetail === 'function')
        ? opts.emptyDetail()
        : '<div class="splitview-empty empty-state"><div class="empty-state-icon">👈</div><div class="empty-state-text">Select an item to view details.</div></div>';
    }

    function select(id) {
      root.classList.add('detail-open');
      detailEl.innerHTML = '<div class="loading">Loading…</div>';
      try { opts.renderDetail(detailEl, id); }
      catch (e) { detailEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">Error: ' + (e && e.message ? e.message : 'failed') + '</div></div>'; }
      listEl.querySelectorAll('[data-sv-id]').forEach(function (el) {
        el.classList.toggle('sv-active', el.getAttribute('data-sv-id') === String(id));
      });
    }

    function clear() {
      root.classList.remove('detail-open');
      _empty();
      listEl.querySelectorAll('.sv-active').forEach(function (el) { el.classList.remove('sv-active'); });
    }

    if (typeof opts.renderList === 'function') { try { opts.renderList(listEl); } catch (_) { /* ignore */ } }
    _empty();
    /* Back button (the caller renders a .sv-back element in the detail pane on small screens). */
    detailEl.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.sv-back') : null;
      if (b) { e.preventDefault(); clear(); }
    });

    return { select: select, clear: clear, listEl: listEl, detailEl: detailEl };
  }

  return { mount: mount };
})();
