// Colours and shades a terrain stream in soil-palette mode (AI 596 D5, the render-only surround) per display soil at draw time.
// @ts-check
// Design: a stream built in soil-palette mode carries each vertex's display soil index instead of a colour (LandscapeMeshBuffers soilPalette) and
// its tiles share one set of palette cells (uSoilPalette, uSoilPaletteResponse, uSoilPaletteSurface, uSoilPaletteMode) that the terrain vertex
// shader reads into the fallback surface. The colour cells start on the land-cover catalog colours the fallback vertex colours carry, so a stream
// without an appearance looks as before, and take the loaded appearance's palette once it is ready: each soil's mean linear albedo of its coarsest
// (32 px) base-colour page under the material's albedo correction (uSoilAlbedo: brightness times the landscape-local calibration gain, hue,
// saturation, tint; the same math as the fragment shader's correctedAlbedo), which is what the authoritative tiles show at far footprints once their
// mips average the page. The response cells carry each soil's natural-ground response (LandscapeMaterialResponse: EON diffuse roughness, specular
// shadowing weight, opposition amplitude) in both states, since it belongs to the soil, not the appearance; the fallback path without them read
// 1.5x brighter than the appearance path beside it (AI 596 D5 attribution at NW-11). The surface cells carry the mean roughness (after the
// material's remap) and ambient occlusion (after its intensity) of the coarse ORM page with the appearance, the plain fallback's 0.9 and 1.0 without.
// The lighting, aerial perspective and water column are the shared terrain lighting path. The terrain-field macro variation, catena tinting and
// coastal wetting need the appearance's field pages and stay with the authoritative tiles. A palette change is a uniform update: no tile is rebuilt.
// The cells are flat float arrays (three.js uploads a flat array to a vector array uniform), so this module and its tests need no renderer.
import { LANDSCAPE_SOIL_SLOTS } from './LandscapeCoverageSlots.js';
import { landscapeCatalogSoilPalette } from './LandscapeMeshBuffers.js';
import { landscapeMaterialResponseDefinition } from './LandscapeMaterialResponse.js';

export const LANDSCAPE_SOIL_PALETTE = Object.freeze({ id: 'landscape-soil-palette-v1', sources: Object.freeze(['catalog', 'appearance']), neutral: Object.freeze([0.18, 0.18, 0.18]),
    plainSurface: Object.freeze([0.9, 1]), ormLayerRole: 'orm' });

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, byte) => { const s = byte / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
const linearToSrgbByte = value => { const v = Math.max(0, Math.min(1, value)); return Math.round((v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055) * 255); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isColor = value => Array.isArray(value) && value.length === 3 && value.every(component => Number.isFinite(component) && component >= 0);
const isSurface = value => Array.isArray(value) && value.length === 2 && value.every(component => Number.isFinite(component) && component >= 0 && component <= 1);
const vec = value => Array.isArray(value) || ArrayBuffer.isView(value) ? value : [value.x, value.y, value.z, value.w];
const round4 = values => values.map(component => Math.round(component * 1e4) / 1e4);

/** The per-tile palette cells; mode 0 (the default of every tile) reads the colour attribute as a colour and keeps the plain fallback surface. @param {number} [mode] */
export function createLandscapeSoilPaletteUniforms(mode = 0) {
    const surface = new Float32Array(LANDSCAPE_SOIL_SLOTS * 2);
    for (let soil = 0; soil < LANDSCAPE_SOIL_SLOTS; soil++) surface.set(LANDSCAPE_SOIL_PALETTE.plainSurface, soil * 2);
    return { uSoilPalette: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS * 3) }, uSoilPaletteResponse: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS * 3) }, uSoilPaletteSurface: { value: surface }, uSoilPaletteMode: { value: mode } };
}

/** Mean linear albedo of an RGBA8 sRGB page. @param {Uint8Array} bytes @returns {number[]} */
export function landscapeMeanLinearAlbedo(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes.length % 4 !== 0) throw new Error('[Landscape] A base-colour page is RGBA8 bytes');
    const texels = bytes.length / 4;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < bytes.length; i += 4) { r += SRGB_TO_LINEAR[bytes[i]]; g += SRGB_TO_LINEAR[bytes[i + 1]]; b += SRGB_TO_LINEAR[bytes[i + 2]]; }
    return [r / texels, g / texels, b / texels];
}

