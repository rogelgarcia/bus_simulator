// Preserve prepared leaf/cavity contrast through distant canopy mip levels.
// @ts-check
import * as THREE from 'three';

/** Prepare the existing linear RGB canopy map, retaining the same dimensions and mip count.
 * @param {THREE.DataTexture} texture @param {number} maxAnisotropy */
export function prepareGrassDebugV2FarTexture(texture, maxAnisotropy) {
    if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) throw new Error('Far canopy requires a positive anisotropy limit.');
    let { data, width, height } = texture.image;
    const mipmaps = [{ data, width, height }]; let level = 0;
    while (width > 1 || height > 1) {
        const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1), next = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) sum += data[(Math.min(height - 1, y * 2 + dy) * width + Math.min(width - 1, x * 2 + dx)) * 4 + c];
                next[o + c] = sum / 4;
            }
            next[o + 3] = 255;
        }
        // Filter the untouched parent. Contrast must not compound down the pyramid.
        data = next; width = w; height = h; level++;
        const output = new Uint8Array(next.length), mean = [0, 0, 0];
        for (let i = 0; i < next.length; i += 4) for (let c = 0; c < 3; c++) mean[c] += next[i + c] / (w * h);
        const gain = 1 + 3.9 * Math.min(1, level / 4);
        // Coarser levels lose bright blade tips as they average into root cavities.
        // Compensate in the prepared map, not with a camera-distance shader branch.
        const coarseGain = level > 4 ? 1.33 : 1;
        const average = mean[0] * .2126 + mean[1] * .7152 + mean[2] * .0722;
        for (let i = 0; i < next.length; i += 4) {
            const luma = next[i] * .2126 + next[i + 1] * .7152 + next[i + 2] * .0722;
            const scale = luma > 0 ? Math.max(0, average + (luma - average) * gain) / luma : 0;
            for (let c = 0; c < 3; c++) output[i + c] = Math.round(Math.min(255, next[i + c] * scale * coarseGain));
            output[i + 3] = 255;
        }
        mipmaps.push({ data: output, width, height });
    }
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(16, maxAnisotropy);
    texture.mipmaps = mipmaps; texture.generateMipmaps = false; texture.needsUpdate = true;
}
