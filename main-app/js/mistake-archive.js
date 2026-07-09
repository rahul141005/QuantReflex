/**
 * mistake-archive.js — QRMistakeArchive: the durable Mistake Archive foundation (ADR-111 Phase F-M8).
 *
 * The archive is a LONG-TERM LEARNING SUBSTRATE, not a history screen. Every wrong answer is captured as a versioned,
 * forward-compatible record that reproduces the original attempt EXACTLY (the fully-rendered question in the language it
 * was practised in — stem, options, explanation, and the machine chart/figure/optionFigure specs) plus rich metadata
 * (language, selected answer, timing, hints, explanation-viewed, difficulty, category, subtype, engine, source, session
 * type, timestamp). It is engine-agnostic (Quant, DI, LR, LR-visual, authored, and any future engine) and every field is
 * ADDITIVE — old records upgrade transparently and unknown future fields are preserved untouched.
 *
 * This module owns: the schema + record builder, v1→v2 normalisation, the merge-by-id reconciliation that keeps the
 * offline cache and cloud free of duplicates / loss / corruption, the query layer (filter / sort / search — the
 * foundation for bookmarks, AI review, spaced repetition, weak-topic detection, revision plans, coaching analytics,
 * exports and advanced search), and the reviewability + replay reconstruction. progress.js persists; this module is the
 * pure logic. Dual-exported (browser <script> + Node require), no DOM / localStorage access.
 *
 * i18n: `lang` is stamped at capture; a record replays in the language it was practised in (the rendered strings are
 * frozen — see I18N_KNOWN_LIMITS). English rendering is byte-identical (the archive never re-generates content).
 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 2;
  var CAP = 100;   /* keep the most-recent N to bound localStorage / the Firestore practice doc (unchanged from v1). */

  /* LR-visual categories (rendered from a machine figure spec). */
  var LRV_CATS = { 'lr-mirror': 1, 'lr-water': 1, 'lr-dice': 1, 'lr-cube': 1, 'lr-fseries': 1, 'lr-fanalogy': 1, 'lr-odd-fig': 1, 'lr-paper': 1, 'lr-pattern': 1, 'lr-embedded': 1 };
  /* Shared-context SETS: a single stored question can't reconstruct the scenario/caselet prose → not self-serve-able. */
  var SET_CATS = { 'lr-seating': 1, 'lr-puzzle': 1, 'di-caselet': 1 };

  /** Classify a category into its engine id (stable, used for filtering + reviewability). */
  function engineOf(category) {
    var c = String(category || '');
    if (c.indexOf('di-') === 0) return 'di';
    if (LRV_CATS[c]) return 'lrv';
    if (c === 'lr-seating' || c === 'lr-puzzle') return 'lr-set';
    if (c.indexOf('lr-') === 0) return 'lr';
    if (c.indexOf('cr-') === 0 || c === 'authored') return 'authored';
    return 'quant';
  }

  function djb2(str) { var h = 5381, s = String(str); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
  /** Stable id from (question, selected, ts): the SAME attempt re-synced dedups; genuinely distinct attempts differ in ts. */
  function stableId(question, selected, ts) { return 'm' + djb2(String(question) + '§' + String(selected) + '§' + String(ts)).toString(36) + ts.toString(36); }

  /**
   * Build a v2 archive record from the wrong-answered question + a context object. `ctx` supplies the metadata the
   * capture site knows (timeMs, selected, source, sessionType, hintsUsed, explanationViewed, lang, ts, date). Everything
   * else is derived from the question. Chart/figure/optionFigure SPECS are stored so DI + LR-visual reproduce exactly.
   */
  function buildRecord(q, ctx) {
    ctx = ctx || {};
    q = q || {};
    var ts = (typeof ctx.ts === 'number') ? ctx.ts : 0;
    var category = q.category || ctx.category || null;
    var selected = (ctx.selected == null) ? null : String(ctx.selected);
    var rec = {
      id: stableId(q.question, selected, ts),
      v: SCHEMA_VERSION,
      ts: ts,
      date: ctx.date || null,
      /* --- reproduce the attempt exactly (frozen rendering, in its capture language) --- */
      question: q.question,
      answer: (q.answer == null) ? null : String(q.answer),
      options: (q.options && q.options.length) ? q.options.slice() : null,
      explanation: q.explanation || null,
      chart: q.chart || null,
      figure: q.figure || null,
      optionFigures: (q.optionFigures && q.optionFigures.length) ? q.optionFigures.slice() : null,
      context: q.context || null,
      /* --- classification --- */
      category: category,
      subtype: q.subtype || null,
      difficulty: _difficultyOf(q),
      engine: engineOf(category),
      /* --- attempt metadata --- */
      lang: ctx.lang || 'en',
      selected: selected,
      timeMs: (typeof ctx.timeMs === 'number' && isFinite(ctx.timeMs)) ? ctx.timeMs : null,
      hintsUsed: (typeof ctx.hintsUsed === 'number') ? ctx.hintsUsed : 0,
      explanationViewed: !!ctx.explanationViewed,
      source: ctx.source || 'unknown',
      sessionType: ctx.sessionType || null,
      /* --- learning-system state (reserved: spaced repetition, bookmarks, weak-topic, resolution) --- */
      reviewCount: 0,
      lastReviewedTs: null,
      bookmarked: false,
      resolved: false,
      /* --- provenance for future exact re-generation (engine + classification; extend without breaking) --- */
      gen: { engine: engineOf(category), subtype: q.subtype || null, lang: ctx.lang || 'en' }
    };
    return rec;
  }

  /* Difficulty from the question's subtype prefix ('easy:foo') or explicit field. */
  function _difficultyOf(q) {
    if (q && (q.difficulty === 'easy' || q.difficulty === 'medium' || q.difficulty === 'hard')) return q.difficulty;
    var m = /^(easy|medium|hard):/.exec(String(q && q.subtype || ''));
    return m ? m[1] : null;
  }

  /**
   * Normalise any record to the current schema (idempotent). v1 records (no id/v — {question,answer,category,options,
   * explanation,subtype,date}) are upgraded in place: a stable id is derived, engine classified, missing metadata filled
   * with safe defaults, unknown fields preserved. Never throws on a malformed record.
   */
  function normalize(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    if (rec.v === SCHEMA_VERSION && rec.id) return rec;   /* already current */
    var ts = (typeof rec.ts === 'number') ? rec.ts : (rec.date ? _dateToTs(rec.date) : 0);
    var out = {};
    for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) out[k] = rec[k];   /* preserve unknown fields */
    out.v = SCHEMA_VERSION;
    out.ts = ts;
    if (!out.id) out.id = stableId(rec.question, (rec.selected == null ? null : rec.selected), ts);
    out.engine = out.engine || engineOf(rec.category);
    out.difficulty = out.difficulty || _difficultyOf(rec);
    if (out.lang == null) out.lang = 'en';
    if (out.answer != null) out.answer = String(out.answer);
    if (out.options && !out.options.length) out.options = null;
    if (typeof out.reviewCount !== 'number') out.reviewCount = 0;
    if (out.lastReviewedTs === undefined) out.lastReviewedTs = null;
    if (typeof out.bookmarked !== 'boolean') out.bookmarked = false;
    if (typeof out.resolved !== 'boolean') out.resolved = false;
    if (typeof out.hintsUsed !== 'number') out.hintsUsed = 0;
    if (typeof out.explanationViewed !== 'boolean') out.explanationViewed = false;
    if (!out.source) out.source = 'unknown';
    return out;
  }
  function _dateToTs(d) { var t = Date.parse(String(d)); return isFinite(t) ? t : 0; }

  /** Normalise a whole list (dedup by id, most-recent kept), preserving order by ts desc, capped. */
  function normalizeList(list, cap) {
    if (!Array.isArray(list)) return [];
    return _dedupeSortCap(list.map(normalize), cap || CAP);
  }

  /**
   * Merge two mistake lists (offline cache + cloud) with NO duplication, loss, or corruption. Union by stable id; when
   * both sides carry the same id, the newer-ts record wins for the frozen fields, but LEARNING state is OR-merged so a
   * bookmark / resolution / review made on either device survives. Deterministic; result sorted by ts desc and capped.
   */
  function mergeMistakes(a, b, cap) {
    cap = cap || CAP;
    var by = {};
    (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach(function (raw) {
      var r = normalize(raw);
      if (!r || !r.id) return;
      var prev = by[r.id];
      if (!prev) { by[r.id] = r; return; }
      var newer = (r.ts >= prev.ts) ? r : prev, older = (r.ts >= prev.ts) ? prev : r;
      var merged = {}; for (var k in newer) merged[k] = newer[k];
      merged.bookmarked = !!(newer.bookmarked || older.bookmarked);
      merged.resolved = !!(newer.resolved || older.resolved);
      merged.reviewCount = Math.max(newer.reviewCount || 0, older.reviewCount || 0);
      merged.lastReviewedTs = Math.max(newer.lastReviewedTs || 0, older.lastReviewedTs || 0) || null;
      by[r.id] = merged;
    });
    var out = []; for (var id in by) if (Object.prototype.hasOwnProperty.call(by, id)) out.push(by[id]);
    return _dedupeSortCap(out, cap);
  }
  function _dedupeSortCap(list, cap) {
    var seen = {}, out = [];
    list.forEach(function (r) { if (r && r.id && !seen[r.id]) { seen[r.id] = 1; out.push(r); } });
    out.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    return out.slice(0, cap);
  }

  /**
   * Query the archive: filter + sort + search. The foundation for bookmarks / weak-topic / revision / export / search.
   * opts: { category, engine, difficulty, lang, source, subtype, bookmarked, resolved, search, sort, dir, limit }.
   * `search` is a case-insensitive substring over the question text. sort ∈ {ts,difficulty,category,reviewCount}.
   */
  var _DIFF_RANK = { easy: 0, medium: 1, hard: 2 };
  function query(list, opts) {
    opts = opts || {};
    var out = normalizeList(list, CAP).filter(function (r) {
      if (opts.category && r.category !== opts.category) return false;
      if (opts.engine && r.engine !== opts.engine) return false;
      if (opts.difficulty && r.difficulty !== opts.difficulty) return false;
      if (opts.lang && r.lang !== opts.lang) return false;
      if (opts.source && r.source !== opts.source) return false;
      if (opts.subtype && r.subtype !== opts.subtype) return false;
      if (opts.bookmarked != null && !!r.bookmarked !== !!opts.bookmarked) return false;
      if (opts.resolved != null && !!r.resolved !== !!opts.resolved) return false;
      if (opts.search) { var q = String(r.question || '').toLowerCase(); if (q.indexOf(String(opts.search).toLowerCase()) === -1) return false; }
      return true;
    });
    var sort = opts.sort || 'ts', dir = (opts.dir === 'asc') ? 1 : -1;
    out.sort(function (x, y) {
      var a, b;
      if (sort === 'difficulty') { a = _DIFF_RANK[x.difficulty] == null ? -1 : _DIFF_RANK[x.difficulty]; b = _DIFF_RANK[y.difficulty] == null ? -1 : _DIFF_RANK[y.difficulty]; }
      else if (sort === 'category') { a = String(x.category); b = String(y.category); return dir * (a < b ? -1 : a > b ? 1 : 0); }
      else if (sort === 'reviewCount') { a = x.reviewCount || 0; b = y.reviewCount || 0; }
      else { a = x.ts || 0; b = y.ts || 0; }
      return dir * (a - b);
    });
    if (typeof opts.limit === 'number' && opts.limit >= 0) out = out.slice(0, opts.limit);
    return out;
  }

  /** A distinct-value facet map (for building filter chips): { engines, categories, difficulties, langs, sources }. */
  function facets(list) {
    var f = { engines: {}, categories: {}, difficulties: {}, langs: {}, sources: {} };
    normalizeList(list, CAP).forEach(function (r) {
      f.engines[r.engine] = (f.engines[r.engine] || 0) + 1;
      f.categories[r.category] = (f.categories[r.category] || 0) + 1;
      if (r.difficulty) f.difficulties[r.difficulty] = (f.difficulties[r.difficulty] || 0) + 1;
      f.langs[r.lang] = (f.langs[r.lang] || 0) + 1;
      f.sources[r.source] = (f.sources[r.source] || 0) + 1;
    });
    return f;
  }

  /** Can this record be re-served for review? Not a shared-context SET, and self-contained enough to render + grade. */
  function isReviewable(rec) {
    var r = normalize(rec);
    if (!r || SET_CATS[r.category]) return false;
    if (!r.question || r.answer == null) return false;
    if (r.engine === 'di') return !!(r.chart && r.options && r.options.length);
    if (r.engine === 'lrv') return !!(r.figure && r.options && r.options.length);
    if (r.engine === 'lr' || r.engine === 'authored') return !!(r.options && r.options.length);
    if (r.engine === 'lr-set') return false;
    return true;   /* quant numeric */
  }

  /** Reconstruct the drill question object from a stored record (frozen strings + machine specs, in its capture language). */
  function toReviewQuestion(rec) {
    var r = normalize(rec);
    var q = { question: r.question, answer: r.answer, category: r.category };
    if (r.subtype) q.subtype = r.subtype;
    if (r.options) q.options = r.options.slice();
    if (r.explanation) q.explanation = r.explanation;
    if (r.chart) q.chart = r.chart;
    if (r.figure) q.figure = r.figure;
    if (r.optionFigures) q.optionFigures = r.optionFigures.slice();
    if (r.context) q.context = r.context;
    q._fromArchive = true;   /* marker so consumers know this is a replayed mistake, not a fresh generation */
    return q;
  }

  var API = {
    SCHEMA_VERSION: SCHEMA_VERSION, CAP: CAP, SET_CATS: SET_CATS,
    engineOf: engineOf, stableId: stableId, buildRecord: buildRecord,
    normalize: normalize, normalizeList: normalizeList, mergeMistakes: mergeMistakes,
    query: query, facets: facets, isReviewable: isReviewable, toReviewQuestion: toReviewQuestion
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.QRMistakeArchive = API;
  else root.QRMistakeArchive = API;
})(this);
