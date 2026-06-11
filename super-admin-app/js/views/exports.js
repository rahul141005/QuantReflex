/**
 * exports.js — Export Center (ADR-016)
 * Download platform data as CSV via authenticated fetch + client-side Blob download.
 */
var ExportsView = (function () {
  'use strict';

  var BTN = 'padding:10px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:14px;font-weight:600;color:#0f172a;';
  var TYPES = [
    { type: 'users', label: '⬇ All Users' },
    { type: 'premium', label: '⬇ Premium Users' },
    { type: 'coachings', label: '⬇ Coachings' },
    { type: 'revenue', label: '⬇ Revenue (Payments)' },
    { type: 'ai-usage', label: '⬇ AI Usage' },
    { type: 'inactive', label: '⬇ Inactive Users (90d)' }
  ];

  function render() {
    var c = document.getElementById('view-exports');
    if (!c) return;
    var btns = TYPES.map(function (t) {
      return '<button data-export="' + t.type + '" style="' + BTN + 'margin:.25rem;">' + t.label + '</button>';
    }).join('');
    c.innerHTML =
      '<div class="view-header"><h2 class="view-title">Export Center</h2>' +
      '<p class="view-subtitle">Download platform data as CSV (authenticated; capped per request).</p></div>' +
      '<div class="card" style="padding:1.25rem;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:.5rem;">' + btns + '</div>' +
        '<div id="exportStatus" style="margin-top:1rem;color:#64748b;font-size:.85rem;"></div>' +
      '</div>';
    c.querySelectorAll('[data-export]').forEach(function (b) {
      b.addEventListener('click', function () { _doExport(b.getAttribute('data-export'), b); });
    });
  }

  async function _doExport(type, btn) {
    var status = document.getElementById('exportStatus');
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Exporting…';
    try {
      var res = (type === 'inactive') ? await API.getInactiveExport(90) : await API.exportData(type);
      AdminUtils.downloadCsv(res.filename, res.csv);
      if (status) status.textContent = 'Exported ' + (res.rowCount != null ? res.rowCount : '?') + ' row(s) → ' + res.filename;
      Toast.show('Export ready: ' + res.filename, 'success');
    } catch (e) {
      if (status) status.textContent = '';
      Toast.show('Export failed: ' + AdminUtils.getReadableError(e), 'error');
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  return { render: render };
})();
