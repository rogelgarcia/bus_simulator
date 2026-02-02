// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js
// Defines layer-based building fabrication data types.
import { BUILDING_STYLE, isBuildingStyle } from '../../../../app/buildings/BuildingStyle.js';
import { isPbrBuildingWallMaterialId } from '../../materials/PbrMaterialCatalog.js';
import { ROOF_COLOR, isRoofColor } from '../../../../app/buildings/RoofColor.js';
import { BELT_COURSE_COLOR, isBeltCourseColor } from '../../../../app/buildings/BeltCourseColor.js';
import { WINDOW_TYPE, getDefaultWindowParams, isWindowTypeId } from '../buildings/WindowTextureGenerator.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

export const WALL_BASE_MATERIAL_DEFAULT = Object.freeze({
    tintHex: 0xffffff,
    roughness: 0.85,
    normalStrength: 0.9
});

export const WINDOW_REFLECTIVE_GLASS_DEFAULT = Object.freeze({
    colorHex: 0xffffff,
    metalness: 0.0,
    roughness: 0.02,
    transmission: 0.0,
    ior: 2.2,
    envMapIntensity: 4.0
});

export const WINDOW_REFLECTIVE_DEFAULT = Object.freeze({
    enabled: false,
    opacity: 0.85,
    layerOffset: 0.02,
    glass: WINDOW_REFLECTIVE_GLASS_DEFAULT
});

export function normalizeWallBaseMaterialConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const tintRaw = src.tintHex ?? src.tint ?? src.albedoTint ?? src.albedoTintHex ?? WALL_BASE_MATERIAL_DEFAULT.tintHex;
    const tintHex = Number.isFinite(tintRaw) ? ((Number(tintRaw) >>> 0) & 0xffffff) : WALL_BASE_MATERIAL_DEFAULT.tintHex;
    const roughness = clamp(src.roughness ?? WALL_BASE_MATERIAL_DEFAULT.roughness, 0.0, 1.0);
    const normalStrength = clamp(src.normalStrength ?? src.normal ?? WALL_BASE_MATERIAL_DEFAULT.normalStrength, 0.0, 2.0);
    return { tintHex, roughness, normalStrength };
}

export function normalizeBuildingWindowVisualsConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const reflective = src.reflective && typeof src.reflective === 'object' ? src.reflective : {};
    const glass = reflective.glass && typeof reflective.glass === 'object' ? reflective.glass : {};

    const colorHexRaw = glass.colorHex ?? WINDOW_REFLECTIVE_GLASS_DEFAULT.colorHex;
    const colorHex = Number.isFinite(colorHexRaw)
        ? (Number(colorHexRaw) >>> 0) & 0xffffff
        : WINDOW_REFLECTIVE_GLASS_DEFAULT.colorHex;
    const metalness = clamp(glass.metalness ?? WINDOW_REFLECTIVE_GLASS_DEFAULT.metalness, 0.0, 1.0);
    const roughness = clamp(glass.roughness ?? WINDOW_REFLECTIVE_GLASS_DEFAULT.roughness, 0.0, 1.0);
    const transmission = clamp(glass.transmission ?? WINDOW_REFLECTIVE_GLASS_DEFAULT.transmission, 0.0, 1.0);
    const ior = clamp(glass.ior ?? WINDOW_REFLECTIVE_GLASS_DEFAULT.ior, 1.0, 2.5);
    const envMapIntensity = clamp(glass.envMapIntensity ?? WINDOW_REFLECTIVE_GLASS_DEFAULT.envMapIntensity, 0.0, 5.0);

    const wantsTransmission = transmission > 0.01;
    const opacityDefault = wantsTransmission ? 1.0 : WINDOW_REFLECTIVE_DEFAULT.opacity;
    const opacity = Number.isFinite(reflective.opacity)
        ? clamp(reflective.opacity, 0.0, 1.0)
        : opacityDefault;
    const offsetRaw = reflective.layerOffset ?? reflective.offset;
    const layerOffset = Number.isFinite(offsetRaw)
        ? clamp(offsetRaw, -0.1, 0.1)
        : WINDOW_REFLECTIVE_DEFAULT.layerOffset;

    return {
        reflective: {
            enabled: reflective.enabled !== undefined ? !!reflective.enabled : WINDOW_REFLECTIVE_DEFAULT.enabled,
            opacity,
            layerOffset,
            glass: {
                colorHex,
                metalness,
                roughness,
                transmission,
                ior,
                envMapIntensity
            }
        }
    };
}

