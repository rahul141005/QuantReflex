/**
 * knowledge/schema.js — the canonical shape of a QuantReflex "knowledge object" (ADR-069, Learn Knowledge Engine).
 *
 * PURE module (no DOM, no I/O) — dual-exported so the browser engine AND `scripts/learn-content.check.js` validate
 * topics against ONE schema and can never drift. A knowledge object is the single reusable unit of learning content:
 * Learn renders it, Search indexes it, Revision/cheat-sheets project it, Practice/Planner link to it. (No AI — the
 * Learn tab deliberately ships zero AI surfaces; the schema stays generic so future non-AI reuse is additive.)
 *
 * A topic's `sections` are an ordered list of typed BLOCKS. Adding a new content kind = a new block `type` + a
 * renderer in blocks.js — never a schema rewrite. This is what makes the engine last.
 */
(function (root) {
  'use strict';

  /* Allowed enums — kept tiny and stable. */
  var DIFFICULTIES = ['foundation', 'core', 'advanced'];
  var FREQUENCIES = ['very-high', 'high', 'medium', 'low'];
  var STATUSES = ['published', 'scaffold'];   // gold-standard vs coming-soon (never filler)

  /* Block types the engine understands. Each maps 1:1 to a renderer in blocks.js. */
  var BLOCK_TYPES = [
    'overview',   // { text }                              — what this is, in one breath
    'concept',    // { title, body }                       — a core idea / definition / intuition
    'formula',    // { items:[{ name, expr, when?, whenNot?, trap? }] }
    'trick',      // { title?, items:[string|{text}] }     — speed / mental-math / shortcut
    'trap',       // { items:[string|{text}] }             — common mistakes & confusions
    'exam',       // { title?, items:[string|{text}] }     — exam strategy / how toppers approach it (ADR-081)
    'example',    // { problem, steps:[string], answer }   — fully solved
    'table',      // { caption?, headers:[string], rows:[[string]] }  — renders into the loved .math-table
    'memory',     // { text }                              — mnemonic / memory hook
    'revision',   // { points:[string] }                   — one-line takeaways (feeds cheat-sheet projection)
    'related'     // { ids:[topicId] }                     — knowledge-graph edges (also derivable from topic.related)
  ];

  /* Which block types feed the derived "cheat sheet / one-page revision" projection (no content duplication). */
  var REVISION_BLOCK_TYPES = ['formula', 'trick', 'trap', 'revision'];

  function _isStr(v) { return typeof v === 'string' && v.length > 0; }
  function _isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  /** Validate ONE block. Returns an array of error strings (empty = valid). `where` is a label for messages. */
  function validateBlock(block, where) {
    var errs = [];
    if (!block || typeof block !== 'object') { errs.push(where + ': block must be an object'); return errs; }
    if (BLOCK_TYPES.indexOf(block.type) === -1) { errs.push(where + ': unknown block type "' + block.type + '"'); return errs; }
    switch (block.type) {
      case 'overview':
      case 'memory':
        if (!_isStr(block.text)) errs.push(where + ' (' + block.type + '): "text" required');
        break;
      case 'concept':
        if (!_isStr(block.title)) errs.push(where + ' (concept): "title" required');
        if (!_isStr(block.body)) errs.push(where + ' (concept): "body" required');
        break;
      case 'formula':
        if (!_isArr(block.items) || !block.items.length) errs.push(where + ' (formula): non-empty "items" required');
        else block.items.forEach(function (it, i) {
          if (!_isStr(it.name)) errs.push(where + ' (formula.items[' + i + ']): "name" required');
          if (!_isStr(it.expr)) errs.push(where + ' (formula.items[' + i + ']): "expr" required');
        });
        break;
      case 'trick':
      case 'trap':
      case 'exam':
        if (!_isArr(block.items) || !block.items.length) errs.push(where + ' (' + block.type + '): non-empty "items" required');
        break;
      case 'example':
        if (!_isStr(block.problem)) errs.push(where + ' (example): "problem" required');
        if (!_isArr(block.steps) || !block.steps.length) errs.push(where + ' (example): non-empty "steps" required');
        if (!_isStr(block.answer)) errs.push(where + ' (example): "answer" required');
        break;
      case 'table':
        if (!_isArr(block.headers) || !block.headers.length) errs.push(where + ' (table): "headers" required');
        if (!_isArr(block.rows) || !block.rows.length) errs.push(where + ' (table): non-empty "rows" required');
        else block.rows.forEach(function (r, i) { if (!_isArr(r)) errs.push(where + ' (table.rows[' + i + ']): row must be an array'); });
        break;
      case 'revision':
        if (!_isArr(block.points) || !block.points.length) errs.push(where + ' (revision): non-empty "points" required');
        break;
      case 'related':
        if (!_isArr(block.ids) || !block.ids.length) errs.push(where + ' (related): non-empty "ids" required');
        break;
    }
    return errs;
  }

  /**
   * Validate ONE topic's structural shape (does NOT resolve cross-topic `related` ids — the registry does that,
   * since it needs the full set). Returns an array of error strings (empty = valid).
   * A `scaffold` topic may have an empty `sections` (it's an honest "coming soon", not filler); a `published`
   * topic must have at least one section.
   */
  function validateTopic(topic) {
    var errs = [];
    if (!topic || typeof topic !== 'object') return ['topic must be an object'];
    var id = topic.id || '(no id)';
    if (!_isStr(topic.id)) errs.push(id + ': "id" (slug) required');
    else if (!/^[a-z0-9-]+$/.test(topic.id)) errs.push(id + ': "id" must be a url-safe slug [a-z0-9-]');
    if (!_isStr(topic.title)) errs.push(id + ': "title" required');
    if (!_isStr(topic.category)) errs.push(id + ': "category" required');
    if (DIFFICULTIES.indexOf(topic.difficulty) === -1) errs.push(id + ': "difficulty" must be one of ' + DIFFICULTIES.join('|'));
    if (FREQUENCIES.indexOf(topic.examFrequency) === -1) errs.push(id + ': "examFrequency" must be one of ' + FREQUENCIES.join('|'));
    if (STATUSES.indexOf(topic.status) === -1) errs.push(id + ': "status" must be one of ' + STATUSES.join('|'));
    if (topic.related != null && !_isArr(topic.related)) errs.push(id + ': "related" must be an array if present');
    if (topic.searchTerms != null && !_isArr(topic.searchTerms)) errs.push(id + ': "searchTerms" must be an array if present');
    if (topic.sections != null && !_isArr(topic.sections)) errs.push(id + ': "sections" must be an array if present');
    var sections = topic.sections || [];
    if (topic.status === 'published' && !sections.length) errs.push(id + ': a "published" topic needs at least one section');
    sections.forEach(function (b, i) { errs = errs.concat(validateBlock(b, id + '.sections[' + i + ']')); });
    return errs;
  }

  var Schema = {
    DIFFICULTIES: DIFFICULTIES,
    FREQUENCIES: FREQUENCIES,
    STATUSES: STATUSES,
    BLOCK_TYPES: BLOCK_TYPES,
    REVISION_BLOCK_TYPES: REVISION_BLOCK_TYPES,
    validateBlock: validateBlock,
    validateTopic: validateTopic
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Schema;   // node (check harness)
  if (typeof window !== 'undefined') window.KnowledgeSchema = Schema;             // browser
  else root.KnowledgeSchema = Schema;
})(this);
