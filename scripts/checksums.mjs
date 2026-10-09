import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const directory = path.resolve(process.argv[2] || 'release');
const names = fs.readdirSync(directory).filter((name) => /^Folio-.*\.(exe|dmg|AppImage|deb)$/.test(name)).sort();
if (!names.length) throw new Error(`No release installers in ${directory}`);
const lines = names.map((name) => `${createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}  ${name}`);
fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
