/**
 * question-bank-service.js — Centralized Question Bank Client
 *
 * Reads curated, AI-generated questions from the Firestore `questions`
 * collection (managed by the Super Admin ecosystem).
 *
 * Replaces runtime OpenAI generation with a pre-generated, approved,
 * centralized question bank — preserving the AI-powered experience.
 *
 * Features:
 *   - In-memory cache with configurable TTL
 *   - Per-document normalization and validation (full schema support)
 *   - Topic key normalization (handles hyphen/underscore variants)
 *   - Intelligent difficulty fallback (medium → easy → hard)
 *   - Shuffle for variety on each fetch
 *   - De-duplication guard against concurrent requests
 *   - premiumOnly filtering (future-safe)
 *
 * Dependencies (expected globals):
 *   FirebaseApp, Auth, showToast (optional)
 */

var QuestionBankService = (function () {
  /* ---- Constants ---- */
  var COLLECTION = 'questions';
  var _CACHE_TTL_MS = 30 * 60 * 1000; /* 30 minutes */
  var _MAX_FETCH_MULTIPLIER = 3;      /* fetch N*3 for shuffle variety */

  /* ---- State ---- */
  var _cache = {};          /* keyed by "{topic}_{difficulty}" */
  var _fetchInFlight = {};  /* de-duplication guard */

  /* ---- Difficulty fallback order ---- */
  var _FALLBACK_MAP = {
    easy:   ['medium'],
    medium: ['easy', 'hard'],
    hard:   ['medium']
  };

  /* ---- Firestore reference helper ---- */
  function _getDb() {
    if (typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady()) {
      return FirebaseApp.getDb();
    }
    return null;
  }

  /* ---- Topic key normalization ---- */

  /**
   * Normalize topic keys to handle both hyphen-separated (main app: 'profit-loss')
   * and underscore-separated (admin: 'profit_loss') conventions.
   * Returns both variants so queries can match either format.
   *
   * @param {string} topic - raw topic key
   * @returns {string[]} array of topic variants to query
   */
  function _getTopicVariants(topic) {
    if (!topic) return [];
    var variants = [topic];
    /* If topic uses hyphens, also try underscores and vice versa */
    if (topic.indexOf('-') !== -1) {
      variants.push(topic.replace(/-/g, '_'));
    } else if (topic.indexOf('_') !== -1) {
      variants.push(topic.replace(/_/g, '-'));
    }
    return variants;
  }

  /* ---- Cache helpers ---- */

  function _cacheKey(topic, difficulty) {
    return (topic || 'all') + '_d_' + (difficulty || 'medium');
  }

  function _getCached(key) {
    if (!_cache[key]) return null;
    var age = Date.now() - (_cache[key].timestamp || 0);
    if (age > _CACHE_TTL_MS) {
      delete _cache[key];
      return null;
    }
    return _cache[key].data;
  }

  function _setCache(key, data) {
    _cache[key] = { data: data, timestamp: Date.now() };
  }

  /**
   * Clear all cached questions (e.g. on logout).
   */
  function clearCache() {
    _cache = {};
    _fetchInFlight = {};
  }

  /* ---- Document normalization ---- */

  /**
   * Normalize a raw Firestore document into the format expected by the
   * drill engine. Returns null if the document is malformed.
   *
   * Maps Admin Panel fields (text, category) to the strict schema requested
   * (question, topic) to guarantee ecosystem compatibility.
   */
  function _normalizeQuestion(doc) {
    var d;
    try {
      d = doc.data();
    } catch (_) {
      return null;
    }
    if (!d) return null;

    /* Handle canonical schema fields */
    var questionText = d.question || '';
    var topicKey = d.topic || '';

    /* Required: question text */
    if (typeof questionText !== 'string' || !questionText.trim()) return null;
    if (questionText.length > 2000) return null; /* sanity cap */

    /* Required: answer (numeric) */
    if (d.answer === undefined || d.answer === null) return null;
    var answer = (typeof d.answer === 'number') ? d.answer : parseFloat(d.answer);
    if (isNaN(answer)) return null;

    /* Status validation: must be active. 
       If 'approved' field exists, it must be true, otherwise assume true if active. */
    if (d.status !== 'active') return null;
    if (d.approved !== undefined && d.approved !== true) return null;

    /* Normalize explanation */
    var steps = '';
    if (typeof d.explanation === 'string' && d.explanation.trim()) {
      steps = d.explanation.trim();
    }

    /* Normalize options array (future MCQ support) */
    var options = Array.isArray(d.options) ? d.options : [];

    return {
      id: doc.id,
      question: questionText.trim(),
      answer: answer,
      steps: steps, // We keep the local memory object property as 'steps' because the UI components might depend on it.
      category: topicKey, // We keep local memory object property as 'category' to not break local DrillEngine, but it comes strictly from 'topic'.
      options: options,
      premiumOnly: d.premiumOnly === true,
      difficulty: d.difficulty || 'medium'
    };
  }

  /* ---- Shuffle utility ---- */

  function _shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /* ---- Core fetch ---- */

  /**
   * Query Firestore for questions matching the given filters.
   * Handles topic key normalization (hyphen/underscore variants).
   * Returns an array of normalized question objects via callback.
   *
   * @param {string} topic
   * @param {string} difficulty
   * @param {number} limit
   * @param {function} callback - (error, questions[])
   */
  function _queryQuestions(topic, difficulty, limit, callback) {
    var db = _getDb();
    if (!db) {
      callback('Database not available');
      return;
    }

    var key = _cacheKey(topic, difficulty);

    /* Check cache first */
    var cached = _getCached(key);
    if (cached && cached.length > 0) {
      var pool = cached.slice();
      _shuffleInPlace(pool);
      callback(null, pool.slice(0, limit));
      return;
    }

    /* Build base query */
    var baseRef = db.collection(COLLECTION);

    /* Get topic variants to handle hyphen/underscore naming differences */
    var topicVariants = topic ? _getTopicVariants(topic) : [];

    /**
     * Execute query for a single topic variant.
     * Returns a promise resolving to an array of normalized questions.
     */
    function _runQuery(topicValue) {
      /* 
       * Query strictly by status='active'.
       * We drop 'approved' and 'type' from the query level because the Admin 
       * Panel doesn't currently write them. Normalization enforces strict rules client-side.
       */
      var query = baseRef.where('status', '==', 'active');

      if (topicValue) {
        /* Admin Panel stores topic under 'topic' */
        query = query.where('topic', '==', topicValue);
      }
      if (difficulty) {
        query = query.where('difficulty', '==', difficulty);
      }

      return query.limit(limit * _MAX_FETCH_MULTIPLIER).get();
    }

    /**
     * Process a Firestore snapshot into normalized questions.
     */
    function _processSnapshot(snapshot, results) {
      snapshot.forEach(function (doc) {
        var normalized = _normalizeQuestion(doc);
        if (normalized) results.push(normalized);
      });
    }

    /* Primary query with the original topic key */
    var primaryTopic = topicVariants.length > 0 ? topicVariants[0] : null;
    _runQuery(primaryTopic).then(function (snapshot) {
      var results = [];
      _processSnapshot(snapshot, results);

      /* If insufficient results and there's an alternate topic key, try that */
      if (results.length < limit && topicVariants.length > 1) {
        return _runQuery(topicVariants[1]).then(function (altSnapshot) {
          /* De-duplicate against existing results */
          var existingTexts = {};
          for (var i = 0; i < results.length; i++) {
            existingTexts[results[i].question.substring(0, 80)] = true;
          }
          altSnapshot.forEach(function (doc) {
            var normalized = _normalizeQuestion(doc);
            if (normalized && !existingTexts[normalized.question.substring(0, 80)]) {
              results.push(normalized);
            }
          });
          return results;
        });
      }
      return results;
    }).then(function (results) {
      /* Cache the full result set */
      if (results.length > 0) {
        _setCache(key, results);
      }
      _shuffleInPlace(results);
      callback(null, results.slice(0, limit));
    }).catch(function (err) {
      console.warn('[QuestionBankService] Firestore query failed:', err.message || err);
      callback('Unable to load questions. Please try again.');
    });
  }

  /**
   * Fetch approved, active questions from the Firestore question bank.
   * Includes intelligent difficulty fallback when insufficient questions exist.
   *
   * @param {object} filters - { topic: string, difficulty: string, count: number }
   * @param {function} callback - (error, normalizedQuestions[])
   */
  function fetchQuestions(filters, callback) {
    if (!filters || typeof callback !== 'function') return;

    var topic = filters.topic || null;
    var difficulty = filters.difficulty || 'medium';
    var count = parseInt(filters.count, 10) || 5;

    /* De-duplication: prevent concurrent identical requests */
    var flightKey = _cacheKey(topic, difficulty);
    if (_fetchInFlight[flightKey]) {
      callback('request_in_progress');
      return;
    }
    _fetchInFlight[flightKey] = true;

    /* Safety wrapper: ensure _fetchInFlight is ALWAYS cleared */
    function _safeCallback(err, data) {
      _fetchInFlight[flightKey] = false;
      try {
        callback(err, data);
      } catch (cbErr) {
        console.warn('[QuestionBankService] Callback error:', cbErr);
      }
    }

    _queryQuestions(topic, difficulty, count, function (err, questions) {
      if (err) {
        _safeCallback(err);
        return;
      }

      /* Sufficient questions found at the requested difficulty */
      if (questions && questions.length >= count) {
        _safeCallback(null, questions.slice(0, count));
        return;
      }

      /* ---- Intelligent difficulty fallback ---- */
      var collected = questions ? questions.slice() : [];
      var remaining = count - collected.length;
      var fallbacks = _FALLBACK_MAP[difficulty] || [];
      var fallbackIdx = 0;
      var fallbackDiffUsed = null;

      function tryNextFallback() {
        if (remaining <= 0 || fallbackIdx >= fallbacks.length) {
          if (collected.length > 0) {
            /* Notify user about fallback (non-blocking) */
            if (fallbackDiffUsed && typeof showToast === 'function') {
              showToast('Showing ' + fallbackDiffUsed + ' questions \u2014 ' + difficulty + ' not yet available for this topic.');
            }
            _safeCallback(null, collected.slice(0, count));
          } else {
            _safeCallback('No questions available for this topic yet. Try another category.');
          }
          return;
        }

        var fbDiff = fallbacks[fallbackIdx];
        fallbackIdx++;

        _queryQuestions(topic, fbDiff, remaining, function (fbErr, fbQuestions) {
          if (!fbErr && fbQuestions && fbQuestions.length > 0) {
            fallbackDiffUsed = fbDiff;
            /* De-duplicate against already collected questions */
            for (var i = 0; i < fbQuestions.length && remaining > 0; i++) {
              var isDup = false;
              for (var j = 0; j < collected.length; j++) {
                if (collected[j].question === fbQuestions[i].question) {
                  isDup = true;
                  break;
                }
              }
              if (!isDup) {
                collected.push(fbQuestions[i]);
                remaining--;
              }
            }
          }
          tryNextFallback();
        });
      }

      tryNextFallback();
    });
  }

  /**
   * Fetch questions by specific document IDs.
   */
  function fetchQuestionsByIds(ids, callback) {
    if (!ids || ids.length === 0 || typeof callback !== 'function') return;
    var db = _getDb();
    if (!db) { callback('Database not available'); return; }

    var results = [];
    var pending = ids.length;
    var hasError = false;

    ids.forEach(function (id) {
      db.collection(COLLECTION).doc(id).get().then(function (doc) {
        if (hasError) return;
        var normalized = _normalizeQuestion(doc);
        if (normalized) results.push(normalized);
        pending--;
        if (pending === 0) callback(null, results);
      }).catch(function (err) {
        if (!hasError) {
          hasError = true;
          callback(err.message || 'Error fetching questions');
        }
      });
    });
  }

  /* ---- Public API ---- */
  return {
    fetchQuestions: fetchQuestions,
    fetchQuestionsByIds: fetchQuestionsByIds,
    clearCache: clearCache
  };
})();
