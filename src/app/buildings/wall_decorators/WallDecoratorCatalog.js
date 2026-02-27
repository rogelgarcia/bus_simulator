// src/app/buildings/wall_decorators/WallDecoratorCatalog.js
// Catalog + debugger state model for procedural wall decorators.
// @ts-check

import {
    WALL_BASE_TINT_STATE_DEFAULT,
    applyWallBaseTintStateToWallBase,
    resolveWallBaseTintStateFromWallBase
} from '../WallBaseTintModel.js';
import {
    RIBBON_PATTERN_DEFAULT_ID,
    getRibbonPatternOptions,
    normalizeRibbonPatternId
} from './RibbonPatternCatalog.js';

export const WALL_DECORATOR_ID = Object.freeze({
    SIMPLE_SKIRT: 'simple_skirt',
    HALF_DOME: 'half_dome',
    ANGLED_SUPPORT_PROFILE: 'angled_support_profile',
    RIBBON: 'ribbon',
    EDGE_BRICK_CHAIN: 'edge_brick_chain'
});
export const WALL_DECORATOR_NONE_ID = '';

export const WALL_DECORATOR_WHERE_TO_APPLY = Object.freeze({
    ENTIRE_FACADE: 'entire_facade',
    HALF: 'half'
});

export const WALL_DECORATOR_MODE = Object.freeze({
    FACE: 'face',
    CORNER: 'corner'
});

export const WALL_DECORATOR_POSITION = Object.freeze({
    TOP: 'top',
    NEAR_TOP: 'near_top',
    NEAR_BOTTOM: 'near_bottom',
    BOTTOM: 'bottom'
});

export const WALL_DECORATOR_PROPERTY_TYPE = Object.freeze({
    INT: 'int',
    FLOAT: 'float',
    ENUM: 'enum',
    BOOL: 'bool'
});

const SIMPLE_SKIRT_SIZE_PRESET = Object.freeze({
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large'
});
const SIMPLE_SKIRT_OFFSET_MODE = Object.freeze({
    NORMAL: 'normal',
    EXTRA: 'extra'
});
const SIMPLE_SKIRT_SIZE_PRESET_VALUES = Object.freeze({
    [SIMPLE_SKIRT_SIZE_PRESET.SMALL]: Object.freeze({ heightMeters: 0.20, offsetMeters: 0.02 }),
    [SIMPLE_SKIRT_SIZE_PRESET.MEDIUM]: Object.freeze({ heightMeters: 0.50, offsetMeters: 0.05 }),
    [SIMPLE_SKIRT_SIZE_PRESET.LARGE]: Object.freeze({ heightMeters: 1.00, offsetMeters: 0.10 })
});
const RIBBON_SIZE_PRESET = Object.freeze({
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large'
});
const RIBBON_OFFSET_MODE = Object.freeze({
    NORMAL: 'normal',
    EXTRA: 'extra'
});
const RIBBON_SIZE_PRESET_VALUES = Object.freeze({
    [RIBBON_SIZE_PRESET.SMALL]: Object.freeze({ heightMeters: 0.20, offsetMeters: 0.02 }),
    [RIBBON_SIZE_PRESET.MEDIUM]: Object.freeze({ heightMeters: 0.50, offsetMeters: 0.05 }),
    [RIBBON_SIZE_PRESET.LARGE]: Object.freeze({ heightMeters: 1.00, offsetMeters: 0.10 })
});
const HALF_DOME_DIAMETER_METERS_DEFAULT = 0.80;
const HALF_DOME_OUTSET_METERS_DEFAULT = 0.0;
const ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT = 0.10;
const ANGLED_SUPPORT_PROFILE_SHIFT_METERS_DEFAULT = -0.03;
const ANGLED_SUPPORT_PROFILE_RETURN_HEIGHT_METERS_DEFAULT = 0.20;
const NEAR_EDGE_OFFSET_METERS_DEFAULT = 0.10;
const RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT = 1.4;
const EDGE_BRICK_CHAIN_EDGE_TARGET = Object.freeze({
    LEFT: 'left',
    RIGHT: 'right',
    BOTH: 'both'
});
const EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT = 0.30;
const EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT = 0.0;
const EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT = 3.5;
const EDGE_BRICK_CHAIN_DEPTH_SCALE_DEFAULT = 0.25;
const WALL_DECORATOR_MATCH_WALL_MATERIAL_SELECTION = Object.freeze({
    kind: 'match_wall',
    id: 'match_wall'
});

function deepClone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeDecoratorId(value, { allowNone = false } = {}) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!raw) return allowNone ? WALL_DECORATOR_NONE_ID : WALL_DECORATOR_ID.SIMPLE_SKIRT;
    if (raw === WALL_DECORATOR_ID.SIMPLE_SKIRT) return WALL_DECORATOR_ID.SIMPLE_SKIRT;
    if (raw === WALL_DECORATOR_ID.HALF_DOME) return WALL_DECORATOR_ID.HALF_DOME;
    if (raw === WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE) return WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE;
    if (raw === WALL_DECORATOR_ID.RIBBON) return WALL_DECORATOR_ID.RIBBON;
    if (raw === WALL_DECORATOR_ID.EDGE_BRICK_CHAIN) return WALL_DECORATOR_ID.EDGE_BRICK_CHAIN;
    return allowNone ? WALL_DECORATOR_NONE_ID : WALL_DECORATOR_ID.SIMPLE_SKIRT;
}

function normalizeWhereToApply(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WALL_DECORATOR_WHERE_TO_APPLY.HALF) return WALL_DECORATOR_WHERE_TO_APPLY.HALF;
    return WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE;
}

function normalizeMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WALL_DECORATOR_MODE.CORNER) return WALL_DECORATOR_MODE.CORNER;
    return WALL_DECORATOR_MODE.FACE;
}

function normalizePosition(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WALL_DECORATOR_POSITION.TOP) return WALL_DECORATOR_POSITION.TOP;
    if (raw === WALL_DECORATOR_POSITION.NEAR_TOP) return WALL_DECORATOR_POSITION.NEAR_TOP;
    if (raw === WALL_DECORATOR_POSITION.NEAR_BOTTOM) return WALL_DECORATOR_POSITION.NEAR_BOTTOM;
    return WALL_DECORATOR_POSITION.BOTTOM;
}

function normalizeSimpleSkirtSizePreset(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === SIMPLE_SKIRT_SIZE_PRESET.SMALL) return SIMPLE_SKIRT_SIZE_PRESET.SMALL;
    if (raw === SIMPLE_SKIRT_SIZE_PRESET.LARGE) return SIMPLE_SKIRT_SIZE_PRESET.LARGE;
    return SIMPLE_SKIRT_SIZE_PRESET.MEDIUM;
}

function normalizeSimpleSkirtOffsetMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === SIMPLE_SKIRT_OFFSET_MODE.EXTRA) return SIMPLE_SKIRT_OFFSET_MODE.EXTRA;
    return SIMPLE_SKIRT_OFFSET_MODE.NORMAL;
}

function normalizeRibbonSizePreset(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === RIBBON_SIZE_PRESET.SMALL) return RIBBON_SIZE_PRESET.SMALL;
    if (raw === RIBBON_SIZE_PRESET.LARGE) return RIBBON_SIZE_PRESET.LARGE;
    return RIBBON_SIZE_PRESET.MEDIUM;
}

function normalizeRibbonOffsetMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === RIBBON_OFFSET_MODE.EXTRA) return RIBBON_OFFSET_MODE.EXTRA;
    return RIBBON_OFFSET_MODE.NORMAL;
}

function normalizeEdgeBrickChainEdgeTarget(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT) return EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT;
    if (raw === EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT) return EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT;
    return EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH;
}

function normalizeDecoratorPropertyPicker(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'thumbnail') return 'thumbnail';
    return '';
}

function normalizeDecoratorPropertyType(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WALL_DECORATOR_PROPERTY_TYPE.INT) return WALL_DECORATOR_PROPERTY_TYPE.INT;
    if (raw === WALL_DECORATOR_PROPERTY_TYPE.ENUM) return WALL_DECORATOR_PROPERTY_TYPE.ENUM;
    if (raw === WALL_DECORATOR_PROPERTY_TYPE.BOOL) return WALL_DECORATOR_PROPERTY_TYPE.BOOL;
    return WALL_DECORATOR_PROPERTY_TYPE.FLOAT;
}

function normalizePropertyId(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id) return '';
    return id.replace(/[^a-zA-Z0-9_]/g, '');
}

function normalizeEnumOptions(value) {
    const src = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of src) {
        const id = typeof item?.id === 'string' ? item.id.trim() : '';
        if (!id) continue;
        const label = typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : id;
        const previewUrl = typeof item?.previewUrl === 'string' && item.previewUrl.trim()
            ? item.previewUrl.trim()
            : '';
        out.push(Object.freeze({ id, label, previewUrl }));
    }
    return Object.freeze(out);
}

function normalizeTypePropertySpecs(value) {
    const src = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of src) {
        const id = normalizePropertyId(item?.id);
        if (!id) continue;
        const type = normalizeDecoratorPropertyType(item?.type);
        const label = typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : id;
        const spec = {
            id,
            label,
            type,
            default: item?.default
        };
        if (type === WALL_DECORATOR_PROPERTY_TYPE.INT || type === WALL_DECORATOR_PROPERTY_TYPE.FLOAT) {
            spec.min = Number.isFinite(item?.min) ? Number(item.min) : undefined;
            spec.max = Number.isFinite(item?.max) ? Number(item.max) : undefined;
            spec.step = Number.isFinite(item?.step) ? Number(item.step) : undefined;
        } else if (type === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
            spec.options = normalizeEnumOptions(item?.options);
            spec.picker = normalizeDecoratorPropertyPicker(item?.picker);
        }
        out.push(Object.freeze(spec));
    }
    return Object.freeze(out);
}

function normalizeConfigurationValueBySpec(value, spec) {
    const propSpec = spec && typeof spec === 'object' ? spec : {};
    const type = normalizeDecoratorPropertyType(propSpec.type);
    if (type === WALL_DECORATOR_PROPERTY_TYPE.BOOL) {
        if (value === undefined) return !!propSpec.default;
        return !!value;
    }
    if (type === WALL_DECORATOR_PROPERTY_TYPE.ENUM) {
        const options = Array.isArray(propSpec.options) ? propSpec.options : [];
        const ids = options.map((opt) => String(opt?.id ?? '')).filter((id) => !!id);
        const preferred = String(value ?? '').trim();
        if (preferred && ids.includes(preferred)) return preferred;
        const def = String(propSpec.default ?? '').trim();
        if (def && ids.includes(def)) return def;
        return ids[0] ?? '';
    }
    const min = Number.isFinite(propSpec.min) ? Number(propSpec.min) : Number.NEGATIVE_INFINITY;
    const max = Number.isFinite(propSpec.max) ? Number(propSpec.max) : Number.POSITIVE_INFINITY;
    const fallback = Number.isFinite(propSpec.default) ? Number(propSpec.default) : (type === WALL_DECORATOR_PROPERTY_TYPE.INT ? 0 : 0.0);
    const numeric = clamp(value, min, max, clamp(fallback, min, max, fallback));
    if (type === WALL_DECORATOR_PROPERTY_TYPE.INT) return Math.round(numeric);
    return numeric;
}

function buildDefaultConfigurationFromPropertySpecs(propertySpecs) {
    const specs = Array.isArray(propertySpecs) ? propertySpecs : [];
    const out = {};
    for (const spec of specs) {
        const id = normalizePropertyId(spec?.id);
        if (!id) continue;
        out[id] = normalizeConfigurationValueBySpec(spec?.default, spec);
    }
    return out;
}

function normalizeDecoratorConfiguration(value, propertySpecs, fallback = null) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    const specs = Array.isArray(propertySpecs) ? propertySpecs : [];
    const out = {};
    for (const spec of specs) {
        const id = normalizePropertyId(spec?.id);
        if (!id) continue;
        const raw = src && Object.prototype.hasOwnProperty.call(src, id) ? src[id] : fb?.[id];
        out[id] = normalizeConfigurationValueBySpec(raw, spec);
    }
    return out;
}

function normalizeMaterialKind(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'match_wall' || raw === 'match wall' || raw === 'matchwall') return 'match_wall';
    if (raw === 'color') return 'color';
    return 'texture';
}

function normalizeMaterialSelection(value, fallback) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    const kind = normalizeMaterialKind(src?.kind ?? fb?.kind);
    if (kind === 'match_wall') {
        return { kind: 'match_wall', id: 'match_wall' };
    }
    const idRaw = typeof src?.id === 'string' && src.id.trim()
        ? src.id.trim()
        : (typeof fb?.id === 'string' ? fb.id.trim() : '');
    const id = idRaw || (kind === 'color' ? 'belt.white' : 'pbr.brick_wall_11');
    return { kind, id };
}

function normalizeWallBase(value, fallback) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    const tintState = resolveWallBaseTintStateFromWallBase(src ?? fb ?? {}, WALL_BASE_TINT_STATE_DEFAULT);
    const out = {
        roughness: clamp(src?.roughness, 0.0, 1.0, clamp(fb?.roughness, 0.0, 1.0, 0.85)),
        normalStrength: clamp(src?.normalStrength ?? src?.normal, 0.0, 2.0, clamp(fb?.normalStrength ?? fb?.normal, 0.0, 2.0, 0.9))
    };
    applyWallBaseTintStateToWallBase(out, tintState);
    return out;
}

