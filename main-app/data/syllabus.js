/**
 * syllabus.js — the QuanAI Planner Syllabus Database (ADR-046).
 *
 * Real, per-exam quant syllabi: the planner schedules EVERY topic here, regardless of whether the app
 * can drill it. Each topic declares its exam weight (importance/frequency), intrinsic difficulty, a
 * dependency graph (prereqs), a spaced-revision cadence, and an estimated study budget.
 *
 * The ONLY coupling to the app's 12 drillable micro-topics is each topic's `drillable` (one of the 12
 * cats, or null) plus `signals[{cat,w}]` — a weighted map used to INFER readiness from in-app practice
 * even for topics the app cannot drill (signals, not limits). Add a 13th drillable cat later and any
 * topic that references it in `signals[]` gains a real signal automatically — no engine change.
 *
 * Reference data: identical for every user, read by BOTH the client (calendar render, explainability)
 * and the server (scheduling). It is therefore BUNDLED here (not in Firestore) and dual-exported the
 * same way questions.js is — loaded as a <script> on the client, require()'d on the server. Bump
 * SYLLABUS_VERSION whenever the content changes so the engine can detect a regenerated syllabus.
 *
 * Drillable cats (must match studentContext.CATEGORY_LABELS / questions.js):
 *   squares, cubes, area, volume, fractions, percentages, multiplication, ratios, averages,
 *   profit-loss, time-speed-distance, time-and-work
 */
