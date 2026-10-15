// Declares the runtime contract of the instanced ecosystem renderer (AI 599 D4): its residency share, viewer option, LOD bands with cross-fades, impostor view selection and the dither matrix.
// @ts-check
// Design: everything the shaders decide per vertex or fragment has its exact JavaScript mirror here (band fades, impostor view index, dither
// threshold), so tests verify the GPU logic without a browser and the renderer's CPU culling agrees with what the vertex program draws. The
// module imports nothing graphical: the share wraps the view's residency budget (createLandscapeReservedShare, one standing reservation like
// the ocean's), the option parser mirrors the surround's, the impostor layout is the distant vegetation catalog's (8 azimuths from -72 degrees
// in 45 degree steps at elevations -8 and 15, tiles 0-15 in that order) and the dither matrix is the 8x8 Bayer permutation the fragment program
// compiles as a constant array.
import { createLandscapeReservedShare } from '../../../../app/landscape/LandscapeResidencyBudget.js';

const MiB = 1024 * 1024;

export const LANDSCAPE_ECOSYSTEM = Object.freeze({
    id: 'landscape-ecosystem-runtime-v1',
    // the one residency kind of every ecosystem reservation in the shared ledger (assets, tiles)
    kind: 'landscape-ecosystem',
    // the share of the shared ledger the view holds for its lifetime while the ecosystem is on (phase B: the development recipe's assets and the injected tiles)
    budgets: Object.freeze({ cpuBytes: 64 * MiB, gpuBytes: 96 * MiB }),
    // the viewer's landscapeEcosystem option: auto draws the development recipe (the D3 streamer's sidecar once integrated), off never creates the renderer,
    // any other value is a recipe URL (phase B; the integrator switches the default to auto)
    modes: Object.freeze(['auto', 'off', 'url']),
    defaultMode: 'off',
    developmentRecipe: '/tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json',
    diagnostics: Object.freeze(['none', 'lod', 'layer', 'rank', 'fade']),
    statuses: Object.freeze(['off', 'loading', 'active', 'failed', 'unavailable']),
    // a (tile, LOD) draw that became visible stays visible until the tile's distance range leaves the band grown by this factor
    lodHysteresis: 1.1,
    // the distant vegetation catalog's impostor layout: azimuth tiles then elevation rows, 16 views per variant
    impostor: Object.freeze({ views: 16, azimuths: 8, azimuthStartDegrees: -72, azimuthStepDegrees: 45, elevationsDegrees: Object.freeze([-8, 15]) }),
    dither: Object.freeze({ size: 8 }),
    // vertex sway hook (strength 0 = no motion) and the ground-contact darkening of the lowest metres (bounded to half the instance height)
    wind: Object.freeze({ directionX: 1, directionZ: 0, strength: 0, frequencyHertz: .35 }),
    contact: Object.freeze({ strength: .3, heightMeters: .5 }),
    // display colours of the diagnostic views by LOD band index and by layer priority order
    lodColors: Object.freeze([[.9, .2, .2], [.2, .85, .25], [.2, .4, .95], [.95, .85, .2], [.9, .3, .9], [.25, .9, .9], [.95, .55, .15], [.6, .6, .6]]),
    layerColors: Object.freeze([[.95, .45, .15], [.3, .8, .35], [.35, .55, .95], [.9, .8, .25], [.85, .35, .85], [.3, .85, .85], [.75, .5, .3], [.6, .65, .7]]),
    compileWaitMs: 90000
});

