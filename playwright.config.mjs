import { defineConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const label = process.env.FOLIO_E2E_LABEL || 'source';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid test report label');
const output = path.resolve('.folio-checks/e2e', label);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  metadata: { label, platform: process.platform, arch: process.arch, version: JSON.parse(fs.readFileSync('package.json')).version },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: path.join(output, 'artifacts'),
  reporter: [
    ['line'],
    ['json', { outputFile: path.join(output, 'results.json') }],
    ['junit', { outputFile: path.join(output, 'junit.xml') }],
    ['html', { outputFolder: path.join(output, 'html'), open: 'never' }],
  ],
});
