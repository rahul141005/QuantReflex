# QuantReflex Security Architecture

**Doc Version:** 1.3 · **Security Version:** 2.4 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth for authentication, authorization, Firestore rules, secrets, and abuse controls.
**Last updated:** 2026-06-12
**Change control:** Any change to rules, auth middleware, claims, CORS, rate limiting, or secret handling follows [GOVERNANCE.md](GOVERNANCE.md), updates this document + [CHANGELOG.md](CHANGELOG.md), and bumps the Security Version in [VERSIONS.md](VERSIONS.md).

Companion: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md)

---

## 1. Trust Model

**The frontend is hostile.** The client Firebase SDK is zero-trust: every protected action is re-validated server-side. The **Admin SDK is the trust boundary** — it bypasses Firestore rules and performs all privileged writes (entitlement grants, account creation, payment processing, admin mutations).

Authorization is decided in two places, both server-side:
1. **Firestore Security Rules** — gate the client SDK.
2. **Serverless middleware** — gate `/api/*` (token verification + claim/entitlement checks).

Client-held flags (`_memoryCache`, localStorage) are **display-only**; mutating them changes UI, never access.

## 2. Identity & Roles

| Role | Claim(s) | Granted by | Gates |
|---|---|---|---|
| Student | (none) | self-register | main-app |
| Coaching admin | `coaching_admin:true` + `coachingId` | coaching `auth?action=register` (one-time token) | coaching-admin-app |
| Platform admin | `admin:true` | Firebase console / admin tooling | super-admin-app |

The single entitlement claim `premium` is set server-side after payment (`claimsService.setEntitlementClaims`). It is a **fast-path optimization only**; Firestore (`plan`) is the source of truth, so a stale/missing claim never wrongly grants access — it only delays propagation (client force-refreshes the token post-payment).

## 3. Authentication Flows

- **Signup:** server-only via `POST /api/auth/register` (Admin `createUser` + atomic batch + custom token). Client `create` on `users/{uid}` is denied by rules. Password ≥ 8 chars, email regex.
- **Login / reset / multi-device:** Firebase Auth defaults (no custom code).
- **Logout / user switch:** `resetSyncState()` purges in-memory + localStorage and guards against cross-user write leakage (`_syncGeneration`, `qr_last_uid`).
- **Coaching active-state gate (audit M4, fixed 2026-06-11):** signup, claim-coaching, and validate-coaching all gate on the canonical `isCoachingActive()` helper (`status==='active'`, else `isActive!==false`). Previously claim/validate only rejected `status==='expired'` (never written), so a `suspended`/`deleted` coaching could be claimed. Now uniformly rejected.

## 4. Firestore Rules (`firestore/rules/firestore.rules`)

Authoritative summary (rules file is canonical; keep this table in sync):

| Collection | Read | Create | Update | Delete |
|---|---|---|---|---|
| `users/{uid}` | owner | denied (server-only) | owner + `entitlementFieldsSafe()` | denied |
| `users/{uid}/{sub}/{doc}` | owner | owner | owner | owner |
| `questions` | any authed | — | denied (admin) | denied |
| `coachings/{id}` | coaching member (claim match) | — | denied (admin) | denied |
| `duels/{id}` | participant \| joinable status \| target | authed creator, valid initial status | participant/joiner + `validDuelUpdate()` | denied (soft-delete) |
| `payments/{id}` | owner | denied (admin) | denied (admin) | owner |
| `auditLogs/{id}` | `admin:true` only | **denied** | **denied** | **denied** (Admin-SDK-write only; immutable) |
| `securityEvents/{id}` | `admin:true` only | **shape-validated** `validSecurityEvent()` — key allowlist, `type` allowlist, `createdAt == request.time`, capped strings; **unauthenticated create allowed** (failed logins have no auth) | **denied** | **denied** (append-only; ADR-018, see §6 SEC1) |
| `aiInsights`/`aiStudyPlans` | owner | denied (admin) | denied (admin) | owner |
| `config/maintenance` (ADR-021) | **anyone** (must render pre-auth) | **denied** (Admin-SDK only) | **denied** | **denied** |
| `config/aiKillSwitch` · `config/paymentKillSwitch` (ADR-021) | authed users (client enforces) | **denied** (Admin-SDK only) | **denied** | **denied** |
| `config/aiBudget` (+ any other `config/*`) | **denied** (Admin-SDK only) | **denied** | **denied** | **denied** |
| `notificationLogs`/`scheduledNotices` | denied | denied | denied | denied |
| `duelInvitations` | denied | denied | denied | denied |
| default `**` | denied | denied | denied | denied |

### 4.1 Entitlement field protection
- **Update:** `entitlementFieldsSafe()` (v2) — protected fields may change only to downgrade values: `plan`→`'free'`; `planType`/`planExpiry`/`planSource`/`trialEnd`→`null`; `isTrial`→`false`. Prevents browser-console self-grant while allowing client-side expiry self-heal.
- **Create:** `entitlementCreateSafe()` — all entitlement fields must start at safe defaults (moot today since client create is denied, but retained as defense-in-depth).

