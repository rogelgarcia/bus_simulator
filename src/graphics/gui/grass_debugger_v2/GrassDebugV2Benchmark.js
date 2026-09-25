// Runs the repeatable flight and collects frame, CPU and asynchronous GPU timings.
// @ts-check
import * as THREE from 'three';
import { BENCHMARK_FINAL_HOLD_MS, BENCHMARK_WARMUP_MS, createBenchmarkRoute, createBenchmarkFlightTiming, easeBenchmarkProgress } from './GrassDebugV2BenchmarkRoute.js';
import { summarizeBenchmarkTimings } from './GrassDebugV2BenchmarkStats.js';
import { createGrassDebugV2OverviewPose } from './GrassDebugV2CameraPresets.js';

export class GrassDebugV2Benchmark {
    /** @param {{camera: THREE.PerspectiveCamera, controls: object, keyboard: object, gpuTimer: object, busPose: object, getViewport: Function, getGrass?: Function, getLand?: Function, onChange: Function}} options */
    constructor({ camera, controls, keyboard, gpuTimer, busPose, getViewport, getGrass = () => null, getLand = () => null, onChange }) {
        Object.assign(this, { camera, controls, keyboard, gpuTimer, busPose, getViewport, getGrass, getLand, onChange });
        this.route = createBenchmarkRoute(busPose.position);
        this.flightTiming = createBenchmarkFlightTiming(this.route);
        this.phase = 'idle';
        this.progress = 0;
        this.elapsedMs = 0;
        this.result = null;
        this._results = [];
        this.message = '';
        this._position = new THREE.Vector3();
        this._target = new THREE.Vector3();
        this._direction = new THREE.Vector3();
        this._startRotation = new THREE.Quaternion();
        this._flightRotation = new THREE.Quaternion();
        this._matrix = new THREE.Matrix4();
        this._onVisibility = () => { if (document.hidden) this.cancel('Tab hidden'); };
        this._onBlur = () => this.cancel('Window lost focus');
        document.addEventListener('visibilitychange', this._onVisibility);
        window.addEventListener('blur', this._onBlur);
    }

    get active() {
        return ['warmup', 'running', 'holding', 'settling'].includes(this.phase);
    }

    start(nowMs = performance.now()) {
        if (this.active || document.hidden) return false;
        this.controls.setLookAt(createGrassDebugV2OverviewPose());
        this.controls.enabled = false;
        this.keyboard.clear();
        this._startRotation.copy(this.camera.quaternion);
        this.route.getTangent(0, this._direction);
        this._target.copy(this.camera.position).add(this._direction);
        this._matrix.lookAt(this.camera.position, this._target, this.camera.up);
        this._flightRotation.setFromRotationMatrix(this._matrix);
        this.phase = 'warmup';
        this.progress = 0;
        this.elapsedMs = 0;
        this.result = null;
        this.message = '';
        this._warmupStart = nowMs;
        this._frameSamples = [];
        this._cpuSamples = [];
        this._gpuSamples = [];
        this._lastProgress = -1;
        this._viewport = Object.freeze(this.getViewport());
        this._grass = this.getGrass();
        this._land = this.getLand();
        this.onChange(this.getSnapshot());
        return true;
    }

