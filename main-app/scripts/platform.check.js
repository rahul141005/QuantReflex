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
  var store = o.store || {};
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
ok('★ referrer android-app://<our package> alone ⇒ Play distribution',
  boot({ referrer: 'android-app://com.quantreflex.app' }).P.isPlayDistribution() === true);

/* ── ADR-156 — the referrer must be OUR package, and it must survive a reload ──────────────────────────
   Both halves of this module's asymmetry were leaking through this one signal.

   FALSE POSITIVE: the test used to be /^android-app:\/\// — ANY Android app. Chrome sets that referrer for
   a link opened from an app that supplies one, so every visitor arriving from WhatsApp / Gmail / Instagram
   was classified a Play build and left with NO way to pay. That is the same revenue-losing failure ADR-154
   removed from the Digital Goods signal, still live through this one. Note the fixtures above: they all used
   a FOREIGN package (com.example.qr, x) and passed — the suite had encoded the defect, so a green run was
   evidence OF the bug. They now name the real package. */
['android-app://com.whatsapp',
 'android-app://com.google.android.gm',
 'android-app://com.instagram.android',
 'android-app://com.quantreflex.appliance'   /* a lookalike PREFIX must not slip through either */
].forEach(function (ref) {
  ok('★★ a referrer from another Android app is NOT Play distribution (' + ref + ')',
    boot({ referrer: ref }).P.isPlayDistribution() === false,
    'that visitor is shown no purchase path at all and cannot pay');
});

/* FALSE NEGATIVE: the referrer is set on the LAUNCH document only, and this app does full-page navigations
   (js/settings.js reloads on several settings changes, and does `location.href = pathname` on another). The
   manifest start_url is `/`, carrying no ?src=play for the other marker to latch — so after any reload the
   signal vanished INSIDE the real Play build, and js/payments/gateway.js answers a false isPlayDistribution()
   by offering Razorpay. That is the one unrecoverable Play-policy violation in this program. */
(function () {
  var tab = {};   /* one sessionStorage shared by both boots = one browser tab */
  boot({ referrer: 'android-app://com.quantreflex.app', store: tab }).P.isPlayDistribution();
  var afterReload = boot({ referrer: '', store: tab });   /* settings.js reload: the referrer is gone */
  ok('★★ the Play verdict SURVIVES a full-page reload inside the TWA (latched for the tab)',
    afterReload.P.isPlayDistribution() === true,
    'a Play build that forgets it is a Play build offers Razorpay — listing-removal territory');
})();

/* ADR-168 — THE REAL TWA CARRIES BOTH MARKERS AT ONCE, AND THAT IS THE CASE THAT BROKE IN PRODUCTION.
   `_playDist = _referrerSignal() || _srcSignal()` short-circuits, and BOTH signals latch as a side effect
   of being read. On the one configuration the guide actually asks for — launch URL `/?src=play` inside a
   TWA, i.e. referrer AND query present — the referrer answered first, `_srcSignal()` never ran, and the
   `?src=play` latch was never written. Reproduced in a browser against the bytes deployed at
   quantreflex.app (v283): launch answered `play`, one full-page reload answered `razorpay`.

   HONEST NOTE ON WHAT THIS PINS. It pins the OUTCOME — the latch exists and the verdict survives a
   reload — not the mechanism. Today that outcome is satisfied TWICE OVER: ADR-156 made the referrer
   signal latch on its own, and ADR-168 removed the short-circuit so `_srcSignal()` always runs too.
   Either alone would satisfy these three assertions, so they do NOT discriminate between the two fixes
   and would not have failed on the pre-ADR-168 source. They fail only if BOTH latches are lost, which
   is exactly the production state being ratcheted against. Do not read a pass here as proof that the
   short-circuit is gone; read it as proof that the Play verdict cannot be forgotten by a reload. */
(function () {
  var tab = {};
  var launch = boot({ referrer: 'android-app://com.quantreflex.app', search: '?src=play', store: tab });
  ok('★★ a TWA launch carrying BOTH markers is Play distribution',
    launch.P.isPlayDistribution() === true);
  ok('★★★ …and the latch IS written even though the referrer answered first (no || short-circuit)',
    tab.qr_src_play === '1',
    'the src latch was skipped by short-circuit evaluation — the next reload would select Razorpay');
  var afterReload = boot({ referrer: '', search: '', store: tab });
  ok('★★★ …so the verdict survives the reload on the exact build configuration we ship',
    afterReload.P.isPlayDistribution() === true);
})();

/* ADR-169 — THE ACCOUNT PURGE MUST NOT BE ABLE TO TAKE THE LATCH.
   js/state/store.js clearAll() sweeps BOTH storage areas through QRStorage.purgeUserScoped(), and the
   registry's default for an unregistered `qr_`-prefixed key is 'user' — i.e. purge. The Play latch was
   unregistered, so signing out inside the Play build deleted it; the reload that follows a sign-out
   (js/session.js) then found no marker and js/payments/gateway.js selected Razorpay.
   This assertion runs the REAL classifier and the REAL purge, so it fails if the key is ever
   un-registered again — a source-shape test would not. */
