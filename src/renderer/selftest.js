// Scénarios de test, utilisés seulement par les captures d'écran (--snap-selftest=…).
// Ils manipulent l'interface comme un utilisateur et écrivent le résultat de chaque
// étape dans la console (visible dans le terminal qui a lancé la capture).
import { state, els, api, updateSettings } from './context.js';
import { roots } from './files.js';
import { openPath, setMode, closeDoc } from './documents.js';
import { basename, dirname, joinPath, samePath } from './util.js';
import { platform, isMac } from './platform.js';
import { effectiveBindings } from './shortcuts.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.warn('SELFTEST', ...args);
let results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok: Boolean(ok), detail });
  log(ok ? 'OK  ' : 'ÉCHEC', label, detail);
};

const rowFor = (path) => [...els.filesTree.querySelectorAll('.ft-row[data-path]')].find((r) => samePath(r.dataset.path, path));

// Hold only the autosave timer created by this synchronous editor change.
// Other timers and all filesystem operations stay real. Restoring the globals
// before any await keeps slow IPC or a busy runner from changing the test time.
function captureAutoSaveEdit(doc, edit) {
  const schedule = globalThis.setTimeout;
  const cancel = globalThis.clearTimeout;
  const timers = new Map();
  const cancelled = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    const id = schedule(callback, delay, ...args);
    timers.set(id, { id, delay, run: () => callback(...args) });
    return id;
  };
  globalThis.clearTimeout = (id) => { cancelled.push(id); cancel(id); };
  try {
    edit();
  } finally {
    globalThis.setTimeout = schedule;
    globalThis.clearTimeout = cancel;
  }
  const timer = timers.get(doc.autoSaveTimer);
  if (timer) cancel(timer.id);
  return { timer, cancelled };
}

async function typeInInput(text) {
  const input = els.filesTree.querySelector('.ft-input');
  if (!input) return false;
  input.value = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await wait(900);
  return true;
}

function pressOn(el, key) {
  el.focus();
  el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
}

/** Panneau Dossiers : création, renommage, déplacement, corbeille. */
async function files() {
  const root = roots()[0];
  if (!root) return log('ÉCHEC aucun dossier (--snap-folders=…)');
  await wait(300);

  // 1. Nouveau document via le bouton de la racine, nommé « Essai ».
  rowFor(root)?.querySelector('.ft-action[data-act="file"]')?.click();
  await wait(200);
  check('champ de création affiché', Boolean(els.filesTree.querySelector('.ft-input')));
  await typeInInput('Essai');
  const created = joinPath(root, 'Essai.md');
  check('document créé et ouvert', samePath(state.active?.path, created), state.active?.path);
  check('ouvert en mode édition', state.active?.mode !== 'preview', state.active?.mode);
  check('ligne active dans l’arbre', rowFor(created)?.classList.contains('active'));

  // 2. Nom invalide refusé.
  rowFor(root)?.querySelector('.ft-action[data-act="folder"]')?.click();
  await wait(200);
  await typeInInput('mauvais/nom');
  check('nom invalide refusé (champ toujours là)', Boolean(els.filesTree.querySelector('.ft-input')));
  await typeInInput('Rangement');
  const folder = joinPath(root, 'Rangement');
  check('dossier créé', Boolean(rowFor(folder)));

  // 3. Renommage avec F2 (l'onglet ouvert suit).
  pressOn(rowFor(created), 'F2');
  await wait(200);
  await typeInInput('Essai renommé');
  const renamed = joinPath(root, 'Essai renommé.md');
  check('renommé, extension conservée', Boolean(rowFor(renamed)));
  check('l’onglet suit le renommage', samePath(state.active?.path, renamed), state.active?.path);

  // 4. Déplacement par glisser-déposer dans « Rangement ».
  const dt = new DataTransfer();
  rowFor(renamed).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const target = rowFor(folder);
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  await wait(900);
  const moved = joinPath(folder, 'Essai renommé.md');
  check('déplacé dans le dossier', samePath(state.active?.path, moved), state.active?.path);
  check('visible dans le dossier déplié', Boolean(rowFor(moved)));

  // 5. Enregistrement automatique après une modification.
  const doc = state.active;
  check('éditeur disponible pour tester l’enregistrement', Boolean(doc?.editor));
  if (doc?.editor) {
    doc.editor.view.dispatch({ changes: { from: 0, insert: '# Écrit par le test\n' } });
    await wait(1800);
    const disk = await api.readFile(moved);
    check('enregistré automatiquement', disk.ok && disk.text.startsWith('# Écrit par le test'), JSON.stringify(disk.text?.slice(0, 30)));
    check('onglet sans modification en attente', doc.content === doc.saved);
  }

  // 6. Corbeille (Suppr puis confirmation) : l'onglet se ferme.
  pressOn(rowFor(moved), 'Delete');
  await wait(300);
  document.querySelector('.modal .btn-danger')?.click();
  await wait(1200);
  const listing = await api.folders.list(folder);
  check('fichier mis à la corbeille', listing.ok && !listing.entries.some((e) => e.name === basename(moved)));
  check('onglet fermé', !state.docs.some((d) => samePath(d.path, moved)));

  // 7. Changement fait par un autre programme : le panneau se met à jour tout seul.
  const external = joinPath(root, 'Externe.md');
  await api.folders.createFile(root, 'Externe.md');
  await wait(1000);
  check('fichier créé ailleurs : apparaît', Boolean(rowFor(external)));
  await api.folders.trash(external);
  await api.folders.trash(folder);
  await wait(1000);
  check('fichier supprimé ailleurs : disparaît', !rowFor(external) && !rowFor(folder));
  log('fin', dirname(moved));
}

