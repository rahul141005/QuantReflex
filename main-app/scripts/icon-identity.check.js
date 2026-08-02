/**
 * icon-identity.check.js — ADR-131.
 *
 * The two themes own two different ICON LANGUAGES, and the split is enforced entirely in CSS:
 *   Classic Blue          → the emoji glyph in the element's own text node
 *   Playful Professional  → that text node collapsed, and a monochrome SVG mask painted via ::before
 *
 * That design has one hard prerequisite and one easy way to break it.
 *
 * The prerequisite: EVERY `.qr-ico` must actually carry its emoji. Classic renders the text node, so
 * an empty span is an invisible icon in the default theme — and because Playful still paints its
 * mask, the hole is invisible to anyone developing in Playful. `qrIco()` used to emit the literal
 * string "undefined" when called with one argument for exactly this reason.
 *
 * The easy way to break it: adding a NEW chrome glyph as a bare emoji instead of a `.qr-ico`. It
 * looks right in Classic and lands as the single emoji in a screen full of SVG in Playful — the
 * "mixed surface" this ADR set out to eliminate.
 *
 * DOCUMENTED EXCEPTION — content emoji stay emoji in both themes. Learn topic icons, Quick-Ref card
 * glyphs, report-taxonomy reasons and question data are authored PER-ITEM DATA, not chrome:
 * converting them would mean rewriting translated strings and inventing ~100 new glyphs. Decorative
 * art (empty-state illustrations, the onboarding and paywall hero glyphs, the duel crown) is also
 * out: it is illustration, not iconography. Both are recorded in ADR-131 rather than left implicit.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok ' + name + (detail ? ' (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'css', 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(APP, 'js', 'app.js'), 'utf8');

console.log('Icon identity — one emoji language per theme, no mixed surfaces (ADR-131)\n');

/* ── 1. every .qr-ico in static chrome carries a glyph ─────────────────────────────────────────── */
const ICO_SPAN = /<span[^>]*class="[^"]*\bqr-ico\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
const spans = [...html.matchAll(ICO_SPAN)];
const emptySpans = spans.filter(m => !m[1].trim());
ok('every .qr-ico in index.html carries its emoji (Classic renders the text node)',
  spans.length > 0 && emptySpans.length === 0,
  spans.length + ' spans, ' + emptySpans.length + ' empty');

/* ── 2. every .qr-ico names an icon that is bound to a mask ────────────────────────────────────── */
const bound = new Set([...css.matchAll(/\.qr-ico\[data-ico='([^']+)'\]/g)].map(m => m[1]));
const usedInHtml = [...html.matchAll(/<span[^>]*class="[^"]*\bqr-ico\b[^"]*"[^>]*data-ico="([^"]+)"/g)].map(m => m[1]);
const usedAttrFirst = [...html.matchAll(/data-ico="([^"]+)"[^>]*class="[^"]*\bqr-ico\b/g)].map(m => m[1]);
const htmlNames = [...new Set(usedInHtml.concat(usedAttrFirst))];
const unbound = htmlNames.filter(n => !bound.has(n));
ok('every data-ico in index.html is bound to a mask (Playful paints it)',
  unbound.length === 0, unbound.length ? 'unbound: ' + unbound.join(', ') : htmlNames.length + ' names');

/* ── 3. qrIco() can never emit an empty or literal-undefined glyph ─────────────────────────────── */
const mapBlock = appJs.slice(appJs.indexOf('var QR_ICO_EMOJI'), appJs.indexOf('function qrIco'));
const emojiMap = {};
for (const m of mapBlock.matchAll(/'([\w-]+)'\s*:\s*'([^']+)'/g)) emojiMap[m[1]] = m[2];
ok('QR_ICO_EMOJI map is populated', Object.keys(emojiMap).length > 0, Object.keys(emojiMap).length + ' names');
const qrIcoBody = appJs.slice(appJs.indexOf('function qrIco'), appJs.indexOf('function qrIco') + 320);
ok('qrIco() falls back to the emoji map rather than emitting undefined',
  /emoji\s*\|\|\s*QR_ICO_EMOJI\[name\]\s*\|\|\s*''/.test(qrIcoBody));

/* Every single-argument qrIco('x') call must resolve through the map, or Classic renders nothing. */
function walk(dir, acc) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('.js')) acc.push(p);
  }
  return acc;
}
const jsFiles = walk(path.join(APP, 'js'), []);
const oneArg = [];
jsFiles.forEach(f => {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bqrIco\(\s*'([\w-]+)'\s*\)/g)) {
    if (!emojiMap[m[1]]) oneArg.push(path.relative(APP, f) + " qrIco('" + m[1] + "')");
  }
});
ok('every single-argument qrIco() call resolves to an emoji',
  oneArg.length === 0, oneArg.length ? oneArg.join('; ') : 'all resolve');

/* ── 4. the CSS theme split is intact in BOTH directions ───────────────────────────────────────── */
ok('Playful collapses the emoji text node',
  /html\.theme-playful\s+\.qr-ico\s*\{[^}]*font-size:\s*0\s*!important/.test(css));
ok('Classic restores the glyph',
  /html:not\(\.theme-playful\)\s+\.qr-ico\s*\{[^}]*font-size:\s*var\(--qr-ico-em\)/.test(css));
