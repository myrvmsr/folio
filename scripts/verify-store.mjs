import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { markdownExtensions, storeLanguages, storeVersion, previewIdentity, validateStoreIdentity } from './store-config.mjs';
const require = createRequire(import.meta.url);
const unzipper = require('unzipper');
const decodeXml = (value) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export async function verifyStorePackage(filename, { identity, version, preview = false }) {
  const expected = validateStoreIdentity(identity, { preview });
  const archive = await unzipper.Open.file(filename);
  const entries = new Map(archive.files.map((entry) => [entry.path.replace(/\\/g, '/'), entry]));
  const required = (name) => { assert.ok(entries.has(name), `${name} absent du MSIX.`); return entries.get(name); };
  for (const name of ['AppxManifest.xml', 'AppxBlockMap.xml', '[Content_Types].xml', 'app/Folio.exe',
    'app/resources/app/src/main/main.js', 'app/resources/app/src/main/windows-integration.js',
    'app/resources/app/dist/renderer/index.html', 'app/resources/THIRD-PARTY-NOTICES.txt']) required(name);
  const manifest = (await required('AppxManifest.xml').buffer()).toString('utf8');
  const identityTag = manifest.match(/<Identity\b[^>]*\/>/)?.[0];
  assert.ok(identityTag, 'Identité MSIX absente.');
  const attribute = (tag, name) => decodeXml(tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '');
  assert.equal(attribute(identityTag, 'Name'), expected.identityName);
  assert.equal(attribute(identityTag, 'Publisher'), expected.publisher);
  assert.equal(attribute(identityTag, 'Version'), storeVersion(version));
  assert.equal(attribute(identityTag, 'ProcessorArchitecture'), 'x64');
  const publisherName = decodeXml(manifest.match(/<PublisherDisplayName>([^<]*)<\/PublisherDisplayName>/)?.[1] ?? '');
  assert.equal(publisherName, expected.publisherDisplayName);
  assert.equal(decodeXml(manifest.match(/<DisplayName>([^<]*)<\/DisplayName>/)?.[1] ?? ''), expected.displayName);
  assert.match(manifest, /<Application\s+Id="Folio"\s+Executable="app\\Folio\.exe"\s+EntryPoint="Windows\.FullTrustApplication"/);
  assert.match(manifest, /MinVersion="10\.0\.19041\.0"/);
  assert.match(manifest, /Parameters="&quot;%1&quot;"/);
  const capabilities = [...manifest.matchAll(/<(?:\w+:)?Capability Name="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(capabilities, ['runFullTrust']);
  assert.ok(!manifest.includes('windows.startupTask'), 'Le démarrage automatique ne doit pas être activé.');
  const languages = [...manifest.matchAll(/<Resource Language="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(languages, storeLanguages);
  const extensions = [...manifest.matchAll(/<uap:FileType>([^<]+)<\/uap:FileType>/g)].map((match) => match[1]);
  assert.deepEqual(extensions, markdownExtensions);
  const metadata = JSON.parse((await required('app/resources/app/package.json').buffer()).toString('utf8'));
  assert.equal(metadata.version, version);
  const logos = { 'StoreLogo.png': [50, 50], 'Square44x44Logo.png': [44, 44], 'Square150x150Logo.png': [150, 150], 'Wide310x150Logo.png': [310, 150] };
  for (const [name, dimensions] of Object.entries(logos)) {
    const data = await required(`assets/${name}`).buffer();
    assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], dimensions, `Dimensions incorrectes : ${name}`);
  }
  for (const entry of entries.keys()) {
    assert.ok(!/app\/resources\/app\/(?:\.git|tests|exemples|store|publication)\//.test(entry), `Fichier de développement inclus : ${entry}`);
    assert.ok(!/identity\.local\.json|\.pfx$|\.p12$|\/\.env(?:\.|$)/.test(entry), `Fichier privé inclus : ${entry}`);
  }
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return {
    file: path.basename(filename), bytes: fs.statSync(filename).size, sha256: hash.digest('hex'),
    version: storeVersion(version), architecture: 'x64', identity: expected,
    preview, packageChecks: 'passed', signed: entries.has('AppxSignature.p7x'),
    installationTest: 'not-run', windowsAppCertificationKit: 'not-run', microsoftStoreCertification: 'pending',
    checkedAt: new Date().toISOString(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const filename = args.find((argument) => !argument.startsWith('--'));
  assert.ok(filename, 'Usage : npm run verify:store -- chemin.msix --identity=store/identity.local.json (ou --preview).');
  const preview = args.includes('--preview');
  const identityArgument = args.find((argument) => argument.startsWith('--identity='));
  assert.ok(!preview || !identityArgument, 'Choisir --preview ou --identity.');
  const identity = preview ? previewIdentity : JSON.parse(fs.readFileSync(identityArgument?.slice(11) || 'store/identity.local.json', 'utf8'));
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  console.log(JSON.stringify(await verifyStorePackage(path.resolve(filename), { identity, version, preview }), null, 2));
}
