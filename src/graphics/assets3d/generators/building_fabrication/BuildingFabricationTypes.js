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

function normalizeWindowFakeDepthConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const enabled = !!src.enabled;
    const strength = clamp(src.strength ?? src.parallaxStrength ?? 0.06, 0.0, 0.25);
    const insetStrength = clamp(src.insetStrength ?? src.inset ?? 0.25, 0.0, 1.0);
    return { enabled, strength, insetStrength };
}

function normalizeTilingConfig(value, { defaultTileMeters = 2.0 } = {}) {
    const src = value && typeof value === 'object' ? value : {};
    const enabled = !!src.enabled;
    const tileMeters = clamp(src.tileMeters ?? src.tileSizeMeters ?? defaultTileMeters, 0.1, 100.0);
    const uvEnabled = !!(src.uvEnabled ?? src.uvTransformEnabled ?? false);
    const offsetU = clamp(src.offsetU ?? src.uvOffsetU ?? 0.0, -10.0, 10.0);
    const offsetV = clamp(src.offsetV ?? src.uvOffsetV ?? 0.0, -10.0, 10.0);
    const rotationDegrees = clamp(src.rotationDegrees ?? src.uvRotationDegrees ?? 0.0, -180.0, 180.0);
    return { enabled, tileMeters, uvEnabled, offsetU, offsetV, rotationDegrees };
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
        offset: clamp(offset, 0.01, 0.2),
        fakeDepth: normalizeWindowFakeDepthConfig(fakeDepth),
        spaceColumns: {
            enabled: !!cols.enabled,
            every: clampInt(cols.every ?? cols.everyN ?? cols.after ?? 4, 1, 99),
            width: clamp(cols.width ?? 0.9, 0.1, 10.0),
            material: normalizeMaterialSpec(cols?.material, {
                fallback: { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE },
                allowColorId: isBeltCourseColor,
                allowTextureId: isBuildingStyle,
                stringKind: 'color'
            }),
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
    belt = null,
    windows = null,
    tiling = null,
    materialVariation = null
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
    return {
        id: typeof id === 'string' && id ? id : createLayerId('floor'),
        type: LAYER_TYPE.FLOOR,
        floors: clampInt(floors, 1, 99),
        floorHeight: clamp(floorHeight, 1.0, 12.0),
        planOffset: clamp(planOffset, -8.0, 8.0),
        style: derivedStyle,
        material: wallMaterial,
        tiling: tilingCfg,
        materialVariation: matVarCfg,
        belt: {
            enabled: !!b.enabled,
            height: clamp(b.height ?? 0.18, 0.02, 1.2),
            extrusion: clamp(b.extrusion ?? b.extrudeDistance ?? b.extrude ?? b.extrudeDepth ?? 0.0, 0.0, 4.0),
            material: normalizeMaterialSpec(b?.material, {
                fallback: { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE },
                allowColorId: isBeltCourseColor,
                allowTextureId: isBuildingStyle,
                stringKind: 'color'
            })
        },
        windows: windows ? createDefaultWindowSpec(windows) : createDefaultWindowSpec()
    };
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
        allowTextureId: isBuildingStyle,
        stringKind: 'color'
    });

    let roofMaterial = normalizeMaterialSpec(rf?.material, {
        fallback: { kind: 'color', id: ROOF_COLOR.DEFAULT },
        allowColorId: isRoofColor,
        allowTextureId: isBuildingStyle,
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
            material: ringMaterial
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
            next.push(createDefaultFloorLayer(layer));
            continue;
        }
        if (type === LAYER_TYPE.ROOF) {
            next.push(createDefaultRoofLayer(layer));
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
            const windows = layer?.windows ?? {};
            const columns = windows?.spaceColumns ?? {};
            const columnsMaterial = columns?.material ?? null;
            const fakeDepth = windows?.fakeDepth ?? null;
            const material = layer?.material ?? null;
            const tiling = layer?.tiling ?? null;
            const materialVariation = layer?.materialVariation ?? null;

            out.push({
                ...layer,
                material: material ? { ...material } : material,
                tiling: tiling ? deepClone(tiling) : tiling,
                materialVariation: materialVariation ? deepClone(materialVariation) : materialVariation,
                belt: {
                    ...belt,
                    material: beltMaterial ? { ...beltMaterial } : beltMaterial
                },
                windows: {
                    ...windows,
                    params: { ...(windows?.params ?? {}) },
                    fakeDepth: fakeDepth ? deepClone(fakeDepth) : fakeDepth,
                    spaceColumns: {
                        ...columns,
                        material: columnsMaterial ? { ...columnsMaterial } : columnsMaterial
                    }
                }
            });
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const ring = layer?.ring ?? {};
            const ringMaterial = ring?.material ?? null;
            const roof = layer?.roof ?? {};
            const roofTiling = roof?.tiling ?? null;
            const roofMaterialVariation = roof?.materialVariation ?? null;

            out.push({
                ...layer,
                ring: {
                    ...ring,
                    material: ringMaterial ? { ...ringMaterial } : ringMaterial
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
