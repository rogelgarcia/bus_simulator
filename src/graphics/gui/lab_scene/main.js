// src/graphics/gui/lab_scene/main.js
// Standalone Lab Scene tool entry point.

import { LabSceneView } from './LabSceneView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[LabScene] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

const perfBar = ensureGlobalPerfBar();

const view = new LabSceneView({ canvas });
const started = view.start().then(() => {
    if (view.engine?.renderer) perfBar.setRenderer(view.engine.renderer);
    if (view.engine?.addFrameListener) view.engine.addFrameListener((frame) => perfBar.onFrame(frame));
    return view.waitForValidationReadiness();
}).catch((err) => {
    console.error('[LabScene] Failed to start', err);
    throw err;
});

const validationHooks = {};
Object.defineProperties(validationHooks, {
    view: { enumerable: true, get: () => view },
    engine: { enumerable: true, get: () => view.engine },
    city: { enumerable: true, get: () => view.city },
    readiness: { enumerable: true, value: started },
    applyCameraPreset: {
        enumerable: true,
        value: (presetId) => view.applyCameraPreset(presetId)
    },
    getReadiness: {
        enumerable: true,
        value: () => view.getValidationReadiness()
    }
});
window.__labSceneValidation = Object.freeze(validationHooks);

const onKeyDown = (e) => {
    if (!e) return;
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    e.preventDefault();
    window.location.assign(new URL('../index.html', window.location.href).toString());
};

window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', onKeyDown);
    viewportContextMenuBlocker?.dispose?.();
    view.destroy();
    delete window.__labSceneValidation;
}, { passive: true });
