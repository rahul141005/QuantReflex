const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { uid, isPremium } = req.body;
    if (!uid) return res.status(400).json({ error: 'Missing uid' });

    await db.collection('users').doc(uid).set({
      isPremium: !!isPremium
    }, { merge: true });

    res.status(200).json({ success: true, uid: uid, isPremium: !!isPremium });
  } catch (error) {
    console.error('[users-premium] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
