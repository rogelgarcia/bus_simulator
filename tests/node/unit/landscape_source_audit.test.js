// Audits retained coastal authority and every native sample without preparing or publishing assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COASTAL_SOURCE_SHA256, decodeGrayscaleIdsPng, sha256 } from '../../../tools/bake_landscape/CoastalArchive.mjs';
import { COASTAL_CHECKPOINTS } from '../../../tools/bake_landscape/CoastalSource.mjs';
import { createCoastalLandscapeCitySpec } from '../../../src/app/city/specs/CoastalLandscapeCitySpec.js';
import { validateLandscapeManifest, validateLandscapeCityBinding, landscapeGridToWorld } from '../../../src/app/landscape/index.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = path.join(root, 'assets/public/landscape/coastal-city');
const cacheSkip = landscapeCacheSkip([path.basename(createCoastalLandscapeCitySpec().landscape.manifestUrl), 'PROVENANCE.json']);
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d7');

async function authenticate(file, expected) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const part of createReadStream(file)) { bytes += part.byteLength; hash.update(part); }
    assert.equal(bytes, expected.byteLength, file);
    assert.equal(hash.digest('hex'), expected.sha256, file);
    return bytes;
}

async function readExact(handle, buffer, position) {
    let offset = 0;
    while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
        assert.ok(bytesRead, 'retained source raster ended early');
        offset += bytesRead;
    }
}

