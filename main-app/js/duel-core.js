/**
 * duel-core.js — Math Duel Firestore operations & question generation (V2)
 *
 * Complete rebuild with:
 *   - Username-based invitation system (publicUsernames index)
 *   - 10-state duel lifecycle machine
 *   - Invitation CRUD (send/accept/reject/listen/expire)
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
  var INVITE_EXPIRY_MS = 5 * 60 * 1000; /* 5 minutes */
  var DUEL_COLLECTION = 'duels';
  var INVITE_COLLECTION = 'duelInvitations';
  var USERNAME_COLLECTION = 'publicUsernames';
  var _activeListener = null;
  var _inviteListener = null;

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

  function _getUsername() {
    /* Extract sanitized username from Firebase Auth email */
    try {
      var user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
      if (user && user.email) {
        return user.email.split('@')[0].toLowerCase().trim();
      }
    } catch (_) {}
    return '';
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

  function _isInviteExpired(invite) {
    if (!invite || !invite.createdAt) return true;
    var createdMs = invite.createdAt.toDate ? invite.createdAt.toDate().getTime() : 0;
    if (createdMs === 0) return false;
    return (Date.now() - createdMs) > INVITE_EXPIRY_MS;
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
   * PUBLIC USERNAMES INDEX
   * ================================================================ */

  /**
   * Write/update the current user's public username entry.
   * Called on login/auth state change by firestore-sync.js.
   */
  function updatePublicUsername(callback) {
    var db = _getDb();
    var uid = _getUserId();
    var username = _getUsername();
    if (!db || !uid || !username) {
      if (callback) callback('Not ready');
      return;
    }

    var displayName = _getUserName();
    var isPP = _isPremiumPlus();
    var docRef = db.collection(USERNAME_COLLECTION).doc(username);

    /* Get-then-set: only include createdAt on first creation */
    docRef.get().then(function (snap) {
      var payload = {
        uid: uid,
        username: username,
        displayName: displayName || username,
        isPremiumPlus: isPP,
        updatedAt: _serverTimestamp()
      };
      if (!snap.exists) {
        payload.createdAt = _serverTimestamp();
      }
      return docRef.set(payload, { merge: true });
    })
      .then(function () {
        console.log('[DuelCore] publicUsername synced: ' + username);
        if (callback) callback(null);
      })
      .catch(function (e) {
        console.warn('[DuelCore] updatePublicUsername failed, retrying in 3s:', e.message || e);
        /* Single retry after 3 seconds for transient failures */
        setTimeout(function () {
          var retryDb = _getDb();
          if (!retryDb) { if (callback) callback(e.message); return; }
          var retryPayload = {
            uid: uid, username: username, displayName: displayName || username,
            isPremiumPlus: isPP, updatedAt: _serverTimestamp(), createdAt: _serverTimestamp()
          };
          retryDb.collection(USERNAME_COLLECTION).doc(username).set(retryPayload, { merge: true })
            .then(function () {
              console.log('[DuelCore] publicUsername retry succeeded: ' + username);
              if (callback) callback(null);
            })
            .catch(function (retryErr) {
              console.error('[DuelCore] publicUsername retry failed:', retryErr.message || retryErr);
              if (callback) callback(retryErr.message);
            });
        }, 3000);
      });
  }

  /**
   * Look up a user by username via the publicUsernames collection.
   * @param {string} username - target username
   * @param {function} callback - (error, { uid, username, displayName, isPremiumPlus })
   */
  function lookupUser(username, callback) {
    var db = _getDb();
    if (!db) { callback('Database not available'); return; }

    if (!username || typeof username !== 'string') { callback('Please enter a username'); return; }

    var clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (!clean) { callback('Invalid username — only letters, numbers, and underscores allowed'); return; }
    if (clean.length < 4) { callback('Username must be at least 4 characters'); return; }

    /* Prevent self-invite */
    var myUsername = _getUsername();
    if (clean === myUsername) { callback('You cannot duel yourself'); return; }

    db.collection(USERNAME_COLLECTION).doc(clean).get()
      .then(function (snap) {
        if (!snap.exists) { callback('Username does not exist'); return; }
        var data = snap.data();
        callback(null, {
          uid: data.uid,
          username: data.username || clean,
          displayName: data.displayName || data.username || clean,
          isPremiumPlus: data.isPremiumPlus === true
        });
      })
      .catch(function (e) {
        console.warn('[DuelCore] lookupUser failed:', e.message || e);
        callback('Lookup failed — check your connection');
      });
  }

  /**
   * Check if a username is available (not yet registered).
   * Used by signup validation for realtime availability feedback.
   * @param {string} username - raw username (will be normalized)
   * @param {function} callback - (error, { available: boolean })
   */
  function checkUsernameAvailability(username, callback) {
    var db = _getDb();
    if (!db) { callback('Database not available'); return; }
    if (!username || typeof username !== 'string') { callback(null, { available: true }); return; }

    var clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (!clean || clean.length < 4) { callback(null, { available: true }); return; }

    db.collection(USERNAME_COLLECTION).doc(clean).get()
      .then(function (snap) {
        callback(null, { available: !snap.exists });
      })
      .catch(function (e) {
        console.warn('[DuelCore] checkUsernameAvailability failed:', e.message || e);
        /* On error, don't block signup — assume available and let Firebase Auth catch duplicates */
        callback(null, { available: true });
      });
  }

  /* ================================================================
   * INVITATION SYSTEM
   * ================================================================ */

  /**
   * Send a duel invitation to a target user.
   * Creates both the duel room AND the invitation document.
   * @param {object} targetUser - { uid, username, displayName } from lookupUser
   * @param {object} config - duel configuration
   * @param {function} callback - (error, { duelId, invitationId })
   */
  function sendInvitation(targetUser, config, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }
    if (!targetUser || !targetUser.uid) { callback('Invalid target user'); return; }
    if (!targetUser.isPremiumPlus) { callback('Target user is not a Premium+ member'); return; }

    var duelId = _generateDuelId();
    var userName = _getUserName();
    var myUsername = _getUsername();

    /* Generate questions */
    var questions = [];
    var questionIds = [];

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
          } else {
            fetchedQuestions.forEach(function (q) {
              questionIds.push(q.id || String(Math.random()));
            });
          }
          _writeInvitationAndDuel(db, duelId, uid, userName, myUsername, targetUser, config, questions, questionIds, callback);
        });
        return;
      }
      questions = _generateQuickQuestions(config, duelId);
    } else {
      questions = _generateQuickQuestions(config, duelId);
    }

    _writeInvitationAndDuel(db, duelId, uid, userName, myUsername, targetUser, config, questions, questionIds, callback);
  }

  function _writeInvitationAndDuel(db, duelId, uid, userName, myUsername, targetUser, config, questions, questionIds, callback) {
    var batch = db.batch();

    /* Create duel room */
    var participants = {};
    participants[uid] = {
      name: userName,
      username: myUsername,
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
      createdByUsername: myUsername,
      targetUid: targetUser.uid,
      targetUsername: targetUser.username,
      targetDisplayName: targetUser.displayName,
      status: 'waiting_for_acceptance',
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

    var duelRef = db.collection(DUEL_COLLECTION).doc(duelId);
    batch.set(duelRef, duelDoc);

    /* Create invitation */
    var inviteRef = db.collection(INVITE_COLLECTION).doc();
    var inviteDoc = {
      id: inviteRef.id,
      fromUid: uid,
      fromUsername: myUsername,
      fromDisplayName: userName,
      toUid: targetUser.uid,
      toUsername: targetUser.username,
      toDisplayName: targetUser.displayName,
      duelId: duelId,
      config: duelDoc.config,
      status: 'pending',
      createdAt: _serverTimestamp(),
      respondedAt: null
    };
    batch.set(inviteRef, inviteDoc);

    batch.commit()
      .then(function () { callback(null, { duelId: duelId, invitationId: inviteRef.id }); })
      .catch(function (e) { callback(e.message || 'Failed to send invitation'); });
  }

  /**
   * Listen for incoming duel invitations (realtime).
   * Called on app boot — shows invitation cards in Home tab.
   * @param {function} callback - (invitations[]) called on each change
   */
  function listenToInvitations(callback) {
    stopInvitationListener();
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) return;

    /* Add timestamp filter to avoid zombie invitations older than expiry */
    var cutoffDate = new Date(Date.now() - INVITE_EXPIRY_MS);

    _inviteListener = db.collection(INVITE_COLLECTION)
      .where('toUid', '==', uid)
      .where('status', '==', 'pending')
      .where('createdAt', '>', cutoffDate)
      .onSnapshot(function (snap) {
        var invites = [];
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          /* Double-check expiry client-side */
          if (!_isInviteExpired(data)) {
            invites.push(data);
          }
        });
        callback(invites);
      }, function (err) {
        console.warn('[DuelCore] Invitation listener error:', err);
        callback([]);
      });
  }

  /**
   * Listen for outgoing invitation status changes (sender watches for accept/reject).
   * @param {string} invitationId
   * @param {function} callback - (event) with { accepted, rejected, expired, data }
   */
  function listenToOutgoingInvitation(invitationId, callback) {
    var db = _getDb();
    if (!db || !invitationId) return null;

    return db.collection(INVITE_COLLECTION).doc(invitationId)
      .onSnapshot(function (snap) {
        if (!snap.exists) { callback({ expired: true }); return; }
        var data = snap.data();
        if (data.status === 'accepted') {
          callback({ accepted: true, data: data });
        } else if (data.status === 'rejected') {
          callback({ rejected: true, data: data });
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          callback({ expired: true, data: data });
        } else if (_isInviteExpired(data)) {
          callback({ expired: true, data: data });
        } else {
          callback({ pending: true, data: data });
        }
      }, function (err) {
        console.warn('[DuelCore] Outgoing invitation listener error:', err);
        callback({ error: err.message });
      });
  }

  function stopInvitationListener() {
    if (_inviteListener) {
      _inviteListener();
      _inviteListener = null;
    }
  }

  /**
   * Accept an invitation — join the duel room and update invitation status.
   * @param {object} invitation - the invitation document data
   * @param {function} callback - (error, duelData)
   */
  function acceptInvitation(invitation, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }

    var batch = db.batch();

    /* Update invitation status */
    var inviteRef = db.collection(INVITE_COLLECTION).doc(invitation.id);
    batch.update(inviteRef, {
      status: 'accepted',
      respondedAt: _serverTimestamp()
    });

    batch.commit()
      .then(function () {
        /* Now join the duel via transaction */
        _joinDuelTransaction(invitation.duelId, callback);
      })
      .catch(function (e) { callback(e.message || 'Failed to accept invitation'); });
  }

  /**
   * Reject an invitation.
   * @param {object} invitation - the invitation document data
   * @param {function} callback - (error)
   */
  function rejectInvitation(invitation, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { if (callback) callback('Not authenticated'); return; }

    var batch = db.batch();

    /* Update invitation status */
    var inviteRef = db.collection(INVITE_COLLECTION).doc(invitation.id);
    batch.update(inviteRef, {
      status: 'rejected',
      respondedAt: _serverTimestamp()
    });

    /* Update duel room status */
    var duelRef = db.collection(DUEL_COLLECTION).doc(invitation.duelId);
    batch.update(duelRef, { status: 'rejected' });

    batch.commit()
      .then(function () { if (callback) callback(null); })
      .catch(function (e) { if (callback) callback(e.message); });
  }

  /**
   * Expire/cancel an outgoing invitation (sender side).
   */
  function cancelInvitation(invitationId, duelId, callback) {
    var db = _getDb();
    if (!db) { if (callback) callback('Not ready'); return; }

    var batch = db.batch();

    var inviteRef = db.collection(INVITE_COLLECTION).doc(invitationId);
    batch.update(inviteRef, {
      status: 'expired',
      respondedAt: _serverTimestamp()
    });

    if (duelId) {
      var duelRef = db.collection(DUEL_COLLECTION).doc(duelId);
      batch.update(duelRef, {
        status: 'expired'
      });
    }

    batch.commit()
      .then(function () { if (callback) callback(null); })
      .catch(function (e) { if (callback) callback(e.message); });
  }

  /* ================================================================
   * DUEL ROOM OPERATIONS
   * ================================================================ */

  /**
   * Create a new duel room (legacy — without invitation).
   * Preserved for backward compatibility.
   */
  function createDuel(config, callback) {
    var db = _getDb();
    var uid = _getUserId();
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

    _writeDuelDoc(db, duelId, uid, config, questions, callback);
  }

  function _writeDuelDoc(db, duelId, uid, config, questions, questionIds, callback) {
    if (typeof questionIds === 'function') {
      callback = questionIds;
      questionIds = [];
    }
    var userName = _getUserName();
    var myUsername = _getUsername();
    var participants = {};
    participants[uid] = {
      name: userName,
      username: myUsername,
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
      createdByUsername: myUsername,
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
   * Join an existing duel room (transaction-safe).
   */
  function joinDuel(duelId, callback) {
    if (!_isPremiumPlus()) { callback('Premium+ required'); return; }
    _joinDuelTransaction(duelId, callback);
  }

  function _joinDuelTransaction(duelId, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { callback('Not authenticated'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);

    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) { throw new Error('Duel not found'); }
        var data = snap.data();

        if (_isExpired(data)) { throw new Error('This duel has expired'); }

        /* Allow rejoin if already a participant */
        if (data.participants && data.participants[uid]) {
          return data;
        }

        /* Validate status allows joining */
        var joinableStatuses = ['waiting', 'waiting_for_acceptance'];
        if (joinableStatuses.indexOf(data.status) === -1) {
          throw new Error('This duel is no longer accepting players');
        }

        var pCount = data.participants ? Object.keys(data.participants).length : 0;
        if (pCount >= 2) { throw new Error('Duel room is full'); }

        var userName = _getUserName();
        var myUsername = _getUsername();
        var participants = data.participants || {};
        participants[uid] = {
          name: userName,
          username: myUsername,
          joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: 'joined',
          answers: [],
          score: 0,
          totalTime: 0
        };

        /* Transition to waiting_room (invitation flow) or ready (legacy) */
        var newStatus = data.status === 'waiting_for_acceptance' ? 'waiting_room' : 'ready';

        transaction.update(docRef, {
          participants: participants,
          status: newStatus
        });

        data.participants = participants;
        data.status = newStatus;
        return data;
      });
    }).then(function (data) {
      callback(null, data);
    }).catch(function (e) {
      callback(e.message || 'Failed to join duel');
    });
  }

  /**
   * Start the duel (both players present) — with countdown.
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
   * Submit an answer for the current user (transaction-safe with duplicate guard).
   */
  function submitAnswer(duelId, questionIndex, userAnswer, correct, timeMs, callback) {
    var db = _getDb();
    var uid = _getUserId();
    if (!db || !uid) { if (callback) callback('Not ready'); return; }

    var docRef = db.collection(DUEL_COLLECTION).doc(duelId);

    db.runTransaction(function (transaction) {
      return transaction.get(docRef).then(function (snap) {
        if (!snap.exists) { throw new Error('Duel not found'); }
        var data = snap.data();
        var p = data.participants && data.participants[uid];
        if (!p) { throw new Error('Not a participant'); }

        var answers = p.answers ? p.answers.slice() : [];

        /* Duplicate submission guard — check if this question was already answered */
        for (var d = 0; d < answers.length; d++) {
          if (answers[d].questionIndex === questionIndex) {
            /* Already submitted — skip silently */
            return null;
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
    var db = _getDb();
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
   * Does NOT stop the opponent or mark duel as completed.
   */
  function exitDuelEarly(duelId, callback) {
    var db = _getDb();
    var uid = _getUserId();
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
  }

  function stopListening() {
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
    var db = _getDb();
    var uid = _getUserId();
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

  /**
   * Check if user has any active duel (for reconnection).
   * Queries duels where the user is a participant and status is active/waiting_room/countdown.
   * @param {function} callback - (error, duelData | null)
   */
  function findActiveDuel(callback) {
    var db = _getDb();
    var uid = _getUserId();
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
        var activeStatuses = ['waiting_for_acceptance', 'waiting_room', 'countdown', 'active', 'waiting', 'ready'];
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
    /* Username index */
    updatePublicUsername: updatePublicUsername,
    lookupUser: lookupUser,
    checkUsernameAvailability: checkUsernameAvailability,

    /* Invitations */
    sendInvitation: sendInvitation,
    listenToInvitations: listenToInvitations,
    listenToOutgoingInvitation: listenToOutgoingInvitation,
    stopInvitationListener: stopInvitationListener,
    acceptInvitation: acceptInvitation,
    rejectInvitation: rejectInvitation,
    cancelInvitation: cancelInvitation,

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
    DUEL_EXPIRY_MS: DUEL_EXPIRY_MS,
    INVITE_EXPIRY_MS: INVITE_EXPIRY_MS
  };
})();
