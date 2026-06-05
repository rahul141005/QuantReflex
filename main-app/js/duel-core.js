/**
 * duel-core.js — Math Duel Firestore operations & question generation (V3)
 *
 * Room-code-only duel system:
 *   - No invitation system, no publicUsernames, no username lookup
 *   - Clean 5-state lifecycle: waiting → active → completed / abandoned / expired / cancelled
 *   - Independent exit handling (player exits without killing opponent)
 *   - Reconnection support
 *   - Duplicate submission guards
 *   - Realtime result synchronization
 *
 * Premium+ gated — all operations require isPremiumPlus === true.
 */

var DuelCore = (function () {
  'use strict';

  var DUEL_EXPIRY_MS = 30 * 60 * 1000; /* 30 minutes */
  var DUEL_COLLECTION = 'duels';
  var _activeListener = null;
  var _listenerTimeout = null;

  /* ---- Helpers ---- */

  function _generateDuelId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var id = '';
    for (var i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }



  function _getDisplayName() {
    try {
      var s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
      if (s && s.profile && s.profile.name) return s.profile.name;
    } catch (_) {}
    try {
      var p = (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getProfile === 'function')
        ? FirestoreSync.getProfile() : null;
      if (p && p.name) return p.name;
    } catch (_) {}
    /* Fallback: email prefix */
    try {
      var user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
      if (user && user.email) return user.email.split('@')[0];
    } catch (_) {}
    return 'Player';
  }

  function _isPremiumPlus() {
    return (typeof canAccessFeature === 'function') && canAccessFeature('math_duel');
  }

  function _isExpired(duel) {
    if (!duel) return true;
    /* If createdAt is null (pending serverTimestamp), the duel is brand new, not expired. */
    if (!duel.createdAt) return false;
    var createdMs = duel.createdAt.toDate ? duel.createdAt.toDate().getTime() : 0;
    if (createdMs === 0) return false;
    return (Date.now() - createdMs) > DUEL_EXPIRY_MS;
  }

  function _serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  /* ---- Seeded PRNG for deterministic question generation ---- */

  function _seedHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function _seededRandom(seed) {
    var s = seed;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /* ---- Question Generation ---- */

  /**
   * Generate questions using the existing generateQuestion() engine.
   * Uses a seeded PRNG based on duelId for deterministic output.
   */
  function _generateQuickQuestions(config, duelId) {
    var questions = [];
    var count = config.questionCount || 10;
    var rng = _seededRandom(_seedHash(duelId));

    if (typeof generateQuestion !== 'function') return questions;

    var topics = config.topics && config.topics.length > 0 ? config.topics : null;
    var diff = config.difficulty || 'medium';

    for (var i = 0; i < count; i++) {
      var cat = topics ? topics[Math.floor(rng() * topics.length)] : null;
      var q = generateQuestion(cat, diff);
      if (q) {
        questions.push({
          text: q.question || q.text || '',
          answer: q.answer,
          category: q.category || cat || 'mixed',
          index: i
        });
      }
    }
    return questions;
  }

  /* ================================================================
   * DUEL ROOM OPERATIONS
   * ================================================================ */

  /**
   * Create a new duel room.
   * Returns a room code that can be shared with the opponent.
   */
  function createDuel(config, callback) {
    console.log('[DUEL TRACE] createDuel initiated');
    var db = FirebaseApp.getDb();
    var uid = FirebaseApp.getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }

    var duelId = _generateDuelId();
    var questions = [];

    if (config.questionMode === 'wordproblems') {
      if (typeof QuestionBankService !== 'undefined' && typeof QuestionBankService.fetchQuestions === 'function') {
        QuestionBankService.fetchQuestions({
          category: config.topics && config.topics.length === 1 ? config.topics[0] : null,
          difficulty: config.difficulty || 'medium',
          count: config.questionCount || 10
        }, function (err, fetchedQuestions) {
          if (err || !fetchedQuestions || fetchedQuestions.length === 0) {
            config.questionMode = 'quick';
            questions = _generateQuickQuestions(config, duelId);
            _writeDuelDoc(db, duelId, uid, config, questions, callback);
          } else {
            var questionIds = [];
            fetchedQuestions.forEach(function (q) {
              questionIds.push(q.id || String(Math.random()));
            });
            _writeDuelDoc(db, duelId, uid, config, [], questionIds, callback);
          }
        });
        return;
      }
      questions = _generateQuickQuestions(config, duelId);
    } else {
      questions = _generateQuickQuestions(config, duelId);
    }

    console.log('[DUEL TRACE] createDuel writing document', duelId);
    _writeDuelDoc(db, duelId, uid, config, questions, callback);
  }

  function _writeDuelDoc(db, duelId, uid, config, questions, questionIds, callback) {
    if (typeof questionIds === 'function') {
      callback = questionIds;
      questionIds = [];
    }
    var displayName = _getDisplayName();
    var participants = {};
    participants[uid] = {
      name: displayName,
      joinedAt: _serverTimestamp(),
      status: 'joined',
      answers: [],
      score: 0,
      totalTime: 0
    };

    var duelDoc = {
      id: duelId,
      createdBy: uid,
      createdByName: displayName,
      status: 'waiting',
      createdAt: _serverTimestamp(),
      config: {
        topics: config.topics || [],
        difficulty: config.difficulty || 'medium',
        questionCount: config.questionCount || 10,
        questionMode: config.questionMode || 'quick',
        timerPerQuestion: config.timerPerQuestion || null,
        timerTotal: config.timerTotal || null,
        isPremium: true
      },
      questions: questions || [],
      questionIds: questionIds || [],
      participants: participants,
      duelStartedAt: null,
      winner: null,
      result: null
    };

    db.collection(DUEL_COLLECTION).doc(duelId).set(duelDoc)
      .then(function () { callback(null, duelId); })
      .catch(function (e) {
        console.error('[FIRESTORE OP] Collection: ' + DUEL_COLLECTION + '\n[FIRESTORE OP] Document Path: ' + DUEL_COLLECTION + '/' + duelId + '\n[FIRESTORE OP] Authenticated UID: ' + uid + '\n[FIRESTORE OP] Requested Operation: CREATE\n[FIRESTORE OP] Error Message: ' + e.message);
        callback('Room initialization failed. Please try again.');
      });
  }

  /**
   * Join an existing duel room via room code (transaction-safe).
   */
  function joinDuel(duelId, callback) {
    console.log('[DUEL TRACE] joinDuel initiated for room:', duelId);
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }
    _joinDuelTransaction(duelId, callback);
  }

  function _joinDuelTransaction(duelId, callback) {
    var db = FirebaseApp.getDb();
    var uid = FirebaseApp.getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);

    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) { throw new Error('Room not found — check the code and try again'); }
        var data = snap.data();

        if (_isExpired(data)) { throw new Error('This duel has expired'); }

        /* Allow rejoin if already a participant */
        if (data.participants && data.participants[uid]) {
          console.log('[DUEL TRACE] joinDuel: Rejoining as existing participant');
          return data;
        }

        /* Only 'waiting' status allows joining */
        if (data.status !== 'waiting') {
          throw new Error('This duel is no longer accepting players');
        }

        /* Prevent non-premium users from joining premium rooms */
        if (data.isPremium && !_isPremiumPlus()) {
          throw new Error('Premium+ is required to join this duel room.');
        }

        var pCount = data.participants ? Object.keys(data.participants).length : 0;
        if (pCount >= 2) {
          console.warn('[DUEL TRACE] joinDuel rejected: Room full');
          throw new Error('Duel room is full');
        }

        console.log('[DUEL TRACE] joinDuel transaction updating doc with new player');
        var displayName = _getDisplayName();
        var participants = data.participants || {};
        participants[uid] = {
          name: displayName,
          joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: 'joined',
          answers: [],
          score: 0,
          totalTime: 0
        };

        transaction.update(docRef, {
          participants: participants,
          status: 'waiting' /* Stay in waiting until host starts */
        });

        data.participants = participants;
        return data;
      });
    }).then(function (data) {
      callback(null, data);
    }).catch(function (e) {
      console.error('[FIRESTORE OP] Collection: ' + DUEL_COLLECTION + '\n[FIRESTORE OP] Document Path: ' + DUEL_COLLECTION + '/' + duelId + '\n[FIRESTORE OP] Authenticated UID: ' + uid + '\n[FIRESTORE OP] Requested Operation: JOIN (Transaction)\n[FIRESTORE OP] Error Message: ' + e.message);
      var msg = e.message && e.message.indexOf('Room not found') === -1 && e.message.indexOf('expired') === -1 && e.message.indexOf('no longer accepting') === -1 && e.message.indexOf('full') === -1 && e.message.indexOf('Premium+') === -1 ? 'Connection problem detected. Unable to join duel.' : e.message;
      callback(msg || 'Connection problem detected. Unable to join duel.');
    });
  }

  /**
   * Start the duel (both players present) — with countdown.
   */
  function startDuel(duelId, callback) {
    console.log('[DUEL TRACE] startDuel initiated for room:', duelId);
    var db = FirebaseApp.getDb();
    if (!db) { callback('Not ready'); return; }

    db.collection(DUEL_COLLECTION).doc(duelId).update({
      status: 'active',
      duelStartedAt: _serverTimestamp()
    })
      .then(function () {
        console.log('[DUEL TRACE] startDuel successful');
        callback(null);
      })
      .catch(function (e) {
        console.error('[FIRESTORE OP] Collection: ' + DUEL_COLLECTION + '\n[FIRESTORE OP] Document Path: ' + DUEL_COLLECTION + '/' + duelId + '\n[FIRESTORE OP] Authenticated UID: ' + FirebaseApp.getUserId() + '\n[FIRESTORE OP] Requested Operation: START_DUEL (Update)\n[FIRESTORE OP] Error Message: ' + e.message);
        callback('Unable to start duel. Please try again.');
      });
  }

  /**
   * Submit an answer for the current user (transaction-safe with duplicate guard).
   */
  function submitAnswer(duelId, questionIndex, userAnswer, correct, timeMs, callback) {
    var db = FirebaseApp.getDb();
    var uid = FirebaseApp.getUserId();
    if (!db || !uid) { if (callback) callback('Not ready'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);

    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) { throw new Error('Duel not found'); }
        var data = snap.data();
        var p = data.participants && data.participants[uid];
        if (!p) { throw new Error('Not a participant'); }

        var answers = p.answers ? p.answers.slice() : [];

        /* Duplicate submission guard */
        for (var d = 0; d < answers.length; d++) {
          if (answers[d].questionIndex === questionIndex) {
            return null; /* Already submitted — skip silently */
          }
        }

        answers.push({
          questionIndex: questionIndex,
          answer: userAnswer,
          correct: !!correct,
          timeMs: timeMs || 0
        });

        var score = 0;
        var totalTime = 0;
        for (var i = 0; i < answers.length; i++) {
          if (answers[i].correct) score++;
          totalTime += answers[i].timeMs || 0;
        }

        p.answers = answers;
        p.score = score;
        p.totalTime = totalTime;

        /* Check if this player is done */
        var totalQ = data.config ? data.config.questionCount : 10;
        if (answers.length >= totalQ) {
          p.status = 'finished';
          p.finishedAt = new Date().toISOString();
        } else {
          p.status = 'playing';
        }

        var participants = data.participants;
        participants[uid] = p;

        transaction.update(docRef, {
          participants: participants
        });

        return { finished: p.status === 'finished' };
      });
    }).then(function (result) {
      if (result && result.finished) {
        _checkDuelCompletion(duelId);
      }
      if (callback) callback(null);
    }).catch(function (e) {
      if (callback) callback(e.message);
    });
  }

  var _completionLocks = {};

  function _checkDuelCompletion(duelId) {
    var db = FirebaseApp.getDb();
    if (!db || _completionLocks[duelId]) return;
    _completionLocks[duelId] = true;

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);
    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) return null;
        var data = snap.data();
        if (data.status !== 'active') return null;

        var participants = data.participants || {};
        var uids = Object.keys(participants);
        if (uids.length < 2) return null;

        /* Check if all players are done (finished, exited, or disconnected) */
        var allDone = uids.every(function (u) {
          var s = participants[u].status;
          return s === 'finished' || s === 'exited' || s === 'disconnected';
        });
        if (!allDone) return null;

        /* Determine winner */
        var p1 = participants[uids[0]];
        var p2 = participants[uids[1]];
        var winner = null;
        var result = 'draw';

        if (p1.score > p2.score) {
          winner = uids[0]; result = 'player1';
        } else if (p2.score > p1.score) {
          winner = uids[1]; result = 'player2';
        } else if (p1.totalTime < p2.totalTime) {
          winner = uids[0]; result = 'player1';
        } else if (p2.totalTime < p1.totalTime) {
          winner = uids[1]; result = 'player2';
        }

        transaction.update(docRef, {
          status: 'completed',
          winner: winner,
          result: result,
          completedAt: _serverTimestamp()
        });
        return true;
      });
    }).then(function () {
      _completionLocks[duelId] = false;
    }).catch(function (e) {
      _completionLocks[duelId] = false;
      console.warn('[DuelCore] Completion check failed:', e);
    });
  }

  /**
   * Exit duel early — player leaves but opponent continues.
   * Sets participant status to 'exited' with current results preserved.
   */
  function exitDuelEarly(duelId, callback) {
    var db = FirebaseApp.getDb();
    var uid = FirebaseApp.getUserId();
    if (!db || !uid || !duelId) { if (callback) callback('Not ready'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);

    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) return null;
        var data = snap.data();
        if (!data.participants || !data.participants[uid]) return null;

        var participants = data.participants;
        participants[uid].status = 'exited';
        participants[uid].exitedAt = new Date().toISOString();

        transaction.update(docRef, { participants: participants });
        return data;
      });
    }).then(function (data) {
      if (data) _checkDuelCompletion(duelId);
      if (callback) callback(null, data);
    }).catch(function (e) {
      if (callback) callback(e.message);
    });
  }

  /* ---- Word Problems Hydration ---- */

  function _hydrateWordProblems(data, callback) {
    if (typeof QuestionBankService === 'undefined' || !QuestionBankService.fetchQuestionsByIds) {
      callback(null, data);
      return;
    }
    QuestionBankService.fetchQuestionsByIds(data.questionIds, function (err, fetchedQuestions) {
      if (!err && fetchedQuestions) {
        data.questions = fetchedQuestions.map(function (q, idx) {
          return {
            text: q.question || q.text || '',
            answer: q.answer,
            category: q.category || 'mixed',
            index: idx
          };
        });
      }
      callback(null, data);
    });
  }

  /* ---- Realtime Listeners ---- */

  /**
   * Get current state of a duel room (one-time fetch).
   */
  function getDuelState(duelId, callback) {
    var db = FirebaseApp.getDb();
    if (!db) { callback('Database not available'); return; }

    db.collection(DUEL_COLLECTION).doc(duelId).get()
      .then(function (snap) {
        if (!snap.exists) { callback('Duel not found'); return; }
        var data = snap.data();
        if (data.config && data.config.questionMode === 'wordproblems' && data.questionIds && data.questionIds.length > 0 && (!data.questions || data.questions.length === 0)) {
          _hydrateWordProblems(data, callback);
        } else {
          callback(null, data);
        }
      })
      .catch(function (e) { callback(e.message || 'Error fetching duel state'); });
  }

  /**
   * Listen to duel room changes in realtime.
   */
  function listenToDuel(duelId, callback) {
    stopListening();
    var db = FirebaseApp.getDb();
    if (!db) return;

    _activeListener = db.collection(DUEL_COLLECTION).doc(duelId)
      .onSnapshot(function (snap) {
        if (!snap.exists) { callback({ error: 'Duel removed' }); return; }
        var data = snap.data();
        if (_isExpired(data) && data.status !== 'completed' && data.status !== 'expired') {
          callback({ expired: true, data: data });
          return;
        }
        if (data.config && data.config.questionMode === 'wordproblems' && data.questionIds && data.questionIds.length > 0 && (!data.questions || data.questions.length === 0)) {
          _hydrateWordProblems(data, function (err, hydratedData) {
            callback({ data: hydratedData });
          });
        } else {
          callback({ data: data });
        }
      }, function (err) {
        callback({ error: err.message || 'Listener error' });
      });

    /* Auto-timeout: stop the listener after 30 minutes to prevent memory leaks
       from abandoned duel views. The listener is refreshed each time listenToDuel
       is called, so active duels are not affected. */
    if (_listenerTimeout) clearTimeout(_listenerTimeout);
    _listenerTimeout = setTimeout(function () {
      console.warn('[DuelCore] onSnapshot listener auto-stopped after 30 min timeout');
      stopListening();
    }, 30 * 60 * 1000);
  }

  function stopListening() {
    if (_listenerTimeout) {
      clearTimeout(_listenerTimeout);
      _listenerTimeout = null;
    }
    if (_activeListener) {
      _activeListener();
      _activeListener = null;
    }
  }

  /**
   * Leave duel (disconnect) — sets status to exited.
   * Used for tab close / navigation away.
   */
  function leaveDuel(duelId) {
    stopListening();
    var db = FirebaseApp.getDb();
    var uid = FirebaseApp.getUserId();
    if (!db || !uid || !duelId) return;

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);
    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) return null;
        var data = snap.data();
        if (!data.participants || !data.participants[uid]) return null;

        var participants = data.participants;
        participants[uid].status = 'exited';
        participants[uid].exitedAt = new Date().toISOString();
        transaction.update(docRef, { participants: participants });
        return true;
      });
    }).then(function (updated) {
      if (updated) _checkDuelCompletion(duelId);
    }).catch(function (e) {
      console.error('[FIRESTORE OP] Collection: ' + DUEL_COLLECTION + '\n[FIRESTORE OP] Document Path: ' + DUEL_COLLECTION + '/' + duelId + '\n[FIRESTORE OP] Authenticated UID: ' + uid + '\n[FIRESTORE OP] Requested Operation: LEAVE_DUEL (Transaction)\n[FIRESTORE OP] Error Message: ' + e.message);
    });
  }

  function deleteDuel(duelId) {
    var db = FirebaseApp.getDb();
    if (!db || !duelId) return Promise.resolve();
    return db.collection(DUEL_COLLECTION).doc(duelId).update({
      status: 'cancelled',
      cancelledAt: _serverTimestamp()
    }).catch(function (e) {
      console.error('[FIRESTORE OP] Collection: ' + DUEL_COLLECTION + '\n[FIRESTORE OP] Document Path: ' + DUEL_COLLECTION + '/' + duelId + '\n[FIRESTORE OP] Authenticated UID: ' + FirebaseApp.getUserId() + '\n[FIRESTORE OP] Requested Operation: DELETE_DUEL (Update)\n[FIRESTORE OP] Error Message: ' + e.message);
      throw e;
    });
  }

  /**
   * Check if user has any active duel (for reconnection).
   * @param {function} callback - (error, duelData | null)
   */
  function findActiveDuel(callback) {
    var db = FirebaseApp.getDb();
    var uid = FirebaseApp.getUserId();
    if (!db || !uid) { callback(null, null); return; }

    /* Check localStorage first for stored duel ID */
    var storedId = null;
    try { storedId = localStorage.getItem('qr_active_duel'); } catch (_) {}

    if (storedId) {
      getDuelState(storedId, function (err, data) {
        if (err || !data) {
          try { localStorage.removeItem('qr_active_duel'); } catch (_) {}
          callback(null, null);
          return;
        }
        /* Check if duel is still active and user is participant */
        var activeStatuses = ['waiting', 'active'];
        if (activeStatuses.indexOf(data.status) >= 0 && data.participants && data.participants[uid]) {
          callback(null, data);
        } else {
          try { localStorage.removeItem('qr_active_duel'); } catch (_) {}
          callback(null, null);
        }
      });
    } else {
      callback(null, null);
    }
  }

  /* ---- External API ---- */

  return {
    /* Duel room operations */
    createDuel: createDuel,
    joinDuel: joinDuel,
    startDuel: startDuel,
    submitAnswer: submitAnswer,
    exitDuelEarly: exitDuelEarly,

    /* Realtime */
    listenToDuel: listenToDuel,
    stopListening: stopListening,

    /* Lifecycle */
    leaveDuel: leaveDuel,
    deleteDuel: deleteDuel,
    getDuelState: getDuelState,
    findActiveDuel: findActiveDuel,

    /* Constants */
    DUEL_EXPIRY_MS: DUEL_EXPIRY_MS
  };
})();
