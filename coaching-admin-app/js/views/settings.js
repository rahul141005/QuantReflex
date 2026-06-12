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
    }).catch(function () {
      _paint(root, {}, {});   // settings should still render account actions even if metrics fail
    });
  }

  function _row(label, value) {
    return '<div class="coaching-info-row"><div class="coaching-info-label">' + U.escapeHtml(label) + '</div>' +
      '<div class="coaching-info-value">' + value + '</div></div>';
  }

  function _paint(root, c, m) {
    var name = c.name || CoachingState.get('coachingName') || 'Your coaching';
    var id = c.id || CoachingState.get('coachingId') || '—';

    var html = '<div class="view-pad">';

    /* Coaching info */
    html += '<div class="coaching-info-card mb-lg">';
    html += '<div class="coaching-info-header"><div class="coaching-logo">' + U.escapeHtml(U.getInitial(name)) + '</div>' +
      '<div><div class="coaching-name">' + U.escapeHtml(name) + '</div>' +
      '<div class="coaching-id">' + U.escapeHtml(id) + '</div></div></div>';
    html += _row('Status', '<span class="badge ' + (c.status === 'active' ? 'badge-active' : 'badge-inactive') + '">' + U.escapeHtml(U.capitalize(c.status || 'active')) + '</span>');
    if (c.plan) html += _row('Plan', U.escapeHtml(U.capitalize(c.plan)));
    if (m.totalStudents != null) html += _row('Students', U.formatNumber(m.totalStudents));
    if (c.expiryDate) html += _row('Expires', U.escapeHtml(U.formatDate(c.expiryDate)));
    if (c.createdAt) html += _row('Since', U.escapeHtml(U.formatDate(c.createdAt)));
    html += '</div>';

    /* Actions */
    html += '<div class="section-label">Account</div>';
    html += '<button class="more-item" onclick="SettingsView.support()">' +
      '<span class="more-icon">✉️</span><span class="more-text"><span class="more-label">Support</span>' +
      '<span class="more-hint">' + U.escapeHtml(SUPPORT_EMAIL) + '</span></span><span class="more-chevron">›</span></button>';
    html += '<button class="more-item" onclick="SettingsView.logout()">' +
      '<span class="more-icon">🚪</span><span class="more-text"><span class="more-label">Log out</span></span>' +
      '<span class="more-chevron">›</span></button>';

    html += '<div class="text-center list-row-sub muted" style="padding:var(--space-2xl) 0;">QuantReflex Coach v' + APP_VERSION + '</div>';
    html += '</div>';
    root.innerHTML = html;
  }

  function support() {
    window.location.href = 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('QuantReflex Coaching support');
  }

  function logout() {
    if (typeof CoachingAuth !== 'undefined' && CoachingAuth.logout) CoachingAuth.logout();
  }

  return { render: render, support: support, logout: logout };
})();
