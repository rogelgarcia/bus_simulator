// src/graphics/content3d/buildings/configs/PierGridTower2.js
// City building config: Pier Grid Tower 2 — AI 487 pier/spandrel showcase.
// The ref-7 grid is a recipe over the facade bay system: proud gray-brick
// pier bays at the wall plane, window bays recessed 0.22m carrying the
// limestone `wallAccent` slot (the recessed strip between stacked windows IS
// the spandrel panel), windows inset further by their frame depth, and the
// pier bays terminated by stepped `trim` capitals and flat bases (AI 487's
// new geometry). One slot change recolors piers, spandrels and trim together.

const SHAFT_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_pier_sash',
    assetType: 'window',
    size: { widthMeters: 1.8, heightMeters: 1.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.75,
    width: { minMeters: 1.8, maxMeters: null },
    padding: { leftMeters: 0.1, rightMeters: 0.1 },
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
    size: { widthMeters: 2.2, heightMeters: 2.5 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.85,
    width: { minMeters: 2.2, maxMeters: null },
    padding: { leftMeters: 0, rightMeters: 0 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: true, interior: 'none' },
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
    size: { widthMeters: 1.6, heightMeters: 2.8 },
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
        heightMeters: 2.8,
        verticalGapMeters: 0,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

// Pier: a wall bay at the wall plane, terminated by trim capitals/bases.
function pierBay(id, minMeters, maxMeters) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: maxMeters ?? null },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null,
        capital: {
            top: { enabled: true, profile: 'stepped', height: 0.34, overhang: 0.07, projection: 0.09, material: { kind: 'slot', id: 'trim' } },
            bottom: { enabled: true, profile: 'flat', height: 0.28, overhang: 0.05, projection: 0.07, material: { kind: 'slot', id: 'trim' } }
        }
    };
}

// Recessed window strip: the bay plane between stacked windows is the
// spandrel panel, so the strip carries the accent stone and sits 0.22m
// behind the piers.
function recessedWindowBay(id, widthMeters, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        depth: { left: 0.22, right: 0.22, linked: true },
        wallMaterialOverride: { kind: 'slot', id: 'wallAccent' },
        window
    };
}

function flexBay(id, minMeters) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: null },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null
    };
}

function groundWindowBay(id, widthMeters, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: null,
        window
    };
}

export const PIER_GRID_TOWER_2_BUILDING_CONFIG = Object.freeze({
    id: 'pier_grid_tower_2',
    name: 'Pier Grid Tower 2',
    materialSlots: Object.freeze({
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.gray_standard', jitter: true } },
            wallAccent: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.rusticated_ashlar' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_501',
            type: 'floor',
            floors: 1,
            floorHeight: 4.4,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: {
                enabled: true,
                seedOffset: 5,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.16,
                aoAmount: 0.5,
                wearBottom: { enabled: true, intensity: 0.35, hueDegrees: -25 },
                wearSide: { enabled: true, intensity: 0.45, value: -0.3, width: 0.9, scale: 5.0 }
            },
            belt: {
                enabled: true,
                height: 0.26,
                extrusion: 0.07,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'B', D: 'B' } }
        },
        {
            id: 'floor_502',
            type: 'floor',
            floors: 4,
            floorHeight: 3.2,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: {
                enabled: true,
                seedOffset: 13,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.16,
                aoAmount: 0.55,
                macroLayers: [
                    { enabled: true, intensity: 0.45, value: 0.14, scale: 6.2 },
                    { enabled: false },
                    { enabled: true, value: -0.12, intensity: 0.35, scale: 1.6, coverage: 0.38, hueDegrees: 2, saturation: 0.02 },
                    { enabled: false }
                ],
                wearTop: { enabled: true, value: -0.18, intensity: 0.22 },
                wearBottom: { enabled: true, intensity: 0.22, hueDegrees: -25 },
                wearSide: { enabled: true, intensity: 0.5, value: -0.3, width: 0.9, scale: 5.2 }
            },
            belt: { enabled: false },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.4,
                projection: 0.24,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'dentils',
                    width: 0.14,
                    depth: 0.11,
                    spacing: 0.16,
                    height: 0.14,
                    material: { kind: 'slot', id: 'trim' }
                }
            },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            id: 'roof_503',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.16,
                height: 0.7,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'stepped',
                height: 0.42,
                projection: 0.22,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.18, depth: 0.14, spacing: 0.22, height: 0.22 },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.1,
                        overhang: 0.06,
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
            { x: -10, z: 7.5 },
            { x: 10, z: 7.5 },
            { x: 10, z: -7.5 },
            { x: -10, z: -7.5 }
        ]
    ]),
    floors: 5,
    floorHeight: 3.2,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_501: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 1.1),
                            groundWindowBay('bay_2', 2.2, GROUND_DOOR),
                            flexBay('bay_3', 0.9),
                            groundWindowBay('bay_4', 2.6, GROUND_WINDOW),
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
                            groundWindowBay('bay_2', 2.6, GROUND_WINDOW),
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
        floor_502: {
            A: {
                layout: {
                    bays: {
                        items: [
                            pierBay('bay_1', 0.9, 1.4),
                            recessedWindowBay('bay_2', 2.4, SHAFT_WINDOW),
                            pierBay('bay_3', 0.8, 1.3),
                            recessedWindowBay('bay_4', 2.4, SHAFT_WINDOW),
                            pierBay('bay_5', 0.9, 1.4)
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
                id: 'window_pier_sash',
                assetType: 'window',
                name: 'Dark Sash 2x2 Pier Grid',
                settings: {
                    version: 1,
                    width: 1.8,
                    height: 1.9,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.07,
                        depth: 0.1,
                        inset: 0.07,
                        openBottom: false,
                        colorHex: 0x2e2f31,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.55, metalness: 0.1, envMapIntensity: 0.2, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 2,
                        rows: 2,
                        verticalWidth: 0.045,
                        horizontalWidth: 0.055,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x2e2f31,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.55, metalness: 0.1, envMapIntensity: 0.2, normalStrength: 0.6 }
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
                        colorHex: 0x4d4f4a,
                        fabric: { scale: 7, intensity: 0.18 },
                        zOffset: -0.05
                    },
                    interior: { enabled: true }
                },
                decoration: {
                    sill: {
                        enabled: true,
                        type: 'simple',
                        widthMode: 'pct_10',
                        depthMeters: 0.07,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    header: { enabled: false },
                    jambs: { enabled: false }
                },
                layers: { frame: true, muntins: true, glass: true, shade: true, interior: true }
            }
        ]
    })
});

export default PIER_GRID_TOWER_2_BUILDING_CONFIG;
