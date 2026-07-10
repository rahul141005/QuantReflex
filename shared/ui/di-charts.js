/**
 * di-charts.js — the Data Interpretation chart renderer (ADR-074; multi-series extension ADR-078).
 *
 * Takes a chart SPEC from di-engine.js / di-set-engine.js and returns an HTML string the drill engine injects ABOVE
 * the question stem. Deliberately LIGHTWEIGHT and dependency-free (no Chart.js / D3 — "~2–3k users, don't
 * over-engineer"): inline SVG for bar/line/pie, a styled HTML table for tables. Responsive (viewBox + width:100%),
 * prints the underlying values ON the chart (DI is about reading numbers, not eyeballing), and is accessible
 * (role="img" + a data-rich aria-label).
 *
 * SERIES MODEL (ADR-078): a bar/line spec may carry EITHER a single `values:[]` (the original shape — rendered
 * byte-identically, so nothing old breaks) OR `series:[{name,values}]` for grouped/stacked bars and multi-line. This
 * is the seam that lets cross-series exam DI exist without a renderer rewrite; new chart kinds plug in as new draw
 * functions that reuse the shared scale/axis/legend helpers below.
 *
 * PURE (returns strings; no DOM mutation) → dual-exported and unit-tested by scripts/di-charts.check.js under node.
 *
 *   chart spec: { kind:'bar'|'line'|'pie'|'table', title, unit?, xLabel?, yLabel?,
 *                 labels:[], values:[]            (single-series bar/line/pie)
 *                 labels:[], series:[{name,values}], stacked?  (multi-series bar/line)
 *                 columns:[], rows:[[]]           (table) }
 */
