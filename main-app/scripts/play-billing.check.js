/**
 * play-billing.check.js — Google Play purchase verification (ADR-145, Phase-4 WS5).
 *
 * Drives the REAL `services/playBillingService.js` and the REAL `api/payment.js ?action=verify-play`
 * against an in-memory Firestore whose transactions BUFFER writes exactly as the real one does, with
 * Google's REST API and its auth library replaced by a controllable stub. So "what does the server do
 * when Google says X?" is ANSWERED here rather than assumed — for every X that matters.
 *
 * THE HEADLINE ASSERTIONS
 *   T5  a PENDING purchase grants NOTHING (the money has not moved)
 *   T7  the same purchase token cannot grant Premium to a SECOND account
 *   T9  a Google 5xx/timeout NEVER grants and NEVER reports a terminal failure — it stays retryable,
 *       because a transport fault is not evidence about a purchase, and a customer who paid must
 *       remain recoverable
 *   T11 an unknown productId cannot buy a plan (the server allowlist, not the client, decides)
 *   T14 with PLAY_PACKAGE_NAME unset — the state of the world today — every path refuses
 *
 * NO NETWORK, NO node_modules. `google-auth-library` and `fetch` are both stubbed, so this suite runs
 * in a bare checkout exactly like every other suite in the chain.
 *
 * CANNOT be covered here, and deliberately not faked: anything requiring a real Play Console
 * application — a genuine purchase token, a real acknowledgement, a real voided-purchase event.
 * Those are BLOCKED until the store exists; see docs/BIBLE/PLAY_CONSOLE_HANDOFF.md.
 *
 *   node scripts/play-billing.check.js
 */
'use strict';
var path = require('path');
function appPath(p) { return path.join(__dirname, '..', p); }

var DAY = 24 * 60 * 60 * 1000;
var NOW = Date.now();
function iso(ms) { return new Date(ms).toISOString(); }
function hoursAgo(h) { return NOW - h * 60 * 60 * 1000; }

/* ───────── in-memory firestore stub (write-buffering transactions) ───────── */
var COL, CLAIMS;
function reset() { COL = { users: {}, payments: {}, securityEvents: {}, paymentOrphans: {}, refundRequests: {} }; CLAIMS = {}; }
reset();

var _autoId = 0;
var FieldValue = { serverTimestamp: function () { return { __ts: true }; } };

function _write(col, id, data, opts) {
  var store = COL[col] || (COL[col] = {});
  if (opts && opts.merge && store[id]) store[id] = Object.assign({}, store[id], data);
  else store[id] = Object.assign({}, data);
}

/* Subcollection writes (users/{uid}/entitlementLogs) land in a flat side store — this suite only ever
   needs to assert that they happened, not to query them. */
var SUBS = {};
function docRef(col, id) {
  return {
    id: id, __col: col,
    collection: function (sub) {
      var key = col + '/' + id + '/' + sub;
      return {
        doc: function (sid) { return subDocRef(key, sid || ('auto_' + (++_autoId))); },
        add: function (d) { var sid = 'auto_' + (++_autoId); (SUBS[key] || (SUBS[key] = {}))[sid] = d; return Promise.resolve(subDocRef(key, sid)); }
      };
    },
    get: function () {
      var v = COL[col] ? COL[col][id] : undefined;
      return Promise.resolve({ exists: v !== undefined, id: id, data: function () { return v; } });
    },
    set: function (d, o) { _write(col, id, d, o); return Promise.resolve(); },
    create: function (d) {
      if (COL[col] && COL[col][id] !== undefined) return Promise.reject(new Error('ALREADY_EXISTS'));
      _write(col, id, d); return Promise.resolve();
    },
    update: function (d) { _write(col, id, d, { merge: true }); return Promise.resolve(); },
    delete: function () { if (COL[col]) delete COL[col][id]; return Promise.resolve(); }
  };
}
function subDocRef(key, sid) {
  return {
    id: sid, __sub: key,
    set: function (d) { (SUBS[key] || (SUBS[key] = {}))[sid] = d; return Promise.resolve(); },
    get: function () { var v = (SUBS[key] || {})[sid]; return Promise.resolve({ exists: v !== undefined, data: function () { return v; } }); }
  };
}

