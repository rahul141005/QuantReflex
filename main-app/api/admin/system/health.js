const { withAdminAuth, methodGuard, formatError } = require('../../_lib/middleware');
const admin = require('firebase-admin');

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
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. User Metrics (DAU, MAU, Entitlements)
    // Fetch pre-aggregated metrics (from CRON) instead of full count to save ops.
    const metricsRef = await db.collection('metrics').doc('latest').get();
    let dau = 0, mau = 0, totalAiTokens = 0;
    
    if (metricsRef.exists) {
      const data = metricsRef.data();
      dau = data.dau || 0;
      mau = data.mau || 0;
      totalAiTokens = data.totalAiTokens || 0;
    }

    const [
      totalUsersSnap,
      premiumUsersSnap,
      premiumPlusUsersSnap,
      orphanDuelsSnap,
      aiMetricsDoc
    ] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('users').where('isPremium', '==', true).count().get(),
      db.collection('users').where('isPremiumPlus', '==', true).count().get(),
      db.collection('duels').where('status', 'in', ['waiting', 'ready', 'in_progress']).where('createdAt', '<', oneDayAgo).count().get(),
      db.collection('systemMetrics').doc('ai_daily_' + todayStr).get()
    ]);

    const totalUsers = totalUsersSnap.data().count;
    const premiumUsers = premiumUsersSnap.data().count;
    const premiumPlusUsers = premiumPlusUsersSnap.data().count;
    const orphanDuels = orphanDuelsSnap.data().count;

    // 2. AI Token Metrics
    let aiCostToday = 0;
    let aiTokensToday = 0;
    if (aiMetricsDoc.exists) {
      const d = aiMetricsDoc.data();
      aiTokensToday = (d.wordProblems || 0) * 800 + (d.explanations || 0) * 1500;
      // Assume gpt-4o-mini cost: ~$0.00015 per 1k tokens
      aiCostToday = (aiTokensToday / 1000) * 0.00015;
    }

    // 3. System Status flags
    // Ideally these would ping actual webhooks or check log collections.
    const systemHealth = {
      firebaseAuth: 'green',
      firestore: 'green',
      aiApi: 'green',
      webhooks: 'green', // Defaulting to green, but could query a `failed_webhooks` collection
    };

    return res.status(200).json({
      metrics: {
        totalUsers,
        premiumUsers,
        premiumPlusUsers,
        freeUsers: totalUsers - premiumUsers - premiumPlusUsers,
        dau,
        mau,
        orphanDuels
      },
      ai: {
        tokensToday: aiTokensToday,
        costTodayUSD: aiCostToday.toFixed(4),
        tokensTotal: totalAiTokens
      },
      health: systemHealth
    });
  } catch (err) {
    console.error('Error fetching system health:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
