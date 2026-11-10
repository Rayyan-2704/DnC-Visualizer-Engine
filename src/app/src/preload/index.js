/*
  preload/index.js — Safe bridge between main and renderer via contextBridge.
*/

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialog
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // Peek at a file header to detect algorithm and size
  peekFile: (filePath) => ipcRenderer.invoke('file:peek', filePath),

  // Load points for Snapshot mode
  loadPoints: (filePath, maxPoints) => ipcRenderer.invoke('file:loadPoints', filePath, maxPoints),

  // Get list of bundled data files
  listDataFiles: () => ipcRenderer.invoke('data:listFiles'),

  // Check if engine exists and get its path
  engineExists: () => ipcRenderer.invoke('engine:exists'),
  enginePath: () => ipcRenderer.invoke('engine:path'),

  // Run engine - returns promise that resolves when engine exits
  runEngine: (opts) => ipcRenderer.invoke('engine:run', opts),

  // Cancel the currently running engine
  cancelEngine: () => ipcRenderer.invoke('engine:cancel'),

  // Verify result using brute force / independent library calculation
  verifyResult: (opts) => ipcRenderer.invoke('verify:run', opts),

  // Listen for streaming engine output lines
  onEngineLine: (cb) => {
    const handler = (_event, line) => cb(line)
    ipcRenderer.on('engine:line', handler)
    return () => ipcRenderer.removeListener('engine:line', handler)
  },

  // Listen for engine completion
  onEngineDone: (cb) => {
    const handler = (_event, info) => cb(info)
    ipcRenderer.on('engine:done', handler)
    return () => ipcRenderer.removeListener('engine:done', handler)
  }
})
