// Only these targets may be distributed publicly. Mac is on hold until the owner requests its return.
import assert from 'node:assert/strict';

export const publicTargets = [
  { platform: 'win', nativePlatform: 'win32', job: 'Windows x64', packages: ['installed'], artifact: 'installers-win-x64', files: ['Folio-Setup.exe'] },
  { platform: 'linux', nativePlatform: 'linux', job: 'Linux x64 (Ubuntu 24.04)', packages: ['deb', 'appimage'], artifact: 'installers-linux-x64', files: ['Folio-Linux-x64.AppImage', 'Folio-Linux-x64.deb'] },
];
export const publicInstallers = publicTargets.flatMap((target) => target.files).sort();
export const publicPlatformNames = 'Windows et Linux';

export function publicChecksums(verification) {
  return Object.fromEntries(publicInstallers.map((filename) => {
    const checksum = verification.checksums?.[filename];
    assert.match(checksum || '', /^[a-f0-9]{64}$/, `${filename}: missing verified installer checksum`);
    return [filename, checksum];
  }));
}

export function publicManifest(verification) {
  return Buffer.from(Object.entries(publicChecksums(verification))
    .map(([filename, checksum]) => `${checksum}  ${filename}\n`).join(''));
}

// Keep optional integrity checks in the notes, outside the installer download list.
export function publicReleaseNotes(notes, verification) {
  const description = notes.replace(/<!-- folio-checksums:start -->[\s\S]*?<!-- folio-checksums:end -->/g, '').trim();
  const section = [
    '<!-- folio-checksums:start -->',
    '<details>',
    '<summary>Vérifier les téléchargements (SHA-256)</summary>',
    '',
    'Ces empreintes permettent de vérifier l’intégrité des installateurs. Cette étape est facultative.',
    '',
    '```text',
    publicManifest(verification).toString('utf8').trimEnd(),
    '```',
    '',
    '</details>',
    '<!-- folio-checksums:end -->',
  ].join('\n');
  return `${description ? `${description}\n\n` : ''}${section}\n`;
}
