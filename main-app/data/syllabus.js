/**
 * syllabus.js — the QuantReflex canonical Quant Knowledge Base (ADR-059).
 *
 * THE single source of truth every AI feature reasons over (Planner/Coach/Insights). Two layers:
 *
 *   1. TOPICS — a canonical, EXAM-INDEPENDENT library of real quant topics. Each carries universal metadata:
 *      label + synonyms (names different coaching institutes use), section (parent category), difficulty,
 *      prereqs (dependency graph), avgMinutes (first-pass study budget), revisionIntervalDays, formulaSheet
 *      (key into formulas.js or null), drillable (one of the 12 app practice cats or null), signals (weighted
 *      cats to INFER readiness for study-only topics), commonMistakes, practiceIntensity, and a `confidence`
 *      score for the metadata itself. `unlocks` is derived (reverse of prereqs) at load — never hand-authored.
 *
 *   2. EXAMS — each real exam selects its topics with a RESEARCHED weightage profile: a weightage band
 *      (very-high/high/medium/low), PYQ appearance frequency, and per-exam nuance + confidence. Weights live at
 *      the family level (the exams in a family share most of their syllabus) with per-exam OVERRIDES + nuances
 *      where an exam genuinely differs (e.g. SNAP/NMAT are speed-easy, XAT's QA is tricky, GMAT drops Geometry-
 *      heavy/DI-Indian patterns, CDS/NDA add Trigonometry/Statistics, JEE is advanced-school).
 *
 * resolveSyllabus(examId) MERGES library + per-exam weights into the legacy topic shape every consumer already
 * reads ({id,label,section,importance,frequency,difficulty,estMinutes,revisionIntervalDays,prereqs,drillable,
 * signals} + the rich fields) — so the planning engine stays completely exam-agnostic; the DATA drives behaviour.
 *
 * SOURCES & METHOD (ADR-059): the taxonomy and weightages are authored from established, widely-trusted exam
 * preparation knowledge — official exam patterns, previous-year-paper trends, standard books (Arun Sharma) and
 * the consensus of major coaching institutes (TIME / IMS / Career Launcher). Weightages are confidence-scored
 * BANDS, not invented precise percentages; uncertain values are marked (confidence: 'med'/'low'). No topic is
 * fabricated. Where sources disagree, official patterns + PYQ trends win, then coaching consensus. Bump
 * SYLLABUS_VERSION on any content change.
 *
 * Drillable cats (must match services/quantTopics.js / questions.js):
 *   squares, cubes, area, volume, fractions, percentages, multiplication, ratios, averages,
 *   profit-loss, time-speed-distance, time-and-work
 */
