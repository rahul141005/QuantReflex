/**
 * quick-links-registry.js — the Quick Study shortcut catalog (FW-W4, Quick Study v2).
 *
 * The old system hardcoded 8 shortcuts (EN-only titles, max 4 selectable). This registry DERIVES
 * the eligible catalog at runtime from the app's existing sources of truth, so it grows with the
 * product without ever touching this file again:
 *   - Reference:    the Quick-Reference library cards (QR_QUICKREF.CARDS — localized by the same
 *                   overlay resolver the library itself uses) + the hub tables grid.
 *   - Practice:     the live practice modes (localized via the practice.* catalog keys).
 *   - Learn topics: every KnowledgeBase topic (title already study-language merged), grouped by
 *                   KB category, premium locks derived from LearnEntitlements.
 *   - Features:     Stats, Math Duel, AI Coach, Study Planner, Guided Revision, My Notes, the
 *                   Quick-Reference library root, and the Practice hub.
 *
 * Every legacy stored id (the old 8) maps through LEGACY_ALIASES so existing user selections
 * survive the migration byte-for-byte in `qr_quick_links`. There is NO selection cap; the UI
 * shows a soft "keep it tidy" hint above ~12.
 *
 * Entry shape: { id, category ('reference'|'practice'|'learn'|'features'), subcat?, ico?, emoji?,
 *               label() -> localized string, locked() -> bool, go() -> navigate }.
 * catalog() is fail-safe: if any derivation source throws, it falls back to a static legacy list
 * so the Home strip can never blank.
 */
