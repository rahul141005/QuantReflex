/**
 * knowledge/blocks.js — one renderer per knowledge-object block type (ADR-069, Learn Knowledge Engine).
 *
 * The reusable component layer: BlockRenderers.render(block) → DOM node. A new content kind (video, flashcard,
 * diagram…) is a new entry here — never a rewrite. Tables render into the EXISTING `.math-table` markup and formulas
 * into the EXISTING `.formula-block` markup, so QuantReflex's identity (and the loved tables) is preserved exactly;
 * the richer blocks add `.kx-*` classes styled in css/style.css. No AI surfaces.
 *
 * DOM-driven, but dual-exported + dependency-light so `scripts/learn-render.check.js` can smoke-test every renderer
 * against a tiny document stub (the reason this module now ships with coverage).
 */
var BlockRenderers = (function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function _el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function _itemText(it) { return typeof it === 'string' ? it : (it && it.text) || ''; }
  function _title(id) {
    var KB = (typeof window !== 'undefined' && window.KnowledgeBase) ? window.KnowledgeBase
      : (typeof KnowledgeBase !== 'undefined' ? KnowledgeBase : null);
    var t = KB && KB.get ? KB.get(id) : null;
    return (t && t.title) || String(id).replace(/-/g, ' ');
  }

  var R = {
    overview: function (b) { return _el('p', 'kx-overview', _esc(b.text)); },

    concept: function (b) {
      var d = _el('div', 'kx-concept');
      d.appendChild(_el('h3', 'kx-concept-title', _esc(b.title)));
      d.appendChild(_el('p', 'kx-concept-body', _esc(b.body)));
      return d;
    },

    formula: function (b) {
      var wrap = _el('div', 'kx-formula-group');
      (b.items || []).forEach(function (it) {
        var blk = _el('div', 'formula-block');           // reuse the existing formula card identity
        blk.appendChild(_el('h3', 'formula-block-title', _esc(it.name)));
        blk.appendChild(_el('div', 'formula-label', 'Formula:'));
        blk.appendChild(_el('p', 'formula-text', _esc(it.expr)));
        if (it.when) { blk.appendChild(_el('div', 'formula-label', 'Use when:')); blk.appendChild(_el('p', 'formula-tip', _esc(it.when))); }
        if (it.whenNot) { blk.appendChild(_el('div', 'formula-label kx-label-warn', 'Avoid when:')); blk.appendChild(_el('p', 'formula-tip', _esc(it.whenNot))); }
        if (it.trap) { blk.appendChild(_el('div', 'formula-label kx-label-trap', 'Trap:')); blk.appendChild(_el('p', 'formula-tip', _esc(it.trap))); }
        wrap.appendChild(blk);
      });
      return wrap;
    },

    trick: function (b) {
      var d = _el('div', 'kx-callout kx-trick');
      d.appendChild(_el('h3', 'kx-callout-head', '⚡ ' + _esc(b.title || 'Speed trick')));
      var ul = _el('ul', 'kx-callout-list');
      (b.items || []).forEach(function (it) { ul.appendChild(_el('li', null, _esc(_itemText(it)))); });
      d.appendChild(ul);
      return d;
    },

    trap: function (b) {
      var d = _el('div', 'kx-callout kx-trap');
      d.appendChild(_el('h3', 'kx-callout-head', '⚠️ ' + _esc(b.title || 'Common mistakes')));
      var ul = _el('ul', 'kx-callout-list');
      (b.items || []).forEach(function (it) { ul.appendChild(_el('li', null, _esc(_itemText(it)))); });
      d.appendChild(ul);
      return d;
    },

    exam: function (b) {
      var d = _el('div', 'kx-callout kx-exam');
      d.appendChild(_el('h3', 'kx-callout-head', '📌 ' + _esc(b.title || 'Exam strategy')));
      var ul = _el('ul', 'kx-callout-list');
      (b.items || []).forEach(function (it) { ul.appendChild(_el('li', null, _esc(_itemText(it)))); });
      d.appendChild(ul);
      return d;
    },

    memory: function (b) {
      var d = _el('div', 'kx-callout kx-memory');
      d.appendChild(_el('h3', 'kx-callout-head', '🧠 Memory hook'));
      d.appendChild(_el('p', 'kx-callout-body', _esc(b.text)));
      return d;
    },

    example: function (b) {
      var d = _el('div', 'kx-example');
      d.appendChild(_el('h3', 'kx-example-head', '📝 Solved example'));
      d.appendChild(_el('p', 'kx-example-problem', _esc(b.problem)));
      var ol = _el('ol', 'kx-example-steps');
      (b.steps || []).forEach(function (s) { ol.appendChild(_el('li', null, _esc(s))); });
      d.appendChild(ol);
      d.appendChild(_el('div', 'kx-example-answer', 'Answer: ' + _esc(b.answer)));
      return d;
    },

    table: function (b) {
      var wrap = _el('div', 'kx-table-wrap');
      if (b.caption) wrap.appendChild(_el('div', 'kx-table-caption', _esc(b.caption)));
      var html = '<table class="math-table">';
      if (b.headers && b.headers.length) {
        html += '<tr>';
        b.headers.forEach(function (h) { html += '<th>' + _esc(h) + '</th>'; });
        html += '</tr>';
      }
      (b.rows || []).forEach(function (r) {
        html += '<tr>';
        (r || []).forEach(function (c) { html += '<td>' + _esc(c) + '</td>'; });
        html += '</tr>';
      });
      html += '</table>';
      wrap.appendChild(_el('div', 'kx-table-scroll', html));   // horizontal-scroll guard for wide tables on phones
      return wrap;
    },

    revision: function (b) {
      var d = _el('div', 'kx-revision');
      var ul = _el('ul', 'kx-revision-list');
      (b.points || []).forEach(function (p) { ul.appendChild(_el('li', null, _esc(p))); });
      d.appendChild(ul);
      return d;
    },

    related: function (b) {
      var d = _el('div', 'kx-related-inline');
      (b.ids || []).forEach(function (id) {
        var a = _el('a', 'kx-chip', _esc(_title(id)));     // show the topic's TITLE, not the slug
        a.setAttribute('href', '#learn/' + encodeURIComponent(id));
        a.setAttribute('data-topic', id);
        d.appendChild(a);
      });
      return d;
    }
  };

  /** Render one block to DOM (null for an unknown type — defensive). */
  function render(block) {
    if (!block || !R[block.type]) return null;
    return R[block.type](block);
  }

  /** Section-nav labels for the in-page topic navigation. Richer, textbook-style headings (ADR-081). */
  var SECTION_LABELS = {
    overview: 'Overview', concept: 'Concept', formula: 'Key Formulae', trick: 'Shortcuts & Tricks',
    trap: 'Common Mistakes', exam: 'Exam Strategy', example: 'Solved Example', table: 'At a Glance',
    memory: 'Memory Hook', revision: 'Key Takeaways', related: 'Related'
  };

  /* The heading shown above a section + on its nav pill. A concept names itself (its own title) and a table prefers
     its caption — so a chapter reads as a real table of contents ("The overlap of +1", "Mirror vs Water") instead of
     "Concept · Concept · Table". Falls back to the generic label. */
  function sectionLabel(block) {
    if (!block) return '';
    if (block.type === 'concept' && block.title) return String(block.title);
    if (block.type === 'table' && block.caption) return String(block.caption);
    return SECTION_LABELS[block.type] || block.type;
  }

  return { render: render, renderers: R, SECTION_LABELS: SECTION_LABELS, sectionLabel: sectionLabel };
})();

if (typeof window !== 'undefined') window.BlockRenderers = BlockRenderers;
if (typeof module !== 'undefined' && module.exports) module.exports = BlockRenderers;   // node: smoke-tested via a document stub
