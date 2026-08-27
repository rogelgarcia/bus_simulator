// src/graphics/content3d/buildings/configs/LWarehouse.js
// City building config: L Warehouse (AI 512 N-face showcase).
// An L-shaped brick loft: six first-class faces (A front, B right, C
// back-right, D notch-side, E notch-back, F left). Every face carries bays
// and windows — including the two courtyard faces the quad model could not
// address — plus a belt, a bracketed cornice, per-face material override on
// the notch faces, face linking (C follows B), and a fire escape attachment
// targeting the non-A–D face E.
const MATVAR = (seedOffset) => Object.freeze({
    enabled: true,
    seedOffset,
    root: 'wall',
    space: 'world',
    worldSpaceScale: 0.16,
    globalIntensity: 1,
    aoAmount: 0.55,
    macroLayers: [
        { enabled: true, intensity: 0.7, value: 0.24, scale: 6.8 },
        { enabled: false },
        { enabled: true, value: -0.18, intensity: 0.5, scale: 1.4, coverage: 0.4 },
        { enabled: false }
    ],
    wearTop: { enabled: true, value: -0.3, intensity: 0.35 },
    wearBottom: { enabled: true, intensity: 0.08 }
});

const WAREHOUSE_WINDOW = (widthMeters, repeatCount) => Object.freeze({
    enabled: true,
    defId: 'window_white_sash_2x2',
    assetType: 'window',
    size: { widthMeters, heightMeters: 2.0 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.75,
    width: { minMeters: widthMeters, maxMeters: null },
    padding: { leftMeters: 0.25, rightMeters: 0.25 },
    repeat: { count: repeatCount },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: false, interior: 'res' },
    top: { enabled: false, assetType: 'window', heightMode: 'fixed', heightMeters: 2.0, verticalGapMeters: 0.1, frameWidthMeters: null },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const ENTRY_DOOR = Object.freeze({
    enabled: true,
    defId: 'door_wood_arch',
    assetType: 'door',
    size: { widthMeters: 1.8, heightMeters: 3.0 },
    heightMode: 'fixed',
    verticalOffsetMeters: null,
    width: { minMeters: 1.8, maxMeters: null },
    padding: { leftMeters: 0.3, rightMeters: 0.3 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: false, topEnabled: true },
    visual: { disableShades: true, interior: 'none' },
    top: { enabled: false, assetType: 'door', heightMode: 'fixed', heightMeters: 2.0, verticalGapMeters: 0.1, frameWidthMeters: null },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const pier = (id, widthMeters) => ({
    id,
    size: { mode: 'fixed', widthMeters },
    expandPreference: 'no_repeat',
    wallMaterialOverride: null
});

const windowBay = (id, window, { minMeters = 2.4 } = {}) => ({
    id,
    size: { mode: 'range', minMeters, maxMeters: null },
    expandPreference: 'prefer_expand',
    repeatable: true,
    wallMaterialOverride: null,
    window
});

const faceLayout = (prefix, window, { withDoor = false } = {}) => ({
    layout: {
        bays: {
            items: withDoor
                ? [
                    pier(`${prefix}_p1`, 0.9),
                    windowBay(`${prefix}_w2`, window),
                    { ...pier(`${prefix}_d3`, 3.0), window: ENTRY_DOOR },
                    windowBay(`${prefix}_w4`, window),
                    pier(`${prefix}_p5`, 0.9)
                ]
                : [
                    pier(`${prefix}_p1`, 0.9),
                    windowBay(`${prefix}_w2`, window),
                    pier(`${prefix}_p3`, 0.9)
                ],
            nextBayIndex: 6
        },
        groups: { items: [], nextGroupIndex: 1 }
    }
});

export const L_WAREHOUSE_BUILDING_CONFIG = Object.freeze({
    id: 'l_warehouse',
    name: 'L Warehouse',
    floors: 4,
    floorHeight: 3.2,
    style: 'default',
    // The L: a 30x24 block with a 16x10 bite at the back-left. Six exterior
    // runs, two of them (D notch-side, E notch-back) impossible under the
    // quad model.
    footprintLoops: Object.freeze([
        [
            { x: -15, z: 12 },
            { x: 15, z: 12 },
            { x: 15, z: -12 },
            { x: 1, z: -12 },
            { x: 1, z: -2 },
            { x: -15, z: -2 }
        ]
    ]),
    layers: Object.freeze([
        {
            id: 'floor_lw1',
            type: 'floor',
            floors: 1,
            floorHeight: 4.2,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'texture', id: 'pbr.red_brick' },
            materialVariation: MATVAR(3),
            belt: { enabled: false },
            windows: { enabled: false },
            cornice: {
                enabled: true,
                profile: 'flat_band',
                height: 0.35,
                projection: 0.12,
                material: { kind: 'texture', id: 'pbr.limestone_smooth' }
            }
        },
        {
            id: 'floor_lw2',
            type: 'floor',
            floors: 3,
            floorHeight: 3.2,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'texture', id: 'pbr.red_brick' },
            materialVariation: MATVAR(11),
            belt: { enabled: false },
            windows: { enabled: false },
            // The courtyard faces read as painted masonry: per-face override.
            faceMaterials: {
                D: { material: { kind: 'texture', id: 'pbr.painted_brick' } },
                E: { material: { kind: 'texture', id: 'pbr.painted_brick' } }
            },
            // The back-right face reuses the right face's layout.
            faceLinking: { links: { C: 'B' } }
        },
        {
            id: 'roof_lw3',
            type: 'roof',
            ring: { enabled: true, innerRadius: 0.25, outerRadius: 0.14, height: 0.5, material: { kind: 'texture', id: 'pbr.red_brick' } },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.5,
                projection: 0.35,
                material: { kind: 'texture', id: 'pbr.limestone_smooth' },
                ornament: { type: 'brackets', width: 0.12, depth: 0.14, spacing: 0.4, height: 0.2, material: { kind: 'texture', id: 'pbr.limestone_smooth' } }
            }
        }
    ]),
    facades: Object.freeze({
        floor_lw1: {
            A: faceLayout('lw1a', WAREHOUSE_WINDOW(1.6, 3), { withDoor: true }),
            B: faceLayout('lw1b', WAREHOUSE_WINDOW(1.6, 3)),
            C: faceLayout('lw1c', WAREHOUSE_WINDOW(1.6, 2)),
            D: faceLayout('lw1d', WAREHOUSE_WINDOW(1.4, 2)),
            E: faceLayout('lw1e', WAREHOUSE_WINDOW(1.6, 3)),
            F: faceLayout('lw1f', WAREHOUSE_WINDOW(1.6, 2))
        },
        floor_lw2: {
            A: faceLayout('lw2a', WAREHOUSE_WINDOW(1.6, 4)),
            B: faceLayout('lw2b', WAREHOUSE_WINDOW(1.6, 4)),
            D: faceLayout('lw2d', WAREHOUSE_WINDOW(1.4, 2)),
            E: faceLayout('lw2e', WAREHOUSE_WINDOW(1.6, 3)),
            F: faceLayout('lw2f', WAREHOUSE_WINDOW(1.6, 2))
        }
    }),
    attachments: Object.freeze({
        items: [
            {
                id: 'attachment_1',
                type: 'fire_escape',
                target: { layerId: 'floor_lw2', faceId: 'E', bayId: 'lw2e_w2' }
            }
        ]
    })
});
