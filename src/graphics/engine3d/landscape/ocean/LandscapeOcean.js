// Owns the animated ocean of a loaded landscape (AI 597): the bathymetry fields, the spectral simulation, the clipmap surface, the deterministic clock and the residency share.
// @ts-check
// Design: createLandscapeOcean resolves to a handle whatever happened (status active, unavailable or failed with a reason; an inert handle holds no
// resources), like the surround. Its resources reserve inside the ocean ledger the view owns (createLandscapeOceanLedger: the ocean's share held
// in the shared budget across rebuilds), never in the shared budget directly. Its resources reserve inside the ocean ledger the view owns (createLandscapeOceanLedger: the ocean's share held
// in the shared budget across rebuilds), never in the shared budget directly. The extent field is rasterized from the saved level-2 chunks before the simulation starts; the surround field
// follows when the view binds an active surround (setSurround), until then the sea stops at the landscape bounds (the water extent contract). The
// owner advances the clock once per frame, runs the simulation batch before the frame's render (its own timer query, outside the frame timer) and
// snaps the rings under the camera. Nothing here is authoritative: the sea level stays Y = 0 for every query and pick, the lighting's optical
// water body is the water reference's, and the ocean only replaces the drawn surface.
import * as THREE from 'three';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_SEA_STATES, LANDSCAPE_OCEAN_QUALITIES, createLandscapeOceanClock, landscapeOceanQuality, landscapeOceanResources, landscapeOceanSeaState } from './LandscapeOceanModel.js';
import { landscapeOceanSeaStateShapes, landscapeOceanSignificantWaveHeight } from './LandscapeOceanSpectrum.js';
import { loadLandscapeOceanField } from './LandscapeOceanField.js';
import { createLandscapeOceanSimulation } from './LandscapeOceanSimulation.js';
import { createLandscapeOceanSurface } from './LandscapeOceanSurface.js';

/**
 * @param {Float32Array} depth @param {number} texels @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @returns {{texture:any,bounds:any,bytes:number}} an RGBA16F field texture (depth in x) with its GPU lookup bounds (min x, min z, 1 / width, 1 / height)
 */
function createFieldTexture(depth, texels, bounds) {
    const data = new Uint16Array(texels * texels * 4), zero = THREE.DataUtils.toHalfFloat(0);
    for (let i = 0; i < depth.length; i++) { const o = i * 4; data[o] = THREE.DataUtils.toHalfFloat(Math.max(-65000, Math.min(65000, depth[i]))); data[o + 1] = zero; data[o + 2] = zero; data[o + 3] = zero; }
    const texture = new THREE.DataTexture(data, texels, texels, THREE.RGBAFormat, THREE.HalfFloatType);
    Object.assign(texture, { name: 'Landscape ocean field', colorSpace: THREE.NoColorSpace, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, flipY: false, needsUpdate: true });
    return { texture, bounds: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ)), bytes: data.byteLength };
}

/**
 * @param {{landscape:any,ledger:any,renderer:any,scene:any,camera:any,lighting:any,lightingTier:string,seaState?:string,quality?:string,clock?:{mode?:string,time?:number},
 *   surround?:any,signal?:AbortSignal}} options landscape is the frozen result of loadLandscapeOverview; ledger the view's ocean share (createLandscapeOceanLedger);
 *   surround an active surround handle (optional, may follow through setSurround)
 */
