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
  consumes: [],          /* every :consume URL that was called (ADR-149) */
  gets: [],              /* every products.get URL that was called */
  ackStatus: 200,
  consumeStatus: 200
};
function resetGoogle() {
  GOOGLE.purchase = { purchaseState: 0, orderId: 'GPA.TEST-0001', purchaseTimeMillis: String(hoursAgo(2)), acknowledgementState: 0, consumptionState: 0 };
  GOOGLE.status = 200; GOOGLE.throwNetwork = false; GOOGLE.badJson = false;
  GOOGLE.acks = []; GOOGLE.consumes = []; GOOGLE.gets = []; GOOGLE.ackStatus = 200; GOOGLE.consumeStatus = 200;
}
resetGoogle();

global.fetch = function (url, opts) {
  /* Three distinct endpoints, counted separately. Lumping :consume in with the products.get branch
     would make every "Google was never contacted" assertion below silently weaker. */
  var isAck = /:acknowledge$/.test(url);
  var isConsume = /:consume$/.test(url);
  if (isAck) GOOGLE.acks.push(url);
  else if (isConsume) GOOGLE.consumes.push(url);
  else GOOGLE.gets.push(url);
  if (GOOGLE.throwNetwork) return Promise.reject(new Error('socket hang up'));
  var status = isAck ? GOOGLE.ackStatus : (isConsume ? GOOGLE.consumeStatus : GOOGLE.status);
  /* A SUCCESSFUL write changes what Google would say next — model that, rather than making each test
     hand-set the flag. Without this the stub claims a purchase is still unacknowledged after we just
     acknowledged it, and "does not repeat work Google already did" can only be tested by fiat. */
  if (status >= 200 && status < 300) {
    if (isAck) GOOGLE.purchase.acknowledgementState = 1;
    if (isConsume) GOOGLE.purchase.consumptionState = 1;
  }
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: function () {
      if (GOOGLE.badJson) return Promise.reject(new Error('Unexpected end of JSON input'));
      return Promise.resolve((isAck || isConsume) ? {} : GOOGLE.purchase);
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
/* Drives the CRON_SECRET-gated reconcile sweep, so T24 can prove the repair actually happens. */
function reconcile() {
  process.env.CRON_SECRET = process.env.CRON_SECRET || 'fixture-cron-secret';
  var out = { status: 200, body: null };
  var res = { status: function (s) { out.status = s; return res; }, json: function (b) { out.body = b; return out; } };
  return Promise.resolve(paymentApi({
    method: 'POST', query: { action: 'play-reconcile' },
    headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, body: {}
  }, res)).then(function () { return out; });
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

  /* ── T24 — a granted row is ALWAYS reconcilable, even if every post-grant write fails ──────────
     THE REGRESSION THIS SUITE EXISTS TO PREVENT (ADR-148).

     `purchaseToken` used to be written only AFTER the grant, in a swallowed try/catch. If that write
     failed the row carried no token AND no `acknowledged` field, so it matched neither half of the
     reconcile sweep (`provider=='play' && acknowledged==false` — a MISSING field does not match
     `== false`). Google then auto-refunds the unacknowledged purchase after three days while the user
     keeps the Premium the grant already committed: money returned, access retained, and nothing in
     the system able to notice.

     Simulated by failing BOTH post-grant operations — the acknowledgement and the flag write. */
  reset(); resetGoogle();
  GOOGLE.ackStatus = 500;                        /* acknowledgement fails */
  var blockPostGrant = true;
  var origCollection = dbStub.collection;
  dbStub.collection = function (name) {
    var col = origCollection(name);
    if (name !== 'payments') return col;
    var origDoc = col.doc;
    col.doc = function (id) {
      var ref = origDoc(id);
      var origSetFn = ref.set;
      ref.set = function (d, o) {
        /* Reject exactly the post-grant flag write; leave the reservation and the grant alone. */
        if (blockPostGrant && d && d.acknowledged !== undefined && d.provider === 'play' && !d.status) {
          return Promise.reject(new Error('simulated Firestore failure'));
        }
        return origSetFn(d, o);
      };
      return ref;
    };
    return col;
  };
  var r24 = await verifyPlay('u24', 'premium_6m', 'tok-24');
  dbStub.collection = origCollection;             /* restore before asserting */
  var id24 = playBilling.paymentDocId('tok-24');

  ok(r24.body.success === true && U('u24').plan === 'premium',
    'T24 the grant still succeeds when both post-grant writes fail (the user paid)', JSON.stringify(r24.body));
  ok(P(id24).purchaseToken === 'tok-24',
    'T24 ★★ the row STILL carries its purchase token — reconciliation can re-ask Google',
    JSON.stringify(P(id24).purchaseToken));
  ok(P(id24).acknowledged === false,
    'T24 ★★ …and acknowledged is FALSE, not missing, so the sweep query actually matches it',
    String(P(id24).acknowledged));
  ok(P(id24).provider === 'play' && P(id24).productId === 'premium_6m',
    'T24 …with provider and productId intact');

  /* And prove the repair actually happens: reconciliation must now find and fix this row. */
  resetGoogle();
  var recon24 = await reconcile();
  ok(recon24.body.result.acknowledged === 1,
    'T24 ★★ a later reconcile run FINDS the row and completes the acknowledgement',
    JSON.stringify(recon24.body.result));
  ok(P(id24).acknowledged === true, 'T24 …and the row is repaired');

  /* ── T25 — CONSUMPTION, i.e. whether the customer can ever buy again (ADR-149) ────────────────
     A one-time Play product stays OWNED until it is consumed, and Google refuses a second purchase of
     an owned SKU. QuantReflex sells a 182/365-day term that is MEANT to be re-bought, so failing to
     consume is a bug whose symptom appears six months after the first sale: the customer's access
     lapses, they try to renew in the Play app, and Play tells them they already own it. */
  resetGoogle(); reset();
  var r25 = await verifyPlay('u25', 'premium_6m', 'tok-25');
  var id25 = playBilling.paymentDocId('tok-25');
  ok(r25.body && r25.body.success === true, 'T25 the purchase is granted');
  ok(GOOGLE.consumes.length === 1, 'T25 ★★ the purchase is CONSUMED, so the SKU can be bought again on renewal');
  ok(GOOGLE.consumes[0].indexOf('/purchases/products/premium_6m/tokens/tok-25') !== -1,
    'T25 …addressing the same product + token', GOOGLE.consumes[0]);
  ok(P(id25).consumed === true, 'T25 the row records that it was consumed');
  ok(GOOGLE.acks.length === 1 && GOOGLE.acks[0].length > 0,
    'T25 ★ acknowledgement still happens — consuming does not replace it');

  /* T25b ORDER: never consume something that was not acknowledged. Handing the SKU back before the
     three-day acknowledgement deadline is met would risk both the refund AND the entitlement. */
  resetGoogle(); reset();
  GOOGLE.ackStatus = 500;
  await verifyPlay('u25b', 'premium_6m', 'tok-25b');
  ok(GOOGLE.consumes.length === 0,
    'T25b ★★ a purchase whose acknowledgement FAILED is not consumed');
  ok(P(playBilling.paymentDocId('tok-25b')).consumed === false,
    'T25b …and the row says so, so the sweep retries both steps');

  /* T25c a consume failure never costs the customer their access */
  resetGoogle(); reset();
  GOOGLE.consumeStatus = 500;
  var r25c = await verifyPlay('u25c', 'premium_6m', 'tok-25c');
  ok(r25c.body && r25c.body.success === true,
    'T25c ★★ a failed consumption never blocks a grant the user already paid for');
  ok(P(playBilling.paymentDocId('tok-25c')).acknowledged === true &&
     P(playBilling.paymentDocId('tok-25c')).consumed === false,
    'T25c …the row is acknowledged but records consumed:false for the sweep');

  /* T25d …and the sweep finds it. This is the half that would silently rot: the row is acknowledged,
     so the ORIGINAL `acknowledged == false` query would never see it again. */
  GOOGLE.consumeStatus = 200; GOOGLE.acks = []; GOOGLE.consumes = [];
  var recon25 = await reconcile();
  ok(recon25.body.result.scanned === 1,
    'T25d ★★ the sweep finds an acknowledged-but-unconsumed row (the ack-only query would miss it)',
    JSON.stringify(recon25.body.result));
  ok(GOOGLE.consumes.length === 1 && P(playBilling.paymentDocId('tok-25c')).consumed === true,
    'T25d …and consumes it, restoring the customer\'s ability to renew');
  ok(GOOGLE.acks.length === 0,
    'T25d ★ …without re-acknowledging what Google already reports as acknowledged');

  /* T25e a purchase Google already reports as consumed is not consumed twice */
  resetGoogle(); reset();
  GOOGLE.purchase.consumptionState = 1;
  await verifyPlay('u25e', 'premium_6m', 'tok-25e');
  ok(GOOGLE.consumes.length === 0, 'T25e an already-consumed purchase is not consumed again');
  ok(P(playBilling.paymentDocId('tok-25e')).consumed === true, 'T25e …and the row still records it');

  /* ── T26 — a purchase must never be invisible to the safety net (ADR-149) ─────────────────────
     verify-play's own comment promised "reconciliation catches it even if the client never comes
     back". On the retryable branch that was false: no row had been written yet, and reconciliation
     sweeps `payments`. A first verification that hit a Google outage produced a paid purchase with no
     record anywhere — unacknowledged, so Google auto-refunded it three days later. */
  resetGoogle(); reset();
  GOOGLE.status = 503;
  var r26 = await verifyPlay('u26', 'premium_6m', 'tok-26');
  var id26 = playBilling.paymentDocId('tok-26');
  ok(r26.status === 503 && r26.body.error.retryable === true, 'T26 a Google outage answers 503/retryable');
  ok(P(id26).uid === 'u26' && P(id26).purchaseToken === 'tok-26',
    'T26 ★★ …and the row is RESERVED anyway, so the purchase is visible to reconciliation');
  ok(P(id26).status === 'pending' && U('u26').plan !== 'premium',
    'T26 ★★ …while granting nothing — a reservation is not an entitlement');

  /* T26b and the sweep then completes it once Google is reachable: this is a customer who PAID and,
     before this fix, would have been acknowledged-and-closed with no Premium at all. */
  resetGoogle();
  var recon26 = await reconcile();
  ok(recon26.body.result.granted === 1,
    'T26b ★★ reconciliation GRANTS the reserved purchase rather than silently closing it',
    JSON.stringify(recon26.body.result));
  ok(U('u26').plan === 'premium' && U('u26').planSource === 'purchase',
    'T26b ★★ …the customer who paid now actually has Premium');
  ok(P(id26).status === 'paid' && P(id26).acknowledged === true && P(id26).consumed === true,
    'T26b …and the row is settled only after the grant committed');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
