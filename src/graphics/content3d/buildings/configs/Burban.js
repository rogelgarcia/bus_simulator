// City building config: Burban — AI 516 curved-facade showcase based on
// downloads/references_ideas/burban.png. The front-right corner is ONE
// semantic quarter-circle face (B); the generator resolves its bays in arc
// length and bends the wall, curtain windows, floor bands, cornice, coping,
// and ornament around the same radius.

const ARC_BULGE_QUARTER = Math.SQRT2 - 1;
const FLOOR_HEIGHT = 3.2;
const GROUND_HEIGHT = 4.6;
// The reference's lower volume reads as a genuine two-storey shopfront. Keep
// the upper podium level close to the ground-floor height so a standing-height
// room is visible behind both rows of glass.
const SECOND_HEIGHT = 4.3;
const CURTAIN_MODULE = 1.45;
// Face B is a quarter-circle with a 6m radius: its authored bay grid consumes
// the true arc length rather than the shorter chord.
const CURVED_CORNER_ARC_LENGTH = Math.PI * 3;

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const CURTAIN_GLASS = Object.freeze({
    opacity: 1,
    // Let the environment, rather than a saturated diffuse tint, supply most
    // of the colour. The remaining blue-grey is only an accent.
    tintHex: 0x738996,
    reflection: {
        metalness: 0.72,
        // Three's physical shader clamps below this effective floor.
        roughness: 0.0525,
        transmission: 0,
        ior: 1.6,
        envMapIntensity: 1.45
    },
    zOffset: -0.025
});

const LOWER_GLASS = Object.freeze({
    // Clear storefront glass with enough HDR reflection to remain visibly a
    // pane in front of the room, without becoming an opaque upper-floor mirror.
    opacity: 0.72,
    tintHex: 0xb2c1c7,
    reflection: {
        metalness: 0.42,
        roughness: 0.0525,
        transmission: 0.52,
        ior: 1.52,
        envMapIntensity: 2.8
    },
    zOffset: -0.035
});

const FRAME_MATERIAL = Object.freeze({
    roughness: 0.32,
    metalness: 0.62,
    envMapIntensity: 1.1,
    normalStrength: 0.25
});

function openingPlacement(defId, {
    width,
    height,
    full = false,
    verticalOffsetMeters = 0.12,
    interior = 'office',
    assetType = 'window',
    paddingMeters = 0.01
} = {}) {
    return {
        enabled: true,
        defId,
        assetType,
        size: { widthMeters: width, heightMeters: height },
        heightMode: full ? 'full' : 'fixed',
        verticalOffsetMeters: full ? 0 : verticalOffsetMeters,
        width: { minMeters: width, maxMeters: null },
        padding: { leftMeters: paddingMeters, rightMeters: paddingMeters },
        repeat: { count: 1 },
        muntins: { bottomEnabled: assetType !== 'door', topEnabled: true },
        visual: { disableShades: true, interior },
        top: { enabled: false },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

const UPPER_WINDOW = Object.freeze(openingPlacement('window_burban_curtain', {
    width: CURTAIN_MODULE - 0.006,
    height: FLOOR_HEIGHT,
    full: true
}));

function repeatBay(id, minMeters, window) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: null },
        expandPreference: 'prefer_repeat',
        depth: { left: -0.015, right: -0.015, linked: true },
        wallMaterialOverride: null,
        window
    };
}

function endPierBay(id, minMeters) {
    return {
        id,
        size: { mode: 'range', minMeters, maxMeters: null },
        expandPreference: 'prefer_expand',
        wallMaterialOverride: { kind: 'slot', id: 'stone' }
    };
}

function pierBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        // An explicit override is deliberate: these strips are the broad
        // pale precast columns visible through both levels of the base.
        wallMaterialOverride: { kind: 'slot', id: 'stone' }
    };
}

function openingBay(id, widthMeters, window, depthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        depth: { left: depthMeters, right: depthMeters, linked: true },
        wallMaterialOverride: null,
        window
    };
}

