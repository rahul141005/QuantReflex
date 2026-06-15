/**
 * QuantReflex — Cloud Functions
 *
 * These functions run on Google's servers on a schedule (like a cron job).
 * You don't need to keep your computer on. Google runs them automatically.
 *
 * WHAT EACH FUNCTION DOES:
 *
 * 1. cleanupExpiredDuels — Every 60 minutes, marks stale duel rooms as 'expired'
 *    so they don't pollute the Firestore 'duels' collection forever.
 *
 * 2. enforceEntitlementExpiry — Every 6 hours, checks for premium users whose
 *    subscription has expired and reverts their access to free server-side.
 *
 * 3. dailyPracticeReminder — At 7:00 AM IST every day, sends a push notification
 *    to all users who have FCM tokens saved in Firestore.
 *
 * HOW TO DEPLOY:
 *    cd d:\krishna\QuantReflex
 *    firebase deploy --only functions
 *
 * HOW TO CHECK LOGS:
 *    firebase functions:log
 *    (or go to Firebase Console → Functions → Logs)
 *
 * IMPORTANT: Scheduled functions require the Blaze plan (pay-as-you-go).
 * The free tier covers ~2 million invocations/month — these functions
 * use about 1,500/month total. Cost is essentially $0.
 */

const { setGlobalOptions } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('firebase-functions/logger');

/* Initialize Firebase Admin — automatically picks up project credentials */
initializeApp();
const db = getFirestore();

/* Limit concurrent containers to control costs */
setGlobalOptions({ maxInstances: 10 });


// ════════════════════════════════════════════════════════════════
// 1. DUEL ROOM CLEANUP
// ════════════════════════════════════════════════════════════════
//
// WHY: Every time a user creates a duel room, a Firestore document
// is created. If nobody joins, it stays forever. Over months, this
// pollutes the 'duels' collection with thousands of dead documents.
//
// WHAT IT DOES:
// - Finds duel rooms in 'waiting' or 'ready' status older than 30 min
// - Marks them as 'expired' (soft delete — preserves for analytics)
// - NEVER touches 'active' or 'completed' rooms
//
// SCHEDULE: Every 60 minutes
// ════════════════════════════════════════════════════════════════

exports.cleanupExpiredDuels = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
    maxInstances: 1
  },
  async (event) => {

    const now = Timestamp.now();
    // ADR-065 fix: Duel V2 (ADR-031) uses status 'lobby' for un-started rooms (the old 'waiting'/'ready' statuses
    // never existed in V2, so this sweep matched ZERO docs and silently did nothing). Expire lobbies that sat for
    // >2h with nobody starting. Active-duel finalize/grading stays in the server cron-sweep, which holds the answer
    // key + grading logic; the expired room's activeDuelId mirror self-heals on the user's next recover().
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const staleBefore = new Date(now.toMillis() - TWO_HOURS_MS);

    try {
      const staleRooms = await db.collection('duels')
        .where('status', '==', 'lobby')
        .where('createdAt', '<', staleBefore)
        .orderBy('createdAt', 'asc')   // oldest-first so a backlog drains deterministically
        .limit(400)
        .get();

      if (staleRooms.empty) {
        logger.info('[cleanup] No stale duel lobbies found.');
        return;
      }

      const batch = db.batch();
      let count = 0;

      staleRooms.forEach((doc) => {
        const data = doc.data();
        /* Safety check: only ever expire a 'lobby' (never an active/complete room). */
        if (data.status !== 'lobby') {
          logger.warn('[cleanup] SAFETY: skipping', doc.id, 'status:', data.status);
          return;
        }

        batch.update(doc.ref, {
          status: 'expired',
          expiredAt: FieldValue.serverTimestamp()
        });
        count++;
      });

      if (count > 0) {
        await batch.commit();
        logger.info('[cleanup] Expired ' + count + ' stale duel lobbies.');
      } else {
        logger.info('[cleanup] All stale rooms were in protected states.');
      }
    } catch (err) {
      logger.error('[cleanup] Error:', err.message);
    }
  }
);


