# Firestore Collections

> Quick reference for all Firestore collections in the QuantReflex ecosystem.

---

## Collections Overview

| Collection | Description | Managed By |
|------------|-------------|------------|
| `users/{uid}` | User profiles, settings, stats, entitlements | Main App + Admin |
| `questions/{id}` | Centralized question bank | Admin App |
| `coachings/{id}` | Coaching institute registry | Admin App |

## Detailed Documentation

- [Users Collection](../firestore/schema-docs/users-collection.md)
- [Questions Collection](../firestore/schema-docs/questions-collection.md)
- [Coachings Collection](../firestore/schema-docs/coachings-collection.md)
- [Timestamp Strategy](../firestore/schema-docs/timestamp-strategy.md)

## Cross-App Access Patterns

### Main App → Firestore
- **Reads**: Own user document (`users/{uid}`) + question bank (`questions`)
- **Writes**: Own user document only (client-side SDK with security rules)
- **Server writes**: Payment verification → entitlement fields (via Admin SDK)

### Super Admin → Firestore
- **Reads**: All users, all questions, all coachings (via Admin SDK)
- **Writes**: Entitlements, questions, coachings (via Admin SDK)
- **Never**: Direct client-side Firestore writes

### Coaching Admin (Future)
- **Reads**: Users filtered by `coachingId`, own coaching document
- **Writes**: Assignment data (via Admin SDK)

## Firebase Project

Both apps share the same Firebase project: `quant-reflex-trainer`

```
Project ID: quant-reflex-trainer
Auth Domain: quant-reflex-trainer.firebaseapp.com
```
