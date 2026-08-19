/**
 * platform.check.js — one source of platform truth, and the Play-policy asymmetry (ADR-142, WS1).
 *
 * Two jobs:
 *
 *  1. SOURCE RATCHET — `display-mode: standalone` must appear in exactly one file. Three independent
 *     copies existed before WS1 (app.js, duel-manager.js, services/report-context.js) and they had
 *     already drifted once: report-context omitted `display-mode: fullscreen`, so a fullscreen-
 *     launched PWA was mis-reported in every bug report (audit MIN3). A fourth copy would reintroduce
 *     exactly the class of bug WS1 exists to remove, and would do it silently.
 *
 *  2. BEHAVIOUR — platform.js is loaded into a synthesised browser-ish global and driven through the
 *     TWA/PWA/web scenarios, including the ones that decide whether Razorpay may be offered.
 *
 * THE LOAD-BEARING ASSERTION is the asymmetry: isPlayDistribution() must fire on either DELIBERATE
 * Play marker (an android-app:// referrer, or the ?src=play start_url latch) and suppress Razorpay,
 * while canUsePlayBilling() must require ALL strong signals. A build that looks like Play but cannot
 * transact shows NEITHER payment path — never a Razorpay fallback.
 *
 * ADR-154 narrowed the first half. It used to fire on ANY weak signal including the mere presence of
 * getDigitalGoodsService — but Chrome on Android exposes that in ordinary tabs, so ordinary mobile web
 * users were misclassified as Play builds and left with no way to pay at all. Presence of an API is
 * not evidence of a distribution channel; the two markers a browser cannot conjure are.
 *
 *   node scripts/platform.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var R = function (p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); };

var pass = 0, fail = 0;
function ok(m, c, d) { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }

console.log('Platform truth — one detector, and the Play-policy asymmetry (ADR-142 WS1)\n');

/* ── 1. source ratchet ───────────────────────────────────────────────────────────────────────── */

var JS_DIR = path.join(__dirname, '..', 'js');
function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(function (name) {
    var full = path.join(dir, name);
    var st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.js$/.test(name)) out.push(full);
  });
  return out;
}
var jsFiles = walk(JS_DIR);
var offenders = jsFiles.filter(function (f) {
  return /display-mode:\s*standalone/.test(fs.readFileSync(f, 'utf8'));
}).map(function (f) { return path.relative(path.join(__dirname, '..'), f); });

ok('`display-mode: standalone` appears in exactly one module',
  offenders.length === 1 && offenders[0] === 'js/platform.js',
  offenders.join(', ') || 'none found');
ok('navigator.standalone is read in exactly one module',
  jsFiles.filter(function (f) { return /navigator\.standalone/.test(fs.readFileSync(f, 'utf8')); })
    .map(function (f) { return path.relative(path.join(__dirname, '..'), f); })
    .filter(function (p) { return p !== 'js/platform.js'; }).length === 0);

/* platform.js must load before app.js, which asks it for the container class at parse time */
var html = R('index.html');
var iPlatform = html.indexOf('js/platform.js');
var iApp = html.indexOf('js/app.js');
ok('index.html loads platform.js', iPlatform !== -1);
ok('platform.js loads BEFORE app.js (app.js asks it for the mode class at parse time)',
  iPlatform !== -1 && iApp !== -1 && iPlatform < iApp);

/* the detectors must actually delegate, not merely coexist with the new module */
ok('app.js delegates the mode class to QRPlatform', /QRPlatform\.applyModeClasses\(\)/.test(R('js/app.js')));
ok('duel-manager delegates its installed-app gate to QRPlatform',
  /QRPlatform\.isInstalledApp\(\)/.test(R('js/duel-manager.js')));
ok('report-context delegates its standalone probe to QRPlatform',
  /QRPlatform\.isStandalone\(\)/.test(R('js/services/report-context.js')));

/* the TWA verdict must never be persisted — a TWA shares Chrome's profile storage with ordinary
   browsing of this origin, so a cached flag leaks in BOTH directions */
var platSrc = R('js/platform.js');
ok('platform.js never writes localStorage (a cached TWA flag would leak into normal browsing)',
  !/localStorage\.setItem/.test(platSrc), 'found a localStorage write');
ok('the ?src=play latch is session-scoped, so it dies with the tab',
  /sessionStorage\.setItem/.test(platSrc));

/* ── 2. behaviour ────────────────────────────────────────────────────────────────────────────── */

