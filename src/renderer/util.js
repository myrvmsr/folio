import { t, lang } from './i18n.js';
import { createPathUtils } from '../shared/platform.js';
import { platform } from './platform.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Petit constructeur de DOM : h('div', { class: 'x', onClick: fn }, enfant1, 'texte'). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function debounce(fn, ms) {
  let timer = null;
  let lastArgs = [];
  const wrapped = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, ms);
  };
  wrapped.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    fn(...lastArgs);
  };
  return wrapped;
}

// --- Chemins de la plateforme ----------------------------------------------

export const { basename, dirname, normPath, samePath, isSameOrInside, relocatePath, joinPath, toFileUrl, fromFileUrl } = createPathUtils(platform);

export const isAbsoluteWinPath = (s) => /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\');

/** Résout un lien relatif d'un document en { path, hash }. */
export function resolveLink(docPath, href) {
  try {
    let url;
    if (isAbsoluteWinPath(href)) {
      const [p, ...rest] = href.split('#');
      return { path: p, hash: rest.length ? decodeURIComponent(rest.join('#')) : '' };
    }
    if (/^file:/i.test(href)) url = new URL(href);
    else if (docPath) url = new URL(platform === 'win32' ? href.replace(/\\/g, '/') : href, toFileUrl(docPath));
    else return null;
    if (url.protocol !== 'file:') return null;
    const hash = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';
    url.hash = '';
    url.search = '';
    return { path: fromFileUrl(url.href), hash };
  } catch {
    return null;
  }
}

/** Raccourcit un chemin au milieu : C:\Users\…\Projets\docs */
export function shortenPath(p, max = 64) {
  const s = String(p);
  if (s.length <= max) return s;
  const separator = platform === 'win32' ? '\\' : '/';
  const parts = s.split(separator);
  if (parts.length <= 3) return `…${s.slice(-max + 1)}`;
  let head = parts.slice(0, 2).join(separator);
  let tail = parts[parts.length - 1];
  for (let i = parts.length - 2; i > 1; i -= 1) {
    const next = `${parts[i]}${separator}${tail}`;
    if (head.length + next.length + 3 > max) break;
    tail = next;
  }
  return `${head}${separator}…${separator}${tail}`;
}

// --- Texte -----------------------------------------------------------------

export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function countWords(text) {
  const plain = String(text)
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~[\]()|-]/g, ' ');
  const words = plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

export function formatNumber(n) {
  return new Intl.NumberFormat(lang()).format(n);
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return t('time.justNow');
  const short = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto', style: 'short' });
  const m = Math.round(s / 60);
  if (m < 60) return short.format(-m, 'minute');
  const hours = Math.round(m / 60);
  if (hours < 24) return short.format(-hours, 'hour');
  const d = Math.round(hours / 24);
  if (d < 7) return new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' }).format(-d, 'day');
  return new Date(ts).toLocaleDateString(lang(), {
    day: 'numeric',
    month: 'short',
    ...(d > 300 ? { year: 'numeric' } : {}),
  });
}
