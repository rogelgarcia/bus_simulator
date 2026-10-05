// Acquires and builds bounded terrain chunks without blocking the render loop.
// @ts-check
// A build may carry a natural soil request (AI577 D5): the chunk's own natural-soil page is then read and authenticated here, used for the
// fallback colors of its planning-only samples and dropped with the job; natives the request leaves on the fallback keep the overview infill.
import { loadLandscapeChunk } from '../../../app/landscape/LandscapePayload.js';
import { loadLandscapeTerrainFieldPage } from '../../../app/landscape/LandscapeTerrainFieldsPayload.js';
import { createLandscapeNaturalSoilResolver } from '../../../app/landscape/LandscapeNaturalSoil.js';
import { buildLandscapeMeshBuffers, landscapeMeshTransferList } from './LandscapeMeshBuffers.js';
import { createLandscapeNaturalPresentation } from './LandscapeNaturalPresentation.js';

let context = null;
let presentation = null;

/** @param {any} descriptor @param {any} natural landscape-natural-soil-request covering the chunk */
async function naturalSamples(descriptor, natural) {
    const resolver = createLandscapeNaturalSoilResolver(context.manifest, natural);
    const labels = await resolver.load(descriptor, (entry, url) => loadLandscapeTerrainFieldPage(entry, { manifestUrl: url }));
    const at = (column, row) => resolver.label(labels, descriptor, descriptor.startColumn + column * descriptor.sampleStride, descriptor.startRow + row * descriptor.sampleStride);
    return { naturalAt: labels ? at : () => -1, read: !!labels };
}

self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') { context = data; presentation = createLandscapeNaturalPresentation(data.manifest, data.root); return; }
    const { id, chunkId, parent, sourceOnly, chunk: suppliedChunk, natural } = data;
    try {
        if (!context) throw new Error('Terrain worker has no landscape context');
        const chunk = suppliedChunk ?? await loadLandscapeChunk(context.manifest, chunkId, { manifestUrl: context.manifestUrl });
        const parentChunk = sourceOnly || parent || !chunk.descriptor.parentId ? parent ?? chunk : await loadLandscapeChunk(context.manifest, chunk.descriptor.parentId, { manifestUrl: context.manifestUrl });
        const soil = !sourceOnly && natural ? await naturalSamples(chunk.descriptor, natural) : { naturalAt: () => -1, read: false };
        const buffers = sourceOnly ? null : buildLandscapeMeshBuffers({ chunk, parent: parentChunk, root: context.root, manifest: context.manifest, presentation, naturalAt: soil.naturalAt });
        const transfer = [chunk.heights.buffer, chunk.landCover.buffer, ...(buffers ? landscapeMeshTransferList(buffers) : [])];
        self.postMessage({ id, chunk, buffers, naturalSoil: { read: soil.read } }, transfer);
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
