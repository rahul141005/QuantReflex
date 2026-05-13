/**
 * app.js — Main entry point and SPA router for Admin Panel
 *
 * Mirrors the main app's bootstrap philosophy:
 * Initialize Firebase → Auth → Router → Views
 */
var App = (function () {
  'use strict';

  function init() {
    if (!FirebaseApp.init()) {
      console.error('Firebase failed to initialize.');
      return;
    }

    AdminAuth.init();
    _bindLogin();
    _bindLogout();
    _bindSidebar();

    AdminAuth.onAuthReady(function (user) {
      if (user) {
        _startRouter();
      }
    });
  }

  /* ---- Router ---- */
  function _startRouter() {
    window.addEventListener('hashchange', _handleRoute);
    if (!window.location.hash) {
      window.location.hash = '#dashboard';
    } else {
      _handleRoute();
    }
  }

  function _handleRoute() {
    var hash = (window.location.hash || '#dashboard').substring(1);
    var views = ['dashboard', 'users', 'payments', 'questions', 'system', 'ai'];
    if (views.indexOf(hash) === -1) hash = 'dashboard';

    // Update state
    AdminState.set({ currentView: hash });

    // Toggle views
    views.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) {
        el.style.display = v === hash ? 'block' : 'none';
        el.classList.toggle('active', v === hash);
      }
    });

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-view') === hash);
    });

    // Render view
    if (hash === 'dashboard') DashboardView.render();
    if (hash === 'users') UsersView.render();
    if (hash === 'payments') PaymentsView.render();
    if (hash === 'questions') QuestionsView.render();
    if (hash === 'system') SystemView.render();
    if (hash === 'ai') AIAnalyticsView.render();
  }

  /* ---- Login Form ---- */
  function _bindLogin() {
    var btn = document.getElementById('loginBtn');
    var emailInput = document.getElementById('loginEmail');
    var passInput = document.getElementById('loginPassword');

    if (btn) {
      btn.addEventListener('click', function () {
        var email = emailInput.value.trim();
        var password = passInput.value;
        if (email && password) {
          AdminAuth.login(email, password);
        }
      });
    }

    // Enter key support
    if (passInput) {
      passInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') btn.click();
      });
    }
  }

  /* ---- Logout ---- */
  function _bindLogout() {
    var btn = document.getElementById('logoutBtn');
    if (btn) btn.addEventListener('click', AdminAuth.logout);
  }

  /* ---- Sidebar Toggle ---- */
  function _bindSidebar() {
    var btn = document.getElementById('menuToggleBtn');
    var overlay = document.getElementById('sidebarOverlay');
    var sidebar = document.getElementById('sidebar');

    function toggleSidebar() {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
    }

    if (btn) btn.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', toggleSidebar);

    // Close sidebar on navigation (mobile)
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(el) {
      el.addEventListener('click', function() {
        if (window.innerWidth < 768) {
          sidebar.classList.remove('active');
          overlay.classList.remove('active');
        }
      });
    });
  }

  return { init: init };
})();

/* ---- Bootstrap ---- */
document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
