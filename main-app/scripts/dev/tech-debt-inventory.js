/**
 * tech-debt-inventory.js — ADR-138. REPORT ONLY; this script changes nothing.
 *
 * Produces docs/BIBLE/TECH_DEBT_INVENTORY.md: the backlog for the separate Code Cleanup milestone,
 * deliberately kept OUT of the release-certification commit so that "the build is certified" and "the
 * code is tidy" stay independent claims.
 *
 * WHY THIS IS NOT A GREP
 * A naive "is this class mentioned anywhere" scan is wrong in this codebase, and wrong in the direction
 * that deletes working code. Two live examples:
 *
 *   - `.is-error` / `.is-success` are never written literally. settings.js builds them:
 *         toast.className = 'toast' + (opts.type ? ' is-' + opts.type : '')
 *   - `.strength-weak` and friends come from a `'strength-' + level` concatenation.
 *
 * ADR-133 hit the same shape from the other side: `--text-secondary` looked dead in CSS and was read by
 * js/views/inbox-view.js. So every candidate here is checked THREE ways — literal occurrence, dynamic
 * construction from any string prefix appearing in the JS, and template-literal interpolation — and
 * carries a CONFIDENCE grade. Nothing above "review" is asserted to be safe to delete; the grade is the
 * point, not the list.
 *
 * usage: node scripts/dev/tech-debt-inventory.js [--write]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');
const OUT = path.join(APP, '..', 'docs', 'BIBLE', 'TECH_DEBT_INVENTORY.md');

const css = fs.readFileSync(path.join(APP, 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

function walk(dir, acc) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('.js')) acc.push(p);
  }
  return acc;
}
const jsFiles = walk(path.join(APP, 'js'), []);
const jsSrc = jsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const corpus = html + '\n' + jsSrc;

/* Every string prefix that JS concatenates onto — `'strength-' + level` yields "strength-". These are
   what make a literal-absence check unsafe. */
