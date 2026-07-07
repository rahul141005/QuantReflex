/**
 * auth-validators.check.js — lockstep guard for the shared auth-validation logic (ADR-099/107 cert).
 *
 * `shared/validation/auth-validators.js` is the canonical rule set, but `shared/` sits OUTSIDE each app's Vercel
 * deploy root, so a runtime `<script src="../shared/...">` returns index.html in prod (silent failure — auth.js
 * guards `typeof AuthValidators`). Each app that needs it therefore ships a SAME-ORIGIN copy. This check enforces:
 *   1. the copies' executable logic never drifts from the canonical (comments/whitespace ignored),
 *   2. no app still runtime-loads the cross-root `../shared/validation/auth-validators.js`,
 *   3. the coaching copy is precached in its service worker.
 * Mirrors the update-manager / visual-renderers lockstep guards.
 *
 *   node scripts/auth-validators.check.js   (run from main-app/)
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');   // repo root (main-app/scripts -> repo)
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* Strip block + line comments and collapse all whitespace, leaving only executable tokens. The validator source
   contains no `//` inside its regex/string literals, so line-comment stripping is safe here. */
function normalize(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '')       // full-line // comments
    .replace(/\s+/g, '');               // all whitespace
}

console.log('Auth-validators lockstep (ADR-099/107)\n');

var canonical = read('shared/validation/auth-validators.js');
var mainCopy = read('main-app/js/utils/auth-validators.js');
var coachCopy = read('coaching-admin-app/js/auth-validators.js');

var nCanon = normalize(canonical);
ok(nCanon.length > 200 && nCanon.indexOf('varAuthValidators=') !== -1, 'canonical parses to a non-trivial body');
ok(normalize(mainCopy) === nCanon, 'main-app copy logic === canonical (comments/whitespace ignored)');
ok(normalize(coachCopy) === nCanon, 'coaching-admin copy logic === canonical (comments/whitespace ignored)');

/* Every app must have SUCCESSFULLY defined AuthValidators from a same-origin path — never the cross-root ../shared
   one (ADR-099: that returns index.html in prod → silent validation skip). */
var CROSS_ROOT = /<script[^>]+src=["']\.\.\/shared\/validation\/auth-validators\.js["']/;
[['main-app/index.html'], ['coaching-admin-app/index.html'], ['super-admin-app/index.html']].forEach(function (a) {
  var html = read(a[0]);
  ok(!CROSS_ROOT.test(html), a[0] + ' does NOT runtime-load ../shared/validation/auth-validators.js');
});

/* main-app + coaching load their same-origin copy; coaching precaches it (offline). super-admin does not reference
   AuthValidators at all, so it must NOT load it (dead cross-root script removed). */
ok(/<script[^>]+src=["']js\/utils\/auth-validators\.js["']/.test(read('main-app/index.html')),
  'main-app loads its same-origin js/utils/auth-validators.js');
ok(/<script[^>]+src=["']js\/auth-validators\.js["']/.test(read('coaching-admin-app/index.html')),
  'coaching-admin loads its same-origin js/auth-validators.js');
ok(read('coaching-admin-app/sw.js').indexOf("'/js/auth-validators.js'") !== -1,
  'coaching-admin service worker precaches /js/auth-validators.js');
ok(read('super-admin-app/js/firebase/auth.js').indexOf('AuthValidators') === -1 &&
   !/auth-validators/.test(read('super-admin-app/index.html')),
  'super-admin neither references nor loads AuthValidators (dead cross-root script removed)');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
