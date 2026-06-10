/**
 * coachings.js — Coaching CRM View
 */
var CoachingsView = (function () {
  'use strict';

  var _container;

  function render() {
    _container = document.getElementById('view-coachings');
    if (!_container) return;
    
    _container.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div>' +
          '<h2 class="view-title">Coaching CRM</h2>' +
          '<p class="view-subtitle">Manage coaching institutes and their student allocations</p>' +
        '</div>' +
        '<button class="btn btn-sm accent" id="btnCreateCoaching">+ New Coaching</button>' +
      '</div>' +
      '<div id="coachingsTableContainer"><div class="loading">Loading coachings...</div></div>';

    document.getElementById('btnCreateCoaching').addEventListener('click', _showCreateModal);
    _loadData();
  }

  async function _loadData() {
    try {
      var res = await API.getCoachings();
      var coachings = Array.isArray(res) ? res : (res.coachings || []);
      _renderTable(coachings);
    } catch (e) {
      console.error('[Coachings] Load error:', e);
      var tc = document.getElementById('coachingsTableContainer');
      if (tc) tc.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load coachings: ' + AdminUtils.getReadableError(e) + '</div></div>';
    }
  }

  function _renderTable(coachings) {
    var tc = document.getElementById('coachingsTableContainer');
    if (!tc) return;

    if (coachings.length === 0) {
      tc.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-text">No coaching institutes created yet.</div></div>';
      return;
    }

    var html = '<div class="table-wrap"><table class="data-table">';
    html += '<thead><tr>' +
      '<th>Coaching ID / Token</th>' +
      '<th>Name</th>' +
      '<th>Status</th>' +
      '<th>Plan</th>' +
      '<th>Students</th>' +
      '<th>Premium</th>' +
      '<th>Owner</th>' +
      '<th>Actions</th>' +
    '</tr></thead><tbody>';

    coachings.forEach(function(c) {
      var isSuspended = c.status === 'suspended';
      var isDeleted = c.status === 'deleted';
      var statusBadge = '';
      if (isDeleted) statusBadge = '<span class="badge" style="background:#fef2f2;color:#dc2626;">Deleted</span>';
      else if (isSuspended) statusBadge = '<span class="badge badge-draft">Suspended</span>';
      else statusBadge = '<span class="badge badge-active">Active</span>';
      
      var actions = '';
      if (!isDeleted) {
        if (isSuspended) {
          actions = '<button class="btn btn-sm btn-outline" onclick="CoachingsView.mutate(\'' + AdminUtils.escapeHtml(c.id || c.coachingId) + '\', \'activate\')">Activate</button>';
        } else {
          actions = '<button class="btn btn-sm btn-outline" style="color:#ef4444; border-color:#ef4444;" onclick="CoachingsView.mutate(\'' + AdminUtils.escapeHtml(c.id || c.coachingId) + '\', \'suspend\')">Suspend</button>';
        }
      }

      html += '<tr>' +
        '<td><code>' + AdminUtils.escapeHtml(c.id || c.coachingId) + '</code>' + (c.registrationToken && !c.adminUid ? '<br><small style="color:#666;">Token: ' + c.registrationToken + '</small>' : '') + '</td>' +
        '<td><strong>' + AdminUtils.escapeHtml(c.name) + '</strong></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + AdminUtils.escapeHtml(c.entitlementPlan || 'standard') + '</td>' +
        '<td>' + (c.studentCount != null ? c.studentCount : (c.studentsCount || 0)) + '</td>' +
        '<td>' + (c.activePremiumUsers || 0) + ' / ' + (c.activePremiumPlusUsers || 0) + '</td>' +
        '<td>' + AdminUtils.escapeHtml(c.ownerEmail || '—') + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    tc.innerHTML = html;
  }

  function _showCreateModal() {
    var body = document.createElement('div');
    body.innerHTML =
      '<div class="modal-field"><label class="modal-label">Coaching Name</label>' +
        '<input type="text" id="coachingName" class="modal-input" placeholder="e.g. Allen Academy" /></div>' +
      '<div class="modal-field"><label class="modal-label">Owner Email (Optional)</label>' +
        '<input type="email" id="coachingEmail" class="modal-input" placeholder="admin@allen.in" /></div>' +
      '<div class="modal-field"><label class="modal-label">Capacity (Optional)</label>' +
        '<input type="number" id="coachingCapacity" class="modal-input" placeholder="Leave blank for unlimited" /></div>';

    Modal.show({
      title: 'Create New Coaching',
      body: body,
      actions: [
        { label: 'Cancel' },
        { label: 'Create Coaching', accent: true, onClick: _handleCreate, autoClose: false }
      ]
    });
  }

  async function _handleCreate(btn) {
    var name = document.getElementById('coachingName').value.trim();
    var capacity = document.getElementById('coachingCapacity').value.trim();
    var email = document.getElementById('coachingEmail').value.trim();

    if (!name) {
      Toast.error('Name is required.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      var payload = { name: name };
      if (capacity) payload.capacity = parseInt(capacity, 10);
      if (email) payload.ownerEmail = email;
      
      var res = await API.createCoaching(payload);
      Modal.close();
      Toast.success('Coaching created successfully: ' + (res.coachingId || 'OK'));
      _loadData();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Create Coaching';
      Toast.error('Failed to create coaching: ' + AdminUtils.getReadableError(e));
    }
  }

  async function mutate(coachingId, action) {
    if (!confirm('Are you sure you want to ' + action + ' this coaching?')) return;
    try {
      await API.mutateCoaching(coachingId, action);
      Toast.success('Successfully ' + action + 'd coaching.');
      _loadData();
    } catch (e) {
      Toast.error('Failed: ' + AdminUtils.getReadableError(e));
    }
  }

  return { render: render, mutate: mutate };
})();

