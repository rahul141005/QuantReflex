/**
 * theme-entitlement.check.js — ADR-137.
 *
 * Playful Professional is a PREMIUM theme, and before this ADR exactly one code path enforced that:
 * `initSettingsView()`. Every other path applied the theme straight from persisted settings — the
 * pre-paint head script, the boot IIFE in app.js, and the post-hydration applyTheme() call. The
 * consequence was not subtle: a user whose subscription lapsed kept the premium theme through every
 * cold start, warm start, offline launch and restore, forever, unless they happened to open Settings.
 *
 * The repair makes `applyTheme()` the single enforcement point. This file exists so that stays true.
 * Four properties are asserted, each of which failed at some point during implementation:
 *
 *   1. NO boot path adds `theme-playful` without consulting entitlement. A future refactor that
 *      "simplifies" app.js back to `settings.theme === 'playful'` reopens the hole silently.
 *
 *   2. The pre-paint predicate stays in LOCKSTEP with settings.js `themeHintValid()`. The head script
 *      cannot call into a module, so the rule is duplicated by necessity; duplication that nobody
 *      checks is duplication that drifts.
 *
 *   3. The hint NEVER becomes an entitlement source. `qr_theme_ent` is allowed to gate one CSS class.
 *      The moment paywall.js / entitlement-core.js / firestore-sync.js reads it, a value the user can
 *      edit in devtools starts influencing real premium decisions. That is the failure mode this key
 *      is one careless commit away from, so it is asserted rather than trusted.
 *
 *   4. `applyTheme()` is genuinely tri-state. Collapsing unknown→not-entitled looks like a
 *      simplification and is a worse bug than the original: entitlement is unknowable before Firestore
 *      hydration, so every launch would downgrade and PERSIST classic, stripping a paying user's theme.
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
const settingsJs = fs.readFileSync(path.join(APP, 'js', 'settings.js'), 'utf8');
const appJs = fs.readFileSync(path.join(APP, 'js', 'app.js'), 'utf8');

console.log('Theme entitlement — Playful Professional is premium on EVERY boot path (ADR-137)\n');

/* ── 1. applyTheme is the single enforcement point ─────────────────────────────────────────────── */
ok('applyTheme() consults entitlement',
  /function applyTheme\([\s\S]{0,700}?themeEntitlement\(\)/.test(settingsJs));

ok('applyTheme() is tri-state (unknown never persists a downgrade)',
  /return 'unknown'/.test(settingsJs) &&
  /ent === 'unknown' && themeHintValid\(\)/.test(settingsJs) &&
  /ent === 'no'/.test(settingsJs),
  'yes / no / unknown all present');

ok('themeEntitlement() fails closed on throw and on absent access state',
  /catch \(_\) \{ return 'unknown'; \}/.test(settingsJs) &&
  /if \(!st\) return 'unknown';/.test(settingsJs));

/* ── 2. no ungated boot path ───────────────────────────────────────────────────────────────────── */
/* Any site that adds the class must be applyTheme itself, or route through it. */
const addsPlayful = [];
[['index.html', html], ['js/app.js', appJs], ['js/settings.js', settingsJs]].forEach(([name, src]) => {
  src.split('\n').forEach((line, i) => {
    if (!/classList\.(add|toggle)\(\s*'theme-playful'/.test(line)) return;
    addsPlayful.push({ name, line: i + 1, text: line.trim() });
  });
});
/* index.html's single site must be guarded by the hint; app.js must not have one at all;
   settings.js's is applyTheme's own toggle. */
const htmlSites = addsPlayful.filter(s => s.name === 'index.html');
const appSites = addsPlayful.filter(s => s.name === 'js/app.js');
const setSites = addsPlayful.filter(s => s.name === 'js/settings.js');

ok('index.html applies theme-playful exactly once, gated by the hint',
  htmlSites.length === 1 && /entOk/.test(htmlSites[0].text),
  htmlSites.length + ' site(s)');
ok('app.js never applies theme-playful itself (it must call applyTheme)',
  appSites.length === 0 && /applyTheme\(settings\.theme\)/.test(appJs),
  appSites.length ? appSites.map(s => s.line).join(',') : 'routes through applyTheme');
ok('settings.js applies theme-playful only inside applyTheme()',
  setSites.length === 1, setSites.length + ' site(s)');

/* Every applyTheme call site passes the *saved* theme, never a hardcoded 'playful'. */
const forced = [...appJs.matchAll(/applyTheme\(\s*'playful'\s*\)/g)].length +
               [...settingsJs.matchAll(/applyTheme\(\s*'playful'\s*\)/g)].length;
ok('no call site hardcodes applyTheme(\'playful\')', forced === 0);

/* ── 3. the pre-paint predicate is in lockstep with themeHintValid() ───────────────────────────── */
const KEY = 'qr_theme_ent';
ok('the hint key name matches on both sides',
  html.indexOf("'" + KEY + "'") !== -1 && settingsJs.indexOf("'" + KEY + "'") !== -1);

/* Both sides are reduced to a canonical predicate string and compared for EQUALITY, rather than each
   being spot-checked against a pattern loose enough to pass on two different rules. The key reference
   is normalised (the head script must inline the literal; settings.js uses its constant), whitespace
   is collapsed, and the result must match character for character. */
function canonicalPredicate(src) {
  const m = src.match(/parseInt\(\s*localStorage\.getItem\(\s*(?:THEME_ENT_KEY|'qr_theme_ent')\s*\)\s*\|\|\s*'0'\s*,\s*10\s*\)/);
  if (!m) return null;
  /* the comparison that consumes it, within the same statement/return */
  const after = src.slice(src.indexOf(m[0]) + m[0].length, src.indexOf(m[0]) + m[0].length + 120);
  const cmp = after.match(/^\s*>\s*Date\.now\(\)/) ? '> Date.now()'
            : /(?:^|[;\s])(?:return\s+)?v\s*>\s*Date\.now\(\)/.test(after) ? '> Date.now()' : null;
  return cmp ? "parseInt(localStorage.getItem(KEY)||'0',10) " + cmp : null;
}
const preHtml = canonicalPredicate(html);
const preJs = canonicalPredicate(settingsJs);
ok('pre-paint predicate === settings.js themeHintValid(), character for character',
  preHtml !== null && preJs !== null && preHtml === preJs,
  preHtml === null ? 'index.html predicate not found'
    : preJs === null ? 'settings.js predicate not found'
    : preHtml === preJs ? preHtml : 'DRIFTED: ' + preHtml + '  vs  ' + preJs);

/* ── 4. the hint can never become an entitlement source ────────────────────────────────────────── */
const FORBIDDEN = ['js/paywall.js', 'data/entitlement-core.js', 'js/firestore-sync.js'];
const leaked = FORBIDDEN.filter(rel => {
  const p = path.join(APP, rel);
  return fs.existsSync(p) && fs.readFileSync(p, 'utf8').indexOf(KEY) !== -1;
});
ok('the hint is never read by the entitlement system',
  leaked.length === 0,
  leaked.length ? 'LEAKED into: ' + leaked.join(', ') : FORBIDDEN.length + ' modules clean');

/* It must also be written only from settings.js — one writer, one rule. */
function walk(dir, acc) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('.js')) acc.push(p);
  }
  return acc;
}
const writers = walk(path.join(APP, 'js'), [])
  .filter(f => /setItem\(\s*THEME_ENT_KEY|setItem\(\s*'qr_theme_ent'/.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(APP, f));
ok('exactly one module writes the hint', writers.length === 1 && writers[0] === 'js/settings.js',
  writers.join(', ') || 'none');

/* ── 5. the hint is purged on account change ───────────────────────────────────────────────────── */
/* storage-registry classifies unknown qr_* keys as user-scoped (purged). Assert the key is NOT on a
   survivor list — if someone registers it as installation-scoped, it would outlive a logout. */
const registry = fs.readFileSync(path.join(APP, 'js', 'state', 'storage-registry.js'), 'utf8');
const store = fs.readFileSync(path.join(APP, 'js', 'state', 'store.js'), 'utf8');
const survivesRegistry = new RegExp("'" + KEY + "'").test(registry);
const survivesFallback = new RegExp("'" + KEY + "'").test(store);
ok('the hint is user-scoped, so logout / account switch purges it',
  !survivesRegistry && !survivesFallback && /qr_/.test(registry),
  survivesRegistry || survivesFallback ? 'listed as a SURVIVOR — it would outlive a logout' : 'unregistered ⇒ purged by the fail-safe default');

console.log('\ntheme-entitlement.check: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
