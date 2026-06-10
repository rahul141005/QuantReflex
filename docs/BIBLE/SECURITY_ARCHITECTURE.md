# QuantReflex Security Architecture

**Doc Version:** 1.0 · **Security Version:** 1.0 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth for authentication, authorization, Firestore rules, secrets, and abuse controls.
**Last updated:** 2026-06-11
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
| `aiInsights`/`aiStudyPlans` | owner | denied (admin) | denied (admin) | owner |
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

## 6. Abuse Controls & Hardening Backlog

| ID | Control | State | Action |
|---|---|---|---|
| H3 | `/api/auth/register` rate limit | **Fixed 2026-06-11** — per-IP in-memory limit (10/hr/IP) added; CORS `*` retained | For a hard global cap, add App Check / captcha / shared counter |
| H2 | AI word-problem quota atomicity | **Fixed 2026-06-11** — `consumeWordProblemQuota` now Firestore-transactional, returns granted count | — |
| M6 | Global rate limiting | per-instance only (now applied uniformly across user/admin/register) | **Infra task** — a true global cap needs a Firestore/Redis shared counter or App Check; not a code defect. |
| M7 | Firebase App Check | **not enabled** | **Infra/console task** — enable in Firebase console + add SDK init; not fixable in repo logic alone. |
| — | Duel `waiting` read scope | broad | tighten if content sensitive |

## 7. Secrets

**Server-only env (Vercel; never committed):** `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT` (JSON). `.gitignore` excludes `.env*` and service-account files.

**Public by design:** Firebase web config (access controlled by rules, not key secrecy), Razorpay **key-id** (`rzp_live_…`, client checkout). The Razorpay **secret** and webhook secret are server-only.

**Verified clean:** no server secrets found in the repository.

## 8. Payment-Security Cross-Reference

Signature verification, webhook HMAC, idempotency, and order→caller binding are documented in [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md). Security-relevant rule: **premium is only ever granted by Admin SDK after server-side verification.**

## 9. Change Log Pointer
Security-affecting changes are dated in [CHANGELOG.md](CHANGELOG.md) with the finding ID and file:line.