### 4.2 Duel state machine
Forward-only transitions; terminal states (`completed/expired/abandoned/deleted/rejected/cancelled`) are final. Immutable fields (`createdBy, id, config, questions, questionIds`) enforced. Participants may only modify their own entry (`participants.diff(...).hasOnly([uid])`).

**Known low-severity note:** any authenticated user can read a `waiting`/`waiting_for_acceptance` duel doc (needed for join), exposing `participants`/`questionIds`. Tracked (audit LOW). Tighten to participant/target-only if duel content becomes sensitive.

## 5. Serverless Authorization

| Wrapper | File | Requires | Sets | Rate limit |
|---|---|---|---|---|
| `withAuth` | main-app `_lib/middleware.js` | valid ID token | `req.userId/userPremium` (v2: single flag) | 20/hr/user (per-instance, in-memory) |
| `withAdminAuth` | main-app `_lib/middleware.js` | `admin:true` | `req.userId` | — |
| `withAdminAuth` (super-admin) | super-admin `_lib/middleware.js` | `admin:true` | `req.userId` + `req.adminUid` | **30/hr/admin** (audit M5/M6 — now applied to ALL super-admin endpoints) |
| `withAdmin` (super-admin) | super-admin `_lib/firebase-admin.js` | — | — | thin re-export of `withAdminAuth` (audit M5) |
| `withCoachingAuth` | coaching `_lib/middleware.js` | `coaching_admin:true` + `coachingId` | `req.userId/coachingId` | — |

**Resolved (audit M5, 2026-06-11):** super-admin converged on a single wrapper — `_lib/middleware.js#withAdminAuth` (rate-limited, sets both `req.userId` and `req.adminUid`); `firebase-admin.js#withAdmin` re-exports it. Previously the sensitive endpoints (entitlements, payments, coachings) had **no** rate limit — only `questions.js` did. Now all do.

### 5.1 CORS
- main-app: strict allowlist (`quantreflex.app`, `dev.…`, `admin.…`, localhost in non-prod).
- `register`, `withAdmin`, coaching middleware currently send `Access-Control-Allow-Origin: *`. Acceptable where a Bearer token is still required, but `register` is unauthenticated → see §6.

### 5.2 Admin Permissions & Audit Logging (Super Admin Control Center)
Every privileged operation runs through a `super-admin-app/api/admin/*` endpoint wrapped by `withAdminAuth`
(token + `admin:true` claim + 30/hr/admin). The `admin:true` claim is granted only via Firebase console /
admin tooling (never self-granted). **Every admin mutation writes one immutable `auditLogs` row** via the
shared `super-admin-app/api/_lib/audit.js#writeAuditLog` (it never throws, so a logging failure cannot fail
the action). Captured: `actorUid`, `actorEmail` (now set on `req.adminEmail` by `withAdminAuth`), `action`,
`category`, `targetType`, `targetId`, `summary`, and `before`/`after` snapshots. `auditLogs` is
**append-only**: client read requires `admin:true`; client create/update/delete are denied by rules (only
the Admin SDK writes, and it never updates/deletes). The per-user `users/{uid}/entitlementLogs` subcollection
is retained for the user-360 view; entitlement grants write to both. (ADR-012.)

### 5.3 Destructive-Action Protection
Revokes, coaching suspend/delete, and user lifecycle actions all record `before`/`after` in `auditLogs` and
route through the Control Center — **never** direct Firestore-console mutation (ADR-012). **User lifecycle
(Phase 2, ADR-014):** *suspend* and *archive* (soft-delete) set `accountStatus` **and disable the Firebase
Auth user** — the real access gate (a disabled user cannot obtain a valid token, so suspension is enforced at
auth regardless of the Firestore field). *Archive* sets a 30-day `purgeAfter` hold and is reversible via
*restore*. *Purge* (hard delete: Auth user + Firestore doc + subcollections + related `payments`/`aiInsights`/
`aiStudyPlans`) requires the caller to pass `confirm:'DELETE'` server-side (the UI additionally requires
typing `DELETE` + a double-confirm). The `cleanup-sweep` cron only ever hard-purges archived users whose hold
has expired (never active users). Bulk writes are chunked (≤200–500/batch) and logged as a single action row
carrying the affected count in `summary`.

### 5.4 Cron Authorization
`super-admin-app/api/cron/*` endpoints (e.g. `daily-snapshot`) are **not** wrapped by `withAdminAuth` (no
admin user is present). They are gated by a `CRON_SECRET` env secret: the request must present it
(`Authorization: Bearer <CRON_SECRET>`), compared with a constant-time check; missing/incorrect → 401. Vercel
Cron sends this header. These endpoints only read + write admin-only analytics docs (`metrics/*`), never user
data mutations.

## 6. Abuse Controls & Hardening Backlog

