// AI 537 matched before/after balcony continuity comparison composites.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(
    __dirname,
    '../../../artifacts/screens/buildings/ai537-balcony-continuity'
);
const OUT_DIR = path.join(ROOT_DIR, 'comparisons');
const PANEL_HEIGHT = 1080;
const LABEL_HEIGHT = 54;
const MARGIN = 12;
const SHOTS = Object.freeze([
    'front-balconies.png',
    'right-corner-closeup.png',
    'left-corner-closeup.png',
    'low-angle-corner.png',
    'rear-right-corner-closeup.png'
]);

test('Composite: AI 537 matched balcony continuity before and after views', async ({ page, baseURL }) => {
    test.skip(
        process.env.AI537_COMPARE !== '1',
        'Set AI537_COMPARE=1 after explicit before/after captures to generate comparison artifacts.'
    );
    test.setTimeout(180_000);
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.goto('/__health');
    const manifest = [];

    for (const shot of SHOTS) {
        const sources = ['before', 'after'].map((phase) => ({
            label: phase,
            src: `/tests/artifacts/screens/buildings/ai537-balcony-continuity/${phase}/${shot}`
        }));
        const composite = await page.evaluate(async ({ sources, origin, panelHeight, labelHeight, margin }) => {
            const images = await Promise.all(sources.map((source) => new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error(`failed to load ${source.src}`));
                image.src = origin + source.src;
            })));
            const sourceSizes = images.map((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
            const panelWidth = Math.round(panelHeight * (sourceSizes[0].width / sourceSizes[0].height));
            const canvas = document.createElement('canvas');
            canvas.width = panelWidth * sources.length + margin * (sources.length + 1);
            canvas.height = panelHeight + labelHeight + margin * 2;
            const context = canvas.getContext('2d');
            context.fillStyle = '#14161a';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.font = 'bold 28px sans-serif';
            context.textBaseline = 'middle';
            for (let index = 0; index < sources.length; index += 1) {
                const x = margin + index * (panelWidth + margin);
                context.fillStyle = '#f1ece1';
                context.fillText(sources[index].label.toUpperCase(), x + 8, margin + labelHeight * 0.5);
                context.drawImage(images[index], x, margin + labelHeight, panelWidth, panelHeight);
            }

            const diffCanvas = document.createElement('canvas');
            diffCanvas.width = sourceSizes[0].width;
            diffCanvas.height = sourceSizes[0].height;
            const diffContext = diffCanvas.getContext('2d', { willReadFrequently: true });
            diffContext.drawImage(images[0], 0, 0);
            const beforePixels = diffContext.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;
            diffContext.clearRect(0, 0, diffCanvas.width, diffCanvas.height);
            diffContext.drawImage(images[1], 0, 0);
            const afterPixels = diffContext.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;
            let changedPixels = 0;
            let maximumChannelDelta = 0;
            let minX = diffCanvas.width;
            let minY = diffCanvas.height;
            let maxX = -1;
            let maxY = -1;
            for (let offset = 0, pixel = 0; offset < beforePixels.length; offset += 4, pixel += 1) {
                const delta = Math.max(
                    Math.abs(beforePixels[offset] - afterPixels[offset]),
                    Math.abs(beforePixels[offset + 1] - afterPixels[offset + 1]),
                    Math.abs(beforePixels[offset + 2] - afterPixels[offset + 2])
                );
                maximumChannelDelta = Math.max(maximumChannelDelta, delta);
                if (delta < 12) continue;
                changedPixels += 1;
                const x = pixel % diffCanvas.width;
                const y = Math.floor(pixel / diffCanvas.width);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
            return {
                dataUrl: canvas.toDataURL('image/png'),
                sourceSizes,
                outputSize: { width: canvas.width, height: canvas.height },
                pixelDifference: {
                    changedPixels,
                    maximumChannelDelta,
                    bounds: changedPixels ? { minX, minY, maxX, maxY } : null
                }
            };
        }, { sources, origin: baseURL, panelHeight: PANEL_HEIGHT, labelHeight: LABEL_HEIGHT, margin: MARGIN });

        expect(composite.sourceSizes).toEqual([
            { width: 3840, height: 2160 },
            { width: 3840, height: 2160 }
        ]);
        expect(composite.pixelDifference.changedPixels).toBeGreaterThan(0);
        const outputName = shot.replace(/\.png$/u, '-before-after.png');
        await fs.writeFile(
            path.join(OUT_DIR, outputName),
            Buffer.from(composite.dataUrl.slice('data:image/png;base64,'.length), 'base64')
        );
        manifest.push({ shot, outputName, ...composite.outputSize, pixelDifference: composite.pixelDifference });
    }

    await fs.writeFile(
        path.join(OUT_DIR, 'manifest.json'),
        JSON.stringify({ panelHeight: PANEL_HEIGHT, shots: manifest }, null, 2),
        'utf8'
    );
});
