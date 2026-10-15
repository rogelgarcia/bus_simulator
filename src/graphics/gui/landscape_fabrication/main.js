// Starts the standalone landscape tool and exposes deterministic verification hooks.
import { LandscapeView, LANDSCAPE_MULTISCALE_MODES, LANDSCAPE_NATURAL_INFERENCE_MODES, LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE, LANDSCAPE_SURFACE_CACHE_MODES, LANDSCAPE_SURFACE_DETAIL_MODES,
    LANDSCAPE_TERRAIN_APPEARANCE_MODES, LANDSCAPE_TERRAIN_FIELD_MODES, landscapeSurfaceCacheShippedBudgets } from './LandscapeView.js';
import { LANDSCAPE_SURFACE_CACHE, LANDSCAPE_SURFACE_CACHE_CAPACITY } from '../../engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_CACHE_NEAR } from '../../engine3d/landscape/LandscapeSurfaceCacheNearField.js';
import { LANDSCAPE_STREAMING_BUDGETS } from '../../../app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_MATERIAL_SAMPLING, LANDSCAPE_MATERIAL_SAMPLING_MODES } from '../../engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_LIGHTING, LANDSCAPE_LIGHTING_TIERS } from '../../engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_NATURAL_INFERENCE } from '../../engine3d/landscape/LandscapeNaturalInference.js';
import { LANDSCAPE_SURROUND, landscapeSurroundOption } from '../../engine3d/landscape/LandscapeSurroundModel.js';
import { landscapeOceanQuality, landscapeOceanSeaState, landscapeOceanSurface } from '../../engine3d/landscape/ocean/LandscapeOceanModel.js';
import { LANDSCAPE_ECOSYSTEM, landscapeEcosystemOption } from '../../engine3d/landscape/ecosystem/LandscapeEcosystemModel.js';

const canvas = document.getElementById('game-canvas');
const parameters = new URL(location.href).searchParams;
const source = parameters.get('landscape');
/** @param {string} name @param {readonly string[]} modes @param {string} fallback */
function mode(name, modes, fallback) {
    const value = parameters.get(name) ?? fallback;
    if (!modes.includes(value)) throw new Error(`${name} must be one of ${modes.join(', ')}; received ${value}`);
    return value;
}
// landscapeSurfaceCache=off|on: the AI577 D6 runtime surface cache (default LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE; on, the shipped budget is the profile of the
// display's capacity, landscapeSurfaceCacheShippedBudgets, AI577 D7); landscapeSurfaceCacheSlots (multiple of 256), landscapeSurfaceCacheWindow (64, 128, 256) and
// landscapeSurfaceCacheAnisotropy (1, 2, 4, 8, 16) fix its atlas, window and sampler for evidence (the slots and window otherwise follow the drawing buffer)
const surfaceCache = mode('landscapeSurfaceCache', LANDSCAPE_SURFACE_CACHE_MODES, LANDSCAPE_SURFACE_CACHE_DEFAULT_MODE);
const shippedBudgets = surfaceCache === 'on' ? landscapeSurfaceCacheShippedBudgets(canvas) : LANDSCAPE_STREAMING_BUDGETS;
const budgets = {};
for (const [parameter, key] of [['landscapeCpuMiB', 'cpuBytes'], ['landscapeGpuMiB', 'gpuBytes']]) {
    if (!parameters.has(parameter)) continue;
    const bytes = Number(parameters.get(parameter)) * 1024 * 1024;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > shippedBudgets[key]) throw new Error(`${parameter} must be a positive byte-exact MiB value no greater than the shipped budget`);
    budgets[key] = bytes;
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
const surfaceCacheSlots = parameters.has('landscapeSurfaceCacheSlots') ? Number(parameters.get('landscapeSurfaceCacheSlots')) : null;
if (surfaceCacheSlots !== null && (!Number.isSafeInteger(surfaceCacheSlots) || surfaceCacheSlots < 256 || surfaceCacheSlots > LANDSCAPE_SURFACE_CACHE_CAPACITY.maximumSlots || surfaceCacheSlots % 256)) {
    throw new Error(`landscapeSurfaceCacheSlots must be a multiple of 256 from 256 to ${LANDSCAPE_SURFACE_CACHE_CAPACITY.maximumSlots}; received ${parameters.get('landscapeSurfaceCacheSlots')}`);
}
const surfaceCacheWindow = parameters.has('landscapeSurfaceCacheWindow') ? Number(parameters.get('landscapeSurfaceCacheWindow')) : null;
if (surfaceCacheWindow !== null && ![64, 128, 256].includes(surfaceCacheWindow)) throw new Error(`landscapeSurfaceCacheWindow must be 64, 128 or 256; received ${parameters.get('landscapeSurfaceCacheWindow')}`);
const surfaceCacheAnisotropy = Number(parameters.get('landscapeSurfaceCacheAnisotropy') ?? LANDSCAPE_SURFACE_CACHE.maxAnisotropy);
if (![1, 2, 4, 8, 16].includes(surfaceCacheAnisotropy)) throw new Error(`landscapeSurfaceCacheAnisotropy must be 1, 2, 4, 8 or 16; received ${parameters.get('landscapeSurfaceCacheAnisotropy')}`);
// landscapeSurfaceCacheNear=on|off: per-pixel evaluation of the near field under the cache (on by default; off for A/B evidence)
const surfaceCacheNear = mode('landscapeSurfaceCacheNear', LANDSCAPE_SURFACE_CACHE_NEAR.modes, 'on');
// landscapeSurround=auto|off|<manifest url>: the AI 596 D5 render-only far-field surround (auto streams the sidecar published beside the landscape when it exists)
const surround = landscapeSurroundOption(parameters.get('landscapeSurround') ?? LANDSCAPE_SURROUND.defaultMode);
// landscapeOcean=animated|flat (AI 597): the animated spectral sea or the flat AI577 reference plane; landscapeSeaState=calm|moderate|rough and landscapeOceanQuality=low|medium|high
// select its presets; landscapeOceanTime=<seconds> fixes the simulation clock at that time (captures), otherwise it runs with the frame interval
const ocean = landscapeOceanSurface(parameters.get('landscapeOcean')), seaState = landscapeOceanSeaState(parameters.get('landscapeSeaState')), oceanQuality = landscapeOceanQuality(parameters.get('landscapeOceanQuality'));
const oceanTime = parameters.has('landscapeOceanTime') ? Number(parameters.get('landscapeOceanTime')) : null;
if (oceanTime !== null && !(Number.isFinite(oceanTime) && oceanTime >= 0)) throw new Error(`landscapeOceanTime must be a nonnegative number of seconds; received ${parameters.get('landscapeOceanTime')}`);
// landscapeEcosystem=auto|off|<recipe url> (AI 599 D4): the instanced ecosystem renderer over the development recipe (off by default until the streamer is integrated);
// landscapeEcosystemDiagnostic=none|lod|layer|rank|fade selects its inspection view
const ecosystem = landscapeEcosystemOption(parameters.get('landscapeEcosystem') ?? LANDSCAPE_ECOSYSTEM.defaultMode);
const ecosystemDiagnostic = mode('landscapeEcosystemDiagnostic', LANDSCAPE_ECOSYSTEM.diagnostics, 'none');
const view = new LandscapeView(canvas, { ...(source ? { source } : {}), budgets, surfaceDetail, materialSampling, multiscale, lightingTier, naturalInference, terrainFields, terrainAppearance,
    surfaceCache, surfaceCacheSlots, surfaceCacheWindow, surfaceCacheAnisotropy, surfaceCacheNear, surround: surround.mode === 'url' ? surround.url : surround.mode, ocean, seaState, oceanQuality, oceanTime,
    ecosystem: ecosystem.mode === 'url' ? ecosystem.url : ecosystem.mode, ecosystemDiagnostic });
