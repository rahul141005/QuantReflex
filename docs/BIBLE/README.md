# QuantReflex Bible — Start Here

This folder is the **permanent source of truth** for the QuantReflex architecture, schema, security,
payments, and business logic. If you are a new contributor or a future Claude session, read these
documents before touching code. They are authoritative over code comments, commit messages, and memory.

## Read in this order

1. **[TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md)** — what the product is, the three apps, services,
   data flow, conventions, and the governance summary.
2. **[FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md)** — every collection, field, path, index, and
   the schema drift register.
3. **[SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)** — auth, roles, Firestore rules, claims,
   secrets, abuse controls.
4. **[PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md)** — Razorpay flows, plans, entitlement grants,
   idempotency.

## Supporting documents

- **[GOVERNANCE.md](GOVERNANCE.md)** — the mandatory doc-first change workflow. **Follow this for
  every change.**
- **[VERSIONS.md](VERSIONS.md)** — version registry (Bible / Architecture / Firestore / Security /
  Payment) and migration notes.
- **[DECISION_LOG.md](DECISION_LOG.md)** — why decisions were made (ADRs).
- **[ROADMAP.md](ROADMAP.md)** — planned work and open technical debt.
- **[CHANGELOG.md](CHANGELOG.md)** — dated record of every change.
- **[PRODUCT_AUDIT.md](PRODUCT_AUDIT.md)** — comprehensive, evidence-backed product/UX/UI audit of the main app
  (findings register + prioritized roadmap). Reference for future feature/polish work.

## The one rule

**No change is complete until the Bible, schema references, API references, and changelog are
synchronized with the code, and the version registry is updated.** See [GOVERNANCE.md](GOVERNANCE.md).

## Related (outside this folder)

- [`../../AUDIT-REPORT.md`](../../AUDIT-REPORT.md) — the founding 2026-06-11 production audit.
- `../../firestore/migrations/` — data migration scripts referenced by VERSIONS/CHANGELOG.

---

**Current versions** — [VERSIONS.md](VERSIONS.md) is the single source of truth; this line is a
convenience copy and must be updated with it: Bible 2.162 · Architecture 2.76 ·
Firestore 2.32 · Security 2.20 · Payment 2.7.
