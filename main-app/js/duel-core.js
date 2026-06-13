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
  function createDuel(config, name) { return api('create', { config: config, name: name }); }
  function joinDuel(code, name) { return api('join', { code: code, name: name }); }
  function editConfig(code, config) { return api('editConfig', { code: code, config: config }); }
  function startDuel(code) { return api('start', { code: code }); }
  function finishDuel(code, reason) { return api('finish', { code: code, finishReason: reason }); }
  function fetchState(code) { return api('state', { code: code }); }
  function ackResult(code) { return api('ackResult', { code: code }).catch(function () {}); }
  function abandonDuel(code) { return api('abandon', { code: code }); }

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

  /** Persist one answer to the player's own doc (merge → no clobber). Allowed only while solving (rules). */
  function writeAnswer(code, index, value, clientMs) {
    var uid = _uid(); if (!uid || !code) return Promise.resolve();
    var answers = {}; answers[String(index)] = { value: value == null ? '' : String(value), clientMs: clientMs || 0 };
    return _db().collection(DUELS).doc(code).collection('players').doc(uid)
      .set({ answers: answers }, { merge: true })
      .catch(function (e) { console.warn('[Duel] answer write failed:', e && e.message); });
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

  /* ── Recovery from the server mirror (no localStorage dependency) ── */

  /**
   * Find the user's active duel for recovery. Primary: users/{uid}.activeDuelId. Fallback: a participant
   * query (the declared (participantUids array-contains, status) index). Returns the endpoint `state`
   * payload ({code, duel, my}) or null. Recovery only ever lands on waiting/results — never solving.
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
        return fetchState(code)
          .then(function (res) { return { code: code, duel: res.duel, my: res.my, serverNow: res.serverNow }; })
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
    abandonDuel: abandonDuel,
    setPresence: setPresence,
    heartbeat: heartbeat,
    writeAnswer: writeAnswer,
    listen: listen,
    stopListening: stopListening,
    recover: recover,
    getMyUid: getMyUid
  };
})();
