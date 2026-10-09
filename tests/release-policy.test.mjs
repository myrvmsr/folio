import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { publicChecksums, publicManifest, publicReleaseNotes, publicTargets, publicInstallers, publicAssets, legacyAliases } from '../scripts/release-policy.mjs';

const verification = { checksums: {
  'Folio-Setup.exe': '1'.repeat(64),
  'Folio-Linux-x64.deb': '2'.repeat(64),
  'Folio-Linux-x64.AppImage': '3'.repeat(64),
  'Folio-Mac-x64.dmg': '4'.repeat(64),
  'Folio-Mac-arm64.dmg': '5'.repeat(64),
} };

test('public release excludes Mac even when the verified directory contains both Mac installers', () => {
  assert.deepEqual(Object.keys(publicChecksums(verification)), [
    'Folio-Linux-x64.AppImage', 'Folio-Linux-x64.deb', 'Folio-Setup.exe',
  ]);
  const manifest = publicManifest(verification).toString();
  assert.equal(manifest.trim().split('\n').length, 3);
  assert.doesNotMatch(manifest, /Mac|\.dmg/);
});

test('the old Plume download link serves a copy of a public installer, outside the checksum list', () => {
  assert.deepEqual(publicAssets, ['Folio-Linux-x64.AppImage', 'Folio-Linux-x64.deb', 'Folio-Setup.exe', 'Plume-Setup.exe']);
  for (const source of Object.values(legacyAliases)) assert.ok(publicInstallers.includes(source));
  assert.doesNotMatch(publicManifest(verification).toString(), /Plume/);
});

test('publication refuses a missing or invalid Windows or Linux checksum', () => {
  for (const filename of Object.keys(publicChecksums(verification))) {
    assert.throws(() => publicChecksums({ checksums: { ...verification.checksums, [filename]: undefined } }), /missing verified installer checksum/);
    assert.throws(() => publicChecksums({ checksums: { ...verification.checksums, [filename]: '../unverified' } }), /missing verified installer checksum/);
  }
});

test('release notes preserve the description and keep only verified installer checksums in a collapsed section', () => {
  const notes = publicReleaseNotes('Release notes with a download link.\n', verification);
  assert.ok(notes.startsWith('Release notes with a download link.\n\n'));
  assert.match(notes, /<details>\n<summary>Vérifier les téléchargements \(SHA-256\)<\/summary>/);
  assert.ok(notes.includes(publicManifest(verification).toString().trim()));
  assert.doesNotMatch(notes, /<details[^>]*\bopen\b|SHA256SUMS\.txt|Mac|\.dmg/);
  assert.equal(publicReleaseNotes(notes, verification), notes);
  const changed = {checksums: {...verification.checksums, 'Folio-Setup.exe': 'a'.repeat(64)}};
  const updated = publicReleaseNotes(notes, changed);
  assert.equal(updated.match(/<details>/g).length, 1);
  assert.ok(updated.includes(`${'a'.repeat(64)}  Folio-Setup.exe`));
  assert.ok(!updated.includes(`${'1'.repeat(64)}  Folio-Setup.exe`));
  assert.throws(() => publicReleaseNotes('Release notes', {checksums: {}}), /missing verified installer checksum/);
});

test('native CI targets match the allowed public release targets', () => {
  const require = createRequire(import.meta.url);
  const yaml = require('yaml');
  const workflow = yaml.parse(fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8'));
  const artifacts = workflow.jobs.build.strategy.matrix.include
    .map(({ platform, arch }) => `installers-${platform}-${arch}`).sort();
  assert.deepEqual(artifacts, publicTargets.map((target) => target.artifact).sort());
});
