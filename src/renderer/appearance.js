// Apparence : police, tailles, disposition et palette de couleurs (y compris personnalisée).
import { computePalette, mermaidVariables } from '../shared/palette.js';
import { state, els, currentMode } from './context.js';
import { icons } from './icons.js';
import { t } from './i18n.js';

export const THEME_CYCLE = ['system', 'light', 'dark'];
export const VTABS_STATES = ['expanded', 'collapsed', 'hidden'];

/** « automatique (comme Windows) », « clair », « sombre » dans la langue active. */
export const themeLabel = (theme) => t(`theme.${THEME_CYCLE.includes(theme) ? theme : 'system'}`);

export function clampTabsWidth(width) {
  return Math.max(180, Math.min(420, Number(width) || 248));
}

export function clampFilesWidth(width) {
  return Math.max(180, Math.min(480, Number(width) || 260));
}

let appliedVars = [];

export function currentPalette() {
  return computePalette(currentMode(), state.settings.colors);
}

/** Surcharge les variables CSS par les couleurs personnalisées du mode courant. */
export function applyPalette() {
  const root = document.documentElement;
  for (const name of appliedVars) root.style.removeProperty(name);
  const palette = currentPalette();
  appliedVars = Object.keys(palette.vars);
  for (const [name, value] of Object.entries(palette.vars)) root.style.setProperty(name, value);
}

export function applyAppearance() {
  const s = state.settings;
  const root = document.documentElement;
  root.dataset.font = s.font;
  root.dataset.width = s.width;
  root.style.setProperty('--doc-size', `${s.fontSize}px`);
  root.style.setProperty('--editor-size', `${Math.max(12, Math.round(s.fontSize * 0.875))}px`);
  root.style.setProperty('--vtabs-width', `${clampTabsWidth(s.vtabsWidth)}px`);
  root.style.setProperty('--files-width', `${clampFilesWidth(s.filesWidth)}px`);
  applyPalette();

  const app = els.app.classList;
  const vtabsState = VTABS_STATES.includes(s.vtabsState) ? s.vtabsState : 'expanded';
  app.toggle('outline-open', Boolean(s.outline));
  app.toggle('outline-right', s.outlineSide === 'right');
  app.toggle('tabs-vertical', s.tabLayout === 'vertical');
  app.toggle('files-open', Boolean(s.filesPanel));
  for (const name of VTABS_STATES) app.toggle(`vtabs-${name}`, vtabsState === name);

  els.outlineBtn.classList.toggle('on', Boolean(s.outline));
  els.filesBtn.classList.toggle('on', Boolean(s.filesPanel));
  els.themeBtn.innerHTML = s.theme === 'light' ? icons.sun : s.theme === 'dark' ? icons.moon : icons.monitor;
  els.themeBtn.title = t('theme.buttonTitle', { name: themeLabel(s.theme) });
}

/**
 * Thème des diagrammes Mermaid : palette par défaut du mode, ou dérivée des couleurs
 * personnalisées. L'impression utilise toujours le thème clair par défaut.
 */
export function mermaidTheme({ forPrint = false } = {}) {
  if (forPrint) return { key: 'light', mode: 'light', variables: null };
  const mode = currentMode();
  const palette = computePalette(mode, state.settings.colors);
  if (!palette.custom) return { key: mode, mode, variables: null };
  return {
    key: `${mode}|${palette.accent}|${palette.background}|${palette.foreground}`,
    mode,
    variables: mermaidVariables(palette),
  };
}
