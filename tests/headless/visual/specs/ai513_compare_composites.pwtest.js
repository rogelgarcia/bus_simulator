// Composites: AI 513 — reference vs before vs after in ONE image per shot,
// so the bradbury_block adoption of AI 507-512 (portal def, lettering, nested
// insets, reveals, N-face chamfer, molded capitals, arcade impost) can be
// judged against the reference directly.
// Reads the outputs of bradbury_block_capture.pwtest.js: run it on the
// pre-adoption config and copy bradbury_<view>.png to
// bradbury_<view>_ai513_before.png, then run it on the adopted config; this
// spec composes them with the reference render.
// Output: tests/artifacts/screens/buildings/ai513_<shot>_compare.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const PANEL_HEIGHT = 520;
const LABEL_HEIGHT = 34;
const MARGIN = 10;

// Source rects: reference crops from downloads/buildings_references/2.png
// (1840x1069). The 'before' shots are the pre-AI-513 captures at 1280x720;
// the 'after' shots are the current captures at 2560x1440 (CAPTURE_SCALE=2)
// with the reference-matching side swap (entry face on +x).
const COMPOSITES = [
    {
        out: 'ai513_portal_compare.png',
        panels: [
            { src: '/downloads/buildings_references/2.png', sx: 1130, sy: 690, sw: 350, sh: 330, label: 'reference' },
            { src: '/tests/artifacts/screens/buildings/bradbury_entry_ai513_before.png', sx: 230, sy: 0, sw: 700, sh: 720, label: 'before' },
            { src: '/tests/artifacts/screens/buildings/bradbury_entry.png', sx: 1000, sy: 280, sw: 800, sh: 1020, label: 'after' }
        ]
    },
    {
        out: 'ai513_arcade_compare.png',
        panels: [
            { src: '/downloads/buildings_references/2.png', sx: 985, sy: 85, sw: 620, sh: 250, label: 'reference' },
            { src: '/tests/artifacts/screens/buildings/bradbury_arcade_top_ai513_before.png', sx: 240, sy: 60, sw: 1040, sh: 480, label: 'before' },
            { src: '/tests/artifacts/screens/buildings/bradbury_arcade_top.png', sx: 620, sy: 280, sw: 1880, sh: 680, label: 'after' }
        ]
    },
    {
        out: 'ai513_overall_compare.png',
        panels: [
            { src: '/downloads/buildings_references/2.png', sx: 140, sy: 0, sw: 1700, sh: 1069, label: 'reference' },
            { src: '/tests/artifacts/screens/buildings/bradbury_corner_ai513_before.png', sx: 380, sy: 60, sw: 700, sh: 560, label: 'before' },
            { src: '/tests/artifacts/screens/buildings/bradbury_corner.png', sx: 560, sy: 20, sw: 1560, sh: 1400, label: 'after' }
        ]
    }
];

test('Composite: AI 513 reference comparisons', async ({ page, baseURL }) => {
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
                ctx.drawImage(
                    images[i],
                    panel.sx, panel.sy, panel.sw, panel.sh,
                    x, margin + labelHeight, widths[i], panelHeight
                );
                x += widths[i] + margin;
            }
            return canvas.toDataURL('image/png');
        }, { panels: composite.panels, origin: baseURL, panelHeight: PANEL_HEIGHT, labelHeight: LABEL_HEIGHT, margin: MARGIN });

        expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
        const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        await fs.writeFile(path.join(OUT_DIR, composite.out), buffer);
    }
});
