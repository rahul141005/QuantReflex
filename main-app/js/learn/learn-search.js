/**
 * learn/learn-search.js — instant, symbol/synonym-aware search over the KnowledgeBase (ADR-069).
 *
 * Replaces the old DOM text-scan (performLearnSearch) with a real in-memory index built ONCE from the registry:
 * a weighted haystack per topic (title ≫ searchTerms/aliases ≫ formula names ≫ concept text ≫ overview), so a user
 * can find any topic/formula/trick/trap/symbol in well under 5 seconds. PURE (no DOM) → dual-exported for the
 * node check. The index lazily (re)builds when the registry's topic count changes.
 */
(function (root) {
  'use strict';
  var KB = (typeof require !== 'undefined') ? require('../knowledge/registry')
    : (typeof window !== 'undefined' ? window.KnowledgeBase : root.KnowledgeBase);

  var _index = null;     // [{ id, title, category, status, hay (weighted lowercased string) }]
  var _builtCount = -1;

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

  var LearnSearch = { build: build, query: query };
  if (typeof module !== 'undefined' && module.exports) module.exports = LearnSearch;
  if (typeof window !== 'undefined') window.LearnSearch = LearnSearch;
  else root.LearnSearch = LearnSearch;
})(this);
