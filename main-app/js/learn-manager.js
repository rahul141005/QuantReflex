/**
 * learn-manager.js — Custom topics, formulas, bookmarks and search for Learn page
 *
 * Manages:
 *   - Custom user-created topics stored in localStorage
 *   - Add/Edit/Delete formulas within topics
 *   - Bookmarking formulas
 *   - Enhanced search with highlighting
 */

var CUSTOM_TOPICS_KEY = 'quant_custom_topics';
var CUSTOM_FORMULAS_KEY = 'quant_custom_formulas';
var BOOKMARKS_KEY = 'quant_bookmarks';

/* ---- localStorage helpers ---- */

function loadCustomTopics() {
  if (typeof AppState !== 'undefined') return AppState.getCustomTopics();
  try {
    var raw = localStorage.getItem(CUSTOM_TOPICS_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }
  } catch (_) { /* ignore */ }
  return [];
}

function saveCustomTopics(topics) {
  try {
    if (typeof AppState !== 'undefined') {
      AppState.setCustomTopics(topics);
    } else {
      localStorage.setItem(CUSTOM_TOPICS_KEY, JSON.stringify(topics));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncCustomTopics(topics);
    }
  } catch (_) { /* ignore */ }
}

function loadCustomFormulas() {
  if (typeof AppState !== 'undefined') return AppState.getCustomFormulas();
  try {
    var raw = localStorage.getItem(CUSTOM_FORMULAS_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    }
  } catch (_) { /* ignore */ }
  return {};
}

function saveCustomFormulas(formulas) {
  try {
    if (typeof AppState !== 'undefined') {
      AppState.setCustomFormulas(formulas);
    } else {
      localStorage.setItem(CUSTOM_FORMULAS_KEY, JSON.stringify(formulas));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncCustomFormulas(formulas);
    }
  } catch (_) { /* ignore */ }
}

function loadBookmarks() {
  if (typeof AppState !== 'undefined') return AppState.getBookmarks();
  try {
    var raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }
  } catch (_) { /* ignore */ }
  return [];
}

function saveBookmarks(bookmarks) {
  try {
    if (typeof AppState !== 'undefined') {
      AppState.setBookmarks(bookmarks);
    } else {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncBookmarks(bookmarks);
    }
  } catch (_) { /* ignore */ }
}

/* ---- Bookmark functions ---- */

function toggleBookmark(formulaId) {
  var bookmarks = loadBookmarks();
  var idx = bookmarks.indexOf(formulaId);
  if (idx === -1) {
    bookmarks.push(formulaId);
  } else {
    bookmarks.splice(idx, 1);
  }
  saveBookmarks(bookmarks);
  return idx === -1;
}

function isBookmarked(formulaId) {
  return loadBookmarks().indexOf(formulaId) !== -1;
}

/* ---- Custom formula CRUD ---- */

function addCustomFormula(topicId, formula) {
  if (typeof canAccessFeature === 'function' && !canAccessFeature('add_formula')) {
    if (typeof showPaywall === 'function') showPaywall('add_formula');
    return null;
  }
  var formulas = loadCustomFormulas();
  if (!formulas[topicId]) formulas[topicId] = [];
  formula.id = 'cf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  formulas[topicId].push(formula);
  saveCustomFormulas(formulas);
  return formula.id;
}

function editCustomFormula(topicId, formulaId, updates) {
  var formulas = loadCustomFormulas();
  if (!formulas[topicId]) return;
  for (var i = 0; i < formulas[topicId].length; i++) {
    if (formulas[topicId][i].id === formulaId) {
      formulas[topicId][i].title = updates.title;
      formulas[topicId][i].text = updates.text;
      formulas[topicId][i].example = updates.example;
      break;
    }
  }
  saveCustomFormulas(formulas);
}

function deleteCustomFormula(topicId, formulaId) {
  var formulas = loadCustomFormulas();
  if (!formulas[topicId]) return;
  formulas[topicId] = formulas[topicId].filter(function (f) { return f.id !== formulaId; });
  saveCustomFormulas(formulas);
  /* Also remove bookmark if exists */
  var bookmarks = loadBookmarks();
  var bIdx = bookmarks.indexOf(formulaId);
  if (bIdx !== -1) {
    bookmarks.splice(bIdx, 1);
    saveBookmarks(bookmarks);
  }
}

