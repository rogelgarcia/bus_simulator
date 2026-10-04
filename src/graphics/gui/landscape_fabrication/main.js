// Starts the standalone landscape tool and exposes deterministic verification hooks.
import { LandscapeView, LANDSCAPE_MULTISCALE_MODES, LANDSCAPE_SURFACE_DETAIL_MODES } from './LandscapeView.js';
import { LANDSCAPE_STREAMING_BUDGETS } from '../../../app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_MATERIAL_SAMPLING, LANDSCAPE_MATERIAL_SAMPLING_MODES } from '../../engine3d/landscape/LandscapeMaterialSampling.js';

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
const surfaceDetail = parameters.get('landscapeSurfaceDetail') ?? '25cm';
if (!Object.hasOwn(LANDSCAPE_SURFACE_DETAIL_MODES, surfaceDetail)) throw new Error(`landscapeSurfaceDetail must be one of ${Object.keys(LANDSCAPE_SURFACE_DETAIL_MODES).join(', ')}; received ${surfaceDetail}`);
const materialSampling = parameters.get('landscapeMaterialSampling') ?? LANDSCAPE_MATERIAL_SAMPLING.defaultMode;
if (!Object.hasOwn(LANDSCAPE_MATERIAL_SAMPLING_MODES, materialSampling)) throw new Error(`landscapeMaterialSampling must be one of ${Object.keys(LANDSCAPE_MATERIAL_SAMPLING_MODES).join(', ')}; received ${materialSampling}`);
const multiscale = parameters.get('landscapeMultiscale') ?? 'auto';
if (!LANDSCAPE_MULTISCALE_MODES.includes(multiscale)) throw new Error(`landscapeMultiscale must be one of ${LANDSCAPE_MULTISCALE_MODES.join(', ')}; received ${multiscale}`);
const view = new LandscapeView(canvas, { ...(source ? { source } : {}), budgets, surfaceDetail, materialSampling, multiscale });
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
    detailSample: (x, z) => view.detailSample(x, z),
    setSurfaceWarp: enabled => view.setSurfaceWarp(enabled),
    setMaterialClumps: enabled => view.setMaterialClumps(enabled),
    setMaterialSampling: mode => view.setMaterialSampling(mode),
    setMaterialSamplingEnabled: enabled => view.setMaterialSamplingEnabled(enabled),
    setSurfaceLayers: layers => view.setSurfaceLayers(layers),
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
    pause: () => view.pause(),
    resume: () => view.resume(),
    dispose: () => view.dispose()
});
window.addEventListener('pagehide', () => view.dispose(), { once: true });
await view.load();
