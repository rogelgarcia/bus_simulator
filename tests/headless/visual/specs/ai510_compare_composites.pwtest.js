// Composite: AI 510 — reference vs before vs after of the bradbury_block
// entry portal in ONE image (same pattern as ai509_compare_composites).
// Run ai510_portal_capture with AI510_TAG=before and =after first.
// Output: tests/artifacts/screens/buildings/ai510_portal_compare.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const PANEL_HEIGHT = 560;
const LABEL_HEIGHT = 34;
const MARGIN = 10;

const COMPOSITES = [
    {
        out: 'ai510_portal_compare.png',
        panels: [
            { src: '/downloads/buildings_references/2.png', sx: 1130, sy: 690, sw: 350, sh: 330, label: 'reference' },
            { src: '/tests/artifacts/screens/buildings/ai510_portal_front_before.png', sx: 760, sy: 130, sw: 1080, sh: 1020, label: 'before' },
            { src: '/tests/artifacts/screens/buildings/ai510_portal_front_after.png', sx: 760, sy: 130, sw: 1080, sh: 1020, label: 'after' }
        ]
    }
];

test('Composite: AI 510 reference comparison', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.goto('/__health');

    for (const composite of COMPOSITES) {
        const dataUrl = await page.evaluate(async ({ panels, origin, panelHeight, labelHeight, margin }) => {
            const images = await Promise.all(panels.map((panel) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`failed to load ${panel.src}`));
                img.src = origin + panel.src;
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
                ctx.drawImage(images[i], panel.sx, panel.sy, panel.sw, panel.sh, x, margin + labelHeight, widths[i], panelHeight);
                x += widths[i] + margin;
            }
            return canvas.toDataURL('image/png');
        }, { panels: composite.panels, origin: baseURL, panelHeight: PANEL_HEIGHT, labelHeight: LABEL_HEIGHT, margin: MARGIN });

        expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
        const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        await fs.writeFile(path.join(OUT_DIR, composite.out), buffer);
    }
});
