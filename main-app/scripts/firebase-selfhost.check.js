/**
 * firebase-selfhost.check.js — the Firebase SDK stays self-hosted and precached (ADR-150).
 *
 * WHY THIS RATCHET EXISTS
 * QuantReflex cannot boot without the Firebase SDK. While it was loaded from www.gstatic.com, a cold
 * start depended on a third-party CDN — and CDN blocking is common on exactly the school and
 * coaching-centre networks this product targets. The failure was total and was confirmed by
 * execution: a headless boot with the CDN unreachable produced four RESOURCE_FAIL entries and
 * `[AuthGate] Firebase unavailable.`, after which nothing worked.
 *
 * The regression this guards is quiet and easy to make: someone adds a fifth Firebase module, copies
 * a gstatic <script> tag from the docs, and the CDN dependency is silently back — on a path that only
 * fails for users whose network blocks it, which is nobody on the developer's machine.
 *
 *   node scripts/firebase-selfhost.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var APP = path.join(__dirname, '..');
var R = function (p) { return fs.readFileSync(path.join(APP, p), 'utf8'); };

var pass = 0, fail = 0;
function ok(m, c, d) { if (c) pass++; else { fail++; console.log('  x ' + m + (d ? ' - ' + d : '')); } }

console.log('Self-hosted Firebase SDK (ADR-150)\n');

var BUNDLES = [
  'firebase-app-compat.js',
  'firebase-auth-compat.js',
  'firebase-firestore-compat.js',
  'firebase-messaging-compat.js'
];

/* 1. the files exist and are real bundles, not truncated downloads or error pages */
BUNDLES.forEach(function (b) {
  var rel = 'vendor/firebase/' + b;
  var abs = path.join(APP, rel);
  var exists = fs.existsSync(abs);
  ok('** ' + rel + ' is present', exists);
  if (!exists) return;
  var st = fs.statSync(abs);
  /* An HTML error page or a truncated download would be far smaller than any real bundle. */
  ok(rel + ' is a plausible bundle size (>20KB)', st.size > 20000, st.size + ' bytes');
  var head = fs.readFileSync(abs, 'utf8').slice(0, 200);
  ok(rel + ' is a UMD bundle, not an HTML error page',
    head.indexOf('!function') === 0 && head.indexOf('<') !== 0);
});

/* 2. index.html loads them from OUR origin, and not from the CDN */
var idx = R('index.html');
ok('** index.html no longer loads Firebase from gstatic',
  !/<script[^>]+src="https:\/\/www\.gstatic\.com\/firebasejs/.test(idx),
  (idx.match(/https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*/) || [])[0] || '');
BUNDLES.forEach(function (b) {
  ok('index.html loads vendor/firebase/' + b,
    idx.indexOf('src="vendor/firebase/' + b + '"') !== -1);
});
/* Load order is not optional: every other compat bundle requires app-compat to have run first. */
var iApp = idx.indexOf('vendor/firebase/firebase-app-compat.js');
['firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-messaging-compat.js'].forEach(function (b) {
  ok('** firebase-app-compat.js loads BEFORE ' + b + ' (the others depend on it)',
    iApp !== -1 && iApp < idx.indexOf('vendor/firebase/' + b));
});

/* 3. the service worker precaches them — the whole point was to survive a hostile network */
var sw = R('service-worker.js');
var assetsBlock = (sw.match(/var ASSETS = \[([\s\S]*?)\n\];/) || [])[1] || '';
ok('the service worker ASSETS list is parseable', assetsBlock.length > 0);
BUNDLES.forEach(function (b) {
  ok('** the service worker PRECACHES ' + b + ' (offline boot depends on it)',
    assetsBlock.indexOf('vendor/firebase/' + b) !== -1);
});

/* 4. nothing else in shipped code reaches for the CDN */
(function () {
  var offenders = [];
  function walk(dir) {
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'scripts' || e.name === 'vendor') return;
      var full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); return; }
      if (!/\.(js|html)$/.test(e.name)) return;
      var rel = path.relative(APP, full).replace(/\\/g, '/');
      var src = fs.readFileSync(full, 'utf8');
      /* service-worker.js keeps the gstatic prefix on PURPOSE, so a browser still holding a stale
         cached shell that references the old URLs keeps caching its SDK through the changeover. That
         is a runtime-caching rule, not a load, so it is exempt. */
      if (rel === 'service-worker.js') return;
      if (/gstatic\.com\/firebasejs/.test(src)) offenders.push(rel);
    });
  }
  walk(APP);
  ok('** no shipped file loads the Firebase SDK from the CDN any more',
    offenders.length === 0, offenders.join(', '));
})();

/* 5. the provenance record exists and names the pinned version */
var readme = fs.existsSync(path.join(APP, 'vendor/firebase/README.md')) ? R('vendor/firebase/README.md') : '';
ok('vendor/firebase/README.md records where these came from', readme.length > 0);
ok('* the README pins the same SDK version the bundles are',
  /10\.12\.2/.test(readme) && /10\.12\.2/.test(R('vendor/firebase/firebase-app-compat.js').slice(0, 400000)));

console.log('\n------------------------------');
console.log((fail === 0 ? 'ALL PASSED' : 'FAILURES') + ' - ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
