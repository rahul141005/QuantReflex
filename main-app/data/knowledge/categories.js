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

  var CATEGORIES = [
    { id: 'arithmetic', title: 'Arithmetic', icon: '🧮', order: 10, blurb: 'The everyday number skills exams test most — percentages, profit, ratio, time.' },
    { id: 'mensuration', title: 'Mensuration', icon: '📐', order: 20, blurb: 'Area and volume of the standard 2D and 3D shapes.' }
  ];

  CATEGORIES.forEach(function (c) { KB.registerCategory(c); });

  if (typeof module !== 'undefined' && module.exports) module.exports = CATEGORIES;
})(this);
