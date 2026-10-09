import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { createPathUtils, platformShortcut } = require('../src/shared/platform.js');

for (const platform of ['win32', 'darwin', 'linux']) {
  const utils = createPathUtils(platform);
  const windows = platform === 'win32';
  const root = windows ? 'C:\\Notes' : '/home/notes';
  const file = utils.joinPath(root, 'Été #100%.md');
  test(`${platform}: paths, root folders and file URL round trips`, () => {
    assert.equal(utils.basename(file), 'Été #100%.md');
    assert.equal(utils.dirname(file), root);
    assert.equal(utils.fromFileUrl(utils.toFileUrl(file)), file);
    assert.equal(utils.dirname(windows ? 'C:\\note.md' : '/note.md'), windows ? 'C:\\' : '/');
    assert.equal(utils.joinPath(windows ? 'C:\\' : '/', 'note.md'), windows ? 'C:\\note.md' : '/note.md');
    assert.equal(utils.isSameOrInside(file, root), true);
    assert.equal(utils.isSameOrInside(`${root}book`, root), false);
    assert.equal(utils.isSameOrInside(file, windows ? 'C:\\' : '/'), true);
    assert.equal(utils.relocatePath(file, root, utils.joinPath(root, 'Archive')), utils.joinPath(utils.joinPath(root, 'Archive'), 'Été #100%.md'));
    assert.equal(utils.samePath(utils.joinPath(root, 'Note.md'), utils.joinPath(root, 'note.md')), windows);
    if (!windows) assert.equal(utils.basename('/notes/a\\b.md'), 'a\\b.md');
    if (windows) assert.equal(utils.fromFileUrl('file://server/share/a%20b.md'), '\\\\server\\share\\a b.md');
  });

  const loadRenderer = (entry) => {
    const code = buildSync({ entryPoints: [entry], bundle: true, format: 'cjs', platform: 'browser', write: false }).outputFiles[0].text;
    const context = { window: { folio: { platform } }, module: { exports: {} }, URL, console, Intl };
    vm.runInNewContext(code, context);
    return context.module.exports;
  };
  test(`${platform}: renderer resolves relative Markdown links`, () => {
    const renderer = loadRenderer('src/renderer/util.js');
    const source = utils.joinPath(root, 'source.md');
    const result = renderer.resolveLink(source, 'Été%20%23100%25.md#titre');
    assert.equal(result.path, file);
    assert.equal(result.hash, 'titre');
    assert.equal(renderer.samePath(utils.joinPath(root, 'Note.md'), utils.joinPath(root, 'note.md')), windows);
  });
  test(`${platform}: native shortcut defaults, event matching and customization`, () => {
    const shortcuts = loadRenderer('src/renderer/shortcuts.js');
    const expected = platform === 'darwin' ? 'Meta+S' : 'Ctrl+S';
    assert.equal(shortcuts.effectiveBindings({}).save[0], expected);
    assert.equal(shortcuts.buildKeymap({}).get(expected), 'save');
    const event = { key: 's', code: 'KeyS', ctrlKey: platform !== 'darwin', metaKey: platform === 'darwin' };
    assert.equal(shortcuts.comboFromEvent(event), expected);
    const custom = shortcuts.withBinding({}, 'save', { index: 0, combo: platformShortcut('Ctrl+Alt+S', platform) });
    assert.equal(shortcuts.effectiveBindings(custom).save[0], platformShortcut('Ctrl+Alt+S', platform));
    assert.equal(shortcuts.withDefaults(custom, 'save').save, undefined);
    assert.notEqual(shortcuts.validateCombo(platformShortcut('Ctrl+C', platform)), null);
    if (platform === 'darwin') {
      assert.equal(shortcuts.formatCombo('Meta+S'), '⌘+S');
      assert.notEqual(shortcuts.validateCombo('Meta+Q'), null);
      assert.equal(shortcuts.buildKeymap({}).get('Ctrl+Tab'), 'nextTab');
      assert.equal(shortcuts.effectiveBindings({}).fullscreen[0], 'Ctrl+Meta+F');
      assert.equal(shortcuts.effectiveBindings({}).replace[0], 'Alt+Meta+F');
    }
  });
}
