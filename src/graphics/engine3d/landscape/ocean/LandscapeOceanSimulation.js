// Runs the spectral ocean simulation on the GPU (AI 597): the initial spectrum, the time evolution, the inverse FFT stages and the derivative pass of every cascade, as single-output render-to-texture passes.
// @ts-check
// Design. The cascades share one atlas (cascades x N by N texels, RGBA32F) for the initial spectrum h0 and the two FFT ping-pong textures; every
// pass is one full-screen draw of a quad, never a multiple-output program (ANGLE's D3D11 backend compiles an extra pixel shader at the first draw
// of one). A frame runs: the time pass (1 draw), log2 N horizontal and log2 N - 1 vertical butterfly stages over the atlas (both complex pairs
// per texel), the last vertical stage once per cascade into its own wrapped RGBA16F displacement texture (mipmapped by the renderer), and one
// derivative pass per cascade into its slope texture (mipmapped): 2 log2 N + 2 cascades draws of at most 3 N^2 fragments. A timer query around the
// batch reports its GPU time. The butterfly table is the JavaScript one the unit tests check (landscapeOceanButterfly), the spectrum uniforms come
// from the sea-state shapes (landscapeOceanSeaStateShapes), so the GPU output is the mirror of the CPU model up to float rounding.
import * as THREE from 'three';
import { createLandscapeOceanShaderPayload } from '../../../shaders/materials/landscape/LandscapeOceanShaderLoader.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { landscapeOceanButterfly, landscapeOceanRasterStatistics, landscapeOceanSeaStateShapes } from './LandscapeOceanSpectrum.js';
import { LANDSCAPE_OCEAN_QUALITIES, landscapeOceanCascades } from './LandscapeOceanModel.js';

const MAX_PENDING_QUERIES = 8;
const GPU_SAMPLES = 240;

/**
 * @param {{renderer:any,ledger:any,quality:string,seaState:string}} options ledger is the ocean's residency share (createLandscapeOceanLedger)
 */
