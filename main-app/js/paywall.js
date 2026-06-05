/**
 * paywall.js — Premium access control + paywall + Razorpay flow
 */

(function (global) {
var RAZORPAY_LIVE_KEY = 'rzp_live_STanzIgCpSAfL7';
var _LOCKED_FEATURES = {
  custom_training: true,
  review_mistakes: true,
  add_formula: true,
  add_topic: true,
  performance_insights: true,
  category_accuracy: true,
  hard_mode: true,
  skip_question: true,
  advanced_theme: true,
  daily_goal_limit: true,
  focus_timer: true,
  table_modal: true,
  ai_explain: true,
  ai_coach: true,
  ai_study_plan: true,
  adaptive_training: true,
  math_duel: true
};
var PAYWALL_DEBOUNCE_MS = 280;
var PAYMENT_TIMEOUT_MS = 120000;
var _paywallModalOpen = false;
var _paywallPaymentBusy = false;
var _paywallUpgradeBtn = null;
var _paywallEscHandler = null;
var _paywallGuestPromptAt = 0;
var _paywallLastOpenAt = 0;
var _paymentSafetyTimer = null;
var _paywallPlusPaymentBusy = false;
var _paywallPlusGuestPromptAt = 0;
var _paymentSlowTimer = null;
var _plusPaymentSlowTimer = null;
var PAYMENT_SLOW_MS = 5000;

function _toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    var parsed = Date.parse(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toDate === 'function') {
    try { return value.toDate().getTime(); } catch (_) { return 0; }
  }
  return 0;
}

function _resetPaymentGuards(enableButton) {
  if (_paymentSafetyTimer) {
    clearTimeout(_paymentSafetyTimer);
    _paymentSafetyTimer = null;
  }
  if (_paymentSlowTimer) {
    clearTimeout(_paymentSlowTimer);
    _paymentSlowTimer = null;
  }
  _paywallPaymentBusy = false;
  if (enableButton) {
    var btn = document.querySelector('.paywall-upgrade');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      btn.textContent = 'Unlock Premium \u2013 \u20B989';
    }
  }
}

var _AI_FEATURES = { ai_explain: true, ai_coach: true, ai_study_plan: true, math_duel: true };

/**
 * Clock-safe now — detects client-side clock manipulation.
 * If the device clock is set backwards by >5 minutes relative to the last
 * server-written updatedAt, we use the server timestamp instead.
 * This prevents clock-rewind exploits while avoiding permanent lockout
 * of users with genuinely wrong device clocks.
 */
function _clockSafeNow(u) {
  var now = Date.now();
  if (u) {
    var lastUpdateMs = _toMillis(u.updatedAt) || _toMillis(u.createdAt);
    if (lastUpdateMs > 0 && now < lastUpdateMs - 300000) {
      /* Clock is >5 min behind server — use server time as best estimate.
         Using MAX_SAFE_INTEGER here would permanently revoke valid subscriptions
         for users whose device clock is simply wrong (not malicious). */
      now = lastUpdateMs;
    }
  }
  return now;
}

/**
 * Centralized entitlement check: does this user have Premium-level access?
 * Premium+ automatically satisfies Premium (Premium+ ⊃ Premium).
 * Hierarchy: Free → Trial → Premium → Premium+
 */
function hasPremiumAccess(user) {
  var u = user || _getAccessUserState();
  if (!u) return false;
  if (u.isPremium === true || u.hasPaid === true) return true;
  // Premium+ inherits Premium
  if (u.isPremiumPlus === true) {
    var expiryMs = _toMillis(u.premiumPlusExpiry);
    var now = _clockSafeNow(u);
    if (!expiryMs || now <= expiryMs) return true;
  }
  // Active trial
  if (u.isTrial === true) {
    var trialEndMs = _toMillis(u.trialEnd);
    var now2 = _clockSafeNow(u);
    if (trialEndMs > 0 && now2 <= trialEndMs) return true;
  }
  return false;
}

/**
 * Centralized entitlement check: does this user have Premium+ access?
 * Only Premium+ users with a valid (non-expired) subscription pass this.
 */
function hasPremiumPlusAccess(user) {
  var u = user || _getAccessUserState();
  if (!u || u.isPremiumPlus !== true) return false;
  var expiryMs = _toMillis(u.premiumPlusExpiry);
  var now = _clockSafeNow(u);
  if (expiryMs > 0 && now > expiryMs) return false;
  return true;
}

