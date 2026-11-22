let sources = [];
let selectedSourceId = null;
let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;
let appConfig = null;
let lastFilePath = null;
let lastObjectUrl = null;

const api = window.shutterDesk;
const screensGrid = document.getElementById('screensGrid');
const windowsGrid = document.getElementById('windowsGrid');
const stage = document.getElementById('stage');
const statusEl = document.getElementById('status');
const btnRecord = document.getElementById('btnRecord');
const btnScreenshot = document.getElementById('btnScreenshot');
const btnRegion = document.getElementById('btnRegion');
const btnShowFile = document.getElementById('btnShowFile');

function setStatus(text, { error = false, filePath = null } = {}) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', error);
  lastFilePath = filePath;
  btnShowFile.hidden = !filePath;
}

function showInStage(el) {
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
  stage.replaceChildren(el);
}

async function loadSources() {
  try {
    sources = await api.listSources();
  } catch (err) {
    setStatus('Could not list screens and windows: ' + err.message, { error: true });
    return;
  }
  if (!sources.some((s) => s.id === selectedSourceId)) {
    const firstScreen = sources.find((s) => s.kind === 'screen');
    selectedSourceId = firstScreen ? firstScreen.id : (sources[0] ? sources[0].id : null);
  }
  renderSources();
}

function renderSources() {
  screensGrid.replaceChildren();
  windowsGrid.replaceChildren();
  for (const src of sources) {
    const card = document.createElement('button');
    card.className = 'source-card' + (src.id === selectedSourceId ? ' selected' : '');
    card.setAttribute('aria-pressed', String(src.id === selectedSourceId));
    card.title = src.name;
    let thumb;
    if (src.thumbnail) {
      thumb = document.createElement('img');
      thumb.alt = '';
      thumb.src = src.thumbnail;
    } else {
      thumb = document.createElement('div');
      thumb.className = 'blank';
    }
    const label = document.createElement('span');
    label.textContent = src.name;
    card.append(thumb, label);
    card.onclick = () => {
      selectedSourceId = src.id;
      renderSources();
    };
    (src.kind === 'screen' ? screensGrid : windowsGrid).appendChild(card);
  }
  for (const [grid, what] of [[screensGrid, 'screens'], [windowsGrid, 'windows']]) {
    if (grid.childElementCount === 0) {
      const empty = document.createElement('p');
      empty.className = 'meta';
      empty.textContent = `No ${what} found. Click "Refresh screens and windows".`;
      grid.appendChild(empty);
    }
  }
}

function showCapture(result) {
  const img = document.createElement('img');
  img.className = 'preview';
  img.alt = 'Latest capture';
  img.src = result.preview;
  showInStage(img);
  const { width, height } = result.size || {};
  setStatus(
    'Saved ' + (width ? `${width}×${height} ` : '') + 'to ' + result.filePath + (result.copied ? ' (also copied to clipboard)' : ''),
    { filePath: result.filePath }
  );
}

async function run(button, busyText, fn) {
  button.disabled = true;
  setStatus(busyText);
  try {
    const result = await fn();
    if (result && result.error) setStatus(result.error, { error: true });
    else if (result && result.cancelled) setStatus('Region capture cancelled.');
    // Successful captures are shown through onCaptureDone.
  } catch (err) {
    setStatus('Capture failed: ' + err.message, { error: true });
  } finally {
    button.disabled = false;
  }
}

function captureSelected() {
  return run(btnScreenshot, 'Capturing...', async () => {
    if (!selectedSourceId) await loadSources();
    if (!selectedSourceId) return { error: 'No screen or window to capture.' };
    return api.captureSource(selectedSourceId);
  });
}

function captureRegion() {
  return run(btnRegion, 'Drag to select an area (Esc cancels)...', () => api.captureRegion());
}

async function getDesktopStream(sourceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: (appConfig && appConfig.defaultFps) || 60
      }
    }
  });
}

function setRecordingUi(recording) {
  btnRecord.replaceChildren(
    document.createTextNode(recording ? 'Stop recording ' : 'Start recording '),
    Object.assign(document.createElement('kbd'), { textContent: 'Ctrl+Alt+Shift+R' })
  );
  btnRecord.classList.toggle('danger', recording);
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  if (!selectedSourceId) await loadSources();
  if (!selectedSourceId) {
    setStatus('No screen or window to record.', { error: true });
    return;
  }

  try {
    activeStream = await getDesktopStream(selectedSourceId);
  } catch (err) {
    setStatus('Could not start recording: ' + err.message, { error: true });
    return;
  }
  recordedChunks = [];

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  mediaRecorder = new MediaRecorder(activeStream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  // If the recorded window is closed, the stream ends; save what was recorded.
  activeStream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  }));
  mediaRecorder.onstop = async () => {
    activeStream.getTracks().forEach((t) => t.stop());
    setRecordingUi(false);
    setStatus('Saving recording...');
    try {
      const blob = new Blob(recordedChunks, { type: mimeType });
      recordedChunks = [];
      const buffer = await blob.arrayBuffer();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const result = await api.saveCapture({
        buffer: new Uint8Array(buffer),
        filename: `recording-${stamp}.webm`
      });

      const player = document.createElement('video');
      player.controls = true;
      const url = URL.createObjectURL(blob);
      player.src = url;
      showInStage(player);
      lastObjectUrl = url;
      if (result.saved) setStatus('Saved recording to ' + result.filePath, { filePath: result.filePath });
      else setStatus('The recording could not be saved: ' + (result.error || 'unknown error'), { error: true });
    } catch (err) {
      setStatus('The recording could not be saved: ' + err.message, { error: true });
    }
  };

  mediaRecorder.start(250);
  const live = document.createElement('video');
  live.muted = true;
  live.autoplay = true;
  live.srcObject = activeStream;
  showInStage(live);

  setRecordingUi(true);
  setStatus('Recording... press Ctrl+Alt+Shift+R or Stop recording to finish.');
}

document.getElementById('btnRefresh').onclick = loadSources;
btnScreenshot.onclick = captureSelected;
btnRegion.onclick = captureRegion;
btnRecord.onclick = toggleRecording;
btnShowFile.onclick = () => api.showFile(lastFilePath);
document.getElementById('btnOpenFolder').onclick = () => api.openOutputFolder();

api.onCaptureDone(showCapture);
api.onCaptureError(({ message }) => setStatus('Capture failed: ' + message, { error: true }));
api.onCaptureCancelled(() => setStatus('Region capture cancelled.'));
api.onTriggerCapture(({ mode }) => {
  if (mode === 'record') toggleRecording();
});

(async () => {
  appConfig = await api.getConfig();
  document.getElementById('version').textContent = 'Version ' + appConfig.version;
  if (appConfig.hotkeyFailures.length > 0) {
    const warning = document.getElementById('hotkeyWarning');
    warning.textContent = 'Another program already uses ' + appConfig.hotkeyFailures.join(', ') +
      ', so that shortcut will not work while it runs. The buttons and the tray menu still work.';
    warning.hidden = false;
  }
  setStatus('Ready. Captures are saved in ' + appConfig.outputDir);
  await loadSources();
})();
