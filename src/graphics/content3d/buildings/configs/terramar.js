// City building config: Terra & Mar — a seven-storey coastal mixed-use
// building with a two-level limestone restaurant podium and five residential
// floors wrapped by projecting glass balconies.
//
// BF2's circular facade runs do not yet bend balcony slabs or railings. The
// softened reference corners are therefore authored as eight stable straight
// runs. The residential wall is a true parallel inset of the podium and the
// balcony depth equals that inset, so the segmented outer balcony line lands
// on the podium silhouette without floating past it.

const PODIUM_HALF_WIDTH = 14;
const PODIUM_HALF_DEPTH = 11;
const PODIUM_FRONT_HALF = 7;
const PODIUM_SHOULDER_Z = 4;
const BALCONY_DEPTH = 1.5;
const ENTRANCE_PROJECTION = 1.15;
const TOWER_HALF_WIDTH = 12.5;
const TOWER_HALF_DEPTH = 9.5;
const TOWER_FRONT_HALF = 6.4;
const TOWER_SHOULDER_Z = 3.4;
const PODIUM_FRONT_LENGTH = PODIUM_FRONT_HALF * 2;
const PODIUM_CHAMFER_LENGTH = Math.hypot(
    PODIUM_HALF_WIDTH - PODIUM_FRONT_HALF,
    PODIUM_HALF_DEPTH - PODIUM_SHOULDER_Z
);
const PODIUM_SIDE_LENGTH = PODIUM_SHOULDER_Z * 2;
const TOWER_FRONT_LENGTH = TOWER_FRONT_HALF * 2;
const TOWER_CHAMFER_LENGTH = Math.hypot(
    TOWER_HALF_WIDTH - TOWER_FRONT_HALF,
    TOWER_HALF_DEPTH - TOWER_SHOULDER_Z
);
const TOWER_SIDE_LENGTH = TOWER_SHOULDER_Z * 2;
const GROUND_HEIGHT = 4.8;
const PODIUM_HEIGHT = 4.3;
const RESIDENTIAL_HEIGHT = 3.35;
const RESIDENTIAL_FLOORS = 5;

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
    { x: PODIUM_FRONT_HALF, z: PODIUM_HALF_DEPTH, runId: 'A' },
    { x: -PODIUM_FRONT_HALF, z: PODIUM_HALF_DEPTH, runId: 'H' },
    { x: -PODIUM_HALF_WIDTH, z: PODIUM_SHOULDER_Z, runId: 'G' },
    { x: -PODIUM_HALF_WIDTH, z: -PODIUM_SHOULDER_Z, runId: 'F' },
    { x: -PODIUM_FRONT_HALF, z: -PODIUM_HALF_DEPTH, runId: 'E' },
    { x: PODIUM_FRONT_HALF, z: -PODIUM_HALF_DEPTH, runId: 'D' },
    { x: PODIUM_HALF_WIDTH, z: -PODIUM_SHOULDER_Z, runId: 'C' },
    { x: PODIUM_HALF_WIDTH, z: PODIUM_SHOULDER_Z, runId: 'B' }
], 'b8_podium');

const TOWER_SILHOUETTE = detachedSilhouette(stableLoop([
    { x: TOWER_FRONT_HALF, z: TOWER_HALF_DEPTH, runId: 'A' },
    { x: -TOWER_FRONT_HALF, z: TOWER_HALF_DEPTH, runId: 'H' },
    { x: -TOWER_HALF_WIDTH, z: TOWER_SHOULDER_Z, runId: 'G' },
    { x: -TOWER_HALF_WIDTH, z: -TOWER_SHOULDER_Z, runId: 'F' },
    { x: -TOWER_FRONT_HALF, z: -TOWER_HALF_DEPTH, runId: 'E' },
    { x: TOWER_FRONT_HALF, z: -TOWER_HALF_DEPTH, runId: 'D' },
    { x: TOWER_HALF_WIDTH, z: -TOWER_SHOULDER_Z, runId: 'C' },
    { x: TOWER_HALF_WIDTH, z: TOWER_SHOULDER_Z, runId: 'B' }
], 'b8_tower'));

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const STOREFRONT_GLASS = Object.freeze({
    opacity: 0.88,
    tintHex: 0x78979d,
    reflection: Object.freeze({
        metalness: 0.28,
        roughness: 0.07,
        transmission: 0.66,
        ior: 1.52,
        envMapIntensity: 2.8
    }),
    zOffset: -0.035
});