function getCustomFormulasForTopic(topicId) {
  var formulas = loadCustomFormulas();
  return formulas[topicId] || [];
}

/* ---- Custom topic CRUD ---- */

function addCustomTopic(name) {
  if (typeof canAccessFeature === 'function' && !canAccessFeature('add_topic')) {
    if (typeof showPaywall === 'function') showPaywall('add_topic');
    return null;
  }
  var topics = loadCustomTopics();
  var topic = {
    id: 'ct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name
  };
  topics.push(topic);
  saveCustomTopics(topics);
  return topic;
}

function renameCustomTopic(topicId, newName) {
  var topics = loadCustomTopics();
  for (var i = 0; i < topics.length; i++) {
    if (topics[i].id === topicId) {
      topics[i].name = newName;
      break;
    }
  }
  saveCustomTopics(topics);
}

function deleteCustomTopic(topicId) {
  var topics = loadCustomTopics();
  topics = topics.filter(function (t) { return t.id !== topicId; });
  saveCustomTopics(topics);
  /* Also remove formulas for this topic */
  var formulas = loadCustomFormulas();
  delete formulas[topicId];
  saveCustomFormulas(formulas);
}

/* ---- Modal helpers ---- */

function _createModal(title, fields, onSave) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  var modal = document.createElement('div');
  modal.className = 'modal-content';
  var html = '<h3 class="modal-title">' + escapeHtml(title) + '</h3>';
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    html += '<label class="modal-label">' + escapeHtml(f.label) + '</label>';
    if (f.type === 'textarea') {
      html += '<textarea class="modal-input" id="modal_' + f.name + '"></textarea>';
    } else {
      html += '<input class="modal-input" type="text" id="modal_' + f.name + '" />';
    }
  }
  html += '<div class="modal-actions">';
  html += '<button class="btn-secondary modal-cancel">Cancel</button>';
  html += '<button class="btn-primary modal-save">Save</button>';
  html += '</div>';
  modal.innerHTML = html;

  /* Set values and placeholders via DOM to prevent HTML attribute injection */
  for (var k = 0; k < fields.length; k++) {
    var fieldEl = modal.querySelector('#modal_' + fields[k].name);
    if (fieldEl) {
      fieldEl.value = fields[k].value || '';
      if (fields[k].placeholder) fieldEl.placeholder = fields[k].placeholder;
    }
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.querySelector('.modal-cancel').addEventListener('click', function () {
    document.body.removeChild(overlay);
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) document.body.removeChild(overlay);
  });
  overlay.querySelector('.modal-save').addEventListener('click', function () {
    SoundEngine.play('settingsToggle');
    var values = {};
    for (var j = 0; j < fields.length; j++) {
      values[fields[j].name] = document.getElementById('modal_' + fields[j].name).value.trim();
    }
    document.body.removeChild(overlay);
    onSave(values);
  });
  /* Focus first input */
  var firstInput = modal.querySelector('.modal-input');
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 50);
}

/* ---- Rendering ---- */

/**
 * Render custom formulas for a given topic into a container element.
 * @param {HTMLElement} container - Where to render formulas
 * @param {string} topicId - The topic's ID
 * @param {function} onUpdate - Callback to re-render after changes
 */