/** Enregistrement automatique : après modification, à la fermeture, en changeant d'onglet, désactivé. */
async function autosave() {
  const root = roots()[0];
  if (!root) return log('ÉCHEC aucun dossier (--snap-folders=…)');
  const fileA = joinPath(root, 'Autosave A.md');
  const fileB = joinPath(root, 'Autosave B.md');
  await api.folders.createFile(root, 'Autosave A.md');
  await api.folders.createFile(root, 'Autosave B.md');
  const disk = async (p) => (await api.readFile(p)).text;
  const type = (doc, text) => doc.editor.view.dispatch({ changes: { from: doc.editor.view.state.doc.length, insert: text } });

  const a = await openPath(fileA);
  await setMode(a, 'split');
  await wait(400);

  // 1. Control the edit timers while keeping the actual editor and disk writes.
  // A real 400 ms sleep can resume after the 1000 ms save on a busy CI machine.
  const firstEdit = captureAutoSaveEdit(a, () => type(a, 'u'));
  check('délai de sauvegarde : une seconde', firstEdit.timer?.delay === 1000);
  const lastEdit = captureAutoSaveEdit(a, () => type(a, 'n'));
  check('nouvelle frappe : délai relancé', Boolean(firstEdit.timer && lastEdit.timer &&
    lastEdit.cancelled.includes(firstEdit.timer.id) && lastEdit.timer.delay === 1000));
  check('pas encore enregistré pendant la frappe', (await disk(fileA)) === '');
  if (lastEdit.timer) await lastEdit.timer.run();
  check('enregistré après la pause', (await disk(fileA)) === 'un');

  // 2. Fermeture d'un onglet modifié : enregistré sans question.
  type(a, ' deux');
  const closed = await closeDoc(a);
  check('onglet fermé sans question', closed && !state.docs.includes(a));
  check('enregistré à la fermeture', (await disk(fileA)) === 'un deux');

  // 3. Mode « en changeant d'onglet ».
  updateSettings({ autoSave: 'focusChange' });
  const b = await openPath(fileB);
  await setMode(b, 'split');
  await wait(400);
  type(b, 'trois');
  await wait(1500);
  check('focusChange : rien tant qu’on reste', (await disk(fileB)) === '');
  await openPath(fileA);
  await wait(500);
  check('focusChange : enregistré en changeant d’onglet', (await disk(fileB)) === 'trois');

  // 4. Désactivé : rien n'est écrit.
  updateSettings({ autoSave: 'off' });
  const a2 = state.active;
  await setMode(a2, 'split');
  await wait(400);
  type(a2, ' quatre');
  await wait(1600);
  check('désactivé : rien n’est écrit', (await disk(fileA)) === 'un deux');
  a2.editor.setValue(a2.saved);
  await wait(300);

  updateSettings({ autoSave: 'afterEdit' });
  for (const doc of [...state.docs]) await closeDoc(doc, { force: true });
  await api.folders.trash(fileA);
  await api.folders.trash(fileB);
  log('fin');
}

