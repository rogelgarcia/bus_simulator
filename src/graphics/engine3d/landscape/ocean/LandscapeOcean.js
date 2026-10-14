// Owns the animated ocean of a loaded landscape (AI 597): the bathymetry fields, the shore wave, the spectral simulation, the clipmap surface, the deterministic clock and the residency share.
// @ts-check
// Design: createLandscapeOcean resolves to a handle whatever happened (status active, unavailable or failed with a reason; an inert handle holds no
// resources), like the surround. Its resources reserve inside the ocean ledger the view owns (createLandscapeOceanLedger: the ocean's share held
// in the shared budget across rebuilds), never in the shared budget directly. The extent field is rasterized from the saved level-2 chunks, the
// coast classes from the geology sidecar, and the shore wave (D2: shore distance, travel time, shoaled and broken wave height) is marched on the
// CPU before the simulation starts (it yields to the frame loop); a sea-state switch marches it again in the background and swaps the channels
// once done (the snapshot is not settled meanwhile). The surround field follows when the view binds an active surround (setSurround), until
// then the sea stops at the landscape bounds (the water extent contract). The owner advances the clock once per frame, runs the simulation batch
// before the frame's render (its own timer query, outside the frame timer) and snaps the rings under the camera with the clock's time. Nothing
// here is authoritative: the sea level stays Y = 0 for every query and pick, the lighting's optical water body is the water reference's, and the
// ocean only replaces the drawn surface.
import * as THREE from 'three';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_SEA_STATES, LANDSCAPE_OCEAN_QUALITIES, createLandscapeOceanClock, landscapeOceanQuality, landscapeOceanResources, landscapeOceanSeaState, landscapeOceanShoreInputs } from './LandscapeOceanModel.js';
import { landscapeOceanSeaStateShapes, landscapeOceanSignificantWaveHeight } from './LandscapeOceanSpectrum.js';
import { loadLandscapeOceanField } from './LandscapeOceanField.js';
import { LANDSCAPE_OCEAN_COAST, landscapeOceanCoastBeachMask, landscapeOceanCoastZoneBreaking, loadLandscapeOceanCoast } from './LandscapeOceanCoast.js';
import { createLandscapeOceanFoam } from './LandscapeOceanFoam.js';
import { createLandscapeOceanSwash, loadLandscapeOceanSwashBand } from './LandscapeOceanSwash.js';
import { computeLandscapeOceanShore, landscapeOceanShoreDistance, landscapeOceanShoreFill, landscapeOceanShoreSmoothLand } from './LandscapeOceanShore.js';
import { createLandscapeOceanSimulation } from './LandscapeOceanSimulation.js';
import { LANDSCAPE_FRAME_PIPELINE } from '../LandscapeFramePipelineModel.js';
import { createLandscapeOceanSurface } from './LandscapeOceanSurface.js';

// accepted texels between yields of the shore march (the frame loop keeps running while it computes)
const SHORE_YIELD_TEXELS = 65536;
// the shore module's land sentinel of the travel time, replaced by the nearest shoreline value before upload (a bilinear lookup must never see it)
const SHORE_LAND_SENTINEL = 1e9;
// the shore texture's second channel: rock (0 or 1) plus this over land, so a bilinear sample below half of it is land
const LAND_FLAG = -8;
const HALF_LIMIT = 65000;

const toHalf = value => THREE.DataUtils.toHalfFloat(Math.max(-HALF_LIMIT, Math.min(HALF_LIMIT, value)));

/**
 * @param {Float32Array} depth @param {number} texels @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @returns {{texture:any,bounds:any,bytes:number}} an RGBA16F depth texture (depth in x) with its GPU lookup bounds (min x, min z, 1 / width, 1 / height)
 */
