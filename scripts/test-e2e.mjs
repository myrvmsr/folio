// Run the same complete UI suite against the sources or an installed executable.
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const executable = args.find((arg) => arg.startsWith('--executable='))?.slice(13);
const label = args.find((arg) => arg.startsWith('--label='))?.slice(8) || (executable ? 'installed' : 'source');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid test report label');
const env = { ...process.env, FOLIO_E2E_LABEL: label };
if (executable) env.FOLIO_E2E_EXECUTABLE = path.resolve(executable);
else delete env.FOLIO_E2E_EXECUTABLE;
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config=playwright.config.mjs',
  ...args.filter((arg) => !arg.startsWith('--executable=') && !arg.startsWith('--label=')),
], { env, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
