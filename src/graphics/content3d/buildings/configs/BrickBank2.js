// src/graphics/content3d/buildings/configs/BrickBank2.js
// City building config: Brick Bank 2 — AI 491 material-slots showcase.
// Every trim feature (window surrounds, cornice, quoins, belt, coping) pulls
// from the `trim` slot, walls from the `wallPrimary` brick preset (with
// per-building tint jitter) and the ground floor from the `base` slot
// (rusticated ashlar), so one slot change recolors the whole building.

const SASH_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_sash_trim_surround',
    assetType: 'window',
    size: { widthMeters: 1.5, heightMeters: 1.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.85,
    width: { minMeters: 1.5, maxMeters: null },
    padding: { leftMeters: 0, rightMeters: 0 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: false, interior: 'res' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 1.9,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const GROUND_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_street_black',
    assetType: 'window',
    size: { widthMeters: 1.9, heightMeters: 2.4 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.9,
    width: { minMeters: 1.9, maxMeters: null },
    padding: { leftMeters: 0, rightMeters: 0 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: true, interior: 'none' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 2.4,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const GROUND_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_wood_arch',
    assetType: 'door',
    size: { widthMeters: 1.6, heightMeters: 2.7 },
    heightMode: 'fixed',
    verticalOffsetMeters: null,
    width: { minMeters: 1.6, maxMeters: null },
    padding: { leftMeters: 0.2, rightMeters: 0.2 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: true },
    visual: { disableShades: true, interior: 'none' },
    top: {
        enabled: false,
        assetType: 'door',
        heightMode: 'fixed',
        heightMeters: 2.7,
        verticalGapMeters: 0,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

function flexBay(id, minMeters) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: null },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null
    };
}

function windowBay(id, widthMeters, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null,
        window
    };
}

export const BRICK_BANK_2_BUILDING_CONFIG = Object.freeze({
    id: 'brick_bank_2',
    name: 'Brick Bank 2',
    materialSlots: Object.freeze({
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.red_standard', jitter: true } },
            wallAccent: { material: { kind: 'texture', id: 'pbr.brownstone' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.rusticated_ashlar' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_301',
            type: 'floor',
            floors: 1,
            floorHeight: 4.6,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: {
                enabled: true,
                seedOffset: 7,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.16,
                aoAmount: 0.5,
                wearBottom: { enabled: true, intensity: 0.35, hueDegrees: -25 },
                wearTop: { enabled: false },
                wearSide: { enabled: true, intensity: 0.5, value: -0.3, width: 0.9, scale: 5.0 }
            },
            belt: {
                enabled: true,
                height: 0.24,
                extrusion: 0.06,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'B', D: 'B' } }
        },
        {
            id: 'floor_302',
            type: 'floor',
            floors: 3,
            floorHeight: 3.3,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: {
                enabled: true,
                seedOffset: 11,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.16,
                aoAmount: 0.55,
                macroLayers: [
                    { enabled: true, intensity: 0.5, value: 0.16, scale: 6.0 },
                    { enabled: false },
                    { enabled: true, value: -0.14, intensity: 0.4, scale: 1.5, coverage: 0.4, hueDegrees: 3, saturation: 0.02 },
                    { enabled: false }
                ],
                wearTop: { enabled: true, value: -0.2, intensity: 0.25 },
                wearBottom: { enabled: true, intensity: 0.25, hueDegrees: -30 },
                wearSide: { enabled: true, intensity: 0.6, value: -0.35, width: 0.9, scale: 5.2 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            id: 'roof_303',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.18,
                height: 0.7,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.5,
                projection: 0.3,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'dentils',
                    width: 0.15,
                    depth: 0.12,
                    spacing: 0.18,
                    height: 0.18,
                    material: { kind: 'slot', id: 'trim' }
                },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.1,
                        overhang: 0.06,
                        material: { kind: 'slot', id: 'trim' }
                    },
                    stepped: { enabled: false }
                }
            },
            roof: {
                type: 'Asphalt',
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                tiling: { enabled: true, tileMeters: 4, tileMetersU: 4, tileMetersV: 4, uvEnabled: true }
            }
        }
    ]),
    footprintLoops: Object.freeze([
        [
            { x: -9, z: 7 },
            { x: 9, z: 7 },
            { x: 9, z: -7 },
            { x: -9, z: -7 }
        ]
    ]),
    cornerTreatment: Object.freeze({
        enabled: true,
        mode: 'quoin_blocks',
        bond: 'matched',
        blockHeight: 0.33,
        longWidth: 0.44,
        shortWidth: 0.27,
        projection: 0.05,
        shortProjectionScale: 0.55,
        rhythm: { mode: 'every_course', zoneCourses: 2, everyFloors: 1 },
        material: { kind: 'slot', id: 'trim' },
        corners: {
            AB: { enabled: true },
            BC: { enabled: true },
            CD: { enabled: true },
            DA: { enabled: true }
        },
        layerIds: ['floor_302']
    }),
    floors: 4,
    floorHeight: 3.3,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_301: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 1.2),
                            windowBay('bay_2', 2.2, GROUND_DOOR),
                            flexBay('bay_3', 0.9),
                            windowBay('bay_4', 2.4, GROUND_WINDOW),
                            flexBay('bay_5', 0.9)
                        ],
                        nextBayIndex: 6
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_3', 'bay_4'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 1.0),
                            windowBay('bay_2', 2.4, GROUND_WINDOW),
                            flexBay('bay_3', 1.0)
                        ],
                        nextBayIndex: 4
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_2', 'bay_3'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            }
        },
        floor_302: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.8),
                            windowBay('bay_2', 1.9, SASH_WINDOW),
                            flexBay('bay_3', 0.9),
                            windowBay('bay_4', 1.9, SASH_WINDOW),
                            flexBay('bay_5', 0.8)
                        ],
                        nextBayIndex: 6
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_3', 'bay_4'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            }
        }
    }),
    windowDefinitions: Object.freeze({
        items: [
            {
                id: 'window_sash_trim_surround',
                assetType: 'window',
                name: 'White Sash 2x2 Trim-Slot Surround',
                settings: {
                    version: 1,
                    width: 1.5,
                    height: 1.9,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.075,
                        depth: 0.09,
                        inset: 0.06,
                        openBottom: false,
                        colorHex: 0xe8e3d5,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.6, metalness: 0, envMapIntensity: 0.15, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 2,
                        rows: 2,
                        verticalWidth: 0.045,
                        horizontalWidth: 0.06,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0xe8e3d5,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.6, metalness: 0, envMapIntensity: 0.15, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.85,
                        tintHex: 1842209,
                        reflection: { metalness: 0, roughness: 0.02, transmission: 0, ior: 1.5, envMapIntensity: 2.5 },
                        zOffset: -0.07
                    },
                    shade: {
                        enabled: true,
                        coverage: 'pct_20',
                        randomizeCoverage: true,
                        direction: 'top_to_bottom',
                        colorHex: 0x565851,
                        fabric: { scale: 7, intensity: 0.18 },
                        zOffset: -0.05
                    },
                    interior: { enabled: true }
                },
                decoration: {
                    sill: {
                        enabled: true,
                        type: 'simple',
                        widthMode: 'pct_15',
                        depthMeters: 0.08,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    header: {
                        enabled: true,
                        type: 'splayed_lintel',
                        widthMode: 'match_window',
                        depthMeters: 0.08,
                        earsMeters: 0.05,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    jambs: {
                        enabled: true,
                        type: 'simple',
                        widthMode: 'match_window',
                        depthMeters: 0.02,
                        runMode: 'sill_to_header',
                        material: { mode: 'slot', slotId: 'trim' }
                    }
                },
                layers: { frame: true, muntins: true, glass: true, shade: true, interior: true }
            }
        ]
    })
});

export default BRICK_BANK_2_BUILDING_CONFIG;
