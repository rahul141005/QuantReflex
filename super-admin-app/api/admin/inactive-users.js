/**
 * Inactive User Center (ADR-014) — list long-inactive accounts and run bulk lifecycle actions
 * to reduce database clutter. Inactivity is measured by `stats.lastActiveDate` (ISO string).
 *
 *   GET  ?action=list&days=90&limit=200      → inactive users (active accounts only)
 *   GET  ?action=export&days=90              → CSV download
 *   POST ?action=bulk-archive  {uids:[...]}  → soft-delete (Auth-disable + 30d hold)
 *   POST ?action=bulk-remind   {uids:[...], title?, body?} → FCM re-engagement push
 */
const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const { HOLD_DAYS } = require('../_lib/user-lifecycle');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

function _cutoffIso(days) {
  return new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
}

async function handler(req, res) {
  const action = req.query.action || 'list';
  const db = admin.firestore();

  try {
    if (action === 'list' && req.method === 'GET') {
      const days = parseInt(req.query.days || '90', 10);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '200', 10)));
      const cutoff = _cutoffIso(days);
      const snap = await db.collection('users')
        .where('stats.lastActiveDate', '<', cutoff)
        .orderBy('stats.lastActiveDate', 'asc')
        .limit(limit).get();
      const users = [];
      snap.forEach(function (doc) {
        const d = doc.data();
        if ((d.accountStatus || 'active') === 'archived') return; /* already in the cleanup queue */
        users.push({
          uid: doc.id,
          displayName: (d.profile && d.profile.name) || d.email || 'Unknown',
          email: d.email || '',
          coachingId: d.coachingId || null,
          plan: d.plan === 'premium' ? 'premium' : 'free',
          accountStatus: d.accountStatus || 'active',
          lastActive: (d.stats && d.stats.lastActiveDate) || null,
          createdAt: (d.profile && d.profile.createdAt) || null,
          inactiveFlaggedAt: d.inactiveFlaggedAt || null
        });
      });
      return res.status(200).json({ days: days, count: users.length, data: users });
    }

    if (action === 'export' && req.method === 'GET') {
      const days = parseInt(req.query.days || '90', 10);
      const snap = await db.collection('users')
        .where('stats.lastActiveDate', '<', _cutoffIso(days))
        .orderBy('stats.lastActiveDate', 'asc')
        .limit(5000).get();
      const rows = [['uid', 'email', 'name', 'plan', 'accountStatus', 'lastActive', 'createdAt']];
      snap.forEach(function (doc) {
        const d = doc.data();
        rows.push([doc.id, d.email || '', (d.profile && d.profile.name) || '', d.plan || 'free', d.accountStatus || 'active', (d.stats && d.stats.lastActiveDate) || '', (d.profile && d.profile.createdAt) || '']);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="inactive-users-' + Math.max(1, days) + 'd.csv"');
      return res.status(200).send(csv);
    }

    if (action === 'bulk-archive' && req.method === 'POST') {
      const body = parseBody(req);
      const uids = Array.isArray(body.uids) ? body.uids.slice(0, 500) : [];
      if (!uids.length) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'uids[] is required.' } });
      const nowIso = new Date().toISOString();
      const purgeAfter = new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
      let archived = 0;
      for (let i = 0; i < uids.length; i += 200) {
        const chunk = uids.slice(i, i + 200);
        await Promise.all(chunk.map(function (uid) { return admin.auth().updateUser(uid, { disabled: true }).catch(function () {}); }));
        const batch = db.batch();
        chunk.forEach(function (uid) {
          batch.set(db.collection('users').doc(uid), { accountStatus: 'archived', archivedAt: nowIso, purgeAfter: purgeAfter, archiveReason: 'bulk-inactive', statusUpdatedAt: nowIso, updatedAt: nowIso }, { merge: true });
        });
        await batch.commit();
        archived += chunk.length;
      }
      await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'bulk_archive_users', category: 'user', targetType: 'bulk', targetId: null, summary: 'archived ' + archived + ' inactive user(s) — purge after ' + purgeAfter.split('T')[0], after: { count: archived } });
      return res.status(200).json({ success: true, archived: archived, purgeAfter: purgeAfter });
    }

    if (action === 'bulk-remind' && req.method === 'POST') {
      const body = parseBody(req);
      const uids = Array.isArray(body.uids) ? body.uids.slice(0, 500) : [];
      if (!uids.length) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'uids[] is required.' } });
      const title = body.title || 'We miss you!';
      const msg = body.body || 'Come back and keep your streak alive on QuantReflex.';
      const tokens = [];
      for (let i = 0; i < uids.length; i += 100) {
        const refs = uids.slice(i, i + 100).map(function (u) { return db.collection('users').doc(u); });
        const snaps = await db.getAll.apply(db, refs);
        snaps.forEach(function (s) { const d = s.data(); if (d && d.fcmToken) tokens.push(d.fcmToken); });
      }
      let sent = 0, failed = 0;
      const messaging = admin.messaging();
      for (let i = 0; i < tokens.length; i += 500) {
        const r = await messaging.sendEachForMulticast({ notification: { title: title, body: msg }, data: { url: './index.html' }, tokens: tokens.slice(i, i + 500) });
        sent += r.successCount; failed += r.failureCount;
      }
      await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'bulk_remind_users', category: 'user', targetType: 'bulk', targetId: null, summary: 'sent re-engagement reminder to ' + sent + ' of ' + uids.length + ' inactive user(s)' });
      return res.status(200).json({ success: true, sent: sent, failed: failed, targeted: uids.length });
    }

    return res.status(404).json({ error: 'Inactive-users action not found' });
  } catch (err) {
    console.error('Error in inactive-users routes:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