function normalizeTiling(value, fallback) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    const tileMeters = clamp(src?.tileMeters, 0.1, 100.0, clamp(fb?.tileMeters, 0.1, 100.0, 2.0));
    const tileMetersU = clamp(src?.tileMetersU ?? src?.tileSizeMetersU ?? tileMeters, 0.1, 100.0);
    const tileMetersV = clamp(src?.tileMetersV ?? src?.tileSizeMetersV ?? tileMeters, 0.1, 100.0);
    return {
        enabled: src?.enabled !== undefined ? !!src.enabled : !!fb?.enabled,
        tileMeters,
        tileMetersU,
        tileMetersV,
        uvEnabled: src?.uvEnabled !== undefined ? !!src.uvEnabled : !!fb?.uvEnabled,
        offsetU: clamp(src?.offsetU, -10.0, 10.0, clamp(fb?.offsetU, -10.0, 10.0, 0.0)),
        offsetV: clamp(src?.offsetV, -10.0, 10.0, clamp(fb?.offsetV, -10.0, 10.0, 0.0)),
        rotationDegrees: clamp(src?.rotationDegrees, -180.0, 180.0, clamp(fb?.rotationDegrees, -180.0, 180.0, 0.0))
    };
}

function normalizeWallSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    return {
        widthMeters: clamp(src?.widthMeters ?? src?.width, 0.5, 128.0, 10.0),
        heightMeters: clamp(src?.heightMeters ?? src?.height, 0.5, 128.0, 3.5),
        depthMeters: clamp(src?.depthMeters ?? src?.depth, 0.05, 32.0, 0.30)
    };
}

function resolveCenterYForPosition(position, wallHeightMeters, decoratorHeightMeters, nearEdgeOffsetMeters = NEAR_EDGE_OFFSET_METERS_DEFAULT) {
    const wallHalf = wallHeightMeters * 0.5;
    const decoHalf = decoratorHeightMeters * 0.5;
    const top = wallHalf - decoHalf;
    const bottom = -wallHalf + decoHalf;
    const nearOffset = clamp(nearEdgeOffsetMeters, 0.0, wallHeightMeters, NEAR_EDGE_OFFSET_METERS_DEFAULT);
    if (position === WALL_DECORATOR_POSITION.TOP) return top;
    if (position === WALL_DECORATOR_POSITION.NEAR_TOP) return Math.max(bottom, top - nearOffset);
    if (position === WALL_DECORATOR_POSITION.NEAR_BOTTOM) return Math.min(top, bottom + nearOffset);
    return bottom;
}

function resolveSimpleSkirtSizingFromConfiguration(configuration) {
    const sizePreset = normalizeSimpleSkirtSizePreset(configuration?.sizePreset);
    const offsetMode = normalizeSimpleSkirtOffsetMode(configuration?.offsetMode);
    const preset = SIMPLE_SKIRT_SIZE_PRESET_VALUES[sizePreset] ?? SIMPLE_SKIRT_SIZE_PRESET_VALUES[SIMPLE_SKIRT_SIZE_PRESET.MEDIUM];
    const offsetScale = offsetMode === SIMPLE_SKIRT_OFFSET_MODE.EXTRA ? 2.0 : 1.0;
    return {
        sizePreset,
        offsetMode,
        heightMeters: clamp(preset.heightMeters, 0.05, 5.0, 0.5),
        offsetMeters: clamp(preset.offsetMeters * offsetScale, 0.005, 2.0, 0.05)
    };
}

function resolveRibbonSizingFromConfiguration(configuration) {
    const sizePreset = normalizeRibbonSizePreset(configuration?.sizePreset);
    const offsetMode = normalizeRibbonOffsetMode(configuration?.offsetMode);
    const preset = RIBBON_SIZE_PRESET_VALUES[sizePreset] ?? RIBBON_SIZE_PRESET_VALUES[RIBBON_SIZE_PRESET.MEDIUM];
    const offsetScale = offsetMode === RIBBON_OFFSET_MODE.EXTRA ? 2.0 : 1.0;
    return {
        sizePreset,
        offsetMode,
        heightMeters: clamp(preset.heightMeters, 0.05, 5.0, 0.5),
        offsetMeters: clamp(preset.offsetMeters * offsetScale, 0.005, 2.0, 0.05)
    };
}

function buildEdgeBrickChainCourseHeights({
    rangeMeters = 0.0,
    baseHeightMeters = EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT,
    snapToFit = true
} = {}) {
    const span = Math.max(0.0, Number(rangeMeters) || 0.0);
    if (span <= 1e-6) return [];
    const base = clamp(baseHeightMeters, 0.05, 1.0, EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT);
    const pattern = [base, base * 0.5];
    const heights = [];

    if (snapToFit) {
        let accumulated = 0.0;
        let idx = 0;
        while (accumulated < span - 1e-6 && idx < 1024) {
            const h = Math.max(0.01, Number(pattern[idx % pattern.length]) || base);
            heights.push(h);
            accumulated += h;
            idx += 1;
        }
        if (!heights.length) heights.push(Math.max(0.01, base));
        const total = heights.reduce((sum, h) => sum + h, 0.0);
        const scale = total > 1e-6 ? span / total : 1.0;
        return heights.map((h) => h * scale);
    }

    let consumed = 0.0;
    let idx = 0;
    while (consumed < span - 1e-6 && idx < 1024) {
        const raw = Math.max(0.01, Number(pattern[idx % pattern.length]) || base);
        const remaining = Math.max(0.0, span - consumed);
        const h = Math.min(raw, remaining);
        if (h <= 1e-6) break;
        heights.push(h);
        consumed += h;
        idx += 1;
    }
    return heights;
}