// The base grid is authored as measured spans rather than a repeated module.
// Ground and second floor consume the SAME spans and piers, so their concrete
// columns remain vertically aligned. The contents may still differ (the
// ground's first span, immediately beside curved face B, is the entrance while
// the second floor is all glass).
const FRONT_BASE_GRID = Object.freeze({
    endPierMin: 0.75,
    spans: Object.freeze([5.8, 4.6, 4.0, 5.1, 5.6]),
    piers: Object.freeze([0.85, 0.85, 0.85, 0.85])
});

// Face B is one semantic curved face. Its three unequal bay spans correspond
// to the three visible side bays wrapping the rounded corner in the reference.
const CURVE_BASE_GRID = Object.freeze({
    endPierMin: 0.65,
    spans: Object.freeze([
        2.55,
        2.35,
        CURVED_CORNER_ARC_LENGTH - (2 * 0.65 + 2 * 0.55 + 2.55 + 2.35)
    ]),
    piers: Object.freeze([0.55, 0.55])
});

function lowerFacade(prefix, {
    grid,
    windowDefId,
    openingHeight,
    verticalOffsetMeters,
    depthMeters,
    interior,
    fullHeight = false,
    entranceIndex = -1
}) {
    const items = [endPierBay(`${prefix}_pier_start`, grid.endPierMin)];
    for (let i = 0; i < grid.spans.length; i++) {
        const spanWidth = grid.spans[i];
        const isEntrance = i === entranceIndex;
        const openingWidth = Math.max(0.1, spanWidth - (isEntrance ? 0.12 : 0.06));
        const placement = openingPlacement(
            isEntrance ? 'storefront_burban_entry' : windowDefId,
            {
                width: openingWidth,
                height: openingHeight,
                full: fullHeight,
                verticalOffsetMeters,
                interior,
                assetType: isEntrance ? 'storefront' : 'window',
                paddingMeters: isEntrance ? 0.04 : 0.01
            }
        );
        items.push(openingBay(
            `${prefix}_${isEntrance ? 'entrance' : 'window'}_${i + 1}`,
            spanWidth,
            placement,
            depthMeters
        ));
        if (i < grid.piers.length) {
            items.push(pierBay(`${prefix}_pier_${i + 1}`, grid.piers[i]));
        }
    }
    items.push(endPierBay(`${prefix}_pier_end`, grid.endPierMin));
    return {
        layout: {
            bays: { items, nextBayIndex: items.length + 1 },
            groups: { items: [], nextGroupIndex: 1 }
        }
    };
}

function curtainFacade(prefix) {
    return {
        layout: {
            bays: { items: [repeatBay(`${prefix}_curtain_module`, CURTAIN_MODULE, UPPER_WINDOW)], nextBayIndex: 2 },
            groups: { items: [], nextGroupIndex: 1 }
        }
    };
}

const GROUND_FRONT_FACADE = Object.freeze(lowerFacade('front_ground', {
    grid: FRONT_BASE_GRID,
    windowDefId: 'window_burban_ground',
    openingHeight: 4.4,
    verticalOffsetMeters: 0.2,
    depthMeters: -0.18,
    interior: 'none',
    fullHeight: true,
    // A is authored from the curved B junction toward the long straight run;
    // index zero therefore makes the entrance the final straight bay before B.
    entranceIndex: 0
}));
const GROUND_CURVE_FACADE = Object.freeze(lowerFacade('curve_ground', {
    grid: CURVE_BASE_GRID,
    windowDefId: 'window_burban_ground',
    openingHeight: 4.4,
    verticalOffsetMeters: 0.2,
    depthMeters: -0.18,
    interior: 'none',
    fullHeight: true
}));
const SECOND_FRONT_FACADE = Object.freeze(lowerFacade('front_second', {
    grid: FRONT_BASE_GRID,
    windowDefId: 'window_burban_second',
    openingHeight: 4.22,
    verticalOffsetMeters: 0,
    depthMeters: -0.18,
    interior: 'none',
    fullHeight: true
}));
const SECOND_CURVE_FACADE = Object.freeze(lowerFacade('curve_second', {
    grid: CURVE_BASE_GRID,
    windowDefId: 'window_burban_second',
    openingHeight: 4.22,
    verticalOffsetMeters: 0,
    depthMeters: -0.18,
    interior: 'none',
    fullHeight: true
}));
const UPPER_FRONT_FACADE = Object.freeze(curtainFacade('front_upper'));
const UPPER_CURVE_FACADE = Object.freeze(curtainFacade('curve_upper'));

