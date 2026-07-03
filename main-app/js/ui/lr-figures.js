/**
 * lr-figures.js — the reusable SVG figure renderer for visual Logical Reasoning (ADR-079 · v2 ADR-093).
 *
 * Mirrors js/ui/di-charts.js: a PURE `render(spec)` → HTML/SVG string the drill engine injects (above the stem, or
 * inside an MCQ option button), plus `describe(spec)` → text for AI grounding + screen readers. Everything is
 * viewBox-based vector (crisp at any DPI), themed via CSS classes (light/dark), accessibility-tagged
 * (role="img" + aria-label).
 *
 * v2 (ADR-093) grows the vocabulary from 5 primitives to an exam-grade set:
 *   spec.kind ∈ 'glyph' | 'arrow' | 'die' | 'cube' | 'qmark' | 'row'(items:[spec,…])
 *            | 'shape'    { form, fill:'none|solid|half', rot?, flip?('h'|'v') }
 *            | 'compo'    { outer:{form,fill}, inner:[{form,fill,at,scale?}], rot?, flip? }
 *            | 'seg'      { segs:[[x1,y1,x2,y2],…] on a 0..3 lattice }   — line figures (mirror/embedded)
 *            | 'paper'    { fold:'v|h|d'|['v','h'], holes:[[x,y],…] 0..1 sheet, folded:bool }
 *            | 'net'      { faces:[6 labels], ask?:label }               — cross cube net
 *            | 'die3'     { top, front, right }                          — isometric die, three visible faces
 *            | 'grid3'    { cells:[9 specs|null] }                       — 3×3 matrix (null → ?)
 * All cells are 100×100; rows translate by 100·i; grid3 is a 300×300 block. Inner anchors for compo/dot markers:
 * c t tr r br b bl l tl. `flip` then `rot` compose as an outer transform so the ENGINE can express reflections and
 * rotations as comparable spec fields.
 *
 * Dual-exported (window.LRFigures / module.exports).
 */
