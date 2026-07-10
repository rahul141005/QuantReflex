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

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8')
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
const shadows = distinct(/box-shadow:\s*([^;}]+)[;}]/g);
const fontSizes = distinct(/font-size:\s*([^;}]+)[;}]/g);
const zIndexes = distinct(/z-index:\s*([^;}]+)[;}]/g);
const gradients = distinct(/((?:linear|radial|conic)-gradient\([^;}]*\))/g);

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
  radii: 49,        // goal ≤8   (M6: 51→49)
  shadows: 131,     // goal ≤6   (M6: 141→132; FW-W2: 132→131, planner confirm shell → shared .qr-dialog)
  fontSizes: 80,    // goal ≤14  (M6: 81→80)
  durations: 44,    // goal 4 (3 tokens + 0s)
  easings: 4,       // goal 3 (2 tokens + linear)  (M6: 18→4, bezier zoo → --qr-ease/-out/-spring)
  zIndexes: 20,     // goal 7    (M6: 26→20, --z-* scale adoption)
  gradients: 64,    // goal ≤10  (M6: 70→64)
  colorRatio: 5.5   // goal ≤1.0 (chrome CSS)  (M6: 7.0→5.5)
};

console.log('design-lint census: radii=' + radii.size + ' shadows=' + shadows.size +
  ' fontSizes=' + fontSizes.size + ' durations=' + durSet.size + ' easings=' + easeSet.size +
  ' z=' + zIndexes.size + ' gradients=' + gradients.size +
  ' rawColor:var=' + (rawHex + rawRgb) + ':' + varUses + ' (' + ratio.toFixed(2) + ')');

ok('distinct border-radius <= ' + CEIL.radii, radii.size <= CEIL.radii, 'got ' + radii.size);
ok('distinct box-shadow <= ' + CEIL.shadows, shadows.size <= CEIL.shadows, 'got ' + shadows.size);
ok('distinct font-size <= ' + CEIL.fontSizes, fontSizes.size <= CEIL.fontSizes, 'got ' + fontSizes.size);
ok('distinct motion durations <= ' + CEIL.durations, durSet.size <= CEIL.durations, 'got ' + durSet.size);
ok('distinct easings <= ' + CEIL.easings, easeSet.size <= CEIL.easings, 'got ' + easeSet.size);
ok('distinct z-index <= ' + CEIL.zIndexes, zIndexes.size <= CEIL.zIndexes, 'got ' + zIndexes.size);
ok('distinct gradients <= ' + CEIL.gradients, gradients.size <= CEIL.gradients, 'got ' + gradients.size);
ok('raw-color:var ratio <= ' + CEIL.colorRatio, ratio <= CEIL.colorRatio, 'got ' + ratio.toFixed(2));

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