function _getAccessUserState() {
  if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function') {
    var state = FirestoreSync.getAccessState();
    if (state) return state;
  }
  return { isPremium: false, isPremiumPlus: false, isTrial: false, hasPaid: false, isEarlyUser: false, trialEnd: null };
}

function canAccess(feature, user) {
  var normalizedUser = user || _getAccessUserState();

  if (_AI_FEATURES[feature]) {
    return hasPremiumPlusAccess(normalizedUser);
  }
  if (hasPremiumAccess(normalizedUser)) return true;
  return !_LOCKED_FEATURES[feature];
}

function canAccessFeature(feature) {
  return canAccess(feature, _getAccessUserState());
}



function _getPaywallCopy(featureType) {
  var map = {
    custom_training: {
      accent: '🎯 You tried to start a custom session. This is a Premium feature.'
    },
    review_mistakes: {
      accent: '📋 Reviewing your mistakes is a Premium feature.'
    },
    add_formula: {
      accent: '📝 Saving your own formulas is a Premium feature.'
    },
    add_topic: {
      accent: '📂 Creating custom topics is a Premium feature.'
    },
    stats: {
      accent: '📊 Deep analytics are available in Premium.'
    },
    settings: {
      accent: '⚙️ This setting is unlocked in Premium.'
    },
    focus_timer: {
      accent: '⏱ Focus Timer is a Premium feature.'
    },
    adaptive_training: {
      accent: '🤖 Adaptive Training adjusts difficulty in real time. Premium only.'
    },
    table_modal: {
      accent: '📋 Full-screen table view is a Premium feature.'
    },
    ai_explain: {
      accent: '🧠 AI-powered explanations require Premium+.'
    },
    ai_coach: {
      accent: '🤖 AI Coach insights require Premium+.'
    },
    ai_study_plan: {
      accent: '📅 AI Study Plan generator requires Premium+.'
    },
    math_duel: {
      accent: '⚔️ Math Duel is a Premium+ competitive feature. Challenge friends in realtime.'
    },
    upgrade: {
      accent: '🔥 You\'re on a roll! Unlock everything to keep the momentum going.'
    }
  };
  return map[featureType] || {};
}

function _closePaywallModal() {
  var overlay = document.getElementById('paywallModalOverlay');
  if (!overlay || overlay.classList.contains('closing')) {
    _paywallModalOpen = false;
    document.body.classList.remove('paywall-open');
    return;
  }
  overlay.classList.add('closing');
  document.body.classList.remove('paywall-open');
  _paywallUpgradeBtn = null;
  if (_paywallEscHandler) {
    document.removeEventListener('keydown', _paywallEscHandler);
    _paywallEscHandler = null;
  }
  setTimeout(function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    _paywallModalOpen = false;
  }, 220);
}