function pushSimpleSkirtSurroundSegmentSpecs({
    specs,
    rolePrefix,
    faceId,
    startU,
    endU,
    centerV,
    heightMeters,
    offsetMeters,
    includeStartClosure = true,
    includeEndClosure = true,
    includeBottomClosure = true,
    miterStart45 = false,
    miterEnd45 = false
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    const face = String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front';
    const roleBase = String(rolePrefix ?? face).trim() || face;
    const height = clamp(heightMeters, 0.01, 100.0, 0.2);
    const centerY = Number(centerV) || 0.0;
    const offset = clamp(offsetMeters, 0.005, 4.0, 0.05);
    const shellThickness = clamp(offset * 0.35, 0.008, Math.min(0.04, offset), Math.min(0.04, offset));
    const shellOutset = Math.max(0.0, offset - shellThickness);
    const centerUValue = minU + widthMeters * 0.5;

    out.push({
        role: `${roleBase}_main`,
        faceId: face,
        centerU: centerUValue,
        centerV: centerY,
        widthMeters,
        heightMeters: height,
        depthMeters: shellThickness,
        outsetMeters: shellOutset,
        miterStart45: !!miterStart45,
        miterEnd45: !!miterEnd45
    });
    out.push({
        role: `${roleBase}_closure_top`,
        faceId: face,
        centerU: centerUValue,
        centerV: centerY + height * 0.5 + shellThickness * 0.5,
        widthMeters,
        heightMeters: shellThickness,
        depthMeters: offset,
        outsetMeters: 0.0,
        miterStart45: !!miterStart45,
        miterEnd45: !!miterEnd45
    });
    if (includeBottomClosure) {
        out.push({
            role: `${roleBase}_closure_bottom`,
            faceId: face,
            centerU: centerUValue,
            centerV: centerY - height * 0.5 - shellThickness * 0.5,
            widthMeters,
            heightMeters: shellThickness,
            depthMeters: offset,
            outsetMeters: 0.0,
            miterStart45: !!miterStart45,
            miterEnd45: !!miterEnd45
        });
    }
    if (includeStartClosure) {
        out.push({
            role: `${roleBase}_closure_start`,
            faceId: face,
            centerU: minU + shellThickness * 0.5,
            centerV: centerY,
            widthMeters: shellThickness,
            heightMeters: height,
            depthMeters: offset,
            outsetMeters: 0.0,
            miterStart45: false,
            miterEnd45: false
        });
    }
    if (includeEndClosure) {
        out.push({
            role: `${roleBase}_closure_end`,
            faceId: face,
            centerU: maxU - shellThickness * 0.5,
            centerV: centerY,
            widthMeters: shellThickness,
            heightMeters: height,
            depthMeters: offset,
            outsetMeters: 0.0,
            miterStart45: false,
            miterEnd45: false
        });
    }

    return {
        shellThickness,
        shellOutset
    };
}

const SIMPLE_SKIRT_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'sizePreset',
        label: 'Preset',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: SIMPLE_SKIRT_SIZE_PRESET.MEDIUM,
        options: [
            { id: SIMPLE_SKIRT_SIZE_PRESET.SMALL, label: 'Small' },
            { id: SIMPLE_SKIRT_SIZE_PRESET.MEDIUM, label: 'Medium' },
            { id: SIMPLE_SKIRT_SIZE_PRESET.LARGE, label: 'Large' }
        ]
    },
    {
        id: 'offsetMode',
        label: 'Offset mode',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: SIMPLE_SKIRT_OFFSET_MODE.NORMAL,
        options: [
            { id: SIMPLE_SKIRT_OFFSET_MODE.NORMAL, label: 'Normal' },
            { id: SIMPLE_SKIRT_OFFSET_MODE.EXTRA, label: 'Extra' }
        ]
    },
    {
        id: 'nearEdgeOffsetMeters',
        label: 'Near-edge offset (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 2.0,
        step: 0.01,
        default: NEAR_EDGE_OFFSET_METERS_DEFAULT
    }
]);

const SIMPLE_SKIRT_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(SIMPLE_SKIRT_PROPERTY_SPECS)
);

const RIBBON_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'sizePreset',
        label: 'Preset',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: RIBBON_SIZE_PRESET.MEDIUM,
        options: [
            { id: RIBBON_SIZE_PRESET.SMALL, label: 'Small' },
            { id: RIBBON_SIZE_PRESET.MEDIUM, label: 'Medium' },
            { id: RIBBON_SIZE_PRESET.LARGE, label: 'Large' }
        ]
    },
    {
        id: 'offsetMode',
        label: 'Offset mode',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: RIBBON_OFFSET_MODE.NORMAL,
        options: [
            { id: RIBBON_OFFSET_MODE.NORMAL, label: 'Normal' },
            { id: RIBBON_OFFSET_MODE.EXTRA, label: 'Extra' }
        ]
    },
    {
        id: 'nearEdgeOffsetMeters',
        label: 'Near-edge offset (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 2.0,
        step: 0.01,
        default: NEAR_EDGE_OFFSET_METERS_DEFAULT
    },
    {
        id: 'patternId',
        label: 'Pattern',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: RIBBON_PATTERN_DEFAULT_ID,
        picker: 'thumbnail',
        options: getRibbonPatternOptions().map((opt) => ({
            id: opt.id,
            label: opt.label,
            previewUrl: opt.previewUrl
        }))
    },
    {
        id: 'patternNormalIntensity',
        label: 'Pattern normal',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.1,
        max: 4.0,
        step: 0.05,
        default: RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT
    }
]);

const RIBBON_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(RIBBON_PROPERTY_SPECS)
);

const EDGE_BRICK_CHAIN_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'edgeTarget',
        label: 'Edge target',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH,
        options: [
            { id: EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT, label: 'Left' },
            { id: EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT, label: 'Right' },
            { id: EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH, label: 'Both' }
        ]
    },
    {
        id: 'startY',
        label: 'startY',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 32.0,
        step: 0.01,
        default: EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT
    },
    {
        id: 'endY',
        label: 'endY',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 32.0,
        step: 0.01,
        default: EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT
    },
    {
        id: 'brickHeight',
        label: 'brickHeight',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 1.0,
        step: 0.01,
        default: EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT
    },
    {
        id: 'snapToFit',
        label: 'Snap to fit',
        type: WALL_DECORATOR_PROPERTY_TYPE.BOOL,
        default: true
    }
]);

const EDGE_BRICK_CHAIN_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(EDGE_BRICK_CHAIN_PROPERTY_SPECS)
);

const HALF_DOME_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'diameterMeters',
        label: 'Diameter (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.20,
        max: 3.50,
        step: 0.01,
        default: HALF_DOME_DIAMETER_METERS_DEFAULT
    },
    {
        id: 'outsetMeters',
        label: 'Outset (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 0.5,
        step: 0.01,
        default: HALF_DOME_OUTSET_METERS_DEFAULT
    },
    {
        id: 'nearEdgeOffsetMeters',
        label: 'Near-edge offset (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 2.0,
        step: 0.01,
        default: NEAR_EDGE_OFFSET_METERS_DEFAULT
    }
]);

const HALF_DOME_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(HALF_DOME_PROPERTY_SPECS)
);

const ANGLED_SUPPORT_PROFILE_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'offset',
        label: 'Offset (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.01,
        max: 1.5,
        step: 0.01,
        default: ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT
    },
    {
        id: 'shift',
        label: 'Shift (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: -1.0,
        max: 1.0,
        step: 0.01,
        default: ANGLED_SUPPORT_PROFILE_SHIFT_METERS_DEFAULT
    },
    {
        id: 'returnHeight',
        label: 'Return Height (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.01,
        max: 2.0,
        step: 0.01,
        default: ANGLED_SUPPORT_PROFILE_RETURN_HEIGHT_METERS_DEFAULT
    }
]);

const ANGLED_SUPPORT_PROFILE_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(ANGLED_SUPPORT_PROFILE_PROPERTY_SPECS)
);

function buildSimpleSkirtShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        SIMPLE_SKIRT_PROPERTY_SPECS,
        SIMPLE_SKIRT_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    const wallHalfWidth = wall.widthMeters * 0.5;
    const startU = wallHalfWidth - targetWidth;

    const sizing = resolveSimpleSkirtSizingFromConfiguration(configuration);
    const offsetMeters = clamp(sizing.offsetMeters, 0.005, 2.0, 0.05);
    const heightMeters = clamp(sizing.heightMeters, 0.05, wall.heightMeters, 0.5);
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        heightMeters,
        configuration.nearEdgeOffsetMeters
    );
    const includeBottomClosure = position !== WALL_DECORATOR_POSITION.BOTTOM;

    const specs = [];
    const frontStartU = startU;
    const frontEndU = startU + targetWidth;

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushSimpleSkirtSurroundSegmentSpecs({
            specs,
            rolePrefix: 'front',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters,
            includeStartClosure: true,
            includeEndClosure: false,
            includeBottomClosure,
            miterStart45: false,
            miterEnd45: true
        });
        pushSimpleSkirtSurroundSegmentSpecs({
            specs,
            rolePrefix: 'right',
            faceId: 'right',
            startU: 0.0,
            endU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters,
            includeStartClosure: false,
            includeEndClosure: true,
            includeBottomClosure,
            miterStart45: true,
            miterEnd45: false
        });
    } else {
        pushSimpleSkirtSurroundSegmentSpecs({
            specs,
            rolePrefix: 'front',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters,
            includeStartClosure: true,
            includeEndClosure: true,
            includeBottomClosure
        });
    }

    return specs;
}

function buildRibbonShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        RIBBON_PROPERTY_SPECS,
        RIBBON_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    const wallHalfWidth = wall.widthMeters * 0.5;
    const startU = wallHalfWidth - targetWidth;

    const sizing = resolveRibbonSizingFromConfiguration(configuration);
    const offsetMeters = clamp(sizing.offsetMeters, 0.005, 2.0, 0.05);
    const heightMeters = clamp(sizing.heightMeters, 0.05, wall.heightMeters, 0.5);
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        heightMeters,
        configuration.nearEdgeOffsetMeters
    );
    const includeBottomClosure = position !== WALL_DECORATOR_POSITION.BOTTOM;
    const patternId = normalizeRibbonPatternId(configuration.patternId, RIBBON_PATTERN_DEFAULT_ID);
    const patternNormalIntensity = clamp(
        configuration.patternNormalIntensity,
        0.1,
        4.0,
        RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT
    );

    const specs = [];
    const frontStartU = startU;
    const frontEndU = startU + targetWidth;

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        const maxInset = Math.max(0.01, targetWidth - 0.02);
        const jointInset = clamp(offsetMeters, 0.01, maxInset, Math.min(0.08, maxInset));
        const frontTrimmedEndU = Math.max(frontStartU + 0.01, frontEndU - jointInset);
        const rightTrimmedStartU = Math.min(targetWidth - 0.01, jointInset);

        const frontSegment = pushSimpleSkirtSurroundSegmentSpecs({
            specs,
            rolePrefix: 'front',
            faceId: 'front',
            startU: frontStartU,
            endU: frontTrimmedEndU,
            centerV,
            heightMeters,
            offsetMeters,
            includeStartClosure: true,
            includeEndClosure: false,
            includeBottomClosure
        });
        const rightSegment = pushSimpleSkirtSurroundSegmentSpecs({
            specs,
            rolePrefix: 'right',
            faceId: 'right',
            startU: rightTrimmedStartU,
            endU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters,
            includeStartClosure: false,
            includeEndClosure: true,
            includeBottomClosure
        });

        const jointShellThickness = Math.max(
            frontSegment?.shellThickness ?? 0.01,
            rightSegment?.shellThickness ?? 0.01
        );
        const jointShellOutset = Math.max(
            frontSegment?.shellOutset ?? 0.0,
            rightSegment?.shellOutset ?? 0.0
        );
        const jointCenterOutset = jointShellOutset + jointShellThickness * 0.5;
        const cornerInset = Math.max(0.0, jointCenterOutset * 0.5);
        specs.push({
            role: 'corner_joint_45',
            faceId: 'front',
            centerU: wallHalfWidth + cornerInset,
            centerV,
            widthMeters: Math.max(jointShellThickness * 2.0, jointCenterOutset * Math.SQRT2 + jointShellThickness),
            heightMeters,
            depthMeters: jointShellThickness,
            outsetMeters: cornerInset,
            yawDegrees: 45.0
        });
    } else {
        pushSimpleSkirtSurroundSegmentSpecs({
            specs,
            rolePrefix: 'front',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters,
            includeStartClosure: true,
            includeEndClosure: true,
            includeBottomClosure
        });
    }

    for (const spec of specs) {
        spec.geometryKind = 'ribbon';
        spec.ribbonPatternId = patternId;
        spec.ribbonPatternNormalIntensity = patternNormalIntensity;
    }
    return specs;
}

function buildEdgeBrickChainShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        EDGE_BRICK_CHAIN_PROPERTY_SPECS,
        EDGE_BRICK_CHAIN_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    if (targetWidth <= 0.01) return [];

    const wallHalfWidth = wall.widthMeters * 0.5;
    const spanStartU = wallHalfWidth - targetWidth;
    const spanEndU = spanStartU + targetWidth;
    const edgeTarget = normalizeEdgeBrickChainEdgeTarget(configuration.edgeTarget);
    const includeLeft = edgeTarget === EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT || edgeTarget === EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH;
    const includeRight = edgeTarget === EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT || edgeTarget === EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH;
    if (!includeLeft && !includeRight) return [];

    const brickHeight = clamp(configuration.brickHeight, 0.05, 1.0, EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT);
    const columnWidthMax = Math.max(0.06, targetWidth - 0.001);
    const columnWidth = clamp(brickHeight * 0.66, 0.06, columnWidthMax, Math.min(0.20, columnWidthMax));
    const depthMeters = clamp(brickHeight * EDGE_BRICK_CHAIN_DEPTH_SCALE_DEFAULT, 0.03, 0.18, 0.08);

    const startY = clamp(configuration.startY, 0.0, wall.heightMeters, EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT);
    const endY = clamp(configuration.endY, 0.0, wall.heightMeters, Math.min(wall.heightMeters, EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT));
    const rangeStartY = Math.min(startY, endY);
    const rangeEndY = Math.max(startY, endY);
    const rangeMeters = Math.max(0.0, rangeEndY - rangeStartY);
    if (rangeMeters <= 1e-6) return [];

    const snapToFit = configuration.snapToFit !== false;
    const courseHeights = buildEdgeBrickChainCourseHeights({
        rangeMeters,
        baseHeightMeters: brickHeight,
        snapToFit
    });
    if (!courseHeights.length) return [];

    const frontLeftCenterU = spanStartU + columnWidth * 0.5;
    const frontRightCenterU = spanEndU - columnWidth * 0.5;
    const rightCornerCenterU = columnWidth * 0.5;
    const rightFarCenterU = Math.max(columnWidth * 0.5, targetWidth - columnWidth * 0.5);

    const columns = [];
    if (includeLeft) {
        columns.push({
            rolePrefix: 'front_left',
            faceId: 'front',
            edgeColumn: 'left',
            centerU: Math.min(frontRightCenterU, frontLeftCenterU),
            miterStart45: false,
            miterEnd45: false
        });
    }
    if (includeRight) {
        columns.push({
            rolePrefix: 'front_right',
            faceId: 'front',
            edgeColumn: 'right',
            centerU: Math.max(frontLeftCenterU, frontRightCenterU),
            miterStart45: false,
            miterEnd45: mode === WALL_DECORATOR_MODE.CORNER
        });
    }
    if (mode === WALL_DECORATOR_MODE.CORNER) {
        if (includeRight) {
            columns.push({
                rolePrefix: 'right_corner',
                faceId: 'right',
                edgeColumn: 'right',
                centerU: rightCornerCenterU,
                miterStart45: true,
                miterEnd45: false
            });
        }
        if (includeLeft) {
            columns.push({
                rolePrefix: 'right_far',
                faceId: 'right',
                edgeColumn: 'left',
                centerU: rightFarCenterU,
                miterStart45: false,
                miterEnd45: false
            });
        }
    }

    const specs = [];
    let consumedY = 0.0;
    const wallHalfHeight = wall.heightMeters * 0.5;
    for (let courseIndex = 0; courseIndex < courseHeights.length; courseIndex += 1) {
        const courseHeight = Math.max(0.01, Number(courseHeights[courseIndex]) || 0.01);
        const centerYFromFloor = rangeStartY + consumedY + courseHeight * 0.5;
        const centerV = -wallHalfHeight + centerYFromFloor;
        for (const column of columns) {
            specs.push({
                role: `${column.rolePrefix}_course_${String(courseIndex).padStart(3, '0')}`,
                faceId: column.faceId,
                geometryKind: 'edge_brick_chain_course',
                edgeColumn: column.edgeColumn,
                centerU: column.centerU,
                centerV,
                widthMeters: columnWidth,
                heightMeters: courseHeight,
                depthMeters,
                outsetMeters: 0.0,
                miterStart45: column.miterStart45,
                miterEnd45: column.miterEnd45,
                edgeChainCourseIndex: courseIndex,
                edgeChainSnapToFit: snapToFit
            });
        }
        consumedY += courseHeight;
    }

    return specs;
}

function pushCurvedRingSegmentSpec({
    specs,
    role,
    faceId,
    startU,
    endU,
    centerV,
    diameterMeters,
    outsetMeters,
    miterStart45 = false,
    miterEnd45 = false
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const segmentWidth = Math.max(0.01, maxU - minU);
    const diameter = Math.max(0.2, Number(diameterMeters) || HALF_DOME_DIAMETER_METERS_DEFAULT);
    const radius = diameter * 0.5;

    out.push({
        role: String(role ?? 'curved_ring').trim() || 'curved_ring',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'curved_ring',
        centerU: minU + segmentWidth * 0.5,
        centerV: Number(centerV) || 0.0,
        widthMeters: segmentWidth,
        heightMeters: diameter,
        depthMeters: radius,
        outsetMeters: clamp(outsetMeters, 0.0, 0.5, HALF_DOME_OUTSET_METERS_DEFAULT),
        miterStart45: !!miterStart45,
        miterEnd45: !!miterEnd45
    });
}

function buildHalfDomeShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        HALF_DOME_PROPERTY_SPECS,
        HALF_DOME_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    const wallHalfWidth = wall.widthMeters * 0.5;
    const startU = wallHalfWidth - targetWidth;
    const endU = startU + targetWidth;

    const diameterMeters = clamp(
        configuration.diameterMeters,
        0.20,
        Math.min(wall.heightMeters, wall.widthMeters),
        HALF_DOME_DIAMETER_METERS_DEFAULT
    );
    const radiusMeters = diameterMeters * 0.5;
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        diameterMeters,
        configuration.nearEdgeOffsetMeters
    );
    const outsetMeters = clamp(configuration.outsetMeters, 0.0, 0.5, HALF_DOME_OUTSET_METERS_DEFAULT);

    const specs = [];

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushCurvedRingSegmentSpec({
            specs,
            role: 'curved_ring_front',
            faceId: 'front',
            startU,
            endU,
            centerV,
            diameterMeters,
            outsetMeters,
            miterStart45: false,
            miterEnd45: true
        });

        pushCurvedRingSegmentSpec({
            specs,
            role: 'curved_ring_right',
            faceId: 'right',
            startU: 0.0,
            endU: targetWidth,
            centerV,
            diameterMeters,
            outsetMeters,
            miterStart45: true,
            miterEnd45: false
        });
    } else {
        pushCurvedRingSegmentSpec({
            specs,
            role: 'curved_ring_front',
            faceId: 'front',
            startU,
            endU,
            centerV,
            diameterMeters,
            outsetMeters,
            miterStart45: false,
            miterEnd45: false
        });
    }

    return specs;
}

