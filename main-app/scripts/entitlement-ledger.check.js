/**
 * entitlement-ledger.check.js — unit tests for the refund/replay algebra (ADR-141, Phase-4 WS2 §9.4).
 *
 * services/entitlementLedger.js decides how much Premium a user is still owed after one of their
 * purchases is refunded. It is pure (no Firebase, no ambient clock), so unlike the transactional
 * wrapper around it — aiService.revokePayment, verified separately by payment-refund.check.js — it can
 * be pinned down exactly here.
 *
 * The assertion this file exists for is the LAPSED-THEN-REPURCHASED counter-example: refunding an old,
 * already-expired purchase must not shorten a later, still-valid one. Naive day-subtraction gets that
 * wrong in the direction that silently steals paid access, so it is asserted from several angles.
 *
 *   node scripts/entitlement-ledger.check.js
 */
'use strict';
var ledger = require('../services/entitlementLedger');
var entitlement = require('../data/entitlement-core');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var DAY = 24 * 60 * 60 * 1000;
/* A fixed epoch so every assertion below is deterministic — no Date.now() anywhere in this file. */
function d(iso) { return Date.parse(iso + 'T00:00:00.000Z'); }
function days(ms) { return Math.round(ms / DAY); }

console.log('Entitlement ledger — refund replay algebra (ADR-141)\n');

/* ── surface ─────────────────────────────────────────────────────────────────────────────────── */
ok(typeof ledger.stackFrom === 'function', 'stackFrom is exported');
ok(typeof ledger.recomputeExpiry === 'function', 'recomputeExpiry is exported');
ok(typeof ledger.isStillPremium === 'function', 'isStillPremium is exported');
ok(ledger.DAY_MS === DAY, 'DAY_MS is 86400000');
ok(ledger.DAY_MS === entitlement.DAY_MS, 'DAY_MS agrees with entitlement-core (no second definition of a day)');

/* ── stackFrom: the one-step algebra ─────────────────────────────────────────────────────────── */
ok(ledger.stackFrom(d('2025-01-01'), 0, 182) === d('2025-01-01') + 182 * DAY,
  'first purchase runs from its own claim date');
/* running expiry is LATER than the claim → stacks on top of it (renewal before lapse) */
ok(ledger.stackFrom(d('2025-03-01'), d('2025-07-02'), 182) === d('2025-07-02') + 182 * DAY,
  'renewal bought while the previous term is live stacks on the running expiry, not on `now`');
/* running expiry is EARLIER than the claim → restarts from the claim (repurchase after lapse) */
ok(ledger.stackFrom(d('2025-10-01'), d('2025-07-02'), 182) === d('2025-10-01') + 182 * DAY,
  'repurchase after a lapse restarts from the claim date, not from the dead expiry');
ok(ledger.stackFrom(d('2025-01-01'), 0, 182) === ledger.stackFrom(d('2025-01-01'), -5, 182),
  'a negative running expiry is treated as none');

/* stackFrom must agree with the canonical grant arithmetic it mirrors: given the same base and days,
   entitlement.stackExpiry (used at GRANT time) and stackFrom (used at REFUND time) land identically.
   If these ever diverge, a refund would silently re-date every surviving purchase. */
var base = d('2025-07-02');
ok(entitlement.stackExpiry(new Date(base).toISOString(), 182, d('2025-03-01')) ===
   new Date(ledger.stackFrom(d('2025-03-01'), base, 182)).toISOString(),
  'stackFrom is byte-identical to entitlement-core.stackExpiry for the same inputs');

/* a nonsense duration must fail loudly rather than contribute nothing (mirrors stackExpiry) */
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }
ok(throws(function () { ledger.stackFrom(d('2025-01-01'), 0, 0); }), 'days = 0 throws');
ok(throws(function () { ledger.stackFrom(d('2025-01-01'), 0, -30); }), 'negative days throws');
ok(throws(function () { ledger.stackFrom(d('2025-01-01'), 0, NaN); }), 'NaN days throws');
ok(throws(function () { ledger.stackFrom(d('2025-01-01'), 0, Infinity); }), 'Infinite days throws');