function normalizeOptionalBuildingWindowVisualsConfig(value) {
    if (value === null || value === undefined) return null;
    if (!value || typeof value !== 'object') return null;
    return normalizeBuildingWindowVisualsConfig(value);
}

function normalizeWindowFakeDepthConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const enabled = !!src.enabled;
    const strength = clamp(src.strength ?? src.parallaxStrength ?? 0.06, 0.0, 0.25);
    const insetStrength = clamp(src.insetStrength ?? src.inset ?? 0.25, 0.0, 1.0);
    return { enabled, strength, insetStrength };
}

function normalizeWindowPbrConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const normal = src.normal && typeof src.normal === 'object' ? src.normal : {};
    const roughness = src.roughness && typeof src.roughness === 'object' ? src.roughness : {};
    const border = src.border && typeof src.border === 'object' ? src.border : {};

    return {
        normal: {
            enabled: normal.enabled === undefined ? true : !!normal.enabled,
            strength: clamp(normal.strength ?? 0.85, 0.0, 2.0)
        },
        roughness: {
            enabled: roughness.enabled === undefined ? true : !!roughness.enabled,
            contrast: clamp(roughness.contrast ?? 1.0, 0.0, 4.0)
        },
        border: {
            enabled: border.enabled === undefined ? true : !!border.enabled,
            thickness: clamp(border.thickness ?? 0.018, 0.0, 0.12),
            strength: clamp(border.strength ?? 0.35, 0.0, 1.0)
        }
    };
}

function normalizeTilingConfig(value, { defaultTileMeters = 2.0 } = {}) {
    const src = value && typeof value === 'object' ? value : {};
    const enabled = !!src.enabled;
    const tileMeters = clamp(src.tileMeters ?? src.tileSizeMeters ?? defaultTileMeters, 0.1, 100.0);
    const tileMetersU = clamp(src.tileMetersU ?? src.tileSizeMetersU ?? tileMeters, 0.1, 100.0);
    const tileMetersV = clamp(src.tileMetersV ?? src.tileSizeMetersV ?? tileMeters, 0.01, 100.0);
    const uvEnabled = !!(src.uvEnabled ?? src.uvTransformEnabled ?? false);
    const offsetU = clamp(src.offsetU ?? src.uvOffsetU ?? 0.0, -10.0, 10.0);
    const offsetV = clamp(src.offsetV ?? src.uvOffsetV ?? 0.0, -10.0, 10.0);
    const rotationDegrees = clamp(src.rotationDegrees ?? src.uvRotationDegrees ?? 0.0, -180.0, 180.0);
    return { enabled, tileMeters, tileMetersU, tileMetersV, uvEnabled, offsetU, offsetV, rotationDegrees };
}

function normalizeMaterialVariationConfig(value, { defaultEnabled = false, defaultSeedOffset = 0 } = {}) {
    const src = value && typeof value === 'object' ? value : {};
    const seedOffset = clampInt(src.seedOffset ?? 0, -9999, 9999);
    return { ...deepClone(src), enabled: src.enabled === undefined ? !!defaultEnabled : !!src.enabled, seedOffset };
}

