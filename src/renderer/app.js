import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import 'katex/dist/katex.min.css';
import './styles/theme.css';
import './styles/app.css';
import './styles/tabs.css';
import './styles/files.css';
import './styles/settings.css';
import './styles/markdown.css';
import './styles/highlight.css';
import './styles/print.css';

import { state, els, api, query, SNAP, $, darkQuery, onSettingsChange, updateSettings, flushSettings } from './context.js';
import { applyAppearance, applyPalette } from './appearance.js';
import { t, setLanguage, onLanguageChange } from './i18n.js';
import {
  activate,
  isDirty,
  saveDoc,
  openPath,
  onFileChanged,
  renderDoc,
  resetRenderer,
  refreshDiagrams,
  setMode,
  updateModeUi,
  changeFontSize,
  openDialog,
  applyDocumentsLanguage,
} from './documents.js';
import {
  bindOutline,
  bindDocumentClicks,
  selectAllDoc,
  openFind,
  invalidateLayout,
  finder,
  previewTopLine,
  scrollToAnchor,
  buildOutline,
} from './navigation.js';
import {
  bindTabs,
  renderTabs,
  restoreSession,
  switchSpace,
  flushSession,
  refreshTabsChrome,
  createSpace,
  showSpaceMenu,
  openSpaceEditor,
  toggleTabsPanel,
  translateDefaultSpace,
} from './tabs.js';
import { bindFiles, restoreFiles, renderFiles, addFolders } from './files.js';
import { bindAutoSave, configureAutoSave, autoSaveEnabled, autoSaveAll } from './autosave.js';
import { onKeyDown, rebuildKeymap, showMainMenu, cycleTheme, toggleOutline } from './commands.js';
import { runSelfTest } from './selftest.js';
import { openSettings, openAbout } from './settings-ui.js';
import { icons, brandMark } from './icons.js';
import { debounce } from './util.js';
import { platform, primaryModifier } from './platform.js';

// --- Réactions aux changements de paramètres ------------------------------------------------

const refreshDiagramsSoon = debounce(() => refreshDiagrams(state.active), 300);

onSettingsChange((patch, previous) => {
  const changed = (...names) => names.some((n) => n in patch);
  if (changed('language')) setLanguage(patch.language, state.info?.systemLanguages);
  if (changed('theme', 'font', 'fontSize', 'width', 'outline', 'outlineSide', 'tabLayout', 'vtabsState', 'vtabsWidth', 'colors', 'filesPanel', 'filesWidth')) {
    applyAppearance();
  }
  if (changed('colors')) refreshDiagramsSoon();
  if (changed('tabLayout', 'vtabsState')) {
    els.app.classList.remove('vtabs-peek');
    renderTabs();
    refreshTabsChrome();
  }
  if (changed('breaks') && patch.breaks !== previous.breaks) {
    resetRenderer();
    if (state.active) renderDoc(state.active);
  }
  if (changed('spellcheck')) {
    for (const doc of state.docs) doc.editor?.setSpellcheck(Boolean(patch.spellcheck));
  }
  if (changed('shortcuts')) rebuildKeymap();
  if (changed('autoSave', 'autoSaveInterval')) configureAutoSave();
  if (changed('filesShowAll', 'folders')) renderFiles();
  if (changed('font', 'fontSize', 'width', 'outline', 'outlineSide', 'tabLayout', 'vtabsState', 'vtabsWidth', 'filesPanel', 'filesWidth')) invalidateLayout();
});

darkQuery.addEventListener('change', () => {
  applyPalette();
  refreshDiagrams(state.active);
});

// Nouvelle langue : tout ce qui est affiché est retraduit, sans recharger la fenêtre. Au
// démarrage, init() construit l'interface directement dans la bonne langue.
let started = false;

onLanguageChange(() => {
  if (!started) return;
  translateChrome();
  rebuildKeymap();
  applyAppearance();
  translateDefaultSpace();
  renderTabs();
  updateModeUi();
  applyDocumentsLanguage();
  if (state.active) buildOutline(state.active);
  renderFiles();
  finder.refresh();
});