// ════════════════════════════════════════════════════════════════
// 2. ENTITLEMENT EXPIRY ENFORCEMENT
// ════════════════════════════════════════════════════════════════
//
// WHY: Premium is time-limited (6 or 12 months, or a custom-duration trial).
// The client self-heals expiry on read, but if a user never reopens the app
// their doc still shows plan: 'premium'. This makes admin dashboards inaccurate
// and inflates premium counts.
//
// WHAT IT DOES (v2):
// - Finds users where plan == 'premium'
// - Checks if planExpiry is in the past
// - Resets to free: plan:'free', planType/planExpiry/planSource:null,
//   isTrial:false, trialEnd:null
//
// SCHEDULE: Every 6 hours
// ════════════════════════════════════════════════════════════════

exports.enforceEntitlementExpiry = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
    maxInstances: 1
  },
  async (event) => {

    const now = Date.now();
    let totalRevoked = 0;
    let lastDoc = null;

    try {
      /* Paginate through ALL premium users */
      while (true) {
        let query = db.collection('users')
          .where('plan', '==', 'premium')
          .limit(200);
        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        const batch = db.batch();
        let revokedCount = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (!data.planExpiry) return; /* indefinite admin grant — never auto-expires */

          let expiryMs = 0;
          if (typeof data.planExpiry === 'number') {
            expiryMs = data.planExpiry;
          } else if (typeof data.planExpiry === 'string') {
            expiryMs = Date.parse(data.planExpiry);
          } else if (data.planExpiry.toMillis) {
            expiryMs = data.planExpiry.toMillis();
          } else if (data.planExpiry.toDate) {
            expiryMs = data.planExpiry.toDate().getTime();
          }

          if (isNaN(expiryMs) || expiryMs <= 0) return;

          if (expiryMs < now) {
            const iso = new Date().toISOString();
            batch.update(doc.ref, {
              plan: 'free',
              planType: null,
              planExpiry: null,
              planSource: null,
              isTrial: false,
              trialEnd: null,
              planUpdatedAt: iso,
              updatedAt: iso
            });
            revokedCount++;
            logger.info('[expiry] Reverting premium→free for uid:', doc.id,
              'expired:', new Date(expiryMs).toISOString());
          }
        });

        if (revokedCount > 0) {
          await batch.commit();
          totalRevoked += revokedCount;
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        /* Safety: stop after 5000 users to stay within Cloud Function timeout */
        if (totalRevoked > 5000) break;
      }

      if (totalRevoked > 0) {
        logger.info('[expiry] Total reverted: ' + totalRevoked + ' expired premium entitlements.');
      } else {
        logger.info('[expiry] All premium users still within their subscription period.');
      }
    } catch (err) {
      logger.error('[expiry] Error:', err.message);
    }
  }
);


// ════════════════════════════════════════════════════════════════
// 3. DAILY PRACTICE REMINDER (PUSH NOTIFICATION)
// ════════════════════════════════════════════════════════════════
//
// WHY: Push notifications dramatically improve user retention.
// A daily reminder at 7 AM encourages users to practice.
//
// WHAT IT DOES:
// - Finds all users who have an fcmToken saved in Firestore
// - Sends a randomly selected motivational push notification
// - Cleans up invalid tokens (uninstalled apps, expired tokens)
//
// SCHEDULE: Every day at 7:00 AM IST
// ════════════════════════════════════════════════════════════════

const REMINDER_MESSAGES = [
  { title: '🧮 Good Morning!', body: 'Start your day with 5 quick math questions.' },
  { title: '📐 Daily Math Check', body: 'Keep your calculation speed sharp — practice now!' },
  { title: '🔥 Streak Alert!', body: "Don't break your streak! Solve a few questions today." },
  { title: '🎯 Daily Goal', body: 'Have you hit your daily question target yet?' },
  { title: '🧠 Train Your Brain', body: 'Just 5 minutes of mental math this morning.' },
  { title: '✨ Stay Consistent', body: 'Your quant reflex improves with daily practice.' },
  { title: '📈 Build Your Percentile', body: "Today's 5 drills build tomorrow's CAT percentile." },
];

