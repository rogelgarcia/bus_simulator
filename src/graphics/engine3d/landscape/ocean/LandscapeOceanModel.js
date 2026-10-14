// Declares the animated ocean contract (AI 597, landscape-ocean-v1): sea-state and quality presets, the spectral cascade layout, the deterministic clock, the surface clipmap rings and the residency share.
// @ts-check
// Design. The sea surface of the landscape viewer is a presentation layer over the authoritative sea level (Y = 0 stays the water level of every
// query, pick and terrain shading): a deep-water spectral sea (JONSWAP wind sea plus a narrow swell under the TMA finite-depth factor, Mitsuyasu
// spreading, finite-depth dispersion) evolved on the GPU in band-limited cascades, drawn on a camera-snapped clipmap of rings that reaches the camera
// far plane, so the sea continues past the 4 km extent over the far-field surround to the horizon. Every parameter lives in a versioned preset
// (sea state, quality) and the simulation time is a clock the owner advances or fixes, so captures and motion comparisons repeat exactly. The flat
// AI577 reference plane remains the `flat` inspection surface. Resources reserve inside one share of the shared residency ledger (kind
// landscape-ocean), like the surround's, so the ocean can never take the authoritative streams' room. Pure module (no three.js): the spectrum
// math has its exact JavaScript mirrors in LandscapeOceanSpectrum.js; the GPU passes and the surface live in LandscapeOceanSimulation.js and
// LandscapeOceanSurface.js.
import { LANDSCAPE_CAMERA_DEPTH } from '../LandscapeCameraDepth.js';
import { createLandscapeReservedShare } from '../../../../app/landscape/LandscapeResidencyBudget.js';

const MiB = 1024 * 1024;

