// Documents : ouverture, chargement, rendu, enregistrement, modes lecture / édition.
import { createRenderer } from './markdown.js';
import { enhance, renderMermaid, frontMatterCard } from './enhance.js';
import { state, els, api, updateSettings } from './context.js';
import { mermaidTheme } from './appearance.js';
import { toast, confirmModal } from './ui.js';
import { icons } from './icons.js';
import { h, basename, samePath, isSameOrInside, relocatePath } from './util.js';
import { t } from './i18n.js';
import {
  finder,
  buildOutline,
  scheduleOutlineActive,
  onPreviewScroll,
  onEditorScroll,
  previewOffsetForLine,
  previewTopLine,
  scrollToAnchor,
} from './navigation.js';
import { renderTabs, docsInSpace, getSpace, switchSpace, scheduleSessionSave } from './tabs.js';
import { refreshWelcome } from './welcome.js';
import { noteEdit, onDocumentLeft, autoSaveEnabled, canAutoSave } from './autosave.js';
import { markActiveFile } from './files.js';

export const FONT_MIN = 12;
export const FONT_MAX = 26;
export const FONT_DEFAULT = 16;

let renderer = null;
let nextDocId = 1;

export function resetRenderer() {
  renderer = createRenderer({ breaks: Boolean(state.settings.breaks) });
  for (const doc of state.docs) doc.lastRendered = null;
}