const RESIDENTIAL_GLASS = Object.freeze({
    opacity: 0.84,
    tintHex: 0x3f6670,
    reflection: Object.freeze({
        metalness: 0.58,
        roughness: 0.055,
        transmission: 0.42,
        ior: 1.6,
        envMapIntensity: 3.5
    }),
    zOffset: -0.03
});

const DARK_FRAME_MATERIAL = Object.freeze({
    roughness: 0.24,
    metalness: 0.7,
    envMapIntensity: 1.6,
    normalStrength: 0.15
});

const SHOP_STOREFRONT = Object.freeze({
    bulkhead: { enabled: false },
    transom: { mode: 'none', heightMeters: 0, columns: 3, insetMeters: 0.03 },
    fascia: { enabled: false },
    minGlazingHeightMeters: 2.8
});

const ENTRY_STOREFRONT = Object.freeze({
    bulkhead: { enabled: false },
    transom: { mode: 'glazed', heightMeters: 0.7, columns: 4, insetMeters: 0.03 },
    fascia: { enabled: false },
    minGlazingHeightMeters: 2.8
});

function openingPlacement(defId, {
    width,
    height,
    assetType = 'window',
    heightMode = 'fixed',
    verticalOffsetMeters = 0.15,
    paddingMeters = 0.08,
    depthMeters = 0.24,
    interior = 'shop'
}) {
    const assetWidth = Math.max(0.1, width - paddingMeters * 2);
    return {
        enabled: true,
        defId,
        assetType,
        size: { widthMeters: assetWidth, heightMeters: height },
        heightMode,
        verticalOffsetMeters,
        width: { minMeters: assetWidth, maxMeters: null },
        padding: { leftMeters: paddingMeters, rightMeters: paddingMeters },
        repeat: { count: 1 },
        muntins: { bottomEnabled: assetType !== 'door', topEnabled: true },
        visual: { disableShades: true, interior },
        depthMeters,
        top: { enabled: false },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

function fixedBay(id, widthMeters, {
    material = null,
    projection = 0
} = {}) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        ...(projection ? { depth: { left: projection, right: projection, linked: true } } : {}),
        wallMaterialOverride: material
    };
}

