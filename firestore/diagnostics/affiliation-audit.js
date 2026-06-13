/**
 * affiliation-audit.js — READ-ONLY diagnostic for the coaching-affiliation pipeline (Section 1 audit).
 * Reads coachings + users via the Admin SDK and reports affiliation integrity. Writes nothing.
 *
 * Run: FIREBASE_SERVICE_ACCOUNT="$(cat /d/krishna/claude/service-account.json)" node firestore/diagnostics/affiliation-audit.js
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

(async function () {
  const out = { coachings: [], independentCount: 0, affiliatedCount: 0, orphanAffiliations: [], recentUsers: [] };

  // 1. Coachings
  const cSnap = await db.collection('coachings').get();
  const coachingIds = new Set();
  const coachingById = {};
  cSnap.forEach((d) => { coachingById[d.id] = d.data(); coachingIds.add(d.id); });

  // 2. All users — classify + live-count per coaching
  const liveCount = {};
  const uSnap = await db.collection('users').select('coachingId', 'email', 'plan', 'isTrial', 'accountStatus', 'createdAt', 'stats.lastActiveMs').get();
  let total = 0;
  const recent = [];
  uSnap.forEach((d) => {
    total++;
    const u = d.data();
    const cid = u.coachingId;
    if (cid == null || cid === '') { out.independentCount++; }
    else {
      out.affiliatedCount++;
      liveCount[cid] = (liveCount[cid] || 0) + 1;
      if (!coachingIds.has(cid)) out.orphanAffiliations.push({ uid: d.id, email: u.email, coachingId: cid, reason: 'coachingId points to a coaching that does NOT exist' });
    }
    recent.push({ uid: d.id, email: u.email, coachingId: cid == null ? null : cid, plan: u.plan, createdAtMs: (u.createdAt && u.createdAt.toMillis) ? u.createdAt.toMillis() : 0 });
  });

  // 3. Per-coaching: denormalized vs live
  Object.keys(coachingById).forEach((id) => {
    const c = coachingById[id];
    out.coachings.push({
      id: id, name: c.name, status: c.status, isActive: c.isActive,
      denormalizedStudentCount: (c.studentCount !== undefined ? c.studentCount : '(absent)'),
      liveStudentCount: liveCount[id] || 0,
      mismatch: (c.studentCount !== undefined ? c.studentCount : 0) !== (liveCount[id] || 0)
    });
  });

  // 4. 8 most recent users (to spot a just-created test account)
  recent.sort((a, b) => b.createdAtMs - a.createdAtMs);
  out.recentUsers = recent.slice(0, 8).map((r) => ({ email: r.email, coachingId: r.coachingId, plan: r.plan }));
  out.totalUsers = total;

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((e) => { console.error('DIAG ERROR:', e); process.exit(1); });
