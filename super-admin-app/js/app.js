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
    GlobalSearch.init();

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
    var views = ['dashboard', 'users', 'inactive', 'coachings', 'payments', 'questions', 'system', 'ai', 'notifications'];
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
    if (hash === 'inactive' && typeof InactiveView !== 'undefined') InactiveView.render();
    if (hash === 'coachings') CoachingsView.render();
    if (hash === 'payments') PaymentsView.render();
    if (hash === 'questions') QuestionsView.render();
    if (hash === 'system') SystemView.render();
    if (hash === 'ai') AIAnalyticsView.render();
    if (hash === 'notifications') NotificationsView.render();
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

/**
 * GlobalSearch - Handles Cmd+K / Ctrl+K search functionality
 */
var GlobalSearch = (function() {
  'use strict';
  
  var _searchTimeout = null;

  function init() {
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape') {
        close();
      }
    });

    var input = document.getElementById('globalSearchInput');
    if (input) {
      input.addEventListener('input', function(e) {
        clearTimeout(_searchTimeout);
        var query = e.target.value.trim();
        if (query.length < 3) {
          document.getElementById('globalSearchResults').innerHTML = '';
          return;
        }
        _searchTimeout = setTimeout(function() {
          _performSearch(query);
        }, 400);
      });
    }
  }

  function open() {
    var overlay = document.getElementById('globalSearchOverlay');
    var input = document.getElementById('globalSearchInput');
    if (!overlay) return;
    overlay.style.display = 'block';
    if (input) {
      input.value = '';
      input.focus();
    }
    document.getElementById('globalSearchResults').innerHTML = '';
  }

  function close() {
    var overlay = document.getElementById('globalSearchOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function _performSearch(query) {
    var resultsEl = document.getElementById('globalSearchResults');
    resultsEl.innerHTML = '<div style="padding:1rem; text-align:center; color:#64748b;">Searching ecosystem...</div>';
    
    // We fetch all users for now and filter locally (assuming <10k users cached or server-side endpoint needed).
    // A production search should hit Algolia or a dedicated search endpoint.
    // For this pass, we'll call API.getUsers and filter on name, uid, email, coachingId
    API.getUsers().then(function(res) {
      var allUsers = res.data || res.users || [];
      var q = query.toLowerCase();
      var matches = allUsers.filter(function(u) {
        return (u.displayName && u.displayName.toLowerCase().indexOf(q) > -1) ||
               (u.email && u.email.toLowerCase().indexOf(q) > -1) ||
               (u.uid && u.uid.toLowerCase().indexOf(q) > -1) ||
               (u.coachingId && u.coachingId.toLowerCase().indexOf(q) > -1);
      }).slice(0, 10); // max 10 results

      if (matches.length === 0) {
        resultsEl.innerHTML = '<div style="padding:1rem; text-align:center; color:#64748b;">No matching users found.</div>';
        return;
      }

      var html = '';
      matches.forEach(function(u) {
        html += '<div style="padding:1rem; border-bottom:1px solid #e2e8f0; cursor:pointer;" class="search-result-item" onclick="GlobalSearch.close(); if(typeof UserDrawer !== \'undefined\') UserDrawer.open(\'' + u.uid + '\')">';
        html += '<div style="font-weight:600; color:#0f172a;">' + (u.displayName || u.email || 'Unknown') + '</div>';
        html += '<div style="font-size:0.875rem; color:#64748b;">' + (u.email || u.uid) + '</div>';
        if (u.coachingId) html += '<span class="badge badge-draft" style="font-size:0.7rem;">' + u.coachingId + '</span>';
        html += '</div>';
      });
      resultsEl.innerHTML = html;
    }).catch(function(err) {
      resultsEl.innerHTML = '<div style="padding:1rem; text-align:center; color:#ef4444;">Search failed: ' + err.message + '</div>';
    });
  }

  return { init: init, open: open, close: close };
})();

/* ---- Bootstrap ---- */
document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
