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
    AWNING: 'awning',
    EDGE_BRICK_CHAIN: 'edge_brick_chain',
    CORNICE_BASIC_BLOCK: 'cornice_basic_block',
    CORNICE_ROUNDED: 'cornice_rounded'
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

const SIMPLE_SKIRT_OFFSET_SCALE_DEFAULT = 1.0;
const SIMPLE_SKIRT_OFFSET_METERS_PER_HEIGHT = 0.10;
const RIBBON_OFFSET_SCALE_DEFAULT = 1.0;
const RIBBON_OFFSET_METERS_PER_HEIGHT = 0.10;
const HALF_DOME_DIAMETER_METERS_DEFAULT = 0.10;
const HALF_DOME_OUTSET_METERS_DEFAULT = 0.0;
const ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT = 0.10;
const ANGLED_SUPPORT_PROFILE_HEIGHT_METERS_DEFAULT = 0.20;
const AWNING_PROJECTION_METERS_DEFAULT = 0.80;
const AWNING_FRONT_HEIGHT_METERS_DEFAULT = 0.30;
const AWNING_SLOPE_DEGREES_DEFAULT = 25.0;
const AWNING_ROD_RADIUS_METERS_DEFAULT = 0.015;
const AWNING_ROD_INSET_METERS_DEFAULT = 0.08;
const AWNING_ROD_FRONT_CLEARANCE_METERS = 0.005;
const AWNING_ROD_MATERIAL_ID_DEFAULT = 'metal_dark';
const NEAR_EDGE_OFFSET_METERS_DEFAULT = 0.10;
const FLAT_PANEL_THICKNESS_METERS = 0.005;
const RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT = 1.4;
const EDGE_BRICK_CHAIN_EDGE_TARGET = Object.freeze({
    LEFT: 'left',
    RIGHT: 'right',
    BOTH: 'both'
});
const CORNICE_BASIC_BLOCK_SPACING_MODE = Object.freeze({
    MATCH_BLOCK: 'match_block',
    FIXED: 'fixed'
});
const CORNICE_ROUNDED_CURVATURE = Object.freeze({
    CONVEX: 'convex',
    CONCAVE: 'concave'
});
const EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT = 0.10;
const EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT = 0.0;
const EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT = 3.5;
const EDGE_BRICK_CHAIN_DEPTH_SCALE_DEFAULT = 0.25;
const EDGE_BRICK_CHAIN_DEPTH_SCALE_MULTIPLIER_DEFAULT = 1.0;
const EDGE_BRICK_CHAIN_WIDTH_LONG_SCALE = 1.35;
const EDGE_BRICK_CHAIN_WIDTH_SHORT_SCALE = 0.70;
const WALL_DECORATOR_CATALOG_SECTION = Object.freeze({
    DECORATIONS: 'decorations',
    AWNING: 'awning',
    CORNICE: 'cornice'
});
const WALL_DECORATOR_CATALOG_SECTION_LABEL = Object.freeze({
    [WALL_DECORATOR_CATALOG_SECTION.DECORATIONS]: 'Decorations',
    [WALL_DECORATOR_CATALOG_SECTION.AWNING]: 'Awning',
    [WALL_DECORATOR_CATALOG_SECTION.CORNICE]: 'Cornice'
});
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
    if (raw === WALL_DECORATOR_ID.AWNING) return WALL_DECORATOR_ID.AWNING;
    if (raw === WALL_DECORATOR_ID.EDGE_BRICK_CHAIN) return WALL_DECORATOR_ID.EDGE_BRICK_CHAIN;
    if (raw === WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK) return WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK;
    if (raw === WALL_DECORATOR_ID.CORNICE_ROUNDED) return WALL_DECORATOR_ID.CORNICE_ROUNDED;
    if (raw === 'cornice_rounded_inverse') return WALL_DECORATOR_ID.CORNICE_ROUNDED;
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

function normalizeEdgeBrickChainEdgeTarget(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT) return EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT;
    if (raw === EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT) return EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT;
    return EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH;
}

function normalizeCorniceBasicBlockSpacingMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK) return CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK;
    return CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED;
}

function normalizeCorniceRoundedCurvature(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === CORNICE_ROUNDED_CURVATURE.CONCAVE) return CORNICE_ROUNDED_CURVATURE.CONCAVE;
    return CORNICE_ROUNDED_CURVATURE.CONVEX;
}

function normalizeDecoratorPropertyPicker(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'thumbnail') return 'thumbnail';
    return '';
}

function normalizeDecoratorPropertyControl(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'combobox') return 'combobox';
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
            spec.control = normalizeDecoratorPropertyControl(item?.control);
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
    const heightMeters = clamp(configuration?.heightMeters, 0.05, 5.0, 0.5);
    const offsetScale = clamp(configuration?.offsetScale, 0.1, 4.0, SIMPLE_SKIRT_OFFSET_SCALE_DEFAULT);
    return {
        heightMeters,
        offsetScale,
        offsetMeters: clamp(
            heightMeters * SIMPLE_SKIRT_OFFSET_METERS_PER_HEIGHT * offsetScale,
            0.005,
            2.0,
            0.05
        )
    };
}

function resolveRibbonSizingFromConfiguration(configuration) {
    const heightMeters = clamp(configuration?.heightMeters, 0.05, 5.0, 0.5);
    const offsetScale = clamp(configuration?.offsetScale, 0.1, 4.0, RIBBON_OFFSET_SCALE_DEFAULT);
    return {
        heightMeters,
        offsetScale,
        offsetMeters: clamp(
            heightMeters * RIBBON_OFFSET_METERS_PER_HEIGHT * offsetScale,
            0.005,
            2.0,
            0.05
        )
    };
}

