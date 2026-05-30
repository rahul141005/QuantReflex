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
 * 2. enforceEntitlementExpiry — Every 6 hours, checks for Premium+ users whose
 *    subscription has expired and revokes their access server-side.
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
    const thirtyMinutesAgo = new Date(now.toMillis() - 30 * 60 * 1000);

    try {
      /* Find stale rooms (waiting/ready for more than 30 min) */
      const staleRooms = await db.collection('duels')
        .where('status', 'in', ['waiting', 'ready'])
        .where('createdAt', '<', thirtyMinutesAgo)
        .limit(400)
        .get();

      if (staleRooms.empty) {
        logger.info('[cleanup] No stale duel rooms found.');
        return;
      }

      const batch = db.batch();
      let count = 0;

      staleRooms.forEach((doc) => {
        const data = doc.data();
        /* Safety check: never touch active or completed rooms */
        if (data.status === 'active' || data.status === 'completed') {
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
        logger.info('[cleanup] Marked ' + count + ' rooms as expired.');
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
// WHY: Premium+ is a time-limited subscription (6 months or 1 year).
// The client-side code checks expiry and revokes locally, but if a
// user never opens the app again, their Firestore document still
// shows isPremiumPlus: true. This makes admin dashboards inaccurate
// and inflates premium user counts.
//
// WHAT IT DOES:
// - Finds users where isPremiumPlus == true
// - Checks if premiumPlusExpiry is in the past
// - Sets isPremiumPlus: false and premiumPlusStatus: 'expired'
// - Does NOT revoke isPremium (lifetime premium stays)
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

    try {
      const premiumPlusUsers = await db.collection('users')
        .where('isPremiumPlus', '==', true)
        .limit(200)
        .get();

      if (premiumPlusUsers.empty) {
        logger.info('[expiry] No Premium+ users to check.');
        return;
      }

      const batch = db.batch();
      let revokedCount = 0;

      premiumPlusUsers.forEach((doc) => {
        const data = doc.data();
        if (!data.premiumPlusExpiry) return;

        /* Parse the expiry timestamp — could be ISO string, Firestore Timestamp, or number */
        let expiryMs = 0;
        if (typeof data.premiumPlusExpiry === 'number') {
          expiryMs = data.premiumPlusExpiry;
        } else if (typeof data.premiumPlusExpiry === 'string') {
          expiryMs = Date.parse(data.premiumPlusExpiry);
        } else if (data.premiumPlusExpiry.toMillis) {
          expiryMs = data.premiumPlusExpiry.toMillis();
        } else if (data.premiumPlusExpiry.toDate) {
          expiryMs = data.premiumPlusExpiry.toDate().getTime();
        }

        if (isNaN(expiryMs) || expiryMs <= 0) return;

        if (expiryMs < now) {
          batch.update(doc.ref, {
            isPremiumPlus: false,
            premiumPlusStatus: 'expired',
            updatedAt: new Date().toISOString()
          });
          revokedCount++;
          logger.info('[expiry] Revoking Premium+ for uid:', doc.id,
            'expired:', new Date(expiryMs).toISOString());
        }
      });

      if (revokedCount > 0) {
        await batch.commit();
        logger.info('[expiry] Revoked ' + revokedCount + ' expired Premium+ entitlements.');
      } else {
        logger.info('[expiry] All Premium+ users still within their subscription period.');
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
      /* Fetch all users who have an FCM token */
      const snapshot = await db.collection('users')
        .where('fcmToken', '!=', null)
        .limit(500)
        .get();

      if (snapshot.empty) {
        logger.info('[reminder] No users with FCM tokens found.');
        return;
      }

      const tokens = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 20) {
          tokens.push(data.fcmToken);
        }
      });

      if (tokens.length === 0) {
        logger.info('[reminder] No valid FCM tokens found.');
        return;
      }

      logger.info('[reminder] Sending "' + msg.title + '" to ' + tokens.length + ' devices');

      /* Send to all tokens using multicast */
      const messaging = getMessaging();
      const response = await messaging.sendEachForMulticast({
        notification: {
          title: msg.title,
          body: msg.body
        },
        tokens: tokens
      });

      logger.info('[reminder] Success: ' + response.successCount +
                   ', Failed: ' + response.failureCount);

      /* Clean up invalid tokens from Firestore */
      if (response.failureCount > 0) {
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const code = resp.error.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          logger.info('[reminder] Cleaning up ' + invalidTokens.length + ' invalid tokens');
          /* Find and clear invalid tokens from user documents */
          for (const badToken of invalidTokens) {
            try {
              const q = await db.collection('users')
                .where('fcmToken', '==', badToken)
                .limit(1)
                .get();
              q.forEach((doc) => {
                doc.ref.update({ fcmToken: null }).catch(() => {});
              });
            } catch (cleanErr) {
              logger.warn('[reminder] Token cleanup failed:', cleanErr.message);
            }
          }
        }
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
