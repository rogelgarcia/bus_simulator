// Verifies the Burban catalog configuration's facade independence and material hierarchy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BURBAN_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/Burban.js';

function floorLayer(id) {
    return BURBAN_BUILDING_CONFIG.layers.find((layer) => layer.id === id);
}

function windowDefinition(id) {
    return BURBAN_BUILDING_CONFIG.windowDefinitions.items.find((item) => item.id === id);
}

function facadeBays(layerId, faceId) {
    return BURBAN_BUILDING_CONFIG.facades[layerId][faceId].layout.bays.items;
}

function structuralSignature(layerId, faceId) {
    return facadeBays(layerId, faceId).map((bay) => ({
        mode: bay.size.mode,
        widthMeters: bay.size.widthMeters ?? null,
        minMeters: bay.size.minMeters ?? null,
        hasOpening: !!bay.window
    }));
}

test('Burban keeps curved face B independently authored on every facade layer', () => {
    for (const layerId of ['floor_burban_ground', 'floor_burban_second', 'floor_burban_upper']) {
        const layer = floorLayer(layerId);
        const facades = BURBAN_BUILDING_CONFIG.facades[layerId];
        assert.ok(layer);
        assert.ok(facades?.A);
        assert.ok(facades?.B);
        assert.notStrictEqual(facades.A, facades.B);
        assert.equal(Object.hasOwn(layer.faceLinking.links, 'B'), false);
    }
});

test('Burban lower two storeys expose concrete pier bays between broad glazed openings', () => {
    for (const layerId of ['floor_burban_ground', 'floor_burban_second']) {
        for (const faceId of ['A', 'B']) {
            const bays = facadeBays(layerId, faceId);
            assert.ok(bays.filter((bay) => bay.window).length >= 2);
            const fixedPiers = bays.filter((bay) => !bay.window && bay.size?.mode === 'fixed');
            assert.ok(fixedPiers.length >= 2);
            for (const pier of fixedPiers) {
                assert.ok(pier.size.widthMeters >= 0.5);
                assert.deepEqual(pier.wallMaterialOverride, { kind: 'slot', id: 'stone' });
            }
        }
    }
});

test('Burban lower structural grid stays aligned while every glazed span keeps its authored width', () => {
    for (const faceId of ['A', 'B']) {
        assert.deepEqual(
            structuralSignature('floor_burban_ground', faceId),
            structuralSignature('floor_burban_second', faceId)
        );
        for (const layerId of ['floor_burban_ground', 'floor_burban_second']) {
            const openingBays = facadeBays(layerId, faceId).filter((bay) => bay.window);
            const openingWidths = openingBays.map((bay) => bay.window.size.widthMeters);
            assert.equal(new Set(openingWidths).size, openingWidths.length);
            for (const bay of openingBays) {
                assert.equal(bay.depth.left, -0.18);
                assert.equal(bay.depth.right, -0.18);
            }
        }
    }
});

test('Burban curved base face B contains exactly three independently authored side bays', () => {
    for (const layerId of ['floor_burban_ground', 'floor_burban_second']) {
        const sideOpenings = facadeBays(layerId, 'B').filter((bay) => bay.window);
        assert.equal(sideOpenings.length, 3);
        assert.equal(new Set(sideOpenings.map((bay) => bay.size.widthMeters)).size, 3);
    }
});

test('Burban lower facade grids consume the measured front and curved-face lengths', () => {
    const totalWidth = (layerId, faceId) => facadeBays(layerId, faceId).reduce((sum, bay) => (
        sum + (bay.size.widthMeters ?? bay.size.minMeters)
    ), 0);
    assert.ok(Math.abs(totalWidth('floor_burban_ground', 'A') - 30) < 1e-9);
    assert.ok(Math.abs(totalWidth('floor_burban_ground', 'B') - Math.PI * 3) < 1e-9);
});

test('Burban ground entrance is the full-height straight bay immediately beside curved face B', () => {
    const groundOpenings = facadeBays('floor_burban_ground', 'A').filter((bay) => bay.window);
    const entrances = groundOpenings.filter((bay) => bay.window.assetType === 'door');
    const storefronts = groundOpenings.filter((bay) => bay.window.assetType === 'storefront');
    assert.equal(entrances.length, 0);
    assert.equal(storefronts.length, 1);
    assert.equal(groundOpenings.indexOf(storefronts[0]), 0);
    assert.equal(storefronts[0].window.defId, 'storefront_burban_entry');
    assert.equal(storefronts[0].window.heightMode, 'full');
    assert.ok(storefronts[0].window.size.widthMeters >= 5.6);

    const entryDef = windowDefinition('storefront_burban_entry');
    assert.equal(entryDef.assetType, 'storefront');
    assert.equal(entryDef.settings.frame.doorStyle, 'double');
    assert.equal(entryDef.settings.frame.addHandles, true);
    assert.equal(entryDef.settings.muntins.columns, 4);
    assert.equal(entryDef.settings.glass.reflection.transmission, 0.52);
    assert.equal(entryDef.settings.interior.enabled, false);
    assert.equal(entryDef.layers.interior, false);
    assert.equal(entryDef.storefront.bulkhead.enabled, false);
    assert.equal(entryDef.storefront.fascia.enabled, false);
    assert.equal(entryDef.storefront.transom.mode, 'glazed');
    assert.equal(entryDef.storefront.transom.columns, 4);
    assert.ok(entryDef.storefront.transom.heightMeters >= 0.8);
});

