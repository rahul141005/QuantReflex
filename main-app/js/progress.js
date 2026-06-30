/**
 * progress.js — localStorage-based progress tracking
 *
 * Stores:
 *   totalAttempted, totalCorrect, bestStreak, currentStreak,
 *   drillSessions, timedTestSessions, dailyStreak,
 *   lastPracticeDate, todayAttempted, todayCorrect,
 *   categoryStats (per-category attempted/correct),
 *   mistakes (wrong questions log),
 *   responseTimes (array of per-question times),
 *   dailyHistory (date → {attempted, correct})
 */

var PROGRESS_KEY = 'quant_reflex_progress';

/* Session-level cache: avoids repeated JSON.parse on every loadProgress() call.
   Invalidated on every saveProgress() write and on Firestore data load. */
var _progressCache = null;

/** Invalidate the progress cache. Called by FirestoreSync on data load. */
function invalidateProgressCache() { _progressCache = null; }

/** Return saved progress or defaults */
function loadProgress() {
  try {
    if (_progressCache) return _progressCache;
    var data = (typeof AppState !== 'undefined') ? AppState.getProgress() : null;
    if (!data) {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) data = JSON.parse(raw);
    }
    if (data) {
      /* Check if date has changed — reset today counters */
      var today = new Date().toDateString();
      if (data.lastActiveDate !== today) {
        /* Check daily streak continuity */
        if (data.lastActiveDate) {
          var last = new Date(data.lastActiveDate);
          var now = new Date(today);
          var diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
          if (diffDays > 1) {
            data.dailyStreak = 0; /* streak broken */
          }
        }
        data.todayAttempted = 0;
        data.todayCorrect = 0;
        data.lastActiveDate = today;
        data.lastActiveMs = Date.now();   /* sortable last-active (ADR-029) — toDateString isn't query-safe */
        saveProgress(data);
      }
      /* Ensure required fields exist */
      if (!data.categoryStats) data.categoryStats = {};
      if (!data.mistakes) data.mistakes = [];
      if (!data.responseTimes) data.responseTimes = [];
      if (!data.dailyHistory) data.dailyHistory = {};
      /* Sanitize numeric fields — protect against NaN/undefined corruption */
      data.totalAttempted = parseInt(data.totalAttempted) || 0;
      data.totalCorrect = parseInt(data.totalCorrect) || 0;
      data.bestStreak = parseInt(data.bestStreak) || 0;
      data.currentStreak = parseInt(data.currentStreak) || 0;
      data.drillSessions = parseInt(data.drillSessions) || 0;
      data.timedTestSessions = parseInt(data.timedTestSessions) || 0;
      data.dailyStreak = parseInt(data.dailyStreak) || 0;
      data.bestDailyStreak = parseInt(data.bestDailyStreak) || 0;
      data.todayAttempted = parseInt(data.todayAttempted) || 0;
      data.todayCorrect = parseInt(data.todayCorrect) || 0;
      _progressCache = data;
      return data;
    }
  } catch (_) {
    /* ignore parse errors */
  }
  var defaults = {
    totalAttempted: 0, totalCorrect: 0,
    bestStreak: 0, currentStreak: 0,
    drillSessions: 0, timedTestSessions: 0,
    dailyStreak: 0, bestDailyStreak: 0,
    lastActiveDate: null,
    lastPracticeDate: null,
    todayAttempted: 0, todayCorrect: 0,
    categoryStats: {},
    mistakes: [],
    responseTimes: [],
    dailyHistory: {}
  };
  _progressCache = defaults;
  return defaults;
}

/** Persist progress to localStorage and sync to Firestore */
function saveProgress(data) {
  _progressCache = data; /* Update cache so next loadProgress() is instant */
  try {
    if (typeof AppState !== 'undefined') {
      AppState.setProgress(data);
    } else {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncStats(data);
    }
  } catch (e) {
    console.warn('Failed to save progress:', e);
  }
}

