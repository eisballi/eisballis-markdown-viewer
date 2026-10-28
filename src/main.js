'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const updater = require('./updater');
const STRINGS = require('./shared/strings.js');

const APP_NAME = "Eisballi's Markdown Viewer";
const WEBSITE_URL = 'https://eisballi.com';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const isDev = !app.isPackaged;

const DEFAULT_SETTINGS = {
  language: 'en',
  theme: 'dark',
  mode: 'view',
  textSize: 17,
  contentWidth: 800,
  editWidth: 800,
  splitRatio: 0.5,
  zoom: 1,
  bounds: null,
  lastDir: null,
  autoCheckUpdates: true,
};

let mainWindow = null;
let rendererDirty = false;
let allowClose = false;
let pendingFilePath = null;

function tr(key, vars) {
  const dict = STRINGS[settings.language] || STRINGS.en;
  let value = dict[key] !== undefined ? dict[key] : STRINGS.en[key];
  if (value === undefined) value = key;
  if (vars) {
    value = value.replace(/\{(\w+)\}/g, (match, name) =>
      vars[name] === undefined ? match : String(vars[name]),
    );
  }
  return value;
}

/* ------------------------------------------------------------------ settings */

const settingsPath = () => path.join(app.getPath('userData'), 'config.json');
let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    settings = { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

let settingsTimer = null;

function saveSettingsSoon() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(saveSettingsNow, 400);
}

function saveSettingsNow() {
  clearTimeout(settingsTimer);
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    /* settings are a convenience, never fatal */
  }
}

/* ------------------------------------------------------------------- helpers */

function isMarkdownPath(filePath) {
  return /\.(md|markdown|mdown|mkd|mkdn|mdtext)$/i.test(filePath);
}

function fileFromArgv(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  for (const arg of args) {
    if (!arg || arg.startsWith('-')) continue;
    const resolved = path.resolve(arg);
    try {
      if (fs.statSync(resolved).isFile()) return resolved;
    } catch {
      /* not a file, ignore */
    }
  }
  return null;
}

