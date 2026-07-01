/**
 * quantTopics.js — the SINGLE source of truth for QuantReflex's 14 drillable quantitative categories (ADR-045/047;
 *   simplification + number-series added in ADR-067).
 *
 * Pure module: NO firebase-admin, NO side effects, NO I/O → safe to require from unit tests and from the
 * analysis engine (studentProfile.js). Keeps the drillable category vocabulary defined in exactly one place.
 * (The free-text `nearestCategory` mapper was removed with the legacy Mission in ADR-047 — the QuanAI Planner
 * uses structured topic ids from data/syllabus.js, so no free-text→category guessing is needed.)
 *
 * Dual-exported (ADR-073): `require()` on the server, `window.QuantTopics` in the browser — so the derived
 * subject layer (data/subjects.js) can resolve Quant's category set from this one source in BOTH runtimes
 * instead of re-typing the list.
 */
(function (root) {
  'use strict';

  /* The canonical drillable Quant categories. Key = drill-engine category; value = human label. (ADR-083 expands this.) */
  var CATEGORY_LABELS = {
    squares: 'Squares & Roots', cubes: 'Cubes & Roots', area: 'Area', volume: 'Volume',
    percentages: 'Percentages', multiplication: 'Multiplication', fractions: 'Fractions',
    averages: 'Averages', ratios: 'Ratios', 'profit-loss': 'Profit & Loss',
    'time-speed-distance': 'Time, Speed & Distance', 'time-and-work': 'Time & Work',
    simplification: 'Simplification', 'number-series': 'Number Series',
    'simple-interest': 'Simple Interest', 'compound-interest': 'Compound Interest', partnership: 'Partnership',
    ages: 'Problems on Ages', mixtures: 'Mixtures & Alligations', 'pipes-cisterns': 'Pipes & Cisterns',
    'number-properties': 'Number Properties',
    'linear-equations': 'Linear Equations', 'quadratic-equations': 'Quadratic Equations',
    'surds-indices': 'Surds & Indices', logarithms: 'Logarithms', progressions: 'Progressions (AP & GP)',
    'inequalities-modulus': 'Inequalities & Modulus',
    'geometry-basics': 'Geometry Basics', 'coordinate-geometry-basics': 'Coordinate Geometry',
    trigonometry: 'Trigonometry', 'surface-area': 'Surface Area'
  };

  function label(cat) { return CATEGORY_LABELS[cat] || cat; }

  var QuantTopics = { CATEGORY_LABELS: CATEGORY_LABELS, label: label };

  if (typeof module !== 'undefined' && module.exports) module.exports = QuantTopics;
  if (typeof window !== 'undefined') window.QuantTopics = QuantTopics;
  else root.QuantTopics = QuantTopics;
})(this);
