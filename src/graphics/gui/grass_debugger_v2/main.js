// Starts the independent v2 baseline, with game performance and camera statistics.
import * as THREE from 'three';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';
import { GrassDebugV2View } from './GrassDebugV2View.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('scene-status');
const loading = document.getElementById('scene-loading');
const perfBar = ensureGlobalPerfBar();
const contextMenu = installViewportContextMenuBlocker(document.getElementById('game-viewport'));
const busButton = document.getElementById('bus-view');
const overviewButton = document.getElementById('overview');
const grassCameraButton = document.getElementById('grass-view');
const copyButton = document.getElementById('copy-camera');
const benchmarkButton = document.getElementById('run-benchmark');
const benchmarkStatus = document.getElementById('benchmark-status');
const benchmarkResults = document.getElementById('benchmark-results');
const grassButtons = [...document.querySelectorAll('[data-grass-mode]')];
const landButtons = [...document.querySelectorAll('[data-land-surface]')];
const grassCounts = document.getElementById('grass-counts');
const cardBoundsToggle = document.getElementById('mixed-card-bounds');
const view = new GrassDebugV2View({ canvas, perfBar, onBenchmarkChange: updateBenchmarkPanel });
let copyFeedbackTimer;
busButton.disabled = overviewButton.disabled = grassCameraButton.disabled = copyButton.disabled = true;

function updateBenchmarkPanel(state) {
    busButton.disabled = overviewButton.disabled = grassCameraButton.disabled = state.active;
    for (const button of grassButtons) button.disabled = state.active;
    for (const button of landButtons) button.disabled = state.active;
    cardBoundsToggle.disabled = state.active || view.grass.mode !== 'MIXED';
    benchmarkButton.textContent = state.active ? (['running', 'holding'].includes(state.phase) ? `Stop · ${Math.floor(state.progress * 100)}%` : 'Stop') : 'Run';
    benchmarkStatus.hidden = !state.active && state.phase !== 'cancelled';
    benchmarkStatus.textContent = { warmup: 'Preparing…', running: 'Measuring…', holding: 'Measuring final stop…', settling: 'Collecting GPU results…', cancelled: `Cancelled · ${state.message}` }[state.phase] ?? '';
    benchmarkStatus.title = state.active ? '2 s warmup at Overview, fly through the bus camera, half-speed sidewalk pass, then 1 s measured at the final position. Camera controls resume when the run finishes or stops.' : state.message;
    for (const result of state.results.slice(benchmarkResults.childElementCount)) {
        const row = document.createElement('output');
        row.className = 'grass-v2-benchmark-result';
        row.tabIndex = 0;
        row.setAttribute('role', 'listitem');
        const primary = result.gpu ?? result.frame;
        const metric = result.gpu ? 'GPU' : 'Frame';
        row.textContent = `${result.grass.mode} · ${metric} ${primary.averageMs.toFixed(1)} avg · ${primary.p99Ms.toFixed(1)} p99 ms`;
        const timing = (name, stats) => stats ? `${name}: avg ${stats.averageMs.toFixed(2)} ms · P99 ${stats.p99Ms.toFixed(2)} ms (${stats.count} samples)` : `${name}: unavailable`;
        row.title = [
            result.grass ? `Grass ${result.grass.mode}: ${result.grass.leaves.toLocaleString('en-US')} leaves · ${result.grass.triangles.toLocaleString('en-US')} triangles` : '',
            result.land ? `Land: ${result.land.label}` : '',
            ...(result.grass.mode === 'MIXED' ? [`Alpha card bounds: ${result.grass.cardBoundsVisible ? 'on' : 'off'}`] : []),
            timing('GPU', result.gpu), timing('Frame interval (includes VSync)', result.frame), timing('CPU frame work', result.cpu),
            `${(result.durationMs / 1000).toFixed(2)} s measured · ${(result.flightMs / 1000).toFixed(2)} s flight + ${(result.holdMs / 1000).toFixed(2)} s final stop`,
            `${result.routeMeters.toFixed(1)} m · ${result.renderedFrames} frames · sidewalk at half speed`,
            `${result.viewport.width} × ${result.viewport.height} · DPR ${result.viewport.pixelRatio} · ${result.warmupMs / 1000} s warmup`,
            'P99: nearest rank, no hitch trimming. Timings cover the whole scene.', result.gpuNote
        ].filter(Boolean).join('\n');
        row.setAttribute('aria-label', row.title);
        benchmarkResults.append(row);
    }
}

function updateGrassPanel() {
    const grass = view.grass.getSnapshot();
    for (const button of grassButtons) button.setAttribute('aria-pressed', String(button.dataset.grassMode === grass.mode));
    const counts = lod => `${lod.leaves.toLocaleString('en-US')} leaves · ${lod.triangles.toLocaleString('en-US')} tris`;
    grassCounts.textContent = grass.mode === 'MIXED' ? Object.entries(grass.lods).map(([mode, lod]) => `${mode} · ${counts(lod)}`).join('\n') : counts(grass);
    cardBoundsToggle.checked = view.grass.mixed.cardBounds.visible;
    cardBoundsToggle.disabled = !view.ready || view.benchmark.active || grass.mode !== 'MIXED';
    grassCounts.title = [
        `${grass.patches} × 1 m² patches · ${grass.placement.rows} rows × ${grass.placement.columns} · ${grass.leavesPerPatch} source leaves/m²`,
        ...(grass.mode === 'MIXED' ? ['One line of 16 identical blades per block · 0.5 m gaps.', 'LOD0 row nearest road; LOD3 row farther out. Borders mark 1 m²; no dense-canopy shading.'] : []),
        `LOD0: four curved sections, ${grass.trianglesPerLeaf} triangles/leaf.`,
        `LOD3: each source leaf baked into one of ${grass.cardsPerPatch} cards/m².`,
        'Leaves counts source leaves represented; triangles counts only the selected grass meshes. OFF draws neither.'
    ].join('\n');
}