(function (root) {
  'use strict';

  var SYLLABUS_VERSION = 1;

  /* ════════════════════════ EXAM CATALOG (searchable selector) ════════════════════════ */
  // family groups exams that share a syllabus; `syllabus` resolves to a SYLLABI key.
  var EXAMS = [
    // --- MBA / management ---
    { id: 'cat',      name: 'CAT',      aliases: ['Common Admission Test', 'IIM'],       family: 'mba',     syllabus: 'cat_quant' },
    { id: 'xat',      name: 'XAT',      aliases: ['Xavier Aptitude Test'],               family: 'mba',     syllabus: 'cat_quant' },
    { id: 'gmat',     name: 'GMAT',     aliases: ['Graduate Management Admission Test'],  family: 'mba',     syllabus: 'cat_quant' },
    { id: 'snap',     name: 'SNAP',     aliases: ['Symbiosis'],                           family: 'mba',     syllabus: 'cat_quant' },
    { id: 'nmat',     name: 'NMAT',     aliases: ['NMIMS'],                               family: 'mba',     syllabus: 'cat_quant' },
    { id: 'cmat',     name: 'CMAT',     aliases: ['Common Management Admission Test'],    family: 'mba',     syllabus: 'cat_quant' },
    { id: 'mbacet',   name: 'MBA CET',  aliases: ['MAH CET', 'Maharashtra CET'],         family: 'mba',     syllabus: 'cat_quant' },
    { id: 'ipmat',    name: 'IPMAT',    aliases: ['IPM', 'Integrated Program in Management'], family: 'mba', syllabus: 'cat_quant' },

    // --- Banking ---
    { id: 'bankpo',   name: 'Bank PO',  aliases: ['Probationary Officer'],               family: 'banking', syllabus: 'bank_ssc_quant' },
    { id: 'ibpspo',   name: 'IBPS PO',  aliases: ['IBPS Probationary Officer'],          family: 'banking', syllabus: 'bank_ssc_quant' },
    { id: 'ibpsclerk',name: 'IBPS Clerk', aliases: ['IBPS Clerical'],                    family: 'banking', syllabus: 'bank_ssc_quant' },
    { id: 'sbipo',    name: 'SBI PO',   aliases: ['State Bank PO'],                       family: 'banking', syllabus: 'bank_ssc_quant' },
    { id: 'rrbntpc',  name: 'RRB NTPC', aliases: ['Railway NTPC'],                        family: 'banking', syllabus: 'bank_ssc_quant' },

    // --- SSC ---
    { id: 'ssccgl',   name: 'SSC CGL',  aliases: ['Combined Graduate Level'],            family: 'ssc',     syllabus: 'bank_ssc_quant' },
    { id: 'sscchsl',  name: 'SSC CHSL', aliases: ['Combined Higher Secondary'],          family: 'ssc',     syllabus: 'bank_ssc_quant' },
    { id: 'sscmts',   name: 'SSC MTS',  aliases: ['Multi Tasking Staff'],                family: 'ssc',     syllabus: 'bank_ssc_quant' },

    // --- Defense ---
    { id: 'nda',      name: 'NDA',      aliases: ['National Defence Academy'],           family: 'defense', syllabus: 'defense_quant' },
    { id: 'cds',      name: 'CDS',      aliases: ['Combined Defence Services'],          family: 'defense', syllabus: 'defense_quant' },
    { id: 'afcat',    name: 'AFCAT',    aliases: ['Air Force Common Admission Test'],     family: 'defense', syllabus: 'defense_quant' },

    // --- School / foundation / aptitude ---
    { id: 'cuet',     name: 'CUET',     aliases: ['Common University Entrance Test'],     family: 'school',  syllabus: 'foundation_quant' },
    { id: 'clat',     name: 'CLAT',     aliases: ['Common Law Admission Test'],           family: 'school',  syllabus: 'foundation_quant' },
    { id: 'ntse',     name: 'NTSE',     aliases: ['National Talent Search'],              family: 'school',  syllabus: 'foundation_quant' },
    { id: 'jee',      name: 'JEE (Quant)', aliases: ['JEE Main', 'JEE Mains'],           family: 'school',  syllabus: 'foundation_quant' },
    { id: 'olympiad', name: 'Olympiad', aliases: ['Math Olympiad', 'IMO'],               family: 'school',  syllabus: 'foundation_quant' },
    { id: 'foundation', name: 'Foundation', aliases: ['Basics', 'Class 6-10'],           family: 'school',  syllabus: 'foundation_quant' },

    // --- fallback ---
    { id: 'other',    name: 'Other',    aliases: ['Custom', 'General Aptitude'],          family: 'generic', syllabus: 'generic_quant' }
  ];

  /* ════════════════════════ TOPIC CONSTRUCTOR ════════════════════════
   * Terse plain-data factory (keeps the syllabi readable, not abstracted): all engine math reads these
   * fields directly. importance/difficulty are 0..1; frequency mirrors importance for human copy;
   * estMinutes = study budget to a first-pass mastery; revisionIntervalDays = spaced-revision cadence;
   * prereqs = dependency-graph edges (topic ids); drillable = one of the 12 cats or null; signals =
   * weighted in-app cats used to infer readiness (defaults to the drillable cat at weight 1). */
  function t(o) {
    return {
      id: o.id,
      label: o.label,
      section: o.section,
      importance: o.importance,
      frequency: o.frequency || (o.importance >= 0.75 ? 'high' : o.importance >= 0.5 ? 'medium' : 'low'),
      difficulty: o.difficulty,
      estMinutes: o.estMinutes,
      revisionIntervalDays: o.revisionIntervalDays || 11,
      prereqs: o.prereqs || [],
      drillable: o.drillable || null,
      signals: o.signals || (o.drillable ? [{ cat: o.drillable, w: 1 }] : [])
    };
  }

  /* ════════════════════════ CAT / MBA QUANT (full real syllabus) ════════════════════════ */
  var CAT_TOPICS = [
    // Number System
    t({ id: 'multiplication_fluency', label: 'Multiplication & Calculation Speed', section: 'Number System', importance: 0.55, difficulty: 0.25, estMinutes: 90,  revisionIntervalDays: 14, drillable: 'multiplication' }),
    t({ id: 'fractions_decimals',     label: 'Fractions, Decimals & Simplification', section: 'Number System', importance: 0.60, difficulty: 0.30, estMinutes: 100, revisionIntervalDays: 12, drillable: 'fractions' }),
    t({ id: 'squares_roots',          label: 'Squares & Square Roots',            section: 'Number System', importance: 0.45, difficulty: 0.30, estMinutes: 70,  revisionIntervalDays: 14, drillable: 'squares' }),
    t({ id: 'cubes_roots',            label: 'Cubes & Cube Roots',                section: 'Number System', importance: 0.40, difficulty: 0.35, estMinutes: 60,  revisionIntervalDays: 14, drillable: 'cubes' }),
    t({ id: 'lcm_hcf',                label: 'LCM & HCF',                         section: 'Number System', importance: 0.55, difficulty: 0.40, estMinutes: 90,  revisionIntervalDays: 12, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),
    t({ id: 'divisibility_remainders',label: 'Divisibility & Remainders',         section: 'Number System', importance: 0.70, difficulty: 0.60, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['multiplication_fluency'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }] }),
    t({ id: 'number_properties',      label: 'Number Properties (Factors, Primes, Bases)', section: 'Number System', importance: 0.65, difficulty: 0.60, estMinutes: 140, revisionIntervalDays: 11, prereqs: ['lcm_hcf'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),

    // Arithmetic
    t({ id: 'percentages',            label: 'Percentages',                       section: 'Arithmetic', importance: 0.90, difficulty: 0.40, estMinutes: 120, revisionIntervalDays: 9,  prereqs: ['fractions_decimals'], drillable: 'percentages' }),
    t({ id: 'ratio_proportion',       label: 'Ratio & Proportion',                section: 'Arithmetic', importance: 0.80, difficulty: 0.40, estMinutes: 110, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], drillable: 'ratios' }),
    t({ id: 'averages',               label: 'Averages',                          section: 'Arithmetic', importance: 0.65, difficulty: 0.35, estMinutes: 90,  revisionIntervalDays: 11, drillable: 'averages' }),
    t({ id: 'profit_loss',            label: 'Profit, Loss & Discount',           section: 'Arithmetic', importance: 0.80, difficulty: 0.50, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['percentages', 'ratio_proportion'], drillable: 'profit-loss' }),
    t({ id: 'interest',               label: 'Simple & Compound Interest',        section: 'Arithmetic', importance: 0.70, difficulty: 0.55, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['percentages'], signals: [{ cat: 'percentages', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'mixtures',               label: 'Mixtures & Alligations',            section: 'Arithmetic', importance: 0.60, difficulty: 0.60, estMinutes: 120, revisionIntervalDays: 11, prereqs: ['ratio_proportion', 'averages'], signals: [{ cat: 'ratios', w: 0.5 }, { cat: 'averages', w: 0.3 }, { cat: 'percentages', w: 0.2 }] }),
    t({ id: 'tsd',                    label: 'Time, Speed & Distance',            section: 'Arithmetic', importance: 0.75, difficulty: 0.55, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-speed-distance' }),
    t({ id: 'time_work',              label: 'Time & Work',                       section: 'Arithmetic', importance: 0.70, difficulty: 0.55, estMinutes: 140, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-and-work' }),
    t({ id: 'pipes_cisterns',         label: 'Pipes & Cisterns',                  section: 'Arithmetic', importance: 0.45, difficulty: 0.50, estMinutes: 70,  revisionIntervalDays: 12, prereqs: ['time_work'], signals: [{ cat: 'time-and-work', w: 1 }] }),

    // Algebra
    t({ id: 'linear_quadratic',       label: 'Linear & Quadratic Equations',      section: 'Algebra', importance: 0.80, difficulty: 0.60, estMinutes: 170, revisionIntervalDays: 9,  prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'inequalities_modulus',   label: 'Inequalities & Modulus',            section: 'Algebra', importance: 0.60, difficulty: 0.65, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['linear_quadratic'], signals: [{ cat: 'fractions', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),
    t({ id: 'progressions',           label: 'Sequences & Series (AP, GP, HP)',   section: 'Algebra', importance: 0.65, difficulty: 0.60, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['linear_quadratic'], signals: [{ cat: 'averages', w: 0.4 }, { cat: 'multiplication', w: 0.6 }] }),
    t({ id: 'functions_graphs',       label: 'Functions & Graphs',                section: 'Algebra', importance: 0.55, difficulty: 0.70, estMinutes: 110, revisionIntervalDays: 12, prereqs: ['linear_quadratic'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'logarithms',             label: 'Logarithms',                        section: 'Algebra', importance: 0.45, difficulty: 0.65, estMinutes: 80,  revisionIntervalDays: 12, prereqs: ['linear_quadratic'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),

    // Geometry & Mensuration
    t({ id: 'lines_angles',           label: 'Lines, Angles & Polygons',          section: 'Geometry', importance: 0.55, difficulty: 0.50, estMinutes: 90,  revisionIntervalDays: 12, signals: [{ cat: 'area', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),
    t({ id: 'triangles',              label: 'Triangles',                         section: 'Geometry', importance: 0.70, difficulty: 0.65, estMinutes: 160, revisionIntervalDays: 10, prereqs: ['lines_angles'], signals: [{ cat: 'area', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),
    t({ id: 'circles',                label: 'Circles',                           section: 'Geometry', importance: 0.55, difficulty: 0.60, estMinutes: 100, revisionIntervalDays: 11, prereqs: ['lines_angles'], signals: [{ cat: 'area', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'coordinate_geometry',    label: 'Coordinate Geometry',               section: 'Geometry', importance: 0.50, difficulty: 0.65, estMinutes: 100, revisionIntervalDays: 12, prereqs: ['linear_quadratic'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'area', w: 0.5 }] }),
    t({ id: 'mensuration_2d',         label: 'Areas of 2D Figures',               section: 'Mensuration', importance: 0.65, difficulty: 0.50, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['lines_angles'], drillable: 'area' }),
    t({ id: 'mensuration_3d',         label: 'Volumes & Surface Areas',           section: 'Mensuration', importance: 0.60, difficulty: 0.55, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['mensuration_2d'], drillable: 'volume' }),
    t({ id: 'trigonometry',           label: 'Trigonometry & Heights/Distances',  section: 'Geometry', importance: 0.40, difficulty: 0.70, estMinutes: 110, revisionIntervalDays: 12, prereqs: ['triangles'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'area', w: 0.5 }] }),

    // Modern Math
    t({ id: 'permutations_combinations', label: 'Permutations & Combinations',    section: 'Modern Math', importance: 0.60, difficulty: 0.70, estMinutes: 130, revisionIntervalDays: 11, prereqs: ['number_properties'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }] }),
    t({ id: 'probability',            label: 'Probability',                       section: 'Modern Math', importance: 0.55, difficulty: 0.70, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['permutations_combinations'], signals: [{ cat: 'fractions', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'set_theory',             label: 'Set Theory & Venn Diagrams',        section: 'Modern Math', importance: 0.50, difficulty: 0.50, estMinutes: 80,  revisionIntervalDays: 12, signals: [{ cat: 'percentages', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),

    // Data Interpretation
    t({ id: 'di_tables_charts',       label: 'Data Interpretation (Tables, Charts, Graphs)', section: 'Data Interpretation', importance: 0.85, difficulty: 0.60, estMinutes: 200, revisionIntervalDays: 9, prereqs: ['percentages', 'averages', 'ratio_proportion'], signals: [{ cat: 'percentages', w: 0.35 }, { cat: 'averages', w: 0.25 }, { cat: 'multiplication', w: 0.25 }, { cat: 'ratios', w: 0.15 }] }),
    t({ id: 'data_sufficiency',       label: 'Data Sufficiency',                  section: 'Data Interpretation', importance: 0.60, difficulty: 0.60, estMinutes: 90, revisionIntervalDays: 11, prereqs: ['di_tables_charts'], signals: [{ cat: 'percentages', w: 0.5 }, { cat: 'ratios', w: 0.5 }] })
  ];

  /* ════════════════════════ BANKING / SSC QUANT (arithmetic + DI heavy) ════════════════════════ */
  var BANK_SSC_TOPICS = [
    // Number System & basics
    t({ id: 'simplification',         label: 'Simplification & Approximation',    section: 'Number System', importance: 0.85, difficulty: 0.35, estMinutes: 110, revisionIntervalDays: 9,  drillable: 'fractions', signals: [{ cat: 'fractions', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'multiplication_fluency', label: 'Multiplication & Calculation Speed', section: 'Number System', importance: 0.70, difficulty: 0.25, estMinutes: 90, revisionIntervalDays: 12, drillable: 'multiplication' }),
    t({ id: 'squares_roots',          label: 'Squares, Cubes & Roots',            section: 'Number System', importance: 0.55, difficulty: 0.30, estMinutes: 80, revisionIntervalDays: 13, drillable: 'squares', signals: [{ cat: 'squares', w: 0.6 }, { cat: 'cubes', w: 0.4 }] }),
    t({ id: 'number_series',          label: 'Number Series (Missing & Wrong)',   section: 'Number System', importance: 0.80, difficulty: 0.50, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['multiplication_fluency'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'squares', w: 0.4 }] }),
    t({ id: 'lcm_hcf',                label: 'LCM & HCF',                         section: 'Number System', importance: 0.55, difficulty: 0.40, estMinutes: 80, revisionIntervalDays: 12, prereqs: ['simplification'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),

    // Arithmetic
    t({ id: 'percentages',            label: 'Percentages',                       section: 'Arithmetic', importance: 0.90, difficulty: 0.40, estMinutes: 120, revisionIntervalDays: 9,  prereqs: ['simplification'], drillable: 'percentages' }),
    t({ id: 'ratio_proportion',       label: 'Ratio & Proportion',                section: 'Arithmetic', importance: 0.80, difficulty: 0.40, estMinutes: 100, revisionIntervalDays: 10, prereqs: ['simplification'], drillable: 'ratios' }),
    t({ id: 'averages',               label: 'Averages',                          section: 'Arithmetic', importance: 0.70, difficulty: 0.35, estMinutes: 90,  revisionIntervalDays: 11, drillable: 'averages' }),
    t({ id: 'profit_loss',            label: 'Profit, Loss & Discount',           section: 'Arithmetic', importance: 0.85, difficulty: 0.50, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['percentages', 'ratio_proportion'], drillable: 'profit-loss' }),
    t({ id: 'interest',               label: 'Simple & Compound Interest',        section: 'Arithmetic', importance: 0.80, difficulty: 0.55, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['percentages'], signals: [{ cat: 'percentages', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'mixtures',               label: 'Mixtures & Alligations',            section: 'Arithmetic', importance: 0.60, difficulty: 0.60, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['ratio_proportion', 'averages'], signals: [{ cat: 'ratios', w: 0.5 }, { cat: 'averages', w: 0.3 }, { cat: 'percentages', w: 0.2 }] }),
    t({ id: 'partnerships',           label: 'Partnerships & Shares',             section: 'Arithmetic', importance: 0.50, difficulty: 0.50, estMinutes: 70,  revisionIntervalDays: 12, prereqs: ['ratio_proportion'], signals: [{ cat: 'ratios', w: 0.7 }, { cat: 'percentages', w: 0.3 }] }),
    t({ id: 'ages',                   label: 'Problems on Ages',                  section: 'Arithmetic', importance: 0.50, difficulty: 0.45, estMinutes: 70,  revisionIntervalDays: 12, prereqs: ['ratio_proportion'], signals: [{ cat: 'ratios', w: 0.6 }, { cat: 'averages', w: 0.4 }] }),
    t({ id: 'tsd',                    label: 'Time, Speed & Distance',            section: 'Arithmetic', importance: 0.80, difficulty: 0.55, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-speed-distance' }),
    t({ id: 'boats_streams',          label: 'Boats & Streams',                   section: 'Arithmetic', importance: 0.50, difficulty: 0.50, estMinutes: 70,  revisionIntervalDays: 12, prereqs: ['tsd'], signals: [{ cat: 'time-speed-distance', w: 1 }] }),
    t({ id: 'time_work',              label: 'Time & Work',                       section: 'Arithmetic', importance: 0.75, difficulty: 0.55, estMinutes: 140, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-and-work' }),
    t({ id: 'pipes_cisterns',         label: 'Pipes & Cisterns',                  section: 'Arithmetic', importance: 0.50, difficulty: 0.50, estMinutes: 70,  revisionIntervalDays: 12, prereqs: ['time_work'], signals: [{ cat: 'time-and-work', w: 1 }] }),

    // Mensuration
    t({ id: 'mensuration_2d',         label: 'Areas of 2D Figures',               section: 'Mensuration', importance: 0.60, difficulty: 0.50, estMinutes: 100, revisionIntervalDays: 11, drillable: 'area' }),
    t({ id: 'mensuration_3d',         label: 'Volumes & Surface Areas',           section: 'Mensuration', importance: 0.55, difficulty: 0.55, estMinutes: 100, revisionIntervalDays: 11, prereqs: ['mensuration_2d'], drillable: 'volume' }),

    // Algebra & Modern Math (lighter weight)
    t({ id: 'algebra_basics',         label: 'Algebra & Quadratic Equations',     section: 'Algebra', importance: 0.65, difficulty: 0.55, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['simplification'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'permutations_combinations', label: 'Permutations, Combinations & Probability', section: 'Modern Math', importance: 0.55, difficulty: 0.65, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['ratio_proportion'], signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),

    // Data Interpretation (heavy in banking)
    t({ id: 'di_tables_charts',       label: 'Data Interpretation (Tables, Bar, Pie, Line)', section: 'Data Interpretation', importance: 0.90, difficulty: 0.55, estMinutes: 200, revisionIntervalDays: 9, prereqs: ['percentages', 'averages', 'ratio_proportion'], signals: [{ cat: 'percentages', w: 0.35 }, { cat: 'averages', w: 0.25 }, { cat: 'multiplication', w: 0.25 }, { cat: 'ratios', w: 0.15 }] }),
    t({ id: 'di_caselet',             label: 'Caselet & Missing DI',              section: 'Data Interpretation', importance: 0.70, difficulty: 0.65, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['di_tables_charts'], signals: [{ cat: 'percentages', w: 0.4 }, { cat: 'averages', w: 0.3 }, { cat: 'ratios', w: 0.3 }] }),
    t({ id: 'quadratic_comparison',   label: 'Quadratic Equation Comparison',     section: 'Data Interpretation', importance: 0.65, difficulty: 0.50, estMinutes: 90, revisionIntervalDays: 10, prereqs: ['algebra_basics'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'data_sufficiency',       label: 'Data Sufficiency',                  section: 'Data Interpretation', importance: 0.55, difficulty: 0.55, estMinutes: 80, revisionIntervalDays: 11, prereqs: ['di_tables_charts'], signals: [{ cat: 'percentages', w: 0.5 }, { cat: 'ratios', w: 0.5 }] })
  ];

  /* ════════════════════════ DEFENSE QUANT (NDA/CDS/AFCAT — algebra/geometry/trig heavy) ════════════════════════ */
  var DEFENSE_TOPICS = [
    t({ id: 'number_system',          label: 'Number System & HCF/LCM',           section: 'Arithmetic', importance: 0.75, difficulty: 0.45, estMinutes: 120, revisionIntervalDays: 10, drillable: 'multiplication', signals: [{ cat: 'multiplication', w: 0.6 }, { cat: 'fractions', w: 0.4 }] }),
    t({ id: 'fractions_decimals',     label: 'Fractions, Decimals & Simplification', section: 'Arithmetic', importance: 0.60, difficulty: 0.30, estMinutes: 90, revisionIntervalDays: 12, drillable: 'fractions' }),
    t({ id: 'percentages',            label: 'Percentages',                       section: 'Arithmetic', importance: 0.75, difficulty: 0.40, estMinutes: 110, revisionIntervalDays: 9,  prereqs: ['fractions_decimals'], drillable: 'percentages' }),
    t({ id: 'ratio_proportion',       label: 'Ratio, Proportion & Variation',     section: 'Arithmetic', importance: 0.70, difficulty: 0.40, estMinutes: 100, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], drillable: 'ratios' }),
    t({ id: 'averages',               label: 'Averages',                          section: 'Arithmetic', importance: 0.60, difficulty: 0.35, estMinutes: 80, revisionIntervalDays: 11, drillable: 'averages' }),
    t({ id: 'profit_loss',            label: 'Profit, Loss & Interest',           section: 'Arithmetic', importance: 0.65, difficulty: 0.50, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['percentages'], drillable: 'profit-loss' }),
    t({ id: 'tsd',                    label: 'Time, Speed, Distance & Work',      section: 'Arithmetic', importance: 0.70, difficulty: 0.55, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-speed-distance', signals: [{ cat: 'time-speed-distance', w: 0.6 }, { cat: 'time-and-work', w: 0.4 }] }),
    t({ id: 'algebra',                label: 'Algebra (Polynomials, Equations)',  section: 'Algebra', importance: 0.85, difficulty: 0.60, estMinutes: 180, revisionIntervalDays: 9, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'quadratic_equations',    label: 'Quadratic Equations & Inequalities', section: 'Algebra', importance: 0.75, difficulty: 0.65, estMinutes: 140, revisionIntervalDays: 10, prereqs: ['algebra'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'sets_relations',         label: 'Sets, Relations & Functions',       section: 'Algebra', importance: 0.55, difficulty: 0.60, estMinutes: 100, revisionIntervalDays: 11, prereqs: ['algebra'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'percentages', w: 0.5 }] }),
    t({ id: 'matrices_determinants',  label: 'Matrices & Determinants',           section: 'Algebra', importance: 0.55, difficulty: 0.65, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['algebra'], signals: [{ cat: 'multiplication', w: 0.7 }, { cat: 'fractions', w: 0.3 }] }),
    t({ id: 'trigonometry',           label: 'Trigonometry & Heights/Distances',  section: 'Trigonometry', importance: 0.85, difficulty: 0.70, estMinutes: 180, revisionIntervalDays: 9, prereqs: ['algebra'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'geometry',               label: 'Geometry (Lines, Triangles, Circles)', section: 'Geometry', importance: 0.75, difficulty: 0.60, estMinutes: 160, revisionIntervalDays: 10, signals: [{ cat: 'area', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),
    t({ id: 'coordinate_geometry',    label: 'Coordinate Geometry',               section: 'Geometry', importance: 0.65, difficulty: 0.65, estMinutes: 120, revisionIntervalDays: 11, prereqs: ['algebra', 'geometry'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'area', w: 0.5 }] }),
    t({ id: 'mensuration_2d',         label: 'Mensuration — 2D Areas',            section: 'Mensuration', importance: 0.65, difficulty: 0.50, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['geometry'], drillable: 'area' }),
    t({ id: 'mensuration_3d',         label: 'Mensuration — Volumes & Surfaces',  section: 'Mensuration', importance: 0.60, difficulty: 0.55, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['mensuration_2d'], drillable: 'volume' }),
    t({ id: 'statistics',             label: 'Statistics & Probability',          section: 'Modern Math', importance: 0.60, difficulty: 0.55, estMinutes: 110, revisionIntervalDays: 11, prereqs: ['averages'], signals: [{ cat: 'averages', w: 0.5 }, { cat: 'percentages', w: 0.5 }] })
  ];

  /* ════════════════════════ FOUNDATION QUANT (school / aptitude — broad & gentle) ════════════════════════ */
  var FOUNDATION_TOPICS = [
    t({ id: 'multiplication_fluency', label: 'Multiplication & Tables',           section: 'Number Skills', importance: 0.80, difficulty: 0.20, estMinutes: 90, revisionIntervalDays: 12, drillable: 'multiplication' }),
    t({ id: 'fractions_decimals',     label: 'Fractions & Decimals',              section: 'Number Skills', importance: 0.75, difficulty: 0.30, estMinutes: 100, revisionIntervalDays: 11, drillable: 'fractions' }),
    t({ id: 'squares_roots',          label: 'Squares & Square Roots',            section: 'Number Skills', importance: 0.55, difficulty: 0.30, estMinutes: 70, revisionIntervalDays: 13, drillable: 'squares' }),
    t({ id: 'cubes_roots',            label: 'Cubes & Cube Roots',                section: 'Number Skills', importance: 0.50, difficulty: 0.35, estMinutes: 60, revisionIntervalDays: 13, drillable: 'cubes' }),
    t({ id: 'percentages',            label: 'Percentages',                       section: 'Arithmetic', importance: 0.85, difficulty: 0.40, estMinutes: 110, revisionIntervalDays: 9, prereqs: ['fractions_decimals'], drillable: 'percentages' }),
    t({ id: 'ratio_proportion',       label: 'Ratio & Proportion',                section: 'Arithmetic', importance: 0.75, difficulty: 0.40, estMinutes: 100, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], drillable: 'ratios' }),
    t({ id: 'averages',               label: 'Averages',                          section: 'Arithmetic', importance: 0.65, difficulty: 0.35, estMinutes: 80, revisionIntervalDays: 11, drillable: 'averages' }),
    t({ id: 'profit_loss',            label: 'Profit & Loss',                     section: 'Arithmetic', importance: 0.70, difficulty: 0.50, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['percentages', 'ratio_proportion'], drillable: 'profit-loss' }),
    t({ id: 'interest',               label: 'Simple & Compound Interest',        section: 'Arithmetic', importance: 0.60, difficulty: 0.50, estMinutes: 100, revisionIntervalDays: 11, prereqs: ['percentages'], signals: [{ cat: 'percentages', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'tsd',                    label: 'Time, Speed & Distance',            section: 'Arithmetic', importance: 0.70, difficulty: 0.50, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-speed-distance' }),
    t({ id: 'time_work',              label: 'Time & Work',                       section: 'Arithmetic', importance: 0.65, difficulty: 0.50, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-and-work' }),
    t({ id: 'algebra_basics',         label: 'Basic Algebra & Equations',         section: 'Algebra', importance: 0.70, difficulty: 0.55, estMinutes: 140, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], signals: [{ cat: 'multiplication', w: 0.5 }, { cat: 'fractions', w: 0.5 }] }),
    t({ id: 'geometry_basics',        label: 'Geometry (Lines, Angles, Shapes)',  section: 'Geometry', importance: 0.65, difficulty: 0.50, estMinutes: 120, revisionIntervalDays: 11, signals: [{ cat: 'area', w: 0.5 }, { cat: 'multiplication', w: 0.5 }] }),
    t({ id: 'mensuration_2d',         label: 'Areas & Perimeters',                section: 'Mensuration', importance: 0.65, difficulty: 0.45, estMinutes: 100, revisionIntervalDays: 11, prereqs: ['geometry_basics'], drillable: 'area' }),
    t({ id: 'mensuration_3d',         label: 'Volumes & Surface Areas',           section: 'Mensuration', importance: 0.55, difficulty: 0.50, estMinutes: 90, revisionIntervalDays: 11, prereqs: ['mensuration_2d'], drillable: 'volume' }),
    t({ id: 'di_basics',              label: 'Data Interpretation & Handling',    section: 'Data Interpretation', importance: 0.70, difficulty: 0.50, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['percentages', 'averages'], signals: [{ cat: 'percentages', w: 0.4 }, { cat: 'averages', w: 0.3 }, { cat: 'multiplication', w: 0.3 }] })
  ];

  /* ════════════════════════ GENERIC QUANT (fallback for "Other") ════════════════════════ */
  var GENERIC_TOPICS = [
    t({ id: 'multiplication_fluency', label: 'Multiplication & Calculation Speed', section: 'Number Skills', importance: 0.70, difficulty: 0.25, estMinutes: 90, revisionIntervalDays: 12, drillable: 'multiplication' }),
    t({ id: 'fractions_decimals',     label: 'Fractions, Decimals & Simplification', section: 'Number Skills', importance: 0.70, difficulty: 0.30, estMinutes: 100, revisionIntervalDays: 11, drillable: 'fractions' }),
    t({ id: 'squares_roots',          label: 'Squares & Roots',                   section: 'Number Skills', importance: 0.50, difficulty: 0.30, estMinutes: 70, revisionIntervalDays: 13, drillable: 'squares' }),
    t({ id: 'percentages',            label: 'Percentages',                       section: 'Arithmetic', importance: 0.85, difficulty: 0.40, estMinutes: 110, revisionIntervalDays: 9, prereqs: ['fractions_decimals'], drillable: 'percentages' }),
    t({ id: 'ratio_proportion',       label: 'Ratio & Proportion',                section: 'Arithmetic', importance: 0.75, difficulty: 0.40, estMinutes: 100, revisionIntervalDays: 10, prereqs: ['fractions_decimals'], drillable: 'ratios' }),
    t({ id: 'averages',               label: 'Averages',                          section: 'Arithmetic', importance: 0.65, difficulty: 0.35, estMinutes: 80, revisionIntervalDays: 11, drillable: 'averages' }),
    t({ id: 'profit_loss',            label: 'Profit, Loss & Discount',           section: 'Arithmetic', importance: 0.75, difficulty: 0.50, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['percentages', 'ratio_proportion'], drillable: 'profit-loss' }),
    t({ id: 'interest',               label: 'Simple & Compound Interest',        section: 'Arithmetic', importance: 0.65, difficulty: 0.50, estMinutes: 100, revisionIntervalDays: 11, prereqs: ['percentages'], signals: [{ cat: 'percentages', w: 0.6 }, { cat: 'multiplication', w: 0.4 }] }),
    t({ id: 'tsd',                    label: 'Time, Speed & Distance',            section: 'Arithmetic', importance: 0.70, difficulty: 0.50, estMinutes: 130, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-speed-distance' }),
    t({ id: 'time_work',              label: 'Time & Work',                       section: 'Arithmetic', importance: 0.65, difficulty: 0.50, estMinutes: 120, revisionIntervalDays: 10, prereqs: ['ratio_proportion'], drillable: 'time-and-work' }),
    t({ id: 'mensuration_2d',         label: 'Areas of 2D Figures',               section: 'Mensuration', importance: 0.60, difficulty: 0.50, estMinutes: 100, revisionIntervalDays: 11, drillable: 'area' }),
    t({ id: 'mensuration_3d',         label: 'Volumes & Surface Areas',           section: 'Mensuration', importance: 0.55, difficulty: 0.55, estMinutes: 90, revisionIntervalDays: 11, prereqs: ['mensuration_2d'], drillable: 'volume' }),
    t({ id: 'di_basics',              label: 'Data Interpretation',               section: 'Data Interpretation', importance: 0.75, difficulty: 0.55, estMinutes: 150, revisionIntervalDays: 10, prereqs: ['percentages', 'averages', 'ratio_proportion'], signals: [{ cat: 'percentages', w: 0.4 }, { cat: 'averages', w: 0.3 }, { cat: 'multiplication', w: 0.3 }] })
  ];

  function syllabus(id, name, examIds, topics) {
    return { id: id, name: name, version: SYLLABUS_VERSION, examIds: examIds, topics: topics };
  }

  var SYLLABI = {
    cat_quant:        syllabus('cat_quant', 'CAT / MBA Quantitative Aptitude', ['cat', 'xat', 'gmat', 'snap', 'nmat', 'cmat', 'mbacet', 'ipmat'], CAT_TOPICS),
    bank_ssc_quant:   syllabus('bank_ssc_quant', 'Banking & SSC Quantitative Aptitude', ['bankpo', 'ibpspo', 'ibpsclerk', 'sbipo', 'rrbntpc', 'ssccgl', 'sscchsl', 'sscmts'], BANK_SSC_TOPICS),
    defense_quant:    syllabus('defense_quant', 'Defense Mathematics', ['nda', 'cds', 'afcat'], DEFENSE_TOPICS),
    foundation_quant: syllabus('foundation_quant', 'Foundation Quantitative Aptitude', ['cuet', 'clat', 'ntse', 'jee', 'olympiad', 'foundation'], FOUNDATION_TOPICS),
    generic_quant:    syllabus('generic_quant', 'General Quantitative Aptitude', ['other'], GENERIC_TOPICS)
  };

  /* ════════════════════════ LOOKUP HELPERS ════════════════════════ */
  var _examById = {};
  EXAMS.forEach(function (e) { _examById[e.id] = e; });

  function getExam(examId) { return _examById[examId] || null; }

  /** Resolve the syllabus for an exam id, falling back to generic_quant for unknown / 'other'. */
  function resolveSyllabus(examId) {
    var ex = getExam(examId);
    var key = (ex && ex.syllabus) || 'generic_quant';
    return SYLLABI[key] || SYLLABI.generic_quant;
  }

  function getSyllabus(syllabusId) { return SYLLABI[syllabusId] || null; }

  /** Find a topic within a syllabus by id (used by the engine for prereq/signal lookups). */
  function getTopic(syllabusId, topicId) {
    var s = getSyllabus(syllabusId);
    if (!s) return null;
    for (var i = 0; i < s.topics.length; i++) { if (s.topics[i].id === topicId) return s.topics[i]; }
    return null;
  }

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
    SYLLABI: SYLLABI,
    getExam: getExam,
    resolveSyllabus: resolveSyllabus,
    getSyllabus: getSyllabus,
    getTopic: getTopic,
    searchExams: searchExams
  };

  // Dual-mode export (same pattern as questions.js): <script> on the client exposes window.QR_SYLLABUS;
  // Node require()'d on the server gets the same object.
  root.QR_SYLLABUS = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
