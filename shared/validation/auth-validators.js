/**
 * auth-validators.js — Centralized authentication validation logic
 *
 * Ensures validation rules (email format, password strength) are completely
 * consistent across the Main App, Super Admin App, and Coaching Admin App.
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
    var errors = [];
    if (!password || password.length < 8) {
      errors.push('At least 8 characters.');
    }
    if (password && password.length >= 1 && !/[A-Z]/.test(password)) {
      errors.push('At least one uppercase letter.');
    }
    if (password && password.length >= 1 && !/[a-z]/.test(password)) {
      errors.push('At least one lowercase letter.');
    }
    if (password && password.length >= 1 && !/[0-9]/.test(password)) {
      errors.push('At least one number.');
    }
    return { valid: errors.length === 0, errors: errors };
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
