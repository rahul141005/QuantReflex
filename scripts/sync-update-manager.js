#!/usr/bin/env node
/**
 * sync-update-manager.js (ADR-102)
 *
 * QRUpdateManager has ONE canonical source (shared/update/update-manager.js), but shared/ is outside
 * every app's Vercel deploy root (the ADR-099 P0), so each app must load a BYTE-IDENTICAL local copy.
 * This script regenerates those copies from the canonical file. Run it after editing the canonical
 * source; scripts/update.check.js (wired into `npm test`) fails the build if the copies ever drift.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var CANONICAL = path.join(ROOT, 'shared/update/update-manager.js');
var COPIES = [
  'main-app/js/services/update-manager.js',
  'super-admin-app/js/ui/update-manager.js',
  'coaching-admin-app/js/ui/update-manager.js'
];

var src = fs.readFileSync(CANONICAL, 'utf8');
var n = 0;
COPIES.forEach(function (rel) {
  var dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  var cur = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
  if (cur !== src) { fs.writeFileSync(dest, src); n++; console.log('  synced ' + rel); }
  else console.log('  up-to-date ' + rel);
});
console.log('sync-update-manager: ' + n + ' file(s) updated, ' + COPIES.length + ' total.');
