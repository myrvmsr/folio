// Recherche dans le document affiché, insensible à la casse et aux accents
// (« ete » trouve « été »). Utilise l'API CSS Custom Highlight : le DOM n'est pas modifié.
import { t } from './i18n.js';

const SKIP = '.katex-mathml, .code-header, .mermaid-toolbar, .mermaid-svg, .mermaid-code, .fm-chevron, [hidden], script, style';
const BLOCKS = new Set(['P', 'LI', 'TD', 'TH', 'PRE', 'BLOCKQUOTE', 'DIV', 'DT', 'DD', 'SUMMARY', 'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const MAX_MATCHES = 5000;
const supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

const foldChar = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const foldString = (s) => [...s].map(foldChar).join('');

function blockOf(node) {
  let el = node.parentElement;
  while (el && !BLOCKS.has(el.tagName)) el = el.parentElement;
  return el;
}

function buildIndex(root) {
  const segments = [];
  let text = '';
  let lastBlock = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.data) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = blockOf(node);
    if (lastBlock && block !== lastBlock) text += '\u0000';
    lastBlock = block;
    const data = node.data;
    const start = text.length;
    if (/^[\x00-\x7f]*$/.test(data)) {
      text += data.toLowerCase();
      segments.push({ node, start, map: null, length: data.length });
    } else {
      const map = [];
      for (let i = 0; i < data.length; i += 1) {
        const folded = foldChar(data[i]);
        for (let k = 0; k < folded.length; k += 1) map.push(i);
        text += folded;
      }
      segments.push({ node, start, map, length: map.length });
    }
  }
  return { text, segments };
}

function locate(segments, index) {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].start <= index) lo = mid;
    else hi = mid - 1;
  }
  const seg = segments[lo];
  const local = index - seg.start;
  return { node: seg.node, offset: seg.map ? seg.map[local] : local };
}

export class Finder {
  constructor({ bar, input, count, prev, next, close, getRoot, getScroller }) {
    Object.assign(this, { bar, input, count, getRoot, getScroller });
    this.ranges = [];
    this.current = -1;
    input.addEventListener('input', () => this.search({ keepPosition: false }));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    prev.addEventListener('click', () => this.step(-1));
    next.addEventListener('click', () => this.step(1));
    close.addEventListener('click', () => this.close());
  }

  get isOpen() {
    return !this.bar.hidden;
  }

  open(text) {
    this.bar.hidden = false;
    if (typeof text === 'string' && text) this.input.value = text;
    this.input.focus();
    this.input.select();
    this.search({ keepPosition: false });
  }

  close() {
    if (this.bar.hidden) return;
    this.bar.hidden = true;
    this.clear();
  }

  clear() {
    this.ranges = [];
    this.current = -1;
    if (supported) {
      CSS.highlights.delete('find-match');
      CSS.highlights.delete('find-current');
    }
    this.count.textContent = '';
  }

  /** À appeler quand le contenu affiché change (rechargement, changement d'onglet). */
  refresh() {
    if (this.isOpen) this.search({ keepPosition: true });
  }

  search({ keepPosition }) {
    const previous = this.current;
    this.clear();
    const root = this.getRoot();
    const query = foldString(this.input.value);
    if (!root || !query.trim()) return;

    const { text, segments } = buildIndex(root);
    if (!segments.length) {
      this.count.textContent = t('find.none');
      return;
    }
    let from = 0;
    while (this.ranges.length < MAX_MATCHES) {
      const at = text.indexOf(query, from);
      if (at === -1) break;
      from = at + query.length;
      const start = locate(segments, at);
      const end = locate(segments, at + query.length - 1);
      try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset + 1);
        this.ranges.push(range);
      } catch {
        /* correspondance invalide : ignorée */
      }
    }
    if (!this.ranges.length) {
      this.count.textContent = t('find.none');
      return;
    }
    if (supported) CSS.highlights.set('find-match', new Highlight(...this.ranges));

    let index = 0;
    if (keepPosition && previous >= 0) index = Math.min(previous, this.ranges.length - 1);
    else index = this.firstVisibleIndex();
    this.select(index, !keepPosition);
  }

  firstVisibleIndex() {
    const scroller = this.getScroller();
    if (!scroller) return 0;
    const top = scroller.getBoundingClientRect().top;
    const i = this.ranges.findIndex((r) => r.getBoundingClientRect().top >= top);
    return i === -1 ? 0 : i;
  }

  step(direction) {
    if (!this.ranges.length) {
      this.search({ keepPosition: false });
      return;
    }
    const n = this.ranges.length;
    this.select((this.current + direction + n) % n, true);
  }

  select(index, reveal) {
    this.current = index;
    const range = this.ranges[index];
    this.count.textContent = t('find.count', { current: index + 1, total: this.ranges.length });
    if (supported) CSS.highlights.set('find-current', new Highlight(range));
    if (!reveal) return;

    let closed = range.startContainer.parentElement?.closest('details:not([open])');
    while (closed) {
      closed.open = true;
      closed = closed.parentElement?.closest('details:not([open])');
    }
    const scroller = this.getScroller();
    if (!scroller) return;
    const rect = range.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (rect.top < box.top + 70 || rect.bottom > box.bottom - 50) {
      scroller.scrollTop += rect.top - box.top - box.height / 3;
    }
  }
}
