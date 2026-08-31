// Defines structured failures for staged illumination resource loading.
// @ts-check

export class IlluminationRuntimeError extends Error {
    constructor(code, message, {
        state = 'failed',
        phase = 'locating',
        reason = code,
        context = {},
        cause = undefined
    } = {}) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'IlluminationRuntimeError';
        this.code = String(code || 'runtime_failure');
        this.state = state;
        this.phase = phase;
        this.reason = String(reason || this.code);
        this.context = context && typeof context === 'object' ? { ...context } : {};
        this.failureCode = this.code;
        this.capabilityCode = typeof this.context.capabilityCode === 'string'
            ? this.context.capabilityCode
            : null;
        this.retryTrigger = retryTriggerForReason(this.reason);
    }

    toJSON() {
        return Object.freeze({
            code: this.code,
            message: this.message,
            state: this.state,
            phase: this.phase,
            reason: this.reason,
            failureCode: this.failureCode,
            capabilityCode: this.capabilityCode,
            retryTrigger: this.retryTrigger,
            context: Object.freeze({ ...this.context })
        });
    }
}

/** @param {string} reason */
function retryTriggerForReason(reason) {
    const triggers = {
        allocation_failure: 'memory_change',
        city_mismatch: 'city_change',
        compiler_mismatch: 'compiler_change',
        decode_failure: 'payload_change',
        fetch_failure: 'explicit_retry',
        integrity_failure: 'payload_change',
        profile_mismatch: 'profile_change',
        program_preparation_failure: 'context_change',
        schema_failure: 'payload_change',
        source_mismatch: 'source_change',
        unsupported_capability: 'context_change',
        upload_failure: 'context_change',
        validation_failure: 'payload_change'
    };
    return triggers[reason] ?? 'explicit_retry';
}

export function createRuntimeFailure(code, message, options = {}) {
    return new IlluminationRuntimeError(code, message, options);
}

export function serializeIlluminationRuntimeError(error) {
    if (error instanceof IlluminationRuntimeError) return error.toJSON();
    return Object.freeze({
        code: 'unexpected_runtime_failure',
        message: error instanceof Error ? error.message : String(error),
        state: 'failed',
        phase: 'locating',
        reason: 'unexpected_runtime_failure',
        context: Object.freeze({})
    });
}
