/**
 * users.js — Grouped User & Coaching Management View
 */
var UsersView = (function () {
  'use strict';

  /**
   * Delegate to centralized AdminUtils for timestamp conversion.
   */
  function _toMillis(ts) {
    return AdminUtils.toMillis(ts);
  }

  var _allUsers = [];
  var _coachings = [];

  function render() {
    var container = document.getElementById('view-users');
    container.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div>' +
          '<h2 class="view-title">Ecosystem Users</h2>' +
          '<p class="view-subtitle">Manage organization and individual entitlements</p>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem;">' +
          '<button class="btn btn-sm btn-outline" id="uRefreshBtn">Refresh</button>' +
          '<button class="btn btn-sm accent" id="uAddCoachingBtn">+ New Coaching</button>' +
        '</div>' +
      '</div>' +
      '<div id="usersContainerArea"><div class="loading">Loading ecosystem...</div></div>';

    document.getElementById('uRefreshBtn').onclick = _loadData;
    document.getElementById('uAddCoachingBtn').onclick = _showAddCoachingModal;
    _loadData();
  }

  var _nextCursor = null;

  async function _loadData(loadMore = false) {
    var area = document.getElementById('usersContainerArea');
    var loadBtn = document.getElementById('uLoadMoreBtn');
    
    if (!loadMore) {
      if (!area) return;
      area.innerHTML = '<div class="loading">Loading ecosystem...</div>';
      _allUsers = [];
      _nextCursor = null;
    } else if (loadBtn) {
      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading...';
    }

    try {
      // Coachings are fetched only on initial load or full refresh
      let coachingsPromise = (!loadMore || _coachings.length === 0) ? API.getCoachings() : Promise.resolve({ coachings: _coachings });
      
      const [usersRes, coachingsRes] = await Promise.all([
        API.getUsers(loadMore ? _nextCursor : null),
        coachingsPromise
      ]);

      // API might return data in 'data' (new API) or 'users' (old API)
      var fetchedUsers = usersRes.data || usersRes.users || [];
      _allUsers = _allUsers.concat(fetchedUsers);
      _nextCursor = usersRes.nextCursor || null;
      
      if (!loadMore || _coachings.length === 0) {
        // Coachings API might return array or object with coachings field
        _coachings = Array.isArray(coachingsRes) ? coachingsRes : (coachingsRes.coachings || []);
      }
      
      AdminState.set({ usersCache: _allUsers, coachingsCache: _coachings });
      _renderGroups();
    } catch (e) {
      if (!loadMore) {
        area.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error: ' + e.message + '</div></div>';
      } else if (loadBtn) {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Failed to load. Try again.';
      }
    }
  }

  function _renderGroups() {
    var area = document.getElementById('usersContainerArea');
    if (!area) return;

    var html = '';

    // Render Coaching Groups
    _coachings.forEach(function (coaching) {
      var groupUsers = _allUsers.filter(u => u.coachingId === coaching.coachingId);
      html += _buildGroupHTML(
        coaching.name + ' — ' + coaching.coachingId, 
        groupUsers, 
        'bulk', 
        coaching.coachingId
      );
    });

    // Render Independent Users
    var independentUsers = _allUsers.filter(u => !u.coachingId);
    if (independentUsers.length > 0 || _coachings.length === 0) {
      html += _buildGroupHTML('Independent / Unaffiliated Users', independentUsers, 'individual', null);
    }

    if (_nextCursor) {
      html += '<div style="text-align: center; margin-top: 1.5rem; margin-bottom: 2rem;">' +
        '<button id="uLoadMoreBtn" class="btn btn-outline" style="width: auto;">Load More Users</button>' +
      '</div>';
    }

    area.innerHTML = html;

    var loadBtn = document.getElementById('uLoadMoreBtn');
    if (loadBtn) {
      loadBtn.onclick = function() { _loadData(true); };
    }
  }

  function _buildGroupHTML(title, users, type, targetId) {
    var html = '<div class="coaching-group card" style="margin-bottom: 1.5rem; padding:0; overflow: hidden;">';
    
    // Header
    html += '<div class="group-header" style="padding: 1.25rem; border-bottom: 1px solid rgba(226,232,240,.6); display: flex; justify-content: space-between; align-items: center; background: #f8fafc; flex-wrap: wrap; gap: 1rem;">';
    html += '<div style="font-weight: 700; font-size: 1.0625rem; color: #0f172a; display: flex; align-items: center; gap: .5rem; word-break: break-word;">' + _escapeHtml(title) + ' <span class="badge badge-free">' + users.length + ' students</span></div>';
    
    if (type === 'bulk' && targetId) {
      html += '<button class="btn btn-sm accent" style="width: auto;" onclick="UsersView.showBulkActions(\'' + targetId + '\')">Bulk Actions ⚡</button>';
    }
    html += '</div>';

    // Users List
    html += '<div class="group-content" style="padding: 1rem; display: flex; flex-direction: column; gap: 1rem;">';
    if (users.length === 0) {
      html += '<div class="empty-state" style="padding: 1.5rem 1rem;"><div class="empty-state-text">No students in this group.</div></div>';
    } else {
      users.forEach(function (u) {
        var name = u.username || u.displayName || 'Unknown';
        var email = u.email || 'No email';
        var isPrem = u.isPremiumPlus || u.isPremium;
        var badgeHTML = '';
        var stateType = 'free';
        
        if (u.isPremiumPlus && u.premiumPlusExpiry && _toMillis(u.premiumPlusExpiry) > Date.now()) {
          badgeHTML = '<span class="badge badge-premium-plus">Premium+</span>';
          stateType = 'plus';
        } else if (u.isPremium) {
          badgeHTML = '<span class="badge badge-premium">Premium</span>';
          stateType = 'premium';
        } else if (u.isTrial && u.trialEnd && _toMillis(u.trialEnd) > Date.now()) {
          badgeHTML = '<span class="badge badge-draft">Trial</span>';
          stateType = 'trial';
        } else {
          badgeHTML = '<span class="badge badge-free">Free</span>';
          stateType = 'free';
        }

        var actionLabel = stateType === 'free' ? 'Grant Access' : 'Modify Access';
        var actionAccent = stateType === 'free' ? 'accent' : 'btn-outline';

        html += '<div style="border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1rem; background: var(--bg-surface); cursor: pointer; transition: all var(--transition-fast);" onclick="UserDrawer.open(\'' + u.uid + '\')">';
        html += '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; flex-wrap: wrap;">';
        html += '<div style="flex: 1; min-width: 150px;">';
        html += '<div style="font-weight: 600; font-size: .9375rem; color: var(--text-primary); word-break: break-word; overflow-wrap: anywhere; line-height: 1.2; margin-bottom: .25rem;">' + _escapeHtml(name) + '</div>';
        html += '<div style="font-size: .8125rem; color: var(--text-secondary); word-break: break-word; overflow-wrap: anywhere;">' + _escapeHtml(email) + '</div>';
        html += '</div>';
        html += '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: .25rem;">';
        html += badgeHTML;
        html += '<div style="font-size: .6875rem; color: #94a3b8; margin-top: .25rem;">View 360 Details &rarr;</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>'; // End Card
      });
    }
    html += '</div></div>';

    return html;
  }

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  function _showAddCoachingModal() {
    var body = document.createElement('div');
    body.innerHTML =
      '<div class="modal-field"><label class="modal-label">Coaching ID (e.g., IMS_NAGPUR_01)</label>' +
        '<input type="text" class="modal-input" id="cIdInput" placeholder="Must be unique, no spaces" style="text-transform: uppercase;" /></div>' +
      '<div class="modal-field"><label class="modal-label">Coaching Name</label>' +
        '<input type="text" class="modal-input" id="cNameInput" placeholder="e.g. IMS Nagpur" /></div>';

    Modal.show({
      title: 'Create Coaching Institute',
      body: body,
      actions: [
        { label: 'Cancel' },
        { label: 'Create', accent: true, onClick: _createCoaching, autoClose: false }
      ]
    });
  }

  function _showIndividualActions(uid, stateType, name) {
    var body = document.createElement('div');
    
    var trialHtml = 
      '<div style="display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem;">' +
        '<input type="number" id="trialDays_' + uid + '" class="modal-input" style="width:80px; margin:0;" value="7" min="1" max="365" />' +
        '<span style="font-size:.875rem; color:var(--text-secondary);">Days Trial</span>' +
      '</div>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem;" onclick="UsersView.confirmEnt(\'individual\', \'trial\', \'' + uid + '\');">Grant Trial</button>';

    var premiumHtml = 
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem;" onclick="UsersView.confirmEnt(\'individual\', \'premium\', \'' + uid + '\');">Grant Premium (Lifetime)</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem; color:var(--accent-primary); border-color:#bfdbfe;" onclick="UsersView.confirmEnt(\'individual\', \'premium_plus_6m\', \'' + uid + '\');">Grant Premium+ (6 Months)</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem; color:var(--accent-primary); border-color:#bfdbfe;" onclick="UsersView.confirmEnt(\'individual\', \'premium_plus_1y\', \'' + uid + '\');">Grant Premium+ (1 Year)</button>';

    var revokeHtml = '';
    if (stateType !== 'free') {
      revokeHtml = 
        '<hr style="border:0; border-top:1px dashed var(--border-color); margin:1rem 0;" />' +
        '<button class="btn btn-danger" style="width:100%;" onclick="UsersView.confirmEnt(\'individual\', \'revoke\', \'' + uid + '\');">Revoke All Access</button>';
    }

    body.innerHTML = 
      '<p class="text-secondary text-sm" style="margin-bottom: 1.5rem;">Select an action for <strong>' + name + '</strong>.</p>' +
      trialHtml + premiumHtml + revokeHtml;
    
    Modal.show({
      title: 'Manage Access',
      body: body,
      actions: [ { label: 'Cancel' } ]
    });
  }

  function _showBulkActions(targetId) {
    var body = document.createElement('div');
    body.innerHTML = 
      '<p class="text-secondary text-sm" style="margin-bottom: 1.5rem;">Select an action to apply to all students within coaching group <strong>' + _escapeHtml(targetId) + '</strong>.</p>' +
      '<div style="display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem;">' +
        '<input type="number" id="trialDays_' + targetId + '" class="modal-input" style="width:80px; margin:0;" value="7" min="1" max="365" />' +
        '<span style="font-size:.875rem; color:var(--text-secondary);">Days Trial</span>' +
      '</div>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem;" onclick="UsersView.confirmEnt(\'bulk\', \'trial\', \'' + targetId + '\');">Grant Trial</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem;" onclick="UsersView.confirmEnt(\'bulk\', \'premium\', \'' + targetId + '\');">Grant Premium (Lifetime)</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem; color:var(--accent-primary); border-color:#bfdbfe;" onclick="UsersView.confirmEnt(\'bulk\', \'premium_plus_6m\', \'' + targetId + '\');">Grant Premium+ (6 Months)</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:.75rem; color:var(--accent-primary); border-color:#bfdbfe;" onclick="UsersView.confirmEnt(\'bulk\', \'premium_plus_1y\', \'' + targetId + '\');">Grant Premium+ (1 Year)</button>' +
      '<hr style="border:0; border-top:1px dashed var(--border-color); margin:1rem 0;" />' +
      '<button class="btn btn-danger" style="width:100%;" onclick="UsersView.confirmEnt(\'bulk\', \'revoke\', \'' + targetId + '\');">Revoke All Access</button>';
    
    Modal.show({
      title: 'Bulk Actions',
      body: body,
      actions: [ { label: 'Cancel' } ]
    });
  }

  async function _createCoaching() {
    var cId = document.getElementById('cIdInput').value.trim().toUpperCase().replace(/\s+/g, '_');
    var cName = document.getElementById('cNameInput').value.trim();

    if (!cId || !cName) {
      Toast.error('Both fields are required.');
      return;
    }

    try {
      await API.createCoaching(cId, cName);
      Toast.success('Coaching created successfully.');
      Modal.close();
      _loadData();
    } catch (e) {
      Toast.error('Failed: ' + e.message);
    }
  }

  function _confirmEntitlement(type, action, targetId) {
    var trialDays = 7;
    if (action === 'trial') {
      var inputEl = document.getElementById('trialDays_' + targetId);
      if (inputEl) {
        trialDays = parseInt(inputEl.value, 10) || 7;
      }
    }

    var actionLabels = {
      'trial': trialDays + '-Day Trial',
      'premium': 'Lifetime Premium',
      'premium_plus_6m': 'Premium+ (6 Months)',
      'premium_plus_1y': 'Premium+ (1 Year)',
      'revoke': 'Revoke All Access'
    };

    var msg = 'Are you sure you want to ' + (action === 'revoke' ? 'apply' : 'grant') + ' ' + actionLabels[action] + ' for ' + (type === 'bulk' ? 'all users in ' + _escapeHtml(targetId) : 'this user') + '?';

    var body = document.createElement('div');
    body.innerHTML = '<p>' + msg + '</p>';

    Modal.show({
      title: 'Confirm Entitlement',
      body: body,
      actions: [
        { label: 'Cancel' },
        { 
          label: 'Confirm', 
          accent: action === 'revoke', 
          onClick: async function (btn) {
            btn.disabled = true;
            btn.textContent = 'Processing...';
            try {
              const res = await API.grantEntitlement(type, action, targetId, trialDays);
              Toast.success('Updated ' + res.updatedCount + ' user(s) successfully.');
              Modal.close();
              _loadData();
            } catch (e) {
              btn.disabled = false;
              btn.textContent = 'Confirm';
              Toast.error('Failed to update entitlements: ' + e.message);
            }
          }, 
          autoClose: false 
        }
      ]
    });
  }

  return { 
    render: render, 
    showBulkActions: _showBulkActions,
    showIndividualActions: _showIndividualActions,
    confirmEnt: _confirmEntitlement 
  };
})();

/**
 * UserDrawer - Handles the slide-out 360 User View
 */
var UserDrawer = (function () {
  'use strict';

  function open(uid) {
    var overlay = document.getElementById('userDrawerOverlay');
    var drawer = document.getElementById('userDrawer');
    var content = document.getElementById('userDrawerContent');
    
    if (!overlay || !drawer || !content) return;
    
    overlay.style.display = 'block';
    drawer.style.display = 'flex';
    // Small delay to allow display block to apply before transition
    setTimeout(function() {
      drawer.style.right = '0';
    }, 10);

    content.innerHTML = '<div class="loading">Loading 360 view...</div>';

    API.getUserDetails(uid).then(function(data) {
      if (data.error) throw new Error(data.error);
      _renderDetails(content, data);
    }).catch(function(err) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load: ' + err.message + '</div></div>';
    });
  }

  function close() {
    var overlay = document.getElementById('userDrawerOverlay');
    var drawer = document.getElementById('userDrawer');
    
    if (!overlay || !drawer) return;
    
    drawer.style.right = '-400px';
    setTimeout(function() {
      overlay.style.display = 'none';
      drawer.style.display = 'none';
    }, 300); // match CSS transition duration
  }

  function _renderDetails(container, data) {
    var p = data.profile || {};
    var html = '';
    
    var stateType = 'free';
    var badgeHTML = '<span class="badge badge-free">Free</span>';
    var now = Date.now();
    
    if (p.isPremiumPlus) {
      badgeHTML = '<span class="badge badge-premium-plus">Premium+</span>';
      stateType = 'plus';
    } else if (p.isPremium) {
      badgeHTML = '<span class="badge badge-premium">Premium</span>';
      stateType = 'premium';
    }

    // Profile Section
    html += '<div style="margin-bottom: 2rem;">';
    html += '<div style="font-weight: 700; font-size: 1.25rem; color: var(--text-primary); margin-bottom: 0.25rem;">' + escapeHtml(p.username) + '</div>';
    html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.75rem;">' + escapeHtml(p.email) + '</div>';
    html += '<div style="display:flex; align-items:center; gap: 0.5rem; flex-wrap:wrap; margin-bottom: 1rem;">';
    html += badgeHTML;
    if (p.coachingId) html += '<span class="badge badge-draft">Inst: ' + escapeHtml(p.coachingId) + '</span>';
    html += '</div>';
    html += '<div style="font-size: 0.8125rem; color: var(--text-secondary);">Joined: ' + (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Unknown') + '</div>';
    html += '</div>';

    // Quick Actions
    var actionLabel = stateType === 'free' ? 'Grant Access' : 'Modify Access';
    var actionAccent = stateType === 'free' ? 'accent' : 'btn-outline';
    html += '<div style="margin-bottom: 2rem; display:flex; gap: 0.5rem;">';
    html += '<button class="btn btn-sm ' + actionAccent + '" style="flex:1;" onclick="UsersView.showIndividualActions(\'' + p.uid + '\', \'' + stateType + '\', \'' + escapeHtml(p.username) + '\')">' + actionLabel + '</button>';
    html += '</div>';

    // AI Usage Section
    var ai = data.aiUsage || { tokens: 0, count: 0 };
    html += '<div class="card" style="margin-bottom: 1.5rem; padding: 1rem;">';
    html += '<div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">AI Usage</div>';
    html += '<div style="display: flex; justify-content: space-between; font-size: 0.875rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">';
    html += '<span>Total Tokens</span><strong>' + (ai.tokens || 0).toLocaleString() + '</strong></div>';
    html += '<div style="display: flex; justify-content: space-between; font-size: 0.875rem;">';
    html += '<span>Requests</span><strong>' + (ai.count || 0).toLocaleString() + '</strong></div>';
    html += '</div>';

    // Recent Duels
    html += '<div class="card" style="margin-bottom: 1.5rem; padding: 1rem;">';
    html += '<div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">Recent Duels</div>';
    if (!data.recentDuels || data.recentDuels.length === 0) {
      html += '<div class="text-secondary text-sm">No recent duels completed.</div>';
    } else {
      data.recentDuels.forEach(function(d) {
        var isWin = d.winner === p.uid;
        var isDraw = d.result === 'draw';
        var resultText = isDraw ? 'Draw' : (isWin ? 'Win' : 'Loss');
        var color = isDraw ? '#64748b' : (isWin ? '#10b981' : '#ef4444');
        
        html += '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">';
        html += '<span>' + new Date(d.createdAt).toLocaleDateString() + '</span>';
        html += '<strong style="color: ' + color + ';">' + resultText + '</strong>';
        html += '</div>';
      });
    }
    html += '</div>';

    // Entitlement History
    html += '<div class="card" style="margin-bottom: 1.5rem; padding: 1rem;">';
    html += '<div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">Entitlement History</div>';
    if (!data.entitlementLogs || data.entitlementLogs.length === 0) {
      html += '<div class="text-secondary text-sm">No entitlement changes recorded.</div>';
    } else {
      data.entitlementLogs.forEach(function(log) {
        html += '<div style="font-size: 0.8125rem; padding: 0.5rem 0; border-bottom: 1px dashed var(--border-color);">';
        html += '<div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">';
        html += '<strong>' + escapeHtml(log.action) + '</strong>';
        html += '<span style="color: var(--text-secondary);">' + (log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '') + '</span>';
        html += '</div>';
        if (log.adminUid) {
          html += '<div style="color: var(--text-secondary); font-size: 0.6875rem;">By: ' + escapeHtml(log.adminEmail || log.adminUid) + '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  return {
    open: open,
    close: close
  };
})();
