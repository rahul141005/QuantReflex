/**
 * play-rtdn.check.js — Google Play Real-Time Developer Notifications (ADR-146, Phase-4 WS6).
 *
 * Drives the REAL `api/payment/play-rtdn.js` against an in-memory Firestore and a controllable Google,
 * plus the REAL `?action=play-reconcile` sweep.
 *
 * THE DESIGN UNDER TEST: the notification body is a HINT, never evidence. The handler reads only the
 * purchase token out of it and then asks Google what is true. Every hard case in the brief —
 * duplicate, out-of-order, replayed, forged — reduces to that one decision, and the tests below are
 * written to prove it rather than to assert it.
 *
 * THE HEADLINE ASSERTIONS
 *   T4  a forged/unauthenticated notification is refused, and reaches nothing
 *   T7  a stale PURCHASED arriving AFTER a void cannot resurrect the entitlement (out-of-order)
 *   T8  a VOIDED purchase revokes with NO eligibility check — Google may refund at any age (ADR-143)
 *   T10 a transient failure returns 500 so Pub/Sub REDELIVERS; acking would discard real money
 *   T14 reconciliation repairs a missed RTDN without RTDN ever running
 *
 * NO NETWORK, NO node_modules.
 *
 * CANNOT be covered here, and deliberately not faked: a real Pub/Sub delivery, a real OIDC token from
 * Google, a real voided-purchase event. BLOCKED until the Play Console application exists.
 *
 *   node scripts/play-rtdn.check.js
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


var rtdn = require(appPath('api/payment/play-rtdn.js'));
rtdn._setOidcVerifier(function (token) { return Promise.resolve(token === 'valid-oidc'); });

process.env.PLAY_RTDN_SECRET = 'fixture-rtdn-secret';   /* TEST FIXTURE */

/* ───────── harness ───────── */
var pass = 0, fail = 0;
function ok(c, m, d) { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d ? ' — ' + d : '')); } }
function payment(id) { return COL.payments[id]; }
function user(uid) { return COL.users[uid]; }
function P(id) { return COL.payments[id] || {}; }
function U(uid) { return COL.users[uid] || {}; }

/** Build a Pub/Sub push envelope around a developer notification. */
function envelope(note) {
  return { message: { data: Buffer.from(JSON.stringify(note), 'utf8').toString('base64'), messageId: 'm1' }, subscription: 's' };
}
function purchasedNote(token, sku) {
  return { version: '1.0', packageName: 'com.example.test.fixture', eventTimeMillis: String(NOW),
    oneTimeProductNotification: { version: '1.0', notificationType: 1, purchaseToken: token, sku: sku || 'premium_6m' } };
}
function voidedNote(token, orderId) {
  return { version: '1.0', packageName: 'com.example.test.fixture', eventTimeMillis: String(NOW),
    voidedPurchaseNotification: { purchaseToken: token, orderId: orderId || 'GPA.VOID-1', productType: 1, refundType: 1 } };
}

function post(body, opts) {
  var o = opts || {};
  var out = { status: 200, body: null };
  var res = { setHeader: function () { return res; }, status: function (s) { out.status = s; return res; }, json: function (b) { out.body = b; return out; } };
  var req = {
    method: o.method || 'POST',
    query: { key: ('key' in o) ? o.key : 'fixture-rtdn-secret' },
    headers: o.headers || {},
    body: body
  };
  return Promise.resolve(rtdn(req, res)).then(function () { return out; });
}

var paymentApi = require(appPath('api/payment.js'));
function reconcile(secret) {
  var out = { status: 200, body: null };
  var res = { status: function (s) { out.status = s; return res; }, json: function (b) { out.body = b; return out; } };
  return Promise.resolve(paymentApi({
    method: 'POST', query: { action: 'play-reconcile' },
    headers: { authorization: 'Bearer ' + (secret === undefined ? process.env.CRON_SECRET : secret) }, body: {}
  }, res)).then(function () { return out; });
}

