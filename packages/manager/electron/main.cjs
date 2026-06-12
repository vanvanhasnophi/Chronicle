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
      // sandbox: true is NOT set — Electron's OS-level sandbox requires
      // user namespaces (Linux) or Seatbelt (Mac) to be pre-configured,
      // otherwise the renderer may fail to start. The combination of
      // contextIsolation + nodeIntegration:false + CSP provides a strong
      // enough isolation layer for this app's threat model.
    },
  });

  stripOrigin(newWin);
  setupMaximizeListener(newWin);
  setupUnsavedGuard(newWin);

  // Extract the route path from the incoming URL.
  // Electron resolves relative URLs before passing them to
  // setWindowOpenHandler, so we receive an absolute file:/// URL
  // (e.g. "file:///path/dist/editor?id=...") rather than a bare path.
  let routePath
  if (/^file:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      // If the URL already has a hash (e.g. "#/editor?id=..."), use it.
      if (parsed.hash && parsed.hash.startsWith('#/')) {
        routePath = parsed.hash.slice(1)
      } else {
        // pathname is /path/to/dist/editor — take everything after /dist/
        const pathAfterDist = parsed.pathname.split('/dist/')[1] || ''
        routePath = pathAfterDist + parsed.search
      }
    } catch (_) {
      routePath = url
    }
  } else if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      routePath = parsed.pathname.replace(/^\//, '') + parsed.search + parsed.hash
    } catch (_) {
      routePath = url.replace(/^\//, '')
    }
  } else {
    routePath = url.replace(/^\//, '')
  }

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

  // ── Navigation / external-link security ──────────────────
  // Prevent the renderer from navigating to unexpected URLs.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // In dev mode, allow navigation to the dev server.
    if (isDev && url.startsWith(DEV_URL)) return;
    // In production, only allow the loaded file:// page.
    if (!isDev && url.startsWith('file://')) return;
    event.preventDefault();
  });

  // Prevent redirects in production (file:// pages shouldn't redirect).
  // Dev mode (Vite) uses redirects for HMR; allow them.
  if (!isDev) {
    mainWindow.webContents.on('will-redirect', (event, url) => {
      event.preventDefault();
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow https:// external URLs; everything else is internal.
    if (/^https:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
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
  const viewSubmenu = isDev
    ? [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }]
    : [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }];

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Quit Chronicle' }] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: viewSubmenu },
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
    // Only accept chronicle://auth (ignore other schemes / hosts)
    if (parsed.protocol !== 'chronicle:' || parsed.hostname !== 'auth') return;
    const token = parsed.searchParams.get('token');
    // Token must be a non-empty hex string (expected session token format)
    if (token && /^[a-fA-F0-9]{16,}$/.test(token) && mainWindow) {
      mainWindow.webContents.send('login-callback', token);
    }
  } catch (e) { /* ignore malformed URLs */ }
}

// IPC: open browser for Passkey login
ipcMain.handle('open-external-login', async (event, url) => {
  // Only allow https:// (production) or http://localhost (dev)
  const ok = typeof url === 'string' && (
    url.startsWith('https://') ||
    (isDev && url.startsWith('http://localhost'))
  );
  if (!ok) return;
  try {
    await shell.openExternal(url);
  } catch (e) {
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

// IPC: write print HTML to temp file and open in system browser
ipcMain.handle('open-print-in-browser', async (event, html, title) => {
  // Reject oversized payloads (max ~2 MB of HTML)
  if (typeof html !== 'string' || html.length > 2 * 1024 * 1024) return;
  if (typeof title !== 'string') title = 'chronicle-print';

  const tmpDir = require('os').tmpdir();
  const safeTitle = title.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 60);
  const fileName = `chronicle-print-${safeTitle}-${Date.now()}.html`;
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, html, 'utf-8');
  shell.openPath(filePath);
});

// ── Content Security Policy ────────────────────────────────────
// Restrict what the renderer can load and execute. The CSP is
// applied to all file:// and internal pages.
app.on('web-contents-created', (event, contents) => {
  contents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': isDev
          ? ["default-src 'self' http://localhost:* ws://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; img-src 'self' data: blob: http://localhost:* https:; font-src 'self' http://localhost:*; connect-src 'self' http://localhost:* ws://localhost:* https:"]
          : ["default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://*"],
      },
    });
  });
});

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
