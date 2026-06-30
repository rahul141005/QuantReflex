/**
 * knowledge/registry.js — the in-memory KnowledgeBase (ADR-069, Learn Knowledge Engine).
 *
 * The single source of truth that holds every registered category + topic and answers the questions every consumer
 * (Learn hub, topic pages, Search, Revision, Practice/Planner links) asks: get(id), all(), categories(),
 * byCategory(cat), related(id). PURE data + lookups (no DOM) → dual-exported so the node check can load the real
 * data modules and validate the whole graph.
 *
 * Data modules (data/knowledge/<category>.js) self-register here at load time; script order guarantees this file
 * loads first. Registration is idempotent (re-register by id overwrites) so a hot data edit can't duplicate a topic.
 */
(function (root) {
  'use strict';

  var Schema = (typeof require !== 'undefined') ? require('./schema')
    : (typeof window !== 'undefined' ? window.KnowledgeSchema : root.KnowledgeSchema);

  var _topics = {};      // id -> topic
  var _order = [];       // topic ids in registration order
  var _cats = {};        // id -> category meta
  var _catOrder = [];    // category ids in registration order
  var _dupes = [];       // ids registered more than once (a content bug to surface, not silently overwrite)

  function registerCategory(meta) {
    if (!meta || !meta.id) return;
    if (!_cats[meta.id]) _catOrder.push(meta.id);
    _cats[meta.id] = {
      id: meta.id, title: meta.title || meta.id, icon: meta.icon || '📘',
      order: typeof meta.order === 'number' ? meta.order : 999, blurb: meta.blurb || '',
      subject: meta.subject || null   // ADR-073: the Speed-Aptitude subject this category rolls up into (derived lens)
    };
  }

  function _registerOne(categoryId, topic) {
    if (!topic || !topic.id) return;
    if (categoryId && !topic.category) topic.category = categoryId;
    if (!_topics[topic.id]) _order.push(topic.id);
    else if (_dupes.indexOf(topic.id) === -1) _dupes.push(topic.id);   // re-registration = a duplicate-id bug
    _topics[topic.id] = topic;
  }

  /** Register an array of topics under a category id (the common entry point for data modules). */
  function registerAll(categoryId, topics) {
    if (!topics) return;
    for (var i = 0; i < topics.length; i++) _registerOne(categoryId, topics[i]);
  }

  function get(id) { return _topics[id] || null; }
  function has(id) { return !!_topics[id]; }
  function count() { return _order.length; }
  function all() { return _order.map(function (id) { return _topics[id]; }); }

  /** Categories sorted by their declared order, then registration order. Each gets a live topic count. */
  function categories() {
    var list = _catOrder.map(function (id) { return _cats[id]; });
    list.sort(function (a, b) { return a.order - b.order; });
    return list.map(function (c) {
      var topics = byCategory(c.id);
      return {
        id: c.id, title: c.title, icon: c.icon, blurb: c.blurb, order: c.order, subject: c.subject || null,
        topicCount: topics.length,
        publishedCount: topics.filter(function (t) { return t.status === 'published'; }).length
      };
    });
  }

  function categoryMeta(id) { return _cats[id] || null; }

  /** Topics in a category, in registration order. */
  function byCategory(catId) {
    return all().filter(function (t) { return t.category === catId; });
  }

  /** Category ids belonging to a subject, in declared order (ADR-073; subject is a derived lens above category). */
  function categoriesBySubject(subjectId) {
    return categories().filter(function (c) { return c.subject === subjectId; }).map(function (c) { return c.id; });
  }

  /** Topics belonging to a subject (a topic inherits its category's subject), in registration order. */
  function bySubject(subjectId) {
    return all().filter(function (t) {
      var meta = _cats[t.category];
      return meta && meta.subject === subjectId;
    });
  }

  /** Resolve a topic's `related` ids (plus any `related` block ids) to existing topic objects, de-duped. */
  function related(id) {
    var t = _topics[id];
    if (!t) return [];
    var ids = (t.related || []).slice();
    (t.sections || []).forEach(function (b) { if (b && b.type === 'related' && b.ids) ids = ids.concat(b.ids); });
    var seen = {}, out = [];
    ids.forEach(function (rid) {
      if (rid !== id && _topics[rid] && !seen[rid]) { seen[rid] = 1; out.push(_topics[rid]); }
    });
    return out;
  }

  /** Flat prev/next within the same category (for topic-page navigation). */
  function siblings(id) {
    var t = _topics[id]; if (!t) return { prev: null, next: null };
    var sibs = byCategory(t.category);
    var idx = sibs.map(function (x) { return x.id; }).indexOf(id);
    return { prev: idx > 0 ? sibs[idx - 1] : null, next: (idx >= 0 && idx < sibs.length - 1) ? sibs[idx + 1] : null };
  }

  /**
   * Integrity check used by the runtime (defensive) and the node harness. Returns an array of error strings:
   * per-topic schema errors + unknown `related`/`related-block` ids + topic.category not registered. (Cross-file
   * refs to drill categories / syllabus ids are validated by scripts/learn-content.check.js, which can load those.)
   */
  function validateAll() {
    var errs = [];
    _dupes.forEach(function (id) { errs.push('duplicate topic id "' + id + '" registered more than once'); });
    all().forEach(function (t) {
      errs = errs.concat(Schema.validateTopic(t));
      if (t.category && !_cats[t.category]) errs.push(t.id + ': category "' + t.category + '" is not registered');
      var refs = (t.related || []).slice();
      (t.sections || []).forEach(function (b) { if (b && b.type === 'related' && b.ids) refs = refs.concat(b.ids); });
      refs.forEach(function (rid) { if (!_topics[rid]) errs.push(t.id + ': related id "' + rid + '" does not exist'); });
    });
    return errs;
  }

  /** Test-only: wipe the registry (so the node harness can re-load deterministically). */
  function _reset() { _topics = {}; _order = []; _cats = {}; _catOrder = []; _dupes = []; }

  var KnowledgeBase = {
    registerCategory: registerCategory,
    registerAll: registerAll,
    get: get, has: has, count: count, all: all,
    categories: categories, categoryMeta: categoryMeta, byCategory: byCategory,
    categoriesBySubject: categoriesBySubject, bySubject: bySubject,
    related: related, siblings: siblings,
    validateAll: validateAll, _reset: _reset
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KnowledgeBase;
  if (typeof window !== 'undefined') window.KnowledgeBase = KnowledgeBase;
  else root.KnowledgeBase = KnowledgeBase;
})(this);
