// Onglets (horizontaux ou verticaux), espaces de travail et session.
//
// Un espace regroupe des onglets sous un nom et une couleur (« Travail », « Perso »…).
// Seuls les onglets de l'espace actif sont affichés. Les espaces et leurs onglets sont
// retrouvés au démarrage suivant (les fichiers ne sont lus qu'à leur première ouverture).
import { state, els, api, storeSettings, updateSettings, SNAP } from './context.js';
import { clampTabsWidth } from './appearance.js';
import { toast, openMenu, isMenuOpen, menuAnchoredIn, openModal, confirmModal } from './ui.js';
import { icons } from './icons.js';
import { h, debounce, samePath } from './util.js';
import { activate, closeDoc, closeDocs, createDoc, isDirty, openDialog, newDoc } from './documents.js';
import { copyPath } from './navigation.js';
import { refreshWelcome } from './welcome.js';
import { shortcutLabel } from './commands.js';
import { openFolderDialog } from './files.js';
import { t } from './i18n.js';

// Couleurs proposées pour les espaces (nom traduit : clé « color.<id> »).
export const SPACE_COLORS = [
  { id: 'terracotta', value: '#c96442' },
  { id: 'amber', value: '#d49a2a' },
  { id: 'green', value: '#3f9a63' },
  { id: 'teal', value: '#2b9bb3' },
  { id: 'blue', value: '#3b7bdb' },
  { id: 'violet', value: '#8a63d2' },
  { id: 'pink', value: '#d0558e' },
  { id: 'slate', value: '#77736c' },
];

// Tant que l'utilisateur ne l'a pas modifié, l'espace par défaut porte un nom traduit.
const DEFAULT_SPACE = { id: 'principal', color: '#c96442' };

// --- Espaces ---------------------------------------------------------------------------

export function getSpace(id) {
  return state.spaces.find((s) => s.id === id) || null;
}

export function activeSpace() {
  return getSpace(state.activeSpaceId) || state.spaces[0];
}

export function docsInSpace(id = state.activeSpaceId) {
  return state.docs.filter((d) => d.spaceId === id);
}

function newSpaceId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v));

const spaceListeners = new Set();

/** fn() est appelée quand la liste des espaces ou l'espace actif change. */
export function onSpacesChanged(fn) {
  spaceListeners.add(fn);
  return () => spaceListeners.delete(fn);
}

function notifySpaces() {
  for (const fn of spaceListeners) fn();
}

function persistSpaces() {
  storeSettings({ spaces: state.spaces.map(({ id, name, color }) => ({ id, name, color })) });
  notifySpaces();
}

/** Recrée les espaces et (si demandé) les onglets de la session précédente. */
export function restoreSession() {
  const defs = Array.isArray(state.settings.spaces) ? state.settings.spaces.filter((s) => s && s.id && s.name) : [];
  state.spaces = (defs.length ? defs : [{ ...DEFAULT_SPACE, name: t('spaces.default') }]).map((s) => ({
    id: String(s.id),
    name: String(s.name).slice(0, 40),
    color: isHex(s.color) ? s.color : DEFAULT_SPACE.color,
    lastActiveId: null,
  }));
  const session = state.settings.session || {};
  state.activeSpaceId = getSpace(session.activeSpaceId) ? session.activeSpaceId : state.spaces[0].id;

  if (state.settings.restoreSession === false || !session.tabs) return;
  for (const space of state.spaces) {
    const entry = session.tabs[space.id];
    if (!entry || !Array.isArray(entry.files)) continue;
    for (const path of entry.files) {
      if (typeof path !== 'string' || state.docs.some((d) => samePath(d.path, path))) continue;
      const doc = createDoc({ path, spaceId: space.id, loaded: false });
      if (entry.active && samePath(entry.active, path)) space.lastActiveId = doc.id;
    }
  }
}

