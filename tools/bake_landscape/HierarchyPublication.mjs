// Authenticates staged hierarchy resources and switches the saved manifest only after immutable installation.
// @ts-check
import path from 'node:path';
import { decodeLandscapeChannel, validateLandscapeManifest, LANDSCAPE_MANIFEST_BYTE_LIMIT } from '../../src/app/landscape/index.js';
import { authoringFile, authoringHash, atomicAuthoringWrite, readAuthoringFile, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';

function validateAuthority(manifest, source) {
    if (!manifest.capabilities.includes('chunk-hierarchy-v1')) throw new Error('Hierarchy capability is missing');
    for (const chunk of manifest.chunks) {
        if (chunk.level === manifest.grid.maxLevel) {
            const previous = source.chunks.find(node => node.id === chunk.id);
            if (JSON.stringify({ ...chunk, parentId: previous.parentId }) !== JSON.stringify(previous)) throw new Error(`Hierarchy changed native authority ${chunk.id}`);
        }
    }
    for (const key of ['id', 'name', 'overviewId', 'grid', 'bounds', 'coordinates', 'elevation', 'soil', 'landCover', 'provenance', 'operations', 'references', 'regions', 'attachments']) {
        if (JSON.stringify(manifest[key]) !== JSON.stringify(source[key])) throw new Error(`Hierarchy changed authored ${key}`);
    }
    if (JSON.stringify(manifest.editHistory?.batchIds) !== JSON.stringify(source.editHistory?.batchIds)
        || manifest.editHistory?.lastBatchId !== source.editHistory?.lastBatchId) throw new Error('Hierarchy changed accepted authoring history');
}

async function inspectHierarchyCandidate(prepared) {
    const bytes = await readAuthoringFile(prepared.manifestFile, LANDSCAPE_MANIFEST_BYTE_LIMIT);
    const manifest = validateLandscapeManifest(JSON.parse(bytes.toString('utf8')));
    if (authoringHash(bytes) !== prepared.report.manifestSha256) throw new Error('Hierarchy manifest/receipt integrity mismatch');
    const source = validateLandscapeManifest(JSON.parse(prepared.inputManifestBytes.toString('utf8'))), files = new Map();
    validateAuthority(manifest, source);
    async function validatePayloads(candidate) {
        for (const chunk of candidate.chunks.filter(node => node.level !== candidate.grid.maxLevel)) {
            for (const [name, channel] of Object.entries(chunk.channels)) {
                const file = authoringFile(prepared.outputDirectory, channel.url);
                const payload = await readAuthoringFile(file, channel.byteLength);
                if (authoringHash(payload) !== channel.sha256) throw new Error(`Hierarchy payload hash mismatch ${chunk.id}/${name}`);
                decodeLandscapeChannel(payload, channel, name === 'height' ? { minHeight: chunk.minHeight, maxHeight: chunk.maxHeight }
                    : { allowedIds: new Set(candidate.landCover.catalog.map(entry => entry.id)) });
                files.set(channel.url, { sha256: channel.sha256, byteLength: channel.byteLength });
            }
        }
    }
    await validatePayloads(manifest);
    const previousUrl = manifest.editHistory?.previousManifestUrl, sourcePreviousUrl = source.editHistory?.previousManifestUrl;
    if (previousUrl !== sourcePreviousUrl) {
        if (!previousUrl || !sourcePreviousUrl) throw new Error('Hierarchy changed authoring snapshot availability');
        const previousBytes = await readAuthoringFile(authoringFile(prepared.outputDirectory, previousUrl), LANDSCAPE_MANIFEST_BYTE_LIMIT);
        const sourcePreviousBytes = await readAuthoringFile(authoringFile(prepared.directory, sourcePreviousUrl), LANDSCAPE_MANIFEST_BYTE_LIMIT);
        if (`manifest.${authoringHash(previousBytes)}.json` !== previousUrl || `manifest.${authoringHash(sourcePreviousBytes)}.json` !== sourcePreviousUrl) throw new Error('Hierarchy previous snapshot hash mismatch');
        const previous = validateLandscapeManifest(JSON.parse(previousBytes.toString('utf8')));
        const sourcePrevious = validateLandscapeManifest(JSON.parse(sourcePreviousBytes.toString('utf8')));
        validateAuthority(previous, sourcePrevious);
        if (previous.editHistory?.previousManifestUrl !== sourcePrevious.editHistory?.previousManifestUrl) throw new Error('Hierarchy changed older snapshot history');
        await validatePayloads(previous);
        files.set(previousUrl, { sha256: authoringHash(previousBytes), byteLength: previousBytes.length });
    }
    return { manifest, bytes, files };
}

/** @param {{directory:string,outputDirectory:string,manifestFile:string,report:any,inputManifestBytes:Buffer}} prepared */
export async function validateHierarchyCandidate(prepared) {
    return (await inspectHierarchyCandidate(prepared)).manifest;
}

/** Caller owns the same directory mutation lock used by the authoring store.
 * @param {{directory:string,outputDirectory:string,manifestFile:string,files:string[],report:any,inputManifestBytes:Buffer}} prepared */
export async function publishLandscapeHierarchy(prepared) {
    const candidate = await inspectHierarchyCandidate(prepared);
    const current = path.join(prepared.directory, 'manifest.json');
    if (!(await readAuthoringFile(current, LANDSCAPE_MANIFEST_BYTE_LIMIT)).equals(prepared.inputManifestBytes)) throw new Error('Landscape changed before hierarchy publication');
    const installed = [];
    for (const [relative, receipt] of candidate.files) {
        const payload = await readAuthoringFile(authoringFile(prepared.outputDirectory, relative), receipt.byteLength);
        if (authoringHash(payload) !== receipt.sha256) throw new Error(`Hierarchy payload changed during publication: ${relative}`);
        const destination = authoringFile(prepared.directory, relative);
        await writeImmutableAuthoringFile(destination, payload); installed.push(destination);
    }
    for (const bytes of [prepared.inputManifestBytes, candidate.bytes]) {
        const file = path.join(prepared.directory, `manifest.${authoringHash(bytes)}.json`);
        await writeImmutableAuthoringFile(file, bytes); installed.push(file);
    }
    if (!(await readAuthoringFile(current, LANDSCAPE_MANIFEST_BYTE_LIMIT)).equals(prepared.inputManifestBytes)) throw new Error('Landscape changed during hierarchy installation');
    await atomicAuthoringWrite(current, candidate.bytes); installed.push(current);
    return installed;
}
