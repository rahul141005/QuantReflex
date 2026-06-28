# QuantReflex — Architecture Guide

> Last updated: 2026-05-07 (post Batch 4, SW v72)

## Overview

QuantReflex is a vanilla-JS progressive web app (PWA) for quantitative aptitude training.
No frameworks (React, Vue, etc.) — intentionally lean for a target scale of ~1500 active users.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS + CSS (SPA) |
| State | `AppState` singleton (localStorage with lazy key migration) |
| Auth | Firebase Auth (Google Sign-In) |
| Database | Cloud Firestore |
| Payments | Razorpay (one-time payments, Orders API) |
| AI | OpenAI gpt-4o-mini via Vercel serverless functions |
| Hosting | Vercel (static + serverless) |
| PWA | Service Worker with offline cache |

## Directory Structure

```
Quant-Trainer/
├── api/                      # Vercel serverless functions
│   ├── _lib/middleware.js    # Auth + rate limiting
│   ├── ai/                   # AI endpoints (explain, insights, study-plan, word-problems)
│   └── payment/              # Payment endpoints (create-order, verify)
├── services/                 # Server-side services
│   ├── aiService.js          # OpenAI client + Firestore entitlement checks
│   └── paymentService.js     # Razorpay client + signature verification
├── js/                       # Client-side modules
│   ├── state/store.js        # AppState singleton
│   ├── services/             # Extracted pure-logic services
│   │   ├── adaptive-state.js # Adaptive difficulty state
│   │   ├── scoring-service.js# Scoring, percentiles, tips
│   │   └── share-service.js  # Share card generation
│   ├── controllers/          # Practice configuration + modes
│   ├── views/                # Home, learn, stats view renderers
│   └── ui/                   # Numpad, swipe navigation
├── css/style.css             # Single stylesheet (light + dark mode)
├── index.html                # SPA shell
└── service-worker.js         # Offline cache (version-bumped per deploy)
```

## Script Load Order

Scripts load synchronously in strict dependency order (documented in index.html):

```
Layer 1  — State:       store.js
Layer 2  — Infra:       firebase.js → auth.js → firestore-sync.js
Layer 3  — Services:    adaptive-state.js, scoring-service.js, share-service.js
Layer 4  — Data:        progress.js, questions.js
Layer 5  — Reference:   tables.js, learn-manager.js, knowledge/{schema,registry,blocks}.js, learn/learn-search.js (ADR-069)
Layer 6  — Settings:    settings.js (provides showToast)
Layer 7  — Engine:      drill-engine.js
Layer 8  — Navigation:  router.js
Layer 9  — Features:    paywall.js, ai-features.js, session-manager.js
Layer 10 — Controllers: practice-config.js, practice-modes.js
Layer 11 — UI:          numpad.js, swipe-nav.js
Layer 12 — Views:       home-view.js, learn-view.js, stats-view.js
Layer 13 — Bootstrap:   app.js (must be last)
Deferred — notifications.js, onboarding.js
```

**Rule**: A module may only depend on modules from earlier layers.

## State Management Rules

1. All state reads/writes go through `AppState` (canonical `qr_*` keys)
2. Legacy `quant_reflex_*` keys are migrated lazily on first read
3. `FirestoreSync.loadFromFirestore()` bridges Firestore data → AppState + legacy keys
4. `progress.js` has a session-level `_progressCache` — invalidated on write and Firestore load
5. Adaptive difficulty state goes through `AdaptiveState` module (never write `window._adaptive*` directly)

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Service module | `PascalCase` IIFE | `ScoringService`, `ShareService` |
| State module | `PascalCase` IIFE | `AppState`, `AdaptiveState` |
| Private function | `_camelCase` | `_renderStreakAtRisk` |
| Storage key | `qr_snake_case` | `qr_settings`, `qr_progress` |
| DOM id | `camelCase` | `streakAtRiskBanner`, `dailyQuotaIndicator` |

## API Security

1. All AI endpoints wrapped with `withAuth()` — verifies Firebase ID token
2. Per-user rate limiting: 20 requests/hour/user (in-memory, per serverless instance)
3. All endpoints validate string input lengths (50-500 char caps)
4. Razorpay keys from environment variables only — no hardcoded fallbacks
5. Payment verification uses `crypto.timingSafeEqual` for HMAC comparison
6. Firestore security rules enforce UID-scoped reads/writes

## Deployment

```bash
# Deploy to Vercel (automatic from main branch)
git push origin main

# Manual deploy
npx vercel --prod
```

**Pre-deploy checklist**:
- [ ] Service worker version bumped
- [ ] No `console.log` in hot paths (drill engine)
- [ ] `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` set in Vercel env
