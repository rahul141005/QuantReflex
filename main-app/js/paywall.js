/**
 * paywall.js — Premium access control + paywall + Razorpay flow (v2)
 *
 * v2 monetization: a single Premium tier (₹349 / 6 months, ₹499 / 12 months).
 * Every gated feature resolves through `plan === 'premium'`. The legacy lifetime
 * and dual-tier products are gone. A trial is plan:'premium' with isTrial:true
 * (so it passes the same gate).
 */

(function (global) {
var RAZORPAY_LIVE_KEY = 'rzp_live_STanzIgCpSAfL7';

/* Pricing (display only — server is source of truth via PLAN_CONFIG) */
var PLANS = {
  premium_6m:  { label: '6 Months',  price: 349, months: 6,  perMonth: 58, period: '6 months' },
  premium_12m: { label: '12 Months', price: 499, months: 12, perMonth: 42, period: '12 months' }
};
var DEFAULT_PLAN = 'premium_12m';

/* Free-tier daily practice-question cap (ADR-107). Mirrors the canonical
   shared/constants/entitlements.js → FREE_TIER_LIMITS.DAILY_QUESTION_LIMIT (= 20). entitlements.js is server/node
   only (module.exports) and is NOT loaded in the browser, so the value is declared here for the client. Keep the
   two in lockstep — scripts/daily-limit.check.js asserts they never drift. */
var FREE_DAILY_QUESTION_LIMIT = 20;

/* Every premium-gated feature. With the single tier, all of these require premium. Kept in lockstep with
   shared/constants/entitlements.js → PREMIUM_FEATURES by scripts/entitlement-parity.check.js (ADR-109). */
var _LOCKED_FEATURES = {
  custom_training: true, review_mistakes: true, add_formula: true, add_topic: true,
  performance_insights: true, category_accuracy: true, hard_mode: true, skip_question: true,
  advanced_theme: true, daily_goal_limit: true, focus_timer: true, table_modal: true,
  adaptive_training: true, math_duel: true, timed_mocks: true,
  ai_explain: true, ai_coach: true, ai_study_plan: true,
  /* ADR-109 — Premium Phase 6: Mixed Aptitude practice mode + gated Learn topics/sections. */
  mixed_aptitude: true, learn_premium: true
};

var PAYWALL_DEBOUNCE_MS = 280;
var PAYMENT_TIMEOUT_MS = 120000;
var PAYMENT_SLOW_MS = 5000;
var _paywallModalOpen = false;
var _paywallLastOpenAt = 0;
var _paywallGuestPromptAt = 0;
var _paywallEscHandler = null;
var _paymentBusy = false;
var _paymentSafetyTimer = null;
var _paymentSlowTimer = null;
var _attemptId = 0;
var _lastPaywallFeature = '';   /* ADR-109: the feature key of the most recently shown paywall, for upgrade attribution */

function _toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') { var p = Date.parse(value); return isNaN(p) ? 0 : p; }
  if (typeof value.toDate === 'function') { try { return value.toDate().getTime(); } catch (_) { return 0; } }
  return 0;
}

/**
 * Clock-safe now — if the device clock is set >5min behind the last server
 * write, use the server timestamp so a rewound clock can't extend access.
 */
function _clockSafeNow(u) {
  var now = Date.now();
  if (u) {
    /* Anchor to the MOST RECENT server write, so a rewound device clock snaps forward as far as any trustworthy
       timestamp allows. Must be max(), not first-truthy: planUpdatedAt is frozen at purchase time (the oldest stamp)
       and is present for every purchased user, so a `||` chain would always pick it and discard `updatedAt` — the
       field firestore-sync writes via FieldValue.serverTimestamp() SPECIFICALLY as the tamper-resistant skew anchor.
       Absent fields → _toMillis 0 (ignored); a pending serverTimestamp sentinel → 0 (no false lockout); updatedAt
       can't be future, so a legitimate clock is unaffected. (ADR-108 cert fix, corrected in cert pass #3.) */
    var lastUpdateMs = Math.max(_toMillis(u.planUpdatedAt), _toMillis(u.updatedAt), _toMillis(u.createdAt));
    if (lastUpdateMs > 0 && now < lastUpdateMs - 300000) now = lastUpdateMs;
  }
  return now;
}

function _getAccessUserState() {
  if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function') {
    var state = FirestoreSync.getAccessState();
    if (state) return state;
  }
  return { plan: 'free', planType: null, planExpiry: null, isTrial: false, trialEnd: null };
}

