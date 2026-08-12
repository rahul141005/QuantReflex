/**
 * assetlinks.check.js — Digital Asset Links readiness (ADR-146, Phase-4 WS7 preparation).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AND `assetlinks.json` DOES NOT
 *
 * A TWA is only a TWA if Chrome can verify the Digital Asset Link between the app and this origin.
 * When verification FAILS, Android does not error — it silently falls back to a Chrome Custom Tab.
 * That tab shows a URL bar and behaves like a normal browser, which means `QRPlatform` sees a
 * browser, the paywall offers **Razorpay inside what the user experiences as the Play app**, and the
 * listing is removed. It is the one unrecoverable Play-policy violation in this entire program.
 *
 * A fabricated `assetlinks.json` produces EXACTLY that outcome, and does it while looking correct in
 * review: a placeholder fingerprint is a well-formed 64-hex string that verifies against nothing. So
 * the file is not written until the real Play App Signing certificate exists. This check is the
 * guard that keeps a plausible-looking placeholder from ever becoming production.
 *
 * IT IS NOT A FAILURE THAT THE FILE IS ABSENT TODAY. Absence is the correct pre-WS7 state, and this
 * check reports it as such. What it refuses is a file that EXISTS but is fake, malformed, or carries
 * the upload-key fingerprint instead of the Play App Signing one.
 *
 *   node scripts/assetlinks.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var APP = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(m, c, d) { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }

console.log('Digital Asset Links readiness (WS7)\n');

/* ── 1. the origin must be able to SERVE the file, whether or not it exists yet ─────────────────
   This half is testable today and is the half that silently breaks: Vercel's SPA catch-all rewrites
   every non-API path to index.html, so `/.well-known/assetlinks.json` would return an HTML document
   with a 200 and Chrome would fail verification against content that looks fine in a browser. */
var vercel = JSON.parse(fs.readFileSync(path.join(APP, 'vercel.json'), 'utf8'));
var rewrites = vercel.rewrites || [];
ok('vercel.json has exactly one SPA catch-all rewrite', rewrites.length === 1, JSON.stringify(rewrites));

var source = rewrites[0] ? rewrites[0].source : '';
ok('★★ the SPA rewrite EXCLUDES /.well-known/ (or Chrome would verify against index.html)',
  source.indexOf('.well-known') !== -1, source);

/* Proven by execution, not by reading the pattern: the regex either matches these paths or it does
   not, and a subtly wrong negative lookahead is exactly the kind of thing that reads as correct. */
(function () {
  var re;
  try { re = new RegExp('^' + source + '$'); } catch (e) { ok('the rewrite source compiles as a regex', false, e.message); return; }
  ok('★ /.well-known/assetlinks.json is NOT rewritten', !re.test('/.well-known/assetlinks.json'));
  ok('★ /api/payment is still not rewritten', !re.test('/api/payment'));
  ok('the SPA catch-all still works for app routes', re.test('/') && re.test('/practice'));
})();

/* ── 2. the file itself — absent today, and STRICTLY validated the moment it exists ───────────── */
var CANDIDATES = ['.well-known/assetlinks.json', 'public/.well-known/assetlinks.json'];
var found = CANDIDATES.map(function (r) { return { rel: r, abs: path.join(APP, r) }; })
  .filter(function (c) { return fs.existsSync(c.abs); });

