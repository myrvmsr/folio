'use strict';

// Palette de couleurs de Folio, partagée entre l'interface (variables CSS) et le
// processus principal (couleurs de la barre de titre Windows).
//
// L'utilisateur choisit trois couleurs : accentuation, arrière-plan et avant-plan
// (texte). Toutes les nuances de l'interface en sont dérivées. Sans personnalisation,
// la feuille theme.css (palette inspirée de Claude) s'applique telle quelle.

const DEFAULT_COLORS = {
  light: { accent: '#c96442', background: '#faf9f5', foreground: '#141413' },
  dark: { accent: '#d97757', background: '#262624', foreground: '#faf9f5' },
};

const DEFAULT_CHROME = {
  light: { color: '#f5f4ed', symbol: '#3d3d3a' },
  dark: { color: '#1f1e1d', symbol: '#c2c0b6' },
};

// Couleurs d'accentuation proposées, chacune ajustée pour le mode clair et le mode sombre.
const ACCENT_PRESETS = [
  { id: 'terracotta', name: 'Terre cuite', light: '#c96442', dark: '#d97757' },
  { id: 'amber', name: 'Ambre', light: '#b45309', dark: '#e0a14a' },
  { id: 'green', name: 'Vert', light: '#2f7d4f', dark: '#5cc58a' },
  { id: 'teal', name: 'Sarcelle', light: '#0e7490', dark: '#3fb6cf' },
  { id: 'blue', name: 'Bleu', light: '#1f6feb', dark: '#4d8ef7' },
  { id: 'violet', name: 'Violet', light: '#7c4fd1', dark: '#a98bf0' },
  { id: 'pink', name: 'Rose', light: '#c2417a', dark: '#ec74a8' },
  { id: 'graphite', name: 'Graphite', light: '#57534e', dark: '#a8a29e' },
];

function normalizeHex(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value == null ? '' : value).trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

function toRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mélange a → b (t = 0 : a, t = 1 : b). */
function mix(a, b, t) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

