// Fine longitudinal leaf relief and waxy roughness remain separate from color and the geometric midrib.
// @ts-check
import * as THREE from 'three';
import { sampleGrassDebugV2DetailedBladeHalfWidth } from './GrassDebugV2DetailedBlade.js';

export const GRASS_V2_DETAILED_BLADE_SURFACE = Object.freeze({
    width: 256, height: 1024, lengthMeters: 0.225,
    primaryReliefMeters: 0.000028, secondaryReliefMeters: 0.000009,
    roughnessMin: 0.64, roughnessMax: 0.72
});

function sampleRelief(u, v) {
    const s = 2 * u - 1;
    const envelope = (1 - THREE.MathUtils.smoothstep(Math.abs(s), 0.82, 1))
        * THREE.MathUtils.smoothstep(v, 0, 0.06)
        * (1 - THREE.MathUtils.smoothstep(v, 0.78, 1));
    const phase = 0.1 * Math.sin(v * Math.PI * 2) + 0.035 * Math.sin(v * Math.PI * 7);
    const primary = Math.sin((u * 9 + phase) * Math.PI * 2);
    const secondary = Math.sin((u * 21 - phase * 0.6 + 0.18) * Math.PI * 2);
    const centerFade = 1 - 0.8 * Math.exp(-((s / 0.16) ** 2));
    const definition = GRASS_V2_DETAILED_BLADE_SURFACE;
    return envelope * centerFade * (definition.primaryReliefMeters * primary + definition.secondaryReliefMeters * secondary);
}

function createTexture(data, name) {
    const { width, height } = GRASS_V2_DETAILED_BLADE_SURFACE;
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.name = name;
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

/** @returns {{normalMap: THREE.DataTexture, roughnessMap: THREE.DataTexture, dispose: () => void}} */
export function createGrassDebugV2DetailedBladeSurface() {
    const { width, height, lengthMeters, roughnessMin, roughnessMax } = GRASS_V2_DETAILED_BLADE_SURFACE;
    const normals = new Uint8Array(width * height * 4);
    const roughness = new Uint8Array(normals.length);
    const du = 1 / width, dv = 1 / height;
    for (let y = 0; y < height; y++) {
        const v = (y + 0.5) / height;
        const localWidth = 2 * sampleGrassDebugV2DetailedBladeHalfWidth(v);
        for (let x = 0; x < width; x++) {
            const u = (x + 0.5) / width;
            const dx = (sampleRelief(u + du, v) - sampleRelief(u - du, v)) / (2 * du * localWidth);
            const dy = (sampleRelief(u, v + dv) - sampleRelief(u, v - dv)) / (2 * dv * lengthMeters);
            const inverseLength = 1 / Math.hypot(dx, dy, 1);
            const offset = (y * width + x) * 4;
            normals[offset] = Math.round((0.5 - 0.5 * dx * inverseLength) * 255);
            normals[offset + 1] = Math.round((0.5 - 0.5 * dy * inverseLength) * 255);
            normals[offset + 2] = Math.round((0.5 + 0.5 * inverseLength) * 255);
            normals[offset + 3] = 255;
            const rib = Math.exp(-(((2 * u - 1) / 0.16) ** 2));
            const relief = sampleRelief(u, v) / 0.000037;
            const value = THREE.MathUtils.clamp(0.69 - 0.04 * rib + 0.015 * relief, roughnessMin, roughnessMax);
            roughness.fill(Math.round(value * 255), offset, offset + 3);
            roughness[offset + 3] = 255;
        }
    }
    const normalMap = createTexture(normals, 'GrassV2DetailedBladeNormal');
    const roughnessMap = createTexture(roughness, 'GrassV2DetailedBladeRoughness');
    return Object.freeze({ normalMap, roughnessMap, dispose: () => { normalMap.dispose(); roughnessMap.dispose(); } });
}