// --- Barre de titre et évènements globaux ------------------------------------------------------

/** Libellés des boutons de la barre de titre (dans la langue active). */
function translateChrome() {
  els.modeSwitch.querySelector('[data-mode="preview"]').innerHTML = `${icons.bookOpen}<span>${t('mode.preview')}</span>`;
  els.modeSwitch.querySelector('[data-mode="edit"]').innerHTML = `${icons.pencil}<span>${t('mode.edit')}</span>`;
}

function bindChrome() {
  els.brand.innerHTML = brandMark;
  els.filesBtn.innerHTML = icons.folder;
  els.newTab.innerHTML = icons.plus;
  els.split.innerHTML = icons.columns;
  els.outlineBtn.innerHTML = icons.panelLeft;
  els.menuBtn.innerHTML = icons.more;
  translateChrome();
  $('find-icon').innerHTML = icons.search;
  $('find-prev').innerHTML = icons.chevronUp;
  $('find-next').innerHTML = icons.chevronDown;
  $('find-close').innerHTML = icons.x;
  $('drop-icon').innerHTML = icons.upload;

  els.filesBtn.addEventListener('click', () => updateSettings({ filesPanel: !state.settings.filesPanel }));
  els.newTab.addEventListener('click', openDialog);
  els.modeSwitch.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-mode]');
    const doc = state.active;
    if (!button || !doc) return;
    if (button.dataset.mode === 'preview') setMode(doc, 'preview');
    else if (doc.mode === 'preview') setMode(doc, state.settings.editorMode === 'source' ? 'source' : 'split');
  });
  els.split.addEventListener('click', () => {
    const doc = state.active;
    if (!doc) return;
    setMode(doc, doc.mode === 'split' ? 'source' : 'split');
  });
  els.outlineBtn.addEventListener('click', toggleOutline);
  els.themeBtn.addEventListener('click', cycleTheme);
  els.menuBtn.addEventListener('click', showMainMenu);

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener(
    'wheel',
    (e) => {
      if (!primaryModifier(e)) return;
      e.preventDefault();
      changeFontSize(e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  window.addEventListener('resize', debounce(invalidateLayout, 120));
}

function bindDragAndDrop() {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth += 1;
    els.drop.hidden = false;
  }, true);
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, true);
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) els.drop.hidden = true;
  }, true);
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    els.drop.hidden = true;
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    // Un dossier déposé rejoint le panneau Dossiers ; les fichiers s'ouvrent dans des onglets.
    const kinds = await Promise.all(paths.map((p) => api.isDirectory(p)));
    const folders = paths.filter((_, i) => kinds[i]);
    if (folders.length) addFolders(folders);
    for (const p of paths.filter((_, i) => !kinds[i])) await openPath(p);
  }, true);
}

async function onBeforeClose() {
  // Enregistrement automatique actif : les fichiers sont enregistrés sans poser de question.
  if (autoSaveEnabled()) await autoSaveAll();
  for (const doc of [...state.docs]) {
    if (!isDirty(doc)) continue;
    activate(doc);
    const choice = await api.confirmUnsaved(doc.name);
    if (choice === 'cancel') { api.closeCanceled(); return; }
    if (choice === 'save' && !(await saveDoc(doc))) { api.closeCanceled(); return; }
  }
  flushSettings();
  await flushSession();
  api.closeConfirmed();
}

function bindIpc() {
  api.onOpenFiles(async (files) => {
    for (const file of files) await openPath(file);
  });
  api.onFileChanged(onFileChanged);
  api.onBeforeClose(onBeforeClose);
  api.onSelectAll(selectAllDoc);
  api.onFind((text) => openFind(text));
}

// --- Captures d'écran de test (--snap) -----------------------------------------------------------

