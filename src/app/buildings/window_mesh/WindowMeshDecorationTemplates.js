// src/app/buildings/window_mesh/WindowMeshDecorationTemplates.js
// Window decoration template model (visualization-only).
// @ts-check

export const WINDOW_DECORATION_PART = Object.freeze({
    SILL: 'sill',
    HEADER: 'header',
    JAMBS: 'jambs',
    TRIM: 'trim'
});

export const WINDOW_DECORATION_PART_IDS = Object.freeze([
    WINDOW_DECORATION_PART.SILL,
    WINDOW_DECORATION_PART.HEADER,
    WINDOW_DECORATION_PART.JAMBS,
    WINDOW_DECORATION_PART.TRIM
]);

export const WINDOW_DECORATION_STYLE = Object.freeze({
    SIMPLE: 'simple',
    BOTTOM_COVER: 'bottom_cover',
    FLAT_BAND: 'flat_band',
    SPLAYED_LINTEL: 'splayed_lintel',
    ANGLED_KEYSTONE: 'angled_keystone',
    PEDIMENT_TRIANGLE: 'pediment_triangle',
    ARCHED_BAND: 'arched_band'
});

export const WINDOW_DECORATION_HEADER_PROFILE_STYLES = Object.freeze([
    WINDOW_DECORATION_STYLE.FLAT_BAND,
    WINDOW_DECORATION_STYLE.SPLAYED_LINTEL,
    WINDOW_DECORATION_STYLE.ANGLED_KEYSTONE,
    WINDOW_DECORATION_STYLE.PEDIMENT_TRIANGLE,
    WINDOW_DECORATION_STYLE.ARCHED_BAND
]);

export const WINDOW_DECORATION_JAMBS_RUN_MODE = Object.freeze({
    SILL_TO_HEADER: 'sill_to_header',
    FULL_BAY: 'full_bay'
});

export const WINDOW_DECORATION_EARS_MAX_METERS = 0.6;

export const WINDOW_DECORATION_WIDTH_MODE = Object.freeze({
    MATCH_WINDOW: 'match_window',
    PCT_15: 'pct_15'
});

export const WINDOW_DECORATION_MATERIAL_MODE = Object.freeze({
    MATCH_WALL: 'match_wall',
    MATCH_FRAME: 'match_frame',
    PBR: 'pbr',
    // Building material slot reference (AI 491); resolved to a pbr material
    // by the building-config pre-pass, falls back to match_wall unresolved.
    SLOT: 'slot'
});

// First entry stays the default; the deeper options exist for portal-scale
// surrounds (AI 509 — 0.24m archivolts used to silently snap down to 0.12).
export const WINDOW_DECORATION_DEPTH_OPTIONS_METERS = Object.freeze([0.08, 0.02, 0.12, 0.16, 0.2, 0.24, 0.3]);

const DEFAULT_TEMPLATE_BY_PART = Object.freeze({
    [WINDOW_DECORATION_PART.SILL]: Object.freeze({
        height: 0.08,
        depth: 0.08,
        gap: 0.0,
        offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 })
    }),
    [WINDOW_DECORATION_PART.HEADER]: Object.freeze({
        height: 0.08,
        depth: 0.08,
        gap: 0.0,
        offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 })
    }),
    [WINDOW_DECORATION_PART.JAMBS]: Object.freeze({
        height: 0.1,
        depth: 0.08,
        gap: 0.0,
        offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 })
    }),
    [WINDOW_DECORATION_PART.TRIM]: Object.freeze({
        height: 0.08,
        depth: 0.08,
        gap: 0.0,
        offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 })
    })
});

const DEFAULT_TYPE_BY_PART = Object.freeze({
    [WINDOW_DECORATION_PART.SILL]: WINDOW_DECORATION_STYLE.SIMPLE,
    [WINDOW_DECORATION_PART.HEADER]: WINDOW_DECORATION_STYLE.SIMPLE,
    [WINDOW_DECORATION_PART.JAMBS]: WINDOW_DECORATION_STYLE.SIMPLE,
    [WINDOW_DECORATION_PART.TRIM]: WINDOW_DECORATION_STYLE.SIMPLE
});

