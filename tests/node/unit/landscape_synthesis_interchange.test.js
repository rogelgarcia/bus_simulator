// Verifies the terrain synthesis interchange: RAW, EXR and PNG codecs with authenticated sidecars, the import-map and export-map operators, recipe overrides and determinism with imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { decimateHeights } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisWorkingGrid.mjs';
import { composeSheet, renderHillshade, writeReviewPng } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisReview.mjs';
import { decodeRaw, encodeRaw } from '../../../tools/bake_landscape/terrain_synthesis/interchange/RawCodec.mjs';
import { EXR_COMPRESSION, EXR_MAGIC, EXR_PIXEL_TYPE, decodeExr, encodeExr, halfToFloat } from '../../../tools/bake_landscape/terrain_synthesis/interchange/ExrCodec.mjs';
import { adoptLandscapeMap, decodeLandscapeMap, encodeLandscapeMap, exportLandscapeMap, importLandscapeMap } from '../../../tools/bake_landscape/terrain_synthesis/interchange/Interchange.mjs';
import { LANDSCAPE_SYNTHESIS_OVERRIDES, validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/LandscapeSynthesisRecipe.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.join(root, 'tests/artifacts/screens/landscape/ai596/d2/operators/import-map');
const scratch = path.join(root, 'tests/artifacts/screens/landscape/ai596/d2/interchange-tests');
await mkdir(evidence, { recursive: true }); await mkdir(scratch, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing, minX = 0, minZ = 0) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX, maxX: minX + intervals * spacing, minZ, maxZ: minZ + intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { working = null, imports = [], overrides = [], seed = 11, id = 'interchange-test' } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id, seed, seaLevel: 0, grid, working,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: null, imports },
    operators, outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides
});
const sourceOf = (heightAt, coverAt = () => 2) => (binding, { memory, output }) => {
    const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
    for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) {
        const x = output.minX + c * output.spacingX, z = output.maxZ - r * output.spacingZ;
        heights[r * output.columns + c] = heightAt(x, z); cover[r * output.columns + c] = coverAt(x, z);
    }
    return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
};
const run = (recipe, inputs, options = {}) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(512 << 20), ...options });
const frameOf = grid => ({ columns: grid.columns, rows: grid.rows, spacingX: grid.spacingX, spacingZ: grid.spacingZ, minX: grid.bounds.minX, maxZ: grid.bounds.maxZ });
const indexOf = (frame, x, z) => Math.round((frame.maxZ - z) / frame.spacingZ) * frame.columns + Math.round((x - frame.minX) / frame.spacingX);
const fieldOf = (frame, valueAt) => {
    const values = new Float32Array(frame.columns * frame.rows);
    for (let r = 0; r < frame.rows; r++) for (let c = 0; c < frame.columns; c++) values[r * frame.columns + c] = valueAt(frame.minX + c * frame.spacingX, frame.maxZ - r * frame.spacingZ);
    return values;
};
const PROVENANCE = { tool: 'test', recipeIdentity: 'synthesis-000000000000000000000000' };
const tempDir = name => mkdtemp(path.join(scratch, `${name}-`));
const rejects = (label, build, pattern) => assert.throws(build, error => /^\[(Landscape|Interchange|ExrCodec|RawCodec|PngCodec|Synthesis)\]/.test(error.message) && pattern.test(error.message),
    `${label}: ${(() => { try { build(); return 'accepted'; } catch (error) { return error.message; } })()}`);

// hand-built EXR files (header attributes as OpenEXR writes them, blocks in any file order, the table indexed by block number)
const i32 = value => { const b = Buffer.alloc(4); b.writeInt32LE(value, 0); return b; };
const f32 = value => { const b = Buffer.alloc(4); b.writeFloatLE(value, 0); return b; };
const cstr = text => Buffer.concat([Buffer.from(text, 'latin1'), Buffer.from([0])]);
const attr = (name, type, value) => Buffer.concat([cstr(name), cstr(type), i32(value.length), value]);
function buildExr({ width, height, channels, compression, lineOrder = 0, blocks, version = 2 }) {
    const chlist = Buffer.concat([...channels.map(channel => Buffer.concat([cstr(channel.name), i32(channel.type), Buffer.from([0, 0, 0, 0]), i32(channel.sampling ?? 1), i32(channel.sampling ?? 1)])), Buffer.from([0])]);
    const box = Buffer.concat([i32(0), i32(0), i32(width - 1), i32(height - 1)]);
    const header = Buffer.concat([i32(EXR_MAGIC), i32(version), attr('channels', 'chlist', chlist), attr('compression', 'compression', Buffer.from([compression])), attr('dataWindow', 'box2i', box), attr('displayWindow', 'box2i', box),
        attr('lineOrder', 'lineOrder', Buffer.from([lineOrder])), attr('pixelAspectRatio', 'float', f32(1)), attr('screenWindowCenter', 'v2f', Buffer.concat([f32(0), f32(0)])), attr('screenWindowWidth', 'float', f32(1)), Buffer.from([0])]);
    const linesPerBlock = compression === EXR_COMPRESSION.ZIP ? 16 : 1, table = Buffer.alloc(8 * blocks.length), parts = [];
    let offset = header.length + table.length;
    for (const block of blocks) {
        table.writeBigUInt64LE(BigInt(offset), 8 * Math.floor(block.y / linesPerBlock));
        parts.push(Buffer.concat([i32(block.y), i32(block.data.length), block.data]));
        offset += 8 + block.data.length;
    }
    return Buffer.concat([header, table, ...parts]);
}
function zipCompress(raw) {
    const n = raw.length, tmp = Buffer.alloc(n), half = (n + 1) >> 1;
    let i = 0, t1 = 0, t2 = half;
    while (i < n) { tmp[t1++] = raw[i++]; if (i < n) tmp[t2++] = raw[i++]; }
    let p = tmp[0];
    for (let k = 1; k < n; k++) { const d = tmp[k] - p + 128 + 256; p = tmp[k]; tmp[k] = d & 0xff; }
    const deflated = deflateSync(tmp);
    return deflated.length < n ? deflated : raw;
}
function floatToHalf(value) {
    if (value === 0) return Object.is(value, -0) ? 0x8000 : 0;
    const sign = value < 0 ? 0x8000 : 0, magnitude = Math.abs(value), exponent = Math.floor(Math.log2(magnitude)), mantissa = Math.round((magnitude / 2 ** exponent - 1) * 1024);
    if (exponent + 15 < 1 || exponent + 15 > 30 || (1 + mantissa / 1024) * 2 ** exponent !== magnitude) throw new Error(`${value} is not exactly representable as a half`);
    return sign | ((exponent + 15) << 10) | mantissa;
}
const floatLine = values => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
const halfLine = values => { const b = Buffer.alloc(values.length * 2); values.forEach((v, i) => b.writeUInt16LE(floatToHalf(v), i * 2)); return b; };

