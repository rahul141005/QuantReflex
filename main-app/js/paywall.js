/**
 * paywall.js — Premium access control + the paywall UI (v2)
 *
 * ADR-144 (WS4): PRESENTATION ONLY. Purchase mechanics live behind the provider-neutral facade
 * `QRPayments` (js/payments/), so the paywall neither knows nor can reach a payment provider.
 *
 * v2 monetization: a single Premium tier (₹299 / 6 months, ₹399 / 12 months).
 * Every gated feature resolves through `plan === 'premium'`. The legacy lifetime
 * and dual-tier products are gone. A trial is plan:'premium' with isTrial:true
 * (so it passes the same gate).
 */

(function (global) {

/* Pricing (display only — server is source of truth via PLAN_CONFIG) */
var PLANS = {
  premium_6m:  { label: '6 Months',  price: 299, months: 6,  perMonth: 50, period: '6 months' },
  premium_12m: { label: '12 Months', price: 399, months: 12, perMonth: 33, period: '12 months' }
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
var _paywallModalOpen = false;
var _paywallLastOpenAt = 0;
var _paywallGuestPromptAt = 0;
var _paywallHandle = null;   /* QROverlay handle (FW-W2) — owns Esc/backdrop/focus-trap/body.paywall-open */
var _lastPaywallFeature = '';   /* ADR-109: the feature key of the most recently shown paywall, for upgrade attribution */

/* ADR-117: entitlement arithmetic lives in ONE place (data/entitlement-core.js, window.QR_ENTITLEMENT
   — the same physical module the serverless API require()s). These thin wrappers keep the existing
   call sites unchanged while removing the duplicate implementations. The `||` fallbacks are
   fail-closed: if the core somehow failed to load, expiry parses to 0 ⇒ NOT premium. */
function _core() { return (typeof QR_ENTITLEMENT !== 'undefined') ? QR_ENTITLEMENT : null; }

function _toMillis(value) {
  var c = _core();
  return c ? c.toMillis(value) : 0;
}

/**
 * Clock-safe now — if the device clock is set >5min behind the last server
 * write, use the server timestamp so a rewound clock can't extend access.
 */
/* Clock-rewind guard (ADR-108) — anchors to the most recent server write so a rewound device clock
   cannot extend access. Implementation is in the canonical core; see its clockSafeNow() for the
   full rationale (max() not first-truthy; pending serverTimestamp sentinels resolve to 0). */
function _clockSafeNow(u) {
  var c = _core();
  return c ? c.clockSafeNow(u) : Date.now();
}

function _getAccessUserState() {
  if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function') {
    var state = FirestoreSync.getAccessState();
    if (state) return state;
  }
  return { plan: 'free', planType: null, planExpiry: null, isTrial: false, trialEnd: null };
}

/**
 * THE single canonical entitlement decision: does this user currently have active Premium?
 * premium ⟺ plan==='premium' && planExpiry is a real future timestamp.
 *
 * There is NO permanent/indefinite Premium tier in QuantReflex — every grant (purchase 6m/12m,
 * admin 6m/12m, or a finite trial) carries a finite planExpiry. A `premium` doc with a null/NaN
 * expiry is therefore illegitimate legacy data and resolves to NOT-premium (fail-safe), rather than
 * granting indefinite access. This is the ONE function every gate and purchase entry point uses;
 * `hasActivePremium` is the canonical alias.
 */
function hasPremiumAccess(user) {
  var u = user || _getAccessUserState();
  var c = _core();
  /* Fail-closed if the canonical core is unavailable (it is precached + loaded before this file). */
  return c ? c.isActivePremium(u) : false;
}
/* Canonical name (used app-wide + by the purchase-block guards). Same decision, clearer intent. */
function hasActivePremium(user) { return hasPremiumAccess(user); }

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
/* Per-user UX flag — must be cleared on logout / user-switch so user B never inherits user A's
   exhausted-state hint. Called by FirestoreSync.resetSyncState(). */
function resetPaywallUserState() { _freeExplainExhausted = false; }
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

/**
 * Start the Premium purchase (ADR-144, WS4).
 *
 * PRESENTATION ONLY. Every provider mechanic — SDK load, order creation, the checkout sheet, server
 * verification — lives behind `QRPayments`, so this function cannot reach a provider directly and
 * needs no change when Play Billing arrives in WS5.
 *
 * Not exported globally any more: the UI's only payment entry point is the facade.
 */
function _startPurchase(planType, userId) {
  /* No overlapping plans: an active-premium user (purchase / Play / admin — any source) can never
     start a purchase. Belt-and-braces with showPaywall's guard. */
  if (hasActivePremium(_getAccessUserState())) return;
  if (!PLANS[planType]) planType = DEFAULT_PLAN;

  _track('upgrade_initiated', _lastPaywallFeature, { plan: planType });   /* ADR-109 telemetry */

  var _plan = PLANS[planType] || PLANS[DEFAULT_PLAN];
  QRPayments.purchase(planType, userId, {
    /* Display data stays owned by the UI; the facade just carries it to whichever provider runs. */
    planLabel: _plan && _plan.label,
    onBusy: function (busy) {
      var btn = document.querySelector('.pw-cta');
      if (!btn) return;
      btn.disabled = busy;
      btn.classList.toggle('pw-cta--loading', busy);
      btn.textContent = busy ? QRI18n.t('paywall.processing') : QRI18n.t('paywall.startPremium');
    },
    onSlow: function () {
      var b = document.querySelector('.pw-cta');
      if (b) b.textContent = QRI18n.t('paywall.stillProcessing');
    },
    onDone: function (result) { _onPurchaseResult(result); }
  });
}

/**
 * Render one normalised purchase outcome. Provider-neutral by construction — this never mentions a
 * provider, so WS5 adds Play without touching it.
 */
function _onPurchaseResult(result) {
  var R = QRPayments.RESULT;
  var code = (result && result.code) || R.FAILED;

  if (code !== R.OK) {
    /* PROVIDER_UNAVAILABLE deliberately carries no provider-specific message — the copy stays neutral. */
    showToast((result && result.message) ||
      (code === R.PROVIDER_UNAVAILABLE ? QRI18n.t('paywall.purchaseUnavailable') : QRI18n.t('paywall.failed')));
    return;
  }

  _track('upgrade_completed', _lastPaywallFeature, { plan: result.plan });   /* ADR-109 */
  _track('feature_unlocked', _lastPaywallFeature);

  /* Force-refresh the JWT so the new `premium` claim is available immediately. */
  try {
    var _cu = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
    if (_cu && _cu.getIdToken) _cu.getIdToken(true).catch(function () {});
  } catch (_) {}

  if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.activatePremium === 'function') {
    /* In-memory display cache only — the server already granted the entitlement. */
    FirestoreSync.activatePremium(result.plan, result.expiry, result.paymentId, function () {
      console.info('[PaymentFlow] PREMIUM_GRANTED | fully synced');
      showToast(QRI18n.t('paywall.unlocked'));
      _closePaywallModal();
      /* Seamless in-session resume (ADR-107, Phase 5A): if a drill paused at the free daily cap
         registered a one-shot resume hook, run it INSTEAD of the default view re-render — the
         re-render would tear down the paused drill container and lose the session. */
      var _resume = window.__qrResumeAfterUpgrade;
      if (typeof _resume === 'function') {
        try { _resume(); return; } catch (_e) { window.__qrResumeAfterUpgrade = null; }
      }
      var currentView = (typeof Router !== 'undefined' && Router.getCurrentView) ? Router.getCurrentView() : 'home';
      if (currentView && typeof Router !== 'undefined' && Router.showView) Router.showView(currentView);
    });
  } else {
    showToast(QRI18n.t('paywall.unlockedRefresh'));
    _closePaywallModal();
  }
}

/* ─────────────────────────── Paywall modal ─────────────────────────── */

function _closePaywallModal() {
  /* FW-W2: the QROverlay handle owns the lifecycle (Esc/backdrop listeners, ref-counted
     body.paywall-open, focus restore) — closing through it keeps all of that balanced.
     The legacy body below stays as a fallback for teardown paths that find an overlay
     without a live handle (e.g. after an external DOM removal). */
  if (_paywallHandle) { _paywallHandle.close(); return; }
  var overlay = document.getElementById('paywallModalOverlay');
  if (!overlay || overlay.classList.contains('closing')) {
    _paywallModalOpen = false;
    document.body.classList.remove('paywall-open');
    return;
  }
  overlay.classList.add('closing');
  document.body.classList.remove('paywall-open');
  setTimeout(function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    _paywallModalOpen = false;
  }, 220);
}

