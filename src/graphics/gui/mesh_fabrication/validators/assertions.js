// src/graphics/gui/mesh_fabrication/validators/assertions.js

import { MeshFabricationError } from '../errors/meshFabricationErrors.js';

export function assertObject(value, label, code = 'MF_VALIDATION_OBJECT') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new MeshFabricationError(code, `${label} must be an object.`, { label });
    }
    return value;
}

export function assertString(value, label, code = 'MF_VALIDATION_STRING') {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new MeshFabricationError(code, `${label} must be a non-empty string.`, { label });
    }
    return value.trim();
}

export function assertFiniteNumber(value, label, code = 'MF_VALIDATION_NUMBER') {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new MeshFabricationError(code, `${label} must be a finite number.`, { label, value });
    }
    return num;
}

export function assertBoolean(value, label, code = 'MF_VALIDATION_BOOLEAN') {
    if (typeof value !== 'boolean') {
        throw new MeshFabricationError(code, `${label} must be boolean.`, { label });
    }
    return value;
}

export function formatDeterministicValidationError(error) {
    const code = typeof error?.code === 'string' ? error.code : 'MF_VALIDATION_UNKNOWN';
    const message = typeof error?.message === 'string' ? error.message : 'Validation failed.';
    const details = error?.details && typeof error.details === 'object' ? error.details : null;
    return Object.freeze({ code, message, details });
}
