// Matte lawn appearance and warm green-to-straw variation for the soil-rooted leaf study.
// @ts-check
import * as THREE from 'three';

export const GRASS_V2_SHOOT_APPEARANCE = Object.freeze({
    roughness: 1, roughnessMin: 0.86, roughnessMax: 0.94, normalStrength: 0.12
});

const stops = [
    { height: 0, green: new THREE.Color('#4b6825'), dry: new THREE.Color('#70603b') },
    { height: 0.35, green: new THREE.Color('#5f8524'), dry: new THREE.Color('#8d7c4c') },
    { height: 0.8, green: new THREE.Color('#68932a'), dry: new THREE.Color('#a08e5c') },
    { height: 1, green: new THREE.Color('#799b33'), dry: new THREE.Color('#b3a477') }
];

/** @param {number} height @param {THREE.Color} color @param {number} [dryness] */
export function sampleGrassDebugV2ShootColor(height, color, dryness = 0) {
    const highIndex = Math.max(1, stops.findIndex(stop => stop.height >= height));
    const low = stops[highIndex - 1], high = stops[highIndex];
    const blend = (height - low.height) / (high.height - low.height);
    const dry = dryness * (0.45 + 0.55 * THREE.MathUtils.smoothstep(height, 0.15, 0.9));
    color.setRGB(
        THREE.MathUtils.lerp(THREE.MathUtils.lerp(low.green.r, high.green.r, blend), THREE.MathUtils.lerp(low.dry.r, high.dry.r, blend), dry),
        THREE.MathUtils.lerp(THREE.MathUtils.lerp(low.green.g, high.green.g, blend), THREE.MathUtils.lerp(low.dry.g, high.dry.g, blend), dry),
        THREE.MathUtils.lerp(THREE.MathUtils.lerp(low.green.b, high.green.b, blend), THREE.MathUtils.lerp(low.dry.b, high.dry.b, blend), dry)
    );
}

// Fit the two-row gradient to the blade body, so tip yellow does not span its full height.
const lod2UpperColor = new THREE.Color();
/** @param {number} height @param {THREE.Color} color @param {number} [dryness] */
export function sampleGrassDebugV2Lod2Color(height, color, dryness = 0) {
    sampleGrassDebugV2ShootColor(0.2, color, dryness);
    sampleGrassDebugV2ShootColor(0.9, lod2UpperColor, dryness);
    return color.lerp(lod2UpperColor, (height - 0.2) / 0.7);
}
