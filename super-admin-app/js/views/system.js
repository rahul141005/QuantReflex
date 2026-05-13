/**
 * system.js — System monitoring view
 */
var SystemView = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('view-system');
    container.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">System & Operations</h2>' +
        '<p class="view-subtitle">AI Pipeline configuration and System Tools</p>' +
      '</div>' +

      '<!-- AI Architecture Documentation Card -->' +
      '<div class="card">' +
        '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;">' +
          '<span>✨</span> AI Content Pipeline' +
        '</h3>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:.75rem;padding:1rem;margin-bottom:1rem;">' +
          '<h4 style="font-size:.875rem;font-weight:700;color:#0f172a;margin-bottom:.5rem;">Environment Setup</h4>' +
          '<p class="text-secondary text-sm" style="margin-bottom:.75rem;">To activate AI generation in the Questions view, you must add the following Environment Variable in your Vercel Dashboard:</p>' +
          '<code style="display:block;background:#0f172a;color:#fff;padding:.75rem;border-radius:.5rem;font-size:.8125rem;font-family:monospace;margin-bottom:.5rem;">OPENAI_API_KEY=sk-...</code>' +
          '<p class="text-secondary text-sm">Once set, Vercel Serverless endpoints (`/api/admin/generate-question`) will securely broker requests to the OpenAI API without exposing keys to the client.</p>' +
        '</div>' +
        '<div style="display:grid;gap:1rem;grid-template-columns:1fr;">' +
          '<div>' +
            '<h4 style="font-size:.875rem;font-weight:700;color:#0f172a;margin-bottom:.25rem;">Operational Flow</h4>' +
            '<ul class="text-secondary text-sm" style="list-style:disc;padding-left:1.25rem;line-height:1.6;">' +
              '<li><strong>Generation:</strong> The Super Admin requests a topic. The `gpt-4o` model streams back a structured JSON mapping to the 10-field schema.</li>' +
              '<li><strong>Review:</strong> The content is loaded into the Question Modal for manual editing.</li>' +
              '<li><strong>Approval & Dual-Write:</strong> Upon saving, `questions.js` dual-writes the `topic`/`category` and `question`/`text` fields to guarantee 100% Main App compatibility.</li>' +
              '<li><strong>Consumption:</strong> The Main App\'s `QuestionBankService` fetches `status: active` questions natively.</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- System Tools Card -->' +
      '<div class="card">' +
        '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;">' +
          '<span>🛠</span> Entitlement Debugger' +
        '</h3>' +
        '<p class="text-secondary text-sm" style="margin-bottom:1rem;">Verify raw entitlement status for a specific User ID or Coaching ID.</p>' +
        '<div class="search-bar">' +
          '<input type="text" id="debugTargetId" class="search-input" placeholder="Enter User ID or Coaching ID..." />' +
          '<button id="btnDebugFetch" class="btn accent btn-sm" style="width:auto;">Inspect State</button>' +
        '</div>' +
        '<div id="debugOutput" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.75rem;padding:1rem;font-family:monospace;font-size:.8125rem;color:#0f172a;white-space:pre-wrap;overflow-x:auto;"></div>' +
      '</div>';

    _bindTools();
  }

  function _bindTools() {
    var btn = document.getElementById('btnDebugFetch');
    if (btn) {
      btn.addEventListener('click', async function() {
        var targetId = document.getElementById('debugTargetId').value.trim();
        if (!targetId) return Toast.show('Please enter an ID to inspect', 'error');
        
        var output = document.getElementById('debugOutput');
        output.style.display = 'block';
        output.textContent = 'Fetching state from Firestore...';
        
        try {
          // Attempt to fetch from Users first, then Coachings
          var userDoc = await db.collection('users').doc(targetId).get();
          if (userDoc.exists) {
            output.textContent = 'USER RECORD FOUND:\n\n' + JSON.stringify(userDoc.data(), null, 2);
            return;
          }
          
          var coachingDoc = await db.collection('coachings').doc(targetId).get();
          if (coachingDoc.exists) {
            output.textContent = 'COACHING RECORD FOUND:\n\n' + JSON.stringify(coachingDoc.data(), null, 2);
            return;
          }
          
          output.textContent = 'No records found for ID: ' + targetId;
        } catch (err) {
          console.error(err);
          output.textContent = 'Error fetching state: ' + err.message;
        }
      });
    }
  }

  return { render: render };
})();
