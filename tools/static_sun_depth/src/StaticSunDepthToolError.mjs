// Defines stable structured failures for the static-sun depth fixture compiler.
// @ts-check

import { cloneCanonicalJson } from '../../../src/app/illumination/bake_source/CanonicalJson.js';

export const STATIC_SUN_DEPTH_TOOL_ERROR_SCHEMA = 'bus-sim-static-sun-depth-tool-error-v1';

export class StaticSunDepthToolError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Record<string, unknown>} [context]
     * @param {{cause?: unknown}} [options]
     */
    constructor(code, message, context = {}, options = {}) {
        if (typeof code !== 'string' || !/^[a-z][a-z0-9_]*$/.test(code)) {
            throw new TypeError('Static-sun depth error code must use lower_snake_case');
        }
        if (typeof message !== 'string' || !message) {
            throw new TypeError('Static-sun depth error message must be a non-empty string');
        }
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'StaticSunDepthToolError';
        this.code = code;
        this.context = /** @type {Readonly<Record<string, unknown>>} */ (cloneCanonicalJson(context));
    }

    toJSON() {
        return Object.freeze({
            schema: STATIC_SUN_DEPTH_TOOL_ERROR_SCHEMA,
            code: this.code,
            message: this.message,
            context: this.context
        });
    }
}

/** @param {unknown} value */
export function isStaticSunDepthToolError(value) {
    return value instanceof StaticSunDepthToolError;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 * @param {unknown} [cause]
 * @returns {never}
 */
export function failStaticSunDepth(code, message, context = {}, cause) {
    throw new StaticSunDepthToolError(code, message, context, cause === undefined ? {} : { cause });
}

/**
 * @param {unknown} error
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 */
export function asStaticSunDepthToolError(error, code, message, context = {}) {
    if (isStaticSunDepthToolError(error)) return error;
    const causeCode = typeof error === 'object' && error && 'code' in error
        ? String(/** @type {{code?: unknown}} */ (error).code ?? '') || null
        : null;
    return new StaticSunDepthToolError(code, message, { ...context, causeCode }, { cause: error });
}
