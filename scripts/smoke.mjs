// Run the real renderer and filesystem operations in an isolated temporary profile.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const executable = flag('executable') || require('electron');
const packaged = Boolean(flag('executable'));
const output = path.resolve(root, '.folio-checks', flag('label') || (packaged ? 'packaged' : 'source'));
fs.mkdirSync(output, { recursive: true });
const fixture = '# Folio\n\nUne note **Markdown**.\n\n```js\nconsole.log("Folio");\n```\n\n$$x^2 + y^2 = z^2$$\n\n```mermaid\nflowchart LR\n A[Lecture] --> B[Édition]\n```\n';
let failures = 0;
const summaries = [];
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
for (const scenario of ['compatibility', 'files', 'autosave', 'rootrename']) {
  const directory = fs.mkdtempSync(path.join(output, `${scenario}-`));
  const folder = path.join(directory, 'Notes de test');
  fs.mkdirSync(folder);
  const document = path.join(folder, 'Bienvenue.md');
  fs.writeFileSync(document, fixture);
  const screenshot = path.join(directory, 'capture.png');
  const args = [...(packaged ? [] : [root]), process.platform === 'linux' ? pathToFileURL(document).href : document, `--snap=${screenshot}`, `--snap-folders=${folder}`,
    `--snap-userdata=${path.join(directory, 'profile')}`, `--snap-selftest=${scenario}`, '--snap-autosave=afterEdit'];
  if (process.env.FOLIO_SMOKE_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  const logFile = path.join(directory, 'process.log');
  const log = fs.createWriteStream(logFile);
  const childEnvironment = { ...process.env };
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  const result = await new Promise((resolve) => {
    const child = spawn(executable, args, { cwd: root, env: childEnvironment, windowsHide: true });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    const timer = setTimeout(() => { child.kill(); resolve({ code: 1, reason: 'Process timeout' }); }, 120000);
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: 1, reason: error.message }); });
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code }); });
  });
  await new Promise((resolve) => log.end(resolve));
  try {
    assert.equal(result.code, 0, result.reason || fs.readFileSync(logFile, 'utf8').slice(-10000));
    const report = JSON.parse(fs.readFileSync(`${screenshot}.json`, 'utf8'));
    assert.equal(report.platform, process.platform);
    assert.equal(report.packaged, packaged);
    assert.equal(report.version, version);
    assert.ok(report.checks.length > 0);
    assert.deepEqual(report.failures, []);
    assert.ok(fs.statSync(screenshot).size > 1000);
    assert.ok(fs.statSync(`${screenshot}.pdf`).size > (scenario === 'compatibility' ? 1000 : 500));
    console.log(`PASS ${scenario}: ${report.checks.length} checks (${report.platform}/${report.arch}, packaged=${report.packaged})`);
    summaries.push({ scenario, ...report });
  } catch (error) {
    failures += 1;
    summaries.push({ scenario, failures: [error.message], checks: [] });
    console.error(`FAIL ${scenario}: ${error.message}`);
  }
}
console.log(`Reports: ${output}`);
fs.writeFileSync(path.join(output, 'smoke-summary.json'), JSON.stringify({
  version, platform: process.platform, arch: process.arch, packaged, scenarios: summaries, failures,
}, null, 2));
process.exitCode = failures ? 1 : 0;
