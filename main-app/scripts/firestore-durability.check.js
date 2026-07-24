/**
 * firestore-durability.check.js — locks the Firestore durability / serverless-hygiene invariants from
 * the Production Bug Audit (Wave S3). Source-level ratchet (same style as payment-parity /
 * entitlement-invariants) so these can't silently regress. No DOM/Firestore mock needed.
 *
 * Invariants:
 *   1. flushUpdatesAsync stamps a SERVER timestamp (not a client-clock ISO) and does not silently
 *      drop data on failure (keeps a durable buffer).
 *   2. A durable, uid-scoped pending-writes buffer exists, is written on unload, and is replayed on
 *      load only for the matching user (no cross-user write).
 *   3. Account deletion removes the Firebase Auth account BEFORE the Firestore data (auth-first), so a
 *      partial failure can't resurrect a "deleted" account.
 *   4. The per-uid usageCache is bounded (TTL + size cap).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* ---- 1 & 2. FirestoreSync durable flush + buffer ---- */
const sync = R('js/firestore-sync.js');
const fuaM = sync.match(/function flushUpdatesAsync\(callback\)[\s\S]*?\n  \}/);
ok('flushUpdatesAsync found', !!fuaM);
if (fuaM) {
  const body = fuaM[0];
  ok('flushUpdatesAsync uses server timestamp', /_serverTs\(\)/.test(body) && !/updatedAt\s*=\s*new Date\(\)\.toISOString\(\)/.test(body));
  ok('flushUpdatesAsync retains data on failure (durable buffer)', /_persistPendingBuffer\(\)/.test(body));
  ok('flushUpdatesAsync does not clear _pendingUpdates up front', !/_pendingUpdates = \{\};/.test(body));
}
ok('durable pending-writes buffer defined', /PENDING_BUFFER_KEY\s*=\s*'qr_pending_writes'/.test(sync));
ok('buffer replay is uid-scoped (no cross-user write)', /function _replayPendingBuffer\(currentUserId\)[\s\S]*?parsed\.uid !== currentUserId/.test(sync));
ok('buffer persisted on unload', /beforeunload[\s\S]*?_persistPendingBuffer\(\)/.test(sync));
ok('buffer replayed on load', /_replayPendingBuffer\(currentUserId\)/.test(sync));
ok('load-failure retries instead of latching free', /_loadRetryCount < _MAX_LOAD_RETRIES/.test(sync));

/* ---- 3. Account deletion is auth-first ---- */
const acct = R('api/account.js');
const authIdx = acct.indexOf('admin.auth().deleteUser(uid)');
const subIdx = acct.indexOf('_deleteSubcollection(db, userDocRef, sub)');
const userDocDelIdx = acct.indexOf('await userDocRef.delete()');
ok('account deletion calls auth deleteUser', authIdx !== -1);
ok('auth account deleted BEFORE subcollections (auth-first)', authIdx !== -1 && subIdx !== -1 && authIdx < subIdx, 'authIdx=' + authIdx + ' subIdx=' + subIdx);
ok('auth account deleted BEFORE user doc', authIdx !== -1 && userDocDelIdx !== -1 && authIdx < userDocDelIdx);
ok('no second (late) auth deleteUser call', (acct.match(/admin\.auth\(\)\.deleteUser\(uid\)/g) || []).length === 1);

/* ---- 4. usageCache bounded ---- */
const ai = R('services/aiService.js');
ok('usageCache has a TTL', /USAGE_CACHE_TTL_MS/.test(ai) && /Date\.now\(\) - \(usageCacheTs\[uid\] \|\| 0\) < USAGE_CACHE_TTL_MS/.test(ai));
ok('usageCache has a size cap + eviction', /USAGE_CACHE_MAX/.test(ai) && /delete usageCache\[uids\[i\]\]/.test(ai));

console.log('firestore-durability.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