function windowDefinition({
    id,
    name,
    width,
    height,
    columns,
    glass,
    frameWidth,
    horizontalFrameWidth = frameWidth,
    frameBevelSize = 0.018,
    muntinWidth,
    horizontalMuntinWidth = muntinWidth,
    transparentInterior = false
}) {
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
                width: frameWidth,
                verticalWidth: frameWidth,
                horizontalWidth: horizontalFrameWidth,
                depth: 0.07,
                inset: 0.012,
                openBottom: false,
                doorBottomFrame: { enabled: false, mode: 'match' },
                addHandles: false,
                colorHex: 0x25292b,
                bevel: { size: frameBevelSize, roundness: 0.45 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: columns > 1,
                columns,
                rows: 1,
                verticalWidth: muntinWidth,
                horizontalWidth: horizontalMuntinWidth,
                depth: 0.055,
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x25292b,
                bevel: { inherit: true, bevel: { size: frameBevelSize, roundness: 0.45 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
            },
            glass,
            shade: { enabled: false },
            interior: transparentInterior
                ? { enabled: false }
                : { enabled: true, parallaxInteriorPresetId: 'parallax_interior.office' }
        },
        decoration: {
            sill: { enabled: false },
            header: { enabled: false },
            jambs: { enabled: false }
        },
        layers: { frame: true, muntins: columns > 1, glass: true, shade: false, interior: !transparentInterior }
    };
}

