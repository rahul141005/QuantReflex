/**
 * payment-refund.check.js — contract tests for the grant/revoke money path (ADR-141, Phase-4 WS2).
 *
 * Stubs firebase-admin with an in-memory Firestore whose transactions BUFFER writes exactly as the real
 * one does (a write is not visible to a read inside the same transaction — the revoke path depends on
 * that, since it must exclude the row it is refunding by id rather than by status), then drives the
 * REAL services/aiService.js.
 *
 * THE HEADLINE ASSERTION (T6): a `payment.captured` redelivery arriving AFTER a refund must not
 * re-grant. Razorpay retries captures on its own schedule, `?action=verify` has no recency check, and
 * Play replays PURCHASED notifications — so before ADR-141 a customer could buy, charge back, and keep
 * renewing Premium for free off the same paymentId indefinitely.
 *
 * Everything here also serves as the Razorpay non-regression gate: T4/T5/T14 pin the pre-existing
 * replay and no-shorten behaviour that must survive the refund work untouched.
 *
 *   node scripts/payment-refund.check.js
 */
'use strict';
var path = require('path');
function appPath(p) { return path.join(__dirname, '..', p); }

var DAY = 24 * 60 * 60 * 1000;
function iso(ms) { return new Date(ms).toISOString(); }

/* Fixtures are anchored to NOW, never to absolute calendar dates.
   aiService.revokePayment reads the real clock (it has no injectable `now` — the pure arithmetic that
   does is entitlementLedger, exercised by entitlement-ledger.check.js), so an absolute 2025 fixture
   quietly becomes a LAPSED entitlement once the machine date passes it, and every "still premium"
   assertion below would start failing for a reason that has nothing to do with the code under test.
   NOW is captured once so a check that straddles midnight cannot disagree with itself. */
var NOW = Date.now();
function daysAgo(n) { return NOW - n * DAY; }
function daysAhead(n) { return NOW + n * DAY; }

/* ───────── in-memory firestore stub ───────── */
var COL, CLAIMS, EVENTS, LOGS;
function reset() {
  COL = { users: {}, payments: {}, securityEvents: {}, paymentOrphans: {} };
  CLAIMS = {};
  EVENTS = [];
  LOGS = [];
}
reset();

var _autoId = 0;

function docRef(col, id, parent) {
  return {
    id: id,
    __col: col,
    __parent: parent || null,
    get: function () {
      var store = parent ? (parent.__subs && parent.__subs[col]) || {} : COL[col];
      var v = store ? store[id] : undefined;
      return Promise.resolve({ exists: v !== undefined, id: id, data: function () { return v; } });
    },
    set: function (data, opts) { _write(col, id, data, opts, parent); return Promise.resolve(); },
    create: function (data) {
      if (COL[col] && COL[col][id] !== undefined) return Promise.reject(new Error('ALREADY_EXISTS'));
      _write(col, id, data, null, parent); return Promise.resolve();
    },
    collection: function (sub) {
      var self = this;
      return {
        doc: function (subId) { return docRef(sub, subId || ('auto' + (++_autoId)), self); }
      };
    }
  };
}

function _write(col, id, data, opts, parent) {
  if (parent) {
    /* subcollection write — only entitlementLogs matters here, and it is append-only */
    LOGS.push({ parentId: parent.id, col: col, id: id, data: data });
    return;
  }
  if (!COL[col]) COL[col] = {};
  if (opts && opts.merge) COL[col][id] = Object.assign({}, COL[col][id] || {}, data);
  else COL[col][id] = data;
}

function query(col, filters) {
  return {
    __isQuery: true,
    where: function (field, op, value) {
      if (op !== '==') throw new Error('stub supports == only, got ' + op);
      return query(col, filters.concat([[field, value]]));
    },
    get: function () {
      var store = COL[col] || {};
      var rows = Object.keys(store).filter(function (id) {
        return filters.every(function (f) { return store[id][f[0]] === f[1]; });
      }).map(function (id) {
        var snapshot = JSON.parse(JSON.stringify(store[id]));
        return { id: id, data: function () { return snapshot; } };
      });
      return Promise.resolve({
        size: rows.length,
        docs: rows,
        forEach: function (fn) { rows.forEach(fn); }
      });
    }
  };
}

