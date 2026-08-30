// City building config: Burban — AI 516 curved-facade showcase based on
// downloads/references_ideas/burban.png. The 36 x 28m outline has two
// independent front curves: a broad 12m-radius, three-bay face B on the right
// and a tight 4m-radius, one-bay face F on the left. The generator resolves
// their facade grids in arc length, so wall, glazing and bands all
// follow the same silhouette without multiplying the window modules.

const ARC_BULGE_QUARTER = Math.SQRT2 - 1;
const FLOOR_HEIGHT = 3.2;
const GROUND_HEIGHT = 5;
const SECOND_HEIGHT = 5;
const RIGHT_CURVE_RADIUS = 12;
const LEFT_CURVE_RADIUS = 4;
const RIGHT_CURVE_ARC_LENGTH = Math.PI * RIGHT_CURVE_RADIUS / 2;
const LEFT_CURVE_ARC_LENGTH = Math.PI * LEFT_CURVE_RADIUS / 2;
const UPPER_PIER_WIDTH = 0.36;
const PILLAR_PROJECTION = 0.12;
const LOWER_OPENING_DEPTH = 0.76;
const PODIUM_DIVIDER_HEIGHT = 1.2;
const UPPER_DIVIDER_HEIGHT = 0.56;
const CURTAIN_PANEL_HEIGHT = 0.22;

const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.2,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

const CURTAIN_GLASS = Object.freeze({
    opacity: 0.84,
    // Let the environment, rather than a saturated diffuse tint, supply most
    // of the colour. The remaining blue-grey is only an accent.
    tintHex: 0x485965,
    reflection: {
        metalness: 0.72,
        // Three's physical shader clamps below this effective floor.
        roughness: 0.035,
        transmission: 0.26,
        ior: 1.7,
        envMapIntensity: 3.4
    },
    zOffset: -0.025
});

const LOWER_GLASS = Object.freeze({
    // Clear storefront glass with enough HDR reflection to remain visibly a
    // pane in front of the room, without becoming an opaque upper-floor mirror.
    opacity: 0.88,
    tintHex: 0x687b83,
    reflection: {
        // A modest metallic contribution makes the HDR scene legible while
        // the high transmission still leaves both podium levels see-through.
        metalness: 0.38,
        roughness: 0.025,
        transmission: 0.68,
        ior: 1.7,
        envMapIntensity: 5.0
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
    paddingMeters = 0.01,
    depthMeters = 0
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
        depthMeters,
        top: { enabled: false },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

function endPierBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        depth: { left: PILLAR_PROJECTION, right: PILLAR_PROJECTION, linked: true },
        wallMaterialOverride: { kind: 'slot', id: 'stone' }
    };
}

function pierBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        depth: { left: PILLAR_PROJECTION, right: PILLAR_PROJECTION, linked: true },
        // An explicit override is deliberate: these strips are the broad
        // pale precast columns visible through both levels of the base.
        wallMaterialOverride: { kind: 'slot', id: 'stone' }
    };
}

function openingBay(id, widthMeters, window, depthMeters, {
    sizeMode = 'fixed',
    expandPreference = 'no_repeat'
} = {}) {
    return {
        id,
        size: sizeMode === 'range'
            ? { mode: 'range', minMeters: widthMeters, maxMeters: null }
            : { mode: 'fixed', widthMeters },
        expandPreference,
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
    endPierWidth: 0.9,
    // A runs from the broad right curve toward the left. The entrance is the
    // first span; the only additional straight storefront is the second.
    spans: Object.freeze([10.5, 6.5]),
    piers: Object.freeze([1.2]),
    expandableIndex: 0,
    // When a wider host face has enough room, duplicate the outer storefront
    // and its following stone anchor. Never duplicate the entrance.
    repeatGroupStartIndex: 1
});

// Face B is one semantic curved face. Its three unequal bay spans correspond
// to the three visible side bays wrapping the rounded corner in the reference.
const CURVE_BASE_GRID = Object.freeze({
    endPierWidth: 0.8,
    spans: Object.freeze([
        5.5,
        5.2,
        RIGHT_CURVE_ARC_LENGTH - (4 * 0.8 + 5.5 + 5.2)
    ]),
    piers: Object.freeze([0.8, 0.8])
});

