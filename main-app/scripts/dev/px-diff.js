/**
 * px-diff.js — deterministic multi-screen / multi-theme screenshot + pixel-diff harness
 * (UI Phase 1 final wave, W0). NOT part of npm test — a dev gate run around risky CSS work.
 *
 * Usage:
 *   node scripts/dev/px-diff.js shoot <tag>              # capture the matrix into <shots>/<tag>/
 *   node scripts/dev/px-diff.js compare <base> <cand> [expected-diffs.json]
 *
 * Flow per wave: `shoot base` at the wave start → edit → `shoot cand` → `compare base cand manifest`.
 * The compare pass loads both PNGs into a headless page and counts pixels whose any-channel delta
 * exceeds 8/255 via canvas getImageData (no native PNG lib needed). A screen FAILS when the
 * differing fraction exceeds 0.25% unless the screen is listed in the expected-diffs manifest
 * (the reviewed, committed record of intentional visual change).
 *
 * Determinism: animations/transitions killed by injected CSS, Date.now frozen and Math.random
 * seeded via addInitScript, fixed localStorage profile, fonts awaited. `shoot` twice on the same
 * tree then `compare` must be all-zero — that self-test is the harness's own acceptance gate.
 */
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');
const SHOTS = process.env.PX_SHOTS_DIR || '/tmp/claude-0/-home-user-QuantReflex/7e53b69d-aca7-5f58-88cb-b12cacc45419/scratchpad/px-shots';
const URL = 'http://localhost:8321/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const THEMES = [
  { name: 'light', settings: { appearance: 'light', hasOnboarded: true } },
  { name: 'dark', settings: { appearance: 'dark', hasOnboarded: true } },
  { name: 'playful', settings: { appearance: 'light', theme: 'playful', hasOnboarded: true } }
];
const VIEWPORT = { width: 390, height: 844 };
const THRESHOLD = 0.0025;   // differing-pixel fraction per screen
const CHANNEL_DELTA = 8;    // 0-255 per-channel tolerance (anti-aliasing noise)

/* Screens: each prepares the view inside the booted page. Best-effort — a screen that throws is
   recorded as skipped (visible in output) rather than failing the run. */
const SCREENS = {
  home:     "Router.showView('home'); try { if (typeof HomeView !== 'undefined' && HomeView.render) HomeView.render(); } catch(_){}",
  practice: "Router.showView('practice');",
  settings: "Router.showView('settings'); try { initSettingsView(); } catch(_){}",
  learn:    "Router.showView('learn'); try { if (typeof LearnView !== 'undefined' && LearnView.renderHub) LearnView.renderHub(); } catch(_){}",
  stats:    "Router.showView('stats'); try { if (typeof StatsView !== 'undefined' && StatsView.render) StatsView.render(); } catch(_){}",
  about:    "Router.showView('settings'); try { initSettingsView(); } catch(_){} try { openInfoModal('aboutModal'); } catch(_){}",
  /* runs after `about` in the same page — close the leftover info modal before rendering */
  quickref: "try { if (typeof _closeAllInfoModals === 'function') _closeAllInfoModals(); } catch(_){} document.querySelectorAll('#aboutModal, .info-modal').forEach(function(m){ m.style.display='none'; }); document.body.classList.remove('modal-open'); Router.showView('learn', { path: 'quick-ref' });"
};

async function boot(page) {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1600);
  await page.evaluate(function () {
    var a = document.getElementById('authScreen'); if (a) a.style.display = 'none';
    var l = document.getElementById('appLoader'); if (l) l.style.display = 'none';
    var c = document.querySelector('.container'); if (c) c.style.display = '';   // auth flow reveals it in production
    var n = document.querySelector('.bottom-nav'); if (n) n.style.display = '';
    document.body.classList.add('auth-resolved');
    try { if (window.Router && !window.__pxr) { window.__pxr = 1; Router.init(); } } catch (_) {}
  });
}

