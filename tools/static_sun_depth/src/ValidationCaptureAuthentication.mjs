// Authenticates exact validation PNG inventories inside the AI 531 artifact authority.
// @ts-check

import {createHash} from 'node:crypto';
import {lstat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {inflateSync} from 'node:zlib';

export const VALIDATION_CAPTURE_AUTHENTICATION_METHOD =
    'sha256-byte-length-rehash-repo-artifact-confined-v1';
export const VALIDATION_CAPTURE_SLOTS = Object.freeze([
    'cache',
    'comparison',
    'current'
]);
export const PRODUCTION_VALIDATION_CAPTURE_SLOTS = Object.freeze([
    ...VALIDATION_CAPTURE_SLOTS,
    'dynamicReceiverMask',
    'staticCityReceiverMask'
]);
export const PRODUCTION_VALIDATION_CAPTURE_AUTHENTICATION_METHOD =
    'sha256-byte-length-rehash-png-decode-receiver-mask-partition-v2';
export const PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO = 1 / 16;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/**
 * @param {string} filePath
 * @param {{
 *   authorityRoot: string,
 *   expectedDimensionsPixels: readonly [number, number],
 *   repoRoot: string,
 *   readFileFn?: typeof readFile,
 *   lstatFn?: typeof lstat
 * }} options
 */
export async function createValidationCaptureRecord(filePath, options) {
    const normalized = normalizeRoots(options);
    const expectedDimensionsPixels = requireDimensions(
        options.expectedDimensionsPixels,
        'validation capture expected dimensions'
    );
    const readFileFn = options.readFileFn ?? readFile;
    const lstatFn = options.lstatFn ?? lstat;
    const absolutePath = requireCaptureAbsolutePath(
        filePath,
        normalized,
        'validation capture'
    );
    await assertNoSymlinkPathSegments(
        normalized.authorityRoot,
        absolutePath,
        lstatFn
    );
    const bytes = copyBytes(await readFileFn(absolutePath), 'validation capture');
    requirePngDimensions(bytes, expectedDimensionsPixels, 'validation capture');
    return Object.freeze({
        byteLength: bytes.byteLength,
        path: repositoryRelativePath(normalized.repoRoot, absolutePath),
        sha256: rawSha256(bytes)
    });
}

/**
 * @param {{
 *   authorityRoot: string,
 *   cases: readonly unknown[],
 *   expectedCaseIds: readonly string[],
 *   expectedCaptureCount: number,
 *   expectedDimensionsPixels: readonly [number, number],
 *   repoRoot: string,
 *   readFileFn?: typeof readFile,
 *   lstatFn?: typeof lstat
 * }} options
 */
export async function authenticateValidationCaptureSet(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('validation capture authentication options must be an object');
    }
    const normalized = normalizeRoots(options);
    const readFileFn = options.readFileFn ?? readFile;
    const lstatFn = options.lstatFn ?? lstat;
    const expectedCaseIds = requireExpectedCaseIds(options.expectedCaseIds);
    const expectedDimensionsPixels = requireDimensions(
        options.expectedDimensionsPixels,
        'validation capture expected dimensions'
    );
    if (!Number.isSafeInteger(options.expectedCaptureCount)
        || options.expectedCaptureCount !== expectedCaseIds.length * 3) {
        throw new Error('validation expected capture count must equal three per case');
    }
    if (!Array.isArray(options.cases)
        || options.cases.length !== expectedCaseIds.length) {
        throw new Error(
            `validation capture inventory must contain exactly ${expectedCaseIds.length} cases`
        );
    }
    const expectedIds = new Set(expectedCaseIds);
    const seenIds = new Set();
    const seenPaths = new Set();
    const authenticated = [];
    for (let index = 0; index < options.cases.length; index += 1) {
        const validationCase = requirePlainObject(
            options.cases[index],
            `validation capture case[${index}]`
        );
        const caseId = validationCase.caseId;
        if (typeof caseId !== 'string'
            || !expectedIds.has(caseId)
            || seenIds.has(caseId)) {
            throw new Error('validation capture case IDs must match the exact unique catalog');
        }
        seenIds.add(caseId);
        const captures = requireExactObject(
            validationCase.captures,
            VALIDATION_CAPTURE_SLOTS,
            `validation captures '${caseId}'`
        );
        for (const slot of VALIDATION_CAPTURE_SLOTS) {
            const record = requireCaptureRecord(captures[slot], `${caseId}.${slot}`);
            const expectedSuffix = `/${caseId}/${slot}.png`;
            if (!record.path.endsWith(expectedSuffix)) {
                throw new Error(
                    `validation capture '${caseId}.${slot}' path must end with '${expectedSuffix}'`
                );
            }
            const absolutePath = resolveCaptureRecordPath(record.path, normalized);
            const pathIdentity = process.platform === 'win32'
                ? absolutePath.toLowerCase()
                : absolutePath;
            if (seenPaths.has(pathIdentity)) {
                throw new Error(`validation capture path '${record.path}' is duplicated`);
            }
            seenPaths.add(pathIdentity);
            await assertNoSymlinkPathSegments(
                normalized.authorityRoot,
                absolutePath,
                lstatFn
            );
            const bytes = copyBytes(
                await readFileFn(absolutePath),
                `validation capture '${caseId}.${slot}'`
            );
            requirePngDimensions(
                bytes,
                expectedDimensionsPixels,
                `validation capture '${caseId}.${slot}'`
            );
            if (bytes.byteLength !== record.byteLength
                || rawSha256(bytes) !== record.sha256) {
                throw new Error(
                    `validation capture '${caseId}.${slot}' differs from its authenticated record`
                );
            }
            authenticated.push(Object.freeze({
                caseId,
                slot,
                byteLength: record.byteLength,
                path: record.path,
                sha256: record.sha256
            }));
        }
    }
    if (seenIds.size !== expectedIds.size
        || expectedCaseIds.some((caseId) => !seenIds.has(caseId))
        || authenticated.length !== options.expectedCaptureCount) {
        throw new Error(
            `validation capture inventory must authenticate exactly ${options.expectedCaptureCount} PNGs`
        );
    }
    authenticated.sort((left, right) => (
        compareStrings(left.caseId, right.caseId)
        || compareStrings(left.slot, right.slot)
    ));
    return Object.freeze({
        captureCount: authenticated.length,
        captureSetSha256: rawSha256(
            new TextEncoder().encode(JSON.stringify(authenticated))
        ),
        dimensionsPixels: Object.freeze([...expectedDimensionsPixels]),
        method: VALIDATION_CAPTURE_AUTHENTICATION_METHOD
    });
}

