// Verifies the measured Burban silhouette, facade rhythm and glazing hierarchy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BURBAN_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/Burban.js';

const LOWER_LAYERS = ['floor_burban_ground', 'floor_burban_second'];
const FRONT_FACES = ['A', 'B', 'F'];

function floorLayer(id) {
    return BURBAN_BUILDING_CONFIG.layers.find((layer) => layer.id === id);
}

function windowDefinition(id) {
    return BURBAN_BUILDING_CONFIG.windowDefinitions.items.find((item) => item.id === id);
}

function facade(layerId, faceId) {
    return BURBAN_BUILDING_CONFIG.facades[layerId][faceId];
}

function facadeBays(layerId, faceId) {
    return facade(layerId, faceId).layout.bays.items;
}

function authoredWidth(bay) {
    return bay.size.widthMeters ?? bay.size.minMeters;
}

function totalWidth(layerId, faceId) {
    return facadeBays(layerId, faceId).reduce((sum, bay) => sum + authoredWidth(bay), 0);
}

function stonePierSignature(layerId, faceId) {
    let cursor = 0;
    const piers = [];
    for (const bay of facadeBays(layerId, faceId)) {
        const width = authoredWidth(bay);
        if (!bay.window) piers.push({ center: cursor + width / 2, width });
        cursor += width;
    }
    return piers;
}

test('Burban retains the 36 x 28m bounds with distinct 12m and 4m front curves', () => {
    const loop = BURBAN_BUILDING_CONFIG.footprintLoops[0];
    const xs = loop.map((point) => point.x);
    const zs = loop.map((point) => point.z);
    assert.equal(Math.max(...xs) - Math.min(...xs), 36);
    assert.equal(Math.max(...zs) - Math.min(...zs), 28);

    const rightCurve = loop.find((point) => point.runId === 'B');
    const leftCurve = loop.find((point) => point.runId === 'F');
    assert.deepEqual({ x: rightCurve.x, z: rightCurve.z }, { x: 18, z: 2 });
    assert.deepEqual({ x: leftCurve.x, z: leftCurve.z }, { x: -14, z: 14 });
    assert.ok(rightCurve.arc);
    assert.ok(leftCurve.arc);
    assert.ok(rightCurve.arc.segments > leftCurve.arc.segments);
});

test('Burban independently authors both curved faces on every facade layer', () => {
    for (const layerId of [...LOWER_LAYERS, 'floor_burban_upper']) {
        const layer = floorLayer(layerId);
        const facades = BURBAN_BUILDING_CONFIG.facades[layerId];
        for (const faceId of FRONT_FACES) assert.ok(facades[faceId]);
        assert.notStrictEqual(facades.A, facades.B);
        assert.notStrictEqual(facades.A, facades.F);
        assert.notStrictEqual(facades.B, facades.F);
        assert.equal(Object.hasOwn(layer.faceLinking.links, 'B'), false);
        assert.equal(Object.hasOwn(layer.faceLinking.links, 'F'), false);
    }
});

test('Burban has a composite straight entry, three right-curve bays and one left-curve bay', () => {
    assert.equal(facadeBays('floor_burban_ground', 'A').filter((bay) => bay.window).length, 4);
    assert.equal(facadeBays('floor_burban_second', 'A').filter((bay) => bay.window).length, 2);
    for (const layerId of LOWER_LAYERS) {
        assert.equal(facadeBays(layerId, 'B').filter((bay) => bay.window).length, 3);
        assert.equal(facadeBays(layerId, 'F').filter((bay) => bay.window).length, 1);
    }
});

test('Burban facade grids consume the straight and true quarter-arc lengths', () => {
    assert.ok(Math.abs(totalWidth('floor_burban_ground', 'A') - 20) < 1e-9);
    assert.ok(Math.abs(totalWidth('floor_burban_ground', 'B') - Math.PI * 6) < 1e-9);
    assert.ok(Math.abs(totalWidth('floor_burban_ground', 'F') - Math.PI * 2) < 1e-9);
});

