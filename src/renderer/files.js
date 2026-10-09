// Panneau « Dossiers » : un organisateur de fichiers volontairement simple.
//
// On y ajoute un ou plusieurs dossiers ; leurs sous-dossiers et leurs documents Markdown
// s'affichent en arbre. Un clic ouvre un document. Clic droit (ou les boutons au survol)
// pour créer un document ou un dossier, renommer, mettre à la corbeille. On range un
// fichier en le glissant sur un autre dossier. Le panneau se met à jour tout seul quand
// les fichiers changent sur le disque.
import { state, els, api, updateSettings, storeSettings, MARKDOWN_EXT } from './context.js';
import { clampFilesWidth } from './appearance.js';
import { toast, openMenu, confirmModal } from './ui.js';
import { icons } from './icons.js';
import { h, basename, dirname, samePath, normPath, isSameOrInside, relocatePath, debounce } from './util.js';
import { t, lang } from './i18n.js';
import { openPath, relocateDocs, closeDoc, isDirty, markMissing, setMode } from './documents.js';
import { copyText } from './navigation.js';
import { renderTabs } from './tabs.js';
import { platform } from './platform.js';

const MAX_ENTRIES = 2000;
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

const listings = new Map(); // normPath(dossier) → { entries, error, loading }
let expanded = new Set(); // normPath des dossiers dépliés
let editing = null; // { kind: 'rename' | 'file' | 'folder', path?, parent? }
let dragPath = null;
let dragHoverTimer = null;

// --- Réglages -----------------------------------------------------------------------------

export function roots() {
  const list = Array.isArray(state.settings.folders) ? state.settings.folders : [];
  return list.filter((p) => typeof p === 'string' && p);
}

const persistExpanded = debounce(() => {
  storeSettings({ filesExpanded: [...expanded].slice(0, 400).map((key) => originalPath(key)).filter(Boolean) });
}, 400);

// Les clés sont en minuscules : on retrouve le chemin tel qu'écrit à partir des listes chargées.
const knownPaths = new Map();
function remember(path) {
  knownPaths.set(normPath(path), path);
}
function originalPath(key) {
  return knownPaths.get(key) || null;
}

function setRoots(list) {
  storeSettings({ folders: list });
  api.folders.watch(list);
}

// --- Validation des noms ---------------------------------------------------------------------

export function nameError(name) {
  if (!name || name === '.' || name === '..') return t('files.errorEmpty');
  if ((platform === 'win32' ? INVALID_CHARS : /[/\u0000]/).test(name)) return t('files.errorChars');
  if (platform === 'win32' && /[. ]$/.test(name)) return t('files.errorTrailing');
  if (platform === 'win32' && RESERVED_NAMES.test(name)) return t('files.errorReserved', { name });
  if (name.length > 240) return t('files.errorLong');
  return null;
}

const extensionOf = (name) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i) : '';
};

// --- Lecture des dossiers ---------------------------------------------------------------------

const collator = () => new Intl.Collator(lang(), { numeric: true, sensitivity: 'base' });

function visibleEntries(entries) {
  const showAll = Boolean(state.settings.filesShowAll);
  const sort = collator();
  return entries
    .filter((e) => e.dir || showAll || MARKDOWN_EXT.test(e.name))
    .sort((a, b) => (a.dir === b.dir ? sort.compare(a.name, b.name) : a.dir ? -1 : 1));
}

async function loadDir(path) {
  const key = normPath(path);
  remember(path);
  const previous = listings.get(key);
  listings.set(key, { entries: previous?.entries || [], error: null, loading: true });
  const res = await api.folders.list(path);
  if (!res.ok) {
    const error = res.code === 'ENOENT' ? t('files.folderMissing') : res.error;
    listings.set(key, { entries: [], error, code: res.code, loading: false });
    return;
  }
  for (const entry of res.entries) if (entry.dir) remember(entry.path);
  listings.set(key, { entries: res.entries, error: null, loading: false });
}

/** Recharge les dossiers déjà lus (tous, ou seulement ceux d'une racine). */
async function reload(root = null) {
  await reloadKeys([...listings.keys()].filter((key) => !root || isSameOrInside(key, root)));
}

