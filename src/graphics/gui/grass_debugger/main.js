// src/graphics/gui/grass_debugger/main.js
// Standalone canonical Grass Lab entry point.

import { GrassDebuggerView } from './view/GrassDebuggerView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[GrassDebugger] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

document.body.classList.add('options-dock-open');

const perfBar = ensureGlobalPerfBar();

const view = new GrassDebuggerView({ canvas });
const CAPTURE_MODE_CLASS = 'grass-lab-capture-mode';
let captureRestore = null;
let captureFocus = { id: 'startup', pose: 'unknown', fixture: 'unknown' };
let captureMaterialVersion = 'runtime-default';

function vectorSnapshot(value) {
    return {
        x: Number(value?.x) || 0,
        y: Number(value?.y) || 0,
        z: Number(value?.z) || 0
    };
}

function getCaptureMetadata(context = null) {
    const renderer = view.renderer ?? null;
    const camera = view.camera ?? null;
    const rect = canvas.getBoundingClientRect();
    const gl = renderer?.getContext?.() ?? null;
    return {
        schema: 'grass-lab-capture-v1',
        captureMode: document.body.classList.contains(CAPTURE_MODE_CLASS),
        context: context && typeof context === 'object' ? { ...context } : null,
        focus: { ...captureFocus },
        materialVersion: view.getGrassMaterialVersion?.() ?? captureMaterialVersion,
        materialDiagnostics: view.getGrassMaterialDiagnostics?.() ?? null,
        viewport: {
            width: Math.round(window.innerWidth),
            height: Math.round(window.innerHeight),
            devicePixelRatio: Number(window.devicePixelRatio) || 1
        },
        canvas: {
            cssWidth: Math.round(rect.width),
            cssHeight: Math.round(rect.height),
            width: Math.round(canvas.width),
            height: Math.round(canvas.height),
            drawingBufferWidth: Math.round(Number(gl?.drawingBufferWidth) || 0),
            drawingBufferHeight: Math.round(Number(gl?.drawingBufferHeight) || 0),
            rendererPixelRatio: Number(renderer?.getPixelRatio?.()) || 1
        },
        camera: camera ? {
            position: vectorSnapshot(camera.position),
            target: vectorSnapshot(view.controls?.target),
            heightMeters: Number(camera.position?.y) || 0,
            fovDegrees: Number(camera.fov) || 0,
            aspect: Number(camera.aspect) || 0,
            nearMeters: Number(camera.near) || 0,
            farMeters: Number(camera.far) || 0
        } : null,
        exposure: Number(renderer?.toneMappingExposure) || 0,
        snapshot: view.getLabSnapshot()
    };
}

