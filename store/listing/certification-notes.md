# Notes for Microsoft Store certification

Folio is a free Electron-based desktop Markdown reader and editor. It requires no login, subscription, external service account or special test credentials.

The restricted capability `runFullTrust` is required for its Win32/Electron process, native file dialogs, access to user-selected local documents and folders, filesystem watching, saving, renaming, moving, system trash, printing and PDF export. It does not install a service or driver, change security settings, require elevation or start automatically with Windows.

In the Store package, Markdown associations are declared in the MSIX manifest and managed by Windows. Folio does not create or remove the registry registrations or shortcuts belonging to the separate GitHub installation. The OS-assigned packaged application identity is retained.

Suggested test: launch Folio from Start, use Open to select a local Markdown file or create a new document, edit and save it, add a folder, reopen a document and export it to PDF. A Markdown document named `Welcome été #100%.md` can be used to check paths with spaces and accents. Check Open with from Explorer and uninstall from Windows Settings. There is no bundled content that requires an account.

The core reading and editing features work offline. Remote images/media referenced by a user's document and Chromium spell-check dictionaries may require networking. External web links open in the user's default browser.

Folio is offered for Windows 10 version 2004 and later and Windows 11, x64. The interface supports French, English, Spanish, German, Dutch, Italian and Portuguese. The public product page and privacy policy are provided in the Store listing.
