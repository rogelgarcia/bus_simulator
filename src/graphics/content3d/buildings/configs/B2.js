// City building config: B2 — a slender rectilinear curtain-wall tower based on downloads/references_ideas/b2.png.

const FRONT_WIDTH = 18;
const SIDE_DEPTH = 16;
const END_PIER_WIDTH = 1.05;
const PIER_PROJECTION = 0.16;
const GLAZING_RECESS = 0.45;
const LOBBY_HEIGHT = 4.4;
const ADDRESS_HEIGHT = 1.35;
const OFFICE_HEIGHT = 4.25;
const OFFICE_FLOORS = 6;
const OFFICE_FRONT_WINDOW_COUNT = 9;
const OFFICE_SIDE_WINDOW_COUNT = 8;
const TERRACE_SLAB_HEIGHT = 0.45;
const PAVILION_HEIGHT = 4;
const CANOPY_HEIGHT = 0.32;
const GUARDRAIL_HEIGHT = 1.05;
const OFFICE_PANEL_HEIGHT = 0.24;

const OFFICE_WINDOW_VARIANTS = Object.freeze([
    Object.freeze({
        id: 'window_b2_office_soft',
        name: 'B2 Office Window — Soft'
    }),
    Object.freeze({
        id: 'window_b2_office_clear',
        name: 'B2 Office Window — Clear'
    }),
    Object.freeze({
        id: 'window_b2_office_lit',
        name: 'B2 Office Window — Lit'
    }),
    Object.freeze({
        id: 'window_b2_office_cool',
        name: 'B2 Office Window — Cool'
    })
]);

const OFFICE_WINDOW_DEF_IDS = Object.freeze(OFFICE_WINDOW_VARIANTS.map((variant) => variant.id));

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const FRAME_MATERIAL = Object.freeze({
    roughness: 0.32,
    metalness: 0.62,
    envMapIntensity: 1.1,
    normalStrength: 0.25
});

const OFFICE_GLASS = Object.freeze({
    opacity: 0.84,
    tintHex: 0x485965,
    reflection: {
        metalness: 0.72,
        roughness: 0.035,
        transmission: 0.26,
        ior: 1.7,
        envMapIntensity: 3.4
    },
    zOffset: -0.025
});

const LOBBY_GLASS = Object.freeze({
    opacity: 0.88,
    tintHex: 0x687b83,
    reflection: {
        metalness: 0.38,
        roughness: 0.025,
        transmission: 0.68,
        ior: 1.7,
        envMapIntensity: 5
    },
    zOffset: -0.035
});

const GUARDRAIL_GLASS = Object.freeze({
    opacity: 0.34,
    tintHex: 0x93a8b1,
    reflection: {
        metalness: 0.08,
        roughness: 0.035,
        transmission: 0.88,
        ior: 1.52,
        envMapIntensity: 2.6
    },
    zOffset: -0.025
});

function openingPlacement(defId, {
    width,
    height,
    assetType = 'window',
    depthMeters = GLAZING_RECESS,
    paddingMeters = 0.02
}) {
    const openingWidth = Math.max(0.1, width - paddingMeters * 2);
    return {
        enabled: true,
        defId,
        assetType,
        size: { widthMeters: openingWidth, heightMeters: height },
        heightMode: 'full',
        verticalOffsetMeters: 0,
        width: { minMeters: openingWidth, maxMeters: null },
        padding: { leftMeters: paddingMeters, rightMeters: paddingMeters },
        repeat: { count: 1 },
        muntins: { bottomEnabled: true, topEnabled: true },
        visual: { disableShades: true, interior: 'none' },
        depthMeters,
        top: { enabled: false },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

function fixedBay(id, widthMeters, {
    materialSlot = 'stone',
    projection = PIER_PROJECTION,
    window = null
} = {}) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        ...(projection !== 0 ? { depth: { left: projection, right: projection, linked: true } } : {}),
        wallMaterialOverride: { kind: 'slot', id: materialSlot },
        ...(window ? { window } : {})
    };
}

function openingBay(id, widthMeters, window, { materialSlot = null } = {}) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: materialSlot ? { kind: 'slot', id: materialSlot } : null,
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

