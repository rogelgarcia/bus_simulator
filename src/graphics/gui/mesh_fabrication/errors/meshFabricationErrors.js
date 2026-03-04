// src/graphics/gui/mesh_fabrication/errors/meshFabricationErrors.js

import {
    MESH_FABRICATION_ERROR_CODE,
    MESH_FABRICATION_ERROR_UI_MESSAGE
} from './meshFabricationErrorCodes.js';

export class MeshFabricationError extends Error {
    constructor(code, message, details = null, cause = null) {
        super(message);
        this.name = 'MeshFabricationError';
        this.code = typeof code === 'string' ? code : MESH_FABRICATION_ERROR_CODE.UNKNOWN;
        this.details = details && typeof details === 'object' ? Object.freeze({ ...details }) : null;
        this.cause = cause ?? null;
    }
}

export function toMeshFabricationError(error, {
    code = MESH_FABRICATION_ERROR_CODE.UNKNOWN,
    message = null,
    details = null
} = {}) {
    if (error instanceof MeshFabricationError) return error;
    const finalMessage = typeof message === 'string' && message.trim()
        ? message.trim()
        : (typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : 'Mesh fabrication failure.');
    return new MeshFabricationError(code, finalMessage, details, error);
}

export function toUiErrorMessage(error) {
    const code = typeof error?.code === 'string' ? error.code : MESH_FABRICATION_ERROR_CODE.UNKNOWN;
    return MESH_FABRICATION_ERROR_UI_MESSAGE[code] ?? MESH_FABRICATION_ERROR_UI_MESSAGE[MESH_FABRICATION_ERROR_CODE.UNKNOWN];
}
