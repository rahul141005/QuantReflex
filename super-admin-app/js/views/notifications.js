/**
 * notifications.js — Notification System Operations View
 */
var NotificationsView = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('view-notifications');
    if (!container) return;
    
    container.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">Push Notifications</h2>' +
        '<p class="view-subtitle">Broadcast messages and manage FCM tokens</p>' +
      '</div>' +
      '<div class="card" style="max-width: 600px; margin-bottom: 2rem;">' +
        '<h3>New Broadcast</h3>' +
        '<div class="form-group" style="margin-bottom:1rem;">' +
          '<label>Target Segment</label>' +
          '<select id="notifSegment" class="form-control" style="width:100%; padding:0.5rem;" onchange="NotificationsView.toggleCoachingInput()">' +
            '<option value="all">All Users (with tokens)</option>' +
            '<option value="premium">Premium / Premium+ Only</option>' +
            '<option value="coaching">Specific Coaching Institute</option>' +
          '</select>' +
        '</div>' +
        '<div id="notifCoachingWrap" class="form-group" style="margin-bottom:1rem; display:none;">' +
          '<label>Coaching ID</label>' +
          '<input type="text" id="notifCoachingId" class="form-control" style="width:100%; padding:0.5rem;" placeholder="e.g. QR_XYZ_123" />' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:1rem;">' +
          '<label>Title</label>' +
          '<input type="text" id="notifTitle" class="form-control" style="width:100%; padding:0.5rem;" placeholder="Notification Title" />' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:1rem;">' +
          '<label>Message Body</label>' +
          '<textarea id="notifBody" class="form-control" style="width:100%; padding:0.5rem; height:80px;" placeholder="Message content..."></textarea>' +
        '</div>' +
        '<button id="notifSendBtn" class="btn accent" onclick="NotificationsView.sendBroadcast()">Send Broadcast</button>' +
      '</div>';
  }

  function toggleCoachingInput() {
    var seg = document.getElementById('notifSegment').value;
    var wrap = document.getElementById('notifCoachingWrap');
    if (wrap) wrap.style.display = (seg === 'coaching') ? 'block' : 'none';
  }

  function sendBroadcast() {
    var segment = document.getElementById('notifSegment').value;
    var coachingId = document.getElementById('notifCoachingId') ? document.getElementById('notifCoachingId').value.trim() : '';
    var title = document.getElementById('notifTitle').value.trim();
    var body = document.getElementById('notifBody').value.trim();

    if (!title || !body) {
      Toast.show('Title and body are required', 'error');
      return;
    }
    
    if (segment === 'coaching' && !coachingId) {
      Toast.show('Please enter a Coaching ID', 'error');
      return;
    }

    // Dry Run Confirmation
    var confirmMsg = 'Are you sure you want to broadcast this to ' + segment + ' users?';
    if (!confirm(confirmMsg)) return;

    var btn = document.getElementById('notifSendBtn');
    if (btn) { btn.disabled = true; btn.innerText = 'Sending...'; }

    var payload = { segment: segment, title: title, body: body };
    if (segment === 'coaching') payload.coachingId = coachingId;

    API.sendBroadcast(payload).then(function(res) {
      Toast.show('Sent to ' + res.sent + ' devices. Failed: ' + res.failed + '. Cleaned: ' + res.cleaned, 'success');
      document.getElementById('notifTitle').value = '';
      document.getElementById('notifBody').value = '';
    }).catch(function(err) {
      Toast.show('Broadcast failed: ' + err.message, 'error');
    }).finally(function() {
      if (btn) { btn.disabled = false; btn.innerText = 'Send Broadcast'; }
    });
  }

  return { render: render, toggleCoachingInput: toggleCoachingInput, sendBroadcast: sendBroadcast };
})();
