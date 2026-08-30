// Verifies the BGGlassMirror layer silhouettes, reflective facade and transition contract.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BG_GLASS_MIRROR_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/BgGlassMirror.js';
import {
    getBuildingConfigById,
    getBuildingConfigs
} from '../../../src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import {
    planLayerSilhouetteTransitionSurfaces,
    resolveBuildingLayerSilhouettes
} from '../../../src/app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';

const EXPECTED_WIDTH_METERS = 44;
const EXPECTED_OCCUPIED_HEIGHT_METERS = 63;

function assertClose(actual, expected, tolerance = 1e-9) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function floorLayers() {
    return BG_GLASS_MIRROR_BUILDING_CONFIG.layers.filter((layer) => layer.type === 'floor');
}

function roofLayers() {
    return BG_GLASS_MIRROR_BUILDING_CONFIG.layers.filter((layer) => layer.type === 'roof');
}

function layerRoles() {
    const layers = floorLayers();
    assert.equal(layers.length, 4, 'expected lobby, podium, offices and crown floor layers');
    return {
        lobby: layers[0],
        podium: layers[1],
        offices: layers[2],
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

function arcRuns(loop) {
    return loop.flatMap((point, index) => {
        if (!point.arc) return [];
        const next = loop[(index + 1) % loop.length];
        return [{
            point,
            next,
            chord: Math.hypot(next.x - point.x, next.z - point.z),
            bulge: Number(point.arc.bulge)
        }];
    });
}

function assertStableClockwiseLoop(loop, expectedRuns = null) {
    assert.ok(Array.isArray(loop));
    assert.ok(loop.length >= 3 && loop.length <= 26);
    if (expectedRuns !== null) assert.equal(loop.length, expectedRuns);
    assert.ok(signedAreaOf(loop) > 0, 'BF2 XZ loops must use clockwise winding');

    const cornerIds = loop.map((point) => point.cornerId);
    const runIds = loop.map((point) => point.runId);
    assert.equal(new Set(cornerIds).size, loop.length);
    assert.equal(new Set(runIds).size, loop.length);
    for (const point of loop) {
        assert.equal(typeof point.cornerId, 'string');
        assert.ok(point.cornerId.length > 0);
        assert.match(point.runId, /^[A-Z]$/);
        assert.equal(typeof point.runForward, 'boolean');
        assert.ok(Number.isFinite(point.x));
        assert.ok(Number.isFinite(point.z));
        if (point.arc) {
            assert.ok(Number.isFinite(point.arc.bulge));
            assert.notEqual(point.arc.bulge, 0);
            if (point.arc.segments !== undefined) assert.ok(point.arc.segments >= 8);
        }
    }
}

function resolvedSilhouettes() {
    return resolveBuildingLayerSilhouettes({
        layers: BG_GLASS_MIRROR_BUILDING_CONFIG.layers,
        footprintLoops: BG_GLASS_MIRROR_BUILDING_CONFIG.footprintLoops
    });
}

function facadeBays(layerId) {
    return Object.values(BG_GLASS_MIRROR_BUILDING_CONFIG.facades[layerId] ?? {})
        .flatMap((facade) => facade?.layout?.bays?.items ?? []);
}

function faceBays(layerId, faceId) {
    return BG_GLASS_MIRROR_BUILDING_CONFIG.facades[layerId]?.[faceId]?.layout?.bays?.items ?? [];
}

function windowDefinition(id) {
    return BG_GLASS_MIRROR_BUILDING_CONFIG.windowDefinitions.items
        .find((definition) => definition.id === id);
}

function bayDepthValues(bay) {
    const depth = bay?.depth;
    if (!depth || typeof depth !== 'object') return [];
    return [depth.offset, depth.left, depth.right].filter((value) => Number.isFinite(value));
}

test('BGGlassMirror resolves through the building catalog under its stable id once', () => {
    assert.equal(BG_GLASS_MIRROR_BUILDING_CONFIG.id, 'bgglassmirror');
    assert.strictEqual(
        getBuildingConfigById('bgglassmirror'),
        BG_GLASS_MIRROR_BUILDING_CONFIG
    );
    assert.equal(
        getBuildingConfigs().filter((config) => config === BG_GLASS_MIRROR_BUILDING_CONFIG).length,
        1
    );
});

test('BGGlassMirror authors the 16-floor, 63m lobby-to-crown stack', () => {
    const { lobby, podium, offices, crown } = layerRoles();
    const roofs = roofLayers();

    assert.deepEqual(
        [lobby.floors, podium.floors, offices.floors, crown.floors],
        [1, 1, 13, 1]
    );
    assert.deepEqual(
        [lobby.floorHeight, podium.floorHeight, offices.floorHeight, crown.floorHeight],
        [5.2, 4.2, 3.8, 4.2]
    );
    assert.equal(BG_GLASS_MIRROR_BUILDING_CONFIG.floors, 16);
    assertClose(
        floorLayers().reduce((sum, layer) => sum + layer.floors * layer.floorHeight, 0),
        EXPECTED_OCCUPIED_HEIGHT_METERS
    );
    assert.equal(roofs.length, 1);
    assert.ok(BG_GLASS_MIRROR_BUILDING_CONFIG.layers.indexOf(roofs[0]) > BG_GLASS_MIRROR_BUILDING_CONFIG.layers.indexOf(crown));
    assert.equal(Object.hasOwn(roofs[0], 'silhouette'), false);
});

test('BGGlassMirror keeps a 44m-wide six- or eight-run bowed office loop as the building default', () => {
    const loop = BG_GLASS_MIRROR_BUILDING_CONFIG.footprintLoops[0];
    const bounds = boundsOf(loop);
    const arcs = arcRuns(loop);

    assert.ok(loop.length === 6 || loop.length === 8);
    assertStableClockwiseLoop(loop, loop.length);
    assert.ok(Math.abs(bounds.width - EXPECTED_WIDTH_METERS) <= 0.05);
    assert.equal(arcs.length, 1);
    assert.ok(arcs[0].chord > bounds.width * 0.45);
    assert.ok(arcs[0].chord < bounds.width * 0.67);
    assert.ok(Math.abs(arcs[0].bulge) >= 0.1);
    assert.ok(
        (arcs[0].point.x + arcs[0].next.x) * 0.5
            > (bounds.minX + bounds.maxX) * 0.5 + bounds.width * 0.02,
        'the office bow must remain offset to the right of the building center'
    );
});

test('BGGlassMirror resolves detached, previous, default and detached silhouettes in order', () => {
    const { lobby, podium, offices, crown } = layerRoles();
    const resolved = resolvedSilhouettes();

    assert.deepEqual(
        resolved.ordered.map((entry) => entry.mode),
        ['detached', 'inherit_previous', 'inherit_default', 'detached']
    );
    assert.deepEqual(
        resolved.ordered.map((entry) => entry.layerId),
        [lobby.id, podium.id, offices.id, crown.id]
    );
    assert.deepEqual(resolved.byLayerId[podium.id].loop, resolved.byLayerId[lobby.id].loop);
    assert.deepEqual(resolved.byLayerId[offices.id].loop, BG_GLASS_MIRROR_BUILDING_CONFIG.footprintLoops[0]);
    assert.notDeepEqual(resolved.byLayerId[crown.id].loop, resolved.byLayerId[offices.id].loop);

    for (const entry of resolved.ordered) assertStableClockwiseLoop(entry.loop);
});

test('BGGlassMirror plans only the podium-office and office-crown silhouette transitions', () => {
    const { podium, offices, crown } = layerRoles();
    const resolved = resolvedSilhouettes();
    const layerPlanLoopsById = new Map(
        resolved.ordered.map((entry) => [entry.layerId, [entry.loop]])
    );
    const transitions = planLayerSilhouetteTransitionSurfaces({
        layers: BG_GLASS_MIRROR_BUILDING_CONFIG.layers,
        layerPlanLoopsById
    });

    assert.deepEqual(transitions, [
        { lowerLayerId: podium.id, upperLayerId: offices.id },
        { lowerLayerId: offices.id, upperLayerId: crown.id }
    ]);
});

test('BGGlassMirror confines its right-offset curve to the office silhouette below a flat crown', () => {
    const { lobby, offices, crown } = layerRoles();
    const resolved = resolvedSilhouettes();
    const lobbyLoop = resolved.byLayerId[lobby.id].loop;
    const officeLoop = resolved.byLayerId[offices.id].loop;
    const crownLoop = resolved.byLayerId[crown.id].loop;
    const officeArc = arcRuns(officeLoop)[0];
    const officeBounds = boundsOf(officeLoop);
    const lobbyBounds = boundsOf(lobbyLoop);
    const crownBounds = boundsOf(crownLoop);

    assert.equal(arcRuns(lobbyLoop).length, 0);
    assert.ok(officeArc);
    assert.equal(arcRuns(officeLoop).length, 1);
    assert.equal(arcRuns(crownLoop).length, 0);
    assert.ok(Math.abs(crownBounds.width - EXPECTED_WIDTH_METERS) <= 0.1);
    assert.ok(officeBounds.depth > lobbyBounds.depth);
    assert.ok(officeBounds.depth > crownBounds.depth);
    assert.ok(
        (officeArc.point.x + officeArc.next.x) * 0.5
            > (officeBounds.minX + officeBounds.maxX) * 0.5 + officeBounds.width * 0.02
    );
});

test('BGGlassMirror office openings use blue reflective mirror glass', () => {
    const { offices } = layerRoles();
    const usedDefinitionIds = new Set(
        facadeBays(offices.id)
            .map((bay) => bay.window?.defId)
            .filter(Boolean)
    );
    const usedDefinitions = [...usedDefinitionIds].map(windowDefinition).filter(Boolean);
    const mirrorDefinitions = usedDefinitions.filter((definition) => {
        const glass = definition.settings?.glass;
        const reflection = glass?.reflection;
        return reflection?.metalness >= 0.65
            && reflection?.roughness <= 0.07
            && reflection?.transmission >= 0.1
            && reflection?.envMapIntensity >= 2;
    });

    assert.ok(mirrorDefinitions.length >= 1);
    for (const definition of mirrorDefinitions) {
        const glass = definition.settings.glass;
        const reflection = glass.reflection;
        const tint = glass.tintHex;
        const red = (tint >> 16) & 0xff;
        const blue = tint & 0xff;
        assert.ok(glass.opacity >= 0.7 && glass.opacity < 1);
        assert.ok(reflection.transmission <= 0.4);
        assert.ok(reflection.ior >= 1.4 && reflection.ior <= 2);
        assert.ok(blue > red);
    }
});

test('BGGlassMirror carries pale structural belts and a genuinely recessed office loggia stack', () => {
    const { offices } = layerRoles();
    const stone = BG_GLASS_MIRROR_BUILDING_CONFIG.materialSlots.slots.stone;
    const bays = facadeBays(offices.id);
    const loggiaBays = bays.filter((bay) => /loggia|balcony/i.test(`${bay.id ?? ''} ${bay.label ?? ''}`));

    assert.ok(stone);
    assert.match(stone.material.id, /stone|limestone|concrete|offwhite|plaster/i);
    assert.ok(stone.wallBase.roughness >= 0.65);
    assert.equal(offices.belt.enabled, true);
    assert.ok(offices.belt.height >= 0.35 && offices.belt.height <= 0.85);
    assert.deepEqual(offices.belt.material, { kind: 'slot', id: 'stone' });
    assert.ok(loggiaBays.length >= 1);
    assert.ok(loggiaBays.some((bay) => bayDepthValues(bay).some((depth) => depth <= -0.5)));
});

test('BGGlassMirror opens the left loggia around the exterior A/F corner', () => {
    const { offices } = layerRoles();
    const frontBays = faceBays(offices.id, 'A');
    const frontCornerBay = frontBays.at(-1);
    const officeLoop = BG_GLASS_MIRROR_BUILDING_CONFIG.footprintLoops[0];
    const frontRunIndex = officeLoop.findIndex((point) => point.runId === 'A');
    const frontRunStart = officeLoop[frontRunIndex];
    const frontRunEnd = officeLoop[(frontRunIndex + 1) % officeLoop.length];
    const frontRunLength = Math.hypot(
        frontRunEnd.x - frontRunStart.x,
        frontRunEnd.z - frontRunStart.z
    );
    const authoredWidth = frontBays.reduce(
        (sum, bay) => sum + Number(bay?.size?.widthMeters ?? 0),
        0
    );

    assert.match(frontCornerBay?.id ?? '', /corner.*balcony/i);
    assert.ok(frontCornerBay?.balcony?.enabled);
    assert.ok(bayDepthValues(frontCornerBay).some((depth) => depth <= -0.5));
    assert.ok(!frontBays.some((bay) => /pier.*end/i.test(bay?.id ?? '')));
    assertClose(authoredWidth, frontRunLength);
    assert.equal(offices.faceLinking?.links?.F, 'D', 'the ordinary side facade should continue beyond the corner notch');
});

test('BGGlassMirror closes with a flat crown-following roof and low screen vocabulary', () => {
    const roof = roofLayers()[0];
    const roofDescription = JSON.stringify(roof);

    assert.equal(roof.type, 'roof');
    assert.notEqual(roof.cornice?.enabled, true);
    assert.match(roofDescription, /screen|louver|bulkhead|mech/i);
});
