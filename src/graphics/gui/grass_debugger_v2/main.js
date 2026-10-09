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
const fadeSelect = document.getElementById('grass-fade');
const view = new GrassDebugV2View({ canvas, perfBar, onBenchmarkChange: updateBenchmarkPanel,
    onGrassChange: updateGrassPanel, onProgress: message => { loading.textContent = message; } });
let copyFeedbackTimer;
busButton.disabled = overviewButton.disabled = grassCameraButton.disabled = copyButton.disabled = true;

function updateBenchmarkPanel(state) {
    busButton.disabled = overviewButton.disabled = grassCameraButton.disabled = state.active;
    for (const button of grassButtons) button.disabled = state.active;
    for (const button of landButtons) button.disabled = state.active;
    fadeSelect.disabled = state.active;
    benchmarkButton.textContent = state.active ? (['running', 'holding'].includes(state.phase) ? `Stop · ${Math.floor(state.progress * 100)}%` : 'Stop') : 'Run';
    benchmarkStatus.hidden = !state.active && state.phase !== 'cancelled';
    benchmarkStatus.textContent = { warmup: 'Preparing…', running: 'Measuring…', holding: 'Measuring final stop…', settling: 'Collecting GPU results…', cancelled: `Cancelled · ${state.message}` }[state.phase] ?? '';
    benchmarkStatus.title = state.active ? '2 s warmup at Overview, bus camera, straight ahead to 10 m past the bus front, half-speed grass pass, then a smooth 4 s left turn toward the bus during the final pullback. Camera controls resume when the run finishes or stops.' : state.message;
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
            result.grass ? `Grass ${result.grass.mode}: ${result.grass.triangles.toLocaleString('en-US')} triangles at the starting camera` : '',
            result.land ? `Land: ${result.land.label}` : '',
            timing('GPU', result.gpu), timing('Frame interval (includes VSync)', result.frame), timing('CPU frame work', result.cpu),
            `${(result.durationMs / 1000).toFixed(2)} s measured · ${(result.flightMs / 1000).toFixed(2)} s flight + ${(result.holdMs / 1000).toFixed(2)} s final stop`,
            `${result.routeMeters.toFixed(1)} m · ${result.renderedFrames} frames · grass at half speed · 4 s turn toward bus`,
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
    grassCounts.textContent = `${grass.triangles.toLocaleString('en-US')} triangles\n`
        + grass.levels.map((count, level) => `L${level}: ${count}`).join(' · ');
    fadeSelect.value = grass.field.fadeStyle;
    fadeSelect.disabled = !view.ready || view.benchmark.active;
    grassCounts.title = [
        `${grass.fieldCount} fields · ${grass.placement.columns} × ${grass.placement.rows} m each · ${grass.gapMeters} m gaps · ${grass.patches} × 1 m² cells`,
        'LOD0–2: leaves · LOD3: near cards · LOD4: wide cards · LOD5: 1K canopy.',
        'Counts show dominant LOD per cell; triangles include both levels within a transition band and the grass substrate.',
        'Selection cached at 50 ms / 0.2 m. Side leaves stop at 35 m.'
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
    setFadeStyle: value => {
        const changed = view.setFadeStyle(value);
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
fadeSelect.addEventListener('change', () => {
    view.setFadeStyle(fadeSelect.value);
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
