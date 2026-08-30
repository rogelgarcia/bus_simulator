// Node unit tests: building material slots + brick preset resolution (AI 491).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BUILDING_MATERIAL_SLOT_IDS,
    getMaterialSlotNames,
    isSlotMaterialSpec,
    normalizeBuildingMaterialSlotsConfig,
    parseMaterialSpecShorthand,
    resolveBuildingConfigMaterials,
    resolveMaterialSpecBundle
} from '../../../src/app/buildings/BuildingMaterialSlots.js';
import {
    getBrickPresetById,
    getBrickPresetOptions,
    isBrickPresetId,
    resolveBrickPresetBundle
} from '../../../src/app/buildings/BrickPresetCatalog.js';

const SLOTS = normalizeBuildingMaterialSlotsConfig({
    slots: {
        wallPrimary: { material: { kind: 'preset', id: 'brick.red_standard' } },
        trim: {
            material: { kind: 'texture', id: 'pbr.limestone_smooth' },
            wallBase: { tintHex: 0x645f58, roughness: 0.78, normalStrength: 1.25 },
            tiling: { enabled: true, tileMeters: 0.4, tileMetersU: 0.4, tileMetersV: 0.4, uvEnabled: true }
        },
        base: 'pbr.rusticated_ashlar'
    }
});

test('MaterialSlots: canonical slot ids are exposed and extensible names normalize', () => {
    assert.deepEqual([...BUILDING_MATERIAL_SLOT_IDS], ['wallPrimary', 'wallAccent', 'trim', 'base']);

    const custom = normalizeBuildingMaterialSlotsConfig({
        slots: {
            trim: 'pbr.limestone_smooth',
            myCustomSlot: { material: { kind: 'color', id: 'offwhite' } },
            'bad name!': 'pbr.red_brick'
        }
    });
    assert.deepEqual(getMaterialSlotNames(custom).sort(), ['myCustomSlot', 'trim']);
    assert.equal(custom.slots.trim.material.kind, 'texture');
    assert.equal(custom.slots.myCustomSlot.material.kind, 'color');
});

test('MaterialSlots: shorthand strings parse to slot/preset specs', () => {
    assert.deepEqual(parseMaterialSpecShorthand('slot:trim'), { kind: 'slot', id: 'trim' });
    assert.deepEqual(parseMaterialSpecShorthand('preset:brick.red_standard'), { kind: 'preset', id: 'brick.red_standard' });
    assert.equal(parseMaterialSpecShorthand('pbr.red_brick'), null);
    assert.ok(isSlotMaterialSpec({ kind: 'slot', id: 'trim' }));
    assert.ok(isSlotMaterialSpec('slot:trim'));
    assert.ok(!isSlotMaterialSpec({ kind: 'texture', id: 'pbr.red_brick' }));
});

test('MaterialSlots: resolution order — explicit material wins over slots', () => {
    // Explicit texture/color specs return null (caller keeps them as-is).
    assert.equal(resolveMaterialSpecBundle({ kind: 'texture', id: 'pbr.red_brick' }, { materialSlots: SLOTS }), null);
    assert.equal(resolveMaterialSpecBundle({ kind: 'color', id: 'offwhite' }, { materialSlots: SLOTS }), null);
    // Legacy match_* modes also stay untouched.
    assert.equal(resolveMaterialSpecBundle({ kind: 'match_wall', id: 'match_wall' }, { materialSlots: SLOTS }), null);
});

test('MaterialSlots: slot references resolve to the slot bundle', () => {
    const bundle = resolveMaterialSpecBundle({ kind: 'slot', id: 'trim' }, { materialSlots: SLOTS });
    assert.deepEqual(bundle.material, { kind: 'texture', id: 'pbr.limestone_smooth' });
    assert.equal(bundle.slotName, 'trim');

    const warnings = [];
    const missing = resolveMaterialSpecBundle({ kind: 'slot', id: 'nope' }, { materialSlots: SLOTS, warnings });
    assert.equal(missing, null);
    assert.ok(warnings.some((w) => w.includes('nope')), 'expected a warning for the unresolved slot');
});

test('MaterialSlots: belt slot carries wall tint, surface response, and tiling together', () => {
    const resolved = resolveBuildingConfigMaterials({
        layers: [{
            id: 'floor_belt',
            type: 'floor',
            belt: { enabled: true, material: { kind: 'slot', id: 'trim' } }
        }],
        materialSlots: SLOTS
    });
    const belt = resolved.layers[0].belt;

    assert.deepEqual(belt.material, SLOTS.slots.trim.material);
    assert.deepEqual(belt.wallBase, SLOTS.slots.trim.wallBase);
    assert.deepEqual(belt.tiling, SLOTS.slots.trim.tiling);
});