/**
 * Record the result of a single answer.
 * @param {boolean} correct
 * @param {string}  [category] - optional question category for tracking
 * @param {object}  [questionData] - optional {question, answer, category} for mistake tracking
 * @param {number}  [responseTime] - optional response time in seconds
 */
function recordAnswer(correct, category, questionData, responseTime) {
  var p = loadProgress();
  var today = new Date().toDateString();

  /* Daily streak: increment on first practice of a new day */
  if (p.lastPracticeDate !== today) {
    p.dailyStreak = (p.dailyStreak || 0) + 1;
    /* Track best daily streak ever achieved */
    if (p.dailyStreak > (p.bestDailyStreak || 0)) {
      p.bestDailyStreak = p.dailyStreak;
    }
    p.lastPracticeDate = today;
  }

  p.lastActiveDate = today;
  p.lastActiveMs = Date.now();   /* sortable last-active (ADR-029) — backs coaching roster order + the inactive-sweep range query that toDateString silently broke */
  p.totalAttempted++;
  p.todayAttempted = (p.todayAttempted || 0) + 1;

  if (correct) {
    p.totalCorrect++;
    p.todayCorrect = (p.todayCorrect || 0) + 1;
    p.currentStreak++;
    if (p.currentStreak > p.bestStreak) p.bestStreak = p.currentStreak;
  } else {
    p.currentStreak = 0;
    /* Track mistake */
    if (questionData) {
      if (!p.mistakes) p.mistakes = [];
      /* Keep max 100 mistakes to avoid localStorage bloat */
      if (p.mistakes.length >= 100) p.mistakes.shift();
      /* Store the FULL question (ADR-079) so self-contained MCQ items — generated LR + authored CR — are reviewable.
         options/explanation are kept only for clean text MCQs (no chart/figure), so Review can re-render them. */
      var _reviewable = questionData.options && questionData.options.length && !questionData.chart && !questionData.figure;
      p.mistakes.push({
        question: questionData.question,
        answer: String(questionData.answer),
        category: questionData.category || category,
        options: _reviewable ? questionData.options.slice() : null,
        explanation: questionData.explanation || null,
        subtype: questionData.subtype || null,
        date: today
      });
    }
  }

  /* Track response time */
  if (typeof responseTime === 'number') {
    if (!p.responseTimes) p.responseTimes = [];
    /* Keep last 200 response times */
    if (p.responseTimes.length >= 200) p.responseTimes.shift();
    p.responseTimes.push(responseTime);
  }

  /* Category tracking */
  if (category) {
    if (!p.categoryStats) p.categoryStats = {};
    if (!p.categoryStats[category]) {
      p.categoryStats[category] = { attempted: 0, correct: 0 };
    }
    p.categoryStats[category].attempted++;
    if (correct) p.categoryStats[category].correct++;
  }

  /* Daily history tracking */
  if (!p.dailyHistory) p.dailyHistory = {};
  if (!p.dailyHistory[today]) {
    p.dailyHistory[today] = { attempted: 0, correct: 0, sumTimes: 0, count: 0 };
  }
  p.dailyHistory[today].attempted++;
  if (correct) p.dailyHistory[today].correct++;
  /* Dated speed history (Analytics Foundation, ADR-027): accumulate per-day response time so the
     Coaching App can compute a REAL per-day avg solving speed (sumTimes / count). Backward-compatible —
     pre-ADR-027 day records lack these keys, so default to 0 before incrementing. */
  if (typeof responseTime === 'number' && isFinite(responseTime)) {
    p.dailyHistory[today].sumTimes = (p.dailyHistory[today].sumTimes || 0) + responseTime;
    p.dailyHistory[today].count = (p.dailyHistory[today].count || 0) + 1;
  }

  /* Cap dailyHistory to last 90 days to prevent unbounded storage growth */
  var histKeys = Object.keys(p.dailyHistory);
  if (histKeys.length > 90) {
    histKeys.sort(function (a, b) { return new Date(a).getTime() - new Date(b).getTime(); });
    var toRemove = histKeys.slice(0, histKeys.length - 90);
    for (var h = 0; h < toRemove.length; h++) {
      delete p.dailyHistory[toRemove[h]];
    }
  }

  saveProgress(p);
}

