/**
 * ensure-profile.check.js — contract tests for POST /api/account?action=ensure-profile.
 *
 * Stubs firebase-admin (in-memory Firestore + Auth) and the api middleware, then drives the
 * account handler to prove the provisioning contract for provider (Google) sign-ins:
 *   T1 missing doc          → full register.js-shaped seed (entitlements, emailLower, stats, profile.name) + usage/ai
 *   T2 session-skeleton doc → seeded WITHOUT clobbering activeSessionId/activeSessionAt
 *   T3 provisioned doc      → strict no-op (existed:true), coachingId untouched
 *   T4 existing usage/ai    → never reset (create() ALREADY_EXISTS swallowed)
 *   node scripts/ensure-profile.check.js
 */
'use strict';
var path = require('path');
function appPath(p) { return path.join(__dirname, '..', p); }

/* ───────── in-memory firestore + auth stub ───────── */
var DB, USAGE, AUTH_USER;
function reset() {
  DB = {};      /* uid → user doc */
  USAGE = {};   /* uid → usage/ai doc */
  AUTH_USER = { uid: 'u1', email: 'Student@Gmail.com', displayName: 'Krishna' };
}
reset();

function usageDocRef(uid) {
  return {
    create: function (d) {
      if (USAGE[uid]) { var e = new Error('ALREADY_EXISTS'); e.code = 6; return Promise.reject(e); }
      USAGE[uid] = d; return Promise.resolve();
    }
  };
}
function userRef(uid) {
  return {
    id: uid,
    get: function () { return Promise.resolve({ exists: DB[uid] !== undefined, data: function () { return DB[uid]; } }); },
    set: function (d, opts) {
      if (opts && opts.merge) DB[uid] = Object.assign({}, DB[uid] || {}, d);
      else DB[uid] = d;
      return Promise.resolve();
    },
    collection: function (name) {
      if (name === 'usage') return { doc: function () { return usageDocRef(uid); } };
      return { doc: function () { return { set: function () { return Promise.resolve(); } }; } };
    }
  };
}
var dbStub = {
  collection: function (name) {
    return { doc: function (id) { return userRef(id); } };
  },
  runTransaction: function (fn) {
    var tx = {
      get: function (ref) { return ref.get(); },
      set: function (ref, d, opts) { ref.set(d, opts); }
    };
    return Promise.resolve(fn(tx));
  },
  batch: function () { return { set: function () {}, update: function () {}, commit: function () { return Promise.resolve(); } }; }
};

var FieldValue = { serverTimestamp: function () { return 'TS'; }, increment: function (n) { return { __inc: n }; } };
var adminStub = {
  apps: [{}],
  initializeApp: function () {},
  credential: { cert: function () {} },
  firestore: function () { return dbStub; },
  auth: function () { return { getUser: function (uid) { return AUTH_USER ? Promise.resolve(AUTH_USER) : Promise.reject(new Error('not found')); } }; }
};
adminStub.firestore.FieldValue = FieldValue;

var middlewareStub = {
  withAuth: function (fn) { return fn; },
  parseBody: function (req) { return req.body || {}; },
  formatError: function (e) { return { code: 'ERR', message: String(e && e.message) }; },
  isCoachingActive: function () { return true; }
};
var aiServiceStub = {};

var Module = require('module'); var orig = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return adminStub;
  if (/_lib\/middleware$/.test(request)) return middlewareStub;
  if (/services\/aiService$/.test(request)) return aiServiceStub;
  return orig.apply(this, arguments);
};

var handler = require(appPath('api/account.js'));

/* ───────── harness ───────── */
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function call() {
  var out = { status: null, body: null };
  var res = {
    status: function (s) { out.status = s; return res; },
    json: function (b) { out.body = b; return out; }
  };
  var req = { userId: 'u1', method: 'POST', query: { action: 'ensure-profile' } };
  return handler(req, res).then(function () { return out; });
}

console.log('QuantReflex ensure-profile provisioning contract\n');

(async function () {
  /* T1 — missing doc: full seed */
  reset();
  var r = await call();
  var u = DB.u1;
  ok(r.status === 200 && r.body.success === true && r.body.existed === false, 'T1 provisions a missing doc (existed:false)');
  ok(u && u.plan === 'free' && u.planType === null && u.isTrial === false && u.planExpiry === null, 'T1 entitlement defaults seeded (safe free tier)');
  ok(u && u.email === 'Student@Gmail.com' && u.emailLower === 'student@gmail.com', 'T1 email + emailLower (admin-search key) seeded');
  ok(u && u.createdAt === 'TS' && u.stats && typeof u.stats.lastActiveMs === 'number', 'T1 createdAt + stats roster key seeded');
  ok(u && u.profile && u.profile.name === 'Krishna', 'T1 profile.name seeded from the Google display name');
  ok(u && u.coachingId === null, 'T1 coachingId seeded null');
  ok(USAGE.u1 && USAGE.u1.explanationsUsed === 0 && USAGE.u1.wordProblemsUsedToday === 0, 'T1 usage/ai quota doc created');

  /* T2 — session skeleton (Session.claim merge-set ran first): seed fills, skeleton survives */
  reset();
  DB.u1 = { activeSessionId: 'sess-abc', activeSessionAt: 12345 };
  r = await call();
  u = DB.u1;
  ok(r.status === 200 && r.body.existed === false, 'T2 skeleton doc (no plan) is treated as unprovisioned');
  ok(u.activeSessionId === 'sess-abc' && u.activeSessionAt === 12345, 'T2 session skeleton fields preserved (merge, not overwrite)');
  ok(u.plan === 'free' && u.emailLower === 'student@gmail.com', 'T2 seed fields filled in around the skeleton');

  /* T3 — fully provisioned: strict no-op, coachingId untouched */
  reset();
  DB.u1 = { plan: 'premium', planExpiry: 999, coachingId: 'QRABCD1234', email: 'old@x.com' };
  USAGE.u1 = { explanationsUsed: 4, wordProblemsUsedToday: 2, wordProblemsUsedLifetime: 9 };
  r = await call();
  u = DB.u1;
  ok(r.status === 200 && r.body.existed === true, 'T3 provisioned doc → no-op (existed:true)');
  ok(u.plan === 'premium' && u.planExpiry === 999 && u.coachingId === 'QRABCD1234' && u.email === 'old@x.com', 'T3 nothing overwritten on a provisioned doc');
  ok(USAGE.u1.explanationsUsed === 4, 'T3 existing usage/ai untouched');

  /* T4 — re-run after T1: usage/ai never reset */
  reset();
  await call();               /* provisions */
  USAGE.u1.explanationsUsed = 3;
  DB.u1.plan = undefined;     /* force the seed path again to exercise the .create() guard */
  delete DB.u1.plan;
  r = await call();
  ok(r.status === 200 && USAGE.u1.explanationsUsed === 3, 'T4 usage/ai create() ALREADY_EXISTS swallowed — quota never reset');

  /* T5 — auth user missing → 404, no doc created */
  reset();
  AUTH_USER = null;
  r = await call();
  ok(r.status === 404 && DB.u1 === undefined, 'T5 missing Auth user → 404, nothing written');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('CHECK CRASHED:', e); process.exit(1); });
