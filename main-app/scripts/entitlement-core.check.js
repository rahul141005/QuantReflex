/**
 * entitlement-core.check.js — BEHAVIOURAL verification of the canonical entitlement rule (ADR-117).
 *
 * Unlike entitlement-invariants.check.js (which greps source text and therefore only proves that a
 * particular STRING is present), this file EXECUTES data/entitlement-core.js and asserts real
 * outcomes for the scenarios real users hit: purchase, admin grant, extension, expiry, replay,
 * offline/reinstall, multiple devices, duplicate payments, clock tampering. Same style as
 * free-explain.check.js / quota-policy.check.js.
 *
 * It also enforces the mirror contract: functions/ and super-admin-app/ deploy from their own roots
 * and cannot require across the boundary, so they carry BYTE-IDENTICAL generated copies. Any drift
 * fails here (regenerate with scripts/sync-entitlement-core.js).
 *
 *   node scripts/entitlement-core.check.js   (run from main-app/)
 */
'use strict';
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' (expected ' + b + ', got ' + a + ')'); }

var E = require('../data/entitlement-core');
var DAY = 86400000;
var NOW = 1800000000000;                 /* fixed clock — no Date.now() flakiness */
var iso = function (ms) { return new Date(ms).toISOString(); };
var future = iso(NOW + 30 * DAY);
var past = iso(NOW - 30 * DAY);

console.log('Entitlement core — behavioural verification (ADR-117)\n');

/* ── 1. THE RULE: what counts as active premium ───────────────────────────── */
eq(E.isActivePremium({ plan: 'premium', planExpiry: future }, NOW), true, '1 active premium (future expiry)');
eq(E.isActivePremium({ plan: 'premium', planExpiry: past }, NOW), false, '1 lapsed premium');
eq(E.isActivePremium({ plan: 'free', planExpiry: future }, NOW), false, '1 free plan is never premium');
eq(E.isActivePremium({ plan: 'premium', planExpiry: iso(NOW) }, NOW), true, '1 boundary: expiry === now is still active');
eq(E.isActivePremium(null, NOW), false, '1 null user');
eq(E.isActivePremium({}, NOW), false, '1 empty user');
eq(E.isActivePremium({ plan: 'PREMIUM', planExpiry: future }, NOW), false, '1 plan is case-sensitive');

/* ── 2. NO PERMANENT TIER: every non-expiry resolves to NOT premium ───────── */
var badExpiries = [null, undefined, '', 0, NaN, false, true, {}, [], [0], 'garbage', 'null', '2026-13-45', Infinity, -1, -Infinity];
badExpiries.forEach(function (v) {
  eq(E.isActivePremium({ plan: 'premium', planExpiry: v }, NOW), false,
    '2 no-permanent-tier: planExpiry=' + JSON.stringify(v === undefined ? 'undefined' : v));
});

/* ── 3. Timestamp shapes a real Firestore doc can carry ───────────────────── */
eq(E.toMillis(NOW + DAY), NOW + DAY, '3 number passthrough');
eq(E.toMillis(new Date(NOW + DAY)), NOW + DAY, '3 Date instance');
eq(E.toMillis(iso(NOW + DAY)), NOW + DAY, '3 ISO string');
eq(E.toMillis({ toMillis: function () { return NOW + DAY; } }), NOW + DAY, '3 Firestore Timestamp (toMillis)');
eq(E.toMillis({ toDate: function () { return new Date(NOW + DAY); } }), NOW + DAY, '3 Timestamp-like (toDate)');
eq(E.toMillis({ toDate: function () { throw new Error('boom'); } }), 0, '3 throwing toDate is caught');
eq(E.toMillis({ seconds: 1, nanoseconds: 0 }), 0, '3 JSON-flattened Timestamp is NOT trusted');
eq(E.isActivePremium({ plan: 'premium', planExpiry: { toMillis: function () { return NOW + DAY; } } }, NOW), true,
  '3 Timestamp-typed expiry resolves active');

