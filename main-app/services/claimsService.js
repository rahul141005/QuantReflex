/**
 * claimsService.js — Firebase Custom JWT Claims for Entitlements
 *
 * WHAT THIS DOES:
 * When a user pays for Premium, we store the entitlement in
 * Firestore (the source of truth). But we ALSO embed it in the user's
 * JWT token as a "custom claim". This way, the server can check entitlement
 * by reading the token (0 Firestore reads) instead of querying Firestore
 * (2 reads per API call).
 *
 * HOW IT WORKS:
 * 1. User pays → server calls setEntitlementClaims(uid, { premium: true })
 * 2. Firebase Auth embeds { premium: true } inside the user's JWT
 * 3. Next time the user's token refreshes (every 1 hour, or on force-refresh),
 *    the new claims are available
 * 4. Server can read decoded.premium from the JWT instead of querying Firestore
 *
 * IMPORTANT:
 * - Claims are set SERVER-SIDE ONLY via Firebase Admin SDK
 * - Clients CANNOT forge or modify claims
 * - Claims take up to 1 hour to propagate (or immediately on force-refresh)
 * - Firestore remains the source of truth; claims are a fast-path optimization
 * - If this fails, the system still works (Firestore is checked as fallback)
 */

const admin = require('firebase-admin');

/**
 * Set entitlement claims on a user's JWT (v2 — single premium tier).
 *
 * @param {string} uid — Firebase user ID
 * @param {{ premium: boolean }} claims
 */
async function setEntitlementClaims(uid, claims) {
  if (!uid) {
    console.error('[Claims] setEntitlementClaims called without uid');
    return;
  }

  try {
    await admin.auth().setCustomUserClaims(uid, {
      premium: !!claims.premium
    });

  } catch (err) {
    /* Non-fatal — Firestore entitlement still works as source of truth.
       Log the error but don't throw — we don't want a claims failure
       to block payment processing. */
    console.error('[Claims] Failed to set claims for uid:', uid, ':', err.message);
  }
}

module.exports = { setEntitlementClaims };