/** Changement de langue : l'espace par défaut jamais renommé suit la langue. */
export function translateDefaultSpace() {
  const stored = Array.isArray(state.settings.spaces) && state.settings.spaces.length;
  const space = getSpace(DEFAULT_SPACE.id);
  if (!stored && space) space.name = t('spaces.default');
}

function serializeSession() {
  const tabs = {};
  for (const space of state.spaces) {
    const docs = docsInSpace(space.id).filter((d) => d.path);
    const active = docs.find((d) => d.id === space.lastActiveId);
    tabs[space.id] = { files: docs.map((d) => d.path), active: active ? active.path : null };
  }
  return { activeSpaceId: state.activeSpaceId, tabs };
}

const saveSession = debounce(() => {
  if (!SNAP) storeSettings({ session: serializeSession() });
}, 500);

export function scheduleSessionSave() {
  saveSession();
}

export function flushSession() {
  saveSession.cancel();
  if (!SNAP) return storeSettings({ session: serializeSession() });
  return Promise.resolve();
}

export function switchSpace(id, { activateDoc = null } = {}) {
  const space = getSpace(id);
  if (!space) return;
  if (state.activeSpaceId !== id) {
    if (state.active) {
      state.active.view.root.hidden = true;
      state.active = null;
    }
    state.activeSpaceId = id;
  }
  const docs = docsInSpace(id);
  const target = activateDoc || docs.find((d) => d.id === space.lastActiveId) || docs[0] || null;
  activate(target);
  if (!target) refreshWelcome();
  renderTabs();
  scheduleSessionSave();
  notifySpaces();
}

export function cycleSpace(direction) {
  if (state.spaces.length < 2) return;
  const i = state.spaces.findIndex((s) => s.id === state.activeSpaceId);
  const next = state.spaces[(i + direction + state.spaces.length) % state.spaces.length];
  switchSpace(next.id);
  toast(t('spaces.toast', { name: next.name }), { duration: 1100 });
}

export function createSpace(name, color, { moveDoc = null } = {}) {
  const space = { id: newSpaceId(), name, color, lastActiveId: null };
  state.spaces.push(space);
  persistSpaces();
  if (moveDoc) moveDocToSpace(moveDoc, space.id, { follow: true });
  else switchSpace(space.id);
  return space;
}

export async function deleteSpace(space) {
  if (!space || state.spaces.length < 2) return;
  const docs = docsInSpace(space.id);
  const ok = await confirmModal({
    title: t('spaces.deleteTitle', { name: space.name }),
    message: docs.length ? t('spaces.deleteTabs', { count: docs.length }) : t('spaces.deleteEmpty'),
    confirm: t('common.delete'),
    danger: true,
  });
  if (!ok) return;
  if (state.activeSpaceId !== space.id) switchSpace(space.id);
  if (!(await closeDocs(docsInSpace(space.id)))) return;
  state.spaces = state.spaces.filter((s) => s !== space);
  persistSpaces();
  switchSpace(state.spaces[0].id);
}

export function moveDocToSpace(doc, spaceId, { follow = false } = {}) {
  const target = getSpace(spaceId);
  if (!target || doc.spaceId === spaceId) return;
  const wasActive = state.active === doc;
  const siblings = docsInSpace(doc.spaceId).filter((d) => d !== doc);
  doc.spaceId = spaceId;
  target.lastActiveId = doc.id;
  if (follow) {
    switchSpace(spaceId, { activateDoc: doc });
    return;
  }
  if (wasActive) {
    doc.view.root.hidden = true;
    state.active = null;
    activate(siblings[0] || null);
  }
  renderTabs();
  scheduleSessionSave();
  toast(t('spaces.moved', { name: doc.name, space: target.name }), {
    action: { label: t('spaces.goThere'), run: () => switchSpace(spaceId, { activateDoc: doc }) },
  });
}

// --- Fenêtre « Nouvel espace » / « Modifier l'espace » -----------------------------------------

