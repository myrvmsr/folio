// Navigation dans un document : sommaire, défilement synchronisé, ancres et liens,
// clics dans le rendu, recherche, impression et export.
import { renderMermaid, copyButtonHtml } from './enhance.js';
import { Finder } from './find.js';
import { toggleTaskInSource } from './markdown.js';
import { state, els, api, $, SNAP, MARKDOWN_EXT } from './context.js';
import { mermaidTheme } from './appearance.js';
import { toast, openLightbox } from './ui.js';
import { h, basename, dirname, joinPath, samePath, resolveLink, isAbsoluteWinPath, slugify } from './util.js';
import { openPath, saveDoc, syncFromEditor, isDirty, renderDoc, suggestFileName } from './documents.js';
import { renderTabs } from './tabs.js';
import { noteEdit } from './autosave.js';
import { t } from './i18n.js';

export const finder = new Finder({
  bar: $('findbar'),
  input: $('find-input'),
  count: $('find-count'),
  prev: $('find-prev'),
  next: $('find-next'),
  close: $('find-close'),
  getRoot: () => state.active?.view.article,
  getScroller: () => state.active?.view.preview,
});

// --- Correspondance lignes source ↔ positions dans l'aperçu --------------------------------

function getLineMap(doc) {
  if (doc.lineMap) return doc.lineMap;
  const { preview, article } = doc.view;
  const base = preview.getBoundingClientRect().top - preview.scrollTop;
  const entries = [];
  for (const el of article.querySelectorAll('[data-line]')) {
    const rect = el.getBoundingClientRect();
    if (!rect.height && !rect.width) continue;
    entries.push({ line: Number(el.dataset.line), top: rect.top - base });
  }
  entries.sort((a, b) => a.line - b.line || a.top - b.top);
  const map = [];
  for (const entry of entries) {
    const last = map[map.length - 1];
    if (last && (entry.line === last.line || entry.top <= last.top)) continue;
    map.push(entry);
  }
  doc.lineMap = map;
  return map;
}

export function previewOffsetForLine(doc, line) {
  const map = getLineMap(doc);
  if (!map.length) return null;
  let i = 0;
  while (i + 1 < map.length && map[i + 1].line <= line) i += 1;
  const a = map[i];
  const b = map[i + 1];
  if (line < a.line) return 0;
  const top = b ? a.top + (b.top - a.top) * ((line - a.line) / (b.line - a.line)) : a.top + (line - a.line) * 26;
  return Math.max(0, top - 16);
}

export function previewTopLine(doc) {
  const map = getLineMap(doc);
  if (!map.length) return 0;
  const y = doc.view.preview.scrollTop + 16;
  let i = 0;
  while (i + 1 < map.length && map[i + 1].top <= y) i += 1;
  const a = map[i];
  const b = map[i + 1];
  if (y < a.top) return a.top > 0 ? a.line * (y / a.top) : a.line;
  if (!b) return a.line + (y - a.top) / 26;
  return a.line + (b.line - a.line) * ((y - a.top) / (b.top - a.top));
}

export function onPreviewScroll(doc) {
  if (doc !== state.active) return;
  scheduleOutlineActive();
  if (doc.mode === 'split' && doc.editor && performance.now() > doc.ignorePreviewScrollUntil) {
    doc.ignoreEditorScrollUntil = performance.now() + 120;
    doc.editor.scrollToLine(previewTopLine(doc));
  }
}

export function onEditorScroll(doc) {
  if (doc !== state.active) return;
  if (doc.mode === 'source') scheduleOutlineActive();
  if (doc.mode === 'split' && performance.now() > doc.ignoreEditorScrollUntil) {
    const top = previewOffsetForLine(doc, doc.editor.topLine());
    if (top == null) return;
    doc.ignorePreviewScrollUntil = performance.now() + 120;
    doc.view.preview.scrollTop = top;
    scheduleOutlineActive();
  }
}

export function invalidateLayout() {
  for (const doc of state.docs) doc.lineMap = null;
}

// --- Sommaire -----------------------------------------------------------------------------

function headingText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.katex-mathml, .footnote-ref').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

