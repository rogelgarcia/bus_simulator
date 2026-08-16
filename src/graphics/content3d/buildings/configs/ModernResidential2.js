// src/graphics/content3d/buildings/configs/ModernResidential2.js
// City building config: Modern Residential 2 — AI 489 balcony showcase.
// Ref-4 recipe over the bay system: dark concrete massing with projecting
// glass balconies (cantilever slabs + glass railing kit), recessed balconies
// in massing notches (negative bay depth; the balcony furnishes the notch
// floor, front glass rail and soffit; the notch back wall carries the warm
// accent slot), full-height glazed balcony sliders behind every balcony, and
// punched dark windows between. The A/B corner pairs a recessed bay at the
// end of A with one at the start of B, so the notch opens around the corner
// and adjacency gives each balcony exactly one side cover there.

const BALCONY_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_balcony_glide',
    assetType: 'door',
    size: { widthMeters: 2.4, heightMeters: 2.5 },
    heightMode: 'full',
    verticalOffsetMeters: null,
    width: { minMeters: 2.4, maxMeters: null },
    padding: { leftMeters: 0.5, rightMeters: 0.5 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: false },
    visual: { disableShades: false, interior: 'res' },
    top: {
        enabled: false,
        assetType: 'door',
        heightMode: 'fixed',
        heightMeters: 2.5,
        verticalGapMeters: 0,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const PUNCHED_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_street_black',
    assetType: 'window',
    size: { widthMeters: 1.5, heightMeters: 1.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.55,
    width: { minMeters: 1.5, maxMeters: null },
    padding: { leftMeters: 0.25, rightMeters: 0.25 },
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
    size: { widthMeters: 2.4, heightMeters: 2.5 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.5,
    width: { minMeters: 2.4, maxMeters: null },
    padding: { leftMeters: 0.2, rightMeters: 0.2 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: true, interior: 'res' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 2.5,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const GROUND_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_black_tall',
    assetType: 'door',
    size: { widthMeters: 1.8, heightMeters: 2.7 },
    heightMode: 'fixed',
    verticalOffsetMeters: null,
    width: { minMeters: 1.8, maxMeters: null },
    padding: { leftMeters: 0.3, rightMeters: 0.3 },
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

// Projecting glass balcony bay: cantilever slab + glass railing kit, with a
// full-height glazed slider behind it.
function projectingBalconyBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null,
        window: BALCONY_DOOR,
        balcony: {
            enabled: true,
            presetId: 'balcony.modern_glass_projecting',
            platform: { material: { kind: 'slot', id: 'trim' } }
        }
    };
}

// Recessed balcony bay: the notch comes from the bay's own negative depth;
// the balcony furnishes it. The notch back wall carries the warm accent slot
// and the platform/soffit repeat it (the wood-lined-notch read from ref 4).
function recessedBalconyBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        depth: { left: -1.6, right: -1.6, linked: true },
        wallMaterialOverride: { kind: 'slot', id: 'wallAccent' },
        window: BALCONY_DOOR,
        balcony: {
            enabled: true,
            presetId: 'balcony.modern_recessed',
            platform: { material: { kind: 'slot', id: 'wallAccent' } }
        }
    };
}

function punchedWindowBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: { kind: 'slot', id: 'wallLight' },
        window: PUNCHED_WINDOW
    };
}

function flexBay(id, minMeters, maxMeters) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: maxMeters ?? null },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null
    };
}

function openingBay(id, widthMeters, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null,
        window
    };
}

export const MODERN_RESIDENTIAL_2_BUILDING_CONFIG = Object.freeze({
    id: 'modern_residential_2',
    name: 'Modern Residential 2',
    materialSlots: Object.freeze({
        slots: {
            // Ref-4 palette: charcoal massing, warm accent block (wood-tone
            // read), white punched-window volumes, dark plinth, light slabs.
            wallPrimary: {
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                wallBase: { roughness: 0.85, normalStrength: 0.9, tintHex: 0x5e6165 }
            },
            wallAccent: {
                material: { kind: 'texture', id: 'pbr.seaworn_sandstone_brick' },
                wallBase: { roughness: 0.85, normalStrength: 0.9, tintHex: 0xc9a878 }
            },
            wallLight: { material: { kind: 'texture', id: 'pbr.plastered_wall_02' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: {
                material: { kind: 'texture', id: 'pbr.patterned_concrete_wall' },
                wallBase: { roughness: 0.85, normalStrength: 0.9, tintHex: 0x4d4f53 }
            }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_701',
            type: 'floor',
            floors: 1,
            floorHeight: 3.6,
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
                wearBottom: { enabled: true, intensity: 0.3, hueDegrees: -20 },
                wearSide: { enabled: true, intensity: 0.35, value: -0.25, width: 0.9, scale: 5.0 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_702',
            type: 'floor',
            floors: 5,
            floorHeight: 3.0,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: {
                enabled: true,
                seedOffset: 9,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.16,
                aoAmount: 0.5,
                wearTop: { enabled: true, value: -0.12, intensity: 0.18 },
                wearSide: { enabled: true, intensity: 0.35, value: -0.22, width: 0.9, scale: 5.0 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'roof_703',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.12,
                height: 0.5,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'flat',
                height: 0.22,
                projection: 0.1,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.18, depth: 0.14, spacing: 0.22, height: 0.22 },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.08,
                        overhang: 0.05,
                        material: { kind: 'slot', id: 'trim' }
                    },
                    stepped: { enabled: false, mode: 'corners', blockWidth: 0.9, raise: 0.45 }
                }
            },
            roof: {
                type: 'Asphalt',
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                tiling: {
                    enabled: true,
                    tileMeters: 4,
                    tileMetersU: 4,
                    tileMetersV: 4,
                    uvEnabled: true,
                    offsetU: 0,
                    offsetV: 0,
                    rotationDegrees: 0
                },
                color: 'default'
            }
        }
    ]),
    footprintLoops: Object.freeze([
        [
            { x: -14, z: 8 },
            { x: 14, z: 8 },
            { x: 14, z: -8 },
            { x: -14, z: -8 }
        ]
    ]),
    floors: 6,
    floorHeight: 3.0,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_701: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.6),
                            openingBay('bay_2', 2.6, GROUND_DOOR),
                            flexBay('bay_3', 0.6),
                            openingBay('bay_4', 3.0, GROUND_WINDOW),
                            flexBay('bay_5', 0.6)
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
                            flexBay('bay_1', 0.8),
                            openingBay('bay_2', 3.0, GROUND_WINDOW),
                            flexBay('bay_3', 0.8)
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
        floor_702: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.5, 1.0),
                            projectingBalconyBay('bay_2', 3.6),
                            flexBay('bay_3', 0.4, 0.9),
                            punchedWindowBay('bay_4', 2.2),
                            flexBay('bay_5', 0.4, 0.9),
                            recessedBalconyBay('bay_6', 3.6)
                        ],
                        nextBayIndex: 7
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_2', 'bay_3', 'bay_4', 'bay_5'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            recessedBalconyBay('bay_1', 3.6),
                            flexBay('bay_2', 0.5, 1.1),
                            punchedWindowBay('bay_3', 2.2),
                            flexBay('bay_4', 0.5, 1.1),
                            projectingBalconyBay('bay_5', 3.4),
                            flexBay('bay_6', 0.5, 1.1)
                        ],
                        nextBayIndex: 7
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_2', 'bay_3'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            }
        }
    })
});

export default MODERN_RESIDENTIAL_2_BUILDING_CONFIG;
