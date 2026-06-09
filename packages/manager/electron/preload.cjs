/**
 * Chronicle Manager — Electron Preload Script
 *
 * Minimal bridge between renderer (Vue SPA) and Node.js backend.
 * Exposes safe APIs via contextBridge for future use (file system access,
 * native dialogs, etc.).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chronicleElectron', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Window controls (frameless window)
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window-maximize-change', (_event, isMaximized) => callback(isMaximized));
  },

  // IPC channels (placeholder for future use)
  send(channel, data) {
    const allowed = ['open-file', 'save-file', 'set-title'];
    if (allowed.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on(channel, callback) {
    const allowed = ['file-opened', 'file-saved'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  // Browser login for Passkey 2FA (WebAuthn not available in Electron)
  openExternalLogin: (baseUrl) => ipcRenderer.invoke('open-external-login', baseUrl),
  onLoginCallback: (callback) => {
    ipcRenderer.on('login-callback', (_event, token) => callback(token));
  },

  // Safe subset of process.env
  env: {
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || '',
  },
});
