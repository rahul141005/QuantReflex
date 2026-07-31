/**
 * session-integrity.check.js — auth / session / user-data-consistency invariants (ADR-118, Wave S2).
 *
 * STRUCTURAL ONLY. This file pattern-matches source; it executes nothing.
 *
 * ADR-129: it used to describe itself as "BEHAVIOURAL (executes the real cross-user flush guard)" while
 * actually asserting on a four-line local copy of the predicate — so reverting the production guard left
 * it green, a false positive over the invariant that stops user A's queued work reaching user B's
 * document. ADR-122 named that pattern out of bounds ("a check either executes the shipped function or
 * it is a pattern-match — there is no third category, and copies must not be described as either").
 * The real guard is now EXECUTED in scripts/firestore-durability.check.js, which vm-loads the shipped
 * js/firestore-sync.js and flips the authenticated identity mid-session. What remains here is honest
 * structural coverage of wiring that cannot be executed headlessly.
 *
 *   node scripts/session-integrity.check.js   (run from main-app/)
 */
'use strict';
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
var R = function (p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); };

console.log('Auth / session / data-consistency invariants (ADR-118)\n');

var auth = R('js/auth.js');
var sync = R('js/firestore-sync.js');

/* ── 1. S2-F1 — the outgoing user's data must be flushed BEFORE identity flips ─────────
   The flush inside resetSyncState is guarded by getUserId() === _loadedUserId. If _currentUser is
   reassigned first, that guard trips and the outgoing user's queued work is DISCARDED (reachable with
   no reload: Firebase Auth persistence is shared across tabs). Order is the whole fix. */
var handler = auth.slice(auth.indexOf('_auth.onAuthStateChanged'), auth.indexOf('_auth.onAuthStateChanged') + 4200);
var iReset = handler.indexOf('FirestoreSync.resetSyncState()');
var iAssign = handler.indexOf('_currentUser = user;');
ok(iReset > 0 && iAssign > 0, '1 auth handler contains both the reset and the identity assignment');
ok(iReset < iAssign, '1 resetSyncState() runs BEFORE `_currentUser = user` (else the outgoing user loses queued data)');
ok(/var previousUser = _currentUser;/.test(handler), '1 previous user is captured for the switch comparison');

/* the guard that makes ordering matter must still exist (it is what prevents cross-user contamination) */
ok(/currentUserId !== _loadedUserId/.test(sync), '1 cross-user flush guard still present');
/* and the flush must snapshot its payload synchronously, before _pendingUpdates is cleared */
var flush = sync.slice(sync.indexOf('function _flushUpdates'), sync.indexOf('function _flushUpdates') + 2400);
var iSnap = flush.indexOf('var snapshot = {}');
var iClear = flush.indexOf('_pendingUpdates = {};', iSnap);
var iWrite = flush.indexOf('docRef.set(snapshot');
ok(iSnap > 0 && iClear > iSnap && iWrite > iClear,
  '1 flush snapshots the payload, then clears the queue, then writes (order matters for the reset path)');

/* ── 2. S2-F1 — the cross-user flush guard. The BEHAVIOUR is executed in firestore-durability.check.js
   ("S2 the flush ABORTS once identity has flipped"); here we only pin the shipped predicate so a silent
   rewrite of it is caught, and assert the ordering that makes it reachable. ─────────────────────── */