/**
 * THE entitlement check: does this user currently have Premium?
 * premium ⟺ plan==='premium' && (planExpiry==null || planExpiry>now)
 */
function hasPremiumAccess(user) {
  var u = user || _getAccessUserState();
  if (!u || u.plan !== 'premium') return false;
  var expiryMs = _toMillis(u.planExpiry);
  if (!expiryMs) return true; /* indefinite admin grant */
  return _clockSafeNow(u) <= expiryMs;
}

function canAccess(feature, user) {
  var u = user || _getAccessUserState();
  if (hasPremiumAccess(u)) return true;
  return !_LOCKED_FEATURES[feature];
}

function canAccessFeature(feature) {
  return canAccess(feature, _getAccessUserState());
}

/* ─────────────────────── Entitlement telemetry (ADR-109) ───────────────────────
   Reuses the batched AIAnalytics sink (users/{uid}/aiEvents; it already stamps `plan`). Best-effort, never throws.
   feature is always 'premium'; the specific gated key rides in meta so the event taxonomy stays small + dedup-able. */
function _track(type, featureKey, extra) {
  try {
    if (typeof AIAnalytics !== 'undefined' && AIAnalytics.log) {
      var meta = { key: String(featureKey || '') };
      if (extra && typeof extra === 'object') { for (var k in extra) { if (extra.hasOwnProperty(k)) meta[k] = extra[k]; } }
      AIAnalytics.log('premium', type, meta);
    }
  } catch (_) { /* best-effort */ }
}

/* ─────────────────────── THE single fail-closed entitlement checkpoint (ADR-109) ───────────────────────
   Every premium-gated action funnels through requirePremium(): it returns true ONLY when the user genuinely has
   premium; otherwise it records the attempt, opens the paywall for that feature, and returns false. Fail-closed by
   construction — the key is treated as gated regardless of _LOCKED_FEATURES membership, and an unresolved/absent
   entitlement state resolves to free (hasPremiumAccess → false). Use this at every gate instead of the old
   `typeof canAccessFeature === 'function' ? canAccessFeature(x) : true` idiom (which failed OPEN). */
function requirePremium(featureKey, opts) {
  if (hasPremiumAccess(_getAccessUserState())) return true;
  _track('feature_attempted', featureKey);
  if (!(opts && opts.silent) && typeof showPaywall === 'function') showPaywall(featureKey);
  return false;
}

/* (ADR-109 cert cleanup: the isPremiumFeature/isFeatureAllowed render-read helpers added with requirePremium were
   removed — isFeatureAllowed duplicated canAccessFeature exactly and neither gained a consumer. Render decisions use
   canAccessFeature/hasPremiumAccess; action gates use requirePremium.) */

/* ADR-103: free users get 5 lifetime QuanAI "Explain" calls. The SERVER is the true gate (it decrements a
   transactional counter and 403s on exhaustion). This client flag is only a UX hint: once the server tells us a
   free user is out (PREMIUM_REQUIRED on explain), we flip it so the Explain button proactively shows 🔒 for the
   rest of the session instead of making the user tap into a dead end. Premium users are always allowed. */
var _freeExplainExhausted = false;
function markFreeExplainExhausted() { _freeExplainExhausted = true; }
function canOpenExplain() {
  if (hasPremiumAccess(_getAccessUserState())) return true;
  return !_freeExplainExhausted;   // free users may attempt until the server says they're out
}