function pushAngledSupportProfileSegmentSpec({
    specs,
    role,
    faceId,
    startU,
    endU,
    centerV,
    offsetMeters,
    shiftMeters,
    returnHeightMeters,
    miterStart45 = false,
    miterEnd45 = false
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    const shift = Number(shiftMeters) || 0.0;
    const returnHeight = clamp(returnHeightMeters, 0.01, 4.0, ANGLED_SUPPORT_PROFILE_RETURN_HEIGHT_METERS_DEFAULT);
    const profileMinY = Math.min(0.0, shift);
    const profileMaxY = Math.max(returnHeight, returnHeight + shift);
    const profileHeightMeters = Math.max(0.01, profileMaxY - profileMinY);

    out.push({
        role: String(role ?? 'angled_support_profile').trim() || 'angled_support_profile',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'angled_support_profile',
        centerU: minU + widthMeters * 0.5,
        centerV: Number(centerV) || 0.0,
        widthMeters,
        heightMeters: profileHeightMeters,
        depthMeters: clamp(offsetMeters, 0.005, 4.0, ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT),
        profileOffsetMeters: clamp(offsetMeters, 0.005, 4.0, ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT),
        profileShiftMeters: shift,
        profileReturnHeightMeters: returnHeight,
        miterStart45: !!miterStart45,
        miterEnd45: !!miterEnd45
    });
}

function buildAngledSupportProfileShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        ANGLED_SUPPORT_PROFILE_PROPERTY_SPECS,
        ANGLED_SUPPORT_PROFILE_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    const wallHalfWidth = wall.widthMeters * 0.5;
    const startU = wallHalfWidth - targetWidth;
    const endU = startU + targetWidth;

    const offsetMeters = clamp(configuration.offset, 0.01, 1.5, ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT);
    const shiftMeters = clamp(configuration.shift, -1.0, 1.0, ANGLED_SUPPORT_PROFILE_SHIFT_METERS_DEFAULT);
    const returnHeightMeters = clamp(configuration.returnHeight, 0.01, 2.0, ANGLED_SUPPORT_PROFILE_RETURN_HEIGHT_METERS_DEFAULT);
    const profileMinY = Math.min(0.0, shiftMeters);
    const profileMaxY = Math.max(returnHeightMeters, returnHeightMeters + shiftMeters);
    const profileHeightMeters = Math.max(0.01, profileMaxY - profileMinY);
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        profileHeightMeters,
        NEAR_EDGE_OFFSET_METERS_DEFAULT
    );

    const specs = [];
    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushAngledSupportProfileSegmentSpec({
            specs,
            role: 'angled_support_front',
            faceId: 'front',
            startU,
            endU,
            centerV,
            offsetMeters,
            shiftMeters,
            returnHeightMeters,
            miterStart45: false,
            miterEnd45: true
        });
        pushAngledSupportProfileSegmentSpec({
            specs,
            role: 'angled_support_right',
            faceId: 'right',
            startU: 0.0,
            endU: targetWidth,
            centerV,
            offsetMeters,
            shiftMeters,
            returnHeightMeters,
            miterStart45: true,
            miterEnd45: false
        });
    } else {
        pushAngledSupportProfileSegmentSpec({
            specs,
            role: 'angled_support_front',
            faceId: 'front',
            startU,
            endU,
            centerV,
            offsetMeters,
            shiftMeters,
            returnHeightMeters
        });
    }

    return specs;
}

const SIMPLE_SKIRT_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.FACE,
    position: WALL_DECORATOR_POSITION.BOTTOM,
    configuration: Object.freeze({
        ...SIMPLE_SKIRT_CONFIGURATION_DEFAULTS
    }),
    materialSelection: WALL_DECORATOR_MATCH_WALL_MATERIAL_SELECTION,
    wallBase: Object.freeze({
        ...applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT),
        roughness: 0.85,
        normalStrength: 0.9
    }),
    tiling: Object.freeze({
        enabled: false,
        tileMeters: 2.0,
        tileMetersU: 2.0,
        tileMetersV: 2.0,
        uvEnabled: false,
        offsetU: 0.0,
        offsetV: 0.0,
        rotationDegrees: 0.0
    })
});

const RIBBON_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.FACE,
    position: WALL_DECORATOR_POSITION.BOTTOM,
    configuration: Object.freeze({
        ...RIBBON_CONFIGURATION_DEFAULTS
    }),
    materialSelection: WALL_DECORATOR_MATCH_WALL_MATERIAL_SELECTION,
    wallBase: Object.freeze({
        ...applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT),
        roughness: 0.85,
        normalStrength: 0.9
    }),
    tiling: Object.freeze({
        enabled: false,
        tileMeters: 2.0,
        tileMetersU: 2.0,
        tileMetersV: 2.0,
        uvEnabled: false,
        offsetU: 0.0,
        offsetV: 0.0,
        rotationDegrees: 0.0
    })
});

const EDGE_BRICK_CHAIN_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.FACE,
    position: WALL_DECORATOR_POSITION.BOTTOM,
    configuration: Object.freeze({
        ...EDGE_BRICK_CHAIN_CONFIGURATION_DEFAULTS
    }),
    materialSelection: WALL_DECORATOR_MATCH_WALL_MATERIAL_SELECTION,
    wallBase: Object.freeze({
        ...applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT),
        roughness: 0.85,
        normalStrength: 0.9
    }),
    tiling: Object.freeze({
        enabled: false,
        tileMeters: 2.0,
        tileMetersU: 2.0,
        tileMetersV: 2.0,
        uvEnabled: false,
        offsetU: 0.0,
        offsetV: 0.0,
        rotationDegrees: 0.0
    })
});

const HALF_DOME_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.FACE,
    position: WALL_DECORATOR_POSITION.BOTTOM,
    configuration: Object.freeze({
        ...HALF_DOME_CONFIGURATION_DEFAULTS
    }),
    materialSelection: WALL_DECORATOR_MATCH_WALL_MATERIAL_SELECTION,
    wallBase: Object.freeze({
        ...applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT),
        roughness: 0.85,
        normalStrength: 0.9
    }),
    tiling: Object.freeze({
        enabled: false,
        tileMeters: 2.0,
        tileMetersU: 2.0,
        tileMetersV: 2.0,
        uvEnabled: false,
        offsetU: 0.0,
        offsetV: 0.0,
        rotationDegrees: 0.0
    })
});

const ANGLED_SUPPORT_PROFILE_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.FACE,
    position: WALL_DECORATOR_POSITION.BOTTOM,
    configuration: Object.freeze({
        ...ANGLED_SUPPORT_PROFILE_CONFIGURATION_DEFAULTS
    }),
    materialSelection: WALL_DECORATOR_MATCH_WALL_MATERIAL_SELECTION,
    wallBase: Object.freeze({
        ...applyWallBaseTintStateToWallBase({}, WALL_BASE_TINT_STATE_DEFAULT),
        roughness: 0.85,
        normalStrength: 0.9
    }),
    tiling: Object.freeze({
        enabled: false,
        tileMeters: 2.0,
        tileMetersU: 2.0,
        tileMetersV: 2.0,
        uvEnabled: false,
        offsetU: 0.0,
        offsetV: 0.0,
        rotationDegrees: 0.0
    })
});

const WALL_DECORATOR_TYPE_CATALOG = Object.freeze([
    Object.freeze({
        id: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        label: 'Simple Skirt',
        description: 'Bottom-aligned facade strip with face or corner routing.',
        properties: SIMPLE_SKIRT_PROPERTY_SPECS,
        defaults: SIMPLE_SKIRT_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildSimpleSkirtShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.RIBBON,
        label: 'Ribbon',
        description: 'Skirt-style surround with pattern-driven normal-map relief.',
        properties: RIBBON_PROPERTY_SPECS,
        defaults: RIBBON_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildRibbonShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        label: 'Edge Brick Chain',
        description: 'Edge-only alternating brick courses with optional snap-to-fit range behavior.',
        properties: EDGE_BRICK_CHAIN_PROPERTY_SPECS,
        defaults: EDGE_BRICK_CHAIN_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildEdgeBrickChainShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.HALF_DOME,
        label: 'Curved Ring',
        description: 'Half-circle side profile swept along the facade span, with optional corner miter behavior.',
        properties: HALF_DOME_PROPERTY_SPECS,
        defaults: HALF_DOME_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildHalfDomeShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE,
        label: 'Angled Support Profile',
        description: 'Continuous angled support profile sweep with signed shift and 45-degree corner miters.',
        properties: ANGLED_SUPPORT_PROFILE_PROPERTY_SPECS,
        defaults: ANGLED_SUPPORT_PROFILE_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildAngledSupportProfileShapeSpecs({ state, wallSpec })
    })
]);