export const LANDSCAPE_OCEAN = Object.freeze({
    id: 'landscape-ocean-v1',
    // the one residency kind of every ocean reservation in the shared ledger
    kind: 'landscape-ocean',
    // the viewer's landscapeOcean option: animated draws the spectral sea, flat the AI577 sea-level reference plane (inspection mode)
    surfaces: Object.freeze(['animated', 'flat']),
    defaultSurface: 'animated',
    seaStates: Object.freeze(['calm', 'moderate', 'rough']),
    defaultSeaState: 'moderate',
    qualities: Object.freeze(['low', 'medium', 'high']),
    defaultQuality: 'medium',
    // free: the clock follows the frame interval (clamped); fixed: it moves only through setTime/step, so captures repeat exactly
    clock: Object.freeze({ modes: Object.freeze(['free', 'fixed']), maxStepSeconds: .1, defaultMode: 'free', defaultTime: 0 }),
    gravity: 9.80665,
    // the surface must cover the camera far plane: the outermost ring's half extent reaches LANDSCAPE_CAMERA_DEPTH.farMeters
    farMeters: LANDSCAPE_CAMERA_DEPTH.farMeters,
    // each cascade keeps the wavelengths it samples with at least this many texels, the next coarser cascade the longer ones
    texelsPerWavelength: 8,
    // ring vertices morph to the next ring's lattice over the outer part of the ring (fractions of its half extent, L-infinity distance)
    morph: Object.freeze({ start: .7, end: .95 }),
    // per-cascade depth fade (landscapeOceanCascadeFade): a cascade's spectral amplitude is full at and above wavelengthShare x its longest
    // wavelength (clamped between the min and max depths) and gone at and below zeroShare x that depth; the shore wave (AI 597 D2) carries the
    // swell cascade's energy from its fade to the shoreline, so the open sea's swell hands over once
    cascadeFade: Object.freeze({ wavelengthShare: .1, minFullMeters: .4, maxFullMeters: 18, zeroShare: .4 }),
    // AI 597 D2 shore waves (LandscapeOceanShore.js, ocean_shore.glsl): the sea state's swell period at its significant height, refracted by fast
    // marching of the finite-depth phase speed from the depth of deepDepthFactor x the deep-water wavelength (the open-sea plane wave), shoaled by
    // energy flux and broken where H exceeds gamma x depth (sand; rock surges uncapped with rockReflection of the train reflected), drawn as one
    // train under a group envelope (groupPeriods swell periods, +- groupAmplitude), a longshore variation and a Stokes crest sharpening at breaking;
    // the geology's shore exposure (exposureZones carry it, rockZones are rock) damps the train toward exposureFloor over the exposureRamp from the
    // shoreline. orbital scales the Gerstner horizontal displacement of the train
    shore: Object.freeze({ gamma: .78, deepDepthFactor: .5, groupPeriods: 7, groupAmplitude: .35, longshoreWavelengthMeters: 90, longshoreAmplitude: .25, orbital: .8, rockReflection: .4,
        sharpening: .6, exposureFloor: .4, exposureRamp: Object.freeze({ fullMeters: 60, zeroMeters: 220 }), rockZones: Object.freeze(['platform', 'bluff-toe']), exposureZones: Object.freeze(['bar', 'surf', 'swash']),
        beachZones: Object.freeze(['surf', 'swash']), sidecar: 'geology/manifest.json' }),
    // world-space envelope of the swell cascade (wave groups): 1 +- amplitude at the wavelength, in meters, so the patch never repeats exactly
    envelope: Object.freeze({ amplitude: .35, wavelengthMeters: 1500 }),
    // AI 597 D3 foam lifecycle (LandscapeOceanFoam.js, ocean_foam.frag.glsl, ocean_foam.glsl): a ping-pong state raster over the extent (RG16F:
    // water foam density, sand deposit; bytesPerTexel counts both targets) stepped at stepSeconds; a time the fixed steps cannot reach within
    // maxStepsPerFrame restarts the state from zero preRollSeconds earlier (landscapeOceanFoamSchedule), so a fixed capture time repeats exactly;
    // decay times per channel, source rates per second (breaker band, whitecaps, shoreline line, sand deposit), the residual foam's shoreward drift
    // and diffusion, the folding band (1 - Jacobian; the moderate sea's finest cascade reaches 0.64 at its rarest crests) of the whitecaps, the coverage threshold and softness against the world-space pattern
    // wavelengths (coarse to fine, the last the bubble scale) and the foam albedo
    foam: Object.freeze({ texels: 1024, bytesPerTexel: 8, stepSeconds: 1 / 30, preRollSeconds: 12, maxStepsPerFrame: 4,
        decaySeconds: Object.freeze({ water: 6, deposit: 25, whitecap: 4 }), sources: Object.freeze({ breaker: .6, whitecap: .15, shoreline: .3 }),
        driftMetersPerSecond: .3, diffusion: .15, folding: Object.freeze({ threshold: .55, span: .25 }), coverage: Object.freeze({ threshold: .22, softness: .3 }),
        patternMeters: Object.freeze([9.6, 2.4, .6, .15]), albedo: .85 }),
    // AI 597 D4 swash sheet (LandscapeOceanSwash.js, ocean_swash.*): the native beach samples within the band (shore distance from seaMeters in
    // the water to landMeters inland, heights from minHeightMeters below sea level to maxHeightMeters above) drawn as a sheet lifted liftMeters
    // over the sand; the run-up is Stockdon's R2 of the sea state's swell at the local beach slope (capped at maxSlopeDegrees), the sand dries
    // over dryingSeconds, the last cyclesRemembered waves set the wet line and the wrack line, the front foam is a band frontFoamMeters wide
    // along the beach behind the sheet's edge, the sheet carries sheetFoamShare of the shoreline's foam supply (the D3 state's sand channel)
    // thinning seaward and the backwash leaves depositShare of it dying over depositSeconds; the water sheet reflects with filmMeanSquareSlope
    // under rippleShare of the finest cascade's slopes; sandAlbedo is the representative albedo of the calibrated wet ratio; estimateBytes the
    // resources estimate
    swash: Object.freeze({ landMeters: 100, seaMeters: 6, maxHeightMeters: 2.5, minHeightMeters: 1.5, liftMeters: .03, maxSlopeDegrees: 14, dryingSeconds: 60, cyclesRemembered: 8, frontFoamMeters: 3, sheetFoamShare: .3, depositShare: .5, depositSeconds: 10, filmMeanSquareSlope: .008, rippleShare: .5, sandAlbedo: .4, landSmoothingPasses: 3, estimateBytes: 8 * MiB }),
    // AI 597 D5 light through the water (ocean_light.glsl): the local water blends the AI577 clear coastal water (LANDSCAPE_WATER_OPTICS) toward
    // the oceanic water with the still-water depth (pure-water absorption of blue and green, molecular backscatter: the deep blue offshore)
    // and toward the stirred surf water with the breaking and the foam (sand in suspension: more backscatter and absorption, the milky
    // turquoise of the surf); absorption and backscatter in m^-1, attenuation = their sum (landscapeOceanWaterType)
    water: Object.freeze({
        oceanic: Object.freeze({ absorption: Object.freeze([.32, .055, .025]), backscatter: Object.freeze([.0015, .002, .003]), depthMeters: Object.freeze([5, 20]) }),
        surf: Object.freeze({ absorption: Object.freeze([.35, .09, .09]), backscatter: Object.freeze([.012, .014, .016]), weight: .45 })
    }),
    // caustics: the contrast of the refracted sun's focusing on the seabed, fading between the two depths; crest scattering: the deep colour the
    // crests transmit toward an eye looking at the sun through them, times the crest factor
    // terrainReflection: the sea's low reflections march the extent's height raster and read the frame where they meet the terrain
    light: Object.freeze({ caustics: Object.freeze({ contrast: .5, fadeMeters: Object.freeze([6, 15]) }), crest: Object.freeze({ strength: 3.5 }), terrainReflection: true }),
    // the share of the shared ledger the view holds for its lifetime once the budget is at least the shipped profile (one standing reservation,
    // so the streams, which expand into free room within a frame, can never deny a rebuilt ocean): the spectral atlases, the per-cascade displacement and slope textures with
    // their mips, the bathymetry fields of the extent (its shore channels and travel time since D2) and the surround and the clipmap geometry
    // (medium quality 32.5 MiB GPU, high 52 MiB GPU / 36 MiB CPU); the AI 597 foam and swash state (D3, D4) reserves inside the same share.
    // LANDSCAPE_STREAMING_BUDGETS and the surface cache profile grew by exactly this share (32 / 64 MiB in D1, 48 / 64 MiB in D2, 48 / 80 MiB
    // in D4 with the swash sheet's native beach band)
    budgets: Object.freeze({ cpuBytes: 48 * MiB, gpuBytes: 80 * MiB }),
    statuses: Object.freeze(['off', 'loading', 'active', 'unavailable', 'failed']),
    // the bathymetry fields: the extent at the level-2 hierarchy spacing (4 x the native spacing: 3.906 m on coastal v3), the surround at its
    // level-1 spacing (62.5 m), both rasterized on the CPU from the saved chunks (LandscapeOceanField.js); the extent carries the shore-wave
    // channels (RGBA16F depth, shore distance, wave height, exposure; RG32F travel time, rock) and keeps its float depth raster and the coast's
    // zone labels for the sea-state recompute, the surround the depth only (RGBA16F)
    fields: Object.freeze({ extentLevel: 2, surroundLevel: 1, texels: 1024, surroundTexels: 512, extentGpuBytesPerTexel: 8 + 8, extentCpuBytesPerTexel: 8 + 8 + 4 + 1, surroundBytesPerTexel: 8 })
});

