// Reads independently authenticated landscape chunks for bounded authoring and hierarchy preparation.
// @ts-check
import { decodeLandscapeChannel, validateLandscapeManifest, LANDSCAPE_MANIFEST_BYTE_LIMIT } from '../../src/app/landscape/index.js';
import { authoringFile, authoringHash, readAuthoringFile } from './AuthoringFiles.mjs';

/** @param {string} directory @param {string} [relative] */
export async function readLandscapeFileManifest(directory, relative = 'manifest.json') {
    const bytes = await readAuthoringFile(authoringFile(directory, relative), LANDSCAPE_MANIFEST_BYTE_LIMIT);
    return { bytes, manifest: validateLandscapeManifest(JSON.parse(bytes.toString('utf8'))) };
}

/** @param {string} directory @param {any} manifest @param {string} chunkId @param {{signal?:AbortSignal}} [options] */
export async function readLandscapeFileChunk(directory, manifest, chunkId, { signal } = {}) {
    signal?.throwIfAborted();
    const descriptor = manifest.chunks.find(chunk => chunk.id === chunkId);
    if (!descriptor) throw new Error(`[LandscapeAuthoring] Unknown chunk ${chunkId}`);
    const decoded = {};
    for (const [name, channel] of Object.entries(descriptor.channels)) {
        signal?.throwIfAborted();
        const bytes = await readAuthoringFile(authoringFile(directory, channel.url), channel.byteLength);
        if (authoringHash(bytes) !== channel.sha256) throw new Error(`[LandscapeAuthoring] Channel hash mismatch: ${chunkId}/${name}`);
        decoded[name] = decodeLandscapeChannel(bytes, channel, name === 'height'
            ? { minHeight: descriptor.minHeight, maxHeight: descriptor.maxHeight }
            : { allowedIds: new Set(manifest.landCover.catalog.map(entry => entry.id)) });
    }
    signal?.throwIfAborted();
    return { descriptor, heights: decoded.height, landCover: decoded.landCover };
}
