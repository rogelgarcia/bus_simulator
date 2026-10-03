// Authenticates every retained coastal channel against its original native samples before publication.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateLandscapeManifest } from '../../src/app/landscape/index.js';
import { COASTAL_SOURCE_SHA256, sha256 } from './CoastalArchive.mjs';
import { inspectCoastalSource, measureCoastalOverviewError } from './CoastalSource.mjs';

/** @param {string} directory */
export async function validatePreparedCoastal(directory) {
    const manifestBytes = await readFile(path.join(directory, 'manifest.json'));
    const manifest = validateLandscapeManifest(JSON.parse(manifestBytes.toString('utf8')));
    if (manifest.id !== 'coastal-city' || manifest.provenance.sourceSha256 !== COASTAL_SOURCE_SHA256
        || manifest.provenance.preparation.algorithm !== 'coastal-import-v1' || manifest.chunks.length !== 65
        || manifest.references.length !== 29) throw new Error('Prepared coastal identity or resource inventory mismatch');
    const sources = new Map(), prefix = `source/${COASTAL_SOURCE_SHA256}/`;
    let retainedSourceBytes = 0, channelBytes = 0, samplesCompared = 0;
    async function authenticated(resource) {
        const bytes = await readFile(path.join(directory, resource.url));
        if (bytes.length !== resource.byteLength || sha256(bytes) !== resource.sha256) throw new Error(`Coastal resource integrity mismatch: ${resource.url}`);
        return bytes;
    }
    for (const reference of manifest.references) {
        if (!reference.url.startsWith(prefix)) throw new Error(`Coastal source namespace mismatch: ${reference.id}`);
        const name = reference.url.slice(prefix.length);
        if (sources.has(name)) throw new Error(`Duplicate retained coastal source: ${name}`);
        sources.set(name, await authenticated(reference)); retainedSourceBytes += reference.byteLength;
    }
    const source = inspectCoastalSource(sources), overviewError = measureCoastalOverviewError(source.heightBytes, 8);
    const edges = new Map();
    for (const chunk of manifest.chunks) {
        const height = await authenticated(chunk.channels.height), cover = await authenticated(chunk.channels.landCover);
        channelBytes += height.length + cover.length;
        let minHeight = Infinity, maxHeight = -Infinity;
        for (let row = 0; row < chunk.rows; row++) {
            for (let column = 0; column < chunk.columns; column++) {
                const local = row * chunk.columns + column;
                const original = (chunk.startRow + row * chunk.sampleStride) * 2049 + chunk.startColumn + column * chunk.sampleStride;
                if (height.readUInt32LE(local * 4) !== source.heightBytes.readUInt32LE(original * 4) || cover[local] !== source.landCover[original]) throw new Error(`Coastal native source mismatch at ${chunk.id} sample ${local}`);
                const y = height.readFloatLE(local * 4);
                minHeight = Math.min(minHeight, y); maxHeight = Math.max(maxHeight, y); samplesCompared++;
            }
        }
        if (chunk.level === 3 && (minHeight !== chunk.minHeight || maxHeight !== chunk.maxHeight)) throw new Error(`Coastal native height envelope mismatch: ${chunk.id}`);
        if (chunk.level === 0 && (chunk.minHeight !== source.minHeight || chunk.maxHeight !== source.maxHeight
            || chunk.geometricError !== overviewError.maximumMeters)) throw new Error('Coastal overview error or native envelope mismatch');
        if (chunk.level === 3) {
            const edge = { north: [], south: [], west: [], east: [] };
            for (let i = 0; i < 257; i++) {
                for (const [side, index] of [['north', i], ['south', 256 * 257 + i], ['west', i * 257], ['east', i * 257 + 256]]) {
                    edge[side].push(height.readUInt32LE(index * 4), cover[index]);
                }
            }
            edges.set(chunk.id, edge);
        }
    }
    let sharedBorders = 0;
    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const edge = edges.get(`l3/c${column}/r${row}`);
            const neighbors = [];
            if (column < 7) neighbors.push([edge.east, edges.get(`l3/c${column + 1}/r${row}`).west]);
            if (row < 7) neighbors.push([edge.south, edges.get(`l3/c${column}/r${row + 1}`).north]);
            for (const [a, b] of neighbors) {
                if (a.some((value, index) => value !== b[index])) throw new Error(`Coastal shared border mismatch at c${column}/r${row}`);
                sharedBorders++;
            }
        }
    }
    const provenance = JSON.parse(await readFile(path.join(directory, 'PROVENANCE.json'), 'utf8'));
    if (provenance.sourceSha256 !== COASTAL_SOURCE_SHA256 || !provenance.retainedByteForByte
        || JSON.stringify(provenance.sourceFiles) !== JSON.stringify(manifest.references)) throw new Error('Coastal provenance inventory mismatch');
    return { passed: true, manifestSha256: sha256(manifestBytes), landscapeId: manifest.id, revision: manifest.revision,
        sourceSha256: COASTAL_SOURCE_SHA256, sourceFiles: sources.size, retainedSourceBytes, chunks: manifest.chunks.length,
        nativeChunks: edges.size, channelBytes, samplesCompared, sharedBorders, sharedBorderSamples: sharedBorders * 257,
        minHeight: source.minHeight, maxHeight: source.maxHeight, negativeSamples: source.negativeSamples, zeroSamples: source.zeroSamples,
        landCoverCounts: source.landCoverCounts, checkpoints: source.checkpoints,
        overview: { samples: 257 * 257, payloadBytes: 257 * 257 * 5, spacingMeters: 15.625, ...overviewError },
        authority: 'All native height bits and categorical IDs match retained original source; shared edges match exactly' };
}
