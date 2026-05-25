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
      '<div class="view-header">' +
        '<h2 class="view-title">Coaching CRM</h2>' +
        '<p class="view-subtitle">Manage coaching institutes and their student allocations</p>' +
        '<div style="margin-top: 16px;">' +
          '<button class="btn accent" id="btnCreateCoaching">+ New Coaching</button>' +
        '</div>' +
      '</div>' +
      '<div class="content-card">' +
        '<div id="coachingsTableContainer">Loading coachings...</div>' +
      '</div>';

    document.getElementById('btnCreateCoaching').addEventListener('click', _showCreateModal);

    _loadData();
  }

  async function _loadData() {
    try {
      var coachings = await API.getCoachings();
      if (!Array.isArray(coachings)) coachings = [];
      _renderTable(coachings);
    } catch (e) {
      console.error('[Coachings] Load error:', e);
      var tc = document.getElementById('coachingsTableContainer');
      if (tc) tc.innerHTML = '<p class="error-text">Failed to load coachings: ' + e.message + '</p>';
    }
  }

  function _renderTable(coachings) {
    var tc = document.getElementById('coachingsTableContainer');
    if (!tc) return;

    if (coachings.length === 0) {
      tc.innerHTML = '<p>No coachings found.</p>';
      return;
    }

    var headers = ['Coaching ID', 'Name', 'Status', 'Plan', 'Students', 'Premium', 'Owner', 'Actions'];
    var rows = coachings.map(function(c) {
      var isSuspended = c.status === 'suspended';
      var isDeleted = c.status === 'deleted';
      var statusBadge = '';
      if (isDeleted) statusBadge = '<span class="badge badge-danger">Deleted</span>';
      else if (isSuspended) statusBadge = '<span class="badge badge-warning">Suspended</span>';
      else statusBadge = '<span class="badge badge-success">Active</span>';
      
      var actions = '';
      if (!isDeleted) {
        if (isSuspended) {
          actions = '<button class="btn btn-sm btn-outline" onclick="CoachingsView.mutate(\'' + c.id + '\', \'activate\')">Activate</button>';
        } else {
          actions = '<button class="btn btn-sm btn-outline" style="color:#ef4444; border-color:#ef4444;" onclick="CoachingsView.mutate(\'' + c.id + '\', \'suspend\')">Suspend</button>';
        }
      }

      return [
        '<code>' + c.id + '</code>',
        '<strong>' + c.name + '</strong>',
        statusBadge,
        c.entitlementPlan || 'standard',
        c.studentCount || 0,
        (c.activePremiumUsers || 0) + ' / ' + (c.activePremiumPlusUsers || 0),
        c.ownerEmail || '<span class="text-muted">None</span>',
        actions
      ];
    });

    tc.innerHTML = UITable.generate(headers, rows);
  }

  function _showCreateModal() {
    UIModal.show('Create New Coaching',
      '<div class="form-group">' +
        '<label>Coaching Name</label>' +
        '<input type="text" id="coachingName" class="form-control" placeholder="e.g. Allen Academy">' +
      '</div>' +
      '<div class="form-group" style="margin-top:12px;">' +
        '<label>Owner Email (Optional)</label>' +
        '<input type="email" id="coachingEmail" class="form-control" placeholder="admin@allen.in">' +
      '</div>' +
      '<div class="form-group" style="margin-top:12px;">' +
        '<label>Capacity (Optional)</label>' +
        '<input type="number" id="coachingCapacity" class="form-control" placeholder="Leave blank for unlimited">' +
      '</div>',
      [
        { text: 'Cancel', class: 'btn-outline', onClick: function() { UIModal.hide(); } },
        { text: 'Create Coaching', class: 'btn-accent', onClick: _handleCreate }
      ]
    );
  }

  async function _handleCreate() {
    var name = document.getElementById('coachingName').value.trim();
    var capacity = document.getElementById('coachingCapacity').value.trim();
    var email = document.getElementById('coachingEmail').value.trim();

    if (!name) {
      UIToast.show('Name is required.', 'error');
      return;
    }

    try {
      var payload = { name: name };
      if (capacity) payload.capacity = parseInt(capacity, 10);
      if (email) payload.ownerEmail = email;
      
      var res = await API.createCoaching(payload);
      UIModal.hide();
      UIToast.show('Coaching created successfully: ' + res.coachingId, 'success');
      _loadData();
    } catch (e) {
      UIToast.show('Failed to create coaching: ' + e.message, 'error');
    }
  }

  async function mutate(coachingId, action) {
    if (!confirm('Are you sure you want to ' + action + ' this coaching?')) return;
    try {
      var res = await API.mutateCoaching(coachingId, action);
      UIToast.show('Successfully ' + action + 'd coaching.', 'success');
      _loadData();
    } catch (e) {
      UIToast.show('Failed to mutate coaching: ' + e.message, 'error');
    }
  }

  return { render: render, mutate: mutate };
})();
