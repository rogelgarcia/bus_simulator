// Verifies fail-closed AI 531 validation capture identity and rehash contracts.

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {deflateSync} from 'node:zlib';
import {
    PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO,
    authenticateProductionValidationCaptureSet,
    authenticateValidationCaptureSet,
    createValidationCaptureRecord
} from '../../../../tools/static_sun_depth/src/ValidationCaptureAuthentication.mjs';

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const CASE_IDS = Object.freeze(['case.alpha', 'case.beta']);
const CAPTURE_DIMENSIONS = Object.freeze([1280, 720]);

test('capture authentication independently rehashes an exact canonical PNG inventory', async () => {
    const fixture = await makeFixture();
    const first = await authenticateValidationCaptureSet(fixture.options);
    assert.equal(first.captureCount, 6);
    assert.deepEqual(first.dimensionsPixels, CAPTURE_DIMENSIONS);
    assert.equal(first.method, 'sha256-byte-length-rehash-repo-artifact-confined-v1');
    assert.match(first.captureSetSha256, /^[0-9a-f]{64}$/);

    const reorderedCases = structuredClone(fixture.cases);
    for (const validationCase of reorderedCases) {
        for (const slot of ['cache', 'comparison', 'current']) {
            const record = validationCase.captures[slot];
            validationCase.captures[slot] = {
                sha256: record.sha256,
                path: record.path,
                byteLength: record.byteLength
            };
        }
    }
    const repeated = await authenticateValidationCaptureSet({
        ...fixture.options,
        cases: reorderedCases
    });
    assert.deepEqual(repeated, first);
});

test('capture authentication rejects tampering, bare paths, traversal, duplicates, missing, and extra entries', async () => {
    const fixture = await makeFixture();
    const firstPath = path.resolve(
        fixture.repoRoot,
        ...fixture.cases[0].captures.cache.path.split('/')
    );
    fixture.files.set(firstPath, makePng(1280, 720, [255]));
    await assert.rejects(
        authenticateValidationCaptureSet(fixture.options),
        /differs from its authenticated record/
    );

    const bare = structuredClone(fixture.cases);
    bare[0].captures.cache = bare[0].captures.cache.path;
    await assert.rejects(
        authenticateValidationCaptureSet({...fixture.options, cases: bare}),
        /must be a plain object/
    );

    const traversal = structuredClone(fixture.cases);
    traversal[0].captures.cache.path =
        'tests/artifacts/screens/illumination_531/case.alpha/../escape.png';
    await assert.rejects(
        authenticateValidationCaptureSet({...fixture.options, cases: traversal}),
        /path is unsafe/
    );

    const duplicate = structuredClone(fixture.cases);
    duplicate.push(structuredClone(duplicate[0]));
    await assert.rejects(
        authenticateValidationCaptureSet({...fixture.options, cases: duplicate}),
        /exactly 2 cases/
    );

    const missing = structuredClone(fixture.cases);
    delete missing[0].captures.cache;
    await assert.rejects(
        authenticateValidationCaptureSet({...fixture.options, cases: missing}),
        /must contain exactly/
    );

    const extra = structuredClone(fixture.cases);
    extra[0].captures.unexpected = extra[0].captures.cache;
    await assert.rejects(
        authenticateValidationCaptureSet({...fixture.options, cases: extra}),
        /must contain exactly/
    );
});

test('capture authentication rejects non-PNG bytes and symbolic-link path segments', async () => {
    const fixture = await makeFixture();
    const firstPath = path.resolve(
        fixture.repoRoot,
        ...fixture.cases[0].captures.cache.path.split('/')
    );
    fixture.files.set(firstPath, new Uint8Array(33));
    fixture.cases[0].captures.cache = {
        byteLength: 33,
        path: fixture.cases[0].captures.cache.path,
        sha256: rawSha256(fixture.files.get(firstPath))
    };
    await assert.rejects(
        authenticateValidationCaptureSet(fixture.options),
        /is not a PNG file/
    );

    const symlinkFixture = await makeFixture();
    await assert.rejects(
        authenticateValidationCaptureSet({
            ...symlinkFixture.options,
            lstatFn: async (filePath) => ({
                isSymbolicLink: () => path.resolve(filePath)
                    === path.resolve(symlinkFixture.authorityRoot)
            })
        }),
        /rejects symbolic-link path segment/
    );
});

