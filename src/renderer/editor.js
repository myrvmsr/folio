// Éditeur de texte (CodeMirror 6). Ce fichier est chargé à la demande, la première
// fois qu'on passe en mode édition, pour que l'ouverture d'un document reste instantanée.
import { EditorState, EditorSelection, Compartment, RangeSetBuilder, StateEffect } from '@codemirror/state';
import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, syntaxTree, HighlightStyle } from '@codemirror/language';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { icons } from './icons.js';

const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.22em', color: 'var(--text-000)' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.1em', color: 'var(--text-000)' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--text-000)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--text-000)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--text-400)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--editor-code)' },
  { tag: t.quote, color: 'var(--text-300)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: 'var(--text-500)' },
  { tag: [t.atom, t.escape], color: 'var(--accent)' },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--hl-string)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null], color: 'var(--hl-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--hl-title)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--hl-type)' },
  { tag: t.tagName, color: 'var(--hl-tag)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--hl-attr)' },
  { tag: [t.meta, t.documentMeta, t.annotation], color: 'var(--text-400)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text-100)',
    backgroundColor: 'transparent',
    fontSize: 'var(--editor-size, 14px)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.75',
    overflow: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--scrollbar) transparent',
  },
  '.cm-content': {
    padding: '36px 0 45vh',
    maxWidth: 'var(--editor-width, 52rem)',
    margin: '0 auto',
    caretColor: 'var(--accent)',
  },
  '.cm-line': { padding: '0 32px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { background: 'var(--selection)' },
  '.cm-selectionBackground': { background: 'var(--selection-blur)' },
  '.cm-content ::selection': { background: 'transparent' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-specialChar': { color: 'var(--danger)' },
  '.cm-panels': {
    backgroundColor: 'var(--bg-200)',
    color: 'var(--text-100)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '0.5px solid var(--border-300)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '0.5px solid var(--border-300)' },
  '.cm-search': { padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  '.cm-search br': { display: 'none' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-300)', fontSize: '12px' },
  '.cm-textfield': {
    height: '28px',
    padding: '0 10px',
    border: '0.5px solid var(--border-400)',
    borderRadius: '8px',
    background: 'var(--bg-000)',
    color: 'var(--text-100)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
    outline: 'none',
  },
  '.cm-textfield:focus': { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' },
  '.cm-button': {
    height: '28px',
    padding: '0 10px',
    border: '0.5px solid var(--border-300)',
    borderRadius: '8px',
    backgroundImage: 'none',
    background: 'var(--bg-000)',
    color: 'var(--text-100)',
    fontFamily: 'var(--font-ui)',
    fontSize: '12px',
    textTransform: 'none',
  },
  '.cm-button:hover': { background: 'var(--bg-300)' },
  '.cm-search [name=close]': {
    marginLeft: 'auto',
    fontSize: '18px',
    color: 'var(--text-400)',
    background: 'none',
    border: '0',
    cursor: 'default',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--find-match)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--find-current)' },
  '.cm-code-start': { position: 'relative' },
  '.cm-code-copy': {
    position: 'absolute',
    top: '50%',
    right: '26px',
    transform: 'translateY(-50%)',
    height: '22px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '0 8px',
    border: '0.5px solid var(--border-300)',
    borderRadius: '7px',
    background: 'var(--surface)',
    color: 'var(--text-400)',
    font: '500 11.5px/1 var(--font-ui)',
    cursor: 'default',
    userSelect: 'none',
  },
  '.cm-code-copy:hover': { background: 'var(--bg-300)', color: 'var(--text-100)' },
  '.cm-code-copy.copied': { color: 'var(--success)' },
  '.cm-code-copy .icon': { width: '13px', height: '13px' },
});

// Textes de l'interface de l'éditeur (recherche, bouton « Copier »), fournis par Folio
// dans la langue choisie.
const DEFAULT_STRINGS = { phrases: {}, copy: 'Copier', copied: 'Copié', copyTitle: 'Copier le code', linkText: 'texte' };

// --- Bouton « Copier » des blocs de code ------------------------------------------------

const refreshWidgets = StateEffect.define();

/** Texte d'un bloc de code (sans les lignes ``` ni les marques de citation « > »). */
function codeBlockText(state, from, to, fenced) {
  const doc = state.doc;
  const first = doc.lineAt(from);
  let last = doc.lineAt(Math.max(from, to - 1));
  let start = first.number;
  let prefix = '';
  if (fenced) {
    const fence = first.text.search(/`{3,}|~{3,}/);
    prefix = fence > 0 ? first.text.slice(0, fence) : '';
    start += 1;
    if (last.number > first.number && /^[\s>]*(`{3,}|~{3,})\s*$/.test(last.text)) last = doc.line(last.number - 1);
  }
  if (last.number < start) return '';
  const quotes = (prefix.match(/>/g) || []).length;
  const lines = [];
  for (let n = start; n <= last.number; n += 1) {
    let text = doc.line(n).text;
    if (quotes) {
      for (let q = 0; q < quotes; q += 1) text = text.replace(/^\s*>\s?/, '');
    } else if (fenced && prefix) {
      text = text.replace(new RegExp(`^ {0,${prefix.length}}`), '');
    } else if (!fenced) {
      text = text.replace(/^(?: {1,4}|\t)/, '');
    }
    lines.push(text);
  }
  return lines.join('\n');
}

