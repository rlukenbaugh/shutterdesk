const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, handler) {
  const wrapped = (_event, data) => handler(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('shutterDesk', {
  isDesktopApp: true,
  listSources: () => ipcRenderer.invoke('sources:list'),
  captureSource: (sourceId) => ipcRenderer.invoke('capture:source', sourceId),
  captureRegion: () => ipcRenderer.invoke('capture:region'),
  saveCapture: (payload) => ipcRenderer.invoke('capture:save', payload),
  showFile: (filePath) => ipcRenderer.invoke('file:show', filePath),
  openOutputFolder: () => ipcRenderer.invoke('folder:open'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  onTriggerCapture: (handler) => subscribe('capture:trigger', handler),
  onCaptureDone: (handler) => subscribe('capture:done', handler),
  onCaptureError: (handler) => subscribe('capture:error', handler),
  onCaptureCancelled: (handler) => subscribe('capture:cancelled', handler)
});
