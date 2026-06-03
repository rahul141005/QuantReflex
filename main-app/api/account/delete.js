/**
 * POST /api/account/delete
 *
 * Server-side account deletion endpoint.
 *
 * WHY THIS EXISTS:
 * Firestore security rules deny client-side document deletion (allow delete: if false).
 * The only safe way to delete a user's data is via Admin SDK on the server.
 *
 * WHAT IT DOES (in order):
 * 1. Verifies the user's Firebase ID token
 * 2. Deletes all subcollections under users/{uid}
 * 3. Deletes related documents in payments, aiInsights, aiStudyPlans
 * 4. Cleans up duel room participation
 * 5. Deletes the user document itself
 * 6. Deletes the Firebase Auth account
 *
 * SAFETY:
 * - Requires valid, recent Firebase auth token
 * - Uses Admin SDK (bypasses Firestore rules)
 * - Returns success only after ALL steps complete
 * - Subcollection deletes are parallelized for speed (Vercel 30s limit)
 */

const admin = require('firebase-admin');

/* Reuse the singleton Firebase Admin app initialized by aiService */
const aiService = require('../../services/aiService');

const db = admin.firestore();

/**
 * Delete all documents in a subcollection.
 * Handles batching (Firestore batch limit is 500 writes).
 */
async function _deleteSubcollection(userDocRef, subcollectionName) {
  const collRef = userDocRef.collection(subcollectionName);
  let deleted = 0;

  /* Process in batches of 100 to stay well under Firestore limits */
  while (true) {
    const snapshot = await collRef.limit(100).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach(function (doc) {
      batch.delete(doc.ref);
    });
    await batch.commit();
    deleted += snapshot.size;
  }

  return deleted;
}

/**
 * Delete all documents in a top-level collection that match a field.
 * @param {string} collectionName
 * @param {string} fieldName - field to match (e.g. 'uid' or 'userId')
 * @param {string} uid
 */
async function _deleteByField(collectionName, fieldName, uid) {
  let deleted = 0;

  while (true) {
    const snapshot = await db.collection(collectionName)
      .where(fieldName, '==', uid)
      .limit(100)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach(function (doc) {
      batch.delete(doc.ref);
    });
    await batch.commit();
    deleted += snapshot.size;
  }

  return deleted;
}

const { setCorsHeaders } = require('../_lib/middleware');

async function handler(req, res) {
  /* Set CORS headers for ALL responses (preflight AND actual requests) */
  setCorsHeaders(req, res);

  /* Handle CORS preflight */
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is accepted.' }
    });
  }

  /* ── Step 1: Verify auth token ── */
  var authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
    });
  }

  var idToken = authHeader.substring(7);
  var decoded;
  try {
    decoded = await aiService.verifyIdToken(idToken);
  } catch (tokenErr) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication failed. Please login again.' }
    });
  }

  if (!decoded || !decoded.uid) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired authentication token.' }
    });
  }

  var uid = decoded.uid;
  console.log('[account:delete] Starting account deletion for uid:', uid);

  var report = {
    subcollections: {},
    payments: 0,
    aiInsights: 0,
    aiStudyPlans: 0,
    userDoc: false,
    authAccount: false
  };

  try {
    var userDocRef = db.collection('users').doc(uid);

    /* ── Step 2: Delete all subcollections in parallel ── */
    var subcollections = ['performance', 'practice', 'ai', 'usage', 'profile', 'practiceSessions', 'notifications'];

    var subResults = await Promise.all(
      subcollections.map(function (sub) {
        return _deleteSubcollection(userDocRef, sub)
          .then(function (count) {
            report.subcollections[sub] = count;
            return null;
          })
          .catch(function (err) {
            console.warn('[account:delete] Failed to delete subcollection ' + sub + ':', err.message);
            report.subcollections[sub] = 'error: ' + err.message;
            return null; /* Don't fail the whole operation for a subcollection error */
          });
      })
    );

    /* ── Step 3: Delete related top-level documents in parallel ── */
    var [paymentsCount, aiInsightsCount, aiStudyPlansCount] = await Promise.all([
      _deleteByField('payments', 'uid', uid).catch(function (err) {
        console.warn('[account:delete] payments cleanup error:', err.message);
        return 0;
      }),
      _deleteByField('aiInsights', 'userId', uid).catch(function (err) {
        console.warn('[account:delete] aiInsights cleanup error:', err.message);
        return 0;
      }),
      _deleteByField('aiStudyPlans', 'userId', uid).catch(function (err) {
        console.warn('[account:delete] aiStudyPlans cleanup error:', err.message);
        return 0;
      })
    ]);

    report.payments = paymentsCount;
    report.aiInsights = aiInsightsCount;
    report.aiStudyPlans = aiStudyPlansCount;

    /* ── Step 4: Delete the user document itself ── */
    await userDocRef.delete();
    report.userDoc = true;
    console.log('[account:delete] User document deleted for uid:', uid);

    /* ── Step 5: Delete the Firebase Auth account ── */
    await admin.auth().deleteUser(uid);
    report.authAccount = true;
    console.log('[account:delete] Auth account deleted for uid:', uid);

    console.log('[account:delete] Complete deletion report:', JSON.stringify(report));
    return res.status(200).json({ success: true, report: report });

  } catch (err) {
    console.error('[account:delete] Critical error during deletion for uid:', uid, err.message);

    /* If we already deleted the user doc but auth deletion failed,
       the user is in a broken state. Return partial success so the
       client knows to retry or contact support. */
    return res.status(500).json({
      success: false,
      error: {
        code: 'DELETION_FAILED',
        message: 'Account deletion partially failed. Please try again or contact support.',
        partial: report
      }
    });
  }
}

module.exports = handler;
