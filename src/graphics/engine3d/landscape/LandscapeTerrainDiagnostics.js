// Declares the terrain shader diagnostics and the surface review palettes shared by shader uniforms and legends.
// @ts-check
// Level tints are linear albedo colors so the tinted surface keeps its lighting and tone mapping. Soil review
// colors are display sRGB written without tone mapping, so pure regions reproduce the review image bytes. AI577 D5 adds the terrain-driven
// appearance inputs and the natural dressing inputs (composite and one gray-value view per output), unlit like the coverage weights.
import { landscapeDressingClass } from './LandscapeTerrainAppearance.js';

export const LANDSCAPE_DIAGNOSTICS = Object.freeze(['none', 'elevation', 'slope', 'water', 'surface-level', 'surface-coverage', 'terrain-appearance',
    'dressing', 'dressing-grass', 'dressing-shrub', 'dressing-tree', 'dressing-rock', 'dressing-debris']);

/** Diagnostics whose shader branch reads each soil's dressing host class from uSurfaceSoilColors[soil].x. */
export const LANDSCAPE_DRESSING_DIAGNOSTICS = Object.freeze(LANDSCAPE_DIAGNOSTICS.filter(name => name.startsWith('dressing')));

/** @param {ReadonlyArray<{id:string}>} soilCatalog @returns {Float32Array} per soil (dressing host class, 0, 0) in catalog order */
export function landscapeDressingClassValues(soilCatalog) {
    if (!Array.isArray(soilCatalog) || soilCatalog.length > 6) throw new Error('[Landscape] Dressing diagnostics support at most 6 soils');
    const values = new Float32Array(18);
    soilCatalog.forEach((soil, index) => { values[index * 3] = landscapeDressingClass(soil.id); });
    return values;
}

export const LANDSCAPE_SURFACE_LEVEL_COLORS = Object.freeze([
    Object.freeze({ level: 0, name: 'blue', hex: '#3d5afe' }),
    Object.freeze({ level: 1, name: 'cyan', hex: '#00b8d4' }),
    Object.freeze({ level: 2, name: 'green', hex: '#00c853' }),
    Object.freeze({ level: 3, name: 'yellow', hex: '#ffd600' }),
    Object.freeze({ level: 4, name: 'orange', hex: '#ff6d00' }),
    Object.freeze({ level: 5, name: 'red', hex: '#ff1744' }),
    Object.freeze({ level: 6, name: 'violet', hex: '#d500f9' }),
    Object.freeze({ level: 7, name: 'white', hex: '#ffffff' })
]);

export const LANDSCAPE_SURFACE_SOIL_COLORS = Object.freeze({
    unknown: Object.freeze({ name: 'magenta', hex: '#d23cd2' }),
    seabed: Object.freeze({ name: 'blue-gray', hex: '#607c8a' }),
    sand: Object.freeze({ name: 'beige', hex: '#d9c58f' }),
    loam: Object.freeze({ name: 'green', hex: '#76a04e' }),
    forest: Object.freeze({ name: 'brown', hex: '#684c30' }),
    rock: Object.freeze({ name: 'light gray', hex: '#bab7b0' })
});

const SOIL_CHANNELS = 6;

/** @param {string} hex @returns {number[]} sRGB bytes */
export function landscapeColorBytes(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`[Landscape] Invalid review color ${hex}`);
    return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

const linear = byte => { const value = byte / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };

/** @param {ReadonlyArray<{id:string}>} soilCatalog @returns {Float32Array} display sRGB triplets in catalog order */
export function landscapeSurfaceSoilColorValues(soilCatalog) {
    if (!Array.isArray(soilCatalog) || soilCatalog.length > SOIL_CHANNELS) throw new Error(`[Landscape] Surface coverage review supports at most ${SOIL_CHANNELS} soils`);
    const values = new Float32Array(SOIL_CHANNELS * 3);
    soilCatalog.forEach((soil, index) => {
        const color = LANDSCAPE_SURFACE_SOIL_COLORS[soil.id];
        if (!color) throw new Error(`[Landscape] Surface coverage review has no color for soil ${soil.id}`);
        values.set(landscapeColorBytes(color.hex).map(byte => byte / 255), index * 3);
    });
    return values;
}

/** @returns {Float32Array} linear albedo level tints in level order */
export function landscapeSurfaceLevelColorValues() {
    const levels = new Float32Array(LANDSCAPE_SURFACE_LEVEL_COLORS.length * 3);
    LANDSCAPE_SURFACE_LEVEL_COLORS.forEach((entry, index) => levels.set(landscapeColorBytes(entry.hex).map(linear), index * 3));
    return levels;
}

/**
 * The level tints as the compile-time vec3 list of the terrain shader's constant array (since AI577 D5c they occupy no uniform vectors).
 * @returns {string}
 */
export function landscapeSurfaceLevelColorDefine() {
    const values = landscapeSurfaceLevelColorValues();
    return LANDSCAPE_SURFACE_LEVEL_COLORS.map((_, index) => `vec3(${[0, 1, 2].map(channel => values[index * 3 + channel].toFixed(8)).join(', ')})`).join(', ');
}

/** @returns {{uSurfaceSoilColors:{value:Float32Array}}} the catalog-ordered coverage review colors, set when the diagnostic is selected */
export function createLandscapeDiagnosticUniforms() {
    return { uSurfaceSoilColors: { value: new Float32Array(SOIL_CHANNELS * 3) } };
}