| ID | Control | State | Action |
|---|---|---|---|
| H3 | `/api/auth/register` rate limit | **Fixed 2026-06-11** — per-IP in-memory limit (10/hr/IP) added; CORS `*` retained | For a hard global cap, add App Check / captcha / shared counter |
| H2 | AI word-problem quota atomicity | **Fixed 2026-06-11** — `consumeWordProblemQuota` now Firestore-transactional, returns granted count | — |
| SEC1 | `securityEvents` capture (Phase 5, ADR-018) | **Added 2026-06-12** — client-side failed-login / suspicious-access / admin-login + server-side payment-failure events into an append-only collection; hardened rule `validSecurityEvent()` (key allowlist, `type` allowlist, server-clock `createdAt`, **SHA-256 `emailHash` only — no raw email/password**, size caps, admin-only read, immutable) | Abuse surface is **bounded** (no PII, no backdating, no reads, fixed shape) and login-event volume is throttled by Firebase Auth's own `auth/too-many-requests`. **Enabling App Check (M7) is the hardening follow-up** to attest the unauthenticated create. |
| M6 | Global rate limiting | per-instance only (now applied uniformly across user/admin/register) | **Infra task** — a true global cap needs a Firestore/Redis shared counter or App Check; not a code defect. |
| M7 | Firebase App Check | **not enabled** | **Infra/console task** — enable in Firebase console + add SDK init; not fixable in repo logic alone. **Also the hardening follow-up for the Phase-5 `securityEvents` unauthenticated-create rule (SEC1).** |
| — | Duel `waiting` read scope | broad | tighten if content sensitive |

**`securityEvents` write-path rationale (ADR-018).** Firebase Spark has no Auth-trigger Cloud Functions, so a
failed login (which happens with `request.auth == null`) can only be captured by a **client-side write**. We
chose a *direct* client write into `securityEvents` over a public per-IP-rate-limited serverless endpoint to
honour the Vercel-Free zero-new-function rule (ADR-017) and because a server endpoint would consume the same
Spark Firestore write quota anyway. Abuse is bounded by the hardened create rule (`validSecurityEvent()`):
unauthenticated callers may only append well-shaped, server-timestamped, PII-free docs they cannot read back.
Residual risk (write-quota flooding while App Check is off, M7) is accepted pre-launch: the Security Center
treats `emailHash`/`reason` as untrusted, and Firebase Auth throttles the underlying login attempts. The
documented upgrade path is **App Check (M7)** + optionally moving the write behind the existing public-endpoint
pattern (`main-app/api/auth/register.js`) once a function slot is justified.

## 6A. Emergency Controls & Config (ADR-021)

Break-glass governance flags live in central Firestore config docs and are the single source of truth:
`config/maintenance {enabled, message?, updatedBy, updatedAt}`, `config/aiKillSwitch {enabled, …}`,
`config/paymentKillSwitch {enabled, …}`.

- **Who may toggle:** only `admin:true` via the Admin SDK, through the audited `system?action=config-set`
  endpoint (writes the config doc + one immutable `auditLogs` row, category `system`). The client SDK can **never**
  write `config/*` (`allow write: if false` for all config docs).
- **Read scope (why these are client-readable):** the student app must read the flags to enforce them.
  `config/maintenance` is world-readable (`allow read: if true`) so the maintenance screen can render even
  pre-auth; `config/aiKillSwitch` + `config/paymentKillSwitch` are readable by authenticated users
  (`allow read: if request.auth != null`) since they gate authenticated operations. They are non-sensitive
  booleans. `config/aiBudget` (and any future non-flag config) has **no** client read rule — Admin-SDK only.
- **Enforcement points (main-app):** `aiService` checks `config/aiKillSwitch` before any OpenAI call (covers
  `api/ai.js` explain/insights/study-plan); `paymentService`/`api/payment.js` checks `config/paymentKillSwitch`
  before creating a Razorpay order; the client checks `config/maintenance` on boot and blocks core learning with
  a maintenance screen for non-admins. Flags are short-TTL cached. New protected operations MUST add the
  matching check (GOVERNANCE).
- **Trust note:** enforcement is defense-in-depth via the client + the serverless layer (Admin SDK reads the
  same docs). A determined client that bypasses the JS check still cannot grant itself anything — the kill
  switches only *block*; they never widen access.

**Global Search auth (ADR-020):** `system?action=search` is `withAdminAuth`-gated (admin-only) like every other
`admin/*` action; it performs server-side prefix queries (no client fetch-all) and never returns more than a
capped result set per entity.

## 7. Secrets

**Server-only env (Vercel; never committed):** `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT` (JSON). `.gitignore` excludes `.env*` and service-account files.

**Public by design:** Firebase web config (access controlled by rules, not key secrecy), Razorpay **key-id** (`rzp_live_…`, client checkout). The Razorpay **secret** and webhook secret are server-only.

**Verified clean:** no server secrets found in the repository.

## 8. Payment-Security Cross-Reference

Signature verification, webhook HMAC, idempotency, and order→caller binding are documented in [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md). Security-relevant rule: **premium is only ever granted by Admin SDK after server-side verification.**

## 9. Change Log Pointer
Security-affecting changes are dated in [CHANGELOG.md](CHANGELOG.md) with the finding ID and file:line.
