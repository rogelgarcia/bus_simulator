// Persists streamed landscape edits with immutable payloads, bounded validation, and an atomic current-manifest switch.
// @ts-check
import path from 'node:path';
import { validateLandscapeManifest, encodeLandscapeChannel, queryLandscapeSelection, applyLandscapeEditBatchStreamed, LANDSCAPE_MANIFEST_BYTE_LIMIT } from '../../src/app/landscape/index.js';
import { acquireAuthoringLock, atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from './AuthoringFiles.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from './LandscapeFileIO.mjs';
import { validateLandscapePublication } from './LandscapePublication.mjs';

export const LANDSCAPE_AUTHORING_BUDGETS = Object.freeze({ maxNativeChunks: 4, maxDecodedBytes: 2 * 1024 * 1024,
    maxWorkingBytes: 8 * 1024 * 1024, maxBatchBytes: 64 * 1024 });
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

/** @param {{directory:string,maxWorkingBytes?:number}} options */
export function createLandscapeAuthoringStore({ directory, maxWorkingBytes = LANDSCAPE_AUTHORING_BUDGETS.maxWorkingBytes }) {
    if (typeof directory !== 'string' || !directory.trim()) throw new Error('[LandscapeAuthoring] directory is required');
    if (!Number.isSafeInteger(maxWorkingBytes) || maxWorkingBytes <= 0 || maxWorkingBytes > LANDSCAPE_AUTHORING_BUDGETS.maxWorkingBytes) throw new Error('[LandscapeAuthoring] maxWorkingBytes must be a positive byte limit no greater than 8 MiB');
    const base = path.resolve(directory), currentFile = path.join(base, 'manifest.json');
    let activeOperation = null;

    async function admitWorkingSet(name, operation) {
        if (activeOperation) throw new Error(`[LandscapeAuthoring] Working-set budget busy (${activeOperation}); retry after the active request completes`);
        activeOperation = name;
        try { return await operation(); }
        finally { activeOperation = null; }
    }

    async function readManifest(relative = 'manifest.json', options = {}) {
        return readLandscapeFileManifest(base, relative, options);
    }

    function reader(manifest) {
        return (chunkId, options) => readLandscapeFileChunk(base, manifest, chunkId, options);
    }

    async function ensureCurrent(bytes, signal) {
        const latest = await readAuthoringFile(currentFile, LANDSCAPE_MANIFEST_BYTE_LIMIT, { signal });
        if (!latest.equals(bytes)) throw new Error('[LandscapeAuthoring] Current manifest changed before publication; retry against its current revision');
    }

    async function snapshot(bytes, signal) {
        const url = `manifest.${authoringHash(bytes)}.json`;
        await writeImmutableAuthoringFile(authoringFile(base, url), bytes, { signal });
        return url;
    }

    async function publish(manifest, originalBytes, { signal, onProgress }) {
        const validated = validateLandscapeManifest(manifest), bytes = jsonBytes(validated);
        if (bytes.length > LANDSCAPE_MANIFEST_BYTE_LIMIT) throw new Error('[LandscapeAuthoring] Edited manifest exceeds the 1 MiB manifest budget');
        const validation = await validateLandscapePublication(base, validated, { maxWorkingBytes, signal, onProgress });
        await snapshot(bytes, signal);
        await onProgress?.(Object.freeze({ type: 'publication-ready', revision: validated.revision,
            workingBytes: validation.workingBytes, workingByteLimit: maxWorkingBytes }));
        signal?.throwIfAborted();
        await ensureCurrent(originalBytes, signal);
        await atomicAuthoringWrite(currentFile, bytes, { signal });
        return { manifest: validated, validation };
    }

    async function transaction(operation, signal) {
        signal?.throwIfAborted();
        const release = await acquireAuthoringLock(base);
        try { signal?.throwIfAborted(); return await operation(); }
        finally { await release(); }
    }

    async function query(options) {
        const { manifest } = await readManifest('manifest.json', { signal: options.signal });
        const context = await queryLandscapeSelection(manifest, options, { readChunk: reader(manifest), signal: options.signal, ...LANDSCAPE_AUTHORING_BUDGETS });
        const latest = (await readManifest('manifest.json', { signal: options.signal })).manifest;
        if (latest.revision !== manifest.revision) throw new Error('[LandscapeAuthoring] Landscape changed while resolving selection; query the current revision again');
        return context;
    }

    async function apply(batch, { signal, onProgress } = {}) {
        signal?.throwIfAborted();
        if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new Error('[LandscapeAuthoring] Edit batch must be a JSON object');
        if (Buffer.byteLength(JSON.stringify(batch)) > LANDSCAPE_AUTHORING_BUDGETS.maxBatchBytes) throw new Error('[LandscapeAuthoring] Edit batch exceeds 64 KiB admission limit');
        batch = structuredClone(batch);
        return transaction(async () => {
            const before = await readManifest('manifest.json', { signal });
            const revision = `edit-${authoringHash(JSON.stringify({ beforeRevision: before.manifest.revision, batch })).slice(0, 24)}`;
            let stagedChunks = 0, installedPayloads = 0, stagedBytes = 0;
            async function stageChunk(chunk, progress) {
                signal?.throwIfAborted();
                const bytes = encodeLandscapeChannel(chunk.heights, 'float32-le'), hash = authoringHash(bytes);
                let channel = chunk.descriptor.channels.height;
                if (channel.sha256 !== hash) {
                    const url = `payloads/${hash}.f32le`;
                    const receipt = await writeImmutableAuthoringFile(authoringFile(base, url), bytes, { signal });
                    installedPayloads += Number(receipt.created); stagedBytes += bytes.byteLength;
                    channel = { url, encoding: 'float32-le', byteLength: bytes.byteLength, decodedByteLength: bytes.byteLength, sha256: hash, revision };
                }
                stagedChunks++;
                await onProgress?.(Object.freeze({ type: 'chunk-staged', phase: progress.phase, operationId: progress.operationId,
                    completed: progress.completed, total: progress.total, workingBytes: progress.workingBytes, workingByteLimit: maxWorkingBytes,
                    chunkId: chunk.descriptor.id, url: channel.url, sha256: channel.sha256, byteLength: channel.byteLength }));
                signal?.throwIfAborted();
                return channel;
            }
            const result = await applyLandscapeEditBatchStreamed(before.manifest, batch, { readChunk: reader(before.manifest), stageChunk,
                newRevision: revision, signal, maxWorkingBytes });
            const candidate = result.manifestDraft;
            candidate.editHistory.previousManifestUrl = await snapshot(before.bytes, signal);
            const { manifest, validation } = await publish(candidate, before.bytes, { signal, onProgress });
            return { status: 'applied', landscapeId: manifest.id, batchId: batch.id, beforeRevision: before.manifest.revision,
                revision: manifest.revision, summary: { ...result.summary, workingBytes: Math.max(result.summary.workingBytes, validation.workingBytes),
                    workingByteLimit: maxWorkingBytes, stagedChunks, installedPayloads, stagedBytes, validation }, canRevert: true };
        }, signal);
    }

    async function revert({ expectedRevision, batchId, signal, onProgress } = {}) {
        return transaction(async () => {
            const before = await readManifest('manifest.json', { signal }), history = before.manifest.editHistory;
            if (expectedRevision !== before.manifest.revision) throw new Error('[LandscapeAuthoring] Revert expectedRevision is stale or missing');
            if (!history?.lastBatchId || !history.previousManifestUrl) throw new Error('[LandscapeAuthoring] No last applied batch is available to revert');
            if (batchId !== undefined && batchId !== history.lastBatchId) throw new Error('[LandscapeAuthoring] Revert batchId is not the last applied batch');
            if (!/^manifest\.[a-f0-9]{64}\.json$/.test(history.previousManifestUrl)) throw new Error('[LandscapeAuthoring] Invalid previous manifest snapshot identity');
            const previous = await readManifest(history.previousManifestUrl, { signal });
            if (`manifest.${authoringHash(previous.bytes)}.json` !== history.previousManifestUrl || previous.manifest.id !== before.manifest.id) throw new Error('[LandscapeAuthoring] Previous manifest snapshot failed authentication');
            if (before.manifest.capabilities.includes('chunk-hierarchy-v1') && !previous.manifest.capabilities.includes('chunk-hierarchy-v1')) throw new Error('[LandscapeAuthoring] Prepare the hierarchy to upgrade the previous saved snapshot before reverting');
            const candidate = structuredClone(previous.manifest);
            candidate.revision = `revert-${authoringHash(JSON.stringify({ beforeRevision: before.manifest.revision, previous: history.previousManifestUrl })).slice(0, 24)}`;
            candidate.capabilities = [...new Set([...candidate.capabilities, 'terrain-editing-v1'])];
            candidate.editHistory = { batchIds: [...history.batchIds], lastBatchId: null, previousManifestUrl: null };
            await snapshot(before.bytes, signal);
            const { manifest, validation } = await publish(candidate, before.bytes, { signal, onProgress });
            return { status: 'reverted', landscapeId: manifest.id, revertedBatchId: history.lastBatchId,
                beforeRevision: before.manifest.revision, revision: manifest.revision, canRevert: false,
                summary: { workingBytes: validation.workingBytes, workingByteLimit: maxWorkingBytes, validation } };
        }, signal);
    }

    async function readState() {
        const { manifest } = await readManifest();
        return { landscapeId: manifest.id, revision: manifest.revision, lastBatchId: manifest.editHistory?.lastBatchId ?? null,
            canRevert: !!manifest.editHistory?.lastBatchId && !!manifest.editHistory.previousManifestUrl,
            regions: manifest.regions, budgets: { ...LANDSCAPE_AUTHORING_BUDGETS, maxWorkingBytes } };
    }

    const select = options => admitWorkingSet('query', () => query(options));
    return Object.freeze({ query: select, select, apply: (batch, options) => admitWorkingSet('apply', () => apply(batch, options)),
        revert: options => admitWorkingSet('revert', () => revert(options)), readState });
}