/**
 * @param {{
 *   authorityRoot: string,
 *   cases: readonly unknown[],
 *   expectedCaseIds: readonly string[],
 *   expectedCaptureCount: number,
 *   expectedDimensionsPixels: readonly [number, number],
 *   repoRoot: string,
 *   readFileFn?: typeof readFile,
 *   lstatFn?: typeof lstat
 * }} options
 */
export async function authenticateProductionValidationCaptureSet(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('production validation capture options must be an object');
    }
    const normalized = normalizeRoots(options);
    const readFileFn = options.readFileFn ?? readFile;
    const lstatFn = options.lstatFn ?? lstat;
    const expectedCaseIds = requireExpectedCaseIds(options.expectedCaseIds);
    const expectedDimensionsPixels = requireDimensions(
        options.expectedDimensionsPixels,
        'production validation capture expected dimensions'
    );
    const expectedCaptureCount =
        expectedCaseIds.length * PRODUCTION_VALIDATION_CAPTURE_SLOTS.length;
    if (!Number.isSafeInteger(options.expectedCaptureCount)
        || options.expectedCaptureCount !== expectedCaptureCount) {
        throw new Error(
            'production validation expected capture count must equal five per case'
        );
    }
    if (!Array.isArray(options.cases)
        || options.cases.length !== expectedCaseIds.length) {
        throw new Error(
            'production validation capture inventory must contain exactly '
            + expectedCaseIds.length + ' cases'
        );
    }
    const expectedIds = new Set(expectedCaseIds);
    const seenIds = new Set();
    const seenPaths = new Set();
    const authenticated = [];
    let minimumStaticReceiverPixelCount = Infinity;
    for (let index = 0; index < options.cases.length; index += 1) {
        const validationCase = requirePlainObject(
            options.cases[index],
            'production validation capture case[' + index + ']'
        );
        const caseId = validationCase.caseId;
        if (typeof caseId !== 'string'
            || !expectedIds.has(caseId)
            || seenIds.has(caseId)) {
            throw new Error(
                'production validation capture case IDs must match the exact unique catalog'
            );
        }
        seenIds.add(caseId);
        const captures = requireExactObject(
            validationCase.captures,
            PRODUCTION_VALIDATION_CAPTURE_SLOTS,
            'production validation captures ' + caseId
        );
        const metrics = requireReceiverMaskMetrics(
            validationCase.metrics,
            'production validation metrics ' + caseId,
            expectedDimensionsPixels
        );
        const decodedMasks = /** @type {Record<string, Uint8Array>} */ ({});
        for (const slot of PRODUCTION_VALIDATION_CAPTURE_SLOTS) {
            const record = requireCaptureRecord(
                captures[slot],
                caseId + '.' + slot
            );
            const expectedSuffix = '/' + caseId + '/' + slot + '.png';
            if (!record.path.endsWith(expectedSuffix)) {
                throw new Error(
                    'production validation capture ' + caseId + '.' + slot
                    + ' path must end with ' + expectedSuffix
                );
            }
            const absolutePath = resolveCaptureRecordPath(record.path, normalized);
            const pathIdentity = process.platform === 'win32'
                ? absolutePath.toLowerCase()
                : absolutePath;
            if (seenPaths.has(pathIdentity)) {
                throw new Error(
                    'production validation capture path ' + record.path + ' is duplicated'
                );
            }
            seenPaths.add(pathIdentity);
            await assertNoSymlinkPathSegments(
                normalized.authorityRoot,
                absolutePath,
                lstatFn
            );
            const bytes = copyBytes(
                await readFileFn(absolutePath),
                'production validation capture ' + caseId + '.' + slot
            );
            requirePngDimensions(
                bytes,
                expectedDimensionsPixels,
                'production validation capture ' + caseId + '.' + slot
            );
            if (bytes.byteLength !== record.byteLength
                || rawSha256(bytes) !== record.sha256) {
                throw new Error(
                    'production validation capture ' + caseId + '.' + slot
                    + ' differs from its authenticated record'
                );
            }
            let maskPixelCount = null;
            if (slot === 'dynamicReceiverMask' || slot === 'staticCityReceiverMask') {
                const mask = decodePngMask(
                    bytes,
                    expectedDimensionsPixels,
                    'production validation capture ' + caseId + '.' + slot
                );
                decodedMasks[slot] = mask;
                maskPixelCount = countMaskPixels(mask);
            }
            authenticated.push(Object.freeze({
                caseId,
                slot,
                byteLength: record.byteLength,
                maskPixelCount,
                path: record.path,
                sha256: record.sha256
            }));
        }
        const staticMask = decodedMasks.staticCityReceiverMask;
        const dynamicMask = decodedMasks.dynamicReceiverMask;
        let staticCount = 0;
        let dynamicCount = 0;
        let outsideCount = 0;
        for (let pixel = 0; pixel < staticMask.length; pixel += 1) {
            if (staticMask[pixel] && dynamicMask[pixel]) {
                throw new Error(
                    'production validation receiver masks overlap for ' + caseId
                );
            }
            if (staticMask[pixel]) staticCount += 1;
            else if (dynamicMask[pixel]) dynamicCount += 1;
            else outsideCount += 1;
        }
        const minimumStaticCount = Math.ceil(
            metrics.pixelCount * PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO
        );
        if (staticCount < minimumStaticCount) {
            throw new Error(
                'production validation static receiver mask coverage collapsed for '
                + caseId
            );
        }
        if (staticCount !== metrics.eligibleStaticReceiverPixelCount
            || dynamicCount !== metrics.dynamicReceiverMaskedPixelCount
            || outsideCount !== metrics.outsideStaticReceiverPixelCount) {
            throw new Error(
                'production validation decoded receiver masks differ from metrics for '
                + caseId
            );
        }
        minimumStaticReceiverPixelCount = Math.min(
            minimumStaticReceiverPixelCount,
            staticCount
        );
    }
    if (seenIds.size !== expectedIds.size
        || expectedCaseIds.some((caseId) => !seenIds.has(caseId))
        || authenticated.length !== expectedCaptureCount) {
        throw new Error(
            'production validation capture inventory must authenticate exactly '
            + expectedCaptureCount + ' PNGs'
        );
    }
    authenticated.sort((left, right) => (
        compareStrings(left.caseId, right.caseId)
        || compareStrings(left.slot, right.slot)
    ));
    return Object.freeze({
        captureCount: authenticated.length,
        captureSetSha256: rawSha256(
            new TextEncoder().encode(JSON.stringify(authenticated))
        ),
        dimensionsPixels: Object.freeze([...expectedDimensionsPixels]),
        method: PRODUCTION_VALIDATION_CAPTURE_AUTHENTICATION_METHOD,
        minimumStaticReceiverCoverageRatio:
            PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO,
        minimumStaticReceiverPixelCount
    });
}

