/**
 * scoring-service.js — Speed scoring, percentiles, best scores, auto-tips, session insights
 *
 * Extracted from drill-engine.js to reduce module size.
 * All functions are pure or semi-pure (read from localStorage only).
 *
 * Public API:
 *   ScoringService.computeSpeedScore(accNum, avgTimeSec)
 *   ScoringService.computePercentile(speedScore)
 *   ScoringService.getPercentileClass(pct)
 *   ScoringService.loadBestScores()
 *   ScoringService.saveBestScores(obj)
 *   ScoringService.getExplainCredits()
 *   ScoringService.decrementExplainCredits()
 *   ScoringService.getAutoTip(cat, subtype)
 *   ScoringService.computeSessionInsight(accNum, wrongCats)
 *   ScoringService.PERCENTILE_KEY
 *   ScoringService.BEST_SCORES_KEY
 *   ScoringService.SESSIONS_COUNT_KEY
 */

var ScoringService = (function () {
  'use strict';

  /* ---- Storage keys ---- */
  var PERCENTILE_KEY = 'qr_last_percentile';
  var BEST_SCORES_KEY = 'qr_best_scores';
  var EXPLAIN_CREDITS_KEY = 'qr_explain_credits';
  var SESSIONS_COUNT_KEY = 'qr_sessions_count';

  /* ---- Speed benchmark ---- */

  /**
   * Compute a composite speed score from accuracy and average time.
   * @param {number} accNum - accuracy percentage (0-100)
   * @param {number} avgTimeSec - average seconds per question
   * @returns {number} speed score (0-100)
   */
  function computeSpeedScore(accNum, avgTimeSec) {
    var timeScore = Math.max(0, Math.min(40, (15 - avgTimeSec) / 15 * 40));
    var accScore = accNum * 0.6;
    return Math.round(accScore + timeScore);
  }

  /**
   * Compute a simulated continuous percentile from speed score.
   * Adds small jitter for natural-feeling variation.
   * @param {number} speedScore
   * @returns {number} percentile (5-95)
   */
  function computePercentile(speedScore) {
    var base = Math.min(95, Math.max(5, Math.round(speedScore * 0.92)));
    var jitter = Math.round((Math.random() - 0.5) * 6);
    return Math.min(95, Math.max(5, base + jitter));
  }

  /**
   * Get CSS class for a percentile band.
   * @param {number} pct
   * @returns {string}
   */
  function getPercentileClass(pct) {
    if (pct >= 70) return 'benchmark-band-top';
    if (pct >= 35) return 'benchmark-band-mid';
    return 'benchmark-band-bottom';
  }

  /* ---- Best scores persistence ---- */

  function loadBestScores() {
    try { return JSON.parse(localStorage.getItem(BEST_SCORES_KEY) || '{}'); } catch (_) { return {}; }
  }

  function saveBestScores(obj) {
    try { localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(obj)); } catch (_) {}
  }

  /* ---- Explain credits (per-session free hints) ---- */

  function getExplainCredits() {
    var v = parseInt(localStorage.getItem(EXPLAIN_CREDITS_KEY));
    return isNaN(v) ? 5 : v;
  }

  function decrementExplainCredits() {
    var v = getExplainCredits();
    if (v > 0) { try { localStorage.setItem(EXPLAIN_CREDITS_KEY, String(v - 1)); } catch (_) {} }
  }

  /* ---- Auto-generated tips ---- */

  /**
   * Return a context-appropriate study tip based on question category/subtype.
   * @param {string} cat - question category
   * @param {string} [subtype] - question subtype
   * @returns {string}
   */
  function getAutoTip(cat, subtype) {
    var subtypeTips = {
      square:           'Tip: Area of a square = side². Multiply the side length by itself.',
      rectangle:        'Tip: Area of a rectangle = length × breadth. Double-check which is length and which is breadth.',
      triangle:         'Tip: Area of a triangle = ½ × base × height. Divide by 2 at the end.',
      circle:           'Tip: Area of a circle = π × r² (π ≈ 3.14). Square the radius first, then multiply.',
      parallelogram:    'Tip: Area of a parallelogram = base × height (the perpendicular height, not the slant side).',
      trapezium:        'Tip: Area of a trapezium = ½ × (sum of parallel sides) × height.',
      cube:             'Tip: Volume of a cube = side³. Multiply the side by itself three times.',
      cuboid:           'Tip: Volume of a cuboid = length × breadth × height. Multiply all three dimensions.',
      cylinder:         'Tip: Volume of a cylinder = π × r² × height (π ≈ 3.14). Find the base area first.',
      sphere:           'Tip: Volume of a sphere = (4/3) × π × r³ (π ≈ 3.14). Cube the radius, then multiply by 4/3.',
      cone:             'Tip: Volume of a cone = (1/3) × π × r² × height. It\'s one-third of the matching cylinder.',
      multiplication:   'Tip: Break apart: 18 × 7 = (20 − 2) × 7 = 140 − 14 = 126.',
      division:         'Tip: Division is the inverse of multiplication — multiply back to verify your answer.',
      average:          'Tip: Average = Sum ÷ Count. Recount items — it\'s the most common error.',
      'average-missing': 'Tip: Missing number = (Average × Count) − Sum of known numbers.'
    };
    var categoryTips = {
      squares:             'Tip: Use (a±b)² = a² ± 2ab + b² to break large squares into manageable parts.',
      cubes:               'Tip: Memorise cube values 1–10 — fast recall beats calculation every time.',
      area:                'Tip: Write the formula first, then substitute. For circles, π ≈ 3.14.',
      volume:              'Tip: Volume = base area × height for prisms. Label your units.',
      percentages:         'Tip: x% of y = y% of x — swap the numbers when one is easier to compute.',
      multiplication:      'Tip: Break apart: 18 × 7 = (20 − 2) × 7 = 140 − 14 = 126.',
      fractions:           'Tip: Find the LCM before adding or subtracting fractions.',
      averages:            'Tip: Average = Sum ÷ Count. Recount items — it\'s the most common error.',
      ratios:              'Tip: Cross-multiply to solve proportions: a/b = c/d → ad = bc.',
      'profit-loss':       'Tip: Profit % = (Profit ÷ Cost Price) × 100, not Selling Price.',
      'time-speed-distance': 'Tip: D = S × T. Write it down and substitute known values first.',
      'time-and-work':     'Tip: If A does work in N days, rate = 1/N. Add rates for combined work.'
    };
    if (subtype && subtypeTips[subtype]) return subtypeTips[subtype];
    return categoryTips[cat] || 'Tip: Review the formula used for this type of question.';
  }

  /* ---- Session insight (rule-based post-session message) ---- */

  /**
   * Compute a human-readable session insight message.
   * Uses 7-day rolling average and wrong-category distribution.
   * @param {number} accNum - session accuracy percentage
   * @param {object} wrongCats - { category: count } map of wrong answers
   * @returns {string}
   */
  function computeSessionInsight(accNum, wrongCats) {
    /* Load 7-day rolling average from progress localStorage for comparison */
    var rollingAvg = null;
    try {
      var _prog = (typeof AppState !== 'undefined')
        ? AppState.getProgress()
        : JSON.parse(localStorage.getItem('quant_reflex_progress') || '{}');
      var _hist = _prog.dailyHistory || {};
      /* Sort by timestamp — Date.toDateString() keys are NOT lexicographically
         chronological (e.g. "Mon Apr 1 2026"), so parse them before slicing. */
      var _histDates = Object.keys(_hist).sort(function (a, b) {
        return new Date(a).getTime() - new Date(b).getTime();
      }).slice(-7);
      var _histCorrect = 0, _histAttempted = 0;
      for (var _hd = 0; _hd < _histDates.length; _hd++) {
        var _he = _hist[_histDates[_hd]];
        if (_he && _he.attempted > 0) { _histCorrect += _he.correct; _histAttempted += _he.attempted; }
      }
      if (_histAttempted > 0) rollingAvg = (_histCorrect / _histAttempted) * 100;
    } catch (_) {}

    /* Find top missed category in this session */
    var topMissedCat = null, topMissedCount = 0;
    var _catKeys = Object.keys(wrongCats);
    for (var _ci = 0; _ci < _catKeys.length; _ci++) {
      if (wrongCats[_catKeys[_ci]] > topMissedCount) {
        topMissedCount = wrongCats[_catKeys[_ci]];
        topMissedCat = _catKeys[_ci];
      }
    }
    var _catLabels = {
      squares: 'squares', cubes: 'cubes', area: 'area', volume: 'volume',
      percentages: 'percentages', multiplication: 'multiplication', fractions: 'fractions',
      averages: 'averages', ratios: 'ratios', 'profit-loss': 'profit & loss',
      'time-speed-distance': 'time-speed-distance', 'time-and-work': 'time & work'
    };
    var catLabel = topMissedCat ? (_catLabels[topMissedCat] || topMissedCat) : null;

    /* Streak from progress */
    var streak = 0;
    try {
      var progData = (typeof AppState !== 'undefined')
        ? AppState.getProgress()
        : JSON.parse(localStorage.getItem('quant_reflex_progress') || '{}');
      streak = parseInt(progData.dailyStreak) || 0;
    } catch (_) {}

    /* Build insight message */
    if (accNum === 100) return '\uD83C\uDF1F Perfect score! Flawless session — push the difficulty up next time.';
    if (rollingAvg !== null) {
      var diff = accNum - rollingAvg;
      if (diff <= -8 && catLabel) return '\uD83D\uDCC9 Accuracy dropped ' + Math.abs(Math.round(diff)) + '% vs your average — focus on ' + catLabel + ' next session.';
      if (diff <= -8) return '\uD83D\uDCC9 Accuracy dropped ' + Math.abs(Math.round(diff)) + '% below your 7-day average — keep practising to bounce back.';
      if (diff >= 8) return '\uD83D\uDCC8 Strong session! Accuracy is ' + Math.round(diff) + '% above your 7-day average — great form.';
    }
    if (catLabel && topMissedCount >= 2) return '\u26A0\uFE0F You missed ' + topMissedCount + ' ' + catLabel + ' question' + (topMissedCount > 1 ? 's' : '') + ' — try a focused ' + catLabel + ' drill next.';
    if (accNum >= 90) return '\uD83D\uDCAA Excellent accuracy (' + accNum + '%) — try a timed session to sharpen your speed.';
    if (accNum >= 75) return '\uD83D\uDC4D Good session! A little more practice on your weak spots will push you into the top tier.';
    if (accNum < 50) return '\uD83D\uDCDA Tough session — review the concepts and try again with fewer questions.';
    if (streak >= 3) return '\uD83D\uDD25 ' + streak + '-day streak! Consistency is your biggest advantage — keep showing up.';
    return '\uD83D\uDCCB Session done. Focus on accuracy first, speed will follow.';
  }

  return {
    computeSpeedScore: computeSpeedScore,
    computePercentile: computePercentile,
    getPercentileClass: getPercentileClass,
    loadBestScores: loadBestScores,
    saveBestScores: saveBestScores,
    getExplainCredits: getExplainCredits,
    decrementExplainCredits: decrementExplainCredits,
    getAutoTip: getAutoTip,
    computeSessionInsight: computeSessionInsight,
    PERCENTILE_KEY: PERCENTILE_KEY,
    BEST_SCORES_KEY: BEST_SCORES_KEY,
    SESSIONS_COUNT_KEY: SESSIONS_COUNT_KEY
  };
})();
