const OpenAI = require('openai');
const admin = require('firebase-admin');

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

const CATEGORY_LABELS = {
  squares: 'Squares & Square Roots',
  cubes: 'Cubes & Cube Roots',
  area: 'Area Calculations',
  volume: 'Volume Calculations',
  percentages: 'Percentages',
  multiplication: 'Multiplication & Division',
  fractions: 'Fractions',
  averages: 'Averages',
  ratios: 'Ratios & Proportions',
  'profit-loss': 'Profit & Loss',
  'time-speed-distance': 'Time, Speed & Distance',
  'time-and-work': 'Time & Work'
};

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
    var paymentDoc2 = { uid: uid, plan: planType, expiry: expiry, claimedAt: new Date().toISOString() };
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

async function checkWordProblemQuota(uid, isPremium) {
  var entry = await _loadUsage(uid);
  var today = new Date().toDateString();
  if (isPremium) {
    var lastDate = entry.wordProblemsLastDate ? new Date(entry.wordProblemsLastDate).toDateString() : null;
    if (lastDate !== today) { entry.wordProblemsUsedToday = 0; }
    return Math.max(0, WP_PREMIUM_DAILY - entry.wordProblemsUsedToday);
  }
  return Math.max(0, WP_FREE_LIMIT - entry.wordProblemsUsedLifetime);
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

/**
 * DEPRECATED: No longer calls OpenAI for runtime generation.
 * Now reads from the centralized `questions` Firestore collection
 * (pre-generated, curated, and approved via the Super Admin pipeline).
 *
 * Includes intelligent difficulty fallback when insufficient questions
 * exist at the requested difficulty level.
 */
async function generateWordProblems(category, difficulty, count) {
  var questionsRef = db.collection('questions');

  /* Map of difficulty → fallback difficulties to try */
  var FALLBACK_MAP = {
    easy:   ['medium'],
    medium: ['easy', 'hard'],
    hard:   ['medium']
  };

  /**
   * Query questions for a specific difficulty.
   * Returns an array of normalized question objects.
   */
  async function _fetchForDifficulty(diff, limit) {
    var query = questionsRef
      .where('approved', '==', true)
      .where('status', '==', 'active')
      .where('type', '==', 'word_problem')
      .where('topic', '==', category)
      .where('difficulty', '==', diff)
      .limit(limit * 3);

    var snapshot = await query.get();
    var results = [];
    snapshot.forEach(function (doc) {
      var d = doc.data();
      if (!d || typeof d.question !== 'string' || !d.question.trim()) return;
      var answer = (typeof d.answer === 'number') ? d.answer : parseFloat(d.answer);
      if (isNaN(answer)) return;

      results.push({
        question: d.question.trim(),
        answer: answer,
        steps: (typeof d.steps === 'string' && d.steps.trim()) ? d.steps.trim()
             : (typeof d.explanation === 'string' && d.explanation.trim()) ? d.explanation.trim()
             : '',
        category: d.topic || category
      });
    });
    return results;
  }

  /* Primary fetch at requested difficulty */
  var pool = await _fetchForDifficulty(difficulty, count);

  /* Intelligent fallback if insufficient questions */
  if (pool.length < count) {
    var fallbacks = FALLBACK_MAP[difficulty] || [];
    for (var i = 0; i < fallbacks.length && pool.length < count; i++) {
      var fbResults = await _fetchForDifficulty(fallbacks[i], count - pool.length);
      /* De-duplicate by question prefix */
      var existingPrefixes = {};
      pool.forEach(function (q) { existingPrefixes[q.question.substring(0, 60).toLowerCase()] = true; });
      for (var j = 0; j < fbResults.length && pool.length < count; j++) {
        var prefix = fbResults[j].question.substring(0, 60).toLowerCase();
        if (!existingPrefixes[prefix]) {
          pool.push(fbResults[j]);
          existingPrefixes[prefix] = true;
        }
      }
    }
  }

  if (pool.length === 0) {
    throw new AIServiceError('NO_QUESTIONS', 'No questions available for this category and difficulty', false);
  }

  /* Shuffle for variety */
  _shuffleInPlace(pool);

  return pool.slice(0, count);
}

async function generateExplanation(question, answer, category) {
  var questionHash = _hashString(question + ':' + answer);
  var cacheRef = db.collection('explanations');

  try {
    var cached = await cacheRef.doc(questionHash).get();
    if (cached.exists) {
      var data = cached.data();
      cacheRef.doc(questionHash).update({ usageCount: (data.usageCount || 0) + 1 }).catch(function (e) { console.warn('[aiService:generateExplanation] usageCount update failed:', e.message); });
      return { concept: data.concept, steps: data.steps, mistake: data.mistake, tip: data.tip };
    }
  } catch (cacheErr) {
    console.warn('Firestore explain cache read failed:', cacheErr.message);
  }

  var client = getClient();
  if (!client) throw new AIServiceError('SERVICE_UNAVAILABLE', 'AI service unavailable', true);

  var catLabel = CATEGORY_LABELS[category] || category || 'General Math';

  var prompt = 'A student got this math question wrong. Explain the solution clearly and concisely.\n\nQuestion: ' + question + '\nCorrect Answer: ' + answer + '\nCategory: ' + catLabel + '\n\nReturn ONLY a valid JSON object with these fields:\n- "concept": A one-line description of the math concept being tested (string)\n- "steps": An array of step-by-step solution strings, each step being 1-2 sentences (array of strings). The final step MUST state the final answer as ' + answer + '.\n- "mistake": The most common mistake students make on this type of problem (string)\n- "tip": A quick mental math tip or shortcut for similar problems (string)\n- "computedAnswer": The numeric answer your steps arrive at (number)\n\nIMPORTANT: Your solution steps must arrive at exactly ' + answer + ' as the final answer. Include the computed answer in the computedAnswer field for verification.\n\nReturn ONLY the JSON object, no markdown, no explanation, no code fences.';

  var result = await _callAndParse(client, prompt, function (parsed) {
    if (!parsed || typeof parsed.concept !== 'string' || !Array.isArray(parsed.steps)) return null;

    var expected = parseFloat(answer);
    var computed = parseFloat(parsed.computedAnswer);
    if (isNaN(computed) || (!isNaN(expected) && Math.abs(expected - computed) > 0.01)) {
      return null;
    }

    return {
      concept: parsed.concept,
      steps: parsed.steps.filter(function (s) { return typeof s === 'string'; }),
      mistake: parsed.mistake || '',
      tip: parsed.tip || ''
    };
  });

  if (!result) throw new AIServiceError('INVALID_RESPONSE', 'Invalid explanation format after retries', true);

  try {
    await cacheRef.doc(questionHash).set({
      questionId: questionHash,
      question: question,
      answer: answer,
      category: category || '',
      concept: result.concept,
      steps: result.steps,
      mistake: result.mistake,
      tip: result.tip,
      usageCount: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (writeErr) {
    console.warn('Firestore explain cache write failed:', writeErr.message);
  }

  return result;
}

async function generateCoachV2(stats, userId) {
  var today = new Date();
  var dateKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  var cacheDocId = userId + '_coach_' + dateKey;
  var cacheRef = db.collection('aiCoachV2');

  try {
    var cached = await cacheRef.doc(cacheDocId).get();
    if (cached.exists) {
      var d = cached.data();
      return {
        today: d.today,
        tomorrow: d.tomorrow,
        thisWeek: d.thisWeek,
        recommendations: d.recommendations
      };
    }
  } catch (cacheErr) {
    console.warn('Firestore coach cache read failed:', cacheErr.message);
  }

  var client = getClient();
  if (!client) throw new AIServiceError('SERVICE_UNAVAILABLE', 'AI service unavailable', true);

  var accuracy = stats.totalAttempted > 0 ? ((stats.totalCorrect / stats.totalAttempted) * 100).toFixed(1) : '0';
  var catStats = stats.categoryStats || {};
  var weakCats = [];
  var strongCats = [];
  for (var cat in catStats) {
    var d = catStats[cat];
    if (d.attempted >= 3) {
      var catAcc = (d.correct / d.attempted) * 100;
      if (catAcc < 60) weakCats.push(cat + ' (' + catAcc.toFixed(0) + '%)');
      else if (catAcc >= 80) strongCats.push(cat + ' (' + catAcc.toFixed(0) + '%)');
    }
  }

  var prompt = 'You are an elite CAT quantitative mentor. Prescribe an exact practice regimen based on the student\'s data.\n\nStats:\n- Accuracy: ' + accuracy + '%\n- Total Attempts: ' + (stats.totalAttempted || 0) + '\n- Daily Streak: ' + (stats.dailyStreak || 0) + '\n- Weak Categories: ' + (weakCats.length > 0 ? weakCats.join(', ') : 'None') + '\n- Strong Categories: ' + (strongCats.length > 0 ? strongCats.join(', ') : 'None') + '\n\nProvide actionable, data-backed advice with specific tasks for Today, Tomorrow, This Week, and general Recommendations.';

  var completion = await client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You are an elite CAT quantitative mentor. Never repeat raw statistics. Focus on prescriptive coaching actions.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 1024,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "coach_report",
        strict: true,
        schema: {
          type: "object",
          properties: {
            today: { type: "string" },
            tomorrow: { type: "string" },
            thisWeek: { type: "string" },
            recommendations: { type: "string" }
          },
          required: ["today", "tomorrow", "thisWeek", "recommendations"],
          additionalProperties: false
        }
      }
    }
  });

  var result = JSON.parse(completion.choices[0].message.content);

  try {
    var toSave = Object.assign({ userId: userId, date: dateKey, createdAt: admin.firestore.FieldValue.serverTimestamp() }, result);
    await cacheRef.doc(cacheDocId).set(toSave);
  } catch (writeErr) {
    console.warn('Firestore coach cache write failed:', writeErr.message);
  }

  return result;
}

