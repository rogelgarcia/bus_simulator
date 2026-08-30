import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [artifactRoot, nodeModules] = process.argv.slice(2);

if (!artifactRoot || !nodeModules) {
  throw new Error('Usage: node compare_ao_4k_captures.mjs <artifact-root> <node-modules>');
}

const require = createRequire(path.join(nodeModules, 'package.json'));
const sharp = require('sharp');
const { default: pixelmatch } = await import(
  pathToFileURL(path.join(nodeModules, 'pixelmatch', 'index.js')).href
);

const legacyDirectory = path.join(artifactRoot, 'legacy');
const optimizedDirectory = path.join(artifactRoot, 'optimized');
const diffDirectory = path.join(artifactRoot, 'diff');
const heatmapDirectory = path.join(artifactRoot, 'heatmap');
const samplesDirectory = path.join(artifactRoot, 'samples');

await Promise.all([
  fs.mkdir(diffDirectory, { recursive: true }),
  fs.mkdir(heatmapDirectory, { recursive: true }),
  fs.mkdir(samplesDirectory, { recursive: true }),
]);

const filenames = (await fs.readdir(legacyDirectory))
  .filter((filename) => filename.endsWith('.jpg'))
  .sort();

if (filenames.length !== 24) {
  throw new Error(`Expected 24 legacy JPEG captures, found ${filenames.length}`);
}

const rows = [];

for (const filename of filenames) {
  const id = path.basename(filename, '.jpg');
  const legacy = await sharp(path.join(legacyDirectory, filename))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const optimized = await sharp(path.join(optimizedDirectory, filename))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (legacy.info.width !== optimized.info.width || legacy.info.height !== optimized.info.height) {
    throw new Error(`${id}: capture sizes differ`);
  }

  const { width, height } = legacy.info;
  const pixelCount = width * height;
  const pixelmatchOutput = Buffer.alloc(pixelCount * 4);
  const perceptualChangedPixels = pixelmatch(
    legacy.data,
    optimized.data,
    pixelmatchOutput,
    width,
    height,
    { threshold: 4 / 255, includeAA: true },
  );

  const amplified = Buffer.alloc(pixelCount * 4);
  const heatmap = Buffer.alloc(pixelCount * 4);
  let differentPixels = 0;
  let changedPixels = 0;
  let errorSum = 0;
  let maxError = 0;
  let maxX = 0;
  let maxY = 0;
  let minChangedX = width;
  let minChangedY = height;
  let maxChangedX = -1;
  let maxChangedY = -1;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const dr = Math.abs(legacy.data[offset] - optimized.data[offset]);
    const dg = Math.abs(legacy.data[offset + 1] - optimized.data[offset + 1]);
    const db = Math.abs(legacy.data[offset + 2] - optimized.data[offset + 2]);
    const error = Math.max(dr, dg, db);
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (error > 0) differentPixels += 1;
    errorSum += dr + dg + db;

    if (error > maxError) {
      maxError = error;
      maxX = x;
      maxY = y;
    }

    if (error > 4) {
      changedPixels += 1;
      minChangedX = Math.min(minChangedX, x);
      minChangedY = Math.min(minChangedY, y);
      maxChangedX = Math.max(maxChangedX, x);
      maxChangedY = Math.max(maxChangedY, y);
    }

    amplified[offset] = Math.min(255, dr * 8);
    amplified[offset + 1] = Math.min(255, dg * 8);
    amplified[offset + 2] = Math.min(255, db * 8);
    amplified[offset + 3] = 255;

    heatmap[offset] = Math.min(255, error * 8);
    heatmap[offset + 1] = error > 4 ? Math.min(180, error * 3) : 0;
    heatmap[offset + 2] = 0;
    heatmap[offset + 3] = 255;
  }

  await Promise.all([
    sharp(amplified, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(diffDirectory, `${id}.png`)),
    sharp(heatmap, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(heatmapDirectory, `${id}.png`)),
  ]);

  rows.push({
    id,
    width,
    height,
    pixelCount,
    differentPixels,
    differentPixelRatio: differentPixels / pixelCount,
    changedPixels,
    changedPixelRatio: changedPixels / pixelCount,
    perceptualChangedPixels,
    perceptualChangedPixelRatio: perceptualChangedPixels / pixelCount,
    meanAbsoluteError: errorSum / (pixelCount * 3),
    maxError,
    maxErrorPosition: { x: maxX, y: maxY },
    changedBounds: changedPixels > 0
      ? { minX: minChangedX, minY: minChangedY, maxX: maxChangedX, maxY: maxChangedY }
      : null,
  });
}

const totalPixels = rows.reduce((sum, row) => sum + row.pixelCount, 0);
const totalDifferentPixels = rows.reduce((sum, row) => sum + row.differentPixels, 0);
const totalChangedPixels = rows.reduce((sum, row) => sum + row.changedPixels, 0);
const totalPerceptualChangedPixels = rows.reduce(
  (sum, row) => sum + row.perceptualChangedPixels,
  0,
);
const globalMeanAbsoluteError = rows.reduce(
  (sum, row) => sum + row.meanAbsoluteError * row.pixelCount,
  0,
) / totalPixels;

