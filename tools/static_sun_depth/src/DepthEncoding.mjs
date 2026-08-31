// Quantizes canonical RGBA32F depth/occupancy pixels into deterministic guarded RG8 tiles.
// @ts-check

import { failStaticSunDepth } from './StaticSunDepthToolError.mjs';

export const STATIC_SUN_DEPTH_OCCUPIED_CODE_MIN = 0;
export const STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX = 65534;
export const STATIC_SUN_DEPTH_EMPTY_CODE = 65535;
export const STATIC_SUN_DEPTH_ENCODING = 'rg8_packed_depth_u16_v1';
export const STATIC_SUN_DEPTH_BYTE_ORDER = 'r_most_significant_g_least_significant_v1';

/**
 * @param {number} depthMeters
 * @param {number} clipNearMeters
 * @param {number} clipFarMeters
 */
export function encodeStaticSunDepth(depthMeters, clipNearMeters, clipFarMeters) {
    assertDepthRange(clipNearMeters, clipFarMeters);
    if (!Number.isFinite(depthMeters) || depthMeters < clipNearMeters || depthMeters > clipFarMeters) {
        failStaticSunDepth('static_sun_depth_value_out_of_range', 'Occupied depth lies outside the declared camera clip range.', {
            clipFarMeters,
            clipNearMeters,
            depthMeters: Number.isFinite(depthMeters) ? depthMeters : null
        });
    }
    const normalized = (depthMeters - clipNearMeters) / (clipFarMeters - clipNearMeters);
    return Math.min(
        STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX,
        Math.max(STATIC_SUN_DEPTH_OCCUPIED_CODE_MIN, Math.round(normalized * STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX))
    );
}

/**
 * @param {number} code
 * @param {number} clipNearMeters
 * @param {number} clipFarMeters
 */
export function decodeStaticSunDepth(code, clipNearMeters, clipFarMeters) {
    assertDepthRange(clipNearMeters, clipFarMeters);
    if (!Number.isSafeInteger(code)
        || code < STATIC_SUN_DEPTH_OCCUPIED_CODE_MIN
        || code > STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX) {
        throw new RangeError('Only occupied static-sun depth codes from 0 through 65534 can be decoded');
    }
    return clipNearMeters + (code / STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX) * (clipFarMeters - clipNearMeters);
}

/**
 * @param {{
 *   canonicalBytes: Uint8Array,
 *   width: number,
 *   height: number,
 *   guardPixels: number,
 *   clipNearMeters: number,
 *   clipFarMeters: number,
 *   orthographicBoundsMeters: {bottom: number, left: number, right: number, top: number}
 * }} options
 */
