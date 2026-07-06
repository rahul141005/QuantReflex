/**
 * settings.js — SETTINGS CENTER (Super Admin, ADR-025).
 *
 * Admin-specific (not user-facing) settings, tabbed: Account (identity + change password/email via the
 * Firebase client SDK with reauth) · Security (login history, posture, log-out-everywhere via
 * system?action=revoke-tokens) · Appearance (theme) · Preferences (landing page / density / animations /
 * date format / timezone — persisted in the qrAdmin* localStorage namespace) · Platform (version, env,
 * Firestore project, function count, collection sizes) · Backup (authenticated CSV exports).
 */
var SettingsView = (function () {
  'use strict';

  var APP_VERSION = '2.16'; /* tracks the Bible version */

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _fmtT(v) { return AdminUtils.formatDateTime(v); }
  function _user() { try { return firebase.auth().currentUser; } catch (_) { return null; } }
  function _projectId() { try { return (firebase.apps[0] && firebase.apps[0].options && firebase.apps[0].options.projectId) || '—'; } catch (_) { return '—'; } }
  function _pref(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : v; } catch (_) { return def; } }
  function _setPref(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* ADR-102: the Update card appears ONLY when QRUpdateManager reports a pending update — nothing is
     shown otherwise. Identical flow/wording to the main app; native admin styling. */
  function _updateCard() {
    if (!(window.QRUpdateManager && QRUpdateManager.isUpdateAvailable())) return '';
    return '<div class="card" id="setUpdateCard" style="padding:1rem;margin-bottom:1rem;">' +
      _row('Update available', '(Refresh app to latest version)',
        '<button class="btn accent" id="setUpdateApp" type="button">🔄 Update App</button>') +
      '</div>';
  }
  function _wireUpdateBtn() {
    var b = document.getElementById('setUpdateApp'); if (!b) return;
    b.onclick = function () {
      b.disabled = true; b.textContent = '⏳ Updating app...';
      if (window.Toast) Toast.show('Updating app...');
      if (window.QRUpdateManager) QRUpdateManager.applyUpdate();
    };
  }
  /* Re-render if an update is detected while the Settings view is already open (live reveal). */
  function notifyUpdate() {
    var v = document.getElementById('view-settings');
    if (v && v.classList.contains('active')) render();
  }

  function render() {
    var c = document.getElementById('view-settings'); if (!c) return;
    c.innerHTML = '<div class="view-header"><h2 class="view-title">Settings</h2><p class="view-subtitle">Admin account, security, appearance, and platform.</p></div>' + _updateCard() + '<div id="setTabs"></div>';
    _wireUpdateBtn();
    Tabs.mount(document.getElementById('setTabs'), {
      tabs: [
        { id: 'account', label: 'Account', render: _tabAccount },
        { id: 'security', label: 'Security', render: _tabSecurity },
        { id: 'appearance', label: 'Appearance', render: _tabAppearance },
        { id: 'prefs', label: 'Preferences', render: _tabPrefs },
        { id: 'platform', label: 'Platform', render: _tabPlatform },
        { id: 'backup', label: 'Backup', render: _tabBackup }
      ]
    });
  }

  function _row(label, sub, control) {
    return '<div class="settings-row"><div><div class="settings-label">' + _esc(label) + '</div>' +
      (sub ? '<div class="settings-sub">' + _esc(sub) + '</div>' : '') + '</div><div>' + (control || '') + '</div></div>';
  }
  function _seg(id, opts, val) {
    return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button data-v="' + _esc(o[0]) + '" class="' + (o[0] === val ? 'active' : '') + '">' + _esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function _sel(id, opts, val) {
    return '<select class="modal-select" id="' + id + '" style="width:auto;min-width:190px;">' + opts.map(function (o) { return '<option value="' + _esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + _esc(o[1]) + '</option>'; }).join('') + '</select>';
  }
  function _wireSeg(id, onSet) {
    var el = document.getElementById(id); if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-v]') : null; if (!b) return;
      el.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      onSet(b.getAttribute('data-v'));
    });
  }

  /* ───────── Account ───────── */
  function _tabAccount(el) {
    var u = _user();
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _row('Email', null, '<code>' + _esc(u ? u.email : '—') + '</code>') +
      _row('User ID', null, '<code>' + _esc(u ? u.uid : '—') + '</code>') +
      _row('Role', 'Platform admin (admin:true claim)', '<span class="badge badge-active">Super Admin</span>') +
      _row('Change password', 'Re-authenticates, then updates your Firebase password', '<button class="btn btn-sm btn-outline" id="setPw">Change…</button>') +
      _row('Change email', 'Sends a verification link to the new address', '<button class="btn btn-sm btn-outline" id="setEmail">Change…</button>') +
      '</div><div id="setLastLogin" class="card" style="padding:1rem;"><div class="loading">Loading sign-in history…</div></div>';
    document.getElementById('setPw').onclick = _changePassword;
    document.getElementById('setEmail').onclick = _changeEmail;
    API.getSecurity().then(function (d) {
      var mine = ((d && d.events) || []).filter(function (e) { return e.type === 'admin_login'; }).slice(0, 5);
      var el2 = document.getElementById('setLastLogin'); if (!el2) return;
      el2.innerHTML = '<div class="cc-section-title">Recent admin sign-ins</div>' + (mine.length ? mine.map(function (e) { return '<div class="cc-feed-row"><span>' + _esc(e.app || 'admin') + (e.reason ? ' · ' + _esc(e.reason) : '') + '</span><span class="cc-feed-when">' + _esc(_fmtT(e.createdAt)) + '</span></div>'; }).join('') : '<div class="muted">No recorded sign-ins.</div>');
    }).catch(function () { var el2 = document.getElementById('setLastLogin'); if (el2) el2.innerHTML = '<div class="card" style="padding:1rem;"><div class="muted">Sign-in history unavailable.</div></div>'; });
  }

  function _changePassword() {
    var u = _user(); if (!u) { Toast.error('Not signed in'); return; }
    Modal.show({ title: 'Change password', body: '<label class="modal-label">Current password</label><input type="password" class="modal-input" id="cpCur" /><label class="modal-label">New password (≥6 chars)</label><input type="password" class="modal-input" id="cpNew" />', actions: [{ label: 'Cancel' }, { label: 'Update', accent: true, autoClose: false, onClick: function (btn) {
      var cur = (document.getElementById('cpCur') || {}).value || '', nw = (document.getElementById('cpNew') || {}).value || '';
      if (nw.length < 6) { Toast.error('New password must be ≥6 characters'); return; }
      btn.disabled = true;
      var cred = firebase.auth.EmailAuthProvider.credential(u.email, cur);
      u.reauthenticateWithCredential(cred).then(function () { return u.updatePassword(nw); }).then(function () { Toast.success('Password updated'); Modal.close(); }).catch(function (e) { btn.disabled = false; Toast.error(AdminUtils.getReadableError(e)); });
    } }] });
  }

  function _changeEmail() {
    var u = _user(); if (!u) { Toast.error('Not signed in'); return; }
    Modal.show({ title: 'Change sign-in email', body: '<label class="modal-label">Current password</label><input type="password" class="modal-input" id="ceCur" /><label class="modal-label">New email</label><input type="email" class="modal-input" id="ceNew" /><p class="text-sm text-secondary" style="margin-top:.5rem;">A verification link is sent to the new address; the change applies after you confirm it.</p>', actions: [{ label: 'Cancel' }, { label: 'Send verification', accent: true, autoClose: false, onClick: function (btn) {
      var cur = (document.getElementById('ceCur') || {}).value || '', nw = (document.getElementById('ceNew') || {}).value.trim() || '';
      if (!/.+@.+\..+/.test(nw)) { Toast.error('Enter a valid email'); return; }
      btn.disabled = true;
      var cred = firebase.auth.EmailAuthProvider.credential(u.email, cur);
      u.reauthenticateWithCredential(cred).then(function () { return u.verifyBeforeUpdateEmail ? u.verifyBeforeUpdateEmail(nw) : u.updateEmail(nw); }).then(function () { Toast.success('Verification sent to ' + nw); Modal.close(); }).catch(function (e) { btn.disabled = false; Toast.error(AdminUtils.getReadableError(e)); });
    } }] });
  }

  /* ───────── Security ───────── */
  function _tabSecurity(el) {
    el.innerHTML = '<div class="card" style="padding:1rem;"><div class="loading">Loading security posture…</div></div>';
    API.getSecurity().then(function (d) {
      var c = d.counts24 || {}, p = d.posture || {}, ev = (d.events || []).slice(0, 8);
      el.innerHTML = '<div class="card" style="padding:1rem;">' +
        _row('Failed logins (24h)', null, '<strong>' + (c.failed_login != null ? c.failed_login : '—') + '</strong>') +
        _row('Suspicious access (24h)', null, '<strong>' + (c.suspicious_access != null ? c.suspicious_access : '—') + '</strong>') +
        _row('Suspended accounts', null, '<strong>' + (p.suspendedUsers != null ? p.suspendedUsers : '—') + '</strong>') +
        _row('Log out all devices', 'Revokes every active session for your account', '<button class="btn btn-sm btn-danger" id="setRevoke">Log out everywhere</button>') +
        '</div><div class="card" style="padding:1rem;"><div class="cc-section-title">Recent security events</div>' +
        (ev.length ? ev.map(function (e) { return '<div class="cc-feed-row"><span><strong>' + _esc(e.type) + '</strong> ' + _esc(e.reason || '') + '</span><span class="cc-feed-when">' + _esc(_fmtT(e.createdAt)) + '</span></div>'; }).join('') : '<div class="muted">No events.</div>') + '</div>';
      document.getElementById('setRevoke').onclick = function () {
        Modal.show({ title: 'Log out all devices?', body: '<p class="text-sm text-secondary">This revokes every active session for your admin account. You will be signed out and must log in again.</p>', actions: [{ label: 'Cancel' }, { label: 'Log out everywhere', danger: true, autoClose: false, onClick: function () { API.revokeMyTokens().then(function () { Toast.success('Sessions revoked — signing out'); Modal.close(); setTimeout(function () { AdminAuth.logout(); }, 900); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); } }] });
      };
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  /* ───────── Appearance ───────── */
  function _tabAppearance(el) {
    var cur = (window.AdminTheme && window.AdminTheme.get && window.AdminTheme.get()) || 'system';
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _row('Theme', 'Light, dark, or follow your device', _seg('setTheme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], cur)) +
      '<div class="settings-sub" style="margin-top:.5rem;">Also toggleable from the sidebar footer. Saved on this device.</div></div>';
    _wireSeg('setTheme', function (v) { if (window.AdminTheme) window.AdminTheme.set(v); });
  }

  /* ───────── Preferences ───────── */
  function _tabPrefs(el) {
    var pages = [['command-center', 'Command Center'], ['users', 'Users'], ['coachings', 'Coachings'], ['revenue', 'Revenue'], ['ai', 'AI'], ['operations', 'Operations'], ['content', 'Content']];
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _row('Default landing page', 'Where the app opens after login', _sel('prefLanding', pages, _pref('qrAdminLanding', 'command-center'))) +
      _row('Table density', null, _seg('prefDensity', [['compact', 'Compact'], ['normal', 'Normal'], ['comfortable', 'Comfortable']], _pref('qrAdminDensity', 'normal'))) +
      _row('Animations', null, _seg('prefAnims', [['1', 'On'], ['0', 'Off']], _pref('qrAdminAnims', '1'))) +
      _row('Date format', null, _seg('prefDfmt', [['local', 'Local'], ['iso', 'ISO'], ['dmy', 'DD/MM/YYYY']], _pref('qrAdminDateFmt', 'local'))) +
      _row('Timezone', null, _sel('prefTz', [['local', 'Device local'], ['UTC', 'UTC'], ['Asia/Kolkata', 'IST (Asia/Kolkata)']], _pref('qrAdminTz', 'local'))) +
      '<div class="settings-sub" style="margin-top:.5rem;">Preferences are saved on this device. (No per-admin notification channel exists yet.)</div></div>';
    document.getElementById('prefLanding').onchange = function () { _setPref('qrAdminLanding', this.value); Toast.success('Saved'); };
    document.getElementById('prefTz').onchange = function () { _setPref('qrAdminTz', this.value); Toast.success('Saved — applies to dates shown next'); };
    _wireSeg('prefDensity', function (v) { _setPref('qrAdminDensity', v); document.body.classList.remove('density-compact', 'density-comfortable'); if (v !== 'normal') document.body.classList.add('density-' + v); });
    _wireSeg('prefAnims', function (v) { _setPref('qrAdminAnims', v); document.body.classList.toggle('no-anim', v === '0'); });
    _wireSeg('prefDfmt', function (v) { _setPref('qrAdminDateFmt', v); Toast.success('Saved'); });
  }

  /* ───────── Platform ───────── */
  function _tabPlatform(el) {
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _row('App version', null, '<code>' + _esc(APP_VERSION) + '</code>') +
      _row('Environment', null, '<span class="badge badge-draft">' + _esc(location.hostname) + '</span>') +
      _row('Firestore project', null, '<code>' + _esc(_projectId()) + '</code>') +
      _row('Serverless functions', 'Vercel Free cap (ADR-017)', '<strong>8 / 12</strong>') +
      _row('Admin host', null, '<code>' + _esc(location.host) + '</code>') +
      '</div><div id="setFs" class="card" style="padding:1rem;"><div class="loading">Loading collection sizes…</div></div>';
    API.getFirestoreOps().then(function (d) {
      var live = (d && d.live) || {}; var el2 = document.getElementById('setFs'); if (!el2) return;
      el2.innerHTML = '<div class="cc-section-title">Collection sizes</div>' + Object.keys(live).map(function (k) { return '<div class="cc-feed-row"><span class="muted">' + _esc(k) + '</span><span>' + (live[k] == null ? '—' : Number(live[k]).toLocaleString()) + '</span></div>'; }).join('');
    }).catch(function () { var el2 = document.getElementById('setFs'); if (el2) el2.innerHTML = '<div class="card" style="padding:1rem;"><div class="muted">Collection sizes unavailable.</div></div>'; });
  }

  /* ───────── Backup / Export ───────── */
  function _tabBackup(el) {
    var TYPES = [['users', 'All users'], ['premium', 'Premium users'], ['coachings', 'Coachings'], ['revenue', 'Revenue'], ['ai-usage', 'AI usage']];
    el.innerHTML = '<div class="card" style="padding:1rem;"><div class="cc-section-title">Data exports (authenticated CSV)</div><div class="cc-quick">' +
      TYPES.map(function (t) { return '<button class="btn btn-sm btn-outline" data-exp="' + t[0] + '">' + _esc(t[1]) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card" style="padding:1rem;"><div class="cc-section-title">Audit &amp; activity</div><button class="btn btn-sm btn-outline" id="setAudit">Open audit feed</button>' +
      '<div class="settings-sub" style="margin-top:.5rem;">The immutable audit trail lives in Operations → Audit.</div></div>';
    el.querySelectorAll('[data-exp]').forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-exp'); b.disabled = true; API.exportData(t).then(function (r) { AdminUtils.downloadCsv(r.filename, r.csv); b.disabled = false; if (r.truncated) Toast.error('Export truncated to ' + r.rowCount + ' rows'); else Toast.success('Exported ' + (r.rowCount || 0) + ' rows'); }).catch(function (e) { b.disabled = false; Toast.error(AdminUtils.getReadableError(e)); }); }; });
    document.getElementById('setAudit').onclick = function () { window.location.hash = '#operations'; };
  }

  return { render: render, notifyUpdate: notifyUpdate };
})();
