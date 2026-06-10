/**
 * questions.js — Question Bank management view
 */
var QuestionsView = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('view-questions');
    container.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div>' +
          '<h2 class="view-title">Question Bank</h2>' +
          '<p class="view-subtitle">Centralized AI educational content pipeline</p>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">' +
          '<button class="btn btn-sm btn-outline" id="qRefreshBtn">Refresh</button>' +
          '<button class="btn btn-sm" id="qGenerateBtn" style="background:var(--bg-secondary); border:1px solid var(--border-color);">✨ AI Generate</button>' +
          '<button class="btn btn-sm accent" id="qAddBtn">+ Manual Add</button>' +
        '</div>' +
      '</div>' +
      
      '<div id="qDropZone" style="border: 2px dashed var(--border-color); border-radius: var(--radius-lg); padding: 2rem; text-align: center; margin-bottom: 1.5rem; background: var(--bg-surface); cursor: pointer; transition: all var(--transition-fast);">' +
        '<div style="font-size: 2rem; margin-bottom: .5rem;">📥</div>' +
        '<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">Drag & Drop JSON File</div>' +
        '<div style="font-size: .8125rem; color: var(--text-secondary); margin-top: .25rem;">or click to browse from your device</div>' +
        '<input type="file" id="qFileInput" accept=".json" style="display:none;" />' +
      '</div>' +

      '<div id="questionsTableArea"><div class="loading">Loading questions...</div></div>';

    document.getElementById('qRefreshBtn').onclick = _loadQuestions;
    document.getElementById('qGenerateBtn').onclick = _showGenerateModal;
    document.getElementById('qAddBtn').onclick = function() { _showEditModal(); };
    
    var dropZone = document.getElementById('qDropZone');
    var fileInput = document.getElementById('qFileInput');
    
    dropZone.onclick = function() { fileInput.click(); };
    
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-primary)';
      dropZone.style.background = '#eff6ff';
    });
    
    dropZone.addEventListener('dragleave', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.background = 'var(--bg-surface)';
    });
    
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.background = 'var(--bg-surface)';
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        _handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.onchange = function(e) {
      if (e.target.files && e.target.files.length > 0) {
        _handleFile(e.target.files[0]);
      }
    };
    
    _loadQuestions();
  }

  function _handleFile(file) {
    if (!file) return;
    
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var parsed = JSON.parse(evt.target.result);
        if (!Array.isArray(parsed)) {
          Toast.error('Invalid JSON: Must be an array of questions.');
          return;
        }
        _validateAndShowImportPreview(parsed);
      } catch (err) {
        Toast.error('Failed to parse JSON file.');
      }
      // Reset input
      document.getElementById('qFileInput').value = '';
    };
    reader.readAsText(file);
  }

  function _validateAndShowImportPreview(arr) {
    var valid = [];
    var invalid = 0;
    var difficultyDist = { easy: 0, medium: 0, hard: 0 };
    var topics = {};
    
    arr.forEach(function(q) {
      if (q.topic && q.difficulty && q.question && q.answer !== undefined) {
        valid.push(q);
        var diff = String(q.difficulty).toLowerCase();
        if (difficultyDist[diff] !== undefined) difficultyDist[diff]++;
        var t = String(q.topic);
        topics[t] = (topics[t] || 0) + 1;
      } else {
        invalid++;
      }
    });

    var topicCount = Object.keys(topics).length;
    
    var body = document.createElement('div');
    body.innerHTML = 
      '<p class="text-secondary text-sm" style="margin-bottom:1rem;">Your file has been scanned.</p>' +
      '<div style="display:flex; gap:1rem; margin-bottom:1rem;">' +
        '<div style="flex:1; padding:1rem; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:.75rem; text-align:center;">' +
          '<div style="font-size:1.5rem; font-weight:800; color:#059669;">' + valid.length + '</div>' +
          '<div style="font-size:.75rem; color:#065f46; font-weight:600; text-transform:uppercase;">Valid</div>' +
        '</div>' +
        '<div style="flex:1; padding:1rem; background:#fef2f2; border:1px solid #fecaca; border-radius:.75rem; text-align:center;">' +
          '<div style="font-size:1.5rem; font-weight:800; color:#dc2626;">' + invalid + '</div>' +
          '<div style="font-size:.75rem; color:#991b1b; font-weight:600; text-transform:uppercase;">Invalid/Skipped</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:#f8fafc; padding:.75rem; border-radius:.5rem; margin-bottom:1.5rem; font-size:.8125rem;">' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:.25rem;"><span>Unique Topics:</span> <strong>' + topicCount + '</strong></div>' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:.25rem;"><span>Easy:</span> <strong>' + difficultyDist.easy + '</strong></div>' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:.25rem;"><span>Medium:</span> <strong>' + difficultyDist.medium + '</strong></div>' +
        '<div style="display:flex; justify-content:space-between;"><span>Hard:</span> <strong>' + difficultyDist.hard + '</strong></div>' +
      '</div>' +
      '<div id="importProgressBar" style="display:none; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; margin-bottom:1rem;"><div id="importProgressFill" style="width:0%; height:100%; background:#2563eb; transition:width .2s;"></div></div>' +
      '<p id="importProgressText" class="text-sm text-secondary">Clicking Confirm will immediately batch upload the valid questions.</p>';
      
    Modal.show({
      title: 'Import Preview',
      body: body,
      actions: [
        { label: 'Cancel', id: 'importCancelBtn' },
        { 
          label: 'Confirm Import', 
          accent: true, 
          onClick: function(btn) { 
            if(valid.length === 0) { Toast.error('No valid questions to import.'); return; }
            _executeImport(valid, btn); 
          }, 
          autoClose: false 
        }
      ]
    });
  }

  async function _executeImport(validArray, btn) {
    btn.disabled = true;
    var cancelBtn = document.getElementById('importCancelBtn');
    if (cancelBtn) cancelBtn.disabled = true;
    
    document.getElementById('importProgressBar').style.display = 'block';
    var textEl = document.getElementById('importProgressText');
    var fillEl = document.getElementById('importProgressFill');
    
    var chunkSize = 100;
    var chunks = [];
    for (let i = 0; i < validArray.length; i += chunkSize) {
      chunks.push(validArray.slice(i, i + chunkSize));
    }
    
    var totalUploaded = 0;
    var totalFailed = 0;

    for (let i = 0; i < chunks.length; i++) {
      textEl.textContent = 'Uploading batch ' + (i + 1) + ' of ' + chunks.length + '... (' + totalUploaded + '/' + validArray.length + ' completed)';
      fillEl.style.width = ((i / chunks.length) * 100) + '%';
      
      try {
        var token = await AdminAuth.getToken();
        var res = await fetch('/api/admin/questions?action=import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ questions: chunks[i] })
        });
        var data = await res.json();
        if (res.ok) {
          totalUploaded += data.count || chunks[i].length;
        } else {
          console.error('Batch failed:', data.error);
          totalFailed += chunks[i].length;
          throw new Error(data.error || 'Batch import rejected.');
        }
      } catch (e) {
        console.error('Batch failed:', e.message);
        totalFailed += chunks[i].length;
        Toast.error('Batch ' + (i + 1) + ' failed: ' + e.message);
        break; // Stop further chunks if one fails critically
      }
    }
    
    fillEl.style.width = '100%';
    textEl.textContent = 'Import complete: ' + totalUploaded + ' uploaded, ' + totalFailed + ' failed.';
    
    Toast.success('Import Finished: ' + totalUploaded + ' questions added.');
    setTimeout(function() {
      Modal.close();
      _loadQuestions();
    }, 1500);
  }

  async function _loadQuestions() {
    var area = document.getElementById('questionsTableArea');
    if (!area) return;
    area.innerHTML = '<div class="loading">Loading questions...</div>';

    try {
      var data = await API.getQuestions();
      var questions = data.questions || [];
      AdminState.set({ questionsCache: questions });

      var columns = [
        { key: 'topic', label: 'Topic' },
        {
          key: 'question', label: 'Question',
          render: function (val, row) {
            var txt = val || row.text || '';
            return txt.length > 50 ? txt.substring(0, 50) + '…' : txt;
          }
        },
        { key: 'difficulty', label: 'Difficulty' },
        {
          key: 'status', label: 'Status',
          render: function (val, row) {
            var badges = '';
            if (val === 'active') badges += '<span class="badge badge-active">Active</span>';
            else if (val === 'draft') badges += '<span class="badge badge-draft">Draft</span>';
            else badges += '<span class="badge badge-archived">' + (val || 'draft') + '</span>';
            
            if (row.premiumOnly) {
              badges += ' <span class="badge badge-premium" style="margin-left:4px;">Premium</span>';
            }
            return badges;
          }
        }
      ];

      area.innerHTML = '';
      area.appendChild(Table.build(columns, questions));
    } catch (e) {
      area.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error: ' + e.message + '</div></div>';
    }
  }

  function _showGenerateModal() {
    var body = document.createElement('div');
    body.innerHTML =
      '<p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem;">Select a topic and difficulty to generate a new question using OpenAI.</p>' +
      '<div class="modal-field"><label class="modal-label">Topic</label>' +
        '<select class="modal-select" id="aiTopic">' +
          '<option value="profit-loss">Profit &amp; Loss</option>' +
          '<option value="percentages">Percentages</option>' +
          '<option value="ratios">Ratios</option>' +
          '<option value="averages">Averages</option>' +
          '<option value="time-speed-distance">Time Speed Distance</option>' +
          '<option value="time-and-work">Time &amp; Work</option>' +
          '<option value="fractions">Fractions</option>' +
          '<option value="multiplication">Multiplication</option>' +
        '</select></div>' +
      '<div class="modal-field"><label class="modal-label">Difficulty</label>' +
        '<select class="modal-select" id="aiDifficulty">' +
          '<option value="easy">Easy</option>' +
          '<option value="medium" selected>Medium</option>' +
          '<option value="hard">Hard</option>' +
        '</select></div>';

    Modal.show({
      title: '✨ AI Generate Question',
      body: body,
      actions: [
        { label: 'Cancel' },
        { label: 'Generate', accent: true, onClick: _handleGenerate, autoClose: false }
      ]
    });
  }

  async function _handleGenerate() {
    var topic = document.getElementById('aiTopic').value;
    var difficulty = document.getElementById('aiDifficulty').value;
    
    Toast.success('Generating question...', 2000);
    var btn = document.querySelector('.modal-actions .accent');
    if(btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

    try {
      var res = await API.generateQuestion(topic, difficulty);
      Modal.close();
      // Show edit modal pre-filled with AI generated content
      _showEditModal({
        topic: topic,
        difficulty: difficulty,
        question: res.question,
        options: res.options || [],
        answer: res.answer,
        explanation: res.explanation
      });
    } catch (e) {
      if(btn) { btn.disabled = false; btn.textContent = 'Generate'; }
      Toast.error('Failed to generate: ' + e.message);
    }
  }

  function _showEditModal(data) {
    data = data || {};
    var optsStr = data.options ? data.options.join(', ') : '';

    var body = document.createElement('div');
    body.innerHTML =
      '<div style="display:flex; gap:1rem;">' +
        '<div class="modal-field" style="flex:1;"><label class="modal-label">Topic</label>' +
          '<input type="text" class="modal-input" id="mqTopic" value="' + (data.topic || '') + '" placeholder="e.g. profit-loss" /></div>' +
        '<div class="modal-field" style="flex:1;"><label class="modal-label">Difficulty</label>' +
          '<select class="modal-select" id="mqDifficulty">' +
            '<option value="easy" ' + (data.difficulty==='easy'?'selected':'') + '>Easy</option>' +
            '<option value="medium" ' + (data.difficulty==='medium'||!data.difficulty?'selected':'') + '>Medium</option>' +
            '<option value="hard" ' + (data.difficulty==='hard'?'selected':'') + '>Hard</option>' +
          '</select></div>' +
      '</div>' +
      '<div class="modal-field"><label class="modal-label">Question Text</label>' +
        '<textarea class="modal-input" id="mqQuestion" rows="3">' + (data.question || '') + '</textarea></div>' +
      '<div class="modal-field"><label class="modal-label">Options (comma separated numbers)</label>' +
        '<input type="text" class="modal-input" id="mqOptions" value="' + optsStr + '" placeholder="e.g. 10, 20, 30, 40" /></div>' +
      '<div style="display:flex; gap:1rem;">' +
        '<div class="modal-field" style="flex:1;"><label class="modal-label">Correct Answer (Number)</label>' +
          '<input type="number" class="modal-input" id="mqAnswer" value="' + (data.answer !== undefined ? data.answer : '') + '" /></div>' +
        '<div class="modal-field" style="flex:1;"><label class="modal-label">Status</label>' +
          '<select class="modal-select" id="mqStatus">' +
            '<option value="draft" ' + (data.status==='draft'||!data.status?'selected':'') + '>Draft</option>' +
            '<option value="active" ' + (data.status==='active'?'selected':'') + '>Active</option>' +
          '</select></div>' +
      '</div>' +
      '<div class="modal-field"><label class="modal-label">Explanation</label>' +
        '<textarea class="modal-input" id="mqExplanation" rows="4">' + (data.explanation || '') + '</textarea></div>' +
      '<div class="modal-field" style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">' +
        '<input type="checkbox" id="mqPremium" ' + (data.premiumOnly?'checked':'') + ' /> <label for="mqPremium" class="modal-label" style="margin:0;">Premium Only</label>' +
      '</div>';

    Modal.show({
      title: 'Question Details',
      body: body,
      actions: [
        { label: 'Cancel' },
        { label: 'Save Question', accent: true, onClick: _saveQuestion, autoClose: false }
      ]
    });
  }

  async function _saveQuestion() {
    var topic = document.getElementById('mqTopic').value.trim();
    var difficulty = document.getElementById('mqDifficulty').value;
    var question = document.getElementById('mqQuestion').value.trim();
    var answerStr = document.getElementById('mqAnswer').value.trim();
    var explanation = document.getElementById('mqExplanation').value.trim();
    var status = document.getElementById('mqStatus').value;
    var premiumOnly = document.getElementById('mqPremium').checked;
    
    var optionsStr = document.getElementById('mqOptions').value.trim();
    var options = [];
    if (optionsStr) {
      options = optionsStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    }

    if (!topic || !question || !answerStr) {
      Toast.error('Topic, question, and answer are required.');
      return;
    }

    var answer = Number(answerStr);

    var payload = {
      type: 'word_problem',
      topic: topic,
      difficulty: difficulty,
      question: question,
      options: options,
      answer: answer,
      explanation: explanation,
      approved: status === 'active',
      status: status,
      premiumOnly: premiumOnly
    };

    try {
      await API.saveQuestion(payload);
      Toast.success('Question saved successfully');
      Modal.close();
      _loadQuestions();
    } catch (e) {
      Toast.error('Failed to save: ' + e.message);
    }
  }

  return { render: render };
})();