function _loadRazorpayScript(callback) {
  if (typeof Razorpay !== 'undefined') {
    if (callback) callback(null);
    return;
  }
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

function openPayment(userId) {
  if (_paywallPaymentBusy) return;
  _paywallPaymentBusy = true;
  var btn = document.querySelector('.paywall-upgrade');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing\u2026';
    btn.classList.add('btn-loading');
  }
  console.info('[PaymentFlow] PAYMENT_INITIATED | plan: premium | uid: ' + userId);
  if (_paymentSlowTimer) clearTimeout(_paymentSlowTimer);
  _paymentSlowTimer = setTimeout(function () {
    var slowBtn = document.querySelector('.paywall-upgrade');
    if (slowBtn && _paywallPaymentBusy) {
      slowBtn.textContent = 'Still processing, please wait\u2026';
    }
  }, PAYMENT_SLOW_MS);
  if (_paymentSafetyTimer) clearTimeout(_paymentSafetyTimer);
  _paymentSafetyTimer = setTimeout(function () {
    _resetPaymentGuards(true);
  }, PAYMENT_TIMEOUT_MS);

  _loadRazorpayScript(function (loadErr) {
    if (loadErr || typeof Razorpay === 'undefined') {
      _resetPaymentGuards(true);
      showToast('Payment service is unavailable right now.');
      return;
    }

    /* Get auth token for server call */
    _getPlusIdToken(function (idToken) {
      if (!idToken) {
        _resetPaymentGuards(true);
        showToast('Please login to continue payment.');
        return;
      }

      /* Step 1: Create server-side order */
      fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        body: JSON.stringify({ plan: 'premium' })
      })
        .then(function (resp) {
          if (!resp.ok) {
            return resp.text().then(function (text) {
              try {
                var errData = JSON.parse(text);
                _resetPaymentGuards(true);
                var errMsg = (errData && errData.error && errData.error.message) ? errData.error.message : 'Could not create payment. Please try again.';
                showToast(errMsg);
                return null;
              } catch(e) {
                _resetPaymentGuards(true);
                showToast('Server error (' + resp.status + '). Please try again later.');
                return null;
              }
            });
          }
          return resp.json();
        })
        .then(function (data) {
          if (!data || !data.orderId) {
            if (data !== null) {
              _resetPaymentGuards(true);
              showToast('Could not create payment. Please try again.');
            }
            console.error('[PaymentFlow] PAYMENT_FAILED | Missing orderId in create-order response');
            return;
          }

          console.info('[PaymentFlow] ORDER_CREATED | orderId: ' + data.orderId + ' | amount: ' + data.amount);
          var options = {
            key: RAZORPAY_LIVE_KEY,
            order_id: data.orderId,
            amount: data.amount,
            currency: 'INR',
            name: 'QuantReflex',
            description: 'Lifetime Premium Access',
            modal: {
              ondismiss: function () {
                _resetPaymentGuards(true);
                showToast('Payment cancelled. You can upgrade anytime.');
              }
            },
            handler: function (response) {
              var paymentId = response.razorpay_payment_id;
              var rzpOrderId = response.razorpay_order_id;
              var signature = response.razorpay_signature;
              if (!paymentId || !rzpOrderId || !signature) {
                _resetPaymentGuards(true);
                console.error('[PaymentFlow] PAYMENT_FAILED | Verification missing payload');
                showToast('Payment verification failed. Please retry.');
                return;
              }
              console.info('[PaymentFlow] PAYMENT_SUCCESS | paymentId: ' + paymentId + ' | orderId: ' + rzpOrderId);

              /* Step 3: Verify payment on server */
              _getPlusIdToken(function (freshToken) {
                fetch('/api/payment/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (freshToken || idToken) },
                  body: JSON.stringify({ orderId: rzpOrderId, paymentId: paymentId, signature: signature })
                })
                  .then(function (r) {
                    if (!r.ok) {
                      return r.json().catch(function () { return {}; }).then(function (errData) {
                        return { success: false, _serverError: (errData && errData.error && errData.error.message) || null };
                      });
                    }
                    return r.json();
                  })
                  .then(function (result) {
                    _resetPaymentGuards(true);
                    if (!result || !result.success) {
                      var activationMsg = (result && result._serverError) ? result._serverError : 'Payment activation failed. Please contact support.';
                      console.error('[PaymentFlow] PAYMENT_FAILED | Server verification failed: ' + activationMsg);
                      showToast(activationMsg);
                      return;
                    }
                    console.info('[PaymentFlow] PAYMENT_VERIFIED | plan: ' + result.plan);
                    /* Server already wrote to Firestore — update local cache */
                    /* Force-refresh the JWT so new custom claims (premium/premiumPlus)
                       are available immediately instead of waiting 1 hour. Fire-and-forget. */
                    try {
                      var _cu = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
                      if (_cu && _cu.getIdToken) _cu.getIdToken(true).catch(function () {});
                    } catch (_) {}
                    if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.unlockPremium === 'function') {
                      FirestoreSync.unlockPremium(paymentId, function (err) {
                        if (err) {
                          console.info('[PaymentFlow] PREMIUM_GRANTED | local sync warning: ' + err);
                          showToast('Premium unlocked! Refresh to see your benefits.');
                        } else {
                          console.info('[PaymentFlow] PREMIUM_GRANTED | fully synced');
                          showToast('Premium unlocked successfully 🎉');
                          _closePaywallModal();
                          var currentView = (typeof Router !== 'undefined' && Router.getCurrentView) ? Router.getCurrentView() : 'home';
                          if (currentView && typeof Router !== 'undefined' && Router.showView) Router.showView(currentView);
                        }
                      });
                    } else {
                      console.info('[PaymentFlow] PREMIUM_GRANTED | fallback sync');
                      showToast('Premium unlocked! Refresh to see your benefits.');
                      _closePaywallModal();
                    }
                  })
                  .catch(function () {
                    _resetPaymentGuards(true);
                    showToast('Payment activation failed. Please contact support.');
                  });
              });
            }
          };

          try {
            var rzp = new Razorpay(options);
            rzp.on('payment.failed', function (resp) {
              _resetPaymentGuards(true);
              console.error('[PaymentFlow] PAYMENT_FAILED | Razorpay error: ', resp.error);
              showToast('Payment failed. Please try again.');
            });
            console.info('[PaymentFlow] RAZORPAY_OPENED');
            rzp.open();
          } catch (_) {
            _resetPaymentGuards(true);
            showToast('Could not open payment. Check your network and retry.');
          }
        })
        .catch(function () {
          _resetPaymentGuards(true);
          showToast('Could not connect to payment service. Check your network.');
        });
    });
  });
}

