/**
 * refunds.js — REFUND REVIEW (Super Admin, ADR-143).
 *
 * The review half of the manual refund workflow. Without this screen the workflow is unreachable:
 * users can submit refund requests and nobody can ever action them, so they accumulate in `pending`
 * forever. (That was exactly the gap the certification audit found — the API shipped, the UI did not.)
 *
 *   User request → THIS SCREEN → provider refund → provider confirmation → canonical revocation
 *
 * WHAT APPROVING DOES, AND WHAT IT DOES NOT DO
 * Approving marks the request `approved` and changes NO entitlement. It is an instruction to a human:
 * go and issue the refund in the Razorpay dashboard / Play Console. The entitlement is revoked later,
 * once, when the provider's webhook confirms the money actually moved. The UI says this out loud
 * rather than implying the refund is done — the API returns `entitlementChanged:false` and a
 * `nextStep` string for precisely this purpose, and both are surfaced.
 *
 * THE TWO FIELDS A REVIEWER ACTUALLY DECIDES ON
 *  · `submittedWithinWindow` — was the request inside the 24-hour policy when the user pressed the
 *    button? Frozen at submit time, so a request reviewed tomorrow still shows what was true then.
 *  · `needsManualEligibilityReview` — the capture time could not be established (a pre-ADR-143 row).
 *    The policy deliberately refuses to guess, so these are badged and a human decides. They are
 *    neither auto-approved nor auto-denied.
 */
