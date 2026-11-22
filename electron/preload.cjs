const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shutterDesk', {
  isDesktopApp: true,
  listSources: () => ipcRenderer.invoke('sources:list'),
  saveCapture: (payload) => ipcRenderer.invoke('capture:save', payload),
  openOutputFolder: () => ipcRenderer.invoke('folder:open'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  onTriggerCapture: (handler) => {
    const wrapped = (_event, data) => handler(data);
    ipcRenderer.on('capture:trigger', wrapped);
    return () => ipcRenderer.removeListener('capture:trigger', wrapped);
  }
});
