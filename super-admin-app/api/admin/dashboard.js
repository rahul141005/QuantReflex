const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Total users
    const usersSnap = await db.collection('users').count().get();
    const totalUsers = usersSnap.data().count;

    // Premium+ (highest tier — counted first)
    const premiumPlusSnap = await db.collection('users').where('isPremiumPlus', '==', true).count().get();
    const premiumPlusUsers = premiumPlusSnap.data().count;

    // Premium ONLY — mutually exclusive: exclude users who are also Premium+
    const premiumOnlySnap = await db.collection('users')
      .where('isPremium', '==', true)
      .where('isPremiumPlus', '==', false)
      .count().get();
    const premiumUsers = premiumOnlySnap.data().count;

    // Trial users
    const trialSnap = await db.collection('users').where('isTrial', '==', true).count().get();
    const trialUsers = trialSnap.data().count;

    // Free = total - all paid/trial tiers
    const freeUsers = Math.max(0, totalUsers - premiumUsers - premiumPlusUsers - trialUsers);

    res.status(200).json({
      totalUsers: totalUsers,
      freeUsers: freeUsers,
      trialUsers: trialUsers,
      premiumUsers: premiumUsers,
      premiumPlusUsers: premiumPlusUsers,
      aiTokens: 0
    });
  } catch (error) {
    console.error('[dashboard] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