function createDepthTexture(depth, texels, bounds) {
    const data = new Uint16Array(texels * texels * 4), zero = toHalf(0);
    for (let i = 0; i < depth.length; i++) { const o = i * 4; data[o] = toHalf(depth[i]); data[o + 1] = zero; data[o + 2] = zero; data[o + 3] = zero; }
    const texture = new THREE.DataTexture(data, texels, texels, THREE.RGBAFormat, THREE.HalfFloatType);
    Object.assign(texture, { name: 'Landscape ocean far field', colorSpace: THREE.NoColorSpace, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, flipY: false, needsUpdate: true });
    return { texture, bounds: lookupBounds(bounds), bytes: data.byteLength };
}

const lookupBounds = bounds => new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ));

/**
 * The extent's two textures: RGBA16F (depth, shore distance, wave height, exposure) and RG32F (travel time, rock minus the land flag), with the
 * float depth raster and the zone labels kept for the sea-state recompute; writeShore swaps the travel time and the wave height in place.
 * @param {{depth:Float32Array,shoreDistance:Float32Array,waveHeight:Float32Array,travelTime:Float32Array,exposure:Float32Array,rock:Uint8Array,zone:Uint8Array}} rasters
 * @param {number} texels @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {boolean} linear whether float textures filter linearly
 */
function createExtentTextures({ depth, shoreDistance, waveHeight, travelTime, exposure, rock, zone }, texels, bounds, linear) {
    const count = texels * texels, data = new Uint16Array(count * 4), shore = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        const o = i * 4;
        data[o] = toHalf(depth[i]); data[o + 1] = toHalf(shoreDistance[i]); data[o + 2] = toHalf(waveHeight[i]); data[o + 3] = toHalf(exposure[i]);
        shore[i * 2] = travelTime[i]; shore[i * 2 + 1] = rock[i] + (depth[i] > 0 ? 0 : LAND_FLAG);
    }
    const texture = new THREE.DataTexture(data, texels, texels, THREE.RGBAFormat, THREE.HalfFloatType);
    const shoreTexture = new THREE.DataTexture(shore, texels, texels, THREE.RGFormat, THREE.FloatType), filter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    Object.assign(texture, { name: 'Landscape ocean field', colorSpace: THREE.NoColorSpace, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, flipY: false, needsUpdate: true });
    Object.assign(shoreTexture, { name: 'Landscape ocean shore field', colorSpace: THREE.NoColorSpace, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: filter, magFilter: filter, generateMipmaps: false, flipY: false, needsUpdate: true });
    return {
        texture, shore: shoreTexture, bounds: lookupBounds(bounds), depth, zone, gpuBytes: data.byteLength + shore.byteLength, cpuBytes: data.byteLength + shore.byteLength + depth.byteLength + zone.byteLength, linear,
        /** @returns {Uint8Array} the rock flags packed in the shore texture */
        rock() { const flags = new Uint8Array(count); for (let i = 0; i < count; i++) flags[i] = shore[i * 2 + 1] > LAND_FLAG / 2 ? Math.round(shore[i * 2 + 1]) : Math.round(shore[i * 2 + 1] - LAND_FLAG); return flags; },
        /** @param {Float32Array} nextTravelTime @param {Float32Array} nextWaveHeight */
        writeShore(nextTravelTime, nextWaveHeight) {
            for (let i = 0; i < count; i++) { data[i * 4 + 2] = toHalf(nextWaveHeight[i]); shore[i * 2] = nextTravelTime[i]; }
            texture.needsUpdate = true;
            shoreTexture.needsUpdate = true;
        },
        dispose() { texture.dispose(); shoreTexture.dispose(); }
    };
}

/**
 * The shore exposure raster of the coast classes with the undefined texels (off the exposure zones) filled from the nearest defined shore; a
 * coast without any defined exposure is fully exposed.
 * @param {{exposure:Float32Array,statistics:{exposureTexels:number}}} coast @param {number} texels
 */
