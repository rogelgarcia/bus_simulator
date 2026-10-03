// Builds a complete measured terrain hierarchy from current immutable native chunks with bounded sequential reads.
// @ts-check
import path from 'node:path';
import { createLandscapeChunkId, encodeLandscapeChannel, validateLandscapeManifest } from '../../src/app/landscape/index.js';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../landscape_authoring/LandscapeFileIO.mjs';
import { authoringFile, authoringHash, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';

export const HIERARCHY_WORKING_BYTE_LIMIT = 4 * 1024 * 1024;
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parentId = node => node.level ? createLandscapeChunkId(node.level - 1, Math.floor(node.column / 2), Math.floor(node.row / 2)) : null;
const containsNative = (node, native, maxLevel) => Math.floor(native.column / 2 ** (maxLevel - node.level)) === node.column && Math.floor(native.row / 2 ** (maxLevel - node.level)) === node.row;

function edgeHashes(chunk) {
    const count = chunk.descriptor.columns, output = {};
    for (const side of ['north', 'south', 'west', 'east']) {
        const bytes = Buffer.alloc(count * 5);
        for (let i = 0; i < count; i++) {
            const index = side === 'north' ? i : side === 'south' ? (count - 1) * count + i : side === 'west' ? i * count : i * count + count - 1;
            bytes.writeFloatLE(chunk.heights[index], i * 5); bytes[i * 5 + 4] = chunk.landCover[index];
        }
        output[side] = authoringHash(bytes);
    }
    return output;
}

function previewHeight(heights, count, x, y) {
    const column = Math.min(count - 2, Math.floor(x)), row = Math.min(count - 2, Math.floor(y));
    const u = x - column, v = y - row, i = row * count + column;
    const a = heights[i], b = heights[i + 1], c = heights[i + count], d = heights[i + count + 1];
    return u >= v ? a + (b - a) * u + (d - b) * v : a + (d - c) * u + (c - a) * v;
}

/** @param {{directory:string,outputDirectory:string,source?:{bytes:Buffer,manifest:any},signal?:AbortSignal}} options */
export async function prepareLandscapeHierarchy({ directory, outputDirectory, source, signal }) {
    const original = source ?? await readLandscapeFileManifest(directory), files = new Set();
    const reports = [];
    async function build(input) {
        const manifest = validateLandscapeManifest(input), draft = structuredClone(manifest), count = manifest.grid.chunkIntervals + 1;
        const plannedWorkingBytes = count * count * 24;
        if (plannedWorkingBytes > HIERARCHY_WORKING_BYTE_LIMIT) throw new Error('Landscape hierarchy exceeds its 4 MiB working-array budget');
        const native = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel), edges = new Map();
        let reads = 0, readBytes = 0, errorSamples = 0, sharedBorders = 0;
        async function read(id) {
            signal?.throwIfAborted();
            const chunk = await readLandscapeFileChunk(directory, manifest, id, { signal });
            reads++; readBytes += chunk.heights.byteLength + chunk.landCover.byteLength;
            return chunk;
        }
        for (const descriptor of native) {
            const chunk = await read(descriptor.id);
            let min = Infinity, max = -Infinity;
            for (const value of chunk.heights) { min = Math.min(min, value); max = Math.max(max, value); }
            if (min !== descriptor.minHeight || max !== descriptor.maxHeight) throw new Error(`Native envelope is not exact: ${descriptor.id}`);
            edges.set(descriptor.id, edgeHashes(chunk));
        }
        for (const descriptor of native) {
            const edge = edges.get(descriptor.id), dimension = 2 ** manifest.grid.maxLevel;
            if (descriptor.column + 1 < dimension) {
                if (edge.east !== edges.get(createLandscapeChunkId(descriptor.level, descriptor.column + 1, descriptor.row)).west) throw new Error(`Native hierarchy seam mismatch at ${descriptor.id} east`);
                sharedBorders++;
            }
            if (descriptor.row + 1 < dimension) {
                if (edge.south !== edges.get(createLandscapeChunkId(descriptor.level, descriptor.column, descriptor.row + 1)).north) throw new Error(`Native hierarchy seam mismatch at ${descriptor.id} south`);
                sharedBorders++;
            }
        }
        const chunks = [];
        for (let level = 0; level <= manifest.grid.maxLevel; level++) {
            for (let row = 0; row < 2 ** level; row++) for (let column = 0; column < 2 ** level; column++) {
                const id = createLandscapeChunkId(level, column, row), existing = manifest.chunks.find(chunk => chunk.id === id);
                if (level === manifest.grid.maxLevel) { chunks.push({ ...structuredClone(existing), parentId: parentId(existing) }); continue; }
                const stride = 2 ** (manifest.grid.maxLevel - level), startColumn = column * manifest.grid.chunkIntervals * stride, startRow = row * manifest.grid.chunkIntervals * stride;
                const descriptor = { id, level, column, row, startColumn, startRow, sampleStride: stride, columns: count, rows: count,
                    bounds: { minX: manifest.bounds.minX + startColumn * manifest.grid.spacingX, maxX: manifest.bounds.minX + (startColumn + manifest.grid.chunkIntervals * stride) * manifest.grid.spacingX,
                        minZ: manifest.bounds.maxZ - (startRow + manifest.grid.chunkIntervals * stride) * manifest.grid.spacingZ, maxZ: manifest.bounds.maxZ - startRow * manifest.grid.spacingZ },
                    minHeight: Infinity, maxHeight: -Infinity, geometricError: 0, revision: '', parentId: level ? createLandscapeChunkId(level - 1, Math.floor(column / 2), Math.floor(row / 2)) : null, channels: {} };
                const descendants = native.filter(chunk => containsNative(descriptor, chunk, manifest.grid.maxLevel));
                const heights = new Float32Array(count * count), cover = new Uint8Array(count * count), filled = new Uint8Array(count * count);
                for (const child of descendants) {
                    const chunk = await read(child.id);
                    descriptor.minHeight = Math.min(descriptor.minHeight, child.minHeight); descriptor.maxHeight = Math.max(descriptor.maxHeight, child.maxHeight);
                    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
                        const x = child.startColumn + c - startColumn, y = child.startRow + r - startRow;
                        if (x % stride || y % stride) continue;
                        const target = y / stride * count + x / stride, index = r * count + c;
                        if (filled[target] && (!Object.is(heights[target], chunk.heights[index]) || cover[target] !== chunk.landCover[index])) throw new Error(`Aligned hierarchy sample mismatch in ${id}`);
                        heights[target] = chunk.heights[index]; cover[target] = chunk.landCover[index]; filled[target] = 1;
                    }
                }
                if (filled.some(value => !value)) throw new Error(`Incomplete aligned hierarchy samples in ${id}`);
                for (const child of descendants) {
                    const chunk = await read(child.id);
                    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
                        const x = (child.startColumn + c - startColumn) / stride, y = (child.startRow + r - startRow) / stride;
                        descriptor.geometricError = Math.max(descriptor.geometricError, Math.abs(chunk.heights[r * count + c] - previewHeight(heights, count, x, y)));
                        errorSamples++;
                    }
                }
                const heightBytes = encodeLandscapeChannel(heights, 'float32-le'), coverBytes = encodeLandscapeChannel(cover, 'uint8');
                const identity = authoringHash(jsonBytes({ id, min: descriptor.minHeight, max: descriptor.maxHeight, error: descriptor.geometricError, height: authoringHash(heightBytes), cover: authoringHash(coverBytes) }));
                descriptor.revision = `hierarchy-${identity.slice(0, 24)}`;
                for (const [name, bytes, encoding, extension] of [['height', heightBytes, 'float32-le', 'f32le'], ['landCover', coverBytes, 'uint8', 'u8']]) {
                    const sha256 = authoringHash(bytes), previous = existing?.channels[name];
                    const channel = previous?.sha256 === sha256 ? structuredClone(previous) : { url: `payloads/${sha256}.${extension}`, encoding, byteLength: bytes.byteLength, decodedByteLength: bytes.byteLength, sha256, revision: descriptor.revision };
                    await writeImmutableAuthoringFile(authoringFile(outputDirectory, channel.url), bytes); files.add(authoringFile(outputDirectory, channel.url));
                    descriptor.channels[name] = channel;
                }
                if (existing && JSON.stringify({ ...descriptor, revision: existing.revision }) === JSON.stringify(existing)) descriptor.revision = existing.revision;
                chunks.push(descriptor);
            }
        }
        draft.chunks = chunks;
        if (!draft.capabilities.includes('chunk-hierarchy-v1')) draft.capabilities.push('chunk-hierarchy-v1');
        draft.hierarchy = { algorithm: 'native-hierarchy-v1', errorPolicy: 'measured-native-vertices' };
        reports.push({ sourceRevision: manifest.revision, nativeChunks: native.length, nodes: chunks.length, sharedBorders, sourceChunkReads: reads,
            sourceDecodedBytesRead: readBytes, errorSamples, plannedWorkingBytes, workingByteLimit: HIERARCHY_WORKING_BYTE_LIMIT,
            maximumResidentNativeChunks: 1, levels: Array.from({ length: manifest.grid.maxLevel + 1 }, (_, level) => ({ level, nodes: 4 ** level,
                maxGeometricError: Math.max(...chunks.filter(chunk => chunk.level === level).map(chunk => chunk.geometricError)) })) });
        return draft;
    }
    const candidate = await build(original.manifest);
    if (candidate.editHistory?.previousManifestUrl) {
        const previous = await readLandscapeFileManifest(directory, candidate.editHistory.previousManifestUrl);
        if (`manifest.${authoringHash(previous.bytes)}.json` !== candidate.editHistory.previousManifestUrl || previous.manifest.id !== candidate.id) throw new Error('Previous authoring snapshot failed hierarchy authentication');
        if (!previous.manifest.capabilities.includes('chunk-hierarchy-v1')) {
            const upgraded = await build(previous.manifest);
            upgraded.revision = `hierarchy-${authoringHash(jsonBytes({ ...upgraded, revision: null })).slice(0, 24)}`;
            const bytes = jsonBytes(validateLandscapeManifest(upgraded)), url = `manifest.${authoringHash(bytes)}.json`;
            await writeImmutableAuthoringFile(authoringFile(outputDirectory, url), bytes); files.add(authoringFile(outputDirectory, url));
            candidate.editHistory.previousManifestUrl = url;
        }
    }
    if (JSON.stringify(candidate) !== JSON.stringify(original.manifest)) candidate.revision = `hierarchy-${authoringHash(jsonBytes({ ...candidate, revision: null })).slice(0, 24)}`;
    const manifest = validateLandscapeManifest(candidate), bytes = jsonBytes(manifest), manifestFile = path.join(outputDirectory, 'manifest.json');
    await writeImmutableAuthoringFile(manifestFile, bytes); files.add(manifestFile);
    return { directory, outputDirectory, inputManifestBytes: original.bytes, manifestFile, manifest, files: [...files],
        report: { passed: true, landscapeId: manifest.id, beforeRevision: original.manifest.revision, revision: manifest.revision,
            manifestSha256: authoringHash(bytes), sourceManifestSha256: authoringHash(original.bytes), nativeAuthorityPreserved: true,
            changed: !bytes.equals(original.bytes), builds: reports } };
}
