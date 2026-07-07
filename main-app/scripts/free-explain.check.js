/**
 * free-explain.check.js — unit tests for the free-tier AI-explanation allowance (ADR-103).
 *
 * Free accounts get 5 lifetime real QuanAI "Explain" calls. The consume DECISION (grant + decrement while
 * under the cap; deny at the cap) is extracted as a pure function so it can be locked down without Firestore.
 * The transactional wrapper (consumeFreeExplain) and the api/ai.js gating (premium bypasses; only
 * action==='explain' is meterable; throttle/budget run before a credit is spent) are verified by contract
 * review — see docs/BIBLE/DECISION_LOG.md ADR-103 — because they need a live Firestore/Vercel runtime.
 *
 *   node scripts/free-explain.check.js
 */
'use strict';
var policy = require('../services/freeExplainPolicy');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var decide = policy.freeExplainDecision;
var LIMIT = policy.FREE_EXPLAIN_LIMIT;

console.log('Free-tier AI-explanation allowance (ADR-103)\n');

// ── the limit is the promised 5 (matches shared/constants/entitlements AI_EXPLANATION_CREDITS) ──
ok(LIMIT === 5, 'FREE_EXPLAIN_LIMIT is 5');
ok(typeof decide === 'function', 'freeExplainDecision is exported');

// ── grants #1 through #5, denies #6 ──
ok(decide(0, LIMIT).ok === true && decide(0, LIMIT).remaining === 4, 'used 0 → grant, 4 left');
ok(decide(1, LIMIT).ok === true && decide(1, LIMIT).remaining === 3, 'used 1 → grant, 3 left');
ok(decide(2, LIMIT).ok === true && decide(2, LIMIT).remaining === 2, 'used 2 → grant, 2 left');
ok(decide(3, LIMIT).ok === true && decide(3, LIMIT).remaining === 1, 'used 3 → grant, 1 left');
ok(decide(4, LIMIT).ok === true && decide(4, LIMIT).remaining === 0, 'used 4 → grant (the 5th), 0 left');
ok(decide(5, LIMIT).ok === false && decide(5, LIMIT).remaining === 0, 'used 5 → DENY (6th blocked)');
ok(decide(6, LIMIT).ok === false, 'used 6 → deny');
ok(decide(999, LIMIT).ok === false, 'far over the cap → deny');

// ── never over-grants past the cap: exactly 5 grants across a fresh lifetime ──
var grants = 0;
for (var used = 0; used < 20; used++) { if (decide(used, LIMIT).ok) grants++; }
ok(grants === 5, 'exactly 5 grants over a lifetime, never more');

// ── remaining is always a sane non-negative count ──
ok([0, 1, 2, 3, 4, 5, 6].every(function (u) { return decide(u, LIMIT).remaining >= 0; }), 'remaining never negative');

// ── defensive input handling (a corrupt/negative counter must not hand out extra credits or crash) ──
ok(decide(-1, LIMIT).ok === true && decide(-1, LIMIT).remaining === 4, 'negative used treated as 0');
ok(decide(undefined, LIMIT).ok === true, 'undefined used treated as 0');
ok(decide(2.7, LIMIT).ok === true && decide(2.7, LIMIT).remaining === 2, 'fractional used floored');
ok(decide(0).ok === true && decide(0).remaining === 4, 'omitted limit falls back to the default (5)');
ok(decide(0, 0).remaining === 4, 'zero/invalid limit falls back to the default (5)');

// ── a custom limit is honoured (proves the value is sourced, not hard-wired inside the decision) ──
ok(decide(2, 3).ok === true && decide(2, 3).remaining === 0, 'custom limit 3: used 2 → grant, 0 left');
ok(decide(3, 3).ok === false, 'custom limit 3: used 3 → deny');

// ── refund decision (ADR-103 verification-pass follow-up): give back exactly one, never below zero ──
var refund = policy.freeExplainRefund;
ok(typeof refund === 'function', 'freeExplainRefund is exported');
ok(refund(1) === 0, 'refund 1 → 0');
ok(refund(5) === 4, 'refund 5 → 4');
ok(refund(0) === 0, 'refund 0 → 0 (clamped, never negative)');
ok(refund(-3) === 0, 'refund negative → 0 (clamped)');
ok(refund(2.9) === 1, 'refund fractional → floored then decremented');
// consume-then-refund round-trips to the original count (no credit gained or lost on a refunded error)
ok(refund(decide(3, LIMIT).ok ? 4 : 3) === 3, 'consume (3→4) then refund → back to 3');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
