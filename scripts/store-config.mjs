import assert from 'node:assert/strict';
import path from 'node:path';

export const storeLanguages = ['fr-FR', 'en-US', 'es-ES', 'de-DE', 'nl-NL', 'it-IT', 'pt-PT', 'pt-BR'];
export const markdownExtensions = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdwn', '.mdx'];
export const previewIdentity = Object.freeze({
  identityName: 'Folio.StorePreview',
  publisher: 'CN=Folio Store Preview',
  publisherDisplayName: 'Folio',
  displayName: 'Folio',
});

export function validateStoreIdentity(identity, { preview = false } = {}) {
  assert.ok(identity && typeof identity === 'object' && !Array.isArray(identity), 'Identité Microsoft Store manquante.');
  for (const field of ['identityName', 'publisher', 'publisherDisplayName']) {
    const value = identity[field];
    assert.ok(typeof value === 'string' && value.trim() === value && value.length > 0, `${field} : recopier la valeur exacte du Centre des partenaires.`);
    assert.ok(!/[\x00-\x1f]|REPLACE_WITH|A_REMPLACER/i.test(value), `${field} : remplacer la valeur d’exemple par celle de Microsoft.`);
  }
  assert.match(identity.identityName, /^[a-zA-Z0-9.-]{3,50}$/, 'identityName : nom de package Microsoft invalide.');
  assert.match(identity.publisher, /^CN=.+$/, 'publisher : recopier Package/Identity/Publisher, qui commence par CN=.');
  assert.ok(identity.publisher.length <= 8192 && identity.publisherDisplayName.length <= 256, 'Identité Microsoft trop longue.');
  const displayName = identity.displayName ?? 'Folio';
  assert.ok(typeof displayName === 'string' && displayName.trim() === displayName && displayName.length > 0 && displayName.length <= 256 && !/[\x00-\x1f]/.test(displayName), 'displayName : utiliser le nom réservé dans le Store.');
  if (!preview) {
    assert.notEqual(identity.identityName, previewIdentity.identityName, 'L’identité de validation ne peut pas être soumise au Store.');
    assert.notEqual(identity.publisher, previewIdentity.publisher, 'L’éditeur de validation ne peut pas être soumis au Store.');
  }
  return { identityName: identity.identityName, publisher: identity.publisher, publisherDisplayName: identity.publisherDisplayName, displayName };
}

export function storeVersion(version) {
  assert.match(version, /^[1-9]\d*\.\d+\.\d+$/, 'Le Store exige une version stable majeure.mineure.correctif.');
  assert.ok(version.split('.').every((value) => Number(value) <= 65535), 'Version Microsoft Store hors limites.');
  return `${version}.0`;
}

export const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

export function storeConfiguration(metadata, identity, { root, preview = false } = {}) {
  const validIdentity = validateStoreIdentity(identity, { preview });
  storeVersion(metadata.version);
  return {
    ...metadata.build,
    toolsets: { ...metadata.build.toolsets, winCodeSign: '1.1.0' },
    directories: { ...metadata.build.directories, output: preview ? 'release/store-preview' : 'release/store' },
    win: { ...metadata.build.win, target: [{ target: 'appx', arch: ['x64'] }], signExecutable: false },
    appx: {
      applicationId: 'Folio',
      identityName: validIdentity.identityName,
      publisher: escapeXml(validIdentity.publisher),
      publisherDisplayName: escapeXml(validIdentity.publisherDisplayName),
      displayName: escapeXml(validIdentity.displayName),
      artifactName: preview ? 'Folio-Store-Preview-${version}-${arch}.msix' : 'Folio-Store-${version}-${arch}.msix',
      customManifestPath: path.join(root, 'build', 'store', 'AppxManifest.xml'),
      capabilities: ['runFullTrust'],
      languages: [...storeLanguages],
      minVersion: '10.0.19041.0',
      maxVersionTested: '10.0.26100.0',
      backgroundColor: 'transparent',
      setBuildNumber: false,
      addAutoLaunchExtension: false,
    },
  };
}
