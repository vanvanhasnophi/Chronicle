/**
 * Chronicle Manager — Electron Main Process
 *
 * Wraps the Vue 3 SPA (Vite build output) in a native desktop window.
 */

const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';

let mainWindow = null;

function getDistIndex() {
  const p = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(p)) return p;
  throw new Error('dist/index.html not found. Run vite build first.');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Chronicle Manager',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Strip Origin header so the host's CORS middleware sees no origin
  // and allows the request. The CSP connectSrc (fixed in host/index.js)
  // also permits connections to localhost:* now.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    delete details.requestHeaders['origin'];
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(getDistIndex());
  }

  // Intercept beforeunload: show native dialog instead of silently failing
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Leave anyway?',
    });
    if (choice === 0) {
      mainWindow.webContents.removeAllListeners('will-prevent-unload');
      mainWindow.close();
    }
  });

  setupMaximizeListener(mainWindow);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ────────────────────────────────────────────────────
if (Menu) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Quit Chronicle' }] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
    ]},
    { label: 'Help', submenu: [
      { label: 'Chronicle Docs', click: () => shell.openExternal('https://github.com/vanvanhasnophi/Chronicle') },
    ]},
  ]));
}

// ── Window Controls (frameless) ─────────────────────────────
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Notify renderer when maximize state changes
function setupMaximizeListener(win) {
  win.on('maximize', () => {
    win.webContents.send('window-maximize-change', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-maximize-change', false);
  });
}

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
