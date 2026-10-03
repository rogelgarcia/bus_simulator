// Acquires and builds bounded terrain chunks without blocking the render loop.
// @ts-check
import { loadLandscapeChunk } from '../../../app/landscape/LandscapePayload.js';
import { buildLandscapeMeshBuffers, landscapeMeshTransferList } from './LandscapeMeshBuffers.js';

let context = null;
self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') { context = data; return; }
    const { id, chunkId, parent, sourceOnly, chunk: suppliedChunk } = data;
    try {
        if (!context) throw new Error('Terrain worker has no landscape context');
        const chunk = suppliedChunk ?? await loadLandscapeChunk(context.manifest, chunkId, { manifestUrl: context.manifestUrl });
        const parentChunk = sourceOnly || parent || !chunk.descriptor.parentId ? parent ?? chunk : await loadLandscapeChunk(context.manifest, chunk.descriptor.parentId, { manifestUrl: context.manifestUrl });
        const buffers = sourceOnly ? null : buildLandscapeMeshBuffers({ chunk, parent: parentChunk, root: context.root, manifest: context.manifest });
        const transfer = [chunk.heights.buffer, chunk.landCover.buffer, ...(buffers ? landscapeMeshTransferList(buffers) : [])];
        self.postMessage({ id, chunk, buffers }, transfer);
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