test('Interchange: RAW float32 round trips bit exact in little-endian order and rejects byte-length mismatches', () => {
    const random = lcg(1), values = new Float32Array(37 * 23);
    for (let i = 0; i < values.length; i++) values[i] = Math.fround((random() - .5) * (i % 3 === 0 ? 2 : 2000));
    values[0] = -0; values[1] = 3.4e38; values[2] = 1e-40;
    const bytes = encodeRaw(values);
    assert.equal(bytes.length, values.length * 4);
    assert.equal(bytes.readFloatLE(5 * 4), values[5]);
    assert.ok(bytesOf(decodeRaw(bytes, 37, 23)).equals(bytesOf(values)));
    assert.ok(Object.is(decodeRaw(bytes, 37, 23)[0], -0));
    rejects('wrong rows', () => decodeRaw(bytes, 37, 22), /do not hold 37x22/);
    rejects('short buffer', () => decodeRaw(bytes.subarray(1), 37, 23), /do not hold/);
    rejects('not float32', () => encodeRaw(new Float64Array(4)), /Float32Array/);
});

test('Interchange: the EXR writer produces a self-describing uncompressed scanline image that the reader decodes bit exact', () => {
    const width = 41, height = 19, random = lcg(2), values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i++) values[i] = Math.fround(random() * 100 - 30);
    const meta = JSON.stringify({ hello: 'world', spacing: 1.953125 });
    const bytes = encodeExr({ width, height, values, landscapeMeta: meta });
    assert.ok(bytes.equals(encodeExr({ width, height, values, landscapeMeta: meta })), 'byte identical across runs');
    assert.equal(bytes.readInt32LE(0), EXR_MAGIC); assert.equal(bytes.readInt32LE(4), 2);
    const blockAt = bytes.length - height * (8 + width * 4);
    assert.equal(bytes.readInt32LE(blockAt), 0); assert.equal(bytes.readInt32LE(blockAt + 4), width * 4);
    assert.equal(Number(bytes.readBigUInt64LE(blockAt - height * 8)), blockAt, 'the offset table precedes the blocks and points at them');
    const decoded = decodeExr(bytes);
    assert.deepEqual([decoded.width, decoded.height, decoded.channel, decoded.pixelType, decoded.compression, decoded.lineOrder], [width, height, 'Y', 'FLOAT', 'NO_COMPRESSION', 0]);
    assert.deepEqual(decoded.attributes, ['channels', 'compression', 'dataWindow', 'displayWindow', 'landscapeMeta', 'lineOrder', 'pixelAspectRatio', 'screenWindowCenter', 'screenWindowWidth']);
    assert.equal(decoded.landscapeMeta, meta);
    assert.deepEqual(decoded.dataWindow, [0, 0, width - 1, height - 1]); assert.deepEqual(decoded.displayWindow, [0, 0, width - 1, height - 1]);
    assert.ok(bytesOf(decoded.values).equals(bytesOf(values)));
    assert.equal(decodeExr(encodeExr({ width: 3, height: 2, values: new Float32Array(6) })).landscapeMeta, null);
    rejects('truncated', () => decodeExr(bytes.subarray(0, 100)), /Truncated/);
    rejects('not exr', () => decodeExr(Buffer.from('this is not an exr file at all')), /magic/);
});

test('Interchange: the EXR reader decodes ZIPS and ZIP blocks, any line order, half floats and extra channels, and rejects unsupported layouts', () => {
    const width = 13, floats = (seed, scale) => Array.from({ length: width }, (_, x) => Math.fround((x * 0.125 + seed) * scale));
    const smooth = Array.from({ length: 9 }, (_, y) => floats(y, 1)), random = lcg(5);
    smooth[4] = Array.from({ length: width }, () => Math.fround(random() * 1e6 - 5e5));
    const zips = buildExr({ width, height: 9, channels: [{ name: 'Z', type: EXR_PIXEL_TYPE.FLOAT }], compression: EXR_COMPRESSION.ZIPS, blocks: smooth.map((line, y) => ({ y, data: zipCompress(floatLine(line)) })) });
    const decodedZips = decodeExr(zips);
    assert.deepEqual([decodedZips.channel, decodedZips.compression], ['Z', 'ZIPS']);
    assert.deepEqual([...decodedZips.values], smooth.flat());
    assert.ok(zipCompress(floatLine(smooth[4])).length === width * 4, 'the random line is stored uncompressed inside the ZIPS file');
    const height = 23, lines = Array.from({ length: height }, (_, y) => floats(y * .5, 2)), alpha = Buffer.alloc(width * 4, 0xab);
    const block = (y, count) => zipCompress(Buffer.concat(lines.slice(y, y + count).map(line => Buffer.concat([alpha, floatLine(line)]))));
    const zip = buildExr({ width, height, channels: [{ name: 'alpha', type: EXR_PIXEL_TYPE.UINT }, { name: 'height', type: EXR_PIXEL_TYPE.FLOAT }], compression: EXR_COMPRESSION.ZIP, lineOrder: 1, blocks: [{ y: 16, data: block(16, 7) }, { y: 0, data: block(0, 16) }] });
    const decodedZip = decodeExr(zip);
    assert.deepEqual([decodedZip.channel, decodedZip.compression, decodedZip.lineOrder], ['height', 'ZIP', 1]);
    assert.deepEqual([...decodedZip.values], lines.flat());
    const halves = Array.from({ length: 5 }, (_, y) => Array.from({ length: 7 }, (_, x) => (x - 3) * 0.125 + y * 32 - 100));
    const rgb = buildExr({ width: 7, height: 5, channels: ['B', 'G', 'R'].map(name => ({ name, type: EXR_PIXEL_TYPE.HALF })), compression: EXR_COMPRESSION.NO_COMPRESSION,
        blocks: halves.map((line, y) => ({ y, data: Buffer.concat([halfLine(line.map(() => .5)), halfLine(line.map(() => 1)), halfLine(line)]) })) });
    const decodedHalf = decodeExr(rgb);
    assert.deepEqual([decodedHalf.channel, decodedHalf.pixelType], ['R', 'HALF']);
    assert.deepEqual([...decodedHalf.values], halves.flat());
    assert.deepEqual([halfToFloat(0x3c00), halfToFloat(0xc000), halfToFloat(0x0001), halfToFloat(0x7c00), halfToFloat(0x3555)], [1, -2, 2 ** -24, Infinity, (1 + 341 / 1024) / 4]);
    assert.ok(Number.isNaN(halfToFloat(0x7e00)) && Object.is(halfToFloat(0x8000), -0));
    const one = { width: 2, height: 1, channels: [{ name: 'Y', type: EXR_PIXEL_TYPE.FLOAT }], compression: EXR_COMPRESSION.NO_COMPRESSION, blocks: [{ y: 0, data: floatLine([1, 2]) }] };
    rejects('tiled', () => decodeExr(buildExr({ ...one, version: 2 | 0x200 })), /Tiled/);
    rejects('piz', () => decodeExr(buildExr({ ...one, compression: EXR_COMPRESSION.PIZ })), /PIZ is not supported/);
    rejects('no height channel', () => decodeExr(buildExr({ ...one, channels: [{ name: 'A', type: EXR_PIXEL_TYPE.FLOAT }] })), /No FLOAT or HALF channel named Y, height, Z, R among A \(FLOAT\)/);
    rejects('uint only', () => decodeExr(buildExr({ ...one, channels: [{ name: 'Y', type: EXR_PIXEL_TYPE.UINT }] })), /No FLOAT or HALF channel/);
    rejects('subsampled', () => decodeExr(buildExr({ ...one, channels: [{ name: 'Y', type: EXR_PIXEL_TYPE.FLOAT, sampling: 2 }] })), /subsampled/);
    rejects('truncated block', () => decodeExr(zips.subarray(0, zips.length - 10)), /Truncated scanline block/);
    rejects('short block', () => decodeExr(buildExr({ ...one, blocks: [{ y: 0, data: floatLine([1]) }] })), /holds 4 bytes, 8 expected/);
});

