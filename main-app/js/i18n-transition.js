/**
 * i18n-transition.js — QRI18nTransition (ADR-126, redesigned in ADR-127): the ONE coordinator for a
 * language switch.
 *
 * WHY THIS EXISTS. Before ADR-126, `settings.js` did the switch inline and the result had three measured
 * defects that no animation could paper over:
 *
 *   1. DOUBLE RENDER. `QRI18n.setLanguages()` rewrites ~428 static nodes via applyDom, and then
 *      `Router.showView()` re-runs `initSettingsView`, which `rebind()`s 24 controls by cloneNode +
 *      replaceChild. Measured cost of the pair: 88 ms at 1x CPU, 141 ms at 4x, 196 ms at 6x.
 *   2. FOCUS LOSS. `rebind` replaces the very <select> whose `change` handler is still on the stack, so
 *      document.activeElement fell to <body> on every switch — a keyboard/screen-reader regression.
 *   3. VISIBLE SCROLL JUMP. `Router.showView` ends with `.container.scrollTop = 0` with no same-view
 *      guard, and `.container` has `scroll-behavior: smooth`, so switching while scrolled SMOOTH-SCROLLED
 *      the user to the top.
 *
 * So this is not "an animation". It owns the whole lifecycle: it makes the commit single-pass, preserves
 * scroll and focus across it, announces the change to assistive tech, and wraps the whole thing in a
 * compositor-only transition whose job is to CONCEAL those 88-196 ms rather than to decorate them.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE INTERACTION (ADR-127, "Translation Pass"). A wave of re-typesetting travels down the screen.
 *
 *   - CASCADE UNITS are the active view's DIRECT CHILDREN THAT INTERSECT THE VIEWPORT, ordered by their
 *     on-screen top edge. Each dims, holds while the text is swapped, and returns — in sequence. That
 *     ordering is what stops the change reading as "the page reloaded": a screen that goes flat all at
 *     once is a refresh; a change that travels is a transformation.
 *   - OFF-SCREEN CONTENT NEVER ANIMATES. Nothing below the fold is dimmed, delayed or given a layer; it
 *     is simply already translated when you scroll to it. The wave therefore compresses on a 320 px phone
 *     (2-3 units) and expands on a tablet (5+) with no breakpoint logic anywhere.
 *   - THE NAV SETTLES LAST. The bottom-nav LABELS are one final unit, so the wave leaves through the
 *     bottom of the screen and the interface visibly settles into its new language. The bar and every
 *     icon hold — they don't change language, and fading them is what reads as a reload.
 *   - OVERLAYS DO NOT PARTICIPATE, deliberately. Language is only changeable from the Settings view, so
 *     no sheet can be open during the interaction. (ADR-126 discovered overlays by class name; that list
 *     led with `.qr-overlay`, which does not exist anywhere in the repo, and the classes that DID match
 *     included JS-built modals with no re-render path — they would have dimmed and revealed showing the
 *     SAME text. Deleted rather than extended.)
 *   - ONE SWITCH, ONE ANIMATION. Only the visible view animates. Every other screen is simply already
 *     translated the next time it is opened; no morph class is ever applied outside the switch itself.
 *   - Content never drops below 0.45 opacity: readable throughout. No blank frame, no spinner, no flash.
 *
 * NOTHING WAITS ON A CLOCK. There is no total-duration constant. The reveal begins the moment the commit
 * is done AND the exit has landed — whichever is later. Both windows are read back from the resolved
 * computed style of a real unit, so CSS is the single source of timing and JS can never drift from it.
 *
 * LATENCY IS ABSORBED, NEVER INTRODUCED. ADR-126 loaded the study pack BEFORE touching the screen, so a
 * cold pack (19 script files per language) meant a dead-looking UI. Now the exit cascade starts on the tap
 * and the pack loads underneath it: a warm pack costs nothing, a slow one is spent inside a dim that has
 * already begun, capped by PACK_CAP_MS after which the commit proceeds regardless (QRPacks always calls
 * back, even on failure, degrading to English STUDY content while the UI catalogs keep the chrome right).
 *
 * WHY OPACITY/TRANSFORM ONLY. The commit blocks the main thread for up to ~196 ms on a low-end device.
 * Compositor-driven opacity/transform keeps animating through that block; anything main-thread-driven (or
 * any layout-affecting property) would visibly stutter. It is also why layout change is CONCEALED rather
 * than animated: Devanagari changes text widths, and a FLIP animation would need a layout read per moved
 * element — exactly the thrash to avoid.
 *
 * WHY THE VIEW ROOT IS NEVER FADED (changed in ADR-127). ADR-126 faded the view root because it assumed
 * "the commit destroys the elements faded out". That is false: no view replaces its own direct children —
 * every onShow handler mutates descendants' innerHTML/textContent or a direct child's style.display, and
 * the only cloneNode+replaceChild in the app is Settings' rebind(), three levels down on leaf controls.
 * Fading the SECTIONS instead is what makes a cascade possible, and it also removes two hazards for free:
 * opacity can no longer compound down the tree (ADR-126 measured an effective alpha of 0.379 under a
 * nominal 0.45 floor), and no transform is ever retained on .spa-view-active, which FW-W5 (style.css:405)
 * forbids because it makes the view a containing block and traps the drill's position:fixed layers.
 *
 * Global: window.QRI18nTransition. Depends only on optional globals it feature-detects.
 */