test('Burban lower floors share pillars, inset glazing and expansion policy', () => {
    for (const faceId of FRONT_FACES) {
        assert.deepEqual(
            stonePierSignature('floor_burban_ground', faceId),
            stonePierSignature('floor_burban_second', faceId)
        );
        for (const layerId of LOWER_LAYERS) {
            for (const bay of facadeBays(layerId, faceId).filter((entry) => entry.window)) {
                assert.equal(bay.depth.left, 0);
                assert.equal(bay.depth.right, 0);
                assert.equal(bay.window.depthMeters, 0.76);
                assert.equal(bay.window.heightMode, 'full');
                assert.equal(bay.window.verticalOffsetMeters, 0);
            }
        }
    }

    for (const layerId of LOWER_LAYERS) {
        const frontOpenings = facadeBays(layerId, 'A').filter((bay) => bay.window);
        const expandableOpenings = frontOpenings.filter((bay) => bay.size.mode === 'range');
        assert.ok(expandableOpenings.length >= 1);
        assert.ok(expandableOpenings.every((bay) => bay.expandPreference === 'prefer_expand'));
        const groups = facade(layerId, 'A').layout.groups.items;
        assert.equal(groups.length, 1);
        assert.deepEqual(groups[0].repeat, { minRepeats: 1, maxRepeats: 'auto' });
        assert.ok(groups[0].bayIds.includes(`${layerId === 'floor_burban_ground' ? 'front_ground' : 'front_second'}_window_2`));
        assert.ok(!groups[0].bayIds.some((id) => id.includes('entrance')));
    }
});

test('Burban stone pillars span both 5m lower storeys without a first-floor cement belt', () => {
    const ground = floorLayer('floor_burban_ground');
    const second = floorLayer('floor_burban_second');
    assert.equal(ground.floorHeight, 5);
    assert.equal(second.floorHeight, 5);
    assert.equal(ground.belt.enabled, false);
    assert.equal(ground.cornice.enabled, false);
    assert.equal(second.belt.enabled, true);
    assert.equal(second.belt.height, 1.2);
    assert.equal(second.belt.extrusion, 0);
    assert.deepEqual(second.belt.material, { kind: 'slot', id: 'stone' });
    assert.equal(second.cornice.enabled, false);

    for (const layerId of LOWER_LAYERS) {
        for (const faceId of FRONT_FACES) {
            for (const bay of facadeBays(layerId, faceId).filter((entry) => !entry.window)) {
                assert.ok(authoredWidth(bay) >= 0.8);
                assert.deepEqual(bay.wallMaterialOverride, { kind: 'slot', id: 'stone' });
                assert.deepEqual(bay.depth, { left: 0.12, right: 0.12, linked: true });
                assert.equal(Object.hasOwn(bay, 'capital'), false);
            }
        }
    }
});

test('Burban entrance is beside the right curve with a thicker aligned full-height glass frame', () => {
    const openings = facadeBays('floor_burban_ground', 'A').filter((bay) => bay.window);
    const entranceBay = openings.find((bay) => bay.window.defId === 'storefront_burban_entry');
    const sideBays = openings.filter((bay) => bay.window.defId === 'storefront_burban_entry_sidelight');
    assert.equal(entranceBay.window.assetType, 'storefront');
    assert.equal(authoredWidth(entranceBay), 5);
    assert.deepEqual(sideBays.map(authoredWidth), [2.75, 2.75]);
    for (const bay of openings.slice(0, 3)) {
        assert.equal(bay.window.size.widthMeters, authoredWidth(bay));
        assert.deepEqual(bay.window.padding, { leftMeters: 0, rightMeters: 0 });
    }

    const entry = windowDefinition('storefront_burban_entry');
    assert.equal(entry.settings.frame.doorStyle, 'double');
    assert.equal(entry.settings.frame.addHandles, true);
    assert.ok(entry.settings.frame.verticalWidth >= 0.12);
    assert.ok(entry.settings.frame.horizontalWidth >= 0.1);
    assert.ok(entry.settings.frame.depth >= 0.14);
    assert.deepEqual(entry.settings.frame.doorKickPanel, { enabled: true, heightMeters: 0.3 });
    assert.equal(entry.settings.frame.handleCenterHeightMeters, 1);
    assert.equal(entry.settings.frame.handleScale, 3);
    assert.deepEqual(entry.settings.frame.doorCenterFrame, { leftMode: 'match', rightMode: 'none' });
    assert.equal(entry.settings.frame.openBottom, true);
    assert.equal(entry.settings.muntins.enabled, false);
    assert.equal(entry.settings.muntins.columns, 1);
    assert.equal(entry.layers.muntins, false);
    assert.equal(entry.storefront.bulkhead.enabled, false);
    assert.equal(entry.storefront.fascia.enabled, false);
    assert.equal(entry.storefront.transom.mode, 'glazed');
    assert.equal(entry.storefront.transom.heightMeters, 1.5);
    assert.equal(entry.storefront.transom.columns, 2);
    assert.equal(entry.storefront.minGlazingHeightMeters, 3.5);
});

