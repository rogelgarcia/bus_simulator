// Checks the AI577 D4 appearance layers: landscape-scale macro field, paired micro detail, slope-adaptive projection, normal mip filtering and multiscale tiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_MACRO_VARIATION, landscapeMacroAlbedo, landscapeMacroField, landscapeMacroNoise, landscapeMacroRoughness, landscapeMacroVariationDefinition,
    landscapeMacroVariationSalts, landscapeMacroVariationScale, landscapeMacroVariationUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeMacroVariation.js';
import { LANDSCAPE_MICRO_DETAIL, decodeLandscapeMicroTexel, landscapeMicroDetailDefinition, landscapeMicroFade, landscapeMicroFootprint, landscapeMicroUniformValues } from '../../../src/graphics/engine3d/landscape/LandscapeMicroDetail.js';
import { LANDSCAPE_NORMAL_FILTERING, LANDSCAPE_SURFACE_PROJECTION, landscapeFilteredRoughness, landscapeProjectionActivationDegrees, landscapeProjectionFrame, landscapeProjectionWeights,
    landscapeSurfaceGradient, landscapeSurfaceLayerUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceLayers.js';
import { LANDSCAPE_MULTISCALE_CAPABILITY, landscapeMultiscaleFallback, landscapeMultiscaleWorkingSetBytes, resolveLandscapeMultiscaleTiers } from '../../../src/graphics/engine3d/landscape/LandscapeMultiscaleTiers.js';
import { landscapeMaterialTierBytes, planLandscapeAppearanceDemand } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceDemand.js';
import { landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';
import { decodeLandscapeAppearanceMicroTexel } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const seed = 1207276911, MIB = 1024 * 1024;
const close = (actual, expected, tolerance = 1e-9, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} differs from ${expected} by more than ${tolerance}`);
const cacheSkip = landscapeCacheSkip(['appearance/manifest.json']);
const appearance = cacheSkip ? null : JSON.parse(await readFile(new URL('../../../assets/public/landscape/coastal-city/appearance/manifest.json', import.meta.url), 'utf8'));

function statistics(values) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { mean, deviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) };
}

test('Macro variation: a frozen catalog of restrained responses for every soil and long-to-short octaves within 25-400 m', () => {
    const model = LANDSCAPE_MACRO_VARIATION;
    assert.ok(Object.isFrozen(model) && Object.isFrozen(model.materials) && Object.isFrozen(model.octaves));
    assert.deepEqual(Object.keys(model.materials).sort(), LANDSCAPE_SOIL_CATALOG.map(soil => soil.id).sort());
    assert.ok(model.octaves.every((octave, index) => octave.wavelengthMeters >= 25 && octave.wavelengthMeters <= 400 && (!index || octave.wavelengthMeters < model.octaves[index - 1].wavelengthMeters)));
    for (const soil of LANDSCAPE_SOIL_CATALOG) {
        const response = landscapeMacroVariationDefinition(soil.id);
        assert.ok(response.value > 0 && response.value <= .15 && Math.abs(response.saturation) <= .15 && Math.abs(response.hueDegrees) <= 5 && Math.abs(response.roughness) <= .05, `${soil.id} stays restrained`);
    }
    assert.throws(() => landscapeMacroVariationDefinition('pavement'), /No macro variation is defined for soil pavement/);
});

test('Macro variation: deterministic world-anchored unit fields that are decorrelated, bounded, continuous and never repeat', () => {
    const salts = landscapeMacroVariationSalts(seed);
    assert.deepEqual(salts, landscapeMacroVariationSalts(seed), 'repeatable');
    assert.notDeepEqual(salts, landscapeMacroVariationSalts(seed + 1));
    const tone = [], chroma = [];
    for (let i = 0; i < 40000; i++) {
        const field = landscapeMacroField({ x: (i % 200) * 19.7, z: Math.floor(i / 200) * 21.3, metersPerPixel: 0, salts });
        tone.push(field.tone); chroma.push(field.chroma);
    }
    const t = statistics(tone), c = statistics(chroma), correlation = tone.reduce((sum, value, index) => sum + (value - t.mean) * (chroma[index] - c.mean), 0) / tone.length / (t.deviation * c.deviation);
    assert.ok(t.deviation > .85 && t.deviation < 1.15 && c.deviation > .85 && c.deviation < 1.15, `unit deviation ${t.deviation} ${c.deviation}`);
    assert.ok(Math.abs(t.mean) < .15 && Math.abs(c.mean) < .15);
    assert.ok(Math.abs(correlation) < .1, `tone and chroma are decorrelated (${correlation})`);
    const amplitude = LANDSCAPE_MACRO_VARIATION.octaves.reduce((sum, octave) => sum + octave.amplitude, 0) * landscapeMacroVariationScale();
    assert.ok([...tone, ...chroma].every(value => Math.abs(value) <= amplitude), 'bounded by the summed octave amplitudes');
    let step = 0;
    for (let i = 0; i < 2000; i++) {
        const x = 500 + i * .37, z = 800 + i * .29, a = landscapeMacroField({ x, z, metersPerPixel: 0, salts }), b = landscapeMacroField({ x: x + .01, z: z + .01, metersPerPixel: 0, salts });
        step = Math.max(step, Math.abs(a.tone - b.tone), Math.abs(a.chroma - b.chroma));
    }
    assert.ok(step < .01, `a centimeter moves the field by at most ${step}`);
    const lagged = lag => { const values = []; for (let i = 0; i < 4000; i++) { const x = (i % 80) * 23.1, z = Math.floor(i / 80) * 27.7; values.push([landscapeMacroField({ x, z, metersPerPixel: 0, salts }).tone, landscapeMacroField({ x: x + lag, z, metersPerPixel: 0, salts }).tone]); }
        const a = statistics(values.map(v => v[0])), b = statistics(values.map(v => v[1])); return values.reduce((sum, v) => sum + (v[0] - a.mean) * (v[1] - b.mean), 0) / values.length / (a.deviation * b.deviation); };
    for (const lag of [800, 1600, 3200]) assert.ok(Math.abs(lagged(lag)) < .2, `no period at ${lag} m (${lagged(lag)})`);
    const [toneNoise, chromaNoise] = landscapeMacroNoise(123.4, 567.8, 1 / 64, [.28, .96], salts[2]);
    assert.ok(Math.abs(toneNoise) <= 1 && Math.abs(chromaNoise) <= 1);
});

test('Macro variation: octaves fade with the projected footprint as a low-pass, down to the zero mean', () => {
    const salts = landscapeMacroVariationSalts(seed), footprints = [0, 1, 2, 4, 8, 16, 32, 64, 128];
    const deviations = footprints.map(metersPerPixel => statistics(Array.from({ length: 6000 }, (_, i) => landscapeMacroField({ x: (i % 100) * 31.7, z: Math.floor(i / 100) * 29.3, metersPerPixel, salts }).tone)).deviation);
    assert.ok(deviations.every((value, index) => !index || value <= deviations[index - 1] + 1e-9), `variance only decreases with the footprint: ${deviations.map(v => v.toFixed(3))}`);
    assert.equal(landscapeMacroField({ x: 10, z: 20, metersPerPixel: 400 / 4 + 1, salts }).tone, 0, 'every octave has faded at a quarter of the longest wavelength');
    const near = landscapeMacroField({ x: 10, z: 20, metersPerPixel: 0, salts }), sub = landscapeMacroField({ x: 10, z: 20, metersPerPixel: 25.6 / 16, salts });
    assert.deepEqual(near, sub, 'nothing fades before 1/16 of the shortest wavelength');
    assert.deepEqual(landscapeMacroField({ x: 10, z: 20, metersPerPixel: 0, salts, enabled: false }), { tone: 0, chroma: 0 });
    let jump = 0;
    for (let f = 0; f < 120; f += .05) jump = Math.max(jump, Math.abs(landscapeMacroField({ x: 77, z: 99, metersPerPixel: f, salts }).tone - landscapeMacroField({ x: 77, z: 99, metersPerPixel: f + .05, salts }).tone));
    assert.ok(jump < .05, `the fade is continuous (largest step ${jump})`);
});

test('Macro variation: responses keep zero fields exact, brighten in log2 and turn hue about the gray axis', () => {
    const rgb = [.32, .41, .18];
    assert.deepEqual(landscapeMacroAlbedo('loam', { tone: 0, chroma: 0 }, rgb).map(value => +value.toFixed(12)), rgb);
    const loam = landscapeMacroVariationDefinition('loam'), bright = landscapeMacroAlbedo('loam', { tone: 1, chroma: 0 }, rgb);
    bright.forEach((value, index) => close(value, rgb[index] * 2 ** loam.value, 1e-12));
    const gray = [.4, .4, .4];
    landscapeMacroAlbedo('loam', { tone: 0, chroma: 2 }, gray).forEach(value => close(value, .4, 1e-12, 'gray stays gray'));
    const turned = landscapeMacroAlbedo('loam', { tone: 0, chroma: 1 }, rgb), mean = values => values.reduce((sum, value) => sum + value, 0) / 3;
    assert.ok(Math.abs(mean(turned) - mean(rgb)) < .02 && turned.some((value, index) => Math.abs(value - rgb[index]) > 1e-3), 'chroma shifts hue and saturation');
    close(landscapeMacroRoughness('sand', { tone: 2, chroma: 0 }, .8), .8 + 2 * landscapeMacroVariationDefinition('sand').roughness, 1e-12);
    assert.equal(landscapeMacroRoughness('sand', { tone: 100, chroma: 0 }, .8), 1);
    const uniforms = landscapeMacroVariationUniforms({ seed, soils: LANDSCAPE_SOIL_CATALOG.map(soil => ({ soilId: soil.id })) });
    assert.equal(uniforms.uMacroOctaves.length, 16); assert.equal(uniforms.uMacroSalts.length, 4); assert.equal(uniforms.uSoilMacro.length, 24);
    assert.deepEqual([...uniforms.uMacroSalts].map(value => value >>> 0), landscapeMacroVariationSalts(seed));
    close(uniforms.uMacroSettings[3], landscapeMacroVariationScale(), 1e-6);
    assert.equal(landscapeMacroVariationUniforms({ seed, soils: [{ soilId: 'sand' }], enabled: false }).uMacroSettings[0], 0);
});

test('Micro detail: decoding mirrors the sidecar contract, neutral texels change nothing and the disc clamp is shared', () => {
    const neutral = decodeLandscapeMicroTexel([.5, .5, .5, .5], .4);
    assert.deepEqual(neutral, { slope: [0, 0], height: .5, luminanceRatio: 1 });
    for (const bytes of [[200, 90, 30, 255], [10, 250, 128, 0], [255, 255, 64, 191], [128, 128, 255, 128]]) {
        const ours = decodeLandscapeMicroTexel(bytes.map(byte => byte / 255), .35), contract = decodeLandscapeAppearanceMicroTexel(...bytes, .35);
        close(ours.height, contract.height, 1e-12); close(ours.luminanceRatio, contract.luminanceRatio, 1e-12);
        const depth = Math.max(contract.normal[2], Math.max(Math.abs(contract.normal[0]), Math.abs(contract.normal[1])) / 128);
        close(ours.slope[0], contract.normal[0] / depth, 1e-9); close(ours.slope[1], contract.normal[1] / depth, 1e-9);
    }
    assert.throws(() => decodeLandscapeMicroTexel([.5, .5, .5], .4), /four channels/);
    assert.throws(() => decodeLandscapeMicroTexel([.5, .5, .5, .5], 0), /positive luminance range/);
    assert.deepEqual(Object.keys(LANDSCAPE_MICRO_DETAIL.materials).sort(), LANDSCAPE_SOIL_CATALOG.map(soil => soil.id).sort());
    const values = landscapeMicroUniformValues('sand', { tileMeters: 1.2, luminanceRange: .4 });
    close(values.luminanceScale, .4 * landscapeMicroDetailDefinition('sand').luminanceStrength, 1e-12);
    assert.equal(values.tileMeters, 1.2);
});

test('Micro detail: fades by the anisotropic footprint and the resident micro texel, continuously and never magnified', () => {
    const period = 1.2, start = period * LANDSCAPE_MICRO_DETAIL.fadeStartPeriods, end = period * LANDSCAPE_MICRO_DETAIL.fadeEndPeriods;
    assert.equal(landscapeMicroFade({ microTileMeters: period, metersPerPixel: start * .5, resolution: 1024 }), 1);
    assert.equal(landscapeMicroFade({ microTileMeters: period, metersPerPixel: end, resolution: 1024 }), 0);
    assert.equal(landscapeMicroFade({ microTileMeters: period, metersPerPixel: 0, resolution: 16 }), 0, 'a micro tier coarser than the fade end shows nothing');
    let previous = 1, jump = 0;
    for (let footprint = 0; footprint < end * 1.2; footprint += end / 2000) {
        const value = landscapeMicroFade({ microTileMeters: period, metersPerPixel: footprint, resolution: 1024 });
        assert.ok(value <= previous + 1e-12); jump = Math.max(jump, previous - value); previous = value;
    }
    assert.ok(jump < .01, `the fade is continuous (largest step ${jump})`);
    close(landscapeMicroFade({ microTileMeters: period, metersPerPixel: 0, resolution: 32, targetResolution: 1024, transition: .25 }),
        .75 * landscapeMicroFade({ microTileMeters: period, metersPerPixel: 0, resolution: 32 }) + .25, 1e-12, 'tier arrival mixes old and new texel fades');
    assert.equal(landscapeMicroFootprint(.02, .001), .005, 'grazing footprints use the 4x anisotropic mip footprint');
    assert.equal(landscapeMicroFootprint(.002, .003), .002);
});

test('Slope projection: gentle ground keeps the top projection exactly and steep ground favours the least stretched projection continuously', () => {
    const activation = landscapeProjectionActivationDegrees();
    assert.ok(activation > 24 && activation < 25.5, `side projections start near 25 degrees (${activation})`);
    const at = (degrees, azimuth = 0) => { const a = degrees * Math.PI / 180, b = azimuth * Math.PI / 180; return landscapeProjectionWeights([Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)]); };
    for (const degrees of [0, 5, 15, 24]) assert.deepEqual(at(degrees, 37), [1, 0, 0]);
    let jump = 0, worst = 0;
    for (const azimuth of [0, 20, 45, 135, 250]) {
        let previous = at(0, azimuth);
        for (let degrees = .05; degrees <= 89.95; degrees += .05) {
            const weights = at(degrees, azimuth);
            close(weights[0] + weights[1] + weights[2], 1, 1e-12, 'normalized');
            jump = Math.max(jump, ...weights.map((value, index) => Math.abs(value - previous[index])));
            previous = weights;
            const a = degrees * Math.PI / 180, horizontal = [Math.abs(Math.cos(azimuth * Math.PI / 180)), Math.abs(Math.sin(azimuth * Math.PI / 180))];
            const stretch = weights[0] / Math.cos(a) + (weights[1] ? weights[1] / (Math.sin(a) * horizontal[0]) : 0) + (weights[2] ? weights[2] / (Math.sin(a) * horizontal[1]) : 0);
            worst = Math.max(worst, stretch);
        }
    }
    assert.ok(jump < .03, `weights change continuously with slope (largest step ${jump} per 0.05 degrees)`);
    assert.ok(worst < 1.9, `weighted projection stretch stays bounded on every slope (worst ${worst}); the top projection alone reaches ${1 / Math.cos(89.95 * Math.PI / 180)}`);
    assert.ok(at(60)[1] > .98 && at(80, 90)[2] > .99, 'steep faces use their side projection');
    assert.deepEqual(landscapeProjectionWeights([.6, .8, 0], { sharpness: 0 }), [1, 0, 0], 'disabled projection keeps the top projection');
    assert.throws(() => landscapeProjectionWeights([1, 1, 0]), /unit normal/);
});

test('Slope projection: side frames are not mirrored from outside and perturbations stay in the tangent plane', () => {
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const normal of [[.9, .43588989, 0], [-.9, .43588989, 0], [0, .43588989, .9], [0, .43588989, -.9]]) {
        const projection = Math.abs(normal[0]) > Math.abs(normal[2]) ? 'side-x' : 'side-z', frame = landscapeProjectionFrame(projection, normal);
        assert.ok(dot(cross(frame.u, frame.v), normal) > 0, `${projection} faces outward for ${normal}`);
        const perturbation = landscapeSurfaceGradient(normal, [frame.u[0] * .3 + frame.v[0] * -.2, frame.u[1] * .3 + frame.v[1] * -.2, frame.u[2] * .3 + frame.v[2] * -.2]);
        close(dot(perturbation, normal), 0, 1e-9, 'tangent');
    }
    assert.deepEqual(landscapeProjectionFrame('top', [0, 1, 0]), { u: [1, 0, 0], v: [0, 0, 1] });
    assert.equal(LANDSCAPE_SURFACE_PROJECTION.saltMixes[0], 0, 'the top projection keeps the established lattice');
    const uniforms = landscapeSurfaceLayerUniforms();
    assert.deepEqual([...uniforms.uSurfaceLayers].map(value => +value.toFixed(6)), [LANDSCAPE_SURFACE_PROJECTION.sharpness, LANDSCAPE_NORMAL_FILTERING.strength,
        +Math.fround(LANDSCAPE_MICRO_DETAIL.fadeStartPeriods).toFixed(6), +Math.fround(LANDSCAPE_MICRO_DETAIL.fadeEndPeriods).toFixed(6)]);
    assert.equal(landscapeSurfaceLayerUniforms({ projection: false, normalFiltering: false }).uSurfaceLayers[0], 0);
});

test('Normal mip filtering: unit and encoding-error lengths keep roughness, shortened mip normals widen it monotonically', () => {
    assert.equal(landscapeFilteredRoughness({ roughness: .7, meanLength: 1, normalStrength: 1 }), .7);
    close(landscapeFilteredRoughness({ roughness: .7, meanLength: .995, normalStrength: 1 }), .7, 1e-12, 'dead zone');
    let previous = .7;
    for (let length = .98; length >= .5; length -= .02) {
        const value = landscapeFilteredRoughness({ roughness: .7, meanLength: length, normalStrength: 1 });
        assert.ok(value > previous, `roughness grows as the mean normal shortens (${length}: ${value})`); previous = value;
    }
    close(landscapeFilteredRoughness({ roughness: .7, meanLength: .9, normalStrength: 1 }), Math.sqrt(Math.sqrt(.7 ** 4 + 2 * (1 - .91 ** 2) / (3 * .91 - .91 ** 3))), 1e-12, 'vMF spread with the dead zone');
    assert.ok(landscapeFilteredRoughness({ roughness: .7, meanLength: .8, normalStrength: .5 }) < landscapeFilteredRoughness({ roughness: .7, meanLength: .8, normalStrength: 1 }), 'weaker normals add less spread');
    assert.equal(landscapeFilteredRoughness({ roughness: .7, meanLength: .5, normalStrength: 1, strength: 0 }), .7);
});

// a structurally valid companion for the coastal appearance with a 1024 tier per material and micro pages for sand and seabed
function companion({ capabilities = {}, micro = ['seabed', 'sand'], materialId = null, dropMicroTier = null } = {}) {
    const page = (resolution, name) => ({ url: `pages/${name}-${resolution}.rgba8`, width: resolution, height: resolution, encoding: 'rgba8', colorSpace: name === 'baseColor' ? 'srgb' : 'linear',
        byteLength: resolution * resolution * 4, decodedByteLength: resolution * resolution * 4, sha256: String(resolution % 10).repeat(64), revision: `${name}-${resolution}` });
    return { format: 'landscape-appearance-multiscale', schemaVersion: 1, landscapeId: appearance.landscapeId, revision: 'multiscale-fixture', appearanceRevision: appearance.revision, bindingKey: 'a'.repeat(64),
        capabilities: { encoding: 'rgba8', gpuCompression: 'none', maxPageBytes: 4 * MIB, tiers: [32, 128, 512, 1024], ...capabilities },
        materials: appearance.materials.map(material => ({ soilId: material.soilId, materialId: materialId && material.soilId === 'sand' ? materialId : material.materialId,
            tiers: [{ id: '1024', resolution: 1024, channels: Object.fromEntries(['baseColor', 'normal', 'orm'].map(name => [name, page(1024, `${material.soilId}-${name}`)])) }],
            ...(micro.includes(material.soilId) ? { micro: { materialId: 'pbr.landscape_micro_sand_v1', tileMeters: 1.5, encoding: LANDSCAPE_MULTISCALE_CAPABILITY.microEncoding, luminanceRange: .4,
                provenanceSourceIds: ['micro/source.png'], tiers: [32, 128, 512, 1024].filter(resolution => resolution !== dropMicroTier).map(resolution => ({ id: String(resolution), resolution, channels: { micro: page(resolution, `${material.soilId}-micro`) } })) } } : {}) })) };
}
const shipped = { maxTextureSize: 16384, limits: { gpuBytes: 96 * MIB }, fixedGpuBytes: 81 * 272484 };

test('Multiscale tiers: an active companion pairs micro layers with every tier and adds 1024 tiers, with explicit page sources', { skip: cacheSkip }, () => {
    const resolved = resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion(), ...shipped });
    assert.equal(resolved.status, 'active'); assert.equal(resolved.reason, null); assert.equal(resolved.maxResolution, 1024);
    const sand = resolved.materials.find(material => material.soilId === 'sand'), loam = resolved.materials.find(material => material.soilId === 'loam');
    assert.equal(sand.maps, 4); assert.equal(loam.maps, 3); assert.equal(sand.micro.tileMeters, 1.5); assert.equal(loam.micro, null);
    assert.deepEqual(sand.tiers.map(tier => tier.resolution), [32, 128, 512, 1024]);
    for (const tier of sand.tiers) {
        assert.deepEqual(tier.pages.map(page => page.role), ['baseColor', 'normal', 'orm', 'micro']);
        assert.deepEqual(tier.pages.map(page => page.source), tier.resolution === 1024 ? ['multiscale', 'multiscale', 'multiscale', 'multiscale'] : ['appearance', 'appearance', 'appearance', 'multiscale']);
        assert.ok(tier.pages.every(page => page.page.width === tier.resolution));
    }
    assert.deepEqual(loam.tiers.at(-1).pages.map(page => page.source), ['multiscale', 'multiscale', 'multiscale']);
    assert.equal(resolved.workingSetBytes, landscapeMultiscaleWorkingSetBytes({ fixedGpuBytes: shipped.fixedGpuBytes, materials: resolved.materials }));
});

test('Multiscale tiers: absence, opt-out, invalid data, capability contracts, budgets and device limits fall back explicitly', { skip: cacheSkip }, () => {
    const legacy = landscapeMultiscaleFallback(appearance, 'absent', 'multiscale-sidecar-absent');
    assert.ok(legacy.materials.every(material => material.maps === 3 && material.micro === null && material.tiers.map(tier => tier.resolution).join() === '32,128,512'));
    assert.equal(resolveLandscapeMultiscaleTiers({ appearance, sidecar: null, ...shipped }).status, 'absent');
    assert.equal(resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion(), enabled: false, ...shipped }).status, 'disabled');
    const invalid = resolveLandscapeMultiscaleTiers({ appearance, sidecar: null, error: 'multiscale-sidecar-invalid: corrupt', ...shipped });
    assert.equal(invalid.status, 'invalid'); assert.equal(invalid.reason, 'multiscale-sidecar-invalid: corrupt');
    assert.match(resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion({ capabilities: { gpuCompression: 'bc7' } }), ...shipped }).reason, /GPU compression bc7/);
    assert.match(resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion({ capabilities: { maxPageBytes: 8 * MIB } }), ...shipped }).reason, /maxPageBytes/);
    assert.match(resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion({ materialId: 'pbr.other' }), ...shipped }).reason, /binds pbr.other/);
    assert.match(resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion({ dropMicroTier: 128 }), ...shipped }).reason, /no micro page paired with its 128 tier/);
    const fullSet = resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion(), ...shipped }).workingSetBytes;
    const limited = resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion(), ...shipped, limits: { gpuBytes: fullSet - 1 } });
    assert.equal(limited.status, 'active-limited'); assert.equal(limited.reason, 'appearance-gpu-budget-1024'); assert.equal(limited.maxResolution, 512);
    assert.equal(limited.materials.find(material => material.soilId === 'sand').maps, 4, 'micro layers stay paired with the schema-1 tiers');
    const denied = resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion(), ...shipped, limits: { gpuBytes: 8 * MIB } });
    assert.equal(denied.status, 'budget-denied'); assert.ok(denied.materials.every(material => material.maps === 3));
    const device = resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion(), ...shipped, maxTextureSize: 512 });
    assert.equal(device.status, 'active-limited'); assert.equal(device.reason, 'device-capacity-1024');
    assert.equal(resolveLandscapeMultiscaleTiers({ appearance, sidecar: companion({ micro: [] }), ...shipped, maxTextureSize: 512 }).status, 'device-capacity');
});

test('Multiscale demand: paired micro maps and 1024 tiers are charged explicitly while legacy demands keep their totals', () => {
    assert.deepEqual(landscapeMaterialTierBytes(1024, 4), { rawBytes: 1024 * 1024 * 16, gpuBytes: landscapeTextureBytes(1024) * 4 });
    assert.deepEqual(landscapeMaterialTierBytes(512), { rawBytes: 512 * 512 * 12, gpuBytes: landscapeTextureBytes(512) * 3 });
    const materials = [{ soilId: 'sand', index: 2, density: 5, desiredResolution: 1024, resolutions: [32, 128, 512, 1024], maps: 4 },
        { soilId: 'loam', index: 3, density: 4, desiredResolution: 1024, resolutions: [32, 128, 512, 1024], maps: 3 }];
    const roomy = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 192 * MIB, gpuBytes: 96 * MIB }, materials });
    assert.deepEqual(roomy.fittedTiers, { sand: '1024', loam: '1024' });
    // the micro-paired 512 sand may still be resident while its 1024 arrives: one transition allowance of that tier is protected as well
    assert.equal(roomy.gpuBytes, landscapeMaterialTierBytes(32, 4).gpuBytes + landscapeMaterialTierBytes(32, 3).gpuBytes + landscapeMaterialTierBytes(1024, 4).gpuBytes + landscapeMaterialTierBytes(1024, 3).gpuBytes
        + landscapeMaterialTierBytes(512, 4).gpuBytes);
    assert.equal(roomy.cpuBytes, landscapeMaterialTierBytes(32, 4).rawBytes + landscapeMaterialTierBytes(32, 3).rawBytes + 1024 * 1024 * 16 + 1024 * 1024 * 12 + 1024 * 1024 * 16 + 512 * 512 * 16,
        'one peak decode allowance of the largest tier and one transition source');
    const tight = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 192 * MIB, gpuBytes: 32 * MIB }, materials });
    assert.deepEqual(tight.fittedTiers, { sand: '1024', loam: '512' }, 'the closer material rises to 1024 first');
    const tighter = planLandscapeAppearanceDemand({ fixedCpuBytes: 0, fixedGpuBytes: 0, decodeBytes: 0, limits: { cpuBytes: 192 * MIB, gpuBytes: 30 * MIB }, materials });
    assert.deepEqual(tighter.fittedTiers, { sand: '512', loam: '1024' }, 'a level the closer micro-paired material cannot fit still goes to the next material');
});
