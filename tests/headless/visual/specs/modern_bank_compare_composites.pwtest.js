// Composites: Modern Bank — the reference render and the engine capture in
// ONE image per shot, so the reproduction can be judged against the source
// directly instead of by flipping between files.
//
// Reads the outputs of modern_bank_capture.pwtest.js. Run that first.
// Output: tests/artifacts/screens/buildings/modern_bank_<shot>_compare.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const PANEL_HEIGHT = 900;
const LABEL_HEIGHT = 34;
const MARGIN = 12;

const REFERENCE = '/downloads/buildings_references/10 front.png';
const SHOT = (view) => `/tests/artifacts/screens/buildings/modern_bank_${view}.png`;

// Source rects are x,y,w,h. The reference is 1122x1402 with the building at
// (110,111)-(1016,1226); the captures are 2560x1440.
const COMPOSITES = [
    {
        out: 'modern_bank_elevation_compare.png',
        panels: [
            { src: REFERENCE, sx: 110, sy: 105, sw: 906, sh: 1125, label: 'reference' },
            { src: SHOT('elevation'), sx: 818, sy: 133, sw: 924, sh: 1148, label: 'engine' }
        ]
    },
    {
        out: 'modern_bank_base_compare.png',
        panels: [
            { src: REFERENCE, sx: 105, sy: 890, sw: 915, sh: 345, label: 'reference' },
            { src: SHOT('base'), sx: 298, sy: 300, sw: 1964, sh: 740, label: 'engine' }
        ]
    },
    {
        out: 'modern_bank_curtain_compare.png',
        panels: [
            { src: REFERENCE, sx: 108, sy: 140, sw: 910, sh: 300, label: 'reference' },
            { src: SHOT('curtain'), sx: 0, sy: 60, sw: 2560, sh: 844, label: 'engine' }
        ]
    },
    {
        out: 'modern_bank_entry_compare.png',
        panels: [
            { src: REFERENCE, sx: 150, sy: 915, sw: 230, sh: 320, label: 'reference' },
            { src: SHOT('entry'), sx: 760, sy: 0, sw: 1035, sh: 1440, label: 'engine' }
        ]
    }
];

test('Composite: Modern Bank reference comparisons', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.goto('/__health');

    for (const composite of COMPOSITES) {
        const dataUrl = await page.evaluate(async ({ panels, origin, panelHeight, labelHeight, margin }) => {
            const images = await Promise.all(panels.map((panel) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`failed to load ${panel.src}`));
                img.src = origin + panel.src.split('/').map(encodeURIComponent).join('/');
            })));

            const widths = panels.map((panel) => Math.round(panelHeight * (panel.sw / panel.sh)));
            const totalW = widths.reduce((a, b) => a + b, 0) + margin * (panels.length + 1);
            const totalH = panelHeight + labelHeight + margin * 2;
            const canvas = document.createElement('canvas');
            canvas.width = totalW;
            canvas.height = totalH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#14161a';
            ctx.fillRect(0, 0, totalW, totalH);
            ctx.font = 'bold 20px sans-serif';
            ctx.textBaseline = 'middle';

            let x = margin;
            for (let i = 0; i < panels.length; i++) {
                const panel = panels[i];
                ctx.fillStyle = '#e8e2d6';
                ctx.fillText(panel.label.toUpperCase(), x + 4, margin + labelHeight * 0.5);
                ctx.drawImage(
                    images[i],
                    panel.sx, panel.sy, panel.sw, panel.sh,
                    x, margin + labelHeight, widths[i], panelHeight
                );
                x += widths[i] + margin;
            }
            return canvas.toDataURL('image/png');
        }, {
            panels: composite.panels,
            origin: baseURL,
            panelHeight: PANEL_HEIGHT,
            labelHeight: LABEL_HEIGHT,
            margin: MARGIN
        });

        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        await fs.writeFile(path.join(OUT_DIR, composite.out), Buffer.from(base64, 'base64'));
        console.log(`wrote ${composite.out}`);
    }
});