test('MaterialSlots: slots holding a brick preset resolve through the preset', () => {
    const bundle = resolveMaterialSpecBundle({ kind: 'slot', id: 'wallPrimary' }, { materialSlots: SLOTS, seed: 42 });
    assert.equal(bundle.material.kind, 'texture');
    assert.equal(bundle.material.id, 'pbr.red_brick');
    assert.ok(bundle.brick?.perBrick?.layout?.bricksPerTileY > 0, 'preset brick layout expected');
    assert.ok(bundle.tiling?.enabled, 'preset tiling expected');
});

test('BrickPresetCatalog: covers required colorways and formats', () => {
    const options = getBrickPresetOptions();
    const colorways = new Set(options.map((o) => o.colorway));
    for (const needed of ['red', 'orange', 'brown', 'tan_buff', 'gray', 'painted']) {
        assert.ok(colorways.has(needed), `missing colorway ${needed}`);
    }
    const formats = new Set(options.map((o) => o.format));
    assert.ok(formats.has('standard') && formats.has('roman'), 'expected standard and roman formats');
    // Roman format stretches U relative to V.
    const roman = getBrickPresetById('brick.red_roman');
    assert.ok(roman.tiling.tileMetersU > roman.tiling.tileMetersV, 'roman bricks must be longer than tall');
});

test('BrickPresetCatalog: preset normalization round-trip preserves the bundle', () => {
    for (const opt of getBrickPresetOptions()) {
        assert.ok(isBrickPresetId(opt.id));
        const a = resolveBrickPresetBundle({ presetId: opt.id, seed: 7 });
        const b = resolveBrickPresetBundle({ presetId: opt.id, seed: 7 });
        assert.deepEqual(a, b, `bundle for ${opt.id} must be deterministic`);
        assert.equal(a.material.kind, 'texture');
        assert.ok(a.wallBase.tintHex !== undefined, 'wallBase carries a composed tintHex');
        assert.ok(a.brick.perBrick.layout.bricksPerTileX > 0);
        assert.ok(a.brick.mortar.layout.mortarWidth >= 0);
    }
    assert.equal(resolveBrickPresetBundle({ presetId: 'brick.unknown' }), null);
});

test('BrickPresetCatalog: per-building tint jitter is seeded and bounded', () => {
    const base = resolveBrickPresetBundle({ presetId: 'brick.red_standard', seed: 1 });
    const j1 = resolveBrickPresetBundle({ presetId: 'brick.red_standard', jitter: true, seed: 1 });
    const j1b = resolveBrickPresetBundle({ presetId: 'brick.red_standard', jitter: true, seed: 1 });
    const j2 = resolveBrickPresetBundle({ presetId: 'brick.red_standard', jitter: true, seed: 2 });

    assert.deepEqual(j1.wallBase, j1b.wallBase, 'same seed → same jitter');
    assert.notDeepEqual(j1.wallBase, j2.wallBase, 'different seed → different jitter');

    const preset = getBrickPresetById('brick.red_standard');
    const hueDelta = Math.abs(((j1.wallBase.tintHueDeg - base.wallBase.tintHueDeg + 540) % 360) - 180);
    assert.ok(hueDelta <= preset.tintJitter.hueDeg + 1e-9, 'hue jitter stays within the preset range');
    assert.ok(Math.abs(j1.wallBase.tintValue - base.wallBase.tintValue) <= preset.tintJitter.value + 1e-9);
    assert.ok(Math.abs(j1.wallBase.tintSaturation - base.wallBase.tintSaturation) <= preset.tintJitter.saturation + 1e-9);
});

