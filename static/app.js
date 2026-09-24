document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const urlInput = document.getElementById('video-url');
  const clearBtn = document.getElementById('clear-btn');
  const pasteBtn = document.getElementById('paste-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');
  
  const resultSection = document.getElementById('result-section');
  const resThumbnail = document.getElementById('res-thumbnail');
  const resDuration = document.getElementById('res-duration');
  const resPlatformBadge = document.getElementById('res-platform-badge');
  const resTitle = document.getElementById('res-title');
  const resUploader = document.getElementById('res-uploader').querySelector('span');

  // Player Screen Elements
  const viewModePlayer = document.getElementById('view-mode-player');
  const viewModeCover = document.getElementById('view-mode-cover');
  const playerFrameWrapper = document.getElementById('player-frame-wrapper');
  const coverFrameWrapper = document.getElementById('cover-frame-wrapper');
  const embedPlayerFrame = document.getElementById('embed-player-frame');
  const nativePlayerVideo = document.getElementById('native-player-video');
  const playerFallbackView = document.getElementById('player-fallback-view');
  const fallbackThumbnail = document.getElementById('fallback-thumbnail');
  
  const tabBtns = document.querySelectorAll('.tab-btn');
  const mp4Options = document.getElementById('mp4-options');
  const mp3Options = document.getElementById('mp3-options');
  const qualitySelect = document.getElementById('quality-select');
  
  const downloadBtn = document.getElementById('download-btn');
  const newSearchBtn = document.getElementById('new-search-btn');

  // Trimming Elements
  const trimEnableToggle = document.getElementById('trim-enable-toggle');
  const trimControls = document.getElementById('trim-controls');
  const trimStartInput = document.getElementById('trim-start-input');
  const trimEndInput = document.getElementById('trim-end-input');
  const sliderRangeStart = document.getElementById('slider-range-start');
  const sliderRangeEnd = document.getElementById('slider-range-end');
  const rangeTrackHighlight = document.getElementById('range-track-highlight');
  const trimLabelStart = document.getElementById('trim-label-start');
  const trimLabelEnd = document.getElementById('trim-label-end');
  const trimDurationVal = document.getElementById('trim-duration-val');
  const btnFullVideo = document.getElementById('btn-full-video');
  let videoTotalSeconds = 0;
  
  const progressModal = document.getElementById('progress-modal');
  const progressTitle = document.getElementById('progress-title');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressPercent = document.getElementById('progress-percent');
  const progressSpeed = document.getElementById('progress-speed');
  const progressEta = document.getElementById('progress-eta');
  const progressStatusDesc = document.getElementById('progress-status-desc');
  const completedActions = document.getElementById('completed-actions');
  const fileDownloadLink = document.getElementById('file-download-link');
  const closeModalBtn = document.getElementById('close-modal-btn');
  
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const toastContainer = document.getElementById('toast-container');

  // State
  let currentVideoData = null;
  let selectedFormat = 'mp4';
  let activePollInterval = null;

  // Render initial history
  renderHistory();

  // Helper: Toast Notifications
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Clear button visibility
  urlInput.addEventListener('input', () => {
    clearBtn.style.display = urlInput.value.trim() ? 'block' : 'none';
    highlightPlatformChip(urlInput.value.trim());
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
    highlightPlatformChip('');
  });

  // Paste from clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        clearBtn.style.display = 'block';
        highlightPlatformChip(urlInput.value);
        showToast('Link colado da área de transferência!', 'success');
        // Auto trigger analyze if valid URL
        if (text.startsWith('http://') || text.startsWith('https://')) {
          analyzeLink();
        }
      } else {
        showToast('Nenhum texto na área de transferência.', 'info');
      }
    } catch (err) {
      showToast('Permissão de colar negada pelo navegador. Cole manualmente.', 'error');
    }
  });

  // Highlight platform chip based on URL
  function highlightPlatformChip(url) {
    const chips = document.querySelectorAll('.platform-chip');
    chips.forEach(c => c.style.borderColor = '');

    const lower = url.toLowerCase();
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
      document.querySelector('.platform-chip.yt')?.setAttribute('style', 'border-color: #ff0000; box-shadow: 0 0 10px rgba(255,0,0,0.4);');
    } else if (lower.includes('tiktok.com')) {
      document.querySelector('.platform-chip.tt')?.setAttribute('style', 'border-color: #25f4ee; box-shadow: 0 0 10px rgba(37,244,238,0.4);');
    } else if (lower.includes('instagram.com')) {
      document.querySelector('.platform-chip.ig')?.setAttribute('style', 'border-color: #e1306c; box-shadow: 0 0 10px rgba(225,48,108,0.4);');
    } else if (lower.includes('twitter.com') || lower.includes('x.com')) {
      document.querySelector('.platform-chip.tw')?.setAttribute('style', 'border-color: #ffffff; box-shadow: 0 0 10px rgba(255,255,255,0.4);');
    } else if (lower.includes('facebook.com') || lower.includes('fb.watch')) {
      document.querySelector('.platform-chip.fb')?.setAttribute('style', 'border-color: #1877f2; box-shadow: 0 0 10px rgba(24,119,242,0.4);');
    }
  }

  // Error banner handler
  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError() {
    errorBanner.style.display = 'none';
  }

  // Analyze link
  async function analyzeLink() {
    const url = urlInput.value.trim();
    if (!url) {
      showError('Por favor, cole um link antes de continuar.');
      return;
    }

    hideError();
    stopPlayer();
    resultSection.style.display = 'none';

    // Set loading state
    analyzeBtn.disabled = true;
    analyzeBtn.querySelector('.btn-text').style.display = 'none';
    analyzeBtn.querySelector('.btn-loader').style.display = 'inline-flex';

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao analisar o vídeo.');
      }

      currentVideoData = data;
      displayResult(data);
      showToast('Informações do vídeo carregadas!', 'success');

    } catch (err) {
      showError(err.message || 'Erro de conexão com o servidor.');
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.querySelector('.btn-text').style.display = 'inline-flex';
      analyzeBtn.querySelector('.btn-loader').style.display = 'none';
    }
  }

  analyzeBtn.addEventListener('click', analyzeLink);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeLink();
  });

  // Display video result
  function displayResult(data) {
    // Populate preview player and thumbnail
    const thumbUrl = data.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="280" height="157" viewBox="0 0 280 157"><rect width="100%" height="100%" fill="%231e293b"/></svg>';
    resThumbnail.src = thumbUrl;
    fallbackThumbnail.src = thumbUrl;
    resDuration.textContent = data.duration || '00:00';
    resTitle.textContent = data.title;
    resUploader.textContent = data.uploader;

    // Platform badge icon
    let pIcon = 'fa-brands fa-youtube';
    if (data.platform === 'tiktok') pIcon = 'fa-brands fa-tiktok';
    else if (data.platform === 'instagram') pIcon = 'fa-brands fa-instagram';
    else if (data.platform === 'twitter') pIcon = 'fa-brands fa-x-twitter';
    else if (data.platform === 'facebook') pIcon = 'fa-brands fa-facebook';
    resPlatformBadge.innerHTML = `<i class="${pIcon}"></i>`;

    // Configure Interactive Video Player Screen
    const embed = data.embed || {};
    if (embed.is_vertical) {
      playerFrameWrapper.classList.add('vertical');
    } else {
      playerFrameWrapper.classList.remove('vertical');
    }

    if (embed.type === 'iframe' && embed.url) {
      embedPlayerFrame.src = embed.url;
      embedPlayerFrame.style.display = 'block';
      nativePlayerVideo.style.display = 'none';
      nativePlayerVideo.pause();
      playerFallbackView.style.display = 'none';
    } else if (embed.type === 'video' && embed.url) {
      nativePlayerVideo.src = embed.url;
      nativePlayerVideo.style.display = 'block';
      embedPlayerFrame.style.display = 'none';
      embedPlayerFrame.src = '';
      playerFallbackView.style.display = 'none';
    } else {
      embedPlayerFrame.style.display = 'none';
      embedPlayerFrame.src = '';
      nativePlayerVideo.style.display = 'none';
      nativePlayerVideo.pause();
      playerFallbackView.style.display = 'flex';
    }

    // Default to player view
    viewModePlayer.classList.add('active');
    viewModeCover.classList.remove('active');
    playerFrameWrapper.style.display = 'flex';
    coverFrameWrapper.style.display = 'none';

    // Populate resolutions
    qualitySelect.innerHTML = '';
    if (data.resolutions && data.resolutions.length > 0) {
      data.resolutions.forEach(res => {
        const opt = document.createElement('option');
        opt.value = res.value;
        opt.textContent = res.label;
        qualitySelect.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = 'best';
      opt.textContent = 'Melhor Resolução Disponível';
      qualitySelect.appendChild(opt);
    }

    // Default to MP4
    setFormatTab('mp4');

    // Initialize Trimming Controls
    initTrimmingControls(data.duration_raw);

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Trimming Helpers
  function formatSecondsToTime(sec) {
    if (isNaN(sec) || sec < 0) sec = 0;
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function initTrimmingControls(totalSec) {
    videoTotalSeconds = totalSec && totalSec > 0 ? totalSec : 60;
    sliderRangeStart.min = 0;
    sliderRangeStart.max = videoTotalSeconds;
    sliderRangeStart.value = 0;

    sliderRangeEnd.min = 0;
    sliderRangeEnd.max = videoTotalSeconds;
    sliderRangeEnd.value = videoTotalSeconds;

    trimStartInput.value = '00:00';
    trimEndInput.value = formatSecondsToTime(videoTotalSeconds);

    trimLabelStart.textContent = '00:00';
    trimLabelEnd.textContent = formatSecondsToTime(videoTotalSeconds);

    trimEnableToggle.checked = false;
    trimControls.style.display = 'none';

    updateTrimHighlight();
  }

  function updateTrimHighlight() {
    let sVal = Math.min(Number(sliderRangeStart.value), Number(sliderRangeEnd.value));
    let eVal = Math.max(Number(sliderRangeStart.value), Number(sliderRangeEnd.value));

    const total = videoTotalSeconds || 100;
    const leftPercent = (sVal / total) * 100;
    const rightPercent = 100 - (eVal / total) * 100;

    rangeTrackHighlight.style.left = `${leftPercent}%`;
    rangeTrackHighlight.style.right = `${rightPercent}%`;

    const diff = Math.max(0, eVal - sVal);
    trimDurationVal.textContent = formatSecondsToTime(diff);

    updateDownloadBtnText();
  }

  function updateDownloadBtnText() {
    const isTrim = trimEnableToggle && trimEnableToggle.checked;
    const baseText = selectedFormat === 'mp4' ? 'Baixar Vídeo MP4' : 'Baixar Áudio MP3';
    if (isTrim) {
      const sVal = parseTimeToSeconds(trimStartInput.value);
      const eVal = parseTimeToSeconds(trimEndInput.value);
      const diff = Math.max(0, eVal - sVal);
      document.getElementById('download-btn-text').textContent = `Baixar Trecho Cortado (${formatSecondsToTime(diff)})`;
    } else {
      document.getElementById('download-btn-text').textContent = baseText;
    }
  }

  // Trimming Event Listeners
  if (trimEnableToggle) {
    trimEnableToggle.addEventListener('change', () => {
      trimControls.style.display = trimEnableToggle.checked ? 'block' : 'none';
      updateDownloadBtnText();
    });
  }

  if (sliderRangeStart) {
    sliderRangeStart.addEventListener('input', () => {
      let s = Number(sliderRangeStart.value);
      let e = Number(sliderRangeEnd.value);
      if (s > e) {
        s = e;
        sliderRangeStart.value = s;
      }
      trimStartInput.value = formatSecondsToTime(s);
      trimLabelStart.textContent = formatSecondsToTime(s);
      updateTrimHighlight();
    });
  }

  if (sliderRangeEnd) {
    sliderRangeEnd.addEventListener('input', () => {
      let s = Number(sliderRangeStart.value);
      let e = Number(sliderRangeEnd.value);
      if (e < s) {
        e = s;
        sliderRangeEnd.value = e;
      }
      trimEndInput.value = formatSecondsToTime(e);
      trimLabelEnd.textContent = formatSecondsToTime(e);
      updateTrimHighlight();
    });
  }

  if (trimStartInput) {
    trimStartInput.addEventListener('change', () => {
      let s = parseTimeToSeconds(trimStartInput.value);
      let e = parseTimeToSeconds(trimEndInput.value);
      if (s < 0) s = 0;
      if (s > videoTotalSeconds) s = videoTotalSeconds;
      if (s > e) s = e;
      trimStartInput.value = formatSecondsToTime(s);
      sliderRangeStart.value = s;
      trimLabelStart.textContent = formatSecondsToTime(s);
      updateTrimHighlight();
    });
  }

  if (trimEndInput) {
    trimEndInput.addEventListener('change', () => {
      let s = parseTimeToSeconds(trimStartInput.value);
      let e = parseTimeToSeconds(trimEndInput.value);
      if (e < s) e = s;
      if (e > videoTotalSeconds) e = videoTotalSeconds;
      trimEndInput.value = formatSecondsToTime(e);
      sliderRangeEnd.value = e;
      trimLabelEnd.textContent = formatSecondsToTime(e);
      updateTrimHighlight();
    });
  }

  document.querySelectorAll('.preset-chip[data-seconds]').forEach(chip => {
    chip.addEventListener('click', () => {
      const dur = Number(chip.getAttribute('data-seconds'));
      sliderRangeStart.value = 0;
      sliderRangeEnd.value = Math.min(dur, videoTotalSeconds);
      trimStartInput.value = '00:00';
      trimEndInput.value = formatSecondsToTime(Math.min(dur, videoTotalSeconds));
      trimLabelStart.textContent = '00:00';
      trimLabelEnd.textContent = formatSecondsToTime(Math.min(dur, videoTotalSeconds));
      updateTrimHighlight();
    });
  });

  if (btnFullVideo) {
    btnFullVideo.addEventListener('click', () => {
      sliderRangeStart.value = 0;
      sliderRangeEnd.value = videoTotalSeconds;
      trimStartInput.value = '00:00';
      trimEndInput.value = formatSecondsToTime(videoTotalSeconds);
      trimLabelStart.textContent = '00:00';
      trimLabelEnd.textContent = formatSecondsToTime(videoTotalSeconds);
      updateTrimHighlight();
    });
  }

  // Player vs Cover View Mode Toggles
  viewModePlayer.addEventListener('click', () => {
    viewModePlayer.classList.add('active');
    viewModeCover.classList.remove('active');
    playerFrameWrapper.style.display = 'flex';
    coverFrameWrapper.style.display = 'none';
  });

  viewModeCover.addEventListener('click', () => {
    viewModeCover.classList.add('active');
    viewModePlayer.classList.remove('active');
    coverFrameWrapper.style.display = 'block';
    playerFrameWrapper.style.display = 'none';
    if (nativePlayerVideo) nativePlayerVideo.pause();
  });

  function stopPlayer() {
    if (embedPlayerFrame) embedPlayerFrame.src = '';
    if (nativePlayerVideo) {
      nativePlayerVideo.pause();
      nativePlayerVideo.src = '';
    }
  }

  // Format Tabs
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      setFormatTab(type);
    });
  });

  function setFormatTab(type) {
    selectedFormat = type;
    tabBtns.forEach(b => {
      if (b.getAttribute('data-type') === type) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    if (type === 'mp4') {
      mp4Options.style.display = 'block';
      mp3Options.style.display = 'none';
    } else {
      mp4Options.style.display = 'none';
      mp3Options.style.display = 'block';
    }
    updateDownloadBtnText();
  }

  // New Search Button
  newSearchBtn.addEventListener('click', () => {
    stopPlayer();
    resultSection.style.display = 'none';
    currentVideoData = null;
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
    highlightPlatformChip('');
  });

  // Download Trigger
  downloadBtn.addEventListener('click', async () => {
    if (!currentVideoData) return;

    const url = currentVideoData.url;
    const format = selectedFormat;
    const quality = selectedFormat === 'mp4' ? qualitySelect.value : 'mp3';

    const payload = { url, format, quality };
    if (trimEnableToggle && trimEnableToggle.checked) {
      const s = parseTimeToSeconds(trimStartInput.value);
      const e = parseTimeToSeconds(trimEndInput.value);
      if (e <= s) {
        showError('O tempo final do corte deve ser maior que o tempo inicial.');
        showToast('Tempo de corte inválido.', 'error');
        return;
      }
      payload.start_time = s;
      payload.end_time = e;
      payload.is_trimmed = true;
    }

    // Show Progress Modal
    openProgressModal();

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível iniciar o download.');
      }

      startProgressPolling(data.taskId);

    } catch (err) {
      closeProgressModal();
      showError(err.message);
      showToast(err.message, 'error');
    }
  });

  // Modal helpers
  function openProgressModal() {
    progressModal.style.display = 'flex';
    progressTitle.textContent = selectedFormat === 'mp4' ? 'Preparando Vídeo MP4...' : 'Extraindo Áudio MP3...';
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressSpeed.textContent = 'Conectando...';
    progressEta.textContent = '';
    progressStatusDesc.textContent = 'Iniciando download e processamento no servidor local...';
    completedActions.style.display = 'none';
  }

  function closeProgressModal() {
    progressModal.style.display = 'none';
    if (activePollInterval) {
      clearInterval(activePollInterval);
      activePollInterval = null;
    }
  }

  closeModalBtn.addEventListener('click', closeProgressModal);

  // Poll progress
  function startProgressPolling(taskId) {
    if (activePollInterval) clearInterval(activePollInterval);

    activePollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/progress/${taskId}`);
        if (!res.ok) throw new Error('Falha ao verificar progresso.');

        const task = await res.json();

        if (task.status === 'downloading') {
          const pct = task.progress || 0;
          progressBarFill.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          progressSpeed.textContent = task.speed || 'Baixando...';
          progressEta.textContent = task.eta ? `Restante: ${task.eta}` : '';
          progressStatusDesc.textContent = 'Baixando fluxos de mídia...';
        } else if (task.status === 'converting') {
          progressBarFill.style.width = '99%';
          progressPercent.textContent = '99%';
          progressSpeed.textContent = 'Convertendo com FFmpeg...';
          progressEta.textContent = '';
          progressStatusDesc.textContent = selectedFormat === 'mp4'
            ? 'Mesclando áudio e vídeo em MP4...'
            : 'Convertendo áudio para MP3 320 kbps...';
        } else if (task.status === 'completed') {
          clearInterval(activePollInterval);
          activePollInterval = null;

          progressBarFill.style.width = '100%';
          progressPercent.textContent = '100%';
          progressSpeed.textContent = task.file_size || '';
          progressEta.textContent = 'Concluído!';
          progressTitle.textContent = 'Download Pronto!';
          progressStatusDesc.textContent = `Arquivo pronto: ${task.file_name} (${task.file_size})`;

          const fileUrl = `/api/file/${taskId}`;
          fileDownloadLink.href = fileUrl;
          completedActions.style.display = 'block';

          // Trigger automatic browser download
          const hiddenAnchor = document.createElement('a');
          hiddenAnchor.href = fileUrl;
          hiddenAnchor.download = task.file_name || 'download';
          document.body.appendChild(hiddenAnchor);
          hiddenAnchor.click();
          hiddenAnchor.remove();

          showToast('Download concluído com sucesso!', 'success');

          // Save to local history
          saveToHistory({
            id: taskId,
            title: task.title,
            fileName: task.file_name,
            fileSize: task.file_size,
            format: selectedFormat.toUpperCase(),
            quality: selectedFormat === 'mp4' ? qualitySelect.options[qualitySelect.selectedIndex].text : '320kbps MP3',
            fileUrl: fileUrl,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });

        } else if (task.status === 'error') {
          clearInterval(activePollInterval);
          activePollInterval = null;
          closeProgressModal();
          showError(`Erro no download: ${task.error || 'Erro desconhecido.'}`);
          showToast('Erro durante o download.', 'error');
        }

      } catch (err) {
        console.error(err);
      }
    }, 800);
  }

  // History Functions
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('omni_history') || '[]');
    } catch {
      return [];
    }
  }

  function saveToHistory(item) {
    const list = getHistory();
    list.unshift(item);
    if (list.length > 10) list.pop(); // keep last 10
    localStorage.setItem('omni_history', JSON.stringify(list));
    renderHistory();
  }

  function renderHistory() {
    const list = getHistory();
    if (list.length === 0) {
      historyList.innerHTML = '<p class="empty-history-text">Nenhum download recente ainda. Seus downloads concluídos aparecerão aqui.</p>';
      return;
    }

    historyList.innerHTML = '';
    list.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const isMp3 = item.format === 'MP3';
      const icon = isMp3 ? 'fa-music' : 'fa-film';

      el.innerHTML = `
        <div class="history-item-left">
          <i class="fa-solid ${icon} history-item-icon"></i>
          <div>
            <div class="history-item-title" title="${item.title}">${item.title}</div>
            <div class="history-item-meta">${item.format} • ${item.quality} • ${item.fileSize || ''} • ${item.date}</div>
          </div>
        </div>
        <div class="history-item-actions">
          <a href="${item.fileUrl}" class="btn-history-dl" download="${item.fileName}">
            <i class="fa-solid fa-download"></i> Baixar Novamente
          </a>
        </div>
      `;
      historyList.appendChild(el);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Deseja limpar o histórico recente?')) {
      localStorage.removeItem('omni_history');
      renderHistory();
      showToast('Histórico limpo.', 'info');
    }
  });

});
