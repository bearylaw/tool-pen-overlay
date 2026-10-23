// Renders resources/*.svg to the PNGs electron-builder and the tray use.
// Run with: npx electron scripts/render-icons.cjs  (the output is committed)
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'resources');
const jobs = [
  ['icon.svg', 'icon.png', 1024],
  ['icon.svg', 'tray/tray.png', 16],
  ['icon.svg', 'tray/tray@2x.png', 32],
  ['tray-template.svg', 'tray/trayTemplate.png', 16],
  ['tray-template.svg', 'tray/trayTemplate@2x.png', 32],
];

// Draws the SVG onto a canvas in a hidden page and reads the PNG back.
async function render(win, svgFile, size) {
  const svg = readFileSync(join(root, svgFile), 'utf8');
  const dataUrl = await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = ${size};
        canvas.height = ${size};
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('svg failed to load'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
    })`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html></html>');
  for (const [svg, out, size] of jobs) {
    writeFileSync(join(root, out), await render(win, svg, size));
    console.info(`wrote ${out}`);
  }
  app.quit();
});
