/**
 * settings.js — Institute settings (ADR-028). A thin drawer: coaching info, support, logout.
 * (Single de-gamered dark theme — no toggle. No notification-channel prefs exist, so none are shown.)
 */
var SettingsView = (function () {
  'use strict';

  var U = CoachingUtils;
  var APP_VERSION = '3.0';
  var SUPPORT_EMAIL = 'quantreflex@gmail.com';

  function render(forceRefresh) {
    var root = document.getElementById('view-settings');
    if (!root) return;
    root.innerHTML = '<div class="view-pad">' + U.skeletonCard(2) + '</div>';

    CoachingAPI.getDashboard(forceRefresh).then(function (data) {
      var c = (data && data.coaching) || {};
      var m = (data && data.metrics) || {};
      _paint(root, c, m);
    }).catch(function (err) {
      /* Don't paint placeholder data as if real — show an honest error + retry, but keep the
         always-available account actions (support/logout) usable. */
      root.innerHTML = '<div class="view-pad">' + _updateSection() +
        '<div class="empty-state"><div class="empty-state-icon">' + U.icon('alert', 28) + '</div>' +
        '<div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="SettingsView.render(true)">Retry</button></div>' +
        _accountActions() + '</div>';
    });
  }

  /* ADR-102: the Update section appears ONLY when QRUpdateManager reports a pending update — nothing is
     shown otherwise. Identical flow/wording to the main app; native coach styling. */
  function _updateSection() {
    if (!(window.QRUpdateManager && QRUpdateManager.isUpdateAvailable())) return '';
    return '<div class="card card-compact mb-lg" id="coachUpdateCard">' +
      '<div class="coaching-info-row"><div>' +
        '<div class="coaching-info-label">Update available</div>' +
        '<div class="more-hint">(Refresh app to latest version)</div></div>' +
      '<button class="btn btn-primary btn-sm" id="coachUpdateBtn" type="button" onclick="SettingsView.applyUpdate()">🔄 Update App</button>' +
      '</div></div>';
  }
  function applyUpdate() {
    var b = document.getElementById('coachUpdateBtn');
    if (b) { b.disabled = true; b.textContent = '⏳ Updating app...'; }
    if (typeof Toast !== 'undefined') Toast.show('Updating app...');
    if (window.QRUpdateManager) QRUpdateManager.applyUpdate();
  }
  /* Re-render if an update is detected while the Settings view is already open (live reveal). */
  function notifyUpdate() {
    var v = document.getElementById('view-settings');
    if (v && v.classList.contains('active')) render(false);
  }

  /* Account actions (support + logout) — always available even when coaching info fails to load. */
  function _accountActions() {
    return '<div class="section-title">Help &amp; account</div>' +
      _moreItem('book', 'How QuantReflex works', null, 'SettingsView.toggleInfo(\'how\')') +
      '<div id="info-how" class="info-panel" hidden>' +
        '<p>QuantReflex trains <strong>mental-math speed</strong>. Students drill timed question sets; the app measures how fast and accurately they solve.</p>' +
        '<p>Your dashboard shows the coaching\'s <strong>average solving speed</strong>, who\'s practicing, who needs a nudge, and who\'s improving — so you can keep students engaged and demonstrate real progress.</p>' +
        '<p>Speed history builds up day by day; until there\'s enough, trend cards honestly say "collecting" rather than show a guess.</p>' +
      '</div>' +
      _moreItem('info', 'Privacy &amp; terms', null, 'SettingsView.toggleInfo(\'legal\')') +
      '<div id="info-legal" class="info-panel" hidden>' +
        '<p>Student practice data is used only to power your coaching analytics. We never sell it or share identifiable data with other coachings.</p>' +
        '<p>Coaching notes are private to you. For data requests or questions, email ' + U.escapeHtml(SUPPORT_EMAIL) + '.</p>' +
      '</div>' +
      _moreItem('info', 'Support', SUPPORT_EMAIL, 'SettingsView.support()') +
      _moreItem('edit', 'Log out', null, 'SettingsView.logout()');
  }

  function _moreItem(iconName, label, hint, onclick) {
    return '<button class="more-item" onclick="' + onclick + '">' +
      '<span class="more-icon">' + U.icon(iconName, 18) + '</span>' +
      '<span class="more-text"><span class="more-label">' + label + '</span>' +
      (hint ? '<span class="more-hint">' + U.escapeHtml(hint) + '</span>' : '') +
      '</span><span class="more-chevron">›</span></button>';
  }

  function _row(label, value) {
    return '<div class="coaching-info-row"><div class="coaching-info-label">' + U.escapeHtml(label) + '</div>' +
      '<div class="coaching-info-value">' + value + '</div></div>';
  }

  function _paint(root, c, m) {
    var name = c.name || CoachingState.get('coachingName') || 'Your coaching';
    var id = c.id || CoachingState.get('coachingId') || '—';

    var html = '<div class="view-pad">';
    html += _updateSection();

    /* Coaching info — logo when present, else name-initial avatar */
    html += '<div class="coaching-info-card mb-lg">';
    var avatar = (c.logoUrl)
      ? '<img class="coaching-logo coaching-logo-img" src="' + U.escapeHtml(c.logoUrl) + '" alt="' + U.escapeHtml(name) + ' logo" onerror="this.style.display=\'none\'" />'
      : '<div class="coaching-logo">' + U.escapeHtml(U.getInitial(name)) + '</div>';
    html += '<div class="coaching-info-header">' + avatar +
      '<div><div class="coaching-name">' + U.escapeHtml(name) + '</div>' +
      '<div class="coaching-id">' + U.escapeHtml(id) + '</div></div></div>';

    /* Copyable coaching code — the join key students need (highest-value miss before V4) */
    html += '<div class="coaching-code-row" role="button" tabindex="0" onclick="SettingsView.copyCode()" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();SettingsView.copyCode();}" aria-label="Copy coaching code">' +
      '<div><div class="coaching-info-label">Coaching code</div><div class="coaching-code-val" id="coachCode">' + U.escapeHtml(id) + '</div></div>' +
      '<span class="coaching-code-copy">' + U.icon('copy', 18) + ' Copy</span></div>';

    html += _row('Status', '<span class="badge ' + (c.status === 'active' ? 'badge-active' : 'badge-inactive') + '">' + U.escapeHtml(U.capitalize(c.status || 'active')) + '</span>');
    if (c.plan) html += _row('Plan', U.escapeHtml(U.capitalize(c.plan)));
    if (m.totalStudents != null) html += _row('Students', U.formatNumber(m.totalStudents) + (c.capacity ? ' / ' + U.formatNumber(c.capacity) : ''));
    if (c.expiryDate) html += _row('Expires', U.escapeHtml(U.formatDate(c.expiryDate)));
    if (c.createdAt) html += _row('Since', U.escapeHtml(U.formatDate(c.createdAt)));
    html += '</div>';

    /* Actions */
    html += _accountActions();

    html += '<div class="text-center list-row-sub muted" style="padding:var(--space-2xl) 0;">QuantReflex Coach v' + APP_VERSION + '</div>';
    html += '</div>';
    root.innerHTML = html;
  }

  /* One-tap copy of the coaching code (ADR-030) with a graceful fallback when clipboard API is unavailable. */
  function copyCode() {
    var el = document.getElementById('coachCode');
    var code = el ? el.textContent : (CoachingState.get('coachingId') || '');
    if (!code || code === '—') return;
    function ok() { if (typeof Toast !== 'undefined') Toast.success('Coaching code copied'); }
    function fail() { if (typeof Toast !== 'undefined') Toast.info('Code: ' + code); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(ok).catch(fail);
    } else {
      fail();
    }
  }

  function toggleInfo(which) {
    var el = document.getElementById('info-' + which);
    if (el) el.hidden = !el.hidden;
  }

  function support() {
    window.location.href = 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('QuantReflex Coaching support');
  }

  function logout() {
    if (typeof CoachingAuth !== 'undefined' && CoachingAuth.logout) CoachingAuth.logout();
  }

  return { render: render, support: support, logout: logout, copyCode: copyCode, toggleInfo: toggleInfo, applyUpdate: applyUpdate, notifyUpdate: notifyUpdate };
})();