/**
 * Record a finished session's within-session speed improvement % into a rolling average on the user's stats
 * (ADR-030). The Coaching App reads `stats.avgSessionImprovementPct` cheaply off the root user doc (no
 * per-student practiceSessions fan-out). EMA-smoothed (~last 10-20 sessions) so one outlier session can't
 * swing it; seeded directly on the first session. Called from drill-engine#finish for ≥6-question sessions.
 */
function recordSessionImprovement(pct) {
  if (typeof pct !== 'number' || !isFinite(pct)) return;
  var p = loadProgress();
  var prior = p.avgSessionImprovementPct;
  var next;
  if (typeof prior !== 'number' || !isFinite(prior)) {
    next = pct;
  } else {
    var alpha = 0.1; /* EMA weight — ~last 10-20 sessions */
    next = prior * (1 - alpha) + pct * alpha;
  }
  p.avgSessionImprovementPct = parseFloat(next.toFixed(1));
  saveProgress(p);
}

/** Record completion of a drill session */
function recordDrillSession() {
  var p = loadProgress();
  p.drillSessions = (p.drillSessions || 0) + 1;
  saveProgress(p);
}

/** Record completion of a timed test session */
function recordTimedTestSession() {
  var p = loadProgress();
  p.timedTestSessions = (p.timedTestSessions || 0) + 1;
  saveProgress(p);
}

/** Get stored mistakes for review mode */
function getMistakes() {
  var p = loadProgress();
  return p.mistakes || [];
}

/** Get average response time */
function getAvgResponseTime() {
  var p = loadProgress();
  var times = p.responseTimes || [];
  if (times.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < times.length; i++) sum += times[i];
  return (sum / times.length).toFixed(1);
}

/** Categories that are not valid for analytics (e.g. from legacy data) */
var _INVALID_CATEGORIES = { onboarding: true };

/** Check if a category name is valid for analytics display */
function isValidCategory(cat) {
  return !_INVALID_CATEGORIES[cat];
}

/* ADR-053: weak/strong topic come from the ONE derivation layer (statMath) — the SAME implementation the
   server profile uses — so Analytics and QuanAI can never name different weak/strong topics. `_mathStats()`
   strips analytics-invalid categories before handing the stats to statMath. */
function _mathStats() {
  var p = loadProgress();
  var cats = p.categoryStats || {}, clean = {};
  Object.keys(cats).forEach(function (c) { if (!_INVALID_CATEGORIES[c]) clean[c] = cats[c]; });
  return { totalAttempted: p.totalAttempted || 0, totalCorrect: p.totalCorrect || 0,
    categoryStats: clean, dailyHistory: p.dailyHistory || {}, todayAttempted: p.todayAttempted || 0, todayCorrect: p.todayCorrect || 0 };
}

/** Weakest category (lowest accuracy, ≥ MASTERY_MIN_ATTEMPTS) — via the shared derivation layer. */
function getWeakestCategory() { return (typeof QR_STATMATH !== 'undefined') ? QR_STATMATH.weakest(_mathStats()) : null; }

/** Strongest category (highest accuracy, ≥ MASTERY_MIN_ATTEMPTS) — via the shared derivation layer. */
function getStrongestCategory() { return (typeof QR_STATMATH !== 'undefined') ? QR_STATMATH.strongest(_mathStats()) : null; }

/** Reset all progress */
function resetProgress() {
  _progressCache = null; /* Invalidate cache */
  saveProgress({
    totalAttempted: 0, totalCorrect: 0,
    bestStreak: 0, currentStreak: 0,
    drillSessions: 0, timedTestSessions: 0,
    dailyStreak: 0, bestDailyStreak: 0,
    lastActiveDate: null,
    lastPracticeDate: null,
    todayAttempted: 0, todayCorrect: 0,
    categoryStats: {},
    mistakes: [],
    responseTimes: [],
    dailyHistory: {}
  });
}