function entryStorefrontDefinition() {
    return {
        id: 'storefront_burban_entry',
        assetType: 'storefront',
        name: 'Burban Full-Height Entry Storefront',
        settings: {
            version: 1,
            width: 5.68,
            height: GROUND_HEIGHT,
            arch: NO_ARCH,
            frame: {
                width: 0.055,
                verticalWidth: 0.055,
                horizontalWidth: 0.05,
                depth: 0.09,
                inset: 0.055,
                openBottom: true,
                doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.08 },
                doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                addHandles: true,
                handleStyle: 'c_pull',
                handleMaterialMode: 'metal',
                handleColorHex: 0x7b858a,
                doorStyle: 'double',
                colorHex: 0x25292b,
                bevel: { size: 0.018, roundness: 0.45 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: true,
                columns: 4,
                rows: 1,
                verticalWidth: 0.035,
                horizontalWidth: 0.03,
                depth: 0.055,
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x25292b,
                bevel: { inherit: true, bevel: { size: 0.018, roundness: 0.45 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
            },
            glass: LOWER_GLASS,
            shade: { enabled: false },
            interior: { enabled: false }
        },
        storefront: {
            // Four lower panes read as sidelights + the central double door;
            // the separate glazed transom completes the full-height opening.
            bulkhead: { enabled: false },
            transom: {
                mode: 'glazed',
                heightMeters: 0.86,
                columns: 4,
                insetMeters: 0.03
            },
            fascia: { enabled: false },
            minGlazingHeightMeters: 3.4
        },
        decoration: {
            sill: { enabled: false },
            header: { enabled: false },
            jambs: { enabled: false }
        },
        layers: { frame: true, muntins: true, glass: true, shade: false, interior: false }
    };
}

export const BURBAN_BUILDING_CONFIG = Object.freeze({
    id: 'burban',
    name: 'Burban',
    materialSlots: Object.freeze({
        slots: {
            // The limestone texture's neutral albedo falls nearly black in
            // the HDR showcase at grazing angles. Use the calibrated warm
            // precast tint so the structural pier grid stays readable.
            stone: { material: { kind: 'color', id: 'beige' } },
            curtain: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } },
            // Keep the broad piers on the limestone texture, but use the
            // neutral concrete tint for exposed bands/cornices so they read
            // like the pale precast courses in the reference under all light.
            trim: { material: { kind: 'color', id: 'offwhite' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_burban_ground',
            type: 'floor',
            floors: 1,
            floorHeight: GROUND_HEIGHT,
            planOffset: 0,
            // Clear glazing looks into the generated physical shell. Burban
            // deliberately carries no per-window parallax interior panels.
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            // No cement course between storeys one and two: the aligned stone
            // piers continue uninterrupted and only the slim window frame
            // marks the internal floor line.
            belt: { enabled: false },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'A', E: 'A' } }
        },
        {
            id: 'floor_burban_second',
            type: 'floor',
            floors: 1,
            floorHeight: SECOND_HEIGHT,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'stone' },
            materialVariation: { enabled: false },
            belt: {
                enabled: true,
                // The podium's single cement separator belongs above storey
                // two, immediately below the mirrored curtain-wall floors.
                height: 0.4,
                extrusion: 0.16,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'A', E: 'A' } }
        },
        {
            id: 'floor_burban_upper',
            type: 'floor',
            floors: 6,
            floorHeight: FLOOR_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'curtain' },
            materialVariation: { enabled: false },
            belt: {
                enabled: true,
                height: 0.22,
                extrusion: 0.12,
                material: { kind: 'slot', id: 'trim' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'A', E: 'A' } }
        },
        {
            id: 'roof_burban',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.34,
                outerRadius: 0.16,
                height: 0.78,
                material: { kind: 'slot', id: 'trim' }
            },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.72,
                projection: 0.48,
                material: { kind: 'slot', id: 'trim' },
                ornament: {
                    type: 'dentils',
                    width: 0.18,
                    depth: 0.2,
                    spacing: 0.16,
                    height: 0.2,
                    material: { kind: 'slot', id: 'trim' }
                },
                parapet: {
                    coping: {
                        enabled: true,
                        height: 0.12,
                        overhang: 0.07,
                        material: { kind: 'slot', id: 'trim' }
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
        floor_burban_ground: { A: GROUND_FRONT_FACADE, B: GROUND_CURVE_FACADE },
        floor_burban_second: { A: SECOND_FRONT_FACADE, B: SECOND_CURVE_FACADE },
        floor_burban_upper: { A: UPPER_FRONT_FACADE, B: UPPER_CURVE_FACADE }
    }),
    windowDefinitions: Object.freeze({
        items: [
            windowDefinition({
                id: 'window_burban_ground',
                name: 'Burban Ground Curtain Window',
                width: 4.0,
                height: 4.4,
                columns: 3,
                glass: LOWER_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.005,
                frameBevelSize: 0.003,
                muntinWidth: 0.022,
                horizontalMuntinWidth: 0.002,
                transparentInterior: true
            }),
            windowDefinition({
                id: 'window_burban_second',
                name: 'Burban Second Floor Curtain Window',
                width: 3.7,
                height: 4.22,
                columns: 3,
                glass: LOWER_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.005,
                frameBevelSize: 0.003,
                muntinWidth: 0.022,
                horizontalMuntinWidth: 0.002,
                transparentInterior: true
            }),
            windowDefinition({
                id: 'window_burban_curtain',
                name: 'Burban Curved Curtain Pane',
                width: CURTAIN_MODULE - 0.006,
                height: FLOOR_HEIGHT,
                columns: 1,
                glass: CURTAIN_GLASS,
                frameWidth: 0.024,
                muntinWidth: 0.02,
                transparentInterior: false
            }),
            entryStorefrontDefinition()
        ]
    })
});

export default BURBAN_BUILDING_CONFIG;
