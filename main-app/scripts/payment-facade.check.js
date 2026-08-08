/**
 * payment-facade.check.js — the provider boundary (ADR-144, Phase-4 WS4).
 *
 * WS4's whole purpose is one asymmetric rule:
 *
 *   web / PWA  → Razorpay
 *   Play / TWA → the Play provider, and if it cannot take money there is NO purchase path at all.
 *
 * "Play adapter not ready" must NEVER resolve to Razorpay. Offering Razorpay inside a Play build is
 * the one unrecoverable Play-policy violation — the listing is removed and no client-side repair
 * undoes it — so the failure has to be proven absent structurally AND behaviourally, not reviewed for.
 *
 * Two halves, because either alone is insufficient:
 *   · SOURCE RATCHETS  — Razorpay lives in exactly one shipped file; no provider-specific purchase
 *     global; no external payment link. A behavioural test cannot see a bypass that no test calls.
 *   · BEHAVIOUR        — the real gateway + both real adapters are loaded into a synthesised global
 *     (same vm technique as platform.check.js) and driven through every platform scenario, with the
 *     Razorpay SDK surface instrumented so "did Play mode touch Razorpay at all?" is answerable
 *     rather than assumed.
 *
 *   node scripts/payment-facade.check.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var APP = path.join(__dirname, '..');
var R = function (p) { return fs.readFileSync(path.join(APP, p), 'utf8'); };

var pass = 0, fail = 0;
function ok(m, c, d) { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }

console.log('Payment facade — the provider boundary (ADR-144 WS4)\n');

/* ── 1. source ratchets ──────────────────────────────────────────────────────────────────────── */

function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(function (n) {
    if (n === 'node_modules') return;
    var full = path.join(dir, n);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.js$/.test(n)) out.push(full);
  });
  return out;
}
var jsFiles = walk(path.join(APP, 'js'));
function rel(f) { return path.relative(APP, f); }

/* Razorpay may be NAMED in prose anywhere (the comments explaining this very rule), but the API
   surface — the constructor, the key prefix, the SDK URL — must exist in exactly one file. Comments
   are stripped so documentation is never punished. */
