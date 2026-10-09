# Third-party software and fonts

Folio's original code, documentation and assets are covered by the [MIT License](LICENSE). Third-party components keep their own licenses and copyright notices.

Folio uses:

- [Electron](https://github.com/electron/electron) for the desktop runtime.
- [markdown-it](https://github.com/markdown-it/markdown-it) and its plugins for Markdown rendering.
- [DOMPurify](https://github.com/cure53/DOMPurify) to sanitize rendered HTML.
- [KaTeX](https://github.com/KaTeX/KaTeX) for math formulas.
- [Mermaid](https://github.com/mermaid-js/mermaid) for diagrams.
- [CodeMirror](https://github.com/codemirror/dev) for editing.
- [highlight.js](https://github.com/highlightjs/highlight.js) for code highlighting.
- [Source Serif 4](https://github.com/adobe-fonts/source-serif), [Inter](https://github.com/rsms/inter) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), distributed under the SIL Open Font License.

`npm run build` generates `dist/THIRD-PARTY-NOTICES.txt` from the packages bundled into the interface and Mermaid's dependencies. This file contains their license texts and is included in the application's resources alongside `LICENSE.folio.txt`. Electron and Chromium notices are supplied by the runtime as `LICENSE.electron.txt` and `LICENSES.chromium.html`.

Development tools also carry their own licenses in `node_modules/`. Keep the relevant notices when redistributing Folio or a modified build.