ok('Classic suppresses the SVG mask',
  /html:not\(\.theme-playful\)\s+\.qr-ico::before\s*\{\s*content:\s*none/.test(css));
ok('Playful paints the SVG mask', /\.qr-ico::before\s*\{[^}]*mask:\s*var\(--ico\)/.test(css));

/* ── 5. no bare chrome emoji left in static markup ─────────────────────────────────────────────── */
/* Translated strings are excluded by rule: their glyphs live in the locale catalogues, and rewriting
   translations is explicitly out of scope for a visual restoration.

   ADR-136 — that exemption was too coarse and hid a real offender for four ADRs. The Quick Study
   "customize" button carried `data-i18n-attr="title:…;aria-label:…"`, which translates ATTRIBUTES
   only; its text node — a bare ✏️ — was authored right here in index.html. The old test matched
   `data-i18n(-html|-attr)?=` anywhere on the line and waved it through, so the one colour emoji on a
   screen of line icons was invisible to the gate that exists to catch exactly that.

   Two corrections:
     - only `data-i18n` / `data-i18n-html` exempt a line, because only those own the TEXT. A line
       whose sole i18n hook is `data-i18n-attr` still has an author-written text node.
     - attributes are stripped before testing, so `title="🔒 …"` no longer needs a blanket exemption
       and a glyph in rendered text can no longer hide behind one.
   Text-presentation marks (✕ U+2715, ⚑ U+2691) are NOT emoji: they render as glyphs in the text font
   in both themes and create no mixed surface. Only default-emoji codepoints and anything carrying the
   emoji presentation selector U+FE0F count. */
const EMOJI = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\u{FE0F}/u;
const strippedHtml = html.replace(ICO_SPAN, '');
const bareChrome = [];
strippedHtml.split('\n').forEach((line, i) => {
  if (/data-i18n(-html)?=/.test(line)) return;               // owned by the locale catalogues
  const rendered = line.replace(/[\w-]+="[^"]*"/g, '').replace(/[\w-]+='[^']*'/g, '');
  if (!EMOJI.test(rendered)) return;                         // attribute text is not a rendered icon
  bareChrome.push((i + 1) + ': ' + line.trim().slice(0, 80));
});
ok('no bare chrome emoji outside .qr-ico in index.html',
  bareChrome.length === 0, bareChrome.length ? bareChrome.join(' | ') : 'clean');

/* ── 6. the SIZING CONTRACT (ADR-132) ──────────────────────────────────────────────────────────────
   An icon's size must be set through the `--qr-ico-size` custom property, never through `width`/
   `height` on `.qr-ico` itself, because the two themes consume the size differently: Playful uses it
   as the mask BOX, Classic as the glyph's FONT-SIZE. A raw width/height therefore cannot describe
   both, and it silently loses to the theme rules anyway — `html:not(.theme-playful) .qr-ico` has
   specificity (0,2,1), which outranks a plain `.some-class .qr-ico` at (0,2,0).

   `em` is banned for the same property for a sharper reason: Playful's masking rule sets
   `font-size: 0`, so ANY em-relative length on a `.qr-ico` resolves to 0px and the icon vanishes
   entirely. Both failure modes shipped — `.kx-status-premium .qr-ico { width:.8em; height:.8em }`
   rendered 24x19px in Classic and 0x0 in Playful, and `.kx-locked-icon .qr-ico { width:2.2rem }` was
   silently overridden to `auto` in Classic. Use rem, or calc() over a rem-based token. */
const ICO_RULE = /(^|\})\s*([^{}]*\.qr-ico[^{}]*)\{([^{}]*)\}/g;
const boxViolations = [], emViolations = [];
for (const m of css.matchAll(ICO_RULE)) {
  const sel = m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
  const body = m[3].replace(/\/\*[\s\S]*?\*\//g, '');
  /* the two theme rules below legitimately own width/height — they ARE the contract's implementation */
  const isContractOwner = /^(\.qr-ico|html\.theme-playful \.qr-ico|html:not\(\.theme-playful\) \.qr-ico)(::before)?$/.test(sel);
  if (!isContractOwner && /(^|;|\s)(width|height)\s*:/.test(body)) boxViolations.push(sel);
  if (/--qr-ico-size\s*:[^;]*\d(\.\d+)?em\b/.test(body) || /(^|;|\s)(width|height)\s*:[^;]*\d(\.\d+)?em\b/.test(body)) emViolations.push(sel);
}
ok('icon size is set via --qr-ico-size, never raw width/height on .qr-ico',
  boxViolations.length === 0,
  boxViolations.length ? boxViolations.join(' | ') : 'no raw box sizing');
ok('icon size never uses em (collapses to 0 against Playful font-size:0)',
  emViolations.length === 0,
  emViolations.length ? emViolations.join(' | ') : 'no em-relative icon sizing');

/* ── 7. no raw inline <svg> used as a CHROME ICON (ADR-133) ───────────────────────────────────────
   Check 5 hunts bare EMOJI outside `.qr-ico`; it is blind to the mirror-image mistake — a raw inline
   <svg> icon, which renders as a monochrome line glyph in Classic among a screen full of emoji. The
   notification bell shipped that way in both the Home header and the Inbox drawer title.

   EXEMPT, and deliberately so:
     - brand marks (the Google logo) — a brand may never be redrawn as an emoji
     - data graphics (the goal progress ring) — a chart, not an icon
     - the auth password show/hide toggles — pre-app chrome, and no emoji reads as "reveal password" */
const EXEMPT_SVG = /auth-google-logo|home-goal-ring|eye-icon-(show|hide)/;
const rawSvg = [];
{
  const re = /<svg[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (EXEMPT_SVG.test(m[0])) continue;
    const line = html.slice(0, m.index).split('\n').length;
    rawSvg.push(line + ': ' + m[0].slice(0, 70));
  }
}
ok('no raw inline <svg> chrome icon outside .qr-ico',
  rawSvg.length === 0, rawSvg.length ? rawSvg.join(' | ') : 'only exempt brand/graphic SVGs remain');

console.log('\nicon-identity.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
