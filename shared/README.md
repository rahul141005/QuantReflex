# QuantReflex — Shared Ecosystem Layer

> Canonical contracts, schemas, and constants shared across all QuantReflex apps.

---

## Purpose

The shared layer centralizes ecosystem-wide contracts to prevent schema drift and ensure consistent behavior across all applications.

## Current Status: Reference-Only (Inline Copies)

> [!IMPORTANT]
> Both apps deploy as **separate Vercel projects** with independent root directories. There is no bundler or cross-app module system. This means:
>
> - Apps **cannot import** from `../shared/` in production
> - Shared utilities exist as **inline copies** within each app
> - This directory serves as the **canonical reference** — the single source of truth for what the shared logic should look like
> - When modifying shared patterns, update **both** inline copies AND this reference

## Inline Copy Registry

The following utilities are duplicated across apps. Each copy contains a comment referencing this canonical source:

| Utility | Main App Location | Admin App Location | Canonical Ref |
|---------|-------------------|-------------------|---------------|
| `_toMillis()` | `paywall.js:41`, `firestore-sync.js:404` | `users.js`, `payments.js` | `constants/entitlements.js` |
| `_escapeHtml()` | `onboarding.js:47` | `users.js:159`, `payments.js:203`, `ai.js:140` | (identical pattern) |
| Firebase Config | `firebase.js:25` | `firebase/firebase.js:16` | (identical config) |
| Entitlement Fields | `firestore-sync.js:329-338` | `api/admin/entitlements.js:42-87` | `constants/entitlements.js` |

## Philosophy

1. **Contracts, not code** — Define what data looks like, not how to process it
2. **Inline copies, not imports** — Until a bundler is introduced, shared code lives inline per-app
3. **Canonical reference** — This directory is the authoritative definition; inline copies must match
4. **Ecosystem-focused** — Only truly cross-app concerns belong here
5. **No app-specific logic** — UI, routing, and app behavior stay in their respective apps

## Structure

```
shared/
├── constants/
│   └── entitlements.js       → Tier names, field names, precedence rules, _toMillis spec
├── schemas/
│   ├── question-schema.json  → Canonical question document schema
│   ├── user-schema.json      → User document schema (users/{uid})
│   └── coaching-schema.json  → Coaching institute document schema
├── entitlements/
│   └── README.md             → Entitlement resolution documentation
├── validation/
│   └── README.md             → Future validation utilities
├── formatting/
│   └── README.md             → Future formatting utilities
└── README.md                 → This file
```

## Future Centralization Roadmap

When both apps are stable and a build step is introduced, extract:

1. **`_toMillis()` helper** — duplicated in `paywall.js`, `firestore-sync.js`, admin views
2. **Firebase config object** — identical across both apps
3. **Entitlement resolution logic** — `canAccess()` / `_getEntitlementState()` parity
4. **`_escapeHtml()` utility** — duplicated 4× across ecosystem
5. **Timestamp formatting utilities** — ISO 8601 parsing/formatting
6. **Topic key normalization** — `_getTopicVariants()` from question-bank-service

### Migration Path

When ready to centralize:
1. Introduce a simple build/copy script that syncs `shared/` into each app's `js/shared/`
2. Update `<script>` tags to load `js/shared/utils.js`
3. Remove inline copies
4. Add to CI validation
