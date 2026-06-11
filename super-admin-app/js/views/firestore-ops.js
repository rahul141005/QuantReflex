/**
 * firestore-ops.js — Firestore Operations (Phase 5, ADR-018)
 *
 * Live per-collection sizes via count() aggregation (server-side, scales to 1M+),
 * plus a day-over-day growth column derived from the `metrics.collectionCounts`
 * snapshot series (written daily by cron/sweep). No on-demand full-collection scans.
 */
var FirestoreOpsView = (function () {
  'use strict';

  function render() {
    var c = document.getElementById('view-firestore');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div><h2 class="view-title">Firestore Ops</h2>' +
        '<p class="view-subtitle">Live collection sizes (count() aggregation) + daily growth from the snapshot series.</p></div>' +
        '<button class="btn btn-sm btn-outline" id="fsRefreshBtn">Refresh</button>' +
      '</div>' +
      '<div id="fsBody"><div class="loading">Counting collections…</div></div>';
    var btn = document.getElementById('fsRefreshBtn');
    if (btn) btn.onclick = _loadData;
    _loadData();
  }

  function _num(v) { return (v === null || v === undefined) ? '—' : Number(v).toLocaleString(); }

  async function _loadData() {
    var body = document.getElementById('fsBody');
    if (!body) return;
    body.innerHTML = '<div class="loading">Counting collections…</div>';
    try {
      var res = await API.getFirestoreOps();
      var live = res.live || {};
      var series = res.series || [];

      /* Growth = earliest vs latest snapshot in the available window. */
      var first = series.length ? (series[0].collectionCounts || {}) : {};
      var last = series.length ? (series[series.length - 1].collectionCounts || {}) : {};
      var firstDate = series.length ? series[0].date : null;
      var lastDate = series.length ? series[series.length - 1].date : null;

      var names = Object.keys(live).sort();
      var rows = names.map(function (name) {
        var cur = live[name];
        var a = (typeof first[name] === 'number') ? first[name] : null;
        var b = (typeof last[name] === 'number') ? last[name] : null;
        var delta = (a !== null && b !== null) ? (b - a) : null;
        var deltaTxt = (delta === null) ? '—' : (delta >= 0 ? '+' + _num(delta) : _num(delta));
        var deltaColor = (delta === null) ? '#64748b' : (delta > 0 ? '#059669' : (delta < 0 ? '#dc2626' : '#64748b'));
        return '<tr>' +
          '<td><code>' + AdminUtils.escapeHtml(name) + '</code></td>' +
          '<td style="font-weight:700;">' + _num(cur) + '</td>' +
          '<td style="color:' + deltaColor + ';">' + deltaTxt + '</td>' +
        '</tr>';
      }).join('');

      var windowNote = (firstDate && lastDate && firstDate !== lastDate)
        ? 'Growth over the snapshot window ' + AdminUtils.escapeHtml(firstDate) + ' → ' + AdminUtils.escapeHtml(lastDate) + '.'
        : 'Growth needs ≥2 daily snapshots (one cron run per day) — the Δ column fills in over time.';

      body.innerHTML =
        '<div class="card" style="padding:1rem;">' +
          '<div class="table-wrap"><table class="data-table"><thead><tr><th>Collection</th><th>Documents (live)</th><th>Growth (Δ)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<p class="text-sm text-secondary" style="margin-top:.75rem;">' + windowNote + '</p>' +
        '</div>';
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error: ' + AdminUtils.escapeHtml(AdminUtils.getReadableError(e)) + '</div></div>';
    }
  }

  return { render: render };
})();
