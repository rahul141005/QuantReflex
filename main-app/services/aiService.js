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

async function isUserPremium(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return false;
    var data = doc.data();
    if (data.isPremium === true || data.hasPaid === true) return true;
    if (data.isTrial === true) {
      var trialEndMs = _toExpiryMillis(data.trialEnd);
      return trialEndMs > 0 && trialEndMs >= Date.now();
    }
    return false;
  } catch (err) {
    console.error('Premium lookup failed for uid ' + uid + ':', err.message);
    throw new AIServiceError('ENTITLEMENT_ERROR', 'Unable to verify access status. Please try again.', true);
  }
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

async function isUserPremiumPlus(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return false;
    var data = doc.data();
    if (data.isPremiumPlus !== true) return false;
    var expiryMs = _toExpiryMillis(data.premiumPlusExpiry);
    if (expiryMs > 0 && expiryMs < Date.now()) {
      try {
        await safeUserUpdate(uid, { isPremiumPlus: false, premiumPlusStatus: 'expired' }, 'isUserPremiumPlus:expiry');
      } catch (expiryErr) {
        console.error('[aiService:isUserPremiumPlus] expiry revocation write failed (uid: ' + uid + '):', expiryErr.message);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error('[aiService:isUserPremiumPlus] lookup failed (uid: ' + uid + '):', err.message);
    throw new AIServiceError('ENTITLEMENT_ERROR', 'Unable to verify access status. Please try again.', true);
  }
}

async function unlockPremiumPlus(uid, plan, paymentId, orderId) {
  var days = plan === 'plus_yearly' ? 365 : 182;
  var expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  var paymentRef = db.collection('payments').doc(String(paymentId));
  var userRef = db.collection('users').doc(uid);

  var finalExpiry = expiry;

  await db.runTransaction(async function (tx) {
    var paymentDoc = await tx.get(paymentRef);
    if (paymentDoc.exists) {
      var existing = paymentDoc.data();
      if (existing.uid !== uid) {
        console.error('[aiService:unlockPremiumPlus] PAYMENT_REPLAY detected (uid: ' + uid + ', paymentId: ' + paymentId + ', existingUid: ' + existing.uid + ')');
        throw new AIServiceError('PAYMENT_REPLAY', 'Payment already used by another account.', false);
      }
      finalExpiry = existing.expiry || expiry;

      tx.set(userRef, {
        isPremiumPlus: true,
        isPremium: true,
        hasPaid: true,
        premiumPlusPlan: existing.plan || plan,
        premiumPlusExpiry: finalExpiry,
        premiumPlusStatus: 'active',
        lastPremiumPlusPaymentId: String(paymentId),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return;
    }
    var paymentDoc2 = {
      uid: uid,
      plan: plan,
      expiry: expiry,
      claimedAt: new Date().toISOString()
    };
    if (orderId) paymentDoc2.orderId = String(orderId);
    tx.create(paymentRef, paymentDoc2);
    tx.set(userRef, {
      isPremiumPlus: true,
      isPremium: true,
      hasPaid: true,
      premiumPlusPlan: plan,
      premiumPlusExpiry: expiry,
      premiumPlusStatus: 'active',
      lastPremiumPlusPaymentId: String(paymentId),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });


  return finalExpiry;
}

var WP_FREE_LIMIT = 5;
var WP_PREMIUM_DAILY = 25;
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

async function consumeWordProblemQuota(uid, isPremium, count) {
  var entry = await _loadUsage(uid);
  var now = new Date();
  var today = now.toDateString();
  var lastDate = entry.wordProblemsLastDate ? new Date(entry.wordProblemsLastDate).toDateString() : null;
  if (isPremium) {
    if (lastDate !== today) { entry.wordProblemsUsedToday = 0; }
    entry.wordProblemsUsedToday += count;
  } else {
    entry.wordProblemsUsedLifetime += count;
  }
  entry.wordProblemsLastDate = now.toISOString();
  entry.lastUsageDate = now.toISOString();
  usageCache[uid] = entry;
  await _saveUsage(uid);
  await trackGlobalAIUsage('wordProblems', count);
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

var STUDY_PLAN_TTL_DAYS = 7;

async function generateStudyPlan(params) {
  var examName = params.examName;
  var examDate = params.examDate;
  var daysRemaining = params.daysRemaining;
  var dailyTimeMinutes = params.dailyTimeMinutes;
  var weakTopics = params.weakTopics || [];
  var accuracy = params.accuracy || '0';
  var userId = params.userId;

  var cacheRef = db.collection('aiStudyPlans');
  var cacheDocId = userId + '_' + examDate.replace(/[^a-z0-9]/gi, '-');

  try {
    var cached = await cacheRef.doc(cacheDocId).get();
    if (cached.exists) {
      var data = cached.data();
      var createdMs = data.createdAt ? data.createdAt.toMillis() : 0;
      var ageMs = Date.now() - createdMs;
      var examNameMatch = data.examName === examName;
      var dailyTimeMatch = data.dailyTimeMinutes === dailyTimeMinutes;
      if (ageMs < STUDY_PLAN_TTL_DAYS * 24 * 60 * 60 * 1000 && examNameMatch && dailyTimeMatch) {
        if (data.timetable) {
          return { strategy: data.strategy, timetable: data.timetable, tip: data.tip };
        }
      }
    }
  } catch (cacheErr) {
    console.warn('Study plan cache read failed:', cacheErr.message);
  }

  var client = getClient();
  if (!client) throw new AIServiceError('SERVICE_UNAVAILABLE', 'AI service unavailable', true);

  var weakStr = weakTopics.length > 0 ? weakTopics.join(', ') : 'None identified yet';
  var timeLabel = daysRemaining <= 7 ? 'critical — less than a week' : daysRemaining <= 30 ? 'short — under a month' : daysRemaining <= 60 ? 'moderate — 1-2 months' : 'comfortable — more than 2 months';

  var prompt = 'You are an expert aptitude coach for competitive exams like CAT, GMAT, CET, and placements.\n\nUser details:\n- Target Exam: ' + examName + '\n- Days remaining: ' + daysRemaining + ' (' + timeLabel + ')\n- Daily time available: ' + dailyTimeMinutes + ' minutes\n- Weak topics: ' + weakStr + '\n- Current accuracy: ' + accuracy + '%\n\nCreate a SMART and REALISTIC full exam preparation plan.\n\nRequirements:\n- Generate an actual day-by-day timetable\n- Do NOT generate quant-only plans. Generate full exam preparation plans including Quant, Logical Reasoning, Verbal Ability etc as relevant to the exam.\n- Allocate time realistically per day (totaling ' + dailyTimeMinutes + ' minutes)\n- Focus on weak areas\n- Use specific topic names (not vague advice)\n- Provide exactly ' + Math.min(daysRemaining, 14) + ' days of planning\n\nReturn ONLY a valid JSON object with exactly these fields:\n{\n  "strategy": "Overall 2-3 sentence approach",\n  "timetable": [\n    {\n      "day": 1,\n      "subject": "Quantitative Aptitude",\n      "topic": "Profit & Loss",\n      "subTopic": "Discounts",\n      "estimatedMinutes": 60\n    }\n  ],\n  "tip": "One powerful improvement tip"\n}\n\nReturn ONLY the JSON object, no markdown, no explanation, no code fences.';

  var result = await _callAndParse(client, prompt, function (parsed) {
    if (!parsed || typeof parsed.strategy !== 'string') return null;
    if (!Array.isArray(parsed.timetable) || parsed.timetable.length < 1) return null;
    if (typeof parsed.tip !== 'string') return null;
    return {
      strategy: parsed.strategy,
      timetable: parsed.timetable,
      tip: parsed.tip
    };
  });

  if (!result) throw new AIServiceError('INVALID_RESPONSE', 'Invalid study plan format after retries', true);

  try {
    await cacheRef.doc(cacheDocId).set({
      userId: userId,
      examName: examName,
      examDate: examDate,
      dailyTimeMinutes: dailyTimeMinutes,
      strategy: result.strategy,
      timetable: result.timetable,
      tip: result.tip,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (writeErr) {
    console.warn('Study plan cache write failed:', writeErr.message);
  }

  return result;
}

async function clearStudyPlanCache(userId, examDate) {
  try {
    var cacheDocId = userId + '_' + examDate.replace(/[^a-z0-9]/gi, '-');
    await db.collection('aiStudyPlans').doc(cacheDocId).delete();
  } catch (err) {
    console.warn('Study plan cache clear failed:', err.message);
  }
}

module.exports = { generateWordProblems, generateExplanation, generateCoachV2, generateInsightsV2, generateStudyPlan, clearStudyPlanCache, verifyIdToken, isUserPremium, isUserPremiumPlus, unlockPremiumPlus, checkWordProblemQuota, consumeWordProblemQuota, trackExplanationUsage, trackInsightsUsage, safeUserUpdate, AIServiceError };