(function (root) {
  'use strict';

  var HTML_CLASS = 'qr-lang-morphing';
  var OUT_CLASS = 'qr-lang-morph-out';
  var IN_CLASS = 'qr-lang-morph-in';
  var STAGGER_VAR = '--qr-morph-i';
  var STAGGER_GROUPS = 6;        /* delay cap: a tablet showing 9 sections must not stagger for 9 * step */
  var LIVE_REGION_ID = 'qrLangLiveRegion';

  /* How long the dim may hold waiting for a study pack before committing anyway. Reached only on a cold
     cache — Settings warms the other two languages on show, so the common path never waits at all. */
  var PACK_CAP_MS = 1200;

  /* Safety net only. The primary sequencing is requestAnimationFrame + resolved CSS timings; this clears
     the classes if rAF is STARVED (a backgrounded tab never paints, so the reveal frame would never
     arrive and content would be left dimmed). Sized to outlast a capped pack wait plus a full reveal. */
  var STARVATION_MS = 2600;

  /* Fallbacks, used only if the computed style cannot be parsed (never on a real browser path). */
  var FALLBACK_EXIT_MS = 130;
  var FALLBACK_REVEAL_MS = 320;

  var _gen = 0;                  /* generation: a second switch invalidates the first (last-wins) */
  var _activeUnits = [];
  var _starveTimer = null;

  function _reduced() {
    /* Reuse the repo's canonical check (js/ui/overlay.js) rather than re-rolling matchMedia — it also
       honours the body.reduced-motion class that Settings toggles. */
    try {
      if (root.QROverlay && typeof QROverlay.reducedMotion === 'function') return QROverlay.reducedMotion();
    } catch (_) {}
    try {
      return (document.body && document.body.classList.contains('reduced-motion')) ||
        (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) { return false; }
  }

  function _drillActive() {
    try { return !!(document.body && document.body.classList.contains('drill-session-active')); } catch (_) { return false; }
  }

  /* ---- cascade units: auto-discovered, so every future screen inherits this with zero work ---------- */

  /* Visible = has boxes AND intersects the viewport. Both halves matter: display:none sections (Settings
     hides several) have no boxes, and a section scrolled past the fold is never seen, so animating it
     would spend a compositor layer and a delay slot on nothing. */
  function _visible(el) {
    try {
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return false;
      var vh = root.innerHeight || document.documentElement.clientHeight || 0;
      var vw = root.innerWidth || document.documentElement.clientWidth || 0;
      return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    } catch (_) { return false; }
  }

  /**
   * The wave, in order. ONE getBoundingClientRect pass over a handful of elements — a single forced
   * layout at a single point, not thrash. Returns [{ el, i }] with `i` already capped.
   */
  function _units() {
    var out = [];
    try {
      var view = document.querySelector('.spa-view-active');
      if (view) {
        var kids = Array.prototype.slice.call(view.children);
        var vis = [];
        for (var k = 0; k < kids.length; k++) {
          if (_visible(kids[k])) vis.push({ el: kids[k], top: kids[k].getBoundingClientRect().top });
        }
        vis.sort(function (a, b) { return a.top - b.top; });
        /* Content caps one slot BELOW the ceiling: the last slot is reserved for the nav (see below).
           Capping content at STAGGER_GROUPS-1 instead let the nav collide with content from the sixth
           visible section onward — on a tall tablet the chrome then moved WITH the last sections rather
           than after them, silently dropping the "settles last" beat. */
        for (var v = 0; v < vis.length; v++) out.push({ el: vis[v].el, i: Math.min(v, STAGGER_GROUPS - 2) });
      }
      /* The nav labels are ONE final step, always strictly after every content unit, so the change lands
         on the chrome last and the interface reads as settling into its new language.
         Derived rather than pinned to the ceiling: content is capped at STAGGER_GROUPS-2 above, so
         `lastContent + 1` is <= STAGGER_GROUPS-1 and therefore ALWAYS strictly greater than every content
         index — while staying tight on a short screen. Pinning it to the ceiling instead would idle the
         nav at slot 5 even when only three sections are visible, which measured +90 ms of dead wait. */
      var last = out.length ? Math.min(out[out.length - 1].i + 1, STAGGER_GROUPS - 1) : 0;
      var labels = document.querySelectorAll('.bottom-nav a > span[data-i18n]');
      for (var n = 0; n < labels.length; n++) {
        if (_visible(labels[n])) out.push({ el: labels[n], i: last });
      }
    } catch (_) {}
    return out;
  }

  function _mark(units, cls) {
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      try {
        u.el.style.setProperty(STAGGER_VAR, String(u.i));
        u.el.style.setProperty('will-change', 'opacity, transform');
        u.el.classList.add(cls);
      } catch (_) {}
      if (_activeUnits.indexOf(u.el) === -1) _activeUnits.push(u.el);
    }
  }

  /* Read the window back from a real unit's RESOLVED computed style, so the CSS tokens (all calc() over
     the motion scale) stay the single source of truth and a retune never needs a JS edit. The last unit
     carries the largest delay, so its delay + duration is the whole window. */
  function _windowMs(units, kind) {
    var fallback = (kind === 'exit') ? FALLBACK_EXIT_MS : FALLBACK_REVEAL_MS;
    try {
      if (!units.length) return fallback;
      var el = units[units.length - 1].el;
      var cs = getComputedStyle(el);
      var dur = (kind === 'exit') ? cs.transitionDuration : cs.animationDuration;
      var del = (kind === 'exit') ? cs.transitionDelay : cs.animationDelay;
      var ms = _seconds(dur) + _seconds(del);
      return ms > 0 ? ms : fallback;
    } catch (_) { return fallback; }
  }
  function _seconds(v) {
    /* Computed values are comma-separated per property; the largest one bounds the window. */
    var best = 0, parts = String(v || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim(), n = parseFloat(s);
      if (!isFinite(n)) continue;
      var ms = (s.indexOf('ms') !== -1) ? n : n * 1000;
      if (ms > best) best = ms;
    }
    return best;
  }

  /* ---- scroll + focus preservation (both are BROKEN without this) -------------------------------- */

  function _capture() {
    var snap = { scrollTop: 0, winY: 0, focusId: null };
    try {
      var c = document.querySelector('.container');
      if (c) snap.scrollTop = c.scrollTop;
      snap.winY = root.scrollY || 0;
      var a = document.activeElement;
      /* Restore by id, because the node itself is replaced by rebind()'s cloneNode. */
      if (a && a.id && a !== document.body) snap.focusId = a.id;
    } catch (_) {}
    return snap;
  }

  function _restore(snap) {
    try {
      var c = document.querySelector('.container');
      /* html.qr-lang-morphing forces scroll-behavior:auto on .container, so this restore lands
         instantly instead of animating (the container is scroll-behavior:smooth normally, which is
         what made showView's scrollTop=0 a VISIBLE glide to the top). */
      if (c && snap.scrollTop) c.scrollTop = snap.scrollTop;
      if (snap.winY) root.scrollTo(0, snap.winY);
    } catch (_) {}
    try {
      if (snap.focusId) {
        var el = document.getElementById(snap.focusId);
        if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
      }
    } catch (_) {}
  }

  /* ---- assistive-tech announcement --------------------------------------------------------------- */

  /* A dedicated polite region, not the toast. The toast is a role="status" node nested inside an
     aria-atomic="true" role="status" container that can remove+append in the same tick — a known source
     of dropped or doubled announcements. This region carries lang= so the new language is PRONOUNCED
     correctly, and is written after documentElement.lang has been updated. */
  function _region() {
    var el = document.getElementById(LIVE_REGION_ID);
    if (el) return el;
    try {
      el = document.createElement('div');
      el.id = LIVE_REGION_ID;
      el.className = 'qr-sr-only';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      document.body.appendChild(el);
      return el;
    } catch (_) { return null; }
  }

  function _announce(appLang) {
    try {
      var el = _region();
      if (!el) return;
      el.setAttribute('lang', appLang || 'en');
      var msg = '';
      try { msg = (root.QRI18n && QRI18n.t) ? QRI18n.t('settings.languageUpdated') : ''; } catch (_) {}
      if (!msg || msg === 'settings.languageUpdated') msg = 'Language updated';
      /* Clear first so an identical consecutive message is still announced. */
      el.textContent = '';
      var gen = _gen;
      root.requestAnimationFrame(function () {
        if (gen !== _gen) return;   /* superseded — the newer switch will announce instead */
        try { el.textContent = msg; } catch (_) {}
      });
    } catch (_) {}
  }

  /* ---- lifecycle -------------------------------------------------------------------------------- */

  function _finish() {
    if (_starveTimer) { try { clearTimeout(_starveTimer); } catch (_) {} _starveTimer = null; }
    try {
      for (var i = 0; i < _activeUnits.length; i++) {
        var el = _activeUnits[i];
        el.classList.remove(OUT_CLASS);
        el.classList.remove(IN_CLASS);
        el.style.removeProperty('will-change');
        el.style.removeProperty(STAGGER_VAR);
      }
    } catch (_) {}
    _activeUnits = [];
    try { document.documentElement.classList.remove(HTML_CLASS); } catch (_) {}
  }

  /**
   * Switch the app/study language with the full premium transition.
   * @param {object} settings  the live settings object (already carrying the NEW language values)
   * @param {function} [commit] optional extra work to run inside the single commit pass
   */
  function switchTo(settings, commit) {
    settings = settings || {};
    var appLang = settings.appLanguage || 'en';
    var studyLang = settings.studyLanguage || appLang;
    var gen = ++_gen;

    /* A switch already in flight is SUPERSEDED, never queued: the user's latest tap is the only one that
       matters. _finish() runs in the SAME synchronous block as the re-dim below, so the browser never
       paints the cleared state — the opacity simply continues from wherever it currently is. */
    _finish();

    var snap = _capture();

    function doCommit() {
      try { if (root.QRI18n && QRI18n.init) QRI18n.init(settings); } catch (_) {}
      try { if (typeof commit === 'function') commit(); } catch (_) {}
      /* Never re-render over a live drill — showView would tear down the running engine. The applyDom
         pass above has already switched every static string, so the drill's own chrome is still correct.
         (Unreachable today: the language selects live in Settings, which a drill covers. Defence in
         depth, and the reason the animation is skipped entirely in that state — see below.) */
      if (!_drillActive()) {
        try {
          /* In-place refresh: re-runs the current view's onShow hooks WITHOUT re-adding
             .spa-view-active. That matters — re-adding it replays the view's viewSlideIn entry
             animation (opacity 0 -> 1), which both competes with the transition and, because a CSS
             animation restarts whenever its name becomes non-none again, made the view flash from 0
             at cleanup time. It also avoids showView's unconditional scroll reset and pushState. */
          if (root.Router && Router.refreshCurrentView && Router.refreshCurrentView()) { /* done */ }
          else if (root.Router && Router.getCurrentView && Router.showView) {
            Router.showView(Router.getCurrentView() || 'settings');
          }
        } catch (_) {}
      }
    }

    function commitInstant() {
      doCommit();
      _restore(snap);
      _announce(appLang);
    }

    /* Reduced motion: no animation at all — not a shorter one. Commit, restore, announce.
       A live drill takes the same path: never dim, delay or nudge a timed question someone is reading.
       This branch is capped exactly like the animated one below. Without the cap a pack request that
       neither loads nor errors would leave the language silently unchanged forever, and it would leave
       the accessibility path strictly less robust than the default path — the wrong asymmetry. */
    if (_reduced() || _drillActive()) {
      var didInstant = false;
      function commitOnce() { if (didInstant || gen !== _gen) return; didInstant = true; commitInstant(); }
      if (root.QRPacks && QRPacks.ensure) {
        try {
          QRPacks.ensure(studyLang, commitOnce);
          setTimeout(commitOnce, PACK_CAP_MS);
          return;
        } catch (_) {}
      }
      commitOnce();
      return;
    }

    var units = _units();
    if (!units.length) { commitInstant(); return; }

    /* ── EXIT: the wave starts on the tap. The pack load runs UNDERNEATH it, never in front of it. ── */
    try { document.documentElement.classList.add(HTML_CLASS); } catch (_) {}
    _mark(units, OUT_CLASS);
    var exitMs = _windowMs(units, 'exit');

    _starveTimer = setTimeout(function () { if (gen === _gen) _finish(); }, STARVATION_MS);

    var exitLanded = false, packReady = false, capped = false, committed = false;

    function tryCommit() {
      if (committed || gen !== _gen) return;
      /* The exit must have LANDED before the text swaps — a section still at full opacity would visibly
         pop. That is a physical requirement of the effect, not padding: there is no other wait here. */
      if (!exitLanded) return;
      if (!packReady && !capped) return;
      committed = true;
      reveal();
    }

    setTimeout(function () { exitLanded = true; tryCommit(); }, exitMs);
    setTimeout(function () { capped = true; tryCommit(); }, PACK_CAP_MS);
    try {
      if (root.QRPacks && QRPacks.ensure) QRPacks.ensure(studyLang, function () { packReady = true; tryCommit(); });
      else { packReady = true; }
    } catch (_) { packReady = true; }
    /* ensure() calls back synchronously for 'en' and for already-loaded packs, so on the common path
       packReady is already true by the time the exit lands. (No tryCommit() call here: exitLanded is
       still false at this point, so it could only ever be a no-op.) */

    function reveal() {
      /* Re-capture, do NOT reuse the t=0 snapshot. Nothing blocks interaction during the dim, and on a
         cold pack the dim can hold for up to PACK_CAP_MS — restoring a snapshot taken over a second ago
         would yank a user who scrolled or tabbed while waiting back to where they started. What needs
         preserving is state across the COMMIT, which is the only thing that disturbs it. */
      snap = _capture();
      doCommit();
      if (gen !== _gen) return;   /* a tap during the commit wins */
      _restore(snap);

      /* Re-enumerate: the commit can insert or remove a direct child (home-view.js adds #examNudgeBanner
         mid-list), and scroll position may have shifted, so the reveal must be computed from the DOM as
         it is NOW — never from the pre-commit list, which could target a detached or newly-stale node. */
      var live = _units();
      if (!live.length) { _finish(); _announce(appLang); return; }

      /* ONLY WHAT DIMMED RISES. A unit the commit newly brought into view was never part of the wave and
         is already correct at full opacity; giving it IN_CLASS would apply `both` fill and yank it down
         to the floor to animate back up. Whether that ever reached the screen was not provable either
         way (the sampling frame and the reveal frame coincide), so the path is removed rather than
         argued about — and "only what dimmed rises" is the honest statement of the effect anyway. */
      var wave = [];
      for (var w = 0; w < live.length; w++) {
        if (_activeUnits.indexOf(live[w].el) !== -1) wave.push(live[w]);
      }

      /* Anything dimmed on the way out that is no longer a unit must still be released, or it would be
         left sitting at the floor. _finish() clears the union, but the reveal has to reach it too. */
      var stillOut = [];
      for (var a = 0; a < _activeUnits.length; a++) {
        var el = _activeUnits[a], found = false;
        for (var b = 0; b < live.length; b++) { if (live[b].el === el) { found = true; break; } }
        if (!found && document.contains(el)) stillOut.push({ el: el, i: 0 });
      }

      if (!wave.length && !stillOut.length) { _finish(); _announce(appLang); return; }

      root.requestAnimationFrame(function () {
        if (gen !== _gen) return;
        var all = wave.concat(stillOut);
        for (var i = 0; i < all.length; i++) {
          try { all[i].el.classList.remove(OUT_CLASS); } catch (_) {}
        }
        _mark(all, IN_CLASS);
        _announce(appLang);
        var revealMs = _windowMs(all, 'reveal');
        setTimeout(function () { if (gen === _gen) _finish(); }, revealMs);
      });
    }
  }

  /* Warm the packs for the languages the user might pick, so the common path is always the instant path.
     Called when Settings becomes visible: bounded (at most two small sets, once per session) and it means
     the transition is never gated on the network when the user actually commits. */
  function warm(exceptLang) {
    try {
      if (!root.QRPacks || !QRPacks.ensure) return;
      ['en', 'hi', 'mr'].forEach(function (l) {
        if (l !== exceptLang) { try { QRPacks.ensure(l, function () {}); } catch (_) {} }
      });
    } catch (_) {}
  }

  var QRI18nTransition = { switchTo: switchTo, warm: warm, isMorphing: function () { return _activeUnits.length > 0; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = QRI18nTransition;
  if (typeof window !== 'undefined') window.QRI18nTransition = QRI18nTransition;
  else root.QRI18nTransition = QRI18nTransition;
})(typeof window !== 'undefined' ? window : this);