function query(col, filters) {
  return {
    where: function (f, op, v) { return query(col, filters.concat([[f, op, v]])); },
    limit: function () { return query(col, filters); },
    orderBy: function () { return query(col, filters); },
    get: function () {
      var store = COL[col] || {};
      var rows = Object.keys(store).filter(function (k) {
        return filters.every(function (f) {
          var actual = store[k][f[0]];
          if (f[1] === '==') return actual === f[2];
          if (f[1] === '<') return actual < f[2];
          if (f[1] === '>') return actual > f[2];
          return true;
        });
      });
      return Promise.resolve({
        empty: rows.length === 0, size: rows.length,
        forEach: function (fn) { rows.forEach(function (k) { fn({ id: k, ref: docRef(col, k), data: function () { return store[k]; } }); }); },
        docs: rows.map(function (k) { return { id: k, ref: docRef(col, k), data: function () { return store[k]; } }; })
      });
    }
  };
}

function collection(col) {
  var q = query(col, []);
  return {
    doc: function (id) { return docRef(col, id || ('auto_' + (++_autoId))); },
    add: function (d) { var id = 'auto_' + (++_autoId); _write(col, id, d); return Promise.resolve(docRef(col, id)); },
    where: q.where, limit: q.limit, orderBy: q.orderBy, get: q.get
  };
}

var dbStub = {
  collection: collection,
  batch: function () {
    var ops = [];
    return { set: function (r, d, o) { ops.push([r, d, o]); }, delete: function (r) { ops.push([r, null]); },
      commit: function () { ops.forEach(function (o) { if (o[1] === null) o[0].delete(); else _write(o[0].__col, o[0].id, o[1], o[2]); }); return Promise.resolve(); } };
  },
  runTransaction: function (fn) {
    /* Writes BUFFER: a write is not visible to a read inside the same transaction, exactly as
       Firestore behaves. The grant path depends on this. */
    var buffered = [];
    var tx = {
      get: function (ref) { return ref.get(); },
      set: function (ref, d, o) {
        buffered.push(function () {
          if (ref.__sub) { (SUBS[ref.__sub] || (SUBS[ref.__sub] = {}))[ref.id] = d; return; }
          _write(ref.__col, ref.id, d, o);
        });
      },
      create: function (ref, d) {
        buffered.push(function () {
          if (COL[ref.__col] && COL[ref.__col][ref.id] !== undefined) throw new Error('ALREADY_EXISTS');
          _write(ref.__col, ref.id, d);
        });
      },
      update: function (ref, d) { buffered.push(function () { _write(ref.__col, ref.id, d, { merge: true }); }); },
      delete: function (ref) { buffered.push(function () { delete COL[ref.__col][ref.id]; }); }
    };
    return Promise.resolve(fn(tx)).then(function (r) { buffered.forEach(function (w) { w(); }); return r; });
  }
};

var adminStub = {
  apps: [{}], initializeApp: function () {}, credential: { cert: function () { return {}; }, applicationDefault: function () { return {}; } },
  firestore: function () { return dbStub; },
  auth: function () {
    return {
      getUser: function (uid) { return Promise.resolve({ uid: uid, customClaims: CLAIMS[uid] || {} }); },
      setCustomUserClaims: function (uid, c) { CLAIMS[uid] = c; return Promise.resolve(); }
    };
  }
};
adminStub.firestore.FieldValue = FieldValue;

/* ───────── the Google stub ───────── */
/* One controllable object. Every test sets GOOGLE.* and then asserts what the server did with it. */
var GOOGLE = {
  purchase: null,        /* the JSON purchases.products.get returns */
  status: 200,           /* the HTTP status it returns */
  throwNetwork: false,   /* simulate a timeout / DNS failure */
  badJson: false,
  acks: [],              /* every :acknowledge URL that was called */
  gets: [],              /* every products.get URL that was called */
  ackStatus: 200
};
function resetGoogle() {
  GOOGLE.purchase = { purchaseState: 0, orderId: 'GPA.TEST-0001', purchaseTimeMillis: String(hoursAgo(2)), acknowledgementState: 0, consumptionState: 0 };
  GOOGLE.status = 200; GOOGLE.throwNetwork = false; GOOGLE.badJson = false;
  GOOGLE.acks = []; GOOGLE.gets = []; GOOGLE.ackStatus = 200;
}
resetGoogle();

