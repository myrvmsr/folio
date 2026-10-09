import { github } from './github.mjs';
const endpoint = '/repos/myrvmsr/folio-build';
let repository;
try { repository = await github(endpoint); }
catch (error) {
  if (!error.message.startsWith('GitHub 404:')) throw error;
  repository = await github('/user/repos', { method: 'POST', body: {
    name: 'folio-build', private: true,
    description: 'Sources privés et vérification des installateurs Windows, macOS et Linux de Folio.',
    has_issues: false, has_wiki: false, auto_init: false,
  } });
}
if (!repository.private) throw new Error('Build repository must be private before pushing sources.');
console.log(JSON.stringify({ url: repository.clone_url, private: repository.private }));