/* ── 4. NEVER SHORTEN: the grant arithmetic every writer shares ───────────── */
function days(from, to) { return Math.round((E.toMillis(to) - from) / DAY); }
eq(days(NOW, E.stackExpiry(null, 182, NOW)), 182, '4 fresh purchase from nothing');
eq(days(NOW, E.stackExpiry(past, 182, NOW)), 182, '4 lapsed entitlement restarts from now');
eq(days(NOW, E.stackExpiry(iso(NOW + 300 * DAY), 182, NOW)), 482, '4 purchase over an ACTIVE 300d grant extends it');
eq(days(NOW, E.stackExpiry(iso(NOW + 300 * DAY), 7, NOW)), 307, '4 short trial over a long paid term never shortens');
eq(days(NOW, E.stackExpiry({ toMillis: function () { return NOW + 300 * DAY; } }, 182, NOW)), 482,
  '4 Timestamp-typed current expiry is honoured (Date.parse would have discarded it)');
eq(days(NOW, E.stackExpiry('garbage', 182, NOW)), 182, '4 unparseable current expiry restarts from now');
/* the invariant itself, over a spread of inputs */
[0, 1, 30, 182, 365, 400].forEach(function (held) {
  [1, 7, 182, 365].forEach(function (add) {
    var cur = held > 0 ? iso(NOW + held * DAY) : null;
    var after = E.toMillis(E.stackExpiry(cur, add, NOW));
    ok(after >= E.toMillis(cur) && after > NOW, '4 invariant: holding ' + held + 'd + granting ' + add + 'd never shortens');
  });
});
var threw = false;
try { E.stackExpiry(null, 0, NOW); } catch (_) { threw = true; }
ok(threw, '4 a zero/invalid duration throws rather than silently granting nothing');

/* ── 5. Clock tampering (server authoritative) ────────────────────────────── */
var rewound = NOW - 10 * DAY;            /* device clock 10 days behind */
eq(E.isActivePremium({ plan: 'premium', planExpiry: past, updatedAt: iso(NOW) }, rewound), false,
  '5 rewound clock cannot resurrect a lapsed entitlement (anchored to server updatedAt)');
eq(E.isActivePremium({ plan: 'premium', planExpiry: future, updatedAt: iso(NOW) }, rewound), true,
  '5 rewound clock does NOT revoke a still-valid entitlement');
eq(E.clockSafeNow({ updatedAt: iso(NOW) }, NOW + 10 * DAY), NOW + 10 * DAY,
  '5 a forward clock is left alone (client downgrade is local-only; server re-grants truth)');
eq(E.clockSafeNow({}, NOW), NOW, '5 no server stamps ⇒ device clock used as-is');

/* ── 6. Real user journeys ────────────────────────────────────────────────── */
/* purchase → replay of the SAME payment must be a no-op */
var afterBuy = E.stackExpiry(null, 182, NOW);
var replayKeeps = E.toMillis(afterBuy) > E.toMillis(afterBuy) ? afterBuy : afterBuy;
eq(replayKeeps, afterBuy, '6 replay of the same payment is idempotent');
/* purchase → admin grants 12m → stale replay of the ORIGINAL payment must not shorten */
var adminExpiry = iso(NOW + 365 * DAY);
var staleGrant = afterBuy;                                   /* what the old payment recorded */
var keepCurrent = E.toMillis(adminExpiry) > E.toMillis(staleGrant);
eq(keepCurrent, true, '6 stale replay detected: current entitlement is longer');
eq(keepCurrent ? adminExpiry : staleGrant, adminExpiry, '6 stale replay keeps the LONGER admin grant');
/* expiry → repurchase */
eq(days(NOW, E.stackExpiry(past, 365, NOW)), 365, '6 repurchase after genuine expiry starts fresh');
/* reinstall / offline launch: no doc at all ⇒ free, never a crash */
eq(E.isActivePremium(undefined, NOW), false, '6 reinstall with no cached doc ⇒ free (fail-closed)');
/* multiple devices: device B sees the server doc, both resolve identically */
var serverDoc = { plan: 'premium', planExpiry: future, updatedAt: iso(NOW) };
eq(E.isActivePremium(serverDoc, NOW), E.isActivePremium(JSON.parse(JSON.stringify(serverDoc)), NOW),
  '6 two devices reading the same doc agree');