/** Build a throwaway global that looks enough like a browser, load platform.js into it fresh. */
function boot(opts) {
  var o = opts || {};
  var store = {};
  var classes = { html: [], body: [] };
  function elem(bucket) {
    return {
      classList: {
        add: function () { for (var i = 0; i < arguments.length; i++) bucket.push(arguments[i]); },
        remove: function (c) { var k = bucket.indexOf(c); if (k !== -1) bucket.splice(k, 1); },
        contains: function (c) { return bucket.indexOf(c) !== -1; }
      }
    };
  }
  var sandbox = {
    console: console,
    document: { referrer: o.referrer || '', documentElement: elem(classes.html), body: elem(classes.body) },
    location: { search: o.search || '' },
    navigator: { standalone: o.iosStandalone === true },
    matchMedia: function (q) {
      return { matches: !!(o.displayMode && q.indexOf('display-mode: ' + o.displayMode) !== -1) };
    },
    sessionStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    },
    Promise: Promise
  };
  if (o.dga) sandbox.getDigitalGoodsService = o.dga;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(platSrc, sandbox, { filename: 'platform.js' });
  return { P: sandbox.QRPlatform, classes: classes, store: store };
}

/* a Play billing service whose getDetails returns whatever ids it is told to know about */
function dgaWith(knownIds, opts) {
  var o = opts || {};
  return function (url) {
    if (o.rejectService) return Promise.reject(new Error('no service'));
    if (o.wrongUrl && url !== 'https://play.google.com/billing') return Promise.reject(new Error('bad url'));
    return Promise.resolve({
      getDetails: function (ids) {
        if (o.rejectDetails) return Promise.reject(new Error('details failed'));
        return Promise.resolve(ids.filter(function (i) { return knownIds.indexOf(i) !== -1; })
          .map(function (i) { return { itemId: i, price: { value: '299', currency: 'INR' } }; }));
      }
    });
  };
}

var SKUS = ['premium_6m', 'premium_12m'];

/* — a plain browser tab — */
var web = boot({});
ok('plain browser tab → web-mode', web.P.mode() === 'web-mode');
ok('plain browser tab is not a Play distribution', web.P.isPlayDistribution() === false);
ok('plain browser tab is not an installed app', web.P.isInstalledApp() === false);

/* — an installed PWA (NOT a Play build: Razorpay must still be available) — */
var pwa = boot({ displayMode: 'standalone' });
ok('installed PWA → pwa-mode', pwa.P.mode() === 'pwa-mode');
ok('★ an installed PWA is NOT treated as a Play distribution (Razorpay must stay available)',
  pwa.P.isPlayDistribution() === false);
ok('installed PWA counts as an installed app (Math Duel gate)', pwa.P.isInstalledApp() === true);
var pwaFs = boot({ displayMode: 'fullscreen' });
ok('display-mode:fullscreen also counts as installed (the MIN3 drift, now impossible)',
  pwaFs.P.isStandalone() === true);
ok('iOS navigator.standalone also counts as installed', boot({ iosStandalone: true }).P.isStandalone() === true);

/* — each weak Play signal ALONE must suppress Razorpay — */
ok('★ referrer android-app:// alone ⇒ Play distribution',
  boot({ referrer: 'android-app://com.example.qr' }).P.isPlayDistribution() === true);
ok('★ ?src=play alone ⇒ Play distribution',
  boot({ search: '?src=play' }).P.isPlayDistribution() === true);
/* ADR-154 — THE DIGITAL GOODS API ALONE MUST **NOT** MEAN PLAY DISTRIBUTION.
   This assertion used to demand the opposite, which is exactly why the defect shipped: Chrome on
   ANDROID exposes getDigitalGoodsService in ordinary browser tabs, so every Android web visitor was
   classified as a Play build, routed to the Play adapter, and — because that adapter is deliberately
   not ready — shown "Purchasing isn't available in this version of the app yet" with no way to pay.
   Desktop Chrome does not expose the API, so the same page offered Razorpay there. Confirmed in
   production by the owner: "this is the website and not TWA... the same thing is working on PC".
   The two DELIBERATE markers below are the real evidence; the DGA check remains, but only inside
   canUsePlayBilling(), where "is the API present" is the right question. */
ok('★★ the Digital Goods API ALONE does NOT imply Play distribution (Chrome Android exposes it in tabs)',
  boot({ dga: dgaWith(SKUS) }).P.isPlayDistribution() === false);
ok('★★ an Android browser tab with the DGA still gets a purchase path (Razorpay, not reader mode)',
  boot({ dga: dgaWith(SKUS) }).P.mode() === 'web-mode');
ok('★★ an INSTALLED PWA on Android with the DGA is still not a Play distribution',
  boot({ displayMode: 'standalone', dga: dgaWith(SKUS) }).P.isPlayDistribution() === false);
