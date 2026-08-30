// Defines structured, actionable resolved-city bake-source failures.
// @ts-check

export class BakeSourceValidationError extends Error {
    constructor(code, message, context = {}) {
        super(message);
        this.name = 'BakeSourceValidationError';
        this.code = String(code || 'validation_error');
        this.context = context && typeof context === 'object' ? { ...context } : {};
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            context: this.context
        };
    }
}

export function failBakeSource(code, message, context = {}) {
    throw new BakeSourceValidationError(code, message, context);
}

export function serializeBakeSourceError(error) {
    if (error instanceof BakeSourceValidationError) return error.toJSON();
    return {
        code: 'unexpected_export_error',
        message: error instanceof Error ? error.message : String(error),
        context: {}
    };
}
