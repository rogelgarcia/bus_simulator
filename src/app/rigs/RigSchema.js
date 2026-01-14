// src/app/rigs/RigSchema.js
// Defines a declarative schema format for runtime rig controls.

export const RIG_PROPERTY_TYPE = Object.freeze({
    ENUM: 'enum',
    NUMBER: 'number',
    BOOLEAN: 'boolean'
});

export function createEnumProperty({ id, label, options, defaultValue } = {}) {
    const safeId = typeof id === 'string' ? id : '';
    if (!safeId) throw new Error('[RigSchema] Enum property id must be a non-empty string.');
    const safeLabel = typeof label === 'string' && label ? label : safeId;
    const list = Array.isArray(options) ? options : [];
    const safeOptions = list
        .map((opt) => ({
            id: typeof opt?.id === 'string' ? opt.id : '',
            label: typeof opt?.label === 'string' && opt.label ? opt.label : (typeof opt?.id === 'string' ? opt.id : '')
        }))
        .filter((opt) => opt.id);
    if (safeOptions.length === 0) throw new Error(`[RigSchema] Enum property "${safeId}" must define at least one option.`);

    const defaultOptId = typeof defaultValue === 'string' ? defaultValue : safeOptions[0].id;
    const normalizedDefault = normalizeEnumValue(defaultOptId, safeOptions, safeOptions[0].id);
    return Object.freeze({
        type: RIG_PROPERTY_TYPE.ENUM,
        id: safeId,
        label: safeLabel,
        options: Object.freeze(safeOptions),
        defaultValue: normalizedDefault
    });
}

export function createNumberProperty({ id, label, min = 0, max = 1, step = 0.01, defaultValue = 0 } = {}) {
    const safeId = typeof id === 'string' ? id : '';
    if (!safeId) throw new Error('[RigSchema] Number property id must be a non-empty string.');
    const safeLabel = typeof label === 'string' && label ? label : safeId;

    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) ? max : safeMin + 1;
    const safeStep = Number.isFinite(step) && step > 0 ? step : 0.01;
    const safeDefault = clampNumber(defaultValue, { min: safeMin, max: safeMax, step: safeStep });

    return Object.freeze({
        type: RIG_PROPERTY_TYPE.NUMBER,
        id: safeId,
        label: safeLabel,
        min: safeMin,
        max: safeMax,
        step: safeStep,
        defaultValue: safeDefault
    });
}

export function createBooleanProperty({ id, label, defaultValue = false } = {}) {
    const safeId = typeof id === 'string' ? id : '';
    if (!safeId) throw new Error('[RigSchema] Boolean property id must be a non-empty string.');
    const safeLabel = typeof label === 'string' && label ? label : safeId;
    const safeDefault = normalizeBooleanValue(defaultValue);

    return Object.freeze({
        type: RIG_PROPERTY_TYPE.BOOLEAN,
        id: safeId,
        label: safeLabel,
        defaultValue: safeDefault
    });
}

export function normalizeEnumValue(value, options, fallback) {
    const id = typeof value === 'string' ? value : '';
    const list = Array.isArray(options) ? options : [];
    if (id && list.some((opt) => opt?.id === id)) return id;
    return typeof fallback === 'string' ? fallback : (typeof list[0]?.id === 'string' ? list[0].id : '');
}

export function normalizeBooleanValue(value) {
    return !!value;
}

export function clampNumber(value, { min = -Infinity, max = Infinity, step = 0 } = {}) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Number.isFinite(min) ? min : 0;
    const clamped = Math.max(min, Math.min(max, num));
    if (!Number.isFinite(step) || step <= 0) return clamped;
    const snapped = Math.round(clamped / step) * step;
    return Math.max(min, Math.min(max, snapped));
}

export function isRigApi(api) {
    return !!api
        && typeof api === 'object'
        && !!api.schema
        && typeof api.getValue === 'function'
        && typeof api.setValue === 'function';
}

