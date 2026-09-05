import { join } from 'node:path';
import { BrowserWindow, app, shell } from 'electron';

const isDev = !app.isPackaged;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#07080b',
    autoHideMenuBar: true,
    title: 'Chess',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer is a pure browser app — it never needs Node. Keeping it
      // that way also keeps a future Tauri migration cheap.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.on('ready-to-show', () => window.show());

  // Anything that tries to open a new window goes to the real browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  app.on('browser-window-created', (_event, window) => {
    if (isDev) window.webContents.openDevTools({ mode: 'detach' });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