function normalizeMaterialSpec(
    value,
    {
        fallback = { kind: 'color', id: '' },
        allowColorId = null,
        allowTextureId = null,
        stringKind = null
    } = {}
) {
    const safeFallback = {
        kind: fallback?.kind === 'texture' ? 'texture' : 'color',
        id: typeof fallback?.id === 'string' ? fallback.id : ''
    };

    const canColor = typeof allowColorId === 'function' ? allowColorId : () => false;
    const canTexture = typeof allowTextureId === 'function' ? allowTextureId : () => false;

    if (value && typeof value === 'object') {
        const kind = value.kind;
        const id = value.id;
        if (kind === 'texture' && typeof id === 'string' && canTexture(id)) return { kind: 'texture', id };
        if (kind === 'color' && typeof id === 'string' && canColor(id)) return { kind: 'color', id };

        const legacyColor = value.color;
        if (typeof legacyColor === 'string' && canColor(legacyColor)) return { kind: 'color', id: legacyColor };

        const legacyTexture = value.texture;
        if (typeof legacyTexture === 'string' && canTexture(legacyTexture)) return { kind: 'texture', id: legacyTexture };
    }

    if (typeof value === 'string') {
        const id = value;
        if (stringKind === 'color') {
            if (canColor(id)) return { kind: 'color', id };
            if (canTexture(id)) return { kind: 'texture', id };
        } else if (stringKind === 'texture') {
            if (canTexture(id)) return { kind: 'texture', id };
            if (canColor(id)) return { kind: 'color', id };
        } else {
            if (canTexture(id)) return { kind: 'texture', id };
            if (canColor(id)) return { kind: 'color', id };
        }
    }

    return safeFallback;
}

const FACE_IDS = Object.freeze(['A', 'B', 'C', 'D']);

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function normalizeFaceLinkingConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    const links = src?.links && typeof src.links === 'object' ? src.links : null;
    if (!links) return null;

    const out = {};
    for (const [slave, master] of Object.entries(links)) {
        if (!isFaceId(slave) || !isFaceId(master) || slave === master) continue;
        out[slave] = master;
    }
    return Object.keys(out).length ? { links: out } : null;
}

function normalizeFaceMaterialConfigs(value, { layerDefaults, faceLinking }) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;

    const defaults = layerDefaults && typeof layerDefaults === 'object' ? layerDefaults : null;
    if (!defaults) return null;

    const slaveFaces = new Set();
    const links = faceLinking?.links && typeof faceLinking.links === 'object' ? faceLinking.links : null;
    if (links) {
        for (const [slave, master] of Object.entries(links)) {
            if (!isFaceId(slave) || !isFaceId(master) || slave === master) continue;
            slaveFaces.add(slave);
        }
    }

    const out = {};
    for (const faceId of FACE_IDS) {
        if (slaveFaces.has(faceId)) continue;

        const cfg = src?.[faceId];
        if (!cfg || typeof cfg !== 'object') continue;

        out[faceId] = {
            material: normalizeMaterialSpec(cfg?.material, {
                fallback: defaults.material,
                allowColorId: isBeltCourseColor,
                allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
                stringKind: 'texture'
            }),
            wallBase: normalizeWallBaseMaterialConfig(cfg?.wallBase ?? defaults.wallBase),
            tiling: normalizeTilingConfig(cfg?.tiling ?? defaults.tiling, { defaultTileMeters: 2.0 }),
            materialVariation: normalizeMaterialVariationConfig(cfg?.materialVariation ?? defaults.materialVariation, {
                defaultEnabled: !!defaults.materialVariation?.enabled,
                defaultSeedOffset: Number(defaults.materialVariation?.seedOffset) || 0
            })
        };
    }

    return Object.keys(out).length ? out : null;
}

let _nextLayerId = 1;

export function createLayerId(prefix = 'layer') {
    const id = `${prefix}_${_nextLayerId}`;
    _nextLayerId += 1;
    return id;
}

export const LAYER_TYPE = Object.freeze({
    FLOOR: 'floor',
    ROOF: 'roof'
});

export function isLayerType(value) {
    return value === LAYER_TYPE.FLOOR || value === LAYER_TYPE.ROOF;
}

