/**
 * config-flags.js — Emergency Controls flag reader (ADR-021).
 *
 * Reads the break-glass flags (config/aiKillSwitch, config/paymentKillSwitch, config/maintenance)
 * via the Admin SDK with a short in-memory TTL cache, so enforcement adds ~0 per-request cost.
 * FAILS OPEN: if the flag read errors, returns false (never blocks real traffic on a glitch) —
 * the super-admin toggle is the source of truth and is read again on the next TTL window.
 */
const admin = require('firebase-admin');

var _cache = {};            // name → { value: bool, exp: ms }
var TTL_MS = 30 * 1000;     // 30s

async function isEnabled(name) {
  try {
    var now = Date.now();
    var c = _cache[name];
    if (c && c.exp > now) return c.value;
    var snap = await admin.firestore().collection('config').doc(name).get();
    var v = snap.exists ? !!snap.data().enabled : false;
    _cache[name] = { value: v, exp: now + TTL_MS };
    return v;
  } catch (e) {
    return false; /* fail open */
  }
}

module.exports = { isEnabled };
