// src/app/buildings/window_mesh/WindowFabricationCatalog.js
// Catalog entries for window, door, and garage fabrication workflows.
// @ts-check

import { WINDOW_SHADE_COVERAGE } from './WindowMeshSettings.js';

export const WINDOW_FABRICATION_ASSET_TYPE = Object.freeze({
    WINDOW: 'window',
    DOOR: 'door',
    GARAGE: 'garage',
    STOREFRONT: 'storefront'
});

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeAssetType(value, fallback = WINDOW_FABRICATION_ASSET_TYPE.WINDOW) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return WINDOW_FABRICATION_ASSET_TYPE.GARAGE;
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.DOOR) return WINDOW_FABRICATION_ASSET_TYPE.DOOR;
    if (raw === WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT) return WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT;
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

// AI 488: storefront assets stack four zones inside one opening, bottom to top:
// bulkhead (solid base) -> display glazing (the window settings themselves) ->
// transom band -> sign fascia. ONE feature with per-zone options, not sibling
// features per zone. Glazing takes whatever height the fixed zones leave over.
export const STOREFRONT_TRANSOM_MODE = Object.freeze({
    GLAZED: 'glazed',
    BACKLIT: 'backlit',
    NONE: 'none'
});

const STOREFRONT_ZONE_MATERIAL_MODES = Object.freeze(['match_wall', 'match_frame', 'pbr', 'slot']);

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeStorefrontTransomMode(value, fallback = STOREFRONT_TRANSOM_MODE.GLAZED) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === STOREFRONT_TRANSOM_MODE.GLAZED) return STOREFRONT_TRANSOM_MODE.GLAZED;
    if (raw === STOREFRONT_TRANSOM_MODE.BACKLIT) return STOREFRONT_TRANSOM_MODE.BACKLIT;
    if (raw === STOREFRONT_TRANSOM_MODE.NONE || raw === 'off' || raw === 'disabled') return STOREFRONT_TRANSOM_MODE.NONE;
    return fallback;
}

function normalizeStorefrontZoneMaterial(value, fallbackMode = 'match_frame') {
    const src = value && typeof value === 'object' ? value : {};
    const modeRaw = typeof src.mode === 'string' ? src.mode.trim().toLowerCase() : '';
    const mode = STOREFRONT_ZONE_MATERIAL_MODES.includes(modeRaw) ? modeRaw : fallbackMode;
    const out = { mode };
    if (mode === 'pbr') {
        const materialId = typeof src.materialId === 'string' ? src.materialId.trim() : '';
        if (materialId) out.materialId = materialId;
        else out.mode = fallbackMode;
    } else if (mode === 'slot') {
        const slotId = typeof src.slotId === 'string' ? src.slotId.trim() : '';
        if (slotId) out.slotId = slotId;
        else out.mode = fallbackMode;
    }
    return out;
}

function normalizeHexColorValue(value, fallback) {
    const num = Number(value);
    if (Number.isFinite(num)) return (num >>> 0) & 0xffffff;
    return fallback;
}

export function normalizeStorefrontConfig(value) {
    const src = value && typeof value === 'object' ? value : {};

    const bulkheadSrc = src.bulkhead && typeof src.bulkhead === 'object' ? src.bulkhead : {};
    const transomSrc = src.transom && typeof src.transom === 'object' ? src.transom : {};
    const fasciaSrc = src.fascia && typeof src.fascia === 'object' ? src.fascia : {};

    return {
        bulkhead: {
            enabled: bulkheadSrc.enabled !== false,
            heightMeters: clampNumber(bulkheadSrc.heightMeters, 0.0, 2.0, 0.55),
            projectionMeters: clampNumber(bulkheadSrc.projectionMeters, 0.0, 0.4, 0.04),
            material: normalizeStorefrontZoneMaterial(bulkheadSrc.material, 'match_frame')
        },
        transom: {
            mode: normalizeStorefrontTransomMode(transomSrc.mode),
            heightMeters: clampNumber(transomSrc.heightMeters, 0.0, 2.0, 0.45),
            columns: Math.max(1, Math.min(12, Math.round(Number(transomSrc.columns) || 4))),
            emissiveColorHex: normalizeHexColorValue(transomSrc.emissiveColorHex, 0xfff3e0),
            emissiveIntensity: clampNumber(transomSrc.emissiveIntensity, 0.0, 5.0, 1.2)
        },
        fascia: {
            enabled: fasciaSrc.enabled !== false,
            heightMeters: clampNumber(fasciaSrc.heightMeters, 0.0, 2.0, 0.5),
            projectionMeters: clampNumber(fasciaSrc.projectionMeters, 0.0, 0.4, 0.03),
            material: normalizeStorefrontZoneMaterial(fasciaSrc.material, 'match_frame')
        },
        minGlazingHeightMeters: clampNumber(src.minGlazingHeightMeters, 0.3, 3.0, 0.6)
    };
}

