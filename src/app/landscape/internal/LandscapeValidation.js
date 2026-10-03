// Provides private validation primitives for the landscape public boundaries.
// @ts-check

export function requireCondition(condition, message) {
    if (!condition) throw new Error(`[Landscape] ${message}`);
}

export function requireFinite(value, label) {
    requireCondition(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
}

export function requireInteger(value, min, max, label) {
    requireCondition(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be an integer in ${min}..${max}`);
}

export function requireId(value, label) {
    requireCondition(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(value), `${label} must be a stable identifier`);
}

export function requireBounds(bounds, label = 'bounds') {
    requireCondition(!!bounds && typeof bounds === 'object', `${label} is required`);
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) requireFinite(bounds[key], `${label}.${key}`);
    requireCondition(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ, `${label} must have positive area`);
}

export function requireRelativeUrl(value, label) {
    requireCondition(typeof value === 'string' && value.length <= 512 && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value), `${label} must be a relative asset path`);
    requireCondition(!value.split('/').some((part) => part === '..' || part === '.' || !part), `${label} must not traverse directories`);
}

export function requireSha256(value, label) {
    requireCondition(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label} must be a lowercase SHA-256`);
}

export function freezeData(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freezeData);
        Object.freeze(value);
    }
    return value;
}

export function clonePlainData(value, label = 'manifest', depth = 0) {
    requireCondition(depth < 64, `${label} exceeds the maximum nesting depth`);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        requireFinite(value, label);
        return value;
    }
    requireCondition(!!value && typeof value === 'object', `${label} must contain plain JSON data`);
    if (Array.isArray(value)) return value.map((entry, i) => clonePlainData(entry, `${label}[${i}]`, depth + 1));
    requireCondition(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, `${label} must contain plain JSON objects`);
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
        requireCondition(key !== '__proto__' && key !== 'constructor' && key !== 'prototype', `${label} has an unsupported property ${key}`);
        result[key] = clonePlainData(entry, `${label}.${key}`, depth + 1);
    }
    return result;
}

export function nearlyEqual(a, b) {
    return Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
}