/**
 * Sea-state presets. Headings are landscape headings (degrees clockwise from north, +Z; 90 = east, +X) the waves travel toward; the coast of
 * the coastal landscapes faces west, so the open sea arrives from the west and travels east. The wind sea follows JONSWAP with a fetch, the
 * swell is a narrow JONSWAP (gamma 7) calibrated to its significant height; depthMeters is the representative depth of the TMA factor and the
 * dispersion of the open sea (the shelf floor), the shore model handles the real shoaling (D2). choppiness is the horizontal displacement scale
 * per cascade (the finest cascades sharpen more).
 */
export const LANDSCAPE_OCEAN_SEA_STATES = Object.freeze({
    calm: Object.freeze({ label: 'Calm: light breeze, low long swell', wind: Object.freeze({ speedMetersPerSecond: 3, headingDegrees: 80, fetchKilometres: 15 }),
        swell: Object.freeze({ heightMeters: .25, periodSeconds: 8, headingDegrees: 95, spread: 30 }), depthMeters: 30, gamma: 3.3, choppiness: Object.freeze([1, 1.3, 1.6, 1.8]), seed: 1 }),
    moderate: Object.freeze({ label: 'Moderate: fresh breeze over 60 km of fetch with a west swell', wind: Object.freeze({ speedMetersPerSecond: 7, headingDegrees: 85, fetchKilometres: 60 }),
        swell: Object.freeze({ heightMeters: .6, periodSeconds: 8.5, headingDegrees: 95, spread: 25 }), depthMeters: 30, gamma: 3.3, choppiness: Object.freeze([1.2, 1.6, 1.9, 2]), seed: 2 }),
    rough: Object.freeze({ label: 'Rough: strong breeze over 150 km of fetch with a long west swell', wind: Object.freeze({ speedMetersPerSecond: 12, headingDegrees: 75, fetchKilometres: 150 }),
        swell: Object.freeze({ heightMeters: 1.5, periodSeconds: 11, headingDegrees: 100, spread: 20 }), depthMeters: 30, gamma: 3.3, choppiness: Object.freeze([1.4, 1.8, 2, 2]), seed: 3 })
});

