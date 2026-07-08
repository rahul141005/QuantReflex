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
var NS = require('./notificationStrings');   // ADR-111 (E-M4): localized reminder templates

var DAY_MS = 24 * 60 * 60 * 1000;
var SCAN_CAP = 10000;   // bound the daily scan (matches the broadcast cap)
var SUPPORTED_LANGS = ['en', 'hi', 'mr'];

/* ADR-111: a reminder is app chrome → recipient's appLanguage. Never-synced users default to 'en'. */
function _langOf(u) { var l = u.settings && u.settings.appLanguage; return (l === 'hi' || l === 'mr') ? l : 'en'; }

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
  // ADR-111: per-(template, appLanguage) buckets so each notify() call carries one pre-localized title/body.
  function _buckets() { return { en: [], hi: [], mr: [] }; }
  var streakUids = _buckets(), dailyUids = _buckets(), premiumExpiry = _buckets(), trialExpiry = _buckets();

  var snap = await db.collection('users').limit(SCAN_CAP).get();
  snap.forEach(function (doc) {
    var u = doc.data() || {};
    if (u.settings && u.settings.notificationsEnabled === false && !u.fcmToken) { /* still inbox-eligible */ }
    var st = u.stats || {};
    var last = (typeof st.lastActiveMs === 'number') ? st.lastActiveMs : 0;
    var practicedToday = last >= startToday;
    var total = st.totalAttempted || 0;
    var lang = _langOf(u);

    // Practice reminders (one per user/day; streak-at-risk takes priority over the generic nudge).
    if (!practicedToday) {
      if ((st.dailyStreak || 0) >= 1) streakUids[lang].push(doc.id);
      else if (total > 0 && last >= active14) dailyUids[lang].push(doc.id);
    }

    // Billing reminders — warn 1–3 days before expiry (the actual expiry notice fires in resolvePlan).
    if (u.plan === 'premium') {
      var ex = _expiryMs(u.planExpiry);
      if (ex > now && ex <= now + 3 * DAY_MS) premiumExpiry[lang].push(doc.id);
    }
    if (u.isTrial) {
      var te = _expiryMs(u.trialEnd);
      if (te > now && te <= now + 3 * DAY_MS) trialExpiry[lang].push(doc.id);
    }
  });

  var results = {};
  // Emit ONE notify() per (template, language) bucket: same notify() contract, pre-localized copy.
  async function emit(key, byLang, base, titleKey, bodyKey) {
    var reached = 0;
    for (var i = 0; i < SUPPORTED_LANGS.length; i++) {
      var lang = SUPPORTED_LANGS[i];
      var uids = byLang[lang];
      if (!uids.length) continue;
      var notification = Object.assign({}, base, { title: NS.s(lang, titleKey), body: NS.s(lang, bodyKey) });
      try {
        var r = await notificationService.notify(db, messaging, { recipients: { uids: uids }, notification: notification, logSegment: 'reminder:' + key + (lang === 'en' ? '' : ':' + lang) });
        reached += (r && r.reached) || 0;
      } catch (e) { results[key + ':' + lang] = { error: e.message }; }
    }
    results[key] = { reached: reached };
  }

  await emit('streak', streakUids, { type: 'streak_reminder', category: 'reminder', deepLink: '#practice' }, 'streak.title', 'streak.body');
  await emit('daily', dailyUids, { type: 'daily_reminder', category: 'reminder', deepLink: '#practice' }, 'daily.title', 'daily.body');
  await emit('premiumExpiry', premiumExpiry, { type: 'premium', category: 'billing', priority: 'high', deepLink: '#settings' }, 'premiumExpiry.title', 'premiumExpiry.body');
  await emit('trialExpiry', trialExpiry, { type: 'trial', category: 'billing', priority: 'high', deepLink: '#settings' }, 'trialExpiry.title', 'trialExpiry.body');

  try { await markerRef.set({ finishedAt: Date.now(), results: results }, { merge: true }); } catch (_) {}
  return { date: date, results: results, scanned: snap.size };
}

module.exports = { runDaily: runDaily };