class CopyCodeWidget extends WidgetType {
  constructor(from, to, fenced, strings, copyText) {
    super();
    Object.assign(this, { from, to, fenced, strings, copyText });
  }

  eq(other) {
    return other.from === this.from && other.to === this.to && other.strings === this.strings;
  }

  toDOM(view) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-code-copy';
    button.title = this.strings.copyTitle;
    button.setAttribute('aria-label', this.strings.copyTitle);
    const label = (copied) => {
      button.innerHTML = copied ? icons.check : icons.copy;
      button.append(copied ? this.strings.copied : this.strings.copy);
      button.classList.toggle('copied', copied);
    };
    label(false);
    // mousedown : ne pas déplacer le curseur ni retirer le focus de l'éditeur.
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', (e) => {
      e.preventDefault();
      this.copyText(codeBlockText(view.state, this.from, this.to, this.fenced));
      label(true);
      clearTimeout(button.folioTimer);
      button.folioTimer = setTimeout(() => label(false), 1600);
    });
    return button;
  }

  ignoreEvent() {
    return true;
  }
}

function copyButtons(getStrings, copyText) {
  const build = (view) => {
    const builder = new RangeSetBuilder();
    const strings = getStrings();
    const seen = new Set();
    const tree = syntaxTree(view.state);
    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from,
        to,
        enter(node) {
          if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return undefined;
          if (!seen.has(node.from)) {
            seen.add(node.from);
            const line = view.state.doc.lineAt(node.from);
            const widget = new CopyCodeWidget(node.from, node.to, node.name === 'FencedCode', strings, copyText);
            builder.add(line.from, line.from, Decoration.line({ class: 'cm-code-start' }));
            builder.add(line.to, line.to, Decoration.widget({ widget, side: 1 }));
          }
          return false;
        },
      });
    }
    return builder.finish();
  };
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view);
      }

      update(update) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshWidgets)))
        ) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// --- Mise en forme : Ctrl+B, Ctrl+I, Ctrl+K ------------------------------------------

function toggleWrap(marker) {
  return (view) => {
    const { state } = view;
    const len = marker.length;
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - len, range.from);
      const after = state.sliceDoc(range.to, range.to + len);
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - len, to: range.from, insert: '' },
            { from: range.to, to: range.to + len, insert: '' },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + len, range.to + len),
      };
    });
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

function insertLink(view, placeholder) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || placeholder;
    const insert = `[${text}](https://)`;
    const urlStart = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 8),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
  return true;
}

