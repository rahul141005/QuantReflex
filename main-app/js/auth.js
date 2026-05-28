/**
 * auth.js — Firebase Authentication module for Main App
 *
 * Wraps shared AuthCore. Handles standard login/signup for students.
 * Enforces NO special custom claims (except evaluating premium status).
 * Manages its own UI binding and state transitions.
 */
var Auth = (function () {
  'use strict';

  var _isSignupMode = false;
  var _emailTouched = false;
  var _passwordTouched = false;
  var _emailDebounce = null;
  var _passwordDebounce = null;
  var _coachingDebounce = null;
  var _lastUserId = undefined;

  function init(onTransition) {
    AuthCore.init(function(user, tokenResult) {
      if (user && tokenResult && tokenResult.claims) {
        /* Sync premium claims to AppState */
        var claims = tokenResult.claims;
        if (typeof AppState !== 'undefined') {
          AppState.setPremiumPlus(!!claims.premiumPlus);
          AppState.setPremium(!!claims.premium);
        } else {
          localStorage.setItem('qr_premium_plus', claims.premiumPlus ? 'true' : 'false');
          localStorage.setItem('qr_premium', claims.premium ? 'true' : 'false');
        }
      }
      
      var currentUid = user ? user.uid : null;
      
      if (_lastUserId !== currentUid) {
        var isFirstLoad = (_lastUserId === undefined);
        _lastUserId = currentUid;
        
        if (onTransition) {
          onTransition(user, isFirstLoad);
        }
      }
    });

    _bindAuthForm();
  }

  function _showAuthError(msg) {
    var el = document.getElementById('loginError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _hideAuthError() {
    var el = document.getElementById('loginError');
    if (el) { el.style.display = 'none'; }
  }

  function _setLoading(loading) {
    var btn = document.getElementById('authSubmitBtn');
    if (btn) {
      btn.disabled = loading;
      if (loading) {
        btn.textContent = 'Please wait...';
      } else {
        var activeTab = document.querySelector('.auth-tab.active');
        btn.textContent = (activeTab && activeTab.getAttribute('data-mode') === 'register') ? 'Create Account' : 'Log In';
      }
    }
  }

  function login(email, password) {
    _hideAuthError();
    _setLoading(true);

    AuthCore.login(email, password)
      .then(function() {
        /* AuthCore's onAuthStateChanged will trigger the UI transition */
      })
      .catch(function(err) {
        _setLoading(false);
        _showAuthError(err.message);
      });
  }

  function signup(email, password, coachingId) {
    _hideAuthError();
    
    if (typeof AuthValidators !== 'undefined') {
      var err = AuthValidators.validateSignup(email, password);
      if (err) {
        _showAuthError(err);
        _validatePasswordField();
        return;
      }
    }

    _setLoading(true);

    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, coachingId: coachingId })
    })
      .then(function (resp) { return resp.json().then(function (data) { return { ok: resp.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          _setLoading(false);
          var errMsg = (result.data && result.data.error && result.data.error.message) || (result.data && result.data.error) || 'Registration failed.';
          _showAuthError(errMsg);
          return;
        }
        
        AuthCore.signInWithCustomToken(result.data.token)
          .then(function () {
            /* AuthCore's onAuthStateChanged will trigger the UI transition */
          })
          .catch(function (e) {
            _setLoading(false);
            _showAuthError(AuthCore.getReadableError(e));
          });
      })
      .catch(function (error) {
        _setLoading(false);
        console.error('Registration network error:', error);
        _showAuthError('Network error. Please check your connection and try again.');
      });
  }

  function logout(callback) {
    AuthCore.logout()
      .then(function() {
        if (callback) callback(null);
      })
      .catch(function(err) {
        if (callback) callback(err.message);
      });
  }

  function _renderValidation(inputEl, containerEl, result, rules) {
    if (!containerEl) return;
    if (!result) {
      containerEl.className = 'login-field-validation';
      containerEl.innerHTML = '';
      if (inputEl) { inputEl.classList.remove('input-error', 'input-valid'); }
      return;
    }

    if (result.valid) {
      containerEl.className = 'login-field-validation active all-valid';
      containerEl.innerHTML = '<span class="val-summary">Looks good</span>';
      if (inputEl) {
        inputEl.classList.remove('input-error');
        inputEl.classList.add('input-valid');
      }
    } else {
      var html = '<ul>';
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        var passed = r.test();
        html += '<li class="' + (passed ? 'val-pass' : 'val-error') + '">' + r.label + '</li>';
      }
      html += '</ul>';
      containerEl.className = 'login-field-validation active';
      containerEl.innerHTML = html;
      if (inputEl) {
        inputEl.classList.remove('input-valid');
        inputEl.classList.add('input-error');
      }
    }
  }

  function _resetFieldValidation(inputEl, containerEl) {
    if (containerEl) {
      containerEl.className = 'login-field-validation';
      containerEl.innerHTML = '';
    }
    if (inputEl) {
      inputEl.classList.remove('input-error', 'input-valid');
    }
  }

  function _validateEmailField() {
    var loginEmail = document.getElementById('loginEmail');
    if (!loginEmail) return;
    var val = loginEmail.value;
    if (!val) {
      loginEmail.classList.remove('input-error', 'input-valid');
      return;
    }
    var valid = typeof AuthValidators !== 'undefined' ? AuthValidators.validateEmail(val) : false;
    if (valid) {
      loginEmail.classList.remove('input-error');
      loginEmail.classList.add('input-valid');
    } else {
      loginEmail.classList.remove('input-valid');
      loginEmail.classList.add('input-error');
    }
  }

  function _validatePasswordField() {
    var loginPassword = document.getElementById('loginPassword');
    var passwordValidationEl = document.getElementById('passwordValidation');
    if (!loginPassword || !passwordValidationEl) return;
    var val = loginPassword.value;
    
    if (!val) {
      _resetFieldValidation(loginPassword, passwordValidationEl);
      return;
    }
    
    if (!_isSignupMode) {
      if (val.length >= 6) {
        loginPassword.classList.remove('input-error');
        loginPassword.classList.add('input-valid');
      } else {
        loginPassword.classList.remove('input-valid');
        loginPassword.classList.add('input-error');
      }
      _resetFieldValidation(null, passwordValidationEl);
      return;
    }

    var result = typeof AuthValidators !== 'undefined' ? AuthValidators.validatePasswordStrength(val) : { valid: true, errors: [] };
    var rules = [
      { label: 'At least 8 characters', test: function () { return val.length >= 8; } },
      { label: 'One uppercase letter', test: function () { return /[A-Z]/.test(val); } },
      { label: 'One lowercase letter', test: function () { return /[a-z]/.test(val); } },
      { label: 'One number', test: function () { return /[0-9]/.test(val); } }
    ];

    _renderValidation(loginPassword, passwordValidationEl, result, rules);
  }

  function _validateCoachingIdField() {
    var loginCoachingId = document.getElementById('loginCoachingId');
    var coachingIdValidationEl = document.getElementById('coachingIdValidation');
    if (!loginCoachingId || !coachingIdValidationEl) return;
    
    var val = loginCoachingId.value.trim();
    if (!val) {
      _resetFieldValidation(loginCoachingId, coachingIdValidationEl);
      return;
    }
    
    if (!_isSignupMode) return;

    if (_coachingDebounce) clearTimeout(_coachingDebounce);
    _coachingDebounce = setTimeout(function() {
      if (!navigator.onLine) return; // skip API validation if offline
      fetch('/api/validate-coaching?id=' + encodeURIComponent(val))
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.valid) {
            coachingIdValidationEl.className = 'login-field-validation active all-valid';
            coachingIdValidationEl.innerHTML = '<span class="val-summary">Valid coaching code</span>';
            loginCoachingId.classList.remove('input-error');
            loginCoachingId.classList.add('input-valid');
          } else {
            coachingIdValidationEl.className = 'login-field-validation active';
            coachingIdValidationEl.innerHTML = '<ul><li class="val-error">Code not found or inactive</li></ul>';
            loginCoachingId.classList.remove('input-valid');
            loginCoachingId.classList.add('input-error');
          }
        })
        .catch(function(err) {
          coachingIdValidationEl.className = 'login-field-validation active';
          coachingIdValidationEl.innerHTML = '<ul><li class="val-error">Could not verify code</li></ul>';
        });
    }, 500);
  }

  function _resetAllValidation() {
    _emailTouched = false;
    _passwordTouched = false;
    if (_emailDebounce) clearTimeout(_emailDebounce);
    if (_passwordDebounce) clearTimeout(_passwordDebounce);
    if (_coachingDebounce) clearTimeout(_coachingDebounce);
    
    var loginEmail = document.getElementById('loginEmail');
    var loginPassword = document.getElementById('loginPassword');
    var loginCoachingId = document.getElementById('loginCoachingId');
    var passwordValidationEl = document.getElementById('passwordValidation');
    var coachingIdValidationEl = document.getElementById('coachingIdValidation');
    
    if (loginEmail) loginEmail.classList.remove('input-error', 'input-valid');
    if (loginCoachingId) loginCoachingId.classList.remove('input-error', 'input-valid');
    _resetFieldValidation(loginPassword, passwordValidationEl);
    _resetFieldValidation(loginCoachingId, coachingIdValidationEl);
  }

  function _handleAuthSubmit() {
    var authSubmitBtn = document.getElementById('authSubmitBtn');
    if (authSubmitBtn && authSubmitBtn.disabled) return;
    
    _hideAuthError();
    
    var loginEmail = document.getElementById('loginEmail');
    var loginPassword = document.getElementById('loginPassword');
    var loginCoachingId = document.getElementById('loginCoachingId');
    
    var email = loginEmail ? loginEmail.value.trim() : '';
    var password = loginPassword ? loginPassword.value : '';
    
    if (!_isSignupMode) {
      /* LOGIN FLOW */
      login(email, password);
    } else {
      /* SIGNUP FLOW */
      var coachingId = loginCoachingId ? loginCoachingId.value.trim() : '';
      
      if (loginCoachingId && loginCoachingId.classList.contains('input-error')) {
        _showAuthError('Please enter a valid coaching code or leave it blank.');
        return;
      }
      
      signup(email, password, coachingId);
    }
  }

  function _bindAuthForm() {
    /* Tab Switching Logic (Event Delegation) */
    document.addEventListener('click', function(e) {
      var tab = e.target.closest('.auth-tab');
      if (!tab) return;
      e.preventDefault();

      var allTabs = document.querySelectorAll('.auth-tab');
      for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
      tab.classList.add('active');

      var mode = tab.getAttribute('data-mode');
      var registerFields = document.getElementById('registerFields');
      var authSubmitBtn = document.getElementById('authSubmitBtn');

      if (mode === 'register') {
        _isSignupMode = true;
        if (registerFields) registerFields.style.display = 'block';
        if (authSubmitBtn) authSubmitBtn.textContent = 'Create Account';
      } else {
        _isSignupMode = false;
        if (registerFields) registerFields.style.display = 'none';
        if (authSubmitBtn) authSubmitBtn.textContent = 'Log In';
      }
      
      _hideAuthError();
      _resetAllValidation();
      _setLoading(false);
    });

    var loginEmail = document.getElementById('loginEmail');
    var loginPassword = document.getElementById('loginPassword');
    var loginCoachingId = document.getElementById('loginCoachingId');
    var authSubmitBtn = document.getElementById('authSubmitBtn');

    if (authSubmitBtn) {
      authSubmitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        _handleAuthSubmit();
      });
    }

    if (loginEmail) {
      loginEmail.addEventListener('blur', function () {
        if (!loginEmail.value) return;
        _emailTouched = true;
        _validateEmailField();
      });
      loginEmail.addEventListener('input', function () {
        if (!_emailTouched) return;
        if (_emailDebounce) clearTimeout(_emailDebounce);
        _emailDebounce = setTimeout(_validateEmailField, 400);
      });
      loginEmail.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (loginPassword) loginPassword.focus();
        }
      });
    }

    if (loginPassword) {
      loginPassword.addEventListener('blur', function () {
        if (!loginPassword.value) return;
        _passwordTouched = true;
        _validatePasswordField();
      });
      loginPassword.addEventListener('input', function () {
        if (!_passwordTouched) return;
        if (_passwordDebounce) clearTimeout(_passwordDebounce);
        _passwordDebounce = setTimeout(_validatePasswordField, 400);
      });
      loginPassword.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (authSubmitBtn) authSubmitBtn.click();
        }
      });
    }

    if (loginCoachingId) {
      loginCoachingId.addEventListener('input', function () {
        _validateCoachingIdField();
      });
    }
  }

  function showAuthScreen() {
    var authScreen = document.getElementById('authScreen');
    var container = document.querySelector('.container');
    var bottomNav = document.querySelector('.bottom-nav');
    
    document.body.classList.remove('auth-resolved');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    
    if (authScreen) authScreen.style.display = 'flex';
    if (container) container.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';
    
    if (typeof Router !== 'undefined' && typeof Router.teardown === 'function') {
      Router.teardown();
    }
    _setLoading(false);
  }

  function showAppShell() {
    var authScreen = document.getElementById('authScreen');
    var container = document.querySelector('.container');
    var bottomNav = document.querySelector('.bottom-nav');
    
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.classList.add('auth-resolved');
    
    if (authScreen) authScreen.style.display = 'none';
    if (container) container.style.display = '';
    if (bottomNav) bottomNav.style.display = '';
  }

  function hideAuthScreen() {
    var authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.style.display = 'none';
  }

  return {
    init: init,
    logout: logout,
    showAuthScreen: showAuthScreen,
    showAppShell: showAppShell,
    hideAuthScreen: hideAuthScreen,
    getCurrentUser: function() { return AuthCore.getCurrentUser(); },
    getUserId: function() { return AuthCore.getCurrentUser() ? AuthCore.getCurrentUser().uid : null; },
    isLoggedIn: function() { return AuthCore.getCurrentUser() !== null; }
  };
})();