test('Interchange: PNG maps quantize within half a step, float encodings round trip exact and the writer rejects values outside the declared range', () => {
    const frame = { columns: 33, rows: 17, spacingX: 2, spacingZ: 2, minX: 100, maxZ: 300 }, random = lcg(3), values = fieldOf(frame, () => Math.fround(-30 + random() * 80));
    values[0] = -30; values[1] = 50;
    for (const [encoding, step] of [['png-gray16', 80 / 65535], ['png-gray8', 80 / 255]]) {
        const { bytes, meta } = encodeLandscapeMap({ kind: 'heights', encoding, grid: frame, values, seaLevel: 0, range: { minMeters: -30, maxMeters: 50 }, provenance: PROVENANCE });
        assert.deepEqual(meta.range, { min: -30, max: 50 }); assert.equal(meta.units, 'meters');
        const decoded = decodeLandscapeMap(bytes, meta, { expectedGrid: frame });
        let worst = 0;
        for (let i = 0; i < values.length; i++) worst = Math.max(worst, Math.abs(decoded.values[i] - values[i]));
        assert.ok(worst <= step / 2 + 1e-6, `${encoding}: worst error ${worst} exceeds half a step ${step / 2}`);
        assert.ok(Object.is(decoded.values[0], -30) && Object.is(decoded.values[1], 50), 'the range ends are exact');
    }
    for (const encoding of ['raw-float32', 'exr-float32']) {
        const { bytes, meta } = encodeLandscapeMap({ kind: 'heights', encoding, grid: frame, values, seaLevel: 0, provenance: PROVENANCE });
        assert.deepEqual(meta.range, { min: -30, max: 50 }, 'float encodings record the measured extent');
        assert.ok(bytesOf(decodeLandscapeMap(bytes, meta, { expectedGrid: frame }).values).equals(bytesOf(values)), `${encoding} exact`);
        assert.equal(sha256(bytes), meta.sha256); assert.equal(meta.byteLength, bytes.length);
    }
    const mask = fieldOf(frame, x => Math.fround((x - 100) / 64)), encodedMask = encodeLandscapeMap({ kind: 'mask', encoding: 'png-gray16', grid: frame, values: mask, seaLevel: 0, provenance: PROVENANCE });
    assert.equal(encodedMask.meta.units, 'dimensionless'); assert.deepEqual(encodedMask.meta.range, { min: 0, max: 1 });
    const decodedMask = decodeLandscapeMap(encodedMask.bytes, encodedMask.meta).values;
    for (let i = 0; i < mask.length; i++) assert.ok(Math.abs(decodedMask[i] - mask[i]) <= 1 / 65535 / 2 + 1e-7);
    rejects('outside range', () => encodeLandscapeMap({ kind: 'heights', encoding: 'png-gray16', grid: frame, values, seaLevel: 0, range: { minMeters: -20, maxMeters: 50 }, provenance: PROVENANCE }), /outside the declared range/);
    rejects('png without range', () => encodeLandscapeMap({ kind: 'heights', encoding: 'png-gray16', grid: frame, values, seaLevel: 0, provenance: PROVENANCE }), /need range/);
    rejects('raw with range', () => encodeLandscapeMap({ kind: 'heights', encoding: 'raw-float32', grid: frame, values, seaLevel: 0, range: { minMeters: -30, maxMeters: 50 }, provenance: PROVENANCE }), /applies only to the PNG/);
    rejects('mask outside 0..1', () => encodeLandscapeMap({ kind: 'mask', encoding: 'raw-float32', grid: frame, values, seaLevel: 0, provenance: PROVENANCE }), /0\.\.1/);
    rejects('no created', () => encodeLandscapeMap({ kind: 'heights', encoding: 'raw-float32', grid: frame, values, seaLevel: 0, provenance: { tool: 'x' } }), /created/);
    rejects('no tool', () => encodeLandscapeMap({ kind: 'heights', encoding: 'raw-float32', grid: frame, values, seaLevel: 0, provenance: { recipeIdentity: 'x' } }), /tool/);
    const nan = Float32Array.from(values); nan[7] = NaN;
    rejects('nan', () => encodeLandscapeMap({ kind: 'heights', encoding: 'raw-float32', grid: frame, values: nan, seaLevel: 0, provenance: PROVENANCE }), /not finite/);
    rejects('wrong length', () => encodeLandscapeMap({ kind: 'heights', encoding: 'raw-float32', grid: frame, values: values.subarray(1), seaLevel: 0, provenance: PROVENANCE }), /must hold 561 samples/);
});

