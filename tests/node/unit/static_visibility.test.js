import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STATIC_VISIBILITY_CATEGORY,
    STATIC_VISIBILITY_GEOMETRY_REVISION,
    STATIC_VISIBILITY_HASH_SCHEMA,
    STATIC_VISIBILITY_PROFILE,
    STATIC_VISIBILITY_SCHEMA,
    STATIC_VISIBILITY_VERSION,
    StaticVisibilityRuntime,
    canonicalStringify,
    createBuildingVisibilityId,
    createStaticVisibilityCityHash,
    createTrafficControlVisibilityId,
    createTreeVisibilityId,
    expandStaticVisibilityNeighborMasks,
    hashCanonicalValue,
    sanitizeStaticVisibilitySettings,
    validateStaticVisibilityPayload
} from '../../../src/app/city/visibility/index.js';
import { StaticVisibilityRenderBridge } from '../../../src/graphics/visuals/city/StaticVisibilityRenderBridge.js';

function encodeWords(words) {
    const bytes = new Uint8Array(words.length * 4);
    const view = new DataView(bytes.buffer);
    words.forEach((word, index) => view.setUint32(index * 4, word, true));
    return Buffer.from(bytes).toString('base64');
}

function makePayload({ units, words, cityConfigHash = 'hash' }) {
    return {
        schema: STATIC_VISIBILITY_SCHEMA,
        version: STATIC_VISIBILITY_VERSION,
        hashSchema: STATIC_VISIBILITY_HASH_SCHEMA,
        cityId: 'bigcity2',
        cityConfigHash,
        geometryRevision: STATIC_VISIBILITY_GEOMETRY_REVISION,
        profileId: STATIC_VISIBILITY_PROFILE.id,
        map: { width: 1, height: 1, tileSize: 24, origin: { x: 0, z: 0 } },
        directionCount: STATIC_VISIBILITY_PROFILE.directionCount,
        units,
        mask: {
            encoding: 'base64-u32-le',
            wordsPerMask: Math.ceil(units.length / 32),
            entryCount: STATIC_VISIBILITY_PROFILE.directionCount,
            data: encodeWords(words)
        }
    };
}

test('static visibility canonical hash is key-order independent and content sensitive', () => {
    const a = { city: 'bigcity2', nested: { z: 2, a: [1, true, null] } };
    const b = { nested: { a: [1, true, null], z: 2 }, city: 'bigcity2' };
    assert.equal(canonicalStringify(a), canonicalStringify(b));
    assert.equal(hashCanonicalValue(a), hashCanonicalValue(b));
    assert.notEqual(hashCanonicalValue(a), hashCanonicalValue({ ...a, city: 'changed' }));
    assert.throws(() => hashCanonicalValue({ invalid: Number.NaN }), /non-finite/);
});

test('city hash changes for map, placement, and resolved building-config changes', () => {
    const createCity = ({ roadTag = 'main', tiles = [[2, 3]], floors = 6, reordered = false } = {}) => {
        const building = reordered
            ? { layers: [{ floors }], tiles, configId: 'brick', id: 'block-a' }
            : { id: 'block-a', configId: 'brick', tiles, layers: [{ floors }] };
        const exported = reordered
            ? { buildings: [building], roads: [{ tag: roadTag }], height: 25, width: 25 }
            : { width: 25, height: 25, roads: [{ tag: roadTag }], buildings: [building] };
        return {
            cityId: 'bigcity2',
            visibilitySourceSpec: exported,
            genConfig: { seed: 'bigcity2' },
            generatorConfig: { road: { laneWidth: 3.5 } },
            map: {
                buildings: [building],
                reservationSpecs: [],
                exportSpec: () => exported
            },
            trafficControls: { placements: [{ kind: 'traffic_light', x: 1, z: 2 }] },
            world: { trees: { quality: 'desktop', placements: [{ x: 4, z: 5 }] } }
        };
    };
    const reference = createStaticVisibilityCityHash(createCity());
    assert.equal(reference, createStaticVisibilityCityHash(createCity({ reordered: true })));
    assert.notEqual(reference, createStaticVisibilityCityHash(createCity({ roadTag: 'changed-road' })));
    assert.notEqual(reference, createStaticVisibilityCityHash(createCity({ tiles: [[3, 3]] })));
    assert.notEqual(reference, createStaticVisibilityCityHash(createCity({ floors: 7 })));
});

