// Build experimental geometry and one-map materials without mutating reference assets.
// @ts-check
import * as THREE from 'three';
import { createBakedGrassSource, createBakedGrassColorMaps, createBakedGrassMaterial, setBakedGrassCardMipmaps } from './GrassDebugV2BakedAppearance.js?v=canopy-palette-17';
import { createGrassDebugV2ViewCards } from './GrassDebugV2ViewCards.js';
import { createGrassDebugV2NaturalSource } from './GrassDebugV2NaturalAppearance.js';
import { createGrassDebugV2RangeBlades } from './GrassDebugV2RangeBlades.js';
import { prepareGrassDebugV2FarTexture, GRASS_FAR_TEXTURE_PROFILE } from './GrassDebugV2FarTexture.js?v=canopy-palette-17';

const MIDRANGE_CARDS = Object.freeze({
    near: { width: .25, depth: .12, span: .18, pitch: 12.5, density: 24, gain: 1.8 },
    bridge: { width: .42, depth: .16, span: .24, pitch: 12.5, density: 12, gain: 1.4 }
});

// Equalize prepared reflectance by triangle area so tessellation does not change the palette.
function matchSourcePalette(sources, calibration) {
    const average = geometry => {
        const { position, color } = geometry.attributes, index = geometry.index;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), sum = [0, 0, 0]; let area = 0;
        for (let i = 0; i < index.count; i += 3) {
            const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]).sub(a); c.fromBufferAttribute(position, ids[2]).sub(a);
            const weight = b.cross(c).length(); area += weight;
            for (let channel = 0; channel < 3; channel++) sum[channel] += weight * ids.reduce((total, id) => total + color.array[id * color.itemSize + channel], 0) / 3;
        }
        return sum.map(value => value / area);
    };
    const target = average(sources.LOD2.geometry).map((value, i) => value * calibration[i]), gains = {};
    for (const [lod, source] of Object.entries(sources)) {
        const values = average(source.geometry), gain = target.map((value, i) => value / values[i]), color = source.geometry.attributes.color;
        for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * gain[0], color.getY(i) * gain[1], color.getZ(i) * gain[2]);
        color.needsUpdate = true; gains[lod] = gain;
    }
    return gains;
}

