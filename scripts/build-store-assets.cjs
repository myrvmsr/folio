'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'build', 'appx');
const listing = path.join(root, 'store', 'listing');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  await win.loadURL('about:blank');
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const specifications = [
    ['StoreLogo.png', 50, 50], ['StoreLogo.scale-200.png', 100, 100],
    ['Square44x44Logo.png', 44, 44], ['Square44x44Logo.scale-200.png', 88, 88],
    ['Square150x150Logo.png', 150, 150], ['Square150x150Logo.scale-200.png', 300, 300],
    ['Wide310x150Logo.png', 310, 150], ['Wide310x150Logo.scale-200.png', 620, 300],
    ['LargeTile.png', 310, 310], ['SmallTile.png', 71, 71], ['ListingLogo.png', 300, 300],
  ];
  const pngs = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(source)}; await img.decode();
    return ${JSON.stringify(specifications)}.map(([name, width, height]) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      const size = Math.min(width, height);
      ctx.drawImage(img, (width - size) / 2, (height - size) / 2, size, size);
      return { name, data: canvas.toDataURL('image/png').split(',')[1] };
    });
  })()`);
  fs.mkdirSync(assets, { recursive: true }); fs.mkdirSync(listing, { recursive: true });
  for (const { name, data } of pngs) {
    fs.writeFileSync(path.join(name === 'ListingLogo.png' ? listing : assets, name), Buffer.from(data, 'base64'));
  }
  console.log('Icônes MSIX et logo de la fiche Store générés.');
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
