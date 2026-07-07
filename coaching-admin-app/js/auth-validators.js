/**
 * auth-validators.js — Centralized authentication validation logic (coaching-admin LOCAL copy, ADR-099/107).
 *
 * Ensures validation rules (email format, password strength) stay consistent across the Main App, Super Admin App,
 * and Coaching Admin App. This is the canonical `shared/validation/auth-validators.js` duplicated into the
 * coaching-admin origin.
 *
 * WHY A LOCAL COPY (ADR-099): the coaching app deploys rooted at `coaching-admin-app/`; `shared/` is a sibling
 * OUTSIDE that deploy root, so `<script src="../shared/validation/auth-validators.js">` resolved through the SPA
 * catch-all rewrite and returned index.html → SyntaxError → `AuthValidators` stayed undefined in production. Because
 * `auth.js` guards `typeof AuthValidators !== 'undefined'`, client-side signup email/password validation was
 * SILENTLY skipped (the same class of bug main-app fixed). Serving it same-origin restores it. Keep this
 * byte-for-byte in sync with `shared/validation/auth-validators.js` — enforced by
 * `main-app/scripts/auth-validators.check.js`.
 */

var AuthValidators = (function () {
  'use strict';

  /**
   * Validate email format
   * @param {string} email
   * @returns {boolean}
   */
  function validateEmail(email) {
    if (!email) return false;
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase().trim());
  }

  /**
   * Granular password validation for realtime UX feedback (signup rules).
   * Returns all applicable errors at once for checklist-style display.
   * @param {string} password - raw password
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validatePasswordStrength(password) {
    var p = password || '';
    var rules = [
      { label: 'At least 8 characters', passed: p.length >= 8 },
      { label: 'One uppercase letter', passed: /[A-Z]/.test(p) },
      { label: 'One lowercase letter', passed: /[a-z]/.test(p) },
      { label: 'One number', passed: /[0-9]/.test(p) }
    ];

    var valid = true;
    var errors = [];

    for (var i = 0; i < rules.length; i++) {
      if (!rules[i].passed) {
        valid = false;
        errors.push(rules[i].label);
      }
    }

    return { valid: valid, errors: errors, rules: rules };
  }

  /**
   * Validate login inputs
   * @param {string} email
   * @param {string} password
   * @returns {string|null} Error message or null if valid
   */
  function validateLogin(email, password) {
    if (!email || !validateEmail(email)) {
      return 'Please enter a valid email address.';
    }
    if (!password || password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    return null;
  }

  /**
   * Validate signup inputs
   * @param {string} email
   * @param {string} password
   * @returns {string|null} Error message or null if valid
   */
  function validateSignup(email, password) {
    if (!email || !validateEmail(email)) {
      return 'Please enter a valid email address.';
    }

    var pwdValid = validatePasswordStrength(password);
    if (!pwdValid.valid) {
      return 'Password does not meet requirements.';
    }

    return null;
  }

  return {
    validateEmail: validateEmail,
    validatePasswordStrength: validatePasswordStrength,
    validateLogin: validateLogin,
    validateSignup: validateSignup
  };
})();