async function readMarkdownFile(filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new Error('Kein gültige Datei.');
  if (stat.size > MAX_FILE_SIZE) throw new Error('Die Datei ist größer als 20 MB und wird nicht geöffnet.');
  const content = await fsp.readFile(filePath, 'utf8');
  return {
    path: filePath,
    dir: path.dirname(filePath),
    name: path.basename(filePath),
    baseUrl: pathToFileURL(filePath).href,
    content,
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

/* -------------------------------------------------------------------- window */

function createWindow() {
  const bounds = settings.bounds || {};
  const win = new BrowserWindow({
    width: bounds.width || 1180,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    minWidth: 560,
    minHeight: 380,
    show: false,
    title: APP_NAME,
    backgroundColor: settings.theme === 'light' ? '#f6f7f9' : '#14161c',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow = win;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (settings.bounds && settings.bounds.maximized) win.maximize();
  });

  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  win.on('close', (event) => {
    rememberBounds(win);
    if (!rendererDirty || allowClose) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: [tr('dialog.close.save'), tr('dialog.close.discard'), tr('dialog.close.cancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: tr('dialog.close.title'),
      message: tr('dialog.close.message'),
      detail: tr('dialog.close.detail'),
    });
    if (choice === 0) win.webContents.send('command', 'save-and-close');
    if (choice === 1) {
      allowClose = true;
      win.close();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function rememberBounds(win) {
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  const bounds = maximized ? win.getNormalBounds() : win.getBounds();
  settings.bounds = { ...bounds, maximized };
  saveSettingsSoon();
}

function openExternalSafe(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) shell.openExternal(url);
  } catch {
    /* ignore malformed urls */
  }
}

/* ---------------------------------------------------------------------- menu */

function sendCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('command', command);
}

function buildMenu() {
  const language = settings.language === 'de' ? 'de' : 'en';
  const template = [
    {
      label: tr('menu.file'),
      submenu: [
        { label: tr('menu.open'), accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { label: tr('menu.save'), accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        { label: tr('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
        { type: 'separator' },
        { label: tr('menu.reveal'), click: () => sendCommand('reveal') },
        { type: 'separator' },
        { label: tr('menu.quit'), role: 'quit' },
      ],
    },
    {
      label: tr('menu.edit'),
      submenu: [
        { role: 'undo', label: tr('menu.undo') },
        { role: 'redo', label: tr('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: tr('menu.cut') },
        { role: 'copy', label: tr('menu.copy') },
        { role: 'paste', label: tr('menu.paste') },
        { role: 'selectAll', label: tr('menu.selectAll') },
      ],
    },
    {
      label: tr('menu.view'),
      submenu: [
        { label: tr('menu.modeView'), accelerator: 'CmdOrCtrl+1', click: () => sendCommand('mode-view') },
        { label: tr('menu.modeEdit'), accelerator: 'CmdOrCtrl+2', click: () => sendCommand('mode-edit') },
        { label: tr('menu.modeSplit'), accelerator: 'CmdOrCtrl+3', click: () => sendCommand('mode-split') },
        { type: 'separator' },
        { label: tr('menu.textLarger'), click: () => sendCommand('font-inc') },
        { label: tr('menu.textSmaller'), click: () => sendCommand('font-dec') },
        { label: tr('menu.textReset'), click: () => sendCommand('font-reset') },
        { type: 'separator' },
        { label: tr('menu.zoomReset'), click: () => sendCommand('zoom-reset') },
        { label: tr('menu.theme'), accelerator: 'CmdOrCtrl+D', click: () => sendCommand('toggle-theme') },
        { type: 'separator' },
        {
          label: tr('menu.language'),
          submenu: [
            {
              label: 'English',
              type: 'radio',
              checked: language === 'en',
              click: () => sendCommand('language-en'),
            },
            {
              label: 'Deutsch',
              type: 'radio',
              checked: language === 'de',
              click: () => sendCommand('language-de'),
            },
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: tr('menu.fullscreen') },
        { role: 'reload', label: tr('menu.reload') },
        ...(isDev ? [{ role: 'toggleDevTools', label: tr('menu.devtools') }] : []),
      ],
    },
    {
      label: tr('menu.help'),
      submenu: [
        { label: tr('menu.checkUpdates'), click: () => sendCommand('check-updates') },
        { type: 'separator' },
        { label: tr('menu.github'), click: () => sendCommand('github') },
        { label: tr('menu.website'), click: () => sendCommand('website') },
        { type: 'separator' },
        { label: tr('menu.about'), click: () => sendCommand('about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------------ ipc */

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    githubUrl: `https://github.com/${updater.repoSlug()}`,
    websiteUrl: WEBSITE_URL,
    settings,
  }));

  ipcMain.handle('app:pending-file', () => {
    const filePath = pendingFilePath;
    pendingFilePath = null;
    return filePath;
  });

  ipcMain.handle('settings:update', (_event, patch) => {
    if (!patch || typeof patch !== 'object') return settings;
    const previousLanguage = settings.language;
    const next = { ...settings, ...patch };
    next.bounds = settings.bounds; // window bounds are managed by the main process only
    next.language = next.language === 'de' ? 'de' : 'en';
    settings = next;
    saveSettingsSoon();
    if (settings.language !== previousLanguage) buildMenu();
    return settings;
  });

  ipcMain.handle('file:open', async (_event, filePath) => {
    let target = filePath;
    if (!target) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Markdown-Datei öffnen',
        defaultPath: settings.lastDir || app.getPath('documents'),
        properties: ['openFile'],
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn'] },
          { name: 'Textdateien', extensions: ['txt'] },
          { name: 'Alle Dateien', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePaths.length) return null;
      target = result.filePaths[0];
    }
    const file = await readMarkdownFile(target);
    settings.lastDir = path.dirname(target);
    saveSettingsSoon();
    return file;
  });

  ipcMain.handle('file:reload', async (_event, filePath) => {
    if (!filePath) return null;
    return readMarkdownFile(filePath);
  });

  ipcMain.handle('file:save', async (_event, { filePath, content }) => {
    if (!filePath) return null;
    await fsp.writeFile(filePath, String(content ?? ''), 'utf8');
    const stat = await fsp.stat(filePath);
    return { path: filePath, name: path.basename(filePath), size: stat.size, mtime: stat.mtimeMs };
  });

  ipcMain.handle('file:save-as', async (_event, { content, suggestedName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Speichern unter',
      defaultPath: path.join(settings.lastDir || app.getPath('documents'), suggestedName || 'unbenannt.md'),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Textdateien', extensions: ['txt'] },
        { name: 'Alle Dateien', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    await fsp.writeFile(result.filePath, String(content ?? ''), 'utf8');
    settings.lastDir = path.dirname(result.filePath);
    saveSettingsSoon();
    const stat = await fsp.stat(result.filePath);
    return {
      path: result.filePath,
      name: path.basename(result.filePath),
      baseUrl: pathToFileURL(result.filePath).href,
      dir: path.dirname(result.filePath),
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  });

  ipcMain.on('state:dirty', (_event, dirty) => {
    rendererDirty = Boolean(dirty);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setDocumentEdited?.(rendererDirty);
    }
  });

  ipcMain.on('window:force-close', () => {
    allowClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  ipcMain.on('window:set-title', (_event, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title || APP_NAME);
  });

  ipcMain.handle('app:zoom', (_event, factor) => {
    if (!mainWindow || mainWindow.isDestroyed()) return 1;
    const clamped = Math.min(3, Math.max(0.5, Number(factor) || 1));
    mainWindow.webContents.setZoomFactor(clamped);
    const applied = mainWindow.webContents.getZoomFactor();
    settings.zoom = applied;
    saveSettingsSoon();
    return applied;
  });

  ipcMain.handle('theme:set', (_event, theme) => {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
    return theme;
  });

  ipcMain.handle('dialog:confirm', async (_event, options) => {
    const config = options || {};
    const buttons =
      Array.isArray(config.buttons) && config.buttons.length
        ? config.buttons
        : [config.confirmLabel || 'OK', config.cancelLabel || 'Abbrechen'];
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons,
      defaultId: Number.isInteger(config.defaultId) ? config.defaultId : 0,
      cancelId: Number.isInteger(config.cancelId) ? config.cancelId : buttons.length - 1,
      noLink: true,
      message: config.message || '',
      detail: config.detail || '',
    });
    return result.response;
  });

  ipcMain.handle('dialog:message', async (_event, { message, detail, type }) => {
    await dialog.showMessageBox(mainWindow, {
      type: type || 'info',
      buttons: ['OK'],
      noLink: true,
      message: message || '',
      detail: detail || '',
    });
    return true;
  });

  ipcMain.handle('shell:open-external', (_event, url) => {
    openExternalSafe(url);
    return true;
  });

  ipcMain.handle('shell:open-path', (_event, targetPath) => {
    if (!targetPath) return false;
    shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle('shell:show-item', (_event, targetPath) => {
    if (!targetPath) return false;
    shell.showItemInFolder(targetPath);
    return true;
  });

  ipcMain.handle('file:url', (_event, filePath) => toFileUrl(filePath));

  ipcMain.handle('update:check', async (_event, options) => {
    return updater.checkForUpdates({
      owner: updater.repoSlug(),
      currentVersion: app.getVersion(),
      settings,
      appRoot: path.join(__dirname, '..'),
      force: Boolean(options && options.force),
    });
  });

  ipcMain.handle('update:install', async (event, payload) => {
    const send = (data) => {
      if (!event.sender.isDestroyed()) event.sender.send('update:progress', data);
    };
    return updater.installUpdate({ payload, send });
  });

  ipcMain.handle('app:quit', () => {
    allowClose = true;
    app.quit();
    return true;
  });
}

/* ----------------------------------------------------------------------- boot */

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = fileFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (filePath) mainWindow.webContents.send('command:open-path', filePath);
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('de.eisballi.markdownviewer');
    loadSettings();
    nativeTheme.themeSource = settings.theme === 'light' ? 'light' : 'dark';
    pendingFilePath = fileFromArgv(process.argv);
    registerIpc();
    buildMenu();
    createWindow();

    if (settings.autoCheckUpdates) {
      setTimeout(async () => {
        try {
          const result = await updater.checkForUpdates({
            owner: updater.repoSlug(),
            currentVersion: app.getVersion(),
            settings,
            appRoot: path.join(__dirname, '..'),
            silent: true,
          });
          if (result && result.status === 'update' && mainWindow) {
            mainWindow.webContents.send('update:available', result);
          }
        } catch {
          /* silent background check */
        }
      }, 8000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    saveSettingsNow();
    app.quit();
  });

  app.on('before-quit', () => {
    saveSettingsNow();
  });
}
