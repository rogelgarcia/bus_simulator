// Bake stable soil speckles into root albedo without altering leaf alpha, normals or runtime shading.
// @ts-check
import * as THREE from 'three';

/** @typedef {{material: THREE.MeshStandardMaterial, terrain: {width:number,depth:number,centerX:number,centerZ:number}}} CardRootSoil */
export const GRASS_V2_CARD_ROOT_SOIL = Object.freeze({
    fadeStartMeters: -0.0003, fadeEndMeters: 0.0024, grainSpacingMeters: 0.00038, maximumOpacity: 0.72
});

function grainRandom(x, y, seed) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
}

function soilCoverage(x, height) {
    const definition = GRASS_V2_CARD_ROOT_SOIL, spacing = definition.grainSpacingMeters;
    const px = x / spacing, py = height / spacing, ix = Math.floor(px), iy = Math.floor(py);
    let coverage = 0;
    for (let j = iy - 1; j <= iy + 1; j++) for (let i = ix - 1; i <= ix + 1; i++) {
        const cx = i + 0.15 + 0.7 * grainRandom(i, j, 1), cy = j + 0.15 + 0.7 * grainRandom(i, j, 2);
        const density = 1 - THREE.MathUtils.smootherstep(cy * spacing, definition.fadeStartMeters, definition.fadeEndMeters);
        if (grainRandom(i, j, 3) > density * 0.85) continue;
        const radius = 0.25 + 0.15 * grainRandom(i, j, 4), distance = Math.hypot(px - cx, py - cy);
        const grain = 1 - THREE.MathUtils.smoothstep(distance, radius * 0.55, radius);
        coverage = Math.max(coverage, grain * density * definition.maximumOpacity);
    }
    return coverage;
}

/** @param {CardRootSoil} options @param {{stations: readonly {z:number,y:number}[]}} referenceSide */
export function createGrassDebugV2CardRootSoil({ material, terrain }, referenceSide) {
    if (!material?.isMeshStandardMaterial || !material.map?.image
        || ![terrain.width, terrain.depth, terrain.centerX, terrain.centerZ].every(Number.isFinite)
        || terrain.width <= 0 || terrain.depth <= 0) throw new Error('Card root soil requires a loaded ground texture and finite terrain.');
    const texture = material.map, image = texture.image;
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    texture.updateMatrix();
    const uv = new THREE.Vector2(), soil = new THREE.Color();
    const sample = (x, y, channel) => data[((y + canvas.height) % canvas.height * canvas.width
        + (x + canvas.width) % canvas.width) * 4 + channel] / 255;
    const [root, firstJoin] = referenceSide.stations;
    const rootSlope = (firstJoin.y - root.y) / (firstJoin.z - root.z);
    let tintedTexels = 0;

    return Object.freeze({
        apply(pixels, width, height, frame) {
            for (let row = 0; row < height; row++) {
                const z = frame.maxZ - (row + 0.5) / height * (frame.maxZ - frame.minZ);
                const cardHeight = root.y + (z - root.z) * rootSlope;
                if (cardHeight > GRASS_V2_CARD_ROOT_SOIL.fadeEndMeters + GRASS_V2_CARD_ROOT_SOIL.grainSpacingMeters) continue;
                for (let col = 0; col < width; col++) {
                    const offset = (row * width + col) * 4;
                    if (!pixels[offset + 3]) continue;
                    const worldX = frame.minX + (col + 0.5) / width * (frame.maxX - frame.minX);
                    const amount = soilCoverage(worldX, cardHeight);
                    if (!amount) continue;
                    uv.set(0.5 + (worldX - terrain.centerX) / terrain.width, 0.5 - (z - terrain.centerZ) / terrain.depth);
                    texture.transformUv(uv);
                    const x = uv.x * canvas.width - 0.5, y = uv.y * canvas.height - 0.5;
                    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
                    const channels = [0, 1, 2].map(channel => THREE.MathUtils.lerp(
                        THREE.MathUtils.lerp(sample(x0, y0, channel), sample(x0 + 1, y0, channel), tx),
                        THREE.MathUtils.lerp(sample(x0, y0 + 1, channel), sample(x0 + 1, y0 + 1, channel), tx), ty));
                    soil.setRGB(channels[0], channels[1], channels[2], texture.colorSpace).multiply(material.color);
                    for (const [channel, component] of [[0, soil.r], [1, soil.g], [2, soil.b]])
                        pixels[offset + channel] = Math.round(THREE.MathUtils.lerp(pixels[offset + channel], component * 255, amount));
                    tintedTexels++;
                }
            }
        },
        getSnapshot: () => ({ ...GRASS_V2_CARD_ROOT_SOIL, reference: 'split-card-height', material: material.name, tintedTexels })
    });
}