const WINDOW_DECORATION_TYPE_METADATA_BY_PART = Object.freeze({
    [WINDOW_DECORATION_PART.SILL]: Object.freeze({
        [WINDOW_DECORATION_STYLE.SIMPLE]: Object.freeze({
            label: 'simple',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.PCT_15,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.08,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        }),
        [WINDOW_DECORATION_STYLE.BOTTOM_COVER]: Object.freeze({
            label: 'bottom cover',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME
            }),
            template: Object.freeze({
                height: 0.5,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: -1.0
            })
        })
    }),
    [WINDOW_DECORATION_PART.HEADER]: Object.freeze({
        [WINDOW_DECORATION_STYLE.SIMPLE]: Object.freeze({
            label: 'simple',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.08,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        }),
        [WINDOW_DECORATION_STYLE.FLAT_BAND]: Object.freeze({
            label: 'flat band',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.15,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        }),
        [WINDOW_DECORATION_STYLE.SPLAYED_LINTEL]: Object.freeze({
            label: 'splayed lintel',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.22,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        }),
        [WINDOW_DECORATION_STYLE.ANGLED_KEYSTONE]: Object.freeze({
            label: 'angled keystone',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.2,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        }),
        [WINDOW_DECORATION_STYLE.PEDIMENT_TRIANGLE]: Object.freeze({
            label: 'pediment',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.PCT_15,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.32,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        }),
        [WINDOW_DECORATION_STYLE.ARCHED_BAND]: Object.freeze({
            label: 'arched band',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.14,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        })
    }),
    [WINDOW_DECORATION_PART.JAMBS]: Object.freeze({
        [WINDOW_DECORATION_STYLE.SIMPLE]: Object.freeze({
            label: 'simple',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.02,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.1,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        })
    }),
    [WINDOW_DECORATION_PART.TRIM]: Object.freeze({
        [WINDOW_DECORATION_STYLE.SIMPLE]: Object.freeze({
            label: 'simple',
            suggestions: Object.freeze({
                widthMode: WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW,
                depthMeters: 0.08,
                materialMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
            }),
            template: Object.freeze({
                height: 0.08,
                gap: 0.0,
                offset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
                offsetZFromDepthScale: 0.0
            })
        })
    })
});

const WIDTH_SCALE_BY_MODE = Object.freeze({
    [WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW]: 1.0,
    [WINDOW_DECORATION_WIDTH_MODE.PCT_15]: 1.15
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizePartId(value, fallback = WINDOW_DECORATION_PART.SILL) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_DECORATION_PART.SILL) return WINDOW_DECORATION_PART.SILL;
    if (raw === WINDOW_DECORATION_PART.HEADER) return WINDOW_DECORATION_PART.HEADER;
    if (raw === WINDOW_DECORATION_PART.JAMBS) return WINDOW_DECORATION_PART.JAMBS;
    if (raw === WINDOW_DECORATION_PART.TRIM) return WINDOW_DECORATION_PART.TRIM;
    return fallback;
}

function normalizeMaterialId(value, fallback = '') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (raw) return raw;
    return typeof fallback === 'string' ? fallback.trim() : '';
}

export function normalizeWindowDecorationStyle(value, fallback = WINDOW_DECORATION_STYLE.SIMPLE) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_DECORATION_STYLE.SIMPLE) return WINDOW_DECORATION_STYLE.SIMPLE;
    if (raw === WINDOW_DECORATION_STYLE.BOTTOM_COVER) return WINDOW_DECORATION_STYLE.BOTTOM_COVER;
    if (raw === WINDOW_DECORATION_STYLE.FLAT_BAND) return WINDOW_DECORATION_STYLE.FLAT_BAND;
    if (raw === WINDOW_DECORATION_STYLE.SPLAYED_LINTEL) return WINDOW_DECORATION_STYLE.SPLAYED_LINTEL;
    if (raw === WINDOW_DECORATION_STYLE.ANGLED_KEYSTONE) return WINDOW_DECORATION_STYLE.ANGLED_KEYSTONE;
    if (raw === WINDOW_DECORATION_STYLE.PEDIMENT_TRIANGLE) return WINDOW_DECORATION_STYLE.PEDIMENT_TRIANGLE;
    if (raw === WINDOW_DECORATION_STYLE.ARCHED_BAND) return WINDOW_DECORATION_STYLE.ARCHED_BAND;
    return fallback;
}

