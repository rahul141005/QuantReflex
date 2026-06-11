# Firestore — Questions Collection (`questions`)

> Centralized question bank managed by the Super Admin ecosystem.

---

## Collection Path

```
questions/{auto-id}
```

## Document Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | string | ✅ | — | Question type. Currently only `'word_problem'` |
| `topic` | string | ✅ | — | Topic category (e.g., `'profit_loss'`, `'percentages'`) |
| `difficulty` | string | ✅ | — | `'easy'`, `'medium'`, or `'hard'` |
| `question` | string | ✅ | — | Question text (max 2000 chars) |
| `options` | number[] | ❌ | `[]` | MCQ options (empty for open-answer) |
| `answer` | number | ✅ | — | Correct numeric answer |
| `explanation` | string | ❌ | `""` | Step-by-step solution explanation |
| `approved` | boolean | ❌ | `true` | Admin approval status. Server `create`/`import` default `true`; the UI derives `approved = (status === 'active')`. Students see only `approved !== false`. |
| `status` | string | ✅ | `'active'` | `'draft'`, `'active'`, or `'archived'`. Lifecycle `draft → active → archived`. Only `'active'` (+ `approved !== false`) is served to students; `'archived'` = unpublished (soft-delete). Server `create`/`import` default to `'active'` (auto-publish). |
| `premiumOnly` | boolean | ❌ | `false` | Premium-gated content |
| `createdAt` | ISO string | ✅ | (set on write) | Creation timestamp, set by `create`/`import` |
| `updatedAt` | ISO string | ❌ | (set on edit) | Last-edit timestamp — set by `action=update`/`archive` (Phase 5, ADR-018); absent on pre-Phase-5 docs (and on hard-`delete`, which removes the doc) |

## Topic Keys

| Admin Panel Key | Main App Category | Description |
|-----------------|-------------------|-------------|
| `profit_loss` | `profit-loss` | Profit & Loss |
| `percentages` | `percentages` | Percentage calculations |
| `ratios` | `ratios` | Ratio problems |
| `averages` | `averages` | Average calculations |
| `time-speed-distance` | `time-speed-distance` | TSD problems |
| `time-and-work` | `time-and-work` | Time & Work |
| `fractions` | `fractions` | Fraction-to-percent |
| `multiplication` | `multiplication` | Mental multiplication |

> **Note:** The Main App's `QuestionBankService._getTopicVariants()` handles both hyphen and underscore variants automatically.

## Write Authority

All writes go through the consolidated `/api/admin/questions` handler (Admin SDK; `withAdmin` + immutable
`auditLogs`). Actions (ADR-017 consolidation + Phase 5 ADR-018 CRUD):

- `?action=list` (GET) — read (newest 500; optional client-side `topic`/`status`/`difficulty` filter)
- `?action=list` (POST) — **create** a single question
- `?action=update` (POST) — **edit in place** by `id` (sets `updatedAt`; fixes the prior bug where editing created a duplicate doc)
- `?action=archive` (POST) — **soft-unpublish** by `id` (`status:'archived'`)
- `?action=delete` (POST) — **hard delete** by `id` (requires `confirm:'DELETE'`)
- `?action=generate` (POST) — **AI-draft** a question via OpenAI (returns a draft; not persisted until saved)
- `?action=import` (POST) — **bulk create** (≤500 per batch)

Every mutation writes one immutable `auditLogs` row (`category:'content'`; `generate` uses `category:'ai'`).

## Read Authority

- **Main App**: `QuestionBankService.fetchQuestions()` reads active, approved questions
- **Super Admin Panel**: `QuestionsView._loadQuestions()` reads all questions for management

## Indexes Required

```json
{
  "collectionGroup": "questions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "topic", "order": "ASCENDING" },
    { "fieldPath": "difficulty", "order": "ASCENDING" }
  ]
}
```
