// src/graphics/content3d/buildings/configs/ModernBank.js
// City building config: Modern Bank — reproduction of the reference render
// downloads/buildings_references/"10 front.png" (see
// docs/modern_bank_reference_notes.md for the measured elevation).
//
// The reference is one idea repeated at two scales: a dark bronze curtain wall
// on a 27-module grid sitting on a monumental burnt-cement base pierced by six
// tall recessed openings. Everything below is derived from ONE module
// M = 1.25m (the reference's 33.2px bay) and ONE floor pitch of 3.31m (88px),
// so the elevation keeps the reference's proportions:
//   - front 27M = 33.75m of glass (34.15m at the base, which projects 0.2m)
//   - flank 24M = 30.00m of glass (30.40m at the base)
//   - 9 curtain wall glass courses separated by 8 metal spandrel panels
//   - a 12.0m base: six openings on the reference rhythm (3.24m openings,
//     1.81m piers, 2.83m end piers)
const MODULE_METERS = 1.25;
const CURTAIN_FLOOR_HEIGHT = 3.31;
// The sill course is a storey without its panel band.
const CURTAIN_SILL_FLOOR_HEIGHT = 2.29;
const BASE_PROJECTION = 0.2;

const FRONT_HALF_WIDTH = 17.075;   // 27M glass + 2 x base projection
const FLANK_HALF_DEPTH = 15.2;     // 24M glass + 2 x base projection

// Base storeys: every split is a transom line measured off the reference —
// the entry door head at 3.42m, the head of the lit banking-hall glazing at
// 6.24m, and the top of the base at 12.0m. The splits exist because a bay
// carries ONE opening definition per floor layer, so the door, the lit glass
// and the dark glass above it each need their own storey.
const BASE_LOW_HEIGHT = 3.42;
const BASE_MID_HEIGHT = 2.82;
const BASE_HIGH_HEIGHT = 5.76;
const BASE_OPENING_WIDTH = 3.24;   // measured off the reference elevation
const BASE_PIER_WIDTH = 1.81;
const BASE_PIER_END_FRONT = 2.83;
const BASE_PIER_END_FLANK = 3.48;
// The openings stop 0.94m below the top of the base (the reference's 27px
// head band of stone), so the tallest storey's glazing is short of its floor.
const BASE_HIGH_OPENING_HEIGHT = 4.82;
const BASE_OPENING_DEPTH = -0.34;  // recessed; the window frame insets further

// ---------------------------------------------------------------------------
// Curtain wall — ONE window per module per floor, running the full storey.
// The reference unit is a tall pane of dark reflective glass with a short
// metal spandrel panel UNDER it, and both belong to the same window: the panel
// is the window's own bottom rail grown to panel height, so it wears the
// frame's metal, the mullion grid runs unbroken past it, and it casts shadow.
// Reference proportions per 3.31m floor: 2.19m of glass over a 1.02m panel,
// with a 0.10m head rail.
//
// The wall is left as the 0.02m strip between neighbouring modules and nothing
// else. It cannot carry the spandrel: a wall surface in this engine bottoms
// out around sRGB 78 on a sunlit face however dark its albedo, so a spandrel
// authored as wall shows up as a pale stripe across a dark glass grid.
// ---------------------------------------------------------------------------
const CURTAIN_PANEL_HEIGHT = 1.02;

