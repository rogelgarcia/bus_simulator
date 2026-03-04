// src/graphics/gui/mesh_fabrication/file_loader/meshFetchTransport.js

import { MESH_FABRICATION_ERROR_CODE } from '../errors/meshFabricationErrorCodes.js';
import { toMeshFabricationError } from '../errors/meshFabricationErrors.js';

export function createMeshFetchTransport({ fetchImpl = null } = {}) {
    const fetchFn = fetchImpl ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        throw new Error('[MeshFetchTransport] fetch implementation is required.');
    }

    return Object.freeze({
        async requestJson({
            url,
            force = false,
            etag = '',
            lastModified = '',
            signal = null
        }) {
            try {
                const headers = new Headers({ Accept: 'application/json' });
                if (!force && etag) headers.set('If-None-Match', etag);
                if (!force && lastModified) headers.set('If-Modified-Since', lastModified);

                const response = await fetchFn(url, {
                    method: 'GET',
                    cache: 'no-store',
                    headers,
                    signal
                });

                if (response.status === 304) {
                    return Object.freeze({
                        kind: 'not_modified',
                        status: response.status,
                        etag,
                        lastModified,
                        payload: null
                    });
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const nextEtag = response.headers.get('ETag') ?? etag;
                const nextLastModified = response.headers.get('Last-Modified') ?? lastModified;
                const payload = await response.json();
                return Object.freeze({
                    kind: 'updated',
                    status: response.status,
                    etag: nextEtag,
                    lastModified: nextLastModified,
                    payload
                });
            } catch (error) {
                throw toMeshFabricationError(error, {
                    code: MESH_FABRICATION_ERROR_CODE.LOADER_TRANSPORT_FAILED,
                    message: 'Failed to fetch live mesh payload.'
                });
            }
        }
    });
}