function renderCustomFormulas(container, topicId, onUpdate) {
  var formulas = getCustomFormulasForTopic(topicId);
  var html = '';
  for (var i = 0; i < formulas.length; i++) {
    var f = formulas[i];
    var starred = isBookmarked(f.id) ? ' bookmarked' : '';
    html += '<div class="custom-formula-item" data-formula-id="' + f.id + '">';
    html += '<div class="custom-formula-header">';
    html += '<strong>' + escapeHtml(f.title) + '</strong>';
    html += '<span class="custom-formula-actions">';
    html += '<button class="formula-action-btn bookmark-btn ' + starred + '" data-fid="' + f.id + '" title="Bookmark">⭐</button>';
    html += '<button class="formula-action-btn edit-btn" data-fid="' + f.id + '" data-tid="' + topicId + '" title="Edit">✏️</button>';
    html += '<button class="formula-action-btn delete-btn" data-fid="' + f.id + '" data-tid="' + topicId + '" title="Delete">🗑️</button>';
    html += '</span>';
    html += '</div>';
    html += '<p class="formula-text">' + escapeHtml(f.text) + '</p>';
    if (f.example) {
      html += '<p class="secondary-text" style="margin-top:.25rem;font-style:italic;">Example: ' + escapeHtml(f.example) + '</p>';
    }
    html += '</div>';
  }
  container.innerHTML = html;

  /* Event listeners */
  var editBtns = container.querySelectorAll('.edit-btn');
  for (var e = 0; e < editBtns.length; e++) {
    editBtns[e].addEventListener('click', function () {
      var fid = this.getAttribute('data-fid');
      var tid = this.getAttribute('data-tid');
      var fData = getCustomFormulasForTopic(tid).filter(function (x) { return x.id === fid; })[0];
      if (!fData) return;
      _createModal('Edit Formula', [
        { name: 'title', label: 'Title', value: fData.title, placeholder: 'Formula title' },
        { name: 'text', label: 'Formula / Description', type: 'textarea', value: fData.text, placeholder: 'Formula or description' },
        { name: 'example', label: 'Example (optional)', value: fData.example || '', placeholder: 'Example usage' }
      ], function (values) {
        if (!values.title || !values.text) return;
        editCustomFormula(tid, fid, values);
        onUpdate();
      });
    });
  }

  var delBtns = container.querySelectorAll('.delete-btn');
  for (var d = 0; d < delBtns.length; d++) {
    delBtns[d].addEventListener('click', function () {
      var fid = this.getAttribute('data-fid');
      var tid = this.getAttribute('data-tid');
      showCustomConfirm('Delete this formula?', function() {
        deleteCustomFormula(tid, fid);
        onUpdate();
      });
    });
  }

  var bmBtns = container.querySelectorAll('.bookmark-btn');
  for (var b = 0; b < bmBtns.length; b++) {
    bmBtns[b].addEventListener('click', function () {
      var fid = this.getAttribute('data-fid');
      var added = toggleBookmark(fid);
      this.classList.toggle('bookmarked', added);
      /* Update bookmarks section if visible */
      renderBookmarksSection();
    });
  }
}

/**
 * Render the add formula button for a topic.
 */
function renderAddFormulaButton(container, topicId, onUpdate) {
  var btn = document.createElement('button');
  btn.className = 'btn add-formula-btn';
  var canAddFormula = (typeof canAccessFeature === 'function') ? canAccessFeature('add_formula') : true;
  btn.textContent = canAddFormula ? '+ Add Formula / Tip' : '🔒 Add Formula / Tip (Premium)';
  btn.addEventListener('click', function () {
    var hasAccessNow = (typeof canAccessFeature === 'function') ? canAccessFeature('add_formula') : true;
    if (!hasAccessNow) {
      if (typeof showPaywall === 'function') showPaywall('add_formula');
      return;
    }
    if (btn.textContent.indexOf('🔒') !== -1) btn.textContent = '+ Add Formula / Tip';
    _createModal('Add Formula', [
      { name: 'title', label: 'Title', placeholder: 'e.g. Compound Interest Formula' },
      { name: 'text', label: 'Formula / Description', type: 'textarea', placeholder: 'e.g. CI = P(1 + r/100)^n - P' },
      { name: 'example', label: 'Example (optional)', placeholder: 'e.g. P=1000, r=10%, n=2 → CI=210' }
    ], function (values) {
      if (!values.title || !values.text) return;
      addCustomFormula(topicId, { title: values.title, text: values.text, example: values.example || '' });
      onUpdate();
    });
  });
  container.appendChild(btn);
}

/**
 * Render the bookmarked formulas section.
 */
