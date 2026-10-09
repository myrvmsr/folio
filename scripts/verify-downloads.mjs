// Download the public links without authentication and compare them to the tested binaries.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicChecksums, publicManifest } from './release-policy.mjs';
const directory = path.resolve(process.argv[2] || '');
const verification = JSON.parse(fs.readFileSync(path.join(directory, 'verification.json'), 'utf8'));
const checksums = publicChecksums(verification);
const manifest = publicManifest(verification);
const expected = [...Object.keys(checksums), 'SHA256SUMS.txt'].sort();
const readme = fs.readFileSync('publication/README.md', 'utf8');
const readmeResponse = await fetch('https://raw.githubusercontent.com/myrvmsr/folio/main/README.md');
assert.equal(readmeResponse.status, 200, 'Public download page must be available.');
assert.equal((await readmeResponse.text()).replace(/\r\n/g, '\n'), readme.replace(/\r\n/g, '\n'), 'The public download page must match the prepared page.');
const linked = [...new Set([...readme.matchAll(/https:\/\/github\.com\/myrvmsr\/folio\/releases\/latest\/download\/([^\s)"<>]+)/g)].map((match) => match[1]))].sort();
assert.deepEqual(linked, expected, 'Every installer must have a download link.');
const reports = await Promise.all(expected.map(async (filename) => {
  const url = `https://github.com/myrvmsr/folio/releases/latest/download/${filename}`;
  const response = await fetch(url);
  assert.equal(response.status, 200, `${filename}: public download unavailable`);
  assert.ok(response.url.includes('release-assets.githubusercontent.com'), `${filename}: expected the GitHub asset download`);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
  assert.equal(size, filename === 'SHA256SUMS.txt' ? manifest.length : fs.statSync(path.join(directory, filename)).size, `${filename}: truncated download`);
  const checksum = hash.digest('hex');
  const expectedChecksum = filename === 'SHA256SUMS.txt'
    ? createHash('sha256').update(manifest).digest('hex') : checksums[filename];
  assert.equal(checksum, expectedChecksum, `${filename}: public download differs from the tested installer`);
  console.log(`PASS public download: ${filename} (${size} bytes, SHA256 matches)`);
  return { filename, size, checksum, url, checkedAt: new Date().toISOString() };
}));
fs.writeFileSync(path.join(directory, 'public-download-checks-windows-linux.json'), JSON.stringify(reports, null, 2));
console.log(`All ${expected.length} public download links verified without authentication.`);
