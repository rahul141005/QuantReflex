#!/usr/bin/env node
/**
 * make-assetlinks.js — write .well-known/assetlinks.json from a REAL Play App Signing fingerprint.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A GENERATOR AND NOT A HAND-EDITED FILE
 *
 * A TWA is only a TWA while Chrome can verify the Digital Asset Link between the Android app and this
 * origin. When verification fails Android does not error — it silently falls back to a Chrome Custom
 * Tab with a URL bar. QRPlatform then sees a browser, the paywall offers Razorpay inside what the user
 * experiences as the Play app, and that is the one unrecoverable Play-policy violation in this program.
 *
 * A wrong fingerprint is indistinguishable from a right one by eye: both are 64 hex characters. So the
 * value is never typed into source by hand and never invented. It is passed in, validated here, and
 * then re-validated by scripts/assetlinks.check.js.
 *
 * USAGE
 *   node scripts/make-assetlinks.js <SHA256_FINGERPRINT>
 *
 * The fingerprint comes from:
 *   Play Console → your app → Setup → App integrity → App signing key certificate → SHA-256
 *
 * It is NOT your upload key. Play re-signs every build with the app signing key, so an upload-key
 * fingerprint verifies against nothing. If the page shows two certificates, you want the one under
 * "App signing key certificate", not "Upload key certificate".
 *
 * Colons optional, case-insensitive — both of these are accepted and normalised:
 *   A1:B2:C3:...        a1b2c3...
 */
'use strict';
var fs = require('fs');
var path = require('path');

var APP = path.join(__dirname, '..');
var OUT_DIR = path.join(APP, '.well-known');
var OUT = path.join(OUT_DIR, 'assetlinks.json');

function die(msg, detail) {
  console.error('\n  ✗ ' + msg);
  if (detail) console.error('    ' + detail);
  console.error('');
  process.exit(1);
}

/* ── the package name is READ FROM SOURCE, never retyped ───────────────────────────────────────
   Play binds an application id permanently. If assetlinks named a different package than the server
   pins when it verifies a purchase, you would be asset-linking one app and validating another. */
var pbSrc = fs.readFileSync(path.join(APP, 'services/playBillingService.js'), 'utf8');
var pkgMatch = pbSrc.match(/var CANONICAL_PACKAGE_NAME = '([^']+)'/);
if (!pkgMatch) die('Could not read CANONICAL_PACKAGE_NAME from services/playBillingService.js.');
var PACKAGE = pkgMatch[1];

var raw = process.argv[2];
if (!raw) {
  console.error('');
  console.error('  Usage: node scripts/make-assetlinks.js <SHA256_FINGERPRINT>');
  console.error('');
  console.error('  Get it from: Play Console → Setup → App integrity → App signing key certificate → SHA-256');
  console.error('  NOT the upload key certificate — Play re-signs every build, so the upload key');
  console.error('  fingerprint verifies against nothing and silently degrades the TWA to a browser tab.');
  console.error('');
  process.exit(1);
}

/* ── normalise ────────────────────────────────────────────────────────────────────────────────── */
/* Strip the wrappers a real paste actually arrives in: the <ANGLE BRACKETS> from this script's own
   usage line, surrounding quotes, and any colons/whitespace. Everything else must be hex. */
var hex = String(raw).trim()
  .replace(/^[<"']+/, '').replace(/[>"']+$/, '')
  .replace(/[\s:]/g, '')
  .toUpperCase();
if (!/^[0-9A-F]+$/.test(hex)) die('That is not hexadecimal.', 'Got: ' + raw);
if (hex.length !== 64) {
  die('A SHA-256 fingerprint is 64 hex characters (32 bytes). Got ' + hex.length + '.',
    hex.length === 40 ? 'A 40-character value is SHA-1. Play needs the SHA-256 row.' : 'Check you copied the whole value.');
}
var fingerprint = hex.match(/.{2}/g).join(':');

/* ── refuse the shapes a fabricated fingerprint actually takes ─────────────────────────────────
   These mirror scripts/assetlinks.check.js so a bad value is rejected here, at the point of entry,
   with an explanation — rather than three steps later by a check that can only say "invalid". */
if (/^(00:)+00$/.test(fingerprint)) die('That fingerprint is all zeros — it verifies against nothing.');
var firstByte = fingerprint.slice(0, 2);
if (fingerprint.split(':').every(function (b) { return b === firstByte; })) {
  die('Every byte of that fingerprint is identical — that is a placeholder, not a certificate.');
}
if (/^(AA:|BB:|FF:|11:|12:34:56)/.test(fingerprint)) {
  die('That looks like filler (' + fingerprint.slice(0, 8) + '…), not a real certificate.');
}

/* ── write ────────────────────────────────────────────────────────────────────────────────────── */
var statement = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: PACKAGE,
    sha256_cert_fingerprints: [fingerprint]
  }
}];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(statement, null, 2) + '\n');

console.log('\n  ✓ wrote ' + path.relative(APP, OUT));
console.log('    package_name : ' + PACKAGE + '   (read from services/playBillingService.js)');
console.log('    fingerprint  : ' + fingerprint);
console.log('');
console.log('  NEXT, IN ORDER:');
console.log('    1. node scripts/assetlinks.check.js      (strict re-validation)');
console.log('    2. deploy, then confirm it is served as JSON — not the SPA shell:');
console.log('         curl -s https://<your-domain>/.well-known/assetlinks.json');
console.log('       It must start with "[" . If you get HTML, the Vercel rewrite is swallowing it.');
console.log('    3. Google Statement List Tester, BEFORE your first internal-test upload:');
console.log('         https://developers.google.com/digital-asset-links/tools/generator');
console.log('    4. Install the TWA and confirm there is NO URL bar. A URL bar means verification');
console.log('       failed and the app is a browser tab — do not ship it in that state.');
console.log('');
