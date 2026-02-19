// Shared deterministic helpers for the texture correction pipeline.
import path from 'node:path';

export function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

export function toPosixPath(value) {
    return String(value ?? '').split(path.sep).join('/');
}

export function normalizeStringList(value) {
    const src = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of src) {
        const id = String(item ?? '').trim();
        if (!id || out.includes(id)) continue;
        out.push(id);
    }
    return out;
}

export function parseCsvList(raw) {
    if (raw == null) return [];
    return normalizeStringList(String(raw).split(',').map((part) => part.trim()));
}

export function deepMerge(base, patch) {
    const a = isPlainObject(base) ? base : {};
    const b = isPlainObject(patch) ? patch : {};
    const out = { ...a };
    for (const key of Object.keys(b)) {
        const lhs = a[key];
        const rhs = b[key];
        if (isPlainObject(lhs) && isPlainObject(rhs)) {
            out[key] = deepMerge(lhs, rhs);
            continue;
        }
        if (Array.isArray(rhs)) {
            out[key] = [...rhs];
            continue;
        }
        out[key] = rhs;
    }
    return out;
}

export function sortObjectKeysDeep(value) {
    if (Array.isArray(value)) return value.map((item) => sortObjectKeysDeep(item));
    if (!isPlainObject(value)) return value;
    const out = {};
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
        out[key] = sortObjectKeysDeep(value[key]);
    }
    return out;
}

export function ensureParentDirSyncPath(filePath) {
    return path.dirname(path.resolve(filePath));
}

export function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

