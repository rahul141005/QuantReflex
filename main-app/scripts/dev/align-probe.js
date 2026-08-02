/**
 * align-probe.js — icon/label optical-alignment measurement harness (ADR-131, Issue 4).
 * NOT part of npm test — a dev instrument, same class as px-diff.js.
 *
 * Usage:
 *   node scripts/dev/align-probe.js [--full] [--out report.json]
 *
 * WHY THIS EXISTS
 * P1-final Wave B rewrote text-node emoji (`🗑️ Clear Data`, one glyph sitting on the text baseline)
 * into `<span class="qr-ico">…</span><span>text</span>` — an inline-flex box positioned by a single
 * `vertical-align` constant tuned for a masked SVG square. A glyph and a square do not share an
 * optical centre, so that one constant cannot be right for both icon languages. ADR-131 restores
 * emoji in Classic, which makes the mismatch worse unless alignment is re-tuned WITH it.
 *
 * WHAT IT MEASURES (and why this way)
 * For every visible icon/label pair that shares a line:
 *   icon  → INK centre, from the rendered pixels. Not the element box: an emoji's box and its
 *           visible glyph are not concentric, and neither are a mask's box and its artwork. Ink is
 *           what the eye actually aligns to, so ink is what we measure.
 *   label → CAP-HEIGHT centre, derived from the text's own font metrics. Deliberately NOT ink:
 *           ink would move with descenders, so "Language" and "Practice" would report different
 *           offsets for identical rendering. Cap centre is the typographic reference the icon
 *           should sit on.
 * delta = iconInkCentre − labelCapCentre, in CSS px. Positive = icon rides low.
 *
 * The pixels come from ONE viewport screenshot per screen, analysed in-page via canvas
 * getImageData (the px-diff trick — no native PNG lib). Nothing in the DOM is mutated before the
 * shot, so the measurement is of exactly what shipped on screen.
 *
 * Ink is separated from background by modal-colour subtraction rather than a fixed background
 * assumption, because these surfaces sit on gradients, veils and translucent panels.
 */
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');
const URL = 'http://localhost:8321/index.html';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TOL = 1.0;            // px — the plan's acceptance bar
const INK_DELTA = 26;       // per-channel distance from the modal background colour to count as ink

const SCREENS = {
  home:     "Router.showView('home'); try { if (typeof HomeView !== 'undefined' && HomeView.render) HomeView.render(); } catch(_){}",
  practice: "Router.showView('practice');",
  settings: "Router.showView('settings'); try { initSettingsView(); } catch(_){}",
  learn:    "Router.showView('learn'); try { if (typeof LearnView !== 'undefined' && LearnView.renderHub) LearnView.renderHub(); } catch(_){}",
  stats:    "Router.showView('stats'); try { if (typeof StatsView !== 'undefined' && StatsView.render) StatsView.render(); } catch(_){}",
  about:    "Router.showView('settings'); try { initSettingsView(); } catch(_){} try { openInfoModal('aboutModal'); } catch(_){}",
  quickref: "try { if (typeof _closeAllInfoModals === 'function') _closeAllInfoModals(); } catch(_){} document.querySelectorAll('#aboutModal, .info-modal').forEach(function(m){ m.style.display='none'; }); document.body.classList.remove('modal-open'); Router.showView('learn', { path: 'quick-ref' });",
  duelsetup: "var m = document.getElementById('duelSetupModal'); m.style.display = 'flex'; DuelUI.renderSetup(m, { onBack: function () {}, onCreate: function () {} });"
};

const FULL = process.argv.includes('--full');
const OUT = (function () { const i = process.argv.indexOf('--out'); return i > -1 ? process.argv[i + 1] : null; })();

/* Playful Professional is a PREMIUM theme: initSettingsView() downgrades a free profile to classic
   and persists it (settings.js — `advanced_theme`). That is correct product behaviour, but it means a
   harness seeded as a free user silently measures Classic in every "playful" config from the settings
   screen onward. The premium entitlement below is what makes the Playful matrix real; `free: true`
   keeps one classic pass for the locked surfaces (lock chips, paywall CTAs) that premium hides. */
const THEMES = [
  { name: 'classic-light',  settings: { appearance: 'light' } },
  { name: 'classic-dark',   settings: { appearance: 'dark' } },
  { name: 'playful-light',  settings: { appearance: 'light', theme: 'playful' } },
  { name: 'playful-dark',   settings: { appearance: 'dark',  theme: 'playful' } },
  { name: 'classic-free',   settings: { appearance: 'light' }, free: true }
];
const LOCALES = FULL ? ['en', 'hi', 'mr'] : (process.env.AP_LOCALES ? process.env.AP_LOCALES.split(',') : ['en']);
const WIDTHS  = FULL ? [320, 390, 768, 1024] : [390];

