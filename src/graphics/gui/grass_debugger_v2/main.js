// Starts the independent v2 baseline, with game performance and camera statistics.
import * as THREE from 'three';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';
import { GrassDebugV2View } from './GrassDebugV2View.js';

const canvas = document.getElementById('game-canvas');
const status = document.getElementById('scene-status');
const perfBar = ensureGlobalPerfBar();
const contextMenu = installViewportContextMenuBlocker(document.getElementById('game-viewport'));
const view = new GrassDebugV2View({ canvas, perfBar });
const busButton = document.getElementById('bus-view');
const overviewButton = document.getElementById('overview');
const copyButton = document.getElementById('copy-camera');
let copyFeedbackTimer;
busButton.disabled = overviewButton.disabled = copyButton.disabled = true;
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
    busButton.disabled = overviewButton.disabled = copyButton.disabled = false;
})().catch(error => {
    status.textContent = `Scene could not load: ${error.message}. Reload to retry.`;
    status.setAttribute('role', 'alert');
    status.hidden = false;
    view.destroy();
    throw error;
}).finally(() => {
    manager.onLoad = previousLoad;
    manager.onError = previousError;
});
readiness.catch(error => console.error('[GrassDebugV2] Startup failed', error));

window.__grassDebugV2 = Object.freeze({
    readiness,
    getSnapshot: () => view.getSnapshot(),
    setCamera: id => view.setCamera(id)
});

busButton.addEventListener('click', () => view.setCamera('bus'));
overviewButton.addEventListener('click', () => view.setCamera('overview'));
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
    if (event.key === 'Escape') window.location.assign('../index.html');
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