(function (root) {
  'use strict';

  var SYLLABUS_VERSION = 2;

  // weightage band → engine importance (0..1). Bands keep us honest: we claim "very-high", not "11.4%".
  var BAND = { 'very-high': 0.93, 'high': 0.78, 'medium': 0.58, 'low': 0.40 };
  function bandFreq(w) { return (w === 'very-high' || w === 'high') ? 'high' : w === 'medium' ? 'medium' : 'low'; }

  /* ════════════════════════ 1. CANONICAL TOPIC LIBRARY (exam-independent) ════════════════════════
   * T(o): rich plain-data factory. Defaults keep entries terse. `signals` defaults to the drillable cat. */
  function T(o) {
    return {
      id: o.id, label: o.label, synonyms: o.synonyms || [], section: o.section,
      difficulty: o.difficulty, avgMinutes: o.avgMinutes, revisionIntervalDays: o.revisionIntervalDays || 11,
      prereqs: o.prereqs || [], drillable: o.drillable || null,
      signals: o.signals || (o.drillable ? [{ cat: o.drillable, w: 1 }] : []),
      formulaSheet: o.formulaSheet || null,
      commonMistakes: o.commonMistakes || [],
      practiceIntensity: o.practiceIntensity || 'medium',   // how much drilling the topic rewards
      confidence: o.confidence || 'high'                    // confidence in THIS topic's metadata
    };
  }

  var TOPIC_LIST = [
    /* ---- Number System ---- */
    T({ id: 'multiplication_fluency', label: 'Multiplication & Calculation Speed', synonyms: ['Vedic Maths', 'Speed Maths'], section: 'Number System', difficulty: 0.25, avgMinutes: 90, revisionIntervalDays: 14, drillable: 'multiplication', formulaSheet: null, practiceIntensity: 'high', commonMistakes: ['Carry errors under time pressure', 'Not memorising tables to 30'] }),
    T({ id: 'simplification', label: 'Simplification & Approximation', synonyms: ['BODMAS', 'Approximation'], section: 'Number System', difficulty: 0.30, avgMinutes: 100, revisionIntervalDays: 10, drillable: 'fractions', signals: [{ cat: 'fractions', w: 0.6 }, { cat: 'multiplication', w: 0.4 }], practiceIntensity: 'high', commonMistakes: ['BODMAS order slips', 'Over-precise where approximation suffices'] }),
    T({ id: 'fractions_decimals', label: 'Fractions, Decimals & Surds', synonyms: ['Fractions', 'Decimals'], section: 'Number System', difficulty: 0.30, avgMinutes: 100, revisionIntervalDays: 12, drillable: 'fractions', formulaSheet: null, commonMistakes: ['Comparing fractions by cross-multiplication errors'] }),
    T({ id: 'squares_roots', label: 'Squares & Square Roots', synonyms: ['Squares'], section: 'Number System', difficulty: 0.30, avgMinutes: 70, revisionIntervalDays: 14, drillable: 'squares', practiceIntensity: 'high' }),
    T({ id: 'cubes_roots', label: 'Cubes & Cube Roots', synonyms: ['Cubes'], section: 'Number System', difficulty: 0.35, avgMinutes: 60, revisionIntervalDays: 14, drillable: 'cubes', practiceIntensity: 'high' }),
    T({ id: 'lcm_hcf', label: 'HCF & LCM', synonyms: ['GCD', 'LCM HCF'], section: 'Number System', difficulty: 0.40, avgMinutes: 80, revisionIntervalDays: 12, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }], commonMistakes: ['Confusing HCF and LCM use-cases in word problems'] }),
    T({ id: 'divisibility', label: 'Divisibility Rules', synonyms: ['Divisibility'], section: 'Number System', difficulty: 0.45, avgMinutes: 80, revisionIntervalDays: 11, prereqs: ['multiplication_fluency'], signals: [{ cat: 'multiplication', w: 0.8 }, { cat: 'fractions', w: 0.2 }], commonMistakes: ['Forgetting composite divisibility (e.g. 6 = 2 and 3)'] }),
    T({ id: 'remainders', label: 'Remainders & Modular Arithmetic', synonyms: ['Remainder Theorem', 'Mods'], section: 'Number System', difficulty: 0.65, avgMinutes: 140, revisionIntervalDays: 10, prereqs: ['divisibility'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }], practiceIntensity: 'high', commonMistakes: ['Negative remainders', 'Misapplying Fermat/Euler', 'Chinese Remainder slips'] }),
    T({ id: 'factors_divisors', label: 'Factors, Multiples & Number of Divisors', synonyms: ['Number of Factors'], section: 'Number System', difficulty: 0.60, avgMinutes: 120, revisionIntervalDays: 11, prereqs: ['lcm_hcf'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }], commonMistakes: ['Counting factors vs sum of factors', 'Perfect-square factor parity'] }),
    T({ id: 'primes_factorisation', label: 'Primes & Prime Factorisation', synonyms: ['Prime Numbers'], section: 'Number System', difficulty: 0.50, avgMinutes: 90, revisionIntervalDays: 12, prereqs: ['divisibility'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }] }),
    T({ id: 'cyclicity_units', label: 'Cyclicity & Units Digit', synonyms: ['Last Digit', 'Unit Digit'], section: 'Number System', difficulty: 0.55, avgMinutes: 90, revisionIntervalDays: 11, prereqs: ['remainders'], signals: [{ cat: 'multiplication', w: 0.8 }, { cat: 'fractions', w: 0.2 }], commonMistakes: ['Cycle length errors for 2,3,7,8'] }),
    T({ id: 'base_systems', label: 'Base Systems & Number Bases', synonyms: ['Binary', 'Number Bases'], section: 'Number System', difficulty: 0.65, avgMinutes: 90, revisionIntervalDays: 12, prereqs: ['divisibility'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }], confidence: 'med' }),
    T({ id: 'number_series', label: 'Number Series (Missing & Wrong)', synonyms: ['Series Completion'], section: 'Number System', difficulty: 0.50, avgMinutes: 110, revisionIntervalDays: 10, prereqs: ['multiplication_fluency'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'squares', w: 0.4 }], practiceIntensity: 'high' }),

    /* ---- Arithmetic ---- */
    T({ id: 'percentages', label: 'Percentages', synonyms: ['Percentage'], section: 'Arithmetic', difficulty: 0.40, avgMinutes: 120, revisionIntervalDays: 9, prereqs: ['fractions_decimals'], drillable: 'percentages', formulaSheet: 'percentageTricks', practiceIntensity: 'high', commonMistakes: ['Wrong base for % change', 'Successive % not multiplied'] }),
    T({ id: 'ratio_proportion', label: 'Ratio, Proportion & Variation', synonyms: ['Ratios', 'Proportion'], section: 'Arithmetic', difficulty: 0.40, avgMinutes: 110, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], drillable: 'ratios', formulaSheet: 'ratioAverage', practiceIntensity: 'high', commonMistakes: ['Adding ratios instead of scaling', 'Direct vs inverse variation'] }),
    T({ id: 'averages', label: 'Averages', synonyms: ['Mean'], section: 'Arithmetic', difficulty: 0.35, avgMinutes: 90, revisionIntervalDays: 11, drillable: 'averages', formulaSheet: 'averages', commonMistakes: ['Weighted vs simple average', 'Average of speeds = harmonic mean'] }),
    T({ id: 'partnership', label: 'Partnership & Share', synonyms: ['Partnerships'], section: 'Arithmetic', difficulty: 0.45, avgMinutes: 70, revisionIntervalDays: 12, prereqs: ['ratio_proportion'], signals: [{ cat: 'ratios', w: 0.7 }, { cat: 'percentages', w: 0.3 }] }),
    T({ id: 'mixtures', label: 'Mixtures & Alligations', synonyms: ['Alligation'], section: 'Arithmetic', difficulty: 0.60, avgMinutes: 120, revisionIntervalDays: 11, prereqs: ['ratio_proportion', 'averages'], signals: [{ cat: 'ratios', w: 0.5 }, { cat: 'averages', w: 0.3 }, { cat: 'percentages', w: 0.2 }], commonMistakes: ['Alligation cross wrong way', 'Repeated replacement formula'] }),
    T({ id: 'profit_loss', label: 'Profit, Loss & Discount', synonyms: ['Profit and Loss'], section: 'Arithmetic', difficulty: 0.50, avgMinutes: 150, revisionIntervalDays: 10, prereqs: ['percentages', 'ratio_proportion'], drillable: 'profit-loss', formulaSheet: 'profitLoss', practiceIntensity: 'high', commonMistakes: ['CP vs SP base for %', 'Marked price/discount chains'] }),
    T({ id: 'interest', label: 'Simple & Compound Interest', synonyms: ['SI CI'], section: 'Arithmetic', difficulty: 0.55, avgMinutes: 130, revisionIntervalDays: 10, prereqs: ['percentages'], signals: [{ cat: 'percentages', w: 0.6 }, { cat: 'multiplication', w: 0.4 }], commonMistakes: ['CI compounding frequency', 'SI vs CI difference formula'] }),
    T({ id: 'tsd', label: 'Time, Speed & Distance', synonyms: ['TSD', 'Speed Distance'], section: 'Arithmetic', difficulty: 0.55, avgMinutes: 150, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-speed-distance', formulaSheet: null, practiceIntensity: 'high', commonMistakes: ['Relative speed direction', 'Average speed = total/total'] }),
    T({ id: 'trains_boats', label: 'Trains, Boats & Streams', synonyms: ['Boats and Streams'], section: 'Arithmetic', difficulty: 0.50, avgMinutes: 90, revisionIntervalDays: 11, prereqs: ['tsd'], signals: [{ cat: 'time-speed-distance', w: 1 }], commonMistakes: ['Upstream/downstream sign', 'Train length included'] }),
    T({ id: 'time_work', label: 'Time & Work', synonyms: ['Work Time'], section: 'Arithmetic', difficulty: 0.55, avgMinutes: 140, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-and-work', formulaSheet: 'timeWork', practiceIntensity: 'high', commonMistakes: ['LCM-of-work method', 'Efficiency ratios'] }),
    T({ id: 'pipes_cisterns', label: 'Pipes & Cisterns', synonyms: ['Pipes Cisterns'], section: 'Arithmetic', difficulty: 0.50, avgMinutes: 70, revisionIntervalDays: 12, prereqs: ['time_work'], signals: [{ cat: 'time-and-work', w: 1 }] }),
    T({ id: 'ages', label: 'Problems on Ages', synonyms: ['Ages'], section: 'Arithmetic', difficulty: 0.45, avgMinutes: 70, revisionIntervalDays: 12, prereqs: ['ratio_proportion'], signals: [{ cat: 'ratios', w: 0.6 }, { cat: 'averages', w: 0.4 }] }),

    /* ---- Algebra ---- */
    T({ id: 'linear_equations', label: 'Linear Equations', synonyms: ['Simultaneous Equations'], section: 'Algebra', difficulty: 0.50, avgMinutes: 120, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }], commonMistakes: ['Sign errors', 'Word-to-equation translation'] }),
    T({ id: 'quadratic_equations', label: 'Quadratic Equations', synonyms: ['Quadratics'], section: 'Algebra', difficulty: 0.60, avgMinutes: 130, revisionIntervalDays: 9, prereqs: ['linear_equations'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }], commonMistakes: ['Roots vs factors', 'Discriminant sign'] }),
    T({ id: 'inequalities_modulus', label: 'Inequalities & Modulus', synonyms: ['Inequalities'], section: 'Algebra', difficulty: 0.65, avgMinutes: 110, revisionIntervalDays: 11, prereqs: ['quadratic_equations'], signals: [{ cat: 'fractions', w: 0.5 }, { cat: 'multiplication', w: 0.5 }], commonMistakes: ['Flipping sign on negative multiply', 'Modulus cases'] }),
    T({ id: 'progressions', label: 'Sequences & Series (AP, GP, HP)', synonyms: ['Progressions', 'AP GP'], section: 'Algebra', difficulty: 0.60, avgMinutes: 120, revisionIntervalDays: 10, prereqs: ['linear_equations'], signals: [{ cat: 'averages', w: 0.4 }, { cat: 'multiplication', w: 0.6 }], commonMistakes: ['Sum formula off-by-one', 'GP infinite-sum condition'] }),
    T({ id: 'functions_graphs', label: 'Functions & Graphs', synonyms: ['Functions'], section: 'Algebra', difficulty: 0.70, avgMinutes: 120, revisionIntervalDays: 12, prereqs: ['quadratic_equations'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }], confidence: 'med', commonMistakes: ['Domain/range', 'Composite function order'] }),
    T({ id: 'logarithms', label: 'Logarithms', synonyms: ['Logs'], section: 'Algebra', difficulty: 0.60, avgMinutes: 80, revisionIntervalDays: 12, prereqs: ['surds_indices'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }], commonMistakes: ['Log of sum ≠ sum of logs', 'Base-change slips'] }),
    T({ id: 'surds_indices', label: 'Surds & Indices', synonyms: ['Exponents', 'Indices'], section: 'Algebra', difficulty: 0.45, avgMinutes: 80, revisionIntervalDays: 12, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'squares', w: 0.4 }] }),
    T({ id: 'algebraic_identities', label: 'Polynomials & Algebraic Identities', synonyms: ['Identities'], section: 'Algebra', difficulty: 0.55, avgMinutes: 100, revisionIntervalDays: 11, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),

    /* ---- Geometry ---- */
    T({ id: 'lines_angles', label: 'Lines, Angles & Polygons', synonyms: ['Geometry Basics'], section: 'Geometry', difficulty: 0.50, avgMinutes: 90, revisionIntervalDays: 12, signals: [{ cat: 'area', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),
    T({ id: 'triangles', label: 'Triangles', synonyms: ['Triangle Properties'], section: 'Geometry', difficulty: 0.65, avgMinutes: 160, revisionIntervalDays: 10, prereqs: ['lines_angles'], signals: [{ cat: 'area', w: 0.5 }, { cat: 'multiplication', w: 0.5 }], commonMistakes: ['Similarity ratios (area = side²)', 'Pythagorean triples'] }),
    T({ id: 'quadrilaterals_polygons', label: 'Quadrilaterals & Polygons', synonyms: ['Polygons'], section: 'Geometry', difficulty: 0.55, avgMinutes: 90, revisionIntervalDays: 11, prereqs: ['triangles'], signals: [{ cat: 'area', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    T({ id: 'circles', label: 'Circles', synonyms: ['Circle Theorems'], section: 'Geometry', difficulty: 0.60, avgMinutes: 100, revisionIntervalDays: 11, prereqs: ['lines_angles'], signals: [{ cat: 'area', w: 0.6 }, { cat: 'multiplication', w: 0.4 }], commonMistakes: ['Tangent-secant', 'Cyclic quadrilateral angles'] }),
    T({ id: 'coordinate_geometry', label: 'Coordinate Geometry', synonyms: ['Co-ordinate Geometry'], section: 'Geometry', difficulty: 0.65, avgMinutes: 110, revisionIntervalDays: 12, prereqs: ['linear_equations'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'area', w: 0.5 }] }),
    T({ id: 'trigonometry', label: 'Trigonometry & Heights/Distances', synonyms: ['Trig'], section: 'Geometry', difficulty: 0.70, avgMinutes: 160, revisionIntervalDays: 10, prereqs: ['triangles'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'area', w: 0.5 }], commonMistakes: ['Identity manipulation', 'Angle-of-elevation setup'] }),

    /* ---- Mensuration ---- */
    T({ id: 'mensuration_2d', label: 'Areas of 2D Figures', synonyms: ['Mensuration 2D', 'Area'], section: 'Mensuration', difficulty: 0.50, avgMinutes: 110, revisionIntervalDays: 11, prereqs: ['lines_angles'], drillable: 'area', formulaSheet: 'area', practiceIntensity: 'high' }),
    T({ id: 'mensuration_3d', label: 'Volumes & Surface Areas', synonyms: ['Mensuration 3D', 'Solids'], section: 'Mensuration', difficulty: 0.55, avgMinutes: 110, revisionIntervalDays: 11, prereqs: ['mensuration_2d'], drillable: 'volume', formulaSheet: 'volume', commonMistakes: ['CSA vs TSA', 'Cone slant height'] }),

    /* ---- Modern Math ---- */
    T({ id: 'permutations_combinations', label: 'Permutations & Combinations', synonyms: ['PnC', 'Counting'], section: 'Modern Math', difficulty: 0.70, avgMinutes: 140, revisionIntervalDays: 11, prereqs: ['factors_divisors'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }], practiceIntensity: 'high', commonMistakes: ['Arrangement vs selection', 'Overcounting identical items'] }),
    T({ id: 'probability', label: 'Probability', synonyms: ['Chance'], section: 'Modern Math', difficulty: 0.70, avgMinutes: 120, revisionIntervalDays: 11, prereqs: ['permutations_combinations'], signals: [{ cat: 'fractions', w: 0.6 }, { cat: 'multiplication', w: 0.4 }], commonMistakes: ['Dependent vs independent', 'Conditional probability'] }),
    T({ id: 'set_theory', label: 'Set Theory & Venn Diagrams', synonyms: ['Sets', 'Venn'], section: 'Modern Math', difficulty: 0.50, avgMinutes: 90, revisionIntervalDays: 12, signals: [{ cat: 'percentages', w: 0.5 }, { cat: 'multiplication', w: 0.5 }], commonMistakes: ['Inclusion-exclusion sign', 'Exactly-two vs at-least-two'] }),
    T({ id: 'statistics', label: 'Statistics (Mean, Median, Mode, SD)', synonyms: ['Statistics'], section: 'Modern Math', difficulty: 0.50, avgMinutes: 100, revisionIntervalDays: 11, prereqs: ['averages'], signals: [{ cat: 'averages', w: 0.6 }, { cat: 'percentages', w: 0.4 }] }),
    T({ id: 'matrices_determinants', label: 'Matrices & Determinants', synonyms: ['Matrices'], section: 'Modern Math', difficulty: 0.60, avgMinutes: 110, revisionIntervalDays: 11, prereqs: ['linear_equations'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }], confidence: 'med' }),

    /* ---- Data Interpretation & Sufficiency ---- */
    T({ id: 'di_tables_charts', label: 'Data Interpretation (Tables, Bar, Pie, Line)', synonyms: ['DI'], section: 'Data Interpretation', difficulty: 0.60, avgMinutes: 200, revisionIntervalDays: 9, prereqs: ['percentages', 'averages', 'ratio_proportion'], signals: [{ cat: 'percentages', w: 0.35 }, { cat: 'averages', w: 0.25 }, { cat: 'multiplication', w: 0.25 }, { cat: 'ratios', w: 0.15 }], practiceIntensity: 'high', commonMistakes: ['Misreading axes/units', 'Approximation discipline'] }),
    T({ id: 'di_caselet', label: 'Caselet & Advanced DI', synonyms: ['Caselet DI'], section: 'Data Interpretation', difficulty: 0.68, avgMinutes: 130, revisionIntervalDays: 10, prereqs: ['di_tables_charts'], signals: [{ cat: 'percentages', w: 0.4 }, { cat: 'averages', w: 0.3 }, { cat: 'ratios', w: 0.3 }] }),
    T({ id: 'data_sufficiency', label: 'Data Sufficiency', synonyms: ['DS'], section: 'Data Interpretation', difficulty: 0.60, avgMinutes: 90, revisionIntervalDays: 11, prereqs: ['di_tables_charts'], signals: [{ cat: 'percentages', w: 0.5 }, { cat: 'ratios', w: 0.5 }], commonMistakes: ['Solving instead of judging sufficiency', 'Combining statements early'] }),
    T({ id: 'quadratic_comparison', label: 'Quadratic Equation Comparison', synonyms: ['Quadratic Comparison'], section: 'Data Interpretation', difficulty: 0.50, avgMinutes: 90, revisionIntervalDays: 10, prereqs: ['quadratic_equations'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] })
  ];

  var TOPICS = {};
  TOPIC_LIST.forEach(function (t) { TOPICS[t.id] = t; });
  // unlocks = reverse of prereqs, derived ONCE (never hand-authored — guarantees consistency).
  Object.keys(TOPICS).forEach(function (id) { TOPICS[id].unlocks = []; });
  TOPIC_LIST.forEach(function (t) { (t.prereqs || []).forEach(function (p) { if (TOPICS[p]) TOPICS[p].unlocks.push(t.id); }); });
  // drillable cat → canonical topic (reverse of `drillable`) — lets Explanation ground a drill in its KB topic.
  var _topicByCat = {};
  TOPIC_LIST.forEach(function (t) { if (t.drillable && !_topicByCat[t.drillable]) _topicByCat[t.drillable] = t; });
  // The real formula-sheet ids that exist in js/formulas.js (kept in sync; asserted by knowledge-base.check).
  var FORMULA_SHEET_IDS = ['percentageTricks', 'profitLoss', 'ratioAverage', 'averages', 'area', 'volume', 'timeWork'];

  /* ════════════════════════ 2. PER-FAMILY SYLLABUS PROFILES (researched weightages) ════════════════════════
   * w(topicId, band, pyqFreq, confidence, nuance) → a weighting entry. A family lists the topics it tests with
   * their researched importance band + PYQ appearance frequency. Per-exam overrides refine these. */
  function w(topic, band, pyq, conf, nuance) { return { topic: topic, w: band, pyq: pyq, conf: conf || 'high', nuance: nuance || '' }; }

  // MBA / CAT universe — Arithmetic + DI very high; Algebra + Number System high; Geometry/Modern Math medium.
  var MBA = [
    w('percentages', 'very-high', 0.92), w('ratio_proportion', 'very-high', 0.88), w('profit_loss', 'high', 0.7),
    w('tsd', 'high', 0.72), w('time_work', 'high', 0.66), w('averages', 'medium', 0.55), w('mixtures', 'medium', 0.5),
    w('interest', 'medium', 0.5), w('ages', 'low', 0.3), w('partnership', 'low', 0.28), w('pipes_cisterns', 'low', 0.3),
    w('lcm_hcf', 'medium', 0.5), w('divisibility', 'medium', 0.55), w('remainders', 'high', 0.6, 'high', 'A CAT favourite — invest here.'),
    w('factors_divisors', 'high', 0.6), w('cyclicity_units', 'medium', 0.5), w('primes_factorisation', 'medium', 0.45),
    w('base_systems', 'low', 0.25, 'med'), w('fractions_decimals', 'medium', 0.5), w('multiplication_fluency', 'medium', 0.6),
    w('linear_equations', 'high', 0.6), w('quadratic_equations', 'high', 0.6), w('inequalities_modulus', 'high', 0.55),
    w('progressions', 'high', 0.6), w('functions_graphs', 'medium', 0.45, 'med'), w('logarithms', 'medium', 0.45),
    w('surds_indices', 'medium', 0.45), w('algebraic_identities', 'medium', 0.5),
    w('triangles', 'high', 0.6), w('lines_angles', 'medium', 0.5), w('circles', 'medium', 0.5),
    w('coordinate_geometry', 'medium', 0.45), w('mensuration_2d', 'high', 0.6), w('mensuration_3d', 'medium', 0.5),
    w('permutations_combinations', 'high', 0.6), w('probability', 'medium', 0.5), w('set_theory', 'medium', 0.5),
    w('di_tables_charts', 'very-high', 0.85), w('di_caselet', 'high', 0.6), w('data_sufficiency', 'medium', 0.5)
  ];

  // Banking (IBPS/SBI PO & Clerk, RRB) — Simplification + DI + Arithmetic word problems dominate; geometry minimal.
  var BANKING = [
    w('simplification', 'very-high', 0.92), w('number_series', 'very-high', 0.85), w('di_tables_charts', 'very-high', 0.9),
    w('di_caselet', 'high', 0.6), w('quadratic_comparison', 'high', 0.65), w('data_sufficiency', 'medium', 0.5),
    w('percentages', 'very-high', 0.85), w('ratio_proportion', 'high', 0.7), w('profit_loss', 'high', 0.72),
    w('interest', 'high', 0.7), w('averages', 'high', 0.65), w('mixtures', 'medium', 0.5), w('partnership', 'medium', 0.45),
    w('ages', 'medium', 0.45), w('tsd', 'high', 0.7), w('trains_boats', 'medium', 0.5), w('time_work', 'high', 0.68),
    w('pipes_cisterns', 'medium', 0.45), w('multiplication_fluency', 'high', 0.7), w('lcm_hcf', 'medium', 0.5),
    w('mensuration_2d', 'medium', 0.5), w('mensuration_3d', 'low', 0.35), w('permutations_combinations', 'medium', 0.45),
    w('probability', 'medium', 0.4), w('quadratic_equations', 'medium', 0.5)
  ];

  // SSC (CGL/CHSL/MTS) — Arithmetic + Algebra + Geometry + Trig + Mensuration, advanced for CGL.
  var SSC = [
    w('simplification', 'high', 0.7), w('percentages', 'very-high', 0.8), w('ratio_proportion', 'high', 0.72),
    w('profit_loss', 'very-high', 0.78), w('interest', 'high', 0.66), w('averages', 'high', 0.6), w('mixtures', 'medium', 0.5),
    w('tsd', 'high', 0.68), w('time_work', 'high', 0.66), w('partnership', 'medium', 0.45), w('ages', 'medium', 0.4),
    w('number_series', 'medium', 0.5), w('lcm_hcf', 'medium', 0.5), w('divisibility', 'medium', 0.5),
    w('algebraic_identities', 'high', 0.65, 'high', 'SSC loves algebraic-identity simplification.'), w('linear_equations', 'high', 0.6),
    w('quadratic_equations', 'medium', 0.5), w('surds_indices', 'medium', 0.5),
    w('triangles', 'high', 0.66), w('circles', 'high', 0.6), w('lines_angles', 'medium', 0.55), w('coordinate_geometry', 'low', 0.35),
    w('trigonometry', 'high', 0.68, 'high', 'Heights & Distances appear every year.'), w('mensuration_2d', 'high', 0.66), w('mensuration_3d', 'high', 0.6),
    w('di_tables_charts', 'high', 0.6), w('statistics', 'low', 0.3)
  ];

  // Defense (NDA/CDS/AFCAT) — Algebra, Trig, Geometry, Calculus-adjacent; Matrices, Statistics.
  var DEFENSE = [
    w('multiplication_fluency', 'medium', 0.55), w('lcm_hcf', 'medium', 0.5), w('fractions_decimals', 'medium', 0.5),
    w('percentages', 'high', 0.66), w('ratio_proportion', 'high', 0.62), w('averages', 'medium', 0.5), w('profit_loss', 'medium', 0.55),
    w('interest', 'medium', 0.5), w('tsd', 'high', 0.6), w('time_work', 'medium', 0.5),
    w('linear_equations', 'high', 0.66), w('quadratic_equations', 'high', 0.66), w('inequalities_modulus', 'medium', 0.5),
    w('surds_indices', 'medium', 0.55), w('logarithms', 'medium', 0.5), w('progressions', 'medium', 0.5),
    w('set_theory', 'medium', 0.5), w('matrices_determinants', 'high', 0.6, 'high', 'NDA/CDS test matrices & determinants directly.'),
    w('trigonometry', 'very-high', 0.8, 'high', 'The heaviest defense topic.'), w('triangles', 'high', 0.62), w('lines_angles', 'medium', 0.5),
    w('circles', 'medium', 0.5), w('coordinate_geometry', 'high', 0.6), w('mensuration_2d', 'high', 0.62), w('mensuration_3d', 'high', 0.6),
    w('statistics', 'high', 0.6), w('probability', 'medium', 0.5)
  ];

  // School / Foundation (CUET/CLAT/NTSE/JEE/Olympiad) — broad school maths, gentle by default (JEE overrides up).
  var SCHOOL = [
    w('multiplication_fluency', 'high', 0.7), w('fractions_decimals', 'high', 0.66), w('squares_roots', 'medium', 0.5),
    w('cubes_roots', 'low', 0.4), w('percentages', 'very-high', 0.78), w('ratio_proportion', 'high', 0.68), w('averages', 'high', 0.6),
    w('profit_loss', 'high', 0.62), w('interest', 'medium', 0.5), w('tsd', 'high', 0.6), w('time_work', 'medium', 0.55),
    w('linear_equations', 'high', 0.62), w('quadratic_equations', 'medium', 0.5), w('progressions', 'medium', 0.5),
    w('surds_indices', 'medium', 0.5), w('lines_angles', 'high', 0.6), w('triangles', 'high', 0.6), w('circles', 'medium', 0.5),
    w('mensuration_2d', 'high', 0.62), w('mensuration_3d', 'medium', 0.5), w('coordinate_geometry', 'medium', 0.5),
    w('trigonometry', 'medium', 0.5), w('statistics', 'medium', 0.5), w('probability', 'medium', 0.45),
    w('set_theory', 'medium', 0.45), w('di_tables_charts', 'high', 0.6)
  ];

  // Generic fallback — the everyday quant core.
  var GENERIC = [
    w('multiplication_fluency', 'high', 0.7), w('fractions_decimals', 'high', 0.66), w('percentages', 'very-high', 0.8),
    w('ratio_proportion', 'high', 0.7), w('averages', 'high', 0.6), w('profit_loss', 'high', 0.66), w('interest', 'medium', 0.5),
    w('tsd', 'high', 0.62), w('time_work', 'high', 0.6), w('mensuration_2d', 'medium', 0.5), w('mensuration_3d', 'low', 0.4),
    w('di_tables_charts', 'high', 0.66), w('simplification', 'high', 0.66), w('number_series', 'medium', 0.5)
  ];

  var FAMILY = { mba: MBA, banking: BANKING, ssc: SSC, defense: DEFENSE, school: SCHOOL, generic: GENERIC };

  /* ════════════════════════ EXAM CATALOG + per-exam overrides ════════════════════════
   * Each exam → its family profile, plus `nuance` (exam-specific note) and `overrides` (topicId → partial weight
   * tweak) where the exam genuinely differs from its family. */
  var EXAMS = [
    // --- MBA / management ---
    { id: 'cat', name: 'CAT', aliases: ['Common Admission Test', 'IIM'], family: 'mba', nuance: 'Hardest, concept-deep; rewards Number System + Algebra mastery and DI/Caselet speed.' },
    { id: 'xat', name: 'XAT', aliases: ['Xavier Aptitude Test'], family: 'mba', nuance: 'Tricky, application-heavy QA; strong Arithmetic + Mensuration; trustworthy slow accuracy.',
      overrides: { mensuration_2d: 'high', mensuration_3d: 'high', set_theory: 'high', di_caselet: 'medium' } },
    { id: 'gmat', name: 'GMAT', aliases: ['Graduate Management Admission Test'], family: 'mba', nuance: 'Problem-Solving + Data Sufficiency; Arithmetic/Algebra/Number-properties; little heavy Geometry, no Indian-style DI.',
      overrides: { data_sufficiency: 'very-high', di_tables_charts: 'low', di_caselet: 'low', trigonometry: null, coordinate_geometry: 'low', remainders: 'medium' } },
    { id: 'snap', name: 'SNAP', aliases: ['Symbiosis'], family: 'mba', nuance: 'Easier & speed-driven; reward fast Arithmetic + basic Algebra; depth less rewarded than accuracy+pace.',
      overrides: { remainders: 'medium', functions_graphs: 'low', di_caselet: 'medium', permutations_combinations: 'medium' } },
    { id: 'nmat', name: 'NMAT', aliases: ['NMIMS'], family: 'mba', nuance: 'Speed exam, no negative marking; broad-but-easy Arithmetic + DI; attempt everything fast.',
      overrides: { remainders: 'medium', functions_graphs: 'low', inequalities_modulus: 'medium', di_tables_charts: 'high' } },
    { id: 'cmat', name: 'CMAT', aliases: ['Common Management Admission Test'], family: 'mba', nuance: 'NTA exam, moderate difficulty; solid Arithmetic + DI core.',
      overrides: { remainders: 'medium', functions_graphs: 'low' } },
    { id: 'mbacet', name: 'MBA CET', aliases: ['MAH CET', 'Maharashtra CET'], family: 'mba', nuance: 'High-volume, speed-and-accuracy; Arithmetic + DI heavy, conceptual depth lighter than CAT.',
      overrides: { remainders: 'medium', base_systems: 'low', functions_graphs: 'low', logarithms: 'low', di_tables_charts: 'very-high' } },
    { id: 'ipmat', name: 'IPMAT', aliases: ['IPM', 'Integrated Program in Management'], family: 'mba', nuance: 'After-class-12 entry; cleaner school-grade Algebra + Arithmetic; some short-answer.',
      overrides: { progressions: 'high', logarithms: 'high', set_theory: 'high', di_caselet: 'medium' } },

    // --- Banking ---
    { id: 'bankpo', name: 'Bank PO', aliases: ['Probationary Officer'], family: 'banking', nuance: 'DI + Simplification + Arithmetic word problems; speed is everything.' },
    { id: 'ibpspo', name: 'IBPS PO', aliases: ['IBPS Probationary Officer'], family: 'banking', nuance: 'DI-heavy with Caselet & quadratic comparison; Arithmetic word problems.' },
    { id: 'ibpsclerk', name: 'IBPS Clerk', aliases: ['IBPS Clerical'], family: 'banking', nuance: 'Simpler than PO — Simplification + Number Series + basic Arithmetic dominate.',
      overrides: { di_caselet: 'medium', quadratic_comparison: 'medium', permutations_combinations: 'low', probability: 'low' } },
    { id: 'sbipo', name: 'SBI PO', aliases: ['State Bank PO'], family: 'banking', nuance: 'Hardest banking QA — newest DI patterns + tougher word problems.',
      overrides: { di_caselet: 'very-high', permutations_combinations: 'high', probability: 'medium' } },
    { id: 'rrbntpc', name: 'RRB NTPC', aliases: ['Railway NTPC'], family: 'banking', nuance: 'Railway exam — broader basic Arithmetic + Mensuration; lighter DI than bank PO.',
      overrides: { di_tables_charts: 'high', di_caselet: 'low', mensuration_2d: 'high', mensuration_3d: 'medium', simplification: 'high' } },

    // --- SSC ---
    { id: 'ssccgl', name: 'SSC CGL', aliases: ['Combined Graduate Level'], family: 'ssc', nuance: 'Advanced maths — Algebra identities, Geometry, Trig, Mensuration all heavy.' },
    { id: 'sscchsl', name: 'SSC CHSL', aliases: ['Combined Higher Secondary'], family: 'ssc', nuance: 'Slightly easier than CGL; same topics, more Arithmetic weight.',
      overrides: { trigonometry: 'medium', coordinate_geometry: null, statistics: null } },
    { id: 'sscmts', name: 'SSC MTS', aliases: ['Multi Tasking Staff'], family: 'ssc', nuance: 'Basic arithmetic-led; light Algebra/Geometry.',
      overrides: { trigonometry: 'low', algebraic_identities: 'medium', quadratic_equations: 'low', circles: 'medium', coordinate_geometry: null, statistics: null } },

    // --- Defense ---
    { id: 'nda', name: 'NDA', aliases: ['National Defence Academy'], family: 'defense', nuance: 'Maths is 300/900 marks — Trig, Algebra, Matrices, Calculus-adjacent, Statistics, Probability.' },
    { id: 'cds', name: 'CDS', aliases: ['Combined Defence Services'], family: 'defense', nuance: 'Elementary-maths breadth — Arithmetic + Algebra + Geometry + Trig + Mensuration evenly.',
      overrides: { matrices_determinants: 'medium', percentages: 'high', profit_loss: 'high', tsd: 'high' } },
    { id: 'afcat', name: 'AFCAT', aliases: ['Air Force Common Admission Test'], family: 'defense', nuance: 'Lighter, speed-based numerical ability — Arithmetic core, less heavy Trig than NDA.',
      overrides: { trigonometry: 'medium', matrices_determinants: null, statistics: 'medium', percentages: 'high', profit_loss: 'high', averages: 'high', tsd: 'high', time_work: 'high' } },

    // --- School / foundation / aptitude ---
    { id: 'cuet', name: 'CUET', aliases: ['Common University Entrance Test'], family: 'school', nuance: 'General Test quant — school Arithmetic + basic Algebra + DI; speed-and-accuracy.',
      overrides: { trigonometry: 'low', coordinate_geometry: 'low', di_tables_charts: 'high' } },
    { id: 'clat', name: 'CLAT', aliases: ['Common Law Admission Test'], family: 'school', nuance: 'Elementary maths from passages — Percentages, Ratio, Averages, basic DI only.',
      overrides: { percentages: 'very-high', ratio_proportion: 'very-high', averages: 'very-high', profit_loss: 'high', interest: 'high', di_tables_charts: 'high',
        quadratic_equations: null, progressions: null, surds_indices: null, trigonometry: null, coordinate_geometry: null, circles: null, mensuration_3d: 'low' } },
    { id: 'ntse', name: 'NTSE', aliases: ['National Talent Search'], family: 'school', nuance: 'Class-10 MAT/SAT maths — strong school Algebra + Geometry + Arithmetic.',
      overrides: { trigonometry: 'medium', coordinate_geometry: 'medium' } },
    { id: 'jee', name: 'JEE (Quant)', aliases: ['JEE Main', 'JEE Mains'], family: 'school', nuance: 'Advanced 11–12 maths — Algebra, Coordinate Geometry, Trig, Functions, P&C, Probability heavy.',
      overrides: { quadratic_equations: 'very-high', functions_graphs: 'very-high', progressions: 'high', logarithms: 'high', surds_indices: 'high',
        coordinate_geometry: 'very-high', trigonometry: 'very-high', permutations_combinations: 'high', probability: 'high', matrices_determinants: 'high',
        statistics: 'medium', profit_loss: null, interest: null, di_tables_charts: null } },
    { id: 'olympiad', name: 'Olympiad', aliases: ['Math Olympiad', 'IMO'], family: 'school', nuance: 'Number theory + combinatorics + geometry proofs — depth over speed.',
      overrides: { remainders: 'very-high', primes_factorisation: 'high', factors_divisors: 'high', permutations_combinations: 'very-high', probability: 'high',
        triangles: 'high', circles: 'high', progressions: 'high', functions_graphs: 'high', di_tables_charts: null, profit_loss: null } },
    { id: 'foundation', name: 'Foundation', aliases: ['Basics', 'Class 6-10'], family: 'school', nuance: 'Building the basics — calculation fluency, fractions, percentages, ratio, basic geometry.',
      overrides: { remainders: null, functions_graphs: null, trigonometry: null, coordinate_geometry: null, probability: null, set_theory: 'low' } },

    // --- fallback ---
    { id: 'other', name: 'Other', aliases: ['Custom', 'General Aptitude'], family: 'generic', nuance: 'A balanced general quantitative-aptitude plan.' }
  ];

  /* ════════════════════════ RESOLUTION (merge library + per-exam weights → engine shape) ════════════════════════ */
  var _examById = {};
  EXAMS.forEach(function (e) { _examById[e.id] = e; });
  function getExam(examId) { return _examById[examId] || null; }

  function _roi(band, pyq, topic) {
    var imp = BAND[band] || 0.4;
    var unlockBoost = 1 + 0.12 * ((topic.unlocks || []).length);
    var effort = Math.max(0.5, (topic.avgMinutes || 90) / 90);
    var raw = imp * (0.5 + 0.5 * (pyq || 0.5)) * unlockBoost / effort;
    return Math.round(Math.min(10, raw * 10) * 10) / 10;  // 0..10, one decimal
  }

  /** Merge one weight entry + the canonical topic into the legacy engine shape + rich fields. */
  function _materialize(entry, exam) {
    var base = TOPICS[entry.topic]; if (!base) return null;
    var band = entry.w, imp = BAND[band] || 0.4;
    return {
      id: base.id, label: base.label, synonyms: base.synonyms, section: base.section,
      importance: imp, frequency: bandFreq(band), weightage: band, pyqFreq: entry.pyq != null ? entry.pyq : 0.5,
      difficulty: base.difficulty, estMinutes: base.avgMinutes, revisionIntervalDays: base.revisionIntervalDays,
      prereqs: base.prereqs, unlocks: base.unlocks, drillable: base.drillable, signals: base.signals,
      formulaSheet: base.formulaSheet, commonMistakes: base.commonMistakes, practiceIntensity: base.practiceIntensity,
      roi: _roi(band, entry.pyq, base), confidence: entry.conf || base.confidence,
      nuance: entry.nuance || ''
    };
  }

  /** Resolve an exam id → its full syllabus (per-exam weights applied). Falls back to the generic profile. */
  function resolveSyllabus(examId) {
    var ex = getExam(examId) || getExam('other');
    var family = FAMILY[ex.family] || GENERIC;
    var overrides = ex.overrides || {};
    var topics = [];
    family.forEach(function (entry) {
      var ov = overrides[entry.topic];
      if (ov === null) return;                       // exam explicitly drops this topic
      var merged = ov ? { topic: entry.topic, w: ov, pyq: entry.pyq, conf: entry.conf, nuance: entry.nuance } : entry;
      var m = _materialize(merged, ex); if (m) topics.push(m);
    });
    // keep prereqs that survive within THIS exam's selection so the engine's dependency logic stays clean
    var present = {}; topics.forEach(function (t) { present[t.id] = 1; });
    topics.forEach(function (t) {
      t.prereqs = (t.prereqs || []).filter(function (p) { return present[p]; });
      t.unlocks = (t.unlocks || []).filter(function (u) { return present[u]; });
    });
    return { id: ex.id, name: ex.name + ' Quant', examId: ex.id, family: ex.family, version: SYLLABUS_VERSION, nuance: ex.nuance || '', topics: topics };
  }

  /** getSyllabus accepts an exam id OR a legacy family key ('cat_quant'…) for backward-compatible doc reads. */
  var LEGACY_KEY = { cat_quant: 'cat', bank_ssc_quant: 'bankpo', defense_quant: 'nda', foundation_quant: 'foundation', generic_quant: 'other' };
  function getSyllabus(syllabusId) {
    if (!syllabusId) return null;
    if (_examById[syllabusId]) return resolveSyllabus(syllabusId);
    if (LEGACY_KEY[syllabusId]) return resolveSyllabus(LEGACY_KEY[syllabusId]);
    return null;
  }

  /** Find a topic within a resolved syllabus by id (engine prereq/signal lookups). */
  function getTopic(syllabusId, topicId) {
    var s = getSyllabus(syllabusId) || (syllabusId ? resolveSyllabus(syllabusId) : null);
    if (!s) return null;
    for (var i = 0; i < s.topics.length; i++) { if (s.topics[i].id === topicId) return s.topics[i]; }
    return null;
  }

  /** The canonical topic library (rich, exam-independent metadata) — for any feature needing topic facts. */
  function getCanonicalTopic(topicId) { return TOPICS[topicId] || null; }

  /** The canonical KB topic behind a drillable practice category (e.g. 'percentages' → the Percentages topic). */
  function getTopicForCat(cat) { return _topicByCat[cat] || null; }

  /** Lightweight catalog for the searchable selector: matches name + aliases (case-insensitive). */
  function searchExams(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return EXAMS.slice();
    return EXAMS.filter(function (e) {
      if (e.name.toLowerCase().indexOf(q) >= 0) return true;
      return (e.aliases || []).some(function (a) { return a.toLowerCase().indexOf(q) >= 0; });
    });
  }

  var API = {
    SYLLABUS_VERSION: SYLLABUS_VERSION,
    EXAMS: EXAMS,
    TOPICS: TOPICS,
    BAND: BAND,
    getExam: getExam,
    resolveSyllabus: resolveSyllabus,
    getSyllabus: getSyllabus,
    getTopic: getTopic,
    getCanonicalTopic: getCanonicalTopic,
    getTopicForCat: getTopicForCat,
    FORMULA_SHEET_IDS: FORMULA_SHEET_IDS,
    searchExams: searchExams
  };

  // Dual-mode export (same pattern as questions.js): <script> on the client exposes window.QR_SYLLABUS;
  // Node require()'d on the server gets the same object.
  root.QR_SYLLABUS = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
