// Verifies native coastal fidelity, safe archive decoding, deterministic preparation, and publication refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { deflateSync, deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { COASTAL_SOURCE_PREFIX, COASTAL_SOURCE_SHA256, crc32, decodeCoastalZip, decodeGrayscaleIdsPng, readCoastalArchive, sha256 } from '../../../tools/bake_landscape/CoastalArchive.mjs';
import { partitionCoastalTile, prepareCoastalLandscape } from '../../../tools/bake_landscape/CoastalPreparation.mjs';
import { assertCoastalPublicationCompatible, publishPreparedCoastal } from '../../../tools/bake_landscape/CoastalPublication.mjs';
import { validatePreparedCoastal } from '../../../tools/bake_landscape/CoastalValidation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const retained = path.join(root, 'assets/public/landscape/coastal-city');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai576/d1/import-tests');
await mkdir(evidence, { recursive: true });
const temporary = () => mkdtemp(path.join(evidence, 'fixture-'));

function pngChunk(type, data) {
    const typeBytes = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, crc]);
}

function idsPng(values, width, height, filter, depth = 8) {
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = depth;
    const raw = Buffer.alloc((width + 1) * height);
    for (let row = 0; row < height; row++) {
        raw[row * (width + 1)] = filter;
        for (let column = 0; column < width; column++) {
            const index = row * width + column, left = column ? values[index - 1] : 0, up = row ? values[index - width] : 0;
            const corner = row && column ? values[index - width - 1] : 0;
            const base = left + up - corner, distances = [Math.abs(base - left), Math.abs(base - up), Math.abs(base - corner)];
            const paeth = [left, up, corner][distances.indexOf(Math.min(...distances))];
            const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter] ?? 0;
            raw[row * (width + 1) + column + 1] = (values[index] - prediction + 256) % 256;
        }
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function oneEntryZip(name, data) {
    const nameBytes = Buffer.from(name), packed = deflateRawSync(data), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    const localBytes = Buffer.concat([local, nameBytes, packed]), centralBytes = Buffer.concat([central, nameBytes]);
    end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(localBytes.length, 16);
    return Buffer.concat([localBytes, centralBytes, end]);
}

test('Landscape importer decodes all PNG row filters as unmodified categorical IDs', () => {
    const values = Buffer.from([0, 7, 1, 4, 2, 0, 6, 3, 5, 1, 7, 2]);
    for (let filter = 0; filter <= 4; filter++) assert.deepEqual(decodeGrayscaleIdsPng(idsPng(values, 4, 3, filter), { width: 4, height: 3 }), values);
    assert.throws(() => decodeGrayscaleIdsPng(idsPng(values, 4, 3, 0, 16), { width: 4, height: 3 }), /8-bit grayscale/);
    assert.throws(() => decodeGrayscaleIdsPng(idsPng(values, 4, 3, 0), { width: 3, height: 4 }), /8-bit grayscale/);
    assert.throws(() => decodeGrayscaleIdsPng(idsPng(values, 4, 3, 5), { width: 4, height: 3 }), /row filter/);
    const corrupt = idsPng(values, 4, 3, 0); corrupt[44] ^= 1;
    assert.throws(() => decodeGrayscaleIdsPng(corrupt, { width: 4, height: 3 }), /integrity mismatch/);
});

test('Landscape importer rejects unsafe ZIP names, damaged entries, and unapproved archives', async () => {
    const data = Buffer.from('read-only source'), zip = oneEntryZip(`${COASTAL_SOURCE_PREFIX}README.txt`, data);
    assert.deepEqual(decodeCoastalZip(zip).get('README.txt'), data);
    for (const name of [`${COASTAL_SOURCE_PREFIX}../escape`, 'elsewhere/file', `${COASTAL_SOURCE_PREFIX}nested\\file`]) {
        assert.throws(() => decodeCoastalZip(oneEntryZip(name, data)), /Unsafe/);
    }
    const corrupt = Buffer.from(zip); corrupt[14] ^= 1;
    assert.throws(() => decodeCoastalZip(corrupt), /header mismatch/);
    assert.throws(() => decodeCoastalZip(zip.subarray(0, zip.length - 10)), /directory/);
    const directory = await temporary(), file = path.join(directory, 'not-approved.zip');
    await writeFile(file, zip);
    await assert.rejects(readCoastalArchive(file), /SHA-256 mismatch/);
});

test('Landscape partitions preserve float32 bits, zero and class IDs across native shared edges', () => {
    const heightBytes = Buffer.alloc(2049 * 2049 * 4), landCover = Buffer.alloc(2049 * 2049);
    for (let row = 0; row < 2049; row++) {
        for (let column = 0; column < 2049; column++) {
            const index = row * 2049 + column;
            heightBytes.writeFloatLE((column - row) / 16, index * 4); landCover[index] = (row + column) % 8;
        }
    }
    heightBytes.writeFloatLE(-0, (256 * 2049 + 256) * 4);
    const source = { heightBytes, landCover }, northwest = partitionCoastalTile(source, { column: 0, row: 0, stride: 1 });
    const east = partitionCoastalTile(source, { column: 1, row: 0, stride: 1 }), south = partitionCoastalTile(source, { column: 0, row: 1, stride: 1 });
    assert.equal(northwest.heightBytes.readFloatLE(0), 0);
    assert.ok(Object.is(northwest.heightBytes.readFloatLE((257 * 257 - 1) * 4), -0));
    for (let i = 0; i < 257; i++) {
        assert.equal(northwest.heightBytes.readUInt32LE((i * 257 + 256) * 4), east.heightBytes.readUInt32LE(i * 257 * 4));
        assert.equal(northwest.landCover[i * 257 + 256], east.landCover[i * 257]);
        assert.equal(northwest.heightBytes.readUInt32LE((256 * 257 + i) * 4), south.heightBytes.readUInt32LE(i * 4));
        assert.equal(northwest.landCover[256 * 257 + i], south.landCover[i]);
    }
    const overview = partitionCoastalTile(source, { column: 0, row: 0, stride: 8 });
    assert.equal(overview.heightBytes.readFloatLE(256 * 4), 128);
    assert.equal(overview.heightBytes.readFloatLE(256 * 257 * 4), -128);
    assert.throws(() => partitionCoastalTile(source, { column: 8, row: 0, stride: 1 }), /Invalid coastal partition/);
});

test('Retained coastal import authenticates full native coverage, orientation, checkpoints, and all planning records', async () => {
    const report = await validatePreparedCoastal(retained);
    assert.equal(report.sourceSha256, COASTAL_SOURCE_SHA256);
    assert.equal(report.nativeChunks, 64); assert.equal(report.sourceFiles, 29); assert.equal(report.sharedBorders, 112);
    assert.equal(report.samplesCompared, 65 * 257 * 257);
    assert.equal(report.minHeight, -30); assert.equal(report.maxHeight, 49.21965408325195);
    assert.equal(report.overview.payloadBytes, 330245);
    assert.equal(report.overview.maximumMeters, 1.8092246055603027);
    assert.equal(report.landCoverCounts.reduce((a, b) => a + b), 2049 * 2049);
    assert.deepEqual(report.checkpoints.slice(0, 4).map(point => [point.x, point.z]), [[0, 4000], [4000, 4000], [0, 0], [4000, 0]]);
});

test('Coastal repeat preparation is byte-identical and corrupt candidates cannot replace a valid manifest', async () => {
    const currentBytes = await readFile(path.join(retained, 'manifest.json'));
    const manifest = JSON.parse(currentBytes), provenance = JSON.parse(await readFile(path.join(retained, 'PROVENANCE.json'), 'utf8'));
    const files = new Map();
    for (const reference of manifest.references) files.set(reference.url.split('/').slice(2).join('/'), await readFile(path.join(retained, reference.url)));
    const directory = await temporary();
    const prepared = await prepareCoastalLandscape(path.join(directory, 'candidate'), { files, sourceSha256: COASTAL_SOURCE_SHA256, archiveByteLength: provenance.archiveByteLength });
    assert.deepEqual(await readFile(prepared.manifestFile), currentBytes);
    const resource = manifest.chunks[0].channels.height, payload = path.join(prepared.directory, resource.url), bytes = await readFile(payload);
    bytes[0] ^= 1; await writeFile(payload, bytes);
    const destination = path.join(directory, 'installed'); await mkdir(destination);
    await writeFile(path.join(destination, 'manifest.json'), currentBytes);
    await assert.rejects(publishPreparedCoastal(prepared, destination), /integrity mismatch/);
    assert.equal(sha256(await readFile(path.join(destination, 'manifest.json'))), sha256(currentBytes));
});

test('Coastal import refuses changed revisions and authored edits while allowing identical republishing', async () => {
    const manifest = JSON.parse(await readFile(path.join(retained, 'manifest.json'), 'utf8'));
    assert.doesNotThrow(() => assertCoastalPublicationCompatible(null, manifest));
    assert.doesNotThrow(() => assertCoastalPublicationCompatible(structuredClone(manifest), manifest));
    const revision = structuredClone(manifest); revision.revision += '-edited';
    assert.throws(() => assertCoastalPublicationCompatible(revision, manifest), /refuses/);
    const edited = structuredClone(manifest); edited.operations.push({ id: 'raise-patch' });
    assert.throws(() => assertCoastalPublicationCompatible(edited, manifest), /refuses/);
    const override = structuredClone(manifest); override.soil.overrides.push({ soilId: 'sand' });
    assert.throws(() => assertCoastalPublicationCompatible(override, manifest), /refuses/);
});
