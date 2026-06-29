/**
 * session.js — single-active-device session identity (ADR-072).
 *
 * Goal: one active login per account at a time (newest login wins). This module owns a STABLE per-device/browser
 * session id (in localStorage, shared across tabs of the same origin) and the small client side of the protocol:
 *
 *   - id()            : the stable session id for this device (lazily created once).
 *   - header()        : { 'X-Session-Id': id } — attached to EVERY authenticated request so the active device's
 *                       own calls always match the server-stored activeSessionId (a missing header would 409 the
 *                       legitimate active user).
 *   - claim(getToken) : POST /api/session?action=claim → server sets users/{uid}.activeSessionId = this id, which
 *                       DISPLACES any other device. Called once per genuine login (see auth.js), not on resume.
 *   - hasClaimed/markClaimed/clearClaim : track which uid this device has already claimed for, so resume doesn't
 *                       re-claim (re-claiming on resume would wrongly displace whoever logged in last).
 *   - onReplaced()    : invoked when this device is detected as displaced (server 409 SESSION_REPLACED, or the
 *                       firestore-sync listener sees activeSessionId change) → graceful sign-out + a one-time banner.
 *
 * Security: the id is NOT a credential — it only selects which authenticated session is active. activeSessionId is
 * written ONLY by the Admin SDK (server) and Firestore rules deny any client write, so it can't be forged or stolen.
 * Multi-tab on the same device shares one id (localStorage), so tabs never evict each other.
 */
var Session = (function () {
  var ID_KEY = 'qr_session_id';
  var UID_KEY = 'qr_session_uid';      // the uid this device last claimed a session for
  var REPLACED_KEY = 'qr_session_replaced';
  var _displacing = false;

  function _rand() {
    try { if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (_) {}
    return 'sid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function id() {
    var v = null;
    try { v = localStorage.getItem(ID_KEY); } catch (_) {}
    if (!v) { v = _rand(); try { localStorage.setItem(ID_KEY, v); } catch (_) {} }
    return v;
  }

  function header() {
    var h = {};
    try { var v = id(); if (v) h['X-Session-Id'] = v; } catch (_) {}
    return h;
  }

  function hasClaimed(uid) {
    try { return !!uid && localStorage.getItem(UID_KEY) === uid; } catch (_) { return false; }
  }
  function markClaimed(uid) {
    try { if (uid) localStorage.setItem(UID_KEY, uid); } catch (_) {}
  }
  function clearClaim() {
    try { localStorage.removeItem(UID_KEY); } catch (_) {}
  }

  /* Claim THIS device as the active session for the signed-in user. getTokenFn → Promise<idToken>. Resolves to
     true on success. Best-effort: a failed claim doesn't block the app (the server simply won't enforce until a
     session is claimed), but we don't markClaimed on failure so the next auth cycle retries. */
  function claim(getTokenFn) {
    return Promise.resolve().then(getTokenFn).then(function (token) {
      if (!token) return false;
      return fetch('/api/session?action=claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Session-Id': id() },
        body: JSON.stringify({ sessionId: id() })
      }).then(function (r) { return !!r && r.ok; });
    }).catch(function () { return false; });
  }

  /* This device was displaced (another login won). Sign out once and flag a friendly banner for the login screen. */
  function onReplaced() {
    if (_displacing) return;
    _displacing = true;
    try { localStorage.setItem(REPLACED_KEY, '1'); } catch (_) {}
    clearClaim();
    try {
      if (window.Auth && typeof Auth.logout === 'function') { Auth.logout(); return; }
    } catch (_) {}
    try { location.reload(); } catch (_) {}
  }

  /* True (once) if the last sign-out was caused by displacement — the login screen shows the explanatory banner. */
  function consumeReplacedFlag() {
    var f = null;
    try { f = localStorage.getItem(REPLACED_KEY); localStorage.removeItem(REPLACED_KEY); } catch (_) {}
    return f === '1';
  }

  return {
    id: id, header: header, claim: claim,
    hasClaimed: hasClaimed, markClaimed: markClaimed, clearClaim: clearClaim,
    onReplaced: onReplaced, consumeReplacedFlag: consumeReplacedFlag
  };
})();
if (typeof window !== 'undefined') window.Session = Session;