/** A granted Play purchase, exactly as verify-play would have left it. */
async function seedPlayPayment(uid, token, opts) {
  var o = opts || {};
  var id = playBilling.paymentDocId(token);
  await aiService.activatePremium(uid, 'premium_6m', id, 'GPA.SEED', {
    provider: 'play', capturedAtMs: o.capturedAtMs || hoursAgo(2), currency: 'INR'
  });
  await dbStub.collection('payments').doc(id).set({
    provider: 'play', productId: 'premium_6m', purchaseToken: token,
    acknowledged: o.acknowledged === undefined ? true : o.acknowledged
  }, { merge: true });
  return id;
}

console.log('Google Play RTDN + reconciliation (ADR-146, WS6)\n');

(async function () {
  process.env.CRON_SECRET = 'fixture-cron-secret';   /* TEST FIXTURE */

  /* ── T1 — method + envelope hygiene ─────────────────────────────────────────────────────────── */
  reset(); resetGoogle();
  ok((await post(envelope(purchasedNote('t1')), { method: 'GET' })).status === 405, 'T1 GET is refused');
  ok((await post({ not: 'a pubsub envelope' })).status === 200, 'T1 a non-envelope body is ACKED, not retried forever');
  ok((await post({ message: { data: 'not-base64-json!!' } })).status === 200, 'T1 an undecodable payload is acked');
  ok(GOOGLE.gets.length === 0, 'T1 ★ none of these reached Google');

  /* ── T2 — the Play connectivity test notification ───────────────────────────────────────────── */
  reset(); resetGoogle();
  var r2 = await post(envelope({ version: '1.0', packageName: 'com.example.test.fixture', testNotification: { version: '1.0' } }));
  ok(r2.status === 200 && r2.body.test === true, 'T2 Play\'s test notification succeeds (this is how the topic is verified)');
  ok(GOOGLE.gets.length === 0, 'T2 …and touches nothing');

  /* ── T3 — a notification for ANOTHER application is ignored ─────────────────────────────────── */
  reset(); resetGoogle();
  var foreign = purchasedNote('t3'); foreign.packageName = 'com.someone.else';
  var r3 = await post(envelope(foreign));
  ok(r3.status === 200 && r3.body.reason === 'wrong_package', 'T3 ★ a notification naming another package is ignored');
  ok(GOOGLE.gets.length === 0 && !user('anyone'), 'T3 …and grants nothing');

  /* ── T4 — AUTHENTICATION ────────────────────────────────────────────────────────────────────── */
  reset(); resetGoogle();
  var r4 = await post(envelope(purchasedNote('t4')), { key: 'wrong-secret' });
  ok(r4.status === 401, 'T4 ★★ a wrong shared secret is refused');
  ok(GOOGLE.gets.length === 0, 'T4 ★★ …and the forged notification reaches nothing at all');
  ok((await post(envelope(purchasedNote('t4')), { key: '' })).status === 401, 'T4 a missing secret is refused');

  var savedSecret = process.env.PLAY_RTDN_SECRET;
  delete process.env.PLAY_RTDN_SECRET;
  ok((await post(envelope(purchasedNote('t4')))).status === 500,
    'T4 ★★ an UNSET server secret is a 500, never an open door');
  process.env.PLAY_RTDN_SECRET = savedSecret;

  /* OIDC, enforced only once an audience is configured (it cannot exist before Pub/Sub does). */
  process.env.PLAY_RTDN_AUDIENCE = 'https://example.invalid/api/payment/play-rtdn';
  ok((await post(envelope(purchasedNote('t4b')), { headers: {} })).status === 401,
    'T4 ★ with an audience configured, a missing OIDC bearer is refused');
  ok((await post(envelope(purchasedNote('t4c')), { headers: { authorization: 'Bearer forged' } })).status === 401,
    'T4 ★★ …and an invalid OIDC token is refused');
  reset(); resetGoogle();
  var r4d = await post(envelope(purchasedNote('t4d')), { headers: { authorization: 'Bearer valid-oidc' } });
  ok(r4d.status === 200, 'T4 a valid OIDC token is accepted', JSON.stringify(r4d.body));
  delete process.env.PLAY_RTDN_AUDIENCE;

  /* ── T5 — a PURCHASED notification for a known payment grants ───────────────────────────────── */
  reset(); resetGoogle();
  var id5 = playBilling.paymentDocId('t5');
  await dbStub.collection('payments').doc(id5).set({ uid: 'u5', plan: 'premium_6m', provider: 'play', status: 'pending', acknowledged: false });
  GOOGLE.purchase.purchaseTimeMillis = String(hoursAgo(1));
  var r5 = await post(envelope(purchasedNote('t5')));
  ok(r5.status === 200 && r5.body.status === 'granted', 'T5 a PURCHASED notification completes a reserved pending row', JSON.stringify(r5.body));
  ok(U('u5').plan === 'premium', 'T5 …and the user becomes premium');
  ok(P(id5).capturedAtSource === 'gateway', 'T5 ★ with GOOGLE\'s capture time, not ours');
  ok(GOOGLE.acks.length === 1 && P(id5).acknowledged === true, 'T5 ★ and it is acknowledged (Google auto-refunds unacknowledged purchases)');

  /* ── T6 — DUPLICATE / replayed notifications are no-ops ─────────────────────────────────────── */
  var exp6 = U('u5').planExpiry;
  await post(envelope(purchasedNote('t5')));
  await post(envelope(purchasedNote('t5')));
  ok(U('u5').planExpiry === exp6, 'T6 ★★ duplicate notifications cannot extend the entitlement');

  /* ── T7 — OUT-OF-ORDER: a stale PURCHASED after a void must not resurrect ───────────────────── */
  reset(); resetGoogle();
  var id7 = await seedPlayPayment('u7', 't7');
  await post(envelope(voidedNote('t7')));
  ok(P(id7).status === 'refunded', 'T7 the void revoked the payment');
  var premiumAfterVoid = U('u7').plan;
  /* Google now reports it as cancelled — the re-fetch, not the message order, decides. */
  GOOGLE.purchase.purchaseState = 1;
  var r7 = await post(envelope(purchasedNote('t7')));
  ok(r7.status === 200 && r7.body.status === 'ignored',
    'T7 ★★ a stale PURCHASED arriving after the void is ignored', JSON.stringify(r7.body));
  ok(U('u7').plan === premiumAfterVoid, 'T7 ★★ …and the revoked entitlement is NOT resurrected');

  /* And the harder variant: Google still says purchased, but our row is terminal. */
  reset(); resetGoogle();
  var id7b = await seedPlayPayment('u7b', 't7b');
  await aiService.revokePayment('u7b', id7b, { reason: 'play_voided' });
  var r7b = await post(envelope(purchasedNote('t7b')));
  ok(r7b.status === 200 && r7b.body.reason === 'refunded',
    'T7b ★★ even with Google still reporting PURCHASED, a refunded row refuses the re-grant', JSON.stringify(r7b.body));

  /* ── T8 — VOIDED revokes with NO eligibility check, at ANY age (ADR-143) ────────────────────── */
  reset(); resetGoogle();
  var id8 = await seedPlayPayment('u8', 't8', { capturedAtMs: hoursAgo(24 * 40) });   /* 40 days old */
  ok(U('u8').plan === 'premium', 'T8 precondition: the user is premium');
  var r8 = await post(envelope(voidedNote('t8')));
  ok(r8.status === 200 && r8.body.status === 'revoked',
    'T8 ★★ a Google refund 40 DAYS after capture still revokes — our 24h window governs REQUESTS, not Google', JSON.stringify(r8.body));
  ok(P(id8).status === 'refunded', 'T8 ★ the payment row is terminal so it can never be re-redeemed');

  /* ── T9 — a void for an unknown purchase is recorded, never guessed at ──────────────────────── */
  reset(); resetGoogle();
  var r9 = await post(envelope(voidedNote('t9-unknown')));
  ok(r9.status === 200 && r9.body.status === 'orphaned', 'T9 a void we cannot attribute becomes an orphan for human review');
  ok(Object.keys(COL.paymentOrphans).length === 1, 'T9 ★ …recorded, not silently dropped');

  /* ── T10 — TRANSIENT failure ⇒ 500 so Pub/Sub redelivers ────────────────────────────────────── */
  reset(); resetGoogle();
  await dbStub.collection('payments').doc(playBilling.paymentDocId('t10')).set({ uid: 'u10', plan: 'premium_6m', provider: 'play', status: 'pending' });
  GOOGLE.throwNetwork = true;
  var r10 = await post(envelope(purchasedNote('t10')));
  ok(r10.status === 500, 'T10 ★★ a Google outage returns 500 so the notification is REDELIVERED, never acked away', JSON.stringify(r10.body));
  ok(!user('u10') || U('u10').plan !== 'premium', 'T10 ★★ …and nothing is granted optimistically');

  reset(); resetGoogle();
  GOOGLE.status = 503;
  ok((await post(envelope(purchasedNote('t10b')))).status === 500, 'T10b a Google 5xx is also redelivered');

  /* ── T11 — a TERMINAL Google answer is acked, not retried forever ───────────────────────────── */
  reset(); resetGoogle();
  GOOGLE.status = 404;
  var r11 = await post(envelope(purchasedNote('t11')));
  ok(r11.status === 200, 'T11 an unknown token is ACKED — redelivering it forever cannot help');
  ok(!user('anyone'), 'T11 …and grants nothing');

  /* ── T12 — the product allowlist applies to notifications too ───────────────────────────────── */
  reset(); resetGoogle();
  var r12 = await post(envelope(purchasedNote('t12', 'premium_1rupee_test')));
  ok(r12.status === 200 && r12.body.reason === 'unknown_product',
    'T12 ★★ a notification naming a product we do not sell cannot grant', JSON.stringify(r12.body));
  ok(GOOGLE.gets.length === 0, 'T12 ★ …and Google is never asked about it');

  /* ── T13 — unhandled notification shapes are ignored, never guessed ─────────────────────────── */
  reset(); resetGoogle();
  var subNote = { packageName: 'com.example.test.fixture', subscriptionNotification: { notificationType: 4, purchaseToken: 'x', subscriptionId: 'y' } };
  ok((await post(envelope(subNote))).body.reason === 'subscriptions_not_sold',
    'T13 ★ a SUBSCRIPTION notification is ignored — we sell one-time products only');
  var cancelled = purchasedNote('t13'); cancelled.oneTimeProductNotification.notificationType = 2;
  ok((await post(envelope(cancelled))).body.reason === 'cancelled', 'T13 a CANCELLED one-time notification is a no-op, not a revocation');
  var weird = purchasedNote('t13b'); weird.oneTimeProductNotification.notificationType = 99;
  ok((await post(envelope(weird))).body.reason === 'unknown_type', 'T13 ★ an unknown notificationType is ignored, never treated as a purchase');
  ok(GOOGLE.gets.length === 0, 'T13 ★ none of these reached Google');

  /* ── T14 — RECONCILIATION repairs a missed RTDN, with RTDN never running ────────────────────── */
  reset(); resetGoogle();
  var id14 = await seedPlayPayment('u14', 't14', { acknowledged: false });
  var r14 = await reconcile();
  ok(r14.status === 200 && r14.body.result.acknowledged === 1,
    'T14 ★★ reconciliation acknowledges a purchase whose acknowledgement was missed', JSON.stringify(r14.body));
  ok(P(id14).acknowledged === true, 'T14 ★ …and the row records it, so the next run skips it');
  ok(GOOGLE.acks.length === 1, 'T14 …by actually calling Google');

  /* ── T15 — reconciliation revokes a purchase voided while RTDN was down ─────────────────────── */
  reset(); resetGoogle();
  var id15 = await seedPlayPayment('u15', 't15', { acknowledged: false });
  ok(U('u15').plan === 'premium', 'T15 precondition: premium');
  GOOGLE.purchase.purchaseState = 1;                    /* Google now says cancelled */
  var r15 = await reconcile();
  ok(r15.body.result.revoked === 1, 'T15 ★★ the degraded mode still catches a refund RTDN never delivered', JSON.stringify(r15.body));
  ok(P(id15).status === 'refunded', 'T15 ★ …and the row is terminal');

  /* ── T16 — reconciliation NEVER grants, and leaves pending rows alone ───────────────────────── */
  reset(); resetGoogle();
  await dbStub.collection('payments').doc('gp_pending').set({
    uid: 'u16', plan: 'premium_6m', provider: 'play', productId: 'premium_6m', purchaseToken: 't16',
    status: 'pending', acknowledged: false
  });
  GOOGLE.purchase.purchaseState = 2;
  var r16 = await reconcile();
  ok(r16.body.result.pending === 1, 'T16 a still-pending purchase is counted and left alone');
  ok(!user('u16'), 'T16 ★★ reconciliation NEVER grants an entitlement — it can only repair or revoke');
  ok(GOOGLE.acks.length === 0, 'T16 …and does not acknowledge money that has not moved');

  /* ── T17 — reconciliation authentication + honest reporting ─────────────────────────────────── */
  reset(); resetGoogle();
  ok((await reconcile('wrong')).status === 401, 'T17 ★ reconciliation requires CRON_SECRET');
  var savedCron = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  ok((await reconcile('anything')).status === 500, 'T17 ★★ an unset CRON_SECRET is a 500, never an open cron');
  process.env.CRON_SECRET = savedCron;

  reset(); resetGoogle();
  var savedPkg = process.env.PLAY_PACKAGE_NAME;
  delete process.env.PLAY_PACKAGE_NAME;
  var r17 = await reconcile();
  ok(r17.status === 200 && r17.body.skipped === 'not_configured',
    'T17 ★ with no Play configuration reconciliation is a reported NO-OP, not a failure', JSON.stringify(r17.body));
  var r17b = await post(envelope(purchasedNote('t17')));
  ok(r17b.status === 500,
    'T17 ★★ but an RTDN arriving while unconfigured returns 500 — acking it would DISCARD a real purchase');
  process.env.PLAY_PACKAGE_NAME = savedPkg;

  /* ── T18 — a row with no stored token is skipped, never guessed at ──────────────────────────── */
  reset(); resetGoogle();
  await dbStub.collection('payments').doc('gp_notoken').set({
    uid: 'u18', plan: 'premium_6m', provider: 'play', status: 'paid', acknowledged: false
  });
  var r18 = await reconcile();
  ok(r18.body.result.skipped === 1 && r18.body.result.acknowledged === 0,
    'T18 ★ the doc id is only the token\'s HASH, so a row without the token is skipped rather than guessed', JSON.stringify(r18.body));

  /* ── T19 — Razorpay rows are never touched by the Play reconciler ───────────────────────────── */
  reset(); resetGoogle();
  await aiService.activatePremium('u19', 'premium_6m', 'pay_rzp_19', 'order_19', { amountPaise: 29900, capturedAtMs: hoursAgo(2) });
  ok(P('pay_rzp_19').acknowledged === undefined,
    'T19 a Razorpay row carries no `acknowledged` field at all — Play acknowledgement is not its concern');
  /* The field-absence above already excludes Razorpay from the sweep, so asserting on it alone would
     pass even if the provider filter were deleted. Force the harder case: a Razorpay row that DOES
     carry acknowledged:false. Only the provider filter can exclude this one. */
  await dbStub.collection('payments').doc('pay_rzp_19').set({ acknowledged: false }, { merge: true });
  var r19 = await reconcile();
  ok(r19.body.result.scanned === 0,
    'T19 ★★ the sweep is scoped to provider==play — a Razorpay row is never touched even when it looks unacknowledged',
    JSON.stringify(r19.body.result));
  ok(U('u19').plan === 'premium', 'T19 …and the Razorpay entitlement is untouched');
  ok(GOOGLE.gets.length === 0, 'T19 ★ …and Google is never asked about a Razorpay payment');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
