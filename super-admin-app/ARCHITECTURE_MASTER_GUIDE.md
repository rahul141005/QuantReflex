# QuantReflex: Master Ecosystem Intelligence & Architecture Overview

This document serves as the definitive technical and architectural master guide for the **QuantReflex** ecosystem. It maps the exact current state of the main PWA application (`app.quantreflex.com`) and provides the architectural blueprint for building the Super Admin App (`dev.quantreflex.app`) into the same secure, modular ecosystem.

---

## 1. COMPLETE APP OVERVIEW

**What it is:**
QuantReflex is a premium, mobile-first educational SaaS PWA focused on mental math, aptitude preparation (CAT, MBA CET, SSC), and cognitive speed training.

**Core Functionality:**
- Procedurally generated practice engines (Quick Drill, Reflex Drill, Timed Test, Focus Training, Review Mistakes).
- Adaptive difficulty progression based on real-time speed/accuracy profiling.
- AI-driven explanations, study plans, and interactive coaching.

**Product & Monetization Philosophy (v2):**
- **Free Tier:** Strictly capped at a 20-question daily limit to encourage conversion. 5 lifetime AI explanation credits.
- **Premium Tier (₹349/6mo, ₹499/12mo):** One paid tier that includes everything — unlimited practice, all modes, the full AI suite (explanations, coach, study plans, word problems), Math Duel, and deeper analytics. Admins can also grant custom-duration trials.

> Canonical entitlement model: [`docs/BIBLE/PAYMENT_ARCHITECTURE.md`](../docs/BIBLE/PAYMENT_ARCHITECTURE.md). Access resolves through `users/{uid}.plan` (`'free'|'premium'`).

**Architecture Philosophy:**
Extremely lightweight, zero-bloat vanilla web stack. No React, no Vue, no Tailwind (in the main app). It relies on pure HTML, Vanilla JS, CSS variables, and native DOM APIs, achieving sub-second load times and native app-like fluidity.

---

## 2. FRONTEND ARCHITECTURE

**Technology Stack:** HTML5, CSS3, Vanilla JavaScript (ES5/ES6 hybrid for maximum browser compatibility).

**Folder Structure:**
```text
/
├── index.html           # The SPA shell (contains all views/modals hidden by default)
├── css/
│   └── style.css        # Monolithic stylesheet with CSS variables for theming
├── js/
│   ├── app.js           # Core initializer, routing bootstrap, auth listener
│   ├── router.js        # Hash-based SPA router
│   ├── auth.js          # Client-side Firebase auth handlers
│   ├── drill-engine.js  # The core state machine for active practice sessions
│   ├── questions.js     # Procedural question generation logic
│   ├── paywall.js       # Premium gating and Razorpay checkout flow
│   ├── ai-features.js   # Client-side AI interactions
│   ├── state/
│   │   └── store.js     # Canonical Singleton state management (AppState)
│   ├── services/        # Extracted domain logic (scoring, sharing, adaptive)
│   ├── controllers/     # View-specific orchestration (practice-modes.js)
│   └── views/           # UI rendering layers (home-view.js, stats-view.js)
└── service-worker.js    # Offline caching and PWA logic
```

**Modularity & Rendering Philosophy:**
The app uses a functional modular approach. Views (e.g., `home-view.js`) export `init()` and `render()` functions. Controllers (`practice-modes.js`) wire DOM elements to services. There is no virtual DOM; raw DOM manipulation (`innerHTML`, `classList`) is used strategically for maximum performance.

---

## 3. APPSTATE / STATE MANAGEMENT

**State Architecture:**
The app implements a Singleton pattern via `AppState` (`js/state/store.js`). This is the centralized authority for synchronous local data.

**Persistence Flow:**
1. Components read strictly from `AppState.get*()`.
2. `AppState` reads from `localStorage`, prioritizing canonical `qr_*` keys but gracefully falling back to legacy `quant_*` keys to prevent data loss for older users.
3. Mutations invoke `AppState.set*()`, which writes synchronously to `localStorage` and asynchronously queues an update to `FirestoreSync`.

**Session Handling & Reset Logic:**
To guarantee cross-user data isolation, logging out triggers `AppState.clearAll()`, which explicitly purges every single related `localStorage` key. `FirestoreSync.resetSyncState()` is called to drop any in-flight writes belonging to the previous session.

---

## 4. AUTHENTICATION SYSTEM

**Architecture:** Firebase Authentication (Email/Password).

**Flow:**
1. **Signup:** Username is collected, normalized (`lowercase`, `alphanumeric`), and validated. Firebase Auth account is created.
2. **Initialization:** `auth.js` detects the new user. `FirestoreSync` intercepts the empty state and creates a safe default root document in Firestore. The Onboarding overlay (`onboarding.js`) triggers.
3. **JWT Verification:** Client-side Firebase SDK handles token refresh. All server-side Vercel API calls (`/api/*`) send the raw ID token via `Authorization: Bearer <token>`, which is strictly verified via Firebase Admin SDK.