function normalizeText(raw) {
  return { text: raw.replace(/\r\n?/g, '\n'), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}

function untitledName() {
  state.untitled += 1;
  return state.untitled === 1 ? t('doc.untitled') : t('doc.untitledN', { n: state.untitled });
}

export function syncFromEditor(doc) {
  if (doc && doc.editor && doc.editorChanged) {
    doc.content = doc.editor.getValue();
    doc.editorChanged = false;
  }
}

export function isDirty(doc) {
  if (!doc || !doc.loaded) return false;
  syncFromEditor(doc);
  return doc.content !== doc.saved;
}

// --- Création et chargement -----------------------------------------------------------

export function createDoc({ path = null, text = '', encoding = 'utf8', eol = '\n', spaceId = state.activeSpaceId, loaded = true } = {}) {
  const doc = {
    id: nextDocId++,
    spaceId,
    path,
    name: path ? basename(path) : untitledName(),
    content: text,
    saved: path ? text : '',
    encoding,
    eol,
    loaded,
    loading: null,
    watched: null,
    mode: 'preview',
    editor: null,
    editorChanged: false,
    lastRendered: null,
    mermaidKey: null,
    mermaidPromise: Promise.resolve(),
    lineMap: null,
    headings: [],
    outlineActive: undefined,
    missing: false,
    pendingDisk: null,
    diskSeq: 0,
    ignorePreviewScrollUntil: 0,
    ignoreEditorScrollUntil: 0,
    liveTimer: null,
    autoSaveTimer: null,
    autoSaveFailed: false,
    saveQueue: null,
    writing: null,
  };
  buildDocView(doc);
  state.docs.push(doc);
  if (loaded && path) watchDoc(doc);
  return doc;
}

function buildDocView(doc) {
  const article = h('article', { class: 'markdown-body' });
  const preview = h('div', { class: 'preview-pane', tabindex: '-1' }, article);
  const editorHost = h('div', { class: 'editor-pane' });
  const banner = h('div', { class: 'doc-banner', hidden: true });
  const root = h(
    'div',
    { class: 'doc-view', 'data-mode': 'preview', hidden: true },
    banner,
    h('div', { class: 'doc-panes' }, editorHost, h('div', { class: 'pane-divider' }), preview),
  );
  els.views.append(root);
  doc.view = { root, banner, editorHost, preview, article };
  preview.addEventListener('scroll', () => onPreviewScroll(doc), { passive: true });
  article.addEventListener(
    'load',
    () => {
      doc.lineMap = null;
    },
    true,
  );
}

function watchDoc(doc) {
  if (!doc.path || doc.watched) return;
  doc.watched = doc.path;
  api.watch(doc.path);
}

function unwatchDoc(doc) {
  if (!doc.watched) return;
  api.unwatch(doc.watched);
  doc.watched = null;
}

/** Charge le contenu d'un onglet restauré de la session précédente. */
export function loadDoc(doc) {
  if (doc.loaded) return Promise.resolve(true);
  if (!doc.loading) {
    doc.loading = api.readFile(doc.path).then((res) => {
      doc.loading = null;
      if (!state.docs.includes(doc)) return false;
      if (!res.ok) {
        doc.loadError = res.error;
        showBanner(doc, 'unavailable');
        return false;
      }
      const { text, eol } = normalizeText(res.text);
      Object.assign(doc, {
        content: text,
        saved: text,
        eol,
        encoding: res.encoding,
        loaded: true,
        missing: false,
        loadError: null,
        path: res.path,
        name: basename(res.path),
      });
      hideBanner(doc);
      watchDoc(doc);
      return true;
    });
  }
  return doc.loading;
}

// --- Rendu ---------------------------------------------------------------------------

export function renderDoc(doc, { follow = false } = {}) {
  if (!doc.loaded) return Promise.resolve();
  syncFromEditor(doc);
  if (doc.lastRendered === doc.content) return doc.mermaidPromise;
  const { preview, article } = doc.view;
  const top = preview.scrollTop;
  const atBottom = follow && top > 0 && top + preview.clientHeight >= preview.scrollHeight - 48;

  let result;
  try {
    result = renderer.render(doc.content);
  } catch (err) {
    console.error(err);
    article.replaceChildren(h('div', { class: 'render-error' }, t('doc.renderError', { error: err.message })));
    doc.lastRendered = doc.content;
    return Promise.resolve();
  }
  article.replaceChildren();
  if (result.frontMatter) article.append(frontMatterCard(result.frontMatter));
  article.append(result.fragment);

  const theme = mermaidTheme();
  doc.mermaidKey = theme.key;
  doc.mermaidPromise = enhance(article, { docPath: doc.path, theme }).then(() => {
    doc.lineMap = null;
    if (doc === state.active) scheduleOutlineActive();
  });
  doc.lastRendered = doc.content;
  doc.lineMap = null;
  preview.scrollTop = atBottom ? preview.scrollHeight : top;

  if (doc === state.active) {
    buildOutline(doc);
    finder.refresh();
  }
  return doc.mermaidPromise;
}

/** Redessine les diagrammes si le thème ou les couleurs ont changé. */
export function refreshDiagrams(doc) {
  if (!doc || !doc.loaded) return;
  const theme = mermaidTheme();
  if (doc.mermaidKey === theme.key) return;
  doc.mermaidKey = theme.key;
  renderMermaid(doc.view.article, theme).then(() => {
    doc.lineMap = null;
  });
}

// --- Activation ------------------------------------------------------------------------

export function activate(doc) {
  if (doc && doc.spaceId !== state.activeSpaceId) {
    switchSpace(doc.spaceId, { activateDoc: doc });
    return;
  }
  if (doc && state.active === doc) return;
  const previous = state.active;
  if (previous) previous.view.root.hidden = true;
  onDocumentLeft(previous);
  state.active = doc || null;
  els.welcome.hidden = Boolean(doc);
  els.app.classList.toggle('has-doc', Boolean(doc));

  if (doc) {
    const space = getSpace(doc.spaceId);
    if (space) space.lastActiveId = doc.id;
    doc.view.root.hidden = false;
    if (!doc.loaded) {
      if (!doc.view.article.childElementCount) {
        doc.view.article.replaceChildren(h('div', { class: 'doc-loading' }, t('doc.loading')));
      }
      loadDoc(doc).then((ok) => {
        if (!ok || state.active !== doc) return;
        renderDoc(doc);
        buildOutline(doc);
        renderTabs();
      });
    } else if (doc.lastRendered !== doc.content || doc.editorChanged) {
      renderDoc(doc);
    } else {
      refreshDiagrams(doc);
    }
    buildOutline(doc);
    if (doc.mode !== 'preview' && doc.editor) requestAnimationFrame(() => doc.editor.focus());
    else doc.view.preview.focus({ preventScroll: true });
  } else {
    els.outlineList.replaceChildren();
    refreshWelcome();
  }
  if (finder.isOpen) {
    if (doc) finder.refresh();
    else finder.close();
  }
  renderTabs();
  updateModeUi();
  markActiveFile();
  scheduleSessionSave();
}

// --- Ouvrir, créer, fermer ----------------------------------------------------------------

export async function openPath(filePath, { hash = '', focus = true, spaceId = null } = {}) {
  const existing = state.docs.find((d) => samePath(d.path, filePath));
  if (existing) {
    if (focus) activate(existing);
    if (hash) scrollToAnchor(existing, hash);
    return existing;
  }
  const res = await api.readFile(filePath);
  if (!res.ok) {
    toast(t('doc.openFailed', { name: basename(filePath), error: res.error }), { type: 'error', duration: 4500 });
    return null;
  }
  const again = state.docs.find((d) => samePath(d.path, res.path));
  if (again) {
    if (focus) activate(again);
    return again;
  }

  // Un onglet « Sans titre » vide et intact est remplacé, comme dans un éditeur classique.
  const current = state.active;
  const blank = current && !current.path && current.loaded && !isDirty(current) ? current : null;

  const { text, eol } = normalizeText(res.text);
  const targetSpace = spaceId && getSpace(spaceId) ? spaceId : state.activeSpaceId;
  const doc = createDoc({ path: res.path, text, encoding: res.encoding, eol, spaceId: targetSpace });
  api.recent.add(doc.path);
  renderDoc(doc);
  if (focus) activate(doc);
  else renderTabs();
  if (blank) closeDoc(blank, { force: true });
  if (hash) requestAnimationFrame(() => scrollToAnchor(doc, hash));
  scheduleSessionSave();
  return doc;
}

export async function openDialog() {
  const files = await api.openDialog();
  for (const file of files) await openPath(file);
}

export function newDoc() {
  const doc = createDoc();
  renderDoc(doc);
  activate(doc);
  setMode(doc, state.settings.editorMode === 'source' ? 'source' : 'split');
}

export async function closeDoc(doc, { force = false } = {}) {
  if (!doc) return false;
  if (!force && isDirty(doc)) {
    // Enregistrement automatique actif : le fichier est enregistré au lieu de poser la question.
    const saved = autoSaveEnabled() && canAutoSave(doc) && (await saveDoc(doc, { quiet: true, auto: true }));
    if (!saved && isDirty(doc)) {
      if (state.active !== doc) activate(doc);
      const choice = await api.confirmUnsaved(doc.name);
      if (choice === 'cancel') return false;
      if (choice === 'save' && !(await saveDoc(doc))) return false;
    }
  }
  const siblings = docsInSpace(doc.spaceId);
  const position = siblings.indexOf(doc);
  const index = state.docs.indexOf(doc);
  if (index === -1) return true;
  state.docs.splice(index, 1);
  clearTimeout(doc.liveTimer);
  clearTimeout(doc.autoSaveTimer);
  unwatchDoc(doc);
  if (doc.path) {
    state.closed.push({ path: doc.path, spaceId: doc.spaceId });
    if (state.closed.length > 20) state.closed.shift();
  }
  doc.editor?.destroy();
  doc.view.root.remove();
  if (state.active === doc) {
    state.active = null;
    const remaining = siblings.filter((d) => d !== doc);
    activate(remaining[Math.min(position, remaining.length - 1)] || null);
  } else {
    renderTabs();
    scheduleSessionSave();
  }
  return true;
}

/** Ferme plusieurs documents ; s'arrête si l'utilisateur annule. */
export async function closeDocs(docs) {
  for (const doc of docs) {
    if (!(await closeDoc(doc))) return false;
  }
  return true;
}

export function reopenClosed() {
  while (state.closed.length) {
    const entry = state.closed.pop();
    if (!state.docs.some((d) => samePath(d.path, entry.path))) {
      openPath(entry.path, { spaceId: entry.spaceId });
      return;
    }
  }
}

/**
 * Des fichiers ont été renommés ou déplacés (panneau Dossiers) : les onglets ouverts
 * suivent. La surveillance des fichiers a déjà été déplacée par le processus principal.
 */
export function relocateDocs(from, to) {
  let changed = false;
  for (const doc of state.docs) {
    if (!doc.path || !isSameOrInside(doc.path, from)) continue;
    doc.path = relocatePath(doc.path, from, to);
    doc.name = basename(doc.path);
    if (doc.watched) doc.watched = doc.path;
    if (doc.missing) {
      doc.missing = false;
      hideBanner(doc);
    }
    // Les images relatives dépendent du dossier du document.
    doc.lastRendered = null;
    if (doc === state.active) renderDoc(doc);
    changed = true;
  }
  for (const entry of state.closed) {
    if (isSameOrInside(entry.path, from)) entry.path = relocatePath(entry.path, from, to);
  }
  if (changed) {
    renderTabs();
    scheduleSessionSave();
  }
}

// --- Enregistrement ------------------------------------------------------------------------

export function suggestFileName(doc) {
  if (doc.path) return doc.path;
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(doc.content);
  const base = (m ? m[1] : doc.name)
    .replace(/[\\/:*?"<>|#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || t('doc.untitled')}.md`;
}

/**
 * Enregistre le document. Un seul enregistrement à la fois par document : celui qui
 * arrive pendant un autre (enregistrement automatique pendant un Ctrl+S…) attend son tour.
 * auto : enregistrement automatique (silencieux, une seule alerte en cas d'échec répété).
 */
export function saveDoc(doc, options = {}) {
  if (!doc || !doc.loaded) return Promise.resolve(false);
  const run = (doc.saveQueue || Promise.resolve()).then(() => writeDoc(doc, options));
  doc.saveQueue = run.catch(() => false);
  return run;
}

async function writeDoc(doc, { saveAs = false, quiet = false, auto = false } = {}) {
  if (!state.docs.includes(doc) || !doc.loaded) return false;
  syncFromEditor(doc);
  if (auto && (!doc.path || doc.content === doc.saved)) return true;
  let target = doc.path;
  if (!target || saveAs) {
    target = await api.saveDialog(suggestFileName(doc));
    if (!target) return false;
  }
  const content = doc.content;
  // Pendant l'écriture, la surveillance du fichier ignore ce changement (c'est le nôtre).
  doc.writing = content;
  const res = await api.writeFile(target, content.replace(/\n/g, doc.eol), doc.encoding);
  doc.writing = null;
  if (!res.ok) {
    if (!auto || !doc.autoSaveFailed) toast(t('doc.saveFailed', { error: res.error }), { type: 'error', duration: 5000 });
    if (auto) doc.autoSaveFailed = true;
    return false;
  }
  doc.autoSaveFailed = false;
  doc.saved = content;
  doc.missing = false;
  doc.pendingDisk = null;
  hideBanner(doc);
  if (!samePath(doc.path, res.path)) {
    // « Enregistrer sous » vers un fichier déjà ouvert : l'ancien onglet est remplacé.
    const duplicate = state.docs.find((d) => d !== doc && samePath(d.path, res.path));
    if (duplicate) closeDoc(duplicate, { force: true });
    unwatchDoc(doc);
    doc.path = res.path;
    doc.name = basename(res.path);
    watchDoc(doc);
    api.recent.add(doc.path);
    doc.lastRendered = null;
    renderDoc(doc);
    scheduleSessionSave();
    markActiveFile();
  }
  renderTabs();
  if (!quiet) toast(t('doc.saved'), { type: 'success', duration: 1400 });
  return true;
}

export async function reloadDoc(doc) {
  if (!doc || !doc.path) return;
  if (isDirty(doc)) {
    const ok = await confirmModal({
      title: t('doc.reloadTitle'),
      message: t('doc.reloadMessage'),
      confirm: t('banner.reload'),
    });
    if (!ok) return;
  }
  const res = await api.readFile(doc.path);
  if (!res.ok) {
    toast(t('doc.reloadFailed', { error: res.error }), { type: 'error' });
    return;
  }
  const { text, eol } = normalizeText(res.text);
  doc.loaded = true;
  watchDoc(doc);
  applyDiskText(doc, text, eol, res.encoding);
  toast(t('doc.reloaded'), { duration: 1300 });
}

function applyDiskText(doc, text, eol, encoding) {
  clearTimeout(doc.autoSaveTimer);
  doc.content = text;
  doc.saved = text;
  doc.eol = eol;
  doc.encoding = encoding;
  doc.pendingDisk = null;
  doc.missing = false;
  if (doc.editor) doc.editor.setValue(text);
  doc.editorChanged = false;
  hideBanner(doc);
  renderDoc(doc, { follow: true });
  renderTabs();
}

/** Un fichier ouvert a été modifié (ou supprimé) par un autre programme. */
export async function onFileChanged({ path: changedPath, exists }) {
  for (const doc of state.docs.filter((d) => d.loaded && samePath(d.path, changedPath))) {
    // Notre propre enregistrement est en cours : ce n'est pas un changement extérieur.
    if (doc.writing != null) continue;
    const seq = (doc.diskSeq += 1);
    if (!exists) {
      doc.missing = true;
      showBanner(doc, 'missing');
      renderTabs();
      continue;
    }
    const res = await api.readFile(doc.path);
    if (!res.ok || seq !== doc.diskSeq || !state.docs.includes(doc) || doc.writing != null) continue;
    const { text, eol } = normalizeText(res.text);
    const wasMissing = doc.missing;
    doc.missing = false;
    if (text === doc.saved) {
      if (wasMissing) {
        hideBanner(doc);
        renderTabs();
      }
      continue;
    }
    if (isDirty(doc) || !state.settings.autoReload) {
      doc.pendingDisk = { text, eol, encoding: res.encoding };
      showBanner(doc, 'changed');
      continue;
    }
    applyDiskText(doc, text, eol, res.encoding);
    document.querySelector(`.tab[data-id="${doc.id}"]`)?.classList.add('pulse');
  }
}

// --- Bandeaux d'information ------------------------------------------------------------------

function showBanner(doc, kind) {
  const banner = doc.view.banner;
  banner.dataset.kind = kind;
  const button = (label, onClick, ghost = false) =>
    h('button', { class: ghost ? 'btn btn-sm btn-ghost' : 'btn btn-sm', type: 'button', onClick }, label);

  if (kind === 'changed') {
    banner.replaceChildren(
      h('span', { class: 'banner-icon', html: icons.refresh }),
      h('span', { class: 'banner-text' }, t('banner.changed')),
      h(
        'div',
        { class: 'banner-actions' },
        button(t('banner.reload'), () => {
          const p = doc.pendingDisk;
          if (p) applyDiskText(doc, p.text, p.eol, p.encoding);
        }),
        button(
          t('banner.keepMine'),
          () => {
            if (doc.pendingDisk) doc.saved = doc.pendingDisk.text;
            doc.pendingDisk = null;
            hideBanner(doc);
            renderTabs();
            noteEdit(doc);
          },
          true,
        ),
      ),
    );
  } else if (kind === 'missing') {
    banner.replaceChildren(
      h('span', { class: 'banner-icon', html: icons.alert }),
      h('span', { class: 'banner-text' }, t('banner.missing')),
      h('div', { class: 'banner-actions' }, button(t('banner.saveAgain'), () => saveDoc(doc)), button(t('common.close'), () => closeDoc(doc), true)),
    );
  } else {
    banner.replaceChildren(
      h('span', { class: 'banner-icon', html: icons.alert }),
      h('span', { class: 'banner-text' }, t('banner.unavailable', { error: doc.loadError || t('common.unknownError') })),
      h(
        'div',
        { class: 'banner-actions' },
        button(t('banner.retry'), () => {
          hideBanner(doc);
          loadDoc(doc).then((ok) => {
            if (ok && state.active === doc) {
              renderDoc(doc);
              buildOutline(doc);
              renderTabs();
            }
          });
        }),
        button(t('banner.closeTab'), () => closeDoc(doc, { force: true }), true),
      ),
    );
    doc.view.article.replaceChildren();
  }
  banner.hidden = false;
}

function hideBanner(doc) {
  doc.view.banner.hidden = true;
  doc.view.banner.replaceChildren();
}

/** Marque un document comme introuvable (fichier mis à la corbeille depuis Folio). */
export function markMissing(doc) {
  doc.missing = true;
  showBanner(doc, 'missing');
}

// --- Modes : lecture / édition (côte à côte ou source seule) ----------------------------------

let editorLib = null;
function loadEditorLib() {
  if (!editorLib) {
    editorLib = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'editor.js';
      script.onload = () => {
        const lib = window.FolioEditor;
        if (lib && typeof lib.create === 'function') resolve(lib);
        else reject(new Error(t('editor.missing')));
      };
      script.onerror = () => {
        editorLib = null;
        reject(new Error(t('editor.loadFailed')));
      };
      document.head.append(script);
    });
  }
  return editorLib;
}

/** Textes de l'éditeur dans la langue active (recherche, bouton « Copier » des blocs de code). */
function editorStrings() {
  const keys = {
    Find: 'find',
    Replace: 'replace',
    next: 'next',
    previous: 'previous',
    all: 'all',
    'match case': 'matchCase',
    regexp: 'regexp',
    'by word': 'byWord',
    replace: 'replaceOne',
    'replace all': 'replaceAll',
    close: 'close',
    'current match': 'currentMatch',
    'on line': 'onLine',
    'replaced $ matches': 'replacedMatches',
    'replaced match on line $': 'replacedOnLine',
    'Go to line': 'goToLine',
    go: 'go',
    'Control character': 'controlCharacter',
  };
  return {
    phrases: Object.fromEntries(Object.entries(keys).map(([phrase, key]) => [phrase, t(`editor.${key}`)])),
    copy: t('code.copy'),
    copied: t('code.copied'),
    copyTitle: t('code.copyTitle'),
    linkText: t('editor.linkText'),
  };
}

async function ensureEditor(doc) {
  if (doc.editor) return doc.editor;
  const lib = await loadEditorLib();
  if (doc.editor) return doc.editor;
  doc.editor = lib.create({
    parent: doc.view.editorHost,
    doc: doc.content,
    spellcheck: Boolean(state.settings.spellcheck),
    strings: editorStrings(),
    copyText: (text) => api.copyText(text),
    onChange: () => onEditorChange(doc),
    onScroll: () => onEditorScroll(doc),
  });
  return doc.editor;
}

function onEditorChange(doc) {
  doc.editorChanged = true;
  noteEdit(doc);
  clearTimeout(doc.liveTimer);
  doc.liveTimer = setTimeout(() => {
    if (!state.docs.includes(doc)) return;
    const wasDirty = doc.content !== doc.saved;
    renderDoc(doc);
    if (wasDirty !== isDirty(doc)) renderTabs();
    // L'aperçu peut avoir changé de hauteur : on le recale sur la position de l'éditeur.
    if (doc.mode === 'split' && doc === state.active && doc.editor) {
      const top = previewOffsetForLine(doc, doc.editor.topLine());
      if (top != null) {
        doc.ignorePreviewScrollUntil = performance.now() + 120;
        doc.view.preview.scrollTop = top;
      }
    }
  }, doc.content.length > 200_000 ? 450 : 140);
}

export async function setMode(doc, mode) {
  if (!doc || doc.mode === mode) return;
  if (!doc.loaded) await loadDoc(doc);
  if (!doc.loaded) return;
  if (mode !== 'preview') {
    try {
      await ensureEditor(doc);
    } catch (err) {
      toast(err.message, { type: 'error' });
      return;
    }
  }
  syncFromEditor(doc);
  const from = doc.mode;
  const line = from === 'preview' ? previewTopLine(doc) : doc.editor.topLine();

  doc.mode = mode;
  doc.view.root.dataset.mode = mode;
  if (mode !== 'preview' && state.settings.editorMode !== mode) {
    state.settings.editorMode = mode;
    api.setSettings({ editorMode: mode });
  }
  renderDoc(doc);
  doc.lineMap = null;
  requestAnimationFrame(() => {
    if (mode !== 'preview') {
      doc.editor.scrollToLine(line);
      doc.editor.focus();
    }
    if (mode !== 'source') {
      doc.ignorePreviewScrollUntil = performance.now() + 150;
      const top = previewOffsetForLine(doc, line);
      if (top != null) doc.view.preview.scrollTop = top;
    }
  });
  if (doc === state.active) {
    updateModeUi();
    if (mode === 'preview') doc.view.preview.focus({ preventScroll: true });
  }
}

export function toggleEditMode() {
  const doc = state.active;
  if (!doc) return;
  if (doc.mode === 'preview') setMode(doc, state.settings.editorMode === 'source' ? 'source' : 'split');
  else setMode(doc, 'preview');
}

export function toggleSplit() {
  const doc = state.active;
  if (!doc) return;
  if (doc.mode === 'preview') setMode(doc, 'split');
  else setMode(doc, doc.mode === 'split' ? 'source' : 'split');
}

export function updateModeUi() {
  const doc = state.active;
  els.docActions.hidden = !doc;
  if (!doc) return;
  const editing = doc.mode !== 'preview';
  for (const button of els.modeSwitch.querySelectorAll('button')) {
    button.classList.toggle('active', (button.dataset.mode === 'edit') === editing);
  }
  els.split.hidden = !editing;
  els.split.classList.toggle('on', doc.mode === 'split');
}

// --- Langue ---------------------------------------------------------------------------------

/** Après un changement de langue : rendu (titres des encadrés, boutons), éditeurs, bandeaux. */
export function applyDocumentsLanguage() {
  resetRenderer();
  if (state.active) renderDoc(state.active);
  const strings = editorStrings();
  for (const doc of state.docs) {
    doc.editor?.setStrings(strings);
    const kind = doc.view.banner.dataset.kind;
    if (!doc.view.banner.hidden && kind) showBanner(doc, kind);
  }
}

// --- Taille du texte ---------------------------------------------------------------------------

let sizeToast = null;
export function changeFontSize(delta) {
  const current = state.settings.fontSize;
  const size = delta === 0 ? FONT_DEFAULT : Math.max(FONT_MIN, Math.min(FONT_MAX, current + delta));
  if (size === current) return;
  updateSettings({ fontSize: size });
  if (sizeToast) sizeToast();
  sizeToast = toast(t('font.sizeToast', { size }), { duration: 1000 });
}

/** Pour l'enregistrement de la session : document actif de chaque espace. */
export function docById(id) {
  return state.docs.find((d) => d.id === id) || null;
}
