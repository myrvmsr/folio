import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import texmath from 'markdown-it-texmath';
import alerts from 'markdown-it-github-alerts';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import YAML from 'yaml';
import { escapeHtml, slugify } from './util.js';
import { t } from './i18n.js';

const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'];

const LANG_FALLBACKS = {
  vue: 'xml',
  svelte: 'xml',
  jsonc: 'json',
  json5: 'json',
  console: 'bash',
  terminal: 'bash',
  shellsession: 'bash',
  env: 'bash',
  dotenv: 'bash',
  cmd: 'dos',
  batch: 'dos',
  bat: 'dos',
  mdx: 'markdown',
  tex: 'latex',
  'c#': 'csharp',
  'f#': 'fsharp',
};

const MAX_HIGHLIGHT = 200_000;

function resolveLanguage(lang) {
  const key = String(lang || '').toLowerCase();
  if (!key) return '';
  if (hljs.getLanguage(key)) return key;
  const fallback = LANG_FALLBACKS[key];
  return fallback && hljs.getLanguage(fallback) ? fallback : '';
}

function highlight(code, lang) {
  const name = resolveLanguage(lang);
  if (name && code.length <= MAX_HIGHLIGHT) {
    try {
      return { html: hljs.highlight(code, { language: name, ignoreIllegals: true }).value, lang: name };
    } catch {
      /* repli sur du texte brut */
    }
  }
  return { html: escapeHtml(code), lang: '' };
}

// --- Plugins maison -----------------------------------------------------------

/** Ajoute data-line (ligne source) aux blocs : sert à synchroniser le défilement. */
function sourceLines(md) {
  md.core.ruler.push('folio_source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.block && token.nesting !== -1 && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0]));
      }
    }
  });
}

/** Identifiants des titres, comme sur GitHub (pour le sommaire et les liens #ancre). */
function headingIds(md) {
  md.core.ruler.push('folio_heading_ids', (state) => {
    const used = new Map();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      const text = (inline.children || [])
        .filter((c) => c.type === 'text' || c.type === 'code_inline' || c.type === 'text_special')
        .map((c) => c.content)
        .join('');
      let slug = slugify(text) || 'section';
      const seen = used.get(slug) || 0;
      used.set(slug, seen + 1);
      if (seen) slug = `${slug}-${seen}`;
      tokens[i].attrSet('id', slug);
    }
  });
}

/** Listes de tâches « - [ ] » / « - [x] » avec des cases cliquables reliées à leur ligne source. */
function taskLists(md) {
  md.core.ruler.push('folio_task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i += 1) {
      const inline = tokens[i];
      if (inline.type !== 'inline') continue;
      if (tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
      const first = inline.children && inline.children[0];
      if (!first || first.type !== 'text') continue;
      const m = /^\[([ xX])\](?=\s|$)\s?/.exec(first.content);
      if (!m) continue;

      const checked = m[1] !== ' ';
      const item = tokens[i - 2];
      first.content = first.content.slice(m[0].length);

      const box = new state.Token('html_inline', '', 0);
      const line = item.map ? item.map[0] : -1;
      box.content = `<input type="checkbox" class="task-checkbox" data-task-line="${line}"${checked ? ' checked' : ''}>`;
      inline.children.unshift(box);

      item.attrJoin('class', checked ? 'task-list-item is-checked' : 'task-list-item');
      for (let j = i - 3; j >= 0; j -= 1) {
        const t = tokens[j];
        if ((t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && t.level === item.level - 1) {
          if (!(t.attrGet('class') || '').includes('contains-task-list')) t.attrJoin('class', 'contains-task-list');
          break;
        }
      }
    }
  });
}

/**
 * Rendu des blocs de code : coloration + emplacements pour Mermaid et les maths.
 * Les sources Mermaid et TeX voyagent comme texte (et non comme attribut) : DOMPurify
 * supprime les attributs contenant « --> », très courant dans les diagrammes.
 */
function codeBlocks(md) {
  const render = (token, info) => {
    const lang = (info || '').split(/\s+/)[0] || '';
    const line = token.attrGet('data-line');
    const lineAttr = line != null ? ` data-line="${line}"` : '';
    const lower = lang.toLowerCase();

    if (lower === 'mermaid') {
      return `<div class="mermaid-block"${lineAttr}><pre class="mermaid-source">${escapeHtml(token.content)}</pre></div>\n`;
    }
    if (lower === 'math' || lower === 'katex') {
      return `<div class="math-display"${lineAttr}>${escapeHtml(token.content.trim())}</div>\n`;
    }
    const { html, lang: hl } = highlight(token.content, lang);
    return `<pre class="code-block"${lineAttr} data-lang="${escapeHtml(lang)}"><code class="hljs${hl ? ` language-${hl}` : ''}">${html}</code></pre>\n`;
  };

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    return render(token, info);
  };
  md.renderer.rules.code_block = (tokens, idx) => render(tokens[idx], '');
}

/** Appels de notes « 1 » plutôt que « [1] », comme sur GitHub. */
function footnoteCaptions(md) {
  md.renderer.rules.footnote_caption = (tokens, idx) => {
    const { id, subId } = tokens[idx].meta;
    return subId > 0 ? `${id + 1}:${subId}` : String(id + 1);
  };
}