const finite = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeEcosystem] ${label} must be a finite number; received ${String(value)}`);
    return value;
};

/**
 * The ecosystem's share of the shared residency ledger (kind landscape-ecosystem), reserved whole in the shared budget as one entry while it exists;
 * the renderer's own reservations (asset sets, tiles) are accounted inside it and denied beyond its limits. Throws when the shared budget cannot hold it.
 * @param {any} shared the view's LandscapeResidencyBudget @param {{cpuBytes:number,gpuBytes:number}} [limits]
 */
export function createLandscapeEcosystemLedger(shared, limits = LANDSCAPE_ECOSYSTEM.budgets) {
    return createLandscapeReservedShare(shared, { kind: LANDSCAPE_ECOSYSTEM.kind, limits, label: 'LandscapeEcosystem' });
}

/**
 * Resolves the viewer's landscapeEcosystem option: 'auto', 'off' (the default while the streamer is not integrated) or a recipe URL.
 * @param {string|null|undefined} value @returns {Readonly<{mode:'auto'|'off'|'url',url:string|null}>}
 */
export function landscapeEcosystemOption(value) {
    if (value === null || value === undefined || value === '') return Object.freeze({ mode: /** @type {'auto'|'off'} */ (LANDSCAPE_ECOSYSTEM.defaultMode), url: null });
    if (typeof value !== 'string') throw new Error('[LandscapeEcosystem] landscapeEcosystem must be auto, off or a recipe URL');
    if (value === 'auto' || value === 'off') return Object.freeze({ mode: value, url: null });
    if (!/\.json$/.test(value) || /\s/.test(value)) throw new Error(`[LandscapeEcosystem] landscapeEcosystem must be auto, off or a recipe URL ending in .json; received ${value}`);
    return Object.freeze({ mode: 'url', url: value });
}

/** @param {string} name @returns {number} the uniform value of a diagnostic view name */
export function landscapeEcosystemDiagnostic(name) {
    const index = LANDSCAPE_ECOSYSTEM.diagnostics.indexOf(name);
    if (index < 0) throw new Error(`[LandscapeEcosystem] The diagnostic must be one of ${LANDSCAPE_ECOSYSTEM.diagnostics.join(', ')}; received ${String(name)}`);
    return index;
}

/**
 * The LOD bands of a validated layer: band k draws level lods[k].level from the previous distance to its own, cross-fading over fadeMeters centred
 * on each inner boundary (fadeIn [near - f/2, near + f/2], fadeOut [far - f/2, far + f/2]); the first band never fades in and the last fades out
 * entirely inside the view distance ([far - f, far]), so nothing draws beyond it. The fragment program discards by the product of the two ramps.
 * @param {{lods:ReadonlyArray<{level:number,distanceMeters:number}>,fadeMeters:number,viewDistanceMeters:number}} layer
 * @returns {ReadonlyArray<Readonly<{index:number,level:number,near:number,far:number,fadeIn:readonly [number, number],fadeOut:readonly [number, number]}>>}
 */
export function ecosystemLodBands(layer) {
    const fade = finite(layer?.fadeMeters, 'the layer fadeMeters'), lods = layer?.lods;
    if (!Array.isArray(lods) || !lods.length) throw new Error('[LandscapeEcosystem] A layer needs at least one LOD');
    const last = lods.length - 1;
    return Object.freeze(lods.map((lod, index) => {
        const near = index === 0 ? 0 : lods[index - 1].distanceMeters, far = finite(lod.distanceMeters, `lods[${index}].distanceMeters`);
        const fadeIn = index === 0 ? [-1, 0] : [near - fade / 2, near + fade / 2], fadeOut = index === last ? [far - fade, far] : [far - fade / 2, far + fade / 2];
        return Object.freeze({ index, level: lod.level, near, far, fadeIn: Object.freeze([fadeIn[0], fadeIn[1]]), fadeOut: Object.freeze([fadeOut[0], fadeOut[1]]) });
    }));
}

const ramp = (value, start, end) => Math.min(1, Math.max(0, (value - start) / Math.max(end - start, 1e-6)));

/**
 * The JavaScript mirror of the vertex program's band fade: fadeIn ramp times fadeOut ramp at a camera distance (1 inside the band, 0 outside).
 * @param {number} distance @param {{fadeIn:readonly [number, number],fadeOut:readonly [number, number]}} band
 */
export function ecosystemInstanceFade(distance, band) {
    finite(distance, 'the instance distance');
    return ramp(distance, band.fadeIn[0], band.fadeIn[1]) * ramp(band.fadeOut[1] - distance, 0, band.fadeOut[1] - band.fadeOut[0]);
}

/**
 * The impostor view of a camera direction in the instance frame (azimuth counter-clockwise from +X toward -Z, elevation above the horizon, degrees):
 * the nearest azimuth tile (round, wrapping) in the nearest elevation row, index row * 8 + tile. It equals selectDistantView of the distant
 * billboard updater because that score separates into an azimuth and an elevation term.
 * @param {number} azimuthDegrees @param {number} elevationDegrees @returns {number} 0..15
 */
export function ecosystemImpostorView(azimuthDegrees, elevationDegrees) {
    const layout = LANDSCAPE_ECOSYSTEM.impostor;
    finite(azimuthDegrees, 'the impostor azimuth'); finite(elevationDegrees, 'the impostor elevation');
    const turn = Math.floor((azimuthDegrees - layout.azimuthStartDegrees) / layout.azimuthStepDegrees + .5), tile = ((turn % layout.azimuths) + layout.azimuths) % layout.azimuths;
    let row = 0, best = Infinity;
    layout.elevationsDegrees.forEach((elevation, index) => { const score = Math.abs(elevation - elevationDegrees); if (score < best) { best = score; row = index; } });
    return row * layout.azimuths + tile;
}

/** The azimuth and elevation of an impostor view index (the catalog's record order). @param {number} index 0..15 */
export function ecosystemImpostorAngles(index) {
    const layout = LANDSCAPE_ECOSYSTEM.impostor;
    if (!Number.isInteger(index) || index < 0 || index >= layout.views) throw new Error(`[LandscapeEcosystem] The impostor view index must be 0..${layout.views - 1}; received ${index}`);
    return { azimuthDegrees: layout.azimuthStartDegrees + (index % layout.azimuths) * layout.azimuthStepDegrees, elevationDegrees: layout.elevationsDegrees[Math.floor(index / layout.azimuths)] };
}

function bayer(size) {
    let matrix = [[0]];
    for (let n = 1; n < size; n *= 2) {
        const next = [];
        for (let y = 0; y < 2 * n; y++) {
            next.push([]);
            for (let x = 0; x < 2 * n; x++) next[y].push(4 * matrix[y % n][x % n] + (y < n ? (x < n ? 0 : 2) : (x < n ? 3 : 1)));
        }
        matrix = next;
    }
    return matrix.flat();
}

/** The 8x8 Bayer dither matrix, row-major (row y, column x), a permutation of 0..63 shared with the fragment program. */
export const ECOSYSTEM_DITHER_MATRIX = Object.freeze(bayer(LANDSCAPE_ECOSYSTEM.dither.size));

/** The GLSL initializer list of the dither matrix (float literals). */
export function ecosystemDitherDefine() { return ECOSYSTEM_DITHER_MATRIX.map(value => `${value}.0`).join(', '); }

/**
 * The fragment program's discard threshold at a pixel for an instance phase: the Bayer cell's centre in [0, 1) shifted by the phase (the instance
 * rank), so neighbouring instances dither out of step. A fragment draws while its fade reaches the threshold.
 * @param {number} pixelX @param {number} pixelY @param {number} phase
 */
export function ecosystemDitherThreshold(pixelX, pixelY, phase) {
    const size = LANDSCAPE_ECOSYSTEM.dither.size, x = ((Math.floor(pixelX) % size) + size) % size, y = ((Math.floor(pixelY) % size) + size) % size;
    const value = (ECOSYSTEM_DITHER_MATRIX[y * size + x] + .5) / (size * size) + finite(phase, 'the dither phase');
    return value - Math.floor(value);
}

/**
 * The bounding sphere of a tile's draw: the cell box over its height range, grown by what an instance may add above or around its anchor (the
 * asset height and twice its footprint at the largest scale).
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {readonly number[]} heightRange @param {number} assetHeight @param {number} footprintRadius @param {number} maxScale
 * @returns {{x:number,y:number,z:number,radius:number}}
 */
export function ecosystemTileSphere(bounds, heightRange, assetHeight, footprintRadius, maxScale) {
    const [minY, maxY] = heightRange, reach = Math.max(finite(assetHeight, 'the asset height'), 2 * finite(footprintRadius, 'the footprint radius')) * finite(maxScale, 'the largest scale');
    const x = (bounds.minX + bounds.maxX) / 2, y = (minY + maxY) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
    return { x, y, z, radius: Math.hypot(bounds.maxX - x, maxY - y, bounds.maxZ - z) + reach };
}

/**
 * The nearest and farthest distance from a point to a box grown by a margin (the camera's distance range to a tile's instances).
 * @param {{x:number,y:number,z:number}} point @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {readonly number[]} heightRange @param {number} margin
 */
export function ecosystemBoxDistanceRange(point, bounds, heightRange, margin) {
    const low = [bounds.minX - margin, heightRange[0] - margin, bounds.minZ - margin], high = [bounds.maxX + margin, heightRange[1] + margin, bounds.maxZ + margin], at = [point.x, point.y, point.z];
    let near = 0, far = 0;
    for (let axis = 0; axis < 3; axis++) {
        const outside = Math.max(low[axis] - at[axis], 0, at[axis] - high[axis]), farthest = Math.max(at[axis] - low[axis], high[axis] - at[axis]);
        near += outside * outside; far += farthest * farthest;
    }
    return { near: Math.sqrt(near), far: Math.sqrt(far) };
}

/**
 * Whether a (tile, band) draw is visible for a tile's distance range: a hidden draw shows once the range meets the band's non-zero fade span,
 * a visible one hides only once the range leaves that span grown by the hysteresis factor.
 * @param {{near:number,far:number}} range @param {{fadeIn:readonly [number, number],fadeOut:readonly [number, number]}} band @param {boolean} visible
 */
export function ecosystemBandVisible(range, band, visible) {
    const start = Math.max(0, band.fadeIn[0]), end = band.fadeOut[1], grow = visible ? LANDSCAPE_ECOSYSTEM.lodHysteresis : 1;
    return range.near <= end * grow && range.far >= start / grow;
}

/** The display colour of a LOD band index or a layer order index in the diagnostic views. @param {'lod'|'layer'} kind @param {number} index */
export function ecosystemDiagnosticColor(kind, index) {
    const palette = kind === 'lod' ? LANDSCAPE_ECOSYSTEM.lodColors : LANDSCAPE_ECOSYSTEM.layerColors;
    if (!Number.isInteger(index) || index < 0) throw new Error(`[LandscapeEcosystem] A diagnostic colour index must be a nonnegative integer; received ${index}`);
    return palette[index % palette.length];
}
