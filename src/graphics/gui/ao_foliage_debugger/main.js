// src/graphics/gui/ao_foliage_debugger/main.js
// Standalone AO foliage debug tool entry point.

import { AOFoliageDebuggerView } from './view/AOFoliageDebuggerView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[AOFoliageDebugger] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

document.body.classList.add('options-dock-open');

const perfBar = ensureGlobalPerfBar();

const view = new AOFoliageDebuggerView({ canvas });
view.start().then(() => {
    if (view.renderer) perfBar.setRenderer(view.renderer);
    view.onFrame = (frame) => perfBar.onFrame(frame);
    window.__aoFoliageDebugHooks = {
        version: 1,
        setAmbientOcclusion: (settings) => view.setAmbientOcclusionForTest(settings),
        getAmbientOcclusion: () => view.getAmbientOcclusionForTest(),
        getReproInfo: () => view.getReproInfoForTest()
    };
}).catch((err) => {
    console.error('[AOFoliageDebugger] Failed to start', err);
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
    window.__aoFoliageDebugHooks = null;
    viewportContextMenuBlocker?.dispose?.();
    view.destroy();
}, { passive: true });