/* ── THE COUNTER-EXAMPLE: refunding a lapsed purchase must not shorten a later one ───────────── */
var P1 = { claimedAtMs: d('2025-01-01'), days: 182 };   /* 1 Jan → 2 Jul */
var P2 = { claimedAtMs: d('2025-10-01'), days: 182 };   /* 1 Oct → 1 Apr 2026 (P1 long lapsed) */

var bothMs = ledger.recomputeExpiry([P1, P2], d('2025-11-01'));
ok(bothMs === d('2025-10-01') + 182 * DAY, 'P1 + P2 with a gap → expiry runs from P2 (the gap is not backfilled)');

var afterRefundP1 = ledger.recomputeExpiry([P2], d('2025-11-01'));
ok(afterRefundP1 === bothMs,
  'THE COUNTER-EXAMPLE: refunding the LAPSED P1 leaves the expiry completely unchanged');
/* the failure this guards against, stated explicitly so the check reads as its own documentation */
var naiveSubtraction = bothMs - 182 * DAY;
ok(afterRefundP1 !== naiveSubtraction,
  'naive day-subtraction would have stolen 182 days of a purchase the user still owns — replay does not');
ok(days(afterRefundP1 - naiveSubtraction) === 182, '…and the size of the theft it avoids is the full P2 term');

var afterRefundP2 = ledger.recomputeExpiry([P1], d('2025-11-01'));
ok(afterRefundP2 === d('2025-01-01') + 182 * DAY, 'refunding P2 falls back to P1s own (already lapsed) expiry');
ok(ledger.isStillPremium(afterRefundP2, d('2025-11-01')) === false,
  '…and since that expiry is in the past, the user is no longer premium');

/* ── contiguous purchases: refunding the FIRST one must move the whole chain back ─────────────── */
var A = { claimedAtMs: d('2025-01-01'), days: 182 };    /* → 2 Jul */
var B = { claimedAtMs: d('2025-03-01'), days: 182 };    /* stacked → 31 Dec */
var chain = ledger.recomputeExpiry([A, B], d('2025-04-01'));
ok(chain === d('2025-01-01') + 364 * DAY, 'two overlapping purchases stack to the full 364 days');
var chainMinusA = ledger.recomputeExpiry([B], d('2025-04-01'));
ok(chainMinusA === d('2025-03-01') + 182 * DAY,
  'refunding the first of two OVERLAPPING purchases correctly re-dates the survivor to its own claim');
ok(chainMinusA < chain, '…which is genuinely shorter — the replay does shorten when it should');
var chainMinusB = ledger.recomputeExpiry([A], d('2025-04-01'));
ok(chainMinusB === d('2025-01-01') + 182 * DAY, 'refunding the second leaves the first intact');

/* ── order independence: a query without an orderBy must not change the answer ────────────────── */
ok(ledger.recomputeExpiry([P2, P1], d('2025-11-01')) === ledger.recomputeExpiry([P1, P2], d('2025-11-01')),
  'reversed input order gives the identical expiry (recomputeExpiry sorts internally)');
ok(ledger.recomputeExpiry([B, A], d('2025-04-01')) === chain,
  'reversed order on the overlapping chain is identical too');
var shuffled = [
  { claimedAtMs: d('2025-06-01'), days: 30 },
  { claimedAtMs: d('2025-01-01'), days: 182 },
  { claimedAtMs: d('2025-03-15'), days: 90 }
];
var sorted = shuffled.slice().sort(function (x, y) { return x.claimedAtMs - y.claimedAtMs; });
ok(ledger.recomputeExpiry(shuffled, 0) === ledger.recomputeExpiry(sorted, 0),
  'three purchases in arbitrary order match the pre-sorted answer');

