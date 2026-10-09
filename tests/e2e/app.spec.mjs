import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, expect, activeArticle, editor, settings, article } from './fixtures.mjs';
import { scenarios } from './scenarios.mjs';
const require = createRequire(import.meta.url);
const { LANGUAGES } = require('../../src/shared/i18n.js');

test(scenarios.rendering, async ({ folio }) => {
  const page = folio.page;
  await expect(activeArticle(page).locator('h1')).toHaveText('Folio test');
  await expect(activeArticle(page).locator('strong')).toHaveText('important');
  await expect(activeArticle(page).locator('table')).toHaveCount(1);
  await expect(activeArticle(page).locator('.katex')).toHaveCount(1);
  await expect(activeArticle(page).locator('.mermaid-svg svg')).toHaveCount(1);
  await expect(activeArticle(page).locator('pre code.language-js')).toContainText('console.log');
  await expect(page.locator('#outline-list')).toContainText('Last section');
  expect(await folio.app.evaluate(({ app }) => app.isPackaged)).toBe(Boolean(process.env.FOLIO_E2E_EXECUTABLE));
});

test(scenarios.editing, async ({ folio }) => {
  const page = folio.page;
  await page.keyboard.press('Control+e');
  await editor(page).fill('# Edited note\n\nSaved from the real editor.');
  await expect(activeArticle(page).locator('h1')).toHaveText('Edited note');
  await expect.poll(() => fs.readFileSync(folio.file, 'utf8')).toContain('Saved from the real editor.');
  await expect(page.locator('.tab.dirty:visible')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+p');
  await expect(page.locator('.doc-view:not([hidden]) .preview-pane')).toBeHidden();
  await expect(editor(page)).toBeVisible();
});

test(scenarios.newFile, async ({ folio }) => {
  const page = folio.page;
  const target = path.join(folio.notes, 'New document.md');
  await folio.saveDialog(target);
  await page.keyboard.press('Control+n');
  await editor(page).fill('# A new document\n\nMy first line.');
  await page.keyboard.press('Control+s');
  await expect.poll(() => fs.existsSync(target) && fs.readFileSync(target, 'utf8')).toContain('My first line.');
  await expect(page.locator('.tab.active:visible')).toContainText('New document');
});

test(scenarios.unsaved, async ({ folio }) => {
  const page = folio.page;
  await settings(page, 'behavior');
  await page.getByRole('combobox', { name: 'Auto save', exact: true }).selectOption('off');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+e');
  await editor(page).fill('# Manual save\n\nDo not lose this text.');
  await expect(page.locator('.tab.active:visible')).toHaveClass(/dirty/);
  expect(fs.readFileSync(folio.file, 'utf8')).toBe(article);
  await page.keyboard.press('Control+w');
  await expect.poll(() => folio.app.evaluate(() => globalThis.folioTestDialogs.length)).toBe(1);
  await expect(editor(page)).toContainText('Do not lose this text.');
  await folio.app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  await page.keyboard.press('Control+w');
  await expect(page.locator('.tab:visible')).toHaveCount(0);
  expect(fs.readFileSync(folio.file, 'utf8')).toContain('Do not lose this text.');
});

test(scenarios.tasks, async ({ folio }) => {
  const page = folio.page;
  await activeArticle(page).locator('.task-checkbox').check();
  await expect.poll(() => fs.readFileSync(folio.file, 'utf8')).toContain('- [x] Finish this task');
  await activeArticle(page).getByRole('link', { name: 'Second note', exact: true }).click();
  await expect(activeArticle(page).locator('h1')).toHaveText('Second note');
  await expect(page.locator('.tab:visible')).toHaveCount(2);
});

test(scenarios.search, async ({ folio }) => {
  const page = folio.page;
  await page.keyboard.press('Control+f');
  await page.locator('#find-input').fill('ete');
  await expect(page.locator('#find-count')).toHaveText('1 of 2');
  await page.locator('#find-next').click();
  await expect(page.locator('#find-count')).toHaveText('2 of 2');
  await page.keyboard.press('Escape');
  await expect(page.locator('#findbar')).toBeHidden();
  await page.locator('#outline-list').getByText('Last section', { exact: true }).click();
  await expect(activeArticle(page).getByRole('heading', { name: 'Last section' })).toBeInViewport();
});

test(scenarios.tabs, async ({ folio }) => {
  const page = folio.page;
  await folio.open([folio.second]);
  await expect(page.locator('.tab:visible')).toHaveCount(2);
  await expect(activeArticle(page).locator('h1')).toHaveText('Second note');
  await page.keyboard.press('Control+Tab');
  await expect(activeArticle(page).locator('h1')).toHaveText('Folio test');
  await page.keyboard.press('Control+w');
  await expect(page.locator('.tab:visible')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+t');
  await expect(page.locator('.tab:visible')).toHaveCount(2);
  await expect(activeArticle(page).locator('h1')).toHaveText('Folio test');
  await settings(page, 'tabs');
  await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#vtabs-list .tab')).toHaveCount(2);
  await page.keyboard.press('Control+Shift+b');
  await expect(page.locator('#app')).toHaveClass(/vtabs-collapsed/);
  await page.keyboard.press('Control+Shift+m');
  await expect(page.locator('#app')).toHaveClass(/vtabs-hidden/);
});

async function createSpace(page, name) {
  await settings(page, 'tabs');
  await page.getByRole('button', { name: 'New space', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New space', exact: true });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Create space', exact: true }).click();
  await page.keyboard.press('Escape');
}

test(scenarios.spaces, async ({ folio }) => {
  const page = folio.page;
  await createSpace(page, 'Project');
  await expect(page.locator('#welcome')).toContainText('Project');
  await folio.open([folio.second]);
  await expect(activeArticle(page).locator('h1')).toHaveText('Second note');
  await page.locator('.tab.active:visible').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Main', exact: true }).click();
  await expect(page.locator('.tab:visible')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+PageDown');
  await expect(page.locator('.tab:visible')).toHaveCount(2);
  await page.locator('.tab:visible').filter({ hasText: 'Second note' }).click();
  await expect(activeArticle(page).locator('h1')).toHaveText('Second note');
});

test(scenarios.appearance, async ({ folio }) => {
  const page = folio.page;
  await settings(page, 'appearance');
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  await page.getByRole('radio', { name: 'Aa Mono', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
  const color = page.getByRole('textbox', { name: 'Color code', exact: true }).first();
  await color.fill('#3366AA');
  await color.press('Enter');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(folio.profile, 'settings.json'))).colors?.accent).toBe('#3366aa');
  await page.locator('.settings-nav-item[data-section="language"]').click();
  for (const { code, name } of LANGUAGES.filter((language) => language.code !== 'en')) {
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', require(`../../src/shared/locales/${code}.js`)['action.settings']);
  }
  await page.getByRole('radio', { name: /^English/ }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', 'Settings');
  await page.keyboard.press('Escape');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(folio.profile, 'settings.json'))).theme).toBe('dark');
  if (process.platform === 'win32') {
    // Exercise the Store branch in the isolated test process without registering
    // an unsigned MSIX or changing the computer's security settings.
    await folio.app.evaluate(() => { process.windowsStore = true; });
    await settings(page, 'windows');
    await expect(page.getByText('The Microsoft Store adds Folio to the Start menu and to Open with for Markdown files.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Integrate', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await expect.poll(() => folio.app.evaluate(() => globalThis.folioTestExternal.at(-1))).toBe('ms-settings:defaultapps');
  }
});

test(scenarios.folders, async ({ folio }) => {
  const page = folio.page;
  await expect(page.locator('.ft-row.is-root')).toHaveCount(2);
  const firstRoot = page.locator('.ft-row.is-root').filter({ hasText: 'Notes été #100%' });
  await firstRoot.hover();
  await firstRoot.locator('[data-act="file"]').click();
  await page.locator('.ft-input').fill('Created note');
  await page.locator('.ft-input').press('Enter');
  await expect.poll(() => fs.existsSync(path.join(folio.notes, 'Created note.md'))).toBe(true);
  await expect(page.locator('.ft-input')).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await firstRoot.hover();
  await firstRoot.locator('[data-act="folder"]').click();
  await page.locator('.ft-input').fill('invalid/name');
  await page.locator('.ft-input').press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'A name can’t contain the characters' })).toBeVisible();
  await expect(page.locator('.ft-input')).toBeVisible();
  expect(fs.existsSync(path.join(folio.notes, 'invalid'))).toBe(false);
  await page.locator('.ft-input').fill('Storage');
  await page.locator('.ft-input').press('Enter');
  await expect.poll(() => fs.existsSync(path.join(folio.notes, 'Storage'))).toBe(true);
  await expect(page.locator('.ft-input')).toHaveCount(0);
  const row = page.locator('.ft-row:not(.is-root)').filter({ hasText: 'Created note' });
  await row.click();
  await row.press('F2');
  // A slow disk must not let the test resubmit while collision detection is pending.
  // The real stat and rename handlers still run; only this one lookup is delayed.
  await folio.app.evaluate((_electron, destination) => {
    const filesystem = process.getBuiltinModule('fs').promises;
    const stat = filesystem.stat;
    globalThis.folioTestRenameLookupDelayed = false;
    filesystem.stat = async function (filename, ...options) {
      if (String(filename) === destination) {
        filesystem.stat = stat;
        globalThis.folioTestRenameLookupDelayed = true;
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      return stat.call(filesystem, filename, ...options);
    };
  }, folio.second);
  await page.locator('.ft-input').fill('Second note');
  await page.locator('.ft-input').press('Enter');
  await expect(page.getByRole('status').filter({ hasText: '“Second note.md” already exists here.' })).toBeVisible();
  expect(await folio.app.evaluate(() => globalThis.folioTestRenameLookupDelayed)).toBe(true);
  await expect(page.locator('.ft-input')).toBeVisible();
  expect(fs.readFileSync(folio.second, 'utf8')).toContain('This is another document.');
  await page.locator('.ft-input').fill('Renamed note');
  await page.locator('.ft-input').press('Enter');
  await expect.poll(() => fs.existsSync(path.join(folio.notes, 'Renamed note.md'))).toBe(true);
  await expect(page.locator('.ft-input')).toHaveCount(0);
  await expect(page.locator('.tab.active:visible')).toContainText('Renamed note');
});

