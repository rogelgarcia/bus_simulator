// Composite: AI 511 — reference vs before vs after of the bradbury_block
// top-floor arcade AND one brick-floor sash window, in ONE image (two rows,
// same pattern as ai509_compare_composites). Run ai511_insets_capture with
// AI511_TAG=before and =after first.
// Output: tests/artifacts/screens/buildings/ai511_insets_compare.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const PANEL_HEIGHT = 460;
const LABEL_HEIGHT = 34;
const MARGIN = 10;

const COMPOSITES = [
    {
        out: 'ai511_insets_compare.png',
        rows: [
            [
                { src: '/downloads/buildings_references/2.png', sx: 1000, sy: 110, sw: 460, sh: 250, label: 'reference arcade' },
                { src: '/tests/artifacts/screens/buildings/ai511_arcade_before.png', sx: 340, sy: 120, sw: 1400, sh: 760, label: 'before' },
                { src: '/tests/artifacts/screens/buildings/ai511_arcade_after.png', sx: 340, sy: 120, sw: 1400, sh: 760, label: 'after' }
            ],
            [
                { src: '/downloads/buildings_references/2.png', sx: 1130, sy: 400, sw: 320, sh: 330, label: 'reference window' },
                { src: '/tests/artifacts/screens/buildings/ai511_sash_before.png', sx: 520, sy: 120, sw: 1000, sh: 1030, label: 'before' },
                { src: '/tests/artifacts/screens/buildings/ai511_sash_after.png', sx: 520, sy: 120, sw: 1000, sh: 1030, label: 'after' }
            ]
        ]
    }
];

test('Composite: AI 511 reference comparison', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.goto('/__health');

    for (const composite of COMPOSITES) {
        const dataUrl = await page.evaluate(async ({ rows, origin, panelHeight, labelHeight, margin }) => {
            const loadImage = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`failed to load ${src}`));
                img.src = origin + src;
            });
            const rowImages = [];
            for (const row of rows) {
                rowImages.push(await Promise.all(row.map((panel) => loadImage(panel.src))));
            }
            const rowWidths = rows.map((row) => {
                const widths = row.map((panel) => Math.round(panelHeight * (panel.sw / panel.sh)));
                return { widths, total: widths.reduce((a, b) => a + b, 0) + margin * (row.length + 1) };
            });
            const totalW = Math.max(...rowWidths.map((r) => r.total));
            const rowH = panelHeight + labelHeight + margin;
            const totalH = rowH * rows.length + margin;
            const canvas = document.createElement('canvas');
            canvas.width = totalW;
            canvas.height = totalH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#14161a';
            ctx.fillRect(0, 0, totalW, totalH);
            ctx.font = 'bold 20px sans-serif';
            ctx.textBaseline = 'middle';
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                const { widths } = rowWidths[r];
                const yTop = margin + rowH * r;
                let x = margin;
                for (let i = 0; i < row.length; i++) {
                    const panel = row[i];
                    ctx.fillStyle = '#e8e2d6';
                    ctx.fillText(panel.label.toUpperCase(), x + 4, yTop + labelHeight * 0.5);
                    ctx.drawImage(rowImages[r][i], panel.sx, panel.sy, panel.sw, panel.sh, x, yTop + labelHeight, widths[i], panelHeight);
                    x += widths[i] + margin;
                }
            }
            return canvas.toDataURL('image/png');
        }, { rows: composite.rows, origin: baseURL, panelHeight: PANEL_HEIGHT, labelHeight: LABEL_HEIGHT, margin: MARGIN });

        expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
        const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        await fs.writeFile(path.join(OUT_DIR, composite.out), buffer);
    }
});