function filledExposure(coast, texels) {
    if (!coast.statistics.exposureTexels) return new Float32Array(texels * texels).fill(1);
    const values = Float32Array.from(coast.exposure, value => value < 0 ? SHORE_LAND_SENTINEL : value);
    landscapeOceanShoreFill(values, texels, SHORE_LAND_SENTINEL);
    for (let i = 0; i < values.length; i++) values[i] = Math.min(Math.max(values[i], 0), 1);
    return values;
}

/**
 * Marches the shore wave of a sea state over the extent (yielding to the frame loop), fills the land side of its travel time and counts the
 * breaking texels per coastal zone.
 * @param {{depth:Float32Array,texels:number,texelMeters:number,rock:Uint8Array,zone:Uint8Array,seaState:string,quality:string,signal?:AbortSignal,shoreDistance?:Float32Array|null}} options
 */
async function marchShore({ depth, texels, texelMeters, rock, zone, seaState, quality, signal, shoreDistance = null }) {
    const inputs = landscapeOceanShoreInputs(seaState), heightMeters = landscapeOceanSignificantWaveHeight(seaState, quality).continuousMeters;
    const result = await computeLandscapeOceanShore({ depth, texels, texelMeters, periodSeconds: inputs.periodSeconds, heightMeters, headingDegrees: inputs.headingDegrees, deepDepthMeters: inputs.deepDepthMeters, gamma: inputs.gamma, rock, crestMask: landscapeOceanCoastBeachMask(zone), shoreDistance },
        { yieldEvery: SHORE_YIELD_TEXELS, onYield: () => signal?.throwIfAborted() });
    const filledTexels = landscapeOceanShoreFill(result.travelTime, texels, SHORE_LAND_SENTINEL);
    // the land side smooths into a continuous field for the foam pass, whose supply pulse reads it at the sand texel (the breadth-first copy forms
    // Manhattan-nearest arcs; the D4 swash sheet itself reads its arrival at the nearest waterline texel along the shore distance)
    landscapeOceanShoreSmoothLand(result.travelTime, depth, texels, LANDSCAPE_OCEAN.swash.landSmoothingPasses);
    return { ...result, inputs, heightMeters, filledTexels, zoneBreaking: landscapeOceanCoastZoneBreaking(result.breaking, zone) };
}

/**
 * @param {{landscape:any,ledger:any,renderer:any,scene:any,camera:any,lighting:any,lightingTier:string,seaState?:string,quality?:string,clock?:{mode?:string,time?:number},
 *   surround?:any,signal?:AbortSignal}} options landscape is the frozen result of loadLandscapeOverview; ledger the view's ocean share (createLandscapeOceanLedger);
 *   surround an active surround handle (optional, may follow through setSurround)
 */