test('Interchange: imports authenticate the sidecar and reject a missing sidecar, a hash mismatch, a wrong frame, wrong dimensions, a wrong encoding and edited metadata', async () => {
    const dir = await tempDir('meta'), frame = { columns: 33, rows: 17, spacingX: 2, spacingZ: 2, minX: 100, maxZ: 300 }, values = fieldOf(frame, (x, z) => Math.fround(x * .1 - z * .05));
    const file = path.join(dir, 'heights.exr'), written = await exportLandscapeMap({ file, kind: 'heights', encoding: 'exr-float32', grid: frame, values, seaLevel: 0, provenance: PROVENANCE });
    const sidecar = JSON.parse(await readFile(written.metaFile, 'utf8'));
    assert.deepEqual(Object.keys(sidecar), ['format', 'schemaVersion', 'kind', 'encoding', 'columns', 'rows', 'spacing', 'bounds', 'rowOrder', 'axes', 'units', 'range', 'seaLevel', 'sha256', 'byteLength', 'provenance', 'created']);
    assert.deepEqual([sidecar.format, sidecar.schemaVersion, sidecar.kind, sidecar.encoding, sidecar.rowOrder, sidecar.axes, sidecar.units, sidecar.created], ['landscape-interchange-map', 1, 'heights', 'exr-float32', 'north-first', 'X east, Z north, Y up', 'meters', PROVENANCE.recipeIdentity]);
    assert.deepEqual(sidecar.spacing, { x: 2, z: 2 }); assert.deepEqual(sidecar.bounds, { minX: 100, maxX: 164, minZ: 268, maxZ: 300 });
    assert.equal(sidecar.sha256, written.sha256);
    const imported = await importLandscapeMap(file, { expectedGrid: frame });
    assert.ok(bytesOf(imported.values).equals(bytesOf(values)));
    const bytes = await readFile(file), tampered = patch => { const meta = structuredClone(sidecar); patch(meta); return meta; };
    rejects('sha mismatch', () => decodeLandscapeMap(bytes, tampered(meta => { meta.sha256 = 'a'.repeat(64); })), /sha256 .* differs from the metadata/);
    rejects('byte length', () => decodeLandscapeMap(Buffer.concat([bytes, Buffer.from([0])]), sidecar), /holds \d+ bytes, the metadata declares/);
    rejects('expected columns', () => decodeLandscapeMap(bytes, sidecar, { expectedGrid: { ...frame, columns: 34 } }), /frame .* differs from the expected grid .*never resampled/);
    rejects('expected spacing', () => decodeLandscapeMap(bytes, sidecar, { expectedGrid: { ...frame, spacingX: 1 } }), /differs from the expected grid/);
    rejects('expected origin', () => decodeLandscapeMap(bytes, sidecar, { expectedGrid: { ...frame, minX: 0 } }), /differs from the expected grid/);
    rejects('declared columns', () => decodeLandscapeMap(bytes, tampered(meta => { meta.columns = 32; meta.bounds.maxX = 162; })), /is 33x17, the metadata declares 32x17/);
    rejects('declared rows', () => decodeLandscapeMap(bytes, tampered(meta => { meta.rows = 16; meta.bounds.minZ = 270; })), /is 33x17, the metadata declares 33x16/);
    rejects('inconsistent bounds', () => decodeLandscapeMap(bytes, tampered(meta => { meta.spacing.x = 3; })), /bounds must equal/);
    rejects('wrong encoding', () => decodeLandscapeMap(bytes, tampered(meta => { meta.encoding = 'raw-float32'; })), /do not hold 33x17 float32 samples/);
    rejects('edited sidecar', () => decodeLandscapeMap(bytes, tampered(meta => { meta.seaLevel = 5; })), /embeds landscapeMeta that differs from its sidecar/);
    rejects('row order', () => decodeLandscapeMap(bytes, tampered(meta => { meta.rowOrder = 'south-first'; })), /rowOrder must be north-first/);
    rejects('units', () => decodeLandscapeMap(bytes, tampered(meta => { meta.units = 'feet'; })), /units must be meters/);
    rejects('missing field', () => decodeLandscapeMap(bytes, tampered(meta => { delete meta.created; })), /exactly the fields/);
    rejects('extra field', () => decodeLandscapeMap(bytes, tampered(meta => { meta.timestamp = 1; })), /exactly the fields/);
    await rm(written.metaFile);
    await assert.rejects(importLandscapeMap(file), /no metadata sidecar heights\.exr\.meta\.json/);
    const external = path.join(dir, 'external.r32');
    await writeFile(external, encodeRaw(values));
    const adopted = await adoptLandscapeMap({ file: external, kind: 'heights', encoding: 'raw-float32', grid: frame, seaLevel: 0, provenance: { tool: 'gaea', version: '2.x', node: 'Erosion' }, created: 'gaea-export-7' });
    const back = await importLandscapeMap(external, { expectedGrid: frame });
    assert.ok(bytesOf(back.values).equals(bytesOf(values)));
    assert.deepEqual([back.meta.created, back.meta.provenance.tool, back.meta.range], ['gaea-export-7', 'gaea', adopted.meta.range]);
    assert.ok(back.meta.range.min < back.meta.range.max && Object.is(Math.fround(back.meta.range.max), Math.max(...values)));
    await assert.rejects(adoptLandscapeMap({ file: external, kind: 'heights', encoding: 'raw-float32', grid: { ...frame, columns: 32 }, seaLevel: 0, provenance: { tool: 'gaea' }, created: 'x' }), /do not hold 32x17/);
    await rm(dir, { recursive: true });
});

