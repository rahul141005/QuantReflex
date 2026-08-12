/**
 * claimsService.js — the `premium` custom JWT claim.
 *
 * READ THIS BEFORE USING THE CLAIM FOR ANYTHING (ADR-149).
 *
 * NOTHING READS `decoded.premium`, AND NOTHING MAY. The single server-side entitlement decision is
 * `aiService.resolveUserAuth`, which reads users/{uid} from Firestore. This module only WRITES a
 * mirror of that decision into the token. `entitlement-invariants.check.js` asserts the absence of
 * any reader, and will fail the build if one appears.
 *
 * That is not an oversight — it is the design, for three reasons:
 *
 * 1. THE MIRROR IS ALLOWED TO BE STALE, AND OFTEN IS. A claim only reaches the client on the next
 *    token refresh (up to an hour). More importantly, the Super Admin grant path deliberately does
 *    NOT call this: a bulk coaching grant would otherwise cost one Firebase Auth write per student
 *    (200 students = 200 writes, rate-limited and slow) for a field with no reader. So a legitimately
 *    premium, admin-granted user routinely carries `premium:false`.
 * 2. THEREFORE A FAST PATH BUILT ON IT WOULD DENY PAID USERS. Reading it as a gate would lock out
 *    exactly the users an administrator just granted access to — the failure would look like the
 *    grant silently not working.
 * 3. The read it would save is already amortised: `resolveUserAuth` resolves entitlement AND the
 *    single-device session in ONE document read (ADR-072), not the two this file's original comment
 *    claimed.
 *
 * What the claim IS for: it is written on grant and cleared on lapse/revocation so the token never
 * carries an entitlement the account no longer has. Keeping it truthful costs nothing and means a
 * future feature that needs a coarse hint has a field that is not actively lying.
 *
 * OTHER PROPERTIES:
 * - Claims are set SERVER-SIDE ONLY via the Firebase Admin SDK; clients cannot forge them.
 * - `setCustomUserClaims` REPLACES the whole object, so this merges (see below — writing `{premium}`
 *   alone used to lock admins out of their own consoles).
 * - Every call is best-effort: a claims failure must never fail a payment.
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
    /* ADR-117: setCustomUserClaims REPLACES the entire claims object, so writing `{premium}` alone
       silently destroyed every other claim on the account — a super-admin (`admin:true`) or coaching
       admin (`coaching_admin`) who bought Premium in the main app was instantly locked out of their
       console. Merge onto the existing claims instead.
       Also: `premium` is a mirror of the Firestore entitlement, never the source of truth — it must
       be cleared on revocation too, so a stale `true` can never outlive the entitlement. */
    var existing = {};
    try {
      var userRec = await admin.auth().getUser(uid);
      if (userRec && userRec.customClaims) existing = userRec.customClaims;
    } catch (readErr) {
      console.warn('[Claims] could not read existing claims for uid:', uid, '-', readErr.message);
    }
    var merged = {};
    for (var k in existing) { if (Object.prototype.hasOwnProperty.call(existing, k)) merged[k] = existing[k]; }
    merged.premium = !!claims.premium;
    await admin.auth().setCustomUserClaims(uid, merged);

  } catch (err) {
    /* Non-fatal — Firestore entitlement still works as source of truth.
       Log the error but don't throw — we don't want a claims failure
       to block payment processing. */
    console.error('[Claims] Failed to set claims for uid:', uid, ':', err.message);
  }
}

module.exports = { setEntitlementClaims };
