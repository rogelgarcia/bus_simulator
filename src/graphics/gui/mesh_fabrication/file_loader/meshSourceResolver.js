// src/graphics/gui/mesh_fabrication/file_loader/meshSourceResolver.js
import {
    MESH_FABRICATION_ERROR_CODE
} from '../errors/meshFabricationErrorCodes.js';
import { toMeshFabricationError } from '../errors/meshFabricationErrors.js';

const LIVE_MESH_DEFAULT_API_PATH = '/api/mesh/current';
const LIVE_MESH_DEFAULT_FILE_PATH = '/assets/public/mesh_fabrication/handoff/mesh.live.v1.json';
const LIVE_MESH_DEFAULT_FILE_RELATIVE_PATH = '../assets/public/mesh_fabrication/handoff/mesh.live.v1.json';

function resolveLiveMeshEndpointLocal(locationLike = null) {
    const fallbackHref = (typeof window !== 'undefined' && window.location?.href)
        ? String(window.location.href)
        : 'http://127.0.0.1:8765/screens/mesh_fabrication.html';
    const locationRef = locationLike ?? (typeof window !== 'undefined' ? window.location : null);
    const href = typeof locationRef?.href === 'string' ? locationRef.href : fallbackHref;
    const pageUrl = new URL(href);
    const endpointOverride = pageUrl.searchParams.get('meshEndpoint');
    if (endpointOverride) return endpointOverride;
    if (pageUrl.protocol === 'http:' || pageUrl.protocol === 'https:') {
        return new URL(LIVE_MESH_DEFAULT_API_PATH, pageUrl.origin).toString();
    }
    return new URL(LIVE_MESH_DEFAULT_API_PATH, pageUrl).toString();
}

function resolveLiveMeshStaticFileUrlLocal(locationLike = null) {
    const fallbackHref = (typeof window !== 'undefined' && window.location?.href)
        ? String(window.location.href)
        : 'http://127.0.0.1:8765/screens/mesh_fabrication.html';
    const locationRef = locationLike ?? (typeof window !== 'undefined' ? window.location : null);
    const href = typeof locationRef?.href === 'string' ? locationRef.href : fallbackHref;
    const pageUrl = new URL(href);
    if (pageUrl.protocol === 'http:' || pageUrl.protocol === 'https:') {
        return new URL(LIVE_MESH_DEFAULT_FILE_PATH, pageUrl.origin).toString();
    }
    return new URL(LIVE_MESH_DEFAULT_FILE_RELATIVE_PATH, pageUrl).toString();
}

export function createMeshSourceResolver(locationLike = null) {
    return Object.freeze({
        resolveApiEndpoint() {
            try {
                return resolveLiveMeshEndpointLocal(locationLike);
            } catch (error) {
                throw toMeshFabricationError(error, {
                    code: MESH_FABRICATION_ERROR_CODE.LOADER_ENDPOINT_RESOLVE_FAILED,
                    message: 'Failed to resolve mesh API endpoint.'
                });
            }
        },
        resolveStaticFileUrl() {
            try {
                return resolveLiveMeshStaticFileUrlLocal(locationLike);
            } catch (error) {
                throw toMeshFabricationError(error, {
                    code: MESH_FABRICATION_ERROR_CODE.LOADER_ENDPOINT_RESOLVE_FAILED,
                    message: 'Failed to resolve mesh static file URL.'
                });
            }
        }
    });
}