function simulateKey(combo, target = window) {
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  const key = parts.pop();
  const letter = /^[A-Z]$/.test(key);
  const digit = /^[0-9]$/.test(key);
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: letter ? key.toLowerCase() : key,
      code: letter ? `Key${key}` : digit ? `Digit${key}` : '',
      ctrlKey: parts.includes('Ctrl'),
      altKey: parts.includes('Alt'),
      shiftKey: parts.includes('Shift'),
      metaKey: parts.includes('Meta'),
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function runSnapshot() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (query.has('logtest')) console.warn('Folio : journalisation des avertissements active');
  const patch = {};
  if (query.get('outline')) patch.outline = query.get('outline') === '1';
  if (query.get('font')) patch.font = query.get('font');
  if (query.get('width')) patch.width = query.get('width');
  if (query.get('size')) patch.fontSize = Number(query.get('size'));
  if (query.get('layout')) patch.tabLayout = query.get('layout');
  if (query.get('vtabs')) patch.vtabsState = query.get('vtabs');
  if (query.get('outlineside')) patch.outlineSide = query.get('outlineside');
  if (query.get('colors')) patch.colors = JSON.parse(query.get('colors'));
  if (query.get('shortcuts')) patch.shortcuts = JSON.parse(query.get('shortcuts'));
  if (query.get('autosave')) patch.autoSave = query.get('autosave');
  if (query.get('showall')) patch.filesShowAll = query.get('showall') === '1';
  if (Object.keys(patch).length) updateSettings(patch);
  if (query.get('folders')) {
    addFolders(query.get('folders').split('|'));
    await wait(400);
  }
  if (query.get('expand')) {
    for (const p of query.get('expand').split('|')) {
      els.filesTree.querySelector(`.ft-row[data-path="${CSS.escape(p)}"]`)?.click();
      await wait(250);
    }
  }
  if (query.get('spaces')) {
    const home = state.activeSpaceId;
    for (const def of query.get('spaces').split(',')) {
      const [name, color] = def.split(':');
      createSpace(name, color);
    }
    switchSpace(home);
  }
  const doc = state.active;
  if (doc) {
    const mode = query.get('mode');
    if (mode && mode !== 'preview') await setMode(doc, mode);
    await doc.mermaidPromise;
  }
  await document.fonts.ready;
  await wait(200);
  if (query.get('peek')) els.app.classList.add('vtabs-peek');
  if (doc) {
    if (query.get('type') && doc.editor) doc.editor.view.dispatch({ changes: { from: 0, insert: query.get('type') } });
    if (query.get('clicktask')) {
      for (const index of query.get('clicktask').split(',')) {
        doc.view.article.querySelectorAll('.task-checkbox')[Number(index)]?.click();
        await wait(300);
      }
    }
    if (query.get('anchor')) scrollToAnchor(doc, query.get('anchor'));
    if (query.get('scroll')) {
      doc.view.preview.scrollTop = Number(query.get('scroll'));
      if (doc.editor) doc.editor.scrollToLine(previewTopLine(doc));
    }
    if (query.get('editorscroll') && doc.editor) doc.editor.scrollToLine(Number(query.get('editorscroll')));
    if (query.get('find')) finder.open(query.get('find'));
    if (query.get('copycode')) {
      doc.view.article.querySelectorAll('.code-copy')[Number(query.get('copycode'))]?.click();
      await wait(150);
    }
    if (query.get('editorcopy') && doc.editor) {
      await wait(300);
      doc.view.editorHost.querySelectorAll('.cm-code-copy')[Number(query.get('editorcopy'))]?.click();
      await wait(150);
    }
  }
  const ui = query.get('ui') || '';
  if (ui === 'menu') showMainMenu();
  else if (ui.startsWith('settings')) openSettings(ui.split(':')[1] || 'appearance');
  else if (ui === 'about') openAbout();
  else if (ui === 'spacemenu') showSpaceMenu(state.settings.tabLayout === 'vertical' ? els.vtabsSpace : els.spaceSwitch);
  else if (ui === 'spaceeditor') openSpaceEditor();
  else if (ui === 'tabmenu') {
    const tab = document.querySelector('.tab');
    const r = tab?.getBoundingClientRect();
    tab?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + 12 }));
  } else if (ui.startsWith('filemenu')) {
    const index = Number(ui.split(':')[1] || 0);
    const row = els.filesTree.querySelectorAll('.ft-row[data-path]')[index];
    const r = row?.getBoundingClientRect();
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 12 }));
  } else if (ui.startsWith('newfile')) {
    const index = Number(ui.split(':')[1] || 0);
    els.filesTree.querySelectorAll('.ft-row.is-dir')[index]?.querySelector('.ft-action[data-act="file"]')?.click();
  }
  if (query.get('click')) {
    // Clics successifs sur des éléments (sélecteurs CSS séparés par « | »).
    for (const selector of query.get('click').split('|')) {
      await wait(250);
      document.querySelector(selector)?.click();
    }
    await wait(250);
  }
  if (query.get('record')) {
    await wait(100);
    const [actionId, combo] = query.get('record').split(':');
    const chip = document.querySelector(`.sc-row[data-action="${actionId}"] .sc-chip:not(.locked)`);
    chip?.scrollIntoView({ block: 'center' });
    chip?.click();
    if (combo) simulateKey(combo);
  }
  if (query.get('closemodal')) {
    await wait(150);
    simulateKey('Escape');
  }
  if (query.get('press')) {
    await wait(150);
    for (const combo of query.get('press').split(',')) {
      simulateKey(combo);
      await wait(400);
    }
  }
  if (query.get('presseditor') && state.active?.editor) {
    state.active.editor.focus();
    simulateKey(query.get('presseditor'), state.active.editor.view.contentDOM);
  }
  if (query.get('newspace')) {
    const [name, color] = query.get('newspace').split(':');
    createSpace(name, color);
  }
  if (query.get('togglepanel')) toggleTabsPanel();
  const result = query.get('selftest') ? await runSelfTest(query.get('selftest')) : { checks: [], failures: [] };
  if (query.get('hoveredge')) {
    // Vérifie que le bord gauche de la fenêtre déclenche bien l'ouverture du panneau.
    const hit = document.elementFromPoint(3, Math.round(window.innerHeight / 2));
    console.warn(`Folio : élément au bord gauche = .${[...(hit?.classList || [])].join('.')}`);
    hit?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    els.vtabsSlot.dispatchEvent(new MouseEvent('mouseenter'));
    await wait(400);
  }
  await wait(250 + Number(query.get('delay') || 0));
  api.snapReady(result);
}

