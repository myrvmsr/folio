import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const { filesFromArgv } = createRequire(import.meta.url)('../src/main/file-arguments.js');
test('Desktop file URLs and filenames with spaces open the actual document', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-argv-'));
  try {
    const file = path.join(directory, 'Été #100%.md');
    fs.writeFileSync(file, '# Folio');
    assert.deepEqual(filesFromArgv(['folio', pathToFileURL(file).href]), [file]);
    assert.deepEqual(filesFromArgv(['folio', path.basename(file)], directory), [file]);
    assert.deepEqual(filesFromArgv(['folio', '--test', directory, 'missing.md', 'file:%invalid', file, file], directory), [file]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
