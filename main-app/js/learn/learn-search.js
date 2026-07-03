/**
 * learn/learn-search.js — instant, symbol/synonym-aware search over the KnowledgeBase (ADR-069).
 *
 * Replaces the old DOM text-scan (performLearnSearch) with a real in-memory index built ONCE from the registry:
 * a weighted haystack per topic (title ≫ searchTerms/aliases ≫ formula names ≫ concept text ≫ overview), so a user
 * can find any topic/formula/trick/trap/symbol in well under 5 seconds. PURE (no DOM) → dual-exported for the
 * node check. The index lazily (re)builds when the registry's topic count changes.
 *
 * ADR-092: also indexes the Quick-Reference library cards (QR_QUICKREF) via queryCards(), so ONE search box covers
 * topics AND condensed reference material. query() stays topic-only (its existing contract); the Learn view renders
 * the two result groups together.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);

  var _index = null;     // [{ id, title, category, status, hay (weighted lowercased string) }]
  var _builtCount = -1;
  var _cardIndex = null; // [{ id, title, icon, section, hay }] — quick-ref cards (ADR-092)

  function _push(arr, s, times) { if (s) { for (var i = 0; i < (times || 1); i++) arr.push(String(s).toLowerCase()); } }

  function _topicHay(t) {
    var parts = [];
    _push(parts, t.title, 4);
    _push(parts, t.id.replace(/-/g, ' '), 3);
    (t.searchTerms || []).forEach(function (s) { _push(parts, s, 3); });
    _push(parts, t.category, 1);
    (t.sections || []).forEach(function (b) {
      if (!b) return;
      if (b.type === 'overview' || b.type === 'memory') _push(parts, b.text, 1);
      else if (b.type === 'concept') { _push(parts, b.title, 2); _push(parts, b.body, 1); }
      else if (b.type === 'formula') (b.items || []).forEach(function (it) { _push(parts, it.name, 2); _push(parts, it.expr, 1); });
      else if (b.type === 'trick' || b.type === 'trap') { _push(parts, b.title, 1); (b.items || []).forEach(function (it) { _push(parts, typeof it === 'string' ? it : it.text, 1); }); }
      else if (b.type === 'revision') (b.points || []).forEach(function (p) { _push(parts, p, 1); });
    });
    return parts.join('  ');
  }

  function build() {
    if (!KB) { _index = []; return _index; }
    _index = KB.all().map(function (t) {
      return { id: t.id, title: t.title, icon: t.icon, category: t.category, status: t.status, hay: _topicHay(t) };
    });
    _builtCount = KB.count();
    return _index;
  }

  function _ensure() { if (_index === null || (KB && KB.count() !== _builtCount)) build(); return _index; }

  /** Return ranked topic matches for a query. Each result: { id, title, icon, category, status, score }. */
  function query(q) {
    var idx = _ensure();
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    var terms = q.split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < idx.length; i++) {
      var rec = idx[i], score = 0, matchedAll = true;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        var hay = rec.hay;
        var first = hay.indexOf(term);
        if (first === -1) { matchedAll = false; break; }
        // weight: count occurrences (the haystack repeats high-value fields) + a title-prefix bonus
        var occ = 0, from = 0, p;
        while ((p = hay.indexOf(term, from)) !== -1) { occ++; from = p + term.length; }
        score += occ;
        if (rec.title.toLowerCase().indexOf(term) === 0) score += 5;
      }
      if (matchedAll && score > 0) out.push({ id: rec.id, title: rec.title, icon: rec.icon, category: rec.category, status: rec.status, score: score });
    }
    out.sort(function (a, b) { return b.score - a.score || a.title.localeCompare(b.title); });
    return out;
  }

  /* ---- Quick-Reference card search (ADR-092) ---- */
  function _QR() {
    if (typeof window !== 'undefined' && window.QR_QUICKREF) return window.QR_QUICKREF;
    if (root && root.QR_QUICKREF) return root.QR_QUICKREF;
    if (typeof require !== 'undefined') { try { return require('../quick-reference/quick-ref-data'); } catch (_) {} }
    return null;
  }
  function _ensureCards() {
    if (_cardIndex !== null) return _cardIndex;
    var QR = _QR();
    if (!QR || !QR.CARDS) { _cardIndex = []; return _cardIndex; }
    var secTitle = {};
    (QR.SECTIONS || []).forEach(function (s) { secTitle[s.id] = s.title; });
    _cardIndex = QR.CARDS.map(function (c) {
      var parts = [];
      _push(parts, c.title, 4);
      (c.searchTerms || []).forEach(function (s) { _push(parts, s, 3); });
      _push(parts, secTitle[c.section], 1);
      return { id: c.id, title: c.title, icon: c.icon, section: secTitle[c.section] || c.section, hay: parts.join('  ') };
    });
    return _cardIndex;
  }

  /** Ranked Quick-Reference card matches. Each result: { id, title, icon, section, score }. */
  function queryCards(q) {
    var idx = _ensureCards();
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    var terms = q.split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < idx.length; i++) {
      var rec = idx[i], score = 0, matchedAll = true;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        var first = rec.hay.indexOf(term);
        if (first === -1) { matchedAll = false; break; }
        var occ = 0, from = 0, p;
        while ((p = rec.hay.indexOf(term, from)) !== -1) { occ++; from = p + term.length; }
        score += occ;
        if (rec.title.toLowerCase().indexOf(term) === 0) score += 5;
      }
      if (matchedAll && score > 0) out.push({ id: rec.id, title: rec.title, icon: rec.icon, section: rec.section, score: score });
    }
    out.sort(function (a, b) { return b.score - a.score || a.title.localeCompare(b.title); });
    return out;
  }

  var LearnSearch = { build: build, query: query, queryCards: queryCards };
  if (typeof module !== 'undefined' && module.exports) module.exports = LearnSearch;
  if (typeof window !== 'undefined') window.LearnSearch = LearnSearch;
  else root.LearnSearch = LearnSearch;
})(this);