export function openSpaceEditor(space = null, { moveDoc = null } = {}) {
  const isNew = !space;
  let color = space ? space.color : SPACE_COLORS[state.spaces.length % SPACE_COLORS.length].value;
  const nameInput = h('input', {
    class: 'text-input',
    type: 'text',
    maxlength: '40',
    value: space ? space.name : t('spaces.newName', { n: state.spaces.length + 1 }),
    placeholder: t('spaces.namePlaceholder'),
    'data-autofocus': true,
  });
  const preview = h('span', { class: 'space-preview-dot' });
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('spaces.color') });
  const custom = h('input', { type: 'color', value: color, title: t('spaces.customColor') });

  const paint = () => {
    preview.style.background = color;
    for (const sw of swatches.querySelectorAll('.swatch[data-color]')) {
      const on = sw.dataset.color.toLowerCase() === color.toLowerCase();
      sw.classList.toggle('active', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    const isPreset = SPACE_COLORS.some((c) => c.value.toLowerCase() === color.toLowerCase());
    customLabel.classList.toggle('active', !isPreset);
    customLabel.style.setProperty('--swatch', isPreset ? 'transparent' : color);
  };
  for (const c of SPACE_COLORS) {
    swatches.append(
      h('button', {
        type: 'button',
        class: 'swatch',
        role: 'radio',
        title: t(`color.${c.id}`),
        dataset: { color: c.value },
        style: { '--swatch': c.value },
        onClick: () => {
          color = c.value;
          paint();
        },
      }),
    );
  }
  const customLabel = h('label', { class: 'swatch swatch-custom', title: t('spaces.customColor') }, custom, h('span', { html: icons.plus }));
  custom.addEventListener('input', () => {
    color = custom.value;
    paint();
  });
  swatches.append(customLabel);

  let modal = null;
  const save = () => {
    const name = nameInput.value.trim() || t('spaces.unnamed');
    modal.close();
    if (isNew) {
      createSpace(name, color, { moveDoc });
    } else {
      space.name = name;
      space.color = color;
      persistSpaces();
      renderTabs();
      if (!state.active) refreshWelcome();
    }
  };
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });

  const footer = h(
    'div',
    { class: 'confirm-actions space-editor-actions' },
    !isNew && state.spaces.length > 1
      ? h('button', { class: 'btn btn-ghost btn-danger-text', type: 'button', onClick: () => { modal.close(); deleteSpace(space); } }, t('spaces.delete'))
      : null,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onClick: () => modal.close() }, t('common.cancel')),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: save }, isNew ? t('spaces.create') : t('common.save')),
  );
  const content = h(
    'div',
    { class: 'space-editor' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('spaces.name')), h('span', { class: 'field-row' }, preview, nameInput)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('spaces.color')), swatches),
    footer,
  );
  modal = openModal({ title: isNew ? t('spaces.new') : t('spaces.editTitle'), content, width: 460 });
  paint();
}

// --- Menus --------------------------------------------------------------------------------

const dot = (color) => `<span class="menu-dot" style="background:${color}"></span>`;

export function showSpaceMenu(anchor) {
  const space = activeSpace();
  const items = [{ header: t('spaces.title') }];
  for (const s of state.spaces) {
    const count = docsInSpace(s.id).length;
    items.push({
      label: s.name,
      icon: dot(s.color),
      shortcut: count ? String(count) : '',
      checked: s.id === state.activeSpaceId,
      run: () => switchSpace(s.id),
    });
  }
  items.push(
    'separator',
    { label: t('spaces.newEllipsis'), icon: icons.plus, shortcut: shortcutLabel('newSpace'), run: () => openSpaceEditor() },
    { label: t('spaces.editNamed', { name: space.name }), icon: icons.pencil, run: () => openSpaceEditor(space) },
  );
  if (state.spaces.length > 1) items.push({ label: t('spaces.deleteThis'), icon: icons.trash, danger: true, run: () => deleteSpace(space) });
  openPanelMenu(anchor, items);
}

// Un menu ouvert depuis le panneau vertical le garde ouvert (même s'il dépasse du panneau).
let panelMenuOpen = false;

