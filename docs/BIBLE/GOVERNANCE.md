# QuantReflex Architecture Governance

**This document defines the mandatory workflow for every change to the QuantReflex repository.**
The `/docs/BIBLE/` set is the permanent source of truth. No change is complete until the Bible,
schema references, API references, and changelog are synchronized with the code.

> **For future Claude sessions and contributors:** read [README.md](README.md) first, then the
> four core documents. Treat the Bible as authoritative over code comments, commit messages, and
> memory. If code and Bible disagree, that is a bug to be reconciled — flag it.

---

## The Mandatory Workflow

Every requested change — feature, bug fix, UI change, payment change, Firestore change, AI
feature, analytics, coaching-portal feature, admin-dashboard feature, or infra change — MUST
follow these steps **in order**:

1. **Analyze** the requested change. Restate it precisely.
2. **Determine impacted systems** (check each):
   - Student App (`main-app`)
   - Admin Dashboard (`super-admin-app`)
   - Coaching Portal (`coaching-admin-app`)
   - Firestore Schema
   - Security Rules
   - Payments
   - Entitlements
   - Analytics
   - AI Services
   - APIs
3. **Update the relevant Bible documents FIRST** (before code).
4. **Generate a Change Impact Report** (template below).
5. **Implement** the code changes.
6. **Verify** code matches documentation (and run/lint/check as applicable).
7. **Update [CHANGELOG.md](CHANGELOG.md).**
8. **Update [VERSIONS.md](VERSIONS.md)** — bump the affected version track(s); add migration notes
   for any MAJOR change or data migration.

### Definition of Done — a change is NOT complete unless ALL hold:
- [ ] Documentation updated (the relevant Bible docs).
- [ ] Firestore schema references updated ([FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md)).
- [ ] API references updated (in [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) / the relevant doc).
- [ ] Security implications reviewed ([SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)).
- [ ] Cross-app compatibility verified (does every reader/writer agree on names/paths/claims?).
- [ ] Changelog entry added.
- [ ] Version registry updated.

---

## Change Impact Report (template)

Copy this into the CHANGELOG entry (or DECISION_LOG for non-trivial choices) for each change.

```
### <type>(<id>): <one-line summary>
- Requested change: <restated>
- Impacted systems: [Student App | Admin | Coaching | Firestore | Rules | Payments |
  Entitlements | Analytics | AI | APIs]   (list only those touched)
- Bible docs updated: <files + sections>
- Schema delta: <new/renamed/removed fields, paths, indexes — or "none">
- API delta: <new/changed/removed endpoints or contracts — or "none">
- Security review: <auth/rules/claims/secrets implications — or "no change">
- Cross-app compatibility: <which apps read/write the touched data; confirmed consistent>
- Version bumps: <tracks + new numbers, or "none">
- Migration: <script/manual steps + rollback — or "none">
- Verification: <how it was checked: node --check, tests, deploy, dry-run, etc.>
```

---

## Quick reference — which doc owns what

| Concern | Owning document |
|---|---|
| App topology, services, data flow, conventions, governance | [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) |
| Collections, fields, paths, indexes, drift register | [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) |
| Auth, roles, rules, claims, secrets, abuse controls | [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) |
| Razorpay flows, plans, entitlements, idempotency | [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md) |
| Dated record of every change | [CHANGELOG.md](CHANGELOG.md) |
| Why decisions were made (trade-offs, rejected options) | [DECISION_LOG.md](DECISION_LOG.md) |
| What's planned, known debt, sequencing | [ROADMAP.md](ROADMAP.md) |
| Version numbers + migration notes | [VERSIONS.md](VERSIONS.md) |

---

## Enforcement note

If a change is requested that would touch code without a corresponding Bible update, the correct
response is to **update the Bible first (step 3) and produce the impact report (step 4) before
writing code** — not to implement and document later. This ordering is what keeps the repository
documentation-synchronized so that a cold reader, months later, can trust the Bible completely.

---

## Super Admin Operational Rules (ADR-012)

The `super-admin-app` Control Center is the **single enforcement point** for all operational changes —
entitlement grants/revokes, coaching create/suspend/delete, content edits, and (Phase 2) user
suspend/delete. These MUST be performed through the app's `api/admin/*` endpoints, **never** by editing
Firestore directly in the Firebase console. Each endpoint enforces auth (`admin:true`), rate limiting
(300/hr), validation, and — critically — an **immutable `auditLogs` entry** (who/when/what/before/after).
Direct console edits bypass all of that and leave no trail. If an operation is needed that the Control
Center doesn't yet support, the correct response is to **add the endpoint** (Bible-first), not to hand-edit
data.

## Data Retention Policy

| Data | Retention | Notes |
|---|---|---|
| `auditLogs` | **Indefinite, immutable** | Append-only; never edited or deleted. The permanent record of admin actions. |
| `users/{uid}/entitlementLogs` | Indefinite | Per-user mirror for the User-360 view. |
| `metrics/{dateStr}` | Indefinite (small) | One doc/day; `metrics/latest` always mirrors newest. |
| `systemMetrics/ai_daily_*` | Indefinite (small) | One doc/day. |
| `practiceSessions/{auto}` | Indefinite today | Candidate for a rolling window if volume grows (Phase 5). |
| Inactive `users` | **No automatic deletion today** | The safe archive workflow lands in Phase 2 (below). |

## Account Deletion Policy (implemented — Phase 2, ADR-014)

