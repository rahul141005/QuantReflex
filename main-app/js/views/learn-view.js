/**
 * learn-view.js — Learn view initializer and collapsible toggle
 *
 * Extracted from app.js. Manages:
 *   - Multiplication tables, squares, cubes grids
 *   - Formula sections rendering
 *   - Custom topics, bookmarks
 *   - Quick jump navigation
 *   - Learn search with debouncing
 *   - Collapsible section toggle
 */

/* ---- Collapsible section toggle (used in Learn view) ---- */
function toggleSection(header) {
  var content = header.nextElementSibling;
  var icon = header.querySelector('.collapse-icon');
  if (content.style.display === 'none' || !content.style.display) {
    content.style.display = 'block';
    icon.textContent = '▲';
  } else {
    content.style.display = 'none';
    icon.textContent = '▼';
  }
}

/* ---- Learn view initializer ---- */
function initLearnView() {
  var tableSelector = document.getElementById('tableSelector');
  var tableDisplay = document.getElementById('tableDisplay');
  if (tableSelector && tableDisplay) {
    renderTableSelector(tableSelector, tableDisplay, 30);
  }

  var sqGrid = document.getElementById('squaresGrid');
  if (sqGrid) {
    for (var n = 1; n <= 30; n++) {
      var item = document.createElement('div');
      item.className = 'math-grid-item';
      item.innerHTML = '<span class="math-expr">' + padTableNum(n, 2) + '²</span><span class="math-eq">=</span><span class="math-val">' + padTableNum(n * n, 3) + '</span>';
      sqGrid.appendChild(item);
    }
  }

  var cuGrid = document.getElementById('cubesGrid');
  if (cuGrid) {
    for (var m = 1; m <= 20; m++) {
      var item2 = document.createElement('div');
      item2.className = 'math-grid-item';
      item2.innerHTML = '<span class="math-expr">' + padTableNum(m, 2) + '³</span><span class="math-eq">=</span><span class="math-val">' + padTableNum(m * m * m, 4) + '</span>';
      cuGrid.appendChild(item2);
    }
  }

  var sections = getFormulaSections();
  var topicContainer = document.getElementById('topicSections');
  if (topicContainer) {
    for (var i = 0; i < sections.length; i++) {
      (function (s) {
        var card = document.createElement('div');
        card.className = 'card learn-searchable';
        card.id = s.id;
        card.innerHTML = '<h3 class="section-title">' + s.title + '</h3>' + s.content;

        var customArea = document.createElement('div');
        customArea.className = 'custom-formulas-list';
        card.appendChild(customArea);

        function refreshBuiltinTopicFormulas() {
          renderCustomFormulas(customArea, s.id, refreshBuiltinTopicFormulas);
        }
        refreshBuiltinTopicFormulas();
        renderAddFormulaButton(card, s.id, refreshBuiltinTopicFormulas);

        topicContainer.appendChild(card);
      })(sections[i]);
    }
  }

  renderCustomTopicSections();
  updateCustomTopicJumpNav();
  renderBookmarksSection();

  var addTopicBtn = document.getElementById('addTopicBtn');
  if (addTopicBtn) {
    addTopicBtn.addEventListener('click', function () {
      if (!canAccessFeature('add_topic')) { showPaywall('add_topic'); return; }
      _createModal('Create New Topic', [
        { name: 'name', label: 'Topic Name', placeholder: 'e.g. Number Systems' }
      ], function (values) {
        if (!values.name) return;
        addCustomTopic(values.name);
        renderCustomTopicSections();
        updateCustomTopicJumpNav();
      });
    });
  }

  var jumpBtns = document.querySelectorAll('.learn-jump-btn');
  for (var j = 0; j < jumpBtns.length; j++) {
    jumpBtns[j].addEventListener('click', function () {
      var allJumpBtns = document.querySelectorAll('.learn-jump-btn');
      for (var ab = 0; ab < allJumpBtns.length; ab++) allJumpBtns[ab].classList.remove('active');
      this.classList.add('active');

      var targetId = this.getAttribute('data-jump');
      var target = document.getElementById(targetId);
      if (target) {
        var header = target.querySelector('.collapsible-header');
        if (header) {
          var content = header.nextElementSibling;
          if (content && window.getComputedStyle(content).display === 'none') {
            toggleSection(header);
          }
        }
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  var searchInput = document.getElementById('learnSearch');
  if (searchInput) {
    var _searchDebounce = null;
    searchInput.addEventListener('input', function () {
      var self = this;
      if (_searchDebounce) clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(function () {
        var query = self.value.toLowerCase().trim();
        performLearnSearch(query);
      }, 200);
    });
  }
}
