// src/graphics/visuals/postprocessing/GtaoDenoisePolicy.js
// GTAO denoise/debug policy helpers.
// @ts-check

/**
 * @param {{
 *   denoiseRequested?: boolean,
 *   debugViewRequested?: boolean,
 *   denoiseSupported?: boolean,
 *   debugOutputSupported?: boolean
 * }} options
 */
export function resolveGtaoDenoisePolicy(options = {}) {
    const denoiseRequested = options?.denoiseRequested !== false;
    const debugViewRequested = options?.debugViewRequested === true;
    const denoiseSupported = options?.denoiseSupported === true;
    const debugOutputSupported = options?.debugOutputSupported === true;

    let denoiseEnabled = denoiseRequested && denoiseSupported;
    let debugViewEnabled = debugViewRequested && debugOutputSupported;
    let fallbackReason = null;

    if (denoiseRequested && !denoiseSupported) {
        denoiseEnabled = false;
        debugViewEnabled = false;
        fallbackReason = 'denoise_unsupported';
    } else if (debugViewRequested && !debugOutputSupported) {
        debugViewEnabled = false;
        fallbackReason = 'debug_output_unsupported';
    }

    return {
        denoiseEnabled,
        debugViewEnabled,
        outputMode: debugViewEnabled ? 'denoise_debug' : 'default',
        fallbackReason
    };
}