function _contextAccent(featureType) {
  /* ADR-111: accent copy lives in the locale catalogs (paywall.ctx_<feature>); an unknown feature
     resolves to its own key and falls back to the bare hero, exactly as the old map did. */
  if (!featureType) return '';
  var key = 'paywall.ctx_' + featureType;
  var v = QRI18n.t(key);
  return v === key ? '' : v;
}

/* One benefits presentation (the old value-chips section duplicated this table and pushed the price
   below the fold — removed). Rows are the real gated features only; no "Priority Features" filler. */
var _COMPARE_ROWS = [
  /* ADR-111: catalog keys, resolved through t() at render time. */
  ['paywall.cmpDailyFeat', 'paywall.cmpDailyFree', 'paywall.cmpUnlimited'],
  ['paywall.cmpAiExplFeat', 'paywall.cmpAiExplFree', 'paywall.cmpUnlimited'],
  ['paywall.cmpCoachFeat', 'paywall.cmpNone', 'paywall.cmpYes'],
  ['paywall.cmpDuelFeat', 'paywall.cmpNone', 'paywall.cmpYes'],
  ['paywall.cmpMocksFeat', 'paywall.cmpNone', 'paywall.cmpYes'],
  ['paywall.cmpReviewFeat', 'paywall.cmpNone', 'paywall.cmpYes'],
  ['paywall.cmpModesFeat', 'paywall.cmpNone', 'paywall.cmpYes'],
  ['paywall.cmpAnalyticsFeat', 'paywall.cmpBasic', 'paywall.cmpAdvanced']
];