    beforeFrame(nowMs) {
        if (!this.active) return;
        if (this.phase === 'warmup') {
            const t = Math.min(1, (nowMs - this._warmupStart) / BENCHMARK_WARMUP_MS);
            this.camera.quaternion.slerpQuaternions(this._startRotation, this._flightRotation, easeBenchmarkProgress(t));
            this.camera.updateMatrixWorld();
            if (t < 1) return;
            this.phase = 'running';
            this._flightStart = nowMs;
            const diagnostics = this.gpuTimer.getDiagnostics();
            this._firstSubmission = diagnostics.submissionSequence + 1;
            this._lastSubmission = Infinity;
            this._sampleCursor = diagnostics.sampleSequence;
            this._disjointCount = diagnostics.disjointCount;
            this._gpuIssue = diagnostics.active ? null : diagnostics.disabledReason ?? 'GPU timer unavailable';
        }
        this._collectGpu();
        if (this.phase === 'settling') {
            const submitted = this._lastSubmission - this._firstSubmission + 1;
            if (this._gpuIssue || this._gpuSamples.length >= submitted || nowMs - this._settleStart >= 2000) this._finish();
            return;
        }
        this.elapsedMs = nowMs - this._flightStart;
        if (this.phase === 'running' && this.elapsedMs >= this.flightTiming.durationMs) {
            this.phase = 'holding';
            this._holdStart = nowMs;
        }
        const measuredMs = this.phase === 'holding'
            ? this.flightTiming.durationMs + Math.min(BENCHMARK_FINAL_HOLD_MS, nowMs - this._holdStart)
            : this.elapsedMs;
        this.progress = Math.min(1, measuredMs / (this.flightTiming.durationMs + BENCHMARK_FINAL_HOLD_MS));
        const distanceFraction = this.flightTiming.distanceAtTime(this.elapsedMs);
        this.route.getPoint(distanceFraction, this._position);
        this.route.getTangent(distanceFraction, this._direction);
        this.camera.position.copy(this._position);
        this.camera.lookAt(this._target.copy(this._position).add(this._direction));
        this.camera.updateMatrixWorld();
        const percentage = Math.floor(this.progress * 100);
        if (percentage !== this._lastProgress) {
            this._lastProgress = percentage;
            this.onChange(this.getSnapshot());
        }
    }

    afterFrame({ nowMs, frameMs, cpuMs }) {
        if (this.phase !== 'running' && this.phase !== 'holding') return;
        if (this._cpuSamples.length) this._frameSamples.push(frameMs);
        this._cpuSamples.push(cpuMs);
        if (this.progress < 1) return;
        this._durationMs = nowMs - this._flightStart;
        this._lastSubmission = this.gpuTimer.getDiagnostics().submissionSequence;
        this.phase = 'settling';
        this._settleStart = nowMs;
        this.onChange(this.getSnapshot());
    }

    _collectGpu() {
        const diagnostics = this.gpuTimer.getDiagnostics();
        if (diagnostics.disjointCount !== this._disjointCount) this._gpuIssue = 'GPU timer disjoint during flight';
        if (!diagnostics.active) this._gpuIssue = diagnostics.disabledReason ?? 'GPU timer unavailable';
        for (const sample of this.gpuTimer.getSamplesSince(this._sampleCursor)) {
            if (sample.submissionSequence >= this._firstSubmission && sample.submissionSequence <= this._lastSubmission) this._gpuSamples.push(sample.ms);
        }
        this._sampleCursor = diagnostics.sampleSequence;
    }

    _finish() {
        const gpu = this._gpuIssue ? null : summarizeBenchmarkTimings(this._gpuSamples);
        this.result = Object.freeze({
            frame: summarizeBenchmarkTimings(this._frameSamples),
            cpu: summarizeBenchmarkTimings(this._cpuSamples),
            gpu,
            gpuNote: this._gpuIssue ?? (this._gpuSamples.length === this._cpuSamples.length ? '' : 'Partial GPU coverage'),
            renderedFrames: this._cpuSamples.length,
            durationMs: this._durationMs,
            flightMs: this._holdStart - this._flightStart,
            holdMs: this._durationMs - (this._holdStart - this._flightStart),
            warmupMs: BENCHMARK_WARMUP_MS,
            routeMeters: this.route.getLength(),
            viewport: this._viewport,
            grass: this._grass,
            land: this._land
        });
        this._results.push(this.result);
        this.phase = 'complete';
        this._restoreControls();
        this.onChange(this.getSnapshot());
    }

    cancel(message = 'Stopped') {
        if (!this.active) return false;
        this.phase = 'cancelled';
        this.message = message;
        this._restoreControls();
        this.onChange(this.getSnapshot());
        return true;
    }

    _restoreControls() {
        this.camera.getWorldDirection(this._direction);
        this.controls.setLookAt({ position: this.camera.position, target: this._target.copy(this.camera.position).addScaledVector(this._direction, 10) });
        this.keyboard.clear();
        this.controls.enabled = true;
    }

    getSnapshot() {
        return { active: this.active, phase: this.phase, progress: this.progress, elapsedMs: this.elapsedMs, message: this.message, result: this.result, results: this._results.slice() };
    }

    dispose() {
        document.removeEventListener('visibilitychange', this._onVisibility);
        window.removeEventListener('blur', this._onBlur);
    }
}
