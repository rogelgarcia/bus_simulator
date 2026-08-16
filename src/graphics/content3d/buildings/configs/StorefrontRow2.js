// src/graphics/content3d/buildings/configs/StorefrontRow2.js
// City building config: Storefront Row 2 — AI 488 street-level showcase.
// Ground floor is a shop row built from first-class storefront assets
// (bulkhead + display glazing with shop parallax + backlit transom + sign
// fascia) repeated between rusticated piers, with a grand arched entrance
// portal (recessed entry, limestone arched-band surround at portal scale,
// entry steps) at the left. Awnings ride the existing wall decorator on the
// storefront bays. Upper floors are red brick with stone-surround sashes.

const STOREFRONT_UNIT = Object.freeze({
    enabled: true,
    defId: 'storefront_black_backlit',
    assetType: 'storefront',
    size: { widthMeters: 4.1, heightMeters: 4.2 },
    heightMode: 'full',
    verticalOffsetMeters: null,
    width: { minMeters: 3.0, maxMeters: null },
    padding: { leftMeters: 0.15, rightMeters: 0.15 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: true, interior: 'shop' },
    top: {
        enabled: false,
        assetType: 'storefront',
        heightMode: 'fixed',
        heightMeters: 2.0,
        verticalGapMeters: 0,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const PORTAL_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_portal_arch',
    assetType: 'door',
    size: { widthMeters: 2.2, heightMeters: 3.5 },
    heightMode: 'fixed',
    verticalOffsetMeters: null,
    width: { minMeters: 2.2, maxMeters: null },
    padding: { leftMeters: 0.3, rightMeters: 0.3 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
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

const SIDE_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_street_black',
    assetType: 'window',
    size: { widthMeters: 2.4, heightMeters: 2.6 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.8,
    width: { minMeters: 2.4, maxMeters: null },
    padding: { leftMeters: 0.1, rightMeters: 0.1 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: true, interior: 'shop' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 2.6,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const UPPER_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_white_sash_2x2_stone_surround',
    assetType: 'window',
    size: { widthMeters: 1.6, heightMeters: 1.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.75,
    width: { minMeters: 1.6, maxMeters: null },
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

const AWNING_STATE = Object.freeze({
    version: 1,
    decoratorId: 'awning',
    whereToApply: 'entire_facade',
    mode: 'face',
    position: 'near_top',
    configuration: {
        projectionMeters: 0.85,
        frontHeightMeters: 0.3,
        slopeDegrees: 24,
        rodRadiusMeters: 0.015,
        rodInsetMeters: 0.08,
        rodMaterialId: 'metal_dark',
        nearEdgeOffsetMeters: 0.12
    },
    materialSelection: {
        kind: 'match_wall',
        id: 'match_wall'
    },
    wallBase: {
        roughness: 0.85,
        normalStrength: 0.9,
        tintHueDeg: 0,
        tintSaturation: 0,
        tintValue: 1,
        tintIntensity: 1,
        tintBrightness: 1,
        tintHex: 16777215
    },
    tiling: {
        enabled: false,
        tileMeters: 2,
        tileMetersU: 2,
        tileMetersV: 2,
        uvEnabled: true,
        offsetU: 0,
        offsetV: 0,
        rotationDegrees: 0
    },
    materialVariation: {
        enabled: false,
        seedOffset: 0
    },
    color: 'default'
});

export const STOREFRONT_ROW_2_BUILDING_CONFIG = Object.freeze({
    id: 'storefront_row_2',
    name: 'Storefront Row 2',
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
            id: 'floor_601',
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
                wearSide: { enabled: true, intensity: 0.45, value: -0.3, width: 0.9, scale: 5.0 }
            },
            belt: { enabled: false },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.34,
                projection: 0.2,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.14, depth: 0.11, spacing: 0.16, height: 0.14 }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'B', D: 'B' } }
        },
        {
            id: 'floor_602',
            type: 'floor',
            floors: 2,
            floorHeight: 3.1,
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
                wearTop: { enabled: true, value: -0.18, intensity: 0.22 },
                wearBottom: { enabled: true, intensity: 0.22, hueDegrees: -25 },
                wearSide: { enabled: true, intensity: 0.5, value: -0.3, width: 0.9, scale: 5.2 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            id: 'roof_603',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.16,
                height: 0.65,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'stepped',
                height: 0.38,
                projection: 0.2,
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
            { x: -12, z: 7 },
            { x: 12, z: 7 },
            { x: 12, z: -7 },
            { x: -12, z: -7 }
        ]
    ]),
    floors: 3,
    floorHeight: 3.1,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_601: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.7, 1.2),
                            openingBay('bay_2', 3.0, PORTAL_DOOR),
                            flexBay('bay_3', 0.7, 1.2),
                            openingBay('bay_4', 4.4, STOREFRONT_UNIT),
                            flexBay('bay_5', 0.7, 1.2)
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
                            flexBay('bay_1', 0.9),
                            openingBay('bay_2', 2.8, SIDE_WINDOW),
                            flexBay('bay_3', 0.9)
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
        floor_602: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.6),
                            openingBay('bay_2', 2.1, UPPER_WINDOW),
                            flexBay('bay_3', 0.6)
                        ],
                        nextBayIndex: 4
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_1', 'bay_2'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            }
        }
    }),
    // Awnings ride the existing wall decorator; they sit on the side windows
    // so the front elevation keeps the storefront anatomy (backlit transom +
    // fascia) unobstructed.
    wallDecorations: Object.freeze({
        sets: [
            {
                id: 'set_1',
                target: {
                    layerId: 'floor_601',
                    bayRefs: ['B:bay_2', 'D:bay_2'],
                    allBays: false
                },
                floorInterval: { every: 1, start: 0, end: 0 },
                decorations: [
                    {
                        id: 'decoration_1',
                        span: { start: 0, end: 1 },
                        state: AWNING_STATE
                    }
                ]
            }
        ]
    }),
    windowDefinitions: Object.freeze({
        items: [
            {
                id: 'door_portal_arch',
                assetType: 'door',
                name: 'Arched Portal Entry',
                settings: {
                    version: 1,
                    width: 2.2,
                    height: 3.5,
                    arch: {
                        enabled: true,
                        heightRatio: 0.2,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.09,
                        verticalWidth: 0.09,
                        horizontalWidth: 0.09,
                        depth: 0.11,
                        inset: 0.02,
                        openBottom: true,
                        addHandles: true,
                        handleMaterialMode: 'match',
                        doorStyle: 'double',
                        doorBottomFrame: { enabled: true, mode: 'match' },
                        doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                        colorHex: 0x3a2c1e,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.6, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 2,
                        rows: 3,
                        verticalWidth: 0.05,
                        horizontalWidth: 0.05,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x3a2c1e,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.6, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.72,
                        tintHex: 0x20262b,
                        reflection: { metalness: 0, roughness: 0.05, transmission: 0, ior: 1.5, envMapIntensity: 2 },
                        zOffset: -0.06
                    },
                    shade: { enabled: false },
                    interior: { enabled: false }
                },
                portal: {
                    enabled: true,
                    recessMeters: 0.5,
                    steps: {
                        count: 3,
                        riseMeters: 0.15,
                        treadDepthMeters: 0.34,
                        widthPaddingMeters: 0.35,
                        material: { mode: 'pbr', materialId: 'pbr.limestone_smooth' }
                    }
                },
                decoration: {
                    sill: { enabled: false },
                    header: {
                        enabled: true,
                        type: 'arched_band',
                        widthMode: 'match_window',
                        depthMeters: 0.14,
                        heightMeters: 0.34,
                        earsMeters: 0,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    jambs: {
                        enabled: true,
                        type: 'simple',
                        widthMode: 'match_window',
                        depthMeters: 0.14,
                        heightMeters: 0.3,
                        runMode: 'sill_to_header',
                        material: { mode: 'slot', slotId: 'trim' }
                    }
                },
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: false }
            }
        ]
    })
});

export default STOREFRONT_ROW_2_BUILDING_CONFIG;
