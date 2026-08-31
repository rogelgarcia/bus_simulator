// Verifies the Terra & Mar clipped-octagon massing, balcony-bay rhythm, penthouse and facade contract.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TERRA_MAR_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/terramar.js';
import {
    getBuildingConfigById,
    getBuildingConfigs
} from '../../../src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import {
    planLayerSilhouetteTransitionSurfaces,
    resolveBuildingLayerSilhouettes
} from '../../../src/app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';

const EXPECTED_OCCUPIED_HEIGHT_METERS = 29.45;
const EXPECTED_RUN_IDS = Object.freeze(['A', 'H', 'G', 'F', 'E', 'D', 'C', 'B']);
const EXPECTED_PODIUM_POINTS = Object.freeze([
    Object.freeze({ x: 7, z: 11, runId: 'A' }),
    Object.freeze({ x: -7, z: 11, runId: 'H' }),
    Object.freeze({ x: -14, z: 4, runId: 'G' }),
    Object.freeze({ x: -14, z: -4, runId: 'F' }),
    Object.freeze({ x: -7, z: -11, runId: 'E' }),
    Object.freeze({ x: 7, z: -11, runId: 'D' }),
    Object.freeze({ x: 14, z: -4, runId: 'C' }),
    Object.freeze({ x: 14, z: 4, runId: 'B' })
]);
const EXPECTED_RESIDENTIAL_POINTS = Object.freeze([
    Object.freeze({ x: 6.4, z: 9.5, runId: 'A' }),
    Object.freeze({ x: -6.4, z: 9.5, runId: 'H' }),
    Object.freeze({ x: -12.5, z: 3.4, runId: 'G' }),
    Object.freeze({ x: -12.5, z: -3.4, runId: 'F' }),
    Object.freeze({ x: -6.4, z: -9.5, runId: 'E' }),
    Object.freeze({ x: 6.4, z: -9.5, runId: 'D' }),
    Object.freeze({ x: 12.5, z: -3.4, runId: 'C' }),
    Object.freeze({ x: 12.5, z: 3.4, runId: 'B' })
]);
const EXPECTED_PENTHOUSE_POINTS = Object.freeze([
    Object.freeze({ x: 5, z: 2.25, runId: 'A' }),
    Object.freeze({ x: -5, z: 2.25, runId: 'D' }),
    Object.freeze({ x: -5, z: -5.25, runId: 'C' }),
    Object.freeze({ x: 5, z: -5.25, runId: 'B' })
]);
const VISIBLE_RESIDENTIAL_RUN_IDS = Object.freeze(['A', 'B', 'C', 'G', 'H']);

