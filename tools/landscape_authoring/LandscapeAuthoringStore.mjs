// Persists bounded landscape edits with immutable payloads, revision snapshots, and an atomic current-manifest switch.
// @ts-check
import path from 'node:path';
import { validateLandscapeManifest, encodeLandscapeChannel, queryLandscapeSelection, applyLandscapeEditBatch, LANDSCAPE_MANIFEST_BYTE_LIMIT } from '../../src/app/landscape/index.js';
import { acquireAuthoringLock, atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from './AuthoringFiles.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from './LandscapeFileIO.mjs';

export const LANDSCAPE_AUTHORING_BUDGETS = Object.freeze({ maxNativeChunks: 4, maxDecodedBytes: 2 * 1024 * 1024, maxBatchBytes: 64 * 1024 });
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

/** @param {{directory:string}} options */
export function createLandscapeAuthoringStore({ directory }) {
    if (typeof directory !== 'string' || !directory.trim()) throw new Error('[LandscapeAuthoring] directory is required');
    const base = path.resolve(directory), currentFile = path.join(base, 'manifest.json');
    let activeOperation = null;

    async function admitWorkingSet(name, operation) {
        if (activeOperation) throw new Error(`[LandscapeAuthoring] Working-set budget busy (${activeOperation}); retry after the active request completes`);
        activeOperation = name;
        try { return await operation(); }
        finally { activeOperation = null; }
    }

    async function readManifest(relative = 'manifest.json') {
        return readLandscapeFileManifest(base, relative);
    }

    function reader(manifest) {
        return (chunkId, options) => readLandscapeFileChunk(base, manifest, chunkId, options);
    }

    async function ensureCurrent(bytes) {
        const latest = await readAuthoringFile(currentFile, LANDSCAPE_MANIFEST_BYTE_LIMIT);
        if (!latest.equals(bytes)) throw new Error('[LandscapeAuthoring] Current manifest changed before publication; retry against its current revision');
    }

    async function snapshot(bytes) {
        const url = `manifest.${authoringHash(bytes)}.json`;
        await writeImmutableAuthoringFile(authoringFile(base, url), bytes);
        return url;
    }

    async function publish(manifest, originalBytes) {
        const validated = validateLandscapeManifest(manifest), bytes = jsonBytes(validated);
        if (bytes.length > LANDSCAPE_MANIFEST_BYTE_LIMIT) throw new Error('[LandscapeAuthoring] Edited manifest exceeds the 1 MiB manifest budget');
        await snapshot(bytes);
        await ensureCurrent(originalBytes);
        await atomicAuthoringWrite(currentFile, bytes);
        return validated;
    }

    async function transaction(operation) {
        const release = await acquireAuthoringLock(base);
        try { return await operation(); }
        finally { await release(); }
    }

    async function query(options) {
        const { manifest } = await readManifest();
        const context = await queryLandscapeSelection(manifest, options, { readChunk: reader(manifest), signal: options.signal, ...LANDSCAPE_AUTHORING_BUDGETS });
        const latest = (await readManifest()).manifest;
        if (latest.revision !== manifest.revision) throw new Error('[LandscapeAuthoring] Landscape changed while resolving selection; query the current revision again');
        return context;
    }

    async function apply(batch) {
        if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new Error('[LandscapeAuthoring] Edit batch must be a JSON object');
        if (Buffer.byteLength(JSON.stringify(batch)) > LANDSCAPE_AUTHORING_BUDGETS.maxBatchBytes) throw new Error('[LandscapeAuthoring] Edit batch exceeds 64 KiB admission limit');
        batch = structuredClone(batch);
        return transaction(async () => {
            const before = await readManifest();
            const revision = `edit-${authoringHash(JSON.stringify({ beforeRevision: before.manifest.revision, batch })).slice(0, 24)}`;
            const result = await applyLandscapeEditBatch(before.manifest, batch, { readChunk: reader(before.manifest), newRevision: revision, ...LANDSCAPE_AUTHORING_BUDGETS });
            const candidate = result.manifestDraft;
            for (const changed of result.changedChunks) {
                const bytes = encodeLandscapeChannel(changed.heights, 'float32-le'), hash = authoringHash(bytes), url = `payloads/${hash}.f32le`;
                const descriptor = candidate.chunks.find(chunk => chunk.id === changed.descriptor.id);
                if (descriptor.channels.height.sha256 === hash) continue;
                await writeImmutableAuthoringFile(authoringFile(base, url), bytes);
                descriptor.channels.height = { url, encoding: 'float32-le', byteLength: bytes.byteLength, decodedByteLength: bytes.byteLength, sha256: hash, revision };
            }
            candidate.editHistory.previousManifestUrl = await snapshot(before.bytes);
            const manifest = await publish(candidate, before.bytes);
            return { status: 'applied', landscapeId: manifest.id, batchId: batch.id, beforeRevision: before.manifest.revision,
                revision: manifest.revision, summary: result.summary, canRevert: true };
        });
    }

    async function revert({ expectedRevision, batchId } = {}) {
        return transaction(async () => {
            const before = await readManifest(), history = before.manifest.editHistory;
            if (expectedRevision !== before.manifest.revision) throw new Error('[LandscapeAuthoring] Revert expectedRevision is stale or missing');
            if (!history?.lastBatchId || !history.previousManifestUrl) throw new Error('[LandscapeAuthoring] No last applied batch is available to revert');
            if (batchId !== undefined && batchId !== history.lastBatchId) throw new Error('[LandscapeAuthoring] Revert batchId is not the last applied batch');
            if (!/^manifest\.[a-f0-9]{64}\.json$/.test(history.previousManifestUrl)) throw new Error('[LandscapeAuthoring] Invalid previous manifest snapshot identity');
            const previous = await readManifest(history.previousManifestUrl);
            if (`manifest.${authoringHash(previous.bytes)}.json` !== history.previousManifestUrl || previous.manifest.id !== before.manifest.id) throw new Error('[LandscapeAuthoring] Previous manifest snapshot failed authentication');
            if (before.manifest.capabilities.includes('chunk-hierarchy-v1') && !previous.manifest.capabilities.includes('chunk-hierarchy-v1')) throw new Error('[LandscapeAuthoring] Prepare the hierarchy to upgrade the previous saved snapshot before reverting');
            const restored = previous.manifest.chunks.filter(chunk => {
                const current = before.manifest.chunks.find(item => item.id === chunk.id);
                return !current || Object.keys(chunk.channels).some(name => chunk.channels[name].sha256 !== current.channels[name].sha256);
            });
            if (restored.filter(chunk => chunk.level === previous.manifest.grid.maxLevel).length > LANDSCAPE_AUTHORING_BUDGETS.maxNativeChunks) throw new Error('[LandscapeAuthoring] Revert exceeds the four-native-chunk budget');
            for (const chunk of restored) await reader(previous.manifest)(chunk.id);
            const candidate = structuredClone(previous.manifest);
            candidate.revision = `revert-${authoringHash(JSON.stringify({ beforeRevision: before.manifest.revision, previous: history.previousManifestUrl })).slice(0, 24)}`;
            candidate.capabilities = [...new Set([...candidate.capabilities, 'terrain-editing-v1'])];
            candidate.editHistory = { batchIds: [...history.batchIds], lastBatchId: null, previousManifestUrl: null };
            await snapshot(before.bytes);
            const manifest = await publish(candidate, before.bytes);
            return { status: 'reverted', landscapeId: manifest.id, revertedBatchId: history.lastBatchId,
                beforeRevision: before.manifest.revision, revision: manifest.revision, canRevert: false };
        });
    }

    async function readState() {
        const { manifest } = await readManifest();
        return { landscapeId: manifest.id, revision: manifest.revision, lastBatchId: manifest.editHistory?.lastBatchId ?? null,
            canRevert: !!manifest.editHistory?.lastBatchId && !!manifest.editHistory.previousManifestUrl, budgets: LANDSCAPE_AUTHORING_BUDGETS };
    }

    const select = options => admitWorkingSet('query', () => query(options));
    return Object.freeze({ query: select, select, apply: batch => admitWorkingSet('apply', () => apply(batch)),
        revert: options => admitWorkingSet('revert', () => revert(options)), readState });
}
