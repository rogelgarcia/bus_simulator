import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const [artifactRoot, nodeModules] = process.argv.slice(2);
if (!artifactRoot || !nodeModules) {
    throw new Error('Usage: node compare_ai525_captures.mjs <artifact-root> <node-modules>');
}

const require = createRequire(path.join(nodeModules, 'package.json'));
const sharp = require('sharp');
const visualRoot = path.join(artifactRoot, 'visual');
const referenceDirectory = path.join(visualRoot, 'retained');
const candidates = ['stencil', 'packed'];
const rows = [];

for (const candidate of candidates) {
    const candidateDirectory = path.join(visualRoot, candidate);
    const diffDirectory = path.join(visualRoot, 'diff', candidate);
    const sampleDirectory = path.join(visualRoot, 'samples', candidate);
    await fs.mkdir(diffDirectory, { recursive: true });
    await fs.mkdir(sampleDirectory, { recursive: true });
    const filenames = (await fs.readdir(candidateDirectory)).filter((filename) => filename.endsWith('.jpg')).sort();

    for (const filename of filenames) {
        const pose = path.basename(filename, '.jpg');
        const before = await sharp(path.join(referenceDirectory, filename)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const after = await sharp(path.join(candidateDirectory, filename)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (before.info.width !== after.info.width || before.info.height !== after.info.height) {
            throw new Error(`${candidate}/${pose}: dimensions differ`);
        }

        const { width, height } = before.info;
        const pixelCount = width * height;
        const difference = Buffer.alloc(pixelCount * 4);
        let differentPixels = 0;
        let changedPixels = 0;
        let errorSum = 0;
        let maxError = 0;
        let maxX = 0;
        let maxY = 0;

        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
            const offset = pixel * 4;
            const red = Math.abs(before.data[offset] - after.data[offset]);
            const green = Math.abs(before.data[offset + 1] - after.data[offset + 1]);
            const blue = Math.abs(before.data[offset + 2] - after.data[offset + 2]);
            const error = Math.max(red, green, blue);
            if (error > 0) differentPixels += 1;
            if (error > 4) changedPixels += 1;
            errorSum += red + green + blue;
            if (error > maxError) {
                maxError = error;
                maxX = pixel % width;
                maxY = Math.floor(pixel / width);
            }
            difference[offset] = Math.min(255, red * 8);
            difference[offset + 1] = Math.min(255, green * 8);
            difference[offset + 2] = Math.min(255, blue * 8);
            difference[offset + 3] = 255;
        }

        const diffPath = path.join(diffDirectory, `${pose}.png`);
        await sharp(difference, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);
        const row = {
            candidate,
            pose,
            width,
            height,
            pixelCount,
            differentPixels,
            differentPixelRatio: differentPixels / pixelCount,
            changedPixels,
            changedPixelRatio: changedPixels / pixelCount,
            meanAbsoluteError: errorSum / (pixelCount * 3),
            maxError,
            maxErrorPosition: { x: maxX, y: maxY }
        };
        rows.push(row);
        await createTriptych({ row, filename, candidateDirectory, diffPath, sampleDirectory, closeup: false });
        if (maxError > 0) {
            await createTriptych({ row, filename, candidateDirectory, diffPath, sampleDirectory, closeup: true });
        }
    }
}

const summaries = Object.fromEntries(candidates.map((candidate) => {
    const candidateRows = rows.filter((row) => row.candidate === candidate);
    const totalPixels = candidateRows.reduce((sum, row) => sum + row.pixelCount, 0);
    const totalDifferent = candidateRows.reduce((sum, row) => sum + row.differentPixels, 0);
    const totalChanged = candidateRows.reduce((sum, row) => sum + row.changedPixels, 0);
    return [candidate, {
        poseCount: candidateRows.length,
        totalPixels,
        differentPixels: totalDifferent,
        differentPixelRatio: totalDifferent / totalPixels,
        changedPixels: totalChanged,
        changedPixelRatio: totalChanged / totalPixels,
        meanAbsoluteError: candidateRows.reduce((sum, row) => sum + row.meanAbsoluteError * row.pixelCount, 0) / totalPixels,
        maxError: Math.max(...candidateRows.map((row) => row.maxError))
    }];
}));

const report = {
    generatedAt: new Date().toISOString(),
    reference: 'AI 524 retained-depth receiver-only mask',
    comparison: {
        source: 'decoded 3840x2064 browser JPEG captures using the same encoder',
        changedThreshold: 'maximum RGB channel delta > 4/255',
        diffVisualization: 'absolute RGB channel delta amplified 8x'
    },
    summaries,
    rows
};
await fs.writeFile(path.join(visualRoot, 'pixel_report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summaries));

async function createTriptych({ row, filename, candidateDirectory, diffPath, sampleDirectory, closeup }) {
    const panelWidth = closeup ? 640 : 960;
    const panelHeight = closeup ? 640 : Math.round(panelWidth * row.height / row.width);
    const labelHeight = 54;
    const cropSize = closeup ? Math.min(900, row.width, row.height) : null;
    const left = closeup ? clamp(row.maxErrorPosition.x - Math.floor(cropSize / 2), 0, row.width - cropSize) : 0;
    const top = closeup ? clamp(row.maxErrorPosition.y - Math.floor(cropSize / 2), 0, row.height - cropSize) : 0;
    const inputs = [path.join(referenceDirectory, filename), path.join(candidateDirectory, filename), diffPath];
    const labels = ['AI 524 — retained depth', `AI 525 — ${row.candidate}`, 'ABSOLUTE DIFFERENCE ×8'];
    const panels = [];

    for (let index = 0; index < inputs.length; index += 1) {
        let pipeline = sharp(inputs[index]);
        if (closeup) pipeline = pipeline.extract({ left, top, width: cropSize, height: cropSize });
        const image = await pipeline.resize(panelWidth, panelHeight, { fit: 'fill' }).jpeg({ quality: 94 }).toBuffer();
        panels.push({ input: image, left: index * panelWidth, top: labelHeight });
    }

    const heading = `${escapeXml(row.pose)} — ${closeup ? `max-error close-up (${row.maxErrorPosition.x}, ${row.maxErrorPosition.y})` : 'full frame'}`;
    const svg = Buffer.from(`
        <svg width="${panelWidth * 3}" height="${panelHeight + labelHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#141414"/>
            <text x="18" y="20" fill="#bdbdbd" font-family="Arial" font-size="14">${heading}</text>
            ${labels.map((label, index) => `<text x="${index * panelWidth + 18}" y="43" fill="#ffffff" font-family="Arial" font-size="18" font-weight="600">${escapeXml(label)}</text>`).join('')}
        </svg>
    `);
    await sharp(svg).composite(panels).jpeg({ quality: 94 }).toFile(
        path.join(sampleDirectory, `${row.pose}_${closeup ? 'closeup_' : ''}comparison.jpg`)
    );
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function escapeXml(value) {
    return String(value).replace(/[<>&'\"]/g, (character) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    })[character]);
}