function updateLandPanel() {
    const land = view.content.land.getSnapshot();
    for (const button of landButtons) button.setAttribute('aria-pressed', String(button.dataset.landSurface === land.id));
}
const assetErrors = [];
const manager = THREE.DefaultLoadingManager;
const previousLoad = manager.onLoad;
const previousError = manager.onError;
const assetsLoaded = new Promise(resolve => {
    manager.onLoad = () => { previousLoad?.(); resolve(); };
});
manager.onError = url => { assetErrors.push(url); previousError?.(url); };
manager.itemStart('grass-debug-v2-startup');

const readiness = (async () => {
    try {
        await view.start();
    } finally {
        manager.itemEnd('grass-debug-v2-startup');
    }
    await assetsLoaded;
    if (assetErrors.length) throw new Error(`Could not load ${assetErrors.join(', ')}`);
    view.renderer.shadowMap.needsUpdate = true;
    view.ready = true;
    busButton.disabled = overviewButton.disabled = grassCameraButton.disabled = copyButton.disabled = false;
    benchmarkButton.disabled = false;
    for (const button of grassButtons) button.disabled = false;
    for (const button of landButtons) button.disabled = false;
    updateGrassPanel();
    updateLandPanel();
})().catch(error => {
    status.textContent = `Scene could not load: ${error.message}. Reload to retry.`;
    status.setAttribute('role', 'alert');
    status.hidden = false;
    view.destroy();
    throw error;
}).finally(() => {
    loading.hidden = true;
    manager.onLoad = previousLoad;
    manager.onError = previousError;
});
readiness.catch(error => console.error('[GrassDebugV2] Startup failed', error));

window.__grassDebugV2 = Object.freeze({
    readiness,
    getSnapshot: () => view.getSnapshot(),
    setCamera: id => view.setCamera(id),
    setGrassMode: mode => {
        const changed = view.setGrassMode(mode);
        if (changed) updateGrassPanel();
        return changed;
    },
    setLandSurface: id => {
        const changed = view.setLandSurface(id);
        if (changed) updateLandPanel();
        return changed;
    },
    setMixedCardBounds: visible => {
        const changed = view.setMixedCardBounds(visible);
        if (changed) updateGrassPanel();
        return changed;
    },
    startBenchmark: () => view.ready && view.benchmark.start(),
    cancelBenchmark: () => view.benchmark?.cancel()
});

busButton.addEventListener('click', () => view.setCamera('bus'));
overviewButton.addEventListener('click', () => view.setCamera('overview'));
grassCameraButton.addEventListener('click', () => view.setCamera('grass'));
for (const button of grassButtons) button.addEventListener('click', () => {
    if (view.setGrassMode(button.dataset.grassMode)) updateGrassPanel();
});
cardBoundsToggle.addEventListener('change', () => {
    view.setMixedCardBounds(cardBoundsToggle.checked);
    updateGrassPanel();
});
for (const button of landButtons) button.addEventListener('click', () => {
    if (view.setLandSurface(button.dataset.landSurface)) updateLandPanel();
});
benchmarkButton.addEventListener('click', () => {
    if (view.benchmark.active) view.benchmark.cancel();
    else view.benchmark.start();
});
copyButton.addEventListener('click', async () => {
    clearTimeout(copyFeedbackTimer);
    copyButton.disabled = true;
    const rotation = new THREE.Euler().setFromQuaternion(view.camera.quaternion, 'YXZ');
    const values = [
        ...view.camera.position.toArray(),
        ...[rotation.y, rotation.x, rotation.z].map(THREE.MathUtils.radToDeg)
    ];
    try {
        await navigator.clipboard.writeText(values.map(value => Number(value.toFixed(3))).join(' '));
        copyButton.textContent = 'Copied';
        copyButton.title = 'Camera position and rotation copied';
    } catch (error) {
        copyButton.textContent = 'Copy failed — retry';
        copyButton.title = `Could not copy camera: ${error.message}`;
    } finally {
        copyButton.disabled = false;
        copyFeedbackTimer = setTimeout(() => {
            copyButton.textContent = 'Copy';
            copyButton.title = 'Copy camera X Y Z and yaw pitch roll (degrees)';
        }, 2500);
    }
});
const onKeyDown = event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target?.isContentEditable) return;
    if (event.key === 'Escape') {
        if (view.benchmark?.active) view.benchmark.cancel();
        else window.location.assign('../index.html');
    }
    if (view.ready && event.key === '1') view.setCamera('bus');
    if (view.ready && event.key === '2') view.setCamera('overview');
};
window.addEventListener('keydown', onKeyDown);
window.addEventListener('beforeunload', () => {
    clearTimeout(copyFeedbackTimer);
    window.removeEventListener('keydown', onKeyDown);
    contextMenu.dispose();
    view.destroy();
    delete window.__grassDebugV2;
}, { once: true });