async function reloadKeys(keys) {
  await Promise.all(keys.map((key) => loadDir(originalPath(key) || key)));
  renderFiles();
}

/** Des éléments ont été créés, supprimés ou renommés sur le disque (paths : null = tout relire). */
function onDiskChange({ root, paths }) {
  if (!roots().some((r) => isSameOrInside(r, root) || isSameOrInside(root, r))) return;
  if (!paths) {
    reload(root);
    return;
  }
  const touched = new Set();
  for (const p of paths) {
    touched.add(normPath(dirname(p)));
    touched.add(normPath(p));
  }
  const keys = [...listings.keys()].filter((key) => touched.has(key));
  if (keys.length) reloadKeys(keys);
}

// --- Rendu ---------------------------------------------------------------------------------------

function nameNode(name, dir) {
  if (dir) return h('span', { class: 'ft-name' }, name);
  const ext = extensionOf(name);
  return h('span', { class: 'ft-name' }, ext ? name.slice(0, -ext.length) : name, ext ? h('span', { class: 'ft-ext' }, ext) : null);
}

// Le champ de saisie est recréé à chaque rendu (le panneau se redessine quand les fichiers
// changent) : renderFiles reporte le texte déjà tapé et la sélection.
function editInput(initial, selectEnd) {
  return h('input', {
    class: 'ft-input',
    type: 'text',
    value: initial,
    spellcheck: 'false',
    'aria-label': t('files.nameLabel'),
    dataset: { selectEnd: String(selectEnd) },
  });
}

function rowElement({ path, name, dir, depth, root = false }) {
  const key = normPath(path);
  const open = dir && expanded.has(key);
  const renaming = editing && editing.kind === 'rename' && samePath(editing.path, path);
  let label;
  if (renaming) {
    const ext = dir ? '' : extensionOf(name);
    const input = editInput(name, ext ? name.length - ext.length : name.length);
    bindEditInput(input, (value) => commitRename(path, name, dir, value));
    label = input;
  } else {
    label = nameNode(name, dir);
  }
  const actions = dir && !renaming
    ? h(
        'span',
        { class: 'ft-actions' },
        h('button', { type: 'button', class: 'ft-action', tabindex: '-1', title: t('files.newFile'), dataset: { act: 'file' }, html: icons.filePlus }),
        h('button', { type: 'button', class: 'ft-action', tabindex: '-1', title: t('files.newFolder'), dataset: { act: 'folder' }, html: icons.folderPlus }),
      )
    : null;
  const classes = ['ft-row', dir ? 'is-dir' : 'is-file'];
  if (root) classes.push('is-root');
  if (!dir && state.active && samePath(state.active.path, path)) classes.push('active');
  if (!dir && !MARKDOWN_EXT.test(name)) classes.push('is-other');
  return h(
    'div',
    {
      class: classes.join(' '),
      role: 'treeitem',
      tabindex: '-1',
      draggable: root || renaming ? 'false' : 'true',
      'aria-expanded': dir ? String(open) : null,
      'aria-level': String(depth + 1),
      title: path,
      style: { '--depth': String(depth) },
      dataset: { path, kind: dir ? 'dir' : 'file', root: root ? '1' : '' },
    },
    h('span', { class: `ft-chevron${open ? ' open' : ''}`, html: dir ? icons.chevronRight : '' }),
    h('span', { class: 'ft-icon', html: dir ? (open ? icons.folderOpen : icons.folder) : MARKDOWN_EXT.test(name) ? icons.fileText : icons.file }),
    label,
    actions,
  );
}

function infoRow(text, depth, extra = '') {
  return h('div', { class: `ft-info${extra ? ` ${extra}` : ''}`, style: { '--depth': String(depth) } }, text);
}

