// Starts the standalone landscape tool and exposes deterministic verification hooks.
import { LandscapeView, LANDSCAPE_MULTISCALE_MODES, LANDSCAPE_NATURAL_INFERENCE_MODES, LANDSCAPE_SURFACE_CACHE_MODES, LANDSCAPE_SURFACE_DETAIL_MODES, LANDSCAPE_TERRAIN_APPEARANCE_MODES,
    LANDSCAPE_TERRAIN_FIELD_MODES } from './LandscapeView.js';
import { LANDSCAPE_SURFACE_CACHE } from '../../engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_STREAMING_BUDGETS } from '../../../app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_MATERIAL_SAMPLING, LANDSCAPE_MATERIAL_SAMPLING_MODES } from '../../engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_LIGHTING, LANDSCAPE_LIGHTING_TIERS } from '../../engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_NATURAL_INFERENCE } from '../../engine3d/landscape/LandscapeNaturalInference.js';

const canvas = document.getElementById('game-canvas');
const parameters = new URL(location.href).searchParams;
const source = parameters.get('landscape');
const budgets = {};
for (const [parameter, key] of [['landscapeCpuMiB', 'cpuBytes'], ['landscapeGpuMiB', 'gpuBytes']]) {
    if (!parameters.has(parameter)) continue;
    const bytes = Number(parameters.get(parameter)) * 1024 * 1024;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > LANDSCAPE_STREAMING_BUDGETS[key]) throw new Error(`${parameter} must be a positive byte-exact MiB value no greater than the shipped budget`);
    budgets[key] = bytes;
}
/** @param {string} name @param {readonly string[]} modes @param {string} fallback */
function mode(name, modes, fallback) {
    const value = parameters.get(name) ?? fallback;
    if (!modes.includes(value)) throw new Error(`${name} must be one of ${modes.join(', ')}; received ${value}`);
    return value;
}
const surfaceDetail = mode('landscapeSurfaceDetail', Object.keys(LANDSCAPE_SURFACE_DETAIL_MODES), '25cm');
const materialSampling = mode('landscapeMaterialSampling', Object.keys(LANDSCAPE_MATERIAL_SAMPLING_MODES), LANDSCAPE_MATERIAL_SAMPLING.defaultMode);
const multiscale = mode('landscapeMultiscale', LANDSCAPE_MULTISCALE_MODES, 'auto');
// landscapeLighting=low|standard|high selects the compiled lighting tier; the game's own sunAzimuth, sunElevation, exposure, toneMapping and ibl* parameters apply as in the game
const lightingTier = mode('landscapeLighting', Object.keys(LANDSCAPE_LIGHTING_TIERS), LANDSCAPE_LIGHTING.defaultTier);
// landscapeNaturalInference=terrain|overview: natural display soil of planning-only cover; overview forces the former 15.625 m infill (A/B evidence)
const naturalInference = mode('landscapeNaturalInference', LANDSCAPE_NATURAL_INFERENCE_MODES, LANDSCAPE_NATURAL_INFERENCE.defaultMode);
// landscapeTerrainFields=auto|off: off never streams the terrain-field pages (terrain shadows, sky occlusion and the terrain-driven terms stay neutral)
const terrainFields = mode('landscapeTerrainFields', LANDSCAPE_TERRAIN_FIELD_MODES, 'auto');
// landscapeTerrainAppearance=on|off: the AI577 D5 terrain-driven natural appearance (A/B evidence; since AI577 D6 a compiled program variant)
const terrainAppearance = mode('landscapeTerrainAppearance', LANDSCAPE_TERRAIN_APPEARANCE_MODES, 'on');
// landscapeSurfaceCache=off|on: the AI577 D6 runtime surface cache (default off); landscapeSurfaceCacheSlots (multiple of 256) and landscapeSurfaceCacheAnisotropy
// (1, 2, 4, 8, 16) size its atlas and sampler for evidence
const surfaceCache = mode('landscapeSurfaceCache', LANDSCAPE_SURFACE_CACHE_MODES, 'off');
const surfaceCacheSlots = Number(parameters.get('landscapeSurfaceCacheSlots') ?? LANDSCAPE_SURFACE_CACHE.targetSlots);
if (!Number.isSafeInteger(surfaceCacheSlots) || surfaceCacheSlots < 256 || surfaceCacheSlots > 8192 || surfaceCacheSlots % 256) throw new Error(`landscapeSurfaceCacheSlots must be a multiple of 256 from 256 to 8192; received ${parameters.get('landscapeSurfaceCacheSlots')}`);
const surfaceCacheAnisotropy = Number(parameters.get('landscapeSurfaceCacheAnisotropy') ?? LANDSCAPE_SURFACE_CACHE.maxAnisotropy);
if (![1, 2, 4, 8, 16].includes(surfaceCacheAnisotropy)) throw new Error(`landscapeSurfaceCacheAnisotropy must be 1, 2, 4, 8 or 16; received ${parameters.get('landscapeSurfaceCacheAnisotropy')}`);
const view = new LandscapeView(canvas, { ...(source ? { source } : {}), budgets, surfaceDetail, materialSampling, multiscale, lightingTier, naturalInference, terrainFields, terrainAppearance,
    surfaceCache, surfaceCacheSlots, surfaceCacheAnisotropy });
