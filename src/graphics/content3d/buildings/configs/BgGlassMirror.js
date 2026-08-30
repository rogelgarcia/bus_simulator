// City building config: BG Glass Mirror — layered flat and bowed floor silhouettes.
// The largest 6-run office plan owns the central mirror-glass arc; detached
// lobby and crown plans make both vertical silhouette transitions explicit.
// The recessed bay ends at the A/F boundary so its notch opens at the left corner.

const BUILDING_WIDTH = 44;
const HALF_WIDTH = BUILDING_WIDTH / 2;
const HALF_DEPTH = 12.5;
const LOBBY_HEIGHT = 5.2;
const PODIUM_HEIGHT = 4.2;
const OFFICE_HEIGHT = 3.8;
const OFFICE_FLOORS = 13;
const CROWN_HEIGHT = 4.2;
const LEFT_SHOULDER_LENGTH = BUILDING_WIDTH * 0.3;
const OFFICE_ARC_CHORD = BUILDING_WIDTH * 0.56;
const RIGHT_SHOULDER_LENGTH = BUILDING_WIDTH - LEFT_SHOULDER_LENGTH - OFFICE_ARC_CHORD;
const OFFICE_ARC_START_X = -HALF_WIDTH + LEFT_SHOULDER_LENGTH;
const OFFICE_ARC_END_X = OFFICE_ARC_START_X + OFFICE_ARC_CHORD;
const OFFICE_ARC_BULGE = 0.244;
const SIDE_LENGTH = HALF_DEPTH * 2;
const BASE_SIDE_LENGTH = 24;

function circularArcLength(chord, bulge) {
    const sweep = 4 * Math.atan(Math.abs(bulge));
    const radius = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge));
    return radius * sweep;
}

const OFFICE_ARC_LENGTH = circularArcLength(OFFICE_ARC_CHORD, OFFICE_ARC_BULGE);

function stableLoop(points) {
    return Object.freeze(points.map((point, index) => Object.freeze({
        ...point,
        cornerId: `corner_${index + 1}`,
        runForward: true
    })));
}

function detachedSilhouette(loop) {
    return Object.freeze({
        version: 1,
        mode: 'detached',
        loop,
        idState: Object.freeze({
            nextCornerSerial: loop.length + 1,
            retiredCornerIds: Object.freeze([]),
            retiredRunIds: Object.freeze([])
        })
    });
}

const OFFICE_FOOTPRINT = stableLoop([
    { x: HALF_WIDTH, z: HALF_DEPTH, runId: 'C' },
    { x: OFFICE_ARC_END_X, z: HALF_DEPTH, runId: 'B', split: true, arc: { bulge: OFFICE_ARC_BULGE, segments: 36 } },
    { x: OFFICE_ARC_START_X, z: HALF_DEPTH, runId: 'A', split: true },
    { x: -HALF_WIDTH, z: HALF_DEPTH, runId: 'F' },
    { x: -HALF_WIDTH, z: -HALF_DEPTH, runId: 'E' },
    { x: HALF_WIDTH, z: -HALF_DEPTH, runId: 'D' }
]);

const LOBBY_SILHOUETTE = detachedSilhouette(stableLoop([
    { x: HALF_WIDTH, z: HALF_DEPTH, runId: 'A' },
    { x: -HALF_WIDTH, z: HALF_DEPTH, runId: 'D' },
    { x: -HALF_WIDTH, z: -11.5, runId: 'C' },
    { x: HALF_WIDTH, z: -11.5, runId: 'B' }
]));

const CROWN_SILHOUETTE = detachedSilhouette(stableLoop([
    { x: HALF_WIDTH, z: 11.5, runId: 'A' },
    { x: -HALF_WIDTH, z: 11.5, runId: 'D' },
    { x: -HALF_WIDTH, z: -HALF_DEPTH, runId: 'C' },
    { x: HALF_WIDTH, z: -HALF_DEPTH, runId: 'B' }
]));

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const MIRROR_GLASS = Object.freeze({
    opacity: 0.86,
    tintHex: 0x304a63,
    reflection: Object.freeze({
        metalness: 0.78,
        roughness: 0.035,
        transmission: 0.24,
        ior: 1.7,
        envMapIntensity: 4.4
    }),
    zOffset: -0.03
});