/* The DGA must still be consulted where it IS meaningful — otherwise this fix would silently
   disable Play billing detection for a real TWA. */
ok('★ canUsePlayBilling still requires the Digital Goods API',
  typeof boot({ referrer: 'android-app://x' }).P.canUsePlayBilling === 'function');
ok('a TWA that also matches standalone reports twa-mode, not pwa-mode',
  boot({ displayMode: 'standalone', referrer: 'android-app://com.example.qr' }).P.mode() === 'twa-mode');

/* the ?src=play latch survives in-session navigation (the query string does not) */
var latched = boot({ search: '?src=play' });
ok('?src=play is latched for the session', latched.P.isPlayDistribution() === true && latched.store.qr_src_play === '1');

/* — the container class — */
var twaCls = boot({ displayMode: 'standalone', referrer: 'android-app://com.example.qr' });
twaCls.P.applyModeClasses();
ok('a TWA gets twa-mode', twaCls.classes.body.indexOf('twa-mode') !== -1);
ok('★ …and KEEPS pwa-mode, so every existing installed-app rule still applies',
  twaCls.classes.body.indexOf('pwa-mode') !== -1);
ok('…and is not also web-mode', twaCls.classes.body.indexOf('web-mode') === -1);
var webCls = boot({});
webCls.P.applyModeClasses();
ok('a browser tab gets web-mode only',
  webCls.classes.body.indexOf('web-mode') !== -1 && webCls.classes.body.indexOf('pwa-mode') === -1);
ok('the class is applied to documentElement too', webCls.classes.html.indexOf('web-mode') !== -1);

/* — canUsePlayBilling: STRONG evidence, all of it — */
(async function () {
  var full = boot({ referrer: 'android-app://com.example.qr', dga: dgaWith(SKUS) });
  var r1 = await full.P.canUsePlayBilling(SKUS);
  ok('a fully-configured Play build can use Play Billing', r1.ok === true, r1.reason);
  ok('…and hands back the resolved service for the provider to reuse', !!r1.service);

  /* every way it can fail must fail CLOSED — reader mode, never a Razorpay fallback */
  var noDga = boot({ referrer: 'android-app://com.example.qr' });
  var r2 = await noDga.P.canUsePlayBilling(SKUS);
  ok('★ Play build with NO Digital Goods API ⇒ cannot bill (reader mode)', r2.ok === false, r2.reason);
  ok('★ …but it is STILL a Play distribution — Razorpay stays suppressed',
    noDga.P.isPlayDistribution() === true);

  var halfCatalogue = boot({ referrer: 'android-app://x', dga: dgaWith(['premium_6m']) });
  var r3 = await halfCatalogue.P.canUsePlayBilling(SKUS);
  ok('★ a HALF-configured Play Console (one SKU live) ⇒ cannot bill — all or nothing',
    r3.ok === false && /sku_missing:premium_12m/.test(r3.reason), r3.reason);
  ok('★ …and that build still suppresses Razorpay', halfCatalogue.P.isPlayDistribution() === true);

  var noSvc = boot({ referrer: 'android-app://x', dga: dgaWith(SKUS, { rejectService: true }) });
  var r4 = await noSvc.P.canUsePlayBilling(SKUS);
  ok('an unreachable billing service fails closed', r4.ok === false && /^error:/.test(r4.reason), r4.reason);

  var badDetails = boot({ referrer: 'android-app://x', dga: dgaWith(SKUS, { rejectDetails: true }) });
  var r5 = await badDetails.P.canUsePlayBilling(SKUS);
  ok('a getDetails failure fails closed', r5.ok === false, r5.reason);

  var r6 = await boot({}).P.canUsePlayBilling(SKUS);
  ok('a plain web tab can never use Play Billing', r6.ok === false && r6.reason === 'not_play_distribution');

  var r7 = await full.P.canUsePlayBilling([]);
  ok('no SKUs requested ⇒ refuse rather than approve an empty catalogue',
    r7.ok === false && r7.reason === 'no_skus_requested');

  /* the URL the service is resolved against is the Play billing endpoint, not something guessable */
  ok('the billing service URL is Play\'s', full.P.PLAY_BILLING_SERVICE_URL === 'https://play.google.com/billing');

  /* memoised per boot: the payment path must not change under the user mid-checkout */
  var stable = boot({ referrer: 'android-app://x' });
  var first = stable.P.isPlayDistribution();
  stable.P.isPlayDistribution();
  ok('the verdict is memoised per boot (it cannot flip mid-session)',
    first === true && stable.P.isPlayDistribution() === true);

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('\n✗ HARNESS ERROR:', (e && e.stack) || e);
  process.exit(1);
});
