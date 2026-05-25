const { methodGuard, formatError } = require('./_lib/middleware');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

// In-memory rate limiting for this unauthenticated endpoint (per Vercel instance)
// Using IP if available (from headers)
var _rateLimitMap = {};
var _rateLimitCheckCount = 0;
var RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
var MAX_REQUESTS_PER_MINUTE = 10;
var CLEANUP_INTERVAL = 20; 

function _checkRateLimit(ip) {
  var now = Date.now();
  _rateLimitCheckCount++;
  if (_rateLimitCheckCount >= CLEANUP_INTERVAL) {
    _rateLimitCheckCount = 0;
    var keys = Object.keys(_rateLimitMap);
    for (var i = 0; i < keys.length; i++) {
      if (now - _rateLimitMap[keys[i]].windowStart > RATE_LIMIT_WINDOW_MS) {
        delete _rateLimitMap[keys[i]];
      }
    }
  }

  if (!_rateLimitMap[ip]) {
    _rateLimitMap[ip] = { count: 1, windowStart: now };
    return true;
  }
  var entry = _rateLimitMap[ip];
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    return true;
  }
  entry.count++;
  return entry.count <= MAX_REQUESTS_PER_MINUTE;
}

module.exports = async (req, res) => {
  // CORS for public access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (methodGuard(req, res, 'GET')) return;

  var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!_checkRateLimit(ip)) {
    return res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.', retryable: true }
    });
  }

  var coachingId = req.query.id;
  if (!coachingId || typeof coachingId !== 'string' || coachingId.trim().length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Missing coaching ID.' } });
  }

  coachingId = coachingId.trim();

  try {
    var db = admin.firestore();
    var doc = await db.collection('coachings').doc(coachingId).get();
    
    if (!doc.exists) {
      return res.status(200).json({ valid: false, message: 'Coaching not found' });
    }

    var data = doc.data();
    if (data.isActive === false || data.status === 'expired') {
      return res.status(200).json({ valid: false, message: 'Coaching is inactive or expired' });
    }

    return res.status(200).json({ valid: true, name: data.name || 'Verified Coaching' });
  } catch (err) {
    console.error('Error validating coaching ID:', err);
    return res.status(500).json({ error: formatError(err) });
  }
};