/** @param {{renderer:THREE.WebGLRenderer,assets:object,lighting:object,onProgress:Function,appearance?:string}} options */
export async function createGrassDebugV2BakedLightingAssets({ renderer, assets, lighting, onProgress, appearance = 'detailed' }) {
    if (!['previous', 'soft', 'tuned', 'natural', 'midrange', 'ranged', 'detailed'].includes(appearance)) throw new Error('Unknown baked appearance: ' + appearance);
    const consistent = appearance !== 'previous', detailed = appearance === 'detailed', ranged = appearance === 'ranged' || detailed, midrange = appearance === 'midrange', natural = appearance === 'natural' || midrange || ranged, depth = appearance === 'tuned' || natural;
    const settings = { brightness: { value: 1 }, shadows: { value: 1 },
        radiance: new THREE.Color(1, 1, 1.25).multiplyScalar(lighting.sunRef.intensity / (2 * Math.PI)) }, shadowUniforms = assets.canopy.shadowUniforms;
    const leafContrast = natural ? 1 : depth ? .5 : consistent ? .15 : 1, leafVariation = natural ? .25 : depth ? .28 : 0;
    const sources = Object.fromEntries(['LOD0', 'LOD1', 'LOD2'].map(lod => [lod, natural ? createGrassDebugV2NaturalSource(assets.sources[lod]) : createBakedGrassSource(assets.sources[lod], { leafContrast, leafVariation })]));
    const sourcePaletteGains = consistent ? matchSourcePalette(sources, natural ? [.95, 1, .9] : depth ? [.98, .91, 1.08] : [1.04, .975, 1.13]) : null, baseLeafLayers = consistent ? 2 : 1;
    const colors = createBakedGrassColorMaps(assets.canopy, renderer, { leafLayers: 3, contrast: natural ? 1.55 : depth ? 1.35 : 1, natural });
    const baseColors = createBakedGrassColorMaps(assets.canopy.extraCardBase, renderer, { leafLayers: baseLeafLayers, contrast: natural ? 1 : depth ? 1.25 : 1, natural, understoryGain: natural ? .38 : 1 });
    if (detailed) colors.forEach(map => prepareGrassDebugV2FarTexture(map, renderer.capabilities.getMaxAnisotropy()));
    // Match LOD4 after preparing bounded highlights; one tint applies to every mip.
    const canopyColorGain = detailed ? [1.52944, 1.515536, 1.36433] : ranged ? [1.42, 1.43, 1.6] : [1, 1, 1];
    const canopySettings = ranged ? { ...settings, radiance: settings.radiance.clone().multiply(new THREE.Color(...canopyColorGain)).multiplyScalar(detailed ? GRASS_FAR_TEXTURE_PROFILE.colorRange : 1) } : settings;
    const canopyMaterial = createBakedGrassMaterial({ maps: colors, shadowUniforms, settings: canopySettings });
    const canopyUvScale = 1.6;
    if (detailed) { canopyMaterial.defines.BAKED_GRASS_CANOPY_VIEW = 1; canopyMaterial.defines.BAKED_GRASS_CANOPY_UV_SCALE = canopyUvScale.toFixed(3); }
    const baseMaterial = createBakedGrassMaterial({ maps: baseColors, shadowUniforms, settings });
    if (detailed) [canopyMaterial, baseMaterial].forEach(material => { material.defines.BAKED_GRASS_TILE_VARIATION = 1; });
    const leafMaterial = createBakedGrassMaterial({ vertexColors: true, shadowUniforms, settings });
    if (detailed) [canopyMaterial, leafMaterial].forEach(material => { material.userData.grassProjectedCanopyBlend = true; });
    if (detailed) leafMaterial.userData.grassCanopyHandoff = { maps: colors, color: canopySettings.radiance, uvScale: canopyUvScale, height: assets.canopy.getSnapshot().definition.height };
    const cards = [];
    for (const profile of ranged ? [] : ['near', 'bridge']) {
        const shape = midrange ? MIDRANGE_CARDS[profile] : null;
        const captured = await createGrassDebugV2ViewCards({ renderer, source: sources.LOD2, profile,
            footprint: shape ? { width: shape.width, depth: shape.depth, span: shape.span } : consistent && profile === 'bridge' ? { width: .5, depth: .34, span: .45 } : null,
            capturePitchDegrees: shape?.pitch ?? null, cardsPerSquareMeter: shape?.density ?? null, onProgress });
        // The oblique strip exposes more straw than the geometric canopy; calibrate once before mip filtering.
        if (consistent && !midrange) {
            const cardGain = profile === 'near' ? 1.5 : 1.3;
            const pixels = captured.maps.albedo.image.data, gain = natural ? [cardGain, cardGain, cardGain] : depth ? [.94, .94, .79] : [.98, 1, .84];
            for (let i = 0; i < pixels.length; i += 4) {
                for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round(pixels[i + c] * gain[c]));
            }
        }
        setBakedGrassCardMipmaps(captured.maps.albedo);
        const cardSettings = shape ? { ...settings, radiance: settings.radiance.clone().multiplyScalar(shape.gain).multiply(new THREE.Color(.93, 1, .85)) } : settings;
        const material = createBakedGrassMaterial({ maps: [captured.maps.albedo], shadowUniforms, settings: cardSettings, card: captured.getSnapshot() });
        captured.maps.normal.dispose(); captured.maps.roughness.dispose();
        cards.push({ ...captured, material, getSnapshot: () => ({ ...captured.getSnapshot(), textureBytes: captured.getSnapshot().textureBytes / 3 }),
            dispose() { material.dispose(); captured.dispose(); } });
    }
    Object.values(sources).forEach(source => { source.material = leafMaterial; });
    const blades = ranged ? [{ fraction: .5, widthScale: 2, colorGain: detailed ? [1.35, 1.38, 1.39] : [1.35, 1.33, 1.42] }, { fraction: 1 / 3, widthScale: 2.7, colorGain: detailed ? [1.60, 1.60, 1.63] : [1.55, 1.48, 1.63] }].map(profile => createGrassDebugV2RangeBlades(sources.LOD2, profile)) : null;
    const canopy = { materials: { all: canopyMaterial }, cardBase: null, rootShade: detailed ? .32 : 1, getSnapshot: assets.canopy.getSnapshot };
    return Object.freeze({ sources, canopy, settings, cards, blades, maps: { canopy: colors, litter: baseColors }, tileVariation: detailed, litterMaterial: baseMaterial,
        litterUv: new THREE.Matrix3().set(.5, 0, 0, 0, -.5, 0, 0, 0, 1),
        getSnapshot: () => ({ baseShootDensity: .6, baseLeafLayers, rootShade: natural ? [.045, 1] : [.225, .9], leafContrast, leafVariation, sourcePaletteGains, cardCounts: cards.map(card => card.getSnapshot().cardsPerSquareMeter),
            naturalRoots: natural, understoryGain: natural ? .38 : 1,
            bladeFaceGains: natural ? [.5, 1.15] : null, cardColorGains: ranged ? [] : midrange ? Object.values(MIDRANGE_CARDS).map(shape => shape.gain) : natural ? [1.5, 1.3] : null,
            cardRadianceCalibration: midrange ? [.93, 1, .85] : null,
            preparedTextureContrast: natural ? { base: 1, canopy: 1.55 } : depth ? { base: 1.25, canopy: 1.35 } : { base: 1, canopy: 1 },
            paletteRevision: detailed ? 'canopy-palette-17' : ranged ? 'lod-ranged-9' : midrange ? 'lod-midrange-8' : natural ? 'lod-natural-7' : depth ? 'lod-depth-6' : consistent ? 'lod-consistency-5' : 'canopy-coverage-4', canopyLeafLayers: 3, cardProfiles: cards.map(card => card.getSnapshot()),
            bladeProfiles: blades?.map(blade => blade.getSnapshot()) ?? [],
            canopyColorGain, canopyRootShade: canopy.rootShade, projectedCanopyBlend: detailed, canopyFiltering: { size: colors[0].image.width, anisotropy: colors[0].anisotropy,
                linearMagnification: colors[0].magFilter === THREE.LinearFilter, preparedMipContrast: detailed ? GRASS_FAR_TEXTURE_PROFILE.mipContrast : 1,
                coarseMipGain: detailed ? GRASS_FAR_TEXTURE_PROFILE.coarseGain : 1, cavityPower: detailed ? GRASS_FAR_TEXTURE_PROFILE.cavityPower : 0,
                colorRange: detailed ? GRASS_FAR_TEXTURE_PROFILE.colorRange : 1,
                highlightShoulder: detailed ? GRASS_FAR_TEXTURE_PROFILE.highlightShoulder : null },
            colorTextureBytes: [...colors, ...baseColors, ...cards.map(card => card.maps.albedo)].reduce((sum, map) => sum + (map.image.width * map.image.height * 4 - 1) / 3 * 4, 0),
            runtimeNormalMaps: 0, runtimeRoughnessMaps: 0, externalShadowSamples: 1, distanceColorCorrection: false,
            canopyViewCorrection: detailed ? 'vertex elevation: darker roots visible from above' : null,
            canopyUvScale: detailed ? canopyUvScale : 1,
            terminalHandoff: detailed ? 'opaque blade color to projected canopy; alpha surface over litter; one additional texture sample inside band' : null,
            tileVariation: detailed ? 'balanced source permutations and quarter-turns; vertex UV offsets and reflections' : null,
            fixedRadiance: settings.radiance.toArray(), groundSelfShadowBaked: true, mipmaps: 'linear RGB; alpha-weighted card RGB and average alpha coverage' }),
        dispose() { Object.values(sources).forEach(source => source.geometry.dispose());
            [canopyMaterial, baseMaterial, leafMaterial].forEach(material => material.dispose());
            [...colors, ...baseColors].forEach(map => map.dispose()); cards.forEach(card => card.dispose()); blades?.forEach(blade => blade.dispose()); }
    });
}