const LOBBY_GLASS = Object.freeze({
    opacity: 0.9,
    tintHex: 0x526d7f,
    reflection: Object.freeze({
        metalness: 0.48,
        roughness: 0.03,
        transmission: 0.58,
        ior: 1.65,
        envMapIntensity: 4
    }),
    zOffset: -0.035
});

const FRAME_MATERIAL = Object.freeze({
    roughness: 0.28,
    metalness: 0.72,
    envMapIntensity: 1.45,
    normalStrength: 0.2
});

function openingPlacement(defId, {
    width,
    height,
    assetType = 'window',
    depthMeters = 0.42
}) {
    const assetWidth = Math.max(0.1, width - 0.01);
    return {
        enabled: true,
        defId,
        assetType,
        size: { widthMeters: assetWidth, heightMeters: height },
        heightMode: 'full',
        verticalOffsetMeters: 0,
        width: { minMeters: assetWidth, maxMeters: null },
        padding: { leftMeters: 0, rightMeters: 0 },
        repeat: { count: 1 },
        muntins: { bottomEnabled: assetType !== 'door', topEnabled: true },
        visual: { disableShades: true, interior: 'none' },
        depthMeters,
        top: { enabled: false },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

function structuralBay(id, widthMeters, projection = 0.16) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        depth: { left: projection, right: projection, linked: true },
        wallMaterialOverride: { kind: 'slot', id: 'stone' }
    };
}

function openingBay(id, widthMeters, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: { kind: 'slot', id: 'curtain' },
        window
    };
}

function recessedBalconyBay(id, widthMeters, defId = 'window_bgglassmirror_balcony') {
    return {
        ...openingBay(id, widthMeters, openingPlacement(defId, {
            width: widthMeters,
            height: OFFICE_HEIGHT,
            depthMeters: 0.18
        })),
        depth: { left: -1.6, right: -1.6, linked: true },
        balcony: {
            enabled: true,
            presetId: 'balcony.modern_recessed',
            platform: { material: { kind: 'slot', id: 'stone' } }
        }
    };
}

function facadeFromItems(items) {
    return {
        layout: {
            bays: { items, nextBayIndex: items.length + 1 },
            groups: { items: [], nextGroupIndex: 1 }
        }
    };
}

function glassFacade(prefix, {
    faceLength,
    height,
    defId,
    endPierWidth = 0.8,
    moduleCount = 1,
    pierProjection = 0.16,
    glazingDepth = 0.42
}) {
    const count = Math.max(1, Math.round(moduleCount));
    const glassWidth = (faceLength - endPierWidth * 2) / count;
    const items = [structuralBay(`${prefix}_pier_start`, endPierWidth, pierProjection)];
    for (let index = 0; index < count; index++) {
        items.push(openingBay(`${prefix}_glass_${index + 1}`, glassWidth, openingPlacement(defId, {
            width: glassWidth,
            height,
            depthMeters: glazingDepth
        })));
    }
    items.push(structuralBay(`${prefix}_pier_end`, endPierWidth, pierProjection));
    return facadeFromItems(items);
}

function lobbyFrontFacade() {
    const endPierWidth = 1.1;
    const entryPierWidth = 0.65;
    const entryWidth = 5.8;
    const glassWidth = (BUILDING_WIDTH - endPierWidth * 2 - entryPierWidth * 2 - entryWidth) / 4;
    return facadeFromItems([
        structuralBay('lobby_front_pier_start', endPierWidth),
        openingBay('lobby_front_glass_left_1', glassWidth, openingPlacement('window_bgglassmirror_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.28
        })),
        openingBay('lobby_front_glass_left_2', glassWidth, openingPlacement('window_bgglassmirror_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.28
        })),
        structuralBay('lobby_front_entry_pier_left', entryPierWidth),
        openingBay('lobby_front_entry', entryWidth, openingPlacement('door_bgglassmirror_entry', {
            width: entryWidth,
            height: LOBBY_HEIGHT,
            assetType: 'door',
            depthMeters: 0.32
        })),
        structuralBay('lobby_front_entry_pier_right', entryPierWidth),
        openingBay('lobby_front_glass_right_1', glassWidth, openingPlacement('window_bgglassmirror_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.28
        })),
        openingBay('lobby_front_glass_right_2', glassWidth, openingPlacement('window_bgglassmirror_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.28
        })),
        structuralBay('lobby_front_pier_end', endPierWidth)
    ]);
}

