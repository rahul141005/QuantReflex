/**
 * share-service.js — Premium share result card generation
 *
 * Generates a high-resolution 9:16 portrait PNG card (1080×1920)
 * for sharing drill results via Web Share API, download, or clipboard.
 *
 * Features:
 *   - Premium dark gradient background with blue accent
 *   - Dynamic performance labels based on accuracy + speed
 *   - Clean, Instagram/WhatsApp-friendly layout
 *   - Share preview modal with save/share/regenerate
 *   - Web Share API with PNG file + download fallback
 *
 * Public API:
 *   ShareService.shareAsImage(data)
 *   ShareService.shareTextFallback(accuracy, percentile)
 */

var ShareService = (function () {
  'use strict';

  /* ---- Performance Labels ---- */
  var PERFORMANCE_LABELS = [
    { minAcc: 95, maxAvg: 5,   label: 'Reflex Master',       emoji: '⚡' },
    { minAcc: 90, maxAvg: 7,   label: 'Speed Demon',         emoji: '🔥' },
    { minAcc: 90, maxAvg: 999, label: 'Precision Genius',     emoji: '🎯' },
    { minAcc: 80, maxAvg: 10,  label: 'Quant Warrior',        emoji: '⚔️' },
    { minAcc: 80, maxAvg: 999, label: 'Accuracy Beast',       emoji: '💎' },
    { minAcc: 70, maxAvg: 999, label: 'Elite Solver',         emoji: '🏅' },
    { minAcc: 60, maxAvg: 999, label: 'Aptitude Challenger',  emoji: '💪' },
    { minAcc: 50, maxAvg: 999, label: 'Calculation Machine',  emoji: '🧮' },
    { minAcc: 0,  maxAvg: 999, label: 'Rising Learner',       emoji: '🌱' }
  ];

  var TAGLINES = [
    'Train your reflexes. Own the exam.',
    'Speed is a skill. Sharpen it daily.',
    'From practice to percentile.',
    'Every session builds your edge.',
    'Mental math mastery, one drill at a time.',
    'Precision under pressure.',
    'Challenge accepted. Challenge conquered.',
    'Your brain is your greatest weapon.'
  ];

  function _getPerformanceLabel(accuracy, avgTime) {
    var acc = parseFloat(accuracy) || 0;
    var avg = parseFloat(avgTime) || 999;
    for (var i = 0; i < PERFORMANCE_LABELS.length; i++) {
      var p = PERFORMANCE_LABELS[i];
      if (acc >= p.minAcc && avg <= p.maxAvg) return p;
    }
    return PERFORMANCE_LABELS[PERFORMANCE_LABELS.length - 1];
  }

  function _getRandomTagline() {
    return TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
  }

  /* ---- Canvas Drawing Helpers ---- */

  /** Draw a rounded rectangle path */
  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Create a linear gradient */
  function _gradient(ctx, x1, y1, x2, y2, stops) {
    var g = ctx.createLinearGradient(x1, y1, x2, y2);
    for (var i = 0; i < stops.length; i++) {
      g.addColorStop(stops[i][0], stops[i][1]);
    }
    return g;
  }

  /** Truncate text to fit width */
  function _truncate(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var ellipsis = '…';
    while (text.length > 0 && ctx.measureText(text + ellipsis).width > maxWidth) {
      text = text.slice(0, -1);
    }
    return text + ellipsis;
  }

  /* ---- Main Card Generation ---- */

  /**
   * Generate a premium 9:16 portrait share card.
   *
   * @param {object} data
   * @param {string} data.accuracy - e.g. "85"
   * @param {string} data.avgTime - e.g. "3.2"
   * @param {number} data.percentile - e.g. 72
   * @param {number} data.score - correct answers
   * @param {number} data.total - total questions
   * @param {number} data.streak - best session streak
   * @param {string} data.mode - e.g. "Reflex Drill"
   * @param {string} data.difficulty - e.g. "medium"
   * @param {string} data.totalTime - e.g. "45.2"
   * @param {string} data.userName - display name
   * @param {string[]} [data.topics] - topics practiced
   * @returns {HTMLCanvasElement}
   */
  function _generateCard(data) {
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var PAD = 80;           /* side padding */
    var CW = W - PAD * 2;  /* content width */

    /* ---- Background ---- */
    var bgGrad = _gradient(ctx, 0, 0, 0, H, [
      [0, '#0a0e1a'],
      [0.3, '#0d1429'],
      [0.7, '#0f1a35'],
      [1, '#0a0e1a']
    ]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    /* Subtle accent glow — top right */
    var glowGrad = ctx.createRadialGradient(W - 100, 200, 50, W - 100, 200, 500);
    glowGrad.addColorStop(0, 'rgba(37, 99, 235, 0.15)');
    glowGrad.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, W, H);

    /* Bottom accent glow */
    var glowBot = ctx.createRadialGradient(200, H - 300, 50, 200, H - 300, 450);
    glowBot.addColorStop(0, 'rgba(37, 99, 235, 0.08)');
    glowBot.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = glowBot;
    ctx.fillRect(0, 0, W, H);

    var y = 100; /* running y cursor */

    /* ---- Brand Header ---- */
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText('QuantReflex', W / 2, y);
    y += 44;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '28px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText('Competitive Aptitude Training', W / 2, y);
    y += 70;

    /* ---- Thin accent line ---- */
    var lineGrad = _gradient(ctx, PAD + 100, 0, W - PAD - 100, 0, [
      [0, 'rgba(37, 99, 235, 0)'],
      [0.3, 'rgba(37, 99, 235, 0.5)'],
      [0.7, 'rgba(37, 99, 235, 0.5)'],
      [1, 'rgba(37, 99, 235, 0)']
    ]);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD + 100, y);
    ctx.lineTo(W - PAD - 100, y);
    ctx.stroke();
    y += 50;

    /* ---- User Name ---- */
    if (data.userName) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.font = '32px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.fillText(_truncate(ctx, data.userName, CW - 40), W / 2, y);
      y += 50;
    }

    /* ---- Performance Label ---- */
    var perf = _getPerformanceLabel(data.accuracy, data.avgTime);
    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 36px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText(perf.emoji + ' ' + perf.label, W / 2, y);
    y += 55;

    /* ---- Mode + Difficulty Badge ---- */
    var modeText = (data.mode || 'Practice').toUpperCase();
    if (data.difficulty && data.difficulty !== 'medium') {
      modeText += '  ·  ' + data.difficulty.toUpperCase();
    }
    ctx.font = '600 26px "Segoe UI", system-ui, -apple-system, sans-serif';
    var modeWidth = ctx.measureText(modeText).width + 48;
    _roundRect(ctx, (W - modeWidth) / 2, y - 24, modeWidth, 40, 20);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(147, 197, 253, 0.9)';
    ctx.fillText(modeText, W / 2, y);
    y += 70;

    /* ---- Hero Score ---- */
    var scoreText = data.accuracy + '%';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 160px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText(scoreText, W / 2, y + 120);
    y += 140;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '32px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText('ACCURACY', W / 2, y + 20);
    y += 80;

    /* ---- Score sub-line ---- */
    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.font = '30px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText(data.score + ' of ' + data.total + ' correct', W / 2, y);
    y += 70;

    /* ---- Stats Cards Row ---- */
    var stats = [
      { value: data.avgTime + 's', label: 'Avg Time' },
      { value: data.streak + '', label: 'Best Streak' },
      { value: data.totalTime + 's', label: 'Total Time' }
    ];

    var cardW = Math.floor((CW - 40) / 3);
    var cardH = 120;
    var cardX = PAD;

    for (var s = 0; s < stats.length; s++) {
      var cx = cardX + s * (cardW + 20);

      /* Card background */
      _roundRect(ctx, cx, y, cardW, cardH, 16);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      /* Value */
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.fillText(stats[s].value, cx + cardW / 2, y + 52);

      /* Label */
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '22px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.fillText(stats[s].label, cx + cardW / 2, y + 88);
    }
    y += cardH + 50;

    /* ---- Speed Benchmark ---- */
    if (data.percentile > 0) {
      _roundRect(ctx, PAD, y, CW, 110, 20);
      var benchGrad = _gradient(ctx, PAD, y, PAD + CW, y, [
        [0, 'rgba(37, 99, 235, 0.12)'],
        [1, 'rgba(37, 99, 235, 0.04)']
      ]);
      ctx.fillStyle = benchGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 34px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.fillText('⚡ Faster than ' + data.percentile + '% of users', W / 2, y + 48);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '24px "Segoe UI", system-ui, -apple-system, sans-serif';
      ctx.fillText('Speed Benchmark', W / 2, y + 84);
      y += 140;
    }

    /* ---- Topics ---- */
    if (data.topics && data.topics.length > 0 && data.topics.length <= 6) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '24px "Segoe UI", system-ui, -apple-system, sans-serif';
      var topicStr = data.topics.join('  ·  ');
      if (ctx.measureText(topicStr).width > CW - 40) {
        topicStr = data.topics.slice(0, 3).join('  ·  ') + '  +' + (data.topics.length - 3) + ' more';
      }
      ctx.fillText(_truncate(ctx, topicStr, CW - 40), W / 2, y + 10);
      y += 50;
    }

    /* ---- Tagline ---- */
    y = Math.max(y, H - 240);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = 'italic 28px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText('"' + _getRandomTagline() + '"', W / 2, y);
    y += 60;

    /* ---- Bottom accent line ---- */
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD + 100, y);
    ctx.lineTo(W - PAD - 100, y);
    ctx.stroke();
    y += 45;

    /* ---- Footer Branding ---- */
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '26px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillText('www.quantreflex.app', W / 2, y);

    return canvas;
  }

  /* ---- Share Preview Modal ---- */

  function _createPreviewModal(canvas, data) {
    /* Overlay */
    var overlay = document.createElement('div');
    overlay.className = 'share-preview-overlay';
    overlay.innerHTML =
      '<div class="share-preview-modal">' +
        '<div class="share-preview-header">' +
          '<h3 class="share-preview-title">🏆 Your Achievement Card</h3>' +
          '<button class="share-preview-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="share-preview-canvas-wrap"></div>' +
        '<div class="share-preview-actions"></div>' +
      '</div>';

    var canvasWrap = overlay.querySelector('.share-preview-canvas-wrap');
    var previewImg = document.createElement('img');
    previewImg.className = 'share-preview-img';
    previewImg.alt = 'QuantReflex Result Card';
    previewImg.src = canvas.toDataURL('image/png');
    canvasWrap.appendChild(previewImg);

    /* Action buttons */
    var actionsDiv = overlay.querySelector('.share-preview-actions');

    /* Share button */
    var shareBtn = document.createElement('button');
    shareBtn.className = 'btn accent share-action-btn';
    shareBtn.innerHTML = '📤 Share';
    shareBtn.addEventListener('click', function () {
      _doShare(canvas, data);
    });
    actionsDiv.appendChild(shareBtn);

    /* Save button */
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn share-action-btn';
    saveBtn.innerHTML = '💾 Save Image';
    saveBtn.addEventListener('click', function () {
      _doSaveImage(canvas);
    });
    actionsDiv.appendChild(saveBtn);

    /* Regenerate button */
    var regenBtn = document.createElement('button');
    regenBtn.className = 'btn share-action-btn share-action-regen';
    regenBtn.innerHTML = '🔄 New Card';
    regenBtn.addEventListener('click', function () {
      var newCanvas = _generateCard(data);
      if (newCanvas) {
        previewImg.src = newCanvas.toDataURL('image/png');
        canvas = newCanvas;
      }
    });
    actionsDiv.appendChild(regenBtn);

    /* Close handlers */
    overlay.querySelector('.share-preview-close').addEventListener('click', function () {
      _closeModal(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeModal(overlay);
    });

    /* Show with animation */
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    requestAnimationFrame(function () {
      overlay.classList.add('share-preview-visible');
    });
  }

  function _closeModal(overlay) {
    overlay.classList.remove('share-preview-visible');
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.classList.remove('modal-open');
    }, 250);
  }

  /* ---- Share / Save Actions ---- */

  function _doShare(canvas, data) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        shareTextFallback(data.accuracy, data.percentile);
        return;
      }
      var file = new File([blob], 'quantreflex-achievement.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: 'QuantReflex Achievement',
          text: 'I scored ' + data.accuracy + '% on QuantReflex! 🔥'
        }).catch(function () {
          _doSaveImage(canvas);
        });
      } else {
        _doSaveImage(canvas);
      }
    }, 'image/png');
  }

  function _doSaveImage(canvas) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        if (typeof showToast === 'function') showToast('Unable to generate image.');
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'quantreflex-achievement.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      if (typeof showToast === 'function') showToast('✅ Image saved!');
    }, 'image/png');
  }

  /* ---- Public API ---- */

  /**
   * Generate and show the premium share card preview.
   *
   * @param {object} data - Session data object
   */
  function shareAsImage(data) {
    /* Backwards compatibility: old 3-arg signature (accuracy, avg, percentile) */
    if (typeof data === 'string') {
      data = {
        accuracy: arguments[0],
        avgTime: arguments[1],
        percentile: arguments[2],
        score: 0,
        total: 0,
        streak: 0,
        mode: 'Practice',
        difficulty: 'medium',
        totalTime: '0',
        userName: ''
      };
    }

    var canvas = _generateCard(data);
    if (!canvas) {
      shareTextFallback(data.accuracy, data.percentile);
      return;
    }

    _createPreviewModal(canvas, data);
  }

  /**
   * Share drill result as text via Web Share API or clipboard.
   *
   * @param {string} accuracy - e.g. "85"
   * @param {number} percentile - speed percentile, e.g. 72
   */
  function shareTextFallback(accuracy, percentile) {
    var shareText = 'I scored ' + accuracy + '% accuracy on QuantReflex \uD83D\uDD25 — faster than ' + percentile + '% of users! Train your mental math: https://www.quantreflex.app';
    if (navigator.share) {
      navigator.share({ text: shareText }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(function () {
        if (typeof showToast === 'function') showToast('✅ Copied to clipboard!');
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
