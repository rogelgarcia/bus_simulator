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

const CATALOG_WINDOW_SHADE_COLOR_HEX = 0x565851;

function normalizeCatalogEntrySettings(entry) {
    const settings = deepClone(entry?.settings ?? {});
    const assetType = normalizeAssetType(entry?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    if (assetType !== WINDOW_FABRICATION_ASSET_TYPE.WINDOW) return settings;

    const shade = settings.shade && typeof settings.shade === 'object' ? settings.shade : {};
    settings.shade = {
        ...shade,
        colorHex: CATALOG_WINDOW_SHADE_COLOR_HEX
    };

    const interiorEnabled = settings?.interior && typeof settings.interior === 'object'
        ? settings.interior.enabled !== false
        : true;
    settings.interior = { enabled: interiorEnabled };
    return settings;
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
                colorHex: 0x565851,
                fabric: {
                    scale: 7,
                    intensity: 0.18
                },
                zOffset: -0.06
            },
            interior: {
                enabled: true
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
    }),
    Object.freeze({
        // Embedded from downloads/window_fabrication_window_street_store_black_window.json
        id: 'window_street_black',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'Street Store Black Window',
        settings: {
            version: 1,
            width: 1.7,
            height: 2.5,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.04,
                verticalWidth: 0.04,
                horizontalWidth: 0.04,
                depth: 0.12,
                inset: 0,
                openBottom: true,
                addHandles: false,
                handleMaterialMode: 'match',
                doorStyle: 'single',
                doorBottomFrame: {
                    enabled: true,
                    mode: 'match'
                },
                doorCenterFrame: {
                    leftMode: 'match',
                    rightMode: 'match'
                },
                colorHex: 3487286,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.54,
                    metalness: 0.07,
                    envMapIntensity: 0.33,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows: 2,
                verticalWidth: 0.03,
                horizontalWidth: 0.03,
                depth: 0.06,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 2
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
                zOffset: -0.02
            },
            shade: {
                enabled: false,
                coverage: WINDOW_SHADE_COVERAGE.PCT_20,
                randomizeCoverage: true,
                direction: 'top_to_bottom',
                colorHex: 0x565851,
                fabric: {
                    scale: 7,
                    intensity: 0.18
                },
                zOffset: -0.06
            },
            interior: {
                enabled: false
            }
        },
        garageFacade: {
            state: 'closed',
            closedMaterialId: 'pbr.corrugated_iron_02',
            rotationDegrees: 0
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
            cutHeightLerp: 0,
            floorDistanceMeters: 0
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
    }),
    Object.freeze({
        // Embedded from downloads/window_fabrication_window_street_store_black_window_with_cover.json
        id: 'window_street_black_with_cover',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'Street Store Black Window with Cover',
        settings: {
            version: 1,
            width: 1.7,
            height: 2.5,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.04,
                verticalWidth: 0.04,
                horizontalWidth: 0.04,
                depth: 0.12,
                inset: 0,
                openBottom: true,
                addHandles: false,
                handleMaterialMode: 'match',
                doorStyle: 'single',
                doorBottomFrame: {
                    enabled: true,
                    mode: 'match'
                },
                doorCenterFrame: {
                    leftMode: 'match',
                    rightMode: 'match'
                },
                colorHex: 3487286,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.54,
                    metalness: 0.07,
                    envMapIntensity: 0.33,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows: 2,
                verticalWidth: 0.03,
                horizontalWidth: 0.03,
                depth: 0.06,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 2
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
                zOffset: -0.02
            },
            shade: {
                enabled: false,
                coverage: WINDOW_SHADE_COVERAGE.PCT_20,
                randomizeCoverage: true,
                direction: 'top_to_bottom',
                colorHex: 0x565851,
                fabric: {
                    scale: 7,
                    intensity: 0.18
                },
                zOffset: -0.06
            },
            interior: {
                enabled: false
            }
        },
        garageFacade: {
            state: 'closed',
            closedMaterialId: 'pbr.corrugated_iron_02',
            rotationDegrees: 0
        },
        decoration: {
            sill: {
                enabled: true,
                type: 'bottom_cover',
                widthMode: 'match_window',
                depthMeters: 0.08,
                material: {
                    mode: 'match_frame'
                }
            }
        },
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
            cutHeightLerp: 0,
            floorDistanceMeters: 0
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
    }),
    Object.freeze({
        id: 'door_black_single_modern',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.DOOR,
        name: 'Black Single Door Modern',
        settings: {
            version: 1,
            width: 1.1,
            height: 2.3,
            arch: {
                enabled: false
            },
            frame: {
                width: 0.085,
                depth: 0.09,
                inset: 0.094,
                openBottom: true,
                doorStyle: 'single',
                addHandles: true,
                colorHex: 4539717,
                material: {
                    roughness: 0.51,
                    metalness: 0.58,
                    envMapIntensity: 0.05,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: false,
                columns: 1,
                rows: 1
            },
            glass: {
                opacity: 0.5,
                tintHex: 0x7b7986,
                reflection: {
                    metalness: 0.5,
                    roughness: 0.1,
                    transmission: 0,
                    ior: 2.0,
                    envMapIntensity: 1.35
                },
                zOffset: -0.088
            },
            shade: {
                enabled: false
            },
            interior: {
                enabled: false
            }
        },
        decoration: null,
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
            interior: false
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
        seed: 'door-debug',
        thumbnail: {
            dataUrl: null,
            wallMaterialId: 'pbr.brick_wall_11'
        }
    }),
    Object.freeze({
        // Embedded from downloads/window_fabrication_door_street_store_black_door.json
        id: 'door_black_tall',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.DOOR,
        name: 'Street Store Black Door',
        settings: {
            version: 1,
            width: 2,
            height: 2.7,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.04,
                verticalWidth: 0.04,
                horizontalWidth: 0.04,
                depth: 0.12,
                inset: 0,
                openBottom: true,
                addHandles: true,
                handleMaterialMode: 'match',
                doorStyle: 'double',
                doorBottomFrame: {
                    enabled: true,
                    mode: 'match'
                },
                doorCenterFrame: {
                    leftMode: 'match',
                    rightMode: 'match'
                },
                colorHex: 3487286,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.54,
                    metalness: 0.07,
                    envMapIntensity: 0.33,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: false,
                columns: 2,
                rows: 2,
                verticalWidth: 0.03,
                horizontalWidth: 0.03,
                depth: 0.06,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: null,
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
                        roughness: 0.72,
                        metalness: 0,
                        envMapIntensity: 0,
                        normalStrength: 0.55
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
                zOffset: -0.04
            },
            shade: {
                enabled: false,
                coverage: 0,
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
                enabled: false,
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
                uvZoom: 1.6,
                imageAspect: 1,
                parallaxDepthMeters: 0,
                parallaxScale: {
                    x: 0,
                    y: 0
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
        garageFacade: {
            state: 'closed',
            closedMaterialId: 'pbr.corrugated_iron_02',
            rotationDegrees: 0
        },
        decoration: null,
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
            interior: false
        },
        wall: {
            materialId: 'pbr.brick_wall_11',
            roughness: 0.85,
            normalIntensity: 1,
            cutWidthLerp: 0,
            cutHeightLerp: 0,
            floorDistanceMeters: 0
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
    }),
    Object.freeze({
        id: 'garage_black_panel_wide',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.GARAGE,
        name: 'Black Garage Panel Wide',
        settings: {
            version: 1,
            width: 2.8,
            height: 2.2,
            arch: {
                enabled: false
            },
            frame: {
                width: 0.09,
                depth: 0.09,
                inset: 0.09,
                openBottom: true,
                doorStyle: 'single',
                addHandles: false,
                colorHex: 4539717,
                material: {
                    roughness: 0.51,
                    metalness: 0.58,
                    envMapIntensity: 0.05,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: false,
                columns: 1,
                rows: 1
            },
            glass: {
                opacity: 0.25,
                tintHex: 0xa0a0a0,
                reflection: {
                    metalness: 0.5,
                    roughness: 0.1,
                    transmission: 0,
                    ior: 2.0,
                    envMapIntensity: 1.35
                },
                zOffset: -0.088
            },
            shade: {
                enabled: false
            },
            interior: {
                enabled: false
            }
        },
        garageFacade: {
            state: 'closed',
            closedMaterialId: 'pbr.concrete_layers_02',
            rotationDegrees: 90
        },
        decoration: null,
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
            interior: false
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
        seed: 'garage-debug',
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
        settings: normalizeCatalogEntrySettings(entry),
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