test('Landscape D7 source audit: pinned manifest, all retained records and native float/category bits remain authentic', { skip: cacheSkip }, async () => {
    const binding = createCoastalLandscapeCitySpec().landscape;
    const manifestFile = path.join(root, binding.manifestUrl), manifestBytes = await readFile(manifestFile);
    const expectedManifestHash = path.basename(manifestFile).match(/^manifest\.([a-f0-9]{64})\.json$/)?.[1];
    assert.ok(expectedManifestHash, 'city fixture must pin a content-addressed immutable manifest');
    assert.equal(sha256(manifestBytes), expectedManifestHash);
    const manifest = validateLandscapeManifest(JSON.parse(manifestBytes.toString('utf8')));
    validateLandscapeCityBinding(binding, { manifest });
    const provenance = JSON.parse(await readFile(path.join(directory, 'PROVENANCE.json'), 'utf8'));
    assert.equal(manifest.provenance.sourceSha256, COASTAL_SOURCE_SHA256);
    assert.equal(provenance.sourceSha256, COASTAL_SOURCE_SHA256);
    assert.equal(provenance.retainedByteForByte, true);
    assert.deepEqual(provenance.sourceFiles, manifest.references);
    assert.equal(manifest.references.length, 29);
    let retainedSourceBytes = 0, publishedChannelBytes = 0;
    for (const reference of manifest.references) retainedSourceBytes += await authenticate(path.join(directory, reference.url), reference);
    const channels = new Map();
    for (const chunk of manifest.chunks) for (const channel of Object.values(chunk.channels)) {
        if (channels.has(channel.url)) assert.deepEqual(channels.get(channel.url), { sha256: channel.sha256, byteLength: channel.byteLength });
        else {
            channels.set(channel.url, { sha256: channel.sha256, byteLength: channel.byteLength });
            publishedChannelBytes += await authenticate(path.join(directory, channel.url), channel);
        }
    }
    assert.equal(manifest.chunks.length, 85);
    assert.deepEqual(manifest.grid, { columns: 2049, rows: 2049, spacingX: 1.953125, spacingZ: 1.953125, chunkIntervals: 256, maxLevel: 3 });
    assert.deepEqual(manifest.bounds, { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 });
    assert.equal(manifest.coordinates.rasterRow0, 'north');
    assert.equal(manifest.coordinates.seaLevel, 0);
    const sourceByRole = new Map(manifest.references.map(record => [record.role, record]));
    const coverRecord = sourceByRole.get('original-land-cover'), heightRecord = sourceByRole.get('original-elevation');
    const cover = decodeGrayscaleIdsPng(await readFile(path.join(directory, coverRecord.url)), { width: 2049, height: 2049 });
    const coverCounts = Array(8).fill(0);
    for (const id of cover) { assert.ok(id <= 7); coverCounts[id]++; }
    assert.ok(coverCounts.every(count => count > 0));
    assert.equal(heightRecord.byteLength, 16793604);
    const native = manifest.chunks.filter(chunk => chunk.level === 3), byCell = new Map(native.map(chunk => [`${chunk.column}/${chunk.row}`, chunk]));
    assert.equal(native.length, 64);
    const sourceBand = Buffer.alloc(257 * 2049 * 4), sample = Buffer.alloc(4), checkpoints = [];
    const sourceHeight = await open(path.join(directory, heightRecord.url), 'r');
    let nativeVertexOccurrences = 0, minHeight = Infinity, maxHeight = -Infinity;
    try {
        for (let row = 0; row < 8; row++) {
            await readExact(sourceHeight, sourceBand, row * 256 * 2049 * 4);
            for (let column = 0; column < 8; column++) {
                const chunk = byCell.get(`${column}/${row}`);
                assert.equal(chunk.startColumn, column * 256);
                assert.equal(chunk.startRow, row * 256);
                assert.equal(chunk.sampleStride, 1);
                assert.deepEqual(chunk.bounds, { minX: column * 500, maxX: (column + 1) * 500, minZ: 4000 - (row + 1) * 500, maxZ: 4000 - row * 500 });
                const heights = await readFile(path.join(directory, chunk.channels.height.url));
                const ids = await readFile(path.join(directory, chunk.channels.landCover.url));
                let tileMin = Infinity, tileMax = -Infinity;
                for (let localRow = 0; localRow < 257; localRow++) {
                    const sourceOffset = localRow * 2049 + column * 256, tileOffset = localRow * 257;
                    assert.ok(heights.subarray(tileOffset * 4, (tileOffset + 257) * 4).equals(sourceBand.subarray(sourceOffset * 4, (sourceOffset + 257) * 4)), `${chunk.id} height row ${localRow}`);
                    const coverOffset = (row * 256 + localRow) * 2049 + column * 256;
                    assert.ok(ids.subarray(tileOffset, tileOffset + 257).equals(cover.subarray(coverOffset, coverOffset + 257)), `${chunk.id} category row ${localRow}`);
                    for (let localColumn = 0; localColumn < 257; localColumn++) {
                        const height = heights.readFloatLE((tileOffset + localColumn) * 4);
                        assert.ok(Number.isFinite(height));
                        tileMin = Math.min(tileMin, height); tileMax = Math.max(tileMax, height);
                    }
                    nativeVertexOccurrences += 257;
                }
                assert.equal(tileMin, chunk.minHeight); assert.equal(tileMax, chunk.maxHeight);
                minHeight = Math.min(minHeight, tileMin); maxHeight = Math.max(maxHeight, tileMax);
            }
        }
        for (const point of COASTAL_CHECKPOINTS) {
            await readExact(sourceHeight, sample, (point.row * 2049 + point.column) * 4);
            assert.equal(sample.readFloatLE(0), point.height, point.id);
            checkpoints.push({ ...point, ...landscapeGridToWorld(manifest, point.column, point.row), landCoverId: cover[point.row * 2049 + point.column] });
        }
    } finally { await sourceHeight.close(); }
    assert.equal(nativeVertexOccurrences, 64 * 257 * 257);
    assert.equal(minHeight, -30); assert.equal(maxHeight, 49.21965408325195);
    assert.deepEqual(checkpoints.slice(0, 4).map(point => [point.x, point.z]), [[0, 4000], [4000, 4000], [0, 0], [4000, 0]]);
    const current = validateLandscapeManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')));
    assert.equal(current.provenance.sourceSha256, COASTAL_SOURCE_SHA256);
    assert.deepEqual(current.references, manifest.references);
    const currentNativeMatchesOriginal = native.every(chunk => {
        const now = current.chunks.find(value => value.id === chunk.id);
        return now?.channels.height.sha256 === chunk.channels.height.sha256 && now.channels.landCover.sha256 === chunk.channels.landCover.sha256;
    });
    await mkdir(evidence, { recursive: true });
    await writeFile(path.join(evidence, 'source-fidelity.json'), `${JSON.stringify({
        sourceSha256: COASTAL_SOURCE_SHA256, pinnedManifestSha256: expectedManifestHash, pinnedRevision: manifest.revision,
        currentRevision: current.revision, currentNativeMatchesOriginal, sourceFiles: manifest.references.length, retainedSourceBytes,
        hierarchyNodes: manifest.chunks.length, uniquePublishedChannels: channels.size, publishedChannelBytes,
        nativeChunks: native.length, nativeVertexOccurrences, uniqueNativeSamples: 2049 * 2049,
        nativeSharedBordersCoveredByExactSourceComparison: 112, minHeight, maxHeight, coverCounts, checkpoints,
        comparison: 'Exact source float32 bytes and categorical IDs, including duplicated shared boundaries; no preparation or publication',
        readWorkingSet: { sourceHeightBandBytes: sourceBand.length, sourceCoverBytes: cover.length, nativeTileBytes: 257 * 257 * 5,
            sourceFileHashing: 'one 64KiB stream at a time; no complete height raster assembled', applicability: 'offline audit, not runtime residency' }
    }, null, 2)}\n`);
});