function _getPlusIdToken(callback) {
  if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
    var u = Auth.getCurrentUser();
    if (u && typeof u.getIdToken === 'function') {
      u.getIdToken().then(function (tok) { callback(tok); }).catch(function () { callback(null); });
      return;
    }
  }
  callback(null);
}

var _plusPaymentSafetyTimer = null;
var _plusAttemptId = 0;

function _resetPlusPaymentGuards() {
  if (_plusPaymentSafetyTimer) {
    clearTimeout(_plusPaymentSafetyTimer);
    _plusPaymentSafetyTimer = null;
  }
  if (_plusPaymentSlowTimer) {
    clearTimeout(_plusPaymentSlowTimer);
    _plusPaymentSlowTimer = null;
  }
  _paywallPlusPaymentBusy = false;
  var plusBtn = document.querySelector('.paywall-plus-subscribe');
  if (plusBtn) {
    plusBtn.disabled = false;
    plusBtn.classList.remove('btn-loading');
    var activeToggle = document.querySelector('.paywall-plus-toggle-btn.active');
    var isYearly = activeToggle && activeToggle.getAttribute('data-plan') === 'plus_yearly';
    plusBtn.textContent = isYearly ? 'Buy 1 Year \u00B7 \u20B9499' : 'Buy 6 Months \u00B7 \u20B9299';
  }
}