export function buildOutline(doc) {
  const list = els.outlineList;
  doc.headings = [...doc.view.article.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')];
  doc.outlineActive = undefined;
  if (!doc.headings.length) {
    list.replaceChildren(h('div', { class: 'outline-empty' }, doc.loaded ? t('outline.empty') : ''));
    return;
  }
  const min = Math.min(...doc.headings.map((el) => Number(el.tagName[1])));
  list.replaceChildren(
    ...doc.headings.map((el) => {
      const level = Math.min(Number(el.tagName[1]) - min, 4);
      const text = headingText(el) || t('outline.untitled');
      return h('a', { class: `outline-item lvl-${level}`, href: `#${el.id}`, title: text, dataset: { target: el.id } }, text);
    }),
  );
  updateOutlineActive();
}

let outlineFrame = 0;
export function scheduleOutlineActive() {
  if (!outlineFrame) {
    outlineFrame = requestAnimationFrame(() => {
      outlineFrame = 0;
      updateOutlineActive();
    });
  }
}

export function updateOutlineActive() {
  const doc = state.active;
  if (!doc || !doc.headings.length || !state.settings.outline) return;
  let current = null;
  if (doc.mode === 'source' && doc.editor) {
    const line = doc.editor.topLine() + 1;
    for (const el of doc.headings) {
      if (Number(el.dataset.line) <= line) current = el;
      else break;
    }
  } else {
    const box = doc.view.preview.getBoundingClientRect();
    const limit = box.top + Math.min(140, box.height / 3);
    for (const el of doc.headings) {
      if (el.getBoundingClientRect().top <= limit) current = el;
      else break;
    }
  }
  const id = current ? current.id : null;
  if (doc.outlineActive === id) return;
  doc.outlineActive = id;
  for (const item of els.outlineList.querySelectorAll('.outline-item')) {
    const on = item.dataset.target === id;
    item.classList.toggle('active', on);
    if (on) item.scrollIntoView({ block: 'nearest' });
  }
}

export function scrollToElement(doc, el, { smooth = true } = {}) {
  const pane = doc.view.preview;
  const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 24;
  pane.scrollTo({ top, behavior: smooth && !SNAP ? 'smooth' : 'auto' });
}

export function scrollToAnchor(doc, id) {
  if (!doc || !id) return;
  const article = doc.view.article;
  const el =
    article.querySelector(`[id="${CSS.escape(id)}"], a[name="${CSS.escape(id)}"]`) ||
    article.querySelector(`[id="${CSS.escape(slugify(id))}"]`);
  if (!el) {
    toast(t('nav.sectionMissing', { id }));
    return;
  }
  if (doc.mode === 'source' && doc.editor) {
    const line = el.closest('[data-line]')?.dataset.line;
    if (line != null) doc.editor.revealLine(Number(line));
    return;
  }
  scrollToElement(doc, el);
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

export function bindOutline() {
  els.outlineList.addEventListener('click', (e) => {
    const item = e.target.closest('.outline-item');
    if (!item) return;
    e.preventDefault();
    const doc = state.active;
    if (!doc) return;
    const el = doc.view.article.querySelector(`[id="${CSS.escape(item.dataset.target)}"]`);
    if (!el) return;
    if (doc.mode === 'source' && doc.editor) doc.editor.revealLine(Number(el.dataset.line));
    else scrollToElement(doc, el);
  });
}

// --- Interactions dans le rendu --------------------------------------------------------------

export function selectAllDoc() {
  const doc = state.active;
  if (!doc) return;
  if (doc.mode === 'source' && doc.editor) {
    doc.editor.focus();
    document.execCommand('selectAll');
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(doc.view.article);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

async function copyWithFeedback(button, text) {
  await api.copyText(text);
  button.classList.add('copied');
  button.innerHTML = copyButtonHtml(true);
  clearTimeout(button.folioTimer);
  button.folioTimer = setTimeout(() => {
    button.classList.remove('copied');
    button.innerHTML = copyButtonHtml();
  }, 1600);
}

function handleMermaidAction(button) {
  const block = button.closest('.mermaid-block');
  if (!block) return;
  const action = button.dataset.mermaid;
  if (action === 'code') {
    const pre = block.querySelector(':scope > .mermaid-code');
    pre.hidden = !pre.hidden;
    button.classList.toggle('on', !pre.hidden);
    if (state.active) state.active.lineMap = null;
  } else if (action === 'copy') {
    api.copyText(block.dataset.source || '');
    toast(t('mermaid.copied'), { duration: 1400 });
  } else if (action === 'zoom') {
    const svg = block.querySelector('.mermaid-svg svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    clone.setAttribute('width', '100%');
    clone.setAttribute('height', '100%');
    openLightbox(h('div', { class: 'lightbox-svg' }, clone));
  }
}

function onTaskToggle(box) {
  const doc = state.active;
  if (!doc) return;
  syncFromEditor(doc);
  const next = toggleTaskInSource(doc.content, Number(box.dataset.taskLine), box.checked);
  if (next == null) {
    box.checked = !box.checked;
    toast(t('task.locked'));
    return;
  }
  const wasClean = !isDirty(doc);
  doc.content = next;
  if (doc.editor) doc.editor.setValue(next);
  doc.editorChanged = false;
  doc.lastRendered = next;
  box.closest('li')?.classList.toggle('is-checked', box.checked);
  if (wasClean && doc.path) saveDoc(doc, { quiet: true });
  else {
    renderTabs();
    noteEdit(doc);
  }
}

export function followLink(href) {
  const doc = state.active;
  if (!href) return;
  if (href.startsWith('#')) {
    scrollToAnchor(doc, decodeURIComponent(href.slice(1)));
    return;
  }
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    api.openExternal(href);
    return;
  }
  const isFileLike = /^file:/i.test(href) || isAbsoluteWinPath(href);
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !isFileLike) {
    toast(t('nav.unsupportedLink', { href }));
    return;
  }
  if (!doc?.path && !isFileLike) {
    toast(t('nav.saveFirst'));
    return;
  }
  const target = resolveLink(doc?.path, href);
  if (!target) {
    toast(t('nav.invalidLink'));
    return;
  }
  if (samePath(target.path, doc?.path)) {
    if (target.hash) scrollToAnchor(doc, target.hash);
    return;
  }
  if (MARKDOWN_EXT.test(target.path)) {
    openPath(target.path, { hash: target.hash });
  } else {
    api.openPath(target.path).then((r) => {
      if (r && !r.ok) toast(t('nav.linkFailed', { error: r.error }), { type: 'error' });
    });
  }
}

export function bindDocumentClicks() {
  els.views.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const copyButton = target.closest('.code-copy');
    if (copyButton) {
      const code = copyButton.closest('.code-block')?.querySelector('pre code');
      if (code) copyWithFeedback(copyButton, code.textContent);
      return;
    }
    const mermaidButton = target.closest('[data-mermaid]');
    if (mermaidButton) {
      handleMermaidAction(mermaidButton);
      return;
    }
    const checkbox = target.closest('input.task-checkbox');
    if (checkbox) {
      onTaskToggle(checkbox);
      return;
    }
    const link = target.closest('a[href]');
    if (link && link.closest('.markdown-body')) {
      e.preventDefault();
      followLink(link.getAttribute('href'));
      return;
    }
    const img = target.closest('.markdown-body img');
    if (img && !img.classList.contains('is-broken') && img.naturalWidth >= 120) {
      openLightbox(h('img', { src: img.currentSrc || img.src, alt: img.alt || '' }));
    }
  });
}

// --- Recherche, impression, export -------------------------------------------------------------

export function openFind(text) {
  const doc = state.active;
  if (!doc) return;
  if (doc.editor && (doc.mode === 'source' || (doc.mode === 'split' && doc.editor.hasFocus()))) {
    doc.editor.openSearch();
    return;
  }
  const selection = window.getSelection()?.toString().trim();
  finder.open(text || (selection && selection.length <= 120 ? selection : undefined));
}

async function withPrintLayout(doc, task) {
  if (doc.mode === 'source') renderDoc(doc);
  document.body.classList.add('printing');
  const hasDiagrams = Boolean(doc.view.article.querySelector('.mermaid-block'));
  const screenTheme = mermaidTheme();
  const printTheme = mermaidTheme({ forPrint: true });
  const swap = hasDiagrams && screenTheme.key !== printTheme.key;
  if (swap) await renderMermaid(doc.view.article, printTheme);
  try {
    return await task();
  } finally {
    document.body.classList.remove('printing');
    if (swap) await renderMermaid(doc.view.article, screenTheme);
  }
}

export async function exportPdf() {
  const doc = state.active;
  if (!doc || !doc.loaded) return;
  const baseName = (doc.path ? basename(doc.path) : suggestFileName(doc)).replace(/\.[^.]+$/, '');
  const suggested = doc.path ? joinPath(dirname(doc.path), `${baseName}.pdf`) : `${baseName}.pdf`;
  const res = await withPrintLayout(doc, () => api.exportPdf(suggested));
  if (res.ok) {
    toast(t('export.done'), {
      type: 'success',
      duration: 6000,
      action: { label: t('common.open'), run: () => api.openPath(res.path) },
    });
  } else if (!res.canceled) {
    toast(t('export.failed', { error: res.error }), { type: 'error' });
  }
}

export async function printDoc() {
  const doc = state.active;
  if (!doc || !doc.loaded) return;
  await withPrintLayout(doc, () => api.print());
}

export async function copyMarkdown() {
  const doc = state.active;
  if (!doc || !doc.loaded) return;
  syncFromEditor(doc);
  await api.copyText(doc.content);
  toast(t('menu.markdownCopied'), { type: 'success', duration: 1500 });
}

export async function copyPath(doc = state.active) {
  if (!doc?.path) return;
  await copyText(doc.path);
}

/** Copie un chemin (onglet, panneau Dossiers) avec confirmation. */
export async function copyText(text, message = t('common.pathCopied')) {
  await api.copyText(text);
  toast(message, { type: 'success', duration: 1500 });
}
