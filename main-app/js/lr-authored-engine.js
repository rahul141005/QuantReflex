/**
 * lr-authored-engine.js — the HYBRID authored-content engine for Logical Reasoning (ADR-079).
 *
 * Critical Reasoning, Statement-based reasoning, Cause & Effect, Course of Action and Decision Making cannot be
 * generated at exam quality, so they are served from human-authored banks (data/lr-authored/*). This engine is the
 * bridge that makes authored items behave EXACTLY like generated ones: it self-registers a generator per authored
 * category into questions.js's `categoryGenerators`, so Practice/dedup/difficulty/Focus/Custom/Stats/QuanAI all reuse
 * the same pipeline — a student never feels two engines. Each "generator" samples an unseen item (a per-category
 * recent-id ring prevents repetition), respects the current difficulty, and maps it to the drill schema, carrying its
 * teaching `explanation` (shown on reveal) and `_authoredId` (for bookmarking/review).
 *
 * Also exposes `find()` so Learn/search can query the bank by topic/subtype/exam/difficulty. The bank can grow to
 * thousands of items with NO code change. PURE + dual-exported.
 */
(function (root) {
  'use strict';

  var Schema = (typeof require === 'function') ? require('../data/lr-authored/schema')
    : (typeof window !== 'undefined' ? window.LRAuthoredSchema : root.LRAuthoredSchema);

  /* gather the family banks (node: require each; browser: the files populated window.LRAuthoredBanks) */
  var BANKS = {};
  if (typeof require === 'function') {
    ['critical', 'statement', 'cause', 'course', 'decision'].forEach(function (f) {
      try { BANKS[f] = require('../data/lr-authored/' + f); } catch (_) { BANKS[f] = []; }
    });
  } else {
    BANKS = (typeof window !== 'undefined' ? window.LRAuthoredBanks : root.LRAuthoredBanks) || {};
  }

  var CATEGORY_LABELS = {
    'lr-critical': 'Critical Reasoning', 'lr-statement': 'Statement & Argument',
    'lr-cause': 'Cause & Effect', 'lr-course': 'Course of Action', 'lr-decision': 'Decision Making'
  };

  /* flatten + keep only approved, schema-valid items (defence in depth; the harness is the real gate) */
  var ITEMS = [];
  Object.keys(BANKS).forEach(function (f) { (BANKS[f] || []).forEach(function (it) {
    if (it && it.reviewStatus === 'approved' && (!Schema || Schema.validateItem(it).length === 0)) ITEMS.push(it);
  }); });

  var BY_TOPIC = {};
  Object.keys(CATEGORY_LABELS).forEach(function (c) { BY_TOPIC[c] = []; });
  ITEMS.forEach(function (it) { if (BY_TOPIC[it.topic]) BY_TOPIC[it.topic].push(it); });

  function _shuffle(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
  function _difficulty(explicit) {
    if (explicit) return explicit;
    try { if (typeof _getDifficulty === 'function') return _getDifficulty(); } catch (_) {}
    try { if (typeof window !== 'undefined' && typeof window._getDifficulty === 'function') return window._getDifficulty(); } catch (_) {}
    return 'medium';
  }

  /* per-category ring of recently served ids → no repetition within a session run */
  var _recent = {};
  function _ringPick(topic, pool) {
    var ring = _recent[topic] || (_recent[topic] = []);
    var last = ring.length ? ring[ring.length - 1] : null;
    var fresh = pool.filter(function (it) { return ring.indexOf(it.id) === -1; });
    /* on a pool smaller than the ring, fresh can empty; fall back to the full pool but, when more than one item
       exists, never re-serve the immediately-previous one — a back-to-back repeat is the one thing a user always
       notices, even on a small bank. */
    var candidates = fresh.length ? fresh : (pool.length > 1 ? pool.filter(function (it) { return it.id !== last; }) : pool);
    var item = _shuffle(candidates)[0];
    if (item) { ring.push(item.id); if (ring.length > Math.max(6, Math.floor(pool.length * 0.6))) ring.shift(); }
    return item;
  }

  function _toQuestion(it) {
    return {
      question: it.stem, options: _shuffle(it.options.slice()), answer: it.answer,
      category: it.topic, subtype: it.difficulty + ':' + it.subtype,
      explanation: it.explanation, _authoredId: it.id
    };
  }

  function generate(category, difficulty) {
    var pool = BY_TOPIC[category] || [];
    if (!pool.length) return { question: '(no authored items available)', options: ['OK'], answer: 'OK', category: category, subtype: 'medium:none' };
    var diff = _difficulty(difficulty);
    var sub = pool.filter(function (it) { return it.difficulty === diff; });
    return _toQuestion(_ringPick(category, sub.length ? sub : pool));
  }

  /* searchable surface for Learn / search (returns matching items, not drill questions) */
  function find(q) {
    q = q || {};
    return ITEMS.filter(function (it) {
      if (q.topic && it.topic !== q.topic) return false;
      if (q.subtype && it.subtype !== q.subtype) return false;
      if (q.difficulty && it.difficulty !== q.difficulty) return false;
      if (q.exam && it.exams.indexOf(q.exam) === -1) return false;
      return true;
    });
  }

  var generators = {};
  Object.keys(CATEGORY_LABELS).forEach(function (cat) { generators[cat] = function () { return generate(cat); }; });
  function registerInto(map) { if (!map) return; Object.keys(generators).forEach(function (k) { map[k] = generators[k]; }); }
  try { if (typeof categoryGenerators !== 'undefined' && categoryGenerators) registerInto(categoryGenerators); } catch (_) {}

  var LRAuthoredEngine = {
    CATEGORY_LABELS: CATEGORY_LABELS,
    categories: function () { return Object.keys(CATEGORY_LABELS); },
    label: function (c) { return CATEGORY_LABELS[c] || c; },
    generate: generate, generators: generators, registerInto: registerInto,
    find: find, count: function () { return ITEMS.length; }, all: function () { return ITEMS.slice(); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LRAuthoredEngine;
  if (typeof window !== 'undefined') window.LRAuthoredEngine = LRAuthoredEngine;
  else root.LRAuthoredEngine = LRAuthoredEngine;
})(this);
