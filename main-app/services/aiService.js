const OpenAI = require('openai');
const admin = require('firebase-admin');
const pricing = require('./aiPricing');   // SINGLE source of truth for model pricing + cost math

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
    var decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Resolve a user's entitlement (v2). The ONLY entitlement check.
 *
 *   premium ⟺ plan === 'premium' && (planExpiry == null || planExpiry > now)
 *
 * Self-heals: an expired premium/trial is written back to 'free' on read,
 * so dashboards and gates stay consistent even if the sweep function lags.
 *
 * @returns {'free'|'premium'}
 */
async function resolvePlan(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return 'free';
    var data = doc.data();
    if (data.plan !== 'premium') return 'free';
    var expiryMs = _toExpiryMillis(data.planExpiry);
    if (expiryMs > 0 && expiryMs < Date.now()) {
      try {
        await safeUserUpdate(uid, {
          plan: 'free', planType: null, planExpiry: null, planSource: null,
          isTrial: false, trialEnd: null, planUpdatedAt: new Date().toISOString()
        }, 'resolvePlan:expiry');
        // ADR-066: notify the user their Premium expired — through the ONE pipeline (Inbox + best-effort push).
        // Fires exactly once, on the premium→free transition. Fire-and-forget so it never delays the entitlement check.
        try {
          require('./notificationService').notify(db, admin.messaging(), {
            recipients: { uids: [uid] },
            notification: { title: 'Your Premium has expired', body: 'Renew to keep your AI Coach, Planner, Insights and Math Duels.', type: 'premium', category: 'billing', deepLink: '#settings' },
            logSegment: 'billing'
          }).catch(function () {});
        } catch (_) {}
      } catch (expiryErr) {
        console.error('[aiService:resolvePlan] expiry self-heal failed (uid: ' + uid + '):', expiryErr.message);
      }
      return 'free';
    }
    return 'premium';
  } catch (err) {
    console.error('[aiService:resolvePlan] lookup failed (uid: ' + uid + '):', err.message);
    throw new AIServiceError('ENTITLEMENT_ERROR', 'Unable to verify access status. Please try again.', true);
  }
}

async function isUserPremium(uid) {
  return (await resolvePlan(uid)) === 'premium';
}

function _toExpiryMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch (_) { return 0; }
  }
  if (typeof value.toDate === 'function') {
    try { return value.toDate().getTime(); } catch (_) { return 0; }
  }
  if (typeof value === 'string') {
    var parsed = Date.parse(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

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
var PREMIUM_PRICE_PAISE = { premium_6m: 34900, premium_12m: 59900 }; /* canonical plan→price (paise) — revenue accounting */

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
    var paymentDoc = await tx.get(paymentRef);
    if (paymentDoc.exists) {
      var existing = paymentDoc.data();
      if (existing.uid !== uid) {
        console.error('[aiService:activatePremium] PAYMENT_REPLAY detected (uid: ' + uid + ', paymentId: ' + paymentId + ', existingUid: ' + existing.uid + ')');
        throw new AIServiceError('PAYMENT_REPLAY', 'Payment already used by another account.', false);
      }
      /* Same-uid replay (verify + webhook both fire) — re-apply safely */
      finalExpiry = existing.expiry || expiry;
      tx.set(userRef, {
        plan: 'premium',
        planType: existing.plan || planType,
        planExpiry: finalExpiry,
        planSource: 'purchase',
        isTrial: false,
        trialEnd: null,
        lastPaymentId: String(paymentId),
        planUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return;
    }
    var paymentDoc2 = { uid: uid, plan: planType, amount: (PREMIUM_PRICE_PAISE[planType] || 0), status: 'paid', expiry: expiry, claimedAt: new Date().toISOString() };
    if (orderId) paymentDoc2.orderId = String(orderId);
    tx.create(paymentRef, paymentDoc2);
    tx.set(userRef, {
      plan: 'premium',
      planType: planType,
      planExpiry: expiry,
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
var MAX_QUESTION_LENGTH = 300;
var usageCache = {};

async function _loadUsage(uid) {
  if (usageCache[uid]) return usageCache[uid];
  try {
    var doc = await db.collection('users').doc(uid).collection('usage').doc('ai').get();
    if (doc.exists) {
      usageCache[uid] = _normalizeUsageDoc(doc.data());
      return usageCache[uid];
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
        insightsGeneratedDate: null
      };
      usageCache[uid] = migrated;
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
    insightsGeneratedDate: null
  };
  usageCache[uid] = fresh;
  return fresh;
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
  usageCache[uid] = entry;
  await _saveUsage(uid);
  await trackGlobalAIUsage('explanations', 1);
}

async function trackInsightsUsage(uid) {
  var entry = await _loadUsage(uid);
  var today = new Date();
  var dateKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  entry.insightsGeneratedDate = dateKey;
  entry.lastUsageDate = today.toISOString();
  usageCache[uid] = entry;
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

module.exports = { verifyIdToken, resolvePlan, isUserPremium, activatePremium, consumeWordProblemQuota, refundWordProblemQuota, enforceAiThrottle, trackExplanationUsage, trackInsightsUsage, trackGptCost, recordAiRequest, trackGlobalAIUsage, getMemory, updateMemory, enforceAiBudget, safeUserUpdate, AIServiceError };
