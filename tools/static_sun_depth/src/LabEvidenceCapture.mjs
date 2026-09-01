// Defines the exact raw-framebuffer-to-Lab-evidence-canvas contract.
// @ts-check

export const LAB_EVIDENCE_CANVAS_ID = 'ai531-lab-validation-evidence';
export const LAB_EVIDENCE_CANVAS_CLASS = 'lab-validation-evidence-canvas';
export const LAB_EVIDENCE_CAPTURE_SCHEMA = 'ai531-lab-evidence-canvas-capture-v2';
export const LAB_EVIDENCE_CAPTURE_ROW_TRANSFORM =
    'webgl-lower-left-to-canvas-top-left-vertical-flip-v1';
export const LAB_EVIDENCE_CAPTURE_ALPHA_POLICY =
    'force-opaque-preserve-authoritative-rgb-v1';
export const LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS = Object.freeze([1280, 720]);
export const LAB_EVIDENCE_CAPTURE_SLOTS = Object.freeze([
    'current',
    'cache',
    'comparison'
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 */
export function flipLabEvidenceRgba(pixels, width, height) {
    requireLabEvidencePixels(pixels, width, height);
    const rowByteLength = width * 4;
    const flipped = new Uint8ClampedArray(pixels.byteLength);
    for (let sourceY = 0; sourceY < height; sourceY += 1) {
        const sourceOffset = sourceY * rowByteLength;
        const destinationOffset = (height - 1 - sourceY) * rowByteLength;
        flipped.set(
            pixels.subarray(sourceOffset, sourceOffset + rowByteLength),
            destinationOffset
        );
    }
    return flipped;
}

/**
 * Makes browser screenshot storage unambiguous without changing any measured RGB byte.
 * HTML 2D canvases may premultiply non-opaque colors, so alpha is evidence metadata rather
 * than part of the Lab RGB comparison authority.
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 */
export function createLabEvidenceOpaqueRgba(pixels, width, height) {
    requireLabEvidencePixels(pixels, width, height);
    const opaque = new Uint8ClampedArray(pixels);
    for (let offset = 3; offset < opaque.byteLength; offset += 4) opaque[offset] = 255;
    return opaque;
}

/**
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 */
export function extractLabEvidenceRgb(pixels, width, height) {
    requireLabEvidencePixels(pixels, width, height);
    const rgb = new Uint8Array(width * height * 3);
    for (let source = 0, target = 0; source < pixels.byteLength; source += 4) {
        rgb[target] = pixels[source];
        rgb[target + 1] = pixels[source + 1];
        rgb[target + 2] = pixels[source + 2];
        target += 3;
    }
    return rgb;
}

/**
 * @param {Uint8Array|Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 */
export function createLabEvidenceOpaqueSamples(pixels, width, height) {
    requireLabEvidencePixels(pixels, width, height);
    const pixelCount = width * height;
    const anchors = [0, 0.25, 0.5, 0.75, 1].map(
        (fraction) => Math.round((pixelCount - 1) * fraction)
    );
    const used = new Set();
    const samples = [];
    for (const anchor of anchors) {
        let selected = -1;
        for (let offset = 0; offset < pixelCount; offset += 1) {
            const candidate = (anchor + offset) % pixelCount;
            if (!used.has(candidate)) {
                selected = candidate;
                break;
            }
        }
        if (selected < 0) continue;
        used.add(selected);
        const sourceX = selected % width;
        const sourceY = Math.floor(selected / width);
        const rgbaOffset = selected * 4;
        samples.push(Object.freeze({
            evidencePixel: Object.freeze([sourceX, height - 1 - sourceY]),
            rgba: Object.freeze([
                pixels[rgbaOffset],
                pixels[rgbaOffset + 1],
                pixels[rgbaOffset + 2],
                255
            ]),
            sourcePixel: Object.freeze([sourceX, sourceY])
        }));
    }
    if (samples.length < 1) {
        throw new Error('Lab evidence capture contains no authentication sample');
    }
    return Object.freeze(samples);
}

/**
 * @param {unknown} value
 * @param {'current'|'cache'|'comparison'|undefined} expectedSlot
 */
export function requireLabEvidenceCaptureState(value, expectedSlot = undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Lab evidence capture state must be an object');
    }
    const expectedKeys = [
        'alphaPolicy',
        'authoritativeRgbSha256',
        'authoritativeRgbaSha256',
        'canvasId',
        'dimensionsPixels',
        'evidenceRgbaSha256',
        'evidenceSamples',
        'revision',
        'rowTransform',
        'schema',
        'slot'
    ];
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
        throw new TypeError('Lab evidence capture state has unexpected fields');
    }
    if (value.schema !== LAB_EVIDENCE_CAPTURE_SCHEMA
        || value.alphaPolicy !== LAB_EVIDENCE_CAPTURE_ALPHA_POLICY
        || value.canvasId !== LAB_EVIDENCE_CANVAS_ID
        || value.rowTransform !== LAB_EVIDENCE_CAPTURE_ROW_TRANSFORM
        || JSON.stringify(value.dimensionsPixels)
            !== JSON.stringify(LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS)
        || !LAB_EVIDENCE_CAPTURE_SLOTS.includes(value.slot)
        || (expectedSlot !== undefined && value.slot !== expectedSlot)
        || !Number.isSafeInteger(value.revision) || value.revision < 1
        || !SHA256_PATTERN.test(value.authoritativeRgbSha256)
        || !SHA256_PATTERN.test(value.authoritativeRgbaSha256)
        || !SHA256_PATTERN.test(value.evidenceRgbaSha256)
        || !Array.isArray(value.evidenceSamples) || value.evidenceSamples.length < 1) {
        throw new Error('Lab evidence capture state is invalid');
    }
    for (const sample of value.evidenceSamples) {
        if (!sample || typeof sample !== 'object' || Array.isArray(sample)
            || JSON.stringify(Object.keys(sample).sort())
                !== '["evidencePixel","rgba","sourcePixel"]') {
            throw new Error('Lab evidence capture sample is invalid');
        }
        requirePixel(sample.sourcePixel, 'source');
        requirePixel(sample.evidencePixel, 'evidence');
        if (sample.evidencePixel[0] !== sample.sourcePixel[0]
            || sample.evidencePixel[1]
                !== LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[1] - 1 - sample.sourcePixel[1]
            || !Array.isArray(sample.rgba) || sample.rgba.length !== 4
            || sample.rgba.some((entry) => !Number.isSafeInteger(entry) || entry < 0 || entry > 255)
            || sample.rgba[3] !== 255) {
            throw new Error('Lab evidence capture sample does not prove the vertical flip');
        }
    }
    return value;
}

/**
 * @param {unknown} pixels
 * @param {number} width
 * @param {number} height
 */
function requireLabEvidencePixels(pixels, width, height) {
    if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray)) {
        throw new TypeError('Lab evidence pixels must be unsigned eight-bit RGBA');
    }
    if (!Number.isSafeInteger(width) || width < 1
        || !Number.isSafeInteger(height) || height < 1
        || pixels.byteLength !== width * height * 4) {
        throw new Error('Lab evidence RGBA dimensions are inconsistent');
    }
}

/** @param {unknown} value @param {string} label */
function requirePixel(value, label) {
    if (!Array.isArray(value) || value.length !== 2
        || value.some((entry, axis) => (
            !Number.isSafeInteger(entry)
            || entry < 0
            || entry >= LAB_EVIDENCE_CAPTURE_DIMENSIONS_PIXELS[axis]
        ))) {
        throw new Error(`Lab evidence ${label} pixel is outside the capture`);
    }
}