// AI 488: entrance portal options on door assets. The surround itself reuses
// the AI 482 decoration machinery (header arched_band / flat_band + jambs) at
// larger scale; this block adds what surrounds cannot express: a recessed
// entry (extra frame inset with wall reveal) and an entry steps block that
// raises the door threshold and climbs from grade in front of the opening.
export function normalizePortalConfig(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.enabled === false) return null;

    const stepsSrc = value.steps && typeof value.steps === 'object' ? value.steps : {};
    // AI 509: recess reveal material, colonettes, frieze panel — all in the
    // storefront-zone material dialect (match_wall | match_frame | pbr | slot).
    const recessMaterialSrc = value.recessMaterial ?? (value.recess && typeof value.recess === 'object' ? value.recess.material : null);
    const colonettesSrc = value.colonettes && typeof value.colonettes === 'object' ? value.colonettes : null;
    const friezeSrc = value.frieze && typeof value.frieze === 'object' ? value.frieze : null;
    return {
        enabled: true,
        recessMeters: clampNumber(value.recessMeters, 0.0, 1.5, 0.35),
        recessMaterial: recessMaterialSrc && typeof recessMaterialSrc === 'object'
            ? normalizeStorefrontZoneMaterial(recessMaterialSrc, 'match_wall')
            : null,
        steps: {
            count: Math.max(0, Math.min(8, Math.round(Number(stepsSrc.count) || 0))),
            riseMeters: clampNumber(stepsSrc.riseMeters, 0.05, 0.3, 0.15),
            treadDepthMeters: clampNumber(stepsSrc.treadDepthMeters, 0.15, 0.6, 0.32),
            widthPaddingMeters: clampNumber(stepsSrc.widthPaddingMeters, 0.0, 1.0, 0.25),
            material: normalizeStorefrontZoneMaterial(stepsSrc.material, 'match_wall')
        },
        colonettes: (colonettesSrc && colonettesSrc.enabled === true)
            ? {
                enabled: true,
                countPerSide: Math.max(1, Math.min(2, Math.round(Number(colonettesSrc.countPerSide) || 1))),
                radiusMeters: clampNumber(colonettesSrc.radiusMeters, 0.03, 0.3, 0.09),
                gapMeters: clampNumber(colonettesSrc.gapMeters, 0.0, 0.6, 0.05),
                material: normalizeStorefrontZoneMaterial(colonettesSrc.material, 'match_wall')
            }
            : null,
        frieze: (friezeSrc && friezeSrc.enabled === true)
            ? {
                enabled: true,
                heightMeters: clampNumber(friezeSrc.heightMeters, 0.1, 1.5, 0.5),
                depthMeters: clampNumber(friezeSrc.depthMeters, 0.02, 0.5, 0.08),
                widthPaddingMeters: clampNumber(friezeSrc.widthPaddingMeters, 0.0, 1.5, 0.3),
                yOffsetMeters: clampNumber(friezeSrc.yOffsetMeters, -2.0, 3.0, 0.0),
                material: normalizeStorefrontZoneMaterial(friezeSrc.material, 'match_wall')
            }
            : null
    };
}

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
        id: 'window_white_sash_2x2',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'White Sash 2 over 2',
        settings: {
            version: 1,
            width: 1.5,
            height: 1.8,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.075,
                depth: 0.09,
                inset: 0.06,
                openBottom: false,
                colorHex: 0xe8e3d5,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.6,
                    metalness: 0,
                    envMapIntensity: 0.15,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows: 2,
                verticalWidth: 0.045,
                horizontalWidth: 0.06,
                depth: 0.05,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 0xe8e3d5,
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
                        roughness: 0.6,
                        metalness: 0,
                        envMapIntensity: 0.15,
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
                zOffset: -0.07
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
                zOffset: -0.05
            },
            interior: {
                enabled: true
            }
        },
        decoration: {
            sill: {
                enabled: true,
                type: 'bottom_cover',
                widthMode: 'match_window',
                depthMeters: 0.09,
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
            materialId: 'pbr.painted_plaster_wall',
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
            wallMaterialId: 'pbr.painted_plaster_wall'
        }
    }),
    Object.freeze({
        id: 'window_white_sash_2x2_stone_surround',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'White Sash 2x2 Stone Surround',
        settings: {
            version: 1,
            width: 1.5,
            height: 1.8,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.075,
                depth: 0.09,
                inset: 0.06,
                openBottom: false,
                colorHex: 0xe8e3d5,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.6,
                    metalness: 0,
                    envMapIntensity: 0.15,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows: 2,
                verticalWidth: 0.045,
                horizontalWidth: 0.06,
                depth: 0.05,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 0xe8e3d5,
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
                        roughness: 0.6,
                        metalness: 0,
                        envMapIntensity: 0.15,
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
                zOffset: -0.07
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
                zOffset: -0.05
            },
            interior: {
                enabled: true
            }
        },
        decoration: {
            sill: {
                enabled: true,
                type: 'simple',
                widthMode: 'pct_15',
                depthMeters: 0.08,
                material: {
                    mode: 'pbr',
                    materialId: 'pbr.seaworn_sandstone_brick'
                }
            },
            header: {
                enabled: true,
                type: 'splayed_lintel',
                widthMode: 'match_window',
                depthMeters: 0.08,
                earsMeters: 0.05,
                material: {
                    mode: 'pbr',
                    materialId: 'pbr.seaworn_sandstone_brick'
                }
            },
            jambs: {
                enabled: true,
                type: 'simple',
                widthMode: 'match_window',
                depthMeters: 0.02,
                runMode: 'sill_to_header',
                material: {
                    mode: 'pbr',
                    materialId: 'pbr.seaworn_sandstone_brick'
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
            materialId: 'pbr.painted_plaster_wall',
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
            wallMaterialId: 'pbr.painted_plaster_wall'
        }
    }),
    Object.freeze({
        id: 'window_arch_civic',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'Civic Arched Tall',
        settings: {
            version: 1,
            width: 1.8,
            height: 3,
            arch: {
                enabled: true,
                heightRatio: 0.18,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.08,
                depth: 0.1,
                inset: 0.05,
                openBottom: false,
                colorHex: 0xe6e0d2,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.55,
                    metalness: 0,
                    envMapIntensity: 0.18,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows: 3,
                verticalWidth: 0.05,
                horizontalWidth: 0.05,
                depth: 0.05,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 0xe6e0d2,
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
                        roughness: 0.55,
                        metalness: 0,
                        envMapIntensity: 0.18,
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
                zOffset: -0.07
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
                zOffset: -0.05
            },
            interior: {
                enabled: false
            }
        },
        decoration: {
            sill: {
                enabled: true,
                type: 'bottom_cover',
                widthMode: 'match_window',
                depthMeters: 0.1,
                material: {
                    mode: 'match_frame'
                }
            }
        },
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
            interior: false
        },
        wall: {
            materialId: 'pbr.painted_plaster_wall',
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
            wallMaterialId: 'pbr.painted_plaster_wall'
        }
    }),
    Object.freeze({
        id: 'window_white_bathroom_narrow',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW,
        name: 'White Narrow Bathroom',
        settings: {
            version: 1,
            width: 0.7,
            height: 1.1,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.07,
                depth: 0.09,
                inset: 0.06,
                openBottom: false,
                colorHex: 0xe8e3d5,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.6,
                    metalness: 0,
                    envMapIntensity: 0.15,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 1,
                rows: 2,
                verticalWidth: 0.045,
                horizontalWidth: 0.05,
                depth: 0.05,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 0xe8e3d5,
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
                        roughness: 0.6,
                        metalness: 0,
                        envMapIntensity: 0.15,
                        normalStrength: 0.6
                    }
                }
            },
            glass: {
                opacity: 0.92,
                tintHex: 0x8f959c,
                reflection: {
                    metalness: 0,
                    roughness: 0.18,
                    transmission: 0,
                    ior: 1.5,
                    envMapIntensity: 1.6
                },
                zOffset: -0.07
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
                zOffset: -0.05
            },
            interior: {
                enabled: false
            }
        },
        decoration: {
            sill: {
                enabled: true,
                type: 'bottom_cover',
                widthMode: 'match_window',
                depthMeters: 0.07,
                material: {
                    mode: 'match_frame'
                }
            }
        },
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
            interior: false
        },
        wall: {
            materialId: 'pbr.painted_plaster_wall',
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
            wallMaterialId: 'pbr.painted_plaster_wall'
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
        // AI 489: full-height glazed balcony slider — refs pair balconies with
        // floor-height glazing, so this door is mostly glass in a thin frame.
        id: 'door_balcony_glide',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.DOOR,
        name: 'Balcony Glass Slider',
        settings: {
            version: 1,
            width: 2.2,
            height: 2.5,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.05,
                verticalWidth: 0.05,
                horizontalWidth: 0.05,
                depth: 0.09,
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
                colorHex: 0x2a2d31,
                bevel: {
                    size: 0.25,
                    roundness: 0.6
                },
                material: {
                    roughness: 0.45,
                    metalness: 0.4,
                    envMapIntensity: 0.4,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: false,
                columns: 1,
                rows: 1,
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
                opacity: 0.55,
                tintHex: 0x2c3138,
                reflection: {
                    metalness: 0,
                    roughness: 0.03,
                    transmission: 0,
                    ior: 1.5,
                    envMapIntensity: 1.6
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
                enabled: true,
                parallaxInteriorPresetId: 'parallax_interior.residential',
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
        id: 'door_wood_arch',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.DOOR,
        name: 'Wood Arched Entry Door',
        settings: {
            version: 1,
            width: 1.6,
            height: 2.6,
            arch: {
                enabled: true,
                heightRatio: 0.22,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.09,
                verticalWidth: 0.09,
                horizontalWidth: 0.09,
                depth: 0.11,
                inset: 0.02,
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
                colorHex: 0x54382a,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.62,
                    metalness: 0.05,
                    envMapIntensity: 0.2,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 2,
                rows: 3,
                verticalWidth: 0.05,
                horizontalWidth: 0.05,
                depth: 0.05,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 0x54382a,
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
                        roughness: 0.62,
                        metalness: 0.05,
                        envMapIntensity: 0.2,
                        normalStrength: 0.6
                    }
                }
            },
            glass: {
                opacity: 0.7,
                tintHex: 0x20262b,
                reflection: {
                    metalness: 0,
                    roughness: 0.05,
                    transmission: 0,
                    ior: 1.5,
                    envMapIntensity: 2
                },
                zOffset: -0.06
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
            materialId: 'pbr.seaworn_sandstone_brick',
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
        seed: 'door-debug',
        thumbnail: {
            dataUrl: null,
            wallMaterialId: 'pbr.seaworn_sandstone_brick'
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
    }),
    Object.freeze({
        id: 'storefront_black_backlit',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT,
        name: 'Black Storefront Backlit Transom',
        settings: {
            version: 1,
            width: 3.2,
            height: 3.8,
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
                inset: 0,
                openBottom: false,
                addHandles: false,
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
                rows: 1,
                verticalWidth: 0.055,
                horizontalWidth: 0.045,
                depth: 0.07,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 3487286,
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
                        roughness: 0.54,
                        metalness: 0.07,
                        envMapIntensity: 0.33,
                        normalStrength: 0.6
                    }
                }
            },
            glass: {
                opacity: 0.24,
                tintHex: 0x9aa3ab,
                reflection: {
                    metalness: 0,
                    roughness: 0.03,
                    transmission: 0,
                    ior: 1.5,
                    envMapIntensity: 1.0
                },
                zOffset: -0.03
            },
            shade: {
                enabled: false,
                coverage: WINDOW_SHADE_COVERAGE.PCT_20,
                randomizeCoverage: false,
                direction: 'top_to_bottom',
                colorHex: 0x565851,
                fabric: {
                    scale: 7,
                    intensity: 0.18
                },
                zOffset: -0.06
            },
            interior: {
                enabled: true,
                parallaxInteriorPresetId: 'parallax_interior.shop'
            }
        },
        storefront: {
            bulkhead: {
                enabled: true,
                heightMeters: 0.55,
                projectionMeters: 0.04,
                material: { mode: 'match_frame' }
            },
            transom: {
                mode: 'backlit',
                heightMeters: 0.45,
                columns: 4,
                emissiveColorHex: 0xfff3e0,
                emissiveIntensity: 1.3
            },
            fascia: {
                enabled: true,
                heightMeters: 0.55,
                projectionMeters: 0.03,
                material: { mode: 'match_frame' }
            }
        },
        decoration: null,
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
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
        seed: 'storefront-debug',
        thumbnail: {
            dataUrl: null,
            wallMaterialId: 'pbr.brick_wall_11'
        }
    }),
    Object.freeze({
        id: 'storefront_bronze_glazed',
        assetType: WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT,
        name: 'Bronze Storefront Glazed Transom',
        settings: {
            version: 1,
            width: 3.2,
            height: 3.8,
            arch: {
                enabled: false,
                heightRatio: 0.25,
                meetsRectangleFrame: true,
                topPieceMode: 'frame',
                clipVerticalMuntinsToRectWhenNoTopPiece: true
            },
            frame: {
                width: 0.06,
                verticalWidth: 0.06,
                horizontalWidth: 0.06,
                depth: 0.11,
                inset: 0,
                openBottom: false,
                addHandles: false,
                colorHex: 0x4c3d27,
                bevel: {
                    size: 0.3,
                    roundness: 0.65
                },
                material: {
                    roughness: 0.42,
                    metalness: 0.55,
                    envMapIntensity: 0.4,
                    normalStrength: 0.6
                }
            },
            muntins: {
                enabled: true,
                columns: 3,
                rows: 1,
                verticalWidth: 0.05,
                horizontalWidth: 0.045,
                depth: 0.07,
                inset: 0.012,
                uvOffset: {
                    x: 0,
                    y: 0
                },
                colorHex: 0x4c3d27,
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
                        roughness: 0.42,
                        metalness: 0.55,
                        envMapIntensity: 0.4,
                        normalStrength: 0.6
                    }
                }
            },
            glass: {
                opacity: 0.24,
                tintHex: 0x9aa3ab,
                reflection: {
                    metalness: 0,
                    roughness: 0.03,
                    transmission: 0,
                    ior: 1.5,
                    envMapIntensity: 1.0
                },
                zOffset: -0.03
            },
            shade: {
                enabled: false,
                coverage: WINDOW_SHADE_COVERAGE.PCT_20,
                randomizeCoverage: false,
                direction: 'top_to_bottom',
                colorHex: 0x565851,
                fabric: {
                    scale: 7,
                    intensity: 0.18
                },
                zOffset: -0.06
            },
            interior: {
                enabled: true,
                parallaxInteriorPresetId: 'parallax_interior.shop'
            }
        },
        storefront: {
            bulkhead: {
                enabled: true,
                heightMeters: 0.6,
                projectionMeters: 0.05,
                material: { mode: 'pbr', materialId: 'pbr.limestone_smooth' }
            },
            transom: {
                mode: 'glazed',
                heightMeters: 0.5,
                columns: 6,
                emissiveColorHex: 0xfff3e0,
                emissiveIntensity: 1.2
            },
            fascia: {
                enabled: true,
                heightMeters: 0.45,
                projectionMeters: 0.03,
                material: { mode: 'match_frame' }
            }
        },
        decoration: null,
        layers: {
            frame: true,
            muntins: true,
            glass: true,
            shade: false,
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
        seed: 'storefront-debug',
        thumbnail: {
            dataUrl: null,
            wallMaterialId: 'pbr.brick_wall_11'
        }
    })
]);

function toCatalogResult(entry) {
    const name = normalizeCatalogName(entry?.name ?? entry?.label ?? entry?.id, 'Catalog Entry');
    const assetType = normalizeAssetType(entry?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    return {
        id: String(entry?.id ?? ''),
        assetType,
        name,
        label: name,
        settings: normalizeCatalogEntrySettings(entry),
        decoration: deepClone(entry?.decoration ?? null),
        garageFacade: deepClone(entry?.garageFacade ?? null),
        storefront: assetType === WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT
            ? normalizeStorefrontConfig(entry?.storefront ?? null)
            : null,
        portal: normalizePortalConfig(entry?.portal ?? null),
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
        Object.freeze({ id: WINDOW_FABRICATION_ASSET_TYPE.GARAGE, label: 'Garage' }),
        Object.freeze({ id: WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT, label: 'Storefront' })
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