---

## 5. FIRESTORE ARCHITECTURE

**Root Document: `users/{uid}`**
Acts as the immediate source of truth for the session.
- `profile`: name, username, createdAt.
- `settings`: theme, audio, dailyGoal.
- `stats`: totalAttempted, streaks.
- `plan`, `planType`, `planExpiry`, `planSource`, `isTrial`, `trialEnd`.

**Subcollections (The Scalability Layer):**
To prevent massive document payload sizes on every load, analytical data is shunted to subcollections:
- `users/{uid}/performance/overall`: Streaks, aggregate accuracy.
- `users/{uid}/practice/data`: Array of mistaked questions and saved bookmarks.
- `users/{uid}/ai/usage`: Hard quota limits (word problems used).

**Sync Philosophy:**
`FirestoreSync` acts as a debounced, optimistic sync layer. Local writes batch for 2000ms before flushing to Firestore via `merge: true`. During active drills, syncing is entirely deferred to prevent API amplification, flushing once on drill exit.

---

## 6. PAYMENT + ENTITLEMENT ARCHITECTURE

**Monetization Engine:** Razorpay.

**Architecture (Strict Backend Authority):**
1. **Initiation:** User clicks upgrade. Client requests `/api/payment/create-order` with JWT.
2. **Order Creation:** Backend verifies JWT, generates a Razorpay order, injects server-side secrets (`RAZORPAY_KEY_SECRET`), and returns `orderId`.
3. **Client Checkout:** Razorpay UI opens natively. User pays.
4. **Verification (Critical):** Client sends payment signature to `/api/payment/verify`. Backend cryptographically verifies the signature + binds the order to the caller. **If valid, the Backend (Firebase Admin) runs `aiService.activatePremium` to set `plan:'premium'` (+ planType/planExpiry).**
5. **Client Sync:** Client detects success, triggers `FirestoreSync.activatePremium`, and updates UI.

---

## 7. AI SYSTEM ARCHITECTURE

**Endpoints (`/api/ai/*`):**
Serverless Vercel functions utilizing the OpenAI SDK.
- `explain`: Basic step-by-step breakdown.
- `coach`: Interactive, conversational Socratic tutoring.
- `study-plan`: Generates a JSON-structured curriculum based on weak categories.

**Quota Philosophy:**
Free tier AI usage is tracked via local `localStorage` credits (e.g., 5 lifetime explanations). High-value, token-heavy operations (like Word Problem Generation) strictly read/write `ai/usage` via Firestore Admin transactions to prevent client-side bypasses.

---

## 8. SECURITY PHILOSOPHY

**Backend/Frontend Separation:**
- The frontend (`js/`) is considered **hostile and zero-trust**.
- No API keys (Razorpay Secret, OpenAI, Firebase Admin) exist in the frontend.
- All premium features, AI access, and payment verifications are validated by Vercel functions.
- Firestore Security Rules restrict reads/writes strictly to `request.auth.uid == resource.id`.

---

## 9. UI/UX PHILOSOPHY

**Design Language:** Premium, Minimal, SaaS, Mobile-First.
- **Aesthetic:** Clean white/off-white backgrounds (`#f8fafc`), deeply subtle drop shadows (`0 4px 24px rgba(0,0,0,.08)`), and soft corner radii (`1.25rem` cards). 
- **Typography:** Modern, readable, varying weights for clear hierarchy.
- **Layout:** Everything is mobile-centered. Max-width constraints (`480px` for main cards) ensure desktop users see a focused, app-like center column rather than a blown-out UI.
- **Interaction:** Extensive use of micro-animations (e.g., `fade-in`, button active states scaling to `0.96`, custom numpad haptic simulations).

*The Super Admin App MUST inherit this clean, unbloated, spacing-heavy design philosophy.*

---

## 10. PWA + MOBILE ARCHITECTURE

**Caching Philosophy (`service-worker.js`):**
- **Static Assets:** Aggressively cached (`index.html`, `style.css`, `sounds/*`, `icons/*`) for instant offline loads.
- **API/Dynamic:** Bypassed completely. Requests to `/api/` or Firebase CDNs go straight to the network to ensure auth integrity and fresh data.
- **Routing:** Deep linking is supported offline by serving the cached `index.html` for any navigation request.

---

## 11. WORD-PROBLEM + QUESTION SYSTEM

**Current Architecture:**
Highly efficient procedural generation (`questions.js`) using random integer boundaries to generate thousands of unique calculation combinations on the client side instantly.

