// Validate declarative grass recipes before any renderer or generated resource is created.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRASS_V2_PIPELINE_CONFIG, resolveGrassDebugV2PipelineConfig } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2PipelineConfig.js';

const withConfiguration = (id, change) => {
    const configurations = structuredClone(GRASS_V2_PIPELINE_CONFIG.configurations);
    change(configurations.find(item => item.id === id));
    return { configurations };
};
const withTexture = change => {
    const textures = structuredClone(GRASS_V2_PIPELINE_CONFIG.textures);
    change(textures[0]);
    return { textures };
};
const assertDeepFrozen = value => {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertDeepFrozen);
};

test('Grass pipeline recipes: defaults resolve independently and remain deeply frozen', () => {
    const first = resolveGrassDebugV2PipelineConfig(), second = resolveGrassDebugV2PipelineConfig();
    assert.deepEqual(first, GRASS_V2_PIPELINE_CONFIG);
    assert.deepEqual(second, first);
    for (const key of Object.keys(first)) {
        assert.notEqual(first[key], second[key], key);
        assert.notEqual(first[key], GRASS_V2_PIPELINE_CONFIG[key], key);
    }
    assertDeepFrozen(GRASS_V2_PIPELINE_CONFIG);
    assertDeepFrozen(first);
    assert.throws(() => { first.reference.count = 2000; }, TypeError);
    assert.throws(() => { first.configurations[0].x = 1; }, TypeError);
    assert.equal(second.reference.count, 4000);
});

test('Grass pipeline recipes: the source must remain complete and located at the origin', () => {
    for (const change of [
        item => { item.x = 1; }, item => { item.z = -0.1; },
        item => { item.stride = 2; }, item => { item.offset = 1; },
        item => { item.kind = 'hybrid'; }, item => { delete item.stride; },
        item => { delete item.offset; }
    ]) assert.throws(() => resolveGrassDebugV2PipelineConfig(withConfiguration('source', change)), /complete source reference at the origin/);
    assert.throws(() => resolveGrassDebugV2PipelineConfig({
        configurations: GRASS_V2_PIPELINE_CONFIG.configurations.filter(item => item.id !== 'source')
    }), /complete source reference at the origin/);
});

test('Grass pipeline recipes: missing texture references and duplicate IDs fail at the boundary', () => {
    assert.throws(() => resolveGrassDebugV2PipelineConfig(
        withConfiguration('hybrid1k', item => { item.texture = 'missing'; })
    ), /Missing texture for hybrid1k/);
    assert.throws(() => resolveGrassDebugV2PipelineConfig({
        textures: [GRASS_V2_PIPELINE_CONFIG.textures[0], GRASS_V2_PIPELINE_CONFIG.textures[0]]
    }), /duplicate grass texture ID/);
    assert.throws(() => resolveGrassDebugV2PipelineConfig({
        configurations: [...GRASS_V2_PIPELINE_CONFIG.configurations, GRASS_V2_PIPELINE_CONFIG.configurations[0]]
    }), /duplicate grass configuration ID/);
    assert.throws(() => resolveGrassDebugV2PipelineConfig(withTexture(item => { item.id = ''; })), /texture ID/);
});

test('Grass pipeline recipes: capture resolution accepts its limits and rejects invalid sizes and LODs', () => {
    for (const resolution of [256, 1024, 2048, 4096]) {
        const result = resolveGrassDebugV2PipelineConfig({ captures: { resolution } });
        assert.equal(result.captures.resolution, resolution);
        assert.equal(result.captures.lod, 'refined');
        const perTexture = resolveGrassDebugV2PipelineConfig(withTexture(item => { item.resolution = resolution; }));
        assert.equal(perTexture.textures[0].resolution, resolution);
        assert.equal(perTexture.captures.resolution, 2048);
    }
    for (const resolution of [0, 255, 4097, 256.5, NaN, Infinity]) {
        assert.throws(() => resolveGrassDebugV2PipelineConfig({ captures: { resolution } }), /between 256 and 4096/);
        assert.throws(() => resolveGrassDebugV2PipelineConfig(withTexture(item => { item.resolution = resolution; })), /texture resolution/);
    }
    for (const lod of ['refined', 'detailed', 'curved', 'split'])
        assert.equal(resolveGrassDebugV2PipelineConfig({ captures: { lod } }).captures.lod, lod);
    assert.throws(() => resolveGrassDebugV2PipelineConfig({ captures: { lod: 'LOD0' } }), /capture LOD/);
});

test('Grass pipeline recipes: reference and hybrid subsets require integral stride and offset', () => {
    for (const id of ['reference', 'hybrid1k']) {
        for (const change of [
            item => { delete item.stride; }, item => { delete item.offset; },
            item => { item.stride = 0; }, item => { item.stride = 1.5; },
            item => { item.offset = -1; }, item => { item.offset = 0.5; },
            item => { item.offset = item.stride; }
        ]) assert.throws(() => resolveGrassDebugV2PipelineConfig(withConfiguration(id, change)), new RegExp('subset recipe: ' + id));
    }
    for (const change of [item => { delete item.offset; }, item => { item.stride = 0; }, item => { item.offset = item.stride; }]) {
        assert.throws(() => resolveGrassDebugV2PipelineConfig(withTexture(change)), /subset recipe: 4k/);
    }
});

