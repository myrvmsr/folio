// Registre des raccourcis clavier : actions, combinaisons par défaut, lecture des touches
// (y compris sur clavier AZERTY) et détection des conflits.
//
// Une combinaison est une chaîne canonique : modificateurs dans l'ordre Ctrl, Alt, Shift,
// Meta, puis la touche (« Ctrl+Shift+O », « F5 », « Ctrl++ »). L'affichage est traduit
// par formatCombo (« Ctrl+Maj+O » en français, « Strg+Umschalt+O » en allemand).
// Les noms des groupes et des actions sont traduits : clés « shortcuts.group.<id> » et « action.<id> ».
import { t } from './i18n.js';
import { platformShortcut } from '../shared/platform.js';
import { platform, isMac } from './platform.js';

export const GROUPS = [{ id: 'files' }, { id: 'tabs' }, { id: 'view' }, { id: 'edit' }, { id: 'export' }];

export const ACTIONS = [
  { id: 'open', group: 'files', keys: ['Ctrl+O'] },
  { id: 'openFolder', group: 'files', keys: [] },
  { id: 'new', group: 'files', keys: ['Ctrl+N'] },
  { id: 'save', group: 'files', keys: ['Ctrl+S'] },
  { id: 'saveAs', group: 'files', keys: ['Ctrl+Shift+S'] },
  { id: 'reload', group: 'files', keys: ['Ctrl+R', 'F5'] },

  { id: 'closeTab', group: 'tabs', keys: ['Ctrl+W', 'Ctrl+F4'] },
  { id: 'reopenTab', group: 'tabs', keys: ['Ctrl+Shift+T'] },
  { id: 'nextTab', group: 'tabs', keys: ['Ctrl+Tab', 'Ctrl+PageDown'] },
  { id: 'prevTab', group: 'tabs', keys: ['Ctrl+Shift+Tab', 'Ctrl+PageUp'] },
  { id: 'goToTab', group: 'tabs', keys: ['Ctrl+1…9'], fixed: true },
  { id: 'toggleTabLayout', group: 'tabs', keys: [] },
  { id: 'toggleTabsPanel', group: 'tabs', keys: ['Ctrl+Shift+B'] },
  { id: 'toggleTabsHidden', group: 'tabs', keys: ['Ctrl+Shift+M'] },
  { id: 'nextSpace', group: 'tabs', keys: ['Ctrl+Shift+PageDown'] },
  { id: 'prevSpace', group: 'tabs', keys: ['Ctrl+Shift+PageUp'] },
  { id: 'newSpace', group: 'tabs', keys: [] },

  { id: 'toggleEdit', group: 'view', keys: ['Ctrl+E'] },
  { id: 'toggleSplit', group: 'view', keys: ['Ctrl+Shift+P'] },
  { id: 'toggleOutline', group: 'view', keys: ['Ctrl+Shift+O'] },
  { id: 'toggleFiles', group: 'view', keys: ['Ctrl+Shift+D'] },
  { id: 'find', group: 'view', keys: ['Ctrl+F'] },
  { id: 'findNext', group: 'view', keys: ['F3'] },
  { id: 'findPrev', group: 'view', keys: ['Shift+F3'] },
  { id: 'zoomIn', group: 'view', keys: ['Ctrl+=', 'Ctrl++'] },
  // « Ctrl+) » : sur clavier AZERTY, la touche « ) » est voisine de « = » (comme « - » en QWERTY).
  { id: 'zoomOut', group: 'view', keys: ['Ctrl+-', 'Ctrl+)'] },
  { id: 'zoomReset', group: 'view', keys: ['Ctrl+0'] },
  { id: 'toggleTheme', group: 'view', keys: [] },
  { id: 'fullscreen', group: 'view', keys: ['F11'] },
  { id: 'settings', group: 'view', keys: ['Ctrl+,'] },
  { id: 'shortcuts', group: 'view', keys: ['F1'] },

  { id: 'bold', group: 'edit', keys: ['Ctrl+B'], scope: 'editor' },
  { id: 'italic', group: 'edit', keys: ['Ctrl+I'], scope: 'editor' },
  { id: 'strike', group: 'edit', keys: ['Ctrl+Shift+X'], scope: 'editor' },
  { id: 'inlineCode', group: 'edit', keys: ['Ctrl+`'], scope: 'editor' },
  { id: 'link', group: 'edit', keys: ['Ctrl+K'], scope: 'editor' },
  { id: 'replace', group: 'edit', keys: ['Ctrl+H'], scope: 'editor' },
  { id: 'undo', group: 'edit', keys: ['Ctrl+Z', 'Ctrl+Y'], fixed: true },

  { id: 'exportPdf', group: 'export', keys: ['Ctrl+Shift+E'] },
  { id: 'print', group: 'export', keys: ['Ctrl+P'] },
].map((action) => ({ ...action, keys: action.keys.map((key) => platformShortcut(key, platform)) }));

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export const actionLabel = (action) => t(`action.${action.id}`);
export const groupLabel = (group) => t(`shortcuts.group.${group.id}`);