/**
 * Quality presets: the spectral texels per cascade (the FFT size), the cascade patch lengths from the swell patch to the ripple patch, the
 * clipmap ring resolution (cells per ring side, a multiple of four) and the finest cell, and whether the filtered slope variance feeds the
 * specular roughness (LEAN). low is the explicit low-cost path.
 */
export const LANDSCAPE_OCEAN_QUALITIES = Object.freeze({
    low: Object.freeze({ label: 'Low: two cascades at 128 texels, 1 m cells', texels: 128, cascadeLengths: Object.freeze([1600, 100]), ringCells: 64, baseCellMeters: 1, lean: false }),
    medium: Object.freeze({ label: 'Medium: three cascades at 256 texels, 0.5 m cells', texels: 256, cascadeLengths: Object.freeze([1600, 200, 25]), ringCells: 128, baseCellMeters: .5, lean: true }),
    high: Object.freeze({ label: 'High: four cascades at 256 texels, 0.25 m cells', texels: 256, cascadeLengths: Object.freeze([1600, 200, 25, 3.125]), ringCells: 192, baseCellMeters: .25, lean: true })
});

/** The largest cascade count a program variant compiles (the uniform arrays and samplers are sized by it). */
export const LANDSCAPE_OCEAN_MAX_CASCADES = 4;