const LEFT_CURVE_BASE_GRID = Object.freeze({
    endPierWidth: 0.8,
    spans: Object.freeze([LEFT_CURVE_ARC_LENGTH - 1.6]),
    piers: Object.freeze([]),
    // F itself consumes the authored minimum exactly. Straight side faces
    // linked to this simple one-opening grammar expand the glass, not a pier.
    expandableIndex: 0
});

function lowerFacade(prefix, {
    grid,
    windowDefId,
    openingHeight,
    verticalOffsetMeters,
    depthMeters,
    interior,
    fullHeight = false,
    entranceIndex = -1,
    entranceDefId = 'storefront_burban_entry',
    entranceComposite = false,
    entranceSidelightDefId = 'storefront_burban_entry_sidelight',
    nonEntranceAssetType = 'window'
}) {
    const items = [endPierBay(`${prefix}_pier_start`, grid.endPierWidth)];
    let repeatGroupBayIds = null;
    for (let i = 0; i < grid.spans.length; i++) {
        const spanWidth = grid.spans[i];
        const isEntrance = i === entranceIndex;
        let openingId = null;
        if (isEntrance && entranceComposite) {
            const parts = [
                { suffix: 'sidelight_curve', width: 2.75, defId: entranceSidelightDefId },
                { suffix: 'entrance', width: 5, defId: entranceDefId, entrance: true },
                { suffix: 'sidelight_outer', width: 2.75, defId: entranceSidelightDefId }
            ];
            for (const part of parts) {
                const placement = openingPlacement(part.defId, {
                    // The three storefront assemblies meet frame-to-frame.
                    // Cutting their full authored spans prevents stone wall
                    // slivers from appearing beside the central doors.
                    width: part.width,
                    height: openingHeight,
                    full: fullHeight,
                    verticalOffsetMeters,
                    interior,
                    assetType: 'storefront',
                    paddingMeters: 0,
                    depthMeters
                });
                items.push(openingBay(
                    `${prefix}_${part.suffix}`,
                    part.width,
                    placement,
                    0,
                    !part.entrance && i === grid.expandableIndex
                        ? { sizeMode: 'range', expandPreference: 'prefer_expand' }
                        : undefined
                ));
            }
        } else {
            const openingWidth = Math.max(0.1, spanWidth - (isEntrance ? 0.12 : 0.06));
            const placement = openingPlacement(
                isEntrance ? entranceDefId : windowDefId,
                {
                    width: openingWidth,
                    height: openingHeight,
                    full: fullHeight,
                    verticalOffsetMeters,
                    interior,
                    assetType: isEntrance ? 'storefront' : nonEntranceAssetType,
                    paddingMeters: isEntrance ? 0.04 : 0.01,
                    depthMeters
                }
            );
            openingId = `${prefix}_${isEntrance ? 'entrance' : 'window'}_${i + 1}`;
            const opening = openingBay(
                openingId,
                spanWidth,
                placement,
                0,
                i === grid.expandableIndex
                    ? { sizeMode: 'range', expandPreference: 'prefer_expand' }
                    : undefined
            );
            items.push(opening);
        }
        if (i < grid.piers.length) {
            const pierId = `${prefix}_pier_${i + 1}`;
            items.push(pierBay(pierId, grid.piers[i]));
            if (i === grid.repeatGroupStartIndex) repeatGroupBayIds = [openingId, pierId];
        }
    }
    const endPierId = `${prefix}_pier_end`;
    items.push(endPierBay(endPierId, grid.endPierWidth));
    if (grid.repeatGroupStartIndex === grid.spans.length - 1) {
        const repeatOpeningId = `${prefix}_window_${grid.repeatGroupStartIndex + 1}`;
        repeatGroupBayIds = [repeatOpeningId, endPierId];
    }
    return {
        layout: {
            bays: { items, nextBayIndex: items.length + 1 },
            groups: {
                items: repeatGroupBayIds ? [{
                    id: `${prefix}_outer_storefront_repeat`,
                    bayIds: repeatGroupBayIds,
                    repeat: { minRepeats: 1, maxRepeats: 'auto' }
                }] : [],
                nextGroupIndex: repeatGroupBayIds ? 2 : 1
            }
        }
    };
}