function codeOf(f) {
  return fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
var rzpFiles = jsFiles.filter(function (f) {
  return /\bnew\s+(root\.|window\.)?Razorpay\b|rzp_live_|rzp_test_|checkout\.razorpay\.com/.test(codeOf(f));
}).map(rel);
ok('the Razorpay API surface exists in exactly one shipped module',
  rzpFiles.length === 1 && rzpFiles[0] === 'js/payments/razorpay-provider.js',
  rzpFiles.join(', ') || 'none');

/* The paywall must not reach a provider directly — it may only speak to the facade. */
var pw = codeOf(path.join(APP, 'js/paywall.js'));
ok('★ paywall.js never references the Razorpay API', !/Razorpay/.test(pw));
ok('★ paywall.js never references the Play adapter directly', !/QRPaymentsPlay/.test(pw));
ok('paywall.js drives purchases through the facade', /QRPayments\.purchase\(/.test(pw));
ok('paywall.js gates its CTA on the facade', /QRPayments\.canPurchase\(\)/.test(pw));
/* Restore goes through the facade too. Not because it is provider-specific today — it is not — but
   so there is ONE restore entry point for WS5 to extend, and so `QRPayments.restore` never becomes an
   API with no caller (the exact shape the certification audit caught in the refund workflow). */
ok('★ paywall.js restores through the facade, not the data layer directly',
  /QRPayments\.restore\(/.test(pw) && !/FirestoreSync\.refreshFromServer\(/.test(pw));

/* The provider-shaped global is gone (WS4 decision), and no replacement leaked in. */
var globalsExported = jsFiles.filter(function (f) {
  return /(global|window|root)\.openPremiumPayment\s*=/.test(codeOf(f));
}).map(rel);
ok('★ no provider-specific purchase global is exported', globalsExported.length === 0, globalsExported.join(', '));

/* No route out of the app to pay elsewhere — a Play-policy trap as much as a UX one.
   Scoped to NAVIGATION, not to any string containing a payment-ish word: `platform.js` legitimately
   holds `https://play.google.com/billing`, which is the Digital Goods SERVICE IDENTIFIER passed to
   getDigitalGoodsService() — never a URL the app sends a user to. What must not exist is a way to
   *send the user somewhere* to pay. */
var NAVIGATES = /(location\s*\.\s*(href|assign|replace)\s*[=(]|window\.open\s*\(|<a[^>]+href=)/i;
/* EXTERNAL only. Internal hash routes are not an escape hatch — `href="#terms"` and the
   `quota-upgrade-link` anchor both go to in-app views, and matching them on the substrings "pay"
   (inside `paywall.terms`) or "upgrade" (inside a CSS class) would be flagging identifiers, not
   behaviour. What must not exist is navigation OFF the origin to something payment-shaped. */
var EXTERNAL_PAYMENT = /https?:\/\/[^\s'"`]*(pay|checkout|upgrade|billing|purchase|quantreflex\.app)/i;
var payLinks = jsFiles.filter(function (f) {
  var code = codeOf(f);
  if (!NAVIGATES.test(code)) return false;
  return code.split('\n').some(function (line) {
    return NAVIGATES.test(line) && EXTERNAL_PAYMENT.test(line);
  });
}).map(rel);
ok('★ no external payment link or website purchase redirect in js/', payLinks.length === 0, payLinks.join(', '));

/* Provider selection must exist in one place, or two callers will eventually disagree. */
var selectors = jsFiles.filter(function (f) {
  return /isPlayDistribution\s*\(\s*\)/.test(codeOf(f));
}).map(rel).filter(function (p) { return p !== 'js/platform.js'; });
ok('provider selection reads the platform verdict in exactly one place (the gateway)',
  selectors.length === 1 && selectors[0] === 'js/payments/gateway.js', selectors.join(', '));

/* Load order: the facade needs the platform verdict; the paywall needs the facade. */
var html = R('index.html');
var iPlat = html.indexOf('js/platform.js'), iGw = html.indexOf('js/payments/gateway.js');
var iRzp = html.indexOf('js/payments/razorpay-provider.js'), iPlay = html.indexOf('js/payments/play-provider.js');
var iPw = html.indexOf('js/paywall.js');
ok('all three payment modules are script-tagged', iGw !== -1 && iRzp !== -1 && iPlay !== -1);
ok('platform.js → gateway → adapters → paywall.js load order',
  iPlat < iGw && iGw < iRzp && iRzp < iPlay && iPlay < iPw);

/* ── 2. behaviour ────────────────────────────────────────────────────────────────────────────── */

var SRC = {
  platform: R('js/platform.js'),
  gateway: R('js/payments/gateway.js'),
  razorpay: R('js/payments/razorpay-provider.js'),
  play: R('js/payments/play-provider.js')
};

/**
 * Build a browser-ish global and load platform + facade + both adapters, exactly as index.html does.
 * `spy` records every Razorpay touch so Play mode can be proven clean rather than assumed clean.
 */
function boot(opts) {
  var o = opts || {};
  var spy = { scriptsAppended: [], razorpayConstructed: 0, fetches: [] };
  var sandbox = {
    console: { info: function () {}, warn: function () {}, error: function () {}, log: function () {} },
    document: {
      referrer: o.referrer || '',
      documentElement: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } } },
      body: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
              appendChild: function (el) { spy.scriptsAppended.push(el.src || ''); } },
      getElementById: function () { return null; },
      createElement: function () { return { setAttribute: function () {}, addEventListener: function () {} }; }
    },
    location: { search: o.search || '' },
    navigator: { standalone: o.iosStandalone === true },
    matchMedia: function (q) { return { matches: !!(o.displayMode && q.indexOf('display-mode: ' + o.displayMode) !== -1) }; },
    sessionStorage: { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function (k, v) { this._d[k] = String(v); } },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    Promise: Promise,
    fetch: function (url) { spy.fetches.push(url); return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } }); },
    QRI18n: { t: function (k) { return k; } }
  };
  if (o.dga) sandbox.getDigitalGoodsService = o.dga;
  /* Present but instrumented: if Play mode ever constructs it, the count proves the violation. */
  sandbox.Razorpay = function () { spy.razorpayConstructed++; return { on: function () {}, open: function () {} }; };
  sandbox.self = sandbox; sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC.platform, sandbox, { filename: 'platform.js' });
  vm.runInContext(SRC.gateway, sandbox, { filename: 'gateway.js' });
  vm.runInContext(SRC.razorpay, sandbox, { filename: 'razorpay-provider.js' });
  vm.runInContext(SRC.play, sandbox, { filename: 'play-provider.js' });
  return { P: sandbox.QRPayments, plat: sandbox.QRPlatform, spy: spy, sb: sandbox };
}

var TWA = { referrer: 'android-app://com.quantreflex.app' };

/* — web / PWA → Razorpay — */
var web = boot({});
ok('web tab → provider razorpay', web.P.providerId() === 'razorpay');
ok('web tab can purchase', web.P.canPurchase() === true);
var pwa = boot({ displayMode: 'standalone' });
ok('installed PWA → provider razorpay', pwa.P.providerId() === 'razorpay');
ok('★ an installed PWA can still purchase (WS1 must not have broken the web path)', pwa.P.canPurchase() === true);

