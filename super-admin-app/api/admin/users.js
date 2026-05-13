const { withAdmin, db, auth } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const listUsersResult = await auth.listUsers(500); // Increased limit slightly to ensure we capture all

    const users = await Promise.all(listUsersResult.users.map(async function (userRecord) {
      let isPremium = false;
      let isPremiumPlus = false;
      let hasPaid = false;
      let isTrial = false;
      let trialEnd = null;
      let premiumPlusPlan = null;
      let premiumPlusExpiry = null;
      let coachingId = null;
      let username = userRecord.displayName || 'Unknown';

      try {
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          isPremium = data.isPremium === true;
          isPremiumPlus = data.isPremiumPlus === true;
          hasPaid = data.hasPaid === true;
          isTrial = data.isTrial === true;
          trialEnd = data.trialEnd || null;
          premiumPlusPlan = data.premiumPlusPlan || null;
          premiumPlusExpiry = data.premiumPlusExpiry || null;
          coachingId = data.coachingId || null;

          if (data.profile && data.profile.username) {
            username = data.profile.username;
          }
        }
      } catch (e) { /* Firestore doc may not exist */ }

      return {
        uid: userRecord.uid,
        email: userRecord.email || '',
        username: username,
        createdAt: userRecord.metadata.creationTime,
        isPremium,
        isPremiumPlus,
        hasPaid,
        isTrial,
        trialEnd,
        premiumPlusPlan,
        premiumPlusExpiry,
        coachingId
      };
    }));

    res.status(200).json({ users });
  } catch (error) {
    console.error('[users] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
