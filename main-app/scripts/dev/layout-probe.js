/**
 * layout-probe.js — layout-metric capture and diff (ADR-133). Dev instrument, not part of npm test.
 *
 * Usage:
 *   node scripts/dev/layout-probe.js capture <tag>
 *   node scripts/dev/layout-probe.js diff <before> <after>
 *
 * WHY THIS EXISTS
 * px-diff is the wrong instrument for a spacing normalisation. Snapping ~1350 declarations to a 4px
 * grid moves almost every element by a pixel or two, so a pixel differ reports "everything changed"
 * and carries no signal at all. What actually matters is whether the LAYOUT still works:
 *
 *   - did anything start overflowing its container?
 *   - did anything get clipped?
 *   - did a label start wrapping onto another line?
 *   - did a touch target drop below the 44px usability floor?
 *   - did anything move far enough that the design intent changed, rather than the rhythm?
 *
 * So this records the structural facts per element and diffs those. A 2px shift is expected and
 * uninteresting; a new wrap, a new overflow, or a control falling under 44px is a defect.
 *
 * Elements are keyed by a stable structural path (tag + class + sibling index) rather than by
 * position, so an element that MOVED is still recognised as the same element and can be compared.
 */
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = process.env.LAYOUT_DIR || '/tmp/claude-0/-home-user-QuantReflex/7e53b69d-aca7-5f58-88cb-b12cacc45419/scratchpad/layout';
const URL = 'http://localhost:8321/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TOUCH_MIN = 44;      // px — usability floor for a real control
const MOVE_MAX = 4;        // px — beyond this a spacing snap has changed design intent, not rhythm

const THEMES = [
  { name: 'classic-light', settings: { appearance: 'light' } },
  { name: 'classic-dark', settings: { appearance: 'dark' } },
  { name: 'playful-light', settings: { appearance: 'light', theme: 'playful' } },
  { name: 'playful-dark', settings: { appearance: 'dark', theme: 'playful' } }
];
const WIDTHS = [320, 390, 768, 1024];

const SCREENS = {
  home: "Router.showView('home'); try { HomeView.render(); } catch(_){}",
  practice: "Router.showView('practice');",
  settings: "Router.showView('settings'); try { initSettingsView(); } catch(_){}",
  learn: "Router.showView('learn'); try { LearnView.renderHub(); } catch(_){}",
  stats: "Router.showView('stats'); try { StatsView.render(); } catch(_){}",
  about: "Router.showView('settings'); try { initSettingsView(); } catch(_){} try { openInfoModal('aboutModal'); } catch(_){}",
  quickref: "try { _closeAllInfoModals(); } catch(_){} document.querySelectorAll('#aboutModal, .info-modal').forEach(function(m){ m.style.display='none'; }); document.body.classList.remove('modal-open'); Router.showView('learn', { path: 'quick-ref' });",
  duelsetup: "var m = document.getElementById('duelSetupModal'); m.style.display='flex'; DuelUI.renderSetup(m, { onBack: function(){}, onCreate: function(){} });",
  paywall: "try { showPaywall('advanced_theme'); } catch(_){}"
};

