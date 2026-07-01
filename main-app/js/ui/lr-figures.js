/**
 * lr-figures.js — the reusable SVG figure renderer for visual Logical Reasoning (ADR-079).
 *
 * Mirrors js/ui/di-charts.js: a PURE `render(spec)` → HTML/SVG string the drill engine injects (above the stem, or
 * inside an MCQ option button), plus `describe(spec)` → text for AI grounding + screen readers. Everything is
 * viewBox-based vector (so it is crisp at any DPI), themes via CSS classes (light/dark), and is accessibility-tagged
 * (role="img" + aria-label). New figure kinds plug in by adding one `_inner` case — this is the seam the deferred
 * topics (paper folding, embedded figures) will use later.
 *
 *   spec.kind ∈ 'glyph' | 'arrow' | 'die' | 'cube' | 'qmark' | 'row'(items:[spec,…])
 *
 * Dual-exported (window.LRFigures / module.exports).
 */
(function (root) {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* pip layout for a die face on a 100×100 cell */
  var PIPS = {
    1: [[50, 50]], 2: [[32, 32], [68, 68]], 3: [[32, 32], [50, 50], [68, 68]],
    4: [[32, 32], [68, 32], [32, 68], [68, 68]], 5: [[32, 32], [68, 32], [50, 50], [32, 68], [68, 68]],
    6: [[32, 30], [68, 30], [32, 50], [68, 50], [32, 70], [68, 70]]
  };

  function _glyph(s) {
    var tr = '';
    if (s.flip === 'h') tr = 'translate(100,0) scale(-1,1)';
    else if (s.flip === 'v') tr = 'translate(0,100) scale(1,-1)';
    if (s.rot) tr = (tr ? tr + ' ' : '') + 'rotate(' + s.rot + ' 50 50)';
    return '<g' + (tr ? ' transform="' + tr + '"' : '') + '><text x="50" y="52" class="lr-fig-glyph" text-anchor="middle" dominant-baseline="central">' + _esc(s.text) + '</text></g>';
  }
  function _arrow(s) {
    return '<g transform="rotate(' + (s.rot || 0) + ' 50 50)">' +
      '<line x1="22" y1="50" x2="68" y2="50" class="lr-fig-stroke" />' +
      '<polygon points="66,40 86,50 66,60" class="lr-fig-fill" />' +
      '<circle cx="22" cy="50" r="4" class="lr-fig-fill" />' +   // tail marker so direction is unambiguous
      '</g>';
  }
  function _die(s) {
    var pips = (PIPS[s.value] || []).map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" class="lr-fig-fill" />'; }).join('');
    return '<rect x="14" y="14" width="72" height="72" rx="12" class="lr-fig-die" />' + pips;
  }
  function _cube(s) {
    var n = s.n || 3, g = '';
    /* a simple isometric cube (front + top + right faces) with n−1 subdivision lines on the front face */
    var fx = 22, fy = 42, fw = 46;
    g += '<polygon points="' + fx + ',' + fy + ' ' + (fx + fw) + ',' + fy + ' ' + (fx + fw) + ',' + (fy + fw) + ' ' + fx + ',' + (fy + fw) + '" class="lr-fig-cubeface" />';
    g += '<polygon points="' + fx + ',' + fy + ' ' + (fx + 16) + ',' + (fy - 16) + ' ' + (fx + fw + 16) + ',' + (fy - 16) + ' ' + (fx + fw) + ',' + fy + '" class="lr-fig-cubeface2" />';
    g += '<polygon points="' + (fx + fw) + ',' + fy + ' ' + (fx + fw + 16) + ',' + (fy - 16) + ' ' + (fx + fw + 16) + ',' + (fy + fw - 16) + ' ' + (fx + fw) + ',' + (fy + fw) + '" class="lr-fig-cubeface3" />';
    for (var i = 1; i < n; i++) { var t = fx + fw * i / n; g += '<line x1="' + t + '" y1="' + fy + '" x2="' + t + '" y2="' + (fy + fw) + '" class="lr-fig-cubeline" />'; var u = fy + fw * i / n; g += '<line x1="' + fx + '" y1="' + u + '" x2="' + (fx + fw) + '" y2="' + u + '" class="lr-fig-cubeline" />'; }
    return g;
  }
  function _qmark() { return '<text x="50" y="52" class="lr-fig-glyph lr-fig-qmark" text-anchor="middle" dominant-baseline="central">?</text>'; }

  function _inner(s) {
    switch (s.kind) {
      case 'glyph': return _glyph(s);
      case 'arrow': return _arrow(s);
      case 'die': return _die(s);
      case 'cube': return _cube(s);
      case 'qmark': return _qmark();
      case 'row': return (s.items || []).map(function (it, i) { return '<g transform="translate(' + (i * 100) + ',0)">' + _inner(it) + '</g>'; }).join('');
      default: return '';
    }
  }

  function describe(s) {
    if (!s || !s.kind) return '';
    switch (s.kind) {
      case 'glyph': return 'the character "' + s.text + '"' + (s.flip === 'h' ? ' mirrored left-to-right' : s.flip === 'v' ? ' reflected top-to-bottom' : s.rot ? ' rotated ' + s.rot + '°' : '');
      case 'arrow': return 'an arrow pointing at ' + (s.rot || 0) + '°';
      case 'die': return 'a die face showing ' + s.value;
      case 'cube': return 'a cube cut into ' + s.n + '×' + s.n + '×' + s.n + ' small cubes';
      case 'qmark': return 'a question mark (the missing figure)';
      case 'row': return 'a row of figures: ' + (s.items || []).map(describe).join(', ');
      default: return '';
    }
  }

  function render(spec) {
    if (!spec || !spec.kind) return '';
    var n = spec.kind === 'row' ? (spec.items || []).length : 1;
    var w = 100 * Math.max(1, n);
    /* A multi-item row's viewBox is 100·n wide; the 130px .lr-figure cap would squash it. Scale the cap by item
       count (≈84px/item, capped) so a 3–4 figure series stays legible on a phone (ADR-086 P8). */
    var style = (spec.kind === 'row' && n > 1) ? ' style="max-width:' + Math.min(340, 84 * n) + 'px"' : '';
    return '<figure class="lr-figure" role="img" aria-label="' + _esc(describe(spec)) + '"' + style + '>' +
      '<svg class="lr-figure-svg" viewBox="0 0 ' + w + ' 100" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">' +
      _inner(spec) + '</svg></figure>';
  }

  var LRFigures = { render: render, describe: describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = LRFigures;
  if (typeof window !== 'undefined') window.LRFigures = LRFigures;
  else root.LRFigures = LRFigures;
})(this);
