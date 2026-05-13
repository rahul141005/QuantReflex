# Question Schema

> Canonical question format for the QuantReflex ecosystem.

---

## Official Schema

```json
{
  "type": "word_problem",
  "topic": "profit_loss",
  "difficulty": "medium",
  "question": "A shopkeeper bought an item for ₹500 and sold it at 20% profit. What is the selling price?",
  "options": [550, 600, 650, 700],
  "answer": 600,
  "explanation": "CP = 500, Profit = 20% of 500 = 100, SP = 500 + 100 = 600",
  "approved": true,
  "status": "active",
  "premiumOnly": false
}
```

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | Always `"word_problem"` |
| `topic` | string | ✅ | Category key (see below) |
| `difficulty` | string | ✅ | `"easy"`, `"medium"`, or `"hard"` |
| `question` | string | ✅ | Question text (max 2000 chars) |
| `options` | number[] | ❌ | MCQ options (empty = open answer) |
| `answer` | number | ✅ | Correct numeric answer |
| `explanation` | string | ❌ | Step-by-step solution |
| `approved` | boolean | ❌ | Admin approval flag |
| `status` | string | ✅ | `"draft"`, `"active"`, or `"archived"` |
| `premiumOnly` | boolean | ❌ | Premium-gated content |

## Supported Topics

| Key | Display Name |
|-----|-------------|
| `profit_loss` / `profit-loss` | Profit & Loss |
| `percentages` | Percentages |
| `ratios` | Ratios |
| `averages` | Averages |
| `time-speed-distance` | Time, Speed & Distance |
| `time-and-work` | Time & Work |
| `fractions` | Fractions |
| `multiplication` | Multiplication |

> Both hyphen-case and underscore_case are accepted. The Main App normalizes automatically.

## JSON Import Format

For bulk import via the Admin Panel, provide a JSON array:

```json
[
  {
    "type": "word_problem",
    "topic": "percentages",
    "difficulty": "easy",
    "question": "What is 20% of 250?",
    "options": [40, 50, 60, 70],
    "answer": 50,
    "explanation": "20% of 250 = (20/100) × 250 = 50",
    "status": "active"
  }
]
```

## Validation Rules (Import)

A question is valid if it has:
- `topic` (non-empty string)
- `difficulty` (non-empty string)
- `question` (non-empty string)
- `answer` (defined, numeric)

## JSON Schema

See [`shared/schemas/question-schema.json`](../shared/schemas/question-schema.json) for the formal JSON Schema definition.