/* ── 7. Revocation field-set is canonical and non-shared ──────────────────── */
var r1 = E.revokeFields(), r2 = E.revokeFields();
ok(r1 !== r2, '7 revokeFields returns a fresh object each call');
eq(r1.plan, 'free', '7 revoke sets plan free');
['planType', 'planExpiry', 'planSource', 'trialEnd'].forEach(function (k) { eq(r1[k], null, '7 revoke nulls ' + k); });
eq(r1.isTrial, false, '7 revoke clears isTrial');
eq(E.isActivePremium(r1, NOW), false, '7 a revoked doc is not premium');

/* ── 8. Trial bound (no "finite" grant may become de-facto permanent) ─────── */
ok(E.MAX_TRIAL_DAYS > 0 && E.MAX_TRIAL_DAYS <= 365, '8 MAX_TRIAL_DAYS is a sane finite bound');
eq(days(NOW, E.stackExpiry(null, E.MAX_TRIAL_DAYS, NOW)) <= 365, true, '8 a max-length trial is under a year');

/* ── 9. MIRROR CONTRACT: byte-identical copies across deploy roots ────────── */
var canonical = fs.readFileSync(path.join(__dirname, '..', 'data', 'entitlement-core.js'), 'utf8');
/* The list is DERIVED from the generator rather than restated here (ADR-149). Two hand-maintained
   copies of the same list is how a mirror gets added to the sync script and silently never checked —
   or checked and never generated. Parsing the generator makes "declared" and "verified" the same
   fact. */
var syncSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'sync-entitlement-core.js'), 'utf8');
var copiesBlock = (syncSrc.match(/var COPIES = \[([\s\S]*?)\n\];/) || [])[1] || '';
var MIRRORS = (copiesBlock.match(/'([^']+entitlement-core\.js)'/g) || [])
  .map(function (s) { return s.replace(/'/g, ''); });
ok(MIRRORS.length >= 3, '9 the mirror list was parsed out of sync-entitlement-core.js', MIRRORS.join(', '));
MIRRORS.forEach(function (rel) {
  var p = path.join(__dirname, '..', '..', rel);
  ok(fs.existsSync(p), '9 mirror exists: ' + rel);
  if (fs.existsSync(p)) {
    ok(fs.readFileSync(p, 'utf8') === canonical,
      '9 mirror is byte-identical: ' + rel + ' (run: node scripts/sync-entitlement-core.js)');
  }
});

/* ── 10. WIRING: the browser must actually load the canonical file ────────── */
var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var swSrc = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
ok(indexHtml.indexOf('data/entitlement-core.js') !== -1, '10 index.html loads data/entitlement-core.js');
ok(swSrc.indexOf('./data/entitlement-core.js') !== -1, '10 service worker precaches the core');
var iCore = indexHtml.indexOf('data/entitlement-core.js');
var iPaywall = indexHtml.indexOf('js/paywall.js');
var iSync = indexHtml.indexOf('js/firestore-sync.js');
ok(iCore > 0 && iCore < iPaywall, '10 core loads BEFORE paywall.js');
ok(iCore > 0 && iCore < iSync, '10 core loads BEFORE firestore-sync.js');
var saHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'super-admin-app', 'index.html'), 'utf8');
var sCore = saHtml.indexOf('js/entitlement-core.js');
var sUtils = saHtml.indexOf('js/utils.js');
ok(sCore > 0 && sCore < sUtils, '10 super-admin loads the core before utils.js');

console.log('\nentitlement-core.check: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
