/**
 * notificationService.js — the ONE notification pipeline for the whole QuantReflex ecosystem (ADR-066).
 *
 * `notify(db, messaging, { recipients, notification, push })`:
 *   1) build the canonical notification (notificationModel);
 *   2) WRITE THE INBOX doc to every recipient (batched) — ALWAYS, regardless of push. The Inbox is the source of
 *      truth; a user can never miss a notification because push failed.
 *   3) best-effort PUSH via FCM (chunked, stale-token cleanup) — only to recipients with a token who haven't
 *      opted out (urgent overrides the opt-out);
 *   4) write ONE notificationLogs entry. Returns delivery counts.
 *
 * Pure of app context — takes the injected Admin `db` + `messaging`, so the single internal /api/notify endpoint
 * (and main-app's in-process callers: the reminder cron, duel, entitlement expiry) all run THIS one implementation.
 * This replaces the four duplicated FCM-chunk/stale-cleanup blocks (functions, super-admin, coaching, duel).
 */
'use strict';

var admin = require('firebase-admin');
var model = require('./notificationModel');

var FCM_CHUNK = 500;       // FCM multicast hard limit
var WRITE_CHUNK = 450;     // < 500 Firestore batch limit (room for safety)
var BROADCAST_CAP = 10000; // bound a global broadcast so one call can't run unbounded

function _fv() { return admin.firestore.FieldValue; }

/** A recipient row carries exactly what the pipeline needs: id, token, and whether push is allowed. */
function _recip(doc) {
  var u = doc.data() || {};
  var optedOut = !!(u.settings && u.settings.notificationsEnabled === false); // explicit OFF = no push (inbox still written)
  return { uid: doc.id, fcmToken: u.fcmToken || null, pushEnabled: !optedOut, _u: u };
}

/** Behavioural / segment filters (centralized from the coaching gold-standard so admin apps stay pure clients). */
function _matches(uid, u, spec) {
  // Single-target WITHIN a query scope (e.g. a coaching admin nudging ONE of their students — stays scoped to
  // the coachingId query so an admin can never message a uid outside their roster).
  if (spec.uid && uid !== spec.uid) return false;
  if (spec.segment === 'premium' && u.plan !== 'premium') return false;
  if (spec.segment === 'free' && u.plan === 'premium') return false;
  var st = u.stats || {};
  if (spec.audience === 'inactive') {
    var lastMs = (typeof st.lastActiveMs === 'number' ? st.lastActiveMs : 0);
    if (!lastMs || lastMs >= (Date.now() - 3 * 24 * 60 * 60 * 1000)) return false; // active in last 3d → skip
  } else if (spec.audience === 'lowstreak') {
    if ((st.totalAttempted || 0) === 0) return false;     // never practiced → not "at risk"
    if ((st.dailyStreak || 0) >= 3) return false;         // healthy streak → skip
  } else if (spec.audience === 'weakTopic' && spec.topic) {
    var c = (st.categoryStats || {})[spec.topic];
    if (!c || !c.attempted || c.attempted < 5) return false;
    if ((c.correct / c.attempted) >= 0.5) return false;   // ≥50% accuracy → skip
  }
  return true;
}

/**
 * Resolve a recipients spec → [{uid, fcmToken, pushEnabled}].
 *   { uids:[...] }                                   explicit list (duel, single user, super-admin custom)
 *   { all:true, segment?:'premium'|'free' }          global broadcast (super-admin)
 *   { segment:'premium'|'free' }                     plan-based broadcast
 *   { coachingId, segment?, audience?, topic? }      coaching batch + smart nudges
 *   { audience:'inactive'|'lowstreak'|'weakTopic' }  behaviour-based (queried globally)
 */
async function resolveRecipients(db, spec) {
  spec = spec || {};
  if (Array.isArray(spec.uids) && spec.uids.length) {
    var ids = spec.uids.slice(0, BROADCAST_CAP);
    var out = [];
    for (var i = 0; i < ids.length; i += 300) {
      var refs = ids.slice(i, i + 300).map(function (u) { return db.collection('users').doc(u); });
      var snaps = await db.getAll.apply(db, refs);
      snaps.forEach(function (s) { if (s.exists) out.push(_recip(s)); });
    }
    return out;
  }
  var q = db.collection('users');
  if (spec.coachingId) q = q.where('coachingId', '==', spec.coachingId);
  else if (spec.segment === 'premium') q = q.where('plan', '==', 'premium');
  var snap = await q.limit(BROADCAST_CAP).get();
  var list = [];
  snap.forEach(function (doc) { if (_matches(doc.id, doc.data() || {}, spec)) list.push(_recip(doc)); });
  return list;
}