test(scenarios.external, async ({ folio }) => {
  const page = folio.page;
  fs.writeFileSync(folio.file, '# Changed by another app\n');
  await expect(activeArticle(page).locator('h1')).toHaveText('Changed by another app');
  await settings(page, 'behavior');
  await page.getByRole('combobox', { name: 'Auto save', exact: true }).selectOption('off');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+e');
  await editor(page).fill('# My unsaved text\n');
  await expect(page.locator('.tab.active:visible')).toHaveClass(/dirty/);
  fs.writeFileSync(folio.file, '# External conflict\n');
  await expect(page.locator('.doc-view:not([hidden]) .doc-banner')).toContainText('changed by another program');
  await expect(editor(page)).toContainText('My unsaved text');
  await page.getByRole('button', { name: 'Keep my version', exact: true }).click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => fs.readFileSync(folio.file, 'utf8')).toContain('My unsaved text');
});

test(scenarios.restart, async ({ folio }) => {
  let page = folio.page;
  await createSpace(page, 'Keep this workspace');
  await folio.open([folio.second]);
  await expect(activeArticle(page).locator('h1')).toHaveText('Second note');
  await settings(page, 'appearance');
  await page.getByRole('radio', { name: 'Aa Serif', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(folio.profile, 'settings.json'))).font).toBe('serif');
  page = await folio.restart();
  await expect(activeArticle(page).locator('h1')).toHaveText('Second note');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'serif');
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  await expect(page.locator('#space-switch')).toContainText('Keep this workspace');
  await expect(page.locator('.ft-row.is-root')).toHaveCount(2);
  await page.keyboard.press('Control+Shift+PageDown');
  await expect(activeArticle(page).locator('h1')).toHaveText('Folio test');
});

