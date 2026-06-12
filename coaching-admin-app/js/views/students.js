/**
 * students.js — Roster + Student-360 (ADR-028).
 *
 * Mobile pattern: a searchable/sortable roster; tapping a student PUSHES a full-screen detail
 * into the same view (back affordance) — not a bottom sheet, not a split-pane. Leads with speed.
 */
var StudentsView = (function () {
  'use strict';

  var U = CoachingUtils;
  var _all = [];
  var _cursor = null;
  var _sort = 'recent';   // recent | speed | accuracy
  var _text = '';

  function render(forceRefresh) {
    var root = document.getElementById('view-students');
    if (!root) return;
    root.innerHTML = '<div class="view-pad">' + U.skeletonCard(5) + '</div>';
    CoachingAPI.getStudents(forceRefresh).then(function (data) {
      _all = (data && data.students) || [];
      _cursor = (data && data.nextCursor) || null;
      _renderRoster(root);
    }).catch(function (err) {
      root.innerHTML = '<div class="view-pad"><div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="StudentsView.render(true)">Retry</button></div></div>';
    });
  }

  function _matches(s) {
    if (!_text) return true;
    var q = _text.toLowerCase();
    return ((s.name || '') + ' ' + (s.email || '')).toLowerCase().indexOf(q) !== -1;
  }

  function _sorted(rows) {
    var r = rows.slice();
    if (_sort === 'speed') {
      r.sort(function (a, b) {
        var as = a.speed || 9999, bs = b.speed || 9999;   // faster (lower) first; 0/none last
        if (!a.speed) as = 9999; if (!b.speed) bs = 9999;
        return as - bs;
      });
    } else if (_sort === 'accuracy') {
      r.sort(function (a, b) { return (b.accuracy || 0) - (a.accuracy || 0); });
    } else {
      r.sort(function (a, b) {
        return (b.lastActive ? Date.parse(b.lastActive) || 0 : 0) - (a.lastActive ? Date.parse(a.lastActive) || 0 : 0);
      });
    }
    return r;
  }

  function _renderRoster(root) {
    if (!_all.length) {
      var code = CoachingState.get('coachingId') || '';
      root.innerHTML = '<div class="view-pad"><div class="empty-state"><div class="empty-state-icon">👥</div>' +
        '<div class="empty-state-text">No students yet</div>' +
        '<div class="empty-state-hint">Share your coaching code <strong>' + U.escapeHtml(code) + '</strong> so students can join.</div></div></div>';
      return;
    }

    function pill(active, key, label) {
      return '<button class="' + (key === _sort ? 'active' : '') + '" onclick="StudentsView.setSort(\'' + key + '\')">' + label + '</button>';
    }
    var rows = _sorted(_all.filter(_matches));

    var html = '<div class="view-pad">';
    html += '<input type="search" id="stuSearch" class="auth-input mb-md" placeholder="Search by name or email" aria-label="Search students" value="' + U.escapeHtml(_text) + '" />';
    html += '<div class="seg mb-md">' + pill(1, 'recent', 'Recent') + pill(1, 'speed', '⚡ Fastest') + pill(1, 'accuracy', '🎯 Accuracy') + '</div>';

    if (!rows.length) {
      html += '<div class="empty-state"><div class="empty-state-text">No students match “' + U.escapeHtml(_text) + '”.</div></div>';
    } else {
      html += rows.map(function (s) {
        var name = s.name || s.uid;
        var speedTxt = (s.speed && s.speed !== 999) ? ('⚡ ' + s.speed.toFixed(1) + 's') : '⚡ —';
        var accTxt = '🎯 ' + (s.accuracy || 0) + '%';
        return '<div class="list-row" role="button" tabindex="0" onclick="StudentsView.showProfile(\'' + U.escapeHtml(s.uid) + '\')" ' +
          'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();StudentsView.showProfile(\'' + U.escapeHtml(s.uid) + '\');}" ' +
          'aria-label="Open ' + U.escapeHtml(name) + '">' +
          '<div class="list-row-main">' +
            '<div class="list-row-title">' + U.escapeHtml(name) + ' ' + U.getSubscriptionBadge(s.plan, s.isTrial) + '</div>' +
            '<div class="list-row-sub">' + speedTxt + ' · ' + accTxt + ' · ' + U.escapeHtml(U.getRelativeTime(s.lastActive)) + '</div>' +
          '</div>' +
          '<span class="more-chevron">›</span>' +
        '</div>';
      }).join('');
      if (_cursor) {
        html += '<button class="btn btn-outline btn-full mt-md" id="stuMore" onclick="StudentsView.loadMore()">Load more</button>';
      }
    }
    html += '</div>';
    root.innerHTML = html;

    var search = document.getElementById('stuSearch');
    if (search) {
      search.addEventListener('input', function (e) {
        var caret = e.target.selectionStart;   // preserve caret so mid-string editing works on mobile (was: jump-to-end)
        _text = e.target.value;
        _renderRoster(root);
        var s2 = document.getElementById('stuSearch');
        if (s2) { s2.focus(); try { s2.setSelectionRange(caret, caret); } catch (_) { /* unsupported input type */ } }
      });
    }
  }

  function setSort(key) {
    _sort = key;
    var root = document.getElementById('view-students');
    if (root) _renderRoster(root);
  }

  function loadMore() {
    var btn = document.getElementById('stuMore');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    CoachingAPI.getStudentsPaginated(_cursor).then(function (data) {
      _all = _all.concat((data && data.students) || []);
      _cursor = (data && data.nextCursor) || null;
      var root = document.getElementById('view-students');
      if (root) _renderRoster(root);
    }).catch(function () { if (btn) { btn.disabled = false; btn.textContent = 'Load more'; } });
  }

  /* Full-screen push detail (Student-360) rendered into the same view, with a back affordance. */
  function showProfile(uid) {
    var root = document.getElementById('view-students');
    if (!root) return;
    root.scrollTop = 0;
    root.innerHTML = '<div class="view-pad"><button class="btn btn-sm btn-outline mb-md" onclick="StudentsView.render()">‹ Back</button>' + U.skeletonCard(4) + '</div>';
    CoachingAPI.getStudentDetails(uid).then(function (data) {
      root.innerHTML = '<div class="view-pad">' +
        '<button class="btn btn-sm btn-outline mb-md" onclick="StudentsView.render()">‹ Back to roster</button>' +
        StudentProfileView.buildProfileHtml(data) + '</div>';
    }).catch(function (err) {
      root.innerHTML = '<div class="view-pad"><button class="btn btn-sm btn-outline mb-md" onclick="StudentsView.render()">‹ Back</button>' +
        '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="StudentsView.showProfile(\'' + U.escapeHtml(uid) + '\')">Retry</button></div></div>';
    });
  }

  return { render: render, setSort: setSort, loadMore: loadMore, showProfile: showProfile };
})();
