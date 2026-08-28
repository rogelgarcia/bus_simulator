// Focused side-by-side comparison composite.
// Usage: node compose.mjs <out.png> <LABEL:src:x,y,w,h> <LABEL:src:x,y,w,h> ...
// Run from the repo root (needs @playwright/test in node_modules).
// Example: node tools/compose_compare.mjs out.png "reference:downloads/buildings_references/2.png:790,755,290,275" "ours:tests/artifacts/screens/buildings/bradbury_l1_corner_door.png:900,300,830,800"
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [out, ...panelArgs] = process.argv.slice(2);
const panels = panelArgs.map((arg) => {
    const [label, src, rect] = arg.split(':');
    const [x, y, w, h] = rect.split(',').map(Number);
    return { label, src, x, y, w, h, b64: fs.readFileSync(src).toString('base64') };
});
const browser = await chromium.launch({ executablePath: 'C:/Users/rogel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage();
const outB64 = await page.evaluate(async (panels) => {
    const PANEL_H = 760;
    const LABEL_H = 36;
    const M = 10;
    const imgs = await Promise.all(panels.map((p) => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = 'data:image/png;base64,' + p.b64;
    })));
    const widths = panels.map((p) => Math.round(PANEL_H * (p.w / p.h)));
    const totalW = widths.reduce((a, b) => a + b, 0) + M * (panels.length + 1);
    const c = document.createElement('canvas');
    c.width = totalW;
    c.height = PANEL_H + LABEL_H + M * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = 'bold 20px sans-serif';
    ctx.textBaseline = 'middle';
    let x = M;
    for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        ctx.fillStyle = '#e8e2d6';
        ctx.fillText(p.label.toUpperCase(), x + 4, M + LABEL_H * 0.5);
        ctx.drawImage(imgs[i], p.x, p.y, p.w, p.h, x, M + LABEL_H, widths[i], PANEL_H);
        x += widths[i] + M;
    }
    return c.toDataURL('image/png').split(',')[1];
}, panels);
fs.writeFileSync(out, Buffer.from(outB64, 'base64'));
await browser.close();
console.log('wrote', out);
