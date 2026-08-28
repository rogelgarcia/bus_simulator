import test from 'node:test';
import assert from 'node:assert/strict';

import { MODERN_BANK_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/ModernBank.js';
import { solveFacadeBaysLayout } from '../../../src/graphics/assets3d/generators/building_fabrication/FacadeBaysSolver.js';

const EPS = 1e-6;

function solve(layout, faceLengthMeters) {
    const warnings = [];
    const items = solveFacadeBaysLayout({
        bays: layout.bays.items,
        groups: layout.groups.items,
        faceLengthMeters,
        warnings
    });
    return {
        warnings,
        items: items.map((item) => ({
            ...item,
            widthMeters: item.widthFrac * faceLengthMeters
        }))
    };
}

function widthOf(items, sourceBayId) {
    return items.find((item) => item.sourceBayId === sourceBayId)?.widthMeters ?? NaN;
}

test('Modern Bank: intermediate stone piers are exactly two square panels wide', () => {
    const baseLayer = MODERN_BANK_BUILDING_CONFIG.layers.find((layer) => layer.id === 'floor_mb_base_low');
    const panelMeters = baseLayer.tiling.tileMeters / 3;
    const footprint = MODERN_BANK_BUILDING_CONFIG.footprintLoops[0];
    const faceWidth = Math.max(...footprint.map((point) => point.x))
        - Math.min(...footprint.map((point) => point.x));
    const layout = MODERN_BANK_BUILDING_CONFIG.facades.floor_mb_base_low.A.layout;
    const result = solve(layout, faceWidth);

    assert.deepEqual(result.warnings, []);
    assert.ok(Math.abs(panelMeters - 0.9) < EPS);
    for (let i = 1; i <= 5; i++) {
        assert.ok(Math.abs(widthOf(result.items, `bay_pier_${i}`) - panelMeters * 2) < EPS);
    }
});

test('Modern Bank: widening by two curtain modules preserves the facade rhythm', () => {
    const footprint = MODERN_BANK_BUILDING_CONFIG.footprintLoops[0];
    const baseWidth = Math.max(...footprint.map((point) => point.x))
        - Math.min(...footprint.map((point) => point.x));
    const baseLayout = MODERN_BANK_BUILDING_CONFIG.facades.floor_mb_base_low.A.layout;
    const curtainLayout = MODERN_BANK_BUILDING_CONFIG.facades.floor_mb_curtain.A.layout;
    const curtainModule = curtainLayout.bays.items[0].size.minMeters;
    const widenBy = curtainModule * 2;

    const normalBase = solve(baseLayout, baseWidth);
    const wideBase = solve(baseLayout, baseWidth + widenBy);
    assert.deepEqual(wideBase.warnings, []);

    for (let i = 1; i <= 6; i++) {
        assert.ok(Math.abs(
            widthOf(wideBase.items, `bay_open_${i}`) - widthOf(normalBase.items, `bay_open_${i}`)
        ) < EPS);
    }
    for (let i = 1; i <= 5; i++) {
        assert.ok(Math.abs(
            widthOf(wideBase.items, `bay_pier_${i}`) - widthOf(normalBase.items, `bay_pier_${i}`)
        ) < EPS);
    }
    assert.ok(Math.abs(
        widthOf(wideBase.items, 'bay_pier_start') - widthOf(wideBase.items, 'bay_pier_end')
    ) < EPS);
    assert.ok(Math.abs(
        widthOf(wideBase.items, 'bay_pier_start')
            - widthOf(normalBase.items, 'bay_pier_start')
            - widenBy * 0.5
    ) < EPS);

    const normalCurtainWidth = curtainModule * 27;
    const wideCurtain = solve(curtainLayout, normalCurtainWidth + widenBy);
    assert.deepEqual(wideCurtain.warnings, []);
    assert.equal(wideCurtain.items.length, 29);
    for (const item of wideCurtain.items) {
        assert.ok(Math.abs(item.widthMeters - curtainModule) < EPS);
    }
});

test('Modern Bank: the 36m footprint preset keeps curtain modules uniform', () => {
    const footprint = MODERN_BANK_BUILDING_CONFIG.footprintLoops[0];
    const baseWidth = Math.max(...footprint.map((point) => point.x))
        - Math.min(...footprint.map((point) => point.x));
    const curtainLayout = MODERN_BANK_BUILDING_CONFIG.facades.floor_mb_curtain.A.layout;
    const curtainModule = curtainLayout.bays.items[0].size.minMeters;
    const normalCurtainWidth = curtainModule * 27;
    const wideCurtainWidth = normalCurtainWidth + (36 - baseWidth);
    const wideCurtain = solve(curtainLayout, wideCurtainWidth);

    assert.deepEqual(wideCurtain.warnings, []);
    assert.equal(wideCurtain.items.length, 28);
    const uniformWidth = wideCurtainWidth / wideCurtain.items.length;
    for (const item of wideCurtain.items) {
        assert.ok(Math.abs(item.widthMeters - uniformWidth) < EPS);
    }
});