/** @param {unknown} value @param {string} label */
export function requireCaptureRecord(value, label) {
    const record = requireExactObject(
        value,
        ['byteLength', 'path', 'sha256'],
        `validation capture record '${label}'`
    );
    if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 33) {
        throw new TypeError(`validation capture record '${label}'.byteLength is invalid`);
    }
    if (!isSafeRelativePath(record.path) || !record.path.endsWith('.png')) {
        throw new TypeError(`validation capture record '${label}'.path is unsafe`);
    }
    if (!HASH_PATTERN.test(record.sha256)) {
        throw new TypeError(`validation capture record '${label}'.sha256 is invalid`);
    }
    return record;
}

/** @param {unknown} value @param {number} expectedCount @param {unknown} dimensions */
export function requireCaptureAuthenticationSummary(value, expectedCount, dimensions) {
    const expectedDimensionsPixels = requireDimensions(
        dimensions,
        'validation capture summary expected dimensions'
    );
    const summary = requireExactObject(value, [
        'captureCount',
        'captureSetSha256',
        'dimensionsPixels',
        'method'
    ], 'validation capture authentication summary');
    if (summary.captureCount !== expectedCount
        || summary.method !== VALIDATION_CAPTURE_AUTHENTICATION_METHOD
        || JSON.stringify(summary.dimensionsPixels)
            !== JSON.stringify(expectedDimensionsPixels)
        || !HASH_PATTERN.test(summary.captureSetSha256)) {
        throw new Error('validation capture authentication summary is invalid');
    }
    return summary;
}

