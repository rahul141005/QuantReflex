/**
 * Shared middleware for Super Admin App Vercel serverless API routes.
 * Decoupled from aiService to prevent MODULE_NOT_FOUND crashes.
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

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function methodGuard(req, res, allowed) {
  if (req.method === allowed) return false;
  res.setHeader('Allow', allowed);
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Only ' + allowed + ' is accepted.', retryable: false }
  });
  return true;
}

function formatError(err) {
  return { code: 'INTERNAL_ERROR', message: err.message || 'An unexpected error occurred.', retryable: true };
}

function withAdminAuth(handler) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE, PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    var authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    }

    var idToken = authHeader.substring(7);
    var decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (tokenErr) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed.' } });
    }
    
    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token.' } });
    }

    // Verify Admin Custom Claim
    if (decoded.admin !== true) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin privileges required.' } });
    }

    req.userId = decoded.uid;
    return handler(req, res);
  };
}

module.exports = { withAdminAuth, formatError, methodGuard, parseBody };
