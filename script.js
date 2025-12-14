(() => {
  // Session / stimulus definitions
  const LIST1_TARGETS = [
    { id: 1, list: 1, word: 'manzana' },
    { id: 2, list: 1, word: 'oso' },
    { id: 3, list: 1, word: 'reloj' },
    { id: 4, list: 1, word: 'tijeras' },
    { id: 5, list: 1, word: 'sandía' },
    { id: 6, list: 1, word: 'pato' },
    { id: 7, list: 1, word: 'grapadora' },
    { id: 8, list: 1, word: 'cinta' },
    { id: 9, list: 1, word: 'fresas' },
    { id: 10, list: 1, word: 'tiza' },
    { id: 11, list: 1, word: 'caballo' },
    { id: 12, list: 1, word: 'elote' },
  ];
  const LIST2_TARGETS = [
    { id: 13, list: 2, word: 'hongos' },
    { id: 14, list: 2, word: 'cebolla' },
    { id: 15, list: 2, word: 'cuaderno' },
    { id: 16, list: 2, word: 'ardilla' },
    { id: 17, list: 2, word: 'loro' },
    { id: 18, list: 2, word: 'lechuga' },
    { id: 19, list: 2, word: 'lápiz' },
    { id: 20, list: 2, word: 'conejo' },
    { id: 21, list: 2, word: 'gato' },
    { id: 22, list: 2, word: 'naranja' },
    { id: 23, list: 2, word: 'basurero' },
    { id: 24, list: 2, word: 'pez' },
  ];
  const PRACTICE_TARGETS = [
    { id: 1, list: 0, word: 'elephant' },
    { id: 2, list: 0, word: 'fox' },
    { id: 3, list: 0, word: 'giraffe' },
    { id: 4, list: 0, word: 'hippopotamus' },
    { id: 5, list: 0, word: 'monkey' },
  ];

  const SESSION_CONFIGS = {
    production: {
      key: 'production',
      label: '本番（24試行）',
      note: 'これから24枚の写真が提示されます。写真が提示されたらできるだけ早くスペイン語の単語を声に出してください。',
      imageBaseUrl: 'https://ryuya-dot-com.github.io/TalkerVariability_Encoding/images',
      imageExt: '.jpg',
      recordDurationMs: 6000,
      itiMs: 1500,
      restMs: 5000,
      buildOrder: buildProductionOrder,
      recordingEnabled: true,
      csvFileName: (pid) => `results_${pid}.csv`,
      zipFileName: (pid) => `production_${pid}.zip`,
      recordingFileName: (pid, word) => `${pid}_${word}.wav`,
    },
    practice: {
      key: 'practice',
      label: '練習',
      note: '英語で練習してみましょう。写真が出たら即座に動物の名前を英語で言ってみましょう。',
      imageBaseUrl: 'practice',
      imageExt: '.png',
      recordDurationMs: 6000,
      itiMs: 1500,
      restMs: 5000,
      buildOrder: buildPracticeOrder,
      recordingEnabled: false,
      csvFileName: (pid) => `results_practice_${pid}.csv`,
      zipFileName: (pid) => `practice_${pid}.zip`,
      recordingFileName: (pid, word) => `${pid}_practice_${word}.wav`,
    },
  };
  const DEFAULT_SESSION_KEY = 'production';

  // DOM
  const preloadBtn = document.getElementById('preload-btn');
  const startBtn = document.getElementById('start-btn');
  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const fixationEl = document.getElementById('fixation');
  const messageEl = document.getElementById('message');
  const imgEl = document.getElementById('stimulus-img');
  const participantInput = document.getElementById('participant-id');
  const downloadBtn = document.getElementById('download-btn');
  const configEl = document.getElementById('config');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');

  // Warn on reload/back
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = 'Leaving this page will interrupt the task. Are you sure?';
  });
  if (history && history.pushState) {
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', () => {
      alert('Going back will interrupt the task. Please avoid navigating away.');
      history.pushState(null, '', location.href);
    });
  }

  // Helpers
  const setStatus = (txt) => statusEl.textContent = txt;
  const setLog = (txt) => logEl.textContent = txt;
  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  const stripAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hideProgress = () => {
    if (progressContainer) progressContainer.style.display = 'none';
  };
  const updateProgress = (completed, total) => {
    if (!progressContainer || !progressBar) return;
    const safeTotal = Math.max(1, total || 1);
    const pct = Math.min(100, Math.max(0, (completed / safeTotal) * 100));
    progressBar.style.width = `${pct}%`;
    progressContainer.style.display = 'block';
  };

  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const parseNumericId = (pid) => {
    const digits = pid.match(/\d+/g);
    return digits ? parseInt(digits.join(''), 10) : 0;
  };
  const makeImageFileName = (word, ext) => `${stripAccents(word)}${ext}`;
  function buildProductionOrder(participantId) {
    const n = parseNumericId(participantId);
    const rng = mulberry32(n * 1000 + 7);
    const list1 = seededShuffle(LIST1_TARGETS, rng);
    const list2 = seededShuffle(LIST2_TARGETS, rng);
    let takeFirst = n % 2 === 1; // odd -> List 1 first, even -> List 2 first
    const ordered = [];
    let i = 0;
    let j = 0;
    while (i < list1.length || j < list2.length) {
      if (takeFirst && i < list1.length) {
        ordered.push(list1[i++]);
      } else if (!takeFirst && j < list2.length) {
        ordered.push(list2[j++]);
      } else if (i < list1.length) {
        ordered.push(list1[i++]);
      } else if (j < list2.length) {
        ordered.push(list2[j++]);
      }
      takeFirst = !takeFirst;
    }
    return ordered.map((item) => {
      return {
        word: item.word,
        word_id: item.id,
        list: item.list,
        image_file: makeImageFileName(item.word, SESSION_CONFIGS.production.imageExt),
      };
    });
  }

  function buildPracticeOrder(participantId) {
    const n = parseNumericId(participantId);
    const rng = mulberry32(n * 1000 + 17);
    const ordered = seededShuffle(PRACTICE_TARGETS, rng);
    return ordered.map((item) => ({
      word: item.word,
      word_id: item.id,
      list: item.list,
      image_file: makeImageFileName(item.word, SESSION_CONFIGS.practice.imageExt),
    }));
  }

  async function preloadImages(order, imageBaseUrl) {
    const images = new Map();
    let loaded = 0;
    const total = order.length;
    for (const item of order) {
      const url = `${imageBaseUrl}/${item.image_file}`;
      setStatus(`画像プリロード中 (${loaded + 1}/${total})`);
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { images.set(item.word, img); loaded += 1; resolve(); };
        img.onerror = () => reject(new Error(`画像が読み込めません: ${url}`));
        img.src = url;
      });
    }
    setStatus(`画像プリロード完了 (${loaded}/${total})`);
    return images;
  }

  async function getMicStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return stream;
    } catch (err) {
      throw new Error(`マイクアクセスに失敗しました: ${err.message}`);
    }
  }

  function showFixation(progress) {
    imgEl.style.display = 'none';
    messageEl.style.display = 'none';
    fixationEl.style.display = 'block';
    if (progress && typeof progress.completed === 'number' && typeof progress.total === 'number') {
      updateProgress(progress.completed, progress.total);
    } else {
      hideProgress();
    }
  }
  function showMessage(text) {
    fixationEl.style.display = 'none';
    imgEl.style.display = 'none';
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    hideProgress();
  }
  function showImage(word, images) {
    fixationEl.style.display = 'none';
    messageEl.style.display = 'none';
    const img = images.get(word);
    imgEl.src = img.src;
    imgEl.style.display = 'block';
    hideProgress();
  }
  function enterExperimentScreen() {
    configEl.classList.add('hidden');
    startBtn.classList.add('hidden');
    downloadBtn.classList.add('hidden');
  }

  // PCM収集→WAVエンコード
  function encodeWav(buffers, sampleRate) {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const resultBuffer = new ArrayBuffer(44 + totalLength * 2);
    const view = new DataView(resultBuffer);

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + totalLength * 2, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, 1, true); offset += 2; // mono
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4; // byte rate
    view.setUint16(offset, 2, true); offset += 2; // block align
    view.setUint16(offset, 16, true); offset += 2; // bits per sample
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, totalLength * 2, true); offset += 4;

    let outOffset = offset;
    buffers.forEach((buf) => {
      for (let i = 0; i < buf.length; i++, outOffset += 2) {
        const s = Math.max(-1, Math.min(1, buf[i]));
        view.setInt16(outOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    });

    return new Blob([view], { type: 'audio/wav' });
  }

  function makePcmRecorder(stream) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    const source = audioCtx.createMediaStreamSource(stream);
    const bufferSize = 4096;
    const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    const chunks = [];
    let recording = false;

    processor.onaudioprocess = (e) => {
      if (!recording) return;
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
    };

    const start = async () => {
      recording = true;
      source.connect(processor);
      processor.connect(audioCtx.destination);
    };

    const stopAfter = (ms) => new Promise((resolve) => {
      setTimeout(() => {
        recording = false;
        processor.disconnect();
        source.disconnect();
        const wavBlob = encodeWav(chunks, audioCtx.sampleRate);
        audioCtx.close();
        resolve(wavBlob);
      }, ms);
    });

    return { start, stopAfter };
  }

  function buildCsv(rows) {
    const header = [
      'trial','word','word_id','list','image_file',
      'trial_start_epoch_ms',
      'image_onset_ms',
      'image_onset_epoch_ms',
      'recording_start_ms','recording_end_ms',
      'recording_start_epoch_ms','recording_end_epoch_ms',
      'iti_ms','participant_id','recording_file'
    ];
    const lines = [header.join(',')];
    rows.forEach((r) => {
      lines.push([
        r.trial,
        r.word,
        r.word_id,
        r.list,
        r.image_file,
        r.trial_start_epoch_ms,
        r.image_onset_ms.toFixed(3),
        r.image_onset_epoch_ms,
        r.recording_start_ms.toFixed(3),
        r.recording_end_ms.toFixed(3),
        r.recording_start_epoch_ms,
        r.recording_end_epoch_ms,
        r.iti_ms,
        r.participant_id,
        r.recording_file,
      ].join(','));
    });
    return lines.join('\n');
  }

  async function runTask(participantId, order, images, micStream, sessionConfig) {
    const { recordDurationMs, itiMs, restMs, label, recordingEnabled, recordingFileName } = sessionConfig;
    document.body.classList.add('running');
    showMessage('スペースキーで開始');
    setStatus(`${label} - 準備ができたらスペースキーで開始してください`);

    await new Promise((resolve) => {
      const handler = (ev) => {
        if (ev.key === ' ') {
          document.removeEventListener('keydown', handler);
          resolve();
        }
      };
      document.addEventListener('keydown', handler);
    });

    // Hide instructions once started
    messageEl.style.display = 'none';
    statusEl.textContent = '';
    setLog('');
    hideProgress();
    setLog('');

    const totalTrials = order.length;
    let completedTrials = 0;
    const results = [];
    const recordings = [];

    const recorderFactory = recordingEnabled ? () => makePcmRecorder(micStream) : null;

    // Initial rest
    showFixation({ completed: completedTrials, total: totalTrials });
    await delay(restMs);

    for (let idx = 0; idx < order.length; idx++) {
      const trial = order[idx];
      const recording = recorderFactory ? recorderFactory() : null;

      const trialStart = performance.now();
      const trialStartEpochMs = Date.now();

      setStatus('');
      showImage(trial.word, images);
      const imageOnsetMs = performance.now() - trialStart;
      const imageOnsetEpochMs = trialStartEpochMs + imageOnsetMs;

      let recStartMs = performance.now() - trialStart;
      let recStartEpochMs = trialStartEpochMs + recStartMs;
      let recEndMs = recStartMs + recordDurationMs;
      let recEndEpochMs = trialStartEpochMs + recEndMs;
      let filename = recordingEnabled && recordingFileName ? recordingFileName(participantId, trial.word) : '';

      if (recordingEnabled && recording) {
        await recording.start();
        const blobPromise = recording.stopAfter(recordDurationMs);
        const recBlob = await blobPromise;
        recEndMs = performance.now() - trialStart;
        recEndEpochMs = trialStartEpochMs + recEndMs;
        recordings.push({ filename, blob: recBlob });
      } else {
        // No recording: keep the same pacing by waiting the recording window.
        await delay(recordDurationMs);
      }

      results.push({
        trial: idx + 1,
        word: trial.word,
        word_id: trial.word_id,
        list: trial.list,
        image_file: trial.image_file,
        trial_start_epoch_ms: trialStartEpochMs,
        image_onset_ms: imageOnsetMs,
        image_onset_epoch_ms: imageOnsetEpochMs,
        recording_start_ms: recStartMs,
        recording_end_ms: recEndMs,
        recording_start_epoch_ms: recStartEpochMs,
        recording_end_epoch_ms: recEndEpochMs,
        iti_ms: itiMs,
        participant_id: participantId,
        recording_file: filename,
      });

      completedTrials = idx + 1;
      showFixation({ completed: completedTrials, total: totalTrials });
      await delay(itiMs);
    }

    // Final rest
    showFixation({ completed: totalTrials, total: totalTrials });
    await delay(restMs);

    showMessage('終了しました。お疲れさまでした。');
    document.body.classList.remove('running');
    setStatus('結果を準備しています...');
    return { results, recordings };
  }

  async function createZip(sessionConfig, participantId, results, recordings) {
    const zip = new JSZip();
    const csv = buildCsv(results);
    zip.file(sessionConfig.csvFileName(participantId), csv);
    if (sessionConfig.recordingEnabled) {
      recordings.forEach(({ filename, blob }) => {
        zip.file(filename, blob);
      });
    }
    const content = await zip.generateAsync({ type: 'blob' });
    return content;
  }

  preloadBtn.addEventListener('click', async () => {
    const participantId = participantInput.value.trim();
    if (!participantId) {
      setStatus('参加者IDを入力してください。');
      return;
    }

    preloadBtn.disabled = true;
    startBtn.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    setLog('');

    try {
      const practiceOrder = buildPracticeOrder(participantId);
      const productionOrder = buildProductionOrder(participantId);
      const practiceImages = await preloadImages(practiceOrder, SESSION_CONFIGS.practice.imageBaseUrl);
      const productionImages = await preloadImages(productionOrder, SESSION_CONFIGS.production.imageBaseUrl);

      setStatus('プリロード完了。スペースキーで練習を開始できます。');
      startBtn.classList.remove('hidden');
      showMessage('スペースキーで練習開始');
      setLog('');

      startBtn.onclick = async () => {
        enterExperimentScreen();
        startBtn.classList.add('hidden');
        try {
          // 練習（録音なし）
          await runTask(participantId, practiceOrder, practiceImages, null, SESSION_CONFIGS.practice);
          setStatus('練習を完了しました。本番のためマイク許可を確認します...');
          showMessage('練習終了');

          // マイク許可
          let micStream = null;
          micStream = await getMicStream();

          // 本番
          const { results, recordings } = await runTask(participantId, productionOrder, productionImages, micStream, SESSION_CONFIGS.production);
          const zipBlob = await createZip(SESSION_CONFIGS.production, participantId, results, recordings);
          const url = URL.createObjectURL(zipBlob);
          // 自動ダウンロード
          const a = document.createElement('a');
          a.href = url;
          a.download = SESSION_CONFIGS.production.zipFileName(participantId);
          document.body.appendChild(a);
          a.click();
          a.remove();
          setStatus('本番の結果をダウンロードしました。');
        } catch (err) {
          console.error(err);
          setStatus(`エラー: ${err.message}`);
          configEl.classList.remove('hidden');
          startBtn.classList.remove('hidden');
          document.body.classList.remove('running');
          preloadBtn.disabled = false;
        }
      };
    } catch (err) {
      console.error(err);
      setStatus(`エラー: ${err.message}`);
      preloadBtn.disabled = false;
    }
  });
})();
