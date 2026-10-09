// Enregistrement automatique, comme dans VS Code :
//   afterEdit   : une seconde après la dernière modification (réglage par défaut) ;
//   interval    : toutes les N minutes ;
//   focusChange : en changeant d'onglet ou quand la fenêtre perd le focus ;
//   off         : uniquement avec Ctrl+S.
// Seuls les documents qui ont déjà un fichier sont concernés : un nouveau document doit
// d'abord être enregistré une fois (Ctrl+S) pour choisir son nom et son dossier.
import { state, SNAP, query } from './context.js';
import { isDirty, saveDoc } from './documents.js';

export const AUTOSAVE_MODES = ['afterEdit', 'interval', 'focusChange', 'off'];
export const AUTOSAVE_DEFAULT = 'afterEdit';
export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 120;
export const INTERVAL_DEFAULT = 5;
const EDIT_DELAY = 1000;

export function autoSaveMode() {
  // Les captures de test ne doivent jamais modifier les fichiers d'exemple.
  if (SNAP && !query.has('autosave')) return 'off';
  const mode = state.settings?.autoSave;
  return AUTOSAVE_MODES.includes(mode) ? mode : AUTOSAVE_DEFAULT;
}

export const autoSaveEnabled = () => autoSaveMode() !== 'off';

export function autoSaveMinutes() {
  const n = Math.round(Number(state.settings?.autoSaveInterval));
  return Number.isFinite(n) && n > 0 ? Math.max(INTERVAL_MIN, Math.min(INTERVAL_MAX, n)) : INTERVAL_DEFAULT;
}

/** Le document peut-il être enregistré sans rien demander à l'utilisateur ? */
export function canAutoSave(doc) {
  return Boolean(
    doc &&
      state.docs.includes(doc) &&
      doc.loaded &&
      doc.path &&
      !doc.missing &&
      !doc.pendingDisk &&
      !doc.loadError &&
      isDirty(doc),
  );
}

/** Enregistre le document si besoin. Résout true s'il ne reste rien à enregistrer. */
export async function autoSave(doc) {
  if (!doc) return true;
  clearTimeout(doc.autoSaveTimer);
  doc.autoSaveTimer = null;
  if (!canAutoSave(doc)) return !isDirty(doc);
  return saveDoc(doc, { quiet: true, auto: true });
}

/** À appeler après chaque modification d'un document. */
export function noteEdit(doc) {
  if (!doc || !doc.path || autoSaveMode() !== 'afterEdit') return;
  clearTimeout(doc.autoSaveTimer);
  doc.autoSaveTimer = setTimeout(() => autoSave(doc), EDIT_DELAY);
}

export async function autoSaveAll() {
  for (const doc of state.docs.filter(canAutoSave)) await autoSave(doc);
}

/** Changement d'onglet : en mode « focusChange », le document qu'on quitte est enregistré. */
export function onDocumentLeft(doc) {
  if (doc && autoSaveMode() === 'focusChange') autoSave(doc);
}

let intervalTimer = null;

/** Applique le réglage (au démarrage et à chaque modification dans les paramètres). */
export function configureAutoSave() {
  clearInterval(intervalTimer);
  intervalTimer = null;
  const mode = autoSaveMode();
  if (mode !== 'afterEdit') {
    for (const doc of state.docs) {
      clearTimeout(doc.autoSaveTimer);
      doc.autoSaveTimer = null;
    }
  }
  if (mode === 'interval') intervalTimer = setInterval(autoSaveAll, autoSaveMinutes() * 60_000);
  // Les modifications déjà en attente sont enregistrées dès qu'on active le mode.
  else if (mode === 'afterEdit' || mode === 'focusChange') autoSaveAll();
}

export function bindAutoSave() {
  window.addEventListener('blur', () => {
    if (autoSaveMode() === 'focusChange') autoSaveAll();
  });
}
