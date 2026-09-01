// Creates the production validation receiver-mask partition from resolved framebuffer masks.
// @ts-check

/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   pixels: Uint8Array
 * }} ReceiverMaskCapture
 */

/**
 * @param {ReceiverMaskCapture} dynamicReceiverMask
 * @param {ReceiverMaskCapture} staticCityReceiverMask
 */
export function createProductionReceiverMaskPartition(
    dynamicReceiverMask,
    staticCityReceiverMask
) {
    const dynamic = requireReceiverMaskCapture(
        dynamicReceiverMask,
        'dynamic receiver mask'
    );
    const staticCity = requireReceiverMaskCapture(
        staticCityReceiverMask,
        'static City receiver mask'
    );
    if (dynamic.width !== staticCity.width || dynamic.height !== staticCity.height) {
        throw new Error('Production receiver-mask capture dimensions differ');
    }
    const dynamicPixels = new Uint8Array(dynamic.pixels.length);
    const staticCityPixels = new Uint8Array(staticCity.pixels.length);
    let dynamicReceiverMaskedPixelCount = 0;
    let eligibleStaticReceiverPixelCount = 0;
    let outsideStaticReceiverPixelCount = 0;
    let overlappingInputPixelCount = 0;
    for (let offset = 0; offset < dynamic.pixels.length; offset += 4) {
        const onDynamicReceiver = hasVisibleRgb(dynamic.pixels, offset);
        const onStaticCityReceiver = hasVisibleRgb(staticCity.pixels, offset);
        if (onDynamicReceiver && onStaticCityReceiver) overlappingInputPixelCount += 1;
        if (onDynamicReceiver) {
            setMaskPixel(dynamicPixels, offset, true);
            setMaskPixel(staticCityPixels, offset, false);
            dynamicReceiverMaskedPixelCount += 1;
        } else if (onStaticCityReceiver) {
            setMaskPixel(dynamicPixels, offset, false);
            setMaskPixel(staticCityPixels, offset, true);
            eligibleStaticReceiverPixelCount += 1;
        } else {
            setMaskPixel(dynamicPixels, offset, false);
            setMaskPixel(staticCityPixels, offset, false);
            outsideStaticReceiverPixelCount += 1;
        }
    }
    return Object.freeze({
        dynamicReceiverMask: Object.freeze({
            width: dynamic.width,
            height: dynamic.height,
            pixels: dynamicPixels
        }),
        staticCityReceiverMask: Object.freeze({
            width: dynamic.width,
            height: dynamic.height,
            pixels: staticCityPixels
        }),
        dynamicReceiverMaskedPixelCount,
        eligibleStaticReceiverPixelCount,
        outsideStaticReceiverPixelCount,
        overlappingInputPixelCount
    });
}

/** @param {unknown} value @param {string} label */
function requireReceiverMaskCapture(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(label + ' must be a receiver-mask capture');
    }
    const capture = /** @type {Record<string, any>} */ (value);
    if (!Number.isSafeInteger(capture.width) || capture.width < 1
        || !Number.isSafeInteger(capture.height) || capture.height < 1
        || !(capture.pixels instanceof Uint8Array)
        || capture.pixels.length !== capture.width * capture.height * 4) {
        throw new TypeError(label + ' dimensions or RGBA pixels are invalid');
    }
    return /** @type {ReceiverMaskCapture} */ (capture);
}

/** @param {Uint8Array} pixels @param {number} offset */
function hasVisibleRgb(pixels, offset) {
    return pixels[offset] > 0 || pixels[offset + 1] > 0 || pixels[offset + 2] > 0;
}

/** @param {Uint8Array} pixels @param {number} offset @param {boolean} visible */
function setMaskPixel(pixels, offset, visible) {
    const value = visible ? 255 : 0;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
}
