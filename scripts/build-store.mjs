import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { previewIdentity, storeConfiguration, validateStoreIdentity } from './store-config.mjs';
import { verifyStorePackage } from './verify-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const preview = args.includes('--preview');
const identityArgument = args.find((argument) => argument.startsWith('--identity='));
for (const argument of args) {
  if (argument !== '--preview' && argument !== identityArgument) throw new Error(`Option inconnue : ${argument}`);
}
if (preview && identityArgument) throw new Error('Choisir --preview ou --identity, sans les combiner.');
if (process.platform !== 'win32') throw new Error('La construction MSIX doit être exécutée sous Windows.');
const identityFile = path.resolve(root, identityArgument?.slice('--identity='.length) || 'store/identity.local.json');
let identity;
if (preview) identity = previewIdentity;
else if (process.env.FOLIO_STORE_IDENTITY_JSON && !identityArgument) identity = JSON.parse(process.env.FOLIO_STORE_IDENTITY_JSON);
else {
  if (!fs.existsSync(identityFile)) throw new Error('Identité Store manquante. Créer store/identity.local.json avec les trois valeurs du Centre des partenaires (voir store/README.md). Pour valider la construction avant inscription : npm run dist:store:preview.');
  identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
}
identity = validateStoreIdentity(identity, { preview });
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const config = storeConfiguration(metadata, identity, { root, preview });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
function run(command, argumentsList) {
  const result = spawnSync(command, argumentsList, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Échec de ${path.basename(command)} (${result.status}).`);
}

run(process.execPath, ['scripts/build-renderer.mjs']);
run(require('electron'), ['scripts/build-store-assets.cjs']);
// Prefer the installed Microsoft SDK; the legacy bundled MakeAppx can be
// rejected by current Windows application control. No security setting is changed.
if (!process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH) {
  const sdkRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const sdkVersions = fs.existsSync(sdkRoot)
    ? fs.readdirSync(sdkRoot).filter((name) => /^10\.0\.\d+\.0$/.test(name)).sort((a, b) => Number(b.split('.')[2]) - Number(a.split('.')[2]))
    : [];
  const sdk = sdkVersions.map((version) => path.join(sdkRoot, version, 'x64'))
    .find((directory) => ['makeappx.exe', 'makepri.exe'].every((name) => fs.existsSync(path.join(directory, name))));
  if (sdk) { process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH = sdk; console.log(`SDK Microsoft : ${sdk}`); }
}
const { build, Platform, Arch } = require('electron-builder');
const artifacts = await build({ projectDir: root, targets: Platform.WINDOWS.createTarget(['appx'], Arch.x64), config, publish: 'never' });
const msix = artifacts.find((filename) => filename.endsWith('.msix'));
if (!msix) throw new Error('Aucun package MSIX produit.');
const report = await verifyStorePackage(msix, { identity, version: metadata.version, preview });
fs.writeFileSync(path.join(path.dirname(msix), 'package-info.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(preview ? 'MSIX de validation créé. Réserver Folio dans le Store puis reconstruire avec l’identité Microsoft avant de le soumettre.' : 'MSIX construit avec l’identité fournie. Tester l’installation et compléter la certification avant publication (voir store/README.md).');