window.__landscapeTestHooks = Object.freeze({
    snapshot: () => view.snapshot(),
    setMode: mode => view.setMode(mode),
    setCamera: options => view.setCamera(options),
    setInspection: options => view.setInspection(options),
    setWater: visible => view.setWater(visible),
    setPlanning: options => view.setPlanning(options),
    focusReference: id => view.focusReference(id),
    saveBookmark: name => view.saveBookmark(name),
    focusBookmark: id => view.focusBookmark(id),
    removeBookmark: id => view.removeBookmark(id),
    reportSelection: () => view.reportSelection(),
    appearanceSample: (x, z) => view.appearance?.sample(x, z) ?? null,
    coverageSample: (x, z, options) => view.appearance?.coverageSample(x, z, options) ?? null,
    terrainFieldsSample: (x, z, options) => view.appearance?.terrainFieldsSample(x, z, options) ?? null,
    // AI577 D5: the terrain-driven appearance inputs and the natural dressing inputs of the displayed soil (exact mirrors of the terrain shader)
    terrainAppearanceSample: (x, z, options) => view.terrainAppearanceSample(x, z, options),
    dressingSample: (x, z, options) => view.dressingSample(x, z, options),
    setTerrainAppearance: enabled => view.setTerrainAppearance(enabled),
    // AI577 D6 runtime surface cache: switch ('off' | 'on', resolves once applied) and the CPU mirror of the cached frame's page lookup
    setSurfaceCache: mode => view.setSurfaceCache(mode),
    surfaceCacheLookup: (x, z, footprint) => view.surfaceCacheLookup(x, z, footprint),
    detailSample: (x, z) => view.detailSample(x, z),
    setSurfaceWarp: enabled => view.setSurfaceWarp(enabled),
    setMaterialClumps: enabled => view.setMaterialClumps(enabled),
    setMaterialSampling: mode => view.setMaterialSampling(mode),
    setMaterialSamplingEnabled: enabled => view.setMaterialSamplingEnabled(enabled),
    setSurfaceLayers: layers => view.setSurfaceLayers(layers),
    setLighting: options => view.setLighting(options),
    setBudgets: options => view.setBudgets(options),
    beginPerformanceCapture: options => view.beginPerformanceCapture(options),
    endPerformanceCapture: () => view.endPerformanceCapture(),
    performanceMetadata: () => view.performanceMetadata(),
    acquireConsumer: (ids, options) => view.acquireConsumer(ids, options),
    releaseConsumer: consumer => view.releaseConsumer(consumer),
    preset: name => view.preset(name),
    select: (x, z) => view.select(x, z),
    setSelectionRadius: radius => view.setSelectionRadius(radius),
    reload: () => view.load(),
    // reloads with another natural display policy for planning-only cover ('terrain' or 'overview') or terrain-field mode ('auto' or 'off'); later reloads keep it
    setNaturalInference: mode => view.setNaturalInference(mode),
    setTerrainFields: mode => view.setTerrainFields(mode),
    pause: () => view.pause(),
    resume: () => view.resume(),
    dispose: () => view.dispose()
});
window.addEventListener('pagehide', () => view.dispose(), { once: true });
await view.load();