function getDailyQuestionLimit() {
  return hasPremiumAccess(_getAccessUserState()) ? Infinity : FREE_DAILY_QUESTION_LIMIT;
}

function hasReachedDailyLimit() {
  var limit = getDailyQuestionLimit();
  if (limit === Infinity) return false;
  var p = (typeof loadProgress === 'function') ? loadProgress() : {};
  return (p.todayAttempted || 0) >= limit;
}

/* ─────────────────────────── Payment flow ─────────────────────────── */

function _getIdToken(callback) {
  if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
    var u = Auth.getCurrentUser();
    if (u && typeof u.getIdToken === 'function') {
      u.getIdToken().then(function (tok) { callback(tok); }).catch(function () { callback(null); });
      return;
    }
  }
  callback(null);
}

function _loadRazorpayScript(callback) {
  if (typeof Razorpay !== 'undefined') { if (callback) callback(null); return; }
  var existing = document.getElementById('razorpayCheckoutScript');
  if (existing) {
    existing.addEventListener('load', function () { if (callback) callback(null); }, { once: true });
    existing.addEventListener('error', function () { if (callback) callback('script_load_failed'); }, { once: true });
    return;
  }
  var script = document.createElement('script');
  script.id = 'razorpayCheckoutScript';
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.async = true;
  script.onload = function () { if (callback) callback(null); };
  script.onerror = function () { if (callback) callback('script_load_failed'); };
  document.body.appendChild(script);
}

function _resetPaymentGuards() {
  if (_paymentSafetyTimer) { clearTimeout(_paymentSafetyTimer); _paymentSafetyTimer = null; }
  if (_paymentSlowTimer) { clearTimeout(_paymentSlowTimer); _paymentSlowTimer = null; }
  _paymentBusy = false;
  var btn = document.querySelector('.pw-cta');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('pw-cta--loading');
    btn.textContent = 'Start Premium';
  }
}

/**
 * Start the Premium purchase for a given plan type ('premium_6m' | 'premium_12m').
 */
