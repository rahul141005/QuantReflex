/**
 * share-service.js — Share result card generation
 *
 * Extracted from drill-engine.js to reduce module size.
 * Provides canvas-based PNG card generation and text fallback
 * for sharing drill results via Web Share API or clipboard.
 *
 * Public API:
 *   ShareService.shareAsImage(accuracy, avg, percentile)
 *   ShareService.shareTextFallback(accuracy, percentile)
 */

var ShareService = (function () {
  'use strict';

  /**
   * Generate a PNG card on canvas and share via Web Share API.
   * Falls back to text share if canvas or file sharing is unsupported.
   *
   * @param {string} accuracy - e.g. "85"
   * @param {string} avg - average time per question, e.g. "3.2"
   * @param {number} percentile - speed percentile, e.g. 72
   */
  function shareAsImage(accuracy, avg, percentile) {
    var W = 600, H = 340;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      /* Canvas not supported — fall back to text share */
      shareTextFallback(accuracy, percentile);
      return;
    }

    /* Background */
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    /* Card */
    var cx = 20, cy = 20, cw = W - 40, ch = H - 40, r = 20;
    ctx.beginPath();
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + cw - r, cy);
    ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + r);
    ctx.lineTo(cx + cw, cy + ch - r);
    ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - r, cy + ch);
    ctx.lineTo(cx + r, cy + ch);
    ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - r);
    ctx.lineTo(cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    /* App name */
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QuantReflex', W / 2, 76);

    /* Website */
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText('QuantReflex.netlify.app', W / 2, 100);

    /* Divider */
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 116);
    ctx.lineTo(W - 60, 116);
    ctx.stroke();

    /* Accuracy (large) */
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
    ctx.fillText(accuracy + '%', W / 2, 188);

    /* Accuracy label */
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Accuracy', W / 2, 210);

    /* Avg time stat — left block */
    var leftX = W / 2 - 100;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(avg + 's', leftX, 248);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Avg Time', leftX, 266);

    /* Speed benchmark — right block */
    var rightX = W / 2 + 100;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('Top ' + Math.max(1, 100 - percentile) + '%', rightX, 248);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Speed Rank', rightX, 266);

    /* Tagline */
    ctx.fillStyle = '#475569';
    ctx.font = 'italic 13px system-ui, -apple-system, sans-serif';
    ctx.fillText('Train your brain daily', W / 2, 302);

    /* Share the image */
    canvas.toBlob(function (blob) {
      if (!blob) { shareTextFallback(accuracy, percentile); return; }
      var file = new File([blob], 'quantreflex-result.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'QuantReflex Result' }).catch(function () {
          shareTextFallback(accuracy, percentile);
        });
      } else {
        /* navigator.share({ files }) not supported — fall back to text/clipboard */
        shareTextFallback(accuracy, percentile);
      }
    }, 'image/png');
  }

  /**
   * Share drill result as text via Web Share API or clipboard.
   *
   * @param {string} accuracy - e.g. "85"
   * @param {number} percentile - speed percentile, e.g. 72
   */
  function shareTextFallback(accuracy, percentile) {
    var shareText = 'I scored ' + accuracy + '% accuracy on QuantReflex \uD83D\uDD25 - faster than ' + percentile + '% of users! Train your mental math: https://quantreflex.netlify.app';
    if (navigator.share) {
      navigator.share({ text: shareText }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(function () {
        if (typeof showToast === 'function') showToast('\u2705 Copied to clipboard!');
      }).catch(function () {
        if (typeof showToast === 'function') showToast('Could not copy. Try again.');
      });
    } else {
      if (typeof showToast === 'function') showToast('Sharing not supported on this browser.');
    }
  }

  return {
    shareAsImage: shareAsImage,
    shareTextFallback: shareTextFallback
  };
})();
