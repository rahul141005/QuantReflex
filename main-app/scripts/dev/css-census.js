/**
 * css-census.js — value→(count, line numbers) histograms for every design-lint metric
 * (UI Phase 1 final wave, W0). NOT part of npm test — produces the concrete worklists that
 * the W7 token burn-down executes, so replacements are line-anchored and reviewable.
 *
 * Usage: node scripts/dev/css-census.js [metric]   (metric ∈ radius|shadow|font|dur|ease|z|grad|hex|rgba; default all)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'style.css'), 'utf8');
const lines = raw.split('\n');

function scan(re, normalize, opts) {
  opts = opts || {};
  const map = new Map();
  lines.forEach((ln, i) => {
    if (opts.skipIconMasks && ln.indexOf('--qri-') !== -1) return;
    let m; const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(ln)) !== null) {
      let v = m[1].trim().replace(/\s+/g, ' ');
      if (normalize) v = normalize(v);
      if (/^var\(--[\w-]+\)$/.test(v)) continue;   // token refs aren't fragmentation
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(i + 1);
    }
  });
  return map;
}

function print(title, map, topN) {
  const entries = [...map.entries()].sort((x, y) => y[1].length - x[1].length);
  console.log('\n=== ' + title + ' — ' + entries.length + ' distinct ===');
  entries.slice(0, topN || 200).forEach(([v, ls]) => {
    const shown = ls.length > 12 ? ls.slice(0, 12).join(',') + ',…' : ls.join(',');
    console.log('  ' + String(ls.length).padStart(4) + '  ' + v + '   @' + shown);
  });
}

const METRICS = {
  radius: () => print('border-radius', scan(/border-radius:\s*([^;}]+)[;}]/g)),
  shadow: () => print('box-shadow', scan(/box-shadow:\s*([^;}]+)[;}]/g)),
  font:   () => print('font-size', scan(/font-size:\s*([^;}]+)[;}]/g)),
  dur:    () => {
    const map = new Map();
    lines.forEach((ln, i) => {
      const re = /(?:transition|animation)(?:-duration|-delay)?:\s*([^;}]+)[;}]/g;
      let m;
      while ((m = re.exec(ln)) !== null) {
        (m[1].match(/(?:\d*\.\d+|\d+)m?s\b/g) || []).forEach(d => {
          const v = d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
          const k = String(v);
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(i + 1);
        });
      }
    });
    print('durations (ms)', map);
  },
  ease:   () => print('easings', scan(/(?:transition|animation)[^;}]*?(cubic-bezier\([^)]*\)|ease-in-out|ease-in|ease-out|linear|ease|steps\([^)]*\))/g, v => v.replace(/\s+/g, ''))),
  z:      () => print('z-index', scan(/z-index:\s*([^;}]+)[;}]/g)),
  grad:   () => print('gradients', scan(/((?:linear|radial|conic)-gradient\([^;}]*\))/g), 80),
  hex:    () => print('hex colors (icon-mask lines excluded)', scan(/(#[0-9a-fA-F]{3,8})\b/g, v => v.toLowerCase(), { skipIconMasks: true }), 60),
  rgba:   () => print('rgb/rgba (icon-mask lines excluded)', scan(/(rgba?\([^)]*\))/g, null, { skipIconMasks: true }), 60)
};

const which = process.argv[2];
if (which && METRICS[which]) METRICS[which]();
else Object.values(METRICS).forEach(fn => fn());