/* ── in-page: collect every icon/label pair with its geometry and typographic reference ──────── */
function collectPairs() {
  function visible(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }
  /* Ink is read from the composited screenshot, so anything painted OVER the element would be
     measured as if it were the element. A modal turns an untouched header into an 11px "offset"
     that way. Hit-test the element and refuse to measure it unless it is what the user can see. */
  function unoccluded(el) {
    var r = el.getBoundingClientRect();
    var pts = [[r.left + r.width / 2, r.top + r.height / 2],
               [r.left + r.width * 0.25, r.top + r.height * 0.25],
               [r.left + r.width * 0.75, r.top + r.height * 0.75]];
    for (var i = 0; i < pts.length; i++) {
      var hit = document.elementFromPoint(pts[i][0], pts[i][1]);
      if (!hit) return false;
      if (hit !== el && !el.contains(hit) && !hit.contains(el)) return false;
    }
    return true;
  }
  /* first non-empty text node after the icon, within the icon's own labelled group */
  function labelOf(ico) {
    var scope = ico.parentElement;
    for (var hop = 0; hop < 3 && scope; hop++) {
      var w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (ico.contains(n)) return NodeFilter.FILTER_REJECT;              // the icon's own emoji fallback
          if (!(ico.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) return NodeFilter.FILTER_REJECT;
          var p = n.parentElement;
          if (!p || !visible(p)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var n = w.nextNode();
      if (n) return n;
      scope = scope.parentElement;
    }
    return null;
  }
  var cv = document.createElement('canvas').getContext('2d');
  var out = [];
  Array.prototype.forEach.call(document.querySelectorAll('.qr-ico'), function (ico, i) {
    if (!visible(ico) || !unoccluded(ico)) return;
    var node = labelOf(ico);
    if (!node || !unoccluded(node.parentElement)) return;
    var ir = ico.getBoundingClientRect();
    var rng = document.createRange(); rng.selectNodeContents(node);
    var lr = rng.getBoundingClientRect();
    if (!lr.width || !lr.height) return;
    /* same-line only: excludes stacked layouts such as the bottom nav (icon ABOVE label), where a
       vertical delta is the intended design rather than a defect */
    var ov = Math.min(ir.bottom, lr.bottom) - Math.max(ir.top, lr.top);
    if (ov < 0.6 * Math.min(ir.height, lr.height)) return;
    if (lr.left < ir.right - 2) return;

    /* An icon set beside a MULTI-LINE text block is meant to centre on the block, not on the first
       line's cap height — `⚡ [Start Training / 5-question daily warmup]` reads as an 8px "defect"
       against a first-line reference when it is in fact correct. Find the block the icon is actually
       paired with and count its rendered lines to pick the right reference. */
    var ref = node.parentElement;
    while (ref && ref.parentElement && ref.parentElement !== ico.parentElement) ref = ref.parentElement;
    /* Only a ref that really is the icon's own sibling describes a paired block. When the label lives
       in a different subtree the walk runs to the document root, and its centre is meaningless — fall
       back to the line reference instead of reporting a 300px "offset". */
    if (!ref || ref.parentElement !== ico.parentElement) ref = null;
    var lines = 1;
    if (ref) {
      var rr = document.createRange(); rr.selectNodeContents(ref);
      lines = Math.max(1, rr.getClientRects().length);
    }
    var blockRef = null;
    if (lines > 1 && ref) {
      var br = ref.getBoundingClientRect();
      blockRef = br.top + br.height / 2;
    }

    var cs = getComputedStyle(node.parentElement);
    cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    /* CALIBRATION LIMIT — this reference is valid for LATIN labels only, and the numbers say so.
       Against Devanagari, `H` produces a constant +2.00px offset on every surface with the variance
       unchanged (sd 0.24 in en, hi and mr alike); switching the reference to the label's own ink
       ascent moves that same offset to about +4.6px while leaving every English number untouched.
       Two reference definitions, two different Devanagari answers, one unchanged English answer: it
       is the REFERENCE that moves, not the icon. Devanagari's optical centre sits on the shirorekha
       rather than at half the ink ascent (tall matras are sparse accents, not the body of the text),
       and measuring that reliably is a separate problem. So hi/mr results are reported as OUTSIDE
       the instrument's calibrated range rather than as defects — the icon geometry is identical
       across locales, since nothing in the CSS keys off language. */
    var m = cv.measureText('H');
    var fAsc = m.fontBoundingBoxAscent, fDesc = m.fontBoundingBoxDescent;
    var cap = m.actualBoundingBoxAscent;
    /* A text range's rect is the font's em box (ascent+descent), independent of line-height. If that
       identity does not hold the metrics are not describing this render, so refuse to report a
       number rather than report a wrong one. */
    var metricsOk = Math.abs(lr.height - (fAsc + fDesc)) <= 1.5 && cap > 0;
    var baseline = lr.top + fAsc;
    out.push({
      idx: i,
      ico: ico.getAttribute('data-ico') || '?',
      label: node.nodeValue.trim().slice(0, 22),
      sel: (function (e) {
        var p = [];
        for (var n2 = e; n2 && n2 !== document.body && p.length < 3; n2 = n2.parentElement) {
          p.unshift(n2.tagName.toLowerCase() + (n2.className && typeof n2.className === 'string'
            ? '.' + n2.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
        }
        return p.join('>');
      })(ico.parentElement),
      iconRect: { x: ir.left, y: ir.top, w: ir.width, h: ir.height },
      capCentre: blockRef !== null ? blockRef : (metricsOk ? (baseline - cap / 2) : null),
      mode: blockRef !== null ? 'block' : 'line',
      metricsOk: blockRef !== null ? true : metricsOk,
      fontSize: cs.fontSize,
      display: getComputedStyle(ico.parentElement).display
    });
  });
  return out;
}

/* ── in-page: ink bounding box of each icon rect, from the screenshot ─────────────────────────── */
async function inkPass(arg) {
  var b64 = arg.b64, pairs = arg.pairs, INK_DELTA = arg.inkDelta;
  var img = await new Promise(function (res, rej) {
    var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej;
    im.src = 'data:image/png;base64,' + b64;
  });
  var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  /* Background is estimated from the RING of padding OUTSIDE the icon box, never from the box's own
     contents. A modal-colour estimate silently fails whenever the icon fills most of its own box —
     the icon then becomes the "background" and the pass reports "no ink", which is how the About
     modal's section-title icons went unmeasured (and therefore untuned) in the first pass. */
  var PAD = 4;
  return pairs.map(function (p) {
    var x = Math.max(0, Math.floor(p.iconRect.x - PAD)), y = Math.max(0, Math.floor(p.iconRect.y - PAD));
    var w = Math.min(img.width - x, Math.ceil(p.iconRect.w + PAD * 2));
    var h = Math.min(img.height - y, Math.ceil(p.iconRect.h + PAD * 2));
    if (w < 2 * PAD + 2 || h < 2 * PAD + 2) return { why: 'crop clamped ' + w + 'x' + h };
    var d = ctx.getImageData(x, y, w, h).data;
    var sr = 0, sg = 0, sb = 0, nn = 0, yy, xx, o;
    for (yy = 0; yy < h; yy++) {
      for (xx = 0; xx < w; xx++) {
        if (yy >= PAD && yy < h - PAD && xx >= PAD && xx < w - PAD) continue;
        o = (yy * w + xx) * 4; sr += d[o]; sg += d[o + 1]; sb += d[o + 2]; nn++;
      }
    }
    var br = sr / nn, bg = sg / nn, bb = sb / nn;
    var minY = 1e9, maxY = -1e9, count = 0;
    for (yy = PAD; yy < h - PAD; yy++) {
      for (xx = PAD; xx < w - PAD; xx++) {
        o = (yy * w + xx) * 4;
        if (d[o + 3] < 8) continue;
        if (Math.abs(d[o] - br) > INK_DELTA || Math.abs(d[o + 1] - bg) > INK_DELTA || Math.abs(d[o + 2] - bb) > INK_DELTA) {
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
          count++;
        }
      }
    }
    if (count < 4) return { why: 'flat vs backdrop rgb(' + Math.round(br) + ',' + Math.round(bg) + ',' + Math.round(bb) + ')' };
    return { inkTop: y + minY, inkBottom: y + maxY + 1, inkPx: count };
  });
}

async function boot(page) {
  await page.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await page.waitForTimeout(1600);
  await page.evaluate(function () {
    var a = document.getElementById('authScreen'); if (a) a.style.display = 'none';
    var l = document.getElementById('appLoader'); if (l) l.style.display = 'none';
    var c = document.querySelector('.container'); if (c) c.style.display = '';
    var n = document.querySelector('.bottom-nav'); if (n) n.style.display = '';
    document.body.classList.add('auth-resolved');
    try { if (window.Router && !window.__apr) { window.__apr = 1; Router.init(); } } catch (_) {}
  });
}

(async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const rows = [];
  const skipped = [];
  for (const theme of THEMES) {
    for (const locale of LOCALES) {
      for (const width of WIDTHS) {
        const cfg = theme.name + '/' + locale + '/' + width;
        const settings = Object.assign({ hasOnboarded: true, appLanguage: locale, studyLanguage: locale }, theme.settings);
        const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
        await ctx.addInitScript(function (s) {
          try { localStorage.setItem('qr_settings', JSON.stringify(s)); } catch (_) {}
          var FIXED = 1780000000000; Date.now = function () { return FIXED; };
          var seed = 42; Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        }, settings);
        const page = await ctx.newPage();
        await page.addInitScript(function () {
          document.addEventListener('DOMContentLoaded', function () {
            var st = document.createElement('style');
            /* Collapse motion to zero DURATION rather than removing it. `animation:none` freezes an
               entry animation at its FIRST frame, so opacity-0 intro sections (the About modal's
               .guide-animate-section) render invisible and silently drop out of the measurement.
               A near-zero duration is just as deterministic but settles on the FINAL frame. */
            st.textContent = '*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;transition-duration:.001s!important;transition-delay:0s!important;caret-color:transparent!important}';
            document.head.appendChild(st);
          });
        });
        try { await boot(page); } catch (e) { skipped.push(cfg + ' boot: ' + String(e).slice(0, 70)); await ctx.close(); continue; }
        if (!theme.free) {
          await page.evaluate(function () { window.canAccessFeature = function () { return true; }; });
        }
        const wantPlayful = theme.settings.theme === 'playful';
        for (const [screen, prep] of Object.entries(SCREENS)) {
          try {
            await page.evaluate(new Function(prep));
            await page.waitForTimeout(420);
            /* a screen's prep must never change the theme under measurement; if it does, say so
               rather than quietly reporting the wrong theme's numbers */
            const got = await page.evaluate(function () { return document.documentElement.className; });
            if (got.indexOf('theme-playful') > -1 !== wantPlayful) {
              skipped.push(cfg + '/' + screen + ': theme drifted to "' + got + '"');
              continue;
            }
            await page.evaluate(function () { return document.fonts ? document.fonts.ready : null; });
            const pairs = await page.evaluate(collectPairs);
            if (!pairs.length) continue;
            const b64 = (await page.screenshot()).toString('base64');
            const ink = await page.evaluate(inkPass, { b64, pairs, inkDelta: INK_DELTA });
            pairs.forEach(function (p, i) {
              const k = ink && ink[i];
              if (!k || k.why || !p.metricsOk) {
                skipped.push(cfg + '/' + screen + ' ' + p.ico + ' @' + p.sel + ' r=' + Math.round(p.iconRect.x) + ',' + Math.round(p.iconRect.y) + ',' + Math.round(p.iconRect.w) + 'x' + Math.round(p.iconRect.h) + ': ' + (!k ? 'no ink' : (k.why ? k.why : 'metrics mismatch')));
                return;
              }
              const inkCentre = (k.inkTop + k.inkBottom) / 2;
              rows.push({
                cfg, screen, ico: p.ico, label: p.label, sel: p.sel, display: p.display,
                fontSize: p.fontSize, mode: p.mode,
                delta: +(inkCentre - p.capCentre).toFixed(2)
              });
            });
          } catch (e) { skipped.push(cfg + '/' + screen + ': ' + String(e).slice(0, 70)); }
        }
        await ctx.close();
      }
    }
  }
  await browser.close();

  const bad = rows.filter(r => Math.abs(r.delta) > TOL);
  /* group offenders by the surface that owns them — that is the unit a CSS fix acts on */
  const groups = {};
  bad.forEach(r => {
    const key = r.sel + '  [' + r.ico + ']';
    (groups[key] = groups[key] || []).push(r);
  });
  const summary = Object.entries(groups).map(([k, v]) => ({
    surface: k, n: v.length,
    min: Math.min(...v.map(x => x.delta)), max: Math.max(...v.map(x => x.delta)),
    cfgs: [...new Set(v.map(x => x.cfg.split('/')[0]))].join(',')
  })).sort((a, b) => Math.max(Math.abs(b.min), Math.abs(b.max)) - Math.max(Math.abs(a.min), Math.abs(a.max)));

  console.log('align-probe: measured ' + rows.length + ' icon/label pairs across ' +
    (THEMES.length * LOCALES.length * WIDTHS.length) + ' configs; ' + bad.length + ' off by >' + TOL + 'px');
  summary.forEach(s => console.log('  ' + s.min.toFixed(2) + '..' + s.max.toFixed(2) + 'px  n=' + String(s.n).padEnd(4) + s.surface + '   (' + s.cfgs + ')'));
  if (skipped.length) console.log('  unmeasured: ' + skipped.length + (skipped.length <= 12 ? ' -> ' + skipped.join('; ') : ''));
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify({ rows, summary, skipped }, null, 1)); console.log('  wrote ' + OUT); }
  process.exit(0);
})().catch(e => { console.log('align-probe ERROR: ' + String(e).slice(0, 400)); process.exit(1); });
