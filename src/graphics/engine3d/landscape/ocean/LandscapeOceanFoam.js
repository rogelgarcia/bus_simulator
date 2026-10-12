// Runs the foam lifecycle of the animated ocean (AI 597 D3): a ping-pong state raster over the extent stepped at a fixed interval on the GPU, pre-rolled from zero for any fixed time.
// @ts-check
// Design. The state (RG16F, foam density on the water and the deposit on the sand) lives at the extent field's resolution; one full-screen pass
// (ocean_foam.frag.glsl, sharing the surface's uniforms so it reads the same fields, train and cascades) advances it by LANDSCAPE_OCEAN.foam.
// stepSeconds. The schedule is a pure function (landscapeOceanFoamSchedule): the clock's time is split into fixed steps with a carried remainder,
// and a time that cannot be reached by at most maxStepsPerFrame steps (a fixed capture time, a clock reset, a long frame) restarts the state
// from zero preRollSeconds earlier and steps up to it, so the state at a fixed time is identical on every run and device (the gate's
// determinism). A sea-state switch restarts it the same way. Its bytes reserve in the ocean share; readback returns the raster with its
// statistics per coastal zone for the suites.
import * as THREE from 'three';
import { createLandscapeOceanShaderPayload } from '../../../shaders/materials/landscape/LandscapeOceanShaderLoader.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { LANDSCAPE_OCEAN, landscapeOceanFoamSchedule } from './LandscapeOceanModel.js';

/**
 * @param {{renderer:any,ledger:any,uniforms:Record<string,{value:any}>,cascades:number,texels:number,zone?:Uint8Array|null,zoneLabels?:ReadonlyArray<string>|null}} options
 *   uniforms is the surface's shared uniform set (fields, train, cascades); zone and zoneLabels (the coast's labels) resolve the readback statistics per zone
 */