exports.dailyPracticeReminder = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Asia/Kolkata',
    retryCount: 0,
    maxInstances: 1
  },
  async (event) => {

    const msg = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];

    try {
      /* Paginate through ALL users with FCM tokens */
      const tokens = [];
      const tokenToDocId = {};
      let lastDoc = null;

      while (true) {
        let query = db.collection('users')
          .where('fcmToken', '!=', null)
          .limit(500);
        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 20) {
            tokens.push(data.fcmToken);
            tokenToDocId[data.fcmToken] = doc.id;
          }
        });

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        /* Safety: cap at 5000 tokens per run */
        if (tokens.length >= 5000) break;
      }

      if (tokens.length === 0) {
        logger.info('[reminder] No valid FCM tokens found.');
        return;
      }

      logger.info('[reminder] Sending "' + msg.title + '" to ' + tokens.length + ' devices');

      /* Send to all tokens using multicast (max 500 per call) */
      const messaging = getMessaging();
      let totalSuccess = 0;
      let totalFailure = 0;
      const invalidTokenDocIds = [];

      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        const response = await messaging.sendEachForMulticast({
          notification: { title: msg.title, body: msg.body },
          tokens: batch
        });

        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        /* Collect invalid tokens for batch cleanup */
        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success && resp.error) {
              const code = resp.error.code;
              if (code === 'messaging/invalid-registration-token' ||
                  code === 'messaging/registration-token-not-registered') {
                const token = batch[idx];
                if (tokenToDocId[token]) {
                  invalidTokenDocIds.push(tokenToDocId[token]);
                }
              }
            }
          });
        }
      }

      logger.info('[reminder] Success: ' + totalSuccess + ', Failed: ' + totalFailure);

      /* Batch-clean invalid tokens using known doc IDs (no N+1 queries) */
      if (invalidTokenDocIds.length > 0) {
        logger.info('[reminder] Cleaning up ' + invalidTokenDocIds.length + ' invalid tokens');
        const cleanBatch = db.batch();
        for (const docId of invalidTokenDocIds) {
          cleanBatch.update(db.collection('users').doc(docId), { fcmToken: null });
        }
        await cleanBatch.commit().catch((err) => {
          logger.warn('[reminder] Token cleanup batch failed:', err.message);
        });
      }
    } catch (err) {
      logger.error('[reminder] Error:', err.message);
    }
  }
);


// ════════════════════════════════════════════════════════════════
// 4. COACHING STUDENT COUNT SYNC
// ════════════════════════════════════════════════════════════════
//
// WHY: Dashboard loading for massive coaching centers (>10k students)
// requires O(N) reads. Denormalizing the total student count prevents
// 10,000 document reads just to get the headline number.
//
// WHAT IT DOES:
// - Listens to writes on the `users` collection.
// - Increments/decrements `studentCount` on the `coachings` document
//   when a user's `coachingId` changes, or when a user is created/deleted.
// ════════════════════════════════════════════════════════════════

exports.syncCoachingStudentCount = onDocumentWritten(
  { document: 'users/{userId}' },
  async (event) => {
    /* RETIRED (ADR-032, 2026-06-13): studentCount is now maintained in the REQUEST PATH
       (register / claim-coaching / reassign-coaching / purge / self-delete) and read live via
       count() at display time, because Firestore triggers do NOT run on the Spark plan — this
       trigger never fired, leaving every counter frozen at 0. This no-op early-return also
       prevents DOUBLE-counting if the project ever moves to Blaze and the trigger reactivates.
       The original increment/decrement logic is preserved below for reference (unreachable). */
    return null;
    /* eslint-disable no-unreachable */
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;

    const oldCoachingId = beforeData ? beforeData.coachingId : null;
    const newCoachingId = afterData ? afterData.coachingId : null;

    if (oldCoachingId === newCoachingId) {
      return null; // No change in coaching association
    }

    const promises = [];

    /* Decrement from old coaching */
    if (oldCoachingId) {
      promises.push(
        db.collection('coachings').doc(oldCoachingId).update({
          studentCount: FieldValue.increment(-1)
        }).catch((err) => logger.error(`[syncCount] Error decrementing coaching ${oldCoachingId}`, err.message))
      );
    }

    /* Increment on new coaching */
    if (newCoachingId) {
      promises.push(
        db.collection('coachings').doc(newCoachingId).update({
          studentCount: FieldValue.increment(1)
        }).catch((err) => logger.error(`[syncCount] Error incrementing coaching ${newCoachingId}`, err.message))
      );
    }

    return Promise.all(promises);
  }
);