function tables(md) {
  md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    `<div class="table-wrap">${self.renderToken(tokens, idx, options)}`;
  md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    `${self.renderToken(tokens, idx, options)}</div>`;
}

/** Les formules sont rendues par KaTeX après le nettoyage HTML : on ne laisse ici qu'un emplacement. */
function math(md) {
  md.use(texmath, {
    engine: { renderToString: () => '' },
    delimiters: ['dollars', 'brackets'],
  });
  const inline = (tokens, idx) => `<span class="math-inline">${escapeHtml(tokens[idx].content)}</span>`;
  const displayInline = (tokens, idx) => `<span class="math-display">${escapeHtml(tokens[idx].content)}</span>`;
  const block = (tokens, idx) => {
    const t = tokens[idx];
    const line = t.map ? ` data-line="${t.map[0]}"` : '';
    const eqno = t.type === 'math_block_eqno' && t.info ? ` data-eqno="${escapeHtml(t.info)}"` : '';
    return `<div class="math-display"${line}${eqno}>${escapeHtml(t.content.trim())}</div>\n`;
  };
  md.renderer.rules.math_inline = inline;
  md.renderer.rules.math_inline_double = displayInline;
  md.renderer.rules.math_block = block;
  md.renderer.rules.math_block_eqno = block;
}

/** Liens automatiques à la GitHub : URL complètes, www.… et e-mails (pas « README.md »). */
function strictLinkify(md) {
  md.linkify.set({ fuzzyLink: true, fuzzyIP: false });
  const original = md.linkify.match.bind(md.linkify);
  md.linkify.match = (text) => {
    const found = original(text);
    if (!found) return [];
    return found.filter((m) => m.schema || /^www\./i.test(m.raw));
  };
}

// --- Nettoyage HTML -------------------------------------------------------------

const PURIFY_CONFIG = {
  FORBID_TAGS: ['style', 'form', 'textarea', 'select', 'button', 'dialog'],
  FORBID_ATTR: ['autofocus'],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  SANITIZE_DOM: false,
  RETURN_DOM_FRAGMENT: true,
};

let purifyHooked = false;
function hookPurify() {
  if (purifyHooked) return;
  purifyHooked = true;
  // name= ne peut servir qu'aux ancres <a name="…"> (évite le « DOM clobbering »).
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'name' && node.nodeName !== 'A') data.keepAttr = false;
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'INPUT' && !node.classList.contains('task-checkbox')) node.setAttribute('disabled', '');
    if (node.nodeName === 'A' && node.hasAttribute('target')) node.removeAttribute('target');
  });
}

// --- Métadonnées YAML en tête de fichier ---------------------------------------------

const FRONT_MATTER_RE = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/**
 * Détecte un bloc « --- » de métadonnées YAML. Il n'est retenu que s'il est fermé et
 * contient un vrai dictionnaire YAML ; sinon le « --- » reste une ligne horizontale.
 * Les lignes du bloc sont remplacées par des lignes vides pour garder la numérotation.
 */
function extractFrontMatter(src) {
  const m = FRONT_MATTER_RE.exec(src);
  if (!m) return { body: src, frontMatter: null };
  let data;
  try {
    // Schéma « failsafe » : les valeurs restent du texte tel qu'écrit (« 1.0 » ne devient pas « 1 »).
    data = YAML.parse(m[1], { schema: 'failsafe' });
  } catch {
    return { body: src, frontMatter: null };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { body: src, frontMatter: null };
  const lineCount = m[0].replace(/\n$/, '').split('\n').length;
  const body = '\n'.repeat(lineCount) + src.slice(m[0].length);
  return { body, frontMatter: { raw: m[1], data } };
}

// --- API ------------------------------------------------------------------------

/** Le moteur est recréé à chaque changement de langue (titres des encadrés « > [!NOTE] »). */
export function createRenderer({ breaks = false } = {}) {
  hookPurify();

  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, breaks });
  md.use(footnote);
  footnoteCaptions(md);
  math(md);
  md.use(alerts, { titles: Object.fromEntries(ALERT_TYPES.map((type) => [type, t(`md.alert.${type}`)])) });
  md.use(taskLists);
  md.use(headingIds);
  md.use(sourceLines);
  codeBlocks(md);
  tables(md);
  strictLinkify(md);

  return {
    /** Retourne { fragment, frontMatter } : un DocumentFragment déjà nettoyé. */
    render(src) {
      const { body, frontMatter } = extractFrontMatter(src);
      const html = md.render(body);
      const fragment = DOMPurify.sanitize(html, PURIFY_CONFIG);
      return { fragment, frontMatter };
    },
  };
}

/** Coche / décoche la case d'une liste de tâches à la ligne donnée. Retourne le nouveau texte ou null. */
export function toggleTaskInSource(text, line, checked) {
  const lines = text.split('\n');
  const current = lines[line];
  if (current == null) return null;
  const re = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/;
  if (!re.test(current)) return null;
  lines[line] = current.replace(re, (_all, prefix) => `${prefix}[${checked ? 'x' : ' '}]`);
  return lines.join('\n');
}
