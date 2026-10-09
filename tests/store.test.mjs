import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { previewIdentity, storeConfiguration, storeVersion, validateStoreIdentity } from '../scripts/store-config.mjs';
const require = createRequire(import.meta.url);
const identity = { identityName: '12345.Developer.Folio', publisher: 'CN=11111111-2222-3333-4444-555555555555', publisherDisplayName: 'Folio' };
const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('Store build refuses missing identity, untouched examples and preview identity', () => {
  assert.throws(() => validateStoreIdentity(null));
  assert.throws(() => validateStoreIdentity(JSON.parse(fs.readFileSync('store/identity.example.json', 'utf8'))));
  assert.throws(() => validateStoreIdentity(previewIdentity), /validation/);
  assert.throws(() => validateStoreIdentity({ ...identity, publisher: 'unknown' }), /CN=/);
  assert.throws(() => validateStoreIdentity({ ...identity, identityName: ' Folio ' }));
  assert.equal(validateStoreIdentity(identity).identityName, identity.identityName);
});

test('Store version leaves the fourth segment at zero and rejects unsupported versions', () => {
  assert.equal(storeVersion('1.3.0'), '1.3.0.0');
  assert.equal(storeVersion('65535.65535.65535'), '65535.65535.65535.0');
  for (const version of ['0.3.0', '1.3.0.5', '1.3.0-beta.1', '65536.0.0', '01.3.0']) assert.throws(() => storeVersion(version));
});

test('Store packaging has separate outputs and preserves the GitHub installer settings', () => {
  const before = JSON.stringify(metadata);
  const config = storeConfiguration(metadata, identity, { root: process.cwd() });
  const preview = storeConfiguration(metadata, previewIdentity, { root: process.cwd(), preview: true });
  assert.equal(config.directories.output, 'release/store');
  assert.equal(preview.directories.output, 'release/store-preview');
  assert.deepEqual(config.win.target, [{ target: 'appx', arch: ['x64'] }]);
  assert.equal(config.win.signExecutable, false);
  assert.equal(config.appx.applicationId, 'Folio');
  assert.equal(config.appx.setBuildNumber, false);
  assert.deepEqual(config.appx.capabilities, ['runFullTrust']);
  assert.equal(config.appx.addAutoLaunchExtension, false);
  assert.match(config.appx.artifactName, /\.msix$/);
  assert.equal(JSON.stringify(metadata), before);
  assert.equal(metadata.build.win.target[0].target, 'nsis');
});

test('Microsoft publisher names with XML characters remain valid in the manifest', () => {
  const config = storeConfiguration(metadata, { ...identity, publisherDisplayName: 'Notes & "Folio" <Tools>' }, { root: process.cwd() });
  assert.equal(config.appx.publisherDisplayName, 'Notes &amp; &quot;Folio&quot; &lt;Tools&gt;');
});

function integration(windowsStore, executable = 'C:\\Apps\\Folio.exe') {
  const module = { exports: {} };
  const forbidden = () => { throw new Error('Unexpected registry, shortcut or filesystem operation'); };
  const context = {
    module, process: { platform: 'win32', execPath: executable, windowsStore }, Buffer,
    require: (name) => {
      if (name === 'electron') return { app: { getPath: forbidden }, shell: { readShortcutLink: forbidden, writeShortcutLink: forbidden } };
      if (name === 'node:fs') return new Proxy({}, { get: () => forbidden });
      if (name === 'node:child_process') return { execFile: forbidden };
      if (name === 'node:path') return path.win32;
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync('src/main/windows-integration.js', 'utf8'), context);
  return module.exports;
}

test('Store installation owns its associations and never edits GitHub registrations or shortcuts', async () => {
  const api = integration(true);
  assert.equal(api.canIntegrate(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(api.status())), { available: false, registered: true, managedByStore: true });
  await api.register({ appId: 'com.folio.markdown', appRoot: 'C:\\Apps' });
  await api.unregister();
});

test('GitHub installation keeps manual integration, while development stays unavailable', () => {
  assert.equal(integration(false).canIntegrate(), true);
  assert.equal(integration(false, 'C:\\Tools\\electron.exe').canIntegrate(), false);
});
