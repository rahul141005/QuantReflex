/**
 * notifications.check.js — pipeline tests for the unified notification service (ADR-066).
 *
 * Stubs firebase-admin (in-memory Firestore) + a configurable messaging mock, then drives
 * notificationService.notify() to prove the contract: the Inbox is written for EVERY recipient even when push
 * throws; push respects the per-user opt-out (but the Inbox does not); urgent overrides the opt-out; stale tokens
 * are cleaned; recipient resolution (uids/segment/coaching/audience) works; and a log is written.
 *   node scripts/notifications.check.js
 */
'use strict';
var path = require('path');
function appPath(p) { return path.join(__dirname, '..', p); }

/* ───────── in-memory firestore stub ───────── */
var DB;
function reset() { DB = { users: {}, logs: [] }; }
function notifs(uid) { DB.users[uid] = DB.users[uid] || {}; DB.users[uid]._notifs = DB.users[uid]._notifs || []; return DB.users[uid]._notifs; }
reset();

function userDoc(uid) {
  return {
    id: uid,
    collection: function () { return { doc: function () { var nid = 'n' + Math.random().toString(36).slice(2); return { id: nid, set: function (d) { notifs(uid).push(Object.assign({ _id: nid }, d)); return Promise.resolve(); } }; } }; },
    set: function (d) { DB.users[uid] = Object.assign({}, DB.users[uid], d); return Promise.resolve(); },
    update: function (d) { DB.users[uid] = Object.assign({}, DB.users[uid], d); return Promise.resolve(); },
    get: function () { return Promise.resolve({ id: uid, exists: DB.users[uid] !== undefined, data: function () { return DB.users[uid]; } }); }
  };
}
function get(o, p) { return p.split('.').reduce(function (a, k) { return a && a[k]; }, o); }
function usersQuery() {
  var f = [], lim = Infinity;
  var q = { where: function (a, op, v) { f.push({ a: a, v: v }); return q; }, limit: function (n) { lim = n; return q; },
    get: function () {
      var rows = [];
      Object.keys(DB.users).forEach(function (uid) { var u = DB.users[uid]; if (f.every(function (fl) { return get(u, fl.a) === fl.v; })) rows.push({ id: uid, exists: true, data: function () { return u; } }); });
      rows = rows.slice(0, lim);
      return Promise.resolve({ forEach: function (cb) { rows.forEach(cb); }, size: rows.length });
    } };
  return q;
}
function collection(name) {
  if (name === 'users') return { doc: function (id) { return userDoc(id); }, where: function (a, op, v) { return usersQuery().where(a, op, v); }, limit: function (n) { return usersQuery().limit(n); } };
  if (name === 'notificationLogs') return { add: function (d) { DB.logs.push(d); return Promise.resolve(); } };
  return { doc: function () { return userDoc('?'); }, add: function () { return Promise.resolve(); } };
}
function batch() { return { set: function (ref, d) { ref.set(d); }, update: function (ref, d) { ref.update(d); }, commit: function () { return Promise.resolve(); } }; }
function getAll() { var refs = Array.prototype.slice.call(arguments); return Promise.resolve(refs.map(function (r) { return { id: r.id, exists: DB.users[r.id] !== undefined, data: function () { return DB.users[r.id]; } }; })); }
var dbStub = { collection: collection, batch: batch, getAll: getAll };

var FieldValue = { serverTimestamp: function () { return 'TS'; }, delete: function () { return '__DELETE__'; } };
var adminStub = { apps: [{}], initializeApp: function () {}, credential: { cert: function () {} }, firestore: function () { return dbStub; } };
adminStub.firestore.FieldValue = FieldValue;

/* configurable messaging mock */
var MSG = { mode: 'ok', calls: 0 };
var messaging = { sendEachForMulticast: function (req) {
  MSG.calls++;
  if (MSG.mode === 'throw') return Promise.reject(new Error('fcm down'));
  var responses = req.tokens.map(function (t) { return (MSG.mode === 'stale' && /stale/.test(t)) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }; });
  return Promise.resolve({ successCount: responses.filter(function (r) { return r.success; }).length, failureCount: responses.filter(function (r) { return !r.success; }).length, responses: responses });
} };

var Module = require('module'); var orig = Module._load;
Module._load = function (request) { if (request === 'firebase-admin') return adminStub; return orig.apply(this, arguments); };

var svc = require(appPath('services/notificationService'));

/* ───────── harness ───────── */
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function seedUser(uid, fields) { DB.users[uid] = Object.assign({ _notifs: [] }, fields); }
console.log('QuantReflex notification pipeline (ADR-066)\n');