/** @param {unknown} value @param {number} expectedCount @param {unknown} dimensions */
export function requireProductionCaptureAuthenticationSummary(
    value,
    expectedCount,
    dimensions
) {
    const expectedDimensionsPixels = requireDimensions(
        dimensions,
        'production validation capture summary expected dimensions'
    );
    const summary = requireExactObject(value, [
        'captureCount',
        'captureSetSha256',
        'dimensionsPixels',
        'method',
        'minimumStaticReceiverCoverageRatio',
        'minimumStaticReceiverPixelCount'
    ], 'production validation capture authentication summary');
    const pixelCount = expectedDimensionsPixels[0] * expectedDimensionsPixels[1];
    if (summary.captureCount !== expectedCount
        || summary.method !== PRODUCTION_VALIDATION_CAPTURE_AUTHENTICATION_METHOD
        || JSON.stringify(summary.dimensionsPixels)
            !== JSON.stringify(expectedDimensionsPixels)
        || !HASH_PATTERN.test(summary.captureSetSha256)
        || summary.minimumStaticReceiverCoverageRatio
            !== PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO
        || !Number.isSafeInteger(summary.minimumStaticReceiverPixelCount)
        || summary.minimumStaticReceiverPixelCount
            < Math.ceil(
                pixelCount * PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO
            )) {
        throw new Error(
            'production validation capture authentication summary is invalid'
        );
    }
    return summary;
}

function normalizeRoots(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('validation capture roots must be an object');
    }
    if (typeof options.repoRoot !== 'string' || !options.repoRoot
        || typeof options.authorityRoot !== 'string' || !options.authorityRoot) {
        throw new TypeError('validation capture roots must be paths');
    }
    const repoRoot = path.resolve(options.repoRoot);
    const authorityRoot = path.resolve(options.authorityRoot);
    requireInside(repoRoot, authorityRoot, true, 'artifact authority');
    return Object.freeze({authorityRoot, repoRoot});
}

function requireExpectedCaseIds(value) {
    if (!Array.isArray(value) || value.length === 0
        || value.some((entry) => typeof entry !== 'string' || !entry)) {
        throw new TypeError('validation expected case IDs must be a nonempty string array');
    }
    const ids = [...value];
    if (new Set(ids).size !== ids.length) {
        throw new Error('validation expected case IDs must be unique');
    }
    return ids;
}

function resolveCaptureRecordPath(relativePath, roots) {
    const absolutePath = path.resolve(roots.repoRoot, ...relativePath.split('/'));
    requireInside(roots.repoRoot, absolutePath, false, 'repository');
    requireInside(roots.authorityRoot, absolutePath, false, 'artifact authority');
    return absolutePath;
}

