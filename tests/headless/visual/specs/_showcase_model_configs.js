// Three showcase building models for the facade/bay engine (engine 2).
// NOT part of the game catalog: they exist to exercise the feature families in
// coherent designs and are rendered through the building_showcase harness
// scenario via configOverrides. Plain JSON-able data — the capture spec passes
// them into the page with page.evaluate.
//
//   1. Arcade Mercantile Hall — arcade group with shared springing + impost,
//      arched portal, quoins, dentil cornice, water tower.
//   2. Cathedral Setback Tower — setback tiers, proud-pier grid, edge bevels
//      on every convex arris, banded crown, stepped parapet, terrace props.
//   3. Garden Court Apartments — the three balcony presets used by role,
//      entry portal with steps, garage, fire escape, AC scatter.

const MATVAR_WALL = (seedOffset) => ({
    enabled: true,
    seedOffset,
    root: 'wall',
    space: 'world',
    worldSpaceScale: 0.16,
    aoAmount: 0.55,
    wearTop: { enabled: true, value: -0.18, intensity: 0.22 },
    wearBottom: { enabled: true, intensity: 0.28, hueDegrees: -25 },
    wearSide: { enabled: true, intensity: 0.45, value: -0.3, width: 0.9, scale: 5.0 }
});

const openingCommon = {
    heightMode: 'fixed',
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
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
};

const flexBay = (id, minMeters, maxMeters = null) => ({
    id,
    size: { mode: 'range', minMeters, maxMeters },
    expandPreference: 'prefer_expand',
    wallMaterialOverride: null
});

const openingBay = (id, widthMeters, window, extra = {}) => ({
    id,
    size: { mode: 'fixed', widthMeters },
    expandPreference: 'prefer_expand',
    wallMaterialOverride: null,
    window,
    ...extra
});

// ---------------------------------------------------------------------------
// 1. Arcade Mercantile Hall
// ---------------------------------------------------------------------------

const AH_ARCH_WINDOW = {
    enabled: true,
    defId: 'window_arch_civic',
    assetType: 'window',
    size: { widthMeters: 2.5, heightMeters: 3.4 },
    verticalOffsetMeters: 0.5,
    width: { minMeters: 2.5, maxMeters: null },
    padding: { leftMeters: 0.12, rightMeters: 0.12 },
    visual: { disableShades: true, interior: 'shop' },
    ...openingCommon
};

const AH_PORTAL_DOOR = {
    enabled: true,
    defId: 'door_hall_portal',
    assetType: 'door',
    size: { widthMeters: 2.4, heightMeters: 3.6 },
    verticalOffsetMeters: null,
    width: { minMeters: 2.4, maxMeters: null },
    padding: { leftMeters: 0.3, rightMeters: 0.3 },
    visual: { disableShades: true, interior: 'none' },
    ...openingCommon
};

const AH_SASH_WINDOW = {
    enabled: true,
    defId: 'window_white_sash_2x2_stone_surround',
    assetType: 'window',
    size: { widthMeters: 1.7, heightMeters: 2.0 },
    verticalOffsetMeters: 0.75,
    width: { minMeters: 1.7, maxMeters: null },
    padding: { leftMeters: 0.12, rightMeters: 0.12 },
    visual: { disableShades: false, interior: 'res' },
    ...openingCommon
};

const AH_SIDE_ARCH_WINDOW = {
    ...AH_ARCH_WINDOW,
    size: { widthMeters: 2.2, heightMeters: 3.2 },
    width: { minMeters: 2.2, maxMeters: null }
};