export async function createLandscapeOcean({ landscape, ledger, renderer, scene, camera, lighting, lightingTier, seaState = LANDSCAPE_OCEAN.defaultSeaState, quality = LANDSCAPE_OCEAN.defaultQuality, clock: clockOptions = {}, surround = null, signal }) {
    if (!landscape?.manifest || !landscape.manifestUrl) throw new Error('[LandscapeOcean] The ocean needs the loaded landscape');
    if (!ledger || typeof ledger.reserve !== 'function' || !renderer || !scene || !camera || !lighting) throw new Error('[LandscapeOcean] The ocean needs the view ocean ledger, renderer, scene, camera and lighting');
    const started = performance.now(), seaStateId = landscapeOceanSeaState(seaState), qualityId = landscapeOceanQuality(quality);
    const clock = createLandscapeOceanClock(clockOptions);
    const inert = (status, reason) => createInertOcean({ status, reason, seaState: seaStateId, quality: qualityId, clock, loadMs: performance.now() - started });
    if (!renderer.extensions.has('EXT_color_buffer_float')) return inert('unavailable', 'float render targets are unavailable (EXT_color_buffer_float)');
    const resources = [];
    const release = () => { for (const handle of resources.splice(0)) handle.dispose(); };
    try {
        const { manifest, manifestUrl } = landscape, texels = LANDSCAPE_OCEAN.fields.texels;
        const field = await loadLandscapeOceanField({ manifest, manifestUrl, level: LANDSCAPE_OCEAN.fields.extentLevel, texels, signal });
        signal?.throwIfAborted();
        const fieldKey = `ocean/field/${crypto.randomUUID()}`;
        const extent = createFieldTexture(field.depth, texels, field.layout.bounds);
        const fieldAdmission = ledger.reserve(fieldKey, { cpuBytes: field.depth.byteLength, gpuBytes: extent.bytes });
        if (!fieldAdmission.admitted) { extent.texture.dispose(); return inert('failed', `the extent field cannot fit: ${fieldAdmission.reason}`); }
        resources.push({ dispose() { extent.texture.dispose(); ledger.release(fieldKey); } });
        const simulation = createLandscapeOceanSimulation({ renderer, ledger, quality: qualityId, seaState: seaStateId });
        resources.push(simulation);
        simulation.initialize();
        const surface = createLandscapeOceanSurface({ renderer, scene, ledger, quality: qualityId, lighting, lightingTier, simulation, fields: { extent, surround: null }, seaLevel: manifest.coordinates.seaLevel });
        resources.push(surface);
        surface.update(camera);
        simulation.update(clock.time);
        await surface.ready(camera);
        signal?.throwIfAborted();
        const ocean = createActiveOcean({ landscape, ledger, clock, simulation, surface, extent, field, seaState: seaStateId, quality: qualityId, loadMs: performance.now() - started, release, signal });
        if (surround) await ocean.setSurround(surround);
        return ocean;
    } catch (error) {
        release();
        if (error.name === 'AbortError') throw error;
        return inert('failed', error.message);
    }
}

function createInertOcean({ status, reason, seaState, quality, clock, loadMs }) {
    if (!LANDSCAPE_OCEAN.statuses.includes(status) || status === 'active') throw new Error(`[LandscapeOcean] ${status} is not an inert ocean status`);
    const snapshot = () => ({ recipe: LANDSCAPE_OCEAN.id, status, present: false, reason, seaState: { id: seaState, label: LANDSCAPE_OCEAN_SEA_STATES[seaState].label }, quality: { id: quality, label: LANDSCAPE_OCEAN_QUALITIES[quality].label },
        clock: clock.snapshot(), share: { kind: LANDSCAPE_OCEAN.kind, cpuBytes: 0, gpuBytes: 0, peakCpuBytes: 0, peakGpuBytes: 0, limits: LANDSCAPE_OCEAN.budgets, denied: 0, entries: 0 }, fields: null, simulation: null, surface: null, loadMs, drawnLastFrame: false });
    return Object.freeze({ status, reason, clock, update() {}, setSurround() { return Promise.resolve(null); }, setVisible() {}, setLightingTier() {}, setSeaState() {}, setClock(options) { applyClock(clock, options); return clock.snapshot(); }, snapshot, dispose() {} });
}

/** @param {ReturnType<typeof createLandscapeOceanClock>} clock @param {{mode?:string,time?:number,step?:number}} options */
function applyClock(clock, { mode, time, step } = {}) {
    if (mode !== undefined) clock.setMode(mode);
    if (time !== undefined) clock.setTime(time);
    if (step !== undefined) clock.step(step);
}

