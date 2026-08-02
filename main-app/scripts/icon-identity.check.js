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
   translations is explicitly out of scope for a visual restoration. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const strippedHtml = html.replace(ICO_SPAN, '');
const bareChrome = [];
strippedHtml.split('\n').forEach((line, i) => {
  if (!EMOJI.test(line)) return;
  if (/data-i18n(-html|-attr)?=/.test(line)) return;         // owned by the locale catalogues
  if (/placeholder=|title=|aria-label=/.test(line)) return;  // attribute text, not a rendered icon
  bareChrome.push((i + 1) + ': ' + line.trim().slice(0, 80));
});
ok('no bare chrome emoji outside .qr-ico in index.html',
  bareChrome.length === 0, bareChrome.length ? bareChrome.join(' | ') : 'clean');

console.log('\nicon-identity.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