async function generateInsightsV2(stats, userId) {
  var today = new Date();
  var dateKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  var cacheDocId = userId + '_insights_' + dateKey;
  var cacheRef = db.collection('aiInsightsV2');

  try {
    var cached = await cacheRef.doc(cacheDocId).get();
    if (cached.exists) {
      var d = cached.data();
      return {
        learningPattern: d.learningPattern,
        accuracyTrend: d.accuracyTrend,
        speedTrend: d.speedTrend,
        consistencyScore: d.consistencyScore,
        strongestCategory: d.strongestCategory,
        weakestCategory: d.weakestCategory,
        improvementPotential: d.improvementPotential,
        aiSummary: d.aiSummary
      };
    }
  } catch (cacheErr) {
    console.warn('Firestore insights cache read failed:', cacheErr.message);
  }

  var client = getClient();
  if (!client) throw new AIServiceError('SERVICE_UNAVAILABLE', 'AI service unavailable', true);

  var accuracy = stats.totalAttempted > 0 ? ((stats.totalCorrect / stats.totalAttempted) * 100).toFixed(1) : '0';
  var catStats = stats.categoryStats || {};
  var weakCats = [];
  var strongCats = [];
  for (var cat in catStats) {
    var d = catStats[cat];
    if (d.attempted >= 3) {
      var catAcc = (d.correct / d.attempted) * 100;
      if (catAcc < 60) weakCats.push(cat + ' (' + catAcc.toFixed(0) + '%)');
      else if (catAcc >= 80) strongCats.push(cat + ' (' + catAcc.toFixed(0) + '%)');
    }
  }

  var prompt = 'You are an elite data analyst for a CAT/GMAT student.\n\nStats:\n- Accuracy: ' + accuracy + '%\n- Total Attempts: ' + (stats.totalAttempted || 0) + '\n- Daily Streak: ' + (stats.dailyStreak || 0) + '\n- Weak Categories: ' + (weakCats.length > 0 ? weakCats.join(', ') : 'None') + '\n- Strong Categories: ' + (strongCats.length > 0 ? strongCats.join(', ') : 'None') + '\n\nAnalyze the data and provide deep insights on: learningPattern, accuracyTrend, speedTrend, consistencyScore (e.g. "8.5/10"), strongestCategory, weakestCategory, improvementPotential, and an overall aiSummary. DO NOT repeat raw statistics, provide deep and unique qualitative insights.';

  var completion = await client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You are an elite data analyst. Find hidden patterns that are not visible from raw statistics. Never repeat dashboard data.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 1024,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "insights_report",
        strict: true,
        schema: {
          type: "object",
          properties: {
            learningPattern: { type: "string" },
            accuracyTrend: { type: "string" },
            speedTrend: { type: "string" },
            consistencyScore: { type: "string" },
            strongestCategory: { type: "string" },
            weakestCategory: { type: "string" },
            improvementPotential: { type: "string" },
            aiSummary: { type: "string" }
          },
          required: ["learningPattern", "accuracyTrend", "speedTrend", "consistencyScore", "strongestCategory", "weakestCategory", "improvementPotential", "aiSummary"],
          additionalProperties: false
        }
      }
    }
  });

  var result = JSON.parse(completion.choices[0].message.content);

  try {
    var toSave = Object.assign({ userId: userId, date: dateKey, createdAt: admin.firestore.FieldValue.serverTimestamp() }, result);
    await cacheRef.doc(cacheDocId).set(toSave);
  } catch (writeErr) {
    console.warn('Firestore insights cache write failed:', writeErr.message);
  }

  return result;
}

