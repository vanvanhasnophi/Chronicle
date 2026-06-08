/**
 * Chronicle Manager — Electron Main Process
 *
 * Wraps the Vue 3 SPA (Vite build output) in a native desktop window.
 */

const { app, BrowserWindow, shell, Menu } = require('electron');
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
