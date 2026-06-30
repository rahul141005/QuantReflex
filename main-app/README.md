# Quant Reflex Trainer

A Progressive Web App (PWA) — the **Speed Aptitude** trainer for competitive exams like CAT, CET, and GMAT: Quant, Data Interpretation and Logical Reasoning in one platform, with QuanAI coaching across all three. Built with vanilla HTML, CSS, and JavaScript — no frameworks.

## Features

- **Practice Modes** — Quick Drill (5 questions), Reflex Drill (10 questions, 15s per question), Timed Test (10 questions, 3-minute limit), Focus Training (category-specific), Custom (multi-topic), **Mixed Aptitude** (a one-tap balanced cross-subject sprint across Quant, DI & Reasoning), and **📊 DI Set** (one shared chart with a linked set of progressive, exam-style Data Interpretation questions — ADR-078)
- **QuanAI — cross-subject intelligence** (ADR-076): Coach, Insights, Planner and Explanations read one per-subject rollup (`statMath.subjectRollup`, derived on read) so coaching connects subjects — a percentages gap is named as the cause of slow Data Interpretation. Stats shows an "aptitude by subject" breakdown (overall → subject → category)
- **Speed-Aptitude subjects** (ADR-073/074/075/078) — **Quantitative Aptitude** (14 categories) + **Data Interpretation** (5 generative chart/table families: Bar, Line, Pie, Tables, Caselets — `js/di-engine.js`) + **Logical Reasoning — a 25-category hybrid platform (ADR-079)** across a Foundation→Core→Advanced→Verbal/Critical→Visual syllabus: a generative core (`js/lr-engine.js` — coding, blood relations via a kinship solver, direction, series, analogy, odd-one-out, ranking, syllogisms, coded inequalities, calendars, clocks, input-output), a **puzzle SET engine** (`js/lr-set-engine.js` — seating/floor sets with a guaranteed-unique solution), an **authored-content subsystem** (`data/lr-authored/*` — Critical Reasoning, Statement, Cause-Effect, Course-of-Action, Decision Making, each with a teaching explanation), and a **generative visual engine** (`js/ui/lr-figures.js` + `js/lr-visual-engine.js` — mirror/water/dice/cube/figure series & analogy as DPI-independent SVG, with picture-answer options). **DI v2 (ADR-078):** earned difficulty (no fallback downgrades), ~12 exam-authentic archetypes incl. missing-value, ratio, contribution and **cross-series** questions, an extensible **multi-series** SVG renderer (grouped/stacked/horizontal bars, multi-line, multi-column tables; single-series byte-identical), **~40 realistic dataset domains** (banking, government, business, agriculture, telecom, energy, healthcare…), and authentic **DI Sets** (`js/di-set-engine.js` — one shared chart, 3–6 progressive linked questions). One grouped Practice picker, no separate tab; subject is a derived lens (no Firestore migration).
- **Learn Knowledge Engine** (ADR-069) — a deep-linkable hub→topic knowledge graph: **45 gold-standard topics** (overview · concepts · formulas · tricks · traps · worked examples · memory · revision) across 7 categories (Numbers · Arithmetic · Commercial Math · Modern Math · Mensuration · Data Interpretation · Logical Reasoning), built from reusable knowledge objects (`data/knowledge/*`), grouped by subject; plus the preserved Quick-Reference tables and user-created custom topics & bookmarks
- **Progress Tracking** — Accuracy, streaks, daily streak, category-wise performance, all stored in localStorage
- **Settings** — Dark mode, sound feedback, vibration feedback, difficulty levels, progress reset
- **PWA** — Installable on mobile, works offline after first load

## Run Locally

1. Serve the project folder with any static HTTP server:
   ```bash
   # Python 3
   python -m http.server 8080

   # Node.js (npx)
   npx serve .
   ```
2. Open `http://localhost:8080` in your browser.

## Deploy

### GitHub Pages
1. Push the code to a GitHub repository.
2. Go to **Settings → Pages** and set the source branch.
3. Your app will be live at `https://<username>.github.io/<repo>/`.

### Netlify
1. Connect your GitHub repository to Netlify.
2. Set the publish directory to the root folder.
3. Deploy — no build command needed.

## Install as a Mobile App

1. Open the app URL in Chrome / Edge on your phone.
2. Tap the **Install App** button (or use the browser menu → "Add to Home Screen").
3. The app will appear on your home screen and work offline.

## File Structure

```
├── index.html          Home dashboard with warmup, progress snapshot, study cards
├── practice.html       Combined practice page (Quick Drill, Reflex Drill, Timed Test, Focus Training)
├── learn.html          Collapsible study vault (fractions, tables, squares, cubes, formulas)
├── stats.html          Performance tracking with category accuracy
├── settings.html       Configuration (dark mode, sound, vibration, difficulty, reset)
├── drill.html          Legacy reflex drill page
├── test.html           Legacy timed test page
├── progress.html       Legacy progress page
├── style.css           Mobile-first responsive styles with dark mode support
├── app.js              Service worker registration, PWA install, dark mode bootstrap
├── drill-engine.js     Drill/test engine (multi-mode, timer, scoring, feedback)
├── questions.js        Random question generator (12 categories)
├── progress.js         localStorage progress tracking (daily streak, category stats)
├── tables.js           Dynamic multiplication table renderer
├── knowledge/          Learn Knowledge Engine (ADR-069): schema.js, registry.js, blocks.js
├── ../data/knowledge/  Knowledge objects per category (arithmetic.js, mensuration.js, categories.js)
├── learn/learn-search.js  Registry-backed Learn search index
├── manifest.json       PWA manifest
└── service-worker.js   Offline caching service worker
```