export function createDefaultWindowSpec({
    typeId = WINDOW_TYPE.STYLE_DEFAULT,
    params = null,
    width = 2.2,
    height = 1.4,
    sillHeight = 1.0,
    spacing = 1.6,
    cornerEps = 0.01,
    offset = 0.01,
    enabled = true,
    fakeDepth = null,
    pbr = null,
    windowVisuals = null,
    spaceColumns = null
} = {}) {
    const safeTypeId = isWindowTypeId(typeId) ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
    const safeParams = { ...getDefaultWindowParams(safeTypeId), ...(params ?? {}) };
    const cols = spaceColumns ?? {};

    return {
        enabled: !!enabled,
        typeId: safeTypeId,
        params: safeParams,
        width: clamp(width, 0.3, 12.0),
        height: clamp(height, 0.3, 10.0),
        sillHeight: clamp(sillHeight, 0.0, 12.0),
        spacing: clamp(spacing, 0.0, 24.0),
        cornerEps: clamp(cornerEps, 0.01, 2.0),
        offset: clamp(offset, 0.0, 0.2),
        fakeDepth: normalizeWindowFakeDepthConfig(fakeDepth),
        pbr: normalizeWindowPbrConfig(pbr),
        windowVisuals: normalizeOptionalBuildingWindowVisualsConfig(windowVisuals ?? null),
        spaceColumns: {
            enabled: !!cols.enabled,
            every: clampInt(cols.every ?? cols.everyN ?? cols.after ?? 4, 1, 99),
            width: clamp(cols.width ?? 0.9, 0.1, 10.0),
            material: normalizeMaterialSpec(cols?.material, {
                fallback: { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE },
                allowColorId: isBeltCourseColor,
                allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
                stringKind: 'color'
            }),
            tiling: normalizeTilingConfig(cols?.tiling, { defaultTileMeters: 2.0 }),
            extrude: !!cols.extrude,
            extrudeDistance: clamp(cols.extrudeDistance ?? cols.extrudeDepth ?? 0.12, 0.0, 1.0)
        }
    };
}

export function createDefaultFloorLayer({
    id = null,
    floors = 6,
    floorHeight = 4.2,
    planOffset = 0.0,
    style = BUILDING_STYLE.DEFAULT,
    material = null,
    wallBase = null,
    belt = null,
    windows = null,
    tiling = null,
    materialVariation = null,
    faceLinking = null,
    faceMaterials = null
} = {}) {
    const b = belt ?? {};
    const styleId = typeof style === 'string' ? style : '';
    const safeStyle = isBuildingStyle(styleId) || isPbrBuildingWallMaterialId(styleId) ? styleId : BUILDING_STYLE.DEFAULT;
    const wallMaterial = normalizeMaterialSpec(material, {
        fallback: { kind: 'texture', id: safeStyle },
        allowColorId: isBeltCourseColor,
        allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
        stringKind: 'texture'
    });
    const derivedStyle = wallMaterial.kind === 'texture' && (isBuildingStyle(wallMaterial.id) || isPbrBuildingWallMaterialId(wallMaterial.id))
        ? wallMaterial.id
        : safeStyle;
    const tilingCfg = normalizeTilingConfig(tiling, { defaultTileMeters: 2.0 });
    const matVarCfg = normalizeMaterialVariationConfig(materialVariation, { defaultEnabled: false, defaultSeedOffset: 0 });
    const wallBaseCfg = normalizeWallBaseMaterialConfig(wallBase ?? null);
    const faceLinkingCfg = normalizeFaceLinkingConfig(faceLinking);
    const faceMaterialsCfg = normalizeFaceMaterialConfigs(faceMaterials, {
        layerDefaults: { material: wallMaterial, wallBase: wallBaseCfg, tiling: tilingCfg, materialVariation: matVarCfg },
        faceLinking: faceLinkingCfg
    });

    const out = {
        id: typeof id === 'string' && id ? id : createLayerId('floor'),
        type: LAYER_TYPE.FLOOR,
        floors: clampInt(floors, 1, 99),
        floorHeight: clamp(floorHeight, 1.0, 12.0),
        planOffset: clamp(planOffset, -8.0, 8.0),
        style: derivedStyle,
        material: wallMaterial,
        wallBase: wallBaseCfg,
        tiling: tilingCfg,
        materialVariation: matVarCfg,
        belt: {
            enabled: !!b.enabled,
            height: clamp(b.height ?? 0.18, 0.02, 1.2),
            extrusion: clamp(b.extrusion ?? b.extrudeDistance ?? b.extrude ?? b.extrudeDepth ?? 0.0, 0.0, 4.0),
            material: normalizeMaterialSpec(b?.material, {
                fallback: { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE },
                allowColorId: isBeltCourseColor,
                allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
                stringKind: 'color'
            }),
            tiling: normalizeTilingConfig(b?.tiling, { defaultTileMeters: 2.0 })
        },
        windows: windows ? createDefaultWindowSpec(windows) : createDefaultWindowSpec()
    };

    if (faceLinkingCfg) out.faceLinking = faceLinkingCfg;
    if (faceMaterialsCfg) out.faceMaterials = faceMaterialsCfg;
    return out;
}

