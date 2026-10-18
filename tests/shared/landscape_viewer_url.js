// Viewer addresses of the landscape browser suites: LANDSCAPE_TEST_SURFACE_CACHE selects the AI577 D6 surface cache for a whole run.
// LANDSCAPE_TEST_SURFACE_CACHE=on|off adds landscapeSurfaceCache=<mode> to every landscape viewer address a suite opens, so each suite runs once with
// the cache on and once off; unset, addresses are unchanged (the viewer default, LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE since AI577 D7). An address that
// already selects the cache keeps its own choice. The shipped budget of a run is the uncached profile, or with the cache on the cache's own profile for
// drawing buffer (landscapeSurfaceCacheBudgets; 752/720 MiB at 1920x1080 and below since AI 599 D3 added the ecosystem share, 688/624 in AI 597 D4,
// 640/544 in AI 596 D5, 512/448 before the surround share).
// AI 597: every viewer address also fixes the animated ocean's clock (landscapeOceanTime) at LANDSCAPE_TEST_OCEAN_TIME seconds (default 30), so
// pixel comparisons across visits, modes and reloads see the same sea; LANDSCAPE_TEST_OCEAN_TIME=free leaves the clock running, and an address
// that already sets landscapeOceanTime keeps its own value. LANDSCAPE_TEST_OCEAN=animated|flat selects the drawn sea surface for a whole run
// (A/B of the animated ocean against the AI577 flat plane); unset, addresses keep the viewer default (animated).
import { LANDSCAPE_STREAMING_BUDGETS } from '../../src/app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE, landscapeSurfaceCacheBudgets, landscapeSurfaceCacheCapacity } from '../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';

const MODES = Object.freeze(['on', 'off']);
const DEFAULT_OCEAN_TIME = 30;
const MiB = 1024 * 1024;

/** The run's surface cache mode, or null when the run does not select one. */
export function landscapeTestSurfaceCache() {
    const mode = process.env.LANDSCAPE_TEST_SURFACE_CACHE;
    if (mode === undefined || mode === '') return null;
    if (!MODES.includes(mode)) throw new Error(`LANDSCAPE_TEST_SURFACE_CACHE must be one of ${MODES.join(', ')}; received ${mode}`);
    return mode;
}

/** The run's fixed ocean time in seconds, or null when the run leaves the ocean clock free (LANDSCAPE_TEST_OCEAN_TIME=free). */
export function landscapeTestOceanTime() {
    const value = process.env.LANDSCAPE_TEST_OCEAN_TIME;
    if (value === undefined || value === '') return DEFAULT_OCEAN_TIME;
    if (value === 'free') return null;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`LANDSCAPE_TEST_OCEAN_TIME must be a nonnegative number of seconds or free; received ${value}`);
    return seconds;
}

/** The run's drawn sea surface ('animated' or 'flat'), or null when the run keeps the viewer default. */
export function landscapeTestOcean() {
    const value = process.env.LANDSCAPE_TEST_OCEAN;
    if (value === undefined || value === '') return null;
    if (value !== 'animated' && value !== 'flat') throw new Error(`LANDSCAPE_TEST_OCEAN must be animated or flat; received ${value}`);
    return value;
}

/** @param {string} address a landscape viewer address (absolute, or relative to the suite's baseURL) */
export function landscapeViewerUrl(address) {
    const hash = address.indexOf('#'), fragment = hash < 0 ? '' : address.slice(hash);
    let base = hash < 0 ? address : address.slice(0, hash);
    const append = (/** @type {string} */ parameter) => { base = `${base}${base.includes('?') ? '&' : '?'}${parameter}`; };
    const mode = landscapeTestSurfaceCache();
    if (mode && !/[?&]landscapeSurfaceCache=/.test(base)) append(`landscapeSurfaceCache=${mode}`);
    const oceanTime = landscapeTestOceanTime();
    if (oceanTime !== null && !/[?&]landscapeOceanTime=/.test(base)) append(`landscapeOceanTime=${oceanTime}`);
    const ocean = landscapeTestOcean();
    if (ocean !== null && !/[?&]landscapeOcean=/.test(base)) append(`landscapeOcean=${ocean}`);
    return `${base}${fragment}`;
}

/** The surface cache mode the viewer runs with: the run's selection, or the viewer default. */
export function landscapeEffectiveSurfaceCache() { return landscapeTestSurfaceCache() ?? LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE; }

/**
 * The shipped residency budget of the run's mode, in MiB, for a display of the given drawing-buffer size (Playwright's screen is its viewport).
 * @param {{width?:number,height?:number}} [display]
 */
export function landscapeShippedBudgetMiB({ width = 1920, height = 1080 } = {}) {
    const budgets = landscapeEffectiveSurfaceCache() === 'on' ? landscapeSurfaceCacheBudgets(landscapeSurfaceCacheCapacity({ width, height })) : LANDSCAPE_STREAMING_BUDGETS;
    return { cpuMiB: budgets.cpuBytes / MiB, gpuMiB: budgets.gpuBytes / MiB };
}