var RefundsView = (function () {
  'use strict';

  var _rows = [], _analytics = null, _statusFilter = 'pending', _selected = null, _busy = false;

  var STATUS_CHIPS = ['all', 'pending', 'approved', 'refunded', 'rejected', 'failed', 'cancelled'];
  var STATUS_LABELS = {
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
    refunded: 'Refunded', failed: 'Failed', cancelled: 'Cancelled'
  };
  /* Colour carries the same meaning as the state machine: amber = still owes someone an action,
     green = money actually moved, red = refused/failed, grey = closed without money moving. */
  var STATUS_COLOR = {
    pending: 'var(--warn-primary)', approved: 'var(--accent-primary)', refunded: 'var(--success-strong)',
    rejected: 'var(--danger-hover)', failed: 'var(--danger-hover)', cancelled: 'var(--text-muted)'
  };

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _inr(paise) { return (paise == null) ? '—' : '₹' + Math.round(paise / 100).toLocaleString('en-IN'); }
  function _when(ms) { return ms ? new Date(ms).toLocaleString() : '—'; }
  function _dur(ms) {
    if (!ms || ms <= 0) return '0h';
    var h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  /* ── render ────────────────────────────────────────────────────────────────────────────────── */

  function render(container) {
    container.innerHTML =
      '<div class="view-header"><h2>Refunds</h2>' +
        '<p class="muted">Refund requests are reviewed here. Approving authorises a refund — it does not issue one, and it does not change the user\'s entitlement.</p>' +
      '</div>' +
      '<div id="refTiles" class="stat-grid" style="margin-bottom:1rem;"></div>' +
      '<div id="refChips" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.9rem;"></div>' +
      '<div id="refList"><div class="loading">Loading refund requests…</div></div>' +
      '<div id="refDetail" style="margin-top:1rem;"></div>';

    _renderChips();
    _loadAnalytics();
    _load();
  }

  function _renderChips() {
    var el = document.getElementById('refChips');
    if (!el) return;
    el.innerHTML = STATUS_CHIPS.map(function (s) {
      var n = (s === 'all') ? '' : ((_analytics && _analytics.byStatus && _analytics.byStatus[s] != null) ? (' (' + _analytics.byStatus[s] + ')') : '');
      var active = (_statusFilter === s) ? ' btn-primary' : ' btn-outline';
      return '<button class="btn btn-sm' + active + '" data-status="' + _esc(s) + '">' +
        _esc(s === 'all' ? 'All' : (STATUS_LABELS[s] || s)) + n + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        _statusFilter = b.getAttribute('data-status');
        _selected = null;
        document.getElementById('refDetail').innerHTML = '';
        _renderChips(); _load();
      };
    });
  }

  function _loadAnalytics() {
    API.getRefundsAnalytics().then(function (a) {
      _analytics = a;
      var el = document.getElementById('refTiles');
      if (el) {
        el.innerHTML =
          AdminUtils.statTile('Awaiting action', (a.open || 0),
            ((a.byStatus && a.byStatus.pending) || 0) + ' pending review',
            ((a.open || 0) > 0 ? 'var(--warn-primary)' : 'var(--success-primary)')) +
          AdminUtils.statTile('Refunded', (a.byStatus && a.byStatus.refunded) || 0, 'provider confirmed', 'var(--success-strong)') +
          AdminUtils.statTile('Rejected', (a.byStatus && a.byStatus.rejected) || 0, 'entitlement unchanged', 'var(--text-muted)') +
          /* The badge that matters most: these cannot be decided by policy and need a human. */
          AdminUtils.statTile('Needs manual check', a.needsManualReview || 0, 'capture time unknown',
            ((a.needsManualReview || 0) > 0 ? 'var(--accent-ai)' : 'var(--text-muted)'));
      }
      _renderChips();
    }).catch(function () { /* tiles are informational — the queue still works without them */ });
  }

  function _load() {
    var list = document.getElementById('refList');
    if (list) list.innerHTML = '<div class="loading">Loading refund requests…</div>';
    API.getRefunds(_statusFilter, 100).then(function (res) {
      _rows = (res && res.requests) || [];
      _renderList();
    }).catch(function (e) {
      if (list) list.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>';
    });
  }

  function _renderList() {
    var el = document.getElementById('refList');
    if (!el) return;
    if (!_rows.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No ' +
        _esc(_statusFilter === 'all' ? '' : (STATUS_LABELS[_statusFilter] || _statusFilter).toLowerCase() + ' ') +
        'refund requests.</div></div>';
      return;
    }
    el.innerHTML = '<div class="card" style="padding:.25rem 1rem;">' + _rows.map(function (r) {
      /* Two badges carry the decision context at a glance, so a reviewer never has to open a row to
         learn whether it was inside policy. */
      var windowBadge = r.needsManualEligibilityReview
        ? '<span class="badge" style="background:var(--accent-ai);color:#fff;">capture time unknown</span>'
        : (r.submittedWithinWindow
            ? '<span class="badge" style="background:var(--success-strong);color:#fff;">within 24h</span>'
            : '<span class="badge" style="background:var(--danger-hover);color:#fff;">outside 24h</span>');
      return '<div class="cc-feed-row" style="cursor:pointer;" data-id="' + _esc(r.id) + '">' +
        '<span>' +
          '<span class="badge" style="background:' + (STATUS_COLOR[r.status] || 'var(--text-muted)') + ';color:#fff;">' +
            _esc(STATUS_LABELS[r.status] || r.status) + '</span> ' +
          windowBadge + ' ' +
          '<code>' + _esc(r.uid || '—') + '</code> · ' + _esc(r.plan || '—') + ' · ' + _inr(r.amountPaise) +
          (r.outOfBand ? ' <span class="muted">(out of band)</span>' : '') +
        '</span>' +
        '<span class="cc-feed-when">' + _esc(_when(r.createdAtMs)) + '</span>' +
      '</div>';
    }).join('') + '</div>';

    Array.prototype.forEach.call(el.querySelectorAll('[data-id]'), function (row) {
      row.onclick = function () { _openDetail(row.getAttribute('data-id')); };
    });
  }

  /* ── detail + decision ─────────────────────────────────────────────────────────────────────── */

  function _openDetail(id) {
    _selected = id;
    var el = document.getElementById('refDetail');
    el.innerHTML = '<div class="loading">Loading request…</div>';
    API.getRefundDetails(id).then(function (res) {
      var r = res.request || {}, p = res.payment || null, u = res.user || null;
      var hist = res.history || [];
      var canDecide = (r.status === 'pending');

      el.innerHTML = '<div class="card" style="padding:1rem;">' +
        '<div class="cc-section-title">Refund request <code>' + _esc(r.id) + '</code></div>' +

        /* Who + what they bought */
        '<div class="cc-feed-row"><span>User</span><span><code>' + _esc(r.uid || '—') + '</code>' +
          (u && u.email ? ' · ' + _esc(u.email) : '') + (u && u.name ? ' (' + _esc(u.name) + ')' : '') + '</span></div>' +
        '<div class="cc-feed-row"><span>Current entitlement</span><span>' +
          _esc((u && u.plan) || '—') + (u && u.planExpiry ? ' until ' + _esc(String(u.planExpiry).slice(0, 10)) : '') +
          (u && u.planSource ? ' · ' + _esc(u.planSource) : '') + '</span></div>' +
        '<div class="cc-feed-row"><span>Provider</span><span>' + _esc(r.provider || '—') + '</span></div>' +
        '<div class="cc-feed-row"><span>Payment / order</span><span><code>' + _esc(r.paymentId || '—') + '</code>' +
          (r.orderId ? ' / <code>' + _esc(r.orderId) + '</code>' : '') + '</span></div>' +
        '<div class="cc-feed-row"><span>Plan / amount</span><span>' + _esc(r.plan || '—') + ' · ' + _inr(r.amountPaise) + '</span></div>' +

        /* The eligibility evidence — frozen at submit, plus what the payment row itself says. */
        '<div class="cc-feed-row"><span>Purchase captured</span><span>' + _esc(_when(r.capturedAtMs)) +
          ' <span class="muted">(' + _esc(r.capturedAtSource || 'unknown') + ')</span></span></div>' +
        '<div class="cc-feed-row"><span>Requested</span><span>' + _esc(_when(r.createdAtMs)) + '</span></div>' +
        '<div class="cc-feed-row"><span>Within 24h policy when submitted</span><span>' +
          (r.needsManualEligibilityReview
            ? '<strong style="color:var(--accent-ai);">Cannot determine — capture time unknown, decide manually</strong>'
            : (r.submittedWithinWindow
                ? '<strong style="color:var(--success-strong);">Yes</strong>'
                : '<strong style="color:var(--danger-hover);">No</strong>')) + '</span></div>' +
        (r.msRemainingNow > 0
          ? '<div class="cc-feed-row"><span>Window remaining now</span><span>' + _esc(_dur(r.msRemainingNow)) + '</span></div>' : '') +

        (p ? '<div class="cc-feed-row"><span>Payment row</span><span>' + _esc(p.status || '—') +
            (p.refundWithinPolicy === false ? ' <span class="muted">(refunded outside policy)</span>' : '') + '</span></div>' : '') +

        '<div class="cc-feed-row"><span>User\'s reason</span><span>' + (_esc(r.reason || '') || '<span class="muted">— none given —</span>') + '</span></div>' +
        (r.decisionNote ? '<div class="cc-feed-row"><span>Decision note</span><span>' + _esc(r.decisionNote) + '</span></div>' : '') +
        (r.reviewedByEmail ? '<div class="cc-feed-row"><span>Reviewed by</span><span>' + _esc(r.reviewedByEmail) + ' · ' + _esc(_when(r.reviewedAtMs)) + '</span></div>' : '') +
        (r.providerRefundId ? '<div class="cc-feed-row"><span>Provider refund id</span><span><code>' + _esc(r.providerRefundId) + '</code></span></div>' : '') +

        /* Audit trail — every transition, who drove it, when. */
        '<div class="cc-section-title" style="margin-top:1rem;">History</div>' +
        (hist.length ? hist.map(function (h) {
          return '<div class="cc-feed-row"><span>' + _esc(h.from || 'created') + ' → <strong>' + _esc(h.to) + '</strong>' +
            ' <span class="muted">(' + _esc(h.actor || '—') + ')</span>' + (h.note ? ' — ' + _esc(h.note) : '') + '</span>' +
            '<span class="cc-feed-when">' + _esc(_when(h.atMs)) + '</span></div>';
        }).join('') : '<div class="muted">No history recorded.</div>') +

        /* Decision */
        (canDecide
          ? '<div class="cc-section-title" style="margin-top:1rem;">Decision</div>' +
            '<p class="muted" style="margin:.25rem 0 .6rem;">Approving records the decision and notifies the user. It does <strong>not</strong> issue the refund and does <strong>not</strong> change the entitlement — issue the refund in the provider dashboard, and Premium is revoked automatically when the provider confirms.</p>' +
            '<textarea id="refNote" class="form-input" rows="2" placeholder="Note (required when rejecting)"></textarea>' +
            '<div style="display:flex;gap:.5rem;margin-top:.6rem;">' +
              '<button class="btn btn-primary" id="refApprove">Approve</button>' +
              '<button class="btn btn-outline" id="refReject">Reject</button>' +
            '</div>'
          : '<p class="muted" style="margin-top:1rem;">This request is <strong>' + _esc(STATUS_LABELS[r.status] || r.status) + '</strong> — no further action is available here.</p>') +
      '</div>';

      if (canDecide) {
        document.getElementById('refApprove').onclick = function () { _decide(r.id, 'approve'); };
        document.getElementById('refReject').onclick = function () { _decide(r.id, 'reject'); };
      }
    }).catch(function (e) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>';
    });
  }

  function _decide(id, decision) {
    if (_busy) return;
    var noteEl = document.getElementById('refNote');
    var note = noteEl ? noteEl.value.trim() : '';
    /* Mirrors the server rule rather than duplicating policy: rejecting tells a paying customer no,
       so it must carry a reason for the audit trail and for the message they receive. The server
       enforces this too (NOTE_REQUIRED) — this is just a faster, kinder failure. */
    if (decision === 'reject' && !note) { Toast.error('A reason is required when rejecting a refund request.'); return; }
    if (!confirm(decision === 'approve'
      ? 'Approve this refund request?\n\nThis records the decision and notifies the user. It does NOT issue the refund and does NOT change their entitlement.'
      : 'Reject this refund request?\n\nThe entitlement stays exactly as it is and the user is notified.')) return;

    _busy = true;
    API.decideRefund(id, decision, note).then(function (res) {
      _busy = false;
      Toast.success((res && res.nextStep) ? res.nextStep : ('Refund request ' + decision + 'd.'));
      _loadAnalytics(); _load(); _openDetail(id);
    }).catch(function (e) {
      _busy = false;
      Toast.error(AdminUtils.getReadableError(e));
    });
  }

  return { render: render };
})();
