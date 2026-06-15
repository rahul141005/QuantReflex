/**
 * reminderCron.js — the ONE server-side reminder producer (ADR-066).
 *
 * Runs once per day from the Vercel cron (api/duel.js `_cronSweep`, Blaze-free) and GENERATES every recurring
 * reminder through the single notification pipeline (notificationService.notify) → Inbox first, then best-effort
 * push. This replaces the dead Cloud Function reminder AND the retired client 7/1/7 timers — so a reminder is
 * never missed just because the app was closed or push failed.
 *
 * Today's generators (all derived from the users doc — no extra per-user reads): streak-at-risk, daily-practice,
 * premium/trial expiry. New reminder types (planner-due, AI nudges, exam countdown) = add one generator function
 * that buckets uids + calls notify(); zero new architecture.
 */
'use strict';

var notificationService = require('./notificationService');

var DAY_MS = 24 * 60 * 60 * 1000;
var SCAN_CAP = 10000;   // bound the daily scan (matches the broadcast cap)

function _dateKey(now) { return new Date(now).toISOString().slice(0, 10); }            // UTC YYYY-MM-DD
function _startOfDayUTC(now) { var d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
function _expiryMs(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (_) { return 0; } }
  if (typeof v === 'string') { var t = Date.parse(v); return isNaN(t) ? 0 : t; }
  return 0;
}

/**
 * Generate the day's reminders. Idempotent: a `systemMetrics/reminders_{date}` marker is claimed via create()
 * so even though the cron runs hourly, the batch fires at most ONCE per UTC day.
 */
async function runDaily(db, messaging, opts) {
  opts = opts || {};
  var now = opts.now || Date.now();
  var date = _dateKey(now);
  var markerRef = db.collection('systemMetrics').doc('reminders_' + date);

  // Claim the day (atomic): create() throws if the marker already exists → another invocation already ran.
  try {
    await markerRef.create({ date: date, startedAt: now });
  } catch (e) {
    return { skipped: true, reason: 'already_ran', date: date };
  }

  var startToday = _startOfDayUTC(now);
  var active14 = now - 14 * DAY_MS;
  var streakUids = [], dailyUids = [], premiumExpiry = [], trialExpiry = [];

  var snap = await db.collection('users').limit(SCAN_CAP).get();
  snap.forEach(function (doc) {
    var u = doc.data() || {};
    if (u.settings && u.settings.notificationsEnabled === false && !u.fcmToken) { /* still inbox-eligible */ }
    var st = u.stats || {};
    var last = (typeof st.lastActiveMs === 'number') ? st.lastActiveMs : 0;
    var practicedToday = last >= startToday;
    var total = st.totalAttempted || 0;

    // Practice reminders (one per user/day; streak-at-risk takes priority over the generic nudge).
    if (!practicedToday) {
      if ((st.dailyStreak || 0) >= 1) streakUids.push(doc.id);
      else if (total > 0 && last >= active14) dailyUids.push(doc.id);
    }

    // Billing reminders — warn 1–3 days before expiry (the actual expiry notice fires in resolvePlan).
    if (u.plan === 'premium') {
      var ex = _expiryMs(u.planExpiry);
      if (ex > now && ex <= now + 3 * DAY_MS) premiumExpiry.push(doc.id);
    }
    if (u.isTrial) {
      var te = _expiryMs(u.trialEnd);
      if (te > now && te <= now + 3 * DAY_MS) trialExpiry.push(doc.id);
    }
  });

  var results = {};
  async function emit(key, uids, notification) {
    if (!uids.length) { results[key] = { reached: 0 }; return; }
    try { results[key] = await notificationService.notify(db, messaging, { recipients: { uids: uids }, notification: notification, logSegment: 'reminder:' + key }); }
    catch (e) { results[key] = { error: e.message }; }
  }

  await emit('streak', streakUids, {
    title: 'Keep your streak alive 🔥', body: 'You haven\'t practiced today — a quick 5-question drill keeps your streak going.',
    type: 'streak_reminder', category: 'reminder', deepLink: '#practice'
  });
  await emit('daily', dailyUids, {
    title: 'Time to sharpen your reflexes', body: 'A 5-minute mental-math session today compounds into real exam speed.',
    type: 'daily_reminder', category: 'reminder', deepLink: '#practice'
  });
  await emit('premiumExpiry', premiumExpiry, {
    title: 'Your Premium is expiring soon', body: 'Renew to keep your AI Coach, Planner, Insights and Math Duels without interruption.',
    type: 'premium', category: 'billing', priority: 'high', deepLink: '#settings'
  });
  await emit('trialExpiry', trialExpiry, {
    title: 'Your trial ends soon', body: 'Upgrade now to keep your full QuantReflex experience.',
    type: 'trial', category: 'billing', priority: 'high', deepLink: '#settings'
  });

  try { await markerRef.set({ finishedAt: Date.now(), results: results }, { merge: true }); } catch (_) {}
  return { date: date, results: results, scanned: snap.size };
}

module.exports = { runDaily: runDaily };