function assertClose(actual, expected, tolerance = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} is not within ${tolerance} of ${expected}`
    );
}

function floorLayers() {
    return TERRA_MAR_BUILDING_CONFIG.layers.filter((layer) => layer.type === 'floor');
}

function roofLayers() {
    return TERRA_MAR_BUILDING_CONFIG.layers.filter((layer) => layer.type === 'roof');
}

function layerRoles() {
    const layers = floorLayers();
    assert.equal(layers.length, 4, 'expected ground, podium, residential and penthouse floor layers');
    return {
        ground: layers[0],
        podium: layers[1],
        residential: layers[2],
        penthouse: layers[3]
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

function assertStableClippedOctagon(loop, expectedPoints) {
    assert.ok(Array.isArray(loop));
    assert.equal(loop.length, 8);
    assert.ok(signedAreaOf(loop) > 0, 'BF2 XZ loops must use clockwise winding');
    assert.deepEqual(
        loop.map(({ x, z, runId }) => ({ x, z, runId })),
        expectedPoints
    );
    assert.deepEqual(loop.map((point) => point.runId), EXPECTED_RUN_IDS);
    assert.equal(new Set(loop.map((point) => point.cornerId)).size, 8);
    assert.equal(new Set(loop.map((point) => point.runId)).size, 8);
    for (const point of loop) {
        assert.equal(typeof point.cornerId, 'string');
        assert.ok(point.cornerId.length > 0);
        assert.equal(point.runForward, true);
        assert.equal(Object.hasOwn(point, 'arc'), false, 'Terra & Mar uses planar clipped corners');
    }
}

function assertStablePenthouse(loop) {
    assert.ok(Array.isArray(loop));
    assert.equal(loop.length, 4);
    assert.ok(signedAreaOf(loop) > 0, 'BF2 XZ loops must use clockwise winding');
    assert.deepEqual(
        loop.map(({ x, z, runId }) => ({ x, z, runId })),
        EXPECTED_PENTHOUSE_POINTS
    );
    assert.equal(new Set(loop.map((point) => point.cornerId)).size, 4);
    assert.equal(new Set(loop.map((point) => point.runId)).size, 4);
    for (const point of loop) {
        assert.equal(typeof point.cornerId, 'string');
        assert.equal(point.runForward, true);
        assert.equal(Object.hasOwn(point, 'arc'), false);
    }
}

function resolvedSilhouettes() {
    return resolveBuildingLayerSilhouettes({
        layers: TERRA_MAR_BUILDING_CONFIG.layers,
        footprintLoops: TERRA_MAR_BUILDING_CONFIG.footprintLoops
    });
}

function directFacade(layerId, faceId) {
    return TERRA_MAR_BUILDING_CONFIG.facades[layerId]?.[faceId] ?? null;
}

function resolvedFacade(layer, faceId) {
    const seen = new Set();
    let current = faceId;
    while (current && !seen.has(current)) {
        seen.add(current);
        const master = layer.faceLinking?.links?.[current] ?? null;
        if (master) current = master;
        else return directFacade(layer.id, current);
    }
    return null;
}

function faceBays(layer, faceId) {
    return resolvedFacade(layer, faceId)?.layout?.bays?.items ?? [];
}

function nominalBayWidth(bay) {
    return Number(bay?.size?.widthMeters ?? bay?.size?.minMeters);
}

function windowDefinition(id) {
    return TERRA_MAR_BUILDING_CONFIG.windowDefinitions.items
        .find((definition) => definition.id === id);
}

function letteringByText(text) {
    return TERRA_MAR_BUILDING_CONFIG.wallDecorations?.lettering
        ?.find((lettering) => lettering.text === text);
}

test('Terra & Mar resolves through the building catalog under its stable id once', () => {
    assert.equal(TERRA_MAR_BUILDING_CONFIG.id, 'terramar');
    assert.equal(TERRA_MAR_BUILDING_CONFIG.name, 'Terra & Mar');
    assert.strictEqual(getBuildingConfigById('terramar'), TERRA_MAR_BUILDING_CONFIG);
    assert.equal(
        getBuildingConfigs().filter((config) => config === TERRA_MAR_BUILDING_CONFIG).length,
        1
    );
});

test('Terra & Mar authors eight occupied floors and 29.45m of occupied height', () => {
    const { ground, podium, residential, penthouse } = layerRoles();

    assert.deepEqual(
        [ground.id, podium.id, residential.id, penthouse.id],
        ['floor_b8_ground', 'floor_b8_podium', 'floor_b8_residential', 'floor_b8_penthouse']
    );
    assert.deepEqual([ground.floors, podium.floors, residential.floors, penthouse.floors], [1, 1, 5, 1]);
    assert.deepEqual([ground.floorHeight, podium.floorHeight, residential.floorHeight, penthouse.floorHeight], [4.8, 4.3, 3.35, 3.6]);
    assert.equal(TERRA_MAR_BUILDING_CONFIG.floors, 8);
    assertClose(
        floorLayers().reduce((sum, layer) => sum + layer.floors * layer.floorHeight, 0),
        EXPECTED_OCCUPIED_HEIGHT_METERS
    );
    for (const layer of floorLayers()) assert.equal(layer.planOffset, 0);
});

test('Terra & Mar keeps the 28x22m planar clipped-octagon podium as its default footprint', () => {
    assert.equal(TERRA_MAR_BUILDING_CONFIG.footprintLoops.length, 1);
    const loop = TERRA_MAR_BUILDING_CONFIG.footprintLoops[0];

    assertStableClippedOctagon(loop, EXPECTED_PODIUM_POINTS);
    assert.deepEqual(boundsOf(loop), {
        minX: -14,
        maxX: 14,
        minZ: -11,
        maxZ: 11,
        width: 28,
        depth: 22
    });
});

test('Terra & Mar resolves detached residential and rear-set penthouse silhouettes above the podium', () => {
    const { ground, podium, residential, penthouse } = layerRoles();
    const resolved = resolvedSilhouettes();

    assert.deepEqual(
        resolved.ordered.map((entry) => entry.mode),
        ['inherit_default', 'inherit_previous', 'detached', 'detached']
    );
    assert.deepEqual(
        resolved.ordered.map((entry) => entry.layerId),
        [ground.id, podium.id, residential.id, penthouse.id]
    );
    assert.deepEqual(resolved.byLayerId[ground.id].loop, TERRA_MAR_BUILDING_CONFIG.footprintLoops[0]);
    assert.deepEqual(resolved.byLayerId[podium.id].loop, resolved.byLayerId[ground.id].loop);
    assert.notDeepEqual(resolved.byLayerId[residential.id].loop, resolved.byLayerId[podium.id].loop);
    assertStableClippedOctagon(resolved.byLayerId[residential.id].loop, EXPECTED_RESIDENTIAL_POINTS);
    assert.notDeepEqual(resolved.byLayerId[penthouse.id].loop, resolved.byLayerId[residential.id].loop);
    assertStablePenthouse(resolved.byLayerId[penthouse.id].loop);
    assert.deepEqual(boundsOf(resolved.byLayerId[residential.id].loop), {
        minX: -12.5,
        maxX: 12.5,
        minZ: -9.5,
        maxZ: 9.5,
        width: 25,
        depth: 19
    });
    assert.deepEqual(boundsOf(resolved.byLayerId[penthouse.id].loop), {
        minX: -5,
        maxX: 5,
        minZ: -5.25,
        maxZ: 2.25,
        width: 10,
        depth: 7.5
    });
});

test('Terra & Mar plans podium-to-residential and residential-to-penthouse transitions', () => {
    const { podium, residential, penthouse } = layerRoles();
    const resolved = resolvedSilhouettes();
    const layerPlanLoopsById = new Map(
        resolved.ordered.map((entry) => [entry.layerId, [entry.loop]])
    );
    const transitions = planLayerSilhouetteTransitionSurfaces({
        layers: TERRA_MAR_BUILDING_CONFIG.layers,
        layerPlanLoopsById
    });

    assert.deepEqual(transitions, [
        { lowerLayerId: podium.id, upperLayerId: residential.id },
        { lowerLayerId: residential.id, upperLayerId: penthouse.id }
    ]);
});

test('Terra & Mar gives every resolved occupied run deterministic facade coverage', () => {
    const resolved = resolvedSilhouettes();
    for (const layer of floorLayers()) {
        const runIds = resolved.byLayerId[layer.id].loop.map((point) => point.runId);
        for (const faceId of [...runIds].sort()) {
            const facade = resolvedFacade(layer, faceId);
            assert.ok(facade, `${layer.id}:${faceId} must resolve to a facade`);
            assert.ok(
                (facade.layout?.bays?.items?.length ?? 0) > 0,
                `${layer.id}:${faceId} must contain facade bays`
            );
        }
    }
});

test('Terra & Mar places three front balcony bays and centered piers on the adjacent chamfers', () => {
    const { residential } = layerRoles();
    assert.equal(residential.floors, 5);

    for (const faceId of VISIBLE_RESIDENTIAL_RUN_IDS) {
        const bays = faceBays(residential, faceId);
        const balconyBays = bays.filter((bay) => bay.balcony?.enabled);
        assert.ok(balconyBays.length >= 1, `${faceId} must carry a balcony segment`);
        assert.ok(
            balconyBays.every((bay) => /modern_glass_projecting/.test(bay.balcony?.presetId ?? '')),
            `${faceId} must use projecting glass guards`
        );
        assert.ok(balconyBays.every((bay) => bay.window?.enabled));
        assert.ok(balconyBays.every((bay) => bay.window?.heightMode === 'fixed'));
        assert.ok(balconyBays.every((bay) => bay.window?.size?.heightMeters >= 2.5));
        assert.ok(balconyBays.every((bay) => bay.window?.size?.heightMeters <= 2.75));
        assert.ok(balconyBays.every((bay) => bay.wallMaterialOverride?.id === 'wood'));
        assert.ok(
            balconyBays.every((bay) => bay.balcony?.platform?.material?.id === 'stone'),
            `${faceId} balcony platforms must continue the pale slab material`
        );
        assert.ok(balconyBays.every((bay) => bay.balcony.platform.thicknessMeters === 0.04));
        assert.ok(balconyBays.every((bay) => bay.balcony.platform.elevationMeters === 0.04));
    }

    const front = faceBays(residential, 'A');
    assert.deepEqual(
        front.map((bay) => bay.balcony?.enabled ? 'balcony' : 'pier'),
        ['balcony', 'pier', 'balcony', 'pier', 'balcony']
    );
    assert.deepEqual(front.map(nominalBayWidth), [3, 0.65, 5.5, 0.65, 3]);
    assert.equal(front[0].id, 'b8_residential_front_balcony_right');
    assert.equal(front[4].id, 'b8_residential_front_balcony_left');
    assert.ok(front[1].id.includes('pier_right'));
    assert.ok(front[3].id.includes('pier_left'));
    assert.equal(front.reduce((sum, bay) => sum + nominalBayWidth(bay), 0), 12.8);

    const right = faceBays(residential, 'B');
    const left = faceBays(residential, 'H');
    for (const [faceId, bays] of [['B', right], ['H', left]]) {
        assert.deepEqual(
            bays.map((bay) => bay.balcony?.enabled ? 'balcony' : 'pier'),
            ['balcony', 'pier', 'balcony'],
            `${faceId} must have a centered pier between two balcony bays`
        );
        assert.equal(nominalBayWidth(bays[1]), 0.65);
        assertClose(nominalBayWidth(bays[0]), nominalBayWidth(bays[2]));
        assertClose(
            nominalBayWidth(bays[0]) + nominalBayWidth(bays[1]) + nominalBayWidth(bays[2]),
            Math.hypot(6.1, 6.1)
        );
    }
    assert.ok(right[2].id.includes('adjacent_a'));
    assert.ok(left[0].id.includes('adjacent_a'));
    assert.equal(residential.belt?.extrusion, 1.5);
    assert.equal(residential.belt?.height, 0.22);
});

test('Terra & Mar explicitly joins both front corners and the compatible E-D rear corner', () => {
    const { residential } = layerRoles();

    assert.equal(Object.hasOwn(residential.faceLinking?.links ?? {}, 'B'), false);
    assert.equal(faceBays(residential, 'B')[2]?.id, 'b8_residential_right_chamfer_balcony_adjacent_a');
    assert.equal(faceBays(residential, 'H')[0]?.id, 'b8_residential_left_chamfer_balcony_adjacent_a');
    assert.deepEqual(residential.balconyContinuity, {
        links: [
            {
                id: 'b8_residential_front_to_right_chamfer',
                endpoints: [
                    {
                        faceId: 'A',
                        bayId: 'b8_residential_front_balcony_right',
                        edge: 'start'
                    },
                    {
                        faceId: 'B',
                        bayId: 'b8_residential_right_chamfer_balcony_adjacent_a',
                        edge: 'end'
                    }
                ]
            },
            {
                id: 'b8_residential_front_to_left_chamfer',
                endpoints: [
                    {
                        faceId: 'A',
                        bayId: 'b8_residential_front_balcony_left',
                        edge: 'end'
                    },
                    {
                        faceId: 'H',
                        bayId: 'b8_residential_left_chamfer_balcony_adjacent_a',
                        edge: 'start'
                    }
                ]
            },
            {
                id: 'b8_residential_rear_to_right_chamfer',
                endpoints: [
                    {
                        faceId: 'E',
                        bayId: 'b8_residential_left_chamfer_balcony_outer',
                        edge: 'end'
                    },
                    {
                        faceId: 'D',
                        bayId: 'b8_residential_front_balcony_right',
                        edge: 'start'
                    }
                ]
            }
        ]
    });

    const endpointKeys = residential.balconyContinuity.links
        .flatMap((link) => link.endpoints)
        .map((endpoint) => `${endpoint.faceId}:${endpoint.bayId}:${endpoint.edge}`);
    assert.equal(new Set(endpointKeys).size, 6);
});

test('Terra & Mar ground front centers one broad glazed entrance under the exact two-line sign', () => {
    const { ground, podium } = layerRoles();
    const frontBays = faceBays(ground, 'A');
    const entry = frontBays.find((bay) => /entry/i.test(`${bay.id ?? ''} ${bay.window?.defId ?? ''}`));

    assert.ok(entry, 'ground front must contain a semantically named entrance bay');
    const entryIndex = frontBays.indexOf(entry);
    assertClose(
        frontBays.slice(0, entryIndex).reduce((sum, bay) => sum + nominalBayWidth(bay), 0),
        frontBays.slice(entryIndex + 1).reduce((sum, bay) => sum + nominalBayWidth(bay), 0)
    );
    assert.equal(entry.window?.enabled, true);
    assert.ok(['door', 'storefront'].includes(entry.window?.assetType));
    assert.ok(nominalBayWidth(entry) >= 8 && nominalBayWidth(entry) <= 9.5);
    assert.deepEqual(entry.depth, { left: 1.15, right: 1.15, linked: true });
    assert.equal(entry.wallMaterialOverride?.id, 'stone');
    assert.equal(entry.balcony?.enabled, undefined);
    const adjacentStorefronts = frontBays.filter((bay) => bay.window?.defId === 'window_b8_storefront');
    assert.equal(adjacentStorefronts.length, 2);
    assert.ok(adjacentStorefronts.every((bay) => Math.abs(Number(bay.depth?.left ?? 0)) <= 0.1));
    const terrace = faceBays(podium, 'A').find((bay) => bay.balcony?.enabled);
    assert.ok(terrace, 'podium terrace must align over the projecting entrance volume');
    assertClose(terrace.balcony.platform.depthMeters, entry.depth.left);

    const main = letteringByText('TERRA & MAR');
    const subtitle = letteringByText('COASTAL KITCHEN');
    assert.ok(main);
    assert.ok(subtitle);
    assert.equal(main.target?.layerId, ground.id);
    assert.equal(subtitle.target?.layerId, ground.id);
    assert.match(main.target?.bayRef ?? '', /^A:/);
    assert.equal(subtitle.target?.bayRef, main.target?.bayRef);
    assert.ok(main.heightMeters >= 0.45 && main.heightMeters <= 0.6);
    assert.ok(subtitle.heightMeters >= 0.18 && subtitle.heightMeters <= 0.28);
    assert.ok(main.target.yOffsetMeters > subtitle.target.yOffsetMeters);
    assert.ok(main.depthMeters >= 0.04 && main.depthMeters <= 0.07);
    assert.ok(subtitle.depthMeters >= 0.04 && subtitle.depthMeters <= 0.07);
});

test('Terra & Mar upper podium centers a glazed restaurant terrace on the front run', () => {
    const { podium } = layerRoles();
    const frontBays = faceBays(podium, 'A');
    const terrace = frontBays.find((bay) => bay.balcony?.enabled);

    assert.ok(terrace, 'upper podium front must contain its centered glass terrace');
    assert.equal(terrace.window?.enabled, true);
    assert.equal(terrace.window?.heightMode, 'full');
    assert.match(terrace.balcony?.presetId ?? '', /modern_glass_projecting/);
    assert.ok(nominalBayWidth(terrace) >= 7 && nominalBayWidth(terrace) <= 9.5);
});

test('Terra & Mar calibrates pale limestone, warm soffits and cool transmissive balcony glass', () => {
    const slots = TERRA_MAR_BUILDING_CONFIG.materialSlots.slots;
    const stone = slots.stone;
    const warm = Object.entries(slots)
        .find(([id]) => /wood|warm|soffit|accent/i.test(id))?.[1];

    assert.deepEqual(stone.material, { kind: 'texture', id: 'pbr.limestone_smooth' });
    assert.ok(stone.wallBase.roughness >= 0.72 && stone.wallBase.roughness <= 0.88);
    assert.ok(stone.wallBase.normalStrength <= 0.5);
    const stoneTint = stone.wallBase.tintHex;
    const stoneRed = (stoneTint >> 16) & 0xff;
    const stoneGreen = (stoneTint >> 8) & 0xff;
    const stoneBlue = stoneTint & 0xff;
    assert.ok(stoneRed >= stoneGreen && stoneGreen >= stoneBlue);
    assert.ok(stoneRed >= 0xc8 && stoneBlue >= 0xac);
    assert.ok(warm, 'a semantically named warm wood/soffit material slot is required');

    const { residential } = layerRoles();
    const definitionIds = new Set(
        VISIBLE_RESIDENTIAL_RUN_IDS
            .flatMap((faceId) => faceBays(residential, faceId))
            .filter((bay) => bay.balcony?.enabled)
            .map((bay) => bay.window?.defId)
            .filter(Boolean)
    );
    assert.ok(definitionIds.size >= 1);
    for (const id of definitionIds) {
        const definition = windowDefinition(id);
        assert.ok(definition, `missing window definition ${id}`);
        const glass = definition.settings?.glass;
        assert.ok(glass.opacity >= 0.82 && glass.opacity <= 0.94);
        assert.ok(glass.reflection?.roughness <= 0.09);
        assert.ok(glass.reflection?.transmission >= 0.35 && glass.reflection.transmission <= 0.65);
        assert.ok(glass.reflection?.envMapIntensity >= 2.5);
        const tint = glass.tintHex;
        const red = (tint >> 16) & 0xff;
        const blue = tint & 0xff;
        assert.ok(blue > red, 'residential glass must remain cool blue-gray');
    }
});

test('Terra & Mar exposes an intermediate terrace around a detached penthouse and closes on its roof', () => {
    const { podium, residential, penthouse } = layerRoles();
    const roofs = roofLayers();
    const finalRoof = roofs.find((layer) => layer.id === 'roof_b8');
    const podiumTerrace = roofs.find((layer) => layer.id === 'roof_b8_podium_terrace');
    const residentialTerrace = roofs.find((layer) => layer.id === 'roof_b8_residential_terrace');
    const layerOrder = TERRA_MAR_BUILDING_CONFIG.layers;

    assert.ok(finalRoof, 'Terra & Mar must end with roof_b8');
    assert.ok(residentialTerrace, 'Terra & Mar must expose a rooftop terrace below the penthouse');
    assert.ok(layerOrder.indexOf(residentialTerrace) > layerOrder.indexOf(residential));
    assert.ok(layerOrder.indexOf(residentialTerrace) < layerOrder.indexOf(penthouse));
    assert.equal(layerOrder[layerOrder.indexOf(residentialTerrace) + 1], penthouse);
    assert.equal(Object.hasOwn(residentialTerrace, 'silhouette'), false);
    assert.equal(residentialTerrace.ring?.enabled, true);
    assert.ok(residentialTerrace.ring.height >= 0.4 && residentialTerrace.ring.height <= 0.65);
    assert.equal(residentialTerrace.cornice?.enabled, false);
    assert.notEqual(residentialTerrace.props?.enabled, true);

    assert.ok(layerOrder.indexOf(finalRoof) > layerOrder.indexOf(penthouse));
    assert.equal(Object.hasOwn(finalRoof, 'silhouette'), false);
    assert.equal(finalRoof.ring?.enabled, true);
    assert.ok(finalRoof.ring.height >= 0.4 && finalRoof.ring.height <= 0.65);
    assert.notEqual(finalRoof.cornice?.enabled, true);
    assert.notEqual(finalRoof.props?.enabled, true);

    assert.ok(layerOrder.indexOf(podiumTerrace) > layerOrder.indexOf(podium));
    assert.ok(layerOrder.indexOf(podiumTerrace) < layerOrder.indexOf(residential));
    assert.equal(Object.hasOwn(podiumTerrace, 'silhouette'), false);
    assert.equal(podiumTerrace.ring?.enabled, false);
    assert.equal(podiumTerrace.cornice?.enabled, false);

    for (const faceId of ['A', 'B', 'C', 'D']) {
        const bays = faceBays(penthouse, faceId);
        assert.ok(bays.some((bay) => bay.window?.enabled), `penthouse ${faceId} must be glazed`);
        assert.ok(bays.every((bay) => bay.balcony?.enabled !== true));
    }
});