function requireCaptureAbsolutePath(filePath, roots, label) {
    if (typeof filePath !== 'string' || !filePath) {
        throw new TypeError(`${label} must be a path`);
    }
    const absolutePath = path.resolve(filePath);
    requireInside(roots.repoRoot, absolutePath, false, 'repository');
    requireInside(roots.authorityRoot, absolutePath, false, 'artifact authority');
    return absolutePath;
}

function repositoryRelativePath(root, filePath) {
    requireInside(root, filePath, false, 'repository');
    return path.relative(root, filePath).replaceAll('\\', '/');
}

function isSafeRelativePath(value) {
    return typeof value === 'string'
        && value.length > 0
        && !value.includes('\\')
        && !value.startsWith('/')
        && !/^[A-Za-z]:/.test(value)
        && path.posix.normalize(value) === value
        && !value.split('/').includes('..')
        && !value.split('/').includes('.');
}

function requireInside(root, candidate, allowRoot, label) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if ((!allowRoot && !relative)
        || relative.startsWith('..')
        || path.isAbsolute(relative)) {
        throw new Error(`validation capture path must stay inside the ${label}`);
    }
}

async function assertNoSymlinkPathSegments(root, candidate, lstatFn) {
    const absoluteRoot = path.resolve(root);
    const absoluteCandidate = path.resolve(candidate);
    requireInside(absoluteRoot, absoluteCandidate, false, 'artifact authority');
    const relative = path.relative(absoluteRoot, absoluteCandidate);
    let current = absoluteRoot;
    for (const segment of ['', ...relative.split(path.sep)]) {
        if (segment) current = path.join(current, segment);
        const entry = await lstatFn(current);
        if (entry?.isSymbolicLink?.() === true) {
            throw new Error(
                `validation capture rejects symbolic-link path segment '${current}'`
            );
        }
    }
}

function requirePngDimensions(bytes, expectedDimensionsPixels, label) {
    if (bytes.byteLength < 33
        || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
        throw new Error(`${label} is not a PNG file`);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ihdrLength = view.getUint32(8, false);
    const ihdrType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    const dimensions = [view.getUint32(16, false), view.getUint32(20, false)];
    if (ihdrLength !== 13
        || ihdrType !== 'IHDR'
        || dimensions.some((entry) => entry < 1)) {
        throw new Error(`${label} has an invalid PNG IHDR`);
    }
    if (JSON.stringify(dimensions) !== JSON.stringify(expectedDimensionsPixels)) {
        throw new Error(
            label + ' PNG IHDR dimensions must be '
            + expectedDimensionsPixels[0] + 'x' + expectedDimensionsPixels[1]
        );
    }
}

function decodePngMask(bytes, expectedDimensionsPixels, label) {
    requirePngDimensions(bytes, expectedDimensionsPixels, label);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const bitDepth = bytes[24];
    const colorType = bytes[25];
    if (bitDepth !== 8
        || ![0, 2, 4, 6].includes(colorType)
        || bytes[26] !== 0
        || bytes[27] !== 0
        || bytes[28] !== 0) {
        throw new Error(
            label + ' must use non-interlaced eight-bit grayscale or RGB PNG pixels'
        );
    }
    const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
    const idatChunks = [];
    let compressedByteLength = 0;
    let offset = 8;
    let sawIend = false;
    while (offset + 12 <= bytes.byteLength) {
        const length = view.getUint32(offset, false);
        const typeOffset = offset + 4;
        const dataOffset = offset + 8;
        const endOffset = dataOffset + length;
        if (endOffset + 4 > bytes.byteLength) {
            throw new Error(label + ' contains a truncated PNG chunk');
        }
        const type = String.fromCharCode(
            bytes[typeOffset],
            bytes[typeOffset + 1],
            bytes[typeOffset + 2],
            bytes[typeOffset + 3]
        );
        if (type === 'IDAT') {
            const chunk = bytes.subarray(dataOffset, endOffset);
            idatChunks.push(chunk);
            compressedByteLength += chunk.byteLength;
        }
        if (type === 'IEND') {
            sawIend = true;
            break;
        }
        offset = endOffset + 4;
    }
    if (!sawIend || idatChunks.length < 1) {
        throw new Error(label + ' has no complete PNG image data');
    }
    const compressed = new Uint8Array(compressedByteLength);
    let compressedOffset = 0;
    for (const chunk of idatChunks) {
        compressed.set(chunk, compressedOffset);
        compressedOffset += chunk.byteLength;
    }
    let inflated;
    try {
        inflated = inflateSync(compressed);
    } catch (error) {
        throw new Error(label + ' PNG image data cannot be inflated', {cause: error});
    }
    const width = expectedDimensionsPixels[0];
    const height = expectedDimensionsPixels[1];
    const stride = width * channels;
    if (inflated.byteLength !== height * (stride + 1)) {
        throw new Error(label + ' PNG scanline byte length is inconsistent');
    }
    const mask = new Uint8Array(width * height);
    let previous = new Uint8Array(stride);
    let sourceOffset = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = inflated[sourceOffset];
        sourceOffset += 1;
        if (filter > 4) throw new Error(label + ' uses an unsupported PNG row filter');
        const row = new Uint8Array(stride);
        for (let index = 0; index < stride; index += 1) {
            const raw = inflated[sourceOffset + index];
            const left = index >= channels ? row[index - channels] : 0;
            const up = previous[index];
            const upperLeft = index >= channels ? previous[index - channels] : 0;
            let predictor = 0;
            if (filter === 1) predictor = left;
            else if (filter === 2) predictor = up;
            else if (filter === 3) predictor = Math.floor((left + up) / 2);
            else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
            row[index] = (raw + predictor) & 255;
        }
        sourceOffset += stride;
        for (let x = 0; x < width; x += 1) {
            const pixelOffset = x * channels;
            const visible = colorType === 0 || colorType === 4
                ? row[pixelOffset] > 0
                : row[pixelOffset] > 0
                    || row[pixelOffset + 1] > 0
                    || row[pixelOffset + 2] > 0;
            mask[y * width + x] = visible ? 1 : 0;
        }
        previous = row;
    }
    return mask;
}

