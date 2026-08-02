/**
 * design-lint.check.js — design-system consistency ratchet (UI Phase 1 blueprint §14 / M0).
 *
 * Counts the distinct visual-primitive values in css/style.css and FAILS when any count
 * exceeds its ceiling. Ceilings start at the audited baseline (2026-07-09) and are ratcheted
 * DOWN as consolidation milestones land — they must never be raised. The goal ceilings from
 * the blueprint are noted inline; the enforced ceiling is the current reality so this check
 * can never regress the burn-down.
 *
 * Metrics: border-radius, box-shadow, font-size, transition/animation durations, easings,
 * z-index, gradients (all DISTINCT counts), and the raw-color-literal : var() ratio.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const rawCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

/* Content-art regions (FW-W7): renderer-coupled ART (di-chart palettes, lr-figure inks, the splash
   amoeba's organic radii) is deliberately NOT part of the design system — marked regions are
   stripped from the census. Guards keep the escape hatch honest: markers must pair up, at most
   THREE regions, each ≤200 lines. */
const startMarks = (rawCss.match(/\/\* design-lint:content-art-start[^*]*\*\//g) || []).length;
const endMarks = (rawCss.match(/\/\* design-lint:content-art-end[^*]*\*\//g) || []).length;
const artRegions = [];
{
  const reArt = /\/\* design-lint:content-art-start[^*]*\*\/([\s\S]*?)\/\* design-lint:content-art-end[^*]*\*\//g;
  let mArt;
  while ((mArt = reArt.exec(rawCss)) !== null) artRegions.push(mArt[1]);
}
const artOk = startMarks === endMarks && artRegions.length === startMarks &&
  artRegions.length <= 3 && artRegions.every(r => r.split('\n').length <= 200);

const css = rawCss
  .replace(/\/\* design-lint:content-art-start[^*]*\*\/[\s\S]*?\/\* design-lint:content-art-end[^*]*\*\//g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');   // strip comments so commented-out values don't count

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function distinct(re, normalize) {
  const set = new Set();
  let m;
  while ((m = re.exec(css)) !== null) {
    let v = m[1].trim().replace(/\s+/g, ' ');
    if (normalize) v = normalize(v);
    // A pure design-token reference (e.g. `var(--fs-sub)`, `var(--r-lg)`) IS the consolidated system —
    // it must not count against the raw-literal fragmentation ceiling, otherwise tokenizing a value would
    // paradoxically raise the count. The census measures RAW literal proliferation only.
    if (/^var\(--[\w-]+\)$/.test(v)) continue;
    set.add(v);
  }
  return set;
}

/* ---- distinct-value censuses ---- */
const radii = distinct(/border-radius:\s*([^;}]+)[;}]/g);
/* Shadows: @keyframes interpolation STATES (pulse rings animating alpha 0↔1) are motion design,
   not resting elevations — the shadows census measures the declared elevation system only (FW-W7b). */
const cssNoKeyframes = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');
const shadows = (() => {
  const set = new Set();
  const re = /box-shadow:\s*([^;}]+)[;}]/g;
  let m;
  while ((m = re.exec(cssNoKeyframes)) !== null) {
    const v = m[1].trim().replace(/\s+/g, ' ');
    if (/^var\(--[\w-]+\)$/.test(v)) continue;
    set.add(v);
  }
  return set;
})();
const fontSizes = distinct(/font-size:\s*([^;}]+)[;}]/g);
const zIndexes = distinct(/z-index:\s*([^;}]+)[;}]/g);
/* Gradients: mask-image gradients are GEOMETRY (scroll-fade clips), not color design — excluded (FW-W7c). */
const cssNoMasks = css.replace(/(?:-webkit-)?mask(?:-image)?:[^;}]+[;}]/g, ' ');
const gradients = (() => {
  const set = new Set();
  const re = /((?:linear|radial|conic)-gradient\([^;}]*\))/g;
  let m;
  while ((m = re.exec(cssNoMasks)) !== null) {
    const v = m[1].trim().replace(/\s+/g, ' ');
    set.add(v);
  }
  return set;
})();

/* durations: any Ns / Nms literal in transition/animation shorthand or *-duration */
const durSet = new Set();
{
  const re = /(?:transition|animation)(?:-duration|-delay)?:\s*([^;}]+)[;}]/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    (m[1].match(/(?:\d*\.\d+|\d+)m?s\b/g) || []).forEach(d => {
      // normalize 0.15s / .15s / 150ms → one canonical ms number
      let v = d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
      durSet.add(String(v));
    });
  }
}

