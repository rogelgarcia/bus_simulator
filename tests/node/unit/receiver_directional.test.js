import test from 'node:test';
import assert from 'node:assert/strict';
import { IRRADIANCE_SAMPLE_NORMALS, fitDirectionalIrradiance, evaluateDirectionalIrradiance } from '../../../src/app/illumination/receiver_lightmaps/DirectionalIrradiance.js';
import { createEnhancedSourceWatch } from '../../../src/graphics/illumination/receiver_lightmaps/EnhancedReceiverFreshness.js';
import { sanitizeBakedLightingSettings } from '../../../src/app/illumination/runtime/BakedLightingSettings.js';
import { isSupportedIlluminationMip } from '../../../src/app/illumination/package/IlluminationPackageConstants.js';
import { evaluateIlluminationPackageCompatibility } from '../../../src/app/illumination/package/IlluminationPackageCompatibility.js';

test('Directional irradiance preserves constant ambient and affine directional response at arbitrary normals', () => {
    for (const expected of [[2, 0, 0, 0], [1.3, .4, -.2, .6]]) {
        const samples = IRRADIANCE_SAMPLE_NORMALS.map((n) => evaluateDirectionalIrradiance(expected, n));
        const actual = fitDirectionalIrradiance(samples);
        for (let a = -60; a <= 60; a += 5) for (let b = 0; b < 360; b += 30) {
            const theta = a * Math.PI / 180, phi = b * Math.PI / 180;
            const n = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
            assert.ok(Math.abs(evaluateDirectionalIrradiance(actual, n) - evaluateDirectionalIrradiance(expected, n)) < 1e-12);
        }
    }
});

test('Directional fit reproduces its flat sample even for non-affine input and clamps negative lobes', () => {
    const coefficients = fitDirectionalIrradiance([.1, 3, .2, .4]);
    assert.ok(Math.abs(evaluateDirectionalIrradiance(coefficients, [0, 0, 1]) - .1) < 1e-12);
    assert.equal(evaluateDirectionalIrradiance([-1, 0, 0, 0], [0, 0, 1]), 0);
});

test('Enhanced controls are default-off, strict and independent of channel/link intent', () => {
    assert.equal(sanitizeBakedLightingSettings({ receivers: { direct: true, indirect: true } }).receivers.enhanced, false);
    assert.equal(sanitizeBakedLightingSettings({ receivers: { enhanced: 'true' } }).receivers.enhanced, false);
    assert.deepEqual(sanitizeBakedLightingSettings({ receivers: { enhanced: true } }).receivers,
        { enhanced: true, direct: false, indirect: false, linked: true, debug: 'final' });
});

test('Compact directional mips require their explicit schema and runtime capability', () => {
    const descriptor = { mipLevel: 2, channelId: 'indirect_irradiance', resourceType: 'texture_2d', encoding: 'rgba8_unorm',
        coordinateTransform: { schema: 'bus-sim-directional-lightmap-page-v1' }, requiredRuntimeCapabilities: ['receiver_directional_sampling_v1'] };
    assert.equal(isSupportedIlluminationMip(descriptor), true);
    assert.equal(isSupportedIlluminationMip({ ...descriptor, requiredRuntimeCapabilities: [] }), false);
    assert.equal(isSupportedIlluminationMip({ ...descriptor, channelId: 'static_sun_depth' }), false);
});

test('Older directional runtimes reject flat-first pages rather than interpreting the wrong layout', () => {
    const manifest = { cityId: 'city', lightingProfileId: 'light', source: {}, compiler: {},
        channels: [{ id: 'indirect_irradiance', required: true }], selectedCapabilityProfileId: 'directional',
        capabilityProfiles: [{ id: 'directional', requiredChannels: ['indirect_irradiance'], optionalChannels: [],
            requiredRuntimeCapabilities: ['receiver_directional_sampling_v1'] }] };
    const chunks = { chunks: [{ id: 'page', channelId: 'indirect_irradiance', resourceType: 'texture_2d', encoding: 'rgba8_unorm',
        requiredRuntimeCapabilities: ['receiver_directional_sampling_v1', 'receiver_directional_flat_first_v1'] }] };
    const old = evaluateIlluminationPackageCompatibility(manifest, chunks, { runtimeCapabilities: ['receiver_directional_sampling_v1'] });
    assert.equal(old.compatible, false);
    assert.deepEqual(old.missingRuntimeCapabilities, ['receiver_directional_flat_first_v1']);
    const current = evaluateIlluminationPackageCompatibility(manifest, chunks,
        { runtimeCapabilities: ['receiver_directional_sampling_v1', 'receiver_directional_flat_first_v1'] });
    assert.equal(current.compatible, true);
});