export async function createLandscapeOcean({ landscape, ledger, renderer, scene, camera, lighting, lightingTier, seaState = LANDSCAPE_OCEAN.defaultSeaState, quality = LANDSCAPE_OCEAN.defaultQuality, clock: clockOptions = {}, surround = null, pipeline = null, signal }) {
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
        if (Math.abs(field.layout.texelMetersX - field.layout.texelMetersZ) > 1e-6 * field.layout.texelMetersX) throw new Error('[LandscapeOcean] The shore wave needs square field texels');
        const coast = await loadLandscapeOceanCoast({ manifest, manifestUrl, layout: field.layout, signal });
        signal?.throwIfAborted();
        // the D4 swash band (the native beach chunks) loads beside the shore march; it needs the shore distance the march computes first
        const shoreDistance = landscapeOceanShoreDistance(field.depth, texels, field.layout.texelMetersX);
        const [shore, band] = await Promise.all([
            marchShore({ depth: field.depth, texels, texelMeters: field.layout.texelMetersX, rock: coast.rock, zone: coast.zone, seaState: seaStateId, quality: qualityId, signal, shoreDistance }),
            loadLandscapeOceanSwashBand({ manifest, manifestUrl, layout: field.layout, shoreDistance, signal }).catch(error => { if (error.name === 'AbortError') throw error; return { error: error.message }; })
        ]);
        signal?.throwIfAborted();
        const fieldKey = `ocean/field/${crypto.randomUUID()}`, linear = renderer.extensions.has('OES_texture_float_linear');
        const extent = createExtentTextures({ depth: field.depth, shoreDistance: shore.shoreDistance, waveHeight: shore.waveHeight, travelTime: shore.travelTime, exposure: filledExposure(coast, texels), rock: coast.rock, zone: coast.zone }, texels, field.layout.bounds, linear);
        const fieldAdmission = ledger.reserve(fieldKey, { cpuBytes: extent.cpuBytes, gpuBytes: extent.gpuBytes });
        if (!fieldAdmission.admitted) { extent.dispose(); return inert('failed', `the extent field cannot fit: ${fieldAdmission.reason}`); }
        resources.push({ dispose() { extent.dispose(); ledger.release(fieldKey); } });
        const simulation = createLandscapeOceanSimulation({ renderer, ledger, quality: qualityId, seaState: seaStateId });
        resources.push(simulation);
        simulation.initialize();
        const surface = createLandscapeOceanSurface({ renderer, scene, ledger, quality: qualityId, lighting, lightingTier, simulation, fields: { extent, surround: null }, seaLevel: manifest.coordinates.seaLevel, pipeline });
        resources.push(surface);
        surface.setShore({ omega: shore.inputs.omega, groupPeriodSeconds: shore.inputs.groupPeriodSeconds });
        surface.update(camera, clock.time);
        simulation.update(clock.time);
        // the D3 foam state reads the surface's inputs and starts pre-rolled at the clock's time
        const foam = createLandscapeOceanFoam({ renderer, ledger, uniforms: surface.uniforms, cascades: surface.cascades.length, texels: LANDSCAPE_OCEAN.foam.texels, zone: coast.zone, zoneLabels: LANDSCAPE_OCEAN_COAST.zoneLabels });
        resources.push(foam);
        foam.advance(clock.time);
        surface.setFoam(foam.texture);
        // the D4 swash sheet over the band's native beach samples (a landscape without a beach band, or a band that failed to load, leaves it off)
        let swash = null, swashState = { status: 'off', reason: null };
        if (band.error) swashState = { status: 'failed', reason: band.error };
        else if (!band.chunks.length) swashState = { status: 'off', reason: 'no beach sample inside the swash band' };
        else {
            try {
                swash = createLandscapeOceanSwash({ renderer, scene, ledger, uniforms: surface.uniforms, cascades: surface.cascades.length, lightingTier, reflection: surface.snapshot().reflection !== 'sky-harmonics', framePasses: pipeline ? LANDSCAPE_FRAME_PIPELINE.passes : 1, band, seaState: seaStateId, quality: qualityId });
                resources.push(swash);
            } catch (error) { if (error.name === 'AbortError') throw error; swashState = { status: 'failed', reason: error.message }; }
        }
        await Promise.all([surface.ready(camera, signal), swash ? swash.ready(camera, signal) : Promise.resolve()]);
        signal?.throwIfAborted();
        const coastState = { status: coast.status, reason: coast.reason, stale: coast.stale, staleChunks: coast.staleChunks, revision: coast.revision, pages: coast.pages, milliseconds: coast.milliseconds, ...coast.statistics };
        const ocean = createActiveOcean({ landscape, ledger, clock, simulation, surface, foam, swash, swashState, extent, field, coast: coastState, shore, seaState: seaStateId, quality: qualityId, loadMs: performance.now() - started, release, signal });
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
        clock: clock.snapshot(), share: { kind: LANDSCAPE_OCEAN.kind, cpuBytes: 0, gpuBytes: 0, peakCpuBytes: 0, peakGpuBytes: 0, limits: LANDSCAPE_OCEAN.budgets, denied: 0, entries: 0 }, fields: null, shore: null, foam: null, swash: null, simulation: null, surface: null, loadMs, drawnLastFrame: false });
    return Object.freeze({ status, reason, clock, update() {}, setSurround() { return Promise.resolve(null); }, setVisible() {}, setLightingTier() {}, setSeaState() { return Promise.resolve(null); }, setClock(options) { applyClock(clock, options); return clock.snapshot(); }, snapshot, dispose() {} });
}

