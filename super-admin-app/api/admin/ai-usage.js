const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

async function handler(req, res) {
  if (methodGuard(req, res, 'GET')) return;

  try {
    const db = admin.firestore();
    
    // 1. Fetch system metrics (global AI daily counters)
    const systemMetrics = {};
    const metricsSnapshot = await db.collection('systemMetrics').where(admin.firestore.FieldPath.documentId(), '>=', 'ai_daily_').get();
    metricsSnapshot.forEach(doc => {
      systemMetrics[doc.id] = doc.data();
    });

    // 2. Fetch individual user usages using collectionGroup query for efficiency
    // The collection name is 'usage', doc id is 'ai'.
    // Alternatively, we can just query users and their usage subcollection, but collectionGroup is faster.
    const usageQuery = await db.collectionGroup('usage').where(admin.firestore.FieldPath.documentId(), '==', 'ai').get();
    
    const analytics = [];
    const userIds = [];
    const usageDataMap = {};

    usageQuery.forEach(doc => {
      // The parent of the 'usage' doc is the 'users' doc.
      // Ref: users/{userId}/usage/ai
      const userId = doc.ref.parent.parent.id;
      userIds.push(userId);
      usageDataMap[userId] = doc.data();
    });

    // Note: We can't query > 30 userIds in a single 'in' clause, so we fetch all users or chunk them.
    // Given this is an admin panel, we can just fetch all users and map them.
    const usersSnapshot = await db.collection('users').get();
    const usersMap = {};
    usersSnapshot.forEach(doc => {
      usersMap[doc.id] = doc.data();
    });

    userIds.forEach(uid => {
      const user = usersMap[uid];
      if (!user) return; // Orphaned usage

      const usage = usageDataMap[uid];
      const wp = usage.wordProblemsUsedLifetime || 0;
      const exp = usage.explanationsUsed || 0;
      
      // Cost heuristics based on gpt-4o-mini
      // WP: ~800 tokens input, ~600 output
      // Exp: ~400 tokens input, ~300 output
      const wpTokens = wp * 1400;
      const expTokens = exp * 700;
      const totalTokens = wpTokens + expTokens;
      
      // Cost formula: ($0.15/1M input + $0.60/1M output) -> average ~$0.375 per 1M tokens
      const costPerToken = 0.375 / 1000000;
      const estCost = totalTokens * costPerToken;

      analytics.push({
        uid: uid,
        displayName: (user.profile && user.profile.name) || user.email || 'Unknown',
        email: user.email || 'N/A',
        coachingId: user.coachingId || 'Independent',
        isPremium: user.isPremium || user.isPremiumPlus || false,
        totalWP: wp,
        totalExp: exp,
        totalCalls: wp + exp,
        totalEstimatedTokens: totalTokens,
        totalEstimatedCost: estCost.toFixed(6)
      });
    });

    return res.status(200).json({
      analytics: analytics,
      systemMetrics: systemMetrics
    });
  } catch (err) {
    console.error('Error fetching AI usage:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