/* easings: named + cubic-bezier bodies (whitespace-normalized so the same curve counts once) */
const easeSet = new Set();
{
  const re = /(?:transition|animation)[^;}]*?(cubic-bezier\([^)]*\)|ease-in-out|ease-in|ease-out|linear|ease|steps\([^)]*\))/g;
  let m;
  while ((m = re.exec(css)) !== null) easeSet.add(m[1].replace(/\s+/g, ''));
}

/* raw color literals vs var() usage */
const rawHex = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
const rawRgb = (css.match(/rgba?\(/g) || []).length;
const varUses = (css.match(/var\(--/g) || []).length;
const ratio = (rawHex + rawRgb) / Math.max(1, varUses);

/* ---- ceilings: baseline 2026-07-09 (ratchet DOWN only; blueprint goals in comments) ---- */
const CEIL = {
  radii: 8,         // GOAL REACHED (FW-W7b: 45→6 — 50%/4px/2px/inherit + composites; splash blobs = content-art)
  shadows: 6,       // GOAL REACHED (FW-W7b2: 130→4 — none + 3 stragglers; keyframe pulse states excluded as motion)
  fontSizes: 14,    // GOAL REACHED (FW-W7d: 79→12 — --fs-* scale + icon display tokens; keeps: root 16px, drill question trio, sparkline SVG 9px, bento clamps, 6rem countdown, qr-ico 0, .85em, inherit)
  durations: 4,     // GOAL REACHED (FW-W7a: 44→3 — 0s + 25s ambient + reduced-motion 0.01ms; slack 1)
  easings: 3,       // GOAL REACHED (FW-W7a: every literal easing → --qr-ease/-out; linear kept)
  zIndexes: 7,      // GOAL REACHED (FW-W7b: 20→1 — value-preserving --z-* tokens; only literal 0 remains)
  gradients: 10,    // GOAL REACHED (FW-W7c: 64→10 — the identity set; mask-geometry gradients excluded)
  colorRatio: 1.0   // GOAL REACHED (FW-W7e: 3.8→0.56 — 567 semantic folds onto --qr-* tokens + 183 veil folds onto invariant --qr-veil-* tokens)
};

console.log('design-lint census: radii=' + radii.size + ' shadows=' + shadows.size +
  ' fontSizes=' + fontSizes.size + ' durations=' + durSet.size + ' easings=' + easeSet.size +
  ' z=' + zIndexes.size + ' gradients=' + gradients.size +
  ' rawColor:var=' + (rawHex + rawRgb) + ':' + varUses + ' (' + ratio.toFixed(2) + ')');

ok('content-art regions well-formed (paired, <=3, <=200 lines each)', artOk,
  'starts=' + startMarks + ' ends=' + endMarks + ' regions=' + artRegions.length);
ok('distinct border-radius <= ' + CEIL.radii, radii.size <= CEIL.radii, 'got ' + radii.size);
ok('distinct box-shadow <= ' + CEIL.shadows, shadows.size <= CEIL.shadows, 'got ' + shadows.size);
ok('distinct font-size <= ' + CEIL.fontSizes, fontSizes.size <= CEIL.fontSizes, 'got ' + fontSizes.size);
ok('distinct motion durations <= ' + CEIL.durations, durSet.size <= CEIL.durations, 'got ' + durSet.size);
ok('distinct easings <= ' + CEIL.easings, easeSet.size <= CEIL.easings, 'got ' + easeSet.size);
ok('distinct z-index <= ' + CEIL.zIndexes, zIndexes.size <= CEIL.zIndexes, 'got ' + zIndexes.size);
ok('distinct gradients <= ' + CEIL.gradients, gradients.size <= CEIL.gradients, 'got ' + gradients.size);
ok('raw-color:var ratio <= ' + CEIL.colorRatio, ratio <= CEIL.colorRatio, 'got ' + ratio.toFixed(2));

/* ── ADR-133: the four axes the census never covered ──────────────────────────────────────────────
   Every axis this file censuses sat at 1–12 distinct values. Every axis it did NOT census had drifted:
   spacing to 81 values, glass blur to 9, press-feedback scale to 12, opacity to ~14. The census is not
   a report — it is the mechanism that produced the discipline everywhere else, and these four were
   simply never added to it. Ceilings are set at the post-normalisation count so they ratchet down. */
const spacingVals = new Set();
{
  const re = /(^|[;{}\s])(padding|margin|gap|row-gap|column-gap|padding-(?:top|bottom|left|right)|margin-(?:top|bottom|left|right))\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    m[3].trim().split(/\s+/).forEach(tok => {
      if (!/^-?[\d.]+(rem|px)$/.test(tok)) return;
      const n = parseFloat(tok);
      spacingVals.add(Math.abs(tok.endsWith('rem') ? n * 16 : n));
    });
  }
}
/* glass: every backdrop-filter must name a tier token, never a literal radius */
/* @supports conditions are capability PROBES, not styling — `@supports (backdrop-filter: blur(2px))`
   asks the browser a question and must not be read as a declared blur radius. */
const cssNoSupports = css.replace(/@supports[^{]*\{/g, '{');
const glassLiterals = (cssNoSupports.match(/(?:-webkit-)?backdrop-filter:\s*blur\([^)]*\)/g) || [])
  .filter(d => !/var\(--glass-/.test(d));
/* press feedback: scale() inside an :active rule */
const pressVals = new Set();
{
  const re = /([^{}]*:active[^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const sc = m[2].match(/scale\(([0-9.]+)\)/g) || [];
    sc.forEach(v => { const n = parseFloat(v.replace(/[^0-9.]/g, '')); if (n <= 1) pressVals.add(n); });
  }
}

const CEIL2 = { spacing: 18, glassLiterals: 0, pressScales: 0 };
console.log('design-lint census-2: spacing=' + spacingVals.size +
  ' glassLiterals=' + glassLiterals.length + ' pressLiterals=' + pressVals.size);
ok('distinct spacing values <= ' + CEIL2.spacing, spacingVals.size <= CEIL2.spacing,
  'got ' + spacingVals.size + ' [' + [...spacingVals].sort((a, b) => a - b).join(',') + ']');
ok('every backdrop-filter names a --glass-* tier', glassLiterals.length === CEIL2.glassLiterals,
  glassLiterals.length ? glassLiterals.slice(0, 3).join(' | ') : 'no literal blur radii');
ok('press feedback uses --qr-press-* tokens, not literal scales', pressVals.size === CEIL2.pressScales,
  pressVals.size ? 'literals: ' + [...pressVals].join(', ') : 'no literal press scales');

/* ── ADR-135: the census only ever read the STYLESHEET ────────────────────────────────────────────
   Every ceiling above measures css/style.css alone, so the reported figures were not the shipped
   figures: index.html also ships ~84 inline `style` attributes, and they breach every dimension —
   two motion durations matching no token (0.3s, 0.2s), a fourth easing, a fifth box-shadow, z-index
   9999/10000 and eight font sizes. The inbox drawer is effectively styled outside the design system.

   These are counted as their OWN dimensions rather than folded into the ceilings above, so the two
   numbers stay separable and a future cleanup has an exact target. Ceilings are pinned at today's
   counts: CI stays green while the inline styles remain, but any NEW inline duration, easing, shadow,
   z-index or font size fails immediately. Ratchet down only — never raise these. */
const inlineHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inlineStyles = [...inlineHtml.matchAll(/style="([^"]*)"/g)].map(m => m[1]);
function inlineSet(re, pick) {
  const set = new Set();
  inlineStyles.forEach(st => (st.match(re) || []).forEach(v => set.add(pick ? pick(v) : v.trim())));
  return set;
}
const inlineDur = inlineSet(/(?:transition|animation)[^;]*?(?:\d*\.\d+|\d+)m?s\b/g,
  v => { const d = v.match(/(\d*\.\d+|\d+)m?s\b/)[0]; return String(d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000); });
const inlineEase = inlineSet(/cubic-bezier\([^)]*\)|ease-in-out|ease-in|ease-out|linear/g, v => v.replace(/\s+/g, ''));
const inlineShadow = inlineSet(/box-shadow:\s*([^;]+)/g, v => v.replace(/box-shadow:\s*/, '').trim());
const inlineZ = inlineSet(/z-index:\s*([^;]+)/g, v => v.replace(/z-index:\s*/, '').trim());
const inlineFont = inlineSet(/font-size:\s*([^;]+)/g, v => v.replace(/font-size:\s*/, '').trim());

const CEIL3 = { dur: 2, ease: 1, shadow: 1, z: 2, font: 8 };
console.log('design-lint census-3 (INLINE, index.html): durations=' + inlineDur.size +
  ' easings=' + inlineEase.size + ' shadows=' + inlineShadow.size +
  ' z=' + inlineZ.size + ' fontSizes=' + inlineFont.size +
  '  [true shipped totals: durations=' + (durSet.size + inlineDur.size) +
  ' easings=' + (easeSet.size + inlineEase.size) +
  ' shadows=' + (shadows.size + inlineShadow.size) +
  ' z=' + (zIndexes.size + inlineZ.size) + ']');
ok('inline durations <= ' + CEIL3.dur, inlineDur.size <= CEIL3.dur, 'got ' + inlineDur.size + ' [' + [...inlineDur].join(',') + ']');
ok('inline easings <= ' + CEIL3.ease, inlineEase.size <= CEIL3.ease, 'got ' + inlineEase.size);
ok('inline box-shadows <= ' + CEIL3.shadow, inlineShadow.size <= CEIL3.shadow, 'got ' + inlineShadow.size);
ok('inline z-index values <= ' + CEIL3.z, inlineZ.size <= CEIL3.z, 'got ' + inlineZ.size);
ok('inline font-sizes <= ' + CEIL3.font, inlineFont.size <= CEIL3.font, 'got ' + inlineFont.size);

/* ── ADR-134: no orphaned design tokens ───────────────────────────────────────────────────────────
   A custom property that nothing reads is design-system rot: it looks like part of the system, gets
   maintained per theme, and silently isn't. ADR-131 gave Playful its own `--el-key-raised` and
   `--qr-glow-accent-strong`; ADR-133 aliased `--glass-nav` rather than deleting it. All three were
   dead, and a whole duplicate spacing scale (--sp-xs/sm/md/lg) sat unused beside --sp-1…12.

   The scan MUST cover js/ and index.html, not just the stylesheet. `--text-secondary` looks dead in
   CSS alone and is in fact read by js/views/inbox-view.js — removing it on CSS evidence would have
   broken the inbox. That near-miss is the reason this check reads every consumer. */
function tokenRefs() {
  const seen = new Set();
  const scan = src => { let m; const re = /var\(\s*(--[\w-]+)/g; while ((m = re.exec(src)) !== null) seen.add(m[1]); };
  scan(rawCss);
  scan(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (f.endsWith('.js')) scan(fs.readFileSync(fp, 'utf8'));
    }
  })(path.join(__dirname, '..', 'js'));
  return seen;
}
const declaredTokens = new Set();
{ let m; const re = /(^|[;{\s])(--[\w-]+)\s*:/g; while ((m = re.exec(rawCss)) !== null) declaredTokens.add(m[2]); }
const referenced = tokenRefs();
/* Documented exception: --sp-8/10/12 complete the canonical 4px scale. A scale is allowed steps that
   are not yet used — deleting them would leave it ragged and invite someone to reinvent the value. */
const SCALE_RESERVED = /^--sp-\d+$/;
const orphans = [...declaredTokens].filter(t => !referenced.has(t) && !SCALE_RESERVED.test(t)).sort();
ok('no orphaned custom properties (nothing declared that nothing reads)',
  orphans.length === 0, orphans.length ? orphans.join(', ') : declaredTokens.size + ' tokens, all referenced');

/* ── ADR-131: theme distinctness ──────────────────────────────────────────────────────────────────
   The census above measures the SIZE of the design vocabulary; it says nothing about whether the two
   themes actually use different values. That blind spot is how the burn-down waves left Playful
   Professional inheriting Classic's entire depth-and-atmosphere layer: identical elevations, and
   washes/halos/glows drawn in classic blue because the tokens holding them baked
   `rgba(37,99,235,…)` at `:root`, where no amount of palette work under `html.theme-playful` can
   reach. Both themes passed every ceiling while shipping as the same object.

   The invariant: an ATMOSPHERE token may not hard-code a colour that Playful cannot override. It is
   satisfied either by Playful re-declaring the token, or by the `:root` value being composed purely
   of var() references, so overriding the referenced token retunes it automatically. Structural, not
   a fixed list — a new `--el-*` or `--qr-veil-accent-*` is covered the moment it is added. */
function tokenBlock(startLine) {
  const lines = rawCss.split('\n');
  let depth = 0, started = false, out = [];
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
    if (started && i > startLine) out.push(lines[i]);
    if (started && depth === 0) break;
  }
  return out.join('\n');
}
function tokensOf(selRe) {
  const lines = rawCss.split('\n');
  const found = {};
  lines.forEach((l, i) => {
    if (!selRe.test(l.trim())) return;
    const body = tokenBlock(i);
    (body.match(/--[\w-]+\s*:\s*[^;]+/g) || []).forEach(t => {
      found[t.split(':')[0].trim()] = t.slice(t.indexOf(':') + 1).trim();
    });
  });
  return found;
}
const rootTokens = tokensOf(/^:root\s*\{$/);
const playfulTokens = tokensOf(/^html\.theme-playful(\.dark-mode)?\s*\{$/);
const ATMOSPHERE = /^--(el-|qr-glow|qr-veil-accent|qr-wash)/;
/* Duel is a FEATURE identity, not a theme identity: its amber reads the same in both themes by
   design (--qr-grad-wash-duel is shared for the same reason). The single documented exception. */
const ATMOSPHERE_EXEMPT = /-duel$/;
const hasRawColour = v => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(v);
const atmosphereTokens = Object.keys(rootTokens).filter(k => ATMOSPHERE.test(k) && !ATMOSPHERE_EXEMPT.test(k));
const unthemed = atmosphereTokens.filter(k => hasRawColour(rootTokens[k]) && playfulTokens[k] === undefined);
ok('atmosphere tokens are theme-overridable (no baked classic accent)', unthemed.length === 0,
  unthemed.length ? 'inherited by Playful: ' + unthemed.join(', ') : atmosphereTokens.length + ' checked');

/* A floor on how much Playful actually re-declares. Before ADR-131 it overrode 28 of :root's tokens
   and 7 of those were byte-identical to Classic — an effective 21. Counting only tokens whose value
   genuinely DIFFERS keeps this honest: re-declaring a token with the same value cannot satisfy it. */
const PLAYFUL_OVERRIDE_FLOOR = 30;
const realOverrides = Object.keys(playfulTokens).filter(
  k => rootTokens[k] !== undefined && rootTokens[k] !== playfulTokens[k]);
ok('Playful overrides >= ' + PLAYFUL_OVERRIDE_FLOOR + ' tokens with values differing from Classic',
  realOverrides.length >= PLAYFUL_OVERRIDE_FLOOR, 'got ' + realOverrides.length);

/* ── glow belongs to ACTIONS, never to SURFACES (ADR-137) ──────────────────────────────────────────
   `--qr-glow-accent` is a coloured halo, and every theme re-declares the colour it draws from
   (`--qr-veil-accent-25`), so in Playful Dark it resolves to a teal `rgba(45,212,191,.28)`. On a
   primary button that is intentional emphasis. On a CARD it is the whole elevation story rendered as
   neon: four rules gave `.card`, `.mode-card`, `.training-card` and `.onboarding-card` a halo INSTEAD
   of a shadow, so Home, Practice, Learn and Quick Study all glowed — they are one component.

   Content surfaces belong on the elevation ladder (`--el-1/2/3`), which every theme already declares
   and which the sibling surfaces in the very same blocks (`.settings-section-card`, `.analytics-card`)
   already used. This assertion makes the split structural rather than a habit: a card that reaches for
   the glow again fails here. Actions are matched by intent (btn/cta/pill/cell/cta-like), and a
   `:focus`/`focus-visible` ring is exempt — a focus halo IS the correct affordance. */
const SURFACE_SEL = /\.(card|mode-card|training-card|onboarding-card|analytics-card|settings-section-card|qs-card|qs-tray|home-bento|practice-container)\b/;
const ACTION_SEL = /\.(btn|cta|pill|chip|key|tab|nav|pic|share|submit|numpad)/;
const glowOnSurface = [];
{
  /* NOT `/(^|\})\s*([^{}]*?)\{…/` — that anchor CONSUMES the previous rule's closing brace, so the
     next match cannot re-use it and the scan silently reads only every OTHER rule. The first cut of
     this assertion used it and passed while the glow was still planted on `.mode-card`. Excluding
     braces from the selector class is enough to delimit rules, and it visits all of them. */
  const RULE = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = RULE.exec(css)) !== null) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    const body = m[2].replace(/\/\*[\s\S]*?\*\//g, '');
    if (!/box-shadow\s*:[^;]*var\(--qr-glow-accent\)/.test(body)) continue;
    if (/:focus(-visible)?\b/.test(sel)) continue;      // a focus ring is a legitimate halo
    if (!SURFACE_SEL.test(sel)) continue;
    if (ACTION_SEL.test(sel)) continue;                 // an action that merely lives on a card
    glowOnSurface.push(sel.slice(0, 80));
  }
}
ok('no coloured glow used as a content surface\'s elevation (glow is for actions)',
  glowOnSurface.length === 0,
  glowOnSurface.length ? glowOnSurface.join(' | ') : 'surfaces use the --el ladder');

/* Design-token presence: the foundation tokens must exist once M1 lands (soft until then). */
const REQUIRED_TOKENS_M1 = ['--r-lg', '--el-1', '--z-dialog', '--fs-h1', '--sp-6'];
const tokensPresent = REQUIRED_TOKENS_M1.every(t => css.indexOf(t + ':') !== -1);
if (tokensPresent) {
  ok('foundation tokens present (M1)', true);
} else {
  console.log('  note: M1 foundation tokens not yet present (pre-M1 state) — not enforced');
}

console.log('design-lint.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