ok(/if \(!currentUserId \|\| \(_loadedUserId && currentUserId !== _loadedUserId\)\) \{/.test(sync),
  '2 the abort predicate is still the shipped one (executed coverage: firestore-durability.check)');
ok(/aborted: user context changed[\s\S]{0,120}?_pendingUpdates = \{\};/.test(sync),
  '2 aborting also DISCARDS the queue, so it cannot leak into the next user\u2019s flush');
ok(/var uid = _loadedUserId \|\| \(FirebaseApp\.getUserId && FirebaseApp\.getUserId\(\)\);/.test(sync),
  '2 the durable buffer is keyed on the LOADED user, not on whoever is authenticated now (ADR-129)');

/* ── 3. S2-F2 — the live user-doc listener must not throw away the document ─────────── */
var listener = sync.slice(sync.indexOf('function _listenForSession'), sync.indexOf('function _listenForSession') + 3000);
ok(/onSnapshot/.test(listener), '3 session listener uses a live onSnapshot on users/{uid}');
ok(/Session\.onReplaced\(\)/.test(listener), '3 displacement detection preserved');
ok(/_memoryCache\[k\] = d\[k\]/.test(listener) || /_memoryCache\[sk\] = d\[sk\]/.test(listener),
  '3 the snapshot now refreshes the local view (cross-device staleness fix)');
ok(/_loadedUserId !== uid/.test(listener), '3 refresh is scoped to the loaded user (no cross-user bleed)');
ok(/_drillActive/.test(listener), '3 repaint never interrupts an active drill');
/* client-owned, merge-sensitive collections must NOT be live-overwritten */
var refreshSets = sync.slice(sync.indexOf('var REFRESH_SCALARS'), sync.indexOf('var REFRESH_SCALARS') + 260);
ok(/REFRESH_SCALARS/.test(listener) && /REFRESH_STAMPS/.test(listener), '3 listener refreshes the declared field sets');
ok(!/'settings'/.test(refreshSets) && !/'stats'/.test(refreshSets),
  '3 settings/stats are deliberately excluded from live overwrite (would clobber unflushed local edits)');

/* ── 3b. Conflict rule — an unflushed LOCAL edit always wins over the incoming snapshot ─────── */
ok(/function _hasPendingUpdate\(field\)/.test(sync), '3b _hasPendingUpdate helper exists');
ok(/hasOwnProperty\.call\(_pendingUpdates, field\)/.test(sync), '3b it tests the live pending-update queue');
ok((listener.match(/_hasPendingUpdate\(/g) || []).length >= 3,
  '3b every refreshed group (scalars, stamps, profile) consults it before overwriting');
ok(/!_hasPendingUpdate\('profile'\)/.test(listener),
  '3b profile — the one whole-object field refreshed — is skipped while a local profile write is queued');
/* ADR-129: three assertions here used to call a local re-declaration of hasOwnProperty and so proved
   only that hasOwnProperty works. Replaced with a pin on the shipped predicate's actual shape. */
ok(/function _hasPendingUpdate\(field\) \{[\s\S]{0,160}?hasOwnProperty\.call\(_pendingUpdates, field\)/.test(sync),
  '3b the predicate reads the LIVE queue object, not a snapshot or a copy');
/* a field the client legitimately never queues must therefore always refresh */
ok(!/queueUpdate\(\s*'coachingId'/.test(sync), '3b coachingId is server-written only, so it can never be pending');

/* ── 4. S2-F3 — onStateChange must be additive, never silently replacing the auth gate ── */
var osc = auth.slice(auth.indexOf('function onStateChange'), auth.indexOf('function onStateChange') + 500);
ok(!/^\s*_appStateChangeListener = callback;\s*\}/m.test(osc), '4 onStateChange is no longer a bare single-slot assignment');
ok(/_stateChangeListeners\.push\(callback\)/.test(osc), '4 additional listeners are appended, not dropped');
ok(/_stateChangeListeners\.indexOf\(callback\) === -1/.test(osc), '4 duplicate registration of the same fn is ignored');
/* the dispatcher must actually invoke the array (it always did — prove it still does) */
ok(/for \(var i = 0; i < _stateChangeListeners\.length; i\+\+\)/.test(auth), '4 dispatcher iterates the listener array');

/* ── 5. Listener/timer teardown on logout + user switch (leak invariants) ───────────── */
var reset = sync.slice(sync.indexOf('function resetSyncState'), sync.indexOf('function resetSyncState') + 3800);
['_notifUnsub', '_sessionUnsub'].forEach(function (u) {
  ok(new RegExp(u + '\\(\\)').test(reset) || new RegExp('if \\(' + u + '\\)').test(reset),
    '5 resetSyncState tears down ' + u);
});
ok(/_memoryCache = null/.test(reset), '5 resetSyncState clears the memory cache');
ok(/_loadedUserId = null/.test(reset), '5 resetSyncState clears the loaded uid');
ok(/clearTimeout\(_syncTimer\)/.test(reset), '5 resetSyncState clears the debounce timer');
ok(/_clearUserLocalStorage\(\)/.test(reset), '5 resetSyncState purges per-user localStorage');
ok(/QuestionBankService\.clearCache/.test(reset), '5 resetSyncState clears the question-bank cache');
ok(/resetPaywallUserState/.test(reset), '5 resetSyncState clears per-user paywall state');
/* both long-lived listeners must unsubscribe before re-subscribing (no duplicates on re-login) */
ok((sync.match(/if \(_notifUnsub\) \{ try \{ _notifUnsub\(\); \} catch \(_\) \{\} _notifUnsub = null; \}/g) || []).length >= 2,
  '5 notifications listener unsubscribes before re-listen AND on reset');
ok(/if \(_sessionUnsub\) \{ try \{ _sessionUnsub\(\); \} catch \(_\) \{\} _sessionUnsub = null; \}/.test(listener),
  '5 session listener unsubscribes before re-listen');

/* ── 6. Single auth observer / single gate consumer (no double profile load) ────────── */
var files = ['js/auth.js', 'js/app.js', 'js/firebase.js', 'js/session.js', 'js/firestore-sync.js'];
var observers = 0, gateConsumers = 0;
files.forEach(function (f) {
  var s = R(f);
  observers += (s.match(/\.onAuthStateChanged\(/g) || []).length;
  gateConsumers += (s.match(/Auth\.onStateChange\(/g) || []).length;
});
ok(observers === 1, '6 exactly ONE onAuthStateChanged registration (found ' + observers + ')');
ok(gateConsumers === 1, '6 exactly ONE Auth.onStateChange consumer (found ' + gateConsumers + ')');

/* ── 7. Client must never write entitlement fields (server is authoritative) ────────── */
ok(!/queueUpdate\(\s*'plan'/.test(sync), '7 plan is never queued as a client update');
ok(!/queueUpdate\(\s*'planExpiry'/.test(sync), '7 planExpiry is never queued as a client update');

console.log('\nsession-integrity.check: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
