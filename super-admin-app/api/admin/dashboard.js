const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const usersSnap = await db.collection('users').count().get();
    const totalUsers = usersSnap.data().count;

    const premiumSnap = await db.collection('users').where('isPremium', '==', true).count().get();
    const premiumUsers = premiumSnap.data().count;

    const premiumPlusSnap = await db.collection('users').where('isPremiumPlus', '==', true).count().get();
    const premiumPlusUsers = premiumPlusSnap.data().count;

    res.status(200).json({
      totalUsers: totalUsers,
      premiumUsers: premiumUsers,
      premiumPlusUsers: premiumPlusUsers,
      aiTokens: 0
    });
  } catch (error) {
    console.error('[dashboard] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
