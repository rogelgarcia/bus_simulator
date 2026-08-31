// Records deterministic lifecycle, phase timing, and logical resource memory diagnostics.
// @ts-check

const TIMING_KEYS = Object.freeze([
    'locateMs',
    'fetchMs',
    'hashMs',
    'decodeMs',
    'cpuStagingMs',
    'uploadMs',
    'prewarmMs',
    'activationMs',
    'disposalMs'
]);

const PHASES = Object.freeze([
    'locating',
    'fetching',
    'validating',
    'decoding',
    'uploading',
    'prewarming',
    'ready_to_commit',
    'committed',
    'retiring',
    'disposed'
]);

function finiteTime(value) {
    if (!Number.isFinite(value)) throw new TypeError('Runtime clock must return a finite millisecond value.');
    return value;
}

function freezeMemory(value) {
    return Object.freeze({
        cpuBytes: value.cpuBytes,
        gpuBytes: value.gpuBytes
    });
}

function cloneTimings(value) {
    return Object.freeze(Object.fromEntries(TIMING_KEYS.map((key) => [key, value[key]])));
}

/** @param {Record<string, any>} options */
export function createRuntimeDiagnostics({
    now,
    generation,
    planId,
    baselineMemory,
    estimatedMemory,
    memoryLimits
}) {
    const startedAtMs = finiteTime(now());
    const timings = Object.fromEntries(TIMING_KEYS.map((key) => [key, 0]));
    const phaseTimingsMs = Object.fromEntries(PHASES.map((phase) => [phase, 0]));
    const resources = new Map();
    const allocations = new Map();
    let allocationSequence = 0;
    let phase = 'locating';
    let phaseStartedAtMs = startedAtMs;
    let state = 'loading';
    let reason = null;
    let causeState = null;
    let capabilityCode = null;
    let readyAtMs = null;
    let disposedAtMs = null;
    let currentCpuBytes = 0;
    let currentGpuBytes = 0;
    let residentCpuBytes = 0;
    let residentGpuBytes = 0;
    let peakCpuBytes = 0;
    let peakGpuBytes = 0;
    let disposalCount = 0;
    let disposalErrorCount = 0;

    function setLifecycle(next) {
        if (next.state !== undefined) state = next.state;
        if (next.reason !== undefined) reason = next.reason;
        if (next.causeState !== undefined) causeState = next.causeState;
        if (next.capabilityCode !== undefined) capabilityCode = next.capabilityCode;
        if (next.phase !== undefined && next.phase !== phase) {
            const endedAtMs = finiteTime(now());
            phaseTimingsMs[phase] += Math.max(0, endedAtMs - phaseStartedAtMs);
            phase = next.phase;
            phaseStartedAtMs = endedAtMs;
            if (phase === 'ready_to_commit' && readyAtMs === null) readyAtMs = endedAtMs;
            if (phase === 'disposed' && disposedAtMs === null) disposedAtMs = endedAtMs;
        }
    }

    async function measure(timingKey, operation) {
        if (!TIMING_KEYS.includes(timingKey)) throw new TypeError(`Unknown runtime timing '${timingKey}'.`);
        const begin = finiteTime(now());
        try {
            return await operation();
        } finally {
            timings[timingKey] += Math.max(0, finiteTime(now()) - begin);
        }
    }

    function begin(timingKey) {
        if (!TIMING_KEYS.includes(timingKey)) throw new TypeError(`Unknown runtime timing '${timingKey}'.`);
        const beginAtMs = finiteTime(now());
        let ended = false;
        return () => {
            if (ended) return 0;
            ended = true;
            const duration = Math.max(0, finiteTime(now()) - beginAtMs);
            timings[timingKey] += duration;
            return duration;
        };
    }

    function allocate({ id, cpuBytes, gpuBytes, resident }) {
        const token = `${id}:${allocationSequence}`;
        allocationSequence += 1;
        const allocation = { cpuBytes, gpuBytes, resident, released: false };
        allocations.set(token, allocation);
        currentCpuBytes += cpuBytes;
        currentGpuBytes += gpuBytes;
        if (resident) {
            residentCpuBytes += cpuBytes;
            residentGpuBytes += gpuBytes;
        }
        peakCpuBytes = Math.max(peakCpuBytes, currentCpuBytes);
        peakGpuBytes = Math.max(peakGpuBytes, currentGpuBytes);
        return token;
    }

    function release(token) {
        const allocation = allocations.get(token);
        if (!allocation || allocation.released) return false;
        allocation.released = true;
        currentCpuBytes -= allocation.cpuBytes;
        currentGpuBytes -= allocation.gpuBytes;
        if (allocation.resident) {
            residentCpuBytes -= allocation.cpuBytes;
            residentGpuBytes -= allocation.gpuBytes;
        }
        return true;
    }

    function recordResource(id, patch) {
        const current = resources.get(id) ?? {
            id,
            required: false,
            disposition: 'planned',
            fetchedBytes: 0,
            decodedCpuBytes: 0,
            residentCpuBytes: 0,
            residentGpuBytes: 0
        };
        resources.set(id, { ...current, ...patch });
    }

    function recordDisposal(errorCount) {
        disposalCount += 1;
        disposalErrorCount += errorCount;
    }

    function snapshot() {
        const sampledAtMs = finiteTime(now());
        const sampledPhaseTimings = { ...phaseTimingsMs };
        const lifetimeEndMs = disposedAtMs ?? sampledAtMs;
        sampledPhaseTimings[phase] += Math.max(0, lifetimeEndMs - phaseStartedAtMs);
        return Object.freeze({
            generation,
            planId,
            state,
            phase,
            reason,
            causeState,
            capabilityCode,
            timingsMs: cloneTimings(timings),
            phaseTimingsMs: Object.freeze(sampledPhaseTimings),
            totalLoadMs: Math.max(0, (readyAtMs ?? sampledAtMs) - startedAtMs),
            totalLifetimeMs: Math.max(0, lifetimeEndMs - startedAtMs),
            memory: Object.freeze({
                baseline: freezeMemory(baselineMemory),
                estimated: Object.freeze({ ...estimatedMemory }),
                limits: Object.freeze({ ...memoryLimits }),
                current: freezeMemory({ cpuBytes: currentCpuBytes, gpuBytes: currentGpuBytes }),
                resident: freezeMemory({ cpuBytes: residentCpuBytes, gpuBytes: residentGpuBytes }),
                peak: freezeMemory({ cpuBytes: peakCpuBytes, gpuBytes: peakGpuBytes }),
                peakWithBaseline: freezeMemory({
                    cpuBytes: peakCpuBytes + baselineMemory.cpuBytes,
                    gpuBytes: peakGpuBytes + baselineMemory.gpuBytes
                })
            }),
            resources: Object.freeze(Array.from(resources.values(), (entry) => Object.freeze({ ...entry }))),
            disposal: Object.freeze({
                passCount: disposalCount,
                errorCount: disposalErrorCount
            })
        });
    }

    return Object.freeze({
        allocate,
        begin,
        measure,
        recordDisposal,
        recordResource,
        release,
        setLifecycle,
        snapshot
    });
}
