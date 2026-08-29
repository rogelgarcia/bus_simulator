// City building config: Burban — AI 516 curved-facade showcase based on
// downloads/references_ideas/burban.png. The front-right corner is ONE
// semantic quarter-circle face (B); the generator resolves its bays in arc
// length and bends the wall, curtain windows, floor bands, cornice, coping,
// and ornament around the same radius.

const ARC_BULGE_QUARTER = Math.SQRT2 - 1;
const FLOOR_HEIGHT = 3.2;
const GROUND_HEIGHT = 4.6;
const CURTAIN_MODULE = 1.45;

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const CURTAIN_GLASS = Object.freeze({
    opacity: 1,
    tintHex: 0x345d72,
    reflection: {
        metalness: 0.18,
        roughness: 0.06,
        transmission: 0,
        ior: 1.75,
        envMapIntensity: 1.8
    },
    zOffset: -0.025
});

const FRAME_MATERIAL = Object.freeze({
    roughness: 0.72,
    metalness: 0.35,
    envMapIntensity: 0.35,
    normalStrength: 0.5
});

function openingPlacement(defId, { width, height, full = false } = {}) {
    return {
        enabled: true,
        defId,
        assetType: 'window',
        size: { widthMeters: width, heightMeters: height },
        heightMode: full ? 'full' : 'fixed',
        verticalOffsetMeters: full ? 0 : 0.35,
        width: { minMeters: width, maxMeters: null },
        padding: { leftMeters: 0.015, rightMeters: 0.015 },
        repeat: { count: 1 },
        muntins: { bottomEnabled: true, topEnabled: true },
        visual: { disableShades: true, interior: 'office' },
        top: { enabled: false },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

const GROUND_WINDOW = Object.freeze(openingPlacement('window_burban_ground', {
    width: 2.85,
    height: GROUND_HEIGHT,
    full: true
}));

const UPPER_WINDOW = Object.freeze(openingPlacement('window_burban_curtain', {
    width: CURTAIN_MODULE - 0.04,
    height: 2.7
}));

function repeatBay(id, minMeters, window) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: null },
        expandPreference: 'prefer_repeat',
        depth: { left: -0.08, right: -0.08, linked: true },
        wallMaterialOverride: null,
        window
    };
}

const GROUND_FACADE = Object.freeze({
    layout: {
        bays: { items: [repeatBay('bay_ground_glass', 3.25, GROUND_WINDOW)], nextBayIndex: 2 },
        groups: { items: [], nextGroupIndex: 1 }
    }
});

const UPPER_FACADE = Object.freeze({
    layout: {
        bays: { items: [repeatBay('bay_curtain_module', CURTAIN_MODULE, UPPER_WINDOW)], nextBayIndex: 2 },
        groups: { items: [], nextGroupIndex: 1 }
    }
});

function windowDefinition({ id, name, width, height, columns, bottomPanelHeight = 0 }) {
    return {
        id,
        assetType: 'window',
        name,
        settings: {
            version: 1,
            width,
            height,
            arch: NO_ARCH,
            frame: {
                width: 0.075,
                verticalWidth: 0.075,
                horizontalWidth: 0.09,
                depth: 0.13,
                inset: 0.035,
                openBottom: bottomPanelHeight > 0,
                doorBottomFrame: bottomPanelHeight > 0
                    ? { enabled: true, mode: 'match', heightMeters: bottomPanelHeight }
                    : { enabled: false, mode: 'match' },
                addHandles: false,
                colorHex: 0x20272b,
                bevel: { size: 0.035, roundness: 0.45 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: columns > 1,
                columns,
                rows: 1,
                verticalWidth: 0.055,
                horizontalWidth: 0.055,
                depth: 0.08,
                inset: 0.005,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x20272b,
                bevel: { inherit: true, bevel: { size: 0.035, roundness: 0.45 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
            },
            glass: CURTAIN_GLASS,
            shade: { enabled: false },
            interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.office' }
        },
        decoration: {
            sill: {
                enabled: true,
                style: 'slab',
                materialMode: 'match_wall',
                projectionMeters: 0.11,
                heightMeters: 0.09,
                depthMeters: 0.16
            },
            header: { enabled: false },
            jambs: { enabled: false }
        },
        layers: { frame: true, muntins: columns > 1, glass: true, shade: false, interior: true }
    };
}

export const BURBAN_BUILDING_CONFIG = Object.freeze({
    id: 'burban',
    name: 'Burban',
    materialSlots: Object.freeze({
        slots: {
            stone: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            curtain: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } },
            trim: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_burban_ground',
            type: 'floor',
            floors: 1,
            floorHeight: GROUND_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: {
                enabled: true,
                height: 0.34,
                extrusion: 0.2,
                material: { kind: 'color', id: 'offwhite' }
            },
            cornice: {
                enabled: true,
                profile: 'stepped',
                height: 0.42,
                projection: 0.28,
                material: { kind: 'color', id: 'offwhite' },
                ornament: { type: 'none' }
            },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A', E: 'A' } }
        },
        {
            id: 'floor_burban_upper',
            type: 'floor',
            floors: 7,
            floorHeight: FLOOR_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'curtain' },
            materialVariation: { enabled: false },
            // One pale spandrel/string course per storey. Because beltOuter is
            // derived from the resolved facade loop, the entire band curves.
            belt: {
                enabled: true,
                height: 0.34,
                extrusion: 0.22,
                material: { kind: 'color', id: 'offwhite' }
            },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A', E: 'A' } }
        },
        {
            id: 'roof_burban',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.34,
                outerRadius: 0.16,
                height: 0.78,
                material: { kind: 'color', id: 'offwhite' }
            },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.72,
                projection: 0.48,
                material: { kind: 'color', id: 'offwhite' },
                ornament: {
                    type: 'dentils',
                    width: 0.18,
                    depth: 0.2,
                    spacing: 0.16,
                    height: 0.2,
                    material: { kind: 'color', id: 'offwhite' }
                },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.12,
                        overhang: 0.07,
                        material: { kind: 'color', id: 'offwhite' }
                    },
                    stepped: { enabled: false }
                }
            },
            roof: {
                type: 'Asphalt',
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                tiling: { enabled: true, tileMeters: 4, tileMetersU: 4, tileMetersV: 4, uvEnabled: true },
                color: 'default'
            }
        }
    ]),
    footprintLoops: Object.freeze([[
        { x: -18, z: -14, runId: 'D', runForward: true },
        { x: 18, z: -14, runId: 'C', runForward: true },
        {
            x: 18,
            z: 8,
            runId: 'B',
            runForward: true,
            arc: { bulge: ARC_BULGE_QUARTER, segments: 18 }
        },
        { x: 12, z: 14, runId: 'A', runForward: true },
        { x: -18, z: 14, runId: 'E', runForward: true }
    ]]),
    floors: 8,
    floorHeight: FLOOR_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_burban_ground: { A: GROUND_FACADE },
        floor_burban_upper: { A: UPPER_FACADE }
    }),
    windowDefinitions: Object.freeze({
        items: [
            windowDefinition({
                id: 'window_burban_ground',
                name: 'Burban Ground Curtain Window',
                width: 2.85,
                height: GROUND_HEIGHT,
                columns: 3,
                bottomPanelHeight: 0.42
            }),
            windowDefinition({
                id: 'window_burban_curtain',
                name: 'Burban Curved Curtain Pane',
                width: CURTAIN_MODULE - 0.04,
                height: 2.7,
                columns: 1,
                bottomPanelHeight: 0
            })
        ]
    })
});

export default BURBAN_BUILDING_CONFIG;
