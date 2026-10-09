# Contributing to Folio

Thanks for helping make Folio better. Bug reports, small fixes, translations and improvements to reading and editing are welcome. Please follow the [code of conduct](CODE_OF_CONDUCT.md) in every exchange.

## Report a bug or suggest an idea

Open an [issue](https://github.com/myrvmsr/folio/issues/new/choose) and pick the bug report or idea form. For a bug, include your Folio version, operating system, the steps to reproduce it, and what you expected to happen. A small Markdown example or screenshot helps; remove personal information before sharing it.

For a substantial feature, start with an issue so we can agree on the behavior before you build it.

For a security problem, do not open a public issue: follow the [security policy](SECURITY.md).

## Run the app

Use **Node.js 24 LTS** and npm. Folio's CI uses Node 24.

```bash
git clone https://github.com/myrvmsr/folio.git
cd folio
npm ci
npm start
```

`npm start` builds the interface and launches Electron. `npm run watch` rebuilds the interface as you edit it; reload Folio to pick up those changes.

## Make a pull request

1. Fork the repository and create a branch for your change.
2. Keep the change focused. Follow the JavaScript and CSS conventions in the files you touch.
3. Run `npm test`, `npm run check-locales` and `npm run build`.
4. For changes to the interface, file operations or session behavior, run `npm run test:e2e`. For changes to rendering or packaging, also run `npm run test:smoke`. See [TESTING.md](TESTING.md) for the scenarios and platform setup.
5. Open a pull request describing the problem, the resulting behavior and the checks you ran. Add a screenshot when the appearance changes.

Tests use isolated files and settings in `.folio-checks/`. On Linux without a display, prefix UI test commands with `xvfb-run -a`. CI tests Windows and Linux and checks the installed applications as well as the sources.

## Translate Folio

Translations live in `src/shared/locales/`. To improve an existing language, edit its file. To add a language, copy `en.js`, translate the strings and register it in `src/shared/i18n.js`, including its display name and spell-check dictionary.

Keep placeholders such as `{name}` and plural suffixes such as `_one` and `_other`. Run `npm run check-locales`, then check the menus and settings in the app. The reference dictionary is `fr.js`; missing strings fall back to English and then French.

## Find your way around

| Folder | What it contains |
| --- | --- |
| `src/main/` | Electron window, files, folder watching, PDF export and system integration |
| `src/renderer/` | Reading view, CodeMirror editor, tabs, spaces, folders and settings |
| `src/shared/` | Translations, platform helpers and color calculations |
| `scripts/` | Build, installation, license notices and verification tools |
| `tests/` | Logic tests and Playwright scenarios |
| `build/` | Icons and packaging resources |
| `exemples/` | Example Markdown documents |

## License

Contributions to Folio are provided under the [MIT License](LICENSE). When adding a dependency or an asset, preserve its license and attribution. Bundled third-party notices are generated during `npm run build`; see [THIRD-PARTY.md](THIRD-PARTY.md).
