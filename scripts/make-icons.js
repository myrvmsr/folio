// Génère build/icon.ico, build/icon.png et build/file-icon.ico à partir des SVG.
// Lancement : npx electron scripts/make-icons.js
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const BUILD = path.join(__dirname, '..', 'build');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

app.disableHardwareAcceleration();

/** Assemble des PNG dans un fichier .ico (format accepté par Windows Vista et suivants). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, o);
    directory.writeUInt8(size >= 256 ? 0 : size, o + 1);
    directory.writeUInt8(0, o + 2);
    directory.writeUInt8(0, o + 3);
    directory.writeUInt16LE(1, o + 4);
    directory.writeUInt16LE(32, o + 6);
    directory.writeUInt32LE(png.length, o + 8);
    directory.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...images.map((img) => img.png)]);
}

async function rasterize(win, svgFile, sizes) {
  const svg = fs.readFileSync(svgFile, 'utf8');
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const result = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(dataUrl)};
    await img.decode();
    const out = {};
    for (const s of ${JSON.stringify(sizes)}) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = s;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s, s);
      out[s] = canvas.toDataURL('image/png');
    }
    return out;
  })()`);
  return sizes.map((size) => ({ size, png: Buffer.from(result[size].split(',')[1], 'base64') }));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');

  const appIcons = await rasterize(win, path.join(BUILD, 'icon.svg'), [...SIZES, 512]);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), buildIco(appIcons.filter((i) => i.size <= 256)));
  fs.writeFileSync(path.join(BUILD, 'icon.png'), appIcons.find((i) => i.size === 512).png);

  const fileIcons = await rasterize(win, path.join(BUILD, 'file-icon.svg'), SIZES);
  fs.writeFileSync(path.join(BUILD, 'file-icon.ico'), buildIco(fileIcons));

  // Aperçus pour vérification visuelle.
  const preview = path.join(BUILD, 'preview');
  fs.mkdirSync(preview, { recursive: true });
  for (const { size, png } of appIcons) fs.writeFileSync(path.join(preview, `icon-${size}.png`), png);
  for (const { size, png } of fileIcons) fs.writeFileSync(path.join(preview, `file-${size}.png`), png);

  console.log('Icônes générées dans', BUILD);
  app.quit();
});