function openPanelMenu(anchor, items) {
  openMenu(anchor, items, {
    onClose: () => {
      panelMenuOpen = false;
      endPeekIfIdle();
    },
  });
  panelMenuOpen = isMenuOpen();
}

function showTabMenu(doc, point) {
  const siblings = docsInSpace(doc.spaceId);
  const items = [
    { label: t('common.close'), icon: icons.x, shortcut: shortcutLabel('closeTab'), run: () => closeDoc(doc) },
    {
      label: t('tabs.closeOthers'),
      disabled: siblings.length < 2,
      run: () => closeDocs(siblings.filter((d) => d !== doc)),
    },
  ];
  const others = state.spaces.filter((s) => s.id !== doc.spaceId);
  items.push('separator', { header: t('tabs.moveToSpace') });
  for (const s of others) items.push({ label: s.name, icon: dot(s.color), run: () => moveDocToSpace(doc, s.id) });
  items.push({ label: t('spaces.newEllipsis'), icon: icons.plus, run: () => openSpaceEditor(null, { moveDoc: doc }) });
  if (doc.path) {
    items.push(
      'separator',
      { label: t('common.copyPath'), icon: icons.link, run: () => copyPath(doc) },
      { label: t('common.showInExplorer'), icon: icons.folder, run: () => api.showInFolder(doc.path) },
    );
  }
  openPanelMenu(point, items);
}

// --- Rendu des onglets ----------------------------------------------------------------------

function tabElement(doc) {
  const classes = ['tab'];
  if (doc === state.active) classes.push('active');
  if (isDirty(doc)) classes.push('dirty');
  if (doc.missing || doc.loadError) classes.push('missing');
  return h(
    'div',
    {
      class: classes.join(' '),
      role: 'tab',
      'aria-selected': doc === state.active ? 'true' : 'false',
      title: doc.path || t('tabs.notSaved', { name: doc.name }),
      draggable: 'true',
      dataset: { id: String(doc.id) },
    },
    h('span', { class: 'tab-icon', html: `${icons.fileText}<span class="tab-badge"></span>` }),
    h('span', { class: 'tab-name' }, doc.name),
    h('button', {
      class: 'tab-close',
      type: 'button',
      tabindex: '-1',
      title: t('tabs.closeHint', { key: shortcutLabel('closeTab') || t('tabs.middleClick') }),
      'aria-label': t('tabs.closeNamed', { name: doc.name }),
      html: `${icons.x}<span class="tab-dot"></span>`,
    }),
  );
}

export function renderTabs() {
  const vertical = state.settings.tabLayout === 'vertical';
  const docs = docsInSpace();
  const list = vertical ? els.vtabsList : els.tabs;
  (vertical ? els.tabs : els.vtabsList).replaceChildren();
  list.replaceChildren(...docs.map(tabElement));
  if (vertical && !docs.length) list.append(h('div', { class: 'vtabs-empty' }, t('tabs.emptySpace')));
  list.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  renderSpaces();
  updateTitle();
}

function renderSpaces() {
  const space = activeSpace();
  els.app.style.setProperty('--space-color', space.color);

  // Barre de titre (onglets horizontaux) : sélecteur visible dès qu'il y a plusieurs espaces.
  els.spaceSwitch.hidden = state.spaces.length < 2;
  els.spaceSwitch.replaceChildren(
    h('span', { class: 'space-dot' }),
    h('span', { class: 'space-name' }, space.name),
    h('span', { class: 'space-chevron', html: icons.chevronDown }),
  );
  els.spaceSwitch.title = t('spaces.switchTitle', { name: space.name });

  // Panneau vertical : en-tête et pastilles.
  els.vtabsSpace.replaceChildren(
    h('span', { class: 'space-dot' }),
    h('span', { class: 'space-name' }, space.name),
    h('span', { class: 'space-chevron', html: icons.chevronDown }),
  );
  els.vtabsSpace.title = t('spaces.named', { name: space.name });
  els.vtabsSpaces.replaceChildren(
    ...state.spaces.map((s) =>
      h(
        'button',
        {
          type: 'button',
          class: `space-chip${s.id === state.activeSpaceId ? ' active' : ''}`,
          title: `${s.name} (${t('tabs.count', { count: docsInSpace(s.id).length })})`,
          style: { '--chip': s.color },
          dataset: { space: s.id },
        },
        (s.name.trim()[0] || '?').toUpperCase(),
      )),
    h('button', { type: 'button', class: 'space-chip add', title: t('spaces.new'), dataset: { action: 'new-space' }, html: icons.plus }),
  );
}

