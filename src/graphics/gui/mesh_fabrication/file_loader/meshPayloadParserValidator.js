// src/graphics/gui/mesh_fabrication/file_loader/meshPayloadParserValidator.js

import { MESH_FABRICATION_ERROR_CODE } from '../errors/meshFabricationErrorCodes.js';
import { toMeshFabricationError } from '../errors/meshFabricationErrors.js';

export function createMeshPayloadParserValidator({ parseDocument }) {
    if (typeof parseDocument !== 'function') {
        throw new Error('[MeshPayloadParserValidator] parseDocument function is required.');
    }

    return Object.freeze({
        validateAndParse(payload) {
            try {
                return parseDocument(payload);
            } catch (error) {
                throw toMeshFabricationError(error, {
                    code: MESH_FABRICATION_ERROR_CODE.LOADER_PARSE_FAILED,
                    message: 'Live mesh payload failed contract parsing.'
                });
            }
        }
    });
}
