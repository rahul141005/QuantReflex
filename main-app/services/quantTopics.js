/**
 * quantTopics.js — the SINGLE source of truth for QuantReflex's 12 quantitative micro-topics (ADR-045/047).
 *
 * Pure module: NO firebase-admin, NO side effects, NO I/O → safe to require from unit tests and from the
 * analysis engine (studentContext.js). Keeps the drillable category vocabulary defined in exactly one place.
 * (The free-text `nearestCategory` mapper was removed with the legacy Mission in ADR-047 — the QuanAI Planner
 * uses structured topic ids from data/syllabus.js, so no free-text→category guessing is needed.)
 */

/* The 12 canonical drillable categories. Key = drill-engine category; value = human label. */
var CATEGORY_LABELS = {
  squares: 'Squares & Roots', cubes: 'Cubes & Roots', area: 'Area', volume: 'Volume',
  percentages: 'Percentages', multiplication: 'Multiplication', fractions: 'Fractions',
  averages: 'Averages', ratios: 'Ratios', 'profit-loss': 'Profit & Loss',
  'time-speed-distance': 'Time, Speed & Distance', 'time-and-work': 'Time & Work',
  simplification: 'Simplification', 'number-series': 'Number Series'
};

function label(cat) { return CATEGORY_LABELS[cat] || cat; }

module.exports = { CATEGORY_LABELS: CATEGORY_LABELS, label: label };