function curtainPane(defId) {
    return {
        enabled: true,
        defId,
        assetType: 'window',
        size: { widthMeters: 1.23, heightMeters: CURTAIN_FLOOR_HEIGHT },
        heightMode: 'full',
        verticalOffsetMeters: 0,
        width: { minMeters: 1.23, maxMeters: null },
        padding: { leftMeters: 0.01, rightMeters: 0.01 },
        repeat: { count: 1 },
        muntins: { bottomEnabled: false, topEnabled: false },
        // A parallax office behind the glass is what BACKS the opening
        // (AI 495): an unbacked pane forces the legacy interior shell, which
        // on a flush facade lands 1cm behind the wall and wins the depth test
        // over it — the facade then renders as pale plaster.
        visual: { disableShades: true, interior: 'office' },
        top: {
            enabled: false,
            assetType: 'window',
            heightMode: 'fixed',
            heightMeters: 1.0,
            verticalGapMeters: 0.1,
            frameWidthMeters: null
        },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

const CURTAIN_PANE = Object.freeze(curtainPane('window_mb_curtain'));
// The bottom storey of the shaft carries no panel, so the glass runs down to
// the stone the way the reference's does: nine glass courses separated by
// eight panels, glass at both ends of the stack.
const CURTAIN_PANE_SILL = Object.freeze(curtainPane('window_mb_curtain_sill'));

// ---------------------------------------------------------------------------
// Base openings. `full` height mode makes each storey's glazing run the whole
// segment, so the low and high screens meet in one continuous run behind the
// stone reveal (the reference shows no sill or head between them).
// ---------------------------------------------------------------------------
function baseOpening(defId, { heightMode = 'full', heightMeters = 3.0, assetType = 'window' } = {}) {
    return {
        enabled: true,
        defId,
        assetType,
        size: { widthMeters: BASE_OPENING_WIDTH, heightMeters },
        heightMode,
        verticalOffsetMeters: 0,
        width: { minMeters: BASE_OPENING_WIDTH, maxMeters: null },
        padding: { leftMeters: 0, rightMeters: 0 },
        repeat: { count: 1 },
        muntins: { bottomEnabled: true, topEnabled: true },
        // Backed by its own parallax interior for the same reason as the
        // curtain wall: an unbacked opening forces the legacy interior shell,
        // whose plane sits 1cm behind the recessed bay and so pokes THROUGH
        // the reveal as a hairline seam and, at each storey line, as a lit
        // ledge in front of the glass.
        visual: { disableShades: true, interior: 'office' },
        top: {
            enabled: false,
            assetType: 'window',
            heightMode: 'fixed',
            heightMeters,
            verticalGapMeters: 0,
            frameWidthMeters: null
        },
        garageFacade: null,
        wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
    };
}

const BASE_LOW_GLASS = baseOpening('window_mb_base_low');
const BASE_LOW_GLASS_LIT = baseOpening('window_mb_base_low_lit');
const BASE_LOW_ENTRY = baseOpening('door_mb_entry', { assetType: 'door' });
const BASE_MID_GLASS = baseOpening('window_mb_base_mid');
const BASE_MID_GLASS_LIT = baseOpening('window_mb_base_mid_lit');
const BASE_HIGH_GLASS = baseOpening('window_mb_base_high', {
    heightMode: 'fixed',
    heightMeters: BASE_HIGH_OPENING_HEIGHT
});

// ---------------------------------------------------------------------------
// Bay helpers
// ---------------------------------------------------------------------------
function pierBay(id, widthMeters) {
    return {
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        wallMaterialOverride: null
    };
}

function openingBay(id, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters: BASE_OPENING_WIDTH },
        expandPreference: 'no_repeat',
        depth: { left: BASE_OPENING_DEPTH, right: BASE_OPENING_DEPTH, linked: true },
        wallMaterialOverride: null,
        window
    };
}

// One module of curtain wall: the pane, with the mullion left as the wall
// strip between neighbouring bays. `prefer_repeat` lets the solver tile the
// module across the whole face, so a 27-module front and a 24-module flank
// come from the same authored bay.
function curtainBay(id, window) {
    return {
        id,
        size: { mode: 'fixed', widthMeters: MODULE_METERS },
        expandPreference: 'prefer_repeat',
        wallMaterialOverride: null,
        window
    };
}

// Base facade for one face: end pier, then opening/pier pairs, then end pier.
// `contentFor(index)` picks the opening content per position (0-based), which
// is how the entry and the two lit bays differ from the plain glazed runs.
function baseFacade({ openings, endPierWidth, contentFor }) {
    const items = [pierBay('bay_pier_start', endPierWidth)];
    for (let i = 0; i < openings; i++) {
        items.push(openingBay(`bay_open_${i + 1}`, contentFor(i)));
        if (i < openings - 1) items.push(pierBay(`bay_pier_${i + 1}`, BASE_PIER_WIDTH));
    }
    items.push(pierBay('bay_pier_end', endPierWidth));
    return {
        layout: {
            bays: { items, nextBayIndex: items.length + 1 },
            groups: { items: [], nextGroupIndex: 1 }
        }
    };
}

