// GitHub access through the existing Git credential manager; never print credentials.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export async function github(endpoint, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const credential = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\nusername=myrvmsr\n\n', encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  const password = credential.stdout?.match(/^password=(.+)$/m)?.[1]?.trim();
  if (!password) throw new Error('GitHub authentication unavailable in the Git credential manager.');
  const url = endpoint.startsWith('https:') ? new URL(endpoint) : new URL(endpoint, 'https://api.github.com');
  if (!['api.github.com', 'uploads.github.com'].includes(url.hostname)) throw new Error('Unexpected GitHub API hostname.');
  const response = await fetch(url, {
    method, headers: {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${password}`, ...headers,
      ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`GitHub ${response.status}: ${detail.message || response.statusText}`);
  }
  if (raw) return Buffer.from(await response.arrayBuffer());
  return response.status === 204 ? null : response.json();
}

if (process.argv[1]?.endsWith('github.mjs')) {
  const args = process.argv.slice(2);
  const outputFile = args.find((arg) => arg.startsWith('--save='))?.slice(7);
  const [endpoint = '/user', method = 'GET', inputFile] = args.filter((arg) => !arg.startsWith('--save='));
  try {
    const result = await github(endpoint, {
      method, body: inputFile ? JSON.parse(fs.readFileSync(inputFile, 'utf8')) : undefined, raw: Boolean(outputFile),
    });
    if (outputFile) { fs.writeFileSync(outputFile, result); console.log(`Saved ${result.length} bytes to ${outputFile}`); }
    else console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