// Combinaisons du système ou de l'éditeur qu'on ne peut pas réattribuer (raison : clé « shortcuts.reserved.<id> »).
const RESERVED = new Map([
  ['Ctrl+C', 'copy'],
  ['Ctrl+V', 'paste'],
  ['Ctrl+X', 'cut'],
  ['Ctrl+A', 'selectAll'],
  ['Ctrl+Z', 'undo'],
  ['Ctrl+Y', 'redo'],
  ['Ctrl+Shift+Z', 'redo'],
  ['Alt+F4', 'closeWindow'],
]);
for (let i = 1; i <= 9; i += 1) RESERVED.set(`Ctrl+${i}`, 'goToTab');
if (isMac) {
  for (const [combo, action] of [...RESERVED]) RESERVED.set(platformShortcut(combo, platform), action);
  RESERVED.set('Meta+Q', 'closeWindow');
  RESERVED.set('Meta+H', 'closeWindow');
  RESERVED.set('Alt+Meta+H', 'closeWindow');
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS', 'Hyper', 'Super']);

/**
 * Touche principale d'un évènement clavier, ou null (modificateur seul, touche morte…).
 * Les lettres suivent la disposition du clavier (AZERTY : la touche « M » donne M, la touche
 * « , » donne une virgule) ; les chiffres suivent la position physique (Ctrl + « & » = Ctrl+1).
 */
function keyOf(e) {
  if (!e.key || MODIFIER_KEYS.has(e.key)) return null;
  if (e.key === 'Dead' || e.key === 'Unidentified' || e.key === 'Process') return null;
  const code = e.code || '';
  if (e.key === ' ') return { key: 'Space', withShift: true };
  if (e.key.length > 1) return { key: e.key, withShift: true };
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return { key: digit[1], withShift: true };
  if (/^[a-z]$/i.test(e.key)) return { key: e.key.toUpperCase(), withShift: true };
  // Lettre d'un autre alphabet (cyrillique…) : on se repère à la position de la touche.
  if (/\p{L}/u.test(e.key) && /^Key[A-Z]$/.test(code)) return { key: code.slice(3), withShift: true };
  // Ponctuation : le caractère produit tient déjà compte de Maj (« + » = Maj + « = »).
  return { key: e.key, withShift: false };
}

/** Combinaison canonique d'un évènement keydown, ou null. */
export function comboFromEvent(e) {
  if (e.getModifierState && e.getModifierState('AltGraph')) return null;
  const k = keyOf(e);
  if (!k) return null;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && k.withShift) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(k.key);
  return parts.join('+');
}

/** Modificateurs enfoncés pendant l'enregistrement (aperçu « Ctrl+Maj+… »). */
export function modifiersFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  return parts;
}

export function parseCombo(combo) {
  const s = String(combo);
  if (s === '+' || s.endsWith('++')) {
    const mods = s.length > 1 ? s.slice(0, -2).split('+').filter(Boolean) : [];
    return { mods, key: '+' };
  }
  const parts = s.split('+');
  const key = parts.pop();
  return { mods: parts, key };
}