var dbStub = {
  collection: function (name) {
    var q = query(name, []);
    return {
      doc: function (id) { return docRef(name, id != null ? String(id) : ('auto' + (++_autoId))); },
      where: q.where,
      add: function (data) {
        if (name === 'securityEvents') EVENTS.push(data);
        var id = 'auto' + (++_autoId);
        _write(name, id, data, null, null);
        return Promise.resolve({ id: id });
      }
    };
  },
  runTransaction: function (fn) {
    /* Faithful to the real contract: writes are buffered and applied only on commit, so a read inside
       the transaction NEVER sees this transaction's own writes. */
    var buffered = [];
    var tx = {
      get: function (refOrQuery) { return refOrQuery.get(); },
      set: function (ref, data, opts) { buffered.push([ref, data, opts, 'set']); },
      create: function (ref, data) { buffered.push([ref, data, null, 'create']); },
      update: function (ref, data) { buffered.push([ref, data, { merge: true }, 'set']); }
    };
    return Promise.resolve(fn(tx)).then(function (r) {
      for (var i = 0; i < buffered.length; i++) {
        var b = buffered[i];
        if (b[3] === 'create' && !b[0].__parent && COL[b[0].__col] && COL[b[0].__col][b[0].id] !== undefined) {
          throw new Error('ALREADY_EXISTS');
        }
        _write(b[0].__col, b[0].id, b[1], b[2], b[0].__parent);
      }
      return r;
    });
  }
};

var FieldValue = { serverTimestamp: function () { return 'TS'; }, increment: function (n) { return { __inc: n }; } };
var adminStub = {
  apps: [{}],
  initializeApp: function () {},
  credential: { cert: function () {} },
  firestore: function () { return dbStub; },
  auth: function () {
    return {
      getUser: function (uid) { return Promise.resolve({ uid: uid, customClaims: CLAIMS[uid] || {} }); },
      setCustomUserClaims: function (uid, claims) { CLAIMS[uid] = claims; return Promise.resolve(); }
    };
  }
};
adminStub.firestore.FieldValue = FieldValue;

/* Razorpay order/plan lookups the webhook falls back to. ORDERS is repopulated per test. */
var ORDERS = {};
var paymentServiceStub = {
  fetchOrder: function (id) {
    if (!ORDERS[id]) return Promise.reject(new Error('no such order'));
    return Promise.resolve(ORDERS[id]);
  },
  getPlanConfig: function (plan) {
    return (plan === 'premium_6m' || plan === 'premium_12m') ? { plan: plan } : null;
  }
};

var Module = require('module'); var orig = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return adminStub;
  if (request === 'openai') return function OpenAI() { return {}; };
  if (/services\/paymentService$/.test(request)) return paymentServiceStub;
  return orig.apply(this, arguments);
};

var aiService = require(appPath('services/aiService.js'));

/* ───────── webhook driver (real HMAC, real handler) ───────── */
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
var crypto = require('crypto');
var webhook = require(appPath('api/payment/webhook.js'));

function postWebhook(body) {
  var raw = JSON.stringify(body);
  var sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  var handlers = {};
  var req = {
    method: 'POST',
    headers: { 'x-razorpay-signature': sig },
    on: function (ev, fn) { handlers[ev] = fn; return req; }
  };
  var out = { status: 200, body: null };
  var res = {
    setHeader: function () { return res; },
    status: function (s) { out.status = s; return res; },
    json: function (b) { out.body = b; return out; }
  };
  var p = webhook(req, res);
  /* _getRawBody subscribes on the next tick of the handler; feed it once the listeners are attached. */
  setImmediate(function () { handlers.data(Buffer.from(raw, 'utf8')); handlers.end(); });
  return p.then(function () { return out; });
}

function refundEvent(paymentId, capturedPaise, refundedTotalPaise, notes) {
  return {
    event: 'refund.processed',
    payload: {
      refund: { entity: { id: 'rfnd_' + paymentId, payment_id: paymentId, amount: refundedTotalPaise } },
      payment: {
        entity: {
          id: paymentId, amount: capturedPaise, amount_refunded: refundedTotalPaise,
          order_id: 'order_' + paymentId, currency: 'INR', notes: notes || {}
        }
      }
    }
  };
}

