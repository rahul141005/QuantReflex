/**
 * Shared middleware for Admin API routes.
 *
 * Provides:
 *   withAdmin(handler) — wraps a handler with Firebase ID token + admin claim verification
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

const db = admin.firestore();
const auth = admin.auth();

/**
 * Wrap a handler with admin authentication.
 *
 * audit M5: this now delegates to the single canonical admin wrapper in
 * `_lib/middleware.js` (token + `admin:true` claim + per-admin rate limit),
 * which sets BOTH `req.adminUid` and `req.userId`. Kept as a thin re-export
 * so existing importers (e.g. questions.js) continue to work unchanged.
 */
const { withAdminAuth } = require('./middleware');
const withAdmin = withAdminAuth;

module.exports = { withAdmin, db, auth, admin };