(function (root) {
  'use strict';

  var _uid = 0;   // unique ids for clipPaths (several inline SVGs share one document)

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* pip layout for a die face on a 100×100 cell */
  var PIPS = {
    1: [[50, 50]], 2: [[32, 32], [68, 68]], 3: [[32, 32], [50, 50], [68, 68]],
    4: [[32, 32], [68, 32], [32, 68], [68, 68]], 5: [[32, 32], [68, 32], [50, 50], [32, 68], [68, 68]],
    6: [[32, 30], [68, 30], [32, 50], [68, 50], [32, 70], [68, 70]]
  };

  /* inner-anchor positions on the 100×100 cell (compo elements, dot markers) */
  var ANCHOR = { c: [50, 50], t: [50, 26], tr: [70, 30], r: [74, 50], br: [70, 70], b: [50, 74], bl: [30, 70], l: [26, 50], tl: [30, 30] };

  /* ---------- legacy primitives (unchanged contract) ---------- */

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

  /* ---------- v2: shapes & compositions (ADR-093) ---------- */

  /* Outline path/points for a form centred on (50,50). Returned as [tag, attrs] so fill class can vary. */
  function _formEl(form, cls, scale) {
    var k = scale || 1;
    function pts(list) { return list.map(function (p) { return (50 + (p[0] - 50) * k) + ',' + (50 + (p[1] - 50) * k); }).join(' '); }
    switch (form) {
      case 'circle': return '<circle cx="50" cy="50" r="' + (34 * k) + '" class="' + cls + '" />';
      case 'dot': return '<circle cx="50" cy="50" r="' + (9 * k) + '" class="lr-fig-dotfill" />';
      case 'square': return '<polygon points="' + pts([[20, 20], [80, 20], [80, 80], [20, 80]]) + '" class="' + cls + '" />';
      case 'diamond': return '<polygon points="' + pts([[50, 13], [87, 50], [50, 87], [13, 50]]) + '" class="' + cls + '" />';
      case 'triangle': return '<polygon points="' + pts([[50, 15], [83, 78], [17, 78]]) + '" class="' + cls + '" />';
      case 'pentagon': return '<polygon points="' + pts([[50, 14], [84, 39], [71, 79], [29, 79], [16, 39]]) + '" class="' + cls + '" />';
      case 'hexagon': return '<polygon points="' + pts([[50, 14], [81, 32], [81, 68], [50, 86], [19, 68], [19, 32]]) + '" class="' + cls + '" />';
      case 'semicircle': return '<path d="M ' + (50 - 34 * k) + ' ' + (50 + 14 * k) + ' A ' + (34 * k) + ' ' + (34 * k) + ' 0 0 1 ' + (50 + 34 * k) + ' ' + (50 + 14 * k) + ' Z" class="' + cls + '" />';
      case 'star': return '<polygon points="' + pts([[50, 12], [59, 39], [88, 39], [65, 57], [73, 85], [50, 68], [27, 85], [35, 57], [12, 39], [41, 39]]) + '" class="' + cls + '" />';
      case 'lshape': return '<polygon points="' + pts([[30, 18], [52, 18], [52, 58], [80, 58], [80, 82], [30, 82]]) + '" class="' + cls + '" />';
      case 'plus': return '<polygon points="' + pts([[41, 18], [59, 18], [59, 41], [82, 41], [82, 59], [59, 59], [59, 82], [41, 82], [41, 59], [18, 59], [18, 41], [41, 41]]) + '" class="' + cls + '" />';
      default: return '<circle cx="50" cy="50" r="' + (34 * k) + '" class="' + cls + '" />';
    }
  }

  /* One shape with a fill mode. 'half' = stroked outline + the left half filled via a clipPath (unique id). */
  function _shapeBody(form, fill) {
    if (fill === 'solid') return _formEl(form, 'lr-fig-solidshape');
    if (fill === 'half') {
      var id = 'lrfclip' + (++_uid);
      return '<clipPath id="' + id + '"><rect x="0" y="0" width="50" height="100" /></clipPath>' +
        '<g clip-path="url(#' + id + ')">' + _formEl(form, 'lr-fig-solidshape') + '</g>' +
        _formEl(form, 'lr-fig-shape');
    }
    return _formEl(form, 'lr-fig-shape');
  }

  /* flip-then-rotate outer transform shared by the v2 kinds */
  function _fr(s) {
    var tr = '';
    if (s.flip === 'h') tr = 'translate(100,0) scale(-1,1)';
    else if (s.flip === 'v') tr = 'translate(0,100) scale(1,-1)';
    if (s.rot) tr = (tr ? tr + ' ' : '') + 'rotate(' + s.rot + ' 50 50)';
    return tr;
  }

  function _shape(s) {
    var tr = _fr(s);
    return '<g' + (tr ? ' transform="' + tr + '"' : '') + '>' + _shapeBody(s.form, s.fill) + '</g>';
  }

  /* compo: outer shape + inner elements at anchors. Inner scale defaults 0.34 (0.5 for centre singletons). */
  function _compo(s) {
    var oFill = (s.outer && s.outer.fill) || 'none';
    var g = _shapeBody((s.outer && s.outer.form) || 'square', oFill);
    (s.inner || []).forEach(function (el) {
      var a = ANCHOR[el.at || 'c'] || ANCHOR.c;
      var k = el.scale || (el.at === 'c' || !el.at ? 0.5 : 0.3);
      g += '<g transform="translate(' + (a[0] - 50) + ',' + (a[1] - 50) + ')">' + _shapeBody0(el.form, el.fill, k, oFill !== 'none') + '</g>';
    });
    var tr = _fr(s);
    return '<g' + (tr ? ' transform="' + tr + '"' : '') + '>' + g + '</g>';
  }
  /* inner shapes render scaled about the cell centre (the translate above moves them to the anchor).
     On a shaded outer the marker knocks out (contrasting fill + stroke) so it never vanishes into the fill. */
  function _shapeBody0(form, fill, k, onShaded) {
    if (form === 'dot') return '<circle cx="50" cy="50" r="' + (9 * (k / 0.3)) + '" class="' + (onShaded ? 'lr-fig-dotknock' : 'lr-fig-dotfill') + '" />';
    if (fill === 'solid') return _formEl(form, 'lr-fig-solidshape', k);
    if (fill === 'half') {
      var id = 'lrfclip' + (++_uid);
      return '<clipPath id="' + id + '"><rect x="0" y="0" width="50" height="100" /></clipPath>' +
        '<g clip-path="url(#' + id + ')">' + _formEl(form, 'lr-fig-solidshape', k) + '</g>' + _formEl(form, 'lr-fig-shape', k);
    }
    return _formEl(form, 'lr-fig-shape', k);
  }

  /* seg: line figure on the 0..3 lattice → 14..86 px. */
  function _segXY(v) { return 14 + v * 24; }
  function _seg(s) {
    var g = (s.segs || []).map(function (sg) {
      return '<line x1="' + _segXY(sg[0]) + '" y1="' + _segXY(sg[1]) + '" x2="' + _segXY(sg[2]) + '" y2="' + _segXY(sg[3]) + '" class="lr-fig-seg" />';
    }).join('');
    var tr = _fr(s);
    return '<g' + (tr ? ' transform="' + tr + '"' : '') + '>' + g + '</g>';
  }

  /* paper: folding sheet. Sheet occupies 15..85. folded=true shows the folded state (dashed fold line + arrow),
     folded=false shows the full unfolded sheet with its holes. Holes are [x,y] in 0..1 sheet coordinates. */
  function _paperXY(v) { return 15 + v * 70; }
  function _paper(s) {
    var g = '<rect x="15" y="15" width="70" height="70" class="lr-fig-paper" />';
    var folds = Array.isArray(s.fold) ? s.fold : (s.fold ? [s.fold] : []);
    if (s.folded) {
      folds.forEach(function (f) {
        if (f === 'v') g += '<line x1="50" y1="15" x2="50" y2="85" class="lr-fig-fold" /><path d="M 78 22 Q 88 30 78 38" class="lr-fig-foldarrow" />';
        else if (f === 'h') g += '<line x1="15" y1="50" x2="85" y2="50" class="lr-fig-fold" /><path d="M 22 78 Q 30 88 38 78" class="lr-fig-foldarrow" />';
        else g += '<line x1="15" y1="15" x2="85" y2="85" class="lr-fig-fold" /><path d="M 72 22 Q 82 26 78 36" class="lr-fig-foldarrow" />';
      });
    }
    (s.holes || []).forEach(function (h) {
      g += '<circle cx="' + _paperXY(h[0]) + '" cy="' + _paperXY(h[1]) + '" r="5" class="lr-fig-hole" />';
    });
    return g;
  }

  /* net: cross-shaped cube net. Cells 24px on a 96×72 block centred in the cell.
     Layout: faces[0]=top(r0c1) [1]=left(r1c0) [2]=front(r1c1) [3]=right(r1c2) [4]=back(r1c3) [5]=bottom(r2c1). */
  var NET_CELLS = [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]];   // [col,row] per face index
  function _net(s) {
    var x0 = 2, y0 = 14, cs = 24, g = '';
    (s.faces || []).forEach(function (f, i) {
      var c = NET_CELLS[i]; if (!c) return;
      var x = x0 + c[0] * cs, y = y0 + c[1] * cs;
      g += '<rect x="' + x + '" y="' + y + '" width="' + cs + '" height="' + cs + '" class="lr-fig-netcell" />';
      g += '<text x="' + (x + cs / 2) + '" y="' + (y + cs / 2 + 1) + '" class="lr-fig-netlbl" text-anchor="middle" dominant-baseline="central">' + _esc(f) + '</text>';
    });
    return g;
  }

  /* die3: isometric die with three visible faces (numbers, not pips — deduction questions use digits). */
  function _die3(s) {
    var g = '';
    var fx = 22, fy = 42, fw = 46;
    g += '<polygon points="' + fx + ',' + fy + ' ' + (fx + fw) + ',' + fy + ' ' + (fx + fw) + ',' + (fy + fw) + ' ' + fx + ',' + (fy + fw) + '" class="lr-fig-cubeface" />';
    g += '<polygon points="' + fx + ',' + fy + ' ' + (fx + 16) + ',' + (fy - 16) + ' ' + (fx + fw + 16) + ',' + (fy - 16) + ' ' + (fx + fw) + ',' + fy + '" class="lr-fig-cubeface2" />';
    g += '<polygon points="' + (fx + fw) + ',' + fy + ' ' + (fx + fw + 16) + ',' + (fy - 16) + ' ' + (fx + fw + 16) + ',' + (fy + fw - 16) + ' ' + (fx + fw) + ',' + (fy + fw) + '" class="lr-fig-cubeface3" />';
    g += '<text x="' + (fx + fw / 2) + '" y="' + (fy + fw / 2 + 1) + '" class="lr-fig-facelbl" text-anchor="middle" dominant-baseline="central">' + _esc(s.front) + '</text>';
    g += '<text x="' + (fx + fw / 2 + 8) + '" y="' + (fy - 8) + '" class="lr-fig-facelbl lr-fig-facelbl-top" text-anchor="middle" dominant-baseline="central">' + _esc(s.top) + '</text>';
    g += '<text x="' + (fx + fw + 8) + '" y="' + (fy + fw / 2 - 8) + '" class="lr-fig-facelbl lr-fig-facelbl-side" text-anchor="middle" dominant-baseline="central">' + _esc(s.right) + '</text>';
    return g;
  }

  /* grid3: 3×3 matrix of sub-specs (null → question mark). Rendered inside a 300×300 viewBox. */
  function _grid3(s) {
    var g = '<rect x="1" y="1" width="298" height="298" class="lr-fig-gridframe" />';
    for (var i = 1; i < 3; i++) {
      g += '<line x1="' + (i * 100) + '" y1="1" x2="' + (i * 100) + '" y2="299" class="lr-fig-gridline" />';
      g += '<line x1="1" y1="' + (i * 100) + '" x2="299" y2="' + (i * 100) + '" class="lr-fig-gridline" />';
    }
    (s.cells || []).forEach(function (cell, i) {
      var cx = (i % 3) * 100, cy = Math.floor(i / 3) * 100;
      g += '<g transform="translate(' + cx + ',' + cy + ')">' + (cell ? _inner(cell) : _qmark()) + '</g>';
    });
    return g;
  }

  function _inner(s) {
    switch (s.kind) {
      case 'glyph': return _glyph(s);
      case 'arrow': return _arrow(s);
      case 'die': return _die(s);
      case 'cube': return _cube(s);
      case 'qmark': return _qmark();
      case 'shape': return _shape(s);
      case 'compo': return _compo(s);
      case 'seg': return _seg(s);
      case 'paper': return _paper(s);
      case 'net': return _net(s);
      case 'die3': return _die3(s);
      case 'row': return (s.items || []).map(function (it, i) { return '<g transform="translate(' + (i * 100) + ',0)">' + _inner(it) + '</g>'; }).join('');
      default: return '';
    }
  }

  var FORM_NAMES = { circle: 'circle', dot: 'dot', square: 'square', diamond: 'diamond', triangle: 'triangle', pentagon: 'pentagon', hexagon: 'hexagon', semicircle: 'semicircle', star: 'star', lshape: 'L-shape', plus: 'plus sign' };
  function _formName(f) { return FORM_NAMES[f] || f; }
  function _orient(s) {
    var bits = [];
    if (s.flip === 'h') bits.push('mirrored left-to-right');
    if (s.flip === 'v') bits.push('reflected top-to-bottom');
    if (s.rot) bits.push('rotated ' + s.rot + '°');
    return bits.length ? ' ' + bits.join(', ') : '';
  }

  function describe(s) {
    if (!s || !s.kind) return '';
    switch (s.kind) {
      case 'glyph': return 'the character "' + s.text + '"' + (s.flip === 'h' ? ' mirrored left-to-right' : s.flip === 'v' ? ' reflected top-to-bottom' : s.rot ? ' rotated ' + s.rot + '°' : '');
      case 'arrow': return 'an arrow pointing at ' + (s.rot || 0) + '°';
      case 'die': return 'a die face showing ' + s.value;
      case 'cube': return 'a cube cut into ' + s.n + '×' + s.n + '×' + s.n + ' small cubes';
      case 'qmark': return 'a question mark (the missing figure)';
      case 'shape': return 'a ' + (s.fill === 'solid' ? 'shaded ' : s.fill === 'half' ? 'half-shaded ' : '') + _formName(s.form) + _orient(s);
      case 'compo': return 'a ' + (s.outer && s.outer.fill === 'solid' ? 'shaded ' : '') + _formName(s.outer && s.outer.form) +
        ((s.inner && s.inner.length) ? ' containing ' + s.inner.map(function (el) { return (el.fill === 'solid' ? 'a shaded ' : 'a ') + _formName(el.form) + ' at its ' + (el.at || 'centre'); }).join(' and ') : '') + _orient(s);
      case 'seg': return 'a line figure made of ' + (s.segs || []).length + ' segments' + _orient(s);
      case 'paper': return s.folded ? 'a sheet of paper folded ' + (Array.isArray(s.fold) ? s.fold.join(' then ') : s.fold) + ' with ' + (s.holes || []).length + ' punched hole(s)' : 'an unfolded sheet with ' + (s.holes || []).length + ' hole(s)';
      case 'net': return 'a cube net with faces labelled ' + (s.faces || []).join(', ');
      case 'die3': return 'a die showing ' + s.top + ' on top, ' + s.front + ' in front and ' + s.right + ' on the right';
      case 'grid3': return 'a 3×3 figure matrix' + ((s.cells || []).some(function (c) { return !c; }) ? ' with one cell missing' : '');
      case 'row': return 'a row of figures: ' + (s.items || []).map(describe).join(', ');
      default: return '';
    }
  }

  function render(spec) {
    if (!spec || !spec.kind) return '';
    if (spec.kind === 'grid3') {
      return '<figure class="lr-figure lr-figure-grid" role="img" aria-label="' + _esc(describe(spec)) + '">' +
        '<svg class="lr-figure-svg" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">' +
        _grid3(spec) + '</svg></figure>';
    }
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
