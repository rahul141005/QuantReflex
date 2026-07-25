/**
 * firestore-sync.js — Firestore data synchronization layer
 *
 * Syncs localStorage data with Firestore using authenticated user profiles.
 * Uses local caching for fast access and batched updates for efficiency.
 *
 * Firestore structure:
 *   users/{userId}                               (root doc — source of truth)
 *     ├── profile (name, createdAt)
 *     ├── settings
 *     ├── stats (progress data)
 *     ├── quickLinks, customTopics, customFormulas, bookmarks
 *     ├── plan ('free'|'premium'), planType, planExpiry, planSource
 *     ├── isTrial, trialEnd, planUpdatedAt, lastPaymentId
 *     ├── updatedAt, createdAt
 *
 *   users/{userId}/practiceSessions/{sessionId}  (subcollection — drill history)
 *
 *   Structured subcollections (dual-written alongside root doc; read by the coaching student-detail view):
 *   users/{userId}/performance/overall           (derived accuracy, avgTime, streaks)
 *   users/{userId}/practice/data                 (mistakes, savedQuestions)
 *   NOTE (ADR-071): the former profile/data mirror was removed — nothing read it (every consumer reads the root
 *   users.profile map + root plan fields), so it was pure write-amplification.
 *   users/{userId}/ai/benchmarks/{fingerprint}   (speed benchmark results — server-written)
 *
 *   AI usage quota lives at users/{userId}/usage/ai (server source of truth).
 *   The legacy client-side ai/usage mirror was removed (audit M1).
 */

