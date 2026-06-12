/**
 * app.js — Coaching Admin App Bootstrap & Router
 *
 * Initializes Firebase, Auth, and handles hash-based routing.
 * Bottom navigation + header with refresh button.
 */
var CoachingApp = (function () {
  'use strict';

  /* 5-tab mobile-first IA (ADR-028): Dashboard · Students · Performance · Engagement · Settings */
  var VIEWS = {
    dashboard: { view: DashboardView, label: 'Dashboard', icon: 'home' },
    students: { view: StudentsView, label: 'Students', icon: 'users' },
    performance: { view: PerformanceView, label: 'Performance', icon: 'trending' },
    engagement: { view: EngagementView, label: 'Engagement', icon: 'megaphone' },
    settings: { view: SettingsView, label: 'Settings', icon: 'settings' }
  };

  function init() {
    /* Init Firebase */
    if (!FirebaseApp.init()) {
      console.error('Firebase init failed');
      return;
    }

    /* Init Auth */
    CoachingAuth.init();

    /* Auth ready callback */
    CoachingAuth.onAuthReady(function (user) {
      if (user) {
        _onAppReady();
      }
    });

    /* Bind auth form events */
    _bindAuthForm();

    /* Hash routing */
    window.addEventListener('hashchange', _handleHash);
  }

  function _onAppReady() {
    /* Navigate to current hash or default */
    var hash = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(hash);
  }

  /**
   * Navigate to a view.
   * @param {string} viewName
   * @param {boolean} [forceRefresh]
   */
  function navigateTo(viewName, forceRefresh) {
    var view = VIEWS[viewName];
    if (!view) viewName = 'dashboard';
    view = VIEWS[viewName];

    /* Update hash without triggering hashchange loop */
    if (window.location.hash !== '#' + viewName) {
      window.location.hash = viewName;
    }

    /* Hide all views, show target */
    var allViews = document.querySelectorAll('.view');
    for (var i = 0; i < allViews.length; i++) {
      allViews[i].classList.remove('active');
    }
    var targetView = document.getElementById('view-' + viewName);
    if (targetView) targetView.classList.add('active');

    /* Update bottom nav */
    var allTabs = document.querySelectorAll('.nav-tab');
    for (var j = 0; j < allTabs.length; j++) {
      allTabs[j].classList.remove('active');
      if (allTabs[j].dataset.view === viewName) {
        allTabs[j].classList.add('active');
      }
    }

    /* Update header title */
    var headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
      if (viewName === 'dashboard') {
        headerTitle.textContent = CoachingState.get('coachingName') || 'Dashboard';
      } else {
        headerTitle.textContent = view.label;
      }
    }

    /* Update state */
    CoachingState.set({ currentView: viewName });

    /* Render the view */
    if (view.view && typeof view.view.render === 'function') {
      view.view.render(!!forceRefresh);
    }
  }

  function _handleHash() {
    if (!CoachingState.get('user')) return;
    var hash = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(hash);
  }

  /**
   * Refresh button handler.
   * Invalidates the current view's cache and re-renders.
   */
  function handleRefresh() {
    var btn = document.getElementById('headerRefreshBtn');
    if (btn) btn.classList.add('spinning');

    var currentView = CoachingState.get('currentView') || 'dashboard';

    /* Invalidate the specific cache */
    switch (currentView) {
      case 'dashboard':
        CoachingState.invalidateCache('dashboardData', 'dashboardFetchedAt');
        break;
      case 'students':
        CoachingState.invalidateCache('studentsCache', 'studentsFetchedAt');
        break;
      case 'performance':
        CoachingState.invalidateCache('performanceCache', 'performanceFetchedAt');
        CoachingState.invalidateCache('insightsCache', 'insightsFetchedAt');
        break;
      case 'engagement':
        CoachingState.invalidateCache('noticesCache', 'noticesFetchedAt');
        break;
      case 'settings':
        CoachingState.invalidateAll();
        break;
    }

    navigateTo(currentView, true);

    /* Stop spinning after a delay */
    setTimeout(function () {
      if (btn) btn.classList.remove('spinning');
    }, 1000);
  }

  /**
   * Bind auth form events (login/register tabs and submit).
   */
  function _bindAuthForm() {
    /* Password visibility toggle */
    var togglePasswordBtn = document.getElementById('togglePasswordVisibility');
    var passwordInput = document.getElementById('authPassword');
    if (togglePasswordBtn && passwordInput) {
      togglePasswordBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);

        var showIcon = this.querySelector('.eye-icon-show');
        var hideIcon = this.querySelector('.eye-icon-hide');
        if (type === 'text') {
          if (showIcon) showIcon.style.display = 'none';
          if (hideIcon) hideIcon.style.display = 'block';
          this.setAttribute('aria-label', 'Hide password');
        } else {
          if (showIcon) showIcon.style.display = 'block';
          if (hideIcon) hideIcon.style.display = 'none';
          this.setAttribute('aria-label', 'Show password');
        }
      });
    }

    /* Tab switching */
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('.auth-tab');
      if (!tab) return;

      var allTabs = document.querySelectorAll('.auth-tab');
      for (var i = 0; i < allTabs.length; i++) {
        allTabs[i].classList.remove('active');
      }
      tab.classList.add('active');

      var mode = tab.dataset.mode;
      var registerFields = document.getElementById('registerFields');
      var submitBtn = document.getElementById('authSubmitBtn');
      var errorEl = document.getElementById('authError');

      if (registerFields) registerFields.style.display = mode === 'register' ? 'block' : 'none';
      if (submitBtn) submitBtn.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
      if (errorEl) errorEl.style.display = 'none';
    });

    /* Submit */
    var submitBtn = document.getElementById('authSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var activeTab = document.querySelector('.auth-tab.active');
        var mode = activeTab ? activeTab.dataset.mode : 'login';
        var email = document.getElementById('authEmail').value.trim();
        var password = document.getElementById('authPassword').value;

        if (mode === 'register') {
          var coachingId = document.getElementById('authCoachingId').value.trim();
          CoachingAuth.register(email, password, coachingId);
        } else {
          CoachingAuth.login(email, password);
        }
      });
    }

    /* Enter key support */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var authScreen = document.getElementById('authScreen');
        if (authScreen && authScreen.style.display !== 'none') {
          var btn = document.getElementById('authSubmitBtn');
          if (btn && !btn.disabled) btn.click();
        }
      }
    });
  }

  return { init: init, navigateTo: navigateTo, handleRefresh: handleRefresh };
})();

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', function () {
  CoachingApp.init();
});
