// tools/reference_image_inspector/run.mjs
// Inspect reference photos while reproducing them as buildings: print size,
// write scaled crops for close reading, and print row/column luminance
// profiles so facade grid pitches can be measured in pixels.
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './png.mjs';

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token.startsWith('--')) {
            const key = token.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) out[key] = true;
            else { out[key] = next; i++; }
        } else out._.push(token);
    }
    return out;
}

function parseRect(value, image) {
    if (!value || value === true) return { x: 0, y: 0, w: image.width, h: image.height };
    const parts = String(value).split(',').map((p) => Math.round(Number(p.trim())));
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) throw new Error(`bad rect: ${value}`);
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function sampleBilinear(image, fx, fy) {
    const x = Math.max(0, Math.min(image.width - 1, fx));
    const y = Math.max(0, Math.min(image.height - 1, fy));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(image.width - 1, x0 + 1);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
        const p00 = image.data[(y0 * image.width + x0) * 4 + c];
        const p10 = image.data[(y0 * image.width + x1) * 4 + c];
        const p01 = image.data[(y1 * image.width + x0) * 4 + c];
        const p11 = image.data[(y1 * image.width + x1) * 4 + c];
        out[c] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
    }
    return out;
}

function resample(image, rect, outWidth, outHeight) {
    const data = Buffer.alloc(outWidth * outHeight * 4);
    for (let y = 0; y < outHeight; y++) {
        for (let x = 0; x < outWidth; x++) {
            const sx = rect.x + (x + 0.5) * (rect.w / outWidth) - 0.5;
            const sy = rect.y + (y + 0.5) * (rect.h / outHeight) - 0.5;
            const [r, g, b] = sampleBilinear(image, sx, sy);
            const d = (y * outWidth + x) * 4;
            data[d] = Math.round(r);
            data[d + 1] = Math.round(g);
            data[d + 2] = Math.round(b);
            data[d + 3] = 255;
        }
    }
    return { width: outWidth, height: outHeight, data };
}

function luminanceProfile(image, rect, axis) {
    const values = [];
    if (axis === 'cols') {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            let sum = 0;
            for (let y = rect.y; y < rect.y + rect.h; y++) {
                const i = (y * image.width + x) * 4;
                sum += 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
            }
            values.push(sum / rect.h);
        }
    } else {
        for (let y = rect.y; y < rect.y + rect.h; y++) {
            let sum = 0;
            for (let x = rect.x; x < rect.x + rect.w; x++) {
                const i = (y * image.width + x) * 4;
                sum += 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
            }
            values.push(sum / rect.w);
        }
    }
    return values;
}

function localMinima(values, origin, minSpacing) {
    const picks = [];
    for (let i = 1; i < values.length - 1; i++) {
        if (values[i] <= values[i - 1] && values[i] < values[i + 1]) {
            const last = picks[picks.length - 1];
            if (last && i - last.index < minSpacing) {
                if (values[i] < last.value) picks[picks.length - 1] = { index: i, value: values[i] };
                continue;
            }
            picks.push({ index: i, value: values[i] });
        }
    }
    return picks.map((p) => ({ at: origin + p.index, luminance: Number(p.value.toFixed(1)) }));
}

function averageColor(image, rect) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            const i = (y * image.width + x) * 4;
            r += image.data[i];
            g += image.data[i + 1];
            b += image.data[i + 2];
            n++;
        }
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), n };
}

const args = parseArgs(process.argv.slice(2));
const file = args.file ?? args._[0];
if (!file) {
    console.log('usage: node tools/reference_image_inspector/run.mjs --file <png> [--info] [--crop x,y,w,h --out out.png [--scale N]] [--profile rows|cols --rect x,y,w,h] [--color x,y,w,h]');
    process.exit(1);
}
const image = decodePng(fs.readFileSync(file));

if (args.info || (!args.crop && !args.profile && !args.color)) {
    console.log(JSON.stringify({ file, width: image.width, height: image.height }));
}

if (args.color) {
    const rect = parseRect(args.color, image);
    const avg = averageColor(image, rect);
    const hex = ((avg.r << 16) | (avg.g << 8) | avg.b).toString(16).padStart(6, '0');
    console.log(JSON.stringify({ rect, average: avg, hex: `0x${hex}` }));
}

if (args.crop) {
    const rect = parseRect(args.crop, image);
    const scale = Number(args.scale ?? 1) || 1;
    const outWidth = Math.max(1, Math.round(rect.w * scale));
    const outHeight = Math.max(1, Math.round(rect.h * scale));
    const cropped = resample(image, rect, outWidth, outHeight);
    const out = args.out ?? 'crop.png';
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, encodePng(cropped));
    console.log(JSON.stringify({ wrote: out, rect, size: { width: outWidth, height: outHeight } }));
}

if (args.profile) {
    const axis = String(args.profile) === 'rows' ? 'rows' : 'cols';
    const rect = parseRect(args.rect, image);
    const values = luminanceProfile(image, rect, axis);
    const origin = axis === 'cols' ? rect.x : rect.y;
    const minSpacing = Math.max(2, Math.round(Number(args.minSpacing ?? 6)));
    const minima = localMinima(values, origin, minSpacing);
    console.log(JSON.stringify({ axis, rect, count: minima.length, minima }, null, 1));
}
