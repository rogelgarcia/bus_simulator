// Defines structured command-line failures for the illumination package tool.
// @ts-check

export class PackageToolError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Readonly<Record<string, unknown>>} [details]
     * @param {{cause?: unknown}} [options]
     */
    constructor(code, message, details = {}, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'PackageToolError';
        this.code = code;
        this.details = Object.freeze({ ...details });
    }

    toJSON() {
        return {
            code: this.code,
            details: this.details,
            message: this.message,
            name: this.name
        };
    }
}

/**
 * @param {unknown} error
 * @param {string} code
 * @param {string} message
 * @param {Readonly<Record<string, unknown>>} [details]
 */
export function asPackageToolError(error, code, message, details = {}) {
    if (error instanceof PackageToolError) return error;
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
        const source = /** @type {{code?: unknown, message?: unknown, details?: unknown}} */ (error);
        const sourceDetails = source.details && typeof source.details === 'object' && !Array.isArray(source.details)
            ? source.details
            : {};
        return new PackageToolError(String(source.code), String(source.message), {
            ...details,
            ...sourceDetails
        }, { cause: error });
    }
    return new PackageToolError(code, message, details, { cause: error });
}
