// Commandes : exécution des actions, raccourcis clavier personnalisables et menu principal.
import { ACTION_BY_ID, buildKeymap, effectiveBindings, comboFromEvent, formatCombo } from './shortcuts.js';
import { state, els, api, updateSettings } from './context.js';
import { THEME_CYCLE, themeLabel } from './appearance.js';
import { toast, openMenu, closeMenu, closeTopModal, hasOpenModal } from './ui.js';
import { icons } from './icons.js';
import { countWords, formatNumber } from './util.js';
import { t } from './i18n.js';
import { primaryModifier } from './platform.js';
import {
  openDialog,
  newDoc,
  saveDoc,
  reloadDoc,
  closeDoc,
  reopenClosed,
  toggleEditMode,
  toggleSplit,
  changeFontSize,
  syncFromEditor,
} from './documents.js';
import { finder, openFind, exportPdf, printDoc, copyMarkdown, copyPath, selectAllDoc, scheduleOutlineActive } from './navigation.js';
import {
  cycleTab,
  goToTab,
  toggleTabLayout,
  toggleTabsPanel,
  toggleTabsHidden,
  cycleSpace,
  openSpaceEditor,
  refreshTabsChrome,
} from './tabs.js';
import { openFolderDialog, toggleFilesPanel, handleFilesKey } from './files.js';
import { openSettings, openAbout, recorder } from './settings-ui.js';
import { refreshWelcome } from './welcome.js';

let keymap = new Map();

export function shortcutLabel(actionId) {
  const keys = effectiveBindings(state.settings && state.settings.shortcuts)[actionId] || [];
  return keys.length ? formatCombo(keys[0]) : '';
}

const withKey = (label, actionId) => {
  const key = shortcutLabel(actionId);
  return key ? `${label} (${key})` : label;
};

/** Met à jour la table des raccourcis et toutes les infobulles qui les affichent (aussi après un changement de langue). */
export function rebuildKeymap() {
  keymap = buildKeymap(state.settings.shortcuts);
  els.modeSwitch.querySelector('[data-mode="preview"]').title = withKey(t('mode.preview'), 'toggleEdit');
  els.modeSwitch.querySelector('[data-mode="edit"]').title = withKey(t('mode.edit'), 'toggleEdit');
  els.split.title = withKey(t('action.toggleSplit'), 'toggleSplit');
  els.outlineBtn.title = withKey(t('outline.title'), 'toggleOutline');
  els.filesBtn.title = withKey(t('files.title'), 'toggleFiles');
  els.newTab.title = withKey(t('action.open'), 'open');
  els.filesAdd.title = withKey(t('action.openFolder'), 'openFolder');
  els.filesAdd.setAttribute('aria-label', t('action.openFolder'));
  refreshTabsChrome();
  if (!state.active) refreshWelcome();
}

export function cycleTheme() {
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(state.settings.theme) + 1) % THEME_CYCLE.length];
  updateSettings({ theme: next });
  toast(t('theme.toast', { name: themeLabel(next) }), { duration: 1300 });
}

export function toggleOutline() {
  updateSettings({ outline: !state.settings.outline });
  if (state.active) {
    state.active.outlineActive = undefined;
    scheduleOutlineActive();
  }
}

const editorCommand = (name) => ({ doc }) => doc.editor.runCommand(name);

const HANDLERS = {
  open: () => openDialog(),
  openFolder: () => openFolderDialog(),
  new: () => newDoc(),
  save: () => saveDoc(state.active),
  saveAs: () => saveDoc(state.active, { saveAs: true }),
  reload: () => reloadDoc(state.active),
  closeTab: () => closeDoc(state.active),
  reopenTab: () => reopenClosed(),
  nextTab: () => cycleTab(1),
  prevTab: () => cycleTab(-1),
  toggleTabLayout: () => toggleTabLayout(),
  toggleTabsPanel: () => toggleTabsPanel(),
  toggleTabsHidden: () => toggleTabsHidden(),
  nextSpace: () => cycleSpace(1),
  prevSpace: () => cycleSpace(-1),
  newSpace: () => openSpaceEditor(),
  toggleEdit: () => toggleEditMode(),
  toggleSplit: () => toggleSplit(),
  toggleOutline: () => toggleOutline(),
  toggleFiles: () => toggleFilesPanel(),
  find: () => openFind(),
  findNext: () => (finder.isOpen ? finder.step(1) : openFind()),
  findPrev: () => (finder.isOpen ? finder.step(-1) : openFind()),
  zoomIn: () => changeFontSize(1),
  zoomOut: () => changeFontSize(-1),
  zoomReset: () => changeFontSize(0),
  toggleTheme: () => cycleTheme(),
  fullscreen: () => api.toggleFullscreen(),
  settings: () => openSettings(),
  shortcuts: () => openSettings('shortcuts'),
  bold: editorCommand('bold'),
  italic: editorCommand('italic'),
  strike: editorCommand('strike'),
  inlineCode: editorCommand('code'),
  link: editorCommand('link'),
  replace: editorCommand('replace'),
  exportPdf: () => exportPdf(),
  print: () => printDoc(),
};

export function runAction(id) {
  const handler = HANDLERS[id];
  if (handler) handler({ doc: state.active });
}

