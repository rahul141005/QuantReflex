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
| `approved` | boolean | ❌ | `false` | Admin approval status |
| `status` | string | ✅ | `'draft'` | `'draft'`, `'active'`, or `'archived'` |
| `premiumOnly` | boolean | ❌ | `false` | Premium-gated content |

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

- **Super Admin Panel**: Creates, edits, and manages questions via `/api/admin/questions` and `/api/admin/questions-import`
- **AI Generation**: Super Admin generates draft questions via `/api/admin/generate-question` (OpenAI)

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