/**
 * The fragment shader's correctedAlbedo(color, correction) in JavaScript: a hue rotation about the grey axis, saturation about the luminance, the
 * hue's tint and the brightness gain. @param {number[]} color linear rgb @param {{x:number,y:number,z:number,w:number}|ArrayLike<number>} correction uSoilAlbedo cell
 */
export function landscapeCorrectedAlbedo(color, correction) {
    if (!isColor(color)) throw new Error('[Landscape] A corrected albedo takes a linear rgb triple');
    const [brightness, hue, saturation, tint] = vec(correction);
    const [r, g, b] = color, axis = 0.57735026919, cosine = Math.cos(hue), sine = Math.sin(hue), along = axis * (r + g + b) * (1 - cosine) * axis;
    let rotated = [r * cosine + axis * (b - g) * sine + along, g * cosine + axis * (r - b) * sine + along, b * cosine + axis * (g - r) * sine + along];
    const luminance = .2126 * rotated[0] + .7152 * rotated[1] + .0722 * rotated[2];
    rotated = rotated.map(component => luminance + (component - luminance) * (1 + saturation));
    const third = 2.0943951, tints = [.5 + .5 * Math.cos(hue), .5 + .5 * Math.cos(hue - third), .5 + .5 * Math.cos(hue + third)];
    return rotated.map((component, k) => Math.max(0, (component + (component * tints[k] * 2 - component) * tint) * brightness));
}

/**
 * The fragment shader's per-texel roughness remap and ambient occlusion of one soil (soilSurface), averaged over an RGBA8 linear ORM page
 * (R occlusion, G roughness): roughness normalized by the material's input range, inverted on request, remapped through min/max/gamma and scaled,
 * clamped like the shader; occlusion 1 - (1 - R) * intensity.
 * @param {Uint8Array} bytes @param {{roughness:ArrayLike<number>|{x:number,y:number,z:number,w:number},range:ArrayLike<number>|{x:number,y:number,z:number,w:number},aoIntensity:number}} shading
 *   roughness the uSoilRoughness cell (min, max, gamma, invert), range the uSoilRange cell (input min, input max, scale, rotation) @returns {number[]} [roughness, ao]
 */
export function landscapeMeanSurface(bytes, { roughness, range, aoIntensity }) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes.length % 4 !== 0) throw new Error('[Landscape] An ORM page is RGBA8 bytes');
    const remap = vec(roughness), span = vec(range);
    if (![...remap.slice(0, 4), ...span.slice(0, 3), aoIntensity].every(Number.isFinite)) throw new Error('[Landscape] The surface shading needs finite roughness remap, range and occlusion intensity');
    const texels = bytes.length / 4, normalize = span[1] - span[0] > 0.00001;
    let roughSum = 0, aoSum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
        let value = bytes[i + 1] / 255;
        if (normalize) value = clamp((value - span[0]) / (span[1] - span[0]), 0, 1);
        if (remap[3] > 0.5) value = 1 - value;
        roughSum += (remap[0] + (remap[1] - remap[0]) * value ** remap[2]) * span[2];
        aoSum += clamp(1 - (1 - bytes[i] / 255) * aoIntensity, 0, 1);
    }
    return [clamp(roughSum / texels, 0.05, 1), clamp(aoSum / texels, 0, 1)];
}

/**
 * The appearance palette of streamed material pages: each soil's mean linear albedo of its palette (32 px) base-colour page under its albedo
 * correction, and the mean roughness and occlusion of its palette ORM page. The page means are kept on the palette record. Ready once every
 * material has its palette page (AI 598 D3a: the 32 px page is decoded for this palette alone; the materials draw from the 128 px floor).
 * @param {Array<{definition:{soilId:string},index:number,palette:any}>} materials LandscapeMaterialPages materials with their palette records
 * @param {{albedo:any[],roughness?:any[],range?:any[],scale?:any[]}} shading the albedo, roughness, range and scale parameter rows by material index
 * @returns {{ready:boolean,soils:Record<string, number[]>,surface:Record<string, number[]>}}
 */
