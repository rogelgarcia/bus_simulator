// Defines stable structured failures for the offline illumination compiler.
// @ts-check

import { cloneCanonicalJson } from '../../../src/app/illumination/bake_source/CanonicalJson.js';

export const COMPILER_ERROR_SCHEMA = 'bus-sim-illumination-compiler-error-v1';

/**
 * A machine-readable compiler failure whose code is stable across message changes.
 */
export class CompilerError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Record<string, unknown>} [context]
     * @param {{cause?: unknown}} [options]
     */
    constructor(code, message, context = {}, options = {}) {
        assertErrorCode(code);
        if (typeof message !== 'string' || !message) {
            throw new TypeError('Compiler error message must be a non-empty string');
        }
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'CompilerError';
        this.code = code;
        this.context = /** @type {Readonly<Record<string, unknown>>} */ (cloneCanonicalJson(context));
    }

    /**
     * @returns {Readonly<{schema: string, code: string, message: string, context: Readonly<Record<string, unknown>>}>}
     */
    toJSON() {
        return Object.freeze({
            schema: COMPILER_ERROR_SCHEMA,
            code: this.code,
            message: this.message,
            context: this.context
        });
    }
}

export { CompilerError as IlluminationBakeCompilerError };

/**
 * @param {unknown} value
 * @returns {value is CompilerError}
 */
export function isCompilerError(value) {
    return value instanceof CompilerError;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 * @param {unknown} [cause]
 * @returns {never}
 */
export function failCompiler(code, message, context = {}, cause) {
    throw new CompilerError(code, message, context, cause === undefined ? {} : { cause });
}

/**
 * @param {unknown} error
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 * @returns {CompilerError}
 */
export function asCompilerError(error, code, message, context = {}) {
    if (isCompilerError(error)) return error;
    const causeCode = typeof error === 'object' && error && 'code' in error
        ? String(/** @type {{code?: unknown}} */ (error).code ?? '') || null
        : null;
    return new CompilerError(code, message, { ...context, causeCode }, { cause: error });
}

/**
 * @param {string} code
 */
function assertErrorCode(code) {
    if (typeof code !== 'string' || !/^[a-z][a-z0-9_]*$/.test(code)) {
        throw new TypeError('Compiler error code must use lower_snake_case');
    }
}
