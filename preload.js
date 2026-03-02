const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  parseDocument: (data) => ipcRenderer.invoke('document:parse', data),
  compareDocuments: (docA, docB) => ipcRenderer.invoke('documents:compare', { docA, docB }),
  exportReport: (data) => ipcRenderer.invoke('report:export', data),
  renderPdfPage: (buffer, pageNumber, scale) => ipcRenderer.invoke('pdf:renderPage', { buffer, pageNumber, scale })
});
