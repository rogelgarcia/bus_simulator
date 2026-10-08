// Reads independently authenticated landscape chunks for bounded authoring and hierarchy preparation.
// @ts-check
import { decodeLandscapeChannel, validateLandscapeManifest, LANDSCAPE_MANIFEST_BYTE_LIMIT, LANDSCAPE_CACHE_GUIDE } from '../../src/app/landscape/index.js';
import { authoringFile, authoringHash, readAuthoringFile } from './AuthoringFiles.mjs';

/** A missing manifest means the local, never-tracked landscape cache is absent or incomplete; say how to produce it (keeps code ENOENT). */
function landscapeCacheReadError(error, directory, relative) {
    if (error?.code !== 'ENOENT') return error;
    const missing = new Error(`[LandscapeCache] ${relative} is not installed in ${directory}. The landscape cache is local and never tracked by Git: generate it with the landscape bake leaves or install a bundle with node tools/bake.mjs --target landscape/cache-install; see ${LANDSCAPE_CACHE_GUIDE}`, { cause: error });
    return Object.assign(missing, { code: 'ENOENT' });
}

/** @param {string} directory @param {string} [relative] @param {{signal?:AbortSignal}} [options] */
export async function readLandscapeFileManifest(directory, relative = 'manifest.json', { signal } = {}) {
    let bytes;
    try { bytes = await readAuthoringFile(authoringFile(directory, relative), LANDSCAPE_MANIFEST_BYTE_LIMIT, { signal }); }
    catch (error) { throw landscapeCacheReadError(error, directory, relative); }
    return { bytes, manifest: validateLandscapeManifest(JSON.parse(bytes.toString('utf8'))) };
}

/** @param {string} directory @param {any} manifest @param {string} chunkId @param {{signal?:AbortSignal,descriptor?:any}} [options] */
export async function readLandscapeFileChunk(directory, manifest, chunkId, { signal, descriptor: stagedDescriptor } = {}) {
    signal?.throwIfAborted();
    const source = manifest.chunks.find(chunk => chunk.id === chunkId);
    if (!source) throw new Error(`[LandscapeAuthoring] Unknown chunk ${chunkId}`);
    const descriptor = stagedDescriptor ?? source;
    if (descriptor.id !== chunkId || ['columns', 'rows', 'startColumn', 'startRow', 'sampleStride', 'level', 'column', 'row'].some(key => descriptor[key] !== source[key])) throw new Error(`[LandscapeAuthoring] Staged spatial identity differs for ${chunkId}`);
    const decoded = {};
    for (const [name, channel] of Object.entries(descriptor.channels)) {
        signal?.throwIfAborted();
        const expectedBytes = descriptor.columns * descriptor.rows * (name === 'height' ? 4 : 1);
        if (!['height', 'landCover'].includes(name) || channel.byteLength !== expectedBytes || channel.decodedByteLength !== expectedBytes) throw new Error(`[LandscapeAuthoring] Invalid staged channel size: ${chunkId}/${name}`);
        const bytes = await readAuthoringFile(authoringFile(directory, channel.url), channel.byteLength, { signal });
        if (authoringHash(bytes) !== channel.sha256) throw new Error(`[LandscapeAuthoring] Channel hash mismatch: ${chunkId}/${name}`);
        decoded[name] = decodeLandscapeChannel(bytes, channel, name === 'height'
            ? { minHeight: descriptor.minHeight, maxHeight: descriptor.maxHeight }
            : { allowedIds: new Set(manifest.landCover.catalog.map(entry => entry.id)) });
    }
    signal?.throwIfAborted();
    return { descriptor, heights: decoded.height, landCover: decoded.landCover };
}
