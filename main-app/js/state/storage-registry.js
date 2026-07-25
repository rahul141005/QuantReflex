/**
 * storage-registry.js — the ownership model for every persisted client key (ADR-119).
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this module, `AppState.clearAll()` purged a hand-maintained list of 8 key names while a dozen
 * modules invented their own keys independently. Adding a key required no lifecycle decision, so the
 * default outcome of forgetting was that user A's state SURVIVED into user B's session — 15 live keys
 * leaked that way (target exam, free-hint credits, best scores, queued reports, AI seen-state, …).
 *
 * The fix is to invert the default. Purge is now PREFIX-driven with an explicit survivor allow-list:
 * anything under an app prefix is user-scoped unless it is declared here as device/installation state.
 * Forgetting to register a new key now means it is PURGED on an account change (safe) rather than
 * inherited (unsafe). A key can only survive an account boundary by someone deliberately naming it.
 *
 * OWNERSHIP CATEGORIES
 *   'user'         — belongs to the signed-in account. MUST NOT cross an account boundary.
 *   'device'       — belongs to this browser/device, deliberately spans accounts.
 *   'installation' — belongs to this app install (update/feature-flag state), spans accounts.
 *   'user-deferred'— user-owned but uid-TAGGED and guarded at read time; survives so the outgoing
 *                    user does not lose unflushed work, and can never be replayed for anyone else.
 *   'foreign'      — not ours (another app on the same origin); never touched.
 *
 * Applies to BOTH localStorage and sessionStorage — `purgeUserScoped(area)` takes any Storage, and
 * AppState.clearAll() sweeps both (ADR-120).
 *
 * Dual-export (the `data/statMath.js` pattern) so the check harness can execute the real classifier
 * instead of re-implementing it.
 */
(function (root) {
  'use strict';

  /* Every key we own lives under one of these prefixes. `quant_` is the pre-migration generation. */
  var APP_PREFIXES = ['qr_', 'quant_'];

  /* Exact keys we own that predate the prefix convention. */
  var EXTRA_USER_KEYS = ['premiumStatus'];

  /* ── Survivors. Everything here is deliberate; anything absent is user-scoped and gets purged. ── */

  var DEVICE_SCOPED = [
    'qr_session_id',        /* ADR-072 stable per-device session id — selects WHICH session is active,
                               is not a credential, and must be stable across accounts on this device. */
    'qr_session_uid',       /* which uid this device last claimed for; overwritten per login. Clearing it
                               would make every resume re-claim and wrongly displace the newest login. */
    'qr_session_replaced',  /* one-shot "you were signed out elsewhere" banner flag, consumed on the
                               login screen — i.e. read AFTER the account boundary, so it must survive. */
    'qr_last_uid'           /* defence-in-depth marker of the last uid seen; a purge target would defeat
                               its only purpose (detecting that the uid changed). */
  ];

  var INSTALLATION_SCOPED = [
    'qr_i18n_preview',      /* emergency/dev locale override, read once at boot (i18n.js). */
    'qr_appUpdating'        /* update-manager one-shot "we just applied an update" flag. */
  ];

  var INSTALLATION_PREFIXES = [
    'qr_update_'            /* update-manager per-day dedup stamps. */
  ];

  /* Per-uid durable write buffers (ADR-119): 'qr_pending_writes_<uid>'. */
  var USER_DEFERRED_PREFIXES = ['qr_pending_writes_'];

  var USER_DEFERRED = [
    'qr_pending_writes'     /* S3-FS2 durable offline write buffer. Tagged with its owner's uid and
                               replayed only when parsed.uid === the loading user (_replayPendingBuffer),
                               so it can never reach another account. Purging it here would DESTROY the
                               outgoing user's unflushed work — the exact loss this wave exists to stop. */
  ];

  function _has(list, key) {
    for (var i = 0; i < list.length; i++) { if (list[i] === key) return true; }
    return false;
  }
  function _hasPrefix(list, key) {
    for (var i = 0; i < list.length; i++) { if (key.indexOf(list[i]) === 0) return true; }
    return false;
  }

  /**
   * Ownership of a single key.
   * @param {string} key
   * @returns {'user'|'device'|'installation'|'user-deferred'|'foreign'}
   */
  function classify(key) {
    if (typeof key !== 'string' || !key) return 'foreign';
    if (_has(DEVICE_SCOPED, key)) return 'device';
    if (_has(INSTALLATION_SCOPED, key) || _hasPrefix(INSTALLATION_PREFIXES, key)) return 'installation';
    if (_has(USER_DEFERRED, key) || _hasPrefix(USER_DEFERRED_PREFIXES, key)) return 'user-deferred';
    if (_has(EXTRA_USER_KEYS, key)) return 'user';
    if (_hasPrefix(APP_PREFIXES, key)) return 'user';   /* ← the fail-safe default */
    return 'foreign';
  }

  /** True when this key must not survive an account change. */
  function isUserScoped(key) { return classify(key) === 'user'; }

  /** Enumerate the live user-scoped keys currently in a storage area (defaults to localStorage). */
  function userScopedKeys(storage) {
    var s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var out = [];
    if (!s) return out;
    try {
      for (var i = 0; i < s.length; i++) {
        var k = s.key(i);
        if (k && isUserScoped(k)) out.push(k);
      }
    } catch (_) { /* storage disabled — nothing to purge */ }
    return out;
  }

  /**
   * Remove every user-scoped key. Device/installation/user-deferred state is preserved by construction.
   * Collect first, then delete: mutating during iteration skips entries.
   * @returns {string[]} the keys removed (used by the behavioural check)
   */
  function purgeUserScoped(storage) {
    var s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var keys = userScopedKeys(s);
    if (!s) return keys;
    for (var i = 0; i < keys.length; i++) {
      try { s.removeItem(keys[i]); } catch (_) { /* best-effort */ }
    }
    return keys;
  }

  var API = {
    APP_PREFIXES: APP_PREFIXES,
    EXTRA_USER_KEYS: EXTRA_USER_KEYS,
    DEVICE_SCOPED: DEVICE_SCOPED,
    INSTALLATION_SCOPED: INSTALLATION_SCOPED,
    INSTALLATION_PREFIXES: INSTALLATION_PREFIXES,
    USER_DEFERRED: USER_DEFERRED,
    USER_DEFERRED_PREFIXES: USER_DEFERRED_PREFIXES,
    classify: classify,
    isUserScoped: isUserScoped,
    userScopedKeys: userScopedKeys,
    purgeUserScoped: purgeUserScoped
  };

  root.QRStorage = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof self !== 'undefined' ? self : this);