if (found.length === 0) {
  /* The correct pre-WS7 state. Reported, never silently skipped, so nobody reads a green run as
     "asset links are configured". */
  ok('assetlinks.json is absent — the correct state until Play App Signing exists', true);
  console.log('\n  NOTE: no assetlinks.json in this repo, by design.');
  console.log('  It cannot be written before the Play Console application exists, because the SHA-256');
  console.log('  fingerprint comes from Play App Signing. A placeholder would verify against nothing');
  console.log('  and silently degrade the TWA to a browser tab — see docs/BIBLE/PLAY_CONSOLE_HANDOFF.md.');
} else {
  var c = found[0];
  ok('exactly one assetlinks.json exists', found.length === 1, found.map(function (f) { return f.rel; }).join(', '));

  var raw = fs.readFileSync(c.abs, 'utf8');
  var doc = null;
  try { doc = JSON.parse(raw); } catch (e) { ok('assetlinks.json is valid JSON', false, e.message); }

  if (doc) {
    ok('assetlinks.json is a non-empty array (the format Google requires)', Array.isArray(doc) && doc.length > 0);
    var st = Array.isArray(doc) ? doc[0] : null;
    var target = (st && st.target) || {};

    ok('the statement delegates handle_all_urls',
      !!(st && Array.isArray(st.relation) && st.relation.indexOf('delegate_permission/common.handle_all_urls') !== -1));
    ok('the target namespace is android_app', target.namespace === 'android_app');

    /* Package name. Must match what the SERVER pins, or a purchase verified against one application
       is being asset-linked from another. */
    var pkg = target.package_name || '';
    ok('a package_name is present', !!pkg);
    ok('★ the package_name is not an obvious placeholder',
      !/example|placeholder|changeme|todo|your[._-]?app|com\.example/i.test(pkg), pkg);
    var envPkg = process.env.PLAY_PACKAGE_NAME;
    if (envPkg) {
      ok('★★ assetlinks package_name matches PLAY_PACKAGE_NAME (the value the server pins)',
        pkg === envPkg, pkg + ' vs ' + envPkg);
    } else {
      console.log('  NOTE: PLAY_PACKAGE_NAME is unset here, so the package_name could not be cross-checked.');
    }

    /* Fingerprints — the half that fails silently and expensively. */
    var fps = target.sha256_cert_fingerprints;
    ok('sha256_cert_fingerprints is a non-empty array', Array.isArray(fps) && fps.length > 0);

    var FP_SHAPE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
    (fps || []).forEach(function (fp, i) {
      var s = String(fp).toUpperCase();
      ok('★ fingerprint[' + i + '] is 32 colon-separated uppercase hex bytes', FP_SHAPE.test(s), String(fp));
      /* The three shapes a fabricated fingerprint actually takes. Each verifies against nothing. */
      ok('★★ fingerprint[' + i + '] is not all-zero / all-same (a fabricated value)',
        !/^((00:){31}00|(([0-9A-F]{2}):)\3{30}\3?)$/.test(s) && !/^(00:)+00$/.test(s), String(fp));
      ok('★★ fingerprint[' + i + '] is not a repeated or sequential filler pattern',
        !/^(AA:|BB:|FF:|11:|12:34:56)/.test(s), String(fp));
      ok('fingerprint[' + i + '] contains no placeholder text',
        !/x{4,}|placeholder|todo|fixme|your/i.test(String(fp)), String(fp));
    });

    console.log('\n  REMINDER: this must be the PLAY APP SIGNING certificate fingerprint');
    console.log('  (Play Console → Setup → App integrity → App signing key certificate),');
    console.log('  NOT your upload key. Play re-signs every build, so the upload key fingerprint');
    console.log('  verifies against nothing and degrades the TWA to a browser tab.');
    console.log('  Confirm with Google\'s Statement List Tester BEFORE the first internal-test upload.');
  }
}

/* ── 3. no fabricated Play identity anywhere in the repo ────────────────────────────────────────
   The broader rule the whole workstream rests on: nothing that only a Play Console can produce may
   be invented in source. Scoped to shipped code + config; docs must stay free to DESCRIBE these
   things, and the check scripts must stay free to test for them. */
(function () {
  var offenders = [];
  function walk(dir) {
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'scripts') return;
      var full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); return; }
      if (!/\.(js|json)$/.test(e.name)) return;
      /* assetlinks.json is THE legitimate home for a fingerprint and a package name — that is its
         entire purpose, and §2 above validates it far more strictly than this sweep could. The rule
         here is that those values appear NOWHERE ELSE. Without this exemption the check would reject
         a genuine, correct assetlinks.json, i.e. it would block the very work it exists to protect. */
      if (path.relative(APP, full).replace(/\\/g, '/').indexOf('.well-known/assetlinks.json') !== -1) return;
      var rel = path.relative(APP, full).replace(/\\/g, '/');
      var src = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      /* A real fingerprint or a service-account private key must never appear in source at all. */
      if (/([0-9A-F]{2}:){31}[0-9A-F]{2}/i.test(src)) offenders.push(rel + ' (fingerprint-shaped literal)');
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(src)) offenders.push(rel + ' (private key)');
      /* ADR-147: the package name is no longer forbidden — the Play Console application exists and
         `com.quantreflex.app` is its real, permanent id. What IS forbidden is a SECOND copy. It may
         live in exactly one module, so no deployment can ever address a different Google application
         than the one the ratchet below pins. */
      if (/['"]com\.(quantreflex|krisveltrix)[a-z0-9_.]*['"]/i.test(src) && rel !== 'services/playBillingService.js') {
        offenders.push(rel + ' (duplicate package identity — it belongs only in playBillingService.js)');
      }
    });
  }
  walk(APP);
  ok('★★ no fabricated Play identity, and no duplicate package identity, in shipped code',
    offenders.length === 0, offenders.join(', '));
})();