function newEntryRow(parent, kind, depth) {
  const listing = listings.get(normPath(parent));
  const taken = new Set((listing?.entries || []).map((e) => e.name.toLowerCase()));
  const base = kind === 'file' ? t('files.newFileName') : t('files.newFolderName');
  const suffix = kind === 'file' ? '.md' : '';
  let candidate = base;
  for (let n = 2; taken.has(`${candidate}${suffix}`.toLowerCase()); n += 1) candidate = `${base} ${n}`;
  const input = editInput(candidate, candidate.length);
  bindEditInput(input, (value) => commitCreate(parent, kind, value));
  return h(
    'div',
    { class: 'ft-row is-new', style: { '--depth': String(depth) } },
    h('span', { class: 'ft-chevron' }),
    h('span', { class: 'ft-icon', html: kind === 'file' ? icons.fileText : icons.folder }),
    input,
  );
}

function appendChildren(out, dirPath, depth) {
  const key = normPath(dirPath);
  const listing = listings.get(key);
  if (editing && editing.kind !== 'rename' && samePath(editing.parent, dirPath)) out.push(newEntryRow(dirPath, editing.kind, depth));
  if (!listing || (listing.loading && !listing.entries.length)) {
    if (!listing) loadDir(dirPath).then(renderFiles);
    out.push(infoRow(t('files.loading'), depth));
    return;
  }
  if (listing.error) {
    out.push(infoRow(listing.error, depth, 'is-error'));
    return;
  }
  const entries = visibleEntries(listing.entries);
  if (!entries.length && !(editing && samePath(editing.parent, dirPath))) {
    out.push(infoRow(state.settings.filesShowAll ? t('files.emptyFolder') : t('files.noDocuments'), depth));
    return;
  }
  for (const entry of entries.slice(0, MAX_ENTRIES)) {
    out.push(rowElement({ ...entry, depth }));
    if (entry.dir && expanded.has(normPath(entry.path))) appendChildren(out, entry.path, depth + 1);
  }
  if (entries.length > MAX_ENTRIES) out.push(infoRow(t('files.moreEntries', { count: entries.length - MAX_ENTRIES }), depth));
}

function emptyState() {
  return h(
    'div',
    { class: 'files-empty' },
    h('span', { class: 'files-empty-icon', html: icons.folderOpen }),
    h('p', { class: 'files-empty-title' }, t('files.emptyTitle')),
    h('p', { class: 'files-empty-text' }, t('files.emptyText')),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', onClick: openFolderDialog, html: `${icons.folderPlus}<span>${t('action.openFolder')}</span>` }),
  );
}

export function renderFiles() {
  const tree = els.filesTree;
  els.filesAdd.innerHTML = icons.folderPlus;
  els.filesMore.innerHTML = icons.more;
  const list = roots();
  if (!list.length) {
    tree.replaceChildren(emptyState());
    return;
  }
  const hadFocus = tree.contains(document.activeElement) && !document.activeElement.matches('.ft-input');
  const focusedPath = hadFocus ? document.activeElement.closest('.ft-row')?.dataset.path : null;
  const oldInput = tree.querySelector('.ft-input');
  const typed = oldInput ? { value: oldInput.value, start: oldInput.selectionStart, end: oldInput.selectionEnd } : null;
  const top = tree.scrollTop;
  const out = [];
  for (const root of list) {
    remember(root);
    out.push(rowElement({ path: root, name: basename(root), dir: true, depth: 0, root: true }));
    if (expanded.has(normPath(root))) appendChildren(out, root, 1);
  }
  tree.replaceChildren(...out);
  tree.scrollTop = top;
  const rows = tree.querySelectorAll('.ft-row[data-path]');
  const target = (focusedPath && [...rows].find((r) => samePath(r.dataset.path, focusedPath))) || null;
  (target || rows[0])?.setAttribute('tabindex', '0');
  const input = tree.querySelector('.ft-input');
  if (input) {
    if (typed) {
      input.value = typed.value;
      input.setSelectionRange(typed.start, typed.end);
    } else {
      input.setSelectionRange(0, Number(input.dataset.selectEnd) || input.value.length);
    }
    input.focus({ preventScroll: Boolean(typed) });
    if (!typed) input.scrollIntoView({ block: 'nearest' });
  } else if (target) {
    target.focus({ preventScroll: true });
  }
}

