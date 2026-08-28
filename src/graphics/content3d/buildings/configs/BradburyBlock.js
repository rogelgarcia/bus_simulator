// src/graphics/content3d/buildings/configs/BradburyBlock.js
// City building config: Bradbury Block — reproduction of the Bradbury
// Building reference model (downloads/buildings_references/2.png / 3.png).
//
// Massing: 5-storey corner block. Ground floor is red sandstone with
// storefronts (backlit white transom band + dark fascia) and a central arched
// entry portal fabricated from a portal def (AI 510 box + inset levels, with
// "BRADBURY" lettering on the box frieze, AI 508); floors 2-4 are salmon
// Roman brick pilaster bays with paired / tripled 1-over-1 sash windows in
// carved recessed panels (AI 511 insets), the pilasters ending in molded
// capitals (AI 509) under a bracketed entablature; the top floor is an arcade
// of round-arched windows whose archivolt reading comes from nested
// arch-topped wall insets (AI 511) springing from a continuous terracotta
// impost band (AI 509), under a dentiled crown cornice with stepped parapet
// blocks; black fire escapes on the side street face. The ~3.9m chamfered
// street corner is a real facade face (AI 512, face B) carrying a window per
// floor and the corner entry assembly at ground.
//
// Faces (N-face model, reference proportions ~46m x ~38m): A long side
// street (+z, 3 fire escapes), B corner chamfer, C entry face (+x, portal +
// storefronts — the face right of the chamfer in the reference corner view),
// D back (linked to A), E far side (linked to C).
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