/* in-page: structural facts for every visible element */
function snapshot() {
  function keyOf(el) {
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 6; n = n.parentElement) {
      const cls = (n.className && typeof n.className === 'string')
        ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const sibs = n.parentElement ? Array.prototype.filter.call(n.parentElement.children, c => c.tagName === n.tagName) : [];
      const idx = sibs.length > 1 ? ':' + sibs.indexOf(n) : '';
      parts.unshift(n.tagName.toLowerCase() + cls + idx);
    }
    return parts.join('>');
  }
  const out = {};
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    /* no absolute cutoff: a taller page must not make elements silently "disappear" from the diff */
    const key = keyOf(el);
    if (out[key]) continue;                       // first match wins; keys are structural
    /* a real control: something a finger is meant to hit */
    const tag = el.tagName.toLowerCase();
    const isControl = tag === 'button' || tag === 'a' || tag === 'select' ||
      (tag === 'input' && el.type !== 'hidden') || el.getAttribute('role') === 'button';
    /* text wrapping: how many line boxes does this element's own text occupy */
    let lines = 0;
    const kid = el.firstChild;
    if (kid && kid.nodeType === 3 && kid.nodeValue.trim()) {
      const rg = document.createRange(); rg.selectNodeContents(el);
      lines = rg.getClientRects().length;
    }
    /* Position is recorded RELATIVE TO THE PARENT. Absolute position accumulates: one extra pixel in
       a header shifts every element below it, so an absolute metric reports thousands of "moves" for
       a change that altered nothing structurally. Parent-relative offset plus size is what actually
       describes the layout. */
    const pr = el.parentElement ? el.parentElement.getBoundingClientRect() : { left: 0, top: 0 };
    out[key] = {
      x: Math.round((r.left - pr.left) * 10) / 10, y: Math.round((r.top - pr.top) * 10) / 10,
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      /* Overflow only counts where content is genuinely CONSTRAINED. On an `overflow: visible` box the
         content paints outside the border box and nothing is lost — flagging that reports a defect
         where a user sees none (an emoji line box overhanging its row by 2px, for instance). */
      ovX: (el.scrollWidth - el.clientWidth > 1) && cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' ? 1 : 0,
      ovY: (el.scrollHeight - el.clientHeight > 1) && cs.overflowY !== 'visible' && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' ? 1 : 0,
      clip: cs.overflow === 'hidden' && (el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1) ? 1 : 0,
      lines: lines,
      ctl: isControl ? 1 : 0
    };
  }
  return { els: out, docH: document.documentElement.scrollHeight };
}

async function boot(page) {
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1700);
  await page.evaluate(function () {
    var a = document.getElementById('authScreen'); if (a) a.style.display = 'none';
    var l = document.getElementById('appLoader'); if (l) l.style.display = 'none';
    var c = document.querySelector('.container'); if (c) c.style.display = '';
    var n = document.querySelector('.bottom-nav'); if (n) n.style.display = '';
    document.body.classList.add('auth-resolved');
    window.canAccessFeature = function () { return true; };
    try { if (window.Router && !window.__lp) { window.__lp = 1; Router.init(); } } catch (_) {}
  });
}

async function capture(tag) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const data = {};
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
      await ctx.addInitScript(function (s) {
        try { localStorage.setItem('qr_settings', JSON.stringify(s)); } catch (_) {}
        var F = 1780000000000; Date.now = function () { return F; };
        var seed = 42; Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      }, Object.assign({ hasOnboarded: true }, theme.settings));
      const page = await ctx.newPage();
      await page.addInitScript(function () {
        document.addEventListener('DOMContentLoaded', function () {
          var st = document.createElement('style');
          st.textContent = '*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;animation-fill-mode:forwards!important;transition-duration:.001s!important;transition-delay:0s!important}';
          document.head.appendChild(st);
        });
      });
      try { await boot(page); } catch (e) { await ctx.close(); continue; }
      for (const [screen, prep] of Object.entries(SCREENS)) {
        try {
          await page.evaluate(new Function(prep));
          await page.waitForTimeout(380);
          data[theme.name + '|' + width + '|' + screen] = await page.evaluate(snapshot);
        } catch (_) { /* screen unavailable in this config */ }
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, tag + '.json'), JSON.stringify(data));
  const n = Object.values(data).reduce((s, v) => s + Object.keys(v.els).length, 0);
  console.log('layout-probe: captured ' + tag + ' — ' + Object.keys(data).length + ' contexts, ' + n + ' element records');
}