/** Met en évidence le document actif dans l'arbre (sans tout redessiner). */
export function markActiveFile() {
  const path = state.active?.path;
  for (const row of els.filesTree.querySelectorAll('.ft-row.is-file')) {
    row.classList.toggle('active', Boolean(path) && samePath(row.dataset.path, path));
  }
}

// --- Actions ------------------------------------------------------------------------------------

export async function openFolderDialog() {
  const picked = await api.folders.pick();
  if (!picked.length) return;
  addFolders(picked);
}

export function addFolders(paths) {
  const list = roots();
  for (const p of paths) {
    if (!list.some((r) => samePath(r, p))) list.push(p);
    expanded.add(normPath(p));
    remember(p);
  }
  setRoots(list);
  persistExpanded();
  if (!state.settings.filesPanel) updateSettings({ filesPanel: true });
  renderFiles();
  requestAnimationFrame(() => {
    const row = [...els.filesTree.querySelectorAll('.ft-row.is-root')].find((r) => samePath(r.dataset.path, paths[0]));
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus({ preventScroll: true });
  });
}

function removeRoot(path) {
  setRoots(roots().filter((r) => !samePath(r, path)));
  for (const key of [...listings.keys()]) if (isSameOrInside(key, path)) listings.delete(key);
  renderFiles();
}

export function toggleFilesPanel() {
  const open = !state.settings.filesPanel;
  updateSettings({ filesPanel: open });
  if (open) requestAnimationFrame(() => els.filesTree.querySelector('.ft-row[tabindex="0"]')?.focus({ preventScroll: true }));
}

function setExpanded(path, open) {
  const key = normPath(path);
  if (open === expanded.has(key)) return;
  if (open) expanded.add(key);
  else expanded.delete(key);
  remember(path);
  persistExpanded();
  renderFiles();
}

function collapseAll() {
  expanded = new Set();
  persistExpanded();
  renderFiles();
}

async function openEntry(path, dir) {
  if (dir) {
    setExpanded(path, !expanded.has(normPath(path)));
    return;
  }
  if (MARKDOWN_EXT.test(path)) {
    await openPath(path);
    return;
  }
  const res = await api.openPath(path);
  if (res && !res.ok) toast(t('nav.linkFailed', { error: res.error }), { type: 'error' });
}

function startCreate(parent, kind) {
  editing = { kind, parent };
  expanded.add(normPath(parent));
  persistExpanded();
  renderFiles();
}

// Une racine se renomme aussi : elle reste dans la liste sous son nouveau nom.
function startRename(path) {
  editing = { kind: 'rename', path };
  renderFiles();
}

/** Saisie d'un nom dans l'arbre : Entrée valide, Échap annule, quitter le champ valide. */
function bindEditInput(input, commit) {
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (save) {
      const ok = await commit(input.value.trim());
      if (ok === false) {
        // Nom refusé : on laisse l'utilisateur corriger.
        done = false;
        input.focus();
        return;
      }
    } else {
      editing = null;
      renderFiles();
    }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => {
    // Un clic ailleurs valide (comme dans l'Explorateur), sauf si le nom est vide. Un champ
    // retiré par un nouveau rendu du panneau n'est pas validé : il a été remplacé.
    setTimeout(() => {
      if (!done && input.isConnected) finish(Boolean(input.value.trim()));
    }, 0);
  });
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());
}

async function commitCreate(parent, kind, rawName) {
  if (!rawName) {
    editing = null;
    renderFiles();
    return true;
  }
  let name = rawName;
  if (kind === 'file' && !extensionOf(name)) name = `${name}.md`;
  const error = nameError(name);
  if (error) {
    toast(error, { type: 'error', duration: 4000 });
    return false;
  }
  const res = kind === 'file' ? await api.folders.createFile(parent, name) : await api.folders.createFolder(parent, name);
  if (!res.ok) {
    toast(res.code === 'EEXIST' ? t('files.errorExists', { name }) : t('files.createFailed', { error: res.error }), { type: 'error', duration: 4500 });
    return false;
  }
  editing = null;
  if (kind === 'folder') expanded.add(normPath(res.path));
  persistExpanded();
  await loadDir(parent);
  renderFiles();
  if (kind === 'file') {
    const doc = await openPath(res.path);
    if (doc) setMode(doc, state.settings.editorMode === 'source' ? 'source' : 'split');
  }
  return true;
}