const report = {
  generatedAt: new Date().toISOString(),
  comparison: {
    sources: 'decoded browser JPEG captures, same deterministic encoder',
    differentPixelThreshold: 'max RGB channel difference > 0',
    changedPixelThreshold: 'max RGB channel difference > 4/255',
    perceptualComparison: 'pixelmatch threshold 4/255, anti-alias differences included',
    diffVisualization: 'absolute RGB channel difference amplified 8x',
  },
  global: {
    poseCount: rows.length,
    width: rows[0].width,
    height: rows[0].height,
    totalPixels,
    differentPixels: totalDifferentPixels,
    differentPixelRatio: totalDifferentPixels / totalPixels,
    changedPixels: totalChangedPixels,
    changedPixelRatio: totalChangedPixels / totalPixels,
    perceptualChangedPixels: totalPerceptualChangedPixels,
    perceptualChangedPixelRatio: totalPerceptualChangedPixels / totalPixels,
    meanAbsoluteError: globalMeanAbsoluteError,
    maxError: Math.max(...rows.map((row) => row.maxError)),
  },
  poses: rows,
};

await fs.writeFile(
  path.join(artifactRoot, 'pixel_report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

const rankedRows = [...rows].sort((a, b) =>
  b.changedPixelRatio - a.changedPixelRatio
  || b.differentPixelRatio - a.differentPixelRatio
  || b.maxError - a.maxError,
);
const sampleRows = rankedRows.slice(0, 3);
const identical = rows.find((row) => row.differentPixels === 0);
if (identical && !sampleRows.some((row) => row.id === identical.id)) sampleRows.push(identical);

for (const row of sampleRows) {
  await createTriptych(row, false);
  if (row.maxError > 0) await createTriptych(row, true);
}

await Promise.all([
  createContactSheet('legacy', legacyDirectory, '.jpg'),
  createContactSheet('optimized', optimizedDirectory, '.jpg'),
  createContactSheet('difference_8x', diffDirectory, '.png'),
]);

console.log(JSON.stringify({ global: report.global, samples: sampleRows.map((row) => row.id) }));

async function createTriptych(row, closeup) {
  const panelWidth = closeup ? 640 : 960;
  const panelHeight = closeup ? 640 : Math.round(panelWidth * row.height / row.width);
  const labelHeight = 54;
  const inputs = [
    path.join(legacyDirectory, `${row.id}.jpg`),
    path.join(optimizedDirectory, `${row.id}.jpg`),
    path.join(diffDirectory, `${row.id}.png`),
  ];
  const labels = ['BEFORE — legacy AO', 'AFTER — optimized AO', 'ABSOLUTE DIFFERENCE ×8'];
  const cropSize = closeup ? Math.min(900, row.width, row.height) : null;
  const cropLeft = closeup ? clamp(row.maxErrorPosition.x - Math.floor(cropSize / 2), 0, row.width - cropSize) : 0;
  const cropTop = closeup ? clamp(row.maxErrorPosition.y - Math.floor(cropSize / 2), 0, row.height - cropSize) : 0;
  const panels = [];

  for (let index = 0; index < inputs.length; index += 1) {
    let pipeline = sharp(inputs[index]);
    if (closeup) pipeline = pipeline.extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize });
    const image = await pipeline.resize(panelWidth, panelHeight, { fit: 'fill' }).jpeg({ quality: 94 }).toBuffer();
    panels.push({ input: image, left: index * panelWidth, top: labelHeight });
  }

  const heading = `${escapeXml(row.id)} — ${closeup ? `close-up around max error (${row.maxErrorPosition.x}, ${row.maxErrorPosition.y})` : 'full frame'}`;
  const svg = Buffer.from(`
    <svg width="${panelWidth * 3}" height="${panelHeight + labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#141414"/>
      <text x="18" y="20" fill="#bdbdbd" font-family="Arial" font-size="14">${heading}</text>
      ${labels.map((label, index) => `<text x="${index * panelWidth + 18}" y="43" fill="#ffffff" font-family="Arial" font-size="18" font-weight="600">${label}</text>`).join('')}
    </svg>
  `);

  await sharp(svg)
    .composite(panels)
    .jpeg({ quality: 94 })
    .toFile(path.join(samplesDirectory, `${row.id}_${closeup ? 'closeup_' : ''}comparison.jpg`));
}

async function createContactSheet(name, sourceDirectory, extension) {
  const cellWidth = 480;
  const cellHeight = 258;
  const labelHeight = 32;
  const columns = 4;
  const rowsCount = 6;
  const composites = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const image = await sharp(path.join(sourceDirectory, `${row.id}${extension}`))
      .resize(cellWidth, cellHeight, { fit: 'fill' })
      .jpeg({ quality: 88 })
      .toBuffer();
    const left = (index % columns) * cellWidth;
    const top = Math.floor(index / columns) * (cellHeight + labelHeight);
    composites.push({ input: image, left, top: top + labelHeight });
    composites.push({
      input: Buffer.from(`<svg width="${cellWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#181818"/><text x="10" y="22" fill="#fff" font-family="Arial" font-size="16">${escapeXml(row.id)}</text></svg>`),
      left,
      top,
    });
  }

  await sharp({
    create: {
      width: columns * cellWidth,
      height: rowsCount * (cellHeight + labelHeight),
      channels: 3,
      background: '#181818',
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(path.join(samplesDirectory, `${name}_contact_sheet.jpg`));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character]);
}