function diff(a, b) {
  const A = JSON.parse(fs.readFileSync(path.join(OUT, a + '.json'), 'utf8'));
  const B = JSON.parse(fs.readFileSync(path.join(OUT, b + '.json'), 'utf8'));
  const f = { overflow: [], clip: [], wrap: [], touch: [], moved: [], gone: [] };
  let compared = 0;
  for (const ctxKey of Object.keys(A)) {
    if (!B[ctxKey]) { f.gone.push(ctxKey + ' (whole context missing)'); continue; }
    const ea = A[ctxKey].els, eb = B[ctxKey].els;
    for (const k of Object.keys(ea)) {
      const x = ea[k], y = eb[k];
      if (!y) { f.gone.push(ctxKey + ' ' + k); continue; }
      compared++;
      if (!x.ovX && y.ovX) f.overflow.push(ctxKey + ' ' + k + ' (x)');
      if (!x.ovY && y.ovY) f.overflow.push(ctxKey + ' ' + k + ' (y)');
      if (!x.clip && y.clip) f.clip.push(ctxKey + ' ' + k);
      if (x.lines && y.lines && y.lines > x.lines) f.wrap.push(ctxKey + ' ' + k + ' ' + x.lines + '->' + y.lines);
      /* ADR-134: flag ANY control that shrinks while under the floor, not only one that CROSSES it.
         The crossing-only test let a real regression through: .training-card-back was already 38.8px,
         so 38.8 -> 34 was invisible to the gate even though it made an under-sized target worse. */
      const ta = Math.min(x.w, x.h), tb = Math.min(y.w, y.h);
      if (x.ctl && tb < ta && tb < TOUCH_MIN)
        f.touch.push(ctxKey + ' ' + k + ' ' + ta + '->' + tb + (ta >= TOUCH_MIN ? ' (crossed the floor)' : ' (already under the floor, shrank further)'));
      /* Position and SIZE are judged separately. A tall list legitimately grows a few hundred px when
         every row gains a pixel of rhythm — that is the change working, not a defect. What would be a
         defect is an element shifting away from its parent's edge, or a small control resizing. */
      const shift = Math.max(Math.abs(x.x - y.x), Math.abs(x.y - y.y));
      const resize = Math.max(Math.abs(x.w - y.w), Math.abs(x.h - y.h));
      if (shift > MOVE_MAX) f.moved.push({ where: ctxKey + ' ' + k, d: Math.round(shift * 10) / 10, kind: 'shift' });
      else if (resize > MOVE_MAX && x.h < 200 && y.h < 200) f.moved.push({ where: ctxKey + ' ' + k, d: Math.round(resize * 10) / 10, kind: 'resize' });
    }
  }
  f.moved.sort((p, q) => q.d - p.d);
  console.log('layout-probe diff ' + a + ' -> ' + b + '  (' + compared + ' elements compared)');
  const show = (name, arr, fmt) => {
    console.log('  ' + name.padEnd(22) + arr.length);
    arr.slice(0, 10).forEach(v => console.log('      ' + (fmt ? fmt(v) : v)));
    if (arr.length > 10) console.log('      … +' + (arr.length - 10) + ' more');
  };
  show('NEW overflow', f.overflow);
  show('NEW clipping', f.clip);
  show('NEW text wrap', f.wrap);
  show('touch-target regress', f.touch);
  show('moved > ' + MOVE_MAX + 'px', f.moved, v => v.d + 'px  ' + v.where);
  show('disappeared', f.gone);
  const fail = f.overflow.length + f.clip.length + f.wrap.length + f.touch.length + f.gone.length;
  console.log(fail === 0 && f.moved.length === 0 ? '\nlayout-probe: CLEAN' : '\nlayout-probe: ' + fail + ' hard failures, ' + f.moved.length + ' large moves to review');
  fs.writeFileSync(path.join(OUT, 'diff-' + a + '-' + b + '.json'), JSON.stringify(f, null, 1));
}

const [, , cmd, a, b] = process.argv;
if (cmd === 'capture' && a) capture(a);
else if (cmd === 'diff' && a && b) diff(a, b);
else { console.log('usage: layout-probe.js capture <tag> | diff <before> <after>'); process.exit(2); }
