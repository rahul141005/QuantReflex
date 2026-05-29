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
      '</div>' +

      '<!-- Ecosystem Integrity Scanner -->' +
      '<div class="card">' +
        '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;">' +
          '<span>🩺</span> Ecosystem Integrity Scanner' +
        '</h3>' +
        '<p class="text-secondary text-sm" style="margin-bottom:1rem;">Run a self-diagnostic audit across Firestore to detect orphaned duels and entitlement desyncs.</p>' +
        '<button id="btnRunAudit" class="btn btn-outline" style="width:auto; margin-bottom:1rem;">Run Full Diagnostic Scan</button>' +
        '<div id="auditOutput" style="display:none;"></div>' +
      '</div>' +

      '<!-- Duel System Moderation Card -->' +
      '<div class="card">' +
        '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;">' +
          '<span>⚔️</span> Duel System Moderation' +
        '</h3>' +
        '<p class="text-secondary text-sm" style="margin-bottom:1rem;">Stuck duel rooms can accumulate over time due to client drop-offs or network disconnections. Use this tool to clean up orphaned duel rooms (waiting > 24 hours, or active > 4 hours).</p>' +
        '<button id="btnCleanupDuels" class="btn btn-outline" style="width:auto;">Clean Up Orphaned Duels</button>' +
      '</div>';

    _bindTools();
  }

  function _bindTools() {
    var btnDebug = document.getElementById('btnDebugFetch');
    if (btnDebug) {
      btnDebug.addEventListener('click', async function() {
        var targetId = document.getElementById('debugTargetId').value.trim();
        if (!targetId) return Toast.show('Please enter an ID to inspect', 'error');
        
        var output = document.getElementById('debugOutput');
        output.style.display = 'block';
        output.textContent = 'Fetching state from Firestore...';
        
        var db = FirebaseApp.getDb();
        if (!db) {
          output.textContent = 'ERROR: Firebase not initialized. Please refresh the page.';
          return;
        }

        try {
          var userDoc = await db.collection('users').doc(targetId).get();
          if (userDoc.exists) {
            var data = userDoc.data();
            var now = Date.now();
            var lines = [];
            lines.push('═══ USER RECORD FOUND ═══');
            lines.push('UID: ' + targetId);
            lines.push('User: ' + (data.email || 'Unknown'));
            lines.push('Email: ' + (data.email || 'N/A'));
            lines.push('CoachingId: ' + (data.coachingId || 'None (Independent)'));
            lines.push('');
            lines.push('── Entitlement State ──');
            lines.push('isPremium: ' + (data.isPremium === true ? '✅ YES' : '❌ NO'));
            lines.push('isPremiumPlus: ' + (data.isPremiumPlus === true ? '✅ YES' : '❌ NO'));
            lines.push('isTrial: ' + (data.isTrial === true ? '✅ YES' : '❌ NO'));
            lines.push('hasPaid: ' + (data.hasPaid === true ? '✅ YES' : '❌ NO'));
            lines.push('');
            lines.push('── Expiration Details ──');
            var trialEndMs = AdminUtils.toMillis(data.trialEnd);
            lines.push('trialEnd: ' + (trialEndMs ? AdminUtils.formatDateTime(data.trialEnd) + (trialEndMs > now ? ' (ACTIVE)' : ' (EXPIRED)') : 'null'));
            var ppExpiryMs = AdminUtils.toMillis(data.premiumPlusExpiry);
            lines.push('premiumPlusExpiry: ' + (ppExpiryMs ? AdminUtils.formatDateTime(data.premiumPlusExpiry) + (ppExpiryMs > now ? ' (ACTIVE)' : ' (EXPIRED)') : 'null'));
            lines.push('premiumPlusStatus: ' + (data.premiumPlusStatus || 'null'));
            lines.push('premiumPlusPlan: ' + (data.premiumPlusPlan || 'null'));
            lines.push('');
            lines.push('── Precedence Resolution ──');
            var activeSource = 'FREE';
            if (data.isPremiumPlus && ppExpiryMs > now) activeSource = 'PREMIUM_PLUS (active)';
            else if (data.isPremiumPlus && ppExpiryMs && ppExpiryMs <= now) activeSource = 'PREMIUM_PLUS (EXPIRED)';
            else if (data.isPremium && !data.isTrial) activeSource = 'PREMIUM (lifetime)';
            else if (data.isTrial && trialEndMs > now) activeSource = 'TRIAL (active)';
            else if (data.isTrial && trialEndMs && trialEndMs <= now) activeSource = 'TRIAL (EXPIRED)';
            lines.push('Active Source: ' + activeSource);
            if (data.coachingId) lines.push('Coaching Inheritance: YES — linked to ' + data.coachingId);
            lines.push('');
            lines.push('── Timestamps ──');
            lines.push('createdAt: ' + AdminUtils.formatDateTime(data.createdAt));
            lines.push('updatedAt: ' + AdminUtils.formatDateTime(data.updatedAt));
            lines.push('');
            lines.push('── Raw Data ──');
            lines.push(JSON.stringify(data, null, 2));
            output.textContent = lines.join('\n');
            return;
          }
          
          var coachingDoc = await db.collection('coachings').doc(targetId).get();
          if (coachingDoc.exists) {
            var cData = coachingDoc.data();
            var cLines = [];
            cLines.push('═══ COACHING RECORD FOUND ═══');
            cLines.push('CoachingId: ' + targetId);
            cLines.push('Name: ' + (cData.name || 'Unknown'));
            cLines.push('Status: ' + (cData.status || 'unknown'));
            cLines.push('isActive: ' + (cData.isActive === true ? '✅ YES' : '❌ NO'));
            cLines.push('Owner: ' + (cData.ownerEmail || 'None'));
            cLines.push('Capacity: ' + (cData.capacity || 'Unlimited'));
            cLines.push('Students: ' + (cData.studentsCount || 0));
            cLines.push('Plan: ' + (cData.entitlementPlan || 'standard'));
            cLines.push('');
            cLines.push('── Raw Data ──');
            cLines.push(JSON.stringify(cData, null, 2));
            output.textContent = cLines.join('\n');
            return;
          }
          
          output.textContent = 'No records found for ID: ' + targetId;
        } catch (err) {
          console.error(err);
          output.textContent = 'Error fetching state: ' + AdminUtils.getReadableError(err);
        }
      });
    }

    var btnCleanup = document.getElementById('btnCleanupDuels');
    if (btnCleanup) {
      btnCleanup.addEventListener('click', async function() {
        if (!confirm('Are you sure you want to clean up orphaned duel rooms? This cannot be undone.')) return;
        
        var originalText = btnCleanup.textContent;
        btnCleanup.textContent = 'Cleaning up...';
        btnCleanup.disabled = true;
        
        try {
          var result = await API.cleanupDuels();
          Toast.success('Cleanup successful! Removed ' + result.deletedCount + ' orphaned duel(s).');
        } catch (err) {
          Toast.error('Cleanup failed: ' + err.message);
        } finally {
          btnCleanup.textContent = originalText;
          btnCleanup.disabled = false;
        }
      });
    }

    var btnAudit = document.getElementById('btnRunAudit');
    if (btnAudit) {
      btnAudit.addEventListener('click', async function() {
        var output = document.getElementById('auditOutput');
        var originalText = btnAudit.textContent;
        btnAudit.textContent = 'Scanning...';
        btnAudit.disabled = true;
        
        output.style.display = 'block';
        output.innerHTML = '<div style="padding:16px;background:#f8fafc;border-radius:8px;">Running diagnostic scan... This may take a moment.</div>';

        try {
          var res = await API.runAudit();
          
          if (!res.issues || res.issues.length === 0) {
            output.innerHTML = '<div style="padding:16px;background:#ecfdf5;color:#065f46;border-radius:8px;">✅ Ecosystem is healthy. No issues found.</div>';
          } else {
            var issuesHtml = res.issues.map(function(iss) {
              var color = iss.severity === 'critical' ? '#ef4444' : (iss.severity === 'high' ? '#f97316' : '#f59e0b');
              return '<div style="padding:12px; border-left:4px solid ' + color + '; background:#fff; margin-bottom:8px; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">' +
                '<strong style="display:block; margin-bottom:4px;">' + iss.type + '</strong>' +
                '<p style="margin:0; font-size:14px; color:#475569;">' + iss.message + '</p>' +
              '</div>';
            }).join('');
            
            output.innerHTML = '<div style="padding:16px;background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;">' +
              '<h4 style="margin-top:0;color:#991b1b;margin-bottom:12px;">⚠️ Found ' + res.issues.length + ' potential issues:</h4>' +
              issuesHtml +
            '</div>';
          }
        } catch (err) {
          output.innerHTML = '<div style="padding:16px;background:#fef2f2;color:#991b1b;border-radius:8px;">Failed to run audit: ' + err.message + '</div>';
        } finally {
          btnAudit.textContent = originalText;
          btnAudit.disabled = false;
        }
      });
    }
  }

  return { render: render };
})();
