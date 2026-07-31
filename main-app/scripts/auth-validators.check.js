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

/* ───────── Behavioural: EXECUTE all three copies against one truth table (ADR-129) ─────────
   Everything above is textual parity — it proves the three files AGREE, never that they are RIGHT. A rule
   edited identically in all three (or a canonical rewritten wholesale) sailed through green. These cases
   run the real validators and pin the rules themselves: the email shape, the four signup requirements, and
   the deliberate login/signup asymmetry (login accepts 6 chars, signup demands 8 + classes). */
var vm = require('vm');
function loadValidators(src, label) {
  var sandbox = {};
  vm.runInNewContext(src, sandbox, { filename: label });
  return sandbox.AuthValidators;
}
var COPIES = [
  ['canonical', canonical],
  ['main-app copy', mainCopy],
  ['coaching copy', coachCopy]
];
COPIES.forEach(function (entry) {
  var name = entry[0];
  var V = loadValidators(entry[1], name);
  function t(label, cond) { ok(cond, name + ' — ' + label); }

  t('exports the four validators',
    V && typeof V.validateEmail === 'function' && typeof V.validatePasswordStrength === 'function' &&
    typeof V.validateLogin === 'function' && typeof V.validateSignup === 'function');
  if (!V) return;

  /* validateEmail */
  [
    ['a@b.co', true], ['user.name+tag@sub.domain.org', true], ['  A@B.CO  ', true],
    ['', false], [null, false], [undefined, false], ['no-at-sign', false],
    ['a@b', false],            // bare host, no TLD
    ['a@@b.co', false], ['a b@c.co', false], ['@b.co', false], ['a@.co', false]
  ].forEach(function (c) {
    t('validateEmail(' + JSON.stringify(c[0]) + ') === ' + c[1], V.validateEmail(c[0]) === c[1]);
  });

  /* validatePasswordStrength — the four signup rules, asserted individually so weakening any one fails */
  t('strength: Abcdefg1 is valid', V.validatePasswordStrength('Abcdefg1').valid === true);
  t('strength: exposes exactly 4 rules', V.validatePasswordStrength('Abcdefg1').rules.length === 4);
  t('strength: a valid password reports no errors', V.validatePasswordStrength('Abcdefg1').errors.length === 0);
  t('strength: 7 chars fails the length rule',
    V.validatePasswordStrength('Abcdef1').errors.indexOf('At least 8 characters') !== -1);
  t('strength: no uppercase fails',
    V.validatePasswordStrength('abcdefg1').errors.indexOf('One uppercase letter') !== -1);
  t('strength: no lowercase fails',
    V.validatePasswordStrength('ABCDEFG1').errors.indexOf('One lowercase letter') !== -1);
  t('strength: no digit fails',
    V.validatePasswordStrength('Abcdefgh').errors.indexOf('One number') !== -1);
  t('strength: empty password fails all four rules', V.validatePasswordStrength('').errors.length === 4);
  t('strength: null password is handled, not thrown', V.validatePasswordStrength(null).valid === false);
  t('strength: reports EVERY failure at once (checklist UX contract)',
    V.validatePasswordStrength('abc').errors.length === 3);

  /* validateLogin — deliberately laxer than signup: 6 chars, no character classes */
  t('login: valid credentials return null', V.validateLogin('a@b.co', 'sixsix') === null);
  t('login: 6-char all-lowercase password is accepted (not signup rules)',
    V.validateLogin('a@b.co', 'abcdef') === null);
  t('login: 5-char password is rejected', typeof V.validateLogin('a@b.co', 'abcde') === 'string');
  t('login: bad email is rejected before the password', /email/i.test(V.validateLogin('nope', 'abcdef') || ''));
  t('login: missing password is rejected', typeof V.validateLogin('a@b.co', '') === 'string');

  /* validateSignup — stricter, and it must NOT leak which rule failed */
  t('signup: valid credentials return null', V.validateSignup('a@b.co', 'Abcdefg1') === null);
  t('signup: a login-legal weak password is rejected',
    V.validateSignup('a@b.co', 'abcdef') === 'Password does not meet requirements.');
  t('signup: bad email is rejected', /email/i.test(V.validateSignup('nope', 'Abcdefg1') || ''));
  t('signup: is strictly stronger than login',
    V.validateLogin('a@b.co', 'abcdef') === null && V.validateSignup('a@b.co', 'abcdef') !== null);
});

/* And the three executed copies must produce IDENTICAL verdicts on every case — behavioural parity on top
   of the textual parity above, so a copy that diverges only at runtime still fails. */
(function () {
  var Vs = COPIES.map(function (e) { return loadValidators(e[1], e[0]); });
  var EMAILS = ['a@b.co', 'x', '', 'A@B.CO', 'a@b', 'user+tag@a.b.co'];
  var PWDS = ['', 'abc', 'abcdef', 'Abcdefg1', 'ABCDEFG1', 'Abcdefgh', 'Abcdef1'];
  var same = true;
  EMAILS.forEach(function (e) {
    if (Vs[0].validateEmail(e) !== Vs[1].validateEmail(e) || Vs[0].validateEmail(e) !== Vs[2].validateEmail(e)) same = false;
    PWDS.forEach(function (w) {
      if (Vs[0].validateLogin(e, w) !== Vs[1].validateLogin(e, w) || Vs[0].validateLogin(e, w) !== Vs[2].validateLogin(e, w)) same = false;
      if (Vs[0].validateSignup(e, w) !== Vs[1].validateSignup(e, w) || Vs[0].validateSignup(e, w) !== Vs[2].validateSignup(e, w)) same = false;
    });
  });
  ok(same, 'all three copies return identical verdicts across ' + (EMAILS.length * (1 + PWDS.length * 2)) + ' executed cases');
})();

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
