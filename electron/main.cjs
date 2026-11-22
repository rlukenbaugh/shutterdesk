const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
  clipboard,
  nativeImage,
  dialog,
  shell,
  screen
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'ShutterDesk';
// Must match "appId" in package.json. Windows uses it to tie the running window, the taskbar
// button and the Start menu shortcut the installer creates together (pinning, notifications).
const APP_ID = 'com.shutterdesk.capture';
const ASSETS = path.join(__dirname, '..', 'assets');

const CONFIG = {
  hotkeyFullscreen: 'CommandOrControl+Shift+S',
  hotkeyRegion: 'CommandOrControl+Shift+A',
  hotkeyRecord: 'CommandOrControl+Shift+R',
  minimizeToTray: true,
  autoCopyToClipboard: true,
  defaultImageFormat: 'png',
  defaultFps: 60
};

const SAVE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.webm']);

let mainWindow = null;
let regionWindow = null;
let tray = null;
let isQuitting = false;
let trayHintShown = false;
let busy = false;
const hotkeyFailures = [];

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// Starting ShutterDesk again (for example from the Start menu) brings back the running window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function resolveOutputDir() {
  const target = path.join(app.getPath('pictures'), APP_NAME);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#0b0e14',
    title: APP_NAME,
    icon: path.join(ASSETS, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Never let the window navigate away or open new windows; links go to the browser.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (CONFIG.minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      // Tell people once per session where the app went, so it does not look like it quit.
      if (!trayHintShown && tray && process.platform === 'win32') {
        trayHintShown = true;
        tray.displayBalloon({
          iconType: 'info',
          title: APP_NAME + ' is still running',
          content: 'It is in the notification area so the capture shortcuts keep working. Right-click the icon and choose Quit to close it.'
        });
      }
    }
  });
}

function createTray() {
  // The old tray icon was an embedded PNG whose data was corrupt, so the tray showed a blank
  // icon and the app seemed to vanish when its window was closed.
  const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromPath(path.join(ASSETS, 'icon.png')) : icon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ' + APP_NAME, click: showMainWindow },
    { type: 'separator' },
    { label: 'Capture Full Screen', accelerator: CONFIG.hotkeyFullscreen, click: () => captureDisplayUnderCursor() },
    { label: 'Capture Region', accelerator: CONFIG.hotkeyRegion, click: () => captureRegion() },
    { label: 'Start/Stop Screen Recording', accelerator: CONFIG.hotkeyRecord, click: () => sendToRenderer('capture:trigger', { mode: 'record' }) },
    { type: 'separator' },
    { label: 'Open Captures Folder', click: () => shell.openPath(resolveOutputDir()) },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}

function registerHotkeys() {
  const keys = [
    [CONFIG.hotkeyFullscreen, () => captureDisplayUnderCursor()],
    [CONFIG.hotkeyRegion, () => captureRegion()],
    [CONFIG.hotkeyRecord, () => sendToRenderer('capture:trigger', { mode: 'record' })]
  ];
  for (const [accelerator, handler] of keys) {
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, handler);
    } catch (err) {
      console.error('Hotkey registration failed:', accelerator, err);
    }
    // register() returns false when another program already owns the shortcut.
    if (!ok) hotkeyFailures.push(accelerator.replace('CommandOrControl', 'Ctrl'));
  }
}

// ---------------------------------------------------------------------------------------
// Capturing
// ---------------------------------------------------------------------------------------

/** Physical pixel size of a display (bounds are in DIPs, so multiply by the scale factor). */
function physicalSize(display) {
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hides ShutterDesk while fn runs so it is not in its own screenshot. */
async function withWindowHidden(fn) {
  const wasVisible = mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized();
  if (wasVisible) {
    mainWindow.hide();
    await wait(250);
  }
  try {
    return await fn();
  } finally {
    if (wasVisible) mainWindow.show();
  }
}

/** Full-resolution image of one display, or of the source with the given id. */
async function grabImage({ display, sourceId }) {
  const displays = screen.getAllDisplays();
  const largest = displays.map(physicalSize).reduce(
    (a, b) => ({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) }),
    { width: 0, height: 0 }
  );
  const isWindow = sourceId && sourceId.startsWith('window:');
  const thumbnailSize = display ? physicalSize(display) : largest;
  const sources = await desktopCapturer.getSources({
    types: [isWindow ? 'window' : 'screen'],
    thumbnailSize,
    fetchWindowIcons: false
  });

  let source = null;
  if (sourceId) source = sources.find((s) => s.id === sourceId);
  if (!source && display) {
    source = sources.find((s) => s.display_id === String(display.id));
    // Some Windows setups report an empty display_id; the screens are then in display order.
    if (!source) source = sources[displays.findIndex((d) => d.id === display.id)] || sources[0];
  }
  if (!source) throw new Error('That screen or window is no longer available. Click Refresh.');
  if (source.thumbnail.isEmpty()) throw new Error('Windows returned an empty picture for ' + source.name + '.');
  return { image: source.thumbnail, name: source.name };
}

/** Puts an image on the clipboard. Returns false (and logs) if that did not work. */
async function copyImageToClipboard(image, png) {
  try {
    if (typeof clipboard.writeImage === 'function') {
      clipboard.writeImage(image); // Electron 44 and older
    } else {
      // Electron 45+ replaced writeImage with the W3C-style write([ClipboardItem]).
      const { ClipboardItem } = require('electron');
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
    }
    return true;
  } catch (err) {
    console.error('Copying to the clipboard failed:', err);
    return false;
  }
}

