/**
 * verify-affiliation-reads.js — READ-ONLY. Runs the EXACT production queries each app issues to display
 * coaching affiliation + counts, proving the reads now reflect reality after the ADR-032 fix. Writes nothing.
 *
 * Run: FIREBASE_SERVICE_ACCOUNT="$(cat /d/krishna/claude/service-account.json)" node firestore/diagnostics/verify-affiliation-reads.js [coachingId]
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const CID = process.argv[2] || 'QRBPWBXLRB';

(async function () {
  const out = { coachingId: CID };

  // 1) Super-Admin Coaching-360 details — live count() (source of truth) + maintained field
  const cDoc = await db.collection('coachings').doc(CID).get();
  const liveStudents = (await db.collection('users').where('coachingId', '==', CID).count().get()).data().count;
  let livePremium = null;
  try { livePremium = (await db.collection('users').where('coachingId', '==', CID).where('plan', '==', 'premium').count().get()).data().count; } catch (e) { livePremium = 'INDEX_ERROR:' + e.message; }
  out.superAdmin_coaching360_details = {
    name: cDoc.exists ? (cDoc.data().name || '') : '(missing)',
    maintainedStudentCount: cDoc.exists ? (cDoc.data().studentCount != null ? cDoc.data().studentCount : null) : null,
    liveStudentCount: liveStudents,
    livePremiumCount: livePremium
  };

  // 2) Super-Admin Coaching-360 students roster — plain where (no orderBy)
  const sa = await db.collection('users').where('coachingId', '==', CID).limit(200).get();
  out.superAdmin_coaching360_students = sa.docs.map(function (d) { return { uid: d.id, email: d.data().email || '', plan: d.data().plan || 'free' }; });

  // 3) Coaching App roster — the ADR-032 bug query: where(coachingId) + orderBy('stats.lastActiveMs').
  //    Proves never-practiced joiners are NO LONGER silently excluded (each user must have stats.lastActiveMs).
  const roster = await db.collection('users').where('coachingId', '==', CID).orderBy('stats.lastActiveMs', 'desc').limit(50).get();
  out.coachingApp_roster_orderByLastActiveMs = {
    returned: roster.size,
    matchesPlainWhere: roster.size === sa.size,   // if equal, the orderBy dropped nobody
    students: roster.docs.map(function (d) { return { uid: d.id, email: d.data().email || '', lastActiveMs: (d.data().stats && d.data().stats.lastActiveMs) || null }; })
  };

  // 4) Super-Admin Users list — flat list; the frontend resolves coachingId -> name client-side (ADR-032)
  const ul = await db.collection('users').orderBy('createdAt', 'desc').limit(100).get();
  out.superAdmin_usersList = ul.docs.map(function (d) { return { uid: d.id, email: d.data().email || '', coachingId: d.data().coachingId || null, hasStats: !!(d.data().stats && d.data().stats.lastActiveMs != null) }; });

  // 5) User-360 recent duels — duelHistory (Duel V2), for each affiliated user
  out.userDuelHistory = {};
  for (const d of sa.docs) {
    const dh = await db.collection('users').doc(d.id).collection('duelHistory').orderBy('playedAt', 'desc').limit(10).get();
    out.userDuelHistory[d.id] = dh.docs.map(function (x) { return { id: x.id, outcome: x.data().outcome, opponentName: x.data().opponentName }; });
  }

  // 6) Independent-user sanity — count of users with no coachingId
  let indep = 0;
  const all = await db.collection('users').select('coachingId').get();
  all.forEach(function (d) { const c = d.data().coachingId; if (c == null || c === '') indep++; });
  out.independentUserCount = indep;

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(function (e) { console.error('VERIFY ERROR:', e); process.exit(1); });