function openPremiumPlusPayment(plan, userId) {
  if (_paywallPlusPaymentBusy) return;
  _paywallPlusPaymentBusy = true;
  var plusBtn = document.querySelector('.paywall-plus-subscribe');
  if (plusBtn) {
    plusBtn.disabled = true;
    plusBtn.textContent = 'Processing\u2026';
    plusBtn.classList.add('btn-loading');
  }
  console.info('[PaymentFlow] PAYMENT_INITIATED | plan: ' + plan + ' | uid: ' + userId);

  var currentAttempt = ++_plusAttemptId;

  if (_plusPaymentSlowTimer) clearTimeout(_plusPaymentSlowTimer);
  _plusPaymentSlowTimer = setTimeout(function () {
    if (plusBtn && _paywallPlusPaymentBusy) {
      plusBtn.textContent = 'Still processing, please wait\u2026';
    }
  }, PAYMENT_SLOW_MS);

  if (_plusPaymentSafetyTimer) clearTimeout(_plusPaymentSafetyTimer);
  _plusPaymentSafetyTimer = setTimeout(function () {
    ++_plusAttemptId;
    _resetPlusPaymentGuards();
  }, PAYMENT_TIMEOUT_MS);

  _loadRazorpayScript(function (loadErr) {
    if (currentAttempt !== _plusAttemptId) return;
    if (loadErr || typeof Razorpay === 'undefined') {
      _resetPlusPaymentGuards();
      showToast('Payment service is unavailable right now.');
      return;
    }

    _getPlusIdToken(function (idToken) {
      if (currentAttempt !== _plusAttemptId) return;
      if (!idToken) {
        _resetPlusPaymentGuards();
        showToast('Please login to continue payment.');
        return;
      }


      fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        body: JSON.stringify({ plan: plan })
      })
        .then(function (resp) {
          if (currentAttempt !== _plusAttemptId) return null;

          if (!resp.ok) {
            return resp.text().then(function (text) {
              if (currentAttempt !== _plusAttemptId) return null;
              try {
                var errData = JSON.parse(text);
                _resetPlusPaymentGuards();
                var errMsg = (errData && errData.error && errData.error.message) ? errData.error.message : 'Could not create payment. Please try again.';
                console.error('[Premium+] Create order failed:', errMsg, errData);
                showToast(errMsg);
                return null;
              } catch(e) {
                _resetPlusPaymentGuards();
                showToast('Server error (' + resp.status + '). Please try again later.');
                return null;
              }
            });
          }
          return resp.json();
        })
        .then(function (data) {
          if (currentAttempt !== _plusAttemptId) return;

          if (!data || !data.orderId) {
            if (data !== null) {
              _resetPlusPaymentGuards();
              console.error('[Premium+] Missing orderId in response:', data);
              showToast('Could not create payment. Please try again.');
            }
            console.error('[PaymentFlow] PAYMENT_FAILED | Missing orderId in create-order response');
            return;
          }

          console.info('[PaymentFlow] ORDER_CREATED | plan: ' + plan + ' | orderId: ' + data.orderId);

          var options = {
            key: RAZORPAY_LIVE_KEY,
            order_id: data.orderId,
            amount: data.amount,
            currency: 'INR',
            name: 'QuantReflex',
            description: description,
            modal: {
              ondismiss: function () {
                _resetPlusPaymentGuards();
                showToast('Payment cancelled. You can upgrade anytime.');
              }
            },
            handler: function (response) {
              if (currentAttempt !== _plusAttemptId) return;

              var paymentId = response.razorpay_payment_id;
              var rzpOrderId = response.razorpay_order_id;
              var signature = response.razorpay_signature;
              if (!paymentId || !rzpOrderId || !signature) {
                _resetPlusPaymentGuards();
                console.error('[PaymentFlow] PAYMENT_FAILED | Verification missing payload');
                showToast('Payment verification failed. Please retry.');
                return;
              }
              console.info('[PaymentFlow] PAYMENT_SUCCESS | paymentId: ' + paymentId + ' | orderId: ' + rzpOrderId);

              _getPlusIdToken(function (freshToken) {
                if (currentAttempt !== _plusAttemptId) return;
                fetch('/api/payment/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (freshToken || idToken) },
                  body: JSON.stringify({ orderId: rzpOrderId, paymentId: paymentId, signature: signature })
                })
                  .then(function (r) {
                    if (currentAttempt !== _plusAttemptId) return null;
                    if (!r.ok) {
                      return r.json().catch(function () { return {}; }).then(function (errData) {
                        return { success: false, _serverError: (errData && errData.error && errData.error.message) || null };
                      });
                    }
                    return r.json();
                  })
                  .then(function (result) {
                    if (currentAttempt !== _plusAttemptId) return;
                    _resetPlusPaymentGuards();
                    if (!result || !result.success) {
                      var activationMsg = (result && result._serverError) ? result._serverError : 'Payment activation failed. Please contact support.';
                      console.error('[PaymentFlow] PAYMENT_FAILED | Server verification failed: ' + activationMsg);
                      showToast(activationMsg);
                      return;
                    }
                    console.info('[PaymentFlow] PAYMENT_VERIFIED | plan: ' + result.plan);
                    /* Force-refresh the JWT so new custom claims are available immediately */
                    try {
                      var _cu2 = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
                      if (_cu2 && _cu2.getIdToken) _cu2.getIdToken(true).catch(function () {});
                    } catch (_) {}
                    if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.unlockPremiumPlus === 'function') {
                      FirestoreSync.unlockPremiumPlus(result.plan, result.expiry, paymentId, function (err) {
                        if (err) {
                          console.info('[PaymentFlow] PREMIUM_GRANTED | local sync warning: ' + err);
                          showToast('Payment successful! Refresh to see your benefits.');
                        } else {
                          console.info('[PaymentFlow] PREMIUM_GRANTED | fully synced');
                          showToast('Premium+ activated! AI features unlocked.');
                          _closePaywallModal();
                          var currentView = (typeof Router !== 'undefined' && Router.getCurrentView) ? Router.getCurrentView() : 'home';
                          if (currentView && typeof Router !== 'undefined' && Router.showView) Router.showView(currentView);
                        }
                      });
                    } else {
                      console.info('[PaymentFlow] PREMIUM_GRANTED | fallback sync');
                      showToast('Payment successful! Refresh to see your benefits.');
                      _closePaywallModal();
                    }
                  })
                  .catch(function () {
                    if (currentAttempt !== _plusAttemptId) return;
                    _resetPlusPaymentGuards();
                    showToast('Payment activation failed. Please contact support.');
                  });
              });
            }
          };

          try {
            var rzp = new Razorpay(options);
            rzp.on('payment.failed', function (resp) {
              _resetPlusPaymentGuards();
              console.error('[PaymentFlow] PAYMENT_FAILED | Razorpay error: ', resp.error);
              showToast('Payment failed. Please try again.');
            });
            console.info('[PaymentFlow] RAZORPAY_OPENED');
            rzp.open();
          } catch (_) {
            _resetPlusPaymentGuards();
            showToast('Could not open payment. Check your network and retry.');
          }
        })
        .catch(function (networkErr) {
          if (currentAttempt !== _plusAttemptId) return;
          _resetPlusPaymentGuards();
          console.error('[Premium+] Network/fetch error:', networkErr);
          showToast('Could not create payment. Check your network and retry.');
        });
    });
  });
}

