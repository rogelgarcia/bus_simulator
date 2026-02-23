// src/app/buildings/window_mesh/WindowFabricationCatalog.js
// Catalog entries for window, door, and garage fabrication workflows.
// @ts-check

import { WINDOW_SHADE_COVERAGE } from './WindowMeshSettings.js';

export const WINDOW_FABRICATION_ASSET_TYPE = Object.freeze({
    WINDOW: 'window',
    DOOR: 'door',
    GARAGE: 'garage'
});

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeAssetType(value, fallback = WINDOW_FABRICATION_ASSET_TYPE.WINDOW) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return WINDOW_FABRICATION_ASSET_TYPE.GARAGE;
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.DOOR) return WINDOW_FABRICATION_ASSET_TYPE.DOOR;
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.WINDOW) return WINDOW_FABRICATION_ASSET_TYPE.WINDOW;
    return fallback;
}

function normalizeCatalogName(value, fallback = 'Catalog Entry') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    return raw.replace(/\s+/g, ' ').slice(0, 96);
}

function normalizeCatalogNameKey(value) {
    return normalizeCatalogName(value, '').toLowerCase();
}

const WINDOW_DOOR_FABRICATION_CATALOG = Object.freeze([
    Object.freeze({
        // Embedded from downloads/window_fabrication_window_window_clear_modern.json
        id: 'window_black_6_panels_tall',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'Black 6 Panels Tall',
        settings: {
            version: 1,
            width: 2,
            height: 1.7,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.085,
                depth: 0.085,
                inset: 0.094,
                openBottom: false,
                colorHex: 4539717,
                bevel: {
                    size: 0.29,
                    roundness: 0.72
                },
                material: {
                    roughness: 0.51,
                    metalness: 0.58,
                    envMapIntensity: 0.05,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 3,
                rows: 2,
                verticalWidth: 0.069,
                horizontalWidth: 0.069,
                depth: 0.06,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 4539717,
                bevel: {
                    inherit: true,
                    bevel: {
                        size: 0.3,
                        roundness: 0.65
                    }
                },
                material: {
                    inheritFromFrame: true,
                    pbr: {
                        roughness: 0.51,
                        metalness: 0.58,
                        envMapIntensity: 0.05,
                        normalStrength: 0.6
                    }
                }
            },
            glass: {
                opacity: 0.85,
                tintHex: 1842209,
                reflection: {
                    metalness: 0,
                    roughness: 0.02,
                    transmission: 0,
                    ior: 1.5,
                    envMapIntensity: 2.5
                },
                zOffset: -0.088
            },
            shade: {
                enabled: true,
                coverage: WINDOW_SHADE_COVERAGE.PCT_20,
                randomizeCoverage: true,
                direction: 'top_to_bottom',
                colorHex: 15987178,
                fabric: {
                    scale: 7,
                    intensity: 0.18
                },
                zOffset: -0.06
            },
            interior: {
                enabled: true,
                parallaxInteriorPresetId: null,
                atlasId: 'window_interior_atlas.residential_4x4',
                atlas: {
                    cols: 4,
                    rows: 4
                },
                randomizeCell: true,
                cell: {
                    col: 0,
                    row: 0
                },
                randomFlipX: true,
                uvPan: {
                    x: 0,
                    y: 0
                },
                uvZoom: 1,
                imageAspect: 1,
                parallaxDepthMeters: 3,
                parallaxScale: {
                    x: 1,
                    y: 1
                },
                zOffset: 0,
                emissiveIntensity: 0,
                tintVariation: {
                    hueShiftDeg: {
                        min: -8,
                        max: 8
                    },
                    saturationMul: {
                        min: 0.92,
                        max: 1.08
                    },
                    brightnessMul: {
                        min: 0.9,
                        max: 1.12
                    }
                }
            }
        },
        decoration: null,
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: true,
            interior: true
        },
        wall: {
            materialId: 'pbr.brick_wall_11',
            roughness: 0.85,
            normalIntensity: 1,
            cutWidthLerp: 0,
            cutHeightLerp: 0
        },
        ibl: {
            enabled: true,
            envMapIntensity: 0.25,
            iblId: 'ibl.hdri.german_town_street_2k',
            setBackground: true
        },
        seed: 'window-debug',
        thumbnail: {
            dataUrl: null,
            wallMaterialId: 'pbr.brick_wall_11'
        }
    })
]);

