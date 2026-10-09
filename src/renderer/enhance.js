import katex from 'katex';
import { h, escapeHtml, toFileUrl, isAbsoluteWinPath } from './util.js';
import { icons } from './icons.js';
import { t, lang as uiLang } from './i18n.js';

// --- Blocs de code -------------------------------------------------------------

/** Contenu du bouton « Copier » des blocs de code (aussi utilisé pour le retour « Copié »). */
export const copyButtonHtml = (copied = false) =>
  copied ? `${icons.check}<span>${escapeHtml(t('code.copied'))}</span>` : `${icons.copy}<span>${escapeHtml(t('code.copy'))}</span>`;

// Chaque bloc reçoit un en-tête (langage + bouton « Copier »), qui reste visible en haut
// de l'écran pendant qu'on fait défiler un long bloc.
export function decorateCodeBlocks(root) {
  for (const pre of root.querySelectorAll('pre.code-block')) {
    const lang = pre.dataset.lang || '';
    const block = h('div', { class: lang ? 'code-block' : 'code-block no-lang' });
    if (pre.dataset.line) block.dataset.line = pre.dataset.line;
    const header = h(
      'div',
      { class: 'code-header' },
      h('span', { class: 'code-lang' }, lang),
      h('button', {
        class: 'code-copy',
        type: 'button',
        title: t('code.copyTitle'),
        'aria-label': t('code.copyTitle'),
        html: copyButtonHtml(),
      }),
    );
    pre.removeAttribute('class');
    pre.removeAttribute('data-line');
    pre.removeAttribute('data-lang');
    pre.replaceWith(block);
    block.append(header, pre);
  }
}

// --- Formules (KaTeX) ------------------------------------------------------------

const katexCache = new Map();

export function renderMath(root) {
  for (const el of root.querySelectorAll('.math-inline, .math-display')) {
    if (el.dataset.tex == null) el.dataset.tex = el.textContent;
    const tex = el.dataset.tex;
    const display = el.classList.contains('math-display');
    const key = `${display ? 'D' : 'I'}:${tex}`;
    let html = katexCache.get(key);
    if (html === undefined) {
      try {
        html = katex.renderToString(tex, {
          displayMode: display,
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          output: 'htmlAndMathml',
        });
      } catch (err) {
        html = `<span class="math-error" title="${escapeHtml(err.message)}">${escapeHtml(tex)}</span>`;
      }
      if (katexCache.size > 4000) katexCache.clear();
      katexCache.set(key, html);
    }
    el.innerHTML = html;
    if (el.dataset.eqno) el.append(h('span', { class: 'math-eqno' }, `(${el.dataset.eqno})`));
  }
}

// --- Images et médias locaux -------------------------------------------------------

function resolveSrc(src, base) {
  if (!src || /^(https?:|data:|blob:|file:)/i.test(src) || src.startsWith('//')) return null;
  if (isAbsoluteWinPath(src)) return toFileUrl(src);
  if (!base) return null;
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

export function resolveMedia(root, docPath) {
  const base = docPath ? toFileUrl(docPath) : null;
  for (const el of root.querySelectorAll('img[src], video[src], audio[src], source[src]')) {
    const resolved = resolveSrc(el.getAttribute('src'), base);
    if (resolved) el.setAttribute('src', resolved);
    if (el.tagName === 'IMG') {
      el.decoding = 'async';
      el.addEventListener('error', () => el.classList.add('is-broken'), { once: true });
    }
  }
}

// --- Métadonnées YAML (front matter) ----------------------------------------------

function formatValue(value) {
  if (Array.isArray(value)) {
    return h(
      'span',
      { class: 'fm-chips' },
      value.map((v) => h('span', { class: 'fm-chip' }, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))),
    );
  }
  if (value instanceof Date) return value.toLocaleDateString(uiLang());
  if (value && typeof value === 'object') return h('code', {}, JSON.stringify(value));
  return String(value ?? '');
}