const CURTAIN_FACADE = Object.freeze({
    layout: {
        bays: { items: [curtainBay('bay_module', CURTAIN_PANE)], nextBayIndex: 2 },
        groups: { items: [], nextGroupIndex: 1 }
    }
});

const CURTAIN_SILL_FACADE = Object.freeze({
    layout: {
        bays: { items: [curtainBay('bay_module', CURTAIN_PANE_SILL)], nextBayIndex: 2 },
        groups: { items: [], nextGroupIndex: 1 }
    }
});

// The front (face A) carries the entry in the first opening and the two lit
// banking-hall bays in the middle, exactly as the reference does.
const FRONT_LOW_CONTENT = (i) => {
    if (i === 0) return BASE_LOW_ENTRY;
    if (i === 2 || i === 3) return BASE_LOW_GLASS_LIT;
    return BASE_LOW_GLASS;
};
const FRONT_MID_CONTENT = (i) => ((i === 2 || i === 3) ? BASE_MID_GLASS_LIT : BASE_MID_GLASS);
const FLANK_LOW_CONTENT = () => BASE_LOW_GLASS;
const FLANK_MID_CONTENT = () => BASE_MID_GLASS;
const HIGH_CONTENT = () => BASE_HIGH_GLASS;

// ---------------------------------------------------------------------------
// Shared window-definition fragments
// ---------------------------------------------------------------------------
const NO_ARCH = Object.freeze({
    enabled: false,
    heightRatio: 0.25,
    meetsRectangleFrame: true,
    topPieceMode: 'frame',
    clipVerticalMuntinsToRectWhenNoTopPiece: true
});

// Mullions read MATTE in the reference: the sheen belongs to the glass, so the
// frames stay near-diffuse or a sunlit facade turns into a net of bright wire.
const BRONZE_FRAME_PBR = Object.freeze({
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.04,
    normalStrength: 0.55
});

// Reference glass: dark solar glazing, close to NEUTRAL — the warm brown in
// the reference's lower panes is the brick opposite being mirrored, not the
// tint, and its sky-reflecting panes read plain grey. Metalness is what makes
// it read as REFLECTIVE rather than as tinted paint: it drops the diffuse term
// so the pane is dark except where it mirrors the sky.
const BRONZE_GLASS = Object.freeze({
    opacity: 1.0,
    tintHex: 0x3b3d40,
    reflection: { metalness: 0.28, roughness: 0.035, transmission: 0, ior: 1.9, envMapIntensity: 2.2 },
    zOffset: -0.02
});

const BASE_GLASS = Object.freeze({
    opacity: 1.0,
    tintHex: 0x191410,
    reflection: { metalness: 0, roughness: 0.08, transmission: 0, ior: 1.6, envMapIntensity: 0.6 },
    zOffset: -0.03
});

// The two banking-hall bays the reference lights from within: pale diffusing
// glazing over a warm lit interior.
const BASE_GLASS_LIT = Object.freeze({
    opacity: 1.0,
    tintHex: 0x625e56,
    reflection: { metalness: 0, roughness: 0.45, transmission: 0, ior: 1.4, envMapIntensity: 0.25 },
    zOffset: -0.03
});

// One curtain wall unit: a full-storey pane of dark reflective glass with the
// metal spandrel panel under it. The panel is the window's own BOTTOM RAIL,
// grown to the panel height (`doorBottomFrame`, the storefront kick as a flush
// frame member) — so it wears the frame's metal, sits in front of the glass,
// and casts shadow like the mullions do. `panelHeight: 0` gives the plain
// glass course that meets the stone.
function curtainPaneDef({ id, name, panelHeight }) {
    const hasPanel = panelHeight > 0;
    const mullion = {
        width: 0.06,
        verticalWidth: 0.062,
        horizontalWidth: 0.1,
        depth: 0.12,
        // Negative inset stands the mullion proud of the glass, the way the
        // reference's projecting fins do.
        inset: -0.025,
        openBottom: hasPanel,
        doorBottomFrame: hasPanel
            ? { enabled: true, mode: 'match', heightMeters: panelHeight }
            : { enabled: false, mode: 'match' },
        addHandles: false,
        colorHex: 0x141518,
        bevel: { size: 0.04, roundness: 0.4 },
        material: BRONZE_FRAME_PBR
    };
    return {
        id,
        assetType: 'window',
        name,
        settings: {
            version: 1,
            width: 1.23,
            height: CURTAIN_FLOOR_HEIGHT,
            arch: NO_ARCH,
            frame: mullion,
            muntins: {
                enabled: false,
                columns: 1,
                rows: 1,
                verticalWidth: 0.03,
                horizontalWidth: 0.03,
                depth: 0.03,
                inset: 0.01,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x141518,
                bevel: { inherit: true, bevel: { size: 0.04, roundness: 0.4 } },
                material: { inheritFromFrame: true, pbr: BRONZE_FRAME_PBR }
            },
            glass: BRONZE_GLASS,
            shade: { enabled: false },
            interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.office' }
        },
        decoration: { sill: { enabled: false }, header: { enabled: false }, jambs: { enabled: false } },
        layers: { frame: true, muntins: false, glass: true, shade: false, interior: true }
    };
}