function createActiveOcean({ landscape, ledger, clock, simulation, surface, extent, field, seaState, quality, loadMs, release, signal }) {
    let disposed = false, seaStateId = seaState, surroundField = null, surroundState = { status: 'none', id: null, revision: null, texels: 0, statistics: null, milliseconds: null };
    let surroundSequence = 0, surroundApplied = 0;
    const waveHeight = () => { const hs = landscapeOceanSignificantWaveHeight(seaStateId, quality), shapes = landscapeOceanSeaStateShapes(seaStateId); return { hs, shapes }; };
    const dropSurround = () => { if (surroundField) { surroundField.dispose(); surroundField = null; } surface.setSurroundField(null); };
    return Object.freeze({
        status: 'active', reason: null, clock, ledger,
        /** One frame: advances the clock (free mode), runs the simulation batch and places the rings. @param {{dt:number,camera:any}} frame */
        update({ dt, camera }) {
            if (disposed) return;
            clock.advance(dt);
            simulation.update(clock.time);
            surface.update(camera);
        },
        /**
         * Binds (or drops with null) the far-field surround: rasterizes its level-1 depth so the sea continues over its seabed to its bounds and
         * stays off its land. Resolves with the surround field state once applied (or superseded).
         * @param {any} surround an active surround handle ({status, loaded, bounds}) or null
         */
        async setSurround(surround) {
            const sequence = ++surroundSequence;
            if (!surround || surround.status !== 'active' || !surround.loaded) { dropSurround(); surroundState = { status: surround ? surround.status : 'none', id: surround?.loaded?.manifest?.id ?? null, revision: null, texels: 0, statistics: null, milliseconds: null }; surroundApplied = sequence; return surroundState; }
            const { manifest, manifestUrl } = surround.loaded, texels = LANDSCAPE_OCEAN.fields.surroundTexels;
            let loaded;
            try { loaded = await loadLandscapeOceanField({ manifest, manifestUrl, level: LANDSCAPE_OCEAN.fields.surroundLevel, texels, signal }); }
            catch (error) { if (sequence === surroundSequence) surroundApplied = sequence; throw error; }
            if (disposed || sequence !== surroundSequence) return surroundState;
            surroundApplied = sequence;
            dropSurround();
            const key = `ocean/surround-field/${crypto.randomUUID()}`, texture = createFieldTexture(loaded.depth, texels, loaded.layout.bounds);
            const admission = ledger.reserve(key, { cpuBytes: loaded.depth.byteLength, gpuBytes: texture.bytes });
            if (!admission.admitted) { texture.texture.dispose(); surroundState = { status: 'denied', id: manifest.id, revision: manifest.revision, texels: 0, statistics: null, milliseconds: loaded.milliseconds, reason: admission.reason }; return surroundState; }
            surroundField = { texture: texture.texture, bounds: texture.bounds, dispose() { texture.texture.dispose(); ledger.release(key); } };
            surface.setSurroundField(surroundField);
            surroundState = { status: 'active', id: manifest.id, revision: manifest.revision, texels, statistics: loaded.statistics, milliseconds: loaded.milliseconds, bounds: { ...loaded.layout.bounds }, texelMeters: loaded.layout.texelMetersX };
            return surroundState;
        },
        setVisible(value) { surface.setVisible(value); },
        setLightingTier(tier) { surface.setLightingTier(tier); },
        /** Verification read-back of a cascade's textures with their statistics (LandscapeOceanSimulation.readback). @param {number} index */
        readback(index) { return simulation.readback(index); },
        /** @param {number} mode verification view of the surface program (0 shaded) */
        setDebug(mode) { surface.setDebug(mode); },
        /** @param {string} id switches the sea state: the spectrum re-initializes on the next frame */
        setSeaState(id) { seaStateId = landscapeOceanSeaState(id); simulation.setSeaState(seaStateId); },
        /** @param {{mode?:string,time?:number,step?:number}} options the deterministic clock: mode free|fixed, an absolute time, an exact step */
        setClock(options) { applyClock(clock, options); return clock.snapshot(); },
        snapshot() {
            const { hs, shapes } = waveHeight(), state = LANDSCAPE_OCEAN_SEA_STATES[seaStateId], estimate = landscapeOceanResources(quality);
            // settled once no far-field binding is in flight (a capture before it would differ from one after it)
            return { recipe: LANDSCAPE_OCEAN.id, status: disposed ? 'off' : 'active', present: !disposed, reason: null, settled: surroundApplied === surroundSequence,
                seaState: { id: seaStateId, label: state.label, wind: { ...state.wind }, swell: { ...state.swell }, depthMeters: state.depthMeters, significantWaveHeightMeters: hs.continuousMeters, discreteWaveHeightMeters: hs.discreteMeters,
                    perCascadeWaveHeightMeters: hs.perCascadeMeters, windPeakPeriodSeconds: 2 * Math.PI / shapes.wind.omegaPeak, choppiness: [...state.choppiness], seed: state.seed },
                quality: { id: quality, label: LANDSCAPE_OCEAN_QUALITIES[quality].label, ...LANDSCAPE_OCEAN_QUALITIES[quality] },
                clock: clock.snapshot(), landscape: { id: landscape.manifest.id, revision: landscape.manifest.revision },
                fields: { extent: { texels: field.layout.texels, texelMeters: field.layout.texelMetersX, level: field.layout.level, chunks: field.layout.chunkIds.length, statistics: field.statistics, milliseconds: field.milliseconds, gpuBytes: extent.bytes, cpuBytes: field.depth.byteLength, bounds: { ...field.layout.bounds } }, surround: surroundState },
                simulation: simulation.snapshot(), surface: surface.snapshot(), share: ledger.shareSnapshot(), estimate: { cpuBytes: estimate.cpuBytes, gpuBytes: estimate.gpuBytes }, loadMs, drawnLastFrame: surface.snapshot().drawnLastFrame };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            dropSurround();
            release();
        }
    });
}