(async function () {
  // T1 — basic: inbox + push for all push-enabled token holders.
  reset(); MSG.mode = 'ok'; MSG.calls = 0;
  seedUser('a', { fcmToken: 'tA' }); seedUser('b', { fcmToken: 'tB' }); seedUser('c', { fcmToken: 'tC' });
  var r = await svc.notify(dbStub, messaging, { recipients: { uids: ['a', 'b', 'c'] }, notification: { title: 'Hi', body: 'B', category: 'reminder' } });
  ok(r.reached === 3 && r.recipients === 3, 'T1 inbox reached all 3 recipients');
  ok(notifs('a').length === 1 && notifs('a')[0].delivery.inbox === true, 'T1 inbox doc written with delivery.inbox=true');
  ok(notifs('a')[0].category === 'reminder' && notifs('a')[0].icon === '⏰' && notifs('a')[0].deepLink === '#practice', 'T1 category defaults (icon + deepLink) applied');
  ok(notifs('a')[0].delivery.pushAttempted === true, 'T1 delivery.pushAttempted stamped on the doc');
  ok(r.pushed === 3 && MSG.calls === 1 && DB.logs.length === 1 && DB.logs[0].reached === 3, 'T1 push sent + one log written (reached=3)');

  // T2 — push THROWS → inbox still written for everyone, no throw escapes notify.
  reset(); MSG.mode = 'throw';
  seedUser('a', { fcmToken: 'tA' }); seedUser('b', { fcmToken: 'tB' });
  var threw = false;
  try { r = await svc.notify(dbStub, messaging, { recipients: { uids: ['a', 'b'] }, notification: { title: 'X' } }); } catch (e) { threw = true; }
  ok(!threw && r.reached === 2 && notifs('a').length === 1 && notifs('b').length === 1, 'T2 push failure NEVER loses the inbox notification');
  ok(r.pushed === 0 && r.failed >= 1, 'T2 failure counted, delivery degraded gracefully');

  // T3 — explicit opt-out: inbox YES, push NO.
  reset(); MSG.mode = 'ok';
  seedUser('on', { fcmToken: 't1', settings: { notificationsEnabled: true } });
  seedUser('off', { fcmToken: 't2', settings: { notificationsEnabled: false } });
  r = await svc.notify(dbStub, messaging, { recipients: { uids: ['on', 'off'] }, notification: { title: 'N' } });
  ok(r.reached === 2 && notifs('off').length === 1, 'T3 opted-out user STILL gets the inbox notification');
  ok(notifs('off')[0].delivery.pushAttempted === false && r.pushed === 1, 'T3 push skipped for opted-out user (only the opted-in pushed)');

  // T4 — urgent overrides the opt-out for push.
  reset(); MSG.mode = 'ok';
  seedUser('off', { fcmToken: 't2', settings: { notificationsEnabled: false } });
  r = await svc.notify(dbStub, messaging, { recipients: { uids: ['off'] }, notification: { title: 'U', priority: 'urgent', category: 'system' } });
  ok(notifs('off')[0].delivery.pushAttempted === true && r.pushed === 1, 'T4 urgent priority overrides opt-out for push');

  // T5 — no token: inbox only.
  reset(); MSG.mode = 'ok';
  seedUser('notoken', {});
  r = await svc.notify(dbStub, messaging, { recipients: { uids: ['notoken'] }, notification: { title: 'NT' } });
  ok(r.reached === 1 && r.pushed === 0 && notifs('notoken').length === 1, 'T5 tokenless user gets inbox, no push');

  // T6 — stale token cleanup.
  reset(); MSG.mode = 'stale';
  seedUser('s', { fcmToken: 'stale_tok' });
  r = await svc.notify(dbStub, messaging, { recipients: { uids: ['s'] }, notification: { title: 'S' } });
  ok(r.cleaned === 1 && DB.users['s'].fcmToken === '__DELETE__', 'T6 stale FCM token cleaned up');

  // T7 — segment resolution (premium only).
  reset(); MSG.mode = 'ok';
  seedUser('p1', { plan: 'premium', fcmToken: 'p1' }); seedUser('p2', { plan: 'premium', fcmToken: 'p2' }); seedUser('f1', { plan: 'free', fcmToken: 'f1' });
  r = await svc.notify(dbStub, messaging, { recipients: { segment: 'premium' }, notification: { title: 'Seg' } });
  ok(r.reached === 2 && notifs('f1').length === 0, 'T7 segment=premium resolves only premium users');

  // T8 — coaching batch + audience filter (inactive).
  reset(); MSG.mode = 'ok';
  var old = Date.now() - 5 * 24 * 3600 * 1000, recent = Date.now() - 1 * 3600 * 1000;
  seedUser('s1', { coachingId: 'C', fcmToken: 's1', stats: { lastActiveMs: old } });
  seedUser('s2', { coachingId: 'C', fcmToken: 's2', stats: { lastActiveMs: recent } });
  seedUser('x', { coachingId: 'OTHER', fcmToken: 'x', stats: { lastActiveMs: old } });
  r = await svc.notify(dbStub, messaging, { recipients: { coachingId: 'C', audience: 'inactive' }, notification: { title: 'Come back', coachingId: 'C', category: 'coaching' } });
  ok(r.reached === 1 && notifs('s1').length === 1 && notifs('s2').length === 0 && notifs('x').length === 0, 'T8 coaching+inactive resolves only inactive students of that coaching');
  ok(DB.logs[DB.logs.length - 1].segment === 'coaching' && DB.logs[DB.logs.length - 1].coachingId === 'C', 'T8 log records coaching segment + coachingId');

  // T9 — validation: missing title throws.
  reset(); var bad = false;
  try { await svc.notify(dbStub, messaging, { recipients: { uids: ['a'] }, notification: { body: 'no title' } }); } catch (e) { bad = /title/.test(e.message); }
  ok(bad, 'T9 missing title is rejected');

  console.log('\n──────────────────────────────');
  console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('harness error:', e); process.exit(1); });