export function landscapeAppearanceSoilPalette(materials, shading) {
    const cells = Array.isArray(shading) ? { albedo: shading } : shading;
    const soils = {}, surface = {};
    let ready = true;
    for (const material of materials) {
        const record = material.palette;
        if (record && !record.meanLinearAlbedo && record.baseColor) record.meanLinearAlbedo = landscapeMeanLinearAlbedo(record.baseColor);
        if (!record?.meanLinearAlbedo) { ready = false; continue; }
        soils[material.definition.soilId] = landscapeCorrectedAlbedo(record.meanLinearAlbedo, cells.albedo[material.index]);
        if (!record.meanSurface && record.surface && cells.roughness && cells.range && cells.scale) {
            const layers = record.tier?.pages ? record.tier.pages.slice(1) : null, layer = layers ? layers.findIndex(page => page.role === LANDSCAPE_SOIL_PALETTE.ormLayerRole) : 1, size = record.baseColor?.length ?? record.surface.length / Math.max(1, (record.maps ?? 3) - 1);
            if (layer >= 0 && record.surface.length >= (layer + 1) * size) record.meanSurface = landscapeMeanSurface(record.surface.subarray(layer * size, (layer + 1) * size), { roughness: cells.roughness[material.index], range: cells.range[material.index], aoIntensity: vec(cells.scale[material.index])[2] });
        }
        if (record.meanSurface) surface[material.definition.soilId] = record.meanSurface;
    }
    return { ready, soils, surface };
}

/**
 * The palette cells of one stream in soil-palette mode: the catalog colours of the manifest's soils and their natural-ground response until an
 * appearance palette replaces the colours (and surfaces) of the soils it names (the catalog and the plain surface keep the rest; null restores them).
 * `set` returns whether the cells changed; a palette with the version already applied is skipped.
 * @param {any} manifest the stream's landscape manifest (soil and land-cover catalogs)
 */
export function createLandscapeSoilPalette(manifest) {
    const soilIds = manifest.soil.catalog.map(entry => entry.id);
    if (soilIds.length > LANDSCAPE_SOIL_SLOTS) throw new Error(`[Landscape] The soil palette holds ${LANDSCAPE_SOIL_SLOTS} soils; the landscape declares ${soilIds.length}`);
    const catalog = landscapeCatalogSoilPalette(manifest);
    const response = Object.fromEntries(soilIds.map(id => { const definition = landscapeMaterialResponseDefinition(id); return [id, [definition.diffuseRoughness, definition.specularShadowing, definition.opposition]]; }));
    const uniforms = createLandscapeSoilPaletteUniforms(1);
    soilIds.forEach((id, index) => uniforms.uSoilPaletteResponse.value.set(response[id], index * 3));
    let source = 'catalog', version = null, applied = null, soils = {}, surface = {};
    const apply = () => {
        soils = Object.fromEntries(soilIds.map(id => [id, (source === 'appearance' ? applied.soils[id] : null) ?? catalog[id] ?? [...LANDSCAPE_SOIL_PALETTE.neutral]]));
        surface = Object.fromEntries(soilIds.map(id => [id, (source === 'appearance' ? applied.surface[id] : null) ?? [...LANDSCAPE_SOIL_PALETTE.plainSurface]]));
        soilIds.forEach((id, index) => { uniforms.uSoilPalette.value.set(soils[id], index * 3); uniforms.uSoilPaletteSurface.value.set(surface[id], index * 2); });
    };
    apply();
    return Object.freeze({
        uniforms, soilIds,
        /** @param {{version?:number|string|null,soils:Record<string, number[]>,surface?:Record<string, number[]>}|null} palette */
        set(palette) {
            if (palette === null || palette === undefined) {
                if (source === 'catalog') return false;
                source = 'catalog'; version = null; applied = null; apply(); return true;
            }
            if (!palette.soils || typeof palette.soils !== 'object' || !Object.values(palette.soils).every(isColor)) throw new Error('[Landscape] A soil palette names soils with linear rgb triples');
            if (palette.surface !== undefined && (typeof palette.surface !== 'object' || palette.surface === null || !Object.values(palette.surface).every(isSurface))) throw new Error('[Landscape] A soil palette surface names soils with [roughness, occlusion] in 0..1');
            const nextVersion = palette.version ?? null;
            if (source === 'appearance' && nextVersion !== null && nextVersion === version) return false;
            source = 'appearance'; version = nextVersion; applied = { soils: { ...palette.soils }, surface: { ...(palette.surface ?? {}) } }; apply(); return true;
        },
        snapshot() {
            return { recipe: LANDSCAPE_SOIL_PALETTE.id, source, version, soils: Object.fromEntries(soilIds.map(id => [id, round4(soils[id])])),
                srgb: Object.fromEntries(soilIds.map(id => [id, `#${soils[id].map(component => linearToSrgbByte(component).toString(16).padStart(2, '0')).join('')}`])),
                response: Object.fromEntries(soilIds.map(id => [id, [...response[id]]])), surface: Object.fromEntries(soilIds.map(id => [id, round4(surface[id])])) };
        }
    });
}