// --- Démarrage ---------------------------------------------------------------------------------

async function init() {
  // Première traduction (langue de Chromium) avant même de connaître les réglages : la
  // fenêtre n'affiche jamais de libellés vides.
  setLanguage('auto', navigator.languages);
  bindChrome();
  bindTabs();
  bindFiles();
  bindOutline();
  bindDocumentClicks();
  bindDragAndDrop();
  bindIpc();
  bindAutoSave();

  const info = await api.ready();
  state.info = info;
  document.documentElement.dataset.platform = platform;
  state.settings = info.settings;
  if (SNAP && query.get('lang')) state.settings = { ...state.settings, language: query.get('lang') };
  setLanguage(state.settings.language, info.systemLanguages);
  translateChrome();
  resetRenderer();
  applyAppearance();
  restoreSession();
  rebuildKeymap();
  restoreFiles();
  configureAutoSave();

  if (info.files.length) {
    // Ouverture directe d'un fichier (double-clic) : pas d'écran d'accueil intermédiaire.
    els.welcome.hidden = true;
    updateModeUi();
    for (const file of info.files) await openPath(file);
    if (!state.active) switchSpace(state.activeSpaceId);
  } else {
    switchSpace(state.activeSpaceId);
  }
  renderTabs();
  started = true;
  if (SNAP) runSnapshot().catch((error) => api.snapReady({ checks: [], failures: [String(error.stack || error)] }));
}

init().catch((error) => {
  console.error(error);
  if (SNAP) api.snapReady({ checks: [], failures: [String(error.stack || error)] });
});