test('city hash ignores unused catalog entries and visibility-neutral building defaults', () => {
    const building = { id: 'block-a', configId: 'brick', tiles: [[2, 3]], layers: [{ floors: 6 }] };
    const createCity = () => ({
        cityId: 'bigcity2',
        visibilitySourceSpec: { width: 25, height: 25, buildings: [{ id: 'block-a', configId: 'brick' }] },
        genConfig: { seed: 'bigcity2' },
        generatorConfig: {},
        map: {
            buildings: [{ ...building }],
            reservationSpecs: [],
            exportSpec: () => ({ width: 25, height: 25, buildings: [{ id: 'block-a', configId: 'brick' }] })
        },
        trafficControls: { placements: [] },
        world: { trees: { quality: 'desktop', placements: [] } }
    });
    const referenceCity = createCity();
    const reference = createStaticVisibilityCityHash(referenceCity);

    const unusedCatalogCity = createCity();
    unusedCatalogCity.unusedBuildingCatalog = [{ id: 'new-unused-building', layers: [{ floors: 100 }] }];
    assert.equal(createStaticVisibilityCityHash(unusedCatalogCity), reference);

    const neutralDefaultsCity = createCity();
    neutralDefaultsCity.map.buildings[0].fitToLot = false;
    neutralDefaultsCity.map.buildings[0].footprintStretch = null;
    assert.equal(createStaticVisibilityCityHash(neutralDefaultsCity), reference);

    const activeFitCity = createCity();
    activeFitCity.map.buildings[0].fitToLot = true;
    assert.notEqual(createStaticVisibilityCityHash(activeFitCity), reference);

    const activeStretchCity = createCity();
    activeStretchCity.map.buildings[0].footprintStretch = { A: 2 };
    assert.notEqual(createStaticVisibilityCityHash(activeStretchCity), reference);
});

test('static visibility IDs are stable and category names are explicit', () => {
    assert.equal(createBuildingVisibilityId('building_9'), 'building:building_9');
    assert.equal(createTrafficControlVisibilityId(STATIC_VISIBILITY_CATEGORY.TRAFFIC_LIGHTS, 2), 'traffic_lights:002');
    assert.equal(createTrafficControlVisibilityId(STATIC_VISIBILITY_CATEGORY.TRAFFIC_SIGNS, 18), 'traffic_signs:018');
    assert.equal(createTreeVisibilityId(7), 'trees:007');
});

test('static visibility payload validates identity and decodes little-endian masks', () => {
    const units = [{ id: 'building:a', category: STATIC_VISIBILITY_CATEGORY.BUILDINGS }];
    const words = Array.from({ length: STATIC_VISIBILITY_PROFILE.directionCount }, (_, index) => index === 3 ? 1 : 0);
    const payload = makePayload({ units, words });
    const expected = {
        cityId: 'bigcity2',
        cityConfigHash: 'hash',
        mapWidth: 1,
        mapHeight: 1,
        tileSize: 24,
        originX: 0,
        originZ: 0,
        units
    };
    const decoded = validateStaticVisibilityPayload(payload, expected);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.table[3], 1);
    assert.equal(validateStaticVisibilityPayload({ ...payload, cityConfigHash: 'stale' }, expected).reason, 'city_config_hash_mismatch');
    assert.equal(validateStaticVisibilityPayload({ ...payload, profileId: 'old-profile' }, expected).reason, 'profile_mismatch');
    assert.equal(validateStaticVisibilityPayload({ ...payload, units: [{ ...units[0], id: 'building:wrong' }] }, expected).reason, 'unit_id_mismatch');
});

test('neighbor expansion clips map edges without wrapping rows', () => {
    const source = new Uint32Array(3 * 2);
    source[0] = 1;
    source[2] = 2;
    const expanded = expandStaticVisibilityNeighborMasks({
        source,
        width: 3,
        height: 2,
        directionCount: 1,
        wordsPerMask: 1,
        radius: 1
    });
    assert.deepEqual([...expanded], [1, 3, 2, 1, 3, 2]);
});