function lowerInternalPierCenters(grid) {
    const centers = [];
    let cursor = grid.endPierWidth;
    for (let index = 0; index < grid.spans.length; index++) {
        cursor += grid.spans[index];
        if (index >= grid.piers.length) break;
        centers.push(cursor + grid.piers[index] * 0.5);
        cursor += grid.piers[index];
    }
    return centers;
}

function upperCurtainFacade(prefix, grid) {
    const totalWidth = (
        grid.endPierWidth * 2
        + grid.spans.reduce((sum, width) => sum + width, 0)
        + grid.piers.reduce((sum, width) => sum + width, 0)
    );
    const items = [];
    const addPier = (id) => items.push({
        id,
        size: { mode: 'fixed', widthMeters: UPPER_PIER_WIDTH },
        expandPreference: 'no_repeat',
        wallMaterialOverride: { kind: 'slot', id: 'stone' }
    });
    const addWindow = (id, width) => items.push(openingBay(
        id,
        width,
        openingPlacement('window_burban_curtain', {
            width: Math.max(0.1, width - 0.006),
            height: FLOOR_HEIGHT,
            full: true,
            interior: 'none'
        }),
        -0.015,
        { sizeMode: 'range', expandPreference: 'prefer_expand' }
    ));

    // Keep the thin upper stone strips centered over the structural piers of
    // the two-storey podium. Glass widths may differ, but the load-bearing
    // vertical rhythm remains continuous through the whole elevation.
    addPier(`${prefix}_pier_start`);
    let cursor = UPPER_PIER_WIDTH;
    const centers = lowerInternalPierCenters(grid);
    for (let index = 0; index < centers.length; index++) {
        const pierStart = centers[index] - UPPER_PIER_WIDTH * 0.5;
        addWindow(`${prefix}_window_${index + 1}`, Math.max(0.1, pierStart - cursor));
        addPier(`${prefix}_pier_${index + 1}`);
        cursor = centers[index] + UPPER_PIER_WIDTH * 0.5;
    }
    addWindow(`${prefix}_window_${centers.length + 1}`, Math.max(0.1, totalWidth - UPPER_PIER_WIDTH - cursor));
    addPier(`${prefix}_pier_end`);
    return {
        layout: {
            bays: { items, nextBayIndex: items.length + 1 },
            groups: { items: [], nextGroupIndex: 1 }
        }
    };
}

