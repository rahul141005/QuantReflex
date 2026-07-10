/**
 * style-eq.js — computed-style equality harness (FW-W3; reused by the W7f override-deletion proof).
 * NOT part of npm test — a dev gate run around refactors that must be computed-value-neutral
 * (co-declaring component rules onto primitives, deleting redundant theme overrides).
 *
 * Usage:
 *   node scripts/dev/style-eq.js snap <tag>          # dump computed styles → <shots>/style-eq-<tag>.json
 *   node scripts/dev/style-eq.js diff <base> <cand>  # per theme/viewport/probe/element property diff
 *
 * Each probe's markup is injected into the real booted app (real style.css), computed styles of the
 * marked elements are dumped across 4 themes × 2 viewports (phone / ≥600px sheet breakpoint). The
 * diff prints every changed property — the reviewer classifies each as intended or a regression.
 */
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = process.env.PX_SHOTS_DIR || '/tmp/claude-0/-home-user-QuantReflex/7e53b69d-aca7-5f58-88cb-b12cacc45419/scratchpad/px-shots';
const URL = 'http://localhost:8321/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const THEMES = { light: '', dark: 'dark-mode', playful: 'theme-playful', playfulDark: 'theme-playful dark-mode' };
const VIEWPORTS = [{ w: 390, h: 844 }, { w: 800, h: 900 }];

/* Probe markup; every element carrying data-eq="<name>" is dumped. */
const PROBES = [
  '<input class="goal-input" data-eq="goal-input">',
  '<input class="modal-input" data-eq="modal-input">',
  '<div class="timer-pill-selector" data-eq="segment"><button class="timer-pill" data-eq="pill">A</button><button class="timer-pill active" data-eq="pill-active">B</button></div>',
  '<div class="settings-row" data-eq="settings-row"><div class="settings-label"><h3>t</h3></div></div>',
  '<div class="report-sheet-overlay" data-eq="rpt-overlay"><div class="report-sheet" data-eq="rpt-sheet"><div class="report-sheet-grabber" data-eq="rpt-grabber"></div></div></div>',
  '<div class="companion-overlay" data-eq="cpn-overlay"><div class="companion-sheet" data-eq="cpn-sheet"><div class="companion-grabber" data-eq="cpn-grabber"></div></div></div>',
  '<div class="ba-skeleton" data-eq="skel"><div class="ba-skel-row" data-eq="skel-row"></div></div>',
  '<button class="info-toc-chip" data-eq="toc-chip">A</button>',
  '<div class="qr-empty-state" data-eq="empty"><h2 data-eq="empty-h2">A</h2><p data-eq="empty-p">B</p></div>',
  '<div class="quick-link-option" data-eq="qlo"><input type="checkbox"><span>x</span></div>'
];

async function snap(tag) {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const out = {};
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('qr_settings', JSON.stringify({ appearance: 'light', hasOnboarded: true })); } catch (_) {} });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);
    for (const [themeName, htmlClass] of Object.entries(THEMES)) {
      const dump = await page.evaluate(function (args) {
        document.documentElement.className = args.htmlClass;
        var host = document.createElement('div');
        host.id = '__eqHost';
        document.body.appendChild(host);
        var res = {};
        args.probes.forEach(function (html, i) {
          host.innerHTML = html;
          host.querySelectorAll('[data-eq]').forEach(function (el) {
            var cs = getComputedStyle(el);
            var o = {};
            for (var p = 0; p < cs.length; p++) { var k = cs[p]; o[k] = cs.getPropertyValue(k); }
            res[i + ':' + el.getAttribute('data-eq')] = o;
          });
        });
        host.remove();
        document.documentElement.className = '';
        return res;
      }, { htmlClass, probes: PROBES });
      out[vp.w + 'x' + vp.h + '/' + themeName] = dump;
    }
    await ctx.close();
  }
  await browser.close();
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'style-eq-' + tag + '.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('snapped ' + file);
}

function diff(a, b) {
  const A = JSON.parse(fs.readFileSync(path.join(OUT, 'style-eq-' + a + '.json'), 'utf8'));
  const B = JSON.parse(fs.readFileSync(path.join(OUT, 'style-eq-' + b + '.json'), 'utf8'));
  let changes = 0;
  for (const scope of Object.keys(A)) {
    for (const el of Object.keys(A[scope])) {
      const pa = A[scope][el], pb = (B[scope] || {})[el] || {};
      const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
      for (const k of keys) {
        /* custom properties (--*) are implementation detail; computed longhands carry the truth */
        if (k.startsWith('--')) continue;
        if ((pa[k] || '') !== (pb[k] || '')) {
          console.log(scope + ' ' + el + ' :: ' + k + ' : "' + (pa[k] || '') + '" -> "' + (pb[k] || '') + '"');
          changes++;
        }
      }
    }
  }
  console.log(changes ? 'style-eq: ' + changes + ' property change(s) — review each' : 'style-eq: IDENTICAL');
}

const [, , cmd, a, b] = process.argv;
if (cmd === 'snap' && a) snap(a);
else if (cmd === 'diff' && a && b) diff(a, b);
else { console.log('usage: style-eq.js snap <tag> | diff <base> <cand>'); process.exit(2); }
