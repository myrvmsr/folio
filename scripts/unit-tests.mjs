import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const output = path.resolve('.folio-checks/unit');
fs.mkdirSync(output, { recursive: true });
const files = fs.readdirSync('tests').filter((name) => name.endsWith('.test.mjs')).sort().map((name) => path.join('tests', name));
const junit = path.join(output, 'junit.xml');
const result = spawnSync(process.execPath, [
  '--test', '--test-reporter=spec', '--test-reporter=junit',
  '--test-reporter-destination=stdout', `--test-reporter-destination=${junit}`, ...files,
], { stdio: 'inherit', windowsHide: true });
const xml = fs.existsSync(junit) ? fs.readFileSync(junit, 'utf8') : '';
const count = (name) => Number(xml.match(new RegExp(`<!-- ${name} (\\d+) -->`))?.[1] || 0);
const report = { completedAt: new Date().toISOString(), status: result.status === 0 ? 'passed' : 'failed',
  total: count('tests'), passed: count('pass'), failed: count('fail'), canceled: count('cancelled'), skipped: count('skipped'), todo: count('todo'), files,
};
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
