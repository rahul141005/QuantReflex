const OpenAI = require('openai');
const admin = require('firebase-admin');
const pricing = require('./aiPricing');   // SINGLE source of truth for model pricing + cost math
const freeExplainPolicy = require('./freeExplainPolicy');   // ADR-103: pure free-explain allowance decision
const entitlement = require('../data/entitlement-core');    // ADR-117: THE canonical entitlement rule + grant arithmetic
                                                            // (same physical module the browser loads as window.QR_ENTITLEMENT)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not set. AI features will be unavailable.');
}

if (!admin.apps.length) {
  var firebaseConfig = { projectId: 'quant-reflex-trainer' };
  var serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      var serviceAccount = JSON.parse(serviceAccountJson);
      firebaseConfig.credential = admin.credential.cert(serviceAccount);
    } catch (parseErr) {
      console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON:', parseErr.message);
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set. Firestore and Auth will not work.');
  }
  admin.initializeApp(firebaseConfig);
}
var db = admin.firestore();

var openaiClient = null;
var AI_MODEL = 'gpt-4o-mini';

function getClient() {
  if (!openaiClient && OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

class AIServiceError extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.retryable = retryable || false;
  }
}

// (ADR-045) Removed an unused, drifted CATEGORY_LABELS copy here — the canonical topic map lives in
// services/quantTopics.js and is the single source of truth.