function openPremiumPayment(planType, userId) {
  if (_paymentBusy) return;
  if (!PLANS[planType]) planType = DEFAULT_PLAN;
  _paymentBusy = true;
  var attempt = ++_attemptId;

  var btn = document.querySelector('.pw-cta');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; btn.classList.add('pw-cta--loading'); }

  console.info('[PaymentFlow] PAYMENT_INITIATED | plan: ' + planType + ' | uid: ' + userId);
  _track('upgrade_initiated', _lastPaywallFeature, { plan: planType });   /* ADR-109 telemetry */

  if (_paymentSlowTimer) clearTimeout(_paymentSlowTimer);
  _paymentSlowTimer = setTimeout(function () {
    var b = document.querySelector('.pw-cta');
    if (b && _paymentBusy) b.textContent = 'Still processing, please wait…';
  }, PAYMENT_SLOW_MS);

  if (_paymentSafetyTimer) clearTimeout(_paymentSafetyTimer);
  _paymentSafetyTimer = setTimeout(function () { ++_attemptId; _resetPaymentGuards(); }, PAYMENT_TIMEOUT_MS);

  _loadRazorpayScript(function (loadErr) {
    if (attempt !== _attemptId) return;
    if (loadErr || typeof Razorpay === 'undefined') {
      _resetPaymentGuards();
      showToast('Payment service is unavailable right now.');
      return;
    }
    _getIdToken(function (idToken) {
      if (attempt !== _attemptId) return;
      if (!idToken) { _resetPaymentGuards(); showToast('Please login to continue payment.'); return; }

      fetch('/api/payment?action=create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken, 'X-Session-Id': (window.Session ? Session.id() : '') },
        body: JSON.stringify({ plan: planType })
      })
        .then(function (resp) {
          if (attempt !== _attemptId) return null;
          if (!resp.ok) {
            return resp.json().catch(function () { return {}; }).then(function (errData) {
              _resetPaymentGuards();
              showToast((errData && errData.error && errData.error.message) || 'Could not create payment. Please try again.');
              return null;
            });
          }
          return resp.json();
        })
        .then(function (data) {
          if (attempt !== _attemptId || !data) return;
          if (!data.orderId) { _resetPaymentGuards(); showToast('Could not create payment. Please try again.'); return; }

          console.info('[PaymentFlow] ORDER_CREATED | plan: ' + planType + ' | orderId: ' + data.orderId);
          var planInfo = PLANS[planType] || PLANS[DEFAULT_PLAN];
          var options = {
            key: RAZORPAY_LIVE_KEY,
            order_id: data.orderId,
            amount: data.amount,
            currency: 'INR',
            name: 'QuantReflex',
            description: 'Premium · ' + planInfo.label,
            modal: { ondismiss: function () { _resetPaymentGuards(); showToast('Payment cancelled. You can upgrade anytime.'); } },
            handler: function (response) {
              if (attempt !== _attemptId) return;
              var paymentId = response.razorpay_payment_id;
              var rzpOrderId = response.razorpay_order_id;
              var signature = response.razorpay_signature;
              if (!paymentId || !rzpOrderId || !signature) {
                _resetPaymentGuards();
                showToast('Payment verification failed. Please retry.');
                return;
              }
              console.info('[PaymentFlow] PAYMENT_SUCCESS | paymentId: ' + paymentId + ' | orderId: ' + rzpOrderId);

              _getIdToken(function (freshToken) {
                fetch('/api/payment?action=verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (freshToken || idToken), 'X-Session-Id': (window.Session ? Session.id() : '') },
                  body: JSON.stringify({ orderId: rzpOrderId, paymentId: paymentId, signature: signature })
                })
                  .then(function (r) {
                    if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { return { success: false, _serverError: (e && e.error && e.error.message) || null }; });
                    return r.json();
                  })
                  .then(function (result) {
                    _resetPaymentGuards();
                    if (!result || !result.success) {
                      showToast((result && result._serverError) || 'Payment activation failed. Please contact support.');
                      return;
                    }
                    console.info('[PaymentFlow] PAYMENT_VERIFIED | plan: ' + result.plan);
                    _track('upgrade_completed', _lastPaywallFeature, { plan: result.plan });   /* ADR-109 */
                    _track('feature_unlocked', _lastPaywallFeature);
                    /* Force-refresh JWT so the new `premium` claim is available immediately */
                    try {
                      var _cu = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
                      if (_cu && _cu.getIdToken) _cu.getIdToken(true).catch(function () {});
                    } catch (_) {}
                    if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.activatePremium === 'function') {
                      FirestoreSync.activatePremium(result.plan, result.expiry, paymentId, function () {
                        console.info('[PaymentFlow] PREMIUM_GRANTED | fully synced');
                        showToast('Premium unlocked 🎉');
                        _closePaywallModal();
                        /* Seamless in-session resume (ADR-107, Phase 5A): if a drill paused at the free daily cap
                           registered a one-shot resume hook, run it INSTEAD of the default view re-render — the
                           re-render would tear down the paused drill container and lose the session. The hook
                           continues the very same session at the blocked question (now Premium → no cap). It clears
                           itself; if it's absent (any other paywall entry point) we fall back to the normal refresh. */
                        var _resume = window.__qrResumeAfterUpgrade;
                        if (typeof _resume === 'function') {
                          try { _resume(); return; } catch (_e) { window.__qrResumeAfterUpgrade = null; }
                        }
                        var currentView = (typeof Router !== 'undefined' && Router.getCurrentView) ? Router.getCurrentView() : 'home';
                        if (currentView && typeof Router !== 'undefined' && Router.showView) Router.showView(currentView);
                      });
                    } else {
                      showToast('Premium unlocked! Refresh to see your benefits.');
                      _closePaywallModal();
                    }
                  })
                  .catch(function () { _resetPaymentGuards(); showToast('Payment activation failed. Please contact support.'); });
              });
            }
          };

          try {
            var rzp = new Razorpay(options);
            rzp.on('payment.failed', function (resp) {
              _resetPaymentGuards();
              console.error('[PaymentFlow] PAYMENT_FAILED | Razorpay error:', resp.error);
              showToast('Payment failed. Please try again.');
            });
            console.info('[PaymentFlow] RAZORPAY_OPENED');
            rzp.open();
          } catch (_) {
            _resetPaymentGuards();
            showToast('Could not open payment. Check your network and retry.');
          }
        })
        .catch(function () {
          if (attempt !== _attemptId) return;
          _resetPaymentGuards();
          showToast('Could not connect to payment service. Check your network.');
        });
    });
  });
}