test('resolveBuildingConfigMaterials: rewrites slot/preset refs across the config', () => {
    const warnings = [];
    const resolved = resolveBuildingConfigMaterials({
        layers: [
            {
                id: 'floor_1',
                type: 'floor',
                material: { kind: 'slot', id: 'wallPrimary' },
                belt: { enabled: true, material: 'slot:trim' },
                cornice: {
                    enabled: true,
                    material: { kind: 'slot', id: 'trim' },
                    ornament: { type: 'dentils', material: { kind: 'match_wall', id: 'match_wall' } }
                },
                banding: { enabled: true, material: { kind: 'slot', id: 'trim' } }
            },
            {
                id: 'roof_1',
                type: 'roof',
                ring: { enabled: true, material: { kind: 'slot', id: 'base' } },
                cornice: { enabled: true, material: { kind: 'slot', id: 'missing_slot' } },
                roof: { material: { kind: 'texture', id: 'pbr.rough_concrete' } }
            }
        ],
        facades: {
            floor_1: {
                A: {
                    layout: {
                        bays: {
                            items: [
                                { id: 'bay_1', wallMaterialOverride: { kind: 'slot', id: 'trim' } },
                                { id: 'bay_2', wallMaterialOverride: { kind: 'texture', id: 'pbr.red_brick' } },
                                { id: 'bay_3', wallMaterialOverride: null }
                            ]
                        }
                    }
                }
            }
        },
        wallDecorations: {
            sets: [{
                id: 'set_1',
                decorations: [{ id: 'decoration_1', state: { materialSelection: { kind: 'slot', id: 'trim' } } }]
            }]
        },
        cornerTreatment: { enabled: true, material: { kind: 'slot', id: 'trim' } },
        windowDefinitions: {
            items: [{
                id: 'def_1',
                decoration: {
                    sill: { enabled: true, material: { mode: 'slot', slotId: 'trim' } },
                    header: { enabled: true, material: { mode: 'slot', slotId: 'missing_slot' } }
                }
            }]
        },
        materialSlots: SLOTS,
        seed: 99,
        warnings
    });

    const floor = resolved.layers[0];
    assert.equal(floor.material.kind, 'texture');
    assert.equal(floor.material.id, 'pbr.red_brick');
    assert.ok(floor.wallBase, 'preset wallBase applied to the layer');
    assert.ok(floor.tiling?.enabled, 'preset tiling applied to the layer');
    assert.equal(floor.materialVariation.enabled, true, 'preset enables material variation for the brick block');
    assert.ok(floor.materialVariation.brick.perBrick.layout.bricksPerTileX > 0);
    assert.deepEqual(floor.belt.material, { kind: 'texture', id: 'pbr.limestone_smooth' });
    assert.deepEqual(floor.belt.wallBase, SLOTS.slots.trim.wallBase);
    assert.deepEqual(floor.belt.tiling, SLOTS.slots.trim.tiling);
    assert.deepEqual(floor.cornice.material, { kind: 'texture', id: 'pbr.limestone_smooth' });
    assert.equal(floor.cornice.ornament.material.kind, 'match_wall', 'match_wall stays legacy');
    assert.deepEqual(floor.banding.material, { kind: 'texture', id: 'pbr.limestone_smooth' });

    const roof = resolved.layers[1];
    assert.deepEqual(roof.ring.material, { kind: 'texture', id: 'pbr.rusticated_ashlar' });
    assert.equal(roof.cornice.material.kind, 'slot', 'unresolved slot spec is left for the legacy fallback');
    assert.ok(warnings.some((w) => w.includes('missing_slot')), 'unresolved slot warns');

    const bays = resolved.facades.floor_1.A.layout.bays.items;
    assert.deepEqual(bays[0].wallMaterialOverride, { kind: 'texture', id: 'pbr.limestone_smooth' });
    assert.deepEqual(bays[1].wallMaterialOverride, { kind: 'texture', id: 'pbr.red_brick' }, 'explicit override untouched');
    assert.equal(bays[2].wallMaterialOverride, null);

    const state = resolved.wallDecorations.sets[0].decorations[0].state;
    assert.deepEqual(state.materialSelection, { kind: 'texture', id: 'pbr.limestone_smooth' });

    assert.deepEqual(resolved.cornerTreatment.material, { kind: 'texture', id: 'pbr.limestone_smooth' });

    const decoration = resolved.windowDefinitions.items[0].decoration;
    assert.deepEqual(decoration.sill.material, { mode: 'pbr', materialId: 'pbr.limestone_smooth' });
    assert.equal(decoration.header.material.mode, 'match_wall', 'unresolved window slot falls back to match_wall');
});

test('resolveBuildingConfigMaterials: does not mutate its inputs', () => {
    const layers = [{ id: 'floor_1', type: 'floor', material: { kind: 'slot', id: 'trim' } }];
    const frozen = JSON.stringify(layers);
    resolveBuildingConfigMaterials({ layers, materialSlots: SLOTS, seed: 1 });
    assert.equal(JSON.stringify(layers), frozen);
});

test('resolveBuildingConfigMaterials: slot jitter varies per building seed', () => {
    const slots = normalizeBuildingMaterialSlotsConfig({
        slots: { wallPrimary: { material: { kind: 'preset', id: 'brick.red_standard', jitter: true } } }
    });
    const layers = [{ id: 'floor_1', type: 'floor', material: { kind: 'slot', id: 'wallPrimary' } }];
    const a = resolveBuildingConfigMaterials({ layers, materialSlots: slots, seed: 101 });
    const b = resolveBuildingConfigMaterials({ layers, materialSlots: slots, seed: 202 });
    const c = resolveBuildingConfigMaterials({ layers, materialSlots: slots, seed: 101 });
    assert.notDeepEqual(a.layers[0].wallBase, b.layers[0].wallBase, 'different buildings get different tints');
    assert.deepEqual(a.layers[0].wallBase, c.layers[0].wallBase, 'same building stays deterministic');
});
