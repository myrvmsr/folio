// Vérifie les traductions : chaque clé utilisée par le code existe en français, et chaque
// langue a exactement les mêmes clés que le français (mêmes paramètres « {nom} »).
//   node scripts/check-locales.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { LANGUAGES } = require(path.join(root, 'src/shared/i18n.js'));
const load = (code) => require(path.join(root, 'src/shared/locales', `${code}.js`));

// --- Clés citées dans le code -----------------------------------------------------
const sources = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'locales') walk(p);
    } else if (/\.(js|html)$/.test(entry.name)) sources.push(p);
  }
};
walk(path.join(root, 'src'));

const used = new Set();
const plural = new Set();
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\b(?:t|tr)\(\s*['`]([a-zA-Z0-9_.]+)['`]\s*(,\s*\{[^)]*\bcount\b)?/g)) {
    used.add(m[1]);
    if (m[2]) plural.add(m[1]);
  }
  for (const m of text.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) used.add(m[1]);
}

// Clés construites dynamiquement (t(`action.${id}`)…).
const shortcutsSource = fs.readFileSync(path.join(root, 'src/renderer/shortcuts.js'), 'utf8');
const actionIds = [...shortcutsSource.matchAll(/\{ id: '([a-zA-Z]+)', group:/g)].map((m) => m[1]);
const groupIds = [...shortcutsSource.matchAll(/\{ id: '([a-z]+)' \}/g)].map((m) => m[1]);
const dynamic = {
  action: actionIds,
  'shortcuts.group': groupIds,
  'shortcuts.reserved': ['copy', 'paste', 'cut', 'selectAll', 'undo', 'redo', 'closeWindow', 'goToTab'],
  key: ['Ctrl', 'Alt', 'Shift', 'Meta', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'Space', 'Tab', 'ContextMenu'],
  autosave: ['afterEdit', 'interval', 'focusChange', 'off'],
  color: ['terracotta', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'graphite', 'slate'],
  editor: ['find', 'replace', 'next', 'previous', 'all', 'matchCase', 'regexp', 'byWord', 'replaceOne', 'replaceAll', 'close', 'currentMatch', 'onLine', 'replacedMatches', 'replacedOnLine', 'goToLine', 'go', 'controlCharacter'],
  lang: LANGUAGES.map((l) => l.code),
  'md.alert': ['note', 'tip', 'important', 'warning', 'caution'],
  theme: ['system', 'light', 'dark'],
};
for (const [prefix, ids] of Object.entries(dynamic)) for (const id of ids) used.add(`${prefix}.${id}`);

// --- Contrôles ------------------------------------------------------------------------
const fr = load('fr');
const has = (dict, key) => key in dict || `${key}_other` in dict;
let problems = 0;
const report = (msg) => {
  problems += 1;
  console.error(`  ✖ ${msg}`);
};

console.log(`Clés utilisées par le code : ${used.size} (dont ${plural.size} au pluriel)`);
for (const key of [...used].sort()) if (!has(fr, key)) report(`fr : clé manquante « ${key} »`);
for (const key of plural) if (!(`${key}_one` in fr && `${key}_other` in fr)) report(`fr : pluriel incomplet « ${key} » (_one et _other)`);

const unused = Object.keys(fr).filter((k) => !used.has(k.replace(/_(one|other|many|few|two|zero)$/, '')));
if (unused.length) console.warn(`  (clés françaises inutilisées : ${unused.join(', ')})`);

const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const { code } of LANGUAGES) {
  if (code === 'fr') continue;
  let dict;
  try {
    dict = load(code);
  } catch (err) {
    report(`${code} : fichier illisible (${err.message})`);
    continue;
  }
  const missing = Object.keys(fr).filter((k) => !(k in dict));
  const extra = Object.keys(dict).filter((k) => !(k in fr));
  for (const k of missing) report(`${code} : clé manquante « ${k} »`);
  for (const k of extra) report(`${code} : clé en trop « ${k} »`);
  for (const k of Object.keys(fr)) {
    if (k in dict && params(dict[k]) !== params(fr[k])) report(`${code} : paramètres différents pour « ${k} » (${params(dict[k])} au lieu de ${params(fr[k])})`);
    if (k in dict && (typeof dict[k] !== 'string' || !dict[k].trim())) report(`${code} : texte vide pour « ${k} »`);
  }
  console.log(`${code} : ${Object.keys(dict).length} clés`);
}

fs.mkdirSync(path.join(root, '.folio-checks/locales'), { recursive: true });
fs.writeFileSync(path.join(root, '.folio-checks/locales/results.json'), JSON.stringify({
  completedAt: new Date().toISOString(), problems, languages: LANGUAGES.map(({ code }) => code), keys: Object.keys(fr).length,
}, null, 2));
if (problems) {
  console.error(`\n${problems} problème(s).`);
  process.exit(1);
}
console.log('\n✔ Traductions complètes.');
