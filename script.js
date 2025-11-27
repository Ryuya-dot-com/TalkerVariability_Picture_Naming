(() => {
  // Constants
  const WORDS = [
    'ardilla','basurero','caballo','cebolla','cinta','conejo',
    'cuaderno','elote','fresas','gato','grapadora','hongos',
    'lapiz','lechuga','loro','manzana','naranja','oso',
    'pato','pez','reloj','sandia','tijeras','tiza',
  ];
  const IMAGE_PATH = 'images';
  const RECORD_DURATION_MS = 6000; // 6 seconds
  const ITI_MS = 1500; // 1.5 seconds
  const REST_MS = 5000; // 5 seconds start/end

  // DOM
  const preloadBtn = document.getElementById('preload-btn');
  const startBtn = document.getElementById('start-btn');
  const downloadBtn = document.getElementById('download-btn');
  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const fixationEl = document.getElementById('fixation');
  const messageEl = document.getElementById('message');
  const imgEl = document.getElementById('stimulus-img');
  const participantInput = document.getElementById('participant-id');

  // Helpers
  const setStatus = (txt) => statusEl.textContent = txt;
  const setLog = (txt) => logEl.textContent = txt;
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

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

  function buildOrder(participantId) {
    const n = parseNumericId(participantId);
    const rng = mulberry32(n * 1000 + 7);
    const firstHalf = seededShuffle(WORDS.slice(0, 12), rng);
    const secondHalf = seededShuffle(WORDS.slice(12), rng);
    let takeFirst = rng() < 0.5;
    const ordered = [];
    let i = 0, j = 0;
    while (i < firstHalf.length || j < secondHalf.length) {
      if (takeFirst && i < firstHalf.length) {
        ordered.push(firstHalf[i++]);
      } else if (!takeFirst && j < secondHalf.length) {
        ordered.push(secondHalf[j++]);
      } else if (i < firstHalf.length) {
        ordered.push(firstHalf[i++]);
      } else if (j < secondHalf.length) {
        ordered.push(secondHalf[j++]);
      }
      takeFirst = !takeFirst;
    }
    return ordered.map((w) => ({ word: w, word_id: WORDS.indexOf(w) + 1, image_file: `${w}.jpg` }));
  }

  async function preloadImages(order) {
    const images = new Map();
    let loaded = 0;
    const total = order.length;
    for (const item of order) {
      const url = `${IMAGE_PATH}/${item.image_file}`;
      setStatus(`画像プリロード中 ${loaded}/${total}: ${item.word}`);
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

  function showFixation() {
    imgEl.style.display = 'none';
    messageEl.style.display = 'none';
    fixationEl.style.display = 'block';
  }
  function showMessage(text) {
    fixationEl.style.display = 'none';
    imgEl.style.display = 'none';
    messageEl.textContent = text;
    messageEl.style.display = 'block';
  }
  function showImage(word, images) {
    fixationEl.style.display = 'none';
    messageEl.style.display = 'none';
    const img = images.get(word);
    imgEl.src = img.src;
    imgEl.style.display = 'block';
  }

  function makeRecorder(stream, mimeType) {
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    const start = () => new Promise((resolve) => { recorder.start(); resolve(); });
    const stopAfter = (ms) => new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
      setTimeout(() => recorder.stop(), ms);
    });
    return { recorder, start, stopAfter };
  }

  function buildCsv(rows) {
    const header = ['trial','word','word_id','image_file','image_onset_ms','recording_start_ms','recording_end_ms','iti_ms','participant_id','recording_file'];
    const lines = [header.join(',')];
    rows.forEach((r) => {
      lines.push([
        r.trial,
        r.word,
        r.word_id,
        r.image_file,
        r.image_onset_ms.toFixed(3),
        r.recording_start_ms.toFixed(3),
        r.recording_end_ms.toFixed(3),
        r.iti_ms,
        r.participant_id,
        r.recording_file,
      ].join(','));
    });
    return lines.join('\n');
  }

  async function runTask(participantId, order, images, micStream) {
    document.body.classList.add('running');
    showMessage('スペースキーで開始');
    setStatus('準備ができたらスペースキーで開始してください');

    await new Promise((resolve) => {
      const handler = (ev) => {
        if (ev.key === ' ') {
          document.removeEventListener('keydown', handler);
          resolve();
        }
      };
      document.addEventListener('keydown', handler);
    });

    const results = [];
    const recordings = [];
    const expStart = performance.now();

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined;
    const recorderFactory = () => makeRecorder(micStream, mimeType);

    // Initial rest
    showFixation();
    setStatus(`開始前の休憩 ${REST_MS / 1000}秒`);
    await delay(REST_MS);

    for (let idx = 0; idx < order.length; idx++) {
      const trial = order[idx];
      const { recorder, start, stopAfter } = recorderFactory();

      showImage(trial.word, images);
      const imageOnsetMs = performance.now() - expStart;

      await start();
      const recStartMs = performance.now() - expStart;
      const blobPromise = stopAfter(RECORD_DURATION_MS);

      const recBlob = await blobPromise;
      const recEndMs = performance.now() - expStart;

      const filename = `${participantId}_${trial.word}.webm`;
      recordings.push({ filename, blob: recBlob });

      results.push({
        trial: idx + 1,
        word: trial.word,
        word_id: trial.word_id,
        image_file: trial.image_file,
        image_onset_ms: imageOnsetMs,
        recording_start_ms: recStartMs,
        recording_end_ms: recEndMs,
        iti_ms: ITI_MS,
        participant_id: participantId,
        recording_file: filename,
      });

      showFixation();
      setStatus(`試行 ${idx + 1}/${order.length} 完了。ITI 1.5秒`);
      await delay(ITI_MS);
    }

    // Final rest
    showFixation();
    setStatus(`終了前の休憩 ${REST_MS / 1000}秒`);
    await delay(REST_MS);

    showMessage('終了しました。お疲れさまでした。');
    setStatus('結果をZipでダウンロードできます。');
    return { results, recordings };
  }

  async function createZip(participantId, results, recordings) {
    const zip = new JSZip();
    const csv = buildCsv(results);
    zip.file(`results_${participantId}.csv`, csv);
    recordings.forEach(({ filename, blob }) => {
      zip.file(filename, blob);
    });
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
      const order = buildOrder(participantId);
      const images = await preloadImages(order);
      setStatus('マイク許可を確認しています...');
      const micStream = await getMicStream();
      setStatus('プリロード完了。スペースキーで開始できます。');
      startBtn.classList.remove('hidden');
      showMessage('スペースキーで開始');

      startBtn.onclick = async () => {
        startBtn.classList.add('hidden');
        try {
          const { results, recordings } = await runTask(participantId, order, images, micStream);
          const zipBlob = await createZip(participantId, results, recordings);
          const url = URL.createObjectURL(zipBlob);
          downloadBtn.classList.remove('hidden');
          downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `production_${participantId}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          };
        } catch (err) {
          console.error(err);
          setStatus(`エラー: ${err.message}`);
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