function openingBay(id, widthMeters, window, material = null) {
    return {
        ...fixedBay(id, widthMeters, { material }),
        window
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

function groundFrontFacade() {
    return facadeFromItems([
        fixedBay('b8_ground_pier_right', 0.5, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        openingBay('b8_ground_storefront_right', 1.8, openingPlacement('window_b8_storefront', {
            width: 1.8,
            height: 3.5
        })),
        fixedBay('b8_ground_divider_right', 0.4, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        {
            ...openingBay('b8_ground_entry', 8.6, openingPlacement('storefront_b8_entry', {
                width: 8.6,
                height: 3.5,
                assetType: 'storefront',
                verticalOffsetMeters: 0.08,
                paddingMeters: 0.12,
                interior: 'shop'
            }), { kind: 'slot', id: 'stone' }),
            depth: { left: ENTRANCE_PROJECTION, right: ENTRANCE_PROJECTION, linked: true }
        },
        fixedBay('b8_ground_divider_left', 0.4, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        openingBay('b8_ground_storefront_left', 1.8, openingPlacement('window_b8_storefront', {
            width: 1.8,
            height: 3.5
        })),
        fixedBay('b8_ground_pier_left', 0.5, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 })
    ]);
}

function framedStorefrontFacade(prefix, faceLength, defId, {
    height = 3.15,
    verticalOffsetMeters = 0.15,
    pierWidth = 0.45
} = {}) {
    const openingWidth = faceLength - pierWidth * 2;
    return facadeFromItems([
        fixedBay(`${prefix}_pier_start`, pierWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.05 }),
        openingBay(`${prefix}_glass`, openingWidth, openingPlacement(defId, {
            width: openingWidth,
            height,
            verticalOffsetMeters
        })),
        fixedBay(`${prefix}_pier_end`, pierWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.05 })
    ]);
}

function podiumFrontFacade() {
    const endPierWidth = 0.55;
    const dividerWidth = 0.45;
    const sideGlassWidth = 1.9;
    const terraceWidth = PODIUM_FRONT_LENGTH
        - endPierWidth * 2
        - dividerWidth * 2
        - sideGlassWidth * 2;
    const terraceWindow = openingPlacement('window_b8_podium_terrace', {
        width: terraceWidth,
        height: PODIUM_HEIGHT,
        heightMode: 'full',
        verticalOffsetMeters: 0,
        paddingMeters: 0.25,
        depthMeters: 0.22
    });
    return facadeFromItems([
        fixedBay('b8_podium_pier_right', endPierWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        openingBay('b8_podium_window_right', sideGlassWidth, openingPlacement('window_b8_podium', {
            width: sideGlassWidth,
            height: 3.2,
            verticalOffsetMeters: 0.32
        })),
        fixedBay('b8_podium_divider_right', dividerWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        {
            ...openingBay('b8_podium_terrace', terraceWidth, terraceWindow, { kind: 'slot', id: 'wood' }),
            balcony: {
                enabled: true,
                presetId: 'balcony.modern_glass_projecting',
                platform: {
                    depthMeters: ENTRANCE_PROJECTION,
                    thicknessMeters: 0.2,
                    widthMode: 'bay',
                    sideMarginMeters: 0,
                    material: { kind: 'slot', id: 'stone' }
                },
                railing: {
                    heightMeters: 1.02,
                    posts: { enabled: true, widthMeters: 0.04, maxSpacingMeters: 1.6 },
                    glass: { opacity: 0.25, tintHex: 0xb4ccd0 }
                },
                sides: { left: 'always', front: 'always', right: 'always' }
            }
        },
        fixedBay('b8_podium_divider_left', dividerWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        openingBay('b8_podium_window_left', sideGlassWidth, openingPlacement('window_b8_podium', {
            width: sideGlassWidth,
            height: 3.2,
            verticalOffsetMeters: 0.32
        })),
        fixedBay('b8_podium_pier_left', endPierWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 })
    ]);
}

function projectingBalconyFacade(prefix, faceLength, defId) {
    const pierWidth = 0.55;
    const balconyWidth = faceLength - pierWidth * 2;
    const window = openingPlacement(defId, {
        width: balconyWidth,
        height: 2.65,
        heightMode: 'fixed',
        verticalOffsetMeters: 0.22,
        paddingMeters: 0.28,
        depthMeters: 0.2,
        interior: 'res'
    });
    return facadeFromItems([
        fixedBay(`${prefix}_pier_start`, pierWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 }),
        {
            ...openingBay(`${prefix}_balcony`, balconyWidth, window, { kind: 'slot', id: 'wood' }),
            balcony: {
                enabled: true,
                presetId: 'balcony.modern_glass_projecting',
                platform: {
                    depthMeters: BALCONY_DEPTH,
                    thicknessMeters: 0.22,
                    widthMode: 'bay',
                    sideMarginMeters: 0,
                    material: { kind: 'slot', id: 'stone' }
                },
                railing: {
                    heightMeters: 1.02,
                    insetMeters: 0.04,
                    colorHex: 0x343735,
                    roughness: 0.38,
                    metalness: 0.72,
                    topRail: { enabled: true, widthMeters: 0.055, heightMeters: 0.04 },
                    posts: { enabled: true, widthMeters: 0.04, maxSpacingMeters: 1.6 },
                    glass: { opacity: 0.25, tintHex: 0xb4ccd0 }
                },
                sides: { left: 'always', front: 'always', right: 'always' }
            },
        },
        fixedBay(`${prefix}_pier_end`, pierWidth, { material: { kind: 'slot', id: 'stone' }, projection: 0.06 })
    ]);
}

function screenDefinition({
    id,
    name,
    width,
    height,
    columns,
    rows = 1,
    glass = STOREFRONT_GLASS,
    assetType = 'window',
    frameWidth = 0.045,
    horizontalFrameWidth = 0.055,
    muntinWidth = 0.028,
    door = null,
    storefront = null
}) {
    const isDoor = assetType === 'door' || !!door;
    const hasMuntins = columns > 1 || rows > 1;
    const defaultDoor = assetType === 'door' ? {
        doorStyle: 'double',
        doorKickPanel: { enabled: false, heightMeters: 0.2 },
        handleCenterHeightMeters: 1.05,
        handleScale: 1.8,
        doorCenterFrame: { leftMode: 'match', rightMode: 'none' }
    } : null;
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
                depth: 0.085,
                inset: 0.02,
                openBottom: isDoor,
                doorBottomFrame: isDoor
                    ? { enabled: true, mode: 'match', heightMeters: 0.16 }
                    : { enabled: false, mode: 'match' },
                addHandles: isDoor,
                colorHex: 0x292c2b,
                bevel: { size: 0.004, roundness: 0.35 },
                material: DARK_FRAME_MATERIAL,
                ...(door ?? defaultDoor ?? {})
            },
            muntins: {
                enabled: hasMuntins,
                columns,
                rows,
                verticalWidth: muntinWidth,
                horizontalWidth: Math.max(muntinWidth, 0.035),
                depth: 0.06,
                inset: 0.005,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x292c2b,
                bevel: { inherit: true, bevel: { size: 0.003, roundness: 0.35 } },
                material: { inheritFromFrame: true, pbr: DARK_FRAME_MATERIAL }
            },
            glass,
            shade: { enabled: false },
            interior: { enabled: false }
        },
        ...(storefront ? { storefront } : {}),
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

const GROUND_FRONT_FACADE = Object.freeze(groundFrontFacade());
const GROUND_CHAMFER_FACADE = Object.freeze(framedStorefrontFacade(
    'b8_ground_chamfer',
    PODIUM_CHAMFER_LENGTH,
    'window_b8_corner_storefront'
));
const GROUND_SIDE_FACADE = Object.freeze(framedStorefrontFacade(
    'b8_ground_side',
    PODIUM_SIDE_LENGTH,
    'window_b8_side_storefront'
));
const PODIUM_FRONT_FACADE = Object.freeze(podiumFrontFacade());
const PODIUM_CHAMFER_FACADE = Object.freeze(framedStorefrontFacade(
    'b8_podium_chamfer',
    PODIUM_CHAMFER_LENGTH,
    'window_b8_corner_podium',
    { height: 3.0, verticalOffsetMeters: 0.38 }
));
const PODIUM_SIDE_FACADE = Object.freeze(framedStorefrontFacade(
    'b8_podium_side',
    PODIUM_SIDE_LENGTH,
    'window_b8_side_podium',
    { height: 3.0, verticalOffsetMeters: 0.38 }
));
const RESIDENTIAL_FRONT_FACADE = Object.freeze(projectingBalconyFacade(
    'b8_residential_front',
    TOWER_FRONT_LENGTH,
    'window_b8_residential_front'
));
const RESIDENTIAL_CHAMFER_FACADE = Object.freeze(projectingBalconyFacade(
    'b8_residential_chamfer',
    TOWER_CHAMFER_LENGTH,
    'window_b8_residential_chamfer'
));
const RESIDENTIAL_SIDE_FACADE = Object.freeze(projectingBalconyFacade(
    'b8_residential_side',
    TOWER_SIDE_LENGTH,
    'window_b8_residential_side'
));

export const TERRA_MAR_BUILDING_CONFIG = Object.freeze({
    id: 'terramar',
    name: 'Terra & Mar',
    materialSlots: Object.freeze({
        slots: {
            stone: {
                material: { kind: 'texture', id: 'pbr.limestone_smooth' },
                wallBase: { roughness: 0.78, normalStrength: 0.16, tintHex: 0xe3d7bd },
                tiling: { enabled: true, tileMeters: 2.2, tileMetersU: 2.2, tileMetersV: 2.2, uvEnabled: true }
            },
            wood: {
                material: { kind: 'texture', id: 'pbr.seaworn_sandstone_brick' },
                wallBase: { roughness: 0.72, metalness: 0, normalStrength: 0.35, tintHex: 0xb77948 },
                tiling: { enabled: true, tileMeters: 1.4, tileMetersU: 1.4, tileMetersV: 1.4, uvEnabled: true }
            },
            metal: {
                material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' },
                wallBase: { roughness: 0.3, normalStrength: 0.14, tintHex: 0x343735 }
            }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_b8_ground',
            type: 'floor',
            floors: 1,
            floorHeight: GROUND_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_default' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.24, extrusion: 0.1, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'H', C: 'G', D: 'A', E: 'H', F: 'G' } }
        },
        {
            id: 'floor_b8_podium',
            type: 'floor',
            floors: 1,
            floorHeight: PODIUM_HEIGHT,
            planOffset: 0,
            silhouette: Object.freeze({ version: 1, mode: 'inherit_previous' }),
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.3, extrusion: 0.12, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'H', C: 'G', D: 'A', E: 'H', F: 'G' } }
        },
        {
            id: 'roof_b8_podium_terrace',
            type: 'roof',
            props: { enabled: false },
            ring: { enabled: false },
            cornice: { enabled: false },
            roof: {
                type: 'Asphalt',
                material: { kind: 'slot', id: 'stone' },
                tiling: { enabled: true, tileMeters: 2.2, tileMetersU: 2.2, tileMetersV: 2.2, uvEnabled: true },
                color: 'offwhite'
            }
        },
        {
            id: 'floor_b8_residential',
            type: 'floor',
            floors: RESIDENTIAL_FLOORS,
            floorHeight: RESIDENTIAL_HEIGHT,
            planOffset: 0,
            silhouette: TOWER_SILHOUETTE,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: true, height: 0.22, extrusion: 0.12, material: { kind: 'slot', id: 'stone' } },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'H', C: 'G', D: 'A', E: 'H', F: 'G' } }
        },
        {
            id: 'roof_b8',
            type: 'roof',
            props: { enabled: false },
            ring: {
                enabled: true,
                innerRadius: 0.22,
                outerRadius: 0.14,
                height: 0.5,
                material: { kind: 'slot', id: 'stone' }
            },
            cornice: { enabled: false },
            roof: {
                type: 'Asphalt',
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                tiling: { enabled: true, tileMeters: 3.5, tileMetersU: 3.5, tileMetersV: 3.5, uvEnabled: true },
                color: 'default'
            }
        }
    ]),
    footprintLoops: Object.freeze([PODIUM_FOOTPRINT]),
    floors: 7,
    floorHeight: RESIDENTIAL_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_b8_ground: {
            A: GROUND_FRONT_FACADE,
            B: GROUND_CHAMFER_FACADE,
            C: GROUND_SIDE_FACADE,
            G: GROUND_SIDE_FACADE,
            H: GROUND_CHAMFER_FACADE
        },
        floor_b8_podium: {
            A: PODIUM_FRONT_FACADE,
            B: PODIUM_CHAMFER_FACADE,
            C: PODIUM_SIDE_FACADE,
            G: PODIUM_SIDE_FACADE,
            H: PODIUM_CHAMFER_FACADE
        },
        floor_b8_residential: {
            A: RESIDENTIAL_FRONT_FACADE,
            B: RESIDENTIAL_CHAMFER_FACADE,
            C: RESIDENTIAL_SIDE_FACADE,
            D: RESIDENTIAL_FRONT_FACADE,
            E: RESIDENTIAL_CHAMFER_FACADE,
            F: RESIDENTIAL_SIDE_FACADE,
            G: RESIDENTIAL_SIDE_FACADE,
            H: RESIDENTIAL_CHAMFER_FACADE
        }
    }),
    wallDecorations: Object.freeze({
        lettering: [
            {
                id: 'sign_b8_name',
                text: 'TERRA & MAR',
                target: {
                    layerId: 'floor_b8_ground',
                    bayRef: 'A:b8_ground_entry',
                    zone: 'opening_header',
                    floor: 1,
                    yOffsetMeters: 0.3
                },
                heightMeters: 0.5,
                depthMeters: 0.06,
                letterSpacingRatio: 0.2,
                material: { kind: 'color', id: 'brown' }
            },
            {
                id: 'sign_b8_subtitle',
                text: 'COASTAL KITCHEN',
                target: {
                    layerId: 'floor_b8_ground',
                    bayRef: 'A:b8_ground_entry',
                    zone: 'opening_header',
                    floor: 1,
                    yOffsetMeters: -0.32
                },
                heightMeters: 0.22,
                depthMeters: 0.055,
                letterSpacingRatio: 0.18,
                material: { kind: 'color', id: 'brown' }
            }
        ]
    }),
    windowDefinitions: Object.freeze({
        items: [
            screenDefinition({
                id: 'window_b8_storefront',
                name: 'Terra & Mar Ground Storefront',
                width: 1.64,
                height: 3.5,
                columns: 1,
                storefront: SHOP_STOREFRONT
            }),
            screenDefinition({
                id: 'storefront_b8_entry',
                name: 'Terra & Mar Entry Storefront',
                width: 8.36,
                height: 3.5,
                columns: 4,
                assetType: 'storefront',
                frameWidth: 0.07,
                horizontalFrameWidth: 0.065,
                door: {
                    doorStyle: 'double',
                    doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.14 },
                    doorCenterFrame: { leftMode: 'match', rightMode: 'none' },
                    doorKickPanel: { enabled: false, heightMeters: 0.2 },
                    handleStyle: 'c_pull',
                    handleCenterHeightMeters: 1.05,
                    handleScale: 2,
                    handleMaterialMode: 'metal',
                    handleColorHex: 0x858d91
                },
                storefront: ENTRY_STOREFRONT
            }),
            screenDefinition({
                id: 'window_b8_corner_storefront',
                name: 'Terra & Mar Corner Storefront',
                width: PODIUM_CHAMFER_LENGTH - 1.06,
                height: 3.5,
                columns: 4,
                storefront: SHOP_STOREFRONT
            }),
            screenDefinition({
                id: 'window_b8_side_storefront',
                name: 'Terra & Mar Side Storefront',
                width: PODIUM_SIDE_LENGTH - 1.06,
                height: 3.5,
                columns: 3,
                storefront: SHOP_STOREFRONT
            }),
            screenDefinition({
                id: 'window_b8_podium',
                name: 'Terra & Mar Podium Window',
                width: 1.74,
                height: 3.2,
                columns: 2
            }),
            screenDefinition({
                id: 'window_b8_podium_terrace',
                name: 'Terra & Mar Podium Terrace Screen',
                width: 7.7,
                height: PODIUM_HEIGHT,
                columns: 4
            }),
            screenDefinition({
                id: 'window_b8_corner_podium',
                name: 'Terra & Mar Corner Podium Window',
                width: PODIUM_CHAMFER_LENGTH - 1.06,
                height: 3.2,
                columns: 4
            }),
            screenDefinition({
                id: 'window_b8_side_podium',
                name: 'Terra & Mar Side Podium Window',
                width: PODIUM_SIDE_LENGTH - 1.06,
                height: 3.2,
                columns: 3
            }),
            screenDefinition({
                id: 'window_b8_residential_front',
                name: 'Terra & Mar Residential Front Slider',
                width: TOWER_FRONT_LENGTH - 0.68,
                height: 2.65,
                columns: 5,
                glass: RESIDENTIAL_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.045,
                muntinWidth: 0.024
            }),
            screenDefinition({
                id: 'window_b8_residential_chamfer',
                name: 'Terra & Mar Residential Corner Slider',
                width: TOWER_CHAMFER_LENGTH - 0.68,
                height: 2.65,
                columns: 3,
                glass: RESIDENTIAL_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.045,
                muntinWidth: 0.024
            }),
            screenDefinition({
                id: 'window_b8_residential_side',
                name: 'Terra & Mar Residential Side Slider',
                width: TOWER_SIDE_LENGTH - 0.68,
                height: 2.65,
                columns: 3,
                glass: RESIDENTIAL_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.045,
                muntinWidth: 0.024
            })
        ]
    })
});

export default TERRA_MAR_BUILDING_CONFIG;