const finite = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeOcean] ${label} must be a finite number; received ${String(value)}`);
    return value;
};

/** @param {unknown} value @returns {'animated'|'flat'} */
export function landscapeOceanSurface(value) {
    if (value === null || value === undefined || value === '') return /** @type {'animated'|'flat'} */ (LANDSCAPE_OCEAN.defaultSurface);
    if (typeof value !== 'string' || !LANDSCAPE_OCEAN.surfaces.includes(value)) throw new Error(`[LandscapeOcean] landscapeOcean must be one of ${LANDSCAPE_OCEAN.surfaces.join(', ')}; received ${String(value)}`);
    return /** @type {'animated'|'flat'} */ (value);
}

/** @param {unknown} value @returns {string} a sea-state preset id */
export function landscapeOceanSeaState(value) {
    if (value === null || value === undefined || value === '') return LANDSCAPE_OCEAN.defaultSeaState;
    if (typeof value !== 'string' || !Object.hasOwn(LANDSCAPE_OCEAN_SEA_STATES, value)) throw new Error(`[LandscapeOcean] landscapeSeaState must be one of ${LANDSCAPE_OCEAN.seaStates.join(', ')}; received ${String(value)}`);
    return value;
}

/** @param {unknown} value @returns {string} a quality preset id */
export function landscapeOceanQuality(value) {
    if (value === null || value === undefined || value === '') return LANDSCAPE_OCEAN.defaultQuality;
    if (typeof value !== 'string' || !Object.hasOwn(LANDSCAPE_OCEAN_QUALITIES, value)) throw new Error(`[LandscapeOcean] landscapeOceanQuality must be one of ${LANDSCAPE_OCEAN.qualities.join(', ')}; received ${String(value)}`);
    return value;
}

/**
 * The band-limited cascades of a quality preset: cascade c keeps the wavelengths from texelsPerWavelength of its own texels up to the same bound
 * of the next coarser cascade; the coarsest keeps everything longer, so no wavelength is simulated twice or dropped between cascades. Wavenumber
 * bounds are radians per meter (kMin exclusive, kMax inclusive; the coarsest cascade's kMin is 0).
 * @param {string} quality
 * @returns {ReadonlyArray<Readonly<{index:number,lengthMeters:number,texelMeters:number,minWavelengthMeters:number,maxWavelengthMeters:number,kMin:number,kMax:number}>>}
 */
export function landscapeOceanCascades(quality) {
    const preset = LANDSCAPE_OCEAN_QUALITIES[landscapeOceanQuality(quality)], texels = preset.texels, lengths = preset.cascadeLengths;
    if (!Number.isInteger(Math.log2(texels)) || texels < 16) throw new Error(`[LandscapeOcean] The spectral texel count must be a power of two of at least 16; received ${texels}`);
    if (!lengths.length || lengths.length > LANDSCAPE_OCEAN_MAX_CASCADES) throw new Error(`[LandscapeOcean] A quality needs 1 to ${LANDSCAPE_OCEAN_MAX_CASCADES} cascades; received ${lengths.length}`);
    for (let index = 1; index < lengths.length; index++) if (!(lengths[index] < lengths[index - 1])) throw new Error('[LandscapeOcean] Cascade lengths must decrease');
    return Object.freeze(lengths.map((lengthMeters, index) => {
        const texelMeters = lengthMeters / texels, minWavelengthMeters = LANDSCAPE_OCEAN.texelsPerWavelength * texelMeters;
        const maxWavelengthMeters = index === 0 ? Infinity : LANDSCAPE_OCEAN.texelsPerWavelength * lengths[index - 1] / texels;
        return Object.freeze({ index, lengthMeters, texelMeters, minWavelengthMeters, maxWavelengthMeters, kMin: index === 0 ? 0 : 2 * Math.PI / maxWavelengthMeters, kMax: 2 * Math.PI / minWavelengthMeters });
    }));
}

/**
 * The clipmap rings of a quality preset: ring r is a square of ringCells cells of baseCellMeters x 2^r around the camera with a hole where ring r - 1
 * lies (ring 0 has none); rings double until the outermost half extent covers the far plane.
 * @param {{cells:number,baseCellMeters:number,farMeters?:number}} options
 * @returns {ReadonlyArray<Readonly<{index:number,cellMeters:number,halfExtentMeters:number,hole:boolean}>>}
 */
export function landscapeOceanRings({ cells, baseCellMeters, farMeters = LANDSCAPE_OCEAN.farMeters }) {
    if (!Number.isInteger(cells) || cells < 8 || cells % 4 !== 0 || cells > 512) throw new Error(`[LandscapeOcean] Ring cells must be a multiple of four from 8 to 512; received ${cells}`);
    finite(baseCellMeters, 'the base cell');
    finite(farMeters, 'the far plane');
    if (!(baseCellMeters > 0 && farMeters > 0)) throw new Error('[LandscapeOcean] The base cell and the far plane must be positive');
    const rings = [];
    for (let index = 0, cellMeters = baseCellMeters; ; index++, cellMeters *= 2) {
        const halfExtentMeters = cells * cellMeters / 2;
        rings.push(Object.freeze({ index, cellMeters, halfExtentMeters, hole: index > 0 }));
        if (halfExtentMeters >= farMeters) break;
        if (index > 40) throw new Error('[LandscapeOcean] Ring layout does not converge');
    }
    return Object.freeze(rings);
}

/**
 * The half-size, in cells, of the square of a ring's grid that always lies inside its hole: ring r - 1 spans cells / 4 of this ring's cells
 * around its own origin, which snaps to this ring's cell and so sits within one cell of this ring's origin (snapped to twice the cell), so the
 * hole always contains the square of half-size cells / 4 - 1 and never more than cells / 4 + 1. A ring with a hole draws the annulus outside
 * that inner square (landscapeOceanRingIndices) and discards the fragments inside its exact hole, so nothing is drawn twice and nothing spans it
 * (until 2026-10-14 the full grid's vertices inside the hole collapsed to the nearest hole edge, and the quads across the hole's diagonals and
 * centre became triangles spanning the hole: the coarsest ring covered the sea near the camera with a flat sheet).
 * @param {number} cells
 */
export function landscapeOceanRingHoleCells(cells) {
    if (!Number.isInteger(cells) || cells < 8 || cells % 4 !== 0) throw new Error(`[LandscapeOcean] The ring cell count must be a multiple of 4 of at least 8; received ${cells}`);
    return cells / 4 - 1;
}

/**
 * The triangle list of a ring grid of cells x cells quads over (cells + 1)^2 vertices at integer indices -cells/2..cells/2 (row-major, x then z),
 * each quad split along its (i, j) -> (i + 1, j + 1) diagonal, leaving out the quads inside the square of half-size holeCells (0 keeps every quad).
 * @param {number} cells @param {number} [holeCells]
 * @returns {Readonly<{index:Uint16Array|Uint32Array,triangles:number}>}
 */
export function landscapeOceanRingIndices(cells, holeCells = 0) {
    if (!Number.isInteger(cells) || cells < 2 || cells % 2 !== 0) throw new Error(`[LandscapeOcean] The ring cell count must be a positive even integer; received ${cells}`);
    if (!Number.isInteger(holeCells) || holeCells < 0 || 2 * holeCells >= cells) throw new Error(`[LandscapeOcean] The hole must be a non-negative integer smaller than half the cells; received ${holeCells}`);
    const side = cells + 1, half = cells / 2, triangles = 2 * (cells * cells - 4 * holeCells * holeCells);
    const index = new (side * side > 65535 ? Uint32Array : Uint16Array)(triangles * 3);
    let o = 0;
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        // the quad spans indices x..x + 1 and z..z + 1; it lies inside the hole when both spans do
        const x = i - half, z = j - half;
        if (x >= -holeCells && x + 1 <= holeCells && z >= -holeCells && z + 1 <= holeCells) continue;
        const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
        index[o++] = a; index[o++] = d; index[o++] = b;
        index[o++] = a; index[o++] = c; index[o++] = d;
    }
    if (o !== index.length) throw new Error(`[LandscapeOcean] Ring index count mismatch: ${o} of ${index.length}`);
    return Object.freeze({ index, triangles });
}

/**
 * The world origin of a ring for a camera position: snapped to twice its cell, so vertex parity is stable in world space (the even vertices lie on
 * the next ring's lattice) and the ring never swims under a moving camera.
 * @param {{cellMeters:number}} ring @param {number} cameraX @param {number} cameraZ @returns {{x:number,z:number}}
 */
export function landscapeOceanRingOrigin(ring, cameraX, cameraZ) {
    const lattice = 2 * finite(ring.cellMeters, 'the ring cell');
    return { x: Math.round(finite(cameraX, 'the camera x') / lattice) * lattice, z: Math.round(finite(cameraZ, 'the camera z') / lattice) * lattice };
}

/**
 * The depth fade of a cascade's spectral amplitude: zero at and below zeroMeters, full at and above fullMeters, from LANDSCAPE_OCEAN.cascadeFade
 * of the cascade's longest wavelength (the coarsest cascade, whose band is unbounded, takes the maximum depth). The shore wave's weight is the
 * complement of cascade 0's fade.
 * @param {{maxWavelengthMeters:number}} cascade one of landscapeOceanCascades
 * @returns {Readonly<{zeroMeters:number,fullMeters:number}>}
 */
export function landscapeOceanCascadeFade(cascade) {
    if (!cascade || !(cascade.maxWavelengthMeters > 0)) throw new Error('[LandscapeOcean] A cascade with a positive longest wavelength is required');
    const { wavelengthShare, minFullMeters, maxFullMeters, zeroShare } = LANDSCAPE_OCEAN.cascadeFade;
    const fullMeters = Math.min(Math.max(cascade.maxWavelengthMeters * wavelengthShare, minFullMeters), maxFullMeters);
    return Object.freeze({ zeroMeters: fullMeters * zeroShare, fullMeters });
}

/**
 * The shore-wave inputs of a sea state (the train's period, heading and breaking index, the depth where the march starts) and its drawing
 * constants; the significant height the train carries is the sea state's (the owner adds it from the spectrum).
 * @param {string} seaState
 */
export function landscapeOceanShoreInputs(seaState) {
    const state = LANDSCAPE_OCEAN_SEA_STATES[landscapeOceanSeaState(seaState)], shore = LANDSCAPE_OCEAN.shore;
    const periodSeconds = state.swell.periodSeconds, deepWavelengthMeters = LANDSCAPE_OCEAN.gravity * periodSeconds * periodSeconds / (2 * Math.PI);
    return Object.freeze({ periodSeconds, headingDegrees: state.swell.headingDegrees, gamma: shore.gamma, deepWavelengthMeters, deepDepthMeters: shore.deepDepthFactor * deepWavelengthMeters,
        omega: 2 * Math.PI / periodSeconds, groupPeriodSeconds: shore.groupPeriods * periodSeconds });
}

/**
 * The fixed steps that bring the foam state from its last time to a time: incremental steps on the fixed grid (the carried remainder keeps the
 * grid exact) when the time lies at most maxStepsPerFrame steps ahead, else a restart from zero preRollSeconds before the time (no last time,
 * a time before the last one, a jump or a long frame), so the state at a fixed time is the same function of that time on every run.
 * @param {{time:number,lastTime:number|null,remainder?:number}} state
 * @returns {Readonly<{reset:boolean,steps:number,startTime:number,remainder:number}>} steps run at startTime + k x stepSeconds for k = 1..steps
 */
/**
 * The attenuation and backscatter of one of the D5 water types (the JavaScript mirror of ocean_light.glsl's types).
 * @param {'oceanic'|'surf'} type @returns {{attenuation:number[], backscatter:number[]}}
 */
export function landscapeOceanWaterType(type) {
    const water = LANDSCAPE_OCEAN.water[type];
    if (!water) throw new Error(`[LandscapeOcean] Unknown water type ${String(type)}`);
    return { attenuation: water.absorption.map((value, channel) => value + water.backscatter[channel]), backscatter: [...water.backscatter] };
}

export function landscapeOceanFoamSchedule({ time, lastTime, remainder = 0 }) {
    const { stepSeconds, preRollSeconds, maxStepsPerFrame } = LANDSCAPE_OCEAN.foam;
    finite(time, 'the foam time');
    if (lastTime !== null) {
        finite(lastTime, 'the last foam time');
        if (time >= lastTime) {
            const elapsed = time - lastTime + remainder, steps = Math.floor(elapsed / stepSeconds + 1e-9);
            if (steps <= maxStepsPerFrame) return Object.freeze({ reset: false, steps, startTime: lastTime - remainder, remainder: elapsed - steps * stepSeconds });
        }
    }
    const steps = Math.round(preRollSeconds / stepSeconds);
    return Object.freeze({ reset: true, steps, startTime: time - steps * stepSeconds, remainder: 0 });
}

/**
 * Conservative byte estimate of the ocean's resources for a quality preset: the spectral atlases (h0 and the two FFT ping-pong textures, RGBA32F,
 * cascades x texels^2), the butterfly table, the per-cascade displacement and slope textures (RGBA16F with mips), the bathymetry fields (the extent
 * as the RGBA16F shore channels and the RG32F travel time with its float depth raster, the surround as RGBA16F depth; the CPU rasters are the
 * texture data), the clipmap geometries (the full grid and the annulus, position attribute and index each), the D3 foam state (RG16F ping-pong over the extent) and the D4 swash sheet's band (a conservative estimate).
 * @param {string} quality @param {{extentTexels?:number,surroundTexels?:number}} [fields]
 * @returns {Readonly<{cpuBytes:number,gpuBytes:number,parts:Readonly<Record<string,Readonly<{cpuBytes:number,gpuBytes:number}>>>}>}
 */
export function landscapeOceanResources(quality, { extentTexels = LANDSCAPE_OCEAN.fields.texels, surroundTexels = LANDSCAPE_OCEAN.fields.surroundTexels } = {}) {
    const preset = LANDSCAPE_OCEAN_QUALITIES[landscapeOceanQuality(quality)], cascades = preset.cascadeLengths.length, texels = preset.texels, stages = Math.log2(texels);
    const atlasBytes = cascades * texels * texels * 16, mipped = Math.ceil(texels * texels * 8 * 4 / 3);
    const rings = landscapeOceanRings({ cells: preset.ringCells, baseCellMeters: preset.baseCellMeters });
    // the full grid of ring 0 and the annulus of the other rings: a position attribute each and their index lists (4 bytes per index)
    const vertices = (preset.ringCells + 1) ** 2, hole = landscapeOceanRingHoleCells(preset.ringCells);
    const geometryBytes = 2 * vertices * 12 + (2 * preset.ringCells * preset.ringCells - 4 * hole * hole) * 6 * 4;
    const parts = Object.freeze({
        spectra: Object.freeze({ cpuBytes: 0, gpuBytes: 3 * atlasBytes + stages * texels * 16 }),
        cascades: Object.freeze({ cpuBytes: 0, gpuBytes: cascades * 2 * mipped }),
        fields: Object.freeze({ cpuBytes: extentTexels * extentTexels * LANDSCAPE_OCEAN.fields.extentCpuBytesPerTexel + surroundTexels * surroundTexels * 4, gpuBytes: extentTexels * extentTexels * LANDSCAPE_OCEAN.fields.extentGpuBytesPerTexel + surroundTexels * surroundTexels * LANDSCAPE_OCEAN.fields.surroundBytesPerTexel }),
        geometry: Object.freeze({ cpuBytes: geometryBytes, gpuBytes: geometryBytes }),
        foam: Object.freeze({ cpuBytes: 0, gpuBytes: LANDSCAPE_OCEAN.foam.texels * LANDSCAPE_OCEAN.foam.texels * LANDSCAPE_OCEAN.foam.bytesPerTexel }),
        swash: Object.freeze({ cpuBytes: LANDSCAPE_OCEAN.swash.estimateBytes, gpuBytes: LANDSCAPE_OCEAN.swash.estimateBytes })
    });
    const total = Object.values(parts).reduce((sum, part) => ({ cpuBytes: sum.cpuBytes + part.cpuBytes, gpuBytes: sum.gpuBytes + part.gpuBytes }), { cpuBytes: 0, gpuBytes: 0 });
    return Object.freeze({ ...total, parts });
}

/**
 * The deterministic simulation clock. free mode advances by the frame interval (clamped to maxStepSeconds, never backwards); fixed mode moves only
 * through setTime and step, so a capture at a given time is reproducible whatever the frame rate.
 * @param {{mode?:string,time?:number}} [options]
 */
export function createLandscapeOceanClock({ mode = LANDSCAPE_OCEAN.clock.defaultMode, time = LANDSCAPE_OCEAN.clock.defaultTime } = {}) {
    const requireMode = value => {
        if (!LANDSCAPE_OCEAN.clock.modes.includes(value)) throw new Error(`[LandscapeOcean] The clock mode must be one of ${LANDSCAPE_OCEAN.clock.modes.join(', ')}; received ${String(value)}`);
        return value;
    };
    const requireTime = value => {
        finite(value, 'the simulation time');
        if (value < 0) throw new Error(`[LandscapeOcean] The simulation time must not be negative; received ${value}`);
        return value;
    };
    let current = requireMode(mode), seconds = requireTime(time), frame = 0;
    return Object.freeze({
        get mode() { return current; },
        get time() { return seconds; },
        get frame() { return frame; },
        /** @param {number} dt frame interval in seconds; ignored in fixed mode */
        advance(dt) {
            finite(dt, 'the frame interval');
            frame++;
            if (current === 'fixed') return seconds;
            seconds += Math.min(Math.max(dt, 0), LANDSCAPE_OCEAN.clock.maxStepSeconds);
            return seconds;
        },
        /** @param {number} dt exact step in seconds, any mode */
        step(dt) { seconds += requireTime(dt); return seconds; },
        setTime(value) { seconds = requireTime(value); return seconds; },
        setMode(value) { current = requireMode(value); return current; },
        snapshot() { return { mode: current, time: seconds, frame, maxStepSeconds: LANDSCAPE_OCEAN.clock.maxStepSeconds }; }
    });
}

/**
 * The ocean's share of the shared residency ledger (kind landscape-ocean), reserved whole in the shared budget as one entry while it exists; the
 * ocean's own reservations are accounted inside it and denied beyond its limits. Throws when the shared budget cannot hold the share.
 * @param {any} shared the view's LandscapeResidencyBudget @param {{cpuBytes:number,gpuBytes:number}} [limits]
 */
export function createLandscapeOceanLedger(shared, limits = LANDSCAPE_OCEAN.budgets) {
    return createLandscapeReservedShare(shared, { kind: LANDSCAPE_OCEAN.kind, limits, label: 'LandscapeOcean' });
}