function exitCaptureMode() {
    if (!captureRestore) return getCaptureMetadata({ action: 'exit', restored: false });
    const renderer = view.renderer;
    const camera = view.camera;
    document.body.classList.remove(CAPTURE_MODE_CLASS);
    renderer?.setPixelRatio?.(captureRestore.pixelRatio);
    const width = Math.max(1, Math.round(canvas.clientWidth || 1));
    const height = Math.max(1, Math.round(canvas.clientHeight || 1));
    renderer?.setSize?.(width, height, false);
    if (camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
    if (view.controls) view.controls.enabled = captureRestore.controlsEnabled;
    captureRestore = null;
    return getCaptureMetadata({ action: 'exit', restored: true });
}

function enterCaptureMode(options = null) {
    const renderer = view.renderer;
    const camera = view.camera;
    if (!renderer || !camera) throw new Error('[GrassLabCapture] Renderer and camera must be ready.');
    const source = options && typeof options === 'object' ? options : {};
    const width = Math.round(Number(source.width ?? window.innerWidth));
    const height = Math.round(Number(source.height ?? window.innerHeight));
    if (!(width > 0 && height > 0)) throw new Error('[GrassLabCapture] Positive width and height are required.');
    if (width !== Math.round(window.innerWidth) || height !== Math.round(window.innerHeight)) {
        throw new Error(`[GrassLabCapture] Browser viewport must already be ${width}x${height}; received ${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}.`);
    }
    if (!captureRestore) {
        captureRestore = {
            pixelRatio: Number(renderer.getPixelRatio?.()) || 1,
            controlsEnabled: view.controls?.enabled !== false
        };
    }
    document.body.classList.add(CAPTURE_MODE_CLASS);
    if (view.controls) view.controls.enabled = false;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const metadata = getCaptureMetadata({ action: 'enter' });
    const actual = metadata.canvas;
    const exact = actual.cssWidth === width
        && actual.cssHeight === height
        && actual.width === width
        && actual.height === height
        && actual.drawingBufferWidth === width
        && actual.drawingBufferHeight === height
        && actual.rendererPixelRatio === 1
        && metadata.viewport.devicePixelRatio === 1;
    if (!exact) {
        exitCaptureMode();
        throw new Error(`[GrassLabCapture] Exact DPR1 drawing buffer unavailable: ${JSON.stringify(actual)}`);
    }
    return metadata;
}

function settleCaptureFrames(frameCount = 8) {
    const count = Math.max(1, Math.min(240, Math.round(Number(frameCount) || 8)));
    return new Promise((resolve) => {
        let remaining = count;
        const step = () => {
            remaining -= 1;
            if (remaining <= 0) resolve(getCaptureMetadata({ action: 'settled', frameCount: count }));
            else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

function activateDebuggerTab(label) {
    const expected = String(label ?? '').trim().toLowerCase();
    const button = [...document.querySelectorAll('#ui-grass-debugger .options-tab')]
        .find((candidate) => String(candidate.textContent ?? '').trim().toLowerCase() === expected);
    if (!button) throw new Error(`[GrassLabCapture] Missing debugger tab: ${label}`);
    button.click();
}

function focusValidationCamera(presetId) {
    activateDebuggerTab('Validation');
    const preset = view.applyValidationCameraPreset(presetId);
    captureFocus = {
        id: String(preset?.id ?? presetId ?? 'unknown'),
        pose: String(preset?.pose ?? 'unknown'),
        fixture: String(preset?.fixture ?? 'unknown')
    };
    return preset;
}

function focusMaterialFixture(options = null) {
    const source = options && typeof options === 'object' ? options : {};
    const grazing = source.grazing === true;
    activateDebuggerTab('Material');
    view.focusMaterialFixture({ grazing });
    captureFocus = {
        id: grazing ? 'material_fixture_grazing' : 'material_fixture',
        pose: grazing ? 'grazing' : 'oblique',
        fixture: 'material'
    };
    return getCaptureMetadata({ action: 'focusMaterialFixture' });
}

function setMaterialLighting(presetId) {
    const id = String(presetId ?? 'daylight');
    if (id === 'grazing') view.applyMaterialLightingPreset(id);
    else if (id === 'daylight' || id === 'overcast' || id === 'golden' || id === 'night') view.applyValidationLightingPreset(id);
    else throw new Error(`[GrassLabCapture] Unsupported material lighting preset: ${id}`);
    return getCaptureMetadata({ action: 'setMaterialLighting', presetId: id });
}

async function setMaterialVersion(version) {
    const id = String(version ?? '').toLowerCase();
    if (id !== 'v1' && id !== 'v2') throw new Error(`[GrassLabCapture] Unsupported material version: ${id}`);
    if (typeof view.setGrassMaterialVersion !== 'function') {
        return { supported: false, materialVersion: captureMaterialVersion };
    }
    const result = await view.setGrassMaterialVersion(id);
    captureMaterialVersion = id;
    return { supported: true, materialVersion: id, result: result ?? null };
}

view.start().then(() => {
    if (view.renderer) perfBar.setRenderer(view.renderer);
    view.onFrame = ({ dt, nowMs }) => perfBar.onFrame({ dt, nowMs });
    document.body.dataset.grassLabReady = 'true';
    window.__grassLab = Object.freeze({
        getSnapshot: () => view.getLabSnapshot(),
        focusCoverage: (targetId) => {
            view.focusCoverage(targetId);
            captureFocus = { id: String(targetId ?? 'straight'), pose: 'coverage', fixture: 'coverage' };
        },
        focusAccent: (targetId) => {
            view.focusLocalizedAccent(targetId);
            captureFocus = { id: String(targetId ?? 'tree'), pose: 'accent', fixture: 'accent' };
        },
        getAuthoringProfile: () => view.getAuthoringProfile(),
        exportAuthoringProfile: () => view.exportAuthoringProfile(),
        saveAuthoringProfile: () => view.saveAuthoringProfile(),
        captureBaseline: () => view.captureBaseline(),
        setQualityPreset: (presetId) => view.applyValidationQualityPreset(presetId),
        focusCamera: (presetId) => focusValidationCamera(presetId),
        setLighting: (presetId) => view.applyValidationLightingPreset(presetId),
        focusMaterialFixture: (options) => focusMaterialFixture(options),
        setMaterialLighting: (presetId) => setMaterialLighting(presetId),
        setMaterialVersion: (version) => setMaterialVersion(version),
        enterCaptureMode: (options) => enterCaptureMode(options),
        exitCaptureMode: () => exitCaptureMode(),
        settleCaptureFrames: (frameCount) => settleCaptureFrames(frameCount),
        getCaptureMetadata: (context) => getCaptureMetadata(context),
        startMotionPath: (pathId) => view.startValidationMotionPath(pathId),
        runStress: () => view.runValidationStress(),
        resetValidationSamples: () => view.resetValidationSamples(),
        getValidationDiagnostics: () => view.getValidationDiagnostics(),
        setRegressionResults: (results) => view.setValidationRegressionResults(results),
        createApprovalCandidate: () => view.createValidationApprovalCandidate(),
        reset: () => view.resetLab()
    });
}).catch((err) => {
    document.body.dataset.grassLabReady = 'false';
    console.error('[GrassLab] Failed to start', err);
});

const onKeyDown = (e) => {
    if (!e) return;
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    e.preventDefault();
    window.location.assign(new URL('../index.html', window.location.href).toString());
};

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', onKeyDown);
    exitCaptureMode();
    delete document.body.dataset.grassLabReady;
    delete window.__grassLab;
    viewportContextMenuBlocker?.dispose?.();
    view.destroy();
}, { passive: true });