// Commandes de mise en forme : leurs raccourcis sont gérés (et personnalisables) par Folio.
const COMMANDS = {
  bold: toggleWrap('**'),
  italic: toggleWrap('*'),
  strike: toggleWrap('~~'),
  code: toggleWrap('`'),
  link: (view, strings) => insertLink(view, strings.linkText),
  replace: (view) => openSearchPanel(view),
};

// Ctrl+I sélectionnerait le bloc parent dans CodeMirror : retiré pour éviter les surprises.
const baseKeymap = defaultKeymap.filter((binding) => binding.key !== 'Mod-i');

const spellAttrs = (on) =>
  EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false', autocorrect: 'off', autocapitalize: 'off' });

function create({ parent, doc, onChange, onScroll, spellcheck = true, strings: initialStrings = {}, copyText = () => {} }) {
  const spell = new Compartment();
  const phrases = new Compartment();
  let strings = { ...DEFAULT_STRINGS, ...initialStrings };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        search({ top: true }),
        yamlFrontmatter({ content: markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }) }),
        syntaxHighlighting(highlightStyle),
        EditorView.lineWrapping,
        keymap.of([...baseKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
        theme,
        phrases.of(EditorState.phrases.of(strings.phrases)),
        copyButtons(() => strings, copyText),
        spell.of(spellAttrs(spellcheck)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) onChange();
        }),
      ],
    }),
  });
  if (onScroll) view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  return {
    view,
    getValue: () => view.state.doc.toString(),

    /** Remplace le texte en ne modifiant que la partie qui a changé (curseur et défilement conservés). */
    setValue(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      let start = 0;
      const max = Math.min(current.length, text.length);
      while (start < max && current.charCodeAt(start) === text.charCodeAt(start)) start += 1;
      let endA = current.length;
      let endB = text.length;
      while (endA > start && endB > start && current.charCodeAt(endA - 1) === text.charCodeAt(endB - 1)) {
        endA -= 1;
        endB -= 1;
      }
      view.dispatch({ changes: { from: start, to: endA, insert: text.slice(start, endB) } });
    },

    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    openSearch: () => openSearchPanel(view),
    runCommand(name) {
      const command = COMMANDS[name];
      if (command) command(view, strings);
      view.focus();
    },
    setSpellcheck: (on) => view.dispatch({ effects: spell.reconfigure(spellAttrs(on)) }),

    /** Nouvelle langue : textes de la recherche et des boutons « Copier ». */
    setStrings(next) {
      strings = { ...DEFAULT_STRINGS, ...next };
      view.dispatch({ effects: [phrases.reconfigure(EditorState.phrases.of(strings.phrases)), refreshWidgets.of(null)] });
    },

    /** Ligne (0-based, fractionnaire) affichée en haut de l'éditeur. */
    topLine() {
      const height = Math.max(0, view.scrollDOM.scrollTop - view.documentPadding.top);
      const block = view.lineBlockAtHeight(height);
      const line = view.state.doc.lineAt(block.from).number - 1;
      const frac = block.height > 0 ? Math.min(1, Math.max(0, (height - block.top) / block.height)) : 0;
      return line + frac;
    },

    scrollToLine(lineFloat) {
      const total = view.state.doc.lines;
      const n = Math.max(0, Math.min(total - 1, Math.floor(lineFloat)));
      const frac = Math.max(0, lineFloat - n);
      const block = view.lineBlockAt(view.state.doc.line(n + 1).from);
      view.scrollDOM.scrollTop = block.top + frac * block.height + view.documentPadding.top;
    },

    /** Place le curseur au début d'une ligne et la montre en haut de l'éditeur. */
    revealLine(line) {
      const total = view.state.doc.lines;
      const pos = view.state.doc.line(Math.max(1, Math.min(total, line + 1))).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) });
      view.focus();
    },

    destroy: () => view.destroy(),
  };
}

window.FolioEditor = { create };