/* ── 4. ONE canonical package identity (ADR-147) ─────────────────────────────────────────────────
   `com.quantreflex.app` is the real Play Console application id and is immutable — Play binds an app
   to its package name permanently. The danger is no longer a fabricated value; it is DRIFT: a second
   literal somewhere, or documentation naming a different id than the code pins. A deployment that
   addressed the wrong Google application would fail every verification with a 404 that looks exactly
   like an invalid purchase token. */
(function () {
  var pbSrc = fs.readFileSync(path.join(APP, 'services/playBillingService.js'), 'utf8');
  var m = pbSrc.match(/var CANONICAL_PACKAGE_NAME = '([^']+)'/);
  ok('★ playBillingService declares exactly one canonical package name', !!m);
  if (!m) return;
  var pkg = m[1];

  ok('★★ the canonical package name is the real Play Console application id',
    pkg === 'com.quantreflex.app', pkg);
  ok('exactly one declaration of it exists in that module',
    (pbSrc.match(/CANONICAL_PACKAGE_NAME\s*=\s*'/g) || []).length === 1);
  ok('★ the environment may OVERRIDE it but the constant is the fallback (production needs no env var)',
    /process\.env\.PLAY_PACKAGE_NAME/.test(pbSrc) && /:\s*CANONICAL_PACKAGE_NAME;/.test(pbSrc));

  /* The env var name itself is a drift surface: docs once said GOOGLE_PLAY_PACKAGE_NAME while the
     code read PLAY_PACKAGE_NAME, which would have had an operator set a variable nothing reads. */
  var wrongEnvName = ['docs/BIBLE/PLAY_CONSOLE_HANDOFF.md', 'docs/BIBLE/PAYMENT_READINESS.md',
                      'docs/BIBLE/PAYMENT_ARCHITECTURE.md', 'docs/ENVIRONMENT_VARIABLES.md']
    .filter(function (d) {
      var p = path.join(APP, '..', d);
      return fs.existsSync(p) && /GOOGLE_PLAY_PACKAGE_NAME/.test(fs.readFileSync(p, 'utf8'));
    });
  ok('★★ no document names a package env var the code does not read',
    wrongEnvName.length === 0, wrongEnvName.join(', '));

  /* Documentation must name the SAME id the code pins. */
  ['docs/BIBLE/PLAY_CONSOLE_HANDOFF.md', 'docs/BIBLE/PAYMENT_ARCHITECTURE.md'].forEach(function (d) {
    var p = path.join(APP, '..', d);
    if (!fs.existsSync(p)) return;
    var txt = fs.readFileSync(p, 'utf8');
    var others = (txt.match(/com\.quantreflex[a-z0-9_.]*/gi) || []).filter(function (s) { return s !== pkg; });
    ok('★ ' + d + ' names no package id other than the canonical one', others.length === 0, others.join(', '));
  });
})();

/* ── 5. the TWA origin must be an origin this API actually serves (ADR-147) ───────────────────────
   Found the hard way: the handoff told the operator to run
   `bubblewrap init --manifest https://app.quantreflex.com/manifest.json`, and that host DOES NOT
   EXIST — it was inherited from a stale architecture document. Following it would have produced a TWA
   wrapping a dead origin, and asset-link verification against a domain that resolves to nothing.

   The authoritative list of real origins is the CORS allowlist the API enforces, so that is what this
   ratchets against: any quantreflex host named in the setup documentation must be one the server is
   actually willing to talk to. */
(function () {
  var mw = fs.readFileSync(path.join(APP, 'api/_lib/middleware.js'), 'utf8');
  var block = (mw.match(/_ALLOWED_ORIGINS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
  var allowed = (block.match(/https:\/\/[a-z0-9.-]+/g) || []);
  ok('★ the CORS allowlist is parseable and non-empty', allowed.length > 0, allowed.join(', '));

  var docs = ['docs/BIBLE/PLAY_CONSOLE_HANDOFF.md'];
  var strays = [];
  docs.forEach(function (d) {
    var p = path.join(APP, '..', d);
    if (!fs.existsSync(p)) return;
    (fs.readFileSync(p, 'utf8').match(/https:\/\/[a-z0-9.-]*quantreflex[a-z0-9.-]*/gi) || [])
      .forEach(function (u) {
        if (allowed.indexOf(u.toLowerCase()) === -1) strays.push(d + ' → ' + u);
      });
  });
  ok('★★ every quantreflex origin in the setup guide is one the API actually accepts',
    strays.length === 0, strays.join(', '));
})();

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
