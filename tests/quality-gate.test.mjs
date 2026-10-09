import test from 'node:test';
import assert from 'node:assert/strict';
import { qualitySchema, requiredSteps, smokeScenarios, validateQuality, validateReleaseEvidence, validateRunJobs, readUiResults } from '../scripts/quality-gate.mjs';
import { publicTargets } from '../scripts/release-policy.mjs';
import { scenarios } from './e2e/scenarios.mjs';

const version = '1.3.0';
const sourceCommit = 'a'.repeat(40);
const checksums = Object.fromEntries(publicTargets.flatMap((target) => target.files).map((name) => [name, 'b'.repeat(64)]));
const completeUi = () => ({ passed: Object.keys(scenarios).length, cases: Object.values(scenarios).sort(), failed: 0, skipped: 0, flaky: 0 });
function complete(target) {
  return { schema: qualitySchema, version, sourceCommit, platform: target.nativePlatform, arch: 'x64',
    unit: { status: 'passed', total: 20, passed: 20, failed: 0, canceled: 0, skipped: 0, todo: 0 },
    locales: { problems: 0, languages: ['fr', 'en', 'es', 'de', 'nl', 'it', 'pt'] },
    suites: Object.fromEntries(['source', ...target.packages].map((label) => [label, {
      ui: completeUi(), ...(label === 'source' ? {} : { smoke: {
        version, platform: target.nativePlatform, arch: 'x64', packaged: true, failures: 0,
        scenarios: smokeScenarios.map((scenario) => ({ scenario, version, platform: target.nativePlatform, packaged: true, failures: [], checks: [{ ok: true }], pdf: true })),
      } }),
    }])), checksums: Object.fromEntries(target.files.map((file) => [file, checksums[file]])),
  };
}
const validate = (report, target = publicTargets[0]) => validateQuality(report, { version, sourceCommit, platform: target.platform, checksums });

test('release requires complete evidence for Windows, Linux DEB and Linux AppImage', () => {
  validateReleaseEvidence({ qualitySchema, version, sourceCommit, checksums,
    quality: Object.fromEntries(publicTargets.map((target) => [target.platform, complete(target)])),
  });
});
test('an old green build without the complete application test evidence is refused', () => {
  assert.throws(() => validateReleaseEvidence({ version, sourceCommit, checksums }), /no current complete quality evidence/);
});
test('a missing global scenario or a partial UI suite prevents publication', () => {
  const report = complete(publicTargets[0]);
  report.suites.source.ui.cases.pop();
  assert.throws(() => validate(report), /incomplete UI suite/);
});
test('a failed, skipped or unstable UI scenario prevents publication', () => {
  for (const key of ['failed', 'skipped', 'flaky']) {
    const report = complete(publicTargets[0]);
    report.suites.installed.ui[key] = 1;
    assert.throws(() => validate(report));
  }
});
test('skipped unit tests or incomplete translations prevent publication', () => {
  const report = complete(publicTargets[0]);
  report.unit.skipped = 1;
  assert.throws(() => validate(report), /must be zero/);
  report.unit.skipped = 0;
  report.locales.problems = 1;
  assert.throws(() => validate(report));
});
test('results from another version, commit or architecture are refused', () => {
  for (const [key, value] of [['version', '1.2.0'], ['sourceCommit', 'c'.repeat(40)], ['arch', 'arm64']]) {
    const report = complete(publicTargets[0]);
    report[key] = value;
    assert.throws(() => validate(report));
  }
});
test('tests of the sources cannot substitute for tests of the installed app', () => {
  const report = complete(publicTargets[0]);
  report.suites.installed.smoke.packaged = false;
  assert.throws(() => validate(report), /installed application/);
});
test('a failed filesystem operation or missing PDF check prevents publication', () => {
  for (const change of [
    (item) => { item.checks[0].ok = false; },
    (item) => { item.pdf = false; },
    (item) => { item.failures = ['Save failed']; },
  ]) {
    const report = complete(publicTargets[0]);
    change(report.suites.installed.smoke.scenarios[0]);
    assert.throws(() => validate(report));
  }
});
test('changing an installer after its tests prevents publication', () => {
  const report = complete(publicTargets[0]);
  report.checksums['Folio-Setup.exe'] = 'c'.repeat(64);
  assert.throws(() => validate(report), /differs from the checked package/);
});
test('a green job that omitted a mandatory native step cannot approve a release', () => {
  const jobs = publicTargets.map((target) => ({ name: target.job, conclusion: 'success',
    steps: [...requiredSteps, ...(target.platform === 'win' ? ['Check Windows installer'] : ['Check Linux DEB', 'Check Linux AppImage'])]
      .map((name) => ({ name, conclusion: 'success' })),
  }));
  const run = { conclusion: 'success', event: 'push' };
  validateRunJobs(run, jobs);
  jobs[1].steps.find((step) => step.name === 'Check Linux AppImage').conclusion = 'skipped';
  assert.throws(() => validateRunJobs(run, jobs), /required step did not pass/);
});
test('a UI JSON report must contain every scenario and no retries', () => {
  const target = publicTargets[0];
  const results = { config: { metadata: { label: 'source', platform: target.nativePlatform, version } },
    stats: { unexpected: 0, skipped: 0, flaky: 0, expected: Object.keys(scenarios).length },
    suites: [{ specs: Object.values(scenarios).map((title) => ({ title, ok: true, tests: [{ results: [{ status: 'passed' }] }] })) }],
  };
  const expected = { label: 'source', nativePlatform: target.nativePlatform, version };
  assert.equal(readUiResults(results, expected).passed, Object.keys(scenarios).length);
  results.suites[0].specs[0].tests[0].results.push({ status: 'passed' });
  assert.throws(() => readUiResults(results, expected), /Retries cannot approve/);
});