test('Burban upper glazing uses subtle framing and mirrored glass with a blue accent', () => {
    const upper = windowDefinition('window_burban_curtain');
    const tint = upper.settings.glass.tintHex;
    const red = (tint >> 16) & 0xff;
    const blue = tint & 0xff;
    assert.ok(upper.settings.frame.verticalWidth <= 0.03);
    assert.ok(upper.settings.glass.reflection.roughness <= 0.055);
    assert.ok(upper.settings.glass.reflection.metalness >= 0.7);
    assert.equal(upper.settings.glass.reflection.transmission, 0);
    assert.ok(upper.settings.glass.reflection.envMapIntensity >= 1.4);
    assert.ok(blue > red);
});

test('Burban first- and second-floor glass has no parallax backing', () => {
    for (const id of ['window_burban_ground', 'window_burban_second']) {
        const lower = windowDefinition(id);
        assert.ok(lower.settings.glass.opacity >= 0.7 && lower.settings.glass.opacity <= 0.75);
        assert.ok(lower.settings.glass.reflection.transmission >= 0.5);
        assert.ok(lower.settings.glass.reflection.metalness >= 0.4);
        assert.ok(lower.settings.glass.reflection.envMapIntensity >= 2.7);
        assert.equal(lower.settings.interior.enabled, false);
        assert.equal(lower.layers.interior, false);
        assert.ok(lower.settings.frame.horizontalWidth <= 0.006);
        assert.ok(lower.settings.muntins.horizontalWidth <= 0.003);
    }

    assert.equal(floorLayer('floor_burban_ground').interior.enabled, true);
    assert.equal(floorLayer('floor_burban_second').interior.enabled, true);
    for (const layerId of ['floor_burban_ground', 'floor_burban_second']) {
        for (const faceId of ['A', 'B']) {
            for (const bay of facadeBays(layerId, faceId).filter((entry) => entry.window)) {
                assert.equal(bay.window.visual.interior, 'none');
            }
        }
    }
});

test('Burban podium is two standing-height storeys with no cement divider between them', () => {
    const groundLayer = floorLayer('floor_burban_ground');
    const secondLayer = floorLayer('floor_burban_second');
    assert.ok(secondLayer.floorHeight >= groundLayer.floorHeight * 0.9);
    assert.equal(groundLayer.belt.enabled, false);
    assert.equal(groundLayer.cornice.enabled, false);
    assert.equal(secondLayer.belt.enabled, true);
    assert.ok(secondLayer.belt.height >= 0.35);

    assert.equal(floorLayer('floor_burban_ground').planOffset, 0);
    assert.equal(floorLayer('floor_burban_second').planOffset, 0);
    assert.equal(floorLayer('floor_burban_upper').planOffset, 0);
    assert.deepEqual(
        BURBAN_BUILDING_CONFIG.materialSlots.slots.stone.material,
        { kind: 'color', id: 'beige' }
    );

    for (const [layerId, floorHeight] of [
        ['floor_burban_ground', groundLayer.floorHeight],
        ['floor_burban_second', secondLayer.floorHeight]
    ]) {
        const bays = facadeBays(layerId, 'A');
        const stoneWidth = bays
            .filter((bay) => !bay.window)
            .reduce((sum, bay) => sum + (bay.size.widthMeters ?? bay.size.minMeters), 0);
        assert.ok(stoneWidth >= 4.8);
        for (const bay of bays.filter((entry) => entry.window && entry.window.assetType !== 'door')) {
            assert.ok(bay.window.size.heightMeters >= 4.2);
            assert.equal(bay.window.heightMode, 'full');
            assert.equal(bay.window.verticalOffsetMeters, 0);
        }
    }
    for (const bay of facadeBays('floor_burban_second', 'A').filter((entry) => entry.window)) {
        assert.equal(bay.window.verticalOffsetMeters, 0);
    }
});
