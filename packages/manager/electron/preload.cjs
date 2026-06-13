/**
 * Chronicle Manager — Electron Preload Script
 *
 * Minimal bridge between renderer (Vue SPA) and Node.js backend.
 * Exposes safe APIs via contextBridge for future use (file system access,
 * native dialogs, etc.).
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// ── Auth token injection for child windows ──────────────────
// Electron BrowserWindows don't reliably share localStorage for
// file:// origins. The main process passes the auth token as a
// _auth query param; we extract it before Vue boots and clean
// the URL so no application code ever sees it.
(function injectAuthFromUrl() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const token = qs.get('_auth');
    if (token) {
      localStorage.setItem('chronicle_auth', token);
      // Clean the URL — remove _auth from query without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('_auth');
      window.history.replaceState(null, '', url.toString());
    }
  } catch (_) {}
})();

contextBridge.exposeInMainWorld('chronicleElectron', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Resolve File object → filesystem path (Electron 32+).
  // Falls back to empty string for non-backed files (in-memory blobs, etc.).
  getPathForFile: (file) => webUtils.getPathForFile(file),

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

  // Print: write standalone HTML to a temp file and open in system browser
  openPrintInBrowser: (html, title) => ipcRenderer.invoke('open-print-in-browser', html, title),

  // Safe subset of process.env
  env: {
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || '',
  },
});
