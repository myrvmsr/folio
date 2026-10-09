// Rassemble les licences des bibliothèques intégrées à l'interface dans un seul fichier,
// livré avec Folio (leurs licences demandent d'accompagner toute copie de ces mentions).
// Les paquets sont déduits du « metafile » d'esbuild ; Mermaid, copié tel quel, embarque
// ses propres dépendances, ajoutées elles aussi.
import fs from 'node:fs';
import path from 'node:path';

const LICENSE_FILE = /^(licen[cs]e|copying|ofl)([.-].*)?$/i;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** node_modules/a/node_modules/@b/c/lib/x.js → node_modules/a/node_modules/@b/c */
function packageDirOf(file) {
  const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/.exec(file.replace(/\\/g, '/'));
  return m ? m[1] : null;
}

function resolvePackage(name, fromDir, root) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.resolve(dir) === path.resolve(root) || path.dirname(dir) === dir) return null;
  }
}

function addWithDependencies(dir, root, found) {
  if (found.has(dir)) return;
  found.add(dir);
  const pkg = readJson(path.join(dir, 'package.json')) || {};
  for (const dep of Object.keys(pkg.dependencies || {})) {
    const depDir = resolvePackage(dep, dir, root);
    if (depDir) addWithDependencies(depDir, root, found);
  }
}

function licenseText(dir) {
  const file = fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile());
  return file ? fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

function repositoryUrl(pkg) {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return (pkg.homepage || repo || '').replace(/^git\+/, '').replace(/\.git$/, '');
}

export function writeThirdPartyNotices({ root, metafile, bundledPackages = [], outFile }) {
  const found = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const dir = packageDirOf(input);
    if (dir) found.add(path.join(root, dir));
  }
  for (const name of bundledPackages) addWithDependencies(path.join(root, 'node_modules', name), root, found);

  const entries = new Map();
  for (const dir of found) {
    const pkg = readJson(path.join(dir, 'package.json'));
    if (!pkg?.name) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (entries.has(key)) continue;
    const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || 'voir le projet';
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    entries.set(key, { name: pkg.name, version: pkg.version, license, author, url: repositoryUrl(pkg), text: licenseText(dir) });
  }

  const rule = '='.repeat(80);
  const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  const parts = [
    'Folio — logiciels libres utilisés',
    '',
    'Folio intègre les bibliothèques et polices ci-dessous ; leurs licences sont reproduites',
    'telles quelles. Electron et Chromium : voir LICENSE.electron.txt et LICENSES.chromium.html',
    'dans le dossier d’installation.',
    '',
    ...sorted.map((e) => `- ${e.name} ${e.version} (${e.license})`),
  ];
  for (const e of sorted) {
    parts.push('', rule, `${e.name} ${e.version} — ${e.license}`);
    if (e.url) parts.push(e.url);
    parts.push(rule, '', e.text || `Licence ${e.license}${e.author ? `, ${e.author}` : ''} (aucun fichier de licence fourni).`);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${parts.join('\n')}\n`);
  return sorted.length;
}
