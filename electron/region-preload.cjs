const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('regionSelect', {
  onImage: (handler) => ipcRenderer.on('region:image', (_event, dataUrl) => handler(dataUrl)),
  done: (rect) => ipcRenderer.invoke('region:done', rect)
});
