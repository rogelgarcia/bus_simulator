// src/graphics/content3d/buildings/configs/BandedLoft2.js
// City building config: Banded Loft 2 — AI 491 facade-banding showcase.
// Upper walls alternate the wallPrimary brick with limestone bands (the
// ref-16 mid-block striped look) via the floor layer's `banding` option; the
// ground floor sits on rusticated ashlar from the `base` slot.

const LOFT_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_white_sash_2x2',
    assetType: 'window',
    size: { widthMeters: 1.6, heightMeters: 1.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.8,
    width: { minMeters: 1.6, maxMeters: null },
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

const STREET_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_street_black',
    assetType: 'window',
    size: { widthMeters: 2.0, heightMeters: 2.4 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.85,
    width: { minMeters: 2.0, maxMeters: null },
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

const STREET_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_black_tall',
    assetType: 'door',
    size: { widthMeters: 1.5, heightMeters: 2.8 },
    heightMode: 'fixed',
    verticalOffsetMeters: null,
    width: { minMeters: 1.5, maxMeters: null },
    padding: { leftMeters: 0.15, rightMeters: 0.15 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: true },
    visual: { disableShades: true, interior: 'none' },
    top: {
        enabled: false,
        assetType: 'door',
        heightMode: 'fixed',
        heightMeters: 2.8,
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

export const BANDED_LOFT_2_BUILDING_CONFIG = Object.freeze({
    id: 'banded_loft_2',
    name: 'Banded Loft 2',
    materialSlots: Object.freeze({
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.red_standard', jitter: true } },
            wallAccent: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.rusticated_ashlar' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_401',
            type: 'floor',
            floors: 1,
            floorHeight: 4.4,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: {
                enabled: true,
                seedOffset: 3,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.16,
                aoAmount: 0.5,
                wearBottom: { enabled: true, intensity: 0.35, hueDegrees: -25 },
                wearSide: { enabled: true, intensity: 0.5, value: -0.3, width: 0.9, scale: 5.0 }
            },
            belt: {
                enabled: true,
                height: 0.22,
                extrusion: 0.05,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'B', D: 'B' } }
        },
        {
            id: 'floor_402',
            type: 'floor',
            floors: 4,
            floorHeight: 3.1,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            banding: {
                enabled: true,
                unit: 'meters',
                primaryHeight: 1.75,
                secondaryHeight: 0.45,
                offset: 0.0,
                material: { kind: 'slot', id: 'wallAccent' }
            },
            materialVariation: {
                enabled: true,
                seedOffset: 9,
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
                streaks: { enabled: true, strength: 0.5, value: -0.35, scale: 6.5 },
                wearTop: { enabled: true, value: -0.2, intensity: 0.25 },
                wearBottom: { enabled: true, intensity: 0.25, hueDegrees: -30 },
                wearSide: { enabled: true, intensity: 0.55, value: -0.35, width: 0.9, scale: 5.2 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            id: 'roof_403',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.18,
                height: 0.6,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'stepped',
                height: 0.5,
                projection: 0.26,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none' },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.1,
                        overhang: 0.05,
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
    floors: 5,
    floorHeight: 3.1,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_401: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 1.1),
                            windowBay('bay_2', 2.0, STREET_DOOR),
                            flexBay('bay_3', 0.9),
                            windowBay('bay_4', 2.5, STREET_WINDOW),
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
                            windowBay('bay_2', 2.5, STREET_WINDOW),
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
        floor_402: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.8),
                            windowBay('bay_2', 2.0, LOFT_WINDOW),
                            flexBay('bay_3', 0.9),
                            windowBay('bay_4', 2.0, LOFT_WINDOW),
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
    })
});

export default BANDED_LOFT_2_BUILDING_CONFIG;