export function createDefaultRoofLayer({
    id = null,
    ring = null,
    roof = null
} = {}) {
    const r = ring ?? {};
    const rf = roof ?? {};
    const ringEnabled = r.enabled === undefined ? true : !!r.enabled;
    const ringMaterial = normalizeMaterialSpec(r?.material, {
        fallback: { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE },
        allowColorId: isBeltCourseColor,
        allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
        stringKind: 'color'
    });

    let roofMaterial = normalizeMaterialSpec(rf?.material, {
        fallback: { kind: 'color', id: ROOF_COLOR.DEFAULT },
        allowColorId: isRoofColor,
        allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
        stringKind: 'color'
    });

    const tilingCfg = normalizeTilingConfig(rf?.tiling, { defaultTileMeters: 4.0 });
    const matVarCfg = normalizeMaterialVariationConfig(rf?.materialVariation, { defaultEnabled: false, defaultSeedOffset: 0 });

    const legacyRoofColor = typeof rf?.color === 'string' ? rf.color : null;
    if ((!rf || rf.material === undefined) && isRoofColor(legacyRoofColor)) {
        roofMaterial = { kind: 'color', id: legacyRoofColor };
    }

    const roofColorId = roofMaterial.kind === 'color' && isRoofColor(roofMaterial.id)
        ? roofMaterial.id
        : (isRoofColor(legacyRoofColor) ? legacyRoofColor : ROOF_COLOR.DEFAULT);
    return {
        id: typeof id === 'string' && id ? id : createLayerId('roof'),
        type: LAYER_TYPE.ROOF,
        ring: {
            enabled: ringEnabled,
            innerRadius: clamp(r.innerRadius ?? 0.0, 0.0, 8.0),
            outerRadius: clamp(r.outerRadius ?? 0.4, 0.0, 8.0),
            height: ringEnabled ? clamp(r.height ?? 0.4, 0.02, 2.0) : 0.0,
            material: ringMaterial,
            tiling: normalizeTilingConfig(r?.tiling, { defaultTileMeters: 2.0 })
        },
        roof: {
            type: typeof rf.type === 'string' && rf.type ? rf.type : 'Asphalt',
            material: roofMaterial,
            tiling: tilingCfg,
            materialVariation: matVarCfg,
            color: roofColorId
        }
    };
}

export function createDefaultBuildingLayers({
    floors = 8,
    floorHeight = 4.2,
    style = BUILDING_STYLE.DEFAULT,
    roofColor = ROOF_COLOR.DEFAULT,
    windowTypeId = WINDOW_TYPE.STYLE_DEFAULT,
    windowParams = null,
    windowWidth = 2.2,
    windowHeight = 1.4,
    windowSillHeight = 1.0,
    windowSpacing = 1.6
} = {}) {
    const floorLayer = createDefaultFloorLayer({
        floors,
        floorHeight,
        style,
        belt: { enabled: false, height: 0.18, material: { color: BELT_COURSE_COLOR.OFFWHITE } },
        windows: {
            enabled: true,
            typeId: windowTypeId,
            params: windowParams,
            width: windowWidth,
            height: windowHeight,
            sillHeight: windowSillHeight,
            spacing: windowSpacing,
            spaceColumns: {
                enabled: false,
                every: 4,
                width: 0.9,
                material: { color: BELT_COURSE_COLOR.OFFWHITE },
                extrude: false,
                extrudeDistance: 0.12
            }
        }
    });

    const roofLayer = createDefaultRoofLayer({
        roof: { color: roofColor }
    });

    return [floorLayer, roofLayer];
}

