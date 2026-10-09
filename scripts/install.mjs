// Installe Folio pour l'utilisateur courant (sans droits administrateur) dans
// %LOCALAPPDATA%\Programs\Folio, puis l'intègre à Windows (raccourcis, fichiers .md).
//
//   npm run install-app     → installe ou met à jour
//   npm run uninstall-app   → désinstalle
//
// Pourquoi des « liens physiques » ? Le Contrôle intelligent des applications de Windows 11
// bloque les exécutables non signés qu'il ne connaît pas, y compris une simple copie
// d'Electron. Un lien physique est un second nom pour le même fichier sur le disque : il
// conserve l'autorisation déjà accordée à l'exécutable d'Electron installé par npm.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Folio');
const exe = path.join(target, 'Folio.exe');
const runtime = path.join(root, 'node_modules', 'electron', 'dist');
const uninstall = process.argv.includes('--uninstall');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function isFolioInstall(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'resources', 'app', 'package.json'), 'utf8'));
    return pkg.name === 'folio-markdown';
  } catch {
    return false;
  }
}

function ensureClosed() {
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Folio.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout || '';
  if (out.toLowerCase().includes('"folio.exe"')) fail('Folio est ouvert : fermez-le, puis relancez la commande.');
}

function removeInstall() {
  if (!fs.existsSync(target)) return;
  if (!isFolioInstall(target)) fail(`Le dossier ${target} existe mais ne contient pas Folio : rien n’a été supprimé.`);
  fs.rmSync(target, { recursive: true, force: true });
}

// Folio s'appelait Plume : supprime l'ancienne installation (l'inscription et les raccourcis
// sont retirés par --register, et les paramètres repris au premier lancement).
function removeLegacyPlume() {
  const legacy = path.join(process.env.LOCALAPPDATA, 'Programs', 'Plume');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(legacy, 'resources', 'app', 'package.json'), 'utf8'));
    if (pkg.name !== 'plume-markdown') return;
  } catch {
    return;
  }
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Plume.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout || '';
  if (out.toLowerCase().includes('"plume.exe"')) fail('Plume est ouvert : fermez-le, puis relancez la commande.');
  fs.rmSync(legacy, { recursive: true, force: true });
  console.log(`  ancienne installation de Plume supprimée (${legacy})`);
}

function linkRuntime(src, dst, state) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'default_app.asar') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name === 'electron.exe' ? 'Folio.exe' : entry.name);
    if (entry.isDirectory()) {
      linkRuntime(from, to, state);
      continue;
    }
    try {
      fs.linkSync(from, to);
      state.linked += 1;
    } catch {
      fs.copyFileSync(from, to);
      state.copied += 1;
    }
  }
}

function copyApp(dst) {
  for (const dir of ['src/main', 'src/shared', 'dist/renderer']) {
    fs.cpSync(path.join(root, dir), path.join(dst, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(dst, 'build'), { recursive: true });
  for (const icon of ['icon.ico', 'file-icon.ico']) {
    fs.copyFileSync(path.join(root, 'build', icon), path.join(dst, 'build', icon));
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const runtimePkg = {
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    main: pkg.main,
  };
  fs.writeFileSync(path.join(dst, 'package.json'), `${JSON.stringify(runtimePkg, null, 2)}\n`);
}

function runFolio(flag) {
  const res = spawnSync(exe, [flag], { encoding: 'utf8', timeout: 60_000 });
  const output = `${res.stdout || ''}${res.stderr || ''}`.split('\n').filter((l) => l.trim() && !/gpu/i.test(l)).join('\n');
  return { ok: res.status === 0 && !res.error, output, error: res.error };
}

if (process.platform !== 'win32') fail('Cette installation est prévue pour Windows.');
if (!process.env.LOCALAPPDATA) fail('Variable LOCALAPPDATA introuvable.');

ensureClosed();

if (uninstall) {
  if (fs.existsSync(exe)) {
    const res = runFolio('--unregister');
    if (!res.ok) console.warn(`Retrait de l’intégration incomplet : ${res.output || res.error}`);
  }
  removeInstall();
  console.log('\n✔ Folio a été désinstallé.\n');
  process.exit(0);
}

if (!fs.existsSync(path.join(root, 'dist', 'renderer', 'index.html'))) fail('Interface non compilée : lancez « npm run build ».');
if (!fs.existsSync(path.join(runtime, 'electron.exe'))) fail('Electron introuvable : lancez « npm install ».');

console.log(`Installation de Folio dans ${target}…`);
removeInstall();
removeLegacyPlume();
const state = { linked: 0, copied: 0 };
linkRuntime(runtime, target, state);
copyApp(path.join(target, 'resources', 'app'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(target, 'resources', 'LICENSE.folio.txt'));
fs.copyFileSync(path.join(root, 'dist', 'THIRD-PARTY-NOTICES.txt'), path.join(target, 'resources', 'THIRD-PARTY-NOTICES.txt'));
console.log(`  moteur : ${state.linked} fichiers liés${state.copied ? `, ${state.copied} copiés` : ''}`);
if (state.copied) {
  console.warn('  ⚠ Certains fichiers ont dû être copiés (disque différent) : Windows pourrait bloquer Folio.');
}

const res = runFolio('--register');
if (!res.ok) fail(`Folio est installé mais l’intégration à Windows a échoué :\n${res.output || res.error}`);

console.log(`
✔ Folio est installé.
  • Menu Démarrer et bureau : « Folio »
  • Fichiers .md : clic droit › Ouvrir avec › Folio (cochez « Toujours » pour en faire l’application par défaut)
`);