// One base-storey glazed screen. Every storey of the base carries the same
// joinery — two panes wide, deep in the stone reveal — and differs only in
// height, in how many rows of glass it holds, and in whether it is lit.
function baseScreen({ id, name, height, rows, lit = false }) {
    return {
        id,
        assetType: 'window',
        name,
        settings: {
            version: 1,
            width: BASE_OPENING_WIDTH,
            height,
            arch: NO_ARCH,
            frame: {
                width: 0.11,
                verticalWidth: 0.11,
                horizontalWidth: 0.07,
                depth: 0.14,
                // Inset deeper than the frame is thick, so a storey boundary
                // does not leave the two frames' shared bar proud of the
                // reveal as a lit ledge at grazing angles.
                inset: 0.17,
                openBottom: false,
                addHandles: false,
                colorHex: 0x241f1a,
                bevel: { size: 0.04, roundness: 0.4 },
                material: BRONZE_FRAME_PBR
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows,
                verticalWidth: 0.09,
                horizontalWidth: 0.06,
                depth: 0.07,
                inset: 0.012,
                uvOffset: { x: 0, y: 0 },
                colorHex: 0x241f1a,
                bevel: { inherit: true, bevel: { size: 0.04, roundness: 0.4 } },
                material: { inheritFromFrame: true, pbr: BRONZE_FRAME_PBR }
            },
            glass: lit ? BASE_GLASS_LIT : BASE_GLASS,
            shade: { enabled: false },
            interior: lit
                ? { enabled: true, parallaxInteriorPresetId: 'parallax_interior.office', emissiveIntensity: 0.3 }
                : { enabled: true, parallaxInteriorPresetId: 'parallax_interior.office' }
        },
        decoration: { sill: { enabled: false }, header: { enabled: false }, jambs: { enabled: false } },
        layers: { frame: true, muntins: true, glass: true, shade: false, interior: true }
    };
}