export function updateTitle() {
  const doc = state.active;
  const dirty = doc && isDirty(doc);
  document.title = doc ? `${dirty ? '● ' : ''}${doc.name} — Folio` : 'Folio';
  els.title.replaceChildren(
    ...[
      h('span', { class: 'space-dot' }),
      h('span', { class: 'title-name' }, doc ? doc.name : activeSpace().name),
      dirty ? h('span', { class: 'title-dirty', title: t('doc.unsavedChanges') }) : null,
    ].filter(Boolean),
  );
}

export function cycleTab(direction) {
  const docs = docsInSpace();
  if (docs.length < 2) return;
  const i = docs.indexOf(state.active);
  activate(docs[(i + direction + docs.length) % docs.length]);
}

export function goToTab(n) {
  const docs = docsInSpace();
  const doc = n === 9 ? docs[docs.length - 1] : docs[n - 1];
  if (doc) activate(doc);
}

// --- Disposition et panneau vertical --------------------------------------------------------

export function toggleTabLayout() {
  const vertical = state.settings.tabLayout !== 'vertical';
  updateSettings({ tabLayout: vertical ? 'vertical' : 'horizontal' });
  toast(vertical ? t('tabs.verticalOn') : t('tabs.horizontalOn'), { duration: 1200 });
}

/** Change l'état du panneau en retenant le dernier état visible (pour le réafficher ensuite). */
export function setTabsPanelState(value, extra = {}) {
  const current = state.settings.vtabsState;
  const visible = value !== 'hidden' ? value : current === 'collapsed' || current === 'expanded' ? current : state.settings.vtabsVisibleState || 'expanded';
  updateSettings({ vtabsState: value, vtabsVisibleState: visible, ...extra });
}

/** Déplié ↔ réduit (et masqué → déplié). Active la disposition verticale si besoin. */
export function toggleTabsPanel() {
  if (state.settings.tabLayout !== 'vertical') {
    updateSettings({ tabLayout: 'vertical', vtabsState: 'expanded' });
    return;
  }
  setTabsPanelState(state.settings.vtabsState === 'expanded' ? 'collapsed' : 'expanded');
  els.app.classList.remove('vtabs-peek');
}

/** Masque complètement le panneau (il réapparaît au bord gauche de la fenêtre). */
export function hideTabsPanel() {
  if (state.settings.tabLayout !== 'vertical' || state.settings.vtabsState === 'hidden') return;
  clearTimeout(peekTimer);
  els.app.classList.remove('vtabs-peek');
  setTabsPanelState('hidden');
  const key = shortcutLabel('toggleTabsHidden');
  toast(key ? t('tabs.hiddenToastKey', { key }) : t('tabs.hiddenToast'), {
    duration: 5000,
    action: { label: t('common.undo'), run: showTabsPanel },
  });
}

/** Réaffiche le panneau dans son état précédent (déplié ou réduit). */
export function showTabsPanel() {
  if (state.settings.tabLayout !== 'vertical') return;
  clearTimeout(peekTimer);
  els.app.classList.remove('vtabs-peek');
  setTabsPanelState(state.settings.vtabsVisibleState === 'collapsed' ? 'collapsed' : 'expanded');
}