/* — Play / TWA → never Razorpay — */
[['referrer', TWA], ['?src=play', { search: '?src=play' }],
 ['Digital Goods API', { dga: function () { return Promise.resolve({}); } }]].forEach(function (row) {
  var b = boot(row[1]);
  ok('★ Play signal (' + row[0] + ') → provider is NOT razorpay', b.P.providerId() !== 'razorpay');
  ok('★ Play signal (' + row[0] + ') → provider is play', b.P.providerId() === 'play');
  ok('★ Play signal (' + row[0] + ') → canPurchase() is FALSE', b.P.canPurchase() === false);
});

/* — the load-bearing assertion: Play mode cannot reach Razorpay even if asked — */
var twa = boot(TWA);
var twaResult = null;
twa.P.purchase('premium_6m', 'u1', { onDone: function (r) { twaResult = r; } });
ok('★★ a purchase attempt in Play mode returns PROVIDER_UNAVAILABLE',
  twaResult && twaResult.code === 'PROVIDER_UNAVAILABLE', twaResult && twaResult.code);
ok('★★ …and reports the play provider, never razorpay', twaResult && twaResult.provider === 'play');
ok('★★ …and NEVER constructed Razorpay', twa.spy.razorpayConstructed === 0);
ok('★★ …and NEVER appended the checkout.js script', twa.spy.scriptsAppended.length === 0,
  twa.spy.scriptsAppended.join(','));
ok('★★ …and NEVER called create-order', twa.spy.fetches.length === 0, twa.spy.fetches.join(','));
ok('★ preloading in Play mode is a no-op (no SDK warmed)',
  (function () { twa.P.preloadProvider(); return twa.spy.scriptsAppended.length === 0; })());

/* — fail-safe: no platform module at all must NOT fall back to Razorpay — */
(function () {
  var sb = { console: { warn: function () {}, info: function () {} }, Promise: Promise };
  sb.self = sb; sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC.gateway, sb, { filename: 'gateway.js' });
  vm.runInContext(SRC.play, sb, { filename: 'play-provider.js' });
  ok('★ with QRPlatform absent the facade does NOT choose razorpay', sb.QRPayments.providerId() !== 'razorpay');
  ok('★ …and refuses to purchase', sb.QRPayments.canPurchase() === false);
})();

/* — determinism: the payment path must not change under the user mid-checkout — */
var det = boot(TWA);
ok('provider selection is deterministic across calls',
  det.P.providerId() === det.P.providerId() && det.P.providerId() === 'play');
var detWeb = boot({});
ok('…and equally deterministic on the web', detWeb.P.providerId() === 'razorpay');

/* — restore is provider-neutral and always server-routed — */
['web', 'play'].forEach(function (mode) {
  var b = boot(mode === 'play' ? TWA : {});
  var called = false, gotArg = null;
  b.sb.FirestoreSync = { refreshFromServer: function (cb) { called = true; cb(true); } };
  b.P.restore(function (r) { gotArg = r; });
  ok('★ restore works in ' + mode + ' mode (a web purchaser can unlock a Play build)', called === true);
  ok('restore reports the server result in ' + mode + ' mode', gotArg === true);
});
(function () {
  /* Restore must never fabricate success when the canonical path is unavailable. */
  var b = boot(TWA);
  var got = 'untouched';
  b.P.restore(function (r) { got = r; });
  ok('★★ restore with no canonical path reports FAILURE, never a fabricated success', got === false);
})();

/* — the normalised vocabulary is closed and provider-free — */
var codes = Object.keys(web.P.RESULT);
ok('the result vocabulary is provider-neutral',
  codes.every(function (c) { return !/razorpay|play|google/i.test(c); }), codes.join(','));
ok('PROVIDER_UNAVAILABLE exists as a first-class outcome', codes.indexOf('PROVIDER_UNAVAILABLE') !== -1);

/* — pricing + plan ids unchanged by WS4 — */
var pwSrc = R('js/paywall.js');
ok('₹299 / ₹399 display prices intact', /premium_6m:\s*\{[^}]*price:\s*299/.test(pwSrc) && /premium_12m:\s*\{[^}]*price:\s*399/.test(pwSrc));
ok('no retired ₹499 price point in the paywall', !/price:\s*499/.test(pwSrc));
ok('plan ids unchanged', /premium_6m/.test(pwSrc) && /premium_12m/.test(pwSrc));

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
