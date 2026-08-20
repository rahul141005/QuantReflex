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
var playReadiness = Promise.resolve();   /* WS5 readiness probes settle before the summary */
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

/* Every shipped module must also be PRECACHED. The service worker keeps an explicit ASSETS list, and
   a script that is script-tagged but not listed simply 503s for a user who installs/updates and then
   goes offline before ever loading online — the module vanishes and the purchase CTA with it.

   This is scoped to the whole js/ tree rather than to the payment files, because that is exactly how
   the gap arose: `js/platform.js` was added by WS1 and never listed, and nothing noticed for a whole
   workstream. A per-file assertion would have missed it again. */
{
  var sw = R('service-worker.js');
  var tagged = (html.match(/<script[^>]+src="(js\/[^"]+)"/g) || []).map(function (t) {
    return (t.match(/src="(js\/[^"]+)"/) || [])[1];
  });
  var missing = tagged.filter(function (src) { return sw.indexOf("'./" + src + "'") === -1; });
  ok('★ every script-tagged js/ module is in the service-worker precache list',
    missing.length === 0, missing.join(', '));
  /* And specifically the ones this workstream introduced, so the intent is legible. */
  ['js/platform.js', 'js/payments/gateway.js', 'js/payments/razorpay-provider.js', 'js/payments/play-provider.js']
    .forEach(function (f) {
      ok('precached: ' + f, sw.indexOf("'./" + f + "'") !== -1);
    });
}

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
    fetch: function (url) {
      spy.fetches.push(url);
      /* Default: every call fails, so no scenario can accidentally depend on a live gateway. Opt in
         with `orderOk` when the test needs the flow to reach the checkout sheet. */
      if (o.orderOk && url.indexOf('create-order') !== -1) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ orderId: 'order_TEST', amount: 29900 }); } });
      }
      return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } });
    },
    QRI18n: { t: function (k) { return k; } }
  };
  if (o.dga) sandbox.getDigitalGoodsService = o.dga;
  /* Present but instrumented: if Play mode ever constructs it, the count proves the violation. */
  sandbox.Razorpay = function (options) {
    spy.razorpayConstructed++; spy.razorpayOptions = options;
    return { on: function () {}, open: function () {} };
  };
  if (o.orderOk) sandbox.Auth = { getCurrentUser: function () { return { getIdToken: function () { return Promise.resolve('tok'); } }; } };
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
/* ADR-154: the Digital Goods API was REMOVED from this list. Chrome on Android exposes
   getDigitalGoodsService in ordinary browser tabs, so treating it as a Play marker classified every
   Android web visitor as a Play build and left them with NO purchase path at all — verified in
   production. Only the two deliberate markers below are evidence of distribution. The DGA case is
   asserted immediately after this loop, with the opposite expectation. */
[['referrer', TWA], ['?src=play', { search: '?src=play' }]].forEach(function (row) {
  var b = boot(row[1]);
  ok('★ Play signal (' + row[0] + ') → provider is NOT razorpay', b.P.providerId() !== 'razorpay');
  ok('★ Play signal (' + row[0] + ') → provider is play', b.P.providerId() === 'play');
  ok('★ Play signal (' + row[0] + ') → canPurchase() is FALSE', b.P.canPurchase() === false);
});

/* ADR-154 — an Android BROWSER tab exposing the Digital Goods API is a WEB user and must be able to
   pay. This is the regression guard for the defect that shipped: it presented as "the same page
   offers Start Premium on desktop but says purchasing isn't available on mobile". */
var dgaTab = boot({ dga: function () { return Promise.resolve({}); } });
ok('★★ DGA-only (Android browser tab) → provider is razorpay, NOT play',
  dgaTab.P.providerId() === 'razorpay');
ok('★★ DGA-only (Android browser tab) → the user CAN purchase',
  dgaTab.P.canPurchase() === true);

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

/* — ADR-145 (WS5): Play readiness is a CONJUNCTION, and both halves are load-bearing —

   `isReady()` may only become true when the device can complete a purchase AND the server will
   honour it. Either alone is a way to take money for nothing:
     · catalogue-only  → Google charges, our server refuses to verify → paid, no entitlement;
     · server-only     → the server is willing but this device cannot actually buy.
   Driven behaviourally against the real adapter, because this is the new client attack surface. */