/* [icon-name, emoji, text] triples rendered through qrIco() so both themes share one markup. */
var _TRUST = [
  ['lock', '🔒', 'paywall.trustSecure'],
  ['rotate', '↩️', 'paywall.trustRefund'],
  ['zap', '⚡', 'paywall.trustInstant']
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
    var best = key === 'premium_12m' ? '<span class="pw-plan-badge">' + QRI18n.t('paywall.bestValue') + '</span>' : '';
    var save = key === 'premium_12m' ? '<div class="pw-plan-save">' + QRI18n.t('paywall.savePct') + '</div>' : '<div class="pw-plan-save">&nbsp;</div>';
    html +=
      '<button type="button" class="pw-plan' + active + '" data-plan="' + key + '" aria-pressed="' + (key === selected) + '">' +
        best +
        '<div class="pw-plan-label">' + QRI18n.t(key === 'premium_12m' ? 'settings.plan12m' : 'settings.plan6m') + '</div>' +
        '<div class="pw-plan-price">₹' + p.price + '</div>' +
        '<div class="pw-plan-per">' + QRI18n.t('paywall.perMonth', { amount: p.perMonth }) + '</div>' +
        save +
      '</button>';
  });
  return html;
}

/* ADR-144 (WS4) / ADR-145 (WS5): the purchase control, or the explanation that replaces it.
   ONE function so the first render and the async re-render can never produce different markup —
   a second copy of this string is a second place for the "no CTA in a Play build" rule to be got
   wrong. `canBuy === false` renders an explanation: never a dead button, never a link to a website,
   and never a fallback to the other provider. */
