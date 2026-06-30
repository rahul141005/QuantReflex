/**
 * data/lr-authored/schema.js — the schema + validator for the AUTHORED Logical Reasoning content subsystem (ADR-079).
 *
 * Some LR topics (Critical Reasoning, Statement–Assumption/Conclusion/Argument, Cause & Effect, Course of Action,
 * Decision Making) cannot be procedurally generated at exam quality — they need human-authored natural-language items.
 * This module defines ONE item shape and a pure `validateItem()` used by BOTH the loader (js/lr-authored-engine.js)
 * and the test harness (scripts/lr-authored.check.js), so a malformed item can never reach a student. It carries rich
 * metadata (topic/subtype/difficulty/exam-map/explanation-versioning/tags/review-status) so the bank stays searchable
 * and can grow to thousands of items with NO code changes — drop a valid item into a family file and it is live.
 *
 *   item = { id, topic, subtype, difficulty, exams:[], stem, options:[], answer, explanation, explanationVersion,
 *            tags:[], reviewStatus, meta:{} }
 *
 * PURE data + a pure validator → dual-exported (window.LRAuthoredSchema / module.exports).
 */
(function (root) {
  'use strict';

  /* the five authored categories (mirrored in the engine's CATEGORY_LABELS) */
  var CATEGORIES = {
    'lr-critical': { label: 'Critical Reasoning', subtypes: ['assumption', 'strengthen', 'weaken', 'inference', 'conclusion', 'flaw', 'paradox'] },
    'lr-statement': { label: 'Statement & Argument', subtypes: ['assumption', 'conclusion', 'argument', 'inference'] },
    'lr-cause': { label: 'Cause & Effect', subtypes: ['cause-effect'] },
    'lr-course': { label: 'Course of Action', subtypes: ['course-of-action'] },
    'lr-decision': { label: 'Decision Making', subtypes: ['ethical', 'managerial', 'data-adequacy', 'priority'] }
  };

  var KNOWN_EXAMS = ['CAT', 'XAT', 'SNAP', 'NMAT', 'CMAT', 'MAH CET', 'IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk', 'RBI', 'NABARD', 'LIC', 'SSC CGL', 'SSC CHSL', 'SSC CPO', 'RRB'];
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var REVIEW = ['approved', 'draft'];
  var PLACEHOLDERS = /\b(todo|fixme|lorem|ipsum|xxx|placeholder|tbd)\b/i;

  function _isStr(x) { return typeof x === 'string' && x.length > 0; }
  function _isArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }

  /** Validate ONE item. Returns an array of error strings (empty ⇒ valid). Authored separately from the engine so a
      schema drift is caught in `npm test`. */
  function validateItem(it, seenIds) {
    var e = [];
    if (!it || typeof it !== 'object') { return ['item is not an object']; }
    var who = it.id || '(no id)';
    if (!_isStr(it.id) || !/^[a-z0-9-]+$/.test(it.id)) e.push(who + ': id must be a kebab string');
    if (seenIds) { if (seenIds[it.id]) e.push(who + ': duplicate id'); else if (it.id) seenIds[it.id] = 1; }
    if (!CATEGORIES[it.topic]) e.push(who + ': unknown topic "' + it.topic + '"');
    else if (!_isStr(it.subtype) || CATEGORIES[it.topic].subtypes.indexOf(it.subtype) === -1) e.push(who + ': subtype "' + it.subtype + '" not valid for ' + it.topic);
    if (DIFFICULTIES.indexOf(it.difficulty) === -1) e.push(who + ': difficulty must be easy|medium|hard');
    if (!_isArr(it.exams) || !it.exams.length) e.push(who + ': exams must be a non-empty array');
    else it.exams.forEach(function (x) { if (KNOWN_EXAMS.indexOf(x) === -1) e.push(who + ': unknown exam "' + x + '"'); });
    if (!_isStr(it.stem) || it.stem.length < 20 || it.stem.length > 1400) e.push(who + ': stem length must be 20–1400');
    if (it.stem && PLACEHOLDERS.test(it.stem)) e.push(who + ': stem contains placeholder text');
    if (!_isArr(it.options) || it.options.length < 3 || it.options.length > 5) e.push(who + ': options must be 3–5');
    else {
      var seen = {};
      it.options.forEach(function (o, i) {
        if (!_isStr(o) || o.length > 220) e.push(who + ': option ' + i + ' empty or too long');
        if (seen[o]) e.push(who + ': duplicate option "' + o + '"'); else seen[o] = 1;
        if (PLACEHOLDERS.test(o)) e.push(who + ': option ' + i + ' has placeholder text');
      });
      if (it.options.indexOf(it.answer) === -1) e.push(who + ': answer is not one of the options');
    }
    if (!_isStr(it.explanation) || it.explanation.length < 30 || it.explanation.length > 1600) e.push(who + ': explanation length must be 30–1600');
    if (it.explanation && PLACEHOLDERS.test(it.explanation)) e.push(who + ': explanation has placeholder text');
    if (typeof it.explanationVersion !== 'number' || it.explanationVersion < 1 || it.explanationVersion % 1 !== 0) e.push(who + ': explanationVersion must be a positive integer');
    if (!_isArr(it.tags)) e.push(who + ': tags must be an array');
    if (REVIEW.indexOf(it.reviewStatus) === -1) e.push(who + ': reviewStatus must be approved|draft');
    if (!it.meta || typeof it.meta !== 'object') e.push(who + ': meta must be an object');
    return e;
  }

  /** Validate a whole bank → { ok, errors:[], count }. */
  function validateBank(items) {
    var errs = [], seen = {};
    if (!_isArr(items)) return { ok: false, errors: ['bank is not an array'], count: 0 };
    items.forEach(function (it) { errs = errs.concat(validateItem(it, seen)); });
    return { ok: errs.length === 0, errors: errs, count: items.length };
  }

  var SCHEMA = { CATEGORIES: CATEGORIES, KNOWN_EXAMS: KNOWN_EXAMS, DIFFICULTIES: DIFFICULTIES, validateItem: validateItem, validateBank: validateBank };
  if (typeof module !== 'undefined' && module.exports) module.exports = SCHEMA;
  if (typeof window !== 'undefined') window.LRAuthoredSchema = SCHEMA;
  else root.LRAuthoredSchema = SCHEMA;
})(this);
