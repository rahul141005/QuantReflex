const { withAdminAuth, parseBody, formatError } = require('../_lib/middleware');
const { writeAuditLog } = require('../_lib/audit');
const { purgeUser, resetProgress, HOLD_DAYS } = require('../_lib/user-lifecycle');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

/**
 * Safely convert any timestamp value to an ISO string.
 * Handles: Firestore Timestamp, ISO string, Date, unix number, null, malformed.
 * NEVER crashes — returns null for unparseable values.
 */
function safeTimestampToISO(val) {
  if (val == null) return null;
  // Firestore Timestamp (.toDate method)
  if (typeof val.toDate === 'function') {
    try { return val.toDate().toISOString(); } catch (_) { return null; }
  }
  // Already an ISO string
  if (typeof val === 'string') {
    var d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Date object
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }
  // Unix timestamp (number)
  if (typeof val === 'number' && isFinite(val)) {
    var ms = val < 1e12 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  // Raw Firestore JSON { _seconds, _nanoseconds }
  if (typeof val === 'object' && val._seconds != null) {
    try {
      return new Date(val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6)).toISOString();
    } catch (_) { return null; }
  }
  return null;
}

async function handler(req, res) {
  const action = req.query.action || 'list';

  try {
    const db = admin.firestore();

    if (action === 'list' && req.method === 'GET') {
      const { limit = '100', startAfter } = req.query;
      let query = db.collection('users').orderBy('createdAt', 'desc').limit(parseInt(limit, 10));

      if (startAfter) {
        const doc = await db.collection('users').doc(startAfter).get();
        if (doc.exists) {
          query = query.startAfter(doc);
        }
      }

      const snapshot = await query.get();
      
      const users = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        users.push({
          id: doc.id,
          uid: doc.id,
          displayName: (data.profile && data.profile.name) || data.email || 'Unknown',
          email: data.email || '',
          coachingId: data.coachingId || null,
          plan: data.plan === 'premium' ? 'premium' : 'free',
          planType: data.planType || null,
          planExpiry: safeTimestampToISO(data.planExpiry),
          planSource: data.planSource || null,
          isTrial: !!data.isTrial,
          trialEnd: safeTimestampToISO(data.trialEnd),
          createdAt: safeTimestampToISO(data.createdAt),
          updatedAt: safeTimestampToISO(data.updatedAt),
          accountStatus: data.accountStatus || 'active',
        });
      });

      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const nextCursor = lastDoc ? lastDoc.id : null;

      return res.status(200).json({
        data: users,
        nextCursor: nextCursor
      });
    }

    if (action === 'details' && req.method === 'GET') {
      const { uid } = req.query;
      if (!uid) return res.status(400).json({ error: 'Missing uid' });

      const [userDoc, aiSnapshot, duelsSnapshot, entitlementLogs] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('users').doc(uid).collection('usage').doc('ai').get(),
        db.collection('duels').where(`participants.${uid}.status`, 'in', ['finished', 'exited']).limit(10).get(),
        db.collection('users').doc(uid).collection('entitlementLogs').orderBy('timestamp', 'desc').limit(5).get()
      ]);

      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userDoc.data();
      
      const details = {
        profile: {
          uid: uid,
          displayName: (userData.profile && userData.profile.name) || userData.email || 'Unknown',
          email: userData.email || '',
          coachingId: userData.coachingId || null,
          plan: userData.plan === 'premium' ? 'premium' : 'free',
          planType: userData.planType || null,
          planExpiry: safeTimestampToISO(userData.planExpiry),
          planSource: userData.planSource || null,
          isTrial: !!userData.isTrial,
          trialEnd: safeTimestampToISO(userData.trialEnd),
          createdAt: safeTimestampToISO(userData.createdAt),
          accountStatus: userData.accountStatus || 'active',
          suspendedAt: safeTimestampToISO(userData.suspendedAt),
          archivedAt: safeTimestampToISO(userData.archivedAt),
          purgeAfter: safeTimestampToISO(userData.purgeAfter),
        },
        aiUsage: aiSnapshot.exists ? aiSnapshot.data() : { tokens: 0, count: 0 },
        recentDuels: [],
        entitlementLogs: []
      };

      duelsSnapshot.forEach(doc => {
        const d = doc.data();
        details.recentDuels.push({
          id: doc.id,
          status: d.status || 'unknown',
          winner: d.winner || null,
          result: d.result || null,
          createdAt: safeTimestampToISO(d.createdAt)
        });
      });

      entitlementLogs.forEach(doc => {
        const d = doc.data();
        details.entitlementLogs.push({
          id: doc.id,
          action: d.action || 'unknown',
          adminUid: d.adminUid || d.adminId || null,
          adminEmail: d.adminEmail || null,
          timestamp: safeTimestampToISO(d.timestamp)
        });
      });

      return res.status(200).json(details);
    }

    /* ── Inactive User Center (ADR-014, was admin/inactive-users) ── */
    if (action === 'inactive-list' && req.method === 'GET') {
      const days = parseInt(req.query.days || '90', 10);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '200', 10)));
      const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
      const snap = await db.collection('users').where('stats.lastActiveDate', '<', cutoff).orderBy('stats.lastActiveDate', 'asc').limit(limit).get();
      const users = [];
      snap.forEach(function (doc) {
        const d = doc.data();
        if ((d.accountStatus || 'active') === 'archived') return;
        users.push({ uid: doc.id, displayName: (d.profile && d.profile.name) || d.email || 'Unknown', email: d.email || '', coachingId: d.coachingId || null, plan: d.plan === 'premium' ? 'premium' : 'free', accountStatus: d.accountStatus || 'active', lastActive: (d.stats && d.stats.lastActiveDate) || null, createdAt: (d.profile && d.profile.createdAt) || null, inactiveFlaggedAt: d.inactiveFlaggedAt || null });
      });
      return res.status(200).json({ days: days, count: users.length, data: users });
    }

    if (action === 'inactive-export' && req.method === 'GET') {
      const days = parseInt(req.query.days || '90', 10);
      const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
      const snap = await db.collection('users').where('stats.lastActiveDate', '<', cutoff).orderBy('stats.lastActiveDate', 'asc').limit(5000).get();
      const rows = [['uid', 'email', 'name', 'plan', 'accountStatus', 'lastActive', 'createdAt']];
      snap.forEach(function (doc) { const d = doc.data(); rows.push([doc.id, d.email || '', (d.profile && d.profile.name) || '', d.plan || 'free', d.accountStatus || 'active', (d.stats && d.stats.lastActiveDate) || '', (d.profile && d.profile.createdAt) || '']); });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      return res.status(200).json({ filename: 'inactive-users-' + Math.max(1, days) + 'd.csv', csv: csv, rowCount: rows.length - 1 });
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
        chunk.forEach(function (uid) { batch.set(db.collection('users').doc(uid), { accountStatus: 'archived', archivedAt: nowIso, purgeAfter: purgeAfter, archiveReason: 'bulk-inactive', statusUpdatedAt: nowIso, updatedAt: nowIso }, { merge: true }); });
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

    /* ── Lifecycle actions (POST) — ADR-014. Suspend/archive disable the Firebase Auth user. ── */
    if (req.method === 'POST') {
      const body = parseBody(req);
      const uid = body.uid || req.query.uid;
      if (!uid) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'uid is required.' } });
      const userRef = db.collection('users').doc(uid);
      const nowIso = new Date().toISOString();

      if (action === 'suspend') {
        try { await admin.auth().updateUser(uid, { disabled: true }); } catch (e) { /* may be Firestore-only */ }
        await userRef.set({ accountStatus: 'suspended', suspendedAt: nowIso, statusUpdatedAt: nowIso, updatedAt: nowIso }, { merge: true });
        await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'suspend_user', category: 'user', targetType: 'user', targetId: uid, summary: 'suspended user ' + uid, after: { accountStatus: 'suspended' } });
        return res.status(200).json({ success: true, uid: uid, accountStatus: 'suspended' });
      }

      if (action === 'restore') {
        try { await admin.auth().updateUser(uid, { disabled: false }); } catch (e) {}
        const del = admin.firestore.FieldValue.delete();
        await userRef.set({ accountStatus: 'active', suspendedAt: del, archivedAt: del, purgeAfter: del, archiveReason: del, inactiveFlaggedAt: del, statusUpdatedAt: nowIso, updatedAt: nowIso }, { merge: true });
        await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'restore_user', category: 'user', targetType: 'user', targetId: uid, summary: 'restored user ' + uid, after: { accountStatus: 'active' } });
        return res.status(200).json({ success: true, uid: uid, accountStatus: 'active' });
      }

      if (action === 'archive') {
        const purgeAfter = new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
        try { await admin.auth().updateUser(uid, { disabled: true }); } catch (e) {}
        await userRef.set({ accountStatus: 'archived', archivedAt: nowIso, purgeAfter: purgeAfter, archiveReason: (body.reason || null), statusUpdatedAt: nowIso, updatedAt: nowIso }, { merge: true });
        await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'archive_user', category: 'user', targetType: 'user', targetId: uid, summary: 'archived user ' + uid + ' (purge after ' + purgeAfter.split('T')[0] + ')', after: { accountStatus: 'archived', purgeAfter: purgeAfter } });
        return res.status(200).json({ success: true, uid: uid, accountStatus: 'archived', purgeAfter: purgeAfter });
      }

      if (action === 'purge') {
        if (body.confirm !== 'DELETE') return res.status(400).json({ error: { code: 'CONFIRM_REQUIRED', message: 'Pass confirm:"DELETE" to permanently delete this account.' } });
        const report = await purgeUser(db, uid);
        await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'purge_user', category: 'user', targetType: 'user', targetId: uid, summary: 'PERMANENTLY deleted user ' + uid, before: { authAccount: report.authAccount, userDoc: report.userDoc } });
        return res.status(200).json({ success: true, uid: uid, purged: true, report: report });
      }

      if (action === 'reset-progress') {
        const report = await resetProgress(db, uid);
        await writeAuditLog(db, { actorUid: req.userId, actorEmail: req.adminEmail, action: 'reset_progress', category: 'user', targetType: 'user', targetId: uid, summary: 'reset learning progress for ' + uid });
        return res.status(200).json({ success: true, uid: uid, reset: true, report: report });
      }
    }

    return res.status(404).json({ error: 'User action not found' });
  } catch (err) {
    console.error('Error in user routes:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