test(scenarios.export, async ({ folio }) => {
  const page = folio.page;
  const target = path.join(folio.directory, 'Export.pdf');
  await folio.saveDialog(target);
  await activeArticle(page).locator('.code-copy').first().click();
  await expect.poll(() => folio.app.evaluate(() => globalThis.folioTestClipboard)).toContain('console.log("Folio");');
  await page.keyboard.press('Control+Shift+e');
  await expect.poll(() => fs.existsSync(target) && fs.statSync(target).size).toBeGreaterThan(1000);
  expect(fs.readFileSync(target).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByRole('status').filter({ hasText: 'PDF exported' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/printing/);
});

test(scenarios.errors, async ({ folio }) => {
  const page = folio.page;
  fs.unlinkSync(folio.file);
  await expect(page.locator('.doc-view:not([hidden]) .doc-banner')).toContainText('File not found');
  fs.writeFileSync(folio.file, '# Recovered document\n');
  await expect(activeArticle(page).locator('h1')).toHaveText('Recovered document');
  await expect(page.locator('.doc-view:not([hidden]) .doc-banner')).toBeHidden();
  await expect(page.locator('.tab.missing:visible')).toHaveCount(0);
});

test(scenarios.shortcuts, async ({ folio }) => {
  const page = folio.page;
  await page.keyboard.press('F1');
  const chip = page.locator('.sc-row[data-action="toggleEdit"] .sc-chip:not(.locked)').first();
  await chip.click();
  await expect(chip).toHaveClass(/recording/);
  await page.keyboard.press('Control+o');
  await expect(page.getByRole('dialog')).toContainText('already used');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(chip).toHaveText('Ctrl+E');
  await chip.click();
  await expect(chip).toHaveClass(/recording/);
  await page.keyboard.press('Control+Alt+e');
  await expect(page.locator('.sc-row[data-action="toggleEdit"]')).toContainText('Ctrl+Alt+E');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+e');
  await expect(editor(page)).toBeVisible();
});

test(scenarios.untrusted, async ({ folio }) => {
  const page = folio.page;
  const file = path.join(folio.notes, 'Untrusted.md');
  fs.writeFileSync(file, '# Untrusted document\n\n<script>window.folioInjected = true</script>\n<img src="missing-image" onerror="window.folioInjected = true">\n\n[Unsafe link](javascript:window.folioInjected=true)\n');
  await folio.open([file]);
  await expect(activeArticle(page).locator('h1')).toHaveText('Untrusted document');
  await expect(activeArticle(page).locator('script, [onerror], a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.folioInjected)).toBeUndefined();
  await expect(page.locator('#app')).toBeVisible();
});