const WALL_DECORATOR_TYPE_BY_ID = new Map(WALL_DECORATOR_TYPE_CATALOG.map((entry) => [entry.id, entry]));
const WALL_DECORATOR_PRESET_CATALOG = Object.freeze([]);
const WALL_DECORATOR_PRESET_BY_ID = new Map(WALL_DECORATOR_PRESET_CATALOG.map((entry) => [entry.id, entry]));

function normalizeStateWithCatalogDefaults(value) {
    const src = value && typeof value === 'object' ? value : {};
    const decoratorId = normalizeDecoratorId(src.decoratorId, { allowNone: true });
    const entry = WALL_DECORATOR_TYPE_BY_ID.get(decoratorId) ?? null;
    const defaults = entry?.defaults ?? SIMPLE_SKIRT_DEFAULTS;
    const propertySpecs = Array.isArray(entry?.properties) ? entry.properties : [];
    const defaultConfiguration = defaults?.configuration ?? buildDefaultConfigurationFromPropertySpecs(propertySpecs);
    return {
        version: 1,
        decoratorId: entry?.id ?? WALL_DECORATOR_NONE_ID,
        whereToApply: normalizeWhereToApply(src.whereToApply ?? defaults.whereToApply),
        mode: normalizeMode(src.mode ?? defaults.mode),
        position: normalizePosition(src.position ?? defaults.position),
        configuration: normalizeDecoratorConfiguration(src.configuration ?? src.config, propertySpecs, defaultConfiguration),
        materialSelection: normalizeMaterialSelection(src.materialSelection ?? src.material, defaults.materialSelection),
        wallBase: normalizeWallBase(src.wallBase, defaults.wallBase),
        tiling: normalizeTiling(src.tiling, defaults.tiling)
    };
}

export function getWallDecoratorTypeEntries() {
    return WALL_DECORATOR_TYPE_CATALOG;
}

export function getWallDecoratorTypeOptions() {
    return WALL_DECORATOR_TYPE_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.description
    }));
}

export function getWallDecoratorTypeEntryById(value) {
    const id = normalizeDecoratorId(value, { allowNone: true });
    if (!id) return null;
    return WALL_DECORATOR_TYPE_BY_ID.get(id) ?? null;
}

export function getWallDecoratorTypePropertySpecsById(value) {
    const entry = getWallDecoratorTypeEntryById(value);
    if (!entry) return [];
    return Array.isArray(entry.properties) ? deepClone(entry.properties) : [];
}

export function getWallDecoratorPresetEntries() {
    return WALL_DECORATOR_PRESET_CATALOG;
}

export function getWallDecoratorPresetOptions() {
    return WALL_DECORATOR_PRESET_CATALOG.map((entry) => ({
        id: String(entry?.id ?? ''),
        label: String(entry?.label ?? entry?.id ?? ''),
        typeId: String(entry?.typeId ?? entry?.decoratorId ?? '')
    })).filter((entry) => !!entry.id);
}

export function getWallDecoratorPresetEntryById(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id) return null;
    return WALL_DECORATOR_PRESET_BY_ID.get(id) ?? null;
}

// Back-compat aliases: "catalog" currently maps to decorator types.
export function getWallDecoratorCatalogEntries() {
    return getWallDecoratorTypeEntries();
}

export function getWallDecoratorCatalogOptions() {
    return getWallDecoratorTypeOptions();
}

export function getWallDecoratorCatalogEntryById(value) {
    return getWallDecoratorTypeEntryById(value);
}

export function getDefaultWallDecoratorDebuggerState({ decoratorId = WALL_DECORATOR_NONE_ID } = {}) {
    const entry = getWallDecoratorTypeEntryById(decoratorId);
    if (!entry) {
        return normalizeStateWithCatalogDefaults({
            decoratorId: WALL_DECORATOR_NONE_ID
        });
    }
    return normalizeStateWithCatalogDefaults({
        decoratorId: entry.id,
        ...deepClone(entry.defaults ?? SIMPLE_SKIRT_DEFAULTS)
    });
}

export function sanitizeWallDecoratorDebuggerState(value) {
    return normalizeStateWithCatalogDefaults(value);
}

export function loadWallDecoratorCatalogEntry(state, decoratorId) {
    const current = sanitizeWallDecoratorDebuggerState(state);
    const entry = getWallDecoratorTypeEntryById(decoratorId) ?? getWallDecoratorTypeEntryById(current.decoratorId) ?? null;
    if (!entry) {
        return sanitizeWallDecoratorDebuggerState({
            ...current,
            decoratorId: WALL_DECORATOR_NONE_ID
        });
    }
    const defaults = entry.defaults ?? SIMPLE_SKIRT_DEFAULTS;
    return sanitizeWallDecoratorDebuggerState({
        ...current,
        decoratorId: entry.id,
        // Preserve placement controls when switching type so visual placement does not jump.
        whereToApply: current.whereToApply,
        mode: current.mode,
        position: current.position,
        configuration: deepClone(defaults.configuration ?? {}),
        materialSelection: deepClone(defaults.materialSelection),
        wallBase: deepClone(defaults.wallBase),
        tiling: deepClone(defaults.tiling)
    });
}

export function loadWallDecoratorPresetEntry(state, presetId) {
    const current = sanitizeWallDecoratorDebuggerState(state);
    const preset = getWallDecoratorPresetEntryById(presetId);
    if (!preset) return current;

    const presetState = preset?.state && typeof preset.state === 'object'
        ? deepClone(preset.state)
        : {};
    const typeId = normalizeDecoratorId(
        preset?.typeId ?? preset?.decoratorId ?? presetState?.decoratorId ?? current.decoratorId,
        { allowNone: true }
    );
    return sanitizeWallDecoratorDebuggerState({
        ...current,
        ...presetState,
        decoratorId: typeId
    });
}

export function buildWallDecoratorShapeSpecs(state, wallSpec) {
    const sanitized = sanitizeWallDecoratorDebuggerState(state);
    const entry = getWallDecoratorTypeEntryById(sanitized.decoratorId);
    if (!entry) return [];
    const createShapeSpecs = typeof entry?.createShapeSpecs === 'function' ? entry.createShapeSpecs : null;
    if (!createShapeSpecs) return [];
    const out = createShapeSpecs({
        state: sanitized,
        wallSpec: normalizeWallSpec(wallSpec)
    });
    return Array.isArray(out) ? deepClone(out) : [];
}