export function onKeyDown(e) {
  if (recorder.active) {
    recorder.handle(e);
    return;
  }
  const doc = state.active;
  const target = e.target instanceof Element ? e.target : null;
  const inEditor = Boolean(target && target.closest('.cm-editor'));
  const inField = Boolean(target && target.closest('input, textarea, select')) && !inEditor;

  if (e.key === 'Escape') {
    if (closeMenu({ restoreFocus: true }) || closeTopModal()) {
      e.preventDefault();
      return;
    }
    if (finder.isOpen) {
      e.preventDefault();
      finder.close();
      return;
    }
    els.app.classList.remove('vtabs-peek');
    return;
  }
  if (e.key === 'F12' && !state.info?.packaged) {
    api.toggleDevTools();
    return;
  }

  const combo = comboFromEvent(e);
  if (!combo) return;
  const modalOpen = hasOpenModal();
  const actionId = keymap.get(combo);

  // Navigation au clavier dans le panneau Dossiers (flèches, Entrée, F2, Suppr).
  if (!modalOpen && !inField && handleFilesKey(e, combo)) return;

  if (actionId && !modalOpen) {
    const action = ACTION_BY_ID[actionId];
    if (action.scope === 'editor' && !(inEditor && doc && doc.editor)) return;
    // Dans l'éditeur, F3 / Maj+F3 parcourent les résultats de sa propre recherche.
    if ((actionId === 'findNext' || actionId === 'findPrev') && inEditor) return;
    e.preventDefault();
    e.stopPropagation();
    HANDLERS[actionId]({ doc, inEditor, inField });
    return;
  }
  if (modalOpen) return;

  // Raccourcis fixes.
  if (primaryModifier(e) && !e.altKey && !e.shiftKey && !(e.ctrlKey && e.metaKey) && /^(?:Digit|Numpad)[1-9]$/.test(e.code)) {
    e.preventDefault();
    goToTab(Number(e.code.slice(-1)));
    return;
  }
  if (primaryModifier(e) && !e.altKey && !e.shiftKey && !(e.ctrlKey && e.metaKey) && e.key.toLowerCase() === 'a' && !inEditor && !inField) {
    e.preventDefault();
    selectAllDoc();
    return;
  }
  if (combo === 'Ctrl+Shift+I' && !state.info?.packaged) {
    e.preventDefault();
    api.toggleDevTools();
  }
}

export function showMainMenu() {
  const doc = state.active;
  const items = [];
  if (doc && doc.loaded) {
    syncFromEditor(doc);
    const words = countWords(doc.content);
    const minutes = Math.max(1, Math.round(words / 230));
    items.push(
      { header: `${t('menu.words', { count: words, n: formatNumber(words) })} · ${t('menu.readingTime', { count: minutes })}` },
      'separator',
    );
  }
  const k = shortcutLabel;
  items.push(
    { label: t('action.new'), icon: icons.filePlus, shortcut: k('new'), run: newDoc },
    { label: t('menu.openEllipsis'), icon: icons.fileText, shortcut: k('open'), run: openDialog },
    { label: t('menu.openFolderEllipsis'), icon: icons.folderOpen, shortcut: k('openFolder'), run: openFolderDialog },
    { label: t('action.save'), icon: icons.save, shortcut: k('save'), disabled: !doc, run: () => saveDoc(state.active) },
    { label: t('menu.saveAsEllipsis'), shortcut: k('saveAs'), disabled: !doc, run: () => saveDoc(state.active, { saveAs: true }) },
    'separator',
    { label: t('menu.exportPdfEllipsis'), icon: icons.fileDown, shortcut: k('exportPdf'), disabled: !doc, run: exportPdf },
    { label: t('menu.printEllipsis'), icon: icons.printer, shortcut: k('print'), disabled: !doc, run: printDoc },
    'separator',
    {
      label: t('files.title'),
      icon: icons.folder,
      shortcut: k('toggleFiles'),
      checked: Boolean(state.settings.filesPanel),
      run: toggleFilesPanel,
    },
    {
      label: t('menu.verticalTabs'),
      icon: icons.panelLeft,
      shortcut: k('toggleTabLayout'),
      checked: state.settings.tabLayout === 'vertical',
      run: toggleTabLayout,
    },
    state.settings.tabLayout === 'vertical'
      ? {
          label: state.settings.vtabsState === 'hidden' ? t('menu.showTabs') : t('menu.hideTabs'),
          icon: state.settings.vtabsState === 'hidden' ? icons.eye : icons.eyeOff,
          shortcut: k('toggleTabsHidden'),
          run: toggleTabsHidden,
        }
      : null,
    { label: t('spaces.newEllipsis'), icon: icons.layers, shortcut: k('newSpace'), run: () => openSpaceEditor() },
    'separator',
    { label: t('menu.copyMarkdown'), icon: icons.clipboard, disabled: !doc, run: copyMarkdown },
    { label: t('menu.copyFilePath'), icon: icons.link, disabled: !doc?.path, run: () => copyPath() },
    { label: t('common.showInExplorer'), icon: icons.folder, disabled: !doc?.path, run: () => api.showInFolder(doc.path) },
    { label: t('action.reload'), icon: icons.refresh, shortcut: k('reload'), disabled: !doc?.path, run: () => reloadDoc(state.active) },
    'separator',
    { label: t('action.settings'), icon: icons.settings, shortcut: k('settings'), run: () => openSettings() },
    { label: t('action.shortcuts'), icon: icons.keyboard, shortcut: k('shortcuts'), run: () => openSettings('shortcuts') },
    { label: t('menu.about'), icon: icons.info, run: openAbout },
  );
  openMenu(els.menuBtn, items);
}
