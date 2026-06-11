# QuantReflex Roadmap & Known Debt

**Forward-looking plan and the outstanding technical debt register.** This is where deferred audit
items, infra tasks, and planned features live so they are not lost. Update as items land (move to
[CHANGELOG.md](CHANGELOG.md)) or as priorities change.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [DECISION_LOG.md](DECISION_LOG.md) · [../../AUDIT-REPORT.md](../../AUDIT-REPORT.md)

---

## Design system (established 2026-06-11 — ADR-010)
The app-wide UI design system is now documented in [TECHNICAL_BIBLE.md §10A](TECHNICAL_BIBLE.md):
tokens (24/20/18px radii, hairline borders, soft navy shadows, 32/24/16 spacing), one glassmorphism
foundation + 3 elevation levels, the reusable premium-feature card, and typography/CTA hierarchy.
**Delivered this pass:** Practice scroll-bug fix, Practice simplification (action-focused), AI Coach +
Study Plan unified with Math Duel, de-purpling, stat/CTA token alignment.
**Remaining UX follow-ups (low priority):** audit Learn sub-element radii (`.table-card`, `.math-grid-item`)
and Settings/Session-Results screens against the tokens; optional "Recent Sessions" strip on Practice
(needs a session feed). Track new screens against §10A rather than hand-styling.

## Open technical debt (from the 2026-06-11 audit)

| ID | Item | Type | Priority | Notes |
|---|---|---|---|---|
| M6 | Global rate limiting | Infra | High before 100k | Current limiters are per serverless instance. Needs a shared counter (Firestore/Redis) or App Check to be a true global cap. |
| M7 | Firebase App Check | Infra/console | High before 100k | Not enabled. Requires console config + client SDK init across the three apps. Blunts automated abuse of the public client SDK. |
| M9 | Timestamp standardization | Cleanup | Low | Mixed `serverTimestamp()` / ISO strings; all readers normalize via `_toMillis`. Prefer `serverTimestamp()` server-side on new writes; no mass rewrite planned. |
| LOW-1 | Duel `waiting` room read scope | Security | Low | Any authed user can read a waiting duel doc (needed for join). Tighten only if duel content becomes sensitive. |
| DEBT-1 | ~~Retire client read-time `premiumPlusPlan` normalization~~ | — | Done | Removed in the v2 monetization rewrite (ADR-009); `getAccessState` no longer normalizes legacy plan values. |
| DEBT-2 | Reconciliation cadence for `coachings.studentCount` | Ops | Medium | The reconcile script is manual. Consider a scheduled function if drift recurs. |
| TEST-1 | Automated test coverage | Quality | High | No automated tests exist. Start with the payment/entitlement critical cases (AUDIT §16). |

## Deployment reminders (not code-resolvable here)

- **App code deploys via Vercel** (`main-app`, `super-admin-app`, `coaching-admin-app`) on push —
  Firebase deploy only covers rules + indexes.
- **Firestore rules/indexes** deploy via `firebase deploy --only firestore[:rules|:indexes]`.
- **Cloud Functions** deploy via `firebase deploy --only functions`.

## Coaching Portal (`coaching-admin-app`)

Functional API (`auth`, `students`, `dashboard`, `leaderboard`, `notices`, `insights`) with a lean
UI. Future build-out should follow the governance workflow and keep `coachingId`-claim scoping for
all reads. Document any new collections/fields in [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md).

## Planned / candidate features

_(Add product features here as they are scoped. Each must pass through the
[GOVERNANCE.md](GOVERNANCE.md) workflow: Bible-first, impact report, implement, verify, changelog,
version bump.)_

- _None recorded yet — populate as the product roadmap is defined._
