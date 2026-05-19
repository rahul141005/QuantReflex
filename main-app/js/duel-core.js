/**
 * duel-core.js — Math Duel Firestore operations & question generation
 *
 * Handles:
 *   - Duel room CRUD (create, join, leave, expire)
 *   - Realtime Firestore listeners (onSnapshot)
 *   - Dual-mode question generation (Quick Questions + Word Problems)
 *   - Answer submission & scoring
 *   - Room expiration (30 min client-side)
 *
 * Premium+ gated — all operations require isPremiumPlus === true.
 */

var DuelCore = (function () {
  'use strict';

  var DUEL_EXPIRY_MS = 30 * 60 * 1000; /* 30 minutes */
  var DUEL_COLLECTION = 'duels';
  var _activeListener = null;

  /* ---- Helpers ---- */

  function _generateDuelId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var id = '';
    for (var i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  function _getDb() {
    return (typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady()) ? FirebaseApp.getDb() : null;
  }

  function _getUserId() {
    return (typeof Auth !== 'undefined' && typeof Auth.getUserId === 'function') ? Auth.getUserId() : null;
  }

  function _getUserName() {
    try {
      var s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
      if (s && s.profile && s.profile.name) return s.profile.name;
    } catch (_) {}
    try {
      var p = (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getProfile === 'function')
        ? FirestoreSync.getProfile() : null;
      if (p && p.name) return p.name;
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

  /* ---- Firestore Operations ---- */

  /**
   * Create a new duel room.
   * @param {object} config - { topics, difficulty, questionCount, timerPerQuestion, timerTotal, questionMode }
   * @param {function} callback - (error, duelId)
   */
  function createDuel(config, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }

    var duelId = _generateDuelId();
    var questions = [];

    if (config.questionMode === 'wordproblems') {
      /* Word Problems mode: store question IDs, fetched later */
      /* For V1, we generate and store full question objects from the bank */
      if (typeof QuestionBankService !== 'undefined' && typeof QuestionBankService.fetchQuestions === 'function') {
        QuestionBankService.fetchQuestions({
          category: config.topics && config.topics.length === 1 ? config.topics[0] : null,
          difficulty: config.difficulty || 'medium',
          count: config.questionCount || 10
        }, function (err, fetchedQuestions) {
          if (err || !fetchedQuestions || fetchedQuestions.length === 0) {
            /* Fallback to quick questions if bank fails */
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
      /* Fallback if QuestionBankService not available */
      questions = _generateQuickQuestions(config, duelId);
    } else {
      /* Quick Questions mode */
      questions = _generateQuickQuestions(config, duelId);
    }

    _writeDuelDoc(db, duelId, uid, config, questions, callback);
  }

  function _writeDuelDoc(db, duelId, uid, config, questions, questionIds, callback) {
    if (typeof questionIds === 'function') {
      callback = questionIds;
      questionIds = [];
    }
    var userName = _getUserName();
    var participants = {};
    participants[uid] = {
      name: userName,
      joinedAt: _serverTimestamp(),
      status: 'joined',
      answers: [],
      score: 0,
      totalTime: 0
    };

    var duelDoc = {
      id: duelId,
      createdBy: uid,
      createdByName: userName,
      status: 'waiting',
      createdAt: _serverTimestamp(),
      config: {
        topics: config.topics || [],
        difficulty: config.difficulty || 'medium',
        questionCount: config.questionCount || 10,
        questionMode: config.questionMode || 'quick',
        timerPerQuestion: config.timerPerQuestion || null,
        timerTotal: config.timerTotal || null
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
      .catch(function (e) { callback(e.message || 'Failed to create duel'); });
  }

  /**
   * Join an existing duel room.
   * @param {string} duelId
   * @param {function} callback - (error, duelData)
   */
  function joinDuel(duelId, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);
    
    db.runTransaction(function(transaction) {
      return transaction.get(docRef).then(function(snap) {
        if (!snap.exists) { throw new Error('Duel not found'); }
        var data = snap.data();

        if (_isExpired(data)) { throw new Error('This duel has expired'); }
        if (data.status !== 'waiting') {
          if (data.participants && data.participants[uid]) { return data; }
          throw new Error('This duel is no longer accepting players');
        }
        if (data.participants && data.participants[uid]) { return data; }

        var pCount = data.participants ? Object.keys(data.participants).length : 0;
        if (pCount >= 2) { throw new Error('Duel room is full'); }

        var userName = _getUserName();
        var participants = data.participants || {};
        participants[uid] = {
          name: userName,
          joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: 'joined',
          answers: [],
          score: 0,
          totalTime: 0
        };

        transaction.update(docRef, {
          participants: participants,
          status: 'ready'
        });

        data.participants = participants;
        data.status = 'ready';
        return data;
      });
    }).then(function(data) {
      callback(null, data);
    }).catch(function(e) {
      callback(e.message || 'Failed to join duel');
    });
  }

  /**
   * Start the duel (both players present).
   */
  function startDuel(duelId, callback) {
    var db = _getDb();
    if (!db) { callback('Not ready'); return; }

    db.collection(DUEL_COLLECTION).doc(duelId).update({
      status: 'active',
      duelStartedAt: _serverTimestamp()
    })
      .then(function () { callback(null); })
      .catch(function (e) { callback(e.message); });
  }

  /**
   * Submit an answer for the current user.
   */
  function submitAnswer(duelId, questionIndex, userAnswer, correct, timeMs, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { if (callback) callback('Not ready'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);
    
    db.runTransaction(function(transaction) {
      return transaction.get(docRef).then(function(snap) {
        if (!snap.exists) { throw new Error('Duel not found'); }
        var data = snap.data();
        var p = data.participants && data.participants[uid];
        if (!p) { throw new Error('Not a participant'); }

        var answers = p.answers ? p.answers.slice() : [];
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
        }

        var participants = data.participants;
        participants[uid] = p;

        transaction.update(docRef, {
          participants: participants
        });
        
        return null;
      });
    }).then(function() {
      _checkDuelCompletion(duelId);
      if (callback) callback(null);
    }).catch(function(e) {
      if (callback) callback(e.message);
    });
  }

  var _completionLocks = {};

  function _checkDuelCompletion(duelId) {
    var db = _getDb();
    if (!db || _completionLocks[duelId]) return;
    _completionLocks[duelId] = true;

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);
    db.runTransaction(function(transaction) {
      return transaction.get(docRef).then(function(snap) {
        if (!snap.exists) return null;
        var data = snap.data();
        if (data.status !== 'active') return null;

        var participants = data.participants || {};
        var uids = Object.keys(participants);
        if (uids.length < 2) return null;

        var allFinished = uids.every(function (u) {
          return participants[u].status === 'finished';
        });
        if (!allFinished) return null;

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
          result: result
        });
        return true;
      });
    }).then(function() {
      _completionLocks[duelId] = false;
    }).catch(function(e) {
      _completionLocks[duelId] = false;
      console.warn('[DuelCore] Completion check failed:', e);
    });
  }

  /* ---- Word Problems Hydration ---- */

  function _hydrateWordProblems(data, callback) {
    if (typeof QuestionBankService === 'undefined' || !QuestionBankService.fetchQuestionsByIds) {
      callback(null, data);
      return;
    }
    QuestionBankService.fetchQuestionsByIds(data.questionIds, function(err, fetchedQuestions) {
      if (!err && fetchedQuestions) {
        data.questions = fetchedQuestions.map(function(q, idx) {
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

  /* ---- External API ---- */

  /**
   * Get current state of a duel room (one-time fetch).
   */
  function getDuelState(duelId, callback) {
    var db = _getDb();
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
    var db = _getDb();
    if (!db) return;

    _activeListener = db.collection(DUEL_COLLECTION).doc(duelId)
      .onSnapshot(function (snap) {
        if (!snap.exists) { callback({ error: 'Duel removed' }); return; }
        var data = snap.data();
        if (_isExpired(data) && data.status !== 'completed') {
          callback({ expired: true, data: data });
          return;
        }
        if (data.config && data.config.questionMode === 'wordproblems' && data.questionIds && data.questionIds.length > 0 && (!data.questions || data.questions.length === 0)) {
          _hydrateWordProblems(data, function(err, hydratedData) {
            callback({ data: hydratedData });
          });
        } else {
          callback({ data: data });
        }
      }, function (err) {
        callback({ error: err.message || 'Listener error' });
      });
  }

  function stopListening() {
    if (_activeListener) {
      _activeListener();
      _activeListener = null;
    }
  }

  function leaveDuel(duelId) {
    stopListening();
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid || !duelId) return;

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);
    db.runTransaction(function(transaction) {
      return transaction.get(docRef).then(function(snap) {
        if (!snap.exists) return null;
        var data = snap.data();
        if (!data.participants || !data.participants[uid]) return null;
        
        var participants = data.participants;
        participants[uid].status = 'disconnected';
        transaction.update(docRef, { participants: participants });
        return true;
      });
    }).then(function(updated) {
      if (updated) _checkDuelCompletion(duelId);
    }).catch(function(e) {
      console.warn('[DuelCore] Leave duel transaction failed:', e);
    });
  }

  function deleteDuel(duelId) {
    var db = _getDb();
    if (!db || !duelId) return Promise.resolve();
    return db.collection(DUEL_COLLECTION).doc(duelId).update({
      status: 'deleted',
      deletedAt: _serverTimestamp()
    });
  }

  return {
    createDuel: createDuel,
    joinDuel: joinDuel,
    startDuel: startDuel,
    submitAnswer: submitAnswer,
    listenToDuel: listenToDuel,
    stopListening: stopListening,
    leaveDuel: leaveDuel,
    deleteDuel: deleteDuel,
    getDuelState: getDuelState,
    DUEL_EXPIRY_MS: DUEL_EXPIRY_MS
  };
})();