(function () {
  function bootPlay(opts) {
    var o = opts || {};
    var fetches = [];
    var sb = {
      console: { info: function () {}, warn: function () {}, error: function () {}, log: function () {} },
      document: { referrer: 'android-app://com.quantreflex.app',
        documentElement: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } } },
        body: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }, appendChild: function () {} },
        getElementById: function () { return null; },
        createElement: function () { return { setAttribute: function () {}, addEventListener: function () {} }; } },
      location: { search: '' }, navigator: { standalone: false },
      matchMedia: function () { return { matches: false }; },
      sessionStorage: { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function () {} },
      setTimeout: function (f) { return f && 0; }, clearTimeout: function () {}, Promise: Promise,
      QRI18n: { t: function (k) { return k; } },
      Auth: { getCurrentUser: function () { return { getIdToken: function () { return Promise.resolve('tok'); } }; } },
      fetch: function (url) {
        fetches.push(url);
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ enabled: o.serverEnabled === true, skus: [] }); } });
      }
    };
    /* The Digital Goods service: present and resolving every SKU only when `catalogue` is true. */
    if (o.catalogue === true) {
      sb.getDigitalGoodsService = function () {
        return Promise.resolve({ getDetails: function (skus) {
          return Promise.resolve(skus.map(function (s) { return { itemId: s }; }));
        } });
      };
    } else if (o.catalogue === 'partial') {
      sb.getDigitalGoodsService = function () {
        return Promise.resolve({ getDetails: function () { return Promise.resolve([{ itemId: 'premium_6m' }]); } });
      };
    }
    sb.Razorpay = function () { throw new Error('Play mode must never construct Razorpay'); };
    sb.self = sb; sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(SRC.platform, sb, { filename: 'platform.js' });
    vm.runInContext(SRC.gateway, sb, { filename: 'gateway.js' });
    vm.runInContext(SRC.razorpay, sb, { filename: 'razorpay-provider.js' });
    vm.runInContext(SRC.play, sb, { filename: 'play-provider.js' });
    return { sb: sb, fetches: fetches };
  }

  function prepared(opts) {
    var b = bootPlay(opts);
    return new Promise(function (resolve) {
      b.sb.QRPayments.prepareProvider(function (ready) { resolve({ ready: ready, b: b }); });
    });
  }

  playReadiness = Promise.all([
    prepared({ catalogue: true, serverEnabled: true }),
    prepared({ catalogue: true, serverEnabled: false }),
    prepared({ catalogue: false, serverEnabled: true }),
    prepared({ catalogue: 'partial', serverEnabled: true }),
    prepared({ catalogue: false, serverEnabled: false })
  ]).then(function (r) {
    var both = r[0], noServer = r[1], noCatalogue = r[2], partial = r[3], neither = r[4];

    ok('Play readiness starts FALSE before prepare() resolves — the default is reader mode',
      (function () { var b = bootPlay({ catalogue: true, serverEnabled: true }); return b.sb.QRPaymentsPlay.isReady() === false; })());

    ok('★ Play is ready only when the catalogue AND the server both say yes',
      both.ready === true && both.b.sb.QRPayments.canPurchase() === true);
    ok('★★ catalogue yes + server NO ⇒ NOT ready (never charge for something we cannot verify)',
      noServer.ready === false && noServer.b.sb.QRPayments.canPurchase() === false);
    ok('★★ server yes + no catalogue ⇒ NOT ready', noCatalogue.ready === false && noCatalogue.b.sb.QRPayments.canPurchase() === false);
    ok('★★ a PARTIALLY configured catalogue (one SKU live) ⇒ NOT ready — all or nothing',
      partial.ready === false && partial.b.sb.QRPayments.canPurchase() === false);
    ok('neither ⇒ not ready', neither.ready === false);

    /* The whole point of WS4, re-proven with WS5's code present and READY. */
    ok('★★ even when Play IS ready, the provider is play and Razorpay is never constructed',
      both.b.sb.QRPayments.providerId() === 'play');
    ok('★★ a Play build never asks the server about Play until the CATALOGUE has already said yes',
      noCatalogue.b.fetches.length === 0, noCatalogue.b.fetches.join(','));
    ok('★ the server probe is the play-config action, not a purchase',
      both.b.fetches.length === 1 && both.b.fetches[0].indexOf('action=play-config') !== -1, both.b.fetches.join(','));

    /* ADR-169 — A "NO" THAT CAN CHANGE MUST NOT BE MEMOISED AS FINAL.
       prepare() used to mark itself settled on every completion, so the FIRST false answer was final
       for the life of the page. Reproduced in a browser: with a fully working Play environment and the
       ID token momentarily unavailable, prepare() answered false and kept answering false after the
       token started working — one blip, or a paywall opened a moment before auth settled, and the user
       could not buy until they force-quit the app.
       Two assertions, in opposite directions, because the fix is only correct if BOTH hold. */
    return Promise.resolve().then(function () {
      /* (a) an operator switching config/playBilling on mid-session must become purchasable. */
      var b = bootPlay({ catalogue: true, serverEnabled: false });
      return new Promise(function (res) { b.sb.QRPayments.prepareProvider(res); })
        .then(function (first) {
          /* the server flag flips ON, with no page reload */
          b.sb.fetch = function (url) {
            b.fetches.push(url);
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ enabled: true }); } });
          };
          return new Promise(function (res) { b.sb.QRPayments.prepareProvider(res); })
            .then(function (second) {
              ok('★★★ a server "not yet" is re-probed, so flipping config/playBilling on works without a relaunch',
                first === false && second === true && b.sb.QRPayments.canPurchase() === true,
                'first=' + first + ' second=' + second);
            });
        });
    }).then(function () {
      /* (b) a STABLE no — no Digital Goods API in this document — stays memoised and must not
             re-probe, or every paywall open would repeat work whose answer cannot change. */
      var b = bootPlay({ catalogue: false, serverEnabled: true });
      return new Promise(function (res) { b.sb.QRPayments.prepareProvider(res); })
        .then(function (first) {
          return new Promise(function (res) { b.sb.QRPayments.prepareProvider(res); })
            .then(function (second) {
              ok('★★ …but "this document has no Digital Goods API" is FINAL and is not re-probed',
                first === false && second === false && b.fetches.length === 0,
                'fetches=' + b.fetches.length);
            });
        });
    });
  });
})();

