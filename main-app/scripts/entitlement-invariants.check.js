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

/* Every .js under main-app/ except node_modules — used by the single-definition ratchets. */
function walkJs(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(function (name) {
    if (name === 'node_modules' || name === '.git') return;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkJs(full, out);
    else if (/\.js$/.test(name)) out.push(full);
  });
  return out;
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

/* ADR-149: AN ADMIN REVOKE MUST SURVIVE A PAYMENT REPLAY.
   PAYMENT_READINESS P1-1 names the defect: "an admin revoke followed by a late payment.captured
   webhook retry re-grants premium". WS2 built the cure (PAYMENT_STATUS_TERMINAL in activatePremium)
   but wired only the REFUND path to it — an admin revoke left the payments row `status:'paid'`, i.e.
   a live grant. `?action=verify` has no recency check, so a user revoked for abuse could restore
   their own access by re-submitting their own receipt. */
ok('★★ an admin revoke settles the purchased payment rows to a TERMINAL status (replay cannot undo it)',
  /action === 'revoke'/.test(entSrc) && /status:\s*'revoked'/.test(entSrc));
ok('★ …scoped to entitlements that were actually PURCHASED (a coaching/trial revoke needs no payment query)',
  /planSource === 'purchase'/.test(entSrc));
/* Read fresh here rather than reusing `aiSrc`, which is declared further down this file. */
ok('★ …and \'revoked\' is a terminal status activatePremium already refuses to grant against',
  /PAYMENT_STATUS_TERMINAL\s*=\s*\{[^}]*revoked:\s*true/.test(R('services/aiService.js')));

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

/* ---- 8. The entitlement audit trail must not be client-writable (ADR-140) ----
   `users/{uid}/entitlementLogs` records every grant, trial and revoke. The blanket owner-write over
   `users/{uid}/{subcollection}/{doc}` excluded duelHistory/duelStats/aiEvents/notifications but NOT
   this, so an owner could erase their own revoke or forge a grant. It never granted premium (plan
   fields are root-level, downgrade-only, server-owned) and the immutable root `auditLogs` copy always
   survived — but refund/chargeback/voided-purchase disputes are read from this per-user history, so a
   forgeable copy misleads the investigation. Assert the carve-out stays. */
const blanket = rules.match(/match\s+\/\{subcollection\}\/\{document\}\s*\{([\s\S]*?)\n\s{6}\}/);
ok('firestore.rules blanket subcollection block parses', !!blanket);
if (blanket) {
  ok('entitlementLogs is excluded from the blanket owner-write (audit trail is server-owned)',
    /subcollection\s*!=\s*'entitlementLogs'/.test(blanket[1]),
    blanket[1].replace(/\s+/g, ' ').slice(0, 140));
}

/* ---- 9. A refunded payment must never grant again (ADR-141, WS2) ----
   Razorpay redelivers `payment.captured` on its own schedule, `?action=verify` has no recency check,
   and (once WS1 lands) Play replays PURCHASED notifications after a voided purchase. Before ADR-141
   the existing-doc branch re-applied the entitlement UNCONDITIONALLY, so a customer could buy, charge
   back, and then renew Premium for free off the same paymentId forever. The behaviour is proven by
   execution in payment-refund.check.js (T6/T11); this is the source-level ratchet that stops the
   guard being deleted, and the wiring assertions that check.js cannot see. */
const aiSrc = R('services/aiService.js');
ok('PAYMENT_STATUS_TERMINAL declares refunded as a terminal payment status',
  /PAYMENT_STATUS_TERMINAL\s*=\s*\{[^}]*\brefunded:\s*true/.test(aiSrc));
ok('activatePremium refuses a grant on a terminal payment status',
  /if\s*\(PAYMENT_STATUS_TERMINAL\[status\]\)/.test(aiSrc));
ok('the refusal is signalled as a typed PAYMENT_REFUNDED error (never a falsy return)',
  /AIServiceError\('PAYMENT_REFUNDED'/.test(aiSrc));
ok('revokePayment exists and is exported',
  /async function revokePayment\(/.test(aiSrc) && /module\.exports\s*=\s*\{[^}]*\brevokePayment\b/.test(aiSrc));
ok('revoke recomputes the expiry by REPLAYING the surviving ledger, never by subtracting days',
  /ledger\.recomputeExpiry\(/.test(aiSrc) && !/planExpiry[^\n]*-\s*\w*[Dd]ays\s*\*/.test(aiSrc));
ok('revoke reverts to free through the canonical field-set (entitlement-core.revokeFields)',
  /patch\s*=\s*entitlement\.revokeFields\(\)/.test(aiSrc));
ok('revoke refuses to touch an entitlement whose planSource is no longer a purchase',
  /ud0\.planSource\s*!==\s*'purchase'/.test(aiSrc));
ok('revoke tombstones even when the grant never landed (a late capture then hits the refuse branch)',
  /tomb\.tombstone\s*=\s*true/.test(aiSrc) && /out\.tombstoned\s*=\s*!existing/.test(aiSrc));
ok('the ledger query carries no orderBy (a missing field must not silently drop a purchase)',
  /where\('uid',\s*'==',\s*uid\)\.where\('status',/.test(aiSrc) &&
  !/where\('status',[^\n]*\)\s*\.orderBy/.test(aiSrc));
/* ADR-149: and it must include partially-refunded rows. A partial refund deliberately does not
   shorten the term — revokePayment's own status guard treats such a row as a live grant — so a
   ledger that queried `status == 'paid'` alone silently dropped it, and the next full refund of a
   DIFFERENT purchase revoked the entitlement the partial refund had explicitly preserved. */
ok('★ the ledger replay includes partially-refunded purchases, which are still live grants',
  /where\('status',\s*'in',\s*\['paid',\s*'partially_refunded'\]\)/.test(aiSrc));

/* W4: the payment row must record what the GATEWAY said it captured, not our own catalog price. */
ok('the payment row records the gateway-reported amount when available (W4)',
  /amount:\s*\(reportedPaise\s*!==\s*null\)\s*\?\s*reportedPaise\s*:\s*expectedPaise/.test(aiSrc));
ok('…and labels which source it used, so reconciliation can tell evidence from catalog',
  /amountSource:\s*\(reportedPaise\s*!==\s*null\)\s*\?\s*'gateway'\s*:\s*'catalog'/.test(aiSrc));
ok('…and the term length is recorded on the row for the refund replay',
  /days:\s*days,/.test(aiSrc));

/* The webhook is the only place a refund can arrive from Razorpay. Without a handler the grant path
   is one-way: money returned, entitlement retained until natural expiry. */
const whSrc = R('api/payment/webhook.js');
ok('the webhook handles refund.processed', /event\s*===\s*'refund\.processed'/.test(whSrc));
ok('a FULL refund routes through the single canonical revoke path',
  /aiService\.revokePayment\(/.test(whSrc));
ok('a PARTIAL refund does not revoke — it marks the row and escalates',
  /'partially_refunded'/.test(whSrc) && /payment_partial_refund/.test(whSrc));
ok('partially_refunded is NOT terminal (a partial refund keeps the entitlement)',
  !/PAYMENT_STATUS_TERMINAL\s*=\s*\{[^}]*partially_refunded/.test(aiSrc));
ok('a redelivered capture for a refunded payment is ACKed, not retried forever',
  /grantErr\.code\s*===\s*'PAYMENT_REFUNDED'/.test(whSrc));
ok('the interactive verify path surfaces PAYMENT_REFUNDED to the caller',
  /err\.code\s*===\s*'PAYMENT_REFUNDED'/.test(R('api/payment.js')));

/* A4: the ledger replay runs inside a transaction during a refund — the single worst moment to
   discover a missing composite index, because the money has already moved. */
const idx = JSON.parse(RR('firestore/indexes/firestore.indexes.json'));
const payIdx = idx.indexes.filter((i) => i.collectionGroup === 'payments');
ok('a payments composite index is declared for the ledger replay [uid, status, claimedAt]',
  payIdx.some((i) => {
    const f = i.fields.map((x) => x.fieldPath).join(',');
    return f === 'uid,status,claimedAt';
  }), payIdx.map((i) => i.fields.map((x) => x.fieldPath).join(',')).join(' | ') || 'none');

/* ---- 10. Refund ELIGIBILITY must never gate refund EXECUTION (ADR-143) ----
   The 24-hour window governs whether a user may ASK for a refund. It says nothing about whether a
   refund that ALREADY HAPPENED at the provider should be honoured. Google can refund through its own
   support long after our window closes, a voidedPurchasesNotification can arrive weeks later, and a
   Razorpay dashboard refund can be issued at any time — in every case the money has already gone
   back, so the entitlement must be revoked however old the purchase is.

   A window check inside revokePayment would therefore silently ignore a day-40 Google refund and leave
   the user holding both Premium and their money — inverting ADR-141. It is a very easy mistake to make
   (it reads like consistency), so it is ratcheted at source rather than left to review. */
const revokeSrc = (function () {
  const m = aiSrc.match(/async function revokePayment\([\s\S]*?\n\}\n/);
  return m ? m[0] : '';
})();
ok('revokePayment is locatable for the refund-policy ratchet', revokeSrc.length > 500);
ok('revokePayment NEVER calls refundPolicy.eligibility (eligibility must not gate execution)',
  !/refundPolicy\.eligibility\s*\(/.test(revokeSrc));
ok('revokePayment contains no refund-window comparison of its own',
  !/REFUND_WINDOW_MS/.test(revokeSrc));
ok('revokePayment never returns early on an out-of-window refund',
  !/skipped\s*=\s*['"]outside_refund_window/.test(revokeSrc) && !/STATE_EXPIRED/.test(revokeSrc));
ok('revokePayment DOES annotate the policy verdict (recorded, never enforced)',
  /refundPolicy\.isWithinWindow\(/.test(revokeSrc) && /refundWithinPolicy/.test(revokeSrc));
ok('an out-of-policy refund raises a securityEvent rather than being refused',
  /refund_out_of_policy/.test(aiSrc));

/* ADR-146 (WS6): the same rule, extended to every CALLER of a revocation path.
   Ratcheting only revokePayment was sufficient while Razorpay's webhook was the sole caller. Play
   adds two more — the RTDN endpoint and the reconciliation sweep — and a window check placed in
   EITHER would ignore a day-40 Google refund just as effectively as one placed inside revokePayment,
   while leaving revokePayment itself provably clean. So the ratchet follows the callers.
   Comments are stripped first: these files must be free to EXPLAIN the rule they obey. */
['api/payment/play-rtdn.js', 'api/payment/webhook.js'].forEach(function (rel) {
  var src = R(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('★ ' + rel + ' never gates a revocation on refund eligibility',
    !/refundPolicy\.eligibility\s*\(/.test(src) && !/REFUND_WINDOW/.test(src) && !/STATE_EXPIRED/.test(src));
});
/* Reconciliation lives inside the payment domain API; scope the check to its function body so the
   user-facing refund-request actions in the same file — which SHOULD gate on eligibility — are not
   caught by it. That distinction is the whole of ADR-143: eligibility gates REQUESTS, never EXECUTION. */
(function () {
  var payApi = R('api/payment.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  var m = payApi.match(/async function _playReconcile\([\s\S]*?\n\}\n/);
  ok('_playReconcile is locatable for the refund-policy ratchet', !!m && m[0].length > 400);
  var body = m ? m[0] : '';
  ok('★★ Play reconciliation never gates a revocation on refund eligibility',
    !/refundPolicy\./.test(body) && !/REFUND_WINDOW/.test(body) && !/STATE_EXPIRED/.test(body));
  /* ADR-149 NARROWED THIS INVARIANT, DELIBERATELY. It used to be an absolute ban on activatePremium
     in the sweep, whose purpose was that reconciliation can never MANUFACTURE Premium. But the ban
     had a cost the original framing missed: a row reserved by `verify-play` and never completed (the
     client died mid-verify, or Google was unreachable and only the reservation landed) is a customer
     who PAID AND GOT NOTHING, and the sweep would acknowledge it and mark it settled — removing it
     from its own working set forever with no entitlement ever granted. RTDN normally completes such a
     row; reconciliation exists precisely for when RTDN does not, so it has to be able to do the one
     thing that matters.
     The protection is kept by making the grant NARROW instead of forbidden, and each half is
     asserted below: reconciliation may only COMPLETE a row it already holds — pending, with a uid
     this server recorded from an authenticated request — and only when Google itself reports the
     purchase as purchased. It may still never create a row, and never invent a uid. */
  ok('★★ Play reconciliation may only COMPLETE a pending row that already names its owner',
    /row\.data\.status\s*===\s*'pending'\s*&&\s*row\.data\.uid/.test(body));
  ok('★★ …and any grant it makes is inside that guard, using the row\'s own uid',
    !/activatePremium\s*\(/.test(body) ||
    /if\s*\(row\.data\.status\s*===\s*'pending'\s*&&\s*row\.data\.uid\)\s*\{[\s\S]{0,400}?activatePremium\(row\.data\.uid,/.test(body));
  ok('★★ Play reconciliation never CREATES a payment row (it cannot invent a purchase)',
    !/_reservePendingPlayRow\s*\(/.test(body) && !/\.create\s*\(/.test(body));
})();

/* the window itself is declared exactly once in the repo */
const policySrc = R('services/refundPolicy.js');
ok('the 24-hour window is declared in services/refundPolicy.js',
  /REFUND_WINDOW_HOURS\s*=\s*24\b/.test(policySrc));
const windowDefiners = walkJs(path.join(__dirname, '..')).filter(function (f) {
  /* `=(?!=)` so a comparison (`=== 24`) in a check script is not mistaken for a definition. */
  return /REFUND_WINDOW_(MS|HOURS)\s*=(?!=)/.test(fs.readFileSync(f, 'utf8'));
}).map(function (f) { return path.relative(path.join(__dirname, '..'), f); });
ok('exactly one module DEFINES the refund window (no second definition of 24 hours)',
  windowDefiners.length === 1 && windowDefiners[0] === 'services/refundPolicy.js',
  windowDefiners.join(', ') || 'none');

/* the clock's origin: capture time, never our grant time */
ok('activatePremium records the gateway capture time',
  /capturedAtMs:\s*capturedAtMs/.test(aiSrc) && /capturedAtSource:/.test(aiSrc));
ok('a capture-time correction may only move EARLIER (never extends the refund window)',
  /capturedAtMs\s*<\s*existingCaptured/.test(aiSrc));

/* the workflow: approval authorises, the provider confirms, and only then is anything revoked */
const rrSrc = R('services/refundRequests.js').replace(/\/\*[\s\S]*?\*\//g, '');
ok('approving a refund request never touches the entitlement pipeline',
  !/revokePayment\s*\(/.test(rrSrc));
ok('the refund-request writer never requires aiService (one direction of dependency)',
  !/require\(['"]\.\/aiService/.test(rrSrc));
const refundSchema = require('../api/_lib/refund-schema');
ok('the six specified statuses are declared, exactly',
  refundSchema.STATUSES.join(',') === 'pending,approved,rejected,refunded,failed,cancelled');
ok('pending cannot jump straight to refunded (a refund passes through review)',
  !refundSchema.canTransition('pending', 'refunded', 'provider').ok);
ok('only the provider may mark a request refunded (never an admin)',
  refundSchema.canTransition('approved', 'refunded', 'admin').reason === 'wrong_actor');

/* the request record is server-owned, exactly like payments */
const rrMatch = rules.match(/match\s+\/refundRequests\/\{[^}]*\}\s*\{([\s\S]*?)\n\s*\}/);
ok('firestore.rules refundRequests block parses', !!rrMatch);
if (rrMatch) {
  ok('refundRequests denies every client write (status is server-owned)',
    /allow\s+create,\s*update,\s*delete:\s*if\s+false/.test(rrMatch[1]));
  ok('refundRequests is readable only by its owner',
    /allow read:\s*if\s+request\.auth\s*!=\s*null[\s\S]*?resource\.data\.uid\s*==\s*request\.auth\.uid/.test(rrMatch[1]));
}

/* A4: the ledger replay runs inside a transaction during a refund — the worst moment to discover a
   missing composite index. The refund queue needs its own. */
const idx143 = JSON.parse(RR('firestore/indexes/firestore.indexes.json'));
const rrIdx = idx143.indexes.filter((i) => i.collectionGroup === 'refundRequests')
  .map((i) => i.fields.map((x) => x.fieldPath).join(','));
ok('refundRequests composite indexes are declared (owner history + admin queue)',
  rrIdx.indexOf('uid,createdAtMs') !== -1 && rrIdx.indexOf('status,createdAtMs') !== -1,
  rrIdx.join(' | ') || 'none');

/* ---- 6. qr_premium write-only mirror removed (one source of truth) ---- */
const store = R('js/state/store.js');
const auth = R('js/auth.js');
ok('store.js has no getPremiumStatus/setPremiumStatus', !/getPremiumStatus|setPremiumStatus/.test(store));
ok('store.js KEYS has no premium slot', !/premium:\s*'qr_premium'/.test(store));
ok('auth.js no longer writes qr_premium', !/setPremiumStatus|localStorage\.setItem\('qr_premium'/.test(auth));

/* ---- 7. the `premium` JWT claim stays a MIRROR and never becomes a gate (ADR-149) ----
   The claim is written on grant and cleared on lapse, but NOTHING reads it, and nothing may. The
   Super Admin grant path deliberately does not write it — a bulk coaching grant would otherwise cost
   one Firebase Auth write per student for a field with no reader — so an admin-granted user
   legitimately carries `premium:false`. A server fast path that trusted the claim would therefore
   deny access to exactly the users an administrator just granted it to, and the symptom would look
   like the grant silently failing.
   This is the ratchet that stops that fast path from ever being built. It is scoped to SERVER code:
   claimsService itself is the writer, and check scripts must stay free to test for it. */
(function () {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const READS_CLAIM = /\b(decoded|token|claims|payload|req\.user)\s*(\.|\[['"])premium\b/;
  const offenders = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'scripts') return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); return; }
      if (!/\.js$/.test(e.name)) return;
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (rel.indexOf('services/claimsService.js') !== -1) return;      /* the writer */
      const src = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (READS_CLAIM.test(src)) offenders.push(rel);
    });
  }
  ['main-app/api', 'main-app/services', 'super-admin-app/api', 'coaching-admin-app/api', 'functions']
    .forEach(function (d) { walk(path.join(ROOT, d)); });
  ok('★★ no server gate reads the `premium` JWT claim (it is a mirror, and admin grants do not set it)',
    offenders.length === 0, offenders.join(', '));
})();

console.log('entitlement-invariants.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