function rgba(hex, alpha) {
  const [r, g, b] = toRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function luminance(hex) {
  const c = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function resolveAccent(mode, accent) {
  if (typeof accent === 'string' && accent.startsWith('preset:')) {
    const preset = ACCENT_PRESETS.find((p) => p.id === accent.slice(7));
    if (preset) return preset[mode];
  }
  return normalizeHex(accent) || DEFAULT_COLORS[mode].accent;
}

/**
 * colors = { accent: null | 'preset:bleu' | '#hex', light: { background, foreground }, dark: { … } }
 * Retourne les variables CSS à surcharger et les couleurs de la barre de titre.
 */
function computePalette(mode, colors) {
  const settings = colors || {};
  const defaults = DEFAULT_COLORS[mode];
  const perMode = settings[mode] || {};
  const A = resolveAccent(mode, settings.accent);
  const B = normalizeHex(perMode.background) || defaults.background;
  const F = normalizeHex(perMode.foreground) || defaults.foreground;
  const customAccent = A !== defaults.accent;
  const customSurface = B !== defaults.background || F !== defaults.foreground;
  const darkBg = luminance(B) < 0.2;
  const vars = {};

  if (customSurface) {
    const bg000 = darkBg ? mix(B, '#ffffff', 0.06) : mix(B, '#ffffff', 0.75);
    const bg200 = darkBg ? mix(B, '#000000', 0.2) : mix(B, '#000000', 0.03);
    Object.assign(vars, {
      'color-scheme': darkBg ? 'dark' : 'light',
      '--bg-000': bg000,
      '--bg-100': B,
      '--bg-200': bg200,
      '--bg-300': darkBg ? mix(B, '#000000', 0.32) : mix(B, '#000000', 0.05),
      '--bg-400': darkBg ? mix(B, '#ffffff', 0.1) : mix(B, '#000000', 0.08),
      '--bg-500': darkBg ? mix(B, '#ffffff', 0.18) : mix(B, '#000000', 0.15),
      '--surface': bg000,
      '--tab-active': bg000,
      '--code-bg': bg200,
      '--table-head': darkBg ? mix(B, '#ffffff', 0.035) : bg200,
      '--text-000': F,
      '--text-100': mix(F, B, 0.07),
      '--text-200': mix(F, B, 0.22),
      '--text-300': mix(F, B, 0.35),
      '--text-400': mix(F, B, 0.45),
      '--text-500': mix(F, B, 0.6),
      '--border-100': rgba(F, 0.06),
      '--border-200': rgba(F, 0.1),
      '--border-300': rgba(F, 0.15),
      '--border-400': rgba(F, 0.25),
      '--hover': rgba(F, darkBg ? 0.06 : 0.05),
      '--hover-strong': rgba(F, darkBg ? 0.1 : 0.08),
      '--selection-blur': rgba(F, 0.09),
      '--code-border': rgba(F, 0.12),
      '--inline-code-bg': rgba(F, darkBg ? 0.06 : 0.04),
      '--table-stripe': rgba(F, darkBg ? 0.025 : 0.02),
      '--editor-active-line': rgba(F, darkBg ? 0.035 : 0.028),
      '--scrollbar': rgba(F, darkBg ? 0.18 : 0.2),
      '--toast-bg': F,
      '--toast-fg': B,
    });
  }

  if (customAccent || customSurface) {
    Object.assign(vars, {
      '--accent': A,
      '--accent-hover': darkBg ? mix(A, '#ffffff', 0.12) : mix(A, '#000000', 0.1),
      '--accent-text': darkBg ? mix(A, '#ffffff', 0.15) : mix(A, '#000000', 0.12),
      '--accent-soft': rgba(A, darkBg ? 0.16 : 0.1),
      '--accent-fg': contrast(A, '#ffffff') >= 3 ? '#ffffff' : '#141413',
      '--selection': rgba(A, darkBg ? 0.32 : 0.2),
    });
  }

  if (customAccent) {
    vars['--inline-code-fg'] = darkBg ? mix(A, '#ffffff', 0.3) : mix(A, '#000000', 0.22);
    vars['--editor-code'] = darkBg ? mix(A, '#ffffff', 0.25) : mix(A, '#000000', 0.18);
  }

  const chrome = customSurface
    ? { color: vars['--bg-200'], symbol: vars['--text-200'], background: B }
    : { ...DEFAULT_CHROME[mode], background: defaults.background };

  return { vars, chrome, accent: A, background: B, foreground: F, darkBg, custom: customAccent || customSurface };
}

/** Variables de thème Mermaid dérivées d'une palette personnalisée. */
function mermaidVariables(p) {
  const { accent: A, background: B, foreground: F, darkBg } = p;
  const node = mix(B, F, darkBg ? 0.09 : 0.05);
  const nodeBorder = mix(B, F, 0.35);
  const soft = mix(B, A, darkBg ? 0.25 : 0.16);
  const softBorder = mix(B, A, 0.6);
  return {
    darkMode: darkBg,
    background: B,
    primaryColor: node,
    primaryBorderColor: nodeBorder,
    primaryTextColor: F,
    secondaryColor: soft,
    secondaryBorderColor: softBorder,
    secondaryTextColor: F,
    tertiaryColor: mix(B, F, 0.03),
    tertiaryBorderColor: mix(B, F, 0.25),
    lineColor: mix(F, B, 0.45),
    textColor: F,
    mainBkg: node,
    nodeBorder,
    clusterBkg: mix(B, F, 0.03),
    clusterBorder: mix(B, F, 0.25),
    edgeLabelBackground: B,
    noteBkgColor: soft,
    noteBorderColor: softBorder,
    noteTextColor: F,
    actorBkg: node,
    actorBorder: nodeBorder,
    signalColor: mix(F, B, 0.2),
    signalTextColor: F,
    labelBoxBkgColor: node,
    pie1: A,
    pie2: mix(A, B, 0.45),
    pie3: mix(F, B, 0.5),
    pie4: mix(A, F, 0.4),
    pie5: mix(F, B, 0.7),
    pie6: mix(A, B, 0.7),
  };
}

module.exports = {
  DEFAULT_COLORS,
  ACCENT_PRESETS,
  normalizeHex,
  mix,
  contrast,
  luminance,
  resolveAccent,
  computePalette,
  mermaidVariables,
};