function showPaywall(featureType) {
  var user = _getAccessUserState();
  var isAiFeature = !!_AI_FEATURES[featureType];
  if (!isAiFeature) {
    if (user && user.isPremium === true) return;
    if (user && user.hasPaid === true) return;
    if (user && user.isTrial === true) {
      var te = _toMillis(user.trialEnd);
      if (te > 0 && Date.now() <= te) return;
    }
  } else {
    if (user && user.isPremiumPlus === true) return;
  }
  var now = Date.now();
  var existing = document.getElementById('paywallModalOverlay');
  /* If the modal is in its closing animation, wait for it to finish then retry.
     Do NOT debounce this — the retry must succeed. */
  if (existing && existing.classList.contains('closing')) {
    setTimeout(function() { showPaywall(featureType); }, 300);
    return;
  }
  /* Debounce rapid clicks — but only for NEW open attempts */
  if (now - _paywallLastOpenAt < PAYWALL_DEBOUNCE_MS) return;
  /* If the modal is already in the DOM, just ensure it's visible */
  if (existing) {
    document.body.classList.add('paywall-open');
    if (_paywallEscHandler) {
      document.removeEventListener('keydown', _paywallEscHandler);
      _paywallEscHandler = null;
    }
    _paywallEscHandler = function (event) {
      if (event.key === 'Escape') _closePaywallModal();
    };
    document.addEventListener('keydown', _paywallEscHandler);
    _paywallUpgradeBtn = existing.querySelector('.paywall-upgrade');
    _paywallModalOpen = true;
    return;
  }
  _paywallLastOpenAt = now;
  _paywallModalOpen = true;
  var copy = _getPaywallCopy(featureType);
  var userId = (typeof Auth !== 'undefined' && typeof Auth.getUserId === 'function') ? Auth.getUserId() : '';
  var overlay = document.createElement('div');
  overlay.id = 'paywallModalOverlay';
  overlay.className = 'paywall-overlay';
  overlay.innerHTML =
    '<div class="paywall-card">' +
      '<button class="paywall-close" type="button" aria-label="Close">×</button>' +

      '<div class="paywall-header">' +
        '<div class="paywall-hero-icon">🧠</div>' +
        '<h2 class="paywall-title">Unlock Your Full Potential</h2>' +
        '<p class="paywall-tagline">Train faster. Improve accuracy. Perform better.</p>' +
      '</div>' +

      (copy.accent ? '<p class="paywall-context-accent">' + copy.accent + '</p>' : '') +

      '<ul class="paywall-benefits">' +
        '<li><span class="paywall-benefit-icon">⚡</span><span>Train your brain for speed</span></li>' +
        '<li><span class="paywall-benefit-icon">🎯</span><span>Improve weak areas faster</span></li>' +
        '<li><span class="paywall-benefit-icon">📈</span><span>Build accuracy and consistency</span></li>' +
        '<li><span class="paywall-benefit-icon">🧠</span><span>Learn from mistakes instantly</span></li>' +
      '</ul>' +

      '<div class="paywall-plans">' +
        '<div class="paywall-plan paywall-plan-premium">' +
          '<div class="paywall-plan-badge">Most Popular</div>' +
          '<div class="paywall-plan-name">Premium</div>' +
          '<div class="paywall-plan-price">₹89 <span class="paywall-plan-period">Lifetime</span></div>' +
          '<ul class="paywall-plan-features">' +
            '<li>✓ All training modes unlocked</li>' +
            '<li>✓ Custom practice sessions</li>' +
            '<li>✓ Mistake review & retry</li>' +
            '<li>✓ Adaptive difficulty</li>' +
            '<li>✓ Hard mode & power settings</li>' +
            '<li>✓ Speed benchmark & analytics</li>' +
            '<li>✓ All future updates included</li>' +
          '</ul>' +
          '<button class="btn-primary paywall-upgrade" type="button">Unlock Premium – ₹89</button>' +
          '<p class="paywall-plan-note">One-time payment · No subscription</p>' +
        '</div>' +

        '<div class="paywall-plan paywall-plan-plus">' +
          '<div class="paywall-plan-name">Premium+</div>' +
          '<div class="paywall-plus-toggle">' +
            '<button class="paywall-plus-toggle-btn paywall-plus-toggle-6month active" type="button" data-plan="plus_6month">6 Months · ₹299</button>' +
            '<button class="paywall-plus-toggle-btn paywall-plus-toggle-yearly" type="button" data-plan="plus_yearly">1 Year · ₹499</button>' +
          '</div>' +
          '<div class="paywall-plan-price paywall-plus-price">₹299<span class="paywall-plan-period">6 months</span></div>' +
          '<ul class="paywall-plan-features">' +
            '<li>✓ Everything in Premium</li>' +
            '<li>✓ AI mistake explanations</li>' +
            '<li>✓ AI coach insights</li>' +
            '<li>✓ Study plan generator</li>' +
            '<li>✓ AI word problem trainer</li>' +
            '<li>✓ Math Duel — real-time challenges</li>' +
          '</ul>' +
          '<button class="btn-primary paywall-plus-subscribe" type="button">Buy 6 Months · ₹299</button>' +
          '<p class="paywall-plan-note">One-time payment · No auto-renewal</p>' +
        '</div>' +
      '</div>' +

      '<table class="paywall-compare">' +
        '<thead><tr>' +
          '<th>Feature</th>' +
          '<th>Free</th>' +
          '<th class="paywall-compare-highlight">Premium</th>' +
          '<th>Premium+</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td>Practice</td><td>✓</td><td class="paywall-compare-highlight">✓</td><td>✓</td></tr>' +
          '<tr><td>Custom training</td><td>✗</td><td class="paywall-compare-highlight">✓</td><td>✓</td></tr>' +
          '<tr><td>Review mistakes</td><td>✗</td><td class="paywall-compare-highlight">✓</td><td>✓</td></tr>' +
          '<tr><td>Adaptive training</td><td>✗</td><td class="paywall-compare-highlight">✓</td><td>✓</td></tr>' +
          '<tr><td>Speed benchmark</td><td>✗</td><td class="paywall-compare-highlight">✓</td><td>✓</td></tr>' +
          '<tr><td>AI features</td><td>✗</td><td class="paywall-compare-highlight">✗</td><td>✓</td></tr>' +
        '</tbody>' +
      '</table>' +

      '<div class="paywall-social-proof">' +
        '<p class="paywall-trust">⭐ Used by CAT, GMAT &amp; CET aspirants daily</p>' +
        '<p class="paywall-urgency">🔥 Lifetime pricing · only while it lasts</p>' +
      '</div>' +

      '<div class="paywall-sticky-footer">' +
        '<button class="paywall-free-continue" type="button">Continue Free</button>' +
      '</div>' +
    '</div>';

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) _closePaywallModal();
  });
  document.body.appendChild(overlay);
  document.body.classList.add('paywall-open');
  _paywallEscHandler = function (event) {
    if (event.key === 'Escape') _closePaywallModal();
  };
  document.addEventListener('keydown', _paywallEscHandler);

  var closeBtn = overlay.querySelector('.paywall-close');
  if (closeBtn) closeBtn.addEventListener('click', _closePaywallModal);

  var upgradeBtn = overlay.querySelector('.paywall-upgrade');
  if (upgradeBtn) {
    _paywallUpgradeBtn = upgradeBtn;
    upgradeBtn.addEventListener('click', function () {
      if (!userId) {
        var _now = Date.now();
        if (_now - _paywallGuestPromptAt < 1000) return;
        _paywallGuestPromptAt = _now;
        showToast('Please login to continue payment.');
        return;
      }
      openPayment(userId);
    });
  }

  var _selectedPlan = 'plus_6month';
  var sixMonthBtn = overlay.querySelector('.paywall-plus-toggle-6month');
  var yearlyBtn = overlay.querySelector('.paywall-plus-toggle-yearly');
  var plusPriceEl = overlay.querySelector('.paywall-plus-price');
  var subscribeBtn = overlay.querySelector('.paywall-plus-subscribe');

  function _updatePlanUI(plan) {
    _selectedPlan = plan;
    if (sixMonthBtn) sixMonthBtn.classList.toggle('active', plan === 'plus_6month');
    if (yearlyBtn) yearlyBtn.classList.toggle('active', plan === 'plus_yearly');
    if (plusPriceEl) {
      plusPriceEl.innerHTML = plan === 'plus_yearly'
        ? '₹499<span class="paywall-plan-period">1 year</span>'
        : '₹299<span class="paywall-plan-period">6 months</span>';
    }
    if (subscribeBtn) {
      subscribeBtn.textContent = plan === 'plus_yearly' ? 'Buy 1 Year · ₹499' : 'Buy 6 Months · ₹299';
    }
  }

  if (sixMonthBtn) {
    sixMonthBtn.addEventListener('click', function () { _updatePlanUI('plus_6month'); });
  }
  if (yearlyBtn) {
    yearlyBtn.addEventListener('click', function () { _updatePlanUI('plus_yearly'); });
  }

  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', function () {
      if (!userId) {
        var _now2 = Date.now();
        if (_now2 - _paywallPlusGuestPromptAt < 1000) return;
        _paywallPlusGuestPromptAt = _now2;
        showToast('Please login to continue payment.');
        return;
      }
      openPremiumPlusPayment(_selectedPlan, userId);
    });
  }

  var freeBtn = overlay.querySelector('.paywall-free-continue');
  if (freeBtn) {
    freeBtn.addEventListener('click', _closePaywallModal);
  }

  /* Interactive plan card selection */
  var planPremium = overlay.querySelector('.paywall-plan-premium');
  var planPlus = overlay.querySelector('.paywall-plan-plus');
  if (planPremium && planPlus) {
    planPremium.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      planPremium.classList.remove('paywall-plan-deselected');
      planPlus.classList.remove('paywall-plan-selected');
    });
    planPlus.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      planPlus.classList.add('paywall-plan-selected');
      planPremium.classList.add('paywall-plan-deselected');
    });
  }

  _loadRazorpayScript(null);
}

