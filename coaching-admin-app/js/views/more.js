/**
 * more.js — Settings, Info & More View
 *
 * Coaching info card, insights section, support, logout.
 */
var MoreView = (function () {
  'use strict';

  function render(forceRefresh) {
    var container = document.getElementById('view-more');
    if (!container) return;

    var html = '';

    /* ── Coaching Info Card ── */
    html += '<div class="coaching-info-card">';
    html += '<div class="coaching-info-header">';
    html += '<div class="coaching-logo">QR</div>';
    html += '<div><div class="coaching-name" id="moreCoachingName">' + CoachingUtils.escapeHtml(CoachingState.get('coachingName') || 'Loading...') + '</div>';
    html += '<div class="coaching-id" id="moreCoachingId">' + CoachingUtils.escapeHtml(CoachingState.get('coachingId') || '') + '</div></div>';
    html += '</div>';
    html += '<div id="moreCoachingDetails">' +
      '<div class="skeleton skeleton-line w-full"></div>' +
      '<div class="skeleton skeleton-line w-75"></div></div>';
    html += '</div>';

    /* ── Insights Section ── */
    html += '<div class="section-header"><div class="section-title">📊 Insights</div></div>';
    html += '<div id="moreInsightsContainer">' + CoachingUtils.skeletonCard(2) + '</div>';

    /* ── Menu Items ── */
    html += '<div class="card mt-lg" style="padding:0;overflow:hidden;">';
    html += _menuItem('📊', 'Refresh All Data', 'Force refresh all cached data', 'MoreView.refreshAll()');
    html += _menuItem('📧', 'Support', 'Contact admin@quantreflex.app', 'MoreView.openSupport()');
    html += _menuItem('📖', 'About', 'QuantReflex Coaching Admin v1.0', '');
    html += '</div>';

    /* ── Logout ── */
    html += '<button class="btn btn-outline btn-full mt-xl" onclick="CoachingAuth.logout()" style="color:var(--accent-red);border-color:rgba(239,68,68,0.3);">🚪 Logout</button>';

    /* ── Version ── */
    html += '<div style="text-align:center;font-size:var(--font-xs);color:var(--text-muted);margin-top:var(--space-xl);padding-bottom:var(--space-xl);">';
    html += 'QuantReflex Coach v1.0.0';
    html += '</div>';

    container.innerHTML = html;

    /* Load coaching details & insights */
    _loadCoachingDetails();
    _loadInsights(forceRefresh);
  }

  function _menuItem(icon, label, hint, onclick) {
    return '<div class="more-item"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' +
      '<div class="more-icon">' + icon + '</div>' +
      '<div class="more-text"><div class="more-label">' + label + '</div>' +
      '<div class="more-hint">' + hint + '</div></div>' +
      '<div class="more-chevron">›</div></div>';
  }

  function _loadCoachingDetails() {
    CoachingAPI.getDashboard(false).then(function (data) {
      if (!data.coaching) return;
      var c = data.coaching;

      /* Update header info */
      var nameEl = document.getElementById('moreCoachingName');
      var idEl = document.getElementById('moreCoachingId');
      if (nameEl) nameEl.textContent = c.name || c.id;
      if (idEl) idEl.textContent = c.id;
      CoachingState.set({ coachingName: c.name || c.id });

      /* Update details */
      var detailsEl = document.getElementById('moreCoachingDetails');
      if (!detailsEl) return;

      var html = '';
      html += _infoRow('Status', c.status === 'active' ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">' + CoachingUtils.capitalize(c.status) + '</span>');
      html += _infoRow('Plan', CoachingUtils.capitalize(c.plan || 'Standard'));
      if (c.capacity) html += _infoRow('Capacity', c.capacity + ' students');
      if (c.expiryDate) html += _infoRow('Expires', CoachingUtils.formatDate(c.expiryDate));
      html += _infoRow('Students', (data.metrics ? data.metrics.totalStudents : '—'));
      html += _infoRow('Since', CoachingUtils.formatDate(c.createdAt));
      detailsEl.innerHTML = html;
    }).catch(function () { /* silent */ });
  }

  function _infoRow(label, value) {
    return '<div class="coaching-info-row"><span class="coaching-info-label">' + label + '</span><span class="coaching-info-value">' + value + '</span></div>';
  }

  function _loadInsights(forceRefresh) {
    var insightsEl = document.getElementById('moreInsightsContainer');
    if (!insightsEl) return;

    CoachingAPI.getInsights(forceRefresh).then(function (data) {
      var html = '';

      /* Accuracy Trend */
      if (data.accuracyTrend) {
        html += '<div class="card card-compact">';
        html += '<div class="card-title">Accuracy Trend</div>';
        html += '<div style="display:flex;gap:var(--space-xl);">';
        html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">This Week</span><br><strong class="text-emerald">' + data.accuracyTrend.thisWeek + '%</strong></div>';
        html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Last Week</span><br><strong>' + data.accuracyTrend.lastWeek + '%</strong></div>';
        var change = data.accuracyTrend.thisWeek - data.accuracyTrend.lastWeek;
        if (change !== 0) {
          html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Change</span><br><strong class="' + (change > 0 ? 'text-emerald' : 'text-red') + '">' + (change > 0 ? '+' : '') + change + '%</strong></div>';
        }
        html += '</div></div>';
      }

      /* Improving Students */
      if (data.improvingStudents && data.improvingStudents.length > 0) {
        html += '<div class="card card-compact">';
        html += '<div class="card-title">📈 Improving Students</div>';
        for (var i = 0; i < Math.min(data.improvingStudents.length, 3); i++) {
          var s = data.improvingStudents[i];
          html += '<div style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-xs) 0;">';
          html += '<div style="font-size:var(--font-sm);flex:1;">' + CoachingUtils.escapeHtml(s.name) + '</div>';
          html += '<div class="stat-pill accuracy">+' + s.improvement + '% faster</div>';
          html += '</div>';
        }
        html += '</div>';
      }

      /* Declining Students */
      if (data.decliningStudents && data.decliningStudents.length > 0) {
        html += '<div class="card card-compact">';
        html += '<div class="card-title">📉 Needs Attention</div>';
        for (var j = 0; j < Math.min(data.decliningStudents.length, 3); j++) {
          var d = data.decliningStudents[j];
          html += '<div style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-xs) 0;">';
          html += '<div style="font-size:var(--font-sm);flex:1;">' + CoachingUtils.escapeHtml(d.name) + '</div>';
          html += '<div class="stat-pill weak-topic">-' + d.decline + '% slower</div>';
          html += '</div>';
        }
        html += '</div>';
      }

      if (!html) {
        html = '<div class="empty-state" style="padding:var(--space-xl);"><div class="empty-state-text">Insights will appear once students start practicing.</div></div>';
      }

      insightsEl.innerHTML = html;
    }).catch(function () {
      insightsEl.innerHTML = '<div class="empty-state" style="padding:var(--space-lg);"><div class="empty-state-text">Could not load insights.</div></div>';
    });
  }

  function refreshAll() {
    CoachingState.invalidateAll();
    Toast.show('Refreshing all data…');
    var currentView = CoachingState.get('currentView');
    if (typeof CoachingApp !== 'undefined' && typeof CoachingApp.navigateTo === 'function') {
      CoachingApp.navigateTo(currentView, true);
    }
  }

  function openSupport() {
    window.open('mailto:admin@quantreflex.app?subject=Coaching%20Admin%20Support', '_blank');
  }

  return { render: render, refreshAll: refreshAll, openSupport: openSupport };
})();
