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
    var W = 1080;
    var PAD = 72;
    var CW = W - PAD * 2;
    var FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

    /* ---- Pre-calculate dynamic height ---- */
    /* Base content = ~1150px. Add conditionals for benchmark, topics, username. */
    var estH = 980;
    if (data.userName) estH += 48;
    if (data.percentile > 0) estH += 100;
    if (data.topics && data.topics.length > 0) estH += 60;
    /* Clamp to sensible portrait range */
    var H = Math.max(1280, Math.min(1600, estH + 260));

    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    /* ---- Background ---- */
    var bgGrad = _gradient(ctx, 0, 0, 0, H, [
      [0, '#080c18'],
      [0.35, '#0c1225'],
      [0.65, '#0e1630'],
      [1, '#080c18']
    ]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    /* Accent glow — top right */
    var glow1 = ctx.createRadialGradient(W - 80, 160, 40, W - 80, 160, 420);
    glow1.addColorStop(0, 'rgba(37, 99, 235, 0.14)');
    glow1.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);

    /* Accent glow — bottom left */
    var glow2 = ctx.createRadialGradient(160, H - 200, 30, 160, H - 200, 350);
    glow2.addColorStop(0, 'rgba(37, 99, 235, 0.07)');
    glow2.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    /* Reusable accent line gradient */
    var lineGrad = _gradient(ctx, PAD + 80, 0, W - PAD - 80, 0, [
      [0, 'rgba(37, 99, 235, 0)'],
      [0.25, 'rgba(37, 99, 235, 0.4)'],
      [0.75, 'rgba(37, 99, 235, 0.4)'],
      [1, 'rgba(37, 99, 235, 0)']
    ]);

    var y = 72; /* running y cursor */
    ctx.textAlign = 'center';

    /* ════════════════════════════════════
       SECTION 1 — BRAND HEADER
       ════════════════════════════════════ */
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px ' + FONT;
    ctx.fillText('QuantReflex', W / 2, y);
    y += 36;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '22px ' + FONT;
    ctx.fillText('Competitive Aptitude Training', W / 2, y);
    y += 40;

    /* Thin divider */
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD + 80, y);
    ctx.lineTo(W - PAD - 80, y);
    ctx.stroke();
    y += 38;

    /* ════════════════════════════════════
       SECTION 2 — PLAYER IDENTITY
       ════════════════════════════════════ */
    if (data.userName) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.font = '28px ' + FONT;
      ctx.fillText(_truncate(ctx, data.userName, CW - 60), W / 2, y);
      y += 16;
    }

    /* ════════════════════════════════════
       SECTION 3 — PERFORMANCE LABEL (hero emphasis)
       ════════════════════════════════════ */
    var perf = _getPerformanceLabel(data.accuracy, data.avgTime);
    y += 28;
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 34px ' + FONT;
    ctx.fillText(perf.emoji + '  ' + perf.label, W / 2, y);
    y += 18;

    /* Mode + Difficulty pill */
    var modeText = (data.mode || 'Practice').toUpperCase();
    if (data.difficulty && data.difficulty !== 'medium') {
      modeText += '  ·  ' + data.difficulty.toUpperCase();
    }
    ctx.font = '600 20px ' + FONT;
    var pillW = ctx.measureText(modeText).width + 40;
    y += 22;
    _roundRect(ctx, (W - pillW) / 2, y - 17, pillW, 30, 15);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(147, 197, 253, 0.85)';
    ctx.fillText(modeText, W / 2, y);
    y += 38;

    /* ════════════════════════════════════
       SECTION 4 — HERO SCORE (highest emphasis)
       ════════════════════════════════════ */
    var accText = data.accuracy + '%';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 130px ' + FONT;
    ctx.fillText(accText, W / 2, y + 100);

    /* "ACCURACY" sub-label */
    ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.font = '600 22px ' + FONT;
    ctx.letterSpacing = '0.12em';
    ctx.fillText('ACCURACY', W / 2, y + 134);
    ctx.letterSpacing = '0';
    y += 158;

    /* Score fraction */
    ctx.fillStyle = 'rgba(226, 232, 240, 0.5)';
    ctx.font = '26px ' + FONT;
    ctx.fillText(data.score + ' of ' + data.total + ' correct', W / 2, y);
    y += 48;

    /* ════════════════════════════════════
       SECTION 5 — STATS GRID (2×2 premium cards)
       ════════════════════════════════════ */
    var stats = [
      { value: data.avgTime + 's', label: 'Avg Time' },
      { value: '' + data.streak,   label: 'Best Streak' },
      { value: data.totalTime + 's', label: 'Total Time' },
      { value: '' + data.total,    label: 'Questions' }
    ];

    var colGap = 16;
    var rowGap = 14;
    var sCardW = Math.floor((CW - colGap) / 2);
    var sCardH = 92;

    for (var si = 0; si < stats.length; si++) {
      var col = si % 2;
      var row = Math.floor(si / 2);
      var sx = PAD + col * (sCardW + colGap);
      var sy = y + row * (sCardH + rowGap);

      /* Card bg */
      _roundRect(ctx, sx, sy, sCardW, sCardH, 14);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      /* Value */
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px ' + FONT;
      ctx.fillText(stats[si].value, sx + sCardW / 2, sy + 42);

      /* Label */
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '20px ' + FONT;
      ctx.fillText(stats[si].label, sx + sCardW / 2, sy + 72);
    }
    y += (sCardH * 2) + rowGap + 40;

    /* ════════════════════════════════════
       SECTION 6 — SPEED BENCHMARK (compact, integrated)
       ════════════════════════════════════ */
    if (data.percentile > 0) {
      var benchH = 64;
      _roundRect(ctx, PAD, y, CW, benchH, 14);
      var benchGrad = _gradient(ctx, PAD, y, PAD + CW, y, [
        [0, 'rgba(37, 99, 235, 0.10)'],
        [1, 'rgba(37, 99, 235, 0.03)']
      ]);
      ctx.fillStyle = benchGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 28px ' + FONT;
      ctx.fillText('⚡ Faster than ' + data.percentile + '% of users', W / 2, y + 40);
      y += benchH + 32;
    }

    /* ════════════════════════════════════
       SECTION 7 — TOPIC CHIPS
       ════════════════════════════════════ */
    if (data.topics && data.topics.length > 0) {
      ctx.font = '20px ' + FONT;
      /* Render as centered pill chips */
      var chipTexts = data.topics.slice(0, 5);
      var chipPad = 24;
      var chipGap = 10;
      var chipH = 32;

      /* Calculate total width of chips to center them */
      var totalChipW = 0;
      var chipWidths = [];
      for (var ci = 0; ci < chipTexts.length; ci++) {
        var cw = ctx.measureText(chipTexts[ci]).width + chipPad * 2;
        chipWidths.push(cw);
        totalChipW += cw + (ci > 0 ? chipGap : 0);
      }

      /* If too wide, truncate to 3 + "more" */
      if (totalChipW > CW) {
        chipTexts = data.topics.slice(0, 3);
        if (data.topics.length > 3) chipTexts.push('+' + (data.topics.length - 3));
        totalChipW = 0;
        chipWidths = [];
        for (var cj = 0; cj < chipTexts.length; cj++) {
          var cw2 = ctx.measureText(chipTexts[cj]).width + chipPad * 2;
          chipWidths.push(cw2);
          totalChipW += cw2 + (cj > 0 ? chipGap : 0);
        }
      }

      var chipStartX = (W - totalChipW) / 2;
      var chipX = chipStartX;
      for (var ck = 0; ck < chipTexts.length; ck++) {
        _roundRect(ctx, chipX, y, chipWidths[ck], chipH, chipH / 2);
        ctx.fillStyle = 'rgba(37, 99, 235, 0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.20)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(147, 197, 253, 0.7)';
        ctx.font = '20px ' + FONT;
        ctx.fillText(chipTexts[ck], chipX + chipWidths[ck] / 2, y + 22);

        chipX += chipWidths[ck] + chipGap;
      }
      y += chipH + 32;
    }

    /* ════════════════════════════════════
       SECTION 8 — MOTIVATIONAL TAGLINE
       ════════════════════════════════════ */
    y += 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.font = 'italic 24px ' + FONT;
    ctx.fillText('"' + _getRandomTagline() + '"', W / 2, y);
    y += 44;

    /* ════════════════════════════════════
       SECTION 9 — FOOTER
       ════════════════════════════════════ */
    /* Bottom divider */
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD + 80, y);
    ctx.lineTo(W - PAD - 80, y);
    ctx.stroke();
    y += 34;

    /* URL */
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.font = '22px ' + FONT;
    ctx.fillText('www.quantreflex.app', W / 2, y);
    y += 48;

    /* ---- Trim canvas to actual content height ---- */
    var finalH = Math.max(y, 1280);
    if (finalH < H) {
      /* Re-render at exact content height for zero dead space */
      var trimmed = document.createElement('canvas');
      trimmed.width = W;
      trimmed.height = finalH;
      var tctx = trimmed.getContext('2d');
      if (tctx) {
        tctx.drawImage(canvas, 0, 0, W, finalH, 0, 0, W, finalH);
        /* Re-draw background to fill properly */
        tctx.globalCompositeOperation = 'destination-over';
        var tbg = _gradient(tctx, 0, 0, 0, finalH, [
          [0, '#080c18'],
          [0.35, '#0c1225'],
          [0.65, '#0e1630'],
          [1, '#080c18']
        ]);
        tctx.fillStyle = tbg;
        tctx.fillRect(0, 0, W, finalH);
        tctx.globalCompositeOperation = 'source-over';
        return trimmed;
      }
    }

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
