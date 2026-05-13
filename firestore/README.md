# Firestore Rules & Indexes

> Future home for Firestore security rules and index definitions.

## Current Rules

See `schema-docs/users-collection.md` for the current security rules in use.

## Structure

```
firestore/
├── rules/
│   └── firestore.rules       ← Security rules (to be exported from Firebase Console)
├── indexes/
│   └── firestore.indexes.json ← Composite index definitions
├── schema-docs/               ← Collection schema documentation
├── migrations/
│   └── README.md              ← Migration procedures
└── seed-data/
    └── README.md              ← Seed data documentation
```