/** Best-effort FCM multicast over a token list, returning {pushed, failed, staleUids}. Never throws. */
async function sendPushChunked(messaging, tokens, tokenUid, payload) {
  var pushed = 0, failed = 0, staleUids = [];
  for (var j = 0; j < tokens.length; j += FCM_CHUNK) {
    var chunk = tokens.slice(j, j + FCM_CHUNK);
    try {
      var resp = await messaging.sendEachForMulticast(Object.assign({}, payload, { tokens: chunk }));
      pushed += resp.successCount || 0; failed += resp.failureCount || 0;
      (resp.responses || []).forEach(function (r, idx) {
        if (!r.success) {
          var code = r.error && r.error.code;
          if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
            var uid = tokenUid[chunk[idx]]; if (uid) staleUids.push(uid);
          }
        }
      });
    } catch (e) { failed += chunk.length; }
  }
  return { pushed: pushed, failed: failed, staleUids: staleUids };
}

/** THE pipeline. Inbox-first, push best-effort, one log. */
async function notify(db, messaging, opts) {
  opts = opts || {};
  var note = model.buildNotification(opts.notification || {});
  if (!note.title) throw new Error('notification.title is required');
  var doPush = opts.push !== false && model.categoryPushEligible(note.category);
  var urgent = note.priority === model.PRIORITY.URGENT;

  var recips = await resolveRecipients(db, opts.recipients || {});
  // per-recipient push eligibility known up-front → stamp delivery.pushAttempted on the inbox doc
  recips.forEach(function (r) { r.willPush = !!(doPush && messaging && r.fcmToken && (urgent || r.pushEnabled)); });

  // 1) INBOX — ALWAYS (Spark-safe Admin SDK write).
  var reached = 0;
  for (var i = 0; i < recips.length; i += WRITE_CHUNK) {
    var chunk = recips.slice(i, i + WRITE_CHUNK);
    var batch = db.batch();
    chunk.forEach(function (r) {
      var ref = db.collection('users').doc(r.uid).collection('notifications').doc();
      var doc = Object.assign({}, note, {
        timestamp: _fv().serverTimestamp(),
        delivery: Object.assign({}, note.delivery, { pushAttempted: r.willPush })
      });
      batch.set(ref, doc); reached++;
    });
    await batch.commit();
  }

  // 2) PUSH — best-effort only.
  var pushed = 0, failed = 0, cleaned = 0;
  if (doPush && messaging) {
    var pushRecips = recips.filter(function (r) { return r.willPush; });
    var tokens = pushRecips.map(function (r) { return r.fcmToken; });
    var tokenUid = {}; pushRecips.forEach(function (r) { tokenUid[r.fcmToken] = r.uid; });
    if (tokens.length) {
      var payload = {
        notification: { title: note.title, body: note.body },
        data: { url: './index.html' + (note.deepLink || ''), type: String(note.type), category: String(note.category) }
      };
      var pr = await sendPushChunked(messaging, tokens, tokenUid, payload);
      pushed = pr.pushed; failed = pr.failed;
      for (var k = 0; k < pr.staleUids.length; k += WRITE_CHUNK) {
        var sc = pr.staleUids.slice(k, k + WRITE_CHUNK), b = db.batch();
        sc.forEach(function (uid) { b.update(db.collection('users').doc(uid), { fcmToken: _fv().delete(), fcmTokenUpdatedAt: _fv().delete() }); });
        try { await b.commit(); cleaned += sc.length; } catch (_) {}
      }
    }
  }

  // 3) LOG (one entry; `reached` = true inbox reach, the honest number).
  try {
    await db.collection('notificationLogs').add({
      title: note.title, body: note.body, type: note.type, category: note.category,
      segment: opts.logSegment || (opts.recipients && (opts.recipients.coachingId ? 'coaching' : opts.recipients.audience || opts.recipients.segment)) || (opts.recipients && opts.recipients.all ? 'all' : 'direct'),
      coachingId: note.coachingId || null,
      reached: reached, successCount: pushed, failureCount: failed, staleTokensCleaned: cleaned,
      sender: note.sender, adminUid: opts.adminUid || (note.sender && note.sender.id) || 'system',
      timestamp: _fv().serverTimestamp()
    });
  } catch (_) { /* logging is best-effort, never blocks delivery */ }

  return { reached: reached, recipients: recips.length, pushed: pushed, failed: failed, cleaned: cleaned };
}

module.exports = { notify: notify, resolveRecipients: resolveRecipients, sendPushChunked: sendPushChunked };
