// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js
// Defines layer-based building fabrication data types.
import { BUILDING_STYLE, isBuildingStyle } from '../../../../app/buildings/BuildingStyle.js';
import { isPbrBuildingWallMaterialId } from '../../materials/PbrMaterialCatalog.js';
import { ROOF_COLOR, isRoofColor } from '../../../../app/buildings/RoofColor.js';
import { BELT_COURSE_COLOR, isBeltCourseColor } from '../../../../app/buildings/BeltCourseColor.js';
import {
    WALL_BASE_TINT_STATE_DEFAULT,
    applyWallBaseTintStateToWallBase,
    resolveWallBaseTintStateFromWallBase
} from '../../../../app/buildings/WallBaseTintModel.js';
import { WINDOW_TYPE, getDefaultWindowParams, isWindowTypeId } from '../buildings/WindowTextureGenerator.js';
import { isValidMaterialSlotName, parseMaterialSpecShorthand } from '../../../../app/buildings/BuildingMaterialSlots.js';
import { normalizeRooftopPropsConfig } from '../../../../app/buildings/RooftopPropsModel.js';
import { normalizeLayerSilhouette } from '../../../../app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';

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

const WALL_BASE_TINT_DEFAULT_FIELDS = Object.freeze(
    applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT)
);

export const WALL_BASE_MATERIAL_DEFAULT = Object.freeze({
    ...WALL_BASE_TINT_DEFAULT_FIELDS,
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
    const tintState = resolveWallBaseTintStateFromWallBase(src, WALL_BASE_TINT_STATE_DEFAULT);
    const roughness = clamp(src.roughness ?? WALL_BASE_MATERIAL_DEFAULT.roughness, 0.0, 1.0);
    const normalStrength = clamp(src.normalStrength ?? src.normal ?? WALL_BASE_MATERIAL_DEFAULT.normalStrength, 0.0, 2.0);
    const out = { roughness, normalStrength };
    applyWallBaseTintStateToWallBase(out, tintState);
    return out;
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

function normalizeFloorLayerInteriorConfig(value, { fallbackEnabled = false } = {}) {
    if (typeof value === 'boolean') return { enabled: value };
    const src = value && typeof value === 'object' ? value : null;
    const enabledRaw = src?.enabled ?? src?.on ?? src?.interiorEnabled;
    if (enabledRaw === undefined) return { enabled: !!fallbackEnabled };
    return { enabled: !!enabledRaw };
}

// Slot / brick preset references (AI 491) survive normalization untouched;
// they are resolved to explicit specs by the config pre-pass in
// BuildingMaterialSlots.resolveBuildingConfigMaterials before rendering.
function normalizeSlotOrPresetMaterialSpec(value) {
    const spec = typeof value === 'string' ? parseMaterialSpecShorthand(value) : value;
    if (!spec || typeof spec !== 'object') return null;
    if (spec.kind === 'slot' && isValidMaterialSlotName(spec.id)) return { kind: 'slot', id: spec.id };
    if (spec.kind === 'preset' && typeof spec.id === 'string' && spec.id) {
        const out = { kind: 'preset', id: spec.id };
        if (spec.jitter !== undefined && spec.jitter !== null && spec.jitter !== false) out.jitter = deepClone(spec.jitter);
        return out;
    }
    return null;
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

    const slotOrPreset = normalizeSlotOrPresetMaterialSpec(value);
    if (slotOrPreset) return slotOrPreset;

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

export const CORNICE_PROFILE = Object.freeze({
    FLAT_BAND: 'flat_band',
    STEPPED: 'stepped',
    CROWN_MOLDING: 'crown_molding',
    CORBELLED_BRICK: 'corbelled_brick'
});

export function isCorniceProfile(value) {
    return value === CORNICE_PROFILE.FLAT_BAND
        || value === CORNICE_PROFILE.STEPPED
        || value === CORNICE_PROFILE.CROWN_MOLDING
        || value === CORNICE_PROFILE.CORBELLED_BRICK;
}

export const CORNICE_ORNAMENT = Object.freeze({
    NONE: 'none',
    DENTILS: 'dentils',
    BRACKETS: 'brackets'
});

export function isCorniceOrnament(value) {
    return value === CORNICE_ORNAMENT.NONE
        || value === CORNICE_ORNAMENT.DENTILS
        || value === CORNICE_ORNAMENT.BRACKETS;
}

export const CORNICE_PARAPET_STEPPED_MODE = Object.freeze({
    CORNERS: 'corners',
    CORNERS_AND_CENTERS: 'corners_and_centers'
});

export function isCorniceParapetSteppedMode(value) {
    return value === CORNICE_PARAPET_STEPPED_MODE.CORNERS
        || value === CORNICE_PARAPET_STEPPED_MODE.CORNERS_AND_CENTERS;
}

// Cornice parts accept `match_wall` in addition to explicit color/texture specs,
// mirroring the window surround material modes. Slot / preset references are
// also preserved (resolution order: explicit > slot > match_*).
function normalizeCorniceMaterialSpec(value, { fallback = { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE } } = {}) {
    const kindRaw = typeof value?.kind === 'string' ? value.kind.trim().toLowerCase() : '';
    const idRaw = typeof value?.id === 'string' ? value.id.trim().toLowerCase() : '';
    if (kindRaw === 'match_wall' || (!kindRaw && idRaw === 'match_wall') || value === 'match_wall') {
        return { kind: 'match_wall', id: 'match_wall' };
    }
    const slotOrPreset = normalizeSlotOrPresetMaterialSpec(value);
    if (slotOrPreset) return slotOrPreset;
    return normalizeMaterialSpec(value, {
        fallback,
        allowColorId: isBeltCourseColor,
        allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
        stringKind: 'color'
    });
}

export function normalizeCorniceConfig(value, { isRoof = false } = {}) {
    const src = value && typeof value === 'object' ? value : {};
    const orn = src.ornament && typeof src.ornament === 'object' ? src.ornament : {};
    const material = normalizeCorniceMaterialSpec(src.material);

    const out = {
        enabled: !!src.enabled,
        profile: isCorniceProfile(src.profile) ? src.profile : CORNICE_PROFILE.FLAT_BAND,
        height: clamp(src.height ?? 0.5, 0.05, 2.0),
        projection: clamp(src.projection ?? 0.25, 0.02, 1.5),
        material,
        tiling: normalizeTilingConfig(src.tiling, { defaultTileMeters: 2.0 }),
        ornament: {
            type: isCorniceOrnament(orn.type) ? orn.type : CORNICE_ORNAMENT.NONE,
            width: clamp(orn.width ?? 0.18, 0.02, 2.0),
            depth: clamp(orn.depth ?? 0.14, 0.02, 1.5),
            spacing: clamp(orn.spacing ?? 0.22, 0.0, 4.0),
            height: clamp(orn.height ?? 0.22, 0.02, 1.5),
            material: normalizeCorniceMaterialSpec(orn.material, { fallback: material })
        }
    };

    if (isRoof) {
        const parapet = src.parapet && typeof src.parapet === 'object' ? src.parapet : {};
        const coping = parapet.coping && typeof parapet.coping === 'object' ? parapet.coping : {};
        const stepped = parapet.stepped && typeof parapet.stepped === 'object' ? parapet.stepped : {};
        out.parapet = {
            coping: {
                enabled: !!coping.enabled,
                height: clamp(coping.height ?? 0.12, 0.02, 0.5),
                overhang: clamp(coping.overhang ?? 0.05, 0.0, 0.4),
                material: normalizeCorniceMaterialSpec(coping.material, { fallback: material })
            },
            stepped: {
                enabled: !!stepped.enabled,
                mode: isCorniceParapetSteppedMode(stepped.mode) ? stepped.mode : CORNICE_PARAPET_STEPPED_MODE.CORNERS,
                blockWidth: clamp(stepped.blockWidth ?? 0.9, 0.2, 4.0),
                raise: clamp(stepped.raise ?? 0.45, 0.05, 2.0)
            }
        };
    }

    return out;
}

export const CORNER_TREATMENT_MODE = Object.freeze({
    QUOIN_BLOCKS: 'quoin_blocks',
    STRIP: 'strip'
});

export function isCornerTreatmentMode(value) {
    return value === CORNER_TREATMENT_MODE.QUOIN_BLOCKS || value === CORNER_TREATMENT_MODE.STRIP;
}

// Corner ids pair the quad faces: A = maxZ, B = maxX, C = minZ, D = minX.
export const CORNER_TREATMENT_CORNER_IDS = Object.freeze(['AB', 'BC', 'CD', 'DA']);

export const CORNER_TREATMENT_RHYTHM = Object.freeze({
    EVERY_COURSE: 'every_course',
    FLOOR_ZONE: 'floor_zone'
});

export function isCornerTreatmentRhythm(value) {
    return value === CORNER_TREATMENT_RHYTHM.EVERY_COURSE || value === CORNER_TREATMENT_RHYTHM.FLOOR_ZONE;
}

// `matched`: both walls show the same width at each course, alternating
// wide/narrow by course (the ref 11/13/15 brick-tower look). `interlocked`:
// a long face on one wall pairs with a short header on the other, flipping
// each course (European stone bond).
export const CORNER_TREATMENT_BOND = Object.freeze({
    MATCHED: 'matched',
    INTERLOCKED: 'interlocked'
});

export function isCornerTreatmentBond(value) {
    return value === CORNER_TREATMENT_BOND.MATCHED || value === CORNER_TREATMENT_BOND.INTERLOCKED;
}

export function normalizeCornerTreatmentConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const rhythm = src.rhythm && typeof src.rhythm === 'object' ? src.rhythm : {};

    const corners = {};
    for (const cornerId of CORNER_TREATMENT_CORNER_IDS) {
        const c = src.corners?.[cornerId];
        corners[cornerId] = { enabled: c?.enabled === undefined ? true : !!c.enabled };
    }

    const layerIdsRaw = Array.isArray(src.layerIds)
        ? src.layerIds.filter((id) => typeof id === 'string' && id)
        : null;

    return {
        enabled: !!src.enabled,
        mode: isCornerTreatmentMode(src.mode) ? src.mode : CORNER_TREATMENT_MODE.QUOIN_BLOCKS,
        bond: isCornerTreatmentBond(src.bond) ? src.bond : CORNER_TREATMENT_BOND.MATCHED,
        blockHeight: clamp(src.blockHeight ?? 0.35, 0.05, 2.0),
        longWidth: clamp(src.longWidth ?? 0.45, 0.05, 2.0),
        shortWidth: clamp(src.shortWidth ?? 0.25, 0.05, 2.0),
        stripWidth: clamp(src.stripWidth ?? 0.35, 0.05, 2.0),
        projection: clamp(src.projection ?? 0.04, 0.005, 0.5),
        // The short/narrow element's projection as a fraction of `projection`
        // (the reference towers extrude the wider course further; 1 = flat).
        shortProjectionScale: clamp(src.shortProjectionScale ?? 0.55, 0.1, 1.0),
        rhythm: {
            mode: isCornerTreatmentRhythm(rhythm.mode) ? rhythm.mode : CORNER_TREATMENT_RHYTHM.EVERY_COURSE,
            zoneCourses: clampInt(rhythm.zoneCourses ?? 2, 1, 12),
            everyFloors: clampInt(rhythm.everyFloors ?? 1, 1, 12)
        },
        material: normalizeCorniceMaterialSpec(src.material),
        tiling: normalizeTilingConfig(src.tiling, { defaultTileMeters: 2.0 }),
        corners,
        layerIds: layerIdsRaw && layerIdsRaw.length ? layerIdsRaw : null
    };
}

// Facade banding (AI 491): alternates the layer's wall material with a
// secondary material in horizontal bands (the ref-16 striped look). Heights
// are authored in meters or brick courses; `offset` shifts the pattern down.
export const FACADE_BANDING_UNIT = Object.freeze({
    METERS: 'meters',
    COURSES: 'courses'
});

export function isFacadeBandingUnit(value) {
    return value === FACADE_BANDING_UNIT.METERS || value === FACADE_BANDING_UNIT.COURSES;
}

export function normalizeFacadeBandingConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    const unit = isFacadeBandingUnit(src.unit) ? src.unit : FACADE_BANDING_UNIT.METERS;
    const isCourses = unit === FACADE_BANDING_UNIT.COURSES;
    const heightMax = isCourses ? 99 : 30;
    const primaryDefault = isCourses ? 6 : 1.8;
    const secondaryDefault = isCourses ? 2 : 0.6;

    const courseHeightRaw = Number(src.courseHeightMeters);
    const wallBase = src.wallBase && typeof src.wallBase === 'object'
        ? normalizeWallBaseMaterialConfig(src.wallBase)
        : null;

    const out = {
        enabled: !!src.enabled,
        unit,
        primaryHeight: clamp(src.primaryHeight ?? src.bandAHeight ?? primaryDefault, 0.05, heightMax),
        secondaryHeight: clamp(src.secondaryHeight ?? src.bandBHeight ?? secondaryDefault, 0.05, heightMax),
        offset: clamp(src.offset ?? 0.0, -heightMax, heightMax),
        // null = derive a course height from the layer's brick layout.
        courseHeightMeters: (Number.isFinite(courseHeightRaw) && courseHeightRaw > 0)
            ? clamp(courseHeightRaw, 0.02, 2.0)
            : null,
        material: normalizeMaterialSpec(src.material, {
            fallback: { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE },
            allowColorId: isBeltCourseColor,
            allowTextureId: (id) => isBuildingStyle(id) || isPbrBuildingWallMaterialId(id),
            stringKind: 'texture'
        }),
        wallBase,
        tiling: src.tiling !== undefined && src.tiling !== null ? normalizeTilingConfig(src.tiling, { defaultTileMeters: 2.0 }) : null
    };
    return out;
}

// AI 512: N-face model — a face id is any single letter A-Z (rects keep
// resolving to A-D; N-gon footprints generate E, F, ... in loop order).
function isFaceId(faceId) {
    return typeof faceId === 'string' && faceId.length === 1 && faceId >= 'A' && faceId <= 'Z';
}

function faceIdKeysOf(spec) {
    if (!spec || typeof spec !== 'object') return [];
    return Object.keys(spec).filter(isFaceId);
}

function normalizeFaceLinkingConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    const links = src?.links && typeof src.links === 'object' ? src.links : null;
    if (!links) return null;

    const outLinks = {};
    for (const [slave, master] of Object.entries(links)) {
        if (!isFaceId(slave) || !isFaceId(master) || slave === master) continue;
        outLinks[slave] = master;
    }
    if (!Object.keys(outLinks).length) return null;

    const reverseSrc = src?.reverseByFace && typeof src.reverseByFace === 'object'
        ? src.reverseByFace
        : null;
    const outReverse = {};
    if (reverseSrc) {
        for (const [slave, master] of Object.entries(outLinks)) {
            if (!isFaceId(slave) || !isFaceId(master) || slave === master) continue;
            if (!!reverseSrc[slave]) outReverse[slave] = true;
        }
    }

    return Object.keys(outReverse).length
        ? { links: outLinks, reverseByFace: outReverse }
        : { links: outLinks };
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
    for (const faceId of faceIdKeysOf(src)) {
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

// DEPRECATED (engine 1): `layer.windows` is the fixed-spacing window path,
// including `spaceColumns`. New buildings and new features target engine 2
// only — facades/bays + window definitions. This block remains so existing
// configs keep rendering; do not extend it.
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
    cornice = null,
    windows = null,
    interior = null,
    interiorEnabled = undefined,
    tiling = null,
    materialVariation = null,
    faceLinking = null,
    faceMaterials = null,
    banding = null,
    silhouette = undefined
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
    const interiorCfg = normalizeFloorLayerInteriorConfig(interior, {
        fallbackEnabled: interiorEnabled !== undefined ? !!interiorEnabled : false
    });
    // Field absence is the legacy inheritance path. Do not materialize an
    // `inherit_default` record unless the source explicitly owns a silhouette.
    const silhouetteCfg = normalizeLayerSilhouette(silhouette);

    const out = {
        id: typeof id === 'string' && id ? id : createLayerId('floor'),
        type: LAYER_TYPE.FLOOR,
        floors: clampInt(floors, 1, 99),
        floorHeight: clamp(floorHeight, 1.0, 12.0),
        planOffset: clamp(planOffset, -8.0, 8.0),
        interior: interiorCfg,
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
            wallBase: b?.wallBase && typeof b.wallBase === 'object'
                ? normalizeWallBaseMaterialConfig(b.wallBase)
                : null,
            tiling: normalizeTilingConfig(b?.tiling, { defaultTileMeters: 2.0 })
        },
        cornice: normalizeCorniceConfig(cornice, { isRoof: false }),
        banding: normalizeFacadeBandingConfig(banding),
        windows: windows ? createDefaultWindowSpec(windows) : createDefaultWindowSpec()
    };

    if (faceLinkingCfg) out.faceLinking = faceLinkingCfg;
    if (faceMaterialsCfg) out.faceMaterials = faceMaterialsCfg;
    if (silhouetteCfg) out.silhouette = silhouetteCfg;
    return out;
}