function toCatalogResult(entry) {
    const name = normalizeCatalogName(entry?.name ?? entry?.label ?? entry?.id, 'Catalog Entry');
    return {
        id: String(entry?.id ?? ''),
        assetType: normalizeAssetType(entry?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW),
        name,
        label: name,
        settings: deepClone(entry?.settings ?? {}),
        decoration: deepClone(entry?.decoration ?? null),
        garageFacade: deepClone(entry?.garageFacade ?? null),
        layers: deepClone(entry?.layers ?? null),
        wall: deepClone(entry?.wall ?? null),
        ibl: deepClone(entry?.ibl ?? null),
        seed: typeof entry?.seed === 'string' ? entry.seed : null,
        thumbnail: deepClone(entry?.thumbnail ?? null)
    };
}

export function normalizeWindowFabricationAssetType(value, fallback = WINDOW_FABRICATION_ASSET_TYPE.WINDOW) {
    return normalizeAssetType(value, fallback);
}

export function normalizeWindowFabricationCatalogName(value, fallback = 'Catalog Entry') {
    return normalizeCatalogName(value, fallback);
}

export function getWindowFabricationAssetTypeOptions() {
    return Object.freeze([
        Object.freeze({ id: WINDOW_FABRICATION_ASSET_TYPE.WINDOW, label: 'Window' }),
        Object.freeze({ id: WINDOW_FABRICATION_ASSET_TYPE.DOOR, label: 'Door' }),
        Object.freeze({ id: WINDOW_FABRICATION_ASSET_TYPE.GARAGE, label: 'Garage' })
    ]);
}

export function getWindowFabricationCatalogEntries({ assetType = null } = {}) {
    const desired = assetType ? normalizeAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW) : null;
    const list = desired
        ? WINDOW_DOOR_FABRICATION_CATALOG.filter((entry) => entry.assetType === desired)
        : WINDOW_DOOR_FABRICATION_CATALOG.slice();
    return list.map((entry) => toCatalogResult(entry));
}

export function getWindowFabricationCatalogEntryById(catalogId) {
    const id = typeof catalogId === 'string' ? catalogId.trim() : '';
    if (!id) return null;
    const entry = WINDOW_DOOR_FABRICATION_CATALOG.find((item) => item.id === id) ?? null;
    return entry ? toCatalogResult(entry) : null;
}

export function getWindowFabricationCatalogEntryByName(catalogName, { assetType = null } = {}) {
    const targetKey = normalizeCatalogNameKey(catalogName);
    if (!targetKey) return null;

    const desired = assetType ? normalizeAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW) : null;
    const list = desired
        ? WINDOW_DOOR_FABRICATION_CATALOG.filter((entry) => entry.assetType === desired)
        : WINDOW_DOOR_FABRICATION_CATALOG;

    const found = list.find((entry) => normalizeCatalogNameKey(entry.name ?? entry.label ?? '') === targetKey) ?? null;
    return found ? toCatalogResult(found) : null;
}

export function getDefaultWindowFabricationCatalogEntry(assetType = WINDOW_FABRICATION_ASSET_TYPE.WINDOW) {
    const desired = normalizeAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    const found = WINDOW_DOOR_FABRICATION_CATALOG.find((entry) => entry.assetType === desired) ?? null;
    return found ? toCatalogResult(found) : null;
}

export function getDefaultWindowFabricationCatalogId(assetType = WINDOW_FABRICATION_ASSET_TYPE.WINDOW) {
    const entry = getDefaultWindowFabricationCatalogEntry(assetType);
    return entry?.id ?? '';
}
