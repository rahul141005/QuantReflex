# QuantReflex — Coaching Admin App

> **Status:** Scaffold — Not yet built  
> **Deploy target:** `admin.quantreflex.app`

---

## Purpose

The Coaching Admin App provides coaching institute administrators with tools to monitor and manage their students within the QuantReflex ecosystem.

## Planned Responsibilities

- **Coaching Analytics** — Performance metrics across all students in a coaching institute
- **Student Monitoring** — Individual progress tracking, drill completion rates, accuracy trends
- **Assignments** — Assign specific practice sessions, topics, or question sets to students
- **Coaching Operations** — Manage student enrollment, transfer students between batches

## Architecture

This app will follow the same Vanilla JS SPA architecture as the Main App and Super Admin App:

- Vanilla HTML/CSS/JS (no frameworks)
- Firebase Auth with coaching-specific custom claims
- Firestore reads scoped to the coaching institute's students
- Vercel serverless API endpoints for privileged operations

## Vercel Deployment

| Setting | Value |
|---------|-------|
| Root Directory | `coaching-admin-app` |
| Build Command | (none — static) |
| Output Directory | `.` |

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK service account JSON |

## Firestore Scope

The coaching admin will read from:
- `users/{uid}` — filtered by `coachingId` matching the admin's institute
- `users/{uid}/performance/overall` — student performance metrics
- `users/{uid}/practice/data` — drill history and mistakes

## File Structure (Planned)

```
coaching-admin-app/
├── index.html
├── css/
│   └── coaching-style.css
├── js/
│   ├── app.js
│   ├── firebase/
│   │   ├── firebase.js
│   │   └── auth.js
│   ├── services/
│   │   └── api.js
│   ├── state/
│   │   └── store.js
│   ├── ui/
│   │   ├── modal.js
│   │   ├── table.js
│   │   └── toast.js
│   └── views/
│       ├── dashboard.js
│       ├── students.js
│       ├── assignments.js
│       └── analytics.js
├── api/
│   └── coaching/
│       ├── students.js
│       ├── analytics.js
│       └── assignments.js
├── icons/
├── manifest.json
├── sw.js
├── package.json
└── vercel.json
```
