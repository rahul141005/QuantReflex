/**
 * scoring-service.js — Speed scoring, best scores, auto-tips, session insights
 *
 * Extracted from drill-engine.js to reduce module size.
 * All functions are pure or semi-pure (read from localStorage only).
 *
 * Public API:
 *   ScoringService.computeSpeedScore(accNum, avgTimeSec)
 *   ScoringService.getSpeedScoreClass(score)
 *   ScoringService.loadLastSpeedScore() / saveLastSpeedScore(score)
 *   ScoringService.loadBestScores()
 *   ScoringService.saveBestScores(obj)
 *   ScoringService.getExplainCredits()
 *   ScoringService.decrementExplainCredits()
 *   ScoringService.getAutoTip(cat, subtype)
 *   ScoringService.computeSessionInsight(accNum, wrongCats)
 *   ScoringService.BEST_SCORES_KEY
 *   ScoringService.SESSIONS_COUNT_KEY
 */

var ScoringService = (function () {
  'use strict';

  /* ---- Storage keys ---- */
  var LAST_SPEED_KEY = 'qr_last_speed_score';
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

  /* The old computePercentile() ("Faster than N% of users") was a SIMULATED number — speed score
     scaled + random jitter, no real cohort behind it. Removed on principle: the product never shows
     a comparison it cannot honestly support. Progress framing is now self-referential: the Speed
     Score (real, 0-100) and its delta vs the user's own last session. */

  /**
   * Get CSS class for a speed-score band (same visual bands the percentile used).
   * @param {number} score - speed score 0-100
   * @returns {string}
   */
  function getSpeedScoreClass(score) {
    if (score >= 70) return 'benchmark-band-top';
    if (score >= 35) return 'benchmark-band-mid';
    return 'benchmark-band-bottom';
  }

  /* ---- Last speed score (self-trend anchor) ---- */

  function loadLastSpeedScore() {
    var v = parseInt(localStorage.getItem(LAST_SPEED_KEY));
    return isNaN(v) ? null : v;
  }

  function saveLastSpeedScore(score) {
    try { localStorage.setItem(LAST_SPEED_KEY, String(Math.round(score))); } catch (_) {}
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
      'time-and-work':     'Tip: If A does work in N days, rate = 1/N. Add rates for combined work.',
      /* Data Interpretation (ADR-078): per-chart-type reading + the trap that costs that chart its marks. */
      'di-bar':            'Tip: Read the TITLE and UNIT first (₹ lakh vs ₹ crore is the #1 DI slip). Compare bar heights, then confirm with the printed values.',
      'di-line':           'Tip: The STEEPEST segment is the biggest change — but verify with arithmetic on just that segment. A high point ≠ a big jump.',
      'di-pie':            'Tip: 100% = 360°, so 1% = 3.6°. Anchor on 25%=90°, 50%=180°. Share = slice ÷ total × 100.',
      'di-table':          'Tip: Decide row-total vs column-total before adding, and read the EXACT row/column named — wrong year/category is the top table error.',
      'di-caselet':        'Tip: Write the TOTAL first, then each group, then the "doers" (group × %). Keep percentages as fractions (25% = ÷4) for speed.',
      /* Logical Reasoning (ADR-079): the method + the trap that costs that topic its marks. */
      'lr-coding':         'Tip: Find the RULE from the example first (letter↔number, a fixed shift, or shift-by-position), then apply it to the target. Write A=1…Z=26 across the top.',
      'lr-blood':          'Tip: Read each link as a generation step — up (parent), down (child) or sideways (sibling) — and track gender. Draw a tiny family tree instead of guessing.',
      'lr-direction':      'Tip: Sketch axes. North/South cancel and East/West cancel; the leftover legs form a right triangle (use 3-4-5 etc.). For turns, right = clockwise.',
      'lr-ranking':        'Tip: Total from both ends = (left) + (right) − 1 (the person is counted twice). Persons between two positions = |difference| − 1.',
      'lr-odd':            'Tip: Look for the shared rule among the OTHER three (all squares / all primes / a common factor / equal letter-gaps) — the one that breaks it is the answer.',
      'lr-analogy':        'Tip: Find the exact relation in the first pair (×k, n², +d, or a fixed letter-shift) and apply the SAME relation to the second pair.',
      'lr-syllogism':      'Tip: Only what MUST be true follows. Draw the sets; if any valid diagram makes the conclusion false, it does not follow. "Some A are B" never forces "all".',
      'lr-series':         'Tip: Take differences between consecutive terms. For letter series, convert to position numbers; for two interleaved series, split alternate terms.',
      'lr-inequality':     'Tip: A chain of same-direction signs combines: any > makes the result strict (>); all ≥/= give ≥. A mix of > and < between the two terms ⇒ "cannot be determined".',
      'lr-calendar':       'Tip: Use odd days (remainder when day-count ÷ 7). Add the day-gap to the known weekday and take mod 7. Remember Feb has 29 days in a leap year.',
      'lr-clock':          'Tip: Angle = |30×H − 5.5×M|, then take the smaller of that and 360−that. Mirror time = 11:60 − the given time.',
      'lr-io':             'Tip: Apply the stated rule ONE step at a time and rewrite the whole line each step. Track only the position the question asks about.',
      'lr-critical':       'Tip: For ASSUMPTION use the negation test (if it were false, the argument collapses). To WEAKEN, find an alternative cause; to STRENGTHEN, rule one out. Stay within the scope.',
      'lr-statement':      'Tip: An assumption is something taken for granted (not merely possible). A conclusion must FOLLOW from the statement. A strong argument is relevant and substantial, not a mere opinion.',
      'lr-cause':          'Tip: Ask which event came first and whether it explains the other. If neither causes the other but both rise together, look for a single COMMON cause.',
      'lr-course':         'Tip: An action "follows" only if it directly addresses the problem AND is practical. Reject extreme, vague, or disproportionate steps.',
      'lr-decision':       'Tip: Pick the most balanced, ethical and practical option. Safety and integrity outrank deadlines and short-term gain; avoid extreme over-reactions.',
      'lr-mirror':         'Tip: A mirror image flips LEFT ↔ RIGHT only (top and bottom stay). Letters with vertical symmetry (A, H, M) look unchanged.',
      'lr-water':          'Tip: A water image flips TOP ↔ BOTTOM only (left and right stay). Letters with horizontal symmetry (B, C, D, E) look unchanged.',
      'lr-dice':           'Tip: On a standard die opposite faces sum to 7, so the face opposite N is 7 − N. For two views, the faces that move are adjacent — never opposite.',
      'lr-cube':           'Tip: For an n×n×n painted cube — corners (3 faces) = 8; edges (2) = 12(n−2); faces (1) = 6(n−2)²; inside (0) = (n−2)³.',
      'lr-fseries':        'Tip: Find the constant turn between consecutive figures (e.g. +90° each), then apply it once more for the next figure.',
      'lr-fanalogy':       'Tip: Work out exactly how the first figure becomes the second (rotate by a fixed angle / reflect), then apply the SAME change to the third.',
      'lr-seating':        'Tip: Start from the FIXED clues (ends, "exactly between"), pencil those in, then place the rest. Test each remaining clue against your diagram.',
      'lr-puzzle':         'Tip: Begin with the most restrictive clue (a fixed floor or an exact gap). Build the arrangement step by step and verify every clue before answering.'
    };
    /* DI archetype-keyed tips (ADR-078): subtype is "<difficulty>:<key>"; teach the method behind the specific key. */
    var diKeyTips = {
      pctMore: 'Tip: % change = (new − old) ÷ OLD × 100 — always divide by the ORIGINAL value, not the new one.',
      yoy: 'Tip: % change = (new − old) ÷ OLD × 100 — divide by the earlier year, ignore the sign if asked for magnitude.',
      overallGrowth: 'Tip: Growth over a period = (last − first) ÷ FIRST × 100. Use the starting value as the base.',
      deviation: 'Tip: Find the average first, then (value − average) ÷ average × 100. The base is the average, not the value.',
      share: 'Tip: Share = part ÷ TOTAL × 100. The base is the whole total, never a neighbouring value.',
      combinedShare: 'Tip: Add the two parts first, THEN divide by the grand total × 100.',
      cumulativeShare: 'Tip: Sum the years asked for, then divide by the total of ALL years × 100.',
      m_seriesShare: 'Tip: Add every series at that point to get the base, then part ÷ that base × 100.',
      ratio: 'Tip: Divide both quantities by their HCF for the simplest ratio a:b. Check: a×(other) = b×(one).',
      m_ratioYear: 'Tip: Divide both series by their HCF for the simplest ratio. Keep the order the question asks (a:b).',
      m_crossDiff: 'Tip: Line the two series up at the SAME point, then subtract — mind which one is larger.',
      m_combined: 'Tip: Read both series at that point and add — don\'t double-count or miss a series.',
      m_pctDiff: 'Tip: Cross-series % difference = (A − B) ÷ B × 100 — divide by the series you compare AGAINST.',
      m_combinedShare: 'Tip: Add EVERY series and every entry for the grand total, then the pair ÷ that grand total × 100.',
      m_trendCompare: 'Tip: Compute each series\' first-to-last change separately, then subtract the two changes.',
      /* LR reasoning sub-skills (ADR-079) — sharper than the category tip for the specific question type. */
      assumption: 'Tip: Negation test — negate the option; if the argument falls apart, it is a required assumption. If the argument survives, it is not.',
      strengthen: 'Tip: The best strengthener supports the cause→effect link or rules out an alternative explanation. Extra unrelated benefits do not strengthen.',
      weaken: 'Tip: The best weakener supplies an ALTERNATIVE cause or a counter-example. Attack the link between evidence and conclusion, not a side detail.',
      flaw: 'Tip: Name the reasoning error — correlation treated as cause, comparing counts not rates, or a small/biased sample.',
      paradox: 'Tip: Find the fact that lets BOTH surprising statements be true at once (often a hidden change in what is measured or in demand).',
      cipher: 'Tip: Compare the example word to its code letter-by-letter to find the shift, then apply that exact shift to the target.',
      posshift: 'Tip: Each letter moves forward by its POSITION (1st +1, 2nd +2, …). Number the letters before shifting.',
      ineq: 'Tip: Combine the signs only between the two terms asked about. Same direction ⇒ a definite result; a > mixed with a < ⇒ "either/neither".'
    };
    if (subtype && subtypeTips[subtype]) return subtypeTips[subtype];
    if (subtype && subtype.indexOf(':') !== -1) { var _dk = subtype.split(':')[1]; if (diKeyTips[_dk]) return diKeyTips[_dk]; }
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
    /* Label via the ONE engine-aware client labeller (app.js#formatCategoryName) so DI/LR read "Bar Graphs" /
       "Syllogisms" in the post-session insight, never raw "di-bar"/"lr-syllogism" (ADR-076, Phase 4 unification). */
    var catLabel = topMissedCat
      ? (typeof formatCategoryName === 'function' ? String(formatCategoryName(topMissedCat)).toLowerCase() : topMissedCat)
      : null;

    /* Streak from progress */
    var streak = 0;
    try {
      var progData = (typeof AppState !== 'undefined')
        ? AppState.getProgress()
        : JSON.parse(localStorage.getItem('quant_reflex_progress') || '{}');
      streak = parseInt(progData.dailyStreak) || 0;
    } catch (_) {}

    /* Build insight message. The insight is the single explanatory sentence under the verdict badge —
       it must never repeat the verdict's celebration (the badge already carries the emotion) and must
       only recommend actions the results card actually offers. */
    if (accNum === 100) return 'Flawless — push the difficulty up next time.';
    if (rollingAvg !== null) {
      var diff = accNum - rollingAvg;
      if (diff <= -8 && catLabel) return '\uD83D\uDCC9 Accuracy dropped ' + Math.abs(Math.round(diff)) + '% vs your average — focus on ' + catLabel + ' next session.';
      if (diff <= -8) return '\uD83D\uDCC9 Accuracy dropped ' + Math.abs(Math.round(diff)) + '% below your 7-day average — keep practising to bounce back.';
      if (diff >= 8) return '\uD83D\uDCC8 Accuracy is ' + Math.round(diff) + '% above your 7-day average — great form.';
    }
    if (catLabel && topMissedCount >= 2) return '\u26A0\uFE0F You missed ' + topMissedCount + ' ' + catLabel + ' question' + (topMissedCount > 1 ? 's' : '') + ' — try a focused ' + catLabel + ' drill next.';
    if (accNum >= 90) return 'Excellent accuracy (' + accNum + '%) — try a timed session to sharpen your speed.';
    if (accNum >= 75) return 'A little more practice on your weak spots will push you into the top tier.';
    if (accNum < 50) return 'Tough session — reviewing the questions you missed is the fastest way back.';
    if (streak >= 3) return '\uD83D\uDD25 ' + streak + '-day streak! Consistency is your biggest advantage — keep showing up.';
    return 'Session done. Focus on accuracy first — speed will follow.';
  }

  return {
    computeSpeedScore: computeSpeedScore,
    getSpeedScoreClass: getSpeedScoreClass,
    loadLastSpeedScore: loadLastSpeedScore,
    saveLastSpeedScore: saveLastSpeedScore,
    loadBestScores: loadBestScores,
    saveBestScores: saveBestScores,
    getExplainCredits: getExplainCredits,
    decrementExplainCredits: decrementExplainCredits,
    getAutoTip: getAutoTip,
    computeSessionInsight: computeSessionInsight,
    BEST_SCORES_KEY: BEST_SCORES_KEY,
    SESSIONS_COUNT_KEY: SESSIONS_COUNT_KEY
  };
})();