/* ─────────────────────────── Paywall modal ─────────────────────────── */

function _closePaywallModal() {
  var overlay = document.getElementById('paywallModalOverlay');
  if (!overlay || overlay.classList.contains('closing')) {
    _paywallModalOpen = false;
    document.body.classList.remove('paywall-open');
    return;
  }
  overlay.classList.add('closing');
  document.body.classList.remove('paywall-open');
  if (_paywallEscHandler) { document.removeEventListener('keydown', _paywallEscHandler); _paywallEscHandler = null; }
  setTimeout(function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    _paywallModalOpen = false;
  }, 220);
}

function _contextAccent(featureType) {
  var map = {
    custom_training: '🎯 Custom practice sessions are a Premium feature.',
    review_mistakes: '📋 Reviewing your mistakes is a Premium feature.',
    add_formula: '📝 Saving your own formulas is a Premium feature.',
    add_topic: '📂 Creating custom topics is a Premium feature.',
    performance_insights: '📊 Deep performance insights are a Premium feature.',
    category_accuracy: '🎯 Category accuracy tracking is a Premium feature.',
    adaptive_training: '🤖 Adaptive Training adjusts difficulty in real time. Premium only.',
    timed_mocks: '📝 Full-length timed mocks of your target exam are a Premium feature.',
    focus_timer: '⏱ Focus Timer is a Premium feature.',
    table_modal: '📋 Full-screen table view is a Premium feature.',
    hard_mode: '🔥 Hard mode is a Premium feature.',
    skip_question: '⏭ Skip question is a Premium feature.',
    advanced_theme: '🎨 The Playful Professional theme is a Premium feature.',
    daily_goal_limit: '📈 Higher daily goals are a Premium feature.',
    ai_explain: '🧠 Unlimited QuanAI explanations are a Premium feature.',
    ai_coach: '🤖 QuanAI Coach is a Premium feature.',
    ai_study_plan: '📅 The QuanAI Study Planner is a Premium feature.',
    math_duel: '⚔️ Math Duel — real-time challenges — is a Premium feature.',
    /* Phase 5 (ADR-107): quota- and generic-entry contexts that previously fell through to the bare hero. */
    daily_limit: '🎯 You’ve used today’s free questions. Premium is unlimited daily practice.',
    diset_limit: '📊 You’ve done today’s free Data Interpretation set. Premium unlocks unlimited sets.',
    lrset_limit: '🧩 You’ve done today’s free Reasoning set. Premium unlocks unlimited sets.',
    stats: '📊 Deep performance insights are a Premium feature.',
    settings: '✨ This is a Premium feature.',
    premium_required: '✨ This is a Premium feature.',
    upgrade: '🚀 Unlock everything with Premium.'
  };
  return map[featureType] || '';
}

/* One benefits presentation (the old value-chips section duplicated this table and pushed the price
   below the fold — removed). Rows are the real gated features only; no "Priority Features" filler. */
var _COMPARE_ROWS = [
  ['Daily practice questions', '20 / day', 'Unlimited'],
  ['AI explanations', '5 free to try', 'Unlimited'],
  ['AI Coach & Study Planner', '—', '✓'],
  ['Math Duel', '—', '✓'],
  ['Timed Mocks', '—', '✓'],
  ['Mistake Review', '—', '✓'],
  ['Advanced Practice Modes', '—', '✓'],
  ['Analytics & Insights', 'Basic', 'Advanced']
];