function framedGlassFacade(prefix, {
    faceWidth,
    height,
    defId,
    endPierWidth = END_PIER_WIDTH,
    pierMaterial = 'stone',
    pierProjection = PIER_PROJECTION,
    glazingDepth = GLAZING_RECESS
}) {
    const glassWidth = faceWidth - endPierWidth * 2;
    return facadeFromItems([
        fixedBay(`${prefix}_pier_start`, endPierWidth, {
            materialSlot: pierMaterial,
            projection: pierProjection
        }),
        openingBay(`${prefix}_glass`, glassWidth, openingPlacement(defId, {
            width: glassWidth,
            height,
            depthMeters: glazingDepth
        })),
        fixedBay(`${prefix}_pier_end`, endPierWidth, {
            materialSlot: pierMaterial,
            projection: pierProjection
        })
    ]);
}

function officeGlassFacade(prefix, {
    faceWidth,
    windowCount,
    variantOffset = 0
}) {
    const glassWidth = faceWidth - END_PIER_WIDTH * 2;
    const moduleWidth = glassWidth / windowCount;
    const items = [fixedBay(`${prefix}_pier_start`, END_PIER_WIDTH)];
    for (let index = 0; index < windowCount; index++) {
        const defId = OFFICE_WINDOW_DEF_IDS[(index + variantOffset) % OFFICE_WINDOW_DEF_IDS.length];
        items.push(openingBay(
            `${prefix}_window_${index + 1}`,
            moduleWidth,
            openingPlacement(defId, {
                width: moduleWidth,
                height: OFFICE_HEIGHT,
                depthMeters: GLAZING_RECESS,
                paddingMeters: 0
            }),
            { materialSlot: 'curtain' }
        ));
    }
    items.push(fixedBay(`${prefix}_pier_end`, END_PIER_WIDTH));
    return facadeFromItems(items);
}

function lobbyFrontFacade() {
    const leftWidth = 5.25;
    const entryWidth = 5.4;
    const rightWidth = 5.25;
    return facadeFromItems([
        fixedBay('lobby_front_pier_start', END_PIER_WIDTH),
        openingBay('lobby_left', leftWidth, openingPlacement('storefront_b2_lobby', {
            width: leftWidth,
            height: LOBBY_HEIGHT,
            assetType: 'storefront'
        })),
        openingBay('lobby_entry', entryWidth, openingPlacement('storefront_b2_entry', {
            width: entryWidth,
            height: LOBBY_HEIGHT,
            assetType: 'storefront'
        }), { materialSlot: 'trim' }),
        openingBay('lobby_right', rightWidth, openingPlacement('storefront_b2_lobby', {
            width: rightWidth,
            height: LOBBY_HEIGHT,
            assetType: 'storefront'
        })),
        fixedBay('lobby_front_pier_end', END_PIER_WIDTH)
    ]);
}

function lobbyWideFacade(prefix, faceWidth) {
    const glassWidth = faceWidth - END_PIER_WIDTH * 2;
    return facadeFromItems([
        fixedBay(`${prefix}_pier_start`, END_PIER_WIDTH),
        openingBay(`${prefix}_glass`, glassWidth, openingPlacement('storefront_b2_side', {
            width: glassWidth,
            height: LOBBY_HEIGHT,
            assetType: 'storefront'
        })),
        fixedBay(`${prefix}_pier_end`, END_PIER_WIDTH)
    ]);
}

function addressFrontFacade() {
    const sideWidth = 5.25;
    const panelWidth = 5.4;
    return facadeFromItems([
        fixedBay('address_front_pier_start', END_PIER_WIDTH),
        openingBay('address_left', sideWidth, openingPlacement('window_b2_clerestory', {
            width: sideWidth,
            height: ADDRESS_HEIGHT,
            depthMeters: GLAZING_RECESS
        })),
        fixedBay('address_center', panelWidth, { materialSlot: 'trim', projection: 0.04 }),
        openingBay('address_right', sideWidth, openingPlacement('window_b2_clerestory', {
            width: sideWidth,
            height: ADDRESS_HEIGHT,
            depthMeters: GLAZING_RECESS
        })),
        fixedBay('address_front_pier_end', END_PIER_WIDTH)
    ]);
}

function addressWideFacade(prefix, faceWidth) {
    const glassWidth = faceWidth - END_PIER_WIDTH * 2;
    return framedGlassFacade(prefix, {
        faceWidth,
        height: ADDRESS_HEIGHT,
        defId: 'window_b2_clerestory_wide'
    });
}

