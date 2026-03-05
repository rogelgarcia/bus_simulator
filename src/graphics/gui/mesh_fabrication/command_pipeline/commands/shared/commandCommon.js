// Shared normalization and validation helpers for command modules.

export function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[MeshCommandPipeline] ${label} must be an object.`);
    }
    return value;
}

export function assertString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[MeshCommandPipeline] ${label} must be a non-empty string.`);
    }
    return value.trim();
}

export function assertFiniteNumber(value, label) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`[MeshCommandPipeline] ${label} must be a finite number.`);
    }
    return num;
}

export function assertPositiveNumber(value, label) {
    const num = assertFiniteNumber(value, label);
    if (num <= 0) {
        throw new Error(`[MeshCommandPipeline] ${label} must be > 0.`);
    }
    return num;
}

export function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    return false;
}

export function normalizeVec3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`[MeshCommandPipeline] ${label} must be a [x,y,z] array.`);
    }
    return [
        assertFiniteNumber(value[0], `${label}[0]`),
        assertFiniteNumber(value[1], `${label}[1]`),
        assertFiniteNumber(value[2], `${label}[2]`)
    ];
}

export function normalizeVec2(value, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`[MeshCommandPipeline] ${label} must be a [u,v] array.`);
    }
    return [
        assertFiniteNumber(value[0], `${label}[0]`),
        assertFiniteNumber(value[1], `${label}[1]`)
    ];
}

export function sanitizeToken(value, fallback = 'op001') {
    const raw = String(value ?? '').trim();
    const token = raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return token || fallback;
}

export function normalizeOutputPolicy(value, label) {
    if (value === undefined || value === null) return 'replace_target';
    const policy = assertString(value, label);
    if (policy !== 'replace_target' && policy !== 'new_object') {
        throw new Error(`[MeshCommandPipeline] ${label} must be "replace_target" or "new_object".`);
    }
    return policy;
}

export function normalizeSubtractMode(value, label) {
    if (value === undefined || value === null) return 'subtract_through';
    const mode = assertString(value, label);
    if (mode !== 'subtract_through' && mode !== 'subtract_clamped') {
        throw new Error(`[MeshCommandPipeline] ${label} must be "subtract_through" or "subtract_clamped".`);
    }
    return mode;
}

export function freezeCommand(command) {
    return Object.freeze({
        ...command,
        args: Object.freeze({ ...(command.args ?? {}) }),
        source: Object.freeze({ ...(command.source ?? {}) })
    });
}

export function pad3(value) {
    return String(Math.max(0, Number(value) | 0)).padStart(3, '0');
}
