# Firestore Seed Data

> Documentation for initial Firestore data seeding.

## User Document Defaults

New users are automatically seeded by the Main App's `FirestoreSync._createDefaultDocument()`:

- Free tier (isPremium: false, isTrial: false)
- Default settings (sound: on, difficulty: medium, dailyGoal: 20)
- Empty stats, bookmarks, custom data
- Subcollections eagerly created: performance/overall, practice/data, ai/usage

## Question Bank Seeding

Questions are imported via the Super Admin Panel:
1. AI generation (single question)
2. JSON file bulk import (batch upload)

No automated seeding is required — the Admin Panel is the canonical source.
