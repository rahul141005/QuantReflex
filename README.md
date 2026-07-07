# QuantReflex Ecosystem

> A production-grade monorepo for the QuantReflex educational SaaS platform.

QuantReflex is a mental math and quantitative aptitude training ecosystem designed for competitive exam preparation (CAT, MBA CET, SSC, GMAT).

> 📖 **Source of truth: [`docs/BIBLE/`](docs/BIBLE/README.md).** Architecture, schema, security,
> payments, and business logic live there and are the authoritative reference. **Every change must
> follow the governance workflow in [`docs/BIBLE/GOVERNANCE.md`](docs/BIBLE/GOVERNANCE.md)** (Bible-first,
> impact report, implement, verify, changelog, version bump). New contributors and AI sessions: start
> at [`docs/BIBLE/README.md`](docs/BIBLE/README.md).

---

## Monorepo Structure

```
quantreflex/
│
├── main-app/               → Student-facing PWA (quantreflex.app)
│
├── super-admin-app/        → Admin operations panel (dev.quantreflex.app)
│
├── coaching-admin-app/     → Coaching analytics panel (admin.quantreflex.app)
│
├── shared/                 → Shared ecosystem contracts & schemas
│
├── firestore/              → Firestore rules, indexes, schema docs
│
├── docs/                   → Production ecosystem documentation
│
├── scripts/                → Monorepo validation & tooling
│
├── .github/                → CI/CD workflows (future)
│
├── package.json            → Monorepo root scripts
│
└── .gitignore              → Unified ignore rules
```

---

## Apps

### Main App (`main-app/`)
The student-facing progressive web app. Handles practice drills, adaptive training, AI features, payments, and progress tracking.

**Deploy target:** `quantreflex.app`  
**Tech:** Vanilla JS/CSS SPA, Firebase Auth, Firestore, Razorpay, OpenAI  
**Vercel root:** `main-app`

### Super Admin App (`super-admin-app/`)
The administrative control panel. Manages users, entitlements, question bank, coaching institutes, AI analytics.

**Deploy target:** `dev.quantreflex.app`  
**Tech:** Vanilla JS/CSS SPA, Firebase Auth (admin claims), Firestore  
**Vercel root:** `super-admin-app`

### Coaching Admin App (`coaching-admin-app/`)
Future coaching analytics and student monitoring panel.

**Deploy target:** `admin.quantreflex.app`  
**Status:** Functional API (auth, students, dashboard, notices, insights) with a lean UI

---

## Quick Start

```bash
# Install dependencies for all apps
npm run install:all

# Validate monorepo structure
npm run validate

# Validate import paths
npm run validate:imports
```

---

## Deployment

Each app deploys independently via Vercel:

1. Create a Vercel project for each app
2. Set **Root Directory** to `main-app/`, `super-admin-app/`, or `coaching-admin-app/`
3. Configure environment variables per app (see `docs/ENVIRONMENT_VARIABLES.md`)
4. Push to main branch — Vercel auto-deploys

---

## Documentation

See the `docs/` directory for complete ecosystem documentation:

- [Ecosystem Overview](docs/ECOSYSTEM_OVERVIEW.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Firestore Collections](docs/FIRESTORE_COLLECTIONS.md)
- [Entitlement System](docs/ENTITLEMENT_SYSTEM.md)
- [Question Schema](docs/QUESTION_SCHEMA.md)
- [Environment Variables](docs/ENVIRONMENT_VARIABLES.md)
- [Synchronization Philosophy](docs/SYNCHRONIZATION_PHILOSOPHY.md)

---

## Architecture Principles

1. **App Isolation** — Each app is independently deployable and testable
2. **Zero Bloat** — Vanilla web stack, no unnecessary frameworks
3. **Serverless Authority** — Frontend displays, backend dictates truth
4. **Firestore as Source of Truth** — All schema contracts centralized
5. **Incremental Centralization** — Shared logic extracted only after stabilization
