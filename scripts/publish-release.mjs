import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { github } from './github.mjs';
import { publicChecksums, publicManifest, publicPlatformNames } from './release-policy.mjs';
import { validateReleaseEvidence, validateRunJobs } from './quality-gate.mjs';
const directory = path.resolve(process.argv[2] || '');
const publish = process.argv.includes('--publish');
const verification = JSON.parse(fs.readFileSync(path.join(directory, 'verification.json'), 'utf8'));
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
assert.equal(verification.version, version);
validateReleaseEvidence(verification);
const checksums = publicChecksums(verification);
const filenames = [...Object.keys(checksums), 'SHA256SUMS.txt'].sort();
const payloads = new Map(filenames.map((filename) => {
  const bytes = filename === 'SHA256SUMS.txt' ? publicManifest(verification) : fs.readFileSync(path.join(directory, filename));
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (filename !== 'SHA256SUMS.txt') assert.equal(checksum, checksums[filename], `${filename}: local installer was changed after testing.`);
  return [filename, { bytes, checksum }];
}));
const run = await github(`/repos/myrvmsr/folio-build/actions/runs/${verification.runId}`);
assert.equal(run.conclusion, 'success');
assert.equal(run.head_sha, verification.sourceCommit);
const { jobs } = await github(`/repos/myrvmsr/folio-build/actions/runs/${verification.runId}/jobs?per_page=100`);
validateRunJobs(run, jobs);
const repository = '/repos/myrvmsr/folio';
const tag = `v${version}`;
const releases = await github(`${repository}/releases?per_page=100`);
let release = releases.find((item) => item.tag_name === tag);
const notes = fs.readFileSync('publication/release-notes.md', 'utf8');
if (!release) release = await github(`${repository}/releases`, { method: 'POST', body: {
  tag_name: tag, target_commitish: execFileSync('git', ['-C', 'publication', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  name: `Folio ${version} — ${publicPlatformNames}`, body: notes, draft: true, prerelease: false,
} });
if (!release.draft) throw new Error('This version is already public; do not replace published installers.');
assert.ok(release.assets.every((asset) => filenames.includes(asset.name)), 'The draft contains installers outside the public distribution policy.');
for (const filename of filenames) {
  const { bytes, checksum } = payloads.get(filename);
  let asset = release.assets.find((item) => item.name === filename);
  if (!asset) {
    console.log(`Uploading ${filename}...`);
    asset = await github(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(filename)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
    });
  }
  assert.equal(asset.size, bytes.length, `${filename}: uploaded size mismatch`);
  if (asset.digest) assert.equal(asset.digest, `sha256:${checksum}`, `${filename}: uploaded digest mismatch`);
}
release = await github(`${repository}/releases/${release.id}`);
assert.deepEqual(release.assets.map((asset) => asset.name).sort(), filenames);
if (publish) {
  release = await github(`${repository}/releases/${release.id}`, { method: 'PATCH', body: { draft: false, name: `Folio ${version} — ${publicPlatformNames}`, body: notes, make_latest: 'true' } });
}
console.log(JSON.stringify({ url: release.html_url, draft: release.draft, assets: release.assets.map((asset) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url })) }, null, 2));
