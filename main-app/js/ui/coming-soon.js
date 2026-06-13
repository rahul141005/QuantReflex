/**
 * coming-soon.js — shared "Coming Soon" modal for intentionally-staged premium features.
 *
 * Used by Word Problems (Practice card + Duel question-type) which are feature-complete-ish but held
 * back from this release. Tapping a staged feature opens this polished, anticipatory modal and triggers
 * NOTHING else — no session, no question generation, no navigation, no analytics, no backend calls.
 *
 * Exposes a bare global: showComingSoon({ title, blurb, eta }).
 */
function showComingSoon(opts) {
  opts = opts || {};
  var title = opts.title || 'Coming soon';
  var blurb = opts.blurb || 'We\'re putting the final polish on this. Launching soon for Premium.';
  var eta = opts.eta || 'Launching soon';

  var overlay = document.getElementById('comingSoonOverlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'comingSoonOverlay'; document.body.appendChild(overlay); }
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:10000;padding:1.25rem;';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }

  overlay.innerHTML =
    '<div role="document" style="max-width:380px;width:100%;border-radius:22px;padding:2px;background:linear-gradient(135deg,rgba(129,140,248,.9),rgba(168,85,247,.55),rgba(56,189,248,.5));box-shadow:0 24px 60px rgba(0,0,0,.5);">' +
      '<div style="background:#0b1120;border-radius:20px;padding:1.75rem 1.5rem;text-align:center;">' +
        '<div style="display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .8rem;border-radius:999px;background:rgba(129,140,248,.15);border:1px solid rgba(129,140,248,.4);color:#c7d2fe;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:1.1rem;">' +
          '<span style="width:7px;height:7px;border-radius:50%;background:#818cf8;box-shadow:0 0 8px #818cf8;"></span>' + esc(eta) +
        '</div>' +
        '<div style="width:64px;height:64px;margin:0 auto 1rem;border-radius:18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(129,140,248,.22),rgba(168,85,247,.18));border:1px solid rgba(129,140,248,.3);">' +
          '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c7d2fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/><circle cx="12" cy="12" r="3.5"/></svg>' +
        '</div>' +
        '<h3 style="font-size:1.35rem;font-weight:800;margin:0 0 .5rem;color:#f8fafc;">' + esc(title) + '</h3>' +
        '<p style="color:#94a3b8;font-size:.95rem;line-height:1.5;margin:0 0 1.5rem;">' + esc(blurb) + '</p>' +
        '<button id="comingSoonClose" class="btn btn-primary" style="width:100%;padding:.8rem;font-weight:700;">Got it</button>' +
      '</div>' +
    '</div>';

  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');

  function close() {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  var btn = document.getElementById('comingSoonClose');
  if (btn) btn.onclick = close;
  overlay.onclick = function (e) { if (e.target === overlay) close(); };   // backdrop tap closes
  document.addEventListener('keydown', onKey);
}