function resolveCorniceBasicBlockSizingFromConfiguration(configuration) {
    const blockSizeMeters = clamp(configuration?.blockSizeMeters, 0.01, 2.0, 0.10);
    const spacingMode = normalizeCorniceBasicBlockSpacingMode(configuration?.spacingMode);
    const fixedSpacingMeters = clamp(configuration?.spacingMeters, 0.0, 2.0, 0.10);
    const spacingMeters = spacingMode === CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK
        ? blockSizeMeters * 2.0
        : fixedSpacingMeters;
    const frontBottomLiftScale = clamp(configuration?.frontBottomLiftScale, 0.0, 1.0, 0.0);
    return {
        blockSizeMeters,
        spacingMode,
        fixedSpacingMeters,
        spacingMeters: clamp(spacingMeters, 0.0, 2.0, 0.10),
        frontBottomLiftScale,
        frontBottomLiftMeters: clamp(blockSizeMeters * frontBottomLiftScale, 0.0, blockSizeMeters, 0.0)
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
    const heights = [];

    if (snapToFit) {
        const count = Math.max(1, Math.min(1024, Math.ceil(span / Math.max(1e-6, base))));
        const h = span / count;
        for (let i = 0; i < count; i += 1) heights.push(h);
        return heights;
    }

    let consumed = 0.0;
    let idx = 0;
    while (consumed < span - 1e-6 && idx < 1024) {
        const raw = Math.max(0.01, base);
        const remaining = Math.max(0.0, span - consumed);
        const h = Math.min(raw, remaining);
        if (h <= 1e-6) break;
        heights.push(h);
        consumed += h;
        idx += 1;
    }
    return heights;
}

function resolveCorniceBasicBlockLayout({
    spanMeters = 0.0,
    blockSizeMeters = 0.10,
    baseSpacingMeters = 0.10,
    snapToFit = true
} = {}) {
    const span = Math.max(0.0, Number(spanMeters) || 0.0);
    const blockRaw = Math.max(0.01, Number(blockSizeMeters) || 0.10);
    if (span <= 1e-6) {
        return {
            count: 0,
            blockSizeMeters: blockRaw,
            spacingMeters: 0.0
        };
    }

    const block = Math.min(blockRaw, span);
    if (span <= block + 1e-6) {
        return {
            count: 1,
            blockSizeMeters: block,
            spacingMeters: span
        };
    }

    // spacingMeters is center-to-center pitch, independent of block size.
    const baseSpacing = Math.max(1e-6, Number(baseSpacingMeters) || 0.10);
    const centerSpan = Math.max(0.0, span - block);
    const safeIntervalCount = Math.max(0, Math.floor((centerSpan / baseSpacing) + 1e-9));
    let count = snapToFit
        ? (safeIntervalCount + 1)
        : Math.floor(span / baseSpacing);
    count = Math.max(1, Math.min(4096, count));
    if (count <= 1) {
        return {
            count: 1,
            blockSizeMeters: block,
            spacingMeters: span
        };
    }

    const spacingMeters = snapToFit
        ? (centerSpan / (count - 1))
        : baseSpacing;
    return {
        count,
        blockSizeMeters: block,
        spacingMeters
    };
}

function pushCorniceBasicBlockFaceSpecs({
    specs,
    rolePrefix,
    faceId,
    startU,
    endU,
    centerV,
    blockSizeMeters,
    baseSpacingMeters,
    frontBottomLiftMeters = 0.0,
    snapToFit = true,
    anchorMode = 'min',
    geometryKind = 'cornice_block',
    extra = null
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const spanMeters = Math.max(0.0, maxU - minU);
    if (spanMeters <= 1e-6) return;

    const layout = resolveCorniceBasicBlockLayout({
        spanMeters,
        blockSizeMeters,
        baseSpacingMeters,
        snapToFit
    });
    const count = Math.max(0, Math.floor(Number(layout.count) || 0));
    if (count <= 0) return;

    const block = Math.max(0.01, Number(layout.blockSizeMeters) || 0.10);
    const spacing = Math.max(0.0, Number(layout.spacingMeters) || 0.0);
    const frontBottomLift = clamp(frontBottomLiftMeters, 0.0, block, 0.0);
    const anchor = String(anchorMode ?? '').trim().toLowerCase() === 'max' ? 'max' : 'min';
    const roleBase = String(rolePrefix ?? 'cornice').trim() || 'cornice';
    const face = String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front';
    const step = Math.max(1e-6, spacing);
    const centersSpan = Math.max(0.0, (count - 1) * step);
    const centeredInset = Math.max(0.0, (spanMeters - centersSpan) * 0.5);

    for (let i = 0; i < count; i += 1) {
        const centerU = anchor === 'max'
            ? maxU - centeredInset - i * step
            : minU + centeredInset + i * step;
        const spec = {
            role: `${roleBase}_block_${String(i).padStart(3, '0')}`,
            faceId: face,
            geometryKind: String(geometryKind ?? 'cornice_block').trim() || 'cornice_block',
            centerU,
            centerV: Number(centerV) || 0.0,
            widthMeters: block,
            heightMeters: block,
            depthMeters: block,
            outsetMeters: 0.0,
            corniceFrontBottomLiftMeters: frontBottomLift,
            corniceBlockIndex: i,
            corniceBlockCount: count,
            corniceBlockSizeMeters: block,
            corniceSpacingMeters: spacing,
            corniceSnapToFit: !!snapToFit
        };
        if (extra && typeof extra === 'object') {
            for (const [key, value] of Object.entries(extra)) spec[key] = value;
        }
        out.push(spec);
    }
}

function resolveEdgeBrickChainColumnSpan({
    anchorMode = 'min',
    anchorU = 0.0,
    widthMeters = 0.1
} = {}) {
    const width = Math.max(0.01, Number(widthMeters) || 0.1);
    const anchor = Number(anchorU) || 0.0;
    const mode = String(anchorMode ?? '').trim().toLowerCase();
    if (mode === 'max') {
        const maxU = anchor;
        const minU = maxU - width;
        return {
            minU,
            maxU,
            centerU: minU + width * 0.5
        };
    }
    const minU = anchor;
    const maxU = minU + width;
    return {
        minU,
        maxU,
        centerU: minU + width * 0.5
    };
}

function pushEdgeBrickChainCapSpec({
    specs,
    role,
    faceId,
    capSide,
    startU,
    endU,
    centerV,
    depthMeters,
    fullSpanStartU,
    fullSpanEndU,
    miterStart45 = false,
    miterEnd45 = false,
    edgeChainCourseIndex = 0,
    edgeChainSnapToFit = true
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    if (maxU - minU <= 1e-6) return;

    const fullMinU = Math.min(Number(fullSpanStartU) || 0.0, Number(fullSpanEndU) || 0.0);
    const fullMaxU = Math.max(Number(fullSpanStartU) || 0.0, Number(fullSpanEndU) || 0.0);
    const eps = 1e-6;
    const touchesStartEdge = Math.abs(minU - fullMinU) <= eps;
    const touchesEndEdge = Math.abs(maxU - fullMaxU) <= eps;
    const depth = clamp(depthMeters, 0.005, 4.0, 0.08);

    pushSimpleSkirtFlatCapSpec({
        specs: out,
        role,
        faceId,
        capSide,
        startU: minU,
        endU: maxU,
        centerV,
        offsetMeters: depth,
        cornerBridgeStartMeters: touchesStartEdge && miterStart45 ? depth : 0.0,
        cornerBridgeEndMeters: touchesEndEdge && miterEnd45 ? depth : 0.0
    });

    const cap = out[out.length - 1];
    if (!cap) return;
    cap.edgeChainCap = true;
    cap.edgeChainCourseIndex = Math.max(0, Math.floor(Number(edgeChainCourseIndex) || 0));
    cap.edgeChainSnapToFit = !!edgeChainSnapToFit;
}

function appendEdgeBrickChainCapsForColumn({
    specs,
    column,
    courseSpecs,
    snapToFit
}) {
    const out = Array.isArray(specs) ? specs : [];
    const courses = Array.isArray(courseSpecs) ? courseSpecs : [];
    if (!courses.length) return;

    const rolePrefix = String(column?.rolePrefix ?? 'edge').trim() || 'edge';
    const anchorMode = String(column?.anchorMode ?? 'min').trim().toLowerCase() === 'max' ? 'max' : 'min';

    const firstCourse = courses[0];
    const lastCourse = courses[courses.length - 1];
    const firstIndex = String(Math.max(0, Math.floor(Number(firstCourse.courseIndex) || 0))).padStart(3, '0');
    const lastIndex = String(Math.max(0, Math.floor(Number(lastCourse.courseIndex) || 0))).padStart(3, '0');
    pushEdgeBrickChainCapSpec({
        specs: out,
        role: `${rolePrefix}_course_${firstIndex}_cap_bottom_full`,
        faceId: firstCourse.faceId,
        capSide: 'bottom',
        startU: firstCourse.minU,
        endU: firstCourse.maxU,
        centerV: firstCourse.centerV - firstCourse.heightMeters * 0.5,
        depthMeters: firstCourse.depthMeters,
        fullSpanStartU: firstCourse.minU,
        fullSpanEndU: firstCourse.maxU,
        miterStart45: firstCourse.miterStart45 === true,
        miterEnd45: firstCourse.miterEnd45 === true,
        edgeChainCourseIndex: firstCourse.courseIndex,
        edgeChainSnapToFit: snapToFit
    });
    pushEdgeBrickChainCapSpec({
        specs: out,
        role: `${rolePrefix}_course_${lastIndex}_cap_top_full`,
        faceId: lastCourse.faceId,
        capSide: 'top',
        startU: lastCourse.minU,
        endU: lastCourse.maxU,
        centerV: lastCourse.centerV + lastCourse.heightMeters * 0.5,
        depthMeters: lastCourse.depthMeters,
        fullSpanStartU: lastCourse.minU,
        fullSpanEndU: lastCourse.maxU,
        miterStart45: lastCourse.miterStart45 === true,
        miterEnd45: lastCourse.miterEnd45 === true,
        edgeChainCourseIndex: lastCourse.courseIndex,
        edgeChainSnapToFit: snapToFit
    });

    for (let i = 0; i + 1 < courses.length; i += 1) {
        const lower = courses[i];
        const upper = courses[i + 1];
        const lowerWidth = Math.max(0.0, Number(lower.widthMeters) || 0.0);
        const upperWidth = Math.max(0.0, Number(upper.widthMeters) || 0.0);
        if (Math.abs(lowerWidth - upperWidth) <= 1e-6) continue;

        if (lowerWidth > upperWidth) {
            const seamStartU = anchorMode === 'max' ? lower.minU : upper.maxU;
            const seamEndU = anchorMode === 'max' ? upper.minU : lower.maxU;
            pushEdgeBrickChainCapSpec({
                specs: out,
                role: `${rolePrefix}_seam_${String(lower.courseIndex).padStart(3, '0')}_${String(upper.courseIndex).padStart(3, '0')}_cap_top`,
                faceId: lower.faceId,
                capSide: 'top',
                startU: seamStartU,
                endU: seamEndU,
                centerV: lower.centerV + lower.heightMeters * 0.5,
                depthMeters: lower.depthMeters,
                fullSpanStartU: lower.minU,
                fullSpanEndU: lower.maxU,
                miterStart45: lower.miterStart45 === true,
                miterEnd45: lower.miterEnd45 === true,
                edgeChainCourseIndex: lower.courseIndex,
                edgeChainSnapToFit: snapToFit
            });
            continue;
        }

        const seamStartU = anchorMode === 'max' ? upper.minU : lower.maxU;
        const seamEndU = anchorMode === 'max' ? lower.minU : upper.maxU;
        pushEdgeBrickChainCapSpec({
            specs: out,
            role: `${rolePrefix}_seam_${String(lower.courseIndex).padStart(3, '0')}_${String(upper.courseIndex).padStart(3, '0')}_cap_bottom`,
            faceId: upper.faceId,
            capSide: 'bottom',
            startU: seamStartU,
            endU: seamEndU,
            centerV: upper.centerV - upper.heightMeters * 0.5,
            depthMeters: upper.depthMeters,
            fullSpanStartU: upper.minU,
            fullSpanEndU: upper.maxU,
            miterStart45: upper.miterStart45 === true,
            miterEnd45: upper.miterEnd45 === true,
            edgeChainCourseIndex: upper.courseIndex,
            edgeChainSnapToFit: snapToFit
        });
    }
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

function pushSimpleSkirtFlatPanelSpec({
    specs,
    role,
    faceId,
    startU,
    endU,
    centerV,
    heightMeters,
    offsetMeters
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    out.push({
        role: String(role ?? 'front_main').trim() || 'front_main',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'flat_panel',
        centerU: minU + widthMeters * 0.5,
        centerV: Number(centerV) || 0.0,
        widthMeters,
        heightMeters: clamp(heightMeters, 0.01, 100.0, 0.2),
        depthMeters: FLAT_PANEL_THICKNESS_METERS,
        outsetMeters: clamp(offsetMeters, 0.005, 4.0, 0.05)
    });
}

function pushAngledSupportProfileSpec({
    specs,
    role,
    faceId,
    startU,
    endU,
    centerV,
    heightMeters,
    offsetMeters,
    topCapAngleDeg = 45.0,
    bottomCapAngleDeg = 45.0
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    const offset = clamp(offsetMeters, 0.005, 4.0, 0.05);
    const profileHeight = clamp(heightMeters, 0.01, 100.0, 0.2);
    out.push({
        role: String(role ?? 'angled_support').trim() || 'angled_support',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'angled_support_profile',
        centerU: minU + widthMeters * 0.5,
        centerV: Number(centerV) || 0.0,
        widthMeters,
        heightMeters: profileHeight,
        depthMeters: offset,
        outsetMeters: 0.0,
        profileOffsetMeters: offset,
        profileShiftMeters: 0.0,
        profileReturnHeightMeters: profileHeight,
        miterTopAngleDeg: clamp(topCapAngleDeg, 10.0, 80.0, 45.0),
        miterBottomAngleDeg: clamp(bottomCapAngleDeg, 10.0, 80.0, 45.0)
    });
}

function pushSimpleSkirtFlatCapSpec({
    specs,
    role,
    faceId,
    capSide,
    startU,
    endU,
    centerV,
    offsetMeters,
    cornerBridgeStartMeters = 0.0,
    cornerBridgeEndMeters = 0.0,
    wallEdgeYOffsetMeters = 0.0
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    const depthMeters = clamp(offsetMeters, 0.005, 4.0, 0.05);
    out.push({
        role: String(role ?? 'front_cap_top').trim() || 'front_cap_top',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'flat_panel_cap',
        capSide: String(capSide ?? '').toLowerCase() === 'bottom' ? 'bottom' : 'top',
        centerU: minU + widthMeters * 0.5,
        centerV: Number(centerV) || 0.0,
        widthMeters,
        heightMeters: depthMeters,
        depthMeters,
        outsetMeters: 0.0,
        cornerBridgeStartMeters: clamp(cornerBridgeStartMeters, 0.0, 4.0, 0.0),
        cornerBridgeEndMeters: clamp(cornerBridgeEndMeters, 0.0, 4.0, 0.0),
        wallEdgeYOffsetMeters: clamp(wallEdgeYOffsetMeters, -4.0, 4.0, 0.0)
    });
}

function pushSimpleSkirtFlatSideCapSpec({
    specs,
    role,
    faceId,
    centerU,
    centerV,
    heightMeters,
    offsetMeters,
    yawDegrees = 0.0,
    wallEdgeTopYOffsetMeters = 0.0,
    wallEdgeBottomYOffsetMeters = 0.0
}) {
    const out = Array.isArray(specs) ? specs : [];
    const depthMeters = clamp(offsetMeters, 0.005, 4.0, 0.05);
    const yaw = clamp(yawDegrees, -180.0, 180.0, 0.0);
    const wallEdgeFlip = Math.abs(Math.abs(yaw) - 180.0) <= 1e-6;
    out.push({
        role: String(role ?? 'front_cap_side_start').trim() || 'front_cap_side_start',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'flat_panel_side_cap',
        centerU: Number(centerU) || 0.0,
        centerV: Number(centerV) || 0.0,
        widthMeters: depthMeters,
        heightMeters: clamp(heightMeters, 0.01, 100.0, 0.2),
        depthMeters,
        outsetMeters: depthMeters * 0.5,
        yawDegrees: yaw,
        wallEdgeFlip,
        wallEdgeTopYOffsetMeters: clamp(wallEdgeTopYOffsetMeters, -4.0, 4.0, 0.0),
        wallEdgeBottomYOffsetMeters: clamp(wallEdgeBottomYOffsetMeters, -4.0, 4.0, 0.0)
    });
}

const SIMPLE_SKIRT_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'heightMeters',
        label: 'Height (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 2.0,
        step: 0.01,
        default: 0.50
    },
    {
        id: 'offsetScale',
        label: 'Offset scale',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.1,
        max: 4.0,
        step: 0.05,
        default: SIMPLE_SKIRT_OFFSET_SCALE_DEFAULT
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
        id: 'heightMeters',
        label: 'Height (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 2.0,
        step: 0.01,
        default: 0.50
    },
    {
        id: 'offsetScale',
        label: 'Offset scale',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.1,
        max: 4.0,
        step: 0.05,
        default: RIBBON_OFFSET_SCALE_DEFAULT
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
        id: 'depthScaleMultiplier',
        label: 'Offset scale',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.1,
        max: 3.0,
        step: 0.05,
        default: EDGE_BRICK_CHAIN_DEPTH_SCALE_MULTIPLIER_DEFAULT
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

const CORNICE_BASIC_BLOCK_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'blockSizeMeters',
        label: 'Block size (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.01,
        max: 0.50,
        step: 0.01,
        default: 0.10
    },
    {
        id: 'spacingMode',
        label: 'Spacing mode',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK,
        options: [
            { id: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK, label: 'Match block' },
            { id: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED, label: 'Fixed' }
        ]
    },
    {
        id: 'spacingMeters',
        label: 'Spacing (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 0.50,
        step: 0.01,
        default: 0.10
    },
    {
        id: 'frontBottomLiftScale',
        label: 'Front angle (x block)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 1.0,
        step: 0.05,
        default: 0.0
    },
    {
        id: 'snapToFit',
        label: 'Snap to fit',
        type: WALL_DECORATOR_PROPERTY_TYPE.BOOL,
        default: true
    }
]);

const CORNICE_BASIC_BLOCK_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(CORNICE_BASIC_BLOCK_PROPERTY_SPECS)
);

const CORNICE_ROUNDED_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'blockSizeMeters',
        label: 'Block size (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.01,
        max: 0.50,
        step: 0.01,
        default: 0.10
    },
    {
        id: 'spacingMode',
        label: 'Spacing mode',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK,
        options: [
            { id: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK, label: 'Match block' },
            { id: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED, label: 'Fixed' }
        ]
    },
    {
        id: 'spacingMeters',
        label: 'Spacing (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 0.50,
        step: 0.01,
        default: 0.10
    },
    {
        id: 'curvature',
        label: 'Curvature',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: CORNICE_ROUNDED_CURVATURE.CONVEX,
        options: [
            { id: CORNICE_ROUNDED_CURVATURE.CONVEX, label: 'Convex' },
            { id: CORNICE_ROUNDED_CURVATURE.CONCAVE, label: 'Concave' }
        ]
    },
    {
        id: 'snapToFit',
        label: 'Snap to fit',
        type: WALL_DECORATOR_PROPERTY_TYPE.BOOL,
        default: true
    }
]);