const DYNAMIC_PREFIXES = new Set();
for (const m of jsSrc.matchAll(/['"`]([A-Za-z][\w-]*-)['"`]\s*\+/g)) DYNAMIC_PREFIXES.add(m[1]);
for (const m of jsSrc.matchAll(/['"`][^'"`]*\s([a-z][\w-]*-)['"`]\s*\+/g)) DYNAMIC_PREFIXES.add(m[1]);
/* template-literal interpolation: `foo-${x}` */
for (const m of jsSrc.matchAll(/`[^`]*?([A-Za-z][\w-]*-)\$\{/g)) DYNAMIC_PREFIXES.add(m[1]);

function couldBeBuilt(name) {
  for (const p of DYNAMIC_PREFIXES) if (name.startsWith(p) && name.length > p.length) return p;
  return null;
}
function literalHit(name) {
  const re = new RegExp('[\'"`\\s.(\\[,>]' + name.replace(/-/g, '\\-') + '[\'"`\\s.,)\\]]');
  return re.test(corpus);
}

/* ── selectors + declarations ─────────────────────────────────────────────────────────────────── */
const RULE = /([^{}]*)\{([^{}]*)\}/g;
const classes = new Set();
const selCount = {};
const selLines = {};
let m;
while ((m = RULE.exec(css)) !== null) {
  const raw = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const sel = raw.trim().replace(/\s+/g, ' ');
  if (!sel || sel.startsWith('@') || /^\d/.test(sel) || sel === 'from' || sel === 'to') continue;
  const line = css.slice(0, m.index).split('\n').length;
  selCount[sel] = (selCount[sel] || 0) + 1;
  (selLines[sel] = selLines[sel] || []).push(line);
  for (const c of raw.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(c[1]);
}

const classRows = [];
for (const c of [...classes].sort()) {
  if (literalHit(c)) continue;
  const built = couldBeBuilt(c);
  classRows.push({
    name: c,
    confidence: built ? 'LOW — may be built dynamically' : 'REVIEW — no literal reference found',
    evidence: built
      ? 'no literal occurrence, but JS concatenates the prefix "' + built + '" — could be constructed at runtime'
      : 'no occurrence in index.html or any js/**/*.js, literal or concatenated'
  });
}

/* ── custom properties ────────────────────────────────────────────────────────────────────────── */
const declaredTokens = new Set();
for (const t of css.matchAll(/(--[\w-]+)\s*:/g)) declaredTokens.add(t[1]);
const tokenRows = [];
for (const t of [...declaredTokens].sort()) {
  const usedInCss = new RegExp('var\\(\\s*' + t + '\\b').test(css);
  const usedElsewhere = corpus.indexOf(t) !== -1;
  if (usedInCss || usedElsewhere) continue;
  /* design-lint.check.js exempts `--sp-N` by documented decision (ADR-134): a 4px scale is allowed
     steps that are not yet used, because deleting them leaves it ragged and invites someone to
     reinvent the value. Carry that reasoning here so the cleanup milestone does not "tidy away" a
     deliberate reservation. */
  const reserved = /^--sp-\d+$/.test(t);
  tokenRows.push({ name: t,
    confidence: reserved ? 'KEEP — reserved by design' : 'REVIEW — declared, never read',
    evidence: reserved
      ? 'unused step of the canonical 4px scale; exempted by design-lint (ADR-134) on purpose — do not remove'
      : 'no var(' + t + ') in style.css and no occurrence in index.html or js/' });
}

/* ── duplicate selectors (same selector text declared more than twice) ─────────────────────────── */
const dupRows = Object.entries(selCount).filter(([, n]) => n > 2)
  .map(([sel, n]) => ({ name: sel, confidence: 'INFO', evidence: n + ' declarations at lines ' + selLines[sel].join(', ') }))
  .sort((a, b) => b.evidence.localeCompare(a.evidence));

/* ── !important ───────────────────────────────────────────────────────────────────────────────── */
const bangLines = [];
css.split('\n').forEach((l, i) => { if (l.indexOf('!important') !== -1) bangLines.push(i + 1); });

/* ── inline styles ────────────────────────────────────────────────────────────────────────────── */
const inlineStyles = [...html.matchAll(/\sstyle="([^"]*)"/g)].map(x => x[1]);

/* ── magic numbers: px literals in style.css that are not on the 4px spacing scale ─────────────── */
const SCALE = new Set([0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48]);
const magic = {};
for (const p of css.matchAll(/(?<![\w-])(\d{1,4})px/g)) {
  const v = parseInt(p[1], 10);
  if (!SCALE.has(v)) magic[v] = (magic[v] || 0) + 1;
}
const magicRows = Object.entries(magic).sort((a, b) => b[1] - a[1]).slice(0, 25);

/* ── report ───────────────────────────────────────────────────────────────────────────────────── */
function table(rows, header) {
  if (!rows.length) return '_None found._\n';
  return '| ' + header.join(' | ') + ' |\n|' + header.map(() => '---').join('|') + '|\n' +
    rows.map(r => '| `' + r.name + '` | ' + r.confidence + ' | ' + r.evidence + ' |').join('\n') + '\n';
}

const report = `# QuantReflex — Technical Debt Inventory (ADR-138)

**Generated by \`main-app/scripts/dev/tech-debt-inventory.js\`. This document changes nothing.**

Produced during the ADR-138 release certification, where the explicit rule was: the certification branch
carries regression fixes, UI corrections, gate improvements and production-readiness work **only** — no
removals, no consolidation, no refactors. Everything below is the backlog for a separate Code Cleanup
milestone, where each item can be removed individually with its own regression test.

**Read the confidence column before deleting anything.** A literal-absence scan is not proof of death in
this codebase: \`.is-error\` and \`.strength-weak\` are never written literally — they are built by
\`'is-' + type\` and \`'strength-' + level\`. ADR-133 hit the mirror image: \`--text-secondary\` looked
dead in CSS and was read by \`js/views/inbox-view.js\`. Every candidate here is checked for literal use,
dynamic construction from any prefix JS concatenates, and template interpolation.

| Grade | Meaning |
|---|---|
| \`REVIEW\` | No reference found by any of the three methods. Still requires a human read before removal. |
| \`LOW\` | No literal reference, but a JS concatenation prefix could construct it at runtime. **Assume alive.** |
| \`INFO\` | Not dead — a structural observation (duplication, magic numbers) for the cleanup milestone. |

---

## 1 · CSS classes with no discoverable reference

${classes.size} classes declared in \`css/style.css\`; ${classRows.length} have no literal reference.

${table(classRows, ['Class', 'Confidence', 'Evidence'])}

## 2 · Custom properties declared but never read

${declaredTokens.size} custom properties declared.

${table(tokenRows, ['Token', 'Confidence', 'Evidence'])}

## 3 · Selectors declared more than twice

Not necessarily wrong — media-query overrides legitimately repeat a selector. Listed so the cleanup
milestone can judge each on its merits.

${table(dupRows, ['Selector', 'Grade', 'Evidence'])}

## 4 · \`!important\` usage

**${bangLines.length}** declarations, at lines: ${bangLines.join(', ')}

Most are the reduced-motion kill-switch and the Playful icon-language overrides, both of which need to
win by design. The cleanup milestone should confirm that each remaining one still does.

## 5 · Inline styles in \`index.html\`

**${inlineStyles.length}** \`style="…"\` attributes. Already censused and ceiling-capped by
\`design-lint.check.js\` (ADR-135) so no NEW inline duration, easing, shadow, z-index or font-size can be
added — the cleanup itself remains deferred by explicit instruction.

## 6 · Off-scale px literals in \`css/style.css\`

The spacing scale is \`[2, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48]\` (ADR-133). Values outside it
are not automatically wrong — shadows, blurs, hairlines and glyph metrics legitimately sit off-grid —
but the frequent ones are worth a look.

| Value | Occurrences |
|---|---|
${magicRows.map(([v, n]) => '| ' + v + 'px | ' + n + ' |').join('\n')}

---

_Regenerate with \`node scripts/dev/tech-debt-inventory.js --write\` from \`main-app/\`._
`;

if (process.argv.indexOf('--write') !== -1) {
  fs.writeFileSync(OUT, report);
  console.log('wrote ' + OUT);
} else {
  console.log(report.slice(0, 1200) + '\n… (' + report.length + ' chars; pass --write to emit)');
}
console.log('\nsummary: ' + classRows.length + ' class candidates, ' + tokenRows.length + ' token candidates, ' +
  dupRows.length + ' repeated selectors, ' + bangLines.length + ' !important, ' +
  inlineStyles.length + ' inline styles');