/* ───────── harness ───────── */
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
async function throwsCode(fn, code) {
  try { await fn(); return false; } catch (e) { return e && e.code === code; }
}
function user(uid) { return COL.users[uid]; }
function payment(id) { return COL.payments[id]; }
function seedPremium(uid, expiryMs, extra) {
  COL.users[uid] = Object.assign({
    plan: 'premium', planType: 'premium_6m', planExpiry: iso(expiryMs),
    planSource: 'purchase', isTrial: false, trialEnd: null
  }, extra || {});
}
function seedPaid(id, uid, claimedAtMs, days, plan) {
  COL.payments[id] = {
    uid: uid, plan: plan || 'premium_6m', amount: 29900, amountSource: 'gateway',
    days: days, status: 'paid', expiry: iso(claimedAtMs + days * DAY), claimedAt: iso(claimedAtMs)
  };
}

console.log('Payment grant/revoke money path (ADR-141, WS2)\n');

(async function () {

  /* ── T1 — fresh grant records the gateway amount + the term length ─────────────────────────── */
  reset();
  var exp1 = await aiService.activatePremium('u1', 'premium_6m', 'pay_1', 'order_1', { amountPaise: 29900, currency: 'INR' });
  ok(payment('pay_1') && payment('pay_1').status === 'paid', 'T1 grant creates payments/{id} with status paid');
  ok(payment('pay_1').amount === 29900 && payment('pay_1').amountSource === 'gateway',
    'T1 W4: the GATEWAY-reported amount is recorded, tagged amountSource:gateway');
  ok(payment('pay_1').days === 182, 'T1 the term length is recorded on the row (so a refund never re-derives it)');
  ok(payment('pay_1').currency === 'INR' && payment('pay_1').orderId === 'order_1', 'T1 currency + orderId recorded');
  ok(user('u1').plan === 'premium' && user('u1').planSource === 'purchase' && user('u1').planExpiry === exp1,
    'T1 user is premium with planSource purchase');
  ok(payment('pay_1').amountMismatch === undefined, 'T1 a matching amount raises no mismatch flag');

  /* ── T2 — a gateway amount that disagrees with the catalog still grants, but is flagged ────── */
  reset();
  await aiService.activatePremium('u2', 'premium_12m', 'pay_2', 'order_2', { amountPaise: 100, currency: 'INR' });
  ok(user('u2').plan === 'premium', 'T2 an underpaid capture STILL grants (the money was already taken)');
  ok(payment('pay_2').amount === 100 && payment('pay_2').amountExpected === 39900 && payment('pay_2').amountMismatch === true,
    'T2 the discrepancy is recorded on the row, not silently normalised to the catalog price');
  ok(EVENTS.some(function (e) { return e.type === 'payment_amount_mismatch'; }),
    'T2 a securityEvent is raised for the amount mismatch');

  /* ── T3 — no gateway facts supplied → catalog fallback, clearly labelled ───────────────────── */
  reset();
  await aiService.activatePremium('u3', 'premium_12m', 'pay_3', 'order_3');
  ok(payment('pay_3').amount === 39900 && payment('pay_3').amountSource === 'catalog',
    'T3 without gateway facts the catalog price is recorded and labelled catalog');
  ok(EVENTS.length === 0, 'T3 the catalog fallback is not itself a mismatch');
  /* A zero is "no evidence yet", not a ₹0 capture — Razorpay's order.amount_paid lags the capture. */
  await aiService.activatePremium('u3b', 'premium_6m', 'pay_3b', 'order_3b', { amountPaise: 0, currency: 'INR' });
  ok(payment('pay_3b').amount === 29900 && payment('pay_3b').amountSource === 'catalog',
    'T3 a gateway amount of 0 falls back to the catalog rather than recording a false ₹0');
  ok(EVENTS.length === 0, 'T3 …and does not fire a bogus amount-mismatch alert');

  /* ── T4 — RAZORPAY NON-REGRESSION: verify + webhook double-fire grants exactly once ────────── */
  reset();
  var a = await aiService.activatePremium('u4', 'premium_6m', 'pay_4', 'order_4', { amountPaise: 29900 });
  var b = await aiService.activatePremium('u4', 'premium_6m', 'pay_4', 'order_4', { amountPaise: 29900 });
  ok(a === b, 'T4 the second (webhook) call returns the same expiry — no double grant');
  ok(user('u4').planExpiry === a, 'T4 the user expiry is unchanged by the replay');
  ok(Object.keys(COL.payments).length === 1, 'T4 exactly one payments row exists');

  /* ── T5 — RAZORPAY NON-REGRESSION: replay must never SHORTEN a stronger later grant ────────── */
  reset();
  await aiService.activatePremium('u5', 'premium_6m', 'pay_5', 'order_5', { amountPaise: 29900 });
  var longer = iso(Date.now() + 400 * DAY);
  COL.users.u5.planExpiry = longer; COL.users.u5.planSource = 'admin'; COL.users.u5.planType = 'premium_12m';
  await aiService.activatePremium('u5', 'premium_6m', 'pay_5', 'order_5', { amountPaise: 29900 });
  ok(user('u5').planExpiry === longer, 'T5 a stale replay does not roll a longer entitlement backwards (ADR-117 B1)');
  ok(user('u5').planSource === 'admin', 'T5 …and does not relabel the admin grant as a purchase');

  /* ── T6 — THE HEADLINE: a captured retry AFTER a refund must not re-grant ──────────────────── */
  reset();
  var now6 = Date.now();
  await aiService.activatePremium('u6', 'premium_6m', 'pay_6', 'order_6', { amountPaise: 29900 });
  ok(user('u6').plan === 'premium', 'T6 setup: the purchase granted premium');
  await aiService.revokePayment('u6', 'pay_6', { reason: 'razorpay_refund', refundId: 'rfnd_6' });
  ok(user('u6').plan === 'free' && user('u6').planExpiry === null, 'T6 the refund reverted the user to free');
  ok(payment('pay_6').status === 'refunded' && payment('pay_6').refundId === 'rfnd_6', 'T6 the payment row is marked refunded');

  var refused = await throwsCode(function () {
    return aiService.activatePremium('u6', 'premium_6m', 'pay_6', 'order_6', { amountPaise: 29900 });
  }, 'PAYMENT_REFUNDED');
  ok(refused, 'T6 ★ a redelivered payment.captured for a REFUNDED payment throws PAYMENT_REFUNDED');
  ok(user('u6').plan === 'free' && user('u6').planExpiry === null,
    'T6 ★ …and writes NOTHING — the user stays free (this is the bug WS2 exists to close)');
  ok(payment('pay_6').status === 'refunded', 'T6 ★ …and the payment row is not resurrected to paid');
  ok(EVENTS.some(function (e) { return e.type === 'grant_after_refund'; }), 'T6 the refused grant raises a securityEvent');
  /* the refusal is permanent, not a one-shot */
  ok(await throwsCode(function () { return aiService.activatePremium('u6', 'premium_6m', 'pay_6', 'order_6'); }, 'PAYMENT_REFUNDED'),
    'T6 the refusal is permanent — a third delivery is refused too');
  ok(now6 > 0, 'T6 harness sanity');

  /* ── T7 — cross-uid replay is still PAYMENT_REPLAY (unchanged) ─────────────────────────────── */
  reset();
  await aiService.activatePremium('u7a', 'premium_6m', 'pay_7', 'order_7', { amountPaise: 29900 });
  ok(await throwsCode(function () { return aiService.activatePremium('u7b', 'premium_6m', 'pay_7', 'order_7'); }, 'PAYMENT_REPLAY'),
    'T7 a different account claiming the same paymentId is rejected with PAYMENT_REPLAY');
  ok(user('u7b') === undefined, 'T7 …and the attacker doc is never written');
  /* the cross-uid check runs BEFORE the refunded check, so a refunded payment cannot be stolen either */
  await aiService.revokePayment('u7a', 'pay_7', { reason: 'razorpay_refund' });
  ok(await throwsCode(function () { return aiService.activatePremium('u7b', 'premium_6m', 'pay_7', 'order_7'); }, 'PAYMENT_REPLAY'),
    'T7 a REFUNDED payment still cannot be claimed by another account');

  /* ── T8 — a 'pending' row is completed by the grant, not rejected ──────────────────────────── */
  reset();
  COL.payments.pay_8 = { uid: 'u8', status: 'pending', plan: 'premium_6m', claimedAt: null };
  var exp8 = await aiService.activatePremium('u8', 'premium_6m', 'pay_8', 'order_8', { amountPaise: 29900 });
  ok(payment('pay_8').status === 'paid' && payment('pay_8').days === 182, 'T8 a pending row is completed to paid');
  ok(payment('pay_8').claimedAt && user('u8').plan === 'premium' && user('u8').planExpiry === exp8,
    'T8 …and the entitlement is granted normally');

  /* ── T9 — THE COUNTER-EXAMPLE end to end: refunding a LAPSED purchase changes nothing ──────── */
  reset();
  var P1at = daysAgo(600), P2at = daysAgo(100);
  seedPaid('pay_9a', 'u9', P1at, 182);              /* bought 600d ago, lapsed 418d ago */
  seedPaid('pay_9b', 'u9', P2at, 182);              /* bought 100d ago, live for another 82d */
  seedPremium('u9', P2at + 182 * DAY);
  var before9 = user('u9').planExpiry;
  ok(Date.parse(before9) > NOW, 'T9 fixture sanity: the surviving purchase really is still live');
  var r9 = await aiService.revokePayment('u9', 'pay_9a', { reason: 'razorpay_refund' });
  ok(user('u9').planExpiry === before9,
    'T9 ★ refunding the lapsed P1 leaves the live P2 entitlement EXACTLY as it was');
  ok(user('u9').plan === 'premium' && r9.revoked === false, 'T9 ★ …the user is still premium');
  ok(payment('pay_9a').status === 'refunded' && payment('pay_9b').status === 'paid',
    'T9 only the refunded row changes status');
  /* prove the naive alternative would have been wrong, in this exact fixture */
  ok(Date.parse(before9) - 182 * DAY < Date.parse(user('u9').planExpiry),
    'T9 ★ naive day-subtraction would have cut 182 days the user still owns');

  /* ── T10 — overlapping purchases: refunding the first genuinely shortens the survivor ──────── */
  reset();
  var Aat = daysAgo(100), Bat = daysAgo(40);        /* B was bought while A was still live → stacks */
  seedPaid('pay_10a', 'u10', Aat, 182);
  seedPaid('pay_10b', 'u10', Bat, 182);
  seedPremium('u10', Aat + 364 * DAY);
  await aiService.revokePayment('u10', 'pay_10a', { reason: 'razorpay_refund' });
  ok(user('u10').planExpiry === iso(Bat + 182 * DAY),
    'T10 refunding the first of two OVERLAPPING purchases re-dates the survivor to its own claim date');
  ok(user('u10').plan === 'premium', 'T10 …and the user keeps the purchase they did not refund');
  ok(Date.parse(user('u10').planExpiry) < Aat + 364 * DAY, 'T10 …which is genuinely shorter than before');

  /* ── T11 — refund BEFORE grant writes a tombstone that refuses the late grant ──────────────── */
  reset();
  var r11 = await aiService.revokePayment('u11', 'pay_11', { reason: 'razorpay_refund', plan: 'premium_6m' });
  ok(payment('pay_11') && payment('pay_11').status === 'refunded' && payment('pay_11').tombstone === true,
    'T11 a refund with no grant still writes a refunded tombstone');
  ok(r11.tombstoned === true && r11.skipped === 'no_grant', 'T11 the result reports a tombstone with no grant to remove');
  ok(payment('pay_11') && payment('pay_11').claimedAt === null && payment('pay_11').amount === 0,
    'T11 the tombstone can never be mistaken for a paid purchase by the ledger replay');
  ok(await throwsCode(function () { return aiService.activatePremium('u11', 'premium_6m', 'pay_11', 'order_11'); }, 'PAYMENT_REFUNDED'),
    'T11 ★ the late capture webhook then lands on the tombstone and is refused');
  ok(user('u11') === undefined, 'T11 ★ …so the refunded money never becomes an entitlement');

  /* ── T12 — an entitlement this refund does not own is left alone ───────────────────────────── */
  reset();
  seedPaid('pay_12', 'u12', daysAgo(100), 182);
  seedPremium('u12', daysAhead(300), { planSource: 'admin', planType: 'premium_12m' });
  var r12 = await aiService.revokePayment('u12', 'pay_12', { reason: 'razorpay_refund' });
  ok(payment('pay_12').status === 'refunded', 'T12 the payment is still correctly recorded as refunded');
  ok(user('u12').plan === 'premium' && user('u12').planExpiry === iso(daysAhead(300)) && user('u12').planSource === 'admin',
    'T12 ★ an ADMIN grant made after the purchase is NOT deleted by the refund');
  ok(r12.skipped === 'planSource:admin', 'T12 the skip is reported, not silently swallowed');
  ok(EVENTS.some(function (e) { return e.type === 'refund_revoke_skipped'; }), 'T12 …and raised as a securityEvent for review');

  /* ── T13 — a duplicate refund webhook is idempotent ────────────────────────────────────────── */
  reset();
  seedPaid('pay_13a', 'u13', daysAgo(100), 182);
  seedPaid('pay_13b', 'u13', daysAgo(40), 182);
  seedPremium('u13', daysAgo(100) + 364 * DAY);
  await aiService.revokePayment('u13', 'pay_13a', { reason: 'razorpay_refund' });
  var after13 = user('u13').planExpiry;
  var r13 = await aiService.revokePayment('u13', 'pay_13a', { reason: 'razorpay_refund' });
  ok(user('u13').planExpiry === after13, 'T13 a redelivered refund does not shorten the entitlement a second time');
  ok(r13.skipped === 'status:refunded', 'T13 the duplicate is reported as an already-refunded no-op');

  /* ── T14 — refunding a payment that belongs to someone else is refused ─────────────────────── */
  reset();
  seedPaid('pay_14', 'u14a', daysAgo(100), 182);
  seedPremium('u14a', daysAhead(82));
  seedPremium('u14b', daysAhead(300));
  ok(await throwsCode(function () { return aiService.revokePayment('u14b', 'pay_14', {}); }, 'PAYMENT_OWNER_MISMATCH'),
    'T14 revoking another account\'s payment is refused');
  ok(user('u14b').plan === 'premium' && user('u14a').plan === 'premium', 'T14 …and neither account is touched');
  ok(payment('pay_14').status === 'paid', 'T14 …and the payment row is not tombstoned');

  /* ── T15 — a revoke may only ever shorten, never lengthen ──────────────────────────────────── */
  reset();
  seedPaid('pay_15a', 'u15', daysAgo(100), 182);
  seedPaid('pay_15b', 'u15', daysAgo(40), 182);
  /* an admin trimmed the expiry to EARLIER than the ledger replay would compute (which is +142d) */
  seedPremium('u15', daysAhead(30));
  await aiService.revokePayment('u15', 'pay_15a', { reason: 'razorpay_refund' });
  ok(user('u15').planExpiry === iso(daysAhead(30)),
    'T15 when the stored expiry is already shorter than the replay, the shorter one is kept');
  ok(user('u15').plan === 'premium', 'T15 …and the user is not dropped to free by the revoke');

  /* ── T15b — a pre-ADR-141 row with no `days` is recovered from its plan id ─────────────────── */
  reset();
  seedPaid('pay_15c', 'u15b', daysAgo(100), 182);
  delete COL.payments.pay_15c.days;                   /* legacy row: only `plan` tells us the term */
  seedPaid('pay_15d', 'u15b', daysAgo(40), 182);
  delete COL.payments.pay_15d.days;
  seedPremium('u15b', daysAgo(100) + 364 * DAY);
  await aiService.revokePayment('u15b', 'pay_15d', { reason: 'razorpay_refund' });
  ok(user('u15b').planExpiry === iso(daysAgo(100) + 182 * DAY),
    'T15b a legacy row with no `days` field has its term recovered from PREMIUM_DURATION_DAYS');

  /* ── T15c — an UNREADABLE surviving row must not silently shorten the entitlement ──────────── */
  reset();
  seedPaid('pay_15e', 'u15c', daysAgo(100), 182, 'premium_retired_plan');
  delete COL.payments.pay_15e.days;                   /* no days AND an unmappable plan → term unknown */
  seedPaid('pay_15f', 'u15c', daysAgo(40), 182);
  seedPremium('u15c', daysAgo(100) + 364 * DAY);
  var before15c = user('u15c').planExpiry;
  var r15c = await aiService.revokePayment('u15c', 'pay_15f', { reason: 'razorpay_refund' });
  ok(user('u15c').planExpiry === before15c && user('u15c').plan === 'premium',
    'T15c ★ when a surviving purchase cannot be read, the entitlement is left ALONE (never shortened on a guess)');
  ok(payment('pay_15e').status === 'paid' && payment('pay_15f').status === 'refunded',
    'T15c …the refund itself is still recorded');
  ok(r15c.skipped === 'indeterminate_term:pay_15e', 'T15c …and the unreadable row is named for a human');
  ok(EVENTS.some(function (e) { return e.type === 'refund_revoke_skipped'; }), 'T15c …and escalated');

  /* ── T16 — a revoke that reverts to free writes the full canonical revocation field-set ────── */
  reset();
  seedPaid('pay_16', 'u16', daysAgo(100), 182);
  seedPremium('u16', daysAhead(82), { isTrial: false, planType: 'premium_6m' });
  CLAIMS.u16 = { premium: true, admin: true };
  await aiService.revokePayment('u16', 'pay_16', { reason: 'razorpay_refund' });
  var u16 = user('u16');
  ok(u16.plan === 'free' && u16.planType === null && u16.planExpiry === null && u16.planSource === null &&
     u16.isTrial === false && u16.trialEnd === null,
    'T16 every entitlement field is cleared (entitlement-core.revokeFields, no field left behind)');
  ok(u16.planUpdatedAt && u16.updatedAt, 'T16 …with fresh provenance stamps');
  ok(CLAIMS.u16.premium === false, 'T16 the JWT premium claim is cleared');
  ok(CLAIMS.u16.admin === true, 'T16 …without destroying the account\'s other claims (ADR-117)');
  ok(LOGS.some(function (l) { return l.col === 'entitlementLogs' && l.parentId === 'u16' && l.data.action === 'revoke'; }),
    'T16 an entitlementLogs audit row is written for the revoke');

  /* ── T17 — a partially_refunded row still re-applies on a captured retry (documented policy) ─ */
  reset();
  await aiService.activatePremium('u17', 'premium_6m', 'pay_17', 'order_17', { amountPaise: 29900 });
  var exp17 = user('u17').planExpiry;
  COL.payments.pay_17.status = 'partially_refunded';
  var again17 = await aiService.activatePremium('u17', 'premium_6m', 'pay_17', 'order_17', { amountPaise: 29900 });
  ok(again17 === exp17 && user('u17').plan === 'premium',
    'T17 a PARTIAL refund keeps the entitlement — a captured retry replays as normal, it is not refused');

  /* ── T18 — the Razorpay refund webhook, driven end to end through a real HMAC signature ────── */

  /* T18a full refund → revoke */
  reset(); ORDERS = {};
  await aiService.activatePremium('u18', 'premium_6m', 'pay_18', 'order_18', { amountPaise: 29900 });
  var w18a = await postWebhook(refundEvent('pay_18', 29900, 29900, { uid: 'u18', plan: 'premium_6m' }));
  ok(w18a.status === 200 && w18a.body.revoked === true, 'T18a a FULL refund webhook returns 200 and revokes');
  ok(user('u18').plan === 'free' && payment('pay_18').status === 'refunded', 'T18a …the user is free and the row is refunded');

  /* T18b partial refund → entitlement retained, escalated */
  reset(); ORDERS = {};
  await aiService.activatePremium('u18b', 'premium_6m', 'pay_18b', 'order_18b', { amountPaise: 29900 });
  var exp18b = user('u18b').planExpiry;
  var w18b = await postWebhook(refundEvent('pay_18b', 29900, 10000, { uid: 'u18b', plan: 'premium_6m' }));
  ok(w18b.status === 200 && w18b.body.partial === true, 'T18b a PARTIAL refund is acknowledged as partial');
  ok(user('u18b').plan === 'premium' && user('u18b').planExpiry === exp18b,
    'T18b ★ a partial refund does NOT strip the paying customer\'s access');
  ok(payment('pay_18b').status === 'partially_refunded' && payment('pay_18b').amountRefunded === 10000,
    'T18b the row records the partial refund');
  ok(EVENTS.some(function (e) { return e.type === 'payment_partial_refund'; }), 'T18b …and is escalated for a human');

  /* T18c several partials that together consume the whole capture ARE a full refund */
  reset(); ORDERS = {};
  await aiService.activatePremium('u18c', 'premium_6m', 'pay_18c', 'order_18c', { amountPaise: 29900 });
  var w18c = await postWebhook(refundEvent('pay_18c', 29900, 29900, { uid: 'u18c' }));
  ok(w18c.body.revoked === true && user('u18c').plan === 'free',
    'T18c amount_refunded reaching the capture total is treated as FULL even though this refund is one of several');

  /* T18d an unknown capture amount is treated as PARTIAL (never strip access on a guess) */
  reset(); ORDERS = {};
  await aiService.activatePremium('u18d', 'premium_6m', 'pay_18d', 'order_18d', { amountPaise: 29900 });
  var ev18d = refundEvent('pay_18d', 29900, 29900, { uid: 'u18d' });
  delete ev18d.payload.payment.entity.amount;                 /* capture total unknown */
  var w18d = await postWebhook(ev18d);
  ok(w18d.status === 200 && w18d.body.partial === true && user('u18d').plan === 'premium',
    'T18d ★ an unreadable capture total is treated as PARTIAL — access is never stripped on a guess');

  /* T18e uid recovered from the ORDER when the payment notes are empty */
  reset(); ORDERS = { order_pay_18e: { notes: { uid: 'u18e', plan: 'premium_6m' } } };
  await aiService.activatePremium('u18e', 'premium_6m', 'pay_18e', 'order_18e', { amountPaise: 29900 });
  var w18e = await postWebhook(refundEvent('pay_18e', 29900, 29900, {}));
  ok(w18e.body.revoked === true && user('u18e').plan === 'free', 'T18e the uid is recovered from the order notes');

  /* T18f uid recovered from the payments row when both notes and the order lookup fail */
  reset(); ORDERS = {};
  await aiService.activatePremium('u18f', 'premium_6m', 'pay_18f', 'order_18f', { amountPaise: 29900 });
  var w18f = await postWebhook(refundEvent('pay_18f', 29900, 29900, {}));
  ok(w18f.body.revoked === true && user('u18f').plan === 'free',
    'T18f the uid is recovered from the payments row when Razorpay tells us nothing');

  /* T18g a refund we cannot attribute at all → orphan, never a silent ack */
  reset(); ORDERS = {};
  var w18g = await postWebhook(refundEvent('pay_18g', 29900, 29900, {}));
  ok(w18g.status === 200 && /orphan/.test(w18g.body.warning || ''), 'T18g an unattributable refund records an orphan');
  ok(COL.paymentOrphans['refund_pay_18g'] && COL.paymentOrphans['refund_pay_18g'].status === 'unresolved',
    'T18g …with an unresolved orphan row for reconciliation');

  /* T18h a partial refund with no captured row must not fabricate a ledger entry */
  reset(); ORDERS = { order_pay_18h: { notes: { uid: 'u18h', plan: 'premium_6m' } } };
  var w18h = await postWebhook(refundEvent('pay_18h', 29900, 10000, { uid: 'u18h' }));
  ok(w18h.status === 200 && payment('pay_18h') === undefined,
    'T18h ★ a partial refund preceding its capture does NOT invent a half-formed payments row');
  ok(COL.paymentOrphans['refund_pay_18h'], 'T18h …it records an orphan instead');

  /* T18i a redelivered payment.captured after the refund is ACKed 200, not retried forever */
  reset(); ORDERS = { order_18i: { notes: { uid: 'u18i', plan: 'premium_6m' } } };
  await aiService.activatePremium('u18i', 'premium_6m', 'pay_18i', 'order_18i', { amountPaise: 29900 });
  await aiService.revokePayment('u18i', 'pay_18i', { reason: 'razorpay_refund' });
  var w18i = await postWebhook({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_18i', order_id: 'order_18i', amount: 29900, currency: 'INR', notes: { uid: 'u18i', plan: 'premium_6m' } } } }
  });
  ok(w18i.status === 200 && w18i.body.refused === 'refunded',
    'T18i ★ a captured redelivery after a refund is ACKed 200 (a 500 would retry forever)');
  ok(user('u18i').plan === 'free', 'T18i ★ …and the refunded user is NOT re-granted premium');

  /* T18j a bad signature is rejected before anything is read */
  reset(); ORDERS = {};
  var badOut = { status: 200, body: null };
  var badRes = { setHeader: function () { return badRes; }, status: function (s) { badOut.status = s; return badRes; }, json: function (b) { badOut.body = b; return badOut; } };
  var badHandlers = {};
  var badReq = { method: 'POST', headers: { 'x-razorpay-signature': 'deadbeef' }, on: function (e, f) { badHandlers[e] = f; return badReq; } };
  var badP = webhook(badReq, badRes);
  setImmediate(function () { badHandlers.data(Buffer.from(JSON.stringify(refundEvent('pay_18j', 29900, 29900, { uid: 'u18j' })), 'utf8')); badHandlers.end(); });
  await badP;
  ok(badOut.status === 401, 'T18j an invalid webhook signature is rejected with 401');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('\n✗ HARNESS ERROR:', e && e.stack || e);
  process.exit(1);
});