global.fetch = function (url, opts) {
  var isAck = /:acknowledge$/.test(url);
  if (isAck) GOOGLE.acks.push(url); else GOOGLE.gets.push(url);
  if (GOOGLE.throwNetwork) return Promise.reject(new Error('socket hang up'));
  var status = isAck ? GOOGLE.ackStatus : GOOGLE.status;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: function () {
      if (GOOGLE.badJson) return Promise.reject(new Error('Unexpected end of JSON input'));
      return Promise.resolve(isAck ? {} : GOOGLE.purchase);
    }
  });
};

var middlewareStub = { withAuth: function (fn) { return fn; }, methodGuard: function () { return false; }, parseBody: function (r) { return r.body || {}; } };
var FLAGS = { paymentKillSwitch: false, playBilling: true };

var Module = require('module'); var orig = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return adminStub;
  if (request === 'openai') return function OpenAI() { return {}; };
  if (request === 'google-auth-library') {
    /* Never loaded in this suite — playBillingService's auth factory is injected below. Stubbed so a
       bare checkout with no node_modules cannot fail on the require itself. */
    return { GoogleAuth: function () { return { getAccessToken: function () { return Promise.resolve('stub'); } }; } };
  }
  if (/_lib\/middleware$/.test(request)) return middlewareStub;
  if (/_lib\/config-flags$/.test(request)) return { isEnabled: function (n) { return Promise.resolve(!!FLAGS[n]); } };
  if (/services\/paymentService$/.test(request)) {
    return { getPlanConfig: function () { return null; }, fetchOrder: function () { return Promise.reject(new Error('n/a')); }, PLAN_CONFIG: {} };
  }
  return orig.apply(this, arguments);
};

process.env.PLAY_PACKAGE_NAME = 'com.example.test.fixture';   /* TEST FIXTURE — never a real package */
process.env.PLAY_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'fixture@example.invalid', private_key: 'FIXTURE-NOT-A-KEY' });

var playBilling = require(appPath('services/playBillingService.js'));
playBilling._setAuthFactory(function () { return { getAccessToken: function () { return Promise.resolve({ token: 'stub-token', expirationTime: iso(NOW + 3600000) }); } }; });
var aiService = require(appPath('services/aiService.js'));
var paymentApi = require(appPath('api/payment.js'));

/* ───────── harness ───────── */
var pass = 0, fail = 0;
function ok(c, m, d) { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }
function payment(id) { return COL.payments[id]; }
function user(uid) { return COL.users[uid]; }
/* Field-reading accessors that never throw. An assertion whose PRECONDITION failed must report as a
   failed assertion, not as a TypeError that aborts the run — otherwise one broken guard hides every
   assertion after it, and a mutation test cannot tell which guards are actually load-bearing. */
function P(id) { return COL.payments[id] || {}; }
function U(uid) { return COL.users[uid] || {}; }

function verifyPlay(uid, productId, purchaseToken) {
  var out = { status: 200, body: null };
  var res = { status: function (s) { out.status = s; return res; }, json: function (b) { out.body = b; return out; } };
  return paymentApi({ method: 'POST', query: { action: 'verify-play' }, body: { productId: productId, purchaseToken: purchaseToken }, userId: uid }, res)
    .then(function () { return out; });
}
function playConfig(uid) {
  var out = { status: 200, body: null };
  var res = { status: function (s) { out.status = s; return res; }, json: function (b) { out.body = b; return out; } };
  return paymentApi({ method: 'POST', query: { action: 'play-config' }, body: {}, userId: uid }, res).then(function () { return out; });
}

console.log('Google Play purchase verification (ADR-145, WS5)\n');

