/**
 * duel-questions.js — server-side math question generator for Duel V2 (ADR-031).
 *
 * The SERVER generates duel questions (text + answer) once, at `start`. The CLIENT never runs this
 * generator and never receives the answers — it reads only the `prompts` (text) from the room doc, while the
 * full {text, answer} key lives in the server-only `duels/{code}/private/key` subdoc. So there is no
 * shared-seed / client-regeneration concern (red-team M1): `Math.random()` server-side is fine here.
 *
 * Returns an array of { index, text, category, answer } (answer is a number).
 */
'use strict';

function _rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function _pick(arr) { return arr[_rand(0, arr.length - 1)]; }

/* Operand ranges per difficulty. */
var RANGES = {
  easy:   { add: [2, 20],   sub: [2, 20],   mul: [2, 9],   div: [2, 9],  sq: [2, 12], pct: [2, 10] },
  medium: { add: [10, 99],  sub: [10, 99],  mul: [3, 15],  div: [2, 12], sq: [6, 25], pct: [2, 16] },
  hard:   { add: [50, 500], sub: [50, 500], mul: [12, 40], div: [6, 20], sq: [11, 40], pct: [2, 20] }
};

/* Normalize a user-facing topic key to a generator category. Unknown → 'mixed'. */
function _normCategory(topic) {
  var t = String(topic || '').toLowerCase();
  if (t.indexOf('add') === 0 || t === 'sum') return 'addition';
  if (t.indexOf('sub') === 0 || t === 'minus') return 'subtraction';
  if (t.indexOf('mul') === 0 || t === 'times' || t === 'multiply') return 'multiplication';
  if (t.indexOf('div') === 0) return 'division';
  if (t.indexOf('squar') === 0 || t === 'square') return 'squares';
  if (t.indexOf('percent') === 0 || t === 'pct' || t === '%') return 'percentages';
  if (['addition', 'subtraction', 'multiplication', 'division', 'squares', 'percentages'].indexOf(t) >= 0) return t;
  return 'mixed';
}

var ALL_CATS = ['addition', 'subtraction', 'multiplication', 'division', 'squares', 'percentages'];

function _genOne(category, difficulty) {
  var r = RANGES[difficulty] || RANGES.medium;
  var a, b, q;
  switch (category) {
    case 'addition':
      a = _rand(r.add[0], r.add[1]); b = _rand(r.add[0], r.add[1]);
      return { text: a + ' + ' + b, answer: a + b, category: 'addition' };
    case 'subtraction':
      a = _rand(r.sub[0], r.sub[1]); b = _rand(r.sub[0], r.sub[1]);
      if (b > a) { var t = a; a = b; b = t; }            /* keep the answer non-negative */
      return { text: a + ' − ' + b, answer: a - b, category: 'subtraction' };
    case 'multiplication':
      a = _rand(r.mul[0], r.mul[1]); b = _rand(r.mul[0], r.mul[1]);
      return { text: a + ' × ' + b, answer: a * b, category: 'multiplication' };
    case 'division':
      b = _rand(r.div[0], r.div[1]); q = _rand(r.div[0], r.div[1]);
      return { text: (b * q) + ' ÷ ' + b, answer: q, category: 'division' };   /* clean integer quotient */
    case 'squares':
      a = _rand(r.sq[0], r.sq[1]);
      return { text: a + '²', answer: a * a, category: 'squares' };
    case 'percentages': {
      var p = _pick([10, 20, 25, 50]);
      var base = _rand(r.pct[0], r.pct[1]) * 20;          /* multiple of 20 → 10/20/25/50% is always integer */
      return { text: p + '% of ' + base, answer: Math.round(base * p / 100), category: 'percentages' };
    }
    default:
      return _genOne(_pick(ALL_CATS), difficulty);
  }
}

/**
 * Generate the quick-mode question set for a duel config.
 * @param {object} config - { topics?: string[], difficulty?: 'easy'|'medium'|'hard', questionCount?: number }
 * @returns {Array<{index:number,text:string,category:string,answer:number}>}
 */
function generateQuickQuestions(config) {
  config = config || {};
  var n = Math.max(1, Math.min(30, parseInt(config.questionCount, 10) || 10));
  var diff = (['easy', 'medium', 'hard'].indexOf(config.difficulty) >= 0) ? config.difficulty : 'medium';
  var topics = (Array.isArray(config.topics) && config.topics.length)
    ? config.topics.map(_normCategory).filter(function (c) { return c !== 'mixed'; })
    : null;
  if (topics && topics.length === 0) topics = null;       /* all-unknown topics → mixed */

  var out = [];
  for (var i = 0; i < n; i++) {
    var cat = topics ? _pick(topics) : _pick(ALL_CATS);
    var qq = _genOne(cat, diff);
    out.push({ index: i, text: qq.text, category: qq.category, answer: qq.answer });
  }
  return out;
}

module.exports = { generateQuickQuestions: generateQuickQuestions };
