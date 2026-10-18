// Builds the mip chains of landscape material maps on the CPU, filtered as the GPU's generateMipmap filtered them until AI 598 D3a.
// @ts-check
// Design. The material arrays are immutable texStorage3D arrays whose slots are uploaded one mip level at a time (LandscapeMaterialSlots), so the
// mip chain of a map is computed where its pages are decoded (the appearance worker) instead of by generateMipmap, which would refilter every slot
// of a 24-layer 1024 array at every upload. The filters reproduce what the per-tier textures received from generateMipmap before D3a, because the
// shading depends on them: each level is the 2x2 box of the level above, in linear light for the sRGB base colour (decoded, averaged, re-encoded)
// and on the stored bytes for the linear layers (normals, ORM, micro), rounded to the nearest byte with ties to even like a float-to-UNORM
// conversion. The normal layer is deliberately not renormalized per level: the mean normal shortens where the texels disagree, and the normal mip
// filtering of the terrain program (landscapeFilteredRoughness, the von Mises-Fisher widening from that length) reads exactly that shortening; the
// bake's published tiers renormalize each tier's texels, but no mip chain ever did. A level's texel is an exact average, so a 1024 -> 512 reduction
// agrees with the published 512 page of the same material within the rounding of one byte for the base colour and ORM maps.

export const LANDSCAPE_MATERIAL_MIPS = Object.freeze({
    id: 'landscape-material-mips-v1',
    filter: Object.freeze({ srgb: 'linear-light 2x2 box, re-encoded', linear: '2x2 box of the stored bytes' }),
    rounding: 'nearest, ties to even',
    normals: 'not renormalized per level (the shortened mean drives the normal mip filtering)'
});

const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, byte) => { const s = byte / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
const linearToSrgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;

function roundEven(value) {
    const floor = Math.floor(value), fraction = value - floor;
    if (fraction > .5) return floor + 1;
    if (fraction < .5) return floor;
    return floor + (floor & 1);
}

function resolutionInput(resolution) {
    if (!Number.isSafeInteger(resolution) || resolution < 1 || (resolution & (resolution - 1)) !== 0) throw new Error(`[LandscapeMaterialMips] A map resolution must be a power of two; received ${resolution}`);
    return resolution;
}

/** Levels of a map's complete mip chain. @param {number} resolution */
export function landscapeMaterialMipLevels(resolution) { return Math.log2(resolutionInput(resolution)) + 1; }

/**
 * Byte offsets of every level of an RGBA8 chain (level 0 first) and the chain's total bytes.
 * @param {number} resolution @returns {Readonly<{offsets:readonly number[],sizes:readonly number[],bytes:number}>}
 */
export function landscapeMaterialMipOffsets(resolution) {
    const levels = landscapeMaterialMipLevels(resolution), offsets = [], sizes = [];
    let offset = 0;
    for (let level = 0; level < levels; level++) { const size = resolution >> level; offsets.push(offset); sizes.push(size); offset += size * size * 4; }
    return Object.freeze({ offsets: Object.freeze(offsets), sizes: Object.freeze(sizes), bytes: offset });
}

/**
 * One level down: the 2x2 box of an RGBA8 level, in linear light for sRGB colour channels (alpha stays linear).
 * @param {Uint8Array} source @param {number} size source resolution @param {Uint8Array} target @param {{srgb:boolean}} options
 */
export function reduceLandscapeMaterialLevel(source, size, target, { srgb }) {
    if (source.length !== size * size * 4 || target.length !== (size >> 1) * (size >> 1) * 4 || size < 2) throw new Error('[LandscapeMaterialMips] A reduction takes an RGBA8 level and a target of half its size');
    const half = size >> 1;
    for (let row = 0; row < half; row++) {
        const upper = row * 2 * size * 4, lower = upper + size * 4;
        for (let column = 0; column < half; column++) {
            const a = upper + column * 8, b = a + 4, c = lower + column * 8, d = c + 4, out = (row * half + column) * 4;
            if (srgb) {
                for (let channel = 0; channel < 3; channel++) {
                    const mean = (SRGB_TO_LINEAR[source[a + channel]] + SRGB_TO_LINEAR[source[b + channel]] + SRGB_TO_LINEAR[source[c + channel]] + SRGB_TO_LINEAR[source[d + channel]]) * .25;
                    target[out + channel] = roundEven(linearToSrgb(mean) * 255);
                }
                target[out + 3] = roundEven((source[a + 3] + source[b + 3] + source[c + 3] + source[d + 3]) * .25);
            } else for (let channel = 0; channel < 4; channel++) target[out + channel] = roundEven((source[a + channel] + source[b + channel] + source[c + channel] + source[d + channel]) * .25);
        }
    }
    return target;
}

/**
 * The complete mip chain of an RGBA8 map (level 0 first, down to 1x1), as one buffer the slots upload level by level.
 * @param {Uint8Array} level0 @param {number} resolution @param {{srgb:boolean}} options
 */
export function buildLandscapeMaterialMipChain(level0, resolution, { srgb }) {
    resolutionInput(resolution);
    if (!(level0 instanceof Uint8Array) || level0.length !== resolution * resolution * 4) throw new Error(`[LandscapeMaterialMips] Level 0 must be ${resolution}x${resolution} RGBA8 bytes`);
    if (typeof srgb !== 'boolean') throw new Error('[LandscapeMaterialMips] The colour space of a chain must be stated (srgb boolean)');
    const layout = landscapeMaterialMipOffsets(resolution), chain = new Uint8Array(layout.bytes);
    chain.set(level0, 0);
    for (let level = 1; level < layout.sizes.length; level++) {
        const source = chain.subarray(layout.offsets[level - 1], layout.offsets[level - 1] + layout.sizes[level - 1] ** 2 * 4);
        reduceLandscapeMaterialLevel(source, layout.sizes[level - 1], chain.subarray(layout.offsets[level], layout.offsets[level] + layout.sizes[level] ** 2 * 4), { srgb });
    }
    return chain;
}

/** One level of a chain as a view. @param {Uint8Array} chain @param {number} resolution @param {number} level */
export function landscapeMaterialMipLevel(chain, resolution, level) {
    const layout = landscapeMaterialMipOffsets(resolution);
    if (!Number.isSafeInteger(level) || level < 0 || level >= layout.sizes.length) throw new Error(`[LandscapeMaterialMips] Level ${level} is outside the ${layout.sizes.length}-level chain`);
    if (chain.length !== layout.bytes) throw new Error(`[LandscapeMaterialMips] A ${resolution} chain holds ${layout.bytes} bytes; received ${chain.length}`);
    return chain.subarray(layout.offsets[level], layout.offsets[level] + layout.sizes[level] ** 2 * 4);
}