async function verifyIdToken(idToken) {
  try {
    // checkRevoked=true (ADR-072): a revoked/disabled/deleted account is rejected immediately rather than staying
    // valid until the ~1h ID-token expiry. Matches the coaching-admin pattern.
    var decoded = await admin.auth().verifyIdToken(idToken, true);
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Resolve a user's entitlement (v2). The ONLY server entitlement check.
 *
 *   premium ⟺ plan === 'premium' && planExpiry is a real FUTURE timestamp
 *
 * (ADR-117) The rule itself lives in `data/entitlement-core.js` — the same module the browser
 * loads — so client, server and cron can never drift. There is NO permanent tier: a null/invalid
 * expiry resolves to NOT premium and is self-healed away.
 *
 * Self-heals: a lapsed premium/trial is written back to 'free' on read, so dashboards and gates
 * stay consistent even if the sweep function lags.
 *
 * @returns {'free'|'premium'}
 */
/**
 * Resolve a user's entitlement + active session in ONE Firestore read (ADR-072). Returns
 *   { plan:'free'|'premium', premium:boolean, activeSessionId:string|null }.
 * Self-heals an expired premium/trial to 'free' on read (same as before). `resolvePlan`/`isUserPremium` are thin
 * wrappers so existing callers are unchanged; the auth middleware uses this one to also enforce single-device.
 */
async function resolveUserAuth(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return { plan: 'free', premium: false, activeSessionId: null };
    var data = doc.data();
    var activeSessionId = (typeof data.activeSessionId === 'string' && data.activeSessionId) ? data.activeSessionId : null;
    if (data.plan !== 'premium') return { plan: 'free', premium: false, activeSessionId: activeSessionId };
    var expiryMs = entitlement.toMillis(data.planExpiry);
    /* No permanent tier (ADR-115/117): active premium requires a real FUTURE expiry. The decision is
       the canonical `entitlement.isActivePremium` — byte-identical to the client's. A null/invalid
       expiry is illegitimate data and resolves to NOT-premium; both it and a genuine lapse self-heal
       to free, but only a genuine past-date expiry sends the one-time "expired" notice (a null-expiry
       doc never had a real term, so notifying "expired" would mislead). */
    if (!entitlement.isActivePremium(data)) {
      var genuineExpiry = expiryMs > 0;
      try {
        var _revoke = entitlement.revokeFields();
        _revoke.planUpdatedAt = new Date().toISOString();
        await safeUserUpdate(uid, _revoke, 'resolvePlan:expiry');
        /* ADR-117: the JWT `premium` claim is a MIRROR of the Firestore entitlement, never a source
           of truth. It was previously set true on every grant and cleared by nothing, leaving a
           permanently stale `true` that any future fast-path would wrongly trust. Clear it here, on
           the one code path every lapse funnels through. Best-effort — never blocks the resolution. */
        try { require('./claimsService').setEntitlementClaims(uid, { premium: false }); } catch (_) {}
        // ADR-066: notify the user their Premium expired — through the ONE pipeline (Inbox + best-effort push).
        // Fires exactly once, on a genuine premium→free expiry transition. Fire-and-forget so it never delays the check.
        if (genuineExpiry) {
          try {
            require('./notificationService').notify(db, admin.messaging(), {
              recipients: { uids: [uid] },
              notification: { title: 'Your Premium has expired', body: 'Renew to keep your AI Coach, Planner, Insights and Math Duels.', type: 'premium', category: 'billing', deepLink: '#settings' },
              logSegment: 'billing'
            }).catch(function () {});
          } catch (_) {}
        }
      } catch (expiryErr) {
        console.error('[aiService:resolveUserAuth] expiry self-heal failed (uid: ' + uid + '):', expiryErr.message);
      }
      return { plan: 'free', premium: false, activeSessionId: activeSessionId };
    }
    return { plan: 'premium', premium: true, activeSessionId: activeSessionId };
  } catch (err) {
    console.error('[aiService:resolveUserAuth] lookup failed (uid: ' + uid + '):', err.message);
    throw new AIServiceError('ENTITLEMENT_ERROR', 'Unable to verify access status. Please try again.', true);
  }
}

async function resolvePlan(uid) {
  return (await resolveUserAuth(uid)).plan;
}

async function isUserPremium(uid) {
  return (await resolveUserAuth(uid)).premium;
}

/**
 * Claim the single active session for a user (ADR-072). Server-only (Admin SDK) write of `activeSessionId` — a
 * client can never write this field (Firestore rules deny it), so it can't forge or steal another device's session.
 */
async function claimSession(uid, sessionId) {
  var sid = (typeof sessionId === 'string') ? sessionId.trim().slice(0, 64) : '';
  if (!uid || !sid) throw new AIServiceError('BAD_SESSION', 'A valid session id is required.', false);
  await db.collection('users').doc(uid).set({
    activeSessionId: sid,
    activeSessionAt: new Date().toISOString()
  }, { merge: true });
  return sid;
}

/* ADR-117: kept as a thin alias so any future caller lands on the canonical parser rather than
   hand-rolling a fourth one. The implementation is data/entitlement-core.js#toMillis. */
function _toExpiryMillis(value) { return entitlement.toMillis(value); }

async function safeUserUpdate(uid, data, caller) {
  if (!uid) {
    console.error('[aiService:safeUserUpdate] called without uid from ' + (caller || 'unknown'));
    return;
  }
  var payload = Object.assign({}, data);
  payload.updatedAt = new Date().toISOString();
  try {
    await db.collection('users').doc(uid).set(payload, { merge: true });

  } catch (err) {
    console.error('[aiService:safeUserUpdate] FAILED from ' + (caller || 'unknown') + ' (uid: ' + uid + '):', err.message);
    throw err;
  }
}

var PREMIUM_DURATION_DAYS = { premium_6m: 182, premium_12m: 365 };
var PREMIUM_PRICE_PAISE = { premium_6m: 29900, premium_12m: 39900 }; /* canonical plan→price (paise) — revenue accounting */

/**
 * Activate the single Premium plan from a verified payment (v2).
 *
 * Idempotent + replay-protected: uses payments/{paymentId} as a transactional
 * lock so one payment cannot be replayed across accounts, and records an audit
 * row. Sets the canonical plan fields; clears any trial.
 *
 * @param {string} uid
 * @param {string} planType - 'premium_6m' | 'premium_12m'
 * @param {string|number} paymentId
 * @param {string} [orderId]
 * @returns {string} planExpiry (ISO 8601)
 */
async function activatePremium(uid, planType, paymentId, orderId) {
  var days = PREMIUM_DURATION_DAYS[planType] || 182;
  var expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  var paymentRef = db.collection('payments').doc(String(paymentId));
  var userRef = db.collection('users').doc(uid);
  var finalExpiry = expiry;

  await db.runTransaction(async function (tx) {
    /* All reads MUST precede all writes in a Firestore transaction. */
    var paymentDoc = await tx.get(paymentRef);
    var userDoc = await tx.get(userRef);
    var ud0 = (userDoc.exists ? userDoc.data() : null) || {};
    if (paymentDoc.exists) {
      var existing = paymentDoc.data();
      if (existing.uid !== uid) {
        console.error('[aiService:activatePremium] PAYMENT_REPLAY detected (uid: ' + uid + ', paymentId: ' + paymentId + ', existingUid: ' + existing.uid + ')');
        throw new AIServiceError('PAYMENT_REPLAY', 'Payment already used by another account.', false);
      }
      /* Same-uid replay (verify + webhook both fire, or a late Razorpay redelivery, or the user
         re-submits an old (orderId,paymentId,signature) triple — `?action=verify` has no recency
         check, so this branch is reachable indefinitely).
         ADR-117 (audit B1): this used to write `existing.expiry` UNCONDITIONALLY, which moved a
         user's entitlement BACKWARD whenever they had since gained a longer one (e.g. an admin
         12-month grant after a 6-month purchase) — the next resolveUserAuth then self-healed them
         to FREE, silently destroying paid access. A replay must be a no-op for a user who is
         already at-or-beyond the expiry this payment granted: keep the LATER of the two, and never
         downgrade planType/planSource away from a stronger existing grant. */
      var currentMs = entitlement.toMillis(ud0.planExpiry);
      var grantedMs = entitlement.toMillis(existing.expiry || expiry);
      var keepCurrent = ud0.plan === 'premium' && currentMs > grantedMs;
      finalExpiry = keepCurrent ? ud0.planExpiry : (existing.expiry || expiry);
      var replayPatch = {
        plan: 'premium',
        planExpiry: finalExpiry,
        isTrial: false,
        trialEnd: null,
        lastPaymentId: String(paymentId),
        planUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      /* Preserve the provenance of a stronger existing grant (an admin grant must not be relabelled
         'purchase' by a stale webhook); otherwise record this payment as the source. */
      if (!keepCurrent) {
        replayPatch.planType = existing.plan || planType;
        replayPatch.planSource = 'purchase';
      }
      tx.set(userRef, replayPatch, { merge: true });
      return;
    }
    /* No-shorten renewal (ADR-107 + audit S1-ENT2): a new grant must NEVER reduce an existing active
       entitlement, regardless of how it was obtained (purchase / admin / coaching / trial). The new
       term extends from the LATER of {now, current expiry}. Previously this only stacked for
       planSource==='purchase', so a purchase landing on top of a longer admin/coaching grant
       overwrote it with a shorter now+days expiry — a paying user could lose months of access.
       (A premium doc with a null/invalid expiry is not a valid active grant under the no-permanent-
       tier rule, so it does not extend — base stays `now`.) The client + create-order block prevent a
       purchase while premium is active; this server guard is the defense-in-depth backstop.
       ADR-117: the arithmetic now lives in the canonical core (`stackExpiry`), shared by every
       writer — and it uses the tolerant `toMillis` parser rather than `Date.parse`, which returned
       NaN (silently discarding the user's remaining term) for a Firestore Timestamp or numeric
       expiry. */
    finalExpiry = entitlement.stackExpiry(
      (ud0.plan === 'premium') ? ud0.planExpiry : null,
      days
    );
    var paymentDoc2 = { uid: uid, plan: planType, amount: (PREMIUM_PRICE_PAISE[planType] || 0), status: 'paid', expiry: finalExpiry, claimedAt: new Date().toISOString() };
    if (orderId) paymentDoc2.orderId = String(orderId);
    tx.create(paymentRef, paymentDoc2);
    tx.set(userRef, {
      plan: 'premium',
      planType: planType,
      planExpiry: finalExpiry,
      planSource: 'purchase',
      isTrial: false,
      trialEnd: null,
      lastPaymentId: String(paymentId),
      planUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });

  return finalExpiry;
}

var WP_FREE_LIMIT = 5;
var WP_PREMIUM_DAILY = 30;
/* ADR-103: free-tier lifetime allowance for the real QuanAI "Explain" feature. The value + pure grant decision
   live in the dependency-free services/freeExplainPolicy.js (single source of truth, unit-tested there). */
var FREE_EXPLAIN_LIMIT = freeExplainPolicy.FREE_EXPLAIN_LIMIT;
var MAX_QUESTION_LENGTH = 300;
/* Per-uid usage cache for display/pre-check reads only. The authoritative caps
   (consumeWordProblemQuota / consumeFreeExplain) always read fresh inside a Firestore transaction,
   so this cache can never cause an over-grant. S3-FS4: bound it on a warm serverless instance with a
   short TTL (so a stale cross-request read self-corrects) and a size cap (so it can't grow unbounded
   across many uids). */
var usageCache = {};
var usageCacheTs = {};
var USAGE_CACHE_TTL_MS = 60000;
var USAGE_CACHE_MAX = 500;

function _cacheUsage(uid, data) {
  usageCache[uid] = data;
  usageCacheTs[uid] = Date.now();
  var uids = Object.keys(usageCache);
  if (uids.length > USAGE_CACHE_MAX) {
    uids.sort(function (a, b) { return (usageCacheTs[a] || 0) - (usageCacheTs[b] || 0); });
    var evict = uids.length - USAGE_CACHE_MAX;
    for (var i = 0; i < evict; i++) { delete usageCache[uids[i]]; delete usageCacheTs[uids[i]]; }
  }
  return data;
}

async function _loadUsage(uid) {
  if (usageCache[uid] && (Date.now() - (usageCacheTs[uid] || 0) < USAGE_CACHE_TTL_MS)) return usageCache[uid];
  try {
    var doc = await db.collection('users').doc(uid).collection('usage').doc('ai').get();
    if (doc.exists) {
      return _cacheUsage(uid, _normalizeUsageDoc(doc.data()));
    }
  } catch (err) {
    console.warn('Usage read failed:', err.message);
  }
  try {
    var legacyDoc = await db.collection('users').doc(uid).collection('usage').doc('wordProblems').get();
    if (legacyDoc.exists) {
      var legacy = legacyDoc.data();
      var migrated = {
        wordProblemsUsedLifetime: legacy.wordProblemsUsedLifetime || 0,
        wordProblemsUsedToday: legacy.wordProblemsUsedToday || 0,
        wordProblemsLastDate: legacy.lastUsedDate || null,
        lastUsageDate: legacy.lastUsedDate || null,
        explanationsUsed: 0,
        freeExplanationsUsed: 0,
        insightsGeneratedDate: null
      };
      _cacheUsage(uid, migrated);
      db.collection('users').doc(uid).collection('usage').doc('ai').set(migrated, { merge: true }).catch(function (e) { console.warn('Legacy migration write failed:', e.message); });
      return migrated;
    }
  } catch (legacyErr) {
    console.warn('Legacy usage read failed:', legacyErr.message);
  }
  var fresh = {
    wordProblemsUsedLifetime: 0,
    wordProblemsUsedToday: 0,
    wordProblemsLastDate: null,
    lastUsageDate: null,
    explanationsUsed: 0,
    freeExplanationsUsed: 0,
    insightsGeneratedDate: null
  };
  return _cacheUsage(uid, fresh);
}

function _normalizeUsageDoc(data) {
  if (data.lastUsedDate && !data.lastUsageDate) {
    data.lastUsageDate = data.lastUsedDate;
  }
  if (data.lastUsedDate && !data.wordProblemsLastDate) {
    data.wordProblemsLastDate = data.lastUsedDate;
  }
  delete data.lastUsedDate;
  if (data.wordProblemsUsedLifetime === undefined) data.wordProblemsUsedLifetime = 0;
  if (data.wordProblemsUsedToday === undefined) data.wordProblemsUsedToday = 0;
  if (data.explanationsUsed === undefined) data.explanationsUsed = 0;
  if (data.freeExplanationsUsed === undefined) data.freeExplanationsUsed = 0;
  return data;
}

async function _saveUsage(uid) {
  var entry = usageCache[uid];
  if (!entry) return;
  try {
    await db.collection('users').doc(uid).collection('usage').doc('ai').set(entry, { merge: true });
  } catch (err) {
    console.error('[aiService:_saveUsage] write failed (uid: ' + uid + '):', err.message);
    throw err;
  }
}

async function trackGlobalAIUsage(metricName, count) {
  try {
    var today = new Date().toISOString().split('T')[0];
    var metricRef = db.collection('systemMetrics').doc('ai_daily_' + today);
    var updates = {};
    updates[metricName] = admin.firestore.FieldValue.increment(count || 1);
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await metricRef.set(updates, { merge: true });
  } catch (err) {
    console.warn('[aiService:trackGlobalAIUsage] write failed:', err.message);
  }
}

/* AI telemetry (Command Center, Phase 1) — config/aiTelemetry.logRequests gates the per-request log; 60s cache. */
var _telemetryFlag = { exp: 0, logRequests: true };
async function _shouldLogRequests() {
  var now = Date.now();
  if (_telemetryFlag.exp > now) return _telemetryFlag.logRequests;
  var on = true;
  try { var c = await db.collection('config').doc('aiTelemetry').get(); if (c.exists && c.data().logRequests === false) on = false; }
  catch (_) { on = true; }
  _telemetryFlag = { exp: now + 60000, logRequests: on };
  return on;
}

/**
 * Record ONE AI request to the unified telemetry (AI Command Center). The single sink for cost/token/latency/cache/
 * error accounting — every LLM call (and every cache hit) flows through here. Never throws; telemetry must never
 * break generation. Cost is derived from aiPricing (the one pricing source).
 *
 * @param {string|null} uid
 * @param {{feature, promptId?, version?, model?, usage?:{prompt_tokens,completion_tokens}, latencyMs?, attempts?,
 *          status?:'ok'|'error'|'cache_hit', cacheHit?:boolean, errorCode?}} opts
 *
 * Writes: (a) global `systemMetrics/ai_daily_{date}` — legacy top-level totals (back-compat) PLUS nested
 * byFeature/byModel + latency/error/cache counters (all via FieldValue.increment, deep-merged, no scans);
 * (b) per-user `users/{uid}/usage/ai` (only on real billable token usage); (c) one bounded `aiRequests` doc.
 */
async function recordAiRequest(uid, opts) {
  try {
    opts = opts || {};
    var feature = String(opts.feature || 'unknown').slice(0, 24);
    var model = opts.model || pricing.DEFAULT_MODEL;
    var usage = opts.usage || {};
    var inT = usage.prompt_tokens || 0;
    var outT = usage.completion_tokens || 0;
    var cachedT = usage.cached_tokens || 0;           // OpenAI prompt-cache hit portion (billed at half)
    var cost = pricing.costOf(model, inT, outT, cachedT);
    var status = opts.status || 'ok';
    var cacheHit = !!opts.cacheHit;
    var isError = status === 'error';
    var lat = Number(opts.latencyMs) || 0;
    var inc = admin.firestore.FieldValue.increment;
    var today = new Date().toISOString().split('T')[0];

    // (a) GLOBAL daily rollup. gptCalls = billable LLM attempts (ok+error, NOT cache) — preserves legacy meaning;
    //     requests = ALL telemetry events; nested byFeature/byModel use deep-merged nested increments.
    var byFeature = {}; byFeature[feature] = {
      requests: inc(1), inTok: inc(inT), outTok: inc(outT), costUSD: inc(cost),
      errors: inc(isError ? 1 : 0), cacheHits: inc(cacheHit ? 1 : 0), latSumMs: inc(lat), latCount: inc(lat > 0 ? 1 : 0)
    };
    var byModel = {}; byModel[model] = { requests: inc(1), inTok: inc(inT), outTok: inc(outT), costUSD: inc(cost) };
    await db.collection('systemMetrics').doc('ai_daily_' + today).set({
      totalTokensInput: inc(inT), totalTokensOutput: inc(outT), estimatedCostUSD: inc(cost),
      gptCalls: inc(cacheHit ? 0 : 1), requests: inc(1), errors: inc(isError ? 1 : 0), cacheHits: inc(cacheHit ? 1 : 0),
      latSumMs: inc(lat), latCount: inc(lat > 0 ? 1 : 0),
      byFeature: byFeature, byModel: byModel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // (b) PER-USER counters — only on real billable token usage (cache hits carry 0 tokens → skip).
    if (uid && (inT > 0 || outT > 0)) {
      await db.collection('users').doc(uid).collection('usage').doc('ai').set({
        gptTokensInput: inc(inT), gptTokensOutput: inc(outT), gptCostUSD: inc(cost), gptCalls: inc(1)
      }, { merge: true });
    }

    // (c) PER-REQUEST log (Phase-3 Explorer data, captured now) — bounded; the daily cron prunes >30d via expiresAt.
    if (await _shouldLogRequests()) {
      await db.collection('aiRequests').add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        uid: uid || null, feature: feature, model: model,
        promptId: opts.promptId || null, version: (opts.version != null ? opts.version : null),
        inTokens: inT, outTokens: outT, cachedTokens: cachedT, costUSD: cost, latencyMs: lat,
        status: status, cacheHit: cacheHit, retries: Math.max(0, (Number(opts.attempts) || 1) - 1),
        errorCode: opts.errorCode || null,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      });
    }
  } catch (err) {
    console.warn('[aiService:recordAiRequest] telemetry write failed:', err.message);
  }
}

/**
 * Back-compat shim — prefer recordAiRequest(). Kept so any straggler caller keeps accounting correctly.
 * `rates` is ignored: pricing is centralized in aiPricing. Records as feature 'unknown', default model.
 */
async function trackGptCost(uid, usage, opts) {
  if (!usage) return;
  var o = (opts && typeof opts === 'object' && (opts.feature || opts.model)) ? opts : {};
  return recordAiRequest(uid, {
    feature: o.feature || 'unknown', model: o.model || pricing.DEFAULT_MODEL, usage: usage,
    latencyMs: o.latencyMs, attempts: o.attempts, status: o.status || 'ok',
    cacheHit: o.cacheHit, promptId: o.promptId, version: o.version, errorCode: o.errorCode
  });
}

/**
 * Atomically consume word-problem quota (audit H2).
 *
 * Previously this did a non-transactional read-modify-write against an
 * in-memory cache, so N concurrent requests on one warm serverless instance
 * could all pass the quota gate before any write landed. This now performs
 * the limit check AND the increment inside a single Firestore transaction,
 * so the cap (WP_FREE_LIMIT lifetime / WP_PREMIUM_DAILY per day) holds under
 * concurrency. Returns the number actually granted (0 if the cap is hit).
 *
 * @returns {number} count actually consumed
 */
async function consumeWordProblemQuota(uid, isPremium, count) {
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  var now = new Date();
  var today = now.toDateString();

  var granted = await db.runTransaction(async function (tx) {
    var doc = await tx.get(usageRef);
    var data = doc.exists ? _normalizeUsageDoc(doc.data()) : {
      wordProblemsUsedLifetime: 0, wordProblemsUsedToday: 0,
      wordProblemsLastDate: null, lastUsageDate: null, explanationsUsed: 0
    };

    var allow;
    if (isPremium) {
      var lastDate = data.wordProblemsLastDate ? new Date(data.wordProblemsLastDate).toDateString() : null;
      if (lastDate !== today) data.wordProblemsUsedToday = 0;
      allow = Math.max(0, Math.min(count, WP_PREMIUM_DAILY - (data.wordProblemsUsedToday || 0)));
      data.wordProblemsUsedToday = (data.wordProblemsUsedToday || 0) + allow;
    } else {
      allow = Math.max(0, Math.min(count, WP_FREE_LIMIT - (data.wordProblemsUsedLifetime || 0)));
      data.wordProblemsUsedLifetime = (data.wordProblemsUsedLifetime || 0) + allow;
    }

    if (allow <= 0) return 0;

    data.wordProblemsLastDate = now.toISOString();
    data.lastUsageDate = now.toISOString();
    tx.set(usageRef, data, { merge: true });
    return allow;
  });

  /* Keep the in-memory cache coherent with the authoritative write */
  if (usageCache[uid]) {
    if (isPremium) usageCache[uid].wordProblemsUsedToday = (usageCache[uid].wordProblemsUsedToday || 0) + granted;
    else usageCache[uid].wordProblemsUsedLifetime = (usageCache[uid].wordProblemsUsedLifetime || 0) + granted;
    usageCache[uid].wordProblemsLastDate = now.toISOString();
    usageCache[uid].lastUsageDate = now.toISOString();
  }

  if (granted > 0) await trackGlobalAIUsage('wordProblems', granted);
  return granted;
}

/* ADR-062: refund a previously-consumed word-problem unit when generation FAILS, so a failed call never burns
   the student's quota. Transactional; clamps at 0; best-effort (never throws into the caller). */
async function refundWordProblemQuota(uid, isPremium, count) {
  count = count || 1;
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  try {
    await db.runTransaction(async function (tx) {
      var doc = await tx.get(usageRef);
      if (!doc.exists) return;
      var data = _normalizeUsageDoc(doc.data());
      if (isPremium) data.wordProblemsUsedToday = Math.max(0, (data.wordProblemsUsedToday || 0) - count);
      else data.wordProblemsUsedLifetime = Math.max(0, (data.wordProblemsUsedLifetime || 0) - count);
      tx.set(usageRef, data, { merge: true });
    });
    if (usageCache[uid]) {
      if (isPremium) usageCache[uid].wordProblemsUsedToday = Math.max(0, (usageCache[uid].wordProblemsUsedToday || 0) - count);
      else usageCache[uid].wordProblemsUsedLifetime = Math.max(0, (usageCache[uid].wordProblemsUsedLifetime || 0) - count);
    }
    await trackGlobalAIUsage('wordProblems', -count);
  } catch (e) { console.warn('[aiService] wordProblem refund failed:', e.message); }
}

/**
 * ADR-103 (field corrected ADR-106): atomically consume one free-tier AI-explanation credit.
 *
 * Free accounts get FREE_EXPLAIN_LIMIT (5) real QuanAI explanations, lifetime, counted on a DEDICATED field —
 * users/{uid}/usage/ai.freeExplanationsUsed. This is deliberately SEPARATE from `explanationsUsed` (which premium
 * users increment as unbounded telemetry via trackExplanationUsage): sharing one field meant an expired-premium user
 * who had generated >5 explanations lapsed to free and was instantly denied all 5 (ADR-106 fix). Mirrors the proven
 * consumeWordProblemQuota transaction: read + limit-check + increment in ONE Firestore transaction, so concurrent
 * taps can never over-grant past the cap. Premium users are metered elsewhere and must NEVER reach this path.
 *
 * @returns {Promise<{ ok:boolean, remaining:number }>}
 */
async function consumeFreeExplain(uid) {
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  var now = new Date();

  var result = await db.runTransaction(async function (tx) {
    var doc = await tx.get(usageRef);
    var data = doc.exists ? _normalizeUsageDoc(doc.data()) : { freeExplanationsUsed: 0 };
    var decision = freeExplainPolicy.freeExplainDecision(data.freeExplanationsUsed || 0, FREE_EXPLAIN_LIMIT);
    if (!decision.ok) return decision;
    data.freeExplanationsUsed = (data.freeExplanationsUsed || 0) + 1;
    data.lastUsageDate = now.toISOString();
    tx.set(usageRef, data, { merge: true });
    return decision;
  });

  /* Keep the in-memory cache coherent with the authoritative write. */
  if (result.ok && usageCache[uid]) {
    usageCache[uid].freeExplanationsUsed = (usageCache[uid].freeExplanationsUsed || 0) + 1;
    usageCache[uid].lastUsageDate = now.toISOString();
  }
  if (result.ok) await trackGlobalAIUsage('explanations', 1);
  return result;
}

/* ADR-103 (verification-pass follow-up): refund one free-explain credit when a consumed request ultimately delivered
   NO content — e.g. a throw before/around generation (ctxEngine.build, an unexpected exception) that surfaces as a
   500. explainBase's own generation catch returns a usable fallback envelope (content), so that path keeps the credit
   and never triggers a refund. Transactional decrement, clamps at 0, best-effort (never throws into the caller),
   cache-coherent — mirrors refundWordProblemQuota. */
async function refundFreeExplain(uid) {
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  try {
    await db.runTransaction(async function (tx) {
      var doc = await tx.get(usageRef);
      if (!doc.exists) return;
      var data = _normalizeUsageDoc(doc.data());
      data.freeExplanationsUsed = freeExplainPolicy.freeExplainRefund(data.freeExplanationsUsed || 0);
      tx.set(usageRef, data, { merge: true });
    });
    if (usageCache[uid]) usageCache[uid].freeExplanationsUsed = freeExplainPolicy.freeExplainRefund(usageCache[uid].freeExplanationsUsed || 0);
    await trackGlobalAIUsage('explanations', -1);
  } catch (e) { console.warn('[aiService] freeExplain refund failed:', e.message); }
}

/**
 * Enforce a per-user daily AI-request cap set by a super-admin (ADR-022).
 *
 * Reads `users/{uid}.aiThrottle.cap` (set via the AI Cost Center / User-360 throttle control).
 * If a positive cap is present, atomically checks+increments a daily counter on the usage doc
 * (`gptThrottleDate` / `gptThrottleCount`, reset each UTC day) and throws AI_THROTTLED once the
 * cap is reached. No throttle doc → no-op (zero added cost for the overwhelming majority of users).
 * Counts AI requests at the gate (blunt abuse-control instrument by design).
 */
async function enforceAiThrottle(uid) {
  if (!uid) return;
  var userDoc;
  try {
    userDoc = await db.collection('users').doc(uid).get();
  } catch (err) {
    console.warn('[aiService:enforceAiThrottle] user read failed (uid: ' + uid + '):', err.message);
    return; /* fail open — a glitch must not block a non-throttled user */
  }
  var thr = userDoc.exists ? userDoc.data().aiThrottle : null;
  var cap = thr && typeof thr.cap === 'number' ? thr.cap : 0;
  if (!cap || cap <= 0) return; /* not throttled */

  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  var today = new Date().toISOString().split('T')[0];
  await db.runTransaction(async function (tx) {
    var doc = await tx.get(usageRef);
    var data = doc.exists ? doc.data() : {};
    var count = (data.gptThrottleDate === today) ? (data.gptThrottleCount || 0) : 0;
    if (count >= cap) {
      throw new AIServiceError('AI_THROTTLED', 'Your AI usage has been rate-limited by an administrator (' + cap + '/day). Please try again tomorrow.', false);
    }
    tx.set(usageRef, { gptThrottleDate: today, gptThrottleCount: count + 1 }, { merge: true });
  });
}

async function trackExplanationUsage(uid) {
  var entry = await _loadUsage(uid);
  entry.explanationsUsed = (entry.explanationsUsed || 0) + 1;
  entry.lastUsageDate = new Date().toISOString();
  _cacheUsage(uid, entry);
  await _saveUsage(uid);
  await trackGlobalAIUsage('explanations', 1);
}

async function trackInsightsUsage(uid) {
  var entry = await _loadUsage(uid);
  var today = new Date();
  var dateKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  entry.insightsGeneratedDate = dateKey;
  entry.lastUsageDate = today.toISOString();
  _cacheUsage(uid, entry);
  await _saveUsage(uid);
  await trackGlobalAIUsage('insights', 1);
}

/* ════════════════════════════════════════════════════════════════════════════════════════
   AI BRAIN INFRA (ADR-039) — durable per-student memory + enforced cost breaker.
   Memory is the cross-feature shared brain (AI_INTERACTION_SYSTEM §4); server-authoritative,
   field-capped, client writes denied by rules. The budget breaker makes the existing cost
   telemetry load-bearing (mirrors config-flags.js: 30s-TTL, fail-open on read error).
   ════════════════════════════════════════════════════════════════════════════════════════ */

function _capStr(s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; }

/** Read the durable AI memory map for a user (or null). */
async function getMemory(uid) {
  try {
    var d = await db.collection('users').doc(uid).select('aiMemory').get();
    return (d.exists && d.data().aiMemory) || null;
  } catch (e) { console.warn('[aiService:getMemory] failed (uid ' + uid + '):', e.message); return null; }
}

/**
 * Merge-patch the AI memory (server-authoritative). Accepts targeted ops so callers never overwrite
 * the whole object. All strings/arrays are capped server-side so memory can never bloat prompt cost.
 * Never throws (memory updates are best-effort, like trackGptCost).
 */
async function updateMemory(uid, patch, source) {
  if (!uid || !patch) return;
  try {
    var ref = db.collection('users').doc(uid);
    await db.runTransaction(async function (tx) {
      var doc = await tx.get(ref);
      var mem = (doc.exists && doc.data().aiMemory) || { v: 1 };
      if (patch.goal != null) mem.goal = _capStr(patch.goal, 120);
      if (patch.examName != null) mem.examName = _capStr(patch.examName, 80);
      if (patch.examDate != null) mem.examDate = _capStr(patch.examDate, 10);
      if (patch.confidence != null) mem.confidence = _capStr(patch.confidence, 12);
      if (patch.preferredDepth != null) mem.preferredDepth = _capStr(patch.preferredDepth, 12);
      if (patch.preferredStyle != null) mem.preferredStyle = _capStr(patch.preferredStyle, 12);
      if (patch.dailyMinutes != null) mem.dailyMinutes = Math.max(0, Math.min(600, parseInt(patch.dailyMinutes) || 0));
      if (patch.addWeakConcepts) {
        var set = {}; (mem.knownWeakConcepts || []).concat(patch.addWeakConcepts).forEach(function (c) { if (c) set[String(c).slice(0, 40)] = true; });
        mem.knownWeakConcepts = Object.keys(set).slice(0, 8);
      }
      if (patch.addWin) { mem.wins = (mem.wins || []); mem.wins.push(_capStr(patch.addWin, 100)); mem.wins = mem.wins.slice(-5); }
      if (patch.addExplainedTopic) {
        var s2 = {}; (mem.recentTopicsExplained || []).concat([patch.addExplainedTopic]).forEach(function (c) { if (c) s2[String(c).slice(0, 40)] = true; });
        mem.recentTopicsExplained = Object.keys(s2).slice(-8);
      }
      if (patch.timelineEntry) {
        mem.timeline = (mem.timeline || []);
        mem.timeline.push({ at: new Date().toISOString(), feature: _capStr(patch.timelineEntry.feature, 16), summary: _capStr(patch.timelineEntry.summary, 120) });
        mem.timeline = mem.timeline.slice(-12);
      }
      mem.v = 1; mem.updatedBy = source || 'system'; mem.updatedAt = new Date().toISOString();
      tx.set(ref, { aiMemory: mem }, { merge: true });
    });
  } catch (e) { console.warn('[aiService:updateMemory] failed (uid ' + uid + '):', e.message); }
}

var _budgetCache = { exp: 0, blocked: false };

/**
 * Enforced daily AI-cost breaker. config/aiBudget.monthlyBudgetUSD → a daily cap (monthly/30); compared to
 * today's systemMetrics/ai_daily_{date}.estimatedCostUSD. Over cap → throws AI_BUDGET_EXCEEDED (retryable).
 * 30s-TTL cache (≈0 cost). Fails OPEN on read error. No budget set → never blocks.
 */
async function enforceAiBudget() {
  var now = Date.now();
  if (_budgetCache.exp > now) {
    if (_budgetCache.blocked) throw new AIServiceError('AI_BUDGET_EXCEEDED', 'AI is resting for today — please try again later.', true);
    return;
  }
  var blocked = false;
  try {
    var cfg = await db.collection('config').doc('aiBudget').get();
    var monthly = cfg.exists ? (Number(cfg.data().monthlyBudgetUSD) || 0) : 0;
    if (monthly > 0) {
      var dailyCap = monthly / 30;
      var today = new Date().toISOString().split('T')[0];
      var m = await db.collection('systemMetrics').doc('ai_daily_' + today).get();
      var spent = m.exists ? (Number(m.data().estimatedCostUSD) || 0) : 0;
      if (spent >= dailyCap) blocked = true;
    }
  } catch (e) {
    _budgetCache = { exp: now + 30000, blocked: false }; /* fail open */
    return;
  }
  _budgetCache = { exp: now + 30000, blocked: blocked };
  if (blocked) throw new AIServiceError('AI_BUDGET_EXCEEDED', 'AI is resting for today — please try again later.', true);
}

module.exports = { verifyIdToken, resolvePlan, resolveUserAuth, isUserPremium, claimSession, activatePremium, consumeWordProblemQuota, refundWordProblemQuota, consumeFreeExplain, refundFreeExplain, FREE_EXPLAIN_LIMIT, enforceAiThrottle, trackExplanationUsage, trackInsightsUsage, trackGptCost, recordAiRequest, trackGlobalAIUsage, getMemory, updateMemory, enforceAiBudget, safeUserUpdate, AIServiceError };
