// src/graphics/content3d/buildings/configs/HexPavilion.js
// City building config: Hex Pavilion (AI 512 N-face showcase).
// A regular hexagonal limestone pavilion: six 14m faces (A front, then B..F
// clockwise), every corner a 120° meeting resolved by the arbitrary-angle
// mitre. All six faces carry bays and windows; the back face D links to the
// front A; the ground floor runs a flat band cornice and the roof a crown
// with dentils.
const MATVAR = (seedOffset) => Object.freeze({
    enabled: true,
    seedOffset,
    root: 'wall',
    space: 'world',
    worldSpaceScale: 0.15,
    globalIntensity: 1,
    aoAmount: 0.5,
    macroLayers: [
        { enabled: true, intensity: 0.6, value: 0.2, scale: 6.2 },
        { enabled: false },
        { enabled: true, value: -0.15, intensity: 0.45, scale: 1.6, coverage: 0.35 },
        { enabled: false }
    ],
    wearTop: { enabled: true, value: -0.25, intensity: 0.3 },
    wearBottom: { enabled: true, intensity: 0.1 }
});

const PAVILION_WINDOW = (widthMeters, repeatCount) => Object.freeze({
    enabled: true,
    defId: 'window_white_sash_2x2',
    assetType: 'window',
    size: { widthMeters, heightMeters: 2.1 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.7,
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

const windowBay = (id, window, { minMeters = 2.2 } = {}) => ({
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
                    pier(`${prefix}_p1`, 0.8),
                    windowBay(`${prefix}_w2`, window),
                    { ...pier(`${prefix}_d3`, 3.0), window: ENTRY_DOOR },
                    windowBay(`${prefix}_w4`, window),
                    pier(`${prefix}_p5`, 0.8)
                ]
                : [
                    pier(`${prefix}_p1`, 0.8),
                    windowBay(`${prefix}_w2`, window),
                    pier(`${prefix}_p3`, 0.8)
                ],
            nextBayIndex: 6
        },
        groups: { items: [], nextGroupIndex: 1 }
    }
});

// Regular hexagon, edge 14m, flat front toward +z (face A).
const HEX = 14;
const HEX_H = 12.124355652982141; // HEX * sin(60°)

export const HEX_PAVILION_BUILDING_CONFIG = Object.freeze({
    id: 'hex_pavilion',
    name: 'Hex Pavilion',
    floors: 3,
    floorHeight: 3.1,
    style: 'default',
    footprintLoops: Object.freeze([
        [
            { x: -HEX / 2, z: HEX_H },
            { x: HEX / 2, z: HEX_H },
            { x: HEX, z: 0 },
            { x: HEX / 2, z: -HEX_H },
            { x: -HEX / 2, z: -HEX_H },
            { x: -HEX, z: 0 }
        ]
    ]),
    layers: Object.freeze([
        {
            id: 'floor_hp1',
            type: 'floor',
            floors: 1,
            floorHeight: 4.0,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'texture', id: 'pbr.limestone_smooth' },
            materialVariation: MATVAR(5),
            belt: { enabled: false },
            windows: { enabled: false },
            cornice: {
                enabled: true,
                profile: 'flat_band',
                height: 0.32,
                projection: 0.1,
                material: { kind: 'texture', id: 'pbr.limestone_smooth' }
            }
        },
        {
            id: 'floor_hp2',
            type: 'floor',
            floors: 2,
            floorHeight: 3.1,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'texture', id: 'pbr.limestone_smooth' },
            materialVariation: MATVAR(13),
            belt: { enabled: false },
            windows: { enabled: false },
            // The back face reuses the front layout.
            faceLinking: { links: { D: 'A' } }
        },
        {
            id: 'roof_hp3',
            type: 'roof',
            ring: { enabled: true, innerRadius: 0.25, outerRadius: 0.14, height: 0.5, material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
            cornice: {
                enabled: true,
                profile: 'crown_molding',
                height: 0.5,
                projection: 0.32,
                material: { kind: 'texture', id: 'pbr.limestone_smooth' },
                ornament: { type: 'dentils', width: 0.14, depth: 0.12, spacing: 0.22, height: 0.18, material: { kind: 'texture', id: 'pbr.limestone_smooth' } }
            }
        }
    ]),
    facades: Object.freeze({
        floor_hp1: {
            A: faceLayout('hp1a', PAVILION_WINDOW(1.6, 2), { withDoor: true }),
            B: faceLayout('hp1b', PAVILION_WINDOW(1.6, 3)),
            C: faceLayout('hp1c', PAVILION_WINDOW(1.6, 3)),
            D: faceLayout('hp1d', PAVILION_WINDOW(1.6, 3)),
            E: faceLayout('hp1e', PAVILION_WINDOW(1.6, 3)),
            F: faceLayout('hp1f', PAVILION_WINDOW(1.6, 3))
        },
        floor_hp2: {
            A: faceLayout('hp2a', PAVILION_WINDOW(1.6, 3)),
            B: faceLayout('hp2b', PAVILION_WINDOW(1.6, 3)),
            C: faceLayout('hp2c', PAVILION_WINDOW(1.6, 3)),
            E: faceLayout('hp2e', PAVILION_WINDOW(1.6, 3)),
            F: faceLayout('hp2f', PAVILION_WINDOW(1.6, 3))
        }
    })
});