export function normalizeWindowDecorationEarsMeters(value, fallback = 0.0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return clamp(fallback, 0.0, WINDOW_DECORATION_EARS_MAX_METERS, 0.0);
    return clamp(num, 0.0, WINDOW_DECORATION_EARS_MAX_METERS, 0.0);
}

export function normalizeWindowDecorationJambsRunMode(value, fallback = WINDOW_DECORATION_JAMBS_RUN_MODE.SILL_TO_HEADER) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_DECORATION_JAMBS_RUN_MODE.SILL_TO_HEADER) return WINDOW_DECORATION_JAMBS_RUN_MODE.SILL_TO_HEADER;
    if (raw === WINDOW_DECORATION_JAMBS_RUN_MODE.FULL_BAY) return WINDOW_DECORATION_JAMBS_RUN_MODE.FULL_BAY;
    return fallback;
}

export function normalizeWindowDecorationWidthMode(value, fallback = WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW) {
    if (Number.isFinite(value)) {
        const num = Number(value);
        return num >= 1.075 ? WINDOW_DECORATION_WIDTH_MODE.PCT_15 : WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW;
    }

    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!raw) return fallback;
    if (raw === WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW || raw === 'match' || raw === '100%' || raw === '1.0' || raw === '1') {
        return WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW;
    }
    if (raw === WINDOW_DECORATION_WIDTH_MODE.PCT_15 || raw === '15%' || raw === '1.15' || raw === '115%') {
        return WINDOW_DECORATION_WIDTH_MODE.PCT_15;
    }
    return fallback;
}

export function normalizeWindowDecorationMaterialMode(value, fallback = WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL) return WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL;
    if (raw === WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME) return WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME;
    if (raw === WINDOW_DECORATION_MATERIAL_MODE.PBR || raw === 'solid') return WINDOW_DECORATION_MATERIAL_MODE.PBR;
    if (raw === WINDOW_DECORATION_MATERIAL_MODE.SLOT) return WINDOW_DECORATION_MATERIAL_MODE.SLOT;
    return fallback;
}

export function normalizeWindowDecorationDepthMeters(value, fallback = 0.08) {
    const options = WINDOW_DECORATION_DEPTH_OPTIONS_METERS;
    const fb = options.includes(Number(fallback)) ? Number(fallback) : options[0];

    let num = Number(value);
    if (!Number.isFinite(num)) {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (raw) num = Number(raw);
    }
    if (!Number.isFinite(num)) return fb;

    let best = options[0];
    let bestDist = Math.abs(num - best);
    for (let i = 1; i < options.length; i++) {
        const candidate = options[i];
        const dist = Math.abs(num - candidate);
        if (dist < bestDist) {
            best = candidate;
            bestDist = dist;
        }
    }
    return best;
}

function getTypeMetadataByPart(partId) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    return WINDOW_DECORATION_TYPE_METADATA_BY_PART[part] ?? WINDOW_DECORATION_TYPE_METADATA_BY_PART[WINDOW_DECORATION_PART.SILL];
}

function getFallbackStyleByPart(partId) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    return DEFAULT_TYPE_BY_PART[part] ?? WINDOW_DECORATION_STYLE.SIMPLE;
}

function normalizeWindowDecorationStyleForPart(partId, value, fallback = null) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const available = getTypeMetadataByPart(part);
    const defaultStyle = getFallbackStyleByPart(part);
    const normalizedFallback = normalizeWindowDecorationStyle(fallback ?? defaultStyle, defaultStyle);
    const normalized = normalizeWindowDecorationStyle(value, normalizedFallback);
    if (available[normalized]) return normalized;
    if (available[normalizedFallback]) return normalizedFallback;
    const first = Object.keys(available)[0];
    return typeof first === 'string' && first ? first : WINDOW_DECORATION_STYLE.SIMPLE;
}

export function getWindowDecorationTypeMetadata(partId, typeId) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const available = getTypeMetadataByPart(part);
    const type = normalizeWindowDecorationStyleForPart(part, typeId, getFallbackStyleByPart(part));
    return available[type] ?? null;
}

export function getWindowDecorationTypeOptions(partId) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const available = getTypeMetadataByPart(part);
    return Object.freeze(Object.keys(available).map((id) => {
        const meta = available[id] ?? null;
        return Object.freeze({
            id,
            label: typeof meta?.label === 'string' && meta.label ? meta.label : id
        });
    }));
}