const GROUND_FRONT_FACADE = Object.freeze(lowerFacade('front_ground', {
    grid: FRONT_BASE_GRID,
    windowDefId: 'storefront_burban_ground',
    openingHeight: GROUND_HEIGHT,
    verticalOffsetMeters: 0,
    depthMeters: LOWER_OPENING_DEPTH,
    interior: 'none',
    fullHeight: true,
    nonEntranceAssetType: 'storefront',
    // A is authored from the curved B junction toward the long straight run;
    // index zero therefore makes the entrance the final straight bay before B.
    entranceIndex: 0,
    entranceComposite: true
}));
const GROUND_CURVE_FACADE = Object.freeze(lowerFacade('curve_ground', {
    grid: CURVE_BASE_GRID,
    windowDefId: 'storefront_burban_ground',
    openingHeight: GROUND_HEIGHT,
    verticalOffsetMeters: 0,
    depthMeters: LOWER_OPENING_DEPTH,
    interior: 'none',
    fullHeight: true,
    nonEntranceAssetType: 'storefront'
}));
const GROUND_LEFT_CURVE_FACADE = Object.freeze(lowerFacade('left_curve_ground', {
    grid: LEFT_CURVE_BASE_GRID,
    windowDefId: 'storefront_burban_ground',
    openingHeight: GROUND_HEIGHT,
    verticalOffsetMeters: 0,
    depthMeters: LOWER_OPENING_DEPTH,
    interior: 'none',
    fullHeight: true,
    nonEntranceAssetType: 'storefront'
}));
const SECOND_FRONT_FACADE = Object.freeze(lowerFacade('front_second', {
    grid: FRONT_BASE_GRID,
    windowDefId: 'window_burban_second',
    openingHeight: SECOND_HEIGHT,
    verticalOffsetMeters: 0,
    depthMeters: LOWER_OPENING_DEPTH,
    interior: 'none',
    fullHeight: true,
    entranceIndex: 0,
    entranceDefId: 'storefront_burban_second_sign'
}));
const SECOND_CURVE_FACADE = Object.freeze(lowerFacade('curve_second', {
    grid: CURVE_BASE_GRID,
    windowDefId: 'window_burban_second',
    openingHeight: SECOND_HEIGHT,
    verticalOffsetMeters: 0,
    depthMeters: LOWER_OPENING_DEPTH,
    interior: 'none',
    fullHeight: true
}));
const SECOND_LEFT_CURVE_FACADE = Object.freeze(lowerFacade('left_curve_second', {
    grid: LEFT_CURVE_BASE_GRID,
    windowDefId: 'window_burban_second',
    openingHeight: SECOND_HEIGHT,
    verticalOffsetMeters: 0,
    depthMeters: LOWER_OPENING_DEPTH,
    interior: 'none',
    fullHeight: true
}));
const UPPER_FRONT_FACADE = Object.freeze(upperCurtainFacade('front_upper', FRONT_BASE_GRID));
const UPPER_CURVE_FACADE = Object.freeze(upperCurtainFacade('curve_upper', CURVE_BASE_GRID));
const UPPER_LEFT_CURVE_FACADE = Object.freeze(upperCurtainFacade('left_curve_upper', LEFT_CURVE_BASE_GRID));

