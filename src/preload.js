const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('romEditor', {
  openRom: () => ipcRenderer.invoke('open-rom'),
  readRom: (filePath) => ipcRenderer.invoke('read-rom', filePath),
  saveRom: (filePath, bytes) => ipcRenderer.invoke('save-rom', { filePath, bytes })
});
