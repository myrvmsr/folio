'use strict';

// Intégration à Windows sans droits administrateur (tout est dans HKEY_CURRENT_USER) :
// raccourcis menu Démarrer / bureau, « Ouvrir avec » pour les fichiers Markdown et
// inscription dans « Applications par défaut ». Tout est réversible avec unregister().

const { app, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const PROG_ID = 'Folio.Markdown';
const EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdwn'];
const APP_NAME = 'Folio';

function shortcutPaths() {
  return {
    startMenu: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${APP_NAME}.lnk`),
    desktop: path.join(app.getPath('desktop'), `${APP_NAME}.lnk`),
  };
}

/** L'intégration n'a de sens que pour l'application installée (Folio.exe), pas en développement. */
function canIntegrate() {
  return process.platform === 'win32' && !process.windowsStore && path.basename(process.execPath).toLowerCase() !== 'electron.exe';
}

const regString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function buildRegFile(lines) {
  // Fichier .reg en UTF-16 LE avec BOM : gère les accents dans les chemins.
  const text = ['Windows Registry Editor Version 5.00', '', ...lines, ''].join('\r\n');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
}

function registrationLines({ exe, icon, fileIcon, appId, strings }) {
  const command = `"${exe}" "%1"`;
  const lines = [];
  const key = (name, values) => {
    lines.push(`[HKEY_CURRENT_USER\\${name}]`);
    for (const [valueName, data] of values) lines.push(`${valueName === '@' ? '@' : regString(valueName)}=${data}`);
    lines.push('');
  };
  key(`Software\\Classes\\${PROG_ID}`, [
    ['@', regString(strings.typeName)],
    ['FriendlyTypeName', regString(strings.typeName)],
  ]);
  key(`Software\\Classes\\${PROG_ID}\\DefaultIcon`, [['@', regString(fileIcon)]]);
  key(`Software\\Classes\\${PROG_ID}\\shell\\open\\command`, [['@', regString(command)]]);
  // Nom et icône de Folio dans « Ouvrir avec ». Sans cette clé, Windows reprend ceux de
  // l'exécutable, qui sont ceux d'Electron quand Folio est installé par liens physiques.
  key(`Software\\Classes\\${PROG_ID}\\Application`, [
    ['ApplicationName', regString(APP_NAME)],
    ['ApplicationIcon', regString(`${icon},0`)],
    ['ApplicationCompany', regString(APP_NAME)],
    ['ApplicationDescription', regString(strings.description)],
    ['AppUserModelID', regString(appId)],
  ]);
  for (const ext of EXTENSIONS) key(`Software\\Classes\\${ext}\\OpenWithProgids`, [[PROG_ID, 'hex(0):']]);
  key(`Software\\Classes\\Applications\\${APP_NAME}.exe`, [['FriendlyAppName', regString(APP_NAME)]]);
  key(`Software\\Classes\\Applications\\${APP_NAME}.exe\\DefaultIcon`, [['@', regString(icon)]]);
  key(`Software\\Classes\\Applications\\${APP_NAME}.exe\\shell\\open\\command`, [['@', regString(command)]]);
  key(`Software\\Classes\\Applications\\${APP_NAME}.exe\\SupportedTypes`, EXTENSIONS.map((ext) => [ext, regString('')]));
  key(`Software\\${APP_NAME}\\Capabilities`, [
    ['ApplicationName', regString(APP_NAME)],
    ['ApplicationDescription', regString(strings.description)],
    ['ApplicationIcon', regString(`${icon},0`)],
  ]);
  key(`Software\\${APP_NAME}\\Capabilities\\FileAssociations`, EXTENSIONS.map((ext) => [ext, regString(PROG_ID)]));
  key('Software\\RegisteredApplications', [[APP_NAME, regString(`Software\\${APP_NAME}\\Capabilities`)]]);
  return lines;
}

function removalLines(progId = PROG_ID, appName = APP_NAME) {
  const lines = [
    `[-HKEY_CURRENT_USER\\Software\\Classes\\${progId}]`,
    `[-HKEY_CURRENT_USER\\Software\\Classes\\Applications\\${appName}.exe]`,
    `[-HKEY_CURRENT_USER\\Software\\${appName}]`,
    '',
    '[HKEY_CURRENT_USER\\Software\\RegisteredApplications]',
    `${regString(appName)}=-`,
    '',
  ];
  for (const ext of EXTENSIONS) {
    lines.push(`[HKEY_CURRENT_USER\\Software\\Classes\\${ext}\\OpenWithProgids]`, `${regString(progId)}=-`, '');
  }
  return lines;
}

// Folio s'appelait Plume : retire l'inscription et les raccourcis laissés par l'ancien nom.
const LEGACY = { progId: 'Plume.Markdown', appName: 'Plume' };

function removeLegacyShortcuts() {
  const dirs = [path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), app.getPath('desktop')];
  for (const dir of dirs) {
    const link = path.join(dir, `${LEGACY.appName}.lnk`);
    try {
      if (fs.existsSync(link) && path.basename(shell.readShortcutLink(link).target).toLowerCase() === 'plume.exe') fs.rmSync(link);
    } catch {
      /* raccourci illisible : on le laisse */
    }
  }
}

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => resolve({ ok: !error, error, stdout, stderr }));
  });
}

async function importReg(lines) {
  const file = path.join(os.tmpdir(), `folio-${process.pid}-${Date.now()}.reg`);
  fs.writeFileSync(file, buildRegFile(lines));
  try {
    const res = await run('reg.exe', ['import', file]);
    if (!res.ok) throw new Error((res.stderr || res.stdout || String(res.error)).trim());
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function refreshShell() {
  // Rafraîchit les icônes de l'Explorateur (sans effet si l'outil est absent).
  await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe'), ['-show']);
}

// shortcuts: false quand l'installateur classique (NSIS) crée lui-même les raccourcis.
// strings : textes inscrits dans Windows, dans la langue de Folio.
const DEFAULT_STRINGS = { typeName: 'Document Markdown', description: 'Lecteur et éditeur Markdown' };

async function register({ appId, appRoot, shortcuts = true, desktopShortcut = true, strings = DEFAULT_STRINGS }) {
  // MSIX declares its associations in the manifest; Windows owns their lifecycle.
  if (process.windowsStore) return;
  if (!canIntegrate()) throw new Error('disponible uniquement dans la version installée de Folio');
  const exe = process.execPath;
  const icon = path.join(appRoot, 'build', 'icon.ico');
  const fileIcon = path.join(appRoot, 'build', 'file-icon.ico');
  const texts = { ...DEFAULT_STRINGS, ...strings };

  await importReg([...removalLines(LEGACY.progId, LEGACY.appName), ...registrationLines({ exe, icon, fileIcon, appId, strings: texts })]);
  removeLegacyShortcuts();

  if (shortcuts) {
    const shortcut = {
      target: exe,
      description: texts.description,
      icon,
      iconIndex: 0,
      appUserModelId: appId,
    };
    const { startMenu, desktop } = shortcutPaths();
    fs.mkdirSync(path.dirname(startMenu), { recursive: true });
    shell.writeShortcutLink(startMenu, 'create', shortcut);
    if (desktopShortcut) shell.writeShortcutLink(desktop, 'create', shortcut);
  }

  await refreshShell();
}

async function unregister() {
  if (!canIntegrate()) return;
  await importReg(removalLines());
  const { startMenu, desktop } = shortcutPaths();
  for (const link of [startMenu, desktop]) {
    try {
      if (fs.existsSync(link) && samePath(shell.readShortcutLink(link).target, process.execPath)) fs.rmSync(link);
    } catch {
      /* raccourci illisible : on le laisse */
    }
  }
  await refreshShell();
}

function samePath(a, b) {
  return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
}

function status() {
  if (process.platform === 'win32' && process.windowsStore) return { available: false, registered: true, managedByStore: true };
  if (!canIntegrate()) return { available: false, registered: false };
  const { startMenu } = shortcutPaths();
  let registered = false;
  try {
    registered = fs.existsSync(startMenu) && samePath(shell.readShortcutLink(startMenu).target, process.execPath);
  } catch {
    registered = false;
  }
  return { available: true, registered };
}

module.exports = { register, unregister, status, canIntegrate, APP_NAME };
