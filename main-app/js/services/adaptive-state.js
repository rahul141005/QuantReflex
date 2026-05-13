/**
 * adaptive-state.js — Encapsulated adaptive difficulty state
 *
 * Replaces direct window._adaptiveOverrideDifficulty and
 * window._sessionAdaptivePattern global mutations with a
 * controlled accessor module.
 *
 * This prevents accidental global state collisions and makes
 * the adaptive system's state boundaries explicit.
 *
 * Backward compatible: still exposes values on window.* for
 * any legacy code paths, but all NEW access should go through
 * AdaptiveState.getDifficulty() / .setDifficulty() etc.
 */

var AdaptiveState = (function () {
  'use strict';

  var _difficulty = null;    /* 'easy' | 'medium' | 'hard' | null */
  var _pattern = null;       /* { type, logic[] } | null */

  /**
   * Set the adaptive difficulty override.
   * @param {string|null} diff - 'easy', 'medium', 'hard', or null to clear
   */
  function setDifficulty(diff) {
    _difficulty = diff;
    /* Backward compat: keep window global in sync for legacy readers */
    window._adaptiveOverrideDifficulty = diff;
  }

  /**
   * Get the current adaptive difficulty override.
   * @returns {string|null}
   */
  function getDifficulty() {
    return _difficulty;
  }

  /**
   * Clear the adaptive difficulty override.
   */
  function clearDifficulty() {
    _difficulty = null;
    window._adaptiveOverrideDifficulty = null;
  }

  /**
   * Set the session adaptive pattern (AI-generated hint).
   * @param {object|null} pattern - { type, logic[] } or null
   */
  function setPattern(pattern) {
    _pattern = pattern;
    window._sessionAdaptivePattern = pattern;
  }

  /**
   * Get the current session adaptive pattern.
   * @returns {object|null}
   */
  function getPattern() {
    return _pattern;
  }

  /**
   * Clear all adaptive state (difficulty + pattern).
   * Call this at session end.
   */
  function clearAll() {
    clearDifficulty();
    _pattern = null;
    window._sessionAdaptivePattern = null;
  }

  return {
    setDifficulty: setDifficulty,
    getDifficulty: getDifficulty,
    clearDifficulty: clearDifficulty,
    setPattern: setPattern,
    getPattern: getPattern,
    clearAll: clearAll
  };
})();
