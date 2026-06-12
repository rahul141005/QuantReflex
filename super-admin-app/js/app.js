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
    _bindRail();
    _bindTheme();
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
    if (!window.location.hash || !DOMAINS[(window.location.hash || '').substring(1).split('/')[0]]) {
      window.location.hash = '#command-center';
    } else {
      _handleRoute();
    }
  }

  /* V2 7-domain router (ADR-019). Hash may be `#domain` or `#domain/:id` (the id is reserved
     for the 360 detail panes added in later phases; views that ignore it still work). */
  var DOMAINS = {
    'command-center': { cid: 'view-command-center', view: 'CommandCenterView' },
    'users':          { cid: 'view-users',          view: 'UsersView' },
    'coachings':      { cid: 'view-coachings',       view: 'CoachingsView' },
    'revenue':        { cid: 'view-revenue',         view: 'RevenueCenter' },
    'content':        { cid: 'view-questions',       view: 'QuestionsView' },
    'ai':             { cid: 'view-ai',              view: 'AIAnalyticsView' },
    'operations':     { cid: 'view-operations',      view: 'OperationsView' }
  };

  function _handleRoute() {
    var raw = (window.location.hash || '#command-center').substring(1);
    var hash = raw.split('/')[0];
    if (!DOMAINS[hash]) hash = 'command-center';

    AdminState.set({ currentView: hash });

    var activeCid = DOMAINS[hash].cid;
    Object.keys(DOMAINS).forEach(function (h) {
      var el = document.getElementById(DOMAINS[h].cid);
      if (el) { el.style.display = (DOMAINS[h].cid === activeCid) ? 'block' : 'none'; el.classList.toggle('active', DOMAINS[h].cid === activeCid); }
    });

    document.querySelectorAll('.nav-item').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-view') === hash);
    });

    var V = window[DOMAINS[hash].view];
    if (V && typeof V.render === 'function') { try { V.render(); } catch (e) { console.error('[router] view render failed:', hash, e); } }
  }

  /* ---- Theme: light / dark / system, persisted (ADR-024). The no-FOUC boot is inline in index.html;
     this wires the footer toggle (cycles light→dark→system) + live OS-preference updates in system mode. ---- */
  function _bindTheme() {
    var KEY = 'qrAdminTheme';
    var btn = document.getElementById('themeToggleBtn');
    var label = document.getElementById('themeToggleLabel');
    var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function current() { try { return localStorage.getItem(KEY) || 'system'; } catch (_) { return 'system'; } }
    function apply(mode) {
      var dark = mode === 'dark' || (mode === 'system' && mql && mql.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      if (label) label.textContent = mode === 'system' ? 'System' : (mode === 'dark' ? 'Dark' : 'Light');
    }
    apply(current());
    if (btn) btn.addEventListener('click', function () {
      var order = ['light', 'dark', 'system'];
      var next = order[(order.indexOf(current()) + 1) % order.length];
      try { localStorage.setItem(KEY, next); } catch (_) {}
      apply(next);
    });
    if (mql && mql.addEventListener) mql.addEventListener('change', function () { if (current() === 'system') apply('system'); });
  }

  /* ---- Collapsible rail (persisted) ---- */
  function _bindRail() {
    var btn = document.getElementById('railCollapseBtn');
    if (!btn) return;
    try { if (localStorage.getItem('qrAdminRailCollapsed') === '1') document.body.classList.add('rail-collapsed'); } catch (_) {}
    btn.addEventListener('click', function () {
      var collapsed = document.body.classList.toggle('rail-collapsed');
      try { localStorage.setItem('qrAdminRailCollapsed', collapsed ? '1' : '0'); } catch (_) {}
    });
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
    resultsEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary);">Searching ecosystem…</div>';
    var esc = (typeof AdminUtils !== 'undefined' && AdminUtils.escapeHtml) ? AdminUtils.escapeHtml : function (s) { return String(s == null ? '' : s); };
    /* Server-side ecosystem search (ADR-020) — no client fetch-all. */
    API.searchEcosystem(query).then(function (res) {
      var users = (res && res.users) || [];
      var coachings = (res && res.coachings) || [];
      if (!users.length && !coachings.length) {
        resultsEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary);">No matches.</div>';
        return;
      }
      var html = '';
      if (users.length) {
        html += '<div class="search-group-label">Users</div>';
        users.forEach(function (u) {
          html += '<div class="search-result-item" style="padding:.85rem 1rem; border-bottom:1px solid var(--border-color); cursor:pointer;" onclick="GlobalSearch.close(); window.location.hash=\'#users\';">' +
            '<div style="font-weight:600; color:var(--text-strong);">' + esc(u.name || u.email || u.uid) + '</div>' +
            '<div style="font-size:.8rem; color:var(--text-secondary);">' + esc(u.email || u.uid) + (u.coachingId ? ' · ' + esc(u.coachingId) : '') + '</div></div>';
        });
      }
      if (coachings.length) {
        html += '<div class="search-group-label">Coachings</div>';
        coachings.forEach(function (c) {
          html += '<div class="search-result-item" style="padding:.85rem 1rem; border-bottom:1px solid var(--border-color); cursor:pointer;" onclick="GlobalSearch.close(); window.location.hash=\'#coachings\';">' +
            '<div style="font-weight:600; color:var(--text-strong);">' + esc(c.name || c.coachingId) + '</div>' +
            '<div style="font-size:.8rem; color:var(--text-secondary);">' + esc(c.coachingId) + ' · ' + (c.studentCount || 0) + ' students</div></div>';
        });
      }
      resultsEl.innerHTML = html;
    }).catch(function (err) {
      resultsEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--danger-primary);">Search failed: ' + esc(err && err.message ? err.message : 'error') + '</div>';
    });
  }

  return { init: init, open: open, close: close };
})();

/* ---- Bootstrap ---- */
document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