async function _callAndParse(client, prompt, validator) {
  var lastErr = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var completion = await client.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: 'You are a math education AI assistant. Always respond with valid JSON only, no markdown, no explanation.' },
          { role: 'user', content: prompt }
        ],
        temperature: attempt === 0 ? 0.7 : 0.3,
        max_tokens: 4096
      });
      /* Cost estimation logging (gpt-4o-mini: $0.15/1M input, $0.60/1M output) */
      var usage = completion.usage;
      if (usage) {
        var inputCost = (usage.prompt_tokens / 1000000) * 0.15;
        var outputCost = (usage.completion_tokens / 1000000) * 0.60;
        var totalCost = inputCost + outputCost;

      }
      var text = completion.choices[0].message.content || '';
      var parsed = _parseJsonResponse(text);
      var validated = validator(parsed);
      if (validated) return validated;
      lastErr = new AIServiceError('PARSE_ERROR', 'Response failed validation on attempt ' + (attempt + 1), true);
    } catch (err) {
      if (err instanceof AIServiceError) {
        lastErr = err;
      } else {
        lastErr = new AIServiceError('API_ERROR', err.message, true);
      }
    }
    if (attempt < 1) await new Promise(function (r) { setTimeout(r, 1500); });
  }
  throw lastErr || new AIServiceError('UNKNOWN', 'Failed after retries', true);
}

