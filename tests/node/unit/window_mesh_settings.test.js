// Node unit tests: Window mesh settings + deterministic instance variation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDefaultWindowMeshSettings,
    sanitizeWindowMeshSettings,
    computeWindowMeshInstanceVariation,
    computeWindowMeshInstanceVariationFromSanitized,
    WINDOW_SHADE_DIRECTION,
    WINDOW_GLASS_PRESET_ID,
    WINDOW_INTERIOR_ATLAS_ID,
    PARALLAX_INTERIOR_PRESET_ID,
    WINDOW_FABRICATION_ASSET_TYPE,
    getWindowGlassPresetOptions,
    getWindowGlassPresetById,
    detectWindowGlassPresetId,
    getWindowFabricationCatalogEntries,
    getDefaultWindowFabricationCatalogId,
    getWindowFabricationCatalogEntryByName,
    getWindowFabricationAssetTypeOptions
} from '../../../src/app/buildings/window_mesh/index.js';

test('WindowMeshSettings: arch disables when it cannot fit', () => {
    const s = sanitizeWindowMeshSettings({
        width: 1.0,
        height: 0.4,
        arch: { enabled: true, heightRatio: 0.5 }
    });
    assert.equal(s.arch.enabled, false);
});

test('WindowMeshSettings: muntins enabled requires grid divisions', () => {
    const s = sanitizeWindowMeshSettings({
        muntins: { enabled: true, columns: 1, rows: 1 }
    });
    assert.equal(s.muntins.enabled, false);
});

test('WindowMeshSettings: shade direction defaults to top-to-bottom', () => {
    const s = sanitizeWindowMeshSettings({
        shade: { direction: 'nope' }
    });
    assert.equal(s.shade.direction, WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM);
});

test('WindowMeshSettings: frame openBottom defaults to false', () => {
    const s = sanitizeWindowMeshSettings({});
    assert.equal(s.frame.openBottom, false);
});

test('WindowMeshSettings: glass presets expose expected options', () => {
    const options = getWindowGlassPresetOptions();
    assert.deepEqual(options, [
        { id: WINDOW_GLASS_PRESET_ID.CLEAR, label: 'Clear' },
        { id: WINDOW_GLASS_PRESET_ID.MID, label: 'Mid' },
        { id: WINDOW_GLASS_PRESET_ID.DARK, label: 'Dark' },
        { id: WINDOW_GLASS_PRESET_ID.REFLEXIVE, label: 'Reflexive' }
    ]);
});

test('WindowMeshSettings: glass preset lookup normalizes and clones values', () => {
    const clear = getWindowGlassPresetById('CLEAR');
    assert.equal(clear?.id, WINDOW_GLASS_PRESET_ID.CLEAR);
    assert.equal(clear?.opacity, 0.25);
    assert.equal(clear?.tintHex, 0xa0a0a0);
    assert.equal(clear?.reflection.metalness, 0.5);
    assert.equal(clear?.reflection.roughness, 0.1);
    assert.equal(clear?.reflection.transmission, 0.0);
    assert.equal(clear?.reflection.ior, 2.0);
    assert.equal(clear?.reflection.envMapIntensity, 1.35);

    const fallback = getWindowGlassPresetById('unknown', { fallback: WINDOW_GLASS_PRESET_ID.DARK });
    assert.equal(fallback?.id, WINDOW_GLASS_PRESET_ID.DARK);

    clear.reflection.metalness = 0.99;
    const clearAgain = getWindowGlassPresetById(WINDOW_GLASS_PRESET_ID.CLEAR);
    assert.equal(clearAgain?.reflection.metalness, 0.5);
});

test('WindowMeshSettings: glass preset detection resolves known presets and custom', () => {
    for (const presetId of [
        WINDOW_GLASS_PRESET_ID.CLEAR,
        WINDOW_GLASS_PRESET_ID.MID,
        WINDOW_GLASS_PRESET_ID.DARK,
        WINDOW_GLASS_PRESET_ID.REFLEXIVE
    ]) {
        const preset = getWindowGlassPresetById(presetId);
        assert.ok(preset);
        const detected = detectWindowGlassPresetId({
            opacity: preset.opacity,
            tintHex: preset.tintHex,
            reflection: { ...preset.reflection }
        });
        assert.equal(detected, presetId);
    }

    const custom = detectWindowGlassPresetId({
        opacity: 0.81,
        tintHex: 0x202020,
        reflection: {
            metalness: 0.42,
            roughness: 0.19,
            transmission: 0.0,
            ior: 1.88,
            envMapIntensity: 1.22
        }
    });
    assert.equal(custom, null);
});

test('WindowMeshSettings: frame addHandles defaults to false', () => {
    const s = sanitizeWindowMeshSettings({});
    assert.equal(s.frame.addHandles, false);
});

test('WindowMeshSettings: frame addHandles sanitizes to boolean', () => {
    const s = sanitizeWindowMeshSettings({
        frame: { addHandles: 1 }
    });
    assert.equal(s.frame.addHandles, true);
});

test('WindowMeshSettings: openBottom frame disables arch', () => {
    const s = sanitizeWindowMeshSettings({
        width: 1.4,
        height: 2.2,
        arch: { enabled: true, heightRatio: 0.25 },
        frame: { openBottom: true }
    });
    assert.equal(s.frame.openBottom, true);
    assert.equal(s.arch.enabled, false);
});

