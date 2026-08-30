// Verifies the B Glass stepped silhouette, paired balcony stacks and facade contract.
import test from 'node:test';
import assert from 'node:assert/strict';

import { B_GLASS_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/BGlass.js';
import {
    getBuildingConfigById,
    getBuildingConfigs
} from '../../../src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import {
    planLayerSilhouetteTransitionSurfaces,
    resolveBuildingLayerSilhouettes
} from '../../../src/app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';

const EXPECTED_OCCUPIED_HEIGHT_METERS = 71.4;
const EXPECTED_PODIUM_BOUNDS = Object.freeze({
    minX: -27,
    maxX: 21,
    minZ: -14,
    maxZ: 14,
    width: 48,
    depth: 28
});
const EXPECTED_TOWER_BOUNDS = Object.freeze({
    minX: -15,
    maxX: 15,
    minZ: -13,
    maxZ: 9,
    width: 30,
    depth: 22
});

function assertClose(actual, expected, tolerance = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} is not within ${tolerance} of ${expected}`
    );
}

function floorLayers() {
    return B_GLASS_BUILDING_CONFIG.layers.filter((layer) => layer.type === 'floor');
}

function roofLayers() {
    return B_GLASS_BUILDING_CONFIG.layers.filter((layer) => layer.type === 'roof');
}

function layerRoles() {
    const layers = floorLayers();
    assert.equal(layers.length, 4, 'expected lobby, podium, tower and crown floor layers');
    return {
        lobby: layers[0],
        podium: layers[1],
        tower: layers[2],
        crown: layers[3]
    };
}

function boundsOf(loop) {
    const xs = loop.map((point) => point.x);
    const zs = loop.map((point) => point.z);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
        width: Math.max(...xs) - Math.min(...xs),
        depth: Math.max(...zs) - Math.min(...zs)
    };
}

function signedAreaOf(loop) {
    return loop.reduce((sum, point, index) => {
        const next = loop[(index + 1) % loop.length];
        return sum + point.x * next.z - next.x * point.z;
    }, 0) * 0.5;
}

function assertStableClockwiseRectangle(loop) {
    assert.ok(Array.isArray(loop));
    assert.equal(loop.length, 4);
    assert.ok(signedAreaOf(loop) > 0, 'BF2 XZ loops must use clockwise winding');

    const cornerIds = loop.map((point) => point.cornerId);
    const runIds = loop.map((point) => point.runId);
    assert.equal(new Set(cornerIds).size, 4);
    assert.equal(new Set(runIds).size, 4);
    for (const point of loop) {
        assert.equal(typeof point.cornerId, 'string');
        assert.ok(point.cornerId.length > 0);
        assert.match(point.runId, /^[A-D]$/);
        assert.equal(typeof point.runForward, 'boolean');
        assert.ok(Number.isFinite(point.x));
        assert.ok(Number.isFinite(point.z));
        assert.equal(Object.hasOwn(point, 'arc'), false, 'B Glass silhouettes stay rectangular');
    }
}

function assertBounds(actual, expected) {
    for (const key of Object.keys(expected)) assertClose(actual[key], expected[key]);
}

function resolvedSilhouettes() {
    return resolveBuildingLayerSilhouettes({
        layers: B_GLASS_BUILDING_CONFIG.layers,
        footprintLoops: B_GLASS_BUILDING_CONFIG.footprintLoops
    });
}

function facadeBays(layerId) {
    return Object.values(B_GLASS_BUILDING_CONFIG.facades[layerId] ?? {})
        .flatMap((facade) => facade?.layout?.bays?.items ?? []);
}

function faceBays(layerId, faceId) {
    return B_GLASS_BUILDING_CONFIG.facades[layerId]?.[faceId]?.layout?.bays?.items ?? [];
}

function windowDefinition(id) {
    return B_GLASS_BUILDING_CONFIG.windowDefinitions.items
        .find((definition) => definition.id === id);
}

function bayDepthValues(bay) {
    const depth = bay?.depth;
    if (!depth || typeof depth !== 'object') return [];
    return [depth.offset, depth.left, depth.right].filter((value) => Number.isFinite(value));
}

function nominalBayWidth(bay) {
    const size = bay?.size;
    if (!size || typeof size !== 'object') return NaN;
    return Number(size.widthMeters ?? size.minMeters);
}

test('B Glass resolves through the building catalog under its stable id once', () => {
    assert.equal(B_GLASS_BUILDING_CONFIG.id, 'bglass');
    assert.equal(B_GLASS_BUILDING_CONFIG.name, 'B Glass');
    assert.strictEqual(getBuildingConfigById('bglass'), B_GLASS_BUILDING_CONFIG);
    assert.equal(
        getBuildingConfigs().filter((config) => config === B_GLASS_BUILDING_CONFIG).length,
        1
    );
});

test('B Glass authors the 20-floor, 71.4m lobby-to-crown stack', () => {
    const { lobby, podium, tower, crown } = layerRoles();
    const roofs = roofLayers();

    assert.deepEqual(
        [lobby.floors, podium.floors, tower.floors, crown.floors],
        [1, 1, 17, 1]
    );
    assert.deepEqual(
        [lobby.floorHeight, podium.floorHeight, tower.floorHeight, crown.floorHeight],
        [5.2, 4.2, 3.4, 4.2]
    );
    assert.equal(B_GLASS_BUILDING_CONFIG.floors, 20);
    assertClose(
        floorLayers().reduce((sum, layer) => sum + layer.floors * layer.floorHeight, 0),
        EXPECTED_OCCUPIED_HEIGHT_METERS
    );
    assert.deepEqual(
        roofs.map((layer) => layer.id),
        ['roof_bglass_podium_terrace', 'roof_bglass']
    );
    const terraceRoof = roofs[0];
    const roof = roofs[1];
    const layerOrder = B_GLASS_BUILDING_CONFIG.layers;
    assert.ok(layerOrder.indexOf(terraceRoof) > layerOrder.indexOf(podium));
    assert.ok(layerOrder.indexOf(terraceRoof) < layerOrder.indexOf(tower));
    assert.ok(layerOrder.indexOf(roof) > layerOrder.indexOf(crown));
    assert.equal(Object.hasOwn(terraceRoof, 'silhouette'), false);
    assert.equal(Object.hasOwn(roof, 'silhouette'), false);
    assert.equal(terraceRoof.roof?.material?.kind, 'color');
    assert.equal(terraceRoof.roof?.material?.id, 'offwhite');
    assert.equal(terraceRoof.ring?.enabled, false);
    assert.equal(terraceRoof.props?.enabled, false);
    assert.equal(terraceRoof.cornice?.enabled, false);
});

test('B Glass keeps the wide 48x28m podium as its stable rectangular default', () => {
    assert.equal(B_GLASS_BUILDING_CONFIG.footprintLoops.length, 1);
    const podiumLoop = B_GLASS_BUILDING_CONFIG.footprintLoops[0];

    assertStableClockwiseRectangle(podiumLoop);
    assertBounds(boundsOf(podiumLoop), EXPECTED_PODIUM_BOUNDS);
});

test('B Glass resolves a detached 30x22m tower retained by the crown', () => {
    const { lobby, podium, tower, crown } = layerRoles();
    const resolved = resolvedSilhouettes();

    assert.deepEqual(
        resolved.ordered.map((entry) => entry.mode),
        ['inherit_default', 'inherit_previous', 'detached', 'inherit_previous']
    );
    assert.deepEqual(
        resolved.ordered.map((entry) => entry.layerId),
        [lobby.id, podium.id, tower.id, crown.id]
    );
    assert.deepEqual(resolved.byLayerId[lobby.id].loop, B_GLASS_BUILDING_CONFIG.footprintLoops[0]);
    assert.deepEqual(resolved.byLayerId[podium.id].loop, resolved.byLayerId[lobby.id].loop);
    assert.notDeepEqual(resolved.byLayerId[tower.id].loop, resolved.byLayerId[podium.id].loop);
    assert.deepEqual(resolved.byLayerId[crown.id].loop, resolved.byLayerId[tower.id].loop);
    assertStableClockwiseRectangle(resolved.byLayerId[tower.id].loop);
    assertBounds(boundsOf(resolved.byLayerId[tower.id].loop), EXPECTED_TOWER_BOUNDS);

    for (const layer of [lobby, podium, tower, crown]) assert.equal(layer.planOffset, 0);
});

test('B Glass plans only the podium-to-tower silhouette transition', () => {
    const { podium, tower } = layerRoles();
    const resolved = resolvedSilhouettes();
    const layerPlanLoopsById = new Map(
        resolved.ordered.map((entry) => [entry.layerId, [entry.loop]])
    );
    const transitions = planLayerSilhouetteTransitionSurfaces({
        layers: B_GLASS_BUILDING_CONFIG.layers,
        layerPlanLoopsById
    });

    assert.deepEqual(transitions, [
        { lowerLayerId: podium.id, upperLayerId: tower.id }
    ]);
});

test('B Glass places its tower to the right on the larger podium using loop coordinates', () => {
    const { podium, tower } = layerRoles();
    const resolved = resolvedSilhouettes();
    const podiumBounds = boundsOf(resolved.byLayerId[podium.id].loop);
    const towerBounds = boundsOf(resolved.byLayerId[tower.id].loop);

    assertClose(towerBounds.minX - podiumBounds.minX, 12);
    assertClose(podiumBounds.maxX - towerBounds.maxX, 6);
    assertClose(podiumBounds.maxZ - towerBounds.maxZ, 5);
    assertClose(towerBounds.minZ - podiumBounds.minZ, 1);
    assert.ok(
        (towerBounds.minX + towerBounds.maxX) * 0.5
            > (podiumBounds.minX + podiumBounds.maxX) * 0.5,
        'tower center must sit to the right of the podium center'
    );
});

test('B Glass repeats a symmetric pair of recessed balcony stacks around its central glass field', () => {
    const { tower } = layerRoles();
    const frontBays = faceBays(tower.id, 'A');
    const balconyBays = frontBays.filter((bay) => /balcony|loggia/i.test(`${bay.id ?? ''} ${bay.label ?? ''}`));

    assert.equal(tower.floors, 17);
    assert.equal(balconyBays.length, 2, 'tower front must carry one left and one right balcony bay');
    assert.ok(balconyBays.some((bay) => /left/i.test(`${bay.id ?? ''} ${bay.label ?? ''}`)));
    assert.ok(balconyBays.some((bay) => /right/i.test(`${bay.id ?? ''} ${bay.label ?? ''}`)));
    assert.ok(balconyBays.every((bay) => bay.balcony?.enabled));
    assert.ok(balconyBays.every((bay) => /recessed/i.test(bay.balcony?.presetId ?? '')));
    assert.ok(balconyBays.every((bay) => bayDepthValues(bay).some((depth) => depth <= -0.8)));
    assertClose(nominalBayWidth(balconyBays[0]), nominalBayWidth(balconyBays[1]), 0.05);

    const balconyIndices = balconyBays.map((bay) => frontBays.indexOf(bay)).sort((a, b) => a - b);
    assert.ok(
        balconyIndices[1] - balconyIndices[0] > 1,
        'at least one central curtain-wall bay must separate the balcony stacks'
    );
    const centralBays = frontBays.slice(balconyIndices[0] + 1, balconyIndices[1]);
    assert.ok(centralBays.some((bay) => bay.window?.enabled), 'the field between balconies must remain glazed');
});

test('B Glass tower openings use blue reflective, partially transmissive glass', () => {
    const { tower } = layerRoles();
    const usedDefinitionIds = new Set(
        facadeBays(tower.id)
            .map((bay) => bay.window?.defId)
            .filter(Boolean)
    );
    const usedDefinitions = [...usedDefinitionIds].map(windowDefinition).filter(Boolean);
    const reflectiveDefinitions = usedDefinitions.filter((definition) => {
        const glass = definition.settings?.glass;
        const reflection = glass?.reflection;
        return glass?.opacity >= 0.7
            && glass.opacity < 1
            && reflection?.metalness >= 0.55
            && reflection?.roughness <= 0.09
            && reflection?.transmission >= 0.12
            && reflection.transmission <= 0.45
            && reflection?.envMapIntensity >= 2;
    });

    assert.ok(reflectiveDefinitions.length >= 1);
    for (const definition of reflectiveDefinitions) {
        const glass = definition.settings.glass;
        const tint = glass.tintHex;
        const red = (tint >> 16) & 0xff;
        const blue = tint & 0xff;
        assert.ok(blue > red, 'curtain glass tint must remain blue-dominant');
        assert.ok(glass.reflection.ior >= 1.4 && glass.reflection.ior <= 2);
    }
});

test('B Glass closes with a crown-following flat roof and restrained screen', () => {
    const { tower, crown } = layerRoles();
    const roof = roofLayers().find((layer) => layer.id === 'roof_bglass');
    const resolved = resolvedSilhouettes();

    assert.deepEqual(resolved.byLayerId[crown.id].loop, resolved.byLayerId[tower.id].loop);
    assert.equal(crown.silhouette?.mode, 'inherit_previous');
    assert.notEqual(roof.cornice?.enabled, true);
    if (roof.ring?.enabled) assert.ok(roof.ring.height <= 0.5);
    assert.notEqual(roof.props?.enabled, true, 'the reference has no dense rooftop prop field');
});