function _ctaHTML(canBuy) {
  return canBuy
    ? '<button class="pw-cta" type="button">' + QRI18n.t('paywall.startPremium') + '</button>' +
      '<p class="pw-cta-note">' + QRI18n.t('paywall.ctaNote') + '</p>'
    : '<p class="pw-cta-note pw-unavailable">' + QRI18n.t('paywall.purchaseUnavailable') + '</p>';
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
  /* ADR-144 (WS4): asked ONCE per render so the markup and the handlers can never disagree about
     whether a purchase is possible. False in a Play build until WS5 — and false is a complete
     answer, never a cue to try the other provider. */
  var _canBuy = (typeof QRPayments !== 'undefined') && QRPayments.canPurchase();

  var compareRows = _COMPARE_ROWS.map(function (r) {
    return '<tr><td class="pw-compare-feat">' + _esc(QRI18n.t(r[0])) + '</td>' +
           '<td class="pw-compare-free">' + _esc(QRI18n.t(r[1])) + '</td>' +
           '<td class="pw-compare-prem">' + _esc(QRI18n.t(r[2])) + '</td></tr>';
  }).join('');

  var trust = _TRUST.map(function (t) {
    var icon = (typeof qrIco === 'function') ? qrIco(t[0], t[1]) : t[1];
    return '<span class="pw-trust-item">' + icon + ' ' + _esc(QRI18n.t(t[2])) + '</span>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'paywallModalOverlay';
  overlay.className = 'paywall-overlay';
  overlay.innerHTML =
    '<div class="paywall-card pw-card" role="dialog" aria-modal="true" aria-labelledby="pwHeroTitle">' +
      '<button class="paywall-close pw-close" type="button" aria-label="' + QRI18n.t('paywall.closeAria') + '">×</button>' +

      /* Price-first structure: hero → why-you're-here → plans + CTA on the first screen, the
         comparison table as supporting detail below. The old chips section (a duplicate of the
         table) pushed the price two screens down — a paywall that hides its price reads as one. */
      '<div class="pw-hero">' +
        '<div class="pw-hero-icon">🧠</div>' +
        '<h2 class="pw-hero-title" id="pwHeroTitle">' + QRI18n.t('paywall.heroTitle') + '</h2>' +
        '<p class="pw-hero-sub">' + QRI18n.t('paywall.heroSub') + '</p>' +
      '</div>' +

      (accent ? '<p class="pw-context">' + _esc(accent) + '</p>' : '') +

      '<div class="pw-plans" role="group" aria-label="' + QRI18n.t('paywall.choosePlanAria') + '">' + _buildPlansHTML(selected) + '</div>' +

      /* ADR-144 (WS4): no purchase control unless the platform's provider can actually take money.
         In a Play build before WS5 this renders the explanation instead — never a dead button, never
         a link to a website, and never a fallback to the other provider. */
      '<div class="pw-cta-slot">' + _ctaHTML(_canBuy) + '</div>' +

      '<div class="pw-compare-wrap">' +
        '<table class="pw-compare">' +
          '<thead><tr><th class="pw-compare-feat">' + QRI18n.t('paywall.thFeature') + '</th><th class="pw-compare-free">' + QRI18n.t('paywall.thFree') + '</th><th class="pw-compare-prem">' + QRI18n.t('paywall.thPremium') + '</th></tr></thead>' +
          '<tbody>' + compareRows + '</tbody>' +
        '</table>' +
      '</div>' +

      '<div class="pw-trust">' + trust + '</div>' +

      /* ADR-142 (WS3): Restore. `FirestoreSync.refreshFromServer` existed with ZERO callers, so a
         purchase made on another device — or one whose grant landed via the webhook after the tab
         closed — had no way into this session short of a full relaunch. It becomes reachable here.
         It is also the mechanism Play requires: a reinstall must be able to recover an entitlement
         without paying again, and because the grant is server-side and provider-neutral, one button
         serves both providers. */
      '<button class="pw-restore" type="button">' + _esc(QRI18n.t('paywall.restore')) + '</button>' +

      '<div class="pw-footer">' +
        '<a class="pw-footer-link" href="#terms" data-view="terms">' + QRI18n.t('paywall.terms') + '</a>' +
        '<span class="pw-footer-dot">·</span>' +
        '<a class="pw-footer-link" href="#privacy" data-view="privacy">' + QRI18n.t('paywall.privacy') + '</a>' +
        '<span class="pw-footer-dot">·</span>' +
        '<a class="pw-footer-link" href="mailto:quantreflex@gmail.com">quantreflex@gmail.com</a>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  /* FW-W2: shared lifecycle. lockClass keeps the historical body.paywall-open (its CSS and the
     router teardown key on it); Esc stays unguarded during checkout — parity with the old handler
     (Razorpay opens its own iframe layer; closing our sheet under it is harmless and was always
     possible). Initial focus lands on the CTA, the dialog's primary action. */
  _paywallHandle = QROverlay.open(overlay, {
    dialogEl: overlay.querySelector('.pw-card'),
    lockClass: 'paywall-open',
    removeOnClose: true,
    closingClass: 'closing',
    closeMs: 220,
    initialFocus: '.pw-cta',
    onClose: function () { _paywallModalOpen = false; _paywallHandle = null; }
  });

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

  /* CTA. Bound through a named function because the slot can be re-rendered when an asynchronous
     provider reports readiness (below) — the replacement button must get the identical handler. */
  function _bindCta() {
    var cta = overlay.querySelector('.pw-cta');
    if (!cta) return;
    cta.addEventListener('click', function () {
      if (!userId) {
        var _now = Date.now();
        if (_now - _paywallGuestPromptAt < 1000) return;
        _paywallGuestPromptAt = _now;
        showToast(QRI18n.t('paywall.loginToContinue'));
        return;
      }
      _startPurchase(selected, userId);
    });
  }
  _bindCta();

  /* Restore (ADR-142, WS3) */
  var restoreBtn = overlay.querySelector('.pw-restore');
  if (restoreBtn) restoreBtn.addEventListener('click', function () {
    if (!userId) { showToast(QRI18n.t('paywall.loginToContinue')); return; }
    if (restoreBtn.disabled) return;                       /* one in flight at a time */
    restoreBtn.disabled = true;
    var original = restoreBtn.textContent;
    restoreBtn.textContent = QRI18n.t('paywall.restoreChecking');
    var done = false;
    function finish(msgKey, closeAfter) {
      if (done) return; done = true;
      showToast(QRI18n.t(msgKey));
      restoreBtn.disabled = false;
      restoreBtn.textContent = original;
      if (closeAfter) _closePaywallModal();
    }
    /* Safety timeout mirrors the purchase path's: a hung network must never leave a dead button. */
    var t = setTimeout(function () { finish('paywall.restoreFailed', false); }, 12000);
    /* ADR-144 (WS4): routed through the facade, not FirestoreSync directly. Restore is provider-NEUTRAL
       today (entitlement is server truth, so restoring is re-reading it), but going through
       QRPayments keeps one restore entry point for WS5 to extend, and keeps the paywall free of any
       direct data-layer call. It can only ever REFRESH from the server — it never grants, and it
       reports honest failure rather than fabricating success. */
    if (typeof QRPayments === 'undefined' || typeof QRPayments.restore !== 'function') {
      clearTimeout(t); finish('paywall.restoreFailed', false); return;
    }
    try {
      QRPayments.restore(function (okRead) {
        clearTimeout(t);
        if (!okRead) { finish('paywall.restoreFailed', false); return; }
        /* Decided by the ONE canonical rule, not by re-reading fields here. If it says premium, the
           paywall itself is now wrong to be open — close it. */
        finish(canAccess() ? 'paywall.restoreFound' : 'paywall.restoreNone', canAccess());
      });
    } catch (_) {
      clearTimeout(t);
      finish('paywall.restoreFailed', false);
    }
  });

  /* Footer is minimal (Terms · Privacy) — dismissal is via the × / backdrop / Esc. */

  /* Warm the active provider's SDK while the user reads, so the tap doesn't pay the download cost.
     Routed through the facade's adapter so the paywall never names a provider. */
  if (_canBuy) { try { QRPayments.preloadProvider(); } catch (_) {} }

  /* ADR-145 (WS5): Play can only answer "can I take money?" asynchronously — it needs the Digital
     Goods catalogue AND the server's confirmation that it will honour a purchase. `canPurchase()`
     must stay synchronous for the render, so the sheet paints without a CTA and the control appears
     only if readiness is actually proven.
     Deliberately ONE-DIRECTIONAL: a late YES may add the control, a late NO never removes one. The
     only provider that renders a CTA synchronously is Razorpay, whose readiness is already decided,
     so there is nothing for a late NO to correct — while pulling a button out from under a tapping
     finger would be a bug in its own right. */
  if (!_canBuy && typeof QRPayments !== 'undefined' && typeof QRPayments.prepareProvider === 'function') {
    try {
      QRPayments.prepareProvider(function (ready) {
        if (ready !== true || !_paywallModalOpen) return;
        var slot = overlay.querySelector('.pw-cta-slot');
        /* Re-check the facade rather than trusting the callback's word: canPurchase() is the one
           predicate the purchase path itself consults, so the CTA must agree with IT, not with a
           parallel answer that could have been computed differently. */
        if (!slot || slot.querySelector('.pw-cta') || QRPayments.canPurchase() !== true) return;
        slot.innerHTML = _ctaHTML(true);
        _bindCta();
      });
    } catch (_) {}
  }
}

global.canAccess = canAccess;
global.canAccessFeature = canAccessFeature;
global.requirePremium = requirePremium;
global.canOpenExplain = canOpenExplain;
global.markFreeExplainExhausted = markFreeExplainExhausted;
global.showPaywall = showPaywall;
global.getDailyQuestionLimit = getDailyQuestionLimit;
global.hasReachedDailyLimit = hasReachedDailyLimit;
global.hasPremiumAccess = hasPremiumAccess;
global.hasActivePremium = hasActivePremium;   /* canonical alias — one active-premium decision app-wide */
global.Paywall = {
  canAccess: canAccess,
  canAccessFeature: canAccessFeature,
  requirePremium: requirePremium,
  showPaywall: showPaywall,
  closeModal: _closePaywallModal,   /* FW-W2: router nav-teardown closes via the handle (listeners + lock stay balanced) */
  getDailyQuestionLimit: getDailyQuestionLimit,
  hasReachedDailyLimit: hasReachedDailyLimit,
  hasPremiumAccess: hasPremiumAccess,
  hasActivePremium: hasActivePremium,
  canOpenExplain: canOpenExplain,
  markFreeExplainExhausted: markFreeExplainExhausted,
  resetPaywallUserState: resetPaywallUserState
};
})(window);