async function saveImage(image, prefix) {
  const ext = CONFIG.defaultImageFormat === 'jpg' ? 'jpg' : 'png';
  const filePath = path.join(resolveOutputDir(), `${prefix}-${timestamp()}.${ext}`);
  const png = image.toPNG();
  fs.writeFileSync(filePath, ext === 'jpg' ? image.toJPEG(94) : png);
  const copied = CONFIG.autoCopyToClipboard ? await copyImageToClipboard(image, png) : false;
  return { filePath, copied };
}

/** Saves the image and shows it in the main window. */
async function reportCapture(image, prefix) {
  const { filePath, copied } = await saveImage(image, prefix);
  const { width } = image.getSize();
  const preview = width > 1600 ? image.resize({ width: 1600, quality: 'good' }) : image;
  const result = {
    filePath,
    preview: preview.toDataURL(),
    copied,
    size: image.getSize()
  };
  sendToRenderer('capture:done', result);
  return result;
}

function reportError(err) {
  const message = err && err.message ? err.message : String(err);
  console.error('Capture failed:', err);
  sendToRenderer('capture:error', { message });
  return { error: message };
}

async function exclusive(fn) {
  if (busy) return { error: 'A capture is already in progress.' };
  busy = true;
  try {
    return await fn();
  } catch (err) {
    return reportError(err);
  } finally {
    busy = false;
  }
}

function captureDisplayUnderCursor() {
  return exclusive(() => withWindowHidden(async () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { image } = await grabImage({ display });
    return reportCapture(image, 'screenshot');
  }));
}

function captureSource(sourceId) {
  return exclusive(() => withWindowHidden(async () => {
    const isWindow = sourceId.startsWith('window:');
    const { image } = await grabImage({ sourceId });
    return reportCapture(image, isWindow ? 'window' : 'screenshot');
  }));
}

/**
 * Freezes the display under the mouse, shows it full screen and lets the user drag out a
 * rectangle. Resolves with the cropped image, or null when cancelled (Esc / right-click).
 */
function selectRegion(display, image) {
  return new Promise((resolve) => {
    regionWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'region-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    regionWindow.setAlwaysOnTop(true, 'screen-saver');

    let finished = false;
    const finish = (rect) => {
      if (finished) return;
      finished = true;
      ipcMain.removeHandler('region:done');
      const win = regionWindow;
      regionWindow = null;
      // Close after the current IPC reply has gone out.
      setImmediate(() => { if (win && !win.isDestroyed()) win.destroy(); });
      if (!rect || rect.width < 3 || rect.height < 3) return resolve(null);
      const scale = image.getSize().width / display.bounds.width;
      const crop = {
        x: Math.max(0, Math.round(rect.x * scale)),
        y: Math.max(0, Math.round(rect.y * scale)),
        width: Math.round(rect.width * scale),
        height: Math.round(rect.height * scale)
      };
      const size = image.getSize();
      crop.width = Math.min(crop.width, size.width - crop.x);
      crop.height = Math.min(crop.height, size.height - crop.y);
      resolve(image.crop(crop));
    };

    ipcMain.handle('region:done', (_event, rect) => finish(rect));
    regionWindow.on('closed', () => finish(null));
    regionWindow.webContents.on('will-navigate', (event) => event.preventDefault());

    regionWindow.loadFile(path.join(__dirname, '..', 'renderer', 'region.html'));
    regionWindow.webContents.once('did-finish-load', () => {
      // JPEG keeps the IPC message small; the crop itself is taken from the original image.
      regionWindow.webContents.send('region:image', 'data:image/jpeg;base64,' + image.toJPEG(90).toString('base64'));
      regionWindow.show();
      regionWindow.focus();
    });
  });
}

function captureRegion() {
  return exclusive(() => withWindowHidden(async () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { image } = await grabImage({ display });
    const cropped = await selectRegion(display, image);
    if (!cropped) {
      sendToRenderer('capture:cancelled', {});
      return { cancelled: true };
    }
    return reportCapture(cropped, 'region');
  }));
}

// ---------------------------------------------------------------------------------------
// IPC from the main window
// ---------------------------------------------------------------------------------------

ipcMain.handle('sources:list', async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: Math.round(320 * primary.size.height / primary.size.width) }
  });
  return sources
    .filter((src) => !(src.id.startsWith('window:') && src.name === APP_NAME))
    .map((src) => ({
      id: src.id,
      name: src.name,
      kind: src.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: src.thumbnail.isEmpty() ? '' : src.thumbnail.toDataURL()
    }));
});

ipcMain.handle('capture:source', (_event, sourceId) => {
  if (typeof sourceId !== 'string') return { error: 'No screen or window selected.' };
  return captureSource(sourceId);
});

ipcMain.handle('capture:region', () => captureRegion());

// Used for screen recordings, which are made in the window itself.
ipcMain.handle('capture:save', async (_event, payload) => {
  const { buffer, filename } = payload || {};
  // Only a plain file name with a known extension, never a path chosen by the page.
  const safeName = path.basename(String(filename || '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  if (!safeName || !SAVE_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
    return { saved: false, error: 'Unsupported file name.' };
  }
  const filePath = path.join(resolveOutputDir(), safeName);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return { saved: true, filePath };
});

ipcMain.handle('file:show', (_event, filePath) => {
  const dir = resolveOutputDir();
  if (typeof filePath === 'string' && path.resolve(filePath).startsWith(dir + path.sep) && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    shell.openPath(dir);
  }
});

ipcMain.handle('folder:open', async () => {
  const dir = resolveOutputDir();
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('config:get', () => ({
  appName: APP_NAME,
  version: app.getVersion(),
  outputDir: resolveOutputDir(),
  hotkeyFailures: [...hotkeyFailures],
  ...CONFIG
}));

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    createWindow();
    createTray();
    registerHotkeys();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showMainWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !CONFIG.minimizeToTray) {
    app.quit();
  }
});