export function frontMatterCard({ data }) {
  const rows = Object.entries(data).map(([key, value]) => h('tr', {}, h('th', {}, key), h('td', {}, formatValue(value))));
  return h(
    'details',
    { class: 'frontmatter', open: true },
    h('summary', {}, h('span', { class: 'fm-chevron', html: icons.chevronRight }), t('md.properties')),
    h('div', { class: 'fm-body' }, h('table', {}, h('tbody', {}, rows))),
  );
}

// --- Diagrammes Mermaid ----------------------------------------------------------

const MERMAID_THEMES = {
  light: {
    darkMode: false,
    background: '#FAF9F5',
    primaryColor: '#F0EEE6',
    primaryBorderColor: '#B8B5A9',
    primaryTextColor: '#141413',
    secondaryColor: '#F6E3DA',
    secondaryBorderColor: '#D9A48E',
    secondaryTextColor: '#141413',
    tertiaryColor: '#F5F4ED',
    tertiaryBorderColor: '#CFCCC0',
    lineColor: '#73726C',
    textColor: '#141413',
    mainBkg: '#F0EEE6',
    nodeBorder: '#B8B5A9',
    clusterBkg: '#F5F4ED',
    clusterBorder: '#CFCCC0',
    edgeLabelBackground: '#FAF9F5',
    noteBkgColor: '#F6E3DA',
    noteBorderColor: '#D9A48E',
    noteTextColor: '#141413',
    actorBkg: '#F0EEE6',
    actorBorder: '#B8B5A9',
    signalColor: '#3D3D3A',
    signalTextColor: '#141413',
    labelBoxBkgColor: '#F0EEE6',
    pie1: '#C96442', pie2: '#E3A587', pie3: '#8E7A6B', pie4: '#D4B483', pie5: '#6F8F7F', pie6: '#A9A59A',
  },
  dark: {
    darkMode: true,
    background: '#262624',
    primaryColor: '#353532',
    primaryBorderColor: '#6B6962',
    primaryTextColor: '#F5F4EF',
    secondaryColor: '#4A3029',
    secondaryBorderColor: '#B66A4F',
    secondaryTextColor: '#F5F4EF',
    tertiaryColor: '#2D2D2A',
    tertiaryBorderColor: '#57554F',
    lineColor: '#A6A39A',
    textColor: '#ECEBE5',
    mainBkg: '#353532',
    nodeBorder: '#6B6962',
    clusterBkg: '#2D2D2A',
    clusterBorder: '#57554F',
    edgeLabelBackground: '#262624',
    noteBkgColor: '#4A3029',
    noteBorderColor: '#B66A4F',
    noteTextColor: '#F5F4EF',
    actorBkg: '#353532',
    actorBorder: '#6B6962',
    signalColor: '#C2C0B6',
    signalTextColor: '#ECEBE5',
    labelBoxBkgColor: '#353532',
    pie1: '#D97757', pie2: '#8C5A47', pie3: '#B8A48F', pie4: '#C9A86A', pie5: '#6F8F7F', pie6: '#6B6962',
  },
};

let mermaidLoader = null;
let mermaidTheme = null;
let mermaidId = 0;
let mermaidQueue = Promise.resolve();
const svgCache = new Map();

function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/mermaid/mermaid.min.js';
      script.onload = () => {
        const lib = globalThis.mermaid;
        if (lib && typeof lib.render === 'function') resolve(lib);
        else reject(new Error(t('mermaid.missing')));
      };
      script.onerror = () => reject(new Error(t('mermaid.loadFailed')));
      document.head.append(script);
    });
  }
  return mermaidLoader;
}

