// État partagé de l'interface : documents, espaces, paramètres et éléments de la page.
import { debounce } from './util.js';

export const api = window.folio;
export const query = new URLSearchParams(location.search);
export const SNAP = query.has('snap');
export const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext|mdx|txt|rmd|qmd)$/i;

export const state = {
  info: null,
  settings: null,
  docs: [],
  active: null,
  untitled: 0,
  closed: [],
  spaces: [],
  activeSpaceId: null,
};

export const $ = (id) => document.getElementById(id);

export const els = {
  app: $('app'),
  brand: $('brand'),
  spaceSwitch: $('space-switch'),
  tabs: $('tabs'),
  newTab: $('btn-new-tab'),
  title: $('titlebar-title'),
  docActions: $('doc-actions'),
  modeSwitch: $('mode-switch'),
  split: $('btn-split'),
  outlineBtn: $('btn-outline'),
  themeBtn: $('btn-theme'),
  menuBtn: $('btn-menu'),
  vtabsSlot: $('vtabs-slot'),
  vtabs: $('vtabs'),
  vtabsSpace: $('vtabs-space'),
  vtabsPin: $('vtabs-pin'),
  vtabsHide: $('vtabs-hide'),
  vtabsList: $('vtabs-list'),
  vtabsActions: $('vtabs-actions'),
  vtabsSpaces: $('vtabs-spaces'),
  vtabsResize: $('vtabs-resize'),
  filesBtn: $('btn-files'),
  files: $('files'),
  filesTree: $('files-tree'),
  filesAdd: $('files-add'),
  filesMore: $('files-more'),
  filesResize: $('files-resize'),
  outline: $('outline'),
  outlineList: $('outline-list'),
  views: $('views'),
  welcome: $('welcome'),
  drop: $('drop-overlay'),
};

export const darkQuery = matchMedia('(prefers-color-scheme: dark)');
export const currentMode = () => (darkQuery.matches ? 'dark' : 'light');

// --- Paramètres ------------------------------------------------------------------

const listeners = new Set();

/** fn(patch, previous) est appelée à chaque modification des paramètres. */
export function onSettingsChange(fn) {
  listeners.add(fn);
}

const pending = {};
const persistSoon = debounce(() => {
  const patch = { ...pending };
  for (const key of Object.keys(pending)) delete pending[key];
  if (Object.keys(patch).length) api.setSettings(patch);
}, 200);

/**
 * Modifie les paramètres et prévient les modules concernés.
 * live : enregistrement différé (pour les curseurs et sélecteurs de couleur).
 */
export function updateSettings(patch, { live = false } = {}) {
  const previous = state.settings;
  state.settings = { ...previous, ...patch };
  for (const fn of listeners) fn(patch, previous);
  if (live) {
    Object.assign(pending, patch);
    persistSoon();
    return Promise.resolve();
  }
  return api.setSettings(patch);
}

/** Enregistre sans effet visuel (session, définitions des espaces…). */
export function storeSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  return api.setSettings(patch);
}

export function flushSettings() {
  persistSoon.flush();
}