// Noms des touches affichés : flèches identiques partout, les autres traduits (clé « key.<nom> »).
const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const NAMED_KEYS = new Set(['Ctrl', 'Alt', 'Shift', 'Meta', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'Space', 'Tab', 'ContextMenu']);
const keyName = (key) => isMac && key === 'Meta' ? '⌘' : ARROWS[key] || (NAMED_KEYS.has(key) ? t(`key.${key}`) : key);

export function formatCombo(combo) {
  if (!combo) return '';
  if (combo.includes('…')) return combo.replace(/^Ctrl/, keyName('Ctrl'));
  const { mods, key } = parseCombo(combo);
  return [...mods, key].map(keyName).join('+');
}

export function formatModifiers(mods) {
  return mods.length ? `${mods.map(keyName).join('+')}+…` : '';
}

/** Raccourcis effectifs : valeurs par défaut, remplacées par celles de l'utilisateur. */
export function effectiveBindings(overrides) {
  const custom = overrides || {};
  const result = {};
  for (const action of ACTIONS) {
    result[action.id] = !action.fixed && Array.isArray(custom[action.id]) ? custom[action.id] : action.keys;
  }
  return result;
}

export function isCustomized(overrides, actionId) {
  return Boolean(overrides && Array.isArray(overrides[actionId]));
}

/** Table combinaison → action (hors raccourcis fixes). */
export function buildKeymap(overrides) {
  const bindings = effectiveBindings(overrides);
  const keymap = new Map();
  for (const action of ACTIONS) {
    if (action.fixed) continue;
    for (const combo of bindings[action.id]) if (!keymap.has(combo)) keymap.set(combo, action.id);
  }
  return keymap;
}

/** Vérifie qu'une combinaison peut être attribuée. Retourne un message d'erreur ou null. */
export function validateCombo(combo) {
  const { mods, key } = parseCombo(combo);
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  if (!mods.includes('Ctrl') && !mods.includes('Alt') && !mods.includes('Meta') && !isFunctionKey) {
    return t('shortcuts.needModifier');
  }
  if (key === 'Escape') return t('shortcuts.escapeReserved');
  if (RESERVED.has(combo)) return t('shortcuts.reservedCombo', { what: t(`shortcuts.reserved.${RESERVED.get(combo)}`) });
  return null;
}

/** Action (autre que exceptId) qui utilise déjà cette combinaison. */
export function findConflict(overrides, combo, exceptId) {
  const bindings = effectiveBindings(overrides);
  for (const action of ACTIONS) {
    if (action.fixed || action.id === exceptId) continue;
    if (bindings[action.id].includes(combo)) return action;
  }
  return null;
}

/**
 * Applique une modification (remplacer l'index i, ajouter, supprimer) et retourne les
 * nouvelles surcharges, en retirant la combinaison de l'action en conflit si besoin.
 */
export function withBinding(overrides, actionId, { index = -1, combo = null, stealFrom = null }) {
  const bindings = effectiveBindings(overrides);
  const next = { ...(overrides || {}) };
  const list = [...bindings[actionId]];
  if (combo == null) list.splice(index, 1);
  else if (index >= 0 && index < list.length) list[index] = combo;
  else list.push(combo);
  next[actionId] = [...new Set(list)];
  if (stealFrom) next[stealFrom] = bindings[stealFrom].filter((c) => c !== combo);
  // Une liste identique aux valeurs par défaut n'est pas stockée.
  for (const id of [actionId, stealFrom].filter(Boolean)) {
    const defaults = ACTION_BY_ID[id].keys;
    if (next[id].length === defaults.length && next[id].every((c, i) => c === defaults[i])) delete next[id];
  }
  return next;
}

export function withDefaults(overrides, actionId) {
  const next = { ...(overrides || {}) };
  delete next[actionId];
  // Les combinaisons par défaut reprises ailleurs entre-temps sont libérées.
  const defaults = ACTION_BY_ID[actionId].keys;
  for (const [id, list] of Object.entries(next)) {
    if (Array.isArray(list)) next[id] = list.filter((c) => !defaults.includes(c));
  }
  return next;
}