async function shoot(tag) {
  const dir = path.join(SHOTS, tag);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const skipped = [];
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await ctx.addInitScript(function (s) {
      try { localStorage.setItem('qr_settings', JSON.stringify(s)); } catch (_) {}
      /* freeze time + seed randomness for deterministic renders */
      var FIXED = 1780000000000;
      Date.now = function () { return FIXED; };
      var seed = 42;
      Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    }, theme.settings);
    const page = await ctx.newPage();
    /* kill motion so mid-animation frames can't differ */
    await page.addInitScript(function () {
      document.addEventListener('DOMContentLoaded', function () {
        var st = document.createElement('style');
        st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
        document.head.appendChild(st);
      });
    });
    await boot(page);
    for (const [name, prep] of Object.entries(SCREENS)) {
      try {
        await page.evaluate(new Function(prep));
        await page.waitForTimeout(450);
        await page.evaluate(function () { return document.fonts ? document.fonts.ready : null; });
        await page.screenshot({ path: path.join(dir, name + '-' + theme.name + '.png') });
      } catch (e) { skipped.push(name + '-' + theme.name + ': ' + String(e).slice(0, 80)); }
    }
    await ctx.close();
  }
  await browser.close();
  console.log('shot ' + tag + ' -> ' + dir + (skipped.length ? '\n  skipped: ' + skipped.join('; ') : ''));
}

async function compare(baseTag, candTag, manifestPath) {
  const baseDir = path.join(SHOTS, baseTag), candDir = path.join(SHOTS, candTag);
  const expected = manifestPath && fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.png'));
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  let fails = 0;
  for (const f of files) {
    const candPath = path.join(candDir, f);
    if (!fs.existsSync(candPath)) { console.log('  MISSING cand ' + f); fails++; continue; }
    const b64a = fs.readFileSync(path.join(baseDir, f)).toString('base64');
    const b64b = fs.readFileSync(candPath).toString('base64');
    const res = await page.evaluate(async function (args) {
      function load(b64) {
        return new Promise(function (res, rej) {
          var img = new Image();
          img.onload = function () { res(img); };
          img.onerror = rej;
          img.src = 'data:image/png;base64,' + b64;
        });
      }
      var a = await load(args.a), b = await load(args.b);
      if (a.width !== b.width || a.height !== b.height) return { dims: true };
      var w = a.width, h = a.height;
      var ca = document.createElement('canvas'); ca.width = w; ca.height = h;
      var cb = document.createElement('canvas'); cb.width = w; cb.height = h;
      ca.getContext('2d').drawImage(a, 0, 0); cb.getContext('2d').drawImage(b, 0, 0);
      var da = ca.getContext('2d').getImageData(0, 0, w, h).data;
      var db = cb.getContext('2d').getImageData(0, 0, w, h).data;
      var diff = 0;
      for (var i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) > args.tol || Math.abs(da[i + 1] - db[i + 1]) > args.tol ||
            Math.abs(da[i + 2] - db[i + 2]) > args.tol) diff++;
      }
      return { diff: diff, total: w * h };
    }, { a: b64a, b: b64b, tol: CHANNEL_DELTA });
    if (res.dims) { console.log('  DIMS-MISMATCH ' + f); fails++; continue; }
    const frac = res.diff / res.total;
    const key = f.replace('.png', '');
    const isExpected = !!expected[key];
    const status = frac === 0 ? 'ok' : (frac <= THRESHOLD ? 'ok(minor ' + (frac * 100).toFixed(3) + '%)' :
      (isExpected ? 'EXPECTED ' + (frac * 100).toFixed(2) + '% — ' + expected[key] : 'FAIL ' + (frac * 100).toFixed(2) + '%'));
    if (status.startsWith('FAIL')) fails++;
    console.log('  ' + (status.startsWith('FAIL') ? '✗ ' : '✓ ') + key + ': ' + status);
  }
  await browser.close();
  console.log(fails ? 'px-diff: ' + fails + ' FAILED' : 'px-diff: ALL PASS');
  process.exit(fails ? 1 : 0);
}

const [, , cmd, a, b, c] = process.argv;
if (cmd === 'shoot' && a) shoot(a);
else if (cmd === 'compare' && a && b) compare(a, b, c);
else { console.log('usage: px-diff.js shoot <tag> | compare <base> <cand> [manifest.json]'); process.exit(2); }
