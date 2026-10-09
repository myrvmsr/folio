import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { publicChecksums, publicManifest, publicTargets } from '../scripts/release-policy.mjs';

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

test('publication refuses a missing or invalid Windows or Linux checksum', () => {
  for (const filename of Object.keys(publicChecksums(verification))) {
    assert.throws(() => publicChecksums({ checksums: { ...verification.checksums, [filename]: undefined } }), /missing verified installer checksum/);
    assert.throws(() => publicChecksums({ checksums: { ...verification.checksums, [filename]: '../unverified' } }), /missing verified installer checksum/);
  }
});

test('native CI targets match the allowed public release targets', () => {
  const require = createRequire(import.meta.url);
  const yaml = require('yaml');
  const workflow = yaml.parse(fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8'));
  const artifacts = workflow.jobs.build.strategy.matrix.include
    .map(({ platform, arch }) => `installers-${platform}-${arch}`).sort();
  assert.deepEqual(artifacts, publicTargets.map((target) => target.artifact).sort());
});
