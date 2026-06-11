/**
 * inactive.js — Inactive User Center (ADR-014)
 * Find dormant accounts and run the safe archive → 30-day hold → purge workflow.
 */
var InactiveView = (function () {
  'use strict';

  var _users = [];
  var _days = 90;

  var BTN = 'padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:14px;font-weight:600;';
  var BTN_PRIMARY = 'padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-size:14px;font-weight:600;';
  var BTN_DANGER = 'padding:8px 14px;border-radius:8px;border:none;background:#dc2626;color:#fff;cursor:pointer;font-size:14px;font-weight:600;';

  function render() {
    var c = document.getElementById('view-inactive');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">Inactive User Center</h2>' +
        '<p class="view-subtitle">Reduce database clutter — archive dormant accounts (reversible 30-day hold), then auto-purge.</p>' +
      '</div>' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">' +
        '<label style="font-size:14px;color:#64748b;">Inactive for at least</label>' +
        '<select id="inactiveDays" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;">' +
          '<option value="30">30 days</option><option value="60">60 days</option>' +
          '<option value="90" selected>90 days</option><option value="180">180 days (6 months)</option>' +
          '<option value="365">365 days</option>' +
        '</select>' +
        '<button id="inactiveLoadBtn" style="' + BTN_PRIMARY + '">Load</button>' +
        '<button id="inactiveExportBtn" style="' + BTN + '">Export CSV</button>' +
      '</div>' +
      '<div id="inactiveBulkBar" style="display:none;gap:8px;margin-bottom:12px;align-items:center;">' +
        '<button id="inactiveArchiveBtn" style="' + BTN_DANGER + '">Archive Selected</button>' +
        '<button id="inactiveRemindBtn" style="' + BTN + '">Send Reminder</button>' +
        '<span id="inactiveSelCount" style="color:#64748b;font-size:14px;"></span>' +
      '</div>' +
      '<div id="inactiveContent"><div class="empty-state"><div class="empty-state-text">Choose a window and click Load.</div></div></div>';

    document.getElementById('inactiveLoadBtn').addEventListener('click', _load);
    document.getElementById('inactiveArchiveBtn').addEventListener('click', _archiveSelected);
    document.getElementById('inactiveRemindBtn').addEventListener('click', _remindSelected);
    document.getElementById('inactiveExportBtn').addEventListener('click', _export);
  }

  function _selectedUids() {
    return Array.prototype.map.call(document.querySelectorAll('.inactive-check:checked'), function (b) { return b.value; });
  }

  function _updateBar() {
    var n = _selectedUids().length;
    var bar = document.getElementById('inactiveBulkBar');
    if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
    var sc = document.getElementById('inactiveSelCount');
    if (sc) sc.textContent = n + ' selected';
  }

  async function _load() {
    _days = parseInt(document.getElementById('inactiveDays').value, 10) || 90;
    var content = document.getElementById('inactiveContent');
    content.innerHTML = 'Loading…';
    try {
      var res = await API.getInactiveUsers(_days, 300);
      _users = res.data || [];
      if (!_users.length) {
        content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No users inactive for ' + _days + '+ days.</div></div>';
        _updateBar();
        return;
      }
      var rows = _users.map(function (u) {
        var planColor = u.plan === 'premium' ? '#f59e0b' : '#64748b';
        return '<tr style="border-bottom:1px solid #e2e8f0;">' +
          '<td style="padding:8px;"><input type="checkbox" class="inactive-check" value="' + u.uid + '"></td>' +
          '<td style="padding:8px;">' + AdminUtils.escapeHtml(u.displayName || '') +
            '<div style="font-size:12px;color:#64748b;">' + AdminUtils.escapeHtml(u.email || '') + '</div></td>' +
          '<td style="padding:8px;color:' + planColor + ';font-weight:600;">' + u.plan + '</td>' +
          '<td style="padding:8px;color:#64748b;">' + (u.lastActive ? AdminUtils.formatDate(u.lastActive) : '—') + '</td>' +
          '<td style="padding:8px;">' + (u.inactiveFlaggedAt ? '<span style="font-size:12px;color:#b45309;">⚑ flagged</span>' : '') + '</td>' +
          '</tr>';
      }).join('');
      content.innerHTML =
        '<div style="margin-bottom:8px;color:#64748b;font-size:14px;">' + _users.length + ' user(s) inactive for ' + _days + '+ days</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="text-align:left;color:#64748b;border-bottom:2px solid #e2e8f0;">' +
        '<th style="padding:8px;"><input type="checkbox" id="inactiveSelectAll"></th><th style="padding:8px;">User</th>' +
        '<th style="padding:8px;">Plan</th><th style="padding:8px;">Last Active</th><th style="padding:8px;">Status</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
      document.getElementById('inactiveSelectAll').addEventListener('change', function (e) {
        document.querySelectorAll('.inactive-check').forEach(function (b) { b.checked = e.target.checked; });
        _updateBar();
      });
      document.querySelectorAll('.inactive-check').forEach(function (b) { b.addEventListener('change', _updateBar); });
      _updateBar();
    } catch (e) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-text" style="color:#ef4444;">Failed: ' + AdminUtils.getReadableError(e) + '</div></div>';
    }
  }

  async function _archiveSelected() {
    var uids = _selectedUids();
    if (!uids.length) return;
    if (!confirm('Archive ' + uids.length + ' account(s)?\n\nThey will be Auth-disabled and permanently deleted after a 30-day hold (reversible via Restore until then).')) return;
    try {
      var r = await API.bulkArchiveInactive(uids);
      Toast.show('Archived ' + r.archived + ' account(s) — purge after ' + (r.purgeAfter || '').split('T')[0] + '.', 'success');
      _load();
    } catch (e) { Toast.show('Archive failed: ' + AdminUtils.getReadableError(e), 'error'); }
  }

  async function _remindSelected() {
    var uids = _selectedUids();
    if (!uids.length) return;
    try {
      var r = await API.bulkRemindInactive(uids);
      Toast.show('Reminder sent to ' + r.sent + ' of ' + r.targeted + ' user(s).', 'success');
    } catch (e) { Toast.show('Reminder failed: ' + AdminUtils.getReadableError(e), 'error'); }
  }

  async function _export() {
    try {
      var res = await API.getInactiveExport(_days);
      AdminUtils.downloadCsv(res.filename, res.csv);
      Toast.show('Exported ' + (res.rowCount != null ? res.rowCount : '?') + ' row(s).', 'success');
    } catch (e) { Toast.show('Export failed: ' + AdminUtils.getReadableError(e), 'error'); }
  }

  return { render: render };
})();
