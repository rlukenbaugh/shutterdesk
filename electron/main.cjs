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
const os = require('os');

const APP_NAME = "ShutterDesk";
const CONFIG = {
  hotkeyFullscreen: "CommandOrControl+Shift+S",
  hotkeyRegion: "CommandOrControl+Shift+A",
  hotkeyRecord: "CommandOrControl+Shift+R",
  minimizeToTray: true,
  launchAtStartup: false,
  autoCopyToClipboard: true,
  defaultImageFormat: "png",
  defaultFps: 60,
  outputFolderTemplate: "%USERPROFILE%\\Pictures\\ShutterDesk"
};

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Ensure launching from Windows Start Menu always focuses the running window
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function resolveOutputDir() {
  const expanded = CONFIG.outputFolderTemplate
    .replace(/%USERPROFILE%/gi, os.homedir())
    .replace(/%HOME%/gi, os.homedir());
  const target = expanded || path.join(app.getPath('pictures'), APP_NAME);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#0b0e14',
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (CONFIG.minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWElEQVR4nGNgGAWjgP6AhYGB4T8DA8N/BhiAKWZmYmBg+I9NIxMDLgNI1YAqQKoBLAzEGoAqQGkD0C2gywA0C5AGkOwCdAOgLiBsgAE2A4k2AKoAxQIGBgYAP5gJ1i5j6rUAAAAASUVORK5CYII=';
  const icon = nativeImage.createFromDataURL(iconDataUrl);
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ' + APP_NAME, click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Capture Full Screen', accelerator: CONFIG.hotkeyFullscreen, click: () => triggerCapture('fullscreen') },
    { label: 'Capture Region', accelerator: CONFIG.hotkeyRegion, click: () => triggerCapture('region') },
    { label: 'Toggle Screen Recording', accelerator: CONFIG.hotkeyRecord, click: () => triggerCapture('record') },
    { type: 'separator' },
    { label: 'Open Captures Folder', click: () => shell.openPath(resolveOutputDir()) },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function triggerCapture(mode) {
  if (!mainWindow) return;
  mainWindow.webContents.send('capture:trigger', { mode });
}

function registerHotkeys() {
  try {
    globalShortcut.register(CONFIG.hotkeyFullscreen, () => triggerCapture('fullscreen'));
    globalShortcut.register(CONFIG.hotkeyRegion, () => triggerCapture('region'));
    globalShortcut.register(CONFIG.hotkeyRecord, () => triggerCapture('record'));
  } catch (err) {
    console.error('Hotkey registration failed:', err);
  }
}

ipcMain.handle('sources:list', async () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: Math.min(width, 640), height: Math.min(height, 360) }
  });
  return sources.map((src) => ({
    id: src.id,
    name: src.name,
    displayId: src.display_id,
    thumbnail: src.thumbnail.toDataURL()
  }));
});

ipcMain.handle('capture:save', async (_event, payload) => {
  const { buffer, filename, mimeType, askLocation } = payload;
  const outputDir = resolveOutputDir();
  const data = Buffer.from(buffer);

  if (CONFIG.autoCopyToClipboard && mimeType && mimeType.startsWith('image/')) {
    const img = nativeImage.createFromBuffer(data);
    if (!img.isEmpty()) {
      clipboard.writeImage(img);
    }
  }

  let filePath = path.join(outputDir, filename);
  if (askLocation) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Capture',
      defaultPath: filePath
    });
    if (result.canceled || !result.filePath) {
      return { saved: false };
    }
    filePath = result.filePath;
  }

  fs.writeFileSync(filePath, data);
  return { saved: true, filePath };
});

ipcMain.handle('folder:open', async () => {
  const dir = resolveOutputDir();
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('config:get', () => ({
  appName: APP_NAME,
  outputDir: resolveOutputDir(),
  ...CONFIG
}));

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    if (CONFIG.launchAtStartup) {
      app.setLoginItemSettings({ openAtLogin: true });
    }
    createWindow();
    createTray();
    registerHotkeys();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !CONFIG.minimizeToTray) {
    app.quit();
  }
});