function getTemplateDefaults(partId, typeId, depthMeters) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const partDefaults = DEFAULT_TEMPLATE_BY_PART[part] ?? DEFAULT_TEMPLATE_BY_PART[WINDOW_DECORATION_PART.SILL];
    const meta = getWindowDecorationTypeMetadata(part, typeId);
    const templateMeta = meta?.template ?? null;
    const offsetMeta = templateMeta?.offset && typeof templateMeta.offset === 'object'
        ? templateMeta.offset
        : partDefaults.offset;

    const resolvedDepth = normalizeWindowDecorationDepthMeters(depthMeters, partDefaults.depth);
    const offsetDepthScale = Number(templateMeta?.offsetZFromDepthScale);
    const offsetDepthScaleSafe = Number.isFinite(offsetDepthScale) ? offsetDepthScale : 0.0;

    const offsetX = clamp(offsetMeta?.x, -5.0, 5.0, partDefaults.offset.x);
    const offsetY = clamp(offsetMeta?.y, -5.0, 5.0, partDefaults.offset.y);
    const offsetZBase = clamp(offsetMeta?.z, -5.0, 5.0, partDefaults.offset.z);

    return {
        height: clamp(templateMeta?.height, 0.001, 10.0, partDefaults.height),
        depth: resolvedDepth,
        gap: clamp(templateMeta?.gap, -2.0, 2.0, partDefaults.gap),
        offset: {
            x: offsetX,
            y: offsetY,
            z: clamp(offsetZBase + (resolvedDepth * offsetDepthScaleSafe), -5.0, 5.0, offsetZBase)
        }
    };
}

function createDefaultDecorationPartState(partId, { wallMaterialId = '' } = {}) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const defaultStyle = normalizeWindowDecorationStyleForPart(
        part,
        getFallbackStyleByPart(part),
        getFallbackStyleByPart(part)
    );
    const typeMeta = getWindowDecorationTypeMetadata(part, defaultStyle);
    const suggestedDepth = normalizeWindowDecorationDepthMeters(typeMeta?.suggestions?.depthMeters, 0.08);
    const templateDefaults = getTemplateDefaults(part, defaultStyle, suggestedDepth);
    const materialId = normalizeMaterialId(wallMaterialId, '');
    const widthMode = normalizeWindowDecorationWidthMode(
        typeMeta?.suggestions?.widthMode,
        WINDOW_DECORATION_WIDTH_MODE.MATCH_WINDOW
    );
    const materialMode = normalizeWindowDecorationMaterialMode(
        typeMeta?.suggestions?.materialMode,
        WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
    );
    return {
        enabled: false,
        type: defaultStyle,
        widthMode,
        depthMeters: templateDefaults.depth,
        earsMeters: 0.0,
        runMode: WINDOW_DECORATION_JAMBS_RUN_MODE.SILL_TO_HEADER,
        material: {
            mode: materialMode,
            materialId
        },
        template: {
            height: templateDefaults.height,
            depth: templateDefaults.depth,
            gap: templateDefaults.gap,
            offset: {
                x: templateDefaults.offset.x,
                y: templateDefaults.offset.y,
                z: templateDefaults.offset.z
            }
        }
    };
}