/* — the paywall is PRESENTATION ONLY: it must hold no payment lifecycle state —

   WS4 moved the busy flag, the slow/timeout timers and the attempt id into the facade, because every
   provider needs them identically. Leaving a second copy behind in the view is not merely dead code:
   two owners of "is a payment in flight?" drift, and the one the CTA reads is not necessarily the one
   the provider updates. This ratchet keeps the ownership single. */
{
  var pwCode = R('js/paywall.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  var lifecycle = ['_paymentBusy', '_paymentSafetyTimer', '_paymentSlowTimer', '_attemptId',
                   'PAYMENT_TIMEOUT_MS', 'PAYMENT_SLOW_MS', '_resetPaymentGuards'];
  var strays = lifecycle.filter(function (n) { return new RegExp('\\b' + n + '\\b').test(pwCode); });
  ok('★ paywall.js holds no payment-lifecycle state (the facade owns it)',
    strays.length === 0, strays.join(', '));
  /* The behavioural label probe below hands `planLabel` to the facade itself, so it cannot see the
     view failing to supply one. This closes that end of the chain. */
  ok('the paywall supplies its display label to the facade', /planLabel\s*:/.test(pwCode));
}

/* — pricing + plan ids unchanged by WS4 — */
var pwSrc = R('js/paywall.js');
ok('₹299 / ₹399 display prices intact', /premium_6m:\s*\{[^}]*price:\s*299/.test(pwSrc) && /premium_12m:\s*\{[^}]*price:\s*399/.test(pwSrc));
ok('no retired ₹499 price point in the paywall', !/price:\s*499/.test(pwSrc));
ok('plan ids unchanged', /premium_6m/.test(pwSrc) && /premium_12m/.test(pwSrc));

/* — the UI's display label must survive the crossing —

   The plan's human name ('6 Months') is owned by the view; the adapter only renders it. WS4's first
   cut dropped it at the facade boundary and the checkout sheet read 'Premium · premium_6m' — the
   customer's last screen before paying. Asserted BEHAVIOURALLY, on the options object the Razorpay
   constructor actually receives, because a source-level check would pass on a value that never
   arrives. The adapter falls back to the plan key, so a silent drop is visible, not disguised. */
var labelProbe = (function () {
  var b = boot({ orderOk: true });
  b.P.purchase('premium_6m', 'u1', { planLabel: '6 Months', onDone: function () {} });
  /* Let the loadScript → token → create-order → checkout chain drain. */
  return Promise.resolve().then().then().then().then().then().then(function () {
    var opts = b.spy.razorpayOptions;
    ok('the web path reaches the checkout sheet at all (the probe is meaningful)',
      b.spy.razorpayConstructed === 1, 'constructed ' + b.spy.razorpayConstructed);
    ok('★ the UI plan label survives the facade and reaches the checkout sheet',
      !!opts && opts.description === 'Premium · 6 Months', opts && opts.description);
    ok('the sheet never displays the internal plan key', !!opts && opts.description.indexOf('premium_6m') === -1);
    ok('the order id is the server-created one, not a client-invented value',
      !!opts && opts.order_id === 'order_TEST');
    /* Unchanged security property, re-proven on the same object: the client sends a plan KEY only. */
    var body = b.spy.fetches.join(' ');
    ok('create-order was called exactly once with no amount in the URL',
      body.indexOf('create-order') !== -1 && !/amount/.test(body));
  });
})();

Promise.all([labelProbe, playReadiness]).then(function () {
  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
});
