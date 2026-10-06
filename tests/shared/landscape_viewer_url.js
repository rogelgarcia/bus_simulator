// Viewer addresses of the landscape browser suites: LANDSCAPE_TEST_SURFACE_CACHE selects the AI577 D6 surface cache for a whole run.
// LANDSCAPE_TEST_SURFACE_CACHE=on|off adds landscapeSurfaceCache=<mode> to every landscape viewer address a suite opens, so each suite runs once with
// the cache on and once off; unset, addresses are unchanged (the viewer default, LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE since AI577 D7). An address that
// already selects the cache keeps its own choice. The shipped budget of a run is the uncached profile, or with the cache on the cache's own profile for
// the drawing buffer (landscapeSurfaceCacheBudgets; 512/448 MiB at 1920x1080 and below).
import { LANDSCAPE_STREAMING_BUDGETS } from '../../src/app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE, landscapeSurfaceCacheBudgets, landscapeSurfaceCacheCapacity } from '../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';

const MODES = Object.freeze(['on', 'off']);
const MiB = 1024 * 1024;

/** The run's surface cache mode, or null when the run does not select one. */
export function landscapeTestSurfaceCache() {
    const mode = process.env.LANDSCAPE_TEST_SURFACE_CACHE;
    if (mode === undefined || mode === '') return null;
    if (!MODES.includes(mode)) throw new Error(`LANDSCAPE_TEST_SURFACE_CACHE must be one of ${MODES.join(', ')}; received ${mode}`);
    return mode;
}

/** @param {string} address a landscape viewer address (absolute, or relative to the suite's baseURL) */
export function landscapeViewerUrl(address) {
    const mode = landscapeTestSurfaceCache();
    if (!mode || /[?&]landscapeSurfaceCache=/.test(address)) return address;
    const hash = address.indexOf('#'), base = hash < 0 ? address : address.slice(0, hash), fragment = hash < 0 ? '' : address.slice(hash);
    return `${base}${base.includes('?') ? '&' : '?'}landscapeSurfaceCache=${mode}${fragment}`;
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