test('capture authentication rejects a valid PNG with the wrong IHDR dimensions', async () => {
    const fixture = await makeFixture();
    const firstPath = path.resolve(
        fixture.repoRoot,
        ...fixture.cases[0].captures.cache.path.split('/')
    );
    const wrongSize = makePng(1280, 696, [1]);
    fixture.files.set(firstPath, wrongSize);
    await assert.rejects(
        createValidationCaptureRecord(firstPath, {
            authorityRoot: fixture.authorityRoot,
            expectedDimensionsPixels: CAPTURE_DIMENSIONS,
            lstatFn: fixture.options.lstatFn,
            readFileFn: fixture.options.readFileFn,
            repoRoot: fixture.repoRoot
        }),
        /PNG IHDR dimensions must be 1280x720/
    );
    fixture.cases[0].captures.cache = {
        byteLength: wrongSize.byteLength,
        path: fixture.cases[0].captures.cache.path,
        sha256: rawSha256(wrongSize)
    };
    await assert.rejects(
        authenticateValidationCaptureSet(fixture.options),
        /PNG IHDR dimensions must be 1280x720/
    );
});

test('production capture authentication decodes receiver masks and proves exact partitions', async () => {
    const fixture = await makeProductionFixture();
    const summary = await authenticateProductionValidationCaptureSet(fixture.options);
    assert.equal(summary.captureCount, CASE_IDS.length * 5);
    assert.equal(
        summary.method,
        'sha256-byte-length-rehash-png-decode-receiver-mask-partition-v2'
    );
    assert.equal(
        summary.minimumStaticReceiverCoverageRatio,
        PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO
    );
    assert.equal(summary.minimumStaticReceiverPixelCount, 64);

    const countDrift = structuredClone(fixture.cases);
    countDrift[0].metrics.eligibleStaticReceiverPixelCount -= 1;
    countDrift[0].metrics.outsideStaticReceiverPixelCount += 1;
    await assert.rejects(
        authenticateProductionValidationCaptureSet({
            ...fixture.options,
            cases: countDrift
        }),
        /decoded receiver masks differ from metrics/
    );
});

test('production capture authentication rejects collapsed and overlapping receiver masks', async () => {
    const collapsed = await makeProductionFixture({
        staticPredicate: (pixel) => pixel === 0
    });
    collapsed.cases[0].metrics.eligibleStaticReceiverPixelCount = 1;
    collapsed.cases[0].metrics.outsideStaticReceiverPixelCount =
        256 - 1 - collapsed.cases[0].metrics.dynamicReceiverMaskedPixelCount;
    await assert.rejects(
        authenticateProductionValidationCaptureSet(collapsed.options),
        /static receiver mask coverage collapsed/
    );

    const overlapping = await makeProductionFixture({
        dynamicPredicate: (pixel) => pixel >= 48 && pixel < 80
    });
    await assert.rejects(
        authenticateProductionValidationCaptureSet(overlapping.options),
        /receiver masks overlap/
    );
});

async function makeProductionFixture(options = {}) {
    const width = 16;
    const height = 16;
    const pixelCount = width * height;
    const staticPredicate = options.staticPredicate ?? ((pixel) => pixel < 64);
    const dynamicPredicate = options.dynamicPredicate
        ?? ((pixel) => pixel >= 64 && pixel < 80);
    const repoRoot = process.cwd();
    const authorityRoot = path.join(
        repoRoot,
        'tests/artifacts/screens/illumination_531'
    );
    const files = new Map();
    const readFileFn = async (filePath) => {
        const bytes = files.get(path.resolve(filePath));
        if (!bytes) throw Object.assign(new Error('missing fixture file'), {code: 'ENOENT'});
        return bytes;
    };
    const lstatFn = async () => ({isSymbolicLink: () => false});
    const cases = [];
    for (const caseId of CASE_IDS) {
        const captures = {};
        for (const slot of [
            'cache',
            'comparison',
            'current',
            'dynamicReceiverMask',
            'staticCityReceiverMask'
        ]) {
            const predicate = slot === 'dynamicReceiverMask'
                ? dynamicPredicate
                : slot === 'staticCityReceiverMask'
                    ? staticPredicate
                    : () => false;
            const bytes = makeMaskPng(width, height, predicate);
            const filePath = path.join(authorityRoot, caseId, slot + '.png');
            files.set(path.resolve(filePath), bytes);
            captures[slot] = await createValidationCaptureRecord(filePath, {
                authorityRoot,
                expectedDimensionsPixels: [width, height],
                lstatFn,
                readFileFn,
                repoRoot
            });
        }
        const eligibleStaticReceiverPixelCount = countPredicate(
            pixelCount,
            staticPredicate
        );
        const dynamicReceiverMaskedPixelCount = countPredicate(
            pixelCount,
            dynamicPredicate
        );
        cases.push({
            caseId,
            captures,
            metrics: {
                dynamicReceiverMaskedPixelCount,
                eligibleStaticReceiverPixelCount,
                height,
                outsideStaticReceiverPixelCount:
                    pixelCount
                    - dynamicReceiverMaskedPixelCount
                    - eligibleStaticReceiverPixelCount,
                pixelCount,
                width
            }
        });
    }
    return {
        authorityRoot,
        cases,
        files,
        repoRoot,
        options: {
            authorityRoot,
            cases,
            expectedCaseIds: CASE_IDS,
            expectedCaptureCount: CASE_IDS.length * 5,
            expectedDimensionsPixels: [width, height],
            lstatFn,
            readFileFn,
            repoRoot
        }
    };
}

