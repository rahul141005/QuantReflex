# Account Isolation — Manual Validation Checklist (ADR-119)

**Why this file exists.** Everything in ADR-119 is verified by executed tests and a real-Chromium run of the
purge, but the audit sandbox **cannot reach Firebase Auth** (the CDN and auth endpoints are blocked), so no
flow requiring two real signed-in accounts has ever run. These are the checks that close that gap. Keep it
short enough to actually run.

Setup: two real accounts on one device — **A** (Premium, theme *Playful*, dark mode ON, language **Hindi**,
target exam **CAT**, some practice history) and **B** (Free, never onboarded, defaults). Run against a
deployed build, not a local file server.

## The eight that matter

| # | Steps | Expected |
|---|---|---|
| 1 | **Direct A→B switch.** Sign in as A, use Home/Practice, then Settings → Log out → sign in as B. | B sees Light + Classic + **English**, B's own (empty) stats, no Premium badge, and **onboarding runs**. Nothing of A's: no CAT chip, no A's best scores, no A's pinned/recent categories, no A's AI badge. |
| 2 | **Two tabs (no reload).** Tab 1 signed in as A on Home. In tab 2, sign in as B. Return to tab 1 **without reloading**. | Tab 1 transitions on its own: brief loading state, then B's app — B's language/theme, B's data. It must never show B's data inside A's theme/language, and never keep rendering A. |
| 3 | **Offline queue survives a switch.** As A, go offline (DevTools), answer several questions, switch to B while still offline, go online, then sign back in as A. | A's answers are present. Check `localStorage` during the switch: `qr_pending_writes_<A-uid>` exists and is untouched by B's session. |
| 4 | **Session replacement.** Signed in as A on device 1; sign in as A on device 2. | Device 1 signs out within ~1–3 s with the "opened on another device" notice, and re-login on device 1 reaches the app **without a manual reload**. No stale drill/duel UI. |
| 5 | **Premium does not cross.** A (Premium) → B (Free). | B sees no Premium badge, hits the paywall on a gated feature, and is offered a purchase. Then B→A: A shows Premium and is **never** offered a purchase while the entitlement is active. |
| 6 | **Coaching does not cross.** A enrolled in a coaching, B not (or a different one). | B shows no coaching affiliation / B's own only. Settings shows the right coaching ID for whoever is signed in. |
| 7 | **Rapid A→B→A.** Switch three times quickly without reloading. | Every switch lands on the correct account's theme/language/data. No flicker of the other account, no duplicate notification badges, no duplicate duel/room subscriptions (Network tab: one `users/{uid}` listener). |
| 8 | **Switch mid-drill / mid-duel.** Start a drill as A (and separately, join a duel), then sign in as B in another tab. | A's drill timers stop, `body.drill-session-active` is gone, B never resumes A's drill, and no `permission-denied` errors appear in the console from A's duel-room listener. |

## Spot-checks while doing the above

- **DevTools → Application → Local Storage**, immediately after any switch: no `qr_*` / `quant_*` key
  belongs to the previous account. The only survivors should be `qr_session_id`, `qr_session_uid`,
  `qr_session_replaced`, `qr_last_uid`, `qr_i18n_preview`, `qr_appUpdating`, `qr_update_*`, and any
  `qr_pending_writes_<uid>`.
- **Console** must be free of `permission-denied`, `[QRIdentity] teardown hook failed`, and
  `[AppState.clearAll] storage-registry unavailable`. The last one means a script-order regression and is a
  hard fail — the purge did not run.
- **Bug report queue**: file a report as A but kill the network so it queues, switch to B, restore network.
  A's report must **not** be submitted under B.

## Known limitation (accepted, documented)

`settings` and `stats` are deliberately excluded from the live cross-device refresh (they are client-owned
and merge-sensitive), so a **language / theme / target-exam / stats change made on another device** reaches
this device on next relaunch rather than instantly. That is by design (ADR-118) and is not a failure of any
check above.

## Known limitations (ADR-120, accepted)

- **Firestore offline cache is never cleared.** `enablePersistence` is on (`js/firebase.js:75`) and
  nothing calls `clearPersistence()`, so documents cached for one account remain in IndexedDB after
  sign-out, after an account switch, and after account deletion. Not reachable through the app — every
  read is uid-scoped and no code reads another uid's path — so this is data *remanence* recoverable only
  with device access + DevTools, not in-app leakage. Clearing it requires terminating the Firestore
  client, which would jeopardise offline persistence, the ADR-072 single-device listener and the durable
  write buffer; that is its own change, not a release-gate fix. **On a genuinely shared/public device,
  treat "sign out" as hiding data from the app, not erasing it from the disk.**
- **Async identity guards cover the report queue only.** `QRIdentity.capture`/`isCurrent` guard
  `ReportQueue` (ADR-120). AI requests, duel writes and analytics are **not** identity-guarded; they rely
  on server-side token attribution and the account-change purge. Do not read ADR-119 Decision 4 as
  blanket coverage.
- **Unattributable legacy reports defer.** A report queued by a build older than ADR-120 carries no
  author. If the identity module is also unavailable, it is held in the queue rather than sent, and
  flushes on the next boot where `js/identity.js` loads.
