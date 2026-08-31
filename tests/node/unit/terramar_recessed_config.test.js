// Verifies the catalog-only Terra & Mar variant that uses AI 489 recessed balconies.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TERRA_MAR_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/terramar.js';
import { TERRA_MAR_RECESSED_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/terramar_recessed.js';
import {
    getBuildingConfigById,
    getBuildingConfigs
} from '../../../src/graphics/content3d/catalogs/BuildingConfigCatalog.js';

const RESIDENTIAL_LAYER_ID = 'floor_b8_residential';

function layer(config, id) {
    return config.layers.find((entry) => entry.id === id);
}

function facadeBays(config, layerId) {
    return Object.values(config.facades[layerId] ?? {})
        .flatMap((facade) => facade?.layout?.bays?.items ?? []);
}

function balconyBays(config, layerId) {
    return facadeBays(config, layerId).filter((bay) => bay.balcony?.enabled === true);
}

test('Terra & Mar recessed balconies resolves as a separate catalog entry', () => {
    assert.equal(TERRA_MAR_RECESSED_BUILDING_CONFIG.id, 'terramar_recessed');
    assert.equal(TERRA_MAR_RECESSED_BUILDING_CONFIG.name, 'Terra & Mar — Recessed Balconies');
    assert.strictEqual(
        getBuildingConfigById('terramar_recessed'),
        TERRA_MAR_RECESSED_BUILDING_CONFIG
    );
    assert.equal(
        getBuildingConfigs().filter((config) => config.id === 'terramar_recessed').length,
        1
    );
    assert.strictEqual(getBuildingConfigById('terramar'), TERRA_MAR_BUILDING_CONFIG);
});

test('Terra & Mar recessed balconies leaves the original config unchanged', () => {
    const baseResidential = layer(TERRA_MAR_BUILDING_CONFIG, RESIDENTIAL_LAYER_ID);
    const variantResidential = layer(TERRA_MAR_RECESSED_BUILDING_CONFIG, RESIDENTIAL_LAYER_ID);
    const baseBalconies = balconyBays(TERRA_MAR_BUILDING_CONFIG, RESIDENTIAL_LAYER_ID);

    assert.notStrictEqual(TERRA_MAR_RECESSED_BUILDING_CONFIG, TERRA_MAR_BUILDING_CONFIG);
    assert.notStrictEqual(TERRA_MAR_RECESSED_BUILDING_CONFIG.layers, TERRA_MAR_BUILDING_CONFIG.layers);
    assert.equal(baseResidential.belt.extrusion, 1.5);
    assert.equal(baseResidential.balconyContinuity.links.length, 3);
    assert.ok(baseBalconies.length > 0);
    assert.ok(baseBalconies.every((bay) => bay.balcony.presetId === 'balcony.modern_glass_projecting'));
    assert.ok(baseBalconies.every((bay) => bay.balcony.platform.depthMeters === 1.5));
    assert.notStrictEqual(variantResidential, baseResidential);
});

test('Terra & Mar recessed balconies converts every authored residential balcony bay', () => {
    const residential = layer(TERRA_MAR_RECESSED_BUILDING_CONFIG, RESIDENTIAL_LAYER_ID);
    const baseBalconies = balconyBays(TERRA_MAR_BUILDING_CONFIG, RESIDENTIAL_LAYER_ID);
    const variantBalconies = balconyBays(TERRA_MAR_RECESSED_BUILDING_CONFIG, RESIDENTIAL_LAYER_ID);

    assert.equal(residential.belt.extrusion, 0.12);
    assert.equal(Object.hasOwn(residential, 'balconyContinuity'), false);
    assert.equal(variantBalconies.length, baseBalconies.length);
    assert.ok(variantBalconies.length > 0);

    for (const bay of variantBalconies) {
        assert.equal(bay.balcony.presetId, 'balcony.modern_recessed');
        assert.equal(bay.balcony.placement, 'recessed');
        assert.deepEqual(bay.depth, { left: -1.5, right: -1.5, linked: true });
        assert.equal(Object.hasOwn(bay.balcony.platform, 'depthMeters'), false);
        assert.equal(bay.balcony.platform.thicknessMeters, 0.04);
        assert.equal(bay.balcony.platform.elevationMeters, 0.04);
        assert.deepEqual(bay.balcony.sides, { left: 'auto', front: 'always', right: 'auto' });
        assert.equal(bay.balcony.railing.infill ?? 'glass_panel', 'glass_panel');
    }
});

test('Terra & Mar recessed balconies preserves all non-residential authored content', () => {
    const baseLayers = TERRA_MAR_BUILDING_CONFIG.layers
        .filter((entry) => entry.id !== RESIDENTIAL_LAYER_ID);
    const variantLayers = TERRA_MAR_RECESSED_BUILDING_CONFIG.layers
        .filter((entry) => entry.id !== RESIDENTIAL_LAYER_ID);
    const baseFacades = Object.fromEntries(
        Object.entries(TERRA_MAR_BUILDING_CONFIG.facades)
            .filter(([layerId]) => layerId !== RESIDENTIAL_LAYER_ID)
    );
    const variantFacades = Object.fromEntries(
        Object.entries(TERRA_MAR_RECESSED_BUILDING_CONFIG.facades)
            .filter(([layerId]) => layerId !== RESIDENTIAL_LAYER_ID)
    );

    assert.deepEqual(variantLayers, baseLayers);
    assert.deepEqual(variantFacades, baseFacades);
    assert.deepEqual(
        TERRA_MAR_RECESSED_BUILDING_CONFIG.footprintLoops,
        TERRA_MAR_BUILDING_CONFIG.footprintLoops
    );
    assert.deepEqual(
        TERRA_MAR_RECESSED_BUILDING_CONFIG.wallDecorations,
        TERRA_MAR_BUILDING_CONFIG.wallDecorations
    );

    const podiumBalconies = balconyBays(TERRA_MAR_RECESSED_BUILDING_CONFIG, 'floor_b8_podium');
    assert.ok(podiumBalconies.length > 0);
    assert.ok(podiumBalconies.every((bay) => bay.balcony.presetId === 'balcony.modern_glass_projecting'));
});