function ensureMermaidShell(block) {
  if (block.querySelector(':scope > .mermaid-svg')) return;
  const sourceEl = block.querySelector(':scope > .mermaid-source');
  const source = sourceEl ? sourceEl.textContent : block.dataset.source || '';
  sourceEl?.remove();
  block.dataset.source = source;
  block.append(
    h(
      'div',
      { class: 'mermaid-toolbar' },
      h('button', { type: 'button', class: 'mini-btn', 'data-mermaid': 'code', title: t('mermaid.showCode'), html: icons.code }),
      h('button', { type: 'button', class: 'mini-btn', 'data-mermaid': 'copy', title: t('code.copyTitle'), html: icons.copy }),
      h('button', { type: 'button', class: 'mini-btn', 'data-mermaid': 'zoom', title: t('mermaid.zoom'), html: icons.maximize }),
    ),
    h('div', { class: 'mermaid-svg' }, h('div', { class: 'mermaid-loading' }, t('mermaid.loading'))),
    h('pre', { class: 'mermaid-code', hidden: true }, h('code', {}, source)),
  );
}

function showMermaidError(block, err) {
  const target = block.querySelector(':scope > .mermaid-svg');
  const message = String((err && (err.message || err.str)) || err || t('common.unknownError')).split('\n')[0];
  target.replaceChildren(h('div', { class: 'mermaid-error' }, h('strong', {}, t('mermaid.invalid')), h('span', {}, message)));
  const code = block.querySelector(':scope > .mermaid-code');
  if (code) code.hidden = false;
  block.classList.add('has-error');
}

function setMermaidSvg(block, svg) {
  block.classList.remove('has-error');
  const target = block.querySelector(':scope > .mermaid-svg');
  target.innerHTML = svg;
}

/**
 * Rend les diagrammes Mermaid d'un conteneur. Les diagrammes déjà en cache sont posés
 * immédiatement (pas de saut de mise en page), les autres de façon asynchrone.
 * theme = { key, mode: 'light' | 'dark', variables: null | variables personnalisées }.
 */
export function renderMermaid(root, theme) {
  const blocks = [...root.querySelectorAll('.mermaid-block')];
  if (!blocks.length) return Promise.resolve();
  const pending = [];
  for (const block of blocks) {
    ensureMermaidShell(block);
    const cached = svgCache.get(`${theme.key}\n${block.dataset.source || ''}`);
    if (cached) setMermaidSvg(block, cached);
    else pending.push(block);
  }
  if (!pending.length) return Promise.resolve();

  const job = mermaidQueue.then(async () => {
    let mermaid;
    try {
      mermaid = await loadMermaid();
    } catch (err) {
      pending.forEach((b) => showMermaidError(b, err));
      return;
    }
    if (mermaidTheme !== theme.key) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          ...(theme.variables || MERMAID_THEMES[theme.mode]),
          fontFamily: 'Inter Variable, Segoe UI, sans-serif',
          fontSize: '14px',
        },
        flowchart: { curve: 'basis', padding: 12 },
        sequence: { mirrorActors: false },
        // Sans largeur explicite, Mermaid dessine les Gantt sur 1200 px (texte minuscule une fois réduit).
        gantt: { useWidth: 720, barHeight: 24, fontSize: 13, sectionFontSize: 13, leftPadding: 90, axisFormat: '%d/%m' },
      });
      mermaidTheme = theme.key;
    }
    for (const block of pending) {
      const source = block.dataset.source || '';
      const key = `${theme.key}\n${source}`;
      let svg = svgCache.get(key);
      if (!svg) {
        const id = `folio-mermaid-${(mermaidId += 1)}`;
        try {
          ({ svg } = await mermaid.render(id, source));
          if (svgCache.size > 300) svgCache.clear();
          svgCache.set(key, svg);
        } catch (err) {
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
          if (block.isConnected) showMermaidError(block, err);
          continue;
        }
      }
      if (block.isConnected) setMermaidSvg(block, svg);
    }
  });
  mermaidQueue = job.catch(() => {});
  return job;
}

// --- Ensemble ---------------------------------------------------------------------

/** Applique tous les enrichissements synchrones ; retourne la promesse des diagrammes. */
export function enhance(root, { docPath, theme }) {
  decorateCodeBlocks(root);
  renderMath(root);
  resolveMedia(root, docPath);
  return renderMermaid(root, theme);
}