export function createLandscapeOceanSimulation({ renderer, ledger, quality, seaState }) {
    if (!renderer || typeof renderer.setRenderTarget !== 'function') throw new Error('[LandscapeOcean] The simulation needs the view renderer');
    if (!ledger || typeof ledger.reserve !== 'function') throw new Error('[LandscapeOcean] The simulation needs the ocean ledger');
    const gl = renderer.getContext();
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('[LandscapeOcean] Float render targets are unavailable (EXT_color_buffer_float)');
    const preset = LANDSCAPE_OCEAN_QUALITIES[quality], cascades = landscapeOceanCascades(quality), texels = preset.texels, stages = Math.log2(texels), count = cascades.length;
    const key = `ocean/simulation/${crypto.randomUUID()}`;
    const atlasBytes = count * texels * texels * 16, cascadeBytes = Math.ceil(texels * texels * 8 * 4 / 3), butterflyBytes = stages * texels * 16;
    const gpuBytes = 3 * atlasBytes + butterflyBytes + count * 2 * cascadeBytes;
    const admission = ledger.reserve(key, { cpuBytes: butterflyBytes, gpuBytes });
    if (!admission.admitted) throw new Error(`[LandscapeOcean] The simulation textures cannot fit: ${admission.reason}`);
    let shapes = landscapeOceanSeaStateShapes(seaState);
    const butterfly = new THREE.DataTexture(landscapeOceanButterfly(texels), texels, stages, THREE.RGBAFormat, THREE.FloatType);
    Object.assign(butterfly, { name: 'Ocean butterfly', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, flipY: false, needsUpdate: true });
    const atlas = (name) => {
        const target = new THREE.WebGLRenderTarget(count * texels, texels, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
        target.texture.name = name;
        return target;
    };
    const cascadeTarget = (name) => {
        const target = new THREE.WebGLRenderTarget(texels, texels, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
            wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: true });
        target.texture.name = name;
        target.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        return target;
    };
    const initial = atlas('Ocean initial spectrum'), ping = atlas('Ocean FFT ping'), pong = atlas('Ocean FFT pong');
    const displacement = cascades.map(cascade => cascadeTarget(`Ocean displacement ${cascade.index}`)), derivatives = cascades.map(cascade => cascadeTarget(`Ocean derivatives ${cascade.index}`));
    const cascadeUniform = cascades.map(cascade => new THREE.Vector4(cascade.lengthMeters, cascade.kMin, cascade.kMax, 0));
    const shared = { uOceanTexels: { value: texels }, uOceanDepth: { value: shapes.depthMeters }, uOceanCascade: { value: cascadeUniform },
        uOceanWindShape: { value: new THREE.Vector4() }, uOceanWindHeading: { value: 0 }, uOceanSwellShape: { value: new THREE.Vector4() }, uOceanSwellHeading: { value: 0 } };
    const applyShapes = () => {
        shared.uOceanDepth.value = shapes.depthMeters;
        shared.uOceanWindShape.value.set(shapes.wind.alpha, shapes.wind.omegaPeak, shapes.wind.gamma, shapes.wind.spreadPeak);
        shared.uOceanWindHeading.value = shapes.wind.heading;
        shared.uOceanSwellShape.value.set(shapes.swell.alpha, shapes.swell.omegaPeak, shapes.swell.gamma, shapes.swell.spreadPeak);
        shared.uOceanSwellHeading.value = shapes.swell.heading;
        cascades.forEach((cascade, index) => cascadeUniform[index].set(cascade.lengthMeters, cascade.kMin, cascade.kMax, shapes.seed * 1000 + cascade.index));
    };
    applyShapes();
    const material = (kind, uniforms) => {
        const payload = createLandscapeOceanShaderPayload(kind, { cascades: count });
        const result = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
        attachShaderMetadata(result, payload);
        return result;
    };
    const materials = {
        init: material('spectrum-init', { ...shared }),
        time: material('spectrum-time', { ...shared, uOceanInitial: { value: initial.texture }, uOceanTime: { value: 0 } }),
        fft: material('fft', { uOceanPing: { value: ping.texture }, uOceanButterfly: { value: butterfly }, uOceanTexels: { value: texels }, uOceanStage: { value: 0 }, uOceanHorizontal: { value: 1 } }),
        final: material('fft-final', { uOceanPing: { value: ping.texture }, uOceanButterfly: { value: butterfly }, uOceanTexels: { value: texels }, uOceanStage: { value: stages - 1 }, uOceanCascadeIndex: { value: 0 }, uOceanChoppiness: { value: 1 } }),
        derivatives: material('derivatives', { uOceanDisplacement: { value: displacement[0].texture }, uOceanTexels: { value: texels }, uOceanTexelMeters: { value: cascades[0].texelMeters } })
    };
    const scene = new THREE.Scene(), camera = new THREE.Camera(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.init);
    quad.frustumCulled = false;
    scene.add(quad);
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const gpu = { supported: !!timer, pending: [], samples: [], lastMs: null, maxMs: 0, disjoint: 0, frames: 0 };
    let disposed = false, initialized = false, initMs = null, lastTime = null, passes = 0, drawsPerFrame = 0;
    const pass = (target, passMaterial) => {
        quad.material = passMaterial;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        passes++;
    };
    const runPasses = time => {
        materials.time.uniforms.uOceanTime.value = time;
        const started = passes;
        pass(pong, materials.time);
        let source = pong, destination = ping;
        materials.fft.uniforms.uOceanHorizontal.value = 1;
        for (let stage = 0; stage < stages; stage++) {
            materials.fft.uniforms.uOceanStage.value = stage;
            materials.fft.uniforms.uOceanPing.value = source.texture;
            pass(destination, materials.fft);
            [source, destination] = [destination, source];
        }
        materials.fft.uniforms.uOceanHorizontal.value = 0;
        for (let stage = 0; stage < stages - 1; stage++) {
            materials.fft.uniforms.uOceanStage.value = stage;
            materials.fft.uniforms.uOceanPing.value = source.texture;
            pass(destination, materials.fft);
            [source, destination] = [destination, source];
        }
        materials.final.uniforms.uOceanPing.value = source.texture;
        cascades.forEach((cascade, index) => {
            materials.final.uniforms.uOceanCascadeIndex.value = index;
            materials.final.uniforms.uOceanChoppiness.value = shapes.choppiness[Math.min(index, shapes.choppiness.length - 1)];
            pass(displacement[index], materials.final);
        });
        cascades.forEach((cascade, index) => {
            materials.derivatives.uniforms.uOceanDisplacement.value = displacement[index].texture;
            materials.derivatives.uniforms.uOceanTexelMeters.value = cascade.texelMeters;
            pass(derivatives[index], materials.derivatives);
        });
        drawsPerFrame = passes - started;
    };
    const pollTimer = () => {
        if (!timer) return;
        while (gpu.pending.length) {
            const entry = gpu.pending[0];
            if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) break;
            gpu.pending.shift();
            const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT), ms = gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1e6;
            gl.deleteQuery(entry.query);
            if (disjoint) { gpu.disjoint++; continue; }
            gpu.lastMs = ms;
            gpu.maxMs = Math.max(gpu.maxMs, ms);
            gpu.samples.push(ms);
            if (gpu.samples.length > GPU_SAMPLES) gpu.samples.shift();
        }
    };
    const withRenderState = run => {
        const autoClear = renderer.autoClear, target = renderer.getRenderTarget();
        renderer.autoClear = false;
        try { run(); } finally { renderer.setRenderTarget(target); renderer.autoClear = autoClear; }
    };
    const median = values => { if (!values.length) return null; const sorted = values.slice().sort((a, b) => a - b); return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2; };
    return Object.freeze({
        texels, stages, cascades, displacement: displacement.map(target => target.texture), derivatives: derivatives.map(target => target.texture),
        /** Writes the initial spectrum of the current sea state (once, and again on a sea-state change). */
        initialize() {
            if (disposed) throw new Error('[LandscapeOcean] The simulation is disposed');
            const started = performance.now();
            withRenderState(() => pass(initial, materials.init));
            initialized = true;
            initMs = performance.now() - started;
        },
        /** Evolves the cascades to a simulation time (the whole batch under one timer query) and generates the cascade mips. @param {number} time */
        update(time) {
            if (disposed) throw new Error('[LandscapeOcean] The simulation is disposed');
            if (!initialized) this.initialize();
            pollTimer();
            const query = timer && gpu.pending.length < MAX_PENDING_QUERIES ? gl.createQuery() : null;
            withRenderState(() => {
                if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
                try { runPasses(time); } finally { if (query) gl.endQuery(timer.TIME_ELAPSED_EXT); }
            });
            if (query) gpu.pending.push({ query });
            gpu.frames++;
            lastTime = time;
        },
        /**
         * Reads a cascade's displacement and derivative textures back (verification only; a synchronous GPU round trip): float32 rasters of texels^2 x 4
         * and their per-channel statistics (displacement: Dx, h, Dz; derivatives: slope x, slope z, Jacobian, squared slope).
         * @param {number} index
         */
        readback(index) {
            if (disposed) throw new Error('[LandscapeOcean] The simulation is disposed');
            if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error(`[LandscapeOcean] Cascade ${index} does not exist`);
            const read = target => {
                const half = new Uint16Array(texels * texels * 4);
                renderer.readRenderTargetPixels(target, 0, 0, texels, texels, half);
                return Float32Array.from(half, value => THREE.DataUtils.fromHalfFloat(value));
            };
            const displacementData = read(displacement[index]), derivativesData = read(derivatives[index]);
            return { texels, displacement: displacementData, derivatives: derivativesData, statistics: { displacement: landscapeOceanRasterStatistics(displacementData, 4), derivatives: landscapeOceanRasterStatistics(derivativesData, 4) } };
        },
        /** @param {string} id re-initializes the spectrum for another sea state */
        setSeaState(id) {
            shapes = landscapeOceanSeaStateShapes(id);
            applyShapes();
            initialized = false;
        },
        snapshot() {
            return { texels, stages, cascades: cascades.map(cascade => ({ ...cascade, maxWavelengthMeters: Number.isFinite(cascade.maxWavelengthMeters) ? cascade.maxWavelengthMeters : null, choppiness: shapes.choppiness[Math.min(cascade.index, shapes.choppiness.length - 1)] })),
                seaState: shapes.id, initialized, initMs, lastTime, drawsPerFrame, passes, atlasTexels: [count * texels, texels], gpuBytes, cpuBytes: butterflyBytes,
                gpu: { supported: gpu.supported, lastMs: gpu.lastMs, medianMs: median(gpu.samples), maxMs: gpu.maxMs, samples: gpu.samples.length, pending: gpu.pending.length, disjoint: gpu.disjoint, frames: gpu.frames } };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const entry of gpu.pending) gl.deleteQuery(entry.query);
            gpu.pending.length = 0;
            for (const target of [initial, ping, pong, ...displacement, ...derivatives]) target.dispose();
            butterfly.dispose();
            for (const value of Object.values(materials)) value.dispose();
            quad.geometry.dispose();
            ledger.release(key);
        }
    });
}