(function (root) {
  'use strict';

  function _t(key) { try { return QRI18n.t(key); } catch (_) { return key; } }
  function _premium() { try { return (typeof hasPremiumAccess === 'function') && hasPremiumAccess(); } catch (_) { return false; } }
  function _go(view, params) { try { Router.showView(view, params); } catch (_) {} }

  /* Expand + scroll a Learn-hub collapsible card (the legacy tables/My-notes behavior). */
  function _goHubSection(id) {
    _go('learn');
    setTimeout(function () {
      var target = document.getElementById(id);
      if (!target) return;
      var header = target.querySelector('.collapsible-header');
      if (header) {
        var content = header.nextElementSibling;
        if (content && window.getComputedStyle(content).display === 'none' && typeof toggleSection === 'function') toggleSection(header);
      }
      try { target.scrollIntoView({ behavior: 'smooth' }); } catch (_) {}
    }, 100);
  }

  function _goQuickRefCard(cardId) {
    _go('learn', { path: 'quick-ref' });
    if (cardId) setTimeout(function () { try { if (typeof QuickRef !== 'undefined' && QuickRef.reveal) QuickRef.reveal(cardId); } catch (_) {} }, 120);
  }

  /* Open Practice and tap the real mode card — the shortcut replays the exact user flow, so the
     subject picker, premium gates and quota checks all apply unchanged. */
  function _goPracticeMode(mode) {
    _go('practice');
    setTimeout(function () {
      var card = document.querySelector('#modeSelect .mode-card[data-mode="' + mode + '"]');
      if (card) card.click();
    }, 80);
  }

  /* The old 8 ids — every stored selection from the previous system resolves to its new home. */
  var LEGACY_ALIASES = {
    fractionTable: 'qr:frac-pct',
    tablesContainer: 'ref:tables',
    formulaSections: 'feat:quickref',
    mentalTricks: 'qr:mult-tricks',
    squaresSection: 'qr:squares',
    practice: 'feat:practice',
    stats: 'feat:stats',
    bookmarksSection: 'feat:mynotes'
  };

  /* Default = the same 4 shortcuts the old system defaulted to, in their new identities. */
  var DEFAULT_IDS = ['qr:frac-pct', 'ref:tables', 'feat:quickref', 'qr:mult-tricks'];

  var PRACTICE_MODES = [
    { mode: 'quick', key: 'practice.quickDrill', ico: 'zap' },
    { mode: 'reflex', key: 'practice.reflexDrill', ico: 'activity' },
    { mode: 'timed', key: 'practice.timedTest', ico: 'timer' },
    { mode: 'diset', key: 'practice.diSet', ico: 'chart-bar' },
    { mode: 'lrset', key: 'practice.reasoningSet', ico: 'nodes' },
    { mode: 'focus', key: 'practice.focusTraining', ico: 'target' },
    { mode: 'custom', key: 'practice.customTraining', ico: 'layers' },
    { mode: 'mixed', key: 'practice.mixedAptitude', ico: 'shuffle' },
    { mode: 'review', key: 'practice.reviewMistakes', ico: 'rotate' },
    { mode: 'mock', key: 'practice.timedMock', ico: 'file-text' }
  ];

  function _no() { return false; }
  function _notPremium() { return !_premium(); }

  function _buildCatalog() {
    var out = [];

    /* ---- Reference: the Quick-Reference library, card by card ---- */
    if (typeof QR_QUICKREF !== 'undefined' && QR_QUICKREF.CARDS) {
      QR_QUICKREF.CARDS.forEach(function (card) {
        out.push({
          id: 'qr:' + card.id, category: 'reference', emoji: card.icon || '📎',
          label: function () {
            try {
              if (typeof QRQuickRefI18n !== 'undefined' && QRQuickRefI18n.resolve) {
                var r = QRQuickRefI18n.resolve(card);
                if (r && r.title) return r.title;
              }
            } catch (_) {}
            return card.title;
          },
          locked: _no,
          go: function () { _goQuickRefCard(card.id); }
        });
      });
    }
    out.push({
      id: 'ref:tables', category: 'reference', emoji: '✖️',
      label: function () { return _t('home.qlTables'); }, locked: _no,
      go: function () { _goHubSection('tablesContainer'); }
    });

    /* ---- Practice: the live mode list ---- */
    PRACTICE_MODES.forEach(function (m) {
      out.push({
        id: 'mode:' + m.mode, category: 'practice', ico: m.ico,
        label: function () { return _t(m.key); }, locked: _no,
        go: function () { _goPracticeMode(m.mode); }
      });
    });

    /* ---- Learn topics: the whole knowledge base, grouped by its own categories ---- */
    if (typeof KnowledgeBase !== 'undefined' && KnowledgeBase.all) {
      KnowledgeBase.all().forEach(function (topic) {
        out.push({
          id: 'kb:' + topic.id, category: 'learn', subcat: topic.category, emoji: topic.icon || '📖',
          label: function () {
            try { var t = KnowledgeBase.get(topic.id); return (t && t.title) || topic.title; } catch (_) { return topic.title; }
          },
          locked: function () {
            try {
              return typeof LearnEntitlements !== 'undefined' &&
                LearnEntitlements.isPremiumLearnTopic(topic.id, topic.category) && !_premium();
            } catch (_) { return false; }
          },
          go: function () { _go('learn', { path: topic.id }); }
        });
      });
    }

    /* ---- Features ---- */
    out.push(
      { id: 'feat:practice', category: 'features', ico: 'practice',
        label: function () { return _t('nav.practice'); }, locked: _no,
        go: function () { _go('practice'); } },
      { id: 'feat:stats', category: 'features', ico: 'chart-bar',
        label: function () { return _t('nav.stats'); }, locked: _no,
        go: function () { _go('stats'); } },
      { id: 'feat:quickref', category: 'features', ico: 'book-open',
        label: function () { return _t('home.quickRefTile'); }, locked: _no,
        go: function () { _go('learn', { path: 'quick-ref' }); } },
      { id: 'feat:revise', category: 'features', ico: 'rotate',
        label: function () { return _t('home.qlRevise'); }, locked: _no,
        go: function () { _go('learn', { path: 'revise' }); } },
      { id: 'feat:mynotes', category: 'features', ico: 'book',
        label: function () { return _t('home.qlMyNotes'); }, locked: _no,
        go: function () { _goHubSection('myNotesSection'); } },
      { id: 'feat:duel', category: 'features', ico: 'swords',
        label: function () { return _t('home.mathDuelTitle'); }, locked: _notPremium,
        go: function () { _go('home'); setTimeout(function () { try { DuelManager.openSetup(); } catch (_) {} }, 60); } },
      { id: 'feat:coach', category: 'features', ico: 'bot',
        label: function () { return _t('home.aiCoachTitle'); }, locked: _notPremium,
        go: function () { try { Companion.openCoach(); } catch (_) { if (typeof showPaywall === 'function') showPaywall('ai_coach'); } } },
      { id: 'feat:planner', category: 'features', ico: 'calendar',
        label: function () { return _t('home.plannerTitle'); }, locked: _notPremium,
        go: function () { try { Companion.openStudyPlanner(false); } catch (_) { if (typeof showPaywall === 'function') showPaywall('ai_study_plan'); } } }
    );

    return out;
  }

  /* Absolute fallback — if a derivation source ever throws, Quick Study still works with the
     legacy 8 (read-only until the sources heal; stored selections are never rewritten here). */
  function _legacyFallback() {
    return [
      { id: 'qr:frac-pct', category: 'reference', emoji: '🍕', label: function () { return 'Fraction ⇄ Percent'; }, locked: _no, go: function () { _goQuickRefCard('frac-pct'); } },
      { id: 'ref:tables', category: 'reference', emoji: '✖️', label: function () { return _t('home.qlTables'); }, locked: _no, go: function () { _goHubSection('tablesContainer'); } },
      { id: 'feat:quickref', category: 'features', ico: 'book-open', label: function () { return _t('home.quickRefTile'); }, locked: _no, go: function () { _go('learn', { path: 'quick-ref' }); } },
      { id: 'qr:mult-tricks', category: 'reference', emoji: '✖️', label: function () { return 'Multiplication Shortcuts'; }, locked: _no, go: function () { _goQuickRefCard('mult-tricks'); } },
      { id: 'qr:squares', category: 'reference', emoji: '🔲', label: function () { return 'Squares (1–50)'; }, locked: _no, go: function () { _goQuickRefCard('squares'); } },
      { id: 'feat:practice', category: 'features', ico: 'practice', label: function () { return _t('nav.practice'); }, locked: _no, go: function () { _go('practice'); } },
      { id: 'feat:stats', category: 'features', ico: 'chart-bar', label: function () { return _t('nav.stats'); }, locked: _no, go: function () { _go('stats'); } },
      { id: 'feat:mynotes', category: 'features', ico: 'book', label: function () { return _t('home.qlMyNotes'); }, locked: _no, go: function () { _goHubSection('myNotesSection'); } }
    ];
  }

  var _cache = null;
  function catalog() {
    if (_cache) return _cache;
    try { _cache = _buildCatalog(); }
    catch (e) { try { console.warn('[QuickLinks] catalog derivation failed, using legacy fallback', e); } catch (_) {} _cache = _legacyFallback(); }
    return _cache;
  }

  function byId(id) {
    var c = catalog();
    for (var i = 0; i < c.length; i++) if (c[i].id === id) return c[i];
    return null;
  }

  /* Map stored ids through the alias table, drop unknowns, dedupe. Order preserved. */
  function resolve(storedIds) {
    var seen = {}, entries = [];
    (Array.isArray(storedIds) ? storedIds : []).forEach(function (raw) {
      var id = LEGACY_ALIASES[raw] || raw;
      if (seen[id]) return;
      var e = byId(id);
      if (e) { seen[id] = true; entries.push(e); }
    });
    if (!entries.length) return resolve(DEFAULT_IDS);
    return entries;
  }

  var QuickLinksRegistry = {
    catalog: catalog,
    byId: byId,
    resolve: resolve,
    LEGACY_ALIASES: LEGACY_ALIASES,
    DEFAULT_IDS: DEFAULT_IDS.slice(),
    /* categories in picker order; Reference first (simple for new users) */
    CATEGORIES: [
      { id: 'reference', labelKey: 'home.qlCatReference' },
      { id: 'practice', labelKey: 'home.qlCatPractice' },
      { id: 'learn', labelKey: 'home.qlCatLearn' },
      { id: 'features', labelKey: 'home.qlCatFeatures' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = QuickLinksRegistry;
  if (root) root.QuickLinksRegistry = QuickLinksRegistry;
})(typeof window !== 'undefined' ? window : this);
