/**
 * refund-workflow.check.js — the manual refund workflow, end to end (ADR-143).
 *
 * Drives the REAL services/refundRequests.js and the REAL api/payment.js refund actions against an
 * in-memory Firestore whose transactions buffer writes exactly as the real one does (the same stub
 * shape as payment-refund.check.js).
 *
 *   User request → Super Admin review → Provider refund → Provider confirmation → Canonical revocation
 *
 * THE ASSERTION THIS FILE EXISTS FOR (T4): **approving a refund request changes NO entitlement.**
 * Approval only authorises a human to go and issue the refund at the provider. If approval revoked
 * access directly, a customer whose refund then FAILED at the gateway would be left with neither
 * their money nor their Premium. The entitlement is revoked exactly once, later, when the provider
 * confirms — through the same canonical path a Google-initiated refund takes.
 *
 * Second load-bearing assertion (T7): a provider refund arriving LONG after the 24-hour window still
 * fully revokes. Our policy governs what a user may ASK for; it never governs what the provider did.
 *
 *   node scripts/refund-workflow.check.js
 */
'use strict';
var path = require('path');
function appPath(p) { return path.join(__dirname, '..', p); }

var HOUR = 60 * 60 * 1000;
var DAY = 24 * HOUR;
var NOW = Date.now();
function hoursAgo(n) { return NOW - n * HOUR; }

/* ───────── in-memory firestore stub (buffered-write transactions) ───────── */
var COL, CLAIMS, EVENTS;
function reset() {
  COL = { users: {}, payments: {}, refundRequests: {}, securityEvents: {}, paymentOrphans: {} };
  CLAIMS = {}; EVENTS = [];
}
reset();
var _autoId = 0;

function docRef(col, id) {
  return {
    id: id, __col: col, __parent: null,
    get: function () {
      var v = (COL[col] || {})[id];
      return Promise.resolve({ exists: v !== undefined, id: id, data: function () { return v; } });
    },
    set: function (d, o) { _write(col, id, d, o); return Promise.resolve(); },
    create: function (d) {
      if ((COL[col] || {})[id] !== undefined) return Promise.reject(new Error('ALREADY_EXISTS'));
      _write(col, id, d, null); return Promise.resolve();
    },
    collection: function (sub) { return { doc: function (sid) { return docRef(sub, sid || ('auto' + (++_autoId))); } }; }
  };
}
function _write(col, id, data, opts) {
  if (!COL[col]) COL[col] = {};
  var next = (opts && opts.merge) ? Object.assign({}, COL[col][id] || {}, data) : data;
  /* arrayUnion marker support — refundRequests appends history rows this way */
  Object.keys(next).forEach(function (k) {
    var v = next[k];
    if (v && v.__arrayUnion) {
      var prev = (COL[col][id] || {})[k];
      next[k] = (Array.isArray(prev) ? prev : []).concat(v.__arrayUnion);
    }
  });
  COL[col][id] = next;
}
function query(col, filters) {
  return {
    where: function (f, op, v) { return query(col, filters.concat([[f, v]])); },
    get: function () {
      var store = COL[col] || {};
      var rows = Object.keys(store).filter(function (id) {
        return filters.every(function (f) { return store[id][f[0]] === f[1]; });
      }).map(function (id) {
        var snap = JSON.parse(JSON.stringify(store[id]));
        return { id: id, data: function () { return snap; } };
      });
      return Promise.resolve({ size: rows.length, docs: rows, forEach: function (fn) { rows.forEach(fn); } });
    }
  };
}
var dbStub = {
  collection: function (name) {
    var q = query(name, []);
    return {
      doc: function (id) { return docRef(name, id != null ? String(id) : ('auto' + (++_autoId))); },
      where: q.where,
      add: function (d) {
        if (name === 'securityEvents') EVENTS.push(d);
        var id = 'auto' + (++_autoId); _write(name, id, d, null);
        return Promise.resolve({ id: id });
      }
    };
  },
  runTransaction: function (fn) {
    var buffered = [];
    var tx = {
      get: function (r) { return r.get(); },
      set: function (r, d, o) { buffered.push([r, d, o]); },
      create: function (r, d) { buffered.push([r, d, null]); },
      update: function (r, d) { buffered.push([r, d, { merge: true }]); }
    };
    return Promise.resolve(fn(tx)).then(function (r) {
      buffered.forEach(function (b) { _write(b[0].__col, b[0].id, b[1], b[2]); });
      return r;
    });
  }
};
var FieldValue = {
  serverTimestamp: function () { return 'TS'; },
  increment: function (n) { return { __inc: n }; },
  arrayUnion: function () { return { __arrayUnion: Array.prototype.slice.call(arguments) }; }
};
var adminStub = {
  apps: [{}], initializeApp: function () {}, credential: { cert: function () {} },
  firestore: function () { return dbStub; },
  auth: function () {
    return {
      getUser: function (uid) { return Promise.resolve({ uid: uid, customClaims: CLAIMS[uid] || {} }); },
      setCustomUserClaims: function (uid, c) { CLAIMS[uid] = c; return Promise.resolve(); }
    };
  }
};
adminStub.firestore.FieldValue = FieldValue;

