const { withAdmin, db, auth } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const listUsersResult = await auth.listUsers(500);

    const analytics = await Promise.all(listUsersResult.users.map(async function (userRecord) {
      let usageData = {
        wordProblemsUsedLifetime: 0,
        wordProblemsUsedToday: 0,
        explanationsUsed: 0,
        lastUsageDate: null
      };

      let username = userRecord.displayName || 'Unknown';
      let coachingId = 'None';
      let isPremium = false;

      try {
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          username = (data.profile && data.profile.username) || username;
          coachingId = data.coachingId || 'None';
          isPremium = data.isPremium || data.isPremiumPlus || data.isTrial;
        }

        const usageDoc = await db.collection('users').doc(userRecord.uid).collection('usage').doc('ai').get();
        if (usageDoc.exists) {
          usageData = { ...usageData, ...usageDoc.data() };
        }
      } catch (e) {
        // Skip
      }

      // Calculate estimated cost
      // Using GPT-4o-mini rough averages:
      // Word problem: ~500 prompt, ~300 completion tokens
      // Explanation: ~300 prompt, ~200 completion tokens
      // $0.15/1M input, $0.60/1M output
      
      const totalWP = usageData.wordProblemsUsedLifetime || 0;
      const totalExp = usageData.explanationsUsed || 0;
      
      const wpCost = totalWP * ((500/1000000)*0.15 + (300/1000000)*0.60);
      const expCost = totalExp * ((300/1000000)*0.15 + (200/1000000)*0.60);
      const totalEstimatedCost = wpCost + expCost;
      const totalEstimatedTokens = totalWP * 800 + totalExp * 500;

      return {
        uid: userRecord.uid,
        email: userRecord.email,
        username,
        coachingId,
        isPremium,
        totalWP,
        totalExp,
        totalCalls: totalWP + totalExp,
        totalEstimatedTokens,
        totalEstimatedCost: totalEstimatedCost.toFixed(4),
        lastUsageDate: usageData.lastUsageDate
      };
    }));

    // Filter out users with zero usage
    const activeUsers = analytics.filter(u => u.totalCalls > 0);
    // Sort by highest cost
    activeUsers.sort((a, b) => parseFloat(b.totalEstimatedCost) - parseFloat(a.totalEstimatedCost));

    res.status(200).json({ analytics: activeUsers });
  } catch (error) {
    console.error('[ai-usage] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
