let sources = [];
let selectedSourceId = null;
let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;
let appConfig = null;

const sourcesGrid = document.getElementById('sourcesGrid');
const stage = document.getElementById('stage');
const statusEl = document.getElementById('status');
const btnRecord = document.getElementById('btnRecord');

async function loadSources() {
  sources = await window.shutterDesk.listSources();
  if (!selectedSourceId && sources.length > 0) {
    selectedSourceId = sources[0].id;
  }
  renderSources();
}

function renderSources() {
  sourcesGrid.innerHTML = '';
  for (const src of sources) {
    const card = document.createElement('button');
    card.className = 'source-card' + (src.id === selectedSourceId ? ' selected' : '');
    card.innerHTML = '<img alt="" /><span></span>';
    card.querySelector('img').src = src.thumbnail;
    card.querySelector('span').textContent = src.name;
    card.onclick = () => {
      selectedSourceId = src.id;
      renderSources();
    };
    sourcesGrid.appendChild(card);
  }
}

async function getDesktopStream(sourceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: appConfig?.defaultFps || 60
      }
    }
  });
}

async function captureScreenshot() {
  if (!selectedSourceId) await loadSources();
  if (!selectedSourceId) return;

  statusEl.textContent = 'Capturing screen...';
  const stream = await getDesktopStream(selectedSourceId);
  const video = document.createElement('video');
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stream.getTracks().forEach((t) => t.stop());

  const ext = appConfig?.defaultImageFormat || 'png';
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.94));
  const buffer = await blob.arrayBuffer();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${stamp}.${ext}`;

  const result = await window.shutterDesk.saveCapture({
    buffer: new Uint8Array(buffer),
    filename,
    mimeType: mime,
    askLocation: false
  });

  const url = URL.createObjectURL(blob);
  stage.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'preview';
  img.src = url;
  stage.appendChild(img);

  statusEl.textContent = result.saved ? 'Saved: ' + result.filePath : 'Capture ready';
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  if (!selectedSourceId) await loadSources();
  if (!selectedSourceId) return;

  activeStream = await getDesktopStream(selectedSourceId);
  recordedChunks = [];

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  mediaRecorder = new MediaRecorder(activeStream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    activeStream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(recordedChunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${stamp}.webm`;
    const result = await window.shutterDesk.saveCapture({
      buffer: new Uint8Array(buffer),
      filename,
      mimeType,
      askLocation: false
    });

    const url = URL.createObjectURL(blob);
    stage.innerHTML = '';
    const player = document.createElement('video');
    player.controls = true;
    player.src = url;
    stage.appendChild(player);

    btnRecord.textContent = 'Start Screen Recording';
    btnRecord.classList.remove('danger');
    statusEl.textContent = result.saved ? 'Saved video: ' + result.filePath : 'Recording finished';
  };

  mediaRecorder.start(250);
  stage.innerHTML = '';
  const live = document.createElement('video');
  live.muted = true;
  live.autoplay = true;
  live.srcObject = activeStream;
  stage.appendChild(live);

  btnRecord.textContent = 'Stop Recording';
  btnRecord.classList.add('danger');
  statusEl.textContent = 'Recording active...';
}

document.getElementById('btnRefresh').onclick = loadSources;
document.getElementById('btnScreenshot').onclick = captureScreenshot;
document.getElementById('btnRecord').onclick = toggleRecording;
document.getElementById('btnOpenFolder').onclick = () => window.shutterDesk.openOutputFolder();

(async () => {
  appConfig = await window.shutterDesk.getConfig();
  await loadSources();
  window.shutterDesk.onTriggerCapture(({ mode }) => {
    if (mode === 'record') toggleRecording();
    else captureScreenshot();
  });
})();
