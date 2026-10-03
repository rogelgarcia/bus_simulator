// Records bounded, opt-in frame measurements without retaining terrain resources.
// @ts-check

export const LANDSCAPE_PERFORMANCE_COLUMNS = Object.freeze(['elapsedMs', 'intervalMs', 'cpuFrameMs', 'geometryStreamingMs', 'appearanceStreamingMs', 'uploadedBytes', 'drawCalls', 'triangles', 'geometries', 'textures', 'gpuSubmission']);
export const LANDSCAPE_GPU_COLUMNS = Object.freeze(['sequence', 'submission', 'ms']);
const MAX_FRAMES = 16384;

/** The returned report belongs to the test caller; its serialization is outside the render measurement. */
export class LandscapePerformanceCapture {
    /** @param {{budget:object,gpuTimer:object,maxFrames?:number,nowMs:number}} options */
    constructor({ budget, gpuTimer, maxFrames = 4096, nowMs }) {
        if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > MAX_FRAMES || !Number.isFinite(nowMs)) throw new Error('Performance capture requires 1..16384 frames and a finite start time');
        this.key = 'viewer-performance-capture';
        this.budget = budget;
        this.gpuTimer = gpuTimer;
        this.capacity = maxFrames;
        this.cpuBytes = maxFrames * (LANDSCAPE_PERFORMANCE_COLUMNS.length + LANDSCAPE_GPU_COLUMNS.length) * Float64Array.BYTES_PER_ELEMENT;
        const admission = budget.reserve(this.key, { cpuBytes: this.cpuBytes, gpuBytes: 0, kind: 'opt-in-performance-capture' });
        if (!admission.admitted) throw new Error(`Performance capture cannot fit: ${admission.reason}`);
        try {
            this.frames = new Float64Array(maxFrames * LANDSCAPE_PERFORMANCE_COLUMNS.length);
            this.gpu = new Float64Array(maxFrames * LANDSCAPE_GPU_COLUMNS.length);
        } catch (error) { budget.release(this.key); throw error; }
        this.startedAtMs = nowMs;
        this.initialGpu = gpuTimer.getDiagnostics();
        this.lastGpuSequence = this.initialGpu.sampleSequence;
        this.frameCount = 0; this.gpuCount = 0; this.droppedFrames = 0; this.droppedGpuSamples = 0;
    }

    /** @param {{nowMs:number,intervalMs:number,cpuFrameMs:number,geometryStreamingMs:number,appearanceStreamingMs:number,uploadedBytes:number,render:object,memory:object}} frame */
    record(frame) {
        if (!this.frames) return;
        const diagnostics = this.gpuTimer.getDiagnostics();
        if (this.frameCount === this.capacity) this.droppedFrames++;
        else {
            const { nowMs, intervalMs, cpuFrameMs, geometryStreamingMs, appearanceStreamingMs, uploadedBytes, render, memory } = frame;
            this.frames.set([nowMs - this.startedAtMs, intervalMs, cpuFrameMs, geometryStreamingMs, appearanceStreamingMs, uploadedBytes,
                render.calls, render.triangles, memory.geometries, memory.textures, diagnostics.submissionSequence], this.frameCount++ * LANDSCAPE_PERFORMANCE_COLUMNS.length);
        }
        this.collectGpu();
    }

    collectGpu() {
        for (const sample of this.gpuTimer.getSamplesSince(this.lastGpuSequence)) {
            this.lastGpuSequence = sample.sequence;
            if (sample.submissionSequence <= this.initialGpu.submissionSequence) continue;
            if (this.gpuCount === this.capacity) this.droppedGpuSamples++;
            else this.gpu.set([sample.sequence, sample.submissionSequence, sample.ms], this.gpuCount++ * LANDSCAPE_GPU_COLUMNS.length);
        }
    }

    finish() {
        if (!this.frames) throw new Error('Performance capture has already ended');
        this.collectGpu();
        const result = { columns: LANDSCAPE_PERFORMANCE_COLUMNS, gpuColumns: LANDSCAPE_GPU_COLUMNS,
            startedAtMs: this.startedAtMs, frameCount: this.frameCount, gpuCount: this.gpuCount,
            droppedFrames: this.droppedFrames, droppedGpuSamples: this.droppedGpuSamples,
            capacity: this.capacity, captureCpuBytes: this.cpuBytes, initialGpu: this.initialGpu, finalGpu: this.gpuTimer.getDiagnostics(),
            frames: Array.from(this.frames.subarray(0, this.frameCount * LANDSCAPE_PERFORMANCE_COLUMNS.length)),
            gpu: Array.from(this.gpu.subarray(0, this.gpuCount * LANDSCAPE_GPU_COLUMNS.length)) };
        this.dispose();
        return result;
    }

    dispose() {
        this.frames = null; this.gpu = null;
        this.budget.release(this.key);
    }
}
