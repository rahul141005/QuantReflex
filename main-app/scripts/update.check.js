/**
 * update.check.js (ADR-102) — lockstep guard for the unified in-app update system.
 *
 * QRUpdateManager has ONE canonical source (shared/update/update-manager.js) with a byte-identical
 * app-local copy in each app (shared/ is outside every deploy root — the ADR-099 P0). This check fails
 * the build if:
 *   - any app-local copy drifts from the canonical source;
 *   - an app's SW APP_VERSION and its index.html window.*_APP_VERSION are out of lockstep;
 *   - a SW's CACHE_NAME is not derived from APP_VERSION, or lacks the GET_VERSION handshake;
 *   - an app still registers the SW bare (bypassing QRUpdateManager.init).
 * Run scripts/sync-update-manager.js after editing the canonical file.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

var CANON = 'shared/update/update-manager.js';
var canonSrc = read(CANON);

/* Canonical module exports the state+actions API. */
(function () {
  var m = require(path.join(ROOT, CANON));
  ok('canonical module exports init', typeof m.init === 'function');
  ok('canonical module exports isUpdateAvailable', typeof m.isUpdateAvailable === 'function');
  ok('canonical module exports applyUpdate', typeof m.applyUpdate === 'function');
})();

var APPS = [
  { name: 'main-app', sw: 'main-app/service-worker.js', html: 'main-app/index.html',
    copy: 'main-app/js/services/update-manager.js', global: 'QR_APP_VERSION', prefix: 'qr-cache-' },
  { name: 'super-admin-app', sw: 'super-admin-app/sw.js', html: 'super-admin-app/index.html',
    copy: 'super-admin-app/js/ui/update-manager.js', global: 'QR_ADMIN_APP_VERSION', prefix: 'qr-admin-cache-',
    initFile: 'super-admin-app/index.html' },
  { name: 'coaching-admin-app', sw: 'coaching-admin-app/sw.js', html: 'coaching-admin-app/index.html',
    copy: 'coaching-admin-app/js/ui/update-manager.js', global: 'QR_COACH_APP_VERSION', prefix: 'qr-coach-cache-',
    initFile: 'coaching-admin-app/index.html' }
];
/* main-app calls QRUpdateManager.init from app.js (not index.html — where only a comment mentions it). */
APPS[0].initFile = 'main-app/js/app.js';

APPS.forEach(function (a) {
  var copySrc = read(a.copy);
  ok(a.name + ': update-manager.js copy is byte-identical to the canonical source', copySrc === canonSrc);

  var sw = read(a.sw);
  var html = read(a.html);

  var swVer = (sw.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
  var htmlVer = (html.match(new RegExp('window\\.' + a.global + "\\s*=\\s*'([^']+)'")) || [])[1];
  ok(a.name + ': SW defines APP_VERSION', !!swVer);
  ok(a.name + ': index.html defines window.' + a.global, !!htmlVer);
  ok(a.name + ': SW APP_VERSION === index.html window.' + a.global + ' (lockstep)', !!swVer && swVer === htmlVer);

  /* ADR-124 (audit S4-V2): the About panel ships a STATIC version line that settings.js overwrites at
     runtime — unless init throws, which is exactly the case it exists for. Wave S4 fixed it by editing
     the literal (v223 → v247) and added no guard, so it can silently re-stale on the next bump. It only
     survived v247 → v255 by hand. Lock it to APP_VERSION. main-app only: the admin apps have no
     equivalent node. */
  if (a.name === 'main-app') {
    var aboutVer = (html.match(/id="aboutVersionLine"[^>]*>Version\s+([^<\s]+)</) || [])[1];
    ok(a.name + ': index.html has the static #aboutVersionLine fallback', !!aboutVer);
    ok(a.name + ': #aboutVersionLine fallback === APP_VERSION (' + aboutVer + ' vs ' + swVer + ')',
      !!aboutVer && aboutVer === swVer);
  }

  ok(a.name + ": CACHE_NAME derived from APP_VERSION ('" + a.prefix + "' + APP_VERSION)",
    new RegExp("CACHE_NAME\\s*=\\s*'" + a.prefix.replace(/[-]/g, '\\-') + "'\\s*\\+\\s*APP_VERSION").test(sw));

  ok(a.name + ': SW answers the GET_VERSION handshake', /GET_VERSION/.test(sw) && /event\.ports\[0\]\.postMessage\(\{\s*version:\s*APP_VERSION/.test(sw));
  ok(a.name + ': SW handles SKIP_WAITING', /SKIP_WAITING/.test(sw) && /skipWaiting\(\)/.test(sw));

  /* Verify the REAL init call (in the app's bootstrap), not a passing mention in an index.html comment. */
  var initSrc = read(a.initFile);
  ok(a.name + ': initializes via QRUpdateManager.init (' + a.initFile + ')', /QRUpdateManager\.init\s*\(/.test(initSrc));
  /* The shared module registers via `nav.serviceWorker.register`; the app's own files must not register bare. */
  ok(a.name + ': no bare navigator.serviceWorker.register in app code (module owns registration)',
    !/navigator\.serviceWorker\.register\s*\(/.test(html) && !/navigator\.serviceWorker\.register\s*\(/.test(initSrc));
});

/* Admin apps: the deliberate waiting-worker policy (no skipWaiting on install) must hold. */
['super-admin-app/sw.js', 'coaching-admin-app/sw.js'].forEach(function (rel) {
  var sw = read(rel);
  var installBody = (sw.match(/addEventListener\('install'[\s\S]*?addEventListener\('message'/) || [''])[0];
  /* match the actual invocation (self.skipWaiting), not the "Do NOT call skipWaiting()" comment. */
  ok(rel + ': install does NOT call self.skipWaiting() (admin waiting-worker policy)', !/self\.skipWaiting/.test(installBody));
});

console.log('\nupdate.check.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