export function quantizeStaticSunDepthTile(options) {
    assertQuantizeOptions(options);
    const { width, height, guardPixels, clipNearMeters, clipFarMeters } = options;
    const sourceView = new DataView(
        options.canonicalBytes.buffer,
        options.canonicalBytes.byteOffset,
        options.canonicalBytes.byteLength
    );
    const interior = new Uint8Array(width * height * 2);
    let occupiedTexelCount = 0;
    let emptyTexelCount = 0;
    let sourceDepthMinimumMeters = Infinity;
    let sourceDepthMaximumMeters = -Infinity;
    let encodedCodeMinimum = STATIC_SUN_DEPTH_EMPTY_CODE;
    let encodedCodeMaximum = STATIC_SUN_DEPTH_OCCUPIED_CODE_MIN;
    let maximumAbsoluteErrorMeters = 0;
    let totalAbsoluteErrorMeters = 0;
    const bounds = options.orthographicBoundsMeters;
    const coordinateTolerance = Math.max(
        Math.abs(bounds.right - bounds.left) / width,
        Math.abs(bounds.top - bounds.bottom) / height
    ) * 1e-4;

    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
        const sourceOffset = pixelIndex * 16;
        const lightX = sourceView.getFloat32(sourceOffset, true);
        const lightY = sourceView.getFloat32(sourceOffset + 4, true);
        const depthMeters = sourceView.getFloat32(sourceOffset + 8, true);
        const occupancy = sourceView.getFloat32(sourceOffset + 12, true);
        for (const [component, value] of [['x', lightX], ['y', lightY], ['depth', depthMeters], ['occupancy', occupancy]]) {
            if (!Number.isFinite(value)) {
                failStaticSunDepth(
                    'static_sun_depth_pixel_non_finite',
                    'Canonical static-sun depth pixels must contain only finite float32 values.',
                    { component, pixelIndex }
                );
            }
        }
        let code;
        if (occupancy === 0) {
            if (lightX !== 0 || lightY !== 0 || depthMeters !== 0) {
                failStaticSunDepth(
                    'static_sun_depth_empty_sentinel_mismatch',
                    'An empty texel does not carry the canonical zero RGBA sentinel.',
                    { pixelIndex }
                );
            }
            code = STATIC_SUN_DEPTH_EMPTY_CODE;
            emptyTexelCount += 1;
        } else if (occupancy === 1) {
            if (lightX < bounds.left - coordinateTolerance || lightX > bounds.right + coordinateTolerance
                || lightY < bounds.bottom - coordinateTolerance || lightY > bounds.top + coordinateTolerance) {
                failStaticSunDepth(
                    'static_sun_depth_position_out_of_bounds',
                    'An occupied light-space position lies outside the declared orthographic bounds.',
                    { lightX, lightY, pixelIndex }
                );
            }
            code = encodeStaticSunDepth(depthMeters, clipNearMeters, clipFarMeters);
            const decodedDepth = decodeStaticSunDepth(code, clipNearMeters, clipFarMeters);
            const absoluteError = Math.abs(decodedDepth - depthMeters);
            maximumAbsoluteErrorMeters = Math.max(maximumAbsoluteErrorMeters, absoluteError);
            totalAbsoluteErrorMeters += absoluteError;
            sourceDepthMinimumMeters = Math.min(sourceDepthMinimumMeters, depthMeters);
            sourceDepthMaximumMeters = Math.max(sourceDepthMaximumMeters, depthMeters);
            encodedCodeMinimum = Math.min(encodedCodeMinimum, code);
            encodedCodeMaximum = Math.max(encodedCodeMaximum, code);
            occupiedTexelCount += 1;
        } else {
            failStaticSunDepth(
                'static_sun_depth_occupancy_ambiguous',
                'Canonical occupancy must be exactly zero for empty or one for occupied.',
                { occupancy, pixelIndex }
            );
        }
        interior[pixelIndex * 2] = code >>> 8;
        interior[pixelIndex * 2 + 1] = code & 0xff;
    }
    if (occupiedTexelCount === 0 || emptyTexelCount === 0) {
        failStaticSunDepth(
            'static_sun_depth_fixture_coverage_invalid',
            'The deterministic fixture must contain at least one occupied and one empty texel.',
            { emptyTexelCount, occupiedTexelCount }
        );
    }

    const storedWidth = width + guardPixels * 2;
    const storedHeight = height + guardPixels * 2;
    const payload = new Uint8Array(storedWidth * storedHeight * 2);
    for (let storedY = 0; storedY < storedHeight; storedY += 1) {
        const sourceY = clamp(storedY - guardPixels, 0, height - 1);
        for (let storedX = 0; storedX < storedWidth; storedX += 1) {
            const sourceX = clamp(storedX - guardPixels, 0, width - 1);
            const sourceOffset = (sourceY * width + sourceX) * 2;
            const destinationOffset = (storedY * storedWidth + storedX) * 2;
            payload[destinationOffset] = interior[sourceOffset];
            payload[destinationOffset + 1] = interior[sourceOffset + 1];
        }
    }

    const encodedUnitMeters = (clipFarMeters - clipNearMeters) / STATIC_SUN_DEPTH_OCCUPIED_CODE_MAX;
    return Object.freeze({
        payload,
        statistics: Object.freeze({
            emptyTexelCount,
            encodedCodeMaximum,
            encodedCodeMinimum,
            encodedUnitMeters,
            maximumAbsoluteErrorMeters,
            meanAbsoluteErrorMeters: totalAbsoluteErrorMeters / occupiedTexelCount,
            occupiedTexelCount,
            sourceDepthMaximumMeters,
            sourceDepthMinimumMeters,
            theoreticalMaximumRoundingErrorMeters: encodedUnitMeters / 2
        }),
        tile: Object.freeze({
            guardPixels: Object.freeze({
                bottom: guardPixels,
                left: guardPixels,
                policy: 'copy-adjacent-clamp-exterior-v1',
                right: guardPixels,
                top: guardPixels
            }),
            interior: Object.freeze({
                height,
                storedOriginX: guardPixels,
                storedOriginY: guardPixels,
                width
            }),
            lightSpaceBoundsMeters: Object.freeze({ ...bounds }),
            lightSpaceTexelSizeMeters: Object.freeze([
                (bounds.right - bounds.left) / width,
                (bounds.top - bounds.bottom) / height
            ]),
            stored: Object.freeze({ height: storedHeight, width: storedWidth })
        })
    });
}

/** @param {Parameters<typeof quantizeStaticSunDepthTile>[0]} options */
function assertQuantizeOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Depth quantization options are required');
    if (!(options.canonicalBytes instanceof Uint8Array)) throw new TypeError('canonicalBytes must be a Uint8Array');
    for (const [key, value] of [['width', options.width], ['height', options.height]]) {
        if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`${key} must be a positive safe integer`);
    }
    if (!Number.isSafeInteger(options.guardPixels) || options.guardPixels < 1 || options.guardPixels > 64) {
        throw new RangeError('guardPixels must be an integer from 1 through 64');
    }
    const expectedBytes = options.width * options.height * 16;
    if (!Number.isSafeInteger(expectedBytes) || options.canonicalBytes.byteLength !== expectedBytes) {
        failStaticSunDepth(
            'static_sun_depth_canonical_size_mismatch',
            'Canonical depth bytes do not match the declared RGBA32F dimensions.',
            {
                actualByteLength: options.canonicalBytes.byteLength,
                expectedByteLength: Number.isSafeInteger(expectedBytes) ? expectedBytes : null
            }
        );
    }
    assertDepthRange(options.clipNearMeters, options.clipFarMeters);
    const bounds = options.orthographicBoundsMeters;
    if (!bounds || typeof bounds !== 'object'
        || ![bounds.bottom, bounds.left, bounds.right, bounds.top].every(Number.isFinite)
        || bounds.left >= bounds.right || bounds.bottom >= bounds.top) {
        throw new TypeError('orthographicBoundsMeters must contain finite ordered bounds');
    }
}

/** @param {number} clipNearMeters @param {number} clipFarMeters */
function assertDepthRange(clipNearMeters, clipFarMeters) {
    if (!Number.isFinite(clipNearMeters) || !Number.isFinite(clipFarMeters)
        || clipNearMeters <= 0 || clipFarMeters <= clipNearMeters) {
        throw new RangeError('Depth encoding requires a positive ordered near/far range');
    }
}

/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