var middlewareStub = {
  withAuth: function (fn) { return fn; },
  methodGuard: function () { return false; },
  parseBody: function (req) { return req.body || {}; }
};
var paymentServiceStub = {
  getPlanConfig: function () { return { plan: 'premium_6m' }; },
  fetchOrder: function () { return Promise.reject(new Error('n/a')); },
  PLAN_CONFIG: { premium_6m: {}, premium_12m: {} }
};

var Module = require('module'); var orig = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return adminStub;
  if (request === 'openai') return function OpenAI() { return {}; };
  if (/_lib\/middleware$/.test(request)) return middlewareStub;
  if (/services\/paymentService$/.test(request)) return paymentServiceStub;
  if (/_lib\/config-flags$/.test(request)) return { isEnabled: function () { return Promise.resolve(false); } };
  return orig.apply(this, arguments);
};

var aiService = require(appPath('services/aiService.js'));
var refundRequests = require(appPath('services/refundRequests.js'));
var schema = require(appPath('api/_lib/refund-schema.js'));
var paymentApi = require(appPath('api/payment.js'));

/* ───────── harness ───────── */
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
async function throwsCode(fn, code) {
  try { await fn(); return false; } catch (e) { return e && e.code === code; }
}
function user(uid) { return COL.users[uid]; }
function payment(id) { return COL.payments[id]; }
function requests() { return Object.keys(COL.refundRequests).map(function (k) { return Object.assign({ id: k }, COL.refundRequests[k]); }); }
function onlyRequest() { return requests()[0]; }

function callApi(action, body, uid) {
  var out = { status: 200, body: null };
  var res = { status: function (s) { out.status = s; return res; }, json: function (b) { out.body = b; return out; } };
  return paymentApi({ method: 'POST', query: { action: action }, body: body || {}, userId: uid }, res)
    .then(function () { return out; });
}

/** Seed a captured purchase whose gateway capture time is `hAgo` hours in the past. */
async function seedPurchase(uid, paymentId, hAgo) {
  await aiService.activatePremium(uid, 'premium_6m', paymentId, 'order_' + paymentId, {
    amountPaise: 29900, currency: 'INR', capturedAtMs: hoursAgo(hAgo)
  });
}

console.log('Refund workflow — request → review → provider → revocation (ADR-143)\n');

