// src/app/buildings/wall_decorators/WallDecoratorCatalog.js
// Catalog + debugger state model for procedural wall decorators.
// @ts-check

export const WALL_DECORATOR_ID = Object.freeze({
    SIMPLE_SKIRT: 'simple_skirt'
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

const SIMPLE_SKIRT_OVERSIZE_METERS_DEFAULT = 0.05;
const SIMPLE_SKIRT_HEIGHT_METERS_DEFAULT = 0.35;
const NEAR_EDGE_OFFSET_METERS_DEFAULT = 0.10;

function deepClone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeHexColor(value, fallback = 0xffffff) {
    if (Number.isFinite(value)) return (Number(value) >>> 0) & 0xffffff;
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return parseInt(v, 16) & 0xffffff;
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[0];
        const g = v[1];
        const b = v[2];
        return parseInt(`${r}${r}${g}${g}${b}${b}`, 16) & 0xffffff;
    }
    return fallback;
}

function normalizeDecoratorId(value, { allowNone = false } = {}) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!raw) return allowNone ? WALL_DECORATOR_NONE_ID : WALL_DECORATOR_ID.SIMPLE_SKIRT;
    if (raw === WALL_DECORATOR_ID.SIMPLE_SKIRT) return WALL_DECORATOR_ID.SIMPLE_SKIRT;
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
        out.push(Object.freeze({ id, label }));
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
    if (raw === 'color') return 'color';
    return 'texture';
}

function normalizeMaterialSelection(value, fallback) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    const kind = normalizeMaterialKind(src?.kind ?? fb?.kind);
    const idRaw = typeof src?.id === 'string' && src.id.trim()
        ? src.id.trim()
        : (typeof fb?.id === 'string' ? fb.id.trim() : '');
    const id = idRaw || (kind === 'color' ? 'belt.white' : 'pbr.brick_wall_11');
    return { kind, id };
}

function normalizeWallBase(value, fallback) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    return {
        tintHex: normalizeHexColor(src?.tintHex ?? src?.tint ?? fb?.tintHex ?? fb?.tint ?? 0xffffff, 0xffffff),
        roughness: clamp(src?.roughness, 0.0, 1.0, clamp(fb?.roughness, 0.0, 1.0, 0.85)),
        normalStrength: clamp(src?.normalStrength ?? src?.normal, 0.0, 2.0, clamp(fb?.normalStrength ?? fb?.normal, 0.0, 2.0, 0.9))
    };
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

const SIMPLE_SKIRT_PROPERTY_SPECS = normalizeTypePropertySpecs([
    {
        id: 'heightMeters',
        label: 'Height (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.05,
        max: 2.5,
        step: 0.01,
        default: SIMPLE_SKIRT_HEIGHT_METERS_DEFAULT
    },
    {
        id: 'depthOversizeMeters',
        label: 'Depth oversize (m)',
        type: WALL_DECORATOR_PROPERTY_TYPE.FLOAT,
        min: 0.0,
        max: 1.5,
        step: 0.01,
        default: SIMPLE_SKIRT_OVERSIZE_METERS_DEFAULT
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
        id: 'edgeCapMode',
        label: 'Edge cap',
        type: WALL_DECORATOR_PROPERTY_TYPE.ENUM,
        default: 'auto',
        options: [
            { id: 'auto', label: 'Auto' },
            { id: 'custom', label: 'Custom' },
            { id: 'none', label: 'None' }
        ]
    },
    {
        id: 'edgeCapThicknessCm',
        label: 'Edge cap thickness (cm)',
        type: WALL_DECORATOR_PROPERTY_TYPE.INT,
        min: 1,
        max: 30,
        step: 1,
        default: 4
    },
    {
        id: 'cornerConnector',
        label: 'Corner connector',
        type: WALL_DECORATOR_PROPERTY_TYPE.BOOL,
        default: true
    }
]);

const SIMPLE_SKIRT_CONFIGURATION_DEFAULTS = Object.freeze(
    buildDefaultConfigurationFromPropertySpecs(SIMPLE_SKIRT_PROPERTY_SPECS)
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
    const centerU = startU + targetWidth * 0.5;

    const widthMeters = targetWidth;
    const depthMeters = wall.depthMeters + clamp(
        configuration.depthOversizeMeters,
        0.0,
        1.5,
        SIMPLE_SKIRT_OVERSIZE_METERS_DEFAULT
    );
    const heightMeters = clamp(
        configuration.heightMeters,
        0.05,
        wall.heightMeters,
        SIMPLE_SKIRT_HEIGHT_METERS_DEFAULT
    );
    const centerV = resolveCenterYForPosition(
        position,
        wall.heightMeters,
        heightMeters,
        configuration.nearEdgeOffsetMeters
    );
    const edgeCapMode = String(configuration.edgeCapMode ?? 'auto');
    const edgeCapThicknessMeters = edgeCapMode === 'custom'
        ? clamp((Number(configuration.edgeCapThicknessCm) || 0) * 0.01, 0.01, 0.3, 0.04)
        : clamp(depthMeters * 0.25, 0.01, 0.04, 0.03);

    const specs = [{
        role: 'front_strip',
        faceId: 'front',
        centerU,
        centerV,
        widthMeters,
        heightMeters,
        depthMeters
    }];

    if (mode === WALL_DECORATOR_MODE.CORNER) {
        specs.push({
            role: 'right_strip',
            faceId: 'right',
            // Right-face local U is distance from the front-right corner (z=0) towards negative z.
            centerU: targetWidth * 0.5,
            centerV,
            widthMeters,
            heightMeters,
            depthMeters
        });
        if (configuration.cornerConnector !== false) {
            specs.push({
                role: 'corner_connector',
                faceId: 'front',
                centerU: wallHalfWidth - depthMeters * 0.5,
                centerV,
                widthMeters: depthMeters,
                heightMeters,
                depthMeters
            });
        }
    } else {
        if (edgeCapMode !== 'none') {
            specs.push({
                role: 'front_corner_edge_cap',
                faceId: 'front',
                centerU: wallHalfWidth - edgeCapThicknessMeters * 0.5,
                centerV,
                widthMeters: edgeCapThicknessMeters,
                heightMeters,
                depthMeters
            });
        }
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
    materialSelection: Object.freeze({
        kind: 'texture',
        id: 'pbr.brick_wall_11'
    }),
    wallBase: Object.freeze({
        tintHex: 0xffffff,
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
        whereToApply: defaults.whereToApply,
        mode: defaults.mode,
        position: defaults.position,
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
