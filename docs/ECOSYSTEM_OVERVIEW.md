# QuantReflex Ecosystem Overview

> Complete architectural reference for the QuantReflex educational SaaS ecosystem.

---

## What is QuantReflex?

QuantReflex is a premium, mobile-first educational SaaS platform focused on mental math and quantitative aptitude training for competitive exams (CAT, MBA CET, SSC, GMAT).

## Ecosystem Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    QuantReflex Ecosystem                     │
├─────────────────┬──────────────────┬────────────────────────┤
│   Main App      │  Super Admin     │  Coaching Admin        │
│   (Student)     │  (Operations)    │  (Institute)           │
│                 │                  │                        │
│   quantreflex   │  dev.quantreflex │  admin.quantreflex     │
│   .app          │  .app            │  .app                  │
├─────────────────┴──────────────────┴────────────────────────┤
│                    Vercel Serverless                         │
│         /api/ai/*    /api/payment/*    /api/admin/*          │
├─────────────────────────────────────────────────────────────┤
│                    Firebase Backend                          │
│         Auth  ·  Firestore  ·  Admin SDK                    │
├─────────────────────────────────────────────────────────────┤
│                  External Services                          │
│            Razorpay  ·  OpenAI GPT-4o-mini                  │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no frameworks) |
| State | AppState singleton (localStorage + Firestore sync) |
| Auth | Firebase Authentication (Email/Password) |
| Database | Cloud Firestore |
| Payments | Razorpay (Orders API, one-time payments) |
| AI | OpenAI GPT-4o-mini via Vercel serverless |
| Hosting | Vercel (static + serverless) |
| PWA | Service Worker with offline cache |

## App Responsibilities

### Main App
- Student practice engine (Quick Drill, Reflex Drill, Timed Test, Focus Training)
- Adaptive difficulty progression
- AI explanations, coaching, and study plans
- Razorpay payment integration
- Progress tracking and statistics
- Onboarding and premium conversion

### Super Admin App
- User management and CRM
- Entitlement management (individual + bulk)
- Coaching institute management
- Question bank CRUD + AI generation
- Payment and entitlement inspection
- AI usage analytics

### Coaching Admin App (Planned)
- Coaching-scoped student monitoring
- Performance analytics
- Assignment management
- Batch operations

## Monorepo Structure

```
quantreflex/
├── main-app/              → Student PWA
├── super-admin-app/       → Admin operations
├── coaching-admin-app/    → Coaching panel (scaffold)
├── shared/                → Ecosystem contracts
├── firestore/             → Firestore documentation
├── docs/                  → This documentation
├── scripts/               → Validation tools
└── .github/               → CI/CD (future)
```

## Key Architecture Principles

1. **App Isolation** — Each app is independently deployable via Vercel
2. **Zero Bloat** — Vanilla web stack, no unnecessary frameworks
3. **Serverless Authority** — Frontend displays data, backend dictates truth
4. **Firestore as Source of Truth** — All ecosystem state in Firestore
5. **Incremental Centralization** — Shared logic extracted only after stabilization
6. **Offline First** — Main app functions without connection (PWA)
7. **ISO 8601 Timestamps** — Universal timestamp format across all apps
