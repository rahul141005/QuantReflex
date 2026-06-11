/**
 * Export Center (ADR-016) — authenticated CSV exports.
 *
 *   GET ?type=users|premium|coachings|revenue|ai-usage  →  JSON { filename, csv, rowCount }
 *
 * Returns JSON (not a raw download) so the request carries the admin Bearer token via API._fetch;
 * the client turns `csv` into a Blob download (AdminUtils.downloadCsv) — auth preserved, no token in URL.
 * Capped per request (large-scale export is a future background job).
 */
const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
const { PREMIUM_PRICE_PAISE } = require('../_lib/metrics');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

function _ts(v) {
  if (v == null) return '';
  if (typeof v.toDate === 'function') { try { return v.toDate().toISOString(); } catch (_) { return ''; } }
  if (typeof v === 'string') { var d = new Date(v); return isNaN(d.getTime()) ? v : d.toISOString(); }
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === 'object' && v._seconds != null) { try { return new Date(v._seconds * 1000).toISOString(); } catch (_) { return ''; } }
  return '';
}

function _csv(rows) {
  return rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
}

async function handler(req, res) {
  if (methodGuard(req, res, 'GET')) return;
  const db = admin.firestore();
  const type = req.query.type || 'users';

  try {
    let rows, filename;

    if (type === 'users' || type === 'premium') {
      const q = (type === 'premium') ? db.collection('users').where('plan', '==', 'premium') : db.collection('users');
      const snap = await q.limit(10000).get();
      rows = [['uid', 'email', 'name', 'plan', 'planType', 'planExpiry', 'planSource', 'coachingId', 'accountStatus', 'createdAt']];
      snap.forEach(function (d) {
        const u = d.data();
        rows.push([d.id, u.email || '', (u.profile && u.profile.name) || '', u.plan || 'free', u.planType || '', _ts(u.planExpiry), u.planSource || '', u.coachingId || '', u.accountStatus || 'active', _ts(u.createdAt)]);
      });
      filename = type + '-users.csv';

    } else if (type === 'coachings') {
      const snap = await db.collection('coachings').limit(5000).get();
      rows = [['coachingId', 'name', 'status', 'studentCount', 'ownerEmail', 'createdAt']];
      snap.forEach(function (d) { const c = d.data(); rows.push([d.id, c.name || '', c.status || '', c.studentCount || 0, c.ownerEmail || '', _ts(c.createdAt)]); });
      filename = 'coachings.csv';

    } else if (type === 'revenue') {
      const snap = await db.collection('payments').limit(20000).get();
      rows = [['paymentId', 'uid', 'plan', 'amountINR', 'status', 'claimedAt', 'orderId']];
      snap.forEach(function (d) {
        const p = d.data();
        const amt = (typeof p.amount === 'number' && p.amount > 0) ? p.amount : (PREMIUM_PRICE_PAISE[p.plan] || 0);
        rows.push([d.id, p.uid || '', p.plan || '', (amt / 100), p.status || 'paid', _ts(p.claimedAt), p.orderId || '']);
      });
      filename = 'revenue.csv';

    } else if (type === 'ai-usage') {
      const snap = await db.collectionGroup('usage').where(admin.firestore.FieldPath.documentId(), '==', 'ai').get();
      rows = [['uid', 'wordProblemsLifetime', 'explanationsUsed', 'gptCalls', 'gptTokensInput', 'gptTokensOutput', 'gptCostUSD']];
      snap.forEach(function (d) {
        const a = d.data();
        const uid = d.ref.parent.parent.id;
        rows.push([uid, a.wordProblemsUsedLifetime || 0, a.explanationsUsed || 0, a.gptCalls || 0, a.gptTokensInput || 0, a.gptTokensOutput || 0, a.gptCostUSD || 0]);
      });
      filename = 'ai-usage.csv';

    } else {
      return res.status(400).json({ error: { code: 'INVALID_TYPE', message: 'Unknown export type: ' + type } });
    }

    return res.status(200).json({ filename: filename, csv: _csv(rows), rowCount: rows.length - 1 });
  } catch (err) {
    console.error('Error in export:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
