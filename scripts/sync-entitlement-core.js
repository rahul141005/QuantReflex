#!/usr/bin/env node
/**
 * sync-entitlement-core.js (ADR-117)
 *
 * The Premium entitlement rule + grant arithmetic has ONE canonical source:
 *   main-app/data/entitlement-core.js
 * It lives inside main-app/ because that single physical file must be BOTH loaded by the browser
 * (<script> → window.QR_ENTITLEMENT) AND require()'d by the main-app serverless API — and
 * main-app/ is one Vercel deploy root, so that works.
 *
 * `functions/` (Firebase CLI uploads only functions/) and `super-admin-app/` (its own Vercel root)
 * CANNOT require across the boundary, so they get BYTE-IDENTICAL generated copies. Run this after
 * editing the canonical file; scripts/entitlement-core.check.js (wired into `npm test`) fails the
 * build if any copy drifts. Same convention as sync-update-manager.js / sync-visual-renderers.js.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var CANONICAL = path.join(ROOT, 'main-app/data/entitlement-core.js');
var COPIES = [
  /* Cloud Functions: the 6-hourly expiry sweep resolves with the same rule. */
  'functions/entitlement-core.js',
  /* Super-admin serverless (grant/revoke endpoints) — api/_lib is always in the function bundle. */
  'super-admin-app/api/_lib/entitlement-core.js',
  /* Super-admin browser (plan badges in the users list / drawer / payments views). */
  'super-admin-app/js/entitlement-core.js'
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
console.log('sync-entitlement-core: ' + n + ' file(s) updated, ' + COPIES.length + ' total.');