test('WindowMeshVariation: same seed+id is deterministic', () => {
    const settings = getDefaultWindowMeshSettings();
    const a = computeWindowMeshInstanceVariation({ settings, seed: 'seed', id: 'f0_c0' });
    const b = computeWindowMeshInstanceVariation({ settings, seed: 'seed', id: 'f0_c0' });
    assert.deepEqual(a, b);
});

test('WindowMeshVariation: random L/R shade direction is deterministic', () => {
    const defaults = getDefaultWindowMeshSettings();
    const settings = sanitizeWindowMeshSettings({
        ...defaults,
        shade: { ...defaults.shade, direction: WINDOW_SHADE_DIRECTION.RANDOM_LR, randomizeCoverage: false, coverage: 0.5 }
    });

    const a = computeWindowMeshInstanceVariationFromSanitized({ settings, seed: 'seed', id: 'f0_c0' });
    const b = computeWindowMeshInstanceVariationFromSanitized({ settings, seed: 'seed', id: 'f0_c0' });
    assert.equal(a.shadeDirection, b.shadeDirection);
    assert.ok([WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT, WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT].includes(a.shadeDirection));
});

test('WindowMeshVariation: output stays in expected ranges', () => {
    const settings = sanitizeWindowMeshSettings({
        ...getDefaultWindowMeshSettings(),
        interior: {
            enabled: true,
            atlasId: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL,
            randomizeCell: true,
            cell: { col: 0, row: 0 },
            randomFlipX: true,
            parallaxDepthMeters: 3,
            tintVariation: {
                hueShiftDeg: { min: -5, max: 5 },
                saturationMul: { min: 0.9, max: 1.1 },
                brightnessMul: { min: 0.8, max: 1.2 }
            }
        }
    });

    const v = computeWindowMeshInstanceVariationFromSanitized({ settings, seed: 'seed', id: 'f1_c2' });
    assert.ok([0.0, 0.2, 0.5, 1.0].includes(v.shadeCoverage));
    assert.ok([
        WINDOW_SHADE_DIRECTION.TOP_TO_BOTTOM,
        WINDOW_SHADE_DIRECTION.LEFT_TO_RIGHT,
        WINDOW_SHADE_DIRECTION.RIGHT_TO_LEFT
    ].includes(v.shadeDirection));
    assert.ok(Number.isInteger(v.interiorCell.col) && v.interiorCell.col >= 0 && v.interiorCell.col < 4);
    assert.ok(Number.isInteger(v.interiorCell.row) && v.interiorCell.row >= 0 && v.interiorCell.row < 4);
    assert.ok(typeof v.interiorFlipX === 'boolean');
    assert.ok(v.interiorTint.hueShiftDeg >= -5 && v.interiorTint.hueShiftDeg <= 5);
    assert.ok(v.interiorTint.saturationMul >= 0.9 && v.interiorTint.saturationMul <= 1.1);
    assert.ok(v.interiorTint.brightnessMul >= 0.8 && v.interiorTint.brightnessMul <= 1.2);
});

test('WindowMeshSettings: parallax interior presets override atlas/depth/zoom', () => {
    const s = sanitizeWindowMeshSettings({
        interior: {
            enabled: true,
            parallaxInteriorPresetId: PARALLAX_INTERIOR_PRESET_ID.OFFICE,
            atlasId: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL,
            uvZoom: 9,
            parallaxDepthMeters: 0
        }
    });

    assert.equal(s.interior.parallaxInteriorPresetId, PARALLAX_INTERIOR_PRESET_ID.OFFICE);
    assert.equal(s.interior.atlasId, WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4);
    assert.equal(s.interior.uvZoom, 1.6);
    assert.equal(s.interior.parallaxDepthMeters, 20.0);
});

test('WindowFabricationCatalog: returns mode-filtered entries with expected defaults', () => {
    const windows = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW });
    const doors = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.DOOR });
    const garages = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.GARAGE });

    assert.equal(windows.length, 1);
    assert.equal(doors.length, 0);
    assert.equal(garages.length, 0);
    assert.ok(windows.every((entry) => entry.assetType === WINDOW_FABRICATION_ASSET_TYPE.WINDOW));

    const defaultDoorId = getDefaultWindowFabricationCatalogId(WINDOW_FABRICATION_ASSET_TYPE.DOOR);
    assert.equal(defaultDoorId, '');
    const defaultGarageId = getDefaultWindowFabricationCatalogId(WINDOW_FABRICATION_ASSET_TYPE.GARAGE);
    assert.equal(defaultGarageId, '');
});

test('WindowFabricationCatalog: asset type options include garage mode', () => {
    const options = getWindowFabricationAssetTypeOptions();
    const ids = options.map((item) => item.id);
    assert.deepEqual(ids, [
        WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        WINDOW_FABRICATION_ASSET_TYPE.DOOR,
        WINDOW_FABRICATION_ASSET_TYPE.GARAGE
    ]);
});

test('WindowFabricationCatalog: includes embedded downloaded window entry with wall hint metadata', () => {
    const windows = getWindowFabricationCatalogEntries({ assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW });
    const embedded = windows.find((entry) => entry.id === 'window_black_6_panels_tall') ?? null;
    assert.ok(embedded);
    assert.equal(embedded?.name, 'Black 6 Panels Tall');
    assert.equal(embedded?.wall?.materialId, 'pbr.brick_wall_11');
    assert.equal(embedded?.thumbnail?.wallMaterialId, 'pbr.brick_wall_11');
});

test('WindowFabricationCatalog: resolves entries by catalog name (case-insensitive)', () => {
    const found = getWindowFabricationCatalogEntryByName('black 6 panels tall', {
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW
    });
    assert.equal(found?.id, 'window_black_6_panels_tall');
});
