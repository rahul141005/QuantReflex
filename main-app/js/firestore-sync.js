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
 *   Structured subcollections (dual-written alongside root doc, read-only for now):
 *   users/{userId}/profile/data                  (name, premium flags)
 *   users/{userId}/performance/overall           (derived accuracy, avgTime, streaks)
 *   users/{userId}/practice/data                 (mistakes, savedQuestions)
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
  var _planExpiryPersistInFlight = false;
  var _flushRetryCount = 0;
  var _flushRetryTimer = null;
  var _flushInFlight = false;
  var _syncGeneration = 0;
  var _pendingCoachingId = null;
  var _notifUnsub = null;  /* the active notifications onSnapshot unsubscribe — torn down on re-listen + logout */
  // ADR-066: clients no longer CREATE notifications (the Inbox is server-write only). These remain as harmless
  // no-ops so any stray caller/export keeps working; all notifications now originate from the server pipeline.
  function _flushPendingSystemNotifications() { /* retired (ADR-066) */ }
  var SYNC_DEBOUNCE_MS = 2000; /* batch updates every 2 seconds */
  var FLUSH_RETRY_DELAY_MS = 5000;
  var FLUSH_MAX_RETRIES = 2;
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

  function _syncProfileSubcollection(profile, premiumFlags) {
    var payload = { updatedAt: new Date().toISOString() };
    try {
      var currentUser = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
      if (currentUser && currentUser.email) payload.email = currentUser.email;
    } catch (_) {}
    if (profile) {
      if (profile.name !== undefined) payload.name = profile.name || '';

    }
    if (premiumFlags) {
      if (premiumFlags.plan !== undefined) payload.plan = premiumFlags.plan === 'premium' ? 'premium' : 'free';
      if (premiumFlags.planType !== undefined) payload.planType = premiumFlags.planType || null;
      if (premiumFlags.planExpiry !== undefined) payload.planExpiry = premiumFlags.planExpiry || null;
      if (premiumFlags.isTrial !== undefined) payload.isTrial = !!premiumFlags.isTrial;
      if (premiumFlags.trialEnd !== undefined) payload.trialEnd = premiumFlags.trialEnd || null;
    }
    _subcollectionWrite('profile', 'data', payload, 'Profile');
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

    _memoryCache = null;
    _dataLoaded = false;
    _pendingUpdates = {};
    _drillActive = false;
    _loadedUserId = null;
    _flushRetryCount = 0;
    _flushInFlight = false;
    _planExpiryPersistInFlight = false;
    if (_flushRetryTimer) {
      clearTimeout(_flushRetryTimer);
      _flushRetryTimer = null;
    }
    if (_syncTimer) {
      clearTimeout(_syncTimer);
      _syncTimer = null;
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
      /* ADR-054: the user is now ready — flush any updates that were buffered before Firebase/auth came up
         (e.g. questions answered during onboarding), so a first session always reaches users/{uid}.stats. */
      _flushPending();
      if (callback) callback(true);

    }).catch(function (err) {
      console.warn('Firestore load failed:', err);
      _dataLoaded = true; /* Mark as loaded to prevent retries */
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
    /* Simple document creation — no transaction, no appMeta read.
       New users start on free tier (plan:'free', isTrial:false). */
    docRef.get().then(function (userDoc) {
      if (userDoc.exists) return;
      return docRef.set(fallbackDefaults, { merge: true }).then(function () {

        /* Non-blocking: eagerly seed all structured subcollections for new user */
        var mc = _memoryCache || fallbackDefaults;
        var seedDocRef = _getUserDocRef();
        _syncProfileSubcollection(
          { name: (mc.profile && mc.profile.name) || '' },
          { plan: 'free', planType: null, planExpiry: null, isTrial: false, trialEnd: null }
        );
        _syncPerformanceSubcollection(mc.stats || fallbackDefaults.stats);
        /* Eagerly create practice/data so the subcollection exists from day 0.
           NOTE (audit M1): AI usage is owned server-side at users/{uid}/usage/ai
           (seeded by /api/auth/register, read/written by aiService). The old
           client-side ai/usage seed was an orphaned mirror that nothing read —
           removed to eliminate schema drift. */
        if (seedDocRef) {
          seedDocRef.collection('practice').doc('data').set({
            mistakes: [],
            savedQuestions: [],
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(function (err) { console.warn('Practice seed failed:', err); });
        }

      });
    }).catch(function (err) {
      console.warn('Firestore default document creation failed:', err);
      docRef.set(fallbackDefaults, { merge: true }).catch(function (fallbackErr) {
        console.warn('Firestore fallback default document creation failed:', fallbackErr);
      });
    });
  }

  function _toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') {
      var parsed = Date.parse(ts);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof ts.toDate === 'function') {
      try { return ts.toDate().getTime(); } catch (_) { return 0; }
    }
    if (ts instanceof Date) return ts.getTime();
    return 0;
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
   * v2: client-side premium expiry self-heal. Covers both paid premium and
   * trials (a trial is plan:'premium' with planExpiry===trialEnd). If the
   * active premium has lapsed, downgrade to free locally + persist. Rules
   * allow this client write (plan→'free' is a permitted revocation).
   */
  function _enforcePremiumExpiry(data, docRef) {
    if (!data || data.plan !== 'premium') return;
    var expiryMs = _toMillis(data.planExpiry);
    var now = Date.now();
    var lastUpdateMs = _toMillis(data.updatedAt) || _toMillis(data.createdAt);
    /* Clock-rewind guard: if device clock is >5min behind last server write,
       treat as far-future so a wrong local clock can't revoke valid premium. */
    if (lastUpdateMs > 0 && now < lastUpdateMs - 300000) now = Number.MAX_SAFE_INTEGER;
    if (!expiryMs || expiryMs >= now) return;
    data.plan = 'free';
    data.planType = null;
    data.planExpiry = null;
    data.planSource = null;
    data.isTrial = false;
    data.trialEnd = null;
    docRef.set({
      plan: 'free', planType: null, planExpiry: null, planSource: null,
      isTrial: false, trialEnd: null,
      planUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }, { merge: true }).then(function () {

    }).catch(function (err) {
      console.warn('[FirestoreSync:_enforcePremiumExpiry] failed to persist expiry:', err.message || err);
    });
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
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(_flushUpdates, SYNC_DEBOUNCE_MS);
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
          showToast('⚠️ Changes may not be saved. Check your connection.', 4000);
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
    var snapshot = {};
    for (var i = 0; i < keys.length; i++) {
      snapshot[keys[i]] = _pendingUpdates[keys[i]];
    }
    snapshot.updatedAt = new Date().toISOString();
    _pendingUpdates = {};
    docRef.set(snapshot, { merge: true }).then(function () {
      if (callback) callback();
    }).catch(function (err) {
      console.warn('[FirestoreSync] flushUpdatesAsync failed:', err);
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

  /* Flush pending updates when the page is closing */
  window.addEventListener('beforeunload', function () {
    if (Object.keys(_pendingUpdates).length > 0) {
      _flushUpdates();
    }
  });

  /* Flush when app goes to background (mobile PWA) */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && Object.keys(_pendingUpdates).length > 0) {
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
      _syncProfileSubcollection({ name: name }, null);
    },
    /**
     * Update the user's coaching ID in Firestore.
     * @param {string} coachingId - the coaching institute identifier (or empty to clear)
     */
    updateCoachingId: function (coachingId) {
      var sanitized = (typeof coachingId === 'string') ? coachingId.trim().substring(0, 50) : null;
      if (sanitized === '') sanitized = null;
      if (_memoryCache) _memoryCache.coachingId = sanitized;
      queueUpdate('coachingId', sanitized);
    },
    getAccessState: function () {
      if (!_memoryCache) return null;
      var now = Date.now();
      /* Self-heal expired premium/trial (covers both — a trial is plan:'premium') */
      if (_memoryCache.plan === 'premium') {
        var expMs = _toMillis(_memoryCache.planExpiry);
        if (expMs > 0 && expMs < now) {
          _memoryCache.plan = 'free';
          _memoryCache.planType = null;
          _memoryCache.planExpiry = null;
          _memoryCache.planSource = null;
          _memoryCache.isTrial = false;
          _memoryCache.trialEnd = null;
          if (!_planExpiryPersistInFlight) {
            var docRef = _getUserDocRef();
            if (docRef) {
              _planExpiryPersistInFlight = true;
              docRef.set({
                plan: 'free', planType: null, planExpiry: null, planSource: null,
                isTrial: false, trialEnd: null,
                planUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
              }, { merge: true }).catch(function (err) {
                console.warn('Failed to persist premium expiry from access state:', err);
              }).finally(function () {
                _planExpiryPersistInFlight = false;
              });
            }
          }
        }
      }

      /* Days remaining on an active trial (for "Trial — N days left" UI) */
      var computedTrialDays = null;
      if (_memoryCache.isTrial === true && _memoryCache.trialEnd) {
        var _teMs = _toMillis(_memoryCache.trialEnd);
        if (_teMs > 0) computedTrialDays = Math.max(0, Math.ceil((_teMs - now) / 86400000));
      }

      return {
        plan: _memoryCache.plan === 'premium' ? 'premium' : 'free',
        planType: _memoryCache.planType || null,
        planExpiry: _memoryCache.planExpiry || null,
        planSource: _memoryCache.planSource || null,
        isTrial: _memoryCache.isTrial === true,
        trialEnd: _memoryCache.trialEnd || null,
        trialDays: computedTrialDays,
        createdAt: _memoryCache.createdAt || null
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
      _syncProfileSubcollection(null, { plan: 'premium', planType: planType || null, planExpiry: expiry || null, isTrial: false, trialEnd: null });
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
            'Authorization': 'Bearer ' + token
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
          headers: { 'Authorization': 'Bearer ' + token }
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
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
