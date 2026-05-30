/**
 * students.js — Student List View
 *
 * Mobile card grid with search, sort pills, and student cards.
 * Tap card → opens student profile in bottom sheet.
 */
var StudentsView = (function () {
  'use strict';

  var _allStudents = [];
  var _currentSort = 'recent';
  var _searchQuery = '';

  function render(forceRefresh) {
    var container = document.getElementById('view-students');
    if (!container) return;

    if (!_allStudents.length || forceRefresh) {
      container.innerHTML = _buildShell() + CoachingUtils.skeletonCard(5);
    } else {
      container.innerHTML = _buildShell();
      _renderStudentList(container);
    }

    CoachingAPI.getStudents(forceRefresh).then(function (data) {
      _allStudents = data.students || [];
      container.innerHTML = _buildShell();
      _renderStudentList(container);
      _bindSearch();
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline mt-lg" onclick="StudentsView.render(true)">Try Again</button></div>';
    });
  }

  function _buildShell() {
    var html = '';

    /* Search Bar */
    html += '<div class="search-bar">';
    html += '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
    html += '<input type="text" id="studentSearchInput" class="search-input" placeholder="Search students..." value="' + CoachingUtils.escapeHtml(_searchQuery) + '" />';
    html += '</div>';

    /* Sort Pills */
    html += '<div class="tab-group">';
    html += _sortPill('recent', 'Recent');
    html += _sortPill('accuracy', 'Accuracy');
    html += _sortPill('speed', 'Speed');
    html += _sortPill('streak', 'Streak');
    html += _sortPill('questions', 'Questions');
    html += '</div>';

    html += '<div id="studentListContainer"></div>';
    return html;
  }

  function _sortPill(key, label) {
    var active = _currentSort === key ? ' active' : '';
    return '<button class="tab-pill' + active + '" onclick="StudentsView.setSort(\'' + key + '\')">' + label + '</button>';
  }

  function _renderStudentList(container) {
    var listEl = container.querySelector('#studentListContainer') || container;
    var students = _getFilteredAndSorted();

    if (students.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div>' +
        '<div class="empty-state-text">' + (_searchQuery ? 'No students match your search.' : 'No students in your coaching yet.') + '</div></div>';
      return;
    }

    var html = '<div style="font-size:var(--font-xs);color:var(--text-muted);margin-bottom:var(--space-md);">' + students.length + ' student' + (students.length !== 1 ? 's' : '') + '</div>';
    for (var i = 0; i < students.length; i++) {
      html += _studentCard(students[i]);
    }
    listEl.innerHTML = html;
  }

  function _studentCard(s) {
    var html = '<div class="student-card" onclick="StudentsView.showProfile(\'' + s.uid + '\')">';
    html += '<div class="student-avatar">' + CoachingUtils.getInitial(s.name || s.email) + '</div>';
    html += '<div class="student-info">';
    html += '<div class="student-name">' + CoachingUtils.escapeHtml(s.name || s.email || 'Unknown');
    html += CoachingUtils.getSubscriptionBadge(s.isPremium, s.isPremiumPlus);
    html += '</div>';
    html += '<div class="student-meta">';
    html += '<span>' + CoachingUtils.getRelativeTime(s.lastActive) + '</span>';
    if (s.email) html += '<span>' + CoachingUtils.escapeHtml(CoachingUtils.truncate(s.email, 20)) + '</span>';
    html += '</div>';
    html += '<div class="student-stats">';
    html += '<span class="stat-pill accuracy">🎯 ' + s.accuracy + '%</span>';
    if (s.speed && s.speed < 999) html += '<span class="stat-pill speed">⚡ ' + s.speed.toFixed(1) + 's</span>';
    if (s.streak > 0) html += '<span class="stat-pill streak">' + CoachingUtils.getStreakEmoji(s.streak) + ' ' + s.streak + 'd</span>';
    if (s.weakTopic) html += '<span class="stat-pill weak-topic">📉 ' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(s.weakTopic)) + '</span>';
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  function _getFilteredAndSorted() {
    var students = _allStudents.slice();

    /* Filter by search */
    if (_searchQuery) {
      var q = _searchQuery.toLowerCase();
      students = students.filter(function (s) {
        return (s.name && s.name.toLowerCase().indexOf(q) !== -1) ||
               (s.email && s.email.toLowerCase().indexOf(q) !== -1);
      });
    }

    /* Sort */
    switch (_currentSort) {
      case 'accuracy':
        students.sort(function (a, b) { return b.accuracy - a.accuracy; });
        break;
      case 'speed':
        students.sort(function (a, b) { return (a.speed || 999) - (b.speed || 999); });
        break;
      case 'streak':
        students.sort(function (a, b) { return (b.streak || 0) - (a.streak || 0); });
        break;
      case 'questions':
        students.sort(function (a, b) { return (b.totalAttempted || 0) - (a.totalAttempted || 0); });
        break;
      case 'recent':
      default:
        students.sort(function (a, b) {
          var aMs = a.lastActive ? Date.parse(a.lastActive) || 0 : 0;
          var bMs = b.lastActive ? Date.parse(b.lastActive) || 0 : 0;
          return bMs - aMs;
        });
    }

    return students;
  }

  function _bindSearch() {
    var input = document.getElementById('studentSearchInput');
    if (!input) return;
    input.addEventListener('input', function () {
      _searchQuery = input.value.trim();
      var container = document.getElementById('view-students');
      if (container) _renderStudentList(container);
    });
  }

  function setSort(sort) {
    _currentSort = sort;
    var container = document.getElementById('view-students');
    if (container) {
      container.innerHTML = _buildShell();
      _renderStudentList(container);
      _bindSearch();
    }
  }

  /**
   * Show student profile in bottom sheet.
   */
  function showProfile(uid) {
    BottomSheet.open('Student Profile', '<div style="text-align:center;padding:var(--space-2xl);"><div class="skeleton skeleton-card" style="height:200px;"></div></div>');

    CoachingAPI.getStudentDetails(uid).then(function (data) {
      BottomSheet.setContent(StudentProfileView.buildProfileHtml(data));
    }).catch(function (err) {
      BottomSheet.setContent('<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div></div>');
    });
  }

  return { render: render, setSort: setSort, showProfile: showProfile };
})();