const CORNICE_ROUNDED_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(CORNICE_ROUNDED_PROPERTY_SPECS)
);

const HALF_DOME_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'diameterMeters',
        label: 'Diameter (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.01,
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
        id: 'height',
        label: 'Height (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 2.0,
        step: 0.01,
        default: ANGLED_SUPPORT_PROFILE_HEIGHT_METERS_DEFAULT
    },
    {
        id: 'topCapAngleDeg',
        label: 'Top cap angle (deg)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 10.0,
        max: 80.0,
        step: 1.0,
        default: 45.0
    },
    {
        id: 'bottomCapAngleDeg',
        label: 'Bottom cap angle (deg)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 10.0,
        max: 80.0,
        step: 1.0,
        default: 45.0
    }
]);

const ANGLED_SUPPORT_PROFILE_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(ANGLED_SUPPORT_PROFILE_PROPERTY_SPECS)
);

const AWNING_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'projectionMeters',
        label: 'Projection (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 3.0,
        step: 0.01,
        default: AWNING_PROJECTION_METERS_DEFAULT
    },
    {
        id: 'frontHeightMeters',
        label: 'Front height (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 2.0,
        step: 0.01,
        default: AWNING_FRONT_HEIGHT_METERS_DEFAULT
    },
    {
        id: 'slopeDegrees',
        label: 'Slope (deg)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 75.0,
        step: 1.0,
        default: AWNING_SLOPE_DEGREES_DEFAULT
    },
    {
        id: 'rodRadiusMeters',
        label: 'Support radius (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.005,
        max: 0.10,
        step: 0.001,
        default: AWNING_ROD_RADIUS_METERS_DEFAULT
    },
    {
        id: 'rodInsetMeters',
        label: 'Support inset (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        default: AWNING_ROD_INSET_METERS_DEFAULT
    },
    {
        id: 'rodMaterialId',
        label: 'Support material',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: AWNING_ROD_MATERIAL_ID_DEFAULT,
        control: 'combobox',
        options: [
            { id: AWNING_ROD_MATERIAL_ID_DEFAULT, label: 'Dark Metal' }
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

const AWNING_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(AWNING_PROPERTY_SPECS)
);

function pushAwningSlantedPlaneSpec({
    specs,
    role,
    faceId,
    startU,
    endU,
    wallTopV,
    frontTopV,
    projectionMeters
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    const wallEdgeV = Number(wallTopV) || 0.0;
    const frontEdgeV = Number(frontTopV) || 0.0;
    const projection = clamp(projectionMeters, 0.05, 3.0, AWNING_PROJECTION_METERS_DEFAULT);
    const dropMeters = Math.max(0.0, wallEdgeV - frontEdgeV);
    const slantedLength = Math.hypot(projection, dropMeters);
    out.push({
        role: String(role ?? 'awning_slanted').trim() || 'awning_slanted',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'awning_slanted_plane',
        centerU: minU + widthMeters * 0.5,
        centerV: (wallEdgeV + frontEdgeV) * 0.5,
        widthMeters,
        heightMeters: Math.max(0.01, slantedLength),
        depthMeters: projection,
        outsetMeters: projection * 0.5,
        awningProjectionMeters: projection,
        awningSlopeDropMeters: dropMeters
    });
}

function pushAwningFrontQuadSpec({
    specs,
    role,
    faceId,
    startU,
    endU,
    frontTopV,
    frontBottomV,
    projectionMeters
}) {
    const out = Array.isArray(specs) ? specs : [];
    const minU = Math.min(Number(startU) || 0.0, Number(endU) || 0.0);
    const maxU = Math.max(Number(startU) || 0.0, Number(endU) || 0.0);
    const widthMeters = Math.max(0.01, maxU - minU);
    const topV = Number(frontTopV) || 0.0;
    const bottomV = Number(frontBottomV) || 0.0;
    const frontHeightMeters = Math.max(0.01, topV - bottomV);
    const projection = clamp(projectionMeters, 0.05, 3.0, AWNING_PROJECTION_METERS_DEFAULT);
    out.push({
        role: String(role ?? 'awning_front').trim() || 'awning_front',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'awning_front_quad',
        centerU: minU + widthMeters * 0.5,
        centerV: (topV + bottomV) * 0.5,
        widthMeters,
        heightMeters: frontHeightMeters,
        depthMeters: FLAT_PANEL_THICKNESS_METERS,
        outsetMeters: projection
    });
}

function pushAwningSupportRodSpec({
    specs,
    role,
    faceId,
    rodU,
    wallAnchorV,
    frontAnchorV,
    projectionMeters,
    rodRadiusMeters
}) {
    const out = Array.isArray(specs) ? specs : [];
    const projection = clamp(projectionMeters, 0.05, 3.0, AWNING_PROJECTION_METERS_DEFAULT);
    const rodFrontOutsetMeters = Math.max(0.0, projection - AWNING_ROD_FRONT_CLEARANCE_METERS);
    const startV = Number(wallAnchorV) || 0.0;
    const endV = Number(frontAnchorV) || 0.0;
    const centerV = (startV + endV) * 0.5;
    const rodRadius = clamp(rodRadiusMeters, 0.005, 0.10, AWNING_ROD_RADIUS_METERS_DEFAULT);
    out.push({
        role: String(role ?? 'awning_rod').trim() || 'awning_rod',
        faceId: String(faceId ?? '').toLowerCase() === 'right' ? 'right' : 'front',
        geometryKind: 'awning_support_rod',
        centerU: Number(rodU) || 0.0,
        centerV,
        widthMeters: rodRadius * 2.0,
        heightMeters: Math.max(0.01, Math.abs(endV - startV)),
        depthMeters: Math.max(0.005, rodFrontOutsetMeters),
        outsetMeters: rodFrontOutsetMeters * 0.5,
        rodRadiusMeters: rodRadius,
        rodStartU: Number(rodU) || 0.0,
        rodStartV: startV,
        rodStartOutsetMeters: 0.0,
        rodEndU: Number(rodU) || 0.0,
        rodEndV: endV,
        rodEndOutsetMeters: rodFrontOutsetMeters
    });
}

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

    const specs = [];
    const frontStartU = startU;
    const frontEndU = startU + targetWidth;
    const capTopCenterV = centerV + heightMeters * 0.5;
    const capBottomCenterV = centerV - heightMeters * 0.5;
    const includeTopCap = position !== WALL_DECORATOR_POSITION.TOP;
    const includeBottomCap = position !== WALL_DECORATOR_POSITION.BOTTOM;

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        // Keep a simple flat strip: in corner mode each face reaches +offset towards the corner.
        pushSimpleSkirtFlatPanelSpec({
            specs,
            role: 'front_main',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU + offsetMeters,
            centerV,
            heightMeters,
            offsetMeters
        });
        pushSimpleSkirtFlatPanelSpec({
            specs,
            role: 'right_main',
            faceId: 'right',
            startU: -offsetMeters,
            endU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters
        });
        if (includeTopCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_top',
                faceId: 'front',
                capSide: 'top',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capTopCenterV,
                offsetMeters,
                cornerBridgeEndMeters: offsetMeters
            });
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'right_cap_top',
                faceId: 'right',
                capSide: 'top',
                startU: 0.0,
                endU: targetWidth,
                centerV: capTopCenterV,
                offsetMeters,
                cornerBridgeStartMeters: offsetMeters
            });
        }
        if (includeBottomCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_bottom',
                faceId: 'front',
                capSide: 'bottom',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capBottomCenterV,
                offsetMeters,
                cornerBridgeEndMeters: offsetMeters
            });
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'right_cap_bottom',
                faceId: 'right',
                capSide: 'bottom',
                startU: 0.0,
                endU: targetWidth,
                centerV: capBottomCenterV,
                offsetMeters,
                cornerBridgeStartMeters: offsetMeters
            });
        }
        // Side caps are edge-driven: only the non-corner edge on each segment gets a side cap.
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'front_cap_side_start',
            faceId: 'front',
            centerU: frontStartU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 180.0
        });
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'right_cap_side_end',
            faceId: 'right',
            centerU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 0.0
        });
    } else {
        pushSimpleSkirtFlatPanelSpec({
            specs,
            role: 'front_main',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters
        });
        if (includeTopCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_top',
                faceId: 'front',
                capSide: 'top',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capTopCenterV,
                offsetMeters
            });
        }
        if (includeBottomCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_bottom',
                faceId: 'front',
                capSide: 'bottom',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capBottomCenterV,
                offsetMeters
            });
        }
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'front_cap_side_start',
            faceId: 'front',
            centerU: frontStartU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 180.0
        });
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'front_cap_side_end',
            faceId: 'front',
            centerU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 0.0
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
    const includeTopCap = position !== WALL_DECORATOR_POSITION.TOP;
    const includeBottomCap = position !== WALL_DECORATOR_POSITION.BOTTOM;
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
    const capTopCenterV = centerV + heightMeters * 0.5;
    const capBottomCenterV = centerV - heightMeters * 0.5;

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushSimpleSkirtFlatPanelSpec({
            specs,
            role: 'front_main',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU + offsetMeters,
            centerV,
            heightMeters,
            offsetMeters
        });
        pushSimpleSkirtFlatPanelSpec({
            specs,
            role: 'right_main',
            faceId: 'right',
            startU: -offsetMeters,
            endU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters
        });
        if (includeTopCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_top',
                faceId: 'front',
                capSide: 'top',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capTopCenterV,
                offsetMeters,
                cornerBridgeEndMeters: offsetMeters
            });
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'right_cap_top',
                faceId: 'right',
                capSide: 'top',
                startU: 0.0,
                endU: targetWidth,
                centerV: capTopCenterV,
                offsetMeters,
                cornerBridgeStartMeters: offsetMeters
            });
        }
        if (includeBottomCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_bottom',
                faceId: 'front',
                capSide: 'bottom',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capBottomCenterV,
                offsetMeters,
                cornerBridgeEndMeters: offsetMeters
            });
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'right_cap_bottom',
                faceId: 'right',
                capSide: 'bottom',
                startU: 0.0,
                endU: targetWidth,
                centerV: capBottomCenterV,
                offsetMeters,
                cornerBridgeStartMeters: offsetMeters
            });
        }
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'front_cap_side_start',
            faceId: 'front',
            centerU: frontStartU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 180.0
        });
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'right_cap_side_end',
            faceId: 'right',
            centerU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 0.0
        });
    } else {
        pushSimpleSkirtFlatPanelSpec({
            specs,
            role: 'front_main',
            faceId: 'front',
            startU: frontStartU,
            endU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters
        });
        if (includeTopCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_top',
                faceId: 'front',
                capSide: 'top',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capTopCenterV,
                offsetMeters
            });
        }
        if (includeBottomCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'front_cap_bottom',
                faceId: 'front',
                capSide: 'bottom',
                startU: frontStartU,
                endU: frontEndU,
                centerV: capBottomCenterV,
                offsetMeters
            });
        }
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'front_cap_side_start',
            faceId: 'front',
            centerU: frontStartU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 180.0
        });
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'front_cap_side_end',
            faceId: 'front',
            centerU: frontEndU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 0.0
        });
    }

    for (const spec of specs) {
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
    const baseColumnWidth = clamp(brickHeight * 0.66, 0.06, columnWidthMax, Math.min(0.20, columnWidthMax));
    const longColumnWidth = clamp(baseColumnWidth * EDGE_BRICK_CHAIN_WIDTH_LONG_SCALE, 0.04, columnWidthMax, baseColumnWidth);
    const shortColumnWidth = clamp(baseColumnWidth * EDGE_BRICK_CHAIN_WIDTH_SHORT_SCALE, 0.03, columnWidthMax, baseColumnWidth);
    const depthScaleMultiplier = clamp(
        configuration.depthScaleMultiplier,
        0.1,
        3.0,
        EDGE_BRICK_CHAIN_DEPTH_SCALE_MULTIPLIER_DEFAULT
    );
    const baseDepthMeters = clamp(
        brickHeight * EDGE_BRICK_CHAIN_DEPTH_SCALE_DEFAULT * depthScaleMultiplier,
        0.015,
        0.30,
        0.08
    );

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

    const columns = [];
    if (includeLeft) {
        columns.push({
            rolePrefix: 'front_left',
            faceId: 'front',
            edgeColumn: 'left',
            anchorMode: 'min',
            anchorU: spanStartU,
            miterStart45: false,
            miterEnd45: false
        });
    }
    if (includeRight) {
        columns.push({
            rolePrefix: 'front_right',
            faceId: 'front',
            edgeColumn: 'right',
            anchorMode: 'max',
            anchorU: spanEndU,
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
                anchorMode: 'min',
                anchorU: 0.0,
                miterStart45: true,
                miterEnd45: false
            });
        }
        if (includeLeft) {
            columns.push({
                rolePrefix: 'right_far',
                faceId: 'right',
                edgeColumn: 'left',
                anchorMode: 'max',
                anchorU: targetWidth,
                miterStart45: false,
                miterEnd45: false
            });
        }
    }

    const specs = [];
    const wallHalfHeight = wall.heightMeters * 0.5;
    const verticalCourses = [];
    let consumedY = 0.0;
    for (let courseIndex = 0; courseIndex < courseHeights.length; courseIndex += 1) {
        const courseHeight = Math.max(0.01, Number(courseHeights[courseIndex]) || 0.01);
        const widthMeters = (courseIndex % 2 === 0) ? longColumnWidth : shortColumnWidth;
        const centerYFromFloor = rangeStartY + consumedY + courseHeight * 0.5;
        verticalCourses.push({
            courseIndex,
            centerV: -wallHalfHeight + centerYFromFloor,
            widthMeters,
            heightMeters: courseHeight
        });
        consumedY += courseHeight;
    }

    for (const column of columns) {
        const columnCourseSpecs = [];
        for (const course of verticalCourses) {
            const span = resolveEdgeBrickChainColumnSpan({
                anchorMode: column.anchorMode,
                anchorU: column.anchorU,
                widthMeters: course.widthMeters
            });
            const courseSpec = {
                role: `${column.rolePrefix}_course_${String(course.courseIndex).padStart(3, '0')}`,
                faceId: column.faceId,
                geometryKind: 'edge_brick_chain_course',
                edgeColumn: column.edgeColumn,
                centerU: span.centerU,
                centerV: course.centerV,
                widthMeters: course.widthMeters,
                heightMeters: course.heightMeters,
                depthMeters: baseDepthMeters,
                outsetMeters: 0.0,
                miterStart45: column.miterStart45,
                miterEnd45: column.miterEnd45,
                edgeChainRemoveTopFace: true,
                edgeChainRemoveBottomFace: true,
                edgeChainRemoveStartFace: column.miterStart45 === true,
                edgeChainRemoveEndFace: column.miterEnd45 === true,
                edgeChainRemoveWallFace: true,
                edgeChainRemoveOuterFace: false,
                edgeChainCourseIndex: course.courseIndex,
                edgeChainSnapToFit: snapToFit
            };
            specs.push(courseSpec);
            columnCourseSpecs.push({
                ...courseSpec,
                courseIndex: course.courseIndex,
                minU: span.minU,
                maxU: span.maxU
            });
        }
        appendEdgeBrickChainCapsForColumn({
            specs,
            column,
            courseSpecs: columnCourseSpecs,
            snapToFit
        });
    }

    return specs;
}

function buildCorniceBasicBlockShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        CORNICE_BASIC_BLOCK_PROPERTY_SPECS,
        CORNICE_BASIC_BLOCK_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    if (targetWidth <= 0.01) return [];

    const wallHalfWidth = wall.widthMeters * 0.5;
    const spanStartU = wallHalfWidth - targetWidth;
    const spanEndU = spanStartU + targetWidth;
    const sizing = resolveCorniceBasicBlockSizingFromConfiguration(configuration);
    const blockSizeMeters = clamp(sizing.blockSizeMeters, 0.01, wall.heightMeters, 0.10);
    const spacingMeters = clamp(sizing.spacingMeters, 0.0, 2.0, 0.10);
    const frontBottomLiftMeters = clamp(sizing.frontBottomLiftMeters, 0.0, blockSizeMeters, 0.0);
    const snapToFit = configuration.snapToFit !== false;
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        blockSizeMeters,
        NEAR_EDGE_OFFSET_METERS_DEFAULT
    );

    const specs = [];
    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushCorniceBasicBlockFaceSpecs({
            specs,
            rolePrefix: 'cornice_front',
            faceId: 'front',
            startU: spanStartU,
            endU: spanEndU,
            centerV,
            blockSizeMeters,
            baseSpacingMeters: spacingMeters,
            frontBottomLiftMeters,
            snapToFit,
            anchorMode: 'max'
        });
        pushCorniceBasicBlockFaceSpecs({
            specs,
            rolePrefix: 'cornice_right',
            faceId: 'right',
            startU: 0.0,
            endU: targetWidth,
            centerV,
            blockSizeMeters,
            baseSpacingMeters: spacingMeters,
            frontBottomLiftMeters,
            snapToFit,
            anchorMode: 'min'
        });
    } else {
        pushCorniceBasicBlockFaceSpecs({
            specs,
            rolePrefix: 'cornice_front',
            faceId: 'front',
            startU: spanStartU,
            endU: spanEndU,
            centerV,
            blockSizeMeters,
            baseSpacingMeters: spacingMeters,
            frontBottomLiftMeters,
            snapToFit,
            anchorMode: 'min'
        });
    }

    return specs;
}

function buildCorniceRoundedShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        CORNICE_ROUNDED_PROPERTY_SPECS,
        CORNICE_ROUNDED_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    if (targetWidth <= 0.01) return [];

    const wallHalfWidth = wall.widthMeters * 0.5;
    const spanStartU = wallHalfWidth - targetWidth;
    const spanEndU = spanStartU + targetWidth;
    const sizing = resolveCorniceBasicBlockSizingFromConfiguration({
        blockSizeMeters: configuration.blockSizeMeters,
        spacingMode: configuration.spacingMode,
        spacingMeters: configuration.spacingMeters,
        frontBottomLiftScale: 0.0
    });
    const blockSizeMeters = clamp(sizing.blockSizeMeters, 0.01, wall.heightMeters, 0.10);
    const spacingMeters = clamp(sizing.spacingMeters, 0.0, 2.0, 0.10);
    const snapToFit = configuration.snapToFit !== false;
    const curvature = normalizeCorniceRoundedCurvature(configuration?.curvature);
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        blockSizeMeters,
        NEAR_EDGE_OFFSET_METERS_DEFAULT
    );

    const specs = [];
    const roundedExtra = {
        corniceRoundedCurvature: curvature
    };
    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushCorniceBasicBlockFaceSpecs({
            specs,
            rolePrefix: 'cornice_rounded_front',
            faceId: 'front',
            startU: spanStartU,
            endU: spanEndU,
            centerV,
            blockSizeMeters,
            baseSpacingMeters: spacingMeters,
            frontBottomLiftMeters: 0.0,
            snapToFit,
            anchorMode: 'max',
            geometryKind: 'cornice_rounded_block',
            extra: roundedExtra
        });
        pushCorniceBasicBlockFaceSpecs({
            specs,
            rolePrefix: 'cornice_rounded_right',
            faceId: 'right',
            startU: 0.0,
            endU: targetWidth,
            centerV,
            blockSizeMeters,
            baseSpacingMeters: spacingMeters,
            frontBottomLiftMeters: 0.0,
            snapToFit,
            anchorMode: 'min',
            geometryKind: 'cornice_rounded_block',
            extra: roundedExtra
        });
    } else {
        pushCorniceBasicBlockFaceSpecs({
            specs,
            rolePrefix: 'cornice_rounded_front',
            faceId: 'front',
            startU: spanStartU,
            endU: spanEndU,
            centerV,
            blockSizeMeters,
            baseSpacingMeters: spacingMeters,
            frontBottomLiftMeters: 0.0,
            snapToFit,
            anchorMode: 'min',
            geometryKind: 'cornice_rounded_block',
            extra: roundedExtra
        });
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
    const diameter = Math.max(0.01, Number(diameterMeters) || HALF_DOME_DIAMETER_METERS_DEFAULT);
    const radius = diameter * 0.5;
    const longitudinalSegments = Math.max(8, Math.min(4096, Math.ceil(segmentWidth / Math.max(1e-4, diameter * 0.25))));

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
        longitudinalSegments,
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
        0.01,
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
    const heightMeters = clamp(configuration.height, 0.05, 2.0, ANGLED_SUPPORT_PROFILE_HEIGHT_METERS_DEFAULT);
    const topCapAngleDeg = clamp(configuration.topCapAngleDeg, 10.0, 80.0, 45.0);
    const bottomCapAngleDeg = clamp(configuration.bottomCapAngleDeg, 10.0, 80.0, 45.0);
    const topCapWallEdgeYOffsetMeters = clamp(
        offsetMeters * Math.tan(topCapAngleDeg * Math.PI / 180.0),
        -2.0,
        2.0,
        0.0
    );
    const bottomCapWallEdgeYOffsetMeters = clamp(
        -offsetMeters * Math.tan(bottomCapAngleDeg * Math.PI / 180.0),
        -2.0,
        2.0,
        0.0
    );
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        heightMeters,
        NEAR_EDGE_OFFSET_METERS_DEFAULT
    );
    const includeTopCap = position !== WALL_DECORATOR_POSITION.TOP;
    const includeBottomCap = position !== WALL_DECORATOR_POSITION.BOTTOM;
    const capTopCenterV = centerV + heightMeters * 0.5;
    const capBottomCenterV = centerV - heightMeters * 0.5;

    const specs = [];
    if (mode === WALL_DECORATOR_MODE.CORNER) {
        pushAngledSupportProfileSpec({
            specs,
            role: 'angled_support_front',
            faceId: 'front',
            startU,
            endU: endU + offsetMeters,
            centerV,
            heightMeters,
            offsetMeters,
            topCapAngleDeg,
            bottomCapAngleDeg
        });
        pushAngledSupportProfileSpec({
            specs,
            role: 'angled_support_right',
            faceId: 'right',
            startU: -offsetMeters,
            endU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters,
            topCapAngleDeg,
            bottomCapAngleDeg
        });
        if (includeTopCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'angled_support_front_cap_top',
                faceId: 'front',
                capSide: 'top',
                startU,
                endU,
                centerV: capTopCenterV,
                offsetMeters,
                cornerBridgeEndMeters: offsetMeters,
                wallEdgeYOffsetMeters: topCapWallEdgeYOffsetMeters
            });
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'angled_support_right_cap_top',
                faceId: 'right',
                capSide: 'top',
                startU: 0.0,
                endU: targetWidth,
                centerV: capTopCenterV,
                offsetMeters,
                cornerBridgeStartMeters: offsetMeters,
                wallEdgeYOffsetMeters: topCapWallEdgeYOffsetMeters
            });
        }
        if (includeBottomCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'angled_support_front_cap_bottom',
                faceId: 'front',
                capSide: 'bottom',
                startU,
                endU,
                centerV: capBottomCenterV,
                offsetMeters,
                cornerBridgeEndMeters: offsetMeters,
                wallEdgeYOffsetMeters: bottomCapWallEdgeYOffsetMeters
            });
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'angled_support_right_cap_bottom',
                faceId: 'right',
                capSide: 'bottom',
                startU: 0.0,
                endU: targetWidth,
                centerV: capBottomCenterV,
                offsetMeters,
                cornerBridgeStartMeters: offsetMeters,
                wallEdgeYOffsetMeters: bottomCapWallEdgeYOffsetMeters
            });
        }
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'angled_support_front_cap_side_start',
            faceId: 'front',
            centerU: startU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 180.0,
            wallEdgeTopYOffsetMeters: topCapWallEdgeYOffsetMeters,
            wallEdgeBottomYOffsetMeters: bottomCapWallEdgeYOffsetMeters
        });
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'angled_support_right_cap_side_end',
            faceId: 'right',
            centerU: targetWidth,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 0.0,
            wallEdgeTopYOffsetMeters: topCapWallEdgeYOffsetMeters,
            wallEdgeBottomYOffsetMeters: bottomCapWallEdgeYOffsetMeters
        });
    } else {
        pushAngledSupportProfileSpec({
            specs,
            role: 'angled_support_front',
            faceId: 'front',
            startU,
            endU,
            centerV,
            heightMeters,
            offsetMeters,
            topCapAngleDeg,
            bottomCapAngleDeg
        });
        if (includeTopCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'angled_support_front_cap_top',
                faceId: 'front',
                capSide: 'top',
                startU,
                endU,
                centerV: capTopCenterV,
                offsetMeters,
                wallEdgeYOffsetMeters: topCapWallEdgeYOffsetMeters
            });
        }
        if (includeBottomCap) {
            pushSimpleSkirtFlatCapSpec({
                specs,
                role: 'angled_support_front_cap_bottom',
                faceId: 'front',
                capSide: 'bottom',
                startU,
                endU,
                centerV: capBottomCenterV,
                offsetMeters,
                wallEdgeYOffsetMeters: bottomCapWallEdgeYOffsetMeters
            });
        }
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'angled_support_front_cap_side_start',
            faceId: 'front',
            centerU: startU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 180.0,
            wallEdgeTopYOffsetMeters: topCapWallEdgeYOffsetMeters,
            wallEdgeBottomYOffsetMeters: bottomCapWallEdgeYOffsetMeters
        });
        pushSimpleSkirtFlatSideCapSpec({
            specs,
            role: 'angled_support_front_cap_side_end',
            faceId: 'front',
            centerU: endU,
            centerV,
            heightMeters,
            offsetMeters,
            yawDegrees: 0.0,
            wallEdgeTopYOffsetMeters: topCapWallEdgeYOffsetMeters,
            wallEdgeBottomYOffsetMeters: bottomCapWallEdgeYOffsetMeters
        });
    }

    return specs;
}

