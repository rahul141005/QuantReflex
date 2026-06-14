/**
 * quantTopics.js — the SINGLE source of truth for QuantReflex's quantitative micro-topics (ADR-045).
 *
 * Pure module: NO firebase-admin, NO side effects, NO I/O → safe to require from unit tests and from
 * both the analysis engine (studentContext.js) and the planner logic (planLogic.js). Before this module
 * the category map lived only inside studentContext.js; the Study Planner had no way to map an LLM's
 * free-text topic ("Time & Speed", "P&L", "calculation speed") back to a real, drillable category — so
 * the plan's stated weekly focus could diverge from the drill it launched. nearestCategory() closes that
 * gap deterministically and keeps the topic vocabulary defined in exactly one place.
 */

/* The 12 canonical drillable categories. Key = drill-engine category; value = human label. */
var CATEGORY_LABELS = {
  squares: 'Squares & Roots', cubes: 'Cubes & Roots', area: 'Area', volume: 'Volume',
  percentages: 'Percentages', multiplication: 'Multiplication', fractions: 'Fractions',
  averages: 'Averages', ratios: 'Ratios', 'profit-loss': 'Profit & Loss',
  'time-speed-distance': 'Time, Speed & Distance', 'time-and-work': 'Time & Work'
};

function label(cat) { return CATEGORY_LABELS[cat] || cat; }

/* Keyword/synonym lexicon per category. Multi-word phrases score higher (more specific). Kept terse but
   covers the phrasings the model actually emits for CAT/GMAT/Bank/SSC-style quant. */
var KEYWORDS = {
  squares: ['square', 'squares', 'square root', 'square roots', 'perfect square', 'surds'],
  cubes: ['cube', 'cubes', 'cube root', 'cube roots'],
  area: ['area', 'areas', 'mensuration', 'triangle', 'rectangle', 'circle', 'perimeter'],
  volume: ['volume', 'volumes', 'cuboid', 'sphere', 'cylinder', 'cone', 'solid'],
  percentages: ['percentage', 'percentages', 'percent', 'percents'],
  multiplication: ['multiplication', 'multiply', 'multiplications', 'tables', 'calculation', 'calculations', 'computation'],
  fractions: ['fraction', 'fractions', 'decimal', 'decimals', 'simplification', 'bodmas'],
  averages: ['average', 'averages', 'mean', 'means'],
  ratios: ['ratio', 'ratios', 'proportion', 'proportions', 'mixture', 'alligation'],
  'profit-loss': ['profit', 'loss', 'profit and loss', 'profit & loss', 'p&l', 'discount', 'cost price', 'selling price', 'marked price'],
  'time-speed-distance': ['speed', 'distance', 'time speed distance', 'time and distance', 'tsd', 'train', 'trains', 'boat', 'boats', 'stream', 'streams', 'velocity'],
  'time-and-work': ['work', 'time and work', 'time & work', 'pipe', 'pipes', 'cistern', 'cisterns', 'efficiency', 'wages']
};

/* Normalize free text: lowercase, expand '&' → ' and ', strip punctuation to spaces, collapse runs. */
function _norm(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Map an arbitrary free-text topic to a canonical category key, or null when there's no confident match.
 * Deterministic: phrase (multi-word) matches outweigh single-token matches, and the longest match wins ties.
 * @param {string} freeText  e.g. "Time & Speed", "P&L tricks", "calculation speed"
 * @returns {string|null}    canonical category key (e.g. 'time-speed-distance') or null
 */
function nearestCategory(freeText) {
  var n = _norm(freeText);
  if (!n) return null;
  // exact key / exact label fast-path
  if (CATEGORY_LABELS[n]) return n;
  var tokens = ' ' + n + ' ';
  var best = null, bestScore = 0, bestLen = 0;
  Object.keys(KEYWORDS).forEach(function (cat) {
    var score = 0, longest = 0;
    KEYWORDS[cat].forEach(function (kw) {
      var k = _norm(kw);
      if (!k) return;
      var multi = k.indexOf(' ') >= 0;
      var hit = multi ? (tokens.indexOf(' ' + k + ' ') >= 0 || n.indexOf(k) >= 0)
                      : (tokens.indexOf(' ' + k + ' ') >= 0);
      if (hit) {
        var words = k.split(' ').length;
        score += multi ? words * 2 : 1;
        if (k.length > longest) longest = k.length;
      }
    });
    if (score > bestScore || (score === bestScore && score > 0 && longest > bestLen)) {
      best = cat; bestScore = score; bestLen = longest;
    }
  });
  return bestScore > 0 ? best : null;
}

module.exports = { CATEGORY_LABELS: CATEGORY_LABELS, label: label, nearestCategory: nearestCategory };
