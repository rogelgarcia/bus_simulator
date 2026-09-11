// Samples rendered transforms into bounded columns; compression runs only after stopping.
import * as THREE from 'three';
import { createFrameChunk, MAX_RECORDING_FRAMES } from '../../../app/gameplay/recording/FrameRecording.js';
import { captureRecordingSettings, canonicalSettings } from './RecordingSettings.js';

export class GameplayFrameRecorder {
    constructor({ engine, state }) {
        this.engine = engine; this.state = state;
        this.active = false; this.stopping = false; this.count = 0;
        this._position = new THREE.Vector3(); this._quaternion = new THREE.Quaternion(); this._scale = new THREE.Vector3();
        this._pendingGpu = new Map(); this._chunks = [];
        this._unlisten = engine.addFrameListener(frame => this._onFrame(frame));
        this._optionsUnlisten = engine.simulation?.events?.on('options:applied', draft => {
            if (this.active) this._configuration(draft);
        });
    }

    start() {
        if (this.active || this.stopping) throw new Error('A recording is already running.');
        if (!this.state.busAnchor) throw new Error('The bus is not ready yet.');
        this._chunks = []; this._pendingGpu.clear(); this.count = 0;
        const timerStatus = this.engine._gpuFrameTimer.getDiagnostics();
        this.startedAt = performance.now(); this._lastGpu = timerStatus.sampleSequence;
        this._lastSubmission = timerStatus.submissionSequence;
        const gl = this.engine.renderer.getContext(), gpu = gl.getExtension('WEBGL_debug_renderer_info');
        this.metadata = {
            version:1, city:this.state.city.cityId, busModelId:this.engine.context.selectedBusId,
            startedAt:new Date().toISOString(), timeOrigin:performance.timeOrigin,
            userAgent:navigator.userAgent, gpu:gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            threeRevision:THREE.REVISION, devicePixelRatio:devicePixelRatio, maxFrames:MAX_RECORDING_FRAMES,
            gpuTimer:timerStatus, debugOverlay:true,
            timing:{cpu:'GameEngine.updateFrame before frame listeners; wall time, not hardware CPU cycles',
                gpu:'Elapsed GPU query joined by submission sequence; unavailable/pending/disjoint = NaN',
                dt:'Unclamped animation-frame interval', recorderCpu:'Recorder sampling wall time'},
            flagBits:{rendered:1,paused:2,pageHidden:4,baked:8,viewHeld:16,headlights:32},
            configurations:[], bakeEvents:[], visibilityEvents:[]
        };
        this._lastBake = ''; this._lastVisibility = ''; this._configuration(); this.active = true;
        this.onChange?.();
    }

    _configuration(draft = null) {
        const captured = captureRecordingSettings(this.engine, draft);
        this.metadata.defaults ??= captured.defaults;
        this.metadata.configurations.push({sampleIndex:this.count,frame:this.engine.frameIndex, timeMs:performance.now()-this.startedAt,
            usesDefaultValues:captured.usesDefaultValues, ...(captured.usesDefaultValues ? {} : {settings:captured.settings}),
            sun:{direction:this.state.city.sunRef?.direction?.toArray(),intensity:this.state.city.sunRef?.intensity,
                color:this.state.city.sunRef?.color?.toArray()}, environment:this.engine.scene.environment?.userData?.iblHdrUrl ?? null});
    }