test('Burban sign occupies the bottom 1.5m of the second-floor entrance span', () => {
    const secondOpenings = facadeBays('floor_burban_second', 'A').filter((bay) => bay.window);
    assert.equal(secondOpenings[0].window.assetType, 'storefront');
    assert.equal(secondOpenings[0].window.defId, 'storefront_burban_second_sign');

    const sign = windowDefinition('storefront_burban_second_sign');
    assert.equal(sign.settings.muntins.columns, 4);
    assert.equal(sign.storefront.bulkhead.enabled, true);
    assert.equal(sign.storefront.bulkhead.heightMeters, 1.5);
    assert.equal(sign.storefront.bulkhead.material.colorHex, 0x080b0d);
    assert.equal(sign.storefront.transom.mode, 'none');
    assert.equal(sign.storefront.fascia.enabled, false);
});

test('Burban non-entry ground bays retain glass in the 1.5m sign-height zone', () => {
    const storefront = windowDefinition('storefront_burban_ground');
    assert.equal(storefront.assetType, 'storefront');
    assert.equal(storefront.storefront.bulkhead.enabled, false);
    assert.equal(storefront.storefront.fascia.enabled, false);
    assert.equal(storefront.storefront.transom.mode, 'glazed');
    assert.equal(storefront.storefront.transom.heightMeters, 1.5);
    assert.equal(storefront.storefront.minGlazingHeightMeters, 3.5);
    assert.equal(storefront.settings.muntins.columns, 3);
    assert.equal(windowDefinition('window_burban_second').settings.muntins.columns, 3);

    for (const faceId of FRONT_FACES) {
        for (const bay of facadeBays('floor_burban_ground', faceId).filter((entry) => entry.window)) {
            if (bay.window.defId !== 'storefront_burban_entry') {
                assert.ok([
                    'storefront_burban_ground',
                    'storefront_burban_entry_sidelight'
                ].includes(bay.window.defId));
                assert.equal(bay.window.assetType, 'storefront');
            }
        }
    }
});

test('Burban second-floor glass splits exactly at the 1.5m sign-board line', () => {
    const second = windowDefinition('window_burban_second');
    const frameH = second.settings.frame.horizontalWidth;
    const innerH = second.settings.height - frameH * 2;
    const rows = second.settings.muntins.rows;
    const offset = second.settings.muntins.uvOffset.y * (innerH / rows) * 0.25;
    const dividerHeight = frameH + innerH / rows + offset;
    assert.equal(rows, 2);
    assert.ok(Math.abs(dividerHeight - 1.5) < 0.02);
});

test('Burban upper facade uses thicker uniform stone strips aligned to lower internal pillars', () => {
    for (const faceId of FRONT_FACES) {
        for (const bay of facadeBays('floor_burban_upper', faceId).filter((entry) => !entry.window)) {
            assert.equal(authoredWidth(bay), 0.36);
            assert.deepEqual(bay.wallMaterialOverride, { kind: 'slot', id: 'stone' });
        }
        const lowerCenters = stonePierSignature('floor_burban_ground', faceId)
            .slice(1, -1)
            .map((pier) => pier.center);
        const upperCenters = stonePierSignature('floor_burban_upper', faceId)
            .slice(1, -1)
            .map((pier) => pier.center);
        assert.equal(upperCenters.length, lowerCenters.length);
        for (let index = 0; index < upperCenters.length; index++) {
            assert.ok(Math.abs(upperCenters[index] - lowerCenters[index]) < 1e-9);
        }
    }
    assert.equal(stonePierSignature('floor_burban_upper', 'A')[1].center, 12);
});

