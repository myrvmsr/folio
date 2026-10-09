// Retrieve only verified CI installers and verify every SHA256 before publication.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { github } from './github.mjs';
import { publicTargets, publicInstallers } from './release-policy.mjs';
import { qualitySchema, validateQuality, validateRunJobs } from './quality-gate.mjs';

const require = createRequire(import.meta.url);
const unzipper = require('unzipper');
const runId = process.argv[2];
if (!/^\d+$/.test(runId || '')) throw new Error('Usage: node scripts/prepare-release.mjs <successful CI run ID>');
const repository = '/repos/myrvmsr/folio-build';
const run = await github(`${repository}/actions/runs/${runId}`);
assert.equal(run.conclusion, 'success', 'All native build jobs must succeed before a release is prepared.');
const sourceMetadata = await github(`${repository}/contents/package.json?ref=${run.head_sha}`);
const sourceVersion = JSON.parse(Buffer.from(sourceMetadata.content, 'base64').toString('utf8')).version;
assert.equal(sourceVersion, JSON.parse(fs.readFileSync('package.json', 'utf8')).version, 'The tested version must match the release version.');
const { jobs } = await github(`${repository}/actions/runs/${runId}/jobs?per_page=100`);
validateRunJobs(run, jobs);
const { artifacts } = await github(`${repository}/actions/runs/${runId}/artifacts?per_page=100`);
const expectedArtifacts = publicTargets.map((target) => target.artifact);
const expectedFiles = publicInstallers;
const directory = path.resolve('.folio-checks', 'releases', runId);
fs.mkdirSync(directory, { recursive: true });
const checksums = new Map();
const quality = {};

async function extract(zipFile, destination) {
  const archive = await unzipper.Open.file(zipFile);
  for (const entry of archive.files) {
    if (entry.type === 'Directory') continue;
    const filename = path.posix.basename(entry.path);
    assert.ok(expectedFiles.includes(filename) || ['SHA256SUMS.txt', 'QUALITY.json'].includes(filename), `Unexpected artifact file: ${entry.path}`);
    fs.writeFileSync(path.join(destination, filename), await entry.buffer());
  }
}

await Promise.all(expectedArtifacts.map(async (name) => {
  const target = publicTargets.find((item) => item.artifact === name);
  const artifact = artifacts.find((item) => item.name === name && !item.expired);
  assert.ok(artifact, `Missing checked artifact: ${name}`);
  const archive = path.join(directory, `${name}.zip`);
  console.log(`Downloading ${name}...`);
  const archiveBytes = await github(`${repository}/actions/artifacts/${artifact.id}/zip`, { raw: true });
  if (artifact.digest) assert.equal(`sha256:${createHash('sha256').update(archiveBytes).digest('hex')}`, artifact.digest, `${name}: ZIP digest mismatch`);
  fs.writeFileSync(archive, archiveBytes);
  const extracted = path.join(directory, name);
  fs.mkdirSync(extracted, { recursive: true });
  await extract(archive, extracted);
  const lines = fs.readFileSync(path.join(extracted, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  const targetChecksums = {};
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (Folio-.+)$/);
    assert.ok(match && expectedFiles.includes(match[2]), 'Invalid installer checksum manifest.');
    const [, checksum, filename] = match;
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(extracted, filename))).digest('hex'), checksum, `${filename}: SHA256 mismatch`);
    assert.ok(!checksums.has(filename), `Duplicate installer: ${filename}`);
    checksums.set(filename, checksum);
    targetChecksums[filename] = checksum;
    fs.copyFileSync(path.join(extracted, filename), path.join(directory, filename));
    console.log(`Verified ${filename}`);
  }
  const report = JSON.parse(fs.readFileSync(path.join(extracted, 'QUALITY.json'), 'utf8'));
  quality[target.platform] = validateQuality(report, { version: sourceVersion, sourceCommit: run.head_sha, platform: target.platform, checksums: targetChecksums });
  console.log(`Verified full application test evidence: ${target.job}`);
}));
assert.deepEqual([...checksums.keys()].sort(), expectedFiles);
fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), [...checksums].sort().map(([filename, checksum]) => `${checksum}  ${filename}\n`).join(''));
fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ runId, sourceCommit: run.head_sha, runUrl: run.html_url,
  platforms: jobs.map((job) => job.name), checksums: Object.fromEntries(checksums),
  version: sourceVersion,
  qualitySchema, quality,
}, null, 2));
console.log(`Release installers ready: ${directory}`);