function sanitizeDecorationPartState(partId, input, { wallMaterialId = '' } = {}) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const src = input && typeof input === 'object' ? input : {};
    const defaults = createDefaultDecorationPartState(part, { wallMaterialId });
    const type = normalizeWindowDecorationStyleForPart(
        part,
        src.type ?? src.templateId,
        defaults.type
    );
    const typeMeta = getWindowDecorationTypeMetadata(part, type);
    const suggestedWidthMode = normalizeWindowDecorationWidthMode(
        typeMeta?.suggestions?.widthMode,
        defaults.widthMode
    );
    const suggestedDepth = normalizeWindowDecorationDepthMeters(
        typeMeta?.suggestions?.depthMeters,
        defaults.depthMeters
    );
    const suggestedMaterialMode = normalizeWindowDecorationMaterialMode(
        typeMeta?.suggestions?.materialMode,
        WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
    );

    const widthMode = normalizeWindowDecorationWidthMode(
        src.widthMode ?? src.width_mode ?? src.widthScale,
        suggestedWidthMode
    );
    const depthMeters = normalizeWindowDecorationDepthMeters(
        src.depthMeters ?? src.depth ?? src.depthOption ?? src.template?.depth,
        suggestedDepth
    );

    const materialSrc = src.material && typeof src.material === 'object' ? src.material : {};
    const materialMode = normalizeWindowDecorationMaterialMode(
        materialSrc.mode ?? src.materialMode,
        suggestedMaterialMode
    );
    const materialId = normalizeMaterialId(
        materialSrc.materialId ?? src.materialId,
        defaults.material.materialId
    );
    const materialSlotIdRaw = materialSrc.slotId ?? src.materialSlotId;
    const materialSlotId = typeof materialSlotIdRaw === 'string' ? materialSlotIdRaw.trim() : '';
    const earsMeters = normalizeWindowDecorationEarsMeters(
        src.earsMeters ?? src.ears ?? src.overhangMeters,
        defaults.earsMeters
    );
    const runMode = normalizeWindowDecorationJambsRunMode(
        src.runMode ?? src.run_mode,
        defaults.runMode
    );
    const templateDefaults = getTemplateDefaults(part, type, depthMeters);
    // AI 488: portals reuse these surrounds at larger scale, so the band
    // height is overridable per decoration instead of fixed per type.
    const heightOverride = Number(src.heightMeters ?? src.template?.height);
    const templateHeight = Number.isFinite(heightOverride) && heightOverride > 0
        ? heightOverride
        : templateDefaults.height;
    // AI 509: nested archivolt rings on arched-band headers.
    const bandsRaw = Number(src.bands);
    const bands = Number.isFinite(bandsRaw) ? Math.max(1, Math.min(4, Math.round(bandsRaw))) : 1;
    const bandStepRaw = Number(src.bandStepMeters);
    const bandStepMeters = Number.isFinite(bandStepRaw) ? Math.max(0, Math.min(0.2, bandStepRaw)) : 0.05;

    return {
        enabled: !!src.enabled,
        type,
        widthMode,
        depthMeters,
        earsMeters,
        runMode,
        bands,
        bandStepMeters,
        material: {
            mode: materialMode,
            materialId,
            ...(materialMode === WINDOW_DECORATION_MATERIAL_MODE.SLOT && materialSlotId ? { slotId: materialSlotId } : {})
        },
        template: {
            height: clamp(templateHeight, 0.001, 10.0, 0.08),
            depth: depthMeters,
            gap: clamp(templateDefaults.gap, -2.0, 2.0, 0.0),
            offset: {
                x: clamp(templateDefaults.offset.x, -5.0, 5.0, 0.0),
                y: clamp(templateDefaults.offset.y, -5.0, 5.0, 0.0),
                z: clamp(templateDefaults.offset.z, -5.0, 5.0, 0.0)
            }
        }
    };
}

export function getDefaultWindowDecorationState({ wallMaterialId = '' } = {}) {
    const out = {};
    for (const part of WINDOW_DECORATION_PART_IDS) {
        out[part] = createDefaultDecorationPartState(part, { wallMaterialId });
    }
    return out;
}

export function sanitizeWindowDecorationState(input, { wallMaterialId = '' } = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const part of WINDOW_DECORATION_PART_IDS) {
        out[part] = sanitizeDecorationPartState(part, src[part], { wallMaterialId });
    }
    return out;
}

export function resolveWindowDecorationPartState(partId, value, { wallMaterialId = '' } = {}) {
    const part = normalizePartId(partId, WINDOW_DECORATION_PART.SILL);
    const sanitized = sanitizeDecorationPartState(part, value, { wallMaterialId });
    const widthScale = WIDTH_SCALE_BY_MODE[sanitized.widthMode] ?? 1.0;
    return {
        ...sanitized,
        widthScale,
        template: {
            ...sanitized.template,
            depth: sanitized.depthMeters
        }
    };
}

export function resolveWindowDecorationState(input, { wallMaterialId = '' } = {}) {
    const sanitized = sanitizeWindowDecorationState(input, { wallMaterialId });
    const out = {};
    for (const part of WINDOW_DECORATION_PART_IDS) {
        out[part] = resolveWindowDecorationPartState(part, sanitized[part], { wallMaterialId });
    }
    return out;
}