test('Burban upper glazing has dark edge panels and transmissive blue mirror glass', () => {
    const upper = windowDefinition('window_burban_curtain');
    const tint = upper.settings.glass.tintHex;
    const red = (tint >> 16) & 0xff;
    const blue = tint & 0xff;
    assert.equal(upper.settings.muntins.columns, 4);
    assert.ok(upper.settings.frame.verticalWidth <= 0.02);
    assert.ok(upper.settings.muntins.verticalWidth <= 0.015);
    assert.equal(upper.settings.frame.horizontalWidth, 0.22);
    assert.equal(upper.settings.frame.openBottom, true);
    assert.deepEqual(
        upper.settings.frame.doorBottomFrame,
        { enabled: true, mode: 'match', heightMeters: 0.22 }
    );
    assert.ok(upper.settings.glass.reflection.roughness <= 0.055);
    assert.ok(upper.settings.glass.reflection.metalness >= 0.7);
    assert.ok(upper.settings.glass.opacity < 1);
    assert.ok(upper.settings.glass.reflection.transmission >= 0.1);
    assert.ok(upper.settings.glass.reflection.transmission <= 0.35);
    assert.ok(upper.settings.glass.reflection.envMapIntensity >= 2);
    assert.ok(blue > red);
    assert.equal(upper.settings.interior.enabled, false);
    assert.equal(upper.layers.interior, false);
});

test('all Burban lower glass is transmissive, reflective and has no parallax backing', () => {
    for (const id of [
        'storefront_burban_ground',
        'storefront_burban_entry_sidelight',
        'window_burban_second',
        'storefront_burban_entry',
        'storefront_burban_second_sign'
    ]) {
        const lower = windowDefinition(id);
        assert.ok(lower.settings.glass.opacity >= 0.8 && lower.settings.glass.opacity <= 0.95);
        assert.ok(lower.settings.glass.reflection.transmission >= 0.6);
        assert.ok(lower.settings.glass.reflection.metalness >= 0.3);
        assert.ok(lower.settings.glass.reflection.envMapIntensity >= 3.5);
        assert.equal(lower.settings.interior.enabled, false);
        assert.equal(lower.layers.interior, false);
    }

    for (const layerId of LOWER_LAYERS) {
        assert.equal(floorLayer(layerId).interior.enabled, true);
        for (const faceId of FRONT_FACES) {
            for (const bay of facadeBays(layerId, faceId).filter((entry) => entry.window)) {
                assert.equal(bay.window.visual.interior, 'none');
            }
        }
    }
});

test('Burban structural concrete is darker textured PBR on pillars and upper dividers', () => {
    const stone = BURBAN_BUILDING_CONFIG.materialSlots.slots.stone;
    assert.deepEqual(stone.material, { kind: 'texture', id: 'pbr.rough_concrete' });
    assert.ok(stone.wallBase.tintHex < 0xe0e0e0);
    assert.ok(stone.wallBase.normalStrength <= 0.5);
    assert.deepEqual(stone.tiling, {
        enabled: true,
        tileMeters: 0.35,
        tileMetersU: 0.35,
        tileMetersV: 0.35,
        uvEnabled: true
    });
    assert.deepEqual(
        floorLayer('floor_burban_upper').belt.material,
        { kind: 'slot', id: 'stone' }
    );
    assert.equal(floorLayer('floor_burban_upper').belt.height, 0.56);
    assert.equal(floorLayer('floor_burban_upper').belt.extrusion, 0.12);
    const roof = floorLayer('roof_burban');
    assert.equal(roof.ring.enabled, false);
    assert.equal(roof.cornice.enabled, false);
});

test('Burban uses two lower plus six upper floors', () => {
    assert.equal(floorLayer('floor_burban_upper').floors, 6);
    assert.equal(BURBAN_BUILDING_CONFIG.floors, 8);
    assert.equal(floorLayer('floor_burban_ground').planOffset, 0);
    assert.equal(floorLayer('floor_burban_second').planOffset, 0);
    assert.equal(floorLayer('floor_burban_upper').planOffset, 0);
});