function renderBookmarksSection() {
  var container = document.getElementById('bookmarksSection');
  if (!container) return;
  var bookmarks = loadBookmarks();
  if (bookmarks.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  var allFormulas = loadCustomFormulas();
  var items = [];
  var topicIds = Object.keys(allFormulas);
  for (var t = 0; t < topicIds.length; t++) {
    var tid = topicIds[t];
    var fs = allFormulas[tid];
    for (var f = 0; f < fs.length; f++) {
      if (bookmarks.indexOf(fs[f].id) !== -1) {
        items.push(fs[f]);
      }
    }
  }
  var content = container.querySelector('.bookmarks-content');
  if (!content) return;
  if (items.length === 0) {
    container.style.display = 'none';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    html += '<div class="custom-formula-item">';
    html += '<div class="custom-formula-header">';
    html += '<strong>' + escapeHtml(it.title) + '</strong>';
    html += '<button class="formula-action-btn bookmark-btn bookmarked" data-fid="' + it.id + '" title="Remove Bookmark">⭐</button>';
    html += '</div>';
    html += '<p class="formula-text">' + escapeHtml(it.text) + '</p>';
    if (it.example) {
      html += '<p class="secondary-text" style="margin-top:.25rem;font-style:italic;">Example: ' + escapeHtml(it.example) + '</p>';
    }
    html += '</div>';
  }
  content.innerHTML = html;

  var bmBtns = content.querySelectorAll('.bookmark-btn');
  for (var b = 0; b < bmBtns.length; b++) {
    bmBtns[b].addEventListener('click', function () {
      var fid = this.getAttribute('data-fid');
      toggleBookmark(fid);
      renderBookmarksSection();
      /* Also refresh the learn view to update star states */
      refreshCustomTopicSections();
    });
  }
}

/**
 * Render all custom topic sections into the Learn page.
 */
function renderCustomTopicSections() {
  var container = document.getElementById('customTopicSections');
  if (!container) return;
  container.innerHTML = '';
  var topics = loadCustomTopics();
  for (var i = 0; i < topics.length; i++) {
    (function (topic) {
      var card = document.createElement('div');
      card.className = 'card custom-topic-card';
      card.id = topic.id;

      var header = document.createElement('div');
      header.className = 'custom-topic-header';
      header.innerHTML = '<h3 class="section-title">📝 ' + escapeHtml(topic.name) + '</h3>' +
        '<span class="custom-topic-actions">' +
        '<button class="formula-action-btn rename-topic-btn" title="Rename">✏️</button>' +
        '<button class="formula-action-btn delete-topic-btn" title="Delete Topic">🗑️</button>' +
        '</span>';
      card.appendChild(header);

      header.querySelector('.rename-topic-btn').addEventListener('click', function () {
        var hasTopicAccess = (typeof canAccessFeature === 'function') ? canAccessFeature('add_topic') : true;
        if (!hasTopicAccess) {
          if (typeof showPaywall === 'function') showPaywall('add_topic');
          return;
        }
        _createModal('Rename Topic', [
          { name: 'name', label: 'Topic Name', value: topic.name, placeholder: 'Topic name' }
        ], function (values) {
          if (!values.name) return;
          renameCustomTopic(topic.id, values.name);
          renderCustomTopicSections();
        });
      });

      header.querySelector('.delete-topic-btn').addEventListener('click', function () {
        var hasTopicAccess = (typeof canAccessFeature === 'function') ? canAccessFeature('add_topic') : true;
        if (!hasTopicAccess) {
          if (typeof showPaywall === 'function') showPaywall('add_topic');
          return;
        }
        showCustomConfirm('Delete topic "' + topic.name + '" and all its formulas?', function() {
          deleteCustomTopic(topic.id);
          renderCustomTopicSections();
        });
      });

      var formulasList = document.createElement('div');
      formulasList.className = 'custom-formulas-list';
      card.appendChild(formulasList);

      function refreshFormulas() {
        renderCustomFormulas(formulasList, topic.id, refreshFormulas);
      }
      refreshFormulas();

      renderAddFormulaButton(card, topic.id, refreshFormulas);
      container.appendChild(card);
    })(topics[i]);
  }
}

function refreshCustomTopicSections() {
  renderCustomTopicSections();
}

/* ---- HTML escaping ---- */
function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