export function createLandscapeOceanFoam({ renderer, ledger, uniforms, cascades, texels, zone = null, zoneLabels = null }) {
    if (!renderer || typeof renderer.setRenderTarget !== 'function') throw new Error('[LandscapeOcean] The foam needs the view renderer');
    if (!ledger || typeof ledger.reserve !== 'function') throw new Error('[LandscapeOcean] The foam needs the ocean ledger');
    if (!uniforms?.uOceanField || !uniforms.uOceanShoreField) throw new Error('[LandscapeOcean] The foam needs the surface uniforms with the extent and shore fields');
    const foam = LANDSCAPE_OCEAN.foam, key = `ocean/foam/${crypto.randomUUID()}`;
    const gpuBytes = 2 * texels * texels * foam.bytesPerTexel / 2;
    const admission = ledger.reserve(key, { cpuBytes: 0, gpuBytes });
    if (!admission.admitted) throw new Error(`[LandscapeOcean] The foam state cannot fit: ${admission.reason}`);
    const target = name => {
        const result = new THREE.WebGLRenderTarget(texels, texels, { type: THREE.HalfFloatType, format: THREE.RGFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
        result.texture.name = name;
        return result;
    };
    let current = target('Ocean foam state A'), previous = target('Ocean foam state B');
    const payload = createLandscapeOceanShaderPayload('foam', { cascades });
    const decay = seconds => Math.exp(-foam.stepSeconds / seconds);
    const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { ...uniforms, uOceanTime: { value: 0 }, uOceanFoamPrevious: { value: previous.texture },
            uOceanFoamStep: { value: new THREE.Vector4(foam.stepSeconds, decay(foam.decaySeconds.water), decay(foam.decaySeconds.deposit), decay(foam.decaySeconds.whitecap)) },
            uOceanFoamSources: { value: new THREE.Vector4(foam.sources.breaker, foam.sources.whitecap, foam.sources.shoreline, foam.sources.deposit) },
            uOceanFoamFlow: { value: new THREE.Vector4(foam.driftMetersPerSecond, foam.diffusion, foam.folding.threshold, foam.folding.span) } } });
    attachShaderMetadata(material, payload);
    const scene = new THREE.Scene(), camera = new THREE.Camera(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);
    let disposed = false, lastTime = null, remainder = 0, steps = 0, resets = 0, lastSteps = 0, lastPreRoll = 0, lastMs = null;
    const withRenderState = run => {
        const autoClear = renderer.autoClear, renderTarget = renderer.getRenderTarget();
        renderer.autoClear = false;
        try { run(); } finally { renderer.setRenderTarget(renderTarget); renderer.autoClear = autoClear; }
    };
    const clear = () => {
        const color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 0);
        for (const state of [current, previous]) { renderer.setRenderTarget(state); renderer.clear(true, false, false); }
        renderer.setClearColor(color, alpha);
    };
    const step = time => {
        material.uniforms.uOceanTime.value = time;
        material.uniforms.uOceanFoamPrevious.value = current.texture;
        renderer.setRenderTarget(previous);
        renderer.render(scene, camera);
        [current, previous] = [previous, current];
        steps++;
    };
    return Object.freeze({
        get texture() { return current.texture; },
        /**
         * Brings the state to a simulation time: fixed steps from the last time, or a restart from zero preRollSeconds earlier when the time is
         * unreachable (landscapeOceanFoamSchedule). @param {number} time
         */
        advance(time) {
            if (disposed) throw new Error('[LandscapeOcean] The foam is disposed');
            const schedule = landscapeOceanFoamSchedule({ time, lastTime, remainder });
            const started = performance.now();
            withRenderState(() => {
                if (schedule.reset) { clear(); resets++; }
                let at = schedule.startTime;
                for (let i = 0; i < schedule.steps; i++) { at += foam.stepSeconds; step(at); }
            });
            lastTime = time;
            remainder = schedule.remainder;
            lastSteps = schedule.steps;
            if (schedule.reset) lastPreRoll = schedule.steps;
            lastMs = performance.now() - started;
        },
        /** Restarts the state from zero before a time (a sea-state switch). @param {number} time */
        reset(time) { lastTime = null; remainder = 0; this.advance(time); },
        /**
         * Reads the state back (verification only): the density rasters and their means over the water and over each coastal zone that has
         * water, plus the covered fraction (density above the coverage threshold).
         */
        readback() {
            if (disposed) throw new Error('[LandscapeOcean] The foam is disposed');
            const half = new Uint16Array(texels * texels * 2);
            renderer.readRenderTargetPixels(current, 0, 0, texels, texels, half);
            const water = new Float32Array(texels * texels), deposit = new Float32Array(texels * texels);
            for (let i = 0; i < water.length; i++) { water[i] = THREE.DataUtils.fromHalfFloat(half[i * 2]); deposit[i] = THREE.DataUtils.fromHalfFloat(half[i * 2 + 1]); }
            const zones = {}, threshold = foam.coverage.threshold;
            let sum = 0, covered = 0, count = 0, depositSum = 0, depositCount = 0, max = 0;
            for (let i = 0; i < water.length; i++) {
                const value = water[i];
                if (value > max) max = value;
                if (zone && zoneLabels) {
                    const label = zoneLabels[zone[i]] ?? String(zone[i]), entry = zones[label] ??= { texels: 0, sum: 0, covered: 0, depositSum: 0 };
                    entry.texels++; entry.sum += value; entry.depositSum += deposit[i];
                    if (value >= threshold) entry.covered++;
                }
                if (deposit[i] > 0) { depositSum += deposit[i]; depositCount++; }
                if (value > 0 || deposit[i] === 0) { sum += value; count++; if (value >= threshold) covered++; }
            }
            const statistics = { texels: water.length, mean: count ? sum / count : 0, max, coveredFraction: count ? covered / count : 0, depositMean: depositCount ? depositSum / depositCount : 0, depositTexels: depositCount,
                zones: Object.fromEntries(Object.entries(zones).map(([label, entry]) => [label, { texels: entry.texels, mean: entry.sum / entry.texels, coveredFraction: entry.covered / entry.texels, depositMean: entry.depositSum / entry.texels }])) };
            return { texels, water, deposit, statistics };
        },
        snapshot() {
            return { recipe: 'landscape-ocean-foam-v1', texels, gpuBytes, stepSeconds: foam.stepSeconds, preRollSeconds: foam.preRollSeconds, lastTime, steps, lastSteps, lastPreRollSteps: lastPreRoll, resets, lastMs, decaySeconds: { ...foam.decaySeconds } };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            current.dispose(); previous.dispose();
            material.dispose(); quad.geometry.dispose();
            ledger.release(key);
        }
    });
}
