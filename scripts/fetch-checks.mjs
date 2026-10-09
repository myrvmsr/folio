import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { github } from './github.mjs';
import { readUiResults } from './quality-gate.mjs';
const unzipper = createRequire(import.meta.url)('unzipper');
const runId = process.argv[2];
if (!/^\d+$/.test(runId || '')) throw new Error('A build run ID is required.');
const { artifacts } = await github(`/repos/myrvmsr/folio-build/actions/runs/${runId}/artifacts?per_page=100`);
const reports = artifacts.filter((artifact) => artifact.name.startsWith('checks-') && !artifact.expired);
if (!reports.length) throw new Error('Verification reports are not available yet.');
const summary = [];
const uiSuites = [];
for (const artifact of reports) {
  const destination = path.resolve('.folio-checks', 'native', runId, artifact.name);
  fs.mkdirSync(destination, { recursive: true });
  const archiveBytes = await github(`/repos/myrvmsr/folio-build/actions/artifacts/${artifact.id}/zip`, { raw: true });
  if (artifact.digest) assert.equal(`sha256:${createHash('sha256').update(archiveBytes).digest('hex')}`, artifact.digest, 'Verification archive digest mismatch.');
  const archive = await unzipper.Open.buffer(archiveBytes);
  for (const entry of archive.files) {
    if (entry.type === 'Directory') continue;
    const filename = path.resolve(destination, entry.path);
    if (!filename.startsWith(`${destination}${path.sep}`) || !/\.(png|pdf|json|log|xml|html|zip|md)$/.test(filename)) throw new Error('Unexpected report entry.');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const bytes = await entry.buffer();
    fs.writeFileSync(filename, bytes);
    if (filename.endsWith('capture.png.json')) {
      const report = JSON.parse(bytes);
      if (report.failures.length) throw new Error(`Failed native report: ${filename}`);
      summary.push({ platform: report.platform, arch: report.arch, checks: report.checks.length, packaged: report.packaged, filename });
    }
    if (/^e2e\/[a-z0-9-]+\/results\.json$/.test(entry.path)) {
      const results = JSON.parse(bytes);
      const { label, platform, version } = results.config.metadata;
      uiSuites.push({ label, platform, version, ...readUiResults(results, { label, nativePlatform: platform, version }), filename });
    }
  }
}
const result = { reports: summary, checks: summary.reduce((total, item) => total + item.checks, 0), uiSuites,
  uiScenarios: uiSuites.reduce((total, item) => total + item.passed, 0),
};
fs.writeFileSync(path.resolve('.folio-checks', 'native', runId, 'summary.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