// The window's authored size.widthMeters feeds the SOLVER's bay minimum
// (size + paddings must fit the fixed bay, or every ground face scales
// down and the doors squeeze): stores are sized to fill their fixed bays
// exactly.
const STOREFRONT = Object.freeze({
    enabled: true,
    defId: 'storefront_bradbury',
    assetType: 'storefront',
    size: { widthMeters: 2.86, heightMeters: 3.91 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0,
    width: { minMeters: 2.6, maxMeters: null },
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

// Pilaster capital under the entablature — the AI 509 molded profile
// (neck -> echinus -> cove -> abacus) is the closest the engine gets to the
// reference's foliate terracotta capitals.
const PIER_CAPITAL = Object.freeze({
    top: {
        enabled: true,
        profile: 'molded',
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

// The chamfer face (B) is ~3.9m wide: one narrow window bay per floor
// between two pilaster strips — the window keeps the reference's generous
// brick margins (~28% of the face). No edge depth: the chamfer is a raised
// corner plane, flush like the pavilion strips (the recess exposed a phantom
// ledge on the band top below, user report 2026-08-28).
function cornerWindowBay(id, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters: CHAMFER_FACE_W - 0.9 },
        expandPreference: 'no_repeat',
        wallMaterialOverride: null,
        window
    };
}

// AI 509: the arcade floor's bays band together so every arch springs from
// one shared line, with a continuous terracotta impost band running through
// the piers AND the jamb strips — the run reads as ONE band broken only by
// the arches.
function arcadeGroup(bayIds) {
    return {
        items: [{
            id: 'g_arcade',
            bayIds,
            repeat: { minRepeats: 1, maxRepeats: 1 },
            arcade: {
                enabled: true,
                springing: { mode: 'auto', offsetMeters: null },
                impost: {
                    enabled: true,
                    continuous: true,
                    heightMeters: 0.14,
                    projectionMeters: 0.07,
                    overhangMeters: 0.0,
                    material: { kind: 'slot', id: 'trim' }
                }
            }
        }],
        nextGroupIndex: 2
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

// ---------------------------------------------------------------------------
// Reference facade organization (2026-08-28): both street faces assemble from
// shared SEGMENTS, designed once and reused across faces and floors —
//   entry face C:          [corner 1] [3 2 (portal) 2 3] [raised 2]
//   side face A (bay list runs back→corner, i.e. the reference formula
//   "corner → back" reversed):
//                          [raised 2] [3 2 2 2 3] [raised 2] [2 2 2] [corner 1]
// The corner stack and the raised pavilion strips stand at the corner plane;
// the wall field between them sits FIELD_INSET behind it. On the middle
// floors the window bays recess a further SAW_RECESS into their local plane
// (the reference sawtooth); the arcade floor is FLAT (windows flush with
// their plane); the raised strips project on every floor. The ground floor
// mirrors the rhythm with identical pier widths and identical width ranges,
// so the solver lands every storefront exactly under its window bay —
// 3-pane glass under the triples, 2-pane under the pairs.
const FIELD_INSET = -0.08;
const SAW_RECESS = -0.12;
const STORE_RECESS = -0.18;
const FIELD_PIER_W = 0.6;
const PAV_MARGIN_W = 0.5;
const END_MARGIN_W = 0.9;
const CHAMFER_MARGIN_W = 0.6;
// Every bay is FIXED width (2026-08-28, user): a placement can never squeeze
// the doors or windows, because the FOOTPRINT is derived from the layout
// totals below — each face's run always equals its layout exactly. The back
// faces get their own full-length layout variants (the chamfer shortens the
// front faces by CHAMFER_AXIS_M), replacing the old faceLinking clones.
const PAIR_BAY_W = 3.1;
const TRIPLE_BAY_W = 4.3;
const PAIR_BAY = Object.freeze({ mode: 'fixed', widthMeters: PAIR_BAY_W });
const TRIPLE_BAY = Object.freeze({ mode: 'fixed', widthMeters: TRIPLE_BAY_W });
const CHAMFER_FACE_W = 3.9;
const CHAMFER_AXIS_M = CHAMFER_FACE_W / Math.SQRT2;

// 3-pane storefront glass for the wide (triple-window) bays.
const STOREFRONT_3 = Object.freeze({
    ...STOREFRONT,
    defId: 'storefront_bradbury_3',
    size: { widthMeters: 4.06, heightMeters: 3.91 },
    width: { minMeters: 3.4, maxMeters: null }
});

// One corner-door window spec shared by door_left (A) and door_front (C).
const DOOR_CORNER_WINDOW = Object.freeze({
    enabled: true,
    defId: 'door_corner_bradbury',
    assetType: 'storefront',
    size: { widthMeters: 2.1, heightMeters: 3.91 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0,
    width: { minMeters: 2.0, maxMeters: null },
    padding: { leftMeters: 0.4, rightMeters: 0.4 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: false },
    visual: { disableShades: true, interior: 'shop' },
    top: {
        enabled: false,
        assetType: 'window',
        heightMode: 'fixed',
        heightMeters: 2.0,
        verticalGapMeters: 0.1,
        frameWidthMeters: null
    },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

// Per-floor-kind segment parameters: which window fills a pair/triple cell,
// how deep windows sit in their local plane, and whether piers get capitals.
const SEG_KIND = Object.freeze({
    ground: { winDepth: STORE_RECESS, capitals: false, pair: () => STOREFRONT, triple: () => STOREFRONT_3 },
    middle: { winDepth: SAW_RECESS, capitals: true, pair: () => SASH_WINDOW(1.1, 2), triple: () => SASH_WINDOW(1.0, 3) },
    arcade: { winDepth: 0.0, capitals: false, pair: () => ARCH_WINDOW(1.05, 2), triple: () => ARCH_WINDOW(1.0, 3) }
});

function segPier(id, widthMeters, planeDepth, capitals) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        ...(Math.abs(planeDepth) > 1e-9 ? { depth: { left: planeDepth, right: planeDepth, linked: true } } : {}),
        wallMaterialOverride: null,
        ...(capitals ? { capital: PIER_CAPITAL } : {})
    };
}

function segWin(id, sizeSpec, depth, window) {
    return {
        id,
        size: sizeSpec,
        expandPreference: 'no_repeat',
        ...(Math.abs(depth) > 1e-9 ? { depth: { left: depth, right: depth, linked: true } } : {}),
        wallMaterialOverride: null,
        window
    };
}

// Raised pavilion strip: [margin pier][pair bay][margin pier], all at the
// corner plane. Its windows have NO edge depth on the upper floors — the
// sawtooth recess belongs to the field bays only; a recessed bay in a raised
// strip exposed a phantom ledge on the band top below (user report
// 2026-08-28). The ground storefront keeps its deep display recess.
function pavilionSeg(kind, prefix, { leftW = PAV_MARGIN_W, rightW = PAV_MARGIN_W } = {}) {
    const K = SEG_KIND[kind];
    return [
        segPier(`${prefix}_a`, leftW, 0, K.capitals),
        segWin(`${prefix}_w`, PAIR_BAY, kind === 'ground' ? STORE_RECESS : 0, K.pair()),
        segPier(`${prefix}_b`, rightW, 0, K.capitals)
    ];
}

// Inset wall field: piers and window bays alternating, all FIELD_INSET back.
// `pattern` cells: '2' pair, '3' triple, 'P' the portal slot (the portal box
// itself on the ground floor — untouched — and a field pair above it).
function fieldSeg(kind, prefix, pattern) {
    const K = SEG_KIND[kind];
    const items = [segPier(`${prefix}_p0`, FIELD_PIER_W, FIELD_INSET, K.capitals)];
    let wi = 0;
    for (const cell of pattern) {
        const idx = wi++;
        if (cell === 'P') {
            items.push(kind === 'ground'
                ? {
                    id: 'entry_8',
                    size: { mode: 'fixed', widthMeters: 5.6 },
                    expandPreference: 'no_repeat',
                    wallMaterialOverride: null,
                    window: ENTRY_DOOR
                }
                : segWin(`${prefix}_wP`, { mode: 'fixed', widthMeters: 5.6 }, FIELD_INSET + K.winDepth, K.pair()));
        } else if (cell === '3') {
            items.push(segWin(`${prefix}_w${idx}`, TRIPLE_BAY, FIELD_INSET + K.winDepth, K.triple()));
        } else {
            items.push(segWin(`${prefix}_w${idx}`, PAIR_BAY, FIELD_INSET + K.winDepth, K.pair()));
        }
        items.push(segPier(`${prefix}_p${wi}`, FIELD_PIER_W, FIELD_INSET, K.capitals));
    }
    return items;
}

// Corner stack bay: the ground door, or the single window that answers it on
// the floors above (chamfer-matched widths — see the corner-stack rule).
function cornerStackBay(kind, id) {
    if (kind === 'ground') {
        return {
            id,
            size: { mode: 'fixed', widthMeters: 3.4 },
            expandPreference: 'no_repeat',
            depth: { left: -0.05, right: -0.05, linked: true },
            wallMaterialOverride: null,
            window: DOOR_CORNER_WINDOW
        };
    }
    const window = kind === 'middle' ? SASH_WINDOW(1.15, 1) : ARCH_WINDOW(1.05, 1);
    // No edge depth: the corner stack lives in a raised strip, flush like
    // the pavilions — only field bays carry the sawtooth recess.
    return {
        id,
        size: { mode: 'fixed', widthMeters: 3.4 },
        expandPreference: 'no_repeat',
        wallMaterialOverride: null,
        window
    };
}

// Side street face (A): bays run back(start) → chamfer corner(end).
// `fullLength` = the back-face variant (D): same design, but the run is not
// shortened by the chamfer, so the corner-side margin pier grows by the
// chamfer's axis projection and the totals stay exact.
function sideStreetFaceItems(kind, { fullLength = false } = {}) {
    const K = SEG_KIND[kind];
    const cornerPierW = CHAMFER_MARGIN_W + (fullLength ? CHAMFER_AXIS_M : 0);
    return [
        ...pavilionSeg(kind, 'bp', { leftW: END_MARGIN_W }),
        ...fieldSeg(kind, 'f3', ['3', '2', '2', '2', '3']),
        ...pavilionSeg(kind, 'mp'),
        ...fieldSeg(kind, 'f2', ['2', '2', '2']),
        segPier('cn_a', PAV_MARGIN_W, 0, K.capitals),
        cornerStackBay(kind, kind === 'ground' ? 'door_left' : 'cn_w'),
        segPier('cn_b', cornerPierW, 0, K.capitals)
    ];
}

// Entry face (C): bays run chamfer corner(start) → far end.
function entryFaceItems(kind, { fullLength = false } = {}) {
    const K = SEG_KIND[kind];
    const cornerPierW = CHAMFER_MARGIN_W + (fullLength ? CHAMFER_AXIS_M : 0);
    return [
        segPier('cn_a', cornerPierW, 0, K.capitals),
        cornerStackBay(kind, kind === 'ground' ? 'door_front' : 'cn_w'),
        segPier('cn_b', PAV_MARGIN_W, 0, K.capitals),
        ...fieldSeg(kind, 'f3', ['3', '2', 'P', '2', '3']),
        ...pavilionSeg(kind, 'ep', { rightW: END_MARGIN_W })
    ];
}

const SIDE_ARCADE_ITEMS = sideStreetFaceItems('arcade');
const ENTRY_ARCADE_ITEMS = entryFaceItems('arcade');
const SIDE_BACK_ARCADE_ITEMS = sideStreetFaceItems('arcade', { fullLength: true });
const ENTRY_BACK_ARCADE_ITEMS = entryFaceItems('arcade', { fullLength: true });

// The footprint DERIVES from the layouts: each face's run equals its fixed
// layout total, the chamfer bridging the two street faces. All-fixed bays +
// derived extents = the design can never be squeezed or stretched.
const layoutRunMeters = (items) => items.reduce((sum, bay) => sum + (Number(bay?.size?.widthMeters) || 0), 0);
const SIDE_RUN_M = layoutRunMeters(sideStreetFaceItems('ground'));
const ENTRY_RUN_M = layoutRunMeters(entryFaceItems('ground'));
const HALF_X_M = (SIDE_RUN_M + CHAMFER_AXIS_M) / 2;
const HALF_Z_M = (ENTRY_RUN_M + CHAMFER_AXIS_M) / 2;

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
// CORNER-DOOR PARTS TABLE — single-scale measurement of 2.png (frontal
// chamfer door, fine grid). ONE anchor: the DOOR (the green glazed leaf
// area the user points at) is 2.60m TALL => 48.85 px/m; every other part
// uses the same scale, no mixing.
//   part                         px      m
//   door outer height            127     2.60   <- anchor
//   door outer width             102     2.09
//   outer stile                  8       0.16
//   meeting mullion (pair)       16      0.33
//   top rail                     9       0.18
//   kick (solid bottom, total)   25      0.51   (one FLUSH bottom rail:
//                                                doorBottomFrame.heightMeters)
//   pull grip center             -       1.18   (door middle, a bit below
//                                                the vertical center)
//   chamfer dark band            23      0.47
//   chamfer white band           33      0.68   (chamfer opening 3.75)
//   chamfer stone margin         ~44     0.90
//   chamfer face                 190     3.89
//   street-face dark band        -       0.45   (the 1.04 read was the door
//                                                recess shadow, not band)
//   street-face white band       42      0.86   (street opening 3.91)
//   ground walls                 205     4.20   (to decorator 2; stone above
//                                                the white bands = 0.51)
//   decorator 2 (beaded strip)   13      0.27   (flat strip)
//   plain band between           29      0.59   (walls of floor_bb1b)
//   decorator 1 (wedge cap)      ~11     0.25   (floor-2 windows sit ON it;
//                                                floor 2 starts ~5.3)
//   floor 2 height               ~150    3.0    (user-tuned smaller)
    layers: Object.freeze([
        {
            id: 'floor_bb1',
            type: 'floor',
            floors: 1,
            floorHeight: 4.2,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: MATVAR(3),
            belt: { enabled: false },
            // Decorator 2 (lower): a SMALL flat strip (the reference's
            // beaded course) 0.51m above the white bands.
            cornice: {
                enabled: true,
                profile: 'flat_band',
                height: 0.27,
                projection: 0.08,
                // Plain mottled noise — the block/course texture reads wrong
                // on mouldings (tools/bradbury_generate_stone_pbr.mjs).
                material: { kind: 'texture', id: 'pbr.red_sandstone_noise' }
            },
            windows: { enabled: false },
            faceLinking: { links: {} }
        },
        {
            // Thin transition strip: plain stone between the two moldings,
            // carrying decorator 1 (the upper angled band) on its head. Two
            // SEPARATED bands need this holder layer — a floor layer carries
            // one cornice + one belt, both at its top, with no gap option.
            id: 'floor_bb1b',
            type: 'floor',
            floors: 1,
            floorHeight: 0.59,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'texture', id: 'pbr.red_sandstone_noise' },
            materialVariation: MATVAR(7),
            belt: { enabled: false },
            cornice: {
                enabled: true,
                profile: 'wedge',
                height: 0.25,
                projection: 0.16,
                material: { kind: 'texture', id: 'pbr.red_sandstone_noise' }
            },
            windows: { enabled: false },
            faceLinking: { links: {} }
        },
        {
            id: 'floor_bb2',
            type: 'floor',
            floors: 3,
            floorHeight: 3.0,
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
            faceLinking: { links: {} }
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
            faceLinking: { links: {} }
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
    // Reference proportions: ~46m side street (A, +z) x ~38m entry face
    // (C, +x). The street corner is cut ~4.2m wide directly in the plan
    // (AI 512): the chamfer run promotes to a real facade face (B) that
    // carries a window per floor, like the reference (measured off 2.png —
    // the corner window is ~28% of the face and the corner entry assembly
    // ~3m, so the face is ~4.2m; the earlier 3m read was too narrow). The
    // other corners stay square.
    // Derived from the fixed layouts (see the segment kit): side run +
    // chamfer along x, entry run + chamfer along z — a longer, reference-like
    // rectangle (the 46x38 authored box read too square in the city).
    footprintLoops: Object.freeze([
        [
            { x: -HALF_X_M, z: HALF_Z_M },
            { x: HALF_X_M - CHAMFER_AXIS_M, z: HALF_Z_M },
            { x: HALF_X_M, z: HALF_Z_M - CHAMFER_AXIS_M },
            { x: HALF_X_M, z: -HALF_Z_M },
            { x: -HALF_X_M, z: -HALF_Z_M }
        ]
    ]),
    floors: 5,
    floorHeight: 3.3,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_bb1: {
            // Side street: [raised 2][3 2 2 2 3 field][raised 2][2 2 2
            // field][corner door] — assembled from the shared segment kit;
            // the corner door sits at the run's end, beside the chamfer.
            A: {
                layout: {
                    bays: {
                        items: sideStreetFaceItems('ground'),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            // Chamfer face: the corner entry — a wide glazed assembly (narrow
            // cream leaves with C-pull handles between dark side panels)
            // under the full-width dark fascia + white transom band
            // continuing around the corner, like the reference.
            B: {
                layout: {
                    bays: {
                        items: [
                            {
                                id: 'door_corner',
                                size: { mode: 'fixed', widthMeters: CHAMFER_FACE_W },
                                expandPreference: 'no_repeat',
                                depth: { left: -0.05, right: -0.05, linked: true },
                                wallMaterialOverride: null,
                                window: {
                                    enabled: true,
                                    defId: 'door_corner_bradbury_chamfer',
                                    assetType: 'storefront',
                                    size: { widthMeters: 2.1, heightMeters: 3.91 },
                                    heightMode: 'fixed',
                                    verticalOffsetMeters: 0,
                                    width: { minMeters: 2.0, maxMeters: null },
                                    padding: { leftMeters: 0.3, rightMeters: 0.3 },
                                    repeat: { count: 1 },
                                    muntins: { bottomEnabled: false, topEnabled: false },
                                    visual: { disableShades: true, interior: 'shop' },
                                    top: {
                                        enabled: false,
                                        assetType: 'window',
                                        heightMode: 'fixed',
                                        heightMeters: 2.0,
                                        verticalGapMeters: 0.1,
                                        frameWidthMeters: null
                                    },
                                    garageFacade: null,
                                    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
                                }
                            }
                        ],
                        nextBayIndex: 2
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            // Entry face: [corner door][3 2 (portal) 2 3 field][raised 2] —
            // the portal box keeps its bay (entry_8) in the field's center.
            C: {
                layout: {
                    bays: {
                        items: entryFaceItems('ground'),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            // Back faces: full-length variants of the street designs (the
            // run is not shortened by the chamfer) — explicit, not linked,
            // so their totals stay exact under the all-fixed solve.
            D: {
                layout: {
                    bays: {
                        items: sideStreetFaceItems('ground', { fullLength: true }),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            E: {
                layout: {
                    bays: {
                        items: entryFaceItems('ground', { fullLength: true }),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            }
        },
        floor_bb2: {
            // Side street: the segment kit's middle-floor variant — sawtooth
            // fields, raised pavilions, the corner single over the door.
            A: {
                layout: {
                    bays: {
                        items: sideStreetFaceItems('middle'),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            // Chamfer face: a single sash column between pilaster strips.
            B: {
                layout: {
                    bays: {
                        items: [
                            brickPier('pier_1', 0.45),
                            cornerWindowBay('win_corner', SASH_WINDOW(1.15, 1)),
                            brickPier('pier_3', 0.45)
                        ],
                        nextBayIndex: 4
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            // Entry face: middle-floor segment kit; the wP bay rides over the
            // portal box.
            C: {
                layout: {
                    bays: {
                        items: entryFaceItems('middle'),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            D: {
                layout: {
                    bays: {
                        items: sideStreetFaceItems('middle', { fullLength: true }),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            },
            E: {
                layout: {
                    bays: {
                        items: entryFaceItems('middle', { fullLength: true }),
                        nextBayIndex: 40
                    },
                    groups: { items: [], nextGroupIndex: 1 }
                }
            }
        },
        floor_bb3: {
            // Arcade floor: same segment rhythm, FLAT — arches flush with
            // their local plane, pairs over pairs, triples over triples.
            A: {
                layout: {
                    bays: {
                        items: SIDE_ARCADE_ITEMS,
                        nextBayIndex: 40
                    },
                    groups: arcadeGroup(SIDE_ARCADE_ITEMS.map((bay) => bay.id))
                }
            },
            // Chamfer face: a single arch between pilaster strips; its impost
            // band continues the front/side lines around the corner (all
            // arcade windows are 1.05m so every face springs from one line).
            B: {
                layout: {
                    bays: {
                        items: [
                            plainPier('pier_1', 0.45),
                            cornerWindowBay('win_corner', ARCH_WINDOW(1.05, 1)),
                            plainPier('pier_3', 0.45)
                        ],
                        nextBayIndex: 4
                    },
                    groups: arcadeGroup(['pier_1', 'win_corner', 'pier_3'])
                }
            },
            C: {
                layout: {
                    bays: {
                        items: ENTRY_ARCADE_ITEMS,
                        nextBayIndex: 40
                    },
                    groups: arcadeGroup(ENTRY_ARCADE_ITEMS.map((bay) => bay.id))
                }
            },
            D: {
                layout: {
                    bays: {
                        items: SIDE_BACK_ARCADE_ITEMS,
                        nextBayIndex: 40
                    },
                    groups: arcadeGroup(SIDE_BACK_ARCADE_ITEMS.map((bay) => bay.id))
                }
            },
            E: {
                layout: {
                    bays: {
                        items: ENTRY_BACK_ARCADE_ITEMS,
                        nextBayIndex: 40
                    },
                    groups: arcadeGroup(ENTRY_BACK_ARCADE_ITEMS.map((bay) => bay.id))
                }
            }
        }
    }),
    // Three fire escapes spread along the side street face, like the
    // reference corner view; the entry face stays clean.
    attachments: Object.freeze({
        items: [
            {
                id: 'attachment_1',
                type: 'fire_escape',
                target: { layerId: 'floor_bb2', faceId: 'A', bayId: 'f3_w1' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.7, depthMeters: 0.95 }
            },
            {
                id: 'attachment_2',
                type: 'fire_escape',
                target: { layerId: 'floor_bb2', faceId: 'A', bayId: 'f3_w3' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.7, depthMeters: 0.95 }
            },
            {
                id: 'attachment_3',
                type: 'fire_escape',
                target: { layerId: 'floor_bb2', faceId: 'A', bayId: 'f2_w1' },
                floors: { start: 1, end: 0 },
                platform: { widthMeters: 2.7, depthMeters: 0.95 }
            }
        ]
    }),
    // AI 508: "BRADBURY" raised stone letters on the portal box frieze —
    // carved from the same sandstone as the box, in the flat band between the
    // archivolt crown and the floor top. The letter depth reaches past the
    // box face (0.15 proud of the facade plane) so the sign stands ~7cm in
    // relief on the box.
    wallDecorations: Object.freeze({
        lettering: [
            {
                id: 'sign_bradbury',
                text: 'BRADBURY',
                target: {
                    layerId: 'floor_bb1',
                    bayRef: 'C:entry_8',
                    zone: 'opening_header',
                    floor: 1,
                    yOffsetMeters: 0.3
                },
                heightMeters: 0.24,
                depthMeters: 0.22,
                letterSpacingRatio: 0.26,
                material: { kind: 'slot', id: 'base' }
            }
        ]
    }),
    // AI 510: the entry portal decomposed from the reference as LAYERS — one
    // clay-sandstone BOX filling the widened entry bay (face proud of the
    // facade, blind panel insets on the piers, molded base course), a true
    // semicircular arch, two inset levels telescoping to the deep dark door,
    // an archivolt ring stopping on wedge impost courses, and the
    // foliate-capital GLB relief-mounted atop each pier.
    portalDefinitions: Object.freeze({
        items: [
            {
                id: 'portal_bradbury_entry',
                name: 'Bradbury Entry Portal',
                box: { sideMarginMeters: 0.8, topMarginMeters: 0.5, projectionMeters: 0.15 },
                levels: [
                    {
                        frameWidthMeters: 0.28,
                        depthMeters: 0.3,
                        arch: true,
                        ring: { widthMeters: 0.2, projectionMeters: 0.08, profile: 'band', jambs: 'stop' }
                    },
                    { frameWidthMeters: 0.18, depthMeters: 0.5, arch: true }
                ],
                impost: { heightMeters: 0.22, projectionMeters: 0.09, profile: 'wedge', walls: 'both' },
                panels: [
                    { xMeters: 2.28, yMeters: 0.5, widthMeters: 0.34, heightMeters: 2.6, depthMeters: 0.06 }
                ],
                base: { heightMeters: 0.5, projectionMeters: 0.05, profile: 'skirt', walls: 'both' },
                steps: {
                    count: 1,
                    riseMeters: 0.12,
                    treadDepthMeters: 0.34,
                    widthPaddingMeters: 0.35,
                    material: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' }
                },
                custom: [
                    { part: 'foliate_capital', anchor: 'face', mount: 'relief', scaleMeters: 0.6, offsetMeters: { x: 2.24, y: 3.85, out: 0.03 } }
                ],
                // The portal is carved from the SAME stone as the ground
                // floor wall (the reference is monochrome); only the deep
                // recess goes darker.
                palette: {
                    box: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    level: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    ring: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    impost: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    panel: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    base: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    recess: { mode: 'pbr', materialId: 'pbr.brownstone' },
                    steps: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' },
                    custom: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' }
                }
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
                        // AI 507: reference-deep sash reveal; the interior
                        // shell clears inset frames now, no light ring.
                        inset: 0.16,
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
                // AI 511: the window + spandrel strip recesses as one carved
                // rectangular panel; the piers between stay proud. The sill
                // sits at 0.55, so 0.45 of bottom padding reaches almost to
                // the floor line without crossing it.
                insets: [
                    { widthPaddingMeters: 0.12, topPaddingMeters: 0.12, bottomPaddingMeters: 0.45, depthMeters: 0.06 }
                ],
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
                        // AI 507: the sash mounts at the innermost inset
                        // plane; the reveal walls read as brick.
                        inset: 0.16,
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
                    // AI 511: no appliqué archivolt — the arch reading comes
                    // from the nested arch-topped inset edges below.
                    header: { enabled: false },
                    jambs: { enabled: false },
                    trim: { enabled: false }
                },
                // AI 511: an arched recessed panel around each window and a
                // second, deeper recess where the window sits. The authored
                // paddings are generous — the repeat-slot clamp shrinks them
                // so neighbouring arcs JUST touch at the springing points,
                // the reference's continuous rhythm.
                insets: [
                    { widthPaddingMeters: 0.09, bottomPaddingMeters: 0.0, depthMeters: 0.08 },
                    { widthPaddingMeters: 0.06, bottomPaddingMeters: 0.0, depthMeters: 0.08 }
                ],
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
                        // AI 507: storefront joinery set into the stone piers.
                        inset: 0.24,
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
                    // Display glass reads LIGHTER than the door glass in the
                    // reference: green-gray with prominent sky reflections.
                    glass: {
                        opacity: 0.5,
                        tintHex: 0x46524c,
                        reflection: { metalness: 0, roughness: 0.03, transmission: 0, ior: 1.5, envMapIntensity: 1.7 },
                        zOffset: -0.03
                    },
                    shade: { enabled: false },
                    // The street-level glass carries the generated silhouette
                    // fake texture (flat, zero parallax) instead of the loud
                    // photographic shop parallax.
                    interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.shop_silhouette' }
                },
                storefront: {
                    fasciaBelowTransom: true,
                    bulkhead: { enabled: false },
                    // One continuous band anatomy with the corner doors:
                    // glass head at ~2.35, ~0.9m dark fascia, ~0.85m white
                    // transom (reference-measured).
                    transom: {
                        mode: 'solid',
                        heightMeters: 0.86,
                        columns: 1,
                        emissiveColorHex: 0xffffff,
                        emissiveIntensity: 1.9,
                        material: { mode: 'color', colorHex: 0xa2947a, roughness: 0.95 },
                        insetMeters: 0.06
                    },
                    fascia: {
                        enabled: true,
                        heightMeters: 0.45,
                        projectionMeters: -0.12,
                        material: { mode: 'match_frame' }
                    }
                },
                decoration: null,
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: true },
                wall: { materialId: 'pbr.red_brick', roughness: 0.85, normalIntensity: 1, cutWidthLerp: 0, cutHeightLerp: 0, floorDistanceMeters: 0 }
            },
            {
                // The wide storefront for the triple-window bays: identical
                // anatomy to storefront_bradbury, one more glazing column —
                // the ground floor mirrors the bay rhythm (3-pane glass under
                // triples, 2-pane under pairs).
                id: 'storefront_bradbury_3',
                assetType: 'storefront',
                name: 'Bradbury Storefront 3-Pane',
                settings: {
                    version: 1,
                    width: 4.2,
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
                        inset: 0.24,
                        openBottom: false,
                        addHandles: false,
                        colorHex: 0x1d2023,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.5, metalness: 0.1, envMapIntensity: 0.3, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: true,
                        columns: 3,
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
                        opacity: 0.5,
                        tintHex: 0x46524c,
                        reflection: { metalness: 0, roughness: 0.03, transmission: 0, ior: 1.5, envMapIntensity: 1.7 },
                        zOffset: -0.03
                    },
                    shade: { enabled: false },
                    interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.shop_silhouette' }
                },
                storefront: {
                    fasciaBelowTransom: true,
                    bulkhead: { enabled: false },
                    transom: {
                        mode: 'solid',
                        heightMeters: 0.86,
                        columns: 1,
                        emissiveColorHex: 0xffffff,
                        emissiveIntensity: 1.9,
                        material: { mode: 'color', colorHex: 0xa2947a, roughness: 0.95 },
                        insetMeters: 0.06
                    },
                    fascia: {
                        enabled: true,
                        heightMeters: 0.45,
                        projectionMeters: -0.12,
                        material: { mode: 'match_frame' }
                    }
                },
                decoration: null,
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: true },
                wall: { materialId: 'pbr.red_brick', roughness: 0.85, normalIntensity: 1, cutWidthLerp: 0, cutHeightLerp: 0, floorDistanceMeters: 0 }
            },
            {
                // The corner entry: a cream double door — two leaves side by
                // side, each with dark glass over a solid cream kick panel
                // (the panel is IN the leaf), squared C-pull handles at the
                // meeting stiles — under the storefront run's dark fascia +
                // white backlit transom (a storefront asset so the zone band
                // continues around the corner).
                id: 'door_corner_bradbury',
                assetType: 'storefront',
                name: 'Bradbury Corner Entry Door',
                settings: {
                    version: 1,
                    width: 2.1,
                    height: 3.91,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.16,
                        verticalWidth: 0.16,
                        horizontalWidth: 0.18,
                        depth: 0.1,
                        inset: 0.24,
                        openBottom: true,
                        addHandles: true,
                        handleStyle: 'c_pull',
                        handleMaterialMode: 'metal',
                        handleColorHex: 0x2b2620,
                        doorStyle: 'double',
                        doorKickPanel: { enabled: false, heightMeters: 0.33 },
                        doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.51 },
                        doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                        colorHex: 0xcfc2a4,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.25, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: false,
                        columns: 1,
                        rows: 1,
                        verticalWidth: 0.06,
                        horizontalWidth: 0.04,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0xcfc2a4,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.25, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.6,
                        tintHex: 0x1c2126,
                        reflection: { metalness: 0, roughness: 0.04, transmission: 0, ior: 1.5, envMapIntensity: 1.2 },
                        zOffset: -0.05
                    },
                    shade: { enabled: false },
                    // Same dark silhouette glass as the neighbouring
                    // storefronts, so the corner entry reads as one run.
                    interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.shop_silhouette' }
                },
                storefront: {
                    fasciaBelowTransom: true,
                    bulkhead: { enabled: false },
                    // Reference band heights at the corner: ~0.9m dark fascia
                    // directly over the 2.35m door, ~0.85m white transom over
                    // it (stone band above fills the floor).
                    // Depth order from the street (reference): the WHITE
                    // transom face closest to the wall plane, the DARK fascia
                    // a bit behind it, the door deepest.
                    transom: {
                        mode: 'solid',
                        heightMeters: 0.86,
                        columns: 1,
                        emissiveColorHex: 0xffffff,
                        emissiveIntensity: 1.9,
                        material: { mode: 'color', colorHex: 0xa2947a, roughness: 0.95 },
                        insetMeters: 0.06
                    },
                    fascia: {
                        enabled: true,
                        heightMeters: 0.45,
                        projectionMeters: -0.12,
                        // The frame is cream, so the dark band is an explicit
                        // color (match_frame would go cream too).
                        material: { mode: 'color', colorHex: 0x171a1d, roughness: 0.8 }
                    }
                },
                decoration: null,
                layers: { frame: true, muntins: false, glass: true, shade: false, interior: false },
                wall: { materialId: 'pbr.red_brick', roughness: 0.85, normalIntensity: 1, cutWidthLerp: 0, cutHeightLerp: 0, floorDistanceMeters: 0 }
            },
            {
                // The chamfer door's bands are SHORTER than the street faces'
                // (measured): white 0.68, dark 0.47 over the same 2.6m door — two leaves side by
                // side, each with dark glass over a solid cream kick panel
                // (the panel is IN the leaf), squared C-pull handles at the
                // meeting stiles — under the storefront run's dark fascia +
                // white backlit transom (a storefront asset so the zone band
                // continues around the corner).
                id: 'door_corner_bradbury_chamfer',
                assetType: 'storefront',
                name: 'Bradbury Chamfer Entry Door',
                settings: {
                    version: 1,
                    width: 2.1,
                    height: 3.91,
                    arch: {
                        enabled: false,
                        heightRatio: 0.25,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.16,
                        verticalWidth: 0.16,
                        horizontalWidth: 0.18,
                        depth: 0.1,
                        inset: 0.24,
                        openBottom: true,
                        addHandles: true,
                        handleStyle: 'c_pull',
                        handleMaterialMode: 'metal',
                        handleColorHex: 0x2b2620,
                        doorStyle: 'double',
                        doorKickPanel: { enabled: false, heightMeters: 0.33 },
                        doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.51 },
                        doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                        colorHex: 0xcfc2a4,
                        bevel: { size: 0.3, roundness: 0.65 },
                        material: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.25, normalStrength: 0.6 }
                    },
                    muntins: {
                        enabled: false,
                        columns: 1,
                        rows: 1,
                        verticalWidth: 0.06,
                        horizontalWidth: 0.04,
                        depth: 0.05,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0xcfc2a4,
                        bevel: { inherit: true, bevel: { size: 0.3, roundness: 0.65 } },
                        material: {
                            inheritFromFrame: true,
                            pbr: { roughness: 0.55, metalness: 0.05, envMapIntensity: 0.25, normalStrength: 0.6 }
                        }
                    },
                    glass: {
                        opacity: 0.6,
                        tintHex: 0x1c2126,
                        reflection: { metalness: 0, roughness: 0.04, transmission: 0, ior: 1.5, envMapIntensity: 1.2 },
                        zOffset: -0.05
                    },
                    shade: { enabled: false },
                    // Same dark silhouette glass as the neighbouring
                    // storefronts, so the corner entry reads as one run.
                    interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.shop_silhouette' }
                },
                storefront: {
                    fasciaBelowTransom: true,
                    bulkhead: { enabled: false },
                    // Reference band heights at the corner: ~0.9m dark fascia
                    // directly over the 2.35m door, ~0.85m white transom over
                    // it (stone band above fills the floor).
                    // Depth order from the street (reference): the WHITE
                    // transom face closest to the wall plane, the DARK fascia
                    // a bit behind it, the door deepest.
                    transom: {
                        mode: 'solid',
                        heightMeters: 0.86,
                        columns: 1,
                        emissiveColorHex: 0xffffff,
                        emissiveIntensity: 1.9,
                        material: { mode: 'color', colorHex: 0xa2947a, roughness: 0.95 },
                        insetMeters: 0.06
                    },
                    fascia: {
                        enabled: true,
                        heightMeters: 0.45,
                        projectionMeters: -0.12,
                        // The frame is cream, so the dark band is an explicit
                        // color (match_frame would go cream too).
                        material: { mode: 'color', colorHex: 0x171a1d, roughness: 0.8 }
                    }
                },
                decoration: null,
                layers: { frame: true, muntins: false, glass: true, shade: false, interior: false },
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
                        // AI 510: a TRUE semicircle — rise = half the chord,
                        // circle center exactly on the springing line, so the
                        // portal levels' concentric arches are semicircular.
                        heightRatio: 0.5,
                        meetsRectangleFrame: true,
                        topPieceMode: 'frame',
                        clipVerticalMuntinsToRectWhenNoTopPiece: true
                    },
                    frame: {
                        width: 0.09,
                        verticalWidth: 0.09,
                        horizontalWidth: 0.09,
                        depth: 0.11,
                        // AI 507: on top of the portal levels' depth (the def
                        // chains it), a small extra reveal at the last plane.
                        inset: 0.1,
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
                        opacity: 0.96,
                        tintHex: 0x0f0e0d,
                        reflection: { metalness: 0, roughness: 0.05, transmission: 0, ior: 1.5, envMapIntensity: 1.3 },
                        zOffset: -0.06
                    },
                    shade: { enabled: false },
                    interior: { enabled: false }
                },
                // AI 510: the portal def owns the WHOLE surround — box,
                // levels, archivolt ring, imposts, panels, base, steps,
                // capitals, recess material. The interim appliqué surround
                // (arched-band header + jamb slabs + inline recess/steps) is
                // gone.
                portal: { enabled: true, defId: 'portal_bradbury_entry' },
                decoration: {
                    sill: { enabled: false },
                    header: { enabled: false },
                    jambs: { enabled: false }
                },
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: false }
            }
        ]
    })
});

export default BRADBURY_BLOCK_BUILDING_CONFIG;
