import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { publicTargets } from './release-policy.mjs';
import { qualitySchema, readUiResults, validateQuality } from './quality-gate.mjs';

const platform = process.argv[2];
const target = publicTargets.find((item) => item.platform === platform);
assert.ok(target, 'Specify a public build platform: win or linux.');
assert.equal(process.platform, target.nativePlatform, 'The installable package must be checked on its native operating system.');
const read = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const version = read('package.json').version;
const sourceCommit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const suites = {};
for (const label of ['source', ...target.packages]) {
  suites[label] = { ui: readUiResults(read(path.join('.folio-checks/e2e', label, 'results.json')), { label, nativePlatform: target.nativePlatform, version }) };
  if (label !== 'source') suites[label].smoke = read(path.join('.folio-checks', label, 'smoke-summary.json'));
}
const checksums = {};
for (const line of fs.readFileSync('release/SHA256SUMS.txt', 'utf8').trim().split('\n')) {
  const match = line.match(/^([a-f0-9]{64})  (Folio-.+)$/);
  assert.ok(match, 'Invalid installer checksum manifest.');
  if (target.files.includes(match[2])) checksums[match[2]] = match[1];
}
const report = { schema: qualitySchema, version, sourceCommit, platform: process.platform, arch: process.arch,
  unit: read('.folio-checks/unit/results.json'), locales: read('.folio-checks/locales/results.json'), suites, checksums, completedAt: new Date().toISOString(),
};
validateQuality(report, { version, sourceCommit, platform, checksums });
fs.writeFileSync('release/QUALITY.json', JSON.stringify(report, null, 2));
console.log(`Quality gate passed: ${target.job}, ${Object.values(suites).reduce((total, suite) => total + suite.ui.passed, 0)} complete UI scenarios, ${report.unit.passed} unit tests, all native smoke checks.`);
