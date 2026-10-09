// A release must contain evidence for every required scenario on every public target.
import assert from 'node:assert/strict';
import { publicTargets } from './release-policy.mjs';
import { scenarios } from '../tests/e2e/scenarios.mjs';

export const qualitySchema = 1;
export const smokeScenarios = ['compatibility', 'files', 'autosave', 'rootrename'];
export const requiredSteps = ['Unit tests', 'Check translations', 'UI tests from sources', 'Build installers', 'Collect verified results', 'Save checked installers'];

export function validateRunJobs(run, jobs) {
  assert.equal(run.conclusion, 'success', 'The native CI execution must succeed.');
  assert.ok(['push', 'workflow_dispatch'].includes(run.event), 'A release must come from a source push or a manual native build.');
  assert.equal(jobs.length, publicTargets.length, 'Every public target must have a checked build.');
  for (const target of publicTargets) {
    const job = jobs.find((item) => item.name === target.job);
    assert.equal(job?.conclusion, 'success', `${target.job}: native tests must pass`);
    const packageSteps = target.platform === 'win' ? ['Check Windows installer'] : ['Check Linux DEB', 'Check Linux AppImage'];
    for (const name of [...requiredSteps, ...packageSteps]) {
      assert.ok(job.steps?.some((step) => step.name === name && step.conclusion === 'success'), `${target.job}: required step did not pass: ${name}`);
    }
  }
}

export function readUiResults(results, expected) {
  assert.equal(results.config.metadata.label, expected.label, 'UI report belongs to another package.');
  assert.equal(results.config.metadata.platform, expected.nativePlatform);
  assert.equal(results.config.metadata.version, expected.version);
  const stats = results.stats;
  assert.equal(stats.unexpected, 0, 'A UI test failed.');
  assert.equal(stats.skipped, 0, 'UI scenarios must not be skipped.');
  assert.equal(stats.flaky, 0, 'A UI test must pass on its first attempt.');
  const specs = [];
  const walk = (suite) => {
    specs.push(...(suite.specs || []));
    for (const nested of suite.suites || []) walk(nested);
  };
  for (const suite of results.suites) walk(suite);
  assert.deepEqual(specs.map((spec) => spec.title).sort(), Object.values(scenarios).sort(), 'The complete UI suite must run.');
  for (const spec of specs) {
    assert.equal(spec.ok, true, `UI scenario failed: ${spec.title}`);
    assert.equal(spec.tests.length, 1);
    assert.equal(spec.tests[0].results.length, 1, 'Retries cannot approve an unstable build.');
    assert.equal(spec.tests[0].results[0].status, 'passed', spec.title);
  }
  assert.equal(stats.expected, specs.length);
  return { passed: specs.length, cases: specs.map((spec) => spec.title).sort(), failed: 0, skipped: 0, flaky: 0 };
}

export function validateQuality(report, { version, sourceCommit, platform, checksums }) {
  const target = publicTargets.find((item) => item.platform === platform);
  assert.ok(target, 'Unsupported public platform.');
  assert.equal(report.schema, qualitySchema, 'Current complete test reports are required before publication.');
  assert.equal(report.version, version, 'Quality report belongs to another version.');
  assert.equal(report.sourceCommit, sourceCommit, 'Quality report belongs to another source commit.');
  assert.equal(report.platform, target.nativePlatform);
  assert.equal(report.arch, 'x64');
  const unit = report.unit;
  assert.equal(unit.status, 'passed');
  assert.ok(Number.isInteger(unit.total) && unit.total > 0);
  assert.equal(unit.passed, unit.total);
  for (const count of ['failed', 'canceled', 'skipped', 'todo']) assert.equal(unit[count], 0, `Unit tests: ${count} must be zero.`);
  assert.equal(report.locales.problems, 0);
  assert.deepEqual([...report.locales.languages].sort(), ['de', 'en', 'es', 'fr', 'it', 'nl', 'pt']);
  assert.deepEqual(Object.keys(report.suites).sort(), ['source', ...target.packages].sort());
  for (const [label, suite] of Object.entries(report.suites)) {
    assert.equal(suite.ui.failed, 0, `${label}: failed UI tests`);
    assert.equal(suite.ui.skipped, 0, `${label}: skipped UI tests`);
    assert.equal(suite.ui.flaky, 0, `${label}: unstable UI tests`);
    assert.equal(suite.ui.passed, Object.keys(scenarios).length);
    assert.deepEqual([...suite.ui.cases].sort(), Object.values(scenarios).sort(), `${label}: incomplete UI suite`);
    if (label === 'source') continue;
    const smoke = suite.smoke;
    assert.equal(smoke.version, version);
    assert.equal(smoke.platform, target.nativePlatform);
    assert.equal(smoke.arch, 'x64');
    assert.equal(smoke.packaged, true, 'The installed application must be tested.');
    assert.equal(smoke.failures, 0);
    assert.deepEqual(smoke.scenarios.map((item) => item.scenario).sort(), [...smokeScenarios].sort());
    for (const scenario of smoke.scenarios) {
      assert.equal(scenario.version, version);
      assert.equal(scenario.platform, target.nativePlatform);
      assert.equal(scenario.packaged, true);
      assert.deepEqual(scenario.failures, []);
      assert.ok(scenario.pdf, 'PDF generation must be verified.');
      assert.ok(scenario.checks.length > 0 && scenario.checks.every((check) => check.ok === true), 'Every packaged application check must pass.');
    }
  }
  assert.deepEqual(Object.keys(report.checksums).sort(), [...target.files].sort());
  for (const filename of target.files) {
    assert.match(report.checksums[filename], /^[a-f0-9]{64}$/);
    assert.equal(report.checksums[filename], checksums[filename], `${filename}: installer differs from the checked package.`);
  }
  return report;
}

export function validateReleaseEvidence(verification) {
  assert.equal(verification.qualitySchema, qualitySchema, 'This release has no current complete quality evidence.');
  assert.deepEqual(Object.keys(verification.quality).sort(), publicTargets.map((target) => target.platform).sort());
  for (const target of publicTargets) validateQuality(verification.quality[target.platform], {
    version: verification.version, sourceCommit: verification.sourceCommit, platform: target.platform, checksums: verification.checksums,
  });
}