export function normalizeBuildingLayers(layers, { fallback = null } = {}) {
    const list = Array.isArray(layers) ? layers : [];
    const next = [];

    for (const layer of list) {
        const type = layer?.type;
        if (type === LAYER_TYPE.FLOOR) {
            const windowsMissing = layer && typeof layer === 'object' && layer.windows === undefined;
            next.push(createDefaultFloorLayer(windowsMissing ? { ...layer, windows: { enabled: false } } : layer));
            continue;
        }
        if (type === LAYER_TYPE.ROOF) {
            const ringMissing = layer && typeof layer === 'object' && layer.ring === undefined;
            next.push(createDefaultRoofLayer(ringMissing ? { ...layer, ring: { enabled: false } } : layer));
            continue;
        }
    }

    if (next.length) return next;
    if (Array.isArray(fallback) && fallback.length) return fallback.map((l) => (l?.type === LAYER_TYPE.ROOF ? createDefaultRoofLayer(l) : createDefaultFloorLayer(l)));
    return [createDefaultFloorLayer(), createDefaultRoofLayer()];
}

export function cloneBuildingLayers(layers) {
    const list = Array.isArray(layers) ? layers : [];
    const out = [];

    for (const layer of list) {
        const type = layer?.type;
        if (type === LAYER_TYPE.FLOOR) {
            const belt = layer?.belt ?? {};
            const beltMaterial = belt?.material ?? null;
            const beltTiling = belt?.tiling ?? null;
            const windows = layer?.windows ?? {};
            const windowVisuals = windows?.windowVisuals ?? null;
            const columns = windows?.spaceColumns ?? {};
            const columnsMaterial = columns?.material ?? null;
            const columnsTiling = columns?.tiling ?? null;
            const fakeDepth = windows?.fakeDepth ?? null;
            const pbr = windows?.pbr ?? null;
            const material = layer?.material ?? null;
            const wallBase = layer?.wallBase ?? null;
            const tiling = layer?.tiling ?? null;
            const materialVariation = layer?.materialVariation ?? null;
            const faceLinking = layer?.faceLinking ?? null;
            const faceMaterials = layer?.faceMaterials ?? null;

            out.push({
                ...layer,
                faceLinking: faceLinking ? deepClone(faceLinking) : faceLinking,
                faceMaterials: faceMaterials ? deepClone(faceMaterials) : faceMaterials,
                material: material ? { ...material } : material,
                wallBase: wallBase ? deepClone(wallBase) : wallBase,
                tiling: tiling ? deepClone(tiling) : tiling,
                materialVariation: materialVariation ? deepClone(materialVariation) : materialVariation,
                belt: {
                    ...belt,
                    material: beltMaterial ? { ...beltMaterial } : beltMaterial,
                    tiling: beltTiling ? deepClone(beltTiling) : beltTiling
                },
                windows: {
                    ...windows,
                    params: { ...(windows?.params ?? {}) },
                    fakeDepth: fakeDepth ? deepClone(fakeDepth) : fakeDepth,
                    pbr: pbr ? deepClone(pbr) : pbr,
                    windowVisuals: windowVisuals ? deepClone(windowVisuals) : windowVisuals,
                    spaceColumns: {
                        ...columns,
                        material: columnsMaterial ? { ...columnsMaterial } : columnsMaterial,
                        tiling: columnsTiling ? deepClone(columnsTiling) : columnsTiling
                    }
                }
            });
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const ring = layer?.ring ?? {};
            const ringMaterial = ring?.material ?? null;
            const ringTiling = ring?.tiling ?? null;
            const roof = layer?.roof ?? {};
            const roofTiling = roof?.tiling ?? null;
            const roofMaterialVariation = roof?.materialVariation ?? null;

            out.push({
                ...layer,
                ring: {
                    ...ring,
                    material: ringMaterial ? { ...ringMaterial } : ringMaterial,
                    tiling: ringTiling ? deepClone(ringTiling) : ringTiling
                },
                roof: {
                    ...(roof?.material ? { ...roof, material: { ...roof.material } } : { ...roof }),
                    tiling: roofTiling ? deepClone(roofTiling) : roofTiling,
                    materialVariation: roofMaterialVariation ? deepClone(roofMaterialVariation) : roofMaterialVariation
                }
            });
        }
    }

    return normalizeBuildingLayers(out);
}
