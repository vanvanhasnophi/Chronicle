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

// ── Helpers ─────────────────────────────────────────────────

function stripOrigin(win) {
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    delete details.requestHeaders['origin'];
    callback({ requestHeaders: details.requestHeaders });
  });
}

function setupUnsavedGuard(win) {
  win.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Leave anyway?',
    });
    if (choice === 0) {
      win.webContents.removeAllListeners('will-prevent-unload');
      win.close();
    }
  });
}

function createChildWindow(url) {
  const newWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Chronicle Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  stripOrigin(newWin);
  setupMaximizeListener(newWin);
  setupUnsavedGuard(newWin);

  const routePath = url.replace(/^\//, '');
  const winUrl = isDev
    ? `${DEV_URL}/${routePath}`
    : `file:///${getDistIndex().replace(/\\/g, '/')}#/${routePath}`;
  newWin.loadURL(winUrl);
  return newWin;
}

// ── Main window ──────────────────────────────────────────────

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

  stripOrigin(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    createChildWindow(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(getDistIndex());
  }

  setupUnsavedGuard(mainWindow);
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
// Each call targets the window that sent the IPC, not just mainWindow.
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('window-is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
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

// ── Auth callback via custom protocol ────────────────────────
// Browser login completes → chronicle://auth?token=xxx → Electron receives token

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('chronicle', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('chronicle');
}

// Handle protocol URL on macOS (open-url event)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthCallback(url);
});

// Handle protocol URL on Windows/Linux (second-instance or argv)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Check for chronicle:// URL in argv
    const url = argv.find(a => a.startsWith('chronicle://'));
    if (url) handleAuthCallback(url);
  });
}

function handleAuthCallback(url) {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token');
    if (token && mainWindow) {
      mainWindow.webContents.send('login-callback', token);
    }
  } catch (e) { /* ignore malformed URLs */ }
}

// IPC: open browser for Passkey login
ipcMain.handle('open-external-login', async (event, url) => {
  try {
    await shell.openExternal(url);
  } catch (e) {
    // xdg-open fails in headless/WSL — show URL so user can copy it
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Open in browser',
        message: `Please open this URL in your browser:\n\n${url}`,
        buttons: ['OK']
      });
    }
  }
});

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