/** @param {ReturnType<typeof createLandscapeOceanClock>} clock @param {{mode?:string,time?:number,step?:number}} options */
function applyClock(clock, { mode, time, step } = {}) {
    if (mode !== undefined) clock.setMode(mode);
    if (time !== undefined) clock.setTime(time);
    if (step !== undefined) clock.step(step);
}

/** The shore wave's record for the snapshot. @param {any} shore a marched shore @param {string} seaState */
function describeShore(shore, seaState) {
    const { inputs } = shore;
    return { status: 'active', seaState, periodSeconds: inputs.periodSeconds, heightMeters: shore.heightMeters, headingDegrees: inputs.headingDegrees, gamma: inputs.gamma, deepDepthMeters: inputs.deepDepthMeters, deepWavelengthMeters: inputs.deepWavelengthMeters,
        omega: inputs.omega, groupPeriodSeconds: inputs.groupPeriodSeconds, statistics: shore.statistics, zoneBreaking: shore.zoneBreaking, milliseconds: shore.milliseconds, filledLandTexels: shore.filledTexels };
}

function createActiveOcean({ landscape, ledger, clock, simulation, surface, foam, swash, swashState, extent, field, coast, shore, seaState, quality, loadMs, release, signal }) {
    let disposed = false, seaStateId = seaState, surroundField = null, surroundState = { status: 'none', id: null, revision: null, texels: 0, statistics: null, milliseconds: null };
    let surroundSequence = 0, surroundApplied = 0, shoreSequence = 0, shoreApplied = 0, shoreState = describeShore(shore, seaState);
    const waveHeight = () => { const hs = landscapeOceanSignificantWaveHeight(seaStateId, quality), shapes = landscapeOceanSeaStateShapes(seaStateId); return { hs, shapes }; };
    const dropSurround = () => { if (surroundField) { surroundField.dispose(); surroundField = null; } surface.setSurroundField(null); };
    return Object.freeze({
        status: 'active', reason: null, clock, ledger,
        /** One frame: advances the clock (free mode), runs the simulation batch, steps the foam state and places the rings at the clock's time. @param {{dt:number,camera:any}} frame */
        update({ dt, camera }) {
            if (disposed) return;
            clock.advance(dt);
            simulation.update(clock.time);
            foam.advance(clock.time);
            surface.setFoam(foam.texture);
            surface.update(camera, clock.time);
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
            const key = `ocean/surround-field/${crypto.randomUUID()}`, texture = createDepthTexture(loaded.depth, texels, loaded.layout.bounds);
            const admission = ledger.reserve(key, { cpuBytes: loaded.depth.byteLength, gpuBytes: texture.bytes });
            if (!admission.admitted) { texture.texture.dispose(); surroundState = { status: 'denied', id: manifest.id, revision: manifest.revision, texels: 0, statistics: null, milliseconds: loaded.milliseconds, reason: admission.reason }; return surroundState; }
            surroundField = { texture: texture.texture, bounds: texture.bounds, dispose() { texture.texture.dispose(); ledger.release(key); } };
            surface.setSurroundField(surroundField);
            surroundState = { status: 'active', id: manifest.id, revision: manifest.revision, texels, statistics: loaded.statistics, milliseconds: loaded.milliseconds, bounds: { ...loaded.layout.bounds }, texelMeters: loaded.layout.texelMetersX };
            return surroundState;
        },
        setVisible(value) { surface.setVisible(value); swash?.setVisible(value); },
        setLightingTier(tier) { surface.setLightingTier(tier); swash?.setLightingTier(tier); },
        /** Whether the swash sheet draws the wet beach (the view hands the terrain's static wetting to it). */
        get swashActive() { return !disposed && swash !== null; },
        /** Verification read-back of a cascade's textures with their statistics (LandscapeOceanSimulation.readback). @param {number} index */
        readback(index) { return simulation.readback(index); },
        /** Verification read-back of the foam state with its statistics per coastal zone (LandscapeOceanFoam.readback). */
        foamReadback() { return foam.readback(); },
        /** @param {number} mode verification view of the surface program (0 shaded) */
        setDebug(mode) { surface.setDebug(mode); swash?.setDebug(mode); },
        /**
         * Switches the sea state: the spectrum re-initializes on the next frame, the shore wave is marched again in the background and swapped in
         * once done (the snapshot settles then). Resolves with the shore record once applied (or superseded).
         * @param {string} id
         */
        async setSeaState(id) {
            seaStateId = landscapeOceanSeaState(id);
            simulation.setSeaState(seaStateId);
            swash?.setSeaState(seaStateId);
            const sequence = ++shoreSequence, state = seaStateId;
            let next;
            try { next = await marchShore({ depth: extent.depth, texels: field.layout.texels, texelMeters: field.layout.texelMetersX, rock: extent.rock(), zone: extent.zone, seaState: state, quality, signal }); }
            catch (error) { if (sequence === shoreSequence) shoreApplied = sequence; throw error; }
            if (disposed || sequence !== shoreSequence) return shoreState;
            extent.writeShore(next.travelTime, next.waveHeight);
            surface.setShore({ omega: next.inputs.omega, groupPeriodSeconds: next.inputs.groupPeriodSeconds });
            foam.reset(clock.time);
            surface.setFoam(foam.texture);
            shoreState = describeShore(next, state);
            shoreApplied = sequence;
            return shoreState;
        },
        /** @param {{mode?:string,time?:number,step?:number}} options the deterministic clock: mode free|fixed, an absolute time, an exact step */
        setClock(options) { applyClock(clock, options); return clock.snapshot(); },
        snapshot() {
            const { hs, shapes } = waveHeight(), state = LANDSCAPE_OCEAN_SEA_STATES[seaStateId], estimate = landscapeOceanResources(quality);
            // settled once no far-field binding and no shore march is in flight (a capture before either would differ from one after it)
            return { recipe: LANDSCAPE_OCEAN.id, status: disposed ? 'off' : 'active', present: !disposed, reason: null, settled: surroundApplied === surroundSequence && shoreApplied === shoreSequence,
                seaState: { id: seaStateId, label: state.label, wind: { ...state.wind }, swell: { ...state.swell }, depthMeters: state.depthMeters, significantWaveHeightMeters: hs.continuousMeters, discreteWaveHeightMeters: hs.discreteMeters,
                    perCascadeWaveHeightMeters: hs.perCascadeMeters, windPeakPeriodSeconds: 2 * Math.PI / shapes.wind.omegaPeak, choppiness: [...state.choppiness], seed: state.seed },
                quality: { id: quality, label: LANDSCAPE_OCEAN_QUALITIES[quality].label, ...LANDSCAPE_OCEAN_QUALITIES[quality] },
                clock: clock.snapshot(), landscape: { id: landscape.manifest.id, revision: landscape.manifest.revision },
                fields: { extent: { texels: field.layout.texels, texelMeters: field.layout.texelMetersX, level: field.layout.level, chunks: field.layout.chunkIds.length, statistics: field.statistics, milliseconds: field.milliseconds, gpuBytes: extent.gpuBytes, cpuBytes: extent.cpuBytes, linearFiltering: extent.linear, bounds: { ...field.layout.bounds } }, surround: surroundState },
                shore: { ...shoreState, settled: shoreApplied === shoreSequence, coast }, foam: foam.snapshot(), swash: swash ? swash.snapshot() : swashState,
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
