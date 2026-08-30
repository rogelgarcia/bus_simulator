// Verifies the measured B2 tower frame, curtain wall, address band and rooftop silhouette.
import test from 'node:test';
import assert from 'node:assert/strict';

import { B2_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/B2.js';
import { BURBAN_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/Burban.js';
import {
    getBuildingConfigById,
    getBuildingConfigs
} from '../../../src/graphics/content3d/catalogs/BuildingConfigCatalog.js';

function layer(id) {
    return B2_BUILDING_CONFIG.layers.find((entry) => entry.id === id);
}

function windowDefinition(id) {
    return B2_BUILDING_CONFIG.windowDefinitions.items.find((entry) => entry.id === id);
}

function burbanWindowDefinition(id) {
    return BURBAN_BUILDING_CONFIG.windowDefinitions.items.find((entry) => entry.id === id);
}

function facadeBays(layerId, faceId) {
    return B2_BUILDING_CONFIG.facades[layerId][faceId].layout.bays.items;
}

function authoredWidth(bay) {
    return bay.size.widthMeters ?? bay.size.minMeters;
}

function assertClose(actual, expected, tolerance = 1e-9) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function openingBays(layerId, faceId) {
    return facadeBays(layerId, faceId).filter((bay) => bay.window);
}

function endPiers(layerId, faceId) {
    const bays = facadeBays(layerId, faceId);
    return [bays[0], bays.at(-1)];
}

test('B2 resolves through the building catalog under its stable id', () => {
    assert.equal(B2_BUILDING_CONFIG.id, 'b2');
    assert.strictEqual(getBuildingConfigById('b2'), B2_BUILDING_CONFIG);
    assert.equal(
        getBuildingConfigs().filter((config) => config === B2_BUILDING_CONFIG).length,
        1
    );
});

test('B2 retains an 18 x 16m rectangular footprint and eight occupied floors', () => {
    const loop = B2_BUILDING_CONFIG.footprintLoops[0];
    const xs = loop.map((point) => point.x);
    const zs = loop.map((point) => point.z);

    assert.equal(loop.length, 4);
    assert.equal(Math.max(...xs) - Math.min(...xs), 18);
    assert.equal(Math.max(...zs) - Math.min(...zs), 16);
    assert.equal(B2_BUILDING_CONFIG.floors, 8);
    assert.equal(layer('floor_b2_lobby').floorHeight, 4.4);
    assert.equal(layer('floor_b2_address').floorHeight, 1.35);
    assert.equal(layer('floor_b2_office').floorHeight, 4.25);
    assert.equal(layer('floor_b2_office').floors, 6);
});

test('B2 lobby divides the front glass into two sidelights and a central entry', () => {
    const frontOpenings = openingBays('floor_b2_lobby', 'A');
    const sideOpenings = openingBays('floor_b2_lobby', 'B');

    assert.deepEqual(frontOpenings.map(authoredWidth), [5.25, 5.4, 5.25]);
    assert.equal(frontOpenings[0].window.defId, 'storefront_b2_lobby');
    assert.equal(frontOpenings[1].window.defId, 'storefront_b2_entry');
    assert.equal(frontOpenings[2].window.defId, 'storefront_b2_lobby');
    assert.deepEqual(sideOpenings.map(authoredWidth), [13.9]);
    assert.equal(sideOpenings[0].window.defId, 'storefront_b2_side');
});

test('B2 keeps fixed projected end piers and recessed glass on occupied facades', () => {
    for (const layerId of ['floor_b2_lobby', 'floor_b2_address', 'floor_b2_office']) {
        for (const faceId of ['A', 'B']) {
            for (const pier of endPiers(layerId, faceId)) {
                assert.equal(pier.size.mode, 'fixed');
                assert.equal(authoredWidth(pier), 1.05);
                assert.deepEqual(pier.depth, { left: 0.16, right: 0.16, linked: true });
                assert.deepEqual(pier.wallMaterialOverride, { kind: 'slot', id: 'stone' });
            }

            for (const opening of openingBays(layerId, faceId)) {
                assert.equal(opening.window.depthMeters, 0.45);
            }
        }
    }
});

test('B2 address band aligns the 1200 sign over the central entrance bay', () => {
    const addressLayer = layer('floor_b2_address');
    const centerBay = facadeBays('floor_b2_address', 'A')
        .find((bay) => bay.id === 'address_center');
    const sign = B2_BUILDING_CONFIG.wallDecorations.lettering
        .find((entry) => entry.text === '1200');

    assert.equal(addressLayer.floorHeight, 1.35);
    assert.ok(centerBay);
    assert.equal(authoredWidth(centerBay), 5.4);
    assert.ok(sign);
    assert.equal(sign.target.layerId, 'floor_b2_address');
    assert.equal(sign.target.bayRef, 'A:address_center');
});

test('B2 office faces use contiguous individual windows without dark center pillars', () => {
    const front = facadeBays('floor_b2_office', 'A');
    const side = facadeBays('floor_b2_office', 'B');
    const frontWindows = front.slice(1, -1);
    const sideWindows = side.slice(1, -1);

    assert.equal(front.length, 11);
    assert.equal(side.length, 10);
    assert.deepEqual([authoredWidth(front[0]), authoredWidth(front.at(-1))], [1.05, 1.05]);
    assert.deepEqual([authoredWidth(side[0]), authoredWidth(side.at(-1))], [1.05, 1.05]);
    assert.equal(frontWindows.length, 9);
    assert.equal(sideWindows.length, 8);
    assertClose(frontWindows.reduce((sum, bay) => sum + authoredWidth(bay), 0), 15.9);
    assertClose(sideWindows.reduce((sum, bay) => sum + authoredWidth(bay), 0), 13.9);
    assert.equal(frontWindows.length * layer('floor_b2_office').floors, 54);
    assert.deepEqual(layer('floor_b2_office').material, { kind: 'slot', id: 'stone' });

    for (const bay of [...frontWindows, ...sideWindows]) {
        assert.ok(bay.window);
        assert.deepEqual(bay.wallMaterialOverride, { kind: 'slot', id: 'curtain' });
        assert.equal(bay.depth, undefined);
        assert.equal(bay.window.size.widthMeters, authoredWidth(bay));
        assert.deepEqual(bay.window.padding, { leftMeters: 0, rightMeters: 0 });
        assert.deepEqual(bay.window.repeat, { count: 1 });
        assert.equal(bay.window.depthMeters, 0.45);
        assert.equal(bay.window.visual.interior, 'none');
    }
});

test('B2 keeps multiple single-pane office definitions without parallax interiors', () => {
    const frontWindows = openingBays('floor_b2_office', 'A');
    const definitionIds = frontWindows.map((bay) => bay.window.defId);
    const uniqueDefinitionIds = [...new Set(definitionIds)];

    assert.deepEqual(definitionIds, [
        'window_b2_office_soft',
        'window_b2_office_clear',
        'window_b2_office_lit',
        'window_b2_office_cool',
        'window_b2_office_soft',
        'window_b2_office_clear',
        'window_b2_office_lit',
        'window_b2_office_cool',
        'window_b2_office_soft'
    ]);
    assert.equal(uniqueDefinitionIds.length, 4);
    assert.equal(layer('floor_b2_office').interior.enabled, false);

    for (const id of uniqueDefinitionIds) {
        const definition = windowDefinition(id);
        assert.ok(definition);
        assert.equal(definition.settings.muntins.columns, 1);
        assert.equal(definition.settings.muntins.enabled, false);
        assert.equal(definition.layers.muntins, false);
        assert.ok(definition.settings.frame.verticalWidth <= 0.014);
        assert.deepEqual(definition.settings.interior, { enabled: false });
        assert.equal(definition.layers.interior, false);
    }

    for (const bay of openingBays('floor_b2_pavilion', 'A')) {
        assert.equal(bay.window.visual.interior, 'none');
    }
    assert.deepEqual(windowDefinition('window_b2_pavilion').settings.interior, { enabled: false });
    assert.equal(windowDefinition('window_b2_pavilion').layers.interior, false);
    assert.equal(JSON.stringify(B2_BUILDING_CONFIG).includes('parallax'), false);
});

test('B2 uses pale stone around Burban-calibrated glass and metalwork', () => {
    const b2Offices = [...new Set(openingBays('floor_b2_office', 'A').map((bay) => bay.window.defId))]
        .map(windowDefinition);
    const burbanCurtain = burbanWindowDefinition('window_burban_curtain');
    const b2Lobby = windowDefinition('storefront_b2_lobby');
    const burbanLobby = burbanWindowDefinition('storefront_burban_ground');
    const b2Stone = B2_BUILDING_CONFIG.materialSlots.slots.stone;

    assert.deepEqual(b2Stone.material, { kind: 'color', id: 'offwhite' });
    assert.deepEqual(b2Stone.wallBase, {
        roughness: 0.82,
        normalStrength: 0
    });
    assert.equal(b2Stone.tiling, undefined);
    for (const b2Office of b2Offices) {
        assert.deepEqual(b2Office.settings.glass, burbanCurtain.settings.glass);
        assert.deepEqual(b2Office.settings.frame.material, burbanCurtain.settings.frame.material);
        assert.equal(b2Office.settings.frame.colorHex, burbanCurtain.settings.frame.colorHex);
    }
    assert.deepEqual(b2Lobby.settings.glass, burbanLobby.settings.glass);
    assert.deepEqual(b2Lobby.settings.frame.material, burbanLobby.settings.frame.material);
});

test('B2 rooftop layers form the terrace, setback pavilion, canopy and glass guardrail', () => {
    const expected = [
        ['floor_b2_terrace_slab', 0.45, -0.25],
        ['floor_b2_pavilion', 4, 1.4],
        ['floor_b2_canopy', 0.32, -0.35],
        ['floor_b2_guardrail', 1.05, 0.12]
    ];

    for (const [id, floorHeight, planOffset] of expected) {
        assert.equal(layer(id).floorHeight, floorHeight);
        assert.equal(layer(id).planOffset, planOffset);
    }

    assert.ok(windowDefinition('window_b2_pavilion'));
    const guardrail = windowDefinition('window_b2_guardrail');
    assert.equal(guardrail.settings.height, 1.05);
    assert.ok(guardrail.settings.glass.opacity < 1);
    assert.equal(layer('roof_b2').type, 'roof');
});