function screenDefinition({
    id,
    name,
    assetType = 'window',
    width,
    height,
    columns,
    rows = 1,
    glass,
    frameWidth,
    horizontalFrameWidth = frameWidth,
    frameDepth = 0.08,
    frameInset = 0.02,
    frameBevelSize = 0.006,
    frameColorHex = 0x171b1d,
    muntinWidth,
    horizontalMuntinWidth = muntinWidth,
    darkBottomPanelHeight = 0,
    door = null,
    storefront = null
}) {
    const hasDarkBottomPanel = darkBottomPanelHeight > 0;
    const frame = {
        width: frameWidth,
        verticalWidth: frameWidth,
        horizontalWidth: horizontalFrameWidth,
        depth: frameDepth,
        inset: frameInset,
        openBottom: hasDarkBottomPanel || !!door,
        doorBottomFrame: hasDarkBottomPanel
            ? { enabled: true, mode: 'match', heightMeters: darkBottomPanelHeight }
            : (door?.doorBottomFrame ?? { enabled: false, mode: 'match' }),
        addHandles: !!door,
        colorHex: frameColorHex,
        bevel: { size: frameBevelSize, roundness: 0.4 },
        material: FRAME_MATERIAL,
        ...(door ?? {})
    };
    return {
        id,
        assetType,
        name,
        settings: {
            version: 1,
            width,
            height,
            arch: NO_ARCH,
            frame,
            muntins: {
                enabled: columns > 1 || rows > 1,
                columns,
                rows,
                verticalWidth: muntinWidth,
                horizontalWidth: horizontalMuntinWidth,
                depth: Math.max(0.04, frameDepth - 0.02),
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: frameColorHex,
                bevel: { inherit: true, bevel: { size: frameBevelSize, roundness: 0.4 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
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
            muntins: columns > 1 || rows > 1,
            glass: true,
            shade: false,
            interior: false
        }
    };
}

const LOBBY_STOREFRONT = Object.freeze({
    bulkhead: { enabled: false },
    transom: { mode: 'none', heightMeters: 0, columns: 3, insetMeters: 0.03 },
    fascia: { enabled: false },
    minGlazingHeightMeters: 4
});

const ENTRY_STOREFRONT = Object.freeze({
    bulkhead: { enabled: false },
    transom: { mode: 'glazed', heightMeters: 0.75, columns: 2, insetMeters: 0.03 },
    fascia: { enabled: false },
    minGlazingHeightMeters: 3.5
});

const LOBBY_FRONT_FACADE = Object.freeze(lobbyFrontFacade());
const LOBBY_SIDE_FACADE = Object.freeze(lobbyWideFacade('lobby_side', SIDE_DEPTH));
const LOBBY_REAR_FACADE = Object.freeze(lobbyWideFacade('lobby_rear', FRONT_WIDTH));
const ADDRESS_FRONT_FACADE = Object.freeze(addressFrontFacade());
const ADDRESS_SIDE_FACADE = Object.freeze(addressWideFacade('address_side', SIDE_DEPTH));
const ADDRESS_REAR_FACADE = Object.freeze(addressWideFacade('address_rear', FRONT_WIDTH));
const OFFICE_FRONT_FACADE = Object.freeze(officeGlassFacade('office_front', {
    faceWidth: FRONT_WIDTH,
    windowCount: OFFICE_FRONT_WINDOW_COUNT
}));
const OFFICE_SIDE_FACADE = Object.freeze(officeGlassFacade('office_side', {
    faceWidth: SIDE_DEPTH,
    windowCount: OFFICE_SIDE_WINDOW_COUNT,
    variantOffset: 1
}));
const PAVILION_FRONT_FACADE = Object.freeze(framedGlassFacade('pavilion_front', {
    faceWidth: 15.7,
    height: PAVILION_HEIGHT,
    defId: 'window_b2_pavilion',
    endPierWidth: 0.55,
    pierMaterial: 'trim',
    pierProjection: 0.1,
    glazingDepth: 0.24
}));
const PAVILION_SIDE_FACADE = Object.freeze(framedGlassFacade('pavilion_side', {
    faceWidth: 13.7,
    height: PAVILION_HEIGHT,
    defId: 'window_b2_pavilion',
    endPierWidth: 0.55,
    pierMaterial: 'trim',
    pierProjection: 0.1,
    glazingDepth: 0.24
}));
const GUARDRAIL_FRONT_FACADE = Object.freeze(framedGlassFacade('guardrail_front', {
    faceWidth: 16.16,
    height: GUARDRAIL_HEIGHT,
    defId: 'window_b2_guardrail',
    endPierWidth: 0.1,
    pierMaterial: 'trim',
    pierProjection: 0,
    glazingDepth: 0.04
}));
const GUARDRAIL_SIDE_FACADE = Object.freeze(framedGlassFacade('guardrail_side', {
    faceWidth: 14.16,
    height: GUARDRAIL_HEIGHT,
    defId: 'window_b2_guardrail',
    endPierWidth: 0.1,
    pierMaterial: 'trim',
    pierProjection: 0,
    glazingDepth: 0.04
}));

export const B2_BUILDING_CONFIG = Object.freeze({
    id: 'b2',
    name: 'B2',
    materialSlots: Object.freeze({
        slots: {
            stone: {
                material: { kind: 'color', id: 'offwhite' },
                wallBase: {
                    roughness: 0.82,
                    normalStrength: 0
                }
            },
            curtain: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } },
            trim: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_b2_lobby',
            type: 'floor',
            floors: 1,
            floorHeight: LOBBY_HEIGHT,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: {
                enabled: true,
                height: 0.22,
                extrusion: 0.8,
                material: { kind: 'slot', id: 'trim' }
            },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { D: 'B' } }
        },
        {
            id: 'floor_b2_address',
            type: 'floor',
            floors: 1,
            floorHeight: ADDRESS_HEIGHT,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { D: 'B' } }
        },
        {
            id: 'floor_b2_office',
            type: 'floor',
            floors: OFFICE_FLOORS,
            floorHeight: OFFICE_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_b2_terrace_slab',
            type: 'floor',
            floors: 1,
            floorHeight: TERRACE_SLAB_HEIGHT,
            planOffset: -0.25,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'trim' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_b2_pavilion',
            type: 'floor',
            floors: 1,
            floorHeight: PAVILION_HEIGHT,
            planOffset: 1.4,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'trim' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_b2_canopy',
            type: 'floor',
            floors: 1,
            floorHeight: CANOPY_HEIGHT,
            planOffset: -0.35,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'trim' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_b2_guardrail',
            type: 'floor',
            floors: 1,
            floorHeight: GUARDRAIL_HEIGHT,
            planOffset: 0.12,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'trim' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'roof_b2',
            type: 'roof',
            ring: { enabled: false },
            cornice: { enabled: false },
            roof: {
                type: 'Asphalt',
                material: { kind: 'slot', id: 'trim' },
                tiling: { enabled: true, tileMeters: 4, tileMetersU: 4, tileMetersV: 4, uvEnabled: true },
                color: 'default'
            }
        }
    ]),
    footprintLoops: Object.freeze([[
        { x: -FRONT_WIDTH / 2, z: SIDE_DEPTH / 2, runId: 'A', runForward: true },
        { x: FRONT_WIDTH / 2, z: SIDE_DEPTH / 2, runId: 'B', runForward: true },
        { x: FRONT_WIDTH / 2, z: -SIDE_DEPTH / 2, runId: 'C', runForward: true },
        { x: -FRONT_WIDTH / 2, z: -SIDE_DEPTH / 2, runId: 'D', runForward: true }
    ]]),
    floors: 8,
    floorHeight: OFFICE_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_b2_lobby: {
            A: LOBBY_FRONT_FACADE,
            B: LOBBY_SIDE_FACADE,
            C: LOBBY_REAR_FACADE
        },
        floor_b2_address: {
            A: ADDRESS_FRONT_FACADE,
            B: ADDRESS_SIDE_FACADE,
            C: ADDRESS_REAR_FACADE
        },
        floor_b2_office: {
            A: OFFICE_FRONT_FACADE,
            B: OFFICE_SIDE_FACADE
        },
        floor_b2_pavilion: {
            A: PAVILION_FRONT_FACADE,
            B: PAVILION_SIDE_FACADE
        },
        floor_b2_guardrail: {
            A: GUARDRAIL_FRONT_FACADE,
            B: GUARDRAIL_SIDE_FACADE
        }
    }),
    wallDecorations: Object.freeze({
        lettering: [
            {
                id: 'sign_b2_address',
                text: '1200',
                target: {
                    layerId: 'floor_b2_address',
                    bayRef: 'A:address_center',
                    zone: 'bay',
                    floor: 1,
                    yOffsetMeters: 0
                },
                heightMeters: 0.34,
                depthMeters: 0.06,
                letterSpacingRatio: 0.22,
                material: { kind: 'color', id: 'offwhite' }
            }
        ]
    }),
    windowDefinitions: Object.freeze({
        items: [
            screenDefinition({
                id: 'storefront_b2_lobby',
                name: 'B2 Lobby Storefront',
                assetType: 'storefront',
                width: 5.21,
                height: LOBBY_HEIGHT,
                columns: 3,
                glass: LOBBY_GLASS,
                frameWidth: 0.055,
                horizontalFrameWidth: 0.045,
                frameDepth: 0.1,
                frameInset: 0.045,
                muntinWidth: 0.035,
                horizontalMuntinWidth: 0.025,
                storefront: LOBBY_STOREFRONT
            }),
            screenDefinition({
                id: 'storefront_b2_side',
                name: 'B2 Wide Lobby Storefront',
                assetType: 'storefront',
                width: 13.86,
                height: LOBBY_HEIGHT,
                columns: 7,
                glass: LOBBY_GLASS,
                frameWidth: 0.055,
                horizontalFrameWidth: 0.045,
                frameDepth: 0.1,
                frameInset: 0.045,
                muntinWidth: 0.035,
                horizontalMuntinWidth: 0.025,
                storefront: LOBBY_STOREFRONT
            }),
            screenDefinition({
                id: 'storefront_b2_entry',
                name: 'B2 Double-Door Entry',
                assetType: 'storefront',
                width: 5.36,
                height: LOBBY_HEIGHT,
                columns: 2,
                glass: LOBBY_GLASS,
                frameWidth: 0.11,
                horizontalFrameWidth: 0.09,
                frameDepth: 0.16,
                frameInset: 0.07,
                frameBevelSize: 0.016,
                muntinWidth: 0.07,
                horizontalMuntinWidth: 0.05,
                door: {
                    doorStyle: 'double',
                    doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.14 },
                    doorCenterFrame: { leftMode: 'match', rightMode: 'none' },
                    doorKickPanel: { enabled: false, heightMeters: 0.3 },
                    handleStyle: 'c_pull',
                    handleCenterHeightMeters: 1.05,
                    handleScale: 2.2,
                    handleMaterialMode: 'metal',
                    handleColorHex: 0x858d91
                },
                storefront: ENTRY_STOREFRONT
            }),
            screenDefinition({
                id: 'window_b2_clerestory',
                name: 'B2 Lobby Clerestory',
                width: 5.21,
                height: ADDRESS_HEIGHT,
                columns: 3,
                glass: LOBBY_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.055,
                frameDepth: 0.08,
                frameInset: 0.03,
                muntinWidth: 0.025,
                horizontalMuntinWidth: 0.025
            }),
            screenDefinition({
                id: 'window_b2_clerestory_wide',
                name: 'B2 Wide Clerestory',
                width: 13.86,
                height: ADDRESS_HEIGHT,
                columns: 7,
                glass: LOBBY_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.055,
                frameDepth: 0.08,
                frameInset: 0.03,
                muntinWidth: 0.025,
                horizontalMuntinWidth: 0.025
            }),
            ...OFFICE_WINDOW_VARIANTS.map((variant) => screenDefinition({
                id: variant.id,
                name: variant.name,
                width: (FRONT_WIDTH - END_PIER_WIDTH * 2) / OFFICE_FRONT_WINDOW_COUNT,
                height: OFFICE_HEIGHT,
                columns: 1,
                glass: OFFICE_GLASS,
                frameWidth: 0.014,
                horizontalFrameWidth: OFFICE_PANEL_HEIGHT,
                frameDepth: 0.08,
                frameInset: 0.015,
                frameBevelSize: 0.004,
                frameColorHex: 0x25292b,
                muntinWidth: 0.01,
                horizontalMuntinWidth: 0.01,
                darkBottomPanelHeight: OFFICE_PANEL_HEIGHT
            })),
            screenDefinition({
                id: 'window_b2_pavilion',
                name: 'B2 Rooftop Pavilion Screen',
                width: 14.56,
                height: PAVILION_HEIGHT,
                columns: 7,
                rows: 4,
                glass: OFFICE_GLASS,
                frameWidth: 0.04,
                horizontalFrameWidth: 0.16,
                frameDepth: 0.18,
                frameInset: -0.055,
                frameBevelSize: 0.008,
                frameColorHex: 0x25292b,
                muntinWidth: 0.035,
                horizontalMuntinWidth: 0.1
            }),
            screenDefinition({
                id: 'window_b2_guardrail',
                name: 'B2 Rooftop Glass Guardrail',
                width: 15.92,
                height: GUARDRAIL_HEIGHT,
                columns: 6,
                glass: GUARDRAIL_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.045,
                frameDepth: 0.06,
                frameInset: 0.01,
                frameBevelSize: 0.003,
                muntinWidth: 0.025,
                horizontalMuntinWidth: 0.025
            })
        ]
    })
});

export default B2_BUILDING_CONFIG;
