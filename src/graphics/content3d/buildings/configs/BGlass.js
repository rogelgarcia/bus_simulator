// City building config: B Glass — a right-biased glass tower over a broad podium.
// A detached tower silhouette creates the occupied roof terrace, while paired
// recessed balcony stacks frame the central curtain wall on every tower floor.

const PODIUM_MIN_X = -27;
const PODIUM_MAX_X = 21;
const PODIUM_FRONT_Z = 14;
const PODIUM_REAR_Z = -14;
const PODIUM_WIDTH = PODIUM_MAX_X - PODIUM_MIN_X;
const PODIUM_DEPTH = PODIUM_FRONT_Z - PODIUM_REAR_Z;
const TOWER_MIN_X = -15;
const TOWER_MAX_X = 15;
const TOWER_FRONT_Z = 9;
const TOWER_REAR_Z = -13;
const TOWER_WIDTH = TOWER_MAX_X - TOWER_MIN_X;
const TOWER_DEPTH = TOWER_FRONT_Z - TOWER_REAR_Z;
const LOBBY_HEIGHT = 5.2;
const PODIUM_HEIGHT = 4.2;
const TOWER_HEIGHT = 3.4;
const TOWER_FLOORS = 17;
const CROWN_HEIGHT = 4.2;

function stableLoop(points, prefix) {
    return Object.freeze(points.map((point, index) => Object.freeze({
        ...point,
        cornerId: `${prefix}_corner_${index + 1}`,
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

const PODIUM_FOOTPRINT = stableLoop([
    { x: PODIUM_MAX_X, z: PODIUM_FRONT_Z, runId: 'A' },
    { x: PODIUM_MIN_X, z: PODIUM_FRONT_Z, runId: 'D' },
    { x: PODIUM_MIN_X, z: PODIUM_REAR_Z, runId: 'C' },
    { x: PODIUM_MAX_X, z: PODIUM_REAR_Z, runId: 'B' }
], 'bglass_podium');

const TOWER_SILHOUETTE = detachedSilhouette(stableLoop([
    { x: TOWER_MAX_X, z: TOWER_FRONT_Z, runId: 'A' },
    { x: TOWER_MIN_X, z: TOWER_FRONT_Z, runId: 'D' },
    { x: TOWER_MIN_X, z: TOWER_REAR_Z, runId: 'C' },
    { x: TOWER_MAX_X, z: TOWER_REAR_Z, runId: 'B' }
], 'bglass_tower'));

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const TOWER_GLASS = Object.freeze({
    opacity: 0.84,
    tintHex: 0x6389a3,
    reflection: Object.freeze({
        metalness: 0.64,
        roughness: 0.055,
        transmission: 0.34,
        ior: 1.62,
        envMapIntensity: 3.8
    }),
    zOffset: -0.03
});

const LOBBY_GLASS = Object.freeze({
    opacity: 0.9,
    tintHex: 0x7897a8,
    reflection: Object.freeze({
        metalness: 0.44,
        roughness: 0.045,
        transmission: 0.56,
        ior: 1.58,
        envMapIntensity: 3.2
    }),
    zOffset: -0.035
});

const FRAME_MATERIAL = Object.freeze({
    roughness: 0.24,
    metalness: 0.72,
    envMapIntensity: 1.6,
    normalStrength: 0.18
});

function openingPlacement(defId, {
    width,
    height,
    assetType = 'window',
    depthMeters = 0.32
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

function structuralBay(id, widthMeters, projection = 0.08) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        depth: { left: projection, right: projection, linked: true },
        wallMaterialOverride: { kind: 'slot', id: 'frame' }
    };
}

function openingBay(id, widthMeters, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: { kind: 'slot', id: 'metal' },
        window
    };
}

function recessedBalconyBay(id, widthMeters, {
    defId = 'window_bglass_balcony',
    height = TOWER_HEIGHT,
    depth = -1.45
} = {}) {
    return {
        ...openingBay(id, widthMeters, openingPlacement(defId, {
            width: widthMeters,
            height,
            depthMeters: 0.16
        })),
        depth: { left: depth, right: depth, linked: true },
        balcony: {
            enabled: true,
            presetId: 'balcony.modern_recessed',
            platform: { material: { kind: 'slot', id: 'metal' } }
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
    endPierWidth = 0.35,
    moduleCount = 1,
    glazingDepth = 0.3
}) {
    const count = Math.max(1, Math.round(moduleCount));
    const glassWidth = (faceLength - endPierWidth * 2) / count;
    const items = [structuralBay(`${prefix}_pier_start`, endPierWidth)];
    for (let index = 0; index < count; index++) {
        items.push(openingBay(`${prefix}_glass_${index + 1}`, glassWidth, openingPlacement(defId, {
            width: glassWidth,
            height,
            depthMeters: glazingDepth
        })));
    }
    items.push(structuralBay(`${prefix}_pier_end`, endPierWidth));
    return facadeFromItems(items);
}

function lobbyFrontFacade() {
    const endPierWidth = 0.8;
    const entryPierWidth = 0.45;
    const entryWidth = 5.8;
    const glassWidth = (PODIUM_WIDTH - endPierWidth * 2 - entryPierWidth * 2 - entryWidth) / 4;
    return facadeFromItems([
        structuralBay('bglass_lobby_pier_start', endPierWidth),
        openingBay('bglass_lobby_glass_1', glassWidth, openingPlacement('window_bglass_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.24
        })),
        openingBay('bglass_lobby_glass_2', glassWidth, openingPlacement('window_bglass_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.24
        })),
        structuralBay('bglass_lobby_entry_pier_right', entryPierWidth),
        openingBay('bglass_lobby_entry', entryWidth, openingPlacement('door_bglass_entry', {
            width: entryWidth,
            height: LOBBY_HEIGHT,
            assetType: 'door',
            depthMeters: 0.26
        })),
        structuralBay('bglass_lobby_entry_pier_left', entryPierWidth),
        openingBay('bglass_lobby_glass_3', glassWidth, openingPlacement('window_bglass_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.24
        })),
        openingBay('bglass_lobby_glass_4', glassWidth, openingPlacement('window_bglass_lobby', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            depthMeters: 0.24
        })),
        structuralBay('bglass_lobby_pier_end', endPierWidth)
    ]);
}

function towerFrontFacade() {
    const endPierWidth = 0.3;
    const edgeGlassWidth = 2;
    const balconyWidth = 5;
    const separatorWidth = 0.25;
    const centerModuleCount = 5;
    const centerWidth = (
        TOWER_WIDTH
        - endPierWidth * 2
        - edgeGlassWidth * 2
        - balconyWidth * 2
        - separatorWidth * 4
    );
    const centerModuleWidth = centerWidth / centerModuleCount;
    const centerModules = Array.from({ length: centerModuleCount }, (_, index) => openingBay(
        `bglass_tower_center_glass_${index + 1}`,
        centerModuleWidth,
        openingPlacement('window_bglass_tower', {
            width: centerModuleWidth,
            height: TOWER_HEIGHT,
            depthMeters: 0.24
        })
    ));
    return facadeFromItems([
        structuralBay('bglass_tower_pier_right', endPierWidth),
        openingBay('bglass_tower_edge_glass_right', edgeGlassWidth, openingPlacement('window_bglass_edge', {
            width: edgeGlassWidth,
            height: TOWER_HEIGHT,
            depthMeters: 0.22
        })),
        structuralBay('bglass_tower_stack_divider_right_outer', separatorWidth, 0.04),
        recessedBalconyBay('bglass_tower_balcony_right', balconyWidth),
        structuralBay('bglass_tower_stack_divider_right_inner', separatorWidth, 0.04),
        ...centerModules,
        structuralBay('bglass_tower_stack_divider_left_inner', separatorWidth, 0.04),
        recessedBalconyBay('bglass_tower_balcony_left', balconyWidth),
        structuralBay('bglass_tower_stack_divider_left_outer', separatorWidth, 0.04),
        openingBay('bglass_tower_edge_glass_left', edgeGlassWidth, openingPlacement('window_bglass_edge', {
            width: edgeGlassWidth,
            height: TOWER_HEIGHT,
            depthMeters: 0.22
        })),
        structuralBay('bglass_tower_pier_left', endPierWidth)
    ]);
}

function crownFrontFacade() {
    const rightPierWidth = 0.3;
    const terraceSeparatorWidth = 0.3;
    const terraceWidth = 5.2;
    const glassModuleCount = 5;
    const glassWidth = (
        TOWER_WIDTH
        - rightPierWidth
        - terraceSeparatorWidth
        - terraceWidth
    ) / glassModuleCount;
    const glassModules = Array.from({ length: glassModuleCount }, (_, index) => openingBay(
        `bglass_crown_glass_${index + 1}`,
        glassWidth,
        openingPlacement('window_bglass_crown', {
            width: glassWidth,
            height: CROWN_HEIGHT,
            depthMeters: 0.22
        })
    ));
    return facadeFromItems([
        structuralBay('bglass_crown_pier_right', rightPierWidth),
        ...glassModules,
        structuralBay('bglass_crown_terrace_separator', terraceSeparatorWidth, 0.04),
        recessedBalconyBay('bglass_crown_left_corner_terrace', terraceWidth, {
            defId: 'window_bglass_balcony',
            height: CROWN_HEIGHT,
            depth: -1.5
        })
    ]);
}

function screenDefinition({
    id,
    name,
    width,
    height,
    columns,
    rows = 1,
    glass = TOWER_GLASS,
    assetType = 'window',
    frameWidth = 0.035,
    horizontalFrameWidth = 0.055,
    muntinWidth = 0.02
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
                depth: 0.08,
                inset: 0.018,
                openBottom: isDoor,
                doorBottomFrame: isDoor
                    ? { enabled: true, mode: 'match', heightMeters: 0.24 }
                    : { enabled: false, mode: 'match' },
                addHandles: isDoor,
                colorHex: 0x26343d,
                bevel: { size: 0.004, roundness: 0.35 },
                material: FRAME_MATERIAL,
                ...(isDoor ? {
                    doorStyle: 'double',
                    doorKickPanel: { enabled: true, heightMeters: 0.24 },
                    handleCenterHeightMeters: 1.05,
                    handleScale: 1.5,
                    doorCenterFrame: { leftMode: 'match', rightMode: 'none' }
                } : {})
            },
            muntins: {
                enabled: hasMuntins,
                columns,
                rows,
                verticalWidth: muntinWidth,
                horizontalWidth: Math.max(muntinWidth, 0.035),
                depth: 0.06,
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x26343d,
                bevel: { inherit: true, bevel: { size: 0.003, roundness: 0.35 } },
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
const LOBBY_SIDE_FACADE = Object.freeze(glassFacade('bglass_lobby_side', {
    faceLength: PODIUM_DEPTH,
    height: LOBBY_HEIGHT,
    defId: 'window_bglass_lobby',
    endPierWidth: 0.65,
    moduleCount: 4,
    glazingDepth: 0.24
}));
const LOBBY_REAR_FACADE = Object.freeze(glassFacade('bglass_lobby_rear', {
    faceLength: PODIUM_WIDTH,
    height: LOBBY_HEIGHT,
    defId: 'window_bglass_podium',
    endPierWidth: 0.8,
    moduleCount: 7,
    glazingDepth: 0.24
}));
const PODIUM_FRONT_FACADE = Object.freeze(glassFacade('bglass_podium_front', {
    faceLength: PODIUM_WIDTH,
    height: PODIUM_HEIGHT,
    defId: 'window_bglass_podium',
    endPierWidth: 0.65,
    moduleCount: 7,
    glazingDepth: 0.25
}));
const PODIUM_SIDE_FACADE = Object.freeze(glassFacade('bglass_podium_side', {
    faceLength: PODIUM_DEPTH,
    height: PODIUM_HEIGHT,
    defId: 'window_bglass_side',
    endPierWidth: 0.55,
    moduleCount: 4,
    glazingDepth: 0.25
}));
const PODIUM_REAR_FACADE = Object.freeze(glassFacade('bglass_podium_rear', {
    faceLength: PODIUM_WIDTH,
    height: PODIUM_HEIGHT,
    defId: 'window_bglass_podium',
    endPierWidth: 0.65,
    moduleCount: 7,
    glazingDepth: 0.25
}));
const TOWER_FRONT_FACADE = Object.freeze(towerFrontFacade());
const TOWER_SIDE_FACADE = Object.freeze(glassFacade('bglass_tower_side', {
    faceLength: TOWER_DEPTH,
    height: TOWER_HEIGHT,
    defId: 'window_bglass_side',
    endPierWidth: 0.3,
    moduleCount: 4,
    glazingDepth: 0.24
}));
const TOWER_REAR_FACADE = Object.freeze(glassFacade('bglass_tower_rear', {
    faceLength: TOWER_WIDTH,
    height: TOWER_HEIGHT,
    defId: 'window_bglass_tower',
    endPierWidth: 0.3,
    moduleCount: 6,
    glazingDepth: 0.24
}));
const CROWN_FRONT_FACADE = Object.freeze(crownFrontFacade());
const CROWN_SIDE_FACADE = Object.freeze(glassFacade('bglass_crown_side', {
    faceLength: TOWER_DEPTH,
    height: CROWN_HEIGHT,
    defId: 'window_bglass_crown',
    endPierWidth: 0.3,
    moduleCount: 4,
    glazingDepth: 0.22
}));
const CROWN_REAR_FACADE = Object.freeze(glassFacade('bglass_crown_rear', {
    faceLength: TOWER_WIDTH,
    height: CROWN_HEIGHT,
    defId: 'window_bglass_crown',
    endPierWidth: 0.3,
    moduleCount: 6,
    glazingDepth: 0.22
}));

export const B_GLASS_BUILDING_CONFIG = Object.freeze({
    id: 'bglass',
    name: 'B Glass',
    materialSlots: Object.freeze({
        slots: {
            frame: {
                material: { kind: 'color', id: 'offwhite' },
                wallBase: { roughness: 0.68, normalStrength: 0.08, tintHex: 0xc5cacb },
                tiling: { enabled: false, tileMeters: 1, tileMetersU: 1, tileMetersV: 1, uvEnabled: false }
            },
            metal: {
                material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' },
                wallBase: { roughness: 0.3, normalStrength: 0.15, tintHex: 0x26343d }
            }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_bglass_lobby',
            type: 'floor',
            floors: 1,
            floorHeight: LOBBY_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_default' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'frame' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.32, extrusion: 0.08, material: { kind: 'slot', id: 'frame' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'D' } }
        },
        {
            id: 'floor_bglass_podium',
            type: 'floor',
            floors: 1,
            floorHeight: PODIUM_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_previous' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'frame' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.24, extrusion: 0.08, material: { kind: 'slot', id: 'frame' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'D' } }
        },
        {
            id: 'roof_bglass_podium_terrace',
            type: 'roof',
            props: { enabled: false },
            ring: { enabled: false },
            cornice: { enabled: false },
            roof: {
                type: 'Asphalt',
                material: { kind: 'color', id: 'offwhite' },
                tiling: { enabled: false, tileMeters: 1, tileMetersU: 1, tileMetersV: 1, uvEnabled: false },
                color: 'offwhite'
            }
        },
        {
            id: 'floor_bglass_tower',
            type: 'floor',
            floors: TOWER_FLOORS,
            floorHeight: TOWER_HEIGHT,
            planOffset: 0,
            silhouette: TOWER_SILHOUETTE,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'metal' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.14, extrusion: 0.08, material: { kind: 'slot', id: 'metal' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'D' } }
        },
        {
            id: 'floor_bglass_crown',
            type: 'floor',
            floors: 1,
            floorHeight: CROWN_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_previous' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'metal' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.12, extrusion: 0.06, material: { kind: 'slot', id: 'metal' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'D' } }
        },
        {
            id: 'roof_bglass',
            type: 'roof',
            props: { enabled: false },
            ring: {
                enabled: true,
                innerRadius: 0.24,
                outerRadius: 0.14,
                height: 0.45,
                material: { kind: 'slot', id: 'metal' }
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
    footprintLoops: Object.freeze([PODIUM_FOOTPRINT]),
    floors: 20,
    floorHeight: TOWER_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_bglass_lobby: {
            A: LOBBY_FRONT_FACADE,
            C: LOBBY_REAR_FACADE,
            D: LOBBY_SIDE_FACADE
        },
        floor_bglass_podium: {
            A: PODIUM_FRONT_FACADE,
            C: PODIUM_REAR_FACADE,
            D: PODIUM_SIDE_FACADE
        },
        floor_bglass_tower: {
            A: TOWER_FRONT_FACADE,
            C: TOWER_REAR_FACADE,
            D: TOWER_SIDE_FACADE
        },
        floor_bglass_crown: {
            A: CROWN_FRONT_FACADE,
            C: CROWN_REAR_FACADE,
            D: CROWN_SIDE_FACADE
        }
    }),
    windowDefinitions: Object.freeze({
        items: [
            screenDefinition({
                id: 'window_bglass_lobby',
                name: 'B Glass Lobby Screen',
                width: 9.9,
                height: LOBBY_HEIGHT,
                columns: 3,
                glass: LOBBY_GLASS,
                frameWidth: 0.045,
                horizontalFrameWidth: 0.065,
                muntinWidth: 0.027
            }),
            screenDefinition({
                id: 'door_bglass_entry',
                name: 'B Glass Double Entry',
                width: 5.8,
                height: LOBBY_HEIGHT,
                columns: 1,
                glass: LOBBY_GLASS,
                assetType: 'door',
                frameWidth: 0.075,
                horizontalFrameWidth: 0.07,
                muntinWidth: 0.03
            }),
            screenDefinition({
                id: 'window_bglass_podium',
                name: 'B Glass Podium Screen',
                width: 6.7,
                height: PODIUM_HEIGHT,
                columns: 3,
                glass: LOBBY_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.055,
                muntinWidth: 0.022
            }),
            screenDefinition({
                id: 'window_bglass_tower',
                name: 'B Glass Tower Panel',
                width: 2.9,
                height: TOWER_HEIGHT,
                columns: 1
            }),
            screenDefinition({
                id: 'window_bglass_edge',
                name: 'B Glass Tower Edge Panel',
                width: 2,
                height: TOWER_HEIGHT,
                columns: 1
            }),
            screenDefinition({
                id: 'window_bglass_balcony',
                name: 'B Glass Balcony Screen',
                width: 5.2,
                height: TOWER_HEIGHT,
                columns: 2,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.06,
                muntinWidth: 0.022
            }),
            screenDefinition({
                id: 'window_bglass_side',
                name: 'B Glass Side Screen',
                width: 5.35,
                height: TOWER_HEIGHT,
                columns: 2
            }),
            screenDefinition({
                id: 'window_bglass_crown',
                name: 'B Glass Crown Screen',
                width: 4.85,
                height: CROWN_HEIGHT,
                columns: 2,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.055,
                muntinWidth: 0.022
            })
        ]
    })
});

export default B_GLASS_BUILDING_CONFIG;
