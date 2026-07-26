/**
 * i18n-transition.js — QRI18nTransition (ADR-126): the ONE coordinator for a language switch.
 *
 * WHY THIS EXISTS. Before this module, `settings.js` did the switch inline and the result had three
 * measured defects that no animation could paper over:
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
 * So this module is not "an animation". It owns the whole lifecycle: it makes the commit single-pass,
 * preserves scroll and focus across it, announces the change to assistive tech, and wraps the whole thing
 * in a compositor-only transition whose job is to CONCEAL those 88-196 ms rather than to decorate them.
 *
 * THE INTERACTION ("Language Morph"). The frame holds and the content transforms:
 *   - Chrome (app bar, nav surface, every icon) does NOT fade. Icons don't change language; fading them
 *     is what makes a transition read as "the page reloaded", which is the one feeling to avoid.
 *   - The section the user touched opts out of the settle wave via [data-i18n-morph="hold"]: it does not
 *     lift while everything around it does, so the thing under their finger never moves. Be precise about
 *     what this can and cannot do — opacity COMPOSITES down the tree, so nothing inside a fading root can
 *     paint brighter than that root. "hold" buys stillness, not brightness. It is honoured at exactly two
 *     levels: a morph ROOT (a held root is never faded at all) and a DIRECT CHILD of the active view (the
 *     stagger level). On a deeper node it is inert — measured, and the reason the attribute moved up to
 *     .settings-section in index.html.
 *   - Content never drops below 0.45 opacity: readable throughout, no blank frame, no spinner, no flash.
 *     That floor only holds because the settle keyframes are transform-only; an opacity wave on the
 *     children multiplied with the root's .45 and painted at .20 (measured before it was corrected).
 *   - Direct children of the active view stagger in ≤5 groups, so it reads as a wave rather than a blink.
 *
 * TIMELINE (phases overlap deliberately — the commit runs UNDER the fade, not after it):
 *   t=0      prepare: generation++, ensure packs, capture scroll/focus  (no visual change yet)
 *   t=0      settle out: opacity -> .45 on the roots (compositor only)
 *   t≈2rAF   commit: setLanguages + view refresh + restore scroll/focus + stagger vars (main thread)
 *   t≈+1rAF  settle in: opacity -> 1, translateY 3px -> 0, staggered
 *   end      finish (always, in a finally): classes cleared, scroll-behavior restored, announced
 *
 * WHY OPACITY/TRANSFORM ONLY. The commit blocks the main thread for up to ~196 ms on a low-end device.
 * Compositor-driven opacity/transform keeps animating through that block; anything main-thread-driven
 * (or any layout-affecting property) would visibly stutter. This is also why layout change is CONCEALED
 * rather than animated: Devanagari changes text widths, and a FLIP animation would need a layout read per
 * moved element — exactly the thrash to avoid. Measured shift is CLS 0.006, invisible under the fade.
 *
 * THE SUBTLE BIT. The commit DESTROYS the elements faded out (rebind replaces 24 controls), so the fade is
 * applied to the surviving view container, never to its children — otherwise the reveal would target dead
 * nodes and content would be left stuck at 0.45 opacity. Stagger vars are set on the NEW children, after
 * the commit.
 *
 * NOTHING IS EVER BLOCKED. Not during report submission, not during AI streaming, not offline. Blocking is
 * never the premium choice; making the switch cheap is. An in-flight request already captured its `lang`,
 * which is correct — it reflects the UI the user saw.
 *
 * Global: window.QRI18nTransition. Depends only on optional globals it feature-detects.
 */
