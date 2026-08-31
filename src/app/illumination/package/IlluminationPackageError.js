// Defines structured illumination package and compatibility failures.
// @ts-check

export class IlluminationPackageError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Readonly<Record<string, unknown>>} [details]
     * @param {{cause?: unknown}} [options]
     */
    constructor(code, message, details = {}, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'IlluminationPackageError';
        this.code = code;
        this.details = Object.freeze({ ...details });
    }
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Readonly<Record<string, unknown>>} [details]
 * @returns {never}
 */
export function failIlluminationPackage(code, message, details = {}) {
    throw new IlluminationPackageError(code, message, details);
}