test('runtime unions two yaw bins, preserves the previous mask briefly, and changes only dirty roots', () => {
    const units = [
        { id: 'building:a', category: STATIC_VISIBILITY_CATEGORY.BUILDINGS },
        { id: 'trees:000', category: STATIC_VISIBILITY_CATEGORY.TREES }
    ];
    const table = new Uint32Array(STATIC_VISIBILITY_PROFILE.directionCount);
    table[0] = 1;
    table[1] = 2;
    table[2] = 0;
    const changes = [];
    const runtime = new StaticVisibilityRuntime({
        map: { width: 1, height: 1, tileSize: 24, originX: 0, originZ: 0 },
        units,
        graceMs: 250,
        onVisibilityChange: (index, visible) => changes.push([index, visible])
    });
    runtime.setPayload({ ok: true, table, wordsPerMask: 1 });
    assert.equal(runtime.update({ x: 0, z: 0, yaw: 0, nowMs: 0 }), true);
    assert.deepEqual([...runtime.getVisibleFlags()], [1, 1]);
    assert.equal(changes.length, 0);

    runtime.update({ x: 0, z: 0, yaw: Math.PI * 2 / 12 + 0.01, nowMs: 100 });
    assert.deepEqual([...runtime.getVisibleFlags()], [1, 1]);
    runtime.update({ x: 0, z: 0, yaw: Math.PI * 2 / 12 + 0.01, nowMs: 400 });
    assert.deepEqual([...runtime.getVisibleFlags()], [0, 1]);
    assert.deepEqual(changes, [[0, false]]);
});

test('runtime category opt-out, disabled setting, and invalid pose all fail open', () => {
    const units = [{ id: 'trees:000', category: STATIC_VISIBILITY_CATEGORY.TREES }];
    const table = new Uint32Array(STATIC_VISIBILITY_PROFILE.directionCount);
    const changes = [];
    const runtime = new StaticVisibilityRuntime({
        map: { width: 1, height: 1, tileSize: 24, originX: 0, originZ: 0 },
        units,
        graceMs: 0,
        onVisibilityChange: (index, visible) => changes.push([index, visible])
    });
    runtime.setPayload({ ok: true, table, wordsPerMask: 1 });
    runtime.setSettings({ enabled: true, categories: { trees: false } });
    runtime.update({ x: 0, z: 0, yaw: 0, nowMs: 0 });
    assert.deepEqual([...runtime.getVisibleFlags()], [1]);

    runtime.setSettings({ enabled: true, categories: { trees: true } });
    runtime.update({ x: 0, z: 0, yaw: 0, nowMs: 1 });
    assert.deepEqual([...runtime.getVisibleFlags()], [0]);
    runtime.setSettings({ enabled: false });
    assert.deepEqual([...runtime.getVisibleFlags()], [1]);
    assert.equal(runtime.getStatus().state, 'disabled');

    runtime.setSettings({ enabled: true });
    runtime.setPayload({ ok: true, table, wordsPerMask: 1 });
    runtime.update({ x: 50, z: 0, yaw: 0, nowMs: 2 });
    assert.deepEqual([...runtime.getVisibleFlags()], [1]);
    assert.equal(runtime.getStatus().state, 'fallback');
});

test('settings sanitizer defaults on and retains explicit emergency opt-outs', () => {
    assert.equal(sanitizeStaticVisibilitySettings(null).enabled, true);
    const settings = sanitizeStaticVisibilitySettings({
        enabled: false,
        diagnostics: true,
        categories: { buildings: false, trees: true }
    });
    assert.equal(settings.enabled, false);
    assert.equal(settings.diagnostics, true);
    assert.equal(settings.categories.buildings, false);
    assert.equal(settings.categories.traffic_lights, true);
});

test('render bridge restores color-hidden roots for shadow and auxiliary camera passes', () => {
    const roots = [{ visible: true }, { visible: true }];
    const scene = {};
    const gameplayCamera = {};
    const auxiliaryCamera = {};
    const observations = [];
    const renderer = {
        userData: {},
        render(renderScene, camera) {
            observations.push(['render', renderScene, camera, roots.map((root) => root.visible)]);
        },
        shadowMap: {
            render() {
                observations.push(['shadow', roots.map((root) => root.visible)]);
            }
        }
    };
    const originalRender = renderer.render;
    const originalShadowRender = renderer.shadowMap.render;
    const bridge = new StaticVisibilityRenderBridge({ renderer, scene, camera: gameplayCamera, roots });
    bridge.setColorVisibility(0, false);
    assert.deepEqual(roots.map((root) => root.visible), [false, true]);

    renderer.shadowMap.render();
    assert.deepEqual(observations.at(-1), ['shadow', [true, true]]);
    assert.deepEqual(roots.map((root) => root.visible), [false, true]);

    renderer.render(scene, auxiliaryCamera);
    assert.deepEqual(observations.at(-1).at(-1), [true, true]);
    assert.deepEqual(roots.map((root) => root.visible), [false, true]);

    renderer.render(scene, gameplayCamera);
    assert.deepEqual(observations.at(-1).at(-1), [false, true]);
    bridge.dispose();
    assert.deepEqual(roots.map((root) => root.visible), [true, true]);
    assert.equal(renderer.render, originalRender);
    assert.equal(renderer.shadowMap.render, originalShadowRender);
});
