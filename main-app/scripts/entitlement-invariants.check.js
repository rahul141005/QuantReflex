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
/* ADR-117: durations are still finite 365/182, but the arithmetic moved to the canonical core's
   never-shorten stackExpiry(). Assert BOTH: the finite durations AND that the grant is computed
   from the user's CURRENT entitlement (buildUpdates now takes the user doc). */
ok('admin premium_6m/12m grants stay finite (365/182 days)', /action === 'premium_12m' \? 365 : 182/.test(entSrc));
ok('admin grants use the canonical never-shorten stackExpiry', /entitlement\.stackExpiry\(/.test(entSrc));
ok('admin grants read the user\'s current entitlement (no blind overwrite)', /buildUpdates\s*=\s*\(userData\)/.test(entSrc) && /buildUpdates\(\s*typeof userDoc\.data/.test(entSrc));
ok('admin trial duration is upper-bounded', /MAX_TRIAL_DAYS/.test(entSrc));
ok('admin premium grant never sets planExpiry to null on a premium action',
  !/plan\s*=\s*'premium'[\s\S]{0,200}planExpiry\s*=\s*null/.test(entSrc));

/* ---- 2. null/invalid expiry resolves to NOT-premium — CLIENT AND SERVER (no permanent tier) ---- */
const pw = R('js/paywall.js');
/* ADR-117: the rule itself now lives in data/entitlement-core.js (behaviourally verified by
   entitlement-core.check.js, incl. every null/garbage expiry). Here we assert the DELEGATION —
   that paywall.js resolves through the canonical core rather than re-deriving the rule. */
ok('paywall delegates the decision to the canonical core', /c\.isActivePremium\(/.test(pw), 'hasPremiumAccess must call QR_ENTITLEMENT.isActivePremium');
ok('paywall fails closed when the core is unavailable', /return c \? c\.isActivePremium\(u\) : false;/.test(pw));
ok('paywall no longer re-implements expiry parsing', !/Date\.parse\(/.test(pw), 'timestamp parsing belongs to entitlement-core');
ok('paywall hasPremiumAccess: no legacy `return true` indefinite branch', !/if \(!expiryMs\) return true;/.test(pw));
ok('paywall exposes canonical hasActivePremium', /function hasActivePremium\b/.test(pw) && /global\.hasActivePremium\s*=/.test(pw));
/* server must MATCH the client — resolveUserAuth treats a non-positive/absent expiry as not-premium */
const aiSrc0 = R('services/aiService.js');
ok('server resolveUserAuth delegates to the canonical core', /if \(!entitlement\.isActivePremium\(data\)\)/.test(aiSrc0), 'server must resolve via entitlement.isActivePremium');
ok('server resolveUserAuth: no old skip-null-expiry branch', !/if \(expiryMs > 0 && expiryMs < Date\.now\(\)\) \{/.test(aiSrc0));
ok('server requires the canonical core module', /require\('\.\.\/data\/entitlement-core'\)/.test(aiSrc0), 'client and server must share ONE physical module');
/* the (undeployed) expiry cron must REVOKE a null-expiry premium doc, not skip it */
const cron = RR('functions/index.js');
ok('expiry cron revokes null-expiry premium (no indefinite skip)', !/if \(!data\.planExpiry\) return;/.test(cron));

/* ---- 3. server no-shorten stacking (any active premium, not just purchase) ---- */
const ai = R('services/aiService.js');
/* ADR-117: the fresh-grant path now delegates to the canonical never-shorten stackExpiry (the
   arithmetic itself is behaviourally proven in entitlement-core.check.js), and — critically — the
   REPLAY path is guarded too: it used to write the stored payment expiry unconditionally, moving a
   user's entitlement BACKWARD if they had since gained a longer one. */
ok('aiService fresh grant uses canonical stackExpiry', /finalExpiry = entitlement\.stackExpiry\(/.test(ai));
ok('aiService no longer hand-rolls baseMs arithmetic', !/var baseMs = Date\.now\(\);/.test(ai));
ok('aiService no longer parses expiry with Date.parse', !/Date\.parse\(ud\.planExpiry\)/.test(ai), 'Date.parse returns NaN for Timestamp/number expiries, discarding the term');
ok('replay path compares against the CURRENT entitlement', /var keepCurrent = ud0\.plan === 'premium' && currentMs > grantedMs;/.test(ai), 'a stale replay must never shorten a longer current grant');
ok('replay path preserves stronger grant provenance', /if \(!keepCurrent\) \{[\s\S]{0,200}?planSource = 'purchase';/.test(ai), 'a stale webhook must not relabel an admin grant as a purchase');

/* ---- 4. create-order refuses a duplicate purchase while premium ---- */
const pay = R('api/payment.js');
ok('create-order blocks purchase when already premium', /if \(req\.userPremium\)/.test(pay) && /ALREADY_PREMIUM/.test(pay));

/* ---- 5. client never persists an entitlement downgrade (self-heal is local-view-only) ----
   ADR-130: this section used to be four NEGATIVE regexes asserting that three error-message strings from
   the DELETED code were absent, plus one asserting a COMMENT exists. That is a fingerprint of the old
   implementation, not the invariant — any newly written persist path with a different message satisfied
   all four and the whole suite stayed green. The BEHAVIOUR is now proven by EXECUTION in
   firestore-durability.check.js (the "ENT …" block: an expired premium downgrades in memory and writes
   nothing; a poisoned localStorage buffer cannot replay entitlement state; legitimate fields still
   write). What remains here is the STRUCTURAL half — that the enforcement exists and is centralised. */
const fs2 = R('js/firestore-sync.js');
const core = R('data/entitlement-core.js');

/* the canonical list lives in ONE place and is derived from the revocation set, so it cannot drift */
ok('entitlement-core exports the client-immutable field list',
  /clientImmutableFields\s*:/.test(core) && /isClientImmutableField\s*:/.test(core));
ok('the immutable list is DERIVED from revokeFields (cannot drift from the revocation set)',
  /function clientImmutableFields\(\)[\s\S]{0,400}revokeFields\(\)/.test(core));

/* all three choke points are wired — queue entry, durable-buffer replay, and the write snapshots */
ok('sync refuses entitlement fields at queue entry', /if \(_isEntitlementField\(field\)\)/.test(fs2));
ok('sync strips entitlement fields when replaying the durable buffer',
  /_stripEntitlementFields\(parsed\.updates\)/.test(fs2));
const stripAtWrite = (fs2.match(/Object\.keys\(_stripEntitlementFields\(_pendingUpdates\)\)/g) || []).length;
ok('both flush paths strip entitlement fields before writing (debounced + logout)', stripAtWrite === 2,
  'found ' + stripAtWrite + ' of 2');
ok('the guard fails closed when the core is unavailable', /_IMMUTABLE_FALLBACK/.test(fs2));

/* the self-heal still mutates only the in-memory view — no docRef parameter, so it cannot write */
ok('_enforcePremiumExpiry takes no docRef (cannot write)',
  /function _enforcePremiumExpiry\(data\s*\/\*,\s*docRef\s*\*\//.test(fs2));
ok('firestore-sync self-heal documents local-view-only', /LOCAL VIEW ONLY/.test(fs2));
ok('no _planExpiryPersistInFlight state remains', !/_planExpiryPersistInFlight/.test(fs2));

/* ---- 7. The idempotency lock must not be client-erasable (ADR-139) ----
   `payments/{paymentId}` is the ONLY thing standing between a replayed (orderId, paymentId,
   signature) triple and a second grant: `?action=verify` has no recency check, a paid Razorpay order
   stays paid forever, and activatePremium's sole replay defence is `if (paymentDoc.exists)`. If a
   client can delete that doc, the replay falls through to the new-grant branch and stackExpiry adds
   another full term — unbounded self-service premium. Assert the collection is read-only to clients.
   Also guards the paused Play work, whose `gp_<sha256(token)>` lock rests on the same rule. */
const rules = RR('firestore/rules/firestore.rules');
const payMatch = rules.match(/match\s+\/payments\/\{[^}]*\}\s*\{([\s\S]*?)\n\s*\}/);
ok('firestore.rules payments block parses', !!payMatch);
if (payMatch) {
  const body = payMatch[1];
  const allowsClientDelete = /allow[^;]*\bdelete\b[^;]*:\s*if\s+(?!false)/.test(body);
  ok('payments/{id} is NOT client-deletable (the idempotency lock must survive a replay)',
    !allowsClientDelete, body.trim().replace(/\s+/g, ' ').slice(0, 120));
  ok('payments/{id} denies client create/update/delete',
    /allow\s+create,\s*update,\s*delete:\s*if\s+false/.test(body));
}

/* ---- 6. qr_premium write-only mirror removed (one source of truth) ---- */
const store = R('js/state/store.js');
const auth = R('js/auth.js');
ok('store.js has no getPremiumStatus/setPremiumStatus', !/getPremiumStatus|setPremiumStatus/.test(store));
ok('store.js KEYS has no premium slot', !/premium:\s*'qr_premium'/.test(store));
ok('auth.js no longer writes qr_premium', !/setPremiumStatus|localStorage\.setItem\('qr_premium'/.test(auth));

console.log('entitlement-invariants.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
