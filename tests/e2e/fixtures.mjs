import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test as base, expect, _electron } from '@playwright/test';

const require = createRequire(import.meta.url);
const root = path.resolve('.');
export const article = '# Folio test\n\n## Reading\n\nAn **important** note for été. Another été.\n\n[Second note](Second%20note.md)\n\n```js\nconsole.log("Folio");\n```\n\n$$x^2 + y^2 = z^2$$\n\n```mermaid\nflowchart LR\n A[Read] --> B[Edit]\n```\n\n| Name | Value |\n| --- | --- |\n| Folio | Markdown |\n\n- [ ] Finish this task\n\n> [!NOTE]\n> A note to remember.\n\nA footnote[^1].\n\n[^1]: More information.\n\n## Last section\n\nEnd of the document.\n';

export const test = base.extend({
  folio: async ({}, use, info) => {
    const label = process.env.FOLIO_E2E_LABEL || 'source';
    const fixturesRoot = path.join(root, '.folio-checks/e2e', label, 'fixtures');
    fs.mkdirSync(fixturesRoot, { recursive: true });
    const directory = fs.mkdtempSync(path.join(fixturesRoot, 'case-'));
    const notes = path.join(directory, 'Notes été #100%');
    const extra = path.join(directory, 'Other notes');
    const profile = path.join(directory, 'profile');
    for (const folder of [notes, extra, profile]) fs.mkdirSync(folder);
    const file = path.join(notes, 'Welcome été #100%.md');
    const second = path.join(notes, 'Second note.md');
    fs.writeFileSync(file, article);
    fs.writeFileSync(second, '# Second note\n\nThis is another document.\n');
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
      language: 'en', theme: 'light', folders: [notes, extra], filesPanel: true,
      filesExpanded: [notes, extra], spellcheck: false,
    }));
    let app;
    let page;
    let launchNumber = 0;
    const rendererErrors = [];
    const log = [];

    async function stop() {
      if (!app) return;
      const current = app;
      app = null;
      const trace = info.outputPath(`trace-${launchNumber}.zip`);
      await current.context().tracing.stop({ path: trace });
      await info.attach(`trace-${launchNumber}`, { path: trace, contentType: 'application/zip' });
      // Discard only leftover edits in the isolated fixture during cleanup.
      await current.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
      await current.close();
    }

    async function launch(files = [file]) {
      const env = { ...process.env, FOLIO_E2E: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      const executablePath = process.env.FOLIO_E2E_EXECUTABLE || require('electron');
      const args = [...(process.env.FOLIO_E2E_EXECUTABLE ? [] : [root]), `--test-userdata=${profile}`, ...files];
      app = await _electron.launch({ executablePath, args, cwd: root, env, chromiumSandbox: true, colorScheme: null, timeout: 20000 });
      launchNumber += 1;
      app.process().stdout?.on('data', (bytes) => log.push(bytes.toString()));
      app.process().stderr?.on('data', (bytes) => log.push(bytes.toString()));
      await expect.poll(() => app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
      expect(await app.evaluate(({ app }) => app.getVersion())).toBe(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version);
      await app.context().setOffline(true);
      await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
      await app.evaluate(({ dialog, clipboard, shell }) => {
        globalThis.folioTestDialogs = [];
        globalThis.folioTestClipboard = '';
        globalThis.folioTestExternal = [];
        clipboard.writeText = (text) => { globalThis.folioTestClipboard = text; };
        shell.openExternal = async (url) => { globalThis.folioTestExternal.push(url); };
        dialog.showMessageBox = async (_window, options) => {
          globalThis.folioTestDialogs.push(options);
          return { response: 2 };
        };
      });
      page = await app.firstWindow();
      page.on('pageerror', (error) => rendererErrors.push(error.message));
      page.on('crash', () => rendererErrors.push('Renderer process crashed'));
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.locator('.doc-view:not([hidden]) .markdown-body h1')).toBeVisible();
      return page;
    }

    const driver = {
      directory, notes, extra, profile, file, second,
      get page() { return page; },
      get app() { return app; },
      async restart() { await stop(); return launch([]); },
      async open(paths) {
        await app.evaluate(({ dialog }, filePaths) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
        }, paths);
        await page.keyboard.press('Control+o');
      },
      async saveDialog(filePath) {
        await app.evaluate(({ dialog }, output) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
        }, filePath);
      },
    };
    try {
      await launch();
      await use(driver);
      expect(rendererErrors, 'The renderer must not crash or report an unhandled exception').toEqual([]);
    } finally {
      if (page && !page.isClosed()) {
        const capture = info.outputPath('capture.png');
        await page.screenshot({ path: capture }).catch(() => {});
        if (fs.existsSync(capture)) await info.attach('application', { path: capture, contentType: 'image/png' });
      }
      const processLog = info.outputPath('process.log');
      fs.writeFileSync(processLog, log.join(''));
      await info.attach('process log', { path: processLog, contentType: 'text/plain' });
      await stop();
    }
  },
});
export { expect };

export const activeArticle = (page) => page.locator('.doc-view:not([hidden]) .markdown-body');
export const editor = (page) => page.locator('.doc-view:not([hidden]) .cm-content');
export async function settings(page, section) {
  // Let the previous modal finish its closing animation before opening another.
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await page.keyboard.press('Control+,');
  await page.locator(`.modal-overlay:not(.closing) .settings-nav-item[data-section="${section}"]`).click();
}