function windowDefinition({
    id,
    name,
    width,
    height,
    columns,
    rows = 1,
    glass,
    frameWidth,
    horizontalFrameWidth = frameWidth,
    frameBevelSize = 0.018,
    muntinWidth,
    horizontalMuntinWidth = muntinWidth,
    muntinUvOffsetY = 0,
    darkTopBottomPanels = false,
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
                openBottom: darkTopBottomPanels,
                doorBottomFrame: darkTopBottomPanels
                    ? { enabled: true, mode: 'match', heightMeters: CURTAIN_PANEL_HEIGHT }
                    : { enabled: false, mode: 'match' },
                addHandles: false,
                colorHex: 0x25292b,
                bevel: { size: frameBevelSize, roundness: 0.45 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: columns > 1 || rows > 1,
                columns,
                rows,
                verticalWidth: muntinWidth,
                horizontalWidth: horizontalMuntinWidth,
                depth: 0.055,
                inset: 0.004,
                uvOffset: { x: 0, y: muntinUvOffsetY },
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
        layers: { frame: true, muntins: columns > 1 || rows > 1, glass: true, shade: false, interior: !transparentInterior }
    };
}

function groundStorefrontDefinition({
    id = 'storefront_burban_ground',
    name = 'Burban Ground Glazed Storefront',
    width = 5.2,
    columns = 3
} = {}) {
    return {
        id,
        assetType: 'storefront',
        name,
        settings: {
            version: 1,
            width,
            height: GROUND_HEIGHT,
            arch: NO_ARCH,
            frame: {
                width: 0.035,
                verticalWidth: 0.035,
                horizontalWidth: 0.028,
                depth: 0.075,
                inset: 0.035,
                openBottom: false,
                doorBottomFrame: { enabled: false, mode: 'match' },
                addHandles: false,
                colorHex: 0x171b1d,
                bevel: { size: 0.004, roundness: 0.35 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: true,
                columns,
                rows: 1,
                verticalWidth: 0.022,
                horizontalWidth: 0.012,
                depth: 0.05,
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x171b1d,
                bevel: { inherit: true, bevel: { size: 0.004, roundness: 0.35 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
            },
            glass: LOWER_GLASS,
            shade: { enabled: false },
            interior: { enabled: false }
        },
        storefront: {
            bulkhead: { enabled: false },
            // Everywhere except the entrance, the upper 1.5m zone remains
            // glass. Its black perimeter aligns with the ends of the sign.
            transom: {
                mode: 'glazed',
                heightMeters: 1.5,
                columns,
                insetMeters: 0.03
            },
            fascia: { enabled: false },
            minGlazingHeightMeters: 3.5
        },
        decoration: {
            sill: { enabled: false },
            header: { enabled: false },
            jambs: { enabled: false }
        },
        layers: { frame: true, muntins: true, glass: true, shade: false, interior: false }
    };
}

function entryStorefrontDefinition() {
    return {
        id: 'storefront_burban_entry',
        assetType: 'storefront',
        name: 'Burban Full-Height Entry Storefront',
        settings: {
            version: 1,
            width: 4.88,
            height: GROUND_HEIGHT,
            arch: NO_ARCH,
            frame: {
                width: 0.13,
                verticalWidth: 0.13,
                horizontalWidth: 0.11,
                depth: 0.16,
                inset: 0.065,
                openBottom: true,
                doorKickPanel: { enabled: true, heightMeters: 0.3 },
                doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.12 },
                // One physical meeting stile, rather than two adjacent bars.
                doorCenterFrame: { leftMode: 'match', rightMode: 'none' },
                addHandles: true,
                handleStyle: 'c_pull',
                handleCenterHeightMeters: 1,
                handleScale: 3,
                handleMaterialMode: 'metal',
                handleColorHex: 0x7b858a,
                doorStyle: 'double',
                colorHex: 0x25292b,
                bevel: { size: 0.018, roundness: 0.45 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: false,
                columns: 1,
                rows: 1,
                verticalWidth: 0.065,
                horizontalWidth: 0.055,
                depth: 0.08,
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
            bulkhead: { enabled: false },
            transom: {
                mode: 'glazed',
                heightMeters: 1.5,
                columns: 2,
                insetMeters: 0.03
            },
            fascia: { enabled: false },
            minGlazingHeightMeters: 3.5
        },
        decoration: {
            sill: { enabled: false },
            header: { enabled: false },
            jambs: { enabled: false }
        },
        layers: { frame: true, muntins: false, glass: true, shade: false, interior: false }
    };
}

function secondSignStorefrontDefinition() {
    return {
        id: 'storefront_burban_second_sign',
        assetType: 'storefront',
        name: 'Burban Second-Floor Sign and Glass',
        settings: {
            version: 1,
            width: 10.38,
            height: SECOND_HEIGHT,
            arch: NO_ARCH,
            frame: {
                width: 0.045,
                verticalWidth: 0.045,
                horizontalWidth: 0.04,
                depth: 0.08,
                inset: 0.04,
                openBottom: false,
                doorBottomFrame: { enabled: false, mode: 'match' },
                addHandles: false,
                colorHex: 0x171b1d,
                bevel: { size: 0.004, roundness: 0.35 },
                material: FRAME_MATERIAL
            },
            muntins: {
                enabled: true,
                columns: 4,
                rows: 1,
                verticalWidth: 0.03,
                horizontalWidth: 0.02,
                depth: 0.05,
                inset: 0.004,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x171b1d,
                bevel: { inherit: true, bevel: { size: 0.004, roundness: 0.35 } },
                material: { inheritFromFrame: true, pbr: FRAME_MATERIAL }
            },
            glass: LOWER_GLASS,
            shade: { enabled: false },
            interior: { enabled: false }
        },
        storefront: {
            bulkhead: {
                enabled: true,
                heightMeters: 1.5,
                projectionMeters: 0.02,
                material: {
                    mode: 'color',
                    colorHex: 0x080b0d,
                    roughness: 0.24,
                    metalness: 0.72
                }
            },
            transom: { mode: 'none', heightMeters: 0, columns: 4 },
            fascia: { enabled: false },
            minGlazingHeightMeters: 3.5
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
            stone: {
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                wallBase: { roughness: 0.86, normalStrength: 0.35, tintHex: 0xc8c2b9 },
                tiling: { enabled: true, tileMeters: 0.35, tileMetersU: 0.35, tileMetersV: 0.35, uvEnabled: true }
            },
            curtain: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } },
            trim: {
                material: { kind: 'texture', id: 'pbr.rough_concrete' },
                wallBase: { roughness: 0.86, normalStrength: 0.35, tintHex: 0xc8c2b9 },
                tiling: { enabled: true, tileMeters: 0.35, tileMetersU: 0.35, tileMetersV: 0.35, uvEnabled: true }
            }
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
            faceLinking: { links: { C: 'F', D: 'A', E: 'F' } }
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
                height: PODIUM_DIVIDER_HEIGHT,
                // The belt follows the existing 0.12m pillar projection. An
                // additional extrusion produced a false capital at every
                // pillar intersection.
                extrusion: 0,
                material: { kind: 'slot', id: 'stone' }
            },
            cornice: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'F', D: 'A', E: 'F' } }
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
                height: UPPER_DIVIDER_HEIGHT,
                extrusion: PILLAR_PROJECTION,
                material: { kind: 'slot', id: 'stone' }
            },
            windows: { enabled: false },
            faceLinking: { links: { C: 'F', D: 'A', E: 'F' } }
        },
        {
            id: 'roof_burban',
            type: 'roof',
            ring: {
                enabled: false
            },
            cornice: {
                enabled: false
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
            z: 2,
            runId: 'B',
            runForward: true,
            arc: { bulge: ARC_BULGE_QUARTER, segments: 30 }
        },
        { x: 6, z: 14, runId: 'A', runForward: true },
        {
            x: -14,
            z: 14,
            runId: 'F',
            runForward: true,
            arc: { bulge: ARC_BULGE_QUARTER, segments: 14 }
        },
        { x: -18, z: 10, runId: 'E', runForward: true }
    ]]),
    floors: 8,
    floorHeight: FLOOR_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_burban_ground: {
            A: GROUND_FRONT_FACADE,
            B: GROUND_CURVE_FACADE,
            F: GROUND_LEFT_CURVE_FACADE
        },
        floor_burban_second: {
            A: SECOND_FRONT_FACADE,
            B: SECOND_CURVE_FACADE,
            F: SECOND_LEFT_CURVE_FACADE
        },
        floor_burban_upper: {
            A: UPPER_FRONT_FACADE,
            B: UPPER_CURVE_FACADE,
            F: UPPER_LEFT_CURVE_FACADE
        }
    }),
    windowDefinitions: Object.freeze({
        items: [
            groundStorefrontDefinition(),
            groundStorefrontDefinition({
                id: 'storefront_burban_entry_sidelight',
                name: 'Burban Entry Sidelight',
                width: 2.69,
                columns: 2
            }),
            windowDefinition({
                id: 'window_burban_second',
                name: 'Burban Second Floor Curtain Window',
                width: 5.2,
                height: SECOND_HEIGHT,
                columns: 3,
                rows: 2,
                glass: LOWER_GLASS,
                frameWidth: 0.035,
                horizontalFrameWidth: 0.005,
                frameBevelSize: 0.003,
                muntinWidth: 0.022,
                horizontalMuntinWidth: 0.035,
                // Move the single horizontal bar from the centre to 1.5m
                // above the opening bottom, level with the sign-board crown.
                muntinUvOffsetY: -1.6,
                transparentInterior: true
            }),
            windowDefinition({
                id: 'window_burban_curtain',
                name: 'Burban Curved Curtain Pane',
                width: 6.2,
                height: FLOOR_HEIGHT,
                columns: 4,
                glass: CURTAIN_GLASS,
                frameWidth: 0.016,
                horizontalFrameWidth: CURTAIN_PANEL_HEIGHT,
                frameBevelSize: 0.004,
                muntinWidth: 0.014,
                horizontalMuntinWidth: 0.012,
                darkTopBottomPanels: true,
                transparentInterior: true
            }),
            entryStorefrontDefinition(),
            secondSignStorefrontDefinition()
        ]
    })
});

export default BURBAN_BUILDING_CONFIG;