async function commitRename(path, oldName, dir, rawName) {
  let name = rawName;
  if (!name || name === oldName) {
    editing = null;
    renderFiles();
    return true;
  }
  // Document Markdown renommé sans extension : on garde la sienne.
  const oldExt = extensionOf(oldName);
  if (!dir && oldExt && !extensionOf(name) && MARKDOWN_EXT.test(oldName)) name = `${name}${oldExt}`;
  const error = nameError(name);
  if (error) {
    toast(error, { type: 'error', duration: 4000 });
    return false;
  }
  const res = await api.folders.rename(path, name);
  if (!res.ok) {
    toast(res.code === 'EEXIST' ? t('files.errorExists', { name }) : t('files.renameFailed', { error: res.error }), { type: 'error', duration: 4500 });
    return false;
  }
  editing = null;
  afterMove(path, res.path);
  await loadDir(dirname(res.path));
  renderFiles();
  return true;
}

/** Après un renommage ou un déplacement : onglets, dossiers dépliés, racines, récents. */
function afterMove(from, to) {
  relocateDocs(from, to);
  api.recent.relocate(from, to);
  const moved = [...expanded].filter((key) => isSameOrInside(key, from));
  for (const key of moved) {
    expanded.delete(key);
    const next = relocatePath(originalPath(key) || key, from, to);
    expanded.add(normPath(next));
    remember(next);
  }
  for (const key of [...listings.keys()]) if (isSameOrInside(key, from)) listings.delete(key);
  if (roots().some((r) => isSameOrInside(r, from))) setRoots(roots().map((r) => (isSameOrInside(r, from) ? relocatePath(r, from, to) : r)));
  persistExpanded();
}

async function trashEntry(path, dir) {
  const name = basename(path);
  const ok = await confirmModal({
    title: t('files.trashTitle', { name }),
    message: dir ? t('files.trashFolderMessage') : t('files.trashFileMessage'),
    confirm: t('files.trash'),
    danger: true,
  });
  if (!ok) return;
  const res = await api.folders.trash(path);
  if (!res.ok) {
    toast(t('files.trashFailed', { error: res.error }), { type: 'error', duration: 5000 });
    return;
  }
  // Onglets concernés : fermés s'ils n'ont pas de modifications, sinon signalés comme introuvables.
  for (const doc of state.docs.filter((d) => d.path && isSameOrInside(d.path, path))) {
    if (isDirty(doc)) markMissing(doc);
    else await closeDoc(doc, { force: true });
  }
  await api.recent.remove(path);
  renderTabs();
  for (const key of [...expanded]) if (isSameOrInside(key, path)) expanded.delete(key);
  for (const key of [...listings.keys()]) if (isSameOrInside(key, path)) listings.delete(key);
  persistExpanded();
  await loadDir(dirname(path));
  renderFiles();
  toast(t('files.trashed', { name }), { duration: 2400 });
}

async function moveEntry(from, toDir) {
  const res = await api.folders.move(from, toDir);
  if (!res.ok) {
    const name = basename(from);
    toast(res.code === 'EEXIST' ? t('files.errorExistsIn', { name, folder: basename(toDir) }) : t('files.moveFailed', { error: res.error }), {
      type: 'error',
      duration: 4500,
    });
    return;
  }
  afterMove(from, res.path);
  expanded.add(normPath(toDir));
  persistExpanded();
  await Promise.all([loadDir(dirname(from)), loadDir(toDir)]);
  renderFiles();
}

// --- Menus ----------------------------------------------------------------------------------------