**Future Integration Requirement (Centralized Question Bank):**
To scale into complex aptitude preparation (CAT/SSC), the ecosystem requires a centralized, database-driven Question Bank.
- **Admin Role:** The Admin Panel will draft, tag, and approve complex word problems.
- **Client Fetching:** The main app will fetch approved questions dynamically from Firestore, cache them locally (IndexedDB/localStorage), and inject them into the `drill-engine` seamlessly alongside procedural questions.

---
---

## 12. SUPER ADMIN APP INTEGRATION REQUIREMENTS (`dev.quantreflex.app`)

**The Connection Strategy:**
The Super Admin App will operate as a sibling application to the main QuantReflex PWA.

1. **Shared Firebase Project:** Both apps use the same Firebase Authentication and Firestore database.
2. **Role Philosophy:** An Admin is simply a Firebase user with a Custom Auth Claim (`admin: true`). The main app ignores this claim. The Admin app and the Vercel backend strictly require it.
3. **API Access:** The Admin app will rely heavily on new Vercel serverless endpoints (`/api/admin/*`) to perform privileged operations (e.g., querying across all users, modifying premium states) using the Firebase Admin SDK.

---

## 13. RECOMMENDED SUPER ADMIN APP STRUCTURE

To maintain ecosystem continuity and eliminate context-switching friction for developers, `dev.quantreflex.app` should use the exact same **Vanilla Web Stack** philosophy.

**Folder Structure Blueprint:**
```text
/admin
├── index.html           # Admin SPA shell (Sidebar + Main Content Area)
├── css/
│   └── admin-style.css  # Inherits premium aesthetic from main app
├── js/
│   ├── app.js           # Admin router and initialization
│   ├── auth.js          # Validates 'admin: true' custom claim
│   ├── api.js           # Wrapper for fetching from /api/admin/* endpoints
│   ├── components/      # UI builders (TableBuilder, ModalBuilder, Charts)
│   ├── views/
│   │   ├── dashboard.js # Top-level metrics
│   │   ├── users.js     # User CRM view
│   │   ├── questions.js # Question Bank CRUD
│   │   └── system.js    # AI logs and monetization
│   └── state.js         # Lightweight local state management
```

---

## 14. REQUIRED ADMIN FEATURES (IMPLEMENTATION GUIDANCE)

**1. Dashboard & Analytics**
- **UI:** Top-level stat cards (Total Users, Active Premium, AI Tokens Used).
- **Backend:** Cron job or aggregate endpoint in Vercel to efficiently calculate DAU/MAU without reading 100,000 documents client-side.

**2. User Management (CRM)**
- **UI:** Search bar (by username/email). Table view of users.
- **Features:** "View Progress", "Clear Data", "Send Password Reset".
- **Backend:** `/api/admin/search-users` utilizing Firebase Admin `listUsers` and Firestore queries.

**3. Premium & Trial Controls**
- **UI:** Detail pane for a specific user.
- **Features:** Grant Premium (6m/12m), grant a custom-duration trial, or revoke — sets the `plan` fields for customer support.
- **Backend:** `/api/admin/grant-premium` to safely update Firestore without client-side spoofing.

**4. Question Bank Management (Crucial)**
- **UI:** A rich data table and form interface. Fields: Question Text, Options A/B/C/D, Correct Option, Category, Difficulty, Tags.
- **Features:** "Draft", "Publish", "Archive" workflows.
- **Backend:** Direct Firestore writes to a new `/questions` root collection.

**5. AI Usage Monitoring**
- **UI:** Live log or aggregate chart of OpenAI API calls.
- **Features:** Ability to identify heavy users, flag abuse, and reset quotas manually.

---

## 15. FINAL ECOSYSTEM SUMMARY

**The Ecosystem Master Plan:**
QuantReflex is transitioning from an isolated, client-heavy procedural trainer into a centrally managed, serverless educational platform. 

The main app (`app.quantreflex.com`) remains an ultra-fast, local-first practice environment. It uses Vercel strictly for transactional security (Payments, AI) and Firestore for cross-device state synchronization.

The future Super Admin App (`dev.quantreflex.app`) will serve as the operational command center. By mirroring the Vanilla JS architecture and minimal SaaS aesthetic, it will ensure technical consistency and maintainability. It will interact with the database purely through secure, admin-gated Vercel endpoints, guaranteeing that the high-speed performance of the main app is never compromised by administrative bloat.

**Scaling & Maintainability Philosophy:**
- **Zero-Bloat:** If it can be done natively, do it natively.
- **Serverless Authority:** The frontend displays data; the backend dictates truth.
- **Isolation:** Admin logic stays entirely out of the main app bundle.
- **Offline First:** The main app remains capable of functioning without a connection, gracefully degrading AI and Payment features until the connection is restored.