function requireReceiverMaskMetrics(value, label, expectedDimensionsPixels) {
    const metrics = requirePlainObject(value, label);
    for (const key of [
        'dynamicReceiverMaskedPixelCount',
        'eligibleStaticReceiverPixelCount',
        'height',
        'outsideStaticReceiverPixelCount',
        'pixelCount',
        'width'
    ]) {
        if (!Number.isSafeInteger(metrics[key]) || metrics[key] < 0) {
            throw new TypeError(label + '.' + key + ' must be a non-negative safe integer');
        }
    }
    if (metrics.width !== expectedDimensionsPixels[0]
        || metrics.height !== expectedDimensionsPixels[1]
        || metrics.pixelCount !== metrics.width * metrics.height
        || metrics.eligibleStaticReceiverPixelCount
            + metrics.dynamicReceiverMaskedPixelCount
            + metrics.outsideStaticReceiverPixelCount !== metrics.pixelCount) {
        throw new Error(label + ' receiver-mask partition or dimensions are inconsistent');
    }
    return metrics;
}

function countMaskPixels(mask) {
    let count = 0;
    for (const value of mask) count += value;
    return count;
}

function paethPredictor(left, up, upperLeft) {
    const prediction = left + up - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const upperLeftDistance = Math.abs(prediction - upperLeft);
    if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
    return upDistance <= upperLeftDistance ? up : upperLeft;
}

function requireDimensions(value, label) {
    if (!Array.isArray(value)
        || value.length !== 2
        || value.some((entry) => !Number.isSafeInteger(entry) || entry < 1)) {
        throw new TypeError(label + ' must contain exactly two positive integers');
    }
    return Object.freeze([...value]);
}

function requirePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return value;
}

function requireExactObject(value, expectedKeys, label) {
    const source = requirePlainObject(value, label);
    const actual = Object.keys(source).sort(compareStrings);
    const expected = [...expectedKeys].sort(compareStrings);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new TypeError(`${label} must contain exactly ${expected.join(', ')}`);
    }
    for (const key of expected) {
        const property = Object.getOwnPropertyDescriptor(source, key);
        if (!property || !property.enumerable
            || !Object.prototype.hasOwnProperty.call(property, 'value')) {
            throw new TypeError(`${label}.${key} must be an enumerable own data property`);
        }
    }
    return source;
}

function copyBytes(value, label) {
    if (value instanceof Uint8Array) return value.slice();
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    throw new TypeError(`${label} must be bytes`);
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
}
