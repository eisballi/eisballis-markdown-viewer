'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const subscribe = (channel, callback) => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('app:info'),
  pendingFile: () => ipcRenderer.invoke('app:pending-file'),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath || undefined),
  reloadFile: (filePath) => ipcRenderer.invoke('file:reload', filePath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  saveFileAs: (payload) => ipcRenderer.invoke('file:save-as', payload),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setDirty: (dirty) => ipcRenderer.send('state:dirty', dirty),
  setTitle: (title) => ipcRenderer.send('window:set-title', title),
  forceClose: () => ipcRenderer.send('window:force-close'),
  quit: () => ipcRenderer.invoke('app:quit'),
  zoom: (factor) => ipcRenderer.invoke('app:zoom', factor),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
  message: (options) => ipcRenderer.invoke('dialog:message', options),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('shell:show-item', targetPath),
  fileUrl: (filePath) => ipcRenderer.invoke('file:url', filePath),
  checkUpdates: (options) => ipcRenderer.invoke('update:check', options),
  installUpdate: (payload) => ipcRenderer.invoke('update:install', payload),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file && file.path ? file.path : null;
    }
  },
  onCommand: (callback) => subscribe('command', callback),
  onOpenPath: (callback) => subscribe('command:open-path', callback),
  onUpdateAvailable: (callback) => subscribe('update:available', callback),
  onUpdateProgress: (callback) => subscribe('update:progress', callback),
});