function showEntryMenu(row, point) {
  const path = row.dataset.path;
  const dir = row.dataset.kind === 'dir';
  const root = row.dataset.root === '1';
  const items = [];
  if (dir) {
    items.push(
      { label: t('files.newFile'), icon: icons.filePlus, run: () => startCreate(path, 'file') },
      { label: t('files.newFolder'), icon: icons.folderPlus, run: () => startCreate(path, 'folder') },
      'separator',
    );
  } else {
    items.push({ label: t('common.open'), icon: icons.fileText, run: () => openEntry(path, false) }, 'separator');
  }
  items.push(
    { label: t('files.rename'), icon: icons.pencil, shortcut: 'F2', run: () => startRename(path) },
    { label: t('common.showInExplorer'), icon: icons.folder, run: () => api.showInFolder(path) },
    { label: t('common.copyPath'), icon: icons.link, run: () => copyText(path) },
    'separator',
  );
  if (root) {
    items.push(
      { label: t('files.refresh'), icon: icons.refresh, run: () => reload(path) },
      { label: t('files.removeFromList'), icon: icons.folderMinus, run: () => removeRoot(path) },
    );
  } else {
    items.push({ label: t('files.trash'), icon: icons.trash, shortcut: shortcutName('Delete'), danger: true, run: () => trashEntry(path, dir) });
  }
  openMenu(point, items);
}

const shortcutName = (key) => t(`key.${key}`);

function showPanelMenu(anchor) {
  openMenu(anchor, [
    { label: t('menu.openFolderEllipsis'), icon: icons.folderPlus, run: openFolderDialog },
    { label: t('files.collapseAll'), icon: icons.collapseAll, disabled: !expanded.size, run: collapseAll },
    { label: t('files.refreshAll'), icon: icons.refresh, disabled: !roots().length, run: () => reload() },
    'separator',
    {
      label: t('files.showAll'),
      icon: icons.file,
      checked: Boolean(state.settings.filesShowAll),
      run: () => updateSettings({ filesShowAll: !state.settings.filesShowAll }),
    },
    { label: t('files.hidePanel'), icon: icons.eyeOff, run: () => updateSettings({ filesPanel: false }) },
  ]);
}

// --- Clavier ----------------------------------------------------------------------------------------

/** Touches gérées quand le focus est dans l'arbre. Retourne true si la touche a été utilisée. */
export function handleFilesKey(e, combo) {
  const active = document.activeElement;
  const row = active instanceof Element ? active.closest('.ft-row[data-path]') : null;
  if (!row || !els.filesTree.contains(row) || editing) return false;
  const rows = [...els.filesTree.querySelectorAll('.ft-row[data-path]')];
  const index = rows.indexOf(row);
  const path = row.dataset.path;
  const dir = row.dataset.kind === 'dir';
  const focusRow = (r) => {
    if (!r) return;
    for (const other of rows) other.setAttribute('tabindex', '-1');
    r.setAttribute('tabindex', '0');
    r.focus();
  };
  const level = (r) => Number(r.getAttribute('aria-level'));
  switch (combo) {
    case 'ArrowDown':
      focusRow(rows[index + 1]);
      break;
    case 'ArrowUp':
      focusRow(rows[index - 1]);
      break;
    case 'Home':
      focusRow(rows[0]);
      break;
    case 'End':
      focusRow(rows[rows.length - 1]);
      break;
    case 'ArrowRight':
      if (dir && !expanded.has(normPath(path))) setExpanded(path, true);
      else if (dir) focusRow(rows[index + 1]);
      break;
    case 'ArrowLeft':
      if (dir && expanded.has(normPath(path))) setExpanded(path, false);
      else focusRow(rows.slice(0, index).reverse().find((r) => level(r) < level(row)));
      break;
    case 'Enter':
      openEntry(path, dir);
      break;
    case 'F2':
      startRename(path);
      break;
    case 'Delete':
      if (row.dataset.root !== '1') trashEntry(path, dir);
      break;
    default:
      return false;
  }
  e.preventDefault();
  e.stopPropagation();
  return true;
}

// --- Évènements ------------------------------------------------------------------------------------

function canDropInto(targetDir) {
  if (!dragPath || !targetDir) return false;
  if (samePath(dirname(dragPath), targetDir)) return false;
  return !isSameOrInside(targetDir, dragPath);
}