export function toggleTabsHidden() {
  if (state.settings.tabLayout !== 'vertical') {
    toast(t('tabs.verticalDisabled'), {
      action: { label: t('common.enable'), run: () => updateSettings({ tabLayout: 'vertical', vtabsState: 'expanded' }) },
    });
    return;
  }
  if (state.settings.vtabsState === 'hidden') showTabsPanel();
  else hideTabsPanel();
}

let peekTimer = null;

function canPeek() {
  return state.settings.tabLayout === 'vertical' && state.settings.vtabsState !== 'expanded';
}

function startPeek() {
  clearTimeout(peekTimer);
  if (!canPeek() || els.app.classList.contains('vtabs-peek')) return;
  peekTimer = setTimeout(() => els.app.classList.add('vtabs-peek'), 140);
}

function endPeek() {
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => {
    if (panelMenuOpen || menuAnchoredIn(els.vtabsSlot) || dragId != null) return;
    els.app.classList.remove('vtabs-peek');
  }, 320);
}

function endPeekIfIdle() {
  if (!els.vtabsSlot.matches(':hover')) endPeek();
}

function updatePinButton() {
  const expanded = state.settings.vtabsState === 'expanded';
  els.vtabsPin.innerHTML = expanded ? icons.panelCollapse : icons.panelExpand;
  els.vtabsPin.title = expanded ? t('tabs.collapsePanel') : t('tabs.keepPanelOpen');
  const label = shortcutLabel('toggleTabsPanel');
  if (label) els.vtabsPin.title += ` — ${label}`;

  const hideKey = shortcutLabel('toggleTabsHidden');
  els.vtabsHide.innerHTML = icons.eyeOff;
  els.vtabsHide.title = `${t('tabs.hideHint')}${hideKey ? ` — ${hideKey}` : ''}`;
}

export function refreshTabsChrome() {
  updatePinButton();
  const action = (id, icon, label) => {
    const key = shortcutLabel(id);
    return h(
      'button',
      { type: 'button', class: 'vtab-action', dataset: { action: id }, title: key ? `${label} (${key})` : label },
      h('span', { class: 'tab-icon', html: icon }),
      h('span', { class: 'tab-name' }, label),
      key ? h('kbd', {}, key) : null,
    );
  };
  els.vtabsActions.replaceChildren(
    action('open', icons.plus, t('action.open')),
    action('openFolder', icons.folderOpen, t('action.openFolder')),
    action('new', icons.filePlus, t('action.new')),
  );
}

// --- Évènements ------------------------------------------------------------------------------

let dragId = null;

function docFromEvent(target) {
  const tab = target instanceof Element ? target.closest('.tab') : null;
  return tab ? state.docs.find((d) => d.id === Number(tab.dataset.id)) || null : null;
}

function bindTabList(list, vertical) {
  list.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.tab-close')) return;
    const doc = docFromEvent(e.target);
    if (doc) activate(doc);
  });
  list.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-close')) return;
    const doc = docFromEvent(e.target);
    if (doc) closeDoc(doc);
  });
  list.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const doc = docFromEvent(e.target);
    if (doc) closeDoc(doc);
  });
  list.addEventListener('contextmenu', (e) => {
    const doc = docFromEvent(e.target);
    if (!doc) return;
    e.preventDefault();
    showTabMenu(doc, { x: e.clientX, y: e.clientY });
  });

  // Réorganisation par glisser-déposer (et déplacement vers un espace).
  list.addEventListener('dragstart', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    dragId = Number(tab.dataset.id);
    tab.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-folio-tab', tab.dataset.id);
  });
  list.addEventListener('dragover', (e) => {
    const dragging = list.querySelector('.tab.dragging');
    if (!dragging) return;
    e.preventDefault();
    const over = e.target.closest('.tab');
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    const after = vertical ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2;
    list.insertBefore(dragging, after ? over.nextSibling : over);
  });
  list.addEventListener('dragend', () => {
    dragId = null;
    const dragging = list.querySelector('.tab.dragging');
    if (!dragging) return;
    dragging.classList.remove('dragging');
    const order = [...list.querySelectorAll('.tab')].map((t) => Number(t.dataset.id));
    const ordered = order.map((id) => state.docs.find((d) => d.id === id)).filter((d) => d && d.spaceId === state.activeSpaceId);
    let k = 0;
    state.docs = state.docs.map((d) => (d.spaceId === state.activeSpaceId && k < ordered.length ? ordered[k++] : d));
    renderTabs();
    scheduleSessionSave();
  });
  list.addEventListener('animationend', (e) => e.target.classList?.remove('pulse'));
}

