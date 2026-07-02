/**
 * js/ui/category-picker.js — the Practice "Choose Category" picker, rendered dynamically from the single source of
 * truth (ADR-084). Replaces the old hardcoded HTML button grid so every drill category — including ones added later —
 * appears automatically, grouped into collapsible sections with a live search.
 *
 * Sources (all already loaded before Practice is reachable):
 *   - Quant: the Learn registry (window.KnowledgeBase) for section grouping/order + services/quantTopics.js labels.
 *   - DI / LR: their engines (window.DIEngine / window.LREngine) via window.QR_SUBJECTS.subjectToCategories().
 *
 * The rendered buttons keep the exact click contract the practice controllers rely on:
 *   <button class="category-btn category-card" data-cat="<key>" data-label="<label>">Label</button>
 * Section headers and the search box are NOT `.category-btn`, so the existing delegated click handler ignores them.
 * Pure presentation — no drill logic, no new persistence beyond a tiny localStorage note of which sections are open.
 */
(function (root) {
  'use strict';

  var OPEN_KEY = 'qr_catpicker_open';     // session memory of expanded sections
  var PIN_KEY = 'qr_pinned_cats';         // user-pinned categories (favourites)
  var RECENT_KEY = 'qr_recent_cats';      // most-recently focus-practised categories

  function _read(key) { try { return JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { return []; } }
  function _write(key, arr) { try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {} }
  function _openSet() { return _read(OPEN_KEY); }
  function _saveOpen(ids) { _write(OPEN_KEY, ids); }
  function _pinned() { return _read(PIN_KEY); }
  function _isPinned(k) { return _pinned().indexOf(k) !== -1; }
  function _togglePin(k) { var a = _pinned(), i = a.indexOf(k); if (i === -1) a.unshift(k); else a.splice(i, 1); _write(PIN_KEY, a.slice(0, 24)); }
  function _recent() { return _read(RECENT_KEY); }
  /** Record a category the user just started a focus drill on (for the "Recently practised" strip). */
  function noteRecent(k) { if (!k) return; var a = _recent().filter(function (x) { return x !== k; }); a.unshift(k); _write(RECENT_KEY, a.slice(0, 12)); }

  /* The set of drill categories that actually exist right now (so a stale pin/recent for a removed category is ignored). */
  function _validCats() {
    var v = {};
    if (typeof QuantTopics !== 'undefined' && QuantTopics.CATEGORY_LABELS) Object.keys(QuantTopics.CATEGORY_LABELS).forEach(function (k) { v[k] = 1; });
    var SUB = root.QR_SUBJECTS;
    if (SUB && SUB.subjectToCategories) ['di', 'lr'].forEach(function (s) { (SUB.subjectToCategories(s) || []).forEach(function (k) { v[k] = 1; }); });
    return v;
  }

  /* Recommended Quant categories for the user's active exam (from exam-relevance weighting); falls back to overall
     priority when no exam is set. Returns up to `n` drill-category keys. */
  function _recommended(n) {
    var EX = root.QR_EXAMREL, KB = root.KnowledgeBase;
    if (!EX || !EX.weightedCategories || !KB) return [];
    var exam = ''; try { exam = (typeof TargetExam !== 'undefined' && TargetExam.get()) || ''; } catch (e) {}
    var track = EX.trackForExam ? EX.trackForExam(exam) : null;
    var rows = EX.weightedCategories(KB.bySubject ? KB.bySubject('quant') : []);
    rows = rows.filter(function (r) { return r && r.cat; });
    rows.sort(function (a, b) {
      var wa = track && a.weights ? (a.weights[track] || 0) : (EX.priorityRank ? EX.priorityRank(a.priority) : 0);
      var wb = track && b.weights ? (b.weights[track] || 0) : (EX.priorityRank ? EX.priorityRank(b.priority) : 0);
      if (wb !== wa) return wb - wa;
      return (a.order || 999) - (b.order || 999);
    });
    return rows.map(function (r) { return r.cat; }).slice(0, n || 6);
  }

  /* "Continue" = the drill categories behind the most-recently-opened Learn chapters. */
  function _continueCats(n) {
    var LP = root.LearnProgress, KB = root.KnowledgeBase;
    if (!LP || !LP.recent || !KB || !KB.get) return [];
    var out = [];
    (LP.recent(n * 2 || 8) || []).forEach(function (id) {
      var t = KB.get(id);
      if (t && t.drillCategory && out.indexOf(t.drillCategory) === -1) out.push(t.drillCategory);
    });
    return out.slice(0, n || 5);
  }

  /* Drill categories flagged "most asked" (for the subtle 🔥 marker). exam-relevance meta is keyed by Learn topic id,
     so map through the registry (topic.drillCategory) once. */
  var _mostAsked = null;
  function _mostAskedSet() {
    if (_mostAsked) return _mostAsked;
    _mostAsked = {};
    var EX = root.QR_EXAMREL, KB = root.KnowledgeBase;
    if (EX && EX._meta && KB && KB.get) {
      Object.keys(EX._meta).forEach(function (id) {
        if (EX._meta[id] && EX._meta[id].mostAsked) { var t = KB.get(id); if (t && t.drillCategory) _mostAsked[t.drillCategory] = 1; }
      });
    }
    return _mostAsked;
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function _catLabel(key) {
    if (typeof QuantTopics !== 'undefined' && QuantTopics.CATEGORY_LABELS && QuantTopics.CATEGORY_LABELS[key]) return QuantTopics.CATEGORY_LABELS[key];
    if (typeof formatCategoryName === 'function') return formatCategoryName(key);
    return key;
  }

  /* ---- section models: [{ id, title, icon, hint, cats:[{key,label}] }] ---- */

  function _quantSections() {
    var out = [], KB = root.KnowledgeBase, QT = root.QuantTopics;
    if (!KB || !QT || !KB.categoriesBySubject) return out;
    var meta = {}; (KB.categories() || []).forEach(function (c) { meta[c.id] = c; });
    (KB.categoriesBySubject('quant') || []).forEach(function (sid) {
      var topics = (KB.byCategory(sid) || []).filter(function (t) { return t.drillCategory && QT.CATEGORY_LABELS[t.drillCategory]; });
      if (!topics.length) return;
      out.push({
        id: 'quant-' + sid,
        title: (meta[sid] && meta[sid].title) || sid,
        icon: (meta[sid] && meta[sid].icon) || '',
        cats: topics.map(function (t) { return { key: t.drillCategory, label: QT.label(t.drillCategory) }; })
      });
    });
    return out;
  }

  function _diSections() {
    var DI = root.DIEngine;
    if (!DI || !DI.categories) return [];
    var cats = (DI.categories() || []).map(function (k) { return { key: k, label: DI.label ? DI.label(k) : _catLabel(k) }; });
    if (!cats.length) return [];
    return [{ id: 'di-all', title: 'Data Interpretation', icon: '📊', hint: 'read charts & tables, fast', cats: cats }];
  }

  /* LR keys come from the source (subjectToCategories); tier grouping is presentation only, with a fallback bucket so
     a future LR category still appears without editing this list. */
  var LR_TIERS = [
    { title: 'Foundation & Core', keys: ['lr-coding', 'lr-blood', 'lr-direction', 'lr-series', 'lr-analogy', 'lr-odd', 'lr-ranking', 'lr-syllogism', 'lr-inequality', 'lr-calendar', 'lr-clock', 'lr-io'] },
    { title: 'Verbal & Critical Reasoning', keys: ['lr-critical', 'lr-statement', 'lr-cause', 'lr-course', 'lr-decision'] },
    { title: 'Visual Reasoning', keys: ['lr-mirror', 'lr-water', 'lr-dice', 'lr-cube', 'lr-fseries', 'lr-fanalogy'] }
  ];
  /* SET-based LR categories are launched via startLrSet(), not the single-question focus/custom drill path — so they
     are excluded from this picker (matching the pre-ADR-084 behaviour). */
  var LR_SET_ONLY = { 'lr-seating': 1, 'lr-puzzle': 1 };
  function _lrSections() {
    var SUB = root.QR_SUBJECTS;
    if (!SUB || !SUB.subjectToCategories) return [];
    var all = (SUB.subjectToCategories('lr') || []).filter(function (k) { return !LR_SET_ONLY[k]; });
    if (!all.length) return [];
    var seen = {}, out = [];
    LR_TIERS.forEach(function (tier, i) {
      var cats = tier.keys.filter(function (k) { return all.indexOf(k) !== -1; }).map(function (k) { seen[k] = 1; return { key: k, label: _catLabel(k) }; });
      if (cats.length) out.push({ id: 'lr-' + i, title: tier.title, icon: i === 0 ? '🧠' : '', hint: i === 0 ? 'reason under time pressure' : '', cats: cats });
    });
    var rest = all.filter(function (k) { return !seen[k]; }).map(function (k) { return { key: k, label: _catLabel(k) }; });
    if (rest.length) out.push({ id: 'lr-more', title: 'More Reasoning', icon: '', cats: rest });
    return out;
  }

  function _allSections() {
    return [
      { subject: 'Quantitative Aptitude', sections: _quantSections() },
      { subject: 'Data Interpretation', sections: _diSections() },
      { subject: 'Logical Reasoning', sections: _lrSections() }
    ].filter(function (g) { return g.sections.length; });
  }

  /* ---- render ---- */

  /* One category button. Label is a direct text node (so a click anywhere selects it via the practice delegation);
     the pin star is the only child element, so clicking it is handled separately and never selects the category. */
  function _catBtn(c, opts) {
    opts = opts || {};
    var hot = opts.hot && _mostAskedSet()[c.key] ? ' 🔥' : '';
    var pinned = _isPinned(c.key);
    var star = opts.star === false ? '' :
      '<span class="cat-star' + (pinned ? ' is-pinned' : '') + '" data-star="' + _esc(c.key) + '" aria-label="' + (pinned ? 'Unpin ' : 'Pin ') + _esc(c.label) + '">' + (pinned ? '★' : '☆') + '</span>';
    return '<button class="category-btn category-card" type="button" data-cat="' + _esc(c.key) + '" data-label="' + _esc(c.label) + '">' + _esc(c.label) + hot + star + '</button>';
  }

  function _sectionHtml(sec, open) {
    var btns = sec.cats.map(function (c) { return _catBtn(c, { star: true, hot: true }); }).join('');
    var n = sec.cats.length;
    return '<div class="category-section" data-section="' + _esc(sec.id) + '">' +
      '<button class="category-section-header" type="button" aria-expanded="' + (open ? 'true' : 'false') + '" data-toggle="' + _esc(sec.id) + '">' +
        '<span class="category-section-title">' + (sec.icon ? '<span class="category-section-icon" aria-hidden="true">' + _esc(sec.icon) + '</span> ' : '') + _esc(sec.title) + '</span>' +
        '<span class="category-section-count">' + n + ' topic' + (n === 1 ? '' : 's') + '</span>' +
        '<span class="collapse-icon" aria-hidden="true">' + (open ? '▲' : '▼') + '</span>' +
      '</button>' +
      '<div class="category-grid category-section-body"' + (open ? '' : ' style="display:none;"') + '>' + btns + '</div>' +
    '</div>';
  }

  /* "For You" strip — up to a few chip rows from EXISTING signals (no new persistence beyond localStorage). Each chip
     is a plain-label .category-btn so the normal practice click-delegation selects/launches it. */
  function _chipRow(title, keys, valid) {
    keys = keys.filter(function (k, i) { return valid[k] && keys.indexOf(k) === i; }).slice(0, 8);
    if (!keys.length) return '';
    var chips = keys.map(function (k) { return _catBtn({ key: k, label: _catLabel(k) }, { star: false }); }).join('');
    return '<p class="category-tier-label">' + _esc(title) + '</p><div class="category-grid category-foryou-row">' + chips + '</div>';
  }
  function _stripHtml() {
    var valid = _validCats();
    var pinned = _pinned(), recommended = _recommended(6), cont = _continueCats(5), recent = _recent();
    var rows = _chipRow('★ Pinned', pinned, valid) +
      _chipRow('⭐ Recommended for you', recommended, valid) +
      _chipRow('↩ Continue', cont, valid) +
      _chipRow('🕒 Recently practised', recent, valid);
    if (!rows) return '';
    return '<div class="category-group category-foryou" role="group" aria-label="For you">' +
      '<p class="category-subject-label">For You</p>' + rows + '</div>';
  }

  function render() {
    var host = document.getElementById('categoryGroups');
    if (!host) return;
    var groups = _allSections();
    if (!groups.length) return;   // registry not ready yet — try again on next show
    var open = _openSet();
    var html = _stripHtml() + groups.map(function (g) {
      var secHtml = g.sections.map(function (s) { return _sectionHtml(s, open.indexOf(s.id) !== -1); }).join('');
      return '<div class="category-group" role="group" aria-label="' + _esc(g.subject) + '">' +
        '<p class="category-subject-label">' + _esc(g.subject) + '</p>' + secHtml + '</div>';
    }).join('');
    host.innerHTML = html;
    var search = document.getElementById('categoryPickerSearch');
    if (search) search.value = '';   // fresh entry starts unfiltered
    var empty = document.getElementById('categoryPickerEmpty');
    if (empty) empty.style.display = 'none';
    _wire(host);
  }

  function _wire(host) {
    if (host._catPickerWired) return;
    host._catPickerWired = true;
    host.addEventListener('click', function (e) {
      /* Pin/unpin star (a child of the .category-btn, so the practice delegation ignores it). Update in place +
         rebuild only the "For You" strip so the user's expand/search state is preserved. */
      var star = e.target.closest && e.target.closest('.cat-star');
      if (star) {
        e.preventDefault();
        var key = star.getAttribute('data-star'); _togglePin(key);
        var now = _isPinned(key);
        star.classList.toggle('is-pinned', now); star.textContent = now ? '★' : '☆';
        star.setAttribute('aria-label', (now ? 'Unpin ' : 'Pin ') + (star.getAttribute('data-star') || ''));
        var oldStrip = host.querySelector('.category-foryou'), newStrip = _stripHtml();
        if (oldStrip) { if (newStrip) { oldStrip.outerHTML = newStrip; } else { oldStrip.parentNode.removeChild(oldStrip); } }
        else if (newStrip) { host.insertAdjacentHTML('afterbegin', newStrip); }
        return;
      }
      /* Section collapse/expand (own handler — the practice click-delegation ignores non-.category-btn). */
      var hdr = e.target.closest && e.target.closest('.category-section-header');
      if (!hdr) return;
      var body = hdr.nextElementSibling, icon = hdr.querySelector('.collapse-icon'), id = hdr.getAttribute('data-toggle');
      var opening = !body || body.style.display === 'none';
      if (body) body.style.display = opening ? '' : 'none';
      if (icon) icon.textContent = opening ? '▲' : '▼';
      hdr.setAttribute('aria-expanded', opening ? 'true' : 'false');
      var ids = _openSet(), ix = ids.indexOf(id);
      if (opening && ix === -1) ids.push(id); else if (!opening && ix !== -1) ids.splice(ix, 1);
      _saveOpen(ids);
    });
    var search = document.getElementById('categoryPickerSearch');
    if (search && !search._catPickerWired) { search._catPickerWired = true; search.addEventListener('input', function () { filter(search.value); }); }
  }

  /* Live search: show only matching topics, auto-expand sections with matches, hide empties. Empty query restores the
     saved open/collapsed state. */
  function filter(q) {
    var host = document.getElementById('categoryGroups'); if (!host) return;
    q = String(q || '').trim().toLowerCase();
    var open = _openSet();
    var sections = host.querySelectorAll('.category-section');
    var anyMatch = false;
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i], id = sec.getAttribute('data-section'), body = sec.querySelector('.category-section-body');
      var btns = sec.querySelectorAll('.category-btn'), shown = 0;
      for (var j = 0; j < btns.length; j++) {
        var label = (btns[j].getAttribute('data-label') || btns[j].textContent || '').toLowerCase();
        var hit = !q || label.indexOf(q) !== -1;
        btns[j].style.display = hit ? '' : 'none';
        if (hit) shown++;
      }
      var hdr = sec.querySelector('.category-section-header'), icon = sec.querySelector('.collapse-icon');
      sec.style.display = shown ? '' : 'none';
      if (shown) anyMatch = true;
      var expand = q ? shown > 0 : (open.indexOf(id) !== -1);
      if (body) body.style.display = expand ? '' : 'none';
      if (icon) icon.textContent = expand ? '▲' : '▼';
      if (hdr) hdr.setAttribute('aria-expanded', expand ? 'true' : 'false');
    }
    var empty = document.getElementById('categoryPickerEmpty');
    if (empty) empty.style.display = (q && !anyMatch) ? 'block' : 'none';
  }

  var CategoryPicker = { render: render, filter: filter, noteRecent: noteRecent };
  if (typeof module !== 'undefined' && module.exports) module.exports = CategoryPicker;
  if (typeof window !== 'undefined') window.CategoryPicker = CategoryPicker;
  else root.CategoryPicker = CategoryPicker;
})(typeof window !== 'undefined' ? window : this);