function screenDefinition({
    id,
    name,
    width,
    height,
    columns,
    rows = 1,
    glass = MIRROR_GLASS,
    assetType = 'window',
    frameWidth = 0.045,
    horizontalFrameWidth = 0.16,
    muntinWidth = 0.028
}) {
    const isDoor = assetType === 'door';
    const hasMuntins = !isDoor && (columns > 1 || rows > 1);
    return {
        id,
        assetType,
        name,
        settings: {
            version: 1,
            width,
            height,
            arch: NO_ARCH,
            frame: {
                width: frameWidth,
                verticalWidth: frameWidth,
                horizontalWidth: horizontalFrameWidth,
                depth: 0.1,
                inset: 0.02,
                openBottom: isDoor,
                doorBottomFrame: isDoor
                    ? { enabled: true, mode: 'match', heightMeters: 0.28 }
                    : { enabled: false, mode: 'match' },
                addHandles: isDoor,
                colorHex: 0x151b20,
                bevel: { size: 0.005, roundness: 0.4 },
                material: FRAME_MATERIAL,
                ...(isDoor ? {
                    doorStyle: 'double',
                    doorKickPanel: { enabled: true, heightMeters: 0.28 },
                    handleCenterHeightMeters: 1.05,
                    handleScale: 1.6,
                    doorCenterFrame: { leftMode: 'match', rightMode: 'none' }
                } : {})
            },
            muntins: {
                enabled: hasMuntins,
                columns,
                rows,
                verticalWidth: muntinWidth,
                horizontalWidth: Math.max(muntinWidth, 0.05),
                depth: 0.075,
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x151b20,
                bevel: { inherit: true, bevel: { size: 0.004, roundness: 0.4 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
            },
            glass,
            shade: { enabled: false },
            interior: { enabled: false }
        },
        decoration: {
            sill: { enabled: false },
            header: { enabled: false },
            jambs: { enabled: false }
        },
        layers: {
            frame: true,
            muntins: hasMuntins,
            glass: true,
            shade: false,
            interior: false
        }
    };
}

const LOBBY_FRONT_FACADE = Object.freeze(lobbyFrontFacade());
const LOBBY_SIDE_FACADE = Object.freeze(glassFacade('lobby_side', {
    faceLength: BASE_SIDE_LENGTH,
    height: LOBBY_HEIGHT,
    defId: 'window_bgglassmirror_side',
    endPierWidth: 0.85,
    moduleCount: 3,
    glazingDepth: 0.3
}));
const LOBBY_REAR_FACADE = Object.freeze(glassFacade('lobby_rear', {
    faceLength: BUILDING_WIDTH,
    height: LOBBY_HEIGHT,
    defId: 'window_bgglassmirror_crown',
    endPierWidth: 1.1,
    moduleCount: 5,
    glazingDepth: 0.3
}));
const PODIUM_FRONT_FACADE = Object.freeze(glassFacade('podium_front', {
    faceLength: BUILDING_WIDTH,
    height: PODIUM_HEIGHT,
    defId: 'window_bgglassmirror_crown',
    endPierWidth: 1,
    moduleCount: 5
}));
const PODIUM_SIDE_FACADE = Object.freeze(glassFacade('podium_side', {
    faceLength: BASE_SIDE_LENGTH,
    height: PODIUM_HEIGHT,
    defId: 'window_bgglassmirror_side',
    endPierWidth: 0.8,
    moduleCount: 3
}));
const PODIUM_REAR_FACADE = Object.freeze(glassFacade('podium_rear', {
    faceLength: BUILDING_WIDTH,
    height: PODIUM_HEIGHT,
    defId: 'window_bgglassmirror_crown',
    endPierWidth: 1,
    moduleCount: 5
}));
const OFFICE_BOW_FACADE = Object.freeze(glassFacade('office_bow', {
    faceLength: OFFICE_ARC_LENGTH,
    height: OFFICE_HEIGHT,
    defId: 'window_bgglassmirror_bow',
    endPierWidth: 0.9,
    moduleCount: 7
}));
const OFFICE_LOGGIA_INNER_PIER_WIDTH = 0.75;
const OFFICE_LOGGIA_WIDTH = LEFT_SHOULDER_LENGTH - OFFICE_LOGGIA_INNER_PIER_WIDTH;
const OFFICE_LEFT_BALCONY_FACADE = Object.freeze(facadeFromItems([
    structuralBay('office_left_loggia_inner_pier', OFFICE_LOGGIA_INNER_PIER_WIDTH),
    recessedBalconyBay('office_left_corner_balcony_front', OFFICE_LOGGIA_WIDTH)
]));
const OFFICE_RIGHT_SHOULDER_FACADE = Object.freeze(glassFacade('office_right_shoulder', {
    faceLength: RIGHT_SHOULDER_LENGTH,
    height: OFFICE_HEIGHT,
    defId: 'window_bgglassmirror_shoulder',
    endPierWidth: 0.55
}));
const OFFICE_SIDE_FACADE = Object.freeze(glassFacade('office_side', {
    faceLength: SIDE_LENGTH,
    height: OFFICE_HEIGHT,
    defId: 'window_bgglassmirror_side',
    endPierWidth: 0.8,
    moduleCount: 3
}));
const OFFICE_REAR_FACADE = Object.freeze(glassFacade('office_rear', {
    faceLength: BUILDING_WIDTH,
    height: OFFICE_HEIGHT,
    defId: 'window_bgglassmirror_crown',
    endPierWidth: 0.8,
    moduleCount: 5
}));
const CROWN_FRONT_FACADE = Object.freeze(glassFacade('crown_front', {
    faceLength: BUILDING_WIDTH,
    height: CROWN_HEIGHT,
    defId: 'window_bgglassmirror_crown',
    endPierWidth: 1,
    moduleCount: 5
}));
const CROWN_SIDE_FACADE = Object.freeze(glassFacade('crown_side', {
    faceLength: 24,
    height: CROWN_HEIGHT,
    defId: 'window_bgglassmirror_side',
    endPierWidth: 0.8,
    moduleCount: 3
}));
const CROWN_REAR_FACADE = Object.freeze(glassFacade('crown_rear', {
    faceLength: BUILDING_WIDTH,
    height: CROWN_HEIGHT,
    defId: 'window_bgglassmirror_crown',
    endPierWidth: 1,
    moduleCount: 5
}));

export const BG_GLASS_MIRROR_BUILDING_CONFIG = Object.freeze({
    id: 'bgglassmirror',
    name: 'BG Glass Mirror',
    materialSlots: Object.freeze({
        slots: {
            stone: {
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                wallBase: { roughness: 0.82, normalStrength: 0.18, tintHex: 0xd7d8d5 },
                tiling: { enabled: true, tileMeters: 0.7, tileMetersU: 0.7, tileMetersV: 0.7, uvEnabled: true }
            },
            curtain: {
                material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' },
                wallBase: { roughness: 0.34, normalStrength: 0.2, tintHex: 0x27333d }
            },
            trim: {
                material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' },
                wallBase: { roughness: 0.34, normalStrength: 0.2, tintHex: 0x27333d }
            }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_bgglassmirror_lobby',
            type: 'floor',
            floors: 1,
            floorHeight: LOBBY_HEIGHT,
            planOffset: 0,
            silhouette: LOBBY_SILHOUETTE,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.5, extrusion: 0.16, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'D' } }
        },
        {
            id: 'floor_bgglassmirror_podium',
            type: 'floor',
            floors: 1,
            floorHeight: PODIUM_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_previous' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.55, extrusion: 0.16, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'D' } }
        },
        {
            id: 'floor_bgglassmirror_office',
            type: 'floor',
            floors: OFFICE_FLOORS,
            floorHeight: OFFICE_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_default' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.48, extrusion: 0.18, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { F: 'D' } }
        },
        {
            id: 'floor_bgglassmirror_crown',
            type: 'floor',
            floors: 1,
            floorHeight: CROWN_HEIGHT,
            planOffset: 0,
            silhouette: CROWN_SILHOUETTE,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.55, extrusion: 0.16, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { D: 'B' } }
        },
        {
            id: 'roof_bgglassmirror',
            type: 'roof',
            props: {
                enabled: true,
                density: 0.7,
                edgeMarginMeters: 1.2,
                minSpacingMeters: 1.4,
                seedOffset: 37,
                types: ['roof_bulkhead', 'mech_box'],
                placements: [],
                materials: { tank: null, frame: null, bulkhead: null, mech: null }
            },
            ring: {
                enabled: true,
                innerRadius: 0.35,
                outerRadius: 0.24,
                height: 0.8,
                material: { kind: 'slot', id: 'trim' }
            },
            cornice: { enabled: false },
            roof: {
                type: 'Asphalt',
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                tiling: { enabled: true, tileMeters: 4, tileMetersU: 4, tileMetersV: 4, uvEnabled: true },
                color: 'default'
            }
        }
    ]),
    footprintLoops: Object.freeze([OFFICE_FOOTPRINT]),
    floors: 16,
    floorHeight: OFFICE_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_bgglassmirror_lobby: {
            A: LOBBY_FRONT_FACADE,
            C: LOBBY_REAR_FACADE,
            D: LOBBY_SIDE_FACADE
        },
        floor_bgglassmirror_podium: {
            A: PODIUM_FRONT_FACADE,
            C: PODIUM_REAR_FACADE,
            D: PODIUM_SIDE_FACADE
        },
        floor_bgglassmirror_office: {
            A: OFFICE_LEFT_BALCONY_FACADE,
            B: OFFICE_BOW_FACADE,
            C: OFFICE_RIGHT_SHOULDER_FACADE,
            D: OFFICE_SIDE_FACADE,
            E: OFFICE_REAR_FACADE
        },
        floor_bgglassmirror_crown: {
            A: CROWN_FRONT_FACADE,
            B: CROWN_SIDE_FACADE,
            C: CROWN_REAR_FACADE
        }
    }),
    windowDefinitions: Object.freeze({
        items: [
            screenDefinition({
                id: 'window_bgglassmirror_lobby',
                name: 'BG Glass Mirror Lobby Screen',
                width: 8.5,
                height: LOBBY_HEIGHT,
                columns: 3,
                glass: LOBBY_GLASS,
                frameWidth: 0.055,
                horizontalFrameWidth: 0.14,
                muntinWidth: 0.035
            }),
            screenDefinition({
                id: 'door_bgglassmirror_entry',
                name: 'BG Glass Mirror Double Entry',
                width: 5.8,
                height: LOBBY_HEIGHT,
                columns: 1,
                glass: LOBBY_GLASS,
                assetType: 'door',
                frameWidth: 0.09,
                horizontalFrameWidth: 0.1,
                muntinWidth: 0.04
            }),
            screenDefinition({
                id: 'window_bgglassmirror_bow',
                name: 'BG Glass Mirror Bow Screen',
                width: (OFFICE_ARC_LENGTH - 1.8) / 7,
                height: OFFICE_HEIGHT,
                columns: 1,
                frameWidth: 0.04,
                horizontalFrameWidth: 0.2,
                muntinWidth: 0.026
            }),
            screenDefinition({
                id: 'window_bgglassmirror_shoulder',
                name: 'BG Glass Mirror Shoulder Screen',
                width: RIGHT_SHOULDER_LENGTH - 1.1,
                height: OFFICE_HEIGHT,
                columns: 2,
                frameWidth: 0.045,
                horizontalFrameWidth: 0.18,
                muntinWidth: 0.03
            }),
            screenDefinition({
                id: 'window_bgglassmirror_balcony',
                name: 'BG Glass Mirror Recessed Balcony Screen',
                width: OFFICE_LOGGIA_WIDTH,
                height: OFFICE_HEIGHT,
                columns: 4,
                rows: 2,
                glass: LOBBY_GLASS,
                frameWidth: 0.05,
                horizontalFrameWidth: 0.16,
                muntinWidth: 0.035
            }),
            screenDefinition({
                id: 'window_bgglassmirror_side',
                name: 'BG Glass Mirror Side Screen',
                width: (SIDE_LENGTH - 1.6) / 3,
                height: OFFICE_HEIGHT,
                columns: 2,
                frameWidth: 0.04,
                horizontalFrameWidth: 0.18,
                muntinWidth: 0.027
            }),
            screenDefinition({
                id: 'window_bgglassmirror_crown',
                name: 'BG Glass Mirror Wide Screen',
                width: (BUILDING_WIDTH - 2) / 5,
                height: CROWN_HEIGHT,
                columns: 2,
                frameWidth: 0.04,
                horizontalFrameWidth: 0.2,
                muntinWidth: 0.026
            })
        ]
    })
});

export default BG_GLASS_MIRROR_BUILDING_CONFIG;
