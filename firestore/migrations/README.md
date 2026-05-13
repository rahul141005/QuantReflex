# Firestore Migrations

> Log of schema changes and migration procedures.

## Migration Log

| Date | Description | Status |
|------|-------------|--------|
| 2026-05-13 | Initial monorepo migration — no schema changes | ✅ Complete |

## Procedures

When making schema changes:

1. Document the change in this file
2. Update the relevant schema doc in `schema-docs/`
3. Update `shared/schemas/*.json` to match
4. Test in both Main App and Admin App
5. Deploy changes incrementally (admin first, then main app)
