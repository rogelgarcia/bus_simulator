// src/graphics/gui/terrain_debugger/main.js
// Standalone Terrain Debugger tool entry point.

import { TerrainDebuggerView } from './view/TerrainDebuggerView.js';
import { ensureGlobalPerfBar } from '../perf_bar/PerfBar.js';
import { installViewportContextMenuBlocker } from '../shared/utils/viewportContextMenuBlocker.js';

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[TerrainDebugger] Missing canvas#game-canvas');

const viewport = document.getElementById('game-viewport');
const viewportContextMenuBlocker = viewport ? installViewportContextMenuBlocker(viewport) : null;

document.body.classList.add('options-dock-open');

const perfBar = ensureGlobalPerfBar();

const view = new TerrainDebuggerView({ canvas });
view.start().then(() => {
    if (view.renderer) perfBar.setRenderer(view.renderer);
    view.onFrame = ({ dt, nowMs }) => perfBar.onFrame({ dt, nowMs });
}).catch((err) => {
    console.error('[TerrainDebugger] Failed to start', err);
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
    viewportContextMenuBlocker?.dispose?.();
    view.destroy();
}, { passive: true });
