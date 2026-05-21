const { withAdmin, db } = require('../_lib/firebase-admin');

module.exports = withAdmin(async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { type, action, targetId, trialDays } = req.body;
    // type: 'individual' | 'bulk'
    // action: 'trial' | 'premium' | 'premium_plus_6m' | 'premium_plus_1y' | 'revoke'
    // targetId: uid (if individual) or coachingId (if bulk)
    // trialDays: number (optional)

    if (!type || !action || !targetId) {
      return res.status(400).json({ error: 'type, action, and targetId are required' });
    }

    let userDocs = [];

    if (type === 'individual') {
      const doc = await db.collection('users').doc(targetId).get();
      if (doc.exists) {
        userDocs.push(doc);
      }
    } else if (type === 'bulk') {
      const snapshot = await db.collection('users').where('coachingId', '==', targetId).get();
      snapshot.forEach(doc => userDocs.push(doc));
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (userDocs.length === 0) {
      return res.status(404).json({ error: 'No users found for targetId' });
    }

    // Determine payload based on action
    let payload = {};
    const now = Date.now();
    const updatedAt = new Date().toISOString();

    if (action === 'trial') {
      const durationDays = parseInt(trialDays, 10) || 7;
      const trialEnd = new Date(now + durationDays * 24 * 60 * 60 * 1000).toISOString();
      payload = {
        isTrial: true,
        trialEnd: trialEnd,
        updatedAt
      };
      // Note: We do NOT explicitly wipe premium fields here because 
      // if they are already premium, granting a trial should not downgrade them. 
      // The frontend should ideally block this, but we leave premium fields untouched.
    } else if (action === 'premium') {
      payload = {
        isPremium: true,
        hasPaid: true,
        isPremiumPlus: false,       // Mutual exclusivity: clear Premium+
        premiumPlusPlan: null,
        premiumPlusExpiry: null,
        premiumPlusStatus: null,
        isTrial: false, // Precedence: wipe trial
        trialEnd: null,
        updatedAt
      };
    } else if (action === 'premium_plus_6m' || action === 'premium_plus_1y') {
      const plan = action === 'premium_plus_1y' ? 'plus_yearly' : 'plus_6month';
      const days = action === 'premium_plus_1y' ? 365 : 182;
      const expiry = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
      payload = {
        isPremiumPlus: true,
        isPremium: true,            // Premium+ ⊃ Premium: inherit Premium access
        hasPaid: true,
        premiumPlusPlan: plan,
        premiumPlusExpiry: expiry,
        premiumPlusStatus: 'active',
        isTrial: false, // Precedence: wipe trial
        trialEnd: null,
        updatedAt
      };
    } else if (action === 'revoke') {
      payload = {
        isPremium: false,
        isPremiumPlus: false,
        hasPaid: false,
        isTrial: false,
        trialEnd: null,
        premiumPlusExpiry: null,
        premiumPlusStatus: null,
        premiumPlusPlan: null,
        lastPaymentId: null,
        lastPremiumPlusPaymentId: null,
        updatedAt
      };
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Process in batches (Firestore limit is 500 per batch)
    let batch = db.batch();
    let batchCount = 0;
    let totalUpdated = 0;

    for (let i = 0; i < userDocs.length; i++) {
      let docData = userDocs[i].data();
      let applyPayload = { ...payload };

      // Precedence protection: Do not apply trial if already premium/premium+
      if (action === 'trial') {
        let isPrem = docData.isPremium || docData.hasPaid;
        let expMs = 0;
        if (docData.premiumPlusExpiry) {
          if (typeof docData.premiumPlusExpiry === 'number') expMs = docData.premiumPlusExpiry;
          else if (typeof docData.premiumPlusExpiry === 'string') expMs = Date.parse(docData.premiumPlusExpiry) || 0;
          else if (typeof docData.premiumPlusExpiry.toDate === 'function') {
            try { expMs = docData.premiumPlusExpiry.toDate().getTime(); } catch(_) {}
          }
        }
        let isPlus = docData.isPremiumPlus && expMs > now;
        if (isPrem || isPlus) {
          // Skip downgrading to trial
          continue;
        }
      }

      batch.update(userDocs[i].ref, applyPayload);
      batchCount++;
      totalUpdated++;

      if (batchCount === 500) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    res.status(200).json({ success: true, updatedCount: totalUpdated });
  } catch (error) {
    console.error('[entitlements] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
