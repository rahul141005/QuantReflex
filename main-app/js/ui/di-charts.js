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

  var PALETTE = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _fmt(n) { return (Math.round(n * 100) / 100).toLocaleString('en-IN'); }
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
      s += '<rect x="' + x.toFixed(1) + '" y="' + (y - 7) + '" width="9" height="9" rx="2" fill="' + PALETTE[i % PALETTE.length] + '"/>';
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

  /* ── BAR (single-series — unchanged legacy path) ── */
  function _bar(spec) {
    if (_isMulti(spec)) return _barMulti(spec);
    var L = spec.labels, V = spec.values || (spec.series && spec.series[0] && spec.series[0].values) || [], n = L.length;
    var W = 320, H = 210, padL = 30, padR = 8, padT = 22, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(Math.max.apply(null, V));
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    for (var i = 0; i < n; i++) {
      var slot = plotW / n, bw = Math.min(34, slot * 0.6);
      var cx = padL + slot * (i + 0.5);
      var bh = max ? (V[i] / max) * plotH : 0;
      var y = baseY - bh, fill = PALETTE[i % PALETTE.length];
      s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + fill + '"/>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" class="di-val" text-anchor="middle">' + _fmt(V[i]) + '</text>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(L[i]) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── BAR (multi-series: grouped, or stacked when spec.stacked) ── */
  function _barMulti(spec) {
    var L = spec.labels, series = spec.series, n = L.length, S = series.length;
    var stacked = !!spec.stacked;
    var W = 320, H = 234, padL = 30, padR = 8, padB = 34;
    var leg = _legend(series, padL, 12, W - padR);
    var padT = leg.bottomY + 12;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(stacked ? _stackMax(series, n) : Math.max.apply(null, _flatVals(series)));
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += leg.svg;
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    var slot = plotW / n;
    var showVals = stacked ? (n * S <= 18) : (n * S <= 12);
    for (var i = 0; i < n; i++) {
      var cx = padL + slot * (i + 0.5);
      if (stacked) {
        var bw = Math.min(34, slot * 0.6), yTop = baseY;
        for (var k = 0; k < S; k++) {
          var v = series[k].values[i] || 0, h = max ? (v / max) * plotH : 0;
          yTop -= h;
          s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + PALETTE[k % PALETTE.length] + '"/>';
          if (showVals && h >= 12) s += '<text x="' + cx.toFixed(1) + '" y="' + (yTop + h / 2 + 3).toFixed(1) + '" class="di-pie-pct" text-anchor="middle">' + _fmt(v) + '</text>';
        }
      } else {
        var inner = slot * 0.78, sub = inner / S, x0 = cx - inner / 2;
        for (var k2 = 0; k2 < S; k2++) {
          var v2 = series[k2].values[i] || 0, h2 = max ? (v2 / max) * plotH : 0, y2 = baseY - h2;
          var bx = x0 + sub * k2;
          s += '<rect x="' + bx.toFixed(1) + '" y="' + y2.toFixed(1) + '" width="' + (sub * 0.86).toFixed(1) + '" height="' + h2.toFixed(1) + '" rx="1.5" fill="' + PALETTE[k2 % PALETTE.length] + '"/>';
          if (showVals) s += '<text x="' + (bx + sub * 0.43).toFixed(1) + '" y="' + (y2 - 2).toFixed(1) + '" class="di-val" text-anchor="middle" style="font-size:7px">' + _fmt(v2) + '</text>';
        }
      }
      s += '<text x="' + cx.toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(L[i]) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── LINE (single-series — unchanged legacy path) ── */
  function _line(spec) {
    if (_isMulti(spec)) return _lineMulti(spec);
    var L = spec.labels, V = spec.values || (spec.series && spec.series[0] && spec.series[0].values) || [], n = L.length;
    var W = 320, H = 210, padL = 30, padR = 10, padT = 22, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(Math.max.apply(null, V));
    function X(i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function Y(v) { return baseY - (max ? (v / max) * plotH : 0); }
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    var pts = V.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    s += '<polyline points="' + pts + '" fill="none" stroke="' + PALETTE[0] + '" stroke-width="2.2" stroke-linejoin="round"/>';
    for (var i = 0; i < n; i++) {
      s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(V[i]).toFixed(1) + '" r="3" fill="' + PALETTE[0] + '"/>';
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (Y(V[i]) - 6).toFixed(1) + '" class="di-val" text-anchor="middle">' + _fmt(V[i]) + '</text>';
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(L[i]) + '</text>';
    }
    s += '</svg>';
    return _figure(spec.title, s, _ariaSummary(spec));
  }

  /* ── LINE (multi-series: one polyline per series + legend) ── */
  function _lineMulti(spec) {
    var L = spec.labels, series = spec.series, n = L.length;
    var W = 320, H = 234, padL = 30, padR = 10, padB = 30;
    var leg = _legend(series, padL, 12, W - padR);
    var padT = leg.bottomY + 12;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var max = _niceMax(Math.max.apply(null, _flatVals(series)));
    function X(i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function Y(v) { return baseY - (max ? (v / max) * plotH : 0); }
    var s = '<svg class="di-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">';
    s += leg.svg;
    s += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (padL + plotW) + '" y2="' + baseY + '" class="di-axis"/>';
    var showVals = series.length * n <= 14;
    for (var k = 0; k < series.length; k++) {
      var V = series[k].values, col = PALETTE[k % PALETTE.length];
      var pts = V.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      s += '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>';
      for (var i = 0; i < n; i++) {
        s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(V[i]).toFixed(1) + '" r="2.6" fill="' + col + '"/>';
        if (showVals) s += '<text x="' + X(i).toFixed(1) + '" y="' + (Y(V[i]) - 5).toFixed(1) + '" class="di-val" text-anchor="middle" style="font-size:7px">' + _fmt(V[i]) + '</text>';
      }
    }
    for (var j = 0; j < n; j++) s += '<text x="' + X(j).toFixed(1) + '" y="' + (baseY + 11) + '" class="di-axis-lbl" text-anchor="middle">' + _esc(L[j]) + '</text>';
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
      var large = frac > 0.5 ? 1 : 0, fill = PALETTE[i % PALETTE.length];
      if (n === 1) { s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>'; }
      else { s += '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="' + fill + '"/>'; }
      var mid = ang + frac * Math.PI, lx = cx + r * 0.62 * Math.cos(mid), ly = cy + r * 0.62 * Math.sin(mid);
      if (frac > 0.06) s += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" class="di-pie-pct" text-anchor="middle" dominant-baseline="middle">' + _fmt(Math.round(frac * 1000) / 10) + '%</text>';
      ang = a2;
    }
    /* legend (right side): swatch + label + value */
    var lx0 = 188, ly0 = 30;
    for (var j = 0; j < n; j++) {
      var yy = ly0 + j * 20;
      s += '<rect x="' + lx0 + '" y="' + (yy - 8) + '" width="11" height="11" rx="2" fill="' + PALETTE[j % PALETTE.length] + '"/>';
      s += '<text x="' + (lx0 + 17) + '" y="' + (yy + 1) + '" class="di-axis-lbl" text-anchor="start">' + _esc(L[j]) + ' — ' + _fmt(V[j]) + '</text>';
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
