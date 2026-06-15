/**
 * duel-core.js — Duel V2 client data layer (ADR-031). Server-authoritative.
 *
 * This is a THIN client over the `api/duel` endpoint (which is the only authority for questions, the
 * answer key, grading, the winner, status, and history) plus two narrow client-SDK writes the rules allow:
 *   1. own presence  (duels/{code}.presence.{uid}.{state,lastSeenAt})  — ready / solving / heartbeat
 *   2. own answers    (duels/{code}/players/{uid}.answers.{index})       — persisted per-answer while solving
 * It also owns the room onSnapshot listener and server-mirror recovery (users/{uid}.activeDuelId).
 *
 * There is NO resume / rejoin / continue-after-exit here — exit is a finalized submission (see DuelManager).
 */
var DuelCore = (function () {
  'use strict';

  var DUELS = 'duels';
  var _listener = null;

  /* ── Durable acknowledgement ledger — the on-device "I've finished/dismissed this duel" record ──
   * ROOT-CAUSE FIX (ADR-044): a finished duel must NEVER resurrect once the user taps Finish, even if the
   * server mirror-clear (ackResult endpoint) never lands — offline, flaky network, or the app closed mid-request.
   * users/{uid}.activeDuelId stays the cross-device source of truth; this localStorage tombstone is the on-device
   * durability backstop that recovery consults. It survives refresh, PWA restart, browser/device restart, and SW
   * updates (localStorage is independent of the SW cache). Bounded + FIFO so it can never grow unbounded. */
  var ACK_KEY = 'qr_duel_acked';
  var ACK_MAX = 30;
  function _ackList() { try { var v = JSON.parse(localStorage.getItem(ACK_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function _isAcked(code) { return !!code && _ackList().indexOf(String(code).toUpperCase()) >= 0; }
  function _markAcked(code) {
    if (!code) return; code = String(code).toUpperCase();
    try { var l = _ackList().filter(function (c) { return c !== code; }); l.push(code); while (l.length > ACK_MAX) l.shift(); localStorage.setItem(ACK_KEY, JSON.stringify(l)); } catch (_) {}
  }
  function _unmarkAcked(code) {
    if (!code) return; code = String(code).toUpperCase();
    try { localStorage.setItem(ACK_KEY, JSON.stringify(_ackList().filter(function (c) { return c !== code; }))); } catch (_) {}
  }

  function _db() { return firebase.firestore(); }
  function _uid() {
    if (typeof Auth !== 'undefined' && Auth.getUserId) return Auth.getUserId();
    if (typeof FirebaseApp !== 'undefined' && FirebaseApp.getUserId) return FirebaseApp.getUserId();
    var u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    return u ? u.uid : null;
  }

  /* ── Authenticated endpoint call ── */
  function api(action, body) {
    return Promise.resolve()
      .then(function () {
        if (typeof Auth !== 'undefined' && Auth.getIdToken) return Auth.getIdToken();
        var u = firebase.auth().currentUser;
        if (!u) throw new Error('Not signed in.');
        return u.getIdToken();
      })
      .then(function (token) {
        return fetch('/api/duel?action=' + encodeURIComponent(action), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(body || {})
        });
      })
      .then(function (resp) {
        return resp.json().catch(function () { throw new Error('Unexpected server response.'); })
          .then(function (data) {
            if (!resp.ok) {
              var msg = (data && data.error && data.error.message) || 'Request failed';
              var err = new Error(msg);
              err.code = (data && data.error && data.error.code) || null;
              err.payload = data;
              throw err;
            }
            return data;
          });
      });
  }

  /* ── Endpoint actions (thin wrappers) ── */
  function createDuel(config, name) { return api('create', { config: config, name: name }).then(function (res) { if (res && res.code) _unmarkAcked(res.code); return res; }); }
  function joinDuel(code, name) { return api('join', { code: code, name: name }).then(function (res) { _unmarkAcked(code); return res; }); }
  function editConfig(code, config) { return api('editConfig', { code: code, config: config }); }
  function startDuel(code) { return api('start', { code: code }); }
  function finishDuel(code, reason) { return api('finish', { code: code, finishReason: reason }); }
  function fetchState(code) { return api('state', { code: code }); }
  function ackResult(code) {
    // Record the DURABLE on-device acknowledgement FIRST and synchronously (ADR-044): a finished duel can never
    // resurrect even if the server mirror-clear below never lands (offline / flaky / app closed mid-request).
    _markAcked(code);
    // Then best-effort clear the server mirror (retry ONCE) so other devices + the authoritative state converge
    // (audit home-history-04 / arch-statemachine-07).
    return api('ackResult', { code: code }).catch(function () {
      return new Promise(function (r) { setTimeout(r, 1200); }).then(function () { return api('ackResult', { code: code }); }).catch(function () {});
    });
  }
  function abandonDuel(code) { return api('abandon', { code: code }); }
  function leaveLobby(code) { return api('leaveLobby', { code: code }); }   // guest leaves the lobby cleanly (server removes them)

  /* ── Narrow client-SDK writes (rules-allowed) ── */

  /** Set own presence state (joined|ready|solving) + bump lastSeenAt. Dotted paths → only own sub-fields. */
  function setPresence(code, state) {
    var uid = _uid(); if (!uid || !code) return Promise.resolve();
    var upd = {}; upd['presence.' + uid + '.lastSeenAt'] = Date.now();
    if (state) upd['presence.' + uid + '.state'] = state;
    return _db().collection(DUELS).doc(code).update(upd).catch(function (e) { console.warn('[Duel] presence write failed:', e && e.message); });
  }

  /** Heartbeat (lastSeenAt only) — used while solving so the opponent's "Reconnecting…" chip is accurate. */
  function heartbeat(code) {
    var uid = _uid(); if (!uid || !code) return Promise.resolve();
    var upd = {}; upd['presence.' + uid + '.lastSeenAt'] = Date.now();
    return _db().collection(DUELS).doc(code).update(upd).catch(function () { /* transient — ignore */ });
  }

  /** Persist one answer to the player's own doc (merge → no clobber). Allowed only while solving (rules).
   *  Returns the write promise. On PERMISSION_DENIED (the presence='solving' precondition hadn't propagated yet,
   *  audit solving-exit-forfeit-03), re-assert presence and retry ONCE so a first-answer race self-heals instead
   *  of silently dropping the answer. */
  /* ADR-064: read the caller's OWN graded result + per-question review post-match (one read; rules allow a player
     to read their own players doc anytime). Used when results open via the waiting/listener path (no finish resp). */
  function fetchMyResult(code) {
    var uid = _uid(); if (!uid || !code) return Promise.resolve(null);
    return _db().collection(DUELS).doc(code).collection('players').doc(uid).get()
      .then(function (s) { return s.exists ? { result: s.data().result || null, review: s.data().review || null } : null; })
      .catch(function () { return null; });
  }

  function writeAnswer(code, index, value, clientMs) {
    var uid = _uid(); if (!uid || !code) return Promise.resolve();
    var answers = {}; answers[String(index)] = { value: value == null ? '' : String(value), clientMs: clientMs || 0 };
    var ref = _db().collection(DUELS).doc(code).collection('players').doc(uid);
    function doWrite() { return ref.set({ answers: answers }, { merge: true }); }
    function isPermDenied(e) { return e && (e.code === 'permission-denied' || /permission|denied/i.test(e.message || '')); }
    return doWrite().catch(function (e) {
      if (isPermDenied(e)) {
        return setPresence(code, 'solving')
          .then(function () { return new Promise(function (r) { setTimeout(r, 350); }); })
          .then(doWrite)
          .catch(function (e2) { console.warn('[Duel] answer write failed (after retry):', e2 && e2.message); });
      }
      console.warn('[Duel] answer write failed:', e && e.message);
    });
  }

  /* ── Realtime room listener ── */
  function listen(code, cb) {
    stopListening();
    if (!code) return;
    _listener = _db().collection(DUELS).doc(code).onSnapshot(
      function (snap) {
        if (!snap.exists) { cb({ removed: true }); return; }
        cb({ data: snap.data() });
      },
      function (err) { cb({ error: err && err.message ? err.message : 'listener error' }); }
    );
  }
  function stopListening() { if (_listener) { try { _listener(); } catch (_) {} _listener = null; } }

  /* ── Recovery from the server mirror, gated by the durable ack ledger ── */

  /**
   * Find the user's active duel for recovery. Primary: users/{uid}.activeDuelId. Fallback: a participant
   * query (the declared (participantUids array-contains, status) index). Returns the endpoint `state`
   * payload ({code, duel, my}) or null. Recovery only ever lands on waiting/results — never solving.
   *
   * RESURRECTION GUARD (ADR-044): a duel this device has already finished/dismissed (in the ack ledger) is
   * TERMINAL and is never returned — so a finished duel can never reappear after restart, even if its server
   * mirror-clear failed offline. Dead rooms (abandoned/expired) are likewise dropped. A 'complete' room that is
   * NOT yet acked still surfaces (the opponent may not have viewed the result yet) — per-user, as designed.
   */
  function recover() {
    var uid = _uid();
    if (!uid) return Promise.resolve(null);
    return _db().collection('users').doc(uid).get()
      .then(function (snap) {
        var id = snap.exists ? snap.data().activeDuelId : null;
        if (id) return id;
        // Fallback: query my in-flight rooms (belt-and-suspenders if the mirror was lost).
        return _db().collection(DUELS).where('participantUids', 'array-contains', uid)
          .where('status', 'in', ['lobby', 'active']).limit(1).get()
          .then(function (q) { return q.empty ? null : q.docs[0].id; })
          .catch(function () { return null; });
      })
      .then(function (code) {
        if (!code) return null;
        // Already acknowledged on this device → terminal. Never resurrect; self-heal the server mirror
        // (its earlier clear may have failed offline) and forget.
        if (_isAcked(code)) { ackResult(code); return null; }
        return fetchState(code)
          .then(function (res) {
            var st = res && res.duel && res.duel.status;
            // Dead rooms never resume: clear the stale mirror (also tombstones the code) and forget.
            if (st === 'abandoned' || st === 'expired') { ackResult(code); return null; }
            return { code: code, duel: res.duel, my: res.my, serverNow: res.serverNow };
          })
          .catch(function () { return null; });   // stale/foreign/complete-and-gone → no recovery
      });
  }

  function getMyUid() { return _uid(); }

  return {
    api: api,
    createDuel: createDuel,
    joinDuel: joinDuel,
    editConfig: editConfig,
    startDuel: startDuel,
    finishDuel: finishDuel,
    fetchState: fetchState,
    fetchMyResult: fetchMyResult,
    ackResult: ackResult,
    abandonDuel: abandonDuel,
    leaveLobby: leaveLobby,
    setPresence: setPresence,
    heartbeat: heartbeat,
    writeAnswer: writeAnswer,
    listen: listen,
    stopListening: stopListening,
    recover: recover,
    getMyUid: getMyUid
  };
})();
