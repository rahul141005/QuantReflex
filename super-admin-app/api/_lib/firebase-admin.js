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
 * Verifies Firebase ID token AND checks admin custom claim.
 */
function withAdmin(handler) {
  return async function (req, res) {
    /* CORS preflight */
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    var authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      var token = authHeader.substring(7);
      var decoded = await auth.verifyIdToken(token);

      if (!decoded.admin) {
        return res.status(403).json({ error: 'Admin privileges required.' });
      }

      req.adminUid = decoded.uid;
      return handler(req, res);
    } catch (err) {
      console.error('[middleware] Auth error:', err.message);
      return res.status(401).json({ error: 'Authentication failed.' });
    }
  };
}

module.exports = { withAdmin, db, auth, admin };