function _parseJsonResponse(text) {
  var cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    var arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch (_) {}
    }
    var objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (_) {}
    }
    throw new AIServiceError('PARSE_ERROR', 'Failed to parse AI response as JSON', true);
  }
}

function _hashString(str) {
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(36);
}

function _shuffleInPlace(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

async function getActiveStudyPlan(userId) {
  try {
    var snapshot = await db.collection('aiStudyPlans')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!snapshot.empty) {
      var doc = snapshot.docs[0];
      var data = doc.data();
      data.id = doc.id;
      return data;
    }
  } catch (err) {
    console.warn('getActiveStudyPlan failed:', err.message);
  }
  return null;
}

async function finalizeStudyPlan(userId, planId) {
  try {
    var snapshot = await db.collection('aiStudyPlans')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();
    var batch = db.batch();
    snapshot.forEach(function (doc) {
      if (doc.id !== planId) batch.update(doc.ref, { status: 'archived' });
    });
    batch.update(db.collection('aiStudyPlans').doc(planId), { status: 'active' });
    await batch.commit();
  } catch (err) {
    console.error('finalizeStudyPlan error:', err.message);
    throw new AIServiceError('DB_ERROR', 'Failed to finalize study plan.', true);
  }
}

async function updateStudyPlanProgress(userId, planId, dayIndex, completed) {
  try {
    var ref = db.collection('aiStudyPlans').doc(planId);
    var doc = await ref.get();
    if (doc.exists && doc.data().userId === userId) {
      var progress = doc.data().progress || {};
      progress[dayIndex] = completed === true;
      await ref.update({ progress: progress, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  } catch (err) {
    console.error('updateStudyPlanProgress error:', err.message);
    throw new AIServiceError('DB_ERROR', 'Failed to update progress.', true);
  }
}

async function generateStudyPlan(params) {
  var examName = params.examName;
  var examDate = params.examDate;
  var daysRemaining = params.daysRemaining;
  var dailyTimeMinutes = params.dailyTimeMinutes;
  var targetScore = params.targetScore || '';
  var currentLevel = params.currentLevel || 'Intermediate';
  var weakTopics = params.weakTopics || [];
  var strongTopics = params.strongTopics || [];
  var accuracy = params.accuracy || '0';
  var userId = params.userId;
  var previousPlanId = params.previousPlanId;

  var client = getClient();
  if (!client) throw new AIServiceError('SERVICE_UNAVAILABLE', 'AI service unavailable', true);

  var weakStr = weakTopics.length > 0 ? weakTopics.join(', ') : 'None explicitly identified';
  var strongStr = strongTopics.length > 0 ? strongTopics.join(', ') : 'None explicitly identified';
  
  var prevContext = '';
  var startDay = 1;
  var daysToPlan = Math.min(daysRemaining, 14);

  if (previousPlanId) {
    try {
      var prevDoc = await db.collection('aiStudyPlans').doc(previousPlanId).get();
      if (prevDoc.exists) {
        var prevData = prevDoc.data();
        var prevCompletedDays = Object.keys(prevData.progress || {}).filter(function (k) { return prevData.progress[k]; }).length;
        
        var prevTopics = [];
        if (prevData.timetable && prevData.timetable.length > 0) {
          startDay = prevData.timetable[prevData.timetable.length - 1].day + 1;
          for (var i = 0; i < prevData.timetable.length; i++) {
            var dayObj = prevData.timetable[i];
            if (dayObj.sessions) {
              for (var j = 0; j < dayObj.sessions.length; j++) {
                prevTopics.push(dayObj.sessions[j].topic);
              }
            }
          }
        }
        var uniqueTopics = Array.from(new Set(prevTopics)).join(', ');
        
        prevContext = '\\n--- CONTEXT: CONTINUING FROM PREVIOUS BLOCK ---\\n' +
          'The user has already completed ' + prevCompletedDays + ' days out of their previous 14-day block.\\n' +
          'Previously scheduled topics: ' + uniqueTopics + '\\n' +
          'CRITICAL: Do NOT schedule these previously covered topics again unless it is specifically marked as a Revision or Mock test session. Progress to new topics to build knowledge.\\n' +
          'Start day numbering from Day ' + startDay + ' up to Day ' + (startDay + daysToPlan - 1) + '.\\n';
      }
    } catch(e){}
  }

  var prompt = 'You are an expert aptitude coach for competitive exams like CAT, GMAT, Bank PO, and SSC.\\n' +
    '\\nUser details:\\n' +
    '- Target Exam: ' + examName + '\\n' +
    '- Target Score: ' + targetScore + '\\n' +
    '- Current Level: ' + currentLevel + '\\n' +
    '- Days remaining until exam: ' + daysRemaining + '\\n' +
    '- Daily time available: ' + dailyTimeMinutes + ' minutes\\n' +
    '- Strong topics (Auto-detected + Manual): ' + strongStr + '\\n' +
    '- Weak topics (Auto-detected + Manual): ' + weakStr + '\\n' +
    '- Current accuracy: ' + accuracy + '%\\n' +
    prevContext +
    '\\nCreate an exact, day-by-day executable timetable.\\n' +
    '\\nRequirements:\\n' +
    '- Generate EXACTLY ' + daysToPlan + ' days of planning. (No more, no less).\\n' +
    (startDay === 1 ? '- Start day numbering from Day 1 up to Day ' + daysToPlan + '.\\n' : '') +
    '- Allocate ' + dailyTimeMinutes + ' minutes total per day.\\n' +
    '- Use precise subjects relevant to the target exam (e.g., CAT = QA, VARC, DILR; GMAT = Quant, Verbal, Data Insights; Bank PO = Quant, Reasoning, English, GA).\\n' +
    '- Break down the daily time into multiple subjects/sessions (e.g., 30m Quant, 20m VARC). Do NOT put all time into a single subject per day.\\n' +
    '- Heavily allocate time to Weak Topics. Adjust focus based on accuracy.\\n' +
    '- Include specific Revision Days, Mock Test Days, and Error Review Days based on days remaining.\\n' +
    '- Provide a rationale explaining WHY this specific block was structured this way, referencing their weak/strong areas.\\n' +
    '- Calculate the overarching phases for the entire remaining duration (e.g. Phase 1: Concept Building 30 days, Phase 2: Practice 40 days, etc).';

  var completion = await client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You are an elite exam strategist. Output valid JSON adhering to the required schema. Ensure day numbering is strictly sequential.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 4096,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "study_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            rationale: { type: "string" },
            phases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  durationDays: { type: "number" }
                },
                required: ["name", "durationDays"],
                additionalProperties: false
              }
            },
            timetable: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "number" },
                  dayType: { type: "string", enum: ["learning", "revision", "mock"] },
                  isRevision: { type: "boolean" },
                  isMock: { type: "boolean" },
                  totalMinutes: { type: "number" },
                  sessions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        subject: { type: "string" },
                        topic: { type: "string" },
                        subTopic: { type: "string" },
                        focusArea: { type: "string" },
                        estimatedMinutes: { "type": "number" }
                      },
                      required: ["subject", "topic", "subTopic", "focusArea", "estimatedMinutes"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["day", "dayType", "isRevision", "isMock", "totalMinutes", "sessions"],
                additionalProperties: false
              }
            }
          },
          required: ["rationale", "phases", "timetable"],
          additionalProperties: false
        }
      }
    }
  });

  var result = JSON.parse(completion.choices[0].message.content);

  var planDoc = {
    userId: userId,
    examName: examName,
    examDate: examDate,
    dailyTimeMinutes: dailyTimeMinutes,
    targetScore: targetScore,
    currentLevel: currentLevel,
    status: 'draft',
    rationale: result.rationale,
    phases: result.phases,
    timetable: result.timetable,
    progress: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    var ref = await db.collection('aiStudyPlans').add(planDoc);
    planDoc.id = ref.id;
  } catch (writeErr) {
    console.warn('Study plan cache write failed:', writeErr.message);
  }

  return planDoc;
}

module.exports = { generateWordProblems, generateExplanation, generateCoachV2, generateInsightsV2, generateStudyPlan, getActiveStudyPlan, finalizeStudyPlan, updateStudyPlanProgress, verifyIdToken, resolvePlan, isUserPremium, activatePremium, checkWordProblemQuota, consumeWordProblemQuota, trackExplanationUsage, trackInsightsUsage, safeUserUpdate, AIServiceError };
