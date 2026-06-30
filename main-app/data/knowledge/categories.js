/**
 * data/knowledge/categories.js — canonical Learn category metadata (ADR-069).
 *
 * Registered FIRST (before topic modules) so every topic resolves to a known category. Categories are the top tier
 * of the Learn knowledge graph (hub groupings). Add a category here, then point topics at it — additive, no rewrite.
 * Loads in the browser (self-registers) and under node (the check harness requires it).
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../../js/knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);
  if (!KB) return;

  /* Every category declares its Speed-Aptitude `subject` (ADR-073). Today all Learn content is Quant; Data
     Interpretation and generatable Logical Reasoning register their own categories (subject:'di'/'lr') in V2.0/V2.5.
     Subject is the derived lens above category — the hub groups by it once a second subject has content. */
  var CATEGORIES = [
    { id: 'numbers', title: 'Numbers', icon: '🔟', order: 10, subject: 'quant', blurb: 'The number system, divisibility and fast simplification — the bedrock of every other topic.' },
    { id: 'arithmetic', title: 'Arithmetic', icon: '➗', order: 20, subject: 'quant', blurb: 'The everyday number skills exams test most — percentages, ratio, averages, time, work and motion.' },
    { id: 'commercial-math', title: 'Commercial Math', icon: '🏷️', order: 30, subject: 'quant', blurb: 'Money maths: profit & loss, discounts, and simple & compound interest.' },
    { id: 'modern-math', title: 'Modern Math', icon: '🃏', order: 40, subject: 'quant', blurb: 'Counting and chance — probability and combinatorics.' },
    { id: 'mensuration', title: 'Mensuration', icon: '📏', order: 50, subject: 'quant', blurb: 'Area and volume of the standard 2D and 3D shapes.' }
  ];

  CATEGORIES.forEach(function (c) { KB.registerCategory(c); });

  if (typeof module !== 'undefined' && module.exports) module.exports = CATEGORIES;
})(this);
