/**
 * identity.js — the authenticated-identity lifecycle (ADR-119).
 *
 * WHY THIS EXISTS
 * ---------------
 * The app previously encoded only "is the app rendered?" (`_currentAppState === 'app'`) and treated that
 * as equivalent to "the correct user's state is loaded". They are NOT equivalent, and the gap produced
 * two HIGH defects: a direct A→B switch skipped the whole hydration transition (so B ran under A's theme,
 * dark-mode and UI language, and a brand-new B never saw onboarding), and teardown diverged between
 * `Auth.logout()` and the switch path (so A's duel listener and view listeners survived into B).
 *
 * This module owns the one thing both bugs lacked: an explicit phase machine over WHICH account the app
 * state currently belongs to.
 *
 *   idle ──sign-in──▶ transitioning(→B) ──teardown A──▶ purge A ──▶ establish B ──hydrate──▶ active(B)
 *    ▲                       │
 *    └──────sign-out─────────┘
 *
 * Two guarantees it provides:
 *
 * 1. DETERMINISTIC OWNERSHIP. `activeUid()` is the uid the rendered app state was built for — never the
 *    uid the Firebase SDK happens to report mid-transition. Callers ask this module, not the SDK, so
 *    there is no window where one subsystem believes A and another believes B.
 *
 * 2. ASYNC IDENTITY CAPTURE. Work that starts under A must not complete as B. Callers `capture()` a
 *    token at kick-off and check `isCurrent(token)` (or wrap with `guard`) before touching state or
 *    submitting anything. A late Firestore callback, retry, timer or queued report belonging to A is
 *    then a no-op instead of a cross-account write. `capture()`/`isCurrent()` compare BOTH uid and a
 *    monotonic generation, so even A→B→A returns a distinct identity and stale work still cannot run.
 *
 * It also owns the single teardown contract (`onTeardown`/`runTeardown`) so every path that changes
 * identity — logout, account switch, deletion, session replacement, forced sign-out — tears down the
 * same set of subsystems. Subsystems register their own cleanup, which is what stops the two lifecycle
 * paths from silently drifting apart again.
 *
 * Dual-export so the check harness executes the real machine rather than a re-implementation.
 */
