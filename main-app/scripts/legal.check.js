/**
 * legal.check.js — the three published legal pages, and the plumbing that makes them reachable
 * (ADR-149).
 *
 * WHY THIS EXISTS
 * Google Play will not publish an app that collects accounts without (a) a working privacy-policy URL
 * and (b) a publicly reachable account-deletion URL. QuantReflex had neither: there was no privacy
 * policy anywhere in the repository, and the paywall's own footer linked to `#terms` and `#privacy` —
 * two routes that do not exist, so both links were dead inside the checkout sheet.
 *
 * THE FAILURE THIS GUARDS IS SILENT, WHICH IS WHY IT IS A CHECK AND NOT A README NOTE
 * Vercel's SPA catch-all rewrites every unmatched path to index.html. A legal page that is not
 * excluded from that rewrite returns HTTP 200 with the APP SHELL — so the URL looks alive in a
 * browser, passes a casual click-through, and shows Google's reviewer an app instead of a policy.
 * That is the same trap `assetlinks.check.js` exists to catch for Digital Asset Links, and it is
 * caught the same way: by executing the rewrite pattern rather than reading it.
 *
 *   node scripts/legal.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var APP = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(m, c, d) { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }

console.log('Legal pages: privacy, terms, account deletion (ADR-149)\n');

var PAGES = [
  { rel: 'legal/privacy.html', title: /privacy/i },
  { rel: 'legal/terms.html', title: /terms/i },
  { rel: 'legal/delete-account.html', title: /delete/i }
];

/* ── 1. the pages exist, are real documents, and contain no unfilled placeholder ───────────────── */
var sources = {};
PAGES.forEach(function (p) {
  var abs = path.join(APP, p.rel);
  var exists = fs.existsSync(abs);
  ok('★★ ' + p.rel + ' exists (Play requires a reachable policy and deletion URL)', exists);
  if (!exists) return;
  var src = fs.readFileSync(abs, 'utf8');
  sources[p.rel] = src;
  ok(p.rel + ' is a complete HTML document', /<!DOCTYPE html>/i.test(src) && /<\/html>/i.test(src));
  ok(p.rel + ' has a matching <title>', p.title.test((src.match(/<title>([^<]*)<\/title>/i) || [])[1] || ''));
  /* A legal page shipped with a bracketed placeholder is worse than none — it reads as boilerplate
     nobody checked, and Google's reviewers do read these. */
  ok('★ ' + p.rel + ' carries no unfilled placeholder',
    !/\[(your|company|insert|todo|tbd)[^\]]*\]|xxxx|lorem ipsum|placeholder/i.test(src),
    (src.match(/\[[^\]]{3,40}\]/) || [])[0] || '');
  ok(p.rel + ' names a real contact address', /quantreflex@gmail\.com/.test(src));
});

/* ── 2. the SPA rewrite must NOT swallow them ──────────────────────────────────────────────────
   Proven by EXECUTING the pattern, not by reading it: a subtly wrong negative lookahead is exactly
   the kind of thing that reads as correct. */
(function () {
  var vercel = JSON.parse(fs.readFileSync(path.join(APP, 'vercel.json'), 'utf8'));
  var rewrites = vercel.rewrites || [];
  ok('vercel.json still has exactly one SPA catch-all rewrite', rewrites.length === 1);
  var source = rewrites[0] ? rewrites[0].source : '';
  var re;
  try { re = new RegExp('^' + source + '$'); } catch (e) { ok('the rewrite source compiles', false, e.message); return; }
  PAGES.forEach(function (p) {
    ok('★★ /' + p.rel + ' is NOT rewritten to the app shell', !re.test('/' + p.rel));
  });
  /* The pre-existing exclusions and the catch-all itself must still work. */
  ok('/.well-known/assetlinks.json is still excluded', !re.test('/.well-known/assetlinks.json'));
  ok('/api/payment is still excluded', !re.test('/api/payment'));
  ok('the SPA catch-all still serves app routes', re.test('/') && re.test('/practice'));
})();

/* ── 3. the app actually links to them ─────────────────────────────────────────────────────────
   The paywall footer is the one place a paying customer looks for terms, and it is the place Play's
   review flow reaches. A dead link there is a policy problem, not a cosmetic one. */
