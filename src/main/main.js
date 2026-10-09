'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, nativeTheme, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const integration = require('./windows-integration');
const palette = require('../shared/palette');
const i18n = require('../shared/i18n');
const { createPathUtils } = require('../shared/platform');
const { normPath } = createPathUtils(process.platform);
const { filesFromArgv } = require('./file-arguments');

const APP_ID = 'com.folio.markdown';
const ROOT = path.join(__dirname, '..', '..');
const RENDERER_INDEX = path.join(ROOT, 'dist', 'renderer', 'index.html');
const APP_ICON = path.join(ROOT, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const TITLEBAR_HEIGHT = 40;
const MAX_FILE_SIZE = 50 * 1024 * 1024;


// ---------------------------------------------------------------------------
// Ligne de commande. Les options --snap* servent aux captures d'écran de test :
//   electron . fichier.md --snap=sortie.png --snap-theme=dark --snap-scroll=800
// ---------------------------------------------------------------------------

function readFlag(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const snap = readFlag('snap')
  ? {
      out: path.resolve(readFlag('snap')),
      theme: readFlag('snap-theme') || 'light',
      size: (readFlag('snap-size') || '1280x860').split('x').map(Number),
      query: Object.fromEntries(
        process.argv
          .filter((a) => a.startsWith('--snap-') && a.includes('='))
          .filter((a) => !a.startsWith('--snap-size='))
          .map((a) => a.slice(7).split(/=(.*)/s).slice(0, 2)),
      ),
    }
  : null;

// The integration suite must never use the owner's settings or migrate real notes.
const testUserData = process.env.FOLIO_E2E === '1' ? readFlag('test-userdata') : null;
if (testUserData) {
  if (!path.isAbsolute(testUserData)) throw new Error('The test profile must be an absolute path.');
  fs.mkdirSync(testUserData, { recursive: true });
  app.setPath('userData', testUserData);
  app.disableHardwareAcceleration();
}

if (snap) {
  app.setPath('userData', readFlag('snap-userdata') || path.join(app.getPath('temp'), 'folio-snapshot'));
  app.disableHardwareAcceleration();
}

// --register / --unregister : intégration à Windows sans ouvrir de fenêtre (utilisé par l'installation ;
// l'installateur classique ajoute --no-shortcuts car il crée lui-même les raccourcis).
const integrationCommand = process.argv.includes('--register')
  ? 'register'
  : process.argv.includes('--unregister')
    ? 'unregister'
    : null;

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  theme: 'system',
  language: 'auto',
  font: 'system',
  fontSize: 16,
  width: 'normal',
  outline: true,
  outlineSide: 'left',
  autoReload: true,
  autoSave: 'afterEdit',
  autoSaveInterval: 5,
  breaks: false,
  spellcheck: true,
  editorMode: 'split',
  colors: {},
  shortcuts: {},
  tabLayout: 'horizontal',
  vtabsState: 'expanded',
  vtabsVisibleState: 'expanded',
  vtabsWidth: 248,
  restoreSession: true,
  spaces: [],
  session: null,
  folders: [],
  filesExpanded: [],
  filesPanel: false,
  filesWidth: 260,
  filesShowAll: false,
  recent: [],
  window: null,
};
const SETTABLE = [
  'theme',
  'language',
  'font',
  'fontSize',
  'width',
  'outline',
  'outlineSide',
  'autoReload',
  'autoSave',
  'autoSaveInterval',
  'breaks',
  'spellcheck',
  'editorMode',
  'colors',
  'shortcuts',
  'tabLayout',
  'vtabsState',
  'vtabsVisibleState',
  'vtabsWidth',
  'restoreSession',
  'spaces',
  'session',
  'folders',
  'filesExpanded',
  'filesPanel',
  'filesWidth',
  'filesShowAll',
];

// Folio s'appelait Plume : au premier lancement, reprend ses paramètres et son stockage local.
function migrateFromPlume() {
  const userData = app.getPath('userData');
  const legacy = path.join(path.dirname(userData), 'Plume');
  if (snap || testUserData || fs.existsSync(path.join(userData, 'settings.json')) || !fs.existsSync(legacy)) return;
  for (const name of ['settings.json', 'Local Storage', 'Session Storage']) {
    try {
      fs.cpSync(path.join(legacy, name), path.join(userData, name), { recursive: true, force: false });
    } catch {
      /* élément absent */
    }
  }
}

migrateFromPlume();

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return { ...DEFAULT_SETTINGS, ...raw, recent: Array.isArray(raw.recent) ? raw.recent : [] };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
let saveTimer = null;

function saveSettingsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettingsNow, 400);
}

function saveSettingsNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (snap) return;
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    const tmp = `${settingsFile()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, settingsFile());
  } catch (err) {
    console.error('Impossible d’enregistrer les paramètres :', err);
  }
}

const themeSource = (t) => (t === 'light' || t === 'dark' ? t : 'system');

// ---------------------------------------------------------------------------
// Langue (boîtes de dialogue, menu contextuel, messages d'erreur, correcteur)
// ---------------------------------------------------------------------------

function systemLanguages() {
  try {
    const list = app.getPreferredSystemLanguages();
    if (list && list.length) return list;
  } catch {
    /* API indisponible */
  }
  return [app.getLocale()];
}

let tr = i18n.createTranslator('fr');

function applyLanguage() {
  tr = i18n.createTranslator(i18n.resolveLanguage(settings.language, systemLanguages()));
  if (mainWindow && !mainWindow.isDestroyed()) applySpellLanguages(mainWindow.webContents.session);
}

/** Dictionnaires : langue de l'interface, langues de Windows prises en charge, puis anglais. */
function applySpellLanguages(session) {
  try {
    const available = new Set(session.availableSpellCheckerLanguages || []);
    const wanted = [];
    const add = (code) => {
      if (code && !wanted.includes(code) && (!available.size || available.has(code))) wanted.push(code);
    };
    add(i18n.LANGUAGES.find((l) => l.code === tr.lang)?.spell);
    for (const tag of systemLanguages()) {
      const code = i18n.resolveLanguage(null, [tag]);
      if (code === String(tag).toLowerCase().split(/[-_]/)[0]) add(i18n.LANGUAGES.find((l) => l.code === code)?.spell);
    }
    add('en-US');
    session.setSpellCheckerLanguages(wanted.slice(0, 3));
  } catch {
    /* langues indisponibles */
  }
}

// ---------------------------------------------------------------------------
// Encodage des fichiers
// ---------------------------------------------------------------------------

function decode(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf8bom' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return { text: swapped.toString('utf16le'), encoding: 'utf16be' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf8' };
  } catch {
    // Ancien fichier Windows (ANSI) : on le lit en windows-1252, il sera réenregistré en UTF-8.
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'utf8' };
  }
}

function encode(text, encoding) {
  switch (encoding) {
    case 'utf8bom':
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
    case 'utf16le':
      return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    case 'utf16be': {
      const body = Buffer.from(text, 'utf16le');
      body.swap16();
      return Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
    }
    default:
      return Buffer.from(text, 'utf8');
  }
}

function friendlyError(err) {
  switch (err && err.code) {
    case 'ENOENT':
      return tr('error.notFound');
    case 'EACCES':
    case 'EPERM':
      return tr('error.accessDenied');
    case 'EBUSY':
      return tr('error.busy');
    case 'EISDIR':
      return tr('error.isDirectory');
    case 'ENOTEMPTY':
      return tr('error.notEmpty');
    case 'EEXIST':
      return tr('error.exists');
    default:
      return (err && err.message) || String(err);
  }
}

// ---------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------

let mainWindow = null;
let rendererReady = false;
let allowClose = false;
let pendingFiles = [];
let quitting = false;
let snapResult = null;

const isDark = () => nativeTheme.shouldUseDarkColors;

/** Couleurs de la fenêtre (barre de titre, fond) selon le mode et les couleurs personnalisées. */
function windowColors(dark = isDark()) {
  const { chrome } = palette.computePalette(dark ? 'dark' : 'light', settings.colors);
  return {
    background: chrome.background,
    overlay: { color: chrome.color, symbolColor: chrome.symbol, height: TITLEBAR_HEIGHT },
  };
}

function applyWindowColors() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const colors = windowColors();
  try {
    mainWindow.setTitleBarOverlay(colors.overlay);
  } catch {
    /* pas de barre de titre superposée */
  }
  mainWindow.setBackgroundColor(colors.background);
}

function openFiles(files) {
  if (!files.length) return;
  if (mainWindow && rendererReady) mainWindow.webContents.send('app:open-files', files);
  else pendingFiles.push(...files);
}

function restoreBounds() {
  if (snap) return { width: snap.size[0], height: snap.size[1] };
  const w = settings.window;
  const fallback = { width: 1180, height: 820 };
  if (!w || !w.width || !w.height) return fallback;
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    w.x < a.x + a.width - 80 && w.x + w.width > a.x + 80 && w.y >= a.y - 10 && w.y < a.y + a.height - 60);
  return visible ? { x: w.x, y: w.y, width: w.width, height: w.height } : { width: w.width, height: w.height };
}

function trackWindowState(win) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isFullScreen()) return;
      settings.window = { ...win.getNormalBounds(), maximized: win.isMaximized() };
      saveSettingsSoon();
    }, 300);
  };
  for (const evt of ['resize', 'move', 'maximize', 'unmaximize']) win.on(evt, save);
}

// L'exécutable est celui d'Electron, non modifié (exigence du Contrôle intelligent des
// applications de Windows) : l'icône de Folio est donc fournie à la fenêtre elle-même.
function windowIcon() {
  return fs.existsSync(APP_ICON) ? APP_ICON : undefined;
}

function createWindow() {
  const colors = windowColors();
  rendererReady = false;
  allowClose = false;

  mainWindow = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 560,
    minHeight: 400,
    show: false,
    title: 'Folio',
    icon: windowIcon(),
    backgroundColor: colors.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: colors.overlay,
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 13 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: !!settings.spellcheck,
      offscreen: !!snap,
    },
  });

  const win = mainWindow;
  // Initial window bounds may be clamped to the display work area. Captures need
  // their requested content size, including on smaller CI desktops.
  if (snap) win.setContentSize(snap.size[0], snap.size[1]);
  const wc = win.webContents;

  if (!snap && settings.window && settings.window.maximized) win.maximize();
  if (!snap) trackWindowState(win);

  if (process.platform === 'win32' && !process.windowsStore && windowIcon()) {
    // Icône et nom corrects quand la fenêtre est épinglée à la barre des tâches.
    try {
      win.setAppDetails({
        appId: APP_ID,
        appIconPath: APP_ICON,
        appIconIndex: 0,
        relaunchCommand: app.isPackaged ? `"${process.execPath}"` : undefined,
        relaunchDisplayName: 'Folio',
      });
    } catch {
      /* non pris en charge */
    }
  }

  applySpellLanguages(wc.session);

  win.once('ready-to-show', () => {
    if (!snap && !testUserData) win.show();
  });

  // Aucune navigation : tout se passe dans la page.
  wc.on('will-navigate', (event, url) => {
    if (url !== wc.getURL()) event.preventDefault();
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('context-menu', (_event, params) => buildContextMenu(win, params));

  wc.on('render-process-gone', () => {
    rendererReady = false;
  });
  win.on('unresponsive', () => {
    rendererReady = false;
  });

  win.on('close', (event) => {
    if (allowClose || !rendererReady || snap) return;
    event.preventDefault();
    wc.send('app:before-close');
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    rendererReady = false;
    unwatchAll();
  });

  win.loadFile(RENDERER_INDEX, { query: snap ? { snap: '1', ...snap.query } : {} });

  if (snap) {
    // A timeout is a failed check, even when a fallback screenshot can be captured.
    setTimeout(() => captureAndQuit(), 90000);
    wc.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') {
        console.log(`[renderer ${event.level}] ${event.message}`);
      }
    });
  }
}

function buildContextMenu(win, p) {
  const t = [];
  const sep = () => {
    if (t.length && t[t.length - 1].type !== 'separator') t.push({ type: 'separator' });
  };

  if (p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 6)) {
      t.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    }
    if (!p.dictionarySuggestions.length) t.push({ label: tr('context.noSuggestions'), enabled: false });
    t.push({
      label: tr('context.addToDictionary'),
      click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord),
    });
    sep();
  }

  if (p.linkURL && /^(https?|mailto):/i.test(p.linkURL)) {
    t.push({ label: tr('context.openLink'), click: () => shell.openExternal(p.linkURL) });
    t.push({ label: tr('context.copyLink'), click: () => clipboard.writeText(p.linkURL) });
    sep();
  }

  if (p.mediaType === 'image' && p.srcURL) {
    t.push({ label: tr('context.copyImage'), click: () => win.webContents.copyImageAt(p.x, p.y) });
    sep();
  }

  if (p.isEditable) {
    t.push({ role: 'cut', label: tr('context.cut'), enabled: p.editFlags.canCut });
    t.push({ role: 'copy', label: tr('context.copy'), enabled: p.editFlags.canCopy });
    t.push({ role: 'paste', label: tr('context.paste'), enabled: p.editFlags.canPaste });
    sep();
    t.push({ role: 'selectAll', label: tr('context.selectAll') });
  } else {
    const selection = (p.selectionText || '').trim();
    if (selection) {
      t.push({ role: 'copy', label: tr('context.copy') });
      if (selection.length <= 80) {
        const short = selection.length > 30 ? `${selection.slice(0, 30)}…` : selection;
        t.push({ label: tr('context.search', { text: short }), click: () => win.webContents.send('app:find', selection) });
      }
      sep();
    }
    t.push({ label: tr('context.selectAll'), click: () => win.webContents.send('app:select-all') });
  }

  if (t.length && t[t.length - 1].type === 'separator') t.pop();
  if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
}

async function captureAndQuit() {
  if (!snap || !mainWindow || captureAndQuit.done) return;
  captureAndQuit.done = true;
  let exitCode = snapResult && !snapResult.failures?.length ? 0 : 1;
  try {
    const image = await mainWindow.webContents.capturePage();
    fs.mkdirSync(path.dirname(snap.out), { recursive: true });
    fs.writeFileSync(snap.out, image.toPNG());
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid PDF output');
    fs.writeFileSync(`${snap.out}.pdf`, pdf);
    fs.writeFileSync(`${snap.out}.json`, JSON.stringify({
      platform: process.platform, arch: process.arch, version: app.getVersion(), packaged: app.isPackaged,
      windowsStore: !!process.windowsStore,
      ...(process.windowsStore ? { windowsIntegration: integration.status() } : {}),
      ...(snapResult || { failures: ['Renderer did not finish before the timeout'] }), pdf: true,
    }, null, 2));
  } catch (err) {
    exitCode = 1;
    console.error('Capture impossible :', err);
  }
  setTimeout(() => app.exit(exitCode), 50);
}

// ---------------------------------------------------------------------------
// Surveillance des fichiers ouverts (rechargement automatique)
// ---------------------------------------------------------------------------

const watched = new Map();
const watchKey = (p) => normPath(path.resolve(p));

function watchFile(p, count = 1) {
  const key = watchKey(p);
  const entry = watched.get(key);
  if (entry) {
    entry.count += count;
    return;
  }
  const listener = (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file:changed', { path: p, exists: curr.mtimeMs !== 0 });
    }
  };
  fs.watchFile(p, { interval: 400, persistent: false }, listener);
  watched.set(key, { path: p, listener, count });
}

function unwatchFile(p) {
  const key = watchKey(p);
  const entry = watched.get(key);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) {
    fs.unwatchFile(entry.path, entry.listener);
    watched.delete(key);
  }
}

const isInside = (p, dir) => {
  const rel = path.relative(dir, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

/**
 * Renommage ou déplacement depuis le panneau Dossiers : la surveillance des documents
 * ouverts suit leurs fichiers (sans signaler à tort « fichier introuvable »).
 */
function moveWatches(from, to) {
  for (const [key, entry] of [...watched]) {
    if (!isInside(entry.path, from)) continue;
    fs.unwatchFile(entry.path, entry.listener);
    watched.delete(key);
    const rel = path.relative(from, entry.path);
    watchFile(rel ? path.join(to, rel) : to, entry.count);
  }
}

// Dossiers affichés dans le panneau Dossiers : une création, une suppression ou un
// renommage est signalé à l'interface, avec les chemins touchés, pour qu'elle ne relise
// que les dossiers concernés. Les simples modifications de contenu (« change », par
// exemple l'enregistrement automatique) ne changent pas la liste et sont ignorées.
const folderWatchers = new Map();
let watchedRoots = [];

function watchFolders(roots) {
  const list = (Array.isArray(roots) ? roots : []).filter((r) => typeof r === 'string' && r).map((r) => path.resolve(r));
  watchedRoots = list;
  const wanted = new Set(list.map(watchKey));
  for (const [key, entry] of folderWatchers) {
    if (wanted.has(key)) continue;
    closeFolderWatcher(key);
  }
  for (const root of list) {
    const key = watchKey(root);
    if (folderWatchers.has(key)) continue;
    const entry = { root, timer: null, watcher: null, paths: new Set(), full: false };
    const flush = () => {
      const paths = entry.full || entry.paths.size > 200 ? null : [...entry.paths];
      entry.paths.clear();
      entry.full = false;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('folders:changed', { root, paths });
    };
    const notify = (eventType, filename) => {
      if (eventType === 'change') return;
      if (filename) entry.paths.add(path.join(root, String(filename)));
      else entry.full = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(flush, 250);
    };
    try {
      entry.watcher = fs.watch(root, { recursive: true, persistent: false }, notify);
      entry.watcher.on('error', () => {
        closeFolderWatcher(key);
        entry.full = true;
        flush();
      });
      folderWatchers.set(key, entry);
    } catch {
      /* dossier introuvable : le panneau l'affiche comme tel */
    }
  }
}

function closeFolderWatcher(key) {
  const entry = folderWatchers.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  try {
    entry.watcher.close();
  } catch {
    /* déjà fermé */
  }
  folderWatchers.delete(key);
}

/**
 * Avant de renommer ou de déplacer un dossier surveillé (ou qui en contient un), sa
 * surveillance est suspendue : Windows peut refuser de renommer un dossier ouvert.
 * L'interface relance ensuite la surveillance avec les nouveaux chemins.
 */
function pauseFolderWatchers(src) {
  for (const [key, entry] of [...folderWatchers]) if (isInside(entry.root, src)) closeFolderWatcher(key);
}

function unwatchAll() {
  for (const entry of watched.values()) fs.unwatchFile(entry.path, entry.listener);
  watched.clear();
  for (const entry of folderWatchers.values()) {
    clearTimeout(entry.timer);
    entry.watcher.close();
  }
  folderWatchers.clear();
}

// ---------------------------------------------------------------------------
// Fichiers récents
// ---------------------------------------------------------------------------

function addRecent(p) {
  const key = watchKey(p);
  settings.recent = [{ path: p, openedAt: Date.now() }, ...settings.recent.filter((r) => watchKey(r.path) !== key)].slice(0, 12);
  saveSettingsSoon();
  if (!snap) {
    try {
      app.addRecentDocument(p);
    } catch {
      /* liste de raccourcis indisponible */
    }
  }
}

// ---------------------------------------------------------------------------
// Panneau Dossiers : lecture et organisation des fichiers
// ---------------------------------------------------------------------------

// Masqués : fichiers et dossiers cachés (.git, .obsidian…), dépendances et fichiers système.
const IGNORED_NAMES = new Set(['node_modules', '$recycle.bin', 'system volume information', 'desktop.ini', 'thumbs.db']);
const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]|[. ]$|^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function checkName(name) {
  const s = String(name || '');
  if (!s || s === '.' || s === '..' || s.length > 240 || (process.platform === 'win32' ? INVALID_NAME : /[/\u0000]/).test(s)) return tr('error.invalidName');
  return null;
}

const failure = (err) => ({ ok: false, code: err && err.code, error: friendlyError(err) });

async function listFolder(dir) {
  const p = path.resolve(String(dir));
  const entries = await fsp.readdir(p, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const name = entry.name;
    // Liens symboliques et jonctions (« Mes images »… dans Documents) : ignorés.
    if (name.startsWith('.') || IGNORED_NAMES.has(name.toLowerCase()) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) items.push({ name, path: path.join(p, name), dir: true });
    else if (entry.isFile()) items.push({ name, path: path.join(p, name), dir: false });
  }
  return { path: p, entries: items };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

const SAFE_TO_OPEN = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|ico|avif|txt|csv|tsv|json|xml|html?|docx?|xlsx?|pptx?|odt|ods|odp|rtf|mp4|webm|mov|mp3|wav|ogg|m4a|zip)$/i;

function registerIpc() {
  const winOf = (event) => BrowserWindow.fromWebContents(event.sender) || mainWindow;

  ipcMain.handle('app:ready', () => {
    rendererReady = true;
    const files = pendingFiles;
    pendingFiles = [];
    return {
      files,
      settings,
      systemLanguages: systemLanguages(),
      version: app.getVersion(),
      versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
      packaged: app.isPackaged,
      platform: process.platform,
    };
  });

  ipcMain.handle('app:close-confirmed', () => {
    allowClose = true;
    if (quitting) app.quit();
    else if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('app:close-canceled', () => { quitting = false; });

  ipcMain.handle('app:snap-ready', (_event, result) => {
    if (snap) {
      snapResult = result || { checks: [], failures: [] };
      setTimeout(() => captureAndQuit(), 300);
    }
  });

  ipcMain.handle('settings:set', (_event, patch) => {
    for (const key of Object.keys(patch || {})) {
      if (SETTABLE.includes(key)) settings[key] = patch[key];
    }
    if (patch && 'theme' in patch && !snap) nativeTheme.themeSource = themeSource(settings.theme);
    if (patch && 'colors' in patch) applyWindowColors();
    if (patch && 'language' in patch) applyLanguage();
    if (patch && 'spellcheck' in patch && mainWindow) {
      mainWindow.webContents.session.setSpellCheckerEnabled(!!settings.spellcheck);
    }
    saveSettingsSoon();
    return settings;
  });

  ipcMain.handle('file:open-dialog', async (event) => {
    const result = await dialog.showOpenDialog(winOf(event), {
      title: tr('dialog.openTitle'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdwn', 'mdx', 'txt'] },
        { name: tr('dialog.allFiles'), extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('file:save-dialog', async (event, suggested) => {
    const result = await dialog.showSaveDialog(winOf(event), {
      title: tr('dialog.saveTitle'),
      defaultPath: suggested || `${tr('doc.untitled')}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: tr('dialog.allFiles'), extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('file:read', async (_event, filePath) => {
    try {
      const p = path.resolve(String(filePath));
      const st = await fsp.stat(p);
      if (!st.isFile()) return { ok: false, error: tr('error.notAFile') };
      if (st.size > MAX_FILE_SIZE) return { ok: false, error: tr('error.tooLarge') };
      const { text, encoding } = decode(await fsp.readFile(p));
      return { ok: true, path: p, text, encoding, mtimeMs: st.mtimeMs };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('file:write', async (_event, filePath, text, encoding) => {
    try {
      const p = path.resolve(String(filePath));
      await fsp.writeFile(p, encode(String(text), encoding));
      const st = await fsp.stat(p);
      return { ok: true, path: p, mtimeMs: st.mtimeMs };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('file:watch', (_event, p) => watchFile(String(p)));
  ipcMain.handle('file:unwatch', (_event, p) => unwatchFile(String(p)));
  ipcMain.handle('fs:is-directory', (_event, p) => {
    try {
      return fs.statSync(path.resolve(String(p))).isDirectory();
    } catch {
      return false;
    }
  });

  // --- Panneau Dossiers ---

  ipcMain.handle('folders:pick', async (event) => {
    const result = await dialog.showOpenDialog(winOf(event), {
      title: tr('dialog.openFolderTitle'),
      properties: ['openDirectory', 'multiSelections', 'createDirectory'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('folders:list', async (_event, dir) => {
    try {
      return { ok: true, ...(await listFolder(dir)) };
    } catch (err) {
      return failure(err);
    }
  });

  ipcMain.handle('folders:watch', (_event, roots) => watchFolders(roots));

  ipcMain.handle('folders:create-file', async (_event, dir, name) => {
    const invalid = checkName(name);
    if (invalid) return { ok: false, error: invalid };
    const p = path.join(path.resolve(String(dir)), String(name));
    try {
      await fsp.writeFile(p, '', { flag: 'wx' });
      return { ok: true, path: p };
    } catch (err) {
      return failure(err);
    }
  });

  ipcMain.handle('folders:create-folder', async (_event, dir, name) => {
    const invalid = checkName(name);
    if (invalid) return { ok: false, error: invalid };
    const p = path.join(path.resolve(String(dir)), String(name));
    try {
      await fsp.mkdir(p);
      return { ok: true, path: p };
    } catch (err) {
      return failure(err);
    }
  });

  ipcMain.handle('folders:rename', async (_event, from, name) => {
    const invalid = checkName(name);
    if (invalid) return { ok: false, error: invalid };
    const src = path.resolve(String(from));
    const dst = path.join(path.dirname(src), String(name));
    if (dst === src) return { ok: true, path: src };
    // Allow a case-only rename only when both names refer to the very same file.
    if (fs.existsSync(dst)) {
      const sourceStat = await fsp.stat(src);
      const destinationStat = await fsp.stat(dst);
      if (sourceStat.dev !== destinationStat.dev || sourceStat.ino !== destinationStat.ino) {
        return { ok: false, code: 'EEXIST', error: tr('error.exists') };
      }
    }
    moveWatches(src, dst);
    pauseFolderWatchers(src);
    try {
      await fsp.rename(src, dst);
      return { ok: true, path: dst };
    } catch (err) {
      moveWatches(dst, src);
      watchFolders(watchedRoots);
      return failure(err);
    }
  });

  ipcMain.handle('folders:move', async (_event, from, toDir) => {
    const src = path.resolve(String(from));
    const dst = path.join(path.resolve(String(toDir)), path.basename(src));
    if (isInside(path.resolve(String(toDir)), src)) return { ok: false, error: tr('error.intoItself') };
    if (fs.existsSync(dst)) return { ok: false, code: 'EEXIST', error: tr('error.exists') };
    moveWatches(src, dst);
    pauseFolderWatchers(src);
    const undo = (err) => {
      moveWatches(dst, src);
      watchFolders(watchedRoots);
      return failure(err);
    };
    try {
      await fsp.rename(src, dst);
      return { ok: true, path: dst };
    } catch (err) {
      if (err.code !== 'EXDEV') return undo(err);
      // Autre disque : copie puis suppression de l'original.
      try {
        await fsp.cp(src, dst, { recursive: true, errorOnExist: true, force: false });
        await fsp.rm(src, { recursive: true, force: true });
        return { ok: true, path: dst };
      } catch (copyErr) {
        return undo(copyErr);
      }
    }
  });

  ipcMain.handle('folders:trash', async (_event, p) => {
    try {
      await shell.trashItem(path.resolve(String(p)));
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  });

  ipcMain.handle('shell:open-external', (_event, url) => {
    if (typeof url === 'string' && /^(https?:|mailto:|tel:|ms-settings:)/i.test(url)) return shell.openExternal(url);
    return undefined;
  });

  ipcMain.handle('shell:open-path', async (_event, p) => {
    const target = path.resolve(String(p));
    let st;
    try {
      st = fs.statSync(target);
    } catch {
      return { ok: false, error: tr('error.notFound') };
    }
    if (st.isDirectory() || SAFE_TO_OPEN.test(target)) {
      const error = await shell.openPath(target);
      return error ? { ok: false, error } : { ok: true };
    }
    // Par prudence, les autres types (exécutables…) sont seulement montrés dans l'Explorateur.
    shell.showItemInFolder(target);
    return { ok: true, revealed: true };
  });

  ipcMain.handle('shell:show-in-folder', (_event, p) => shell.showItemInFolder(path.resolve(String(p))));
  ipcMain.handle('shell:default-apps', () => {
    if (process.platform !== 'win32') return false;
    // Page « Applications par défaut » de Folio si l'application y est inscrite, sinon la page générale.
    const status = integration.status();
    const url = status.registered && !status.managedByStore
      ? `ms-settings:defaultapps?registeredAppUser=${integration.APP_NAME}`
      : 'ms-settings:defaultapps';
    return shell.openExternal(url);
  });

  ipcMain.handle('integration:status', () => integration.status());
  ipcMain.handle('integration:set', async (_event, enabled) => {
    try {
      if (enabled) await integration.register({ appId: APP_ID, appRoot: ROOT, strings: integrationStrings() });
      else await integration.unregister();
      return { ok: true, ...integration.status() };
    } catch (err) {
      return { ok: false, error: err.message, ...integration.status() };
    }
  });

  ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text)));

  ipcMain.handle('recent:get', () =>
    settings.recent.map((r) => ({ ...r, exists: fs.existsSync(r.path) })));
  ipcMain.handle('recent:add', (_event, p) => addRecent(String(p)));
  // Retire un fichier, ou tout ce que contient un dossier (mis à la corbeille depuis Folio).
  ipcMain.handle('recent:remove', (_event, p) => {
    const target = path.resolve(String(p));
    settings.recent = settings.recent.filter((r) => !isInside(r.path, target));
    saveSettingsSoon();
  });
  ipcMain.handle('recent:relocate', (_event, from, to) => {
    const src = path.resolve(String(from));
    let changed = false;
    settings.recent = settings.recent.map((r) => {
      if (!isInside(r.path, src)) return r;
      changed = true;
      const rel = path.relative(src, r.path);
      return { ...r, path: rel ? path.join(String(to), rel) : String(to) };
    });
    if (changed) saveSettingsSoon();
  });
  ipcMain.handle('recent:clear', () => {
    settings.recent = [];
    saveSettingsSoon();
    if (!snap) app.clearRecentDocuments();
  });

  ipcMain.handle('dialog:unsaved', async (event, name) => {
    const { response } = await dialog.showMessageBox(winOf(event), {
      type: 'warning',
      title: 'Folio',
      message: tr('dialog.unsavedMessage', { name }),
      detail: tr('dialog.unsavedDetail'),
      buttons: [tr('dialog.save'), tr('dialog.dontSave'), tr('common.cancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return ['save', 'discard', 'cancel'][response];
  });

  ipcMain.handle('doc:print', (event) =>
    new Promise((resolve) => {
      event.sender.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason }));
    }));

  ipcMain.handle('doc:export-pdf', async (event, suggested) => {
    const result = await dialog.showSaveDialog(winOf(event), {
      title: tr('dialog.exportPdfTitle'),
      defaultPath: suggested || 'Document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const options = {
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.75, bottom: 0.75, left: 0.8, right: 0.8 },
    };
    try {
      let data;
      try {
        data = await event.sender.printToPDF({ ...options, generateDocumentOutline: true });
      } catch {
        data = await event.sender.printToPDF(options);
      }
      await fsp.writeFile(result.filePath, data);
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  ipcMain.handle('win:fullscreen', (event) => {
    const win = winOf(event);
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle('win:devtools', (event) => event.sender.toggleDevTools());
}

/** Textes inscrits dans Windows (type de fichier, description de l'application). */
function integrationStrings() {
  return { typeName: tr('windows.typeName'), description: tr('windows.appDescription') };
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

// A packaged Store app must retain the AppUserModelID assigned by Windows.
if (process.platform === 'win32' && !process.windowsStore) app.setAppUserModelId(APP_ID);

// Finder delivers documents through this event, including before app.whenReady().
app.on('open-file', (event, file) => {
  event.preventDefault();
  if (app.isReady() && !mainWindow) createWindow();
  openFiles([file]);
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

const gotLock = snap || integrationCommand ? true : app.requestSingleInstanceLock();

if (integrationCommand) {
  app.whenReady().then(async () => {
    try {
      applyLanguage();
      if (integrationCommand === 'register') {
        const shortcuts = !process.argv.includes('--no-shortcuts');
        await integration.register({ appId: APP_ID, appRoot: ROOT, shortcuts, strings: integrationStrings() });
      } else await integration.unregister();
      console.log(`Folio : ${integrationCommand === 'register' ? 'intégration à Windows effectuée' : 'intégration retirée'}.`);
      app.exit(0);
    } catch (err) {
      console.error(`Folio : échec (${err.message})`);
      app.exit(1);
    }
  });
} else if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const files = filesFromArgv(argv, workingDirectory);
    if (!mainWindow) createWindow();
    else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    openFiles(files);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' },
    ]) : null);
    nativeTheme.themeSource = snap ? themeSource(snap.theme) : themeSource(settings.theme);
    nativeTheme.on('updated', applyWindowColors);
    applyLanguage();

    registerIpc();
    pendingFiles.push(...filesFromArgv(process.argv, process.cwd()));
    createWindow();
  });

  app.on('window-all-closed', () => {
    saveSettingsNow();
    if (process.platform !== 'darwin' || quitting || snap) app.quit();
  });

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });

  app.on('before-quit', (event) => {
    if (!snap && mainWindow && rendererReady && !allowClose) {
      event.preventDefault();
      quitting = true;
      mainWindow.close();
    } else saveSettingsNow();
  });
}