function clearDropTargets() {
  clearTimeout(dragHoverTimer);
  for (const el of els.filesTree.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
}

export function bindFiles() {
  const tree = els.filesTree;
  els.filesAdd.addEventListener('click', openFolderDialog);
  els.filesMore.addEventListener('click', () => showPanelMenu(els.filesMore));

  tree.addEventListener('click', (e) => {
    const row = e.target.closest('.ft-row[data-path]');
    if (!row) return;
    const act = e.target.closest('.ft-action')?.dataset.act;
    if (act) {
      e.stopPropagation();
      startCreate(row.dataset.path, act);
      return;
    }
    for (const other of tree.querySelectorAll('.ft-row[tabindex="0"]')) other.setAttribute('tabindex', '-1');
    row.setAttribute('tabindex', '0');
    openEntry(row.dataset.path, row.dataset.kind === 'dir');
  });
  tree.addEventListener('auxclick', (e) => {
    // Clic du milieu sur un document : ouverture sans quitter le document actuel.
    const row = e.target.closest('.ft-row.is-file[data-path]');
    if (e.button !== 1 || !row) return;
    e.preventDefault();
    if (MARKDOWN_EXT.test(row.dataset.path)) openPath(row.dataset.path, { focus: false });
  });
  tree.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = e.target.closest('.ft-row[data-path]');
    if (row) showEntryMenu(row, { x: e.clientX, y: e.clientY });
    else showPanelMenu({ x: e.clientX, y: e.clientY });
  });

  // Glisser-déposer : ranger un fichier ou un dossier dans un autre dossier.
  tree.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.ft-row[data-path]');
    if (!row || row.dataset.root === '1') return;
    dragPath = row.dataset.path;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-folio-file', dragPath);
  });
  tree.addEventListener('dragover', (e) => {
    if (!dragPath) return;
    const row = e.target.closest('.ft-row.is-dir[data-path]');
    const target = row?.dataset.path;
    if (!canDropInto(target)) {
      clearDropTargets();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!row.classList.contains('drop-target')) {
      clearDropTargets();
      row.classList.add('drop-target');
      // Survol prolongé d'un dossier fermé : il s'ouvre.
      if (!expanded.has(normPath(target))) dragHoverTimer = setTimeout(() => setExpanded(target, true), 700);
    }
  });
  tree.addEventListener('dragleave', (e) => {
    if (!tree.contains(e.relatedTarget)) clearDropTargets();
  });
  tree.addEventListener('drop', (e) => {
    const row = e.target.closest('.ft-row.is-dir[data-path]');
    const from = dragPath;
    clearDropTargets();
    if (!from || !canDropInto(row?.dataset.path)) return;
    e.preventDefault();
    dragPath = null;
    moveEntry(from, row.dataset.path);
  });
  tree.addEventListener('dragend', () => {
    dragPath = null;
    clearDropTargets();
    tree.querySelector('.dragging')?.classList.remove('dragging');
  });

  api.folders.onChanged(onDiskChange);

  // Redimensionnement du panneau.
  els.filesResize.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = els.files.getBoundingClientRect().width;
    els.filesResize.setPointerCapture(e.pointerId);
    els.app.classList.add('resizing');
    const onMove = (ev) => {
      document.documentElement.style.setProperty('--files-width', `${clampFilesWidth(startWidth + ev.clientX - startX)}px`);
    };
    const onUp = (ev) => {
      els.filesResize.removeEventListener('pointermove', onMove);
      els.filesResize.removeEventListener('pointerup', onUp);
      els.app.classList.remove('resizing');
      updateSettings({ filesWidth: clampFilesWidth(startWidth + ev.clientX - startX) });
    };
    els.filesResize.addEventListener('pointermove', onMove);
    els.filesResize.addEventListener('pointerup', onUp);
  });
  els.filesResize.addEventListener('dblclick', () => updateSettings({ filesWidth: 260 }));
}

/** Au démarrage : dossiers dépliés de la session précédente et surveillance des racines. */
export function restoreFiles() {
  const saved = Array.isArray(state.settings.filesExpanded) ? state.settings.filesExpanded : [];
  for (const p of saved) {
    if (typeof p !== 'string') continue;
    expanded.add(normPath(p));
    remember(p);
  }
  const list = roots();
  if (list.length) api.folders.watch(list);
  renderFiles();
}
