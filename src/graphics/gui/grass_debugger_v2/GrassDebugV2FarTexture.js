// Preserve prepared leaf/cavity contrast through distant canopy mip levels.
// @ts-check
import * as THREE from 'three';

export const GRASS_FAR_TEXTURE_PROFILE = Object.freeze({ mipContrast: 4.9, coarseGain: 1, cavityPower: .72, colorRange: 3, highlightShoulder: 60 });

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
        const gain = 1 + (GRASS_FAR_TEXTURE_PROFILE.mipContrast - 1) * Math.min(1, level / 4);
        // Brightness compensation belongs to the material, equally for every mip.
        // A gain step between levels makes a bright/dark band track the camera.
        const average = mean[0] * .2126 + mean[1] * .7152 + mean[2] * .0722;
        for (let i = 0; i < next.length; i += 4) {
            const luma = next[i] * .2126 + next[i + 1] * .7152 + next[i + 2] * .0722;
            const scale = luma > 0 ? Math.max(0, average + (luma - average) * gain) / luma : 0;
            for (let c = 0; c < 3; c++) output[i + c] = Math.round(Math.min(255, next[i + c] * scale));
            output[i + 3] = 255;
        }
        mipmaps.push({ data: output, width, height });
    }
    // Restore cavities after filtering without dimming every coarse mip. Square-root means
    // approximate displayed brightness; range encoding avoids clipping bright tips in RGBA8.
    // The existing material color decodes that range, with no extra runtime texture or shader work.
    for (const { data } of mipmaps) {
        const shaped = new Float32Array(data.length), before = [0, 0, 0], after = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
            const cavity = Math.pow((data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) / 255, GRASS_FAR_TEXTURE_PROFILE.cavityPower);
            for (let c = 0; c < 3; c++) {
                shaped[i + c] = data[i + c] * cavity;
                before[c] += Math.sqrt(data[i + c]); after[c] += Math.sqrt(shaped[i + c]);
            }
        }
        const gain = before.map((value, c) => after[c] > 0 ? (value / after[c]) ** 2 / GRASS_FAR_TEXTURE_PROFILE.colorRange : 0);
        // Compress pale tips during preparation, retaining the same hue and dark cavities.
        // Applying the same shoulder to every level avoids a distance-dependent gain step.
        const shoulder = GRASS_FAR_TEXTURE_PROFILE.highlightShoulder;
        for (let i = 0; i < data.length; i += 4) {
            const luma = (shaped[i] * gain[0] * .2126 + shaped[i + 1] * gain[1] * .7152
                + shaped[i + 2] * gain[2] * .0722) * GRASS_FAR_TEXTURE_PROFILE.colorRange;
            const excess = Math.max(0, luma - shoulder), limited = Math.min(luma, shoulder) + excess / (1 + excess / shoulder);
            const scale = luma > 0 ? limited / luma : 1;
            for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.min(255, shaped[i + c] * gain[c] * scale));
        }
    }
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(16, maxAnisotropy);
    texture.mipmaps = mipmaps; texture.generateMipmaps = false; texture.needsUpdate = true;
}