(function (root) {
  'use strict';

  var HTML_CLASS = 'qr-lang-morphing';
  var OUT_CLASS = 'qr-lang-morph-out';
  var IN_CLASS = 'qr-lang-morph-in';
  var STAGGER_VAR = '--qr-morph-i';
  var STAGGER_GROUPS = 5;        /* cap: a 20-child view must not stagger for 20 * delay */
  var LIVE_REGION_ID = 'qrLangLiveRegion';

  /* Safety net only. The primary sequencing is requestAnimationFrame; this clears the classes if rAF is
     STARVED (a backgrounded tab never paints, so the reveal frame would never arrive and content would be
     left dimmed). It is a starvation guard, not a timing hack — the happy path never reaches it. */
  var STARVATION_MS = 1600;

  var _gen = 0;                  /* generation: a second switch invalidates the first (last-wins) */
  var _activeRoots = [];
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

  /* ---- roots: auto-discovered, so every future screen inherits this with zero work ---------------- */

  /* A root is a container that SURVIVES the commit and whose descendant text changes language.
     Deliberately excluded: the nav bar surface and all icons (they don't change language), and any
     candidate marked [data-i18n-morph="hold"] — a held ROOT is never faded at all. (Held nodes that are
     not roots are handled at the stagger level in _applyStagger; deeper than that the mark is inert.) */
  function _roots() {
    var out = [], seen = [];
    function push(el) {
      if (!el || seen.indexOf(el) !== -1) return;
      if (el.getAttribute && el.getAttribute('data-i18n-morph') === 'hold') return;
      seen.push(el); out.push(el);
    }
    try {
      /* the active view (survives showView — only its contents are re-rendered) */
      var view = document.querySelector('.spa-view-active');
      if (view) push(view);
      /* nav LABELS only, never the bar or the icons */
      var labels = document.querySelectorAll('.bottom-nav a > span[data-i18n]');
      for (var i = 0; i < labels.length; i++) push(labels[i]);
      /* any overlay currently on screen — a modal must transform too, but must not be closed:
         closing the user's context to change a language is hostile. */
      var ovs = document.querySelectorAll('.qr-overlay, .ba-modal-overlay, .modal-overlay, .qr-dialog-overlay');
      for (var o = 0; o < ovs.length; o++) {
        var ov = ovs[o];
        try { if (ov.offsetParent === null && getComputedStyle(ov).display === 'none') continue; } catch (_) {}
        push(ov);
      }
      /* explicit opt-in for anything bespoke a future screen adds */
      var extra = document.querySelectorAll('[data-i18n-morph="root"]');
      for (var e = 0; e < extra.length; e++) push(extra[e]);
    } catch (_) {}
    return out;
  }

  /* Stagger is applied to the NEW children (post-commit), capped, and costs 5 CSS-var writes with zero
     layout reads. Only the active view is staggered; nav labels and overlays move as one.
     A held child is skipped here AND excluded from the settle rule in CSS — skipping it here alone would
     only withhold its delay, leaving it to lift at delay 0. */
  function _applyStagger() {
    try {
      var view = document.querySelector('.spa-view-active');
      if (!view) return;
      var kids = view.children, n = 0;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.getAttribute && k.getAttribute('data-i18n-morph') === 'hold') continue;
        k.style.setProperty(STAGGER_VAR, String(Math.min(n, STAGGER_GROUPS - 1)));
        n++;
      }
    } catch (_) {}
  }
  function _clearStagger() {
    try {
      var view = document.querySelector('.spa-view-active');
      if (!view) return;
      var kids = view.children;
      for (var i = 0; i < kids.length; i++) {
        try { kids[i].style.removeProperty(STAGGER_VAR); } catch (_) {}
      }
    } catch (_) {}
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
      for (var i = 0; i < _activeRoots.length; i++) {
        var el = _activeRoots[i];
        el.classList.remove(OUT_CLASS);
        el.classList.remove(IN_CLASS);
        el.style.removeProperty('will-change');
      }
    } catch (_) {}
    _activeRoots = [];
    _clearStagger();
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
       matters. _finish() here also guarantees we never stack classes or leave a stale dimmed root. */
    _finish();

    function doCommit() {
      try { if (root.QRI18n && QRI18n.init) QRI18n.init(settings); } catch (_) {}
      try { if (typeof commit === 'function') commit(); } catch (_) {}
      /* Never re-render over a live drill — showView would tear down the running engine. The applyDom
         pass above has already switched every static string, so the drill's own chrome is still correct. */
      if (!_drillActive()) {
        try {
          /* In-place refresh: re-runs the current view's onShow hooks WITHOUT re-adding
             .spa-view-active. That matters — re-adding it replays the view's viewSlideIn entry
             animation (opacity 0 -> 1), which both competes with the morph and, because a CSS
             animation restarts whenever its name becomes non-none again, made the view flash from 0
             at cleanup time. It also avoids showView's unconditional scroll reset and pushState. */
          if (root.Router && Router.refreshCurrentView && Router.refreshCurrentView()) { /* done */ }
          else if (root.Router && Router.getCurrentView && Router.showView) {
            Router.showView(Router.getCurrentView() || 'settings');
          }
        } catch (_) {}
      }
    }

    /* PREPARE — load before animating. The transition must never wait on the network: if the study pack
       isn't in memory yet, the UI stays fully live and untouched until it is (no held fade, no spinner,
       no artificial delay). ensure() is synchronous for 'en' and for already-loaded languages, and always
       calls back — even when a pack fails — so a failed load degrades to English STUDY content while the
       UI catalogs (loaded at boot) keep the chrome correct. */
    function proceed() {
      if (gen !== _gen) return;   /* superseded while the pack was loading */

      var snap = _capture();

      /* Reduced motion: no animation at all — not a shorter one. Commit, restore, announce. */
      if (_reduced()) {
        doCommit();
        _restore(snap);
        _announce(appLang);
        return;
      }

      var roots = _roots();
      if (!roots.length) { doCommit(); _restore(snap); _announce(appLang); return; }

      _activeRoots = roots;
      try { document.documentElement.classList.add(HTML_CLASS); } catch (_) {}
      for (var i = 0; i < roots.length; i++) {
        roots[i].style.setProperty('will-change', 'opacity, transform');
        roots[i].classList.add(OUT_CLASS);
      }
      _starveTimer = setTimeout(function () { if (gen === _gen) _finish(); }, STARVATION_MS);

      /* Two frames: one for the class to be applied, one for the fade to actually start painting. The
         commit then runs UNDER the in-progress fade — that overlap is what keeps the whole thing ~320 ms
         instead of fade + commit + fade serially. */
      root.requestAnimationFrame(function () {
        if (gen !== _gen) return;
        root.requestAnimationFrame(function () {
          if (gen !== _gen) return;
          doCommit();
          if (gen !== _gen) return;   /* a tap during the commit wins */
          _restore(snap);
          /* Roots may have been replaced by the commit in exotic cases; re-resolve and keep the dimmed
             state on whatever is on screen now, so the reveal can never target a detached node. */
          var live = [];
          for (var r = 0; r < _activeRoots.length; r++) {
            if (document.contains(_activeRoots[r])) live.push(_activeRoots[r]);
          }
          if (!live.length) { _finish(); _announce(appLang); return; }
          _activeRoots = live;
          _applyStagger();
          root.requestAnimationFrame(function () {
            if (gen !== _gen) return;
            for (var k = 0; k < _activeRoots.length; k++) {
              _activeRoots[k].classList.remove(OUT_CLASS);
              _activeRoots[k].classList.add(IN_CLASS);
            }
            _announce(appLang);
            /* Clean up after the reveal. Duration is read from CSS so JS and CSS can never drift. */
            var ms = _revealMs();
            setTimeout(function () { if (gen === _gen) _finish(); }, ms);
          });
        });
      });
    }

    try {
      if (root.QRPacks && QRPacks.ensure) QRPacks.ensure(studyLang, proceed);
      else proceed();
    } catch (_) { proceed(); }
  }

  /* Read the reveal duration from the stylesheet so the JS cleanup and the CSS animation can never
     disagree (and so retuning the motion never needs a JS edit). */
  function _revealMs() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--qr-morph-total');
      var n = parseFloat(v);
      if (isFinite(n) && n > 0) return v.indexOf('ms') !== -1 ? n : n * 1000;
    } catch (_) {}
    return 420;
  }

  /* Warm the packs for the languages the user might pick, so the common path is always the instant path.
     Called when Settings becomes visible: bounded (at most two small files, once per session) and it means
     the transition is never gated on the network when the user actually commits. */
  function warm(exceptLang) {
    try {
      if (!root.QRPacks || !QRPacks.ensure) return;
      ['en', 'hi', 'mr'].forEach(function (l) {
        if (l !== exceptLang) { try { QRPacks.ensure(l, function () {}); } catch (_) {} }
      });
    } catch (_) {}
  }

  var QRI18nTransition = { switchTo: switchTo, warm: warm, isMorphing: function () { return _activeRoots.length > 0; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = QRI18nTransition;
  if (typeof window !== 'undefined') window.QRI18nTransition = QRI18nTransition;
  else root.QRI18nTransition = QRI18nTransition;
})(typeof window !== 'undefined' ? window : this);
