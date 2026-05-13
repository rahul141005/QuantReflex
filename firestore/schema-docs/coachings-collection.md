# Firestore — Coachings Collection (`coachings`)

> Coaching institute registry managed by the Super Admin ecosystem.

---

## Collection Path

```
coachings/{coachingId}
```

Where `{coachingId}` is a unique uppercase identifier (e.g., `IMS_NAGPUR_01`).

## Document Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `coachingId` | string | ✅ | Unique ID (uppercase, underscored). Must match document ID. |
| `name` | string | ✅ | Display name (e.g., "IMS Nagpur") |
| `createdAt` | string | ✅ | Creation timestamp (ISO 8601) |
| `studentCount` | integer | ❌ | Aggregated student count (may be stale) |

## Relationships

- Users reference coaching via `users/{uid}.coachingId = coachingId`
- Bulk entitlement operations query: `users WHERE coachingId == targetId`
- Student count is aggregated on-demand, not real-time

## Write Authority

- **Super Admin Panel**: Creates coaching institutes via `/api/admin/coachings`

## Read Authority

- **Super Admin Panel**: Lists all coachings via `/api/admin/coachings`
- **Future Coaching Admin**: Will read its own coaching document and associated students