(async function () {

  /* ── T1 — the product allowlist is the ONLY route from a client string to a plan ───────────── */
  ok(playBilling.planTypeForProduct('premium_6m') === 'premium_6m', 'T1 premium_6m resolves');
  ok(playBilling.planTypeForProduct('premium_12m') === 'premium_12m', 'T1 premium_12m resolves');
  ok(playBilling.planTypeForProduct('premium_lifetime') === null, 'T1 an unknown product resolves to null');
  ok(playBilling.planTypeForProduct('') === null && playBilling.planTypeForProduct(null) === null, 'T1 empty/null resolve to null');
  ok(playBilling.planTypeForProduct('constructor') === null,
    'T1 ★ a prototype-chain key ("constructor") is NOT a product — hasOwnProperty, not truthiness');
  ok(playBilling.planTypeForProduct('toString') === null, 'T1 ★ "toString" is not a product either');

  /* ── T2 — the doc id is a deterministic function of the token, and only the token ──────────── */
  var idA = playBilling.paymentDocId('token-A');
  ok(idA === playBilling.paymentDocId('token-A'), 'T2 the same token always yields the same id (it IS the idempotency key)');
  ok(idA !== playBilling.paymentDocId('token-B'), 'T2 different tokens yield different ids');
  ok(/^gp_[0-9a-f]{64}$/.test(idA), 'T2 the id matches the gp_<sha256> scheme firestore.rules already documents', idA);
  ok(idA.indexOf('token-A') === -1, 'T2 the raw token — a bearer credential — is not stored in the key');

  /* ── T3 — a clean purchase grants exactly once, with GOOGLE's capture time ─────────────────── */
  reset(); resetGoogle();
  var capturedAt = hoursAgo(3);
  GOOGLE.purchase.purchaseTimeMillis = String(capturedAt);
  var r3 = await verifyPlay('u1', 'premium_6m', 'tok-3');
  var id3 = playBilling.paymentDocId('tok-3');
  ok(r3.status === 200 && r3.body.success === true, 'T3 a purchased token grants', JSON.stringify(r3.body));
  ok(U('u1').plan === 'premium' && U('u1').planSource === 'purchase', 'T3 the user becomes premium');
  ok(P(id3).provider === 'play', 'T3 ★ the row records provider:play (a refund cannot be executed without it)');
  ok(P(id3).status === 'paid' && P(id3).plan === 'premium_6m', 'T3 status paid, correct plan');
  ok(P(id3).capturedAtMs === capturedAt && P(id3).capturedAtSource === 'gateway',
    'T3 ★ ADR-143: the 24h window starts at GOOGLE\'s purchaseTimeMillis, never at our grant time');
  ok(P(id3).amountSource === 'catalog',
    'T3 ★ Google does not report what was paid, so the catalog price is recorded and LABELLED as such');
  ok(P(id3).amountMismatch === undefined, 'T3 …and that does not fire the amount-mismatch alarm');
  ok(P(id3).orderId === 'GPA.TEST-0001', 'T3 Google\'s orderId is recorded');
  ok(P(id3).days === 182, 'T3 the term length is recorded on the row');

  /* ── T4 — acknowledgement happens, and AFTER the grant ─────────────────────────────────────── */
  ok(GOOGLE.acks.length === 1, 'T4 ★ the purchase is acknowledged (Google auto-refunds unacknowledged purchases in 3 days)');
  ok(P(id3).acknowledged === true, 'T4 the row records that it was acknowledged');
  ok(GOOGLE.gets.length >= 1 && GOOGLE.gets[0].indexOf('/purchases/products/premium_6m/tokens/tok-3') !== -1,
    'T4 the product + token are addressed exactly as given', GOOGLE.gets[0]);
  ok(GOOGLE.gets[0].indexOf('com.example.test.fixture') !== -1,
    'T4 ★ the package name comes from OUR environment as a path segment — there is no client-supplied package to spoof');

  /* ── T5 — PENDING grants nothing ───────────────────────────────────────────────────────────── */
  reset(); resetGoogle();
  GOOGLE.purchase.purchaseState = 2;
  var r5 = await verifyPlay('u5', 'premium_6m', 'tok-5');
  var id5 = playBilling.paymentDocId('tok-5');
  ok(r5.status === 200 && r5.body.success === false && r5.body.pending === true, 'T5 ★ a pending purchase reports pending, not success');
  ok(!user('u5') || U('u5').plan !== 'premium', 'T5 ★★ a pending purchase grants NO entitlement');
  ok(payment(id5) && P(id5).status === 'pending', 'T5 a pending row is reserved so the later RTDN can complete it against a known uid');
  ok(P(id5).capturedAtMs === null && P(id5).capturedAtSource === 'unknown',
    'T5 ★ no capture time is invented for money that has not moved');
  ok(GOOGLE.acks.length === 0, 'T5 nothing is acknowledged — there is nothing to acknowledge yet');

  /* ── T5b — the pending row later completes, and does NOT keep the pending capture state ────── */
  GOOGLE.purchase.purchaseState = 0;
  GOOGLE.purchase.purchaseTimeMillis = String(hoursAgo(1));
  var r5b = await verifyPlay('u5', 'premium_6m', 'tok-5');
  ok(r5b.body.success === true, 'T5b the same token, now purchased, completes the pending row');
  ok(U('u5').plan === 'premium', 'T5b …and the entitlement is granted');
  ok(P(id5).status === 'paid' && P(id5).capturedAtSource === 'gateway',
    'T5b the completed row carries a real capture time');

  /* ── T6 — repeated verification of the SAME token by the SAME user is idempotent ───────────── */
  reset(); resetGoogle();
  await verifyPlay('u6', 'premium_6m', 'tok-6');
  var exp6 = U('u6').planExpiry;
  var r6 = await verifyPlay('u6', 'premium_6m', 'tok-6');
  ok(r6.status === 200 && r6.body.success === true, 'T6 a repeated verification still answers success (the client may legitimately retry)');
  ok(U('u6').planExpiry === exp6, 'T6 ★★ …but the expiry does NOT move — one token can never extend twice');

  /* ── T7 — the same token cannot grant to a SECOND account ──────────────────────────────────── */
  var r7 = await verifyPlay('u7-thief', 'premium_6m', 'tok-6');
  ok(r7.status === 409 && r7.body.error.code === 'PAYMENT_REPLAY',
    'T7 ★★ a purchase token stolen/replayed into another account is refused', JSON.stringify(r7.body));
  ok(!user('u7-thief') || U('u7-thief').plan !== 'premium', 'T7 ★★ …and that account gets nothing');

  /* ── T8 — a refunded purchase cannot be re-redeemed ────────────────────────────────────────── */
  reset(); resetGoogle();
  await verifyPlay('u8', 'premium_6m', 'tok-8');
  var id8 = playBilling.paymentDocId('tok-8');
  await aiService.revokePayment('u8', id8, { reason: 'play_voided' });
  var r8 = await verifyPlay('u8', 'premium_6m', 'tok-8');
  ok(r8.status === 409 && r8.body.error.code === 'PAYMENT_REFUNDED',
    'T8 ★ a refunded Play purchase cannot be redeemed again', JSON.stringify(r8.body));

  /* ── T9 — Google unreachable / 5xx: never grant, never terminal ────────────────────────────── */
  reset(); resetGoogle();
  GOOGLE.throwNetwork = true;
  var r9 = await verifyPlay('u9', 'premium_6m', 'tok-9');
  ok(r9.status === 503 && r9.body.error.retryable === true,
    'T9 ★★ a network failure is RETRYABLE, never a terminal refusal', JSON.stringify(r9.body));
  ok(!user('u9') || U('u9').plan !== 'premium', 'T9 ★★ …and grants nothing');

  reset(); resetGoogle();
  GOOGLE.status = 503;
  var r9b = await verifyPlay('u9b', 'premium_6m', 'tok-9b');
  ok(r9b.status === 503 && r9b.body.error.retryable === true, 'T9b a Google 5xx is retryable');
  ok(!user('u9b') || U('u9b').plan !== 'premium', 'T9b ★★ a 5xx never grants optimistically');

  reset(); resetGoogle();
  GOOGLE.status = 401;
  var r9c = await verifyPlay('u9c', 'premium_6m', 'tok-9c');
  ok(r9c.status === 503 && r9c.body.error.retryable === true,
    'T9c ★ a credentials rejection is retryable — it becomes correct once the service account is invited, and a paid purchase must survive that');
  ok(!user('u9c') || U('u9c').plan !== 'premium', 'T9c …and grants nothing meanwhile');

  reset(); resetGoogle();
  GOOGLE.badJson = true;
  var r9d = await verifyPlay('u9d', 'premium_6m', 'tok-9d');
  ok(!user('u9d') || U('u9d').plan !== 'premium', 'T9d ★ a malformed Google response never grants');
  ok(r9d.status === 503, 'T9d …and is treated as transient, not as "no such purchase"');

  /* ── T10 — an unrecognised purchase 404s terminally ────────────────────────────────────────── */
  reset(); resetGoogle();
  GOOGLE.status = 404;
  var r10 = await verifyPlay('u10', 'premium_6m', 'tok-bogus');
  ok(r10.status === 400 && r10.body.error.retryable === false,
    'T10 an invalid token is a TERMINAL refusal (retrying cannot help)', JSON.stringify(r10.body));
  ok(!user('u10') || U('u10').plan !== 'premium', 'T10 …and grants nothing');

  /* ── T11 — the client cannot name a product we do not sell ─────────────────────────────────── */
  reset(); resetGoogle();
  var r11 = await verifyPlay('u11', 'premium_1rupee_test', 'tok-11');
  ok(r11.status === 400 && r11.body.error.code === 'PLAN_MISMATCH',
    'T11 ★★ an unknown productId is refused BEFORE Google is contacted', JSON.stringify(r11.body));
  ok(GOOGLE.gets.length === 0, 'T11 ★ …and Google is never asked about it at all');
  ok(!user('u11') || U('u11').plan !== 'premium', 'T11 …and nothing is granted');

  /* ── T12 — cancelled / unknown purchase states never grant ─────────────────────────────────── */
  reset(); resetGoogle();
  GOOGLE.purchase.purchaseState = 1;
  var r12 = await verifyPlay('u12', 'premium_6m', 'tok-12');
  ok(r12.status === 409 && !user('u12'), 'T12 ★ a CANCELLED purchase grants nothing');

  reset(); resetGoogle();
  GOOGLE.purchase.purchaseState = 47;   /* a Google enum we have never seen */
  var r12b = await verifyPlay('u12b', 'premium_6m', 'tok-12b');
  ok(r12b.status === 409 && !user('u12b'),
    'T12b ★★ an UNRECOGNISED purchaseState grants nothing — a future enum cannot fall through to "purchased"');

  /* ── T13 — malformed input is rejected, and bounded ────────────────────────────────────────── */
  reset(); resetGoogle();
  ok((await verifyPlay('u13', '', 'tok')).status === 400, 'T13 an empty productId is refused');
  ok((await verifyPlay('u13', 'premium_6m', '')).status === 400, 'T13 an empty purchaseToken is refused');
  ok((await verifyPlay('u13', 'premium_6m', 'x'.repeat(5000))).status === 400, 'T13 an over-long token is refused');
  ok(GOOGLE.gets.length === 0, 'T13 ★ none of these reached Google');

  /* ── T14 — WITH NO SERVICE-ACCOUNT CREDENTIALS, EVERY PATH REFUSES ─────────────────────────────
     ADR-147 moved the goalposts here, and the test moved with them. The Play Console application now
     exists, so the package name is a known constant and can no longer be "missing". What can still be
     missing is the credential that lets us ask Google anything — so that is the absence this asserts.
     The property being protected is unchanged: no Play path may proceed on incomplete configuration. */
  reset(); resetGoogle();
  var savedSa = process.env.PLAY_SERVICE_ACCOUNT, savedFb = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.PLAY_SERVICE_ACCOUNT; delete process.env.FIREBASE_SERVICE_ACCOUNT;
  ok(playBilling.isConfigured() === false, 'T14 ★ isConfigured() is false with no service account');
  ok(playBilling.configState() === 'no_service_account', 'T14 …and says why');
  var r14 = await verifyPlay('u14', 'premium_6m', 'tok-14');
  ok(r14.status === 503 && r14.body.error.code === 'PLAY_NOT_CONFIGURED',
    'T14 ★★ verify-play refuses outright', JSON.stringify(r14.body));
  ok(!user('u14'), 'T14 ★★ …and grants nothing');
  ok(GOOGLE.gets.length === 0, 'T14 ★ …and never contacts Google');
  var c14 = await playConfig('u14');
  ok(c14.body.enabled === false && c14.body.skus.length === 0,
    'T14 ★★ play-config tells the client NO, so it never opens a payment sheet the server would refuse');
  process.env.PLAY_SERVICE_ACCOUNT = savedSa; process.env.FIREBASE_SERVICE_ACCOUNT = savedFb;

  /* ── T14b — the canonical package identity (ADR-147) ────────────────────────────────────────── */
  (function () {
    var savedPkg = process.env.PLAY_PACKAGE_NAME;
    delete process.env.PLAY_PACKAGE_NAME;
    ok(playBilling.packageName() === 'com.quantreflex.app',
      'T14b ★★ with no override, the package name is the REAL Play Console application id',
      playBilling.packageName());
    ok(playBilling.CANONICAL_PACKAGE_NAME === 'com.quantreflex.app',
      'T14b the canonical constant is exported so a ratchet can pin it');
    process.env.PLAY_PACKAGE_NAME = 'com.example.other';
    ok(playBilling.packageName() === 'com.example.other',
      'T14b ★ an explicit override still wins (staging, and this suite\'s own fixture)');
    process.env.PLAY_PACKAGE_NAME = savedPkg;
    ok(playBilling.packageName() === savedPkg, 'T14b …and the override is restored cleanly');
  })();

  /* ── T15 — the operator switches ───────────────────────────────────────────────────────────── */
  reset(); resetGoogle();
  FLAGS.playBilling = false;
  var r15 = await verifyPlay('u15', 'premium_6m', 'tok-15');
  ok(r15.status === 503 && r15.body.error.code === 'PLAY_BILLING_DISABLED', 'T15 config/playBilling off ⇒ reader mode');
  ok((await playConfig('u15')).body.enabled === false, 'T15 …and play-config agrees');
  ok(!user('u15'), 'T15 …and nothing is granted');
  FLAGS.playBilling = true;

  reset(); resetGoogle();
  FLAGS.paymentKillSwitch = true;
  var r15b = await verifyPlay('u15b', 'premium_6m', 'tok-15b');
  ok(r15b.status === 503 && r15b.body.error.code === 'PAYMENTS_DISABLED',
    'T15b ★ the emergency payment kill switch stops Play too, not just Razorpay');
  ok((await playConfig('u15b')).body.enabled === false, 'T15b …and play-config reports it');
  FLAGS.paymentKillSwitch = false;

  /* ── T16 — an already-premium user MUST still be granted ───────────────────────────────────── */
  reset(); resetGoogle();
  COL.users['u16'] = { plan: 'premium', planType: 'premium_6m', planExpiry: iso(NOW + 100 * DAY), planSource: 'purchase', isTrial: false };
  var r16 = await verifyPlay('u16', 'premium_12m', 'tok-16');
  ok(r16.status === 200 && r16.body.success === true,
    'T16 ★★ a Play purchase by an ALREADY-premium user is honoured — the money has already moved, so refusing would charge for nothing');
  ok(Date.parse(U('u16').planExpiry) > NOW + 100 * DAY,
    'T16 ★ …and it EXTENDS the existing term rather than replacing it (no-shorten)');

  /* ── T17 — interleaved verification of one token grants once ───────────────────────────────────
     SCOPE, stated honestly: this exercises two overlapping in-flight requests, which is the case a
     double-tapping client actually produces. It is NOT a multi-process contention test — the stub
     commits deterministically and does not replay the transaction body the way Firestore does under
     write contention. True contention safety rests on `payments/{id}` being a single-document
     transactional lock, which T6/T7/T8 prove is load-bearing by mutation. */
  reset(); resetGoogle();
  var both = await Promise.all([verifyPlay('u17', 'premium_6m', 'tok-17'), verifyPlay('u17', 'premium_6m', 'tok-17')]);
  var granted = both.filter(function (r) { return r.body && r.body.success === true; });
  ok(granted.length >= 1, 'T17 concurrent verification succeeds');
  var id17 = playBilling.paymentDocId('tok-17');
  ok(payment(id17) && P(id17).days === 182, 'T17 exactly one term is recorded on the row');
  ok(Date.parse(U('u17').planExpiry) < NOW + 200 * DAY,
    'T17 ★★ two concurrent verifications cannot stack two terms', U('u17').planExpiry);

  /* ── T18 — acknowledgement failure does NOT lose the customer their access ─────────────────── */
  reset(); resetGoogle();
  GOOGLE.ackStatus = 500;
  var r18 = await verifyPlay('u18', 'premium_6m', 'tok-18');
  var id18 = playBilling.paymentDocId('tok-18');
  ok(r18.body.success === true && U('u18').plan === 'premium',
    'T18 ★★ a failed acknowledgement never blocks a grant the user already paid for');
  ok(P(id18).acknowledged === false,
    'T18 ★ …but the row records acknowledged:false so reconciliation retries it before Google auto-refunds');

  /* ── T19 — an already-acknowledged purchase is not acknowledged twice ──────────────────────── */
  reset(); resetGoogle();
  GOOGLE.purchase.acknowledgementState = 1;
  await verifyPlay('u19', 'premium_6m', 'tok-19');
  ok(GOOGLE.acks.length === 0, 'T19 a purchase Google already reports as acknowledged is not re-acknowledged');
  ok(payment(playBilling.paymentDocId('tok-19')).acknowledged === true, 'T19 …and the row still records it');

  /* ── T20 — play-config exposes exactly the sellable products ──────────────────────────────── */
  reset(); resetGoogle();
  var c20 = await playConfig('u20');
  ok(c20.body.enabled === true, 'T20 with everything configured, play-config says yes');
  ok(c20.body.skus.length === 2 && c20.body.skus.indexOf('premium_6m') !== -1 && c20.body.skus.indexOf('premium_12m') !== -1,
    'T20 …and lists exactly the two sellable products', JSON.stringify(c20.body.skus));

  /* ── T21 — the refund layer sees the provider ─────────────────────────────────────────────── */
  reset(); resetGoogle();
  GOOGLE.purchase.purchaseTimeMillis = String(hoursAgo(1));
  await verifyPlay('u21', 'premium_6m', 'tok-21');
  var p21 = payment(playBilling.paymentDocId('tok-21'));
  var refundPolicy = require(appPath('services/refundPolicy.js'));
  var el21 = refundPolicy.eligibility(p21.capturedAtMs, NOW);
  ok(el21.state === 'eligible',
    'T21 ★ a Play purchase 1h old is refund-ELIGIBLE under the same 24h rule as Razorpay');
  var p21b = { capturedAtMs: hoursAgo(30) };
  ok(refundPolicy.eligibility(p21b.capturedAtMs, NOW).state === 'expired',
    'T21 ★ …and a 30h-old one is expired — one rule, no provider branch');
  ok(p21.provider === 'play',
    'T21 ★★ the row names its provider, so an approved refund can be EXECUTED in the right place');

  /* ── T22 — a Razorpay grant still records provider:razorpay (no regression) ────────────────── */
  reset();
  await aiService.activatePremium('u22', 'premium_6m', 'pay_rzp_22', 'order_22', { amountPaise: 29900, currency: 'INR', capturedAtMs: hoursAgo(2) });
  ok(P('pay_rzp_22').provider === 'razorpay',
    'T22 ★ a grant with no provider stated defaults to razorpay — true of every row written before WS5');
  ok(P('pay_rzp_22').amountSource === 'gateway', 'T22 …and Razorpay still records gateway-reported evidence');

  reset();
  await aiService.activatePremium('u22b', 'premium_6m', 'pay_22b', null, { amountPaise: 29900, provider: 'not_a_real_provider' });
  ok(P('pay_22b').provider === 'razorpay',
    'T22b ★★ an unrecognised provider is NOT written through — a third provider nothing can refund against cannot be invented by a caller');

  /* ── T23 — provider is back-filled onto a legacy row, and never overwritten ────────────────── */
  reset();
  COL.payments['legacy_1'] = { uid: 'u23', plan: 'premium_6m', status: 'paid', days: 182, expiry: iso(NOW + 100 * DAY), claimedAt: iso(hoursAgo(500)) };
  await aiService.activatePremium('u23', 'premium_6m', 'legacy_1', null, { amountPaise: 29900 });
  ok(P('legacy_1').provider === 'razorpay', 'T23 a replay back-fills provider onto a row written before the field existed');

  reset();
  COL.payments['gp_x'] = { uid: 'u23b', plan: 'premium_6m', status: 'paid', days: 182, provider: 'play', expiry: iso(NOW + 100 * DAY), claimedAt: iso(hoursAgo(5)) };
  await aiService.activatePremium('u23b', 'premium_6m', 'gp_x', null, { amountPaise: 29900 });
  ok(P('gp_x').provider === 'play',
    'T23b ★★ a row that already names its provider is NEVER overwritten by the default');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