var FirestoreSync = (function () {
  var _syncTimer = null;
  var _pendingUpdates = {};
  var _memoryCache = null; /* In-memory cache of the user document */
  var _dataLoaded = false; /* Whether initial load has completed */
  var _drillActive = false; /* Whether a drill is in progress (defers syncing) */
  var _loadedUserId = null; /* UID whose data is currently loaded — detects user switches */
  var _loadRetryCount = 0;  /* transient load-failure retries (S1-ENT4: don't latch a paying user to free) */
  var _MAX_LOAD_RETRIES = 3;
  var _flushRetryCount = 0;
  var _flushRetryTimer = null;
  var _flushInFlight = false;
  var _syncGeneration = 0;
  var _pendingCoachingId = null;
  var _notifUnsub = null;  /* the active notifications onSnapshot unsubscribe — torn down on re-listen + logout */
  var _sessionUnsub = null;  /* ADR-072: root user-doc listener for single-device enforcement — torn down on logout */
  // ADR-066: clients no longer CREATE notifications (the Inbox is server-write only). These remain as harmless
  // no-ops so any stray caller/export keeps working; all notifications now originate from the server pipeline.
  function _flushPendingSystemNotifications() { /* retired (ADR-066) */ }
  var SYNC_DEBOUNCE_MS = 2000; /* batch updates every 2 seconds */
  var FLUSH_RETRY_DELAY_MS = 5000;
  var FLUSH_MAX_RETRIES = 2;
  var PENDING_BUFFER_KEY = 'qr_pending_writes'; /* S3-FS2: durable offline buffer, uid-scoped */

  /* ADR-118: the server-authoritative fields the live user-doc listener folds into the local view.
     `settings` and `stats` are deliberately absent — they are client-owned and merge-sensitive. */
  var REFRESH_SCALARS = ['plan', 'planType', 'planSource', 'isTrial', 'coachingId'];
  var REFRESH_STAMPS = ['planExpiry', 'trialEnd', 'planUpdatedAt', 'updatedAt'];

  /* Conflict rule for that refresh: a field with an unflushed LOCAL edit is never overwritten by the
     snapshot. Without this, our own debounced write echoing back an older document reverts the just-made
     local edit in the cache (and repaints it), so e.g. a renamed profile visibly flips back to the old
     name for the length of the debounce window. The queued write itself was never lost (_pendingUpdates
     holds its own reference), but the UI regressed — so local pending edits win until they flush. */
  function _hasPendingUpdate(field) {
    return Object.prototype.hasOwnProperty.call(_pendingUpdates, field);
  }

  /* Server-authoritative timestamp for the doc `updatedAt`; falls back to a client ISO only when the
     Firestore SDK isn't loaded. Used everywhere we write updatedAt so a client clock can't poison the
     clock-skew reference the entitlement expiry guard relies on. */
  function _serverTs() {
    return (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();
  }

  /* S3-FS2: persist the in-memory pending updates to a durable, uid-scoped localStorage buffer so
     nothing is lost if the PWA is closed while OFFLINE (where the Firestore write promise never
     resolves and the debounce/beforeunload flush can't reach the server). Best-effort. */
  function _persistPendingBuffer() {
    try {
      var uid = FirebaseApp.getUserId && FirebaseApp.getUserId();
      var keys = Object.keys(_pendingUpdates);
      if (!uid || keys.length === 0) return;
      /* updatedAt sentinels aren't serializable/meaningful in the buffer — omit; the replay flush
         stamps a fresh serverTimestamp. */
      var out = {};
      for (var i = 0; i < keys.length; i++) { if (keys[i] !== 'updatedAt') out[keys[i]] = _pendingUpdates[keys[i]]; }
      if (Object.keys(out).length === 0) return;
      /* Record the SERVER updatedAt of the state we last saw. On replay we compare it to the freshly
         loaded server updatedAt: if the server has advanced (another device wrote), our buffered
         whole-field values are stale and must not clobber the newer state. Both are server timestamps
         → clock-safe. */
      var baseUpdatedAt = _toMillis(_memoryCache && _memoryCache.updatedAt) || 0;
      localStorage.setItem(PENDING_BUFFER_KEY, JSON.stringify({ uid: uid, updates: out, baseUpdatedAt: baseUpdatedAt }));
    } catch (_) { /* quota / serialization — best-effort */ }
  }
  function _clearPendingBuffer() {
    try { localStorage.removeItem(PENDING_BUFFER_KEY); } catch (_) {}
  }
  /* Replay a durable buffer that belongs to the CURRENT user, merging it into _pendingUpdates so the
     normal flush persists it. A buffer for a different uid is left untouched (no cross-user write). */
  function _replayPendingBuffer(currentUserId) {
    try {
      var raw = localStorage.getItem(PENDING_BUFFER_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.uid !== currentUserId || !parsed.updates) return;
      /* Freshness guard (clock-safe, server timestamps both sides): if the server doc has advanced
         since we buffered — i.e. another device wrote in the meantime — replaying our stale whole-field
         values (e.g. stats) would clobber the newer server state. Newer server state wins: drop the
         stale buffer and skip. (base===0/unknown → replay, preferring data preservation.) */
      var base = parsed.baseUpdatedAt || 0;
      var loadedUpdatedAt = _toMillis(_memoryCache && _memoryCache.updatedAt) || 0;
      if (base > 0 && loadedUpdatedAt > base) { _clearPendingBuffer(); return; }
      var fields = Object.keys(parsed.updates);
      for (var i = 0; i < fields.length; i++) {
        /* live in-memory edits win over a stale buffered value for the same field */
        if (!_pendingUpdates.hasOwnProperty(fields[i])) _pendingUpdates[fields[i]] = parsed.updates[fields[i]];
      }
      _clearPendingBuffer();
      if (fields.length > 0) { if (_syncTimer) clearTimeout(_syncTimer); _syncTimer = setTimeout(_flushUpdates, 0); }
    } catch (_) { _clearPendingBuffer(); }
  }
  /* Early-user and auto-trial systems removed (v1.2) */

  /* All localStorage keys that store user-specific data */
  var _USER_STORAGE_KEYS = [
    'quant_reflex_settings',
    'quant_reflex_progress',
    'quant_quick_links',
    'quant_custom_topics',
    'quant_custom_formulas',
    'quant_bookmarks',
    'quant_learn_progress',
    'quant_learn_bookmarks',
    'quant_notifications_enabled'
  ];

  /**
   * Remove all user-related keys from localStorage.
   * Prevents data from one user leaking to another session.
   * Clears BOTH canonical (qr_*) and legacy (quant_*) key families
   * via AppState.clearAll() to guarantee complete purge.
   */
  function _clearUserLocalStorage() {
    try {
      /* Use centralized AppState purge to cover ALL key families */
      if (typeof AppState !== 'undefined' && typeof AppState.clearAll === 'function') {
        AppState.clearAll();
      }
      /* Also clear legacy keys explicitly as a defense-in-depth measure */
      for (var i = 0; i < _USER_STORAGE_KEYS.length; i++) {
        localStorage.removeItem(_USER_STORAGE_KEYS[i]);
      }
      /* Invalidate progress cache to prevent stale reads after user switch */
      if (typeof invalidateProgressCache === 'function') invalidateProgressCache();
    } catch (_) {}
  }

  /**
   * Set a pending coaching ID to be saved when the default document is created.
   * @param {string|null} id
   */
  function setPendingCoachingId(id) {
    _pendingCoachingId = id;
  }

  /**
   * Get the Firestore document reference for the current authenticated user.
   * @returns {object|null} Document reference or null
   */
  function _getUserDocRef() {
    if (!FirebaseApp.isReady()) return null;
    var userId = FirebaseApp.getUserId();
    if (!userId) return null;
    var db = FirebaseApp.getDb();
    return db.collection('users').doc(userId);
  }

  /* ---- Structured subcollection helpers (dual-write with single retry) ---- */

  function _subcollectionWrite(collPath, docId, payload, label) {
    var docRef = _getUserDocRef();
    if (!docRef) return;
    var uid = _loadedUserId || 'unknown';
    var ref = docRef.collection(collPath).doc(docId);
    ref.set(payload, { merge: true }).then(function () {

    }).catch(function (err) {
      console.warn('[FirestoreSync:' + label + '] write failed (uid: ' + uid + '), retrying in 3s:', err.message || err);
      setTimeout(function () {
        ref.set(payload, { merge: true }).then(function () {

        }).catch(function (retryErr) {
          console.error('[FirestoreSync:' + label + '] retry failed (uid: ' + uid + '), data lost for this cycle:', retryErr.message || retryErr);
        });
      }, 3000);
    });
  }

  function _syncPerformanceSubcollection(stats) {
    if (!stats) return;
    var totalAttempted = stats.totalAttempted || 0;
    var totalCorrect = stats.totalCorrect || 0;
    var accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    var times = Array.isArray(stats.responseTimes) ? stats.responseTimes : [];
    var avgTime = times.length > 0
      ? parseFloat((times.reduce(function (a, b) { return a + b; }, 0) / times.length).toFixed(1))
      : 0;
    _subcollectionWrite('performance', 'overall', {
      totalAttempted: totalAttempted,
      totalCorrect: totalCorrect,
      accuracy: accuracy,
      avgTime: avgTime,
      bestStreak: stats.bestStreak || 0,
      currentStreak: stats.currentStreak || 0,
      dailyStreak: stats.dailyStreak || 0,
      updatedAt: new Date().toISOString()
    }, 'Performance');
  }

  function _syncPracticeSubcollection(stats, bookmarks) {
    var payload = { updatedAt: new Date().toISOString() };
    if (stats && Array.isArray(stats.mistakes)) payload.mistakes = stats.mistakes;
    if (Array.isArray(bookmarks)) payload.savedQuestions = bookmarks;
    if (!payload.mistakes && !payload.savedQuestions) return;
    _subcollectionWrite('practice', 'data', payload, 'Practice');
  }

  /* ---- End subcollection helpers ---- */

  /**
   * Reset the sync state when user logs out.
   * Flushes any pending writes for the current user, then clears all
   * in-memory caches AND user-related localStorage keys so no data
   * leaks to the next session.
   */
  function resetSyncState() {
    if (Object.keys(_pendingUpdates).length > 0 && !_flushInFlight) {
      _flushUpdates();
    }

    _syncGeneration++;

    // Tear down the notifications realtime listener so it never outlives the session (logout / user switch).
    if (_notifUnsub) { try { _notifUnsub(); } catch (_) {} _notifUnsub = null; }
    // ADR-072: tear down the single-device session listener too.
    if (_sessionUnsub) { try { _sessionUnsub(); } catch (_) {} _sessionUnsub = null; }

    _memoryCache = null;
    _dataLoaded = false;
    _pendingUpdates = {};
    _drillActive = false;
    _loadedUserId = null;
    _loadRetryCount = 0;
    _flushRetryCount = 0;
    _flushInFlight = false;
    if (_flushRetryTimer) {
      clearTimeout(_flushRetryTimer);
      _flushRetryTimer = null;
    }
    if (_syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
    }

    /* Reset per-user paywall UX state (free-explain-exhausted hint) so user B never inherits A's. */
    if (typeof Paywall !== 'undefined' && typeof Paywall.resetPaywallUserState === 'function') {
      Paywall.resetPaywallUserState();
    }

    /* Clear all user-related localStorage keys to prevent data leakage */
    _clearUserLocalStorage();

    /* Clear question bank in-memory cache */
    if (typeof QuestionBankService !== 'undefined' && typeof QuestionBankService.clearCache === 'function') {
      QuestionBankService.clearCache();
    }
  }

  /**
   * Load all user data from Firestore and merge into localStorage.
   * Uses in-memory cache to prevent duplicate reads within the same session.
   * Called on app startup after authentication.
   * Clears stale localStorage data before loading to prevent cross-user leakage.
   * @param {function} [callback] - Optional callback when done
   */
  /* ADR-072: single-device enforcement. Watch the root user doc; if activeSessionId is set to anything other than
     THIS device's session id, another device has claimed the active session → sign out gracefully. Idempotent
     (tears down any prior listener); torn down on logout via resetSyncState. */
  function _listenForSession(uid) {
    if (!window.Session || !uid) return;
    var db = FirebaseApp.getDb();
    if (!db) return;
    if (_sessionUnsub) { try { _sessionUnsub(); } catch (_) {} _sessionUnsub = null; }
    _sessionUnsub = db.collection('users').doc(uid).onSnapshot(function (snap) {
      if (!snap || !snap.exists) return;
      var d = snap.data() || {};
      var active = d.activeSessionId;
      if (active && active !== Session.id()) {
        try { Session.onReplaced(); } catch (_) {}
        return;   /* this device is being displaced — don't bother refreshing its view */
      }
      /* ADR-118: this listener already receives the WHOLE user document on every change (the read is
         billed either way) but historically read only activeSessionId, so an entitlement / coaching /
         profile change made on another device never reached this one until a full relaunch — there is
         no other live refresh path. Fold those server-authoritative fields into the local view here.
         Deliberately EXCLUDES `settings` and `stats`: those are client-owned and merge-sensitive, so
         live-overwriting them could clobber edits this device has queued but not yet flushed. */
      if (!_memoryCache || _loadedUserId !== uid) return;
      var changed = false;
      for (var i = 0; i < REFRESH_SCALARS.length; i++) {
        var k = REFRESH_SCALARS[i];
        if (_hasPendingUpdate(k)) continue;
        if (d[k] !== undefined && _memoryCache[k] !== d[k]) { _memoryCache[k] = d[k]; changed = true; }
      }
      /* Timestamp-ish fields: compare by resolved millis so a Timestamp vs ISO representation of the
         same instant is not mistaken for a change (which would re-render on every snapshot). */
      for (var j = 0; j < REFRESH_STAMPS.length; j++) {
        var sk = REFRESH_STAMPS[j];
        if (d[sk] === undefined || _hasPendingUpdate(sk)) continue;
        if (_toMillis(d[sk]) !== _toMillis(_memoryCache[sk])) { _memoryCache[sk] = d[sk]; changed = true; }
      }
      if (d.profile && typeof d.profile === 'object' && !_hasPendingUpdate('profile')) {
        try {
          if (JSON.stringify(d.profile) !== JSON.stringify(_memoryCache.profile || null)) {
            _memoryCache.profile = d.profile; changed = true;
          }
        } catch (_) { /* unserialisable — skip rather than thrash */ }
      }
      if (!changed) return;
      /* Repaint so badges/CTAs reflect the new truth immediately. Never interrupt an active drill —
         gates re-check live at action time, so deferring the repaint costs nothing. */
      if (_drillActive) return;
      try {
        if (document.body && document.body.classList.contains('drill-session-active')) return;
        if (typeof Router !== 'undefined' && Router.getCurrentView && Router.showView) {
          var cv = Router.getCurrentView();
          if (cv) Router.showView(cv);
        }
      } catch (_) { /* a repaint must never break the session listener */ }
    }, function (err) { console.warn('[FirestoreSync] session listener error', err); });
  }

  function loadFromFirestore(callback) {
    var currentUserId = FirebaseApp.getUserId();
    _flushPendingSystemNotifications();

    /* If a different user is now authenticated, force a full reset so we
       never serve stale data from the previous user's cache. */
    if (_loadedUserId && currentUserId && _loadedUserId !== currentUserId) {
      resetSyncState();
    }

    /* Return cached data if already loaded this session */
    if (_dataLoaded && _memoryCache) {
      if (callback) callback(true);
      return;
    }

    var docRef = _getUserDocRef();
    if (!docRef) {
      if (callback) callback(false);
      return;
    }

    /* Safe-merge migration: Only clear local cache if auth UID changed.
       Preserve compatibility and avoid resetting existing sessions. */
    try {
      var lastUid = localStorage.getItem('qr_last_uid');
      if (lastUid && lastUid !== currentUserId) {
        _clearUserLocalStorage();
      }
      localStorage.setItem('qr_last_uid', currentUserId);
    } catch (_) {}

    docRef.get().then(function (doc) {
      _loadRetryCount = 0; /* a successful read clears the transient-failure counter */
      if (doc.exists) {
        var data = doc.data();
        _normalizeMonetization(data, docRef);
        _validateAndFillDefaults(data, docRef);
        _memoryCache = data;
        _enforcePremiumExpiry(_memoryCache, docRef);
        _dataLoaded = true;
        _loadedUserId = currentUserId;
        /* Write to canonical AppState keys — single source of truth for localStorage */
        if (data.settings) {
          if (typeof AppState !== 'undefined') AppState.setSettings(data.settings);
        }
        if (data.stats) {
          /* F-M8 sync integrity: MERGE the cloud mistake archive with any local (e.g. offline / guest) mistakes by
             stable id — union, newest-per-id wins, learning-state OR-merged — so hydration never duplicates or drops a
             mistake. Guarded + try/catch: on any issue the wholesale cloud value is used, exactly as before. */
          try {
            if (typeof QRMistakeArchive !== 'undefined' && Array.isArray(data.stats.mistakes)) {
              var _localP = (typeof AppState !== 'undefined' && AppState.getProgress) ? AppState.getProgress() : null;
              var _localM = (_localP && Array.isArray(_localP.mistakes)) ? _localP.mistakes : [];
              data.stats.mistakes = QRMistakeArchive.mergeMistakes(_localM, data.stats.mistakes);
            }
          } catch (_) {}
          if (typeof AppState !== 'undefined') AppState.setProgress(data.stats);
          /* Invalidate progress.js cache so next loadProgress() reads fresh Firestore data */
          if (typeof invalidateProgressCache === 'function') invalidateProgressCache();
        }
        if (data.quickLinks) {
          if (typeof AppState !== 'undefined') AppState.setQuickLinks(data.quickLinks);
        }
        if (data.customTopics) {
          if (typeof AppState !== 'undefined') AppState.setCustomTopics(data.customTopics);
        }
        if (data.customFormulas) {
          if (typeof AppState !== 'undefined') AppState.setCustomFormulas(data.customFormulas);
        }
        if (data.bookmarks) {
          if (typeof AppState !== 'undefined') AppState.setBookmarks(data.bookmarks);
        }
        /* ADR-069 Phase 4: Learn progress & topic bookmarks are localStorage-primary (LearnProgress module),
           so hydrate their keys directly — mirrors the customTopics/bookmarks path, no new collection/rule. */
        if (data.learnProgress && typeof data.learnProgress === 'object') {
          try { localStorage.setItem('quant_learn_progress', JSON.stringify(data.learnProgress)); } catch (_) {}
        }
        if (Array.isArray(data.learnTopicBookmarks)) {
          try { localStorage.setItem('quant_learn_bookmarks', JSON.stringify(data.learnTopicBookmarks)); } catch (_) {}
        }
      } else {
        /* First time: create document with default data */
        _createDefaultDocument();
        _loadedUserId = currentUserId;
      }
      /* ADR-072: start the single-device session listener — if another device claims the active session, this
         device is signed out within ~1-3s (the server also hard-rejects its requests with 409). */
      _listenForSession(currentUserId);
      /* S3-FS2: replay any durable pending-writes buffer left by a previous offline/closed session
         (uid-scoped — a buffer for another user is ignored, never cross-written). Merged into
         _pendingUpdates so the flush below persists it. */
      _replayPendingBuffer(currentUserId);
      /* ADR-054: the user is now ready — flush any updates that were buffered before Firebase/auth came up
         (e.g. questions answered during onboarding), so a first session always reaches users/{uid}.stats. */
      _flushPending();
      /* ADR-117: if the 6s boot-hydration timeout already fired, the app was revealed with a null
         cache — every render-time surface (Home "Unlock AI Coach" / PRO badges, Stats deep-dive)
         painted the FREE chrome for what may be a paying user, and the boot transition is a one-shot
         latch so nothing repainted when the data finally arrived. Now that real entitlement is in
         hand, re-render the current view. Gates were always correct (they re-check live at click
         time); this fixes the stale chrome. Cheap + idempotent: views register via Router.onShow. */
      try {
        if (typeof Router !== 'undefined' && Router.getCurrentView && Router.showView) {
          var _cv = Router.getCurrentView();
          if (_cv) Router.showView(_cv);
        }
      } catch (_) { /* never block hydration on a re-render */ }
      if (callback) callback(true);

    }).catch(function (err) {
      console.warn('Firestore load failed:', err);
      /* S1-ENT4: a transient read failure must NOT latch a paying user to a null cache (which
         getAccessState would resolve as free for the rest of the session). Retry a bounded number of
         times with backoff before giving up; only after exhausting retries do we proceed (the server
         still gates every premium API call, so a genuine persistent failure degrades safely). */
      if (_loadRetryCount < _MAX_LOAD_RETRIES) {
        _loadRetryCount++;
        setTimeout(function () { loadFromFirestore(callback); }, 800 * _loadRetryCount);
        return;
      }
      _loadRetryCount = 0;
      _dataLoaded = true; /* retries exhausted — proceed so the app isn't wedged; server remains authoritative */
      if (callback) callback(false);
    });
  }

  /**
   * Create a default Firestore document for a new user.
   * Always uses clean defaults — never reads from localStorage to prevent
   * data leakage from a previously logged-in user.
   */
  function _createDefaultDocument() {
    var docRef = _getUserDocRef();
    if (!docRef) return;
    var db = FirebaseApp.getDb();
    if (!db) return;

    var userId = FirebaseApp.getUserId();
    var displayName = '';
    /* Extract display name from Firebase Auth email */
    if (typeof Auth !== 'undefined' && Auth.getCurrentUser() && Auth.getCurrentUser().email) {
      displayName = Auth.getCurrentUser().email.split('@')[0];
    }
    var now = new Date();
    /* New users start on free tier — no auto-trial or early-user grants */
    var fallbackDefaults = {
      profile: {
        name: displayName,
        createdAt: now.toISOString()
      },
      settings: {
        darkMode: false, sound: true, vibration: true, difficulty: 'medium',
        dailyGoal: 20, reducedMotion: false, skipEnabled: false, notificationsEnabled: false,
        theme: 'classic'
      },
      stats: {
        totalAttempted: 0, totalCorrect: 0,
        bestStreak: 0, currentStreak: 0,
        drillSessions: 0, timedTestSessions: 0,
        dailyStreak: 0, bestDailyStreak: 0, lastActiveDate: null,
        lastPracticeDate: null,
        todayAttempted: 0, todayCorrect: 0,
        categoryStats: {}, mistakes: [],
        responseTimes: [], dailyHistory: {}
      },
      quickLinks: ['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks'],
      customTopics: [],
      customFormulas: {},
      bookmarks: [],
      plan: 'free',
      planType: null,
      planExpiry: null,
      planSource: null,
      isTrial: false,
      trialEnd: null,
      planUpdatedAt: now.toISOString(),
      lastPaymentId: null,
      coachingId: _pendingCoachingId || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    /* Clear the pending ID so it's not reused accidentally */
    _pendingCoachingId = null;

    _memoryCache = fallbackDefaults;
    _dataLoaded = true;

    /* Write clean defaults to canonical AppState keys — single source of truth */
    if (typeof AppState !== 'undefined') {
      AppState.setSettings(fallbackDefaults.settings);
      AppState.setProgress(fallbackDefaults.stats);
      AppState.setQuickLinks(fallbackDefaults.quickLinks);
      AppState.setCustomTopics(fallbackDefaults.customTopics);
      AppState.setCustomFormulas(fallbackDefaults.customFormulas);
      AppState.setBookmarks(fallbackDefaults.bookmarks);
    }
    if (typeof invalidateProgressCache === 'function') invalidateProgressCache();
    /* Root-doc provisioning is SERVER-SIDE ONLY: firestore.rules deny client creates
       (allow create: if false), so the old client-side docRef.set(...) here could never
       succeed against production rules — the user silently ran on localStorage with no
       server doc. The idempotent /api/account?action=ensure-profile seeds the same shape
       as /api/auth/register; on success we re-read so entitlements hydrate normally. */
    docRef.get().then(function (userDoc) {
      if (userDoc.exists && userDoc.data().plan !== undefined) return;
      var tokenPromise = (typeof Auth !== 'undefined' && Auth.getIdToken) ? Auth.getIdToken() : Promise.reject(new Error('no auth'));
      return tokenPromise.then(function (token) {
        var headers = { 'Authorization': 'Bearer ' + token };
        try { if (window.Session && Session.id) headers['X-Session-Id'] = Session.id(); } catch (_) {}
        return fetch('/api/account?action=ensure-profile', { method: 'POST', headers: headers });
      }).then(function (resp) {
        if (!resp || !resp.ok) throw new Error('ensure-profile returned ' + (resp && resp.status));
        /* Re-read the now-provisioned doc into the cache */
        return docRef.get().then(function (fresh) {
          if (fresh.exists) { _memoryCache = fresh.data(); }
        });
      }).then(function () {
        /* Non-blocking: eagerly seed the owner-writable structured subcollections */
        var mc = _memoryCache || fallbackDefaults;
        var seedDocRef = _getUserDocRef();
        _syncPerformanceSubcollection(mc.stats || fallbackDefaults.stats);
        /* Eagerly create practice/data so the subcollection exists from day 0.
           NOTE (audit M1): AI usage is owned server-side at users/{uid}/usage/ai
           (seeded by register/ensure-profile, read/written by aiService). */
        if (seedDocRef) {
          seedDocRef.collection('practice').doc('data').set({
            mistakes: [],
            savedQuestions: [],
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(function (err) { console.warn('Practice seed failed:', err); });
        }
      });
    }).catch(function (err) {
      /* Offline or server hiccup: the user keeps working on local defaults; the next login retries. */
      console.warn('Server-side profile provisioning failed (will retry on next login):', err && err.message);
    });
  }

  /* ADR-117: delegate to the canonical entitlement core (data/entitlement-core.js). Fail-closed:
     if it is unavailable, every timestamp parses to 0 ⇒ treated as "no valid expiry". */
  function _core() { return (typeof QR_ENTITLEMENT !== 'undefined') ? QR_ENTITLEMENT : null; }
  function _toMillis(ts) {
    var c = _core();
    return c ? c.toMillis(ts) : 0;
  }

  function _normalizeMonetization(data, docRef) {
    if (!data) return;
    var hasAll =
      (data.plan === 'free' || data.plan === 'premium') &&
      data.hasOwnProperty('planType') &&
      data.hasOwnProperty('planExpiry') &&
      typeof data.isTrial === 'boolean' &&
      data.hasOwnProperty('trialEnd') &&
      data.hasOwnProperty('createdAt') &&
      data.hasOwnProperty('updatedAt');
    if (hasAll) return;

    var patch = {};
    if (data.plan !== 'free' && data.plan !== 'premium') patch.plan = 'free';
    if (!data.hasOwnProperty('planType')) patch.planType = null;
    if (!data.hasOwnProperty('planExpiry')) patch.planExpiry = null;
    if (!data.hasOwnProperty('planSource')) patch.planSource = null;
    if (typeof data.isTrial !== 'boolean') patch.isTrial = false;
    if (!data.hasOwnProperty('trialEnd')) patch.trialEnd = null;
    if (!data.hasOwnProperty('createdAt')) patch.createdAt = new Date().toISOString();
    if (!data.hasOwnProperty('updatedAt')) patch.updatedAt = new Date().toISOString();

    var keys = Object.keys(patch);
    if (keys.length === 0) return;

    // ADR-041: entitlement fields (plan/planExpiry/planType/planSource/isTrial/trialEnd) are SERVER-AUTHORITATIVE.
    // Normalize IN MEMORY only for this session's local view — NEVER write them back to Firestore. Writing a
    // client-derived default here could clobber a fresh server grant in flight (the rules permit client downgrades
    // to free/null, so a stale "fill" would silently drop the user's premium). The server (register/activatePremium)
    // is the sole writer; aiService.resolvePlan self-heals expiry on read.
    for (var i = 0; i < keys.length; i++) {
      data[keys[i]] = patch[keys[i]];
    }
  }

  var _defaultStats = {
    totalAttempted: 0, totalCorrect: 0,
    bestStreak: 0, currentStreak: 0,
    drillSessions: 0, timedTestSessions: 0,
    dailyStreak: 0, bestDailyStreak: 0, lastActiveDate: null,
    lastPracticeDate: null,
    todayAttempted: 0, todayCorrect: 0,
    categoryStats: {}, mistakes: [],
    responseTimes: [], dailyHistory: {}
  };

  var _defaultSettings = {
    darkMode: false, sound: true, vibration: true, difficulty: 'medium',
    dailyGoal: 20, reducedMotion: false, skipEnabled: false, notificationsEnabled: false,
    theme: 'classic'
  };

  function _validateAndFillDefaults(data, docRef) {
    if (!data) return;
    var patch = {};
    var needsPatch = false;

    if (!data.stats || typeof data.stats !== 'object') {
      data.stats = JSON.parse(JSON.stringify(_defaultStats));
      patch.stats = data.stats;
      needsPatch = true;
    } else {
      var sk = Object.keys(_defaultStats);
      for (var i = 0; i < sk.length; i++) {
        if (data.stats[sk[i]] === undefined) {
          data.stats[sk[i]] = _defaultStats[sk[i]];
          needsPatch = true;
        }
      }
      if (needsPatch) patch.stats = data.stats;
    }

    if (!data.settings || typeof data.settings !== 'object') {
      data.settings = JSON.parse(JSON.stringify(_defaultSettings));
      patch.settings = data.settings;
      needsPatch = true;
    } else {
      var stk = Object.keys(_defaultSettings);
      var settingsPatched = false;
      for (var j = 0; j < stk.length; j++) {
        if (data.settings[stk[j]] === undefined) {
          data.settings[stk[j]] = _defaultSettings[stk[j]];
          settingsPatched = true;
        }
      }
      if (settingsPatched) {
        patch.settings = data.settings;
        needsPatch = true;
      }
    }

    if (!Array.isArray(data.quickLinks)) { data.quickLinks = ['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks']; patch.quickLinks = data.quickLinks; needsPatch = true; }
    if (!Array.isArray(data.customTopics)) { data.customTopics = []; patch.customTopics = data.customTopics; needsPatch = true; }
    if (!data.customFormulas || typeof data.customFormulas !== 'object') { data.customFormulas = {}; patch.customFormulas = data.customFormulas; needsPatch = true; }
    if (!Array.isArray(data.bookmarks)) { data.bookmarks = []; patch.bookmarks = data.bookmarks; needsPatch = true; }

    if (!needsPatch) return;
    patch.updatedAt = new Date().toISOString();
    data.updatedAt = patch.updatedAt;
    docRef.set(patch, { merge: true }).then(function () {

    }).catch(function (err) {
      console.warn('Failed to fill missing defaults:', err);
    });
  }

  /**
   * v3: client-side premium expiry self-heal — LOCAL VIEW ONLY.
   * Covers paid premium and trials (a trial is plan:'premium' with planExpiry===trialEnd). If the
   * active premium looks lapsed, downgrade the in-memory/cached view so the UI locks immediately.
   *
   * The client MUST NOT persist a plan→'free' write. The server (resolveUserAuth per-request
   * self-heal) is the SOLE writer of the expiry transition. A client persist here was unsafe on two
   * fronts: (a) a device clock set FORWARD past expiry would permanently revoke a valid entitlement
   * server-side, and (b) with offline IndexedDB persistence, `docRef.get()` can resolve a STALE
   * cached snapshot (pre-purchase) whose downgrade would clobber a fresh server grant on reconnect.
   * Server is the source of truth; the client only reflects it locally.
   */
  function _enforcePremiumExpiry(data /*, docRef */) {
    if (!data || data.plan !== 'premium') return;
    /* ADR-117: the SAME canonical decision the paywall and the server use — including the
       clock-rewind anchor (previously this used MAX_SAFE_INTEGER, which downgraded ANY rewound
       clock, even for a user whose premium was still valid) and the no-permanent-tier rule
       (a null/invalid expiry is not an active grant). */
    var c = _core();
    if (c && c.isActivePremium(data)) return;
    if (!c) return;  /* core unavailable: leave the doc untouched, the paywall fails closed anyway */
    /* Local-only downgrade — never written back to Firestore (server is authoritative). */
    var revoked = c.revokeFields();
    for (var k in revoked) { if (Object.prototype.hasOwnProperty.call(revoked, k)) data[k] = revoked[k]; }
  }

  /**
   * Push all local data to Firestore.
   * Used on first launch or after reset.
   */
  function pushAllToFirestore() {
    var docRef = _getUserDocRef();
    if (!docRef) return;

    /* Read from canonical AppState keys (single source of truth) */
    var data = {};
    if (typeof AppState !== 'undefined') {
      try {
        var settings = AppState.getSettings();
        if (settings) data.settings = settings;
      } catch (_) {}
      try {
        var progress = AppState.getProgress();
        if (progress) data.stats = progress;
      } catch (_) {}
      try {
        var quickLinks = AppState.getQuickLinks();
        if (quickLinks) data.quickLinks = quickLinks;
      } catch (_) {}
      try {
        var customTopics = AppState.getCustomTopics();
        if (customTopics) data.customTopics = customTopics;
      } catch (_) {}
      try {
        var customFormulas = AppState.getCustomFormulas();
        if (customFormulas) data.customFormulas = customFormulas;
      } catch (_) {}
      try {
        var bookmarks = AppState.getBookmarks();
        if (bookmarks) data.bookmarks = bookmarks;
      } catch (_) {}
    }

    if (Object.keys(data).length > 0) {
      docRef.set(data, { merge: true }).catch(function (err) {
        console.warn('Firestore push failed:', err);
      });
    }
  }

  /* ADR-054: flush updates that were buffered before the user was ready (called once load completes). */
  function _flushPending() {
    if (FirebaseApp.isReady() && FirebaseApp.getUserId() && Object.keys(_pendingUpdates).length > 0) {
      if (_syncTimer) clearTimeout(_syncTimer);
      _syncTimer = setTimeout(_flushUpdates, 0);
    }
  }

  /**
   * Queue a field update for batched Firestore write.
   * Only changed fields are updated to minimize writes.
   * During active drills, stats updates are deferred until drill ends.
   * @param {string} field - Firestore document field name
   * @param {*} value - Value to write
   */
  function queueUpdate(field, value) {
    /* Update in-memory cache */
    if (_memoryCache) {
      _memoryCache[field] = value;
    }

    /* ADR-054: ALWAYS buffer the update — never silently DROP it when Firebase/auth isn't ready yet (the old
       early-return here meant a first-session write could be lost forever, so the server doc stayed at 0 while
       localStorage had the real data). Buffered updates flush as soon as the user is ready (_flushPending). */
    _pendingUpdates[field] = value;

    if (!FirebaseApp.isReady() || !FirebaseApp.getUserId()) return;   // keep it buffered; flush on ready

    /* During drills, defer all syncing to reduce writes */
    if (_drillActive) return;

    /* Debounce: batch updates */
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(_flushUpdates, SYNC_DEBOUNCE_MS);
  }

  /**
   * Flush all pending updates to Firestore in a single write.
   */
  function _flushUpdates() {
    var docRef = _getUserDocRef();
    if (!docRef || Object.keys(_pendingUpdates).length === 0) return;
    if (_flushInFlight) return;
    var currentUserId = FirebaseApp.getUserId();
    if (!currentUserId || (_loadedUserId && currentUserId !== _loadedUserId)) {
      console.warn('[FirestoreSync:_flushUpdates] aborted: user context changed');
      _pendingUpdates = {};
      _flushRetryCount = 0;
      return;
    }

    var snapshot = {};
    var keys = Object.keys(_pendingUpdates);
    for (var i = 0; i < keys.length; i++) {
      snapshot[keys[i]] = _pendingUpdates[keys[i]];
    }
    /* Use Firestore server timestamp for the main document updatedAt
       to prevent client-side clock manipulation from poisoning the
       clock-skew reference used by trial/PremiumPlus expiry checks. */
    snapshot.updatedAt = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();
    _pendingUpdates = {};
    _flushInFlight = true;
    var gen = _syncGeneration;

    docRef.set(snapshot, { merge: true }).then(function () {
      _flushInFlight = false;
      if (gen !== _syncGeneration) {
        console.warn('[FirestoreSync:_flushUpdates] generation changed after write, discarding follow-up');
        return;
      }
      _flushRetryCount = 0;
      if (_flushRetryTimer) { clearTimeout(_flushRetryTimer); _flushRetryTimer = null; }

      
      /* Trigger subcollection updates after main doc successfully writes */
      if (snapshot.stats) {
        _syncPerformanceSubcollection(snapshot.stats);
      }
      if (snapshot.stats || snapshot.bookmarks) {
        var cachedBookmarks = snapshot.bookmarks || ((_memoryCache && Array.isArray(_memoryCache.bookmarks)) ? _memoryCache.bookmarks : null);
        var cachedStats = snapshot.stats || ((_memoryCache && _memoryCache.stats) ? _memoryCache.stats : null);
        _syncPracticeSubcollection(cachedStats, cachedBookmarks);
      }
      
      if (Object.keys(_pendingUpdates).length > 0) {
        _persistPendingBuffer();   /* still-pending edits stay durable */
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(_flushUpdates, SYNC_DEBOUNCE_MS);
      } else {
        _clearPendingBuffer();     /* everything reached the server — buffer is stale */
      }
    }).catch(function (err) {
      _flushInFlight = false;
      if (gen !== _syncGeneration || !_loadedUserId || FirebaseApp.getUserId() !== currentUserId) {
        console.warn('[FirestoreSync:_flushUpdates] user context changed during failed write, dropping snapshot to prevent cross-user leak');
        return;
      }
      for (var k = 0; k < keys.length; k++) {
        if (!_pendingUpdates.hasOwnProperty(keys[k])) {
          _pendingUpdates[keys[k]] = snapshot[keys[k]];
        }
      }
      _persistPendingBuffer();   /* keep the re-queued data durable across an unload/offline window */
      _flushRetryCount++;
      if (_flushRetryCount <= FLUSH_MAX_RETRIES) {
        console.warn('[FirestoreSync:_flushUpdates] write failed (attempt ' + _flushRetryCount + '/' + FLUSH_MAX_RETRIES + '), retrying in ' + (FLUSH_RETRY_DELAY_MS / 1000) + 's:', err.message || err);
        if (_flushRetryTimer) clearTimeout(_flushRetryTimer);
        _flushRetryTimer = setTimeout(_flushUpdates, FLUSH_RETRY_DELAY_MS);
      } else {
        console.error('[FirestoreSync:_flushUpdates] write failed after ' + FLUSH_MAX_RETRIES + ' retries, data re-queued for next user-triggered sync:', err.message || err);
        _flushRetryCount = 0;
        /* Notify user that their data may not be saved */
        if (typeof showToast === 'function') {
          showToast((typeof QRI18n !== 'undefined') ? QRI18n.t('app.syncWarn') : '⚠️ Changes may not be saved. Check your connection.', 4000);
        }
      }
    });
  }

  /**
   * Flush pending updates and call callback when done.
   * Used for graceful logout to prevent data loss.
   */
  function flushUpdatesAsync(callback) {
    var keys = Object.keys(_pendingUpdates);
    if (keys.length === 0) {
      if (callback) callback();
      return;
    }
    var docRef = _getUserDocRef();
    if (!docRef) {
      if (callback) callback();
      return;
    }
    /* Capture the auth context at entry so a fast logout→relogin-as-different-user race can't cross-wire
       user A's write/buffer into user B (mirrors the guard _flushUpdates has). */
    var currentUserId = FirebaseApp.getUserId();
    var gen = _syncGeneration;
    function _contextChanged() {
      return gen !== _syncGeneration || !_loadedUserId || FirebaseApp.getUserId() !== currentUserId;
    }
    var snapshot = {};
    for (var i = 0; i < keys.length; i++) {
      snapshot[keys[i]] = _pendingUpdates[keys[i]];
    }
    /* S3-FS1: server timestamp (was a client-clock ISO — reintroducing the clock-poisoning vector the
       debounced path deliberately closed). */
    snapshot.updatedAt = _serverTs();
    /* Do NOT clear _pendingUpdates before the write confirms (the old code cleared first, so a failed
       logout write silently DROPPED the user's freshly-answered stats). Persist a durable buffer up
       front so an offline/closing tab can replay them next load. */
    _persistPendingBuffer();
    _flushInFlight = true;
    docRef.set(snapshot, { merge: true }).then(function () {
      _flushInFlight = false;
      if (_contextChanged()) { if (callback) callback(); return; }
      /* Success: drop exactly the fields we wrote (preserve any newer edits queued meanwhile). */
      for (var k = 0; k < keys.length; k++) {
        if (_pendingUpdates[keys[k]] === snapshot[keys[k]]) delete _pendingUpdates[keys[k]];
      }
      if (Object.keys(_pendingUpdates).length === 0) _clearPendingBuffer();
      if (callback) callback();
    }).catch(function (err) {
      _flushInFlight = false;
      /* If the auth context changed during the failed write, do NOT re-persist — that would tag user
         A's data with user B's uid. Drop it (resetSyncState already cleared the queue). */
      if (_contextChanged()) { if (callback) callback(); return; }
      /* Failure: keep the data in _pendingUpdates AND in the durable buffer so it survives the
         logout/unload and replays on the next load — never silently lost. */
      console.warn('[FirestoreSync] flushUpdatesAsync failed (data retained for retry):', err && (err.message || err));
      _persistPendingBuffer();
      if (callback) callback();
    });
  }

  /**
   * Sync settings to Firestore.
   * @param {object} settings
   */
  function syncSettings(settings) {
    queueUpdate('settings', settings);
  }

  /**
   * Sync progress/stats to Firestore.
   * @param {object} stats
   */
  function syncStats(stats) {
    queueUpdate('stats', stats);
  }

  /**
   * Sync quick links to Firestore.
   * @param {Array} links
   */
  function syncQuickLinks(links) {
    queueUpdate('quickLinks', links);
  }

  /**
   * Sync custom topics to Firestore.
   * @param {Array} topics
   */
  function syncCustomTopics(topics) {
    queueUpdate('customTopics', topics);
  }

  /**
   * Sync custom formulas to Firestore.
   * @param {object} formulas
   */
  function syncCustomFormulas(formulas) {
    queueUpdate('customFormulas', formulas);
  }

  /**
   * Sync bookmarks to Firestore.
   * @param {Array} bookmarks
   */
  function syncBookmarks(bookmarks) {
    queueUpdate('bookmarks', bookmarks);
  }

  /**
   * Save a practice session to the subcollection.
   * @param {object} sessionData - {mode, category, score, total, duration, date,
   *   firstHalfAvg?, secondHalfAvg?, sessionImprovementPct?, timedCount?}  (ADR-030 session-improvement)
   */
  function savePracticeSession(sessionData) {
    var docRef = _getUserDocRef();
    if (!docRef) return;

    sessionData.timestamp = new Date().toISOString();
    /* Drop null/undefined keys so the optional Session-Improvement fields (ADR-030) are genuinely ABSENT
       on sessions with <6 timed answers, rather than stored as null. */
    Object.keys(sessionData).forEach(function (k) {
      if (sessionData[k] === null || sessionData[k] === undefined) delete sessionData[k];
    });
    docRef.collection('practiceSessions').add(sessionData).catch(function (err) {
      console.warn('Failed to save practice session:', err);
    });
  }

  /**
   * Clear specific data types from Firestore and localStorage.
   * @param {string} type - 'stats', 'formulas', or 'all'
   * @param {function} [callback] - optional callback receives (error)
   */
  function clearUserData(type, callback) {
    var docRef = _getUserDocRef();

    if (type === 'stats') {
      var resetStats = {
        totalAttempted: 0, totalCorrect: 0,
        bestStreak: 0, currentStreak: 0,
        drillSessions: 0, timedTestSessions: 0,
        dailyStreak: 0, bestDailyStreak: 0,
        lastActiveDate: null,
        lastPracticeDate: null,
        todayAttempted: 0, todayCorrect: 0,
        categoryStats: {}, mistakes: [],
        responseTimes: [], dailyHistory: {}
      };
      if (typeof AppState !== 'undefined') AppState.setProgress(resetStats);
      if (typeof invalidateProgressCache === 'function') invalidateProgressCache();
      if (_memoryCache) _memoryCache.stats = resetStats;
      if (docRef) {
        docRef.set({ stats: resetStats }, { merge: true }).then(function () {
          /* Also reset structured subcollections so they stay consistent */
          var uid = docRef.id;
          var db = docRef.firestore;
          var subWrites = [
            db.collection('users').doc(uid).collection('performance').doc('overall').set({
              totalAttempted: 0, totalCorrect: 0, accuracy: 0, avgTime: 0,
              bestStreak: 0, currentStreak: 0,
              dailyStreak: 0, bestDailyStreak: 0,
              drillSessions: 0, timedTestSessions: 0,
              categoryStats: {}, responseTimes: [],
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(function (e) { console.warn('[FirestoreSync:clearUserData] performance reset failed:', e.message || e); }),
            db.collection('users').doc(uid).collection('practice').doc('data').set({
              mistakes: [], savedQuestions: [],
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(function (e) { console.warn('[FirestoreSync:clearUserData] practice reset failed:', e.message || e); })
          ];
          return Promise.all(subWrites).then(function () {
            if (callback) callback(null);
          });
        }).catch(function (err) {
          if (callback) callback(err.message);
        });
      } else {
        if (callback) callback(null);
      }
    } else if (type === 'formulas') {
      if (typeof AppState !== 'undefined') {
        AppState.setCustomFormulas({});
        AppState.setCustomTopics([]);
        AppState.setBookmarks([]);
      }
      if (_memoryCache) {
        _memoryCache.customFormulas = {};
        _memoryCache.customTopics = [];
        _memoryCache.bookmarks = [];
      }
      if (docRef) {
        docRef.set({ customFormulas: {}, customTopics: [], bookmarks: [] }, { merge: true }).then(function () {
          if (callback) callback(null);
        }).catch(function (err) {
          if (callback) callback(err.message);
        });
      } else {
        if (callback) callback(null);
      }
    } else if (type === 'all') {
      var defaultSettings = {
        darkMode: false, sound: true, vibration: true, difficulty: 'medium',
        dailyGoal: 20, reducedMotion: false, skipEnabled: false, notificationsEnabled: false,
        theme: 'classic'
      };
      var defaultStats = {
        totalAttempted: 0, totalCorrect: 0,
        bestStreak: 0, currentStreak: 0,
        drillSessions: 0, timedTestSessions: 0,
        dailyStreak: 0, bestDailyStreak: 0,
        lastActiveDate: null,
        lastPracticeDate: null,
        todayAttempted: 0, todayCorrect: 0,
        categoryStats: {}, mistakes: [],
        responseTimes: [], dailyHistory: {}
      };
      /* Write to canonical AppState keys (single source of truth for localStorage) */
      if (typeof AppState !== 'undefined') {
        AppState.setSettings(defaultSettings);
        AppState.setProgress(defaultStats);
        AppState.setQuickLinks(['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks']);
        AppState.setCustomTopics([]);
        AppState.setCustomFormulas({});
        AppState.setBookmarks([]);
        AppState.setNotifEnabled(false);
      }
      if (typeof invalidateProgressCache === 'function') invalidateProgressCache();
      /* Cancel any active notification timers */
      if (typeof NotificationManager !== 'undefined') {
        NotificationManager.cancelScheduledNotifications();
      }
      var resetAll = {
        settings: defaultSettings,
        stats: defaultStats,
        quickLinks: ['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks'],
        customTopics: [],
        customFormulas: {},
        bookmarks: []
      };
      /* Preserve profile data in memory cache (account info should not be cleared) */
      var existingProfile = _memoryCache ? _memoryCache.profile : null;
      _memoryCache = resetAll;
      if (existingProfile) _memoryCache.profile = existingProfile;
      if (docRef) {
        docRef.set(resetAll, { merge: true }).then(function () {
          /* Also reset structured subcollections so they stay consistent */
          var uid = docRef.id;
          var db = docRef.firestore;
          var subWrites = [
            db.collection('users').doc(uid).collection('performance').doc('overall').set({
              totalAttempted: 0, totalCorrect: 0, accuracy: 0, avgTime: 0,
              bestStreak: 0, currentStreak: 0,
              dailyStreak: 0, bestDailyStreak: 0,
              drillSessions: 0, timedTestSessions: 0,
              categoryStats: {}, responseTimes: [],
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(function (e) { console.warn('[FirestoreSync:clearUserData] performance reset failed:', e.message || e); }),
            db.collection('users').doc(uid).collection('practice').doc('data').set({
              mistakes: [], savedQuestions: [],
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(function (e) { console.warn('[FirestoreSync:clearUserData] practice reset failed:', e.message || e); })
          ];
          return Promise.all(subWrites).then(function () {
            if (callback) callback(null);
          });
        }).catch(function (err) {
          if (callback) callback(err.message);
        });
      } else {
        if (callback) callback(null);
      }
    }
  }

  /**
   * Begin drill mode — defers Firestore writes until drill ends.
   * Reduces write costs during rapid stat updates.
   */
  function beginDrillBatch() {
    _drillActive = true;
  }

  /**
   * End drill mode — flushes all pending updates to Firestore.
   */
  function endDrillBatch() {
    _drillActive = false;
    if (Object.keys(_pendingUpdates).length > 0) {
      _flushUpdates();
    }
    /* Flush subcollections once at drill end using latest cached stats.
       This guarantees performance/overall and practice/data are updated
       even though per-answer calls are gated by _drillActive. */
    if (_memoryCache && _memoryCache.stats) {
      _syncPerformanceSubcollection(_memoryCache.stats);
      _syncPracticeSubcollection(
        _memoryCache.stats,
        Array.isArray(_memoryCache.bookmarks) ? _memoryCache.bookmarks : null
      );
    }
  }

  /* Flush pending updates when the page is closing. Persist a durable buffer FIRST (synchronously) so
     that if we're offline — where the Firestore write promise never resolves before the tab dies —
     the data survives and replays on next load (S3-FS2). */
  window.addEventListener('beforeunload', function () {
    if (Object.keys(_pendingUpdates).length > 0) {
      _persistPendingBuffer();
      _flushUpdates();
    }
  });

  /* Flush when app goes to background (mobile PWA) */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && Object.keys(_pendingUpdates).length > 0) {
      _persistPendingBuffer();
      _flushUpdates();
    }
  });

  return {
    loadFromFirestore: loadFromFirestore,
    pushAllToFirestore: pushAllToFirestore,
    resetSyncState: resetSyncState,
    flushUpdatesAsync: flushUpdatesAsync,
    syncSettings: syncSettings,
    syncStats: syncStats,
    syncQuickLinks: syncQuickLinks,
    syncCustomTopics: syncCustomTopics,
    syncCustomFormulas: syncCustomFormulas,
    syncBookmarks: syncBookmarks,
    savePracticeSession: savePracticeSession,
    clearUserData: clearUserData,
    beginDrillBatch: beginDrillBatch,
    endDrillBatch: endDrillBatch,
    /**
     * Expose the in-memory cache for profile reading (used by settings).
     * @returns {object|null}
     */
    _getCache: function () { return _memoryCache; },
    /**
     * Update the user's display name in Firestore profile.
     * @param {string} name
     */
    updateProfileName: function (name) {
      if (!name) return;
      if (_memoryCache && _memoryCache.profile) {
        /* Full profile is cached — update in-place and queue the whole object.
           set({ profile: fullObj }, { merge:true }) safely replaces only the
           profile top-level key while keeping all other document fields. */
        _memoryCache.profile.name = name;
        queueUpdate('profile', _memoryCache.profile);
      } else {
         /* No full profile in cache — use dot-notation update to avoid
            overwriting createdAt inside the profile sub-document.
            set({ profile: {name} }, { merge:true }) would replace the ENTIRE
           profile map; update() with dot notation patches only the one field. */
        if (_memoryCache) _memoryCache.profile = { name: name };
        var docRef = _getUserDocRef();
        if (docRef) {
          docRef.update({ 'profile.name': name }).catch(function (err) {
            console.warn('Failed to update profile name (dot-notation fallback):', err);
          });
        }
      }
    },
    getAccessState: function () {
      if (!_memoryCache) return null;
      /* Self-heal lapsed premium/trial — LOCAL VIEW ONLY (covers both; a trial is plan:'premium').
         The client never persists a plan→'free' write: the server is the sole authority for the
         expiry transition. See _enforcePremiumExpiry for the full rationale (forward-clock +
         stale-offline-cache can otherwise clobber a valid/fresh server entitlement).
         ADR-117: resolved through the canonical core, so the state this function RETURNS already
         obeys the no-permanent-tier rule. That matters because consumers such as settings.js read
         `accessState.plan` directly — normalising here keeps every such reader in agreement with
         hasActivePremium() instead of each re-deriving the rule. */
      var _c = _core();
      if (_memoryCache.plan === 'premium' && _c && !_c.isActivePremium(_memoryCache)) {
        var _revoked = _c.revokeFields();
        for (var _rk in _revoked) { if (Object.prototype.hasOwnProperty.call(_revoked, _rk)) _memoryCache[_rk] = _revoked[_rk]; }
      }

      /* Days remaining on an active trial (for "Trial — N days left" UI) — same clock-safe anchor
         as every other entitlement computation (ADR-117). */
      var computedTrialDays = null;
      if (_memoryCache.isTrial === true && _memoryCache.trialEnd) {
        var _teMs = _toMillis(_memoryCache.trialEnd);
        var _trialNow = _c ? _c.clockSafeNow(_memoryCache) : Date.now();
        if (_teMs > 0) computedTrialDays = Math.max(0, Math.ceil((_teMs - _trialNow) / 86400000));
      }

      return {
        plan: _memoryCache.plan === 'premium' ? 'premium' : 'free',
        planType: _memoryCache.planType || null,
        planExpiry: _memoryCache.planExpiry || null,
        planSource: _memoryCache.planSource || null,
        isTrial: _memoryCache.isTrial === true,
        trialEnd: _memoryCache.trialEnd || null,
        trialDays: computedTrialDays,
        createdAt: _memoryCache.createdAt || null,
        /* ADR-107 cert fix: expose the server-written timestamps so paywall._clockSafeNow can anchor the
           rewound-clock guard to a real server write (activatePremium writes both) instead of always falling back
           to createdAt (which is far in the past, making the guard inert). */
        updatedAt: _memoryCache.updatedAt || null,
        planUpdatedAt: _memoryCache.planUpdatedAt || null
      };
    },
    /**
     * v2: reflect a just-completed Premium activation in the local cache for
     * instant UI feedback. The server already wrote Firestore via Admin SDK in
     * /api/payment?action=verify; client entitlement grants are blocked by rules.
     */
    activatePremium: function (planType, expiry, paymentId, callback) {
      if (_memoryCache) {
        _memoryCache.plan = 'premium';
        _memoryCache.planType = planType || null;
        _memoryCache.planExpiry = expiry || null;
        _memoryCache.planSource = 'purchase';
        _memoryCache.isTrial = false;
        _memoryCache.trialEnd = null;
        if (paymentId) _memoryCache.lastPaymentId = String(paymentId);
      }
      if (callback) callback(null);
    },
    /**
     * Re-read the user doc from the server and refresh ONLY the entitlement
     * fields in the in-memory cache (no localStorage wipe). Used by the paywall
     * "Restore Access" action so a purchase made on another device is picked up
     * without disturbing local settings/progress.
     */
    refreshFromServer: function (callback) {
      var docRef = _getUserDocRef();
      if (!docRef) { if (callback) callback(false); return; }
      docRef.get().then(function (doc) {
        if (doc.exists && _memoryCache) {
          var d = doc.data();
          _memoryCache.plan = d.plan === 'premium' ? 'premium' : 'free';
          _memoryCache.planType = d.planType || null;
          _memoryCache.planExpiry = d.planExpiry || null;
          _memoryCache.planSource = d.planSource || null;
          _memoryCache.isTrial = d.isTrial === true;
          _memoryCache.trialEnd = d.trialEnd || null;
          _enforcePremiumExpiry(_memoryCache, docRef);
        }
        if (callback) callback(true);
      }).catch(function () { if (callback) callback(false); });
    },
    claimCoaching: function (coachingId, callback) {
      if (!FirebaseApp.isReady() || !FirebaseApp.getUserId()) {
        if (callback) callback(new Error('User not authenticated'));
        return;
      }
      if (typeof Auth === 'undefined' || !Auth.getCurrentUser()) {
        if (callback) callback(new Error('User not authenticated'));
        return;
      }
      
      Auth.getCurrentUser().getIdToken().then(function (token) {
        return fetch('/api/account?action=claim-coaching', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-Session-Id': (window.Session ? Session.id() : '')
          },
          body: JSON.stringify({ coachingId: coachingId })
        });
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error.message || 'Failed to claim coaching');
        if (_memoryCache) _memoryCache.coachingId = coachingId;

        if (callback) callback(null);
      })
      .catch(function (err) {
        console.error('[FirestoreSync] claimCoaching error:', err);
        if (callback) callback(err);
      });
    },
    listenForNotifications: function (onData) {
      if (!FirebaseApp.isReady() || !FirebaseApp.getUserId()) return null;
      var db = FirebaseApp.getDb();
      // Tear down any existing listener first so repeated refresh() calls (e.g. a markRead rollback) never stack
      // duplicate onSnapshot subscriptions on the same collection. Ownership lives here so resetSyncState (logout)
      // can also unsubscribe — preventing a listener for the previous user surviving a sign-out / user switch.
      if (_notifUnsub) { try { _notifUnsub(); } catch (_) {} _notifUnsub = null; }
      _notifUnsub = db.collection('users').doc(FirebaseApp.getUserId()).collection('notifications')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot({ includeMetadataChanges: true }, function(snapshot) {
          var notifications = [];
          var unreadCount = 0;
          snapshot.forEach(function(doc) {
            var d = doc.data();
            if (d.archived) return;                  // ADR-066: archived notifications are hidden from the inbox
            if (!d.isRead) unreadCount++;
            notifications.push({
              id: doc.id,
              title: d.title || '',
              body: d.body || '',
              type: d.type || 'announcement',
              category: d.category || 'system',       // ADR-066: enriched fields for the premium inbox
              priority: d.priority || 'normal',
              icon: d.icon || null,
              deepLink: d.deepLink || null,
              metadata: d.metadata || null,            // seam: carries e.g. duel metadata.code for future routing
              isRead: !!d.isRead,
              timestamp: d.timestamp ? (d.timestamp.toDate ? d.timestamp.toDate().toISOString() : d.timestamp) : null
            });
          });
          if (onData) onData({ notifications: notifications, unreadCount: unreadCount });
        }, function(err) {
          console.warn('Notifications snapshot error', err);
        });
      return _notifUnsub;
    },
    getNotifications: function (callback) {
      if (!FirebaseApp.isReady() || !FirebaseApp.getUserId()) return callback(new Error('Unauthenticated'));
      Auth.getCurrentUser().getIdToken().then(function (token) {
        return fetch('/api/account?action=notifications-list', {
          headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Id': (window.Session ? Session.id() : '') }
        });
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error.message || 'Failed to fetch notifications');
        if (callback) callback(null, data);
      })
      .catch(function (err) {
        if (callback) callback(err);
      });
    },
    markNotificationRead: function (id, callback) {
      if (!FirebaseApp.isReady() || !FirebaseApp.getUserId()) return callback(new Error('Unauthenticated'));
      Auth.getCurrentUser().getIdToken().then(function (token) {
        return fetch('/api/account?action=notifications-markRead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Session-Id': (window.Session ? Session.id() : '') },
          body: JSON.stringify({ id: id })
        });
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error.message || 'Failed to mark read');
        if (callback) callback(null);
      })
      .catch(function (err) {
        if (callback) callback(err);
      });
    },
    updateCoachingId: function (coachingId) {
      /* Legacy support fallback - delegates to claimCoaching */
      this.claimCoaching(coachingId);
    },
    setPendingCoachingId: setPendingCoachingId,
    // ADR-066: RETIRED. Clients must never create notifications — the Inbox is server-write only (Firestore rules
    // enforce this). All notifications originate from the unified server pipeline. Kept as a no-op for safety.
    createSystemNotification: function () { /* retired (ADR-066): notifications are server-created only */ },
    flushPendingSystemNotifications: _flushPendingSystemNotifications
  };
})();
