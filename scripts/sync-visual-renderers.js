#!/usr/bin/env node
/**
 * sync-visual-renderers.js (ADR-105)
 *
 * The DI chart renderer (DICharts) and the LR figure renderer (LRFigures) each have ONE canonical source under
 * shared/ui/, but shared/ is outside every app's Vercel deploy root (the ADR-099 P0), so each app must load a
 * BYTE-IDENTICAL local copy. This regenerates those copies from the canonical files — mirroring
 * scripts/sync-update-manager.js. Both renderers are PURE (spec → string) and dual-exported, so the copies are
 * literally identical files. Run after editing a canonical renderer; main-app/scripts/visual-renderers.check.js
 * (wired into `npm test`) fails the build if any copy drifts.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
/* canonical (shared/ui) → the app-local copies that must stay byte-identical. */
var MAP = [
  { canonical: 'shared/ui/di-charts.js', copies: ['main-app/js/ui/di-charts.js', 'super-admin-app/js/ui/di-charts.js'] },
  { canonical: 'shared/ui/lr-figures.js', copies: ['main-app/js/ui/lr-figures.js', 'super-admin-app/js/ui/lr-figures.js'] }
];

var n = 0, total = 0;
MAP.forEach(function (entry) {
  var src = fs.readFileSync(path.join(ROOT, entry.canonical), 'utf8');
  entry.copies.forEach(function (rel) {
    total++;
    var dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    var cur = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (cur !== src) { fs.writeFileSync(dest, src); n++; console.log('  synced ' + rel); }
    else console.log('  up-to-date ' + rel);
  });
});
console.log('sync-visual-renderers: ' + n + ' file(s) updated, ' + total + ' total.');