    _onFrame(frame) {
        if (!this.active && !this.stopping) return;
        const start = performance.now(), timer = this.engine._gpuFrameTimer, gpu = timer.getDiagnostics();
        let sampledChunk = null, sampledIndex = 0;
        if (this.active) {
            const i = this.count % 1024;
            if (!i) this._chunks.push(createFrameChunk());
            const c = this._chunks.at(-1), e = this.engine, state = this.state;
            c.frame[i] = frame.frameIndex; c.timeMs[i] = start-this.startedAt;
            c.dtMs[i] = frame.rawDt*1000; c.cpuMs[i] = frame.cpuMs; c.gpuMs[i] = NaN;
            const submitted = gpu.active && frame.gpuSubmitted && gpu.submissionSequence > this._lastSubmission;
            c.gpuSubmission[i] = submitted ? gpu.submissionSequence : 0; c.gpuDisjoint[i] = gpu.disjointCount;
            if (submitted) this._pendingGpu.set(gpu.submissionSequence, {c,i});
            this._lastSubmission = gpu.submissionSequence;
            for (const [name,node] of [['bus',state.busAnchor],['camera',e.camera]]) {
                node.matrixWorld.decompose(this._position,this._quaternion,this._scale);
                c[`${name}X`][i]=this._position.x; c[`${name}Y`][i]=this._position.y; c[`${name}Z`][i]=this._position.z;
                c[`${name}Qx`][i]=this._quaternion.x; c[`${name}Qy`][i]=this._quaternion.y;
                c[`${name}Qz`][i]=this._quaternion.z; c[`${name}Qw`][i]=this._quaternion.w;
            }
            for (const key of ['fov','zoom','near','far','aspect']) c[key][i]=e.camera[key];
            const info=e.renderer.info, input=state._debugPanel?._input;
            for (const key of ['steering','throttle','brake','handbrake']) c[key][i]=input?.[key] ?? 0;
            c.calls[i]=info.render.calls; c.triangles[i]=info.render.triangles;
            c.geometries[i]=info.memory.geometries; c.textures[i]=info.memory.textures; c.programs[i]=info.programs.length;
            c.width[i]=e.renderer.domElement.width; c.height[i]=e.renderer.domElement.height;
            c.heapMiB[i]=performance.memory ? performance.memory.usedJSHeapSize/1048576 : NaN;
            const bake=e._bakedLighting;
            c.bakeGeneration[i]=bake.generation;
            c.flags[i]=Number(frame.rendered) | (Number(state.gameLoop.paused)<<1) | (Number(document.hidden)<<2)
                | (Number(bake.effectiveMode==='baked')<<3) | (Number(bake.shouldHoldView())<<4) | (Number(!!input?.headlights)<<5);
            const bakeKey=[bake.generation,bake.effectiveMode,bake.failure,bake.reason,bake.busRevision,bake.loading].join('|');
            if (bakeKey!==this._lastBake) {
                this._lastBake=bakeKey;
                const diagnostics=e.getBakedLightingDebugInfo();
                this.metadata.bakeEvents.push({frame:frame.frameIndex,mode:bake.effectiveMode,generation:bake.generation,status:e.getBakedLightingStatus(),
                    profileId:diagnostics.status?.profileId,publications:diagnostics.receiverLightmaps?.publications,
                    shadowPackage:diagnostics.pipeline?.runtime?.package,
                    busSourceHash:diagnostics.busLighting?.sourceHash,busFieldHash:diagnostics.busLighting?.fieldHash});
            }
            const visibility=state.city.getStaticVisibilityStatus(), visibilityKey=[visibility.state,visibility.reason].join('|');
            if (visibilityKey!==this._lastVisibility) {
                this._lastVisibility=visibilityKey; this.metadata.visibilityEvents.push({frame:frame.frameIndex,...visibility});
            }
            this.count++;
            sampledChunk = c; sampledIndex = i;
        }
        for (const sample of timer.getSamplesSince(this._lastGpu)) {
            this._lastGpu=sample.sequence;
            const pending=this._pendingGpu.get(sample.submissionSequence);
            if (pending) { pending.c.gpuMs[pending.i]=sample.ms; this._pendingGpu.delete(sample.submissionSequence); }
        }
        for (const sequence of this._pendingGpu.keys()) {
            if (gpu.submissionSequence-sequence>32) this._pendingGpu.delete(sequence);
        }
        if (this.stopping && !this._pendingGpu.size) this._finishDrain?.();
        if (sampledChunk) {
            sampledChunk.recorderCpuMs[sampledIndex]=performance.now()-start;
            if (this.count===MAX_RECORDING_FRAMES) this.onLimit?.();
        }
    }

    async stop(reason = 'user') {
        if (!this.active) throw new Error('No recording is running.');
        this.active=false; this.stopping=true;
        this.metadata.stopReason=reason; this.metadata.durationMs=performance.now()-this.startedAt;
        this.onChange?.();
        try {
            await new Promise(resolve => {
                this._finishDrain=resolve; this._drainTimer=setTimeout(resolve,1000);
                if (!this._pendingGpu.size) resolve();
            });
            clearTimeout(this._drainTimer); this._finishDrain=null;
            if (this._destroyed) throw new Error('Gameplay closed.');
            this.metadata.pendingGpuSamples=this._pendingGpu.size;
            const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalSettings(this.metadata.defaults)));
            this.metadata.defaultsFingerprint=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
            if (this._destroyed) throw new Error('Gameplay closed.');
            return await new Promise((resolve,reject) => {
                this._rejectWorker=reject;
                this._worker=new Worker(new URL('../../../app/gameplay/recording/FrameRecordingWorker.js',import.meta.url),{type:'module'});
                this._worker.onmessage=({data}) => data.error ? reject(new Error(data.error)) : resolve(data.text);
                this._worker.onerror=error => reject(new Error(error.message));
                this._worker.postMessage({metadata:this.metadata,chunks:this._chunks,count:this.count});
            });
        } finally {
            this._worker?.terminate(); this._worker=null; this._rejectWorker=null;
            this._chunks=[]; this._pendingGpu.clear(); this.stopping=false; this.onChange?.();
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed=true; this.active=false;
        this._unlisten(); this._optionsUnlisten?.(); clearTimeout(this._drainTimer); this._finishDrain?.();
        this._rejectWorker?.(new Error('Gameplay closed.')); this._worker?.terminate();
        this._chunks=[]; this._pendingGpu.clear();
    }
}