export function bindTabs() {
  bindTabList(els.tabs, false);
  bindTabList(els.vtabsList, true);

  els.spaceSwitch.addEventListener('click', () => showSpaceMenu(els.spaceSwitch));
  els.vtabsSpace.addEventListener('click', () => showSpaceMenu(els.vtabsSpace));
  els.vtabsPin.addEventListener('click', () => {
    toggleTabsPanel();
    updatePinButton();
  });
  els.vtabsHide.addEventListener('click', hideTabsPanel);
  els.vtabsActions.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'open') openDialog();
    else if (action === 'openFolder') openFolderDialog();
    else if (action === 'new') newDoc();
  });

  // Pastilles des espaces : clic pour changer, clic droit pour modifier, dépôt d'un onglet pour le déplacer.
  els.vtabsSpaces.addEventListener('click', (e) => {
    const chip = e.target.closest('.space-chip');
    if (!chip) return;
    if (chip.dataset.action === 'new-space') openSpaceEditor();
    else switchSpace(chip.dataset.space);
  });
  els.vtabsSpaces.addEventListener('contextmenu', (e) => {
    const chip = e.target.closest('.space-chip[data-space]');
    if (!chip) return;
    e.preventDefault();
    const space = getSpace(chip.dataset.space);
    if (space) openSpaceEditor(space);
  });
  els.vtabsSpaces.addEventListener('dragover', (e) => {
    const chip = e.target.closest('.space-chip[data-space]');
    if (!chip || dragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    chip.classList.add('drop-target');
  });
  els.vtabsSpaces.addEventListener('dragleave', (e) => {
    e.target.closest?.('.space-chip')?.classList.remove('drop-target');
  });
  els.vtabsSpaces.addEventListener('drop', (e) => {
    const chip = e.target.closest('.space-chip[data-space]');
    if (!chip || dragId == null) return;
    e.preventDefault();
    const doc = state.docs.find((d) => d.id === dragId);
    dragId = null;
    if (doc) moveDocToSpace(doc, chip.dataset.space);
  });

  // Ouverture au survol (panneau réduit ou masqué).
  els.vtabsSlot.addEventListener('mouseenter', startPeek);
  els.vtabsSlot.addEventListener('mouseleave', endPeek);

  // Redimensionnement du panneau déplié.
  els.vtabsResize.addEventListener('pointerdown', (e) => {
    if (state.settings.vtabsState !== 'expanded') return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = els.vtabs.getBoundingClientRect().width;
    els.vtabsResize.setPointerCapture(e.pointerId);
    els.app.classList.add('resizing');
    const onMove = (ev) => {
      const width = clampTabsWidth(startWidth + ev.clientX - startX);
      document.documentElement.style.setProperty('--vtabs-width', `${width}px`);
    };
    const onUp = (ev) => {
      els.vtabsResize.removeEventListener('pointermove', onMove);
      els.vtabsResize.removeEventListener('pointerup', onUp);
      els.app.classList.remove('resizing');
      updateSettings({ vtabsWidth: clampTabsWidth(startWidth + ev.clientX - startX) });
    };
    els.vtabsResize.addEventListener('pointermove', onMove);
    els.vtabsResize.addEventListener('pointerup', onUp);
  });
  els.vtabsResize.addEventListener('dblclick', () => updateSettings({ vtabsWidth: 248 }));
}