function fixture() {
    const texture = { version: 0, source: { data: {}, version: 0 }, repeat: { x: 1, y: 1 } };
    const object = { parent: {}, count: 1, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
        material: { color: { r: 1, g: 1, b: 1 }, map: texture, normalScale: { x: 1, y: 1 } },
        geometry: { attributes: { position: { version: 0, array: new Float32Array(9), itemSize: 3, count: 3 } }, index: null, groups: [] } };
    return { object, texture, references: new Map([['mesh', object]]) };
}

test('Enhanced freshness detects transforms, material and texture edits without serialized snapshots', () => {
    const mutations = [({object}) => object.matrixWorld.elements[12]++, ({object}) => object.material.color.r = .5,
        ({object}) => object.material.normalScale.x = 2, ({texture}) => texture.repeat.x = 2,
        ({texture}) => texture.source.version++, ({object}) => object.geometry.attributes.position.version++,
        ({object}) => object.geometry.attributes.position = { version: 0 }, ({object}) => object.parent = {}];
    for (const mutate of mutations) {
        const f = fixture(), watch = createEnhancedSourceWatch(f.references);
        assert.equal(watch(), true); mutate(f); assert.equal(watch(), false);
    }
});

test('Freshness checks preserve native property descriptors', () => {
    const f = fixture(), previous = Object.getOwnPropertyDescriptor(f.object.material.normalScale, 'x');
    const watch = createEnhancedSourceWatch(f.references);
    assert.equal(watch(), true);
    f.object.material.normalScale.x = 1;
    assert.equal(watch(), true);
    f.object.material.normalScale.x = 2;
    assert.equal(watch(), false);
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.object.material.normalScale, 'x'), { ...previous, value: 2 });
    assert.equal(watch(), false);
});

test('Freshness checks source draw ranges, unmapped geometry and authored descendant visibility', () => {
    const f = fixture(), original = f.object.geometry;
    original.drawRange = { start: 0, count: 3 };
    const watch = createEnhancedSourceWatch(f.references);
    original.drawRange.count = 0; assert.equal(watch(), false); original.drawRange.count = 3;
    f.object.geometry = {}; assert.equal(watch(), false);
    watch.setGeometryOverrides([{ object: f.object, geometry: f.object.geometry }]); assert.equal(watch(), true);
    assert.equal(watch(true), false); f.object.geometry = original; assert.equal(watch(true), true);
    const child = { children: [], visible: true }, root = { visible: true, children: [child], traverse(fn) { fn(this); fn(child); } };
    const visibility = createEnhancedSourceWatch(f.references, { roots: [root], ignoreVisibility: new Set([root]) });
    root.visible = false; assert.equal(visibility(), true);
    child.visible = false; assert.equal(visibility(), false);
});

test('Freshness ignores private shader bookkeeping but catches authored semantic and topology changes', () => {
    const f = fixture();
    f.object.material.defines = { STANDARD: '', USE_CSM: 1, CSM_CASCADES: 3 };
    f.object.material.userData = { materialVariationConfig: { amount: .2, shaderUniforms: { time: 0 }, _cache: {} } };
    const child = { parent: null, children: [] }, root = { children: [child], traverse(fn) { fn(this); fn(child); } };
    const watch = createEnhancedSourceWatch(f.references, { roots: [root] });
    delete f.object.material.defines.USE_CSM;
    delete f.object.material.defines.CSM_CASCADES;
    f.object.material.userData.materialVariationConfig.shaderUniforms.time++;
    f.object.material.userData.materialVariationConfig._cache.foo = 1;
    assert.equal(watch(), true);
    child.children.push({}); assert.equal(watch(), false); child.children.pop();
    f.object.material.userData.materialVariationConfig.amount = .3; assert.equal(watch(), false);
});

test('Freshness rejects replacement material groups and newly introduced source roots', () => {
    const f = fixture(); f.object.geometry.groups.push({ start: 0, count: 3, materialIndex: 0 });
    const groupWatch = createEnhancedSourceWatch(f.references);
    f.object.geometry.groups[0] = { start: 0, count: 0, materialIndex: 0 }; assert.equal(groupWatch(), false);
    const parent = { children: [] }, root = { parent, children: [], traverse(fn) { fn(this); } }; parent.children.push(root);
    const roots = createEnhancedSourceWatch(f.references, { roots: [root] });
    parent.children.push({}); assert.equal(roots(), false);
});

test('Batched freshness preserves each object snapshot and literal semantic property names', () => {
    const first = fixture(), second = fixture();
    const key = 'quoted " property ] with spaces';
    first.object.material.userData = { materialVariationConfig: { [key]: .1 } };
    second.object.material.userData = { materialVariationConfig: { [key]: .2 } };
    const watch = createEnhancedSourceWatch(new Map([['first', first.object], ['second', second.object]]));
    assert.equal(watch(), true);
    second.object.material.userData.materialVariationConfig[key] = .1;
    assert.equal(watch(), false);
    assert.equal(watch.lastChange.key, key);
    second.object.material.userData.materialVariationConfig[key] = .2;
    assert.equal(watch(), true);
    second.texture.repeat.y = 3;
    assert.equal(watch(), false);
});