function buildAwningShapeSpecs({ state, wallSpec }) {
    const whereToApply = normalizeWhereToApply(state?.whereToApply);
    const mode = normalizeMode(state?.mode);
    const position = normalizePosition(state?.position);
    const wall = normalizeWallSpec(wallSpec);
    const configuration = normalizeDecoratorConfiguration(
        state?.configuration,
        AWNING_PROPERTY_SPECS,
        AWNING_CONFIGURATION_DEFAULTS
    );

    const targetWidth = whereToApply === WALL_DECORATOR_WHERE_TO_APPLY.HALF
        ? wall.widthMeters * 0.5
        : wall.widthMeters;
    if (targetWidth <= 0.01) return [];

    const wallHalfWidth = wall.widthMeters * 0.5;
    const startU = wallHalfWidth - targetWidth;
    const endU = startU + targetWidth;

    const projectionMeters = clamp(
        configuration.projectionMeters,
        0.05,
        3.0,
        AWNING_PROJECTION_METERS_DEFAULT
    );
    const frontHeightMeters = clamp(
        configuration.frontHeightMeters,
        0.05,
        Math.min(wall.heightMeters, 2.0),
        AWNING_FRONT_HEIGHT_METERS_DEFAULT
    );
    const slopeDegrees = clamp(
        configuration.slopeDegrees,
        0.0,
        75.0,
        AWNING_SLOPE_DEGREES_DEFAULT
    );
    const slopeDropMeters = projectionMeters * Math.tan(slopeDegrees * Math.PI / 180.0);
    const decoratorHeightMeters = Math.max(0.05, frontHeightMeters + slopeDropMeters);
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        decoratorHeightMeters,
        configuration.nearEdgeOffsetMeters
    );
    const wallTopV = centerV + decoratorHeightMeters * 0.5;
    const frontTopV = wallTopV - slopeDropMeters;
    const frontBottomV = frontTopV - frontHeightMeters;
    const rodRadiusMeters = clamp(
        configuration.rodRadiusMeters,
        0.005,
        0.10,
        AWNING_ROD_RADIUS_METERS_DEFAULT
    );

    const specs = [];
    const addFaceAwning = ({
        rolePrefix,
        faceId,
        segmentStartU,
        segmentEndU,
        addStartRod = false,
        addEndRod = false
    }) => {
        const minU = Math.min(Number(segmentStartU) || 0.0, Number(segmentEndU) || 0.0);
        const maxU = Math.max(Number(segmentStartU) || 0.0, Number(segmentEndU) || 0.0);
        const segmentWidthMeters = Math.max(0.01, maxU - minU);
        const rodInsetMeters = clamp(
            configuration.rodInsetMeters,
            0.0,
            Math.max(0.0, segmentWidthMeters * 0.5 - 0.001),
            AWNING_ROD_INSET_METERS_DEFAULT
        );

        pushAwningSlantedPlaneSpec({
            specs,
            role: `${rolePrefix}_slanted`,
            faceId,
            startU: minU,
            endU: maxU,
            wallTopV,
            frontTopV,
            projectionMeters
        });
        pushAwningFrontQuadSpec({
            specs,
            role: `${rolePrefix}_front`,
            faceId,
            startU: minU,
            endU: maxU,
            frontTopV,
            frontBottomV,
            projectionMeters
        });

        // Keep rod top tangent to the slanted/front junction: center sits at seam - radius.
        const supportAnchorV = frontTopV - rodRadiusMeters;
        const startRodU = minU + rodInsetMeters;
        const endRodU = maxU - rodInsetMeters;

        if (addStartRod) {
            pushAwningSupportRodSpec({
                specs,
                role: `${rolePrefix}_rod_start`,
                faceId,
                rodU: startRodU,
                wallAnchorV: supportAnchorV,
                frontAnchorV: supportAnchorV,
                projectionMeters,
                rodRadiusMeters
            });
        }
        if (addEndRod) {
            pushAwningSupportRodSpec({
                specs,
                role: `${rolePrefix}_rod_end`,
                faceId,
                rodU: endRodU,
                wallAnchorV: supportAnchorV,
                frontAnchorV: supportAnchorV,
                projectionMeters,
                rodRadiusMeters
            });
        }
    };

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        addFaceAwning({
            rolePrefix: 'awning_front',
            faceId: 'front',
            segmentStartU: startU,
            segmentEndU: endU + projectionMeters,
            addStartRod: true,
            addEndRod: false
        });
        addFaceAwning({
            rolePrefix: 'awning_right',
            faceId: 'right',
            segmentStartU: -projectionMeters,
            segmentEndU: targetWidth,
            addStartRod: false,
            addEndRod: true
        });
    } else {
        addFaceAwning({
            rolePrefix: 'awning_front',
            faceId: 'front',
            segmentStartU: startU,
            segmentEndU: endU,
            addStartRod: true,
            addEndRod: true
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

const CORNICE_BASIC_BLOCK_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.CORNER,
    position: WALL_DECORATOR_POSITION.TOP,
    configuration: Object.freeze({
        ...CORNICE_BASIC_BLOCK_CONFIGURATION_DEFAULTS
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

const CORNICE_ROUNDED_DEFAULTS = Object.freeze({
    whereToApply: CORNICE_BASIC_BLOCK_DEFAULTS.whereToApply,
    mode: CORNICE_BASIC_BLOCK_DEFAULTS.mode,
    position: CORNICE_BASIC_BLOCK_DEFAULTS.position,
    configuration: Object.freeze({
        ...CORNICE_ROUNDED_CONFIGURATION_DEFAULTS
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

const AWNING_DEFAULTS = Object.freeze({
    whereToApply: WALL_DECORATOR_WHERE_TO_APPLY.ENTIRE_FACADE,
    mode: WALL_DECORATOR_MODE.FACE,
    position: WALL_DECORATOR_POSITION.NEAR_TOP,
    configuration: Object.freeze({
        ...AWNING_CONFIGURATION_DEFAULTS
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

const SIMPLE_SKIRT_PRESETS = Object.freeze([
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            heightMeters: 0.20,
            offsetScale: SIMPLE_SKIRT_OFFSET_SCALE_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            heightMeters: 0.50,
            offsetScale: SIMPLE_SKIRT_OFFSET_SCALE_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'large',
        label: 'Large',
        configuration: Object.freeze({
            heightMeters: 1.00,
            offsetScale: SIMPLE_SKIRT_OFFSET_SCALE_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    })
]);

const RIBBON_PRESETS = Object.freeze([
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            heightMeters: 0.20,
            offsetScale: RIBBON_OFFSET_SCALE_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT,
            patternId: RIBBON_PATTERN_DEFAULT_ID,
            patternNormalIntensity: RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            heightMeters: 0.50,
            offsetScale: RIBBON_OFFSET_SCALE_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT,
            patternId: RIBBON_PATTERN_DEFAULT_ID,
            patternNormalIntensity: RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT
        })
    }),
    Object.freeze({
        id: 'large',
        label: 'Large',
        configuration: Object.freeze({
            heightMeters: 1.00,
            offsetScale: RIBBON_OFFSET_SCALE_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT,
            patternId: RIBBON_PATTERN_DEFAULT_ID,
            patternNormalIntensity: RIBBON_PATTERN_NORMAL_INTENSITY_DEFAULT
        })
    })
]);

const EDGE_BRICK_CHAIN_PRESETS = Object.freeze([
    Object.freeze({
        id: 'both_edges',
        label: 'Both Edges',
        configuration: Object.freeze({
            edgeTarget: EDGE_BRICK_CHAIN_EDGE_TARGET.BOTH,
            startY: EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT,
            endY: EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT,
            brickHeight: EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT,
            depthScaleMultiplier: EDGE_BRICK_CHAIN_DEPTH_SCALE_MULTIPLIER_DEFAULT,
            snapToFit: true
        })
    }),
    Object.freeze({
        id: 'left_edge',
        label: 'Left Edge',
        configuration: Object.freeze({
            edgeTarget: EDGE_BRICK_CHAIN_EDGE_TARGET.LEFT,
            startY: EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT,
            endY: EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT,
            brickHeight: EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT,
            depthScaleMultiplier: EDGE_BRICK_CHAIN_DEPTH_SCALE_MULTIPLIER_DEFAULT,
            snapToFit: true
        })
    }),
    Object.freeze({
        id: 'right_edge',
        label: 'Right Edge',
        configuration: Object.freeze({
            edgeTarget: EDGE_BRICK_CHAIN_EDGE_TARGET.RIGHT,
            startY: EDGE_BRICK_CHAIN_START_Y_METERS_DEFAULT,
            endY: EDGE_BRICK_CHAIN_END_Y_METERS_DEFAULT,
            brickHeight: EDGE_BRICK_CHAIN_BRICK_HEIGHT_METERS_DEFAULT,
            depthScaleMultiplier: EDGE_BRICK_CHAIN_DEPTH_SCALE_MULTIPLIER_DEFAULT,
            snapToFit: true
        })
    })
]);

const CORNICE_BASIC_BLOCK_PRESETS = Object.freeze([
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            blockSizeMeters: 0.05,
            spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK,
            spacingMeters: 0.20,
            frontBottomLiftScale: 0.0,
            snapToFit: true
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            blockSizeMeters: 0.10,
            spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK,
            spacingMeters: 0.30,
            frontBottomLiftScale: 0.0,
            snapToFit: true
        })
    })
]);

const CORNICE_ROUNDED_PRESETS = Object.freeze([
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            blockSizeMeters: 0.05,
            spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK,
            spacingMeters: 0.20,
            curvature: CORNICE_ROUNDED_CURVATURE.CONVEX,
            snapToFit: true
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            blockSizeMeters: 0.10,
            spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK,
            spacingMeters: 0.30,
            curvature: CORNICE_ROUNDED_CURVATURE.CONVEX,
            snapToFit: true
        })
    })
]);

const SIMPLE_SKIRT_PRESET_GROUPS = Object.freeze([
    Object.freeze({
        id: 'size',
        label: 'Size',
        options: Object.freeze([
            Object.freeze({ id: 'small', label: 'Small', configuration: Object.freeze({ heightMeters: 0.20 }) }),
            Object.freeze({ id: 'medium', label: 'Medium', configuration: Object.freeze({ heightMeters: 0.50 }) }),
            Object.freeze({ id: 'large', label: 'Large', configuration: Object.freeze({ heightMeters: 1.00 }) })
        ])
    }),
    Object.freeze({
        id: 'offset',
        label: 'Offset',
        options: Object.freeze([
            Object.freeze({ id: 'normal', label: 'Normal', configuration: Object.freeze({ offsetScale: 1.0 }) }),
            Object.freeze({ id: 'extra', label: 'Extra', configuration: Object.freeze({ offsetScale: 2.0 }) })
        ])
    })
]);

const RIBBON_PRESET_GROUPS = Object.freeze([
    Object.freeze({
        id: 'size',
        label: 'Size',
        options: Object.freeze([
            Object.freeze({ id: 'small', label: 'Small', configuration: Object.freeze({ heightMeters: 0.20 }) }),
            Object.freeze({ id: 'medium', label: 'Medium', configuration: Object.freeze({ heightMeters: 0.50 }) }),
            Object.freeze({ id: 'large', label: 'Large', configuration: Object.freeze({ heightMeters: 1.00 }) })
        ])
    }),
    Object.freeze({
        id: 'offset',
        label: 'Offset',
        options: Object.freeze([
            Object.freeze({ id: 'normal', label: 'Normal', configuration: Object.freeze({ offsetScale: 1.0 }) }),
            Object.freeze({ id: 'extra', label: 'Extra', configuration: Object.freeze({ offsetScale: 2.0 }) })
        ])
    })
]);

const EDGE_BRICK_CHAIN_PRESET_GROUPS = Object.freeze([
    Object.freeze({
        id: 'size',
        label: 'Size',
        options: Object.freeze([
            Object.freeze({ id: 'small', label: 'Small', configuration: Object.freeze({ brickHeight: 0.05 }) }),
            Object.freeze({ id: 'medium', label: 'Medium', configuration: Object.freeze({ brickHeight: 0.10 }) }),
            Object.freeze({ id: 'large', label: 'Large', configuration: Object.freeze({ brickHeight: 0.15 }) })
        ])
    }),
    Object.freeze({
        id: 'offset',
        label: 'Offset',
        options: Object.freeze([
            Object.freeze({ id: 'small', label: 'Small', configuration: Object.freeze({ depthScaleMultiplier: 0.5 }) }),
            Object.freeze({ id: 'normal', label: 'Normal', configuration: Object.freeze({ depthScaleMultiplier: 1.0 }) }),
            Object.freeze({ id: 'extra', label: 'Extra', configuration: Object.freeze({ depthScaleMultiplier: 1.5 }) })
        ])
    })
]);

const CORNICE_BASIC_BLOCK_PRESET_GROUPS = Object.freeze([
    Object.freeze({
        id: 'block_size',
        label: 'Block size',
        options: Object.freeze([
            Object.freeze({
                id: 'small',
                label: 'Small',
                configuration: Object.freeze({ blockSizeMeters: 0.05 })
            }),
            Object.freeze({
                id: 'medium',
                label: 'Medium',
                configuration: Object.freeze({ blockSizeMeters: 0.10 })
            }),
            Object.freeze({
                id: 'large',
                label: 'Large',
                configuration: Object.freeze({ blockSizeMeters: 0.15 })
            })
        ])
    }),
    Object.freeze({
        id: 'spacing',
        label: 'Spacing',
        options: Object.freeze([
            Object.freeze({
                id: 'match_block',
                label: 'Match block',
                configuration: Object.freeze({ spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK })
            }),
            Object.freeze({
                id: 'small',
                label: 'Small',
                configuration: Object.freeze({
                    spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED,
                    spacingMeters: 0.10
                })
            }),
            Object.freeze({
                id: 'medium',
                label: 'Medium',
                configuration: Object.freeze({
                    spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED,
                    spacingMeters: 0.20
                })
            }),
            Object.freeze({
                id: 'large',
                label: 'Large',
                configuration: Object.freeze({
                    spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED,
                    spacingMeters: 0.30
                })
            })
        ])
    }),
    Object.freeze({
        id: 'front_angle',
        label: 'Angle',
        options: Object.freeze([
            Object.freeze({
                id: 'flat',
                label: 'Flat',
                configuration: Object.freeze({ frontBottomLiftScale: 0.0 })
            }),
            Object.freeze({
                id: 'angle',
                label: 'Angle',
                configuration: Object.freeze({ frontBottomLiftScale: 0.5 })
            })
        ])
    })
]);

const CORNICE_ROUNDED_PRESET_GROUPS = Object.freeze([
    Object.freeze({
        id: 'block_size',
        label: 'Block size',
        options: Object.freeze([
            Object.freeze({
                id: 'small',
                label: 'Small',
                configuration: Object.freeze({ blockSizeMeters: 0.05 })
            }),
            Object.freeze({
                id: 'medium',
                label: 'Medium',
                configuration: Object.freeze({ blockSizeMeters: 0.10 })
            }),
            Object.freeze({
                id: 'large',
                label: 'Large',
                configuration: Object.freeze({ blockSizeMeters: 0.15 })
            })
        ])
    }),
    Object.freeze({
        id: 'spacing',
        label: 'Spacing',
        options: Object.freeze([
            Object.freeze({
                id: 'match_block',
                label: 'Match block',
                configuration: Object.freeze({ spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.MATCH_BLOCK })
            }),
            Object.freeze({
                id: 'small',
                label: 'Small',
                configuration: Object.freeze({
                    spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED,
                    spacingMeters: 0.10
                })
            }),
            Object.freeze({
                id: 'medium',
                label: 'Medium',
                configuration: Object.freeze({
                    spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED,
                    spacingMeters: 0.20
                })
            }),
            Object.freeze({
                id: 'large',
                label: 'Large',
                configuration: Object.freeze({
                    spacingMode: CORNICE_BASIC_BLOCK_SPACING_MODE.FIXED,
                    spacingMeters: 0.30
                })
            })
        ])
    }),
    Object.freeze({
        id: 'curvature',
        label: 'Curvature',
        options: Object.freeze([
            Object.freeze({
                id: 'convex',
                label: 'Convex',
                configuration: Object.freeze({ curvature: CORNICE_ROUNDED_CURVATURE.CONVEX })
            }),
            Object.freeze({
                id: 'concave',
                label: 'Concave',
                configuration: Object.freeze({ curvature: CORNICE_ROUNDED_CURVATURE.CONCAVE })
            })
        ])
    })
]);

const HALF_DOME_PRESETS = Object.freeze([
    Object.freeze({
        id: 'tiny',
        label: 'Tiny',
        configuration: Object.freeze({
            diameterMeters: 0.01,
            outsetMeters: HALF_DOME_OUTSET_METERS_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            diameterMeters: 0.05,
            outsetMeters: HALF_DOME_OUTSET_METERS_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            diameterMeters: HALF_DOME_DIAMETER_METERS_DEFAULT,
            outsetMeters: HALF_DOME_OUTSET_METERS_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'large',
        label: 'Large',
        configuration: Object.freeze({
            diameterMeters: 0.20,
            outsetMeters: HALF_DOME_OUTSET_METERS_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    })
]);

const ANGLED_SUPPORT_PROFILE_PRESETS = Object.freeze([
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            offset: 0.05,
            height: 0.15,
            topCapAngleDeg: 45.0,
            bottomCapAngleDeg: 45.0
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            offset: ANGLED_SUPPORT_PROFILE_OFFSET_METERS_DEFAULT,
            height: ANGLED_SUPPORT_PROFILE_HEIGHT_METERS_DEFAULT,
            topCapAngleDeg: 45.0,
            bottomCapAngleDeg: 45.0
        })
    }),
    Object.freeze({
        id: 'large',
        label: 'Large',
        configuration: Object.freeze({
            offset: 0.15,
            height: 0.30,
            topCapAngleDeg: 45.0,
            bottomCapAngleDeg: 45.0
        })
    })
]);

const AWNING_PRESETS = Object.freeze([
    Object.freeze({
        id: 'small',
        label: 'Small',
        configuration: Object.freeze({
            projectionMeters: 0.50,
            frontHeightMeters: 0.20,
            slopeDegrees: AWNING_SLOPE_DEGREES_DEFAULT,
            rodRadiusMeters: 0.010,
            rodInsetMeters: 0.05,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'medium',
        label: 'Medium',
        configuration: Object.freeze({
            projectionMeters: AWNING_PROJECTION_METERS_DEFAULT,
            frontHeightMeters: AWNING_FRONT_HEIGHT_METERS_DEFAULT,
            slopeDegrees: AWNING_SLOPE_DEGREES_DEFAULT,
            rodRadiusMeters: AWNING_ROD_RADIUS_METERS_DEFAULT,
            rodInsetMeters: AWNING_ROD_INSET_METERS_DEFAULT,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    }),
    Object.freeze({
        id: 'large',
        label: 'Large',
        configuration: Object.freeze({
            projectionMeters: 1.20,
            frontHeightMeters: 0.45,
            slopeDegrees: AWNING_SLOPE_DEGREES_DEFAULT,
            rodRadiusMeters: 0.020,
            rodInsetMeters: 0.12,
            nearEdgeOffsetMeters: NEAR_EDGE_OFFSET_METERS_DEFAULT
        })
    })
]);

const AWNING_PRESET_GROUPS = Object.freeze([
    Object.freeze({
        id: 'size',
        label: 'Size',
        options: Object.freeze([
            Object.freeze({
                id: 'small',
                label: 'Small',
                configuration: Object.freeze({
                    projectionMeters: 0.50,
                    frontHeightMeters: 0.20,
                    rodRadiusMeters: 0.010,
                    rodInsetMeters: 0.05
                })
            }),
            Object.freeze({
                id: 'medium',
                label: 'Medium',
                configuration: Object.freeze({
                    projectionMeters: AWNING_PROJECTION_METERS_DEFAULT,
                    frontHeightMeters: AWNING_FRONT_HEIGHT_METERS_DEFAULT,
                    rodRadiusMeters: AWNING_ROD_RADIUS_METERS_DEFAULT,
                    rodInsetMeters: AWNING_ROD_INSET_METERS_DEFAULT
                })
            }),
            Object.freeze({
                id: 'large',
                label: 'Large',
                configuration: Object.freeze({
                    projectionMeters: 1.20,
                    frontHeightMeters: 0.45,
                    rodRadiusMeters: 0.020,
                    rodInsetMeters: 0.12
                })
            })
        ])
    }),
    Object.freeze({
        id: 'slope',
        label: 'Slope',
        options: Object.freeze([
            Object.freeze({
                id: 'shallow',
                label: 'Shallow',
                configuration: Object.freeze({ slopeDegrees: 15.0 })
            }),
            Object.freeze({
                id: 'standard',
                label: 'Standard',
                configuration: Object.freeze({ slopeDegrees: AWNING_SLOPE_DEGREES_DEFAULT })
            }),
            Object.freeze({
                id: 'steep',
                label: 'Steep',
                configuration: Object.freeze({ slopeDegrees: 35.0 })
            })
        ])
    })
]);

const WALL_DECORATOR_TYPE_CATALOG = Object.freeze([
    Object.freeze({
        id: WALL_DECORATOR_ID.SIMPLE_SKIRT,
        label: 'Simple Skirt',
        description: 'Bottom-aligned facade strip with face or corner routing.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.DECORATIONS,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.DECORATIONS],
        defaultPlacement: Object.freeze({
            whereToApply: SIMPLE_SKIRT_DEFAULTS.whereToApply,
            mode: SIMPLE_SKIRT_DEFAULTS.mode,
            position: SIMPLE_SKIRT_DEFAULTS.position
        }),
        properties: SIMPLE_SKIRT_PROPERTY_SPECS,
        presets: SIMPLE_SKIRT_PRESETS,
        presetGroups: SIMPLE_SKIRT_PRESET_GROUPS,
        defaults: SIMPLE_SKIRT_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildSimpleSkirtShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.RIBBON,
        label: 'Ribbon',
        description: 'Skirt-style surround with pattern-driven normal-map relief.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.DECORATIONS,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.DECORATIONS],
        defaultPlacement: Object.freeze({
            whereToApply: RIBBON_DEFAULTS.whereToApply,
            mode: RIBBON_DEFAULTS.mode,
            position: RIBBON_DEFAULTS.position
        }),
        properties: RIBBON_PROPERTY_SPECS,
        presets: RIBBON_PRESETS,
        presetGroups: RIBBON_PRESET_GROUPS,
        defaults: RIBBON_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildRibbonShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.EDGE_BRICK_CHAIN,
        label: 'Edge Brick Chain',
        description: 'Edge-only alternating brick courses with optional snap-to-fit range behavior.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.DECORATIONS,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.DECORATIONS],
        defaultPlacement: Object.freeze({
            whereToApply: EDGE_BRICK_CHAIN_DEFAULTS.whereToApply,
            mode: EDGE_BRICK_CHAIN_DEFAULTS.mode,
            position: EDGE_BRICK_CHAIN_DEFAULTS.position
        }),
        properties: EDGE_BRICK_CHAIN_PROPERTY_SPECS,
        presets: EDGE_BRICK_CHAIN_PRESETS,
        presetGroups: EDGE_BRICK_CHAIN_PRESET_GROUPS,
        defaults: EDGE_BRICK_CHAIN_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildEdgeBrickChainShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.AWNING,
        label: 'Awning',
        description: 'Slanted canopy with front valance and side-edge support rods.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.AWNING,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.AWNING],
        defaultPlacement: Object.freeze({
            whereToApply: AWNING_DEFAULTS.whereToApply,
            mode: AWNING_DEFAULTS.mode,
            position: AWNING_DEFAULTS.position
        }),
        properties: AWNING_PROPERTY_SPECS,
        presets: AWNING_PRESETS,
        presetGroups: AWNING_PRESET_GROUPS,
        defaults: AWNING_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildAwningShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.CORNICE_BASIC_BLOCK,
        label: 'Cornice Blocks',
        description: 'Top-oriented square block cornice with snap-adjusted edge fit.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.CORNICE,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.CORNICE],
        defaultPlacement: Object.freeze({
            whereToApply: CORNICE_BASIC_BLOCK_DEFAULTS.whereToApply,
            mode: CORNICE_BASIC_BLOCK_DEFAULTS.mode,
            position: CORNICE_BASIC_BLOCK_DEFAULTS.position
        }),
        properties: CORNICE_BASIC_BLOCK_PROPERTY_SPECS,
        presets: CORNICE_BASIC_BLOCK_PRESETS,
        presetGroups: CORNICE_BASIC_BLOCK_PRESET_GROUPS,
        defaults: CORNICE_BASIC_BLOCK_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildCorniceBasicBlockShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.CORNICE_ROUNDED,
        label: 'Cornice Rounded',
        description: 'Cornice-block spacing/placement clone with rounded front/bottom cover profile.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.CORNICE,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.CORNICE],
        defaultPlacement: Object.freeze({
            whereToApply: CORNICE_ROUNDED_DEFAULTS.whereToApply,
            mode: CORNICE_ROUNDED_DEFAULTS.mode,
            position: CORNICE_ROUNDED_DEFAULTS.position
        }),
        properties: CORNICE_ROUNDED_PROPERTY_SPECS,
        presets: CORNICE_ROUNDED_PRESETS,
        presetGroups: CORNICE_ROUNDED_PRESET_GROUPS,
        defaults: CORNICE_ROUNDED_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildCorniceRoundedShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.HALF_DOME,
        label: 'Curved Ring',
        description: 'Half-circle side profile swept along the facade span, with optional corner miter behavior.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.DECORATIONS,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.DECORATIONS],
        defaultPlacement: Object.freeze({
            whereToApply: HALF_DOME_DEFAULTS.whereToApply,
            mode: HALF_DOME_DEFAULTS.mode,
            position: HALF_DOME_DEFAULTS.position
        }),
        properties: HALF_DOME_PROPERTY_SPECS,
        presets: HALF_DOME_PRESETS,
        presetGroups: Object.freeze([
            Object.freeze({
                id: 'size',
                label: 'Size',
                options: HALF_DOME_PRESETS
            })
        ]),
        defaults: HALF_DOME_DEFAULTS,
        createShapeSpecs: ({ state, wallSpec }) => buildHalfDomeShapeSpecs({ state, wallSpec })
    }),
    Object.freeze({
        id: WALL_DECORATOR_ID.ANGLED_SUPPORT_PROFILE,
        label: 'Angled Support Profile',
        description: 'Skirt-style flat panel/cap layout with independent top/bottom cap angles.',
        catalogSectionId: WALL_DECORATOR_CATALOG_SECTION.DECORATIONS,
        catalogSectionLabel: WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.DECORATIONS],
        defaultPlacement: Object.freeze({
            whereToApply: ANGLED_SUPPORT_PROFILE_DEFAULTS.whereToApply,
            mode: ANGLED_SUPPORT_PROFILE_DEFAULTS.mode,
            position: ANGLED_SUPPORT_PROFILE_DEFAULTS.position
        }),
        properties: ANGLED_SUPPORT_PROFILE_PROPERTY_SPECS,
        presets: ANGLED_SUPPORT_PROFILE_PRESETS,
        presetGroups: Object.freeze([
            Object.freeze({
                id: 'size',
                label: 'Size',
                options: ANGLED_SUPPORT_PROFILE_PRESETS
            })
        ]),
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
        description: entry.description,
        classId: String(entry.catalogSectionId ?? WALL_DECORATOR_CATALOG_SECTION.DECORATIONS),
        classLabel: String(
            entry.catalogSectionLabel
            ?? WALL_DECORATOR_CATALOG_SECTION_LABEL[entry.catalogSectionId]
            ?? WALL_DECORATOR_CATALOG_SECTION_LABEL[WALL_DECORATOR_CATALOG_SECTION.DECORATIONS]
        )
    }));
}

export function getWallDecoratorCatalogEntryById(id) {
    const key = normalizeDecoratorId(id, { allowNone: true });
    return WALL_DECORATOR_TYPE_BY_ID.get(key) ?? null;
}

export function getWallDecoratorTypeEntryById(id) {
    return getWallDecoratorCatalogEntryById(id);
}

export function getWallDecoratorTypePropertySpecsById(id) {
    const entry = getWallDecoratorCatalogEntryById(id);
    return entry?.properties ?? [];
}

export function getWallDecoratorPresetEntries() {
    return WALL_DECORATOR_PRESET_CATALOG;
}

export function getWallDecoratorPresetEntryById(id) {
    const key = String(id ?? '').trim();
    if (!key) return null;
    return WALL_DECORATOR_PRESET_BY_ID.get(key) ?? null;
}

export function getWallDecoratorCatalogOptions() {
    return getWallDecoratorTypeOptions();
}

export function getWallDecoratorPresetOptions() {
    return getWallDecoratorPresetEntries();
}

export function loadWallDecoratorCatalogEntry(value, decoratorId) {
    const base = sanitizeWallDecoratorDebuggerState(value);
    const key = normalizeDecoratorId(decoratorId, { allowNone: true });
    const previousEntry = WALL_DECORATOR_TYPE_BY_ID.get(base.decoratorId) ?? null;
    const previousDefaults = previousEntry?.defaults ?? SIMPLE_SKIRT_DEFAULTS;
    const previousDefaultPlacement = previousEntry?.defaultPlacement ?? null;
    const entry = WALL_DECORATOR_TYPE_BY_ID.get(key) ?? null;
    const defaults = entry?.defaults ?? SIMPLE_SKIRT_DEFAULTS;
    const defaultPlacement = entry?.defaultPlacement ?? null;
    const whereToApply = normalizeWhereToApply(base.whereToApply);
    const mode = normalizeMode(base.mode);
    const previousDefaultPosition = normalizePosition(previousDefaultPlacement?.position ?? previousDefaults.position);
    const nextDefaultPosition = normalizePosition(defaultPlacement?.position ?? defaults.position);
    const position = previousDefaultPosition === nextDefaultPosition
        ? normalizePosition(base.position)
        : nextDefaultPosition;

    return sanitizeWallDecoratorDebuggerState({
        ...base,
        decoratorId: entry?.id ?? WALL_DECORATOR_NONE_ID,
        whereToApply,
        mode,
        position,
        configuration: entry ? deepClone(defaults.configuration) : {},
        materialSelection: deepClone(defaults.materialSelection),
        wallBase: deepClone(defaults.wallBase),
        tiling: deepClone(defaults.tiling)
    });
}

export function loadWallDecoratorPresetEntry(value, presetId) {
    const base = sanitizeWallDecoratorDebuggerState(value);
    const preset = getWallDecoratorPresetEntryById(presetId);
    const presetState = preset?.state && typeof preset.state === 'object' ? deepClone(preset.state) : null;
    if (!presetState) return base;
    return sanitizeWallDecoratorDebuggerState({
        ...base,
        ...presetState
    });
}

export function getDefaultWallDecoratorDebuggerState({ decoratorId = WALL_DECORATOR_NONE_ID } = {}) {
    const key = normalizeDecoratorId(decoratorId, { allowNone: true });
    const entry = WALL_DECORATOR_TYPE_BY_ID.get(key) ?? null;
    const defaults = entry?.defaults ?? SIMPLE_SKIRT_DEFAULTS;
    return deepClone({
        version: 1,
        decoratorId: entry?.id ?? WALL_DECORATOR_NONE_ID,
        whereToApply: defaults.whereToApply,
        mode: defaults.mode,
        position: defaults.position,
        configuration: entry ? defaults.configuration : {},
        materialSelection: defaults.materialSelection,
        wallBase: defaults.wallBase,
        tiling: defaults.tiling
    });
}

export function sanitizeWallDecoratorDebuggerState(value) {
    return normalizeStateWithCatalogDefaults(value);
}

export function buildWallDecoratorShapeSpecs(state, wallSpec) {
    const safeState = sanitizeWallDecoratorDebuggerState(state);
    const entry = WALL_DECORATOR_TYPE_BY_ID.get(safeState.decoratorId);
    if (!entry || typeof entry.createShapeSpecs !== 'function') return [];
    const specs = entry.createShapeSpecs({ state: safeState, wallSpec });
    return Array.isArray(specs) ? specs.map((spec) => ({ ...spec })) : [];
}

export function resolveWallDecoratorCatalogSnapshot() {
    return {
        types: getWallDecoratorTypeEntries().map((entry) => ({
            id: entry.id,
            label: entry.label,
            description: entry.description,
            catalogSectionId: entry.catalogSectionId,
            catalogSectionLabel: entry.catalogSectionLabel,
            defaultPlacement: deepClone(entry.defaultPlacement),
            properties: deepClone(entry.properties),
            presets: deepClone(entry.presets),
            presetGroups: deepClone(entry.presetGroups),
            defaults: deepClone(entry.defaults)
        })),
        presets: getWallDecoratorPresetEntries().map((entry) => deepClone(entry))
    };
}
