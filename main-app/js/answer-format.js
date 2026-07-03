/**
 * answer-format.js — the SINGLE source of truth for how a drill answer is typed, validated and normalised (ADR-086).
 *
 * The drill keyboard, the answer grader (drill-engine `checkAnswer`), and the coverage checks all consume this ONE
 * resolver, so the relationship between generators ⇄ accepted input ⇄ keyboard is enforced by CODE, not convention.
 *
 * `answerFormat(q)` → descriptor for a question object `{ category, subtype:'diff:key', options? , answerFormat? }`:
 *   { kind:'numeric'|'mcq',
 *     keys: [ '0'..'9', and only the symbol subset of ':','-','.','/' this question's answer can contain ],
 *     normalize(raw)            — canonical form used for grading (strips whitespace; matches the legacy grader),
 *     validateKeystroke(cur,ch) — true iff appending `ch` to the current buffer keeps a well-formed answer }
 *
 * Design rules (per product direction):
 *   • Expose ONLY the characters a question's answer can actually contain — never decorative/operator keys.
 *   • Visually stable: keys are a pure function of (category, subtype) — never of the specific answer value — so the
 *     keypad never reshuffles between two questions of the same type.
 *   • Future-proof: a generator may set an explicit `q.answerFormat` (e.g. 'ratio','fraction','decimal','negint',
 *     'integer'); otherwise it is inferred. New formats are added HERE (+ the keyboard-coverage check), never by
 *     touching the keyboard layout.
 *
 * PURE — no DOM, no generator dependency. Dual-exported: browser global `QRAnswerFormat`, Node `module.exports`.
 */
(function (root) {
  'use strict';

  var DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  /* Categories whose numeric answers can be non-integer (decimal point). Kept at CATEGORY granularity on purpose:
     within e.g. `area`, a square is integer but a circle is decimal — showing '.' consistently avoids a layout shift
     between two questions of the same family (the "visually stable" rule). */
  var DECIMAL_CATS = {
    area: 1, volume: 1, 'surface-area': 1, probability: 1, trigonometry: 1,
    'di-bar': 1, 'di-line': 1, 'di-pie': 1, 'di-table': 1, 'di-caselet': 1
  };

  /* (category · subtype-key) → the single distinctive symbol its answer needs. Subtype granularity is used where a
     category is genuinely mixed (a ratio answer needs ':', a division answer in the same category does not). */
  var SUBTYPE_SYMBOL = {
    'ratios:pctRatio': ':', 'ratios:combine': ':',
    'mixtures:alligationRatio': ':',
    'partnership:shareRatio': ':',
    'fractions:pctToFrac': '/',
    'fractions:addFrac': '/',                   /* ADR-093: lowest-terms fraction answer like "7/12" */
    'fractions:fracToPct': '.',                 /* percent-value string like "62.5" */
    'coordinate-geometry-basics:slope': '-'     /* slope may be negative */
  };

  /* Explicit format name (from an optional q.answerFormat) → symbol set. The forward-compatible extension point. */
  var FORMAT_SYMBOLS = {
    integer: '', decimal: '.', negint: '-', negdecimal: '-.', ratio: ':', fraction: '/', percentValue: '.'
  };

  function _subKey(q) {
    var st = q && q.subtype ? String(q.subtype) : '';
    var i = st.indexOf(':');
    return i === -1 ? st : st.slice(i + 1);
  }

  /* The symbol characters (beyond digits) a question's typed answer may contain — a pure function of its type. */
  function _symbols(q) {
    if (q && q.answerFormat && Object.prototype.hasOwnProperty.call(FORMAT_SYMBOLS, q.answerFormat)) {
      return FORMAT_SYMBOLS[q.answerFormat];
    }
    var cat = q && q.category ? String(q.category) : '';
    var key = _subKey(q);
    var bySub = SUBTYPE_SYMBOL[cat + ':' + key];
    if (bySub !== undefined) return bySub;
    if (DECIMAL_CATS[cat]) return '.';
    return '';
  }

  function _isDigit(ch) { return ch >= '0' && ch <= '9'; }

  /* Reject key sequences that can't form a valid answer: a 2nd '.', a non-leading '-', a leading/duplicated ':' or
     '/', or a separator following another separator. `cur` is the current buffer, `ch` the candidate key. */
  function validateKeystroke(cur, ch) {
    cur = cur == null ? '' : String(cur);
    if (ch === undefined || ch === null || ch === '') return false;
    if (_isDigit(ch)) return true;
    var last = cur.slice(-1);
    if (ch === '-') return cur.length === 0;                 /* leading minus only, once */
    if (ch === '.') return cur.indexOf('.') === -1 && last !== ':' && last !== '/' && last !== '-';
    if (ch === ':') return cur.length > 0 && cur.indexOf(':') === -1 && _isDigit(last);
    if (ch === '/') return cur.length > 0 && cur.indexOf('/') === -1 && _isDigit(last);
    return false;                                            /* any other char is never a valid answer character */
  }

  /* Canonical grading form — strip all whitespace (identical to the legacy grader so behaviour is unchanged). */
  function normalize(raw) { return (raw == null ? '' : String(raw)).replace(/\s+/g, ''); }

  function answerFormat(q) {
    var isMcq = !!(q && q.options && q.options.length);
    if (isMcq) {
      return { kind: 'mcq', keys: [], normalize: normalize, validateKeystroke: function () { return false; } };
    }
    var syms = _symbols(q);
    var keys = DIGITS.slice();
    for (var i = 0; i < syms.length; i++) keys.push(syms.charAt(i));
    return { kind: 'numeric', keys: keys, symbols: syms, normalize: normalize, validateKeystroke: validateKeystroke };
  }

  var API = {
    answerFormat: answerFormat,
    normalize: normalize,
    validateKeystroke: validateKeystroke,
    DECIMAL_CATS: DECIMAL_CATS,
    SUBTYPE_SYMBOL: SUBTYPE_SYMBOL,
    FORMAT_SYMBOLS: FORMAT_SYMBOLS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRAnswerFormat = API;
  if (typeof root !== 'undefined' && root) root.QRAnswerFormat = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