/* ── empty / revert-to-free ──────────────────────────────────────────────────────────────────── */
ok(ledger.recomputeExpiry([], d('2025-11-01')) === null, 'no surviving purchases → null (revert to free)');
ok(ledger.recomputeExpiry(null, d('2025-11-01')) === null, 'null entries → null');
ok(ledger.recomputeExpiry(undefined, d('2025-11-01')) === null, 'undefined entries → null');
/* null must mean FREE, never "indefinite" — assert the canonical rule agrees */
ok(entitlement.isActivePremium({ plan: 'premium', planExpiry: null }, d('2025-11-01')) === false,
  'a null expiry resolves to NOT premium under ADR-115 — so null from the ledger is safe to write as free');
ok(ledger.isStillPremium(null, d('2025-11-01')) === false, 'isStillPremium(null) is false');

/* ── corrupt rows are dropped, never guessed at ──────────────────────────────────────────────── */
ok(ledger.recomputeExpiry([{ claimedAtMs: 0, days: 182 }], 0) === null,
  'a row with an unparseable claimedAt (0) is dropped, not dated to the epoch');
ok(ledger.recomputeExpiry([{ claimedAtMs: d('2025-01-01'), days: 0 }], 0) === null,
  'a row with days = 0 is dropped');
ok(ledger.recomputeExpiry([{ claimedAtMs: d('2025-01-01'), days: NaN }], 0) === null,
  'a row with NaN days is dropped');
ok(ledger.recomputeExpiry([null, undefined, P2], d('2025-11-01')) === bothMs,
  'null/undefined rows are skipped without disturbing the surviving arithmetic');
ok(ledger.recomputeExpiry([{ claimedAtMs: -1, days: 182 }, P2], d('2025-11-01')) === bothMs,
  'a negative claimedAt is dropped rather than extending the term backwards');
/* a dropped row must never be able to LENGTHEN the result — that would be a free grant from corruption */
ok(ledger.recomputeExpiry([P2, { claimedAtMs: NaN, days: 9999 }], d('2025-11-01')) === bothMs,
  'a corrupt 9999-day row cannot extend a real entitlement');

/* ── isStillPremium boundary ─────────────────────────────────────────────────────────────────── */
var t = d('2025-11-01');
ok(ledger.isStillPremium(t + 1, t) === true, 'expiry 1ms in the future → premium');
ok(ledger.isStillPremium(t, t) === false, 'expiry exactly now → NOT premium (strictly future, fail-safe)');
ok(ledger.isStillPremium(t - 1, t) === false, 'expiry 1ms in the past → not premium');
ok(ledger.isStillPremium(0, t) === false, 'zero expiry → not premium');
ok(ledger.isStillPremium(-1, t) === false, 'negative expiry → not premium');
ok(ledger.isStillPremium(NaN, t) === false, 'NaN expiry → not premium');
ok(ledger.isStillPremium('garbage', t) === false, 'unparseable expiry → not premium');

/* ── the replay never invents time ───────────────────────────────────────────────────────────── */
/* Sum-of-days is the upper bound: overlapping purchases stack exactly, gapped ones do not backfill. */
var many = [
  { claimedAtMs: d('2025-01-01'), days: 182 },
  { claimedAtMs: d('2025-02-01'), days: 365 },
  { claimedAtMs: d('2025-09-01'), days: 182 }
];
var total = ledger.recomputeExpiry(many, 0);
ok(total === d('2025-01-01') + (182 + 365 + 182) * DAY,
  'three fully-overlapping purchases stack to exactly the sum of their days');
var subsetTotal = ledger.recomputeExpiry(many.slice(0, 2), 0);
ok(subsetTotal < total, 'removing any purchase from an overlapping chain always shortens it');
ok(days(total - subsetTotal) === 182, '…by exactly the refunded term when the chain is contiguous');

/* purely deterministic: same inputs, same answer, no ambient clock */
ok(ledger.recomputeExpiry(many, 0) === ledger.recomputeExpiry(many, d('2030-01-01')),
  'the recomputed expiry does not depend on `now` (the clock only decides free-vs-premium afterwards)');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