/** Renommage d'un dossier racine (surveillé), puis surveillance du nouveau dossier. */
async function rootRename() {
  const root = roots()[0];
  if (!root) return log('ÉCHEC aucun dossier (--snap-folders=…)');
  await wait(300);
  pressOn(rowFor(root), 'F2');
  await wait(200);
  await typeInInput(`${basename(root)} 2`);
  const renamed = joinPath(dirname(root), `${basename(root)} 2`);
  check('racine renommée dans la liste', samePath(roots()[0], renamed), roots()[0]);
  check('ligne de la racine à jour', Boolean(rowFor(renamed)));
  await api.folders.createFile(renamed, 'Après.md');
  await wait(1000);
  check('nouvelle racine surveillée', Boolean(rowFor(joinPath(renamed, 'Après.md'))));
  await api.folders.trash(joinPath(renamed, 'Après.md'));
  pressOn(rowFor(renamed), 'F2');
  await wait(200);
  await typeInInput(basename(root));
  check('racine renommée à nouveau', samePath(roots()[0], root), roots()[0]);
  log('fin');
}

async function compatibility() {
  const root = roots()[0];
  if (!root) throw new Error('Missing test folder');
  check('platform exposed by preload', api.platform === state.info.platform, platform);
  check('native path separator', joinPath(root, 'Note.md').includes(platform === 'win32' ? '\\' : '/'));
  check('save shortcut uses the native modifier', effectiveBindings({}).save[0] === (isMac ? 'Meta+S' : 'Ctrl+S'));
  const article = state.active?.view.article;
  check('Markdown title rendered', Boolean(article?.querySelector('h1')));
  check('code block rendered', Boolean(article?.querySelector('pre code')));
  check('math rendered', Boolean(article?.querySelector('.katex')));
  check('diagram rendered', Boolean(article?.querySelector('.mermaid-svg svg')));
  const specialName = 'Été #100%.md';
  const created = await api.folders.createFile(root, specialName);
  check('Unicode and special characters in filenames', created.ok, created.error || '');
  if (created.ok) {
    await api.writeFile(created.path, '# Test de chemin\n', 'utf8');
    const opened = await openPath(created.path);
    check('special filename opens with its content', opened?.content === '# Test de chemin\n');
    await closeDoc(opened, { force: true });
    await api.folders.trash(created.path);
  }
  const upper = await api.folders.createFile(root, 'Case.md');
  const lower = await api.folders.createFile(root, 'case.md');
  if (platform === 'linux' || lower.ok) {
    check('distinct case-sensitive files', upper.ok && lower.ok);
    await api.writeFile(upper.path, 'UPPER', 'utf8');
    await api.writeFile(lower.path, 'lower', 'utf8');
    const upperDoc = await openPath(upper.path);
    const lowerDoc = await openPath(lower.path);
    check('case-sensitive files get separate tabs', upperDoc !== lowerDoc && upperDoc?.content === 'UPPER' && lowerDoc?.content === 'lower');
    const rename = await api.folders.rename(upper.path, 'case.md');
    check('rename refuses to overwrite another case-sensitive file', !rename.ok && rename.code === 'EEXIST');
    check('destination content preserved', (await api.readFile(lower.path)).text === 'lower');
    await closeDoc(upperDoc, { force: true });
    await closeDoc(lowerDoc, { force: true });
    await api.folders.trash(lower.path);
  } else check('case-insensitive filesystem rejects duplicate filename', upper.ok && lower.code === 'EEXIST');
  if (upper.ok) await api.folders.trash(upper.path);
}

export async function runSelfTest(name) {
  results = [];
  try {
    if (name === 'files') await files();
    else if (name === 'autosave') await autosave();
    else if (name === 'rootrename') await rootRename();
    else if (name === 'compatibility') await compatibility();
    else throw new Error(`Unknown test scenario: ${name}`);
  } catch (err) {
    check('test scenario completed', false, String(err.stack || err));
    log('ÉCHEC exception', err && err.stack ? err.stack : String(err));
  }
  if (!results.length) check('scenario executed checks', false);
  return { checks: results, failures: results.filter((result) => !result.ok).map((result) => `${result.label}: ${result.detail}`) };
}