export function createDefaultRoofLayer({
    id = null,
    ring = null,
    roof = null,
    cornice = null,
    props = null
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
    const propsCfg = normalizeRooftopPropsConfig(props);
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
        cornice: normalizeCorniceConfig(cornice, { isRoof: true }),
        // AI 492: rooftop props (water towers, bulkheads, mechanicals). Absent
        // when the feature is off so existing roof configs round-trip unchanged.
        ...(propsCfg ? { props: propsCfg } : {}),
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
            const beltWallBase = belt?.wallBase ?? null;
            const beltTiling = belt?.tiling ?? null;
            const cornice = layer?.cornice ?? null;
            const windows = layer?.windows ?? {};
            const interior = layer?.interior ?? null;
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
            const banding = layer?.banding ?? null;

            out.push({
                ...layer,
                faceLinking: faceLinking ? deepClone(faceLinking) : faceLinking,
                faceMaterials: faceMaterials ? deepClone(faceMaterials) : faceMaterials,
                banding: banding ? deepClone(banding) : banding,
                material: material ? { ...material } : material,
                wallBase: wallBase ? deepClone(wallBase) : wallBase,
                tiling: tiling ? deepClone(tiling) : tiling,
                interior: interior ? deepClone(interior) : interior,
                materialVariation: materialVariation ? deepClone(materialVariation) : materialVariation,
                belt: {
                    ...belt,
                    material: beltMaterial ? { ...beltMaterial } : beltMaterial,
                    wallBase: beltWallBase ? deepClone(beltWallBase) : beltWallBase,
                    tiling: beltTiling ? deepClone(beltTiling) : beltTiling
                },
                cornice: cornice ? deepClone(cornice) : cornice,
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
            const cornice = layer?.cornice ?? null;
            const roof = layer?.roof ?? {};
            const roofTiling = roof?.tiling ?? null;
            const roofMaterialVariation = roof?.materialVariation ?? null;
            const props = layer?.props ?? null;

            out.push({
                ...layer,
                ring: {
                    ...ring,
                    material: ringMaterial ? { ...ringMaterial } : ringMaterial,
                    tiling: ringTiling ? deepClone(ringTiling) : ringTiling
                },
                cornice: cornice ? deepClone(cornice) : cornice,
                props: props ? deepClone(props) : props,
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
