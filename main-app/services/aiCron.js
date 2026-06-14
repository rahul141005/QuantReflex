/**
 * aiCron.js — the AI daily batch (ADR-039), run on the SINGLE shared Vercel cron (piggybacked on the duel
 * sweep — Hobby allows one cron). NO LLM calls (Spark-safe + cost-safe). Bounded + field-masked.
 *
 * Job: roll up the previous day's aiEvents (written client-side, owner-only) into one engagement metrics doc
 * (systemMetrics/ai_engagement_{date}) so the team can finally answer "which AI feature drives opens, deep-link
 * follow-through, helpful-rate, and (joined with plan) premium conversion." The "living" adaptation of Coach /
 * Mission needs no cron — their context cache rebuilds every 6h, so the next open is already fresh.
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  var cfg = { projectId: 'quant-reflex-trainer' };
  var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) { try { cfg.credential = admin.credential.cert(JSON.parse(sa)); } catch (e) { console.error('[aiCron] bad FIREBASE_SERVICE_ACCOUNT:', e.message); } }
  admin.initializeApp(cfg);
}
function db() { return admin.firestore(); }

async function runDailyBatch() {
  var summary = { events: 0, doc: null };
  try {
    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var startYesterday = startToday - 86400000;
    var dateKey = new Date(startYesterday).toISOString().slice(0, 10);

    // collectionGroup over users/*/aiEvents, bounded. Uses the automatic single-field ts index.
    var snap = await db().collectionGroup('aiEvents')
      .where('ts', '>=', startYesterday).where('ts', '<', startToday)
      .limit(8000).get();

    var agg = {}; // feature → { shown, opened, deeplink, helpful_yes, helpful_no, premium }
    snap.forEach(function (d) {
      var e = d.data() || {};
      var f = e.feature || 'ai', t = e.type || '';
      if (!agg[f]) agg[f] = { shown: 0, opened: 0, chip_tap: 0, deeplink: 0, helpful_yes: 0, helpful_no: 0, premiumActors: {} };
      if (agg[f][t] != null) agg[f][t]++;
      if (e.plan === 'premium' && e.uidHash == null) { /* no-op: privacy — we don't store uids here */ }
    });

    var features = {};
    Object.keys(agg).forEach(function (f) {
      var a = agg[f];
      var helpfulTotal = a.helpful_yes + a.helpful_no;
      features[f] = {
        shown: a.shown, opened: a.opened, deeplink: a.deeplink,
        helpfulRate: helpfulTotal ? Math.round((a.helpful_yes / helpfulTotal) * 100) : null,
        deeplinkRate: a.opened ? Math.round((a.deeplink / a.opened) * 100) : null
      };
    });

    summary.events = snap.size;
    summary.doc = 'ai_engagement_' + dateKey;
    await db().collection('systemMetrics').doc(summary.doc).set({
      date: dateKey, totalEvents: snap.size, features: features,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('[aiCron] runDailyBatch failed:', e.message);
  }
  return summary;
}

module.exports = { runDailyBatch };
