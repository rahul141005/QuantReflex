/**
 * entitlement-invariants.check.js — locks the entitlement/premium correctness invariants from the
 * Production Bug Audit (Wave S1) so they can't silently regress. Source-level ratchet (same style as
 * payment-parity.check.js): parses the actual files and asserts the guarantees hold.
 *
 * Invariants:
 *   1. No permanent tier — admin grants are finite-only (6m/12m/trial/revoke), computing finite expiries.
 *   2. No permanent tier — a `premium` doc with null/invalid expiry resolves to NOT-premium (fail-safe).
 *   3. No-shorten — a new grant never reduces an existing active entitlement (stacking gate is not
 *      restricted to planSource==='purchase' anymore).
 *   4. No duplicate purchase — create-order refuses when the caller already has active premium.
 *   5. Server-authoritative — the client never PERSISTS a plan:'free' downgrade (local view only).
 *   6. One source of truth — the write-only qr_premium localStorage mirror is gone.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const RR = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* ---- 1. Admin grants finite-only (no permanent tier) ---- */
const entSrc = RR('super-admin-app/api/admin/entitlements.js');
const actionsM = entSrc.match(/VALID_ACTIONS\s*=\s*\[([^\]]*)\]/);
ok('admin VALID_ACTIONS parses', !!actionsM);
if (actionsM) {
  const actions = actionsM[1];
  ok('admin actions are exactly 6m/12m/trial/revoke',
    /'premium_6m'/.test(actions) && /'premium_12m'/.test(actions) && /'trial'/.test(actions) && /'revoke'/.test(actions));
  ok('admin has NO indefinite/lifetime/permanent grant action',
    !/(indefinite|lifetime|permanent|forever)/i.test(actions), actions.trim());
}
/* premium grants must compute a finite expiry (182/365 days), never null */
ok('admin premium_6m grant computes finite 182-day expiry', /_expiryAfterDays\(\s*action === 'premium_12m' \? 365 : 182\s*\)/.test(entSrc));
ok('admin premium grant never sets planExpiry to null on a premium action',
  !/plan\s*=\s*'premium'[\s\S]{0,200}planExpiry\s*=\s*null/.test(entSrc));

/* ---- 2. null/invalid expiry resolves to NOT-premium — CLIENT AND SERVER (no permanent tier) ---- */
const pw = R('js/paywall.js');
ok('paywall hasPremiumAccess: null expiry => not premium', /if \(!expiryMs\) return false;/.test(pw), 'expected `if (!expiryMs) return false;`');
ok('paywall hasPremiumAccess: no legacy `return true` indefinite branch', !/if \(!expiryMs\) return true;/.test(pw));
ok('paywall exposes canonical hasActivePremium', /function hasActivePremium\b/.test(pw) && /global\.hasActivePremium\s*=/.test(pw));
/* server must MATCH the client — resolveUserAuth treats a non-positive/absent expiry as not-premium */
const aiSrc0 = R('services/aiService.js');
ok('server resolveUserAuth: null/invalid expiry => not premium', /if \(!\(expiryMs > 0\) \|\| expiryMs < Date\.now\(\)\)/.test(aiSrc0), 'server still uses the old `expiryMs > 0 && ...` skip');
ok('server resolveUserAuth: no old skip-null-expiry branch', !/if \(expiryMs > 0 && expiryMs < Date\.now\(\)\) \{/.test(aiSrc0));
/* the (undeployed) expiry cron must REVOKE a null-expiry premium doc, not skip it */
const cron = RR('functions/index.js');
ok('expiry cron revokes null-expiry premium (no indefinite skip)', !/if \(!data\.planExpiry\) return;/.test(cron));

/* ---- 3. server no-shorten stacking (any active premium, not just purchase) ---- */
const ai = R('services/aiService.js');
const stackM = ai.match(/var baseMs = Date\.now\(\);[\s\S]{0,320}?finalExpiry = new Date\(baseMs/);
ok('aiService stacking block found', !!stackM);
if (stackM) {
  ok('stacking no longer gated on planSource===\'purchase\'', !/planSource\s*===\s*'purchase'/.test(stackM[0]), 'a purchase must never shorten an admin/coaching grant');
  ok('stacking extends from existing planExpiry', /ud\.plan === 'premium' && ud\.planExpiry/.test(stackM[0]));
}

/* ---- 4. create-order refuses a duplicate purchase while premium ---- */
const pay = R('api/payment.js');
ok('create-order blocks purchase when already premium', /if \(req\.userPremium\)/.test(pay) && /ALREADY_PREMIUM/.test(pay));

/* ---- 5. client never persists a plan:'free' downgrade (self-heal is local-view-only) ---- */
const fs2 = R('js/firestore-sync.js');
/* The two removed persist blocks each carried a unique catch message; their absence proves the
   client no longer writes plan:'free' from the expiry self-heal. (The legitimate plan:'free' in
   _createDefaultDocument — full new-user doc — is intentionally untouched.) */
ok('no _enforcePremiumExpiry persist (removed)', !/failed to persist expiry/i.test(fs2));
ok('no getAccessState persist (removed)', !/persist premium expiry from access state/i.test(fs2));
ok('no _planExpiryPersistInFlight state remains', !/_planExpiryPersistInFlight/.test(fs2));
ok('firestore-sync self-heal documents local-view-only', /LOCAL VIEW ONLY/.test(fs2));

/* ---- 6. qr_premium write-only mirror removed (one source of truth) ---- */
const store = R('js/state/store.js');
const auth = R('js/auth.js');
ok('store.js has no getPremiumStatus/setPremiumStatus', !/getPremiumStatus|setPremiumStatus/.test(store));
ok('store.js KEYS has no premium slot', !/premium:\s*'qr_premium'/.test(store));
ok('auth.js no longer writes qr_premium', !/setPremiumStatus|localStorage\.setItem\('qr_premium'/.test(auth));

console.log('entitlement-invariants.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