function getDailyQuestionLimit() {
  var user = _getAccessUserState();
  if (hasPremiumAccess(user)) return Infinity;
  return 20;
}

function hasReachedDailyLimit() {
  var limit = getDailyQuestionLimit();
  if (limit === Infinity) return false;
  var p = (typeof loadProgress === 'function') ? loadProgress() : {};
  return (p.todayAttempted || 0) >= limit;
}

global.canAccess = canAccess;
global.canAccessFeature = canAccessFeature;
global.showPaywall = showPaywall;
global.openPayment = openPayment;
global.openPremiumPlusPayment = openPremiumPlusPayment;
global.getDailyQuestionLimit = getDailyQuestionLimit;
global.hasReachedDailyLimit = hasReachedDailyLimit;
global.hasPremiumAccess = hasPremiumAccess;
global.hasPremiumPlusAccess = hasPremiumPlusAccess;
global.Paywall = {
  canAccess: canAccess,
  canAccessFeature: canAccessFeature,
  showPaywall: showPaywall,
  getDailyQuestionLimit: getDailyQuestionLimit,
  hasReachedDailyLimit: hasReachedDailyLimit,
  hasPremiumAccess: hasPremiumAccess,
  hasPremiumPlusAccess: hasPremiumPlusAccess
};
})(window);
