// Adapts a ready graphics resource stage to the app illumination controller's pure-data contract.
// @ts-check

function requireReadyStage(stage) {
    if (!stage || typeof stage !== 'object'
        || typeof stage.commitPrepared !== 'function'
        || typeof stage.dispose !== 'function'
        || typeof stage.getDiagnostics !== 'function'
        || !stage.activationSnapshot) {
        throw new TypeError('Controller staging requires a ready illumination graphics resource set.');
    }
    if (stage.disposition !== 'ready_to_commit') {
        throw new TypeError(`Controller staging requires ready_to_commit resources, not '${stage.disposition}'.`);
    }
    return stage;
}

/**
 * @param {Readonly<Record<string, any>>} stage
 * @param {Readonly<Record<string, any>>} [identityOverrides]
 */
export function createIlluminationControllerStagingResult(stage, identityOverrides = {}) {
    const readyStage = requireReadyStage(stage);
    if (!identityOverrides || typeof identityOverrides !== 'object' || Array.isArray(identityOverrides)) {
        throw new TypeError('Controller staging identity overrides must be an object.');
    }
    const diagnostics = readyStage.getDiagnostics();
    const identity = {
        ...readyStage.activationSnapshot.identity,
        ...identityOverrides
    };
    return Object.freeze({
        complete: true,
        compatible: true,
        resourceSet: readyStage,
        packageId: identity.packageId ?? null,
        profileId: identity.profileId ?? null,
        cityId: identity.cityId ?? null,
        compilerSignature: identity.compilerSignature ?? null,
        selectedChannels: Object.freeze([...(identity.selectedChannels ?? [])]),
        sourceHashes: Object.freeze({ ...(identity.sourceHashes ?? {}) }),
        integrityHashes: Object.freeze({ ...(identity.integrityHashes ?? {}) }),
        timings: Object.freeze({
            fetchReadMs: diagnostics.timingsMs.fetchMs,
            hashMs: diagnostics.timingsMs.hashMs,
            decodeMs: diagnostics.timingsMs.decodeMs,
            cpuStagingMs: diagnostics.timingsMs.cpuStagingMs,
            gpuUploadMs: diagnostics.timingsMs.uploadMs,
            activationMs: diagnostics.timingsMs.activationMs,
            disposalMs: diagnostics.timingsMs.disposalMs
        }),
        memory: Object.freeze({
            residentCpuBytes: diagnostics.memory.resident.cpuBytes,
            residentGpuBytes: diagnostics.memory.resident.gpuBytes,
            peakCpuBytes: diagnostics.memory.peakWithBaseline.cpuBytes,
            peakGpuBytes: diagnostics.memory.peakWithBaseline.gpuBytes
        })
    });
}
