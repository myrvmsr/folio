// Capture the actual app at the Store's required size, using only synthetic notes and isolated profiles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const temporary = path.join(root, '.folio-checks', 'store-listing');
const listing = path.join(root, 'store', 'listing');
fs.mkdirSync(temporary, { recursive: true });
const notes = {
  fr: '# Vos idées, en Markdown\n\nUn espace simple pour **lire**, *écrire* et organiser vos documents.\n\n## Un projet, plusieurs notes\n\n- Regrouper les documents dans des dossiers.\n- Garder plusieurs fichiers ouverts dans des onglets.\n- Retrouver son travail grâce aux espaces.\n\n| Document | État |\n| :--- | :--- |\n| Présentation | Prête à relire |\n| Liste de tâches | En cours |\n| Notes de réunion | À partager |\n\n## Du texte et du code\n\n```javascript\nconst note = { titre: "Mes idées", format: "Markdown" };\nconsole.log(note.titre);\n```\n\n> [!NOTE]\n> Vos fichiers restent sur votre ordinateur.\n\n## La suite\n\n- [x] Rassembler les idées\n- [x] Organiser les documents\n- [ ] Exporter la présentation en PDF\n',
  en: '# Your ideas, in Markdown\n\nA simple space to **read**, *write* and organize your documents.\n\n## One project, several notes\n\n- Bring documents together in folders.\n- Keep several files open in tabs.\n- Pick up your work with separate spaces.\n\n| Document | Status |\n| :--- | :--- |\n| Presentation | Ready to review |\n| Task list | In progress |\n| Meeting notes | Ready to share |\n\n## Text and code\n\n```javascript\nconst note = { title: "My ideas", format: "Markdown" };\nconsole.log(note.title);\n```\n\n> [!NOTE]\n> Your files stay on your computer.\n\n## Next steps\n\n- [x] Gather ideas\n- [x] Organize documents\n- [ ] Export the presentation to PDF\n',
};
const captures = [
  { name: 'reading', flags: [] },
  { name: 'editing', flags: ['--snap-mode=split', '--snap-outline=0'] },
  { name: 'folders', flags: ['--snap-layout=vertical', '--snap-vtabs=expanded', '--snap-outline=0'] },
  { name: 'dark', flags: ['--snap-theme=dark'] },
];
const reports = [];
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
for (const [language, text] of Object.entries(notes)) {
  const work = fs.mkdtempSync(path.join(temporary, `${language}-`));
  const folder = path.join(work, language === 'fr' ? 'Mes notes' : 'My notes');
  const project = path.join(folder, language === 'fr' ? 'Projets' : 'Projects');
  fs.mkdirSync(project, { recursive: true });
  const document = path.join(folder, language === 'fr' ? 'Bienvenue.md' : 'Welcome.md');
  const second = path.join(project, language === 'fr' ? 'Présentation.md' : 'Presentation.md');
  fs.writeFileSync(document, text);
  fs.writeFileSync(second, language === 'fr' ? '# Présentation\n\nLes idées du prochain projet.\n' : '# Presentation\n\nIdeas for the next project.\n');
  fs.writeFileSync(path.join(folder, language === 'fr' ? 'Notes de réunion.md' : 'Meeting notes.md'), '# Notes\n');
  fs.writeFileSync(path.join(folder, language === 'fr' ? 'Liste de tâches.md' : 'Task list.md'), '- [ ] Markdown\n');
  const destination = path.join(listing, language === 'fr' ? 'fr-FR' : 'en-US');
  fs.mkdirSync(destination, { recursive: true });
  for (const capture of captures) {
    const output = path.join(work, `${capture.name}.png`);
    const args = [root, ...(capture.name === 'folders' ? [second, document] : [document]), `--snap=${output}`, '--snap-size=1600x1000',
      `--snap-lang=${language}`, `--snap-userdata=${path.join(work, `profile-${capture.name}`)}`, '--snap-font=system',
      '--snap-delay=350', ...capture.flags];
    if (capture.name === 'folders') args.push(`--snap-folders=${folder}`, `--snap-expand=${project}`,
      `--snap-spaces=${language === 'fr' ? 'Travail:terracotta,Personnel:teal' : 'Work:terracotta,Personal:teal'}`);
    const logFile = path.join(work, `${capture.name}.log`);
    const log = fs.createWriteStream(logFile);
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), args, { cwd: root, env, windowsHide: true });
      child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Capture ${capture.name} : délai dépassé.`)); }, 120000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
    });
    await new Promise((resolve) => log.end(resolve));
    assert.equal(exitCode, 0, fs.readFileSync(logFile, 'utf8').slice(-4000));
    const check = JSON.parse(fs.readFileSync(`${output}.json`, 'utf8'));
    assert.deepEqual(check.failures, []);
    const png = fs.readFileSync(output);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1600, 1000]);
    assert.ok(png.length < 50 * 1024 * 1024);
    const target = path.join(destination, `${capture.name}.png`);
    fs.copyFileSync(output, target);
    reports.push({ file: path.relative(listing, target).replace(/\\/g, '/'), width: 1600, height: 1000, bytes: png.length });
    console.log(`Capture Store : ${language}/${capture.name} (1600 × 1000).`);
  }
}
fs.writeFileSync(path.join(temporary, 'screenshots.json'), JSON.stringify(reports, null, 2));