Accounts are **never instantly hard-deleted** by an admin. The sanctioned flow is **soft-delete → archive
queue → hold → permanent delete**, every step audit-logged:
`inactive 6+ months → flagged (inactiveFlaggedAt, by the cleanup-sweep cron) → admin archives
(accountStatus:'archived', archivedAt, Auth-disabled) → 30-day hold (purgeAfter) → permanent delete (Auth
user + Firestore doc + subcollections + related docs), by the cron or an explicit guarded purge`. Admin
purge requires `confirm:'DELETE'` server-side + in-UI type-`DELETE` + double-confirm. Archive is
**reversible** via *restore* during the hold. User-initiated deletion (`main-app/api/account?action=delete`)
remains available (clears subcollections + Auth user). No deletion path may skip the `auditLogs` entry.

## Infrastructure Governance (Vercel Free Plan — ADR-017)

QuantReflex runs on the **Vercel Free (Hobby) plan**: ≤12 Serverless Functions per project (every `api/*.js`
is one function; `api/_lib/**` excluded), and cron ≤ once/day. When designing ANY feature:
- **Consider the function-count limit first.** Adding an `api/*.js` file is a budget decision, not free.
- **No endpoint proliferation.** Prefer **action-based, domain APIs** over endpoint-per-feature. A new
  capability should land as a new `?action=` branch in the relevant domain handler, not a new file.
- **Consolidate admin operations** when they share an auth model and domain — but **never** merge across auth
  boundaries (admin / student / cron / webhook-HMAC / public stay isolated; see
  [TECHNICAL_BIBLE §3.1](TECHNICAL_BIBLE.md)).
- **Minimize deployment complexity.** Reuse shared `_lib/*` helpers; keep one cron per scheduled concern.
- A change that would push an app over the function budget is **blocked** until consolidated under the cap.

## Super Admin V2 Governance (ADR-019 / ADR-020 / ADR-021)

The super-admin app is a **tablet-first governance OS** with a **7-domain IA** (Command Center · Users ·
Coachings · Revenue · Content · AI · Operations). Design and review against [TECHNICAL_BIBLE §10B](TECHNICAL_BIBLE.md).

- **One owner per capability (ADR-022 — fully consolidated).** A workflow appears in exactly ONE Center — no
  duplicate entry points. Canonical owners:
  - **User-360** (Users): every per-user action — profile, entitlement grant/revoke/trial, lifecycle
    (suspend/restore/archive/reset/delete), **AI throttle**, **coaching reassignment**, payment history, activity,
    audit. Inactive users are a filter chip + bulk-bar here (no separate view). *No user action exists outside User-360.*
  - **Coaching-360** (Coachings): **sole coaching-create owner** + all coaching management (token rotate,
    suspend/activate/delete, roster, allocation, per-coaching AI, activity). *No coaching action elsewhere.*
  - **AI Cost Center** (AI): all AI cost/abuse governance + inline throttle remediation; by-user / by-coaching /
    by-feature aggregations derived client-side from `ai?action=usage`.
  - **Revenue Center** (Revenue): revenue intelligence + grant history + revenue CSV export.
  - **Operations Center** (Operations): diagnostics/health, security, Firestore, campaigns (broadcast + history),
    exports, cleanup (orphan duels + pending purge), audit feed.
  - **Command Center**: alerts, snapshot, activity, **and the sole write-owner of the Emergency Controls** (below).

  Adding a second entry point for an existing capability is a governance violation — extend the owner instead. The
  legacy Payments / Inactive / Security / Firestore-ops / Exports / Notifications / System **view files** and the
  overlay User-360 drawer were **deleted** in ADR-022; do not reintroduce a parallel screen for a Center's capability.
- **Global Search is a governance primitive (ADR-020).** All "search anything" goes through ONE server-side
  action (`system?action=search`) — never a client fetch-all. New searchable entities (payments, questions, AI,
  audit) are added as `scope`s on that action, not as new endpoints/clients. It is the single ecosystem search
  surface and must stay within the function budget.
- **Emergency Controls are break-glass infrastructure (ADR-021).** Maintenance mode, AI kill switch, and payment
  kill switch are **permanent platform governance**. They are toggled ONLY via the audited admin path
  (`system?action=config-set` → `config/*` + `auditLogs`), and the student app MUST honor them
  (`aiService`/`paymentService`/boot). Any new "protected operation" (a new AI feature, a new paid flow, a new
  user-facing surface) must check the relevant flag before executing. Removing or bypassing an enforcement check
  is a governance violation. Toggling a kill switch in production is an operational action — record why.
  - **Single write-owner = the Command Center (ADR-022).** The toggles live in exactly one place for fast incident
    response. The AI Cost Center and Operations Center surface the **read-only live state** with a "Manage in
    Command Center" link — never a second toggle. This is the one-owner rule applied to break-glass controls.
- **Per-user AI throttle (ADR-022).** A super-admin can cap a single user's daily AI requests
  (`users?action=throttle` → `users/{uid}.aiThrottle.cap`). main-app honors it in `api/ai.js` via
  `aiService.enforceAiThrottle` (transactional daily counter; fails open on a read glitch so a non-throttled user is
  never blocked). It is set/cleared only from **User-360** or the **AI Cost Center** (the two AI-cost owners).
- **Every admin screen must answer** what-happened / what's-happening / what-needs-attention / what-action, with
  **inline remediation** (no navigate-away to act) and audited destructive actions (type-`DELETE` + server
  `confirm:'DELETE'` + `auditLogs`). Alerts are acknowledgeable + drill-downable, not read-only.