(function (root) {
  'use strict';

  var PHASE_IDLE = 'idle';
  var PHASE_TRANSITIONING = 'transitioning';
  var PHASE_ACTIVE = 'active';

  var _uid = null;            /* the uid the app state is built for */
  var _phase = PHASE_IDLE;
  var _generation = 0;        /* bumped on EVERY identity change, so A→B→A is three generations */
  var _pendingUid = null;     /* the incoming uid while transitioning */
  var _teardownHooks = [];    /* { name, fn } */

  function phase() { return _phase; }
  function activeUid() { return _phase === PHASE_ACTIVE ? _uid : null; }
  function pendingUid() { return _pendingUid; }
  function generation() { return _generation; }
  function isTransitioning() { return _phase === PHASE_TRANSITIONING; }

  /** True when the app state is fully established for this uid (not mid-transition). */
  function isActive(uid) { return _phase === PHASE_ACTIVE && !!uid && _uid === uid; }

  /**
   * True when `uid` differs from the identity the app state was built for — i.e. a real account
   * boundary that requires the full teardown → purge → hydrate lifecycle, not just a repaint.
   * A same-uid re-notification (token refresh, resume, duplicate observer fire) is NOT a boundary.
   */
  function isAccountBoundary(uid) {
    var target = uid || null;
    return (_uid || null) !== target;
  }

  /**
   * The app-gate decision: given an account boundary, the current app render state and the hydration
   * latch, should the full hydration lifecycle run?
   *
   * This lives here — pure and exported — specifically so the check harness can EXECUTE it. The first
   * version of the ADR-119 fix was verified with a source pattern-match, which passed while the logic
   * was still wrong: `_hydrationStarted` stays true after a successful hydration, so a bare
   * `if (hydrationStarted) return` swallowed every account switch after the first one. A structural
   * assertion cannot see that; an executed truth table can.
   *
   * Invariant: an account boundary ALWAYS hydrates. Only same-account re-notifications may short-circuit.
   *
   * @param {boolean} boundary        - the incoming uid differs from the one the app state was built for
   * @param {string}  appState        - 'initializing' | 'unauthenticated' | 'hydrating' | 'app'
   * @param {boolean} hydrationStarted- the caller's latch
   * @returns {'HYDRATE'|'SKIP'}
   */
  function hydrationDecision(boundary, appState, hydrationStarted) {
    if (boundary) return 'HYDRATE';
    if (appState === 'app') return 'SKIP';
    if (hydrationStarted) return 'SKIP';
    return 'HYDRATE';
  }

  /* ── Async identity capture ─────────────────────────────────────────────────────────────────── */

  /** Snapshot the current identity. Pass the result to isCurrent()/guard() from a later callback. */
  function capture() { return { uid: _uid, generation: _generation }; }

  /** True only if the captured identity is still the active one. Mid-transition always returns false. */
  function isCurrent(token) {
    if (!token) return false;
    return _phase === PHASE_ACTIVE && token.generation === _generation && token.uid === _uid;
  }

  /**
   * Wrap a callback so it runs only while its captured identity is still active. Anything else — a late
   * Firestore snapshot, a retry timer, a queued submission belonging to the previous account — becomes a
   * silent no-op instead of operating on the new account's state.
   */
  function guard(token, fn) {
    return function () {
      if (!isCurrent(token)) return undefined;
      return fn.apply(this, arguments);
    };
  }

  /* ── Teardown contract ─────────────────────────────────────────────────────────────────────── */

  /**
   * Register cleanup that must run whenever the authenticated identity goes away or changes.
   * Registration is idempotent per name, so a re-init cannot stack duplicates.
   */
  function onTeardown(name, fn) {
    if (typeof fn !== 'function' || !name) return;
    for (var i = 0; i < _teardownHooks.length; i++) {
      if (_teardownHooks[i].name === name) { _teardownHooks[i].fn = fn; return; }
    }
    _teardownHooks.push({ name: name, fn: fn });
  }

  /**
   * Run every registered teardown hook. One throwing hook must never prevent the rest from running —
   * a partial teardown is exactly how orphaned listeners survived into the next account.
   * @returns {string[]} names of hooks that threw
   */
  function runTeardown() {
    var failed = [];
    for (var i = 0; i < _teardownHooks.length; i++) {
      try { _teardownHooks[i].fn(); }
      catch (e) {
        failed.push(_teardownHooks[i].name);
        try { console.warn('[QRIdentity] teardown hook failed: ' + _teardownHooks[i].name, e); } catch (_) {}
      }
    }
    return failed;
  }

  function teardownHookNames() {
    var out = [];
    for (var i = 0; i < _teardownHooks.length; i++) out.push(_teardownHooks[i].name);
    return out;
  }

  /* ── Phase transitions ─────────────────────────────────────────────────────────────────────── */

  /**
   * Enter the transition to `toUid` (null = signing out). Bumps the generation FIRST so every
   * previously captured token is invalidated before any teardown or purge work begins — that ordering
   * is what makes in-flight A work inert rather than racing the purge.
   * @returns {number} the new generation
   */
  function beginTransition(toUid) {
    _generation++;
    _phase = PHASE_TRANSITIONING;
    _pendingUid = toUid || null;
    return _generation;
  }

  /** Establish `uid` as the identity the app state is now built for. */
  function completeTransition(uid) {
    _uid = uid || null;
    _pendingUid = null;
    _phase = _uid ? PHASE_ACTIVE : PHASE_IDLE;
    return _generation;
  }

  /** Signed out: no identity owns the app state. Generation is bumped so A's work cannot resume. */
  function clear() {
    _generation++;
    _uid = null;
    _pendingUid = null;
    _phase = PHASE_IDLE;
    return _generation;
  }

  /** Test-only: return to a pristine machine (also drops teardown hooks). */
  function _reset() {
    _uid = null; _pendingUid = null; _phase = PHASE_IDLE; _generation = 0; _teardownHooks = [];
  }

  var API = {
    PHASE_IDLE: PHASE_IDLE,
    PHASE_TRANSITIONING: PHASE_TRANSITIONING,
    PHASE_ACTIVE: PHASE_ACTIVE,
    phase: phase,
    activeUid: activeUid,
    pendingUid: pendingUid,
    generation: generation,
    isTransitioning: isTransitioning,
    isActive: isActive,
    isAccountBoundary: isAccountBoundary,
    hydrationDecision: hydrationDecision,
    capture: capture,
    isCurrent: isCurrent,
    guard: guard,
    onTeardown: onTeardown,
    runTeardown: runTeardown,
    teardownHookNames: teardownHookNames,
    beginTransition: beginTransition,
    completeTransition: completeTransition,
    clear: clear,
    _reset: _reset
  };

  root.QRIdentity = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof self !== 'undefined' ? self : this);