test('Synthesis import-map: a declared map replaces, adds to or bounds the height layer under the mask, its hash enters the identity and frames are never resampled', async () => {
    const grid = gridOf(16, 2, 2), frame = frameOf(grid), dir = await tempDir('import'), other = await tempDir('import-other');
    const bump = fieldOf(frame, (x, z) => Math.fround(10 * Math.exp(-((x - 64) ** 2 + (z - 64) ** 2) / 800)));
    await exportLandscapeMap({ file: path.join(dir, 'bump.raw'), kind: 'heights', encoding: 'raw-float32', grid: frame, values: bump, seaLevel: 0, provenance: PROVENANCE });
    await exportLandscapeMap({ file: path.join(other, 'bump.raw'), kind: 'heights', encoding: 'raw-float32', grid: frame, values: bump.map(value => value * 1.5), seaLevel: 0, provenance: PROVENANCE });
    const imports = [{ id: 'bump', file: 'bump.raw', kind: 'heights', encoding: 'raw-float32' }], mask = { type: 'polygon', polygon: [[40, 100], [90, 100], [90, 30], [40, 30]] };
    const base = x => 2 + .05 * x, inputs = { readLandscape: sourceOf(base), root: dir }, results = {};
    for (const mode of ['replace', 'add', 'max']) {
        const result = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', mode }, mask)], { imports }), inputs);
        results[mode] = result;
        const statistics = result.report.operators[1].statistics;
        assert.deepEqual([statistics.mode, statistics.decimated, statistics.created, statistics.file, statistics.target, statistics.maskedSamples], [mode, false, false, 'bump.raw', 'height', 875]);
        assert.equal(statistics.sha256, sha256(encodeRaw(bump)));
        assert.deepEqual(result.report.inputs, [{ id: 'import/bump', sha256: statistics.sha256 }, { id: 'landscape', sha256: 'ab'.repeat(32) }]);
        for (const [x, z] of [[64, 64], [50, 40], [84, 94]]) {
            const i = indexOf(frame, x, z), h = Math.fround(base(x)), v = bump[i], expected = mode === 'replace' ? v : mode === 'add' ? Math.fround(h + v) : Math.max(h, v);
            assert.ok(Object.is(result.heights[i], expected), `${mode} inside the mask at ${x},${z}: ${result.heights[i]} vs ${expected}`);
        }
        for (const [x, z] of [[20, 64], [100, 20], [64, 120]]) assert.ok(Object.is(result.heights[indexOf(frame, x, z)], Math.fround(base(x))), `${mode}: outside the mask the height is untouched`);
        assert.ok(statistics.changedSamples > 0 && statistics.changedSamples <= 875 && statistics.maxChangeMeters > 0);
    }
    const replaced = results.replace.report.operators[1].statistics;
    assert.ok(Math.abs(replaced.mapMaximum - 10) < 1e-3 && replaced.mapMinimum >= 0);
    const scaled = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', mode: 'replace', scale: 2, offset: -1 }, mask)], { imports }), inputs);
    assert.ok(Object.is(scaled.heights[indexOf(frame, 64, 64)], Math.fround(2 * bump[indexOf(frame, 64, 64)] - 1)), 'scale and offset apply before combining');
    const changed = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', mode: 'replace' }, mask)], { imports }), { ...inputs, root: other });
    assert.notEqual(changed.report.identity, results.replace.report.identity, 'different map bytes give a different identity');
    const same = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', mode: 'replace' }, mask)], { imports }), inputs);
    assert.equal(same.report.identity, results.replace.report.identity);
    assert.equal(sha256(bytesOf(same.heights)), sha256(bytesOf(results.replace.heights)));
    const files = new Map([['bump.raw', await readFile(path.join(dir, 'bump.raw'))], ['bump.raw.meta.json', await readFile(path.join(dir, 'bump.raw.meta.json'))]]);
    const hooked = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', mode: 'replace' }, mask)], { imports }), { readLandscape: sourceOf(base), readFile: name => { if (!files.has(name)) { const error = new Error(name); error.code = 'ENOENT'; throw error; } return files.get(name); } });
    assert.equal(hooked.report.identity, results.replace.report.identity, 'the readFile hook resolves relative names');
    const created = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', target: 'landMask' })], { imports }), inputs);
    assert.ok(created.report.operators[1].statistics.created && bytesOf(created.layers.landMask).equals(bytesOf(bump)), 'replace without a mask creates a missing float layer');
    const shifted = await tempDir('import-shifted');
    await exportLandscapeMap({ file: path.join(shifted, 'bump.raw'), kind: 'heights', encoding: 'raw-float32', grid: { ...frame, minX: 2 }, values: bump, seaLevel: 0, provenance: PROVENANCE });
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump' })], { imports }), { ...inputs, root: shifted }), /frame 65x65 at 2x2 m from \(2, 128\) differs from the working grid .*never resampled/);
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump' })], { imports: [{ ...imports[0], encoding: 'png-gray16' }] }), inputs), /is a raw-float32 heights map, the recipe declares png-gray16 heights/);
    const datum = await tempDir('import-datum');
    await exportLandscapeMap({ file: path.join(datum, 'bump.raw'), kind: 'heights', encoding: 'raw-float32', grid: frame, values: bump, seaLevel: 1, provenance: PROVENANCE });
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump' })], { imports }), { ...inputs, root: datum }), /uses sea level 1, the recipe uses 0/);
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump' })], { imports }), { readLandscape: sourceOf(base) }), /inputs.root is required/);
    const validate = operators => validateLandscapeSynthesisRecipe(recipeOf(grid, operators, { imports }));
    rejects('unwritten target', () => validate([op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', target: 'landMask', mode: 'add' })]), /reads layer landMask before any enabled operator writes it/);
    rejects('masked replace of a missing layer', () => validate([op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', target: 'landMask' }, mask)]), /reads layer landMask before/);
    rejects('categorical target', () => validate([op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', target: 'cover' })]), /cover is a categorical uint8 layer/);
    rejects('unknown target', () => validate([op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', target: 'nope' })]), /"nope" is not a declared layer/);
    rejects('unknown import', () => validate([op('import', 'import-heights'), op('map', 'import-map', { importId: 'nope' })]), /importId "nope" is not declared in recipe.inputs.imports/);
    rejects('reserved import id', () => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights')], { imports: [{ ...imports[0], id: 'heights' }] })), /reserved/);
    rejects('bad mode', () => validate([op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump', mode: 'blend' })]), /mode must be one of/);
    for (const result of [...Object.values(results), scaled, changed, same, hooked, created]) result.release();
    for (const directory of [dir, other, shifted, datum]) await rm(directory, { recursive: true });
});

test('Synthesis import-map: on a coarse working grid an output-grid map is decimated with the aligned tent average, a working-grid map imports directly', async () => {
    const grid = gridOf(16, 2, 2), frame = frameOf(grid), dir = await tempDir('coarse'), working = { columns: 33, rows: 33, spacingX: 4, spacingZ: 4, minX: 0, maxZ: 128 };
    const bump = fieldOf(frame, (x, z) => Math.fround(5 * Math.sin(x / 9) * Math.cos(z / 11)));
    await exportLandscapeMap({ file: path.join(dir, 'bump.exr'), kind: 'heights', encoding: 'exr-float32', grid: frame, values: bump, seaLevel: 0, provenance: PROVENANCE });
    const imports = [{ id: 'bump', file: 'bump.exr', kind: 'heights', encoding: 'exr-float32' }, { id: 'coarse', file: 'stage/coarse.raw', kind: 'heights', encoding: 'raw-float32' }];
    const operators = [op('import', 'import-heights'), op('map', 'import-map', { importId: 'bump' }), op('export', 'export-map', { file: 'coarse.raw', encoding: 'raw-float32' }), op('out', 'resample', { filter: 'bilinear' })];
    const result = await run(recipeOf(grid, operators, { imports, working: { spacing: 4 } }), { readLandscape: sourceOf(() => 0), root: dir, exportRoot: path.join(dir, 'stage') });
    const expected = new Float32Array(33 * 33);
    decimateHeights(frame, bump, working, expected, 'tent');
    assert.ok(bytesOf(result.layers.height).equals(bytesOf(expected)), 'the working layer is the tent-decimated map');
    assert.deepEqual([result.report.operators[1].statistics.decimated, result.report.operators[1].statistics.mapGrid.columns, result.report.operators[2].statistics.columns], [true, 65, 33]);
    const exported = await importLandscapeMap(path.join(dir, 'stage/coarse.raw'), { expectedGrid: working });
    assert.ok(bytesOf(exported.values).equals(bytesOf(expected)), 'export-map writes the working grid');
    const direct = await run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'coarse' }), op('out', 'resample', { filter: 'bilinear' })], { imports, working: { spacing: 4 } }), { readLandscape: sourceOf(() => 0), root: dir });
    assert.equal(direct.report.operators[1].statistics.decimated, false);
    assert.ok(bytesOf(direct.layers.height).equals(bytesOf(expected)));
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('map', 'import-map', { importId: 'coarse' })], { imports }), { readLandscape: sourceOf(() => 0), root: dir }), /frame 33x33 at 4x4 m .* differs from the working grid 65x65/);
    result.release(); direct.release();
    await rm(dir, { recursive: true });
});

test('Synthesis export-map: writes the layer with the final recipe identity as provenance, reads back exact and sits after every input operator', async () => {
    const grid = gridOf(16, 2, 2), frame = frameOf(grid), dir = await tempDir('export'), exportRoot = path.join(dir, 'stage'), relief = (x, z) => 3 + 4 * Math.sin(x / 10) + .02 * z;
    const operators = encoding => [op('import', 'import-heights'), op('noise', 'noise', { amplitudeMeters: .5, wavelengthsMeters: [16, 8], amplitudes: [1, .5] }), op('export', 'export-map', { file: `maps/heights.${encoding.ext}`, encoding: encoding.encoding, range: encoding.range ?? null })];
    for (const encoding of [{ ext: 'raw', encoding: 'raw-float32' }, { ext: 'exr', encoding: 'exr-float32' }, { ext: 'png', encoding: 'png-gray16', range: [-10, 30] }, { ext: '8.png', encoding: 'png-gray8', range: [-10, 30] }]) {
        const result = await run(recipeOf(grid, operators(encoding)), { readLandscape: sourceOf(relief), exportRoot }), statistics = result.report.operators[2].statistics;
        assert.deepEqual([statistics.layer, statistics.kind, statistics.encoding, statistics.file, statistics.metaFile, statistics.recipeIdentity], ['height', 'heights', encoding.encoding, `maps/heights.${encoding.ext}`, `maps/heights.${encoding.ext}.meta.json`, result.report.identity]);
        const imported = await importLandscapeMap(path.join(exportRoot, statistics.file), { expectedGrid: frame });
        assert.deepEqual([imported.meta.provenance.tool, imported.meta.provenance.recipeIdentity, imported.meta.provenance.operatorId, imported.meta.provenance.layer, imported.meta.created, imported.sha256], ['landscape-synthesis', result.report.identity, 'export', 'height', result.report.identity, statistics.sha256]);
        if (encoding.encoding.startsWith('png')) {
            const step = 40 / (encoding.encoding === 'png-gray16' ? 65535 : 255);
            let worst = 0;
            for (let i = 0; i < imported.values.length; i++) worst = Math.max(worst, Math.abs(imported.values[i] - result.heights[i]));
            assert.ok(worst <= step / 2 + 1e-6, `${encoding.encoding} within its quantization`);
        } else assert.ok(bytesOf(imported.values).equals(bytesOf(result.heights)), `${encoding.encoding} reads back exact`);
        result.release();
    }
    const first = await readFile(path.join(exportRoot, 'maps/heights.exr.meta.json')), again = await run(recipeOf(grid, operators({ ext: 'exr', encoding: 'exr-float32' })), { readLandscape: sourceOf(relief), exportRoot });
    assert.ok((await readFile(path.join(exportRoot, 'maps/heights.exr.meta.json'))).equals(first), 'a repeated run writes an identical sidecar');
    again.release();
    const bump = fieldOf(frame, x => Math.fround(x * .01));
    await exportLandscapeMap({ file: path.join(dir, 'bump.raw'), kind: 'heights', encoding: 'raw-float32', grid: frame, values: bump, seaLevel: 0, provenance: PROVENANCE });
    const imports = [{ id: 'bump', file: 'bump.raw', kind: 'heights', encoding: 'raw-float32' }];
    const overridden = await run(recipeOf(grid, operators({ ext: 'raw', encoding: 'raw-float32' }), { imports, overrides: [{ id: 'patch', type: 'import', importId: 'bump', mode: 'add', mask: null }] }), { readLandscape: sourceOf(relief), root: dir, exportRoot });
    assert.equal(overridden.report.operators[2].statistics.recipeIdentity, overridden.report.identity, 'the map of an import override is read before the operators, so the exported identity is final');
    assert.deepEqual(overridden.report.inputs.map(entry => entry.id), ['import/bump', 'landscape']);
    overridden.release();
    await assert.rejects(run(recipeOf(grid, operators({ ext: 'raw', encoding: 'raw-float32' })), { readLandscape: sourceOf(relief) }), /inputs.exportRoot is required/);
    await assert.rejects(run(recipeOf(grid, [op('import', 'import-heights'), op('export', 'export-map', { file: 'm.raw', encoding: 'raw-float32', kind: 'mask' })]), { readLandscape: sourceOf(relief), exportRoot }), /mask values must lie in 0\.\.1/);
    const validate = (operators, options) => validateLandscapeSynthesisRecipe(recipeOf(grid, operators, options));
    rejects('input after export', () => validate([op('import', 'import-heights'), op('export', 'export-map', { file: 'h.exr' }), op('map', 'import-map', { importId: 'bump' })], { imports }), /\(import-map\) comes after export-map export/);
    rejects('png without range', () => validate([op('import', 'import-heights'), op('export', 'export-map', { file: 'h.png', encoding: 'png-gray16' })]), /range \[min, max\] is required for PNG heights/);
    rejects('range on exr', () => validate([op('import', 'import-heights'), op('export', 'export-map', { file: 'h.exr', range: [0, 1] })]), /range applies only to PNG heights/);
    rejects('categorical layer', () => validate([op('import', 'import-heights'), op('export', 'export-map', { file: 'c.raw', layer: 'cover' })]), /layer "cover" must be a declared float32 layer/);
    rejects('unwritten layer', () => validate([op('import', 'import-heights'), op('export', 'export-map', { file: 'w.raw', layer: 'wear' })]), /reads layer wear before any enabled operator writes it/);
    rejects('export after resample', () => validate([op('import', 'import-heights'), op('out', 'resample'), op('export', 'export-map', { file: 'h.exr' })]), /resample operator must be the last/);
    await rm(dir, { recursive: true });
});

test('Synthesis overrides: import, region and operator overrides apply after the operators in document order, exclude zones are restored and everything is reported and deterministic', async () => {
    const grid = gridOf(32, 2, 2), frame = frameOf(grid), dir = await tempDir('overrides'), bump = fieldOf(frame, x => Math.fround(1 + .01 * x));
    await exportLandscapeMap({ file: path.join(dir, 'bump.raw'), kind: 'heights', encoding: 'raw-float32', grid: frame, values: bump, seaLevel: 0, provenance: PROVENANCE });
    const imports = [{ id: 'bump', file: 'bump.raw', kind: 'heights', encoding: 'raw-float32' }], base = (x, z) => 4 + .02 * z;
    const operators = [op('import', 'import-heights'), op('plateau', 'landform-plateau', { polygon: [[150, 220], [230, 220], [230, 150], [150, 150]], heightMeters: 30, profile: 'ramp', rampLengthMeters: 20, blendMeters: 0 })];
    const polygon = points => ({ type: 'polygon', polygon: points });
    const overrides = [
        { id: 'town', type: 'region', mask: { ...polygon([[20, 120], [100, 120], [100, 40], [20, 40]]), edge: { from: 0, to: 8 } }, height: { mode: 'set', meters: 20 } },
        { id: 'patch', type: 'import', importId: 'bump', mode: 'add', mask: polygon([[60, 160], [140, 160], [140, 80], [60, 80]]) },
        { id: 'taller', type: 'operator', operatorId: 'plateau', params: { heightMeters: 35 }, mask: polygon([[150, 220], [190, 220], [190, 150], [150, 150]]) },
        { id: 'keep', type: 'exclude', mask: polygon([[30, 100], [70, 100], [70, 60], [30, 60]]) }
    ];
    const inputs = { readLandscape: sourceOf(base), root: dir }, memory = new TerrainFieldMemory(512 << 20);
    const plain = await run(recipeOf(grid, operators), inputs), result = await executeSynthesisRecipe({ recipe: recipeOf(grid, operators, { imports, overrides }), inputs, memory });
    const at = (run, x, z) => run.heights[indexOf(frame, x, z)];
    assert.ok(Object.is(at(result, 40, 110), 20), 'deep inside the region the height is set exactly');
    const edge = Math.fround(base(24, 110));
    assert.ok(Math.abs(at(result, 24, 110) - (edge + .5 * (20 - edge))) < 1e-4, 'the selector edge blends the region with a smoothstep');
    assert.ok(Object.is(at(result, 80, 110), Math.fround(20 + bump[indexOf(frame, 80, 110)])), 'the import adds onto the region set before it');
    assert.ok(Object.is(at(result, 120, 140), Math.fround(at(plain, 120, 140) + bump[indexOf(frame, 120, 140)])), 'the import adds onto the operator state outside the region');
    assert.deepEqual([at(result, 170, 184), at(result, 210, 184), at(plain, 170, 184)], [35, 30, 30], 'the operator re-run applies its parameters inside its mask only');
    for (const [x, z] of [[50, 80], [66, 90], [36, 64]]) assert.ok(Object.is(at(result, x, z), at(plain, x, z)), `the exclude zone keeps the operator state at ${x},${z}`);
    const report = result.report.overrides;
    assert.deepEqual(report.map(entry => [entry.id, entry.type]), [['town', 'region'], ['patch', 'import'], ['taller', 'operator'], ['keep', 'exclude']]);
    assert.ok(report[0].statistics.changedSamples > 1000 && report[0].statistics.maxChangeMeters > 10 && report[0].statistics.details.mode === 'set' && report[0].statistics.details.maskedSamples > report[0].statistics.changedSamples);
    assert.equal(report[1].statistics.details.importId, 'bump'); assert.equal(report[1].statistics.changedSamples, report[1].statistics.details.changedSamples);
    assert.deepEqual([report[2].statistics.details.heightMeters, report[2].statistics.maxChangeMeters], [35, 5]);
    assert.ok(report[2].statistics.changedSamples > 0 && report[2].statistics.changedSamples < report[2].statistics.details.insideSamples);
    assert.deepEqual(report[3].statistics.details.layers, ['height']);
    assert.equal(report[3].statistics.details.protectedSamples, 400, 'the 40 x 40 m exclude polygon holds 20 x 20 samples');
    assert.ok(report[3].statistics.details.restored.height.samples > 300 && report[3].statistics.details.restored.height.samples <= 400 && report[3].statistics.maxChangeMeters > 10);
    assert.ok(report.every(entry => entry.seconds >= 0));
    assert.deepEqual(result.report.inputs.map(entry => entry.id), ['import/bump', 'landscape']);
    const swapped = await run(recipeOf(grid, operators, { imports, overrides: [overrides[1], overrides[0], overrides[2], overrides[3]] }), inputs);
    assert.ok(Object.is(at(swapped, 80, 110), 20), 'document order: a set after the add discards the added bump');
    const again = await run(recipeOf(grid, operators, { imports, overrides }), inputs);
    assert.equal(sha256(bytesOf(again.heights)), sha256(bytesOf(result.heights))); assert.equal(again.report.identity, result.report.identity);
    assert.deepEqual(again.report.overrides.map(entry => entry.statistics), report.map(entry => entry.statistics));
    const noOverrides = await run(recipeOf(grid, operators, { imports }), inputs);
    assert.notEqual(noOverrides.report.identity, result.report.identity, 'overrides are part of the recipe identity');
    assert.deepEqual(noOverrides.report.overrides, []);
    result.release();
    assert.equal(memory.bytes, 0, 'override snapshots, masks and import caches are released');
    for (const run of [plain, swapped, again, noOverrides]) run.release();
    await rm(dir, { recursive: true });
});

test('Synthesis overrides: the validator rejects malformed overrides with actionable messages and accepts the documented shapes', () => {
    const grid = gridOf(16, 2, 2), imports = [{ id: 'bump', file: 'bump.raw', kind: 'heights', encoding: 'raw-float32' }], mask = { type: 'all' };
    const base = overrides => recipeOf(grid, [op('import', 'import-heights'), op('plateau', 'landform-plateau', { polygon: [[10, 60], [60, 60], [60, 10], [10, 10]], heightMeters: 20 }), { ...op('hidden', 'noise'), enabled: false }], { imports, overrides });
    const cases = {
        'duplicate id': [[{ id: 'a', type: 'exclude', mask }, { id: 'a', type: 'exclude', mask }], /repeats id a/],
        'unknown type': [[{ id: 'a', type: 'paint', mask }], /type must be one of import, region, operator, exclude/],
        'missing mask key': [[{ id: 'a', type: 'exclude' }], /mask is required/],
        'exclude without mask': [[{ id: 'a', type: 'exclude', mask: null }], /\(exclude\) needs a mask selector/],
        'region without mask': [[{ id: 'a', type: 'region', mask: null, height: { mode: 'set', meters: 1 } }], /\(region\) needs a mask selector/],
        'region without height': [[{ id: 'a', type: 'region', mask }], /height is required/],
        'region bad mode': [[{ id: 'a', type: 'region', mask, height: { mode: 'flatten', meters: 1 } }], /height.mode must be one of set, raise, lower/],
        'region negative raise': [[{ id: 'a', type: 'region', mask, height: { mode: 'raise', meters: -1 } }], /must not be negative for raise/],
        'region unknown field': [[{ id: 'a', type: 'region', mask, height: { mode: 'set', meters: 1 }, extra: 1 }], /extra is not a declared parameter/],
        'region unknown nested field': [[{ id: 'a', type: 'region', mask, height: { mode: 'set', meters: 1, feet: 3 } }], /height.feet is not a declared parameter/],
        'import unknown importId': [[{ id: 'a', type: 'import', importId: 'nope', mask: null }], /importId "nope" is not declared/],
        'import categorical target': [[{ id: 'a', type: 'import', importId: 'bump', target: 'cover', mask: null }], /cover is a categorical uint8 layer/],
        'import unwritten target': [[{ id: 'a', type: 'import', importId: 'bump', target: 'landMask', mode: 'add', mask: null }], /reads layer landMask that no enabled operator writes/],
        'import bad scale': [[{ id: 'a', type: 'import', importId: 'bump', scale: 'x', mask: null }], /scale must be finite/],
        'operator unknown': [[{ id: 'a', type: 'operator', operatorId: 'nope', params: {}, mask }], /operatorId "nope" is not a recipe operator/],
        'operator disabled': [[{ id: 'a', type: 'operator', operatorId: 'hidden', params: {}, mask }], /operatorId hidden is disabled/],
        'operator inputs family': [[{ id: 'a', type: 'operator', operatorId: 'import', params: {}, mask }], /cannot re-run import-heights \(inputs family\)/],
        'operator unknown param': [[{ id: 'a', type: 'operator', operatorId: 'plateau', params: { nope: 1 }, mask }], /params.nope is not a parameter of landform-plateau/],
        'operator merged invalid': [[{ id: 'a', type: 'operator', operatorId: 'plateau', params: { faceSlopeDegrees: 95 }, mask }], /faceSlopeDegrees must be in 10..89/],
        'operator merged rule': [[{ id: 'a', type: 'operator', operatorId: 'plateau', params: { districtId: 2 }, mask }], /exactly one of districtId or polygon/],
        'operator without params': [[{ id: 'a', type: 'operator', operatorId: 'plateau', mask }], /params is required/],
        'mask reads unwritten layer': [[{ id: 'a', type: 'exclude', mask: { type: 'district', ids: [1] } }], /reads layer districtId that no enabled operator writes/],
        'bad mask': [[{ id: 'a', type: 'exclude', mask: { type: 'slopes' } }], /mask.type must be one of/]
    };
    for (const [label, [overrides, pattern]] of Object.entries(cases)) rejects(label, () => validateLandscapeSynthesisRecipe(base(overrides)), pattern);
    const accepted = validateLandscapeSynthesisRecipe(base([{ id: 'a', type: 'import', importId: 'bump', mask: null }, { id: 'b', type: 'operator', operatorId: 'plateau', params: { heightMeters: 25 }, mask: null },
        { id: 'c', type: 'region', mask: { type: 'polygon', polygon: [[0, 10], [10, 10], [10, 0]], edge: { from: 0, to: 2 } }, height: { mode: 'lower', meters: 2 } }, { id: 'd', type: 'exclude', mask: { type: 'slope', edge: { from: 10, to: 20 } } }]));
    assert.ok(Object.isFrozen(accepted.overrides) && Object.isFrozen(accepted.overrides[1].params) && accepted.overrides.length === 4);
    assert.deepEqual(Object.keys(LANDSCAPE_SYNTHESIS_OVERRIDES), ['import', 'region', 'operator', 'exclude']);
    assert.ok(Object.isFrozen(LANDSCAPE_SYNTHESIS_OVERRIDES) && LANDSCAPE_SYNTHESIS_OVERRIDES.region.maskRequired && !LANDSCAPE_SYNTHESIS_OVERRIDES.import.maskRequired);
});

test('Synthesis import-map: review sheet of an exported relief re-imported under a mask', async () => {
    const grid = gridOf(64, 2, 4), dir = await tempDir('review'), exportRoot = path.join(dir, 'stage'), ground = (x, z) => 5 + .01 * z;
    const hills = [op('import', 'import-heights'), op('hills', 'landform-hills', { amplitudeMeters: 60, wavelengthsMeters: [300, 150, 75, 38], amplitudes: [1, .5, .25, .125], warpMeters: 40, warpWavelengthMeters: 400, ridgedMix: .8 }), op('export', 'export-map', { file: 'hills.exr' })];
    const exported = await run(recipeOf(grid, hills, { id: 'hills-export' }), { readLandscape: sourceOf(() => 5), exportRoot });
    const mesa = [op('import', 'import-heights'), op('mesa', 'landform-plateau', { polygon: [[200, 820], [820, 820], [820, 200], [200, 200]], heightMeters: 40, faceDropMeters: 15, rimWidthMeters: 20 })];
    const before = await run(recipeOf(grid, mesa), { readLandscape: sourceOf(ground) });
    const imports = [{ id: 'hills', file: 'stage/hills.exr', kind: 'heights', encoding: 'exr-float32' }], mask = { type: 'polygon', polygon: [[300, 700], [700, 760], [760, 300], [260, 260]], edge: { from: 0, to: 60 } };
    const after = await run(recipeOf(grid, [...mesa, op('map', 'import-map', { importId: 'hills', mode: 'replace' }, mask)], { imports }), { readLandscape: sourceOf(ground), root: dir });
    assert.ok(after.report.operators[2].statistics.changedSamples > 5000 && after.report.operators[2].statistics.encoding === 'exr-float32');
    const options = { size: 512, seaLevel: 0, verticalExaggeration: 1.5 };
    const entries = [{ image: renderHillshade(exported.grid, exported.heights, options), label: 'exported hills.exr (recipe A)' }, { image: renderHillshade(before.grid, before.heights, options), label: 'recipe B before import-map' },
        { image: renderHillshade(after.grid, after.heights, options), label: 'after import-map replace under the polygon mask (60 m edge)' }];
    await writeReviewPng(path.join(evidence, 'before.png'), entries[1].image);
    await writeReviewPng(path.join(evidence, 'after.png'), entries[2].image);
    const sheet = await writeReviewPng(path.join(evidence, 'sheet.png'), composeSheet(entries, { labelHeight: 32 }));
    assert.ok(sheet.byteLength > 1000 && sheet.width > 1500);
    exported.release(); before.release(); after.release();
    await rm(dir, { recursive: true });
});