async function makeFixture() {
    const repoRoot = process.cwd();
    const authorityRoot = path.join(
        repoRoot,
        'tests/artifacts/screens/illumination_531'
    );
    const files = new Map();
    const readFileFn = async (filePath) => {
        const bytes = files.get(path.resolve(filePath));
        if (!bytes) throw Object.assign(new Error('missing fixture file'), {code: 'ENOENT'});
        return bytes;
    };
    const lstatFn = async () => ({isSymbolicLink: () => false});
    const cases = [];
    for (const [caseIndex, caseId] of CASE_IDS.entries()) {
        const captures = {};
        for (const [slotIndex, slot] of ['cache', 'comparison', 'current'].entries()) {
            const filePath = path.join(authorityRoot, caseId, slot + '.png');
            files.set(
                path.resolve(filePath),
                makePng(1280, 720, [caseIndex, slotIndex])
            );
            captures[slot] = await createValidationCaptureRecord(filePath, {
                authorityRoot,
                expectedDimensionsPixels: CAPTURE_DIMENSIONS,
                lstatFn,
                readFileFn,
                repoRoot
            });
        }
        cases.push({caseId, captures});
    }
    return {
        authorityRoot,
        cases,
        files,
        repoRoot,
        options: {
            authorityRoot,
            cases,
            expectedCaseIds: CASE_IDS,
            expectedCaptureCount: 6,
            expectedDimensionsPixels: CAPTURE_DIMENSIONS,
            lstatFn,
            readFileFn,
            repoRoot
        }
    };
}

function makePng(width, height, payload = []) {
    const bytes = new Uint8Array(33 + payload.length);
    bytes.set(PNG_SIGNATURE, 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13, false);
    bytes.set([73, 72, 68, 82], 12);
    view.setUint32(16, width, false);
    view.setUint32(20, height, false);
    bytes[24] = 8;
    bytes[25] = 6;
    bytes.set(payload, 33);
    return bytes;
}

function makeMaskPng(width, height, predicate) {
    const scanlines = new Uint8Array(height * (width + 1));
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (width + 1);
        scanlines[rowOffset] = 0;
        for (let x = 0; x < width; x += 1) {
            scanlines[rowOffset + x + 1] = predicate(y * width + x) ? 255 : 0;
        }
    }
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, width, false);
    ihdrView.setUint32(4, height, false);
    ihdr.set([8, 0, 0, 0, 0], 8);
    return concatenateBytes([
        PNG_SIGNATURE,
        makePngChunk('IHDR', ihdr),
        makePngChunk('IDAT', deflateSync(scanlines)),
        makePngChunk('IEND', new Uint8Array())
    ]);
}

function makePngChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const result = new Uint8Array(12 + data.byteLength);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.byteLength, false);
    result.set(typeBytes, 4);
    result.set(data, 8);
    view.setUint32(8 + data.byteLength, crc32(concatenateBytes([typeBytes, data])), false);
    return result;
}

function concatenateBytes(values) {
    const result = new Uint8Array(
        values.reduce((sum, value) => sum + value.byteLength, 0)
    );
    let offset = 0;
    for (const value of values) {
        result.set(value, offset);
        offset += value.byteLength;
    }
    return result;
}

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function countPredicate(pixelCount, predicate) {
    let count = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (predicate(pixel)) count += 1;
    }
    return count;
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