(function (root) {
  'use strict';

  /* Series color is applied via a CSS class painting with `currentColor`, so the light/dark categorical palette lives
     in ONE place (css/style.css `:root` / `html.dark-mode` `--di-series-*`) and the renderer stays theme-unaware
     (VIS-3 single-series = one color, VIS-4 dark-tuned). Fixed slot order, never cycled per datum. */
  function _sc(i) { return 'di-series-' + (i % 6); }
  /* Evenly-spaced tick values 0→niceMax for the value axis (VIS-1). */
  function _ticks(max, count) { count = count || 4; var o = []; for (var i = 0; i <= count; i++) o.push(max * i / count); return o; }
  /* Horizontal gridlines + left value-tick labels for a bottom-baseline chart (VIS-1). Uses <line>/<text> only —
     never <rect> — so di-charts.check's exact rect counts stay intact. Drawn behind the marks. */
  function _vGrid(padL, plotW, baseY, plotH, max) {
    var t = _ticks(max), s = '';
    for (var i = 0; i < t.length; i++) {
      var y = baseY - (max ? (t[i] / max) * plotH : 0);
      if (i > 0) s += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (padL + plotW).toFixed(1) + '" y2="' + y.toFixed(1) + '" class="di-grid"/>';
      s += '<text x="' + (padL - 5) + '" y="' + (y + 3).toFixed(1) + '" class="di-axis-lbl di-tick" text-anchor="end">' + _fmt(t[i]) + '</text>';
    }
    return s;
  }
  /* Vertical gridlines + bottom value-tick labels for a horizontal-bar chart (its value axis runs left→right). */
  function _hGrid(padL, padT, plotW, plotH, max) {
    var t = _ticks(max), s = '', baseY = padT + plotH;
    for (var i = 0; i < t.length; i++) {
      var x = padL + (max ? (t[i] / max) * plotW : 0);
      if (i > 0) s += '<line x1="' + x.toFixed(1) + '" y1="' + padT + '" x2="' + x.toFixed(1) + '" y2="' + baseY.toFixed(1) + '" class="di-grid"/>';
      s += '<text x="' + x.toFixed(1) + '" y="' + (baseY + 10).toFixed(1) + '" class="di-axis-lbl di-tick" text-anchor="middle">' + _fmt(t[i]) + '</text>';
    }
    return s;
  }
  /* Rotated y-axis title (left) / centered x-axis title (bottom) — VIS-2. Only emitted when the spec provides them. */
  function _yTitle(spec, cy) { return spec.yLabel ? '<text x="9" y="' + cy.toFixed(1) + '" class="di-axis-title" text-anchor="middle" transform="rotate(-90 9 ' + cy.toFixed(1) + ')">' + _esc(_clip(spec.yLabel, 24)) + '</text>' : ''; }
  function _xTitle(label, cx, y) { return label ? '<text x="' + cx.toFixed(1) + '" y="' + y.toFixed(1) + '" class="di-axis-title" text-anchor="middle">' + _esc(_clip(label, 42)) + '</text>' : ''; }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _fmt(n) { return (Math.round(n * 100) / 100).toLocaleString('en-IN'); }
  /* Truncate a label with an ellipsis so it can't run past the fixed 320-wide viewBox and get clipped (ADR-086 P8). */
  function _clip(str, max) { str = String(str); return (max > 0 && str.length > max) ? str.slice(0, max - 1) + '…' : str; }
  /* Char budget for an axis label given the px slot it must fit (di-axis-lbl ≈ 4.6px/char). */
  function _lblMax(slotPx) { return Math.max(3, Math.floor(slotPx / 4.6)); }
  function _niceMax(m) { /* round the axis ceiling up to a clean step so gridlines read well */
    if (m <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log(m) / Math.LN10));
    var step = pow / 2;
    return Math.ceil(m / step) * step;
  }

  /* ── series model: normalize to [{name,values}]; single-series specs stay on the legacy path ── */
  function _isMulti(spec) { return !!(spec.series && spec.series.length > 1); }
  function _seriesOf(spec) {
    if (spec.series && spec.series.length) return spec.series;
    return [{ name: spec.yLabel || spec.metric || '', values: spec.values || [] }];
  }
  function _flatVals(series) { var o = []; for (var i = 0; i < series.length; i++) o = o.concat(series[i].values); return o; }
  function _stackMax(series, n) {
    var mx = 0;
    for (var i = 0; i < n; i++) { var s = 0; for (var k = 0; k < series.length; k++) s += (series[k].values[i] || 0); if (s > mx) mx = s; }
    return mx;
  }

  /* A compact legend strip (swatch + series name), wrapped to fit the plot width. Shared by every multi-series kind. */
  function _legend(series, x0, y0, maxX) {
    var s = '', x = x0, y = y0;
    for (var i = 0; i < series.length; i++) {
      var name = _esc(series[i].name || ('Series ' + (i + 1)));
      var w = 14 + name.length * 4.6 + 10;
      if (x + w > maxX && x > x0) { x = x0; y += 13; }
      s += '<rect x="' + x.toFixed(1) + '" y="' + (y - 7) + '" width="9" height="9" rx="2" class="' + _sc(i) + '" fill="currentColor"/>';
      s += '<text x="' + (x + 13).toFixed(1) + '" y="' + (y + 1) + '" class="di-axis-lbl" text-anchor="start">' + name + '</text>';
      x += w;
    }
    return { svg: s, bottomY: y };
  }

  function _ariaSummary(spec) {
    if (_isMulti(spec)) {
      var L = spec.labels || [], parts = spec.series.map(function (se) {
        return _esc(se.name || '') + ' — ' + L.map(function (l, i) { return _esc(l) + ': ' + _fmt(se.values[i]); }).join(', ');
      });
      return _esc(spec.kind) + ' chart (multi-series). ' + _esc(spec.title || '') + '. ' + parts.join('; ')
        + (spec.unit ? ' (' + _esc(spec.unit) + ')' : '') + '.';
    }
    var V = (spec.values || (spec.series && spec.series[0] && spec.series[0].values) || []);
    var pairs = (spec.labels || []).map(function (l, i) { return _esc(l) + ': ' + _fmt(V[i]); });
    return _esc(spec.kind) + ' chart. ' + _esc(spec.title || '') + '. ' + pairs.join(', ')
      + (spec.unit ? ' (' + _esc(spec.unit) + ')' : '') + '.';
  }
  function _figure(title, inner, aria) {
    return '<figure class="di-chart" role="img" aria-label="' + aria + '">' +
      (title ? '<figcaption class="di-chart-title">' + _esc(title) + '</figcaption>' : '') +
      inner + '</figure>';
  }

  /* ── HORIZONTAL BAR (single-series; common in Banking/SSC DI) ── */
  function _hbar(spec) {
    var L = spec.labels, V = spec.values || (spec.series && spec.series[0] && spec.series[0].values) || [], n = L.length;
    var valTitle = spec.yLabel || spec.xLabel || '';   /* horizontal bars: the metric labels the value (x) axis */
    var W = 320, H = 210, padL = 70, padR = 26, padT = 14, padB = 20 + (valTitle ? 12 : 0);
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = _niceMax(Math.max.apply(null, V));
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += _hGrid(padL, padT, plotW, plotH, max);
    s += '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + plotH) + '" class="di-axis"/>';
    s += _xTitle(valTitle, padL + plotW / 2, H - 2);
    for (var i = 0; i < n; i++) {
      var slot = plotH / n, bh = Math.min(22, slot * 0.6);
      var cy = padT + slot * (i + 0.5);
      var bw = max ? (V[i] / max) * plotW : 0;
      s += '<rect x="' + padL + '" y="' + (cy - bh / 2).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" class="di-series-0" fill="currentColor"/>';
      s += '<text x="' + (padL + bw + 3).toFixed(1) + '" y="' + (cy + 3).toFixed(1) + '" class="di-val" text-anchor="start">' + _fmt(V[i]) + '</text>';
      s += '<text x="' + (padL - 4) + '" y="' + (cy + 3).toFixed(1) + '" class="di-axis-lbl" text-anchor="end">' + _esc(_clip(L[i], _lblMax(padL - 6))) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── BAR (single-series — unchanged legacy path) ── */
  function _bar(spec) {
    if (_isMulti(spec)) return _barMulti(spec);
    if (spec.horizontal) return _hbar(spec);
    var L = spec.labels, V = spec.values || (spec.series && spec.series[0] && spec.series[0].values) || [], n = L.length;
    var W = 320, H = 210, padL = 42, padR = 10, padT = 22, padB = 34 + (spec.xLabel ? 12 : 0);
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(Math.max.apply(null, V));
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += _vGrid(padL, plotW, baseY, plotH, max);
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    s += _yTitle(spec, padT + plotH / 2) + _xTitle(spec.xLabel, padL + plotW / 2, H - 2);
    for (var i = 0; i < n; i++) {
      var slot = plotW / n, bw = Math.min(34, slot * 0.6);
      var cx = padL + slot * (i + 0.5);
      var bh = max ? (V[i] / max) * plotH : 0;
      var y = baseY - bh;
      s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" class="di-series-0" fill="currentColor"/>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" class="di-val" text-anchor="middle">' + _fmt(V[i]) + '</text>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(_clip(L[i], _lblMax(plotW / n))) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── BAR (multi-series: grouped, or stacked when spec.stacked) ── */
  function _barMulti(spec) {
    var L = spec.labels, series = spec.series, n = L.length, S = series.length;
    var stacked = !!spec.stacked;
    var W = 320, H = 234, padL = 42, padR = 10, padB = 34 + (spec.xLabel ? 12 : 0);
    var leg = _legend(series, padL, 12, W - padR);
    var padT = leg.bottomY + 12;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(stacked ? _stackMax(series, n) : Math.max.apply(null, _flatVals(series)));
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += leg.svg;
    s += _vGrid(padL, plotW, baseY, plotH, max);
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    s += _yTitle(spec, padT + plotH / 2) + _xTitle(spec.xLabel, padL + plotW / 2, H - 2);
    var slot = plotW / n;
    var showVals = stacked ? (n * S <= 18) : (n * S <= 12);
    for (var i = 0; i < n; i++) {
      var cx = padL + slot * (i + 0.5);
      if (stacked) {
        var bw = Math.min(34, slot * 0.6), yTop = baseY;
        for (var k = 0; k < S; k++) {
          var v = series[k].values[i] || 0, h = max ? (v / max) * plotH : 0;
          yTop -= h;
          s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" class="' + _sc(k) + '" fill="currentColor"/>';
          if (showVals && h >= 12) s += '<text x="' + cx.toFixed(1) + '" y="' + (yTop + h / 2 + 3).toFixed(1) + '" class="di-pie-pct" text-anchor="middle">' + _fmt(v) + '</text>';
        }
      } else {
        var inner = slot * 0.78, sub = inner / S, x0 = cx - inner / 2;
        for (var k2 = 0; k2 < S; k2++) {
          var v2 = series[k2].values[i] || 0, h2 = max ? (v2 / max) * plotH : 0, y2 = baseY - h2;
          var bx = x0 + sub * k2;
          s += '<rect x="' + bx.toFixed(1) + '" y="' + y2.toFixed(1) + '" width="' + (sub * 0.86).toFixed(1) + '" height="' + h2.toFixed(1) + '" rx="1.5" class="' + _sc(k2) + '" fill="currentColor"/>';
          if (showVals) s += '<text x="' + (bx + sub * 0.43).toFixed(1) + '" y="' + (y2 - 2).toFixed(1) + '" class="di-val" text-anchor="middle" style="font-size:7px">' + _fmt(v2) + '</text>';
        }
      }
      s += '<text x="' + cx.toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(_clip(L[i], _lblMax(plotW / n))) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── LINE (single-series — unchanged legacy path) ── */
  function _line(spec) {
    if (_isMulti(spec)) return _lineMulti(spec);
    var L = spec.labels, V = spec.values || (spec.series && spec.series[0] && spec.series[0].values) || [], n = L.length;
    var W = 320, H = 210, padL = 42, padR = 12, padT = 22, padB = 30 + (spec.xLabel ? 12 : 0);
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(Math.max.apply(null, V));
    function X(i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function Y(v) { return baseY - (max ? (v / max) * plotH : 0); }
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += _vGrid(padL, plotW, baseY, plotH, max);
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    s += _yTitle(spec, padT + plotH / 2) + _xTitle(spec.xLabel, padL + plotW / 2, H - 2);
    var pts = V.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    s += '<polyline points="' + pts + '" fill="none" class="di-series-0" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>';
    for (var i = 0; i < n; i++) {
      s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(V[i]).toFixed(1) + '" r="3" class="di-series-0" fill="currentColor"/>';
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (Y(V[i]) - 6).toFixed(1) + '" class="di-val" text-anchor="middle">' + _fmt(V[i]) + '</text>';
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(_clip(L[i], _lblMax(plotW / n))) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── LINE (multi-series: one polyline per series + legend) ── */
  function _lineMulti(spec) {
    var L = spec.labels, series = spec.series, n = L.length;
    var W = 320, H = 234, padL = 42, padR = 12, padB = 30 + (spec.xLabel ? 12 : 0);
    var leg = _legend(series, padL, 12, W - padR);
    var padT = leg.bottomY + 12;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(Math.max.apply(null, _flatVals(series)));
    function X(i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function Y(v) { return baseY - (max ? (v / max) * plotH : 0); }
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += leg.svg;
    s += _vGrid(padL, plotW, baseY, plotH, max);
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    s += _yTitle(spec, padT + plotH / 2) + _xTitle(spec.xLabel, padL + plotW / 2, H - 2);
    var showVals = series.length * n <= 14;
    for (var k = 0; k < series.length; k++) {
      var V = series[k].values, sk = _sc(k);
      var pts = V.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      s += '<polyline points="' + pts + '" fill="none" class="' + sk + '" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
      for (var i = 0; i < n; i++) {
        s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(V[i]).toFixed(1) + '" r="2.6" class="' + sk + '" fill="currentColor"/>';
        if (showVals) s += '<text x="' + X(i).toFixed(1) + '" y="' + (Y(V[i]) - 5).toFixed(1) + '" class="di-val" text-anchor="middle" style="font-size:7px">' + _fmt(V[i]) + '</text>';
      }
    }
    for (var j = 0; j < n; j++) s += '<text x="' + X(j).toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(_clip(L[j], _lblMax(plotW / n))) + '</text>';
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── PIE (single-series only — pie is inherently one series) ── */
  function _pie(spec) {
    var L = spec.labels, V = spec.values, n = L.length, total = V.reduce(function (a, b) { return a + b; }, 0) || 1;
    var W = 320, H = 200, cx = 92, cy = 100, r = 78;
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    var ang = -Math.PI / 2; /* start at 12 o'clock */
    for (var i = 0; i < n; i++) {
      var frac = V[i] / total, a2 = ang + frac * 2 * Math.PI;
      var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      var large = frac > 0.5 ? 1 : 0, cls = _sc(i);
      if (n === 1) { s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="' + cls + '" fill="currentColor"/>'; }
      else { s += '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" class="' + cls + '" fill="currentColor"/>'; }
      var mid = ang + frac * Math.PI, lx = cx + r * 0.62 * Math.cos(mid), ly = cy + r * 0.62 * Math.sin(mid);
      if (frac > 0.06) s += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" class="di-pie-pct" text-anchor="middle" dominant-baseline="middle">' + _fmt(Math.round(frac * 1000) / 10) + '%</text>';
      ang = a2;
    }
    /* legend (right side): swatch + label + value */
    var lx0 = 188, ly0 = 30;
    for (var j = 0; j < n; j++) {
      var yy = ly0 + j * 20;
      s += '<rect x="' + lx0 + '" y="' + (yy - 8) + '" width="11" height="11" rx="2" class="' + _sc(j) + '" fill="currentColor"/>';
      /* Keep the whole legend entry inside the ~115px column (x≈205→320): the value always shows in full; the label
         yields whatever room is left so a large value can never clip at the viewBox edge (ADR-088 A8). */
      var _val = _fmt(V[j]);
      var _lblBudget = Math.max(4, 24 - String(_val).length - 3);
      s += '<text x="' + (lx0 + 17) + '" y="' + (yy + 1) + '" class="di-axis-lbl" text-anchor="start">' + _esc(_clip(L[j], _lblBudget)) + ' — ' + _val + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── TABLE (already multi-column; supports a header row of N columns) ── */
  function _table(spec) {
    var cols = spec.columns || [], rows = spec.rows || [];
    var s = '<div class="di-table-wrap">';
    s += '<table class="di-table"><thead><tr>';
    cols.forEach(function (c, i) { s += '<th' + (i === 0 ? '' : ' class="num"') + '>' + _esc(c) + '</th>'; });
    s += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      s += '<tr>';
      r.forEach(function (cell, i) { s += '<td' + (i === 0 ? ' class="row-h"' : ' class="num"') + '>' + _esc(cell) + '</td>'; });
      s += '</tr>';
    });
    s += '</tbody></table></div>';
    var aria = 'Data table. ' + _esc(spec.title || '') + '. ' + rows.map(function (r) { return r.map(_esc).join(' '); }).join('; ') + '.';
    return _figure(spec.title, s, aria);
  }

  function render(spec) {
    if (!spec || !spec.kind) return '';
    switch (spec.kind) {
      case 'bar': return _bar(spec);
      case 'line': return _line(spec);
      case 'pie': return _pie(spec);
      case 'table': return _table(spec);
      default: return '';
    }
  }

  /* A compact TEXT summary of a chart's data — prepended to the question when opening AI Explain, so the model can
     ground a DI explanation (the chart pixels aren't sent to the server; these numbers are). (ADR-074/078) */
  function describe(spec) {
    if (!spec || !spec.kind) return '';
    if (spec.kind === 'table') {
      var head = (spec.columns || []).join(' | ');
      var body = (spec.rows || []).map(function (r) { return r.join(' = '); }).join('; ');
      return 'Data table — ' + (spec.title || '') + ' [' + head + ']: ' + body + '.';
    }
    if (_isMulti(spec)) {
      var L = spec.labels || [];
      var parts = spec.series.map(function (se) {
        return (se.name || 'series') + ' [' + L.map(function (l, i) { return l + ' = ' + _fmt(se.values[i]); }).join(', ') + ']';
      });
      return 'Data (' + spec.kind + ' chart' + (spec.title ? ', ' + spec.title : '') + (spec.unit ? ', in ' + spec.unit : '')
        + ', multi-series): ' + parts.join('; ') + '.';
    }
    var V = spec.values || (spec.series && spec.series[0] && spec.series[0].values) || [];
    var pairs = (spec.labels || []).map(function (l, i) { return l + ' = ' + _fmt(V[i]); }).join(', ');
    return 'Data (' + spec.kind + ' chart' + (spec.title ? ', ' + spec.title : '') + (spec.unit ? ', in ' + spec.unit : '') + '): ' + pairs + '.';
  }

  var DICharts = { render: render, describe: describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = DICharts;
  if (typeof window !== 'undefined') window.DICharts = DICharts;
  else root.DICharts = DICharts;
})(this);