(function () {
  var Reg = require(path.join(__dirname, '..', 'js/state/storage-registry.js'));
  ok('★★★ the Play latch is NOT classified as user-scoped (it describes the container, not the account)',
    Reg.classify('qr_src_play') === 'installation',
    'classify() said "' + Reg.classify('qr_src_play') + '" — anything but a survivor category means ' +
    'a sign-out inside the Play build drops the Play verdict and the gateway falls to Razorpay');

  var area = (function () {
    var m = { qr_src_play: '1', qr_progress: 'x', qr_google_redirect: '1', foreign: 'keep' };
    return {
      get length() { return Object.keys(m).length; },
      key: function (i) { return Object.keys(m)[i]; },
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  })();
  var removed = Reg.purgeUserScoped(area);
  ok('★★★ …so an account-change purge leaves it in place',
    area.getItem('qr_src_play') === '1',
    'purge removed ' + JSON.stringify(removed));
  ok('…while still purging genuinely user-scoped keys around it',
    area.getItem('qr_progress') === null && area.getItem('foreign') === 'keep');
})();

/* ...but the latch is SESSION scope, so it can never leak into ordinary browsing of this origin later. */
ok('★★ the latch does not leak into a fresh tab (sessionStorage, never localStorage)',
  boot({ referrer: '' }).P.isPlayDistribution() === false);
ok('★★ the latch is stored in sessionStorage only',
  !/localStorage\s*\.\s*(get|set|remove)Item/.test(R('js/platform.js')),
  'a cached Play verdict in localStorage would hide Razorpay from a web user forever');

/* The package this module matches must be the one everything else in the program is bound to. */
(function () {
  var declared = (R('js/platform.js').match(/var TWA_PACKAGE = '([^']+)'/) || [])[1];
  var canonical = (R('services/playBillingService.js').match(/var CANONICAL_PACKAGE_NAME = '([^']+)'/) || [])[1];
  ok('★★ platform.js matches the CANONICAL package name, not a retyped copy',
    !!declared && declared === canonical, declared + ' vs ' + canonical);
  var links = JSON.parse(R('.well-known/assetlinks.json'));
  ok('★★ ...and that is the package the origin is asset-linked to',
    links.some(function (st) { return st.target && st.target.package_name === declared; }),
    'the TWA would not verify, and would open as a browser tab with a URL bar');
})();
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
  typeof boot({ referrer: 'android-app://com.quantreflex.app' }).P.canUsePlayBilling === 'function');
ok('a TWA that also matches standalone reports twa-mode, not pwa-mode',
  boot({ displayMode: 'standalone', referrer: 'android-app://com.quantreflex.app' }).P.mode() === 'twa-mode');

/* the ?src=play latch survives in-session navigation (the query string does not) */
var latched = boot({ search: '?src=play' });
ok('?src=play is latched for the session', latched.P.isPlayDistribution() === true && latched.store.qr_src_play === '1');

/* — the container class — */
var twaCls = boot({ displayMode: 'standalone', referrer: 'android-app://com.quantreflex.app' });
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
  var full = boot({ referrer: 'android-app://com.quantreflex.app', dga: dgaWith(SKUS) });
  var r1 = await full.P.canUsePlayBilling(SKUS);
  ok('a fully-configured Play build can use Play Billing', r1.ok === true, r1.reason);
  ok('…and hands back the resolved service for the provider to reuse', !!r1.service);

  /* every way it can fail must fail CLOSED — reader mode, never a Razorpay fallback */
  var noDga = boot({ referrer: 'android-app://com.quantreflex.app' });
  var r2 = await noDga.P.canUsePlayBilling(SKUS);
  ok('★ Play build with NO Digital Goods API ⇒ cannot bill (reader mode)', r2.ok === false, r2.reason);
  ok('★ …but it is STILL a Play distribution — Razorpay stays suppressed',
    noDga.P.isPlayDistribution() === true);

  var halfCatalogue = boot({ referrer: 'android-app://com.quantreflex.app', dga: dgaWith(['premium_6m']) });
  var r3 = await halfCatalogue.P.canUsePlayBilling(SKUS);
  ok('★ a HALF-configured Play Console (one SKU live) ⇒ cannot bill — all or nothing',
    r3.ok === false && /sku_missing:premium_12m/.test(r3.reason), r3.reason);
  ok('★ …and that build still suppresses Razorpay', halfCatalogue.P.isPlayDistribution() === true);

  var noSvc = boot({ referrer: 'android-app://com.quantreflex.app', dga: dgaWith(SKUS, { rejectService: true }) });
  var r4 = await noSvc.P.canUsePlayBilling(SKUS);
  ok('an unreachable billing service fails closed', r4.ok === false && /^error:/.test(r4.reason), r4.reason);

  var badDetails = boot({ referrer: 'android-app://com.quantreflex.app', dga: dgaWith(SKUS, { rejectDetails: true }) });
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
  var stable = boot({ referrer: 'android-app://com.quantreflex.app' });
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