(function () {
  var pw = fs.readFileSync(path.join(APP, 'js/paywall.js'), 'utf8');
  ok('★★ the paywall footer links to the real terms page', /href="\/legal\/terms\.html"/.test(pw));
  ok('★★ the paywall footer links to the real privacy page', /href="\/legal\/privacy\.html"/.test(pw));
  ok('★ …and no longer points at the non-existent #terms / #privacy routes',
    !/href="#terms"/.test(pw) && !/href="#privacy"/.test(pw));
})();

/* ── 4. the pages agree with the product ───────────────────────────────────────────────────────
   A privacy policy that contradicts the code is worse than a missing one. These assertions pin the
   claims that would actually mislead a reader or a reviewer if the code changed underneath them. */
(function () {
  var priv = sources['legal/privacy.html'] || '';
  var terms = sources['legal/terms.html'] || '';
  var del = sources['legal/delete-account.html'] || '';

  /* Pricing must match the canonical plan config — payment-parity.check.js owns the code sites; this
     covers the customer-facing legal text, which nothing else was checking. */
  /* PRICING is the shared paise map that payment-parity.check.js already pins to every code site. */
  var PRICING = require('../../shared/constants/entitlements').PRICING || {};
  var six = PRICING.PREMIUM_6M ? PRICING.PREMIUM_6M / 100 : null;
  var twelve = PRICING.PREMIUM_12M ? PRICING.PREMIUM_12M / 100 : null;
  ok('the shared PRICING map is readable for the cross-check', six !== null && twelve !== null,
    'six=' + six + ' twelve=' + twelve);
  if (six !== null) ok('★★ the Terms page quotes the CANONICAL 6-month price', terms.indexOf('₹' + six) !== -1, '₹' + six);
  if (twelve !== null) ok('★★ the Terms page quotes the CANONICAL 12-month price', terms.indexOf('₹' + twelve) !== -1, '₹' + twelve);

  /* The refund window is a single declared constant; the customer-facing promise must match it. */
  var hours = (fs.readFileSync(path.join(APP, 'services/refundPolicy.js'), 'utf8')
    .match(/REFUND_WINDOW_HOURS\s*=\s*(\d+)/) || [])[1];
  ok('the refund window constant is readable', !!hours);
  if (hours) ok('★★ the Terms page states the SAME refund window the code enforces',
    new RegExp('within\\s+' + hours + '\\s+hours', 'i').test(terms), hours + 'h');

  /* Premium is a fixed-term one-time purchase. Saying "subscription" would be a misleading claim
     under Play policy AND would set up an auto-renewal expectation the product does not meet. */
  ok('★ the Terms page states Premium is NOT auto-renewing',
    /not\s*<\/strong>\s*an auto-renewing|not an auto-renewing/i.test(terms));

  /* Both payment rails must be disclosed — Play requires the in-app rail to be named. */
  ok('the Terms page names both payment providers',
    /Razorpay/.test(terms) && /Google Play Billing/.test(terms));
  ok('the Privacy page discloses every third party the code actually sends data to',
    ['Firebase', 'Vercel', 'OpenAI', 'Razorpay', 'Google Play'].every(function (s) { return priv.indexOf(s) !== -1; }));

  /* Retention claim vs reality: account deletion RETAINS payment rows (ADR-149), and both the policy
     and the deletion page must say so. A policy promising total erasure while the server keeps
     financial records is exactly the discrepancy a data-protection complaint is made of. */
  /* Comments stripped first: account.js EXPLAINS the old `_deleteByField(db, 'payments', …)` call in
     the block comment justifying its removal, and matching that would assert the opposite of the
     truth. */
  var acct = fs.readFileSync(path.join(APP, 'api/account.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  var retains = /_retainPaymentsForDeletedUser\s*\(/.test(acct) && !/_deleteByField\(db, 'payments'/.test(acct);
  ok('account deletion RETAINS payment rows in code (ADR-149)', retains);
  if (retains) {
    ok('★★ the Privacy page discloses that payment records are retained after deletion',
      /payment record/i.test(priv) && /retain|kept/i.test(priv));
    ok('★★ the deletion page discloses the same retention',
      /payment record/i.test(del) && /(retain|kept|keep)/i.test(del));
  }

  /* Deletion is self-service in the app; the page must describe the route that exists. */
  ok('the deletion page describes the in-app route that actually exists',
    /Settings/.test(del) && /Delete Account/i.test(del));
  var idx = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  ok('★ …and that in-app control really is present', /id="deleteAccountBtn"/.test(idx));
})();

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