export const MODERN_BANK_BUILDING_CONFIG = Object.freeze({
    id: 'modern_bank',
    name: 'Modern Bank',
    materialSlots: Object.freeze({
        slots: {
            // The base: burnt cement in ~1.4m square cast panels.
            base: { material: { kind: 'texture', id: 'pbr.burnt_cement_panel' } },
            // The curtain wall skin: mullion faces and spandrel backing.
            curtain: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } },
            trim: { material: { kind: 'texture', id: 'pbr.bronze_anodized_panel' } }
        }
    }),
    layers: Object.freeze([
        {
            id: 'floor_mb_base_low',
            type: 'floor',
            floors: 1,
            floorHeight: BASE_LOW_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: {
                enabled: true,
                seedOffset: 21,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.14,
                aoAmount: 0.45,
                macroLayers: [
                    { enabled: true, intensity: 0.18, value: -0.05, scale: 5.5 },
                    { enabled: false },
                    { enabled: false },
                    { enabled: false }
                ],
                wearBottom: { enabled: true, intensity: 0.3, value: -0.16, hueDegrees: -8 },
                wearSide: { enabled: true, intensity: 0.15, value: -0.1, width: 0.7, scale: 4.5 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_mb_base_mid',
            type: 'floor',
            floors: 1,
            floorHeight: BASE_MID_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: {
                enabled: true,
                seedOffset: 22,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.14,
                aoAmount: 0.45,
                macroLayers: [
                    { enabled: true, intensity: 0.18, value: -0.05, scale: 5.5 },
                    { enabled: false },
                    { enabled: false },
                    { enabled: false }
                ],
                wearSide: { enabled: true, intensity: 0.15, value: -0.1, width: 0.7, scale: 4.5 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            id: 'floor_mb_base_high',
            type: 'floor',
            floors: 1,
            floorHeight: BASE_HIGH_HEIGHT,
            planOffset: 0,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'base' },
            materialVariation: {
                enabled: true,
                seedOffset: 23,
                root: 'wall',
                space: 'world',
                worldSpaceScale: 0.14,
                aoAmount: 0.45,
                macroLayers: [
                    { enabled: true, intensity: 0.18, value: -0.05, scale: 5.5 },
                    { enabled: false },
                    { enabled: false },
                    { enabled: false }
                ],
                wearTop: { enabled: true, intensity: 0.18, value: -0.1 },
                wearSide: { enabled: true, intensity: 0.15, value: -0.1, width: 0.7, scale: 4.5 }
            },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { C: 'A', D: 'B' } }
        },
        {
            // The bottom course of the glass box: one storey of glass with no
            // panel under it, so the glazing meets the stone directly.
            id: 'floor_mb_curtain_sill',
            type: 'floor',
            floors: 1,
            floorHeight: CURTAIN_SILL_FLOOR_HEIGHT,
            planOffset: BASE_PROJECTION,
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'curtain' },
            materialVariation: { enabled: false },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            // The glass box, set back 0.2m so the base reads as a plinth.
            id: 'floor_mb_curtain',
            type: 'floor',
            floors: 8,
            floorHeight: CURTAIN_FLOOR_HEIGHT,
            // Zero: planOffset is RELATIVE to the layer below, and the sill
            // course already stepped the shaft back off the plinth.
            planOffset: 0,
            // The glazing is backed by its own parallax office, so the shaft
            // needs no interior shell (which would sit 1cm behind this flush
            // facade and z-fight it away).
            interior: { enabled: false },
            style: 'default',
            material: { kind: 'slot', id: 'curtain' },
            // No variation on the shaft: an anodized metal skin has no
            // weathering to break up, and a macro value lift on a near-black
            // albedo washes the spandrel course out to pale grey.
            materialVariation: { enabled: false },
            belt: { enabled: false },
            windows: { enabled: false },
            faceLinking: { links: { B: 'A', C: 'A', D: 'A' } }
        },
        {
            // The reference cap: a flat bronze band projecting just past the
            // glass, with the top spandrel course reading as its fascia.
            id: 'roof_mb',
            type: 'roof',
            ring: {
                enabled: true,
                innerRadius: 0.3,
                outerRadius: 0.0,
                height: 0.75,
                material: { kind: 'slot', id: 'curtain' }
            },
            cornice: {
                enabled: true,
                profile: 'flat_band',
                height: 0.55,
                projection: 0.17,
                material: { kind: 'slot', id: 'trim' },
                ornament: { type: 'none', width: 0.1, depth: 0.1, spacing: 0.2, height: 0.1 },
                parapet: {
                    coping: { enabled: false, height: 0.08, overhang: 0.04, material: { kind: 'slot', id: 'trim' } },
                    stepped: { enabled: false, mode: 'corners', blockWidth: 0.9, raise: 0.4 }
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
    ]),
    footprintLoops: Object.freeze([
        [
            { x: -FRONT_HALF_WIDTH, z: FLANK_HALF_DEPTH },
            { x: FRONT_HALF_WIDTH, z: FLANK_HALF_DEPTH },
            { x: FRONT_HALF_WIDTH, z: -FLANK_HALF_DEPTH },
            { x: -FRONT_HALF_WIDTH, z: -FLANK_HALF_DEPTH }
        ]
    ]),
    floors: 11,
    floorHeight: CURTAIN_FLOOR_HEIGHT,
    style: 'default',
    windows: null,
    facades: Object.freeze({
        floor_mb_base_low: {
            A: baseFacade({ openings: 6, endPierWidth: BASE_PIER_END_FRONT, contentFor: FRONT_LOW_CONTENT }),
            B: baseFacade({ openings: 5, endPierWidth: BASE_PIER_END_FLANK, contentFor: FLANK_LOW_CONTENT })
        },
        floor_mb_base_mid: {
            A: baseFacade({ openings: 6, endPierWidth: BASE_PIER_END_FRONT, contentFor: FRONT_MID_CONTENT }),
            B: baseFacade({ openings: 5, endPierWidth: BASE_PIER_END_FLANK, contentFor: FLANK_MID_CONTENT })
        },
        floor_mb_base_high: {
            A: baseFacade({ openings: 6, endPierWidth: BASE_PIER_END_FRONT, contentFor: HIGH_CONTENT }),
            B: baseFacade({ openings: 5, endPierWidth: BASE_PIER_END_FLANK, contentFor: HIGH_CONTENT })
        },
        floor_mb_curtain_sill: {
            A: CURTAIN_SILL_FACADE
        },
        floor_mb_curtain: {
            A: CURTAIN_FACADE
        }
    }),
    windowDefinitions: Object.freeze({
        items: [
            curtainPaneDef({
                id: 'window_mb_curtain',
                name: 'Bronze Curtain Wall Pane',
                panelHeight: CURTAIN_PANEL_HEIGHT
            }),
            curtainPaneDef({
                id: 'window_mb_curtain_sill',
                name: 'Bronze Curtain Wall Pane (sill course)',
                panelHeight: 0
            }),
            baseScreen({ id: 'window_mb_base_low', name: 'Bank Base Screen (low)', height: BASE_LOW_HEIGHT, rows: 1 }),
            baseScreen({ id: 'window_mb_base_low_lit', name: 'Bank Base Screen (low, lit)', height: BASE_LOW_HEIGHT, rows: 1, lit: true }),
            baseScreen({ id: 'window_mb_base_mid', name: 'Bank Base Screen (mid)', height: BASE_MID_HEIGHT, rows: 1 }),
            baseScreen({ id: 'window_mb_base_mid_lit', name: 'Bank Base Screen (mid, lit)', height: BASE_MID_HEIGHT, rows: 1, lit: true }),
            baseScreen({ id: 'window_mb_base_high', name: 'Bank Base Screen (high)', height: BASE_HIGH_OPENING_HEIGHT, rows: 2 }),
            {
                // The entry: a monumental double door with a sidelight either
                // side, filling the first opening up to its transom line. Two
                // muntin columns per leaf give the reference's four panes.
                id: 'door_mb_entry',
                assetType: 'door',
                name: 'Bank Entry Door',
                settings: {
                    version: 1,
                    width: BASE_OPENING_WIDTH,
                    height: BASE_LOW_HEIGHT,
                    arch: NO_ARCH,
                    frame: {
                        width: 0.11,
                        verticalWidth: 0.11,
                        horizontalWidth: 0.1,
                        depth: 0.14,
                        inset: 0.17,
                        openBottom: true,
                        addHandles: true,
                        handleStyle: 'c_pull',
                        handleMaterialMode: 'metal',
                        handleColorHex: 0x8c857a,
                        doorStyle: 'double',
                        doorKickPanel: { enabled: false, heightMeters: 0.3 },
                        doorBottomFrame: { enabled: true, mode: 'match', heightMeters: 0.16 },
                        doorCenterFrame: { leftMode: 'match', rightMode: 'match' },
                        colorHex: 0x241f1a,
                        bevel: { size: 0.04, roundness: 0.4 },
                        material: BRONZE_FRAME_PBR
                    },
                    muntins: {
                        enabled: true,
                        columns: 2,
                        rows: 1,
                        verticalWidth: 0.09,
                        horizontalWidth: 0.08,
                        depth: 0.08,
                        inset: 0.012,
                        uvOffset: { x: 0, y: 0 },
                        colorHex: 0x241f1a,
                        bevel: { inherit: true, bevel: { size: 0.04, roundness: 0.4 } },
                        material: { inheritFromFrame: true, pbr: BRONZE_FRAME_PBR }
                    },
                    glass: BASE_GLASS,
                    shade: { enabled: false },
                    interior: { enabled: true, parallaxInteriorPresetId: 'parallax_interior.office' }
                },
                decoration: { sill: { enabled: false }, header: { enabled: false }, jambs: { enabled: false } },
                layers: { frame: true, muntins: true, glass: true, shade: false, interior: true }
            }
        ]
    })
});

export default MODERN_BANK_BUILDING_CONFIG;