(async function () {

  /* ── T1 — the state machine is a closed, declared table ────────────────────────────────────── */
  ok(schema.STATUSES.join(',') === 'pending,approved,rejected,refunded,failed,cancelled',
    'T1 exactly the six specified statuses exist');
  ok(schema.isOpenStatus('pending') && schema.isOpenStatus('approved'),
    'T1 pending AND approved are open — approved is not terminal, the money has not moved yet');
  ok(['rejected', 'refunded', 'failed', 'cancelled'].every(schema.isTerminalStatus),
    'T1 rejected/refunded/failed/cancelled are terminal');
  ok(schema.canTransition('pending', 'approved', 'admin').ok, 'T1 pending → approved (admin)');
  ok(schema.canTransition('approved', 'refunded', 'provider').ok, 'T1 approved → refunded (provider)');
  ok(schema.canTransition('approved', 'failed', 'provider').ok, 'T1 approved → failed (provider)');
  ok(schema.canTransition('pending', 'cancelled', 'user').ok, 'T1 pending → cancelled (user)');
  ok(!schema.canTransition('pending', 'refunded', 'provider').ok,
    'T1 ★ pending → refunded is NOT a direct transition (a refund passes through review)');
  ok(!schema.canTransition('rejected', 'approved', 'admin').ok, 'T1 a rejected request cannot be revived');
  ok(!schema.canTransition('refunded', 'refunded', 'provider').ok, 'T1 no self-transition (no double-stamping)');
  ok(schema.canTransition('approved', 'refunded', 'admin').reason === 'wrong_actor',
    'T1 ★ an ADMIN cannot mark a request refunded — only the provider confirms money moved');
  ok(schema.canTransition('pending', 'approved', 'user').reason === 'wrong_actor',
    'T1 ★ a USER cannot approve their own request');
  ok(schema.canTransition('cancelled', 'approved', 'admin').reason === 'already_final',
    'T1 terminal states report already_final');

  /* ── T2 — a user inside the window can request ─────────────────────────────────────────────── */
  reset();
  await seedPurchase('u1', 'pay_1', 2);
  var elig = await callApi('refund-eligibility', {}, 'u1');
  ok(elig.body.state === 'eligible' && elig.body.windowHours === 24,
    'T2 2h after capture → eligible, 24h window reported');
  ok(elig.body.msRemaining > 21 * HOUR && elig.body.msRemaining < 22 * HOUR,
    'T2 ~22h remaining is reported to the UI');
  var made = await callApi('refund-request', { reason: 'Bought by mistake' }, 'u1');
  ok(made.status === 200 && made.body.success === true, 'T2 the request is created');
  var r2 = onlyRequest();
  ok(r2.status === 'pending' && r2.uid === 'u1' && r2.paymentId === 'pay_1',
    'T2 it is pending and bound to the payment');
  ok(r2.reason === 'Bought by mistake', 'T2 the user reason is stored');
  ok(r2.eligibilityAtRequest.state === 'eligible',
    'T2 ★ eligibility is FROZEN at submit time for the audit trail');
  ok(r2.history.length === 1 && r2.history[0].to === 'pending', 'T2 the history opens with the creation row');
  ok(user('u1').plan === 'premium', 'T2 ★ requesting changes NO entitlement');

  /* ── T3 — outside the window the request is refused ────────────────────────────────────────── */
  reset();
  await seedPurchase('u2', 'pay_2', 25);
  var elig3 = await callApi('refund-eligibility', {}, 'u2');
  ok(elig3.body.state === 'expired' && elig3.body.msRemaining === 0, 'T3 25h after capture → expired');
  var denied = await callApi('refund-request', { reason: 'too late' }, 'u2');
  ok(denied.status === 403 && denied.body.error.code === 'REFUND_WINDOW_EXPIRED',
    'T3 ★ a request after 24h is refused with REFUND_WINDOW_EXPIRED');
  ok(requests().length === 0, 'T3 ★ …and no request record is created');
  ok(user('u2').plan === 'premium', 'T3 the entitlement is untouched');

  /* the boundary, driven through the real API */
  reset();
  await seedPurchase('u2b', 'pay_2b', 23.9);
  ok((await callApi('refund-request', { reason: 'just in time' }, 'u2b')).status === 200,
    'T3 at 23.9h the request still succeeds');

  /* ── T4 — THE HEADLINE: approval changes NO entitlement ────────────────────────────────────── */
  reset();
  await seedPurchase('u3', 'pay_3', 1);
  await callApi('refund-request', { reason: 'changed my mind' }, 'u3');
  var beforeExpiry = user('u3').planExpiry;
  var approved = await refundRequests.approve(onlyRequest().id, 'admin_1', 'admin@qr.test', 'Valid, within window');
  ok(approved.to === 'approved', 'T4 the request moves to approved');
  ok(user('u3').plan === 'premium' && user('u3').planExpiry === beforeExpiry,
    'T4 ★★ APPROVAL CHANGES NO ENTITLEMENT — the user is still premium with the same expiry');
  ok(payment('pay_3').status === 'paid', 'T4 ★★ …and the payment row is still `paid`, not refunded');
  var r4 = onlyRequest();
  ok(r4.reviewedBy === 'admin_1' && r4.reviewedByEmail === 'admin@qr.test' && r4.decisionNote === 'Valid, within window',
    'T4 the reviewer, their email and the decision note are recorded');
  ok(r4.history.length === 2 && r4.history[1].from === 'pending' && r4.history[1].to === 'approved',
    'T4 the transition is appended to the audit history');

  /* ── T5 — the provider confirms → NOW the entitlement is revoked ───────────────────────────── */
  await aiService.revokePayment('u3', 'pay_3', { reason: 'razorpay_refund', refundId: 'rfnd_3' });
  var linked = await refundRequests.markRefunded('pay_3', { uid: 'u3', refundId: 'rfnd_3' });
  ok(linked === 'refunded', 'T5 the request is closed by the provider confirmation');
  ok(onlyRequest().status === 'refunded' && onlyRequest().providerRefundId === 'rfnd_3',
    'T5 …and carries the provider refund id');
  ok(user('u3').plan === 'free' && user('u3').planExpiry === null,
    'T5 ★ the entitlement is revoked ONLY now, by the canonical pipeline');
  ok(payment('pay_3').status === 'refunded', 'T5 the payment row is refunded');
  ok(payment('pay_3').refundWithinPolicy === true, 'T5 the refund is annotated as within policy');

  /* ── T6 — rejection leaves everything alone ────────────────────────────────────────────────── */
  reset();
  await seedPurchase('u4', 'pay_4', 3);
  await callApi('refund-request', { reason: 'nope' }, 'u4');
  var exp4 = user('u4').planExpiry;
  await refundRequests.reject(onlyRequest().id, 'admin_1', 'admin@qr.test', 'Outside our policy');
  ok(onlyRequest().status === 'rejected' && onlyRequest().decisionNote === 'Outside our policy',
    'T6 the rejection and its reason are recorded');
  ok(user('u4').plan === 'premium' && user('u4').planExpiry === exp4, 'T6 ★ entitlement unchanged on rejection');
  ok(payment('pay_4').status === 'paid', 'T6 the payment row is unchanged');
  ok(await throwsCode(function () { return refundRequests.approve(onlyRequest().id, 'admin_2', 'a2@qr.test', 'oops'); },
    'REFUND_TRANSITION_INVALID'), 'T6 a rejected request cannot then be approved');

  /* ── T7 — THE OTHER HEADLINE: a provider refund far outside our window STILL revokes ───────── */
  reset();
  await seedPurchase('u5', 'pay_5', 40 * 24);            /* captured 40 days ago */
  ok(user('u5').plan === 'premium', 'T7 setup: the user is premium from a 40-day-old purchase');
  var e5 = await callApi('refund-eligibility', {}, 'u5');
  ok(e5.body.state === 'expired', 'T7 the user could NOT request a refund — the window closed 39 days ago');
  /* …and yet Google refunds it through their own support. */
  var late = await aiService.revokePayment('u5', 'pay_5', { reason: 'google_play_voided' });
  ok(user('u5').plan === 'free' && user('u5').planExpiry === null,
    'T7 ★★ a provider refund 40 DAYS after capture STILL fully revokes — our policy never gates execution');
  ok(late.outOfPolicy === true, 'T7 …and is reported as out-of-policy');
  ok(payment('pay_5').refundWithinPolicy === false && payment('pay_5').refundAgeMs > 39 * DAY,
    'T7 the row is annotated with the out-of-policy verdict and the age');
  ok(EVENTS.some(function (e) { return e.type === 'refund_out_of_policy'; }),
    'T7 …and raises a securityEvent for finance, rather than being refused');

  /* ── T8 — an out-of-band refund with no request at all ─────────────────────────────────────── */
  reset();
  await seedPurchase('u6', 'pay_6', 2);
  await aiService.revokePayment('u6', 'pay_6', { reason: 'razorpay_refund' });
  var noReq = await refundRequests.markRefunded('pay_6', { uid: 'u6' });
  ok(noReq === 'none', 'T8 ★ a refund with no request behind it reports `none`, not an error');
  ok(user('u6').plan === 'free', 'T8 ★ …and the revocation still stands (Google support / dashboard refunds)');

  /* ── T9 — a provider refund on a still-PENDING request closes it out of band ───────────────── */
  reset();
  await seedPurchase('u7', 'pay_7', 2);
  await callApi('refund-request', { reason: 'please' }, 'u7');
  await aiService.revokePayment('u7', 'pay_7', { reason: 'razorpay_refund' });
  ok(await refundRequests.markRefunded('pay_7', { uid: 'u7' }) === 'refunded',
    'T9 a provider refund that beats review still closes the request');
  var r9 = onlyRequest();
  ok(r9.status === 'refunded' && r9.outOfBand === true,
    'T9 ★ …and is flagged outOfBand, because it never actually passed review');
  ok(r9.history.length === 3, 'T9 the audit trail records both hops (pending→approved→refunded)');

  /* duplicate webhook delivery is idempotent */
  ok((await refundRequests.markRefunded('pay_7', { uid: 'u7' })) === 'already:refunded',
    'T9 a redelivered confirmation reports already:refunded rather than transitioning again');

  /* ── T10 — duplicate requests are blocked ──────────────────────────────────────────────────── */
  reset();
  await seedPurchase('u8', 'pay_8', 1);
  await callApi('refund-request', { reason: 'first' }, 'u8');
  var dup = await callApi('refund-request', { reason: 'second' }, 'u8');
  ok(dup.status === 409 && dup.body.error.code === 'REFUND_REQUEST_EXISTS', 'T10 a second open request is refused');
  ok(requests().length === 1, 'T10 ★ …and no duplicate record is written');
  /* after a rejection the user may try again — the first request is no longer open */
  await refundRequests.reject(onlyRequest().id, 'admin_1', 'a@qr.test', 'no');
  ok((await callApi('refund-request', { reason: 'again' }, 'u8')).status === 200,
    'T10 once the first is closed, a new request is allowed');

  /* ── T11 — the user can withdraw their own request, and only their own ─────────────────────── */
  reset();
  await seedPurchase('u9', 'pay_9', 1);
  await callApi('refund-request', { reason: 'oops' }, 'u9');
  var reqId = onlyRequest().id;
  var foreign = await callApi('refund-cancel', { requestId: reqId }, 'u_other');
  ok(foreign.status === 404, 'T11 ★ another account cannot cancel someone else\'s request');
  ok(onlyRequest().status === 'pending', 'T11 …and it stays pending');
  var mine = await callApi('refund-cancel', { requestId: reqId }, 'u9');
  ok(mine.status === 200 && onlyRequest().status === 'cancelled', 'T11 the owner can cancel');
  ok(user('u9').plan === 'premium', 'T11 cancelling changes no entitlement');

  /* ── T12 — legacy rows with no capture time route to human review ──────────────────────────── */
  reset();
  await seedPurchase('u10', 'pay_10', 1);
  delete COL.payments.pay_10.capturedAtMs;                 /* a pre-ADR-143 row */
  COL.payments.pay_10.capturedAtSource = 'unknown';
  var e10 = await callApi('refund-eligibility', {}, 'u10');
  ok(e10.body.state === 'unknown_capture_time', 'T12 a legacy row reports unknown_capture_time');
  var made10 = await callApi('refund-request', { reason: 'old purchase' }, 'u10');
  ok(made10.status === 200 && made10.body.needsManualReview === true,
    'T12 ★ it is NOT silently denied — the request is created and badged for manual review');
  ok(onlyRequest().needsManualEligibilityReview === true, 'T12 the badge is on the record for the admin queue');

  /* ── T13 — the window is computed from CAPTURE, never from the grant ───────────────────────── */
  reset();
  /* A 'pending' row completed today, but the money was captured 5 days ago. */
  COL.payments.pay_11 = { uid: 'u11', status: 'pending', plan: 'premium_6m', claimedAt: null };
  await aiService.activatePremium('u11', 'premium_6m', 'pay_11', 'order_11', {
    amountPaise: 29900, capturedAtMs: hoursAgo(5 * 24)
  });
  ok(payment('pay_11').claimedAt && Date.parse(payment('pay_11').claimedAt) > NOW - HOUR,
    'T13 setup: the grant (claimedAt) happened just now');
  ok((await callApi('refund-eligibility', {}, 'u11')).body.state === 'expired',
    'T13 ★ a pending row completed today is EXPIRED — the clock runs from capture 5 days ago, not the grant');

  /* ── T14 — a later capture correction may only move the window EARLIER ─────────────────────── */
  reset();
  /* verify() lands first with no capture time, then the webhook supplies the true one. */
  await aiService.activatePremium('u12', 'premium_6m', 'pay_12', 'order_12', { amountPaise: 29900 });
  ok(payment('pay_12').capturedAtMs === null && payment('pay_12').capturedAtSource === 'unknown',
    'T14 the verify path records no capture time');
  await aiService.activatePremium('u12', 'premium_6m', 'pay_12', 'order_12', {
    amountPaise: 29900, capturedAtMs: hoursAgo(3)
  });
  ok(payment('pay_12').capturedAtMs === hoursAgo(3) && payment('pay_12').capturedAtSource === 'gateway',
    'T14 the webhook back-fills the true capture time');
  /* a replayed webhook claiming a LATER capture must be ignored */
  await aiService.activatePremium('u12', 'premium_6m', 'pay_12', 'order_12', {
    amountPaise: 29900, capturedAtMs: NOW
  });
  ok(payment('pay_12').capturedAtMs === hoursAgo(3),
    'T14 ★ a later claimed capture time is REJECTED — a correction can never extend the refund window');
  await aiService.activatePremium('u12', 'premium_6m', 'pay_12', 'order_12', {
    amountPaise: 29900, capturedAtMs: hoursAgo(9)
  });
  ok(payment('pay_12').capturedAtMs === hoursAgo(9), 'T14 an EARLIER correction is accepted');

  /* ── T15 — an already-refunded purchase cannot be requested again ──────────────────────────── */
  reset();
  await seedPurchase('u13', 'pay_13', 1);
  await aiService.revokePayment('u13', 'pay_13', { reason: 'razorpay_refund' });
  var again = await callApi('refund-request', { reason: 'more please' }, 'u13');
  ok(again.status === 409 && again.body.error.code === 'ALREADY_REFUNDED',
    'T15 a refunded purchase cannot be refunded twice');

  /* ── T16 — input hygiene ───────────────────────────────────────────────────────────────────── */
  reset();
  await seedPurchase('u14', 'pay_14', 1);
  var longReason = new Array(5000).join('x');
  await callApi('refund-request', { reason: longReason }, 'u14');
  ok(onlyRequest().reason.length === schema.MAX_REASON_LEN, 'T16 an over-long reason is capped, not rejected');
  ok(schema.cleanText('  a\n\n  b  ') === 'a b', 'T16 whitespace is normalised');
  ok(schema.cleanText(null) === '' && schema.cleanText({}) === '', 'T16 non-strings become empty');
  reset();
  await seedPurchase('u15', 'pay_15', 1);
  var wrongPay = await callApi('refund-request', { paymentId: 'pay_someone_else', reason: 'x' }, 'u15');
  ok(wrongPay.status === 400 && wrongPay.body.error.code === 'PAYMENT_MISMATCH',
    'T16 ★ naming a different payment is refused rather than silently refunding the wrong one');

  /* ── T17 — no purchase at all ──────────────────────────────────────────────────────────────── */
  reset();
  ok((await callApi('refund-eligibility', {}, 'u16')).body.state === 'no_purchase', 'T17 no purchase → no_purchase');
  ok((await callApi('refund-request', { reason: 'x' }, 'u16')).status === 404, 'T17 …and a request 404s');

  /* ── T18 — the request writer never reaches into the entitlement pipeline ──────────────────── */
  var rrSrc = require('fs').readFileSync(appPath('services/refundRequests.js'), 'utf8');
  /* Strip comments first: the module header legitimately EXPLAINS the rule in prose, and banning the
     word outright would punish the documentation that makes the rule discoverable. What must not
     exist is a call. */
  var rrCode = rrSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/require\(['"]\.\/aiService/.test(rrCode),
    'T18 ★ refundRequests never requires aiService — the dependency runs one way only');
  ok(!/revokePayment\s*\(/.test(rrCode),
    'T18 ★ …and never CALLS revokePayment, so approval cannot grow an entitlement side-effect');
  ok(/revokePayment/.test(rrSrc),
    'T18 the header still explains why (the rule is documented where a maintainer will read it)');

  /* ── T19 — the Super Admin review screen is actually REACHABLE (ADR-143 certification) ───────
     The certification audit found the refund API shipped with ZERO callers: no view file, no nav
     entry, no container, no script tag. The workflow was therefore unreachable — users could submit
     requests and no admin could ever action them, so they accumulated in `pending` forever. A
     backend with no route to it passes every behavioural test ever written about it, which is
     exactly why reachability has to be asserted structurally. */
  var fs19 = require('fs');
  var SA = path.join(__dirname, '..', '..', 'super-admin-app');
  var shell = fs19.readFileSync(path.join(SA, 'index.html'), 'utf8');
  var appJs = fs19.readFileSync(path.join(SA, 'js', 'app.js'), 'utf8');
  ok(fs19.existsSync(path.join(SA, 'api', 'admin', 'refunds.js')), 'T19 the refund review API exists');
  ok(fs19.existsSync(path.join(SA, 'js', 'views', 'refunds.js')), 'T19 ★ the refund review VIEW exists');
  ok(/<script src="js\/views\/refunds\.js"><\/script>/.test(shell), 'T19 ★ the view is script-tagged in the shell');
  ok(/data-view="refunds"/.test(shell), 'T19 ★ a nav entry routes to it');
  ok(/id="view-refunds"/.test(shell), 'T19 ★ its container div exists');
  ok(/'refunds':\s*\{[^}]*view:\s*'RefundsView'/.test(appJs), 'T19 ★ the router maps refunds → RefundsView');
  var apiClient = fs19.readFileSync(path.join(SA, 'js', 'services', 'api.js'), 'utf8');
  ok(/action=decide/.test(apiClient), 'T19 the API client can actually reach the decide endpoint');
  var viewSrc = fs19.readFileSync(path.join(SA, 'js', 'views', 'refunds.js'), 'utf8');
  ok(/needsManualEligibilityReview/.test(viewSrc),
    'T19 the queue surfaces the manual-review badge (legacy rows a human must decide)');
  ok(/submittedWithinWindow/.test(viewSrc),
    'T19 …and whether the request was inside the 24h policy when submitted');
  ok(/does <strong>not<\/strong> change the entitlement|not<\/strong> issue the refund/.test(viewSrc),
    'T19 ★ the UI states that approval neither issues the refund nor changes entitlement');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('\n✗ HARNESS ERROR:', (e && e.stack) || e);
  process.exit(1);
});
