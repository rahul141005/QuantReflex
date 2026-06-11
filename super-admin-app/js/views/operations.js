/**
 * operations.js — Operations domain (Super Admin V2, ADR-019).
 *
 * A tabbed host that strangler-wraps the legacy ops views (System, Security, Firestore-Ops,
 * Notifications, Inactive/Cleanup, Exports). Each tab creates the legacy view's container on
 * demand inside the tab panel and calls its render() — so those views keep working unchanged
 * while the 7-domain IA is in place. Each will get a first-class rebuild in a later phase.
 */
var OperationsView = (function () {
  'use strict';

  var TABS = [
    { id: 'health',    label: 'Health',    view: 'SystemView',        cid: 'view-system' },
    { id: 'security',  label: 'Security',  view: 'SecurityView',      cid: 'view-security' },
    { id: 'data',      label: 'Firestore', view: 'FirestoreOpsView',  cid: 'view-firestore' },
    { id: 'campaigns', label: 'Campaigns', view: 'NotificationsView', cid: 'view-notifications' },
    { id: 'cleanup',   label: 'Cleanup',   view: 'InactiveView',      cid: 'view-inactive' },
    { id: 'exports',   label: 'Exports',   view: 'ExportsView',       cid: 'view-exports' }
  ];

  function render() {
    var c = document.getElementById('view-operations');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header"><h2 class="view-title">Operations</h2>' +
      '<p class="view-subtitle">Health · Security · Firestore · Campaigns · Cleanup · Exports</p></div>' +
      '<div id="opsTabs"></div>';
    Tabs.mount(document.getElementById('opsTabs'), {
      tabs: TABS.map(function (t) {
        return {
          id: t.id, label: t.label,
          render: function (panel) {
            panel.innerHTML = '<div id="' + t.cid + '" class="view active" style="display:block;"></div>';
            var V = window[t.view];
            if (V && typeof V.render === 'function') {
              try { V.render(); }
              catch (e) { panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + (e && e.message ? e.message : 'render failed') + '</div></div>'; }
            } else {
              panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + t.label + ' is unavailable.</div></div>';
            }
          }
        };
      })
    });
  }

  return { render: render };
})();
