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
(30/hr), validation, and — critically — an **immutable `auditLogs` entry** (who/when/what/before/after).
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

## Account Deletion Policy (policy now; mechanism in Phase 2)

Accounts are **never instantly hard-deleted** by an admin. The sanctioned flow is **soft-delete → archive
queue → hold → permanent delete**, every step audit-logged:
`inactive 6+ months → flagged → archive queue (status:'archived', archivedAt) → 30-day hold → permanent
delete (Auth user + Firestore doc + subcollections)`. Admin-initiated deletion requires explicit in-UI
confirmation (type `DELETE` + double-confirm). User-initiated deletion (`main-app/api/account/delete`) clears
subcollections today; reconciling it with the archive workflow + Auth-user removal is Phase 2. No deletion
path may skip the `auditLogs` entry. (Mechanism tracked in [ROADMAP.md](ROADMAP.md) Phase 2.)
