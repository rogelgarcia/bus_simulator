// src/graphics/content3d/buildings/configs/BradburyBlock.js
// City building config: Bradbury Block — reproduction of the Bradbury
// Building reference model (downloads/buildings_references/2.png / 3.png).
//
// Massing: 5-storey corner block. Ground floor is red sandstone with
// storefronts (backlit white transom band + dark fascia) and a central arched
// entry portal; floors 2-4 are salmon Roman brick pilaster bays with paired /
// tripled 1-over-1 sash windows, the pilasters ending in capitals under a
// bracketed entablature; the top floor is an arcade of round-arched windows
// with terracotta archivolts under a dentiled crown cornice with stepped
// parapet blocks; black fire escapes on both street faces; the street corner
// is chamfered.
//
// Known gaps vs the reference are documented in
// docs/bradbury_block_reference_notes.md.

const SASH_WINDOW = (widthMeters, repeatCount) => Object.freeze({
    enabled: true,
    defId: 'window_bradbury_sash',
    assetType: 'window',
    size: { widthMeters, heightMeters: 2.3 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.55,
    width: { minMeters: widthMeters, maxMeters: null },
    padding: { leftMeters: 0.14, rightMeters: 0.14 },
    repeat: { count: repeatCount },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: false, interior: 'res' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 2.3,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const ARCH_WINDOW = (widthMeters, repeatCount) => Object.freeze({
    enabled: true,
    defId: 'window_bradbury_arch',
    assetType: 'window',
    size: { widthMeters, heightMeters: 2.7 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.5,
    width: { minMeters: widthMeters, maxMeters: null },
    padding: { leftMeters: 0.14, rightMeters: 0.14 },
    repeat: { count: repeatCount },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: false, interior: 'res' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 2.7,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const STOREFRONT = Object.freeze({
    enabled: true,
    defId: 'storefront_bradbury',
    assetType: 'storefront',
    size: { widthMeters: 3.4, heightMeters: 4.3 },
    heightMode: 'full',
    verticalOffsetMeters: null,
    width: { minMeters: 3.0, maxMeters: null },
    padding: { leftMeters: 0.12, rightMeters: 0.12 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: true, interior: 'shop' },
    top: {
        enabled: false,
        assetType: 'storefront',
        heightMode: 'fixed',
        heightMeters: 2.0,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const ENTRY_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_portal_bradbury',
    assetType: 'door',
    size: { widthMeters: 2.6, heightMeters: 3.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: null,
    width: { minMeters: 2.6, maxMeters: null },
    padding: { leftMeters: 0.35, rightMeters: 0.35 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: true },
    visual: { disableShades: true, interior: 'none' },
    top: {
        enabled: false,
        assetType: 'door',
        heightMode: 'fixed',
        heightMeters: 3.7,
        verticalGapMeters: 0,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

// Pilaster capital under the entablature — the closest the engine gets to the
// reference's foliate terracotta capitals.
const PIER_CAPITAL = Object.freeze({
    top: {
        enabled: true,
        profile: 'stepped',
        height: 0.5,
        overhang: 0.14,
        projection: 0.12,
        material: { kind: 'slot', id: 'trim' }
    },
    bottom: { enabled: false }
});

function groundPier(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: null
    };
}

function storeBay(id) {
    return {
        id,
        size: { mode: 'range', minMeters: 3.2, maxMeters: 5.4 },
        expandPreference: 'prefer_expand',
        depth: { left: -0.18, right: -0.18, linked: true },
        wallMaterialOverride: null,
        window: STOREFRONT
    };
}

function brickPier(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: null,
        capital: PIER_CAPITAL
    };
}

function plainPier(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: null
    };
}

function windowBay(id, window) {
    return {
        id,
        size: { mode: 'range', minMeters: 3.0, maxMeters: 5.2 },
        expandPreference: 'prefer_expand',
        depth: { left: -0.12, right: -0.12, linked: true },
        wallMaterialOverride: null,
        window
    };
}

const MATVAR = (seedOffset) => ({
    enabled: true,
    seedOffset,
    root: 'wall',
    space: 'world',
    worldSpaceScale: 0.16,
    aoAmount: 0.5,
    wearTop: { enabled: true, value: -0.14, intensity: 0.16 },
    wearBottom: { enabled: true, intensity: 0.2, hueDegrees: -18 },
    wearSide: { enabled: true, intensity: 0.32, value: -0.22, width: 0.9, scale: 5.0 }
});

export const BRADBURY_BLOCK_BUILDING_CONFIG = Object.freeze({
    id: 'bradbury_block',
    name: 'Bradbury Block',
    materialSlots: Object.freeze({
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.salmon_roman', jitter: true } },
            wallAccent: { material: { kind: 'texture', id: 'pbr.brownstone' } },
            trim: { material: { kind: 'texture', id: 'pbr.terracotta_smooth' } },
            base: { material: { kind: 'texture', id: 'pbr.red_sandstone_block' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_bb1',
            type: 'floor',
            floors: 1,
            floorHeight: 4.9,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: MATVAR(3),
            belt: { enabled: false },
            // Transition band between the sandstone base and the brick shaft.
            cornice: {
                enabled: true,
                profile: 'flat_band',
                height: 0.34,
                projection: 0.14,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'dentils',
                    width: 0.11,
                    depth: 0.1,
                    spacing: 0.15,
                    height: 0.14,
                    material: { kind: 'slot', id: 'trim' }
                }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_bb2',
            type: 'floor',
            floors: 3,
            floorHeight: 3.3,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR(11),
            belt: { enabled: false },
            // Entablature under the arcade floor: the bracketed band the
            // pilaster capitals push into.
            cornice: {
                enabled: true,
                profile: 'flat_band',
                height: 0.5,
                projection: 0.2,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'brackets',
                    width: 0.13,
                    depth: 0.16,
                    spacing: 0.3,
                    height: 0.24,
                    material: { kind: 'slot', id: 'trim' }
                }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_bb3',
            type: 'floor',
            floors: 1,
            floorHeight: 4.0,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            materialVariation: MATVAR(19),
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'roof_bb4',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.16,
                height: 0.6,
                material: { kind: 'slot', id: 'wallPrimary' }
            },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.62,
                projection: 0.45,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'dentils',
                    width: 0.16,
                    depth: 0.14,
                    spacing: 0.22,
                    height: 0.2,
                    material: { kind: 'slot', id: 'trim' }
                },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.1,
                        overhang: 0.06,
                        material: { kind: 'slot', id: 'trim' }
                    },
                    stepped: {
                        enabled: true,
                        mode: 'corners_and_centers',
                        blockWidth: 1.1,
                        raise: 0.32
                    }
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
            { x: -21, z: 11 },
            { x: 21, z: 11 },
            { x: 21, z: -11 },
            { x: -21, z: -11 }
        ]
    ]),
    // The street corner (front x side) is chamfered like the reference; the
    // other corners stay square.
    edgeBevel: Object.freeze({
        enabled: true,
        scope: 'main_corners',
        widthMeters: 1.5,
        includeConcave: false,
        corners: {
            AB: { enabled: true, widthMeters: 1.5 },
            BC: { enabled: false },
            CD: { enabled: false },
            DA: { enabled: false }
        }
    }),
    floors: 5,
    floorHeight: 3.3,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_bb1: {
            A: {
                layout: {
                    bays: {
                        items: [
                            groundPier('pier_1', 1.6),
                            storeBay('store_2'),
                            groundPier('pier_3', 1.0),
                            storeBay('store_4'),
                            groundPier('pier_5', 1.0),
                            storeBay('store_6'),
                            groundPier('pier_7', 1.0),
                            {
                                id: 'entry_8',
                                size: { mode: 'fixed', widthMeters: 3.6 },
                                expandPreference: 'no_repeat',
                                wallMaterialOverride: null,
                                window: ENTRY_DOOR
                            },
                            groundPier('pier_9', 1.0),
                            storeBay('store_10'),
                            groundPier('pier_11', 1.0),
                            storeBay('store_12'),
                            groundPier('pier_13', 1.0),
                            storeBay('store_14'),
                            groundPier('pier_15', 1.6)
                        ],
                        nextBayIndex: 16
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            groundPier('pier_1', 1.6),
                            storeBay('store_2'),
                            groundPier('pier_3', 1.0),
                            storeBay('store_4'),
                            groundPier('pier_5', 1.0),
                            storeBay('store_6'),
                            groundPier('pier_7', 1.0),
                            storeBay('store_8'),
                            groundPier('pier_9', 1.6)
                        ],
                        nextBayIndex: 10
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            }
        },
        floor_bb2: {
            A: {
                layout: {
                    bays: {
                        items: [
                            brickPier('pier_1', 1.6),
                            windowBay('win_2', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_3', 0.85),
                            windowBay('win_4', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_5', 0.85),
                            windowBay('win_6', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_7', 0.85),
                            windowBay('win_8', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_9', 0.85),
                            windowBay('win_10', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_11', 0.85),
                            windowBay('win_12', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_13', 0.85),
                            windowBay('win_14', SASH_WINDOW(1.15, 3)),
                            brickPier('pier_15', 1.6)
                        ],
                        nextBayIndex: 16
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            brickPier('pier_1', 1.6),
                            windowBay('win_2', SASH_WINDOW(1.2, 2)),
                            brickPier('pier_3', 0.85),
                            windowBay('win_4', SASH_WINDOW(1.2, 2)),
                            brickPier('pier_5', 0.85),
                            windowBay('win_6', SASH_WINDOW(1.2, 2)),
                            brickPier('pier_7', 0.85),
                            windowBay('win_8', SASH_WINDOW(1.2, 2)),
                            brickPier('pier_9', 0.85),
                            windowBay('win_10', SASH_WINDOW(1.2, 2)),
                            brickPier('pier_11', 1.6)
                        ],
                        nextBayIndex: 12
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            }
        },
        floor_bb3: {
            A: {
                layout: {
                    bays: {
                        items: [
                            plainPier('pier_1', 1.6),
                            windowBay('win_2', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_3', 0.85),
                            windowBay('win_4', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_5', 0.85),
                            windowBay('win_6', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_7', 0.85),
                            windowBay('win_8', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_9', 0.85),
                            windowBay('win_10', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_11', 0.85),
                            windowBay('win_12', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_13', 0.85),
                            windowBay('win_14', ARCH_WINDOW(1.05, 3)),
                            plainPier('pier_15', 1.6)
                        ],
                        nextBayIndex: 16
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            B: {
                layout: {
                    bays: {
                        items: [
                            plainPier('pier_1', 1.6),
                            windowBay('win_2', ARCH_WINDOW(1.1, 2)),
                            plainPier('pier_3', 0.85),
                            windowBay('win_4', ARCH_WINDOW(1.1, 2)),
                            plainPier('pier_5', 0.85),
                            windowBay('win_6', ARCH_WINDOW(1.1, 2)),
                            plainPier('pier_7', 0.85),
                            windowBay('win_8', ARCH_WINDOW(1.1, 2)),
                            plainPier('pier_9', 0.85),
                            windowBay('win_10', ARCH_WINDOW(1.1, 2)),
                            plainPier('pier_11', 1.6)
                        ],
                        nextBayIndex: 12
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            }
        }
    }),
    attachments: Object.freeze({
        items: [
            {
                id: 'attachment_1',
                type: 'fire_escape',
                target: { layerId: 'floor_bb2', faceId: 'A', bayId: 'win_4' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.7, depthMeters: 0.95 }
            },
            {
                id: 'attachment_2',
                type: 'fire_escape',
                target: { layerId: 'floor_bb2', faceId: 'A', bayId: 'win_12' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.7, depthMeters: 0.95 }
            },
            {
                id: 'attachment_3',
                type: 'fire_escape',
                target: { layerId: 'floor_bb2', faceId: 'B', bayId: 'win_6' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.7, depthMeters: 0.95 }
            }
        ]
    }),
    windowDefinitions: Object.freeze({
        items: [
            {
                id: 'window_bradbury_sash',
                assetType: 'window',
                name: 'Bradbury 1-over-1 Sash',
                settings: {
                    version: 1,
                    width: 1.1,
                    height: 2.3,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.06,
                        depth: 0.08,
                        inset: 0.0,
                        openBottom: false,
                        colorHex: 0x27352c,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 1,
                        rows: 2,
                        verticalWidth: 0.04,
                        horizontalWidth: 0.06,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x27352c,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.82,
                        tintHex: 0x33424d,
                        reflection: { metalness: 0, roughness: 0.03, transmission: 0, ior: 1.5, envMapIntensity: 2.4 },
                        zOffset: -0.06
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
                    header: { enabled: false },
                    jambs: { enabled: false },
                    trim: { enabled: false }
                },
                layers: { frame: true, muntins: true, glass: true, shade: true, interior: true },
                wall: { materialId: 'pbr.red_brick', roughness: 0.85, normalIntensity: 1, cutWidthLerp: 0, cutHeightLerp: 0, floorDistanceMeters: 0 }
            },
            {
                id: 'window_bradbury_arch',
                assetType: 'window',
                name: 'Bradbury Arcade Arch',
                settings: {
                    version: 1,
                    width: 0.95,
                    height: 2.7,
                    arch: {
                        enabled: true,
                        heightRatio: 0.18,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.06,
                        depth: 0.08,
                        inset: 0.0,
                        openBottom: false,
                        colorHex: 0x27352c,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 1,
                        rows: 2,
                        verticalWidth: 0.04,
                        horizontalWidth: 0.055,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x27352c,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.82,
                        tintHex: 0x33424d,
                        reflection: { metalness: 0, roughness: 0.03, transmission: 0, ior: 1.5, envMapIntensity: 2.4 },
                        zOffset: -0.06
                    },
                    shade: { enabled: false },
                    interior: { enabled: true }
                },
                decoration: {
                    sill: {
                        enabled: true,
                        type: 'simple',
                        widthMode: 'pct_15',
                        depthMeters: 0.07,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    header: {
                        enabled: true,
                        type: 'arched_band',
                        widthMode: 'match_window',
                        depthMeters: 0.1,
                        heightMeters: 0.18,
                        earsMeters: 0,
                        material: { mode: 'slot', slotId: 'trim' }
                    },
                    jambs: { enabled: false },
                    trim: { enabled: false }
                },
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: true },
                wall: { materialId: 'pbr.red_brick', roughness: 0.85, normalIntensity: 1, cutWidthLerp: 0, cutHeightLerp: 0, floorDistanceMeters: 0 }
            },
            {
                id: 'storefront_bradbury',
                assetType: 'storefront',
                name: 'Bradbury Storefront Backlit Transom',
                settings: {
                    version: 1,
                    width: 3.4,
                    height: 4.3,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.055,
                        verticalWidth: 0.055,
                        horizontalWidth: 0.055,
                        depth: 0.12,
                        inset: 0.04,
                        openBottom: false,
                        addHandles: false,
                        colorHex: 0x1d2023,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.5, metalness: 0.1, envMapIntensity: 0.3, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 2,
                        rows: 1,
                        verticalWidth: 0.05,
                        horizontalWidth: 0.045,
                        depth: 0.07,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x1d2023,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.5, metalness: 0.1, envMapIntensity: 0.3, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.42,
                        tintHex: 0x2b3238,
                        reflection: { metalness: 0, roughness: 0.03, transmission: 0, ior: 1.5, envMapIntensity: 1.2 },
                        zOffset: -0.03
                    },
                    shade: { enabled: false },
                    interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.shop' }
                },
                storefront: {
                    bulkhead: {
                        enabled: true,
                        heightMeters: 0.25,
                        projectionMeters: 0.03,
                        material: { mode: 'match_frame' }
                    },
                    transom: {
                        mode: 'backlit',
                        heightMeters: 0.78,
                        columns: 3,
                        emissiveColorHex: 0xffffff,
                        emissiveIntensity: 1.9
                    },
                    fascia: {
                        enabled: true,
                        heightMeters: 0.28,
                        projectionMeters: 0.04,
                        material: { mode: 'match_frame' }
                    }
                },
                decoration: null,
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: true },
                wall: { materialId: 'pbr.red_brick', roughness: 0.85, normalIntensity: 1, cutWidthLerp: 0, cutHeightLerp: 0, floorDistanceMeters: 0 }
            },
            {
                id: 'door_portal_bradbury',
                assetType: 'door',
                name: 'Bradbury Arched Entry Portal',
                settings: {
                    version: 1,
                    width: 2.6,
                    height: 3.9,
                    arch: {
                        enabled: true,
                        heightRatio: 0.26,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.09,
                        verticalWidth: 0.09,
                        horizontalWidth: 0.09,
                        depth: 0.11,
                        inset: 0.0,
                        openBottom: true,
                        addHandles: true,
                        handleMaterialMode: 'match',
                        doorStyle: 'double',
                        doorBottomFrame: { enabled: true, mode: 'match' },
                        doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                        colorHex: 0x1f1712,
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
                        colorHex: 0x2c2118,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.6, metalness: 0.05, envMapIntensity: 0.2, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.9,
                        tintHex: 0x131110,
                        reflection: { metalness: 0, roughness: 0.05, transmission: 0, ior: 1.5, envMapIntensity: 2 },
                        zOffset: -0.06
                    },
                    shade: { enabled: false },
                    interior: { enabled: false }
                },
                portal: {
                    enabled: true,
                    recessMeters: 0.85,
                    steps: {
                        count: 1,
                        riseMeters: 0.12,
                        treadDepthMeters: 0.34,
                        widthPaddingMeters: 0.3,
                        material: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' }
                    }
                },
                decoration: {
                    sill: { enabled: false },
                    header: {
                        enabled: true,
                        type: 'arched_band',
                        widthMode: 'match_window',
                        depthMeters: 0.24,
                        heightMeters: 0.52,
                        earsMeters: 0,
                        material: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' }
                    },
                    jambs: {
                        enabled: true,
                        type: 'simple',
                        widthMode: 'match_window',
                        depthMeters: 0.22,
                        heightMeters: 0.3,
                        runMode: 'sill_to_header',
                        material: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' }
                    }
                },
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: false }
            }
        ]
    })
});

export default BRADBURY_BLOCK_BUILDING_CONFIG;
