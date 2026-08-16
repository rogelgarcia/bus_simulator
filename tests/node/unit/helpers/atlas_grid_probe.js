// tests/node/unit/helpers/atlas_grid_probe.js
// Decodes a PNG and scores how well a declared cols/rows grid matches the
// seams in the actual image, so an atlas grid can be validated against the
// pixels instead of against another declaration (AI 500).
// Pure JS: node's zlib plus PNG unfiltering, no native deps.

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

// Distance from a candidate boundary used to compare the two sides. Several
// gaps are tried because gutters vary in width across the atlases.
const EDGE_GAPS = Object.freeze([2, 4, 8]);

export function decodePng(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('[atlas_grid_probe] not a PNG');
    }

    let pos = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];

    while (pos + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(pos);
        const type = buffer.toString('ascii', pos + 4, pos + 8);
        const data = buffer.subarray(pos + 8, pos + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        pos += 12 + length;
    }

    if (bitDepth !== 8) throw new Error(`[atlas_grid_probe] unsupported bit depth ${bitDepth}`);
    if (interlace !== 0) throw new Error('[atlas_grid_probe] interlaced PNGs are not supported');
    const channels = CHANNELS_BY_COLOR_TYPE[colorType];
    if (!channels) throw new Error(`[atlas_grid_probe] unsupported color type ${colorType}`);

    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(stride * height);

    let read = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[read];
        read += 1;
        const line = raw.subarray(read, read + stride);
        read += stride;
        const cur = out.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? cur[x - channels] : 0;
            const b = prev ? prev[x] : 0;
            const c = (prev && x >= channels) ? prev[x - channels] : 0;
            const v = line[x];
            let value;
            switch (filter) {
                case 0: value = v; break;
                case 1: value = v + a; break;
                case 2: value = v + b; break;
                case 3: value = v + ((a + b) >> 1); break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a);
                    const pb = Math.abs(p - b);
                    const pc = Math.abs(p - c);
                    value = v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
                    break;
                }
                default: throw new Error(`[atlas_grid_probe] unsupported filter ${filter}`);
            }
            cur[x] = value & 255;
        }
    }

    return { width, height, channels, data: out };
}

function luminance(image, x, y) {
    const i = (y * image.width + x) * image.channels;
    return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
}

function median(values) {
    const sorted = Array.from(values).sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
}

// One profile per axis: how uniform each line is, and how different the pixels
// a few columns/rows apart are.
function buildAxisProfile(lineCount, samplesPerLine, sample) {
    const std = new Float64Array(lineCount);
    for (let i = 0; i < lineCount; i++) {
        let sum = 0;
        let sumSq = 0;
        for (let j = 0; j < samplesPerLine; j++) {
            const l = sample(i, j);
            sum += l;
            sumSq += l * l;
        }
        const mean = sum / samplesPerLine;
        std[i] = Math.sqrt(Math.max(0, sumSq / samplesPerLine - mean * mean));
    }

    const diffs = EDGE_GAPS.map((gap) => {
        const diff = new Float64Array(lineCount);
        for (let i = gap; i < lineCount - gap; i++) {
            let sum = 0;
            for (let j = 0; j < samplesPerLine; j++) sum += Math.abs(sample(i - gap, j) - sample(i + gap, j));
            diff[i] = sum / samplesPerLine;
        }
        return diff;
    });

    return {
        std,
        medStd: median(std) || 1,
        diffs,
        medDiffs: diffs.map((diff, k) => median(Array.from(diff).slice(EDGE_GAPS[k], lineCount - EDGE_GAPS[k])) || 1)
    };
}

// A cell boundary looks like either a photo-to-photo discontinuity (high edge
// ratio) or a flat gutter strip (low variance vs the rest of the image).
function boundaryScore(profile, index) {
    let edge = 0;
    for (let k = 0; k < EDGE_GAPS.length; k++) edge = Math.max(edge, profile.diffs[k][index] / profile.medDiffs[k]);
    const gutter = profile.medStd / Math.max(1e-3, profile.std[index]);
    return Math.max(edge, gutter);
}

// Worst boundary wins: a grid is only as good as its weakest cut. Boundaries
// are searched within a small tolerance because the source atlases are not
// pixel-perfectly even.
export function scoreAxisGrid(lineCount, count, profile, { tolFrac = 0.02 } = {}) {
    if (count <= 1) return Infinity;
    const tol = Math.max(3, Math.round(lineCount * tolFrac));
    let worst = Infinity;
    for (let i = 1; i < count; i++) {
        const center = Math.round(lineCount * i / count);
        let best = 0;
        for (let d = -tol; d <= tol; d++) {
            const index = center + d;
            if (index < 9 || index >= lineCount - 9) continue;
            best = Math.max(best, boundaryScore(profile, index));
        }
        worst = Math.min(worst, best);
    }
    return worst;
}

export function scoreAtlasGrid(image, { cols, rows, tolFrac = 0.02 } = {}) {
    const colProfile = buildAxisProfile(image.width, image.height, (i, j) => luminance(image, i, j));
    const rowProfile = buildAxisProfile(image.height, image.width, (i, j) => luminance(image, j, i));
    return {
        cols: scoreAxisGrid(image.width, Math.max(1, cols | 0), colProfile, { tolFrac }),
        rows: scoreAxisGrid(image.height, Math.max(1, rows | 0), rowProfile, { tolFrac })
    };
}
