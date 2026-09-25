// Preserve a cutout-coverage floor per atlas page without additional runtime texture samples.
// Mips descend from unscaled alpha; feeding corrections into the next level would compound them.
// Never attenuate alpha: anisotropic averaging and MSAA coverage can otherwise erase thin strips.
// @ts-check

function histogram(data, width, height, startX, pageWidth) {
    const bins = new Uint32Array(256);
    for (let y = 0; y < height; y++) for (let x = startX; x < startX + pageWidth; x++) bins[data[(y * width + x) * 4 + 3]]++;
    return bins;
}

function coverage(bins, threshold) {
    let count = 0;
    for (let a = Math.floor(threshold) + 1; a < 256; a++) count += bins[a];
    return count;
}

function coverageScale(bins, target, cutoff) {
    let scale = 1, bestCount = coverage(bins, cutoff), error = Math.abs(bestCount - target), count = 0;
    for (let a = 255; a > 0; a--) {
        count += bins[a];
        const candidate = (Math.floor(cutoff) + 0.501) / a;
        const difference = Math.abs(count - target);
        if (difference < error || (difference === error && (count > bestCount
            || (count === bestCount && Math.abs(Math.log(candidate)) < Math.abs(Math.log(scale)))))) {
            error = difference; scale = candidate; bestCount = count;
        }
    }
    return scale;
}

/**
 * @param {Uint8Array} data Linear RGBA with straight RGB and coverage in alpha.
 * @param {number} width Power-of-two atlas width.
 * @param {number} height Power-of-two atlas height.
 * @param {{alphaTest?: number, pages?: number}} options Equal horizontal pages, corrected independently.
 * @returns {{data: Uint8Array, width: number, height: number}[]}
 */
export function createGrassAlphaCoverageMipmaps(data, width, height, { alphaTest = 0.15, pages = 1 } = {}) {
    const powerOfTwo = value => Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
    if (!(data instanceof Uint8Array) || !powerOfTwo(width) || !powerOfTwo(height) || !powerOfTwo(pages)
        || pages > width || data.length !== width * height * 4 || !(alphaTest > 0 && alphaTest < 1)) {
        throw new Error('Grass coverage mipmaps require a power-of-two RGBA atlas, equal pages and a cutout threshold between zero and one.');
    }
    const cutoff = alphaTest * 255;
    const targets = Array.from({ length: pages }, (_, page) => coverage(histogram(data, width, height, page * width / pages, width / pages), cutoff) / (width * height / pages));
    const levels = [{ data, width, height }];
    let previous = levels[0];
    while (previous.width > 1 || previous.height > 1) {
        const w = Math.max(1, previous.width / 2), h = Math.max(1, previous.height / 2), raw = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const offsets = [0, 1, 2, 3].map(i => (Math.min(previous.height - 1, y * 2 + (i >> 1)) * previous.width
                + Math.min(previous.width - 1, x * 2 + (i & 1))) * 4);
            const alpha = offsets.reduce((sum, i) => sum + previous.data[i + 3], 0);
            raw[o + 3] = Math.round(alpha / 4);
            for (let c = 0; c < 3; c++) raw[o + c] = Math.round(offsets.reduce((sum, i) => sum
                + previous.data[i + c] * (alpha ? previous.data[i + 3] : 1), 0) / (alpha || 4));
        }
        const corrected = raw.slice(), count = Math.min(pages, w), pageWidth = w / count;
        for (let page = 0; page < count; page++) {
            const first = page * pages / count, last = (page + 1) * pages / count;
            const target = targets.slice(first, last).reduce((sum, value) => sum + value, 0) / (last - first);
            const scale = Math.max(1, coverageScale(histogram(raw, w, h, page * pageWidth, pageWidth), target * pageWidth * h, cutoff));
            for (let y = 0; y < h; y++) for (let x = page * pageWidth; x < (page + 1) * pageWidth; x++) {
                const i = (y * w + x) * 4 + 3; corrected[i] = Math.min(255, Math.round(raw[i] * scale));
            }
        }
        levels.push({ data: corrected, width: w, height: h }); previous = { data: raw, width: w, height: h };
    }
    return levels;
}