/* [icon-name, emoji, text] triples rendered through qrIco() so both themes share one markup. */
var _TRUST = [
  ['lock', '🔒', 'Secure Payments'],
  ['rotate', '↩️', '7-Day Refund'],
  ['zap', '⚡', 'Instant Activation']
];

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function _buildPlansHTML(selected) {
  var html = '';
  ['premium_6m', 'premium_12m'].forEach(function (key) {
    var p = PLANS[key];
    var active = key === selected ? ' pw-plan--active' : '';
    var best = key === 'premium_12m' ? '<span class="pw-plan-badge">BEST VALUE</span>' : '';
    var save = key === 'premium_12m' ? '<div class="pw-plan-save">Save 28% vs 6 months</div>' : '<div class="pw-plan-save">&nbsp;</div>';
    html +=
      '<button type="button" class="pw-plan' + active + '" data-plan="' + key + '" aria-pressed="' + (key === selected) + '">' +
        best +
        '<div class="pw-plan-label">' + p.label + '</div>' +
        '<div class="pw-plan-price">₹' + p.price + '</div>' +
        '<div class="pw-plan-per">≈ ₹' + p.perMonth + '/month</div>' +
        save +
      '</button>';
  });
  return html;
}

function showPaywall(featureType) {
  /* Already premium? nothing to sell. */
  if (hasPremiumAccess(_getAccessUserState())) return;

  var now = Date.now();
  var existing = document.getElementById('paywallModalOverlay');
  if (existing && existing.classList.contains('closing')) {
    setTimeout(function () { showPaywall(featureType); }, 300);
    return;
  }
  if (now - _paywallLastOpenAt < PAYWALL_DEBOUNCE_MS) return;
  if (existing) { document.body.classList.add('paywall-open'); _paywallModalOpen = true; return; }
  _paywallLastOpenAt = now;
  _paywallModalOpen = true;

  /* ADR-109 telemetry — AFTER the debounce/closing/existing-modal early-returns (cert fix CERT-4), so one paywall
     impression logs exactly one gate_shown: a <280ms double-tap or a closing-retry no longer double-logs. */
  _lastPaywallFeature = featureType || '';   /* remembered so a subsequent upgrade attributes to this gate */
  _track('gate_shown', featureType);

  var userId = (typeof Auth !== 'undefined' && typeof Auth.getUserId === 'function') ? Auth.getUserId() : '';
  var accent = _contextAccent(featureType);
  var selected = DEFAULT_PLAN;

  var compareRows = _COMPARE_ROWS.map(function (r) {
    return '<tr><td class="pw-compare-feat">' + _esc(r[0]) + '</td>' +
           '<td class="pw-compare-free">' + _esc(r[1]) + '</td>' +
           '<td class="pw-compare-prem">' + _esc(r[2]) + '</td></tr>';
  }).join('');

  var trust = _TRUST.map(function (t) {
    var icon = (typeof qrIco === 'function') ? qrIco(t[0], t[1]) : t[1];
    return '<span class="pw-trust-item">' + icon + ' ' + _esc(t[2]) + '</span>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'paywallModalOverlay';
  overlay.className = 'paywall-overlay';
  overlay.innerHTML =
    '<div class="paywall-card pw-card">' +
      '<button class="paywall-close pw-close" type="button" aria-label="Close">×</button>' +

      /* Price-first structure: hero → why-you're-here → plans + CTA on the first screen, the
         comparison table as supporting detail below. The old chips section (a duplicate of the
         table) pushed the price two screens down — a paywall that hides its price reads as one. */
      '<div class="pw-hero">' +
        '<div class="pw-hero-icon">🧠</div>' +
        '<h2 class="pw-hero-title">Unlock Your Full Potential</h2>' +
        '<p class="pw-hero-sub">Train Faster. Solve Faster. Score Higher.</p>' +
      '</div>' +

      (accent ? '<p class="pw-context">' + _esc(accent) + '</p>' : '') +

      '<div class="pw-plans" role="group" aria-label="Choose a plan">' + _buildPlansHTML(selected) + '</div>' +

      '<button class="pw-cta" type="button">Start Premium</button>' +
      '<p class="pw-cta-note">One-time payment · No auto-renewal · 7-day refund</p>' +

      '<div class="pw-compare-wrap">' +
        '<table class="pw-compare">' +
          '<thead><tr><th class="pw-compare-feat">Feature</th><th class="pw-compare-free">Free</th><th class="pw-compare-prem">Premium</th></tr></thead>' +
          '<tbody>' + compareRows + '</tbody>' +
        '</table>' +
      '</div>' +

      '<div class="pw-trust">' + trust + '</div>' +

      '<div class="pw-footer">' +
        '<a class="pw-footer-link" href="#terms" data-view="terms">Terms</a>' +
        '<span class="pw-footer-dot">·</span>' +
        '<a class="pw-footer-link" href="#privacy" data-view="privacy">Privacy</a>' +
        '<span class="pw-footer-dot">·</span>' +
        '<a class="pw-footer-link" href="mailto:quantreflex@gmail.com">quantreflex@gmail.com</a>' +
      '</div>' +
    '</div>';

  overlay.addEventListener('click', function (e) { if (e.target === overlay) _closePaywallModal(); });
  document.body.appendChild(overlay);
  document.body.classList.add('paywall-open');
  _paywallEscHandler = function (event) { if (event.key === 'Escape') _closePaywallModal(); };
  document.addEventListener('keydown', _paywallEscHandler);

  var closeBtn = overlay.querySelector('.pw-close');
  if (closeBtn) closeBtn.addEventListener('click', _closePaywallModal);

  /* Plan selection */
  function _selectPlan(key) {
    selected = key;
    var plans = overlay.querySelectorAll('.pw-plan');
    for (var i = 0; i < plans.length; i++) {
      var isSel = plans[i].getAttribute('data-plan') === key;
      plans[i].classList.toggle('pw-plan--active', isSel);
      plans[i].setAttribute('aria-pressed', isSel ? 'true' : 'false');
    }
  }
  overlay.querySelectorAll('.pw-plan').forEach(function (el) {
    el.addEventListener('click', function () { _selectPlan(el.getAttribute('data-plan')); });
  });

  /* CTA */
  var cta = overlay.querySelector('.pw-cta');
  if (cta) cta.addEventListener('click', function () {
    if (!userId) {
      var _now = Date.now();
      if (_now - _paywallGuestPromptAt < 1000) return;
      _paywallGuestPromptAt = _now;
      showToast('Please login to continue payment.');
      return;
    }
    openPremiumPayment(selected, userId);
  });

  /* Footer is minimal (Terms · Privacy) — dismissal is via the × / backdrop / Esc. */

  _loadRazorpayScript(null);
}

global.canAccess = canAccess;
global.canAccessFeature = canAccessFeature;
global.requirePremium = requirePremium;
global.canOpenExplain = canOpenExplain;
global.markFreeExplainExhausted = markFreeExplainExhausted;
global.showPaywall = showPaywall;
global.openPremiumPayment = openPremiumPayment;
global.getDailyQuestionLimit = getDailyQuestionLimit;
global.hasReachedDailyLimit = hasReachedDailyLimit;
global.hasPremiumAccess = hasPremiumAccess;
global.Paywall = {
  canAccess: canAccess,
  canAccessFeature: canAccessFeature,
  requirePremium: requirePremium,
  showPaywall: showPaywall,
  openPremiumPayment: openPremiumPayment,
  getDailyQuestionLimit: getDailyQuestionLimit,
  hasReachedDailyLimit: hasReachedDailyLimit,
  hasPremiumAccess: hasPremiumAccess,
  canOpenExplain: canOpenExplain,
  markFreeExplainExhausted: markFreeExplainExhausted
};
})(window);
