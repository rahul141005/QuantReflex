# QuantReflex — Shared Ecosystem Layer

> Canonical contracts, schemas, and constants shared across all QuantReflex apps.

---

## Purpose

The shared layer centralizes ecosystem-wide contracts to prevent schema drift and ensure consistent behavior across all applications. This layer is **reference-only** at this stage — apps do not import from it directly yet.

## Philosophy

1. **Contracts, not code** — Define what data looks like, not how to process it
2. **Lightweight** — No framework abstractions or complex utilities
3. **Ecosystem-focused** — Only truly shared concerns belong here
4. **No app-specific logic** — UI, routing, and app behavior stay in their respective apps

## Structure

```
shared/
├── constants/
│   └── entitlements.js       → Tier names, field names, precedence rules
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

Once both apps are stable in the monorepo, the following can be extracted:

1. **`_toMillis()` helper** — duplicated in `paywall.js` and `firestore-sync.js`
2. **Firebase config object** — identical across both apps
3. **Entitlement resolution logic** — `canAccess()` / `_getEntitlementState()` parity
4. **Timestamp formatting utilities** — ISO 8601 parsing/formatting
5. **Topic key normalization** — `_getTopicVariants()` from question-bank-service

> [!IMPORTANT]
> Do NOT extract logic into this layer until both apps have been thoroughly validated in the monorepo. Premature centralization creates coupling risks.
