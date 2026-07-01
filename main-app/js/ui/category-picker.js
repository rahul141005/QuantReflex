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

  var OPEN_KEY = 'qr_catpicker_open';   // session memory of expanded sections

  function _openSet() {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function _saveOpen(ids) { try { localStorage.setItem(OPEN_KEY, JSON.stringify(ids)); } catch (e) {} }

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

  function _sectionHtml(sec, open) {
    var btns = sec.cats.map(function (c) {
      return '<button class="category-btn category-card" type="button" data-cat="' + _esc(c.key) + '" data-label="' + _esc(c.label) + '">' + _esc(c.label) + '</button>';
    }).join('');
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

  function render() {
    var host = document.getElementById('categoryGroups');
    if (!host) return;
    var groups = _allSections();
    if (!groups.length) return;   // registry not ready yet — try again on next show
    var open = _openSet();
    var html = groups.map(function (g) {
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
    /* Section collapse/expand (own handler — the practice click-delegation ignores non-.category-btn). */
    host.addEventListener('click', function (e) {
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

  var CategoryPicker = { render: render, filter: filter };
  if (typeof module !== 'undefined' && module.exports) module.exports = CategoryPicker;
  if (typeof window !== 'undefined') window.CategoryPicker = CategoryPicker;
  else root.CategoryPicker = CategoryPicker;
})(typeof window !== 'undefined' ? window : this);