export const ARCADE_HALL_CONFIG = {
    name: 'Arcade Mercantile Hall',
    footprintLoops: [
        [
            { x: -13, z: 7 },
            { x: 13, z: 7 },
            { x: 13, z: -7 },
            { x: -13, z: -7 }
        ]
    ],
    floors: 4,
    floorHeight: 3.3,
    style: 'default',
    windows: null,
    materialSlots: {
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.red_standard', jitter: true } },
            wallAccent: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.rusticated_ashlar' } }
        }
    },
    layers: [
        {
            id: 'floor_ah1',
            type: 'floor',
            floors: 1,
            floorHeight: 5.0,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: MATVAR_WALL(3),
            belt: { enabled: false },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.32,
                projection: 0.18,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.14, depth: 0.11, spacing: 0.16, height: 0.14 }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'B', D: 'B' } }
        },
        {
            id: 'floor_ah2',
            type: 'floor',
            floors: 3,
            floorHeight: 3.3,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR_WALL(11),
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            id: 'roof_ah3',
            type: 'roof',
            props: {
                enabled: true,
                density: 0.7,
                edgeMarginMeters: 1.2,
                minSpacingMeters: 1.0,
                seedOffset: 5,
                types: ['water_tower', 'vent_pipe'],
                placements: [],
                materials: { tank: null, frame: null, bulkhead: null, mech: null }
            },
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.16,
                height: 0.7,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.42,
                projection: 0.26,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'dentils',
                    width: 0.14,
                    depth: 0.11,
                    spacing: 0.16,
                    height: 0.14,
                    material: { kind: 'slot', id: 'trim' }
                },
                parapet: {
                    coping: { enabled: true, height: 0.1, overhang: 0.06, material: { kind: 'slot', id: 'trim' } },
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
    ],
    facades: {
        floor_ah1: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.9, 2.4),
                            openingBay('bay_2', 3.0, AH_PORTAL_DOOR),
                            flexBay('bay_3', 0.8, 1.6),
                            openingBay('bay_4', 2.8, AH_ARCH_WINDOW),
                            flexBay('bay_5', 0.8, 2.4)
                        ],
                        nextBayIndex: 6
                    },
                    groups: {
                        items: [
                            {
                                id: 'group_1',
                                bayIds: ['bay_3', 'bay_4'],
                                repeat: { minRepeats: 2, maxRepeats: 'auto' },
                                arcade: {
                                    enabled: true,
                                    springing: { mode: 'auto', offsetMeters: null },
                                    impost: {
                                        enabled: true,
                                        heightMeters: 0.16,
                                        projectionMeters: 0.08,
                                        overhangMeters: 0.04,
                                        material: { kind: 'slot', id: 'trim' }
                                    }
                                }
                            }
                        ],
                        nextGroupIndex: 2
                    }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.9, 2.2),
                            openingBay('bay_2', 2.5, AH_SIDE_ARCH_WINDOW),
                            flexBay('bay_3', 0.9, 2.0)
                        ],
                        nextBayIndex: 4
                    },
                    groups: {
                        items: [
                            {
                                id: 'group_1',
                                bayIds: ['bay_2', 'bay_3'],
                                repeat: { minRepeats: 1, maxRepeats: 'auto' },
                                arcade: {
                                    enabled: true,
                                    springing: { mode: 'auto', offsetMeters: null },
                                    impost: {
                                        enabled: true,
                                        heightMeters: 0.16,
                                        projectionMeters: 0.08,
                                        overhangMeters: 0.04,
                                        material: { kind: 'slot', id: 'trim' }
                                    }
                                }
                            }
                        ],
                        nextGroupIndex: 2
                    }
                }
            }
        },
        floor_ah2: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.5, 1.1),
                            openingBay('bay_2', 2.1, AH_SASH_WINDOW),
                            flexBay('bay_3', 0.5, 1.8)
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
    },
    cornerTreatment: {
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
        layerIds: ['floor_ah2']
    },
    windowDefinitions: {
        items: [
            {
                id: 'door_hall_portal',
                assetType: 'door',
                name: 'Hall Arched Portal',
                settings: {
                    version: 1,
                    width: 2.4,
                    height: 3.6,
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
                        colorHex: 0x2f3b33,
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
                        colorHex: 0x2f3b33,
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
    }
};

// ---------------------------------------------------------------------------
// 2. Cathedral Setback Tower
// ---------------------------------------------------------------------------

const ST_STREET_WINDOW = {
    enabled: true,
    defId: 'window_street_black',
    assetType: 'window',
    size: { widthMeters: 2.4, heightMeters: 2.6 },
    verticalOffsetMeters: 0.8,
    width: { minMeters: 2.4, maxMeters: null },
    padding: { leftMeters: 0.1, rightMeters: 0.1 },
    visual: { disableShades: true, interior: 'shop' },
    ...openingCommon
};

const ST_ENTRY_DOOR = {
    enabled: true,
    defId: 'door_black_tall',
    assetType: 'door',
    size: { widthMeters: 1.8, heightMeters: 3.0 },
    verticalOffsetMeters: null,
    width: { minMeters: 1.8, maxMeters: null },
    padding: { leftMeters: 0.25, rightMeters: 0.25 },
    visual: { disableShades: true, interior: 'none' },
    ...openingCommon
};

const ST_SHAFT_WINDOW = {
    enabled: true,
    defId: 'window_black_6_panels_tall',
    assetType: 'window',
    size: { widthMeters: 1.7, heightMeters: 2.2 },
    verticalOffsetMeters: 0.6,
    width: { minMeters: 1.7, maxMeters: null },
    padding: { leftMeters: 0.1, rightMeters: 0.1 },
    visual: { disableShades: false, interior: 'res' },
    ...openingCommon
};

// Proud pier grid: piers stay at the wall plane with stepped capitals, window
// bays recess behind them; the edge bevel chamfers every pier arris.
const stPierBay = (id, minMeters, maxMeters) => ({
    id,
    size: { mode: 'range', minMeters, maxMeters },
    expandPreference: 'prefer_expand',
    wallMaterialOverride: null,
    capital: {
        top: { enabled: true, profile: 'stepped', height: 0.32, overhang: 0.06, projection: 0.08, material: { kind: 'slot', id: 'trim' } },
        bottom: { enabled: true, profile: 'flat', height: 0.24, overhang: 0.04, projection: 0.06, material: { kind: 'slot', id: 'trim' } }
    }
});

const stShaftWindowBay = (id, widthMeters) => ({
    id,
    size: { mode: 'fixed', widthMeters },
    expandPreference: 'prefer_expand',
    depth: { left: -0.35, right: -0.35, linked: true },
    wallMaterialOverride: { kind: 'slot', id: 'wallAccent' },
    window: ST_SHAFT_WINDOW
});

const ST_SHAFT_FACE = {
    layout: {
        bays: {
            items: [
                stPierBay('bay_1', 0.8, 1.6),
                stShaftWindowBay('bay_2', 2.2),
                stPierBay('bay_3', 0.7, 1.5),
                stShaftWindowBay('bay_4', 2.2),
                stPierBay('bay_5', 0.8, 1.6)
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
};

const ST_ROOF_TERRACE = (id, types, seedOffset, corniceHeight = 0.34) => ({
    id,
    type: 'roof',
    props: {
        enabled: true,
        density: 0.8,
        edgeMarginMeters: 1.0,
        minSpacingMeters: 0.9,
        seedOffset,
        types,
        placements: [],
        materials: { tank: null, frame: null, bulkhead: null, mech: null }
    },
    ring: {
        enabled: true,
        innerRadius: 0.28,
        outerRadius: 0.15,
        height: 0.6,
        material: { kind: 'slot', id: 'wallPrimary' }
    },
    cornice: {
        enabled: true,
        profile: 'stepped',
        height: corniceHeight,
        projection: 0.18,
        material: { kind: 'slot', id: 'trim' },
        ornament: { type: 'none', width: 0.18, depth: 0.14, spacing: 0.22, height: 0.22 },
        parapet: {
            coping: { enabled: true, height: 0.09, overhang: 0.05, material: { kind: 'slot', id: 'trim' } },
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
});

export const SETBACK_TOWER_CONFIG = {
    name: 'Cathedral Setback Tower',
    footprintLoops: [
        [
            { x: -9.5, z: 9.5 },
            { x: 9.5, z: 9.5 },
            { x: 9.5, z: -9.5 },
            { x: -9.5, z: -9.5 }
        ]
    ],
    floors: 10,
    floorHeight: 3.2,
    style: 'default',
    windows: null,
    materialSlots: {
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.buff_standard', jitter: true } },
            wallAccent: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.rusticated_ashlar' } }
        }
    },
    edgeBevel: {
        enabled: true,
        scope: 'all_convex_edges',
        widthMeters: 0.07,
        includeConcave: false
    },
    layers: [
        {
            id: 'floor_st1',
            type: 'floor',
            floors: 1,
            floorHeight: 4.6,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: MATVAR_WALL(7),
            belt: {
                enabled: true,
                height: 0.26,
                extrusion: 0.08,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'B', D: 'B' } }
        },
        {
            id: 'floor_st2',
            type: 'floor',
            floors: 4,
            floorHeight: 3.2,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR_WALL(13),
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        ST_ROOF_TERRACE('roof_st2t', ['mech_box', 'vent_pipe'], 21),
        {
            id: 'floor_st3',
            type: 'floor',
            floors: 3,
            floorHeight: 3.2,
            planOffset: 2.2,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR_WALL(17),
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        ST_ROOF_TERRACE('roof_st3t', ['vent_pipe'], 33),
        {
            id: 'floor_st4',
            type: 'floor',
            floors: 2,
            floorHeight: 3.2,
            planOffset: 4.4,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR_WALL(23),
            banding: {
                enabled: true,
                unit: 'meters',
                primaryHeight: 2.1,
                secondaryHeight: 0.5,
                offset: 0.0,
                material: { kind: 'slot', id: 'wallAccent' }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            id: 'roof_st5',
            type: 'roof',
            props: {
                enabled: true,
                density: 0.7,
                edgeMarginMeters: 0.8,
                minSpacingMeters: 0.8,
                seedOffset: 41,
                types: ['roof_bulkhead', 'vent_pipe'],
                placements: [],
                materials: { tank: null, frame: null, bulkhead: null, mech: null }
            },
            ring: {
                enabled: true,
                innerRadius: 0.28,
                outerRadius: 0.15,
                height: 0.7,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'stepped',
                height: 0.4,
                projection: 0.2,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.18, depth: 0.14, spacing: 0.22, height: 0.22 },
                parapet: {
                    coping: { enabled: true, height: 0.1, overhang: 0.06, material: { kind: 'slot', id: 'trim' } },
                    stepped: { enabled: true, mode: 'corners', blockWidth: 0.9, raise: 0.45 }
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
    ],
    facades: {
        floor_st1: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 1.0, 2.2),
                            openingBay('bay_2', 2.4, ST_ENTRY_DOOR),
                            flexBay('bay_3', 0.9, 1.8),
                            openingBay('bay_4', 2.8, ST_STREET_WINDOW),
                            flexBay('bay_5', 0.9, 2.2)
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
                            flexBay('bay_1', 1.0, 2.2),
                            openingBay('bay_2', 2.8, ST_STREET_WINDOW),
                            flexBay('bay_3', 1.0, 2.0)
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
        floor_st2: { A: ST_SHAFT_FACE },
        floor_st3: { A: ST_SHAFT_FACE },
        floor_st4: {
            A: {
                layout: {
                    bays: {
                        items: [
                            stPierBay('bay_1', 0.7, 1.9),
                            stShaftWindowBay('bay_2', 2.1),
                            stPierBay('bay_3', 0.7, 1.9)
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
        }
    },
    windowDefinitions: null
};

// ---------------------------------------------------------------------------
// 3. Garden Court Apartments
// ---------------------------------------------------------------------------

const GC_ENTRY_DOOR = {
    enabled: true,
    defId: 'door_court_entry',
    assetType: 'door',
    size: { widthMeters: 1.7, heightMeters: 2.9 },
    verticalOffsetMeters: null,
    width: { minMeters: 1.7, maxMeters: null },
    padding: { leftMeters: 0.25, rightMeters: 0.25 },
    visual: { disableShades: true, interior: 'none' },
    ...openingCommon
};

const GC_STREET_WINDOW = {
    enabled: true,
    defId: 'window_white_sash_2x2',
    assetType: 'window',
    size: { widthMeters: 1.6, heightMeters: 1.9 },
    verticalOffsetMeters: 0.85,
    width: { minMeters: 1.6, maxMeters: null },
    padding: { leftMeters: 0.12, rightMeters: 0.12 },
    visual: { disableShades: false, interior: 'res' },
    ...openingCommon
};

const GC_GARAGE = {
    enabled: true,
    defId: 'garage_black_panel_wide',
    assetType: 'garage',
    size: { widthMeters: 2.8, heightMeters: 2.6 },
    verticalOffsetMeters: null,
    width: { minMeters: 2.8, maxMeters: null },
    padding: { leftMeters: 0.2, rightMeters: 0.2 },
    visual: { disableShades: true, interior: 'none' },
    ...openingCommon
};

const GC_BALCONY_DOOR = {
    enabled: true,
    defId: 'door_balcony_glide',
    assetType: 'door',
    size: { widthMeters: 2.2, heightMeters: 2.4 },
    heightMode: 'full',
    verticalOffsetMeters: null,
    width: { minMeters: 2.2, maxMeters: null },
    padding: { leftMeters: 0.3, rightMeters: 0.3 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: false },
    visual: { disableShades: false, interior: 'res' },
    top: {
        enabled: false,
        assetType: 'door',
        heightMode: 'fixed',
        heightMeters: 2.4,
        verticalGapMeters: 0,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
};

const GC_JULIET_WINDOW = {
    enabled: true,
    defId: 'window_white_sash_2x2',
    assetType: 'window',
    size: { widthMeters: 1.6, heightMeters: 2.1 },
    verticalOffsetMeters: 0.35,
    width: { minMeters: 1.6, maxMeters: null },
    padding: { leftMeters: 0.12, rightMeters: 0.12 },
    visual: { disableShades: false, interior: 'res' },
    ...openingCommon
};

const GC_REAR_WINDOW = {
    ...GC_STREET_WINDOW,
    size: { widthMeters: 1.5, heightMeters: 1.8 }
};

export const GARDEN_COURT_CONFIG = {
    name: 'Garden Court Apartments',
    footprintLoops: [
        [
            { x: -11, z: 6.5 },
            { x: 11, z: 6.5 },
            { x: 11, z: -6.5 },
            { x: -11, z: -6.5 }
        ]
    ],
    floors: 5,
    floorHeight: 3.0,
    style: 'default',
    windows: null,
    materialSlots: {
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.brown_standard', jitter: true } },
            wallAccent: { material: { kind: 'preset', id: 'brick.tan_standard', jitter: true } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.rusticated_ashlar' } }
        }
    },
    layers: [
        {
            id: 'floor_gc1',
            type: 'floor',
            floors: 1,
            floorHeight: 4.0,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: MATVAR_WALL(9),
            belt: {
                enabled: true,
                height: 0.24,
                extrusion: 0.07,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            // The garage lives on B only; C carries plain windows and D links
            // to it, so the side street keeps the vehicle entrance to itself.
            faceLinking: { links: { D: 'C' } }
        },
        {
            id: 'floor_gc2',
            type: 'floor',
            floors: 4,
            floorHeight: 3.0,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR_WALL(15),
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A' } }
        },
        {
            id: 'roof_gc3',
            type: 'roof',
            props: {
                enabled: true,
                density: 0.6,
                edgeMarginMeters: 1.0,
                minSpacingMeters: 0.9,
                seedOffset: 19,
                types: ['mech_box', 'vent_pipe'],
                placements: [],
                materials: { tank: null, frame: null, bulkhead: null, mech: null }
            },
            ring: {
                enabled: true,
                innerRadius: 0.28,
                outerRadius: 0.15,
                height: 0.62,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.36,
                projection: 0.2,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.14, depth: 0.11, spacing: 0.16, height: 0.14 },
                parapet: {
                    coping: { enabled: true, height: 0.09, overhang: 0.05, material: { kind: 'slot', id: 'trim' } },
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
    ],
    facades: {
        floor_gc1: {
            A: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.8, 1.2),
                            openingBay('bay_2', 2.2, GC_ENTRY_DOOR),
                            flexBay('bay_3', 0.7, 1.1),
                            openingBay('bay_4', 2.0, GC_STREET_WINDOW),
                            flexBay('bay_5', 0.7, 1.1)
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
                            flexBay('bay_1', 0.9, 2.0),
                            openingBay('bay_2', 3.2, GC_GARAGE),
                            flexBay('bay_3', 0.7, 1.6),
                            openingBay('bay_4', 2.0, GC_STREET_WINDOW),
                            flexBay('bay_5', 0.9, 2.0)
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
            C: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.8, 1.2),
                            openingBay('bay_2', 2.0, GC_STREET_WINDOW),
                            flexBay('bay_3', 0.8, 1.2)
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
        floor_gc2: {
            A: {
                layout: {
                    bays: {
                        items: [
                            {
                                id: 'bay_1',
                                size: { mode: 'fixed', widthMeters: 2.6 },
                                expandPreference: 'prefer_expand',
                                depth: { left: -1.4, right: -1.4, linked: true },
                                wallMaterialOverride: { kind: 'slot', id: 'wallAccent' },
                                window: GC_BALCONY_DOOR,
                                balcony: {
                                    enabled: true,
                                    presetId: 'balcony.modern_recessed',
                                    platform: { material: { kind: 'slot', id: 'trim' } }
                                }
                            },
                            flexBay('bay_2', 0.6, 1.8),
                            openingBay('bay_3', 2.0, GC_JULIET_WINDOW, {
                                balcony: {
                                    enabled: true,
                                    presetId: 'balcony.juliet_iron'
                                }
                            }),
                            flexBay('bay_4', 0.6, 1.8),
                            openingBay('bay_5', 2.6, GC_BALCONY_DOOR, {
                                balcony: {
                                    enabled: true,
                                    presetId: 'balcony.modern_glass_projecting',
                                    platform: { material: { kind: 'slot', id: 'trim' } }
                                }
                            }),
                            flexBay('bay_6', 0.6, 1.8),
                            openingBay('bay_7', 2.0, GC_JULIET_WINDOW, {
                                balcony: {
                                    enabled: true,
                                    presetId: 'balcony.juliet_iron'
                                }
                            }),
                            flexBay('bay_8', 0.6, 1.8),
                            {
                                id: 'bay_9',
                                size: { mode: 'fixed', widthMeters: 2.6 },
                                expandPreference: 'prefer_expand',
                                depth: { left: -1.4, right: -1.4, linked: true },
                                wallMaterialOverride: { kind: 'slot', id: 'wallAccent' },
                                window: GC_BALCONY_DOOR,
                                balcony: {
                                    enabled: true,
                                    presetId: 'balcony.modern_recessed',
                                    platform: { material: { kind: 'slot', id: 'trim' } }
                                }
                            }
                        ],
                        nextBayIndex: 10
                    },
                    groups: {
                        items: [
                            { id: 'group_1', bayIds: ['bay_4', 'bay_5', 'bay_6', 'bay_7'], repeat: { minRepeats: 1, maxRepeats: 'auto' } }
                        ],
                        nextGroupIndex: 2
                    }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.7, 1.1),
                            openingBay('bay_2', 2.0, GC_REAR_WINDOW),
                            flexBay('bay_3', 0.7, 1.1)
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
            },
            D: {
                layout: {
                    bays: {
                        items: [
                            flexBay('bay_1', 0.7, 1.1),
                            openingBay('bay_2', 2.0, GC_REAR_WINDOW),
                            flexBay('bay_3', 0.7, 1.1)
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
        }
    },
    attachments: {
        items: [
            {
                id: 'attachment_1',
                type: 'fire_escape',
                target: { layerId: 'floor_gc2', faceId: 'B', bayId: 'bay_2' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.6, depthMeters: 0.95 }
            },
            {
                id: 'attachment_2',
                type: 'ac_unit',
                probability: 0.3,
                seedOffset: 4,
                eligibility: { layerIds: ['floor_gc2'], assetTypes: ['window'], minFloor: 1 }
            }
        ]
    },
    windowDefinitions: {
        items: [
            {
                id: 'door_court_entry',
                assetType: 'door',
                name: 'Court Entry with Steps',
                settings: {
                    version: 1,
                    width: 1.7,
                    height: 2.9,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.08,
                        verticalWidth: 0.08,
                        horizontalWidth: 0.08,
                        depth: 0.1,
                        inset: 0.02,
                        openBottom: true,
                        addHandles: true,
                        handleMaterialMode: 'match',
                        doorStyle: 'single',
                        doorBottomFrame: { enabled: true, mode: 'match' },
                        doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                        colorHex: 0x27333d,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.55, metalness: 0.08, envMapIntensity: 0.2, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 1,
                        rows: 2,
                        verticalWidth: 0.05,
                        horizontalWidth: 0.05,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x27333d,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.55, metalness: 0.08, envMapIntensity: 0.2, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.75,
                        tintHex: 0x232a30,
                        reflection: { metalness: 0, roughness: 0.05, transmission: 0, ior: 1.5, envMapIntensity: 2 },
                        zOffset: -0.06
                    },
                    shade: { enabled: false },
                    interior: { enabled: false }
                },
                portal: {
                    enabled: true,
                    recessMeters: 0.3,
                    steps: {
                        count: 3,
                        riseMeters: 0.14,
                        treadDepthMeters: 0.32,
                        widthPaddingMeters: 0.3,
                        material: { mode: 'pbr', materialId: 'pbr.limestone_smooth' }
                    }
                },
                decoration: {
                    sill: { enabled: false },
                    header: {
                        enabled: true,
                        type: 'cornice',
                        widthMode: 'pct_10',
                        depthMeters: 0.12,
                        heightMeters: 0.22,
                        earsMeters: 0.05,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    jambs: { enabled: false }
                },
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: false }
            }
        ]
    }
};

export const SHOWCASE_MODELS = [
    { key: 'arcade_hall', overrides: ARCADE_HALL_CONFIG },
    { key: 'setback_tower', overrides: SETBACK_TOWER_CONFIG },
    { key: 'garden_court', overrides: GARDEN_COURT_CONFIG }
];