test('Grass pipeline recipes: edge depth and texture contrast remain inside their documented ranges', () => {
    for (const edgeDepth of [undefined, 0, -0.01, 0.5, NaN, Infinity]) {
        assert.throws(() => resolveGrassDebugV2PipelineConfig(
            { configurations: [...GRASS_V2_PIPELINE_CONFIG.configurations, { id: 'edge4k', kind: 'edge', x: 3, z: 0, texture: '4k', edgeDepth }] }
        ), /edge depth: edge4k/);
    }
    for (const canopyContrast of [undefined, -0.1, 1.01, NaN, Infinity]) {
        assert.throws(() => resolveGrassDebugV2PipelineConfig(withTexture(item => { item.canopyContrast = canopyContrast; })), /texture contrast: 4k/);
    }
    for (const canopyContrast of [0, 0.5, 1])
        assert.equal(resolveGrassDebugV2PipelineConfig(withTexture(item => { item.canopyContrast = canopyContrast; })).textures[0].canopyContrast, canopyContrast);
});

test('Grass pipeline recipes: leaf counts and seeds retain valid deterministic input', () => {
    for (const count of [10, 2000, 4000, 10000]) {
        for (const seed of [0, 9262026, 0xffffffff]) {
            assert.deepEqual(resolveGrassDebugV2PipelineConfig({ reference: { count, seed } }).reference, { count, seed });
        }
    }
    for (const count of [0, -10, 19, 10010, 40.5, NaN, Infinity])
        assert.throws(() => resolveGrassDebugV2PipelineConfig({ reference: { count } }), /multiple of ten/);
    for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity])
        assert.throws(() => resolveGrassDebugV2PipelineConfig({ reference: { seed } }), /source seed/);
});

test('Grass pipeline recipes: valid custom textures, configurations and profiles are preserved without sharing input objects', () => {
    const profiles = [
        { id: 'short', share: 6, tipFraction: 0.7, upperBend: 0.2, length: [0.4, 0.5], width: [0.4, 0.55] },
        { id: 'tall', share: 4, tipFraction: 0.9, upperBend: 0.6, length: [0.5, 0.7], width: [0.45, 0.6] }
    ];
    const textures = [
        { id: 'even', stride: 2, offset: 0, canopyContrast: 0.75 },
        { id: 'odd', stride: 2, offset: 1, canopyContrast: 0.6 }
    ];
    const configurations = [
        { id: 'source', kind: 'reference', x: 0, z: 0, stride: 1, offset: 0 },
        { id: 'reference', kind: 'reference', x: 2, z: 0, stride: 3, offset: 2 },
        { id: 'volume', kind: 'volume', x: 0, z: -2, texture: 'even' },
        { id: 'mixed', kind: 'hybrid', x: 2, z: -2, texture: 'odd', stride: 6, offset: 3 },
        { id: 'edge', kind: 'edge', x: 0, z: -4, texture: 'even', edgeDepth: 0.1 },
        { id: 'experiment', kind: 'experiment', x: 2, z: -4, texture: 'odd' }
    ];
    const input = {
        reference: { count: 6000, seed: 42, profiles }, captures: { lod: 'detailed', resolution: 1024 },
        layout: { gapMeters: 1, mixedInsetMeters: 0.02, mixedHeightMeters: 0.015 },
        textures, configurations, volume: { heightFraction: 0.75 }, ring: { leafFraction: 0.5 },
        directional: { elevationDegrees: 35 }, field: { sourceConfigurationId: 'mixed', width: 10, depth: 15, chunkSize: 5 }
    };
    const result = resolveGrassDebugV2PipelineConfig(input);
    assert.deepEqual(result, { ...GRASS_V2_PIPELINE_CONFIG, ...input });
    assertDeepFrozen(result);
    assert.equal(Object.isFrozen(input), false);
    profiles[0].width[0] = 99;
    textures[0].canopyContrast = 0;
    configurations[1].x = 20;
    assert.equal(result.reference.profiles[0].width[0], 0.4);
    assert.equal(result.textures[0].canopyContrast, 0.75);
    assert.equal(result.configurations[1].x, 2);
    assert.equal(resolveGrassDebugV2PipelineConfig().reference.count, 4000);
});

test('Grass pipeline recipes: layout distances and configuration positions must be finite', () => {
    for (const layout of [{ gapMeters: -1 }, { gapMeters: Infinity }, { mixedInsetMeters: -0.1 },
        { mixedInsetMeters: 0.5 }, { mixedHeightMeters: -0.1 }, { mixedHeightMeters: NaN }]) {
        assert.throws(() => resolveGrassDebugV2PipelineConfig({ layout }), /layout recipe/);
    }
    assert.throws(() => resolveGrassDebugV2PipelineConfig(
        withConfiguration('texture4k', item => { item.x = Infinity; })
    ), /Invalid grass configuration/);
});