window.__landscapeTestHooks = Object.freeze({
    snapshot: () => view.snapshot(),
    setMode: mode => view.setMode(mode),
    setCamera: options => view.setCamera(options),
    setInspection: options => view.setInspection(options),
    setWater: visible => view.setWater(visible),
    // AI 596 D5 render-only surround: 'auto', 'off' or a manifest URL; resolves with snapshot().surround once applied
    setSurround: mode => view.setSurround(mode),
    // AI 597 animated ocean: {surface: 'animated' | 'flat', seaState, quality, clock: {mode: 'free' | 'fixed', time, step}}; resolves with snapshot().ocean once applied
    setOcean: options => view.setOcean(options),
    // AI 597 verification: a cascade's displacement and derivative rasters with statistics (null without an active ocean)
    setOceanDebug: mode => view.ocean?.setDebug?.(mode),
    // AI 597 verification: the RGBA bytes of a region of the next rendered frame, read inside that frame (in-page use: hash or difference it there)
    readFrame: region => view.readFrame(region),
    oceanReadback: index => { const result = view.ocean?.readback?.(index) ?? null; return result ? { texels: result.texels, statistics: result.statistics } : null; },
    oceanFoamReadback: () => { const result = view.ocean?.foamReadback?.() ?? null; return result ? { texels: result.texels, statistics: result.statistics } : null; },
    // AI 599 D4 ecosystem renderer: controls {diagnostic, wind, contact, shadows, visible} (resolves with snapshot().ecosystem), the tile injection hook (the streamer's
    // role once integrated; rejects when the share denies the tile), its removal, and the drawn instance under a client position
    setEcosystem: options => view.setEcosystem(options),
    ecosystemInjectTile: tile => view.ecosystemInjectTile(tile),
    ecosystemRemoveTile: id => view.ecosystemRemoveTile(id),
    ecosystemPick: (clientX, clientY) => view.ecosystemPick(clientX, clientY),
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
    setSurfaceCacheNear: (mode, band) => view.setSurfaceCacheNear(mode, band),
    // AI577 D7: fixes the cache's slot target and window ({slots, windowPages}; null follows the drawing buffer) and rebuilds it (evidence switch)
    setSurfaceCacheCapacity: capacity => view.setSurfaceCacheCapacity(capacity),
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
    pickPoint: (clientX, clientY) => { const point = view.pickPoint(clientX, clientY); return point ? { x: point.x, y: point.y, z: point.z } : null; },
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
