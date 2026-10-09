// Assemble l'interface (dist/renderer) avec esbuild.
//   node scripts/build-renderer.mjs           → version optimisée
//   node scripts/build-renderer.mjs --watch   → recompilation à chaque modification
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeThirdPartyNotices } from './third-party-notices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'renderer');
const watch = process.argv.includes('--watch');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor', 'mermaid'), { recursive: true });

fs.copyFileSync(path.join(root, 'src', 'renderer', 'index.html'), path.join(out, 'index.html'));
fs.copyFileSync(
  path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  path.join(out, 'vendor', 'mermaid', 'mermaid.min.js'),
);

const options = {
  absWorkingDir: root,
  entryPoints: {
    app: 'src/renderer/app.js',
    editor: 'src/renderer/editor.js',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome130',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  charset: 'utf8',
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Surveillance des sources… (Ctrl+C pour arrêter)');
} else {
  const { metafile } = await esbuild.build({ ...options, metafile: true });
  const count = writeThirdPartyNotices({
    root,
    metafile,
    bundledPackages: ['mermaid'],
    outFile: path.join(root, 'dist', 'THIRD-PARTY-NOTICES.txt'),
  });
  console.log(`Licences : ${count} paquets → dist/THIRD-PARTY-NOTICES.txt`);
}
